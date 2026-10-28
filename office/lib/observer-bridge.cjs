'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createClaudeHookOperations } = require('../src/claude-hook-operations.js');
const { actorKey } = require('./provider-events.cjs');
const { inspectHermes, mutateHermes } = require('./hermes-observer.cjs');
const { PROVIDER_IDS, getProvider } = require('./provider-catalog.cjs');
const { enrichConnections } = require('./provider-detection.cjs');
const { isObserverCommandTemplate } = require('./observer-command-owner.cjs');
const { createUpstreamIntegrations, EVENTS: UPSTREAM_EVENTS } = require('./upstream-integrations.cjs');
const { PROVIDERS: PLUGIN_PROVIDERS, inspectPlugin, mutatePlugin } = require('./plugin-integrations.cjs');
const { PROVIDERS: SPECIAL_PROVIDERS, EVENTS: SPECIAL_EVENTS, inspectSpecial, mutateSpecial } = require('./special-integrations.cjs');

const MARKER = '--mini-office-observer-v1';
const PROVIDERS = PROVIDER_IDS.map(id=>id==='cursor-agent'?'cursor':id);
const EVENTS = Object.freeze({
  ...Object.fromEntries(PROVIDERS.map(id=>[id,Object.keys(getProvider(id).eventMap)])),
  ...UPSTREAM_EVENTS,
  ...SPECIAL_EVENTS,
  codex: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact', 'Stop', 'Interrupt', 'SessionEnd'],
  'claude-code': ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'Notification', 'Elicitation', 'ElicitationResult', 'SessionEnd'],
  cursor: ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop', 'preCompact', 'stop'],
  hermes: ['on_session_start','on_session_reset','pre_llm_call','pre_tool_call','post_tool_call','on_session_end','on_session_finalize','subagent_start','subagent_stop','on_human_input_request','on_human_input_resolved'],
});
const CURSOR_NON_GATING = ['sessionStart', 'sessionEnd', 'postToolUse', 'postToolUseFailure', 'subagentStop', 'preCompact', 'stop'];
// Exact installed desktop implementations whose empty hook response preserves
// the host's own prompt/tool/subagent decisions. Unknown hosts stay passive-only.
const CURSOR_DESKTOP_PROOFS = new Set([
  '044ce0931100af5fe95403e9a692b02932bc3e13a6763f576b851f503fefa518', // 3.24.12
  'ccb73f4cbb222e7f137137ec3bfffaff4b40afb211b4bea609ab3130084d30e0', // 3.25.6
]);
const MAX_CONFIG = 2 * 1024 * 1024;
const MAX_READ = 64 * 1024;
const MAX_LINE = 16 * 1024;
const SPOOL_TARGET = 8 * 1024 * 1024;
const EVENT_NAMES = new Set(['session-start', 'turn-start', 'tool-start', 'tool-end', 'activity', 'waiting-user', 'subagent-start', 'subagent-end', 'turn-end', 'session-end', 'interrupted', 'error', 'metadata']);
const ACTIVITIES = new Set(['reading', 'searching', 'planning', 'coding', 'designing', 'building', 'testing', 'running', 'waiting-user', 'waiting-tool', 'idle', 'error', 'unknown']);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function plain(value, limit = 256) { return typeof value === 'string' && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined; }
function quote(value) {
  if (!plain(value, 8192)) throw new Error('配置路径或参数包含不支持的控制字符');
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildObserverCommand({ dataDir, electronPath, appRoot }, provider, event) {
  if (!PROVIDERS.includes(provider) || !EVENTS[provider].includes(event)) throw new Error('不支持的观察事件');
  return `MINI_OFFICE_DATA_DIR=${quote(dataDir)} ELECTRON_RUN_AS_NODE=1 ${quote(electronPath)} ${quote(path.join(appRoot, 'hooks', 'observe.cjs'))} --provider ${quote(provider)} --event ${quote(event)} ${MARKER}`;
}

function lstat(file) { try { return fs.lstatSync(file); } catch (err) { if (err.code === 'ENOENT') return null; throw err; } }

function safeDirectory(dir, create = false) {
  const stat = lstat(dir);
  if (stat) {
    const aliases = process.platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp', '/etc': '/private/etc' } : {};
    if (stat.isSymbolicLink() && aliases[dir] && fs.realpathSync(dir) === aliases[dir]) return;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`目录不是可核实的普通目录：${dir}`);
    return;
  }
  if (!create) return;
  const parent = path.dirname(dir);
  if (parent === dir) throw new Error('无法创建配置目录');
  safeDirectory(parent, true);
  try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (err) { if (err.code !== 'EEXIST') throw err; }
  const created = fs.lstatSync(dir);
  if (created.isSymbolicLink() || !created.isDirectory()) throw new Error(`配置目录在创建时改变：${dir}`);
}

