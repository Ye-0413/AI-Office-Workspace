'use strict';
// The production sandboxed renderer with isolated aggregate IPC fixtures.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-quality-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win;const errors=[],checks=[];const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let settings={language:'zh',sceneTime:'auto',agentScale:1,idleVisitor:false,reducedMotion:true,lowPower:false};
let snapshot={mode:'live',sessions:[],connections:[],now:Date.now(),activityStats:{date:'2026-10-16',timeZone:'Asia/Hong_Kong',total:12,roots:5,helpers:7,scope:'observed'}};
const task=(id,patch={})=>({id:'codex:'+id,sessionId:id,provider:'codex',title:'Fixture '+id,projectPath:'/fixture/'+id,activity:'planning',status:'active',activeTools:0,lastEventAt:Date.now(),events:[],evidence:{source:'hook',confidence:'high'},...patch});
const evaluate=source=>win.webContents.executeJavaScript(source,true);
async function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);await pause(150);}
async function until(source,message,ms=24000){const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(source))return;await pause(80);}throw new Error(message);}
async function scale(value){await evaluate(`(()=>{const slider=document.getElementById('setting-agentScale');slider.value=${value};slider.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(250);}
async function capture(name){if(!process.env.MINI_OFFICE_PREVIEW_DIR)return;fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,name+'.png'),(await win.webContents.capturePage()).toPNG());}
const geometry=`(()=>{const bodies=[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.1).map(n=>{const a=n.querySelector('.character-body').getBoundingClientRect(),b=n.querySelector('.nameplate').getBoundingClientRect();return{id:n.dataset.sessionId,left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom),clone:n.dataset.clonePhase,family:n.dataset.family};});const hits=[];for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const a=bodies[i],b=bodies[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)hits.push([a,b]);}return{bodies,hits};})()`;
async function assertGeometry(label){const result=await evaluate(geometry);assert.ok(result.bodies.length>=1,'a safely paged room must show at least one real body');assert.deepEqual(result.hits,[],label+': '+JSON.stringify(result.hits));for(const body of result.bodies)assert.ok(body.left>=0&&body.right<=1280&&body.top>=65&&body.bottom<=668,JSON.stringify(body));return result;}
async function selectRoster(session){await evaluate(`document.getElementById('roster-button').click();[...document.querySelectorAll('.roster-row')].find(row=>row.querySelector('.roster-task').textContent===${JSON.stringify(session.title)}).click()`);await until(`(()=>{const n=document.querySelector('.actor[data-session-id="${session.id}"]');return n&&getComputedStyle(n).visibility!=='hidden'})()`,'roster selection must give '+session.id+' a visible physical body',6000);assert.equal(await evaluate(`document.getElementById('inspect-title').textContent`),session.title);}
async function rootPages(expected,label){
  await evaluate(`document.getElementById('close-inspector').click()`);while(await evaluate(`!document.getElementById('page-prev').disabled`)){await evaluate(`document.getElementById('page-prev').click()`);await pause(90);}
  const [,pages]=await evaluate(`document.getElementById('page-label').textContent.match(/\\d+/g).map(Number)`),seen=new Set();assert.ok(pages>=1);
  for(let index=0;index<pages;index++){
    assert.deepEqual((await evaluate(`document.getElementById('page-label').textContent.match(/\\d+/g).map(Number)`)).slice(0,2),[index+1,pages]);
    await assertGeometry(label);const current=await evaluate(`[...document.querySelectorAll('.actor[data-helper="false"]')].filter(n=>getComputedStyle(n).visibility!=='hidden').map(n=>n.dataset.sessionId)`);assert.ok(current.length>0);
    for(const id of current){assert.equal(seen.has(id),false,'a main agent cannot appear on two pages');seen.add(id);}assert.equal(await evaluate(`document.getElementById('page-next').disabled`),index===pages-1);
    if(index<pages-1){await evaluate(`document.getElementById('page-next').click()`);await pause(90);}
  }
  assert.deepEqual([...seen].sort(),[...expected].sort(),'all main identities remain reachable at '+label);
  while(await evaluate(`!document.getElementById('page-prev').disabled`)){await evaluate(`document.getElementById('page-prev').click()`);await pause(90);}
}
async function appearances(sessions){const result=[];for(const session of sessions){await selectRoster(session);result.push(await evaluate(`(()=>{const n=document.querySelector('.actor[data-session-id="${session.id}"]');return{id:n.dataset.sessionId,family:n.dataset.family,color:n.style.getPropertyValue('--family-color'),badge:n.querySelector('.family-badge')?.textContent,name:n.querySelector('.actor-title').textContent};})()`));await assertGeometry('roster identity '+session.id);}return result;}
const guard=setTimeout(()=>{console.error('Office quality fixture exceeded 150 seconds');app.exit(1);},150000);
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await pause(250);
  assert.equal(await evaluate(`document.getElementById('today-total').textContent`),'12');
  assert.match(await evaluate(`document.getElementById('today-roots').textContent`),/5/);assert.match(await evaluate(`document.getElementById('today-helpers').textContent`),/7/);
  assert.ok(await evaluate(`parseFloat(getComputedStyle(document.getElementById('hk-clock')).fontSize)>=48`));
  const roots=Array.from({length:8},(_,i)=>task('myth-'+i));
  const children=[task('clone-a',{parentId:roots[0].id}),task('clone-b',{parentId:roots[1].id})];
  await send([...roots,...children]);
  for(const value of [65,100,135]){
    await scale(value);await rootPages(roots.map(session=>session.id),value+'%');
    for(const child of children){await selectRoster(child);await assertGeometry('selected helper at '+value+'%');assert.equal(await evaluate(`document.querySelector('.actor[data-session-id="${child.id}"]').dataset.family`),child.parentId);}
    assert.equal(settings.agentScale,value/100);assert.equal(await evaluate(`document.getElementById('agent-scale-value').textContent`),value+'%');
  }
  checks.push('65%, 100% and 135% scale persist; adaptive pages expose every root and roster exposes each helper with separated full body/nameplate rectangles');
  await scale(100);const before=await appearances([...roots,...children]);
  assert.ok(before.every(item=>item.badge&&item.color));const groups=new Map();for(const item of before){if(groups.has(item.family))assert.equal(item.color,groups.get(item.family));else groups.set(item.family,item.color);}assert.equal(new Set(groups.values()).size,groups.size);
  await evaluate(`document.getElementById('language-button').click()`);await pause(150);
  const after=await appearances([...roots,...children]);
  for(const item of after){const old=before.find(v=>v.id===item.id);assert.equal(item.color,old.color);assert.notEqual(item.name,old.name);assert.doesNotMatch(item.name,/\p{Script=Han}/u);}
  assert.match(await evaluate(`document.getElementById('today-roots').textContent`),/Main/);assert.match(await evaluate(`document.getElementById('today-helpers').textContent`),/clone/i);
  checks.push('main families have distinct body colours and stable group badges; helpers share the family; localized names keep identity');
  await evaluate(`document.getElementById('language-button').click()`);await pause(100);
  await send([...roots.slice(0,3),...children]);await rootPages(roots.slice(0,3).map(session=>session.id),'preview family');
  await pause(2600);await capture('office-0.7.0');
  const movingRoots=roots.slice(0,3).map((session,index)=>({...session,activity:['planning','coding','testing'][index],activeTools:index?1:0,lastEventAt:Date.now()}));
  await send(movingRoots);await until(`document.querySelectorAll('.actor[data-helper="false"]').length===3&&document.querySelectorAll('.actor[data-helper="true"]').length===0`,'the mixed-station work cohort must remain visible after old helpers retire');
  await evaluate(`document.getElementById('setting-reducedMotion').checked=false;document.getElementById('setting-reducedMotion').dispatchEvent(new Event('change',{bubbles:true}))`);await pause(150);
  await send(movingRoots.map((item,index)=>({...item,activity:['coding','testing','reading'][index],activeTools:1,lastEventAt:Date.now()})));
  let samples=0,sawWorkWalk=false;const end=Date.now()+9000;while(Date.now()<end){const result=await evaluate(geometry);assert.deepEqual(result.hits,[],'walking bodies/nameplates overlap: '+JSON.stringify(result.hits));sawWorkWalk=sawWorkWalk||await evaluate(`[...document.querySelectorAll('.actor')].some(n=>n.dataset.walking==='true')`);samples++;await pause(40);}
  await until(`[...document.querySelectorAll('.actor')].every(n=>n.dataset.walking!=='true'&&!['queued','yielding'].includes(n.dataset.traffic))`,'normal work movements must finish rather than remain queued');
  assert.equal(sawWorkWalk,true,'normal work-route changes must include actual walking');
  checks.push(`normal work-route changes avoid other bodies and nameplates (${samples} native frame samples)`);
  const arrival=task('new-arrival',{activity:'coding',activeTools:1});
  await evaluate(`window.arrivalDoorOpens=0;window.arrivalObserver=new MutationObserver(()=>{if(document.getElementById('studio-door').dataset.open==='true')arrivalDoorOpens++});arrivalObserver.observe(document.getElementById('studio-door'),{attributes:true,attributeFilter:['data-open']})`);
  await send([...snapshot.sessions,arrival]);let sawWalk=false;const arrivalEnd=Date.now()+16000;
  while(Date.now()<arrivalEnd){const result=await evaluate(geometry);assert.deepEqual(result.hits,[],'arrival overlaps: '+JSON.stringify(result.hits));sawWalk=sawWalk||await evaluate(`document.querySelector('.actor[data-session-id="codex:new-arrival"]')?.dataset.walking==='true'`);await pause(50);}
  try{await until(`(()=>{const n=document.querySelector('.actor[data-session-id="codex:new-arrival"]');if(!n||getComputedStyle(n).visibility==='hidden'||n.dataset.walking==='true'||['queued','yielding','moving'].includes(n.dataset.traffic))return false;const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return OfficeScene.stationCompatible({x:m.m41/12.8,y:m.m42/7.2},'desk');})()`,'a new main agent must visibly finish its entrance at the actual desk instead of staying hidden or queued');}
  catch(error){console.error('Arrival diagnostic',JSON.stringify({sawWalk,...await evaluate(`({page:document.getElementById('page-label').textContent,project:document.getElementById('project-select').value,summary:document.getElementById('room-summary').textContent,doorOpens:arrivalDoorOpens,actors:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,visibility:getComputedStyle(n).visibility,transform:getComputedStyle(n).transform,walking:n.dataset.walking,traffic:n.dataset.traffic,hint:n.dataset.trafficHint,state:n.querySelector('.actor-state').textContent}))})`)}));await capture('arrival-diagnostic');throw error;}
  if(!sawWalk)console.error('Arrival diagnostic',await evaluate(`({doorOpens:arrivalDoorOpens,actors:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,visibility:getComputedStyle(n).visibility,transform:getComputedStyle(n).transform,walking:n.dataset.walking,state:n.querySelector('.actor-state').textContent}))})`));
  assert.equal(sawWalk,true);assert.ok(await evaluate('arrivalDoorOpens')>0);
  checks.push('a later main arrival reserves the doorway, walks into the room, and never overlaps visible bodies or tags');
  const goodStats=snapshot.activityStats;snapshot.activityStats={...goodStats,error:'Activity statistics save failed (fixture)'};await send(snapshot.sessions);
  assert.equal(await evaluate(`document.getElementById('today-total').textContent`),'—');assert.equal(await evaluate(`document.getElementById('activity-stats').dataset.error`),'true');assert.doesNotMatch(await evaluate(`document.getElementById('activity-stats').title`),/fixture/);
  snapshot.activityStats=goodStats;await send(snapshot.sessions);
  checks.push('statistics failures have a visible localized incomplete state and recover without false totals');
  win.reload();await pause(400);assert.equal(await evaluate(`document.getElementById('today-total').textContent`),'12');assert.equal(await evaluate(`document.getElementById('setting-agentScale').value`),'100');
  checks.push('today aggregate and persisted scale survive renderer reload; clock stays readable');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
