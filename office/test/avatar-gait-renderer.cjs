'use strict';
// A real rig walks in an isolated native document; no provider connection.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-gait-'));
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
let win;const errors=[],checks=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=source=>win.webContents.executeJavaScript(source,true);
const guard=setTimeout(()=>{console.error('Native gait fixture timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
  const renderer=pathToFileURL(path.resolve(__dirname,'../renderer')).href+'/';
  fs.writeFileSync(path.join(scratch,'fixture.html'),`<!doctype html><html><head><base href="${renderer}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="avatar-fallback.css"><link rel="stylesheet" href="family-appearance.css"><style>body{background:#665745}.actor{transform:translate(520px,460px) scale(2);z-index:10}.fixture-floor{position:absolute;left:100px;right:100px;top:580px;border-top:1px solid #bba274}.actor-button{pointer-events:none}</style></head><body><div class="fixture-floor"></div><div class="actor" id="walker"><button class="actor-button"><span class="character-body"><img data-asset="clawd-static-base.svg" src="../assets/avatars/clawd-static-base.svg"></span><span class="nameplate"><strong>踏云行者</strong><small>主 Agent · 活跃 0 · 累计 0</small></span></button><span class="actor-prop" data-carry="false">≡</span></div><script src="../lib/avatar-performance-model.js"></script><script src="../lib/walk-timing.js"></script><script src="avatar-performance.js"></script><script src="avatar-fallback.js"></script><script src="../lib/family-model.js"></script><script src="family-appearance.js"></script><script>window.actor=document.getElementById('walker');window.body=actor.querySelector('.character-body');window.image=body.querySelector('img');window.session={id:'codex:gait',provider:'codex',status:'active',activity:'coding',activeTools:1};window.truth=JSON.stringify(session);window.clocks=OfficeAvatarPerformanceModel.createClockRegistry({limit:4});window.controller=OfficeAvatarPerformance.create({actorNode:actor,body,session,clockRegistry:clocks});window.fallback=OfficeAvatarFallback.create({actorNode:actor,body,image});window.palette=OfficeFamily.createPaletteRegistry();palette.update([session.id]);window.family=OfficeFamilyAppearance.create({actorNode:actor,body,image});family.update({rootId:session.id,appearance:palette.forRoot(session.id)});controller.update(session,{now:0});window.sample=()=>({rig:Number(getComputedStyle(body.querySelector('.avatar-performance')).opacity),bitmap:Number(getComputedStyle(image).opacity),joints:[...body.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[m.a,m.b,m.c,m.d,m.e,m.f]}),feet:[...body.querySelectorAll('.ap-foot')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[m.a,m.b,m.c,m.d,m.e,m.f]})});</script></body></html>`);
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,...args)=>{const detail=args[0];if(typeof detail==='object'&&detail.level==='error')errors.push(detail.message);});
  await win.loadFile(path.join(scratch,'fixture.html'));
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await wait(300);
  assert.equal(await run('document.hidden'),false);
  await run(`window.rig=body.querySelector('.ap-rig');window.prop=body.querySelector('.ap-props-back').firstElementChild;window.cssClocks=body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string');for(const a of cssClocks)a.currentTime=5276;window.originalProgram=controller.plan.program;void 0`);
  await wait(30);
  const takeover=await run(`(()=>{const before=sample();actor.dataset.walking='true';controller.update(session,{now:100,walking:true});window.gaitLoops=body.getAnimations({subtree:true}).filter(a=>typeof a.animationName!=='string'&&a.effect.getTiming().iterations===Infinity);return{before,after:sample(),active:controller.plan.active,locomotion:actor.dataset.locomotion,loops:gaitLoops.length,cssPaused:cssClocks.every(a=>a.playState==='paused')}})()`);
  assert.equal(takeover.active,false,'locomotion must not invent observed work');assert.equal(takeover.locomotion,'true');assert.ok(takeover.loops>=8);assert.equal(takeover.cssPaused,true);
  for(let i=0;i<takeover.before.joints.length;i++)for(let axis=0;axis<6;axis++)assert.ok(Math.abs(takeover.before.joints[i][axis]-takeover.after.joints[i][axis])<.12,'gait starts at the actual composed work pose');
  assert.ok(Math.abs(takeover.before.rig-takeover.after.rig)<.025);
  await wait(220);
  const strides=await run(`new Promise(resolve=>{const started=performance.now(),poses=new Set(),feet=[],bad=[];let frames=0;function tick(now){frames++;const s=sample(),f=s.feet;poses.add(JSON.stringify(f));feet.push(f.map(m=>m[5]));if(body.querySelector('.ap-rig')!==rig||body.querySelector('.ap-props-back').firstElementChild!==prop)bad.push('replaced');if(!cssClocks.every(a=>body.getAnimations({subtree:true}).includes(a)&&a.playState==='paused'))bad.push('work clock');if(f.some(m=>Math.abs(m[4])>4||Math.abs(m[5])>4))bad.push('foot envelope');if(now-started<1300)requestAnimationFrame(tick);else resolve({frames,distinct:poses.size,feet,bad:[...new Set(bad)],bodyAnimation:getComputedStyle(body).animationName})}requestAnimationFrame(tick)})`);
  assert.ok(strides.frames>=31);assert.ok(strides.distinct>=31);assert.deepEqual(strides.bad,[]);assert.equal(strides.bodyAnimation,'none','one locomotion owner prevents a second whole-body bob');
  assert.ok(strides.feet.some(f=>f[0]<f[1]-.5)&&strides.feet.some(f=>f[1]<f[0]-.5),'neighboring feet alternate lift and planted support');
  const contact=await run(`(()=>{const origin=new DOMMatrixReadOnly(getComputedStyle(actor).transform),scale=Math.hypot(origin.m11,origin.m12),feet=[...body.querySelectorAll('.ap-foot')].map((n,i)=>new DOMPoint([57.5,67.5,87.5,97.5][i],115).matrixTransform(n.getScreenCTM()).y);return{scale,origin:origin.m42,lowest:Math.max(...feet),offset:(Math.max(...feet)-origin.m42)/scale}})()`);
  assert.ok(Math.abs(contact.offset)<5,'the painted planted feet, rather than the empty canvas bottom, meet the physical route anchor: '+JSON.stringify(contact));
  await run(`controller.update({...session,title:'metadata while walking'},{now:200,walking:true});void 0`);
  assert.equal(await run(`gaitLoops.every(a=>body.getAnimations({subtree:true}).includes(a))`),true,'heartbeats retain the same stride animation objects');
  // Component-level distance samples. Actual body paths, corners and traffic
  // remain the production-room fixture's responsibility; no Animation is
  // finished, accelerated or replaced here to manufacture rendered poses.
  const distanceTakeover=await run(`(()=>{window.distanceOwner={currentTime:0};const before=sample();controller.locomotion({owner:distanceOwner,distanceWorld:0,speedWorld:0,scale:.4});return{before,after:sample(),phase:gaitLoops[0].currentTime}})()`);
  for(let i=0;i<distanceTakeover.before.joints.length;i++)for(let axis=0;axis<6;axis++)assert.ok(Math.abs(distanceTakeover.before.joints[i][axis]-distanceTakeover.after.joints[i][axis])<.12,'distance takeover preserves the actually composed clock-driven pose');
  const distanceFrames=await run(`new Promise(resolve=>{const start=performance.now(),rows=[],bad=[];let previous=null;function tick(now){const elapsed=Math.min(600,now-start),u=elapsed/600,distance=96*(3*u*u-2*u*u*u),speed=960*(u-u*u);distanceOwner.currentTime=elapsed;controller.locomotion({owner:distanceOwner,distanceWorld:distance,speedWorld:speed,scale:elapsed<300?.4:.1});const s=sample(),phase=gaitLoops[0].currentTime;if(Math.abs(phase-(${distanceTakeover.phase}+distance*600/192))>.0001)bad.push('distance phase');if(!gaitLoops.every(a=>body.getAnimations({subtree:true}).includes(a)&&a.playState==='paused'))bad.push('stride instance');if(!cssClocks.every(a=>body.getAnimations({subtree:true}).includes(a)&&a.playState==='paused'))bad.push('work clock');const step=previous?Math.max(...s.joints.flatMap((m,i)=>m.map((v,j)=>Math.abs(v-previous.joints[i][j])))):0;rows.push({elapsed,distance,speed,phase,step,feet:s.feet});previous=s;if(now-start<680)requestAnimationFrame(tick);else resolve({frames:rows.length,distinct:new Set(rows.map(r=>JSON.stringify(r.feet))).size,rows,bad:[...new Set(bad)]});}requestAnimationFrame(tick)})`);
  assert.ok(distanceFrames.frames>=31&&distanceFrames.distinct>=31);assert.deepEqual(distanceFrames.bad,[]);
  const frozenDistance=await run(`(()=>{const phase=gaitLoops[0].currentTime,pose=sample();return{released:controller.locomotion(null,distanceOwner),phase,pose}})()`);
  assert.equal(frozenDistance.released,true);await wait(120);
  assert.equal(await run(`gaitLoops.every(a=>a.playState==='paused'&&Math.abs(a.currentTime-${frozenDistance.phase})<.0001)`),true,'a released physical owner cannot fall back to free stepping before work takes over');
  const stoppedPose=await run('sample()');
  for(let i=0;i<stoppedPose.joints.length;i++)for(let axis=0;axis<6;axis++)assert.ok(Math.abs(stoppedPose.joints[i][axis]-frozenDistance.pose.joints[i][axis])<.0001,'a stopped distance phase has no autonomous joint motion');
  assert.equal(await run(`(()=>{window.nextDistanceOwner={currentTime:0};controller.locomotion({owner:nextDistanceOwner,distanceWorld:0,speedWorld:0,scale:.1});const phase=gaitLoops[0].currentTime;return !controller.locomotion(null,distanceOwner)&&!controller.locomotion({owner:distanceOwner,distanceWorld:999,speedWorld:320,scale:.4})&&gaitLoops.every(a=>a.currentTime===phase&&a.playState==='paused')})()`),true,'obsolete physical callbacks cannot revive or release the current gait owner');
  checks.push({name:'real distance-driven joints retain their original stride objects through acceleration, dense fits and a stopped phase',frames:distanceFrames.frames,distinctFootPoses:distanceFrames.distinct,firstPhase:distanceTakeover.phase,lastPhase:frozenDistance.phase,maxTakeoverStep:Math.max(...distanceFrames.rows.filter(r=>r.elapsed<=200).map(r=>r.step))});
  if(process.env.MINI_OFFICE_GAIT_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_GAIT_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_GAIT_PREVIEW_DIR,'walking-stride.png'),(await win.webContents.capturePage()).toPNG());}
  const arrival=await run(`(()=>{const before=sample();actor.dataset.walking='false';controller.update(session,{now:300});return{before,after:sample(),sameClocks:cssClocks.every(a=>body.getAnimations({subtree:true}).includes(a)),sameProps:body.querySelector('.ap-props-back').firstElementChild===prop}})()`);
  assert.equal(arrival.sameClocks,true);assert.equal(arrival.sameProps,true);
  for(let i=0;i<arrival.before.joints.length;i++)for(let axis=0;axis<6;axis++)assert.ok(Math.abs(arrival.before.joints[i][axis]-arrival.after.joints[i][axis])<.12,'arrival bridges from the actual final stride');
  await wait(250);
  assert.equal(await run(`actor.dataset.locomotion===undefined&&cssClocks.every(a=>a.playState==='running'&&a.currentTime>=5276)&&controller.plan.program===originalProgram&&body.querySelector('.ap-rig')===rig`),true);
  checks.push({name:'real alternating strides and work-pose return preserve joints, props and clocks',frames:strides.frames,distinctFootPoses:strides.distinct});
  // A minimum-duration route is a legal synthetic API input, not a claim
  // that the production room happened to reserve this 24-world-pixel path.
  // Keep the same real rig and sample continuously across both 180ms owners.
  const shortRoute=await run(`new Promise(resolve=>{
    const plan=OfficeWalkTiming.planWalk([{x:0,y:0},{x:24/12.8,y:0}],{world:{width:1280,height:720},maxSpeed:320,minDuration:360});
    const nodes=[...body.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')],points=nodes.map(n=>n.classList.contains('ap-arm-left')?[45,90]:n.classList.contains('ap-arm-right')?[110,90]:n.classList.contains('ap-foot')?[77,115]:[77,87]);
    const take=()=>nodes.map((n,i)=>{const p=new DOMPoint(...points[i]).matrixTransform(n.getScreenCTM());return{x:p.x/2,y:p.y/2}});
    const matrixDelta=(a,b)=>Math.max(...a.joints.flatMap((m,i)=>m.map((v,j)=>Math.abs(v-b.joints[i][j]))));
    const oldWork=cssClocks.slice(),before=sample(),owner={currentTime:0},clockBefore=new Map(cssClocks.map(a=>[a,a.currentTime]));
    const clockState=(a,held)=>({name:a.animationName,oldTime:clockBefore.get(a),held:held?.get(a),after:a.currentTime,startTime:a.startTime,playState:a.playState,pending:a.pending});
    actor.dataset.walking='true';controller.update(session,{now:310,walking:true});
    const zero=plan.sampleAt(0),accepted=controller.locomotion({owner,distanceWorld:zero.pathDistance,speedWorld:zero.worldSpeed,scale:.4,elapsedMs:0});
    const loops=body.getAnimations({subtree:true}).filter(a=>typeof a.animationName!=='string'&&a.effect.getTiming().iterations===Infinity),firstPhase=loops[0]?.currentTime;
    const started=performance.now(),rows=[],bad=[],held=new Map(oldWork.map(a=>[a,a.currentTime])),clockTrace=[{at:'synchronous-after-pause',clocks:oldWork.map(a=>clockState(a,held))}];
    let previous={at:started,points:take()},arrived=false,arrivalAt=null,arrivalJump=null,bridgeWas=false,bridgeTail=null;
    function tick(now){
      const elapsed=Math.min(plan.duration,now-started),physical=plan.sampleAt(elapsed);
      if(!arrived){owner.currentTime=elapsed;if(!controller.locomotion({owner,distanceWorld:physical.pathDistance,speedWorld:physical.worldSpeed,scale:.4,elapsedMs:elapsed}))bad.push('distance owner rejected');}
      const s=sample(),landmarks=take(),phase=loops[0]?.currentTime,step=Math.max(...landmarks.map((p,i)=>Math.hypot(p.x-previous.points[i].x,p.y-previous.points[i].y))),dt=now-previous.at;
      if(body.querySelector('.ap-rig')!==rig||body.querySelector('.ap-props-back').firstElementChild!==prop)bad.push('replaced rig or prop');
      if(!oldWork.every(a=>body.getAnimations({subtree:true}).includes(a)))bad.push('replaced CSS clock');
      if(!arrived){
        if(!loops.every(a=>body.getAnimations({subtree:true}).includes(a)&&a.playState==='paused'))bad.push('replaced or running gait loop');
        if(!oldWork.every(a=>a.playState==='paused'&&Math.abs(a.currentTime-held.get(a))<.2))bad.push('CSS advanced during physical gait');
        if(Math.abs(phase-(firstPhase+physical.pathDistance*600/192))>.0001)bad.push('short route phase');
      }
      const bridge=body.getAnimations({subtree:true}).some(a=>a.constructor.name==='Animation'&&nodes.includes(a.effect.target)&&a.effect.getTiming().duration===180);
      if(rows.length<6||(arrived&&bridge&&clockTrace.length<10))clockTrace.push({at:now-started,arrived,bridge,clocks:oldWork.map(a=>clockState(a,held))});
      if(arrived&&bridge&&oldWork.some(a=>a.playState!=='paused'||Math.abs(a.currentTime-held.get(a))>.2))bad.push('CSS advanced behind short arrival bridge');
      if(bridgeWas&&!bridge&&!bridgeTail)bridgeTail={elapsed:now-started,dt,px:step};
      rows.push({elapsed:now-started,pathElapsed:elapsed,distance:physical.pathDistance,speed:physical.worldSpeed,phase,step,dt,arrived,bridge,joints:s.joints});
      previous={at:now,points:landmarks};bridgeWas=bridge;
      if(physical.done&&!arrived){
        clockTrace.push({at:'actual-endpoint-before-work',clocks:oldWork.map(a=>clockState(a,held))});
        const endpoint=sample();if(!controller.locomotion(null,owner))bad.push('short route release rejected');
        actor.dataset.walking='false';controller.update(session,{now:311});
        arrivalJump=matrixDelta(endpoint,sample());arrived=true;arrivalAt=now-started;
        clockTrace.push({at:'synchronous-after-work-update',clocks:oldWork.map(a=>clockState(a,held))});
        bridgeWas=body.getAnimations({subtree:true}).some(a=>a.constructor.name==='Animation'&&nodes.includes(a.effect.target)&&a.effect.getTiming().duration===180);
        if(loops.some(a=>body.getAnimations({subtree:true}).includes(a)))bad.push('old gait loop survived arrival');
      }
      if(now-started<plan.duration+300)requestAnimationFrame(tick);
      else resolve({kind:'synthetic-component-distance-input',duration:plan.duration,worldLength:plan.worldLength,accepted,firstPhase,startJump:matrixDelta(before,sampleAtStart),arrivalAt,arrivalJump,bridgeTail,frames:rows.length,distinctJointPoses:new Set(rows.map(r=>JSON.stringify(r.joints))).size,rows,clockTrace,bad:[...new Set(bad)],clocksRestored:oldWork.every(a=>a.playState==='running'&&body.getAnimations({subtree:true}).includes(a)),oldLoopsGone:loops.every(a=>a.playState==='idle'&&!body.getAnimations({subtree:true}).includes(a)),walkingCleared:actor.dataset.locomotion===undefined});
    }
    const sampleAtStart=sample();requestAnimationFrame(tick);
  })`);
  assert.equal(shortRoute.kind,'synthetic-component-distance-input');assert.equal(shortRoute.duration,360);assert.equal(shortRoute.worldLength,24);assert.equal(shortRoute.accepted,true);
  assert.ok(shortRoute.startJump<.12,'the 360ms distance owner begins at the actual work pose');
  assert.ok(shortRoute.frames>=31&&shortRoute.distinctJointPoses>=31,'short gait and its arrival bridge need at least 31 actual changing RAF samples');
  if(shortRoute.bad.length)console.error(JSON.stringify({name:'short-route-clock-diagnostic',bad:shortRoute.bad,clockTrace:shortRoute.clockTrace}));
  assert.deepEqual(shortRoute.bad,[]);assert.ok(shortRoute.arrivalAt>=360&&shortRoute.arrivalJump<.12,'the actual short endpoint hands off from its final joint pose');
  const shortTakeoverTail=shortRoute.rows.filter(r=>r.pathElapsed>=150&&r.pathElapsed<=215);
  assert.ok(shortTakeoverTail.length>=3,'sample both sides of the real 180ms distance takeover');
  assert.ok(shortTakeoverTail.every(r=>r.step<.75),'the whole-trajectory takeover cannot jump to a future short-route stride');
  assert.ok(shortRoute.bridgeTail&&shortRoute.bridgeTail.px<.15,'the short-route work bridge reveals the same CSS target phase');
  assert.equal(shortRoute.clocksRestored,true);assert.equal(shortRoute.oldLoopsGone,true);assert.equal(shortRoute.walkingCleared,true);
  checks.push({name:'synthetic 24-world-pixel Timing route spans the minimum 360ms gait and actual work handoff',duration:shortRoute.duration,worldLength:shortRoute.worldLength,frames:shortRoute.frames,distinctJointPoses:shortRoute.distinctJointPoses,startJump:shortRoute.startJump,arrivalJump:shortRoute.arrivalJump,takeoverTailMaxLocalPx:Math.max(...shortTakeoverTail.map(r=>r.step)),bridgeTail:shortRoute.bridgeTail,finalDistancePhase:shortRoute.rows.findLast(r=>!r.arrived)?.phase,firstPhase:shortRoute.firstPhase,oldLoopsGone:shortRoute.oldLoopsGone});
  await run(`controller.update({...session,activity:'planning'},{now:320});void 0`);await wait(20);
  const propsTakeover=await run(`(()=>{const source=body.querySelector('.ap-props-front > .ap-props-back'),alpha=Number(getComputedStyle(source).opacity);actor.dataset.walking='true';controller.update({...session,activity:'planning'},{now:340,walking:true});window.outgoingSnapshot=body.querySelector('.ap-props-transit > .ap-props-front');const outgoing=outgoingSnapshot.querySelector('.ap-props-back');return{alpha,after:Number(getComputedStyle(outgoingSnapshot).opacity)*Number(getComputedStyle(outgoing).opacity),copies:body.querySelector('.ap-props-transit').children.length,clocks:[outgoingSnapshot,...outgoingSnapshot.querySelectorAll('*')].some(n=>getComputedStyle(n).animationName!=='none')}})()`);
  assert.ok(propsTakeover.alpha>.15,'take over while the old work object is still visible');
  assert.ok(Math.abs(propsTakeover.alpha-propsTakeover.after)<.03,'the outgoing work prop preserves its composed alpha on the walking boundary');
  assert.ok(propsTakeover.copies>=1,'every actually visible prop subtree is retained');assert.equal(propsTakeover.clocks,false,'finite prop snapshots cannot introduce extra work clocks');
  await wait(20);
  const quickReturn=await run(`(()=>{const before=Number(getComputedStyle(outgoingSnapshot).opacity);actor.dataset.walking='false';controller.update({...session,activity:'planning'},{now:360});return{before,after:Number(getComputedStyle(outgoingSnapshot).opacity),connected:outgoingSnapshot.isConnected}})()`);
  assert.equal(quickReturn.connected,true,'a quick return to work cannot delete the previous finite prop handoff');
  assert.ok(Math.abs(quickReturn.before-quickReturn.after)<.03);
  await wait(230);
  assert.equal(await run(`body.querySelector('.ap-props-transit').children.length`),0,'every interrupted prop snapshot has a finite cleanup');
  checks.push('work-to-work prop fades survive walking takeover and a quick return without disappearing or duplicating CSS clocks');
  await run(`actor.querySelector('.actor-prop').dataset.carry='true';actor.dataset.walking='true';controller.update(session,{now:380,walking:true});void 0`);await wait(240);
  const carrying=await run(`new Promise(resolve=>{const started=performance.now(),right=new Set(),left=new Set();function tick(now){right.add(getComputedStyle(body.querySelector('.ap-arm-right')).transform);left.add(getComputedStyle(body.querySelector('.ap-arm-left')).transform);if(now-started<500)requestAnimationFrame(tick);else{const wrist=new DOMPoint(110,90).matrixTransform(body.querySelector('.ap-arm-right').getScreenCTM()),note=actor.querySelector('.actor-prop').getBoundingClientRect();resolve({right:right.size,left:left.size,wrist:{x:wrist.x,y:wrist.y},note:{left:note.left,right:note.right,top:note.top,bottom:note.bottom}})}}requestAnimationFrame(tick)})`);
  assert.equal(carrying.right,1,'the carrying hand holds its object instead of swinging through it');assert.ok(carrying.left>=16,'the free hand continues its stride');
  assert.ok(carrying.wrist.x>=carrying.note.left&&carrying.wrist.x<=carrying.note.right&&carrying.wrist.y>=carrying.note.top&&carrying.wrist.y<=carrying.note.bottom,'the paper actually meets its carrying wrist');
  const wristPixel=async()=>{const p=await run(`(()=>{const p=new DOMPoint(110,90).matrixTransform(body.querySelector('.ap-arm-right').getScreenCTM());return{x:Math.round(p.x),y:Math.round(p.y)}})()`);return [...(await win.webContents.capturePage({x:p.x-1,y:p.y-1,width:3,height:3})).toBitmap()];};
  const visibleWrist=await wristPixel();await run(`actor.querySelector('.actor-prop').style.visibility='hidden';void 0`);const unobscuredWrist=await wristPixel();await run(`actor.querySelector('.actor-prop').style.removeProperty('visibility');void 0`);
  assert.ok(visibleWrist.every((channel,index)=>Math.abs(channel-unobscuredWrist[index])<4),'the carried paper stays behind the painted hand, preserving its family-colour boundary');
  await run(`actor.dataset.walking='false';controller.update(session,{now:390});actor.querySelector('.actor-prop').dataset.carry='false';void 0`);await wait(230);
  checks.push('carrying keeps a stable wrist in real contact with its paper and leaves the painted hand visible');
  await run(`window.closedSession={...session,status:'closed',closed:true,activity:'idle',activeTools:0};actor.dataset.walking='true';controller.update(closedSession,{now:400,walking:true,departing:true});void 0`);await wait(250);
  assert.equal(await run(`controller.plan.active===false&&controller.plan.reason==='closed'&&actor.dataset.locomotion==='true'&&Number(getComputedStyle(body.querySelector('.avatar-performance')).opacity)>.99`),true,'confirmed closure may still physically walk without fake work');
  await run(`actor.dataset.walking='false';controller.update(closedSession,{now:500,departing:true});void 0`);await wait(250);
  assert.equal(await run(`actor.dataset.locomotion===undefined&&Number(getComputedStyle(body.querySelector('.avatar-performance')).opacity)===0&&Number(getComputedStyle(image).opacity)===1`),true);
  checks.push('a closed helper walks truthfully, then freezes and hands off at its actual docking pose');
  for(const option of ['reducedMotion','lowPower','hidden']){
    await run(`actor.dataset.walking='true';controller.update(session,{now:600,walking:true});void 0`);await wait(50);
    await run(`controller.update(session,{now:700,walking:true,${option}:true});void 0`);
    assert.equal(await run(`actor.dataset.locomotion===undefined&&body.getAnimations({subtree:true}).length===0`),true,option+' cancels only the current visual choreography');
  }
  await run(`controller.update(session,{now:800,walking:true});window.externalHealth=image.animate([{opacity:.98},{opacity:1}],{duration:3000});controller.update(session,{now:900,walking:true,reducedMotion:true});void 0`);
  assert.equal(await run(`externalHealth.playState==='running'&&body.getAnimations({subtree:true}).includes(externalHealth)`),true,'quiet handling must not cancel the resource-health owner');
  await run(`externalHealth.cancel();controller.destroy();fallback.destroy();family.destroy();void 0`);
  assert.equal(await run(`body.querySelectorAll('.avatar-performance').length===0&&body.getAnimations({subtree:true}).length===0&&JSON.stringify(session)===truth`),true);
  checks.push('quiet preferences, independent health ownership and destruction cleanly cancel gait');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
