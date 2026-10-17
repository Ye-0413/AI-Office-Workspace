'use strict';

// Native window evidence supplements Chromium's Page Visibility API. Read-only:
// never shows, hides, restores, focuses or changes the BrowserWindow itself.
function createWindowVisibility({window, getAppHidden, onChange = () => {}, watch = false} = {}) {
  if (!window || typeof window.isVisible !== 'function' || typeof window.isMinimized !== 'function'
      || typeof window.on !== 'function' || typeof window.removeListener !== 'function'
      || getAppHidden !== undefined && typeof getAppHidden !== 'function' || typeof onChange !== 'function'
      || typeof watch !== 'boolean') {
    throw new TypeError('Window visibility requires native predicates and event subscriptions');
  }
  let disposed = false, reading = false, confirmed = null;
  let settlement = null, timer = null, watcher = null, generation = 0;
  let state = {available:false,hidden:null,visible:null,minimized:null,appHidden:null};
  function snapshot() {
    if (disposed || reading) return {...state};
    reading = true;
    try {
      const visible = window.isVisible(), minimized = window.isMinimized();
      const appHidden = getAppHidden === undefined ? null : getAppHidden();
      if (typeof visible !== 'boolean' || typeof minimized !== 'boolean'
          || appHidden !== null && typeof appHidden !== 'boolean'
          || getAppHidden !== undefined && appHidden === null) throw new TypeError('Native visibility is not confirmed');
      confirmed = {hidden:!visible || minimized || appHidden === true,visible,minimized,appHidden};
      state = {available:true,...confirmed};
    } catch (_) {
      // A failed read does not prove a previously hidden window became visible.
      // Unknown initial state stays null, so the renderer can use its document.
      state = {available:false,...(confirmed || {hidden:null,visible:null,minimized:null,appHidden:null})};
    } finally { reading = false; }
    return {...state};
  }
  // Establish a silent baseline. Polling snapshot() may observe a later change,
  // but cannot consume the next refresh notification or recursively broadcast.
  let notifiedHidden = snapshot().hidden;
  function cancelSettlement() {
    generation++;
    settlement = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function refresh() {
    const next = snapshot();
    if (settlement && next.available && next.hidden === settlement.expectedHidden) cancelSettlement();
    if (disposed || !next.available || next.hidden === notifiedHidden) return next;
    notifiedHidden = next.hidden;
    try {
      const result = onChange({...next});
      if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
    } catch (_) {}
    return next;
  }
  function schedule(owner) {
    if (disposed || settlement !== owner || owner.generation !== generation) return;
    // Both limits apply: system-clock rollback cannot create an eternal lease,
    // and repeated same-direction events never renew this owner's deadline.
    if (Date.now() >= owner.deadline || owner.attempts >= 60) { cancelSettlement(); return; }
    if (timer !== null) return;
    timer = setTimeout(() => {
      // A late obsolete callback must not clear a newer generation's handle.
      if (disposed || settlement !== owner || owner.generation !== generation) return;
      timer = null;
      owner.attempts++;
      refresh();
      schedule(owner);
    }, Math.min(50, Math.max(1, owner.deadline - Date.now())));
    timer.unref?.();
  }
  function nativeEvent(expectedHidden) {
    if (disposed) return;
    if (!settlement || settlement.expectedHidden !== expectedHidden) {
      cancelSettlement();
      settlement = {expectedHidden,deadline:Date.now()+3000,attempts:0,generation};
    }
    const owner = settlement;
    // Event direction is only a retry hint. refresh() exclusively uses real
    // boolean predicates, retains failed-read evidence and owns notifications.
    refresh();
    schedule(owner);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelSettlement();
    if (watcher !== null) clearInterval(watcher);
    watcher = null;
    for (const [event, handler] of handlers) window.removeListener(event, handler);
  }
  function closed() {
    // A destroyed window may reject its predicates. Preserve its final confirmed
    // evidence; do not manufacture visibility from an unreadable native object.
    refresh();
    dispose();
  }
  const handlers = new Map([
    ['show', () => nativeEvent(false)], ['restore', () => nativeEvent(false)],
    ['hide', () => nativeEvent(true)], ['minimize', () => nativeEvent(true)]
  ]);
  handlers.set('closed', closed);
  for (const [event, handler] of handlers) window.on(event, handler);
  // Some native runtimes omit hide/show events entirely. This opt-in health
  // read is window-scoped, never touches actors, and only refresh() may notify
  // a newly confirmed hidden state. The normal snapshot poll stays read-only.
  if (watch) { watcher = setInterval(refresh, 250); watcher.unref?.(); }
  return Object.freeze({snapshot,refresh,dispose});
}

module.exports = {createWindowVisibility};
