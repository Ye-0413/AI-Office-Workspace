'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createCodexMonitor } = require('../lib/codex-monitor.cjs');
const { mergeObservationHealth, ROLLOUT_HEALTHY, ROLLOUT_ERROR_PREFIX } = require('../lib/observation-health.cjs');
const I18n = require('../lib/i18n-model.js');

const hooks = (watching = false) => ({ provider: 'codex', watching, installed: watching, lastEventAt: 200, detail: 'Hook source detail' });

test('a rollout permission error is visible and cannot make a disconnected source look healthy', t => {
  const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  const monitor = createCodexMonitor({
    codexHome: '/read-only-test/codex', onEvent() {},
    fs: { ...fs, readdirSync() { throw denied; } },
  });
  t.after(() => monitor.stop());
  monitor.start();
  const status = monitor.status();
  assert.equal(status.running, true, 'the polling timer continues for recovery');
  assert.equal(status.error, 'Read session directory: permission denied');
  const connection = hooks();
  const merged = mergeObservationHealth(connection, status);
  assert.equal(merged.watching, false);
  assert.equal(merged.monitorError, status.error);
  assert.equal(merged.detail, connection.detail + ' · ' + ROLLOUT_ERROR_PREFIX + status.error);
  assert.deepEqual(connection, hooks(), 'health composition never changes the hook source');
});

test('healthy hooks remain observable when the independent rollout source faults', () => {
  const connection = hooks(true), error = 'Read session directory: permission denied';
  const merged = mergeObservationHealth(connection, { running: true, error });
  assert.equal(merged.watching, true);
  assert.equal(merged.installed, true);
  assert.equal(merged.lastEventAt, connection.lastEventAt);
  assert.equal(merged.monitorError, error);
  assert.equal(merged.detail, connection.detail + ' · ' + ROLLOUT_ERROR_PREFIX + error);
});

test('healthy rollout recovery restores its observation and removes the old diagnostic', () => {
  const connection = hooks();
  const merged = mergeObservationHealth(connection, { running: true, error: null }, [
    { provider: 'codex', lastEventAt: 350 }, { provider: 'claude-code', lastEventAt: 999 },
    { provider: 'codex', lastEventAt: NaN },
  ]);
  assert.equal(merged.watching, true);
  assert.equal(merged.monitorError, null);
  assert.equal(merged.lastEventAt, 350);
  assert.equal(merged.detail, connection.detail + ' · ' + ROLLOUT_HEALTHY);
});

test('a stopped rollout source adds no healthy claim and other providers keep their own health', () => {
  const connection = hooks();
  const merged = mergeObservationHealth(connection, { running: false, error: null });
  assert.equal(merged.watching, false);
  assert.equal(merged.detail, connection.detail);
  const claude = { provider: 'claude-code', watching: true, detail: 'Native hook' };
  assert.equal(mergeObservationHealth(claude, { running: true, error: 'unrelated fault' }), claude);
});

test('the observation diagnostic translates its fixed label while preserving the native error verbatim', () => {
  const diagnostic = "Read session directory: EACCES: permission denied, scandir '/项目 · Codex  sessions'";
  const chinese = ROLLOUT_ERROR_PREFIX + diagnostic;
  const english = 'Local rollout observation error: ' + diagnostic;
  assert.equal(I18n.translate('en', chinese), english);
  assert.equal(I18n.translate('zh', english), chinese);
  const sourceDetail = '被动观察配置；仅收到真实事件后确认客户端生效';
  const composite = mergeObservationHealth({ ...hooks(), detail: sourceDetail }, { running: true, error: diagnostic });
  const translated = I18n.translate('en', composite.detail);
  assert.equal(translated, I18n.translate('en', sourceDetail) + ' · ' + english);
  assert.equal(I18n.translate('zh', translated), composite.detail);
  const ordinaryText = 'Review EACCES in project /项目/Codex sessions';
  assert.equal(I18n.translate('zh', ordinaryText), ordinaryText);
});
