'use strict';
// Bounded renderer recovery. A crashed or hung page is reloaded a few times per
// window; repeated failures stop retrying so a broken build cannot spin.
const LIMITS = Object.freeze({ maxReloads: 3, windowMs: 60000, reloadDelayMs: 1000, hangMs: 15000 });

function createRendererRecovery({
  webContents, reload, log = () => {}, onReset = () => {}, onExhausted = () => {},
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, limits = LIMITS,
} = {}) {
  if (!webContents || typeof webContents.on !== 'function') throw new TypeError('webContents required');
  if (typeof reload !== 'function') throw new TypeError('reload callback required');
  const reloads = [];
  let reloadTimer = null, hangTimer = null, exhausted = false, disposed = false;
  const alive = () => !disposed && !(typeof webContents.isDestroyed === 'function' && webContents.isDestroyed());

  function clearHang() { if (hangTimer) { clearTimer(hangTimer); hangTimer = null; } }
  function gone(_event, details = {}) {
    const reason = details.reason || 'unknown';
    clearHang();
    if (reason === 'clean-exit' || !alive()) return;
    log('renderer-gone', { reason, count: Number.isSafeInteger(details.exitCode) ? details.exitCode : undefined });
    onReset(reason);
    const at = now();
    while (reloads.length && at - reloads[0] > limits.windowMs) reloads.shift();
    if (reloads.length >= limits.maxReloads) {
      if (!exhausted) { exhausted = true; log('renderer-recovery-exhausted', { reason, count: reloads.length }); onExhausted(reason); }
      return;
    }
    reloads.push(at);
    if (reloadTimer) clearTimer(reloadTimer);
    reloadTimer = setTimer(() => {
      reloadTimer = null;
      if (!alive()) return;
      log('renderer-reload', { reason, count: reloads.length });
      Promise.resolve().then(reload).catch(error => log('load-failed', { error }));
    }, limits.reloadDelayMs);
  }
  function unresponsive() {
    if (!alive() || hangTimer) return;
    log('renderer-unresponsive');
    hangTimer = setTimer(() => {
      hangTimer = null;
      if (!alive()) return;
      // Electron reports the forced crash through render-process-gone, which reloads.
      try { webContents.forcefullyCrashRenderer(); } catch (error) { log('load-failed', { error }); }
    }, limits.hangMs);
  }
  function responsive() { if (hangTimer) { clearHang(); log('renderer-responsive'); } }
  function ready() { exhausted = false; }

  webContents.on('render-process-gone', gone);
  webContents.on('unresponsive', unresponsive);
  webContents.on('responsive', responsive);
  return {
    ready,
    status: () => ({ reloads: reloads.length, exhausted, hang: !!hangTimer }),
    dispose() {
      disposed = true; clearHang();
      if (reloadTimer) { clearTimer(reloadTimer); reloadTimer = null; }
      if (typeof webContents.removeListener === 'function') {
        webContents.removeListener('render-process-gone', gone);
        webContents.removeListener('unresponsive', unresponsive);
        webContents.removeListener('responsive', responsive);
      }
    },
  };
}

module.exports = { createRendererRecovery, LIMITS };
