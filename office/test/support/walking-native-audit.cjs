'use strict';
// Shared read-only audit of actual native actor geometry and route ownership.
function installAudit() {
  const identities = new Map(), routeCache = new WeakMap();
  window.crowdArrivals = []; window.crowdActors=new Map();
  document.getElementById('office').addEventListener('office:actor-arrival', event => {
    const { actorId, zone, kind, serial, position } = event.detail; crowdActors.set(actorId,event.detail.actor);
    crowdArrivals.push({ id: actorId, zone, kind, serial, position, at: performance.now() });
  });
  const intersection = (a, b, tolerance = .7) => a.left < b.right - tolerance && b.left < a.right - tolerance && a.top < b.bottom - tolerance && b.top < a.bottom - tolerance;
  const foot = node => { const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform); return { x: matrix.m41, y: matrix.m42, scale: Math.hypot(matrix.m11, matrix.m12) }; };
  const endpoint = (child, parent) => {
    const phase = child.node.dataset.clonePhase;
    if (!['splitting', 'returning', 'absorbing'].includes(phase)) return child.node.dataset.endpointOverlap === parent.id;
    if (![child.node.dataset.cloneOrigin, child.node.dataset.cloneTarget].includes(parent.id)) return false;
    if ((child.node.dataset.cloneCharge === 'true' || phase === 'absorbing') && Math.hypot(child.x - parent.x, child.y - parent.y) < .75) return true;
    const route = originalRoute(child);
    if (!route || route.points.length < 2 || route.progress === null) return false;
    const points = route.points;
    // Repeated original vertices have no geometric leg. Their zero-duration
    // offsets cannot shorten or widen the actual named endpoint segment.
    const legs = points.slice(1).map((point, index) => ({ from: points[index], to: point }))
      .filter(leg => Math.hypot(leg.to.x - leg.from.x, leg.to.y - leg.from.y) > .000001);
    if (!legs.length) return false;
    return phase === 'splitting' && Math.hypot(points[0].x - parent.x, points[0].y - parent.y) < .75 && route.progress <= legs[0].to.offset + .0001
      || phase === 'returning' && Math.hypot(points.at(-1).x - parent.x, points.at(-1).y - parent.y) < .75 && route.progress >= legs.at(-1).from.offset - .0001;
  };
  let state = null, frame = 0;
  function fail(message) { if (state.violations.length < 20 && !state.violations.includes(message)) state.violations.push(message); }
  function originalRoute(row) {
    const motion = row.node.getAnimations().find(animation => { const keys = animation.effect?.getKeyframes() || []; return animation.constructor.name === 'Animation' && animation.effect?.target === row.node && keys.length >= 2 && keys.every(key => typeof key.transform === 'string'); });
    if (!motion) return null;
    let points = routeCache.get(motion);
    if (!points) {
      points = motion.effect.getKeyframes().map(key => { const m = new DOMMatrixReadOnly(key.transform); return { x: m.m41, y: m.m42, offset: key.computedOffset }; });
      routeCache.set(motion, points);
    }
    return { points, progress: motion.effect.getComputedTiming().progress };
  }
  function futureSweepsOverlap(a, b, tolerance = 1) {
    // All independent positions along both exact line segments are covered.
    // Their relative centres form a parallelogram. SAT against the full
    // asymmetric body/nameplate Minkowski window rejects only true overlap;
    // comparing two enclosing AABBs would also reject their empty corners.
    const x1 = -b.extents.left - a.extents.right + tolerance;
    const x2 = a.extents.left + b.extents.right - tolerance;
    const y1 = -b.extents.top - a.extents.bottom + tolerance;
    const y2 = a.extents.top + b.extents.bottom - tolerance;
    if (!(x1 < x2 && y1 < y2)) return false;
    const relative = [
      { x: a.from.x - b.from.x, y: a.from.y - b.from.y },
      { x: a.to.x - b.from.x, y: a.to.y - b.from.y },
      { x: a.to.x - b.to.x, y: a.to.y - b.to.y },
      { x: a.from.x - b.to.x, y: a.from.y - b.to.y }
    ];
    const window = [{ x:x1,y:y1 },{ x:x2,y:y1 },{ x:x2,y:y2 },{ x:x1,y:y2 }];
    const axes = [{ x:1,y:0 },{ x:0,y:1 },
      { x: -(a.to.y-a.from.y), y:a.to.x-a.from.x },
      { x: -(b.to.y-b.from.y), y:b.to.x-b.from.x }];
    for (const axis of axes) {
      const length = Math.hypot(axis.x,axis.y); if (!length) continue;
      const project = p => (p.x*axis.x+p.y*axis.y)/length;
      const left = relative.map(project), right = window.map(project);
      if (Math.max(...left) <= Math.min(...right)+1e-8 || Math.max(...right) <= Math.min(...left)+1e-8) return false;
    }
    return true;
  }
  function remainingRoute(row) {
    const route = originalRoute(row);
    if (!route) return null;
    const { points, progress } = route;
    if (progress === null) return null;
    const future = [{ x: row.x, y: row.y }, ...points.filter(point => point.offset > progress + .00001)];
    const extents = { left: row.x - row.worldBox.left, right: row.worldBox.right - row.x, top: row.y - row.worldBox.top, bottom: row.worldBox.bottom - row.y };
    return future.slice(1).map((point, index) => ({
      from: future[index], to: point, extents,
      left: Math.min(point.x, future[index].x) - extents.left,
      right: Math.max(point.x, future[index].x) + extents.right,
      top: Math.min(point.y, future[index].y) - extents.top,
      bottom: Math.max(point.y, future[index].y) + extents.bottom
    }));
  }
  function tick(now) {
    if (!state) return;
    state.frames += 1;
    const nodes = [...document.querySelectorAll('.actor[data-session-id]')];
    const office = document.getElementById('office'), world = document.getElementById('world').getBoundingClientRect();
    const factor = world.width / 1280, clock = document.getElementById('day-clock').getBoundingClientRect();
    const visible = [];
    for (const node of nodes) {
      const id = node.dataset.sessionId, style = getComputedStyle(node), alpha = Number(style.opacity);
      const admitted = style.visibility !== 'hidden' && style.display !== 'none';
      const known = identities.get(id);
      if (known) {
        if (node !== known.node || node.querySelector('.character-body') !== known.body || node.querySelector('.character-body>img') !== known.image) fail('body identity replaced: ' + id);
        if (!admitted) fail('admitted body hidden: ' + id);
        if (alpha < .99 && !['absorb', 'restore'].includes(node.dataset.bodyFade)) fail('unowned body opacity: ' + id + ':' + alpha);
      }
      if (!admitted) continue;
      const point = foot(node), parts = [node.querySelector('.character-body'), node.querySelector('.nameplate')].map(part => part.getBoundingClientRect());
      const box = { left: Math.min(...parts.map(rect => rect.left)), right: Math.max(...parts.map(rect => rect.right)), top: Math.min(...parts.map(rect => rect.top)), bottom: Math.max(...parts.map(rect => rect.bottom)) };
      const row = { id, node, ...point, ...box, worldBox: { left: (box.left - world.left) / factor, right: (box.right - world.left) / factor, top: (box.top - world.top) / factor, bottom: (box.bottom - world.top) / factor } };
      const actualRoute = originalRoute(row);
      if (actualRoute && actualRoute.progress !== null && node.dataset.walking !== 'true') fail('a real route lost its walking/gait owner: ' + id);
      if (!known) identities.set(id, { node, body: node.querySelector('.character-body'), image: node.querySelector('.character-body>img') });
      const old = state.previous.get(id);
      if (old && Math.hypot(point.x - old.x, point.y - old.y) > 400 * (now - old.at) / 1000 + 4) fail('foot jump: ' + id);
      state.previous.set(id, { ...point, at: now });
      const positions = state.positions.get(id) || new Set(); positions.add(point.x.toFixed(2) + '/' + point.y.toFixed(2)); state.positions.set(id, positions);
      if (old && Math.hypot(point.x - old.x, point.y - old.y) > .05) state.lastProgressAt = now;
      if (getComputedStyle(node).zIndex !== '10') fail('unequal actor layer: ' + id);
      if (box.left < -.8 || box.right > innerWidth + .8 || box.top < -.8 || box.bottom > innerHeight + .8) fail('body/nameplate outside viewport: ' + id);
      if (intersection(box, clock)) fail('body/nameplate covers clock: ' + id);
      if (OfficeScene.OBSTACLES.some(obstacle => OfficeScene.segmentHitsRect({ x: point.x / 12.8, y: point.y / 7.2 }, { x: point.x / 12.8, y: point.y / 7.2 }, obstacle, .79))) fail('real feet inside furniture: ' + id);
      state.minScale = Math.min(state.minScale, point.scale); state.lastScale = point.scale;
      if (node.dataset.walking === 'true' && node.dataset.trafficHint === 'yielding') { state.yieldingFrames += 1; state.yielded.add(id); }
      visible.push(row);
    }
    for (const [id] of identities) if (!nodes.some(node => node.dataset.sessionId === id) && !state.allowedRemoved.has(id)) fail('admitted identity removed: ' + id);
    for (let i = 0; i < visible.length; i += 1) for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i], b = visible[j];
      if (Math.abs(a.scale - b.scale) > .00002) fail('unequal scale: ' + a.id + '/' + b.id);
      if (!endpoint(a, b) && !endpoint(b, a) && intersection(a, b)) fail('body/nameplate overlap: ' + a.id + '/' + b.id);
    }
    const docked = new Set();
    for (const child of visible) if (child.node.dataset.cloneCharge === 'true' || ['returning', 'absorbing'].includes(child.node.dataset.clonePhase)) {
      const parentId = child.node.dataset.cloneTarget || child.node.dataset.cloneOrigin, parent = visible.find(row => row.id === parentId);
      if (!parent) continue;
      docked.add(parentId); state.dockedFrames += 1;
      const previous = state.dockFeet.get(parentId);
      if (previous && Math.hypot(parent.x - previous.x, parent.y - previous.y) > .75) fail('traffic stole a locked actual parent dock: ' + parentId);
      if (parent.node.dataset.walking === 'true') fail('locked actual parent dock was forced to walk: ' + parentId);
      state.dockFeet.set(parentId, { x: parent.x, y: parent.y });
    }
    for (const id of state.dockFeet.keys()) if (!docked.has(id)) state.dockFeet.delete(id);
    const moving = visible.filter(row => row.node.dataset.walking === 'true');
    state.maxMoving = Math.max(state.maxMoving, moving.length);
    if (moving.length > 4) fail('more than four physical route owners');
    if (moving.length >= 2) {
      state.parallelFrames += 1;
      const routes = moving.map(row => ({ id: row.id, corridor: remainingRoute(row) }));
      for (let i = 0; i < routes.length; i += 1) for (let j = i + 1; j < routes.length; j += 1) {
        const a = routes[i], b = routes[j];
        if (!a.corridor || !b.corridor) { fail('a moving body has no original route Animation'); continue; }
        state.corridorPairsChecked += 1;
        if (a.corridor.some(left => b.corridor.some(right => futureSweepsOverlap(left, right, 1)))) {
          if (!state.corridorFailure) state.corridorFailure = { at: now, actors: [a.id, b.id].map(id => {
            const row = moving.find(value => value.id === id);
            return { id, foot: { x: row.x, y: row.y }, scale: row.scale, worldBox: row.worldBox,
              route: originalRoute(row), remainingCorridors: remainingRoute(row) };
          }) };
          fail('parallel future body/nameplate corridors intersect: ' + a.id + '/' + b.id);
        }
      }
    }
    const queued = Number(office.dataset.entranceQueue) || 0;
    state.maxVisible = Math.max(state.maxVisible, visible.length);
    if (visible.length > state.previousVisible || crowdArrivals.length > state.previousArrivals) state.lastProgressAt = now;
    state.previousVisible = visible.length; state.previousArrivals = crowdArrivals.length;
    if (now - state.startedAt > 500) {
      if (visible.length + queued !== nodes.length) fail('entrance queue does not account for every real identity');
      if (state.expected.some(id => !nodes.some(node => node.dataset.sessionId === id) && !state.allowedRemoved.has(id))) fail('authoritative identity is missing from DOM');
    }
    const unfinished = queued > 0 || nodes.some(node => node.dataset.walking === 'true' || ['queued', 'waiting-space', 'yielding'].includes(node.dataset.traffic));
    if (unfinished) {
      const gap = now - state.lastProgressAt; state.maxProgressGapMs = Math.max(state.maxProgressGapMs, gap);
      if (gap > 12000) fail('no finite physical/arrival progress for twelve seconds');
    }
    frame = requestAnimationFrame(tick);
  }
  function report() {
    if (!state) return null;
    return { name: state.name, frames: state.frames, maxMoving: state.maxMoving, parallelFrames: state.parallelFrames, corridorPairsChecked: state.corridorPairsChecked, maxVisible: state.maxVisible, minScale: state.minScale, lastScale: state.lastScale, maxProgressGapMs: state.maxProgressGapMs, yieldingFrames: state.yieldingFrames, yieldedIds: [...state.yielded], dockedFrames: state.dockedFrames, distinctFootPositions: Object.fromEntries([...state.positions].map(([id, values]) => [id, values.size])), violations: state.violations, ...(state.corridorFailure ? { corridorFailure: state.corridorFailure } : {}) };
  }
  window.crowdAudit = {
    begin(name, expected, allowedRemoved = []) {
      if (frame) cancelAnimationFrame(frame);
      const now = performance.now();
      state = { name, expected, allowedRemoved: new Set(allowedRemoved), frames: 0, startedAt: now, lastProgressAt: now, previous: new Map(), positions: new Map(), dockFeet: new Map(), violations: [], yielded: new Set(), yieldingFrames: 0, dockedFrames: 0, maxMoving: 0, parallelFrames: 0, corridorPairsChecked: 0, maxVisible: 0, previousVisible: 0, previousArrivals: crowdArrivals.length, minScale: Infinity, lastScale: 0, maxProgressGapMs: 0 };
      frame = requestAnimationFrame(tick);
    },
    report,
    finish() { if (frame) cancelAnimationFrame(frame); frame = 0; const value = report(); state = null; return value; },
    forget(id) { identities.delete(id); }
  };
}

module.exports = { installAudit };
