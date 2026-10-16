'use strict';
const { normalizeEvent } = require('./provider-events.cjs');

// Authored, synthetic event stories. This module does not execute the described
// commands, write projects, approve tools, or read a real agent configuration.
const start = actor => ({ actor, kind: 'start' });
const tool = (actor, id, name, input = {}) => ({ actor, kind: 'tool', id, name, input });
const result = (actor, id, name, ok = true) => ({ actor, kind: 'result', id, name, ok });
const wait = (actor, id, name, input = {}) => ({ actor, kind: 'wait', id, name, input });
const stop = actor => ({ actor, kind: 'stop' });
const close = actor => ({ actor, kind: 'close' });
const frame = (labelZh, labelEn, events) => ({ labelZh, labelEn, events });

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const VIGNETTES = freeze([
  {
    id: 'harbour-morning', titleZh: '早班渡轮小队', titleEn: 'First Ferry Crew',
    descriptionZh: '让时刻表、电子船票和双语提示，一起迎接早班渡轮。',
    descriptionEn: 'A timetable, an accessible ticket, and a bilingual welcome for the first ferry.',
    projectName: '海港早班', synthetic: true,
    cast: [
      { id: 'timetable', provider: 'codex', titleZh: '让渡轮时刻表更清楚', titleEn: 'Make the ferry timetable clearer' },
      { id: 'ticket', provider: 'cursor', titleZh: '给电子船票加大字模式', titleEn: 'Add large text to the ferry ticket' },
      { id: 'welcome', provider: 'claude-code', titleZh: '写一段双语码头提示', titleEn: 'Write a bilingual pier welcome' }
    ],
    frames: [
      frame('早班开工，先找资料', 'The morning crew looks up the details', [
        start('timetable'), start('ticket'), start('welcome'),
        tool('timetable', 'route-search', 'Bash', { command: 'rg "departure" src/timetable' }),
        tool('ticket', 'ticket-read', 'Read', { file_path: 'src/ticket.tsx' }),
        tool('welcome', 'welcome-plan', 'EnterPlanMode')
      ]),
      frame('查表、排版、写问候', 'A timetable, a layout, and a hello', [
        result('timetable', 'route-search', 'Bash'), tool('timetable', 'route-read', 'Read', { file_path: 'src/timetable/departures.ts' }),
        result('ticket', 'ticket-read', 'Read'), tool('ticket', 'ticket-edit', 'Write', { file_path: 'src/ticket.tsx' }),
        result('welcome', 'welcome-plan', 'EnterPlanMode'), tool('welcome', 'welcome-read', 'Read', { file_path: 'content/pier-welcome.md' })
      ]),
      frame('把小细节放进文件里', 'The small details reach the files', [
        result('timetable', 'route-read', 'Read'), tool('timetable', 'route-edit', 'apply_patch'),
        result('ticket', 'ticket-edit', 'Write'), tool('ticket', 'ticket-test', 'Shell', { command: 'npm test -- ticket' }),
        result('welcome', 'welcome-read', 'Read'), tool('welcome', 'welcome-edit', 'Edit', { file_path: 'content/pier-welcome.md' })
      ]),
      frame('船票测完，问候等你确认', 'Ticket checks return; the welcome awaits you', [
        result('timetable', 'route-edit', 'apply_patch'), tool('timetable', 'route-test', 'Bash', { command: 'npm test -- timetable' }),
        result('ticket', 'ticket-test', 'Shell'), stop('ticket'),
        result('welcome', 'welcome-edit', 'Edit'), wait('welcome', 'welcome-save', 'Write', { file_path: 'content/pier-sign.md' })
      ]),
      frame('时刻表也交回检查结果', 'The timetable checks return too', [
        result('timetable', 'route-test', 'Bash'), stop('timetable'), close('ticket')
      ]),
      frame('早班交接，保留待确认的提示', 'Morning handover keeps the pending welcome', [close('timetable')])
    ]
  },
  {
    id: 'rainy-afternoon', titleZh: '雨窗修补下午', titleEn: 'Rainy Window Workshop',
    descriptionZh: '为雨窗补好暂停按钮，让面板更稳，也给安静模式留一句说明。',
    descriptionEn: 'Repair a rain pause button, calm a folding panel, and explain the quiet mode.',
    projectName: '雨窗工作室', synthetic: true,
    cast: [
      { id: 'rain', provider: 'codex', titleZh: '修好雨窗动画的暂停按钮', titleEn: 'Repair the rain animation pause button' },
      { id: 'panel', provider: 'cursor', titleZh: '让折叠面板少一点晃动', titleEn: 'Steady the folding panel motion' },
      { id: 'guide', provider: 'claude-code', titleZh: '给雨天场景补上阅读说明', titleEn: 'Explain the rainy scene controls' }
    ],
    frames: [
      frame('雨点来了，先看控制开关', 'Raindrops arrive; first inspect the controls', [
        start('rain'), start('panel'), start('guide'),
        tool('rain', 'rain-search', 'Bash', { command: 'rg "pause" src/rain' }),
        tool('panel', 'panel-read', 'Read', { file_path: 'src/folding-panel.tsx' }),
        tool('guide', 'guide-read', 'Read', { file_path: 'content/rain-controls.md' })
      ]),
      frame('给雨窗和面板各缝一针', 'A small stitch for the window and panel', [
        result('rain', 'rain-search', 'Bash'), tool('rain', 'rain-edit', 'apply_patch'),
        result('panel', 'panel-read', 'Read'), tool('panel', 'panel-edit', 'Write', { file_path: 'src/folding-panel.tsx' }),
        result('guide', 'guide-read', 'Read'), tool('guide', 'guide-edit', 'Edit', { file_path: 'content/rain-controls.md' })
      ]),
      frame('开关进入测试，说明留一个问题', 'Controls enter tests; one wording question stays open', [
        result('rain', 'rain-edit', 'apply_patch'), tool('rain', 'rain-test', 'Bash', { command: 'npm test -- rain-controls' }),
        result('panel', 'panel-edit', 'Write'), tool('panel', 'panel-test', 'Shell', { command: 'npm test -- reduced-motion' }),
        result('guide', 'guide-edit', 'Edit'), tool('guide', 'guide-question', 'AskUserQuestion', { question: '安静模式的说明想用哪一句？' })
      ]),
      frame('雨窗测试没通过，回工位修一处', 'A rain check fails; back to the desk', [
        result('rain', 'rain-test', 'Bash', false), tool('rain', 'rain-repair', 'apply_patch'),
        result('panel', 'panel-test', 'Shell'), stop('panel')
      ]),
      frame('再测一次，面板小队先交接', 'Test again; the panel crew hands over', [
        result('rain', 'rain-repair', 'apply_patch'), tool('rain', 'rain-retest', 'Bash', { command: 'npm test -- rain-controls' }), close('panel')
      ]),
      frame('暂停按钮的测试交回了', 'The pause button checks return', [result('rain', 'rain-retest', 'Bash'), stop('rain')]),
      frame('雨窗收好，问题继续等你', 'Window work wraps up; the question still awaits you', [close('rain')])
    ]
  },
  {
    id: 'lantern-evening', titleZh: '小灯夜班交接', titleEn: 'Lantern Shift Handover',
    descriptionZh: '夜色里整理改动、修复构建，并把欢迎与晚安文案放进交接卡。',
    descriptionEn: 'A night shift records changes, repairs a build, and prepares its welcome and goodnight copy.',
    projectName: '晚灯交接台', synthetic: true,
    cast: [
      { id: 'handover', provider: 'codex', titleZh: '为今日改动写一张交接卡', titleEn: 'Write a handover card for today’s changes' },
      { id: 'build', provider: 'cursor', titleZh: '点亮夜间构建检查台', titleEn: 'Light up the evening build checks' },
      { id: 'copy', provider: 'claude-code', titleZh: '整理夜班欢迎与晚安文案', titleEn: 'Polish the night shift greetings' }
    ],
    frames: [
      frame('开小灯，看看今天的改动', 'Lamps on; review today’s changes', [
        start('handover'), start('build'), start('copy'),
        tool('handover', 'changes-read', 'Bash', { command: 'git diff --stat' }),
        tool('build', 'night-build', 'Shell', { command: 'npm run build' }),
        tool('copy', 'night-copy-read', 'Read', { file_path: 'content/evening.md' })
      ]),
      frame('交接先列清单，构建查一个问题', 'List the handover; investigate a build problem', [
        result('handover', 'changes-read', 'Bash'), tool('handover', 'changes-plan', 'update_plan'),
        result('build', 'night-build', 'Shell', false), tool('build', 'build-read', 'Read', { file_path: 'src/lantern.ts' }),
        result('copy', 'night-copy-read', 'Read'), tool('copy', 'night-copy-edit', 'Edit', { file_path: 'content/evening.md' })
      ]),
      frame('修构建，写卡片，预览等你确认', 'Repair the build, write a card, await preview approval', [
        result('handover', 'changes-plan', 'update_plan'), tool('handover', 'changes-edit', 'apply_patch'),
        result('build', 'build-read', 'Read'), tool('build', 'build-edit', 'Write', { file_path: 'src/lantern.ts' }),
        result('copy', 'night-copy-edit', 'Edit'), wait('copy', 'night-preview', 'Bash', { command: 'npm run preview' })
      ]),
      frame('两边各跑一次检查', 'Each side runs its checks', [
        result('handover', 'changes-edit', 'apply_patch'), tool('handover', 'changes-test', 'Bash', { command: 'npm test -- handover' }),
        result('build', 'build-edit', 'Write'), tool('build', 'night-rebuild', 'Shell', { command: 'npm run build' })
      ]),
      frame('检查结果回到交接台', 'Check results reach the handover desk', [
        result('handover', 'changes-test', 'Bash'), stop('handover'),
        result('build', 'night-rebuild', 'Shell'), stop('build')
      ]),
      frame('收好卡片，预览仍由你决定', 'Cards filed; the preview decision stays with you', [close('handover'), close('build')])
    ]
  }
]);

