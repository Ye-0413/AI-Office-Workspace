'use strict';
// Run with Electron, not node: ./node_modules/.bin/electron test/renderer-smoke.cjs
// Isolated IPC fixtures exercise the actual sandboxed renderer and local artwork.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Scene = require('../lib/scene-model.js');
const Persona = require('../lib/agent-persona.js');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-renderer-'));
app.setPath('userData', dataDir);
app.disableHardwareAcceleration();
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let win;
let settings = { rain: false, night: false, reducedMotion: false, lowPower: false, sound: false, selectedProject: '' };
let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [], demo: { running: false, tick: 0 } };
const errors = [];
const checks = [];
const invokeCalls = [];
const task = (id, activity, patch = {}) => ({ id, provider: 'codex', sessionId: id, title: ({ a: '修复登录', b: '检查构建', c: '调整界面' })[id] || id, projectPath: '/fixture/office', projectName: 'Fixture Office', activity, status: 'active', lastEventAt: Date.now() - 60000, toolName: '', summary: 'native renderer fixture', evidence: { source: 'official-hook', rawEvent: 'PreToolUse', confidence: 'high' }, activeTools: 1, attention: false, disconnected: false, closed: false, events: [], ...patch });
const evaluate = source => win.webContents.executeJavaScript(source, true);
async function until(source, message, milliseconds = 24000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { if (await evaluate(source)) return; await wait(40); }
  throw new Error(message);
}
async function check(name, fn) { try { await fn(); checks.push(name); } catch(error) { error.message = name + ': ' + error.message; throw error; } }
async function assertSeparated(){const hits=await evaluate(`(()=>{const boxes=[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden').map(n=>{const a=n.querySelector('.character-body').getBoundingClientRect(),b=n.querySelector('.nameplate').getBoundingClientRect();return{id:n.dataset.sessionId,left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom)};});return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1).map(b=>[a.id,b.id]));})()`);assert.deepEqual(hits,[],'paged family bodies and nameplates must remain physically separate');}
async function capture(name) {
  if (!process.env.MINI_OFFICE_PREVIEW_DIR) return;
  fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
async function send(sessions, patch = {}) {
  snapshot = { ...snapshot, ...patch, sessions, now: Date.now() };
  win.webContents.send('office:snapshot', snapshot);
  await wait(100);
}
function bind(name, handler) { ipcMain.handle('office:' + name, (_event, ...args) => { invokeCalls.push({ name, args }); return handler(...args); }); }

app.whenReady().then(async () => {
  bind('snapshot', () => snapshot);
  bind('settings', () => settings);
  bind('setup-status', () => ({ running: false, rows: [], totals: { configured: 0, failed: 0, skipped: 0, pending: 0 } }));
  bind('set-settings', patch => { settings = { ...settings, ...patch }; return settings; });
  bind('connect', () => ({ ok: true, message: 'fixture only' }));
  bind('displays', () => [{ id: 1, label: 'Fixture display', width: 1280, height: 720, primary: true }]);
  bind('move-display', () => ({ id: 1 }));
  bind('open-source', () => ({ opened: true }));
  ipcMain.on('office:renderer-error', (_event, message) => errors.push(message));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('render-process-gone', (_event, details) => errors.push('renderer gone: ' + details.reason));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { errors.push('unexpected network request: ' + details.url); callback({ cancel: true }); });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await wait(250);
  await check('live starts as an unobstructed empty studio with configuration in the upper-right corner', async () => {
    const state = await evaluate(`(()=>{const office=document.getElementById('office'),button=document.getElementById('settings-button'),rect=button.getBoundingClientRect(),empty=document.getElementById('empty-state');return{mode:office.dataset.mode,quiet:office.dataset.quiet,actors:document.querySelectorAll('.actor').length,emptyAccessible:!empty.hidden,emptyScreenreader:empty.classList.contains('sr-only'),noCenterActions:!document.getElementById('empty-connect'),corner:rect.left>innerWidth*.8&&rect.top<80,footer:getComputedStyle(document.querySelector('.room-status')).display,room:document.getElementById('room-art').complete&&document.getElementById('room-art').naturalWidth>0,node:typeof require};})()`);
    assert.deepEqual(state, { mode: 'live', quiet: 'true', actors: 0, emptyAccessible: true, emptyScreenreader: true, noCenterActions: true, corner: true, footer: 'none', room: true, node: 'undefined' });
    await capture('empty-studio');
  });
  await check('historical idle sessions keep the studio empty and never display a central onboarding card', async () => {
    await send([task('history-idle', 'idle', {status:'idle',activeTools:0})]);
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 0);
    assert.equal(await evaluate(`document.getElementById('office').dataset.quiet`), 'true');
    assert.equal(await evaluate(`document.getElementById('page-empty').hidden`), true);
    await send([]);
  });
  await check('startup and automatic overview retain observed occupants across project rooms', async () => {
    const history = task('room-history', 'idle', { status: 'idle', activeTools: 0, projectPath: '/fixture/a-history', projectName: 'A History' });
    const busy = task('room-busy', 'waiting-user', { projectPath: '/fixture/z-busy', projectName: 'Z Busy', attention: true });
    snapshot = { ...snapshot, sessions: [history, busy] };
    win.reload();
    await wait(300);
    assert.equal(await evaluate(`document.getElementById('project-select').value`), Scene.ALL_ROOMS);
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="room-busy"]').length`), 1);
    await send([history]);
    await wait(300);
    await send([history, busy]);
    assert.equal(await evaluate(`document.getElementById('project-select').value`), Scene.ALL_ROOMS, 'an unfiltered office must not hide work in another project');
  });
  await check('old saved project filters cannot hide a current agent or return after reload', async () => {
    settings={...settings,selectedProject:'/fixture/a-history'};
    win.reload();await wait(350);
    assert.equal(await evaluate(`document.getElementById('project-select').value`),Scene.ALL_ROOMS);
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`),1);
    assert.equal(await evaluate(`document.getElementById('room-switcher').hidden`),true);
    await send([]);settings={...settings,selectedProject:''};win.reload();await wait(300);
  });
  await check('configuration panels open below their upper-right controls and fit both screen sizes and languages', async () => {
    for (const size of [[1280,720],[960,540]]) {
      win.setContentSize(...size);
      await wait(100);
      for (const lang of ['zh','en']) {
        if ((settings.language || 'zh') !== lang) { await evaluate(`document.getElementById('language-button').click()`); await wait(100); }
        for (const kind of ['connections','settings']) {
          await evaluate(`document.getElementById('${kind}-button').click()`);
          await wait(100);
          const bounds = await evaluate(`(()=>{const node=document.getElementById('${kind}-dialog'),r=node.getBoundingClientRect();return{open:node.open,right:innerWidth-r.right,top:r.top,bottom:r.bottom,height:innerHeight,left:r.left,scroll:node.scrollHeight>=node.clientHeight};})()`);
          assert.equal(bounds.open, true);
          assert.ok(bounds.right>=12 && bounds.right<=30, JSON.stringify(bounds));
          assert.ok(bounds.top>=55 && bounds.top<=90 && bounds.bottom<=bounds.height-10, JSON.stringify(bounds));
          assert.ok(bounds.left>size[0]*.45, JSON.stringify(bounds));
          if (size[0]===1280 && lang==='zh') await capture(kind+'-panel');
          await evaluate(`document.getElementById('${kind}-dialog').close()`);
        }
      }
    }
    win.setContentSize(1280,720);
    await evaluate(`document.getElementById('language-button').click()`);
    await wait(100);
  });
  await check('the synchronized tool catalog includes Hermes and searches before invoking the chosen connection', async () => {
    await evaluate(`document.getElementById('connections-button').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.provider-row').length`), 28);
    await evaluate(`document.getElementById('provider-search').value='hermes';document.getElementById('provider-search').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelectorAll('.provider-row').length`), 1);
    assert.equal(await evaluate(`document.querySelector('.provider-name').textContent`), 'Hermes Agent');
    await evaluate(`document.querySelector('.provider-row button').click()`);
    await wait(150);
    assert.ok(invokeCalls.some(call=>call.name==='connect'&&call.args[0]==='hermes'));
    await evaluate(`document.getElementById('provider-search').value='';document.getElementById('provider-search').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('connections-dialog').close()`);
  });

  await check('installed Hermes offers a bilingual reload action without removing the plugin', async () => {
    await send(snapshot.sessions,{connections:[{provider:'hermes',installed:true,watching:false}]});
    await evaluate(`document.getElementById('connections-button').click();document.getElementById('provider-search').value='hermes';document.getElementById('provider-search').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelector('.provider-actions button').textContent`),'重新加载');
    const before=invokeCalls.filter(call=>call.name==='connect').length;
    await evaluate(`document.querySelector('.provider-actions button').click()`);await wait(150);
    assert.equal(invokeCalls.filter(call=>call.name==='connect').length,before+1);assert.equal(invokeCalls.filter(call=>call.name==='connect').at(-1).args[0],'hermes');
    assert.equal(await evaluate(`document.querySelectorAll('.provider-actions button').length`),2);
    await evaluate(`document.getElementById('connections-dialog').close();document.getElementById('language-button').click()`);await wait(100);
    assert.equal(await evaluate(`document.querySelector('.provider-actions button').textContent`),'Reload plugin');
    await evaluate(`document.getElementById('language-button').click();document.getElementById('provider-search').value='';document.getElementById('provider-search').dispatchEvent(new Event('input',{bubbles:true}))`);await wait(100);
  });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{win?.destroy();fs.rmSync(dataDir,{recursive:true,force:true});app.exit(process.exitCode||0);});
