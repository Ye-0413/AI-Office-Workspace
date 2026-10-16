'use strict';
// Production page/room navigation, using isolated observation snapshots.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Scene=require('../lib/scene-model.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-motion-pages-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();let win;const errors=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sessions=Array.from({length:6},(_,i)=>({id:'codex:clock-'+i,sessionId:'clock-'+i,provider:'codex',projectPath:'/fixture/'+(i%2?'two':'one'),title:'Fixture '+i,activity:'planning',status:'active',activeTools:0,lastEventAt:Date.now(),events:[],evidence:{source:'hook',confidence:'high'}}));
const snapshot={mode:'live',sessions,connections:[],now:Date.now()};let settings={language:'zh',sceneTime:'auto',reducedMotion:false,idleVisitor:false,agentScale:1};
const evaluate=source=>win.webContents.executeJavaScript(source,true);
const program=()=>evaluate(`document.querySelector('.actor[data-session-id="codex:clock-0"]')?.dataset.performanceProgram`);
async function until(source,message){const end=Date.now()+10000;while(Date.now()<end){if(await evaluate(source))return;await pause(50);}throw new Error(message);}
async function room(key){await evaluate(`(()=>{const s=document.getElementById('project-select');s.value=${JSON.stringify(key)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(150);}
const guard=setTimeout(()=>app.exit(1),35000);
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await until(`!!document.querySelector('.actor[data-session-id="codex:clock-0"]')?.dataset.performanceProgram`,'the first visible planning program must start');
  const first=await program();
  await evaluate(`window.clockFixtureNow=Date.now;window.clockFixtureTime=clockFixtureNow();Date.now=()=>clockFixtureTime;clockFixtureTime+=25000`);
  win.webContents.send('office:snapshot',snapshot);await pause(120);
  const advanced=await program();assert.notEqual(advanced,first,'visible work must advance to a different authored program');
  await evaluate(`document.getElementById('page-next').click()`);await pause(100);
  assert.equal(await program(),undefined,'the original DOM actor must really be destroyed on another page');
  await evaluate(`document.getElementById('page-prev').click()`);
  await until(`!!document.querySelector('.actor[data-session-id="codex:clock-0"]')?.dataset.performanceProgram`,'the original identity must return');
  assert.equal(await program(),advanced,'actual page navigation must keep accumulated motion time instead of resetting to the seed');
  await room('/fixture/two');assert.equal(await program(),undefined);
  await room(Scene.ALL_ROOMS);
  await until(`!!document.querySelector('.actor[data-session-id="codex:clock-0"]')?.dataset.performanceProgram`,'the identity must return from a different room');
  assert.equal(await program(),advanced,'room navigation must use the same per-identity visible-work history');
  await evaluate('void(Date.now=window.clockFixtureNow)');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks:['visible activity advances','page removes the real DOM body','page return preserves program history','room return preserves program history','no renderer or provider mutation'],errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
