'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Dialogue = require('../lib/visitor-dialogue.js');

test('visitor library has 500 distinct authored bilingual lines across ten room contexts', () => {
  assert.ok(Dialogue.entries.length >= 500);
  assert.equal(new Set(Dialogue.entries.map(entry => entry.id)).size, Dialogue.entries.length);
  assert.equal(new Set(Dialogue.entries.map(entry => entry.zh)).size, Dialogue.entries.length);
  assert.equal(new Set(Dialogue.entries.map(entry => entry.en)).size, Dialogue.entries.length);
  assert.deepEqual(Dialogue.zones, ['library', 'board', 'bench', 'desk', 'sofa', 'window', 'plant', 'door', 'archive', 'front']);
  for (const zone of Dialogue.zones) {
    const entries = Dialogue.forZone(zone);
    assert.equal(entries.length, 50, zone);
    assert.equal(entries.filter(entry => entry.easterEgg).length, 5, zone + ' rare lines');
    for (const entry of entries) {
      assert.equal(entry.zone, zone);
      assert.equal(Dialogue.get(entry.id), entry);
      assert.match(entry.id, /^visitor-[a-z]+-\d{3}$/);
      assert.match(entry.zh, /[\u4e00-\u9fff]/);
      assert.match(entry.en, /[a-zA-Z]/);
      assert.ok(entry.zh.length <= 28, entry.zh + ' should fit a little speech bubble');
      assert.ok(entry.en.length <= 60, entry.en + ' should fit two short lines');
      assert.equal(typeof entry.easterEgg, 'boolean');
      assert.ok(!entry.zh.includes('|') && !entry.en.includes('|'));
      assert.ok(Object.isFrozen(entry));
    }
    assert.ok(Object.isFrozen(entries));
  }
  assert.ok(Object.isFrozen(Dialogue.entries));
  assert.deepEqual(Dialogue.forZone('missing'), []);
  assert.equal(Dialogue.get('missing'), undefined);
});

test('browser content exposes the same library without Node or mutable shared entries', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'visitor-dialogue.js'), 'utf8'), context);
  const browser = context.OfficeVisitorDialogue;
  assert.equal(browser.entries.length, Dialogue.entries.length);
  assert.equal(browser.get('visitor-front-050').en, Dialogue.get('visitor-front-050').en);
  assert.throws(() => { Dialogue.entries[0].zh = 'changed'; }, TypeError);
  assert.throws(() => { Dialogue.forZone('desk').push({}); }, TypeError);
});
