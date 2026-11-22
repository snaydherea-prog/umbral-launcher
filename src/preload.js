const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('umbral',{
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