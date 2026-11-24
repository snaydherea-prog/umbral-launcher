'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('catalog and admin views render, retain pending state and clear entered credentials', async t => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const dom = new JSDOM(html, {url: 'https://local.test', runScripts: 'outside-only'}); t.after(() => dom.window.close());
  const {window} = dom, errors = [];
  window.addEventListener('error', e => errors.push(e.error));
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let config = {selectedId: id, packs: [{id, remoteId: 'keo-rpg-optimized', name: 'KEO RPG Optimized', mcVersion: '1.21.1', loaderType: 'neoforge', memoryGB: '6'}]};
  let connected = false, drafts = [];
  const imported = {id: 'draft-test', name: 'KEO RPG Optimized', version: '7.0.0', minecraftVersion: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.248', javaMajor: 21, recommendedRamMB: 6048, fileCount: 9260, dependencyCount: 295, resolvedCount: 0, pendingCount: 295, pending: [{projectId: 1, fileId: 2, reason: 'Pendiente'}], canPublish: false, source: {projectId: 1500914, version: '7.0.1'}};
  window.umbral = {
    settings: async () => config, save: async x => { config = x; return x; },
    catalog: async () => ({modpacks: [{id: 'keo-rpg-optimized', name: 'KEO RPG Optimized', minecraftVersion: '1.21.1', loader: 'neoforge', published: false}]}),
    profile: async () => null, onAuth: () => {}, onProgress: () => {}, onAdminProgress: () => {},
    adminStatus: async () => ({connected, login: connected ? 'snaydherea-prog' : null, drafts, curseforgeEnabled: false}),
    importZip: async () => { drafts = [imported]; return imported; },
    adminConnect: async token => { assert.equal(token, 'test-token'); connected = true; return {connected}; }
  };
  for (const name of ['renderer.js', 'admin-renderer.js']) window.eval(fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'));
  await tick(); await tick();
  const el = id => window.document.getElementById(id);
  assert.equal(el('officialPacks').children.length, 1); assert.equal(el('packCards').children.length, 1);
  el('openAdmin').click(); await tick();
  assert(!el('admin').classList.contains('hidden'));
  el('adminImportZip').click(); await tick(); await tick();
  assert.match(el('draftSummary').textContent, /295/); assert.equal(el('adminVersion').value, '7.0.1-umbral.1');
  assert(el('adminPublish').disabled); assert(el('curseforgeAccess').classList.contains('hidden'));
  el('githubToken').value = 'test-token'; el('adminConnect').click(); await tick(); await tick();
  assert.equal(el('githubToken').value, ''); assert(el('adminConnection').classList.contains('hidden'));
  assert(el('adminPublish').disabled); assert.equal(errors.length, 0);
});
