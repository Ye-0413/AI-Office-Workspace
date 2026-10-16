'use strict';
// Isolated production scenery. Synthetic sentinels ensure decoration never
// changes an observed body. No hooks, provider setup or external requests.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Venues = require('../lib/venue-model.js');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-venue-native-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [], samples = []; let win;
const file = path.join(profile, 'fixture.html');
const base = pathToFileURL(path.join(__dirname, '../renderer/')).href;
fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' file:; style-src 'self' file:; img-src 'self' file: data:; connect-src 'none'"><base href="${base}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="venue-stage.css"><script defer src="../lib/venue-model.js"></script><script defer src="venue-stage.js"></script></head><body><main id="office" class="office"><div id="world-frame" class="world-frame"><div id="world" class="world"><img id="room-art" class="room-art" src="../assets/office-room.jpg" alt="Original room"><button id="day-clock" class="day-clock" type="button"><time>18:30</time><time>2026年10月17日 周六</time></button><div id="actors" class="actors"><button id="real-body-sentinel" type="button">Agent sentinel</button></div></div></div><header class="topbar"><div class="brand">小小工作室</div><div class="room-switcher"><select aria-label="Project"><option>Fixture project</option></select></div><div class="top-actions"><button class="language-button">EN</button><button class="icon-button">◷</button><button class="icon-button">⚙</button><button class="icon-button">≡</button></div></header></main></body></html>`);
const guard = setTimeout(() => { console.error('Venue renderer exceeded 120 seconds'); app.exit(1); }, 120000);
const run = source => win.webContents.executeJavaScript(source, true);
async function until(source, message, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await run(source)) return; await pause(25); }
  throw new Error(message + ': ' + JSON.stringify(await run(`({venue:document.getElementById('office').dataset.venue,painted:document.getElementById('room-art').dataset.venue,buffers:document.querySelectorAll('.venue-art-buffer').length,feedback:document.querySelector('.venue-feedback')?.textContent})`)));
}
async function check(name, fn) { try { await fn(); checks.push(name); } catch (error) { error.message = name + ': ' + error.message; throw error; } }
const widget = id => `document.querySelector('.venue-widget[data-interaction="${id}"]')`;
async function press(id, keyboard = false) { await run(`${widget(id)}.querySelector('.venue-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:${keyboard ? 0 : 1}}))`); }
async function update(patch) { await run(`state={...state,...${JSON.stringify(patch)}};controller.update(state);void 0`); }
async function venue(id, patch = {}) { await update({ venue: id, ...patch }); await until(`document.getElementById('room-art').dataset.venue===${JSON.stringify(id)}&&document.querySelectorAll('.venue-art-buffer').length===0`, 'requested room must finish decoding and commit'); }
async function capture(name) {
  if (!process.env.MINI_OFFICE_PREVIEW_DIR) return;
  fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ width:1280, height:720, useContentSize:true, show:false, webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false } });
  win.webContents.on('console-message', (_event, ...args) => { const details = args[0]; if (typeof details === 'object' && details.level === 'error') errors.push(details.message); });
  await win.loadFile(file);
  await win.webContents.insertCSS('#real-body-sentinel{position:absolute;left:60%;top:70%;width:80px;height:100px;background:#c6a173;border:2px solid #684c37;pointer-events:auto;z-index:10}');
  await run(`window.testErrors=[];addEventListener('error',event=>{if(event.message)testErrors.push(event.message)});addEventListener('unhandledrejection',event=>testErrors.push(String(event.reason)));window.state={venue:'workshop',language:'zh',reducedMotion:false,lowPower:false,hidden:false,dayPhase:'afternoon'};window.selections=[];window.interactions=[];window.sentinel=document.getElementById('real-body-sentinel');window.originalArt=document.getElementById('room-art');window.bodyMutations=[];new MutationObserver(records=>bodyMutations.push(...records.map(r=>r.type))).observe(document.getElementById('actors'),{attributes:true,childList:true,subtree:true});window.controller=OfficeVenueStage.create({office:document.getElementById('office'),world:document.getElementById('world'),topbar:document.querySelector('.topbar'),getState:()=>state,onSelectVenue:(id,meta)=>selections.push({id,...meta}),onInteraction:payload=>interactions.push(payload)});void 0`);
  await venue('workshop');
  await check('three real backgrounds, native selector and nine independent local objects', async () => {
    for (const item of Venues.CATALOG) assert.ok(fs.statSync(path.join(__dirname, '../renderer', item.background)).size > 1000, item.background);
    assert.equal(await run(`document.getElementById('venue-select').options.length`), 3);
    assert.equal(await run(`document.querySelectorAll('.venue-widget').length`), 9);
    assert.equal(await run(`[...document.querySelectorAll('.venue-widget')].filter(n=>!n.hidden).length`), 3);
    assert.match(await run(`document.getElementById('venue-select').selectedOptions[0].textContent`), /山海工坊/);
    assert.equal(await run(`document.querySelectorAll('#room-art').length`), 1);
  });
  await check('workshop blueprint rolls, circuit carries signals and brass bell swings', async () => {
    await press('workshop-blueprint'); await pause(850);
    assert.equal(await run(`${widget('workshop-blueprint')}.dataset.state`), 'open');
    assert.ok(await run(`new DOMMatrixReadOnly(getComputedStyle(${widget('workshop-blueprint')}.querySelector('.venue-blueprint-sheet')).transform).a>.99`));
    await press('workshop-blueprint', true);
    assert.equal(await run(`${widget('workshop-blueprint')}.querySelector('button').getAttribute('aria-pressed')`), 'false');
    await press('workshop-circuit');
    assert.ok(await run(`${widget('workshop-circuit')}.querySelector('.venue-circuit-signal').getAnimations().length>0`));
    await press('workshop-bell');
    assert.ok(await run(`${widget('workshop-bell')}.querySelector('.venue-hanging').getAnimations().length>0`));
    await pause(280);
    assert.match(await run(`document.querySelector('.venue-feedback').textContent`), /铜铃第 1 声/);
    await capture('venue-workshop');
  });
  await check('native selection calls once and keyboard choice commits without a fade', async () => {
    await run(`(()=>{const select=document.getElementById('venue-select');select.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));select.value='teahouse';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(`document.getElementById('room-art').dataset.venue==='teahouse'`, 'keyboard scene choice must complete');
    assert.deepEqual(await run('selections'), [{ id:'teahouse',source:'keyboard' }]);
    assert.equal(await run(`document.querySelectorAll('.venue-art-buffer').length`), 0);
    await update({ venue:'teahouse' });
  });
  await check('tea pours, infuses and steams; rapid refills cancel the preceding pour', async () => {
    await press('teahouse-tea');
    assert.equal(await run(`${widget('teahouse-tea')}.dataset.state`), 'pouring');
    await until(`${widget('teahouse-tea')}.dataset.state==='steeping'`, 'tea must have a distinct infusion phase');
    await until(`${widget('teahouse-tea')}.dataset.state==='ready'`, 'tea must finish its pour');
    assert.match(await run(`${widget('teahouse-tea')}.querySelector('.venue-readout').textContent`), /^1 /);
    assert.ok(await run(`${widget('teahouse-tea')}.querySelector('.venue-tea-steam').getAnimations().length>0`));
    await run(`${widget('teahouse-tea')}.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));${widget('teahouse-tea')}.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));void 0`);
    await until(`${widget('teahouse-tea')}.dataset.state==='ready'`, 'latest refill must complete');
    assert.match(await run(`${widget('teahouse-tea')}.querySelector('.venue-readout').textContent`), /^2 /);
    assert.match(await run(`document.querySelector('.venue-feedback').textContent`), /续杯/);
  });
  await check('tea house has a moving wind chime and its own folding harbour note', async () => {
    await press('teahouse-windchime');
    assert.equal(await run(`${widget('teahouse-windchime')}.dataset.state`), 'rung');
    assert.ok(await run(`${widget('teahouse-windchime')}.querySelector('.venue-hanging').getAnimations().length>0`));
    await press('teahouse-note'); await pause(850);
    assert.equal(await run(`${widget('teahouse-note')}.querySelector('button').getAttribute('aria-pressed')`), 'true');
    assert.match(await run(`${widget('teahouse-note')}.querySelector('.venue-note-text').textContent`), /潮起有时/);
    assert.equal(await run(`Number(getComputedStyle(${widget('teahouse-note')}.querySelector('.venue-note-text')).opacity)`), 1);
    await capture('venue-teahouse');
  });
  await check('observatory draws real star connections, turns a telescope and sends one meteor', async () => {
    await venue('observatory');
    await press('observatory-starmap');
    assert.equal(await run(`${widget('observatory-starmap')}.querySelectorAll('.venue-star-target[aria-pressed="true"]').length`), 5);
    assert.equal(await run(`${widget('observatory-starmap')}.querySelectorAll('.venue-star-lines path').length`), 4);
    await run(`${widget('observatory-starmap')}.querySelector('.venue-star-target[data-star="2"]').click()`);
    assert.equal(await run(`${widget('observatory-starmap')}.querySelectorAll('.venue-star-lines path').length`), 3);
    assert.equal(await run(`${widget('observatory-starmap')}.querySelector('.venue-star-target[data-star="2"]').getAttribute('aria-pressed')`), 'false');
    await press('observatory-telescope'); await pause(850);
    assert.equal(await run(`${widget('observatory-telescope')}.dataset.state`), 'bearing-1');
    const bearing1=await run(`getComputedStyle(${widget('observatory-telescope')}.querySelector('.venue-telescope')).transform`);
    await press('observatory-telescope'); await pause(850);
    assert.notEqual(await run(`getComputedStyle(${widget('observatory-telescope')}.querySelector('.venue-telescope')).transform`), bearing1);
    await press('observatory-meteor-note');
    assert.ok(await run(`${widget('observatory-meteor-note')}.querySelector('.venue-meteor').getAnimations().length>0`));
    await pause(760);
    assert.equal(await run(`${widget('observatory-meteor-note')}.querySelector('.venue-meteor').getAnimations().length`), 0);
    assert.match(await run(`${widget('observatory-meteor-note')}.querySelector('.venue-note-text').textContent`), /星河/);
    await capture('venue-observatory');
  });
  await check('late decoded pictures cannot replace the latest room; repeat updates do not restart it', async () => {
    await run(`window.realDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=async function(){if(this.classList.contains('venue-art-buffer')&&this.src.includes('teahouse'))await new Promise(resolve=>setTimeout(resolve,180));return realDecode.call(this)};void 0`);
    await update({ venue:'teahouse' });
    await update({ venue:'workshop' });
    for(let i=0;i<8;i++)await update({ venue:'workshop',dayPhase:i%2?'night':'afternoon' });
    await until(`document.getElementById('room-art').dataset.venue==='workshop'&&document.querySelectorAll('.venue-art-buffer').length===0`, 'latest room must finish despite repeated snapshots');
    await pause(250);
    assert.equal(await run(`document.getElementById('room-art').dataset.venue`), 'workshop');
    await run(`HTMLImageElement.prototype.decode=realDecode;void 0`);
  });
  await check('reduced motion, low power and hidden changes settle active pours without orphan animation', async () => {
    await venue('teahouse'); await press('teahouse-tea');
    await update({ hidden:true }); await pause(20);
    assert.equal(await run(`${widget('teahouse-tea')}.dataset.state`), 'ready');
    assert.equal(await run(`document.querySelector('.venue-stage').getAnimations({subtree:true}).filter(a=>a.playState==='running').length`), 0);
    await update({ hidden:false,reducedMotion:true }); await press('teahouse-tea',true); await pause(20);
    assert.equal(await run(`${widget('teahouse-tea')}.dataset.state`), 'ready');
    await venue('workshop',{ reducedMotion:false,lowPower:true }); await press('workshop-bell');
    assert.equal(await run(`document.querySelector('.venue-stage').getAnimations({subtree:true}).filter(a=>a.playState==='running').length`), 0);
    await update({ lowPower:false });
  });
  await check('all local labels follow language; small window controls fit without covering the clock', async () => {
    await update({ language:'en',reducedMotion:true });
    assert.equal(await run(`document.getElementById('venue-select').getAttribute('aria-label')`), 'Choose a workspace scene');
    for(const item of Venues.CATALOG){
      await venue(item.id);
      for(const interaction of item.interactions)assert.equal(await run(`${widget(interaction.id)}.querySelector('button').getAttribute('aria-label')`), interaction.labelEn);
    }
    win.setContentSize(800,450);await pause(100);
    await win.webContents.insertCSS('#world-frame{left:0!important;top:0!important;transform-origin:0 0!important;transform:scale(.625)!important}');
    const bounds=await run(`(()=>{const c=document.getElementById('day-clock').getBoundingClientRect(),visible=[...document.querySelectorAll('.venue-widget')].filter(n=>!n.hidden),s=document.getElementById('venue-select').getBoundingClientRect(),w=document.getElementById('world').getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,select:[s.left,s.right],world:{left:w.left,right:w.right,top:w.top,bottom:w.bottom},clockHits:visible.filter(n=>{const r=n.querySelector('svg').getBoundingClientRect();return r.left<c.right&&r.right>c.left&&r.top<c.bottom&&r.bottom>c.top}).map(n=>n.dataset.interaction)}})()`);
    assert.ok(bounds.scroll<=bounds.width,JSON.stringify(bounds));assert.ok(bounds.select[0]>=0&&bounds.select[1]<=800,JSON.stringify(bounds));assert.deepEqual(bounds.clockHits,[]);
    assert.ok(Math.abs(bounds.world.left)<1&&Math.abs(bounds.world.right-800)<1&&Math.abs(bounds.world.top)<1&&Math.abs(bounds.world.bottom-450)<1,JSON.stringify(bounds));
    await press('observatory-telescope',true);
    assert.match(await run(`document.querySelector('.venue-feedback').textContent`), /Toward/);
    await capture('venue-small-en');
    await update({ language:'zh' });
    assert.match(await run(`document.querySelector('.venue-feedback').textContent`), /望向|转向|抬向/);
  });
  await check('resource failure keeps local objects usable and a later room recovers', async () => {
    await run(`window.realDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return this.classList.contains('venue-art-buffer')&&this.src.includes('teahouse')?Promise.reject(new Error('fixture image failure')):realDecode.call(this)};void 0`);
    await update({ venue:'teahouse' });await pause(50);
    assert.match(await run(`document.querySelector('.venue-feedback').textContent`), /暂未加载/);
    await press('teahouse-note',true);assert.equal(await run(`${widget('teahouse-note')}.querySelector('button').getAttribute('aria-pressed')`), 'false');
    await run(`HTMLImageElement.prototype.decode=realDecode;void 0`);
    await venue('workshop');await venue('teahouse');
  });
  await check('all nine local mechanisms show at least 31 distinct continuously sampled poses',async()=>{
    for(const item of Venues.CATALOG)for(const interaction of item.interactions){
      await venue(item.id,{reducedMotion:false,lowPower:false,hidden:false});
      await run(`window.venueAudit={frames:[],done:false,start:performance.now()};window.auditObject=${widget(interaction.id)};function sampleVenue(t){const signature=[...auditObject.querySelectorAll('*')].map(n=>{const s=getComputedStyle(n);return s.transform+'|'+s.opacity}).join(';');venueAudit.frames.push({at:t,signature});if(t-venueAudit.start>=850)venueAudit.done=true;else requestAnimationFrame(sampleVenue)}requestAnimationFrame(sampleVenue);auditObject.querySelector('.venue-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));void 0`);
      await until('venueAudit.done','the '+interaction.id+' sampled action must finish');
      const report=await run(`({id:auditObject.dataset.interaction,frames:venueAudit.frames.length,elapsed:venueAudit.frames.at(-1).at-venueAudit.frames[0].at,unique:new Set(venueAudit.frames.map(f=>f.signature)).size})`);
      assert.ok(report.frames>=31,JSON.stringify(report));assert.ok(report.elapsed>=600,JSON.stringify(report));assert.ok(report.unique>=31,JSON.stringify(report));samples.push(report);
    }
  });
  await check('callbacks are decorative and scene changes retain the original body node and visibility', async () => {
    assert.deepEqual(await run('bodyMutations'),[]);
    assert.equal(await run(`sentinel===document.getElementById('real-body-sentinel')&&getComputedStyle(sentinel).visibility==='visible'&&Number(getComputedStyle(sentinel).opacity)===1`),true);
    assert.ok(await run(`interactions.length>=15&&interactions.every(item=>['workshop','teahouse','observatory'].includes(item.venue)&&typeof item.id==='string'&&Number.isFinite(item.point.x)&&['pointer','keyboard'].includes(item.source))`));
    assert.equal(await run(`Number(getComputedStyle(document.querySelector('.venue-stage')).zIndex)<Number(getComputedStyle(document.getElementById('actors')).zIndex)`),true);
    assert.equal(await run(`getComputedStyle(document.querySelector('.venue-stage')).pointerEvents`),'none');
  });
  await check('destroy cancels pending images and actions, removes all controls and treats labels as text', async () => {
    await venue('teahouse',{reducedMotion:false});await press('teahouse-tea');
    await update({venue:'observatory'});
    await run(`window.detachedSelect=document.getElementById('venue-select');window.selectionCount=selections.length;controller.destroy();detachedSelect.value='workshop';detachedSelect.dispatchEvent(new Event('change',{bubbles:true}));void 0`);
    await pause(350);
    assert.equal(await run(`document.querySelectorAll('.venue-stage,.venue-feedback,.venue-chooser,.venue-art-buffer').length`),0);
    assert.equal(await run(`selections.length===selectionCount`),true);
    assert.equal(await run(`document.getElementById('room-art')===originalArt&&document.getElementById('real-body-sentinel')===sentinel`),true);
    await run(`window.safeModel=OfficeVenues;window.attack='<img src=x onerror="window.venueXss=true">';window.testCatalog=safeModel.CATALOG.map(v=>({...v,nameZh:attack,interactions:v.interactions.map(i=>({...i,labelZh:attack}))}));window.OfficeVenues={...safeModel,CATALOG:testCatalog,getVenue:id=>testCatalog.find(v=>v.id===id)||testCatalog[0]};window.controller=OfficeVenueStage.create({office:document.getElementById('office'),world:document.getElementById('world'),topbar:document.querySelector('.topbar'),getState:()=>({venue:'workshop',language:'zh',reducedMotion:true})});void 0`);
    assert.equal(await run(`document.querySelector('.venue-control-label').textContent===attack`),true);
    assert.equal(await run(`document.querySelectorAll('.venue-control img,.venue-chooser img').length`),0);
    assert.equal(await run(`Boolean(window.venueXss)`),false);
    await run(`controller.destroy();window.OfficeVenues=safeModel;void 0`);
    assert.deepEqual(await run('bodyMutations'),[]);
  });
  errors.push(...await run('testErrors'));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks,samples,errors,interactions:await run('interactions.length')}));
}).catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
