'use strict';
// Synthetic observations use the real page, family allocator and local artwork.
// No provider setup, tool approval, model message or other work IPC is sent.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Appearance = require('../lib/agent-appearance.js');
const { createSettings } = require('../lib/settings.cjs');
const DISPLAY_SCALE = .65;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-families-'));
app.setPath('userData', path.join(scratch, 'profile')); app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-color-profile', 'srgb');
fs.writeFileSync(path.join(scratch, 'settings.json'), JSON.stringify({ language: 'zh', agentAppearance: 'original', agentScale: DISPLAY_SCALE, reducedMotion: true, idleVisitor: false, roomDesign: 'legacy', sceneTime: 'morning' }));
const settingStore = createSettings(scratch);
let win, settings = settingStore.get();
assert.equal(settings.agentAppearance, 'mixed', 'retired choices migrate to the scene policy');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], calls = [], checks = [], expectedFailures = [];
const activities = ['planning', 'coding', 'waiting-tool', 'designing', 'waiting-user'];
const task = (id, patch = {}) => ({ id, sessionId: id, provider: 'codex', title: 'Family creature fixture', activity: 'coding', status: 'active', activeTools: 1, lastEventAt: Date.now(), events: [], projectPath: '/fixture/families', ...patch });
const roots = Array.from({ length: 6 }, (_, index) => task((index === 4 ? 'claude:' : 'codex:') + 'family-main-' + String(index).padStart(2, '0'), { provider: index === 4 ? 'claude-code' : 'codex', activity: activities[index % activities.length] }));
const helpers = [task('codex:family-helper', { parentId: roots[0].id, activity: 'reading' }), task('codex:family-grandchild', { parentId: 'codex:family-helper', activity: 'testing' }), task('claude:family-helper', { provider: 'claude-code', parentId: roots[4].id, activity: 'reading' })];
let observed = [...roots.slice(0, 5), ...helpers], snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [] };
const run = source => win.webContents.executeJavaScript(source, true);
async function until(source, message, ms = 18000) { const end = Date.now() + ms; while (Date.now() < end) { if (await run(source)) return; await wait(40); } throw Error(message + ': ' + JSON.stringify(await run(`({actors:[...document.querySelectorAll('.actor[data-session-id]')].map(n=>{const actor=window.familyActors?.get(n.dataset.sessionId);return{id:n.dataset.sessionId,key:n.dataset.bodyAppearance,phase:n.dataset.clonePhase,pose:n.querySelector('.creature-performance')?.dataset.pose,activity:n.querySelector('.cp-activity')?.dataset.activity,health:n.querySelector('.creature-performance')?.dataset.artState,pendingStation:Boolean(actor?.pendingStation),navigation:actor?.navigation?.kind,motion:Boolean(actor?.motion)};}),error:document.getElementById('error-message').textContent,clocks:(window.retainedClocks||[]).map(a=>({name:a.animationName,state:a.playState,id:a.effect?.target?.closest('.actor')?.dataset.sessionId,target:a.effect?.target?.getAttribute('class'),connected:a.effect?.target?.isConnected,walking:a.effect?.target?.closest('.actor')?.dataset.walking,layer:a.effect?.target?.closest('.creature-performance')?.dataset.animate,time:a.currentTime}))})`))); }
async function publish(next = observed, extra = {}) { observed = next; snapshot = { ...snapshot, sessions: next, now: Date.now(), ...extra }; win.webContents.send('office:snapshot', snapshot); await wait(100); }
async function ready(count) { await until(`document.querySelectorAll('.actor[data-session-id]').length===${count}&&[...document.querySelectorAll('.actor[data-session-id]')].every(n=>getComputedStyle(n).visibility!=='hidden'&&n.querySelector('.creature-performance')?.dataset.artState==='healthy')`, 'Every real fixture identity must have a visible healthy creature'); assert.equal(settings.agentScale, DISPLAY_SCALE); assert.equal(await run(`Number(document.getElementById('office').dataset.fitScale)`), DISPLAY_SCALE, 'family count never changes the selected manual scale'); }
async function capture(name, rect) { if (!process.env.MINI_OFFICE_PREVIEW_DIR) return; await wait(120); fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, name + '.png'), (await win.webContents.capturePage(rect)).toPNG()); }
const rows = () => run(`[...document.querySelectorAll('.actor[data-session-id]')].map(node=>{const body=node.querySelector('.character-body'),rig=body.querySelector('.ap-rig'),m=rig.getScreenCTM();return{id:node.dataset.sessionId,helper:node.dataset.helper==='true',family:node.dataset.family,key:node.dataset.bodyAppearance,base:node.dataset.bodyDesign,variant:Number(node.dataset.bodyVariant),filter:getComputedStyle(body.querySelector('.cp-art')).filter,toolFilter:getComputedStyle(body.querySelector('.cp-activity')).filter,color:node.style.getPropertyValue('--family-color'),scale:Math.hypot(m.a,m.b)};})`);
function assertFamilies(records) { const byId = new Map(records.map(row => [row.id, row])); for (const helper of helpers) { const child = byId.get(helper.id), root = byId.get(helper.provider === 'claude-code' ? roots[4].id : roots[0].id); assert.equal(child.key, root.key); assert.equal(child.filter, root.filter); assert.equal(child.toolFilter, root.toolFilter); assert.equal(child.color, root.color); assert.equal(child.family, root.id); assert.ok(Math.abs(child.scale / root.scale - .656) < .001, 'every helper, including a nested one, is smaller by the same physical ratio'); } }
const watchdog = setTimeout(() => { console.error('Family appearance fixture exceeded 90 seconds'); app.exit(2); }, 90000);
app.whenReady().then(async () => {
  const handlers = { snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => { calls.push(patch); return (settings = settingStore.set(patch)); }, displays: () => [] };
  for (const [name, action] of Object.entries(handlers)) ipcMain.handle('office:' + name, (_event, ...args) => action(...args));
  for (const name of ['connect', 'disconnect', 'setup-initialize', 'answer-question', 'open-source']) ipcMain.handle('office:' + name, () => { errors.push('Unexpected work IPC: ' + name); return { ok: true }; });
  ipcMain.on('office:renderer-error', (_event, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (detail, callback) => { errors.push('Unexpected network: ' + detail.url); callback({ cancel: true }); });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await run(`window.familyActors=new Map();document.getElementById('office').addEventListener('office:actor-arrival',event=>familyActors.set(event.detail.actorId,event.detail.actor));window.familyHandles=new Map();window.nativeCreate=OfficeAvatarPerformance.create;window.OfficeAvatarPerformance={...OfficeAvatarPerformance,create(options){const controller=nativeCreate(options);familyHandles.set(options.session.id,{controller,...options});return controller;}};void 0`);
  await publish(); await ready(8);
  let records = await rows(); assertFamilies(records);
  const firstMains = records.filter(row => !row.helper);
  assert.equal(new Set(firstMains.map(row => row.base)).size, 5);
  assert.ok(firstMains.every(row => row.variant === 0 && row.filter === 'none'));
  assert.equal(await run(`document.querySelectorAll('.actor[data-body-design="original"]').length`), 0);
  await capture('workshop-creatures-room');
  await run(`window.initialBodies=[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({node,id:node.dataset.sessionId,key:node.dataset.bodyAppearance,rig:node.querySelector('.ap-rig'),source:node.querySelector('.ap-rig defs image')}));document.getElementById('settings-button').click();void 0`);
  assert.equal(await run(`document.querySelectorAll('.appearance-card').length`), 5);
  assert.equal(await run(`document.querySelector('.appearance-creatures').querySelector('button,input,select')===null`), true, 'the gallery does not assign a fixed body to all families');
  assert.equal(await run(`[...document.querySelectorAll('.appearance-pose-preview')].every(n=>{const image=n.querySelector('img');return getComputedStyle(n).overflow==='hidden'&&image.complete&&image.naturalWidth===1536&&image.naturalHeight===1024&&parseFloat(image.style.width)===300&&parseFloat(image.style.height)===200;})`), true);
  win.setContentSize(1280, 1200); await wait(120); await run(`document.querySelector('.appearance-setting').scrollIntoView({block:'start',behavior:'instant'});void 0`); await capture('workshop-creatures-picker');
  win.setContentSize(1280, 720); await wait(120); await run(`document.querySelector('#settings-dialog [data-close-dialog]').click();void 0`);
  checks.push('five initial mains have distinct base creatures; direct, nested and Claude helpers inherit the exact shape and colour at 65.6% body scale; gallery is read-only');

  await publish([...roots, ...helpers]); await ready(9);
  records = await rows(); assertFamilies(records);
  const mains = records.filter(row => !row.helper), allocated = new Map(mains.map(row => [row.id, row.key]));
  assert.equal(mains.length, 6); assert.equal(new Set(mains.map(row => row.key)).size, 6);
  assert.equal(mains.filter(row => row.variant > 0).length, 1);
  for (const initial of firstMains) assert.equal(allocated.get(initial.id), initial.key);
  assert.ok(mains.filter(row => row.variant > 0).every(row => row.filter !== 'none'));
  assert.equal(await run(`initialBodies.every(({node,id,key,rig,source})=>node.isConnected&&node.dataset.sessionId===id&&node.dataset.bodyAppearance===key&&node.querySelector('.ap-rig')===rig&&node.querySelector('.ap-rig defs image')===source)`), true);
  await capture('workshop-creatures-overflow');
  await publish(observed.slice().reverse().map(session => ({ ...session, title: 'Metadata refresh', lastEventAt: Date.now() })));
  for (const row of (await rows()).filter(row => !row.helper)) assert.equal(row.key, allocated.get(row.id), 'metadata and reorder cannot reroll a visible family');
  checks.push('six mains stay at the exact manual size with six unique shape-plus-colour keys; overflow is tinted and existing families retain their exact allocation and source');

  const retired = roots[3], freed = allocated.get(retired.id);
  await publish(observed.map(session => session.id === retired.id ? { ...session, closed: true, status: 'closed', activity: 'idle', activeTools: 0, turnCompletedAt: Date.now() } : session));
  await until(`document.querySelector('[data-session-id="${retired.id}"]')?.dataset.standby==='true'`, 'An ended main retains its real appearance while standing by');
  assert.equal((await rows()).find(row => row.id === retired.id).key, freed);
  const arrival = task('codex:family-arrival-trigger', { activity: 'reading' });
  await publish([...observed, arrival]);
  await until(`!document.querySelector('[data-session-id="${retired.id}"]')`, 'A retiring family must release its slot only after the real body leaves');
  await ready(9);
  const replacement = task('codex:family-replacement', { activity: 'reading' });
  await publish([...observed.filter(session => session.id !== retired.id).map(session => session.id === arrival.id ? { ...session, closed: true, status: 'closed', activity: 'idle', activeTools: 0, turnCompletedAt: Date.now() } : session), replacement]);
  await until(`!document.querySelector('[data-session-id="${arrival.id}"]')`, 'Another fresh worker lets the temporary arriving family leave');
  await publish(observed.filter(session => session.id !== arrival.id)); await ready(9);
  records = await rows(); assertFamilies(records);
  assert.equal(records.find(row => row.id === replacement.id).key, freed, 'a departed base slot can be reused');
  for (const row of records.filter(row => !row.helper && row.id !== replacement.id)) assert.equal(row.key, allocated.get(row.id));
  assert.equal(new Set(records.filter(row => !row.helper).map(row => row.key)).size, 6);
  checks.push('an ended main keeps its appearance while standing by; a fresh observed root triggers its physical exit and the released base is reused without changing another live family');

  await run(`window.resumedHelperBody=document.querySelector('[data-session-id="${helpers[0].id}"]');window.resumedHelperRig=resumedHelperBody.querySelector('.ap-rig');window.resumedHelperSource=resumedHelperRig.querySelector('defs image');void 0`);
  await publish(observed.filter(session => session.id !== helpers[0].id));
  const retainedAcrossAbsence = await run(`resumedHelperBody.isConnected`);
  const resumedHelper = { ...helpers[0], activity: 'testing', lastEventAt: Date.now() };
  delete resumedHelper.parentId;
  await publish([...observed, resumedHelper]); await ready(9);
  assertFamilies(await rows());
  assert.equal(Object.hasOwn(resumedHelper, 'parentId'), false, 'the local view must not rewrite the incoming provider record');
  const resumedBody = `document.querySelector('[data-session-id="${helpers[0].id}"]')`;
  assert.equal(await run(`${resumedBody}.dataset.sessionId===${JSON.stringify(helpers[0].id)}&&${resumedBody}.dataset.helper==='true'`), true);
  if (retainedAcrossAbsence) assert.equal(await run(`${resumedBody}===resumedHelperBody&&resumedHelperBody.querySelector('.ap-rig')===resumedHelperRig&&resumedHelperBody.querySelector('.ap-rig defs image')===resumedHelperSource`), true, 'a body retained across absence also retains its original render objects on resumption');
  checks.push('an omitted helper can resume with the same real ID and no parent field; its previously observed ancestry restores the small matching family body without mutating provider input');

  await run(`document.getElementById('setting-reducedMotion').checked=false;document.getElementById('setting-reducedMotion').dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  // Disabling quiet mode can leave a stationary body with a delayed station
  // route. Its later locomotion correctly replaces work CSS animations. Wait
  // for the actual route owners to drain before testing hidden work clocks.
  await until(`[...document.querySelectorAll('.actor[data-session-id]')].every(node=>{const actor=familyActors.get(node.dataset.sessionId);return actor?.node===node&&!actor.entryPending&&!actor.pendingStation&&!actor.navigation&&!actor.motion&&!actor.routeReservation&&!actor.yielding&&node.dataset.walking!=='true';})`, 'Every real station route drains before capturing stationary work clocks', 25000);
  await until(`[...document.querySelectorAll('.creature-performance')].some(layer=>layer.getAnimations({subtree:true}).some(a=>a.playState==='running'))`, 'Visible work must have material motion');
  await run(`window.retainedClocks=[...document.querySelectorAll('.creature-performance')].flatMap(layer=>layer.getAnimations({subtree:true})).filter(a=>typeof a.animationName==='string');void 0`);
  await publish(undefined, { windowVisibility: { hidden: true } }); await wait(100);
  assert.equal(await run(`retainedClocks.length>0&&retainedClocks.every(a=>a.playState==='paused')`), true);
  const heldTimes = await run(`retainedClocks.map(a=>a.currentTime)`); await wait(100); assert.deepEqual(await run(`retainedClocks.map(a=>a.currentTime)`), heldTimes);
  await publish(undefined, { windowVisibility: { hidden: false } }); await until(`retainedClocks.every(a=>a.playState==='running')`, 'Showing resumes the same original clocks');
  await run(`document.getElementById('setting-lowPower').checked=true;document.getElementById('setting-lowPower').dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`[...document.querySelectorAll('.creature-performance')].every(layer=>layer.dataset.animate==='false'&&getComputedStyle(layer).display!=='none')`, 'Low power retains visible still poses');
  checks.push('native hiding preserves paused clock identity and exact time; showing resumes them; low power keeps all real family bodies visible');

  const rootId = JSON.stringify(roots[0].id);
  await run(`window.healthHandle=familyHandles.get(${rootId});window.healthDesign=healthHandle.design;window.healthRig=healthHandle.body.querySelector('.ap-rig');window.healthSource=healthRig.querySelector('defs image');healthSource.setAttribute('href','../assets/avatars/workshop-missing-fixture.png');void 0`);
  await until(`healthHandle.body.querySelector('.creature-performance').dataset.artState==='failed'`, 'Missing local art must show the neutral fallback');
  assert.equal(await run(`Number(getComputedStyle(healthHandle.body.querySelector('.cp-neutral')).opacity)>.99&&!healthHandle.body.querySelector('.avatar-native-fallback')`), true); expectedFailures.push('workshop-missing-fixture.png');
  await run(`if(!healthHandle.controller.retry(Date.now()+3101))throw Error('Failed original source must permit one trusted retry');void 0`); await until(`healthHandle.body.querySelector('.creature-performance').dataset.artState==='healthy'`, 'Local art recovers');
  assert.equal(await run(`healthHandle.body.querySelector('.ap-rig')===healthRig&&healthHandle.body.querySelector('defs image')===healthSource`), true);
  await run(`document.getElementById('language-button').click();void 0`); await until(`document.getElementById('appearance-title').textContent==='Workshop companions'`, 'Read-only gallery follows the language');
  assert.doesNotMatch(await run(`document.querySelector('.appearance-setting').textContent`), /\p{Script=Han}/u);
  assert.ok(calls.every(patch => Object.keys(patch).every(key => ['language', 'reducedMotion', 'lowPower'].includes(key))));

  // The preceding six-family scene has already certified overflow colour,
  // retirement, health and clocks. Its unrelated families stand by until the
  // next real observations arrive, retaining the exact parent/helper bodies.
  const ancestryIds = new Set([roots[0].id, roots[4].id, ...helpers.map(helper => helper.id)]);
  await publish(observed.map(session => ancestryIds.has(session.id) ? session : { ...session, status: 'closed', closed: true, activity: 'idle', activeTools: 0, turnCompletedAt: Date.now() }));
  const waitingIds = observed.filter(session => !ancestryIds.has(session.id)).map(session => session.id);
  await until(`${JSON.stringify(waitingIds)}.every(id=>document.querySelector('[data-session-id="'+id+'"]')?.dataset.standby==='true')`, 'Completed unrelated families wait visibly for new activity');

  const unseenParent = task('codex:family-unseen-parent', { activity: 'planning' });
  const orphans = [task('codex:family-unseen-one', { parentId: unseenParent.id }), task('codex:family-unseen-two', { parentId: unseenParent.id })];
  const lateChild = task('codex:family-late-link', { activity: 'reading' });
  await publish([...observed.filter(session => ancestryIds.has(session.id)), ...orphans, lateChild]); await ready(8);
  const beforeParent = await rows(), orphanKey = beforeParent.find(row => row.id === orphans[0].id).key;
  assert.equal(beforeParent.find(row => row.id === orphans[1].id).key, orphanKey, 'reported siblings share their unseen true parent immediately');
  assert.ok(!beforeParent.filter(row => !row.helper && row.id !== lateChild.id).some(row => row.key === orphanKey), 'the unseen family reserves its own appearance');
  await run(`window.orphanBodies=${JSON.stringify(orphans.map(row => row.id))}.map(id=>{const node=document.querySelector('[data-session-id="'+id+'"]');return{node,id,rig:node.querySelector('.ap-rig'),source:node.querySelector('.ap-rig defs image')};});void 0`);
  await publish([...observed, unseenParent]); await ready(9);
  const afterParent = await rows(), presentParent = afterParent.find(row => row.id === unseenParent.id);
  assert.equal(presentParent.key, orphanKey, 'arrival of the true parent cannot reroll its existing helper family');
  for (const orphan of orphans) { const row = afterParent.find(row => row.id === orphan.id); assert.equal(row.key, presentParent.key); assert.equal(row.filter, presentParent.filter); assert.ok(Math.abs(row.scale / presentParent.scale - .656) < .001); }
  assert.equal(await run(`orphanBodies.every(({node,id,rig,source})=>node.isConnected&&node.dataset.sessionId===id&&node.querySelector('.ap-rig')===rig&&node.querySelector('.ap-rig defs image')===source)`), true);
  // Late ancestry is also real evidence when the same snapshot closes a task.
  // Observe that retiring body before it rejoins; it must already be a small
  // member of the proven parent family rather than retain its old main size.
  await run(`for(const id of ['setting-reducedMotion','setting-lowPower']){const input=document.getElementById(id);input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));}void 0`);
  await until(`document.querySelector('[data-session-id="${lateChild.id}"]')?.dataset.walking!=='true'`, 'The late-link body reaches its observed seat');
  await run(`window.lateBody=document.querySelector('[data-session-id="${lateChild.id}"]');window.lateRig=lateBody.querySelector('.ap-rig');void 0`);
  await publish(observed.map(session => session.id === lateChild.id ? { ...session, parentId: roots[0].id, status: 'closed', closed: true, activity: 'idle', activeTools: 0, turnCompletedAt: Date.now() } : session));
  assert.equal(await run(`(()=>{const parent=document.querySelector('[data-session-id="${roots[0].id}"]'),scale=n=>{const m=n.querySelector('.ap-rig').getScreenCTM();return Math.hypot(m.a,m.b);};return lateBody.isConnected&&lateBody.querySelector('.ap-rig')===lateRig&&lateBody.dataset.helper==='true'&&lateBody.dataset.bodyAppearance===parent.dataset.bodyAppearance&&Math.abs(scale(lateBody)/scale(parent)-.656)<.001;})()`), true, 'late-parent evidence updates the actual retiring body before departure');
  checks.push('two helpers reserve the same unseen parent appearance; the parent later joins without replacing them; late ancestry plus closure shrinks and matches the real retiring body');

  // Compare real native pixels, not only filter strings. Cream paper needs a
  // visible change even though the unmodified material has little chroma.
  const pixelRects = await run(`(()=>{const overlay=document.createElement('div');overlay.id='variant-pixel-fixture';Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'10000',display:'grid',placeItems:'center',background:'#eee4ce'});const stage=document.createElement('div');Object.assign(stage.style,{display:'flex',width:'800px',height:'380px'});overlay.append(stage);document.body.append(overlay);window.pixelSpecimens=[];for(const variantIndex of [0,1]){const card=document.createElement('div');Object.assign(card.style,{position:'relative',width:'400px',height:'380px',background:'#eee4ce'});const body=document.createElement('span');body.className='character-body';Object.assign(body.style,{position:'absolute',left:'123px',top:'140px',overflow:'visible'});body.style.setProperty('--avatar-presentation-scale','3');const image=document.createElement('img');body.append(image);card.append(body);stage.append(card);const design={...OfficeAgentAppearance.catalog.find(d=>d.id==='folio'),variantIndex,appearanceKey:'folio:'+variantIndex};const controller=OfficeCreaturePerformance.create({actorNode:card,body,image,design,session:{id:'fixture:pixel:'+variantIndex}});controller.update({id:'fixture:pixel:'+variantIndex,status:'active',activity:'unknown'},{now:0,reducedMotion:true});pixelSpecimens.push({card,body,controller});}return pixelSpecimens.map(({card})=>{const r=card.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:400,height:380};});})()`);
  await until(`pixelSpecimens.every(item=>item.body.querySelector('.creature-performance').dataset.artState==='healthy')`, 'Pixel specimen sheets decode'); await wait(120);
  const images = [];
  for (const rect of pixelRects) images.push(await win.webContents.capturePage(rect));
  const buffers = images.map(image => image.toBitmap()); assert.equal(buffers[0].length, buffers[1].length);
  let foreground = 0, delta = 0, changed = 0;
  for (let offset = 0; offset < buffers[0].length; offset += 4) {
    const a = [buffers[0][offset + 2], buffers[0][offset + 1], buffers[0][offset]], b = [buffers[1][offset + 2], buffers[1][offset + 1], buffers[1][offset]];
    if (a.reduce((sum, value, index) => sum + Math.abs(value - [238,228,206][index]), 0) <= 45) continue;
    foreground++; const distance = a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0); delta += distance / 3; if (distance > 24) changed++;
  }
  const pixelDifference = { foreground, meanChannelDifference: delta / foreground, changedFraction: changed / foreground };
  assert.ok(foreground > 2000, JSON.stringify(pixelDifference)); assert.ok(pixelDifference.meanChannelDifference >= 8 && pixelDifference.changedFraction >= .5, 'Folio variant must visibly recolour the material: ' + JSON.stringify(pixelDifference));
  await capture('workshop-folio-variants', { x: pixelRects[0].x, y: pixelRects[0].y, width: 800, height: 380 });
  await run(`pixelSpecimens.forEach(item=>item.controller.destroy());document.getElementById('variant-pixel-fixture').remove();void 0`);
  checks.push('native foreground pixels prove the low-chroma Folio overflow variant is visibly different');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, roots: 6, nestedHelpers: 3, checks, pixelDifference, expectedFailures, errors, previewDirectory: process.env.MINI_OFFICE_PREVIEW_DIR || null }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
