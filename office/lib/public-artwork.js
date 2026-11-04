/* The public application uses independently authored sheets for both avatar styles. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficePublicArtwork = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const IDS = Object.freeze(['folio', 'ink', 'moss', 'thread', 'glow']);
  const ASSETS = Object.freeze(IDS.map(id => 'workshop-' + id + '.png'));
  const PAINTED_ASSETS = Object.freeze(IDS.map(id => 'painted-' + id + '.png'));
  const DEFAULT = Object.freeze({ id: 'folio', renderer: 'creature', asset: ASSETS[0], poseColumns: 3, poseRows: 2, variantIndex: 0, appearanceKey: 'folio:0' });
  function normalizeStyle(value) { return value === 'painted' ? 'painted' : 'pixel'; }
  function asset(value) { return ASSETS.includes(value) || PAINTED_ASSETS.includes(value) ? value : DEFAULT.asset; }
  function design(value, style = value?.avatarStyle) {
    const base = value && IDS.includes(value.id) ? value : DEFAULT;
    const appearance = normalizeStyle(style);
    const expected = (appearance === 'painted' ? 'painted-' : 'workshop-') + base.id + '.png';
    if (base.renderer === 'creature' && base.asset === expected && base.poseColumns === 3 && base.poseRows === 2
      && normalizeStyle(base.avatarStyle) === appearance) return base;
    return { ...base, avatarStyle: appearance, renderer: 'creature', asset: expected, poseColumns: 3, poseRows: 2 };
  }
  return Object.freeze({ IDS, ASSETS, PAINTED_ASSETS, DEFAULT, normalizeStyle, asset, design });
});
