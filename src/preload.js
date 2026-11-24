const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('umbral',{
  adminStatus:()=>ipcRenderer.invoke('admin:status'),
  adminConnect:token=>ipcRenderer.invoke('admin:connect',token),
  adminDisconnect:()=>ipcRenderer.invoke('admin:disconnect'),
  importZip:()=>ipcRenderer.invoke('admin:importZip'),
  importFolder:metadata=>ipcRenderer.invoke('admin:importFolder',metadata),
  resolveDraft:(id,key)=>ipcRenderer.invoke('admin:resolve',{id,key}),
  publishDraft:(id,fields)=>ipcRenderer.invoke('admin:publish',{id,fields}),
  openDraft:id=>ipcRenderer.invoke('admin:openDraft',id),
  onAdminProgress:fn=>{const h=(_e,p)=>fn(p);ipcRenderer.on('admin:progress',h);return()=>ipcRenderer.removeListener('admin:progress',h)},
  profile:()=>ipcRenderer.invoke('auth:profile'),
  login:(clientId)=>ipcRenderer.invoke('auth:login',clientId),
  logout:()=>ipcRenderer.invoke('auth:logout'),
  onAuth:(fn)=>{const h=(_e,p)=>fn(p);ipcRenderer.on('auth:event',h);return()=>ipcRenderer.removeListener('auth:event',h)},
  catalog:()=>ipcRenderer.invoke('catalog:get'),
  discord:()=>ipcRenderer.invoke('discord:open'),
  settings:()=>ipcRenderer.invoke('settings:get'),
  save:(x)=>ipcRenderer.invoke('settings:save',x),
  sync:(id)=>ipcRenderer.invoke('pack:sync',id),
  openFolder:(id)=>ipcRenderer.invoke('pack:folder',id),
  window:(action)=>ipcRenderer.invoke('win:action',action),
  onProgress:(fn)=>{const h=(_e,p)=>fn(p);ipcRenderer.on('pack:progress',h);return()=>ipcRenderer.removeListener('pack:progress',h)}
});
