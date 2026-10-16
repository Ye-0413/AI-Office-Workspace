/* Observation-driven animation choices. No timers, random state, DOM or lifecycle changes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAnimationDirector = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const PHASE_MS = 8000;
  const CUE_MS = 3600;
  const WORK_CUE_MS = 4200;
  const ASSETS = Object.freeze({
    still: 'clawd-static-base.svg', book: 'clawd-idle-reading.svg', inspect: 'clawd-working-debugger.svg',
    think: 'clawd-working-thinking.svg', focus: 'clawd-working-ultrathink.svg', type: 'clawd-working-typing.svg',
    terminal: 'clawd-mini-typing.svg', headphones: 'clawd-headphones-groove.svg', juggle: 'clawd-working-juggling.svg',
    build: 'clawd-working-building.svg', paint: 'clawd-designing.svg', alert: 'clawd-notification.svg',
    miniAlert: 'clawd-mini-alert.svg', glance: 'clawd-react-right.svg', look: 'clawd-idle-look.svg',
    stretch: 'clawd-idle-living.svg', bubble: 'clawd-idle-bubble.svg', coffee: 'clawd-coffee-hand.svg',
    flip: 'clawd-coffee-head-flip.svg', yawn: 'clawd-idle-yawn.svg', error: 'clawd-error.svg',
    sigh: 'clawd-react-annoyed.svg', greet: 'clawd-mini-enter.svg', peek: 'clawd-mini-peek.svg',
    acknowledge: 'clawd-mini-happy.svg', tidy: 'clawd-working-sweeping.svg'
  });

  // Audited alongside all 50 original SVGs. These remain available to other owners.
  const EXCLUDED = Object.freeze({
    'clawd-about-hero.svg': 'About artwork has a different framing, not a work state.',
    'clawd-aegyo-shy.svg': 'A social reaction needs an explicit interaction.',
    'clawd-collapse-sleep.svg': 'Quiet is not evidence of sleep.',
    'clawd-dizzy.svg': 'Dizziness needs an explicit playful interaction.',
    'clawd-happy.svg': 'Whole-turn celebration belongs to the lifecycle owner.',
    'clawd-heart-eyes.svg': 'A design completion cue belongs to the lifecycle owner.',
    'clawd-idle-collapse.svg': 'An idle event does not mean collapse.',
    'clawd-idle-doze.svg': 'An idle event does not mean dozing.',
    'clawd-idle-follow.svg': 'Pointer following has a separate interaction owner.',
    'clawd-idle-low-battery.svg': 'No provider battery evidence is available.',
    'clawd-mini-crabwalk.svg': 'Locomotion belongs to the route owner.',
    'clawd-mini-enter-sleep.svg': 'No sleep or wake event is inferred.',
    'clawd-mini-idle.svg': 'Reserve the mini window pose for its own framing.',
    'clawd-mini-sleep.svg': 'No provider sleep event is inferred.',
    'clawd-outlaw-bender.svg': 'Drinking and smoking are not task activity evidence.',
    'clawd-react-double-jump.svg': 'Double-click feedback belongs to explicit interaction.',
    'clawd-react-double.svg': 'Double-click feedback belongs to explicit interaction.',
    'clawd-react-drag.svg': 'Dragging belongs to explicit interaction.',
    'clawd-react-left.svg': 'Reserve directional user reaction for explicit interaction.',
    'clawd-sleeping.svg': 'Quiet and waiting must never imply sleep.',
    'clawd-wake.svg': 'Entrance and wake framing belongs to the lifecycle owner.',
    'clawd-working-carrying.svg': 'Carrying belongs to navigation and archive handoff.',
    'clawd-working-typing-boss.svg': 'The cigar and money costume does not describe coding.',
    'clawd-working-wizard.svg': 'A costume gag does not establish tool progress.'
  });

  const ACTIVE = new Set(['reading', 'searching', 'planning', 'coding', 'designing', 'building', 'testing', 'running']);
  const time = value => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' ? Date.parse(value) || 0 : 0;
  const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
  const lower = value => text(value).toLowerCase();
  const bilingual = (language, zh, en) => language === 'en' ? en : zh;
  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    result = Math.imul(result ^ (result >>> 16), 0x85ebca6b);
    return (result ^ (result >>> 13)) >>> 0;
  }
  function latestEvent(session, now) {
    if (!Array.isArray(session.events)) return null;
    let latest = null;
    for (const event of session.events) {
      if (!event || typeof event !== 'object') continue;
      const at = time(event.at);
      if (at > now || !at || (latest && time(latest.at) > at)) continue;
      latest = event;
    }
    return latest && now - time(latest.at) <= CUE_MS && text(latest.eventId) ? latest : null;
  }

  // A tool can start and finish inside the main process's two-second snapshot
  // interval. Briefly show that *past observed action* at the current station;
  // do not change the session, replay navigation, or pretend a tool is pending.
  function observedWork(session, options = {}) {
    if (!session || session.activity !== 'planning' || session.closed || session.disconnected || session.status === 'stale' || session.attention || Number(session.activeTools) > 0) return null;
    const now = time(options.now);
    if (!Array.isArray(session.events)) return null;
    let latest = null;
    for (const event of session.events) {
      const at = time(event && event.at);
      if (at > now || !at || latest && time(latest.at) > at) continue;
      latest = event;
    }
    if (!latest || latest.event !== 'tool-end' || !text(latest.eventId) || !text(latest.toolCallId) || now - time(latest.at) > WORK_CUE_MS || ['failure', 'cancelled'].includes(latest.outcome)) return null;
    const activity = text(latest.observedActivity);
    if (!['coding', 'reading', 'searching', 'testing', 'building', 'running'].includes(activity)) return null;
    const start = session.events.find(event => event && event.event === 'tool-start' && event.toolCallId === latest.toolCallId && time(event.at) <= time(latest.at));
    if (!start || start.observedActivity !== activity) return null;
    return { activity, at: time(latest.at), toolName: text(latest.toolName),
      cueKey: JSON.stringify([text(session.provider), text(session.id) || text(session.sessionId), latest.eventId, 'observed-work']) };
  }

  function plan(input, options = {}) {
    const session = input && typeof input === 'object' ? input : {};
    const language = /^en(?:-|$)/i.test(text(options.language)) ? 'en' : 'zh';
    const suppliedNow = time(options.now);
    const hasNow = (typeof options.now === 'number' && Number.isFinite(options.now)) || (typeof options.now === 'string' && Number.isFinite(Date.parse(options.now)));
    // No implicit wall clock: fixture replays are pure and callers pass their clock.
    const now = hasNow ? suppliedNow : Math.max(time(session.lastEventAt), ...((Array.isArray(session.events) ? session.events : []).map(event => time(event && event.at))), 0);
    const activity = text(session.activity, 'unknown');
    const toolName = text(session.toolName);
    const count = Number.isFinite(Number(session.activeTools)) ? Math.max(0, Math.floor(Number(session.activeTools))) : 0;
    const id = text(session.id) || text(session.sessionId) || text(session.provider, 'agent');
    const identity = text(session.provider) + ':' + id + ':' + activity;
    const phase = Math.floor((now + hash(identity) % PHASE_MS) / PHASE_MS);
    const raw = text(session.evidence && session.evidence.rawEvent);
    const words = (zh, en) => bilingual(language, zh, en);
    function result(asset, captionZh, captionEn, prop, stage, detailZh, detailEn, cueKey) {
      const output = { asset: ASSETS[asset], caption: words(captionZh, captionEn), prop, phase: stage, detail: words(detailZh, detailEn) };
      if (cueKey) output.cueKey = cueKey;
      return output;
    }
    function choose(variants, prefix, detailZh, detailEn) {
      const variant = variants[((phase % variants.length) + variants.length) % variants.length];
      return result(variant[0], variant[1], variant[2], variant[3], prefix + '/' + variant[4], detailZh, detailEn);
    }

    if (session.closed === true || session.status === 'closed') return result('still', '会话已结束', 'Session closed', 'none', 'closed', '明确结束事件；离场由房间生命周期处理。', 'An explicit closure was observed; the room owns departure.');
    if (session.disconnected || session.status === 'stale') return result('still', '信号暂未更新', 'Signal not updated', 'none', 'stale', '保留最后观察结果，不推测工作、休眠或完成。', 'Keep the last observation without inferring work, sleep or completion.');
    // Safety and attention always outrank a parallel tool or a happy historical result.
    if (activity === 'error') return choose([
      ['error', '遇到问题', 'A problem occurred', 'error', 'error'],
      ['sigh', '问题仍待处理', 'Problem still pending', 'error', 'sigh'],
      ['miniAlert', '等后续活动', 'Awaiting next activity', 'error', 'alert']
    ], 'error', '明确错误状态；只是表情变化，没有假定重试或恢复。', 'The observed error remains; expression changes do not imply recovery or retry.');

    if (activity === 'waiting-user' || session.attention === true) {
      const question = /request_user_input|askuserquestion|elicitation/i.test(toolName + ' ' + raw);
      const approval = /permissionrequest|approval/i.test(raw);
      const zh = question ? '等你回答' : approval ? '等你审批' : '等你处理';
      const en = question ? 'Waiting for your answer' : approval ? 'Waiting for approval' : 'Waiting for you';
      return choose([
        ['alert', zh, en, 'attention', 'hand-up'],
        ['miniAlert', zh, en, 'attention', 'reminder'],
        ['glance', zh, en, 'attention', 'look-to-you']
      ], 'waiting-user', '原工具仍在等输入；并行工具结果不能解除这条提醒。', 'The native tool still needs input; parallel results cannot dismiss this wait.');
    }

    if (activity === 'unknown' || (!ACTIVE.has(activity) && !['waiting-tool', 'idle'].includes(activity))) return result('still', '观察中', 'Observing', 'none', 'unknown', '没有可确认的活动分类，保持静止。', 'No reliable activity classification is available; stay still.');

    if (activity === 'planning') {
      const work = observedWork(session, { now });
      if (work) {
        const details = {
          coding: ['type', '刚刚在改代码', 'Just worked on the code', 'code'],
          reading: ['book', '刚刚翻阅了资料', 'Just read some material', 'book'],
          searching: ['inspect', '刚刚检索了线索', 'Just searched for clues', 'magnifier'],
          testing: ['terminal', '刚刚运行了测试工具', 'Just ran a test tool', 'terminal'],
          building: ['build', '刚刚运行了构建工具', 'Just ran a build tool', 'build'],
          running: ['terminal', '刚刚执行了工具', 'Just ran a tool', 'terminal']
        }[work.activity];
        const output = result(details[0], details[1], details[2], details[3], 'recent-work/' + work.activity,
          '这是刚刚观察到的工具活动回放；工具已经返回，当前没有待返回调用，也不表示操作成功或任务完成。',
          'A brief replay of an observed tool action. The tool has returned; this does not imply success, completion or a pending call.', work.cueKey);
        output.label = words(details[1], details[2]);
        output.recentWork = true;
        return output;
      }
      return result(hash(identity) % 2 ? 'think' : 'focus', '理一理下一步', 'Thinking through the next step', 'notes', 'planning/think', '当前仍在思考；保持同一个循环动画，直到观察到下一项实际活动。', 'Still thinking; keep one continuous animation until the next observed activity.');
    }

    if (activity === 'waiting-tool') return choose([
      ['think', '等工具返回', 'Waiting for tools', 'clock', 'listen'],
      ['look', '留意工具动静', 'Watching for a result', 'clock', 'watch'],
      [count > 1 ? 'headphones' : 'think', count > 1 ? '等并行工具返回' : '工具还没返回', count > 1 ? 'Waiting for parallel tools' : 'No tool result yet', 'clock', 'hold']
    ], 'waiting-tool', '状态仍是等待；不显示测试通过、任务完成或睡眠。', 'The wait remains; never show passing tests, task completion or sleep.');

    const recent = latestEvent(session, now);
    if (recent && ACTIVE.has(activity)) {
      const kind = text(recent.event);
      const eventRaw = text(recent.evidence && recent.evidence.rawEvent);
      const cueKey = JSON.stringify([text(session.provider), id, recent.eventId]);
      const toolEnd = kind === 'tool-end' || /^(?:PostToolUse|PostToolUseFailure|postToolUse|postToolUseFailure|afterShellExecution|afterFileEdit|afterMCPExecution)$/.test(eventRaw);
      if (toolEnd) {
        if (recent.outcome === 'failure') return result('error', '一个工具出了问题', 'One tool had a problem', 'error', 'cue/tool-failure', '最近有明确失败的工具返回；其他并行工作不代表它已经恢复。', 'A tool explicitly failed; parallel activity does not prove recovery.', cueKey);
        if (recent.outcome === 'cancelled') return result('look', '这次工具已中断', 'This tool was interrupted', 'pause', 'cue/tool-cancelled', '只呈现明确中断，不把中断视为成功。', 'Present the explicit interruption without treating it as success.', cueKey);
        if (recent.outcome === 'success') return result('acknowledge', '这次工具返回成功', 'This tool returned successfully', 'result', 'cue/tool-success', '仅确认这一次工具的明确成功；不代表整个测试流程或任务已完成。', 'Only this tool explicitly succeeded; the whole workflow or task is not proven complete.', cueKey);
        return result('peek', recent.outcome === 'success' ? '收到工具结果' : '结果还需确认', recent.outcome === 'success' ? 'Tool result received' : 'Result needs checking', 'page', 'cue/tool-result', '工具已返回；缺少明确 outcome 时不推断成功。', 'A tool returned; without an explicit outcome, success is not inferred.', cueKey);
      }
      if ((kind === 'subagent-start' || /^(?:SubagentStart|subagentStart)$/.test(eventRaw)) && session.parentId) return result('greet', '来一起帮忙', 'Joining to help', 'helper', 'cue/helper-joined', '真实子 Agent 开始事件；之后继续它自己的实际工作。', 'An observed helper-start event; then resume its own actual activity.', cueKey);
    }

    if (activity === 'idle') return choose([
      ['stretch', '等下一项工作', 'Ready for the next task', 'rest', 'stretch'],
      ['coffee', '歇一小会儿', 'A little coffee break', 'coffee', 'coffee'],
      ['look', '在这儿等着', 'Waiting here', 'rest', 'look-around'],
      ['bubble', '暂时闲下来', 'A quiet little moment', 'bubble', 'bubble'],
      ['flip', '休息角小把戏', 'A coffee-corner trick', 'coffee', 'coffee-trick'],
      ['yawn', '伸个懒腰等下一轮', 'Stretching before the next turn', 'rest', 'yawn']
    ], 'idle', '源状态明确为 idle；休息表演不意味着睡眠、关闭或任务成功。', 'The source explicitly says idle; a break does not imply sleep, closure or success.');

    if (count >= 2) {
      const primary = ({ reading: 'book', searching: 'inspect', planning: 'think', coding: 'type', designing: 'paint', building: 'build', testing: 'inspect', running: 'terminal' })[activity];
      return choose([
        [primary, '跟进 ' + count + ' 个工具', 'Following ' + count + ' tools', 'tools', 'follow'],
        ['headphones', '照看并行工作', 'Keeping parallel work in view', 'tools', 'coordinate'],
        [count >= 3 ? 'juggle' : primary, '并行工具还在忙', 'Parallel tools are still busy', 'tools', count >= 3 ? 'juggle' : 'focus']
      ], activity + '/parallel', '真实 activeTools 数量支持并行表演；不从多个 session 猜测工具数量。', 'The actual activeTools count supports this parallel-work cue; session count is not tool count.');
    }

    const libraryDetailZh = '真实读取或检索状态；翻阅、查看和思考只是同一活动里的视觉段落。';
    const libraryDetailEn = 'Observed reading or search; book, inspection and thought are visual phases of that same activity.';
    if (activity === 'reading') return choose([
      ['book', '翻阅资料', 'Reading the material', 'book', 'read'],
      ['inspect', '细看一处线索', 'Taking a closer look', 'magnifier', 'inspect'],
      ['think', '消化刚读到的内容', 'Taking in the material', 'notes', 'reflect']
    ], 'reading', libraryDetailZh, libraryDetailEn);
    if (activity === 'searching') {
      const web = /web_?search|search_query|fetch|browse/i.test(toolName);
      return choose([
        ['inspect', web ? '查找资料线索' : '检索项目线索', web ? 'Searching for references' : 'Searching the project', 'magnifier', 'search'],
        ['book', '对照找到的内容', 'Checking the references', 'book', 'compare'],
        ['think', '整理检索线索', 'Connecting the search clues', 'notes', 'connect']
      ], 'searching', libraryDetailZh, libraryDetailEn);
    }
    if (activity === 'coding') return choose([
      ['type', '动手写代码', 'Writing code', 'code', 'type'],
      ['terminal', '敲敲代码与命令', 'Working through the code', 'terminal', 'terminal'],
      ['tidy', '整理正在写的改动', 'Organizing the changes in progress', 'notes', 'consider']
    ], 'coding', '真实修改代码状态；切换表演不生成新命令或假定改动已完成。', 'Observed code changes; animation phases do not execute commands or assume completion.');
    if (activity === 'designing') return choose([
      ['paint', '推敲设计细节', 'Working on the design', 'palette', 'paint'],
      ['think', '换个角度想一想', 'Considering another angle', 'idea', 'consider'],
      ['paint', '继续打磨画面', 'Refining the design', 'palette', 'refine']
    ], 'designing', '只有明确设计活动才展示调色板，不从任务描述猜测设计进度。', 'The palette requires an explicit design activity, not a guess from the task description.');
    if (activity === 'testing') return choose([
      ['inspect', '仔细盯着测试', 'Watching the tests closely', 'magnifier', 'inspect'],
      ['terminal', '留意测试输出', 'Watching test output', 'terminal', 'output'],
      ['think', '等这一轮测试返回', 'Waiting for this test result', 'clock', 'wait']
    ], 'testing', '当前只证实测试活动；必须有明确工具结果才会展示一次成功反应。', 'Only testing activity is proven; a success reaction requires an explicit tool result.');
    if (activity === 'building') return choose([
      ['build', '忙着构建', 'Building the project', 'build', 'assemble'],
      ['terminal', '留意构建输出', 'Watching build output', 'terminal', 'output'],
      ['headphones', '守着构建工作台', 'Keeping an eye on the build', 'clock', 'monitor']
    ], 'building', '明确构建状态；装配和盯输出不代表构建已经成功。', 'Observed build activity; assembly and monitoring do not prove a successful build.');
    return choose([
      ['terminal', '工具正在运行', 'A tool is running', 'terminal', 'execute'],
      ['build', '跟进工具工作', 'Following the tool', 'tools', 'work'],
      ['think', '等这次调用返回', 'Waiting for this call', 'clock', 'watch']
    ], 'running', '只呈现已确认的工具执行，不猜测它是测试、构建或成功。', 'Present only confirmed tool execution without guessing test, build or success.');
  }

  return Object.freeze({ plan, observedWork, ASSETS, EXCLUDED, PHASE_MS, CUE_MS, WORK_CUE_MS });
});
