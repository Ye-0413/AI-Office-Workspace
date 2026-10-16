/* Complete seasonal workshop paintings, independent of people and floor layout. */
(function (root, factory) {
  'use strict';
  const api = typeof module === 'object' && module.exports
    ? factory(require('./festival-model.js'), require('./venue-model.js'))
    : factory(root.OfficeFestivals, root.OfficeVenues);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeSceneArtwork = api;
})(typeof globalThis === 'object' ? globalThis : this, function (festivals, venues) {
  'use strict';
  const CATALOG = Object.freeze(festivals.THEMES.map(theme => Object.freeze({
    id: theme.id, venue: 'workshop',
    key: 'workshop:' + theme.id,
    background: '../assets/scenes/themes/' + theme.id + '.jpg',
    altZh: '山海工坊 · ' + theme.nameZh + '全景',
    altEn: 'Mountain & Sea Workshop · ' + theme.nameEn + ' room'
  })));
  function resolve(options = {}) {
    const venue = venues.getVenue(options.venue);
    if (venue.id === 'workshop') {
      const theme = festivals.resolve({ theme: options.theme, now: options.now }).theme;
      return CATALOG.find(item => item.id === theme) || CATALOG[0];
    }
    return Object.freeze({id: null, venue: venue.id, key: venue.id,
      background: venue.background, altZh: venue.subtitleZh, altEn: venue.subtitleEn});
  }
  return Object.freeze({ CATALOG, resolve });
});
