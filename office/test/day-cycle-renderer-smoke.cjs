'use strict';
// Local Electron fixtures: no live hooks, AI tools or external requests.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-day-renderer-'));
app.setPath('userData',dir);app.disableHardwareAcceleration();
let settings={sceneTime:'auto',idleVisitor:false,language:'zh'};
const errors=[];let win;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  const handlers={snapshot:()=>({mode:'live',sessions:[],connections:[],demo:{running:false}}),settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]};
  for(const [name,fn] of Object.entries(handlers))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await wait(200);
  const run=s=>win.webContents.executeJavaScript(s,true);
  const capture=async name=>{if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,name+'.png'),(await win.webContents.capturePage()).toPNG());}};
  await run(`document.getElementById('window-scenery').hidden=true`);await capture('original-window');await run(`document.getElementById('window-scenery').hidden=false`);
  for(const phase of ['dawn','morning','afternoon','sunset','night']){
    await run(`document.getElementById('setting-sceneTime').value='${phase}';document.getElementById('setting-sceneTime').dispatchEvent(new Event('change',{bubbles:true}))`);await wait(320);
    const state=await run(`({phase:document.getElementById('office').dataset.dayPhase,preview:document.getElementById('office').dataset.timePreview,clock:document.getElementById('hk-clock').textContent,views:document.querySelectorAll('.harbour-view[data-visible="true"]').length,sessions:document.querySelectorAll('.actor').length,error:!document.getElementById('error-message').hidden})`);
    assert.equal(state.phase,phase);assert.equal(state.preview,'true');assert.match(state.clock,/^\d{2}:\d{2}$/);assert.equal(state.views,1);assert.equal(await run(`document.getElementById('day-clock').closest('#world')!==null`),true);assert.ok(await run(`parseFloat(getComputedStyle(document.getElementById('hk-clock')).fontSize)>=30`));assert.equal(state.sessions,0);assert.equal(state.error,false);assert.equal(settings.sceneTime,phase);
    await capture('hong-kong-'+phase);
  }
  await run(`document.getElementById('day-clock').click()`);assert.equal(await run(`document.activeElement.id`),'setting-sceneTime');
  await run(`document.getElementById('day-reset').click()`);await wait(200);assert.equal(settings.sceneTime,'auto');assert.equal(await run(`document.activeElement.id`),'setting-sceneTime');assert.equal(await run(`document.getElementById('day-reset').hidden`),true);
  await run(`document.getElementById('settings-dialog').close();document.getElementById('language-button').click()`);await wait(100);assert.match(await run(`document.getElementById('day-clock').getAttribute('aria-label')`),/^Hong Kong time /);
  await run(`document.getElementById('settings-button').click();document.getElementById('setting-reducedMotion').click();document.getElementById('settings-dialog').close()`);await wait(100);
  assert.equal(await run(`getComputedStyle(document.querySelector('.harbour-ferry')).animationPlayState`),'paused');
  for(const size of [[960,540],[1280,720]]){win.setContentSize(...size);await wait(100);assert.equal(await run(`(()=>{const r=document.getElementById('day-clock').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`),true);}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,phases:5,checks:['real clock during preview','time select persistence','one active crossfade surface','no synthetic actors','keyboard focus','reset to now','bilingual labels','reduced motion','responsive clock'],errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{win?.destroy();fs.rmSync(dir,{recursive:true,force:true});app.exit(process.exitCode||0);});
