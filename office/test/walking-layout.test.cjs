'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js');
const Walking=require('../lib/walking-layout.js');
const Traffic=require('../lib/scene-traffic.js');
const task=(id,activity='coding',patch={})=>({id,sessionId:id,provider:'codex',status:'active',activity,...patch});
const mixed=n=>Array.from({length:n},(_,i)=>task('agent-'+String(i).padStart(3,'0'),['reading','planning','coding','testing','idle','unknown'][i%6]));
const pixel=p=>({x:p.x*12.8,y:p.y*7.2});

// Independent physical invariant: the moving rectangle's feet must never
// enter the Minkowski sum of another fully stopped body/nameplate and itself.
function auditPath(path,mover,scale,gap,parked,footprints){
  assert.ok(path.length>=2);
  for(const p of path)assert.equal(Walking.legalPoint(p,{uniformScale:scale,footprint:mover}),true,JSON.stringify(p));
  for(let i=1;i<path.length;i++){
    const a=pixel(path[i-1]),b=pixel(path[i]);
    for(const r of Scene.OBSTACLES)assert.equal(Scene.segmentHitsRect(path[i-1],path[i],r,.8),false,'feet cross furniture');
    for(const [,point]of parked){
      const bounds=Scene.actorBounds(point,{uniformScale:scale,footprint:footprints.get(point.ownerId)||Scene.ACTOR_FOOTPRINT.root});
      const forbidden={x1:bounds.left-mover.right*scale-gap,x2:bounds.right+mover.left*scale+gap,y1:bounds.top-mover.bottom*scale-gap,y2:bounds.bottom+mover.top*scale+gap};
      assert.equal(Scene.segmentHitsRect(a,b,forbidden,0),false,'a route intersects another complete actor envelope');
    }
    for(const r of Scene.CLOCK_RESERVED){
      const forbidden={x1:r.left-mover.right*scale-4,x2:r.right+mover.left*scale+4,y1:r.top-mover.bottom*scale-4,y2:r.bottom+mover.top*scale+4};
      assert.equal(Scene.segmentHitsRect(a,b,forbidden,0),false,'the moving visual envelope covers the clock');
    }
  }
}
function footprintFor(id,input,footprints){return footprints.get(id)||(input.find(s=>s.id===id)?.parentId?Scene.ACTOR_FOOTPRINT.helper:Scene.ACTOR_FOOTPRINT.root);}
function auditCoordinated(page,input,footprints){
  const proof=page.coordinatedProof;
  assert.ok(proof&&proof.schedules instanceof Map);
  assert.equal(proof.schedules.size,input.length);
  assert.ok(page.proofTrials<=16,'complete navigation trials have a fixed budget');
  const initial=()=>new Map([...page.seats].map(([id,p])=>[id,{x:p.x,y:p.y,ownerId:id}]));
  const sizes=new Map(input.map(s=>[s.id,footprintFor(s.id,input,footprints)]));
  const run=(moves,positions,staged=new Set())=>{
    assert.ok(moves.length<=input.length*4+8,'each actual arrival/exit is bounded');
    for(const move of moves){
      assert.ok(positions.has(move.id));
      assert.deepEqual(move.path[0],{x:positions.get(move.id).x,y:positions.get(move.id).y});
      const parked=new Map([...positions].filter(([id])=>id!==move.id&&!staged.has(id)));
      auditPath(move.path,sizes.get(move.id),page.uniformScale,page.gap,parked,sizes);
      staged.delete(move.id);
      positions.set(move.id,{...move.target,ownerId:move.id});
    }
  };
  for(const [id,schedule]of proof.schedules){
    const positions=initial();
    run(schedule.exit,positions);
    assert.deepEqual({x:positions.get(id).x,y:positions.get(id).y},Walking.ENTRY_POINT);
    for(const [other,p]of positions)if(other!==id)assert.deepEqual(p,initial().get(other),'a helper making room returns to its original work station');
    run(schedule.enter,positions,new Set([id]));
    assert.deepEqual(positions,initial(),'arrival and all actual yielding bodies finish at their own complete safe seats');
  }
  const holding=initial();holding.set(proof.holdingActorId,{...Walking.ENTRY_POINT,ownerId:proof.holdingActorId});sizes.set(proof.holdingActorId,page.envelope);
  run(proof.holdingMoves,holding,new Set([proof.holdingActorId]));
  assert.deepEqual(holding.get(proof.holdingActorId),{...proof.holdingPoint,ownerId:proof.holdingActorId});
  holding.delete(proof.holdingActorId);assert.deepEqual(holding,initial(),'the unassigned holding pocket remains actually reachable and existing workers return');
}
function audit(page,input,footprints=new Map()){
  assert.equal(page.visible.length,input.length);assert.equal(page.seats.size,input.length);assert.equal(page.pathsById.size,input.length);
  assert.equal(page.pages,1);assert.equal(page.hidden,0);assert.equal(page.helperOverflow,0);assert.equal(page.layoutMode,'walking');
  const parked=new Map([...page.seats].map(([id,p])=>[id,{...p,ownerId:id}]));
  for(const [id,p]of page.seats){
    assert.equal(Walking.legalPoint(p,{uniformScale:page.uniformScale,footprint:footprintFor(id,input,footprints)}),true,id);
    if(p.fixedStale)assert.equal(Scene.activitySpec(input.find(s=>s.id===id)).stale,true,'only a real stale observation can reserve its last actual corridor point');
    else if(!p.fixedHolding)assert.ok(Walking.ZONE_AREAS[p.workZone].some(a=>p.x>=a.x1-1e-6&&p.x<=a.x2+1e-6&&p.y>=a.y1-1e-6&&p.y<=a.y2+1e-6),id+' must remain on its own furniture side');
    for(const [other,q]of page.seats)if(other!==id)assert.equal(Scene.actorsOverlap(p,{uniformScale:page.uniformScale,footprint:footprintFor(id,input,footprints)},q,{uniformScale:page.uniformScale,footprint:footprintFor(other,input,footprints)},page.gap),false);
    for(const holding of page.holdingPoints)assert.equal(Scene.actorsOverlap(p,{uniformScale:page.uniformScale,footprint:footprintFor(id,input,footprints)},holding,{uniformScale:page.uniformScale,footprint:page.envelope},page.gap),false,'the holding pocket is genuinely empty');
    if(page.proofMode==='cooperative')continue;
    const others=new Map(parked);others.delete(id);for(let i=0;i<page.holdingPoints.length;i++)others.set('holding-'+i,{...page.holdingPoints[i],ownerId:'holding-'+i});
    const sizes=new Map(footprints);for(let i=0;i<page.holdingPoints.length;i++)sizes.set('holding-'+i,page.envelope);
    const path=page.pathsById.get(id);assert.deepEqual(path[0],Walking.ENTRY_POINT);assert.equal(path.at(-1).x,p.x);assert.equal(path.at(-1).y,p.y);
    auditPath(path,footprintFor(id,input,footprints),page.uniformScale,page.gap,others,sizes);
  }
  if(page.proofMode==='cooperative')auditCoordinated(page,input,footprints);
  else for(let i=0;i<page.holdingPoints.length;i++)auditPath(page.holdingPaths[i],page.envelope,page.uniformScale,page.gap,parked,footprints);
}

function auditTransition(page,input,footprints,current,immovableIds=new Set()){
  const proof=page.transitionProof;
  assert.ok(proof&&Array.isArray(proof.moves),'a changed cast needs an executable old-to-new proof');
  const sizes=new Map(input.map(s=>[s.id,footprintFor(s.id,input,footprints)]));
  const positions=new Map(input.map(s=>{const p=current.get(s.id);return[s.id,{...(p||Walking.ENTRY_POINT),ownerId:s.id}];}));
  const staged=new Set(input.filter(s=>!current.has(s.id)).map(s=>s.id));
  assert.ok(proof.moves.length<=input.length*8+16);
  for(const [id,p]of current)if(positions.has(id))assert.deepEqual(proof.initialPositions.get(id),{x:p.x,y:p.y},'the proof starts at actual feet, never a previous target');
  for(const move of proof.moves){
    const from=positions.get(move.id);assert.deepEqual(move.path[0],{x:from.x,y:from.y});
    assert.ok(!move.yielding||!immovableIds.has(move.id),'protected lifecycle bodies cannot be invented as yielders');
    const parked=new Map([...positions].filter(([id])=>id!==move.id&&!staged.has(id)));
    auditPath(move.path,sizes.get(move.id),proof.scale,Walking.gapForScale(proof.scale),parked,sizes);
    positions.set(move.id,{...move.target,ownerId:move.id});staged.delete(move.id);
  }
  assert.equal(staged.size,0);
  for(const [id,target]of page.seats)assert.ok(Math.abs(positions.get(id).x-target.x)<.001&&Math.abs(positions.get(id).y-target.y)<.001,'every real request and temporary yielder reaches its final target within the physical arrival threshold');
}

