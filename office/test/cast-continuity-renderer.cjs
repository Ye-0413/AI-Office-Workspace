'use strict';
// Native production-page frame sampling. No AI messages or configuration writes.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-continuity-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
let win;const errors=[],checks=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
let settings={language:'zh',agentScale:1.35,reducedMotion:false,idleVisitor:false,sceneTheme:'spring',sceneWeather:'off'};
let snapshot={sessions:[],connections:[],mode:'live',now:Date.now()};
const task=(id,activity='coding')=>({id:'codex:'+id,sessionId:id,provider:'codex',status:'active',activity,activeTools:1,lastEventAt:Date.now(),events:[],title:id,projectPath:'/fixture/continuity'});
const run=code=>win.webContents.executeJavaScript(code,true);
async function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
async function until(code,label,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(await run(code))return;await wait(30);}throw Error(label);}
async function sample(label,action){
  await run(`window.retainedCast=new Map([...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99).map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[n.dataset.sessionId,{node:n,x:m.m41,y:m.m42,at:performance.now(),rig:n.querySelector('.ap-rig')}]}));void 0`);
  await action();
  const report=await run(`new Promise(resolve=>{const started=performance.now(),hits=[],jumps=[],hidden=[],replaced=[];let frames=0,maxGap=0,last=started;
    function tick(now){
      frames++;maxGap=Math.max(maxGap,now-last);last=now;
      const all=[...document.querySelectorAll('.actor')],visible=all.filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.15);
      const boxes=visible.map(n=>{const parts=[n.querySelector('.character-body'),n.querySelector('.nameplate')].map(p=>p.getBoundingClientRect());return{n,id:n.dataset.sessionId,left:Math.min(...parts.map(r=>r.left)),right:Math.max(...parts.map(r=>r.right)),top:Math.min(...parts.map(r=>r.top)),bottom:Math.max(...parts.map(r=>r.bottom))}});
      for(const[id,old]of retainedCast){const n=all.find(n=>n.dataset.sessionId===id);if(n!==old.node||n.querySelector('.ap-rig')!==old.rig){replaced.push(id);continue;}const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);if(Math.hypot(m.m41-old.x,m.m42-old.y)>400*(now-old.at)/1000+4)jumps.push(id);old.x=m.m41;old.y=m.m42;old.at=now;if(Number(getComputedStyle(n).opacity)<.99||getComputedStyle(n).visibility==='hidden')hidden.push(id);}
      const endpoint=(a,b)=>a.n.dataset.endpointOverlap===b.id||(['splitting','returning','absorbing'].includes(a.n.dataset.clonePhase)&&[a.n.dataset.cloneOrigin,a.n.dataset.cloneTarget].includes(b.id));
      for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(!endpoint(a,b)&&!endpoint(b,a)&&a.left<b.right-.7&&b.left<a.right-.7&&a.top<b.bottom-.7&&b.top<a.bottom-.7)hits.push([a.id,b.id]);}
      if(now-started<1600)requestAnimationFrame(tick);else resolve({frames,maxGap,hits:hits.slice(0,10),jumps:[...new Set(jumps)],hidden:[...new Set(hidden)],replaced:[...new Set(replaced)],count:visible.length,total:all.length,queued:Number(document.getElementById('office').dataset.entranceQueue)});
    }requestAnimationFrame(tick);
  })`);
  assert.deepEqual(report.jumps,[],label+' must keep real foot velocity continuous');
  assert.deepEqual(report.hidden,[],label+' must keep every admitted body opaque');
  assert.deepEqual(report.replaced,[],label+' must preserve actual body and rig DOM');
  assert.deepEqual(report.hits,[],label+' must avoid body/nameplate overlap throughout walking and scaling');
  assert.equal(report.total,snapshot.sessions.length,label+' must retain every authoritative identity');
  assert.equal(report.count+report.queued,report.total,label+' must account explicitly for finite entrance waiting');
  assert.ok(report.frames>=31,label+' sampled fewer than 31 real animation frames: '+JSON.stringify(report));checks.push({name:label,...report});return report;
}
const guard=setTimeout(()=>{console.error('Continuity fixture timed out');app.exit(1);},180000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  let cast=[task('a','planning'),task('b','reading')];snapshot={...snapshot,sessions:cast};await win.loadFile(path.join(__dirname,'../renderer/index.html'));await until(`[...document.querySelectorAll('.actor')].length===2&&[...document.querySelectorAll('.actor')].every(n=>getComputedStyle(n).visibility!=='hidden'&&n.dataset.traffic==='arrived'&&n.dataset.walking!=='true')`,'initial bodies must physically arrive');
  await sample('functional change keeps continuous feet before and during real navigation',async()=>{cast=cast.map(s=>({...s,activity:'coding',lastEventAt:Date.now()}));await send(cast);});
  const sizeBefore=await run(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.actor')).transform).m11`);
  await sample('small cast shrinks continuously to a smaller preference',()=>run(`document.getElementById('setting-agentScale').value='65';document.getElementById('setting-agentScale').dispatchEvent(new Event('change',{bubbles:true}));void 0`));
  const sizeAfter=await run(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.actor')).transform).m11`);assert.ok(sizeBefore-sizeAfter>.05,'fixture must actually exercise a scale transition');
  await sample('small cast grows continuously while retaining the actual foot',()=>run(`document.getElementById('setting-agentScale').value='135';document.getElementById('setting-agentScale').dispatchEvent(new Event('change',{bubbles:true}));void 0`));
  await sample('new helper physically splits without cutting retained agents',async()=>{cast.push({...task('helper','testing'),parentId:cast[0].id});await send(cast);});
  await sample('rapid arrivals preserve safety during an unfinished fit',async()=>{for(const count of [7,11,17]){const start=cast.length;cast=cast.concat(Array.from({length:count},(_,i)=>task('rapid-'+(start+i))));await send(cast);await wait(80);}});
  await sample('burst of 100 agents keeps admitted bodies continuous and reserves finite entrances',async()=>{cast=cast.concat(Array.from({length:100-cast.length},(_,i)=>task('extra-'+i)));await send(cast);});
  await sample('smaller size retargets continuously',()=>run(`document.getElementById('setting-agentScale').value='65';document.getElementById('setting-agentScale').dispatchEvent(new Event('change',{bubbles:true}));void 0`));
  await sample('larger size retargets continuously',()=>run(`document.getElementById('setting-agentScale').value='135';document.getElementById('setting-agentScale').dispatchEvent(new Event('change',{bubbles:true}));void 0`));
  await sample('venue change preserves every admitted body and its current real route',()=>run(`document.querySelector('.venue-select').value='teahouse';document.querySelector('.venue-select').dispatchEvent(new Event('change',{bubbles:true}));void 0`));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