// Check every component, including parents of custom CODEX_HOME/data roots.
// Only macOS's three fixed OS aliases above are allowed to be symlinks.
function safeAncestors(target, homeDir, create = false) {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  safeDirectory(current, create);
  for (const piece of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, piece);
    safeDirectory(current, create);
  }
}

// JSON.parse silently accepts duplicate keys. Reject those instead of losing a
// user's sibling hooks during a read/modify/write operation.
function duplicateJsonKeys(text) {
  let index = 0;
  const white = () => { while (/\s/.test(text[index] || '') && index < text.length) index += 1; };
  function string() {
    const start = index++;
    while (index < text.length) {
      if (text[index] === '\\') { index += 2; continue; }
      if (text[index++] === '"') return JSON.parse(text.slice(start, index));
    }
    throw new Error('JSON 字符串未结束');
  }
  function value() {
    white();
    if (text[index] === '"') { string(); return false; }
    if (text[index] === '{') {
      index += 1; white(); const seen = new Set();
      if (text[index] === '}') { index += 1; return false; }
      while (index < text.length) {
        white(); const key = string();
        if (seen.has(key)) return true;
        seen.add(key); white(); index += 1;
        if (value()) return true;
        white(); const delimiter = text[index++];
        if (delimiter === '}') return false;
      }
    } else if (text[index] === '[') {
      index += 1; white();
      if (text[index] === ']') { index += 1; return false; }
      while (index < text.length) {
        if (value()) return true;
        white(); if (text[index++] === ']') return false;
      }
    } else { while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1; }
    return false;
  }
  return value();
}

function readConfig(file, homeDir) {
  safeAncestors(path.dirname(file), homeDir);
  const stat = lstat(file);
  if (!stat) return { exists: false, bytes: null, hash: null, value: {} };
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`配置不是普通文件，已保留：${file}`);
  if (stat.size > MAX_CONFIG) throw new Error('配置超过安全读取上限，已保留');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let bytes;
  try {
    const current = fs.fstatSync(fd);
    if (!current.isFile() || current.dev !== stat.dev || current.ino !== stat.ino || current.size > MAX_CONFIG) throw new Error('读取时配置身份改变');
    bytes = fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('配置 JSON 已损坏，未自动修复'); }
  if (!object(value) || duplicateJsonKeys(text)) throw new Error('配置顶层或重复键有歧义，未改动');
  if (value.hooks !== undefined && !object(value.hooks)) throw new Error('配置 hooks 不是对象，未改动');
  return { exists: true, bytes, hash: sha(bytes), value };
}

function sameSnapshot(first, second) { return first.exists === second.exists && first.hash === second.hash; }

