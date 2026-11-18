(function (root, factory) {
  'use strict';
  const api = factory(root.OfficeAvatarPerformanceModel, root.OfficeCreaturePerformance, root.OfficePublicArtwork, root.OfficePaintedCreaturePerformance);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAvatarPerformance = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Model, Creature, Artwork, Painted) {
  'use strict';
  // The handle keeps the real actor, route and visible work clock when the
  // avatar style changes. Only the style's internal drawing is replaced.
  function create(options = {}) {
    if (!Model) throw new Error('Avatar performance model must load before its renderer.');
    let session = options.session || {}, inherited = {}, design = Artwork.design(options.design), destroyed = false;
    const clockRegistry = options.clockRegistry || Model.createClockRegistry({ limit: 1 });
    function factory(value) {
      const performance = value.avatarStyle === 'painted' ? Painted : Creature;
      if (!performance) throw new Error('Creature performance must load before selecting its style.');
      return performance.create;
    }
    function construct(value) {
      return factory(value)({ ...options, session, clockRegistry, design: value });
    }
    let renderer = construct(design);
    return Object.freeze({
      update(value = session, next = {}) { session = value; inherited = next; return renderer.update(value, next); },
      setDesign(value = null) {
        if (destroyed) return false;
        value = Artwork.design(value);
        if (factory(value) === factory(design)) { design = value; return renderer.setDesign(value); }
        renderer.update(session, { ...inherited, now: undefined, hidden: true }); renderer.destroy();
        design = value; renderer = construct(design); renderer.update(session, { ...inherited, now: undefined });
        return true;
      },
      locomotion(sample, owner) { return !destroyed && renderer.locomotion(sample, owner); },
      cue(kind, next) { return !destroyed && renderer.cue(kind, next); },
      retry(now) { return !destroyed && Boolean(renderer.retry?.(now)); },
      destroy() { if (!destroyed) { destroyed = true; renderer.destroy(); } },
      get plan() { return renderer.plan; }
    });
  }
  return Object.freeze({ create });
});
