'use strict';
let state=null;
const $=(id)=>document.getElementById(id);
const notice=(t)=>{$('status').textContent=t};
const selected=()=>state.packs.find(p=>p.id===state.selectedId)||state.packs[0];
function show(view){document.querySelectorAll('.page').forEach(el=>el.classList.toggle('show',el.id===view));document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===view))}
function render(){
 const p=selected();$('currentName').textContent=p.name;$('name').value=p.name;$('manifest').value=p.manifestUrl||'';$('mc').value=p.mcVersion||'1.20.1';$('loader').value=p.loaderType||'forge';$('ram').value=p.memoryGB||6;
 $('packCards').replaceChildren();
 state.packs.forEach(pack=>{let b=document.createElement('button');b.textContent=pack.name;const small=document.createElement('small');small.textContent=pack.mcVersion+' · '+pack.loaderType;b.append(small);b.addEventListener('click',async()=>{state.selectedId=pack.id;await persist();render();show('home')});$('packCards').append(b)});
}
async function persist(){state=await window.umbral.save(state);}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
document.querySelectorAll('[data-win]').forEach(b=>b.addEventListener('click',()=>window.umbral.window(b.dataset.win)));
$('account').addEventListener('click',()=>notice('El inicio de sesión Microsoft todavía no está disponible en esta versión de prueba.'));
$('play').addEventListener('click',()=>notice('Minecraft aún no puede iniciarse desde esta versión. Primero debemos integrar y validar Microsoft y el motor del juego.'));
$('update').addEventListener('click',async()=>{try{notice('Comprobando y descargando...');await window.umbral.sync(selected().id);notice('Archivos sincronizados. El inicio de Minecraft aún requiere la siguiente fase.')}catch(e){notice('Error: '+e.message)}});
$('new').addEventListener('click',async()=>{state.packs.push({id:crypto.randomUUID(),name:'Nuevo modpack',manifestUrl:'',mcVersion:'1.20.1',loaderType:'forge',memoryGB:'6'});state.selectedId=state.packs.at(-1).id;await persist();render();show('packs')});
$('save').addEventListener('click',async()=>{try{Object.assign(selected(),{name:$('name').value,manifestUrl:$('manifest').value,mcVersion:$('mc').value,loaderType:$('loader').value,memoryGB:String($('ram').value)});await persist();render();notice('Cambios guardados.');show('home')}catch(e){alert(e.message)}});
$('saveSettings').addEventListener('click',async()=>{selected().memoryGB=String($('ram').value);try{await persist();alert('Ajustes guardados')}catch(e){alert(e.message)}});
$('folder').addEventListener('click',async()=>{try{await window.umbral.openFolder(selected().id)}catch(e){alert(e.message)}});
window.umbral.onProgress(p=>{if(p.message)notice(p.message);$('bar').style.width=(p.percent||0)+'%'});
window.umbral.settings().then(s=>{state=s;render()}).catch(e=>notice(e.message));