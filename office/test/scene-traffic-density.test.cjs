'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Scene = require('../lib/scene-model.js');
const Layout = require('../lib/walking-layout.js');
const Traffic = require('../lib/scene-traffic.js');

test('one real hundred-body furniture route bounds geometry work while retaining every full-envelope collision check', () => {
  const sessions = Array.from({ length: 100 }, (_, index) => ({ id: 'density-' + String(index).padStart(3, '0'), provider: 'codex', status: 'active', activity: ['reading', 'planning', 'coding', 'testing'][index % 4] }));
  const footprint = { left: 116, right: 123, top: 121, bottom: 93 };
  const page = Layout.layoutWalking(sessions, { requestedScale: 1.35, footprints: new Map(sessions.map(session => [session.id, footprint])) });
  const geometry = { uniformScale: page.uniformScale, footprint };
  const actors = sessions.map(session => ({ id: session.id, position: page.seats.get(session.id), ...geometry }));
  let measurements = 0;
  const traffic = Traffic.createCoordinator({ bounds: (point, options) => { measurements += 1; return Scene.actorBounds(point, options); }, gap: Layout.gapForScale, route: Layout.route, legalPoint: Layout.legalPoint, reservedRects: Scene.CLOCK_RESERVED, holdingPoints: page.holdingPoints });
  traffic.sync(actors); traffic.request(actors[0].id, Layout.ENTRY_POINT);
  const movement = traffic.nextAny();
  assert.equal(movement.kind, 'move');
  assert.equal(movement.id, actors[0].id);
  assert.deepEqual(movement.path[0], { x: actors[0].position.x, y: actors[0].position.y });
  assert.deepEqual(movement.path.at(-1), Layout.ENTRY_POINT);
  assert.ok(movement.path.length > 2, 'a real furniture/body detour must be exercised');
  assert.ok(measurements < 10000, 'one visibility search must not remeasure identical endpoints millions of times: ' + measurements);
  const gap = Layout.gapForScale(page.uniformScale), scale = page.uniformScale;
  const forbidden = actors.slice(1).map(actor => Scene.actorBounds(actor.position, geometry)).map(rect => ({ x1: rect.left - footprint.right * scale - gap, y1: rect.top - footprint.bottom * scale - gap, x2: rect.right + footprint.left * scale + gap, y2: rect.bottom + footprint.top * scale + gap }));
  for (let index = 1; index < movement.path.length; index += 1) {
    const from = movement.path[index - 1], to = movement.path[index];
    assert.equal(Layout.legalPoint(to, geometry), true);
    for (const obstacle of Scene.OBSTACLES) assert.equal(Scene.segmentHitsRect(from, to, obstacle, .79), false);
    const pixel = point => ({ x: point.x * 12.8, y: point.y * 7.2 });
    for (const rect of forbidden) assert.equal(Scene.segmentHitsRect(pixel(from), pixel(to), rect, 0), false, 'the complete body and nameplate must avoid every stopped actor');
  }
});

test('a hundred staged doorway requests do not build futile graphs inside a reserved outgoing corridor; the actual released prefix then admits a body', () => {
  const footprint = { left: 35, right: 35, top: 45, bottom: 25 };
  const actor = (id, x, y, staged = false) => ({ id, position: { x, y }, uniformScale: 1, footprint, staged, canYield: false });
  let routes = 0;
  const traffic = Traffic.createCoordinator({ yieldBatchSize: 1, maxConcurrent: 4, gap: 12, obstacles: [], bounds: Scene.actorBounds, legalPoint: () => true, route: (from, to) => { routes += 1; return [from, to]; } });
  const first = actor('outgoing', 15, 65), waiting = Array.from({ length: 100 }, (_, index) => actor('waiting-' + index, 15, 65, true));
  traffic.sync([first, ...waiting]); traffic.request(first.id, { x: 85, y: 65 });
  const outgoing = traffic.nextAny(); assert.equal(outgoing.kind, 'move'); assert.equal(routes, 1);
  for (const entrant of waiting) traffic.request(entrant.id, { x: 20, y: 85 });
  assert.equal(traffic.nextAny().kind, 'wait');
  assert.equal(routes, 1, 'a blocked complete starting envelope cannot gain a safe detour by building one hundred graphs');
  assert.equal(traffic.state().activeMoves.length, 1);
  first.position = { x: 45, y: 65 }; traffic.sync([first, ...waiting]);
  const admitted = traffic.nextAny(); assert.equal(admitted.kind, 'move'); assert.equal(admitted.id, waiting[0].id); assert.equal(routes, 2);
  assert.equal(traffic.state().activeMoves.length, 2, 'prefix release permits an actual independent concurrent route');
});

test('starting-envelope early rejection preserves named clone-parent splitting while rejecting unrelated bodies and reserved artwork', () => {
  const footprint = { left: 35, right: 35, top: 45, bottom: 25 };
  const actor = (id, staged = false) => ({ id, position: { x: 15, y: 80 }, uniformScale: 1, footprint, staged, canYield: false });
  const create = extra => Traffic.createCoordinator({ maxConcurrent: 4, gap: 12, obstacles: [], bounds: Scene.actorBounds, legalPoint: () => true, route: (from, to) => [from, to], ...extra });
  for (const condition of ['parent', 'unrelated', 'reserved']) {
    const parent = actor('parent'), child = actor('child', true), traffic = create(condition === 'reserved' ? { reservedRects: [{ left: 170, right: 210, top: 530, bottom: 600 }] } : {});
    traffic.sync(condition === 'unrelated' ? [parent, child, actor('unrelated')] : [parent, child]);
    traffic.request(child.id, { x: 85, y: 80 }, { overlapIds: [parent.id] });
    const result = traffic.nextAny();
    assert.equal(result.kind, condition === 'parent' ? 'move' : 'wait', condition);
    if (condition === 'parent') assert.deepEqual(result.path[0], parent.position);
  }
});

test('a reserved corridor at either endpoint never scans stationary yielders that cannot remove it', () => {
  const footprint={left:10,right:10,top:10,bottom:10};
  for(const endpoint of ['start','target']){
    let measured=0;
    const traffic=Traffic.createCoordinator({maxConcurrent:4,gap:2,obstacles:[],legalPoint:()=>true,route:(a,b)=>[a,b],bounds:(p,a)=>{if(a.id==='queued')measured++;return Scene.actorBounds(p,a);}});
    const walker={id:'walker',position:{x:15,y:65},uniformScale:1,footprint,canYield:false};
    const queued={id:'queued',position:endpoint==='start'?{x:15,y:65}:{x:15,y:85},uniformScale:1,footprint,staged:true,canYield:false};
    const parked=Array.from({length:98},(_,i)=>({id:'parked-'+i,position:{x:4+i%24*4,y:10+Math.floor(i/24)*5},uniformScale:1,footprint,canYield:true}));
    traffic.sync([walker,queued,...parked]);traffic.request(walker.id,{x:85,y:65});assert.equal(traffic.nextAny().kind,'move');
    measured=0;traffic.request(queued.id,endpoint==='start'?{x:20,y:85}:{x:50,y:65});assert.equal(traffic.nextAny().kind,'wait');
    assert.ok(measured<30,'an immutable '+endpoint+' corridor cannot be opened by 98 different stationary-body removals: '+measured);
  }
});
