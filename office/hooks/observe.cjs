#!/usr/bin/env node
'use strict';

// Passive hook: the only response is {}. Never decide approvals or create a turn.
const fs = require('node:fs');
const path = require('node:path');
let normalizeEvent;
try { ({ normalizeEvent } = require('../lib/provider-events.cjs')); }
catch { process.stdout.write('{}\n', () => process.exit(0)); return; }
const MAX_INPUT = 512 * 1024;
const MAX_SPOOL = 8 * 1024 * 1024;
const MAX_RECORD = 16 * 1024;
const MARKER = '--mini-office-observer-v1';

let finished = false;
let total = 0;
const chunks = [];
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const provider = option('--provider');
const event = option('--event');

function directory(dir) {
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  const aliases = process.platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp', '/etc': '/private/etc' } : {};
  for (const component of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try { stat = fs.lstatSync(current); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (!stat) {
      try { fs.mkdirSync(current, { mode: 0o700 }); } catch (err) { if (err.code !== 'EEXIST') throw err; }
      stat = fs.lstatSync(current);
    }
    if (stat.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe spool directory');
  }
}

function privateDirectory(dir) {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe private spool directory');
  if ((stat.mode & 0o777) !== 0o700) fs.chmodSync(dir, 0o700);
}

function ownedFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o777) === 0o600
    && (!process.getuid || stat.uid === process.getuid());
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function recognizableSpool(fd, stat, allowEmpty = false) {
  if (!ownedFile(stat)) return false;
  if (stat.size === 0) return allowEmpty;
  const buffer = Buffer.alloc(Math.min(stat.size, MAX_RECORD));
  const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
  const end = buffer.subarray(0, count).indexOf(10);
  if (end < 0) return false;
  let first; try { first = JSON.parse(buffer.subarray(0, end).toString('utf8')); } catch { return false; }
  return first && first.provider === provider && typeof first.id === 'string' && first.id.startsWith(`${provider}:`)
    && typeof first.eventId === 'string' && new RegExp(`^${provider}-[a-f0-9]{24}$`).test(first.eventId)
    && Number.isFinite(first.at) && typeof first.event === 'string' && typeof first.activity === 'string'
    && first.evidence?.source === 'hook';
}

// Ordinary records use one O_APPEND write without a lock. Only rotation needs a
// short create-exclusive lock. In-flight appends may slightly exceed the target;
// the next writer rotates instead of letting the current file grow indefinitely.
// A rotation conflict drops observation, never waits or controls the AI task.
function appendBounded(events, normalized) {
  const file = path.join(events, `${provider}.jsonl`);
  const backup = `${file}.1`;
  const lock = path.join(events, `.${provider}.append.lock`);
  const line = Buffer.from(`${JSON.stringify(normalized)}\n`);
  if (line.length > MAX_RECORD) return;
  let lockFd, lockStat, fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
    let stat = fs.fstatSync(fd);
    let named = fs.lstatSync(file);
    if (!recognizableSpool(fd, stat, true) || stat.ino !== named.ino || stat.dev !== named.dev) throw new Error('Unrecognized current spool');
    if (stat.size + line.length > MAX_SPOOL) {
      lockFd = fs.openSync(lock, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      lockStat = fs.fstatSync(lockFd);
      fs.writeFileSync(lockFd, JSON.stringify({ marker: MARKER, provider, pid: process.pid }));
      // Another rotator may have finished between the first stat and this lock.
      fs.closeSync(fd); fd = undefined;
      fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
      stat = fs.fstatSync(fd); named = fs.lstatSync(file);
      if (!recognizableSpool(fd, stat, true) || stat.ino !== named.ino || stat.dev !== named.dev) throw new Error('Spool changed before rotation');
      if (stat.size + line.length <= MAX_SPOOL) { fs.writeSync(fd, line); return; }
      let previous;
      try { previous = fs.lstatSync(backup); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      if (previous) {
        if (!ownedFile(previous)) throw new Error('Foreign or linked backup');
        const previousFd = fs.openSync(backup, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        try {
          if (!sameFile(previous, fs.fstatSync(previousFd)) || !recognizableSpool(previousFd, previous)) throw new Error('Unrecognized backup');
        } finally { fs.closeSync(previousFd); }
      }
      const current = fs.fstatSync(fd);
      if (!sameFile(stat, current) || !sameFile(current, fs.lstatSync(file))) throw new Error('Spool changed during rotation');
      if (previous) {
        if (!sameFile(previous, fs.lstatSync(backup))) throw new Error('Backup changed during rotation');
        fs.unlinkSync(backup);
      }
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(file, backup);
      fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      stat = fs.fstatSync(fd);
      if (!ownedFile(stat)) throw new Error('Unsafe new spool');
    }
    fs.writeSync(fd, line);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    if (lockFd !== undefined) {
      try { fs.closeSync(lockFd); } catch {}
      try {
        const current = fs.lstatSync(lock);
        if (ownedFile(current) && current.ino === lockStat.ino && current.dev === lockStat.dev) fs.unlinkSync(lock);
      } catch {}
    }
  }
}

function finish(accept) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  process.stdin.pause();
  if (accept) try {
    const dataDir = process.env.MINI_OFFICE_DATA_DIR;
    if (!args.includes(MARKER) || typeof dataDir !== 'string' || !path.isAbsolute(dataDir) || /[\u0000-\u001f]/.test(dataDir)) throw new Error('Unconfigured observer');
    const input=Buffer.concat(chunks).toString('utf8');
    // CodeWhale's documented command hooks are environment-only. Copy only
    // its bounded routing/state metadata; model, prompt and error text stay out.
    const raw = provider==='codewhale' && !input.trim() ? {} : JSON.parse(input);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid event');
    if(provider==='codewhale'){
      for(const name of ['DEEPSEEK_SESSION_ID','DEEPSEEK_TOOL_NAME','DEEPSEEK_WORKSPACE','DEEPSEEK_TOOL_SUCCESS','DEEPSEEK_MODE','DEEPSEEK_PREVIOUS_MODE']){
        const value=process.env[name],limit=name==='DEEPSEEK_WORKSPACE'?4096:256;
        if(raw[name]===undefined&&typeof value==='string'&&value.length<=limit&&!/[\u0000-\u001f\u007f]/.test(value))raw[name]=value;
      }
      const exit=process.env.DEEPSEEK_TOOL_EXIT_CODE;
      if(raw.exit_code===undefined&&typeof exit==='string'&&/^-?(?:0|[1-9]\d{0,9})$/.test(exit)&&Number(exit)>=-2147483648&&Number(exit)<=2147483647)raw.exit_code=Number(exit);
    }
    if (raw.hook_event_name === undefined && typeof event === 'string') raw.hook_event_name = event;
    const normalized = normalizeEvent(provider, raw, { receivedAt: Date.now(), source: 'hook' });
    if (normalized) {
      directory(dataDir);
      privateDirectory(dataDir);
      const events = path.join(dataDir, 'events');
      directory(events);
      privateDirectory(events);
      appendBounded(events, normalized);
    }
  } catch { /* Failure is observation loss, never an agent decision. */ }
  process.stdout.write('{}\n', () => process.exit(0));
}

const deadline = setTimeout(() => finish(false), 1000);
process.stdin.on('data', chunk => {
  total += chunk.length;
  if (total > MAX_INPUT) finish(false);
  else chunks.push(chunk);
});
process.stdin.on('end', () => finish(true));
process.stdin.on('error', () => finish(false));
process.stdout.on('error', () => process.exit(0));
