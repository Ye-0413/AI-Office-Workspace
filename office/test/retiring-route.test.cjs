'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js'),Rooms=require('../lib/room-designs.js');
const Walking=require('../lib/walking-layout.js'),Size=require('../lib/size-stability.js');
const task=id=>({id,provider:'codex',activity:'planning',status:'active'});
const point=p=>({x:p.x,y:p.y});
function audit(walking,result,start,footprint,scale,reservedRects=Scene.CLOCK_RESERVED,viewport=Scene.ACTOR_VIEWPORT){
  assert.ok(result);assert.equal(result.uniformScale,scale);assert.deepEqual(result.path[0],start);
  assert.deepEqual(result.path.at(-1),result.entryPoint);
  const actor={uniformScale:scale,footprint,reservedRects,viewport};
  for(const p of result.path)assert.equal(walking.legalPoint(p,actor),true,'complete body and nameplate remain inside the viewport');
  for(let i=1;i<result.path.length;i++){
    const a=result.path[i-1],b=result.path[i];
    assert.equal(walking.OBSTACLES.some(r=>Scene.segmentHitsRect(a,b,r,.8)),false,'feet do not cross furniture');
    for(const r of reservedRects)assert.equal(Scene.segmentHitsRect({x:a.x*12.8,y:a.y*7.2},{x:b.x*12.8,y:b.y*7.2},{x1:r.left-footprint.right*scale-4,x2:r.right+footprint.left*scale+4,y1:r.top-footprint.bottom*scale-4,y2:r.bottom+footprint.top*scale+4},0),false,'complete envelope does not cross the clock');
  }
}

test('retired mains can leave a full Halloween room before new work stations fit',()=>{
  const walking=Walking.forScene(Rooms.createScene(Scene,'halloween'));
  const cast=[task('old-0'),task('old-1')],scale=1.35,footprint={left:138,right:138,top:150,bottom:106};
  const old=cast.map(s=>({...s,status:'closed',closed:true})),newWork=Array.from({length:3},(_,i)=>task('new-'+i));
  // This is the measured full label from the reported failure. Keep the
  // retirement regression even when ordinary labels become more compact.
  const footprints=new Map(cast.concat(newWork).map(s=>[s.id,footprint]));
  const first=walking.layoutFullSizeWalking(cast,{requestedScale:scale,footprints});
  assert.throws(()=>walking.layoutFullSizeWalking(old.concat(newWork),{requestedScale:scale,footprints}),error=>error.code==='FIXED_SIZE_CAPACITY');
  const before=JSON.stringify([...first.seats]),journeys=old.map(s=>walking.retiringRoute(point(first.seats.get(s.id)),{uniformScale:scale,footprint,entryPoint:first.entryPoint}));
  for(let i=0;i<old.length;i++)audit(walking,journeys[i],point(first.seats.get(old[i].id)),footprint,scale);
  assert.deepEqual(journeys[0].entryPoint,journeys[1].entryPoint,'finite exits share a doorway and do not reserve two permanent destinations');
  assert.equal(JSON.stringify([...first.seats]),before,'a route does not remove physical bodies or alter observed sessions');
  const restored=walking.layoutFullSizeWalking(newWork,{requestedScale:scale,footprints});
  assert.equal(restored.uniformScale,scale);assert.equal(restored.seats.size,3);assert.deepEqual(restored.overflowIds,[]);
});

test('retiring routes preserve a valid current portal and revalidate exact arrivals',()=>{
  const footprint=Size.ACTOR_FOOTPRINT.root,scale=1;
  const page=Walking.layoutFullSizeWalking([task('old')],{requestedScale:scale}),start=point(page.seats.get('old'));
  const result=Walking.retiringRoute(start,{uniformScale:scale,footprint,entryPoint:page.entryPoint});
  audit(Walking,result,start,footprint,scale);assert.deepEqual(result.entryPoint,page.entryPoint);
  const arrived=Walking.retiringRoute(result.entryPoint,{uniformScale:scale,footprint,entryPoint:result.entryPoint});
  audit(Walking,arrived,result.entryPoint,footprint,scale);assert.ok(arrived.path.every(p=>p.x===result.entryPoint.x&&p.y===result.entryPoint.y));
});

test('retiring routes use physical scale and measured bounds to replace a clipped doorway',()=>{
  const walking=Walking.forScene(Rooms.createScene(Scene,'halloween')),scale=1.35,footprint={left:140,right:145,top:152,bottom:110};
  const start={x:45,y:60},invalid=walking.ENTRY_POINT;
  assert.equal(walking.legalPoint(invalid,{uniformScale:scale,footprint}),false);
  const result=walking.retiringRoute(start,{uniformScale:scale,requestedScale:.65,footprint,entryPoint:invalid});
  audit(walking,result,start,footprint,scale);assert.notDeepEqual(result.entryPoint,invalid);
  const viewport={left:24,top:80,right:1250,bottom:640};
  audit(walking,walking.retiringRoute(start,{uniformScale:scale,footprint,viewport}),start,footprint,scale,Scene.CLOCK_RESERVED,viewport);
});

test('invalid feet and impossible envelopes cannot invent an exit journey',()=>{
  const walking=Walking.forScene(Rooms.createScene(Scene,'halloween'));
  assert.equal(walking.retiringRoute(null),null);
  assert.equal(walking.retiringRoute({x:50,y:42},{uniformScale:1,footprint:Size.ACTOR_FOOTPRINT.root}),null,'feet inside the bench are invalid');
  assert.equal(walking.retiringRoute({x:50,y:60},{uniformScale:1.35,footprint:{left:1500,right:1500,top:1500,bottom:1500}}),null);
});
