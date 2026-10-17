'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js'),Layout=require('../lib/walking-layout.js'),Traffic=require('../lib/scene-traffic.js');
const footprint={left:116,right:116,top:140,bottom:82};
const root={id:'codex:physical-root',provider:'codex',status:'active',activity:'coding'},clone={id:'codex:physical-clone',provider:'codex',parentId:root.id,status:'active',activity:'planning'};
function verify(path,geometry){
  for(let i=1;i<path.length;i++)for(let step=0;step<=100;step++){
    const a=path[i-1],b=path[i],p={x:a.x+(b.x-a.x)*step/100,y:a.y+(b.y-a.y)*step/100};
    assert.equal(Layout.legalPoint(p,geometry),true,'a real full-envelope leg must remain in the viewport and out of clock/furniture');
    for(const obstacle of Scene.OBSTACLES)assert.equal(Scene.segmentHitsRect(a,b,obstacle,.79),false);
  }
}
test('real furniture layout and full-envelope traffic split, return, and resume a near-dock same-ID clone at every size preference',()=>{
  const facts=JSON.stringify([root,clone]);
  for(const requestedScale of [.65,1,1.35]){
    const footprints=new Map([[root.id,footprint],[clone.id,footprint]]),single=Layout.layoutWalking([root],{requestedScale,footprints});
    const rootPoint=single.seats.get(root.id),page=Layout.layoutWalking([root,clone],{requestedScale,footprints,previousSeats:single.seats,currentPositions:new Map([[root.id,rootPoint]])});
    const geometry={uniformScale:page.uniformScale,footprint,reservedRects:Scene.CLOCK_RESERVED},a={id:root.id,position:{x:rootPoint.x,y:rootPoint.y},...geometry},b={id:clone.id,position:{...a.position},...geometry,staged:true};
    const traffic=Traffic.createCoordinator({gap:Layout.gapForScale,maxConcurrent:4,reservedRects:Scene.CLOCK_RESERVED,legalPoint:Layout.legalPoint,route:Layout.route,holdingPoints:page.holdingPoints});
    // An observed child can change its main's future parking allocation. The
    // production entrance waits for this real main journey before charging a
    // split; do not hold the main forever at an obsolete single-body station.
    traffic.sync([a]);traffic.request(a.id,page.seats.get(a.id));const reposition=traffic.nextAny();
    assert.ok(['move','arrived'].includes(reposition.kind),'the main must physically reach its new dock before splitting');
    verify(reposition.path||[a.position],geometry);
    if(reposition.kind==='move'){a.position={...reposition.target};assert.equal(traffic.finish(a.id,reposition.token,a.position),true);}
    b.position={...a.position};
    traffic.sync([a,b]);assert.equal(traffic.request(b.id,page.seats.get(b.id),{overlapIds:[a.id]}),true);const split=traffic.nextAny();assert.equal(split.kind,'move');assert.deepEqual(split.path[0],a.position);verify(split.path,geometry);
    b.position={...split.target};b.staged=false;assert.equal(traffic.finish(b.id,split.token,b.position),true);
    traffic.sync([a,b]);traffic.request(b.id,a.position,{overlapIds:[a.id]});const back=traffic.nextAny();assert.equal(back.kind,'move');verify(back.path,geometry);
    const previous=back.path.at(-2),near={x:a.position.x+(previous.x-a.position.x)*.015,y:a.position.y+(previous.y-a.position.y)*.015};
    assert.equal(Scene.actorsOverlap(near,geometry,a.position,geometry,page.gap),true,'fixture must cancel inside the actual root docking envelope');
    traffic.cancel(b.id,near);b.position=near;
    const resumed=Layout.layoutWalking([root,clone],{requestedScale,footprints,previousSeats:page.seats,currentPositions:new Map([[a.id,a.position],[b.id,near]]),allowedOverlaps:new Set([JSON.stringify([a.id,b.id].sort())])});
    assert.equal(resumed.visible.length,2);assert.deepEqual(b.position,near,'planning a fresh real activity cannot move its existing physical body');
    a.uniformScale=b.uniformScale=resumed.uniformScale;traffic.sync([a,b]);traffic.request(b.id,resumed.seats.get(b.id),{overlapIds:[a.id]});const again=traffic.nextAny();assert.equal(again.kind,'move');assert.deepEqual(again.path[0],near);verify(again.path,{...geometry,uniformScale:resumed.uniformScale});
  }
  assert.equal(JSON.stringify([root,clone]),facts,'visual lifecycle proof must not change real session facts');
});
