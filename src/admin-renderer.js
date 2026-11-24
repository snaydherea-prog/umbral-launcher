'use strict';
(() => {
  const el = id => document.getElementById(id);
  let admin = {connected: false, drafts: [], curseforgeEnabled: false}, selected = '', busy = false;
  const currentDraft = () => admin.drafts.find(d => d.id === selected);
  function status(message, error = false) { el('adminStatus').textContent = message; el('adminStatus').classList.toggle('error', error); }
  function renderAdmin() {
    const draft = currentDraft();
    el('adminConnection').classList.toggle('hidden', admin.connected);
    el('adminConnected').classList.toggle('hidden', !admin.connected);
    el('adminAccount').textContent = admin.connected ? 'Administrador conectado: ' + admin.login : '';
    el('curseforgePending').classList.toggle('hidden', !!admin.curseforgeEnabled);
    el('curseforgeAccess').classList.toggle('hidden', !admin.curseforgeEnabled);
    for (const id of ['adminImportZip', 'adminImportFolder', 'adminConnect', 'adminDisconnect', 'adminDrafts']) el(id).disabled = busy;
    el('adminOpenDraft').disabled = busy || !draft;
    el('adminResolve').disabled = busy || !draft?.dependencyCount || !admin.curseforgeEnabled;
    el('adminPublish').disabled = busy || !admin.connected || !draft?.canPublish;
    el('adminPublish').textContent = busy ? 'Operación en curso…' : 'Publicar versión';
    el('draftSummary').textContent = draft ? draft.name + '\nMinecraft ' + draft.minecraftVersion + ' · ' + draft.loader + ' ' + draft.loaderVersion + '\nJava ' + draft.javaMajor + ' · RAM sugerida: ' + Math.ceil(draft.recommendedRamMB / 1024) + ' GB\n' + draft.fileCount.toLocaleString('es') + ' archivos preparados · ' + draft.dependencyCount + ' referencias externas\n' + draft.pendingCount + ' descargas pendientes de resolver.' + (draft.skippedCount ? '\n' + draft.skippedCount + ' archivos excluidos por la política de importación.' : '') : 'Tu importación aparecerá aquí.';
    el('publishSummary').textContent = !draft ? 'Selecciona un borrador para revisar la publicación.' : draft.pendingCount ? 'Faltan ' + draft.pendingCount + ' descargas o permisos. Este borrador todavía no se puede publicar.' : 'Publicar hará visible esta versión en el catálogo de todos los miembros. Los archivos se alojarán en GitHub Releases.';
    const pending = el('pendingFiles'); pending.replaceChildren();
    if (draft?.pendingCount) {
      const label = document.createElement('p'); label.textContent = 'Primeras referencias pendientes:'; pending.append(label);
      for (const item of draft.pending || []) {
        const line = document.createElement('p'); line.textContent = 'Proyecto ' + item.projectId + ' · Archivo ' + item.fileId + ': ' + item.reason; pending.append(line);
      }
    }
  }
  function selectDraft(id) {
    selected = id; const draft = currentDraft();
    if (draft) {
      el('adminName').value = draft.name;
      el('adminMinecraft').value = draft.minecraftVersion;
      el('adminLoader').value = draft.loader;
      el('adminLoaderVersion').value = draft.loaderVersion;
      if (draft.source?.projectId === 1500914) {
        el('adminPackId').value = 'keo-rpg-optimized';
        el('adminVersion').value = (draft.source.version || draft.version) + '-umbral.1';
      } else {
        el('adminPackId').value = draft.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'nuevo-modpack';
        el('adminVersion').value = /^\d+\.\d+\.\d+/.test(draft.version) ? draft.version : '1.0.0';
      }
    }
    renderAdmin();
  }
  async function loadAdmin(preferred) {
    admin = await window.umbral.adminStatus();
    const select = el('adminDrafts'); select.replaceChildren();
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Selecciona un borrador'; select.append(blank);
    for (const d of admin.drafts) {
      const option = document.createElement('option'); option.value = d.id; option.textContent = d.name + ' · ' + d.version + ' · ' + d.pendingCount + ' pendientes'; select.append(option);
    }
    selected = preferred || selected;
    if (!admin.drafts.some(x => x.id === selected)) selected = admin.drafts[0]?.id || '';
    select.value = selected; selectDraft(selected);
  }
  async function run(label, operation) {
    if (busy) return;
    busy = true; status(label); renderAdmin();
    try { await operation(); }
    catch (error) { status(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''), true); }
    finally { busy = false; renderAdmin(); }
  }
  el('openAdmin').addEventListener('click', () => {
    document.querySelectorAll('section.view').forEach(x => x.classList.toggle('hidden', x.id !== 'admin'));
    document.querySelectorAll('.nav[data-view]').forEach(x => x.classList.remove('active'));
    run('Cargando administración…', async () => { await loadAdmin(); status('Prepara tus archivos. Solo el administrador conectado puede publicarlos.'); });
  });
  el('adminDrafts').addEventListener('change', () => selectDraft(el('adminDrafts').value));
  el('adminImportZip').addEventListener('click', () => run('Selecciona el ZIP del modpack…', async () => {
    const result = await window.umbral.importZip();
    if (!result) { status('Importación cancelada.'); return; }
    await loadAdmin(result.id); status('ZIP importado. Revisa los archivos y las descargas pendientes.');
  }));
  el('adminImportFolder').addEventListener('click', () => run('Selecciona la carpeta del modpack…', async () => {
    const result = await window.umbral.importFolder({name: el('adminName').value, version: el('adminVersion').value,
      minecraftVersion: el('adminMinecraft').value, loader: el('adminLoader').value, loaderVersion: el('adminLoaderVersion').value});
    if (!result) { status('Importación cancelada.'); return; }
    await loadAdmin(result.id); status('Carpeta importada. Revisa su contenido antes de publicar.');
  }));
  el('adminOpenDraft').addEventListener('click', () => run('Abriendo archivos…', async () => { await window.umbral.openDraft(selected); status('Carpeta del borrador abierta. Si cambias archivos, vuelve a importar la carpeta.'); }));
  el('adminConnect').addEventListener('click', () => run('Comprobando la cuenta administradora…', async () => {
    const token = el('githubToken').value; el('githubToken').value = '';
    await window.umbral.adminConnect(token); await loadAdmin(); status('Administrador conectado.');
  }));
  el('adminDisconnect').addEventListener('click', () => run('Desconectando administrador…', async () => {
    await window.umbral.adminDisconnect(); await loadAdmin(); status('Administrador desconectado.');
  }));
  el('adminResolve').addEventListener('click', () => run('Comprobando permisos de descarga…', async () => {
    const key = el('curseforgeKey').value; el('curseforgeKey').value = '';
    const result = await window.umbral.resolveDraft(selected, key); await loadAdmin(result.id);
    status(result.pendingCount ? 'Quedan ' + result.pendingCount + ' referencias sin autorización o sin archivo disponible.' : 'Todas las referencias tienen una descarga oficial disponible.');
  }));
  el('adminPublish').addEventListener('click', () => run('Preparando la publicación…', async () => {
    const result = await window.umbral.publishDraft(selected, {packId: el('adminPackId').value.trim(), name: el('adminName').value.trim(), version: el('adminVersion').value.trim(), description: el('adminDescription').value.trim(), confirmPublish: true});
    await loadAdmin(result.id); status('Publicado: ' + result.published.version + '. Ya aparece en el catálogo de Umbral.');
    window.dispatchEvent(new Event('umbral:published'));
  }));
  window.umbral.onAdminProgress(event => status(event.message));
})();
