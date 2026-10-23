'use strict';

// Passive normalization of the hook/plugin dialects in agents/registry.js.
// It never runs upstream hook code, returns an approval, or reads AI settings.
const { createHash } = require('node:crypto');
const path = require('node:path');
const { getProvider, normalizeProviderId, PROVIDER_IDS } = require('./provider-catalog.cjs');
const EXISTING = new Set(['codex', 'claude-code', 'cursor-agent', 'hermes']);
const ADAPTED_PROVIDERS = Object.freeze(PROVIDER_IDS.filter((id) => !EXISTING.has(id)));
const COMMON = Object.freeze({ SessionStart:'SessionStart', SessionEnd:'SessionEnd', UserPromptSubmit:'UserPromptSubmit',
  PreToolUse:'PreToolUse', PostToolUse:'PostToolUse', PostToolUseFailure:'PostToolUseFailure', Stop:'Stop', StopFailure:'StopFailure',
  SubagentStart:'SubagentStart', SubagentStop:'SubagentStop', PreCompact:'PreCompact', PostCompact:'PostCompact',
  Notification:'Notification', PermissionRequest:'PermissionRequest', Elicitation:'Elicitation', ElicitationResult:'ElicitationResult' });
const DIALECTS = Object.freeze({
  'copilot-cli': { sessionStart:'SessionStart', sessionEnd:'SessionEnd', userPromptSubmitted:'UserPromptSubmit', preToolUse:'PreToolUse', postToolUse:'PostToolUse', errorOccurred:'StopFailure', agentStop:'Stop', subagentStart:'SubagentStart', subagentStop:'SubagentStop', preCompact:'PreCompact' },
  'gemini-cli': { BeforeAgent:'UserPromptSubmit', BeforeTool:'PreToolUse', AfterTool:'PostToolUse', AfterAgent:'Stop', PreCompress:'PreCompact' },
  'antigravity-cli': { PreInvocation:'UserPromptSubmit', PostInvocation:'Stop' },
  'kiro-cli': { agentSpawn:'SessionStart', userPromptSubmit:'UserPromptSubmit', preToolUse:'PreToolUse', postToolUse:'PostToolUse', stop:'Stop' },
  kirocrew: { AgentSpawn:'SessionStart' },
  'kimi-cli': { PermissionResult:'Notification', Interrupt:'Stop' },
  codewhale: { session_start:'SessionStart', session_end:'SessionEnd', message_submit:'UserPromptSubmit', tool_call_before:'PreToolUse', tool_call_after:'PostToolUse', mode_change:'PreCompact', on_error:'StopFailure' },
  'grok-build': { session_start:'SessionStart', session_end:'SessionEnd', user_prompt_submit:'UserPromptSubmit', pre_tool_use:'PreToolUse', post_tool_use:'PostToolUse', post_tool_use_failure:'PostToolUseFailure', stop:'Stop', stop_failure:'StopFailure', stop_cancelled:'Stop', notification:'Notification', pre_compact:'PreCompact', post_compact:'PostCompact', permission_denied:'Notification', StopCancelled:'Stop', PermissionDenied:'Notification' },
  qoder: { PermissionDenied:'Notification' }, qoderwork: { PermissionRequest:'PreToolUse', PermissionDenied:'PreToolUse' }, qwenwork: { PermissionRequest:'PreToolUse', PermissionDenied:'PreToolUse' },
  pi: { session_start:'SessionStart', before_agent_start:'UserPromptSubmit', agent_end:'Stop', session_before_compact:'PreCompact', session_compact:'PostCompact', session_shutdown:'SessionEnd', tool_call:'PreToolUse', tool_result:'PostToolUse' },
  omp: { session_start:'SessionStart', session_switch:'SessionStart', session_branch:'SessionStart', before_agent_start:'UserPromptSubmit', agent_end:'Stop', session_before_compact:'PreCompact', session_compact:'PostCompact', session_shutdown:'SessionEnd', tool_call:'PreToolUse', tool_result:'PostToolUse' },
  'deepseek-harness': { 'turn/start':'UserPromptSubmit', 'tool/call':'PreToolUse', 'tool/result':'PostToolUse', 'turn/end':'Stop' },
  openclaw: { session_start:'SessionStart', model_call_started:'UserPromptSubmit', before_tool_call:'PreToolUse', after_tool_call:'PostToolUse', before_compaction:'PreCompact', after_compaction:'PostCompact', model_call_ended:'Stop', session_end:'SessionEnd' },
  opencode: { 'session.created':'SessionStart', 'session.deleted':'SessionEnd', 'session.idle':'Stop', 'session.error':'StopFailure', 'session.compacted':'PostCompact' },
  mimocode: { 'session.created':'SessionStart', 'session.deleted':'SessionEnd', 'session.idle':'Stop', 'session.error':'StopFailure', 'session.compacted':'PostCompact' },
});
const TOOL_ALIASES = Object.freeze({
  read_file:'Read', read:'Read', view:'Read', read_many_files:'Read', fs_read:'Read',
  grep:'Grep', grep_search:'Grep', search_file_content:'Grep', search_files:'Grep', search:'Grep', glob:'Glob', list_directory:'Glob',
  write_file:'Write', write:'Write', create_file:'Write', fs_write:'Write', edit:'Edit', edit_file:'Edit', replace:'Edit', str_replace:'Edit',
  run_shell_command:'Bash', shell:'Bash', bash:'Bash', terminal:'Bash', execute_command:'Bash', execute:'Bash',
  todo_write:'update_plan', task:'Task', delegate_task:'Task',
});
const sha = (value) => createHash('sha256').update(value).digest('hex');
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function id(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f-\u009f]/.test(value) ? value : undefined; }
function actualId(value) { const result=id(value); return result && result !== 'default' && !result.endsWith(':default') ? result : undefined; }
function text(value, max=96) { return typeof value === 'string' && !/[\u0000-\u001f\u007f]/.test(value) ? value.slice(0,max) : undefined; }
function first(...values) { return values.find((value) => typeof value === 'string' && value.length); }
function absolute(value) { return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value) && (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) ? value : undefined; }
function key(provider, session, subagent) { const base=provider+':'+encodeURIComponent(session); return subagent ? base+':'+encodeURIComponent(subagent) : base; }
function explicitResult(raw, nativeEvent, provider) {
  const response = raw.tool_response ?? raw.toolResponse ?? raw.tool_output ?? raw.result;
  let value=record(response) ? response : undefined;
  if (!value && typeof response === 'string' && response.length <= 65536) { try { const parsed=JSON.parse(response); if(record(parsed))value=parsed; } catch {} }
  if (raw.is_interrupt === true || raw.interrupted === true || ['cancelled','aborted','interrupted'].includes(raw.status)) return { interrupted:true };
  if (nativeEvent === 'PostToolUseFailure' || raw.isError === true || value?.isError === true) return { isError:true };
  if (provider === 'codewhale' && raw.DEEPSEEK_TOOL_SUCCESS === 'false') return { isError:true };
  if (provider === 'codewhale' && /^-?\d+$/.test(raw.DEEPSEEK_TOOL_EXIT_CODE || '')) {
    const code=Number(raw.DEEPSEEK_TOOL_EXIT_CODE); if (Number.isInteger(code) && code>=-2147483648 && code<=2147483647) return {exit_code:code};
  }
  if (record(raw.data) && (raw.data.error || raw.data.message?.isError === true || (Array.isArray(raw.data.message?.content) && raw.data.message.content.some((item) => item?.isError === true)))) return { isError:true };
  for (const source of [value, raw]) for (const field of ['exit_code','exitCode']) {
    if (source && Number.isInteger(source[field]) && source[field] >= -2147483648 && source[field] <= 2147483647) return { exit_code:source[field] };
  }
  // A native error boolean is explicit failure; its absence never proves success.
  if (raw.error !== undefined && raw.error !== null && raw.error !== false && raw.error !== '') return { isError:true };
  return undefined;
}

