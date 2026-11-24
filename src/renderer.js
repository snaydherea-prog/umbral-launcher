'use strict';
let state=null,catalog=null,syncing=false,minecraftUser=null,guestName='';
const $=id=>document.getElementById(id);
const current=()=>state?.packs.find(p=>p.id===state.selectedId)||state?.packs[0];
const detail=()=>catalog?.modpacks.find(x=>x.id===current()?.remoteId);
function notice(message){$('status').textContent=message;$('notice').textContent=message}
function show(name){
 document.querySelectorAll('section.view').forEach(el=>el.classList.toggle('hidden',el.id!==name));
 document.querySelectorAll('.nav[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
}
function setAccount(){
 const avatar=$('avatar');avatar.replaceChildren();
 if(minecraftUser&&/^[0-9a-f]{32}$/i.test(minecraftUser.uuid)){
  const image=document.createElement('img');image.alt='Cabeza de la skin de '+minecraftUser.username;
  image.src='https://crafatar.com/avatars/'+minecraftUser.uuid+'?size=64&overlay';
  image.onerror=()=>{avatar.replaceChildren();avatar.textContent='U'};
  avatar.append(image);
  $('playerName').textContent=minecraftUser.username;
  $('accountType').textContent='Minecraft Java verificado';
  $('profileType').textContent='Prémium verificado';
  $('account').textContent='Cuenta conectada';
 }else if(guestName){
  avatar.textContent=guestName.slice(0,1).toUpperCase();
  $('playerName').textContent=guestName;$('accountType').textContent='Perfil local no verificado';
  $('profileType').textContent='Sin autenticar';$('account').textContent='Conectar Microsoft';
 }else{
  avatar.textContent='U';$('playerName').textContent='Sin iniciar sesión';
  $('accountType').textContent='No conectado';$('profileType').textContent='Sin verificar';
  $('account').textContent='Conectar Microsoft';
 }
}
function packCard(pack){
 const b=document.createElement('button');b.className='packcard'+(pack.id===state.selectedId?' selected':'');
 const symbol=document.createElement('div');symbol.className='newsicon';symbol.textContent='⬡';
 const title=document.createElement('strong');title.textContent=pack.name;
 const remote=catalog?.modpacks.find(x=>x.id===pack.remoteId);
 const extra=document.createElement('small');
 extra.textContent=(remote?.minecraftVersion||pack.mcVersion)+' · '+(remote?.loader||pack.loaderType)+' · '+(remote?.published?'Publicado':'Próximamente');
 b.append(symbol,title,extra);
 b.addEventListener('click',async()=>{
  state.selectedId=pack.id;
  try{await persist();render();show('home')}catch(e){notice('No se pudo seleccionar: '+e.message)}
 });
 return b;
}
function render(){
 const p=current();if(!p)return;const remote=detail();
 $('currentName').textContent=remote?.name||p.name;
 $('packCount').textContent=(catalog?.modpacks.length||state.packs.length)+' modpack(s)';
 $('packVersion').textContent=remote?.version||'Sin publicar';
 $('modsCount').textContent=Number.isInteger(remote?.modsCount)?String(remote.modsCount):'—';
 $('hoursPlayed').textContent='—';
 $('announcement').textContent=catalog?.announcement||'✧ Tu aventura comienza aquí';
 $('ram').value=p.memoryGB||6;
 $('offlineName').value=guestName;
 $('update').disabled=!remote?.published||!remote?.manifestUrl||syncing;
 $('repair').disabled=$('update').disabled;
 $('update').textContent=remote?.published?'↻ DESCARGAR / ACTUALIZAR':'Próximamente';
 for(const id of ['packCards','officialPacks']){
  const cards=$(id);cards.replaceChildren();
  state.packs.filter(x=>!!catalog?.modpacks.find(r=>r.id===x.remoteId)).forEach(x=>cards.append(packCard(x)));
 }
}
async function persist(){state=await window.umbral.save(state)}
async function updateCatalog(){
 const fresh=await window.umbral.catalog();catalog=fresh;
 // The GitHub catalog is the only authority for pack metadata. Players can change RAM.
 for(const pack of catalog.modpacks){
  let existing=state.packs.find(p=>p.remoteId===pack.id);
  if(!existing&&pack.id==='keo-rpg-optimized')existing=state.packs.find(p=>p.name==='KEO RPG Optimized'&&!p.remoteId);
  if(!existing){
   existing={id:crypto.randomUUID(),name:pack.name,remoteId:pack.id,mcVersion:pack.minecraftVersion||'1.21.1',loaderType:pack.loader||'neoforge',memoryGB:'6',manifestUrl:''};
   state.packs.push(existing);
  }
  existing.remoteId=pack.id;
  existing.name=pack.name;
  existing.mcVersion=pack.minecraftVersion||'1.21.1';
  existing.loaderType=pack.loader||'neoforge';
  existing.manifestUrl=''; // The main process always uses the URL from the administrator's catalog.
 }
 await persist();render();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
document.querySelectorAll('[data-win]').forEach(b=>b.addEventListener('click',()=>window.umbral.window(b.dataset.win)));
$('quit').addEventListener('click',()=>window.umbral.window('close'));
$('discord').addEventListener('click',()=>window.umbral.discord().catch(e=>notice('Discord: '+e.message)));
$('account').addEventListener('click',async()=>{
 if(minecraftUser){show('settings');notice('La cuenta está conectada. Puedes cerrar sesión desde Ajustes.');return}
 $('account').disabled=true;$('authDialog').classList.remove('hidden');
 $('authInstructions').textContent='Se abrirá el navegador oficial de Microsoft. Regresa al launcher cuando termines.';
 try{
  const profile=await window.umbral.login();minecraftUser=profile;guestName='';localStorage.removeItem('umbral-guest-name');
  setAccount();$('authDialog').classList.add('hidden');notice('Minecraft Java conectado: '+profile.username);
 }catch(e){$('authInstructions').textContent='No se pudo completar el inicio de sesión: '+e.message;notice('Microsoft: '+e.message)}
 finally{$('account').disabled=false}
});
$('closeAuthDialog').addEventListener('click',()=>$('authDialog').classList.add('hidden'));
$('copyAuthCode').addEventListener('click',()=>{});
$('logout').addEventListener('click',async()=>{await window.umbral.logout();minecraftUser=null;setAccount();notice('Sesión de Microsoft cerrada.')});
$('localProfile').addEventListener('click',()=>{
 const name=$('offlineName').value.trim();
 if(!/^[A-Za-z0-9_]{3,16}$/.test(name)){notice('Usa un nombre de 3 a 16 caracteres: letras, números o _.');return}
 guestName=name;localStorage.setItem('umbral-guest-name',name);
 if(minecraftUser)notice('La cuenta Microsoft verificada sigue activa. Cierra sesión primero para utilizar el perfil local.');
 else{setAccount();notice('Perfil local guardado. No es una cuenta de Minecraft verificada ni desbloquea el juego.')}
});
window.umbral.onAuth(event=>{
 if(event.type==='status')$('authInstructions').textContent=event.message;
 if(event.type==='profile'){minecraftUser=event.profile;setAccount()}
});
$('play').addEventListener('click',()=>notice('JUGAR todavía no está habilitado: faltan la instalación de Java, Minecraft y el motor de ejecución. No se ha iniciado ningún juego.'));
async function sync(){
 if(syncing)return;
 syncing=true;$('update').disabled=true;$('repair').disabled=true;
 try{
  notice('Comprobando integridad de los archivos...');
  const result=await window.umbral.sync(current().id);
  notice('Archivos verificados: '+result.files+'. Actualizados: '+result.downloaded+'.'+(result.retained?.length?' Hay '+result.retained.length+' archivos antiguos modificados que se conservaron.':'')+' La ejecución de Minecraft aún no está disponible.');
 }catch(e){notice('Error de sincronización: '+e.message)}
 finally{syncing=false;render()}
}
$('update').addEventListener('click',sync);
$('repair').addEventListener('click',sync);
$('refreshCatalog').addEventListener('click',()=>updateCatalog().then(()=>notice('Catálogo actualizado.')).catch(e=>notice(e.message)));
window.addEventListener('umbral:published',()=>updateCatalog().catch(e=>notice(e.message)));
$('saveSettings').addEventListener('click',async()=>{
 const ram=Number($('ram').value);
 if(!Number.isInteger(ram)||ram<2||ram>16){notice('Selecciona entre 2 y 16 GB de RAM.');return}
 current().memoryGB=String(ram);
 try{await persist();render();notice('RAM guardada para '+current().name+': '+ram+' GB. Se aplicará cuando terminemos el motor de juego.')}
 catch(e){notice('Error al guardar RAM: '+e.message)}
});
$('folder').addEventListener('click',()=>window.umbral.openFolder(current().id).catch(e=>notice(e.message)));
window.umbral.onProgress(p=>{if(p.message)notice(p.message);$('bar').style.width=Math.max(0,Math.min(100,Number(p.percent)||0))+'%'});
async function boot(){
 guestName=localStorage.getItem('umbral-guest-name')||'';
 state=await window.umbral.settings();
 try{await updateCatalog()}catch(e){notice('No se pudo consultar el catálogo: '+e.message);render()}
 try{const result=await window.umbral.profile();if(result?.profile)minecraftUser=result.profile}
 catch(e){notice('Error de cuenta: '+e.message)}
 setAccount();
}
boot().catch(e=>notice('Error de Umbral: '+e.message));
