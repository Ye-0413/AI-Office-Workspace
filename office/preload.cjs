'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('office:'+name,...args);
contextBridge.exposeInMainWorld('office',Object.freeze({
  getSnapshot:()=>invoke('snapshot'),
  onSnapshot:callback=>{if(typeof callback!=='function')throw new TypeError('Callback required');const listener=(_event,snapshot)=>callback(snapshot);ipcRenderer.on('office:snapshot',listener);return()=>ipcRenderer.removeListener('office:snapshot',listener);},
  getSettings:()=>invoke('settings'),setSettings:patch=>invoke('set-settings',patch),
  connectProvider:provider=>invoke('connect',provider),
  disconnectProvider:provider=>invoke('disconnect',provider),
  listDisplays:()=>invoke('displays'),moveToDisplay:id=>invoke('move-display',id),
  openSource:id=>invoke('open-source',id),
  getUsageHistory:filters=>invoke('usage-history',filters),
  getUsageEvents:filters=>invoke('usage-events',filters),
  getUsageStatus:()=>invoke('usage-status'),
  getTokenUsage:filters=>invoke('token-usage',filters),
  refreshTokenUsage:()=>invoke('token-refresh'),
  answerAgentQuestion:input=>invoke('answer-question',input),
  returnQuestionToNative:id=>invoke('question-native',id),
  exportUsageHistory:filters=>invoke('usage-export',filters),
  openUsageFolder:()=>invoke('usage-open-folder'),
  getProviderSetup:()=>invoke('setup-status'),
  initializeProviders:options=>invoke('setup-initialize',options),
}));
window.addEventListener('DOMContentLoaded',()=>ipcRenderer.send('office:preload-ready'),{once:true});
window.addEventListener('error',event=>ipcRenderer.send('office:renderer-error',String(event.message).slice(0,300)));
window.addEventListener('unhandledrejection',event=>ipcRenderer.send('office:renderer-error',String(event.reason?.message||event.reason).slice(0,300)));
