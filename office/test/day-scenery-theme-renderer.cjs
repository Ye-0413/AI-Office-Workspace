'use strict';
// Production DOM and CSS only; isolated metadata, no AI tools or config writes.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-theme-light-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'zh',sceneVenue:'workshop',sceneTheme:'aurora',sceneWeather:'off',sceneTime:'morning',reducedMotion:false,idleVisitor:false};
const checks=[],errors=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot={mode:'live',now:Date.now(),connections:[],sessions:['a','b'].map(id=>({id:'codex:light-'+id,sessionId:'light-'+id,provider:'codex',status:'active',activity:'coding',activeTools:1,lastEventAt:Date.now(),events:[],projectPath:'/fixture/light'}))};
const run=code=>win.webContents.executeJavaScript(code,true);
async function until(code,label){const end=Date.now()+6000;while(Date.now()<end){if(await run(code))return;await pause(30);}throw Error(label);}
async function chooseTime(phase){await run(`document.getElementById('setting-sceneTime').value=${JSON.stringify(phase)};document.getElementById('setting-sceneTime').dispatchEvent(new Event('change',{bubbles:true}));void 0`);}
async function capture(id){if(process.env.MINI_OFFICE_THEME_LIGHT_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_THEME_LIGHT_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_THEME_LIGHT_PREVIEW_DIR,id+'.png'),(await win.webContents.capturePage()).toPNG());}}
const guard=setTimeout(()=>{console.error('Theme glass fixture timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await until(`document.getElementById('office').dataset.fullTheme==='true'&&document.querySelector('.venue-stage').dataset.artState==='ready'`,'complete aurora must load');
  await until(`document.querySelectorAll('.actor').length===2&&[...document.querySelectorAll('.actor')].every(n=>Number(getComputedStyle(n).opacity)>.99)`,'both fixture actors must appear');
  await run(`window.retainedLightActors=[...document.querySelectorAll('.actor')].map(node=>({node,rig:node.querySelector('.ap-rig'),transform:node.style.transform}));window.retainedLightViews=[...document.querySelectorAll('.harbour-view,.door-theme-wash')];void 0`);
  const palettes=new Set();
  for(const phase of ['dawn','morning','afternoon','sunset','night']){
    await chooseTime(phase);
    const frames=await run(`new Promise(resolve=>{let frames=0;const start=performance.now(),bad=[];function tick(now){frames++;if(!retainedLightActors.every(a=>a.node.isConnected&&a.rig===a.node.querySelector('.ap-rig')&&a.transform===a.node.style.transform&&Number(getComputedStyle(a.node).opacity)>.99))bad.push('actor');if([...document.querySelectorAll('.harbour-view svg')].some(n=>Number(getComputedStyle(n).opacity)!==0))bad.push('city');if(now-start<700)requestAnimationFrame(tick);else resolve({frames,bad:[...new Set(bad)]});}requestAnimationFrame(tick);})`);
    assert.ok(frames.frames>=31,JSON.stringify(frames));assert.deepEqual(frames.bad,[]);
    const state=await run(`(()=>{const v=document.querySelector('.harbour-view[data-visible="true"]'),d=document.querySelector('.door-theme-wash[data-visible="true"]'),w=document.querySelector('.door-window');return{phase:document.getElementById('office').dataset.dayPhase,views:document.querySelectorAll('.harbour-view[data-visible="true"]').length,doorViews:document.querySelectorAll('.door-theme-wash[data-visible="true"]').length,wash:Number(getComputedStyle(v,'::after').opacity),doorWash:Number(getComputedStyle(d).opacity),gradient:getComputedStyle(v,'::after').backgroundImage,doorBackground:Number(getComputedStyle(w,'::before').opacity),city:Number(getComputedStyle(document.querySelector('.door-city')).opacity),lights:Number(getComputedStyle(document.querySelector('.door-window-lights')).opacity),ferry:getComputedStyle(v.querySelector('.harbour-ferry')).animationPlayState,src:document.getElementById('room-art').getAttribute('src'),stable:retainedLightViews.every(n=>n.isConnected),layers:document.querySelectorAll('.door-theme-wash').length};})()`);
    assert.equal(state.phase,phase);assert.equal(state.views,1);assert.equal(state.doorViews,1);assert.ok(state.wash>=.045&&state.wash<=.2,JSON.stringify(state));assert.ok(Math.abs(state.doorWash-state.wash)<.001);assert.equal(state.doorBackground,0);assert.equal(state.city,0);assert.equal(state.lights,0);assert.equal(state.ferry,'paused');assert.match(state.src,/aurora\.jpg$/);assert.equal(state.stable,true);assert.equal(state.layers,6);palettes.add(state.gradient);
    checks.push({name:'painted outdoor view with '+phase+' light',frames:frames.frames,wash:state.wash});await capture('aurora-'+phase);
  }
  assert.equal(palettes.size,5);
  await chooseTime('night');await pause(35);await chooseTime('dawn');await pause(35);await chooseTime('night');await pause(320);
  assert.equal(await run(`document.querySelector('.harbour-view[data-visible="true"]').dataset.time`),'night');
  for(const flag of ['reducedMotion','lowPower']){await run(`document.getElementById('setting-${flag}').click();void 0`);await chooseTime('morning');await pause(180);assert.equal(await run(`getComputedStyle(document.querySelector('.harbour-ferry')).animationPlayState`),'paused');await run(`document.getElementById('setting-${flag}').click();void 0`);}
  checks.push('rapid re-entry and reduced-motion/low-power retain bounded glass surfaces');
  const switches=await run(`(async()=>{const report=[];const alpha=()=>{const v=document.querySelector('.harbour-view[data-visible="true"]');return[Number(getComputedStyle(v.querySelector('svg')).opacity),Number(getComputedStyle(v,'::after').opacity),Number(getComputedStyle(document.querySelector('.door-window'),'::before').opacity),Number(getComputedStyle(document.querySelector('.door-city')).opacity)];};for(const venue of ['teahouse','workshop','teahouse','workshop']){const before=alpha(),n=document.getElementById('venue-select');n.value=venue;n.dispatchEvent(new Event('change',{bubbles:true}));const immediate=alpha();await new Promise(r=>setTimeout(r,65));report.push({venue,before,immediate,later:alpha()});}return report;})()`);
  for(const s of switches){assert.ok(s.before.every((v,i)=>Math.abs(v-s.immediate[i])<.025),JSON.stringify(s));assert.ok(s.later[0]>0&&s.later[0]<1,JSON.stringify(s));}
  checks.push({name:'rapid full-theme/base changes retarget actual glass alpha without a first-frame jump',switches});
  await run(`document.getElementById('venue-select').value='teahouse';document.getElementById('venue-select').dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`document.getElementById('office').dataset.fullTheme==='false'&&document.querySelector('.venue-stage').dataset.artState==='ready'`,'base room must restore');await pause(300);
  assert.equal(await run(`Number(getComputedStyle(document.querySelector('.harbour-view[data-visible="true"] svg')).opacity)`),1);
  assert.equal(await run(`Number(getComputedStyle(document.querySelector('.harbour-view[data-visible="true"]'),'::after').opacity)`),0);
  assert.equal(await run(`Number(getComputedStyle(document.querySelector('.door-city')).opacity)`),.45);
  assert.equal(await run(`Number(getComputedStyle(document.querySelector('.door-window'),'::before').opacity)`),1);
  assert.equal(await run(`[...document.querySelectorAll('.door-theme-wash')].every(n=>Number(getComputedStyle(n).opacity)===0)`),true);
  assert.equal(await run(`retainedLightActors.every(a=>a.node.isConnected&&a.rig===a.node.querySelector('.ap-rig')&&a.transform===a.node.style.transform)`),true);
  checks.push('base venue restores harbour and door city without replacing actors');await capture('base-harbour');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
