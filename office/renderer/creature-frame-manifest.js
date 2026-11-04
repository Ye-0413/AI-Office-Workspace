/* Timing for the four native-grid cels drawn by draw-pixel-companions.cjs.
 * Each cue owns its hold durations, shared across the five materials. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCreatureFrameManifest = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const cues = {
    reading: [3400, [0, .36, .49, .68]],
    searching: [3000, [0, .24, .50, .76]],
    planning: [3600, [0, .22, .47, .71]],
    designing: [3400, [0, .20, .47, .75]],
    coding: [2400, [0, .20, .42, .66]],
    testing: [3200, [0, .23, .57, .81]],
    building: [3600, [0, .23, .48, .74]],
    running: [3000, [0, .25, .50, .75]],
    'waiting-tool': [3600, [0, .50, .63, .80]],
    'waiting-user': [6000, [0, .52, .59, .82]],
    error: [7000, [0, .55, .60, .68]]
  };
  const entries = Object.freeze(Object.fromEntries(Object.entries(cues).map(([activity, [duration, beats]]) =>
    [activity, Object.freeze({ frames: 4, duration, beats: Object.freeze(beats) })]
  )));
  const species = ['folio', 'ink', 'moss', 'thread', 'glow'];
  return Object.freeze({
    cell: 60, span: 120, baseline: 56,
    strips: Object.freeze(Object.fromEntries(species.map(id => [id, entries])))
  });
});
