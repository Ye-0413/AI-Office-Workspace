'use strict';
// Observe actual production transforms and joint Animation objects. No seek or fake path.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { installAudit } = require('./support/walking-native-audit.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-natural-walk-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
// This fixture isolates the internal articulated foot Animation objects;
// the public picker always offers painted creatures, covered separately.
let win, settings = { language: 'zh', agentAppearance: 'mixed', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: false, sceneTheme: 'spring', sceneWeather: 'off' };
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
const checks = [], errors = [], traces = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = (id, activity, parentId) => ({ id: 'codex:natural-' + id, provider: 'codex', sessionId: 'natural-' + id, parentId, status: 'active', activity, activeTools: 1, lastEventAt: Date.now(), events: [], projectPath: '/fixture/natural-walk' });
function bounded(promise, label, ms = 20000) { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]).finally(() => clearTimeout(timer)); }
const run = code => bounded(win.webContents.executeJavaScript(code, true), 'native observation');
function send(sessions) { snapshot = { ...snapshot, now: Date.now(), sessions }; win.webContents.send('office:snapshot', snapshot); }
async function until(code, label) { const end = Date.now() + 25000; while (Date.now() < end) { if (await run(code)) return; await wait(20); } throw Error(label); }
const selector = id => `document.querySelector('.actor[data-session-id="${id}"]')`;
function captureWalk(id) {
  const node = document.querySelector('.actor[data-session-id="' + id + '"]');
  const motion = node?.getAnimations().find(a => a.constructor.name === 'Animation' && a.effect?.target === node && a.effect.getKeyframes().length >= 2);
  if (!motion) throw Error('Expected an actual finite body walk');
  const keys = motion.effect.getKeyframes().map(k => { const m = new DOMMatrixReadOnly(k.transform); return { x: m.m41, y: m.m42, offset: k.computedOffset, easing: k.easing }; });
  const duration = motion.effect.getTiming().duration, image = node.querySelector('.character-body>img'), rig = node.querySelector('.ap-rig');
  const foot = node.querySelector('.ap-foot'), loops = node.getAnimations({ subtree: true }).filter(a => a.constructor.name === 'Animation' && a.effect?.target === foot && a.effect.getTiming().iterations === Infinity);
  const loop = loops[0], rows = []; let identity = true;
  return new Promise((resolve, reject) => {
    const started = performance.now();
    function tick(now) {
      if (!node.isConnected) return reject(Error('The admitted body disappeared'));
      const walking = node.dataset.walking === 'true', m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const t = Number.isFinite(motion.currentTime) ? motion.currentTime : duration;
      rows.push({ now, t, x: m.m41, y: m.m42, gaitTime: Number.isFinite(loop?.currentTime) ? loop.currentTime : null, foot: foot ? getComputedStyle(foot).transform : null });
      identity &&= node.querySelector('.ap-rig') === rig && node.querySelector('.character-body>img') === image;
      if (walking) identity &&= node.getAnimations().includes(motion) && (!loop || node.getAnimations({ subtree: true }).includes(loop));
      if (!walking && (motion.playState === 'idle' || motion.playState === 'finished')) return resolve({ keys, duration, rows, identity, loopObserved: Boolean(loop) });
      if (now - started > 16000) return reject(Error('Actual walk did not reach its endpoint'));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
// Solve the actual native keyframe curve independently of WalkTiming. This
// proves the sampled compositor uses its advertised curve and that a short
// segment still stops at a corner, even when +/-60ms includes its next sprint.
function nativeCurve(easing) {
  if (easing === 'linear') return { at: u => u, startSlope: 1, endSlope: 1 };
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
  assert.ok(match, 'physical native easing is an inspectable cubic');
  const [x1, y1, x2, y2] = match[1].split(',').map(Number);
  const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  return { startSlope: y1 / x1, endSlope: (1 - y2) / (1 - x2), at(u) {
    let low = 0, high = 1;
    for (let i = 0; i < 40; i++) { const t = (low + high) / 2; if (cubic(t, x1, x2) < u) low = t; else high = t; }
    return cubic((low + high) / 2, y1, y2);
  } };
}

function assess(trace, label, distanceGait) {
  assert.equal(trace.identity, true, 'one original body, rig, image, body motion and gait loop must survive');
  assert.ok(trace.rows.length >= 31);
  assert.ok(new Set(trace.rows.map(r => r.x.toFixed(2) + '/' + r.y.toFixed(2))).size >= 31);
  const legs = trace.keys.slice(1).map((b, i) => ({ a: trace.keys[i], b, from: trace.keys[i].offset * trace.duration, to: b.offset * trace.duration }));
  const curves = trace.keys.map(key => nativeCurve(key.easing));
  let maximumCurveError = 0;
  for (const row of trace.rows) {
    const leg = legs.find(leg => leg.to > leg.from && row.t <= leg.to) || legs.findLast(leg => leg.to > leg.from);
    const index = legs.indexOf(leg), u = Math.max(0, Math.min(1, (row.t - leg.from) / (leg.to - leg.from))), progress = curves[index].at(u);
    maximumCurveError = Math.max(maximumCurveError, Math.hypot(row.x - leg.a.x - (leg.b.x - leg.a.x) * progress, row.y - leg.a.y - (leg.b.y - leg.a.y) * progress));
  }
  assert.ok(maximumCurveError < .08, 'every actual compositor sample follows its native physical time law: ' + maximumCurveError);
  const speeds = trace.rows.slice(1).flatMap((b, i) => { const a = trace.rows[i], dt = b.t - a.t; return dt > 4 ? [{ t: (a.t + b.t) / 2, speed: Math.hypot(b.x - a.x, b.y - a.y) / dt * 1000 }] : []; });
  const peak = Math.max(...speeds.map(r => r.speed));
  const start = speeds.filter(r => r.t < Math.min(100, legs[0].to / 6)).map(r => r.speed);
  const end = speeds.filter(r => r.t > trace.duration - Math.min(100, (legs.at(-1).to - legs.at(-1).from) / 6)).map(r => r.speed);
  assert.ok(start.length >= 3 && end.length >= 3, 'sample actual start and braking windows');
  assert.ok(median(start) < peak * .4, 'actual body starts gently: ' + JSON.stringify({ start: median(start), peak }));
  assert.ok(median(end) < peak * .4, 'actual body brakes at its endpoint: ' + JSON.stringify({ end: median(end), peak }));
  assert.ok(peak <= 340, 'physical peak remains below its 320 bound plus compositor measurement tolerance');
  const turns = [];
  for (let i = 1; i < trace.keys.length - 1; i++) {
    const a = trace.keys[i - 1], b = trace.keys[i], c = trace.keys[i + 1], ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    if (!Math.hypot(ux, uy) || !Math.hypot(vx, vy) || Math.abs(ux * vy - uy * vx) < .001 && ux * vx + uy * vy > 0) continue;
    const before = legs[i - 1], after = legs[i];
    const incoming = Math.hypot(ux, uy) / (before.to - before.from) * 1000 * curves[i - 1].endSlope;
    const outgoing = Math.hypot(vx, vy) / (after.to - after.from) * 1000 * curves[i].startSlope;
    assert.ok(Math.abs(incoming) < .001 && Math.abs(outgoing) < .001, 'each native physical corner has zero incoming and outgoing velocity');
    const t = b.offset * trace.duration, window = Math.min(60, (before.to - before.from) / 12, (after.to - after.from) / 12);
    const nearby = speeds.filter(r => Math.abs(r.t - t) < window).map(r => r.speed);
    assert.ok(nearby.length >= 3 && median(nearby) < peak * .25, 'each original real corner slows before changing direction: ' + JSON.stringify({ t, window, nearby, peak }));
    turns.push({ t, window, medianSpeed: median(nearby), incomingSpeed: incoming, outgoingSpeed: outgoing });
  }
  if (distanceGait) {
    assert.equal(trace.loopObserved, true, 'actual entity walking uses the original four-foot rig');
    let distance = 0; const ratios = [];
    for (let i = 1; i < trace.rows.length; i++) {
      const a = trace.rows[i - 1], b = trace.rows[i], d = Math.hypot(b.x - a.x, b.y - a.y); distance += d;
      if (a.gaitTime !== null && b.gaitTime !== null && d > .2 && a.t > 220 && b.t < trace.duration - 40) ratios.push((b.gaitTime - a.gaitTime) / d);
    }
    assert.ok(ratios.length >= 31);
    assert.ok(Math.abs(median(ratios) - 600 / 192) < .08, 'same-instance foot phase follows actual path distance rather than an unrelated fixed clock');
    checks.push({ label, frames: trace.rows.length, peak, initialSpeed: median(start), finalSpeed: median(end), turns, maximumCurveError, gaitMsPerWorldPixel: median(ratios), distance });
  } else checks.push({ label, frames: trace.rows.length, peak, initialSpeed: median(start), finalSpeed: median(end), turns, maximumCurveError });
}
const guard = setTimeout(() => { console.error('Natural walk fixture timed out'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  for (const [name, handler] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => handler(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, enableLargerThanScreen: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_, details) => errors.push('renderer gone: ' + details.reason));
  // Intercept only the model export in this isolated fixture, before app.js
  // constructs its registry. Public code exposes no legacy-body preference.
  await bounded(win.loadURL('about:blank'), 'initial renderer target');
  win.webContents.debugger.attach('1.3');
  await bounded(win.webContents.debugger.sendCommand('Page.enable'), 'internal rig page target');
  await bounded(win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{Object.defineProperty(window,'OfficePublicArtwork',{configurable:true,get:()=>undefined,set:()=>{}});let model;Object.defineProperty(window,'OfficeAgentAppearance',{configurable:true,get:()=>model,set:value=>{model={...value,createAllocator:()=>null,forSession:()=>null};}});})()` }), 'internal rig fixture hook');
  await bounded(win.loadFile(path.join(__dirname, '../renderer/index.html')), 'production page');
  await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }), 'ordinary motion');
  await run('(' + installAudit.toString() + ')()');
  let main = task('main', 'reading');
  await run(`crowdAudit.begin('actual natural door entry',${JSON.stringify([main.id])},[])`); send([main]);
  await until(`${selector(main.id)}?.dataset.walking==='true'`, 'the main must really walk from the door');
  const observation = run('(' + captureWalk.toString() + ')(' + JSON.stringify(main.id) + ')');
  for (let i = 0; i < 7; i++) { await wait(80); send([{ ...main, title: 'observed metadata ' + i, lastEventAt: Date.now() }]); }
  const entry = await observation; traces.push({ label: 'main door entry', ...entry }); assess(entry, 'main door entry', true);
  const audit = await run('crowdAudit.finish()'); assert.deepEqual(audit.violations, []); checks.push(audit);
  await run(`(()=>{const n=document.getElementById('setting-lowPower');n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  main = { ...main, activity: 'coding', lastEventAt: Date.now() }; send([main]);
  await until(`${selector(main.id)}?.dataset.walking==='true'`, 'lowPower still moves the real body through its original route');
  const lowPower = await run('(' + captureWalk.toString() + ')(' + JSON.stringify(main.id) + ')'); traces.push({ label: 'lowPower physical walk', ...lowPower }); assess(lowPower, 'lowPower physical walk', false);
  assert.equal(await run(`${selector(main.id)}.dataset.locomotion===undefined`), true, 'lowPower pauses the decorative stride without teleporting the body');
  assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, scope: 'natural-body-time-and-distance-stride', checks, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const directory = process.env.MINI_OFFICE_NATURAL_PREVIEW_DIR;
  if (directory) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'traces.json'), JSON.stringify({ checks, errors, traces }, null, 2)); }
  clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
