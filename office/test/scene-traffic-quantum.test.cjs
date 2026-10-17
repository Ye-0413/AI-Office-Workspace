'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js'),Traffic=require('../lib/scene-traffic.js');
function setup(extra={}){
  const bodies=[['A',60,72],['B',81,45],['C',30,46],['D',87,78]].map(([id,x,y])=>({id,position:{x,y},helper:false,scale:1}));
  // A valid anisotropic metric makes the harmless B candidate precede the
  // actual doorway blocker A, so a restarted first-candidate loop cannot pass.
  const traffic=Traffic.createCoordinator({yieldBatchSize:1,gap:Scene.ACTOR_GAP,reservedRects:Scene.CLOCK_RESERVED,
    legalPoint:(p,a)=>Scene.legalActorPoint(p,{...a,reservedRects:Scene.CLOCK_RESERVED}),distance:(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)*.1,...extra});
  traffic.sync(bodies);traffic.request('D',{x:28,y:80});return{traffic,bodies};
}
test('one cooperative candidate per turn resumes after a harmless moving revision and finds a later real yielder',()=>{
  const {traffic,bodies}=setup();assert.deepEqual(traffic.nextAny(),{kind:'wait',reason:'searching'});
  assert.equal(traffic.state().activeMoves.length,0,'unfinished search never authorizes a body move');
  bodies[2].position.y+=.001;traffic.sync(bodies);
  const result=traffic.nextAny();assert.equal(result.kind,'move');assert.equal(result.id,'A');assert.equal(result.yielding,true);assert.equal(result.temporary,true);
  for(let leg=1;leg<result.path.length;leg++)for(let step=0;step<=100;step++){
    const a=result.path[leg-1],b=result.path[leg],p={x:a.x+(b.x-a.x)*step/100,y:a.y+(b.y-a.y)*step/100};
    for(const other of bodies)if(other.id!==result.id)assert.equal(Scene.actorsOverlap(p,bodies[0],other.position,other,Scene.ACTOR_GAP-.01),false);
  }
});
test('the candidate quantum is shared across requests, with a fair request cursor rather than one candidate per request',()=>{
  const calls=new Map(),{traffic,bodies}=setup({route:(a,b,actor)=>{calls.set(actor.id,(calls.get(actor.id)||0)+1);return Scene.route(a,b,actor);}});
  bodies[3].staged=true;bodies.push({...bodies[3],id:'E',position:{...bodies[3].position}});traffic.sync(bodies);traffic.request('E',{x:28,y:80});
  assert.equal(traffic.nextAny().reason,'searching');assert.equal(calls.get('D'),2);assert.equal(calls.get('E'),1,'only D tests a cooperative candidate in this turn');
  calls.clear();assert.equal(traffic.nextAny().reason,'searching');assert.equal(calls.get('D'),1);assert.equal(calls.get('E'),2,'the next turn grants E its candidate before resuming D');
  const move=traffic.nextAny();assert.equal(move.kind,'move');assert.equal(move.id,'A');
});
test('new/removed candidates and cancellation cannot leak an old cooperative search into a fresh route',()=>{
  const {traffic,bodies}=setup();assert.equal(traffic.nextAny().reason,'searching');
  traffic.cancel('D',bodies[3].position);assert.equal(traffic.nextAny().kind,'idle');
  bodies.splice(1,1);traffic.sync(bodies);traffic.request('D',{x:28,y:80});const next=traffic.nextAny();
  assert.equal(next.kind,'move');assert.equal(next.id,'A','removing an earlier candidate does not skip or invent the real remaining yielder');
  traffic.clear();assert.equal(traffic.nextAny().kind,'idle');assert.equal(traffic.state().activeMoves.length,0);
});
test('retargeting a pending search uses the new actual destination and never completes the cancelled route',()=>{
  const {traffic,bodies}=setup();assert.equal(traffic.nextAny().reason,'searching');
  traffic.request('D',bodies[3].position);const arrived=traffic.nextAny();
  assert.equal(arrived.kind,'arrived');assert.equal(arrived.id,'D');assert.deepEqual(arrived.target,bodies[3].position);assert.equal(traffic.state().queued,0);
});
test('a changing geometry pass cannot cache its mixed-version negative as a blocked final scene',()=>{
  const {traffic,bodies}=setup();bodies[0].canYield=false;traffic.sync(bodies);
  assert.equal(traffic.nextAny().reason,'searching');
  bodies[2].position.y+=.001;traffic.sync(bodies);
  assert.equal(traffic.nextAny().reason,'searching','a pass begun before the actual position revision needs a fresh finite pass');
  bodies[0].canYield=true;traffic.sync(bodies);
  let result;for(let i=0;i<5;i++){result=traffic.nextAny();if(result.kind==='move')break;assert.equal(result.reason,'searching');}
  assert.equal(result.kind,'move');assert.equal(result.id,'A','a newly eligible real candidate is included without waiting for another external snapshot');
});
test('multiple impossible cooperative requests exhaust each stable candidate pass and then sleep finitely',()=>{
  const {traffic,bodies}=setup();bodies[0].canYield=false;bodies[3].staged=true;bodies.push({...bodies[3],id:'E',position:{...bodies[3].position}});
  traffic.sync(bodies);traffic.request('E',{x:28,y:80});
  let result,turns=0;for(;turns<20;turns++){result=traffic.nextAny();if(result.reason!=='searching')break;}
  assert.deepEqual(result,{kind:'wait',reason:'blocked'},'a completed request proof must not be restarted just because another request still needs its turn');
  assert.ok(turns<8);assert.equal(traffic.state().activeMoves.length,0);
  bodies[0].canYield=true;traffic.sync(bodies);
  for(let index=0;index<8;index++){result=traffic.nextAny();if(result.kind==='move')break;}
  assert.equal(result.kind,'move');assert.equal(result.id,'A','a real changed eligibility revision invalidates both completed negatives');
});
