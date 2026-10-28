'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js'),Walking=require('../lib/walking-layout.js'),Traffic=require('../lib/scene-traffic.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function production(name){const start=source.indexOf('  function '+name+'('),asyncStart=source.indexOf('  async function '+name+'('),at=start<0?asyncStart:start;assert.ok(at>=0,'production '+name);const end=source.slice(at+1).search(/\n  (?:async )?function /);return source.slice(at,end<0?source.length:at+1+end);}
const input=Array.from({length:12},(_,i)=>({id:'owner-'+String(i).padStart(3,'0'),provider:'codex',status:'active',activity:['reading','planning','coding','testing','idle','unknown'][i%6]}));
input.push({id:'owner-012',provider:'codex',status:'active',activity:'planning',parentId:'owner-002'});
const footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
const first=Walking.layoutWalking(input,{requestedScale:.65,footprints});
const changed=input.map((s,i)=>i===0?{...s,activity:'coding'}:i===8?{...s,activity:'reading'}:s);
const page=Walking.layoutWalking(changed,{requestedScale:.65,footprints,previousSeats:first.seats,currentPositions:new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),immovableIds:new Set(['owner-002']),fixedHoldingIds:new Set(['owner-002'])});
assert.ok(page.transferCertificate,'the genuine reciprocal thirteen-body model fixture must propose three intents');
const plain=v=>JSON.parse(JSON.stringify(v));
function harness(){
 let now=0,sequence=0;const timers=new Map(),microtasks=[],moves=[],requests=[],arrivals=[],cancelled=[],errors=[],actors=new Map(),trafficWaiters=new Map();
 for(const session of changed){const point=first.seats.get(session.id),style={removeProperty(){}};actors.set(session.id,{id:session.id,session:{...session},spec:Scene.activitySpec(session),serial:7,position:{x:point.x,y:point.y},target:point,helper:Boolean(session.parentId),entryPending:false,holdingFamily:session.id==='owner-002',retireRequested:session.id==='owner-002'?{}:null,node:{dataset:{},style},image:{},performance:{},navigation:null,pendingStation:null});}
 const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:Walking.legalPoint,route:Walking.route,gap:Walking.gapForScale,obstacles:Walking.OBSTACLES,reservedRects:Scene.CLOCK_RESERVED,holdingPoints:page.holdingPoints,maxConcurrent:4,yieldBatchSize:1});
 const context={sizeStability:require('../lib/size-stability.js').create({requestedScale:.65}),Scene,WalkingLayout:Walking,actors,traffic,trafficWaiters,transferOwner:null,transferContinuation:null,destroyed:false,deferredPhysicalScale:null,clearingActors:false,fitting:false,navigationTimer:0,trafficTimer:0,settings:{agentScale:.65,sceneVenue:'workshop',sceneTheme:'auto'},language:'zh',uniformScale:.4,
  snapshot:{sessions:changed.filter(s=>s.id!=='owner-002').map(s=>({...s}))},attendance:{present:changed.filter(s=>s.id!=='owner-002')},restedClones:new Set(),actorFootprints:new Map([...footprints].map(([id,f])=>[id,{...f}])),currentPage:page,office:{dataset:{}},performance:{now:()=>now},
  setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),queueMicrotask:fn=>microtasks.push(fn),
  quiet:false,quietSprites:()=>context.quiet,cloneBusy:a=>['splitting','returning','absorbing'].includes(a.clonePhase),pinnedDockIds:()=>new Set(),hasBodyActivity:s=>s.status==='active'&&!s.closed&&!s.disconnected,
  currentPosition:a=>({...a.position}),actorGeometry:a=>({uniformScale:.4,footprint:footprints.get(a.id)}),reduced:()=>false,sceneHidden:()=>false,cloneAncestor:()=>null,endpointParent:()=>null,
  finishAtStation:()=>{},actualArrival:(a,seat,serial,kind)=>arrivals.push({id:a.id,point:{...a.position},seat,serial,kind}),queueLayoutRefresh:()=>{context.refreshes++;},refreshes:0,transitCaption:()=>{},renderHelperLinks:()=>{},updateProps:()=>{},updateEntranceLane:()=>{},clearTrafficBlock:()=>{},trackTrafficBlock:()=>{},showError:e=>errors.push(e),nextEntryCandidate:()=>{if(context.transferOwner)context.admissions++;return null;},admissions:0,
  animateWalk:(actor,route,serial,carrying,instant,yielding)=>new Promise(resolve=>{const motion={cancel:()=>resolve(false)};actor.motion=motion;moves.push({actor,route,serial,carrying,yielding,resolve:()=>{if(actor.motion===motion){actor.position={...route.at(-1)};actor.motion=null;}resolve(actor.serial===serial);}});}),
  cancelAction:actor=>{cancelled.push({actor,point:{...actor.position}});actor.serial++;actor.motion?.cancel();actor.motion=null;actor.routeReservation=null;actor.navigation=null;actor.pendingStation=null;actor.yielding=false;const waiter=trafficWaiters.get(actor.id);trafficWaiters.delete(actor.id);waiter?.resolve(false);traffic.cancel(actor.id,actor.position);},
  settle:()=>assert.fail('no certificate phase may call settle'),returnClone:()=>assert.fail('no synthetic clone return'),depart:()=>assert.fail('no synthetic exit')};
 vm.createContext(context);
 for(const name of ['transferSamePoint','transferInputs','transferPhysicalOwner','transferAvailable','transferEligible','transferSemanticKey','transferValid','revokeTransfer','acceptTransfer','transferDrained','continueTransfer','queueTransferContinuation','canYieldAtStation','canYieldActor','syncTraffic','queueTraffic','pumpTraffic','queueNavigation','requestStation','move'])vm.runInContext(production(name),context);
 const originalMove=context.move;context.move=(actor,target,serial,carrying)=>{requests.push({id:actor.id,target:plain(target),serial});return originalMove(actor,target,serial,carrying);};
 async function flush(){for(let i=0;i<10;i++){while(microtasks.length)microtasks.shift()();await Promise.resolve();}}
 async function advance(ms){now+=ms;for(let pass=0;pass<64;pass++){const ready=[...timers].filter(([,t])=>t.at<=now);if(!ready.length)break;for(const[id,t]of ready){timers.delete(id);t.fn();}await flush();}await flush();}
 function accept(){assert.equal(context.acceptTransfer(page.transferCertificate,changed),true);for(const actor of actors.values())context.requestStation(actor,page.seats.get(actor.id));context.queueNavigation();return context.transferOwner;}
 async function drain(){for(let i=0;context.transferOwner&&i<80;i++){const move=moves.shift();if(move)move.resolve();await flush();await advance(60);}assert.equal(errors.length,0);assert.equal(context.transferOwner,null,'three intents and all automatic return legs eventually release');}
 return{context,actors,timers,moves,requests,arrivals,cancelled,errors,traffic,accept,advance,flush,drain};
}
test('real production owner retains 1700ms stability and metadata never restarts its shared deadline',async()=>{
 const h=harness(),owner=h.accept();assert.equal(h.timers.size,1);await h.advance(800);
 for(const row of h.context.snapshot.sessions)row.title='metadata only';for(const row of changed)h.context.requestStation(h.actors.get(row.id),page.seats.get(row.id));
 assert.equal(h.context.transferValid(owner),true);assert.equal(owner.due,1700);await h.advance(899);assert.equal(h.requests.length,0);await h.advance(1);assert.equal(h.requests.length,1);assert.equal(h.context.office.dataset.transferStatus,'running');
});
test('three genuine Traffic intents drain automatic yielders before advancing, preserve final goals, and emit no pocket arrival',async()=>{
 const h=harness();h.accept();await h.advance(1700);const firstRequest=h.requests[0];
 assert.equal(firstRequest.id,page.transferCertificate.steps[0].id);assert.equal(h.arrivals.length,0);
 assert.notDeepEqual(firstRequest.target,plain(page.seats.get(firstRequest.id)),'the pocket is a physical waypoint, never the work goal');
 assert.equal(h.actors.get(firstRequest.id).target,page.seats.get(firstRequest.id));
 await h.drain();assert.equal(h.requests.length,3);assert.deepEqual(h.requests.map(r=>[r.id,r.target]),page.transferCertificate.steps.map(s=>[s.id,plain(s.target)]));
 assert.equal(h.arrivals.length,2);for(const row of h.arrivals){assert.equal(row.kind,'station');assert.deepEqual(row.point,{x:row.seat.x,y:row.seat.y});}
 for(const actor of h.actors.values()){assert.deepEqual(actor.position,{x:page.seats.get(actor.id).x,y:page.seats.get(actor.id).y});assert.equal(actor.serial,7);assert.equal(actor.navigation,null);}
 assert.equal(h.context.admissions,0,'no existing pending admission may enter the exclusive proof');assert.equal(h.context.office.dataset.transferStatus,undefined);assert.equal(h.context.office.dataset.transferStep,undefined);
});
test('a yield-return gap cannot be mistaken for a fully drained phase',async()=>{
 const h=harness();h.accept();await h.advance(1700);
 const owner=h.context.transferOwner;owner.requestDone=true;h.context.trafficWaiters.clear();h.traffic.clear();h.moves.length=0;
 for(const a of h.actors.values()){a.motion=null;a.routeReservation=null;}const bystander=h.actors.get('owner-006');bystander.yielding=true;
 h.context.queueTransferContinuation();await h.flush();assert.equal(owner.index,0);assert.equal(h.requests.length,1,'the real temporary return owner blocks the next participant request');
});
test('fresh work, ancestry, turn, measured footprint, identity, scale, and new cast revoke stale proof fences',()=>{
 const changes=[h=>h.context.snapshot.sessions.find(s=>s.id==='owner-000').activity='testing',h=>h.context.snapshot.sessions.find(s=>s.id==='owner-000').turnId='new-turn',h=>h.context.snapshot.sessions.find(s=>s.id==='owner-012').parentId='owner-001',h=>h.context.actorFootprints.get('owner-000').right++,h=>h.actors.get('owner-000').serial++,h=>h.context.uniformScale=.39,h=>h.actors.set('outside',{id:'outside',entryPending:true}),h=>h.actors.get('owner-000').image={}];
 for(const change of changes){const h=harness(),owner=h.accept();change(h);assert.equal(h.context.transferValid(owner),false);}
});
test('pending jitter cancellation clears only its logical deadline and never touches body or clocks',()=>{
 const h=harness(),owner=h.accept(),before=[...h.actors.values()].map(a=>({a,serial:a.serial,node:a.node,image:a.image,rig:a.performance,point:{...a.position}}));
 h.context.revokeTransfer('fresh-intent');assert.equal(h.cancelled.length,0);assert.equal(h.context.transferOwner,null);
 for(const row of before){assert.equal(row.a.serial,row.serial);assert.equal(row.a.node,row.node);assert.equal(row.a.image,row.image);assert.equal(row.a.performance,row.rig);assert.deepEqual(row.a.position,row.point);assert.equal(row.a.pendingStation,null);}
 assert.equal(h.context.office.dataset.transferStatus,undefined);assert.equal(h.context.transferValid(owner),false);
});
test('running cancellation releases all exact physical owners at actual feet and late completion cannot revive a plan',async()=>{
 const h=harness();h.accept();await h.advance(1700);const owner=h.context.transferOwner,late=h.moves[0];const actor=late.actor;actor.position={x:actor.position.x+.25,y:actor.position.y+.25};const actual={...actor.position};
 h.context.revokeTransfer('fresh-work');assert.equal(h.context.transferOwner,null);assert.deepEqual(h.cancelled.find(r=>r.actor===actor).point,actual);assert.deepEqual(actor.position,actual);assert.ok(actor.serial>7);late.resolve();await h.flush();await h.advance(6000);
 assert.equal(h.requests.length,1);assert.equal(h.arrivals.length,0);assert.equal(h.context.office.dataset.transferStatus,undefined);assert.equal(h.context.transferValid(owner),false);
});
test('quiet, hidden, fitting, queued work, admission, and clone/dock owners never get executable model permission',()=>{
 const cases=[h=>h.context.quiet=true,h=>h.context.fitting=true,h=>h.actors.get('owner-000').motion={},h=>h.actors.get('owner-000').routeReservation={},h=>h.actors.get('owner-000').resumeNavigation={kind:'station'},h=>h.actors.get('owner-000').yielding=true,h=>h.actors.get('owner-012').clonePhase='returning',h=>h.actors.get('owner-012').entryPending=true,h=>h.context.trafficWaiters.set('queued',{})];
 for(const change of cases){const h=harness();change(h);assert.equal(h.context.transferAvailable(changed),false);assert.equal(h.context.acceptTransfer(page.transferCertificate,changed),false);assert.equal(h.requests.length,0);}
});
test('temporary progress retains exact immutable certificate rather than re-comparing initial source coordinates',async()=>{
 const h=harness(),owner=h.accept();await h.advance(1700);const move=h.moves[0];move.actor.position={x:move.actor.position.x+.01,y:move.actor.position.y+.01};
 assert.equal(h.context.transferValid(owner),true);assert.equal(h.context.transferOwner.certificate,page.transferCertificate);assert.equal(h.context.transferOwner.certificate.sourceKey,page.transferCertificate.sourceKey);assert.equal(owner.due,1700);
});
test('a changed source before the deadline is rejected without moving to a cached path or issuing an arrival',async()=>{
 const h=harness();h.accept();h.actors.get('owner-000').position.x+=.01;await h.advance(1700);assert.equal(h.context.transferOwner,null);assert.equal(h.requests.length,0);assert.equal(h.arrivals.length,0);
});
function installRender(h,{unexpectedLayout=false}={}){
 const c=h.context,dom=new Map(),noop=()=>{},node=()=>({dataset:{},firstElementChild:{},replaceChildren(){},querySelector(){return this;}});let calls=0;
 Object.assign(c,{$:id=>{if(!dom.has(id))dom.set(id,node());return dom.get(id);},cloneLedger:{update:noop,rootFor:id=>id},attendanceModel:{update:()=>({present:c.snapshot.sessions,retired:['owner-002']})},Family:{build:()=>({info:new Map()})},paletteRegistry:{update:noop},familyGraph:{info:new Map()},measureActorFootprints:noop,selectedProject:'',roomSelectionExplicit:false,rooms:[],element:node,page:0,text:noop,tr:value=>value,I18n:{t:()=>''},previousAttention:new Set(),renderConnections:noop,renderRoster:noop,renderInspector:noop,refreshQuietPresentation:noop,updateSignalSummary:noop,venueStage:null,festivalStage:null,themeEnvironment:null,social:null,stationArrival:null,
  finiteExitIds:()=>new Set(),sceneOptions:()=>({currentPositions:new Map([...c.actors].map(([id,a])=>[id,{...a.position}]))}),
  WalkingLayout:{layoutAllWalking:(rows,options)=>{calls++;if(unexpectedLayout)assert.fail('metadata cannot rerun allocation during certified progress');assert.deepEqual(options.currentPositions.get('owner-000'),h.actors.get('owner-000').position);return{...page,transferCertificate:null};}},
  reconcileActors:()=>{for(const actor of c.actors.values()){actor.session=c.snapshot.sessions.find(s=>s.id===actor.id)||actor.session;c.requestStation(actor,c.currentPage.seats.get(actor.id));}}});
 vm.runInContext(production('nameplateMode')+production('render'),c);return()=>calls;
}
test('the full production render preserves the exact certified seats and owner during moving metadata heartbeats',async()=>{
 const h=harness(),owner=h.accept();await h.advance(1700);const seats=h.context.currentPage.seats,certificate=owner.certificate,calls=installRender(h,{unexpectedLayout:true});
 h.moves[0].actor.position.x+=.02;for(const row of h.context.snapshot.sessions){row.title='new metadata';row.lastEventAt=Date.now();}
 h.context.render();assert.equal(calls(),0);assert.equal(h.context.transferOwner,owner);assert.equal(h.context.currentPage.seats,seats);assert.equal(h.context.currentPage.transferCertificate,certificate);assert.equal(owner.index,0);assert.equal(owner.due,1700);
});
test('the full production render revokes changed work before proving from actual interrupted feet',async()=>{
 const h=harness();h.accept();await h.advance(1700);const moving=h.moves[0].actor;moving.position.x+=.02;const actual={...moving.position},calls=installRender(h);
 h.context.snapshot.sessions.find(s=>s.id==='owner-000').turnId='new-turn';h.context.render();assert.equal(calls(),1);assert.equal(h.context.transferOwner,null);assert.deepEqual(moving.position,actual);assert.equal(h.arrivals.length,0);assert.equal(h.context.office.dataset.transferStatus,undefined);
});
test('a real fit revokes a transfer without preserving its pocket as an ordinary resume destination',async()=>{
 const h=harness();h.accept();await h.advance(1700);const moving=h.moves[0].actor;moving.position.x+=.02;const actual={...moving.position};
 h.context.clonePhase=(a,phase)=>a.clonePhase=phase;vm.runInContext(production('cancelPhysicalRoutes'),h.context);h.context.cancelPhysicalRoutes();
 assert.equal(h.context.transferOwner,null);assert.deepEqual(moving.position,actual);for(const actor of h.actors.values()){assert.equal(actor.resumeNavigation,undefined);assert.equal(actor.navigation,null);}
 assert.equal(h.context.office.dataset.transferStatus,undefined);
});
test('real cancelAction revokes the whole generation before its old route promise can affect a new owner',async()=>{
 const h=harness();h.accept();await h.advance(1700);const c=h.context,old=c.transferOwner,actor=h.moves[0].actor;
 for(const a of h.actors.values()){a.cloneEffects=new Set();a.delays=new Set();a.bubble={dataset:{}};a.node.style.opacity='1';}
 Object.assign(c,{syncWalkingGait:()=>{},getComputedStyle:()=>({transform:'matrix(1,0,0,1,0,0)'}),actorTransform:p=>'translate('+p.x+','+p.y+')',clonePhase:(a,p)=>a.clonePhase=p,needsOpeningRefresh:()=>false});
 vm.runInContext(production('cancelAction'),c);c.cancelAction(actor);assert.equal(c.transferOwner,null);assert.ok(actor.serial>7);await h.flush();assert.equal(h.arrivals.length,0);assert.equal(h.requests.length,1);assert.equal(c.transferValid(old),false);for(const a of h.actors.values())assert.equal(a.navigation,null);
});
async function reachPhase(h,index){
 h.accept();await h.advance(1700);
 for(let ticks=0;ticks<128;ticks++){
  const current=h.context.transferOwner;assert.ok(current,'the unmodified plan must remain live before the selected phase');
  assert.ok(current.index<=index,'the selected phase cannot be silently completed');
  if(current.index===index&&h.moves.length)break;
  const leg=h.moves.shift();if(leg)leg.resolve();
  // The real coordinator may yield a searching quantum before reserving the
  // next route. Drive only the existing shared 60ms scheduler, not its state.
  await h.flush();await h.advance(60);
 }
 const owner=h.context.transferOwner;assert.ok(owner);assert.equal(owner.index,index);assert.equal(owner.phase,'running');assert.ok(h.moves.length,'the requested phase must genuinely start a physical leg');
 assert.equal(h.context.office.dataset.transferStep,String(index));return owner;
}
function installVisibility(h){
 const c=h.context;Object.assign(c,{sceneHidden:()=>c.quiet,settleQuietCloneEffects:()=>{},setPose:()=>{},visitor:{tick(){}},venueStage:null,festivalStage:null,themeEnvironment:null,social:null,stationArrival:null,scenery:{update(){}},ensureMotionTicker:()=>{}});
 const start=source.indexOf('  function refreshVisibility()'),end=source.indexOf("  document.addEventListener('visibilitychange'",start);assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),c);
}
for(const [index,reason]of [[0,'fresh-semantic'],[1,'fit'],[2,'hidden']])test('phase '+index+' cancellation at '+reason+' fences its old leg and queued continuation',async()=>{
 const h=harness(),owner=await reachPhase(h,index),c=h.context,late=h.moves[0],actor=late.actor,requests=h.requests.length;
 actor.position={x:actor.position.x+.03,y:actor.position.y+.02};const actual={...actor.position};
 c.queueTransferContinuation();
 if(reason==='fresh-semantic'){
  const calls=installRender(h);c.snapshot.sessions.find(s=>s.id==='owner-000').turnId='phase-'+index+'-new-turn';c.render();assert.equal(calls(),1);
 }else if(reason==='fit'){
  c.clonePhase=(a,phase)=>a.clonePhase=phase;vm.runInContext(production('cancelPhysicalRoutes'),c);c.cancelPhysicalRoutes();
 }else{installVisibility(h);c.quiet=true;c.refreshVisibility();}
 assert.equal(c.transferOwner,null);assert.equal(c.office.dataset.transferStatus,undefined);assert.equal(c.office.dataset.transferStep,undefined);
 assert.deepEqual(h.cancelled.find(row=>row.actor===actor).point,actual,'cancellation uses the actual current physical foot');
 late.resolve();await h.flush();await h.advance(60);
 assert.equal(h.requests.length,requests,'the old phase cannot issue the next destination');assert.equal(h.arrivals.length,0,'neither the pocket nor a cancelled final phase may emit arrival');assert.equal(c.transferValid(owner),false);assert.equal(c.transferContinuation,null);
 for(const {actor:original}of owner.cast.values())assert.notEqual(original.navigation?.transferOwner,owner,'no transfer route or pocket survives cancellation');
});
test('already-successful route callbacks arriving after cancellation cannot complete any of the three old phases',async()=>{
 for(const index of [0,1,2]){
  const h=harness(),owner=await reachPhase(h,index),c=h.context,requests=h.requests.length;
  // Resolve the real pending leg now, but cancel before its promise microtasks.
  // This exercises late success, rather than only an already-rejected cancel.
  h.moves[0].resolve();c.revokeTransfer('late-success-generation');await h.flush();await h.advance(60);
  assert.equal(c.transferOwner,null);assert.equal(c.transferContinuation,null);assert.equal(h.requests.length,requests);assert.equal(h.arrivals.length,0);assert.equal(c.office.dataset.transferStatus,undefined);assert.equal(c.transferValid(owner),false);
 }
});
test('an already observed but unadmitted real body prevents acceptance even when its incoming ID is present',()=>{
 const h=harness(),session={id:'new-outside',provider:'codex',status:'active',activity:'planning'},actor={id:session.id,session,entryPending:true,position:{x:87,y:78},node:{dataset:{}},serial:0};
 h.actors.set(actor.id,actor);h.context.snapshot.sessions.push(session);h.context.attendance.present.push(session);
 assert.equal(h.context.transferAvailable(changed.concat(session)),false,'matching cast size cannot disguise an outside admission owner');assert.equal(h.context.acceptTransfer(page.transferCertificate,changed.concat(session)),false);assert.equal(h.requests.length,0);
});
test('a new observed cast invalidates a running owner before ordinary allocation can admit its body',async()=>{
 const h=harness(),owner=await reachPhase(h,1),c=h.context,calls=installRender(h),ordinary=c.WalkingLayout.layoutAllWalking;let incoming;
 c.WalkingLayout.layoutAllWalking=(rows,options)=>{incoming=rows;return ordinary(rows,options);};
 c.snapshot.sessions.push({id:'new-incoming',provider:'codex',status:'active',activity:'planning'});c.render();
 assert.equal(calls(),1);assert.ok(incoming.some(s=>s.id==='new-incoming'));assert.equal(c.transferOwner,null);assert.equal(c.office.dataset.transferStatus,undefined);assert.equal(h.arrivals.length,0);
 await h.flush();await h.advance(60);assert.equal(c.transferValid(owner),false);assert.equal(h.arrivals.length,0,'new admission cannot resurrect or finish the retired proof');
});
