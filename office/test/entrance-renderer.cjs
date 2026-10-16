'use strict';
// Isolated native regression: the same three mixed-station main sessions plus
// one ordinary new main at both sizes. No provider actions or private logs.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-entry-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win;const errors=[],checks=[];
let settings={language:'zh',sceneTime:'auto',agentScale:1,idleVisitor:false,reducedMotion:false};
const task=(id,activity)=>({id:'codex:'+id,sessionId:id,provider:'codex',title:'Fixture '+id,projectPath:'/fixture/'+id,activity,status:'active',activeTools:1,lastEventAt:Date.now(),events:[],evidence:{source:'hook',confidence:'high'}});
let snapshot={mode:'live',sessions:[],connections:[],now:Date.now()};
const evaluate=source=>win.webContents.executeJavaScript(source,true);
const state=`(()=>{const world=document.getElementById('world').getBoundingClientRect(),scale=world.width/1280;const actors=[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.1).map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),rects=[...n.querySelectorAll('.character-body,.nameplate,.nameplate *')].filter(e=>getComputedStyle(e).display!=='none'&&Number(getComputedStyle(e).opacity)>.1).map(e=>e.getBoundingClientRect());return{id:n.dataset.sessionId,point:{x:m.m41/12.8,y:m.m42/7.2},walking:n.dataset.walking==='true',traffic:n.dataset.traffic,state:n.querySelector('.actor-state').textContent,left:(Math.min(...rects.map(r=>r.left))-world.left)/scale,right:(Math.max(...rects.map(r=>r.right))-world.left)/scale,top:(Math.min(...rects.map(r=>r.top))-world.top)/scale,bottom:(Math.max(...rects.map(r=>r.bottom))-world.top)/scale};});return{actors,doorOpens:window.fixtureDoorOpens||0};})()`;
async function until(source,message,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(source))return;await pause(40);}throw new Error(message);}
function verify(report){for(let i=0;i<report.actors.length;i++){const a=report.actors[i];assert.ok(a.left>=11&&a.right<=1269&&a.top>=71&&a.bottom<=663);for(const b of report.actors.slice(i+1))assert.equal(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1,false,'ordinary bodies and every plate descendant must remain separated: '+a.id+'/'+b.id);}}
const guard=setTimeout(()=>{console.error('Native entrance fixture timed out');app.exit(1);},60000);
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':p=>(settings={...settings,...p}),displays:()=>[]}))ipcMain.handle('office:'+name,(_, ...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  for(const size of [1,1.35]){
    settings={...settings,agentScale:size};snapshot={...snapshot,sessions:['coding','testing','reading'].map((activity,i)=>task('myth-'+i,activity)),now:Date.now()};
    await win.loadFile(path.join(__dirname,'../renderer/index.html'));
    await until(`document.querySelectorAll('.actor').length===3&&[...document.querySelectorAll('.actor')].every(n=>getComputedStyle(n).visibility!=='hidden'&&n.dataset.walking!=='true')`,'the same three source sessions must initially be visible');
    await evaluate(`window.fixtureDoorOpens=0;new MutationObserver(()=>{if(document.getElementById('studio-door').dataset.open==='true')fixtureDoorOpens++}).observe(document.getElementById('studio-door'),{attributes:true,attributeFilter:['data-open']})`);
    snapshot={...snapshot,sessions:snapshot.sessions.concat(task('new-arrival','coding')),now:Date.now()};win.webContents.send('office:snapshot',snapshot);
    let sawWalk=false,firstVisible=null,settled=false,frames=0,last;
    const end=Date.now()+15000;
    while(Date.now()<end){
      last=await evaluate(state);verify(last);frames++;
      const arrival=last.actors.find(actor=>actor.id==='codex:new-arrival');
      if(arrival){if(!firstVisible)firstVisible=arrival.point;sawWalk=sawWalk||arrival.walking;assert.match(arrival.state,/写代码/);if(sawWalk&&!arrival.walking&&!['queued','yielding'].includes(arrival.traffic)&&arrival.point.x<=73&&arrival.point.x>=30&&arrival.point.y>=69){settled=true;break;}}
      await pause(25);
    }
    assert.equal(sawWalk,true,'the newcomer must really walk from the door at '+size);assert.equal(settled,true,'the newcomer must finish its entrance at '+size+': '+JSON.stringify(last));
    assert.ok(Math.hypot(firstVisible.x-87,(firstVisible.y-78)*.5625)<2,'first visible body must originate at the door, not its final seat');
    assert.ok(last.doorOpens>0);assert.equal(last.actors.length,4,'all four actual source sessions stay visible');
    if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,'entrance-'+Math.round(size*100)+'.png'),(await win.webContents.capturePage()).toPNG());}
    checks.push({scale:size,frames,door:true,walk:true,settled:true});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
