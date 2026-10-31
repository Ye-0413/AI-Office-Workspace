'use strict';
// Five real painted companions, isolated passive visual observations only.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const designs = require('../lib/agent-appearance.js').catalog;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-standby-animation-'));
app.setPath('userData', path.join(scratch, 'profile')); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win; const errors = [], run = code => win.webContents.executeJavaScript(code, true);
const guard = setTimeout(() => { console.error('Standby native animation timeout'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  const base = pathToFileURL(path.resolve(__dirname, '../renderer')).href + '/';
  const html = `<!doctype html><html><head><base href="${base}">${['style.css','avatar-performance.css','creature-performance.css','creature-activity.css','standby-animation.css'].map(name => '<link rel="stylesheet" href="' + name + '">').join('')}<style>
  html,body{margin:0;width:1100px;height:360px;overflow:hidden;background:#f2eadb;font-family:-apple-system,sans-serif;color:#514335}.cards{display:flex;gap:12px;padding:52px 22px 0}.card{position:relative;width:202px;height:270px;border:1px solid #d8c8ab;border-radius:14px;background:#fff7e8}.card h2{font-size:19px;margin:15px 14px}.card .character-body{position:absolute;left:24px;top:79px;overflow:visible;--avatar-presentation-scale:1.8}.card .label{position:absolute;left:12px;right:12px;bottom:15px;font-size:15px;text-align:center}.heading{position:absolute;top:16px;left:25px;font-size:17px}.subtitle{position:absolute;top:23px;right:28px;font-size:11px;color:#89765c}
  </style></head><body><div class="heading">待命 / Standing by</div><div class="subtitle">Synthetic observations · No work or success claim</div><main class="cards"></main>${['../lib/avatar-performance-model.js',...designs.map(d => 'repertoire-' + d.id + '.js'),'creature-repertoire.js','creature-activity.js','creature-performance.js','standby-animation.js'].map(name => '<script src="' + name + '"></script>').join('')}<script>
  window.entries=[];for(const design of ${JSON.stringify(designs)}){const node=document.createElement('section');node.className='card';node.dataset.bodyDesign=design.id;node.dataset.sessionId='standby-preview:'+design.id;node.innerHTML='<h2>'+design.labelEn+'</h2><div class="label">待命 · Standby</div>';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.src='../assets/avatars/'+design.asset;body.append(image);node.append(body);document.querySelector('.cards').append(node);const session={id:node.dataset.sessionId,status:'closed',closed:true,activity:'idle',turnCompletedAt:1000};const performance=OfficeCreaturePerformance.create({actorNode:node,body,image,session,design});performance.update(session,{standby:true});const standby=OfficeStandbyAnimation.create({actorNode:node,body,onPhaseChange:phase=>performance.update(session,{standby:true,standbyPhase:phase})});standby.update({standby:true});entries.push({node,body,session,performance,standby});}
  </script></body></html>`;
  const file = path.join(scratch, 'preview.html'); fs.writeFileSync(file, html);
  win = new BrowserWindow({ width: 1100, height: 360, useContentSize: true, show: true, focusable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', detail => { if (detail.level === 'error') errors.push(detail.message); });
  await win.loadFile(file);
  const end = Date.now() + 10000;
  while (!await run(`entries.every(e=>e.body.querySelector('.creature-performance').dataset.artState==='healthy')`)) { if (Date.now() > end) throw Error('Painted standby bodies did not load'); await pause(30); }
  assert.equal(await run(`entries.every(e=>e.body.querySelector('.creature-performance').dataset.pose===(e.standby.state.phase==='play'?'idle':'resting')&&e.standby.state.animations===3)`), true);
  const fixed = await run(`entries.map(e=>({box:e.node.getBoundingClientRect().toJSON(),label:e.node.querySelector('.label').getBoundingClientRect().toJSON(),session:JSON.stringify(e.session)}))`);
  await run(`window.owners=entries.map(e=>e.body.getAnimations({subtree:true}).filter(a=>a.effect?.target?.matches('.cp-shell,.standby-sleep,.standby-toy')));for(const e of entries)e.standby.update({standby:true,hidden:true});void 0`);
  const before = await run('owners.map(row=>row.map(a=>a.currentTime))'); await pause(160);
  assert.deepEqual(await run('owners.map(row=>row.map(a=>a.currentTime))'), before);
  await run(`for(const e of entries)e.standby.update({standby:true});void 0`);
  assert.equal(await run(`entries.every((e,i)=>owners[i].every(a=>e.body.getAnimations({subtree:true}).includes(a)))`), true, 'unhiding retains exact native owners');
  for (const phase of ['doze', 'play']) {
    await run(`(async()=>{for(const e of entries){while(e.standby.state.phase!==${JSON.stringify(phase)}){e.body.getAnimations({subtree:true}).find(a=>a.effect?.target===e.body.querySelector('.cp-shell')).finish();await Promise.resolve();}e.standby.update({standby:true,hidden:true});for(const a of e.body.getAnimations({subtree:true}).filter(a=>a.effect?.target?.matches('.cp-shell,.standby-sleep,.standby-toy')))a.currentTime=3000;}return true})()`);
    fs.writeFileSync('/tmp/office-standby-' + phase + '.png', (await win.webContents.capturePage()).toPNG());
    await run(`for(const e of entries)e.standby.update({standby:true});void 0`);
  }
  await run(`for(const e of entries)e.standby.update({standby:true,reducedMotion:true});void 0`);
  assert.equal(await run(`entries.every(e=>e.standby.state.phase==='static'&&e.standby.state.animations===0)`), true);
  await pause(50); const quietOne = (await win.webContents.capturePage()).toPNG(); await pause(160);
  assert.equal(quietOne.equals((await win.webContents.capturePage()).toPNG()), true, 'reduced standby remains a fixed tableau');
  assert.deepEqual(await run(`entries.map(e=>({box:e.node.getBoundingClientRect().toJSON(),label:e.node.querySelector('.label').getBoundingClientRect().toJSON(),session:JSON.stringify(e.session)}))`), fixed);
  await run(`for(const e of entries){e.standby.update({standby:true});e.standby.update({standby:false,walking:true});}void 0`);
  assert.equal(await run(`entries.every(e=>!e.standby.state.active&&!e.body.querySelector('.standby-decoration'))`), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, species: designs.length, nativePauseExact: true, reducedMotionStatic: true, workingArrivalCancels: true, observedSessionsUnchanged: true, previews: ['/tmp/office-standby-doze.png','/tmp/office-standby-play.png'], errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
