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
  const html = `<html><head><base href="${renderer}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><style>body{margin:0;background:#483b31;color:#ead9b2;font:14px sans-serif;display:grid;grid-template-columns:repeat(4,308px);gap:4px}.fixture{position:relative;height:258px;overflow:hidden;background:#63513f}.character-body{position:absolute;left:77px;top:44px;transform:scale(2);transform-origin:50% 50%}.label{position:absolute;left:12px;bottom:12px}*{box-sizing:border-box}</style></head><body><script src="../lib/avatar-performance-model.js"></script><script src="avatar-performance.js"></script><script>window.items=[];for(const activity of ${JSON.stringify(Object.keys(Model.KINDS))}){const actor=document.createElement('div');actor.className='fixture';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.src='../assets/avatars/clawd-static-base.svg';body.append(image);actor.append(body);const label=document.createElement('span');label.className='label';label.textContent=activity;actor.append(label);document.body.append(actor);const session={id:'fixture:'+activity,provider:'codex',activity,status:'active'};const performance=OfficeAvatarPerformance.create({actorNode:actor,body,session});performance.update(session);window.items.push({actor,body,session,performance});}</script></body></html>`;
  fs.writeFileSync(path.join(scratch, 'fixture.html'), html);
  win = new BrowserWindow({ width: 1248, height: 800, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_event, details) => errors.push('renderer gone: ' + details.reason));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { errors.push('Unexpected network: ' + details.url); callback({ cancel: true }); });
  await win.loadFile(path.join(scratch, 'fixture.html'));
  await delay(250);
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  assert.equal(await evaluate('items.length'), 11);
  assert.equal(await evaluate('items.every(item => item.body.querySelector("img").naturalWidth > 0)'), true);
  const original = await evaluate('items.map(item=>({kind:item.actor.dataset.performance,count:item.body.getAnimations({subtree:true}).length,transforms:[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform),timelines:item.body.getAnimations({subtree:true}).map(animation=>animation.startTime)}))');
  assert.equal(original.every(item => item.count >= 5), true, 'all eleven performances actually animate independent character joints');
  await delay(350);
  const later = await evaluate('items.map(item=>[...item.body.querySelectorAll(".ap-upper,.ap-arm,.ap-eyes")].map(node=>getComputedStyle(node).transform))');
  assert.ok(original.filter((item, index) => JSON.stringify(item.transforms) !== JSON.stringify(later[index])).length >= 7, 'native joint poses move across the authored choreographies');
  await evaluate('items.forEach(item=>item.performance.update({...item.session,title:"Metadata update",lastEventAt:Date.now()}))');
  const sameTimelines = await evaluate('items.map(item=>item.body.getAnimations({subtree:true}).map(animation=>animation.startTime))');
  assert.deepEqual(sameTimelines, original.map(item => item.timelines), 'metadata does not replay any CSS timeline');
  const image = await win.webContents.capturePage();
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-performances.png'), image.toPNG());
  }
  for (const preference of ['reducedMotion', 'lowPower', 'hidden', 'walking', 'reaction', 'departing', 'stale']) {
    await evaluate(`items.forEach(item=>item.performance.update(item.session,{${preference}:true}))`);
    assert.equal(await evaluate('items.reduce((sum,item)=>sum+item.body.getAnimations({subtree:true}).length,0)'), 0, preference + ' stops native animation timelines');
  }
  await evaluate('items.forEach(item=>item.performance.update(item.session))');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate('document.getAnimations().length'), 0, 'system reduced motion stops timelines independently of settings');
  if (process.env.MINI_OFFICE_PREVIEW_DIR) fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'avatar-performances-still.png'), (await win.webContents.capturePage()).toPNG());
  win.webContents.debugger.detach();
  await evaluate('items.forEach(item=>item.performance.destroy())');
  assert.equal(await evaluate('document.querySelectorAll(".avatar-performance").length'), 0);
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, performances: original.map(item => item.kind), nativeChecks: ['artwork', 'joint motion', 'metadata continuity', 'quiet modes', 'lifecycle suspension', 'destroy cleanup'], preview: process.env.MINI_OFFICE_PREVIEW_DIR || null }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); if (win && !win.isDestroyed()) win.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.quit(); });
