'use strict';
// Production renderer with isolated observations. No client configuration or AI messages.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-signal-loss-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'en',agentScale:1.25,roomDesign:'glasshouse',sceneVenue:'workshop',
  sceneTheme:'auto',sceneWeather:'off',idleVisitor:false,reducedMotion:true,lowPower:false};
let snapshot={mode:'live',now:Date.now(),sessions:[],connections:[]};
const errors=[],checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>Date.now();
const task=(id,extra={})=>({id:'codex:'+id,sessionId:id,provider:'codex',status:'active',activity:'coding',
  activeTools:0,lastEventAt:now(),events:[],...extra});
const run=code=>win.webContents.executeJavaScript(code,true);
const bodies=`[...document.querySelectorAll('.actor[data-session-id]')]`;
async function until(code,label){const end=Date.now()+20000;while(Date.now()<end){if(errors.length)throw Error(errors.join('; '));if(await run(code))return;await pause(40);}throw Error(label+': '+await run(`JSON.stringify({office:{...document.getElementById('office').dataset},actors:${bodies}.map(n=>({...n.dataset})),error:document.getElementById('error-message').textContent})`));}
function send(sessions){snapshot={...snapshot,now:now(),sessions};win.webContents.send('office:snapshot',snapshot);}
const settled=n=>`${bodies}.length===${n}&&${bodies}.every(n=>n.dataset.traffic==='arrived'&&n.dataset.walking!=='true'&&getComputedStyle(n).visibility!=='hidden')`;
const guard=setTimeout(()=>{console.error('Signal loss renderer timed out');app.exit(1)},90000);
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,
    webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await run(`window.observedArrivals=[];document.getElementById('office').addEventListener('office:actor-arrival',e=>observedArrivals.push({id:e.detail.actorId,kind:e.detail.kind}));void 0`);
  const stale=Array.from({length:52},(_,i)=>task('old-'+i,{provider:'openclaw'}));
  const live=[task('current-0'),task('current-1',{activity:'planning'}),task('current-2',{activity:'running'})];
  send(stale.concat(live));await until(settled(55),'all 55 genuinely active identities must enter');
  assert.equal(await run(`document.getElementById('office').dataset.readability`),'crowded');
  assert.match(await run(`document.getElementById('room-summary').textContent`),/open roster for readable details/);
  const identities=await run(`${bodies}.map(n=>({id:n.dataset.sessionId,name:n.querySelector('.actor-title').textContent}))`);
  await run(`window.liveBodies=new Map(${bodies}.filter(n=>n.dataset.sessionId.startsWith('codex:current-')).map(n=>[n.dataset.sessionId,n]));void 0`);
  const lost=stale.map(s=>({...s,status:'stale',disconnected:true,activity:'unknown'}));
  const truth=JSON.stringify(lost);send(lost.concat(live));await pause(150);
  assert.equal(await run(`${bodies}.length`),55,'an existing body retains its signal grace');
  const before=await run("observedArrivals.filter(e=>e.id?.startsWith('codex:old-')).length");console.log(JSON.stringify({stage:'waiting-for-signal-grace',actors:55}));
  await pause(20100);send(lost.concat(live));
  await until(`${settled(3)}&&Number(document.getElementById('office').dataset.fitScale)>=.65`,'52 lost signals must release floor geometry so current work is readable');
  assert.equal(JSON.stringify(lost),truth,'visual cleanup cannot alter observed session state');
  assert.equal(await run(`[...liveBodies].every(([id,n])=>document.querySelector('.actor[data-session-id="'+id+'"]')===n)`),true,'current bodies are not recreated');
  assert.equal(await run("observedArrivals.filter(e=>e.id?.startsWith('codex:old-')).length"),before,'signal loss cannot emit a successful exit, turn or clone arrival');
  assert.equal(await run(`document.getElementById('office').dataset.readability`),'readable');
  const restored=await run(`({scale:Number(document.getElementById('office').dataset.fitScale),smallestName:Math.min(...${bodies}.map(n=>parseFloat(getComputedStyle(n.querySelector('.actor-title')).fontSize)*new DOMMatrixReadOnly(getComputedStyle(n).transform).m11))})`);
  assert.ok(restored.smallestName>=15,JSON.stringify(restored));
  await run(`document.getElementById('roster-button').click();void 0`);
  await until(`document.getElementById('roster-dialog').open`,'roster remains accessible');
  assert.equal(await run(`document.querySelectorAll('.roster-row').length`),55);
  assert.equal(await run(`[...document.querySelectorAll('.roster-state')].filter(n=>n.textContent.includes('Signal lost')).length`),52);
  assert.equal(await run(`${JSON.stringify(identities)}.every(row=>[...document.querySelectorAll('.roster-row')].some(n=>n.textContent.includes(row.name)))`),true);
  await run(`document.getElementById('roster-dialog').close();document.getElementById('language-button').click();void 0`);
  await until(`document.documentElement.lang==='zh-CN'`,'Chinese copy applies');
  assert.match(await run(`document.getElementById('room-summary').textContent`),/52 位信号中断/);
  checks.push({name:'52 lost signals retain truthful roster identities while three original active bodies recover readable scale',...restored});
  const resumed={...stale[0],lastEventAt:now(),activity:'reading'};
  send([resumed,...lost.slice(1),...live]);await until(settled(4),'fresh work restores the same identity');
  assert.equal(await run(`${bodies}.some(n=>n.dataset.sessionId===${JSON.stringify(resumed.id)})`),true);
  assert.equal(await run(`document.getElementById('roster-button').textContent.includes('55')`),true);
  checks.push({name:'fresh work restores the same parked identity without dropping other observed sessions'});
  // A live child still needs the actual stale parent as its visual split anchor.
  const parent=task('family-root',{status:'stale',activity:'unknown',disconnected:true}),child=task('family-child',{parentId:parent.id});
  send([parent,child]);await until(settled(2),'live child retains its actual stale parent');
  send([parent,{...child,lastEventAt:now()}]);
  await until(settled(2),'active descendant continues to protect its stale anchor');
  checks.push({name:'live descendants retain their real stale ancestor'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