function atomicConfig(file, before, value, homeDir, now) {
  const dir = path.dirname(file);
  safeAncestors(dir, homeDir, true);
  if (!sameSnapshot(before, readConfig(file, homeDir))) throw new Error('配置在准备期间被修改；请重试');
  const suffix = `${Math.trunc(now())}-${randomUUID()}`;
  const temp = path.join(dir, `.mini-office-${suffix}.tmp`);
  const backup = before.exists ? `${file}.mini-office-backup-${suffix}.json` : undefined;
  let tempWritten = false;
  try {
    if (backup) fs.writeFileSync(backup, before.bytes, { flag: 'wx', mode: 0o600 });
    const fd = fs.openSync(temp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
    tempWritten = true;
    try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (!sameSnapshot(before, readConfig(file, homeDir))) throw new Error('配置在写入前被修改；已保留外部修改');
    fs.renameSync(temp, file); tempWritten = false;
    return backup;
  } finally {
    if (tempWritten) { try { fs.unlinkSync(temp); } catch {} }
  }
}

function configPath(provider, homeDir, env) {
  let base = provider === 'codex' ? env.CODEX_HOME : provider === 'claude-code' ? env.CLAUDE_CONFIG_DIR : undefined;
  if (base !== undefined && base !== '') {
    if (!plain(base, 4096) || !path.isAbsolute(base) || base.split(path.sep).includes('..')) throw new Error('自定义 AI 配置目录必须是明确的绝对路径');
  } else base = path.join(homeDir, provider === 'codex' ? '.codex' : provider === 'claude-code' ? '.claude' : '.cursor');
  return path.join(base, provider === 'claude-code' ? 'settings.json' : 'hooks.json');
}

function cursorProof(homeDir) {
  for (const app of [path.join(homeDir, 'Applications', 'Cursor.app'), '/Applications/Cursor.app']) {
    const file = path.join(app, 'Contents', 'Resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
    try {
      const stat = fs.lstatSync(file);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 64 * 1024 * 1024 && CURSOR_DESKTOP_PROOFS.has(sha(fs.readFileSync(file)))) return true;
    } catch {}
  }
  return false;
}

function available(provider, homeDir, env) {
  const names = provider === 'codex' ? ['codex'] : provider === 'claude-code' ? ['claude'] : ['cursor', 'agent'];
  for (const dir of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    if (names.some(name => { try { return fs.statSync(path.join(dir, name)).isFile(); } catch { return false; } })) return true;
  }
  const name = provider === 'codex' ? 'Codex.app' : provider === 'cursor' ? 'Cursor.app' : 'Claude.app';
  // Claude desktop is a different product from Claude Code, not proof of availability.
  if (provider === 'claude-code') return false;
  return [path.join(homeDir, 'Applications', name), path.join('/Applications', name)].some(file => { try { return fs.statSync(file).isDirectory(); } catch { return false; } });
}

function validNormalized(value, provider) {
  if (!object(value) || value.provider !== provider || !plain(value.sessionId) || !plain(value.eventId) || !Number.isFinite(value.at) || value.at < 0) return null;
  if (!EVENT_NAMES.has(value.event) || !ACTIVITIES.has(value.activity) || !object(value.evidence)) return null;
  const subagentId = plain(value.subagentId);
  if (value.id !== actorKey(provider, value.sessionId, subagentId)) return null;
  const output = { id: value.id, eventId: value.eventId, provider, sessionId: value.sessionId, at: value.at, event: value.event, activity: value.activity,
    summary: plain(value.summary, 160) || '观察到会话活动', evidence: {
      source: plain(value.evidence.source, 48) || 'hook', rawEvent: plain(value.evidence.rawEvent, 96) || 'unknown', confidence: plain(value.evidence.confidence, 48) || 'low',
    } };
  for (const key of ['parentId', 'subagentId', 'turnId', 'toolCallId', 'title', 'toolName', 'projectPath']) {
    const result = plain(value[key], key === 'projectPath' ? 4096 : key === 'title' ? 96 : 512);
    if (result) output[key] = result;
  }
  if (['success', 'failure', 'cancelled', 'unknown'].includes(value.outcome)) output.outcome = value.outcome;
  return output;
}

function spoolWarning(dataDir, homeDir, provider) {
  let fd;
  try {
    const eventsDir = path.join(dataDir, 'events');
    safeAncestors(eventsDir, homeDir);
    const file = path.join(eventsDir, `${provider}.jsonl`);
    const current = lstat(file);
    if (!current || current.size < SPOOL_TARGET) return undefined;
    if (lstat(path.join(eventsDir, `.${provider}.append.lock`))) return '活动记录的轮换锁仍存在；轮换竞争或遗留锁可能漏记事件，AI 继续正常运行';
    const backup = `${file}.1`;
    const stat = lstat(backup);
    if (!stat) return undefined;
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid())) return '活动记录备份无法安全确认，已保留；轮换暂停，AI 继续正常运行';
    fd = fs.openSync(backup, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_LINE));
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const end = buffer.subarray(0, size).indexOf(10);
    let event; try { event = end < 0 ? null : JSON.parse(buffer.subarray(0, end).toString('utf8')); } catch {}
    if (!validNormalized(event, provider) || event.evidence.source !== 'hook') return '活动记录备份来源不明，已保留；轮换暂停，AI 继续正常运行';
  } catch { return '活动记录暂时无法安全检查；观察可能漏记，AI 继续正常运行'; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  return undefined;
}

