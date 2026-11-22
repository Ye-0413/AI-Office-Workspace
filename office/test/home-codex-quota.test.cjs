'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Quota = require('../renderer/home-codex-quota.js');

function fixture() {
  const ids = ['activity-stats', 'home-codex-quota', 'home-codex-quota-toggle', 'home-codex-quota-details', 'home-codex-quota-label', 'home-codex-quota-status', 'home-codex-quota-details-title', 'home-codex-quota-details-status', 'home-codex-quota-source', 'home-codex-quota-observed', 'home-codex-quota-accessible'];
  for (const slot of ['primary', 'secondary']) for (const suffix of ['', '-label', '-value', '-fill', '-detail', '-detail-label', '-detail-value']) ids.push(`home-codex-quota-${slot}${suffix}`);
  const nodes = new Map(ids.map(id => [id, { id, textContent: '', dataset: {}, style: {}, hidden: false, attributes: {}, listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; }, removeEventListener(name) { delete this.listeners[name]; },
    contains(node) { return node === this || node === nodes.get('home-codex-quota-toggle') || node === nodes.get('home-codex-quota-details'); }, focus() { doc.activeElement = this; }
  }]));
  const doc = { activeElement: null, listeners: {}, getElementById: id => nodes.get(id),
    addEventListener(name, fn) { this.listeners[name] = fn; }, removeEventListener(name) { delete this.listeners[name]; } };
  return { nodes, document: doc };
}
const observedAt = Date.parse('2026-10-23T04:30:00Z');
const quota = { available: true, observedAt, stale: false, windows: [
  { slot: 'primary', usedPercent: 31.5, windowMinutes: 300, resetAt: observedAt + 5 * 60 * 60 * 1000 },
  { slot: 'secondary', usedPercent: 89, windowMinutes: 10080, resetAt: observedAt + 7 * 24 * 60 * 60 * 1000 }
] };

test('quota meter identifies actual durations and percentage remaining without rounding a nonzero balance to zero', () => {
  assert.equal(Quota.formatRemaining(31.5), '68.5%');
  assert.equal(Quota.formatRemaining(100), '0%');
  assert.equal(Quota.formatRemaining(99.99), '<0.1%');
  assert.equal(Quota.formatRemaining(0.01), '>99.9%');
  for (const invalid of [-1, 101, '10', null, Infinity, NaN]) assert.equal(Quota.formatRemaining(invalid), '—');
  assert.equal(Quota.formatDuration(300, 'en', true), '5h');
  assert.equal(Quota.formatDuration(10080, 'zh'), '7 天');
  assert.equal(Quota.formatDuration(95, 'en'), '95 minutes');
  assert.equal(Quota.formatDuration(null, 'en'), null);
});

test('the indicator exposes both observed windows, Hong Kong times and source details in both languages', () => {
  const { nodes, document } = fixture(), controller = Quota.create({ document, language: 'en' });
  assert.equal(nodes.get('home-codex-quota-primary-value').textContent, '—');
  assert.equal(nodes.get('home-codex-quota').dataset.state, 'unavailable');
  controller.update({ codexQuota: quota, sessions: [{ id: 'unrelated' }] });
  assert.equal(nodes.get('home-codex-quota-primary-label').textContent, '5h');
  assert.equal(nodes.get('home-codex-quota-primary-value').textContent, '68.5%');
  assert.equal(nodes.get('home-codex-quota-primary-fill').style.width, '68.5%');
  assert.equal(nodes.get('home-codex-quota-secondary-label').textContent, '7d');
  assert.equal(nodes.get('home-codex-quota-secondary-value').textContent, '11%');
  assert.equal(nodes.get('home-codex-quota-secondary').dataset.level, 'low');
  assert.match(nodes.get('home-codex-quota-accessible').textContent, /Primary window · 5 hours: 68\.5% remaining.*17:30.*Secondary window · 7 days/);
  assert.match(nodes.get('home-codex-quota-accessible').textContent, /Observed:.*12:30.*different accounts.*not a cash balance/);
  controller.updateLanguage('zh');
  assert.equal(nodes.get('home-codex-quota-label').textContent, 'Codex 额度');
  assert.equal(nodes.get('home-codex-quota-primary-label').textContent, '5时');
  assert.match(nodes.get('home-codex-quota-accessible').textContent, /第一时段 · 5 小时.*剩余 68\.5%.*12:30.*不同账号/);
});

test('stale, missing, malformed and partial observations are represented without inventing an allowance or duration', () => {
  const { nodes, document } = fixture(), controller = Quota.create({ document, language: 'en' });
  controller.update({ codexQuota: { ...quota, stale: true, windows: [{ slot: 'secondary', usedPercent: 0, windowMinutes: null, resetAt: null }] } });
  assert.equal(nodes.get('home-codex-quota').dataset.state, 'stale');
  assert.equal(nodes.get('home-codex-quota-status').textContent, 'Stale');
  assert.equal(nodes.get('home-codex-quota-primary').hidden, true);
  assert.equal(nodes.get('home-codex-quota-secondary').hidden, false);
  assert.equal(nodes.get('home-codex-quota-secondary-value').textContent, '100%');
  assert.match(nodes.get('home-codex-quota-accessible').textContent, /duration not reported.*Reset time not reported/);
  controller.update({ codexQuota: { ...quota, windows: [{ slot: 'primary', usedPercent: -1 }, { slot: 'other', usedPercent: 10 }] } });
  assert.equal(nodes.get('home-codex-quota').dataset.state, 'unavailable');
  assert.equal(nodes.get('home-codex-quota-primary-value').textContent, '—');
  controller.update({ codexQuota: { ...quota, available: false } });
  assert.equal(nodes.get('home-codex-quota').dataset.state, 'unavailable');
  controller.update({ codexQuota: { ...quota, observedAt: null } });
  assert.equal(nodes.get('home-codex-quota').dataset.state, 'unavailable');
});

test('the details card opens and closes by click or Escape without losing keyboard focus', () => {
  const { nodes, document } = fixture(), controller = Quota.create({ document, language: 'en' });
  const toggle = nodes.get('home-codex-quota-toggle'), details = nodes.get('home-codex-quota-details');
  toggle.focus(); toggle.listeners.click();
  assert.equal(details.hidden, false); assert.equal(toggle.attributes['aria-expanded'], 'true');
  let stopped = false; document.listeners.keydown({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
  assert.equal(details.hidden, true); assert.equal(toggle.attributes['aria-expanded'], 'false');
  assert.equal(document.activeElement, toggle); assert.equal(stopped, true);
  toggle.listeners.click(); document.listeners.pointerdown({ target: {} }); assert.equal(details.hidden, true);
  controller.destroy(); assert.equal(document.listeners.keydown, undefined);
});

test('quota renderer loads without DOM, timers, Electron or network side effects', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/home-codex-quota.js'), 'utf8'), context, { timeout: 1000 });
  assert.deepEqual(Object.keys(context), ['OfficeHomeCodexQuota']);
  assert.equal(typeof context.OfficeHomeCodexQuota.create().update, 'function');
});
