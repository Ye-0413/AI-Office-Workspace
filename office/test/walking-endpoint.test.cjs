'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Scene=require('../lib/scene-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const endpointSource=source.slice(source.indexOf('  function cloneBusy('),source.indexOf('  function completedCloneTurn('));
function setup(){
  const actors=new Map(),parent={id:'root',position:{x:30,y:60},node:{dataset:{},matrix:{m11:1,m12:0}}},child={id:'clone',helper:true,serial:4,position:{x:30.5,y:60},node:{dataset:{},matrix:{m11:1,m12:0}},clonePhase:'returning',entryPending:false};actors.set(parent.id,parent);actors.set(child.id,child);
  const context={actors,Scene,currentPage:{gap:2},cloneAncestor:()=>parent,currentPosition:actor=>actor.position,actorGeometry:()=>({uniformScale:1,footprint:{left:10,right:10,top:10,bottom:10}}),getComputedStyle:node=>({transform:node.matrix}),DOMMatrixReadOnly:class{constructor(value){Object.assign(this,value);}}};
  vm.createContext(context);vm.runInContext(endpointSource,context);return{actors,parent,child,read:()=>context.endpointParent(child)};
}
test('a genuine clone endpoint keeps finite separation evidence across fresh work until actual envelopes separate',()=>{
  const h=setup();assert.equal(h.read(),h.parent);assert.equal(h.child.endpointOverlap.kind,'returning');
  h.child.clonePhase='working';h.child.serial++;assert.equal(h.read(),h.parent,'fresh activity cannot erase a still-overlapping physical endpoint');
  h.child.position={x:35,y:60};assert.equal(h.read(),null);assert.equal(h.child.endpointOverlap,null);
  h.child.position={x:30.5,y:60};assert.equal(h.read(),null,'after separation an ordinary family encounter cannot reacquire an exemption');
});
test('coincident working relatives without a real split/return never receive a blanket collision exemption',()=>{
  const h=setup();h.child.clonePhase='working';assert.equal(h.read(),null);assert.equal(h.child.endpointOverlap,undefined);
});
test('endpoint separation uses actual rendered fit scale and drops removed or not-yet-admitted owners',()=>{
  const h=setup();h.child.node.matrix.m11=h.parent.node.matrix.m11=.1;h.child.position.x=31.2;assert.equal(h.read(),null,'a future larger fit target does not invent an actual endpoint overlap');
  h.child.position.x=30;h.child.entryPending=true;assert.equal(h.read(),null,'an invisible newcomer has not acquired endpoint evidence');
  h.child.entryPending=false;assert.equal(h.read(),h.parent);h.actors.delete(h.parent.id);assert.equal(h.read(),null);assert.equal(h.child.endpointOverlap,null);
});
