'use strict';
// Synthetic, isolated production-page regressions. Never configures providers.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-visibility-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,failArtwork=false,blockedArtwork=0;
const errors=[],checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let settings={language:'zh',agentScale:1.35,reducedMotion:false,idleVisitor:false};
let snapshot={mode:'live',sessions:[],connections:[],now:Date.now()};
const task=(id,activity)=>({id:'codex:'+id,sessionId:id,provider:'codex',activity,status:'active',activeTools:1,lastEventAt:Date.now(),projectPath:'/fixture/visibility',title:id,events:[],evidence:{source:'hook',confidence:'high'}});
const run=source=>win.webContents.executeJavaScript(source,true);
async function until(source,message,ms=18000){const end=Date.now()+ms;while(Date.now()<end){if(await run(source))return;await pause(40);}const state=await run(`({actors:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity,traffic:n.dataset.traffic,walking:n.dataset.walking,point:(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return{x:m.m41/12.8,y:m.m42/7.2}})()})),page:document.getElementById('page-label').textContent,layout:window.lastLayout})`);throw new Error(message+': '+JSON.stringify(state));}
function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
const visible=`[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.1)`;
const measure=`(()=>{const nodes=${visible};const rects=nodes.map(n=>{const boxes=[...n.querySelectorAll('.character-body,.nameplate,.nameplate *')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect());return{id:n.dataset.sessionId,left:Math.min(...boxes.map(r=>r.left)),right:Math.max(...boxes.map(r=>r.right)),top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))};});return{ids:rects.map(r=>r.id),hits:rects.flatMap((a,i)=>rects.slice(i+1).filter(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1).map(b=>[a.id,b.id]))};})()`;
const guard=setTimeout(()=>{console.error('Visibility fixture timed out');app.exit(1);},90000);
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{const cancel=failArtwork&&details.url.includes('/assets/avatars/');if(cancel)blockedArtwork++;callback({cancel});});
  if(!process.argv.includes('--artwork-only')){
  snapshot={...snapshot,sessions:[task('r0','unknown'),task('r1','planning')]};
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await until(`${visible}.length===2`,'both initial mixed-station roots must be visible');
  await run(`window.originalBodies=new Map([...document.querySelectorAll('.actor')].map(n=>[n.dataset.sessionId,n]));window.bodyRemovals=[];new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes)if(n.matches?.('.actor[data-session-id]'))bodyRemovals.push(n.dataset.sessionId)}).observe(document.getElementById('actors'),{childList:true});void 0`);
  await run(`window.originalPageSessions=OfficeScene.pageSessions;OfficeScene.pageSessions=(...args)=>{const result=originalPageSessions(...args);window.lastLayout={seats:[...result.seats],capacity:result.capacity,footprints:[...args[4].footprints],reserved:args[4].reservedRects};return result};void 0`);
  await run(`window.arrivalAudit={running:true,frames:0,hits:[],first:null,sawWalk:false};function auditArrival(){const report=${measure};arrivalAudit.frames++;arrivalAudit.hits.push(...report.hits);const n=${visible}.find(n=>n.dataset.sessionId==='codex:r2');if(n){const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);arrivalAudit.first||={x:m.m41/12.8,y:m.m42/7.2};arrivalAudit.sawWalk||=n.dataset.walking==='true'}if(arrivalAudit.running)requestAnimationFrame(auditArrival)}requestAnimationFrame(auditArrival);void 0`);
  send(snapshot.sessions.concat(task('r2','planning')));
  await until(`${visible}.length===3&&${visible}.every(n=>n.dataset.walking!=='true'&&!['queued','yielding'].includes(n.dataset.traffic))`,'new maximum-size main must finish entering without clearing its page');
  const arrival=await run(`arrivalAudit.running=false;({...arrivalAudit})`);
  assert.deepEqual(arrival.hits,[],'staged preparation and actual entrance must keep every visible rectangle separated');
  assert.equal(arrival.sawWalk,true,'the newcomer must really walk into the office');
  assert.ok(Math.hypot(arrival.first.x-87,(arrival.first.y-78)*.5625)<2,'the first visible newcomer must be at the doorway');
  let frames=0;
  for(let i=0;i<18;i++){
    send(snapshot.sessions.map(session=>({...session,lastEventAt:Date.now()})));
    const end=Date.now()+150;
    while(Date.now()<end){const report=await run(measure);assert.equal(report.ids.length,3,'arrived active roots must not vanish on metadata refresh');assert.deepEqual(report.hits,[],'retained full nameplates stay separated');frames++;await pause(25);}
  }
  assert.deepEqual(await run('bodyRemovals'),[],'entrance completion must not destroy and recreate already visible bodies');
  assert.equal(await run(`[...originalBodies].every(([id,node])=>document.querySelector('.actor[data-session-id="'+id+'"]')===node)`),true);
  if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,'visibility-stable-135.png'),(await win.webContents.capturePage()).toPNG());}
  checks.push({name:'maximum-size arrival, entrance completion and repeated snapshots retain all three real bodies',frames,entranceFrames:arrival.frames});
  }

  // Exercise the real resource error and later production pose change, rather
  // than merely toggling the hidden attribute in the test.
  settings={...settings,agentScale:1,reducedMotion:true};snapshot={...snapshot,sessions:[]};
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await win.webContents.session.clearCache();
  failArtwork=true;send([task('asset-recovery','coding')]);
  await until(`(()=>{const image=document.querySelector('.actor .character-body>img');return image?.hidden===true})()`,'failed static fallback must reach its real error handler');
  assert.ok(blockedArtwork>0,'fixture must really fail a local artwork request');
  failArtwork=false;
  await run(`window.recoveredRigLoads=0;const source=document.querySelector('.ap-rig defs image');source.addEventListener('load',()=>recoveredRigLoads++);source.setAttribute('href','../assets/avatars/fixture-missing-source.svg');void 0`);
  await run(`document.getElementById('setting-reducedMotion').checked=false;document.getElementById('setting-reducedMotion').dispatchEvent(new Event('change',{bubbles:true}))`);
  await until(`(()=>{const image=document.querySelector('.actor .character-body>img');return image&&!image.hidden&&image.complete&&image.naturalWidth>0})()`,'a later valid pose must unhide the body after fallback failure');
  await until(`recoveredRigLoads>0&&document.querySelector('.ap-rig defs image').getAttribute('href').includes('clawd-static-base.svg')`,'the animated rig must also reload its actual external body source');
  await run(`document.getElementById('setting-reducedMotion').checked=true;document.getElementById('setting-reducedMotion').dispatchEvent(new Event('change',{bubbles:true}))`);
  await until(`(()=>{const image=document.querySelector('.actor .character-body>img');return image&&!image.hidden&&image.complete&&image.naturalWidth>0&&image.dataset.asset==='clawd-static-base.svg'})()`,'reduced motion must keep the recovered static body visible');
  if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,'artwork-recovered.png'),(await win.webContents.capturePage()).toPNG());}
  checks.push({name:'real failed bitmap recovers through a valid production pose and reduced-motion return',blockedArtwork});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
