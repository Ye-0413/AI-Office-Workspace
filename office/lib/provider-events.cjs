'use strict';

// Local, observational adapters. This module neither reads transcripts/config nor
// approves, runs, resumes, or otherwise controls an AI task. See provider-events.md.
const { createHash } = require('node:crypto');
const path = require('node:path');
const { adaptUpstream } = require('./upstream-adapter.cjs');
const { classifyCodexTool } = require('./codex-tool-activity.cjs');

const PROVIDERS = new Set(['codex', 'cursor', 'claude-code', 'hermes']);
const UPSTREAM_SOURCES = new Set(['upstream', 'upstream-derived']);
const LABELS = Object.freeze({
  reading: '读取资料', searching: '检索项目', planning: '整理计划', coding: '修改代码',
  designing: '设计中', building: '构建项目', testing: '运行测试', running: '执行工具',
  'waiting-user': '等待你的确认', 'waiting-tool': '等待工具结果', idle: '本轮已停下',
  error: '遇到问题，等待后续活动', unknown: '工具活动，类别待确认',
});

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cleanText(value, limit = 96) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? Array.from(text).slice(0, limit).join('') : undefined;
}

function identifier(value) {
  if (typeof value !== 'string' || value.length > 256 || !value || /[\s\u0000-\u001f\u007f-\u009f]/.test(value)) return undefined;
  if (value === 'default' || value === 'codex:default') return undefined;
  return value;
}
function codexIdentifier(value) {
  const valid=identifier(value);
  if (!valid) return undefined;
  // The upstream bridge prefixes native Codex UUIDs. Strip only that exact
  // documented form, keeping arbitrary user/session IDs untouched.
  const match=/^codex:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(valid);
  return match ? match[1] : valid;
}

function actorKey(provider, sessionId, subagentId) {
  const base = `${provider}:${encodeURIComponent(sessionId)}`;
  return subagentId ? `${base}:${encodeURIComponent(subagentId)}` : base;
}

function eventTime(receivedAt, timestamp) {
  for (const value of [receivedAt, timestamp]) {
    const n = value instanceof Date ? value.getTime()
      : typeof value === 'number' ? value
        : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  }
  // The caller should pass its receive time. No implicit clock makes replay pure.
  return 0;
}

function absolutePath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f]/.test(value)) return undefined;
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value) ? value : undefined;
}

// Deliberately small shell lexer: inspect tokens; never evaluate expansions.
// Substitutions, redirects, comments, pipelines, backgrounding and multiline
// scripts remain generic activity instead of guessing which step is executing.
function shellSegments(command) {
  if (typeof command !== 'string' || !command.trim() || command.length > 32768 || /[\r\n\u0000]/.test(command)) return null;
  const segments = [];
  let tokens = [], token = '', quote = '', active = false;
  function pushToken() { if (active) tokens.push(token); token = ''; active = false; }
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      if (c === quote) { quote = ''; continue; }
      if (quote === '"' && (c === '$' || c === '`')) return null;
      if (quote === '"' && c === '\\') {
        if (i + 1 >= command.length) return null;
        token += command[++i]; continue;
      }
      token += c; continue;
    }
    if (c === '"' || c === "'") { quote = c; active = true; continue; }
    if (c === '\\') {
      if (i + 1 >= command.length) return null;
      active = true; token += command[++i]; continue;
    }
    if (/\s/.test(c)) { pushToken(); continue; }
    if ('<>`$()|;#'.includes(c)) return null;
    if (c === '&') {
      if (command[i + 1] !== '&') return null;
      pushToken(); if (!tokens.length) return null;
      segments.push(tokens); tokens = []; i += 1; continue;
    }
    active = true; token += c;
  }
  if (quote) return null;
  pushToken();
  if (!tokens.length) return null;
  segments.push(tokens);
  return segments;
}

function executable(value) {
  return value ? value.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(?:exe|cmd)$/, '') : '';
}

