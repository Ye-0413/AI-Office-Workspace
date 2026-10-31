/* User-owned display size. Observation never rewrites the saved preference. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfficeSizeStability = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CLONE_RATIO = .8;
  const CLONE_FRAME_RATIO = .82;
  const PRESENTATION_SCALE = 1.8;
  // Current workshop paint and the 176×76 nameplate, including motion margin.
  // Legacy reference/visitor geometry remains in Scene.ACTOR_FOOTPRINT.
  const ACTOR_FOOTPRINT = Object.freeze({
    root: Object.freeze({ left: 94, right: 94, top: 150, bottom: 106 }),
    helper: Object.freeze({ left: 79, right: 79, top: 98, bottom: 91 })
  });
  const preference = value => Number.isFinite(value) && value > 0 ? Math.max(.65, Math.min(1.35, value)) : 1;
  const bodyRatio = session => session?.parentId ? CLONE_RATIO : 1;
  // The SVG source is painted around (77.5,115), inside a 154px canvas
  // centred in the existing 176px button. The helper frame scales around
  // (88,129), fourteen pixels below the source feet. These bounds include
  // the activity clip's three-pixel overhang below the feet, before the
  // renderer adds its shared six-pixel motion/focus margin.
  function bodyFootprint(session) {
    const scale = PRESENTATION_SCALE * bodyRatio(session);
    const frame = session?.parentId ? CLONE_FRAME_RATIO : 1;
    const floorOffset = 14 * (1 - frame);
    return { left: (40 * scale - .5) * frame, right: (40 * scale + .5) * frame,
      top: 80 * scale * frame - floorOffset, bottom: 3 * scale * frame + floorOffset };
  }
  function create(options = {}) {
    let requested = preference(options.requestedScale);
    return Object.freeze({
      maximum: () => requested,
      request(value) { requested = preference(value); },
      // Counts and layout observations cannot change the chosen size.
      observe() {}
    });
  }
  return Object.freeze({ create, bodyRatio, bodyFootprint, CLONE_RATIO, CLONE_FRAME_RATIO, PRESENTATION_SCALE, ACTOR_FOOTPRINT });
});
