'use strict';
// Continuous presentation at an actual mid-motion re-entry, not just a final
// state check. Uses only local artwork and synthetic actor sentinels.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-reentry-native-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[],evidence=[];let win;
const file=path.join(profile,'fixture.html'),base=pathToFileURL(path.join(__dirname,'../renderer/')).href;
fs.writeFileSync(file,`<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="venue-stage.css"><link rel="stylesheet" href="festival-stage.css"><script defer src="../lib/venue-model.js"></script><script defer src="../lib/festival-studies.js"></script><script defer src="../lib/festival-model.js"></script><script defer src="venue-stage.js"></script><script defer src="festival-stage.js"></script></head><body><main id="office" class="office"><div id="world-frame" class="world-frame"><div id="world" class="world"><img id="room-art" class="room-art" src="../assets/office-room.jpg" alt="Room"><div id="actors" class="actors"><button id="sentinel">Agent</button></div></div></div><header class="topbar"><div class="top-actions"></div></header></main></body></html>`);
const guard=setTimeout(()=>{console.error('Interruption fixture exceeded 60 seconds');app.exit(1);},60000);
const run=source=>win.webContents.executeJavaScript(source,true);
async function until(source,message,ms=4000){const end=Date.now()+ms;while(Date.now()<end){if(await run(source))return;await pause(10);}throw new Error(message);}
async function check(name,fn){try{await fn();checks.push(name);}catch(error){error.message=name+': '+error.message;throw error;}}
async function festival(patch){await run(`festivalState={...festivalState,...${JSON.stringify(patch)}};festival.update(festivalState);void 0`);}
async function venue(id){await run(`venueState={...venueState,venue:${JSON.stringify(id)}};venue.update(venueState);void 0`);await until(`document.getElementById('room-art').dataset.venue===${JSON.stringify(id)}&&document.querySelectorAll('.venue-art-buffer').length===0`,'background must settle before the next test');}
async function reentry(selector,trigger){return run(`(async()=>{const target=document.querySelector(${JSON.stringify(selector)}),frames=[];function sample(){const s=getComputedStyle(target),m=new DOMMatrixReadOnly(s.transform);frames.push({at:performance.now(),a:m.a,b:m.b,c:m.c,d:m.d,x:m.e,y:m.f,opacity:Number(s.opacity)})}sample();${trigger};sample();await new Promise(resolve=>{let count=0;function tick(){sample();if(++count===6)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});return frames})()`);}
function continuousMatrix(frames,label){assert.ok(frames.length>=8);for(let i=1;i<frames.length;i++){const previous=frames[i-1],next=frames[i];assert.ok(Math.max(...['a','b','c','d'].map(key=>Math.abs(next[key]-previous[key])))<.08,label+': '+JSON.stringify(frames));assert.ok(Math.hypot(next.x-previous.x,next.y-previous.y)<4,label+': '+JSON.stringify(frames));}}
app.whenReady().then(async()=>{
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(file);
  await run(`window.errors=[];addEventListener('error',e=>{if(e.message)errors.push(e.message)});addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.actorMutations=[];new MutationObserver(records=>actorMutations.push(...records.map(r=>r.type))).observe(document.getElementById('actors'),{attributes:true,childList:true,subtree:true});window.venueState={venue:'workshop',language:'zh',reducedMotion:false,lowPower:false,hidden:false};window.festivalState={theme:'summer',weather:'off',language:'zh',reducedMotion:false,lowPower:false,hidden:false};const office=document.getElementById('office'),world=document.getElementById('world'),topbar=document.querySelector('.topbar');window.venue=OfficeVenueStage.create({office,world,topbar,getState:()=>venueState});window.festival=OfficeFestivalStage.create({office,world,topbar,getState:()=>festivalState});void 0`);
  await venue('workshop');
  await check('a half-open fan reverses continuously through the following two real frames',async()=>{
    await run(`document.querySelector('.festival-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));void 0`);await pause(500);
    const first=await reentry('.festival-primary',`document.querySelector('.festival-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))`);
    continuousMatrix(first,'open-to-close fan');evidence.push({case:'fan-open-to-close',frames:first});
    const second=await reentry('.festival-primary',`document.querySelector('.festival-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))`);
    continuousMatrix(second,'close-to-open fan');evidence.push({case:'fan-close-to-open',frames:second});
  });
  await check('core inner petals and ribbon changes crossfade rather than jump to a new drawing',async()=>{
    await festival({theme:'spring',reducedMotion:true});await run(`document.querySelector('.festival-control').click();void 0`);assert.equal(await run(`document.querySelector('.festival-widget').dataset.state`),'sprout');assert.equal(await run(`Number(getComputedStyle(document.querySelector('[data-part="flower"]')).opacity)`),.15);
    await run(`document.querySelector('.festival-control').click();void 0`);assert.equal(await run(`document.querySelector('.festival-widget').dataset.state`),'blossom');assert.equal(await run(`Number(getComputedStyle(document.querySelector('[data-part="flower"]')).opacity)`),1);
    for(const [theme,selector]of [['midsummer','[data-part="ribbon-a"]'],['hanami','[data-part="blossom-4"]']]){
      await festival({theme,reducedMotion:true});await run(`document.querySelector('.festival-control').click();void 0`);await festival({reducedMotion:false});
      const frames=await reentry(selector,`document.querySelector('.festival-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))`);
      assert.ok(Math.abs(frames[1].opacity-frames[0].opacity)<.02,JSON.stringify(frames));assert.ok(frames[3].opacity>0&&frames[3].opacity<1,JSON.stringify(frames));evidence.push({case:theme+'-inner-fade',frames});
    }
  });
  await check('repeated meteor click starts at its currently visible position and brightness',async()=>{
    await venue('observatory');await run(`document.querySelector('[data-interaction="observatory-meteor-note"] .venue-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));void 0`);await pause(220);
    const frames=await reentry('[data-interaction="observatory-meteor-note"] .venue-meteor',`document.querySelector('[data-interaction="observatory-meteor-note"] .venue-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))`);
    assert.ok(frames[0].opacity>.1,JSON.stringify(frames));assert.ok(Math.abs(frames[1].opacity-frames[0].opacity)<.03,JSON.stringify(frames));assert.ok(Math.hypot(frames[1].x-frames[0].x,frames[1].y-frames[0].y)<.1,JSON.stringify(frames));
    for(let i=2;i<frames.length;i++)assert.ok(frames[i].x>=frames[i-1].x-.1&&frames[i].x-frames[i-1].x<4,JSON.stringify(frames));evidence.push({case:'meteor-reentry',frames});
  });
  await check('a new background retargets the existing partial blend without an opaque flash',async()=>{
    await run(`(async()=>{const image=new Image();image.src=OfficeVenues.getVenue('teahouse').background;await image.decode()})()`);await venue('workshop');
    await run(`venueState={...venueState,venue:'teahouse'};venue.update(venueState);void 0`);
    await until(`(()=>{const n=document.querySelector('.venue-art-buffer[data-venue="teahouse"]');if(!n)return false;const a=Number(getComputedStyle(n).opacity);return a>.03&&a<.6})()`,'teahouse must be genuinely half blended');
    const frames=await run(`(async()=>{const frames=[],b=document.querySelector('.venue-art-buffer[data-venue="teahouse"]');frames.push({at:performance.now(),phase:'before',b:Number(getComputedStyle(b).opacity)});await new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{const c=document.querySelector('.venue-art-buffer[data-venue="observatory"]');if(!c)return;observer.disconnect();function sample(phase){frames.push({at:performance.now(),phase,b:Number(getComputedStyle(b).opacity),c:Number(getComputedStyle(c).opacity)})}sample('append');requestAnimationFrame(()=>{sample('raf1');requestAnimationFrame(()=>{sample('raf2');resolve()})})});observer.observe(document.getElementById('world'),{childList:true});venueState={...venueState,venue:'observatory'};venue.update(venueState);setTimeout(()=>{observer.disconnect();reject(new Error('new blend did not start'))},2000)});return frames})()`);
    assert.ok(frames[1].b<.98,JSON.stringify(frames));for(let i=2;i<frames.length;i++){assert.ok(frames[i].b<=frames[i-1].b+.02,JSON.stringify(frames));assert.ok(frames[i].c>=frames[i-1].c-.02,JSON.stringify(frames));}evidence.push({case:'background-reentry',frames});
    await venue('observatory');
    await run(`window.maxSurfaces=0;window.surfaceObserver=new MutationObserver(()=>{maxSurfaces=Math.max(maxSurfaces,document.querySelectorAll('.venue-art-buffer').length)});surfaceObserver.observe(document.getElementById('world'),{childList:true});for(let i=0;i<36;i++){venueState={...venueState,venue:['workshop','teahouse','observatory'][i%3]};venue.update(venueState)}void 0`);
    await venue('workshop');assert.ok(await run('maxSurfaces<=3'));await run('surfaceObserver.disconnect();void 0');
  });
  await check('returning to the settled room cancels a pending decode and clears busy state',async()=>{
    await venue('workshop');
    await run(`window.realDecode=HTMLImageElement.prototype.decode;window.releaseDecode=null;HTMLImageElement.prototype.decode=async function(){if(this.classList.contains('venue-art-buffer')&&this.src.includes('teahouse'))await new Promise(resolve=>{releaseDecode=resolve});return realDecode.call(this)};venueState={...venueState,venue:'teahouse'};venue.update(venueState);void 0`);
    await until(`typeof releaseDecode==='function'`,'fixture must hold an actual incoming decode');assert.equal(await run(`document.getElementById('venue-select').getAttribute('aria-busy')`),'true');
    await run(`venueState={...venueState,venue:'workshop'};venue.update(venueState);void 0`);assert.equal(await run(`document.getElementById('venue-select').getAttribute('aria-busy')`),'false');assert.equal(await run(`document.querySelector('.venue-stage').dataset.artState`),'ready');
    await run(`releaseDecode();HTMLImageElement.prototype.decode=realDecode;void 0`);await pause(300);assert.equal(await run(`document.getElementById('room-art').dataset.venue`),'workshop');assert.equal(await run(`document.getElementById('venue-select').getAttribute('aria-busy')`),'false');
  });
  await check('interruption, quiet changes and destruction leave actors and promises intact',async()=>{
    await festival({theme:'summer',hidden:true});await run(`venue.update({...venueState,hidden:true});festival.destroy();venue.destroy();void 0`);await pause(20);
    assert.deepEqual(await run('actorMutations'),[]);assert.deepEqual(await run('errors'),[]);assert.equal(await run(`document.querySelectorAll('.venue-stage,.venue-art-buffer,.festival-stage,.festival-weather').length`),0);
  });
  if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,'interruption-native.json'),JSON.stringify({checks,evidence},null,2));}
  console.log(JSON.stringify({ok:true,checks,evidence,errors:await run('errors'),actorMutations:await run('actorMutations')}));
}).catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
