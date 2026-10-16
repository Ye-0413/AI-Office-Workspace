/* Pure choices for original articulated performances. Activity is observation,
 * never a command, a progress estimate or an invented tool result. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAvatarPerformanceModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const ASSET = 'clawd-static-base.svg';
  const KINDS = Object.freeze({ reading: 'folio', searching: 'lens', planning: 'notebook', coding: 'keyboard', designing: 'drafting', testing: 'probe', building: 'assembly', running: 'console', 'waiting-tool': 'listening', 'waiting-user': 'hand', error: 'puzzled' });
  const PROGRAMS = Object.freeze(Object.fromEntries(Object.entries({
    folio: ['read-turn', 'read-annotate', 'read-compare', 'read-scroll', 'read-outline', 'read-footnote', 'read-bookmark', 'read-diagram'],
    lens: ['search-sweep', 'search-index', 'search-compare', 'search-catalogue', 'search-map', 'search-clues', 'search-shelves', 'search-query'],
    notebook: ['plan-chin', 'plan-pencil', 'plan-map', 'plan-temple', 'plan-decompose', 'plan-sequence', 'plan-branches', 'plan-trace'],
    keyboard: ['code-burst', 'code-pointer', 'code-review', 'code-debug', 'code-refactor', 'code-terminal', 'code-patch', 'code-document'],
    drafting: ['design-brush', 'design-swatches', 'design-ruler', 'design-layout', 'design-compass', 'design-type', 'design-trace', 'design-palette'],
    probe: ['test-measure', 'test-notes', 'test-inspect', 'test-cases', 'test-boundary', 'test-calibrate', 'test-reproduce', 'test-compare'],
    assembly: ['build-wrench', 'build-align', 'build-blueprint', 'build-fit', 'build-sort', 'build-wire', 'build-rotate', 'build-stack'],
    console: ['run-watch', 'run-notes', 'run-keyboard', 'run-log', 'run-scroll', 'run-monitor', 'run-reference', 'run-trace'],
    listening: ['wait-chin', 'wait-listen', 'wait-console', 'wait-tray', 'wait-headset', 'wait-bookmark', 'wait-pencil-roll', 'wait-wrist'],
    hand: ['ask-raised', 'ask-card', 'ask-present', 'ask-point-line', 'ask-tilt-card', 'ask-pencil-rest', 'ask-open-folder', 'ask-hand-to-heart'],
    puzzled: ['error-scratch', 'error-review', 'error-magnify', 'error-trace', 'error-overlay', 'error-reference', 'error-mark-place', 'error-set-down']
  }).map(([kind, programs]) => [kind, Object.freeze(programs)])));
  const text = value => typeof value === 'string' ? value : '';
  const PROVIDER_ALIASES = Object.freeze({ claude: 'claude-code', 'claude code': 'claude-code', 'cursor-agent': 'cursor', 'cursor agent': 'cursor' });
  function identityFor(input) {
    const session = input && typeof input === 'object' ? input : {};
    const name = String(session.provider || '').trim().toLowerCase();
    const provider = Object.hasOwn(PROVIDER_ALIASES, name) ? PROVIDER_ALIASES[name] : name || 'agent';
    return JSON.stringify([provider, String(session.id || session.sessionId || '')]);
  }

  // Shared by the room, not by a timer. Only elapsed visible work survives a
  // renderer's destruction; timestamps and playback ownership are lease-local.
  // A new lease for the same full identity invalidates the old one immediately.
  function createClockRegistry({ limit = 2048 } = {}) {
    const capacity = Number.isInteger(limit) && limit > 0 ? limit : 2048;
    const entries = new Map();
    function touch(identity, entry) { entries.delete(identity); entries.set(identity, entry); }
    function trim() {
      for (const [identity, entry] of entries) {
        if (entries.size <= capacity) break;
        if (!entry.owner) entries.delete(identity);
      }
    }
    function open(session) {
      const identity = identityFor(session);
      const entry = entries.get(identity) || { elapsed: new Map(), owner: null };
      const token = {};
      entry.owner = token; touch(identity, entry); trim();
      let lastNow = null, lastKind = '', lastVisible = false, released = false;
      const owns = () => !released && entry.owner === token;
      const elapsed = kind => entry.elapsed.get(kind) || 0;
      function sample(kind, { now, visible = true } = {}) {
        if (!owns()) return elapsed(kind);
        const stamp = Number.isFinite(now) ? now : null;
        if (stamp !== null && lastNow !== null && lastVisible && lastKind) {
          entry.elapsed.set(lastKind, elapsed(lastKind) + Math.max(0, stamp - lastNow));
        }
        lastNow = stamp === null ? null : Math.max(lastNow === null ? stamp : lastNow, stamp);
        lastKind = Object.hasOwn(PROGRAMS, kind) ? kind : '';
        lastVisible = Boolean(visible && lastKind);
        touch(identity, entry); trim();
        return elapsed(kind);
      }
      function release() {
        if (owns()) { entry.owner = null; touch(identity, entry); trim(); }
        released = true; lastNow = null; lastKind = ''; lastVisible = false;
      }
      return Object.freeze({ sample, elapsed, release });
    }
    function clear() { for (const entry of entries.values()) entry.owner = null; entries.clear(); }
    return Object.freeze({ open, clear, get size() { return entries.size; } });
  }
  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    return (result ^ (result >>> 16)) >>> 0;
  }
  function plan(input, options = {}) {
    const session = input && typeof input === 'object' ? input : {};
    const identity = identityFor(session);
    const inactive = reason => ({ active: false, animate: false, kind: 'none', program: '', programIndex: 0, programMs: 0, variant: 0, key: identity + '/' + reason, asset: null, reason, phaseOffset: 0 });
    // Lifecycle, safety, and explicit user feedback each keep one owner.
    if (session.closed || session.status === 'closed') return inactive('closed');
    if (session.disconnected || session.status === 'stale' || options.stale) return inactive('stale');
    if (options.departing) return inactive('departing');
    if (options.walking) return inactive('walking');
    if (options.reaction) return inactive('reaction');
    if (options.hidden) return inactive('hidden');
    const activity = session.activity === 'error' ? 'error' : session.attention === true || session.activity === 'waiting-user' ? 'waiting-user' : text(session.activity);
    const kind = KINDS[activity];
    if (!kind) return inactive('unclassified');
    const seed = hash(identity + '/' + activity);
    const animate = !options.reducedMotion && !options.lowPower;
    const programMs = 18000 + seed % 6001;
    const elapsed = Number.isFinite(options.visibleElapsed) ? Math.max(0, options.visibleElapsed) : 0;
    const programIndex = (seed % PROGRAMS[kind].length + Math.floor(elapsed / programMs)) % PROGRAMS[kind].length;
    const program = PROGRAMS[kind][programIndex];
    return { active: true, animate, kind, program, programIndex, programMs, variant: seed % 3,
      key: identity + '/' + kind + '/' + (seed % 3) + '/' + program, asset: ASSET,
      reason: options.reducedMotion ? 'reduced-motion' : options.lowPower ? 'low-power' : 'observed-' + activity,
      // A static phase offset gives every actor its own rhythm without timers,
      // Math.random(), or restarting a performance at each metadata snapshot.
      phaseOffset: -(seed % 9600) };
  }
  return Object.freeze({ plan, KINDS, PROGRAMS, ASSET, identityFor, createClockRegistry });
});
