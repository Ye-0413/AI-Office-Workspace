/* The public application renders only these five independently authored sheets. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficePublicArtwork = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const IDS = Object.freeze(['folio', 'ink', 'moss', 'thread', 'glow']);
  const ASSETS = Object.freeze(IDS.map(id => 'workshop-' + id + '.png'));
  const DEFAULT = Object.freeze({ id: 'folio', renderer: 'creature', asset: ASSETS[0], poseColumns: 3, poseRows: 2, variantIndex: 0, appearanceKey: 'folio:0' });
  function asset(value) { return ASSETS.includes(value) ? value : DEFAULT.asset; }
  function design(value) {
    if (!value || !IDS.includes(value.id)) return DEFAULT;
    const expected = 'workshop-' + value.id + '.png';
    if (value.renderer === 'creature' && value.asset === expected && value.poseColumns === 3 && value.poseRows === 2) return value;
    return { ...value, renderer: 'creature', asset: expected, poseColumns: 3, poseRows: 2 };
  }
  return Object.freeze({ IDS, ASSETS, DEFAULT, asset, design });
});