function auditReturn(page,input,footprints,current){
  const proof=page.returnProof;assert.ok(proof&&proof.moves.length,'a real dock needs a complete return from current feet');
  assert.equal(proof.scale,page.uniformScale);assert.ok(proof.trials<=18,'return-scale search is bounded');
  const sizes=new Map(input.map(s=>[s.id,footprintFor(s.id,input,footprints)]));
  const positions=new Map([...current].filter(([id])=>page.seats.has(id)).map(([id,p])=>[id,{x:p.x,y:p.y,ownerId:id}]));
  assert.deepEqual(proof.target,{x:current.get(proof.parentId).x,y:current.get(proof.parentId).y},'the dock is the actual parent, not its future work seat');
  for(const move of proof.moves){
    assert.notEqual(move.id,proof.parentId,'a real dock parent stays physically locked');
    assert.deepEqual(move.path[0],{x:positions.get(move.id).x,y:positions.get(move.id).y});
    for(let i=1;i<move.path.length;i++){
      const parked=new Map([...positions].filter(([id,p])=>id!==move.id&&!(move.id===proof.childId&&id===proof.parentId&&((i===1&&Scene.actorsOverlap(move.path[0],{uniformScale:proof.scale,footprint:sizes.get(move.id)},p,{uniformScale:proof.scale,footprint:sizes.get(id)},0))||i===move.path.length-1))));
      auditPath(move.path.slice(i-1,i+1),sizes.get(move.id),proof.scale,page.gap,parked,sizes);
    }
    positions.set(move.id,{...move.target,ownerId:move.id});
  }
  assert.deepEqual(positions.get(proof.parentId),{...current.get(proof.parentId),ownerId:proof.parentId});
  assert.deepEqual(positions.get(proof.childId),{...proof.target,ownerId:proof.childId});
}

function auditOpening(page,input,footprints,current){
  const proof=page.openingProof;assert.ok(proof&&proof.moves.length,'an observed-parent entrance has its own complete physical proof');
  assert.equal(proof.scale,page.uniformScale);assert.ok(proof.trials<=18);
  assert.deepEqual(proof.source,{x:current.get(proof.parentId).x,y:current.get(proof.parentId).y});
  const sizes=new Map(input.map(s=>[s.id,footprintFor(s.id,input,footprints)])),positions=new Map([...current].map(([id,p])=>[id,{x:p.x,y:p.y,ownerId:id}]));
  positions.set(proof.childId,{...proof.source,ownerId:proof.childId});
  assert.equal(Scene.actorsOverlap(proof.target,{uniformScale:proof.scale,footprint:sizes.get(proof.childId)},proof.source,{uniformScale:proof.scale,footprint:sizes.get(proof.parentId)},page.gap),false,'splitting never permits a normal target inside the actual parent');
  for(const move of proof.moves){
    assert.notEqual(move.id,proof.parentId);assert.deepEqual(move.path[0],{x:positions.get(move.id).x,y:positions.get(move.id).y});
    for(let i=1;i<move.path.length;i++){
      const parked=new Map([...positions].filter(([id])=>id!==move.id&&!(move.id===proof.childId&&id===proof.parentId&&i===1)));
      auditPath(move.path.slice(i-1,i+1),sizes.get(move.id),proof.scale,page.gap,parked,sizes);
    }
    positions.set(move.id,{...move.target,ownerId:move.id});
  }
  assert.deepEqual(positions.get(proof.parentId),{...proof.source,ownerId:proof.parentId});
  assert.deepEqual(positions.get(proof.childId),{...proof.target,ownerId:proof.childId});
}

test('thirteen measured bodies retain the twelve-worker scale while a real late child opens from its held parent',()=>{
  const twelve=mixed(12),parent=twelve[2],child=task('agent-012','planning',{parentId:parent.id}),input=twelve.concat(child);
  // Minimal synthetic reduction of the real English/Chinese capture: these
  // are full measured route envelopes, not painted-head approximations.
  const footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(twelve,{requestedScale:.65,footprints});
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
  current.get(parent.id).y=83.99999999999999;
  const immovableIds=new Set([parent.id]);
  const page=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:first.seats,currentPositions:current,immovableIds});
  assert.equal(page.uniformScale,.4);assert.equal(page.proofMode,'cooperative');
  audit(page,input,footprints);auditTransition(page,input,footprints,current,immovableIds);
  const opening=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:page.seats,currentPositions:current,immovableIds,openingDockPairs:new Map([[child.id,parent.id]])});
  assert.equal(opening.uniformScale,.4);auditOpening(opening,input,footprints,current);
  assert.deepEqual(opening.openingProof.source,current.get(parent.id));
});

for(const order of ['descending','interleaved'])test('the thirteen-body hint proves arbitrary '+order+' identities without moving a locked opening source',()=>{
  const twelve=mixed(12).map((s,i)=>({...s,id:'body-'+String(order==='descending'?12-i:i%2?12-i:i).padStart(2,'0')}));
  const parent=twelve[2],child=task('body-00-child','planning',{parentId:parent.id}),input=twelve.concat(child),footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(twelve,{requestedScale:.65,footprints}),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),immovableIds=new Set([parent.id]);
  const openingDockPairs=new Map([[child.id,parent.id]]),page=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:first.seats,currentPositions:current,immovableIds,openingDockPairs});
  assert.equal(page.uniformScale,.4);audit(page,input,footprints);auditTransition(page,input,footprints,current,immovableIds);
  assert.ok(!page.transitionProof.moves.some(m=>m.id===parent.id),'a source already at its dock does not move');
  if(page.openingProof)auditOpening(page,input,footprints,current);
  else assert.equal(page.openingDeferred,true,'an occupied new child target waits for the real workers to arrive');
  const arrived=new Map([...page.seats].filter(([id])=>id!==child.id).map(([id,p])=>[id,{x:p.x,y:p.y}]));
  const ready=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:page.seats,currentPositions:arrived,immovableIds,openingDockPairs});
  assert.equal(ready.uniformScale,.4);auditOpening(ready,input,footprints,arrived);
});

test('a thirteen-body transition can walk a genuinely exiting parent back to its holding dock before the child opens',()=>{
  const twelve=mixed(12),parent=twelve[2],child=task('agent-012','planning',{parentId:parent.id}),input=twelve.concat(child),footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(twelve,{requestedScale:.65,footprints}),exit=first.coordinatedProof.schedules.get(parent.id).exit.find(move=>move.id===parent.id&&!move.yielding);
  const a=exit.path[0],b=exit.path[1],middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert.ok(Math.hypot((middle.x-a.x)*12.8,(middle.y-a.y)*7.2)>20,'the source really advanced along a proven exit corridor');
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set(parent.id,middle);
  const immovableIds=new Set([parent.id]),page=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:first.seats,currentPositions:current,immovableIds,openingBusyIds:new Set([parent.id])});
  assert.equal(page.uniformScale,.4);audit(page,input,footprints);auditTransition(page,input,footprints,current,immovableIds);
  const holding=page.transitionProof.moves.filter(move=>move.id===parent.id);assert.ok(holding.length);assert.ok(holding.every(move=>!move.yielding&&!move.temporary),'holding is the parent own finite journey, not temporary cooperative permission');
  const docked=new Map([...page.seats].filter(([id])=>id!==child.id).map(([id,p])=>[id,{x:p.x,y:p.y}]));
  const ready=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:page.seats,currentPositions:docked,immovableIds,openingDockPairs:new Map([[child.id,parent.id]])});
  assert.equal(ready.uniformScale,.4);auditOpening(ready,input,footprints,docked);
  const all=new Map([...ready.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),closed=input.map(s=>s.id===child.id?{...s,status:'closed',closed:true}:s);
  const returning=Walking.layoutWalking(closed,{requestedScale:.65,footprints,previousSeats:ready.seats,currentPositions:all,immovableIds:new Set([parent.id,child.id]),closingDockPairs:new Map([[child.id,parent.id]])});
  assert.equal(returning.uniformScale,.4);assert.equal(returning.proofMode,'deferred-clone-return');auditReturn(returning,closed,footprints,all);
});

