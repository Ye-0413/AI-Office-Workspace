'use strict';
// Actual observer UI lifecycle crossings, isolated from provider configuration.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-clone-recovery-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'zh',agentScale:.65,sceneTheme:'spring',sceneWeather:'off',reducedMotion:false,idleVisitor:false};
let snapshot={mode:'live',now:Date.now(),connections:[],sessions:[]};
const errors=[],checks=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
const task=(id,parentId)=>({id:'codex:recovery-'+id,sessionId:'recovery-'+id,provider:'codex',parentId,status:'active',activity:'coding',activeTools:1,lastEventAt:Date.now(),events:[],projectPath:'/fixture/clone-recovery'});
const root=task('root'),helper=id=>task(id,root.id);
const run=source=>win.webContents.executeJavaScript(source,true);
const query=id=>`document.querySelector('.actor[data-session-id="${id}"]')`;
function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
async function until(code,label,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await run(code))return;await pause(20);}throw Error(label+' '+JSON.stringify(await run(`({error:document.getElementById('error-message').textContent,actors:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,traffic:n.dataset.traffic,phase:n.dataset.clonePhase,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity}))})`)));}
const settled=id=>`${query(id)}&&getComputedStyle(${query(id)}).visibility!=='hidden'&&${query(id)}.dataset.traffic==='arrived'&&${query(id)}.dataset.walking!=='true'&&!['splitting','returning','absorbing'].includes(${query(id)}.dataset.clonePhase)`;
const stopped=actor=>({...actor,status:'idle',activity:'idle',activeTools:0,lastEventAt:Date.now(),turnCompletedAt:Date.now()});
const guard=setTimeout(()=>{console.error('Clone recovery fixture timed out');app.exit(1);},180000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  let child=helper('one');snapshot.sessions=[root,child];
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await run(`window.recoveryActors=new Map();document.getElementById('office').addEventListener('office:actor-arrival',event=>recoveryActors.set(event.detail.actorId,event.detail.actor));void 0`);
  await until(`${settled(root.id)}&&${settled(child.id)}`,'root and helper must physically reach their initial stations');
  await run(`window.originalRecoveryRoot=${query(root.id)};window.originalRootRig=originalRecoveryRoot.querySelector('.ap-rig');window.rootAnchor=new DOMMatrixReadOnly(getComputedStyle(originalRecoveryRoot).transform);void 0`);
  send([child]);await until(`${query(root.id)}?.dataset.cloneHold==='true'`,'an absent main waits for its active child');
  send([{...root,lastEventAt:Date.now()+1},child]);await until(`${query(root.id)}?.dataset.cloneHold==='false'`,'a restored active main must revoke its old retirement');
  send([{...root,lastEventAt:Date.now()+2},stopped(child)]);await until(`!${query(child.id)}`,'the first helper must finish its physical return and absorption');
  assert.equal(await run(`!!${query(child.id)}`),false);assert.equal(await run(`${query(root.id)}===originalRecoveryRoot&&originalRecoveryRoot.querySelector('.ap-rig')===originalRootRig&&Number(getComputedStyle(originalRecoveryRoot).opacity)>.99`),true);
  assert.equal(await run(`originalRecoveryRoot.querySelector('.actor-state').textContent.includes('等分身')`),false);checks.push('same-ID main resumes and survives its formerly active child finishing');
  child=helper('grow');send([root,child]);await until(settled(child.id),'next helper must physically reach its station');
  await run(`window.growingHelper=${query(child.id)};void 0`);
  const beforeWidth=await run(`growingHelper.querySelector('.nameplate').offsetWidth`);
  const grownWidth=beforeWidth+32;
  await win.webContents.insertCSS(`html[lang="en"] .actor .nameplate{width:${grownWidth}px!important;min-width:${grownWidth}px!important;max-width:${grownWidth}px!important}`);
  const end=stopped(child);send([root,end]);await until(`${query(child.id)}?.dataset.clonePhase==='returning'`,'helper must own its finite return');
  await pause(120);await run(`document.getElementById('language-button').click();void 0`);
  await until(`document.documentElement.lang==='en'`,'language switch must reach the real UI');
  const afterWidth=await run(`growingHelper.querySelector('.nameplate').offsetWidth`);assert.ok(afterWidth>beforeWidth+5,'fixture must cause a real measured nameplate growth '+JSON.stringify({beforeWidth,afterWidth,details:await run(`({lang:document.documentElement.lang,connected:growingHelper.isConnected,width:getComputedStyle(growingHelper.querySelector('.nameplate')).width,style:[...document.querySelectorAll('style')].map(n=>n.textContent)})`)}));
  await pause(100);assert.equal(await run(`${query(child.id)}===growingHelper`),true,'measurement must retain a return that has not finished');
  await until(`!${query(child.id)}`,'measured growth must not orphan the physical return owner');assert.equal(await run(`${query(root.id)}===originalRecoveryRoot`),true);checks.push({name:'measured nameplate growth preserves the physical helper return',beforeWidth,afterWidth});
  child=helper('size');send([root,child]);await until(settled(child.id),'size fixture helper must reach its station');
  await run(`window.sizingHelper=${query(child.id)};void 0`);send([root,stopped(child)]);await until(`${query(child.id)}?.dataset.clonePhase==='returning'`,'size fixture must enter returning');
  // A maximum-size preference cannot claim the finite owner's old geometry.
  // It is saved now, while the actual return finishes at its proved size.
  await pause(120);await run(`(()=>{const n=document.getElementById('setting-agentScale');n.value='135';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(180);assert.equal(await run(`${query(child.id)}===sizingHelper`),true,'size preferences must not prematurely remove the returning body');
  assert.equal(settings.agentScale,1.35);
  assert.equal(await run(`document.getElementById('office').dataset.sizePending`),'true');
  assert.equal(await run(`document.getElementById('office').dataset.fitScale`),'0.6500');
  const frames=await run(`new Promise(resolve=>{let frames=0,finiteFrames=0,previous=null;const start=performance.now(),bad=[];function tick(now){frames++;const n=${query(root.id)},child=${query(child.id)},m=n&&new DOMMatrixReadOnly(getComputedStyle(n).transform);if(child){finiteFrames++;if(n!==originalRecoveryRoot||n.querySelector('.ap-rig')!==originalRootRig||Number(getComputedStyle(n).opacity)<.99)bad.push('root identity/visibility');if(previous&&Math.hypot(m.m41-previous.x,m.m42-previous.y)>400*(now-previous.at)/1000+4)bad.push('root foot cut');previous={x:m.m41,y:m.m42,at:now};}if(now-start<900)requestAnimationFrame(tick);else resolve({frames,finiteFrames,bad:[...new Set(bad)]});}requestAnimationFrame(tick);})`);
  assert.ok(frames.finiteFrames>=31,JSON.stringify(frames));assert.deepEqual(frames.bad,[]);await until(`!${query(child.id)}`,'size preference must preserve eventual absorption');
  await until(`${settled(root.id)}&&document.getElementById('office').dataset.fitScale==='1.3500'&&document.getElementById('office').dataset.sizePending==='false'`,'maximum requested size gets its fresh admission after the finite return');
  checks.push({name:'maximum size is saved, deferred through the finite owner, then safely admitted',...frames});
  await run(`(()=>{const n=document.getElementById('setting-agentScale');n.value='65';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`${settled(root.id)}&&document.getElementById('office').dataset.fitScale==='0.6500'`,'restore a two-body size for the following independent recovery cases');
  await run(`window.originalRecoveryRoot=${query(root.id)};window.originalRootRig=originalRecoveryRoot.querySelector('.ap-rig');void 0`);
  child=helper('uncertain');send([root,child]);await until(settled(child.id),'uncertain fixture helper must physically arrive');
  await run(`window.uncertainHelper=${query(child.id)};window.uncertainRig=uncertainHelper.querySelector('.ap-rig');void 0`);
  send([{...child,status:'stale',lastEventAt:Date.now()}]);await until(`${query(root.id)}?.dataset.cloneHold==='true'`,'absent main must retain the uncertain descendant anchor');await pause(1400);
  assert.equal(await run(`${query(child.id)}===uncertainHelper&&uncertainHelper.querySelector('.ap-rig')===uncertainRig&&Number(getComputedStyle(uncertainHelper).opacity)>.99`),true,'a current stale child must not be absorbed as completed work');
  send([{...child,status:'idle',activity:'idle',activeTools:0,disconnected:true,lastEventAt:Date.now()}]);await pause(1300);
  assert.equal(await run(`${query(child.id)}===uncertainHelper&&${query(root.id)}===originalRecoveryRoot`),true,'a lost signal cannot prove either body finished');
  send([root,child]);await until(`${query(root.id)}?.dataset.cloneHold==='false'`,'fresh work must resume the same main');
  send([root,{...child,status:'closed',closed:true,activity:'idle',activeTools:0,lastEventAt:Date.now()}]);await until(`${query(child.id)}?.dataset.clonePhase==='returning'`,'a confirmed session end must still return its body');await until(`!${query(child.id)}`,'a confirmed end must finish absorption');
  assert.equal(await run(`${query(root.id)}===originalRecoveryRoot`),true);checks.push('stale and disconnected current descendants remain; a confirmed closed descendant returns');
  const retired=await run(`(()=>{const image=uncertainHelper.querySelector('img'),source=uncertainRig.querySelector('defs image'),panel=document.getElementById('error-message');const before={src:image.src,href:source.getAttribute('href'),hidden:panel.hidden,text:panel.textContent};image.hidden=true;image.dispatchEvent(new Event('error'));image.dispatchEvent(new Event('load'));return{before,after:{src:image.src,href:source.getAttribute('href'),hidden:panel.hidden,text:panel.textContent},imageStillHidden:image.hidden};})()`);
  assert.deepEqual(retired.after,retired.before);assert.equal(retired.imageStillHidden,true);checks.push('retired bitmap load/error callbacks cannot retry or report errors for a later scene');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(async error=>{
  console.error(error);process.exitCode=1;
  if(process.env.MINI_OFFICE_CLONE_RECOVERY_PREVIEW_DIR){
    const dir=process.env.MINI_OFFICE_CLONE_RECOVERY_PREVIEW_DIR,evidence={error:error.stack,checks,errors,sessions:snapshot.sessions,settings};
    fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify(evidence,null,2));
    if(win&&!win.isDestroyed())try{
      evidence.geometry=await run(`(()=>{const world=document.getElementById('world').getBoundingClientRect(),factor=world.width/1280,office=document.getElementById('office'),rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom});return{fit:office.dataset.fitScale,queue:office.dataset.entranceQueue,actors:[...document.querySelectorAll('.actor')].map(node=>{const style=getComputedStyle(node),m=new DOMMatrixReadOnly(style.transform),scale=Math.hypot(m.m11,m.m12),foot={x:world.left+m.m41*factor,y:world.top+m.m42*factor},parts=['.character-body','.nameplate'].map(q=>node.querySelector(q).getBoundingClientRect()),actor=recoveryActors.get(node.dataset.sessionId);return{id:node.dataset.sessionId,position:{x:m.m41/12.8,y:m.m42/7.2},scale,opacity:style.opacity,visibility:style.visibility,dataset:{...node.dataset},parts:parts.map(rect),footprint:{left:Math.ceil((foot.x-Math.min(...parts.map(r=>r.left)))/factor/scale)+6,right:Math.ceil((Math.max(...parts.map(r=>r.right))-foot.x)/factor/scale)+6,top:Math.ceil((foot.y-Math.min(...parts.map(r=>r.top)))/factor/scale)+6,bottom:Math.ceil((Math.max(...parts.map(r=>r.bottom))-foot.y)/factor/scale)+6},observedActor:actor?{serial:actor.serial,target:actor.target,navigation:actor.navigation,pendingStation:actor.pendingStation,entryPending:actor.entryPending,stagedEntry:actor.stagedEntry,motion:Boolean(actor.motion),routeReservation:actor.routeReservation}:null};})};})()`);
      fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify(evidence,null,2));
      fs.writeFileSync(path.join(dir,'failure.png'),(await win.webContents.capturePage()).toPNG());
    }catch(captureError){console.error(captureError);}
  }
}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
