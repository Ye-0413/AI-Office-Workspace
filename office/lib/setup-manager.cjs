'use strict';

const { randomUUID } = require('node:crypto');
const { PROVIDER_IDS, normalizeProviderId } = require('./provider-catalog.cjs');
const plain = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 4096) : '';
function parameters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => key !== 'retryFailed')
    || value.retryFailed !== undefined && typeof value.retryFailed !== 'boolean') throw new TypeError('Invalid setup options');
  return value.retryFailed === true;
}
function detail(...values) { return [...new Set(values.map(plain).filter(Boolean))].join('\n'); }

// A batch only coordinates the existing passive installers. Detection does not
// grant approval, configure trust, send messages or start any model/tool task.
function createSetupManager({ getConnections, connect, onChange = () => {}, now = Date.now } = {}) {
  if (typeof getConnections !== 'function' || typeof connect !== 'function' || typeof onChange !== 'function' || typeof now !== 'function') throw new TypeError('Setup manager requires bridge callbacks');
  let state = { running: false, runId: null, startedAt: null, finishedAt: null, rows: [] }, current = null;
  const notify = () => { try { const result = onChange(); if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {}); } catch {} };
  function snapshot() {
    const rows = state.rows.map(row => ({ ...row })), totals = { configured: 0, failed: 0, skipped: 0, pending: 0 };
    for (const row of rows) totals[row.status === 'configuring' ? 'pending' : row.status]++;
    return { ...state, rows, totals };
  }
  function clock() { const value = now(); if (!Number.isFinite(value) || value < 0) throw new Error('Setup clock is unavailable'); return Math.floor(value); }
  function inspect() {
    const connections = getConnections();
    if (!Array.isArray(connections)) throw new Error('Connection detection is unavailable');
    const values = new Map();
    for (const connection of connections) {
      if (!connection || typeof connection !== 'object') continue;
      const provider = normalizeProviderId(connection.provider);
      if (!provider) continue;
      const old = values.get(provider);
      values.set(provider, {
        provider, available: connection.available === true || old?.available === true,
        installed: connection.installed === true || old?.installed === true,
        watching: connection.watching === true || old?.watching === true,
        detail: detail(old?.detail, connection.detail)
      });
    }
    return values;
  }
  function run(options = {}) {
    const retry = parameters(options);
    if (current) return current;
    let resolve;
    const pending = new Promise(done => { resolve = done; }); current = pending;
    const previous = new Map(state.rows.map(row => [row.provider, row]));
    state = { running: true, runId: randomUUID(), startedAt: null, finishedAt: null, rows: state.rows.map(row => ({ ...row })) };
    try { state.startedAt = clock(); } catch (error) { state.error = plain(error.message) || 'Setup clock is unavailable'; }
    notify();
    async function execute() {
      try {
        if (state.error) return;
        const detected = inspect();
        state.rows = PROVIDER_IDS.flatMap(provider => {
          const observed = detected.get(provider) || { provider, available: false, installed: false, watching: false, detail: '' };
          const old = previous.get(provider), eligible = observed.available || observed.installed;
          if (retry && old?.status !== 'failed') return old ? [{ ...old, available: observed.available, installed: observed.installed, watching: observed.watching }] : [];
          return [{ ...observed, status: eligible ? 'pending' : 'skipped', detail: eligible ? observed.detail : detail('Tool not detected; no configuration was created.', observed.detail) }];
        });
        notify();
        for (const row of state.rows) {
          if (row.status !== 'pending') continue;
          row.status = 'configuring'; notify();
          let result;
          try { result = await connect(row.provider); }
          catch (error) { result = { status: 'error', message: plain(error?.message) || 'Configuration failed' }; }
          let observed;
          try { observed = inspect().get(row.provider); }
          catch (error) { state.error = detail(state.error, 'Could not refresh connection status.', error?.message); }
          if (observed) Object.assign(row, { available: observed.available, installed: observed.installed, watching: observed.watching });
          if (typeof result?.installed === 'boolean') row.installed = result.installed;
          const success = ['ok', 'unchanged'].includes(result?.status) && row.installed;
          row.status = success ? 'configured' : 'failed';
          row.detail = detail(result?.detail, result?.message, observed?.detail)
            || (success ? 'Observation configuration installed; real events are still required to confirm activity.' : 'Configuration did not complete.');
          notify();
        }
      } catch (error) {
        state.error = plain(error?.message) || 'Setup failed';
        for (const row of state.rows) if (['pending', 'configuring'].includes(row.status)) { row.status = 'failed'; row.detail = detail(row.detail, state.error); }
      } finally {
        try { state.finishedAt = clock(); } catch (error) { state.error = detail(state.error, error?.message); }
        state.running = false; const completed = snapshot(); current = null; notify(); resolve(completed);
      }
    }
    void execute();
    return pending;
  }
  return Object.freeze({ run, snapshot, get running() { return state.running; } });
}
module.exports = { createSetupManager };
