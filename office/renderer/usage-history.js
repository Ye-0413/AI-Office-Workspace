/* Local, read-only usage history. History never becomes a live room actor. */
(function (root) {
  'use strict';
  const COPY = {
    zh: {
      eyebrow: '留在本机的工作足迹', title: '使用记录', close: '关闭使用记录',
      scope: 'Token 来自本机会话日志，可独立导入历史；活动时长仅统计应用运行期间的观察。历史记录不会重新进入房间。',
      range: '时间范围', days7: '近 7 天', days30: '近 30 天', allTime: '全部时间', custom: '自选日期',
      provider: 'AI 工具', allProviders: '全部工具', role: '角色关系', allRoles: '全部角色', roots: '主 Agent', helpers: '分身',
      from: '开始日期（香港）', to: '结束日期（香港）', refresh: '刷新', overview: '使用概览',
      agents: '已观测 Agent', active: '观测工作时长', waiting: '观测等待时长', turns: '轮次', tools: '工具调用', events: '观察事件',
      history: 'Agent 历史', previous: '上一页', next: '下一页', timeline: '事件时间线', closeTimeline: '收起',
      timeZone: '以下时间均为香港时间 · Asia/Hong_Kong', export: '导出 CSV', folder: '打开日志文件夹',
      privacy: '记录保存在本机；此面板只展示身份、关系与活动元数据，不展示对话正文或提示词。',
      loading: '正在读取本机记录…', loadingEvents: '正在读取事件…', unavailable: '使用记录暂不可用，请使用最新版应用重新打开。',
      empty: '所选范围内还没有已观测的 Agent。', noEvents: '所选范围内还没有事件。', choose: '选择一位 Agent，查看已观测的事件。',
      invalidDates: '请选择有效的开始和结束日期，且开始日期不晚于结束日期。', storage: '已在本机持久保存', storageError: '本机记录暂不可用',
      error: '读取记录失败，请稍后刷新。', exportError: '导出未完成，请重试。', folderError: '日志文件夹未能打开。', logError: '日志保存失败，记录可能不完整',
      canceled: '已取消导出。', exported: '已导出 {rows} 条记录。', opened: '已打开日志文件夹。',
      count: '共 {count} 位', page: '{page} / {pages} 页', rootsDetail: '主 Agent {roots} · 分身 {helpers}', failuresDetail: '失败 {count}',
      rowCounts: '{turns} 轮 · {tools} 次工具', activeShort: '工作', waitingShort: '等待', lastSeen: '末次观察（全历史）', lastState: '末次状态', project: '项目',
      noProject: '未提供项目名', fromParent: '分身 · 来自 ', identity: '会话 ID', parentIdentity: '父会话 ID',
      historyPages: '历史记录分页', eventPages: '事件时间线分页', unknown: '未提供', seconds: '{value} 秒', minutes: '{value} 分', hours: '{value} 小时',
      activityTitle: '已观测活动', tokenTitle: '会话 Token', tokenOverview: '会话 Token 概览',
      tokenScope: '读取下方来源所列工具的本机会话日志；仅展示日志报告的 token，不推算费用或额度。覆盖范围随可用日志而定。',
      tokenTotal: 'Token 总计', tokenInput: '未缓存输入', tokenOutput: '输出', tokenCacheRead: '缓存读取', tokenCacheWrite: '缓存写入', tokenReasoning: '其中：推理输出',
      tokenRequests: '请求记录', tokenRequestCount: '{count} 条请求记录', tokenModels: '按模型查看', tokenModel: '模型 / 工具', tokenModelsCaption: '所选范围内的模型 Token 记录',
      tokenLoading: '正在读取本机会话 Token…', tokenScanning: '正在增量导入本机会话日志…', tokenError: 'Token 更新失败；保留所选范围内上次成功读取的数据。',
      tokenUnavailable: '此版本暂不支持本机会话 Token，请使用最新版应用。', tokenUnsupported: '所选工具暂无本机会话 Token 覆盖；不将缺失数据视为零用量。',
      tokenEmpty: '所选范围内尚无已导入的 Token 记录。', tokenSource: '来源：本机会话日志 · {providers} · 已索引 {files} 个文件',
      tokenLastScan: '末次扫描：{time}（香港）', tokenNoScan: '尚未完成首次扫描', tokenRefreshing: '正在更新 Token；暂时显示上次成功读取的数据。'
    },
    en: {
      eyebrow: 'Work footprints, kept on this Mac', title: 'Usage history', close: 'Close usage history',
      scope: 'Tokens come from local session logs, including independently imported history. Activity time counts only observations while the app runs. History never re-enters the room.',
      range: 'Date range', days7: 'Last 7 days', days30: 'Last 30 days', allTime: 'All time', custom: 'Custom dates',
      provider: 'AI tool', allProviders: 'All tools', role: 'Relationship', allRoles: 'All agents', roots: 'Main agents', helpers: 'Clones',
      from: 'From (Hong Kong)', to: 'To (Hong Kong)', refresh: 'Refresh', overview: 'Usage overview',
      agents: 'Observed agents', active: 'Observed work time', waiting: 'Observed waiting time', turns: 'Turns', tools: 'Tool calls', events: 'Observed events',
      history: 'Agent history', previous: 'Previous', next: 'Next', timeline: 'Event timeline', closeTimeline: 'Collapse',
      timeZone: 'All times are Hong Kong time · Asia/Hong_Kong', export: 'Export CSV', folder: 'Open log folder',
      privacy: 'Records stay on this Mac. This panel shows identity, relationships and activity metadata, without conversation text or prompts.',
      loading: 'Reading local records…', loadingEvents: 'Reading events…', unavailable: 'Usage history is unavailable. Reopen the latest version of the app.',
      empty: 'No agents were observed in this range yet.', noEvents: 'No events were observed in this range yet.', choose: 'Choose an agent to view its observed events.',
      invalidDates: 'Choose valid start and end dates, with the start no later than the end.', storage: 'Saved persistently on this Mac', storageError: 'Local records unavailable',
      error: 'Could not read records. Please refresh.', exportError: 'Export did not finish. Please try again.', folderError: 'The log folder could not be opened.', logError: 'Log could not be saved; records may be incomplete',
      canceled: 'Export canceled.', exported: 'Exported {rows} records.', opened: 'Opened the log folder.',
      count: '{count} agents', page: 'Page {page} / {pages}', rootsDetail: 'Main {roots} · clones {helpers}', failuresDetail: '{count} failures',
      rowCounts: '{turns} turns · {tools} tool calls', activeShort: 'Work', waitingShort: 'Waiting', lastSeen: 'Last observed (all time)', lastState: 'Last state', project: 'Project',
      noProject: 'Project name unavailable', fromParent: 'Clone · from ', identity: 'Session ID', parentIdentity: 'Parent session ID',
      historyPages: 'Agent history pages', eventPages: 'Event timeline pages', unknown: 'Unavailable', seconds: '{value}s', minutes: '{value}m', hours: '{value}h',
      activityTitle: 'Observed activity', tokenTitle: 'Session tokens', tokenOverview: 'Session token overview',
      tokenScope: 'Reads local session logs from the tools listed below. Counts are reported by those logs; cost and quota are not estimated. Coverage depends on available logs.',
      tokenTotal: 'Total tokens', tokenInput: 'Uncached input', tokenOutput: 'Output', tokenCacheRead: 'Cache read', tokenCacheWrite: 'Cache write', tokenReasoning: 'Reasoning within output',
      tokenRequests: 'Request records', tokenRequestCount: '{count} request records', tokenModels: 'View by model', tokenModel: 'Model / tool', tokenModelsCaption: 'Model token records in the selected range',
      tokenLoading: 'Reading local session tokens…', tokenScanning: 'Importing local session logs incrementally…', tokenError: 'Token update failed; the last successful values for this range are retained.',
      tokenUnavailable: 'Local session tokens are unavailable in this version. Reopen the latest app.', tokenUnsupported: 'This tool has no local session token coverage yet. Missing data does not mean zero usage.',
      tokenEmpty: 'No token records have been imported for this range yet.', tokenSource: 'Source: local session logs · {providers} · {files} files indexed',
      tokenLastScan: 'Last scan: {time} (Hong Kong)', tokenNoScan: 'The first scan has not completed', tokenRefreshing: 'Updating tokens; showing the last successful values for now.'
    }
  };
  const VALUES = {
    reading: ['阅读', 'Reading'], searching: ['检索', 'Searching'], planning: ['规划', 'Planning'], coding: ['编写代码', 'Coding'],
    designing: ['设计', 'Designing'], testing: ['测试', 'Testing'], building: ['构建', 'Building'], running: ['执行', 'Running'],
    'waiting-tool': ['等待工具', 'Waiting for a tool'], 'waiting-user': ['等待回复', 'Waiting for input'], idle: ['空闲', 'Idle'],
    error: ['出错', 'Error'], unknown: ['观察中', 'Observing'], active: ['活动中', 'Active'], completed: ['已完成', 'Completed'],
    stopped: ['已停止', 'Stopped'], closed: ['已结束', 'Closed'], interrupted: ['已中断', 'Interrupted'], stale: ['信号已过期', 'Signal expired'],
    success: ['成功', 'Success'], failure: ['失败', 'Failure'], cancelled: ['已取消', 'Canceled'],
    'session-start': ['会话开始', 'Session started'], 'session-end': ['会话结束', 'Session ended'],
    'turn-start': ['本轮开始', 'Turn started'], 'turn-end': ['本轮结束', 'Turn ended'],
    'tool-start': ['工具开始', 'Tool started'], 'tool-end': ['工具返回', 'Tool returned'],
    'agent-start': ['Agent 开始', 'Agent started'], 'agent-stop': ['Agent 停止', 'Agent stopped'],
    'subagent-start': ['分身开始', 'Clone started'], 'subagent-stop': ['分身结束', 'Clone ended'],
    'subagent-end': ['分身结束', 'Clone ended'], metadata: ['会话信息', 'Session metadata'], activity: ['活动更新', 'Activity updated'], waiting: ['等待中', 'Waiting'],
    notification: ['状态通知', 'Status notification'], hook: ['Hook 事件', 'Hook event'],
    'codex-session-log': ['Codex 只读日志', 'Codex read-only log'], 'session-log': ['只读会话日志', 'Read-only session log']
  };
  const PAGE_SIZE = 12, EVENT_PAGE_SIZE = 20, REFRESH_MS = 5000;

  function create(options) {
    const config = options || {}, bridge = config.bridge;
    const $ = id => document.getElementById(id);
    const dialog = $('usage-history-dialog'), button = $('usage-history-button');
    if (!dialog || !button) return Object.freeze({ updateLanguage() {}, updateStatus() {}, dispose() {} });
    let language = 'zh', disposed = false, generation = 0, eventGeneration = 0, actionGeneration = 0;
    let offset = 0, eventOffset = 0, history = null, timeline = null, selected = null, storage = null;
    let busy = false, eventBusy = false, exportBusy = false, liveStatus = null, historyLoadError = false;
    let tokens = null, tokenKey = null, tokenError = '', tokenBusy = false, tokenFlight = false, tokenPending = null, tokenRevision = 0, refreshTimer = null;
    const listeners = [];
    const has = method => Boolean(bridge && typeof bridge[method] === 'function');
    const available = has('getUsageHistory') && has('getUsageEvents') && has('getUsageStatus');
    const tr = (key, values) => String(COPY[language][key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ''));
    const n = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
    const count = value => new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'zh-CN').format(Math.floor(n(value)));
    const node = (tag, className, value) => { const item = document.createElement(tag); if (className) item.className = className; if (value != null) item.textContent = String(value); return item; };
    const label = value => VALUES[value] ? VALUES[value][language === 'en' ? 1 : 0] : String(value || tr('unknown'));
    function on(target, event, handler) { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); }
    function feedback(key, error = false, detail) {
      const target = $('usage-feedback');
      target.textContent = key ? tr(key) + (detail ? ' ' + String(detail).slice(0, 300) : '') : '';
      target.dataset.error = String(error);
      target.dataset.storageError = String(key === 'storageError');
    }
    function duration(value) {
      const seconds = Math.floor(n(value) / 1000);
      return seconds < 60 ? tr('seconds', { value: count(seconds) }) : seconds < 3600
        ? tr('minutes', { value: new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'zh-CN', { maximumFractionDigits: 1 }).format(seconds / 60) })
        : tr('hours', { value: new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'zh-CN', { maximumFractionDigits: 1 }).format(seconds / 3600) });
    }
    function timestamp(value) {
      if (value == null || value === '') return tr('unknown');
      const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
      if (!Number.isFinite(date.getTime())) return tr('unknown');
      return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
    }
    function hkToday() {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Date.now());
      return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
    }
    function setRange() {
      const range = $('usage-range').value, custom = range === 'custom';
      $('usage-from').disabled = !custom; $('usage-to').disabled = !custom;
      $('usage-dates').dataset.custom = String(custom);
      if (range === 'all') { $('usage-from').value = ''; $('usage-to').value = ''; return; }
      if (custom) {
        if (!$('usage-to').value) $('usage-to').value = hkToday();
        if (!$('usage-from').value) $('usage-from').value = $('usage-to').value;
        return;
      }
      const today = hkToday(), start = new Date(today + 'T12:00:00Z');
      start.setUTCDate(start.getUTCDate() - (Number(range) - 1));
      $('usage-from').value = start.toISOString().slice(0, 10); $('usage-to').value = today;
    }
    function validDate(value) { const date = new Date(value + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
    function filters() {
      const value = { role: $('usage-role').value };
      if ($('usage-provider').value) value.provider = $('usage-provider').value;
      if ($('usage-range').value !== 'all') {
        const from = $('usage-from').value, to = $('usage-to').value;
        if (!validDate(from) || !validDate(to) || from > to) throw new Error(tr('invalidDates'));
        Object.assign(value, { from, to });
      }
      return value;
    }
    function nickname(item) {
      const persona = root.OfficeAgentPersona?.forSession({ id: item.id, provider: item.provider });
      return persona ? persona[language === 'en' ? 'aliasEn' : 'aliasZh'] : String(item.id || tr('unknown'));
    }
    function providerName(id) { return root.OfficeProviders?.getProvider(id)?.name || String(id || tr('unknown')); }
    function updateStatus(status) {
      liveStatus = status;
      const error = Boolean(status && (status.available === false || status.error));
      button.dataset.error = String(error);
      button.title = tr('title') + (error ? ' · ' + tr('logError') : '');
      button.setAttribute('aria-label', button.title);
      if (status) {
        storage = status;
        $('usage-storage-state').textContent = tr(error ? 'storageError' : 'storage');
        if (error) feedback('storageError', true, status.error);
        else if ($('usage-feedback').dataset.storageError === 'true') feedback('');
        $('usage-export').disabled = !available || !has('exportUsageHistory') || busy || exportBusy || !history || error;
      }
    }
    function page(target, previous, next, position, total, size, loading) {
      $(target).textContent = tr('page', { page: Math.floor(position / size) + 1, pages: Math.max(1, Math.ceil(n(total) / size)) });
      $(previous).disabled = loading || position === 0;
      $(next).disabled = loading || position + size >= n(total);
    }
    function tokenProviderName(id) { return providerName(id === 'claude' ? 'claude-code' : id); }
    function tokenCovered() {
      const provider = $('usage-provider').value;
      return !provider || (tokens?.status?.providers || ['codex', 'claude-code']).some(id => (id === 'claude' ? 'claude-code' : id) === provider);
    }
    function renderTokens() {
      const supported = has('getTokenUsage'), covered = tokenCovered();
      const totals = tokens?.totals || {}, values = supported && covered && tokens;
      const fragment = document.createDocumentFragment();
      for (const [key, value, detail] of [
        ['tokenTotal', totals.totalTokens], ['tokenInput', totals.inputTokens],
        ['tokenOutput', totals.outputTokens, n(totals.reasoningTokens) > 0 ? tr('tokenReasoning') + ': ' + count(totals.reasoningTokens) : ''],
        ['tokenCacheRead', totals.cacheReadTokens], ['tokenCacheWrite', totals.cacheWriteTokens], ['tokenRequests', totals.requests]
      ]) {
        const card = node('div', 'usage-metric'); card.dataset.tokenMetric = key;
        card.append(node('dt', '', tr(key)), node('dd', '', values ? count(value) : '—'));
        if (detail && values) card.append(node('small', '', detail));
        fragment.append(card);
      }
      $('usage-token-overview').replaceChildren(fragment);
      $('usage-token-requests').textContent = values ? tr('tokenRequestCount', { count: count(totals.requests) }) : '';
      $('usage-token-section').setAttribute('aria-busy', String(tokenBusy));
      const status = tokens?.status, error = tokenError || status?.error || (status?.available === false ? tr('storageError') : '');
      let message = '';
      if (!supported) message = tr('tokenUnavailable');
      else if (!covered) message = tr('tokenUnsupported');
      else if (error) message = tr('tokenError') + ' ' + String(error).slice(0, 300);
      else if (tokenBusy) message = tr(tokens ? 'tokenRefreshing' : 'tokenLoading');
      else if (status?.scanning) message = tr('tokenScanning');
      else if (tokens && !n(totals.requests)) message = tr('tokenEmpty');
      $('usage-token-feedback').textContent = message;
      $('usage-token-feedback').dataset.error = String(Boolean(error));
      const models = Array.isArray(tokens?.models) && covered ? tokens.models : [];
      const rows = document.createDocumentFragment();
      for (const model of models) {
        const row = node('tr'), identity = node('td', '', model.model || tr('unknown'));
        identity.append(node('small', '', tokenProviderName(model.provider)));
        row.append(identity);
        for (const key of ['requests', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']) row.append(node('td', '', count(model[key])));
        rows.append(row);
      }
      $('usage-token-models').replaceChildren(rows);
      $('usage-token-models-details').hidden = !models.length;
      $('usage-token-source').textContent = tokens ? tr('tokenSource', {
        providers: (status?.providers || ['codex', 'claude-code']).map(tokenProviderName).join(' / '), files: count(status?.files)
      }) + ' · ' + (status?.lastScanAt ? tr('tokenLastScan', { time: timestamp(status.lastScanAt) }) : tr('tokenNoScan')) : '';
    }
    function foreground() { return !disposed && dialog.open && document.visibilityState !== 'hidden'; }
    async function drainTokens() {
      if (tokenFlight || !tokenPending || !foreground()) return;
      const request = tokenPending; tokenPending = null; tokenFlight = true; tokenBusy = true; renderTokens();
      let refreshError = '';
      try {
        if (request.scan && has('refreshTokenUsage')) {
          try { await invoke('refreshTokenUsage'); } catch (error) { refreshError = error.message; }
        }
        const result = await invoke('getTokenUsage', request.query);
        if (disposed || request.revision !== tokenRevision) return;
        tokens = result; tokenError = refreshError;
      } catch (error) {
        if (!disposed && request.revision === tokenRevision) tokenError = error.message;
      } finally {
        tokenFlight = false;
        if (!disposed) { tokenBusy = Boolean(tokenPending); renderTokens(); void drainTokens(); }
      }
    }
    function requestTokens(scan = false) {
      if (!has('getTokenUsage') || disposed) { renderTokens(); return; }
      let query;
      try { query = filters(); }
      catch (error) { ++tokenRevision; tokenPending = null; tokens = null; tokenBusy = false; tokenError = error.message; renderTokens(); return; }
      const key = JSON.stringify(query);
      if (key !== tokenKey) { tokens = null; tokenError = ''; tokenKey = key; }
      tokenPending = { query, key, revision: ++tokenRevision, scan: scan || Boolean(tokenPending?.scan) };
      tokenBusy = true; renderTokens(); void drainTokens();
    }
    function refreshVisible() {
      if (!foreground()) return;
      if (['7', '30'].includes($('usage-range').value) && $('usage-to').value !== hkToday()) setRange();
      if (!busy && !eventBusy && !exportBusy) void load({ quiet: true });
      if (!tokenFlight && !tokenPending) requestTokens();
      else void drainTokens();
    }
    function startRefresh() {
      if (refreshTimer == null && foreground()) refreshTimer = root.setInterval(refreshVisible, REFRESH_MS);
    }
    function stopRefresh() {
      if (refreshTimer != null) root.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    function renderOverview() {
      const totals = history?.totals || {}, fragment = document.createDocumentFragment();
      for (const [key, value, detail] of [
        ['agents', count(totals.agents), tr('rootsDetail', { roots: count(totals.roots), helpers: count(totals.helpers) })],
        ['active', duration(totals.activeMs)], ['waiting', duration(totals.waitingMs)],
        ['turns', count(totals.turns)], ['tools', count(totals.toolCalls), tr('failuresDetail', { count: count(totals.failures) })], ['events', count(totals.events)]
      ]) {
        const card = node('div', 'usage-metric'); card.append(node('dt', '', tr(key)), node('dd', '', history ? value : '—'));
        if (detail) card.append(node('small', '', history ? detail : ''));
        fragment.append(card);
      }
      $('usage-overview').replaceChildren(fragment);
    }
    function renderHistory() {
      renderOverview();
      $('usage-count').textContent = history ? tr('count', { count: count(history.total) }) : '';
      const fragment = document.createDocumentFragment();
      const items = Array.isArray(history?.items) ? history.items : [];
      if (!items.length) fragment.append(node('p', 'usage-empty', tr(busy ? 'loading' : available ? 'empty' : 'unavailable')));
      for (const item of items) {
        const row = node('button', 'usage-agent-row'); row.type = 'button'; row.dataset.actorId = String(item.id);
        row.setAttribute('aria-expanded', String(selected?.id === item.id)); row.setAttribute('aria-controls', 'usage-timeline-section');
        const identity = node('span', 'usage-agent-identity'), heading = node('span', 'usage-agent-heading');
        heading.append(node('strong', '', nickname(item)), node('span', 'usage-provider-badge', providerName(item.provider)));
        const relation = node('span', 'usage-agent-relation', item.parentId ? tr('fromParent') + nickname({ id: item.parentId, provider: item.provider }) : tr('roots'));
        if (item.parentId) relation.title = tr('parentIdentity') + ': ' + item.parentId;
        const id = node('code', 'usage-agent-id', item.id); id.title = tr('identity') + ': ' + item.id;
        const project = node('span', 'usage-agent-project', item.projectName || tr('noProject')); project.title = tr('project') + ': ' + (item.projectName || tr('noProject'));
        identity.append(heading, relation, project, id);
        const usage = node('span', 'usage-agent-usage');
        usage.append(node('span', '', tr('activeShort') + ' ' + duration(item.activeMs) + ' · ' + tr('waitingShort') + ' ' + duration(item.waitingMs)),
          node('span', '', tr('rowCounts', { turns: count(item.turns), tools: count(item.toolCalls) })),
          node('span', 'usage-agent-last', tr('lastSeen') + ' ' + timestamp(item.lastSeenAt)),
          node('span', 'usage-agent-state', tr('lastState') + ' · ' + label(item.status) + ' · ' + label(item.activity)));
        row.append(identity, usage); row.addEventListener('click', () => { selected = item; eventOffset = 0; timeline = null; renderHistory(); renderTimeline(); loadEvents(); });
        fragment.append(row);
      }
      const focusedActorId = document.activeElement?.dataset.actorId;
      $('usage-history-list').replaceChildren(fragment);
      if (focusedActorId) [...$('usage-history-list').children].find(row => row.dataset.actorId === focusedActorId)?.focus({ preventScroll: true });
      $('usage-history-list').setAttribute('aria-busy', String(busy));
      page('usage-page', 'usage-prev', 'usage-next', offset, history?.total || 0, PAGE_SIZE, busy);
      $('usage-export').disabled = !available || !has('exportUsageHistory') || busy || exportBusy || !history || storage?.available === false;
    }
    function renderTimeline() {
      $('usage-timeline-section').hidden = !selected;
      if (!selected) { $('usage-timeline').replaceChildren(); return; }
      $('usage-selected-name').textContent = nickname(selected) + ' · ' + selected.id;
      $('usage-selected-name').title = selected.id;
      const fragment = document.createDocumentFragment(), items = Array.isArray(timeline?.items) ? timeline.items : [];
      if (!items.length) fragment.append(node('li', 'usage-empty', tr(eventBusy ? 'loadingEvents' : 'noEvents')));
      for (const item of items) {
        const row = node('li', 'usage-event'), at = node('time', '', timestamp(item.at));
        const parsed = new Date(item.at); if (Number.isFinite(parsed.getTime())) at.dateTime = parsed.toISOString();
        const copy = node('span', 'usage-event-copy'), headline = node('span', 'usage-event-headline', label(item.event) + ' · ' + label(item.activity));
        const meta = [item.toolName, item.outcome && label(item.outcome), item.source && label(item.source)].filter(Boolean).join(' · ');
        const detail = node('span', 'usage-event-detail', meta); detail.title = meta;
        copy.append(headline, detail); row.append(at, copy); fragment.append(row);
      }
      $('usage-timeline').replaceChildren(fragment); $('usage-timeline').setAttribute('aria-busy', String(eventBusy));
      page('usage-event-page', 'usage-event-prev', 'usage-event-next', eventOffset, timeline?.total || 0, EVENT_PAGE_SIZE, eventBusy);
    }
    async function invoke(method, argument) {
      if (!has(method)) throw new Error(tr('unavailable'));
      const response = await bridge[method](argument);
      if (response?.ok === false) throw new Error(response.error || tr('error'));
      return response;
    }
    async function load(options = {}) {
      const quiet = Boolean(options.quiet), request = ++generation;
      if (!quiet) { ++eventGeneration; ++actionGeneration; }
      if (!available) { history = null; busy = false; feedback('unavailable', true); renderHistory(); return; }
      let query;
      try { query = filters(); } catch (error) { busy = false; history = null; feedback('invalidDates', true); renderHistory(); return; }
      busy = true;
      if (!quiet) { feedback('loading'); renderHistory(); $('usage-timeline-feedback').textContent = ''; }
      try {
        const [result, status] = await Promise.all([
          invoke('getUsageHistory', { ...query, offset, limit: PAGE_SIZE }),
          invoke('getUsageStatus').catch(error => ({ available: false, error: error.message }))
        ]);
        if (disposed || request !== generation) return;
        history = result; storage = status; updateStatus(status);
        $('usage-storage-state').textContent = tr(status?.available ? 'storage' : 'storageError');
        if (!quiet || historyLoadError || !status?.available) feedback(status?.available ? '' : 'storageError', !status?.available, status?.error);
        historyLoadError = false;
      } catch (error) {
        if (disposed || request !== generation) return;
        if (!quiet) history = null;
        historyLoadError = true;
        feedback('error', true, error.message);
      } finally {
        if (!disposed && request === generation) { busy = false; renderHistory(); if (selected) loadEvents({ quiet }); }
      }
    }
    async function loadEvents(options = {}) {
      const request = ++eventGeneration;
      if (!selected || disposed) return;
      const actorId = selected.id;
      let query;
      try { const range = filters(); query = { id: actorId, from: range.from, to: range.to, offset: eventOffset, limit: EVENT_PAGE_SIZE }; }
      catch (error) { $('usage-timeline-feedback').textContent = tr('invalidDates'); return; }
      eventBusy = true;
      if (!options.quiet) { $('usage-timeline-feedback').textContent = ''; renderTimeline(); }
      try {
        const result = await invoke('getUsageEvents', query);
        if (disposed || request !== eventGeneration || selected?.id !== actorId) return;
        timeline = result; $('usage-timeline-feedback').textContent = '';
      } catch (error) {
        if (disposed || request !== eventGeneration) return;
        if (!options.quiet) timeline = null;
        $('usage-timeline-feedback').textContent = tr('error') + ' ' + String(error.message).slice(0, 300);
      } finally { if (!disposed && request === eventGeneration) { eventBusy = false; renderTimeline(); } }
    }
    function changeFilters() {
      offset = 0; eventOffset = 0; selected = null; timeline = null; history = null;
      renderTimeline(); load(); requestTokens();
    }
    function updateLanguage() {
      language = config.getLanguage?.() === 'en' ? 'en' : 'zh'; ++generation; ++eventGeneration; ++actionGeneration;
      for (const element of dialog.querySelectorAll('[data-usage-copy]')) element.textContent = tr(element.dataset.usageCopy);
      updateStatus(liveStatus);
      $('usage-history-close').setAttribute('aria-label', tr('close'));
      $('usage-overview').setAttribute('aria-label', tr('overview'));
      $('usage-token-overview').setAttribute('aria-label', tr('tokenOverview'));
      dialog.querySelectorAll('.usage-pagination')[0].setAttribute('aria-label', tr('historyPages'));
      dialog.querySelectorAll('.usage-pagination')[1].setAttribute('aria-label', tr('eventPages'));
      $('usage-open-folder').disabled = !has('openUsageFolder'); $('usage-refresh').disabled = !available && !has('getTokenUsage');
      $('usage-storage-state').textContent = storage ? tr(storage.available ? 'storage' : 'storageError') : '';
      busy = false; eventBusy = false; feedback(available ? '' : 'unavailable', !available);
      renderHistory(); renderTimeline(); renderTokens();
      updateStatus(liveStatus);
      if (dialog.open) { load(); requestTokens(); startRefresh(); }
    }
    on(button, 'click', () => { if (!dialog.open) dialog.showModal(); setRange(); $('usage-range').focus(); load(); requestTokens(true); startRefresh(); });
    on($('usage-history-close'), 'click', () => dialog.close());
    on(dialog, 'close', () => { ++generation; ++eventGeneration; ++actionGeneration; ++tokenRevision; tokenPending = null; tokenBusy = false; busy = false; eventBusy = false; stopRefresh(); });
    on(document, 'visibilitychange', () => {
      if (!foreground()) { stopRefresh(); return; }
      startRefresh(); refreshVisible();
    });
    on($('usage-range'), 'change', () => { setRange(); changeFilters(); });
    for (const id of ['usage-provider', 'usage-role', 'usage-from', 'usage-to']) on($(id), 'change', changeFilters);
    on($('usage-refresh'), 'click', () => { setRange(); load(); requestTokens(true); });
    on($('usage-prev'), 'click', () => { offset = Math.max(0, offset - PAGE_SIZE); selected = null; renderTimeline(); load(); });
    on($('usage-next'), 'click', () => { offset += PAGE_SIZE; selected = null; renderTimeline(); load(); });
    on($('usage-event-prev'), 'click', () => { eventOffset = Math.max(0, eventOffset - EVENT_PAGE_SIZE); loadEvents(); });
    on($('usage-event-next'), 'click', () => { eventOffset += EVENT_PAGE_SIZE; loadEvents(); });
    on($('usage-timeline-close'), 'click', () => { ++eventGeneration; selected = null; timeline = null; renderHistory(); renderTimeline(); });
    on($('usage-export'), 'click', async () => {
      let query; try { query = filters(); } catch (error) { feedback('invalidDates', true); return; }
      const request = ++actionGeneration; exportBusy = true; $('usage-export').disabled = true;
      try {
        const result = await invoke('exportUsageHistory', query);
        if (disposed || request !== actionGeneration) return;
        if (result?.canceled) feedback('canceled');
        else if (result?.exported) { feedback(''); $('usage-feedback').textContent = tr('exported', { rows: count(result.rows) }); }
        else feedback('exportError', true);
      } catch (error) { if (!disposed && request === actionGeneration) feedback('exportError', true, error.message); }
      finally { exportBusy = false; if (!disposed) renderHistory(); }
    });
    on($('usage-open-folder'), 'click', async () => {
      const request = ++actionGeneration;
      try { await invoke('openUsageFolder'); if (!disposed && request === actionGeneration) feedback('opened'); }
      catch (error) { if (!disposed && request === actionGeneration) feedback('folderError', true, error.message); }
    });
    const providers = root.OfficeProviders?.getAllProviders?.() || [];
    for (const provider of providers) { const option = node('option', '', provider.name); option.value = provider.id === 'cursor-agent' ? 'cursor' : provider.id; $('usage-provider').append(option); }
    setRange(); updateLanguage();
    return Object.freeze({ updateLanguage, updateStatus, dispose() { disposed = true; ++generation; ++eventGeneration; ++actionGeneration; ++tokenRevision; tokenPending = null; stopRefresh(); for (const remove of listeners) remove(); } });
  }
  root.OfficeUsageHistory = Object.freeze({ create });
})(typeof globalThis === 'object' ? globalThis : this);
