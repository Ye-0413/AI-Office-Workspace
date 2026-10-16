'use strict';
// Replay production demo events through the actual sandboxed renderer.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {createDemo}=require('../lib/demo.cjs');
const Persona=require('../lib/agent-persona.js');
const Scene=require('../lib/scene-model.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-persona-renderer-'));
app.setPath('userData',dir);app.disableHardwareAcceleration();
let settings={sceneTime:'morning',nameStyle:'classic',idleVisitor:false,language:'zh',reducedMotion:true};
let demo,win;const errors=[];const calls=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot=()=>({...demo.snapshot(),mode:'demo',connections:[],now:Date.now()});
const publish=()=>{if(win&&!win.isDestroyed())win.webContents.send('office:snapshot',snapshot());};
app.whenReady().then(async()=>{
  demo=createDemo({onChange:publish});demo.action('story:harbour-morning');
  const handlers={snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),demo:action=>{calls.push(action);demo.action(action);return snapshot();},displays:()=>[]};
  for(const [name,fn] of Object.entries(handlers))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await wait(300);
  const run=s=>win.webContents.executeJavaScript(s,true);
  const change=async(id,value)=>{await run(`document.getElementById('${id}').value='${value}';document.getElementById('${id}').dispatchEvent(new Event('change',{bubbles:true}))`);await wait(180);};
  const first=snapshot().sessions[0],classic=Scene.identityName(first),p=Persona.forSession(first);
  assert.equal(await run(`document.querySelectorAll('.actor').length`),3);
  assert.equal(await run(`document.querySelectorAll('#demo-story option').length`),4);
  assert.equal(await run(`document.querySelector('.actor-title').textContent`),classic);
  await change('setting-nameStyle','harbour');
  assert.equal(await run(`document.querySelector('.actor-title').textContent`),p.aliasZh);
  await run(`document.querySelector('.actor-button').click()`);
  assert.equal(await run(`document.getElementById('inspect-persona-name').textContent`),classic);
  assert.equal(await run(`document.getElementById('inspect-persona-trait').textContent`),p.traitZh);
  assert.equal(await run(`document.getElementById('inspect-title').textContent`),first.title);
  await run(`document.getElementById('greet-agent').click()`);await wait(50);
  assert.equal(await run(`document.querySelector('.actor-bubble').textContent`),p.greetingZh);
  assert.equal(snapshot().sessions[0].activity,first.activity,'a social gesture cannot change observed work');
  assert.equal(calls.length,0,'a greeting cannot call a provider or demo action');
  await wait(900);assert.equal(await run(`document.querySelector('.actor-bubble').dataset.show`),'true','static greetings retain time to read');
  await run(`document.getElementById('language-button').click()`);await wait(180);
  assert.equal(await run(`document.querySelector('.actor-title').textContent`),p.aliasEn);
  assert.equal(await run(`document.getElementById('inspect-persona-trait').textContent`),p.traitEn);
  assert.equal(await run(`document.getElementById('greet-agent').textContent`),'Say hello');
  assert.equal(await run(`document.getElementById('inspect-title').textContent`),first.title);
  await run(`document.getElementById('close-inspector').click()`);
  for(const story of ['rainy-afternoon','lantern-evening','harbour-morning']){
    await change('demo-story',story);
    assert.equal(demo.snapshot().demo.storyId,story);assert.equal(demo.snapshot().demo.tick,0);
    assert.equal(await run(`document.querySelectorAll('.actor').length`),3,'changing stories must remove the previous cast');
    assert.ok(snapshot().sessions.every(session=>session.evidence.source==='demo'));
    assert.match(await run(`document.getElementById('demo-scene-label').textContent`),/^Simulated · /);
  }
  await run(`document.getElementById('language-button').click()`);await wait(120);
  if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,'harbour-crew.png'),(await win.webContents.capturePage()).toPNG());}
  win.reload();await wait(300);assert.equal(await run(`document.querySelector('.actor-title').textContent`),p.aliasZh,'saved nickname style survives remount');
  for(const story of ['harbour-morning','rainy-afternoon','lantern-evening']){
    await change('demo-story',story);
    for(let index=0;index<3;index++){await run(`document.getElementById('demo-next').click()`);await wait(120);}
    assert.ok(snapshot().sessions.some(session=>session.activity==='waiting-user'));
    for(let index=0;index<10;index++){demo.action('advance');publish();}await wait(150);
    assert.ok(snapshot().sessions.some(session=>session.activity==='waiting-user'),'story endings retain unanswered questions');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['four authored stories','stable bilingual aliases','original title and identity retained','local greet without hook calls','cast replacement','persistence','unanswered questions stay visible'],errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{demo?.stop();win?.destroy();app.quit();fs.rmSync(dir,{recursive:true,force:true});});
