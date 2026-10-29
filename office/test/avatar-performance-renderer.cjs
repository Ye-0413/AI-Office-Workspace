'use strict';
// Native crop, timeline and quiet-mode checks. Run with Electron; all fixtures
// are synthetic observations in an isolated document, never production demos.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Model = require('../lib/avatar-performance-model.js');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-performance-native-'));
app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.setPath('userData', path.join(scratch, 'profile'));
app.disableHardwareAcceleration();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let win;
const errors = [];
const watchdog = setTimeout(() => { console.error('Avatar fixture timed out before native verification completed.'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  const totalPrograms = Object.values(Model.PROGRAMS).reduce((sum, programs) => sum + programs.length, 0);
  const renderer = pathToFileURL(path.join(root, 'renderer')).href + '/';
  const atlas = Object.entries(Model.KINDS).flatMap(([activity, kind]) => Model.PROGRAMS[kind].map(program => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const session = { id: 'atlas:' + program + ':' + seed, provider: 'codex', activity, status: 'active' };
      if (Model.plan(session).program === program) return { session, program };
    }
    throw new Error('No deterministic seed for ' + program);
  }));
  const html = `<html><head><base href="${renderer}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="family-appearance.css"><style>html{height:auto;overflow:auto}body{height:auto;overflow:visible;margin:0;background:#483b31;color:#ead9b2;font:14px sans-serif;display:grid;grid-template-columns:repeat(4,308px);gap:4px}.fixture{position:relative;height:258px;overflow:hidden;background:#63513f}.character-body{position:absolute;left:77px;top:44px;transform:scale(2);transform-origin:50% 50%}.label{position:absolute;left:12px;bottom:12px}*{box-sizing:border-box}</style></head><body><script src="../lib/avatar-performance-model.js"></script><script src="avatar-performance.js"></script><script src="../lib/family-model.js"></script><script src="family-appearance.js"></script><script>window.items=[];const familyRoots=Array.from({length:8},(_,i)=>"atlas-family:"+i),palette=OfficeFamily.createPaletteRegistry();palette.update(familyRoots);for(const entry of ${JSON.stringify(atlas)}){const {session,program}=entry;const actor=document.createElement('div');actor.className='fixture';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.src='../assets/avatars/clawd-static-base.svg';body.append(image);actor.append(body);const label=document.createElement('span');label.className='label';label.textContent=program;actor.append(label);document.body.append(actor);const performance=OfficeAvatarPerformance.create({actorNode:actor,body,session});performance.update(session,{now:0});const family=OfficeFamilyAppearance.create({actorNode:actor,body,image});const rootId=familyRoots[window.items.length%8];family.update({rootId,appearance:palette.forRoot(rootId)});window.items.push({actor,body,session,performance,family});}</script></body></html>`;
  fs.writeFileSync(path.join(scratch, 'fixture.html'), html);
  win = new BrowserWindow({ width: 1248, height: 800, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_event, details) => errors.push('renderer gone: ' + details.reason));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { errors.push('Unexpected network: ' + details.url); callback({ cancel: true }); });
  await win.loadFile(path.join(scratch, 'fixture.html'));
  await delay(250);
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  assert.equal(totalPrograms, 88);
  assert.equal(await evaluate('items.length'), totalPrograms);
  assert.equal(await evaluate('items.every(item => item.body.querySelector("img").naturalWidth > 0)'), true);
  assert.equal(await evaluate('items.every(item=>getComputedStyle(item.body.querySelector(".ap-torso")).filter!=="none")'),true,'production family colour filters reach every actual body');
  assert.equal(await evaluate('items.every(item=>[...item.body.querySelectorAll(".ap-props-back *,.ap-eyes")].every(node=>getComputedStyle(node).filter==="none"))'),true,'new original work objects and expressive eyes are never colour filtered');
  // An initial joint bridge legitimately pauses and resumes the original CSS
  // clocks. Start the metadata comparison after those real finite owners end,
  // rather than treating a pending/paused startTime as a replay baseline.
  await evaluate(`(async()=>{
    const finite=items.flatMap(item=>item.body.getAnimations({subtree:true})).filter(animation=>Number.isFinite(Number(animation.effect.getTiming().iterations)));
    await Promise.allSettled(finite.map(animation=>animation.finished));
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const css=items.flatMap(item=>item.body.getAnimations({subtree:true})).filter(animation=>animation.constructor.name==='CSSAnimation');
    await Promise.all(css.map(animation=>animation.ready));
    window.metadataClocks=items.map(item=>item.body.getAnimations({subtree:true}));
    return true;
  })()`);
  assert.equal(await evaluate('metadataClocks.every(clocks=>clocks.every(animation=>animation.constructor.name!=="CSSAnimation"||animation.startTime!==null&&Number.isFinite(animation.currentTime)))'),true,'the initial bridge has released every CSS clock before the metadata baseline');
  assert.equal(await evaluate('items.every(item=>item.body.getAnimations({subtree:true}).every(animation=>animation.constructor.name!=="Animation"||!animation.effect.target.matches(".ap-upper,.ap-eyes,.ap-arm,.ap-foot")))'),true,'the baseline has no live finite joint-bridge owner');
  const original = await evaluate('items.map(item=>({kind:item.actor.dataset.performance,program:item.actor.dataset.performanceProgram,signature:JSON.stringify([...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes,.ap-foot")].map(node=>node.getAnimations().map(animation=>animation.effect.getKeyframes().map(frame=>({offset:frame.offset,transform:frame.transform,opacity:frame.opacity}))))),jointCount:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes,.ap-foot")].filter(node=>getComputedStyle(node).animationName!=="none").length,count:item.body.getAnimations({subtree:true}).length,transforms:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform),timelines:item.body.getAnimations({subtree:true}).map(animation=>animation.startTime)}))');
  // Count the actual body joints, not decorative props/cursors. A temple
  // scratch legitimately parks the notebook while three joints keep moving.
  assert.deepEqual(original.filter(item => item.jointCount < 3).map(item => ({ program: item.program, joints: item.jointCount })), [], 'every program animates at least three independent character joints');
  await delay(350);
  const later = await evaluate('items.map(item=>[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform))');
  assert.ok(original.filter((item, index) => JSON.stringify(item.transforms) !== JSON.stringify(later[index])).length >= Math.floor(totalPrograms * .3), 'native joint poses move while other characters hold deliberate rests');
  await evaluate('window.beforeMetadataTimes=metadataClocks.map(clocks=>clocks.map(animation=>animation.currentTime));items.forEach(item=>item.performance.update({...item.session,title:"Metadata update",lastEventAt:Date.now()},{now:1000}));void 0');
  assert.equal(await evaluate('items.every((item,index)=>{const live=item.body.getAnimations({subtree:true});return live.length===metadataClocks[index].length&&live.every((animation,slot)=>animation===metadataClocks[index][slot]);})'),true,'metadata retains the exact original animation objects');
  assert.equal(await evaluate('metadataClocks.every((clocks,index)=>clocks.every((animation,slot)=>animation.currentTime>=beforeMetadataTimes[index][slot]-.01))'),true,'metadata never resets an existing animation playhead');
  const sameTimelines = await evaluate('items.map(item=>item.body.getAnimations({subtree:true}).map(animation=>animation.startTime))');
  assert.deepEqual(sameTimelines, original.map(item => item.timelines), 'metadata does not replay any CSS timeline');
  const designContinuity=await evaluate(`(()=>{
    const item=items[0],rig=item.body.querySelector('.ap-rig'),source=rig.querySelector('defs image');
    const joints=[...rig.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')],clocks=item.body.getAnimations({subtree:true});
    const times=clocks.map(a=>a.currentTime),starts=clocks.map(a=>a.startTime),plan=item.performance.plan;
    const observer=new MutationObserver(()=>{});observer.observe(rig,{subtree:true,attributes:true,childList:true});
    const design={asset:'clawd-static-base.svg?design-fixture=1',torsoClip:'<path clip-rule="evenodd" d="M50 54h55v51H50ZM60 80v10h5V80ZM90 80v10h5V80Z"/>'};
    const changed=item.performance.setDesign(design),first=observer.takeRecords();
    const repeated=item.performance.setDesign({...design}),repeatedWrites=observer.takeRecords().length;
    const consoleDesign={...design,eyePatch:'<path fill="#f1d5a6" d="M60 80h5v10h-5ZM90 80h5v10h-5Z"/>'};
    const consoleChanged=item.performance.setDesign(consoleDesign),consoleTargets=observer.takeRecords().map(r=>r.target.tagName.toLowerCase());
    const consolePatch=rig.querySelector('.ap-torso > g path').getAttribute('fill')==='#f1d5a6'&&!rig.querySelector('.ap-torso > g').hasAttribute('transform');
    const consoleRepeated=item.performance.setDesign({...consoleDesign}),consoleRepeatedWrites=observer.takeRecords().length;
    const same=rig===item.body.querySelector('.ap-rig')&&source===rig.querySelector('defs image')&&joints.every(n=>n.isConnected)
      &&clocks.every((a,i)=>item.body.getAnimations({subtree:true}).includes(a)&&a.currentTime>=times[i]&&a.startTime===starts[i])&&item.performance.plan===plan;
    item.performance.setDesign();observer.disconnect();
    return{changed,repeated,repeatedWrites,consoleChanged,consoleTargets,consolePatch,consoleRepeated,consoleRepeatedWrites,same,targets:first.map(r=>r.target.tagName.toLowerCase())};
  })()`);
  assert.deepEqual(designContinuity,{changed:true,repeated:false,repeatedWrites:0,consoleChanged:true,consoleTargets:['g'],consolePatch:true,consoleRepeated:false,consoleRepeatedWrites:0,same:true,targets:['image','clippath','g','g']},'design and console screen changes preserve native DOM joints, playback objects, phases and the observed work plan');
  for (const kind of Object.values(Model.KINDS)) {
    const programs = original.filter(item => item.kind === kind);
    assert.equal(new Set(programs.map(item => item.signature)).size, Model.PROGRAMS[kind].length, kind + ' programs must use different actual joint choreography');
  }
  const physical = await evaluate(`(async()=>{
    const animations=document.getAnimations().map(animation=>({animation,time:animation.currentTime,state:animation.playState}));
    animations.forEach(({animation})=>animation.pause());
    await Promise.all(animations.map(({animation})=>animation.ready));
    const snapshots=[];
    const grips=[];
    const bounds=[];
    const obscuredEyes=[];
    for(const phase of [.08,.27,.44,.63,.82]){
      animations.forEach(({animation})=>{const timing=animation.effect.getTiming();if(timing.iterations===Infinity){const duration=Number(timing.duration),delay=Number(timing.delay);animation.currentTime=delay+duration*(Math.ceil(Math.max(0,-delay)/duration)+phase);}});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      snapshots.push(items.map(item=>[...item.body.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')].map(node=>getComputedStyle(node).transform)));
      for(const item of items){
        const svg=item.body.querySelector('.ap-rig'),inverse=svg.getScreenCTM().inverse();
        for(const node of item.body.querySelectorAll('.ap-props-back path')){
          const box=node.getBBox(),matrix=inverse.multiply(node.getScreenCTM());
          const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
          const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
          if(minX<-.5||maxX>154.5||minY<-.5||maxY>129.5)bounds.push({program:item.actor.dataset.performanceProgram,phase,minX,maxX,minY,maxY});
        }
      }
      const overlay=items.find(item=>item.actor.dataset.performanceProgram==='error-overlay');
      const eye=overlay.body.querySelector('.ap-eyes');
      for(const x of [62.5,92.5]){
        const screenPoint=new DOMPoint(x,85).matrixTransform(eye.getScreenCTM());
        for(const path of overlay.body.querySelectorAll('.ap-props-back path')){
          const style=getComputedStyle(path);
          if(style.fill==='none'||Number(style.fillOpacity)<.5)continue;
          const point=screenPoint.matrixTransform(path.getScreenCTM().inverse());
          if(path.isPointInFill(point))obscuredEyes.push({phase,x});
        }
      }
      grips.push(items.flatMap(item=>['left','right'].flatMap(side=>[...item.body.querySelectorAll('.ap-held-'+side)].map(prop=>({program:item.actor.dataset.performanceProgram,side,hand:getComputedStyle(item.body.querySelector('.ap-arm-'+side)).transform,prop:getComputedStyle(prop).transform,handOrigin:getComputedStyle(item.body.querySelector('.ap-arm-'+side)).transformOrigin,propOrigin:getComputedStyle(prop).transformOrigin})))));
    }
    animations.forEach(({animation,time,state})=>{animation.currentTime=time;if(state==='running')animation.play();});
    return {snapshots,grips,bounds,obscuredEyes};
  })()`);
  assert.deepEqual(physical.obscuredEyes, [], 'error comparison cards leave both expressive eyes visible');
  assert.deepEqual(physical.bounds, [], 'rotated work objects stay within the actual avatar frame at every sampled story stage');
  for(let index=0;index<totalPrograms;index++)assert.ok(new Set(physical.snapshots.map(snapshot=>JSON.stringify(snapshot[index]))).size>1, original[index].program+' changes its actual native joint poses');
  for(const grip of physical.grips.flat()){assert.equal(grip.prop,grip.hand,grip.program+' '+grip.side+' object follows its hand');assert.equal(grip.propOrigin,grip.handOrigin,grip.program+' '+grip.side+' grip shares the wrist pivot');}
  const image = await win.webContents.capturePage();
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-performances.png'), image.toPNG());
    const photographed = new Set();
    const rowsPerPage = 3, rowHeight = 262;
    const pages = Math.ceil(Math.ceil(totalPrograms / 4) / rowsPerPage);
    for (let page = 0; page < pages; page += 1) {
      await evaluate('window.scrollTo(0,' + (page * rowsPerPage * rowHeight) + ')');
      await delay(40);
      for (const label of await evaluate('[...document.querySelectorAll(".label")].filter(node=>{const rect=node.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight}).map(node=>node.textContent)')) photographed.add(label);
      fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-programs-' + String(page + 1).padStart(2, '0') + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.equal(photographed.size, totalPrograms, 'every program is present in a fully visible atlas page');
    await evaluate('window.scrollTo(0,0)');
  }
  const changing = await evaluate('(()=>{const item=items[0],before=item.performance.plan;const next=item.performance.update(item.session,{now:before.programMs+1});return{before:before.program,next:next.program,kind:next.kind,bridges:item.body.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().duration===180).length,ghosts:item.body.querySelector(".ap-props-front").children.length}})()');
  assert.notEqual(changing.next, changing.before);
  assert.equal(changing.kind, original[0].kind);
  assert.ok(changing.bridges > 0, 'a program change blends physical poses');
  assert.equal(changing.ghosts, 1, 'the old work object crossfades instead of disappearing');
  await delay(40);
  await evaluate('(()=>{const item=items[0];item.performance.update(item.session,{now:item.performance.plan.programMs*2+2})})()');
  assert.equal(await evaluate('items[0].body.querySelector(".ap-props-front").children.length'), 1, 'an interrupted bridge keeps only one outgoing object');
  await delay(220);
  assert.equal(await evaluate('items[0].body.querySelector(".ap-props-front").children.length'), 0);
  assert.equal(await evaluate('items[0].body.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().duration===180).length'), 0, 'completed bridges release every finite timeline');
  const presence = await evaluate(`(async()=>{
    const actor=document.createElement('div');actor.className='fixture';
    const body=document.createElement('span');body.className='character-body';
    const image=document.createElement('img');image.src='../assets/avatars/clawd-static-base.svg';body.append(image);actor.append(body);document.body.append(actor);
    const session={id:'codex:presence-continuity',provider:'codex',activity:'coding',status:'active'};
    const facts=JSON.stringify(session),clockRegistry=OfficeAvatarPerformanceModel.createClockRegistry({limit:8});
    const performance=OfficeAvatarPerformance.create({actorNode:actor,body,session,clockRegistry});performance.update(session,{now:0});
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    await wait(220);
    const layer=body.querySelector('.avatar-performance'),rig=body.querySelector('.ap-rig'),prop=body.querySelector('.ap-props-back').firstElementChild;
    const clocks=layer.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations===Infinity);
    for(const animation of clocks)animation.currentTime=4876;
    await raf();
    const firstTimes=clocks.map(a=>a.currentTime),firstProgram=performance.plan.program;
    const sample=()=>({rig:Number(getComputedStyle(layer).opacity),bitmap:Number(getComputedStyle(image).opacity),joints:[...rig.querySelectorAll('.ap-upper,.ap-arm,.ap-eyes,.ap-foot')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[m.a,m.b,m.c,m.d,m.e,m.f]}),times:clocks.map(a=>a.currentTime),identity:body.querySelector('.ap-rig')===rig&&body.querySelector('.ap-props-back').firstElementChild===prop});
    const transitions=[],frames=[];
    const update=(value,options)=>{const before=sample();performance.update(value,options);const after=sample();transitions.push({before,after});};
    for(let frame=0;frame<45;frame++){
      if(frame===2)update({...session,status:'stale'},{now:100});
      if(frame===7)update({...session,activity:'unknown'},{now:150});
      if(frame===10)update(session,{now:200});
      if(frame===17)update({...session,status:'stale'},{now:250});
      if(frame===20)update(session,{now:300});
      await raf();frames.push(sample());
    }
    await wait(240);
    const active=sample(),sameClocks=clocks.every(a=>layer.getAnimations({subtree:true}).includes(a)),times=clocks.map(a=>a.currentTime);
    update({...session,status:'closed'},{now:400});await wait(260);
    const closed=sample(),pausedClocks=clocks.every(a=>a.playState==='paused'),sameClosedClocks=clocks.every(a=>layer.getAnimations({subtree:true}).includes(a));
    const returned=performance.update(session,{now:100000000});await wait(240);
    const returnedFrame=sample(),sameReturnedClocks=clocks.every(a=>layer.getAnimations({subtree:true}).includes(a));
    const beforeHiddenTimes=clocks.map(a=>a.currentTime);performance.update(session,{hidden:true,now:100000001});
    const hidden={count:clocks.length,layerHidden:layer.hidden,imageOpacity:Number(getComputedStyle(image).opacity),sameClocks:clocks.every(a=>layer.getAnimations({subtree:true}).includes(a)),paused:clocks.every(a=>a.playState==='paused'&&!a.pending),before:beforeHiddenTimes,held:clocks.map(a=>a.currentTime)};
    await wait(80);hidden.after=clocks.map(a=>a.currentTime);
    performance.update(session,{now:100000002});
    const hiddenRestore={sameClocks:clocks.every(a=>layer.getAnimations({subtree:true}).includes(a)),times:clocks.map(a=>a.currentTime),program:performance.plan.program};
    performance.update({...session,status:'stale'},{now:100000003});performance.update(session,{reducedMotion:true,now:100000004});
    const quiet={count:body.getAnimations({subtree:true}).length,opacity:Number(getComputedStyle(layer).opacity)};
    performance.destroy();actor.remove();
    return {frames,transitions,firstTimes,times,firstProgram,returnedProgram:returned.program,active,closed,returnedFrame,sameClocks,pausedClocks,sameClosedClocks,sameReturnedClocks,hidden,hiddenRestore,quiet,factsUnchanged:JSON.stringify(session)===facts};
  })()`);
  assert.equal(presence.frames.length,45,'sample at least 31 real requestAnimationFrame renders across repeated interrupted fades');
  assert.ok(presence.frames.every(frame=>frame.identity),'stale, unknown and active signals preserve the same rig and actual work object nodes');
  for(const transition of presence.transitions){
    assert.ok(Math.abs(transition.before.rig-transition.after.rig)<.025,'a state update begins at the currently rendered rig opacity');
    assert.ok(Math.abs(transition.before.bitmap-transition.after.bitmap)<.025,'a state update begins at the currently rendered bitmap opacity');
    for(let i=0;i<transition.before.joints.length;i++)for(let axis=0;axis<6;axis++)assert.ok(Math.abs(transition.before.joints[i][axis]-transition.after.joints[i][axis])<.12,'freezing or resuming never resets a visible joint to its neutral pose');
  }
  assert.ok(new Set(presence.frames.map(frame=>JSON.stringify([frame.rig,frame.bitmap,frame.joints]))).size>=31,'the real rendered sequence contains at least 31 distinct continuous frames');
  assert.ok(presence.frames.every(frame=>frame.rig>=0&&frame.rig<=1&&frame.bitmap>=0&&frame.bitmap<=1));
  assert.equal(presence.sameClocks,true);assert.equal(presence.pausedClocks,true);assert.equal(presence.sameClosedClocks,true);assert.equal(presence.sameReturnedClocks,true,'natural inactive intervals resume the original native CSS Animation objects');
  assert.ok(presence.times.every((time,i)=>time>=presence.firstTimes[i]&&time>4800),'the original joint clocks never rewind to zero');
  assert.equal(presence.returnedProgram,presence.firstProgram,'a long inactive interval does not rotate the per-kind work program');
  assert.equal(presence.active.rig,1);assert.equal(presence.active.bitmap,0);assert.equal(presence.closed.rig,0);assert.equal(presence.closed.bitmap,1);assert.equal(presence.returnedFrame.rig,1);assert.equal(presence.returnedFrame.bitmap,0);
  assert.ok(presence.hidden.count>0);assert.equal(presence.hidden.layerHidden,false);assert.equal(presence.hidden.imageOpacity,0);assert.equal(presence.hidden.sameClocks,true);assert.equal(presence.hidden.paused,true);
  assert.ok(presence.hidden.held.every((time,i)=>Math.abs(time-presence.hidden.before[i])<.2),'hidden pause captures the actual phase without a pending-pause frame');
  assert.deepEqual(presence.hidden.after,presence.hidden.held,'a hidden standing work interval does not advance its original CSS objects');
  assert.equal(presence.hiddenRestore.sameClocks,true);assert.equal(presence.hiddenRestore.program,presence.firstProgram);assert.ok(presence.hiddenRestore.times.every((time,i)=>Math.abs(time-presence.hidden.held[i])<.2),'same-program restoration begins at the paused actual phase');
  assert.deepEqual(presence.quiet,{count:0,opacity:1});assert.equal(presence.factsUnchanged,true);
  const boundaryPause = await evaluate(`(async()=>{
    const actor=document.createElement('div');actor.className='fixture';
    const body=document.createElement('span');body.className='character-body';
    const image=document.createElement('img');image.src='../assets/avatars/clawd-static-base.svg';body.append(image);actor.append(body);document.body.append(actor);
    const session={id:'codex:pause-at-program-boundary',provider:'codex',activity:'reading',status:'active'},facts=JSON.stringify(session);
    const performance=OfficeAvatarPerformance.create({actorNode:actor,body,session}),first=performance.update(session,{now:0});
    await new Promise(resolve=>setTimeout(resolve,240));
    const rig=body.querySelector('.ap-rig'),clocks=rig.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'&&a.effect.getTiming().iterations===Infinity);
    performance.update(session,{now:first.programMs+1,hidden:true});
    const held=clocks.map(a=>a.currentTime);
    await new Promise(resolve=>setTimeout(resolve,80));
    const hidden=clocks.length>0&&clocks.every((a,i)=>rig.getAnimations({subtree:true}).includes(a)&&a.playState==='paused'&&Math.abs(a.currentTime-held[i])<.2);
    const restored=performance.update(session,{now:100000000});
    const resumed=clocks.every(a=>rig.getAnimations({subtree:true}).includes(a)&&a.playState==='running');
    const next=performance.update(session,{now:100000001});
    performance.destroy();actor.remove();
    return{hidden,resumed,first:first.program,restored:restored.program,next:next.program,factsUnchanged:JSON.stringify(session)===facts};
  })()`);
  assert.equal(boundaryPause.hidden,true,'hiding across a program deadline pauses the same original CSS clocks');
  assert.equal(boundaryPause.resumed,true);assert.equal(boundaryPause.restored,boundaryPause.first,'the first visible update restores the actual paused pose');
  assert.notEqual(boundaryPause.next,boundaryPause.first,'ordinary visible updates retain the due program rotation');
  assert.equal(boundaryPause.factsUnchanged,true);
  const returningPresence = await evaluate(`(async()=>{
    const actor=document.createElement('div');actor.className='fixture';
    const body=document.createElement('span');body.className='character-body';
    const image=document.createElement('img');image.src='../assets/avatars/clawd-static-base.svg';body.append(image);actor.append(body);document.body.append(actor);
    const session={id:'codex:return-continuity',provider:'codex',parentId:'codex:real-root',activity:'coding',status:'active'};
    const idle={...session,activity:'idle',status:'idle',turnCompletedAt:4900},facts=JSON.stringify([session,idle]);
    const clockRegistry=OfficeAvatarPerformanceModel.createClockRegistry({limit:8});
    const controller=OfficeAvatarPerformance.create({actorNode:actor,body,session,clockRegistry});controller.update(session,{now:0});
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    await wait(220);
    const layer=body.querySelector('.avatar-performance'),rig=body.querySelector('.ap-rig'),prop=body.querySelector('.ap-props-back').firstElementChild;
    const clocks=layer.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations===Infinity);
    for(const animation of clocks)animation.currentTime=5276;
    await raf();
    const firstTimes=clocks.map(a=>a.currentTime),firstProgram=controller.plan.program;
    const sample=()=>({rig:Number(getComputedStyle(layer).opacity),bitmap:Number(getComputedStyle(image).opacity),hidden:layer.hidden,animate:layer.dataset.animate,
      joints:[...rig.querySelectorAll('.ap-upper,.ap-arm,.ap-eyes,.ap-foot')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[m.a,m.b,m.c,m.d,m.e,m.f]}),
      identity:body.querySelector('.ap-rig')===rig&&body.querySelector('.ap-props-back').firstElementChild===prop,
      sameClocks:clocks.every(a=>layer.getAnimations({subtree:true}).includes(a)),times:clocks.map(a=>a.currentTime)});
    const transitions=[],frames=[];
    const update=(value,options)=>{const before=sample();controller.update(value,options);transitions.push({before,after:sample()});};
    for(let frame=0;frame<60;frame++){
      if(frame===2)update(idle,{now:100,departing:true,walking:true});
      if(frame===5)update({...idle,title:'metadata while returning'},{now:150,departing:true,walking:true});
      if(frame===10)update(session,{now:200});
      if(frame===18)update(idle,{now:250,departing:true,walking:true});
      if(frame===20)update(session,{now:300});
      if(frame===29)update(idle,{now:350,departing:true});
      if(frame===34)update(session,{now:400});
      if(frame===42)update(session,{now:410,walking:true});
      if(frame===45)update({...session,title:'metadata during an actual station walk'},{now:420,walking:true});
      if(frame===49)update(session,{now:430});
      await raf();frames.push(sample());
    }
    await wait(250);const active=sample();
    update(idle,{now:450,departing:true});await wait(260);
    const retired=sample(),paused=clocks.every(a=>a.playState==='paused'),pausedTimes=clocks.map(a=>a.currentTime);
    controller.update(idle,{now:90000000,departing:true});await wait(40);
    const heldTimes=clocks.map(a=>a.currentTime);
    const returned=controller.update(session,{now:90000001});await wait(250);const resumed=sample();
    controller.update(idle,{now:90000002,departing:true,walking:true});
    const walking={hidden:layer.hidden,animations:body.getAnimations({subtree:true}).length};
    controller.update(session,{now:90000003});controller.update(idle,{now:90000004,departing:true,hidden:true});
    const hidden={hidden:layer.hidden,animations:body.getAnimations({subtree:true}).length};
    controller.update(session,{now:90000005});controller.update(idle,{now:90000006,departing:true,lowPower:true});
    const lowPower={hidden:layer.hidden,animations:body.getAnimations({subtree:true}).length};
    controller.update(session,{now:90000007});controller.update(idle,{now:90000008,departing:true,reducedMotion:true});
    const reduced={hidden:layer.hidden,animations:body.getAnimations({subtree:true}).length};
    controller.destroy();const destroyed={rigs:body.querySelectorAll('.avatar-performance').length,animations:body.getAnimations({subtree:true}).length};actor.remove();
    return{frames,transitions,firstTimes,active,retired,paused,pausedTimes,heldTimes,resumed,firstProgram,returnedProgram:returned.program,walking,hidden,lowPower,reduced,destroyed,factsUnchanged:JSON.stringify([session,idle])===facts};
  })()`);
  assert.equal(returningPresence.frames.length,60,'rapid completed/helper returns sample at least 31 real native frames');
  assert.ok(returningPresence.frames.every(frame=>frame.identity&&frame.sameClocks&&!frame.hidden&&frame.animate==='true'),'all interrupted returns retain actual rig, props and native CSS Animation identities');
  assert.ok(new Set(returningPresence.frames.map(frame=>JSON.stringify([frame.rig,frame.bitmap,frame.joints]))).size>=31,'helper returns contain at least 31 distinct rendered poses/opacity samples');
  for(const transition of returningPresence.transitions){
    assert.ok(Math.abs(transition.before.rig-transition.after.rig)<.025,'return cancellation resumes the actually rendered rig opacity');
    assert.ok(Math.abs(transition.before.bitmap-transition.after.bitmap)<.025,'return cancellation resumes the actually rendered bitmap opacity');
    for(let i=0;i<transition.before.joints.length;i++)for(let axis=0;axis<6;axis++)assert.ok(Math.abs(transition.before.joints[i][axis]-transition.after.joints[i][axis])<.12,'completed/helper return never snaps a joint back to its default');
  }
  assert.equal(returningPresence.active.rig,1);assert.equal(returningPresence.active.bitmap,0);
  assert.equal(returningPresence.retired.rig,0);assert.equal(returningPresence.retired.bitmap,1);assert.equal(returningPresence.retired.hidden,false);assert.equal(returningPresence.retired.sameClocks,true);assert.equal(returningPresence.paused,true);
  assert.deepEqual(returningPresence.heldTimes,returningPresence.pausedTimes,'a long inactive return keeps the original joint clocks frozen');
  assert.equal(returningPresence.resumed.rig,1);assert.equal(returningPresence.resumed.bitmap,0);assert.equal(returningPresence.resumed.identity,true);assert.equal(returningPresence.resumed.sameClocks,true);
  assert.ok(returningPresence.resumed.times.every((time,i)=>time>=returningPresence.firstTimes[i]&&time>5200),'rapid helper returns never rewind a native CSS clock');
  assert.equal(returningPresence.returnedProgram,returningPresence.firstProgram,'departing time does not count as observed visible work');
  assert.equal(returningPresence.walking.hidden,false,'a real return keeps the same visible rig for its physical stride');
  assert.ok(returningPresence.walking.animations>0,'walking retains paused native CSS clocks and independent stride motions');
  for(const mode of ['hidden','lowPower','reduced'])assert.deepEqual(returningPresence[mode],{hidden:true,animations:0},mode+' retains immediate lifecycle/quiet ownership');
  assert.deepEqual(returningPresence.destroyed,{rigs:0,animations:0});assert.equal(returningPresence.factsUnchanged,true);
  await evaluate('(()=>{const item=items[0];item.performance.update(item.session,{now:item.performance.plan.programMs*3+3});item.performance.update(item.session,{now:item.performance.plan.programMs*3+3,reducedMotion:true})})()');
  assert.equal(await evaluate('items[0].body.getAnimations({subtree:true}).length'), 0, 'quiet preference cancels an in-flight bridge immediately');
  // Normal standing work hides by pausing the same CSS objects. Reduced motion,
  // low power, explicit reaction and lifecycle hiding retain their static paths.
  await evaluate('items.forEach(item=>item.performance.update(item.session))');await delay(270);
  const hiddenStanding=await evaluate(`(async()=>{
    const owners=items.map(item=>{
      const clocks=item.body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'&&a.effect.getTiming().iterations===Infinity);
      const before=clocks.map(a=>a.currentTime),program=item.performance.plan.program;
      item.performance.update(item.session,{hidden:true});
      return{item,clocks,before,held:clocks.map(a=>a.currentTime),program};
    });
    let stable=true,retained=true,paused=true;
    for(let frame=0;frame<31;frame++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      for(const owner of owners)for(let i=0;i<owner.clocks.length;i++){
        const clock=owner.clocks[i];stable=stable&&Math.abs(clock.currentTime-owner.held[i])<.0001;
        retained=retained&&owner.item.body.getAnimations({subtree:true}).includes(clock);paused=paused&&clock.playState==='paused'&&!clock.pending;
      }
    }
    const restored=owners.map(owner=>{
      owner.item.performance.update(owner.item.session);
      return{same:owner.clocks.every(a=>owner.item.body.getAnimations({subtree:true}).includes(a)),phase:owner.clocks.every((a,i)=>Math.abs(a.currentTime-owner.held[i])<.2),program:owner.item.performance.plan.program===owner.program};
    });
    return{frames:31,nonempty:owners.every(owner=>owner.clocks.length>0),counts:owners.map(owner=>owner.clocks.length),pauseExact:owners.every(owner=>owner.held.every((time,i)=>Math.abs(time-owner.before[i])<.2)),stable,retained,paused,restored};
  })()`);
  assert.equal(hiddenStanding.frames,31);assert.equal(hiddenStanding.nonempty,true);assert.equal(hiddenStanding.pauseExact,true);assert.equal(hiddenStanding.stable,true);assert.equal(hiddenStanding.retained,true);assert.equal(hiddenStanding.paused,true);
  assert.ok(hiddenStanding.restored.every(owner=>owner.same&&owner.phase&&owner.program),'all88 hidden standing programs resume the original nonempty CSS owners and actual phases');
  for (const preference of ['reducedMotion', 'lowPower', 'reaction']) {
    await evaluate(`items.forEach(item=>item.performance.update(item.session,{${preference}:true}))`);
    assert.equal(await evaluate('items.reduce((sum,item)=>sum+item.body.getAnimations({subtree:true}).length,0)'), 0, preference + ' stops native animation timelines');
  }
  await evaluate('items.forEach(item=>item.performance.update(item.session))');
  await delay(270);
  await evaluate('items.forEach(item=>item.performance.update({...item.session,status:"stale"}))');
  assert.ok(await evaluate('document.getAnimations().some(a=>a.effect.getTiming().duration===220)'), 'the system preference interrupts an actual in-flight rig fade');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const systemQuiet=await evaluate('({matches:matchMedia("(prefers-reduced-motion: reduce)").matches,plans:items.slice(0,2).map(item=>item.performance.plan),animations:document.getAnimations().slice(0,3).map(a=>({duration:a.effect.getTiming().duration,target:a.effect.target.className?.baseVal||a.effect.target.className,state:a.playState}))})');
  if(await evaluate('document.getAnimations().length'))console.log(JSON.stringify({systemQuiet}));
  assert.equal(await evaluate('document.getAnimations().length'), 0, 'system reduced motion stops timelines independently of settings');
  if (process.env.MINI_OFFICE_PREVIEW_DIR) fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-performances-still.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
  win.webContents.debugger.detach();
  const resumed=await evaluate(`(()=>{
    const item=items[0],clockRegistry=OfficeAvatarPerformanceModel.createClockRegistry({limit:8});
    item.performance.destroy();
    item.performance=OfficeAvatarPerformance.create({actorNode:item.actor,body:item.body,clockRegistry});
    const first=item.performance.update(item.session,{now:0});
    item.performance.update(item.session,{now:first.programMs-1});
    item.performance.destroy();
    item.performance=OfficeAvatarPerformance.create({actorNode:item.actor,body:item.body,clockRegistry});
    const returned=item.performance.update(item.session,{now:3600000});
    const advanced=item.performance.update(item.session,{now:3600002});
    return {first:first.program,returned:returned.program,advanced:advanced.program};
  })()`);
  assert.equal(resumed.returned,resumed.first,'native page/room recreation preserves visible work time without offscreen catch-up');
  assert.notEqual(resumed.advanced,resumed.first,'the next visible bout rotates after returning to the room');
  await evaluate('items.forEach(item=>{item.performance.destroy();item.family.destroy();})');
  assert.equal(await evaluate('document.querySelectorAll(".avatar-performance").length'), 0);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, programs: original.map(item => item.program), nativeChecks: ['artwork', 'joint motion', '88 distinct joint trajectories', 'metadata continuity', 'interruptible pose and prop bridge', '45 actual interrupted stale/unknown/closed continuity frames', '60 actual interrupted completed-helper return frames', 'same paused and resumed native joint clocks', 'quiet modes', 'lifecycle suspension', 'native page-return clock continuity', 'family body colour with unchanged work props', 'rotated prop bounds', 'destroy cleanup'], preview: process.env.MINI_OFFICE_PREVIEW_DIR || null }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); if (win && !win.isDestroyed()) win.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
