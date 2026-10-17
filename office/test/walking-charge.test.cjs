'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const pumpSource=source.slice(source.indexOf('  function pumpTraffic()'),source.indexOf('  function currentPosition('));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  let release,walks=0,reservations=0;const ready=new Promise(resolve=>{release=resolve;}),resolved=[],actors=new Map(),trafficWaiters=new Map();
  const root={id:'root'},actor={id:'clone',serial:7,helper:true,entryPending:true,stagedEntry:true,position:{x:50,y:78},node:{style:{},dataset:{cloneOrigin:'root'}},clonePhase:'splitting'};
  actors.set(actor.id,actor);trafficWaiters.set(actor.id,{actor,serial:7,resolve:value=>resolved.push(value)});
  const traffic={state:()=>({activeMoves:[],maxConcurrent:4,active:null,queued:0}),nextAny:()=>++reservations===1?{kind:'move',id:actor.id,token:11,path:[{x:50,y:78},{x:15,y:44}],target:{x:15,y:44}}:{kind:'wait',reason:'reserved'},cancel:()=>{},finish:()=>{}};
  const context={nextEntryCandidate:()=>null,currentPage:{},window:{},performance,clearTimeout:()=>{},trafficTimer:0,destroyed:false,fitting:false,actors,trafficWaiters,traffic,observedIds:new Set(),syncTraffic:()=>{},cloneAncestor:()=>root,cloneEffect:()=>({ready}),quietSprites:()=>false,queueAdmission:()=>{},clearTrafficBlock:()=>{},trackTrafficBlock:()=>{},updateEntranceLane:()=>{},openDoor:()=>assert.fail('a clone cannot open a fake main entrance'),queueNavigation:()=>{},animateWalk:async()=>{walks++;return true;},currentPosition:value=>value.position,renderHelperLinks:()=>{},queueTraffic:()=>{},transitCaption:()=>{},finishAtStation:()=>{},updateProps:()=>{},showError:()=>assert.fail('a charge must not throw')};
  vm.createContext(context);vm.runInContext(pumpSource,context);return{context,actor,actors,resolved,release,walks:()=>walks};
}
test('a materialized clone keeps a real traffic owner during its charge, then starts exactly one physical walk after ready',async()=>{
  const h=setup();h.context.pumpTraffic();assert.equal(h.actor.entryPending,false);assert.equal(h.actor.node.style.opacity,'1');assert.equal(h.actor.cloneCharge,true);assert.equal(h.actor.routeReservation.token,11);assert.equal(h.walks(),0);
  h.context.pumpTraffic();assert.equal(h.walks(),0,'another traffic pump cannot bypass the charged reservation');
  h.release();await flush();assert.equal(h.walks(),1);assert.equal(h.actor.cloneCharge,false);assert.equal(h.actor.routeReservation,null);assert.deepEqual(h.resolved,[true]);
});
test('size/activity cancellation during the motion-free charge cannot start an obsolete route after FX readiness resolves',async()=>{
  const h=setup();h.context.pumpTraffic();h.actor.serial++;h.actor.routeReservation=null;h.actor.cloneCharge=false;
  h.release();await flush();assert.equal(h.walks(),0);assert.deepEqual(h.resolved,[false]);assert.equal(h.actor.node.style.opacity,'1','the admitted body never hides while its old charge is cancelled');
});