test('thirteen-body opening evidence caches only the same measured geometry, actual source and owners',()=>{
  const twelve=mixed(12),parent=twelve[2],child=task('agent-012','planning',{parentId:parent.id}),input=twelve.concat(child),footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(twelve,{requestedScale:.65,footprints}),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
  const options={requestedScale:.65,footprints,currentPositions:current,immovableIds:new Set([parent.id]),openingDockPairs:new Map([[child.id,parent.id]])};
  const page=Walking.layoutWalking(input,{...options,previousSeats:first.seats});assert.equal(page.uniformScale,.4);auditOpening(page,input,footprints,current);
  const pulse=Walking.layoutWalking(input.map(s=>({...s,title:'Observed metadata',lastEventAt:1234})),{...options,previousSeats:page.seats});
  assert.equal(pulse.cachedProof,true);assert.equal(pulse.openingProof,page.openingProof,'an ordinary observation must not restart a physical proof');
  const moved=new Map(current);moved.set(parent.id,{x:40.01,y:84});
  const sourceChanged=Walking.layoutWalking(input,{...options,previousSeats:page.seats,currentPositions:moved});
  assert.equal(sourceChanged.cachedProof,false);assert.equal(sourceChanged.uniformScale,.4);auditOpening(sourceChanged,input,footprints,moved);
  const larger=new Map(input.map(s=>[s.id,{left:117,right:123,top:122,bottom:94}]));
  const measured=Walking.layoutWalking(input,{...options,previousSeats:page.seats,footprints:larger});
  assert.equal(measured.cachedProof,false);assert.equal(measured.uniformScale,.4);audit(measured,input,larger);auditOpening(measured,input,larger,current);
  const resized=Walking.layoutWalking(input,{...options,previousSeats:page.seats,requestedScale:1.35});
  assert.equal(resized.cachedProof,false);assert.equal(resized.uniformScale,.4);auditOpening(resized,input,footprints,current);
  const released=Walking.layoutWalking(input,{...options,previousSeats:page.seats,immovableIds:new Set()});
  assert.equal(released.cachedProof,false);auditOpening(released,input,footprints,current);
  const busy=Walking.layoutWalking(input,{...options,previousSeats:page.seats,openingBusyIds:new Set([twelve[0].id])});
  assert.equal(busy.cachedProof,false);assert.equal(busy.uniformScale,.4);assert.equal(busy.openingBusyDeferred,false);auditOpening(busy,input,footprints,current);
  const unpaired=Walking.layoutWalking(input,{...options,previousSeats:page.seats,openingDockPairs:new Map()});
  assert.equal(unpaired.cachedProof,false);assert.equal(unpaired.openingProof,undefined,'revoking a source owner cannot reuse its endpoint permission');
});

test('an already held parent remains at its actual dock when thirteen other work-zone ordinals change',()=>{
  const twelve=mixed(12),parent=twelve[2],child=task('agent-012','planning',{parentId:parent.id}),input=twelve.concat(child),footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(input,{requestedScale:.65,footprints}),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));assert.equal(first.uniformScale,.4);
  const changed=input.map((s,i)=>i===0?{...s,activity:'coding'}:i===8?{...s,activity:'reading'}:s),page=Walking.layoutWalking(changed,{requestedScale:.65,footprints,previousSeats:first.seats,currentPositions:current,immovableIds:new Set([parent.id]),fixedHoldingIds:new Set([parent.id])});
  assert.deepEqual({x:page.seats.get(parent.id).x,y:page.seats.get(parent.id).y},current.get(parent.id),'requestStation never creates a later ordinary move for an already held parent');
  assert.ok(!page.transitionProof?.moves.some(move=>move.id===parent.id),'this existing dock has no ordinary own-move owner');
  audit(page,changed,footprints);auditTransition(page,changed,footprints,current,new Set([parent.id]));
  const restored=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:page.seats,currentPositions:page.seats,immovableIds:new Set([parent.id]),fixedHoldingIds:new Set([parent.id])});
  assert.equal(restored.uniformScale,page.uniformScale,'existing dense actual feet cannot grow before the real move finishes');assert.equal(restored.targetUniformScale,.4);audit(restored,input,footprints);auditTransition(restored,input,footprints,page.seats,new Set([parent.id]));assert.ok(!restored.transitionProof.moves.some(move=>move.id===parent.id));
  const arrived=Walking.layoutWalking(input,{requestedScale:.65,footprints,previousSeats:restored.seats,currentPositions:restored.seats,immovableIds:new Set([parent.id]),fixedHoldingIds:new Set([parent.id])});
  assert.equal(arrived.uniformScale,.4);audit(arrived,input,footprints);
});

test('explicit held feet invalidate their own cache and releasing the owner permits genuine fresh work again',()=>{
  const parent=task('held-main'),child=task('held-child','planning',{parentId:parent.id}),input=[parent,child],footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(input,{footprints}),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set(parent.id,{x:40,y:84});
  const options={footprints,currentPositions:current,immovableIds:new Set([parent.id]),fixedHoldingIds:new Set([parent.id])};
  const held=Walking.layoutWalking(input,{...options,previousSeats:first.seats});
  assert.equal(held.seats.get(parent.id).fixedHolding,true);assert.deepEqual({x:held.seats.get(parent.id).x,y:held.seats.get(parent.id).y},current.get(parent.id));audit(held,input,footprints);auditTransition(held,input,footprints,current,options.immovableIds);
  const pulse=Walking.layoutWalking(input,{...options,previousSeats:new Map(held.seats)});assert.equal(pulse.cachedProof,true,'copied maps retain only their real unchanged seat proof');
  const shifted=new Map(current);shifted.set(parent.id,{x:40.01,y:84});
  const corrected=Walking.layoutWalking(input,{...options,previousSeats:held.seats,currentPositions:shifted});
  assert.equal(corrected.cachedProof,false);assert.equal(corrected.seats.get(parent.id).x,40.01);assert.ok(!corrected.transitionProof.moves.some(m=>m.id===parent.id));
  const fresh=input.map(s=>s.id===parent.id?{...s,activity:'reading'}:s),resumed=Walking.layoutWalking(fresh,{...options,previousSeats:corrected.seats,currentPositions:shifted,fixedHoldingIds:new Set(),immovableIds:new Set()});
  assert.equal(resumed.cachedProof,false);assert.equal(resumed.seats.get(parent.id).fixedHolding,undefined);assert.equal(resumed.seats.get(parent.id).workZone,'library');assert.ok(resumed.transitionProof.moves.some(m=>m.id===parent.id&&!m.yielding),'fresh real work owns a real station journey after the hold is revoked');audit(resumed,fresh,footprints);auditTransition(resumed,fresh,footprints,shifted);
});

test('a held actual corridor point is preserved without claiming a wrong furniture station',()=>{
  const parent=task('held-main'),child=task('held-child','planning',{parentId:parent.id}),input=[parent,child],footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(input,{footprints}),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set(parent.id,{x:74,y:78});
  const page=Walking.layoutWalking(input,{footprints,previousSeats:first.seats,currentPositions:current,fixedHoldingIds:new Set([parent.id])});
  assert.deepEqual({x:page.seats.get(parent.id).x,y:page.seats.get(parent.id).y},current.get(parent.id));assert.equal(page.seats.get(parent.id).area,'held-clone-anchor');assert.equal(page.seats.get(parent.id).fixedStale,undefined);assert.equal(page.visible.find(s=>s.id===parent.id).activity,'coding');audit(page,input,footprints);auditTransition(page,input,footprints,current,new Set([parent.id]));
});

