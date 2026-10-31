'use strict';
// Temporary diagnostic probe: crowd sizes, footprints and concurrency.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'office-size-probe-'))); app.disableHardwareAcceleration();
const mains = Number(process.env.PROBE_MAINS || 8), clones = Number(process.env.PROBE_CLONES || 3);
const settings = { language: 'en', agentScale: Number(process.env.PROBE_SCALE || 1), reducedMotion: false, lowPower: false, idleVisitor: false, sceneVenue: 'workshop', sceneTheme: 'spring', sceneWeather: 'off' };
const kinds = ['coding', 'planning', 'reading', 'testing', 'idle', 'unknown'];
const task = (id, activity, parentId) => ({ id: 'codex:' + id, sessionId: id, provider: 'codex', parentId, status: 'active', activity,
  activeTools: ['idle', 'unknown'].includes(activity) ? 0 : 1, lastEventAt: Date.now(), projectPath: '/fixture/probe', events: [], evidence: { source: 'hook', confidence: 'explicit' } });
const sessions = Array.from({ length: mains }, (_, i) => task('m' + i, kinds[i % 6]))
  .concat(Array.from({ length: clones }, (_, j) => task('c' + j, kinds[(j + 2) % 6], 'codex:m' + (j % mains))));
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('probe timeout'); app.exit(2); }, 120000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': () => settings, displays: () => [] })) ipcMain.handle('office:' + name, () => action());
  const errors = []; ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  const win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  const run = code => win.webContents.executeJavaScript(code, true);
  await run(`window.__maxWalking=0;(function tick(){const n=document.querySelectorAll('.actor[data-walking="true"]').length;if(n>window.__maxWalking)window.__maxWalking=n;requestAnimationFrame(tick)})()`);
  snapshot = { ...snapshot, sessions: sessions.filter(s => !s.parentId), now: Date.now() }; win.webContents.send('office:snapshot', snapshot);
  await pause(1500);
  snapshot = { ...snapshot, sessions, now: Date.now() }; win.webContents.send('office:snapshot', snapshot);
  const deadline = Date.now() + 60000; let settled = false;
  while (Date.now() < deadline) {
    await pause(500);
    settled = await run(`(()=>{const rows=[...document.querySelectorAll('.actor[data-session-id]')];return rows.length===${sessions.length}&&rows.every(n=>n.dataset.walking!=='true'&&n.dataset.traffic==='arrived'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase))})()`);
    if (settled) break;
  }
  const report = await run(`(()=>{const w=document.getElementById('world').getBoundingClientRect(),f=w.width/1280;const rows=[...document.querySelectorAll('.actor[data-session-id]')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),parts=[n.querySelector('.character-body'),n.querySelector('.nameplate')].map(p=>p.getBoundingClientRect());const x=w.left+m.m41*f,y=w.top+m.m42*f,s=Math.hypot(m.m11,m.m12);return{id:n.dataset.sessionId,helper:n.dataset.helper,scale:+s.toFixed(3),traffic:n.dataset.traffic,plateW:Math.round(parts[1].width/f/s),fpW:Math.round((Math.max(...parts.map(p=>p.right))-Math.min(...parts.map(p=>p.left)))/f/s),fpH:Math.round((Math.max(...parts.map(p=>p.bottom))-Math.min(...parts.map(p=>p.top)))/f/s)}});return{settled:${settled},fit:document.getElementById('office').dataset.fitScale,maxWalking:window.__maxWalking,rows}})()`);
  fs.writeFileSync('/tmp/size-probe.png', (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ...report, errors }, null, 1));
  app.exit(0);
});
