'use strict';

// Only values reported by the native Codex rollout are exposed to the UI.
// The quota is a single observation, not a reconstruction from token usage.
const MAX_CAPTURE_AGE_MS = 10 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 5 * 60 * 1000;
const MAX_DATE_MS = 8.64e15;

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function identity(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Persist only a fixed hint, never a session's raw model name. Codex can use
// the generic `codex` limit ID for Spark, so missing turn context is ambiguous.
function modelHint(value) {
  const model = identity(value);
  if (!model) return null;
  return model === 'gpt-5.3-codex-spark' ? 'spark' : 'main';
}

function normalizeWindow(slot, value, capturedAt) {
  const bucket = object(value);
  if (!bucket) return null;
  const usedPercent = number(bucket.used_percent);
  if (usedPercent === null || usedPercent < 0 || usedPercent > 100) return null;
  const duration = number(bucket.window_minutes);
  const windowMinutes = duration !== null && duration > 0 && duration <= 1e7 ? duration : null;
  const absolute = number(bucket.resets_at);
  const relative = number(bucket.resets_in_seconds);
  let resetAt = null;
  if (absolute !== null && absolute > 0 && absolute * 1000 <= MAX_DATE_MS) {
    resetAt = Math.round(absolute * 1000);
  } else if (relative !== null && relative >= 0 && capturedAt + relative * 1000 <= MAX_DATE_MS) {
    // Relative resets refer to the source observation, not the time at which
    // a previously written line is replayed during an application restart.
    resetAt = Math.round(capturedAt + relative * 1000);
  }
  return { slot, usedPercent, windowMinutes, resetAt };
}

function normalizeObservation({ rateLimits, capturedAt, hint }, now = Date.now()) {
  const limits = object(rateLimits);
  if (!limits || !Number.isFinite(capturedAt) || !Number.isFinite(now)) return null;
  const age = now - capturedAt;
  if (age > MAX_CAPTURE_AGE_MS || age < -MAX_FUTURE_SKEW_MS) return null;
  // A named future/model-specific limit must not silently become the generic
  // allowance. Spark is rejected even when its record says limit_id=codex.
  if (hint !== 'main') return null;
  if (limits.limit_id != null && typeof limits.limit_id !== 'string') return null;
  const limitId = identity(limits.limit_id);
  if (limitId && limitId !== 'codex') return null;
  if (limits.limit_name != null && typeof limits.limit_name !== 'string') return null;
  const limitName = identity(limits.limit_name);
  if (limitName && limitName !== 'codex') return null;
  const windows = ['primary', 'secondary']
    .map(slot => normalizeWindow(slot, limits[slot], capturedAt)).filter(Boolean);
  return windows.length ? { observedAt: capturedAt, windows } : null;
}

function createCodexQuota({ now = Date.now, onChange = () => {} } = {}) {
  let latest = null;
  return Object.freeze({
    observe(input) {
      const next = normalizeObservation(input || {}, now());
      // A whole report wins by its own timestamp. Never combine windows from
      // different records (which may even have come from different accounts).
      if (!next || latest && next.observedAt <= latest.observedAt) return false;
      latest = next;
      onChange();
      return true;
    },
    snapshot() {
      if (!latest) return { available: false, observedAt: null, stale: false, windows: [] };
      const time = now();
      return { available: true, observedAt: latest.observedAt,
        stale: !Number.isFinite(time) || time - latest.observedAt > STALE_AFTER_MS
          || latest.observedAt - time > MAX_FUTURE_SKEW_MS
          || latest.windows.some(window => window.resetAt !== null && window.resetAt <= time),
        windows: latest.windows.map(window => ({ ...window })) };
    },
  });
}

module.exports = { createCodexQuota, modelHint, normalizeObservation, MAX_CAPTURE_AGE_MS, MAX_FUTURE_SKEW_MS, STALE_AFTER_MS };