function withoutEnvironment(tokens) {
  let rest = tokens.slice();
  while (rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest.shift();
  if (executable(rest[0]) === 'env') {
    rest.shift();
    while (rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest.shift();
  }
  return rest;
}

function commandActivity(tokens) {
  const words = withoutEnvironment(tokens);
  const bin = executable(words[0]);
  const args = words.slice(1);
  const first = args[0] || '';
  if (['rg', 'grep', 'egrep', 'fgrep', 'fd', 'ls'].includes(bin)) return 'searching';
  if (bin === 'find') return args.some(x => ['-exec', '-execdir', '-delete', '-ok', '-okdir'].includes(x)) ? 'running' : 'searching';
  if (['cat', 'head', 'tail', 'less', 'more'].includes(bin)) return 'reading';
  if (bin === 'sed' && args.includes('-n') && !args.some(x => /^-i/.test(x))) return 'reading';
  if (bin === 'git') {
    if (['diff', 'show', 'log', 'status', 'blame'].includes(first)) return 'reading';
    if (first === 'grep') return 'searching';
  }
  if (['pytest', 'pytest-3', 'jest', 'vitest', 'mocha', 'ava', 'ctest'].includes(bin)) return 'testing';
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(bin)) {
    const verb = first === 'run' || first === 'run-script' ? args[1] : first;
    if (typeof verb === 'string' && /^(?:test|test:[A-Za-z0-9:_-]+|t)$/.test(verb)) return 'testing';
    if (typeof verb === 'string' && /^(?:build|build:[A-Za-z0-9:_-]+)$/.test(verb)) return 'building';
    if ((first === 'exec' || first === 'x') && ['pytest', 'jest', 'vitest', 'mocha', 'ava'].includes(executable(args[1]))) return 'testing';
  }
  if (['npx', 'bunx'].includes(bin) && ['jest', 'vitest', 'mocha', 'ava'].includes(executable(first))) return 'testing';
  if (['python', 'python3'].includes(bin) && first === '-m' && ['pytest', 'unittest'].includes(args[1])) return 'testing';
  if (bin === 'uv' && first === 'run' && ['pytest'].includes(executable(args[1]))) return 'testing';
  if (bin === 'node' && (first === '--test' || first.startsWith('--test='))) return 'testing';
  if (['cargo', 'go', 'swift', 'dotnet', 'gradle', './gradlew', 'mvn', 'make'].includes(bin)) {
    if (first === 'test') return 'testing';
    if (['build', 'package', 'assemble'].includes(first)) return 'building';
  }
  if (bin === 'cmake' && first === '--build') return 'building';
  if (bin === 'xcodebuild') {
    if (args.includes('test') && !args.includes('build')) return 'testing';
    if (args.includes('build') && !args.includes('test')) return 'building';
  }
  return 'running';
}

/** Conservative command classification; direct=false never proves a test result. */
function classifyShell(command, depth = 0) {
  const segments = shellSegments(command);
  if (!segments) return { activity: 'running', direct: false, confidence: 'low' };
  const last = withoutEnvironment(segments[segments.length - 1]);
  const prefixIsCd = segments.slice(0, -1).every(words => words[0] === 'cd' && words.length === 2);
  if (!prefixIsCd || !last.length) return { activity: 'running', direct: false, confidence: 'low' };
  const bin = executable(last[0]);
  if (['sh', 'bash', 'zsh'].includes(bin) && ['-c', '-lc'].includes(last[1]) && last.length === 3 && depth < 1) {
    return classifyShell(last[2], depth + 1);
  }
  const activity = commandActivity(last);
  return { activity, direct: activity !== 'running', confidence: activity === 'running' ? 'low' : 'classified' };
}

function toolActivity(provider, toolName, input) {
  if (provider === 'codex') {
    const classified = classifyCodexTool(toolName, input, { classifyShell, fallback: 'unknown' });
    if (classified.activity !== 'unknown') return { activity: classified.activity, direct: false, confidence: classified.codeMode ? 'code-mode-derived' : 'classified' };
  }
  if (provider === 'hermes') {
    if (toolName === 'terminal') return classifyShell(record(input) ? input.command : undefined);
    const names = { read_file: 'reading', search_files: 'searching', web_search: 'searching', web_extract: 'reading',
      write_file: 'coding', patch: 'coding', todo: 'planning', delegate_task: 'waiting-tool', clarify: 'waiting-user',
      browser_navigate: 'reading', browser_snapshot: 'reading' };
    return Object.hasOwn(names, toolName) ? { activity: names[toolName], direct: false, confidence: 'explicit' }
      : { activity: 'unknown', direct: false, confidence: 'low' };
  }
  if ((provider === 'cursor' && toolName === 'Shell') || (provider !== 'cursor' && toolName === 'Bash')) {
    return classifyShell(record(input) ? input.command : undefined);
  }
  const names = provider === 'cursor'
    ? { Read: 'reading', Grep: 'searching', Glob: 'searching', Write: 'coding', Delete: 'coding', Task: 'waiting-tool' }
    : { Read: 'reading', Grep: 'searching', Glob: 'searching', Edit: 'coding', Write: 'coding', MultiEdit: 'coding', apply_patch: 'coding',
      EnterPlanMode: 'planning', ExitPlanMode: 'planning', update_plan: 'planning', Agent: 'waiting-tool', Task: 'waiting-tool' };
  if (Object.hasOwn(names, toolName)) return { activity: names[toolName], direct: false, confidence: 'explicit' };
  // Unknown MCP/custom tools retain their names but do not inherit activities
  // from substrings such as "test", "read", or "design".
  return { activity: 'unknown', direct: false, confidence: 'low' };
}

function resultObject(value) {
  if (record(value)) return value;
  if (typeof value !== 'string' || value.length > 65536) return null;
  try { const parsed = JSON.parse(value); return record(parsed) ? parsed : null; } catch { return null; }
}

function explicitOutcome(value) {
  const result = resultObject(value);
  if (!result) return undefined;
  if (result.interrupted === true || result.is_interrupt === true) return 'cancelled';
  // These numeric fields are explicit exit evidence. Text containing words such
  // as "error", "passed", or "exit code" is intentionally not a protocol.
  for (const key of ['exit_code', 'exitCode']) {
    if (Object.hasOwn(result, key) && Number.isInteger(result[key]) && result[key] >= -2147483648 && result[key] <= 2147483647) return result[key] === 0 ? 'success' : 'failure';
  }
  if (result.isError === true) return 'failure';
  return undefined;
}

function titleFrom(raw, event) {
  const explicit = cleanText(raw.session_title, 48);
  if (explicit) return explicit;
  const value = event === 'turn-start' ? raw.prompt : event === 'subagent-start' ? raw.task : undefined;
  if (typeof value !== 'string') return undefined;
  return cleanText(value.split(/\r?\n/, 1)[0].replace(/^\s{0,3}#{1,6}\s+/, ''), 48);
}

function explicitlyInternal(raw) {
  return raw.internal === true || raw.is_internal === true || raw.codex_internal_thread === 'ambient_suggestions'
    || raw.codex_session_role === 'internal' || raw.thread_source === 'internal';
}

const COMMON = Object.freeze({
  SessionStart: 'session-start', UserPromptSubmit: 'turn-start', PreToolUse: 'tool-start',
  PostToolUse: 'tool-end', PermissionRequest: 'waiting-user', SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-end', Stop: 'turn-end', SessionEnd: 'session-end',
  PreCompact: 'metadata', PostCompact: 'metadata',
});
const CURSOR = Object.freeze({
  sessionStart: 'session-start', beforeSubmitPrompt: 'turn-start', preToolUse: 'tool-start',
  postToolUse: 'tool-end', postToolUseFailure: 'tool-end', subagentStart: 'subagent-start',
  subagentStop: 'subagent-end', stop: 'turn-end', sessionEnd: 'session-end',
  preCompact: 'metadata', afterAgentResponse: 'metadata', afterAgentThought: 'metadata',
});

// Hermes' own hook dialect. End-of-turn and final session teardown are distinct.
function normalizeHermesEvent(raw, options) {
  const rawEvent = cleanText(raw.hook_event_name, 96);
  const names = { on_session_start:'session-start', on_session_reset:'session-start', pre_llm_call:'turn-start',
    pre_tool_call:'tool-start', post_tool_call:'tool-end', on_session_end:'turn-end', on_session_finalize:'session-end',
    subagent_start:'subagent-start', subagent_stop:'subagent-end',
    on_human_input_request:'waiting-user', on_human_input_resolved:'tool-end' };
  if (!rawEvent || !Object.hasOwn(names, rawEvent)) return null;
  let event = names[rawEvent];
  const child = rawEvent === 'subagent_start' || rawEvent === 'subagent_stop';
  const human = rawEvent === 'on_human_input_request' || rawEvent === 'on_human_input_resolved';
  const sessionId = identifier(child ? raw.child_session_id : raw.session_id) || (!child ? identifier(raw.session_key) : undefined);
  if (!sessionId) return null;
  const parentSession = identifier(raw.parent_session_id);
  const parentId = parentSession && parentSession !== sessionId ? actorKey('hermes', parentSession) : undefined;
  if (child && !parentId) return null;
  const turnId = child ? undefined : identifier(raw.turn_id);
  const requestId = identifier(raw.request_id);
  const toolCallId = human ? requestId && 'human:' + requestId : identifier(raw.tool_call_id);
  const toolName = human ? 'clarify' : cleanText(raw.tool_name, 96);
  const at = eventTime(options.receivedAt, raw.timestamp);
  let activity = 'unknown', confidence = 'explicit', outcome, summary;
  if (event === 'tool-start' || event === 'tool-end') {
    if (!toolCallId || !toolName) return null;
    const classified = toolActivity('hermes', toolName, raw.tool_input || raw.args);
    activity = classified.activity; confidence = classified.confidence;
    if (event === 'tool-start' && activity === 'waiting-user') event = 'waiting-user';
    if (event === 'tool-end') {
      const status = human ? raw.outcome : raw.status;
      outcome = ['cancelled','interrupted','withdrawn','skipped','timed_out','timeout'].includes(status) ? 'cancelled'
        : ['error','blocked','failed','failure'].includes(status) ? 'failure'
          : ['ok','success','answered','resolved'].includes(status) ? 'success' : explicitOutcome(raw.tool_response) || 'unknown';
      // No prompt, response, answer or result body is retained.
      summary = human ? '人工输入等待已结束' : outcome === 'failure' ? '工具执行未成功' : '工具已返回';
    }
  } else if (event === 'waiting-user') {
    if (!toolCallId) return null;
    activity = 'waiting-user'; summary = '等待你的输入';
  } else if (event === 'session-start') { activity = 'idle'; summary = '会话已进入工作室'; }
  else if (event === 'turn-start' || event === 'subagent-start') { activity = 'planning'; summary = child ? '协作伙伴开始工作' : '收到新任务'; }
  else if (event === 'turn-end') {
    if (raw.interrupted === true) { event = 'interrupted'; outcome = 'cancelled'; activity = 'idle'; summary = '本轮已中断'; }
    else if (raw.failed === true) { event = 'error'; outcome = 'failure'; activity = 'error'; summary = '本轮遇到问题'; }
    else { activity = 'idle'; summary = '本轮已停下，可继续对话'; if (raw.completed === true) outcome = 'success'; }
  } else if (event === 'subagent-end') {
    outcome = raw.child_status === 'completed' ? 'success' : ['failed','error'].includes(raw.child_status) ? 'failure'
      : raw.child_status === 'interrupted' ? 'cancelled' : 'unknown';
    activity = outcome === 'failure' ? 'error' : 'idle'; summary = '协作伙伴本轮已停下';
  } else { activity = 'idle'; summary = '会话已结束'; }
  const id = actorKey('hermes', sessionId);
  const nativeEventId = identifier(raw.event_id);
  const digest = JSON.stringify([id,rawEvent,turnId,toolCallId,outcome,toolName,nativeEventId,
    toolCallId || nativeEventId ? undefined : at]);
  const projectPath = absolutePath(raw.cwd);
  return { id, eventId:'hermes-' + createHash('sha256').update(digest).digest('hex').slice(0,24), provider:'hermes',sessionId,
    ...(parentId ? {parentId} : {}), ...(turnId ? {turnId} : {}), ...(toolCallId ? {toolCallId} : {}),
    at,event,activity,...(projectPath ? {projectPath} : {}), ...(toolName ? {toolName} : {}),
    summary:summary || LABELS[activity], ...(outcome ? {outcome} : {}),
    evidence:{source:cleanText(options.source,48) || 'hook',rawEvent,confidence} };
}

/**
 * normalizeEvent(provider, raw, { receivedAt?, source? }) -> event | null
 * `id` is the stable actor key; `eventId` identifies a delivery/logical event.
 * `at` is epoch milliseconds, 0 if the caller supplied no valid time.
 * source='upstream' also accepts the original app's reduced {event,...} body.
 * No full prompt, answer, command, file content or tool output is retained.
 */
function normalizeEvent(provider, raw, options = {}) {
  provider=provider==='cursor-agent'?'cursor':provider==='claude'?'claude-code':provider;
  if (!record(raw) || !record(options) || explicitlyInternal(raw)) return null;
  if (!PROVIDERS.has(provider)) return adaptUpstream(provider,raw,options,normalizeEvent);
  if (provider === 'hermes') return normalizeHermesEvent(raw, options);
  const source = cleanText(options.source, 48) || 'hook';
  const upstream = UPSTREAM_SOURCES.has(source);
  const rawEvent = typeof raw.hook_event_name === 'string' ? raw.hook_event_name : upstream ? raw.event : undefined;
  if (typeof rawEvent !== 'string') return null;
  let event;
  if (provider === 'cursor' && !upstream) event = Object.hasOwn(CURSOR, rawEvent) ? CURSOR[rawEvent] : undefined;
  else event = Object.hasOwn(COMMON, rawEvent) ? COMMON[rawEvent] : undefined;
  if (!event && provider === 'claude-code' && ['PostToolUseFailure', 'StopFailure', 'Notification', 'Elicitation', 'ElicitationResult'].includes(rawEvent)) {
    event = rawEvent === 'PostToolUseFailure' ? 'tool-end'
      : rawEvent === 'StopFailure' ? 'error'
        : rawEvent === 'Elicitation' ? 'waiting-user' : 'metadata';
  }
  if (provider === 'codex' && rawEvent === 'Interrupt') event = 'interrupted';
  if (upstream && ['PostToolUseFailure', 'StopFailure', 'ApiError'].includes(rawEvent)) event = rawEvent === 'PostToolUseFailure' ? 'tool-end' : 'error';
  if (!event) return null;

  let sessionId = provider === 'cursor' ? identifier(raw.conversation_id) || identifier(raw.session_id) : provider==='codex' ? codexIdentifier(raw.session_id) : identifier(raw.session_id);
  const sessionIdentifier=provider==='codex'?codexIdentifier:identifier;
  let subagentId = sessionIdentifier(raw.subagent_id) || (upstream ? sessionIdentifier(raw.codex_subagent_id) : undefined);
  if (!upstream && provider !== 'cursor') subagentId = sessionIdentifier(raw.agent_id);
  const parentConversation = provider === 'cursor' ? identifier(raw.parent_conversation_id) : undefined;
  if (parentConversation && subagentId) sessionId = parentConversation;
  if (!sessionId || (event.startsWith('subagent-') && !subagentId)) return null;
  const id = actorKey(provider, sessionId, subagentId);
  const parentSession = provider==='codex' ? codexIdentifier(raw.parent_thread_id)||codexIdentifier(raw.codex_parent_thread_id)
    : identifier(raw.parent_thread_id) || identifier(raw.codex_parent_thread_id);
  const parentId = subagentId ? actorKey(provider, sessionId) : parentSession ? actorKey(provider, parentSession) : undefined;
  const turnId = provider === 'cursor' ? identifier(raw.generation_id)
    : provider === 'claude-code' ? identifier(raw.prompt_id) : identifier(raw.turn_id);
  const toolCallId = identifier(raw.tool_use_id) || (event.startsWith('subagent-') ? identifier(raw.tool_call_id) : undefined);
  const toolName = cleanText(raw.tool_name, 96);
  const at = eventTime(options.receivedAt, raw.timestamp);
  const projectPath = absolutePath(raw.cwd) || (Array.isArray(raw.workspace_roots) && raw.workspace_roots.length === 1 ? absolutePath(raw.workspace_roots[0]) : undefined);
  let activity = 'unknown', confidence = 'explicit', outcome;
  let summary;

  if (event === 'tool-start' || event === 'tool-end') {
    if (!toolName && !upstream) return null;
    const classified = toolActivity(provider, toolName, raw.tool_input);
    activity = classified.activity; confidence = classified.confidence;
    if (event === 'tool-start' && provider === 'claude-code' && toolName === 'AskUserQuestion') {
      event = 'waiting-user'; activity = 'waiting-user'; confidence = 'explicit';
    }
    if (event === 'tool-end') {
      const failedEvent = rawEvent === 'PostToolUseFailure' || rawEvent === 'postToolUseFailure';
      outcome = raw.is_interrupt === true ? 'cancelled' : failedEvent ? 'failure'
        : explicitOutcome(provider === 'cursor' && !upstream ? raw.tool_output : raw.tool_response)
          || (provider === 'codex' || upstream ? 'unknown' : 'success');
      if (outcome === 'cancelled') { activity = 'idle'; confidence = 'explicit'; summary = '工具已中断'; }
      else if (outcome === 'failure') {
        // A tool failed, not necessarily the tests within a compound command.
        activity = 'error'; confidence = 'explicit'; summary = '工具执行未成功';
      } else summary = outcome === 'success' ? `${LABELS[activity]} · 工具返回` : '工具已返回，结果待确认';
    }
  } else if (event === 'session-start') { activity = 'idle'; summary = '会话已进入工作室'; }
  else if (event === 'turn-start') { activity = 'planning'; confidence = 'classified'; summary = '收到新任务'; }
  else if (event === 'waiting-user') { activity = 'waiting-user'; summary = rawEvent === 'PermissionRequest' ? '请求审批，可能需要你确认' : '等待你的输入'; }
  else if (event === 'subagent-start') { activity = 'waiting-tool'; summary = '协作伙伴开始工作'; }
  else if (event === 'subagent-end') {
    activity = 'idle'; summary = '协作伙伴本轮已停下';
    if (provider === 'cursor') outcome = raw.status === 'error' ? 'failure' : raw.status === 'aborted' ? 'cancelled' : raw.status === 'completed' ? 'success' : 'unknown';
    if (outcome === 'failure') { activity = 'error'; summary = '协作伙伴遇到问题'; }
  } else if (event === 'turn-end') {
    const hasBackground = (Array.isArray(raw.background_tasks) && raw.background_tasks.length > 0)
      || (Array.isArray(raw.session_crons) && raw.session_crons.length > 0)
      || raw.background_tasks_count > 0 || raw.background_subagents_count > 0 || raw.session_crons_count > 0
      || raw.stop_hook_active === true;
    activity = hasBackground ? 'waiting-tool' : 'idle';
    summary = hasBackground ? '主响应停下，仍有后台活动' : '本轮已停下，可继续对话';
    if (provider === 'cursor' && !upstream) {
      if (!['completed', 'aborted', 'error'].includes(raw.status)) return null;
      outcome = raw.status === 'completed' ? 'success' : raw.status === 'aborted' ? 'cancelled' : 'failure';
      if (outcome === 'failure') { event = 'error'; activity = 'error'; summary = '本轮遇到问题'; }
      else if (outcome === 'cancelled') { event = 'interrupted'; activity = 'idle'; summary = '本轮已中断'; }
    }
  } else if (event === 'session-end') { activity = 'idle'; summary = '会话已结束'; }
  else if (event === 'interrupted') { activity = 'idle'; outcome = 'cancelled'; summary = '本轮已中断'; }
  else if (event === 'error') { activity = 'error'; outcome = 'failure'; summary = '本轮遇到问题'; }
  else {
    if (rawEvent === 'Notification' && ['permission_prompt', 'idle_prompt'].includes(raw.notification_type)) {
      event = 'waiting-user'; activity = 'waiting-user'; summary = '需要你的关注';
    } else summary = ['PreCompact', 'PostCompact', 'preCompact'].includes(rawEvent) ? '整理上下文' : '会话元信息更新';
  }
  summary ||= LABELS[activity];
  const title = titleFrom(raw, event);
  const nativeEventId = identifier(raw.event_id);
  const hashInput = JSON.stringify([id, rawEvent, turnId, toolCallId, outcome, toolName,
    toolCallId || nativeEventId ? undefined : at, nativeEventId]);
  const eventId = `${provider}-${createHash('sha256').update(hashInput).digest('hex').slice(0, 24)}`;
  return {
    id, eventId, provider, sessionId,
    ...(parentId ? { parentId } : {}), ...(subagentId ? { subagentId } : {}),
    ...(turnId ? { turnId } : {}), ...(toolCallId ? { toolCallId } : {}),
    at, event, activity, ...(title ? { title } : {}), ...(projectPath ? { projectPath } : {}),
    ...(toolName ? { toolName } : {}), summary, ...(outcome ? { outcome } : {}),
    evidence: { source, rawEvent, confidence },
  };
}

module.exports = { normalizeEvent, classifyShell, actorKey };
