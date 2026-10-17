'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const options=source.slice(source.indexOf('  function sceneOptions('),source.indexOf('  function updateEntranceLane('));
test('opening transient blockers come only from admitted real physical, fit-resume, or yield-return owners',()=>{
 const actor=(id,patch={})=>({id,position:{x:30,y:44},entryPending:false,...patch});
 const moving=actor('walking',{motion:{}}),charging=actor('charged-route',{routeReservation:{token:7}}),pending=actor('not-entered',{entryPending:true,motion:{},routeReservation:{token:8},resumeNavigation:{kind:'entry'}}),queued=actor('intent-only',{navigation:{kind:'station'},pendingStation:{due:1700}}),uncertain=actor('uncertain',{session:{status:'stale'}}),returnGap=actor('yield-return-gap',{yielding:true}),resuming=actor('fit-resume',{resumeNavigation:{kind:'station',target:{x:40,y:84}}}),stationary=actor('at-station');
 const actors=new Map([moving,charging,pending,queued,uncertain,resuming,returnGap,stationary].map(a=>[a.id,a]));
 const context={actors,snapshot:{sessions:[]},settings:{agentScale:1,sceneVenue:'workshop'},currentPage:{requestedScale:1},seats:new Map(),uniformScale:.4,actorFootprints:new Map(),CLOCK_RESERVED:[],pinnedDockIds:()=>new Set(),closingDockPairs:()=>new Map(),openingDockPairs:()=>new Map(),currentPosition:a=>a.position,canYieldAtStation:()=>true,endpointParent:()=>null};
 // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(options,context);const first=context.sceneOptions();
 assert.deepEqual(Array.from(first.openingBusyIds),['walking','charged-route','fit-resume','yield-return-gap']);assert.equal(first.currentPositions.has('not-entered'),false);
 moving.motion=null;charging.routeReservation=null;resuming.resumeNavigation=null;returnGap.yielding=false;const next=context.sceneOptions();assert.equal(next.openingBusyIds.size,0,'route completion/cancellation stops deferring a truly stationary width failure');
 assert.equal(first.openingBusyIds.size,4,'a subsequent physical observation cannot mutate a prior proof input');
 assert.equal(queued.navigation.kind,'station');assert.equal(uncertain.session.status,'stale','metadata is never rewritten to invent motion');
});

test('a real cooperative-yield route keeps its exact resume owner across a shared fit even without an ordinary navigation object',()=>{
 const actors=new Map(),target={x:29.05,y:48.2},actor={id:'yielding-main',entryPending:false,motion:{},navigation:null,target,yielding:true,node:{dataset:{}}};actors.set(actor.id,actor);
 const context={actors,cancelAction:a=>{a.motion=null;a.routeReservation=null;a.yielding=false;a.navigation=null;},clonePhase:(a,p)=>{a.clonePhase=p;},traffic:{clear:()=>{}}};
 // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function cancelPhysicalRoutes('),source.indexOf('  function fadeBody(')),context);context.cancelPhysicalRoutes();
 assert.equal(actor.resumeNavigation.kind,'station');assert.equal(actor.resumeNavigation.target,target,'the actual paused route resumes its already owned real station');assert.equal(actor.navigation,null);assert.equal(actor.motion,null);
});

test('a real yield-return gap survives a fit clear and an already saved resume owner is never overwritten by a second clear',()=>{
 const target={x:29.05,y:48.2},actor={id:'yield-return',entryPending:false,motion:null,routeReservation:null,navigation:null,yielding:true,target,node:{dataset:{}}},actors=new Map([[actor.id,actor]]);let cancelled=0,returnRequest=true;
 const context={actors,trafficWaiters:new Map(),cancelAction:a=>{cancelled++;a.yielding=false;a.motion=null;a.routeReservation=null;a.navigation=null;a.resumeNavigation=null;},clonePhase:(a,p)=>{a.clonePhase=p;},traffic:{clear:()=>{returnRequest=false;}}};
 // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function cancelPhysicalRoutes('),source.indexOf('  function fadeBody(')),context);context.cancelPhysicalRoutes();
 assert.equal(cancelled,1,'the real between-leg return owner participates in physical fit cancellation');assert.equal(returnRequest,false);assert.equal(actor.yielding,false);assert.equal(actor.resumeNavigation.kind,'station');assert.equal(actor.resumeNavigation.target,target);
 const owner=actor.resumeNavigation;context.cancelPhysicalRoutes();assert.equal(cancelled,1);assert.equal(actor.resumeNavigation,owner,'a pure paused owner survives a second fit clear without an unrelated cancel');
});
