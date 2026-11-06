/* Playback and atlas layout shared by the pixel artist and renderer. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCreatureFrameManifest = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const fps = 30, columns = 12;
  const durations = {
    reading: 3400, searching: 3000, planning: 3600, designing: 3400, coding: 2400,
    testing: 3200, building: 3600, running: 3000, 'waiting-tool': 3600, 'waiting-user': 6000, error: 7000
  };
  const entries = Object.freeze(Object.fromEntries(Object.entries(durations).map(([activity, duration]) =>
    [activity, Object.freeze({ duration, frames: Math.ceil(duration * fps / 1000) })]
  )));
  const species = ['folio', 'ink', 'moss', 'thread', 'glow'];
  return Object.freeze({
    fps, columns, cell: 68, span: 136, baseline: 60,
    strips: Object.freeze(Object.fromEntries(species.map(id => [id, entries])))
  });
});
