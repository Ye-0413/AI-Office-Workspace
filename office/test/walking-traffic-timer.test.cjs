'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const pump=source.slice(source.indexOf('  function queueTraffic()'),source.indexOf('  function currentPosition('));
function harness(){
  let sequence=0,searches=0,nested=false;const timers=new Map();
  const context={nextEntryCandidate:()=>null,window:{},performance,trafficTimer:0,destroyed:false,fitting:false,actors:new Map(),trafficWaiters:new Map(),
    setTimeout:callback=>{const id=++sequence;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
    syncTraffic:()=>{},clearTrafficBlock:()=>{},trackTrafficBlock:()=>{},renderHelperLinks:()=>{},updateProps:()=>{},
    traffic:{state:()=>({activeMoves:[{}],active:{},maxConcurrent:4,queued:1}),nextAny:()=>{searches++;if(nested){nested=false;context.queueTraffic();context.pumpTraffic();}return{kind:'wait',reason:'reserved'};}}};
  // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(pump,context);
  return{context,timers,searches:()=>searches,nest:()=>{nested=true;},fire:()=>{const first=timers.entries().next().value;assert.ok(first);timers.delete(first[0]);first[1]();}};
}
test('a real synchronous traffic pump cancels its scheduled predecessor and retains exactly one timer owner',()=>{
  const h=harness();h.context.queueTraffic();
  for(let index=0;index<100;index++){h.context.pumpTraffic();assert.equal(h.timers.size,1,'a direct move() pump must not leave an orphan scheduled callback');assert.ok(h.timers.has(h.context.trafficTimer));}
  const before=h.searches();h.fire();assert.equal(h.searches(),before+1);assert.equal(h.timers.size,1);
});
test('nested staging and move pumps still produce one future deadline; teardown cancels the same owner',()=>{
  const h=harness();h.context.queueTraffic();h.nest();h.context.pumpTraffic();assert.equal(h.searches(),2);assert.equal(h.timers.size,1);assert.ok(h.timers.has(h.context.trafficTimer));
  h.context.destroyed=true;h.context.pumpTraffic();assert.equal(h.timers.size,0);assert.equal(h.context.trafficTimer,0);
});
test('an unfinished cooperative proof with no active walker yields through the same single deadline owner',()=>{
  const h=harness();h.context.traffic.state=()=>({activeMoves:[],active:null,maxConcurrent:4,queued:1});
  let turns=0;h.context.traffic.nextAny=()=>++turns<4?{kind:'wait',reason:'searching'}:{kind:'wait',reason:'blocked'};
  h.context.pumpTraffic();assert.equal(h.timers.size,1);
  h.fire();assert.equal(h.timers.size,1);h.fire();assert.equal(h.timers.size,1);h.fire();assert.equal(h.timers.size,0,'a completed blocked proof sleeps rather than creating an eternal per-avatar poll');
  assert.equal(turns,4);
});
