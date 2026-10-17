'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js');
const Traffic=require('../lib/scene-traffic.js');
const footprint={left:35,right:35,top:45,bottom:25};
const actor=(id,x,y,extra={})=>({id,position:{x,y},uniformScale:1,footprint,...extra});
const make=(extra={})=>Traffic.createCoordinator({maxConcurrent:4,bounds:Scene.actorBounds,legalPoint:()=>true,route:(a,b)=>[a,b],obstacles:[],gap:12,...extra});
function points(path,count=41){const out=[];for(let i=1;i<path.length;i++)for(let t=0;t<count;t++)out.push({x:path[i-1].x+(path[i].x-path[i-1].x)*t/(count-1),y:path[i-1].y+(path[i].y-path[i-1].y)*t/(count-1)});return out;}
function independentClocks(first,second,a,b){for(const p of points(first.path))for(const q of points(second.path))assert.equal(Scene.actorsOverlap(p,a,q,b,11.99),false,'two independently timed full nameplate envelopes may not share a reserved corridor');}
test('separate real paths reserve concurrently without assuming synchronized animation clocks',()=>{
  const traffic=make(),a=actor('a',15,40),b=actor('b',15,80);
  traffic.sync([a,b]);traffic.request(a.id,{x:85,y:40});traffic.request(b.id,{x:85,y:80});
  const first=traffic.nextAny(),second=traffic.nextAny();
  assert.equal(first.kind,'move');assert.equal(second.kind,'move');assert.equal(traffic.state().activeMoves.length,2);
  independentClocks(first,second,a,b);
  assert.equal(traffic.finish(first.id,first.token+1,first.target),false);
  assert.equal(traffic.state().activeMoves.length,2);
  assert.equal(traffic.finish(second.id,second.token,second.target),true);
  assert.equal(traffic.state().active.id,first.id);
});
test('a crossing route avoids the other walker entire remaining corridor, including future positions',()=>{
  const traffic=make(),a=actor('a',10,50),b=actor('b',50,15);
  traffic.sync([a,b]);traffic.request(a.id,{x:90,y:50});
  const first=traffic.nextAny();assert.equal(first.kind,'move');
  traffic.request(b.id,{x:50,y:90});const second=traffic.nextAny();
  if(second.kind==='move')independentClocks(first,second,a,b);
  else assert.equal(second.reason,'reserved');
  assert.equal(traffic.finish(first.id,first.token,first.target),true);
  const after=second.kind==='move'?null:traffic.nextAny();
  if(after)assert.equal(after.kind,'move');
});
test('the actual foot releases a completed portal prefix while retaining all future corridor protection',()=>{
  const traffic=make(),a=actor('a',15,65),b=actor('b',15,65,{staged:true});
  traffic.sync([a,b]);traffic.request(a.id,{x:85,y:65});const first=traffic.nextAny();
  assert.equal(first.kind,'move');
  traffic.request(b.id,{x:20,y:85});
  const blocked=traffic.nextAny();assert.equal(blocked.kind,'wait');
  a.position={x:45,y:65};traffic.sync([a,b]);const next=traffic.nextAny();
  assert.equal(next.kind,'move');assert.equal(next.id,b.id);
  independentClocks({path:[a.position,first.target]},next,a,b);
  traffic.cancel(a.id,a.position);assert.equal(traffic.state().activeMoves.length,1);
  assert.equal(traffic.finish(a.id,first.token,first.target),false,'an obsolete completion cannot remove another actor reservation');
  assert.equal(traffic.finish(b.id,next.token,next.target),true);
});
test('clone parent coincidence never exempts an unrelated moving corridor',()=>{
  const traffic=make(),parent=actor('root',15,80),clone=actor('clone',15,80,{staged:true}),other=actor('other',45,40);
  traffic.sync([parent,clone,other]);traffic.request(other.id,{x:80,y:40});const moving=traffic.nextAny();
  traffic.request(clone.id,{x:80,y:80},{overlapIds:[parent.id]});const split=traffic.nextAny();
  assert.equal(split.kind,'move');independentClocks(moving,split,other,clone);
});
test('a proven furniture-side holding pocket is preferred over an unrelated legacy grid point when stations swap',()=>{
  const pocket={x:50,y:43.5},traffic=make({holdingPoints:()=>[pocket]}),a=actor('a',15,75),b=actor('b',85,75);
  traffic.sync([a,b]);traffic.request(a.id,b.position);traffic.request(b.id,a.position);
  const first=traffic.nextAny();assert.equal(first.kind,'move');assert.equal(first.temporary,true);assert.deepEqual(first.target,pocket);
});
