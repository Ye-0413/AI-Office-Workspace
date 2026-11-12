'use strict';
// Crash the production renderer and confirm the room returns with a content-free log entry.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDiagnosticLog}=require('../lib/diagnostic-log.cjs');
const {createRendererRecovery}=require('../lib/renderer-recovery.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-recovery-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const settings={language:'en',idleVisitor:false,reducedMotion:true,lowPower:false,sceneWeather:'off'};
const snapshot={mode:'live',now:Date.now(),sessions:[{id:'codex:recover',sessionId:'recover',provider:'codex',status:'active',activity:'coding',activeTools:0,lastEventAt:Date.now(),events:[]}],connections:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win,readyCount=0;const errors=[];
const guard=setTimeout(()=>{console.error('Renderer recovery fixture timed out');app.exit(1);},60000);
async function until(predicate,label){const end=Date.now()+20000;while(Date.now()<end){if(await predicate())return;await pause(50);}throw Error(label);}
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>({...snapshot,now:Date.now()}),settings:()=>settings,'set-settings':patch=>Object.assign(settings,patch),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:preload-ready',()=>{readyCount++;});
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const log=createDiagnosticLog({dir:path.join(profile,'usage-history')});
  const load=()=>win.loadFile(path.join(__dirname,'../renderer/index.html'));
  let resets=0;
  createRendererRecovery({webContents:win.webContents,reload:load,log:log.write,onReset:()=>{resets++;}});
  await load();
  await until(()=>readyCount===1,'first load reports ready');
  const room=()=>win.webContents.executeJavaScript(`!!document.getElementById('office')&&document.querySelectorAll('.actor[data-session-id]').length`,true).catch(()=>false);
  await until(async()=>await room()===1,'the observed session is drawn before the crash');
  win.webContents.forcefullyCrashRenderer();
  await until(()=>readyCount===2,'the crashed renderer reloads by itself');
  await until(async()=>await room()===1,'the same observed session is drawn after recovery');
  const kinds=log.read().map(entry=>entry.kind);
  assert.deepEqual(kinds,['renderer-gone','renderer-reload']);
  assert.equal(resets,1);
  assert.doesNotMatch(fs.readFileSync(log.status().path,'utf8'),/recover|codex/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks:['renderer crash reloads the room once and writes a content-free log line'],log:kinds}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
