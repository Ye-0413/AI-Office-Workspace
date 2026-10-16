'use strict';
// Isolated production-renderer geometry fixtures; no live provider actions.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Scene=require('../lib/scene-model.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-scale-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win;const errors=[],checks=[];
let settings={agentScale:1,language:'zh',reducedMotion:true,idleVisitor:false,sceneTime:'morning'};
const task=(id,activity,patch={})=>({id:'codex:'+id,sessionId:id,provider:'codex',title:'Geometry fixture '+id,projectPath:'/fixture/scale',status:'active',activity,activeTools:1,lastEventAt:Date.now(),events:[],...patch});
let snapshot={mode:'live',sessions:Array.from({length:5},(_,i)=>task('root-'+i,'coding')).concat(Array.from({length:3},(_,i)=>task('helper-'+i,'reading',{parentId:'codex:root-0'}))),connections:[],now:Date.now()};
const run=source=>win.webContents.executeJavaScript(source,true);
async function until(source,message,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await run(source))return;await pause(40);}throw new Error(message);}
const measure=`(()=>{const world=document.getElementById('world').getBoundingClientRect();const convert=r=>({left:(r.left-world.left)*1280/world.width,right:(r.right-world.left)*1280/world.width,top:(r.top-world.top)*720/world.height,bottom:(r.bottom-world.top)*720/world.height});const actors=[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.1).map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),point={x:m.m41/12.8,y:m.m42/7.2},helper=n.dataset.helper==='true',model=OfficeScene.actorBounds(point,{helper,scale:Number(document.getElementById('setting-agentScale').value)/100}),body=convert(n.querySelector('.character-body').getBoundingClientRect()),rects=[...n.querySelectorAll('.character-body,.nameplate,.actor-title,.actor-relation,.actor-subline,.actor-provider,.actor-state,.family-badge,.actor-keepsake')].filter(e=>getComputedStyle(e).display!=='none'&&Number(getComputedStyle(e).opacity)>.1).map(e=>convert(e.getBoundingClientRect()));return{id:n.dataset.sessionId,helper,point,scale:m.a,walking:n.dataset.walking==='true',body,model,visual:{left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))},state:n.querySelector('.actor-state').textContent,traffic:n.dataset.traffic,phase:n.dataset.phase};});return{actors,hits:actors.flatMap((a,i)=>actors.slice(i+1).filter(b=>a.visual.left<b.visual.right-1&&a.visual.right>b.visual.left+1&&a.visual.top<b.visual.bottom-1&&a.visual.bottom>b.visual.top+1).map(b=>[a.id,b.id]))};})()`;
async function capture(name){if(!process.env.MINI_OFFICE_PREVIEW_DIR)return;fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,name+'.png'),(await win.webContents.capturePage()).toPNG());}
const guard=setTimeout(()=>{console.error('Scale fixture timed out');app.exit(1);},120000);
app.whenReady().then(async()=>{
  for(const [name,handler]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>handler(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await until(`document.querySelector('.actor[data-session-id=\"codex:root-0\"]')&&document.querySelector('.actor[data-session-id=\"codex:helper-0\"]')&&[...document.querySelectorAll('.actor')].every(n=>getComputedStyle(n).visibility!=='hidden')`,'all fixture actors must materialize');
  const reports=[];
  function verifyStations(report){for(const actor of report.actors){const session=snapshot.sessions.find(s=>s.id===actor.id);if(session&&!Scene.isClosed(session))assert.ok(Scene.stationCompatible(actor.point,Scene.activitySpec(session).zone),'rendered work area mismatch: '+JSON.stringify(actor));}}
  function verify(report){
    assert.deepEqual(report.hits,[], 'full rendered body/nameplate/text overlap: '+JSON.stringify(report.hits));
    for(const a of report.actors){
      if(!a.walking){
        assert.ok(Math.abs(a.body.bottom-a.point.y*7.2)<.15,'stationary body foot anchor must match world coordinates');
        assert.ok(Math.abs((a.body.left+a.body.right)/2-a.point.x*12.8)<.15,'stationary body must remain centered on its foot anchor');
      } // The authored 3px/1deg walking bob is included in the reserved envelope.
      assert.ok(a.visual.left>=11&&a.visual.right<=1269&&a.visual.top>=71&&a.visual.bottom<=663,'visual envelope must fit world: '+JSON.stringify(a));
    }
  }
  for(const value of [100,135,65,135]){
    await run(`(()=>{const slider=document.getElementById('setting-agentScale');slider.value=${value};slider.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);
    const report=await run(measure);verify(report);verifyStations(report);assert.ok(report.actors.filter(a=>!a.helper).every(a=>a.point.y>=69),'coding actors must remain in the foreground work area');reports.push({scale:value,count:report.actors.length});await capture('scale-'+value);
  }
  checks.push('65/100/135 percent actual body, all text descendants and selected keepsake keep anchored feet, safe gaps and foreground coding seats');
  await run(`document.getElementById('page-next').click()`);await pause(180);
  assert.ok((await run(measure)).actors.some(a=>a.id==='codex:root-4'));
  await run(`document.getElementById('page-prev').click()`);await pause(180);
  await run(`document.querySelector('.actor[data-session-id="codex:root-0"] .actor-button').click()`);await pause(80);verify(await run(measure));
  await run(`document.getElementById('language-button').click()`);await pause(180);verify(await run(measure));await capture('scale-135-en');
  win.setContentSize(960,600);await pause(160);verify(await run(measure));win.setContentSize(1280,720);await pause(160);verify(await run(measure));
  checks.push('adaptive pages retain the fifth root; selected keepsake and English text remain separated with a resized window');
  const planningRoots=Array.from({length:8},(_,i)=>task('plan-root-'+i,'planning'));
  const planningHelpers=['a','b'].map(id=>task('plan-helper-'+id,'planning',{parentId:planningRoots[0].id}));
  snapshot={...snapshot,sessions:planningRoots.concat(planningHelpers)};win.reload();
  await until(`document.querySelectorAll('.actor').length>0&&[...document.querySelectorAll('.actor')].every(n=>getComputedStyle(n).visibility!=='hidden')`,'large planning families restore');
  for(const session of planningHelpers.concat(planningRoots)) {
    await run(`document.getElementById('roster-button').click();[...document.querySelectorAll('.roster-row')].find(n=>n.querySelector('.roster-task').textContent===${JSON.stringify(session.title)}).click()`);
    await until(`(()=>{const n=document.querySelector('.actor[data-session-id="${session.id}"]');return n&&getComputedStyle(n).visibility!=='hidden'})()`,'every maximum-size planning task and helper must remain selectable');
    const result=await run(measure);verify(result);verifyStations(result);
    assert.ok(result.actors.some(a=>a.id===session.id));
    if(session.parentId)assert.equal(await run(`document.querySelector('.actor[data-session-id="${session.id}"]').dataset.helper`),'true');
  }
  await capture('scale-135-planning');
  checks.push('eight maximum-size planning roots and two same-station helpers remain individually reachable with real parent identity, safe board seats and no blank selected page');
  // Three isolated real actors exercise routing, then interrupt an active walk
  // with the user-size setting. No provider state or output is fabricated.
  snapshot={...snapshot,sessions:Array.from({length:3},(_,i)=>task('moving-'+i,['reading','planning','building'][i]))};
  win.reload();await until(`document.querySelectorAll('.actor').length===3&&[...document.querySelectorAll('.actor')].every(n=>getComputedStyle(n).visibility!=='hidden')`,'moving fixtures restore');
  await run(`(()=>{const s=document.getElementById('setting-agentScale');s.value=100;s.dispatchEvent(new Event('change',{bubbles:true}));const r=document.getElementById('setting-reducedMotion');r.checked=false;r.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(180);
  snapshot={...snapshot,sessions:snapshot.sessions.map(s=>({...s,activity:'coding',lastEventAt:Date.now()}))};win.webContents.send('office:snapshot',snapshot);
  await until(`[...document.querySelectorAll('.actor')].some(n=>n.dataset.walking==='true')`,'normal activity changes must really walk');
  for(let i=0;i<12;i++){verify(await run(measure));await pause(30);}
  await run(`(()=>{const s=document.getElementById('setting-agentScale');s.value=135;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for(let i=0;i<25;i++){const report=await run(measure);verify(report);assert.ok(report.actors.every(a=>a.point.y>=69));await pause(30);}
  assert.ok(await run(`[...document.querySelectorAll('.actor')].every(n=>n.dataset.walking!=='true'&&!['queued','yielding'].includes(n.dataset.traffic))`));
  checks.push('a scale change during actual walking cancels old reservations and places every actor at a safe work-area seat');
  // A deliberately impossible test-only traffic predicate verifies bounded
  // presentation recovery. The same model still supplies legal final seats.
  snapshot={...snapshot,sessions:snapshot.sessions.map(s=>({...s,activity:'reading',lastEventAt:Date.now()}))};
  await run(`(()=>{const r=document.getElementById('setting-reducedMotion');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));})()`);win.webContents.send('office:snapshot',snapshot);
  await until(`[...document.querySelectorAll('.actor')].every(n=>n.dataset.walking!=='true'&&!['queued','yielding'].includes(n.dataset.traffic))`,'reading fixtures settle');await pause(1300);
  await run(`window.originalLegalPoint=OfficeScene.legalActorPoint;OfficeScene.legalActorPoint=(point,actor)=>actor.id?false:originalLegalPoint(point,actor);void 0`);
  snapshot={...snapshot,sessions:snapshot.sessions.map(s=>({...s,activity:'coding',lastEventAt:Date.now()}))};win.webContents.send('office:snapshot',snapshot);
  await until(`[...document.querySelectorAll('.actor')].some(n=>n.dataset.traffic==='queued')`,'forced impossible path must enter physical queue');
  const queued=await run(`(()=>{const n=[...document.querySelectorAll('.actor')].find(n=>n.dataset.traffic==='queued');n.querySelector('.actor-button').click();return{label:n.querySelector('.actor-state').textContent,phase:n.dataset.phase,state:document.getElementById('inspect-state').textContent,location:document.getElementById('inspect-location').textContent};})()`);
  assert.match(queued.label,/Coding|写代码/);assert.doesNotMatch(queued.label,/通道|Corridor|Waiting/i);assert.match(queued.state,/Coding|写代码/);assert.match(queued.location,/making room|让路/);
  await until(`[...document.querySelectorAll('.actor')].every(n=>n.dataset.traffic!=='queued'&&n.dataset.walking!=='true')`,'an impossible physical queue must reflow rather than stay forever',3500);
  const restored=await run(measure);verify(restored);verifyStations(restored);assert.equal(restored.actors.length,3);assert.ok(restored.actors.every(a=>a.point.y>=69));
  await run(`void(OfficeScene.legalActorPoint=originalLegalPoint)`);
  await capture('scale-blocked-recovered');checks.push('blocked active sessions retain actual work state and inspector activity; an impossible queue safely reflows within a bounded delay');
  await run(`(()=>{const r=document.getElementById('setting-reducedMotion');r.checked=false;r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const closingId=snapshot.sessions[0].id;snapshot={...snapshot,sessions:snapshot.sessions.map((s,i)=>i? s:{...s,status:'closed',closed:true,activeTools:0})};win.webContents.send('office:snapshot',snapshot);
  const departureEnd=Date.now()+10000;while(Date.now()<departureEnd){const report=await run(measure);verify(report);if(!report.actors.some(a=>a.id===closingId))break;await pause(30);}
  await until(`!document.querySelector('.actor[data-session-id="${closingId}"]')`,'a large ordinary root must leave without an indefinite queue',1500);verify(await run(measure));
  checks.push('ordinary large-size departure keeps full labels separated and retires the body without a stuck queue');
  console.log(JSON.stringify({ok:true,checks,reports,errors}));
  assert.deepEqual(errors,[]);
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
