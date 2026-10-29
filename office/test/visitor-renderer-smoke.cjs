'use strict';
// Dedicated native stress checks for the decorative guest; never touches user data.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-visitor-stress-'));
app.setPath('userData', dataDir);
app.disableHardwareAcceleration();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = process.env.MINI_OFFICE_VISITOR_STRESS_REPORT || path.resolve(__dirname, '../../../../work/visitor-stress-0.3.0.json');
const checks = [], errors = [], requestedArtwork = [];
let win;
const evaluate = source => win.webContents.executeJavaScript(source, true);
async function check(name, fn) { await fn(); checks.push(name); }

app.whenReady().then(async () => {
  const settings = { language: 'zh', idleVisitor: false, reducedMotion: false, lowPower: false };
  const snapshot = { mode: 'live', now: Date.now(), connections: [], demo: {}, sessions: [{
    id: 'visitor-native-real-fixture', sessionId: 'visitor-native-real-fixture', provider: 'codex',
    title: 'Native visitor stress fixture', status: 'active', activity: 'coding', activeTools: 1,
    lastEventAt: Date.now(), projectPath: '/fixture/visitor-stress', events: [],
  }] };
  for (const [name, fn] of Object.entries({ snapshot: () => snapshot, settings: () => settings,
    'set-settings': patch => Object.assign(settings, patch), displays: () => [],
    mode: () => snapshot, demo: () => snapshot, connect: () => ({ ok: true }) })) {
    ipcMain.handle('office:' + name, (_event, ...args) => fn(...args));
  }
  ipcMain.on('office:renderer-error', (_event, message) => errors.push(message));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('render-process-gone', (_event, detail) => errors.push(detail.reason));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'file://*/*'] }, (details, done) => {
    if (/^https?:/.test(details.url)) { errors.push('Unexpected network: ' + details.url); done({ cancel: true }); return; }
    const pathname = decodeURIComponent(new URL(details.url).pathname);
    if (pathname.includes('/assets/avatars/')) {
      const asset = path.basename(pathname); requestedArtwork.push(asset);
      if (!require('../lib/public-artwork.js').ASSETS.includes(asset)) { errors.push('Unexpected character resource: ' + asset); done({ cancel: true }); return; }
    }
    done({});
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')); await wait(250);
  await evaluate(`window.stressCreate=(random=0)=>{
    window.stress?.controller.destroy(); document.getElementById('visitor-stress')?.remove();
    const world=document.getElementById('world'),layer=document.createElement('div');
    layer.id='visitor-stress';layer.className='visitors';world.append(layer);
    const context={enabled:true,ready:true,mode:'live',busy:false,hidden:false,reducedMotion:false,lowPower:false,language:'zh'};
    const factory=OfficeVisitorModel.createVisitor;
    try{OfficeVisitorModel.createVisitor=()=>factory({arrivalDelayMs:0,random:()=>random});
      window.stress={context,layer,controller:OfficeIdleVisitor.create({layer,world,context:()=>({...context}),openDoor:()=>{}})};
    }finally{OfficeVisitorModel.createVisitor=factory;}
    window.stress.controller.tick();return true;
  };window.stressRead=()=>{const node=window.stress.layer.querySelector('.visitor');return{exists:!!node,zone:node?.dataset.zone,walking:node?.dataset.walking,pose:node?.querySelector('img').dataset.asset,motion:node?.getAnimations().map(a=>a.playState)||[],transform:node?getComputedStyle(node).transform:null};};void(0)`);

  await check('real fixture and disabled decorative guest keep decorative tests outside observed sessions', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 1);
    assert.equal(await evaluate(`document.querySelectorAll('.visitor').length`), 0);
  });
  await check('the public adapter keeps missing and rejected designs original without changing observed sessions', async () => {
    const state = await evaluate(`(()=>{const actor=document.createElement('div'),body=document.createElement('span'),image=document.createElement('img');body.className='character-body';body.append(image);actor.append(body);document.getElementById('world').append(actor);const session={id:'private-presentation-check',parentId:'untouched-parent',provider:'claude-code',activity:'coding',status:'active'},before=JSON.stringify(session);const controller=OfficeAvatarPerformance.create({actorNode:actor,body,image,session});controller.update(session,{reducedMotion:true});const layer=body.querySelector('.creature-performance'),source=body.querySelector('defs image');const first=source.getAttribute('href');controller.setDesign({id:'ink',asset:'clawd-static-base.svg'});const second=source.getAttribute('href');controller.setDesign(null);const restored=source.getAttribute('href'),clip=body.querySelector('clipPath rect');const result={first,second,restored,cell:[clip.getAttribute('width'),clip.getAttribute('height')],sheet:[source.getAttribute('width'),source.getAttribute('height')],same:before===JSON.stringify(session),legacy:!!body.querySelector('.ap-torso'),observed:document.querySelectorAll('.actor[data-session-id]').length};controller.destroy();actor.remove();return result;})()`);
    assert.equal(state.first, '../assets/avatars/workshop-folio.png'); assert.equal(state.second, '../assets/avatars/workshop-ink.png'); assert.equal(state.restored, state.first);
    assert.deepEqual(state.cell, ['80','80']); assert.deepEqual(state.sheet, ['240','160']);
    assert.equal(state.same, true); assert.equal(state.legacy, false); assert.equal(state.observed, 1);
  });
  await check('a visible route starts, pauses while hidden, and work revokes hidden guest without late callbacks', async () => {
    await evaluate(`stressCreate();void(0)`); await wait(120);
    let state = await evaluate(`stressRead()`);
    assert.equal(state.exists, true); assert.equal(state.walking, 'true'); assert.deepEqual(state.motion, ['running']);
    assert.equal(await evaluate(`!!stress.layer.querySelector('.creature-performance')&&!stress.layer.querySelector('.ap-torso')`), true);
    assert.match(state.pose, /^workshop-(folio|ink|moss|thread|glow)\.png$/);
    await evaluate(`stress.context.hidden=true;stress.controller.tick();void(0)`); await wait(30);
    state = await evaluate(`stressRead()`); assert.deepEqual(state.motion, ['paused']);
    const transform = state.transform; await wait(160);
    assert.equal((await evaluate(`stressRead()`)).transform, transform);
    await evaluate(`stress.context.busy=true;stress.controller.tick();void(0)`); await wait(40);
    assert.equal((await evaluate(`stressRead()`)).exists, false);
    await evaluate(`stress.context.hidden=false;stress.controller.tick();void(0)`); await wait(1100);
    assert.equal((await evaluate(`stressRead()`)).exists, false);
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 1);
  });
  await check('hiding an already running departure clears it instead of retaining a paused guest', async () => {
    await evaluate(`stressCreate();void(0)`); await wait(250);
    await evaluate(`stress.context.busy=true;stress.controller.tick();void(0)`); await wait(30);
    assert.equal((await evaluate(`stressRead()`)).exists, true);
    await evaluate(`stress.context.hidden=true;stress.controller.tick();void(0)`); await wait(60);
    assert.equal((await evaluate(`stressRead()`)).exists, false);
    await evaluate(`stress.context.hidden=false;stress.controller.tick();void(0)`); await wait(400);
    assert.equal((await evaluate(`stressRead()`)).exists, false);
  });
  await check('reduced motion interrupts a route with a static pose; disabling then removes through the door', async () => {
    await evaluate(`stressCreate();void(0)`); await wait(100);
    await evaluate(`stress.context.reducedMotion=true;stress.controller.tick();void(0)`); await wait(80);
    let state = await evaluate(`stressRead()`);
    assert.equal(state.exists, true); assert.equal(state.walking, 'false');
    assert.match(state.pose, /^workshop-(folio|ink|moss|thread|glow)\.png$/); assert.deepEqual(state.motion, []);
    await evaluate(`stress.context.reducedMotion=false;stress.controller.tick();stress.context.enabled=false;stress.controller.tick();void(0)`);
    await wait(2600); state = await evaluate(`stressRead()`); assert.equal(state.exists, false);
    await wait(250); assert.equal((await evaluate(`stressRead()`)).exists, false);
  });
  await check('switching to demo revokes a visible in-flight guest immediately', async () => {
    await evaluate(`stressCreate();void(0)`); await wait(100);
    await evaluate(`stress.context.mode='demo';stress.controller.tick();void(0)`); await wait(50);
    assert.equal((await evaluate(`stressRead()`)).exists, false);
    await wait(250); assert.equal((await evaluate(`stressRead()`)).exists, false);
  });
  await check('door and window stops retain their zone data and keep speech inside the display', async () => {
    await evaluate(`stressCreate(.71);void(0)`); await wait(100);
    let bounds = await evaluate(`(()=>{const node=stress.layer.querySelector('.visitor'),bubble=node.querySelector('.actor-bubble'),r=bubble.getBoundingClientRect();return{zone:node.dataset.zone,quote:bubble.dataset.quoteId,left:r.left,right:r.right,width:innerWidth};})()`);
    assert.equal(bounds.zone, 'door'); assert.ok(bounds.quote); assert.ok(bounds.left >= 0 && bounds.right <= bounds.width, JSON.stringify(bounds));
    await evaluate(`stressCreate(.51);stress.context.reducedMotion=true;stress.controller.tick();void(0)`); await wait(100);
    bounds = await evaluate(`(()=>{const node=stress.layer.querySelector('.visitor'),r=node.querySelector('.actor-bubble').getBoundingClientRect();return{zone:node.dataset.zone,left:r.left,right:r.right,width:innerWidth};})()`);
    assert.equal(bounds.zone, 'window'); assert.ok(bounds.left >= 0 && bounds.right <= bounds.width, JSON.stringify(bounds));
  });
  await evaluate(`stress.controller.destroy();void(0)`);
  assert.deepEqual(errors, []);
  assert.ok(requestedArtwork.length > 0);
  const report = { ok: true, nativeElectron: process.versions.electron, platform: process.platform, checks, requestedArtwork: [...new Set(requestedArtwork)], rendererErrors: errors };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); win.destroy(); app.quit();
}).catch(error => {
  const report = { ok: false, checks, rendererErrors: errors, error: error.stack || String(error) };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.error(report.error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1);
});
