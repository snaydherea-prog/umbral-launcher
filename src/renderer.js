'use strict';
let state=null, syncing=false;
const $=id=>document.getElementById(id);
const current=()=>state?.packs.find(p=>p.id===state.selectedId)||state?.packs[0];
const notice=text=>{$('status').textContent=text;$('notice').textContent=text};
function show(name){
 document.querySelectorAll('section.view').forEach(el=>el.classList.toggle('hidden',el.id!==name));
 document.querySelectorAll('button.nav[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
}
function render(){
 const p=current();if(!p)return;
 $('currentName').textContent=p.name;$('packCount').textContent=state.packs.length+' modpack(s)';
 $('name').value=p.name;$('mc').value=p.mcVersion;$('loader').value=p.loaderType;
 $('manifest').value=p.manifestUrl||'';$('ram').value=p.memoryGB||6;$('ramPack').value=p.memoryGB||6;
 const cards=$('packCards');cards.replaceChildren();
 for(const pack of state.packs){
  const b=document.createElement('button');b.className='packcard'+(pack.id===state.selectedId?' selected':'');
  const symbol=document.createElement('div');symbol.className='newsicon';symbol.textContent='⬡';
  const title=document.createElement('strong');title.textContent=pack.name;
  const extra=document.createElement('small');extra.textContent=pack.mcVersion+' · '+pack.loaderType+(pack.manifestUrl?' · Sincronizable':' · Sin configurar');
  b.append(symbol,title,extra);b.addEventListener('click',async()=>{
   state.selectedId=pack.id;try{await persist();render();show('home')}catch(e){notice('Error: '+e.message)}
  });cards.append(b);
 }
}
async function persist(){state=await window.umbral.save(state);}
function capture(){
 const p=current();p.name=$('name').value.trim();p.mcVersion=$('mc').value.trim();
 p.loaderType=$('loader').value;p.manifestUrl=$('manifest').value.trim();
 p.memoryGB=String($('ramPack').value);
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
document.querySelectorAll('[data-win]').forEach(b=>b.addEventListener('click',()=>window.umbral.window(b.dataset.win)));
$('quit').addEventListener('click',()=>window.umbral.window('close'));
let minecraftUser=null;
function showProfile(profile){
 minecraftUser=profile||null;
 const avatar=$('avatar');avatar.replaceChildren();
 if(profile&&/^[0-9a-f]{32}$/i.test(profile.uuid)){
  const image=document.createElement('img');
  image.alt='Cabeza de skin de '+profile.username;
  image.src='https://crafatar.com/avatars/'+profile.uuid+'?size=64&overlay';
  image.onerror=()=>{avatar.replaceChildren();avatar.textContent='U'};
  avatar.append(image);
  $('playerName').textContent=profile.username;
  $('account').textContent='Conectado';
 }else{
  avatar.textContent='U';$('playerName').textContent='Sin iniciar sesión';$('account').textContent='Conectar Microsoft';
 }
}
$('account').addEventListener('click',async()=>{
 if(minecraftUser){show('settings');notice('La cuenta está conectada. Puedes cerrar sesión desde Ajustes.');return}
 const clientId=$('microsoftClientId').value.trim();
 if(!/^[a-f0-9-]{36}$/i.test(clientId)){show('settings');notice('Introduce primero el Client ID de tu aplicación Microsoft aprobada.');return}
 $('account').disabled=true;$('authCode').textContent='';$('authDialog').classList.remove('hidden');
 $('authInstructions').textContent='Abriendo Microsoft en el navegador. Copia el código cuando aparezca.';
 try{
  const profile=await window.umbral.login(clientId);showProfile(profile);
  $('authDialog').classList.add('hidden');notice('Conectado como '+profile.username);
 }catch(e){$('authInstructions').textContent='Error: '+e.message;notice('Error de Microsoft: '+e.message)}
 finally{$('account').disabled=false}
});
$('closeAuthDialog').addEventListener('click',()=>$('authDialog').classList.add('hidden'));
$('copyAuthCode').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('authCode').textContent);notice('Código copiado al portapapeles')}
 catch{notice('Selecciona el código mostrado y cópialo manualmente')}
});
$('logout').addEventListener('click',async()=>{await window.umbral.logout();showProfile(null);notice('Sesión de Minecraft cerrada')});
window.umbral.onAuth(event=>{
 if(event.type==='code'){$('authDialog').classList.remove('hidden');$('authCode').textContent=event.code;$('authInstructions').textContent='Introduce este código en la página oficial de Microsoft que se ha abierto.'}
 if(event.type==='status'){$('authInstructions').textContent=event.message}
 if(event.type==='profile')showProfile(event.profile);
});
$('play').addEventListener('click',()=>notice('El inicio de Minecraft está pendiente: primero hay que validar Microsoft y el motor del juego.'));
$('update').addEventListener('click',async()=>{
 if(syncing)return;syncing=true;$('update').disabled=true;
 try{notice('Comprobando archivos del modpack...');await window.umbral.sync(current().id);notice('Actualización completada. Inicio de Minecraft aún pendiente.')}
 catch(e){notice('Error: '+e.message)}finally{syncing=false;$('update').disabled=false}
});
$('save').addEventListener('click',async()=>{
 try{capture();await persist();render();show('home');notice('Configuración guardada.')}
 catch(e){notice('Error: '+e.message)}
});
async function newPack(){
 state.packs.push({id:crypto.randomUUID(),name:'Nuevo modpack',manifestUrl:'',mcVersion:'1.20.1',loaderType:'forge',memoryGB:'6'});
 state.selectedId=state.packs.at(-1).id;await persist();render();show('packs');
}
$('new').addEventListener('click',()=>newPack().catch(e=>notice('Error: '+e.message)));
$('libraryNew').addEventListener('click',()=>newPack().catch(e=>notice('Error: '+e.message)));
$('folder').addEventListener('click',()=>window.umbral.openFolder(current().id).catch(e=>notice('Error: '+e.message)));
$('saveSettings').addEventListener('click',async()=>{
 current().memoryGB=String($('ram').value);
 try{await persist();render();notice('Ajustes guardados.')}catch(e){notice('Error: '+e.message)}
});
window.umbral.onProgress(p=>{
 if(p.message)notice(p.message);
 $('bar').style.width=Math.max(0,Math.min(100,Number(p.percent)||0))+'%';
});
$('microsoftClientId').value=localStorage.getItem('umbral-microsoft-client-id')||'';
$('microsoftClientId').addEventListener('change',()=>localStorage.setItem('umbral-microsoft-client-id',$('microsoftClientId').value.trim()));
window.umbral.profile().then(result=>{
 if(result){showProfile(result.profile);$('microsoftClientId').value=result.clientId||$('microsoftClientId').value}
}).catch(e=>notice('No se pudo cargar la cuenta: '+e.message));
window.umbral.settings().then(s=>{state=s;render();notice('Umbral preparado. Selecciona un modpack.');}).catch(e=>notice('Error: '+e.message));