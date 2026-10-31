'use strict';
// Native acceptance for the secondary display: every essential label is visible
// without pointer interaction, using the production room, fonts and observer UI.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PROVIDERS:CATALOG}=require('../lib/provider-catalog.cjs');
const Names=require('../lib/agent-persona.js').nicknameSources.flatMap(source=>source.names.map(entry=>entry.name));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-passive-labels-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'en',agentAppearance:'mixed',agentScale:1.35,idleVisitor:false,reducedMotion:true,lowPower:false,roomDesign:'halloween',sceneTime:'afternoon'};
let snapshot={mode:'live',now:Date.now(),sessions:[],connections:[]};const errors=[],checks=[];
const run=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const task=(id,activity,provider='codex',parentId)=>({id,sessionId:id,provider,status:'active',activity,activeTools:1,lastEventAt:Date.now(),events:[],...(parentId?{parentId}:{})});
const send=sessions=>{snapshot={...snapshot,now:Date.now(),sessions};win.webContents.send('office:snapshot',snapshot);};
async function until(code,label,ms=20000){const end=Date.now()+ms;while(Date.now()<end){assert.deepEqual(errors,[]);if(await run(code))return;await pause(30);}throw Error(label+': '+JSON.stringify(await run(`({office:{...document.getElementById('office').dataset},error:document.getElementById('error-message').textContent,actors:[...document.querySelectorAll('.actor')].map(n=>({...n.dataset}))})`)));}
const selector='.actor[data-session-id]';
const settled=count=>`document.querySelectorAll('${selector}').length===${count}&&[...document.querySelectorAll('${selector}')].every(n=>getComputedStyle(n).visibility!=='hidden'&&n.dataset.walking!=='true'&&n.dataset.traffic==='arrived')&&document.getElementById('office').dataset.overflowCount==='0'&&document.getElementById('office').dataset.entranceQueue==='0'`;
const report=`(()=>{const factor=document.getElementById('world').getBoundingClientRect().width/1280;return[...document.querySelectorAll('${selector}')].map(n=>{const p=n.querySelector('.nameplate'),m=new DOMMatrixReadOnly(getComputedStyle(n).transform),unit=factor*Math.hypot(m.a,m.b)*(n.dataset.helper==='true'?.82:1);return{id:n.dataset.sessionId,helper:n.dataset.helper,width:Math.round(p.getBoundingClientRect().width/unit),height:Math.round(p.getBoundingClientRect().height/unit),name:n.querySelector('.actor-title').textContent,relation:n.querySelector('.actor-relation').textContent,provider:n.querySelector('.actor-provider').textContent,state:n.querySelector('.actor-state').textContent,parts:[...p.querySelectorAll('.actor-title,.actor-relation,.actor-provider,.actor-state')].filter(x=>x.textContent).map(x=>({className:x.className,text:x.textContent,display:getComputedStyle(x).display,width:x.clientWidth,scroll:x.scrollWidth,font:parseFloat(getComputedStyle(x).fontSize),visible:x.getBoundingClientRect().height>0}))}})})()`;
const guard=setTimeout(()=>{console.error('Passive nameplate renderer timeout');app.exit(1)},120000);
app.whenReady().then(async()=>{
 for(const[name,action]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,arg)=>action(arg));
 ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
 win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadFile(path.join(__dirname,'../renderer/index.html'));
 await until(`document.getElementById('office').dataset.roomDesign==='halloween'`,'Halloween geometry is committed');
 const roots=['coding','reading','testing','planning'].map((activity,i)=>task('passive:'+i,activity));send(roots);await until(settled(4),'Four live mains fit at the selected 135% size');
 let rows=await run(report);assert.ok(rows.every(r=>r.width===176&&r.height===76));assert.ok(rows.every(r=>r.relation===''),'zero clone rows are omitted');assert.equal(await run(`document.getElementById('office').dataset.fitScale`),'1.3500');
 const audit=rows=>{for(const row of rows)for(const part of row.parts){assert.equal(part.visible,true,part.text+' remains visible');assert.notEqual(part.display,'none');assert.ok(part.scroll<=part.width+1,part.text+' is complete, not clipped');if(part.className==='actor-title')assert.equal(part.font,29);}};audit(rows);
 await pause(2600);fs.writeFileSync('/tmp/office-passive-nameplates.png',(await win.webContents.capturePage()).toPNG());checks.push('four live mains settle in the Halloween room at exact135% with176×76px passive plates');
 // Test all native provider labels, particularly the longest product names,
 // against an attention state that must remain immediately visible.
 for(const provider of CATALOG){const rowsForProvider=roots.map((s,i)=>i? s:{...s,provider:provider.id,activity:'waiting-user',status:'waiting',attention:true,lastEventAt:Date.now()});send(rowsForProvider);await until(`document.querySelector('[data-session-id="passive:0"] .actor-state').textContent==='Waiting for you'`,'Visible user wait');await pause(35);const row=(await run(report)).find(r=>r.id==='passive:0');audit([row]);assert.ok(row.provider.length>0);}
 checks.push('all28 product labels and their waiting states are fully visible without hover or selection');
 await run(`document.getElementById('language-button').click();void 0`);await until(`document.documentElement.lang.startsWith('zh')`,'Chinese labels');send(roots);await until(settled(4),'Four Chinese mains');
 const nameResult=await run(`(()=>{const title=document.querySelector('[data-session-id="passive:0"] .actor-title'),original=title.textContent,names=${JSON.stringify(Names)},bad=[];for(const name of names){title.textContent=name;if(title.scrollWidth>title.clientWidth+1)bad.push({name,width:title.clientWidth,scroll:title.scrollWidth})}title.textContent=original;return{count:names.length,bad}})()`);assert.equal(nameResult.count,155);assert.deepEqual(nameResult.bad,[]);checks.push('all155 complete Shan Hai Jing names fit at29px without truncation');
 // A real helper creates visible ancestry and nonzero root counts; no action
 // is necessary to discover either. Use a feasible two-main family at100%.
 await run(`(()=>{const input=document.getElementById('setting-agentScale');input.value='100';input.dispatchEvent(new Event('change',{bubbles:true}));})();void 0`);
 const helper=task('passive:helper','reading','codex',roots[0].id);send([roots[0],roots[1],helper]);await until(settled(3),'Readable real family');rows=await run(report);audit(rows);assert.match(rows.find(r=>r.id===roots[0].id).relation,/分身 1 · 共 1/);assert.ok(rows.find(r=>r.id===helper.id).relation.includes(rows.find(r=>r.id===roots[0].id).name));
 checks.push('real nonzero clone counts and actual immediate parent remain visible alongside tool and activity');assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,rows,screenshot:'/tmp/office-passive-nameplates.png',errors}));
}).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0)});
