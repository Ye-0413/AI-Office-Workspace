'use strict';
// Real production DOM, native fonts and isolated observations; not a provider audit.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installAudit}=require('./support/walking-native-audit.cjs');
const office=path.resolve(__dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-dense-nameplate-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
const errors=[],checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win,stage='cold-start';
let settings={language:'zh',agentScale:1,reducedMotion:true,lowPower:false,idleVisitor:false,sceneVenue:'workshop',sceneTheme:'spring',sceneWeather:'off'};
const task=(i,activity,parentId)=>({id:'codex:transfer-'+String(i).padStart(3,'0'),sessionId:'transfer-'+i,provider:'codex',status:'active',activity,parentId,activeTools:['idle','unknown'].includes(activity)?0:1,lastEventAt:Date.now(),projectPath:'/fixture/nameplates',events:[],evidence:{source:'hook',confidence:'explicit'}});
const kinds=['reading','planning','coding','testing','idle','unknown'];
let cast=Array.from({length:12},(_,i)=>task(i,kinds[i%6]));
const parent=cast[2],helper=task(12,'planning',parent.id);cast.push(helper);
let snapshot={mode:'live',now:Date.now(),connections:[],sessions:cast};
const run=code=>win.webContents.executeJavaScript(code,true);
function send(sessions){cast=sessions;snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
const settled=count=>`(()=>{const ns=[...document.querySelectorAll('.actor[data-session-id]')];return ns.length===${count}&&Number(document.getElementById('office').dataset.entranceQueue)===0&&ns.every(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.walking!=='true'&&!['queued','waiting-space','yielding'].includes(n.dataset.traffic)&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase)&&!n.getAnimations().some(a=>a.pending||a.playState==='running'));})()`;
async function until(code,label,limit=50000){const end=Date.now()+limit;while(Date.now()<end){if(await run(code))return;await pause(35);}throw Error(stage+': '+label);}
async function capture(name){const dir=process.env.MINI_OFFICE_NAMEPLATE_PREVIEW_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function inspect(name,count,dense=true){
 stage=name;
 const rows=await run(`(()=>{const factor=document.getElementById('world').getBoundingClientRect().width/1280;const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return [...document.querySelectorAll('.actor[data-session-id]')].map(n=>{const p=n.querySelector('.nameplate'),title=n.querySelector('.actor-title'),relation=n.querySelector('.actor-relation'),m=new DOMMatrixReadOnly(getComputedStyle(n).transform),scale=Math.hypot(m.m11,m.m12),unit=scale*factor;return{id:n.dataset.sessionId,helper:n.dataset.helper,active:n.dataset.activeClones,total:n.dataset.totalClones,name:title.textContent,relation:relation.textContent,aria:n.querySelector('.actor-button').getAttribute('aria-label'),fullName:title.title,relationTitle:relation.title,font:getComputedStyle(title).fontSize,relationFont:getComputedStyle(relation).fontSize,nowrap:getComputedStyle(title).whiteSpace,ellipsis:getComputedStyle(title).textOverflow,scale,unit,z:getComputedStyle(n).zIndex,plate:rect(p),body:rect(n.querySelector('.character-body')),viewport:{width:innerWidth,height:innerHeight},clock:rect(document.getElementById('day-clock')),title:rect(title),relationRect:rect(relation),parts:[...p.children].filter(x=>getComputedStyle(x).display!=='none').map(x=>({className:x.className,rect:rect(x),opacity:getComputedStyle(x).opacity})),subline:getComputedStyle(n.querySelector('.actor-subline')).display};});})()`);
 await capture(name);
 assert.equal(rows.length,count);
 for(const r of rows){
  assert.equal(r.font,dense?'26px':'24px','actual native nickname size: '+r.id);
  assert.equal(r.z,'10');assert.ok(r.unit>0);
  if(count===13)assert.ok(r.scale>=.4-.00001,'known13-body distribution retains the proved .4 scale');
  assert.ok(Math.abs(r.plate.width/r.unit-220)<.2,'same physical 220px plate');
  assert.ok(Math.abs(r.plate.height/r.unit-63)<.2,'same physical 63px plate');
  assert.ok(r.aria.includes(r.name),'complete real nickname remains accessible');
  assert.equal(r.fullName,r.name,'ellipsis retains complete nickname tooltip');
  assert.ok(r.aria.includes(r.relationTitle.split(' · Total retains')[0].split(' · 累计保留')[0]),'complete relation remains accessible');
  assert.ok(r.relation.length>0,'real family relation remains visible');
  assert.ok(r.relationRect.height>0&&r.relationRect.top>=r.title.bottom-.1*r.unit,'statistics below nickname');
  if(dense){assert.equal(r.nowrap,'nowrap');assert.equal(r.ellipsis,'ellipsis');assert.equal(r.subline,'none');assert.ok(Number.parseFloat(r.relationFont)>=14);}
  for(const p of r.parts){const q=p.rect,t=.35*r.unit;assert.ok(q.left>=r.plate.left-t&&q.right<=r.plate.right+t&&q.top>=r.plate.top-t&&q.bottom<=r.plate.bottom+t,'complete '+p.className+' lies inside plate: '+JSON.stringify(r));}
  const badge=r.parts.find(p=>p.className.includes('family-badge'));
  if(badge){const q=badge.rect;assert.ok(q.left>=r.title.right-.35*r.unit||q.top>=r.title.bottom-.35*r.unit||q.bottom<=r.title.top+.35*r.unit,'family badge cannot cover the nickname');}
 }
 const intersects=(a,b,t=.7)=>a.left<b.right-t&&b.left<a.right-t&&a.top<b.bottom-t&&b.top<a.bottom-t;
 const boxes=rows.map(r=>({id:r.id,left:Math.min(r.body.left,r.plate.left),right:Math.max(r.body.right,r.plate.right),top:Math.min(r.body.top,r.plate.top),bottom:Math.max(r.body.bottom,r.plate.bottom)}));
 for(let i=0;i<boxes.length;i++){const a=boxes[i],r=rows[i];assert.ok(a.left>=-.8&&a.right<=r.viewport.width+.8&&a.top>=-.8&&a.bottom<=r.viewport.height+.8,'actual full body/plate inside viewport');assert.equal(intersects(a,r.clock),false,'actual full body/plate clears clock');for(let j=i+1;j<boxes.length;j++)assert.equal(intersects(a,boxes[j]),false,'actual full bodies/plates cannot overlap: '+a.id+'/'+boxes[j].id);}
 const main=rows.find(r=>r.id===parent.id);
 assert.ok(main&&main.helper==='false');
 const expected=settings.language==='zh'?`活跃 ${main.active} · 历史 ${main.total}`:`Active ${main.active} · Total ${main.total}`;
 if(dense)assert.equal(main.relation,expected,'actual ledger counts stay under main');
 const child=rows.find(r=>r.id===helper.id);if(child)assert.ok(child.relation.includes(main.name),'child retains actual parent name');
 checks.push({name,visible:rows.length,font:rows[0].font,plateWorld:[220,63],minimumScreenUnit:Math.min(...rows.map(r=>r.unit)),mainCounts:{active:Number(main.active),historical:Number(main.total)},longestRealEnglishName:Math.max(...rows.map(r=>r.name.length))});
 return rows;
}
const guard=setTimeout(()=>{console.error('Dense nameplate fixture timed out at '+stage);app.exit(1);},180000);
app.whenReady().then(async()=>{
 for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_, ...args)=>fn(...args));
 ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
 win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(office,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadFile(path.join(office,'renderer/index.html'));
 await until(settled(13),'cold nonempty real snapshot must admit all13');
 await inspect('cold-thirteen-zh',13);
 await run('('+installAudit.toString()+')()');
 await run(`window.nameplateOriginals=new Map([...document.querySelectorAll('.actor[data-session-id]')].map(n=>[n.dataset.sessionId,{node:n,body:n.querySelector('.character-body'),rig:n.querySelector('.ap-rig'),transform:n.style.transform,animations:n.querySelector('.character-body').getAnimations({subtree:true}).map(animation=>({animation,time:animation.currentTime}))}]));void 0`);
 for(let i=0;i<4;i++){send(cast.map(s=>({...s,title:'Metadata '+i,lastEventAt:Date.now()})));await pause(90);}
 assert.equal(await run(`[...nameplateOriginals].every(([id,o])=>{const n=document.querySelector('.actor[data-session-id="'+id+'"]');return n===o.node&&n.querySelector('.character-body')===o.body&&n.querySelector('.ap-rig')===o.rig&&n.style.transform===o.transform&&o.animations.every(a=>a.animation.currentTime===a.time);})`),true,'metadata retains bodies, actual feet and original paused clocks');
 checks.push({name:'four quiet metadata snapshots retain original bodies and physical feet; any available paused clocks keep their times'});
 await run(`document.querySelector('.actor[data-session-id="${parent.id}"] .actor-button').click();void 0`);await pause(550);
 await inspect('selected-main-zh',13);
 await run(`document.getElementById('language-button').click();void 0`);
 await until(`document.documentElement.lang==='en'`,'real language button changes language',3000);
 await until(settled(13),'English geometry must settle');
 const en=await inspect('thirteen-en',13);assert.ok(en.every(r=>/^[A-Z][a-z]{3,6}$/.test(r.name)),'actual English aliases use the requested short single-word persona names');
 win.setContentSize(800,450);await pause(650);await until(settled(13),'small viewport fit must settle');await inspect('thirteen-en-800',13);
 win.setContentSize(800,800);await pause(650);await until(settled(13),'letterboxed fit must settle');
 assert.ok(await run("document.getElementById('world').getBoundingClientRect().top>20"),'actual nonzero world letterbox offset');await inspect('thirteen-en-800-letterbox',13);
 win.setContentSize(1280,720);await pause(650);await until(settled(13),'full viewport fit must restore');
 const fullCast=cast.map(s=>({...s}));
 const parentFoot=await run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.actor[data-session-id="${parent.id}"]')).transform);return{x:m.m41,y:m.m42};})()`);
 send(cast.filter(s=>s.id!==parent.id));await until(`document.querySelector('.actor[data-session-id="${parent.id}"]')?.dataset.cloneHold==='true'&&${settled(13)}`,'honestly absent main remains for its observed helper');
 send(cast.map(s=>s.id===helper.id?{...s,status:'stale',disconnected:true,activeTools:0,lastEventAt:Date.now()}:s));
 await until(`document.querySelector('.actor[data-session-id="${parent.id}"]')?.dataset.activeClones==='0'&&${settled(13)}`,'held main statistics follow actual stale helper evidence');
 await inspect('held-main-stale-helper-en',13);
 await run(`document.getElementById('language-button').click();void 0`);await until(`document.documentElement.lang==='zh-CN'&&${settled(13)}`,'held-main language and geometry must update');await inspect('held-main-stale-helper-zh',13);
 const heldFoot=await run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.actor[data-session-id="${parent.id}"]')).transform);return{x:m.m41,y:m.m42};})()`);assert.ok(Math.hypot(heldFoot.x-parentFoot.x,heldFoot.y-parentFoot.y)<.01,'label evidence and language cannot move the actual held parent');
 send(fullCast.map(s=>({...s,lastEventAt:Date.now(),turnId:'nameplate-fresh'})));await until(settled(13),'fresh observed parent and helper restore');await run(`document.getElementById('language-button').click();void 0`);await until(`document.documentElement.lang==='en'&&${settled(13)}`,'restore English before completion history');
 send(cast.map(s=>s.id===helper.id?{...s,status:'closed',closed:true,activity:'idle',activeTools:0,turnCompletedAt:Date.now(),lastEventAt:Date.now()}:s));
 await until(settled(12),'real confirmed helper completion must remove its body');
 const history=await inspect('completed-helper-history-en',12);const main=history.find(r=>r.id===parent.id);assert.equal(main.active,'0');assert.equal(main.total,'1');
 await run(`const input=document.getElementById('setting-reducedMotion');input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));void 0`);
 await until(`document.getElementById('office').dataset.reducedMotion==='false'&&${settled(12)}`,'normal physical presentation must settle');
 await run(`window.nameplateRunningClocks=[...document.querySelectorAll('.actor[data-session-id] .character-body')].flatMap(body=>body.getAnimations({subtree:true})).filter(animation=>animation.effect.getTiming().iterations===Infinity&&animation.playState==='running').map(animation=>({animation,time:animation.currentTime}));void 0`);
 assert.ok(await run('nameplateRunningClocks.length>0'),'normal production work exposes actual nonempty running clocks');
 for(let i=0;i<4;i++){send(cast.map(s=>({...s,title:'Running metadata '+i,lastEventAt:Date.now()})));await pause(90);}
 assert.equal(await run(`nameplateRunningClocks.every(o=>o.animation.playState==='running'&&o.animation.currentTime>o.time&&o.animation.effect.target.isConnected&&o.animation.effect.target.getAnimations().includes(o.animation))`),true,'actual running CSS owners advance without replacement across metadata');
 checks.push({name:'nonempty original running work clocks advance on the same Animation objects across four metadata snapshots',clocks:await run('nameplateRunningClocks.length')});
 const leaving=cast.find(s=>s.id==='codex:transfer-011');
 await run(`crowdAudit.begin('real12to11 retirement retains dense plate until actual body leaves',${JSON.stringify(cast.filter(s=>s.id!==helper.id).map(s=>s.id))},[${JSON.stringify(leaving.id)}]);window.nameplateRetirement={frames:0,retiringFrames:0,violations:[],active:true};function auditNameplateDensity(){const a=nameplateRetirement;if(!a.active)return;a.frames++;const ns=[...document.querySelectorAll('.actor[data-session-id]')];if(ns.some(n=>n.dataset.sessionId===${JSON.stringify(leaving.id)}))a.retiringFrames++;for(const n of ns){const expected=ns.length>=12?'26px':'24px';if(getComputedStyle(n.querySelector('.actor-title')).fontSize!==expected)a.violations.push('density disagrees with actual bodies');}requestAnimationFrame(auditNameplateDensity);}requestAnimationFrame(auditNameplateDensity);void 0`);
 send(cast.map(s=>s.id===leaving.id?{...s,status:'closed',closed:true,activity:'idle',activeTools:0,lastEventAt:Date.now()}:s));
 await until(settled(11),'actual main must finish its physical doorway exit');
 await pause(550);
 const retirement=await run(`nameplateRetirement.active=false;({density:nameplateRetirement,audit:crowdAudit.finish()})`);
 assert.ok(retirement.density.frames>=31&&retirement.density.retiringFrames>=31,'at least31 real retiring body frames');assert.deepEqual(retirement.density.violations,[]);assert.deepEqual(retirement.audit.violations,[]);assert.ok(retirement.audit.distinctFootPositions[leaving.id]>=31,'retiring main must really walk');checks.push(retirement);
 await inspect('eleven-full-nameplate-en',11,false);
 const second=cast.find(s=>s.id==='codex:transfer-010'),newMain=task(13,'reading');
 await run(`crowdAudit.forget(${JSON.stringify(leaving.id)});crowdAudit.begin('actual11to12 density increase during an original main exit',${JSON.stringify(cast.filter(s=>![helper.id,leaving.id].includes(s.id)).map(s=>s.id))},[${JSON.stringify(second.id)}]);void 0`);
 send(cast.map(s=>s.id===second.id?{...s,status:'closed',closed:true,activity:'idle',activeTools:0,lastEventAt:Date.now()}:s));
 await until(`(()=>{const n=document.querySelector('.actor[data-session-id="${second.id}"]');if(!n)return false;return n.getAnimations().some(a=>{if(a.pending||a.playState!=='running'||a.effect.target!==n)return false;const k=a.effect.getKeyframes();if(k.length<2||!k[0].transform)return false;const progress=a.effect.getComputedTiming().progress,m=new DOMMatrixReadOnly(getComputedStyle(n).transform),first=new DOMMatrixReadOnly(k[0].transform);return progress>.15&&progress<.85&&Math.hypot(m.m41-first.m41,m.m42-first.m42)>=24;});})()`,'second original main must physically walk before dense admission');
 await run(`window.nameplateIncrease={frames:0,compactDuringOldExit:0,violations:[],active:true};function auditNameplateIncrease(){const a=nameplateIncrease;if(!a.active)return;a.frames++;const ns=[...document.querySelectorAll('.actor[data-session-id]')];if(ns.length>=12&&ns.some(n=>n.dataset.sessionId===${JSON.stringify(second.id)}))a.compactDuringOldExit++;for(const n of ns)if(getComputedStyle(n.querySelector('.actor-title')).fontSize!==(ns.length>=12?'26px':'24px'))a.violations.push('new admission density disagrees with actual bodies');requestAnimationFrame(auditNameplateIncrease);}requestAnimationFrame(auditNameplateIncrease);void 0`);
 send(cast.concat(newMain));await until(settled(11),'new real main must enter while the second exit drains');await pause(550);
 const increase=await run(`nameplateIncrease.active=false;({density:nameplateIncrease,audit:crowdAudit.finish()})`);
 assert.ok(increase.density.frames>=31&&increase.density.compactDuringOldExit>=31,'dense admission overlaps at least31 actual frames of the existing exit');assert.deepEqual(increase.density.violations,[]);assert.deepEqual(increase.audit.violations,[]);assert.ok(increase.audit.distinctFootPositions[second.id]>=31&&increase.audit.distinctFootPositions[newMain.id]>=31,'old exit and new main each physically walk');checks.push(increase);
 await inspect('eleven-after-real-in-flight-admission-en',11,false);

 assert.equal(await run(`[...nameplateOriginals].filter(([id])=>!${JSON.stringify([helper.id,leaving.id,second.id])}.includes(id)).every(([id,o])=>{const n=document.querySelector('.actor[data-session-id="'+id+'"]');return n===o.node&&n.querySelector('.character-body')===o.body&&n.querySelector('.ap-rig')===o.rig;})`),true,'original surviving bodies and rigs retain identity through density change');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,scope:'actual-native-dense-nameplates',checks,errors}));
}).catch(error=>{console.error(stage,error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
