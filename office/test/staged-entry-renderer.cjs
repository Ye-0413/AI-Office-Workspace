'use strict';
// Native production-page coverage for hidden entrance retargeting and a late
// stale observation. Synthetic snapshots only; never configures providers.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-stage-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win;
let settings = { language: 'zh', sceneTime: 'auto', agentScale: 1.35, idleVisitor: false, reducedMotion: false };
let snapshot = { mode: 'live', sessions: [], connections: [], now: Date.now() };
const errors = [], checks = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = (id, activity, patch = {}) => ({ id: 'codex:' + id, sessionId: id, provider: 'codex', title: id, projectPath: '/fixture/visibility', activity, status: 'active', activeTools: 1, lastEventAt: Date.now(), events: [], evidence: { source: 'hook', confidence: 'high' }, ...patch });
const run = source => win.webContents.executeJavaScript(source, true);
const visible = `[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.1)`;
const report = `(()=>{const nodes=${visible};return nodes.map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);const boxes=[...n.querySelectorAll('.character-body,.nameplate,.nameplate *')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect());return{id:n.dataset.sessionId,point:{x:m.m41/12.8,y:m.m42/7.2},walking:n.dataset.walking==='true',traffic:n.dataset.traffic,state:n.querySelector('.actor-state').textContent,left:Math.min(...boxes.map(r=>r.left)),right:Math.max(...boxes.map(r=>r.right)),top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))}})})()`;
function send(sessions) { snapshot = { ...snapshot, sessions, now: Date.now() }; win.webContents.send('office:snapshot', snapshot); }
async function until(source, message, ms = 18000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await run(source)) return; await pause(25); }
  throw new Error(message + ': ' + JSON.stringify(await run(report)));
}
async function startAudit(id) {
  await run(`window.stageAudit={running:true,frames:0,hits:[],first:null,sawWalk:false};function auditStage(){const rows=${report};stageAudit.frames++;for(let i=0;i<rows.length;i++)for(const b of rows.slice(i+1)){const a=rows[i];if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)stageAudit.hits.push([a.id,b.id])}const n=rows.find(n=>n.id===${JSON.stringify(id)});if(n){stageAudit.first||=n.point;stageAudit.sawWalk||=n.walking}if(stageAudit.running)requestAnimationFrame(auditStage)}requestAnimationFrame(auditStage);void 0`);
}
async function finishAudit() {
  const audit = await run('stageAudit.running=false;({...stageAudit})');
  assert.deepEqual(audit.hits, [], 'every visible body and full nameplate stays separated');
  assert.equal(audit.sawWalk, true, 'a late main really enters from the doorway');
  assert.ok(Math.hypot(audit.first.x - 87, (audit.first.y - 78) * .5625) < 2, 'the first visible body starts at the doorway');
  return audit.frames;
}
const guard = setTimeout(() => { console.error('Staged entrance fixture timed out'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  for (const [name, fn] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => fn(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); });
  await win.loadURL('about:blank');
  // Keep the real planner and routes; pause only its dispatch to make the
  // queued-target race deterministic, without relying on native IPC timing.
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Page.enable');
  await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    let api;
    window.fixtureHoldStage = false;
    window.fixtureRequests = []; window.fixtureCancels = []; window.fixtureStaged = [];
    Object.defineProperty(window, 'OfficeSceneTraffic', {
      configurable: true, get: () => api,
      set: value => { api = { ...value, createCoordinator: options => {
        const real = value.createCoordinator(options);
        return { ...real,
          sync: values => { window.fixtureStaged = values.filter(a => a.staged).map(a => a.id); return real.sync(values); },
          request: (id, target, options) => { window.fixtureRequests.push({ id, target }); return real.request(id, target, options); },
          cancel: (id, point) => { window.fixtureCancels.push(id); return real.cancel(id, point); },
          nextAny: () => window.fixtureHoldStage && window.fixtureStaged.includes('codex:r2') ? { kind: 'wait', reason: 'reserved' } : real.nextAny()
        };
      } }; }
    });
  })();` });

  snapshot = { ...snapshot, sessions: [task('r0', 'unknown'), task('r1', 'planning')] };
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await until(`${visible}.length===2&&${visible}.every(n=>n.dataset.walking!=='true')`, 'initial two roots must be settled');
  await run('fixtureHoldStage=true;void 0');
  await startAudit('codex:r2');
  send(snapshot.sessions.concat(task('r2', 'planning')));
  await until(`(()=>{const n=document.querySelector('.actor[data-session-id="codex:r2"]');return n&&getComputedStyle(n).visibility==='hidden'&&fixtureStaged.includes('codex:r2')&&fixtureRequests.some(r=>r.id==='codex:r2'&&r.target.zone==='board')})()`, 'the hidden newcomer must really queue its first board route');
  const beforeCancel = await run(`fixtureCancels.filter(id=>id==='codex:r2').length`);
  send(snapshot.sessions.map(session => session.id === 'codex:r2' ? task('r2', 'testing') : { ...session, lastEventAt: Date.now() }));
  await until(`fixtureRequests.some(r=>r.id==='codex:r2'&&r.target.zone==='bench')&&fixtureCancels.filter(id=>id==='codex:r2').length>${beforeCancel}`, 'a real pending request must cancel and requeue for the new activity');
  await run('fixtureHoldStage=false;void 0');
  send(snapshot.sessions);
  await until(`(()=>{const rows=${report},n=rows.find(n=>n.id==='codex:r2');return rows.length===3&&rows.every(n=>!n.walking&&!['queued','yielding'].includes(n.traffic))&&n.point.x>=70&&n.point.x<=94&&n.point.y>=40.7&&n.point.y<=46.5&&/测试|测一测/.test(n.state)})()`, 'a staged target change must cancel the former board route and reach the real test bench');
  checks.push({ name: 'hidden entrance target changes cancel the old route and preserve a real doorway entrance', frames: await finishAudit() });

  // Empty first observation makes this a genuinely late arrival, rather than a
  // restored startup body. A stale source remains neutral but must be visible.
  settings = { ...settings, agentScale: 1 };
  snapshot = { ...snapshot, sessions: [] };
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await until(`document.getElementById('world')!==null&&document.querySelectorAll('.actor').length===0`, 'empty initial production page must load');
  await pause(100);
  await startAudit('codex:late-stale');
  send([task('late-stale', 'unknown', { status: 'stale', disconnected: true, activeTools: 0 })]);
  await until(`(()=>{const rows=${report},n=rows.find(n=>n.id==='codex:late-stale');return rows.length===1&&n&&!n.walking&&!['queued','yielding'].includes(n.traffic)&&n.state.includes('信号暂未更新')})()`, 'a late stale source must not remain hidden in a stage loop');
  checks.push({ name: 'late stale main enters visibly without claiming current work', frames: await finishAudit() });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
