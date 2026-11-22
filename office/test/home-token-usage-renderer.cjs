'use strict';
// Synthetic local-log totals only; no real provider requests or private logs.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-home-tokens-'));
app.setPath('userData', path.join(dir, 'profile'));
app.disableHardwareAcceleration();

const errors = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const observedAt = Date.parse('2026-10-23T04:30:00Z');
const usage = {
  date: '2026-10-23', timeZone: 'Asia/Hong_Kong', weekFrom: '2026-10-19', weekTo: '2026-10-25',
  dailyTokens: 12400000, weeklyTokens: 86200000, available: true, importing: false,
  lastScanAt: observedAt, providers: ['codex', 'claude-code']
};
const shortWindow = { slot: 'primary', usedPercent: 28, windowMinutes: 300, resetAt: Date.parse('2026-10-23T09:30:00Z') };
const weeklyWindow = { slot: 'secondary', usedPercent: 52, windowMinutes: 10080, resetAt: Date.parse('2026-10-30T04:30:00Z') };
const quota = { available: true, stale: false, observedAt, windows: [shortWindow, weeklyWindow] };
let settings = { language: 'en', reducedMotion: true, idleVisitor: false };
let currentSnapshot = { mode: 'live', sessions: [], connections: [], activityStats: { total: 7, roots: 5, helpers: 2 }, tokenUsage: usage, codexQuota: quota };
const preload = path.join(dir, 'preload.cjs');
fs.writeFileSync(preload, `'use strict';const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('office',Object.freeze({getSnapshot:()=>ipcRenderer.invoke('home-tokens:snapshot'),getSettings:()=>ipcRenderer.invoke('home-tokens:settings'),setSettings:patch=>ipcRenderer.invoke('home-tokens:settings',patch),listDisplays:()=>Promise.resolve([]),onSnapshot:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('home-tokens:snapshot',listener);return()=>ipcRenderer.removeListener('home-tokens:snapshot',listener);}}));window.addEventListener('error',event=>ipcRenderer.send('home-tokens:error',String(event.message)));window.addEventListener('unhandledrejection',event=>ipcRenderer.send('home-tokens:error',String(event.reason?.message||event.reason)));`);
let win;
const run = source => win.webContents.executeJavaScript(source, true);
// Inspect Chromium layout and computed SVG/CSS output after a normal app snapshot.
const inspect = fn => run(`(${fn.toString()})()`);
const textOf = id => run(`document.getElementById('${id}').textContent`);

async function update(patch) {
  currentSnapshot = { ...currentSnapshot, ...patch };
  win.webContents.send('home-tokens:snapshot', currentSnapshot);
  await wait(30);
}
async function setLanguage(language) {
  if (settings.language !== language) {
    await run("document.getElementById('language-button').click()");
    await wait(50);
  }
  assert.equal(settings.language, language);
}

function layout() {
  const get = id => document.getElementById(id);
  const rect = id => get(id).getBoundingClientRect();
  const fits = element => element.scrollWidth <= element.clientWidth + 1;
  const contains = (host, child) =>
    child.left >= host.left - 1 && child.right <= host.right + 1 &&
    child.top >= host.top - 1 && child.bottom <= host.bottom + 1;
  const ledger = rect('activity-stats'), tokens = rect('home-token-usage'), meter = rect('home-codex-quota');
  const agents = document.querySelector('.activity-agent-stats'), agentBox = agents.getBoundingClientRect();
  const day = rect('home-token-daily'), week = rect('home-token-weekly');
  const ring = document.querySelector('.codex-quota-gauge').getBoundingClientRect();
  const heading = document.querySelector('.codex-quota-heading');
  const caption = get('home-token-share-caption'), tokenPanel = get('home-token-usage');
  return {
    ledgerFits: contains({ left: 0, top: 0, right: innerWidth, bottom: innerHeight }, ledger),
    bodyFits: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
    clockClear: ledger.right <= rect('day-clock').left + 1,
    agentsFit: agentBox.right <= tokens.left && [...agents.children].every(el => fits(el) && contains(agentBox, el.getBoundingClientRect())),
    tokensAndRingFit: contains(ledger, tokens) && contains(ledger, meter) && tokens.right <= meter.left + 1,
    columns: day.right <= week.left + 1 && Math.abs(day.top - week.top) <= 1,
    totalsFit: [...tokenPanel.querySelectorAll('dt,dd')].every(el => fits(el) && contains(tokens, el.getBoundingClientRect())),
    largeTotals: ['home-token-daily', 'home-token-weekly'].every(id => parseFloat(getComputedStyle(get(id)).fontSize) >= 24),
    largerLabels: ['home-token-daily-label', 'home-token-weekly-label'].every(id => parseFloat(getComputedStyle(get(id)).fontSize) >= 12),
    captionFits: fits(caption) && contains(tokens, caption.getBoundingClientRect()),
    headingFits: fits(heading) && contains(meter, heading.getBoundingClientRect()),
    gaugeFits: ring.width > 0 && contains(meter, ring) && contains(meter, rect('home-codex-quota-toggle')),
    centerFits: contains(ring, rect('home-codex-quota-value'))
  };
}

