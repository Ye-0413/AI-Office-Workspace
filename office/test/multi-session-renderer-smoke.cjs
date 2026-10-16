'use strict';
// Synthetic live-observation snapshots in the actual isolated renderer. No
// provider configuration, prompts, AI messages or native task execution.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Scene=require('../lib/scene-model.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-multi-session-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checks=[],errors=[];let win;
let settings={language:'zh',sceneTime:'auto',idleVisitor:false,reducedMotion:true,lowPower:false,selectedProject:''};
let snapshot={mode:'live',sessions:[],connections:[],now:Date.now()};
const task=(id,project,patch={})=>({id:'codex:'+id,sessionId:id,provider:'codex',title:'Fixture '+id,projectPath:'/fixture/'+project,activity:'coding',status:'active',activeTools:1,lastEventAt:Date.now(),events:[],evidence:{source:'hook',rawEvent:'PreToolUse',confidence:'high'},...patch});
const evaluate=source=>win.webContents.executeJavaScript(source,true);
const actor=id=>`document.querySelector('.actor[data-session-id="${id}"]')`;
const ids=()=>evaluate(`[...document.querySelectorAll('.actor[data-helper="false"]')].map(node=>node.dataset.sessionId).sort()`);
const pageNumbers=()=>evaluate(`document.getElementById('page-label').textContent.match(/\\d+/g).map(Number)`);
async function clearSelection(){await evaluate(`document.getElementById('close-inspector').click()`);await wait(60);}
async function selectRoster(session){await evaluate(`document.getElementById('roster-button').click();[...document.querySelectorAll('.roster-row')].find(row=>row.querySelector('.roster-task').textContent===${JSON.stringify(session.title)}).click()`);await until(`(()=>{const n=${actor(session.id)};return n&&getComputedStyle(n).visibility!=='hidden'})()`,'roster must materialize '+session.id);assert.equal(await evaluate(`document.getElementById('inspect-title').textContent`),session.title);}
async function assertNoOverlap(){const hits=await evaluate(`(()=>{const boxes=[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden').map(n=>{const a=n.querySelector('.character-body').getBoundingClientRect(),b=n.querySelector('.nameplate').getBoundingClientRect();return{id:n.dataset.sessionId,left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom)};});return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1).map(b=>[a.id,b.id]));})()`);assert.deepEqual(hits,[],'every paged body and nameplate has a separate physical place');}
async function rootPages(expected){
  await clearSelection();while(await evaluate(`!document.getElementById('page-prev').disabled`)){await evaluate(`document.getElementById('page-prev').click()`);await wait(80);}
  const [,pages]=await pageNumbers(),result=[],seen=new Set();assert.ok(pages>=1);
  for(let index=0;index<pages;index++){
    assert.deepEqual((await pageNumbers()).slice(0,2),[index+1,pages]);const current=await ids();assert.ok(current.length>0,'a page cannot hide all main agents');
    for(const id of current){assert.ok(expected.includes(id),'unexpected main agent '+id);assert.equal(seen.has(id),false,'a main agent cannot occupy two pages');seen.add(id);}result.push(current);await assertNoOverlap();
    assert.equal(await evaluate(`document.getElementById('page-next').disabled`),index===pages-1);
    if(index<pages-1){await evaluate(`document.getElementById('page-next').click()`);await wait(80);}
  }
  assert.deepEqual([...seen].sort(),[...expected].sort(),'paging must expose every independent identity exactly once');
  while(await evaluate(`!document.getElementById('page-prev').disabled`)){await evaluate(`document.getElementById('page-prev').click()`);await wait(80);}return result;
}
async function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);await wait(100);}
async function until(source,message){const end=Date.now()+6000;while(Date.now()<end){if(await evaluate(source))return;await wait(60);}throw new Error(message);}
async function choose(key){await evaluate(`(()=>{const select=document.getElementById('project-select');select.value=${JSON.stringify(key)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(100);}
async function capture(name){if(!process.env.MINI_OFFICE_PREVIEW_DIR)return;fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,name+'.png'),(await win.webContents.capturePage()).toPNG());}
const guard=setTimeout(()=>{console.error('Multi-session fixture exceeded 90 seconds');app.exit(1);},90000);
app.whenReady().then(async()=>{
  for(const [name,handler] of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>handler(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await wait(200);
  const roots=[task('parallel-a','one'),task('parallel-b','two'),task('parallel-c','one')];
  await send(roots);
  assert.equal(await evaluate(`document.getElementById('project-select').value`),Scene.ALL_ROOMS);
  assert.deepEqual(await ids(),roots.map(item=>item.id).sort());
  assert.equal(await evaluate(`document.querySelectorAll('.actor[data-helper="true"]').length`),0);
  await capture('multiple-codex-main-agents');
  await evaluate(`window.firstRootNode=${actor(roots[0].id)}`);
  const nextTurn={...roots[0],turnId:'another-native-turn',lastEventAt:Date.now(),title:'Changed actual task title'};
  await send([roots[2],nextTurn,roots[1]]);
  assert.equal(await evaluate(`window.firstRootNode===${actor(roots[0].id)}`),true);
  assert.deepEqual(await ids(),roots.map(item=>item.id).sort());
  checks.push('three independent Codex sessions across two projects appear as three main agents; another turn keeps its existing body');
  await choose('/fixture/one');
  assert.deepEqual(await ids(),[roots[0].id,roots[2].id]);
  assert.equal(await evaluate(`document.getElementById('all-projects').hidden`),false);
  assert.match(await evaluate(`document.getElementById('all-projects').textContent`),/1 个主 Agent/);
  win.reload();await wait(300);
  assert.equal(await evaluate(`document.getElementById('project-select').value`),'/fixture/one');
  assert.deepEqual(await ids(),[roots[0].id,roots[2].id]);
  await evaluate(`document.getElementById('all-projects').click()`);await wait(100);
  assert.deepEqual(await ids(),roots.map(item=>item.id).sort());
  await evaluate(`document.getElementById('roster-button').click();[...document.querySelectorAll('.roster-row')].find(row=>row.textContent.includes('parallel-b')).click()`);
  assert.equal(await evaluate(`document.getElementById('project-select').value`),Scene.ALL_ROOMS,'selecting a task must not silently leave the overview');
  await evaluate(`document.getElementById('close-inspector').click()`);
  checks.push('explicit project filters survive reload, expose other main agents, and can return to overview; selecting a task preserves overview');
  const many=Array.from({length:7},(_,index)=>task('page-'+index,index%2?'one':'two'));
  await send(many);
  await until(`document.querySelectorAll('.actor[data-session-id^="codex:parallel"]').length===0`,'the previous roots must retire');
  const initialPages=await rootPages(many.map(item=>item.id)),firstPage=initialPages[0];
  await send([...many].reverse().map((item,index)=>({...item,lastEventAt:Date.now()+index})));
  assert.deepEqual(await ids(),firstPage,'heartbeats must not shuffle roots between pages');
  assert.deepEqual(await rootPages(many.map(item=>item.id)),initialPages,'heartbeat ordering cannot change any page');
  for(const session of many){await selectRoster(session);assert.equal(await evaluate(`document.getElementById('project-select').value`),Scene.ALL_ROOMS);await assertNoOverlap();}
  await selectRoster(many[0]);
  assert.deepEqual(await ids(),firstPage);
  await clearSelection();
  checks.push('crowded same-provider roots have stable adaptive pages; every identity is reachable once by paging and by roster');
  const root=task('family-root','one',{activity:'planning',activeTools:0});
  const child=(name,patch={})=>task(name,'one',{parentId:root.id,...patch});
  const resting=['a','b','c'].map(id=>child(id));
  await send([root,...resting]);
  await until(`document.querySelectorAll('.actor[data-session-id^="codex:page-"]').length===0`,'old overview pages must retire');
  for(const session of resting){await selectRoster(session);assert.equal(await evaluate(`${actor(session.id)}.dataset.helper`),'true');await assertNoOverlap();}await clearSelection();
  const completed=resting.map(item=>({...item,activity:'idle',status:'idle',activeTools:0,turnCompletedAt:Date.now()}));
  await send([root,...completed]);
  assert.equal(await evaluate(`document.querySelectorAll('.actor[data-helper="true"]').length`),0);
  const live=child('z-active');
  await send([root,...completed,live]);
  assert.equal(await evaluate(`!!${actor(live.id)}`),true,'absorbed idle helpers must not occupy the three helper slots');
  assert.match(await evaluate(`${actor(root.id)}.querySelector('.actor-relation').textContent`),/1 活跃.*累计 4/);
  assert.match(await evaluate(`document.getElementById('room-summary').textContent`),/1 位临时帮手/);
  const nested=child('nested-active',{parentId:resting[0].id,projectPath:'/fixture/two',activity:'testing'});
  await send([root,...completed,live,nested]);
  assert.equal(await evaluate(`${actor(nested.id)}.dataset.helper`),'true');
  assert.equal(await evaluate(`${actor(nested.id)}.dataset.cloneOrigin`),root.id);
  assert.match(await evaluate(`${actor(root.id)}.querySelector('.actor-relation').textContent`),/2 活跃.*累计 5/);
  checks.push('absorbed clones cannot hide new active clones, and a nested helper in another project retains its real root');
  await capture('multi-session-family');
  const closedFamily=[root,live,nested].map(item=>({...item,status:'closed',closed:true,activity:'idle',activeTools:0}));
  await send([...many,...completed,...closedFamily]);
  await until(`!${actor(root.id)}`,'closed root must leave after its remaining children return');
  assert.deepEqual(await rootPages(many.map(item=>item.id)),initialPages,'absorbed orphan helpers must not consume main-agent page slots after their root ends');
  await selectRoster(many[4]);
  assert.equal(await evaluate(`!!${actor(many[4].id)}`),true,'roster navigation must use the same suppressed-family pagination as rendering');
  const selectedPage=initialPages.findIndex(page=>page.includes(many[4].id))+1;assert.deepEqual((await pageNumbers()).slice(0,2),[selectedPage,initialPages.length]);
  await clearSelection();
  checks.push('cached idle orphans cannot displace real main agents or send roster selection to an incorrect page');
  await send(roots);
  await until(`document.querySelectorAll('.actor[data-session-id^="codex:page-"]').length===0`,'previous paged roots must settle');
  await choose('/fixture/one');
  for(const size of [[1280,720],[960,540]]){
    win.setContentSize(...size);await wait(80);
    for(const language of ['zh','en']){
      if(settings.language!==language){await evaluate(`document.getElementById('language-button').click()`);await wait(80);}
      const controls=await evaluate(`['project-select','all-projects','other-attention','language-button','connections-button','settings-button'].map(id=>{const node=document.getElementById(id),r=node.getBoundingClientRect();return{id,hidden:node.hidden,left:r.left,right:r.right,top:r.top,bottom:r.bottom}})`);
      for(const rect of controls.filter(item=>!item.hidden))assert.ok(rect.left>=0&&rect.right<=size[0]&&rect.top>=0&&rect.bottom<=size[1],JSON.stringify({size,language,rect}));
      assert.match(await evaluate(`document.getElementById('project-select').options[0].textContent`),language==='en'?/All projects/:/全部项目/);
    }
  }
  checks.push('overview and other-project discovery remain localized and fit native 1280×720 and 960×540 windows');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
