'use strict';
// Actual production snapshots, room actors and WAAPI; no layout/owner injection.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installAudit}=require('./support/walking-native-audit.cjs');
const Walking=require('../lib/walking-layout.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-walking-transfer-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const errors=[],checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win,lastAudit=null,stage='startup',snapshot={mode:'live',now:Date.now(),connections:[],sessions:[]};
let settings={language:'zh',agentScale:1,reducedMotion:false,lowPower:false,idleVisitor:false,sceneVenue:'workshop',sceneTheme:'spring',sceneWeather:'off'};
const preview=process.env.MINI_OFFICE_TRANSFER_PREVIEW_DIR;
const task=(index,activity,parentId)=>({id:'codex:transfer-'+String(index).padStart(3,'0'),sessionId:'transfer-'+index,provider:'codex',status:'active',activity,parentId,activeTools:['idle','unknown'].includes(activity)?0:1,lastEventAt:Date.now(),projectPath:'/fixture/transfer',events:[],evidence:{source:'hook',confidence:'explicit'}});
const run=code=>win.webContents.executeJavaScript(code,true);
function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
const settled=count=>`(()=>{const nodes=[...document.querySelectorAll('.actor[data-session-id]')];return nodes.length===${count}&&!document.getElementById('office').dataset.transferStatus&&nodes.every(n=>{const a=crowdActors.get(n.dataset.sessionId);return a&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.walking!=='true'&&!a.motion&&!a.routeReservation&&!a.navigation&&!a.resumeNavigation&&!a.pendingStation&&!a.yielding&&(n.dataset.traffic==='arrived'||a.holdingFamily===true)&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase);})&&Number(document.getElementById('office').dataset.entranceQueue)===0})()`;
const movingStep=(step,ids)=>`(()=>{const office=document.getElementById('office');if(office.dataset.transferStatus!=='running'||office.dataset.transferStep!==${JSON.stringify(String(step))})return false;return ${JSON.stringify(ids)}.some(id=>{const actor=crowdActors.get(id),motion=actor?.motion;if(!motion?.effect||motion.pending||motion.playState!=='running')return false;const progress=motion.effect.getComputedTiming().progress,keys=motion.effect.getKeyframes(),start=new DOMMatrixReadOnly(keys[0].transform),actual=new DOMMatrixReadOnly(getComputedStyle(actor.node).transform);return progress>.15&&progress<.85&&Math.hypot(actual.m41-start.m41,actual.m42-start.m42)>=24;});})()`;

async function until(predicate,label,ms=70000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){
    const audit=await run('crowdAudit.report()');if(audit)assert.deepEqual(audit.violations,[],stage+': '+JSON.stringify(audit));
    if(await run(predicate))return;
    await pause(45);
  }
  throw Error(stage+': '+label);
}
async function begin(name,ids){stage=name;console.log('[walking-transfer]',name);await run(`crowdAudit.begin(${JSON.stringify(name)},${JSON.stringify(ids)})`);}
async function finish(minimumScale=.4){
  const report=lastAudit=await run('crowdAudit.finish()');assert.deepEqual(report.violations,[]);
  assert.ok(report.frames>=31,'requires31 actual audited RAF');
  assert.ok(report.minScale>=minimumScale-.00001,'needless body shrink: '+JSON.stringify(report));checks.push(report);return report;
}
async function settledTail(count){
  await run(`window.transferTail={frames:0};function tailFrame(){if(${settled(count)})transferTail.frames++;else transferTail.frames=0;if(transferTail.frames<31)requestAnimationFrame(tailFrame);}requestAnimationFrame(tailFrame);void 0`);
  await until('transferTail.frames>=31','requires31 fully drained real tail frames',4000);
}
async function setting(name,value){
  await run(`(()=>{const input=document.getElementById(${JSON.stringify('setting-')}+${JSON.stringify(name)});input.checked=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`document.getElementById('office').dataset[${JSON.stringify(name)}]===${JSON.stringify(String(value))}`,'actual setting must apply',3000);
}
async function sameOriginalBodies(){
  assert.equal(await run(`[...transferOriginals].every(([id,old])=>{const a=crowdActors.get(id);return a===old.actor&&a.node===old.node&&a.node.isConnected&&a.body===old.body&&a.body.querySelector('.ap-rig')===old.rig;})`),true);
}
async function capture(name){
  if(!preview)return;fs.mkdirSync(preview,{recursive:true});
  fs.writeFileSync(path.join(preview,name+'.png'),(await win.webContents.capturePage()).toPNG());
  const data=await run(`({audit:crowdAudit.report(),rows:[...crowdActors].map(([id,a])=>({id,serial:a.serial,target:a.target,navigation:a.navigation?.kind,holding:a.holdingFamily,position:a.position,dataset:{...a.node.dataset}}))})`);data.lastFinishedAudit=lastAudit;fs.writeFileSync(path.join(preview,name+'.json'),JSON.stringify(data,null,2));
}
const guard=setTimeout(()=>{console.error('Walking transfer fixture timed out at '+stage);app.exit(1);},240000);
app.whenReady().then(async()=>{
  for(const[name,action]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_, ...args)=>action(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  win.webContents.on('render-process-gone',(_,details)=>errors.push('renderer gone: '+details.reason));
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await run('('+installAudit.toString()+')()');
  const kinds=['reading','planning','coding','testing','idle','unknown'];
  let cast=Array.from({length:12},(_,i)=>task(i,kinds[i%6]));
  const parent=cast[2],helper=task(12,'planning',parent.id);cast.push(helper);
  const ids=cast.map(s=>s.id),participants=[cast[0].id,cast[8].id];
  await begin('thirteen actual bodies use main door and observed-parent split',ids);send(cast);
  await until(settled(13),'every actual entrance and split must finish');await finish();
  assert.equal(await run(`crowdActors.size`),13);
  await run(`window.transferOriginals=new Map([...crowdActors].map(([id,a])=>[id,{actor:a,node:a.node,body:a.body,rig:a.body.querySelector('.ap-rig')}]));void 0`);
  cast=cast.filter(s=>s.id!==parent.id);
  await begin('an honestly absent parent waits at its actual dock for a working clone',ids);send(cast);
  await until(`crowdActors.get(${JSON.stringify(parent.id)})?.holdingFamily===true&&${settled(13)}`,'actual lifecycle must establish the held parent');
  await run(`window.transferFixedFoot=(()=>{const a=crowdActors.get(${JSON.stringify(parent.id)}),m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);return{x:m.m41,y:m.m42};})();void 0`);
  await pause(550);await finish();
  const before=await run('crowdArrivals.length');
  await run(`window.transferTrace={frames:0,active:false,minimumScale:Infinity,fixedDrift:0,original:true,feet:new Map(${JSON.stringify(participants)}.map(id=>[id,new Set()])),poses:new Map(${JSON.stringify(participants)}.map(id=>[id,new Set()])),steps:new Set(),settledTailFrames:0};
    function transferFrame(){const t=transferTrace;if(!t.active)return;t.frames++;const status=document.getElementById('office').dataset.transferStatus,step=document.getElementById('office').dataset.transferStep;if(status==='running')t.steps.add(Number(step));if(t.tail&&${settled(13)})t.settledTailFrames++;else if(t.tail)t.settledTailFrames=0;for(const[id,old]of transferOriginals){const a=crowdActors.get(id);if(!a||a!==old.actor||a.node!==old.node||a.body!==old.body||a.body.querySelector('.ap-rig')!==old.rig)t.original=false;}
    const p=crowdActors.get(${JSON.stringify(parent.id)}),pm=new DOMMatrixReadOnly(getComputedStyle(p.node).transform);t.fixedDrift=Math.max(t.fixedDrift,Math.hypot(pm.m41-transferFixedFoot.x,pm.m42-transferFixedFoot.y));
    for(const id of ${JSON.stringify(participants)}){const a=crowdActors.get(id),m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);t.minimumScale=Math.min(t.minimumScale,Math.hypot(m.m11,m.m12));if(a.node.dataset.walking==='true'){t.feet.get(id).add(m.m41.toFixed(3)+','+m.m42.toFixed(3));t.poses.get(id).add([...a.body.querySelectorAll('.ap-rig .ap-upper,.ap-rig .ap-eyes,.ap-rig .ap-arm,.ap-rig .ap-foot')].map(n=>getComputedStyle(n).transform).join('|'));}}
    requestAnimationFrame(transferFrame);}
    transferTrace.active=true;requestAnimationFrame(transferFrame);void 0`);
  cast=cast.map(s=>s.id===participants[0]?{...s,activity:'coding',lastEventAt:Date.now()}:s.id===participants[1]?{...s,activity:'reading',lastEventAt:Date.now()}:s);
  await begin('two real functional changes retain a .4 cast through actual temporary yielding',ids);send(cast);
  for(let i=0;i<12;i++){await pause(180);send(cast.map(s=>({...s,title:'metadata refresh '+i,lastEventAt:Date.now()})));}
  await until(`(()=>{const events=crowdArrivals.slice(${before});return ${JSON.stringify(participants)}.every(id=>events.some(e=>e.id===id&&e.kind==='station'))&&${settled(13)}})()`,'all three physical requests and final work arrivals must finish');
  await run('transferTrace.tail=true;void 0');await until('transferTrace.settledTailFrames>=31','requires31 actual fully-drained settled tail frames',4000);const audit=await finish();
  const trace=await run(`(()=>{transferTrace.active=false;const t=transferTrace;return{frames:t.frames,minimumScale:t.minimumScale,fixedDrift:t.fixedDrift,original:t.original,steps:[...t.steps],settledTailFrames:t.settledTailFrames,feet:Object.fromEntries([...t.feet].map(([id,set])=>[id,set.size])),poses:Object.fromEntries([...t.poses].map(([id,set])=>[id,set.size])),arrivals:crowdArrivals.slice(${before}),actors:[...crowdActors].map(([id,a])=>{const m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);return{id,position:a.position,computedFoot:{x:m.m41/12.8,y:m.m42/7.2},target:a.target,serial:a.serial,navigation:a.navigation?.kind,holding:a.holdingFamily};})};})()`);
  assert.ok(trace.settledTailFrames>=31);
  assert.deepEqual(trace.steps.sort(),[0,1,2],'all three real finite request phases must be observed');
  assert.equal(trace.original,true,'same actual actors, bodies and rigs survive the full transfer');
  assert.ok(trace.fixedDrift<.01,'the true held parent cannot be assigned an ordinary move');
  for(const id of participants){assert.ok(trace.feet[id]>=31,'participant must really walk across31 distinct feet: '+id);assert.ok(trace.poses[id]>=31,'participant must expose31 distinct real gait poses: '+id);}
  for(const [id,expected]of [[participants[0],'desk'],[participants[1],'library']]){
    const a=trace.actors.find(row=>row.id===id);assert.equal(a.target.workZone,expected);assert.equal(a.target.zone,expected);
    assert.ok(Walking.ZONE_AREAS[expected].some(area=>a.computedFoot.x>=area.x1-1e-5&&a.computedFoot.x<=area.x2+1e-5&&a.computedFoot.y>=area.y1-1e-5&&a.computedFoot.y<=area.y2+1e-5),'actual physical foot must be in the requested functional area');
    assert.ok(Math.hypot((a.computedFoot.x-a.target.x)*12.8,(a.computedFoot.y-a.target.y)*7.2)<.75,'actual computed foot must finish at its true work target');
  }
  for(const arrival of trace.arrivals.filter(e=>participants.includes(e.id)&&e.kind==='station')){
    const target=trace.actors.find(a=>a.id===arrival.id).target;
    assert.ok(Math.hypot((arrival.position.x-target.x)*12.8,(arrival.position.y-target.y)*7.2)<.75,'a temporary pocket cannot emit work-station arrival');
  }
  assert.ok(audit.yieldingFrames>=5,'this regression must physically exercise real temporary yielders');
  checks.push({name:'same real bodies, held parent and participant trajectories',...trace});
  await capture('thirteen-transfer-settled');

  // Interrupt a genuinely executing second request, not the pending debounce.
  // Quieting is a real settings operation; it never supplies a fake endpoint.
  cast=cast.map(s=>s.id===participants[0]?{...s,activity:'reading',lastEventAt:Date.now()}:s.id===participants[1]?{...s,activity:'coding',lastEventAt:Date.now()}:s);
  await begin('a real quiet setting interrupts the second request from its actual feet',ids);send(cast);
  await until(movingStep(1,participants),'reverse exchange must really execute its second request');
  await run(`window.interruptedTransfer=[...crowdActors.values()].map(a=>a.navigation?.transferOwner).find(Boolean);window.interruptedFeet={at:performance.now(),rows:[...crowdActors].map(([id,a])=>{const m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);const motion=a.motion,keys=motion?.effect?.getKeyframes(),start=keys?.length?new DOMMatrixReadOnly(keys[0].transform):m;return{id,x:m.m41,y:m.m42,legDisplacement:Math.hypot(m.m41-start.m41,m.m42-start.m42)};})};void 0`);
  assert.equal(await run('interruptedTransfer?.phase==="running"&&interruptedTransfer.index===1'),true,'the second request still owns the interruption boundary');
  assert.equal(await run(`interruptedFeet.rows.some(row=>${JSON.stringify(participants)}.includes(row.id)&&row.legDisplacement>=24)`),true,'the second request has physically left its source before quieting');
  await setting('lowPower',true);
  await until(`!document.getElementById('office').dataset.transferStatus`,'quiet change revokes the whole finite owner',3000);
  const interrupted=await run(`(()=>{const dt=performance.now()-interruptedFeet.at;return{dt,rows:interruptedFeet.rows.map(before=>{const a=crowdActors.get(before.id),m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);return{id:before.id,legDisplacementBefore:before.legDisplacement,distance:Math.hypot(m.m41-before.x,m.m42-before.y)};}),oldOwnerStillAttached:[...crowdActors.values()].some(a=>a.navigation?.transferOwner===interruptedTransfer||a.routeReservation?.transferOwner===interruptedTransfer)};})()`);
  assert.equal(interrupted.oldOwnerStillAttached,false);
  assert.ok(interrupted.rows.every(row=>row.distance<=320*interrupted.dt/1000+2),'setting cancellation must continue from sampled actual feet');
  await until(settled(13),'cancelled transfer must finish its honest current work routes');await settledTail(13);await sameOriginalBodies();
  const quietAudit=await finish(0);assert.equal(quietAudit.distinctFootPositions[parent.id],1,'quiet cancellation cannot move the truly held parent');
  assert.ok(interrupted.rows.find(row=>row.id===parent.id).distance<.01);checks.push({name:'real mid-second-request quiet cancellation retains actual feet and releases the old owner',...interrupted});

  await begin('normal presentation restores after the real quiet interruption',ids);await setting('lowPower',false);
  await until(`${settled(13)}&&[...document.querySelectorAll('.actor[data-session-id]')].every(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return Math.hypot(m.m11,m.m12)>=.4-.00001;})`,'the tested thirteen-body distribution must recover its .4 settled size');
  await settledTail(13);const restoredAudit=await finish(0);assert.equal(restoredAudit.distinctFootPositions[parent.id],1);

  // A new observed main may arrive while the third request is walking. It
  // must invalidate the certificate and then really walk through the door.
  cast=cast.map(s=>s.id===participants[0]?{...s,activity:'coding',lastEventAt:Date.now()}:s.id===participants[1]?{...s,activity:'reading',lastEventAt:Date.now()}:s);
  await begin('a later real cast change interrupts an executing third request',ids);send(cast);
  await until(movingStep(2,participants),'next exchange must really reach its third request');
  const newcomer=task(13,'testing');cast.push(newcomer);
  const interruptedThird=await finish(0);assert.equal(interruptedThird.distinctFootPositions[parent.id],1);
  await begin('a new actual main revokes the old exchange and finishes physical admission',ids.concat(newcomer.id));
  // Seed the independent frame audit before changing the actual cast. Its
  // previous-position Map is empty immediately after begin().
  await until('crowdAudit.report().frames>=1','new-cast audit needs a real before frame',1000);
  await run(`window.admissionFeet={at:performance.now(),rows:[...crowdActors].map(([id,a])=>{const m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);const motion=a.motion,keys=motion?.effect?.getKeyframes(),start=keys?.length?new DOMMatrixReadOnly(keys[0].transform):m;return{id,x:m.m41,y:m.m42,legDisplacement:Math.hypot(m.m41-start.m41,m.m42-start.m42)};})};window.admissionOldOwner=[...crowdActors.values()].map(a=>a.navigation?.transferOwner).find(Boolean);void 0`);
  assert.equal(await run('admissionOldOwner?.phase==="running"&&admissionOldOwner.index===2'),true,'the third request still owns the new-cast boundary');
  assert.equal(await run(`admissionFeet.rows.some(row=>${JSON.stringify(participants)}.includes(row.id)&&row.legDisplacement>=24)`),true,'the third request has physically left its source before the cast changes');
  send(cast);
  await until(`!document.getElementById('office').dataset.transferStatus`,'new cast revokes the previous finite generation',3000);
  const admissionBoundary=await run(`(()=>{const dt=performance.now()-admissionFeet.at;return{dt,rows:admissionFeet.rows.map(before=>{const a=crowdActors.get(before.id),m=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);return{id:before.id,legDisplacementBefore:before.legDisplacement,distance:Math.hypot(m.m41-before.x,m.m42-before.y)};}),oldOwnerStillAttached:[...crowdActors.values()].some(a=>a.navigation?.transferOwner===admissionOldOwner||a.routeReservation?.transferOwner===admissionOldOwner)};})()`);
  assert.equal(admissionBoundary.oldOwnerStillAttached,false);assert.ok(admissionBoundary.rows.every(row=>row.distance<=320*admissionBoundary.dt/1000+2),'new-cast cancellation preserves sampled physical feet');assert.ok(admissionBoundary.rows.find(row=>row.id===parent.id).distance<.01);
  checks.push({name:'the observed cast change includes a real pre-snapshot frame and preserves original physical feet',...admissionBoundary});
  for(let i=0;i<5;i++){await pause(180);send(cast.map(s=>({...s,lastEventAt:Date.now()})));}
  await until(settled(14),'new main, old work and automatic yielders must all finish');await settledTail(14);await sameOriginalBodies();
  const admission=await finish(0);assert.equal(admission.distinctFootPositions[parent.id],1);assert.equal(admission.maxVisible,14);assert.ok(admission.distinctFootPositions[newcomer.id]>=31,'the new real main must physically walk from the door');
  await capture('interrupted-transfer-new-main-settled');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,scope:'actual-thirteen-body-functional-transfer',checks,errors}));
}).catch(async error=>{console.error(error);process.exitCode=1;if(win&&!win.isDestroyed())try{await capture('failure');}catch(e){console.error(e);}}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
