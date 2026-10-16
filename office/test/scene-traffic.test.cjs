'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Scene = require('../lib/scene-model.js');
const Traffic = require('../lib/scene-traffic.js');

// Pixel bounds use the same affine depth transform as production geometry.
function bounds(p, actor = {}) {
  const scale = (.76 + p.y / 500) * (actor.helper ? .84 : 1) * (actor.scale || 1);
  return { left: p.x * 12.8 - 48 * scale, right: p.x * 12.8 + 48 * scale,
    top: p.y * 7.2 - 70 * scale, bottom: p.y * 7.2 + 30 * scale };
}
function legalPoint(p, actor) {
  const b = bounds(p, actor);
  return b.left >= 0 && b.right <= 1280 && b.top >= 0 && b.bottom <= 720;
}
function coordinator(extra = {}) {
  return Traffic.createCoordinator({ bounds, legalPoint, route: (a, b) => [a, b], obstacles: [], ...extra });
}
const actor = (id, x, y = 65, extra = {}) => ({ id, position: { x, y }, scale: 1, ...extra });
function overlap(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
function verifyPath(plan, mover, others, furniture = []) {
  assert.equal(plan.kind, 'move');
  for (let i = 1; i < plan.path.length; i += 1) {
    const a = plan.path[i - 1], b = plan.path[i];
    for (const obstacle of furniture) assert.equal(Scene.segmentHitsRect(a, b, obstacle, .79), false);
    for (let step = 0; step <= 400; step += 1) {
      const p = { x: a.x + (b.x - a.x) * step / 400, y: a.y + (b.y - a.y) * step / 400 };
      for (const other of others) assert.equal(overlap(bounds(p, mover), bounds(other.position, other)), false,
        `collision ${mover.id}/${other.id} at ${JSON.stringify(p)}`);
    }
  }
}
test('stationary bodies and their full name-tag envelopes cause a real detour', () => {
  const traffic = coordinator(), a = actor('a', 15), b = actor('b', 50);
  traffic.sync([a, b]); assert.equal(traffic.request('a', { x: 85, y: 65 }), true);
  const plan = traffic.next('a');
  assert.ok(plan.path.length > 2); verifyPath(plan, a, [b]);
});

test('traffic retains each measured CSS footprint and replans when a label grows', () => {
  const small={left:30,right:30,top:45,bottom:20}, large={left:200,right:200,top:110,bottom:90};
  const a=actor('measured-mover',15,80,{footprint:small}), b=actor('measured-blocker',50,65,{footprint:small});
  const traffic=coordinator({bounds:Scene.actorBounds,legalPoint:()=>true});
  traffic.sync([a,b]);traffic.request(a.id,{x:85,y:80});
  let plan=traffic.next(a.id);assert.equal(plan.kind,'move');assert.equal(plan.path.length,2);
  traffic.cancel(a.id,a.position);b.footprint=large;
  traffic.sync([a,b]);traffic.request(a.id,{x:85,y:80});plan=traffic.next(a.id);
  assert.equal(plan.kind,'move');assert.ok(plan.path.length>2,'a larger measured tag must invalidate the straight path');
  for(let leg=1;leg<plan.path.length;leg++) for(let step=0;step<=200;step++) {
    const from=plan.path[leg-1],to=plan.path[leg],point={x:from.x+(to.x-from.x)*step/200,y:from.y+(to.y-from.y)*step/200};
    assert.equal(Scene.actorsOverlap(point,a,b.position,b,8),false);
  }
});

test('a normal entrance-side new main walks past the same three mixed-station bodies at 100 and 135 percent', () => {
  for(const scale of [1,1.35]) {
    const sessions=['coding','testing','reading','coding'].map((activity,index)=>({id:['myth-0','myth-1','myth-2','new-arrival'][index],activity}));
    const footprint={left:83,right:83,top:135,bottom:77},entry={x:87,y:78};
    const options={scale,entryIds:new Set(['new-arrival']),footprints:new Map(sessions.map(session=>[session.id,footprint])),reservedRects:Scene.CLOCK_RESERVED.concat(Scene.actorReservation(entry,{scale,footprint}))};
    const page=Scene.pageSessions(sessions,Scene.ALL_ROOMS,0,'',options);
    const actors=sessions.map(session=>({id:session.id,position:session.id==='new-arrival'?entry:page.seats.get(session.id),scale,footprint}));
    const traffic=Traffic.createCoordinator({gap:Scene.ACTOR_GAP,reservedRects:Scene.CLOCK_RESERVED,legalPoint:(p,a)=>Scene.legalActorPoint(p,{...a,reservedRects:Scene.CLOCK_RESERVED})});
    traffic.sync(actors);traffic.request('new-arrival',page.seats.get('new-arrival'));
    const plan=traffic.nextAny();assert.equal(plan.kind,'move');assert.equal(plan.id,'new-arrival');assert.ok(plan.path.length>=2);assert.equal(plan.instant,false);
    for(let leg=1;leg<plan.path.length;leg++)for(let step=0;step<=300;step++) {
      const from=plan.path[leg-1],to=plan.path[leg],point={x:from.x+(to.x-from.x)*step/300,y:from.y+(to.y-from.y)*step/300};
      assert.equal(Scene.legalActorPoint(point,{scale,footprint,reservedRects:Scene.CLOCK_RESERVED}),true);
      for(const other of actors.filter(actor=>actor.id!=='new-arrival'))assert.equal(Scene.actorsOverlap(point,{scale,footprint},other.position,other,Scene.ACTOR_GAP),false);
    }
    assert.equal(traffic.finish(plan.id,plan.token,plan.target),true);assert.equal(traffic.state().queued,0);
  }
});

test('a staged main stays outside while a real worker vacates the doorway, then enters and lets the worker return safely', () => {
  const footprint={left:83,right:83,top:135,bottom:74},scale=1.35;
  const actors=[actor('r0',70.02534375,78,{scale,footprint}),actor('r1',32,46.5,{scale,footprint}),actor('r2',87,78,{scale,footprint,staged:true,canYield:false})];
  const traffic=Traffic.createCoordinator({gap:Scene.ACTOR_GAP,reservedRects:Scene.CLOCK_RESERVED,legalPoint:(p,a)=>Scene.legalActorPoint(p,{...a,reservedRects:Scene.CLOCK_RESERVED})});
  traffic.sync(actors);traffic.request('r2',{x:49.8716640625,y:46.5});
  const order=[];let crossedFutureDoor=false;
  for(let attempt=0;attempt<6&&traffic.state().queued;attempt++) {
    const plan=traffic.nextAny();assert.equal(plan.kind,'move');order.push(plan.id);
    const mover=actors.find(actor=>actor.id===plan.id);if(plan.staged){assert.equal(plan.id,'r2');mover.staged=false;}
    for(let leg=1;leg<plan.path.length;leg++)for(let step=0;step<=300;step++) {
      const a=plan.path[leg-1],b=plan.path[leg],p={x:a.x+(b.x-a.x)*step/300,y:a.y+(b.y-a.y)*step/300};
      assert.equal(Scene.legalActorPoint(p,{...mover,reservedRects:Scene.CLOCK_RESERVED}),true);
      for(const other of actors.filter(actor=>actor.id!==mover.id)) {
        const overlap=Scene.actorsOverlap(p,mover,other.position,other,Scene.ACTOR_GAP);
        if(other.staged)crossedFutureDoor=crossedFutureDoor||overlap;else assert.equal(overlap,false,'every actually visible body keeps its complete clearance');
      }
    }
    mover.position=plan.target;traffic.finish(plan.id,plan.token,plan.target);traffic.sync(actors);
  }
  assert.deepEqual(order,['r0','r2','r0']);assert.equal(crossedFutureDoor,true,'the invisible future doorway body was the actual obstruction');
  assert.equal(traffic.state().queued,0);assert.deepEqual(actors[0].position,{x:70.02534375,y:78});assert.deepEqual(actors[2].position,{x:49.8716640625,y:46.5});
});

test('cancelling a staged newcomer preserves a safe real worker return and never schedules the cancelled body', () => {
  const footprint={left:83,right:83,top:135,bottom:74},scale=1.35;
  const actors=[actor('r0',70.02534375,78,{scale,footprint}),actor('r1',32,46.5,{scale,footprint}),actor('r2',87,78,{scale,footprint,staged:true,canYield:false})];
  const traffic=Traffic.createCoordinator({gap:Scene.ACTOR_GAP,reservedRects:Scene.CLOCK_RESERVED,legalPoint:(p,a)=>Scene.legalActorPoint(p,{...a,reservedRects:Scene.CLOCK_RESERVED})});
  traffic.sync(actors);traffic.request('r2',{x:49.8716640625,y:46.5});const outgoing=traffic.nextAny();assert.equal(outgoing.id,'r0');
  actors[0].position=outgoing.target;traffic.finish('r0',outgoing.token,outgoing.target);
  traffic.cancel('r2');traffic.sync(actors.slice(0,2));const back=traffic.nextAny();assert.equal(back.kind,'move');assert.equal(back.id,'r0');
  assert.equal(traffic.finish('r0',back.token,back.target),true);assert.equal(traffic.state().queued,0);assert.equal(traffic.nextAny().kind,'idle');
});
test('an unobstructed body-only lane still detours around a name tag below another actor', () => {
  const traffic = coordinator(), a = actor('a', 15, 75), b = actor('b', 50, 65);
  const middle = bounds({ x: 50, y: 75 }, a), blocker = bounds(b.position, b);
  assert.ok(middle.top > b.position.y * 7.2, 'the stationary body itself is above the moving body');
  assert.ok(middle.top < blocker.bottom, 'its name tag still occupies this lane');
  traffic.sync([a, b]); traffic.request('a', { x: 85, y: 75 });
  const plan = traffic.next('a'); assert.ok(plan.path.length > 2); verifyPath(plan, a, [b]);
});
test('crossing travel is serialized and the next route avoids the first actual settled body', () => {
  const traffic = coordinator(), a = actor('a', 15, 50), b = actor('b', 50, 30);
  traffic.sync([b, a]); traffic.request('a', { x: 85, y: 50 }); traffic.request('b', { x: 50, y: 85 });
  assert.deepEqual(traffic.next('b'), { kind: 'wait', reason: 'queued', by: 'a' });
  const first = traffic.next('a'); verifyPath(first, a, [b]);
  assert.deepEqual(traffic.next('b'), { kind: 'wait', reason: 'reserved', by: 'a' });
  assert.equal(traffic.finish('a', first.token, first.target), true); a.position = first.target;
  const second = traffic.next('b'); verifyPath(second, b, [a]);
  assert.equal(traffic.finish('b', second.token), true); assert.equal(traffic.state().queued, 0);
});
test('two actors swapping destinations vacate a deterministic holding spot, then both arrive', () => {
  function run(order) {
    const traffic = coordinator(), a = actor('a', 20), b = actor('b', 80), actors = [a, b];
    traffic.sync(order === 'reverse' ? [b, a] : actors);
    traffic.request('a', { ...b.position }); traffic.request('b', { ...a.position });
    const plans = [];
    for (let attempt = 0; attempt < 10 && traffic.state().queued; attempt += 1) for (const mover of actors) {
      const plan = traffic.next(mover.id);
      if (plan.kind !== 'move') continue;
      verifyPath(plan, mover, actors.filter(other => other !== mover)); plans.push({ id: mover.id, path: plan.path, temporary: plan.temporary });
      mover.position = plan.target; assert.equal(traffic.finish(mover.id, plan.token, mover.position), true);
      traffic.sync(actors);
    }
    assert.equal(traffic.state().queued, 0); assert.deepEqual(a.position, { x: 80, y: 65 }); assert.deepEqual(b.position, { x: 20, y: 65 });
    assert.equal(plans[0].temporary, true); assert.equal(plans.length, 3);
    return plans;
  }
  assert.deepEqual(run('forward'), run('reverse'));
});
test('cancellation uses the real interrupted position and rejects a stale completion token', () => {
  const traffic = coordinator(), a = actor('a', 15), b = actor('b', 85);
  traffic.sync([a, b]); traffic.request('a', { x: 50, y: 65 }); const first = traffic.next('a');
  assert.equal(traffic.request('a', { x: 15, y: 40 }), false);
  const interrupted = { x: 35, y: 65 }; assert.equal(traffic.cancel('a', interrupted), true);
  assert.equal(traffic.finish('a', first.token, first.target), false);
  traffic.request('b', { x: 15, y: 65 }); const second = traffic.next('b');
  verifyPath(second, b, [{ ...a, position: interrupted }]);
  traffic.clear(); assert.equal(traffic.state().queued, 0); assert.equal(traffic.state().active, null);
  assert.equal(traffic.finish('b', second.token), false);
});
test('instant reduced/hidden settlement still waits for an occupied destination', () => {
  const traffic = coordinator(), a = actor('a', 15), b = actor('b', 85);
  traffic.sync([a, b]); traffic.request('a', { ...b.position }, { instant: true });
  assert.equal(traffic.next('a').kind, 'wait');
  traffic.cancel('a'); traffic.request('a', { x: 50, y: 65 }, { instant: true });
  const plan = traffic.next('a'); assert.equal(plan.kind, 'move'); assert.equal(plan.instant, true);
  assert.equal(traffic.finish('a', plan.token), true);
});
test('explicit clone endpoint coincidence exempts only that parent and still avoids third parties', () => {
  const traffic = coordinator(), child = actor('child', 15), parent = actor('parent', 15), third = actor('third', 50);
  traffic.sync([parent, child, third]); traffic.request('child', { x: 85, y: 65 }, { overlapIds: ['parent'] });
  const plan = traffic.next('child'); verifyPath(plan, child, [third]);
  assert.equal(traffic.finish('child', plan.token), true); child.position = plan.target;
  traffic.request('child', { ...parent.position }, { overlapIds: ['parent'] });
  const back = traffic.next('child'); assert.equal(back.kind, 'move'); verifyPath(back, child, [third]);
});
test('body scale and helper geometry are honored over the supported size range', () => {
  for (const scale of [.65, 1, 1.35]) for (const helper of [false, true]) {
    const traffic = coordinator(), a = actor('a', 15, 65, { scale, helper }), b = actor('b', 50, 65, { scale: 1.35 });
    traffic.sync([a, b]); traffic.request('a', { x: 85, y: 65 }); verifyPath(traffic.next('a'), a, [b]);
  }
});
test('routes retain furniture foot clearance while detouring around other actors', () => {
  const obstacle = { x1: 40, x2: 60, y1: 48, y2: 72 };
  const traffic = coordinator({ obstacles: [obstacle] }), a = actor('a', 15), b = actor('b', 50, 40);
  traffic.sync([a, b]); traffic.request('a', { x: 85, y: 65 }); const plan = traffic.next('a');
  verifyPath(plan, a, [b], [obstacle]);
});
test('bounded queues and removed actors never retain a movement reservation', () => {
  const traffic = coordinator({ limit: 2 }), a = actor('a', 15), b = actor('b', 85);
  assert.equal(traffic.sync([a, b]), true); assert.equal(traffic.request('missing', { x: 50, y: 65 }), false);
  traffic.request('a', { x: 50, y: 65 }); const plan = traffic.next('a');
  traffic.sync([b]); assert.equal(traffic.state().active, null); assert.equal(traffic.state().queued, 0);
  assert.equal(traffic.finish('a', plan.token), false);
  assert.equal(traffic.sync([a, b, actor('c', 50)]), false);
  assert.equal(traffic.next('b').reason, 'invalid-scene');
});
test('actual shared geometry completes a two-actor swap at all supported scale stops', () => {
  for (const scale of [.65, 1, 1.35]) {
    const traffic = Traffic.createCoordinator(), movers = [actor('a', 20, 43, { scale }), actor('b', 80, 43, { scale })];
    traffic.sync(movers); traffic.request('a', movers[1].position); traffic.request('b', movers[0].position);
    let legs = 0;
    for (let round = 0; round < 5 && traffic.state().queued; round += 1) for (const mover of movers) {
      const plan = traffic.next(mover.id); if (plan.kind !== 'move') continue;
      for (let i = 1; i < plan.path.length; i += 1) for (let step = 0; step <= 100; step += 1) {
        const from = plan.path[i - 1], to = plan.path[i], p = { x: from.x + (to.x - from.x) * step / 100, y: from.y + (to.y - from.y) * step / 100 };
        assert.equal(Scene.legalActorPoint(p, mover), true);
        for (const other of movers) if (other !== mover) assert.equal(Scene.actorsOverlap(p, mover, other.position, other, 0), false);
      }
      mover.position = plan.target; traffic.finish(mover.id, plan.token); traffic.sync(movers); legs += 1;
    }
    assert.equal(traffic.state().queued, 0, `swap must finish at scale ${scale}`); assert.equal(legs, 3);
  }
});
test('a reserved visual clock rectangle is avoided along the whole path', () => {
  const reserved = { left: 520, top: 250, right: 760, bottom: 330 };
  const traffic = coordinator({ reservedRects: [reserved] }), mover = actor('a', 15, 50);
  traffic.sync([mover]); traffic.request('a', { x: 85, y: 50 }); const plan = traffic.next('a');
  assert.equal(plan.kind, 'move'); assert.ok(plan.path.length > 2);
  for (let i = 1; i < plan.path.length; i += 1) for (let step = 0; step <= 200; step += 1) {
    const a = plan.path[i - 1], b = plan.path[i], p = { x: a.x + (b.x - a.x) * step / 200, y: a.y + (b.y - a.y) * step / 200 };
    assert.equal(overlap(bounds(p, mover), reserved), false); assert.equal(legalPoint(p, mover), true);
  }
});
test('a proven stationary doorway blocker yields, newcomer walks in, then blocker returns to its real station', () => {
  const reservedRects = Scene.CLOCK_RESERVED;
  function run(reverse) {
    const traffic = Traffic.createCoordinator({ reservedRects, gap: Scene.ACTOR_GAP,
      legalPoint: (p, a) => Scene.legalActorPoint(p, { ...a, reservedRects }) });
    const bodies = [actor('A', 60, 72), actor('B', 81, 45), actor('C', 30, 46), actor('D', 87, 78)];
    const original = new Map(bodies.map(a => [a.id, { ...a.position }]));
    traffic.sync(reverse ? bodies.slice().reverse() : bodies);
    traffic.request('D', { x: 28, y: 81 });
    const plans = [];
    for (let i = 0; i < 6; i += 1) {
      const plan = traffic.nextAny(); if (plan.kind === 'idle') break;
      assert.equal(plan.kind, 'move'); const moving = bodies.find(a => a.id === plan.id);
      plans.push(plan);
      for (let leg = 1; leg < plan.path.length; leg += 1) for (let step = 0; step <= 200; step += 1) {
        const a = plan.path[leg - 1], b = plan.path[leg], p = { x: a.x + (b.x - a.x) * step / 200, y: a.y + (b.y - a.y) * step / 200 };
        assert.equal(Scene.legalActorPoint(p, { ...moving, reservedRects }), true);
        for (const other of bodies) if (other !== moving) assert.equal(Scene.actorsOverlap(p, moving, other.position, other, Scene.ACTOR_GAP - .01), false);
      }
      assert.equal(traffic.nextAny().reason, 'reserved');
      moving.position = plan.target; assert.equal(traffic.finish(plan.id, plan.token, moving.position), true); traffic.sync(bodies);
    }
    assert.deepEqual(plans.map(p => [p.id, p.yielding, p.temporary]), [['A', true, true], ['D', false, false], ['A', true, false]]);
    assert.deepEqual(bodies.find(a => a.id === 'D').position, { x: 28, y: 81 });
    for (const id of ['A', 'B', 'C']) assert.deepEqual(bodies.find(a => a.id === id).position, original.get(id));
    assert.equal(traffic.state().queued, 0); assert.equal(traffic.nextAny().kind, 'idle');
    return plans.map(p => ({ id: p.id, path: p.path, temporary: p.temporary }));
  }
  assert.deepEqual(run(false), run(true));
});
test('a cancelled arrival still lets its cooperative blocker return; protected phases never yield', () => {
  const make = canYield => {
    const traffic = Traffic.createCoordinator({ gap: Scene.ACTOR_GAP }), bodies = [actor('A', 60, 72, { canYield }), actor('B', 81, 45), actor('C', 30, 46), actor('D', 87, 78)];
    traffic.sync(bodies); traffic.request('D', { x: 28, y: 81 }); return { traffic, bodies };
  };
  const blocked = make(false); assert.deepEqual(blocked.traffic.nextAny(), { kind: 'wait', reason: 'blocked' });
  const { traffic, bodies } = make(true), outward = traffic.nextAny();
  assert.equal(outward.id, 'A'); assert.equal(outward.yielding, true);
  bodies[0].position = outward.target; traffic.finish('A', outward.token); traffic.sync(bodies);
  traffic.cancel('D', bodies[3].position);
  const back = traffic.nextAny(); assert.equal(back.id, 'A'); assert.equal(back.temporary, false);
  bodies[0].position = back.target; traffic.finish('A', back.token); assert.deepEqual(back.target, { x: 60, y: 72 });
  assert.equal(traffic.state().queued, 0);
});

test('traffic retains at least 256 bodies instead of truncating the observed cast at 64', () => {
  const sessions = Array.from({ length: 256 }, (_, i) => ({ id: 'all-' + i, activity: 'coding' }));
  const layout = Scene.layoutAll(sessions), traffic = Traffic.createCoordinator({ gap: layout.gap - 1e-6 });
  const bodies = sessions.map(session => ({ id: session.id, position: layout.seats.get(session.id), uniformScale: layout.uniformScale, layoutMode: layout.layoutMode }));
  assert.equal(traffic.sync(bodies), true);
  assert.equal(traffic.state().actors, 256);
  assert.equal(traffic.state().invalid, false);
  assert.equal(traffic.request('all-255', bodies[255].position), true, 'the final actual body remains registered');
  assert.equal(traffic.next('all-255').kind, 'arrived');
  traffic.clear(); assert.equal(traffic.state().actors, 0);
});

test('traffic passes explicit uniform scales through geometry and replans when the whole plane is resized', () => {
  const seen = [];
  const sharedBounds = (point, body) => { seen.push({ id: body.id, uniformScale: body.uniformScale, helper: body.helper }); return Scene.actorBounds(point, body); };
  const traffic = Traffic.createCoordinator({ bounds: sharedBounds, legalPoint: () => true, obstacles: [], route: (a, b) => [a, b], gap: 2 });
  const a = actor('uniform-root', 15, 70, { uniformScale: .25 }), b = actor('uniform-helper', 50, 55, { helper: true, uniformScale: .25 });
  traffic.sync([a, b]); assert.equal(traffic.request(a.id, { x: 85, y: 70 }), true);
  const small = traffic.next(a.id); assert.equal(small.kind, 'move'); assert.equal(small.path.length, 2);
  assert.ok(seen.some(value => value.id === b.id && value.helper && value.uniformScale === .25));
  traffic.cancel(a.id, a.position); a.uniformScale = b.uniformScale = 1.35;
  traffic.sync([a, b]); traffic.request(a.id, { x: 85, y: 70 });
  const large = traffic.next(a.id); assert.equal(large.kind, 'move'); assert.ok(large.path.length > 2, 'large equal-sized bodies require a different route');
  for (let leg = 1; leg < large.path.length; leg += 1) for (let step = 0; step <= 150; step += 1) {
    const from = large.path[leg - 1], to = large.path[leg], p = { x: from.x + (to.x - from.x) * step / 150, y: from.y + (to.y - from.y) * step / 150 };
    assert.equal(Scene.actorsOverlap(p, a, b.position, b, 1.99), false);
  }
});