function inspectShare() {
  const track = document.getElementById('home-token-share-track');
  const fill = document.getElementById('home-token-share-day');
  const trackWidth = track.getBoundingClientRect().width;
  return {
    visible: trackWidth > 0 && track.getBoundingClientRect().height > 0,
    proportion: trackWidth ? fill.getBoundingClientRect().width / trackWidth : null,
    caption: document.getElementById('home-token-share-caption').textContent
  };
}

function inspectQuota() {
  const get = id => document.getElementById('home-codex-quota' + id);
  const visible = element => element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    element.getBoundingClientRect().width > 0;
  function ring(name) {
    const group = get('-' + name), fill = get('-' + name + '-fill');
    const paint = getComputedStyle(fill);
    return {
      visible: visible(group),
      fillVisible: visible(fill),
      slot: group.dataset.slot,
      stroke: paint.stroke,
      dash: paint.strokeDasharray,
      cap: paint.strokeLinecap,
      width: parseFloat(paint.strokeWidth),
      radius: fill.r.baseVal.value,
      length: fill.getAttribute('pathLength') || fill.getTotalLength(),
      label: get('-' + name + '-label').textContent,
      labelVisible: visible(get('-' + name + '-label'))
    };
  }
  return {
    state: get('').dataset.state, value: get('-value').textContent,
    outer: ring('outer'), inner: ring('inner'),
    status: get('-status').textContent, statusVisible: visible(get('-status'))
  };
}

// Interpret the SVG's painted arc against its normalized circumference.
function percentPainted(ring) {
  if (!ring.fillVisible) return 0;
  const arc = 100 * parseFloat(ring.dash) / Number(ring.length);
  const caps = ring.cap === 'round' ? 100 * Math.asin(ring.width / (2 * ring.radius)) / Math.PI : 0;
  return arc + caps;
}

async function assertRings(expected) {
  const actual = await inspect(inspectQuota);
  assert.equal(actual.value, expected.value, JSON.stringify(actual));
  for (const name of ['outer', 'inner']) {
    const ring = actual[name], sample = expected[name];
    if (!sample) {
      if (name === 'inner') assert.equal(ring.visible, false, 'no inner track for an unreported window');
      continue;
    }
    assert.ok(ring.visible, name + ' window is visible');
    assert.equal(ring.slot, sample.slot);
    assert.equal(ring.label, sample.label);
    assert.ok(Math.abs(percentPainted(ring) - sample.percent) <= 0.2, 'painted ' + name + ' arc: ' + JSON.stringify(ring));
  }
  if (expected.inner) assert.notEqual(actual.outer.stroke, actual.inner.stroke, 'the two windows have distinct ink');
  return actual;
}

