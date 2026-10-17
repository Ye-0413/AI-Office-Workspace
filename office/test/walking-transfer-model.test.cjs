'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Walking=require('../lib/walking-layout.js');
const Scene=require('../lib/scene-model.js');
function fixture(rename=i=>'agent-'+String(i).padStart(3,'0')){
  const input=Array.from({length:12},(_,i)=>({id:rename(i),sessionId:rename(i),provider:'codex',status:'active',activity:['reading','planning','coding','testing','idle','unknown'][i%6]}));
  input.push({id:rename(12),sessionId:rename(12),provider:'codex',status:'active',activity:'planning',parentId:rename(2)});
  const footprints=new Map(input.map(s=>[s.id,{left:116,right:122,top:121,bottom:93}]));
  const first=Walking.layoutWalking(input,{requestedScale:.65,footprints});
  const current=new Map([...first.seats].map(([id,p])=>[id,{x:p.x,y:p.y}]));
  const changed=input.map((s,i)=>i===0?{...s,activity:'coding'}:i===8?{...s,activity:'reading'}:s);
  return{input,changed,footprints,first,current,parent:rename(2),participants:[rename(0),rename(8)],options:{requestedScale:.65,footprints,previousSeats:first.seats,currentPositions:current,immovableIds:new Set([rename(2)]),fixedHoldingIds:new Set([rename(2)])}};
}
test('a fixed actual slot and a finite two-worker exchange retain the proved readable thirteen-body fit',()=>{
  const f=fixture(),page=Walking.layoutWalking(f.changed,f.options);
  assert.equal(page.uniformScale,.4,'a feasible finite exchange must not fall back to twelve-percent bodies');
  assert.equal(page.hidden,0);assert.equal(page.seats.size,13);
  assert.deepEqual({x:page.seats.get(f.parent).x,y:page.seats.get(f.parent).y},f.current.get(f.parent));
  assert.equal(page.transferCertificate?.kind,'two-slot-swap');
});
module.exports={fixture};

