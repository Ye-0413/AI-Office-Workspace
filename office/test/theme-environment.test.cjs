'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../renderer/theme-environment.js');
const F = require('../lib/festival-model.js');

test('all 43 themes have complete immutable room recipes with multiple architectural silhouettes', () => {
  assert.equal(E.RECIPES.length, 43);
  assert.deepEqual(E.RECIPES.map(r => r.id).sort(), F.THEMES.map(t => t.id).sort());
  const drawings = new Set();
  for (const recipe of E.RECIPES) {
    assert.ok(recipe.window.length >= 2);
    assert.ok(recipe.edge && recipe.response);
    assert.notEqual(recipe.left.structure, recipe.right.structure);
    for (const group of [recipe.left, recipe.right]) {
      assert.ok(group.objects.length >= 2);
      for (const name of group.objects) assert.ok(E.SILHOUETTES[name], name + ' has an authored shape rather than a fallback icon');
      assert.ok(Object.isFrozen(group) && Object.isFrozen(group.objects));
    }
    drawings.add(JSON.stringify([recipe.window, recipe.left.structure, recipe.left.objects.map(name => E.SILHOUETTES[name]), recipe.right.structure, recipe.right.objects.map(name => E.SILHOUETTES[name]), recipe.edge]));
    assert.ok(Object.isFrozen(recipe));
  }
  assert.equal(drawings.size, 43, 'geometry combinations differ before any colour is applied');
  assert.equal(new Set(E.RECIPES.map(r => E.signature(r.id))).size, 43);
  assert.equal(E.getRecipe('missing').id, 'spring');
  assert.throws(() => { E.RECIPES[0].left.x = 500; }, TypeError);
  assert.throws(() => { E.SILHOUETTES.flower = 'changed'; }, TypeError);
});

test('St Patrick room uses a three-leaf shamrock in every thematic surface', () => {
  const recipe = E.getRecipe('stpatrick');
  assert.equal(recipe.window[0], 'shamrock');
  assert.ok(recipe.left.objects.includes('shamrock'));
  assert.ok(recipe.right.objects.includes('shamrock'));
  assert.equal(recipe.edge, 'shamrocks');
  assert.notEqual(E.SILHOUETTES.shamrock, E.SILHOUETTES.clover);
  assert.equal((E.SILHOUETTES.shamrock.match(/Z/g) || []).length, 3, 'three closed leaf contours and a separate stem');
});
