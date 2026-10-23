'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const HomeTokens = require('../renderer/home-token-usage.js');

test('homepage token totals use M, B and T with meaningful fractions below one million', () => {
  for (const [tokens, formatted] of [
    [0, '0M'], [1, '0.000001M'], [50, '0.00005M'], [999, '0.000999M'], [1000, '0.001M'],
    [123456, '0.123M'], [999999, '0.999M'], [1000000, '1M'], [12345678, '12.35M'],
    [1000000000, '1B'], [2345000000, '2.35B'], [1000000000000, '1T'], [1234567890000, '1.23T']
  ]) assert.equal(HomeTokens.formatTokens(tokens), formatted, String(tokens));
  for (const value of [undefined, null, NaN, Infinity, -1, '1000']) assert.equal(HomeTokens.formatTokens(value), '—');
});

function fixture() {
  const nodes = new Map(['home-token-usage', 'home-token-daily-label', 'home-token-weekly-label', 'home-token-daily', 'home-token-weekly', 'home-token-state'].map(id => [id, {
    textContent: '', dataset: {}, title: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }
  }]));
  return { nodes, document: { getElementById: id => nodes.get(id) } };
}
const usage = { date: '2026-10-23', timeZone: 'Asia/Hong_Kong', weekFrom: '2026-10-19', weekTo: '2026-10-25', dailyTokens: 1500000, weeklyTokens: 2400000000,
  available: true, importing: false, lastScanAt: Date.parse('2026-10-23T04:30:00Z'), providers: ['codex', 'claude-code'] };

test('homepage tokens preserve exact counts and natural calendar bounds in bilingual accessible descriptions', () => {
  const { nodes, document } = fixture(), controller = HomeTokens.create({ document });
  assert.equal(nodes.get('home-token-daily').textContent, '—');
  controller.update({ tokenUsage: usage, sessions: [{ id: 'should-not-change-token-totals' }] });
  assert.equal(nodes.get('home-token-daily').textContent, '1.5M'); assert.equal(nodes.get('home-token-weekly').textContent, '2.4B');
  assert.match(nodes.get('home-token-state').textContent, /2026-10-23：1,500,000 tokens/);
  assert.match(nodes.get('home-token-state').textContent, /2026-10-19 至 2026-10-25/);
  controller.updateLanguage('en');
  assert.equal(nodes.get('home-token-daily-label').textContent, 'Daily Token'); assert.equal(nodes.get('home-token-weekly-label').textContent, 'Weekly usage');
  assert.equal(nodes.get('home-token-usage').attributes['aria-label'], 'Token usage');
  assert.match(nodes.get('home-token-state').textContent, /all projects.*Hong Kong calendar days.*Monday–Sunday/);
  assert.match(nodes.get('home-token-state').textContent, /12:30/);
  assert.equal(nodes.get('home-token-usage').title, nodes.get('home-token-state').textContent);
  assert.equal(nodes.get('home-token-usage').dataset.available, 'true');
  controller.updateLanguage('zh'); assert.equal(nodes.get('home-token-daily-label').textContent, '今日 Token');
});

test('homepage import status reports partial counts and unavailable values without inventing zero usage', () => {
  const { nodes, document } = fixture(), controller = HomeTokens.create({ document, language: 'en' });
  controller.update({ ...usage, importing: true });
  assert.equal(nodes.get('home-token-daily').textContent, '1.5M'); assert.equal(nodes.get('home-token-usage').dataset.importing, 'true');
  assert.match(nodes.get('home-token-state').textContent, /Import in progress.*incomplete/);
  controller.update({ ...usage, error: '<img onerror="window.homeXss=1">' });
  assert.match(nodes.get('home-token-state').textContent, /Import or read failed/);
  assert.doesNotMatch(nodes.get('home-token-state').textContent, /onerror/);
  assert.equal(nodes.get('home-token-usage').dataset.error, 'true');
  controller.update({ tokenUsage: { ...usage, available: false, dailyTokens: 0, weeklyTokens: 0 } });
  assert.equal(nodes.get('home-token-daily').textContent, '—'); assert.equal(nodes.get('home-token-weekly').textContent, '—');
  assert.match(nodes.get('home-token-state').textContent, /unavailable/);
  controller.update({ mode: 'live', sessions: [] }); assert.equal(nodes.get('home-token-daily').textContent, '—');
});

test('homepage token sources follow the reported provider coverage without promising live activity support', () => {
  const { nodes, document } = fixture(), controller = HomeTokens.create({ document, language: 'en' });
  controller.update({ ...usage, providers: ['codex', 'claude-code', 'gemini-cli', 'pi', 'omp', 'opencode', 'kimi-cli'] });
  assert.match(nodes.get('home-token-state').textContent, /Log coverage: codex \/ claude-code \/ gemini-cli \/ pi \/ omp \/ opencode \/ kimi-cli/);
  assert.doesNotMatch(nodes.get('home-token-state').textContent, /live activity|all tools|every tool/);
});

test('homepage token module loads without a DOM, timers, Electron, Node globals or side effects', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/home-token-usage.js'), 'utf8'), context, { timeout: 1000 });
  assert.deepEqual(Object.keys(context), ['OfficeHomeTokenUsage']);
  assert.equal(context.OfficeHomeTokenUsage.formatTokens(1000000), '1M');
  assert.equal(typeof context.OfficeHomeTokenUsage.create().update, 'function');
});
