# Provider metadata and passive observation

`agents/registry.js` in the source checkout is the authoritative tool catalog.
Run `node scripts/sync-provider-catalog.cjs` from `office/` after updating the
checkout. `--check` compares both generated runtime metadata and browser labels
without writing files. The generated metadata preserves every upstream ID,
display name, event map and capability. Those capabilities describe upstream;
they do not mean Mini Office installs an integration or makes approval decisions.

`provider-labels.js` exposes only IDs and names to the renderer. The full pinned
JSON remains usable in the packaged application without requiring the upstream
checkout at runtime.

## Activity adapters

`adaptUpstream(provider, raw, options, normalizeCommon)` handles the 24 additional
catalog tools. Codex, Claude Code, Cursor and Hermes keep their existing dedicated
adapters. The callback receives a conservative Claude-shaped intermediate record
with `source: 'upstream-derived'`, so missing tool outcomes stay unknown. The
result is re-keyed to the actual provider and native session, parent, turn and
tool identifiers. Command-hook delivery retains evidence source `hook` for the
private event spool; reduced upstream payloads retain `upstream-derived`.

Native event vocabularies come from the actual command hooks, the Pi/OMP
extension bindings, OpenClaw runtime, OpenCode/MiMo plugin and DeepSeek bridge.
No user prompt, response body, command text or tool output survives normalization.
A tool name may guide classification through an exact known alias; arbitrary MCP
names remain unknown.

An event without a real session ID is dropped. Kiro CLI is the explicit upstream
exception: its hook supplies no ID, so an actual absolute working directory gives
it a stable project-scoped actor. Concurrent Kiro conversations in the same
project cannot be distinguished using that native hook contract. OMP's raw
`agent_end` requires a confirmed main-session stop candidate and a noncontinuing
boundary. OpenClaw session reset/compaction does not close the actor.

## Configuration ownership

`createUpstreamIntegrations` produces configuration plans for the common JSON
command-hook formats. It accepts the bridge's safe reader and exact command
builder, returns `{file,before,value,changed}`, and leaves serialization, locking,
backups and atomic publication to the existing bridge. Inspection and planning
never modify a user's tool configuration.

Plans preserve unrelated settings, foreign hooks and permission handlers.
Ownership requires an exact generated invocation; a filename or marker substring
is insufficient. PermissionRequest/PermissionDenied hooks are not installed by
these plans. The observer emits only `{}` and never starts or continues an AI
task. Gemini BeforeTool is observed with a neutral `{}` response and a 2000 ms
timeout, following its official optional-output contract. Antigravity Stop is
excluded because the upstream implementation emits an explicit decision there;
PostInvocation supplies its passive turn boundary instead.

The installed status describes configuration presence. A real accepted activity
event is required to confirm that the actual client loaded and ran the observer.
Synthetic contract tests are not a live-client compatibility certification.


## Nonstandard native formats

`special-integrations.cjs` covers Kiro custom-agent JSON, the KiroCrew gateway
hook store, both Kimi TOML generations, CodeWhale TOML/env-only hooks, and
MiniMax's native Claude-compatible local plugin layout. TOML is parsed with the
pinned runtime `@iarna/toml` parser before and after a change. Hash-checked owned
blocks leave every unrelated source byte and comment intact. Invalid/unsupported
syntax and externally edited observer blocks are preserved with an explicit error.

Kiro's built-in agents cannot be overridden by a JSON file. A Connect action can
clone the actual built-in template through the Kiro CLI, preserving its tools and
approval settings, and create `mini-office`; the user then selects that agent.
Existing custom agents receive only hook entries. KiroCrew mutations require the
real nonblocking gateway, directory and store flocks across the complete change.
A missing lock helper fails before touching its hook store. MiniMax stages its
owned plugin outside the scanned `plugins/` directory and invokes the observer
in native exec form without shell parsing.

Gemini output semantics and timeout units were checked against its
[official hooks reference](https://geminicli.com/docs/hooks/reference/).

Hermes Gateway (0.3.1): explicit installation or Reload verifies the local Hermes control-socket identity and home, requests the supported `reload-plugins` verb, and requires all 11 observation hooks in the activation response. A previously enabled plugin is also reloaded, since the CLI's unchanged-enable path may not activate it in an existing Gateway. The Gateway keeps running. Missing/older/unconfirmed control interfaces remain marked installed-only; fresh real hook events are required before reporting observation. Current installed Hermes source 0.21.5 supplied the protocol contract.
