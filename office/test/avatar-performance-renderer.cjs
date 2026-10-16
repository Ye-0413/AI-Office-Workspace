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
  const original = await evaluate('items.map(item=>({kind:item.actor.dataset.performance,program:item.actor.dataset.performanceProgram,signature:JSON.stringify([...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes,.ap-foot")].map(node=>node.getAnimations().map(animation=>animation.effect.getKeyframes().map(frame=>({offset:frame.offset,transform:frame.transform,opacity:frame.opacity}))))),jointCount:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes,.ap-foot")].filter(node=>getComputedStyle(node).animationName!=="none").length,count:item.body.getAnimations({subtree:true}).length,transforms:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform),timelines:item.body.getAnimations({subtree:true}).map(animation=>animation.startTime)}))');
  // Count the actual body joints, not decorative props/cursors. A temple
  // scratch legitimately parks the notebook while three joints keep moving.
  assert.deepEqual(original.filter(item => item.jointCount < 3).map(item => ({ program: item.program, joints: item.jointCount })), [], 'every program animates at least three independent character joints');
  await delay(350);
  const later = await evaluate('items.map(item=>[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform))');
  assert.ok(original.filter((item, index) => JSON.stringify(item.transforms) !== JSON.stringify(later[index])).length >= Math.floor(totalPrograms * .3), 'native joint poses move while other characters hold deliberate rests');
  await evaluate('items.forEach(item=>item.performance.update({...item.session,title:"Metadata update",lastEventAt:Date.now()},{now:1000}))');
  const sameTimelines = await evaluate('items.map(item=>item.body.getAnimations({subtree:true}).map(animation=>animation.startTime))');
  assert.deepEqual(sameTimelines, original.map(item => item.timelines), 'metadata does not replay any CSS timeline');
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
  await evaluate('(()=>{const item=items[0];item.performance.update(item.session,{now:item.performance.plan.programMs*3+3});item.performance.update(item.session,{now:item.performance.plan.programMs*3+3,reducedMotion:true})})()');
  assert.equal(await evaluate('items[0].body.getAnimations({subtree:true}).length'), 0, 'quiet preference cancels an in-flight bridge immediately');
  for (const preference of ['reducedMotion', 'lowPower', 'hidden', 'walking', 'reaction', 'departing', 'stale']) {
    await evaluate(`items.forEach(item=>item.performance.update(item.session,{${preference}:true}))`);
    assert.equal(await evaluate('items.reduce((sum,item)=>sum+item.body.getAnimations({subtree:true}).length,0)'), 0, preference + ' stops native animation timelines');
  }
  await evaluate('items.forEach(item=>item.performance.update(item.session))');
  await delay(220);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate('document.getAnimations().length'), 0, 'system reduced motion stops timelines independently of settings');
  if (process.env.MINI_OFFICE_PREVIEW_DIR) fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-performances-still.png'), (await win.webContents.capturePage()).toPNG());
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
  console.log(JSON.stringify({ ok: true, programs: original.map(item => item.program), nativeChecks: ['artwork', 'joint motion', '88 distinct joint trajectories', 'metadata continuity', 'interruptible pose and prop bridge', 'quiet modes', 'lifecycle suspension', 'native page-return clock continuity', 'family body colour with unchanged work props', 'rotated prop bounds', 'destroy cleanup'], preview: process.env.MINI_OFFICE_PREVIEW_DIR || null }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); if (win && !win.isDestroyed()) win.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
