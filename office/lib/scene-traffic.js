/* Pure visual traffic reservations. No DOM, clocks, provider actions or timers. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./scene-model.js') : root.OfficeScene);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeSceneTraffic = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Scene) {
  'use strict';

  const EPS = 1e-7;
  const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  const same = (a, b) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
  const inside = (p, r) => p.x > r.x1 - EPS && p.x < r.x2 + EPS && p.y > r.y1 - EPS && p.y < r.y2 + EPS;
  const intersects = (a, b, gapX = 0, gapY = gapX) => a.x1 < b.x2 + gapX && a.x2 > b.x1 - gapX && a.y1 < b.y2 + gapY && a.y2 > b.y1 - gapY;
  // Shared actor geometry is affine along a straight leg: both its foot and
  // depth scale interpolate linearly. Intersect the four overlap time ranges,
  // rather than sampling frames and possibly missing a fast crossing.
  function sweptOverlap(from, to, other, gapX, gapY) {
    let enter = 0, exit = 1;
    for (const [a, b] of [
      [from.x2 + gapX - other.x1, to.x2 + gapX - other.x1],
      [other.x2 + gapX - from.x1, other.x2 + gapX - to.x1],
      [from.y2 + gapY - other.y1, to.y2 + gapY - other.y1],
      [other.y2 + gapY - from.y1, other.y2 + gapY - to.y1],
    ]) {
      const delta = b - a;
      if (Math.abs(delta) < EPS) { if (a <= EPS) return false; }
      else if (delta > 0) enter = Math.max(enter, (EPS - a) / delta);
      else exit = Math.min(exit, (EPS - a) / delta);
      if (enter >= exit - EPS) return false;
    }
    return true;
  }

  function createCoordinator(options = {}) {
    const world = options.world || Scene.WORLD;
    const bounds = options.bounds || Scene.actorBounds;
    if (typeof bounds !== 'function') throw new TypeError('Traffic requires shared actorBounds geometry');
    const legalPoint = options.legalPoint || Scene.legalActorPoint || (() => true);
    const baseRoute = options.route || Scene.route;
    const distance = options.distance || Scene.distance;
    const obstacles = options.obstacles || Scene.OBSTACLES || [];
    const reservedRects = (options.reservedRects || []).map((b, i) => ({ id: `reserved:${i}`, reserved: true,
      bounds: { x1: b.left * 100 / world.width, x2: b.right * 100 / world.width,
        y1: b.top * 100 / world.height, y2: b.bottom * 100 / world.height } }));
    let gap = Number.isFinite(options.gap) ? Math.max(0, options.gap) : 8;
    const limit = Math.max(2, Math.min(4096, Math.floor(options.limit) || 256));
    const maxConcurrent = Math.max(1, Math.min(8, Math.floor(options.maxConcurrent) || 1));
    // The production renderer can yield between cooperative proofs. Pure
    // layout callers retain a synchronous complete proof by default.
    const yieldBatchSize = Math.max(0, Math.min(256, Math.floor(options.yieldBatchSize) || 0));
    const actors = new Map(), requests = new Map();
    const active = new Map();
    let sequence = 0, revision = 0, cached = null, invalid = false, searchPending = false, yieldBudget = 0, yieldRequestAfter = null;

    function rect(p, actor) {
      const b = bounds(p, actor);
      return { x1: b.left * 100 / world.width, x2: b.right * 100 / world.width,
        y1: b.top * 100 / world.height, y2: b.bottom * 100 / world.height };
    }
    let gapX = gap * 100 / world.width, gapY = gap * 100 / world.height;
    function changed() { revision += 1; cached = null; }
    function sync(values) {
      const next = new Map();
      invalid = !Array.isArray(values) || values.length > limit;
      for (const value of Array.isArray(values) ? values.slice(0, limit) : []) {
        const position = point(value?.position);
        if (!value?.id || !position || next.has(String(value.id))) { invalid = true; continue; }
        const scale = Number.isFinite(value.scale) ? value.scale : 1;
        const uniformScale = typeof value.uniformScale === 'number' && Number.isFinite(value.uniformScale) && value.uniformScale > 0 ? value.uniformScale : undefined;
        const footprint = value.footprint && ['left','right','top','bottom'].every(key => Number.isFinite(value.footprint[key]) && value.footprint[key] >= 0)
          ? Object.fromEntries(['left','right','top','bottom'].map(key => [key, value.footprint[key]])) : undefined;
        next.set(String(value.id), { id: String(value.id), position, helper: Boolean(value.helper), scale, uniformScale,
          ...(value.layoutMode === 'grid' ? { layoutMode: 'grid' } : {}), footprint, staged: value.staged === true, canYield: value.canYield !== false });
      }
      const signature = JSON.stringify([...next.values()].sort((a, b) => a.id.localeCompare(b.id)));
      if (typeof options.gap === 'function') {
        const requested = options.gap(next.values().next().value?.uniformScale || 1);
        if (Number.isFinite(requested) && requested >= 0 && requested !== gap) {
          gap = requested; gapX = gap * 100 / world.width; gapY = gap * 100 / world.height; changed();
        }
      }
      if (signature !== sync.signature || invalid !== sync.invalid) { sync.signature = signature; sync.invalid = invalid; changed(); }
      actors.clear(); for (const [id, actor] of next) actors.set(id, actor);
      for (const id of requests.keys()) if (!actors.has(id)) requests.delete(id);
      for (const id of active.keys()) if (!actors.has(id)) active.delete(id);
      return !invalid;
    }
    function request(id, target, opts = {}) {
      id = String(id);
      const to = point(target), actor = actors.get(id);
      if (!actor || !to || invalid || (!requests.has(id) && requests.size >= limit)) return false;
      const overlaps = [...new Set((Array.isArray(opts.overlapIds) ? opts.overlapIds : []).map(String))].filter(other => other !== id).sort();
      const old = requests.get(id);
      if (old && same(old.target, to) && old.instant === Boolean(opts.instant) && JSON.stringify(old.overlapIds) === JSON.stringify(overlaps)) return true;
      if (active.has(id)) return false; // Cancel with the rendered position before retargeting.
      if (yieldRequestAfter === id) yieldRequestAfter = null;
      requests.set(id, { id, target: to, instant: Boolean(opts.instant), overlapIds: overlaps, order: ++sequence, yielded: false });
      changed(); return true;
    }
    function exempt(r, other, a, b) {
      if (other.reserved || !r.overlapIds.includes(other.id)) return false;
      const start = actors.get(r.id).position;
      // A straight segment can leave/enter this convex envelope only once.
      // Other segments still avoid the parent after a deliberate clone split.
      return (same(a, start) && inside(a, other)) || (same(b, r.target) && inside(b, other));
    }
    function targetBlockers(r, target = r.target) {
      const moving = actors.get(r.id), destination = rect(target, moving);
      return [...actors.values()].filter(other => other.id !== r.id && !other.staged && !(same(target, r.target) && r.overlapIds.includes(other.id))
        && intersects(destination, rect(other.position, other), gapX, gapY)).map(other => other.id)
        .concat(reservedRects.filter(other => intersects(destination, other.bounds, 400 / world.width, 400 / world.height)).map(other => other.id))
        .concat(corridors(r.id).filter(other => intersects(destination, other.bounds, gapX, gapY)).map(other => other.id));
    }
    function corridors(exceptId) {
      const result = [];
      for (const movement of active.values()) {
        if (movement.id === exceptId) continue;
        const actor = actors.get(movement.id);
        if (!actor) continue;
        const current = actor.position, path = movement.path;
        // A completed prefix is released from the actual rendered foot. A
        // later route still avoids the entire remaining body/tag corridor;
        // safety does not depend on both walkers maintaining equal clocks.
        let segment = 0, nearest = Infinity;
        for (let index = 0; index < path.length - 1; index += 1) {
          const a = path[index], b = path[index + 1], dx = b.x - a.x, dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((current.x - a.x) * dx + (current.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          const d = (a.x + dx * t - current.x) ** 2 + (a.y + dy * t - current.y) ** 2;
          if (d < nearest - EPS) { nearest = d; segment = index; }
        }
        const remaining = [current, ...path.slice(segment + 1)];
        for (let index = 1; index < remaining.length; index += 1) {
          const a = rect(remaining[index - 1], actor), b = rect(remaining[index], actor);
          result.push({ id: `moving:${movement.id}:${index}`, reserved: true, bounds: {
            x1: Math.min(a.x1, b.x1), x2: Math.max(a.x2, b.x2), y1: Math.min(a.y1, b.y1), y2: Math.max(a.y2, b.y2)
          } });
        }
      }
      return result;
    }
    function findPath(r, target = r.target, temporary = false) {
      const actor = actors.get(r.id), start = actor.position;
      if (!legalPoint(start, actor) || !legalPoint(target, actor) || targetBlockers(r, target).length) return null;
      if (same(start, target)) return [start];
      if (r.instant && !temporary) return [start, target];
      // Depth changes during walking. The largest envelope in the rendered
      // world conservatively bounds every intermediate scale, including tags.
      const samples = [0, 50, 100].map(y => {
        const b = rect({ x: 0, y }, actor);
        return { left: -b.x1, right: b.x2, top: y - b.y1, bottom: b.y2 - y };
      });
      const extent = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(key => [key, Math.max(...samples.map(s => s[key]))]));
      const blockers = [...actors.values()].filter(other => other.id !== r.id && !other.staged).map(other => {
        const b = rect(other.position, other);
        return { id: other.id, bounds: b, gapX, gapY, x1: b.x1 - extent.right - gapX, x2: b.x2 + extent.left + gapX,
          y1: b.y1 - extent.bottom - gapY, y2: b.y2 + extent.top + gapY };
      }).concat(corridors(r.id).map(other => ({ ...other, gapX, gapY,
        x1: other.bounds.x1 - extent.right - gapX, x2: other.bounds.x2 + extent.left + gapX,
        y1: other.bounds.y1 - extent.bottom - gapY, y2: other.bounds.y2 + extent.top + gapY })), reservedRects.map(other => ({ ...other, gapX: 400 / world.width, gapY: 400 / world.height,
        x1: other.bounds.x1 - extent.right - 400 / world.width, x2: other.bounds.x2 + extent.left + 400 / world.width,
        y1: other.bounds.y1 - extent.bottom - 400 / world.height, y2: other.bounds.y2 + extent.top + 400 / world.height })));
      // One search holds one immutable actor geometry. Visibility-graph edges
      // reuse their endpoints; computing both rectangles inside every blocker
      // test inflated a 100-body route to millions of identical allocations.
      // Never retain this cache across a new search or an observed position.
      const boundsCache = new WeakMap();
      const boundsAt = p => {
        let value = boundsCache.get(p);
        if (!value) { value = rect(p, actor); boundsCache.set(p, value); }
        return value;
      };
      const clear = (a, b) => {
        if (obstacles.some(o => Scene.segmentHitsRect(a, b, o, .8))) return false;
        const from = boundsAt(a), to = boundsAt(b);
        return !blockers.some(o => sweptOverlap(from, to, o.bounds, o.gapX, o.gapY) && !exempt(r, o, a, b));
      };
      // Every real first leg contains this complete starting envelope. If a
      // non-exempt body/corridor already covers it, graph detours cannot help.
      // A deliberate clone source still receives only its named parent exemption.
      if (!clear(start, start)) return null;
      const pathClear = path => path.length > 1 && same(path[0], start) && same(path.at(-1), target)
        && path.every((p, i) => legalPoint(p, actor) && (!i || clear(path[i - 1], p)));
      const original = baseRoute(start, target, actor);
      if (pathClear(original)) return original.map(p => ({ ...p }));
      const nodes = [start, target];
      const add = p => {
        if (!legalPoint(p, actor) || blockers.some(o => inside(p, o)) || nodes.some(n => same(n, p))) return;
        nodes.push(p);
      };
      // A real split may begin inside its parent's expanded envelope in a
      // narrow furniture-side aisle. Project that actual foot straight out;
      // fixed grid columns can miss the only legal endpoint escape entirely.
      // These candidates retain the same exact per-leg collision checks.
      for (const o of blockers) if (!o.reserved && r.overlapIds.includes(o.id)) for (const endpoint of [start, target]) if (inside(endpoint, o)) {
        add({ x: endpoint.x, y: o.y1 - .15 }); add({ x: endpoint.x, y: o.y2 + .15 });
        add({ x: o.x1 - .15, y: endpoint.y }); add({ x: o.x2 + .15, y: endpoint.y });
      }
      for (const o of blockers) for (const x of [o.x1 - .15, o.x2 + .15]) for (const y of [o.y1 - .15, o.y2 + .15]) add({ x, y });
      for (const o of obstacles) for (const x of [o.x1 - 1, o.x2 + 1]) for (const y of [o.y1 - 1, o.y2 + 1]) add({ x, y });
      for (const p of original) add(p);
      // Boundary lanes also allow routing around an actor envelope whose
      // expanded corners extend outside the visible world.
      // Board feet and the entrance lane are also the narrow legal portals
      // between furniture. Omitting them can leave a valid final layout with
      // no route for a large newcomer or the worker making room for it.
      for (const x of [4, 12, 25, 50, 69, 75, 88, 96]) for (const y of [40.7, 41, 44, 46.5, 72, 76, 77, 78, 80, 86]) add({ x, y });
      const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set();
      costs[0] = 0;
      while (visited.size < nodes.length) {
        let at = -1;
        for (let i = 0; i < nodes.length; i += 1) if (!visited.has(i) && (at < 0 || costs[i] < costs[at] - EPS)) at = i;
        if (at < 0 || !Number.isFinite(costs[at])) break;
        if (at === 1) {
          const result = [];
          for (let i = 1; i >= 0; i = previous[i]) result.unshift({ ...nodes[i] });
          return result;
        }
        visited.add(at);
        for (let i = 0; i < nodes.length; i += 1) {
          if (visited.has(i) || !clear(nodes[at], nodes[i])) continue;
          const cost = costs[at] + distance(nodes[at], nodes[i]);
          if (cost < costs[i] - EPS) { costs[i] = cost; previous[i] = at; }
        }
      }
      return null;
    }
    function cycleFrom(r) {
      const visit = (id, path) => {
        if (path.includes(id)) return id === r.id ? path : null;
        const current = requests.get(id);
        if (current) for (const other of targetBlockers(current)) {
          const cycle = visit(other, path.concat(id)); if (cycle) return cycle;
        }
        return null;
      };
      for (const id of targetBlockers(r)) { const cycle = visit(id, [r.id]); if (cycle) return cycle; }
      return null;
    }
    function cycleCanFinish(r, holding, cycle) {
      const original = new Map([...actors.values()].map(actor => [actor.id, { position: actor.position, staged: actor.staged }]));
      try {
        actors.get(r.id).position = holding;
        const remaining = [...requests.values()].filter(candidate => !active.has(candidate.id)), done = new Set();
        for (let pass = 0; pass < remaining.length; pass += 1) {
          let progress = false;
          for (const candidate of remaining) {
            if (done.has(candidate.id)) continue;
            if (candidate.waitFor && requests.has(candidate.waitFor) && !done.has(candidate.waitFor)) continue;
            if (findPath(candidate)) { actors.get(candidate.id).position = candidate.target; actors.get(candidate.id).staged = false; done.add(candidate.id); progress = true; }
          }
          if (cycle.every(id => done.has(id))) return true;
          if (!progress) break;
        }
        return false;
      } finally { for (const [id, value] of original) { actors.get(id).position = value.position; actors.get(id).staged = value.staged; } }
    }
    function holdingPath(r, cycle) {
      const actor = actors.get(r.id), candidates = [];
      const preferred = (typeof options.holdingPoints === 'function' ? options.holdingPoints(actor) : options.holdingPoints) || [];
      const preferredKeys = new Set(), seen = new Set(), key = p => p.x + '/' + p.y;
      const add = (p, priority = false) => {
        if (!point(p) || seen.has(key(p))) return;
        seen.add(key(p));
        if (distance(actor.position, p) < 3 || !legalPoint(p, actor) || targetBlockers(r, p).length) return;
        const b = rect(p, actor);
        if ([...requests.values()].some(other => other.id !== r.id && intersects(b, rect(other.target, actors.get(other.id)), gapX, gapY))) return;
        candidates.push({ x: p.x, y: p.y }); if (priority) preferredKeys.add(key(p));
      };
      for (const p of Array.isArray(preferred) ? preferred : []) add(p, true);
      for (const y of [40.7, 41, 44, 46.5, 48, 52, 56, 60, 64, 68, 72, 76, 77, 78, 80, 84, 86]) for (let x = 4; x <= 96; x += 4) add({ x, y });
      candidates.sort((a, b) => Number(preferredKeys.has(key(b))) - Number(preferredKeys.has(key(a))) || distance(actor.position, a) - distance(actor.position, b) || a.y - b.y || a.x - b.x);
      for (const p of candidates.slice(0, 64)) {
        const path = findPath(r, p, true);
        if (path && cycleCanFinish(r, p, cycle)) return path;
      }
      return null;
    }
    function cooperativeYield(blocked) {
      if (requests.size >= limit || blocked.cooperative || blocked.overlapIds.length) return null;
      if (yieldBatchSize && blocked.yieldBlockedAt === revision) return null;
      // A stationary yielder cannot clear an immutable artwork rectangle or
      // another walker's reserved corridor at either endpoint. Avoid trying
      // every parked body and rebuilding graphs for that impossible request.
      // This uses the same full-envelope gaps as findPath; clone exemptions
      // never apply to these reserved obstacles.
      const moving = actors.get(blocked.id), start = rect(moving.position, moving), target = rect(blocked.target, moving);
      if (reservedRects.some(other => sweptOverlap(start, start, other.bounds, 400 / world.width, 400 / world.height)
        || intersects(target, other.bounds, 400 / world.width, 400 / world.height))
        || corridors(blocked.id).some(other => sweptOverlap(start, start, other.bounds, gapX, gapY)
          || intersects(target, other.bounds, gapX, gapY))) return null;
      const candidates = [...actors.values()].filter(actor => actor.id !== blocked.id && !actor.staged && actor.canYield && !requests.has(actor.id))
        .sort((a, b) => distance(a.position, actors.get(blocked.id).position) - distance(b.position, actors.get(blocked.id).position) || a.id.localeCompare(b.id));
      const scan = yieldBatchSize ? blocked.yieldScan || (blocked.yieldScan = { revision, tested: new Set() }) : null;
      for (const actor of candidates) {
        if (scan?.tested.has(actor.id)) continue;
        if (yieldBatchSize && yieldBudget <= 0) { searchPending = true; return null; }
        if (scan) { yieldBudget -= 1; scan.tested.add(actor.id); yieldRequestAfter = blocked.id; }
        // Positive geometric evidence: removing this exact stationary body
        // opens the queued path. Do not move unrelated workers speculatively.
        actors.delete(actor.id);
        let opens;
        try { opens = findPath(blocked); } finally { actors.set(actor.id, actor); }
        if (!opens) continue;
        const yielding = { id: actor.id, target: { ...actor.position }, instant: blocked.instant,
          overlapIds: [], order: sequence + 1, yielded: false, cooperative: true, waitFor: blocked.id };
        requests.set(actor.id, yielding);
        const path = holdingPath(yielding, [blocked.id, actor.id]);
        if (path) { yielding.order = ++sequence; return { request: yielding, path, temporary: true }; }
        requests.delete(actor.id);
      }
      if (scan) {
        delete blocked.yieldScan;
        // Movement may have changed a previously tested possibility while
        // this finite pass was in flight. Never cache that old mixed-version
        // negative as a complete proof of the current scene.
        if (scan.revision !== revision && candidates.length) searchPending = true;
        else blocked.yieldBlockedAt = revision;
      }
      return null;
    }
    function selection() {
      searchPending = false; yieldBudget = yieldBatchSize;
      if (cached?.revision === revision) return cached.value;
      const ordered = [...requests.values()].filter(r => !active.has(r.id)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      let value = null;
      for (const r of ordered) {
        if (r.cooperative && requests.has(r.waitFor)) continue;
        const path = findPath(r);
        if (path) { value = { request: r, path, temporary: false }; break; }
      }
      if (!value) for (const r of ordered) {
        if (r.cooperative) continue;
        const cycle = !r.yielded && cycleFrom(r);
        if (!cycle) continue;
        const path = holdingPath(r, cycle);
        if (path) { value = { request: r, path, temporary: true }; break; }
      }
      if (!value) {
        const after = yieldBatchSize ? ordered.findIndex(r => r.id === yieldRequestAfter) : -1;
        const cooperativeOrder = after < 0 ? ordered : ordered.slice(after + 1).concat(ordered.slice(0, after + 1));
        for (const r of cooperativeOrder) { value = cooperativeYield(r); if (value || searchPending) break; }
      }
      cached = searchPending ? null : { revision, value }; return value;
    }
    function reserve(chosen) {
      const r = chosen.request, id = r.id;
      const staged = Boolean(actors.get(id).staged);
      actors.get(id).staged = false;
      if (chosen.path.length === 1) {
        requests.delete(id); changed(); return { kind: 'arrived', id, target: { ...r.target }, yielding: Boolean(r.cooperative), ...(staged ? { staged: true } : {}) };
      }
      const movement = { id, token: ++sequence, target: { ...chosen.path.at(-1) }, temporary: chosen.temporary, path: chosen.path.map(p => ({ ...p })) };
      active.set(id, movement); changed();
      return { kind: 'move', ...movement, instant: r.instant, yielding: Boolean(r.cooperative), ...(staged ? { staged: true } : {}),
        path: chosen.path.map(p => ({ ...p })) };
    }
    function next(id) {
      id = String(id);
      if (invalid) return { kind: 'wait', reason: 'invalid-scene' };
      if (!requests.has(id) || !actors.has(id)) return { kind: 'cancelled' };
      if (active.has(id) || active.size >= maxConcurrent) return { kind: 'wait', reason: 'reserved', by: active.values().next().value.id };
      const chosen = selection();
      if (!chosen) return { kind: 'wait', reason: searchPending ? 'searching' : 'blocked' };
      if (chosen.request.id !== id) return { kind: 'wait', reason: 'queued', by: chosen.request.id };
      return reserve(chosen);
    }
    function nextAny() {
      if (invalid) return { kind: 'wait', reason: 'invalid-scene' };
      if (active.size >= maxConcurrent) return { kind: 'wait', reason: 'reserved', by: active.values().next().value.id };
      if (!requests.size) return { kind: 'idle' };
      const chosen = selection();
      return chosen ? reserve(chosen) : searchPending ? { kind: 'wait', reason: 'searching' }
        : active.size ? { kind: 'wait', reason: 'reserved', by: active.values().next().value.id } : { kind: 'wait', reason: 'blocked' };
    }
    function finish(id, token, actualPoint) {
      id = String(id);
      const movement = active.get(id);
      if (!movement || movement.token !== token) return false;
      const actor = actors.get(id), position = point(actualPoint) || movement.target;
      if (actor) actor.position = { ...position };
      const r = requests.get(id);
      if (r && movement.temporary) r.yielded = true;
      else if (r && same(position, r.target)) requests.delete(id);
      active.delete(id); changed(); return true;
    }
    function cancel(id, actualPoint) {
      id = String(id);
      const actor = actors.get(id), position = point(actualPoint);
      if (actor && position) actor.position = position;
      const removed = requests.delete(id);
      if (yieldRequestAfter === id) yieldRequestAfter = null;
      active.delete(id);
      if (removed || position) changed();
      return removed;
    }
    function clear() { actors.clear(); requests.clear(); active.clear(); invalid = false; sync.signature = null; yieldRequestAfter = null; searchPending = false; changed(); }
    function state() {
      const moves = [...active.values()].map(({ path, ...movement }) => ({ ...movement, target: { ...movement.target } }));
      return { active: moves[0] || null, activeMoves: moves, maxConcurrent, queued: requests.size, actors: actors.size, invalid };
    }
    return Object.freeze({ sync, request, next, nextAny, finish, cancel, clear, state });
  }
  return Object.freeze({ createCoordinator });
});
