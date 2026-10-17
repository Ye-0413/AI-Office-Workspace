'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../lib/scene-model.js'),Walking=require('../lib/walking-layout.js'),Traffic=require('../lib/scene-traffic.js');
const task=(i,activity)=>({id:'codex:crowd-'+String(i).padStart(2,'0'),sessionId:'crowd-'+i,provider:'codex',activity,status:'active'});
const point=p=>({x:p.x,y:p.y}),pixel=p=>({x:p.x*12.8,y:p.y*7.2});
function fixture(){
  const input=Array.from({length:12},(_,i)=>task(i,['reading','planning','coding','testing','idle','unknown'][i%6]));
  const footprints=new Map(input.map(s=>[s.id,{left:117,right:123,top:122,bottom:94}])),first=Walking.layoutWalking(input,{footprints}),keep=new Set([0,1,6,7].map(i=>input[i].id));
  return{input,footprints,first,keep,finiteExitIds:new Set(input.filter(s=>!keep.has(s.id)).map(s=>s.id)),current:new Map([...first.seats].map(([id,p])=>[id,point(p)]))};
}
function auditExit(page,f){
  const {input,footprints,current,finiteExitIds}=f,proof=page.exitProof;
  assert.ok(proof&&Array.isArray(proof.moves));assert.equal(proof.scale,page.uniformScale);assert.ok(proof.trials<=12);
  const positions=new Map([...current].map(([id,p])=>[id,point(p)])),removed=[];
  for(const[id,p]of positions)assert.deepEqual(proof.initialPositions.get(id),p,'proof starts at every actual body');
  for(const move of proof.steps||proof.moves){
    assert.ok(positions.has(move.id),'a body stays physical until its real door arrival');
    if(move.kind==='arrived'){
      assert.ok(finiteExitIds.has(move.id));assert.deepEqual(move.actualPosition,positions.get(move.id));assert.ok(Math.abs(move.actualPosition.x-Walking.ENTRY_POINT.x)<.001&&Math.abs(move.actualPosition.y-Walking.ENTRY_POINT.y)<.001);assert.deepEqual(move.target,Walking.ENTRY_POINT);
      assert.equal(Walking.legalPoint(move.actualPosition,{uniformScale:proof.scale,footprint:footprints.get(move.id)}),true);positions.delete(move.id);removed.push(move.id);continue;
    }
    assert.deepEqual(move.path[0],positions.get(move.id));
    const own={uniformScale:proof.scale,footprint:footprints.get(move.id)},m=own.footprint,gap=Walking.gapForScale(proof.scale);
    if(finiteExitIds.has(move.id)){assert.equal(move.temporary,false);assert.equal(move.yielding,false);assert.deepEqual(move.target,Walking.ENTRY_POINT);}
    for(let i=1;i<move.path.length;i++){
      const a=move.path[i-1],b=move.path[i],pa=pixel(a),pb=pixel(b);
      assert.equal(Walking.legalPoint(a,own),true);assert.equal(Walking.legalPoint(b,own),true);assert.equal(Walking.OBSTACLES.some(r=>Scene.segmentHitsRect(a,b,r,.8)),false);
      for(const[id,p]of positions)if(id!==move.id){const r=Scene.actorBounds(p,{uniformScale:proof.scale,footprint:footprints.get(id)});assert.equal(Scene.segmentHitsRect(pa,pb,{x1:r.left-m.right*proof.scale-gap,x2:r.right+m.left*proof.scale+gap,y1:r.top-m.bottom*proof.scale-gap,y2:r.bottom+m.top*proof.scale+gap},0),false,'full body/nameplate swept clearance');}
      for(const r of Scene.CLOCK_RESERVED)assert.equal(Scene.segmentHitsRect(pa,pb,{x1:r.left-m.right*proof.scale-4,x2:r.right+m.left*proof.scale+4,y1:r.top-m.bottom*proof.scale-4,y2:r.bottom+m.top*proof.scale+4},0),false);
    }
    positions.set(move.id,point(move.target));
    if(finiteExitIds.has(move.id)){assert.deepEqual(positions.get(move.id),Walking.ENTRY_POINT);positions.delete(move.id);removed.push(move.id);}
  }
  assert.deepEqual(new Set(removed),finiteExitIds);assert.deepEqual(proof.removedIds,removed);
  for(const[id,p]of positions){assert.deepEqual(p,current.get(id),'a retained yielder returns to its actual old station');assert.deepEqual(proof.retainedPositions.get(id),p);}
  assert.equal(page.visible.length,input.length);assert.equal(page.seats.size,input.length);assert.equal(page.hidden,0,'a simulated exit never deletes a current real body');
}

