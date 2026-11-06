'use strict';
// Production page and isolated IPC. CDP dispatches real renderer pointer and
// keyboard events without touching the host's input or connected AI tools.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createSettings } = require('../lib/settings.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pixel-ui-'));
app.setPath('userData', path.join(scratch, 'profile'));
app.disableHardwareAcceleration();
const settings = createSettings(scratch);
settings.set({ avatarStyle: 'pixel', language: 'en', roomDesign: 'legacy', sceneTime: 'morning',
  sceneTheme: 'spring', sceneWeather: 'off', idleVisitor: false, reducedMotion: true });
let win;
const errors = [], checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = source => win.webContents.executeJavaScript(source, true);
const debuggerCommand = (method, params) => win.webContents.debugger.sendCommand(method, params);
const element = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
const motions = selector => `(${element(selector)}?.getAnimations({subtree:true})||[]).filter(a=>a.id.startsWith('pixel-ui-')).map(a=>a.id).sort()`;
const dialog = selector => `${element(selector)}.open`;

async function until(source, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await run(source)) return;
    await wait(15);
  }
  throw Error(label);
}

async function point(selector, topInset = null) {
  const hit = await run(`(()=>{
    const node=${element(selector)};
    if(!node)return null;
    if(node.closest('dialog'))node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    const rect=node.getBoundingClientRect();
    if(rect.width===0||rect.height===0)return null;
    const x=rect.left+rect.width/2,y=rect.top+(${topInset}??rect.height/2);
    return node.contains(document.elementFromPoint(x,y))?{x,y}:null;
  })()`);
  assert.ok(hit, selector + ' must have a real pointer target');
  return hit;
}

async function buttonState(selector) {
  return run(`(()=>{const button=${element(selector)};
    return { bounds:button.getBoundingClientRect().toJSON(), shadow:getComputedStyle(button).boxShadow };
  })()`);
}

async function mouse(type, position) {
  await debuggerCommand('Input.dispatchMouseEvent', { type, ...position, button: 'left', clickCount: 1 });
}

async function click(selector) {
  const position = await point(selector);
  await mouse('mousePressed', position);
  await mouse('mouseReleased', position);
}

async function key(name, code) {
  for (const type of ['keyDown', 'keyUp']) {
    const text = name === 'Enter' && type === 'keyDown' ? '\r' : '';
    await debuggerCommand('Input.dispatchKeyEvent', { type, key: name, code: name, text, unmodifiedText: text, windowsVirtualKeyCode: code });
  }
}

async function noMotion(selector) {
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.deepEqual(await run(motions(selector)), []);
}

