'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {ROOTS, MAX_FILES, MAX_FILE_BYTES, MAX_PACK_BYTES, allowedPath, safeRelative, secureDestination, hashFile, copyStream, walkZip, readZipJson} = require('./pack-files');

const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function location(root, id) {
  if (!DRAFT_ID.test(id)) throw Error('Borrador inválido.');
  return path.join(root, id);
}
function saveDraft(root, draft) {
  const dest = location(root, draft.id);
  fs.mkdirSync(dest, {recursive: true});
  fs.writeFileSync(path.join(dest, 'draft.json.tmp'), JSON.stringify(draft, null, 2), {mode: 0o600});
  fs.renameSync(path.join(dest, 'draft.json.tmp'), path.join(dest, 'draft.json'));
}
function readDraft(root, id) {
  const d = JSON.parse(fs.readFileSync(path.join(location(root, id), 'draft.json'), 'utf8'));
  if (d.id !== id || !Array.isArray(d.files) || !Array.isArray(d.dependencies) || d.files.length > MAX_FILES) throw Error('Borrador dañado. Vuelve a importarlo.');
  return d;
}
function summary(draft) {
  const pending = draft.dependencies.filter(x => !x.file);
  const groups = {};
  for (const f of draft.files) { const group = f.path.split('/')[0]; groups[group] = (groups[group] || 0) + 1; }
  return {id: draft.id, name: draft.name, version: draft.version, minecraftVersion: draft.minecraftVersion,
    loader: draft.loader, loaderVersion: draft.loaderVersion, javaMajor: draft.javaMajor,
    recommendedRamMB: draft.recommendedRamMB, createdAt: draft.createdAt, source: draft.source || null,
    fileCount: draft.files.length, dependencyCount: draft.dependencies.length, resolvedCount: draft.dependencies.length - pending.length,
    pendingCount: pending.length, pending: pending.slice(0, 40).map(x => ({projectId: x.projectId, fileId: x.fileId, reason: x.reason || 'Pendiente de consultar CurseForge.'})),
    totalBytes: draft.files.reduce((n, x) => n + x.size, 0), groups, skippedCount: draft.skippedCount || 0,
    canPublish: pending.length === 0, published: draft.published || null};
}
function listDrafts(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(x => DRAFT_ID.test(x)).flatMap(id => { try { return [summary(readDraft(root, id))]; } catch { return []; } })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function minecraftMetadata(manifest) {
  if (manifest.manifestType !== 'minecraftModpack' || manifest.manifestVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 10000) throw Error('Formato de modpack CurseForge no compatible.');
  const mc = manifest.minecraft;
  if (!mc || !/^1\.\d{1,2}(?:\.\d{1,2})?$/.test(mc.version) || !Array.isArray(mc.modLoaders)) throw Error('No se pudo leer la versión de Minecraft.');
  const loaders = mc.modLoaders.filter(x => x.primary);
  const item = loaders.length === 1 ? loaders[0] : (mc.modLoaders.length === 1 ? mc.modLoaders[0] : null);
  const match = /^(neoforge|forge|fabric|quilt)-([0-9][0-9A-Za-z.+_-]{0,60})$/.exec(item?.id || '');
  if (!match) throw Error('El modpack debe indicar un único cargador principal compatible.');
  const [, minor, patch = '0'] = mc.version.split('.');
  const javaMajor = +minor >= 21 || (+minor === 20 && +patch >= 5) ? 21 : +minor >= 18 ? 17 : +minor === 17 ? 16 : 8;
  return {minecraftVersion: mc.version, loader: match[1], loaderVersion: match[2], javaMajor,
    recommendedRamMB: Math.min(16384, Math.max(2048, Number(mc.recommendedRam) || 6144))};
}
async function importCurseforge(filename, root, {onProgress = () => {}, knownSources = []} = {}) {
  const manifest = await readZipJson(filename, 'manifest.json');
  const metadata = minecraftMetadata(manifest);
  const overrides = safeRelative(manifest.overrides || 'overrides');
  const seen = new Set();
  const dependencies = manifest.files.map(f => {
    if (!Number.isSafeInteger(f.projectID) || f.projectID <= 0 || !Number.isSafeInteger(f.fileID) || f.fileID <= 0 || seen.has(f.projectID)) throw Error('Referencias de CurseForge repetidas o inválidas.');
    seen.add(f.projectID);
    return {projectId: f.projectID, fileId: f.fileID, required: f.required !== false};
  });
  const archiveHash = await hashFile(filename);
  const known = knownSources.find(x => x.archiveSha256 === archiveHash);
  const id = crypto.randomUUID();
  const dest = location(root, id), content = path.join(dest, 'content');
  const draft = {schemaVersion: 1, id, createdAt: new Date().toISOString(), name: known?.name || String(manifest.name || 'Nuevo modpack').trim().slice(0, 80),
    version: String(manifest.version || '1.0.0').slice(0, 80), ...metadata, files: [], dependencies, skippedCount: 0,
    source: known ? {...known.source, archiveSha256: archiveHash, manifestVersion: String(manifest.version || '')} : {provider: 'curseforge', archiveSha256: archiveHash, manifestVersion: String(manifest.version || ''), author: String(manifest.author || '').slice(0, 120)}};
  fs.mkdirSync(content, {recursive: true});
  try {
    await walkZip(filename, async (entry, open) => {
      if (!entry.fileName.startsWith(overrides + '/')) return;
      const relative = entry.fileName.slice(overrides.length + 1);
      if (!allowedPath(relative)) { draft.skippedCount++; return; }
      const output = secureDestination(content, relative);
      const stat = await copyStream(await open(), output, MAX_FILE_BYTES, entry.uncompressedSize);
      draft.files.push({path: relative, ...stat, policy: relative === 'options.txt' ? 'preserve' : 'managed'});
      if (draft.files.length % 100 === 0) onProgress('Importando archivos: ' + draft.files.length);
    });
    draft.files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    saveDraft(root, draft); return summary(draft);
  } catch (error) { fs.rmSync(dest, {recursive: true, force: true}); throw error; }
}
async function importFolder(folder, root, metadata, onProgress = () => {}) {
  if (!metadata || !/^1\.\d{1,2}(?:\.\d{1,2})?$/.test(metadata.minecraftVersion || '') || !['forge', 'neoforge', 'fabric', 'quilt'].includes(metadata.loader) || !/^[0-9][0-9A-Za-z.+_-]{0,60}$/.test(metadata.loaderVersion || '')) throw Error('Completa Minecraft, cargador y versión del cargador antes de importar la carpeta.');
  const meta = minecraftMetadata({manifestType: 'minecraftModpack', manifestVersion: 1, files: [], minecraft: {version: metadata.minecraftVersion, modLoaders: [{id: metadata.loader + '-' + metadata.loaderVersion, primary: true}]}});
  const id = crypto.randomUUID(), dest = location(root, id), content = path.join(dest, 'content');
  const draft = {schemaVersion: 1, id, createdAt: new Date().toISOString(), name: String(metadata.name || 'Nuevo modpack').slice(0, 80), version: String(metadata.version || '1.0.0').slice(0, 80), ...meta, files: [], dependencies: [], skippedCount: 0};
  fs.mkdirSync(content, {recursive: true}); let total = 0;
  async function walk(relative) {
    const source = secureDestination(folder, relative);
    const stat = fs.lstatSync(source);
    if (stat.isDirectory()) { for (const name of fs.readdirSync(source)) await walk(relative + '/' + name); return; }
    if (!stat.isFile() || !allowedPath(relative)) { draft.skippedCount++; return; }
    if (draft.files.length >= MAX_FILES || stat.size > MAX_FILE_BYTES || (total += stat.size) > MAX_PACK_BYTES) throw Error('La carpeta supera el tamaño permitido.');
    const result = await copyStream(fs.createReadStream(source), secureDestination(content, relative), MAX_FILE_BYTES, stat.size);
    draft.files.push({path: relative, ...result, policy: relative === 'options.txt' ? 'preserve' : 'managed'});
    if (draft.files.length % 100 === 0) onProgress('Importando archivos: ' + draft.files.length);
  }
  try {
    for (const name of [...ROOTS, 'options.txt']) if (fs.existsSync(path.join(folder, name))) await walk(name);
    if (!draft.files.length) throw Error('No se encontraron mods ni configuraciones en esa carpeta.');
    saveDraft(root, draft); return summary(draft);
  } catch (error) { fs.rmSync(dest, {recursive: true, force: true}); throw error; }
}
module.exports = {location, saveDraft, readDraft, summary, listDrafts, minecraftMetadata, importCurseforge, importFolder};
