'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCodexQuota, modelHint, MAX_CAPTURE_AGE_MS, MAX_FUTURE_SKEW_MS, STALE_AFTER_MS } = require('../lib/codex-quota.cjs');

const NOW = Date.parse('2026-11-21T10:00:00Z');
const report = (at = NOW, overrides = {}) => ({ capturedAt: at, hint: 'main', rateLimits: {
  limit_id: 'codex', primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1795287600 },
  secondary: { used_percent: 89, window_minutes: 10080, resets_in_seconds: 7200 }, ...overrides,
} });

test('quota uses reported windows, source time and reset times without estimating balances', () => {
  let time = NOW, changes = 0;
  const quota = createCodexQuota({ now: () => time, onChange: () => changes++ });
  assert.deepEqual(quota.snapshot(), { available: false, observedAt: null, stale: false, windows: [] });
  const capturedAt = NOW - 60000;
  assert.equal(quota.observe(report(capturedAt)), true);
  const result = quota.snapshot();
  assert.equal(changes, 1);
  assert.deepEqual(result, { available: true, observedAt: capturedAt, stale: false, windows: [
    { slot: 'primary', usedPercent: 12.5, windowMinutes: 300, resetAt: 1795287600000 },
    { slot: 'secondary', usedPercent: 89, windowMinutes: 10080, resetAt: capturedAt + 7200000 },
  ] });
  result.windows[0].usedPercent = 100;
  assert.equal(quota.snapshot().windows[0].usedPercent, 12.5, 'snapshots cannot mutate the retained observation');
  time = capturedAt + STALE_AFTER_MS + 1;
  assert.equal(quota.snapshot().stale, true);
});

test('a reset passing marks the observation stale and does not invent a replenishment', () => {
  let time = NOW;
  const quota = createCodexQuota({ now: () => time });
  quota.observe(report(NOW, { primary: { used_percent: 100, window_minutes: 60, resets_in_seconds: 1 }, secondary: null }));
  assert.equal(quota.snapshot().stale, false);
  time += 1000;
  assert.equal(quota.snapshot().stale, true);
  assert.equal(quota.snapshot().windows[0].usedPercent, 100);
});

test('a backward clock correction cannot keep an old observation falsely fresh', () => {
  let time = NOW;
  const quota = createCodexQuota({ now: () => time });
  quota.observe(report());
  time -= MAX_FUTURE_SKEW_MS + 1;
  assert.equal(quota.snapshot().stale, true);
});

test('out of order and incomplete reports do not replace the newest single complete observation', () => {
  const quota = createCodexQuota({ now: () => NOW });
  assert.equal(quota.observe(report(NOW - 1000)), true);
  const latest = quota.snapshot();
  assert.equal(quota.observe(report(NOW - 2000, { primary: { used_percent: 90 }, secondary: null })), false);
  assert.equal(quota.observe(report(NOW - 1000, { primary: { used_percent: 80 }, secondary: null })), false);
  assert.equal(quota.observe(report(NOW, { primary: { used_percent: null }, secondary: { used_percent: '10' } })), false);
  assert.deepEqual(quota.snapshot(), latest);
  assert.equal(quota.observe(report(NOW, { primary: { used_percent: 0, window_minutes: 10080 }, secondary: null })), true);
  assert.deepEqual(quota.snapshot().windows, [{ slot: 'primary', usedPercent: 0, windowMinutes: 10080, resetAt: null }]);
});

test('undated, old, future, unidentified and model-specific reports cannot become generic quota', () => {
  const quota = createCodexQuota({ now: () => NOW });
  assert.equal(modelHint('  GPT-5.3-Codex-Spark '), 'spark');
  assert.equal(modelHint('gpt-6.1-sol'), 'main');
  assert.equal(modelHint(null), null);
  const bad = [
    { ...report(), capturedAt: null }, { ...report(), capturedAt: NOW - MAX_CAPTURE_AGE_MS - 1 },
    { ...report(), capturedAt: NOW + MAX_FUTURE_SKEW_MS + 1 }, { ...report(), hint: null },
    { ...report(), hint: 'spark' }, report(NOW, { limit_id: 'codex_bengalfox' }),
    report(NOW, { limit_id: 'codex_future_model' }), report(NOW, { limit_id: 42 }),
    report(NOW, { limit_id: null, limit_name: 'GPT-5.3-Codex-Spark' }),
    report(NOW, { primary: { used_percent: 101 }, secondary: { used_percent: -1 } }),
  ];
  for (const value of bad) assert.equal(quota.observe(value), false);
  assert.equal(quota.snapshot().available, false);
});

test('missing or invalid optional metadata remains unknown and cannot become zero', () => {
  const quota = createCodexQuota({ now: () => NOW });
  quota.observe(report(NOW, { primary: { used_percent: 5, window_minutes: null, resets_at: null }, secondary: null }));
  assert.deepEqual(quota.snapshot().windows, [{ slot: 'primary', usedPercent: 5, windowMinutes: null, resetAt: null }]);
});
