'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const yauzl = require('yauzl');
const yazl = require('yazl');

const MAX_FILES = 30000;
const MAX_FILE_BYTES = 2 * 1024 ** 3 - 1;
const MAX_PACK_BYTES = 8 * 1024 ** 3;
const ROOTS = new Set(['mods', 'config', 'defaultconfigs', 'resourcepacks', 'shaderpacks', 'kubejs', 'scripts']);
function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 450 || value.includes('\\') || /[\x00-\x1f<>:"|?*]/.test(value)) throw Error('Ruta no permitida en el modpack.');
  const parts = value.split('/');
  if (parts.some(x => !x || x === '.' || x === '..' || /[ .]$/.test(x) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))) throw Error('Ruta no compatible con Windows: ' + value);
  return value;
}
function allowedPath(value) {
  safeRelative(value);
  return value === 'options.txt' || (ROOTS.has(value.split('/')[0]) && value.includes('/') && !value.split('/').some(x => x.startsWith('.')));
}
function secureDestination(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  if (fs.existsSync(base) && (!fs.lstatSync(base).isDirectory() || fs.lstatSync(base).isSymbolicLink())) throw Error('La carpeta del modpack no puede ser un enlace.');
  let at = base;
  for (const part of relative.split('/')) {
    at = path.join(at, part);
    if (fs.existsSync(at) && fs.lstatSync(at).isSymbolicLink()) throw Error('Se encontró un enlace en la carpeta del modpack.');
  }
  return at;
}
function httpsUrl(value, provider) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw Error('Se requiere una URL HTTPS sin credenciales.');
  if (provider === 'curseforge' && !(u.hostname === 'forgecdn.net' || u.hostname.endsWith('.forgecdn.net'))) throw Error('La descarga de CurseForge no procede de su CDN oficial.');
  return u;
}
async function hashFile(filename, algorithm = 'sha256') {
  const h = crypto.createHash(algorithm);
  for await (const chunk of fs.createReadStream(filename)) h.update(chunk);
  return h.digest('hex');
}
async function copyStream(input, filename, limit, expectedSize) {
  let bytes = 0;
  const sha = crypto.createHash('sha256');
  const guard = new Transform({transform(chunk, _encoding, done) {
    bytes += chunk.length;
    if (bytes > limit) return done(Error('El archivo supera el tamaño permitido.'));
    sha.update(chunk); done(null, chunk);
  }});
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  try {
    await pipeline(input, guard, fs.createWriteStream(filename, {flags: 'wx', mode: 0o600}));
    if (expectedSize !== undefined && bytes !== expectedSize) throw Error('Tamaño de archivo incorrecto.');
    return {size: bytes, sha256: sha.digest('hex')};
  } catch (error) { fs.rmSync(filename, {force: true}); throw error; }
}
async function walkZip(filename, onEntry) {
  const zip = await yauzl.openPromise(filename, {lazyEntries: true, strictFileNames: true, validateEntrySizes: true});
  let total = 0, count = 0;
  const names = new Set();
  try {
    for await (const entry of zip.eachEntry()) {
      if (++count > MAX_FILES + 10000) throw Error('El ZIP contiene demasiadas entradas.');
      const name = entry.fileName.replace(/\/$/, '');
      safeRelative(name);
      const key = name.toLowerCase();
      if (names.has(key)) throw Error('El ZIP contiene rutas repetidas: ' + name);
      names.add(key);
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) throw Error('El ZIP contiene un enlace simbólico.');
      if (entry.generalPurposeBitFlag & 1) throw Error('Los ZIP cifrados no están admitidos.');
      if (/\/$/.test(entry.fileName)) continue;
      if (entry.uncompressedSize > MAX_FILE_BYTES || (total += entry.uncompressedSize) > MAX_PACK_BYTES) throw Error('El ZIP supera el tamaño permitido.');
      await onEntry(entry, () => zip.openReadStreamPromise(entry));
    }
  } finally { zip.close(); }
}
async function readZipJson(filename, member) {
  let found;
  await walkZip(filename, async (entry, open) => {
    if (entry.fileName !== member) return;
    if (entry.uncompressedSize > 4 * 1024 ** 2) throw Error('El manifiesto es demasiado grande.');
    const chunks = []; let size = 0;
    for await (const chunk of await open()) {
      size += chunk.length;
      if (size > 4 * 1024 ** 2) throw Error('El manifiesto es demasiado grande.');
      chunks.push(chunk);
    }
    found = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
  });
  if (!found) throw Error('El ZIP no contiene ' + member + '. Exporta el perfil como modpack de CurseForge.');
  return found;
}
function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) throw Error('Manifiesto de archivos inválido.');
  if (manifest.schemaVersion !== undefined && ![1, 2].includes(manifest.schemaVersion)) throw Error('Actualiza Umbral para leer este manifiesto.');
  const names = new Set(), bundles = new Map(); let total = 0;
  for (const b of manifest.bundles || []) {
    if (!/^[a-f0-9]{64}$/.test(b.sha256) || b.id !== b.sha256 || bundles.has(b.id)) throw Error('Paquete de archivos inválido.');
    if (!Number.isSafeInteger(b.size) || b.size < 0 || b.size > MAX_FILE_BYTES) throw Error('Tamaño del paquete inválido.');
    httpsUrl(b.url); bundles.set(b.id, b);
  }
  for (const f of manifest.files) {
    if (!allowedPath(f.path)) throw Error('El manifiesto intenta modificar archivos personales: ' + f.path);
    const name = f.path.toLowerCase();
    if (names.has(name)) throw Error('Ruta repetida: ' + f.path);
    names.add(name);
    if (f.size !== undefined && (!Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_FILE_BYTES)) throw Error('Tamaño de archivo inválido.');
    total += f.size || 0;
    if (total > MAX_PACK_BYTES) throw Error('El modpack supera el tamaño permitido.');
    if (f.sha256) { if (!/^[a-f0-9]{64}$/i.test(f.sha256)) throw Error('SHA-256 inválido.'); }
    else if (f.provider === 'curseforge' && /^[a-f0-9]{40}$/i.test(f.sha1)) { /* Hash oficial de la API. */ }
    else throw Error('Falta una suma de verificación válida: ' + f.path);
    if (f.bundle) {
      if (!f.sha256 || f.url || !bundles.has(f.bundle)) throw Error('Referencia de paquete inválida.');
    } else httpsUrl(f.url, f.provider);
    if (f.policy !== undefined && !['managed', 'preserve'].includes(f.policy)) throw Error('Política de actualización inválida.');
  }
  for (const name of names) {
    const pieces = name.split('/'); pieces.pop();
    while (pieces.length) { if (names.has(pieces.join('/'))) throw Error('Una ruta es archivo y carpeta a la vez.'); pieces.pop(); }
  }
  return manifest;
}
async function makeBundle(root, files, destination) {
  const archive = new yazl.ZipFile();
  const output = pipeline(archive.outputStream, fs.createWriteStream(destination, {flags: 'wx'}));
  try {
    for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
      const filename = secureDestination(root, f.path);
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.size !== f.size || await hashFile(filename) !== f.sha256) throw Error('El borrador cambió. Vuelve a importarlo: ' + f.path);
      archive.addFile(filename, f.path, {mtime: new Date('2000-01-01T00:00:00Z'), mode: 0o100644});
    }
    archive.end(); await output;
    const size = fs.statSync(destination).size;
    if (size > MAX_FILE_BYTES) throw Error('El paquete supera el límite de archivos de GitHub Releases.');
    return {sha256: await hashFile(destination), size};
  } catch (e) { archive.outputStream.destroy(e); await output.catch(() => {}); fs.rmSync(destination, {force: true}); throw e; }
}
module.exports = {MAX_FILES, MAX_FILE_BYTES, MAX_PACK_BYTES, ROOTS, safeRelative, allowedPath, secureDestination, httpsUrl, hashFile, copyStream, walkZip, readZipJson, validateManifest, makeBundle};