async function checkQuotaStates() {
  // Deliberately reverse the native slots; duration determines ring placement.
  await update({ codexQuota: { ...quota, windows: [{ ...weeklyWindow, slot: 'primary' }, { ...shortWindow, slot: 'secondary' }] } });
  await assertRings({ value: '72%', outer: { slot: 'secondary', percent: 72, label: '5h' }, inner: { slot: 'primary', percent: 48, label: '7d' } });
  await update({ codexQuota: { ...quota, windows: [shortWindow] } });
  await assertRings({ value: '72%', outer: { slot: 'primary', percent: 72, label: '5h' } });
  await update({ codexQuota: { ...quota, windows: [{ ...shortWindow, slot: 'secondary', usedPercent: 31.5 }] } });
  await assertRings({ value: '68.5%', outer: { slot: 'secondary', percent: 68.5, label: '5h' } });
  await update({ codexQuota: { ...quota, stale: true, windows: [shortWindow] } });
  const stale = await inspect(inspectQuota);
  assert.equal(stale.value, '72%');
  assert.equal(stale.state, 'stale');
  assert.equal(stale.statusVisible, true, 'stale evidence is visible on the wall');
  assert.match(stale.status, /stale/i);
  await update({ codexQuota: { ...quota, windows: [{ ...shortWindow, usedPercent: 100 }] } });
  await assertRings({ value: '0%', outer: { slot: 'primary', percent: 0, label: '5h' } });
  await update({ codexQuota: { available: false, observedAt: null, stale: false, windows: [] } });
  const missing = await inspect(inspectQuota);
  assert.equal(missing.value, '—');
  assert.equal(missing.state, 'unavailable');
  assert.equal(missing.outer.label, 'Waiting');
  assert.equal(missing.outer.labelVisible, true);
  assert.equal(missing.outer.fillVisible, false);
  assert.equal(missing.inner.visible, false);
  await update({ codexQuota: quota });
}

async function pressKey(key, code) {
  for (const type of ['keyDown', 'keyUp']) {
    const text = key === 'Enter' && type === 'keyDown' ? '\r' : '';
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type, key, code: key, text, windowsVirtualKeyCode: code
    });
  }
}

async function inspectDetails(language) {
  await run("document.getElementById('home-token-usage').focus()");
  assert.equal(await run('document.activeElement.id'), 'home-token-usage', 'keyboard access to exact Token counts');
  await run("document.getElementById('home-codex-quota-toggle').focus()");
  await pressKey('Enter', 13);
  assert.equal(await run("document.getElementById('home-codex-quota-toggle').getAttribute('aria-expanded')"), 'true');
  assert.equal(await inspect(() => {
    const b = document.getElementById('home-codex-quota-details').getBoundingClientRect();
    return b.width > 0 && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
  }), true, 'quota details fit the viewport');
  const details = await textOf('home-codex-quota-details');
  assert.match(details, language === 'en' ? /72% remaining/ : /剩余 72%/);
  assert.match(details, language === 'en' ? /48% remaining/ : /剩余 48%/);
  await pressKey('Escape', 27);
  assert.equal(await run("document.getElementById('home-codex-quota-details').hidden"), true);
  assert.equal(await run('document.activeElement.id'), 'home-codex-quota-toggle');
}

