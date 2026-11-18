'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Appearance = require('../renderer/family-appearance.js');
const Family = require('../lib/family-model.js');

test('helper badges preserve family numbers and translate the depth without changing body artwork', () => {
  const badge = { dataset: {}, setAttribute() {}, remove() { this.removed = true; } };
  const actor = {
    dataset: {},
    ownerDocument: { createElement: () => badge },
    style: new Map(),
    querySelector: () => ({ append(node) { assert.equal(node, badge); } })
  };
  actor.style.setProperty = actor.style.set.bind(actor.style);
  const controller = Appearance.create({ actorNode: actor });
  const registry = Family.createPaletteRegistry();
  registry.update(['root']);
  const appearance = registry.forRoot('root');
  const state = { rootId: 'root', appearance, helper: true, depth: 2 };
  controller.update({ ...state, language: 'en' });
  assert.equal(badge.textContent, '↳' + appearance.badge);
  assert.match(badge.title, /Group .*helper level 2/);
  controller.update({ ...state, language: 'zh' });
  assert.match(badge.title, /同组 .*第 2 层分身/);
  controller.update({ ...state, appearance: { color: 'invalid colour' } });
  assert.equal(actor.style.get('--family-color'), appearance.color);
  assert.equal(actor.dataset.appearanceFamily, 'root');
  controller.destroy();
  assert.equal(badge.removed, true);
});