test('twelve real mains retain their proven shared size while eight complete finite door exits',()=>{
  const f=fixture(),before=JSON.stringify([...f.current]);assert.equal(f.first.uniformScale,.4);
  const page=Walking.layoutWalking(f.input,{footprints:f.footprints,previousSeats:f.first.seats,currentPositions:f.current,immovableIds:f.finiteExitIds,finiteExitIds:f.finiteExitIds});
  assert.equal(page.uniformScale,.4,'finite retirement is not a permanently immovable twelve-person parking problem');
  assert.equal(page.proofMode,'deferred-main-exit');assert.equal(page.transitionDeferred,true);assert.equal(page.pathsById.size,0);assert.deepEqual(new Set(page.exitOwnerIds),f.finiteExitIds);
  auditExit(page,f);for(const[id,p]of page.seats)assert.deepEqual(point(p),point(f.first.seats.get(id)));assert.equal(JSON.stringify([...f.current]),before);
});

test('finite exit cache follows actual feet, owner cancellation, real locks and measured envelopes',()=>{
  const f=fixture(),opts={footprints:f.footprints,previousSeats:f.first.seats,currentPositions:f.current,immovableIds:f.finiteExitIds,finiteExitIds:f.finiteExitIds},page=Walking.layoutWalking(f.input,opts);
  const same=Walking.layoutWalking(f.input.slice().reverse(),{...opts,previousSeats:new Map([...page.seats].reverse())});assert.equal(same.cachedProof,true);assert.equal(same.exitProof,page.exitProof);
  const firstMove=page.exitProof.moves[0],moving=new Map(f.current);moving.set(firstMove.id,point(firstMove.path[1]));
  const changed=Walking.layoutWalking(f.input,{...opts,previousSeats:page.seats,currentPositions:moving});assert.equal(changed.cachedProof,false);assert.equal(changed.uniformScale,.4);auditExit(changed,{...f,current:moving});
  const cancelledIds=new Set(f.finiteExitIds);cancelledIds.delete(firstMove.id);
  const cancelled=Walking.layoutWalking(f.input,{...opts,previousSeats:page.seats,finiteExitIds:cancelledIds,immovableIds:cancelledIds});assert.equal(cancelled.cachedProof,false);assert.equal(cancelled.exitOwnerIds.includes(firstMove.id),false);assert.equal(cancelled.exitProof.removedIds.includes(firstMove.id),false);auditExit(cancelled,{...f,finiteExitIds:cancelledIds});
  const locked=new Set(f.input.map(s=>s.id)),lockedPage=Walking.layoutWalking(f.input,{...opts,previousSeats:page.seats,immovableIds:locked});assert.equal(lockedPage.cachedProof,false);assert.equal(lockedPage.uniformScale,.4);assert.ok(lockedPage.exitProof.moves.every(move=>f.finiteExitIds.has(move.id)),'a pinned retained body never receives a fake own goal or a temporary yield');auditExit(lockedPage,f);
  const larger=new Map(f.footprints);larger.set(f.input[0].id,{...larger.get(f.input[0].id),right:128});
  const measured=Walking.layoutWalking(f.input,{...opts,previousSeats:page.seats,footprints:larger});assert.equal(measured.cachedProof,false);auditExit(measured,{...f,footprints:larger});
  const requested=Walking.layoutWalking(f.input,{...opts,previousSeats:page.seats,requestedScale:1.35});assert.equal(requested.cachedProof,false);assert.equal(requested.uniformScale,.4);assert.equal(requested.targetUniformScale,.4,'finite owners do not inherit an ordinary cached target growth');auditExit(requested,f);
});

test('an actual main already at the exact door finishes its zero-step proof while nearby feet still require a real leg',()=>{
  const f=fixture(),id=[...f.finiteExitIds][0],current=new Map(f.current);current.set(id,{...Walking.ENTRY_POINT});
  const page=Walking.layoutWalking(f.input,{footprints:f.footprints,previousSeats:f.first.seats,currentPositions:current,immovableIds:f.finiteExitIds,finiteExitIds:f.finiteExitIds});
  assert.equal(page.uniformScale,.4);assert.equal(page.exitProof.steps[0].kind,'arrived');assert.equal(page.exitProof.steps[0].id,id);assert.ok(!page.exitProof.moves.some(move=>move.id===id));auditExit(page,{...f,current});
  const near=new Map(f.current);near.set(id,{x:86.9995,y:78});
  const notArrived=Walking.layoutWalking(f.input,{footprints:f.footprints,previousSeats:f.first.seats,currentPositions:near,immovableIds:f.finiteExitIds,finiteExitIds:f.finiteExitIds});
  assert.ok(notArrived.exitProof.moves.some(move=>move.id===id&&move.path.length>1),'near the portal is not an already completed real arrival');auditExit(notArrived,{...f,current:near});
});

