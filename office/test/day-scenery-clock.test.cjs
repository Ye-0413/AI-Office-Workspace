'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DayCycle = require('../lib/day-cycle.js');

// Exercise the production lightweight clock refresh without starting Electron,
// scenery animation, a timer, or any provider observation.
function clockFixture() {
  const source = fs.readFileSync(path.join(__dirname, '../renderer/day-scenery.js'), 'utf8');
  const start = source.indexOf('    function updateClock(');
  const end = source.indexOf('    function update(', start);
  assert.ok(start >= 0 && end > start);
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { textContent: '', dateTime: '', hidden: false, style: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; }, querySelector: selector => node(selector) });
    return nodes.get(key);
  };
  const context = vm.createContext({ root: { OfficeDayCycle: DayCycle }, document: { getElementById: node, querySelector: node } });
  vm.runInContext(source.slice(start, end), context);
  return { update: context.updateClock, node };
}

test('lightweight refresh localizes the complete Hong Kong date and exposes a local date-only time element', () => {
  const { update, node } = clockFixture();
  const before = Date.parse('2026-10-16T15:59:59Z');
  const midnight = before + 1000;
  update({ sceneTime: 'dawn' }, 'zh', before);
  assert.equal(node('hk-clock').textContent, '23:59');
  assert.equal(node('hk-date').textContent, '2026年10月16日 星期五');
  assert.equal(node('hk-date').dateTime, '2026-10-16');
  update({ sceneTime: 'dawn' }, 'zh', midnight);
  assert.equal(node('hk-clock').textContent, '00:00');
  assert.equal(node('hk-date').textContent, '2026年10月17日 星期六');
  assert.equal(node('hk-date').dateTime, '2026-10-17', 'the calendar is already Saturday although the UTC date is still Friday');
  assert.equal(node('hk-clock').dateTime, '2026-10-16T16:00:00.000Z', 'the digital time still represents the actual instant');
  assert.equal(node('day-phase').textContent, '晨曦 · 预览');
  assert.match(node('day-clock').attributes['aria-label'], /2026年10月17日 星期六/);
  update({ sceneTime: 'dawn' }, 'en', midnight);
  assert.equal(node('hk-date').textContent, 'Sat, 17 Oct 2026');
  assert.equal(node('hk-date').dateTime, '2026-10-17');
  assert.equal(node('day-phase').textContent, 'Dawn · Preview');
  assert.match(node('day-clock').attributes['aria-label'], /^Hong Kong time 00:00 · Sat, 17 Oct 2026/);
  assert.doesNotMatch(node('day-clock').attributes['aria-label'], /\p{Script=Han}/u);
  assert.equal(node('day-reset').hidden, false);
});
