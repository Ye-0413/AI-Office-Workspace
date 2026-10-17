'use strict';
// Real production DOM/WAAPI traffic; isolated observations and userData only.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-walking-fit-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win, stage = 'startup';
let settings = { language: 'zh', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: false, sceneVenue: 'workshop', sceneTheme: 'spring', sceneWeather: 'off' };
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
let pushes = 0;
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
  pushes += 1;
  snapshot = { ...snapshot, sessions, now: Date.now() };
  win.webContents.send('office:snapshot', snapshot);
}

// This observer reads the original actor nodes, their actual transforms, full
// body/nameplate rectangles and the original route Animation's future vertices.
// It neither replaces animation APIs nor advances synthetic animation clocks.
function installAudit() {
  const identities = new Map(), routeCache = new WeakMap();
  window.crowdArrivals = []; window.crowdActors=new Map();
  document.getElementById('office').addEventListener('office:actor-arrival', event => {
    const { actorId, zone, kind, serial, position } = event.detail; crowdActors.set(actorId,event.detail.actor);
    crowdArrivals.push({ id: actorId, zone, kind, serial, position, at: performance.now() });
  });
  const intersection = (a, b, tolerance = .7) => a.left < b.right - tolerance && b.left < a.right - tolerance && a.top < b.bottom - tolerance && b.top < a.bottom - tolerance;
  const foot = node => { const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform); return { x: matrix.m41, y: matrix.m42, scale: Math.hypot(matrix.m11, matrix.m12) }; };
  const endpoint = (child, parent) => {
    const phase = child.node.dataset.clonePhase;
    if (!['splitting', 'returning', 'absorbing'].includes(phase)) return child.node.dataset.endpointOverlap === parent.id;
    if (![child.node.dataset.cloneOrigin, child.node.dataset.cloneTarget].includes(parent.id)) return false;
    if ((child.node.dataset.cloneCharge === 'true' || phase === 'absorbing') && Math.hypot(child.x - parent.x, child.y - parent.y) < .75) return true;
    const route = originalRoute(child);
    if (!route || route.points.length < 2 || route.progress === null) return false;
    const points = route.points;
    return phase === 'splitting' && Math.hypot(points[0].x - parent.x, points[0].y - parent.y) < .75 && route.progress <= points[1].offset + .0001
      || phase === 'returning' && Math.hypot(points.at(-1).x - parent.x, points.at(-1).y - parent.y) < .75 && route.progress >= points.at(-2).offset - .0001;
  };
  let state = null, frame = 0;
  function fail(message) { if (state.violations.length < 20 && !state.violations.includes(message)) state.violations.push(message); }
  function originalRoute(row) {
    const motion = row.node.getAnimations().find(animation => { const keys = animation.effect?.getKeyframes() || []; return animation.constructor.name === 'Animation' && animation.effect?.target === row.node && keys.length >= 2 && keys.every(key => typeof key.transform === 'string'); });
    if (!motion) return null;
    let points = routeCache.get(motion);
    if (!points) {
      points = motion.effect.getKeyframes().map(key => { const m = new DOMMatrixReadOnly(key.transform); return { x: m.m41, y: m.m42, offset: key.computedOffset }; });
      routeCache.set(motion, points);
    }
    return { points, progress: motion.effect.getComputedTiming().progress };
  }
  function remainingRoute(row) {
    const route = originalRoute(row);
    if (!route) return null;
    const { points, progress } = route;
    if (progress === null) return null;
    const future = [{ x: row.x, y: row.y }, ...points.filter(point => point.offset > progress + .00001)];
    const extents = { left: row.x - row.worldBox.left, right: row.worldBox.right - row.x, top: row.y - row.worldBox.top, bottom: row.worldBox.bottom - row.y };
    return future.slice(1).map((point, index) => ({
      left: Math.min(point.x, future[index].x) - extents.left,
      right: Math.max(point.x, future[index].x) + extents.right,
      top: Math.min(point.y, future[index].y) - extents.top,
      bottom: Math.max(point.y, future[index].y) + extents.bottom
    }));
  }
  function tick(now) {
    if (!state) return;
    state.frames += 1;
    const nodes = [...document.querySelectorAll('.actor[data-session-id]')];
    const office = document.getElementById('office'), world = document.getElementById('world').getBoundingClientRect();
    const factor = world.width / 1280, clock = document.getElementById('day-clock').getBoundingClientRect();
    const visible = [];
    for (const node of nodes) {
      const id = node.dataset.sessionId, style = getComputedStyle(node), alpha = Number(style.opacity);
      const admitted = style.visibility !== 'hidden' && style.display !== 'none';
      const known = identities.get(id);
      if (known) {
        if (node !== known.node || node.querySelector('.character-body') !== known.body || node.querySelector('.character-body>img') !== known.image) fail('body identity replaced: ' + id);
        if (!admitted) fail('admitted body hidden: ' + id);
        if (alpha < .99 && !['absorb', 'restore'].includes(node.dataset.bodyFade)) fail('unowned body opacity: ' + id + ':' + alpha);
      }
      if (!admitted) continue;
      const point = foot(node), parts = [node.querySelector('.character-body'), node.querySelector('.nameplate')].map(part => part.getBoundingClientRect());
      const box = { left: Math.min(...parts.map(rect => rect.left)), right: Math.max(...parts.map(rect => rect.right)), top: Math.min(...parts.map(rect => rect.top)), bottom: Math.max(...parts.map(rect => rect.bottom)) };
      const row = { id, node, ...point, ...box, worldBox: { left: (box.left - world.left) / factor, right: (box.right - world.left) / factor, top: (box.top - world.top) / factor, bottom: (box.bottom - world.top) / factor } };
      const actualRoute = originalRoute(row);
      if (actualRoute && actualRoute.progress !== null && node.dataset.walking !== 'true') fail('a real route lost its walking/gait owner: ' + id);
      if (!known) identities.set(id, { node, body: node.querySelector('.character-body'), image: node.querySelector('.character-body>img') });
      const old = state.previous.get(id);
      if (old && Math.hypot(point.x - old.x, point.y - old.y) > 400 * (now - old.at) / 1000 + 4) fail('foot jump: ' + id);
      state.previous.set(id, { ...point, at: now });
      const positions = state.positions.get(id) || new Set(); positions.add(point.x.toFixed(2) + '/' + point.y.toFixed(2)); state.positions.set(id, positions);
      if (old && Math.hypot(point.x - old.x, point.y - old.y) > .05) state.lastProgressAt = now;
      if (getComputedStyle(node).zIndex !== '10') fail('unequal actor layer: ' + id);
      if (box.left < -.8 || box.right > innerWidth + .8 || box.top < -.8 || box.bottom > innerHeight + .8) fail('body/nameplate outside viewport: ' + id);
      if (intersection(box, clock)) fail('body/nameplate covers clock: ' + id);
      if (OfficeScene.OBSTACLES.some(obstacle => OfficeScene.segmentHitsRect({ x: point.x / 12.8, y: point.y / 7.2 }, { x: point.x / 12.8, y: point.y / 7.2 }, obstacle, .79))) fail('real feet inside furniture: ' + id);
      state.minScale = Math.min(state.minScale, point.scale); state.lastScale = point.scale;
      if (node.dataset.walking === 'true' && node.dataset.trafficHint === 'yielding') { state.yieldingFrames += 1; state.yielded.add(id); }
      visible.push(row);
    }
    for (const [id] of identities) if (!nodes.some(node => node.dataset.sessionId === id) && !state.allowedRemoved.has(id)) fail('admitted identity removed: ' + id);
    for (let i = 0; i < visible.length; i += 1) for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i], b = visible[j];
      if (Math.abs(a.scale - b.scale) > .00002) fail('unequal scale: ' + a.id + '/' + b.id);
      if (!endpoint(a, b) && !endpoint(b, a) && intersection(a, b)) fail('body/nameplate overlap: ' + a.id + '/' + b.id);
    }
    const docked = new Set();
    for (const child of visible) if (child.node.dataset.cloneCharge === 'true' || ['returning', 'absorbing'].includes(child.node.dataset.clonePhase)) {
      const parentId = child.node.dataset.cloneTarget || child.node.dataset.cloneOrigin, parent = visible.find(row => row.id === parentId);
      if (!parent) continue;
      docked.add(parentId); state.dockedFrames += 1;
      const previous = state.dockFeet.get(parentId);
      if (previous && Math.hypot(parent.x - previous.x, parent.y - previous.y) > .75) fail('traffic stole a locked actual parent dock: ' + parentId);
      if (parent.node.dataset.walking === 'true') fail('locked actual parent dock was forced to walk: ' + parentId);
      state.dockFeet.set(parentId, { x: parent.x, y: parent.y });
    }
    for (const id of state.dockFeet.keys()) if (!docked.has(id)) state.dockFeet.delete(id);
    const moving = visible.filter(row => row.node.dataset.walking === 'true');
    state.maxMoving = Math.max(state.maxMoving, moving.length);
    if (moving.length > 4) fail('more than four physical route owners');
    if (moving.length >= 2) {
      state.parallelFrames += 1;
      const routes = moving.map(row => ({ id: row.id, corridor: remainingRoute(row) }));
      for (let i = 0; i < routes.length; i += 1) for (let j = i + 1; j < routes.length; j += 1) {
        const a = routes[i], b = routes[j];
        if (!a.corridor || !b.corridor) { fail('a moving body has no original route Animation'); continue; }
        state.corridorPairsChecked += 1;
        if (a.corridor.some(left => b.corridor.some(right => intersection(left, right, 1)))) fail('parallel future body/nameplate corridors intersect: ' + a.id + '/' + b.id);
      }
    }
    const queued = Number(office.dataset.entranceQueue) || 0;
    state.maxVisible = Math.max(state.maxVisible, visible.length);
    if (visible.length > state.previousVisible || crowdArrivals.length > state.previousArrivals) state.lastProgressAt = now;
    state.previousVisible = visible.length; state.previousArrivals = crowdArrivals.length;
    if (now - state.startedAt > 500) {
      if (visible.length + queued !== nodes.length) fail('entrance queue does not account for every real identity');
      if (state.expected.some(id => !nodes.some(node => node.dataset.sessionId === id) && !state.allowedRemoved.has(id))) fail('authoritative identity is missing from DOM');
    }
    const unfinished = queued > 0 || nodes.some(node => node.dataset.walking === 'true' || ['queued', 'waiting-space', 'yielding'].includes(node.dataset.traffic));
    if (unfinished) {
      const gap = now - state.lastProgressAt; state.maxProgressGapMs = Math.max(state.maxProgressGapMs, gap);
      if (gap > 12000) fail('no finite physical/arrival progress for twelve seconds');
    }
    frame = requestAnimationFrame(tick);
  }
  function report() {
    if (!state) return null;
    return { name: state.name, frames: state.frames, maxMoving: state.maxMoving, parallelFrames: state.parallelFrames, corridorPairsChecked: state.corridorPairsChecked, maxVisible: state.maxVisible, minScale: state.minScale, lastScale: state.lastScale, maxProgressGapMs: state.maxProgressGapMs, yieldingFrames: state.yieldingFrames, yieldedIds: [...state.yielded], dockedFrames: state.dockedFrames, distinctFootPositions: Object.fromEntries([...state.positions].map(([id, values]) => [id, values.size])), violations: state.violations };
  }
  window.crowdAudit = {
    begin(name, expected, allowedRemoved = []) {
      if (frame) cancelAnimationFrame(frame);
      const now = performance.now();
      state = { name, expected, allowedRemoved: new Set(allowedRemoved), frames: 0, startedAt: now, lastProgressAt: now, previous: new Map(), positions: new Map(), dockFeet: new Map(), violations: [], yielded: new Set(), yieldingFrames: 0, dockedFrames: 0, maxMoving: 0, parallelFrames: 0, corridorPairsChecked: 0, maxVisible: 0, previousVisible: 0, previousArrivals: crowdArrivals.length, minScale: Infinity, lastScale: 0, maxProgressGapMs: 0 };
      frame = requestAnimationFrame(tick);
    },
    report,
    finish() { if (frame) cancelAnimationFrame(frame); frame = 0; const value = report(); state = null; return value; },
    forget(id) { identities.delete(id); }
  };
}

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
  return run(`(()=>{const w=document.getElementById('world').getBoundingClientRect(),factor=w.width/1280;return [...document.querySelectorAll('.actor')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),scale=Math.hypot(m.m11,m.m12),p=[n.querySelector('.character-body'),n.querySelector('.nameplate')].map(p=>p.getBoundingClientRect()),x=w.left+m.m41*factor,y=w.top+m.m42*factor;const a=crowdActors.get(n.dataset.sessionId);return{id:n.dataset.sessionId,target:a?.target,pendingStation:a?.pendingStation,navigation:a?.navigation,position:{x:m.m41/12.8,y:m.m42/7.2},uniformScale:scale,dataset:{...n.dataset},footprint:{left:Math.ceil((x-Math.min(...p.map(r=>r.left)))/factor/scale)+6,right:Math.ceil((Math.max(...p.map(r=>r.right))-x)/factor/scale)+6,top:Math.ceil((y-Math.min(...p.map(r=>r.top)))/factor/scale)+6,bottom:Math.ceil((Math.max(...p.map(r=>r.bottom))-y)/factor/scale)+6}};});})()`);
}
async function savePreview(name) {
  if (!process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR) return;
  const directory = process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR; fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name + '-geometry.json'), JSON.stringify({sessions:snapshot.sessions,rows:await readGeometry()},null,2));
  fs.writeFileSync(path.join(directory, name + '.png'), (await bounded(win.webContents.capturePage(), 'preview capture', 4000)).toPNG());
}
const guard = setTimeout(() => { console.error('Walking fit recovery fixture timed out at ' + stage); app.exit(1); }, 240000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => action(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_, details) => errors.push('renderer gone: ' + details.reason));
  await bounded(win.loadFile(path.join(__dirname, '../renderer/index.html')), 'production page load');
  win.webContents.debugger.attach('1.3');
  await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }), 'motion media emulation');
  await run('(' + installAudit.toString() + ')()');
  const kinds = ['reading', 'planning', 'coding', 'testing', 'idle', 'unknown'];
  const twelve = Array.from({ length: 12 }, (_, index) => task(index, kinds[index % kinds.length]));
  await begin('twelve original bodies settle at the shared dense fit', twelve);
  send(twelve); await heartbeat(twelve); await until(allSettled(12), 'all twelve real mains must enter');
  await finish({ minimumScale: .4, parallel: true });
  const keep = new Set([0, 1, 6, 7]), survivors = twelve.filter((_, index) => keep.has(index));
  const removed = twelve.filter((_, index) => !keep.has(index)).map(session => session.id);
  await begin('real twelve-to-four departures restore the proved large fit without another snapshot', survivors, removed);
  send(survivors); const removalPush = pushes;
  const largeFit = `${allSettled(4)}&&[...document.querySelectorAll('.actor')].every(n=>Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12)>=.9)`;
  const fitEndpoint = `${largeFit}&&[...document.querySelectorAll('.actor')].every(node=>node.getAnimations().every(motion=>!(motion instanceof CSSTransition&&motion.transitionProperty==='transform'&&(motion.playState==='running'||motion.pending)))&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m11-new DOMMatrixReadOnly(node.style.transform).m11)<.00001)`;
  async function captureFitTail() {
    await until(fitEndpoint, 'all actual body fit transitions must finish before the largest envelopes are accepted');
    const endpointFrame = await run('crowdAudit.report().frames');
    await until(`crowdAudit.report().frames>=${endpointFrame+31}&&${fitEndpoint}`, 'keep auditing at least thirty-one real frames after the completed fit endpoint');
  }
  await until(largeFit, 'real endpoints and released slots must grow the four retained original bodies', 90000);
  await captureFitTail();
  const released = await finish(); assert.ok(released.lastScale >= .9); assert.equal(pushes, removalPush, 'a later observer push must not rescue a missing physical-endpoint refresh');
  await run(`${JSON.stringify(removed)}.forEach(id=>crowdAudit.forget(id))`);
  await savePreview('four-restored-after-real-departures');
  await begin('the four original bodies respect a deliberate sixty-five-percent fit', survivors);
  await run(`(()=>{const control=document.getElementById('setting-agentScale');control.value='65';control.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`crowdAudit.report().frames>=31&&${allSettled(4)}&&[...document.querySelectorAll('.actor')].every(n=>Math.abs(Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12)-.65)<.00002)`, 'the genuine size setting must physically settle at sixty-five percent');
  await finish();
  await begin('a larger size request completes its actual walks then grows from physical endpoints alone', survivors);
  const resizePush = pushes;
  await run(`(()=>{const control=document.getElementById('setting-agentScale');control.value='135';control.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(largeFit, 'a proved large target must restore after all actual repositioning endpoints', 70000);
  await captureFitTail();
  const grown = await finish(); assert.ok(grown.lastScale >= .9); assert.equal(pushes, resizePush, 'size restoration must not depend on any fresh observer snapshot');
  await savePreview('four-restored-after-size-repositioning');
  assert.deepEqual(errors, []); console.log(JSON.stringify({ok:true,scope:'real-endpoint-and-slot-fit-recovery',checks,pushes,errors}));
}).catch(async error => {
  console.error(error); process.exitCode = 1;
  if (win && !win.isDestroyed()) try {
    const audit = await run('window.crowdAudit?.report()');
    const rows = await readGeometry();    if (process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR) {fs.mkdirSync(process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR, 'failure.json'), JSON.stringify({ stage, error: error.stack, audit, rows, sessions:snapshot.sessions, checks, errors }, null, 2));}
    await savePreview('failure');
  } catch (captureError) { console.error(captureError); }
}).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
