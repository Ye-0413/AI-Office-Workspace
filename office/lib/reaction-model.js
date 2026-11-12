/* Which finite reaction, if any, a batch of newly observed events earns.
   Only explicit evidence counts: an unknown outcome stays silent, and nothing
   here invents a result, a timer or a message. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeReactionModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const LONG_TURN_MS = 15 * 60 * 1000;
  const CHECKS = new Set(['testing', 'building']);
  // Stronger evidence wins when one snapshot carries several events.
  const PRIORITY = Object.freeze({ sulk: 4, celebrate: 3, stretch: 2, 'tool-success': 1 });

  function reactionFor(event, session = {}) {
    if (!event || typeof event !== 'object') return null;
    if (event.event === 'tool-end') {
      if (CHECKS.has(event.observedActivity)) return event.outcome === 'success' ? 'celebrate' : event.outcome === 'failure' ? 'sulk' : null;
      return event.outcome === 'success' ? 'tool-success' : null;
    }
    if (event.event === 'error') return session.settlementBoundary?.event === 'turn-failed' ? 'sulk' : null;
    if (event.event === 'turn-end') {
      const started = Number(session.turnStartedAt), ended = Number(event.at);
      return started > 0 && ended - started >= LONG_TURN_MS ? 'stretch' : null;
    }
    return null;
  }

  function pick(events, session) {
    let best = null;
    for (const event of Array.isArray(events) ? events : []) {
      const kind = reactionFor(event, session);
      if (kind && (!best || PRIORITY[kind] >= PRIORITY[best])) best = kind;
    }
    return best;
  }

  return Object.freeze({ LONG_TURN_MS, reactionFor, pick });
});
