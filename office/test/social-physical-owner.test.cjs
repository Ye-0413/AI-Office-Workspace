'use strict';
// Real app producers create and retire the owner evidence. The scheduler is
// never replaced; only DOM/Traffic/Animation boundary effects are controlled.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Social=require('../lib/social-interactions.js'),Scene=require('../lib/scene-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function fn(name){const start=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);const tail=source.slice(start+1).search(/\n  (?:async )?function /);assert.ok(tail>=0,name+' next declaration');return source.slice(start,start+1+tail);}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 let clock=0,nextTimer=0,token=0;const timers=new Map(),moves=[],walks=[],reserves=[],finished=[],actors=new Map();
 const node={dataset:{walking:'false',traffic:'arrived'},style:{opacity:'1',removeProperty(key){delete this[key];}}};
 const actor={id:'synthetic:owner',serial:3,helper:false,visible:true,point:{x:200,y:300},position:{x:30,y:69},target:{x:30,y:69,zone:'library'},node,
  session:{id:'synthetic:owner',provider:'codex',status:'active',activity:'coding',turnId:'one'},spec:{stale:false},state:{},bubble:{dataset:{}},
  carry:{dataset:{}},arrival:{animate(){}},clonePhase:'working',cloneEffects:new Set(),delays:new Set(),entryPending:false,
  motion:null,routeReservation:null,navigation:null,resumeNavigation:null,pendingStation:null,yielding:false,lastZone:'library'};
 const partner={id:'synthetic:partner',serial:2,visible:true,point:{x:400,y:300},session:{id:'synthetic:partner',provider:'codex',status:'active',activity:'reading'}};
 actors.set(actor.id,actor);
 const traffic={state:()=>({activeMoves:[],maxConcurrent:4,active:null,queued:0}),nextAny:()=>reserves.shift()||{kind:'wait',reason:'reserved'},finish:(...args)=>finished.push(args),cancel(){},clear(){}};
 const context={Scene,actors,traffic,trafficWaiters:new Map(),performance:{now:()=>clock},destroyed:false,fitting:false,uniformScale:1,
  trafficTimer:0,navigationTimer:0,observedIds:new Set(),currentPage:{},window:{},
  clearTimeout:id=>timers.delete(id),setTimeout:(callback,ms)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+ms});return id;},
  nextEntryCandidate:()=>null,syncTraffic(){},quietSprites:()=>false,queueAdmission(){},queueTraffic(){},queueLayoutRefresh(){},needsOpeningRefresh:()=>false,updateEntranceLane(){},
  pinnedDockIds:()=>new Set(),clearTrafficBlock(){},trackTrafficBlock(){},transitCaption(){},finishAtStation(){},updateProps(){},renderHelperLinks(){},
  currentPosition:a=>({...a.position}),getComputedStyle:a=>({opacity:a.style.opacity,transform:'matrix(1,0,0,1,384,496.8)'}),
  actorTransform:p=>'translate('+p.x+','+p.y+')',cloneBusy:()=>false,cloneAncestor:()=>null,endpointParent:()=>null,
  clonePhase:(a,phase)=>{a.clonePhase=phase;a.node.dataset.clonePhase=phase;},
  move:(a,seat,serial)=>new Promise(resolve=>moves.push({a,seat,serial,resolve})),
  animateWalk:()=>new Promise(resolve=>walks.push(resolve)),
  text:(n,value)=>{n.textContent=value;},say(){},actualArrival(){},setPose(){},
  showError:error=>{throw error;},returnClone:()=>assert.fail('ordinary station fixture cannot return a clone'),depart:()=>assert.fail('ordinary station fixture cannot exit')};
 // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);
 vm.runInContext(['syncWalkingGait','cancelAction','cancelPhysicalRoutes','queueNavigation','requestStation','resumeNavigation','pumpTraffic','settle'].map(fn).join('\n'),context);
 return{actor,partner,context,timers,moves,walks,finished,
  reserve(temporary=false){reserves.push({kind:'move',id:actor.id,token:++token,path:[actor.position,{x:40,y:78}],target:{x:40,y:78},temporary,yielding:temporary});context.pumpTraffic();},
  pair:()=>[actor,partner]};
}
function blockedWithoutConsumption(actors,context={venue:'workshop'}){
 let now=0,randomCalls=0;const scheduler=Social.createScheduler({now:()=>now,random:()=>{randomCalls++;return 0;}});
 scheduler.plan([],context);const before=scheduler.state();now=1000;
 assert.equal(Social.eligible(actors[0],context),false);
 assert.equal(Social.choosePair(actors,context),null);
 assert.equal(scheduler.plan(actors,context,{manual:true}),null);
 assert.deepEqual(scheduler.state(),before,'ineligible attempts consume no actor/pair cooldown, token or existing automatic deadline');
 assert.equal(randomCalls,0,'an ineligible pair never advances the choreography bag');
 return{scheduler,at:time=>{now=time;}};
}

