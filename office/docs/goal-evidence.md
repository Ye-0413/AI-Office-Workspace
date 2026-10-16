# AI Mini Office delivery requirements

The product is a standalone macOS application for a five-inch 1280×720 secondary display. The original scope remains active until all requirements have direct evidence.

The user's 0.2.0 additions are stable, interesting task-ID-derived nicknames; visible door arrivals and inactive departures; richer event-driven animation; English/Chinese switching; and local studio branding throughout the interface. Visual attendance must not rewrite the underlying session's lifecycle.

- Build an actual self-contained `.app`, then launch that packaged application on macOS; source-only or an HTML preview does not satisfy this requirement.
- Preserve the small shared office and the original Clawd animation richness; improve furniture interactions, locomotion, depth, ambient details and readable task identity.
- Observe independent sessions from Codex, Cursor and Claude Code; provider identity must never collapse distinct sessions.
- Extract activity from documented provider schemas and source-derived fixtures, including correlated tool outcomes, waiting states, child agents and turn/session boundaries.
- Run a read-only local Codex session observer; distinguish live activity from history, stale state, and demonstration data.
- Connect other providers with explicit observation hooks that preserve existing configuration and leave approval decisions in the native AI tools.
- Demonstrate natural state-driven room interactions without fabricating successful tests or task completion.
- Verify session isolation, state ordering, replay protection, bounded reads, interruption, reduced motion, lifecycle cleanup, packaged assets and launch behavior.

Evidence is recorded as work completes. Fixture tests alone are not proof of a real provider session. The application must label any connection or runtime verification that remains unavailable.

## Verified on 2026-10-15

- The 0.1.1 source test run passed **114/114** Node tests. It covers all three provider dialects, independent sessions, child agents, correlation, turn/session boundaries, source arbitration, bounded reads, partial records, configuration preservation, connection/removal controls and spool rotation. A parallel observer exercise retained **24/24** complete synthetic records.
- All **50 original Clawd SVGs** were copied byte-for-byte, alongside the original artwork license and notices. The Claude configuration operation queue is also identical to upstream.
- The macOS Electron renderer passed **12/12** programmatic behavior checks in a sandboxed, context-isolated 1280×720 window. These checks cover independent actors, room routing, interruption, reduced motion, lifecycle cleanup and dialogs; they do not replace human visual review.
- A real packaged arm64 `.app` launched successfully on macOS, loaded its preload and bundled room/character assets, and reported no renderer errors. Its read-only Codex observer recognized real root and child sessions without running an AI task or changing AI configuration.
- The packaged observer ran from `app.asar` using the packaged Electron executable with `ELECTRON_RUN_AS_NODE=1`. It emitted `{}` and recorded a normalized synthetic test-start in an isolated directory. A separately installed Node is not needed by the installed hook.
- Bundle identity, arm64 architecture, required packaged files and ad-hoc signing have been checked. Final archive checks are recorded in the delivery report alongside the build outputs.

## 0.1.1 state corrections

The complete packaged chain exposed a parent returning to planning after its own tool ended while a child still worked. A companion read-only audit also reproduced a parallel tool masking an unanswered question, partial initial metadata losing a session, and oversized tool output leaving a session permanently busy. Six new regression tests cover these boundaries. Waiting for input now takes priority over parallel activity, pending parent turns continue waiting for children, and incomplete metadata is retried within the read limit. Only a real Codex terminal can reconcile a skipped tool result, with outcome `unknown` or `cancelled`, never inferred success.

`node scripts/verify-packaged-flow.cjs` loads the final bundle's collector, bridge, reducer and scene rules to check the complete three-provider chain without a GUI or global configuration changes. The delivery report records the actual replay result. All payloads are explicitly synthetic; this check is not a live-client verification.

## Pending verification

