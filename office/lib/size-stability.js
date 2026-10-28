/* User-owned maximum size. Fitting never rewrites the saved preference. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfficeSizeStability = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CLONE_RATIO = .8;
  const preference = value => Number.isFinite(value) && value > 0 ? Math.max(.65, Math.min(1.35, value)) : 1;
  const bodyRatio = session => session?.parentId ? CLONE_RATIO : 1;
  function create(options = {}) {
    let requested = preference(options.requestedScale);
    return Object.freeze({
      maximum: () => requested,
      request(value) { requested = preference(value); },
      // The full-cast allocator may draw smaller bodies to fit everyone;
      // observation never changes the user's chosen maximum.
      observe() {}
    });
  }
  return Object.freeze({ create, bodyRatio, CLONE_RATIO });
});