test('the final real finite main exit remains an independent owner after its last child disappears',()=>{
  const parent=task('held-main'),child=task('held-child','planning',{parentId:parent.id}),input=[parent,child],footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(input,{footprints}),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
  const held=Walking.layoutWalking(input,{footprints,previousSeats:first.seats,currentPositions:current,fixedHoldingIds:new Set([parent.id])});
  const remaining=new Map([[parent.id,current.get(parent.id)]]),page=Walking.layoutWalking([parent],{footprints,previousSeats:held.seats,currentPositions:remaining,fixedHoldingIds:new Set([parent.id]),immovableIds:new Set([parent.id]),finiteExitIds:new Set([parent.id])});
  assert.ok(page.exitProof);assert.deepEqual(page.exitProof.removedIds,[parent.id]);assert.ok(page.exitProof.moves.some(m=>m.id===parent.id&&!m.yielding&&!m.temporary),'a finite real door journey overrides only the ordinary station prohibition');
  for(const move of page.exitProof.moves)auditPath(move.path,footprints.get(move.id),page.uniformScale,page.gap,new Map(),footprints);
});

for(const count of [14,16])test(count+' bodies do not inherit the bounded thirteen-body proof or a larger global search',()=>{
  const input=mixed(12).concat(task('agent-012','planning',{parentId:'agent-002'}),task('agent-013','reading'),...(count===16?[task('agent-014','coding'),task('agent-015','testing')]:[]));
  const footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}])),page=Walking.layoutWalking(input,{requestedScale:.65,footprints});
  assert.equal(page.proofMode,'stationary');assert.equal(page.proofTrials,0,'unproved distributions never enumerate the larger cooperative pool');assert.equal(page.coordinatedProof,null);assert.ok(page.uniformScale<.35);assert.equal(page.readability.needsMoreSpace,true);audit(page,input,footprints);
});

test('thirteen unmatched work-zone counts use the honest full-cast fallback',()=>{
  const input=mixed(12).concat(task('agent-012','reading',{parentId:'agent-002'})),footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const page=Walking.layoutWalking(input,{requestedScale:.65,footprints});assert.equal(page.proofTrials,0);assert.equal(page.proofMode,'stationary');assert.equal(page.coordinatedProof,null);audit(page,input,footprints);
});

for(const f of [{left:122,right:121,top:121,bottom:94},{left:122,right:128,top:122,bottom:94}])test('a pending English-width clone proves its actual left-aisle parent origin with '+f.right+'px right extent',()=>{
  const parent=task('codex:recovery-root'),child=task('codex:recovery-size','coding',{parentId:parent.id}),input=[parent,child],footprints=new Map(input.map(s=>[s.id,f]));
  const current=new Map([[parent.id,{x:29.05,y:48.2}]]),before=JSON.stringify([...current]),openingDockPairs=new Map([[child.id,parent.id]]);
  const page=Walking.layoutWalking(input,{footprints,currentPositions:current,openingDockPairs});
  assert.ok(page.uniformScale>.95&&page.uniformScale<1);assert.equal(page.targetUniformScale,1);assert.equal(page.openingOwnerId,child.id);assert.equal(page.openingDeferred,false);
  const probe=scale=>{const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:Walking.legalPoint,route:Walking.route,gap:Walking.gapForScale,obstacles:Walking.OBSTACLES,reservedRects:Scene.CLOCK_RESERVED});traffic.sync(input.map(s=>({id:s.id,position:current.get(parent.id),uniformScale:scale,footprint:f,staged:s.id===child.id,canYield:false})));traffic.request(child.id,page.seats.get(child.id),{overlapIds:[parent.id]});return traffic.nextAny();};
  assert.equal(probe(1).kind,'wait','the old door proof does not cover this real source');assert.equal(probe(page.uniformScale).kind,'move');
  auditOpening(page,input,footprints,current);audit(page,input,footprints);assert.equal(JSON.stringify([...current]),before);
  const heartbeat=Walking.layoutWalking(input,{footprints,currentPositions:current,previousSeats:page.seats,openingDockPairs});assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.openingProof,page.openingProof);assert.equal(heartbeat.uniformScale,page.uniformScale);
  const moved=new Map([[parent.id,{x:29.1,y:48.2}]]),next=Walking.layoutWalking(input,{footprints,currentPositions:moved,previousSeats:page.seats,openingDockPairs});assert.equal(next.cachedProof,false);auditOpening(next,input,footprints,moved);
  const arrived=Walking.layoutWalking(input,{footprints,currentPositions:page.seats,previousSeats:page.seats});assert.equal(arrived.uniformScale,1);assert.equal(arrived.openingProof,undefined);audit(arrived,input,footprints);
});

test('an actual pending split waits for its parent to clear the new normal target instead of borrowing an absorption exemption',()=>{
  const parent=task('z-root'),child=task('a-child','coding',{parentId:parent.id}),input=[parent,child],f={left:122,right:128,top:122,bottom:94},footprints=new Map(input.map(s=>[s.id,f])),current=new Map([[parent.id,{x:29.05,y:48.2}]]),openingDockPairs=new Map([[child.id,parent.id]]);
  const page=Walking.layoutWalking(input,{footprints,currentPositions:current,openingDockPairs});
  assert.equal(page.openingProof,null);assert.equal(page.openingDeferred,true);assert.equal(page.fitReason,'waiting-for-split-route');
  assert.deepEqual({x:page.seats.get(child.id).x,y:page.seats.get(child.id).y},current.get(parent.id));
  const actual=new Map([[parent.id,{x:page.seats.get(parent.id).x,y:page.seats.get(parent.id).y}]]),after=Walking.layoutWalking(input,{footprints,currentPositions:actual,previousSeats:page.seats,openingDockPairs});
  assert.equal(after.openingDeferred,false);auditOpening(after,input,footprints,actual);
});

test('opening evidence never invents a missing ancestor and may name an actual observed intermediate helper',()=>{
  const parent=task('observed-helper','reading',{parentId:'unobserved-main'}),child=task('actual-nested','coding',{parentId:parent.id}),footprints=new Map([[parent.id,{left:116,right:123,top:121,bottom:93}],[child.id,{left:116,right:123,top:121,bottom:93}]]),first=Walking.layoutWalking([parent],{footprints}),current=new Map([[parent.id,first.seats.get(parent.id)]]);
  const unknown=Walking.layoutWalking([parent,child],{footprints,currentPositions:current,openingDockPairs:new Map([[child.id,'unobserved-main']])});assert.equal(unknown.openingProof,undefined);assert.equal(unknown.seats.has('unobserved-main'),false);
  const actual=Walking.layoutWalking([parent,child],{footprints,currentPositions:current,openingDockPairs:new Map([[child.id,parent.id]])});auditOpening(actual,[parent,child],footprints,current);assert.equal(actual.openingProof.parentId,parent.id);assert.equal(actual.visible.find(s=>s.id===parent.id).parentId,'unobserved-main');
});

test('two pending helpers receive separate actual-origin proofs after the first real body reaches its own station',()=>{
  const parent=task('root'),firstChild=task('first','reading',{parentId:parent.id}),secondChild=task('second','planning',{parentId:parent.id}),input=[parent,firstChild,secondChild],f={left:122,right:128,top:122,bottom:94},footprints=new Map(input.map(s=>[s.id,f])),ordinary=Walking.layoutWalking(input,{footprints});
  const current=new Map([[parent.id,ordinary.seats.get(parent.id)]]),first=Walking.layoutWalking(input,{footprints,previousSeats:ordinary.seats,currentPositions:current,openingDockPairs:new Map([[firstChild.id,parent.id]])});
  assert.equal(first.openingOwnerId,firstChild.id);auditOpening(first,input,footprints,current);assert.equal(first.openingProof.initialPositions.has(secondChild.id),false,'a still outside sibling is not a ghost obstruction or an invented admission');
  const after=new Map([...current,[firstChild.id,first.seats.get(firstChild.id)]]),second=Walking.layoutWalking(input,{footprints,previousSeats:first.seats,currentPositions:after,openingDockPairs:new Map([[secondChild.id,parent.id]])});
  assert.equal(second.openingOwnerId,secondChild.id);assert.equal(second.openingProof.initialPositions.has(firstChild.id),true);auditOpening(second,input,footprints,after);
});

