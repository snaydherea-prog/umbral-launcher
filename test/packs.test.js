'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const yazl = require('yazl');
const {pipeline} = require('node:stream/promises');
const {hashFile, validateManifest} = require('../src/pack-files');
const {importCurseforge, readDraft, saveDraft, importFolder} = require('../src/pack-import');
const {syncManifest} = require('../src/pack-sync');
const {resolveDraft} = require('../src/curseforge');
const {createPublisher, OWNER_ID} = require('../src/pack-publish');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sha1 = value => crypto.createHash('sha1').update(value).digest('hex');
function temporary(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'umbral-test-')); t.after(() => fs.rmSync(p, {recursive: true, force: true})); return p; }
function put(root, name, value) { const f = path.join(root, name); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, value); return f; }
async function zipFile(root, entries) {
  const out = path.join(root, crypto.randomUUID() + '.zip'), zip = new yazl.ZipFile();
  const complete = pipeline(zip.outputStream, fs.createWriteStream(out));
  for (const [name, value, options] of entries) zip.addBuffer(Buffer.from(value), name, options || {});
  zip.end(); await complete; return out;
}
function cfManifest(files = []) { return {manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Test Pack', version: '1.0.0', overrides: 'overrides', minecraft: {version: '1.21.1', modLoaders: [{id: 'neoforge-21.1.248', primary: true}]}, files}; }
function file(name, body, extra = {}) { return {path: name, url: 'https://files.example/' + name, sha256: sha(body), size: Buffer.byteLength(body), ...extra}; }
function fetchFiles(bodies, calls = []) { return async url => { calls.push(String(url)); const key = new URL(url).pathname.slice(1); const body = bodies[key]; return body === undefined ? new Response('', {status: 404}) : new Response(body); }; }

test('CurseForge import detects exact loader and preserves only pack files', async t => {
  const root = temporary(t), zip = await zipFile(root, [['manifest.json', JSON.stringify(cfManifest([{projectID: 3, fileID: 4, required: true}]))], ['overrides/config/a.toml', 'test'], ['overrides/options.txt', 'volume:0.5'], ['overrides/saves/world/level.dat', 'world'], ['overrides/launcher_accounts.json', 'private'], ['overrides/config/.private', 'private']]);
  const result = await importCurseforge(zip, path.join(root, 'drafts'));
  assert.equal(result.loaderVersion, '21.1.248'); assert.equal(result.javaMajor, 21);
  assert.equal(result.fileCount, 2); assert.equal(result.skippedCount, 3); assert.equal(result.pendingCount, 1); assert.equal(result.canPublish, false);
  const draft = readDraft(path.join(root, 'drafts'), result.id);
  assert.equal(draft.files.find(x => x.path === 'options.txt').policy, 'preserve');
  assert(!fs.existsSync(path.join(root, 'drafts', result.id, 'content', 'saves')));
});
test('ZIP traversal and duplicate Windows paths are rejected', async t => {
  const root = temporary(t), zip = await zipFile(root, [['safe/file.txt', 'test'], ['manifest.json', JSON.stringify(cfManifest())]]);
  const unsafe = fs.readFileSync(zip).toString('latin1').replaceAll('safe/file.txt', '../a/file.txt'); fs.writeFileSync(zip, Buffer.from(unsafe, 'latin1'));
  await assert.rejects(importCurseforge(zip, path.join(root, 'drafts')), /invalid|ruta/i);
  const duplicates = await zipFile(root, [['manifest.json', JSON.stringify(cfManifest())], ['overrides/mods/A.jar', 'a'], ['overrides/mods/a.jar', 'b']]);
  await assert.rejects(importCurseforge(duplicates, path.join(root, 'drafts')), /repetidas/);
});
test('folder import excludes worlds and account files', async t => {
  const root = temporary(t), source = path.join(root, 'source');
  put(source, 'mods/a.jar', 'a'); put(source, 'saves/my-world/level.dat', 'world'); put(source, 'accounts.json', 'secret');
  const result = await importFolder(source, path.join(root, 'drafts'), {name: 'My Pack', minecraftVersion: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.248'});
  assert.equal(result.fileCount, 1); assert.equal(result.canPublish, true);
});
test('manifests cannot write worlds, traversal, reserved names or case collisions', () => {
  for (const p of ['saves/world/level.dat', '../oops', 'mods/../../oops', 'mods/CON.jar', 'mods/a.jar:evil', 'mods/a.jar.', 'launcher_accounts.json']) assert.throws(() => validateManifest({files: [file(p, 'a')]}));
  assert.throws(() => validateManifest({files: [file('mods/A.jar', 'a'), file('mods/a.jar', 'b')]}), /repetida/);
});
test('sync updates only changed files, backs up retired files and preserves player data', async t => {
  const root = temporary(t), calls = [];
  put(root, 'saves/world/level.dat', 'world'); put(root, 'screenshots/one.png', 'screen'); put(root, 'options.txt', 'personal');
  await syncManifest(root, {version: '1', files: [file('mods/old.jar', 'old'), file('config/a.toml', 'one'), file('options.txt', 'default', {policy: 'preserve'})]}, {fetchImpl: fetchFiles({'mods/old.jar': 'old', 'config/a.toml': 'one'}, calls)});
  assert.equal(fs.readFileSync(path.join(root, 'options.txt'), 'utf8'), 'personal');
  put(root, 'mods/my-mod.jar', 'custom'); calls.length = 0;
  const m = {version: '2', files: [file('mods/new.jar', 'new'), file('config/a.toml', 'one'), file('options.txt', 'default', {policy: 'preserve'})]};
  const result = await syncManifest(root, m, {fetchImpl: fetchFiles({'mods/new.jar': 'new'}, calls)});
  assert.equal(result.downloaded, 1); assert.equal(result.removed, 1); assert.equal(calls.length, 1);
  assert(!fs.existsSync(path.join(root, 'mods/old.jar')));
  assert.equal(fs.readFileSync(path.join(result.backupFolder, 'mods/old.jar'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(root, 'saves/world/level.dat'), 'utf8'), 'world');
  assert.equal(fs.readFileSync(path.join(root, 'mods/my-mod.jar'), 'utf8'), 'custom');
  await syncManifest(root, m, {fetchImpl: async () => { throw Error('Unchanged files must not be downloaded'); }});
});
test('a failed download changes no live files or installation ledger', async t => {
  const root = temporary(t); put(root, 'mods/a.jar', 'old');
  const m = {files: [file('mods/a.jar', 'new'), file('mods/b.jar', 'expected')]};
  await assert.rejects(syncManifest(root, m, {fetchImpl: fetchFiles({'mods/a.jar': 'new', 'mods/b.jar': 'tampered'})}), /verificación|permitido|Tamaño/);
  assert.equal(fs.readFileSync(path.join(root, 'mods/a.jar'), 'utf8'), 'old'); assert(!fs.existsSync(path.join(root, 'mods/b.jar')));
  assert(!fs.existsSync(path.join(root, '.umbral-managed.json'))); assert(!fs.readdirSync(root).some(x => x.startsWith('.umbral-stage')));
});
test('sync refuses symlinks and files changed during a download', async t => {
  const root = temporary(t), outside = temporary(t);
  fs.symlinkSync(outside, path.join(root, 'mods'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(syncManifest(root, {files: [file('mods/a.jar', 'a')]}, {fetchImpl: fetchFiles({})}), /enlace/);
  assert.equal(fs.readdirSync(outside).length, 0); fs.unlinkSync(path.join(root, 'mods'));
  put(root, 'mods/a.jar', 'old');
  await assert.rejects(syncManifest(root, {files: [file('mods/a.jar', 'new')]}, {fetchImpl: async () => { put(root, 'mods/a.jar', 'user-edited'); return new Response('new'); }}), /cambió/);
  assert.equal(fs.readFileSync(path.join(root, 'mods/a.jar'), 'utf8'), 'user-edited');
});
test('bundles support large resource packs and verify every extracted member', async t => {
  const root = temporary(t), source = temporary(t);
  const entries = Array.from({length: 2100}, (_, i) => ['resourcepacks/pack/assets/' + i + '.json', '{}']);
  const zip = await zipFile(source, entries), bytes = fs.readFileSync(zip), hash = sha(bytes);
  const manifest = {schemaVersion: 2, files: entries.map(([p, value]) => ({path: p, sha256: sha(value), size: 2, bundle: hash})), bundles: [{id: hash, sha256: hash, size: bytes.length, url: 'https://files.example/resources.zip'}]};
  const result = await syncManifest(root, manifest, {fetchImpl: async () => new Response(bytes)});
  assert.equal(result.files, 2100); assert.equal(result.downloaded, 2100);
  assert.equal(fs.readFileSync(path.join(root, entries[2099][0]), 'utf8'), '{}');
  await syncManifest(root, manifest, {fetchImpl: async () => { throw Error('No bundle download required'); }});
});
test('unlisted bundle members are rejected before changing the instance', async t => {
  const root = temporary(t), zip = await zipFile(root, [['mods/a.jar', 'a'], ['config/extra', 'unexpected']]), bytes = fs.readFileSync(zip), hash = sha(bytes), instance = path.join(root, 'instance');
  await assert.rejects(syncManifest(instance, {schemaVersion: 2, files: [{path: 'mods/a.jar', sha256: sha('a'), size: 1, bundle: hash}], bundles: [{id: hash, sha256: hash, size: bytes.length, url: 'https://files.example/x.zip'}]}, {fetchImpl: async () => new Response(bytes)}), /no coincide/);
  assert(!fs.existsSync(path.join(instance, 'mods/a.jar')));
});
test('CurseForge resolution respects blocked downloads and never constructs CDN URLs', async t => {
  const root = temporary(t), zip = await zipFile(root, [['manifest.json', JSON.stringify(cfManifest([{projectID: 1, fileID: 10}, {projectID: 2, fileID: 20}, {projectID: 3, fileID: 30}]))]]);
  const imported = await importCurseforge(zip, root);
  const calls = [];
  const result = await resolveDraft(root, imported.id, 'test-key-not-a-real-secret', {fetchImpl: async (url, options) => {
    calls.push(String(url)); assert.equal(options.redirect, 'error');
    if (url.includes('categories')) return Response.json({data: [{id: 6, slug: 'mc-mods'}]});
    if (url.endsWith('/mods')) return Response.json({data: [1, 2, 3].map(id => ({id, gameId: 432, classId: 6, allowModDistribution: id !== 2}))});
    return Response.json({data: [1, 2, 3].map(id => ({id: id * 10, modId: id, isAvailable: true, fileName: id + '.jar', fileLength: 1, hashes: [{algo: 1, value: sha1('a')}], gameVersions: ['1.21.1'], downloadUrl: id === 3 ? null : 'https://media.forgecdn.net/files/' + id + '.jar'}))});
  }});
  assert.equal(result.resolvedCount, 1); assert.equal(result.pendingCount, 2); assert.equal(result.canPublish, false);
  assert(calls.every(x => x.startsWith('https://api.curseforge.com/')));
  const saved = readDraft(root, imported.id); assert.equal(saved.dependencies[1].file, undefined); assert.equal(saved.dependencies[2].file, undefined);
  assert(!fs.readFileSync(path.join(root, imported.id, 'draft.json'), 'utf8').includes('test-key-not-a-real-secret'));
});
test('only the configured GitHub owner can authenticate for publishing', async () => {
  const publisher = createPublisher({fetchImpl: async () => Response.json({id: 123, login: 'another-user'})});
  await assert.rejects(publisher.connect('test-token-not-a-real-secret'), /Solo la cuenta/);
  assert.equal(publisher.status().connected, false);
});
function fakeGitHub({failUpload = false, conflict = false} = {}) {
  const events = []; let catalog = {schemaVersion: 1, modpacks: []};
  return {events, catalog: () => catalog, fetchImpl: async (input, options = {}) => {
    const url = new URL(input), method = options.method || 'GET'; events.push(method + ' ' + url.pathname);
    if (url.pathname === '/user') return Response.json({id: OWNER_ID, login: 'snaydherea-prog'});
    if (url.pathname === '/repos/snaydherea-prog/umbral-launcher') return Response.json({full_name: 'snaydherea-prog/umbral-launcher', private: false, permissions: {push: true}});
    if (url.pathname.includes('/releases/tags/')) return new Response('', {status: 404});
    if (url.pathname.endsWith('/contents/catalog/modpacks.json')) {
      if (method === 'PUT') { if (conflict) return new Response('', {status: 409}); catalog = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64')); }
      return Response.json({sha: 'catalog-sha', content: Buffer.from(JSON.stringify(catalog)).toString('base64')});
    }
    if (url.hostname === 'uploads.github.com') {
      const chunks = []; for await (const chunk of options.body) chunks.push(chunk);
      if (failUpload) return new Response('', {status: 500});
      const data = Buffer.concat(chunks);
      return Response.json({state: 'uploaded', size: data.length, digest: 'sha256:' + sha(data), browser_download_url: 'https://github.com/snaydherea-prog/umbral-launcher/releases/download/test/' + url.searchParams.get('name')});
    }
    if (method === 'POST' && url.pathname.endsWith('/releases')) return Response.json({id: 1, upload_url: 'https://uploads.github.com/repos/snaydherea-prog/umbral-launcher/releases/1/assets{?name,label}', html_url: 'https://github.com/snaydherea-prog/umbral-launcher/releases/tag/test'});
    if (method === 'PATCH') return Response.json({id: 1, draft: false});
    throw Error('Unexpected request: ' + url);
  }};
}
async function publishFixture(root) {
  const folder = path.join(root, 'folder'); put(folder, 'mods/test.jar', 'test'); put(folder, 'config/test.toml', 'config');
  return importFolder(folder, path.join(root, 'drafts'), {name: 'Authorized Test Pack', minecraftVersion: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.248'});
}
const fields = {packId: 'test-pack', name: 'Test Pack', version: '1.0.0', description: 'Test only', confirmPublish: true};
test('publishing uploads and verifies assets before changing the catalog', async t => {
  const root = temporary(t), draft = await publishFixture(root), github = fakeGitHub(), publisher = createPublisher(github);
  await publisher.connect('test-token-not-a-real-secret');
  const result = await publisher.publish(path.join(root, 'drafts'), draft.id, fields);
  assert.equal(result.published.version, '1.0.0');
  const entry = github.catalog().modpacks[0]; assert.equal(entry.modsCount, 1); assert.equal(entry.published, true); assert.match(entry.manifestSha256, /^[a-f0-9]{64}$/);
  const update = github.events.findIndex(x => x.startsWith('PUT '));
  assert(github.events.findIndex(x => x.startsWith('PATCH ')) < update);
  assert(github.events.filter(x => x.includes('/assets')).length === 3);
});
test('failed asset upload and stale catalog never report a published pack', async t => {
  for (const mode of [{failUpload: true}, {conflict: true}]) {
    const root = temporary(t), draft = await publishFixture(root), github = fakeGitHub(mode), publisher = createPublisher(github);
    await publisher.connect('test-token-not-a-real-secret');
    await assert.rejects(publisher.publish(path.join(root, 'drafts'), draft.id, fields), /borrador|catálogo/);
    assert.equal(github.catalog().modpacks.length, 0); assert.equal(readDraft(path.join(root, 'drafts'), draft.id).published, undefined);
  }
});
test('unresolved CurseForge references cannot publish or make remote changes', async t => {
  const root = temporary(t), draft = await publishFixture(root), saved = readDraft(path.join(root, 'drafts'), draft.id);
  saved.dependencies = [{projectId: 1, fileId: 2}]; saveDraft(path.join(root, 'drafts'), saved);
  const github = fakeGitHub(), publisher = createPublisher(github);
  await assert.rejects(publisher.publish(path.join(root, 'drafts'), draft.id, fields), /Faltan archivos/); assert.equal(github.events.length, 0);
});