const guard = setTimeout(() => { console.error('Pixel UI fixture timed out'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  let activity = 'coding';
  const snapshot = () => ({
    mode: 'live', now: Date.now(), avatarStyle: settings.get().avatarStyle, connections: [],
    sessions: [{ id: 'codex:pixel-ui-fixture', sessionId: 'pixel-ui-fixture', provider: 'codex', title: 'Inspect this task',
      status: 'active', activity, activeTools: 1, lastEventAt: Date.now(), events: [], projectPath: '/fixture/pixel-ui' }]
  });
  for (const [channel, handler] of Object.entries({
    snapshot, settings: () => settings.get(), 'set-settings': patch => settings.set(patch),
    displays: () => [], 'setup-status': () => null, 'usage-status': () => ({ available: false }),
    'usage-history': () => ({ items: [], total: 0 }), 'token-usage': () => null, 'token-refresh': () => null
  })) ipcMain.handle('office:' + channel, (_event, ...args) => handler(...args));
  ipcMain.on('office:renderer-error', (_event, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.debugger.attach('1.3');
  await debuggerCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await until(`document.documentElement.dataset.avatarStyle==='pixel'&&${element('#office')}.dataset.reducedMotion==='true'&&
    document.querySelector('.actor[data-session-id="codex:pixel-ui-fixture"]')?.dataset.walking!=='true'&&
    !!document.querySelector('.actor[data-session-id="codex:pixel-ui-fixture"]')`, 'Passive fixture settles without motion');

  await click('#settings-button');
  assert.equal(await run(dialog('#settings-dialog')), true);
  await noMotion('#settings-dialog');
  await click('#setting-reducedMotion');
  await until(`${element('#office')}.dataset.reducedMotion==='false'`, 'App reduced-motion preference changes');
  await click('#settings-dialog .dialog-close');

  const settingsPoint = await point('#settings-button', 1);
  const idleButton = await buttonState('#settings-button');
  await mouse('mousePressed', settingsPoint);
  await until(`${element('#settings-button')}.hasAttribute('data-pixel-pressed')&&${element('#settings-button')}.matches(':active')`,
    'The original top edge registers a trusted pointer press');
  await wait(150); // Include the end of the previous 120ms translation.
  const pressedButton = await buttonState('#settings-button');
  assert.notEqual(pressedButton.shadow, idleButton.shadow, 'Press changes the painted depth');
  assert.deepEqual(pressedButton.bounds, idleButton.bounds, 'Press keeps the hitbox fixed at the original top edge');
  await mouse('mouseReleased', settingsPoint);
  assert.equal(await run(dialog('#settings-dialog')), true, 'Release at the same top edge opens the modal');
  await until(`${motions('#settings-dialog')}.includes('pixel-ui-dock')`, 'Top-right panel owns an entrance');
  assert.deepEqual(await run(motions('#settings-dialog')), ['pixel-ui-backdrop', 'pixel-ui-dock']);
  assert.equal(await run(`${element('#settings-dialog')}.contains(document.activeElement)`), true);
  assert.equal(await run(`${element('#settings-button')}.hasAttribute('data-pixel-pressed')`), false);
  await click('#settings-dialog .dialog-close');
  assert.equal(await run(dialog('#settings-dialog')), false, 'A close click does not wait for a visual effect');
  await noMotion('#settings-dialog');
  await click('#settings-button');
  await until(`${motions('#settings-dialog')}.includes('pixel-ui-dock')`, 'Immediate reopening creates one new dock entrance');
  assert.deepEqual(await run(motions('#settings-dialog')), ['pixel-ui-backdrop', 'pixel-ui-dock']);
  await click('#setting-lowPower');
  await until(`${element('#office')}.dataset.lowPower==='true'&&${motions('#settings-dialog')}.length===0`, 'Low power cancels the live entrance');
  await click('#setting-lowPower');
  await click('#settings-dialog .dialog-close');
  checks.push('top-edge pointer press/release keeps the same hitbox, then opens the dock and backdrop');
  checks.push('immediate close/reopen and low-power cancellation');

  await run(`${element('#settings-button')}.focus()`);
  assert.equal(await run('document.activeElement.id'), 'settings-button');
  await key('Enter', 13);
  await until(dialog('#settings-dialog'), 'Native Enter opens Settings');
  await noMotion('#settings-dialog');
  await key('Escape', 27);
  await until(`!${dialog('#settings-dialog')}`, 'Escape closes the native modal');
  assert.equal(await run('document.activeElement.id'), 'settings-button');
  checks.push('keyboard opens immediately and native Escape restores focus');

  await click('#usage-history-button');
  await until(`${motions('#usage-history-dialog')}.includes('pixel-ui-dialog')`, 'Centered dialog has a different entrance');
  assert.deepEqual(await run(motions('#usage-history-dialog')), ['pixel-ui-backdrop', 'pixel-ui-dialog']);
  assert.equal(await run('document.activeElement.id'), 'usage-range');
  await debuggerCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await noMotion('#usage-history-dialog');
  await click('#usage-history-close');
  await click('#usage-history-button');
  assert.equal(await run(dialog('#usage-history-dialog')), true);
  await noMotion('#usage-history-dialog');
  await click('#usage-history-close');
  await click('#manual-questions-button');
  const manualClose = '#manual-questions-close', manualDialog = '#manual-questions-dialog';
  let manualPoint = await point(manualClose);
  await mouse('mousePressed', manualPoint);
  assert.equal(await run(`${element(manualClose)}.hasAttribute('data-pixel-pressed')`), false);
  await mouse('mouseReleased', manualPoint);
  await debuggerCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await until(`${element('#office')}.dataset.reducedMotion==='false'`, 'System motion setting released');
  checks.push('centered dialog keeps focus and respects a system quiet change during entrance');

  await click('#manual-questions-button');
  await until(`${motions(manualDialog)}.includes('pixel-ui-dialog')`, 'Body-mounted manual dialog receives the same native modal entrance');
  await until(`${motions(manualDialog)}.length===0`, 'Manual dialog entrance finishes');
  manualPoint = await point(manualClose);
  const manualIdle = await buttonState(manualClose);
  await mouse('mousePressed', manualPoint);
  await until(`${element(manualClose)}.hasAttribute('data-pixel-pressed')&&${element(manualClose)}.matches(':active')`, 'Manual dialog close button registers a pointer press');
  const manualPressed = await buttonState(manualClose);
  assert.notEqual(manualPressed.shadow, manualIdle.shadow, 'Body-mounted manual dialog gets the same press depth');
  assert.deepEqual(manualPressed.bounds, manualIdle.bounds);
  await mouse('mouseReleased', manualPoint);
  assert.equal(await run(dialog(manualDialog)), false);
  checks.push('body-mounted manual dialog shares press and quiet rules without submitting anything');

  await click('.festival-summary');
  await until(`${motions('.festival-panel')}.includes('pixel-ui-popover')`, 'Festival disclosure enters from its trigger');
  assert.deepEqual(await run(motions('.festival-panel')), ['pixel-ui-popover']);
  await click('.festival-summary');
  assert.equal(await run(dialog('.festival-chooser')), false);
  await noMotion('.festival-panel');
  await click('.actor[data-session-id="codex:pixel-ui-fixture"] .actor-button');
  await until(`${motions('#inspector')}.includes('pixel-ui-inspector')`, 'Task inspector enters separately from modal and disclosure');
  assert.equal(await run('document.activeElement.id'), 'inspector');
  const actor = '.actor[data-session-id="codex:pixel-ui-fixture"]';
  const bubble = actor + ' .actor-bubble';
  await until(`(()=>{const d=${element(actor)}.dataset;return d.walking!=='true'&&
    !['queued','waiting-space','moving','yielding'].includes(d.traffic)&&d.reaction!=='true'})()`, 'Observed actor is available to greet');
  await run(`window.speechTransitions=[];${element(bubble)}.addEventListener('transitionrun',e=>speechTransitions.push(e.propertyName));void 0`);
  await click('#greet-agent');
  try { await until("speechTransitions.includes('translate')", 'Greeting uses a short speech balloon transition'); }
  catch (error) {
    const state = await run(`({actor:{...${element(actor)}.dataset},bubble:{...${element(bubble)}.dataset},
      transition:getComputedStyle(${element(bubble)}).transition,office:{...${element('#office')}.dataset},properties:speechTransitions})`);
    throw Error(error.message+' '+JSON.stringify(state));
  }
  assert.match(await run(`${element(bubble)}.style.transform`), /translateX/, 'The bubble keeps its computed horizontal anchor');
  await key('Escape', 27);
  assert.equal(await run(`${element('#inspector')}.hidden`), true);
  await noMotion('#inspector');
  checks.push('native festival disclosure, task inspector and speech have distinct presentation cues');

  await until(`${element(actor)}.dataset.reaction!=='true'`, 'Greeting releases the observed actor');
  activity = 'error';
  win.webContents.send('office:snapshot', snapshot());
  const mark = actor + ' .actor-mark', problem = '.scene-effect[data-effect="problem"]';
  await until(`!!${element(problem)}&&${element(mark)}.getAnimations().some(a=>a.transitionProperty==='translate')`,
    'An observed error raises a finite impact cue and shows the attention mark');
  const impact = await run(`(()=>{const animation=${element(problem)}.getAnimations()[0],frames=animation.effect.getKeyframes();
    return { duration:animation.effect.getTiming().duration, anchored:frames.at(-1).transform===frames.at(-2).transform,
      badgeLoops:${element(mark)}.getAnimations().some(a=>typeof a.animationName==='string') };})()`);
  assert.deepEqual(impact, { duration: 820, anchored: true, badgeLoops: false });
  await until(`!${element(problem)}&&${element(mark)}.getAnimations().length===0`, 'Error impact cleans up and attention settles without a loop');
  assert.equal(await run(`getComputedStyle(${element(mark)}).opacity`), '1');
  checks.push('observed error has one anchored impact and a finite badge transition');

  settings.set({ avatarStyle: 'painted' });
  win.webContents.send('office:snapshot', snapshot());
  await until("document.documentElement.dataset.avatarStyle==='painted'", 'Painted style updates on the native snapshot');
  await click('#settings-button');
  assert.equal(await run(dialog('#settings-dialog')), true);
  await noMotion('#settings-dialog');
  checks.push('painted style keeps its original presentation');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(guard); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
