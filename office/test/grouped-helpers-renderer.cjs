'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-grouped-helpers-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();

async function verify() {
  const tasks = ['main', 'one', 'two', 'three', 'four', 'five'].map((name, index) => ({
    id: 'codex:' + name, sessionId: name, provider: 'codex', activity: 'coding', status: 'active',
    parentId: index ? 'codex:main' : '', activeTools: 1, lastEventAt: Date.now(), events: []
  }));
  const errors = [];
  const settings = { language: 'en', reducedMotion: true, idleVisitor: false, agentScale: .65 };
  ipcMain.handle('office:progression', () => ({ok:true, keepsakes:[], decorations:[], growth:0}));
  ipcMain.handle('office:settings', () => settings);
  ipcMain.handle('office:set-settings', (_, patch) => Object.assign(settings, patch));
  ipcMain.handle('office:displays', () => []);
  ipcMain.handle('office:snapshot', () => ({ now: Date.now(), mode: 'live', connections: [], sessions: tasks }));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  const win = new BrowserWindow({ width: 1280, height: 720, show: false,
    webPreferences: { preload: path.join(__dirname, '../preload.cjs'), backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code, true);
  const waitFor = async condition => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await run(condition)) return;
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    assert.fail(condition + ' — ' + errors.join(', '));
  };
  try {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
    await waitFor("document.querySelector('.actor[data-session-id=\"codex:main\"]')?.dataset.foldedClones === '2'");
    assert.equal(await run("document.querySelectorAll('.actor[data-helper=true]').length"), 3);
    await run("document.getElementById('roster-button').click()");
    await waitFor("document.querySelectorAll('.roster-row').length === 6");
    const grouped = await run("Array.from(document.querySelectorAll('.roster-row')).filter(n => n.textContent.includes('grouped in room')).map(n => n.dataset.sessionId)");
    assert.equal(grouped.length, 2);
    assert.equal(await run("new Set(Array.from(document.querySelectorAll('.roster-row'), n => n.dataset.familyBadge.replace('↳',''))).size"), 1);
    await run("document.getElementById('show-all-helpers').click()");
    await waitFor("document.querySelectorAll('.actor[data-helper=true]').length === 5");
    assert.equal(await run("new Set(Array.from(document.querySelectorAll('.actor'), n => n.dataset.bodyAppearance)).size"), 1);
    await run("document.getElementById('show-all-helpers').click()");
    await waitFor("document.querySelectorAll('.actor[data-helper=true]').length === 3");
    await run(`Array.from(document.querySelectorAll('.roster-row')).find(row => row.dataset.sessionId === ${JSON.stringify(grouped[0])}).click()`);
    assert.equal(await run("document.getElementById('inspect-session-id').textContent"), 'Task ID: ' + grouped[0].split(':')[1]);
    await run("document.getElementById('close-inspector').focus(); document.getElementById('close-inspector').click()");
    assert.equal(await run('document.activeElement.id'), 'roster-button');
    await run("document.getElementById('language-button').click()");
    await waitFor("document.documentElement.lang === 'zh-CN'");
    win.webContents.send('office:snapshot', {now:Date.now(), mode:'live', avatarStyle:'painted', connections:[], sessions:[...tasks].reverse()});
    await waitFor("document.documentElement.dataset.avatarStyle === 'painted'");
    await run("document.getElementById('roster-button').click()");
    await waitFor("document.getElementById('roster-list').textContent.includes('房间内已折叠')");
    assert.equal(await run("document.getElementById('show-all-helpers').labels[0].textContent.trim()"), '在房间展开全部分身');
    assert.equal(await run("new Set(Array.from(document.querySelectorAll('.actor'), n => n.dataset.bodyAppearance)).size"), 1);
    const secondFamily = tasks.slice(0, 5).map(task => ({
      ...task, id: task.id + '-b', sessionId: task.sessionId + '-b', parentId: task.parentId ? 'codex:main-b' : ''
    }));
    win.webContents.send('office:snapshot', { now: Date.now(), mode: 'live', avatarStyle: 'painted', connections: [], sessions: [...tasks, ...secondFamily] });
    await waitFor("document.querySelectorAll('.roster-row').length === 11");
    const badges = await run("Array.from(document.querySelectorAll('.roster-row'), row => [row.dataset.sessionId, row.dataset.familyBadge.replace('↳', '')])");
    const byId = new Map(badges);
    assert.notEqual(byId.get('codex:main'), byId.get('codex:main-b'));
    for (const task of [...tasks, ...secondFamily]) assert.equal(byId.get(task.id), byId.get(task.parentId || task.id));
    const bodies = await run("Array.from(document.querySelectorAll('.actor'), actor => ({ ...actor.dataset }))");
    for (const group of [tasks, secondFamily]) {
      const main = bodies.find(body => body.sessionId === group[0].id);
      const helpers = bodies.filter(body => body.helper === 'true' && body.family === main.sessionId);
      assert.ok(helpers.length <= 3);
      assert.equal(helpers.length + Number(main.foldedClones), group.length - 1);
      assert.ok(helpers.every(body => body.bodyAppearance === main.bodyAppearance));
    }
    assert.equal(new Set(bodies.filter(body => body.helper === 'false').map(body => body.bodyAppearance)).size, 2);
    win.webContents.debugger.attach();
    try {
      const { nodes } = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
      assert.ok(nodes.some(node => node.role?.value === 'checkbox' && node.name?.value === '在房间展开全部分身'));
      assert.ok(nodes.some(node => node.role?.value === 'button' && /家族.*房间内已折叠/.test(node.name?.value)));
    } finally { win.webContents.debugger.detach(); }
    assert.deepEqual(errors, []);
    console.log('Verified family appearance, compact count, expansion and inspection of a folded helper.');
  } finally { win.destroy(); }
}
app.whenReady().then(verify).catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
