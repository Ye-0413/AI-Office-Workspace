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
  await check('a deliberate empty-room choice persists across snapshots and reload while other-room attention stays reachable', async () => {
    await evaluate(`document.getElementById('project-select').value='/fixture/a-history';document.getElementById('project-select').dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait(100);
    await send(snapshot.sessions);
    assert.equal(await evaluate(`document.getElementById('project-select').value`), '/fixture/a-history');
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 0);
    assert.equal(await evaluate(`document.getElementById('other-attention').hidden`), false);
    assert.equal(settings.selectedProject, '/fixture/a-history');
    win.reload();
    await wait(300);
    assert.equal(await evaluate(`document.getElementById('project-select').value`), '/fixture/a-history');
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 0);
    assert.equal(await evaluate(`document.getElementById('other-attention').hidden`), false);
    settings = { ...settings, selectedProject: '' };
    snapshot = { ...snapshot, sessions: [] };
    win.reload();
    await wait(300);
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

  let sessions = [task('a', 'reading'), task('b', 'building'), task('c', 'coding'), task('helper', 'planning', { parentId: 'a', subagentId: 'helper' })];
  await send(sessions);
  await wait(250);
  await check('independent same-provider sessions and a child render their original SVG assets', async () => {
    const state = await evaluate(`({actors:document.querySelectorAll('.actor').length,helpers:document.querySelectorAll('.actor[data-helper="true"]').length,images:[...document.querySelectorAll('.character-body img')].every(img=>img.complete&&img.naturalWidth>0),labels:[...document.querySelectorAll('.actor-title')].map(n=>n.textContent),empty:document.getElementById('empty-state').hidden})`);
    assert.equal(state.actors, 4); assert.equal(state.helpers, 1); assert.equal(state.images, true); assert.equal(state.empty, true);
    for (const session of sessions) assert.ok(state.labels.includes(Persona.forSession(session).aliasZh));
    assert.equal(state.labels.includes('修复登录'), false, 'Task descriptions must stay out of character names');
  });

  sessions = sessions.map(session => session.id === 'a' ? { ...session, activity: 'coding', lastEventAt: Date.now() } : session);
  await send(sessions);
  await until(`document.querySelector('.actor[data-session-id="a"]').dataset.walking==='true'`, 'the changed activity must acquire a safe walking reservation');
  await check('a changed activity starts an actual character route', async () => {
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="a"]').dataset.walking`), 'true');
  });
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'stale', disconnected: true } : session);
  await send(sessions);
  const stopped = await evaluate(`getComputedStyle(document.querySelector('.actor[data-session-id="a"]')).transform`);
  await wait(450);
  await check('loss of signal interrupts the route and retains the current place', async () => {
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.actor[data-session-id="a"]')).transform`), stopped);
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="a"] .actor-state').textContent`), '信号暂未更新');
    assert.equal(await evaluate(`document.getElementById('office').dataset.quiet`), 'false');
  });
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'active', disconnected: false, lastEventAt: Date.now() } : session);
  await send(sessions);
  await until(`document.querySelector('.actor[data-session-id="a"]').dataset.walking==='true'`, 'fresh evidence must resume a safe walking route');
  await check('fresh evidence resumes the same activity route after a signal interruption', async () => {
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="a"]').dataset.walking`), 'true');
  });

  await evaluate(`document.getElementById('settings-button').click();document.getElementById('setting-reducedMotion').click()`);
  await wait(120);
  await evaluate(`document.getElementById('settings-dialog').close()`);
  await check('a short tool burst cannot send a thinking actor along an obsolete route or restart its thinking animation', async () => {
    sessions = sessions.map(session => session.id === 'b' ? {...session,activity:'planning',activeTools:0,lastEventAt:Date.now()} : session);
    await send(sessions);
    await until(`(()=>{const n=document.querySelector('.actor[data-session-id="b"]');if(!n||n.dataset.walking==='true'||['queued','yielding','moving'].includes(n.dataset.traffic))return false;const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return OfficeScene.stationCompatible({x:m.m41/12.8,y:m.m42/7.2},'board');})()`,'the thinking baseline must finish its earlier bench-to-board route before testing a short tool burst');
    const initial = await evaluate(`(()=>{const actor=document.querySelector('.actor[data-session-id="b"]');return{transform:actor.style.transform,src:actor.querySelector('img').src,phase:actor.dataset.phase};})()`);
    assert.equal(initial.phase, 'planning/think');
    sessions = sessions.map(session => session.id === 'b' ? {...session,activity:'running',activeTools:1,lastEventAt:Date.now()} : session);
    await send(sessions);
    sessions = sessions.map(session => session.id === 'b' ? {...session,activity:'planning',activeTools:0,lastEventAt:Date.now()} : session);
    await send(sessions);
    await wait(1250);
    const after = await evaluate(`(()=>{const actor=document.querySelector('.actor[data-session-id="b"]');return{transform:actor.style.transform,src:actor.querySelector('img').src,phase:actor.dataset.phase};})()`);
    assert.deepEqual(after, initial);
    await evaluate(`window.thinkingFixtureNow=Date.now;Date.now=()=>window.thinkingFixtureNow()+32000;void(0)`);
    await send(sessions);
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="b"] img').src`), initial.src);
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="b"]').dataset.phase`), 'planning/think');
    await evaluate(`void(Date.now=window.thinkingFixtureNow)`);
    for (const activity of ['running','testing','building']) {
      sessions = sessions.map(session => session.id === 'b' ? {...session,activity,activeTools:1,lastEventAt:Date.now()} : session);
      await send(sessions);
      await wait(250);
    }
    await wait(200);
    assert.notEqual(await evaluate(`document.querySelector('.actor[data-session-id="b"]').style.transform`), initial.transform, 'changing tools at the same bench must not restart the destination timer');
  });
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'waiting', activity: 'waiting-user', attention: true, disconnected: false, lastEventAt: Date.now() } : session);
  await send(sessions);
  await check('explicit attention reaches the front and points to the native tool without approval controls', async () => {
    await evaluate(`document.querySelector('.actor[data-session-id="a"] .actor-button').click()`);
    const state = await evaluate(`({label:document.querySelector('.actor[data-session-id="a"] .actor-state').textContent,inspector:!document.getElementById('inspector').hidden,note:document.getElementById('inspect-action-note').textContent,source:document.getElementById('open-source').textContent,reduced:document.getElementById('office').dataset.reducedMotion})`);
    assert.equal(state.label, '等你回复'); assert.equal(state.inspector, true); assert.match(state.note, /Codex/); assert.match(state.source, /项目文件夹/); assert.equal(state.reduced, 'true');
    assert.equal(invokeCalls.some(call => /permission|approve|answer/.test(call.name)), false);
  });

  const completeAt = Date.now();
  await check('unchanged live snapshots advance expressive phases without inventing a task state change', async () => {
    const before = await evaluate(`document.querySelector('.actor[data-session-id="b"]').dataset.phase`);
    await evaluate(`(()=>{window.phaseFixtureNow=Date.now;Date.now=()=>window.phaseFixtureNow()+8500;return true})()`);
    await send(sessions);
    const after = await evaluate(`document.querySelector('.actor[data-session-id="b"]').dataset.phase`);
    assert.notEqual(after, before);
    assert.equal(sessions.find(session=>session.id==='b').activity, 'building');
    await evaluate(`void(Date.now=window.phaseFixtureNow)`);
  });
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'idle', activity: 'idle', attention: false, activeTools: 0, turnCompletedAt: completeAt } : session);
  await send(sessions);
  await wait(500);
  await send(sessions);
  await check('completed turn files one result and keeps the session in the room', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="a"]').length`), 1);
    assert.equal(await evaluate(`document.getElementById('archive-stack').dataset.count`), '1');
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="a"] .actor-state').textContent`), '这一轮已歇下');
    const position = await evaluate(`(()=>{const matrix=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.actor[data-session-id="a"]')).transform);return{x:matrix.m41/12.8,y:matrix.m42/7.2};})()`);
    assert.ok(Scene.ZONES.sofa.seats.some(([x,y])=>Math.abs(position.x-x)<.1&&Math.abs(position.y-y)<.1), 'a completed turn must reach the coffee area, not just change its label');
  });
  const originalName = await evaluate(`document.querySelector('.actor[data-session-id="a"] .actor-title').textContent`);
  sessions = sessions.map(session => session.id === 'helper' ? {...session, status:'closed', closed:true, activeTools:0} : session);
  await send(sessions);
  await wait(20500);
  await send(sessions);
  await check('confirmed idle actors leave through the visible door and return under the same task-ID nickname', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="a"]').length`), 0);
    assert.equal(await evaluate(`document.getElementById('studio-door').dataset.open`), 'true');
    sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'active', activity: 'coding', lastEventAt: Date.now(), turnCompletedAt: undefined } : session);
    await send(sessions);
    assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="a"] .actor-title').textContent`), originalName);
    assert.equal(await evaluate(`document.getElementById('studio-door').dataset.open`), 'true');
  });
  await evaluate(`document.getElementById('settings-button').click();document.getElementById('setting-reducedMotion').click();document.getElementById('settings-dialog').close()`);
  await wait(100);
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'closed', closed: true } : session);
  await send(sessions);
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'active', activity: 'coding', closed: false, lastEventAt: Date.now(), turnCompletedAt: undefined } : session);
  await send(sessions);
  await wait(250);
  await check('a new observed turn can interrupt a session departure', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="a"]').length`), 1);
    assert.doesNotMatch(await evaluate(`document.querySelector('.actor[data-session-id="a"] .actor-state').textContent`), /会话结束|收拾/);
  });
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'closed', closed: true } : session);
  await send(sessions);
  await evaluate(`document.getElementById('settings-button').click();document.getElementById('setting-reducedMotion').click();document.getElementById('settings-dialog').close()`);
  await wait(100);
  sessions = sessions.map(session => session.id === 'a' ? { ...session, status: 'closed', closed: true } : session);
  await send(sessions);
  await wait(350);
  await check('a closed session leaves even when reduced motion interrupts its departure', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="a"]').length`), 0);
    assert.ok(await evaluate(`document.querySelectorAll('.actor').length>=2`));
  });

  sessions = [task('parent', 'coding')];
  for (let index = 0; index < 7; index += 1) sessions.push(task('child:' + index, 'reading', { parentId: 'parent', subagentId: 'child:' + index }));
  sessions.push(task('other-room', 'waiting-user', { projectPath: '/fixture/website', projectName: 'Website', attention: true }));
  await send(sessions);
  await evaluate(`document.getElementById('project-select').value='/fixture/office';document.getElementById('project-select').dispatchEvent(new Event('change',{bubbles:true}))`);
  await check('overflow helpers are discoverable and selecting one gives it a physical place', async () => {
    await evaluate(`document.getElementById('roster-button').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.roster-row').length`), 8);
    await evaluate(`[...document.querySelectorAll('.roster-row')].find(row=>row.textContent.includes('child:6')).click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="child:6"]').length`), 1);
  });
  await check('attention in another project stays visible and navigates to the correct room', async () => {
    assert.equal(await evaluate(`document.getElementById('other-attention').hidden`), false);
    await evaluate(`document.getElementById('other-attention').click()`);
    assert.equal(await evaluate(`document.getElementById('inspect-title').textContent`), 'other-room');
    assert.equal(await evaluate(`document.getElementById('project-select').value`), '/fixture/website');
  });
  await check('English and Chinese switch all static controls and persist the chosen language without changing task content', async () => {
    await evaluate(`document.getElementById('language-button').click()`);
    await wait(100);
    assert.equal(await evaluate(`document.documentElement.lang`), 'en');
    assert.equal(await evaluate(`document.getElementById('connections-title').textContent`), 'Connect AI tools');
    assert.equal(await evaluate(`document.getElementById('inspect-title').textContent`), 'other-room');
    assert.equal(settings.language, 'en');
    await evaluate(`document.getElementById('language-button').click()`);
    await wait(100);
    assert.equal(await evaluate(`document.documentElement.lang`), 'zh-CN');
    assert.equal(await evaluate(`document.getElementById('connections-title').textContent`), '连接 AI 工具');
  });
  await check('native dialogs expose only real observation controls', async () => {
    await evaluate(`document.getElementById('connections-button').click()`);
    assert.equal(await evaluate(`document.getElementById('connections-dialog').open`), true);
    await evaluate(`document.getElementById('connections-dialog').close()`);
    assert.equal(await evaluate(`document.getElementById('mode-button')`), null);
    assert.equal(await evaluate(`typeof window.office.demoAction`), 'undefined');
    assert.equal(await evaluate(`document.getElementById('office').dataset.mode`), 'live');
  });
  await check('the final departing actor restores an empty studio without hiding another room that needs attention', async () => {
    await send([task('last-actor','coding')], {mode:'live'});
    await evaluate(`document.querySelector('.actor-button').click()`);
    assert.equal(await evaluate(`document.getElementById('inspector').hidden`), false);
    await send([task('last-actor','coding',{status:'closed',closed:true,activeTools:0})]);
    await wait(350);
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 0);
    assert.equal(await evaluate(`document.getElementById('office').dataset.quiet`), 'true');
    assert.equal(await evaluate(`document.getElementById('inspector').hidden`), true);
    await send([task('quiet-room','idle',{status:'idle',activeTools:0}),task('busy-room','waiting-user',{projectPath:'/fixture/other',attention:true})]);
    await evaluate(`document.getElementById('project-select').value='/fixture/office';document.getElementById('project-select').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelectorAll('.actor').length`), 0);
    assert.equal(await evaluate(`document.getElementById('office').dataset.quiet`), 'false');
    assert.equal(await evaluate(`document.getElementById('room-switcher').hidden`), false);
    assert.equal(await evaluate(`document.getElementById('other-attention').hidden`), false);
    assert.equal(await evaluate(`document.getElementById('page-empty').classList.contains('sr-only')`), true);
  });
  await check('selecting a nested helper on another page reveals its whole family page and the selected descendant', async () => {
    const family = Array.from({length:6},(_,index)=>task('family-root:'+index,'coding'));
    family.push(task('family-child','reading',{parentId:'family-root:5'}),task('family-grandchild','testing',{parentId:'family-child'}));
    await send(family);
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="family-grandchild"]').length`), 0);
    while(await evaluate(`!document.getElementById('page-prev').disabled`)){await evaluate(`document.getElementById('page-prev').click()`);await wait(80);}
    const [,pageCount]=await evaluate(`document.getElementById('page-label').textContent.match(/\\d+/g).map(Number)`),pages=[],seen=new Set();
    for(let index=0;index<pageCount;index++){
      const current=await evaluate(`[...document.querySelectorAll('.actor[data-helper="false"]')].map(n=>n.dataset.sessionId).sort()`);assert.ok(current.length>0);
      for(const id of current){assert.equal(seen.has(id),false,'a main family cannot occupy two pages');seen.add(id);}pages.push(current);await assertSeparated();
      if(index<pageCount-1){assert.equal(await evaluate(`document.getElementById('page-next').disabled`),false);await evaluate(`document.getElementById('page-next').click()`);await wait(80);}
    }
    assert.deepEqual([...seen].sort(),family.filter(session=>!session.parentId).map(session=>session.id).sort(),'adaptive pages expose all six independent roots exactly once');
    await evaluate(`document.getElementById('roster-button').click();[...document.querySelectorAll('.roster-row')].find(row=>row.textContent.includes('family-grandchild')).click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="family-root:5"]').length`), 1);
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="family-grandchild"]').length`), 1);
    assert.deepEqual((await evaluate(`document.getElementById('page-label').textContent.match(/\\d+/g).map(Number)`)).slice(0,2),[pages.findIndex(page=>page.includes('family-root:5'))+1,pageCount]);
    assert.equal(await evaluate(`document.getElementById('inspect-title').textContent`), 'family-grandchild');
    await assertSeparated();
  });
  await check('family colors, parent names, arrows and tree indentation remain visible with reduced motion', async () => {
    await until(`document.querySelectorAll('.helper-thread').length===2`, 'both safely materialized nested helpers must have their real ancestry links');
    const relation = await evaluate(`(()=>{const root=document.querySelector('.actor[data-session-id="family-root:5"]'),child=document.querySelector('.actor[data-session-id="family-child"]'),grand=document.querySelector('.actor[data-session-id="family-grandchild"]');return{root:root.querySelector('.actor-relation').textContent,child:child.querySelector('.actor-relation').textContent,grand:grand.querySelector('.actor-relation').textContent,colors:[root,child,grand].map(n=>n.style.getPropertyValue('--family-color')),links:document.querySelectorAll('.helper-thread').length,linksVisible:getComputedStyle(document.getElementById('helper-links')).display};})()`);
    assert.match(relation.root,/分身 2 活跃.*累计 2/);assert.match(relation.child,/协助/);assert.match(relation.grand,/协助/);assert.equal(new Set(relation.colors).size,1);assert.equal(relation.links,2);assert.notEqual(relation.linksVisible,'none');
    await evaluate(`document.getElementById('inspect-helper').click()`);
    assert.equal(await evaluate(`document.getElementById('inspect-title').textContent`),'family-child');
    await evaluate(`document.getElementById('roster-button').click()`);
    const indent=await evaluate(`(()=>{const row=[...document.querySelectorAll('.roster-row')].find(n=>n.textContent.includes('family-grandchild'));return row.style.marginLeft;})()`);
    assert.equal(indent,'36px');
    await evaluate(`document.getElementById('roster-dialog').close();document.getElementById('close-inspector').click()`);
    await wait(200);
    await capture('agent-family');
  });
  await check('a fast completed real edit shows coding in place and returns to an uninterrupted thinking pose', async () => {
    const now=Date.now();const edited=task('brief-editor','planning',{activeTools:0,events:[{event:'tool-start',eventId:'edit-start',toolCallId:'patch',at:now-900,activity:'coding',observedActivity:'coding',toolName:'exec → apply_patch'},{event:'tool-end',eventId:'edit-end',toolCallId:'patch',at:now-800,activity:'planning',observedActivity:'coding',toolName:'exec → apply_patch',outcome:'unknown'}]});
    await send([edited]);await wait(100);
    const before=await evaluate(`(()=>{const node=document.querySelector('.actor[data-session-id="brief-editor"]');return{phase:node.dataset.phase,state:node.querySelector('.actor-state').textContent,transform:node.style.transform};})()`);
    assert.equal(before.phase,'recent-work/coding');assert.equal(before.state,'刚刚在改代码');
    await wait(3500);await send([edited]);
    const after=await evaluate(`(()=>{const node=document.querySelector('.actor[data-session-id="brief-editor"]');return{phase:node.dataset.phase,state:node.querySelector('.actor-state').textContent,transform:node.style.transform};})()`);
    assert.equal(after.phase,'planning/think');assert.equal(after.state,'构思方案');assert.equal(after.transform,before.transform,'a short real edit must not cause a trip to the desk and back');
  });
  await check('an idle visitor arrives separately from real sessions and displays bilingual contextual speech', async () => {
    settings={...settings,reducedMotion:false,idleVisitor:true,selectedProject:'',language:'zh'};snapshot={...snapshot,mode:'live',sessions:[]};win.reload();await wait(300);
    assert.equal(await evaluate(`document.querySelectorAll('.visitor').length`),0,'the initial studio is empty');
    await wait(14500);
    const state=await evaluate(`({visitors:document.querySelectorAll('.visitor').length,actors:document.querySelectorAll('.actor').length,badge:document.querySelector('.visitor-badge')?.textContent,quote:document.querySelector('.visitor .actor-bubble')?.dataset.quoteId,lines:window.OfficeVisitorDialogue.entries.length,quiet:document.getElementById('office').dataset.quiet})`);
    assert.equal(state.visitors,1);assert.equal(state.actors,0);assert.equal(state.badge,'串门访客');assert.ok(state.quote);assert.equal(state.lines,500);assert.equal(state.quiet,'true');assert.equal(snapshot.sessions.length,0);
    await capture('idle-visitor');
    await evaluate(`document.getElementById('language-button').click()`);await wait(100);
    assert.equal(await evaluate(`document.querySelector('.visitor-badge').textContent`),'VISITOR');
    const localized=await evaluate(`(()=>{const bubble=document.querySelector('.visitor .actor-bubble');return bubble.textContent===window.OfficeVisitorDialogue.get(bubble.dataset.quoteId).en;})()`);assert.equal(localized,true);
    await evaluate(`document.getElementById('language-button').click()`);await wait(100);
  });
  await check('real work immediately takes priority and a departing visitor cannot restart old chatter', async () => {
    await send([task('visitor-interrupt','coding')]);
    assert.equal(await evaluate(`document.querySelectorAll('.actor[data-session-id="visitor-interrupt"]').length`),1);
    assert.equal(await evaluate(`document.querySelector('.visitor .actor-bubble')?.dataset.show==='true'`),false,'real work must silence visitor chatter even if its visual body has already left');
    await wait(2700);assert.equal(await evaluate(`document.querySelectorAll('.visitor').length`),0);
    await wait(1000);assert.equal(await evaluate(`document.querySelectorAll('.visitor').length`),0);
    await evaluate(`document.getElementById('settings-button').click();document.getElementById('setting-idleVisitor').click();document.getElementById('settings-dialog').close()`);await wait(100);assert.equal(settings.idleVisitor,false);
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, nativeElectron: process.versions.electron, platform: process.platform, size: win.getContentSize(), checks, rendererErrors: errors }, null, 2));
  win.destroy();
  app.quit();
}).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(1);
});
