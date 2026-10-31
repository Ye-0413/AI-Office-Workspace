'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js'),Rooms=require('../lib/room-designs.js');
const Walking=require('../lib/walking-layout.js'),Size=require('../lib/size-stability.js');
const scene=Rooms.createScene(Scene,'halloween'),walking=Walking.forScene(scene);
const task=(id,patch={})=>({id,provider:'codex',status:'active',activity:'coding',...patch});
const roots=count=>Array.from({length:count},(_,i)=>task('main-'+i));
const points=page=>new Map([...page.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
function audit(page,cast){
  assert.equal(page.uniformScale,page.effectiveScale);assert.equal(page.targetUniformScale,page.uniformScale);
  assert.ok(page.uniformScale>=page.minimumScale-1e-8);assert.ok(page.uniformScale<=page.manualScale+1e-8);
  assert.equal(page.seats.size+page.overflowIds.length,cast.length);
  for(const session of page.visible){
    const footprint=session.parentId?Size.ACTOR_FOOTPRINT.helper:Size.ACTOR_FOOTPRINT.root,p=page.seats.get(session.id);
    assert.equal(walking.legalPoint(p,{uniformScale:page.uniformScale,footprint,reservedRects:Scene.CLOCK_RESERVED}),true);
    for(const other of page.visible)if(other.id!==session.id)assert.equal(Scene.actorsOverlap(p,{uniformScale:page.uniformScale,footprint},page.seats.get(other.id),{uniformScale:page.uniformScale,footprint:other.parentId?Size.ACTOR_FOOTPRINT.helper:Size.ACTOR_FOOTPRINT.root},page.gap),false);
  }
}

test('four full-size mains retain the saved manual size and a fifth is admitted at its one-step ninety percent',()=>{
  const manual=1.35,small=roots(4),first=walking.layoutAdaptiveWalking(small,{requestedScale:manual});
  assert.equal(first.uniformScale,manual);assert.equal(first.sizingMainCount,4);assert.equal(first.scaleReduced,false);audit(first,small);
  const cast=roots(5),truth=JSON.stringify(cast),physical=walking.layoutAdaptiveWalking(cast,{requestedScale:manual,previousScale:first.uniformScale,previousSeats:first.seats,currentPositions:points(first)});
  assert.equal(physical.adaptiveNeedsReflow,true,'the current old route arrangement cannot become a permanent admission block');
  const next=physical.adaptiveReflowPage;
  assert.equal(next.requestedScale,manual);assert.equal(next.manualScale,manual);assert.equal(next.minimumScale,manual*.9);
  assert.equal(next.uniformScale,manual*.9);assert.equal(next.adaptiveTargetScale,manual*.9);assert.equal(next.sizingReason,'main-capacity');
  assert.equal(next.sizingMainCount,5);assert.equal(next.scaleReduced,true);assert.deepEqual(next.overflowIds,[]);audit(next,cast);
  assert.equal(JSON.stringify(cast),truth,'display capacity never changes observed sessions');
});

test('a repeated crowded snapshot cannot compound the saved size reduction or shrink beyond ninety percent',()=>{
  const cast=roots(6),manual=1.35,first=walking.layoutAdaptiveWalking(cast,{requestedScale:manual});
  assert.equal(first.uniformScale,manual*.9);assert.ok(first.overflowIds.length>0,'six mains still exceed the explicit one-step floor');audit(first,cast);
  const next=walking.layoutAdaptiveWalking(cast.toReversed().map(s=>({...s,title:'metadata refresh'})),{requestedScale:manual,previousScale:first.uniformScale,previousSeats:first.seats,currentPositions:points(first),residentIds:new Set(first.seats.keys())});
  assert.equal(next.adaptiveTargetScale,manual*.9);assert.equal(next.uniformScale,manual*.9);assert.equal(next.minimumScale,manual*.9);assert.equal(next.adaptiveNeedsReflow,false);audit(next,cast);
});

test('the same five measured mains fit the same capacity scale across real work activities',()=>{
  const activities=['coding','planning','reading','running','mixed'];
  for(const activity of activities){
    const cast=roots(5).map((s,i)=>({...s,activity:activity==='mixed'?['coding','planning','reading','running','testing'][i]:activity})),truth=JSON.stringify(cast);
    const page=walking.layoutAdaptiveWalking(cast,{requestedScale:1.35});
    assert.equal(page.adaptiveTargetScale,1.35*.9,activity);assert.equal(page.uniformScale,1.35*.9,activity);
    assert.deepEqual(page.overflowIds,[],activity+' cannot lose a station solely because its anchor differs');audit(page,cast);
    for(const session of cast)assert.equal(page.seats.get(session.id).workZone,Scene.activitySpec(session).zone,'capacity probing never changes the real work zone');
    assert.equal(JSON.stringify(cast),truth,'neutral probes cannot rewrite observed activity');
  }
});

test('helpers retain their real relative size without independently reducing the mains',()=>{
  const manual=1.35,cast=roots(4).concat(Array.from({length:3},(_,i)=>task('helper-'+i,{parentId:'main-0'})));
  const page=walking.layoutAdaptiveWalking(cast,{requestedScale:manual});
  assert.equal(page.sizingMainCount,4);assert.equal(page.adaptiveTargetScale,manual);assert.equal(page.uniformScale,manual);assert.equal(page.sizingReason,'manual-size');
  assert.ok(page.overflowIds.length>0,'the full actual cast still needs legal separate destinations');audit(page,cast);
  const parent=task('root'),helper=task('helper',{parentId:'root'}),small=walking.layoutAdaptiveWalking([parent,helper],{requestedScale:manual});
  assert.deepEqual(small.overflowIds,[]);assert.equal(small.seats.get('helper').helper,true);assert.equal(Size.bodyRatio(helper),.8);audit(small,[parent,helper]);
});

test('the effective ninety percent floor may be below the manual slider minimum without changing that preference',()=>{
  const cast=roots(16),manual=.65,page=walking.layoutAdaptiveWalking(cast,{requestedScale:manual});
  assert.equal(page.manualScale,.65);assert.equal(page.requestedScale,.65);assert.equal(page.minimumScale,manual*.9);
  assert.equal(page.uniformScale,manual*.9);assert.ok(page.uniformScale<.65);assert.deepEqual(page.overflowIds,[]);audit(page,cast);
  const unchanged=walking.layoutFullSizeWalking(roots(1),{requestedScale:.585});
  assert.equal(unchanged.requestedScale,.65,'direct manual requests retain the supported slider clamp');
});

test('capacity restores the manual target when mains leave and keeps an unsafe current enlargement pending',()=>{
  const manual=1.35,first=walking.layoutAdaptiveWalking(roots(5),{requestedScale:manual}),remaining=roots(4);
  const selected=walking.layoutAdaptiveWalking(remaining,{requestedScale:manual,previousScale:first.uniformScale,previousSeats:first.seats,currentPositions:points(first)});
  assert.equal(selected.adaptiveTargetScale,manual);assert.equal(selected.sizingReason,'manual-size');
  assert.equal(selected.uniformScale,manual*.9);assert.equal(selected.pendingScale,manual);assert.equal(selected.layoutDeferred,true,'physical edge feet cannot be enlarged without a new safe journey');
  assert.equal(selected.adaptiveNeedsReflow,true);assert.equal(selected.adaptiveReflowPage.uniformScale,manual);assert.deepEqual(selected.adaptiveReflowPage.overflowIds,[]);
  const readmitted=walking.layoutAdaptiveWalking(remaining,{requestedScale:manual});
  assert.equal(readmitted.uniformScale,manual);assert.equal(readmitted.scaleReduced,false);assert.deepEqual(readmitted.overflowIds,[]);audit(readmitted,remaining);
});
