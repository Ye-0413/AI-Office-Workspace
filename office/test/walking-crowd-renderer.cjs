'use strict';
// Real production DOM/WAAPI traffic; isolated observations and userData only.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-walking-crowd-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win, stage = 'startup';
let settings = { language: 'zh', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: false, sceneVenue: 'workshop', sceneTheme: 'spring', sceneWeather: 'off' };
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
const checks = [], errors = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = (index, activity, parentId) => ({
  id: 'codex:crowd-' + String(index).padStart(2, '0'), sessionId: 'crowd-' + index,
  provider: 'codex', parentId, status: 'active', activity,
  activeTools: ['idle', 'unknown'].includes(activity) ? 0 : 1,
  lastEventAt: Date.now(), projectPath: '/fixture/crowd', events: [],
  evidence: { source: 'hook', confidence: 'explicit' }
});
const bounded = (promise, label, ms = 20000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]).finally(() => clearTimeout(timer));
};
const run = code => bounded(win.webContents.executeJavaScript(code, true), stage + ': renderer evaluation');
function send(sessions) {
  snapshot = { ...snapshot, sessions, now: Date.now() };
  win.webContents.send('office:snapshot', snapshot);
}

// Use the same independently tested full native geometry audit as every
// other production fixture; do not fork its continuous-sweep or endpoint rules.
const { installAudit } = require('./support/walking-native-audit.cjs');

