'use strict';
// Production page and preload with isolated, passive session snapshots.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettings } = require('../lib/settings.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-avatar-styles-'));
app.setPath('userData', path.join(scratch, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-color-profile', 'srgb');
const store = createSettings(scratch);
let settings = store.set({
  language: 'en', roomDesign: 'legacy', sceneTime: 'morning', sceneWeather: 'off',
  idleVisitor: false, reducedMotion: true, agentScale: .65
});
const mainId = 'codex:avatar-style-main', helperId = 'codex:avatar-style-helper';
const task = (id, details = {}) => ({
  id, sessionId: id, provider: 'codex', title: 'Observed style fixture',
  status: 'active', activity: 'coding', activeTools: 1, lastEventAt: Date.now(),
  events: [], projectPath: '/fixture/avatar-style', ...details
});
const sessions = [task(mainId), task(helperId, { parentId: mainId, activity: 'reading' })];
let win, sessionsReady = false;
const settingsWrites = [], errors = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = source => win.webContents.executeJavaScript(source, true);
const snapshot = () => ({
  mode: 'live', now: Date.now(), sessions: sessionsReady ? sessions : [],
  connections: [], avatarStyle: settings.avatarStyle
});
const publish = () => win.webContents.send('office:snapshot', snapshot());
const control = 'document.getElementById("setting-avatarStyle")';

async function until(source, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await run(source)) return;
    await wait(30);
  }
  const evidence = await run(`({
    style:${control}?.value, errors:document.getElementById('error-message').textContent,
    actors:[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({
      id:node.dataset.sessionId, walking:node.dataset.walking, visible:getComputedStyle(node).visibility,
      layer:{...node.querySelector('.creature-performance')?.dataset},
      frames:node.querySelector('.cp-frame')?.getAttribute('href')
    }))
  })`);
  throw Error(label + ' ' + JSON.stringify(evidence));
}

function ready(style) {
  const prefix = style === 'pixel' ? 'workshop-' : 'painted-';
  const directory = style === 'pixel' ? 'frames/' : 'painted-frames/';
  const width = style === 'pixel' ? 120 : 1536;
  return `(()=>{const actors=[...document.querySelectorAll('.actor[data-session-id]')];return actors.length===2&&actors.every(node=>{
    const layer=node.querySelector('.creature-performance'), image=node.querySelector('.character-body > img');
    const source=layer?.querySelector('defs image'), frame=layer?.querySelector('.cp-frame');
    return getComputedStyle(node).visibility==='visible'&&node.dataset.walking!=='true'&&
      layer?.dataset.avatarStyle===${JSON.stringify(style)}&&layer.dataset.artState==='healthy'&&layer.dataset.frames==='true'&&
      image.naturalWidth===${width}&&image.src.endsWith('/'+${JSON.stringify(prefix)}+node.dataset.bodyDesign+'.png')&&
      source?.getAttribute('href').endsWith('/'+${JSON.stringify(prefix)}+node.dataset.bodyDesign+'.png')&&
      frame?.getAttribute('href').includes('/'+${JSON.stringify(directory)}+node.dataset.bodyDesign+'/');
  });})()`;
}