test('a finite unrelated mover defers a blocked split at the unchanged readable scale and its endpoint reopens the real route',()=>{
  const kinds=['planning','coding','testing','reading','idle','unknown','reading','planning','coding','testing','idle','unknown'];
  const input=kinds.map((activity,i)=>task('codex:crowd-'+String(i).padStart(2,'0'),activity,i===8?{parentId:'codex:crowd-00'}:{})),f={left:117,right:123,top:122,bottom:94},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{footprints}),child=input[8].id,parent=input[0].id,mover=input[5].id;
  const current=new Map([...first.seats].filter(([id])=>id!==child).map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set(mover,{x:55,y:84});
  const openingDockPairs=new Map([[child,parent]]),openingBusyIds=new Set([mover]),waiting=Walking.layoutWalking(input,{footprints,previousSeats:first.seats,currentPositions:current,openingDockPairs,openingBusyIds});
  assert.equal(waiting.uniformScale,.4,'an in-flight foot near the destination is not permanent room capacity');assert.equal(waiting.openingProof,null);assert.equal(waiting.openingDeferred,true);assert.equal(waiting.openingBusyDeferred,true);assert.deepEqual(waiting.openingBusyIds,[mover]);
  const heartbeat=Walking.layoutWalking(input,{footprints,previousSeats:waiting.seats,currentPositions:current,openingDockPairs,openingBusyIds});assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.uniformScale,.4);
  const actual=new Map(current);actual.set(mover,{x:first.seats.get(mover).x,y:first.seats.get(mover).y});
  const stillReserved=Walking.layoutWalking(input,{footprints,previousSeats:waiting.seats,currentPositions:actual,openingDockPairs,openingBusyIds});
  assert.equal(stillReserved.uniformScale,.4);assert.equal(stillReserved.openingDeferred,false,'a real positive route permits concurrent admission even while an unrelated owner still exists');auditOpening(stillReserved,input,footprints,actual);
  const arrived=Walking.layoutWalking(input,{footprints,previousSeats:waiting.seats,currentPositions:actual,openingDockPairs,openingBusyIds:new Set()});assert.equal(arrived.uniformScale,.4);assert.equal(arrived.openingBusyDeferred,false);auditOpening(arrived,input,footprints,actual);
  const cancelled=Walking.layoutWalking(input,{footprints,previousSeats:waiting.seats,currentPositions:current,openingDockPairs,openingBusyIds:new Set()});
  assert.equal(cancelled.cachedProof,false,'a real owner cancellation invalidates a deferred proof even if no foot moved');assert.equal(cancelled.openingDeferred,false);assert.ok(cancelled.uniformScale<.4);auditOpening(cancelled,input,footprints,current);
});

test('a paired parent or an unadmitted body is not unrelated motion evidence that suppresses a necessary stable split fit',()=>{
  const parent=task('codex:recovery-root'),child=task('codex:recovery-size','coding',{parentId:parent.id}),input=[parent,child],f={left:122,right:121,top:121,bottom:94},footprints=new Map(input.map(s=>[s.id,f]));
  const current=new Map([[parent.id,{x:29.05,y:48.2}]]),page=Walking.layoutWalking(input,{footprints,currentPositions:current,openingDockPairs:new Map([[child.id,parent.id]]),openingBusyIds:new Set([parent.id,child.id,'unobserved-mover'])});
  assert.equal(page.openingDeferred,false);assert.equal(page.openingBusyDeferred,false);assert.deepEqual(page.openingBusyIds,[]);assert.ok(page.uniformScale>.95&&page.uniformScale<1);auditOpening(page,input,footprints,current);
});

test('a real return around a locked right-aisle parent fits its shared scale to the actual complete endpoint route',()=>{
  const input=[task('main','coding'),task('clone','planning',{parentId:'main'})];
  const footprints=new Map([['main',{left:117,right:123,top:122,bottom:94}],['clone',{left:116,right:124,top:121,bottom:93}]]);
  const first=Walking.layoutWalking(input,{requestedScale:1.35,footprints});assert.ok(first.uniformScale>1);
  const current=new Map([['main',{x:69,y:483.76/7.2}],['clone',{x:32.2,y:43.5}]]),before=JSON.stringify([...current]);
  const probe=scale=>{const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:Walking.legalPoint,route:Walking.route,gap:Walking.gapForScale,obstacles:Walking.OBSTACLES,reservedRects:Scene.CLOCK_RESERVED});traffic.sync(input.map(s=>({id:s.id,position:current.get(s.id),uniformScale:scale,footprint:footprints.get(s.id),canYield:false})));assert.equal(traffic.request('clone',current.get('main'),{overlapIds:['main']}),true);return traffic.nextAny();};
  assert.equal(probe(1.07957).kind,'wait','parking safety alone does not make the actual locked return corner passable');
  const ended=input.map(s=>s.parentId?{...s,status:'closed',closed:true}:s),closingDockPairs=new Map([['clone','main']]),immovableIds=new Set(['main','clone']);
  const page=Walking.layoutWalking(ended,{requestedScale:1.35,footprints,previousSeats:first.seats,currentPositions:current,closingDockPairs,immovableIds});
  assert.equal(page.proofMode,'deferred-clone-return');assert.ok(page.uniformScale>.8&&page.uniformScale<.85,'choose the largest bounded positive route evidence instead of an arbitrary small cap');
  assert.equal(probe(page.uniformScale).kind,'move','the unchanged production Traffic rules accept the selected return scale');
  assert.equal(page.transitionProof,null);assert.equal(page.pathsById.size,0);auditReturn(page,ended,footprints,current);
  for(const[id,p]of page.seats)assert.deepEqual({x:p.x,y:p.y},{x:first.seats.get(id).x,y:first.seats.get(id).y},'return-scale fitting never repositions a dock or work target');
  assert.equal(JSON.stringify([...current]),before);
  const heartbeat=Walking.layoutWalking(ended,{requestedScale:1.35,footprints,previousSeats:page.seats,currentPositions:new Map([...current].map(([id,p])=>[id,{...p,unrelatedMetadata:1}])),closingDockPairs,immovableIds});
  assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.returnProof,page.returnProof);
  const moved=new Map(current);moved.set('main',{x:69,y:68});
  const refreshed=Walking.layoutWalking(ended,{requestedScale:1.35,footprints,previousSeats:page.seats,currentPositions:moved,closingDockPairs,immovableIds});
  assert.equal(refreshed.cachedProof,false,'a moving actual endpoint invalidates the cached route proof');auditReturn(refreshed,ended,footprints,moved);
});

test('many real closing owners prove only the next finite return and release its removed body before the next proof',()=>{
  const input=mixed(100).map((s,i)=>i%2?{...s,parentId:'agent-'+String(i-1).padStart(3,'0')}:s),first=Walking.layoutWalking(input);
  const changed=input.map(s=>s.parentId?{...s,status:'closed',closed:true}:s),closingDockPairs=new Map(input.filter(s=>s.parentId).map(s=>[s.id,s.parentId])),immovableIds=new Set(input.map(s=>s.id));
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
  const page=Walking.layoutWalking(changed,{previousSeats:first.seats,currentPositions:current,closingDockPairs,immovableIds});
  assert.equal(page.proofMode,'deferred-clone-return');assert.equal(page.returnProof.childId,'agent-001');assert.equal(page.returnProof.awaitingOwnerIds.length,49);assert.ok(page.returnProof.trials<=18);assert.equal(page.returnProof.moves.length,1);
  auditReturn(page,changed,new Map(),current);
  const removed=page.returnProof.childId,remaining=changed.filter(s=>s.id!==removed),afterCurrent=new Map([...current].filter(([id])=>id!==removed)),remainingPairs=new Map([...closingDockPairs].filter(([id])=>id!==removed));
  const after=Walking.layoutWalking(remaining,{previousSeats:page.seats,currentPositions:afterCurrent,closingDockPairs:remainingPairs,immovableIds});
  assert.equal(after.seats.size,99);assert.equal(after.returnProof.childId,'agent-003');assert.equal(after.returnProof.awaitingOwnerIds.length,48);assert.equal(after.returnProof.initialPositions.has(removed),false,'a removed owner never leaves a ghost blocker in the next proof');
  auditReturn(after,remaining,new Map(),afterCurrent);
});