app.whenReady().then(async () => {
  ipcMain.handle('home-tokens:snapshot', () => currentSnapshot);
  ipcMain.handle('home-tokens:settings', (_, patch) => (settings = { ...settings, ...patch }));
  ipcMain.on('home-tokens:error', (_, message) => errors.push(message));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false,
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.debugger.attach('1.3');
  await wait(300);

  assert.equal(await textOf('home-token-daily'), '12.4M');
  assert.equal(await textOf('home-token-weekly'), '86.2M');
  assert.match(await run("document.getElementById('home-token-usage').title"), /12,400,000 tokens/);
  assert.match(await run("document.getElementById('home-token-usage').title"), /2026-10-19 to 2026-10-25/);
  assert.match(await textOf('home-codex-quota-accessible'), /5 hours.*72% remaining.*7 days.*48% remaining/);
  assert.equal(await run("document.querySelectorAll('.actor').length"), 0, 'Token and quota observations create no room actors');

  await checkQuotaStates();
  const geometryIssues = [];
  for (const size of [[1280, 720], [1000, 720], [800, 450]]) {
    win.setContentSize(...size);
    await wait(100);
    for (const language of ['zh', 'en']) {
      await setLanguage(language);
      for (const style of ['pixel', 'painted']) {
        await run(`document.documentElement.dataset.avatarStyle='${style}'`);
        const geometry = await inspect(layout);
        const failed = Object.keys(geometry).filter(check => !geometry[check]);
        if (failed.length) {
          const overflow = await inspect(() => [...document.querySelectorAll('.activity-agent-stats > *, #home-token-usage dt, #home-token-usage dd')]
            .filter(el => el.scrollWidth > el.clientWidth + 1 || el.offsetWidth > el.parentElement.clientWidth + 1)
            .map(el => ({ text: el.textContent, width: el.clientWidth, content: el.scrollWidth, parent: el.parentElement.clientWidth })));
          geometryIssues.push({ size, language, style, failed, overflow });
        }
        const share = await inspect(inspectShare);
        assert.ok(share.visible);
        assert.ok(Math.abs(share.proportion - 12.4 / 86.2) < 0.002, 'painted bar: ' + JSON.stringify(share));
        assert.match(share.caption, /14%/);
        await inspectDetails(language);
      }
    }
  }

  await update({ tokenUsage: { ...usage, dailyTokens: 12345678, weeklyTokens: 2345000000 } });
  assert.equal(await textOf('home-token-daily'), '12.35M');
  assert.equal(await textOf('home-token-weekly'), '2.35B');
  for (const tokens of [1, 999999, 12345678, 999990000, 1000000000000, Number.MAX_SAFE_INTEGER]) {
    await update({ tokenUsage: { ...usage, dailyTokens: tokens, weeklyTokens: tokens } });
    const widths = await inspect(() => [...document.querySelectorAll('#home-token-usage dd')].map(node => ({
      text: node.textContent, scroll: node.scrollWidth, client: node.clientWidth
    })));
    if (widths.some(node => node.scroll > node.client + 1)) {
      geometryIssues.push({ tokens, widths });
    }
  }
  await update({ tokenUsage: { ...usage, importing: true, error: 'fixture local scan error' } });
  assert.equal(await run("document.getElementById('home-token-usage').dataset.error"), 'true');
  assert.match(await textOf('home-token-state'), /Import in progress.*Import or read failed/);
  const partial = await inspect(inspectShare);
  assert.equal(partial.visible, false, 'incomplete data has no share bar');
  assert.doesNotMatch(partial.caption, /%/);
  await update({ tokenUsage: { ...usage, available: false } });
  assert.equal(await textOf('home-token-daily'), '—');
  assert.equal((await inspect(inspectShare)).visible, false);

  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    const previewDir = process.env.MINI_OFFICE_PREVIEW_DIR;
    fs.mkdirSync(previewDir, { recursive: true });
    await update({ tokenUsage: usage, codexQuota: { ...quota, windows: [shortWindow] } });
    await setLanguage('zh');
    await run("document.documentElement.dataset.avatarStyle='pixel';document.activeElement.blur()");
    for (const [width, height] of [[800, 450], [1280, 720]]) {
      win.setContentSize(width, height);
      await wait(150);
      fs.writeFileSync(path.join(previewDir, `home-token-usage-${width}x${height}.png`), (await win.webContents.capturePage()).toPNG());
    }
    const plaque = await inspect(() => {
      const r = document.getElementById('activity-stats').getBoundingClientRect();
      const x = Math.floor(r.left) - 8, y = Math.floor(r.top) - 8;
      return { x, y, width: Math.ceil(r.right) + 8 - x, height: Math.ceil(r.bottom) + 8 - y };
    });
    fs.writeFileSync(path.join(previewDir, 'home-token-usage-plaque.png'), (await win.webContents.capturePage(plaque)).toPNG());
  }
  assert.equal(geometryIssues.length, 0, JSON.stringify(geometryIssues));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: [
    'native Token bar proportions and large labeled totals', 'one and two ring quota windows including reversed slots',
    'quota stale, zero and unavailable states', 'bilingual accessible details and responsive geometry in both themes',
    'incomplete Token observations', 'clock clearance', 'no sessions created from usage'
  ], errors }));
}).catch(error => {
  console.error(error); process.exitCode = 1;
}).finally(() => {
  win?.destroy(); fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
