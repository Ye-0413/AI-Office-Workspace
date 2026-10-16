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
app.setPath('userData', path.join(scratch, 'profile'));
app.disableHardwareAcceleration();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let win;
const errors = [];
const watchdog = setTimeout(() => { console.error('Avatar fixture timed out before native verification completed.'); app.exit(1); }, 20000);
app.whenReady().then(async () => {
  const renderer = pathToFileURL(path.join(root, 'renderer')).href + '/';
  const atlas = Object.entries(Model.KINDS).flatMap(([activity, kind]) => Model.PROGRAMS[kind].map(program => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const session = { id: 'atlas:' + program + ':' + seed, provider: 'codex', activity, status: 'active' };
      if (Model.plan(session).program === program) return { session, program };
    }
    throw new Error('No deterministic seed for ' + program);
  }));
  const html = `<html><head><base href="${renderer}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><style>html{height:auto;overflow:auto}body{height:auto;overflow:visible;margin:0;background:#483b31;color:#ead9b2;font:14px sans-serif;display:grid;grid-template-columns:repeat(4,308px);gap:4px}.fixture{position:relative;height:258px;overflow:hidden;background:#63513f}.character-body{position:absolute;left:77px;top:44px;transform:scale(2);transform-origin:50% 50%}.label{position:absolute;left:12px;bottom:12px}*{box-sizing:border-box}</style></head><body><script src="../lib/avatar-performance-model.js"></script><script src="avatar-performance.js"></script><script>window.items=[];for(const entry of ${JSON.stringify(atlas)}){const {session,program}=entry;const actor=document.createElement('div');actor.className='fixture';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.src='../assets/avatars/clawd-static-base.svg';body.append(image);actor.append(body);const label=document.createElement('span');label.className='label';label.textContent=program;actor.append(label);document.body.append(actor);const performance=OfficeAvatarPerformance.create({actorNode:actor,body,session});performance.update(session,{now:0});window.items.push({actor,body,session,performance});}</script></body></html>`;
  fs.writeFileSync(path.join(scratch, 'fixture.html'), html);
  win = new BrowserWindow({ width: 1248, height: 800, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_event, details) => errors.push('renderer gone: ' + details.reason));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { errors.push('Unexpected network: ' + details.url); callback({ cancel: true }); });
  await win.loadFile(path.join(scratch, 'fixture.html'));
  await delay(250);
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  assert.equal(await evaluate('items.length'), 31);
  assert.equal(await evaluate('items.every(item => item.body.querySelector("img").naturalWidth > 0)'), true);
  const original = await evaluate('items.map(item=>({kind:item.actor.dataset.performance,program:item.actor.dataset.performanceProgram,signature:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).animationName).join("/"),jointCount:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes,.ap-foot")].filter(node=>getComputedStyle(node).animationName!=="none").length,count:item.body.getAnimations({subtree:true}).length,transforms:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform),timelines:item.body.getAnimations({subtree:true}).map(animation=>animation.startTime)}))');
  // Count the actual body joints, not decorative props/cursors. A temple
  // scratch legitimately parks the notebook while three joints keep moving.
  assert.deepEqual(original.filter(item => item.jointCount < 3).map(item => ({ program: item.program, joints: item.jointCount })), [], 'all 31 programs animate at least three independent character joints');
  await delay(350);
  const later = await evaluate('items.map(item=>[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform))');
  assert.ok(original.filter((item, index) => JSON.stringify(item.transforms) !== JSON.stringify(later[index])).length >= 20, 'native joint poses move across the authored choreographies');
  await evaluate('items.forEach(item=>item.performance.update({...item.session,title:"Metadata update",lastEventAt:Date.now()},{now:1000}))');
  const sameTimelines = await evaluate('items.map(item=>item.body.getAnimations({subtree:true}).map(animation=>animation.startTime))');
  assert.deepEqual(sameTimelines, original.map(item => item.timelines), 'metadata does not replay any CSS timeline');
  for (const kind of Object.values(Model.KINDS)) {
    const programs = original.filter(item => item.kind === kind);
    assert.equal(new Set(programs.map(item => item.signature)).size, Model.PROGRAMS[kind].length, kind + ' programs must use different actual joint choreography');
  }
  const image = await win.webContents.capturePage();
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-performances.png'), image.toPNG());
    const photographed = new Set();
    for (let page = 0; page < 3; page += 1) {
      await evaluate('window.scrollTo(0,' + (page * 786) + ')');
      await delay(40);
      for (const label of await evaluate('[...document.querySelectorAll(".label")].filter(node=>{const rect=node.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight}).map(node=>node.textContent)')) photographed.add(label);
      fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-programs-0' + (page + 1) + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.equal(photographed.size, 31, 'every program is present in a fully visible atlas page');
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
  await evaluate('items.forEach(item=>item.performance.destroy())');
  assert.equal(await evaluate('document.querySelectorAll(".avatar-performance").length'), 0);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, programs: original.map(item => item.program), nativeChecks: ['artwork', 'joint motion', '31 distinct joint programs', 'metadata continuity', 'interruptible pose and prop bridge', 'quiet modes', 'lifecycle suspension', 'destroy cleanup'], preview: process.env.MINI_OFFICE_PREVIEW_DIR || null }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); if (win && !win.isDestroyed()) win.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