test('a still-overlapping third body never grants a fake return exemption or a normal request to move the locked parent',()=>{
  const input=[task('main','coding'),task('clone','planning',{parentId:'main'}),task('nested','testing',{parentId:'clone'})],first=Walking.layoutWalking(input);
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set('nested',{...current.get('clone')});
  const ended=input.map(s=>s.id==='clone'?{...s,status:'closed',closed:true}:s),page=Walking.layoutWalking(ended,{previousSeats:first.seats,currentPositions:current,closingDockPairs:new Map([['clone','main']]),immovableIds:new Set(['main','clone','nested']),allowedOverlaps:new Set([JSON.stringify(['clone','nested'])])});
  assert.equal(page.proofMode,'deferred-clone-return');assert.equal(page.fitReason,'waiting-for-return-route');assert.equal(page.returnProof,null);assert.equal(page.transitionProof,null);assert.equal(page.pathsById.size,0);
  for(const[id,p]of page.seats)assert.deepEqual({x:p.x,y:p.y},{x:first.seats.get(id).x,y:first.seats.get(id).y},'a temporary real source meeting waits without moving or removing any body');
});

test('ordinary work uses real furniture-side seats and a complete safe route plus empty holding pocket',()=>{
  const input=[task('reader','reading'),task('planner','planning'),task('coder','coding'),task('tester','testing')];
  const page=Walking.layoutWalking(input,{requestedScale:1});audit(page,input);
  assert.ok(page.uniformScale>=.6,'four different real functions should retain an ordinary readable body');
  assert.ok(page.seats.get('reader').x<32);assert.ok(page.seats.get('tester').x>69);assert.ok(page.seats.get('coder').x>=29);
});

for(const activity of ['reading','coding','planning'])test('four '+activity+' actors keep natural proportions with real finite yielding instead of shrinking for a permanently occupied holding slot',()=>{
  const input=Array.from({length:4},(_,i)=>task('independent-'+(20-i),activity)),footprints=new Map(input.map(s=>[s.id,{left:120,right:120,top:138,bottom:84}]));
  const page=Walking.layoutWalking(input,{requestedScale:1,footprints});
  assert.equal(page.proofMode,'cooperative');assert.ok(page.uniformScale>=.65);audit(page,input,footprints);
});

for(const [count,minimum]of [[8,.5],[12,.4]])test(count+' mixed real functions use verified zone/ordinal hints at readable scale with locale-measured bodies',()=>{
  const input=mixed(count).map((s,i)=>({...s,id:'arbitrary-'+(count-i),sessionId:'actual-session-'+i,parentId:i%3===1?'arbitrary-'+count:undefined}));
  const footprints=new Map(input.map(s=>[s.id,{left:120,right:120,top:138,bottom:84}]));
  const page=Walking.layoutWalking(input,{requestedScale:1,footprints});
  assert.equal(page.proofMode,'cooperative');assert.ok(page.uniformScale>=minimum);audit(page,input,footprints);
  const heartbeat=Walking.layoutWalking(input.slice().reverse(),{requestedScale:1,footprints,previousSeats:page.seats,currentPositions:page.seats});
  assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.coordinatedProof,page.coordinatedProof);assert.equal(heartbeat.seats,page.seats);
});

test('eight mixed bodies retain half size after source-foot calibration extends the complete nameplate below the anchor',()=>{
  const input=mixed(8),f={left:116,right:123,top:121,bottom:93},footprints=new Map(input.map(s=>[s.id,f]));
  const page=Walking.layoutWalking(input,{footprints});
  assert.equal(page.uniformScale,.5);assert.equal(page.proofMode,'cooperative');audit(page,input,footprints);
  assert.ok(page.holdingPoints.some(p=>p.x===40&&p.y<86),'the old bottom-edge yielding pocket is fitted to its whole measured envelope');
  for(const [id,p]of page.seats)assert.ok(Scene.actorBounds(p,{uniformScale:page.uniformScale,footprint:footprints.get(id)}).bottom<=Scene.ACTOR_VIEWPORT.bottom+1e-7);
});

for(const count of [8,12])for(const order of count===8?['ascending','descending','interleaved']:['ascending','descending'])test(count+' simultaneous real function changes complete at natural scale with '+order+' identities',()=>{
  const input=mixed(count).map((s,i)=>({...s,id:'actual-'+String(order==='ascending'?i:order==='descending'?count-1-i:(i*5+3)%count).padStart(2,'0'),sessionId:'real-session-'+i}));
  const f={left:116,right:123,top:121,bottom:93},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{footprints});
  const changed=input.map((s,i)=>i<4?{...s,activity:['planning','coding','testing','reading'][i]}:s);
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),before=JSON.stringify([...current]);
  const page=Walking.layoutWalking(changed,{footprints,previousSeats:first.seats,currentPositions:current});
  assert.equal(page.uniformScale,count===8?.5:.4,'a function permutation must not shrink a readable cast merely to avoid its target cycle');
  audit(page,changed,footprints);auditTransition(page,changed,footprints,current);
  assert.ok(page.transitionProof.moves.some(move=>move.temporary),'the transition contains actual finite yielding instead of teleporting or hiding workers');
  assert.equal(JSON.stringify([...current]),before);
  const heartbeat=Walking.layoutWalking(changed.slice().reverse(),{footprints,previousSeats:page.seats,currentPositions:current});
  assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.transitionProof,page.transitionProof);assert.equal(heartbeat.seats,page.seats);
});

test('an unsupported interleaved twelve-body transition stays executable and reports its real readability limit',()=>{
  const input=mixed(12).map((s,i)=>({...s,id:'interleaved-'+String((i*5+3)%12).padStart(2,'0')}));
  const f={left:116,right:123,top:121,bottom:93},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{footprints});
  const changed=input.map((s,i)=>i<4?{...s,activity:['planning','coding','testing','reading'][i]}:s);
  const page=Walking.layoutWalking(changed,{footprints,previousSeats:first.seats,currentPositions:first.seats});
  audit(page,changed,footprints);auditTransition(page,changed,footprints,first.seats);
  assert.ok(page.uniformScale<.35);assert.equal(page.readability.needsMoreSpace,true,'a small geometric fit is not called readable artwork');
});

test('a closed returning clone reserves its previous work area until physical absorption releases that body',()=>{
  const input=mixed(12).map((s,i)=>i===8?{...s,parentId:'agent-001'}:s),footprints=new Map(input.map(s=>[s.id,{left:116,right:123,top:121,bottom:93}]));
  const first=Walking.layoutWalking(input,{footprints}),helper=input[8],closed=input.map(s=>s.id===helper.id?{...s,status:'closed',closed:true,activity:'idle'}:s),before=JSON.stringify(closed);
  const page=Walking.layoutWalking(closed,{footprints,previousSeats:first.seats,currentPositions:first.seats,immovableIds:new Set([helper.id,'agent-001'])});
  assert.notEqual(page.proofMode,'deferred-clone-return','raw closed status and two protected IDs are not an explicit finite return owner');
  assert.equal(page.seats.get(helper.id).workZone,'desk','returning is not a new archive destination');
  assert.equal(page.visible.find(s=>s.id===helper.id).status,'closed');assert.equal(page.rootIdsBySession.get(helper.id),'agent-001');assert.equal(JSON.stringify(closed),before);
  audit(page,closed,footprints);auditTransition(page,closed,footprints,first.seats,new Set([helper.id,'agent-001']));
  const remaining=closed.filter(s=>s.id!==helper.id),after=Walking.layoutWalking(remaining,{footprints,previousSeats:page.seats,currentPositions:page.seats});
  assert.equal(after.seats.has(helper.id),false);assert.equal(after.visible.length,11);audit(after,remaining,footprints);auditTransition(after,remaining,footprints,page.seats);
});