test('a locked physical corner requires a genuinely proven smaller exit scale rather than blindly preserving the old size',()=>{
  const input=[{id:'main',provider:'codex',activity:'coding',status:'active'},{id:'retired',provider:'codex',activity:'planning',status:'active'}],footprints=new Map([['main',{left:117,right:123,top:122,bottom:94}],['retired',{left:116,right:124,top:121,bottom:93}]]),first=Walking.layoutWalking(input,{requestedScale:1.35,footprints}),current=new Map([['main',{x:69,y:483.76/7.2}],['retired',{x:32.2,y:43.5}]]),finiteExitIds=new Set(['retired']),immovableIds=new Set(input.map(s=>s.id));
  const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:Walking.legalPoint,route:Walking.route,gap:Walking.gapForScale,obstacles:Walking.OBSTACLES,reservedRects:Scene.CLOCK_RESERVED});traffic.sync(input.map(s=>({id:s.id,position:current.get(s.id),uniformScale:first.uniformScale,footprint:footprints.get(s.id),canYield:false})));traffic.request('retired',Walking.ENTRY_POINT);assert.equal(traffic.nextAny().kind,'wait');
  const page=Walking.layoutWalking(input,{requestedScale:1.35,footprints,previousSeats:first.seats,currentPositions:current,finiteExitIds,immovableIds});
  assert.ok(page.uniformScale>.5&&page.uniformScale<.65);assert.ok(page.exitProof.trials>1&&page.exitProof.trials<=12);auditExit(page,{input,footprints,current,finiteExitIds});
});

test('an unadmitted new main never becomes a phantom door blocker for a retiring main already at ENTRY',()=>{
  const old={...task(0,'coding'),status:'closed',closed:true},incoming=task(1,'reading'),footprints=new Map([old,incoming].map(s=>[s.id,{left:117,right:123,top:122,bottom:94}])),first=Walking.layoutWalking([{...old,status:'active',closed:false}],{footprints}),current=new Map([[old.id,{...Walking.ENTRY_POINT}]]),finiteExitIds=new Set([old.id]);
  const page=Walking.layoutWalking([old,incoming],{footprints,previousSeats:first.seats,currentPositions:current,finiteExitIds,immovableIds:finiteExitIds});
  assert.ok(page.exitProof);assert.equal(page.finiteExitDeferred,false);assert.deepEqual(page.exitProof.unadmittedIds,[incoming.id]);assert.deepEqual(page.exitProof.removedIds,[old.id]);assert.equal(page.exitProof.initialPositions.has(incoming.id),false);assert.equal(page.exitProof.retainedPositions.has(incoming.id),false);
  assert.equal(page.seats.has(incoming.id),true);assert.equal(page.visible.length,2,'the outside real identity stays present in the scene/entrance queue');auditExit(page,{input:[old,incoming],footprints,current,finiteExitIds});
  const after=Walking.layoutWalking([incoming],{footprints,previousSeats:page.seats,currentPositions:new Map()});assert.equal(after.exitProof,undefined);assert.equal(after.visible[0].id,incoming.id);assert.equal(after.seats.has(old.id),false);
});

