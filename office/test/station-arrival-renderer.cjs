'use strict';
// Production-page navigation and real decorative frames. Never seeks an
// Animation or invents an arrival; all positive cues follow observed snapshots.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installAudit}=require('./support/walking-native-audit.cjs');
const {createWindowVisibility}=require('../lib/window-visibility.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-station-arrival-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,windowVisibility,heartbeat,nativeLatency=null,settings={language:'zh',agentScale:1,reducedMotion:false,lowPower:false,idleVisitor:false,sceneVenue:'workshop',sceneTheme:'spring',sceneWeather:'off',sceneTime:'afternoon'};
const nativeLatencies=[];
let snapshot={mode:'live',now:Date.now(),connections:[],sessions:[]};
const checks=[],errors=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>win.webContents.executeJavaScript(code,true);
function task(id,activity,parentId){return{id:'codex:station-'+id,provider:'codex',sessionId:'station-'+id,parentId,status:'active',activity,turnId:'observed-turn-one',activeTools:1,lastEventAt:Date.now(),events:[],projectPath:'/fixture/station-arrival'};}
const currentSnapshot=()=>({...snapshot,windowVisibility:windowVisibility?.snapshot()||{available:false,hidden:null}});
function send(sessions){snapshot={...snapshot,now:Date.now(),sessions};win.webContents.send('office:snapshot',currentSnapshot());}
async function stationDiagnostic(){
 try{return await run(`({stationState:window.fixtureStationArrivalState?.()||null,actors:[...document.querySelectorAll('.actor')].map(node=>({id:node.dataset.sessionId,dataset:{...node.dataset}})),events:(window.stationEvents||[]).slice(-8),traceCount:window.stationTraces?.length||0})`);}
 catch(error){return{unavailable:String(error.message||error)};}
}
async function until(code,label,ms=28000){const end=Date.now()+ms;while(Date.now()<end){if(errors.length)throw Error(label+': renderer errors: '+JSON.stringify({errors,diagnostic:await stationDiagnostic()}));if(await run(code))return;await wait(20);}throw Error(label+': '+JSON.stringify(await stationDiagnostic()));}
const actor=id=>`document.querySelector('.actor[data-session-id="${id}"]')`;
const settled=id=>`(()=>{const n=${actor(id)};return n&&getComputedStyle(n).visibility!=='hidden'&&n.dataset.walking!=='true'&&!['moving','queued','yielding','waiting-space'].includes(n.dataset.traffic)})()`;
async function control(id,value){await run(`(()=>{const n=document.getElementById(${JSON.stringify(id)});if(!n)throw Error('Missing actual control '+${JSON.stringify(id)});${typeof value==='boolean'?'n.checked='+String(value):'n.value='+JSON.stringify(String(value))};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function pausedWorkClocks(label){
 await until(`(()=>{const s=nativeHiddenIdentity,live=s.rig.getAnimations({subtree:true});return s.clocks.length>0&&s.clocks.every(a=>live.includes(a)&&a.playState==='paused'&&Number.isFinite(a.currentTime))})()`,label+' pauses the original work CSS animations',500);
 const held=await run(`(()=>{window.nativeClockHold=nativeHiddenIdentity.clocks.map(animation=>({animation,time:animation.currentTime}));return nativeClockHold.map(c=>({name:c.animation.animationName,time:c.time}));})()`);
 await wait(90);
 const after=await run(`nativeClockHold.map(c=>({same:nativeHiddenIdentity.rig.getAnimations({subtree:true}).includes(c.animation),paused:c.animation.playState==='paused',drift:Math.abs(c.animation.currentTime-c.time)}))`);
 assert.ok(after.length>0&&after.every(c=>c.same&&c.paused&&c.drift<=.2),label+' preserves paused CSS clock objects without time drift');
 return{count:held.length,maxDrift:Math.max(...after.map(c=>c.drift))};
}

function installStationAudit(){
 const layer=document.getElementById('station-arrivals');if(!layer)throw Error('Missing production station response layer');
 window.stationTraces=[];window.stationEvents=[];window.stationActors=new Map();window.stationIdentities=new Map();
 document.getElementById('office').addEventListener('office:actor-arrival',event=>{
  const d=event.detail;stationActors.set(d.actorId,d.actor);stationEvents.push({id:d.actorId,zone:d.zone,serial:d.serial,kind:d.kind,position:{...d.position},at:performance.now()});
 });
 const box=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const overlaps=(a,b)=>a.left<b.right-.3&&b.left<a.right-.3&&a.top<b.bottom-.3&&b.top<a.bottom-.3;
 const alpha=n=>{let a=1;for(let p=n;p&&p!==layer.parentElement;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden')return 0;a*=Number(s.opacity);}return a;};
 function paintedControls(){
  const result=[];
  // These higher room controls are not transparent full-room stage layers.
  // Check their actual visible vector parts and caption/readout boxes, so a
  // cue cannot pass merely because a few pixels escape an existing plant.
  for(const svg of document.querySelectorAll('.festival-art,.venue-control svg')){
   for(const part of svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,use,text,image')){
    if(part.closest('defs,clipPath,mask')||alpha(part)<=.03)continue;
    const style=getComputedStyle(part),visibleColor=value=>value&&value!=='none'&&value!=='transparent'&&!/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value);
    const fill=visibleColor(style.fill)&&Number(style.fillOpacity)>.03;
    const stroke=visibleColor(style.stroke)&&Number(style.strokeOpacity)>.03&&parseFloat(style.strokeWidth)>0;
    if(!fill&&!stroke&&!['image','use'].includes(part.localName))continue;
    const r=box(part);if(!(r.width>0||r.height>0))continue;
    // SVG client rects exclude painted strokes. Expand only by the actual
    // screen-space half-stroke, never an enclosing stage/empty viewBox.
    const matrix=part.getScreenCTM(),factor=matrix?Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)):1;
    const margin=stroke?parseFloat(style.strokeWidth)*factor/2:0;
    result.push({left:r.left-margin,right:r.right+margin,top:r.top-margin,bottom:r.bottom+margin,owner:svg.classList.contains('festival-art')?'festival-art':'venue-art',part:part.localName});
   }
  }
  for(const part of document.querySelectorAll('.festival-caption,.venue-control-label,.venue-readout,.venue-note-text,.venue-star-target')){
   if(alpha(part)<=.03||!part.textContent.trim())continue;
   const r=box(part);if(r.width>0&&r.height>0)result.push({...r,owner:part.className,part:'caption/readout'});
  }
  return result;
 }
 function start(node){
  if(node.dataset.fixtureRecorded)return;node.dataset.fixtureRecorded='true';
  const ownerId=node.dataset.ownerId,owner=stationActors.get(ownerId),actorNode=owner?.node||document.querySelector('.actor[data-session-id="'+ownerId+'"]');
  const original=actorNode&&{node:actorNode,body:actorNode.querySelector('.character-body'),image:actorNode.querySelector('.character-body>img'),rig:actorNode.querySelector('.ap-rig')};
  const clocks=actorNode?[...actorNode.getAnimations({subtree:true})].filter(a=>typeof a.animationName==='string'&&a.effect.getTiming().iterations===Infinity).map(a=>({animation:a,time:a.currentTime})):[];
  const truth=owner&&JSON.stringify([owner.session.id,owner.session.provider,owner.session.parentId||'',owner.session.status,owner.session.activity,owner.session.turnId||'']);
  const trace={ownerId,serial:node.dataset.ownerSerial,zone:node.dataset.zone,venue:node.dataset.venue,program:node.dataset.program,rows:[],violations:[],startedAt:performance.now(),done:false,clockCount:clocks.length};stationTraces.push(trace);
  function sample(now){
   if(!node.isConnected){trace.done=true;trace.endedAt=now;return;}
   const clock=box(document.getElementById('day-clock')),shapes=[...node.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')].filter(n=>!n.closest('defs,clipPath,mask')&&alpha(n)>.03);
   // Audit every actual painted container separately. Joining a narrow upper
   // body and its wider lower label into one rectangle invents empty corners
   // on the shelf; none of these real body/tag/keepsake parts may be occluded.
   const bodies=[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden').flatMap(n=>[...n.querySelectorAll('.character-body,.nameplate,.actor-title,.actor-relation,.actor-subline,.family-badge,.actor-keepsake')].map(box).filter(r=>r.width>0&&r.height>0));
   const parts=shapes.map(box).filter(r=>r.width>0||r.height>0),controls=paintedControls(),controlOverlaps=[];
   for(const r of parts){if(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5)trace.violations.push('visible prop outside viewport');if(overlaps(r,clock))trace.violations.push('visible prop intersects actual clock');if(bodies.some(b=>overlaps(r,b)))trace.violations.push('visible prop intersects an actual body or nameplate');}
   for(const r of parts)for(const control of controls)if(overlaps(r,control)){
    trace.violations.push('visible prop intersects existing '+control.owner+' '+control.part);
    controlOverlaps.push({prop:r,control});
   }
   const bounds=parts.length?{left:Math.min(...parts.map(r=>r.left)),right:Math.max(...parts.map(r=>r.right)),top:Math.min(...parts.map(r=>r.top)),bottom:Math.max(...parts.map(r=>r.bottom))}:null;
   const signature=JSON.stringify([...node.querySelectorAll('g,path,rect,circle,ellipse,line,polyline,polygon')].filter(n=>!n.closest('defs,clipPath,mask')).map(n=>({transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity,visibility:getComputedStyle(n).visibility})));
   const identical=Boolean(original&&original.node.isConnected&&original.body===actorNode.querySelector('.character-body')&&original.image===actorNode.querySelector('.character-body>img')&&original.rig===actorNode.querySelector('.ap-rig'));
   if(!identical)trace.violations.push('arrival replaced its actual actor/body/image/rig');
   const truthUnchanged=!owner||JSON.stringify([owner.session.id,owner.session.provider,owner.session.parentId||'',owner.session.status,owner.session.activity,owner.session.turnId||''])===truth;
   const clockOwned=clocks.every(c=>actorNode.getAnimations({subtree:true}).includes(c.animation)&&(!Number.isFinite(c.time)||c.animation.currentTime>=c.time-.2));
   trace.rows.push({at:now,elapsed:now-trace.startedAt,alpha:alpha(node),bounds,signature,identical,truthUnchanged,clockOwned,phase:node.dataset.phase,controlParts:controls.length,controlOverlaps});
   if(trace.rows.length>300){trace.violations.push('decorative owner did not finish within bounded real frames');trace.done=true;return;}
   requestAnimationFrame(sample);
  }requestAnimationFrame(sample);
 }
 const observer=new MutationObserver(records=>{for(const record of records)for(const added of record.addedNodes)if(added.nodeType===1){if(added.matches('.station-arrival'))start(added);for(const node of added.querySelectorAll?.('.station-arrival')||[])start(node);}});
 observer.observe(layer,{childList:true,subtree:true});window.stationObserver=observer;
}

function changedPixels(active,empty){
 assert.deepEqual(active.size,empty.size,'fixed furniture pixel comparison keeps identical crop geometry');
 const a=active.bitmap,b=empty.bitmap;assert.equal(a.length,b.length);
 let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>45)changed++;
 return changed;
}
async function completedCue(index,{pixels=true}={}){
 await until(`stationTraces.length>${index}&&stationTraces[${index}].rows.filter(r=>r.alpha>.2&&r.bounds).length>=20`,'a real visible station response must begin');
 const crop=await run(`(()=>{const r=stationTraces[${index}].rows.filter(r=>r.alpha>.2&&r.bounds).at(-1).bounds;return{x:Math.max(0,Math.floor(r.left)-3),y:Math.max(0,Math.floor(r.top)-3),width:Math.ceil(r.right)-Math.floor(r.left)+6,height:Math.ceil(r.bottom)-Math.floor(r.top)+6}})()`);
 const freeze=image=>({size:image.getSize(),bitmap:Buffer.from(image.toBitmap())});
 const active=pixels?freeze(await win.webContents.capturePage(crop)):null;
 await until(`stationTraces[${index}].done`,'the finite response must clean itself up',5000);
 // Decode a fresh compositor image after removal, rather than comparing a
 // lazy backing buffer that may still include the preceding visible prop.
 await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await wait(40);
 const empty=pixels?freeze(await win.webContents.capturePage(crop)):null;
 const trace=await run(`stationTraces[${index}]`),shown=trace.rows.filter(row=>row.alpha>.03&&row.bounds);
 assert.ok(shown.length>=31,trace.program+' needs >=31 actual visible RAF samples');
 const distinct=new Set(shown.map(row=>row.signature));assert.ok(distinct.size>=31,trace.program+' needs >=31 actual changing prop poses');
 assert.ok(shown.some(row=>row.controlParts>0),'actual visible venue/festival artwork is present during the clearance audit');
 assert.deepEqual(trace.violations,[],JSON.stringify(trace));assert.ok(trace.rows.every(row=>row.identical&&row.truthUnchanged&&row.clockOwned),'decorative response cannot replace bodies, mutate observed facts or reset work clocks');
 assert.ok(trace.endedAt-trace.startedAt<2200,'one response is finite');
 const changed=pixels?changedPixels(active,empty):null;if(pixels)assert.ok(changed>=8,'actual compositor pixels, not merely an animated DOM box: '+trace.program+' / '+changed);
 return{venue:trace.venue,zone:trace.zone,program:trace.program,frames:shown.length,distinctPropPoses:distinct.size,pixelChanges:changed,clockCount:trace.clockCount};
}
async function changeActivity(session,activity,{peers=[]}={}){
 const before=await run('stationTraces.length');session={...session,activity,lastEventAt:Date.now()};send([session,...peers]);
 await until(`${actor(session.id)}?.dataset.walking==='true'`,'a genuine functional change starts a physical route');
 assert.equal(await run(`stationTraces.length`),before,'no destination response while the actual body is still walking');
 await until(`${settled(session.id)}&&stationTraces.length>${before}`,'the actual work endpoint creates its appropriate finite response');
 return{session,index:before};
}
const guard=setTimeout(()=>{console.error('Station-arrival production fixture exceeded 240 seconds');app.exit(1);},240000);
app.whenReady().then(async()=>{
 for(const[name,fn]of Object.entries({snapshot:currentSnapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
 ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
 win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 windowVisibility=createWindowVisibility({window:win,watch:true,getAppHidden:process.platform==='darwin'?()=>app.isHidden():undefined,onChange:()=>{if(win&&!win.isDestroyed())win.webContents.send('office:snapshot',currentSnapshot());}});
 // Observe real event/getter timing only. In particular, a minimize event
 // whose native getter is not settled must not be treated as hidden here.
 for(const event of ['minimize','restore','hide','show'])win.on(event,()=>{
  if(nativeLatency&&win&&!win.isDestroyed())nativeLatency.events.push({event,afterRequestMs:Date.now()-nativeLatency.requestedAt,minimized:win.isMinimized(),visible:win.isVisible()});
 });
 win.webContents.on('console-message',detail=>{if(detail.level==='error')errors.push(detail.message);});
 win.webContents.on('render-process-gone',(_,detail)=>errors.push('renderer gone: '+detail.reason));
 await win.loadURL('about:blank');
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
 await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
  let api;
  Object.defineProperty(window,'OfficeStationArrival',{
   configurable:true,get:()=>api,
   set:value=>{api=Object.freeze({...value,create(...args){
    const controller=Reflect.apply(value.create,value,args);
    // Read the same production controller; do not wrap its methods, replace
    // its arguments, or change any arrival/update result or timing.
    window.fixtureStationArrivalState=()=>controller.state();
    return controller;
   }});}
  });
 })();`});
 await win.loadFile(path.join(__dirname,'../renderer/index.html'));
 // The real main process also includes native evidence in its existing 2s
 // snapshot heartbeat, backing up an omitted platform show/hide notification.
 heartbeat=setInterval(()=>{if(win&&!win.isDestroyed())win.webContents.send('office:snapshot',currentSnapshot());},2000);
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 assert.equal(await run('typeof window.fixtureStationArrivalState'), 'function','read-only production station controller diagnostics are attached');
 await run('('+installStationAudit.toString()+')()');await run('('+installAudit.toString()+')()');
 let main=task('main','reading');const programs=[];
 await run(`crowdAudit.begin('real main arrival and all three venue work endpoints',${JSON.stringify([main.id])},[])`);
 const before=await run('stationTraces.length');send([main]);await until(`${actor(main.id)}?.dataset.walking==='true'`,'a new main must actually walk from its door');
 assert.equal(await run('stationTraces.length'),before);await until(`stationTraces.length>${before}`,'first true library arrival');programs.push(await completedCue(before));
 for(const [venue,activities]of [['workshop',['planning','coding','testing']],['teahouse',['reading','planning','coding','testing']],['observatory',['reading','planning','coding','testing']]]){
  if(venue!=='workshop'){
   const count=await run('stationTraces.length');await control('venue-select',venue);await until(`document.getElementById('room-art').dataset.venue===${JSON.stringify(venue)}`,'the real venue picture commits');await wait(450);
   assert.equal(await run('stationTraces.length'),count,'changing the room cannot manufacture an actor arrival');
  }
  for(const activity of activities){const step=await changeActivity(main,activity);main=step.session;programs.push(await completedCue(step.index));}
 }
 assert.equal(programs.length,12);assert.equal(new Set(programs.map(p=>p.venue+'/'+p.zone+'/'+p.program)).size,12);
 checks.push({name:'twelve real 3-venue/4-station programs are visible, distinct and unobstructed',programs});
 const repeated=await run('stationTraces.length');for(let i=0;i<8;i++){send([{...main,title:'observed metadata '+i,lastEventAt:Date.now()}]);await wait(50);}await wait(300);
 assert.equal(await run('stationTraces.length'),repeated,'metadata snapshots cannot restart a completed same-zone response');checks.push('repeated real snapshots preserve the same body and do not replay station decoration');
 const audit=await run('crowdAudit.finish()');assert.deepEqual(audit.violations,[]);checks.push(audit);

 // Deliberately choose one fixed user size with room for both complete large
 // envelopes at their own furniture. Open-floor overflow is valid production
 // behavior, but must not stand in for a library/board endpoint in this audit.
 await control('setting-agentScale',80);await until(settled(main.id),'the explicit 80% family size settles before the observed child enters');
 assert.equal(await run(`Math.hypot(...(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(${actor(main.id)}).transform);return[m.m11,m.m12]})())`),.8,'the fixture uses the actual chosen fixed scale');
 // The child enters through its observed physical parent, not the main door.
 const child=task('child','planning',main.id),childIndex=await run('stationTraces.length');send([main,child]);
 await until(`${actor(child.id)}?.dataset.walking==='true'`,'a real child must physically split and walk');
 assert.equal(await run(`document.querySelectorAll('.station-arrival[data-owner-id="${child.id}"]').length`),0,'no work cue at the charging or walking source');
 assert.equal(await run(`${actor(child.id)}.dataset.cloneOrigin`),main.id);
 await until(`stationTraces.length>${childIndex}`,'the child work endpoint creates a response');
 const childCue=await completedCue(childIndex);assert.equal(childCue.zone,'board');checks.push({name:'observed child reaches its real work zone before a response',...childCue});

 // A same-ID new observed turn must revoke an old decorative owner, without
 // turning that metadata change into a new physical arrival or replay.
 const fresh=await changeActivity(main,'reading',{peers:[child]});main=fresh.session;
 await until(`stationTraces[${fresh.index}].rows.length>=8`,'a real response has visible progress before interruption');
 main={...main,turnId:'observed-turn-two',lastEventAt:Date.now()};send([main,child]);
 await until(`stationTraces[${fresh.index}].done`,'new observed work revokes its stale finite decoration',1500);await wait(300);
 assert.equal(await run('stationTraces.length'),fresh.index+1,'the same-ID fresh turn cannot fake another arrival');
 checks.push('same-ID fresh turn cancels the old cue without changing body identity or fabricating a destination');

 // Context switches clear a finite owner and never replay it on return.
 for(const [id,value,activity]of [['setting-lowPower',true,'coding'],['setting-reducedMotion',true,'testing']]){
  const step=await changeActivity(main,activity,{peers:[child]});main=step.session;
  await until(`stationTraces[${step.index}].rows.length>=5`,'visible context-interruption source');await control(id,value);
  assert.equal(await run(`document.querySelectorAll('.station-arrival').length`),0,'quiet preferences immediately release decorative nodes');
  await control(id,false);await wait(300);assert.equal(await run('stationTraces.length'),step.index+1,'leaving quiet mode does not replay stale arrival');
 }
 checks.push('low-power/reduced-motion interrupt finite decoration immediately without replay');
 await until(settled(main.id),'real bodies settle before the small-window language check');
 await run(`document.getElementById('language-button').click()`);await until(`document.documentElement.lang==='en'`,'real language setting');
 await control('setting-agentScale',65);await until(settled(main.id),'real shared-scale fit completes');
 win.setContentSize(800,450);await wait(300);
 const small=await changeActivity(main,'reading',{peers:[child]});main=small.session;checks.push({name:'English response remains visible and clear at 800x450 and 65%',...await completedCue(small.index)});
 for(const [id,value,activity]of [['festival-theme-select','winter','coding'],['venue-select','workshop','planning'],['setting-agentScale',80,'testing']]){
  const step=await changeActivity(main,activity,{peers:[child]});main=step.session;
  await until(`stationTraces[${step.index}].rows.length>=8`,'a real furniture cue exists before context change');
  await control(id,value);await until(`stationTraces[${step.index}].done`,'context replaces only its finite decorative owner',1500);
  await wait(300);assert.equal(await run('stationTraces.length'),step.index+1,'context changes do not manufacture replay');
 }
 await until(settled(main.id),'scale retarget completes before a visibility interruption');
 const hidden=await changeActivity(main,'reading',{peers:[child]});main=hidden.session;
 await until(`stationTraces[${hidden.index}].rows.length>=5`,'a visible cue exists before the real window hides');
 await run(`(()=>{const a=stationActors.get(${JSON.stringify(main.id)}),rig=a.body.querySelector('.ap-rig');window.nativeHiddenIdentity={node:a.node,body:a.body,image:a.image,rig,clocks:rig.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'&&a.effect.getTiming().iterations===Infinity&&a.playState==='running'),program:a.node.dataset.performanceProgram,programIndex:a.performance.plan.programIndex,session:JSON.stringify([a.session.id,a.session.provider,a.session.parentId||'',a.session.status,a.session.activity,a.session.turnId||''])};})()`);
 // The unmodified Electron Page Visibility path was separately probed and
 // stays visible after real hide/minimize in this runtime. Exercise the same
 // production read-only native snapshot fallback; never assign document.hidden.
 // A real hide is immediate native state, so the active 1400ms response
 // must be revoked before its natural end. OS minimize animation is tested
 // separately below, measured from the real getter rather than its request.
 nativeLatency={kind:'hide',requestedAt:Date.now(),events:[],getterConfirmedAfterMs:null,effectiveHiddenAfterMs:null};nativeLatencies.push(nativeLatency);win.hide();
 const hideEnd=Date.now()+3000;while(win.isVisible()&&Date.now()<hideEnd)await wait(10);
 assert.equal(win.isVisible(),false,'the actual native window is hidden');
 nativeLatency.getterConfirmedAfterMs=Date.now()-nativeLatency.requestedAt;const hideConfirmedAt=Date.now();
 await until(`document.getElementById('office').dataset.hidden==='true'`,'the real hidden getter drives effective room visibility',3000);
 nativeLatency.effectiveHiddenAfterMs=Date.now()-nativeLatency.requestedAt;
 assert.ok(Date.now()-hideConfirmedAt<=500,'confirmed native hide reaches the renderer within the read-only watch bound');
 const nativeHidden=await run(`({documentHidden:document.hidden,effectiveHidden:document.getElementById('office').dataset.hidden,props:document.querySelectorAll('.station-arrival').length,age:performance.now()-stationTraces[${hidden.index}].startedAt})`);
 assert.equal(nativeHidden.props,0,'native hidden evidence immediately clears finite furniture effects');
 assert.ok(nativeHidden.age<1400,'native cleanup precedes the actual cue natural deadline, not an expired response');
 const hiddenEvidence=windowVisibility.snapshot();assert.equal(hiddenEvidence.available,true);assert.equal(hiddenEvidence.hidden,true);assert.equal(hiddenEvidence.visible,false);
 const hideClocks=await pausedWorkClocks('actual hidden window');
 win.showInactive();
 await until(`document.getElementById('office').dataset.hidden==='false'`,'a true native restore releases effective room hiding',3000);await wait(300);
 const restored=await run(`(()=>{const a=stationActors.get(${JSON.stringify(main.id)}),s=nativeHiddenIdentity;return{same:a.node===s.node&&a.body===s.body&&a.image===s.image&&a.body.querySelector('.ap-rig')===s.rig,program:a.node.dataset.performanceProgram,oldProgram:s.program,clocks:s.clocks.every(c=>s.rig.getAnimations({subtree:true}).includes(c)&&c.playState==='running'),truth:JSON.stringify([a.session.id,a.session.provider,a.session.parentId||'',a.session.status,a.session.activity,a.session.turnId||''])===s.session};})()`);
 assert.equal(restored.same,true);assert.equal(restored.truth,true);assert.equal(restored.program,restored.oldProgram,'native quiet suspension retains the observed work-program clock lease');
 assert.equal(restored.clocks,true,'real hide/show preserves every original work CSS animation object');
 assert.equal(await run('stationTraces.length'),hidden.index+1,'visibility restoration cannot replay stale arrival');
 checks.push({name:'theme, venue, shared scale and real native hide cancel active effects before1400ms without replay',nativeVisible:false,nativeEvidence:hiddenEvidence,rawDocumentHidden:nativeHidden.documentHidden,cleanupAgeMs:nativeHidden.age,nativeLatency,pausedWorkClocks:hideClocks,bodyIdentityPreserved:restored.same,observedWorkProgramPreserved:restored.program===restored.oldProgram});

 nativeLatency={kind:'minimize',requestedAt:Date.now(),events:[],getterConfirmedAfterMs:null,effectiveHiddenAfterMs:null};nativeLatencies.push(nativeLatency);win.minimize();
 const minimizeEnd=Date.now()+4000;while(!win.isMinimized()&&Date.now()<minimizeEnd)await wait(10);
 assert.equal(win.isMinimized(),true,'the actual native window finishes minimizing');
 nativeLatency.getterConfirmedAfterMs=Date.now()-nativeLatency.requestedAt;const minimizeConfirmedAt=Date.now();
 await until(`document.getElementById('office').dataset.hidden==='true'`,'confirmed minimized getter reaches effective room visibility',3000);
 nativeLatency.effectiveHiddenAfterMs=Date.now()-nativeLatency.requestedAt;nativeLatency.afterGetterMs=Date.now()-minimizeConfirmedAt;
 assert.ok(nativeLatency.afterGetterMs<=500,'confirmed native minimize reaches the renderer within500ms, independent of OS animation duration');
 const minimizedEvidence=windowVisibility.snapshot();assert.equal(minimizedEvidence.available,true);assert.equal(minimizedEvidence.hidden,true);assert.equal(minimizedEvidence.minimized,true);
 const minimizeClocks=await pausedWorkClocks('actual minimized window');
 assert.equal(await run('document.querySelectorAll(".station-arrival").length'),0);
 win.restore();win.showInactive();await until(`document.getElementById('office').dataset.hidden==='false'`,'real minimized restore releases effective room visibility',3000);await wait(300);
 const afterMinimize=await run(`(()=>{const a=stationActors.get(${JSON.stringify(main.id)}),s=nativeHiddenIdentity;return{same:a.node===s.node&&a.body===s.body&&a.image===s.image&&a.body.querySelector('.ap-rig')===s.rig,program:a.node.dataset.performanceProgram,oldProgram:s.program,programIndex:a.performance.plan.programIndex,oldProgramIndex:s.programIndex,programCount:OfficeAvatarPerformanceModel.PROGRAMS[a.performance.plan.kind].length,validProgram:OfficeAvatarPerformanceModel.PROGRAMS[a.performance.plan.kind].includes(a.node.dataset.performanceProgram),liveClocks:s.rig.getAnimations({subtree:true}).filter(c=>typeof c.animationName==='string'&&c.effect.getTiming().iterations===Infinity).map(c=>c.playState),clocks:s.clocks.every(c=>s.rig.getAnimations({subtree:true}).includes(c)&&c.playState==='running'),truth:JSON.stringify([a.session.id,a.session.provider,a.session.parentId||'',a.session.status,a.session.activity,a.session.turnId||''])===s.session,remaining:document.querySelectorAll('.station-arrival').length};})()`);
 assert.equal(afterMinimize.same,true);assert.equal(afterMinimize.truth,true);assert.equal(afterMinimize.remaining,0);
 // The OS minimize animation is still visible work time. A due rotation may
 // run on a subsequent visible update after the original pause lease resumes;
 // the dedicated boundary fixture separately checks that first exact resume.
 if(afterMinimize.program===afterMinimize.oldProgram)assert.equal(afterMinimize.clocks,true);
 else {
  assert.equal(afterMinimize.programIndex,(afterMinimize.oldProgramIndex+1)%afterMinimize.programCount);
  assert.equal(afterMinimize.validProgram,true);assert.ok(afterMinimize.liveClocks.length>0);
  assert.ok(afterMinimize.liveClocks.every(state=>state==='running'));
 }
 assert.equal(await run('stationTraces.length'),hidden.index+1,'minimize/restore cannot replay a completed or canceled cue');
 checks.push({name:'real native minimize pauses original work clocks promptly after actual getter confirmation',nativeMinimized:true,nativeEvidence:minimizedEvidence,nativeLatency,pausedWorkClocks:minimizeClocks,restored:afterMinimize});
 assert.equal(await run(`getComputedStyle(document.getElementById('station-arrivals')).pointerEvents`),'none');
 await run(`window.dispatchEvent(new Event('beforeunload'))`);await wait(250);
 assert.equal(await run(`document.querySelectorAll('.station-arrival').length`),0,'renderer teardown owns finite cleanup');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,scope:'production-actual-station-arrival',checks,errors}));
}).catch(async error=>{
 console.error(error);process.exitCode=1;
 try{const geometry=await run(`(()=>{const world=document.getElementById('world').getBoundingClientRect(),factor=world.width/1280;return [...document.querySelectorAll('.actor')].map(node=>{const m=new DOMMatrixReadOnly(getComputedStyle(node).transform),scale=Math.hypot(m.m11,m.m12),foot={x:world.left+m.m41*factor,y:world.top+m.m42*factor},parts=['.character-body','.nameplate'].map(selector=>node.querySelector(selector).getBoundingClientRect());return{id:node.dataset.sessionId,x:m.m41/12.8,y:m.m42/7.2,scale,dataset:{...node.dataset},footprint:{left:Math.ceil((foot.x-Math.min(...parts.map(r=>r.left)))/factor/scale)+6,right:Math.ceil((Math.max(...parts.map(r=>r.right))-foot.x)/factor/scale)+6,top:Math.ceil((foot.y-Math.min(...parts.map(r=>r.top)))/factor/scale)+6,bottom:Math.ceil((Math.max(...parts.map(r=>r.bottom))-foot.y)/factor/scale)+6}};});})()`);console.error(JSON.stringify({settings,sessions:snapshot.sessions,geometry}));}catch(captureError){console.error('geometry unavailable: '+captureError.message);}
 const directory=process.env.MINI_OFFICE_PREVIEW_DIR||path.resolve(__dirname,'../../work/station-arrival-failure');fs.mkdirSync(directory,{recursive:true});
 try{fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:String(error.stack||error),checks,errors,nativeLatency,nativeLatencies,nativeWindow:win&&!win.isDestroyed()?{minimized:win.isMinimized(),visible:win.isVisible()}:null,stationDiagnostic:await stationDiagnostic(),rendererVisibility:await run(`({documentHidden:document.hidden,effectiveHidden:document.getElementById('office').dataset.hidden,props:document.querySelectorAll('.station-arrival').length})`),traces:await run('window.stationTraces||[]'),events:await run('window.stationEvents||[]')},null,2));fs.writeFileSync(path.join(directory,'failure.png'),(await win.webContents.capturePage()).toPNG());}catch(captureError){console.error('bounded failure capture unavailable: '+captureError.message);}
}).finally(()=>{clearTimeout(guard);clearInterval(heartbeat);windowVisibility?.dispose();win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
