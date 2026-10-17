/* One shared body size per occupied-room episode. No session identity/state. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfficeSizeStability = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const preference = value => Number.isFinite(value) && value > 0 ? Math.max(.65, Math.min(1.35, value)) : 1;
  function create(options = {}) {
    let requested = preference(options.requestedScale), ceiling = null, manual = false;
    return Object.freeze({
      maximum: () => Math.min(requested, ceiling === null ? requested : ceiling),
      request(value) { requested = preference(value); ceiling = null; manual = true; },
      observe({ count, uniformScale, targetUniformScale } = {}) {
        if (count === 0) { ceiling = null; manual = false; return; }
        if (!(count > 0) || !Number.isFinite(uniformScale) || uniformScale <= 0) return;
        // The existing allocator may first walk at a smaller safe size. Only
        // an explicit slider/refit request may wait for that larger endpoint.
        if (manual && Number.isFinite(targetUniformScale) && targetUniformScale > uniformScale + 1e-6) return;
        ceiling = Math.min(requested, uniformScale, ceiling === null ? Infinity : ceiling);
        manual = false;
      }
    });
  }
  return Object.freeze({ create });
});
