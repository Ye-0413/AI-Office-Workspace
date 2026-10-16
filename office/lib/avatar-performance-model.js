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
  const text = value => typeof value === 'string' ? value : '';
  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    return (result ^ (result >>> 16)) >>> 0;
  }
  function plan(input, options = {}) {
    const session = input && typeof input === 'object' ? input : {};
    const identity = JSON.stringify([text(session.provider), text(session.id) || text(session.sessionId)]);
    const inactive = reason => ({ active: false, animate: false, kind: 'none', variant: 0, key: identity + '/' + reason, asset: null, reason, phaseOffset: 0 });
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
    return { active: true, animate, kind, variant: seed % 3,
      key: identity + '/' + kind + '/' + (seed % 3), asset: ASSET,
      reason: options.reducedMotion ? 'reduced-motion' : options.lowPower ? 'low-power' : 'observed-' + activity,
      // A static phase offset gives every actor its own rhythm without timers,
      // Math.random(), or restarting a performance at each metadata snapshot.
      phaseOffset: -(seed % 9600) };
  }
  return Object.freeze({ plan, KINDS, ASSET });
});