test('real pending station intent cannot start a social prop, and cancelled jitter immediately restores eligibility',()=>{
 const h=harness(),truth=JSON.stringify(h.actor.session),target={x:68,y:78,zone:'desk'};
 h.context.requestStation(h.actor,target);assert.equal(h.actor.pendingStation.seat,target);assert.equal(h.actor.pendingStation.due,1700);
 const attempt=blockedWithoutConsumption(h.pair());
 h.context.requestStation(h.actor,{...h.actor.position,zone:'library'});
 assert.equal(h.actor.pendingStation,null);assert.equal(Social.eligible(h.actor),true);
 const ready=attempt.scheduler.plan(h.pair(),{venue:'workshop'},{manual:true});assert.ok(ready);assert.equal(ready.token,1);
 assert.equal(JSON.stringify(h.actor.session),truth);
});

test('an actual queued station navigation is ineligible through its endpoint promise, then the same body may socialize',async()=>{
 const h=harness(),truth=JSON.stringify(h.actor.session),seat={x:60,y:78,zone:'desk'},pending=h.context.settle(h.actor,seat);
 assert.equal(h.actor.motion,null);assert.equal(h.actor.navigation.kind,'station');assert.equal(h.actor.navigation.target,seat);
 const attempt=blockedWithoutConsumption(h.pair());
 assert.equal(h.moves.length,1);h.actor.position={x:seat.x,y:seat.y};h.moves[0].resolve(true);await pending;
 assert.equal(h.actor.navigation,null);assert.equal(Social.eligible(h.actor),true);
 assert.ok(attempt.scheduler.plan(h.pair(),{venue:'workshop'},{manual:true}));assert.equal(JSON.stringify(h.actor.session),truth);
});

test('the exact current reservation produced before physical motion cannot start a social interaction',async()=>{
 const h=harness();h.reserve();assert.equal(h.actor.motion,null);assert.equal(h.actor.routeReservation.serial,h.actor.serial);assert.ok(h.actor.routeReservation.token>0);
 blockedWithoutConsumption(h.pair());
 h.walks[0](true);await flush();assert.equal(h.actor.routeReservation,null);assert.equal(Social.eligible(h.actor),true);
});

test('the actual temporary-yield endpoint retains its finite return ownership across the between-leg gap',async()=>{
 const h=harness();h.reserve(true);h.walks[0](true);await flush();
 assert.equal(h.actor.routeReservation,null);assert.equal(h.actor.motion,null);assert.equal(h.actor.navigation,null);assert.equal(h.actor.yielding,true);
 blockedWithoutConsumption(h.pair());
 h.reserve(false);h.walks[1](true);await flush();assert.equal(h.actor.yielding,false);assert.equal(Social.eligible(h.actor),true);
});

test('production refitting saves a finite resume owner, including a zero-step consumption that needs no new arrival',async()=>{
 const h=harness();h.reserve();const truth=JSON.stringify(h.actor.session);h.context.cancelPhysicalRoutes();
 assert.equal(h.actor.routeReservation,null);assert.equal(h.actor.navigation,null);assert.equal(h.actor.resumeNavigation.kind,'station');
 blockedWithoutConsumption(h.pair());
 h.actor.target={...h.actor.position,zone:'library'};h.context.resumeNavigation();
 assert.equal(h.actor.resumeNavigation,null);assert.equal(h.actor.pendingStation,null);assert.equal(Social.eligible(h.actor),true);
 assert.equal(JSON.stringify(h.actor.session),truth);h.walks[0](false);await flush();
});

