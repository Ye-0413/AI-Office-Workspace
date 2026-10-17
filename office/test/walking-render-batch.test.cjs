'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const updateSource=source.slice(source.indexOf('  function updateProps()'),source.indexOf('  function selectSession('));
test('one hundred same-snapshot work updates scan the room once and do not rewrite unchanged prop state',()=>{
  let writes=0,scans=0,queries=0;const microtasks=[];
  const node=data=>({dataset:new Proxy({...data},{set:(target,key,value)=>{writes++;target[key]=value;return true;}})});
  const props=['desk','library','board'].map(zone=>node({zoneProp:zone})),labels=['desk','library','board'].map(zone=>node({zoneLabel:zone})),archive=node({count:'0'});
  const values=Array.from({length:100},(_,i)=>({id:String(i),entryPending:false,motion:null,departing:false,holdingFamily:false,spec:{zone:'desk',stale:false},lastZone:'library'}));
  const context={propsPending:false,destroyed:false,queueMicrotask:fn=>microtasks.push(fn),actors:{values:()=>{scans++;return values.values();}},world:{querySelectorAll:selector=>{queries++;return selector==='[data-zone-prop]'?props:labels;}},$:()=>archive,archiveCount:()=>0};
  vm.createContext(context);vm.runInContext(updateSource,context);
  for(let i=0;i<100;i++)context.updateProps();assert.equal(microtasks.length,1);microtasks.shift()();
  assert.equal(scans,1);assert.equal(queries,2);assert.equal(props[1].dataset.active,'true');assert.equal(props[0].dataset.active,'false','a queued functional target must not activate furniture before the body arrives');
  const firstWrites=writes;for(let i=0;i<100;i++)context.updateProps();microtasks.shift()();assert.equal(scans,2);assert.equal(queries,4);assert.equal(writes,firstWrites,'ordinary heartbeats do not emit redundant active/count mutations');
  for(const actor of values)actor.entryPending=true;context.updateProps();microtasks.shift()();assert.equal(props[1].dataset.active,'false','bodies still outside cannot activate room props');
  context.updateProps();context.destroyed=true;microtasks.shift()();assert.equal(scans,3,'destroy cancels queued room work without a persistent timer');
});