const Traffic=require('../lib/scene-traffic.js');
const xy=p=>({x:p.x,y:p.y});
const asPositions=seats=>new Map([...seats].map(([id,p])=>[id,xy(p)]));
// Independent continuous slab test; it checks the entire leg, rather than
// hoping frame samples happen to hit a crossing between full rectangles.
function cuts(a,b,r){
  let lo=0,hi=1;
  for(const [key,min,max]of [['x',r.left,r.right],['y',r.top,r.bottom]]){
    const d=b[key]-a[key];
    if(Math.abs(d)<1e-10){if(a[key]<min||a[key]>max)return false;continue;}
    const p=(min-a[key])/d,q=(max-a[key])/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
    if(lo>hi)return false;
  }
  return true;
}
function sweep(moves,positions,footprints,scale,{staged=new Set(),fixed=new Set(),participants=[]}={}){
  const gap=Walking.gapForScale(scale);
  for(const move of moves){
    assert.deepEqual(move.path[0],positions.get(move.id),'the full path begins at actual, never an inherited slot hint');
    assert.ok(!fixed.has(move.id),'fixed actual anchors have neither own nor temporary moves');
    assert.ok(!participants.includes(move.id)||!move.yielding,'a participant owns its finite intent and is not an incidental yielder');
    const f=footprints.get(move.id);
    for(let i=1;i<move.path.length;i++){
      const a=move.path[i-1],b=move.path[i],pa={x:a.x*12.8,y:a.y*7.2},pb={x:b.x*12.8,y:b.y*7.2};
      assert.ok(Walking.legalPoint(a,{uniformScale:scale,footprint:f}));assert.ok(Walking.legalPoint(b,{uniformScale:scale,footprint:f}));
      for(const obstacle of Scene.OBSTACLES)assert.equal(cuts(a,b,{left:obstacle.x1-.8,right:obstacle.x2+.8,top:obstacle.y1-.8,bottom:obstacle.y2+.8}),false,'foot sweep crosses furniture');
      for(const [other,p]of positions)if(other!==move.id&&!staged.has(other)){
        const r=Scene.actorBounds(p,{uniformScale:scale,footprint:footprints.get(other)});
        assert.equal(cuts(pa,pb,{left:r.left-f.right*scale-gap,right:r.right+f.left*scale+gap,top:r.top-f.bottom*scale-gap,bottom:r.bottom+f.top*scale+gap}),false,'complete asymmetric body/nameplate sweep overlaps '+other);
      }
      for(const r of Scene.CLOCK_RESERVED)assert.equal(cuts(pa,pb,{left:r.left-f.right*scale-4,right:r.right+f.left*scale+4,top:r.top-f.bottom*scale-4,bottom:r.bottom+f.top*scale+4}),false,'full motion covers the clock');
    }
    positions.set(move.id,xy(move.target));staged.delete(move.id);
  }
  return positions;
}
function audit(page,f){
  const cert=page.transferCertificate;
  assert.ok(cert);assert.equal(page.uniformScale,cert.scale);assert.equal(cert.version,1);
  assert.equal(page.pages,1);assert.equal(page.hidden,0);assert.equal(page.seats.size,f.changed.length);
  assert.equal(cert.steps.length,3);assert.equal(cert.participants.length,2);
  assert.ok(page.transferProofAttempts<=4);assert.ok(page.transferDrainCalls<=384);
  assert.deepEqual(cert.initialPositions.map(p=>[p.id,xy(p)]),[...f.current]);
  const positions=new Map(f.current),fixed=new Set([f.parent]);
  let step=0;
  for(const move of page.transitionProof.moves){
    sweep([move],positions,f.footprints,cert.scale,{fixed,participants:cert.participants});
    const expected=cert.steps[step]?.settledPositions;
    if(expected&&expected.every(p=>JSON.stringify(positions.get(p.id))===JSON.stringify(xy(p))))step++;
  }
  assert.equal(step,3,'each finite intent ends with every incidental yielder restored');
  assert.deepEqual(positions,asPositions(page.seats));
  assert.deepEqual(positions.get(f.parent),f.current.get(f.parent));
  for(const [id,p]of page.seats){
    assert.ok(p.fixedHolding||Walking.ZONE_AREAS[p.workZone].some(a=>p.x>=a.x1&&p.x<=a.x2&&p.y>=a.y1&&p.y<=a.y2));
    for(const [other,q]of page.seats)if(other!==id)assert.equal(Scene.actorsOverlap(p,{uniformScale:cert.scale,footprint:f.footprints.get(id)},q,{uniformScale:cert.scale,footprint:f.footprints.get(other)},page.gap),false);
  }
  // The target set also retains the original complete future access proof.
  // A held body's hypothetical later exit is not an authority to move it
  // during this finite transfer, where the fixed audit above forbids it.
  assert.equal(page.coordinatedProof.schedules.size,page.seats.size);
  let futureMoves=0;
  for(const [id,schedule]of page.coordinatedProof.schedules){
    const pos=asPositions(page.seats);
    sweep(schedule.exit,pos,f.footprints,cert.scale);assert.deepEqual(pos.get(id),Walking.ENTRY_POINT);
    sweep(schedule.enter,pos,f.footprints,cert.scale,{staged:new Set([id])});assert.deepEqual(pos,asPositions(page.seats));
    futureMoves+=schedule.exit.length+schedule.enter.length;
  }
  assert.ok(futureMoves>=page.seats.size*2);
  const sizes=new Map(f.footprints),pos=asPositions(page.seats),probe=page.coordinatedProof.holdingActorId;sizes.set(probe,page.envelope);pos.set(probe,Walking.ENTRY_POINT);
  sweep(page.coordinatedProof.holdingMoves,pos,sizes,cert.scale,{staged:new Set([probe])});
  assert.deepEqual(pos.get(probe),page.coordinatedProof.holdingPoint);
  return futureMoves;
}
test('certificate is deeply immutable plain data and all seven physical legs plus final access pass independent continuous audit',()=>{
  const f=fixture(),page=Walking.layoutWalking(f.changed,f.options);
  assert.equal(page.transitionProof.moves.length,7);assert.equal(audit(page,f),42);
  const check=value=>{if(value&&typeof value==='object'){assert.ok(!(value instanceof Map)&&!(value instanceof Set));assert.ok(Object.isFrozen(value));for(const child of Object.values(value))check(child);}};check(page.transferCertificate);
  assert.throws(()=>{page.transferCertificate.steps[0].target.x=999;},TypeError);
});
test('the three destination intents replay through public production Traffic including cooperative quantum and exact phase endpoints',()=>{
  const f=fixture(),page=Walking.layoutWalking(f.changed,f.options),cert=page.transferCertificate;
  const actors=new Map([...f.current].map(([id,p])=>[id,{id,position:xy(p),uniformScale:cert.scale,footprint:f.footprints.get(id),canYield:!cert.participants.includes(id)&&id!==f.parent}]));
  const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:Walking.legalPoint,route:Walking.route,gap:Walking.gapForScale,obstacles:Walking.OBSTACLES,reservedRects:Scene.CLOCK_RESERVED,holdingPoints:page.holdingPoints,maxConcurrent:4,yieldBatchSize:1});
  const sync=()=>traffic.sync([...actors.values()]);sync();
  for(const step of cert.steps){
    assert.ok(traffic.request(step.id,step.target));let done=false;
    for(let i=0;i<128;i++){
      const move=traffic.nextAny();if(move.kind==='wait'&&move.reason==='searching')continue;
      if(move.kind==='idle'){done=true;break;}if(move.kind==='arrived')continue;assert.equal(move.kind,'move');
      const pos=new Map([...actors].map(([id,a])=>[id,xy(a.position)]));sweep([move],pos,f.footprints,cert.scale,{fixed:new Set([f.parent]),participants:cert.participants});
      actors.get(move.id).position=xy(move.target);assert.ok(traffic.finish(move.id,move.token,move.target));sync();
    }
    assert.ok(done,'an intent and its yielding returns have a finite drain');
    for(const p of step.settledPositions)assert.deepEqual(actors.get(p.id).position,xy(p));
  }
  for(const p of cert.finalTargets)assert.deepEqual(actors.get(p.id).position,xy(p));
});
function relabel(f,rename){
  const ids=new Map(f.input.map((s,i)=>[s.id,rename(i)])),session=s=>({...s,id:ids.get(s.id),sessionId:ids.get(s.id),...(s.parentId?{parentId:ids.get(s.parentId)}:{})});
  const map=m=>new Map([...m].map(([id,p])=>[ids.get(id),{...p}]));
  return{...f,input:f.input.map(session),changed:f.changed.map(session),parent:ids.get(f.parent),participants:f.participants.map(id=>ids.get(id)),current:map(f.current),footprints:map(f.footprints),options:{...f.options,previousSeats:map(f.first.seats),currentPositions:map(f.current),footprints:map(f.footprints),immovableIds:new Set([ids.get(f.parent)]),fixedHoldingIds:new Set([ids.get(f.parent)])}};
}
test('slot ownership and two-order search work independently of actor IDs/input order and in both directions',()=>{
  for(const rename of [i=>'worker-'+String(100-i),i=>'cast-'+String((i*5)%13).padStart(2,'0')]){
    const f=relabel(fixture(),rename),page=Walking.layoutWalking([...f.changed].reverse(),f.options);assert.equal(page.uniformScale,.4);audit(page,{...f,current:new Map([...f.current].sort(([a],[b])=>a.localeCompare(b)))});
    const backwards={...f,changed:f.input,current:asPositions(page.seats)};
    const restored=Walking.layoutWalking(f.input,{...f.options,previousSeats:page.seats,currentPositions:backwards.current});assert.equal(restored.uniformScale,.4);audit(restored,{...backwards,current:new Map([...backwards.current].sort(([a],[b])=>a.localeCompare(b)))});
  }
});
test('execution permission and participant eligibility cannot reuse a certificate from a copied target map',()=>{
  const f=fixture(),page=Walking.layoutWalking(f.changed,f.options),previous=new Map(page.seats);
  for(const extra of [{allowTransfers:false},{transferEligibleIds:new Set([f.participants[0]])},{immovableIds:new Set([f.parent,f.participants[0]])},{fixedHoldingIds:new Set([f.parent,f.participants[0]])}]){
    const result=Walking.layoutWalking(f.changed,{...f.options,previousSeats:previous,...extra});assert.equal(result.transferCertificate,null);assert.ok(result.uniformScale<.4);
  }
});
test('a stale participant is never assigned a fictitious finite own move',()=>{
  const f=fixture(),changed=f.changed.map(s=>s.id===f.participants[0]?{...s,status:'stale'}:s),page=Walking.layoutWalking(changed,f.options);
  assert.equal(page.transferCertificate,null);assert.deepEqual(xy(page.seats.get(f.participants[0])),f.current.get(f.participants[0]));
  assert.ok(!page.transitionProof?.moves.some(m=>m.id===f.participants[0]));
});
test('actual feet, measured bounds, fixed ownership, ancestry and new turn invalidate the source rather than replaying old proof',()=>{
  const f=fixture(),page=Walking.layoutWalking(f.changed,f.options),previous=new Map(page.seats),key=page.transferCertificate.sourceKey;
  const feet=new Map(f.current);feet.set(f.participants[0],{...feet.get(f.participants[0]),x:feet.get(f.participants[0]).x+.01});
  const sizes=new Map(f.footprints);sizes.set(f.participants[0],{...sizes.get(f.participants[0]),left:118});
  for(const [sessions,extra]of [[f.changed,{currentPositions:feet}],[f.changed,{footprints:sizes}],[f.changed,{fixedHoldingIds:new Set()}],[f.changed.map(s=>s.id===f.participants[0]?{...s,turnId:'fresh-turn'}:s),{}],[f.changed.map(s=>s.id===f.parent?{...s,parentId:f.participants[1]}:s),{}]]){
    const result=Walking.layoutWalking(sessions,{...f.options,previousSeats:previous,...extra});
    assert.ok(!result.transferCertificate||result.transferCertificate.sourceKey!==key);
    assert.ok(result.transferProofAttempts<=4);assert.ok(result.transferDrainCalls<=384);
  }
});
test('pending admission and finite clone/exit owners cannot be absorbed into an unproved swap schedule',()=>{
  const f=fixture();
  const missing=new Map(f.current);missing.delete(f.input.at(-1).id);
  for(const extra of [{currentPositions:missing},{openingDockPairs:new Map([[f.input.at(-1).id,f.parent]])},{closingDockPairs:new Map([[f.input.at(-1).id,f.parent]])},{finiteExitIds:new Set([f.participants[0]])},{openingBusyIds:new Set([f.participants[0]])}]){
    const page=Walking.layoutWalking(f.changed,{...f.options,...extra});assert.equal(page.transferCertificate,null);
  }
});
test('occupied verified pocket, incompatible hints and enlarged footprints retain honest safe fallback',()=>{
  const f=fixture(),pocket=f.first.holdingPoints[0],current=new Map(f.current),stale=f.input[10].id;
  current.set(stale,xy(pocket));
  const sessions=f.changed.map(s=>s.id===stale?{...s,status:'stale'}:s);
  const blocked=Walking.layoutWalking(sessions,{...f.options,currentPositions:current});assert.equal(blocked.transferCertificate,null);assert.deepEqual(xy(blocked.seats.get(stale)),xy(pocket));
  const sizes=new Map(f.footprints);sizes.set(f.participants[0],{left:180,right:185,top:170,bottom:130});
  const large=Walking.layoutWalking(f.changed,{...f.options,footprints:sizes});assert.equal(large.transferCertificate,null);assert.ok(large.uniformScale<.4);
  const hints=new Map(f.first.seats);hints.set(f.input[6].id,{...hints.get(f.input[6].id),x:93,workZone:'library'});
  const invalid=Walking.layoutWalking(f.changed,{...f.options,slotHints:hints});assert.notEqual(invalid.seats.get(f.input[6].id).x,93,'invalid library hint cannot claim a bench location');
});
test('no transfer path expands the existing thirteen-distribution cutoff',()=>{
  for(const count of [14,16]){
    const f=fixture(),extra=Array.from({length:count-13},(_,i)=>({id:'extra-'+i,sessionId:'extra-'+i,provider:'codex',activity:'planning',status:'active'}));
    const page=Walking.layoutWalking(f.changed.concat(extra),f.options);assert.equal(page.transferCertificate,null);assert.equal(page.seats.size,count);assert.equal(page.hidden,0);assert.equal(page.transferProofAttempts,0);
  }
});