function adaptUpstream(provider, raw, options = {}, normalizeCommon) {
  const canonical=normalizeProviderId(provider);
  if (!canonical || EXISTING.has(canonical) || !record(raw) || !record(options) || typeof normalizeCommon !== 'function') return null;
  if (raw.internal === true || raw.is_internal === true || raw.thread_source === 'internal') return null;
  const config=getProvider(canonical);
  const nativeEvent=first(raw.hook_event_name,raw.hookEventName,raw.eventName,raw.event,raw.Event,raw.type,options.eventName);
  if (!nativeEvent) return null;
  const dialect=DIALECTS[canonical] || {};
  let event=Object.hasOwn(dialect,nativeEvent) ? dialect[nativeEvent]
    : Object.hasOwn(config.eventMap,nativeEvent) && Object.hasOwn(COMMON,nativeEvent) ? COMMON[nativeEvent] : undefined;
  // Reduced /state bodies use upstream's normalized PascalCase even when the
  // native dialect is camelCase. The source marker is an explicit trust boundary.
  if (!event && ['upstream','upstream-derived'].includes(options.source) && Object.hasOwn(COMMON,nativeEvent)) event=COMMON[nativeEvent];
  if (!event) return null;
  // OMP's extension confirms a main-session stop candidate before agent_end.
  // An isolated raw callback cannot prove that boundary, so require its adapter.
  if (canonical === 'omp' && nativeEvent === 'agent_end' && (raw.willContinue === true || raw.main_session_stop_confirmed !== true)) return null;
  if (canonical === 'openclaw' && nativeEvent === 'session_end' && ['new','reset','compaction'].includes(raw.reason)) return null;
  if (canonical === 'codewhale' && nativeEvent === 'mode_change' && raw.DEEPSEEK_MODE !== 'compact' && raw.DEEPSEEK_PREVIOUS_MODE !== 'compact') event='Notification';
  const data=record(raw.data) ? raw.data : {};
  const ctx=record(raw.context) ? raw.context : {};
  const toolCall=record(raw.toolCall) ? raw.toolCall : {};
  let cwd=absolute(first(raw.cwd,ctx.cwd,ctx.workspaceDir,raw.workspaceDir,toolCall.args?.Cwd,raw.DEEPSEEK_WORKSPACE));
  if (!cwd && Array.isArray(raw.workspacePaths) && raw.workspacePaths.length === 1) cwd=absolute(raw.workspacePaths[0]);
  // KiroCrew's process cwd belongs to its gateway, not the user's chat project.
  if (canonical === 'kirocrew') cwd=undefined;
  let session=actualId(first(raw.session_id,raw.sessionId,raw.conversationId,raw.conversation_id,raw.session_key,raw.sessionKey,ctx.sessionId,ctx.sessionKey));
  if (!session && canonical === 'deepseek-harness') session=actualId(raw.session?.id);
  if (!session && ['opencode','mimocode'].includes(canonical)) session=actualId(first(raw.sessionID,raw.properties?.sessionID,raw.properties?.info?.id));
  if (!session && canonical === 'openclaw') session=actualId(first(raw.runId,ctx.runId));
  if (!session && canonical === 'codewhale') session=actualId(raw.DEEPSEEK_SESSION_ID);
  let subagent=actualId(first(raw.subagent_id,raw.subagentId));
  if (!subagent && ['SubagentStart','SubagentStop'].includes(event) && actualId(raw.agent_id) && raw.agent_id !== canonical && !getProvider(raw.agent_id)) subagent=raw.agent_id;
  let parent=actualId(first(raw.parent_session_id,raw.parentSessionId,raw.parent_thread_id,raw.parent_session_key,raw.parentSessionKey));
  const child=actualId(raw.child_session_id);
  if (canonical === 'kirocrew' && !session) session=parent;
  if (!session && canonical === 'kiro-cli' && cwd) session='cwd:'+sha(cwd).slice(0,24);
  if (!session && canonical === 'antigravity-cli' && absolute(raw.transcriptPath)) session=actualId(path.basename(path.dirname(raw.transcriptPath)));
  if (child) { if (!parent) parent=session; session=child; }
  if (!session || (event.startsWith('Subagent') && !subagent && !child)) return null;
  const nativeTool=text(first(raw.tool_name,raw.toolName,toolCall.name,toolCall.toolName,data.name,ctx.toolName,canonical==='codewhale'?raw.DEEPSEEK_TOOL_NAME:undefined));
  const classifiedTool=nativeTool && (['opencode','mimocode'].includes(canonical)&&nativeTool==='question'?'AskUserQuestion':TOOL_ALIASES[nativeTool] || nativeTool);
  let toolInput=raw.tool_input ?? raw.toolInput ?? toolCall.args ?? raw.args ?? raw.input ?? data.arguments;
  if (typeof toolInput === 'string' && toolInput.length <= 65536) { try { toolInput=JSON.parse(toolInput); } catch { toolInput=undefined; } }
  const result=explicitResult(raw,nativeEvent,canonical);
  if (event === 'PostToolUse' && result?.isError === true) event='PostToolUseFailure';
  if (canonical === 'antigravity-cli' && nativeEvent === 'Stop' && raw.fullyIdle === false) event='PostToolUse';
  if (event === 'Stop' && (raw.failed === true || (canonical === 'deepseek-harness' && (data.reason?.kind || data.reason) === 'error'))) event='StopFailure';
  if (canonical === 'antigravity-cli' && event === 'Stop' && /error|fail/i.test(raw.terminationReason || '')) event='StopFailure';
  if (canonical === 'openclaw' && nativeEvent === 'model_call_ended' && raw.outcome === 'error' && !['aborted','terminated'].includes(raw.failureKind)) event='StopFailure';
  const turn=actualId(first(raw.turn_id,raw.turnId,raw.prompt_id,raw.promptId,raw.generation_id,raw.openclaw_run_id,raw.runId));
  const call=actualId(first(raw.tool_use_id,raw.toolUseId,raw.tool_call_id,raw.toolCallId,toolCall.id,data.callId));
  const nativeId=actualId(first(raw.event_id,raw.eventId));
  const intermediate={ hook_event_name:event, session_id:session, ...(cwd?{cwd}:{}), ...(subagent||child?{subagent_id:subagent||child}:{}),
    ...(parent?{parent_thread_id:parent}:{}), ...(turn?{prompt_id:turn}:{}), ...(call?{tool_use_id:call}:{}), ...(nativeId?{event_id:nativeId}:{}),
    ...(classifiedTool?{tool_name:classifiedTool}:{}), ...(record(toolInput)?{tool_input:toolInput}:{}), ...(result?{tool_response:result}:{}),
    ...(raw.notification_type?{notification_type:raw.notification_type}:{}), ...(raw.session_title?{session_title:raw.session_title}:{}),
    ...(raw.timestamp!==undefined?{timestamp:raw.timestamp}:{}), ...(raw.stop_hook_active===true?{stop_hook_active:true}:{}) };
  const output=normalizeCommon('claude-code',intermediate,{...options,source:'upstream-derived'});
  if (!output) return null;
  const normalized={...output,provider:canonical,sessionId:session,id:key(canonical,session,child?undefined:subagent),
    evidence:{...output.evidence,source:['upstream','upstream-derived'].includes(options.source)?'upstream-derived':'hook',rawEvent:text(nativeEvent,96)}};
  if (nativeTool) normalized.toolName=nativeTool;
  if (child) delete normalized.subagentId;
  if (parent && parent !== session) normalized.parentId=key(canonical,parent);
  else if (subagent && !child) normalized.parentId=key(canonical,session);
  else delete normalized.parentId;
  if (['Interrupt','StopCancelled','stop_cancelled'].includes(nativeEvent) || (event === 'Stop' && (raw.interrupted === true || ['cancelled','aborted'].includes(raw.status)))) {
    normalized.event='interrupted';normalized.activity='idle';normalized.outcome='cancelled';normalized.summary='本轮已中断';
  }
  // Some native clients omit call IDs. Preserve a point-in-time observation
  // without inventing a tool lifecycle that the store could never correlate.
  if (!call && ['tool-start','tool-end'].includes(normalized.event)) {
    const ended=normalized.event==='tool-end';
    normalized.event='activity';
    if (ended) normalized.activity=normalized.outcome==='failure'?'error':'unknown';
  }
  normalized.eventId=canonical+'-'+sha(JSON.stringify([normalized.id,nativeEvent,turn,call,nativeTool,nativeId,
    Number.isSafeInteger(raw.event_seq)?raw.event_seq:undefined,normalized.outcome,call||nativeId?undefined:normalized.at])).slice(0,24);
  return normalized;
}

module.exports={ADAPTED_PROVIDERS,adaptUpstream};
