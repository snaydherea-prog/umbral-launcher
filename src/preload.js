const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('umbral',{
  settings:()=>ipcRenderer.invoke('settings:get'),
  save:(x)=>ipcRenderer.invoke('settings:save',x),
  sync:(id)=>ipcRenderer.invoke('pack:sync',id),
  openFolder:(id)=>ipcRenderer.invoke('pack:folder',id),
  window:(action)=>ipcRenderer.invoke('win:action',action),
  onProgress:(fn)=>{const h=(_e,p)=>fn(p);ipcRenderer.on('pack:progress',h);return()=>ipcRenderer.removeListener('pack:progress',h)}
});