test('unchanged source reuses its certificate, metadata is inert, and copied slot hints/targets cannot smuggle stale geometry',()=>{
  const f=fixture(),before=JSON.stringify({input:f.input,changed:f.changed,current:[...f.current],previous:[...f.first.seats],sizes:[...f.footprints]}),page=Walking.layoutWalking(f.changed,f.options);
  const warm=Walking.layoutWalking([...f.changed].reverse().map(s=>({...s,title:'new label',lastEventAt:9000})),{...f.options,previousSeats:new Map(page.seats)});
  assert.equal(warm.cachedProof,true);assert.equal(warm.transferCertificate,page.transferCertificate);assert.equal(warm.seats,page.seats);
  const disabled=Walking.layoutWalking(f.changed,{...f.options,previousSeats:warm.seats,allowTransfers:false});assert.equal(disabled.transferCertificate,null);assert.ok(disabled.uniformScale<.4);
  const hints=new Map([...f.first.seats].map(([id,p])=>[id,{...p}]));hints.set(f.parent,{...hints.get(f.parent),x:55});
  const copied=Walking.layoutWalking(f.changed,{...f.options,slotHints:hints});assert.deepEqual(xy(copied.seats.get(f.parent)),f.current.get(f.parent),'actual fixed claim wins over a copied hint');
  const modified=new Map(page.seats);modified.set(f.parent,{...modified.get(f.parent),x:41});
  const retry=Walking.layoutWalking(f.changed,{...f.options,previousSeats:modified});assert.equal(retry.cachedProof,false);assert.deepEqual(xy(retry.seats.get(f.parent)),f.current.get(f.parent));
  assert.equal(JSON.stringify({input:f.input,changed:f.changed,current:[...f.current],previous:[...f.first.seats],sizes:[...f.footprints]}),before,'proof and hint copies do not mutate observed input or actual maps');
});
test('finite clone/exit ownership cannot inherit an already cached transfer certificate',()=>{
  const f=fixture(),page=Walking.layoutWalking(f.changed,f.options);
  for(const extra of [{closingDockPairs:new Map([[f.input.at(-1).id,f.parent]]),immovableIds:new Set([f.parent,f.input.at(-1).id])},{finiteExitIds:new Set([f.participants[0]])}]){
    const result=Walking.layoutWalking(f.changed,{...f.options,previousSeats:page.seats,...extra});assert.equal(result.transferCertificate,null);
  }
});

