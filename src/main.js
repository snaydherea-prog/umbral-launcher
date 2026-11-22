'use strict';
const {app,BrowserWindow,ipcMain,shell}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const os=require('node:os');const crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');const {Readable}=require('node:stream');
const auth=require('./auth');
let win;let working=false;
const configFile=()=>path.join(app.getPath('userData'),'settings.json');
const instanceDir=(id)=>path.join(app.getPath('userData'),'instances',id);
const defaultPack=()=>({id:crypto.randomUUID(),name:'KEO RPG Optimized',mcVersion:'1.20.1',loaderType:'forge',memoryGB:'6',manifestUrl:'',remoteId:'keo-rpg-optimized'});
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
const hashFile=async f=>{const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(f))h.update(chunk);return h.digest('hex')};
const safeRelative=(s)=>{if(typeof s!=='string'||s.includes('\\')||s.startsWith('/')||s.includes('\0')||s.split('/').some(x=>!x||x==='.'||x==='..'||x.includes(':')))throw Error('Ruta no permitida: '+s);return s};
async function downloadJson(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Error HTTP '+response.status+' al obtener manifiesto');
 return response.json();
}
async function sync(id){
 const pack=getConfig().packs.find(p=>p.id===id);
 if(!pack)throw Error('Modpack no encontrado');
 const catalog=await getPublishedCatalog();
 const published=catalog.modpacks.find(x=>x.id===pack.remoteId&&x.published);
 if(!published||!published.manifestUrl)throw Error('Este modpack todavía no ha sido publicado por el administrador de Umbral.');
 const manifestUrl=published.manifestUrl;
 if(working)throw Error('Ya hay una descarga en curso');
 working=true;
 try{
  emit('Leyendo manifiesto...',1);
  const manifest=await downloadJson(manifestUrl);
  if(!manifest||!Array.isArray(manifest.files)||manifest.files.length>2000)throw Error('Manifiesto inválido');
  const root=instanceDir(pack.id);
  fs.mkdirSync(root,{recursive:true});
  for(let i=0;i<manifest.files.length;i++){
   const file=manifest.files[i];const relative=safeRelative(file.path);
   const u=new URL(file.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Descarga insegura');
   if(!/^[a-f0-9]{64}$/i.test(file.sha256))throw Error('SHA256 inválido para '+relative);
   const output=path.join(root,...relative.split('/'));
   if(fs.existsSync(output)&&await hashFile(output)===file.sha256.toLowerCase()){emit('Verificado: '+relative,Math.round((i+1)/manifest.files.length*100));continue}
   fs.mkdirSync(path.dirname(output),{recursive:true});
   const temporary=output+'.tmp-'+crypto.randomUUID();
   try{
    const response=await fetch(u,{signal:AbortSignal.timeout(180000)});
    if(!response.ok||!response.body)throw Error('Error descargando '+relative+': HTTP '+response.status);
    await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(temporary,{flags:'wx'}));
    if(await hashFile(temporary)!==file.sha256.toLowerCase())throw Error('El hash no coincide: '+relative);
    fs.renameSync(temporary,output);
   }finally{try{fs.unlinkSync(temporary)}catch{}}
   emit('Descargado: '+relative,Math.round((i+1)/manifest.files.length*100));
  }
  // Only files previously downloaded and tracked by Umbral may be removed.
  // Never touch user worlds, screenshots, account data or unrelated files.
  const ledgerPath=path.join(root,'.umbral-managed.json');
  let prior=[];
  try{const data=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));if(Array.isArray(data.files))prior=data.files}catch{}
  const managed=new Set(manifest.files.map(f=>safeRelative(f.path)));
  for(const old of prior){
   try{
    const name=safeRelative(old.path);
    if(managed.has(name)||!/^[a-f0-9]{64}$/i.test(old.sha256))continue;
    if(!['mods','config','defaultconfigs','resourcepacks','shaderpacks','kubejs'].includes(name.split('/')[0]))continue;
    const destination=path.join(root,...name.split('/'));
    if(fs.existsSync(destination)&&fs.lstatSync(destination).isFile()&&await hashFile(destination)===old.sha256.toLowerCase()){
     fs.unlinkSync(destination);
     emit('Retirado archivo obsoleto: '+name,100);
    }
   }catch{} // Preserve files on errors, rather than deleting uncertain content.
  }
  fs.writeFileSync(ledgerPath,JSON.stringify({version:String(manifest.version||''),files:manifest.files.map(f=>({path:f.path,sha256:f.sha256.toLowerCase()}))},null,2));
  emit('Sincronización terminada',100);return {ok:true,files:manifest.files.length};
 }finally{working=false}
}
function createWindow(){
 win=new BrowserWindow({width:1320,height:840,minWidth:1010,minHeight:700,frame:false,backgroundColor:'#0b1020',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.loadFile(path.join(__dirname,'index.html'));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('settings:get',()=>getConfig());
ipcMain.handle('settings:save',(_event,data)=>{
 if(working)throw Error('Espera a que termine la descarga');
 const safe=validateState(data);fs.mkdirSync(path.dirname(configFile()),{recursive:true});fs.writeFileSync(configFile(),JSON.stringify(safe,null,2));return safe;
});
ipcMain.handle('pack:sync',(_event,id)=>sync(id));
ipcMain.handle('pack:folder',async(_event,id)=>{
 if(!getConfig().packs.some(p=>p.id===id))throw Error('Modpack desconocido');
 const folder=instanceDir(id);fs.mkdirSync(folder,{recursive:true});return shell.openPath(folder);
});
ipcMain.handle('win:action',(_event,action)=>{
 if(action==='minimize')win.minimize();else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize()}else if(action==='close')win.close();
});
// Los tokens quedan en safeStorage (cifrado local) y nunca se envían al renderer.
ipcMain.handle('auth:profile',async()=>{
 const profile=await auth.currentProfile();return profile?{profile}:null;
});
ipcMain.handle('auth:login',async()=>{
 const profile=await auth.login(event=>win?.webContents.send('auth:event',event));
 win?.webContents.send('auth:event',{type:'profile',profile});return profile;
});
ipcMain.handle('auth:logout',async()=>{auth.logout();return true});


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
  return {id:x.id,name:x.name,description:String(x.description||''),version:String(x.version||''),minecraftVersion:String(x.minecraftVersion||''),loader:String(x.loader||''),loaderVersion:String(x.loaderVersion||''),javaMajor:Number(x.javaMajor)||17,modsCount:Number.isInteger(x.modsCount)?x.modsCount:null,manifestUrl:x.manifestUrl||'',featured:!!x.featured,published:!!x.published,news:Array.isArray(x.news)?x.news.slice(0,4):[]};
 });
 catalogCache={announcement:String(data.announcement||''),discordUrl:'https://discord.gg/PFMEcJ3Hq4',modpacks:mods};
 return catalogCache;
}
ipcMain.handle('catalog:get',async()=>{
 try{return await getPublishedCatalog()}
 catch(error){if(catalogCache)return {...catalogCache,warning:'Usando catálogo en caché: '+error.message};throw error}
});

ipcMain.handle('discord:open',()=>shell.openExternal('https://discord.gg/PFMEcJ3Hq4'));
