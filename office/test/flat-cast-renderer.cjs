'use strict';
// Production-page QA using isolated synthetic observations; no provider changes.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-flat-cast-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
let win;const checks=[],errors=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let settings={language:'zh',agentScale:1.35,reducedMotion:true,idleVisitor:false,sceneVenue:'workshop',sceneTheme:'auto',sceneWeather:'auto',selectedProject:'/OLD/SAVED/FILTER'};
let snapshot={mode:'live',sessions:[],connections:[],now:Date.now()};
const task=(id,activity='coding',extra={})=>({id:'codex:'+id,sessionId:id,provider:'codex',activity,status:'active',activeTools:activity==='unknown'?0:1,lastEventAt:Date.now(),projectPath:'/fixture/project-'+id,title:'Fixture '+id,events:[],evidence:{source:'hook',confidence:'explicit'},...extra});
const run=code=>win.webContents.executeJavaScript(code,true),bodySelector='.actor[data-session-id]';
const visible=`[...document.querySelectorAll('${bodySelector}')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&getComputedStyle(n).display!=='none'&&Number(getComputedStyle(n).opacity)>.1)`;
function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
async function until(code,message,limit=20000){const end=Date.now()+limit;while(Date.now()<end){if(await run(code))return;await pause(30);}throw new Error(message+': '+await run(`JSON.stringify({ids:${visible}.map(n=>n.dataset.sessionId),error:document.getElementById('error-message')?.textContent})`));}
async function inspectCast(expected){const report=await run(`(()=>{const actors=${visible},boxes=actors.map(n=>{const parts=[n.querySelector('.character-body'),...n.querySelectorAll('.nameplate,.nameplate *')].filter(p=>getComputedStyle(p).display!=='none').map(p=>p.getBoundingClientRect());return{id:n.dataset.sessionId,left:Math.min(...parts.map(r=>r.left)),right:Math.max(...parts.map(r=>r.right)),top:Math.min(...parts.map(r=>r.top)),bottom:Math.max(...parts.map(r=>r.bottom))}});return{ids:actors.map(n=>n.dataset.sessionId),scales:[...new Set(actors.map(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).m11.toFixed(6)))],layers:[...new Set(actors.map(n=>getComputedStyle(n).zIndex))],hits:boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.left<b.right-.6&&a.right>b.left+.6&&a.top<b.bottom-.6&&a.bottom>b.top+.6).map(b=>[a.id,b.id])),outside:boxes.filter(b=>b.left<0||b.top<0||b.right>innerWidth+.6||b.bottom>innerHeight+.6).map(b=>b.id),paginationHidden:document.getElementById('pagination').hidden,filterHidden:document.getElementById('room-switcher').hidden}})()`);assert.equal(report.ids.length,expected);assert.equal(report.scales.length,1,'main and helper bodies use the same physical scale');assert.deepEqual(report.layers,['10']);assert.deepEqual(report.hits,[]);assert.deepEqual(report.outside,[]);assert.equal(report.paginationHidden,true);assert.equal(report.filterHidden,true);return report;}
const guard=setTimeout(()=>{console.error('Flat cast native fixture timed out');app.exit(1);},180000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const roots=Array.from({length:50},(_,i)=>task('root-'+String(i).padStart(2,'0'),['reading','coding','planning','unknown','testing'][i%5]));
  const helpers=Array.from({length:50},(_,i)=>task('helper-'+String(i).padStart(2,'0'),i%3?'coding':'unknown',{parentId:roots[i%roots.length].id}));
  snapshot={...snapshot,sessions:roots.concat(helpers)};
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await until(`${visible}.length===100`,'all 100 actual roots and helpers must be admitted in reduced-motion mode');
  const first=await inspectCast(100);checks.push({name:'100 actual cross-project roots/helpers visible on one equal plane',scale:first.scales[0]});
  await run(`window.originalFlatNodes=new Map(${visible}.map(n=>[n.dataset.sessionId,n]));window.flatRemoved=[];new MutationObserver(rs=>{for(const r of rs)for(const n of r.removedNodes)if(n.matches?.('${bodySelector}'))flatRemoved.push(n.dataset.sessionId)}).observe(document.getElementById('actors'),{childList:true});void 0`);
  await run(`window.poseBaseline=new Map(${visible}.map(n=>[n.dataset.sessionId,{image:n.querySelector('.character-body>img'),src:n.querySelector('.character-body>img').src,rig:n.querySelector('.ap-rig'),transform:n.style.transform,animations:n.querySelector('.avatar-performance')?.getAnimations({subtree:true}).map(a=>({animation:a,time:a.currentTime}))||[]} ]));void 0`);
  for(let i=0;i<3;i++){send(snapshot.sessions.map(session=>({...session,lastEventAt:Date.now()})));await pause(90);}
  assert.equal(await run(`[...poseBaseline].every(([id,p])=>{const n=document.querySelector('.actor[data-session-id="'+id+'"]');return n&&n.querySelector('.character-body>img')===p.image&&p.image.src===p.src&&n.querySelector('.ap-rig')===p.rig&&n.style.transform===p.transform&&p.animations.every(old=>old.animation.currentTime===old.time)})`),true,'reduced-motion same-activity snapshots preserve bitmap src, rig identity, paused clocks and physical foot position');
  checks.push({name:'reduced-motion heartbeats preserve asset, original rig and physical foot positions'});
  for(const venue of ['teahouse','observatory','workshop']){
    await run(`(()=>{const select=document.querySelector('.venue-select');if(!select)throw new Error('Missing real venue selector');select.value=${JSON.stringify(venue)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(`document.getElementById('office').dataset.venue===${JSON.stringify(venue)}`,'venue callback must save the requested scalar ID');await inspectCast(100);
    assert.equal(settings.sceneVenue,venue);assert.equal(await run(`[...poseBaseline].every(([id,p])=>{const n=document.querySelector('.actor[data-session-id="'+id+'"]');return n.style.transform===p.transform&&n.querySelector('.character-body>img').src===p.src&&n.querySelector('.ap-rig')===p.rig})`),true,'decorative scene switch must preserve actual pose and position');assert.equal(await run(`[...originalFlatNodes].every(([id,n])=>document.querySelector('.actor[data-session-id="'+id+'"]')===n)`),true,'venue selection must not replace real actor DOM');
  }
  assert.deepEqual(await run('flatRemoved'),[]);checks.push({name:'three venue switches keep all actor nodes, identities and equal bounds'});
  await run(`document.querySelector('.actor[data-session-id="${roots[0].id}"] .actor-button').click();document.querySelector('.actor[data-session-id="${roots[0].id}"] .actor-button').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));void 0`);await pause(3400);await inspectCast(100);
  assert.equal(await run(`document.getElementById('error-message').hidden`),true,'crowded-grid greeting must not queue old furniture routes or dereference an unknown stage');checks.push({name:'reduced-motion greeting retains the same fitted seat without route error'});
  // The separate walking fixture proves 100 real entrances. This dense cast
  // exercises reduced motion, then drains before testing ordinary navigation.
  send([]);await until(`document.querySelectorAll('.actor').length===0`,'quiet departures must finish');
  await run(`const input=document.getElementById('setting-reducedMotion');input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`document.getElementById('office').dataset.reducedMotion==='false'`,'normal motion setting must apply');
  const allSettled=`${visible}.every(n=>n.dataset.traffic==='arrived'&&n.dataset.walking!=='true'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase))`;
  // Start a clean small cast to exercise a helper finishing during a new fit.
  const main=task('return-root','planning'),helper=task('return-helper','coding',{parentId:main.id});
  send([main,helper]);await until(`${visible}.length===2&&${allSettled}`,'small cast must physically reach both observed work areas');
  const stopped={...helper,status:'idle',activity:'idle',activeTools:0,lastEventAt:Date.now(),turnCompletedAt:Date.now()};send([main,stopped]);
  await until(`document.querySelector('.actor[data-session-id="${helper.id}"]')?.dataset.clonePhase==='returning'`,'helper must start its finite return');
  send([main,stopped,task('during-return','reading')]);await until(`!document.querySelector('.actor[data-session-id="${helper.id}"]')`,'physical return must finish after a new fit');
  assert.equal(await run(`!!document.querySelector('.actor[data-session-id="${helper.id}"]')`),false,'another fit must not cancel and forget the completed helper return');
  const resumed={...helper,status:'active',activity:'unknown',activeTools:0,lastEventAt:Date.now()+5,turnId:'fresh-unknown'};send([main,resumed,task('during-return','reading')]);
  await until(`${visible}.some(n=>n.dataset.sessionId==="${helper.id}"&&Number(getComputedStyle(n).opacity)>.99)`,'fresh active unknown helper must visibly recover after the bounded shared fit');await until(`${visible}.length===3&&${allSettled}`,'all three bodies must reach their actual stations');await inspectCast(3);checks.push({name:'return survives a new fit and active unknown helper visibly resumes the actual same identity'});
  // Trigger social through the actual venue mechanism, without changing facts.
  await pause(1150);await run(`(()=>{const button=document.querySelector('.venue-control[data-type="blueprint"],.venue-control');if(!button)throw new Error('Missing real scene control');button.click()})()`);
  await until(`document.querySelectorAll('.agent-social-vignette').length===1`,'real venue mechanism must trigger the eligible pair decoration');
  const socialState=await run(`({kind:document.querySelector('.agent-social-vignette').dataset.socialKind,hands:document.querySelectorAll('.social-hand').length})`);assert.equal(socialState.hands,2);
  const truth=JSON.stringify(snapshot.sessions);await run(`(()=>{const select=document.querySelector('.venue-select');select.value='observatory';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(`document.querySelectorAll('.agent-social-vignette').length===0`,'scene change must cancel the previous social choreography');assert.equal(JSON.stringify(snapshot.sessions),truth);await inspectCast(3);checks.push({name:'real scene controls start/cancel a decorative pair without changing observation data',kind:socialState.kind});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
