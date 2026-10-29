'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Traffic=require('../lib/scene-traffic.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function production(name){const start=source.search(new RegExp('  (?:async )?function '+name+'\\('));assert.notEqual(start,-1);const end=source.slice(start+1).search(/\n  (?:async )?function /);return source.slice(start,start+1+end);}
function harness(){
  let now=100;const submissions=[],pumps=[],timers=[],errors=[],actors=new Map(),trafficWaiters=new Map();
  const traffic=Traffic.createCoordinator({passThrough:true,maxConcurrent:8,obstacles:[],legalPoint:()=>true,route:(a,b)=>[a,b],bounds:p=>({left:p.x*12.8-20,right:p.x*12.8+20,top:p.y*7.2-20,bottom:p.y*7.2+20})});
  function actor(id,x,due=100){const value={id,serial:1,helper:false,position:{x,y:60},node:{dataset:{}},pendingStation:{seat:{x:x===25?75:25,y:60},due}};actors.set(id,value);return value;}
  const a=actor('a',25),b=actor('b',75);
  const context={actors,traffic,trafficWaiters,navigationTimer:0,destroyed:false,fitting:false,transferOwner:null,currentPage:{gap:12},performance:{now:()=>now},pinnedDockIds:()=>new Set(),queueTransferContinuation:()=>{},clearTimeout:()=>{},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},showError:error=>errors.push(error),cloneAncestor:()=>null,endpointParent:()=>null,cloneBusy:()=>false,actorGeometry:()=>({}),currentPosition:a=>a.position,Scene:{actorsOverlap:()=>false},reduced:()=>false,sceneHidden:()=>false,transitCaption:()=>{},syncTraffic:()=>traffic.sync([...actors.values()].map(a=>({id:a.id,position:a.position}))),settle:(a,target)=>{submissions.push(a.id);return context.move(a,target,a.serial);},pumpTraffic:()=>{
    const waiting=[...trafficWaiters.keys()],batch=traffic.nextBatch();pumps.push({waiting,batch});
    for(const plan of batch)if(plan.kind==='move'||plan.kind==='arrived'){const value=actors.get(plan.id),pending=trafficWaiters.get(plan.id);value.position=plan.target;if(plan.kind==='move')traffic.finish(plan.id,plan.token,plan.target);trafficWaiters.delete(plan.id);pending?.resolve(true);}
  }};
  vm.createContext(context);vm.runInContext(production('queueNavigation')+'\n'+production('move'),context);
  return{context,a,b,actor,submissions,pumps,timers,errors,traffic,trafficWaiters,setNow:value=>{now=value;}};
}
test('real queueNavigation submits all reciprocal due moves before its single Traffic batch',async()=>{
  const h=harness();h.context.queueNavigation();await Promise.resolve();
  assert.deepEqual(h.submissions,['a','b']);assert.equal(h.pumps.length,1);assert.deepEqual(h.pumps[0].waiting,['a','b']);
  assert.deepEqual(h.pumps[0].batch.map(p=>p.id),['a','b']);assert.ok(h.pumps[0].batch.every(p=>p.kind==='move'&&!p.temporary));
  assert.equal(h.a.position.x,75);assert.equal(h.b.position.x,25);assert.equal(h.context.queueNavigation.batch,undefined);assert.deepEqual(h.errors,[]);
});
test('the navigation batch preserves future deadlines and excludes protected lifecycle actors',()=>{
  const h=harness(),future=h.actor('future',45,250),held=h.actor('held',55);held.holdingFamily=true;
  h.context.queueNavigation();assert.deepEqual(h.submissions,['a','b']);assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,150);assert.ok(future.pendingStation);assert.ok(held.pendingStation);
});
test('real move outside a navigation submission still pumps immediately',async()=>{
  const h=harness();h.b.pendingStation=null;const result=h.context.move(h.a,{x:10,y:20},h.a.serial);assert.equal(h.pumps.length,1);assert.deepEqual(h.pumps[0].waiting,['a']);assert.equal(await result,true);
});
test('a synchronous submission failure releases its local batch owner',()=>{
  const h=harness();h.context.settle=()=>{throw Error('fixture submission fault');};assert.throws(()=>h.context.queueNavigation(),/fixture submission fault/);assert.equal(h.context.queueNavigation.batch,undefined);assert.equal(h.pumps.length,0);
});
