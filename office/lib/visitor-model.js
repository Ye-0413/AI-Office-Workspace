/* Decorative visitor timing. This module never reads or creates AI sessions. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeVisitorModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const STOPS = Object.freeze([
    { zone: 'library', point: { x: 19, y: 44 }, prop: 'book', poses: ['clawd-idle-reading.svg', 'clawd-idle-look.svg'] },
    { zone: 'board', point: { x: 47, y: 43 }, prop: 'note', poses: ['clawd-idle-look.svg', 'clawd-working-thinking.svg'] },
    { zone: 'bench', point: { x: 81, y: 45 }, prop: 'coffee', poses: ['clawd-coffee-hand.svg', 'clawd-idle-bubble.svg'] },
    { zone: 'desk', point: { x: 48, y: 72 }, prop: 'note', poses: ['clawd-idle-look.svg', 'clawd-idle-living.svg'] },
    { zone: 'sofa', point: { x: 16, y: 79 }, prop: 'coffee', poses: ['clawd-coffee-hand.svg', 'clawd-idle-yawn.svg', 'clawd-idle-reading.svg'] },
    { zone: 'window', point: { x: 7, y: 44 }, prop: 'none', poses: ['clawd-idle-look.svg', 'clawd-idle-bubble.svg'] },
    { zone: 'plant', point: { x: 30, y: 44 }, prop: 'plant', poses: ['clawd-idle-look.svg', 'clawd-mini-peek.svg'] },
    { zone: 'door', point: { x: 92.5, y: 82 }, prop: 'none', poses: ['clawd-mini-peek.svg', 'clawd-react-right.svg'] },
    { zone: 'archive', point: { x: 84, y: 80 }, prop: 'book', poses: ['clawd-working-sweeping.svg', 'clawd-idle-reading.svg'] },
    { zone: 'front', point: { x: 49, y: 84 }, prop: 'none', poses: ['clawd-idle-living.svg', 'clawd-headphones-groove.svg'] },
  ].map(stop => Object.freeze({ ...stop, point: Object.freeze(stop.point), poses: Object.freeze(stop.poses) })));
  const EASTER_EGGS = Object.freeze([
    Object.freeze({ id: 'tiny-magic', pose: 'clawd-working-wizard.svg', prop: 'spark' }),
    Object.freeze({ id: 'heart-shaped-cloud', pose: 'clawd-heart-eyes.svg', prop: 'heart' }),
    Object.freeze({ id: 'happy-discovery', pose: 'clawd-happy.svg', prop: 'spark' }),
    Object.freeze({ id: 'secret-dance', pose: 'clawd-headphones-groove.svg', prop: 'music' }),
    Object.freeze({ id: 'coffee-trick', pose: 'clawd-coffee-head-flip.svg', prop: 'coffee' }),
  ]);
  const duration = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
  const randomUnit = random => {
    const value = Number(random());
    return Number.isFinite(value) ? Math.max(0, Math.min(0.9999999999999999, value)) : 0;
  };
  const choose = (values, random) => values[Math.floor(randomUnit(random) * values.length)];

  /**
   * An eligible item is not repeated until all currently eligible items have
   * been drawn. Switching context preserves the unused entries in other zones.
   * Supplied items are never changed. A returned item retains its identity.
   */
  function createShuffleBag(items, { random = Math.random, key = item => item.id } = {}) {
    const unique = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const id = key(item);
      if (!unique.has(id)) unique.set(id, item);
    }
    const entries = [...unique].map(([id, item]) => ({ id, item }));
    const drawn = new Set();
    let last;
    const eligible = predicate => entries.filter(entry => predicate(entry.item));
    return {
      next(predicate = () => true) {
        const available = eligible(predicate);
        if (!available.length) return null;
        let unused = available.filter(entry => !drawn.has(entry.id));
        if (!unused.length) {
          for (const entry of available) drawn.delete(entry.id);
          unused = available;
        }
        const different = unused.filter(entry => entry.id !== last);
        const selected = choose(different.length ? different : unused, random);
        drawn.add(selected.id); last = selected.id;
        return selected.item;
      },
      remaining(predicate = () => true) { return eligible(predicate).filter(entry => !drawn.has(entry.id)).length; },
      size() { return entries.length; },
      clear() { drawn.clear(); last = undefined; },
    };
  }

  /**
   * Call update with global room occupancy, including real agents that are
   * departing. A stop is an intent: render it once per stopSerial, then call
   * arrived(stopSerial, generation) after its route finishes. Work revokes that
   * generation; stale animation callbacks therefore cannot restart the visit.
   * After the leaving route finishes, call departed(generation).
   * All idle, dwell and visit deadlines use visible time, so resume never
   * produces a burst of missed stops or speech.
   */
  function createVisitor({ now = () => Date.now(), random = Math.random,
    arrivalDelayMs = 8000, returnDelayMs = 45000, maxVisitMs = 150000,
    dwellMinMs = 12000, dwellMaxMs = 22000 } = {}) {
    const arrivalDelay = duration(arrivalDelayMs, 8000);
    const returnDelay = duration(returnDelayMs, 45000);
    const visitDuration = duration(maxVisitMs, 150000);
    const dwellMin = duration(dwellMinMs, 12000);
    const dwellMax = Math.max(dwellMin, duration(dwellMaxMs, 22000));
    let options = { enabled: true, ready: false, mode: 'live', busy: false,
      hidden: false, reducedMotion: false, lowPower: false };
    let lastWall = null, elapsed = 0, wasHidden = false;
    let phase = 'absent', generation = 0, stopSerial = 0, stop = null, moving = false;
    let idleSince = null, visitSince = null, dwellUntil = null;
    let nextArrivalDelay = arrivalDelay, reason = '', previousZone = '', stopsSinceEgg = 3;

    function advance(time) {
      const value = Number(time === undefined ? now() : time);
      const wall = Number.isFinite(value) ? value : lastWall === null ? 0 : lastWall;
      if (lastWall !== null && !wasHidden) elapsed += Math.max(0, wall - lastWall);
      lastWall = lastWall === null ? wall : Math.max(lastWall, wall);
    }
    function snapshot() {
      return { phase, generation, stopSerial, moving, reason,
        paused: Boolean(options.hidden),
        stop: stop ? { ...stop, point: { ...stop.point }, easterEgg: stop.easterEgg ? { ...stop.easterEgg } : null } : null };
    }
    function nextStop() {
      const choices = options.reducedMotion ? STOPS.filter(entry => entry.zone === 'sofa')
        : STOPS.filter(entry => entry.zone !== previousZone);
      const station = choose(choices, random);
      const easterEgg = !options.reducedMotion && !options.lowPower && stopsSinceEgg >= 3
        && randomUnit(random) < 0.12 ? choose(EASTER_EGGS, random) : null;
      const dwellMs = Math.round((dwellMin + randomUnit(random) * (dwellMax - dwellMin))
        * (options.lowPower || options.reducedMotion ? 1.75 : 1));
      stop = { zone: station.zone, category: station.zone, point: { ...station.point },
        pose: easterEgg ? easterEgg.pose : choose(station.poses, random),
        prop: easterEgg ? easterEgg.prop : station.prop, dwellMs, easterEgg };
      previousZone = station.zone; stopsSinceEgg = easterEgg ? 0 : stopsSinceEgg + 1;
      stopSerial += 1; moving = true; dwellUntil = null;
    }
    function leave(why) {
      if (phase !== 'leaving') generation += 1;
      phase = 'leaving'; reason = why; stop = null; moving = false;
      idleSince = null; dwellUntil = null;
    }
    function update(input = {}) {
      advance(input.now);
      options = { ...options, ...input }; delete options.now;
      wasHidden = Boolean(options.hidden);
      const permitted = Boolean(options.enabled && options.ready && options.mode === 'live' && !options.busy);
      if (!permitted) {
        idleSince = null; nextArrivalDelay = arrivalDelay;
        const why = options.busy ? 'work' : !options.enabled ? 'disabled' : !options.ready ? 'not-ready' : 'mode';
        if (phase !== 'absent') leave(why);
        return snapshot();
      }
      if (phase === 'leaving' || options.hidden) return snapshot();
      if (phase === 'absent') {
        if (idleSince === null) idleSince = elapsed;
        if (elapsed - idleSince >= nextArrivalDelay) {
          phase = 'arriving'; generation += 1; reason = ''; visitSince = null;
          nextStop();
        }
      } else if (visitSince !== null && elapsed - visitSince >= visitDuration) {
        leave('visit-ended');
      } else if (phase === 'visiting' && !moving && dwellUntil !== null && elapsed >= dwellUntil) {
        nextStop();
      }
      return snapshot();
    }
    function arrived(serial, expectedGeneration = generation) {
      advance();
      if (expectedGeneration !== generation || serial !== stopSerial || !stop
        || !moving || !['arriving', 'visiting'].includes(phase)) return snapshot();
      phase = 'visiting'; moving = false;
      if (visitSince === null) visitSince = elapsed;
      dwellUntil = elapsed + stop.dwellMs;
      return snapshot();
    }
    function departed(expectedGeneration = generation) {
      advance();
      if (phase !== 'leaving' || expectedGeneration !== generation) return snapshot();
      nextArrivalDelay = reason === 'visit-ended' ? returnDelay : arrivalDelay;
      phase = 'absent'; stop = null; moving = false;
      idleSince = null; visitSince = null; dwellUntil = null; reason = '';
      return snapshot();
    }
    function clear() {
      advance(); generation += 1; phase = 'absent'; stop = null; moving = false;
      idleSince = null; visitSince = null; dwellUntil = null; reason = '';
      nextArrivalDelay = arrivalDelay; previousZone = ''; stopsSinceEgg = 3;
      return snapshot();
    }
    return { update, arrived, departed, state: snapshot, clear };
  }

  return { STOPS, EASTER_EGGS, createVisitor, createShuffleBag };
});
