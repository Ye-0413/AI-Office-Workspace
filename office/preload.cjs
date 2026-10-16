'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('office:'+name,...args);
contextBridge.exposeInMainWorld('office',Object.freeze({
  getSnapshot:()=>invoke('snapshot'),
  onSnapshot:callback=>{if(typeof callback!=='function')throw new TypeError('Callback required');const listener=(_event,snapshot)=>callback(snapshot);ipcRenderer.on('office:snapshot',listener);return()=>ipcRenderer.removeListener('office:snapshot',listener);},
  getSettings:()=>invoke('settings'),setSettings:patch=>invoke('set-settings',patch),
  setMode:mode=>invoke('mode',mode),demoAction:action=>invoke('demo',action),
  connectProvider:provider=>invoke('connect',provider),
  disconnectProvider:provider=>invoke('disconnect',provider),
  listDisplays:()=>invoke('displays'),moveToDisplay:id=>invoke('move-display',id),
  openSource:id=>invoke('open-source',id),
}));
window.addEventListener('DOMContentLoaded',()=>ipcRenderer.send('office:preload-ready'),{once:true});
window.addEventListener('error',event=>ipcRenderer.send('office:renderer-error',String(event.message).slice(0,300)));
window.addEventListener('unhandledrejection',event=>ipcRenderer.send('office:renderer-error',String(event.reason?.message||event.reason).slice(0,300)));
