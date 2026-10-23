'use strict';
// State-only host adapters. No policy handlers, answers, host commands or HTTP.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const OWNER = 'ai-mini-office-passive-plugin-v1';
const text = (value, max = 256) => typeof value === 'string' && value && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
function sender(configFile) {
  let config;
  try {
    const stat = fs.lstatSync(configFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) return () => {};
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (config.owner !== OWNER || !['electronPath', 'observer', 'dataDir'].every(k => text(config[k], 8192) && path.isAbsolute(config[k]))) return () => {};
  } catch { return () => {}; }
  const queue = []; let active = false;
  function drain() {
    if (active || !queue.length) return;
    active = true; const raw = queue.shift();
    let child, timer, settled = false;
    const done = () => { if (settled) return; settled = true; active = false; clearTimeout(timer); drain(); };
    try {
      child = spawn(config.electronPath, [config.observer, '--provider', config.provider, '--event', raw.hook_event_name, '--mini-office-observer-v1'], {
        env: { ELECTRON_RUN_AS_NODE: '1', MINI_OFFICE_DATA_DIR: config.dataDir }, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true,
      });
      child.on('error', done); child.on('close', done); child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(raw));
      timer = setTimeout(() => { child.kill(); done(); }, 1800); timer.unref?.();
    } catch { done(); }
  }
  return raw => { try { if (queue.length < 32) { queue.push(raw); drain(); } } catch {} };
}
function createObserver(provider, send) {
  const parents = new Map(), seen = new Set(), candidates = new Map(), toolNames = new Map(), questions = new Map();
  const remember = (map, key, value) => { map.set(key, value); while (map.size > 256) map.delete(map.keys().next().value); };
  function emit(event, session, fields = {}) {
    if (!text(session)) return;
    const toolKey = text(fields.tool_use_id) && `${session}\0${fields.tool_use_id}`;
    // Keep real activity even when the protocol omits a native call ID. The
    // adapter turns it into uncorrelated 'activity', never a pending tool.
    if (event === 'PreToolUse' && text(fields.tool_name)) remember(toolNames, toolKey, fields.tool_name);
    if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event) && !text(fields.tool_name)) fields = { ...fields, tool_name: toolKey && toolNames.get(toolKey) || 'unknown' };
    const raw = { hook_event_name: event, event_id: randomUUID(), session_id: session };
    for (const k of ['parent_session_id', 'parent_thread_id', 'turn_id', 'tool_use_id', 'tool_name', 'outcome']) if (text(fields[k])) raw[k] = fields[k];
    if (!raw.parent_thread_id && parents.has(session)) raw.parent_thread_id = parents.get(session);
    if (text(fields.cwd, 4096) && path.isAbsolute(fields.cwd)) raw.cwd = fields.cwd;
    if (typeof fields.failed === 'boolean') raw.failed = fields.failed;
    if (typeof fields.interrupted === 'boolean') raw.interrupted = fields.interrupted;
    const key = raw.tool_use_id && `${session}\0${raw.tool_use_id}\0${event}`;
    if (key && seen.has(key)) return;
    if (key) { seen.add(key); while (seen.size > 1024) seen.delete(seen.values().next().value); }
    send(raw);
    if (event === 'PostToolUse' || event === 'PostToolUseFailure') toolNames.delete(toolKey);
    if (event === 'SessionEnd') { parents.delete(session); candidates.delete(session); }
  }
  function opencode(event, cwd, v2 = false) {
    const p = (v2 ? event?.data : event?.properties) || {}, info = p.info || {};
    const part = p.part || {};
    const sid = v2 ? text(p.sessionID) || text(event?.durable?.aggregateID)
      : text(p.sessionID) || text(event?.sessionID) || text(part.sessionID) || (event?.type === 'message.updated' ? text(info.sessionID) : text(info.id));
    if (!sid) return;
    const parent = text(v2 ? p.parentID : info.parentID);
    if (parent) remember(parents, sid, parent);
    const fields = { cwd: text(info.directory, 4096) || text(event?.location?.directory, 4096) || cwd,
      tool_name: v2 ? p.tool || p.name : part.tool, tool_use_id: v2 ? p.id : part.callID || part.id };
    let name;
    switch (event.type) {
      case 'session.created': name = 'SessionStart'; break;
      case 'session.status': if (p.status?.type === 'busy') name = 'UserPromptSubmit'; else if (v2 && p.status?.type === 'idle') name = 'Stop'; break;
      case 'message.part.updated': if (part.type === 'tool') name = ({ running: 'PreToolUse', completed: 'PostToolUse', error: 'PostToolUseFailure' })[part.state?.status]; break;
      case 'session.step.started': case 'session.reasoning.started': case 'session.text.started': if (v2) name = 'UserPromptSubmit'; break;
      case 'session.tool.called': if (v2) name = 'PreToolUse'; break;
      case 'session.tool.success': if (v2) name = 'PostToolUse'; break;
      case 'session.tool.failed': case 'session.tool.error': if (v2) name = 'PostToolUseFailure'; break;
      case 'session.step.ended': if (v2 && p.finish === 'stop') name = 'Stop'; break;
      case 'session.execution.succeeded': if (v2) name = 'Stop'; break;
      case 'session.execution.interrupted': if (v2) { name = 'Interrupt'; fields.interrupted = true; } break;
      case 'session.execution.failed': case 'session.error': name = 'StopFailure'; break;
      case 'session.idle': name = 'Stop'; break;
      case 'question.asked':
        if(!v2&&text(p.id)&&text(p.tool?.callID)){
          remember(questions,p.id,{sessionId:sid,callId:p.tool.callID});
          fields.tool_name='question';fields.tool_use_id=p.tool.callID;name='PreToolUse';
        }
        break;
      case 'question.replied':case 'question.rejected':{
        const request=questions.get(p.requestID||p.id);
        if(!v2&&request&&request.sessionId===sid){
          fields.tool_name='question';fields.tool_use_id=request.callId;
          if(event.type==='question.rejected')fields.interrupted=true;
          name='PostToolUse';questions.delete(p.requestID||p.id);
        }
        break;
      }
      case 'session.deleted':
        for(const [id,q]of questions)if(q.sessionId===sid)questions.delete(id);
        name = 'SessionEnd'; break;
    }
    if (name) emit(name, sid, fields);
  }
  function pi(name, event = {}, ctx = {}) {
    let sid;
    try { sid = text(ctx.sessionManager?.getSessionId?.()) || text(ctx.sessionManager?.getSessionFile?.()); } catch {}
    if (!sid) return;
    const fields = { cwd: ctx.cwd, tool_name: event.toolName, tool_use_id: event.toolCallId };
    const map = { session_start: 'SessionStart', session_switch: 'SessionStart', session_branch: 'SessionStart', before_agent_start: 'UserPromptSubmit', session_before_compact: 'PreCompact', session_compact: 'PostCompact', session_shutdown: 'SessionEnd', tool_call: 'PreToolUse' };
    if (provider === 'omp' && name === 'session_stop') { remember(candidates, sid, fields); return; }
    if (name === 'agent_end') {
      if (provider === 'omp') { if (!candidates.has(sid)) return; candidates.delete(sid); if (event.willContinue === true) return; }
      emit('Stop', sid, fields); return;
    }
    if (name === 'tool_result') { emit(event.isError === true ? 'PostToolUseFailure' : 'PostToolUse', sid, fields); return; }
    if (map[name]) emit(map[name], sid, fields);
  }
  function openclaw(name, event = {}, ctx = {}) {
    const sid = text(event.sessionId) || text(ctx.sessionId) || text(event.sessionKey) || text(ctx.sessionKey);
    const fields = { cwd: ctx.workspaceDir || event.cwd || event.workspaceDir, tool_name: event.toolName || ctx.toolName, tool_use_id: event.toolCallId || ctx.toolCallId, turn_id: event.runId || ctx.runId };
    const map = { session_start: 'SessionStart', model_call_started: 'UserPromptSubmit', before_tool_call: 'PreToolUse', before_compaction: 'PreCompact', after_compaction: 'PostCompact' };
    if (name === 'after_tool_call') emit(event.error ? 'PostToolUseFailure' : 'PostToolUse', sid, fields);
    else if (name === 'model_call_ended') { if (event.outcome === 'error') emit(['aborted', 'terminated'].includes(event.failureKind) ? 'Interrupt' : 'StopFailure', sid, fields); }
    else if (name === 'session_end' && !['new', 'reset', 'compaction'].includes(event.reason)) emit('SessionEnd', sid, fields);
    else if (map[name]) emit(map[name], sid, fields);
    // model_call_ended is a model boundary, not proof that the whole agent turn ended.
  }
  function dsh(name, session, event = {}) {
    const sid = text(session?.id), data = event.data || {};
    const fields = { cwd: session?.header?.cwd, tool_name: data.name, tool_use_id: data.callId || data.toolCallId || data.message?.toolCallId, turn_id: data.turnId };
    if (name === 'session/created') emit('SessionStart', sid, fields);
    else if (name === 'session/disposed') emit('SessionEnd', sid, fields);
    else if (name === 'session/event') {
      if (event.type === 'turn/start') emit('UserPromptSubmit', sid, fields);
      else if (event.type === 'tool/call') emit('PreToolUse', sid, fields);
      else if (event.type === 'tool/result') emit(data.error || data.message?.isError === true || (Array.isArray(data.message?.content) && data.message.content.some(item => item?.isError === true)) ? 'PostToolUseFailure' : 'PostToolUse', sid, fields);
      else if (event.type === 'turn/end') { const reason = typeof data.reason === 'object' ? data.reason.kind : data.reason; emit(reason === 'error' ? 'StopFailure' : ['aborted', 'cancelled', 'interrupted'].includes(reason) ? 'Interrupt' : 'Stop', sid, fields); }
    }
  }
  return { opencode, pi, openclaw, dsh };
}
module.exports = { OWNER, sender, createObserver };
