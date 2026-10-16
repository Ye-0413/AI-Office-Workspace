'use strict';
// Complete local paintings through the production UI; all provider data is isolated.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Themes=require('../lib/festival-model.js').THEMES;
const imageSizes=new Map(require('../assets/scenes/themes/generation.json').images.map(item=>[item.id,item]));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-artwork-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'zh',sceneVenue:'workshop',sceneTheme:'spring',sceneWeather:'off',reducedMotion:false,idleVisitor:false};
const checks=[],errors=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
const settingsResponseDelays=[],settingsFailures=[];
const snapshot={mode:'live',now:Date.now(),connections:[],sessions:['root','helper'].map((id,i)=>({id:'codex:art-'+id,sessionId:'art-'+id,provider:'codex',parentId:i?'codex:art-root':undefined,status:'active',activity:'coding',activeTools:1,lastEventAt:Date.now(),projectPath:'/fixture/artwork',events:[]}))};
const run=source=>win.webContents.executeJavaScript(source,true);
async function until(source,label,ms=5000){const end=Date.now()+ms;while(Date.now()<end){if(await run(source))return;await pause(20);}throw new Error(label);}
async function choose(id,keyboard=false){await run(`(()=>{const n=document.querySelector('.festival-theme-select');n.dispatchEvent(new Event('${keyboard?'keydown':'pointerdown'}',{bubbles:true}));n.value=${JSON.stringify(id)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
const ready=id=>`document.getElementById('room-art').dataset.artworkKey===${JSON.stringify('workshop:'+id)}&&document.querySelector('.venue-stage').dataset.artState==='ready'&&document.querySelectorAll('.venue-art-buffer').length===0`;
const guard=setTimeout(()=>{console.error('Complete artwork fixture timed out');app.exit(1);},100000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':async patch=>{const delay=settingsResponseDelays.shift()||0,fail=settingsFailures.shift()||false;if(fail){await pause(delay);throw Error('isolated superseded settings failure');}settings={...settings,...patch};const saved={...settings};if(delay)await pause(delay);return saved;},displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await until(ready('spring'),'initial complete room must decode');
  await until(`[...document.querySelectorAll('.actor')].length===2&&[...document.querySelectorAll('.actor')].every(n=>Number(getComputedStyle(n).opacity)>.99)`,'both real fixture bodies must appear');
  await run(`window.originalBodies=[...document.querySelectorAll('.actor')].map(n=>({node:n,rig:n.querySelector('.ap-rig'),transform:n.style.transform}));window.bodyChanges=[];new MutationObserver(records=>{for(const r of records)if(r.type==='childList'&&r.target.id==='actors')for(const n of [...r.addedNodes,...r.removedNodes])if(n.matches?.('.actor[data-session-id]'))bodyChanges.push(n.dataset.sessionId);}).observe(document.getElementById('actors'),{subtree:true,childList:true});void 0`);
  settingsResponseDelays.push(350,20);await choose('summer');await pause(30);await choose('spring');await until(ready('spring'),'latest selection must settle before old save response');await pause(650);assert.equal(await run(ready('spring')),true);
  settingsResponseDelays.push(350,20);settingsFailures.push(true,false);await choose('summer');await pause(30);await choose('spring');await until(ready('spring'),'new selection must survive an old failed save');await pause(650);assert.equal(await run(ready('spring')),true);checks.push('out-of-order saved settings and superseded failures cannot revert the latest room');
  const paths=new Set();
  // Use real keyboard choices so this exhaustive asset check also exercises the
  // deliberate instant path. Continuous pointer interruption is sampled below.
  for(const theme of Themes){await choose(theme.id,true);await until(ready(theme.id),'complete '+theme.id+' picture must commit');const art=await run(`(()=>{const n=document.getElementById('room-art');return{src:n.getAttribute('src'),width:n.naturalWidth,height:n.naturalHeight,alt:n.alt}})()`);assert.equal(art.width,imageSizes.get(theme.id).width);assert.equal(art.height,imageSizes.get(theme.id).height);assert.ok(art.alt.includes(theme.nameZh));paths.add(art.src);
    if(process.env.MINI_OFFICE_ARTWORK_PREVIEW_DIR){await pause(450);await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);fs.mkdirSync(process.env.MINI_OFFICE_ARTWORK_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_ARTWORK_PREVIEW_DIR,theme.id+'.png'),(await win.webContents.capturePage()).toPNG());}
  }
  assert.equal(paths.size,43);checks.push('all 43 distinct complete paintings decode through the real theme selector');
  await run(`window.artAudit={frames:0,maxBuffers:0,jumps:[],hidden:[],restarted:[],outgoing:new Map(),done:false};function auditArt(){const a=artAudit;a.frames++;const buffers=[...document.querySelectorAll('.venue-art-buffer')];a.maxBuffers=Math.max(a.maxBuffers,buffers.length);for(const old of originalBodies){if(!old.node.isConnected||old.node.style.transform!==old.transform)a.jumps.push(old.node.dataset.sessionId);if(Number(getComputedStyle(old.node).opacity)<.99)a.hidden.push(old.node.dataset.sessionId);}for(const n of buffers){const effect=n.getAnimations()[0],last=effect?.effect.getKeyframes().at(-1);if(String(last?.opacity)==='0'){if(a.outgoing.has(n)&&a.outgoing.get(n)!==effect)a.restarted.push(n.dataset.artworkKey);a.outgoing.set(n,effect);}else a.outgoing.delete(n);}if(!a.done)requestAnimationFrame(auditArt);}requestAnimationFrame(auditArt);void 0`);
  for(const theme of Themes){await choose(theme.id);await pause(35);}
  await until(ready(Themes.at(-1).id),'rapid changes must settle at the latest theme');await pause(450);
  const audit=await run(`artAudit.done=true;({frames:artAudit.frames,maxBuffers:artAudit.maxBuffers,jumps:[...new Set(artAudit.jumps)],hidden:[...new Set(artAudit.hidden)],restarted:[...new Set(artAudit.restarted)]})`);
  assert.ok(audit.frames>=31,JSON.stringify(audit));assert.ok(audit.maxBuffers<=12,JSON.stringify(audit));assert.deepEqual(audit.jumps,[]);assert.deepEqual(audit.hidden,[]);assert.deepEqual(audit.restarted,[]);checks.push({name:'rapid choices preserve actors and outgoing fade deadlines',...audit});
  await choose('spring');await until(ready('spring'),'A must be painted before testing A to B to A');
  await run(`window.savedDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){if(this.classList.contains('venue-art-buffer')&&this.src.includes('/halloween.jpg'))return new Promise(resolve=>setTimeout(()=>savedDecode.call(this).then(resolve),350));return savedDecode.call(this)};void 0`);
  await choose('halloween');await pause(30);await choose('spring');await until(ready('spring'),'late previous decode must not replace latest theme');await pause(400);assert.equal(await run(ready('spring')),true);
  await run(`HTMLImageElement.prototype.decode=savedDecode;void 0`);checks.push('late decoded complete paintings cannot overwrite a newer choice');
  await run(`HTMLImageElement.prototype.decode=function(){return this.classList.contains('venue-art-buffer')&&this.src.includes('/christmas.jpg')?Promise.reject(Error('isolated decode failure')):savedDecode.call(this)};void 0`);
  await choose('christmas');await until(`document.querySelector('.venue-stage').dataset.artState==='error'`,'failed picture must report a finite error');
  assert.equal(await run(`originalBodies.every(b=>b.node.isConnected&&Number(getComputedStyle(b.node).opacity)>.99)`),true);
  await run(`HTMLImageElement.prototype.decode=savedDecode;void 0`);await choose('spring');await until(ready('spring'),'retained room must recover');await choose('christmas');await until(ready('christmas'),'failed theme must load after retry');checks.push('failed picture preserves bodies and recovers after a deliberate retry');
  await run(`HTMLImageElement.prototype.decode=function(){return this.id==='room-art'&&this.src.includes('/halloween.jpg')?Promise.reject(Error('isolated main-image commit failure')):savedDecode.call(this)};void 0`);
  await choose('halloween');await until(`document.querySelector('.venue-stage').dataset.artState==='error'`,'failed main-image commit must report an error');
  assert.equal(await run(`document.querySelector('.venue-art-buffer[data-artwork-key="workshop:halloween"]')?.naturalWidth>0&&Number(getComputedStyle(document.querySelector('.venue-art-buffer[data-artwork-key="workshop:halloween"]')).opacity)===1&&document.getElementById('venue-select').getAttribute('aria-busy')==='false'`),true);
  await run(`HTMLImageElement.prototype.decode=savedDecode;void 0`);await choose('christmas');await until(ready('christmas'),'main-image failure must recover on a later selection');checks.push('failed main-image commit retains its already decoded opaque safety picture');
  await run(`document.querySelector('.language-button').click();void 0`);await until(`document.getElementById('room-art').alt.includes('Christmas')`,'English room alt must use the current theme');
  assert.equal(await run(`originalBodies.every(b=>b.node===document.querySelector('.actor[data-session-id="'+b.node.dataset.sessionId+'"]')&&b.rig===b.node.querySelector('.ap-rig'))`),true);assert.deepEqual(await run('bodyChanges'),[]);checks.push('language changes retain original actor bodies and articulated rigs');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
