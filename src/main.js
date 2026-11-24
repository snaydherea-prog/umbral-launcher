'use strict';
const {app,BrowserWindow,ipcMain,shell,dialog}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const crypto=require('node:crypto');
const {jsonDownload,syncManifest}=require('./pack-sync');
const packImport=require('./pack-import');
const {resolveDraft}=require('./curseforge');
const {createPublisher}=require('./pack-publish');
const knownSources=require('./known-packs.json');
const distribution=require('./distribution.json');
const publisher=createPublisher();
const draftsRoot=()=>path.join(app.getPath('userData'),'admin','drafts');
const auth=require('./auth');
let win;let working=false;
const configFile=()=>path.join(app.getPath('userData'),'settings.json');
const instanceDir=(id)=>path.join(app.getPath('userData'),'instances',id);
const defaultPack=()=>({id:crypto.randomUUID(),name:'KEO RPG Optimized',mcVersion:'1.21.1',loaderType:'neoforge',memoryGB:'6',manifestUrl:'',remoteId:'keo-rpg-optimized'});
function getConfig(){
 let state=null;try{state=JSON.parse(fs.readFileSync(configFile(),'utf8'))}catch{}
 if(!state||!Array.isArray(state.packs))state={packs:[defaultPack()]};
 if(!state.packs.length)state.packs.push(defaultPack());
 if(!state.packs.some(p=>p.id===state.selectedId))state.selectedId=state.packs[0].id;
 return state;
}
function validateState(data){
 if(!data||!Array.isArray(data.packs)||data.packs.length>50||!data.packs.length)throw Error('Biblioteca inválida');
 const ids=new Set();
 for(const p of data.packs){
  if(!/^[0-9a-f-]{36}$/i.test(p.id)||ids.has(p.id))throw Error('ID de modpack inválido');ids.add(p.id);
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw Error('Nombre de modpack inválido');
  if(typeof p.mcVersion!=='string'||!/^[0-9a-zA-Z_.-]{1,40}$/.test(p.mcVersion))throw Error('Versión de Minecraft inválida');
  if(!['vanilla','forge','fabric','neoforge','quilt'].includes(p.loaderType))throw Error('Cargador de mods inválido');
  if(!/^(?:[2-9]|1[0-6])$/.test(String(p.memoryGB)))throw Error('RAM entre 2 y 16 GB');
  if(p.remoteId&&!/^[a-z0-9-]{2,80}$/.test(p.remoteId))throw Error('ID remoto inválido');
  if(p.manifestUrl){const url=new URL(p.manifestUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('URL de manifiesto HTTPS inválida')}
 }
 if(!ids.has(data.selectedId))throw Error('Selección de modpack inválida');
 return {selectedId:data.selectedId,packs:data.packs.map(p=>({id:p.id,name:p.name.trim(),manifestUrl:p.manifestUrl||'',mcVersion:p.mcVersion,loaderType:p.loaderType,memoryGB:String(p.memoryGB),remoteId:p.remoteId||''}))};
}
const emit=(message,percent)=>win?.webContents.send('pack:progress',{message,percent});
async function sync(id){
 const pack=getConfig().packs.find(p=>p.id===id);
 if(!pack)throw Error('Modpack no encontrado');
 const catalog=await getPublishedCatalog();
 const published=catalog.modpacks.find(x=>x.id===pack.remoteId&&x.published);
 if(!published?.manifestUrl)throw Error('Este modpack todavía no ha sido publicado por el administrador.');
 if(working)throw Error('Espera a que termine la operación actual.');
 working=true;
 try{
  emit('Leyendo manifiesto...',1);
  const manifest=await jsonDownload(published.manifestUrl,{sha256:published.manifestSha256||undefined});
  if(manifest.schemaVersion===2&&(manifest.id!==published.id||manifest.version!==published.version))throw Error('La versión del manifiesto no coincide con el catálogo.');
  return await syncManifest(instanceDir(pack.id),manifest,{onProgress:emit});
 }finally{working=false}
}
function handle(channel,callback){
 ipcMain.handle(channel,(event,...args)=>{
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Origen de solicitud no autorizado.');
  return callback(event,...args);
 });
}
function createWindow(){
 win=new BrowserWindow({width:1320,height:840,minWidth:1010,minHeight:700,frame:false,backgroundColor:'#0b1020',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.loadFile(path.join(__dirname,'index.html'));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
handle('settings:get',()=>getConfig());
handle('settings:save',(_event,data)=>{
 if(working)throw Error('Espera a que termine la descarga');
 const safe=validateState(data);fs.mkdirSync(path.dirname(configFile()),{recursive:true});fs.writeFileSync(configFile(),JSON.stringify(safe,null,2));return safe;
});
handle('pack:sync',(_event,id)=>sync(id));
handle('pack:folder',async(_event,id)=>{
 if(!getConfig().packs.some(p=>p.id===id))throw Error('Modpack desconocido');
 const folder=instanceDir(id);fs.mkdirSync(folder,{recursive:true});return shell.openPath(folder);
});
handle('win:action',(_event,action)=>{
 if(action==='minimize')win.minimize();else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize()}else if(action==='close')win.close();
});
// Los tokens quedan en safeStorage (cifrado local) y nunca se envían al renderer.
handle('auth:profile',async()=>{
 const profile=await auth.currentProfile();return profile?{profile}:null;
});
handle('auth:login',async()=>{
 const profile=await auth.login(event=>win?.webContents.send('auth:event',event));
 win?.webContents.send('auth:event',{type:'profile',profile});return profile;
});
handle('auth:logout',async()=>{auth.logout();return true});


const CATALOG_URL='https://raw.githubusercontent.com/snaydherea-prog/umbral-launcher/main/catalog/modpacks.json';
let catalogCache=null;
async function getPublishedCatalog(){
 const response=await fetch(CATALOG_URL,{headers:{'accept':'application/json','cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('No se pudo consultar el catálogo de Umbral: '+response.status);
 const data=await response.json();
 if(data.schemaVersion!==1||!Array.isArray(data.modpacks)||data.modpacks.length>100)throw Error('Formato de catálogo no válido');
 const mods=data.modpacks.map(x=>{
  if(typeof x.id!=='string'||!/^[a-z0-9-]{2,80}$/.test(x.id))throw Error('ID del catálogo inválido');
  if(typeof x.name!=='string'||x.name.length>100)throw Error('Nombre inválido');
  if(x.manifestUrl){const u=new URL(x.manifestUrl);if(u.protocol!=='https:')throw Error('URL del modpack no segura')}
  return {id:x.id,name:x.name,description:String(x.description||''),version:String(x.version||''),minecraftVersion:String(x.minecraftVersion||''),loader:String(x.loader||''),loaderVersion:String(x.loaderVersion||''),javaMajor:Number(x.javaMajor)||17,modsCount:Number.isInteger(x.modsCount)?x.modsCount:null,manifestUrl:x.manifestUrl||'',manifestSha256:/^[a-f0-9]{64}$/.test(x.manifestSha256||'')?x.manifestSha256:'',source:x.source||null,featured:!!x.featured,published:!!x.published,news:Array.isArray(x.news)?x.news.slice(0,4):[]};
 });
 catalogCache={announcement:String(data.announcement||''),discordUrl:'https://discord.gg/PFMEcJ3Hq4',modpacks:mods};
 return catalogCache;
}
handle('catalog:get',async()=>{
 try{return await getPublishedCatalog()}
 catch(error){if(catalogCache)return {...catalogCache,warning:'Usando catálogo en caché: '+error.message};throw error}
});

handle('discord:open',()=>shell.openExternal('https://discord.gg/PFMEcJ3Hq4'));

const adminEmit=message=>win?.webContents.send('admin:progress',{message});
async function adminWork(operation){
 if(working)throw Error('Espera a que termine la operación actual.');
 working=true;
 try{return await operation()}finally{working=false}
}
handle('admin:status',()=>({...publisher.status(),curseforgeEnabled:distribution.curseforgeApproved===true,drafts:packImport.listDrafts(draftsRoot())}));
handle('admin:connect',(_event,token)=>adminWork(()=>publisher.connect(token)));
handle('admin:disconnect',()=>{if(working)throw Error('Espera a que termine la publicación.');publisher.disconnect();return publisher.status()});
handle('admin:importZip',async()=>{
 if(working)throw Error('Espera a que termine la operación actual.');
 const selected=await dialog.showOpenDialog(win,{title:'Importar modpack de CurseForge',properties:['openFile'],filters:[{name:'Modpack ZIP',extensions:['zip']}]});
 if(selected.canceled)return null;
 return adminWork(()=>packImport.importCurseforge(selected.filePaths[0],draftsRoot(),{onProgress:adminEmit,knownSources}));
});
handle('admin:importFolder',async(_event,metadata)=>{
 if(working)throw Error('Espera a que termine la operación actual.');
 const selected=await dialog.showOpenDialog(win,{title:'Seleccionar carpeta del modpack preparado',properties:['openDirectory']});
 if(selected.canceled)return null;
 return adminWork(()=>packImport.importFolder(selected.filePaths[0],draftsRoot(),metadata,adminEmit));
});
handle('admin:resolve',(_event,{id,key})=>{
 if(distribution.curseforgeApproved!==true)throw Error('La integración con CurseForge está pendiente de autorización para Umbral.');
 return adminWork(()=>resolveDraft(draftsRoot(),id,key,{onProgress:adminEmit}));
});
handle('admin:publish',(_event,{id,fields})=>adminWork(async()=>{
 const result=await publisher.publish(draftsRoot(),id,fields,adminEmit);
 catalogCache=null;return result;
}));
handle('admin:openDraft',(_event,id)=>shell.openPath(path.join(packImport.location(draftsRoot(),id),'content')));