function createObserverBridge(options = {}) {
  const dataDir = options.dataDir;
  const homeDir = options.homeDir || os.homedir();
  const env = options.env || process.env;
  const appRoot = options.appRoot || path.join(__dirname, '..');
  const electronPath = options.electronPath || process.execPath;
  const now = options.now || Date.now;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  if (!plain(dataDir, 4096) || !path.isAbsolute(dataDir) || !path.isAbsolute(homeDir) || !path.isAbsolute(appRoot) || !path.isAbsolute(electronPath)) throw new Error('观察桥路径必须是绝对路径');
  let running = false, timer = null, cursorVerified = false;
  const latest = new Map(), faults = new Map(), positions = new Map(), queues = new Map();
  const claudeOperations = createClaudeHookOperations({ shouldRunAutomatic: () => false });
  const commandOptions = { dataDir, electronPath, appRoot };
  const integrations=createUpstreamIntegrations({homeDir,env,readConfig,commandOptions,buildCommand:(provider,event)=>buildObserverCommand(commandOptions,provider,event)});

  function commands(provider) { return new Set(EVENTS[provider].map(event => buildObserverCommand(commandOptions, provider, event))); }
  function owned(entry, provider) { return object(entry) && typeof entry.command === 'string' && (commands(provider).has(entry.command) || isObserverCommandTemplate(entry.command, { provider, events: EVENTS[provider] })); }

  function countInstalled(provider, snapshot) {
    const hooks = snapshot.value.hooks;
    if (!object(hooks)) return 0;
    let count = 0;
    for (const list of Object.values(hooks)) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (provider === 'cursor') { if (owned(entry, provider)) count += 1; }
        else if (object(entry) && Array.isArray(entry.hooks)) count += entry.hooks.filter(child => owned(child, provider)).length;
      }
    }
    return count;
  }

  function connection(provider) {
    if (provider === 'hermes' || PLUGIN_PROVIDERS.includes(provider) || SPECIAL_PROVIDERS.includes(provider) || integrations.providers.includes(provider)) {
      let state;
      try {state=provider==='hermes'?inspectHermes({...commandOptions,homeDir,env}):PLUGIN_PROVIDERS.includes(provider)?inspectPlugin({...commandOptions,homeDir,env,provider}):SPECIAL_PROVIDERS.includes(provider)?inspectSpecial({...commandOptions,homeDir,env,provider}):integrations.inspect(provider);}
      catch(error){state={installed:false,available:false,detail:error.message};}
      const warning=spoolWarning(dataDir,homeDir,provider);
      return {provider,...state,watching:Boolean(running&&state.installed&&latest.has(provider)&&!faults.has(provider)&&!warning),lastEventAt:latest.get(provider)||null,
        detail:faults.get(provider)||warning||state.detail};
    }
    let installed = false, detail;
    try { installed = countInstalled(provider, readConfig(configPath(provider, homeDir, env), homeDir)) > 0; }
    catch (err) { detail = err.message; }
    const isAvailable = available(provider, homeDir, env);
    if (!detail) {
      if (!installed) detail = '尚未安装观察配置；连接后只记录活动，不控制 AI';
      else if (provider === 'codex') detail = '观察配置已安装；请在 Codex /hooks 审核信任，收到真实事件后才可确认生效';
      else if (provider === 'cursor') detail = cursorVerified ? '当前 Cursor 被动响应已静态核实；已有 CLI／后台 Worker 需重新加载观察配置，真实活动以收到的事件为准' : '保守兼容：只观察完成和结束事件；当前桌面版本的开始事件尚未核实';
      else detail = '观察配置已安装；Claude Code 真实客户端收发尚待验证';
    }
    if (faults.has(provider)) detail = faults.get(provider);
    const warning = spoolWarning(dataDir, homeDir, provider);
    if (warning) detail = warning;
    return { provider, installed, watching: running && installed && !faults.has(provider) && !warning, lastEventAt: latest.get(provider) || null, available: isAvailable, detail };
  }

  async function mutate(provider, install) {
    provider=provider==='cursor-agent'?'cursor':provider==='claude'?'claude-code':provider;
    if (!PROVIDERS.includes(provider)) return { status: 'error', message: '不支持的 AI 工具' };
    if (provider === 'hermes' || PLUGIN_PROVIDERS.includes(provider) || SPECIAL_PROVIDERS.includes(provider)) {
      const previous=queues.get(provider)||Promise.resolve();
      const run=()=>provider==='hermes'?mutateHermes({...commandOptions,homeDir,env,runCli:options.hermesRunCli},install)
        :SPECIAL_PROVIDERS.includes(provider)?mutateSpecial({...commandOptions,homeDir,env,provider,withNativeLock:options.withNativeLock,
          ...(options.kiroTemplate?{kiroTemplate:options.kiroTemplate}:{}),...(options.specialExecFileSync?{execFileSync:options.specialExecFileSync}:{})},install)
          :mutatePlugin({...commandOptions,homeDir,env,provider,...(options.pluginHostMajor?{hostMajor:options.pluginHostMajor}:{}),...(options.pluginExecFileSync?{execFileSync:options.pluginExecFileSync}:{})},install);
      const result=previous.then(run,run); queues.set(provider,result.catch(()=>{})); return result;
    }
    if (integrations.providers.includes(provider)) {
      const previous=queues.get(provider)||Promise.resolve();
      const run=()=>{
        let lockPath,lockFd,lockStat;
        try {
          const plan=integrations.plan(provider,install);
          if (!plan.changed) return {status:'unchanged',provider,installed:install,detail:connection(provider).detail};
          safeAncestors(path.dirname(plan.file),homeDir,true);
          lockPath=path.join(path.dirname(plan.file),'.mini-office-observer.lock');
          lockFd=fs.openSync(lockPath,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);
          lockStat=fs.fstatSync(lockFd);fs.writeFileSync(lockFd,JSON.stringify({marker:MARKER,pid:process.pid,at:now()}));
          const backupPath=atomicConfig(plan.file,plan.before,plan.value,homeDir,now);
          faults.delete(provider);
          return {status:'ok',provider,installed:install,...(backupPath?{backupPath}:{}),detail:connection(provider).detail};
        } catch(error) {return {status:'error',provider,installed:connection(provider).installed,message:error.code==='EEXIST'?'观察配置正在被另一操作使用；未接管锁，请稍后重试':error.message};}
        finally {if(lockFd!==undefined){try{fs.closeSync(lockFd);}catch{}try{const current=lstat(lockPath);if(current&&!current.isSymbolicLink()&&current.ino===lockStat.ino&&current.dev===lockStat.dev)fs.unlinkSync(lockPath);}catch{}}}
      };
      const result=previous.then(run,run);queues.set(provider,result.catch(()=>{}));return result;
    }
    if (!['codex','cursor','claude-code'].includes(provider)) return {status:'error',provider,installed:false,message:'不支持的观察配置格式'};
    const run = () => {
      let lockPath, lockFd, lockStat;
      try {
        const file = configPath(provider, homeDir, env);
        const before = readConfig(file, homeDir);
        if (provider === 'cursor' && before.value.version !== undefined && before.value.version !== 1) throw new Error('Cursor hooks 配置版本未知，已保留原文件');
        if (provider === 'cursor' && install) cursorVerified = cursorProof(homeDir);
        const wanted = provider === 'cursor' && !cursorVerified ? CURSOR_NON_GATING : EVENTS[provider];
        const value = structuredClone(before.value);
        const hooks = value.hooks === undefined ? {} : value.hooks;
        if (provider === 'cursor' && install) value.version = 1;
        for (const [event, existing] of Object.entries(hooks)) {
          if (!Array.isArray(existing)) {
            if (EVENTS[provider].includes(event)) throw new Error(`事件 ${event} 的配置结构未知，未改动`);
            continue;
          }
          hooks[event] = existing.flatMap(group => {
            if (provider === 'cursor') return owned(group, provider) ? [] : [group];
            if (!object(group) || !Array.isArray(group.hooks)) return [group];
            const remaining = group.hooks.filter(child => !owned(child, provider));
            if (remaining.length === group.hooks.length) return [group];
            if (!remaining.length && Object.keys(group).every(key => key === 'hooks')) return [];
            return [{ ...group, hooks: remaining }];
          });
        }
        if (install) for (const event of wanted) {
          const timeout = event === 'Interrupt' ? 1 : 2;
          const handler = { type: 'command', command: buildObserverCommand(commandOptions, provider, event), timeout };
          hooks[event] ||= [];
          hooks[event].push(provider === 'cursor' ? handler : { hooks: [handler] });
        }
        if (!install && !countInstalled(provider, before)) return { status: 'unchanged', provider, installed: false, detail: '没有本应用拥有的观察配置' };
        value.hooks = hooks;
        if (JSON.stringify(before.value) === JSON.stringify(value)) return { status: 'unchanged', provider, installed: install };
        safeAncestors(path.dirname(file), homeDir, true);
        lockPath = path.join(path.dirname(file), '.mini-office-observer.lock');
        lockFd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
        lockStat = fs.fstatSync(lockFd);
        fs.writeFileSync(lockFd, JSON.stringify({ marker: MARKER, pid: process.pid, at: now() }));
        const backupPath = atomicConfig(file, before, value, homeDir, now);
        faults.delete(provider);
        return { status: 'ok', provider, installed: install, ...(backupPath ? { backupPath } : {}), detail: connection(provider).detail };
      } catch (err) {
        return { status: 'error', provider, installed: connection(provider).installed, message: err.code === 'EEXIST' ? '观察配置正在被另一操作使用；未接管锁，请稍后重试' : err.message };
      } finally {
        if (lockFd !== undefined) {
          try { fs.closeSync(lockFd); } catch {}
          try { const current = fs.lstatSync(lockPath); if (!current.isSymbolicLink() && current.ino === lockStat.ino && current.dev === lockStat.dev) fs.unlinkSync(lockPath); } catch {}
        }
      }
    };
    if (provider === 'claude-code') return claudeOperations.enqueue({ source: 'mini-office-explicit', automatic: false }, run);
    const previous = queues.get(provider) || Promise.resolve();
    const result = previous.then(run, run);
    queues.set(provider, result.catch(() => {}));
    return result;
  }

  function spool(provider) { return path.join(dataDir, 'events', `${provider}.jsonl`); }
  function initialPosition(provider) {
    try {
      safeAncestors(dataDir, homeDir);
      safeDirectory(dataDir); safeDirectory(path.join(dataDir, 'events'));
      const stat = lstat(spool(provider));
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('活动记录不是普通文件，已停止读取');
      return { fileId: stat ? `${stat.dev}:${stat.ino}` : null, offset: stat ? stat.size : 0, carry: Buffer.alloc(0), dropping: false };
    } catch (err) { faults.set(provider, err.message); return { fileId: null, offset: 0, carry: Buffer.alloc(0), dropping: false }; }
  }

  function poll(provider) {
    let fd;
    try {
      safeDirectory(dataDir); safeDirectory(path.join(dataDir, 'events'));
      let file = spool(provider), stat = lstat(file);
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('活动记录不是普通文件，已停止读取');
      faults.delete(provider);
      const position = positions.get(provider);
      let fileId = stat ? `${stat.dev}:${stat.ino}` : null;
      if (position.fileId && fileId !== position.fileId) {
        // The hook retains the previous inode as .1. Finish its unread tail
        // before advancing to the new generation, including the rename/create
        // gap. Match the inode rather than replaying an unrelated backup.
        const retainedFile = `${file}.1`, retained = lstat(retainedFile);
        if (retained && retained.isFile() && !retained.isSymbolicLink()
          && `${retained.dev}:${retained.ino}` === position.fileId && retained.size > position.offset) {
          file = retainedFile; stat = retained; fileId = position.fileId;
        }
      }
      if (!stat) return;
      if (fileId !== position.fileId || stat.size < position.offset) Object.assign(position, { fileId, offset: 0, carry: Buffer.alloc(0), dropping: false });
      if (stat.size === position.offset) return;
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(fd);
      if (opened.ino !== stat.ino || opened.dev !== stat.dev) return;
      const buffer = Buffer.alloc(Math.min(MAX_READ, Math.max(0, stat.size - position.offset)));
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position.offset);
      position.offset += bytesRead;
      let incoming = Buffer.concat([position.carry, buffer.subarray(0, bytesRead)]);
      let start = 0;
      for (let i = 0; running && i < incoming.length; i += 1) if (incoming[i] === 10) {
        const line = incoming.subarray(start, i); start = i + 1;
        if (!position.dropping && line.length <= MAX_LINE && line.length) {
          let parsed; try { parsed = JSON.parse(line.toString('utf8')); } catch {}
          const normalized = validNormalized(parsed, provider);
          if (normalized) { latest.set(provider, now()); try { onEvent(normalized); } catch {} }
        }
        position.dropping = false;
      }
      position.carry = incoming.subarray(start);
      if (position.carry.length > MAX_LINE) { position.carry = Buffer.alloc(0); position.dropping = true; }
      faults.delete(provider);
    } catch (err) { faults.set(provider, err.message); }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  }

  function start() {
    if (running) return;
    running = true;
    cursorVerified = cursorProof(homeDir);
    for (const provider of PROVIDERS) positions.set(provider, initialPosition(provider));
    timer = setInterval(() => {
      if (!running) return;
      try { safeAncestors(path.join(dataDir, 'events'), homeDir); }
      catch (err) { for (const provider of PROVIDERS) faults.set(provider, err.message); return; }
      for (const provider of PROVIDERS) poll(provider);
    }, 250);
    timer.unref?.();
  }
  function stop() { running = false; if (timer) clearInterval(timer); timer = null; positions.clear(); }
  return { start, stop, getConnections: () => enrichConnections(PROVIDERS.map(connection), { homeDir, env }), connect: provider => mutate(provider, true), disconnect: provider => mutate(provider, false) };
}

module.exports = { createObserverBridge, buildObserverCommand, MARKER, EVENTS };
