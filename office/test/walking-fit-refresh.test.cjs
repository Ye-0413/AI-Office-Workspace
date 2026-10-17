'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const refresh=source.slice(source.indexOf('  function queueLayoutRefresh('),source.indexOf('  function placeOutside('));
const clear=source.slice(source.indexOf('  function clearActors('),source.indexOf('  function queueAdmission('));
const admit=source.slice(source.indexOf('  function queueAdmission('),source.indexOf('  function hasBodyActivity('));
function harness(){
  const jobs=[],events=[],actors=new Map(),node={children:[],replaceChildren:()=>{}};let renders=0,resumes=0;
  const context={layoutRefreshOwner:null,layoutRefreshRequested:false,clearingActors:false,destroyed:false,fitting:false,uniformScale:.4,currentPage:{uniformScale:.4,targetUniformScale:.8},actors,seats:new Map(),admissionFrame:0,
    queueMicrotask:fn=>jobs.push(fn),render:()=>renders++,resumeNavigation:()=>resumes++,currentPosition:a=>a.position,
    office:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    removeActor:id=>{actors.delete(id);context.queueLayoutRefresh(true);},traffic:{clear:()=>{}},$:()=>node,
    getComputedStyle:()=>({transform:'scale(.4)'}),DOMMatrixReadOnly:class{constructor(){this.m11=.4;this.m12=0;}},requestAnimationFrame:()=>1};
  // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(refresh+clear+admit,context);
  const actor={id:'actual-body',serial:2,entryPending:false,node:{},position:{x:30,y:69},target:{zone:'desk'}};actors.set(actor.id,actor);
  return{context,actor,jobs,events,renders:()=>renders,resumes:()=>resumes,flush:()=>{while(jobs.length)jobs.shift()();},arrive:serial=>context.actualArrival(actor,{zone:'desk'},serial??actor.serial,'station')};
}
test('one hundred real endpoints coalesce one fit proof, while stale callbacks and mere desired size never create arrivals',()=>{
  const h=harness();for(let i=0;i<100;i++)h.arrive();assert.equal(h.jobs.length,1);assert.equal(h.events.length,100);h.flush();assert.equal(h.renders(),1);
  h.arrive(1);h.context.actors.delete(h.actor.id);h.arrive();assert.equal(h.jobs.length,0);assert.equal(h.events.length,100);
  const idle=harness();idle.context.currentPage.targetUniformScale=.4;idle.arrive();assert.equal(idle.jobs.length,0,'a physical endpoint with no larger proved fit needs no render');
});
test('a real slot released while fitting waits for the actual uniform scale endpoint before one refresh',()=>{
  const h=harness();h.context.fitting=true;h.context.queueLayoutRefresh(true);assert.equal(h.jobs.length,0);assert.equal(h.context.layoutRefreshRequested,true);
  h.context.admitBodies();assert.equal(h.context.fitting,false);assert.equal(h.jobs.length,1);assert.equal(h.resumes(),0,'a pending fit proof precedes resuming old station routes');
  h.flush();assert.equal(h.renders(),1);assert.equal(h.context.layoutRefreshRequested,false);
});
test('bulk clearing invalidates an old owner and cannot let its callback steal a new cast refresh',()=>{
  const h=harness();h.arrive();assert.equal(h.jobs.length,1);h.context.clearActors();assert.equal(h.context.layoutRefreshRequested,false);assert.equal(h.context.layoutRefreshOwner,null);
  h.context.queueLayoutRefresh(true);assert.equal(h.jobs.length,2);h.jobs.shift()();assert.equal(h.renders(),0,'the old bulk-cleared owner is inert');
  h.flush();assert.equal(h.renders(),1,'a genuine later slot-release owner remains intact');
});
test('destroyed callbacks cannot render or schedule a replacement owner',()=>{
  const h=harness();h.arrive();h.context.destroyed=true;h.flush();assert.equal(h.renders(),0);assert.equal(h.context.layoutRefreshRequested,false);
  h.context.queueLayoutRefresh(true);assert.equal(h.jobs.length,0);
});

test('an actual same-scale endpoint refreshes the next pending real split without waiting for any observer snapshot',()=>{
 const h=harness();h.context.currentPage.targetUniformScale=.4;h.actor.helper=false;h.context.actors.set('pending-real-helper',{id:'pending-real-helper',helper:true,entryPending:true});
 h.arrive();assert.equal(h.jobs.length,1);h.flush();assert.equal(h.renders(),1);
 h.context.actors.delete('pending-real-helper');h.arrive();assert.equal(h.jobs.length,0,'ordinary same-scale endpoints without a pending split do not repeat layout work');
});
