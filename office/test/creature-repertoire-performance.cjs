'use strict';
// An isolated production-controller benchmark. Wall times describe this local
// Electron run; they are advisory measurements, never an FPS guarantee.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const Repertoire = require('../renderer/creature-repertoire.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-repertoire-performance-'));
app.setPath('userData', path.join(scratch, 'profile')); app.disableHardwareAcceleration();
const errors = [], checks = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const run = code => win.webContents.executeJavaScript(code, true);
async function until(code, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) { if (await run(code)) return; await wait(30); }
  throw Error(label);
}
const watchdog = setTimeout(() => app.exit(2), 30000);
app.whenReady().then(async () => {
  const specimens = Array.from({ length: 100 }, (_, index) => {
    const species = Repertoire.SPECIES[Math.floor(index / Repertoire.ACTIVITIES.length) % Repertoire.SPECIES.length];
    const activity = Repertoire.ACTIVITIES[index % Repertoire.ACTIVITIES.length];
    return { design: { id: species, renderer: 'creature', asset: 'workshop-' + species + '.png' },
      session: { id: 'codex:repertoire-performance-' + index, provider: 'codex', status: 'active', activity, title: 'Synthetic observation ' + index, events: [] } };
  });
  const scripts = ['../lib/avatar-performance-model.js', ...Repertoire.SPECIES.map(id => 'repertoire-' + id + '.js'), 'creature-repertoire.js', 'creature-activity.js', 'creature-performance.js'];
  const base = pathToFileURL(path.join(__dirname, '../renderer/')).href;
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">
    <link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="creature-activity.css"><link rel="stylesheet" href="creature-performance.css">
    <style>html,body{margin:0;background:#eee0c6}.bench-grid{display:grid;grid-template-columns:repeat(10,160px)}.bench-actor{position:relative;height:135px}.character-body{display:block;position:relative;width:154px;height:129px;--avatar-presentation-scale:1.5}.character-body>img{position:absolute;width:154px;height:129px}</style></head><body><main class="bench-grid"></main>
    ${scripts.map(src => '<script src="' + src + '"></script>').join('')}
    <script>window.specimens=[];for(const spec of ${JSON.stringify(specimens)}){
      const actor=document.createElement('section');actor.className='bench-actor';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.src='../assets/avatars/'+spec.design.asset;body.append(image);actor.append(body);document.querySelector('.bench-grid').append(actor);
      const controller=OfficeCreaturePerformance.create({actorNode:actor,body,image,session:spec.session,design:spec.design});controller.update(spec.session,{now:0});specimens.push({...spec,actor,body,image,controller});
    }</script></body></html>`;
  const file = path.join(scratch, 'benchmark.html'); fs.writeFileSync(file, html);
  win = new BrowserWindow({ width: 1600, height: 1000, show: false, useContentSize: true, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  win.webContents.on('console-message', detail => { if (detail.level === 'error') errors.push(detail.message); });
  await win.loadFile(file);
  await until(`specimens.length===100&&specimens.every(item=>item.body.querySelector('.creature-performance')?.dataset.artState==='healthy')`, 'All one hundred real renderers must decode their local atlases');
  await wait(400);
  await run(`specimens.forEach(item=>item.controller.update(item.session,{now:1000}));void 0`);
  await run(`Promise.all(specimens.flatMap(item=>item.body.getAnimations({subtree:true})).map(animation=>animation.ready))`);
  const metrics = await run(`(()=>{
    const grid=document.querySelector('.bench-grid'),observer=new MutationObserver(()=>{});observer.observe(grid,{subtree:true,attributes:true,childList:true,characterData:true});
    window.clockOwners=specimens.flatMap(item=>item.body.getAnimations({subtree:true}));const starts=clockOwners.map(animation=>animation.startTime),durations=[];
    for(let batch=0;batch<25;batch++){
      const start=performance.now();
      for(const item of specimens)item.controller.update({...item.session,title:'Metadata batch '+batch,lastEventAt:1000+batch},{now:1001+batch});
      durations.push(performance.now()-start);
    }
    const mutations=observer.takeRecords().length;observer.disconnect();const live=specimens.flatMap(item=>item.body.getAnimations({subtree:true}));
    const retained=clockOwners.every((animation,index)=>live.includes(animation)&&animation.startTime===starts[index]),sorted=[...durations].sort((a,b)=>a-b);
    return{actors:specimens.length,materials:new Set(specimens.map(item=>item.design.id)).size,states:new Set(specimens.map(item=>item.session.activity)).size,batches:durations.length,updates:durations.length*specimens.length,mutations,animations:clockOwners.length,retained,allRunning:clockOwners.every(animation=>animation.playState==='running'),medianBatchMs:sorted[Math.floor(sorted.length/2)],p95BatchMs:sorted[Math.ceil(sorted.length*.95)-1]};
  })()`);
  assert.equal(metrics.materials, 5); assert.equal(metrics.states, 11); assert.equal(metrics.mutations, 0);
  assert.ok(metrics.animations >= 100); assert.equal(metrics.retained, true); assert.equal(metrics.allRunning, true);
  checks.push('2,500 unchanged metadata updates cause zero DOM mutations and retain every original clock and start time');
  await run(`specimens.forEach(item=>item.controller.update(item.session,{now:1500,hidden:true}));window.hiddenTimes=clockOwners.map(animation=>animation.currentTime);void 0`);
  assert.equal(await run(`clockOwners.every(animation=>animation.playState==='paused')`), true, 'Native hiding pauses CSS, recipe and whole-body clocks');
  await wait(150);
  await run(`specimens.forEach(item=>item.controller.update({...item.session,title:'Hidden metadata'},{now:100000,hidden:true}));void 0`);
  assert.equal(await run(`clockOwners.every((animation,index)=>animation.currentTime===hiddenTimes[index])`), true, 'Hidden clocks cannot advance or catch up during repeated metadata');
  assert.equal(await run(`clockOwners.every(animation=>specimens.some(item=>item.body.getAnimations({subtree:true}).includes(animation)))`), true, 'Every hidden owner is retained');
  await run(`specimens.forEach(item=>item.controller.update(item.session,{now:200000}));void 0`);
  assert.equal(await run(`clockOwners.every(animation=>animation.playState==='running'&&specimens.some(item=>item.body.getAnimations({subtree:true}).includes(animation)))`), true, 'Showing resumes the same objects');
  checks.push('hiding freezes exact playheads across repeated snapshots; showing resumes the original CSS and WAAPI objects');
  await run(`specimens.forEach(item=>item.controller.destroy());void 0`); await wait(50);
  assert.equal(await run(`document.getAnimations().length`), 0); assert.equal(await run(`clockOwners.every(animation=>animation.playState==='idle')`), true);
  assert.equal(await run(`document.querySelectorAll('.creature-performance,.cp-activity').length`), 0);
  checks.push('destroying all one hundred controllers releases every animation and renderer layer');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, hardwareAcceleration: false }, advisory: 'Local wall times for a batch of 100 controller updates; concurrent load can affect these measurements. No frame-rate claim.', metrics, checks, errors }, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(watchdog); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
