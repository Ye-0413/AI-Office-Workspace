'use strict';
// Real counter DOM and WAAPI motion in the production page; isolated data only.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-number-flip-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'en',roomDesign:'glasshouse',sceneWeather:'off',idleVisitor:false,reducedMotion:false,lowPower:false};
const usage={available:true,date:'2026-10-29',weekFrom:'2026-10-26',weekTo:'2026-11-01',dailyTokens:1000000,weeklyTokens:2000000};
let snapshot={mode:'live',sessions:[],connections:[],activityStats:{total:12,roots:10,helpers:2},tokenUsage:usage};
const errors=[],checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>win.webContents.executeJavaScript(code,true);
const ids=['today-total','home-token-daily','home-token-weekly'];
async function until(code,label){const end=Date.now()+15000;while(Date.now()<end){if(errors.length)throw Error(errors.join('; '));if(await run(code))return;await pause(15);}throw Error(label);}
async function send(total,daily,weekly){snapshot={...snapshot,now:Date.now(),activityStats:{total,roots:10,helpers:total-10},tokenUsage:{...usage,dailyTokens:daily,weeklyTokens:weekly}};win.webContents.send('office:snapshot',snapshot);await run('new Promise(resolve=>requestAnimationFrame(resolve))');}
const guard=setTimeout(()=>{console.error('Number flip fixture timed out');app.exit(1)},90000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await until(`document.getElementById('today-total').textContent==='12'&&document.getElementById('home-token-daily').textContent==='1M'`,'initial real totals render');
  assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0,'initial data does not flip');
  await run(`window.counterIds=${JSON.stringify(ids)};window.counterBoxes=counterIds.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,left:r.left,top:r.top,right:r.right,bottom:r.bottom}});void 0`);
  await send(13,2000000,3000000);
  const started=await run(`(()=>{window.counterCycles=counterIds.map(id=>({id,node:document.getElementById(id),motions:document.getElementById(id).getAnimations({subtree:true})}));counterCycles.flatMap(r=>r.motions).forEach(a=>a.pause());return counterCycles.map(row=>({id:row.id,value:row.node.textContent,flipping:row.node.dataset.flipping,motions:row.motions.length,oldHidden:row.node.querySelector('.number-outgoing').getAttribute('aria-hidden'),oldText:row.node.querySelector('.number-outgoing').textContent,total:Math.max(...row.motions.map(a=>a.effect.getTiming().duration+a.effect.getTiming().delay))}));})()`);
  assert.deepEqual(started.map(row=>row.value),['13','2M','3M']);
  for(const row of started){assert.equal(row.flipping,'true');assert.equal(row.motions,2);assert.equal(row.oldHidden,'true');assert.equal(row.oldText,'');assert.equal(row.total,200);}
  await send(13,2000000,3000000);await send(14,2340000,3450000);
  assert.equal(await run(`counterCycles.every(row=>{const next=row.node.getAnimations({subtree:true});return next.length===row.motions.length&&next.every(a=>row.motions.includes(a))})`),true,'identical refreshes and bursts cannot restart or queue motion');
  assert.deepEqual(await run(`counterIds.map(id=>document.getElementById(id).textContent)`),['14','2.34M','3.45M']);
  // Sample the actual physical hinge, rather than only checking CSS class names.
  const hinge=await run(`(()=>{counterCycles.flatMap(r=>r.motions).forEach(a=>a.currentTime=50);return counterCycles.map(row=>{const n=row.node.querySelector('.number-outgoing'),style=getComputedStyle(n),m=new DOMMatrixReadOnly(style.transform);return{tilted:Math.abs(m.m22)<.99,translucent:Number(style.opacity)<1};});})()`);
  assert.ok(hinge.every(row=>row.tilted&&row.translucent));
  await run(`counterCycles.flatMap(r=>r.motions).forEach(a=>a.finish());void 0`);
  await until(`document.querySelectorAll('.number-outgoing').length===0`,'finished flips clean up');
  assert.deepEqual(await run(`counterIds.map(id=>document.getElementById(id).textContent)`),['14','2.34M','3.45M']);
  const stable=await run(`counterBoxes.every(old=>{const r=document.getElementById(old.id).getBoundingClientRect();return Math.abs(old.top-r.top)<.5&&Math.abs(old.bottom-r.bottom)<.5&&(old.id==='today-total'||Math.abs(old.left-r.left)<.5&&Math.abs(old.right-r.right)<.5)})`);
  assert.equal(stable,true,'flip transforms cannot shift the ledger or clock geometry');
  checks.push('real 200ms 3D flip, latest accessible values, unchanged heartbeats, burst coalescing and fixed ledger geometry');
  await send(15,2500000,3500000);
  await run(`document.getElementById('setting-reducedMotion').checked=true;document.getElementById('setting-reducedMotion').dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`document.getElementById('office').dataset.reducedMotion==='true'`,'reduced motion applies');
  assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0,'changing motion preference cancels active flips');
  await send(16,2600000,3600000);assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0);
  await run(`document.getElementById('setting-lowPower').checked=true;document.getElementById('setting-lowPower').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('setting-reducedMotion').checked=false;document.getElementById('setting-reducedMotion').dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`document.getElementById('office').dataset.lowPower==='true'`,'low power applies');
  await send(17,2700000,3700000);assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0);
  await run(`document.getElementById('setting-lowPower').checked=false;document.getElementById('setting-lowPower').dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`document.getElementById('office').dataset.lowPower==='false'`,'ordinary motion resumes');
  await send(18,2800000,3800000);
  snapshot={...snapshot,windowVisibility:{hidden:true}};win.webContents.send('office:snapshot',snapshot);
  await until(`document.getElementById('office').dataset.hidden==='true'`,'native window hide applies');
  assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0);
  await send(19,2900000,3900000);assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0);
  snapshot={...snapshot,windowVisibility:{hidden:false}};win.webContents.send('office:snapshot',snapshot);
  await until(`document.getElementById('office').dataset.hidden==='false'`,'native window restore applies');
  assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0,'restoring a window cannot replay skipped changes');
  await win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await until(`document.getElementById('office').dataset.reducedMotion==='true'`,'system reduced motion applies');
  await send(20,3000000,4000000);assert.equal(await run(`document.querySelectorAll('.number-outgoing').length`),0);
  win.webContents.debugger.detach();
  checks.push('app/system reduced motion, low power and native hidden state cancel immediately without replaying skipped changes');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
