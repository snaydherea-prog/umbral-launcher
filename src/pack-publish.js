'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {makeBundle, validateManifest, allowedPath, httpsUrl, hashFile} = require('./pack-files');
const {location, readDraft, saveDraft, summary} = require('./pack-import');
const OWNER = 'snaydherea-prog', REPOSITORY = 'umbral-launcher', OWNER_ID = 322669037;
const REPO = OWNER + '/' + REPOSITORY;
const PREFIX = '/repos/' + REPO;
function publicationFields(fields) {
  const f = {...fields};
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(f.packId || '')) throw Error('Usa un identificador con letras minúsculas, números y guiones.');
  if (typeof f.name !== 'string' || !f.name.trim() || f.name.trim().length > 80) throw Error('Escribe el nombre del modpack (máximo 80 caracteres).');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(f.version || '') || f.version.length > 60) throw Error('Usa una versión como 1.0.0 o 7.0.1-umbral.1.');
  if (typeof f.description !== 'string' || f.description.length > 500) throw Error('La descripción puede tener hasta 500 caracteres.');
  return {...f, name: f.name.trim()};
}
function createPublisher({fetchImpl = fetch} = {}) {
  let token = null, account = null;
  async function api(endpoint, {method = 'GET', body, allow404 = false, raw = false, size} = {}) {
    if (!token) throw Error('Conecta la cuenta administradora de GitHub.');
    const upload = endpoint.startsWith('https://uploads.github.com');
    const url = upload ? new URL(endpoint) : new URL(endpoint, 'https://api.github.com');
    if (url.protocol !== 'https:' || url.username || url.password || (!upload && url.origin !== 'https://api.github.com') || (upload && (url.origin !== 'https://uploads.github.com' || !url.pathname.startsWith(PREFIX + '/releases/')))) throw Error('Destino de GitHub no permitido.');
    const response = await fetchImpl(url, {method, redirect: 'error', signal: AbortSignal.timeout(upload ? 600000 : 45000),
      headers: {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? {'Content-Type': raw ? 'application/octet-stream' : 'application/json'} : {}), ...(size !== undefined ? {'Content-Length': String(size)} : {})},
      ...(body !== undefined ? {body: raw ? body : JSON.stringify(body)} : {}), ...(raw ? {duplex: 'half'} : {})});
    if (response.status === 404 && allow404) return null;
    if ([401, 403].includes(response.status)) throw Error('GitHub no autorizó esta operación. Revisa la cuenta y el permiso Contents del repositorio de Umbral.');
    if (response.status === 409 || response.status === 422) throw Error('El catálogo o la versión ya cambió en GitHub. Recarga y utiliza una versión nueva.');
    if (!response.ok) throw Error('GitHub respondió HTTP ' + response.status + '.');
    return response.status === 204 ? null : response.json();
  }
  async function verify() {
    const user = await api('/user');
    if (user.id !== OWNER_ID || user.login?.toLowerCase() !== OWNER) throw Error('Solo la cuenta ' + OWNER + ' puede publicar en Umbral.');
    const repo = await api(PREFIX);
    if (repo.full_name?.toLowerCase() !== REPO || !repo.permissions?.push || repo.private) throw Error('Se requiere acceso de escritura al repositorio público de Umbral.');
    account = {login: user.login, repository: REPO}; return account;
  }
  return {
    status: () => ({connected: !!account, login: account?.login || null, repository: REPO}),
    disconnect() { token = null; account = null; },
    async connect(value) {
      token = null; account = null;
      if (typeof value !== 'string' || value.trim().length < 20 || value.length > 1024 || /[\s]/.test(value.trim())) throw Error('Introduce un token de GitHub válido.');
      token = value.trim();
      try { await verify(); return this.status(); }
      catch (e) { token = null; account = null; throw e; }
    },
    async publish(root, draftId, input, onProgress = () => {}) {
      const fields = publicationFields(input), draft = readDraft(root, draftId);
      if (draft.dependencies.some(x => !x.file)) throw Error('Faltan archivos o permisos de CurseForge. Resuélvelos antes de publicar.');
      if (!draft.files.length && !draft.dependencies.length) throw Error('El borrador está vacío.');
      if (input.confirmPublish !== true) throw Error('Revisa el resumen y confirma la publicación del modpack.');
      await verify();
      const catalogFile = await api(PREFIX + '/contents/catalog/modpacks.json?ref=main');
      const catalog = JSON.parse(Buffer.from(catalogFile.content, 'base64').toString('utf8'));
      if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.modpacks)) throw Error('Formato del catálogo de Umbral no compatible.');
      const existing = catalog.modpacks.find(x => x.id === fields.packId);
      if (existing?.version === fields.version && existing?.published) throw Error('Esa versión ya está publicada. Aumenta el número de versión.');
      if (!existing && catalog.modpacks.length >= 50) throw Error('El catálogo ya tiene 50 modpacks.');
      const tag = 'pack-' + fields.packId + '-v' + fields.version;
      if (await api(PREFIX + '/releases/tags/' + encodeURIComponent(tag), {allow404: true})) throw Error('Esa versión ya existe en Releases. Elige una versión nueva.');
      const temporary = path.join(location(root, draftId), 'publish-' + crypto.randomUUID());
      fs.mkdirSync(temporary);
      let release = null, releasePublished = false;
      try {
        const bundles = [], groups = new Map();
        for (const f of draft.files) {
          if (!allowedPath(f.path)) throw Error('El borrador incluye una ruta no permitida.');
          const group = f.path === 'options.txt' ? 'defaults' : f.path.split('/')[0];
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(f);
        }
        for (const [group, files] of groups) {
          onProgress('Preparando ' + group + '…');
          const filename = path.join(temporary, group + '.zip');
          const info = await makeBundle(path.join(location(root, draftId), 'content'), files, filename);
          bundles.push({group, files, filename, ...info});
        }
        // Validate all paths, hashes and references before creating anything remote.
        const preview = {schemaVersion: 2, files: [...bundles.flatMap(b => b.files.map(f => ({...f, bundle: b.sha256}))), ...draft.dependencies.map(x => x.file)],
          bundles: bundles.map(b => ({id: b.sha256, sha256: b.sha256, size: b.size, url: 'https://github.com/' + REPO}))};
        validateManifest(preview);
        const attribution = draft.source?.author ? '\n\nBasado en el modpack de ' + draft.source.author + '.\n' + (draft.source.projectUrl || '') + '\n' + (draft.source.licenseUrl || '') : '';
        release = await api(PREFIX + '/releases', {method: 'POST', body: {tag_name: tag, target_commitish: 'main', name: fields.name + ' ' + fields.version, body: fields.description + attribution + '\n\nPublicado para el catálogo de Umbral. Los mods de CurseForge se descargan de sus fuentes oficiales.', draft: true, prerelease: false}});
        if (!Number.isSafeInteger(release.id)) throw Error('GitHub devolvió una publicación inválida.');
        const uploadBase = new URL(release.upload_url.replace(/\{.*$/, ''));
        if (uploadBase.origin !== 'https://uploads.github.com' || uploadBase.pathname !== PREFIX + '/releases/' + release.id + '/assets') throw Error('GitHub devolvió una dirección de carga inválida.');
        async function upload(filename, name, sha256) {
          const url = new URL(uploadBase); url.searchParams.set('name', name);
          const size = fs.statSync(filename).size;
          const asset = await api(url.href, {method: 'POST', body: fs.createReadStream(filename), raw: true, size});
          if (asset.state !== 'uploaded' || asset.size !== size || (asset.digest && asset.digest !== 'sha256:' + sha256)) throw Error('GitHub no confirmó íntegra la carga de ' + name + '.');
          const u = httpsUrl(asset.browser_download_url);
          if (u.hostname !== 'github.com' || !u.pathname.startsWith('/' + REPO + '/releases/download/')) throw Error('URL de descarga de GitHub inválida.');
          return asset.browser_download_url;
        }
        const publicBundles = [];
        for (const b of bundles) {
          onProgress('Subiendo ' + b.group + '…');
          const url = await upload(b.filename, b.group + '-' + b.sha256.slice(0, 12) + '.zip', b.sha256);
          publicBundles.push({id: b.sha256, sha256: b.sha256, size: b.size, url});
        }
        const manifest = {...preview, id: fields.packId, version: fields.version,
          minecraft: {version: draft.minecraftVersion, loader: draft.loader, loaderVersion: draft.loaderVersion, javaMajor: draft.javaMajor},
          source: draft.source || null, bundles: publicBundles};
        validateManifest(manifest);
        const manifestFile = path.join(temporary, 'manifest.json');
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        const manifestSha256 = await hashFile(manifestFile);
        const manifestUrl = await upload(manifestFile, 'manifest.json', manifestSha256);
        const entry = {...existing, id: fields.packId, name: fields.name, description: fields.description, version: fields.version,
          minecraftVersion: draft.minecraftVersion, loader: draft.loader, loaderVersion: draft.loaderVersion, javaMajor: draft.javaMajor,
          modsCount: manifest.files.filter(x => x.path.startsWith('mods/') && x.path.endsWith('.jar')).length,
          manifestUrl, manifestSha256, manifestSchemaVersion: 2, minimumLauncherVersion: '1.0.0-preview.4',
          source: draft.source || null, published: true, featured: existing?.featured ?? catalog.modpacks.length === 0, news: existing?.news || []};
        catalog.modpacks = existing ? catalog.modpacks.map(x => x.id === entry.id ? entry : x) : [...catalog.modpacks, entry];
        catalog.announcement = fields.name + ' ' + fields.version + ' disponible para descargar.';
        onProgress('Publicando la versión en GitHub…');
        await api(PREFIX + '/releases/' + release.id, {method: 'PATCH', body: {draft: false, make_latest: 'false'}});
        releasePublished = true;
        await api(PREFIX + '/contents/catalog/modpacks.json', {method: 'PUT', body: {
          branch: 'main', sha: catalogFile.sha, message: 'Publicar ' + fields.name + ' ' + fields.version + ' en Umbral',
          content: Buffer.from(JSON.stringify(catalog, null, 2) + '\n').toString('base64')
        }});
        const verifyCatalog = await api(PREFIX + '/contents/catalog/modpacks.json?ref=main');
        const saved = JSON.parse(Buffer.from(verifyCatalog.content, 'base64').toString('utf8')).modpacks.find(x => x.id === fields.packId);
        if (saved?.manifestSha256 !== manifestSha256) throw Error('El catálogo cambió antes de confirmar la publicación.');
        draft.published = {version: fields.version, url: release.html_url, manifestUrl}; saveDraft(root, draft);
        onProgress('Modpack publicado en el catálogo de Umbral.');
        return {...summary(draft), published: draft.published};
      } catch (e) {
        const suffix = release ? (releasePublished ? ' La versión está en Releases, pero no se confirmó en el catálogo.' : ' La carga quedó como borrador en Releases; los jugadores no la ven.') : '';
        throw Error(e.message + suffix);
      } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
    }
  };
}
module.exports = {createPublisher, publicationFields, REPO, OWNER_ID};
