'use strict';
// Native visual phases use original capsule geometry, with no restricted art.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-clone-fx-'));
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
let win;const errors=[],checks=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=source=>win.webContents.executeJavaScript(source,true);
const guard=setTimeout(()=>{console.error('Clone choreography fixture timed out');app.exit(1);},30000);
app.whenReady().then(async()=>{
  const renderer=pathToFileURL(path.resolve(__dirname,'../renderer')).href+'/';
  fs.writeFileSync(path.join(scratch,'fixture.html'),`<!doctype html><html><head><base href="${renderer}"><link rel="stylesheet" href="clone-motion.css"><style>*{box-sizing:border-box}body{margin:0;background:#5f5142;font-family:sans-serif}.office{position:relative;width:1280px;height:720px;background:linear-gradient(#4d5045,#77644c)}.actor{position:absolute;left:550px;top:420px;width:0;height:0;isolation:isolate;--family-color:#b58ac4;transform:scale(2);transform-origin:0 0}.body{position:absolute;left:-45px;top:-78px;width:90px;height:76px}.nameplate{position:absolute;left:-64px;top:4px;width:128px;border:1px solid #bcaa85;border-radius:4px;background:#efe2c5;color:#56422e;text-align:center;font:10px/18px sans-serif}.legend{position:absolute;left:50px;top:55px;color:#efdfbd;font-size:20px}</style></head><body><main class="office"><div class="legend">凝影 · 实体分出 · 收束归位</div><div id="parent" class="actor"><svg class="body" viewBox="0 0 90 76" aria-hidden="true"><rect x="18" y="12" width="54" height="43" rx="8" fill="#b58ac4" stroke="#4f3b4b"/><path d="M24 54v12h8V54m26 0v12h8V54" fill="#9c7bab"/><path d="M8 33h12v14H8m62-14h12v14H70" fill="#d1bc8e" stroke="#5c4c3a" stroke-width="2"/><path d="M32 26v9m24-9v9" stroke="#362d32" stroke-width="5"/></svg><div class="nameplate">紫霄朱雀 · 主 Agent</div></div></main><script src="clone-motion.js"></script><script>window.parentActor=document.getElementById('parent');window.originalBody=parentActor.firstElementChild;window.originalBodyHTML=originalBody.outerHTML;</script></body></html>`);
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,...args)=>{const detail=args[0];if(typeof detail==='object'&&detail.level==='error')errors.push(detail.message);});
  await win.loadFile(path.join(scratch,'fixture.html'));
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  assert.equal(await run('document.hidden'),false);
  for(const kind of ['split','absorb']){
    const report=await run(`(async()=>{const started=performance.now(),effect=OfficeCloneMotion.burst({anchor:parentActor,kind:${JSON.stringify(kind)},ownerId:'fixture:child'}),node=parentActor.querySelector('.clone-effect');window.activeClone=effect;const poses=new Set(),bad=[];let frames=0,readyAt=null;effect.ready.then(value=>{if(value)readyAt=performance.now()-started});let sampling=true;const sample=now=>{if(!sampling)return;frames++;poses.add(JSON.stringify([...node.children].map(n=>[getComputedStyle(n).transform,getComputedStyle(n).opacity])));if(parentActor.firstElementChild!==originalBody||originalBody.outerHTML!==originalBodyHTML||Number(getComputedStyle(parentActor).opacity)!==1)bad.push('parent changed');requestAnimationFrame(sample)};requestAnimationFrame(sample);const finished=await effect.finished;sampling=false;return{frames,distinct:poses.size,readyAt,duration:performance.now()-started,finished,bad:[...new Set(bad)],remaining:parentActor.querySelectorAll('.clone-effect').length,networkImages:parentActor.querySelectorAll('img,image').length}})()`);
    assert.equal(report.finished,true);assert.ok(report.frames>=31,JSON.stringify(report));assert.ok(report.distinct>=31,JSON.stringify(report));assert.deepEqual(report.bad,[]);assert.equal(report.remaining,0);assert.equal(report.networkImages,0);assert.ok(report.duration>=880&&report.duration<1500);
    const expected=kind==='split'?300:680;assert.ok(report.readyAt>=expected-20&&report.readyAt<expected+150,JSON.stringify(report));
    checks.push({kind,...report});
    if(process.env.MINI_OFFICE_CLONE_PREVIEW_DIR){
      await run(`window.previewClone=OfficeCloneMotion.burst({anchor:parentActor,kind:${JSON.stringify(kind)}});void 0`);await wait(kind==='split'?380:610);
      fs.mkdirSync(process.env.MINI_OFFICE_CLONE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_CLONE_PREVIEW_DIR,kind+'.png'),(await win.webContents.capturePage()).toPNG());
      await run(`previewClone.cancel();void 0`);
    }
  }
  const cancelled=await run(`(async()=>{const effect=OfficeCloneMotion.burst({anchor:parentActor});effect.cancel();effect.cancel();return{ready:await effect.ready,finished:await effect.finished,count:parentActor.querySelectorAll('.clone-effect').length}})()`);
  assert.deepEqual(cancelled,{ready:false,finished:false,count:0});
  for(const setting of ['reducedMotion','lowPower','hidden']){
    const stopped=await run(`(async()=>{const effect=OfficeCloneMotion.burst({anchor:parentActor});document.querySelector('.office').dataset.${setting}='true';await Promise.resolve();const answer={ready:await effect.ready,finished:await effect.finished,count:parentActor.querySelectorAll('.clone-effect').length};delete document.querySelector('.office').dataset.${setting};return answer})()`);
    assert.deepEqual(stopped,{ready:false,finished:false,count:0});
  }
  const removed=await run(`(async()=>{const effect=OfficeCloneMotion.burst({anchor:parentActor});parentActor.remove();await Promise.resolve();return{ready:await effect.ready,finished:await effect.finished,count:parentActor.querySelectorAll('.clone-effect').length}})()`);
  assert.deepEqual(removed,{ready:false,finished:false,count:0});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks,interruptions:['idempotent cancel','live quiet flags','anchor removal'],errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