for(const ended of ['closed','completed-idle'])test('a real '+ended+' return owner preserves the natural dock layout, then eleven real bodies complete their deferred functions',()=>{
  const kinds=['planning','coding','testing','reading','idle','unknown','reading','planning','coding','testing','idle','unknown'];
  const input=kinds.map((activity,i)=>task('codex:crowd-'+String(i).padStart(2,'0'),activity,i===8?{parentId:'codex:crowd-00'}:{}));
  const f={left:117,right:123,top:122,bottom:94},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{footprints});
  const changed=input.map((s,i)=>i===8?{...s,activity:'idle',...(ended==='closed'?{status:'closed',closed:true}:{turnCompletedAt:1000})}:i===3?{...s,activity:'planning'}:i===7?{...s,activity:'reading'}:s),helper=input[8].id,parent=input[0].id;
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),closingDockPairs=new Map([[helper,parent]]),immovableIds=new Set([helper,parent]);
  // The renderer supplies these explicit owners before its first closed
  // snapshot is reconciled, so there is no one-frame shrink before docking.
  const waiting=Walking.layoutWalking(changed,{footprints,previousSeats:first.seats,currentPositions:current,closingDockPairs,immovableIds});
  assert.equal(waiting.proofMode,'deferred-clone-return');assert.equal(waiting.uniformScale,.4);assert.deepEqual(waiting.blockedByIds,[parent,helper]);assert.equal(waiting.transitionDeferred,true);
  assert.equal(waiting.pathsById.size,0);assert.equal(waiting.transitionProof,null);assert.equal(waiting.coordinatedProof,null);
  auditReturn(waiting,changed,footprints,current);assert.equal(waiting.returnProof.scale,.4,'an already passable natural crowd return is not reduced');
  for(const[id,p]of waiting.seats){assert.deepEqual({x:p.x,y:p.y},{x:first.seats.get(id).x,y:first.seats.get(id).y});assert.equal(Walking.legalPoint(p,{uniformScale:.4,footprint:f}),true);for(const[other,q]of waiting.seats)if(other!==id)assert.equal(Scene.actorsOverlap(p,{uniformScale:.4,footprint:f},q,{uniformScale:.4,footprint:f},waiting.gap),false);}
  assert.equal(waiting.visible.find(s=>s.id===helper).status,ended==='closed'?'closed':'active');assert.equal(waiting.seats.get(input[3].id).pendingWorkZone,'board');
  const heartbeat=Walking.layoutWalking(changed.slice().reverse(),{footprints,previousSeats:waiting.seats,currentPositions:current,closingDockPairs,immovableIds});assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.seats,waiting.seats);
  const remaining=changed.filter(s=>s.id!==helper),actual=new Map([...current].filter(([id])=>id!==helper)),resumed=Walking.layoutWalking(remaining,{footprints,previousSeats:waiting.seats,currentPositions:actual});
  assert.equal(resumed.uniformScale,.4);assert.equal(resumed.transitionDeferred,undefined);assert.equal(resumed.proofMode,'cooperative');assert.equal(resumed.seats.get(input[3].id).workZone,'board');assert.equal(resumed.seats.get(input[7].id).workZone,'library');
  assert.ok(resumed.transitionProof.moves.some(move=>move.id===input[3].id&&!move.yielding));assert.ok(resumed.transitionProof.moves.some(move=>move.id===input[7].id&&!move.yielding));
  audit(resumed,remaining,footprints);auditTransition(resumed,remaining,footprints,actual);
});

test('the whole-cast proof uses moving actual feet and preserves an immovable worker rather than replaying old targets',()=>{
  const input=mixed(8),f={left:116,right:123,top:121,bottom:93},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{footprints});
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set(input[0].id,{...current.get(input[0].id),x:6.2});
  const changed=input.map((s,i)=>i<4?{...s,activity:['planning','coding','testing','reading'][i]}:s),immovableIds=new Set([input[6].id]);
  const page=Walking.layoutWalking(changed,{footprints,previousSeats:first.seats,currentPositions:current,immovableIds});
  audit(page,changed,footprints);auditTransition(page,changed,footprints,current,immovableIds);
  assert.deepEqual(page.transitionProof.initialPositions.get(input[0].id),{x:6.2,y:first.seats.get(input[0].id).y});
});

test('a smaller remaining cast physically walks toward a roomier proved layout before recovering its natural shared size',()=>{
  const input=mixed(12),footprints=new Map(input.map(s=>[s.id,{left:120,right:120,top:138,bottom:84}])),dense=Walking.layoutWalking(input,{footprints});
  const few=input.filter((_,i)=>[0,1,6,7].includes(i)),before=JSON.stringify([...dense.seats]);
  const after=Walking.layoutWalking(few,{footprints,previousSeats:dense.seats,currentPositions:dense.seats});
  const fresh=Walking.layoutWalking(few,{footprints});
  assert.ok(after.targetUniformScale>after.uniformScale);assert.equal(after.uniformScale,dense.uniformScale,'the real dense feet are not enlarged or teleported while moving to their spacious targets');audit(after,few,footprints);
  const heartbeat=Walking.layoutWalking(few,{footprints,previousSeats:new Map([...after.seats].reverse()),currentPositions:dense.seats});
  assert.equal(heartbeat.cachedProof,true);assert.equal(heartbeat.seats,after.seats);assert.equal(heartbeat.uniformScale,after.uniformScale);
  const arrived=Walking.layoutWalking(few,{footprints,previousSeats:new Map(after.seats),currentPositions:after.seats});
  assert.equal(arrived.cachedProof,true);assert.equal(arrived.uniformScale,fresh.uniformScale);assert.ok(arrived.uniformScale>.85);audit(arrived,few,footprints);
  assert.deepEqual([...arrived.seats].map(([id,p])=>[id,p.x,p.y]),[...after.seats].map(([id,p])=>[id,p.x,p.y]),'recovery changes only the common scale, never an actual or target foot');
  assert.equal(JSON.stringify([...dense.seats]),before,'layout never mutates the caller real feet or previous cast');
  const poisoned=new Map(arrived.seats);const id=few[0].id;poisoned.set(id,{...poisoned.get(id),x:87,y:78});
  const repaired=Walking.layoutWalking(few,{footprints,previousSeats:poisoned,currentPositions:arrived.seats});
  assert.equal(repaired.cachedProof,false,'a copied but edited coordinate map cannot inherit an unrelated proof');audit(repaired,few,footprints);
});

test('strong stationary proof remains available and unsupported profiles fall back without losing any observed body',()=>{
  const input=mixed(8),strong=Walking.layoutWalking(input,{cooperative:false});assert.equal(strong.proofMode,'stationary');audit(strong,input);
  const unmatched=Array.from({length:8},(_,i)=>task('reader-'+i,'reading')),fallback=Walking.layoutWalking(unmatched);
  assert.equal(fallback.proofMode,'stationary');audit(fallback,unmatched);
});

test('stale and explicitly protected real bodies are never invented as cooperative yielders, and protection invalidates a cached proof',()=>{
  const input=Array.from({length:4},(_,i)=>task('reader-'+i,'reading')),first=Walking.layoutWalking(input);
  const immovableIds=new Set(input.map(s=>s.id));
  const next=Walking.layoutWalking(input,{previousSeats:first.seats,currentPositions:first.seats,immovableIds});
  assert.equal(next.cachedProof,false);audit(next,input);
  if(next.coordinatedProof)for(const schedule of next.coordinatedProof.schedules.values())for(const move of [...schedule.enter,...schedule.exit])assert.equal(move.yielding,false,'protected workers can only move under their own explicit request');
  const staleInput=input.map((s,i)=>i===1?{...s,disconnected:true}:s),stale=Walking.layoutWalking(staleInput,{previousSeats:first.seats,currentPositions:first.seats});
  assert.equal(stale.cachedProof,false);assert.equal(stale.seats.get('reader-1').workZone,'library');audit(stale,staleInput);
  if(stale.coordinatedProof)for(const schedule of stale.coordinatedProof.schedules.values())for(const move of [...schedule.enter,...schedule.exit])assert.ok(!move.yielding||move.id!=='reader-1','a disconnected worker keeps its observed physical position');
});

