'use strict';
// Exercise the production pump: a coordinator's atomic departure batch must
// start as one turn, or be rejected as one turn when a member became obsolete.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const pump=source.slice(source.indexOf('  function pumpTraffic()'),source.indexOf('  function currentPosition('));
function fixture(stale=false){
  const actors=new Map(['a','b'].map((id,index)=>[id,{id,serial:2,position:{x:20+index*40,y:80},entryPending:false,node:{dataset:{}},session:{id,activity:'coding'}}]));
  const starts=[],ends=[],cancelled=[],resolved=[],settlers=[];
  const trafficWaiters=new Map([...actors].map(([id,actor])=>[id,{actor,serial:2,resolve:ok=>resolved.push([id,ok])}]));
  if(stale){actors.get('b').entryPending=true;actors.get('b').stagedEntry=true;trafficWaiters.get('b').serial=1;}
  const reservations=[...actors.values()].map((actor,index)=>({kind:'move',id:actor.id,token:index+1,path:[actor.position,{x:60-index*40,y:80}],target:{x:60-index*40,y:80},temporary:false}));
  for(const reservation of reservations){const actor=actors.get(reservation.id);actor.target=reservation.target;actor.navigation={kind:actor.entryPending?'entry':'station',target:actor.target};actor.spec={};actor.clonePhase='';}
  const noop=()=>{},context={actors,trafficWaiters,trafficTimer:0,destroyed:false,fitting:false,transferOwner:null,currentPage:{},
    clearTimeout:noop,syncTraffic:noop,queueAdmission:noop,nextEntryCandidate:()=>null,clearTrafficBlock:noop,trackTrafficBlock:noop,
    queueTraffic:noop,queueNavigation:noop,queueTransferContinuation:noop,queueLayoutRefresh:noop,renderHelperLinks:noop,updateProps:noop,
    currentPosition:actor=>actor.position,showError:error=>{throw error;},
    clonePhase:(actor,phase)=>{actor.clonePhase=phase;actor.node.dataset.clonePhase=phase;},resumeNavigation:noop,
    cancelAction:actor=>{
      actor.serial++;actor.stagedEntry=false;actor.navigation=null;actor.resumeNavigation=null;actor.routeReservation=null;
      actor.departing=false;actor.returnReason='';actor.clonePhase='working';delete actor.node.dataset.cloneTarget;delete actor.node.dataset.cloneReason;
      const pending=trafficWaiters.get(actor.id);if(pending){trafficWaiters.delete(actor.id);pending.resolve(false);}
      context.traffic.cancel(actor.id,context.currentPosition(actor));
    },
    traffic:{state:()=>({activeMoves:[],maxConcurrent:8,queued:0}),nextBatch:()=>reservations,
      cancel:(id,position)=>cancelled.push([id,position]),finish:(id,token,position)=>ends.push([id,token,position])},
    animateWalk:(actor,route)=>{starts.push(actor.id);return new Promise(resolve=>settlers.push(()=>{actor.position=route.at(-1);resolve(true);}));}
  };
  vm.createContext(context);vm.runInContext(pump,context);
  return{context,actors,starts,ends,cancelled,resolved,settlers};
}
test('production pump starts both swap legs in the same turn before either can finish',async()=>{
  const f=fixture();f.context.pumpTraffic();
  assert.deepEqual(f.starts,['a','b']);assert.equal(f.ends.length,0);
  assert.ok([...f.actors.values()].every(actor=>actor.routeReservation));
  for(const finish of f.settlers)finish();await new Promise(setImmediate);
  assert.equal(f.ends.length,2);assert.deepEqual(f.resolved,[['a',true],['b',true]]);
  assert.ok([...f.actors.values()].every(actor=>actor.routeReservation===null));
});
test('one stale staged member rejects the entire batch without starting its partner',()=>{
  const f=fixture(true),before=[...f.actors.values()].map(actor=>({...actor.position}));f.context.pumpTraffic();
  assert.deepEqual(f.starts,[]);assert.deepEqual(f.cancelled.map(([id])=>id),['a','b']);
  assert.deepEqual(f.resolved,[['a',false],['b',false]]);assert.equal(f.context.trafficWaiters.size,0);
  assert.deepEqual([...f.actors.values()].map(actor=>actor.position),before);
});

function installResume(f){
  const start=source.indexOf('  function requestStation('),end=source.indexOf('  function delay(',start);
  Object.assign(f.context,{Scene:{distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},performance:{now:()=>100},needsOpeningRefresh:()=>false});
  vm.runInContext(source.slice(start,end),f.context);
}
test('a rejected batch releases stale navigation and retries its valid peer without moving either source foot',()=>{
  const f=fixture(true),a=f.actors.get('a'),b=f.actors.get('b'),feet=[a.position,b.position],target=a.target;
  installResume(f);f.context.pumpTraffic();
  assert.deepEqual(f.starts,[]);assert.deepEqual(f.resolved,[['a',false],['b',false]]);
  assert.equal(a.navigation,null,'a cancelled await must not leave navigation.target falsely satisfied');
  assert.equal(a.pendingStation.seat,target);assert.equal(a.pendingStation.due,100,'the valid peer is retried immediately');
  assert.equal(a.position,feet[0]);assert.equal(b.position,feet[1]);
  assert.equal(b.entryPending,true);assert.equal(b.stagedEntry,false,'the next source proof can admit the stale staged member');
  assert.equal(f.context.trafficWaiters.size,0);assert.equal(a.resumeNavigation,null);assert.equal(b.resumeNavigation,null);
});
test('batch rollback restores real clone return flags before handing its intent back to the existing lifecycle owner',()=>{
  const f=fixture(true),a=f.actors.get('a'),foot=a.position,observed=a.session,returned=[];
  a.helper=true;a.departing=true;a.returnReason='completed';a.clonePhase='returning';
  a.node.dataset.cloneTarget='real-parent';a.node.dataset.cloneReason='completed';
  a.navigation={kind:'return',reason:'completed',parentId:'real-parent',target:a.target};
  Object.assign(f.context,{returnClone:(actor,reason)=>{returned.push({actor,reason,phase:actor.clonePhase,target:actor.node.dataset.cloneTarget});return Promise.resolve();}});
  installResume(f);f.context.pumpTraffic();
  assert.equal(returned.length,1);assert.equal(returned[0].actor,a);assert.equal(returned[0].reason,'completed');
  assert.equal(returned[0].phase,'returning');assert.equal(returned[0].target,'real-parent');
  assert.equal(a.node.dataset.cloneReason,'completed');assert.equal(a.returnReason,'completed');
  assert.equal(a.position,foot);assert.equal(a.session,observed,'rollback never edits the observed session');
});
