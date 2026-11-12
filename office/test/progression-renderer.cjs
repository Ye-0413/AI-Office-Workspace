'use strict';
// Synthetic unlocks in the production room: decorations, growth, the keepsake stamp and shelf.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Persona=require('../lib/agent-persona.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-progression-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const settings={language:'zh',idleVisitor:false,reducedMotion:true,lowPower:false,sceneWeather:'off'};
const now=Date.now(),ids=[];
for(let index=0;ids.length<2;index++){const id='codex:shelf-'+index,keepsake=Persona.forSession({provider:'codex',id}).keepsake;if(!ids.length||keepsake!==ids[0].keepsake)ids.push({id,keepsake});}
const session=({id})=>({id,sessionId:id.slice(6),provider:'codex',status:'active',activity:'coding',activeTools:0,lastEventAt:now,events:[]});
const snapshot={mode:'live',now,sessions:ids.map(session),connections:[]};
const unlocks={ok:true,keepsakes:[ids[0].keepsake],decorations:['fern','trophy'],growth:2,nextGrowth:400,turns:150,progress:{fern:1,lamp:.4,trophy:1,bunting:.2,clock:.1},earnedAt:{}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win;const errors=[];let asked=0;
const guard=setTimeout(()=>{console.error('Progression fixture timed out');app.exit(1);},60000);
async function until(predicate,label){const end=Date.now()+20000;while(Date.now()<end){if(await predicate())return;await pause(60);}throw Error(label);}
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>({...snapshot,now:Date.now()}),settings:()=>settings,'set-settings':patch=>Object.assign(settings,patch),displays:()=>[],progression:()=>{asked++;return unlocks;}}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  const run=source=>win.webContents.executeJavaScript(source,true);
  await until(async()=>(await run(`document.querySelectorAll('.actor[data-session-id]').length`))===2,'both observed sessions are drawn');
  await until(()=>run(`document.querySelectorAll('.room-decoration').length===2&&[...document.querySelectorAll('.room-decoration')].every(image=>image.complete&&image.naturalWidth>0)`),'earned decorations load from packaged original art');
  assert.equal(await run(`document.getElementById('office').dataset.growth`),'2');
  await until(()=>run(`document.querySelector('.actor[data-session-id="${ids[0].id}"]')?.dataset.keepsakeEarned==='true'`),'the companion whose keepsake was earned shows its stamp');
  const stamps=JSON.parse(await run(`JSON.stringify([...document.querySelectorAll('.actor[data-session-id]')].map(node=>({id:node.dataset.sessionId,earned:node.dataset.keepsakeEarned,display:getComputedStyle(node.querySelector('.actor-keepsake')).display,growth:getComputedStyle(node.querySelector('.actor-button'),'::after').content})))`));
  const earned=stamps.find(item=>item.id===ids[0].id),other=stamps.find(item=>item.id===ids[1].id);
  assert.equal(earned.display,'flex');assert.equal(other.earned,'false');assert.equal(other.display,'none');
  assert.ok(stamps.every(item=>item.growth.length>=4),'stage two shows a two-mark accessory on each creature');
  await run(`document.querySelector('.keepsake-shelf-button').click()`);
  await until(()=>run(`document.querySelector('.keepsake-shelf-dialog').open`),'the shelf opens');
  assert.equal(await run(`document.querySelectorAll('.keepsake-item').length`),12);
  assert.equal(await run(`document.querySelectorAll('.keepsake-item[data-earned="true"]').length`),1);
  assert.equal(await run(`document.querySelectorAll('.decoration-item[data-earned="true"]').length`),2);
  assert.match(await run(`document.querySelector('.growth-stage').textContent`),/第 2 \/ 3 阶段 · 再完成 250 轮/);
  assert.equal(await run(`document.querySelector('.keepsake-shelf-dialog').matches(':modal')`),true);
  await pause(400);
  const preview='/tmp/office-keepsake-shelf.png';fs.writeFileSync(preview,(await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.keepsake-shelf-dialog .dialog-close').click()`);
  const room='/tmp/office-progression-room.png';await pause(200);fs.writeFileSync(room,(await win.webContents.capturePage()).toPNG());
  assert.ok(asked>=1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks:['earned decorations, growth marks and only the earned keepsake stamp render from the unlock ledger; the shelf lists all twelve keepsakes'],preview,room}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
