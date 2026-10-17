'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const pump=source.slice(source.indexOf('  function pumpTraffic()'),source.indexOf('  function currentPosition('));
const options=source.slice(source.indexOf('  function sceneOptions('),source.indexOf('  function updateEntranceLane('));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const actor={id:'actual-yielder',helper:false,serial:3,entryPending:false,node:{style:{},dataset:{}},position:{x:50,y:78},session:{id:'actual-yielder',status:'active',activity:'coding'}},helper={id:'observed-pending-helper',helper:true,entryPending:true,node:{dataset:{}}};
 const actors=new Map([[actor.id,actor],[helper.id,helper]]),resolved=[],trafficWaiters=new Map([[actor.id,{actor,serial:actor.serial,resolve:ok=>resolved.push(ok)}]]);let leg=0,finished=0,refreshes=0;
 const traffic={state:()=>({activeMoves:[],maxConcurrent:4,active:null,queued:0}),nextAny:()=>++leg<=2?{kind:'move',id:actor.id,token:leg,path:[actor.position,{x:30,y:69}],target:{x:30,y:69},yielding:true,temporary:leg===1}:{kind:'wait',reason:'reserved'},finish:()=>finished++,cancel:()=>{}};
 const context={window:{},performance,clearTimeout:()=>{},trafficTimer:0,destroyed:false,fitting:false,actors,trafficWaiters,traffic,nextEntryCandidate:()=>null,syncTraffic:()=>{},quietSprites:()=>false,clearTrafficBlock:()=>{},trackTrafficBlock:()=>{},currentPosition:a=>a.position,queueNavigation:()=>{},animateWalk:async()=>true,renderHelperLinks:()=>{},queueTraffic:()=>{},transitCaption:()=>{},finishAtStation:()=>{},updateProps:()=>{},queueLayoutRefresh:()=>refreshes++,showError:()=>assert.fail('real tail callback cannot throw'),snapshot:{sessions:[actor.session]},settings:{agentScale:1,sceneVenue:'workshop'},currentPage:{requestedScale:1},uniformScale:.4,seats:new Map(),actorFootprints:new Map(),CLOCK_RESERVED:[],pinnedDockIds:()=>new Set(),closingDockPairs:()=>new Map(),openingDockPairs:()=>new Map(),canYieldAtStation:()=>true,endpointParent:()=>null};
 vm.createContext(context);vm.runInContext(pump+options,context);return{actor,context,resolved,trafficWaiters,finished:()=>finished,refreshes:()=>refreshes};
}
test('a pending own journey yields to a temporary foot, remains finite-busy through its real return gap, then clears on permanent completion',async()=>{
 const h=harness(),facts=JSON.stringify(h.actor.session);h.context.pumpTraffic();await flush();
 assert.equal(h.finished(),1);assert.equal(h.actor.routeReservation,null);assert.equal(h.actor.motion,undefined);assert.equal(h.actor.resumeNavigation,undefined);assert.equal(h.actor.yielding,true);assert.equal(h.trafficWaiters.has(h.actor.id),true);assert.deepEqual(h.resolved,[]);
 assert.equal(h.context.sceneOptions().openingBusyIds.has(h.actor.id),true,'the temporary endpoint still owns a proven finite return before the next pump');
 h.context.pumpTraffic();await flush();assert.equal(h.finished(),2);assert.deepEqual(h.resolved,[true]);assert.equal(h.actor.yielding,false,'permanent completion clears yielding even when it resolves an existing pending route');
 assert.equal(h.context.sceneOptions().openingBusyIds.has(h.actor.id),false);assert.equal(JSON.stringify(h.actor.session),facts,'physical yielding never changes observed work status');assert.equal(h.refreshes(),2,'each actual leg endpoint re-proves the pending split');
});

test('successful permanent completion clears the yielding flag while resolving an existing pending journey',async()=>{
 const h=harness();h.context.pumpTraffic();await flush();h.context.pumpTraffic();await flush();assert.deepEqual(h.resolved,[true]);assert.equal(h.actor.yielding,false);
});
