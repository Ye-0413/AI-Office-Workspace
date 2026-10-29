'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Scene=require('../lib/scene-model.js'),Walking=require('../lib/walking-layout.js'),Size=require('../lib/size-stability.js'),Traffic=require('../lib/scene-traffic.js');
const task=(id,patch={})=>({id,provider:'codex',status:'active',activity:'coding',...patch});
const roots=count=>Array.from({length:count},(_,i)=>task('root-'+i));
const positions=page=>new Map([...page.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
function audit(page,cast,scale){
  assert.equal(page.uniformScale,scale);assert.equal(page.targetUniformScale,scale);assert.equal(page.requestedScale,scale);
  assert.equal(page.seats.size,cast.length);assert.equal(page.visible.length,cast.length);assert.equal(page.hidden,0);assert.deepEqual(page.overflowIds,[]);
  for(const session of cast){
    const p=page.seats.get(session.id),footprint=session.parentId?Size.ACTOR_FOOTPRINT.helper:Size.ACTOR_FOOTPRINT.root;
    assert.equal(p.uniformScale,scale);assert.equal(p.targetUniformScale,scale);
    assert.equal(Scene.legalActorPoint(p,{uniformScale:scale,footprint,layoutMode:'walking',reservedRects:Scene.CLOCK_RESERVED}),true);
    for(const other of cast)if(other.id!==session.id)assert.equal(Scene.actorsOverlap(p,{uniformScale:scale,footprint},page.seats.get(other.id),{uniformScale:scale,footprint:other.parentId?Size.ACTOR_FOOTPRINT.helper:Size.ACTOR_FOOTPRINT.root},page.gap),false,session.id+' / '+other.id);
  }
}

test('strict whole-cast layout uses the current complete large envelopes without changing a requested size',()=>{
  const cast=[...roots(2),task('helper',{parentId:'root-0'}),task('nested',{parentId:'helper'})],truth=JSON.stringify(cast);
  const page=Walking.layoutFullSizeWalking(cast,{requestedScale:1,maximumScale:.4});audit(page,cast,1);
  assert.equal(JSON.stringify(cast),truth);assert.equal(page.rootIdsBySession.get('nested'),'root-0');
  assert.equal(page.readability.nameplatePixels,264);
  const larger=Walking.layoutFullSizeWalking(cast.slice(0,2),{requestedScale:1.1,maximumScale:.4});audit(larger,cast.slice(0,2),1.1);
});

test('strict spill uses real open floor instead of shrinking six observed mains or reserving a fictional seventh',()=>{
  const cast=roots(6),page=Walking.layoutFullSizeWalking(cast,{requestedScale:1});audit(page,cast,1);
  assert.equal(page.gap,2);assert.equal(page.holdingPoints.length,0);assert.ok([...page.seats.values()].some(p=>p.area==='open-floor'));
  assert.equal(page.proofMode,'scheduled');assert.ok(page.scheduledProof.entry.moves.length>=cast.length);
});

test('metadata, enumeration order and an ordinary repeated snapshot preserve existing work stations',()=>{
  const cast=roots(4),first=Walking.layoutFullSizeWalking(cast,{requestedScale:1}),before=positions(first);
  const next=Walking.layoutFullSizeWalking(cast.toReversed().map(s=>({...s,title:'Changed metadata',lastEventAt:9999})),{requestedScale:1,previousSeats:first.seats,currentPositions:before});
  audit(next,cast,1);assert.deepEqual(positions(next),before);
  assert.deepEqual([...before], [...positions(first)],'a proof cannot rewrite the supplied real feet');
});

test('real overlapping departure sources can separate into safe stations at the same fixed scale',()=>{
  const cast=roots(2),first=Walking.layoutFullSizeWalking(cast,{requestedScale:1}),a=first.seats.get('root-0');
  const actual=new Map(cast.map(s=>[s.id,{x:a.x,y:a.y}])),truth=JSON.stringify([...actual]);
  const next=Walking.layoutFullSizeWalking(cast,{requestedScale:1,previousSeats:first.seats,currentPositions:actual});
  audit(next,cast,1);assert.equal(JSON.stringify([...actual]),truth);
  for(const move of next.transitionProof?.moves||[])assert.deepEqual(move.path[0],actual.get(move.id));
});

test('strict failure reports the complete cast and never substitutes smaller bodies or a partial page',()=>{
  const cast=roots(3),truth=JSON.stringify(cast),footprints=new Map(cast.map(s=>[s.id,{left:1500,right:1500,top:1500,bottom:1500}]));
  assert.throws(()=>Walking.layoutFullSizeWalking(cast,{requestedScale:1.35,footprints}),error=>error instanceof RangeError&&error.code==='FIXED_SIZE_CAPACITY'&&error.requestedScale===1.35&&error.actorIds.length===cast.length);
  assert.equal(JSON.stringify(cast),truth);
});

test('capacity defense keeps every resident seat and admits new observations only at the unchanged fixed size',()=>{
  const cast=roots(10),first=Walking.layoutFullSizeWalking(cast.slice(0,2),{requestedScale:1}),before=positions(first);
  const page=Walking.layoutFixedWalking(cast,{fullSize:true,requestedScale:1,previousScale:1,previousSeats:first.seats,currentPositions:before,residentIds:new Set(before.keys())});
  assert.equal(page.uniformScale,1);assert.equal(page.targetUniformScale,1);assert.equal(page.seats.size+page.overflowIds.length,cast.length);
  for(const [id,p]of before)assert.deepEqual({x:page.seats.get(id).x,y:page.seats.get(id).y},p);
  assert.ok(page.overflowIds.length>0);audit({...page,hidden:0,overflowIds:[]},page.visible,1);
  assert.ok(page.overflowIds.every(id=>!page.seats.has(id)));
});

test('an unprovable larger manual request holds all existing physical bodies without claiming a new fit',()=>{
  const cast=roots(6),first=Walking.layoutFullSizeWalking(cast,{requestedScale:1}),before=positions(first);
  const page=Walking.layoutFixedWalking(cast,{fullSize:true,requestedScale:1.35,previousScale:1,previousSeats:first.seats,currentPositions:before,residentIds:new Set(before.keys())});
  assert.equal(page.seats.size,cast.length);assert.equal(page.visible.length,cast.length);assert.deepEqual(page.overflowIds,[]);
  assert.equal(page.uniformScale,1);assert.equal(page.targetUniformScale,1);assert.equal(page.pendingScale,1.35);
  assert.equal(page.layoutFits,false);assert.equal(page.layoutDeferred,true);assert.deepEqual(positions(page),before);
});

test('browser load order resolves current Size metrics lazily instead of capturing the legacy visitor geometry',()=>{
  const context={OfficeScene:Scene,OfficeSceneTraffic:Traffic};vm.runInNewContext(fs.readFileSync(require.resolve('../lib/walking-layout.js'),'utf8'),context);
  context.OfficeSizeStability=Size;
  const page=context.OfficeWalkingLayout.layoutFullSizeWalking(roots(1),{requestedScale:1});
  assert.equal(page.envelope.top,Size.ACTOR_FOOTPRINT.root.top);assert.equal(page.envelope.bottom,Size.ACTOR_FOOTPRINT.root.bottom);
  assert.notEqual(page.envelope.top,Scene.ACTOR_FOOTPRINT.root.top);
});