- The user chose to continue building while the Mac is locked. Actual on-screen visual inspection, character readability and fullscreen placement on the physical five-inch secondary display are deferred until unlock.
- Cursor and Claude Code event normalization and passive hook installation are covered by fixtures and isolated configuration tests. They have not yet been proven with live sessions in those tools; Claude Code was unavailable in the local environment. No global hook installation was performed during verification.
- The local Apple Silicon build is ad-hoc signed. Intel, Developer ID signing and notarization have not been verified.

## 0.2.0 implementation

Nickname generation is a pure function of the provider and complete actor ID. It never uses task descriptions. The room has an animated doorway aligned to its background door. Confirmed idle sessions step out after twenty seconds, keep their identity outside, and re-enter on real new work; waiting, stale signals and active helpers are protected. The animation director accounts for all fifty assets, uses twenty-six appropriate actions in stable eight-second phases, and gives brief identified tool-result reactions without fabricating outcomes. English/Chinese UI copy and native menus follow a validated persisted language setting; user-authored task/project text stays unchanged.

The 0.2.0 source suite passed 150 tests, including identity stability, attendance transitions, state-faithful animation plans and UI translation coverage. Fifteen isolated native renderer checks passed, including a real twenty-second idle departure, return under the same nickname, stable phase updates, reduced-motion departure interruption and English/Chinese persistence. Package and installation results are recorded in the delivery report outside the application bundle. Native visual inspection is still unavailable because computer-control permissions are not granted; programmatic checks do not substitute for that review.

The implementation and packaging are usable for local review. The full product goal remains active while the visual and live-provider checks above are pending.

Upstream reference: `rullerzhou-afk/clawd-on-desk` at `c52e2df6ff778bf85310166882c516385f2f6eab`.

## 0.3.0 idle visits and visible collaboration

A local decorative visitor drops by only after eight seconds with no observed occupants or departing actors anywhere in the studio. It uses a separate renderer layer and never joins session identity, attendance, task counts or the roster. It visits ten furniture/room locations, pauses for contextual dialogue, leaves after about 150 visible seconds, and may return after 45 seconds. Real work revokes the current generation immediately. Hidden windows pause visit/dwell time; disabled visitors, demo mode and real-work interruption cleanly cancel stale routes. Reduced motion and low-power modes use static character art and gentler timing. A persisted setting can disable idle visits.

The dialogue library contains exactly 500 independently authored Chinese/English pairs (50 per location), with unique IDs and unique copy in each language. A contextual shuffle bag exhausts a location before repeating. Fifty entries contain small jokes or easter eggs, with separate infrequent original-art character tricks.

Family UI shares a root-derived color, shows the immediate parent's nickname on every helper, keeps helper activity visible, and draws persistent directional links even across the room and under reduced motion. The roster uses parent-first ordering and indentation; the inspector can navigate to the parent. Missing parents and cyclic metadata are bounded and do not hide actors.

Codex raw JavaScript `exec` wrappers are inspected with a bounded, non-executing lexer so nested file edits, shell tests and other submitted tool calls retain their activity. Matched short tool calls that finish between snapshots can show an evidence-backed, four-second recent-work pose in place, without changing backend state or sending an actor back and forth. Explicit reasoning, waits, errors, stale signals and terminal events override old action cues. Actual local Codex logs confirmed nested execution recognition; release-level validation is recorded in the external build report.


## 0.3.1 Hermes Gateway activation

A long-running local Gateway can predate the observer installation. Both the previous installer and Hermes CLI's unchanged-enable path skipped runtime activation. Explicit Connect now checks the owned local UNIX socket, identifies the Gateway and requested Hermes home, invokes Hermes' supported reload-plugins control verb, and confirms all eleven observer hook registrations. An installed Hermes row exposes a separate Reload plugin action. Inspection and ordinary polling never trigger reload. Unsupported, absent or unconfirmed Gateways keep an honest installed-only status; no AI message, tool invocation, approval or Gateway restart is sent. Observer workers drain and retire on plugin unload, with their exit callbacks released. Release verification and live local activation results are recorded in the external build report.
