'use strict';
// Original external artwork stays local. These synthetic native pixels exercise
// hand-on-chest and held-object poses without publishing any source artwork.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
const Family = require('../lib/family-model.js');
const Appearance = require('../renderer/family-appearance.js');
const Model = require('../lib/avatar-performance-model.js');
const root = path.resolve(__dirname, '..'), scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-hand-boundaries-'));
app.commandLine.appendSwitch('force-color-profile', 'srgb'); app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', path.join(scratch, 'profile')); app.disableHardwareAcceleration();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const poses = [['waiting-user', 'ask-hand-to-heart'], ['coding', 'code-document'], ['reading', 'read-scroll']];
const cases = Family.COLORS.flatMap((color, index) => [false, true].map(helper => ({
  appearance: { rootId: 'family-' + index, color, bodyColor: color, helperColor: Family.lighten(color), badge: String(index + 1).padStart(2, '0') }, helper,
  sessions: poses.map(([activity, program]) => {
    for (let seed = 0; seed < 1000; seed++) {
      const session = { id: ['hand-fixture', program, index, helper, seed].join(':'), provider: 'codex', status: 'active', activity };
      if (Model.plan(session).program === program) return session;
    }
    throw new Error('No fixture identity for ' + program);
  })
})));
let win; const errors = [];
const guard = setTimeout(() => { console.error('Hand boundary fixture timed out.'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  const base = pathToFileURL(path.join(root, 'renderer')).href + '/';
  const html = `<!doctype html><html><head><base href="${base}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="family-appearance.css"><style>html,body{margin:0;width:976px;height:856px;overflow:hidden}body{display:grid;grid-template-columns:repeat(4,240px);grid-template-rows:repeat(4,210px);gap:4px;background:#302922;color:#e9d7b1;font:11px sans-serif}.card{position:relative;background:#675849;overflow:hidden}.character-body{position:absolute;top:30px;left:20px;transform-origin:0 0}.label{position:absolute;left:10px;top:9px}.family-badge{top:9px;right:9px}</style></head><body><script src="../lib/avatar-performance-model.js"></script><script src="avatar-performance.js"></script><script src="family-appearance.js"></script><script>window.items=[];for(const entry of ${JSON.stringify(cases)}){const actor=document.createElement('div');actor.className='card';const body=document.createElement('span');body.className='character-body';actor.append(body);const label=document.createElement('span');label.className='label';label.textContent=entry.appearance.color+(entry.helper?' · Clone':' · Main');actor.append(label);document.body.append(actor);const performance=OfficeAvatarPerformance.create({actorNode:actor,body});const family=OfficeFamilyAppearance.create({actorNode:actor,body});family.update({rootId:entry.appearance.rootId,appearance:entry.appearance,helper:entry.helper});items.push({entry,actor,body,performance,family});}window.renderCase=(scale,pose)=>{for(const item of items){item.body.style.transform='scale('+scale+')';item.body.style.left=(240-154*scale)/2+'px';item.performance.update(item.entry.sessions[pose],{now:0,reducedMotion:true});}};renderCase(1,0);</script></body></html>`;
  fs.writeFileSync(path.join(scratch, 'fixture.html'), html);
  win = new BrowserWindow({ width: 976, height: 856, useContentSize: true, show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, callback) => { errors.push('Unexpected network request'); callback({ cancel: true }); });
  await win.loadFile(path.join(scratch, 'fixture.html')); await wait(200);
  const run = source => win.webContents.executeJavaScript(source, true);
  const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16));
  const near = (actual, expected, tolerance = 5) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
  let checkedHands = 0, edgePixels = 0, unchangedPixels = 0;
  for (const scale of [.65, 1, 1.35]) for (const [pose, [, program]] of poses.entries()) {
    await run(`renderCase(${scale},${pose})`); await wait(75);
    const points = await run(`items.map(item=>{const q=s=>item.body.querySelector(s),point=(selector,x,y)=>{const p=new DOMPoint(x,y).matrixTransform(q(selector).getScreenCTM());return[p.x,p.y];},box=(selector,x,y,width,height)=>{const m=q(selector).getScreenCTM(),p=[[x,y],[x+width,y],[x,y+height],[x+width,y+height]].map(([a,b])=>new DOMPoint(a,b).matrixTransform(m));return{left:Math.min(...p.map(p=>p.x))-2,right:Math.max(...p.map(p=>p.x))+2,top:Math.min(...p.map(p=>p.y))-2,bottom:Math.max(...p.map(p=>p.y))+2};};return{color:item.entry.helper?item.entry.appearance.helperColor:item.entry.appearance.bodyColor,hands:[{center:point('.ap-arm-left',45,90),box:box('.ap-arm-left',40,85,10,10)},{center:point('.ap-arm-right',110,90),box:box('.ap-arm-right',105,85,10,10)}],eyes:[point('.ap-eyes',62.5,85),point('.ap-eyes',92.5,85)],bounds:[box('.ap-torso',50,70,55,35),box('.ap-arm-left',40,85,10,10),box('.ap-arm-right',105,85,10,10),box('.ap-foot-1',55,105,5,10),box('.ap-foot-2',65,105,5,10),box('.ap-foot-3',85,105,5,10),box('.ap-foot-4',95,105,5,10)],filters:[...item.body.querySelectorAll('.ap-props-back,.ap-props-back *,.ap-eyes')].map(n=>getComputedStyle(n).filter),card:(()=>{const r=item.actor.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom};})()};})`);
    const capture = await win.webContents.capturePage(), bitmap = capture.toBitmap(), { width, height } = capture.getSize();
    if(process.env.MINI_OFFICE_PREVIEW_DIR&&scale===.65&&pose===0){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,'family-hands-ask-hand-to-heart-65.png'),capture.toPNG());}
    const pixel = (x, y) => { const at = (Math.floor(y) * width + Math.floor(x)) * 4; return [bitmap[at + 2], bitmap[at + 1], bitmap[at]]; };
    for (const item of points) {
      const colors = Appearance.handColors(item.color);
      assert.ok(item.filters.every(filter => filter === 'none'), 'eyes and every work object retain their original colour');
      for (const hand of item.hands) {
        assert.ok(near(pixel(...hand.center), rgb(colors.fill), 7), 'hand centre retains a distinct family shade: ' + JSON.stringify({ program, scale, color: item.color, actual: pixel(...hand.center), expected: rgb(colors.fill) }));
        let edgeCount = 0;
        for (let y = Math.max(0, Math.floor(hand.box.top)); y < Math.min(height, Math.ceil(hand.box.bottom)); y++) for (let x = Math.max(0, Math.floor(hand.box.left)); x < Math.min(width, Math.ceil(hand.box.right)); x++) if (near(pixel(x, y), rgb(colors.edge), 16)) edgeCount++;
        assert.ok(edgeCount >= 1, 'crisp hand boundary remains visible: ' + JSON.stringify({ program, scale, color: item.color, edgeCount }));
        checkedHands++; edgePixels += edgeCount;
      }
      for (const eye of item.eyes) assert.ok(near(pixel(...eye), [0, 0, 0], 8), 'expressive eyes remain black');
    }
    await run(`items.forEach(item=>item.actor.classList.remove('family-appearance'))`); await wait(35);
    const original = (await win.webContents.capturePage()).toBitmap();
    for (const item of points) for (let y = Math.ceil(item.card.top); y < item.card.bottom; y++) for (let x = Math.ceil(item.card.left); x < item.card.right; x++) {
      if (item.bounds.some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) continue;
      const at = (y * width + x) * 4;
      assert.equal(bitmap[at], original[at], 'no colour change outside real body joints'); assert.equal(bitmap[at + 1], original[at + 1]); assert.equal(bitmap[at + 2], original[at + 2]); unchangedPixels++;
    }
    await run(`items.forEach(item=>item.actor.classList.add('family-appearance'))`);
    if (process.env.MINI_OFFICE_PREVIEW_DIR && scale === 1.35) {
      fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'family-hands-' + program + '-135.png'), capture.toPNG());
    }
  }
  await run(`items.forEach(item=>{item.family.destroy();item.performance.destroy();})`);
  assert.equal(await run(`document.querySelectorAll('.family-filter-defs,.family-badge').length`), 0); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, cases: 8 * 2 * 3 * 3, checkedHands, edgePixels, unchangedPixels, checks: ['8 families and helper shades', '65/100/135% scale', 'hand on torso and held objects', 'distinct hand fill pixels', 'crisp zero-blur boundary pixels', 'unchanged expressive eyes', 'unchanged pixels outside body joints', 'local original artwork only', 'destroy cleanup'], errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