const byId = new Map(VIGNETTES.map(vignette => [vignette.id, vignette]));
const COMMON = Object.freeze({ start: 'UserPromptSubmit', tool: 'PreToolUse', result: 'PostToolUse', wait: 'PermissionRequest', stop: 'Stop', close: 'SessionEnd' });
const CURSOR = Object.freeze({ start: 'beforeSubmitPrompt', tool: 'preToolUse', result: 'postToolUse', stop: 'stop', close: 'sessionEnd' });

function getVignette(id) { return byId.get(id) || null; }

/** Materialize one frame through the exact production adapters, without a timer. */
function eventsForFrame(id, index, { receivedAt = 0, language = 'zh', runId = 'preview' } = {}) {
  const vignette = getVignette(id);
  if (!vignette) throw new RangeError('Unknown demo vignette: ' + id);
  if (!Number.isInteger(index) || index < 0 || index >= vignette.frames.length) throw new RangeError('Invalid demo frame');
  if (!Number.isFinite(receivedAt) || receivedAt < 0) throw new TypeError('Demo receive time must be a nonnegative finite number');
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(runId)) throw new TypeError('Invalid demo run ID');
  const projectPath = '/Demo/' + vignette.projectName;
  return vignette.frames[index].events.map((step, eventIndex) => {
    const actor = vignette.cast.find(candidate => candidate.id === step.actor);
    const cursor = actor.provider === 'cursor';
    const title = language === 'en' ? actor.titleEn : actor.titleZh;
    const sessionId = 'demo-' + vignette.id + '-' + actor.id;
    const turnId = 'demo-' + vignette.id + '-' + runId;
    const raw = {
      hook_event_name: (cursor ? CURSOR : COMMON)[step.kind],
      event_id: turnId + '-' + index + '-' + eventIndex,
      session_title: title,
      ...(cursor ? { conversation_id: sessionId, generation_id: turnId, workspace_roots: [projectPath] }
        : { session_id: sessionId, turn_id: turnId, prompt_id: turnId, cwd: projectPath }),
      ...(step.kind === 'start' ? { prompt: title } : {}),
      ...(step.id ? { tool_use_id: step.id, tool_name: step.name } : {}),
      ...(step.input ? { tool_input: step.input } : {}),
      ...(step.kind === 'result' ? { tool_response: { exit_code: step.ok ? 0 : 1 }, tool_output: JSON.stringify({ exitCode: step.ok ? 0 : 1 }) } : {}),
      ...(step.kind === 'stop' && cursor ? { status: 'completed' } : {})
    };
    const normalized = normalizeEvent(actor.provider, raw, { receivedAt, source: 'demo' });
    if (!normalized) throw new Error('Invalid authored demo event: ' + raw.event_id);
    return normalized;
  });
}

module.exports = Object.freeze({ VIGNETTES, getVignette, eventsForFrame });