test('an independent finite main exit keeps a simultaneous real clone return at the same revalidated shared scale',()=>{
  const input=[{id:'main',provider:'codex',activity:'coding',status:'active'},{id:'helper',provider:'codex',activity:'planning',status:'active',parentId:'main'},{id:'out',provider:'codex',activity:'testing',status:'active'}],f={left:117,right:123,top:122,bottom:94},footprints=new Map(input.map(s=>[s.id,f])),first=Walking.layoutWalking(input,{requestedScale:1.35,footprints}),current=new Map([...first.seats].map(([id,p])=>[id,point(p)]));
  current.set('main',{x:69,y:483.76/7.2});current.set('helper',{x:32.2,y:43.5});
  const changed=input.map(s=>s.id==='helper'?{...s,status:'closed',closed:true}:s),finiteExitIds=new Set(['out']),page=Walking.layoutWalking(changed,{requestedScale:1.35,footprints,previousSeats:first.seats,currentPositions:current,closingDockPairs:new Map([['helper','main']]),immovableIds:new Set(input.map(s=>s.id)),finiteExitIds});
  assert.equal(page.proofMode,'deferred-clone-return');assert.equal(page.returnProof.scale,page.uniformScale);assert.equal(page.returnProof.parentId,'main');assert.equal(page.returnProof.childId,'helper');assert.deepEqual(page.returnProof.target,current.get('main'));assert.ok(page.returnProof.moves.every(move=>move.id!=='main'));
  assert.deepEqual(page.exitProof.removedIds,['out']);auditExit(page,{input:changed,footprints,current,finiteExitIds});
});

test('the physical cast releases each actual exited main and restores the four survivors only after real removal',()=>{
  const f=fixture();let input=f.input,current=new Map(f.current),exits=new Set(f.finiteExitIds),previous=f.first.seats,page;
  while(exits.size){
    page=Walking.layoutWalking(input,{footprints:f.footprints,previousSeats:previous,currentPositions:current,finiteExitIds:exits,immovableIds:exits});
    assert.equal(page.uniformScale,.4);auditExit(page,{...f,input,current,finiteExitIds:exits});
    const done=page.exitProof.removedIds[0];assert.deepEqual(page.exitProof.moves.find(m=>m.id===done).target,Walking.ENTRY_POINT);
    // This simulates the renderer's actual arrival/remove event, never the
    // model pretending that all eight real bodies have already disappeared.
    current.delete(done);exits.delete(done);input=input.filter(s=>s.id!==done);previous=page.seats;
  }
  const remaining=Walking.layoutWalking(input,{footprints:f.footprints,previousSeats:previous,currentPositions:current});
  assert.equal(remaining.exitProof,undefined);assert.equal(remaining.finiteExitDeferred,undefined);assert.ok(remaining.targetUniformScale>.9);
  const arrived=Walking.layoutWalking(input,{footprints:f.footprints,previousSeats:remaining.seats,currentPositions:remaining.seats});assert.ok(arrived.uniformScale>.9);assert.equal(arrived.visible.length,4);
});

test('a truly immovable portal occupant prevents an invented finite-exit promise within one shared budget',()=>{
  const f=fixture(),input=f.input.map((s,i)=>i===0?{...s,status:'stale'}:s),current=new Map(f.current);current.set(input[0].id,{...Walking.ENTRY_POINT});
  const page=Walking.layoutWalking(input,{footprints:f.footprints,previousSeats:f.first.seats,currentPositions:current,finiteExitIds:f.finiteExitIds,immovableIds:new Set(input.map(s=>s.id))});
  assert.equal(page.exitProof,null);assert.equal(page.finiteExitDeferred,true);assert.ok(page.exitProofAttempts<=12,'failed old-layout and ordinary fallback searches share one global budget');assert.equal(page.fitReason,'waiting-for-exit-route');
  assert.deepEqual(point(page.seats.get(input[0].id)),Walking.ENTRY_POINT);assert.equal(page.visible.length,12);assert.equal(page.hidden,0);
});

test('closed helpers and their observed ancestor never become ordinary finite door exits',()=>{
  const input=[task(0,'planning'),{...task(1,'coding'),parentId:'codex:crowd-00'},task(2,'testing')],footprints=new Map(input.map(s=>[s.id,{left:117,right:123,top:122,bottom:94}])),first=Walking.layoutWalking(input,{footprints}),current=new Map([...first.seats].map(([id,p])=>[id,point(p)]));
  const changed=input.map((s,i)=>i===1?{...s,status:'closed',closed:true}:s),exits=new Set(input.map(s=>s.id));
  const page=Walking.layoutWalking(changed,{footprints,previousSeats:first.seats,currentPositions:current,finiteExitIds:exits,immovableIds:exits});
  assert.deepEqual(page.exitOwnerIds,[input[2].id]);assert.deepEqual(page.exitProof.removedIds,[input[2].id]);assert.ok(page.exitProof.moves.every(move=>move.id===input[2].id));
  assert.equal(page.visible.find(s=>s.id===input[1].id).parentId,input[0].id);assert.equal(page.visible.find(s=>s.id===input[1].id).closed,true);
  auditExit(page,{input:changed,footprints,current,finiteExitIds:new Set([input[2].id])});
});