test('clearing a real busy owner invalidates a cached rejection and re-proves the same actual cast with copied legal slot hints',()=>{
  const f=fixture(),slotHints=new Map([...f.first.seats].map(([id,p])=>[id,{...p}]));
  const disabledBusy=Walking.layoutWalking(f.changed,{...f.options,allowTransfers:false,openingBusyIds:new Set([f.input[6].id])});
  const disabledIdle=Walking.layoutWalking(f.changed,{...f.options,allowTransfers:false,previousSeats:disabledBusy.seats,openingBusyIds:new Set()});
  assert.equal(disabledIdle.cachedProof,true,'unrelated ordinary cache scope must not expand when transfers are explicitly disabled');
  const noHintBusy=Walking.layoutWalking(f.changed,{...f.options,openingBusyIds:new Set([f.input[6].id])});
  const noHintCleared=Walking.layoutWalking(f.changed,{...f.options,previousSeats:noHintBusy.seats,openingBusyIds:new Set()});
  const unprovenCopy=new Map([...noHintBusy.seats].map(([id,p])=>[id,{...p}]));
  const coldSameInput=Walking.layoutWalking(f.changed,{...f.options,previousSeats:unprovenCopy,openingBusyIds:new Set()});
  assert.equal(noHintCleared.cachedProof,false,'a negative cache cannot ignore the cleared physical owner');
  // The existing target-only recovery branch depends on whether a previous
  // Map has real proof provenance, so its safe fallback need not select the
  // identical sub-pixel binary-search scale as an unproved copy. Neither
  // result is entitled to invent the lost original slot assignment.
  assert.ok(noHintCleared.uniformScale<.4&&coldSameInput.uniformScale<.4);
  assert.equal(noHintCleared.hidden,coldSameInput.hidden);
  assert.deepEqual(noHintCleared.transferCertificate,coldSameInput.transferCertificate);
  assert.deepEqual(xy(noHintCleared.seats.get(f.parent)),f.current.get(f.parent));
  const busy=Walking.layoutWalking(f.changed,{...f.options,slotHints,openingBusyIds:new Set([f.input[6].id])});
  assert.equal(busy.transferCertificate,null);assert.ok(busy.uniformScale<.4);
  const cleared=Walking.layoutWalking(f.changed,{...f.options,slotHints,previousSeats:new Map(busy.seats),openingBusyIds:new Set()});
  assert.equal(cleared.cachedProof,false,'busy ownership is a dependency of negative transfer evidence even without an opening dock');
  assert.equal(cleared.uniformScale,.4);audit(cleared,f);
  const warm=Walking.layoutWalking(f.changed,{...f.options,slotHints,previousSeats:cleared.seats,openingBusyIds:new Set()});
  assert.equal(warm.cachedProof,true);assert.equal(warm.transferCertificate,cleared.transferCertificate);
});
