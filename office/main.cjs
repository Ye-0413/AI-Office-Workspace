'use strict';
const {app,BrowserWindow,ipcMain,Menu,screen,shell,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {createSettings}=require('./lib/settings.cjs');
const {createSessionStore}=require('./lib/session-store.cjs');
const {createActivityStats}=require('./lib/activity-stats.cjs');
const {createUsageLog}=require('./lib/usage-log.cjs');
const {createUsageApi}=require('./lib/usage-api.cjs');
const {createSessionUsageStore}=require('./lib/session-usage-store.cjs');
const {createSessionUsageMonitor}=require('./lib/session-usage-monitor.cjs');
const {createManualQuestions}=require('./lib/manual-questions.cjs');
const {createAdditionalSessionMonitor}=require('./lib/additional-session-monitor.cjs');
const {createSetupManager}=require('./lib/setup-manager.cjs');
const {createCodexMonitor}=require('./lib/codex-monitor.cjs');
const {mergeObservationHealth}=require('./lib/observation-health.cjs');
const {createObserverBridge}=require('./lib/observer-bridge.cjs');
const {getProvider}=require('./lib/provider-catalog.cjs');
const {withNativeLock}=require('./lib/native-lock.cjs');
const {createWindowVisibility}=require('./lib/window-visibility.cjs');

// Keep the legacy profile and single-instance lock when branding changes.
// Electron caches userData, so setName alone cannot preserve this path.
app.setName('AI Work Space');
const dataDir=process.env.MINI_OFFICE_DATA_DIR?path.resolve(process.env.MINI_OFFICE_DATA_DIR):path.join(app.getPath('appData'),'AI Mini Office');
fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
app.setPath('userData',dataDir);
if(!app.requestSingleInstanceLock()){app.quit();}
else {
let win=null,windowVisibility=null,settings,liveStore,activityStats,usageLog,usageApi,tokenStore,tokenMonitor,additionalMonitor,manualQuestions,setupManager,monitor,bridge,pruneTimer=null,refreshTimer=null,ready=false,providerMutation=false;
const rendererErrors=[];
function current(){
  const liveSessions=liveStore.snapshot();
  const monitorStatus=monitor.status(),extraStatus=additionalMonitor.status(),connections=bridge.getConnections().map(c=>mergeObservationHealth(c,c.provider==='codex'?monitorStatus:extraStatus,liveSessions));
  const tokenStatus=combinedTokenStatus(),tokenUsage={...tokenStore.summary(),importing:tokenStatus.importing,lastScanAt:tokenStatus.lastScanAt,providers:tokenStatus.providers,...(tokenStatus.error?{error:tokenStatus.error}:{})};
  return{mode:'live',now:Date.now(),windowVisibility:windowVisibility?.snapshot()||{available:false,hidden:null},sessions:liveSessions,activityStats:activityStats.snapshot(),usageLog:usageLog.status(),tokenUsage,questions:manualQuestions.snapshot(),questionStatus:manualQuestions.status(),setup:setupManager.snapshot(),connections,monitor:{running:monitorStatus.running,error:monitorStatus.error||null},version:app.getVersion(),packaged:app.isPackaged};
}
function combinedTokenStatus(){const basic=tokenMonitor.status(),extra=additionalMonitor.status(),error=[basic.error,extra.error].filter(Boolean).join('; ');return{...basic,providers:[...new Set([...basic.providers,...extra.providers])],sources:extra.sources,bytesRead:basic.bytesRead+extra.bytesRead,lastScanAt:Math.max(basic.lastScanAt||0,extra.lastScanAt||0)||null,importing:basic.completedScans===0||extra.completedScans===0||basic.pendingFiles>0||extra.pendingFiles>0,...(error?{error}:{})};}
function broadcast(){if(win&&!win.isDestroyed()&&ready)win.webContents.send('office:snapshot',current());}
function observe(event){return liveStore.ingest(event);}
function applySettings(){if(win&&!win.isDestroyed()){win.setAlwaysOnTop(settings.get().alwaysOnTop);win.setTitle('AI Work Space');refreshMenu();}}
function refreshMenu(){const en=settings.get().language==='en';const label=(zh,english)=>en?english:zh;Menu.setApplicationMenu(Menu.buildFromTemplate([{label:app.name,submenu:[{role:'about'},{type:'separator'},{label:label('显示办公室','Show studio'),click:()=>win.show()},{type:'separator'},{role:'quit'}]},{label:label('编辑','Edit'),submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:label('显示','View'),submenu:[{role:'togglefullscreen'},{role:'minimize'},{role:'zoom'}]}]));}
function moveToDisplay(id){const display=screen.getAllDisplays().find(d=>d.id===id);if(!display)throw new Error('显示器已断开');const area=display.workArea;win.setFullScreen(false);win.setBounds({x:area.x,y:area.y,width:Math.min(1280,area.width),height:Math.min(720,area.height)});settings.set({displayId:id});win.show();return{id:display.id};}
function bind(name,handler){ipcMain.handle('office:'+name,(event,...args)=>{if(!win||event.sender!==win.webContents)throw new Error('Unexpected IPC sender');return handler(...args);});}
async function writeSmokeReport(){
  const out=process.env.MINI_OFFICE_SMOKE_REPORT;
  if(!out)return;
  const report={at:new Date().toISOString(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,version:app.getVersion(),preloadReady:ready,rendererErrors,activityStats:activityStats.snapshot(),usageLog:usageLog.status(),sessions:liveStore.snapshot().map(s=>({id:s.id,parentId:s.parentId,provider:s.provider,activity:s.activity,status:s.status,child:!!s.parentId})),assetChecks:{room:fs.existsSync(path.join(__dirname,'assets','office-room.jpg')),icon:fs.existsSync(path.join(__dirname,'assets','studio-icon.png')),workshop:Object.fromEntries(require('./lib/public-artwork.js').ASSETS.map(asset=>[asset,fs.existsSync(path.join(__dirname,'assets','avatars',asset))]))},monitor:monitor.status()};
  if(win&&!win.isDestroyed()&&ready){
    try{report.scene=await win.webContents.executeJavaScript("({actors:[...document.querySelectorAll('.actor')].map(node=>({id:node.dataset.sessionId,helper:node.dataset.helper==='true',phase:node.dataset.phase,walking:node.dataset.walking==='true',visible:getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>0})),quiet:document.getElementById('office').dataset.quiet==='true',mode:document.getElementById('office').dataset.mode,project:document.getElementById('project-select').value,providerRows:document.querySelectorAll('.provider-row').length})");}
    catch(error){report.sceneError=String(error.message).slice(0,200);}
  }
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async()=>{
  settings=createSettings(app.getPath('userData'));
  activityStats=createActivityStats({dataDir:app.getPath('userData')});
  usageLog=createUsageLog({dataDir:app.getPath('userData'),staleMs:180000});
  tokenStore=createSessionUsageStore({dataDir:app.getPath('userData')});
  tokenMonitor=createSessionUsageMonitor({store:tokenStore});
  manualQuestions=createManualQuestions({dataDir:app.getPath('userData'),onChange:broadcast});
  usageApi=createUsageApi({log:usageLog,openFolder:folder=>shell.openPath(folder),chooseExport:defaultPath=>dialog.showSaveDialog(win,{title:settings.get().language==='en'?'Export observed Agent usage':'导出已观测 Agent 使用记录',defaultPath,filters:[{name:'CSV',extensions:['csv']}],properties:['createDirectory','showOverwriteConfirmation']})});
  liveStore=createSessionStore({staleMs:180000});
  additionalMonitor=createAdditionalSessionMonitor({store:tokenStore,onEvent:observe});
  liveStore.onAccepted(event=>{activityStats.record(event);usageLog.record(event,liveStore.snapshot());});
  monitor=createCodexMonitor({onEvent:observe});
  bridge=createObserverBridge({dataDir:app.getPath('userData'),appRoot:__dirname,electronPath:process.execPath,withNativeLock,onEvent:observe});
  setupManager=createSetupManager({getConnections:()=>bridge.getConnections(),connect:provider=>bridge.connect(provider),onChange:broadcast});
  liveStore.onChange(()=>broadcast());
  win=new BrowserWindow({width:1280,height:720,minWidth:800,minHeight:450,title:'AI Work Space',backgroundColor:'#251d17',titleBarStyle:'hiddenInset',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  windowVisibility=createWindowVisibility({window:win,watch:true,getAppHidden:()=>process.platform==='darwin'?app.isHidden():false,onChange:()=>broadcast()});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('render-process-gone',(_event,details)=>{rendererErrors.push('renderer:'+details.reason);writeSmokeReport();});
  ipcMain.on('office:preload-ready',event=>{if(event.sender!==win.webContents)return;ready=true;broadcast();setTimeout(writeSmokeReport,1500);});
  ipcMain.on('office:renderer-error',(event,message)=>{if(event.sender===win.webContents){rendererErrors.push(String(message).slice(0,300));writeSmokeReport();}});
  bind('snapshot',current);bind('settings',()=>settings.get());
  bind('usage-history',filters=>usageApi.history(filters));
  bind('usage-events',filters=>usageApi.events(filters));
  bind('usage-status',()=>usageApi.status());
  bind('usage-export',filters=>usageApi.export(filters));
  bind('usage-open-folder',()=>usageApi.openFolder());
  bind('token-usage',filters=>({...tokenStore.query(filters),status:combinedTokenStatus()}));
  bind('token-refresh',async()=>{await Promise.all([tokenMonitor.refresh(),additionalMonitor.refresh()]);return combinedTokenStatus();});
  bind('answer-question',input=>manualQuestions.submit(input));
  bind('question-native',id=>manualQuestions.native(id));
  bind('setup-status',()=>setupManager.snapshot());
  bind('setup-initialize',options=>{if(providerMutation)throw new Error('A provider configuration change is already running');return setupManager.run(options);});
  bind('set-settings',patch=>{const next=settings.set(patch);applySettings();return next;});
  async function configureProvider(provider,remove){if(!getProvider(provider))throw new Error('Unknown provider');if(setupManager.running||providerMutation)throw new Error('A provider configuration change is already running');providerMutation=true;try{return await bridge[remove?'disconnect':'connect'](provider);}finally{providerMutation=false;broadcast();}}
  bind('connect',provider=>configureProvider(provider,false));
  bind('disconnect',provider=>configureProvider(provider,true));
  bind('displays',()=>screen.getAllDisplays().map(d=>({id:d.id,label:d.label||`${d.size.width}×${d.size.height}`,width:d.size.width,height:d.size.height,primary:d.id===screen.getPrimaryDisplay().id})));
  bind('move-display',id=>{if(!Number.isInteger(id))throw new Error('Invalid display');return moveToDisplay(id);});
  bind('open-source',async id=>{if(typeof id!=='string'||id.length>512)throw new Error('Invalid session');const session=liveStore.snapshot().find(s=>s.id===id);if(!session||!path.isAbsolute(session.projectPath||''))throw new Error('该会话没有可打开的本地项目');const stat=await fs.promises.stat(session.projectPath);if(!stat.isDirectory())throw new Error('项目目录不存在');const error=await shell.openPath(session.projectPath);if(error)throw new Error(error);return{opened:true};});
  applySettings();bridge.start();monitor.start();tokenMonitor.start();additionalMonitor.start();await manualQuestions.start();
  const displayId=settings.get().displayId;if(displayId!==null&&screen.getAllDisplays().some(d=>d.id===displayId))moveToDisplay(displayId);
  win.loadFile(path.join(__dirname,'renderer','index.html')).catch(error=>{rendererErrors.push(error.message);writeSmokeReport();});
  if(process.env.MINI_OFFICE_SMOKE_REPORT&&process.env.MINI_OFFICE_SMOKE_EXIT_MS){const delay=Number(process.env.MINI_OFFICE_SMOKE_EXIT_MS);if(Number.isFinite(delay)&&delay>=3000&&delay<=30000)setTimeout(async()=>{await writeSmokeReport();app.quit();},delay);}
  pruneTimer=setInterval(()=>{liveStore.prune();usageLog.reconcile(liveStore.snapshot());broadcast();},5000);
  refreshTimer=setInterval(()=>broadcast(),2000);
  win.on('closed',()=>{windowVisibility?.dispose();win=null;});
}).catch(error=>{console.error('[AI Work Space]',error);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{ready=false;windowVisibility?.dispose();if(pruneTimer)clearInterval(pruneTimer);if(refreshTimer)clearInterval(refreshTimer);monitor?.stop();tokenMonitor?.stop();additionalMonitor?.stop();tokenStore?.close();manualQuestions?.stop();bridge?.stop();usageLog?.close();activityStats?.close();});
}
