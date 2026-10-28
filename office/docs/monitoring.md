# Local monitoring, token accounting and manual questions

Cursor desktop/CLI observation also supports the completion-only compatibility
configuration. A fresh `postToolUse` or `postToolUseFailure` hook with native
conversation/generation identity and a tool name can establish observed activity
without a matching start. It records the result itself, with no invented start,
pending call or pre-observation execution time. A native Stop settles that
generation; later results cannot reopen it. A newer generation can become active
after the prior turn settles. Unpaired results never resolve existing waits or
decrement other calls, and session teardown remains authoritative. Historical
hook-spool contents are still skipped on startup. No new gating hooks or approval
responses are required by this fallback.

Cursor 3.25.6 joins 3.24.12 in the exact-source passive-response verification
list, so an explicit reconnect also observes prompt, tool and helper starts on
those hosts. The observer still returns only `{}`. Existing CLI processes and
background workers can retain the configuration they loaded at startup; they
must reload before new hook registrations take effect. Updating the office or
rewriting hooks does not itself restart or interrupt a running AI task.

Codex hook/rollout arbitration retains a native result that arrives after the
hook lease expires but before its deferred start has replayed. Both original
records replay in order, so a completed turn cannot inherit a phantom pending
tool from that scheduling gap. Results retain their own outcomes and clocks.

At manual sizes above 100%, admission can also validate the actual small root
cast without requiring room for a hypothetical extra holding body. The same
coordinator sweeps all entry and ordered exit legs at the unchanged size, and
the renderer preserves the proved entry order. Future arrivals need their own
proof; no body, nameplate, obstacle or collision envelope is reduced.

**Last checked against source:** 2026-10-23.

