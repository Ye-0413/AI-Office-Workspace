/* Explains why a session shows its current state, from reducer evidence only. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeStateExplanation = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const REASONS = {
    duplicate: ['重复投递', 'repeated delivery'],
    'duplicate-heartbeat': ['重复投递（仅刷新信号）', 'repeated delivery (heartbeat only)'],
    'turn-fence': ['属于其他轮次', 'belonged to another turn'],
    'turn-closed': ['所属轮次已结束', 'its turn had already ended'],
    'session-closed': ['会话已结束', 'the session had ended'],
    'out-of-order': ['早于已收到的事件', 'older than events already seen'],
    'older-turn-start': ['较旧的轮次开始', 'an older turn start'],
    'unpaired-result': ['找不到对应的开始', 'no matching start'],
    'completed-call': ['调用已结束', 'the call had already ended'],
    'deferred-hook-lease': ['等待 hook 优先确认', 'waiting for hook priority'],
    'deferred-correlation': ['等待配对', 'waiting to be paired'],
    'older-than-hook': ['早于 hook 记录', 'older than the hook record'],
    'cursor-result-after-end': ['结束后的结果', 'a result after the end'],
    'no-actor': ['没有可归属的会话', 'no session to attach to'],
    'hook-lease': ['hook 优先', 'hook priority'],
    'snapshot-not-newer': ['快照不是更新的', 'snapshot was not newer'],
    invalid: ['格式无效', 'invalid format'],
  };
  const words = (language, zh, en) => (language === 'en' ? en : zh);

  // Returns short lines; empty when there is nothing beyond the normal state.
  function explain(session, { language = 'zh', now = Date.now() } = {}) {
    const lines = [];
    if (!session || typeof session !== 'object') return lines;
    const d = session.diagnostics || {};
    const last = Array.isArray(session.events) ? session.events.at(-1) : null;
    const age = Math.max(0, Math.round((now - Number(session.lastEventAt || 0)) / 1000));
    if (last) {
      const raw = last.evidence?.rawEvent || last.event;
      lines.push(words(language, `最后接受：${raw}（${age} 秒前）`, `Last accepted: ${raw} (${age}s ago)`));
    }
    if (session.disconnected) {
      lines.push(words(language, '超过 3 分钟没有新的观察，显示为信号中断；任务不一定结束。',
        'No observation for over 3 minutes, shown as signal lost; the task may still be running.'));
    }
    const b = d.blockers;
    if (b) {
      const parts = [];
      if (b.tools) parts.push(words(language, `${b.tools} 个调用未返回`, `${b.tools} call${b.tools === 1 ? '' : 's'} without a result`));
      if (b.waits) parts.push(words(language, `${b.waits} 个等待未解除`, `${b.waits} open wait${b.waits === 1 ? '' : 's'}`));
      if (b.background) parts.push(words(language, '后台任务仍在运行', 'background work still running'));
      if (b.children) parts.push(words(language, '分身仍在工作', 'a helper is still working'));
      if (parts.length) lines.push(words(language, '已收到停止，但仍在等待：', 'Stop received, still waiting for: ') + parts.join(words(language, '、', ', ')));
    }
    if (d.abandonedTools) {
      lines.push(words(language, `${d.abandonedTools} 个调用没有返回结果，已按“未知”结束`,
        `${d.abandonedTools} call${d.abandonedTools === 1 ? '' : 's'} never reported a result and ended as unknown`));
    }
    if (d.heartbeats) {
      lines.push(words(language, `工具重复投递 ${d.heartbeats} 次，仅用于确认会话仍在运行`,
        `The tool re-delivered ${d.heartbeats} event${d.heartbeats === 1 ? '' : 's'}, used only to confirm the session is alive`));
    }
    const rejected = Object.entries(d.rejected || {}).filter(([reason, count]) => reason !== 'duplicate-heartbeat' && count > 0)
      .sort((a, b) => b[1] - a[1]);
    if (rejected.length) {
      const total = rejected.reduce((sum, [, count]) => sum + count, 0);
      const top = rejected.slice(0, 3).map(([reason, count]) => `${(REASONS[reason] || [reason, reason])[language === 'en' ? 1 : 0]} ×${count}`);
      lines.push(words(language, `已忽略 ${total} 个事件：`, `Ignored ${total} event${total === 1 ? '' : 's'}: `) + top.join(words(language, '；', '; ')));
    }
    return lines;
  }

  function render(list, session, options) {
    if (!list || typeof list.replaceChildren !== 'function') return;
    const lines = explain(session, options);
    list.replaceChildren(...lines.map(line => { const item = list.ownerDocument.createElement('li'); item.textContent = line; return item; }));
    list.hidden = lines.length === 0;
  }

  return { explain, render, REASONS };
});