async function toggleSettings() {
  await run(`document.getElementById('settings-button').click();void 0`);
}
async function closeSettings() {
  await run(`document.querySelector('#settings-dialog [data-close-dialog]').click();void 0`);
}
async function paint() {
  await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function capture(rect) {
  await paint();
  return Buffer.from((await win.webContents.capturePage(rect)).toBitmap());
}
function changedPixels(before, after) {
  assert.equal(before.length, after.length);
  let count = 0;
  for (let offset = 0; offset < before.length; offset += 4) {
    const difference = Math.abs(before[offset] - after[offset]) +
      Math.abs(before[offset + 1] - after[offset + 1]) + Math.abs(before[offset + 2] - after[offset + 2]);
    if (difference >= 42) count++;
  }
  return count;
}

const watchdog = setTimeout(() => app.exit(2), 65000);
app.whenReady().then(async () => {
  const handlers = {
    snapshot, settings: () => settings, displays: () => [],
    'set-settings': patch => {
      settingsWrites.push(patch);
      const previousStyle = settings.avatarStyle;
      settings = store.set(patch);
      if (settings.avatarStyle !== previousStyle) publish();
      return settings;
    }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('office:' + name, (_, ...args) => handler(...args));
  for (const name of ['connect', 'disconnect', 'setup-initialize', 'answer-question', 'open-source']) {
    ipcMain.handle('office:' + name, () => { errors.push('Unexpected work IPC: ' + name); return {}; });
  }
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({
    width: 1280, height: 900, show: false, useContentSize: true,
    webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.webContents.on('console-message', detail => { if (detail.level === 'error') errors.push(detail.message); });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (detail, callback) => {
    errors.push('Unexpected network request: ' + detail.url);
    callback({ cancel: true });
  });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await until(`Boolean(${control})&&document.documentElement.lang==='en'`, 'Avatar style control mounts and loads the saved language');
  assert.equal(await run(`${control}.value`), 'pixel');
  assert.deepEqual(await run(`[...${control}.options].map(option=>[option.value,option.textContent])`), [['pixel', 'Pixel'], ['painted', 'Painted']]);

  sessionsReady = true;
  publish();
  await until(ready('pixel'), 'Default pixel sheets and strips decode');
  const rect = await run(`(()=>{
    window.familyEvidence=[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({
      node, body:node.querySelector('.character-body'), button:node.querySelector('.actor-button'), layer:node.querySelector('.creature-performance'),
      id:node.dataset.sessionId, family:node.dataset.family, key:node.dataset.bodyAppearance,
      provider:node.querySelector('.actor-provider').dataset.provider, state:node.querySelector('.actor-state').textContent,
      transform:node.style.transform
    }));
    window.sameFamily=()=>familyEvidence.every(({node,body,button,id,family,key,provider,state,transform})=>
      node.isConnected&&node.dataset.sessionId===id&&node.dataset.family===family&&node.dataset.bodyAppearance===key&&
      node.querySelector('.character-body')===body&&node.querySelector('.actor-button')===button&&
      node.querySelector('.actor-provider').dataset.provider===provider&&node.querySelector('.actor-state').textContent===state&&node.style.transform===transform
    );
    const main=familyEvidence.find(item=>item.id===${JSON.stringify(mainId)}),r=main.body.getBoundingClientRect();
    return {x:Math.round(r.x),y:Math.round(r.y),width:Math.floor(r.width),height:Math.floor(r.height)};
  })()`);
  const family = await run('familyEvidence.map(({id,family,key})=>({id,family,key}))');
  assert.equal(family.find(item => item.id === helperId).family, mainId);
  assert.equal(family[0].key, family[1].key, 'a real child inherits its main appearance');
  const initialPixels = await capture(rect);

  await toggleSettings();
  await run(`{const select=${control};select.value='painted';select.dispatchEvent(new Event('change',{bubbles:true}));}void 0`);
  await until(ready('painted'), 'The selected painted sheets and strips replace both pixel layers');
  assert.deepEqual(settingsWrites, [{ avatarStyle: 'painted' }]);
  assert.equal(createSettings(scratch).get().avatarStyle, 'painted');
  assert.equal(await run(`sameFamily()&&familyEvidence.every(({node,layer})=>!layer.isConnected&&!node.querySelector('.cp-emotes'))`), true);
  await until(`[...document.querySelectorAll('.appearance-pose-preview img')].every(img=>img.naturalWidth===1536)`, 'Painted style cards also decode their painted atlases');
  assert.equal(await run(`${control}.value`), 'painted');
  assert.equal(await run(`[...document.querySelectorAll('.actor .creature-performance')].every(layer=>layer.getAnimations({subtree:true}).length===0)`), true, 'Reduced motion holds the painted work cels');
  await run(`document.querySelector('.repertoire-gallery').open=true;void 0`);
  await until(`document.querySelector('.repertoire-preview .painted-creature-performance')?.dataset.frames==='true'&&
    document.querySelector('.repertoire-preview .cp-frame')?.getAttribute('href').includes('/painted-frames/')`, 'The gallery defaults to the selected Painted strip');
  const variation = 'document.querySelector("[name=repertoire-variant]")';
  assert.deepEqual(await run(`[...${variation}.options].map(option=>option.value)`), ['painted', ...Array.from({ length: 10 }, (_, index) => String(index))]);
  await run(`{const select=${variation};select.value='3';select.dispatchEvent(new Event('change',{bubbles:true}));}void 0`);
  await until(`document.querySelector('.repertoire-preview .cp-activity')?.dataset.variant==='3'&&
    document.querySelector('.repertoire-preview .painted-creature-performance')?.dataset.frames==='false'`, 'The numerical choice plays a separate Painted reference recipe');
  assert.equal(await run(ready('painted')), true, 'Reference recipes never change real session renderers');
  assert.deepEqual(settingsWrites, [{ avatarStyle: 'painted' }], 'Gallery navigation writes no preferences');
  await closeSettings();
  const paintedPixels = await capture(rect);
  const paintedDelta = changedPixels(initialPixels, paintedPixels);
  assert.ok(paintedDelta > 300, 'The real room paints distinctly different avatar bytes: ' + paintedDelta);

  await toggleSettings();
  await run(`document.getElementById('setting-reducedMotion').click();void 0`);
  await until(`[...document.querySelectorAll('.actor .painted-creature-performance')].every(layer=>layer.getAnimations({subtree:true}).some(animation=>animation.effect.target.matches('.cp-frame')&&animation.playState==='running'))`, 'Painted work owns active native strip clocks when motion is enabled');
  await run(`window.paintedLayers=[...document.querySelectorAll('.actor .painted-creature-performance')];window.paintedClocks=paintedLayers.flatMap(layer=>layer.getAnimations({subtree:true}));void 0`);
  settings = store.set({ avatarStyle: 'pixel' });
  publish();
  await until(ready('pixel'), 'A native settings snapshot switches the same family back to Pixel');
  assert.equal(await run(`${control}.value`), 'pixel');
  assert.equal(await run(`${variation}===null`), true, 'Pixel gallery exposes only its production strips');
  assert.equal(await run(`sameFamily()&&paintedLayers.every(layer=>!layer.isConnected)&&paintedClocks.length>0&&paintedClocks.every(animation=>animation.playState==='idle')`), true, 'Detached painted owners cannot leave stale visible frames or clocks');
  await run(`document.getElementById('setting-reducedMotion').click();void 0`);
  await until(`[...document.querySelectorAll('.actor .creature-performance')].every(layer=>layer.dataset.frames==='true'&&layer.getAnimations({subtree:true}).length===0&&[...layer.querySelectorAll('.cp-frame')].filter(frame=>Number(getComputedStyle(frame).opacity)>0).length===1)`, 'Reduced motion keeps one opaque pixel cel and releases all native motion');
  await closeSettings();
  const returnedPixels = await capture(rect);
  const returnDelta = changedPixels(initialPixels, returnedPixels);
  assert.ok(returnDelta < paintedDelta / 2, 'Returning to Pixel restores the original compositor bytes: ' + JSON.stringify({ paintedDelta, returnDelta }));
  assert.deepEqual(settingsWrites, [{ avatarStyle: 'painted' }, { reducedMotion: false }, { reducedMotion: true }]);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, paintedDelta, returnDelta, family, settingsWrites, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(watchdog);
  win?.destroy();
  fs.rmSync(scratch, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
