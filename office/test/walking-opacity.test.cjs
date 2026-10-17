'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const fadeSource=source.slice(source.indexOf('  function fadeBody('),source.indexOf('  function cancelAction('));
function setup(withCancel=false){
  const motions=[];let quiet=false;
  const node={actualOpacity:1,dataset:{},style:{opacity:'1',removeProperty(name){if(name==='transition-property')delete this.transitionProperty;}},animate(frames,options){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const motion={frames,options,finished,cancel:()=>reject(new Error('cancelled')),finish:()=>{node.actualOpacity=frames.at(-1).opacity;resolve();}};motions.push(motion);return motion;}};
  const actor={id:'clone',helper:true,serial:1,entryPending:false,node,opacityMotion:null,cloneEffects:new Set(),delays:new Set(),bubble:{dataset:{}},position:{x:20,y:60}};
  const context={getComputedStyle:n=>({opacity:String(n.actualOpacity)}),quietSprites:()=>quiet,cloneBusy:()=>true,cloneAncestor:()=>({id:'root'}),endpointParent:()=>{},trafficWaiters:new Map(),traffic:{cancel:()=>{}},currentPosition:value=>value.position,clonePhase:(value,phase)=>{value.clonePhase=phase;value.node.dataset.clonePhase=phase;},queueTraffic:()=>{},clearTimeout:()=>{}};
  // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(withCancel?source.slice(source.indexOf('  function fadeBody('),source.indexOf('  function queueNavigation(')):fadeSource,context);
  return{context,actor,node,motions,fade:target=>context.fadeBody(actor,target),cancel:()=>context.cancelAction(actor),quiet:()=>{quiet=true;}};
}
test('an interrupted actual body absorption restores from its sampled alpha and an obsolete completion cannot clear its owner',async()=>{
  const h=setup(),out=h.fade(0);assert.deepEqual(Array.from(h.motions[0].frames,f=>f.opacity),[1,0]);assert.equal(h.motions[0].options.duration,220);
  h.node.actualOpacity=.42;const back=h.fade(1),restoring=h.motions[1];
  assert.deepEqual(Array.from(restoring.frames,f=>f.opacity),[.42,1]);assert.equal(h.node.dataset.bodyFade,'restore');assert.equal(h.actor.opacityMotion,restoring);
  assert.equal(await out,false);assert.equal(h.actor.opacityMotion,restoring);assert.equal(h.node.dataset.bodyFade,'restore');
  restoring.finish();assert.equal(await back,true);assert.equal(h.actor.opacityMotion,null);assert.equal(h.node.dataset.bodyFade,undefined);assert.equal(h.node.style.opacity,'1');
});
test('quiet mode cancels a finite absorption and settles its actual body without creating another animation',async()=>{
  const h=setup(),out=h.fade(0);h.node.actualOpacity=.35;h.quiet();assert.equal(await h.fade(1),true);assert.equal(await out,false);
  assert.equal(h.motions.length,1);assert.equal(h.actor.opacityMotion,null);assert.equal(h.node.style.opacity,'1');assert.equal(h.node.dataset.bodyFade,undefined);assert.equal(h.node.style.transitionProperty,undefined);
});
test('fresh work after the body fade finished but before FX finished resumes from actual zero alpha rather than flashing opaque',async()=>{
  const h=setup(true);h.actor.clonePhase='absorbing';const out=h.fade(0);h.motions[0].finish();await out;
  assert.equal(h.actor.opacityMotion,null);assert.equal(h.node.style.opacity,'0');assert.equal(h.node.actualOpacity,0);
  let effectCancelled=false;h.actor.cloneEffects.add({cancel:()=>{effectCancelled=true;}});
  h.cancel();assert.equal(effectCancelled,true);assert.equal(h.actor.serial,2);assert.equal(h.actor.clonePhase,'working');
  const restore=h.motions[1];assert.deepEqual(Array.from(restore.frames,f=>f.opacity),[0,1]);assert.equal(h.node.actualOpacity,0,'cancellation itself cannot snap the currently rendered transparent body to opaque');assert.equal(h.node.dataset.bodyFade,'restore');
  restore.finish();await restore.finished;await Promise.resolve();assert.equal(h.node.style.opacity,'1');
});

test('only a cancelled real physical owner refreshes a pending split, and a running fit retains one deferred refresh',()=>{
 const h=setup(true),jobs=[];let renders=0;Object.assign(h.context,{needsOpeningRefresh:()=>true,layoutRefreshOwner:null,layoutRefreshRequested:false,clearingActors:false,destroyed:false,fitting:true,uniformScale:1,currentPage:{uniformScale:1,targetUniformScale:1},queueMicrotask:fn=>jobs.push(fn),render:()=>renders++});
 const refresh=source.slice(source.indexOf('  function queueLayoutRefresh('),source.indexOf('  function placeOutside('));vm.runInContext(refresh,h.context);
 h.actor.routeReservation={token:17};h.cancel();assert.equal(h.context.layoutRefreshRequested,true);assert.equal(jobs.length,0,'the cancelled physical route never interrupts the shared live fit');
 h.context.fitting=false;h.context.queueLayoutRefresh();assert.equal(jobs.length,1);jobs.shift()();assert.equal(renders,1);
 h.cancel();assert.equal(jobs.length,0,'entry/caption cancellations without a physical owner cannot create a render loop');
 h.context.needsOpeningRefresh=()=>false;h.actor.routeReservation={token:18};h.cancel();assert.equal(jobs.length,0,'physical cancellation alone does not refresh an unrelated room');
});

test('cancelled yield-return and saved physical-resume owners wake pending splits without inventing a new arrival',()=>{
 for(const owned of ['yielding','resumeNavigation']){const h=setup(true);let refreshes=0;Object.assign(h.context,{needsOpeningRefresh:()=>true,queueLayoutRefresh:()=>refreshes++});h.actor[owned]=owned==='yielding'?true:{kind:'station',target:{x:20,y:60}};h.cancel();assert.equal(refreshes,1,owned);assert.equal(h.actor.yielding,false);assert.equal(h.actor.resumeNavigation,null);h.cancel();assert.equal(refreshes,1,'a consumed owner never repeats '+owned);}
});
