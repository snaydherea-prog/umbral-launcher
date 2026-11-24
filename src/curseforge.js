'use strict';
const {httpsUrl, safeRelative, MAX_FILE_BYTES} = require('./pack-files');
const {readDraft, saveDraft, summary} = require('./pack-import');
async function resolveDraft(root, id, apiKey, {fetchImpl = fetch, onProgress = () => {}} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 15 || apiKey.length > 1024 || /[\r\n]/.test(apiKey)) throw Error('Introduce la clave de API de CurseForge aprobada para Umbral.');
  const draft = readDraft(root, id);
  async function call(endpoint, body) {
    const response = await fetchImpl('https://api.curseforge.com/v1/' + endpoint, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: {'Accept': 'application/json', 'Content-Type': 'application/json', 'x-api-key': apiKey.trim()},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    if ([401, 403].includes(response.status)) throw Error('CurseForge no autorizó esta clave de API.');
    if (!response.ok) throw Error('CurseForge respondió HTTP ' + response.status + '. El borrador sigue sin publicar.');
    return (await response.json()).data;
  }
  const categories = await call('categories?gameId=432&classesOnly=true');
  if (!Array.isArray(categories)) throw Error('Respuesta de categorías inválida.');
  const folders = new Map(categories.flatMap(x => {
    const folder = {'mc-mods': 'mods', 'texture-packs': 'resourcepacks', shaders: 'shaderpacks'}[x.slug];
    return folder ? [[x.id, folder]] : [];
  }));
  const results = [];
  for (let start = 0; start < draft.dependencies.length; start += 40) {
    const batch = draft.dependencies.slice(start, start + 40);
    onProgress('Consultando permisos de CurseForge: ' + Math.min(start + batch.length, draft.dependencies.length) + '/' + draft.dependencies.length);
    const [mods, files] = await Promise.all([call('mods', {modIds: batch.map(x => x.projectId)}), call('mods/files', {fileIds: batch.map(x => x.fileId)})]);
    if (!Array.isArray(mods) || !Array.isArray(files)) throw Error('CurseForge devolvió una lista de archivos inválida.');
    for (const dep of batch) {
      const mod = mods.find(x => x.id === dep.projectId), file = files.find(x => x.id === dep.fileId && x.modId === dep.projectId);
      const result = {projectId: dep.projectId, fileId: dep.fileId, required: dep.required};
      if (!mod || mod.gameId !== 432 || !file || !file.isAvailable) result.reason = 'Archivo no disponible en CurseForge.';
      else if (mod.allowModDistribution === false || !file.downloadUrl) result.reason = 'El autor no permite esta descarga por la API; requiere revisión.';
      else {
        const folder = folders.get(mod.classId);
        const sha1 = file.hashes?.find(x => x.algo === 1)?.value;
        try {
          if (!folder || typeof file.fileName !== 'string' || file.fileName.includes('/') || file.fileName.includes('\\')) throw Error('Tipo de archivo no compatible.');
          if (!Number.isSafeInteger(file.fileLength) || file.fileLength < 0 || file.fileLength > MAX_FILE_BYTES || !/^[a-f0-9]{40}$/i.test(sha1 || '')) throw Error('Faltan tamaño o hash oficial.');
          if (!Array.isArray(file.gameVersions) || !file.gameVersions.includes(draft.minecraftVersion)) throw Error('El archivo no declara esta versión de Minecraft.');
          httpsUrl(file.downloadUrl, 'curseforge');
          result.file = {path: safeRelative(folder + '/' + file.fileName), url: file.downloadUrl, size: file.fileLength, sha1: sha1.toLowerCase(), provider: 'curseforge', projectId: dep.projectId, fileId: dep.fileId, policy: 'managed'};
        } catch (e) { result.reason = e.message; }
      }
      results.push(result);
    }
  }
  const names = new Set(draft.files.map(x => x.path.toLowerCase()));
  for (const dep of results) if (dep.file) {
    if (names.has(dep.file.path.toLowerCase())) { delete dep.file; dep.reason = 'Otro archivo del pack usa el mismo nombre; revisa el conflicto.'; }
    else names.add(dep.file.path.toLowerCase());
  }
  draft.dependencies = results;
  draft.resolvedAt = new Date().toISOString();
  saveDraft(root, draft); return summary(draft);
}
module.exports = {resolveDraft};
