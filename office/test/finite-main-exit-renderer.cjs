'use strict';
// Actual production bodies, isolated observations, no provider configuration.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { installAudit } = require('./support/walking-native-audit.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-finite-exit-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win, stage = 'startup';
let settings = { language: 'zh', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: false, sceneVenue: 'workshop', sceneTheme: 'spring', sceneWeather: 'off' };
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
const errors = [], checks = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = (id, activity, parentId) => ({ id: 'codex:exit-' + id, sessionId: 'exit-' + id, provider: 'codex', parentId, status: 'active', activity, activeTools: ['idle', 'unknown'].includes(activity) ? 0 : 1, lastEventAt: Date.now(), projectPath: '/fixture/finite-exit', events: [], evidence: { source: 'hook', confidence: 'explicit' } });
function bounded(promise, label, ms = 20000) { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]).finally(() => clearTimeout(timer)); }
const run = code => bounded(win.webContents.executeJavaScript(code, true), stage + ' evaluation');
const selector = id => `document.querySelector('.actor[data-session-id="${id}"]')`;
function send(sessions) { snapshot = { ...snapshot, sessions, now: Date.now() }; win.webContents.send('office:snapshot', snapshot); }
const settled = count => `(()=>{const nodes=[...document.querySelectorAll('.actor')];return nodes.length===${count}&&Number(document.getElementById('office').dataset.entranceQueue)===0&&nodes.every(n=>{const a=crowdActors.get(n.dataset.sessionId);return a&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.walking!=='true'&&n.dataset.traffic==='arrived'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase)&&!a.motion&&!a.routeReservation&&!a.navigation&&!a.resumeNavigation&&!a.pendingStation&&!a.yielding&&(a.holdingFamily||Math.abs(a.position.x-a.target.x)<.001&&Math.abs(a.position.y-a.target.y)<.001)})})()`;
async function until(code, label, ms = 90000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const report = await run('crowdAudit.report()'); if (report) assert.deepEqual(report.violations, [], label + ': ' + JSON.stringify(report));
    if (await run(code)) return;
    await wait(40);
  }
  throw Error(label + ': ' + JSON.stringify(await run(`({audit:crowdAudit.report(),rows:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,data:{...n.dataset},foot:getComputedStyle(n).transform,state:n.querySelector('.actor-state').textContent}))})`)));
}
async function begin(name, sessions, removed = []) { stage = name; console.log('[finite-main-exit]', name); await run(`crowdAudit.begin(${JSON.stringify(name)},${JSON.stringify(sessions.map(s => s.id))},${JSON.stringify(removed)})`); }
async function finish() {
  await until('crowdAudit.report().frames>=31', 'sample thirty-one actual rendered frames');
  const result = await run('crowdAudit.finish()'); assert.deepEqual(result.violations, []); checks.push(result);
}
async function language(value) {
  await run(`(()=>{if(document.documentElement.lang!==${JSON.stringify(value === 'en' ? 'en' : 'zh-CN')})document.getElementById('language-button').click();})()`);
  await until(`document.documentElement.lang===${JSON.stringify(value === 'en' ? 'en' : 'zh-CN')}`, 'the actual language button must apply the requested language');
}
const guard = setTimeout(() => { console.error('Finite exit fixture timed out: ' + stage); app.exit(1); }, 360000);
app.whenReady().then(async () => {
  for (const [name, handler] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => handler(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_, details) => errors.push('renderer gone: ' + details.reason));
  await bounded(win.loadFile(path.join(__dirname, '../renderer/index.html')), 'production page load');
  win.webContents.debugger.attach('1.3'); await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }), 'ordinary motion media');
  await run('(' + installAudit.toString() + ')()');
  const kinds = ['reading', 'planning', 'coding', 'testing', 'idle', 'unknown'];
  let twelve = Array.from({ length: 12 }, (_, index) => task(String(index).padStart(2, '0'), kinds[index % kinds.length]));
  await begin('twelve real bodies reach their actual stations', twelve); send(twelve); await until(settled(12), 'all twelve admitted original bodies must physically settle'); await finish();
  await run(`window.exitOriginals=new Map([...document.querySelectorAll('.actor')].map(n=>[n.dataset.sessionId,{node:n,rig:n.querySelector('.ap-rig')}]))`);
  // The two idle poses stay in the room: repeating an idle observation is
  // not evidence of fresh work that can revoke their retirement.
  const survivors = twelve.filter((_, index) => [0, 1, 4, 6, 7, 10].includes(index));
  await begin('fresh same-ID work revokes concurrent main exits on the original bodies', twelve);
  send(survivors);
  await until(`[...crowdActors.values()].some(a=>a.departing&&a.navigation?.kind==='exit'&&a.node.dataset.walking==='true')`, 'observe an actual original main exit before restoring work');
  twelve = twelve.map(s => ({ ...s, lastEventAt: Date.now() })); send(twelve);
  await until(settled(12), 'all twelve original identities must return to observed work after revocation');
  assert.equal(await run(`[...exitOriginals].every(([id,old])=>{const a=crowdActors.get(id);return a&&a.node===old.node&&a.node.querySelector('.ap-rig')===old.rig&&!a.departing&&!a.retireRequested&&!a.holdingFamily&&a.navigation?.kind!=='exit'&&a.resumeNavigation?.kind!=='exit'})`), true, 'old retirement owners may neither replace nor remove resumed bodies');
  await finish();

  await begin('language and size changes preserve finite exit owners until fresh real work', twelve);
  send(survivors); await until(`[...crowdActors.values()].some(a=>a.departing&&a.navigation?.kind==='exit'&&a.node.dataset.walking==='true')`, 'observe real exits before changing preferences');
  await language('en');
  await run(`(()=>{const n=document.getElementById('setting-agentScale');n.value='65';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  twelve = twelve.map(s => ({ ...s, lastEventAt: Date.now() })); send(twelve);
  await until(settled(12), 'preference-interrupted original bodies must resume authoritative work');
  assert.equal(await run(`[...exitOriginals].every(([id,old])=>{const a=crowdActors.get(id);return a&&a.node===old.node&&a.node.querySelector('.ap-rig')===old.rig&&!a.departing&&!a.retireRequested&&a.navigation?.kind!=='exit'&&a.resumeNavigation?.kind!=='exit'})`), true);
  await finish();

  const parent = twelve[2], others = twelve.filter(s => s.id !== parent.id), child = task('late-helper', 'planning', parent.id);
  await begin('a newly observed real child retains its same departing parent', twelve);
  send(others); await until(`(()=>{const a=crowdActors.get(${JSON.stringify(parent.id)});return a?.departing&&a.navigation?.kind==='exit'&&a.node.dataset.walking==='true'})()`, 'the named parent must already be actually walking out');
  send([...others, child]);
  await until(`(()=>{const a=crowdActors.get(${JSON.stringify(parent.id)}),n=${selector(child.id)};return a?.holdingFamily&&!a.departing&&a.navigation?.kind!=='exit'&&a.resumeNavigation?.kind!=='exit'&&n&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99})()`, 'the same parent must revoke exit and admit its actual child');
  await until(settled(13), 'the real child must physically reach its planning station while the absent parent remains');
  assert.equal(await run(`(()=>{const p=crowdActors.get(${JSON.stringify(parent.id)}),c=${selector(child.id)};return p.node===exitOriginals.get(p.id).node&&c.dataset.cloneOrigin===p.id&&p.node.dataset.cloneHold==='true'})()`), true);
  await language('zh');
  assert.equal(await run(`${selector(parent.id)}.querySelector('.actor-state').textContent`), '等分身归位');
  await finish();

  await begin('the child returns to its actual parent before that main exits', others, [child.id, parent.id]);
  send([...others, { ...child, status: 'closed', closed: true, activity: 'idle', activeTools: 0, lastEventAt: Date.now() }]);
  await until(`${selector(child.id)}?.dataset.clonePhase==='returning'`, 'closed child must begin its real physical return');
  assert.equal(await run(`${selector(parent.id)}===exitOriginals.get(${JSON.stringify(parent.id)}).node&&${selector(parent.id)}.dataset.cloneHold==='true'`), true);
  await until(settled(11), 'only the genuine child return and final parent door exit may release the two identities');
  const returns = await run(`crowdArrivals.filter(row=>row.id===${JSON.stringify(child.id)}&&row.kind==='return').length`);
  const exits = await run(`crowdArrivals.filter(row=>row.id===${JSON.stringify(parent.id)}&&row.kind==='exit').length`);
  assert.ok(returns >= 1 && exits >= 1, 'both physical endpoints must be observed before disappearance');
  await finish();
  await run(`${JSON.stringify([child.id, parent.id])}.forEach(id=>crowdAudit.forget(id))`);

  const closing = task('door-closing', 'coding'), arriving = task('door-arriving', 'reading');
  await begin('a real near-door exit releases an arriving main without hiding either body', [...others, closing], [closing.id]);
  send([...others, closing]);
  await until(`(()=>{const n=${selector(closing.id)};return n&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.walking==='true'})()`, 'observe the original closing body admitted at the door');
  const firstFoot = await run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(${selector(closing.id)}).transform);return{x:m.m41/12.8,y:m.m42/7.2}})()`);
  assert.ok(Math.hypot(firstFoot.x - 87, firstFoot.y - 78) < 4, 'handoff must interrupt an actual new door entrance, not an already parked main');
  send([...others, { ...closing, status: 'closed', closed: true, activeTools: 0, lastEventAt: Date.now() }, arriving]);
  await until(`(()=>{const n=${selector(arriving.id)};return n&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99})()`, 'the new real main must enter after the old physical door owner is released');
  const arrivingFoot = await run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(${selector(arriving.id)}).transform);return{x:m.m41/12.8,y:m.m42/7.2,origin:${selector(arriving.id)}.dataset.cloneOrigin||''}})()`);
  assert.ok(Math.hypot(arrivingFoot.x - 87, arrivingFoot.y - 78) < 4, 'the replacement main still starts at the real door');
  assert.equal(arrivingFoot.origin, '');
  await until(settled(12), 'the actual near-door close must not deadlock a queued future identity');
  assert.equal(await run(`!${selector(closing.id)}&&crowdArrivals.some(row=>row.id===${JSON.stringify(closing.id)}&&row.kind==='exit')&&crowdArrivals.some(row=>row.id===${JSON.stringify(arriving.id)}&&row.kind==='entry')`), true, 'real arrival endpoints, rather than model proof completion, release both handoff owners');
  await finish();
  assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, scope: 'finite-main-exit-interruption-and-real-descendant', checks, errors }));
}).catch(async error => {
  console.error(error); process.exitCode = 1;
  const directory = process.env.MINI_OFFICE_EXIT_PREVIEW_DIR;
  if (directory && win && !win.isDestroyed()) try {
    fs.mkdirSync(directory, { recursive: true });
    const report = await run(`({audit:window.crowdAudit?.report(),rows:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,data:{...n.dataset},foot:getComputedStyle(n).transform,state:n.querySelector('.actor-state').textContent}))})`);
    fs.writeFileSync(path.join(directory, 'failure.json'), JSON.stringify({ stage, error: error.stack, report, checks, errors }, null, 2));
    fs.writeFileSync(path.join(directory, 'failure.png'), (await bounded(win.webContents.capturePage(), 'failure capture', 3000)).toPNG());
  } catch (captureError) { console.error(captureError); }
}).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