for(const count of [8,12])test(count+' stale actual feet remain fixed through an ordinal function change without an invented ordinary request',()=>{
  const input=mixed(count),f={left:116,right:123,top:121,bottom:93},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{footprints});
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),staleId=input[4].id;
  current.set(staleId,{...current.get(staleId),x:current.get(staleId).x+.4});
  const changed=input.map((s,i)=>i===4?{...s,disconnected:true}:i<4?{...s,activity:['planning','coding','testing','reading'][i]}:s);
  const page=Walking.layoutWalking(changed,{footprints,previousSeats:first.seats,currentPositions:current});
  assert.equal(page.uniformScale,count===8?.5:.4);assert.deepEqual({x:page.seats.get(staleId).x,y:page.seats.get(staleId).y},current.get(staleId));
  assert.equal(page.transitionProof.moves.some(move=>move.id===staleId),false,'app.requestStation returns before queueing a stale actor');
  audit(page,changed,footprints);auditTransition(page,changed,footprints,current,new Set([staleId]));
  const again=Walking.layoutWalking(changed,{footprints,previousSeats:page.seats,currentPositions:current});assert.equal(again.cachedProof,true);assert.equal(again.seats.get(staleId),page.seats.get(staleId));
});

test('a legal last observed aisle point is retained even when it lies outside the previous furniture station',()=>{
  const input=[task('reader','reading'),task('coder')],first=Walking.layoutWalking(input),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set('reader',{x:50,y:46.5});
  const changed=[{...input[0],disconnected:true},{...input[1],activity:'testing'}],page=Walking.layoutWalking(changed,{previousSeats:first.seats,currentPositions:current});
  assert.equal(page.seats.get('reader').area,'last-observed-position');assert.deepEqual({x:page.seats.get('reader').x,y:page.seats.get('reader').y},{x:50,y:46.5});
  assert.equal(page.transitionProof.moves.some(move=>move.id==='reader'),false);audit(page,changed);auditTransition(page,changed,new Map(),current,new Set(['reader']));
});

test('an observed stale body occupying the real portal defers admission honestly and resumes full proof on recovery',()=>{
  const input=[task('reader','reading'),task('coder')],first=Walking.layoutWalking(input),current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));current.set('reader',{...Walking.ENTRY_POINT});
  const changed=[{...input[0],disconnected:true},{...input[1],activity:'testing'}],waiting=Walking.layoutWalking(changed,{previousSeats:first.seats,currentPositions:current});
  assert.equal(waiting.proofMode,'deferred-entrance');assert.equal(waiting.fitReason,'waiting-for-entrance');assert.equal(waiting.transitionDeferred,true);assert.deepEqual(waiting.blockedByIds,['reader']);
  assert.equal(waiting.transitionProof,null);assert.equal(waiting.coordinatedProof,null);assert.equal(waiting.pathsById.size,0);assert.deepEqual(waiting.holdingPaths,[],'a blocked portal must not publish a fictitious path');
  assert.deepEqual({x:waiting.seats.get('reader').x,y:waiting.seats.get('reader').y},Walking.ENTRY_POINT);assert.equal(waiting.visible.length,2);assert.equal(waiting.hidden,0);
  for(const[id,p]of waiting.seats){assert.equal(Walking.legalPoint(p,{uniformScale:waiting.uniformScale,footprint:footprintFor(id,input,new Map())}),true);for(const[other,q]of waiting.seats)if(other!==id)assert.equal(Scene.actorsOverlap(p,{uniformScale:waiting.uniformScale,footprint:footprintFor(id,input,new Map())},q,{uniformScale:waiting.uniformScale,footprint:footprintFor(other,input,new Map())},waiting.gap),false);}
  const recovered=[input[0],changed[1]],resumed=Walking.layoutWalking(recovered,{previousSeats:waiting.seats,currentPositions:current});
  assert.notEqual(resumed.proofMode,'deferred-entrance');assert.equal(resumed.transitionDeferred,undefined);assert.ok(resumed.transitionProof.moves.some(move=>move.id==='reader'));
  audit(resumed,recovered);auditTransition(resumed,recovered,new Map(),current);
});

test('all 100 mixed identities remain geometrically present with every other seat and holding pocket occupied',()=>{
  const input=mixed(100),page=Walking.layoutWalking(input,{requestedScale:1});audit(page,input);
  assert.equal(page.readability.needsMoreSpace,true,'geometric packing is not an assertion of readable 100-person artwork');
  assert.ok(page.readability.paintedHeadPixels<10,'report the actual painted head, not the mostly empty 154px canvas');
});

for(const activity of ['reading','planning','coding','testing','idle','unknown'])test('100 '+activity+' actors retain their truthful furniture-side domain and complete-body routes',()=>{
  const input=Array.from({length:100},(_,i)=>task('agent-'+String(i).padStart(3,'0'),activity));audit(Walking.layoutWalking(input,{requestedScale:1}),input);
});

test('metadata order and heartbeats preserve each target, holding pocket and shared scale exactly',()=>{
  const input=mixed(8),first=Walking.layoutWalking(input,{requestedScale:1});
  const next=Walking.layoutWalking(input.slice().reverse().map(s=>({...s,lastEventAt:9000})),{requestedScale:1,previousSeats:first.seats,currentPositions:first.seats});
  assert.equal(next.uniformScale,first.uniformScale);assert.equal(next.seats,first.seats);assert.equal(next.pathsById,first.pathsById);assert.equal(next.cachedProof,true);assert.deepEqual(next.holdingPoints,first.holdingPoints);assert.equal(next.visible[0].lastEventAt,9000);audit(next,input);
});

test('a real work change moves its target domain without rewriting identity, ancestry or live feet',()=>{
  const input=[task('main','reading'),task('child','coding',{parentId:'main'})],first=Walking.layoutWalking(input,{requestedScale:1});
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}])),before=JSON.stringify([...current]);
  const nextInput=[{...input[0],activity:'testing'},input[1]],next=Walking.layoutWalking(nextInput,{requestedScale:1,previousSeats:first.seats,currentPositions:current});
  assert.equal(next.seats.get('main').workZone,'bench');assert.equal(next.rootIdsBySession.get('child'),'main');assert.equal(next.visible.find(s=>s.id==='child').parentId,'main');assert.equal(JSON.stringify([...current]),before);audit(next,nextInput);
});

test('the shared scale fits the future whole newcomer at the door and every actual moving position',()=>{
  const input=mixed(4),first=Walking.layoutWalking(input,{requestedScale:.65});
  const next=Walking.layoutWalking(input,{requestedScale:1.35,previousSeats:first.seats,currentPositions:first.seats});
  assert.equal(Walking.legalPoint(Walking.ENTRY_POINT,{uniformScale:next.uniformScale,footprint:next.envelope}),true);
  for(const [id,p]of first.seats)assert.equal(Walking.legalPoint(p,{uniformScale:next.uniformScale,footprint:Scene.ACTOR_FOOTPRINT.root}),true,id);
  audit(next,input);
});

test('only an explicit real clone endpoint may share current feet; destination bodies always remain separate',()=>{
  const input=[task('root'),task('helper','reading',{parentId:'root'})],current=new Map(input.map(s=>[s.id,{x:60,y:72}]));
  assert.throws(()=>Walking.layoutWalking(input,{currentPositions:current}),/Current real body/);
  const page=Walking.layoutWalking(input,{currentPositions:current,allowedOverlaps:new Set([JSON.stringify(['helper','root'])])});audit(page,input);assert.equal(page.rootIdsBySession.get('helper'),'root');
});

test('all three painting layouts share the same physical routing and locale-measured envelope',()=>{
  const input=mixed(4),footprints=new Map(input.map(s=>[s.id,{left:120,right:120,top:138,bottom:84}]));
  const pages=['workshop','teahouse','observatory'].map(venue=>Walking.layoutWalking(input,{requestedScale:1,venue,footprints}));
  for(const page of pages){audit(page,input,footprints);assert.equal(page.envelope.top,138);assert.equal(page.envelope.bottom,84);}
  assert.deepEqual(pages[0].seats,pages[1].seats);assert.deepEqual(pages[1].seats,pages[2].seats);
});