const allSettled = count => `(()=>{const rows=[...document.querySelectorAll('.actor[data-session-id]')];return rows.length===${count}&&rows.every(node=>getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>.99&&node.dataset.walking!=='true'&&node.dataset.traffic==='arrived'&&!['splitting','returning','absorbing'].includes(node.dataset.clonePhase))&&Number(document.getElementById('office').dataset.entranceQueue)===0})()`;
async function until(predicate, label, ms = 70000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const current = await run('crowdAudit.report()');
    if (current) assert.deepEqual(current.violations, [], stage + ': ' + JSON.stringify(current));
    if (await run(predicate)) return;
    await pause(80);
  }
  throw Error(label + ': ' + JSON.stringify(await run(`({audit:crowdAudit.report(),rows:[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({id:node.dataset.sessionId,traffic:node.dataset.traffic,clone:node.dataset.clonePhase,visibility:getComputedStyle(node).visibility,transform:getComputedStyle(node).transform}))})`)));
}
async function begin(name, sessions, allowedRemoved = []) {
  stage = name; console.log('[walking-crowd]', name);
  await run(`crowdAudit.begin(${JSON.stringify(name)},${JSON.stringify(sessions.map(session => session.id))},${JSON.stringify(allowedRemoved)})`);
}
async function finish({ minimumScale = 0, parallel = false, dock = false, yieldRequired = false } = {}) {
  const report = await run('crowdAudit.finish()');
  checks.push(report);
  assert.deepEqual(report.violations, [], JSON.stringify(report));
  assert.ok(report.frames >= 31, 'at least 31 actual RAF frames: ' + JSON.stringify(report));
  if (minimumScale) assert.ok(report.minScale >= minimumScale - .00001, 'natural body size regressed during actual traffic: ' + JSON.stringify(report));
  if (parallel) { assert.ok(report.maxMoving >= 2 && report.parallelFrames >= 5); assert.ok(report.corridorPairsChecked >= 5, 'actual future route rectangles must be independently checked'); }
  if (dock) assert.ok(report.dockedFrames >= 31, 'the true parent docking lock must be observed over real return frames');
  if (yieldRequired) assert.ok(report.yieldingFrames >= 5 && report.yieldedIds.length > 0, 'the test must contain a real yielding body, not merely an unblocked walk');
  console.log('[walking-crowd] passed', nameFor(report)); return report;
}
function nameFor(report) { return report.name + ' (' + report.frames + ' RAF, max ' + report.maxMoving + ' walking)'; }
async function heartbeat(sessions) { for (let i = 0; i < 5; i += 1) { await pause(180); send(sessions.map(session => ({ ...session, lastEventAt: Date.now() }))); } }
async function readGeometry() {
  return run(`(()=>{const w=document.getElementById('world').getBoundingClientRect(),factor=w.width/1280;return [...document.querySelectorAll('.actor')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),scale=Math.hypot(m.m11,m.m12),p=[n.querySelector('.character-body'),n.querySelector('.nameplate')].map(p=>p.getBoundingClientRect()),x=w.left+m.m41*factor,y=w.top+m.m42*factor;return{id:n.dataset.sessionId,position:{x:m.m41/12.8,y:m.m42/7.2},uniformScale:scale,dataset:{...n.dataset},footprint:{left:Math.ceil((x-Math.min(...p.map(r=>r.left)))/factor/scale)+6,right:Math.ceil((Math.max(...p.map(r=>r.right))-x)/factor/scale)+6,top:Math.ceil((y-Math.min(...p.map(r=>r.top)))/factor/scale)+6,bottom:Math.ceil((Math.max(...p.map(r=>r.bottom))-y)/factor/scale)+6}};});})()`);
}
async function savePreview(name) {
  if (!process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR) return;
  const directory = process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR; fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name + '-geometry.json'), JSON.stringify({sessions:snapshot.sessions,rows:await readGeometry()},null,2));
  fs.writeFileSync(path.join(directory, name + '.png'), (await bounded(win.webContents.capturePage(), 'preview capture', 4000)).toPNG());
}
const guard = setTimeout(() => { console.error('Walking crowd fixture timed out at ' + stage); app.exit(1); }, 240000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => action(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_, details) => errors.push('renderer gone: ' + details.reason));
  await bounded(win.loadFile(path.join(__dirname, '../renderer/index.html')), 'production page load');
  // A renderer must exist before awaiting this command. No observations yet.
  win.webContents.debugger.attach('1.3');
  await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }), 'motion media emulation');
  await run('(' + installAudit.toString() + ')()');
  const kinds = ['reading', 'planning', 'coding', 'testing', 'idle', 'unknown'];
  let cast = Array.from({ length: 8 }, (_, index) => task(index, kinds[index % kinds.length]));
  await begin('eight mixed real mains enter concurrently without hidden admitted bodies', cast);
  send(cast); await heartbeat(cast); await until(allSettled(8), 'eight bodies must make finite entrance progress');
  const eight = await finish({ minimumScale: .5, parallel: true });
  for (const session of cast) assert.ok(eight.distinctFootPositions[session.id] >= 8, 'every main body must actually walk from the door');
  await savePreview('eight-settled');

  const changed = cast.slice(0, 4).map((session, index) => ({ ...session, activity: kinds[(index + 1) % 4], lastEventAt: Date.now() }));
  cast = cast.map(session => changed.find(next => next.id === session.id) || session);
  const beforeSwap = await run('crowdArrivals.length');
  await begin('eight mixed functions change physical furniture zones with bounded real traffic', cast);
  send(cast); await heartbeat(cast);
  await until(`crowdArrivals.slice(${beforeSwap}).filter(event=>event.kind==='station').some(event=>event.id===${JSON.stringify(changed[0].id)})`, 'a real stable functional change must move its original body');
  await until(allSettled(8), 'functional swaps must finish in finite time');
  const swapArrivals = await run(`crowdArrivals.slice(${beforeSwap})`);
  for (const session of changed) assert.ok(swapArrivals.some(event => event.id === session.id && event.kind === 'station'), 'each changed real function must expose actual arrival: ' + session.id);
  await finish({ minimumScale: .5 });

  // Choose a positive-evidence yielding departure from the actual current
  // full rectangles. This pure probe does not alter app state or its Traffic.
  const yielding = await run(`(()=>{const S=OfficeScene,L=OfficeWalkingLayout,T=OfficeSceneTraffic,world=document.getElementById('world').getBoundingClientRect(),factor=world.width/1280;const rows=[...document.querySelectorAll('.actor[data-session-id]')].map(node=>{const m=new DOMMatrixReadOnly(getComputedStyle(node).transform),scale=Math.hypot(m.m11,m.m12),parts=[node.querySelector('.character-body'),node.querySelector('.nameplate')].map(p=>p.getBoundingClientRect()),x=world.left+m.m41*factor,y=world.top+m.m42*factor;return{id:node.dataset.sessionId,position:{x:m.m41/12.8,y:m.m42/7.2},uniformScale:scale,canYield:true,footprint:{left:Math.ceil((x-Math.min(...parts.map(r=>r.left)))/factor/scale)+6,right:Math.ceil((Math.max(...parts.map(r=>r.right))-x)/factor/scale)+6,top:Math.ceil((y-Math.min(...parts.map(r=>r.top)))/factor/scale)+6,bottom:Math.ceil((Math.max(...parts.map(r=>r.bottom))-y)/factor/scale)+6}}});for(const row of rows){const traffic=T.createCoordinator({gap:L.gapForScale,legalPoint:L.legalPoint,route:L.route,reservedRects:S.CLOCK_RESERVED,holdingPoints:L.HOLDING_CANDIDATES});traffic.sync(rows);traffic.request(row.id,L.ENTRY_POINT);const move=traffic.nextAny();if(move.kind==='move'&&move.yielding&&move.id!==row.id)return{departing:row.id,yielding:move.id};}return null;})()`);
  assert.ok(yielding, 'the natural eight-body fixture must contain a positively evidenced real yielding route');
  const removed = cast.find(session => session.id === yielding.departing);
  await begin('a real main departure makes another real body yield and return finitely', cast, [removed.id]);
  send(cast.filter(session => session.id !== removed.id));
  await until(`!document.querySelector('.actor[data-session-id="${removed.id}"]')&&${allSettled(7)}`, 'the real departure and its physical yielder must both finish');
  await finish({ yieldRequired: true });
  await run(`crowdAudit.forget(${JSON.stringify(removed.id)})`);
  cast = cast.map(session => session.id === removed.id ? { ...session, lastEventAt: Date.now(), turnId: 'reentered-after-real-exit' } : session);
  await begin('the genuinely departed main reenters through the door without cutting retained bodies', cast);
  send(cast); await until(allSettled(8), 'the observed main must physically reenter after its genuine departure');
  await finish({ minimumScale: .5 });

  // Preserve the twelve-zone multiset. A real helper adds the main-origin
  // split/return case while eleven independent mains remain on the same plane.
  const main = cast.find(session => session.id === task(0).id);
  const helper = task(8, 'coding', main.id);
  cast = cast.concat([helper, task(9, 'testing'), task(10, 'idle'), task(11, 'unknown')]);
  await begin('twelve mixed bodies include a true main-origin clone and parallel independent arrivals', cast);
  send(cast); await heartbeat(cast); await until(allSettled(12), 'all twelve authoritative bodies must enter without a hidden tail');
  await finish({ minimumScale: .4, parallel: true }); await savePreview('twelve-settled');

  const otherReading = cast.find(session => session.id !== main.id && session.activity === 'reading' && !session.parentId);
  const otherPlanning = cast.find(session => session.id !== main.id && session.activity === 'planning' && !session.parentId);
  assert.ok(otherReading && otherPlanning);
  const ended = { ...helper, status: 'closed', closed: true, activity: 'idle', activeTools: 0, lastEventAt: Date.now() };
  cast = cast.map(session => session.id === helper.id ? ended : session.id === otherReading.id ? { ...session, activity: 'planning', lastEventAt: Date.now() } : session.id === otherPlanning.id ? { ...session, activity: 'reading', lastEventAt: Date.now() } : session);
  const dockStart = await run('crowdArrivals.length');
  await begin('the actual parent dock stays fixed while a returning clone and independent functional traffic compete', cast, [helper.id]);
  send(cast); await heartbeat(cast);
  await until(`(()=>{const events=crowdArrivals.slice(${dockStart});return ${JSON.stringify([otherReading.id, otherPlanning.id])}.every(id=>events.some(event=>event.id===id&&event.kind==='station'))})()`, 'both independently changed real functions must actually reach their new areas');
  await until(`!document.querySelector('.actor[data-session-id="${helper.id}"]')&&${allSettled(11)}`, 'true clone return/merge and other functional changes must all complete');
  await finish({ minimumScale: .4, dock: true });
  assert.ok(await run(`crowdArrivals.some(event=>event.id===${JSON.stringify(helper.id)}&&event.kind==='return')`));
  assert.deepEqual(errors, []);
  const result = { ok: true, scope: '8-and-12-real-bodies', checks, errors };
  if (process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR) fs.writeFileSync(path.join(process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}).catch(async error => {
  console.error(error); process.exitCode = 1;
  if (win && !win.isDestroyed()) try {
    const audit = await run('window.crowdAudit?.report()');
    const rows = await readGeometry();    if (process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR) {fs.mkdirSync(process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_WALKING_CROWD_PREVIEW_DIR, 'failure.json'), JSON.stringify({ stage, error: error.stack, audit, rows, sessions:snapshot.sessions, checks, errors }, null, 2));}
    await savePreview('failure');
  } catch (captureError) { console.error(captureError); }
}).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
