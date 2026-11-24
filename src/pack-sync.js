'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Readable} = require('node:stream');
const {MAX_FILE_BYTES, allowedPath, secureDestination, httpsUrl, hashFile, copyStream, walkZip, validateManifest} = require('./pack-files');

async function jsonDownload(url, {fetchImpl = fetch, sha256} = {}) {
  const response = await fetchImpl(httpsUrl(url), {signal: AbortSignal.timeout(30000)});
  if (!response.ok || !response.body) throw Error('No se pudo leer el manifiesto: HTTP ' + response.status);
  const chunks = []; let size = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    size += chunk.length;
    if (size > 16 * 1024 ** 2) throw Error('El manifiesto supera el límite de tamaño.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (sha256 && crypto.createHash('sha256').update(bytes).digest('hex') !== sha256) throw Error('El manifiesto no coincide con el publicado por el administrador.');
  return JSON.parse(bytes.toString('utf8'));
}
function digestOf(file) { return file.sha256 ? {algorithm: 'sha256', expected: file.sha256.toLowerCase()} : {algorithm: 'sha1', expected: file.sha1.toLowerCase()}; }
async function currentState(root, relative) {
  const dest = secureDestination(root, relative);
  if (!fs.existsSync(dest)) return null;
  if (!fs.lstatSync(dest).isFile()) throw Error('Una carpeta ocupa la ruta del archivo: ' + relative);
  return hashFile(dest);
}
async function downloadFile(url, destination, {size, sha256, sha1, provider}, fetchImpl) {
  const response = await fetchImpl(httpsUrl(url, provider), {signal: AbortSignal.timeout(180000)});
  if (!response.ok || !response.body) throw Error('Error al descargar un archivo: HTTP ' + response.status);
  if (response.url) httpsUrl(response.url, provider);
  const result = await copyStream(Readable.fromWeb(response.body), destination, size === undefined ? MAX_FILE_BYTES : size, size);
  if (sha256 && result.sha256 !== sha256.toLowerCase()) throw Error('La descarga no supera la verificación SHA-256.');
  if (!sha256 && await hashFile(destination, 'sha1') !== sha1.toLowerCase()) throw Error('La descarga no coincide con el hash oficial de CurseForge.');
}
async function syncManifest(root, input, {fetchImpl = fetch, onProgress = () => {}} = {}) {
  const manifest = validateManifest(input);
  fs.mkdirSync(root, {recursive: true});
  const ledgerPath = secureDestination(root, '.umbral-managed.json');
  let prior = [];
  if (fs.existsSync(ledgerPath)) {
    const old = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    if (!Array.isArray(old.files)) throw Error('El registro de la instalación está dañado.');
    prior = old.files;
  }
  const stage = secureDestination(root, '.umbral-stage-' + crypto.randomUUID());
  fs.mkdirSync(stage);
  const incoming = path.join(stage, 'files');
  const wanted = [], preserved = [], snapshots = new Map();
  let downloaded = 0;
  try {
    for (let i = 0; i < manifest.files.length; i++) {
      const f = manifest.files[i];
      const oldHash = await currentState(root, f.path);
      snapshots.set(f.path, oldHash);
      if (oldHash && (f.path === 'options.txt' || f.policy === 'preserve')) { preserved.push(f.path); continue; }
      const digest = digestOf(f);
      if (oldHash && (digest.algorithm === 'sha256' ? oldHash : await hashFile(secureDestination(root, f.path), 'sha1')) === digest.expected) continue;
      wanted.push(f);
      if (i % 100 === 0) onProgress('Comprobando archivos: ' + (i + 1) + '/' + manifest.files.length, Math.floor(i / Math.max(1, manifest.files.length) * 20));
    }
    for (const file of wanted.filter(x => !x.bundle)) {
      await downloadFile(file.url, secureDestination(incoming, file.path), file, fetchImpl);
      downloaded++;
      onProgress('Descargado: ' + file.path, 20 + Math.floor(downloaded / Math.max(1, wanted.length) * 60));
    }
    for (const bundle of manifest.bundles || []) {
      const needed = wanted.filter(x => x.bundle === bundle.id);
      if (!needed.length) continue;
      const archive = path.join(stage, bundle.id + '.zip');
      await downloadFile(bundle.url, archive, bundle, fetchImpl);
      const expected = new Map(manifest.files.filter(x => x.bundle === bundle.id).map(x => [x.path, x]));
      const need = new Set(needed.map(x => x.path)), present = new Set();
      await walkZip(archive, async (entry, open) => {
        const f = expected.get(entry.fileName);
        if (!f || entry.uncompressedSize !== f.size) throw Error('El paquete contiene un archivo que no coincide con el manifiesto.');
        present.add(entry.fileName);
        if (!need.has(entry.fileName)) return;
        const result = await copyStream(await open(), secureDestination(incoming, f.path), f.size, f.size);
        if (result.sha256 !== f.sha256) throw Error('Archivo de paquete alterado: ' + f.path);
        downloaded++;
        if (downloaded % 100 === 0) onProgress('Preparando archivos: ' + downloaded + '/' + wanted.length, 20 + Math.floor(downloaded / Math.max(1, wanted.length) * 60));
      });
      if (present.size !== expected.size) throw Error('El paquete descargado está incompleto.');
    }
    const current = new Set(manifest.files.map(x => x.path.toLowerCase()));
    const obsolete = [], retained = [], oldNames = new Set();
    for (const f of prior) {
      if (!allowedPath(f.path) || f.path === 'options.txt' || current.has(f.path.toLowerCase()) || oldNames.has(f.path.toLowerCase())) continue;
      oldNames.add(f.path.toLowerCase());
      const hash = await currentState(root, f.path);
      if (!hash) continue;
      const expected = /^[a-f0-9]{64}$/i.test(f.sha256 || '') ? f.sha256.toLowerCase() : '';
      if (!expected || hash !== expected) { retained.push(f.path); continue; }
      snapshots.set(f.path, hash); obsolete.push(f);
    }
    // Nothing in the live instance is changed until all downloads have passed validation.
    for (const f of [...wanted, ...obsolete]) {
      if (await currentState(root, f.path) !== snapshots.get(f.path)) throw Error('Un archivo cambió durante la descarga. Cierra el juego y vuelve a actualizar.');
    }
    const backupDir = secureDestination(root, '.umbral-backups/' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8));
    const operations = [];
    const wantedSet = new Set(wanted);
    const nextLedger = [];
    // Compute the ledger before committing, including preserved local settings.
    for (const f of manifest.files) {
      const pending = wantedSet.has(f);
      const actualHash = pending ? await hashFile(secureDestination(incoming, f.path)) : await currentState(root, f.path);
      nextLedger.push({path: f.path, sha256: actualHash, policy: f.policy || 'managed'});
    }
    const ledgerTemporary = path.join(stage, 'ledger.json');
    fs.writeFileSync(ledgerTemporary, JSON.stringify({schemaVersion: 2, version: String(manifest.version || ''), files: nextLedger, retained}, null, 2));
    try {
      for (const f of [...wanted, ...obsolete]) {
        const target = secureDestination(root, f.path);
        const op = {target, backup: null, wrote: false}; operations.push(op);
        if (fs.existsSync(target)) {
          const backup = secureDestination(backupDir, f.path);
          fs.mkdirSync(path.dirname(backup), {recursive: true});
          fs.renameSync(target, backup); op.backup = backup;
        }
        if (wantedSet.has(f)) {
          fs.mkdirSync(path.dirname(target), {recursive: true});
          fs.renameSync(secureDestination(incoming, f.path), target); op.wrote = true;
        }
      }
      fs.renameSync(ledgerTemporary, ledgerPath);
    } catch (error) {
      for (const op of operations.reverse()) {
        if (op.wrote) fs.rmSync(op.target, {force: true});
        if (op.backup) fs.renameSync(op.backup, op.target);
      }
      throw error;
    }
    onProgress('Archivos del modpack verificados.', 100);
    return {ok: true, files: manifest.files.length, downloaded, removed: obsolete.length, preserved: preserved.length, retained,
      backupFolder: operations.some(x => x.backup) ? backupDir : null};
  } finally { fs.rmSync(stage, {recursive: true, force: true}); }
}
module.exports = {jsonDownload, syncManifest, downloadFile};