test('a running social owner becomes invalid as soon as a real new station intent is scheduled',()=>{
 const h=harness(),scheduler=Social.createScheduler({now:()=>1000,random:()=>0}),plan=scheduler.plan(h.pair(),{venue:'teahouse'},{manual:true});
 assert.ok(plan);assert.equal(scheduler.valid(h.pair(),{venue:'teahouse'}),true);
 h.context.requestStation(h.actor,{x:68,y:78,zone:'desk'});
 assert.equal(scheduler.valid(h.pair(),{venue:'teahouse'}),false,'the existing renderer guard can cancel before the impending physical route');
 assert.equal(scheduler.state().active.token,plan.token,'the pure model never removes or changes an actual body');
});

test('rejected finite owners do not postpone automatic eligibility or consume any of the twelve choreographies',()=>{
 for(const venue of Social.VENUES){
  const h=harness();h.context.requestStation(h.actor,{x:68,y:78,zone:'desk'});const attempt=blockedWithoutConsumption(h.pair(),{venue});
  attempt.at(24000);assert.equal(attempt.scheduler.plan(h.pair(),{venue}),null);assert.equal(attempt.scheduler.state().nextAuto,24000);
  h.context.requestStation(h.actor,{...h.actor.position});
  const seen=[];for(let i=0;i<Social.CATALOG[venue].length;i++){const plan=attempt.scheduler.plan(h.pair(),{venue});assert.ok(plan);seen.push(plan.kind);assert.equal(attempt.scheduler.finish(plan.token),true);attempt.at(64000+i*40000);}
  assert.deepEqual(new Set(seen),new Set(Social.CATALOG[venue].map(entry=>entry.id)));
 }
});

test('historical timing objects, obsolete reservation serials and unknown metadata cannot permanently suppress settled bodies',()=>{
 const h=harness();
 for(const patch of [{walkTiming:{motion:{},serial:h.actor.serial}},{routeReservation:{token:9,serial:h.actor.serial-1}},
  {navigation:{kind:'metadata'}},{resumeNavigation:{}},{pendingStation:{seat:{x:50,y:78},due:NaN}},
  {routeReservation:{}},{yielding:false}])assert.equal(Social.eligible({...h.actor,...patch}),true,JSON.stringify(patch));
});

test('shaped app navigation owners include future kinds, while incomplete metadata supplies no physical evidence',()=>{
 const h=harness();
 for(const kind of ['entry','restore','station','holding','return','absorb','exit','future-physical-route'])for(const key of ['navigation','resumeNavigation']){
  assert.equal(Social.eligible({...h.actor,[key]:{kind,target:{x:30,y:69}}}),false,key+'/'+kind);
 }
 for(const patch of [{navigation:{kind:'station'}},{resumeNavigation:{kind:'station',target:{x:NaN,y:69}}},{routeReservation:{token:8,serial:h.actor.serial+1}}])assert.equal(Social.eligible({...h.actor,...patch}),true);
});

test('shared physicalBusy is a pure actor-data contract rather than a second DOM or AI-state classifier',()=>{
 assert.equal(typeof Social.physicalBusy,'function');const h=harness(),truth=JSON.stringify(h.actor);
 assert.equal(Social.physicalBusy(h.actor),false);assert.equal(Social.physicalBusy(h.actor,{fitting:true}),true);
 h.context.requestStation(h.actor,{x:68,y:78,zone:'desk'});assert.equal(Social.physicalBusy(h.actor),true);
 h.context.requestStation(h.actor,{...h.actor.position,zone:'library'});assert.equal(Social.physicalBusy(h.actor),false);
 assert.equal(JSON.stringify(h.actor),truth,'the predicate and real intent cancellation preserve body/session data');
 const plain={serial:7,resumeNavigation:{kind:'station',target:{x:10,y:60}}};assert.equal(Social.physicalBusy(plain),true,'no render node or session is required to understand the same finite owner');
 assert.equal(Social.physicalBusy({...plain,resumeNavigation:null,walkTiming:{motion:{},serial:7}}),false);
});

test('an explicit shared fitting owner defers pair creation without mistaking a stable small scale for motion',()=>{
 const h=harness();blockedWithoutConsumption(h.pair(),{venue:'observatory',fitting:true});
 assert.equal(Social.eligible({...h.actor,uniformScale:.1},{venue:'observatory',fitting:false}),true);
 assert.equal(Social.eligible({...h.actor,uniformScale:.4},{venue:'observatory'}),true);
});