The local usage mechanisms adapt
[CC Switch revision `03707c400dc4bdd16c687e712d818c4629175351`](https://github.com/farion1231/cc-switch/tree/03707c400dc4bdd16c687e712d818c4629175351).
Its MIT notice is retained in [UPSTREAM-NOTICE.md](../UPSTREAM-NOTICE.md).
The manual question channel reuses the preserved Clawd on Desk contracts in
[`src/agent-question-wire.js`](../../src/agent-question-wire.js),
[`src/server-route-question.js`](../../src/server-route-question.js) and
[`hooks/opencode-family-plugin/core.mjs`](../../hooks/opencode-family-plugin/core.mjs).
Those sources remain covered by the project's AGPL notice.

## Separate evidence paths

```text
Hooks/plugins + live Codex observer ──────────┐
Fresh Gemini/Pi/OMP session-log boundaries ────┴─> SessionStore
                                                    │ accepted events only
                                                    ├─> observed activity archive
                                                    └─> daily observed identities

Supported historical session logs / SQLite ────────> token request ledger
                                                    │
                                                    ├─> homepage day/week totals
                                                    └─> usage-history token section

Supported native question event ─> manual question channel ─> user submission
                                                     └─> native pending check,
                                                         reply and delivery receipt
```

Only accepted live events enter observed work/wait intervals and daily Agent
counts. The activity archive does not infer offline time from a transcript or
treat a token write as work. Historical token imports can include requests
made while the studio was closed; those imports cannot create room actors or
credit working time.

[`session-usage-monitor.cjs`](../lib/session-usage-monitor.cjs) imports Codex
and Claude Code accounting independently from the live reducer.
[`additional-session-monitor.cjs`](../lib/additional-session-monitor.cjs)
imports five further tools and has a separate live-event output for Gemini
CLI, Pi and OMP. That output accepts actual boundaries only after the
observer's startup time and within its five-minute freshness window. It does
not reconstruct a working actor from old startup history. The reducer's
bounded hook lease preserves recent hooks as the primary source while allowing
fresh log evidence to repair a missing hook stream.

## Actual coverage

| Tool | Local token source | Activity source |
| --- | --- | --- |
| Codex | JSONL in `CODEX_HOME/sessions` and `CODEX_HOME/archived_sessions`, defaulting to `~/.codex` | Existing hooks and bounded live rollout observer, including evidence-based fresh-state restoration |
| Claude Code | JSONL in `CLAUDE_CONFIG_DIR/projects`, defaulting to `~/.claude/projects` | Existing hooks |
| Gemini CLI | `~/.gemini/tmp/*/chats/session-*.json` or `.jsonl`; native JSONL takes precedence over its JSON shadow | Existing hooks plus fresh native user/tool/explicit terminal records |
| Pi | JSONL under the effective Pi agent directory's `sessions/`, normally `~/.pi/agent/sessions` | Existing extension plus fresh native session/tool records |
| OMP | JSONL under the effective OMP agent/profile directory's `sessions/`, normally `~/.omp/agent/sessions` | Existing extension plus fresh native session/tool records |
| Kimi Code | Committed records in `~/.kimi/sessions/**/agents/main/wire.jsonl` | Existing hooks; the new native reader is accounting-only |
| OpenCode | Read-only `opencode/opencode.db` under `XDG_DATA_HOME`, normally `~/.local/share`; V2 tables take precedence over frozen V1 tables | Existing plugin; the new SQLite reader is accounting-only |

Pi/OMP paths follow the relevant agent-directory and profile overrides. The
same physical directory is not counted under two tool identities. Other
connected tools retain their existing hook/plugin activity integrations but
do not acquire token coverage from this importer. UI coverage comes from the
reported provider list; unsupported filters display unknown coverage instead
of presenting missing data as a known zero.

The native readers preserve session identity and explicit parent/call
relationships. A quiet source is not a completed task. A token total is not
proof of a successful tool or test. Gemini records without a native terminal
`finishReason` do not establish turn completion. Provider-specific source
errors remain scoped to that provider's health.

## Accounting and recovery mechanisms

| Mechanism | Local implementation |
| --- | --- |
| Persistent byte checkpoints | Committed offsets and bounded parser state resume JSONL reads; a partial final line waits for its newline. |
| Rewrite detection | Device/inode identity and hashes of the file beginning and committed boundary detect truncation, replacement and in-place rewrites, including unchanged size/mtime. |
| Atomic batches | Native request rows and the next file cursor commit in one SQLite transaction. A failed batch retains its previous cursor and cannot publish its associated live events. |
| Durable deduplication | A permanent ledger uses native request/message/response identities or deterministic snapshot keys. Streaming snapshots update counters rather than adding requests. |
| Codex provisional native records | Uncorroborated native usage stays in bounded parser state across EOF/restart. A matching authoritative token snapshot or explicit zero-last evidence is required before charging it. Poll timing cannot turn a timing companion into an extra request. |
| Codex continuation pages | Discovery indexes native pages before resolving cumulative dependencies. A total-only page waits for its immediate indexed predecessor's completed checkpoint and counter baseline. The predecessor's current identity, size, mtime and fingerprints are rechecked. An unfinished page cannot be skipped for an older baseline. |
| Fork boundaries | Native filename/thread identity, inherited-history ordinals, exact thread markers and original task times fence copied parent usage. |
| Kimi receipts | Native provider namespace plus committed message ID deduplicates copied fork history across session directories. |
| Pi projections | Tool-result usage projections are excluded so a child response is not charged again through its parent's result. |
| OpenCode SQLite | Read-only queries run in a consistent transaction, follow WAL updates, and revisit incomplete messages. An oversized row is skipped without reading its body so later valid rows can progress; bounded deferred-row warnings persist and keep the source incomplete. |
| Foreground UI refresh | History refreshes coalesce, pause while the dialog is closed or hidden, preserve successful same-filter values on error, and update rolling Hong Kong date ranges at midnight. |

The existing live Codex observer also checks its bounded byte boundary before
following an old offset. A rewritten log is silently reattached through the
existing snapshot/turn-watermark fences, so newer state can replace stale
state without replaying historical tool actions. Historical-directory read
failures are exposed as monitor errors.

Discovery, content reads and parser state have per-pass bounds. Large histories
populate progressively. Missing source directories are normal; unsafe source
links and failed reads are handled conservatively. Oversized or incomplete
native JSON remains visibly incomplete rather than advancing a successful
checkpoint. Malformed/oversized JSONL records are bounded, skipped and counted
in importer diagnostics; partial final lines are retried.

## Homepage statistics and storage

**Daily Token** uses the Hong Kong calendar date. **Weekly usage** uses the
Hong Kong Monday–Sunday week, across all supported local projects and tools.
M, B and T mean one million, one billion and one trillion. Values below one
million use meaningful fractional M values. The keyboard-focusable source
description contains exact counts, day/week bounds, supported providers, last
scan time and incomplete/error status.

The usage-history token section uses the same date, tool and root/helper
filters as the observed activity section, while keeping their meanings
separate. The existing CSV export remains an export of observed Agent
activity. Model breakdown displays the 100 largest matching provider/model
groups; overview totals include all matching records.

Uncached input, cache reads, cache writes and output are disjoint. Source
formats with separate reasoning output are normalized into output, and the
reasoning breakdown is then a subset rather than an extra addition. Counts
are those reported by local logs. No price, cost, balance, subscription quota
or server-side completeness is inferred.

[`session-usage-store.cjs`](../lib/session-usage-store.cjs) keeps the permanent
ledger in `usage-history/tokens.sqlite3`, separate from the observed activity
database `usage.sqlite3`. It uses SQLite WAL and full synchronous commits,
0700 directories and 0600 files, with unsafe-destination checks. Full source
paths and request keys are hashed; native identities, native rollout
filenames, relationships, model labels, dates, counters and bounded parser
checkpoints are retained. No prompt, response body or tool argument is copied
into the token database, and full source paths are not sent to the renderer.

Removing or editing a transcript does not remove previously imported usage.
The retained ledger allows source rescans to upsert native receipts without
recharging the same history; it records past local reports rather than acting
as a deletion-synchronized transcript mirror.

## Manual native questions

[`manual-questions.cjs`](../lib/manual-questions.cjs) and the owned plugin
[`questions.cjs`](../hooks/passive-plugins/questions.cjs) adapt Clawd's
request-scoped question protocol. Current answerable contracts are:

- OpenCode **1.x**, starting at **1.18.31**.
- MiMo Code **0.1.x**, starting at **0.1.15**.

The plugin checks native host health/version and the exact pending request.
It snapshots and bounds the schema before asynchronous work. The UI displays
the provider/session attribution, supports single/multiple/custom answers and
keeps drafts only in memory. New questions do not open the dialog or take
focus automatically. Only an explicit user submission sends an answer.

Immediately before the single native reply, the plugin rechecks session,
request, message/tool IDs and the complete question schema. Equivalent object
key order is accepted; array order and values remain significant. Native
delivery is confirmed through a request-bound receipt. Missing or uncertain
confirmation leaves the request locked with native fallback, without an
automatic retry. A valid late terminal receipt may still resolve that locked
request. Resolution elsewhere, cancellation, expiry and disconnection return
control to the original tool.

The local server binds to `127.0.0.1`, uses an owner-private runtime file and
random bearer token, rejects browser `Origin` requests, bounds request bodies
and queue size, and exposes no arbitrary host URL to renderer IPC. The
renderer can submit only an opaque pending ID and indexed answers; the main
process owns identity binding and checks the IPC sender. Runtime credentials,
question bodies and answer drafts are not written to the activity/token
archives. This channel has no automatic-answer, tool-approval or ordinary
chat-message API.

Codex questions, OpenCode 2.x and other unsupported contracts remain native
to the original tool. Update existing OpenCode/MiMo installations with an explicit
reconnect in the connection panel or one-click Initialize, followed by the
host's normal plugin reload/new-session path. Startup starts the local runtime
channel but does not rewrite host configuration.

## Fixed visual size and crowd boundaries

The Agent size slider selects **65%–135%**. Count changes, empty rooms,
ordinary observations, venue changes and window resizing do not change that
preference. Refit retries allocation at the chosen size. Roots use full
artwork size; direct and nested clones use **80%** of root artwork within the
same conservative collision/nameplate envelope. The root/clone presentation
multipliers are 1.5 and 1.2 before the user-selected outer scale.

A size change requested during a clone's split, return or absorption is saved
immediately. Its existing bodies keep their proved physical size until that
finite operation finishes; the room shows that the size change is pending.
It then re-admits bodies at the requested size with a fresh geometry proof.
Preference-only readmission does not create a new work-arrival response;
actual new activity still receives its normal endpoint feedback.

The fixed allocator retains safe physical residents before admitting more
identities. It proves complete envelopes and routes at the requested scale,
using a size-safe entrance in the existing doorway approach where needed.
An owned clone transition may keep its previously proved resident goals after
fresh checks of the actual feet and transitions; it grants no new entry or exit
permission. If an unchanged station blocks a real work change, a bounded fresh
assignment can move that coworker within its valid work zone, with full route
and transition proofs, before deferring the new destination.
Unplaceable identities remain in the roster and are explicitly marked
**Waiting for space** in the list, summary and inspector. They are not
presented as working at a floor location they have not reached. Full labels,
native identities and parent links remain available; crowding no longer
selects a compact label mode or shrinks everyone to fit.

This policy does not promise simultaneous floor bodies for every open
session. Capacity depends on the chosen size, actual work zones and safe
routes. Existing auto-fit demonstrations of thirteen bodies at 40% or dense
hundred-body casts describe the previous policy and do not establish current
fixed-size admission behavior.

## Evidence boundaries

- A fork without an inherited baseline and without exact request usage seeds
  its first cumulative snapshot conservatively. Ambiguous inherited usage is
  not charged to the child and may be omitted.
- A cumulative-only Codex continuation with an unavailable or ambiguous
  immediate predecessor remains deferred and visibly incomplete; it does not
  consume that first increment as a successful zero.
- Last-only snapshots without native request identity cannot always separate
  a repeated write from a distinct equal-sized request. Distinct timestamps
  count separately; native identity enables exact upserts.
- Supported formats and version gates are tested with isolated fixtures and
  native renderer checks. Those checks do not imply that every real tool,
  account, host version or plugin lifecycle has been accepted end to end.
- Tests use synthetic question clients. A passing fixture is not evidence
  that a real user's Agent question was answered or a tool approval granted.
