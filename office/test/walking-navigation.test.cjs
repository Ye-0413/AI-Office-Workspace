'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const navigationSource=source.slice(source.indexOf('  function queueNavigation()'),source.indexOf('  function delay('));
const dockingSource=source.slice(source.indexOf('  function pinnedDockIds()'),source.indexOf('  function syncTraffic()'));
function harness(){
  let now=0,sequence=0;const timers=new Map(),actors=new Map(),moves=[];
  const context={needsOpeningRefresh:()=>false,queueLayoutRefresh:()=>{},actors,destroyed:false,fitting:false,navigationTimer:0,performance:{now:()=>now},Scene:{distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    cloneBusy:actor=>['splitting','returning','absorbing'].includes(actor.clonePhase),
    settle:async(actor,seat)=>{moves.push({id:actor.id,seat});actor.navigation={kind:'station',target:seat};},showError:()=>assert.fail('navigation must not throw'),queueTraffic:()=>{},returnClone:async()=>{},depart:async()=>{}};
  // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(dockingSource+navigationSource,context);
  function advance(ms){now+=ms;for(const[id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}
  const actor=(id='root',extra={})=>{const value={id,node:{dataset:{}},position:{x:20,y:44},target:{x:20,y:44,zone:'library'},spec:{stale:false},entryPending:false,departing:false,holdingFamily:false,navigation:null,pendingStation:null,...extra};actors.set(id,value);return value;};
  return{context,actors,moves,timers,actor,advance,request:(a,s,urgent)=>context.requestStation(a,s,urgent)};
}
test('real station navigation waits for a stable functional intent; repeated snapshots keep its original deadline',()=>{
  const h=harness(),actor=h.actor(),coding={x:42,y:76,zone:'desk'};
  h.request(actor,coding);h.advance(800);h.request(actor,{...coding});h.advance(899);assert.equal(h.moves.length,0);
  h.advance(1);assert.equal(h.moves.length,1);assert.deepEqual(h.moves[0],{id:actor.id,seat:coding});
  h.request(actor,{...coding});h.advance(5000);assert.equal(h.moves.length,1,'a current route is never restarted by same-target metadata');
});
test('brief tool-area jitter which returns to the physical station never starts a walk',()=>{
  const h=harness(),actor=h.actor(),actual={...actor.position};
  h.request(actor,{x:42,y:76,zone:'desk'});h.advance(200);h.request(actor,{x:85,y:44,zone:'bench'});h.advance(200);h.request(actor,{...actual,zone:'library'});h.advance(2000);
  assert.equal(h.moves.length,0);assert.deepEqual(actor.position,actual);assert.equal(actor.pendingStation,null);
  assert.equal(actor.node.dataset.traffic,'arrived','a cancelled return which is already at its actual observed station must not keep an empty traffic state');
});
test('one shared deadline timer handles one hundred functional changes without per-avatar polling',()=>{
  const h=harness();for(let i=0;i<100;i++)h.request(h.actor('root-'+i),{x:30+i/10,y:77,zone:'desk'});
  assert.equal(h.timers.size,1);h.advance(1700);assert.equal(h.moves.length,100);assert.equal(h.timers.size,0);
});
test('a returning clone pins its actual main docking foot and releases the latest real functional destination on arrival',()=>{
  const h=harness(),main=h.actor(),clone=h.actor('clone',{navigation:{kind:'return',parentId:main.id}});
  const target={x:70,y:45,zone:'board'};h.request(main,target);h.advance(2500);assert.equal(h.moves.length,0);assert.equal(h.timers.size,0);
  h.actors.delete(clone.id);h.context.queueNavigation();assert.deepEqual(h.moves,[{id:main.id,seat:target}]);
});
test('real traffic cannot force a parent dock to yield during split charge, return, or absorb; an unrelated body stays yieldable',()=>{
  const h=harness(),main=h.actor(),other=h.actor('other'),clone=h.actor('clone',{cloneCharge:true,navigation:{kind:'entry',parentId:main.id}});
  const eligible=actor=>h.context.canYieldActor(actor,h.context.pinnedDockIds());
  assert.equal(eligible(main),false);assert.equal(eligible(other),true);
  clone.cloneCharge=false;assert.equal(eligible(main),true,'walking after charge does not pin the main for the whole route');
  for(const kind of ['return','absorb']){clone.navigation={kind,parentId:main.id};assert.equal(eligible(main),false);}
  clone.navigation=null;assert.equal(eligible(main),true);
  for(const state of [{motion:{}},{routeReservation:{}},{departing:true},{holdingFamily:true},{completing:true},{spec:{stale:true}},{clonePhase:'absorbing'}]){
    const actor=h.actor('busy',state);assert.equal(eligible(actor),false,JSON.stringify(state));
  }
});
test('a normal moving body remains yieldable at its future station without relaxing any actual Traffic or clone-dock lock',()=>{
  const h=harness(),ordinary=h.actor('ordinary',{motion:{}}),reserved=h.actor('reserved',{routeReservation:{}});
  for(const actor of [ordinary,reserved]){assert.equal(h.context.canYieldAtStation(actor,h.context.pinnedDockIds()),true);assert.equal(h.context.canYieldActor(actor,h.context.pinnedDockIds()),false);}
  for(const patch of [{departing:true},{holdingFamily:true},{completing:true},{spec:{stale:true}},{clonePhase:'returning'}]){const actor=h.actor('protected',{motion:{},...patch});assert.equal(h.context.canYieldAtStation(actor,h.context.pinnedDockIds()),false);assert.equal(h.context.canYieldActor(actor,h.context.pinnedDockIds()),false);}
  const main=h.actor('main',{motion:{}});h.actor('child',{cloneCharge:true,navigation:{kind:'entry',parentId:main.id}});assert.equal(h.context.canYieldAtStation(main,h.context.pinnedDockIds()),false,'a physically moving parent with an actual dock lock is never reclassified as a future yielder');
});
test('fit transitions, first entry and uncertain evidence never replace an admitted body with a target position',()=>{
  const h=harness(),actor=h.actor();h.context.fitting=true;h.request(actor,{x:50,y:44,zone:'board'});h.advance(3000);assert.equal(h.moves.length,0);assert.deepEqual(actor.position,{x:20,y:44});
  h.context.fitting=false;h.context.queueNavigation();assert.equal(h.moves.length,1);
  const stale=h.actor('stale',{spec:{stale:true}}),entering=h.actor('entering',{entryPending:true});h.request(stale,{x:80,y:77},true);h.request(entering,{x:81,y:77},true);h.advance(3000);assert.equal(h.moves.length,1);
  assert.deepEqual(stale.position,{x:20,y:44});assert.deepEqual(entering.position,{x:20,y:44});
});

test('subpixel station differences still take a genuine route so the exact fit endpoint can complete',()=>{
  const h=harness(),actor=h.actor(),seat={x:20.01203461,y:44,zone:'library'};
  h.request(actor,seat);assert.ok(actor.pendingStation,'the physical endpoint is not the desired subpixel target');
  h.advance(800);h.request(actor,{...seat,x:seat.x+.0001});h.advance(900);
  assert.equal(h.moves.length,1,'minor target refinement keeps the original coalesced intent deadline');
  assert.equal(h.moves[0].seat.x,seat.x+.0001);assert.deepEqual(actor.position,{x:20,y:44},'a request cannot teleport the actual body');
  actor.navigation=null;actor.position={...h.moves[0].seat};h.request(actor,{...actor.position});h.advance(5000);
  assert.equal(h.moves.length,1,'the completed exact endpoint never restarts on the same snapshot');
});

test('physical endpoint tolerance also respects the world-aspect-adjusted vertical distance',()=>{
  const h=harness();h.context.Scene.distance=require('../lib/scene-model.js').distance;
  const actor=h.actor(),seat={x:20,y:44.0011,zone:'library'};h.request(actor,seat);h.advance(1700);
  assert.equal(h.moves.length,1,'a y difference outside the allocator endpoint tolerance must genuinely walk');
  actor.navigation=null;actor.position={x:20,y:44};h.request(actor,{x:20,y:44.0008,zone:'library'});h.advance(1700);
  assert.equal(h.moves.length,1,'numerical noise inside the per-axis settled proof does not restart a physical route');
});

test('a resumed physical owner which already reached its actual station still re-proves a pending opening once',()=>{
 const h=harness(),actor=h.actor();let refreshes=0;h.context.needsOpeningRefresh=()=>true;h.context.queueLayoutRefresh=()=>refreshes++;
 actor.resumeNavigation={kind:'station',target:{...actor.position}};h.context.resumeNavigation();assert.equal(actor.resumeNavigation,null);assert.equal(h.moves.length,0);assert.equal(refreshes,1,'no fake walk/arrival is needed to retire the genuine paused owner');
 h.context.resumeNavigation();assert.equal(refreshes,1,'subsequent plain reconciliation without a resume owner cannot loop');
});
