/* Evidence-based connection status for the connections panel. Chinese copy is
   the source text; the i18n model supplies English. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeConnectionStatus = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const at = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;

  // not-connected: no hooks installed.
  // stale: installed hooks point at a moved or different app copy.
  // configured: installed, but no real event has ever arrived.
  // received: a real event arrived before, but none in this app run.
  // observing: a real event arrived in this app run.
  function state(connection) {
    if (!connection || !connection.installed) return 'not-connected';
    if (connection.stale) return 'stale';
    if (at(connection.lastEventAt)) return 'observing';
    if (at(connection.observedAt) || at(connection.firstEventAt)) return 'received';
    return 'configured';
  }

  function status(connection, timeAgo) {
    const current = state(connection);
    const ago = value => typeof timeAgo === 'function' ? timeAgo(value) : '';
    const parts = {
      'not-connected': ['尚未接入'],
      stale: [connection?.staleReason === 'other-copy' ? '观察指向另一份应用' : '观察路径已失效', '需要修复'],
      configured: ['已配置', '等待工具产生事件'],
      received: ['已收到首个事件', ago(at(connection?.observedAt) || at(connection?.firstEventAt))],
      observing: ['正在观察', ago(at(connection?.lastEventAt))],
    }[current].filter(Boolean);
    const drops = Number.isSafeInteger(connection?.drops) && connection.drops > 0 ? connection.drops : 0;
    if (drops && current !== 'not-connected') parts.push('24 小时内漏记 ' + drops + ' 个事件');
    return parts.join(' · ');
  }

  // Ordered row actions. Repair and Send test event never run on their own;
  // each is an explicit click that reuses the existing connect path.
  function actions(connection, provider) {
    const list = [];
    if (connection?.installed && connection.stale) list.push({ id: 'repair', label: '修复' });
    if (provider === 'hermes' && connection?.installed && !connection.stale) list.push({ id: 'reload', label: '重新加载' });
    if (connection?.installed && !connection.stale) list.push({ id: 'test', label: '发送测试事件' });
    list.push(connection?.installed ? { id: 'remove', label: '移除配置' } : { id: 'connect', label: '连接' });
    return list;
  }

  function describe(connection, { provider, timeAgo } = {}) {
    return { state: state(connection), status: status(connection, timeAgo), actions: actions(connection, provider) };
  }

  return Object.freeze({ state, status, actions, describe });
});
