/* The repertoire is choreography, not state evidence. Every recipe remains
 * inside the observed activity and uses the same creature and family colour. */
(function (root, factory) {
  'use strict';
  const packs = typeof module === 'object' && module.exports
    ? Object.fromEntries(['folio', 'ink', 'moss', 'thread', 'glow'].map(id => [id, require('./repertoire-' + id + '.js')]))
    : root.OfficeCreatureRepertoires;
  const api = factory(packs);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCreatureRepertoire = api;
})(typeof globalThis === 'object' ? globalThis : this, function (packs) {
  'use strict';
  const SPECIES = Object.freeze(['folio', 'ink', 'moss', 'thread', 'glow']);
  const ACTIVITIES = Object.freeze(['reading', 'searching', 'planning', 'coding', 'designing', 'testing', 'building', 'running', 'waiting-tool', 'waiting-user', 'error']);
  const EASINGS = Object.freeze({ organic: 'cubic-bezier(.37,0,.63,1)', move: 'cubic-bezier(.77,0,.175,1)', settle: 'cubic-bezier(.23,1,.32,1)', linear: 'linear' });
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze); if (!Object.isFrozen(value)) Object.freeze(value);
    }
    return value;
  }
  const catalog = freeze(Object.fromEntries(SPECIES.map(id => [id, packs?.[id] || { species: id, states: {} }])));
  function recipes(species, activity) { return catalog[species]?.states[activity] || []; }
  function seed(value) {
    let result = 2166136261;
    for (const character of String(value)) { result ^= character.codePointAt(0); result = Math.imul(result, 16777619); }
    return result >>> 0;
  }
  function orderFor(identity, activity, count = 10) {
    const value = seed(String(identity) + '\u0000' + activity), first = value % count;
    // All authored packs have ten variants; a coprime stride visits each one
    // exactly once before repeating, without a biased random draw every tick.
    const stride = count === 10 ? [1, 3, 7, 9][(value >>> 8) % 4] : 1;
    return Array.from({ length: count }, (_, index) => (first + index * stride) % count);
  }
  function repetitions(activity) { return ['waiting-tool', 'waiting-user', 'error'].includes(activity) ? 2 : 3; }
  function select(species, activity, identity = '', visibleElapsed = 0, previewIndex) {
    const variants = recipes(species, activity);
    if (!variants.length) return null;
    const order = orderFor(identity, activity, variants.length), repeat = repetitions(activity);
    if (Number.isInteger(previewIndex) && previewIndex >= 0 && previewIndex < variants.length) {
      return { recipe: variants[previewIndex], index: previewIndex, order, position: order.indexOf(previewIndex), repeat, phase: 0, preview: true };
    }
    const total = order.reduce((sum, index) => sum + variants[index].duration * repeat, 0);
    let time = Number.isFinite(visibleElapsed) ? Math.max(0, visibleElapsed) % total : 0;
    for (let position = 0; position < order.length; position++) {
      const index = order[position], recipe = variants[index], span = recipe.duration * repeat;
      if (time < span) return { recipe, index, order, position, repeat, phase: time, preview: false };
      time -= span;
    }
    return null;
  }
  function next(species, activity, selection) {
    const position = (selection.position + 1) % selection.order.length, index = selection.order[position];
    return { ...selection, recipe: recipes(species, activity)[index], index, position, phase: 0 };
  }
  return Object.freeze({ catalog, SPECIES, ACTIVITIES, EASINGS, recipes, select, next, orderFor, repetitions });
});
