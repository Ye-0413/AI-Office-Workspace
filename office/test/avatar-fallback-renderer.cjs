'use strict';
// Real production page, local request cancellation and synthetic observations.
// No provider configurations, user sessions, model messages or network calls.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-native-body-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,emptyRoom,blockArtwork=true,snapshotReads=0;
let settings={language:'zh',agentScale:1,sceneTheme:'spring',sceneWeather:'off',reducedMotion:false,idleVisitor:false};
const task=id=>({id:'codex:fallback-'+id,sessionId:'fallback-'+id,provider:'codex',status:'active',activity:'reading',activeTools:1,lastEventAt:Date.now(),events:[],projectPath:'/fixture/fallback'});
const tasks=[task('one'),task('two')];
let snapshot={mode:'live',now:Date.now(),connections:[],sessions:tasks};
const errors=[],expectedFailures=[],checks=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
const preview=process.env.MINI_OFFICE_PREVIEW_DIR;
const run=source=>win.webContents.executeJavaScript(source,true);
const allBody=condition=>`[...document.querySelectorAll('.actor[data-session-id]')].length===2&&[...document.querySelectorAll('.character-body')].every(b=>${condition})`;
const allArrived=`document.getElementById('office').dataset.entranceQueue==='0'&&[...document.querySelectorAll('.actor[data-session-id]')].length===2&&[...document.querySelectorAll('.actor[data-session-id]')].every(n=>{const actor=fallbackActors.get(n.dataset.sessionId);return actor&&!actor.pendingStation&&!actor.navigation&&!actor.motion&&!actor.routeReservation&&!actor.resumeNavigation&&!actor.yielding&&Math.abs(actor.position.x-actor.target.x)<.001&&Math.abs(actor.position.y-actor.target.y)<.001&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.traffic==='arrived'&&n.dataset.walking!=='true'&&!n.getAnimations().some(animation=>animation.pending||animation.playState==='running');})`;
const send=sessions=>{snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);};
async function until(source,label,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(await run(source))return;await pause(20);}throw Error(label+' '+JSON.stringify(await run(`({hidden:document.hidden,visibility:document.visibilityState,mediaReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,officeQuiet:{reduced:document.getElementById('office').dataset.reducedMotion,lowPower:document.getElementById('office').dataset.lowPower},trace:(window.fallbackTrace||[]).slice(-20),bodies:[...document.querySelectorAll('.character-body')].map(b=>({bitmap:b.dataset.bitmapHealth,rig:b.dataset.rigHealth,healing:b.dataset.rigHealing,staticHealing:b.dataset.bitmapHealing,filter:getComputedStyle(b.querySelector('img')).filter})),errors:document.getElementById('error-message').textContent})`)));}
async function screen(name){if(preview){fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,name+'.png'),(await win.webContents.capturePage()).toPNG());}}
function frozenPixels(capture){
  const size=capture.getSize(),pixels=Buffer.from(capture.toBitmap());
  // NativeImage may retain a lazily materialised compositor backing. Own an
  // immediate copy while the reference is still hidden, before any repaint.
  return Object.freeze({getSize:()=>size,toBitmap:()=>pixels});
}
function coloredPixels(capture,sample,tolerance=115){
  const {width,height}=capture.getSize(),pixels=capture.toBitmap(),target=sample.color.match(/../g).map(x=>parseInt(x,16));
  let count=0;const x0=Math.round(sample.x),y0=Math.round(sample.y);
  for(let y=Math.max(0,y0-4);y<Math.min(height,y0+5);y++)for(let x=Math.max(0,x0-10);x<Math.min(width,x0+11);x++){
    const i=(y*width+x)*4,b=pixels[i],g=pixels[i+1],r=pixels[i+2];
    if(Math.abs(r-target[0])+Math.abs(g-target[1])+Math.abs(b-target[2])<tolerance)count++;
  }
  return count;
}
function bodyCoverage(capture,sample){
  const {width,height}=capture.getSize(),pixels=capture.toBitmap(),background=emptyRoom.toBitmap(),target=sample.color.match(/../g).map(x=>parseInt(x,16));
  // A fixed body-space ROI covers both the moving rig and its static backup.
  // It never changes anchors when their presence alphas cross .5, and its
  // margin also covers the compositor frame following the DOM RAF report.
  const r=sample.rect,x0=Math.floor(r.x+r.width*48/154),x1=Math.ceil(r.x+r.width*107/154),y0=Math.floor(r.y+r.height*67/129),y1=Math.ceil(r.y+r.height*104/129);
  const alphas=[];let contrast=0,coreTinted=0;
  for(let y=Math.max(0,y0);y<Math.min(height,y1);y++)for(let x=Math.max(0,x0);x<Math.min(width,x1);x++){
    const i=(y*width+x)*4,b=[background[i+2],background[i+1],background[i]],c=[pixels[i+2],pixels[i+1],pixels[i]],v=target.map((t,k)=>t-b[k]),d=c.map((t,k)=>t-b[k]);
    const distance=d.reduce((s,n)=>s+Math.abs(n),0);if(distance>45)contrast++;
    const length=v.reduce((s,n)=>s+n*n,0);if(length<1600)continue;
    const alpha=d.reduce((s,n,k)=>s+n*v[k],0)/length;
    const residual=d.reduce((s,n,k)=>s+Math.abs(n-alpha*v[k]),0);
    // Test the actual background-to-family-colour blend, rather than distance
    // from an opaque tint. Two simultaneous alpha bridges legitimately show
    // background through a still clearly identifiable body.
    if(alpha>=.35&&alpha<=1.2&&residual<25){alphas.push(alpha);if(x>=r.x+r.width*65/154&&x<=r.x+r.width*90/154&&y>=r.y+r.height*72/129&&y<=r.y+r.height*100/129)coreTinted++;}
  }
  alphas.sort((a,b)=>a-b);
  return{tinted:alphas.length,coreTinted,contrast,medianAlpha:alphas.length?alphas[Math.floor(alphas.length/2)]:0};
}
async function captureFrames(count,{blended=false,label='frames'}={}){
  const samples=[];
  for(let frame=0;frame<count;frame++){
    const report=await run(`new Promise(resolve=>requestAnimationFrame(()=>resolve([...document.querySelectorAll('.actor[data-session-id]')].map(n=>{
      const body=n.querySelector('.character-body'),layer=body.querySelector('.avatar-performance'),fallback=body.querySelector('.avatar-native-fallback');
      const active=!layer.hidden&&Number(getComputedStyle(layer).opacity)>.5;
      const anchor=active?body.querySelector('.ap-torso'):fallback;
      const matrix=anchor.getScreenCTM();const rect=body.getBoundingClientRect();const point=matrix?new DOMPoint(77.5,75).matrixTransform(matrix):{x:rect.left+rect.width*77.5/154,y:rect.top+rect.height*75/129};
      const alpha=s=>{const q=body.querySelector(s);return q?{opacity:getComputedStyle(q).opacity,display:getComputedStyle(q).display,hidden:q.hidden}:null};
      return{id:n.dataset.sessionId,x:point.x,y:point.y,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},alpha:{layer:alpha('.avatar-performance'),image:alpha('img'),native:alpha('.avatar-native-fallback'),base:alpha('.avatar-fallback-base'),outgoing:alpha('.avatar-fallback-outgoing'),use:alpha('.ap-torso use:not(.avatar-fallback-joint)'),backup:alpha('.ap-torso .avatar-fallback-joint')},color:n.querySelector('.family-tint-flood').getAttribute('flood-color').slice(1),same:originalBodies.some(old=>old.node===n&&old.rig===body.querySelector('.ap-rig')),opacity:Number(getComputedStyle(n).opacity),rig:body.dataset.rigHealth,bitmap:body.dataset.bitmapHealth,healthAlpha:parseFloat(getComputedStyle(body.querySelector('img')).getPropertyValue('--avatar-art-alpha')),filter:getComputedStyle(body.querySelector('img')).filter};
    }))))`);
    const capture=await win.webContents.capturePage();
    if(preview&&blended&&frame===0){fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,label+'-first-frame.png'),capture.toPNG());}
    for(const item of report){
      item.colored=coloredPixels(capture,item);item.coverage=bodyCoverage(capture,item);
      const visible=item.coverage.tinted>=80&&item.coverage.coreTinted>=80&&item.coverage.contrast>=140&&(!blended||item.coverage.medianAlpha>=.4)&& (blended||item.colored>=8);
      if(!visible){const dir=preview||path.join(__dirname,'../../../fallback-failure');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'failure-frame-'+frame+'.png'),capture.toPNG());fs.writeFileSync(path.join(dir,'failure-frame-'+frame+'.json'),JSON.stringify({frame,report},null,2));}
      assert.ok(item.same&&item.opacity>.99,JSON.stringify({frame,...item}));assert.ok(visible,'actual screenshot must retain a recognisable family-coloured head '+JSON.stringify({frame,...item}));
    }
    samples.push(report);
  }
  return samples;
}
const guard=setTimeout(()=>{console.error('Native fallback fixture timed out');app.exit(1);},65000);
app.whenReady().then(async()=>{
  // Later observations are explicitly pushed below. Holding the automatic
  // poll avoids an unrelated heartbeat consuming the 220ms fault window.
  for(const[name,fn]of Object.entries({snapshot:()=>++snapshotReads===1?snapshot:new Promise(()=>{}),settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,message)=>errors.push(message));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['file://*/*','http://*/*','https://*/*']},(details,callback)=>{
    const artwork=details.url.includes('/assets/avatars/');
    const blocked=artwork&&blockArtwork;
    if(blocked)expectedFailures.push(details.url);
    if(/^https?:/.test(details.url)){errors.push('Unexpected network request');callback({cancel:true});return;}
    callback({cancel:blocked});
  });
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await run(`window.fallbackActors=new Map();window.fallbackTrace=[];document.getElementById('office').addEventListener('office:actor-arrival',event=>fallbackActors.set(event.detail.actorId,event.detail.actor));const trace=()=>{fallbackTrace.push({at:performance.now(),hidden:document.hidden,mediaReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,bodies:[...document.querySelectorAll('.actor[data-session-id]')].map(n=>({id:n.dataset.sessionId,traffic:n.dataset.traffic,walking:n.dataset.walking,rig:n.querySelector('.character-body').dataset.rigHealth,healing:n.querySelector('.character-body').dataset.rigHealing}))});if(fallbackTrace.length>200)fallbackTrace.shift();};new MutationObserver(trace).observe(document.getElementById('actors'),{subtree:true,attributes:true,attributeFilter:['data-rig-health','data-rig-healing']});document.addEventListener('visibilitychange',trace);void 0`);
  await until(allBody(`b.dataset.bitmapHealth==='failed'&&b.dataset.rigHealth==='failed'`),'both bitmap and rig must fail through real local requests');
  await until(allArrived,'both real main bodies must finish their physical entrance before fixed-position compositor controls',20000);
  await until(`document.querySelector('.venue-stage')?.dataset.artState==='ready'&&document.getElementById('room-art').dataset.theme==='spring'&&!document.querySelector('.venue-art-buffer')`,'reference room artwork must finish its real transition');await pause(450);
  // Only fixture preparation is hidden, before any continuity samples begin.
  // Capture the actual room beneath the same already positioned bodies, then
  // restore them and wait two paints. Empty room itself must fail coverage.
  const emptyCSS=await win.webContents.insertCSS('.character-body,.character-body *{visibility:hidden!important}');
  await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  assert.equal(await run(`[...document.querySelectorAll('.character-body,.character-body *')].every(n=>getComputedStyle(n).visibility==='hidden')`),true,'the reference compositor must contain no body descendants');
  const referenceSample=await run(`(()=>{const n=[...document.querySelectorAll('.actor[data-session-id]')].find(n=>n.querySelector('.family-tint-flood').getAttribute('flood-color')==='#cf81ce');const r=n.querySelector('.character-body').getBoundingClientRect();return{x:r.x+r.width*77.5/154,y:r.y+r.height*75/129,color:'cf81ce'}})()`);
  let emptyCapture;
  for(let attempt=0;attempt<12;attempt++){
    emptyCapture=await win.webContents.capturePage();emptyRoom=frozenPixels(emptyCapture);
    if(coloredPixels(emptyRoom,referenceSample)<8)break;
    // A captured compositor surface can still precede the DOM paint. Keep
    // the CSS hidden until the actual purple-head pixels are absent too.
    await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  }
  assert.ok(coloredPixels(emptyRoom,referenceSample)<8,'the frozen actual room reference must contain no purple head');
  if(preview){fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,'empty-room-reference.png'),emptyCapture.toPNG());}
  await win.webContents.removeInsertedCSS(emptyCSS);await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  // Reproduce the observed orange-head/purple-hands defect in the compositor.
  // The broader blend-aware assertion must reject this real wrong-colour
  // body; visible coloured hands or work props alone cannot satisfy it.
  const orangeCSS=await win.webContents.insertCSS('.character-body .ap-torso,.character-body .ap-foot,.character-body .ap-torso use,.character-body .ap-foot use{filter:none!important}');await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  const orangeSamples=await run(`[...document.querySelectorAll('.actor[data-session-id]')].map(n=>{const r=n.querySelector('.character-body').getBoundingClientRect();return{id:n.dataset.sessionId,color:n.querySelector('.family-tint-flood').getAttribute('flood-color').slice(1),rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})`);
  const purple=orangeSamples.find(n=>n.color==='cf81ce');assert.ok(purple,'retain the contrasting purple-family negative control');
  const purplePoint={x:purple.rect.x+purple.rect.width*77.5/154,y:purple.rect.y+purple.rect.height*75/129,color:purple.color},orangePoint={...purplePoint,color:'de886d'};
  let orangeCapture,orangePixels,orangeCount=0,purpleCount=0;
  for(let attempt=0;attempt<12;attempt++){
    orangeCapture=await win.webContents.capturePage();orangePixels=frozenPixels(orangeCapture);
    // The room's existing light/filter can move the opaque source by ~30 RGB
    // levels in total. A 60 L1 radius still separates orange and purple
    // (their centres are 119 apart), without using the coverage assertion.
    orangeCount=coloredPixels(orangePixels,orangePoint,60);purpleCount=coloredPixels(orangePixels,purplePoint,60);
    if(orangeCount>=80&&purpleCount<8)break;
    await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  }
  const orangeCoverage=bodyCoverage(orangePixels,purple);
  if(preview)fs.writeFileSync(path.join(preview,'orange-head-negative-control.png'),orangeCapture.toPNG());
  if(orangeCount<80||purpleCount>=8||orangeCoverage.coreTinted>=80){const dir=preview||path.join(__dirname,'../../../fallback-failure');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'orange-negative-control-failure.png'),orangeCapture.toPNG());fs.writeFileSync(path.join(dir,'orange-negative-control-failure.json'),JSON.stringify({orangeCount,purpleCount,orangeCoverage},null,2));}
  assert.ok(orangeCount>=80&&purpleCount<8,'the actual negative-control compositor must show an orange head, not an earlier purple frame '+JSON.stringify({orangeCount,purpleCount}));
  assert.ok(orangeCoverage.coreTinted<80,'an orange head with purple hands cannot pass family-colour coverage '+JSON.stringify(orangeCoverage));
  await win.webContents.removeInsertedCSS(orangeCSS);await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  let restoredCount=0;
  for(let attempt=0;attempt<12;attempt++){
    const restored=frozenPixels(await win.webContents.capturePage());restoredCount=coloredPixels(restored,purplePoint,60);
    if(restoredCount>=80)break;
    await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  }
  assert.ok(restoredCount>=80,'restore the actual family-coloured compositor before the continuous fault samples');
  await run(`window.originalBodies=[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({node,rig:node.querySelector('.ap-rig'),joints:[...node.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')],clocks:node.querySelector('.avatar-performance').getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string')}));void 0`);
  const failed=await captureFrames(31);await screen('double-failed-native-body');
  assert.ok(failed[0].every(item=>bodyCoverage(emptyRoom,item).tinted===0),'the actual empty-room negative control cannot satisfy coloured-body coverage');
  checks.push({name:'actual empty-room and orange-head/purple-hands screenshots fail family-body coverage',orangeTinted:orangeCoverage.tinted,orangeCoreTinted:orangeCoverage.coreTinted});
  checks.push({name:'active dual artwork failure retains actual native bodies in 31 captured real frames',frames:failed.length,minColored:Math.min(...failed.flat().map(r=>r.colored))});
  // Recover during an existing performance, interrupt its material healing
  // with a real stale interval and another observed activity, then fail again.
  await pause(3100);blockArtwork=false;send(tasks.map(t=>({...t,lastEventAt:Date.now()})));
  await until(allBody(`b.dataset.rigHealing==='true'`),'the stale crossing must begin during a real rig healing fade',1500);
  assert.equal(await run(allBody(`b.dataset.rigHealing==='true'`)),true);
  send(tasks.map(t=>({...t,status:'stale',lastEventAt:Date.now()})));
  await until(`document.querySelectorAll('.actor[data-stale="true"]').length===2`,'real stale observation must arrive',1000);
  assert.equal(await run(allBody(`b.dataset.rigHealing==='true'`)),true,'stale must actually overlap material healing');
  send(tasks.map(t=>({...t,activity:'planning',lastEventAt:Date.now()})));
  await until(`document.querySelectorAll('.actor[data-stale="false"]').length===2&&[...document.querySelectorAll('.avatar-performance')].every(n=>n.dataset.kind==='notebook')`,'different observed activity must resume the original rig',1000);
  const healed=await captureFrames(36,{blended:true,label:'native-healing'});
  await until(allBody(`b.dataset.rigHealth==='healthy'&&b.dataset.bitmapHealth==='healthy'&&b.dataset.rigHealing==='false'&&b.dataset.bitmapHealing==='false'`),'interrupted heal must finish and release its finite owners');
  assert.equal(await run(`originalBodies.every(old=>old.node.isConnected&&old.rig===old.node.querySelector('.ap-rig')&&old.joints.every(n=>n.isConnected)&&[...old.rig.querySelectorAll('.avatar-fallback-joint')].every(n=>Number(getComputedStyle(n).opacity)<.01))`),true);
  assert.ok(healed.flat().some(r=>r.healthAlpha>0&&r.healthAlpha<1),'actual CSS filter alpha must interpolate during healing');
  assert.ok(healed.flat().some(r=>/opacity\((?:0\.|1\))/ .test(r.filter)),'health alpha is composed with the live family filter');
  await screen('healed-native-to-artwork');checks.push({name:'36 captured healing/stale/different-work frames preserve original bodies, joints and family-colour coverage',frames:healed.length,minTinted:Math.min(...healed.flat().map(r=>r.coverage.tinted)),minCoreTinted:Math.min(...healed.flat().map(r=>r.coverage.coreTinted)),minMedianAlpha:Math.min(...healed.flat().map(r=>r.coverage.medianAlpha))});
  // The next independent resource fault requires a shared retry window.
  // Finish the real planning journeys so their asynchronous route endpoints
  // cannot legitimately start separate per-body retries during preparation.
  await until(allArrived,'both real planning journeys must finish before preparing the second shared healing window',20000);
  // A second failure is scheduled by actual RAFs while the next heal is
  // demonstrably active; capture latency cannot move it outside that window.
  blockArtwork=true;
  await run(`[...document.querySelectorAll('.character-body')].forEach(b=>{b.querySelector('img').src='../assets/avatars/clawd-static-base.svg?native-fault=second';b.querySelector('.ap-rig defs image').setAttribute('href','../assets/avatars/clawd-static-base.svg?native-fault=second')});void 0`);
  await until(allBody(`b.dataset.bitmapHealth==='failed'&&b.dataset.rigHealth==='failed'`),'second real fault must arrive');
  await pause(3100);blockArtwork=false;send(tasks.map(t=>({...t,activity:'planning',lastEventAt:Date.now()})));
  await until(allBody(`b.dataset.rigHealing==='true'`),'second healing window must start',1500);
  blockArtwork=true;
  await run(`window.faultDuringHealing=false;let remaining=3;function interrupt(){if(--remaining>0){requestAnimationFrame(interrupt);return;}faultDuringHealing=[...document.querySelectorAll('.character-body')].every(b=>b.dataset.rigHealing==='true');[...document.querySelectorAll('.character-body')].forEach(b=>{b.querySelector('img').src='../assets/avatars/clawd-static-base.svg?native-fault=interrupted';b.querySelector('.ap-rig defs image').setAttribute('href','../assets/avatars/clawd-static-base.svg?native-fault=interrupted')});}requestAnimationFrame(interrupt);void 0`);
  const interrupted=await captureFrames(31,{blended:true,label:'interrupted-healing'});assert.equal(await run('faultDuringHealing'),true);
  checks.push({name:'failure interrupts a confirmed material heal without losing a body in 31 captured frames',frames:interrupted.length});
  blockArtwork=false;await pause(3100);send(tasks.map(t=>({...t,activity:'planning',lastEventAt:Date.now()})));
  await until(allBody(`b.dataset.rigHealth==='healthy'&&b.dataset.bitmapHealth==='healthy'&&b.dataset.rigHealing==='false'&&b.dataset.bitmapHealing==='false'`),'second recovery must finish');
  // Only the rig fails; the healthy outer bitmap is deliberately left alone.
  // Start a fresh observed activity so this short same-work resource check
  // cannot accidentally cross the previous program's legitimate slow cycle.
  send(tasks.map(t=>({...t,activity:'coding',lastEventAt:Date.now()})));
  await until(`[...document.querySelectorAll('.avatar-performance')].every(n=>n.dataset.kind==='keyboard')`,'fresh coding performance must precede same-clock fault check');
  await until(allArrived,'both actual coding journeys must finish before the independent same-clock resource baseline',20000);
  await run(`(async()=>{const bodies=[...document.querySelectorAll('.character-body')],finite=bodies.flatMap(b=>b.getAnimations({subtree:true})).filter(a=>Number.isFinite(Number(a.effect.getTiming().iterations)));await Promise.allSettled(finite.map(a=>a.finished));await new Promise(resolve=>requestAnimationFrame(resolve));await Promise.all(bodies.flatMap(b=>b.getAnimations({subtree:true})).filter(a=>typeof a.animationName==='string').map(a=>a.ready));})()`);
  const bitmapBefore=await run(`[...document.querySelectorAll('.character-body>img')].map(n=>n.src)`);
  await run(`window.currentHealthClocks=originalBodies.map(old=>old.node.querySelector('.avatar-performance').getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string').map(a=>({a,time:a.currentTime})));void 0`);
  blockArtwork=true;
  await run(`[...document.querySelectorAll('.ap-rig defs image')].forEach(n=>n.setAttribute('href','../assets/avatars/clawd-static-base.svg?native-fault=rig-only'));void 0`);
  await until(allBody(`b.dataset.rigHealth==='failed'&&b.dataset.bitmapHealth==='healthy'`),'rig-only fault must leave static bitmap healthy');
  blockArtwork=false;await pause(3100);send(tasks.map(t=>({...t,activity:'coding',lastEventAt:Date.now()})));
  await until(allBody(`b.dataset.rigHealth==='healthy'&&b.dataset.rigHealing==='false'`),'ordinary production snapshot must retry and heal only the failed rig');
  assert.deepEqual(await run(`[...document.querySelectorAll('.character-body>img')].map(n=>n.src)`),bitmapBefore);
  assert.equal(await run(`originalBodies.every(old=>old.rig===old.node.querySelector('.ap-rig'))`),true);checks.push('rig-only fault heals on a later ordinary production snapshot without replacing bitmap or rig');
  assert.equal(await run(`currentHealthClocks.every((clocks,i)=>clocks.every(({a,time})=>originalBodies[i].node.querySelector('.avatar-performance').getAnimations({subtree:true}).includes(a)&&a.currentTime>=time))`),true,'same-work resource recovery retains the actual original CSS clocks');
  // Unknown and explicit quiet modes still need a physical body.
  for(const mode of ['unknown','quiet']){
    if(mode==='quiet')await run(`const n=document.getElementById('setting-reducedMotion');n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));void 0`);
    blockArtwork=true;
    send(tasks.map(t=>({...t,activity:mode==='unknown'?'unknown':'reading',lastEventAt:Date.now()})));
    await run(`[...document.querySelectorAll('.character-body')].forEach(b=>{b.querySelector('img').src='../assets/avatars/clawd-static-base.svg?native-fault=${mode}';b.querySelector('.ap-rig defs image').setAttribute('href','../assets/avatars/clawd-static-base.svg?native-fault=${mode}')});void 0`);
    await until(allBody(`b.dataset.bitmapHealth==='failed'&&b.dataset.rigHealth==='failed'`),mode+' must enter real dual failure');
    const frames=await captureFrames(8);assert.ok(frames.flat().every(r=>r.colored>=8));
    checks.push(mode+' dual failure retains identifiable native body');
  }
  assert.ok(expectedFailures.length>=4);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks,expectedCanceledArtworkRequests:expectedFailures.length,errors}));
}).catch(error=>{console.error(error);console.error(JSON.stringify({rendererErrors:errors}));process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
