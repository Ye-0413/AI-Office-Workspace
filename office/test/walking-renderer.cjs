'use strict';
// Actual production actor nodes move; this isolated profile never connects AI tools.
const {app,BrowserWindow,ipcMain}=require('electron');
const {installAudit}=require('./support/walking-native-audit.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-walking-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'zh',agentScale:1,sceneTheme:'spring',sceneWeather:'off',reducedMotion:false,idleVisitor:false};
let snapshot={mode:'live',now:Date.now(),connections:[],sessions:[]};
const errors=[],checks=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
const task=(id,activity='reading',parentId)=>({id:'codex:walking-'+id,sessionId:'walking-'+id,provider:'codex',parentId,status:'active',activity,activeTools:1,lastEventAt:Date.now(),events:[],projectPath:'/fixture/walking'});
const checkpoint=label=>console.log('[walking]',label);
const bounded=(promise,label,ms=20000)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));};
const run=code=>bounded(win.webContents.executeJavaScript(code,true),'renderer evaluation '+code.slice(0,100));
const query=id=>`document.querySelector('.actor[data-session-id="${id}"]')`;
function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
async function until(code,label,ms=15000){checkpoint(label);const end=Date.now()+ms;while(Date.now()<end){if(await run(code))return;await wait(20);}throw Error(label+' '+JSON.stringify(await run(`({queue:document.getElementById('office').dataset.entranceQueue,fit:document.getElementById('office').dataset.fitScale,actors:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,traffic:n.dataset.traffic,clone:n.dataset.clonePhase,visibility:getComputedStyle(n).visibility,transform:getComputedStyle(n).transform}))})`)));}
const visible=id=>`${query(id)}&&getComputedStyle(${query(id)}).visibility!=='hidden'&&Number(getComputedStyle(${query(id)}).opacity)>.99`;
const settled=id=>`${visible(id)}&&${query(id)}.dataset.walking!=='true'&&${query(id)}.dataset.traffic==='arrived'`;
async function sample(label,ms,action){
  checkpoint(label);
  const promise=run(`new Promise(resolve=>{const start=performance.now(),seen=new Map(),last=new Map(),fadeStarted=new Map(),violations=[],positions={};let frames=0,maxMoving=0;function tick(now){frames++;const all=[...document.querySelectorAll('.actor')],visible=all.filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.01);maxMoving=Math.max(maxMoving,visible.filter(n=>n.dataset.walking==='true').length);const boxes=visible.map(n=>{const parts=[n.querySelector('.character-body'),n.querySelector('.nameplate')].map(p=>p.getBoundingClientRect()),m=new DOMMatrixReadOnly(getComputedStyle(n).transform),id=n.dataset.sessionId,previous=last.get(id);if(seen.has(id)&&seen.get(id)!==n)violations.push('identity:'+id);seen.set(id,n);if(previous){const d=Math.hypot(m.m41-previous.x,m.m42-previous.y);if(d>400*(now-previous.at)/1000+4)violations.push('jump:'+id+':'+d);}last.set(id,{x:m.m41,y:m.m42,at:now});(positions[id]||=[]).push([m.m41,m.m42]);return{n,id,scale:Math.hypot(m.m11,m.m12),left:Math.min(...parts.map(r=>r.left)),right:Math.max(...parts.map(r=>r.right)),top:Math.min(...parts.map(r=>r.top)),bottom:Math.max(...parts.map(r=>r.bottom))}});for(const[id,n]of seen){if(!n.isConnected)continue;const opacity=Number(getComputedStyle(n).opacity),fade=n.dataset.bodyFade;if(fade&&opacity<.99){if(!fadeStarted.has(id))fadeStarted.set(id,now);if(now-fadeStarted.get(id)>500)violations.push('unbounded-fade:'+id);}else fadeStarted.delete(id);if(getComputedStyle(n).visibility==='hidden'||opacity<.99&&!['absorb','restore'].includes(fade))violations.push('hidden:'+id);}for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],familyEndpoint=(child,parent)=>child.n.dataset.endpointOverlap===parent.id||['splitting','returning','absorbing'].includes(child.n.dataset.clonePhase)&&[child.n.dataset.cloneOrigin,child.n.dataset.cloneTarget].includes(parent.id);if(Math.abs(a.scale-b.scale)>.00002)violations.push('unequal-scale');if(!familyEndpoint(a,b)&&!familyEndpoint(b,a)&&a.left<b.right-.7&&b.left<a.right-.7&&a.top<b.bottom-.7&&b.top<a.bottom-.7)violations.push('overlap:'+a.id+':'+b.id);}if(now-start<${ms})requestAnimationFrame(tick);else resolve({frames,maxMoving,violations:[...new Set(violations)].slice(0,12),distinct:Object.fromEntries(Object.entries(positions).map(([id,points])=>[id,new Set(points.map(p=>p.map(v=>v.toFixed(2)).join(','))).size]))});}requestAnimationFrame(tick);})`);
  if(action)await action();const report=await promise;
  assert.ok(report.frames>=31,label+' needs 31 real rendered frames '+JSON.stringify(report));assert.deepEqual(report.violations,[],label+' '+JSON.stringify(report));checks.push({name:label,...report});return report;
}
const guard=setTimeout(()=>{console.error('Real walking fixture timed out');app.exit(1);},240000);
app.whenReady().then(async()=>{
  checkpoint('app ready');
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  checkpoint('window created');
  win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  win.webContents.on('render-process-gone',(_,details)=>errors.push('renderer gone: '+details.reason));
  await bounded(win.loadFile(path.join(__dirname,'../renderer/index.html')),'production page load');checkpoint('production page loaded');
  win.webContents.debugger.attach('1.3');await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]}),'test media emulation');
  await run('('+installAudit.toString()+')()');
  await run(`window.walkArrivals=[];window.walkActors=new Map();document.getElementById('office').addEventListener('office:actor-arrival',event=>{const d=event.detail;walkActors.set(d.actorId,d.actor);walkArrivals.push({id:d.actorId,zone:d.zone,serial:d.serial,kind:d.kind,x:d.position.x,y:d.position.y})});void 0`);
  let main=task('main');send([main]);await until(`${visible(main.id)}&&${query(main.id)}.dataset.walking==='true'`,'main must physically enter from its door');
  const first=await run(`(()=>{const n=${query(main.id)},m=new DOMMatrixReadOnly(getComputedStyle(n).transform);window.originalWalker=n;window.originalWalk=n.getAnimations().find(a=>a.effect.target===n&&a.constructor.name==='Animation');return{x:m.m41/12.8,y:m.m42/7.2,echoes:document.querySelectorAll('.flat-journey').length}})()`);
  assert.ok(Math.hypot(first.x-87,first.y-78)<4,JSON.stringify(first));assert.equal(first.echoes,0);
  const entrance=await sample('main actual body walks continuously from door across repeated snapshots',1300,async()=>{for(let i=0;i<8;i++){send([{...main,title:'heartbeat '+i,lastEventAt:Date.now()}]);await wait(80);}});
  assert.ok(entrance.distinct[main.id]>=31,'the body itself needs at least 31 distinct physical foot positions');
  assert.equal(await run(`${query(main.id)}===originalWalker&&originalWalker.getAnimations().includes(originalWalk)`),true,'metadata cannot replace the real walk Animation');
  await until(settled(main.id),'main must reach its observed reading area');
  const initial=await run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(originalWalker).transform);return{x:m.m41,y:m.m42}})()`);
  for(const activity of ['coding','testing','reading']){send([{...main,activity,lastEventAt:Date.now()}]);await wait(200);}
  await wait(1800);const jitter=await run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(originalWalker).transform);return{x:m.m41,y:m.m42}})()`);assert.deepEqual(jitter,initial);checks.push('short tool-area jitter merges before changing the physical destination');
  main={...main,activity:'coding',lastEventAt:Date.now()};send([main]);await until(`${query(main.id)}.dataset.walking==='true'`,'stable coding activity must move the actual body');
  const functional=await sample('stable functional change moves the original body and full nameplate',900,async()=>{for(let i=0;i<5;i++){send([{...main,lastEventAt:Date.now()}]);await wait(80);}});assert.ok(functional.distinct[main.id]>=31);await until(settled(main.id),'main must reach its coding station');
  let helper=task('clone','planning',main.id);send([main,helper]);await until(`${visible(helper.id)}&&${query(helper.id)}.dataset.cloneCharge==='true'`,'clone must visibly charge at its actual main before walking');
  const split=await run(`(()=>{const c=${query(helper.id)},r=${query(main.id)},a=new DOMMatrixReadOnly(getComputedStyle(c).transform),b=new DOMMatrixReadOnly(getComputedStyle(r).transform);window.originalClone=c;return{distance:Math.hypot(a.m41-b.m41,a.m42-b.m42),origin:c.dataset.cloneOrigin}})()`);assert.equal(split.origin,main.id);assert.ok(split.distance<1,JSON.stringify(split));
  await sample('size retarget during charged split cancels obsolete reservations and keeps both real bodies visible',1200,async()=>{await wait(80);await run(`(()=>{const n=document.getElementById('setting-agentScale');n.value='65';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(150);await run(`(()=>{const n=document.getElementById('setting-agentScale');n.value='135';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);});await until(settled(helper.id),'clone must reach its planning position');
  let completed={...helper,status:'idle',activity:'idle',activeTools:0,turnCompletedAt:Date.now(),lastEventAt:Date.now()};send([main,completed]);await until(`${query(helper.id)}?.dataset.walking==='true'&&${query(helper.id)}?.dataset.clonePhase==='returning'`,'completed clone must physically walk back');
  await until(`(()=>{const c=${query(helper.id)},r=${query(main.id)};if(!c||c.dataset.walking!=='true'||c.dataset.clonePhase!=='returning')return false;const box=n=>{const a=n.querySelector('.character-body').getBoundingClientRect(),b=n.querySelector('.nameplate').getBoundingClientRect();return{left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom)}};const a=box(c),b=box(r);return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;})()`,'fixture must interrupt inside the actual parent docking envelope');
  await sample('near-dock fresh work separates the same clone across rapid snapshots without an invalid fit',1000,async()=>{helper={...helper,lastEventAt:Date.now()+1};for(let i=0;i<7;i++){send([main,{...helper,lastEventAt:Date.now()+i+1}]);await wait(80);}});
  assert.equal(await run(`${query(helper.id)}===originalClone`),true);await until(settled(helper.id),'fresh clone must continue to its actual observed activity');
  send([main,{...completed,status:'closed',closed:true,lastEventAt:Date.now()}]);await until(`${query(helper.id)}?.dataset.clonePhase==='returning'`,'closed clone must begin a physical return');
  await sample('size retarget during a physical return keeps bodies continuous',900,()=>run(`(()=>{const n=document.getElementById('setting-agentScale');n.value='135';n.dispatchEvent(new Event('change',{bubbles:true}));})()`));
  await until(`${query(helper.id)}?.dataset.bodyFade==='absorb'&&Number(getComputedStyle(${query(helper.id)}).opacity)<.85&&Number(getComputedStyle(${query(helper.id)}).opacity)>.1`,'fixture must interrupt the real final 220ms body absorption');
  const beforeHeal=await run(`Number(getComputedStyle(${query(helper.id)}).opacity)`);
  await sample('fresh actual work interrupts final absorption from its real opacity and foot',1000,async()=>{helper={...helper,lastEventAt:Date.now()+1};send([main,helper]);});
  assert.equal(await run(`${query(helper.id)}===originalClone&&Number(getComputedStyle(originalClone).opacity)>.99`),true);assert.ok(beforeHeal>.1&&beforeHeal<.85);
  await until(settled(helper.id),'healed clone must physically separate back to its observed station');
  send([main,{...completed,status:'closed',closed:true,lastEventAt:Date.now()}]);
  await until(`!${query(helper.id)}`,'clone is absorbed only after its actual return and finite merge');
  const returned=await run(`walkArrivals.filter(e=>e.id===${JSON.stringify(helper.id)}&&e.kind==='return').at(-1)`);assert.ok(returned,'physical completion must expose the actual arrival hook');
  assert.equal(await run(`${query(main.id)}===originalWalker&&Number(getComputedStyle(originalWalker).opacity)>.99`),true);
  send([]);await until(`${query(main.id)}?.dataset.walking==='true'`,'an absent main must physically leave rather than vanish');
  const late=task('late-clone','planning',main.id);send([late]);
  await until(`${query(main.id)}?.dataset.cloneHold==='true'`,'a newly observed descendant must stop its main actual exit');
  await sample('a late real clone retains the same departing main and uses its actual holding dock',900);
  await until(visible(late.id),'the late clone must split after its retained main reaches its holding dock');
  assert.equal(await run(`${query(main.id)}===originalWalker&&${query(late.id)}.dataset.cloneOrigin===${JSON.stringify(main.id)}`),true);
  send([main,late]);await until(`${query(main.id)}?.dataset.cloneHold==='false'`,'actual fresh main activity revokes the held retirement');
  await until(settled(late.id),'late clone must physically finish its entrance');
  send([main,{...late,status:'closed',closed:true,activity:'idle',activeTools:0,lastEventAt:Date.now()}]);await until(`!${query(late.id)}`,'late clone must return physically without removing its resumed main');
  assert.equal(await run(`${query(main.id)}===originalWalker`),true);
  const orphan=task('unknown-parent','coding','codex:unobserved-parent');send([main,orphan]);await until(visible(orphan.id),'a real helper whose parent was never observed cannot stay hidden');assert.equal(await run(`${query(orphan.id)}.dataset.originEvidence==='unobserved-parent'&&${query(orphan.id)}.dataset.cloneOrigin===''&&document.querySelectorAll('.actor').length===2`),true);checks.push('unobserved parent is stated without creating a fake body or fake entrance');
  if(process.env.MINI_OFFICE_WALKING_SHORT!=='1'){
  await until(settled(orphan.id),'the honestly unobserved-parent body must finish its existing restoration before the stress gate');
  const crowd=[main,orphan,...Array.from({length:98},(_,i)=>task('crowd-'+i,['reading','planning','coding','testing'][i%4]))];
  await run(`crowdAudit.begin('all hundred bodies from admission through real route and gait completion',${JSON.stringify(crowd.map(s=>s.id))},[])`);
  const started=Date.now(),deadline=started+150000;let progress=0,lastProgress=started,maxVisible=0,admittedMs=null,settledFrames=0,lastState;
  send(crowd);
  while(Date.now()<deadline){
    const state=await run(`(()=>{const nodes=[...document.querySelectorAll('.actor')],admitted=nodes.filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99),queue=Number(document.getElementById('office').dataset.entranceQueue),audit=crowdAudit.report();const done=admitted.length===100&&queue===0&&admitted.every(n=>{const a=walkActors.get(n.dataset.sessionId);const endpoint=a?!a.motion&&!a.routeReservation&&!a.navigation&&!a.resumeNavigation&&!a.pendingStation&&!a.yielding&&Math.abs(a.position.x-a.target.x)<.001&&Math.abs(a.position.y-a.target.y)<.001:n.dataset.sessionId===${JSON.stringify(orphan.id)};return endpoint&&n.dataset.walking!=='true'&&n.dataset.traffic==='arrived'&&n.dataset.locomotion!=='true'&&n.getAnimations({subtree:true}).every(m=>!(m.constructor.name==='Animation'&&m.effect?.getTiming().iterations!==Infinity&&(m.playState==='running'||m.pending))&&!(m instanceof CSSTransition&&m.transitionProperty==='transform'&&(m.playState==='running'||m.pending)))});return{visible:admitted.length,queue,done,audit}})()`);
    assert.deepEqual(state.audit.violations,[],'the complete hundred-body moving interval stays audited');lastState=state;maxVisible=Math.max(maxVisible,state.visible);
    if(state.visible>progress){progress=state.visible;lastProgress=Date.now();}
    if(admittedMs===null){assert.ok(Date.now()-lastProgress<12000,'entrance queue must make finite progress: '+JSON.stringify(state));if(state.visible===100&&state.queue===0)admittedMs=Date.now()-started;}
    if(state.done){if(!settledFrames)settledFrames=state.audit.frames;if(state.audit.frames-settledFrames>=31)break;}else settledFrames=0;
    await wait(100);
  }
  assert.equal(maxVisible,100,'all 100 authoritative bodies must enter without pages or hidden arrivals');
  assert.ok(lastState.done&&settledFrames&&lastState.audit.frames-settledFrames>=31&&Date.now()<=deadline,'the same original 150-second total budget includes real final endpoints and thirty-one settled gait-to-work frames: '+JSON.stringify(lastState));
  const complete=await run('crowdAudit.finish()');assert.deepEqual(complete.violations,[]);checks.push(complete);
  checks.push({name:'100 real bodies finish admission, actual routes and gait handoff within the original total budget',admittedMs,elapsedMs:Date.now()-started,settledTailFrames:lastState.audit.frames-settledFrames,visible:maxVisible});
  }
  assert.equal(await run(`document.querySelectorAll('.flat-journey').length`),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,coverage:process.env.MINI_OFFICE_WALKING_SHORT==='1'?'core-routes-only':'full-100-body-walking',checks,errors}));
}).catch(async error=>{
  console.error(error);process.exitCode=1;
  if(process.env.MINI_OFFICE_WALKING_PREVIEW_DIR){
    const dir=process.env.MINI_OFFICE_WALKING_PREVIEW_DIR;
    const evidence={error:error.stack,checks,errors};
    try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify(evidence,null,2));}catch(reportError){console.error(reportError);}
    if(win&&!win.isDestroyed())try{
      evidence.geometry=await bounded(win.webContents.executeJavaScript(`(()=>{
        const world=document.getElementById('world').getBoundingClientRect(),factor=world.width/1280,office=document.getElementById('office');
        const rect=value=>({left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height});
        return{audit:window.crowdAudit?.report(),fit:office.dataset.fitScale,queue:office.dataset.entranceQueue,actors:[...document.querySelectorAll('.actor')].map(node=>{
          const style=getComputedStyle(node),matrix=new DOMMatrixReadOnly(style.transform),scale=Math.hypot(matrix.m11,matrix.m12),screen={x:world.left+matrix.m41*factor,y:world.top+matrix.m42*factor};
          const parts=Object.fromEntries(['body','nameplate'].map(part=>{const element=node.querySelector(part==='body'?'.character-body':'.nameplate'),box=element.getBoundingClientRect();return[part,{rect:rect(box),offsets:{left:(screen.x-box.left)/factor/scale,right:(box.right-screen.x)/factor/scale,top:(screen.y-box.top)/factor/scale,bottom:(box.bottom-screen.y)/factor/scale}}];}));
          const dataset=Object.fromEntries(['helper','clonePhase','cloneOrigin','cloneTarget','cloneCharge','endpointOverlap','traffic','trafficHint','walking','bodyFade','stale'].filter(key=>node.dataset[key]!==undefined).map(key=>[key,node.dataset[key]]));
          return{id:node.dataset.sessionId,position:{x:matrix.m41/12.8,y:matrix.m42/7.2},scale,transform:style.transform,opacity:style.opacity,visibility:style.visibility,dataset,...parts};
        })};
      })()`,true),'failure body geometry',3000);
      fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify(evidence,null,2));
    }catch(geometryError){console.error(geometryError);}
    if(win&&!win.isDestroyed())try{fs.writeFileSync(path.join(dir,'failure.png'),(await bounded(win.webContents.capturePage(),'failure capture',3000)).toPNG());}catch(captureError){console.error(captureError);}
  }
}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
