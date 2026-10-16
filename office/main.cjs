'use strict';
const {app,BrowserWindow,ipcMain,Menu,screen,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {createSettings}=require('./lib/settings.cjs');
const {createSessionStore}=require('./lib/session-store.cjs');
const {createCodexMonitor}=require('./lib/codex-monitor.cjs');
const {createObserverBridge}=require('./lib/observer-bridge.cjs');
const {createDemo}=require('./lib/demo.cjs');
const {getProvider}=require('./lib/provider-catalog.cjs');
const {withNativeLock}=require('./lib/native-lock.cjs');

app.setName('AI Mini Office');
if(process.env.MINI_OFFICE_DATA_DIR){fs.mkdirSync(process.env.MINI_OFFICE_DATA_DIR,{recursive:true,mode:0o700});app.setPath('userData',path.resolve(process.env.MINI_OFFICE_DATA_DIR));}
if(!app.requestSingleInstanceLock()){app.quit();}
else {
let win=null,settings,liveStore,monitor,bridge,demo,pruneTimer=null,refreshTimer=null,mode='live',ready=false;
const rendererErrors=[];
function current(){
  const liveSessions=liveStore.snapshot(),sessions=mode==='demo'?demo.snapshot().sessions:liveSessions;
  const monitorStatus=monitor.status(),connections=bridge.getConnections().map(c=>c.provider==='codex'?{...c,watching:c.watching||monitorStatus.running,lastEventAt:Math.max(c.lastEventAt||0,...liveSessions.filter(s=>s.provider==='codex').map(s=>s.lastEventAt||0)),detail:c.detail+(monitorStatus.running?' · 本地 rollout 只读观察中':'')}:c);
  return{mode,now:Date.now(),sessions,connections,demo:demo.snapshot().demo,monitor:{running:monitorStatus.running,error:monitorStatus.error||null},version:app.getVersion(),packaged:app.isPackaged};
}
function broadcast(){if(win&&!win.isDestroyed()&&ready)win.webContents.send('office:snapshot',current());}
function applySettings(){if(win&&!win.isDestroyed()){win.setAlwaysOnTop(settings.get().alwaysOnTop);win.setTitle(settings.get().language==='en'?'Little Studio':'小小工作室');refreshMenu();}}
function refreshMenu(){const en=settings.get().language==='en';const label=(zh,english)=>en?english:zh;Menu.setApplicationMenu(Menu.buildFromTemplate([{label:app.name,submenu:[{role:'about'},{type:'separator'},{label:label('显示办公室','Show studio'),click:()=>win.show()},{label:label('进入演示','Enter demo'),click:()=>{mode='demo';demo.action('play');broadcast();}},{label:label('观察真实任务','Observe live tasks'),click:()=>{mode='live';demo.action('pause');broadcast();}},{type:'separator'},{role:'quit'}]},{label:label('编辑','Edit'),submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:label('显示','View'),submenu:[{role:'togglefullscreen'},{role:'minimize'},{role:'zoom'}]}]));}
function moveToDisplay(id){const display=screen.getAllDisplays().find(d=>d.id===id);if(!display)throw new Error('显示器已断开');const area=display.workArea;win.setFullScreen(false);win.setBounds({x:area.x,y:area.y,width:Math.min(1280,area.width),height:Math.min(720,area.height)});settings.set({displayId:id});win.show();return{id:display.id};}
function bind(name,handler){ipcMain.handle('office:'+name,(event,...args)=>{if(!win||event.sender!==win.webContents)throw new Error('Unexpected IPC sender');return handler(...args);});}
async function writeSmokeReport(){
  const out=process.env.MINI_OFFICE_SMOKE_REPORT;
  if(!out)return;
  const report={at:new Date().toISOString(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,version:app.getVersion(),preloadReady:ready,rendererErrors,sessions:liveStore.snapshot().map(s=>({id:s.id,parentId:s.parentId,provider:s.provider,activity:s.activity,status:s.status,child:!!s.parentId})),assetChecks:{room:fs.existsSync(path.join(__dirname,'assets','office-room.jpg')),typing:fs.existsSync(path.join(__dirname,'assets','avatars','clawd-working-typing.svg'))},monitor:monitor.status()};
  if(win&&!win.isDestroyed()&&ready){
    try{report.scene=await win.webContents.executeJavaScript("({actors:[...document.querySelectorAll('.actor')].map(node=>({id:node.dataset.sessionId,helper:node.dataset.helper==='true',phase:node.dataset.phase,walking:node.dataset.walking==='true'})),quiet:document.getElementById('office').dataset.quiet==='true',mode:document.getElementById('office').dataset.mode,project:document.getElementById('project-select').value,providerRows:document.querySelectorAll('.provider-row').length})");}
    catch(error){report.sceneError=String(error.message).slice(0,200);}
  }
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(()=>{
  settings=createSettings(app.getPath('userData'));
  liveStore=createSessionStore({staleMs:180000});
  monitor=createCodexMonitor({onEvent:event=>liveStore.ingest(event)});
  bridge=createObserverBridge({dataDir:app.getPath('userData'),appRoot:__dirname,electronPath:process.execPath,withNativeLock,onEvent:event=>liveStore.ingest(event)});
  demo=createDemo({onChange:()=>{if(demo&&mode==='demo')broadcast();}});
  liveStore.onChange(()=>broadcast());
  win=new BrowserWindow({width:1280,height:720,minWidth:800,minHeight:450,title:'AI Mini Office',backgroundColor:'#251d17',titleBarStyle:'hiddenInset',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('render-process-gone',(_event,details)=>{rendererErrors.push('renderer:'+details.reason);writeSmokeReport();});
  ipcMain.on('office:preload-ready',event=>{if(event.sender!==win.webContents)return;ready=true;broadcast();setTimeout(writeSmokeReport,1500);});
  ipcMain.on('office:renderer-error',(event,message)=>{if(event.sender===win.webContents){rendererErrors.push(String(message).slice(0,300));writeSmokeReport();}});
  bind('snapshot',current);bind('settings',()=>settings.get());
  bind('set-settings',patch=>{const next=settings.set(patch);applySettings();return next;});
  bind('mode',value=>{if(!['live','demo'].includes(value))throw new Error('Invalid mode');if(value==='live')demo.action('pause');mode=value;if(value==='demo')demo.action('play');broadcast();return current();});
  bind('demo',action=>{if(mode!=='demo')throw new Error('请先进入演示模式');if(!['play','pause','reset','advance'].includes(action))throw new Error('Invalid demo action');demo.action(action);broadcast();return current();});
  bind('connect',async provider=>{if(!getProvider(provider))throw new Error('Unknown provider');const result=await bridge.connect(provider);broadcast();return result;});
  bind('disconnect',async provider=>{if(!getProvider(provider))throw new Error('Unknown provider');const result=await bridge.disconnect(provider);broadcast();return result;});
  bind('displays',()=>screen.getAllDisplays().map(d=>({id:d.id,label:d.label||`${d.size.width}×${d.size.height}`,width:d.size.width,height:d.size.height,primary:d.id===screen.getPrimaryDisplay().id})));
  bind('move-display',id=>{if(!Number.isInteger(id))throw new Error('Invalid display');return moveToDisplay(id);});
  bind('open-source',async id=>{if(typeof id!=='string'||id.length>512)throw new Error('Invalid session');const session=liveStore.snapshot().find(s=>s.id===id);if(!session||!path.isAbsolute(session.projectPath||''))throw new Error('该会话没有可打开的本地项目');const stat=await fs.promises.stat(session.projectPath);if(!stat.isDirectory())throw new Error('项目目录不存在');const error=await shell.openPath(session.projectPath);if(error)throw new Error(error);return{opened:true};});
  applySettings();bridge.start();monitor.start();
  const displayId=settings.get().displayId;if(displayId!==null&&screen.getAllDisplays().some(d=>d.id===displayId))moveToDisplay(displayId);
  win.loadFile(path.join(__dirname,'renderer','index.html')).catch(error=>{rendererErrors.push(error.message);writeSmokeReport();});
  if(process.env.MINI_OFFICE_SMOKE_REPORT&&process.env.MINI_OFFICE_SMOKE_EXIT_MS){const delay=Number(process.env.MINI_OFFICE_SMOKE_EXIT_MS);if(Number.isFinite(delay)&&delay>=3000&&delay<=30000)setTimeout(async()=>{await writeSmokeReport();app.quit();},delay);}
  pruneTimer=setInterval(()=>{liveStore.prune();broadcast();},5000);
  refreshTimer=setInterval(()=>broadcast(),2000);
  win.on('closed',()=>{win=null;});
}).catch(error=>{console.error('[AI Mini Office]',error);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{ready=false;if(pruneTimer)clearInterval(pruneTimer);if(refreshTimer)clearInterval(refreshTimer);monitor?.stop();bridge?.stop();demo?.stop();});
}
