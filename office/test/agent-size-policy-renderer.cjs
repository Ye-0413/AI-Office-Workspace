'use strict';
// Native admission keeps main-agent size and lets overloaded helpers shrink
// or fold into their own parent before they take a main agent's work dock.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-fixed-size-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'en',agentAppearance:'mixed',agentScale:1,idleVisitor:false,reducedMotion:false,lowPower:false,roomDesign:'legacy',sceneTime:'morning'};
let snapshot={mode:'live',now:Date.now(),sessions:[],connections:[]};
const errors=[],checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>win.webContents.executeJavaScript(code,true);
const task=(id,activity,parentId)=>({id,sessionId:id,provider:'codex',status:'active',activity,...(parentId?{parentId}:{}),lastEventAt:Date.now(),activeTools:1,events:[],projectPath:'/fixture/fixed-size'});
function send(sessions){snapshot={...snapshot,sessions,now:Date.now()};win.webContents.send('office:snapshot',snapshot);}
async function until(code,label,ms=40000){const end=Date.now()+ms;while(Date.now()<end){if(errors.length)throw Error(errors.join('\n'));if(await run(code))return;await pause(40);}throw Error(label+': '+JSON.stringify(await run(`({error:document.getElementById('error-message').textContent,office:{...document.getElementById('office').dataset},traffic:window.nativeTraffic?.state(),trafficActors:window.lastTrafficActors,trafficRequests:window.lastTrafficRequests,rows:[...document.querySelectorAll('.actor')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),actor=window.observedActors?.get(n.dataset.sessionId);return{id:n.dataset.sessionId,...n.dataset,visible:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity,current:{x:m.e/12.8,y:m.f/7.2},observedNodeCurrent:actor?.node===n,target:actor?.node===n?actor.target:null,finite:n.getAnimations().filter(a=>a.effect?.target===n&&a.effect.getTiming().iterations===1).map(a=>({state:a.playState,time:a.currentTime,timing:a.effect.getTiming()}))};})})`)));}
const nodes=`[...document.querySelectorAll('.actor[data-session-id]')]`;
const stationary=count=>`${nodes}.length===${count}&&${nodes}.every(node=>{const actor=observedActors.get(node.dataset.sessionId);return actor?.node===node&&!actor.entryPending&&!actor.pendingStation&&!actor.navigation&&!actor.motion&&!actor.routeReservation&&!actor.yielding&&node.dataset.walking!=='true'&&getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>.99;})`;
function paintedBox(node){
  const rig=node.querySelector('.ap-rig'),cell=rig.querySelector('clipPath[id$="-cell"] rect'),m=rig.getScreenCTM(),x=Number(cell.getAttribute('x')),y=Number(cell.getAttribute('y')),w=Number(cell.getAttribute('width')),h=Number(cell.getAttribute('height'));
  // The 154px SVG includes transparent framing. Measure its actual clipped
  // 80px sprite cell plus the authored tool envelope, not the empty canvas.
  const points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h],[46.5,62],[108.5,118]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)),plate=node.querySelector('.nameplate').getBoundingClientRect();
  return{left:Math.min(plate.left,...points.map(p=>p.x))-1,right:Math.max(plate.right,...points.map(p=>p.x))+1,top:Math.min(plate.top,...points.map(p=>p.y))-1,bottom:Math.max(plate.bottom,...points.map(p=>p.y))+1};
}
function readGeometry(){
  const world=document.getElementById('world').getBoundingClientRect();
  const rows=[...document.querySelectorAll('.actor[data-session-id]')].map(node=>{const body=node.querySelector('.character-body'),rig=body.querySelector('.ap-rig'),matrix=rig.getScreenCTM(),outer=new DOMMatrixReadOnly(getComputedStyle(node).transform);return{id:node.dataset.sessionId,helper:node.dataset.helper==='true',outer:Math.hypot(outer.a,outer.b),art:Number(getComputedStyle(body).getPropertyValue('--avatar-presentation-scale')),physical:Math.hypot(matrix.a,matrix.b),font:parseFloat(getComputedStyle(node.querySelector('.actor-title')).fontSize),key:node.dataset.bodyAppearance,box:paintedBox(node)};});
  return{rows,inside:rows.every(({box:b})=>b.left>=world.left-1&&b.right<=world.right+1&&b.top>=world.top-1&&b.bottom<=world.bottom+1),overlaps:rows.flatMap((a,i)=>rows.slice(i+1).filter(b=>a.box.left<b.box.right-.5&&a.box.right>b.box.left+.5&&a.box.top<b.box.bottom-.5&&a.box.bottom>b.box.top+.5).map(b=>[a.id,b.id]))};
}
async function audit(count,scale,readmission=false){
  // Preference readmission intentionally suppresses unchanged-work arrival
  // feedback, so the old event's actor object is no longer its observer.
  // Require the real coordinator and outer motions to drain, then remain
  // quiet across the production station deadline before measuring the dock.
  const settled=readmission?`${nodes}.length===${count}&&${nodes}.every(node=>node.dataset.walking!=='true'&&node.dataset.traffic==='arrived'&&getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>.99&&!node.getAnimations().some(a=>a.effect?.target===node&&a.effect.getTiming().iterations===1))&&nativeTraffic.state().queued===0&&nativeTraffic.state().activeMoves.length===0`:stationary(count);
  const ready=`(${settled})&&Math.abs(Number(document.getElementById('office').dataset.fitScale)-${scale})<.00001`;
  await until(ready,'The feasible cast reaches fixed-size work docks');
  if(readmission){await pause(1800);await until(ready,'Preference readmission remains at its proved working dock');}
const report=await run('('+readGeometry.toString()+')()');assert.equal(report.inside,true);assert.deepEqual(report.overlaps,[]);assert.ok(report.rows.every(row=>Math.abs(row.outer-scale)<.00001));assert.equal(settings.agentScale,scale);assert.equal(await run(`Number(document.getElementById('office').dataset.fitScale)`),scale);return report.rows;}
const guard=setTimeout(()=>{console.error('Fixed-size renderer timeout');app.exit(1);},300000);
app.whenReady().then(async()=>{
  for(const[name,action]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>action(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,enableLargerThanScreen:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
  // A passive wrapper records real production batch starts, without changing
  // routes, actor state, geometry or the coordinator's reservation decisions.
  await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    let api;window.batchStarts=[];window.batchReservations=[];
    Object.defineProperty(window,'OfficeSceneTraffic',{configurable:true,get:()=>api,set:value=>{
      api={...value,createCoordinator(options){
        const native=value.createCoordinator(options);
        // Layout feasibility probes also create coordinators. Observe only
        // the production pump, never a rejected virtual proof's queue.
        if(options.maxConcurrent!==8||options.yieldBatchSize!==1)return native;
        window.nativeTraffic=native;
        return{...native,sync(values){window.lastTrafficActors=JSON.parse(JSON.stringify(values));return native.sync(values);},request(id,target,options){const accepted=native.request(id,target,options);window.lastTrafficRequests??={};window.lastTrafficRequests[id]={target,options,accepted};return accepted;},nextBatch(){
          const batch=native.nextBatch(),moving=batch.filter(p=>p.kind==='move');
          if(moving.length){
            batchReservations.push({time:performance.now(),reservations:moving.map(p=>({id:p.id,target:p.target,path:p.path}))});
            requestAnimationFrame(async()=>{
              const records=moving.map(p=>{const node=document.querySelector('[data-session-id="'+p.id+'"]'),motion=node?.getAnimations().find(a=>a.effect?.target===node&&a.effect.getTiming().iterations===1);return{id:p.id,node,motion};});
              await Promise.all(records.map(record=>record.motion?.ready.catch(()=>{})));
              batchStarts.push(records.map(({id,node,motion})=>({id,walking:node?.dataset.walking,startTime:motion?.startTime})));
            });
          }
          return batch;
        }};
      }};
    }});
  })()`});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await run(`window.paintedBox=(${paintedBox.toString()});window.observedActors=new Map();document.getElementById('office').addEventListener('office:actor-arrival',event=>observedActors.set(event.detail.actorId,event.detail.actor));void 0`);
  let left=task('fixed:left','reading'),right=task('fixed:right','coding');
  send([left,right]);let rows=await audit(2,1);
  assert.ok(rows.every(row=>row.art===1.8&&row.font>=28),'larger art and readable labels are the actual computed production presentation');
  await run(`window.originalBodies=new Map(${nodes}.map(node=>[node.dataset.sessionId,{node,rig:node.querySelector('.ap-rig'),image:node.querySelector('.character-body>img')}]));void 0`);

  const extra=task('fixed:extra','testing'),helper=task('fixed:helper','planning',left.id);
  send([left,right,extra,helper]);rows=await audit(4,1);
  const rootRow=rows.find(row=>row.id===left.id),helperRow=rows.find(row=>row.id===helper.id);
  assert.equal(helperRow.key,rootRow.key);assert.ok(Math.abs(helperRow.art-1.44)<1e-9);assert.ok(Math.abs(helperRow.physical/rootRow.physical-.656)<.001);
  assert.equal(await run(`Array.from(originalBodies,([id,old])=>{const node=document.querySelector('[data-session-id="'+id+'"]');return node===old.node&&node.querySelector('.ap-rig')===old.rig&&node.querySelector('.character-body>img')===old.image;}).every(Boolean)`),true);
  fs.writeFileSync('/tmp/office-fixed-size-final.png',(await win.webContents.capturePage()).toPNG());
  checks.push('two to four feasible identities retain exact 100% outer scale; larger art/text stay fixed; helpers inherit the family at the established smaller physical ratio');
  const endedExtra={...extra,closed:true,status:'closed',activity:'idle',activeTools:0,turnCompletedAt:Date.now()},endedHelper={...helper,closed:true,status:'closed',activity:'idle',activeTools:0,turnCompletedAt:Date.now()};
  send([left,right,endedExtra,endedHelper]);await audit(3,1);
  assert.equal(await run(`document.querySelector('[data-session-id="'+${JSON.stringify(extra.id)}+'"]').dataset.standby`),'true');
  const replacement=task('fixed:replacement','searching');
  send([left,right,endedExtra,endedHelper,replacement]);await audit(3,1);
  await until(`!document.querySelector('[data-session-id="'+${JSON.stringify(extra.id)}+'"]')`,'new work releases the completed standby main');
  send([left,right]);await audit(2,1);await pause(100);assert.equal(await run(`Array.from(originalBodies,([id,old])=>document.querySelector('[data-session-id="'+id+'"]')===old.node).every(Boolean)`),true);
  checks.push('completed mains remain on standby until new work arrives; releasing visitors cannot enlarge or replace the remaining original bodies');

  // Both genuine task changes request opposite functional stations. Capture
  // actual compositor motion and any temporary actor-envelope intersections.
  await run(`window.crossingEvidence={frames:0,intersections:0,moving:0};window.observeCrossing=true;const tick=()=>{if(!observeCrossing)return;const actors=[...document.querySelectorAll('.actor[data-session-id]')];crossingEvidence.frames++;for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){const a=actors[i],b=actors[j],moving=a.dataset.walking==='true'||b.dataset.walking==='true';if(!moving)continue;crossingEvidence.moving++;const x=paintedBox(a),y=paintedBox(b);if(x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top)crossingEvidence.intersections++;}requestAnimationFrame(tick);};requestAnimationFrame(tick);void 0`);
  left={...left,activity:'coding',lastEventAt:Date.now()};right={...right,activity:'reading',lastEventAt:Date.now()};send([left,right]);await pause(1900);await audit(2,1);await run(`observeCrossing=false;void 0`);
  const crossing=await run(`crossingEvidence`),batches=await run(`batchStarts`);
  fs.writeFileSync('/tmp/office-fixed-size-batch-evidence.json',JSON.stringify({crossing,batches,reservations:await run('batchReservations')},null,2));
  assert.ok(crossing.moving>=2&&crossing.intersections>0,'real walkers may intersect while their final working docks remain disjoint');
  assert.ok(batches.some(batch=>batch.length>=2&&batch.every(item=>item.walking==='true'&&Number.isFinite(item.startTime))&&Math.max(...batch.map(item=>item.startTime))-Math.min(...batch.map(item=>item.startTime))<1),'an actual production pump starts multiple reserved bodies on the same compositor frame');
  checks.push('real functional-station swaps start in one native batch, pass through actor envelopes, then settle at distinct non-overlapping work docks');

  for(let index=0;index<3;index++){send([left,right].map(session=>({...session,title:'Metadata refresh '+index,lastEventAt:Date.now()})));await pause(120);}await audit(2,1);
  await run(`(()=>{const input=document.getElementById('setting-agentScale');input.value='110';input.dispatchEvent(new Event('change',{bubbles:true}));})();void 0`);await audit(2,1.1,true);
  assert.deepEqual((await run(`Array.from(document.querySelectorAll('.actor[data-session-id]'),node=>node.dataset.sessionId)`)).sort(),[left.id,right.id].sort());
  await run(`(()=>{const input=document.getElementById('setting-agentScale');input.value='100';input.dispatchEvent(new Event('change',{bubbles:true}));})();void 0`);await audit(2,1,true);
  checks.push('metadata does not rescale or replace the cast; explicit manual 110% and 100% changes alone control exact size and preserve real session identities');

  // Exercise overload exclusively through observed snapshots. The production
  // coordinator owns every entry, split, return and reflow; this sampler only
  // records bodies that really walk in the native renderer.
  await run(`window.loadWalks=new Set();window.observeLoad=true;(function tick(){if(!observeLoad)return;for(const n of document.querySelectorAll('.actor[data-session-id]'))if(n.dataset.walking==='true')loadWalks.add(n.dataset.sessionId);requestAnimationFrame(tick)})();void 0`);
  await run(`(()=>{const room=document.getElementById('venue-select');room.value='halloween';room.dispatchEvent(new Event('change',{bubbles:true}));})();void 0`);
  await until(`document.getElementById('office').dataset.roomDesign==='halloween'&&document.getElementById('room-art').dataset.artworkKey==='room:halloween'`,'the compact Halloween floor commits through its real selector');
  await run(`(()=>{const input=document.getElementById('setting-agentScale');input.value='135';input.dispatchEvent(new Event('change',{bubbles:true}));})();void 0`);
  left={...left,activity:'unknown',lastEventAt:Date.now()};right={...right,activity:'unknown',lastEventAt:Date.now()};
  const third=task('load:third','unknown'),roots=[left,right,third],manualScale=1.35;
  const keptHelper=task('load:kept','unknown',left.id);
  send([...roots,keptHelper]);const normal=await audit(4,manualScale,true);
  assert.equal(await run(`document.getElementById('office').dataset.helperScale`),'1.0000');
  const mainPhysical=normal.find(row=>row.id===left.id).physical,helperPhysical=normal.find(row=>row.id===keptHelper.id).physical;
  const helpers=[keptHelper,...Array.from({length:2},(_,index)=>task('load:helper-'+String(index).padStart(2,'0'),'unknown',index%2?right.id:left.id))];
  const calm=`${nodes}.every(node=>node.dataset.walking!=='true'&&node.dataset.traffic==='arrived'&&getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>.99&&!node.getAnimations().some(a=>a.effect?.target===node&&a.effect.getTiming().iterations===1))&&nativeTraffic.state().invalid===false&&nativeTraffic.state().queued===0&&nativeTraffic.state().activeMoves.length===0`;
  async function auditLoad(roots,helperScale){
    await until(`(${calm})&&document.getElementById('office').dataset.helperScale===${JSON.stringify(helperScale.toFixed(4))}&&${JSON.stringify(roots.map(s=>s.id))}.every(id=>document.querySelector('.actor[data-session-id="'+id+'"]'))&&${nodes}.some(node=>node.dataset.helper==='true')`,'overloaded families settle with main-agent size priority',60000);
    await pause(250);await until(calm,'all overloaded entries and reflows finish');
    const geometry=await run('('+readGeometry.toString()+')()');
    assert.equal(geometry.inside,true,'overloaded painted bodies and nameplates remain inside the floor');
    assert.deepEqual(geometry.overlaps,[],'overloaded painted bodies and nameplates occupy distinct final work docks');
    for(const row of geometry.rows){assert.ok(Math.abs(row.outer-manualScale*(row.helper?helperScale:1))<.00001,'actual outer scale for '+row.id);if(!row.helper)assert.ok(Math.abs(row.physical-mainPhysical)<.001,'main artwork keeps the selected physical size');else assert.ok(Math.abs(row.physical-helperPhysical*helperScale)<.001,'helper artwork follows its additional outer reduction');}
    assert.equal(settings.agentScale,manualScale,'capacity does not rewrite the manual preference');
    assert.equal(await run(`Number(document.getElementById('office').dataset.fitScale)`),manualScale,'helpers do not trigger the main-only 90% fallback');
    const parents=await run(`${nodes}.filter(n=>n.dataset.helper!=='true').map(n=>({id:n.dataset.sessionId,folded:Number(n.dataset.foldedClones||0),label:n.querySelector('.nameplate').textContent}))`);
    for(const parent of parents){const visible=geometry.rows.filter(row=>row.helper&&helpers.find(s=>s.id===row.id)?.parentId===parent.id).length,active=helpers.filter(s=>s.parentId===parent.id).length;assert.equal(visible+parent.folded,active,'each active helper is visible or folded into its own main');if(parent.folded)assert.ok(parent.label.includes(parent.folded+' active clone'+(parent.folded===1?'':'s')+' here'),'the actual parent nameplate explains its active folded helpers');}
    await run(`document.getElementById('roster-button').click();void 0`);
    await until(`document.getElementById('roster-dialog').open&&document.querySelectorAll('#roster-list [data-session-id]').length===${roots.length+helpers.length}`,'the actual roster panel lists every active observed identity');
    const roster=await run(`[...document.querySelectorAll('#roster-list [data-session-id]')].map(n=>n.dataset.sessionId)`);
    await run(`document.querySelector('#roster-dialog [data-close-dialog]').click();void 0`);
    for(const session of [...roots,...helpers])assert.ok(roster.includes(session.id),'folding preserves the real roster identity '+session.id);
    return{rows:geometry.rows,parents,folded:parents.reduce((sum,row)=>sum+row.folded,0)};
  }
  send([...roots,...helpers]);const crowded=await auditLoad(roots,.7);
  const newcomer=task('load:new-main','unknown');
  send([...roots,...helpers,newcomer]);const priority=await auditLoad([...roots,newcomer],.7);
  assert.ok(priority.folded>0,'the fixed four-main, three-helper load reaches explicit parent-nameplate capacity');
  assert.equal(priority.rows.filter(row=>!row.helper).length,roots.length+1,'the new main joins every original main at the selected physical size');
  assert.ok(crowded.rows.filter(row=>!row.helper).every(row=>priority.rows.some(next=>next.id===row.id)),'admitting a new main never displaces an existing main');
  const closedHelpers=helpers.slice(1).map(session=>({...session,closed:true,status:'closed',activity:'idle',activeTools:0,turnCompletedAt:Date.now(),lastEventAt:Date.now()}));
  send([...roots,keptHelper,...closedHelpers]);
  await until(`document.getElementById('office').dataset.helperScale==='1.0000'&&${nodes}.length===4&&${JSON.stringify([...roots,keptHelper].map(session=>session.id))}.every(id=>document.querySelector('.actor[data-session-id="'+id+'"]'))`,'the exact surviving family recovers after returning helpers and the extra main leave',60000);
  const recovered=await audit(4,manualScale,true);
  await until(`document.getElementById('office').dataset.helperScale==='1.0000'&&${nodes}.every(n=>Number(n.dataset.foldedClones||0)===0)`,'helper size and parent nameplates recover after real load leaves');
  assert.ok(Math.abs(recovered.find(row=>row.id===keptHelper.id).physical-helperPhysical)<.001,'the retained helper returns to its original physical size');
  assert.ok(recovered.filter(row=>!row.helper).every(row=>Math.abs(row.physical-mainPhysical)<.001),'recovery leaves all main artwork at the selected size');
  assert.equal(await run(`${nodes}.filter(n=>n.dataset.helper!=='true').some(n=>/active clones? here/.test(n.querySelector('.nameplate').textContent))`),false,'ended folded helpers disappear from the actual nameplate');
  const loadWalks=await run(`observeLoad=false;[...loadWalks]`);
  assert.ok(loadWalks.includes(newcomer.id),'the prioritized main enters through real native movement');
  assert.ok(helpers.some(session=>loadWalks.includes(session.id)),'observed helpers actually split and walk through the normal entry path');
  const helperCapacity={room:'halloween',manualScale,activeHelpers:helpers.length,helperScale:.7,foldedBeforeNewMain:crowded.folded,foldedAfterNewMain:priority.folded,recoveredScale:1,walked:loadWalks};
  checks.push('overload shrinks helper bodies to 70% while keeping mains at the manual size; remaining active helpers fold into their own parent nameplate');
  checks.push('a new main enters at the selected size while excess helpers remain accurately folded; ended helpers return normally and the surviving helper recovers its full relative size');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,castCounts:[2,4,2],scale:1,largerArtwork:1.8,minimumTitlePixels:28,helperPhysicalRatio:.656,helperCapacity,crossing,batches:batches.filter(batch=>batch.length>1),checks,errors,batchEvidence:'/tmp/office-fixed-size-batch-evidence.json',preview:'/tmp/office-fixed-size-final.png'}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
