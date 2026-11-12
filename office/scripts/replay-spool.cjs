#!/usr/bin/env node
'use strict';
// Developer diagnostic: replay normalized spool files through the session
// reducer with a simulated clock and print aggregate counts only. It never
// writes, never prints identities, titles, paths or tool names.
//
//   node scripts/replay-spool.cjs [--reducer path/to/session-store.cjs] [spool.jsonl ...]
//
// Without spool arguments it reads this Mac's spool in the app data folder.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
let reducerPath = path.join(__dirname, '../lib/session-store.cjs');
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--reducer') reducerPath = path.resolve(args[++i]);
  else files.push(path.resolve(args[i]));
}
if (!files.length) {
  const dir = path.join(process.env.MINI_OFFICE_DATA_DIR || path.join(os.homedir(), 'Library/Application Support/AI Mini Office'), 'events');
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    if (!/\.jsonl$/.test(name)) continue;
    if (fs.existsSync(path.join(dir, name + '.1'))) files.push(path.join(dir, name + '.1'));
    files.push(path.join(dir, name));
  }
}
if (!files.length) { console.error('No spool files found.'); process.exit(1); }

const { createSessionStore } = require(reducerPath);
const PRUNE_MS = 5000, STALE_MS = 180000, TAIL_MS = 10 * 60000;
const report = {};
for (const file of files) {
  const provider = path.basename(file).replace(/\.jsonl(\.1)?$/, '');
  const events = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try { const event = JSON.parse(line); if (event && Number.isFinite(event.at)) events.push(event); } catch {}
  }
  const bucket = report[provider] ||= { events: 0, accepted: 0, rejected: {}, sessions: 0, stuck: 0, lostSignals: 0, heartbeats: 0, abandonedTools: 0, _events: [] };
  bucket._events.push(...events);
}
for (const [provider, bucket] of Object.entries(report)) {
  let clock = 0, lastPrune = 0;
  const store = createSessionStore({ now: () => clock, staleMs: STALE_MS, maxSessions: 100000 });
  const detailed = typeof store.ingestDetailed === 'function';
  const previous = new Map();
  for (const event of bucket._events) {
    clock = Math.max(clock, event.at);
    while (clock - lastPrune >= PRUNE_MS) {
      lastPrune += lastPrune ? PRUNE_MS : clock;
      store.prune();
      // A gap above the stale threshold inside one session is a lost signal.
      for (const s of store.snapshot()) {
        if (s.status === 'stale' && previous.get(s.id) !== 'stale') bucket.lostSignals++;
        previous.set(s.id, s.status);
      }
    }
    bucket.events++;
    const result = detailed ? store.ingestDetailed(event) : store.ingest(event);
    if (result === true || result === 'accepted') bucket.accepted++;
    else { const reason = typeof result === 'string' ? result : 'rejected'; bucket.rejected[reason] = (bucket.rejected[reason] || 0) + 1; }
  }
  clock += TAIL_MS;
  store.prune();
  // A clock before every event shows the reduced state without stale masking.
  const end = clock; clock = 0;
  const reduced = store.snapshot();
  clock = end;
  bucket.sessions = reduced.length;
  bucket.stuck = reduced.filter(s => ['active', 'waiting'].includes(s.status)).length;
  for (const s of reduced) { bucket.heartbeats += s.diagnostics?.heartbeats || 0; bucket.abandonedTools += s.diagnostics?.abandonedTools || 0; }
  delete bucket._events;
}
console.log(JSON.stringify({ reducer: path.relative(process.cwd(), reducerPath) || reducerPath, staleMs: STALE_MS, providers: report }, null, 2));
