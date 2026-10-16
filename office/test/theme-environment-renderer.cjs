'use strict';
// Original decorative environments over a local room, with immutable synthetic
// bystanders. No provider bridge, private sessions or character artwork.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const E = require('../renderer/theme-environment.js'), F = require('../lib/festival-model.js');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-environment-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
const base = pathToFileURL(path.join(__dirname, '../renderer/')).href, html = path.join(profile, 'environment.html');
fs.writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' file:; style-src \'self\' file: \'unsafe-inline\'; img-src \'self\' file:; connect-src \'none\'"><base href="' + base + '"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="theme-environment.css"><style>body{margin:0}#world{position:relative;width:1280px;height:720px;overflow:hidden}#sentinels{position:absolute;inset:0;z-index:10;pointer-events:none}.test-body{position:absolute;width:80px;height:110px;border:3px solid #68523b;border-radius:22px 22px 5px 5px;background:#b9c39b;top:480px}.test-body span{position:absolute;top:100%;left:-24px;width:128px;background:#3d3026;color:#f0ddbb;padding:5px;text-align:center;font:12px sans-serif}#a{left:580px}#b{left:850px;background:#cda387}#clock{position:absolute;left:610px;top:65px;width:216px;height:100px;z-index:5;color:#f0e4be;background:#796045;border:3px solid #503e2a;box-sizing:border-box;text-align:center;font:44px sans-serif}#clock small{display:block;font:11px sans-serif}#caption{position:absolute;left:465px;top:12px;width:360px;z-index:80;color:#ead7b5;text-align:center;font:14px sans-serif}</style><script defer src="../lib/festival-studies.js"></script><script defer src="../lib/festival-model.js"></script><script defer src="theme-environment.js"></script></head><body><main id="office" class="office"><div id="world"><img class="room-art" src="../assets/office-room.jpg" alt="Local room"><div id="clock">18:30<small>2026年10月17日 星期六 · 香港</small></div><div id="sentinels"><div id="a" class="test-body"><span>真实身份 A · 写代码</span></div><div id="b" class="test-body"><span>真实身份 B · 读代码</span></div></div><div id="caption"></div></div></main></body></html>');
let win; const errors = [], checks = [], pictures = new Set(), geometry = new Set(), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const preview = process.env.MINI_OFFICE_PREVIEW_DIR;
const run = source => win.webContents.executeJavaScript(source, true);
async function until(source, message, ms = 5000) { const end = Date.now() + ms; while (Date.now() < end) { if (await run(source)) return; await pause(20); } throw new Error(message); }
const guard = setTimeout(() => { console.error('Theme environment native fixture timed out'); app.exit(1); }, 110000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  await win.loadFile(html);
  await until('document.querySelector(".room-art").complete&&document.querySelector(".room-art").naturalWidth>0', 'real local room background must load');
  await run('window.state={theme:"spring",weather:"off",dayPhase:"afternoon",language:"zh",reducedMotion:false,lowPower:false,hidden:false};window.actorMutations=[];window.originalA=document.getElementById("a");new MutationObserver(r=>actorMutations.push(...r.map(v=>v.type))).observe(document.getElementById("sentinels"),{attributes:true,subtree:true,childList:true});window.env=OfficeThemeEnvironment.create({office:document.getElementById("office"),world:document.getElementById("world"),getState:()=>state});void 0');
  const glassClip = await run('({environment:getComputedStyle(document.querySelector(".theme-window")).clipPath,reference:(()=>{const n=document.createElement("div");n.className="window-scenery";document.getElementById("world").append(n);const path=getComputedStyle(n).clipPath;n.remove();return path})()})');
  assert.equal(glassClip.environment, glassClip.reference, 'theme scenery uses the same exact eight glass panes as the real Hong Kong view');
  const samples = [];
  for (const recipe of E.RECIPES) {
    await run('state={...state,theme:' + JSON.stringify(recipe.id) + '};env.update(state);document.getElementById("caption").textContent=OfficeFestivals.getTheme(state.theme).nameZh;void 0');
    const report = await run('(()=>{const layer=document.querySelector(".theme-environment"),windowView=document.querySelector(".theme-window"),clock=document.getElementById("clock").getBoundingClientRect(),wall=[...layer.querySelectorAll("[data-region=left-wall][data-structure],[data-region=right-wall][data-structure]")];const overlap=r=>r.left<clock.right&&r.right>clock.left&&r.top<clock.bottom&&r.bottom>clock.top;return{theme:layer.dataset.theme,window:windowView.dataset.theme,walls:wall.length,blocked:wall.some(n=>overlap(n.getBoundingClientRect())),geometry:[...document.querySelectorAll(".theme-dressing path,.theme-window path,.theme-window ellipse,.theme-window rect")].map(n=>[n.tagName,...["d","x","y","width","height","cx","cy","rx","ry"].map(a=>n.getAttribute(a))]).map(a=>a.join("|")).join(";"),regions:[...layer.querySelectorAll("[data-region]")].map(n=>n.dataset.region)}})()');
    assert.equal(report.theme, recipe.id); assert.equal(report.window, recipe.id); assert.equal(report.walls, 2); assert.equal(report.blocked, false);
    assert.ok(report.regions.includes('edge')); assert.ok(report.geometry.length > 1000); geometry.add(report.geometry);
    await run('window.audit={seen:false,done:false,poses:[],times:[],start:performance.now()};function sample(t){const e=document.querySelector(".theme-environment");if(e.dataset.playing==="true"){audit.seen=true;audit.times.push(t);audit.poses.push(JSON.stringify([...document.querySelectorAll("[data-response-region]")].map(n=>getComputedStyle(n).transform)))}else if(audit.seen)audit.done=true;if(!audit.done&&t-audit.start<2400)requestAnimationFrame(sample)}requestAnimationFrame(sample);env.trigger({theme:state.theme,id:"festival-"+state.theme});void 0');
    await until('audit.done', 'the finite ' + recipe.id + ' environment response must complete');
    const movement = await run('({frames:audit.times.length,unique:new Set(audit.poses).size,elapsed:audit.times.at(-1)-audit.times[0],changed:[...document.querySelectorAll("[data-response-region]")].filter(n=>n.dataset.active==="true").map(n=>n.dataset.responseRegion)})');
    assert.ok(movement.frames >= 31 && movement.unique >= 31 && movement.elapsed >= 800, JSON.stringify({ id: recipe.id, ...movement }));
    for (const region of ['window', 'left-wall', 'right-wall']) assert.ok(movement.changed.includes(region), 'the whole room responds in ' + region);
    samples.push({ id: recipe.id, ...movement });
    const png = (await win.webContents.capturePage()).toPNG(); pictures.add(crypto.createHash('sha256').update(png).digest('hex'));
    if (preview) { fs.mkdirSync(preview, { recursive: true }); fs.writeFileSync(path.join(preview, 'environment-' + recipe.id + '.png'), png); }
  }
  assert.equal(geometry.size, 43, 'all 43 actual drawn environments differ before comparing palette');
  assert.equal(pictures.size, 43, 'all 43 full-room native renderings differ');
  checks.push({ name: '43 complete window, two-wall and edge environments; multi-region real frame responses', count: samples.length, minimumFrames: Math.min(...samples.map(s => s.frames)), minimumUnique: Math.min(...samples.map(s => s.unique)) });
  await run('state={...state,theme:"summer"};env.update(state);env.trigger({theme:"summer"});void 0');
  await pause(190);
  const interruption = await run('(()=>{const nodes=[...document.querySelectorAll("[data-response-region]")],before=nodes.map(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform));env.trigger({theme:"summer"});const after=nodes.map(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform));return before.map((m,i)=>Math.max(Math.abs(m.m41-after[i].m41),Math.abs(m.m42-after[i].m42),Math.abs(m.m11-after[i].m11),Math.abs(m.m12-after[i].m12)))})()');
  assert.ok(interruption.every(delta=>delta<.01),'repeating an interaction must inherit every region\'s actual rendered pose');
  checks.push({name:'repeated activation retargets all seven actual rendered poses without returning to identity'});
  await run('state={...state,theme:"spring",dayPhase:"night"};env.update(state);env.trigger({theme:"spring"});void 0');
  await pause(70);
  await run('state={...state,hidden:true};env.update(state);void 0');
  assert.equal(await run('env.state().playing'), false); assert.equal(await run('document.querySelector(".theme-environment").getAnimations({subtree:true}).length'), 0);
  for (const key of ['reducedMotion', 'lowPower']) {
    await run('state={...state,hidden:false,reducedMotion:false,lowPower:false,' + key + ':true};env.update(state);env.trigger({theme:"spring"});void 0');
    assert.equal(await run('env.state().playing'), false);
  }
  for (const dayPhase of ['dawn', 'morning', 'afternoon', 'sunset', 'night']) {
    await run('env.update({...state,dayPhase:' + JSON.stringify(dayPhase) + '});void 0');
    assert.equal(await run('document.querySelector(".theme-window").dataset.phase'), dayPhase);
  }
  assert.equal(await run('env.trigger({theme:"christmas"})'), false, 'a stale click from another theme cannot change the new room');
  assert.deepEqual(await run('actorMutations'), []); assert.equal(await run('document.getElementById("a")===originalA'), true);
  assert.equal(await run('document.getElementById("clock").textContent.includes("18:30")'), true);
  await run('env.destroy();env.destroy();void 0');
  assert.equal(await run('document.querySelectorAll(".theme-environment,.theme-window").length'), 0);
  checks.push({ name: 'quiet/hidden/phase changes, stale triggers and idempotent cleanup leave real actors and clock untouched' });
  assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, checks, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
