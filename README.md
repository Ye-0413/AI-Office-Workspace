<p align="center">
  <img src="office/assets/studio-icon.png" width="88" alt="AI Office Workspace icon">
</p>

# AI Office Workspace

**A little room for real AI work.**

Watch your AI sessions become paper, ink, moss, yarn and warm light. They read, think, build and wait in a cozy desktop studio, while their real identities and parent–helper relationships stay intact.

[Download v0.24.0](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0) · [简体中文](README.zh-CN.md) · [Release notes](docs/releases/release-v0.24.0.md) · [Originality & credits](ORIGINALITY.md)

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/animations/workshop-demo.png">
  <img src="docs/animations/workshop-demo.svg" width="1100" alt="Five workshop companions in a public animation demonstration">
</picture>

*Offline native-rendered samples of production character motions, composed with synthetic sessions and a smaller family helper. This is not a screenshot of a user's live tasks. [Static preview](docs/animations/workshop-demo.png).*

Designed for a **5-inch, 1280 × 720 secondary display**; also runs as a normal macOS window.

[![Office quality](https://github.com/Ye-0413/AI-Office-Workspace/actions/workflows/office-quality.yml/badge.svg)](https://github.com/Ye-0413/AI-Office-Workspace/actions/workflows/office-quality.yml)

## Meet the workshop

Five companions have their own silhouette, material and way of moving:

- **Folio · 纸团** — folded cream paper, short origami feet and careful little creases.
- **Ink · 墨豆** — a low navy ink creature with a bright eye slit; helpers separate into droplets and merge back.
- **Moss · 苔盒** — grounded terracotta, small roots and a living moss back.
- **Thread · 线团** — coral yarn, a loop ear and a loose strand that becomes part of its gestures.
- **Glow · 灯籽** — a translucent amber seed with four tiny supports and a quiet inner light.

The first five main-agent families use five different base designs. Additional families receive color variants; each helper inherits its real root's shape and color at a smaller size. Existing families keep their appearance as others arrive or leave. These are visual personalities, not changes to an AI tool's abilities.

The character concepts and reference were supplied by the user. Sprite sheets were made with AI-assisted image generation, then integrated with project-authored rendering and motion. [Read the bilingual provenance statement](ORIGINALITY.md).

## 550 ways to be at work

**5 companions × 11 observed activities × 10 distinct performances.** Each material gets its own props, contact sequence and movement: paper folds and feeds, roots touch leaf keypads, yarn threads through small mechanisms, and light follows translucent tracks.

Reading · Searching · Planning · Coding · Designing · Testing · Building · Running · Waiting for tools · Waiting for you · Error

Coding keeps a recognizable input action; building assembles parts; running maintains an already-started mechanism. Waiting stops the work. Errors keep a visible jam, break or knot without pretending it has been repaired. A confirmed tool success gets a small, deduplicated response; completion requires actual completion evidence.

Open **Room preferences → Workshop companions → Motion gallery** to explore every character, activity and variation, with play/pause controls. [Browse public animation previews](docs/animations/README.md).

## A room that respects the work

- **Real families.** Independent sessions keep their IDs. Helpers emerge from their observed parent, walk to work and return to that parent; nested relationships remain visible.
- **Larger companions, readable names.** Choose a fixed size from 65% to 135%. Agent counts never shrink bodies or labels. Moving agents may cross; settled work positions keep their complete body and nameplate envelopes separate. If a chosen size cannot safely admit a new body, it waits for floor space and remains in the roster.
- **Motion that can rest.** Metadata refreshes preserve animation owners and playback. Hiding the window pauses the original clocks; reduced motion and low power keep calm, informative poses.
- **A changing place.** Six everyday rooms and 27 holiday rooms have distinct architecture and layouts. Daily room follows the Hong Kong calendar; a manual choice persists. [Explore the rooms](docs/rooms/README.md).
- **Useful at a glance.** Search companions with **⌘K**, inspect actual ancestry and activity, and review local history, Daily Token and Weekly usage. [Monitoring coverage and limits](office/docs/monitoring.md).
- **Small moments.** Furniture responds to a genuine arrival when there is room. Twelve pair interactions and optional, clearly decorative visitors add life without fabricating AI work.

## Local observation, explicit connections

The studio reads supported local session logs and events from hooks or plugins you choose to connect. It needs no cloud account, AI API key or telemetry service. Settings and observation history stay in the app's local data directory; the detailed storage boundaries are documented in the [app guide](office/README.md#local-data-and-credits).

**Connect AI tools → Initialize** detects existing tools and installs or updates owned observation configuration after your click. The catalog includes 28 integrations, with support varying by host and version. Configuration and event fixtures do not mean every real client has been verified. Tool approvals remain in the original AI tool; decorative activity never makes a task succeed.

## Get v0.24.0

**macOS 13 or later · Apple Silicon / arm64.** This is the currently verified target. The release includes a self-contained Electron runtime, so installed users do not need Node.js or a development server.

1. Open the [v0.24.0 Release page](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0) and download the arm64 DMG or ZIP.
2. With the DMG, drag **AI Mini Office.app** into **Applications**; with the ZIP, extract it and move the app there.
3. Open the app, connect the AI tools you use, then produce a fresh event in the original tool.

The current distribution uses local ad-hoc signing and is not Apple-notarized. macOS may display an unidentified-developer warning; review the release source and checksum before deciding whether to open it. This project does not require disabling system security protections.

[What's new in v0.24.0](docs/releases/release-v0.24.0.md) · [Release index](docs/releases/README.md)

## Run from source

The application lives in **`office/`**. The root package belongs to the retained upstream reference project. For development, use macOS, Node.js 24+ and Xcode Command Line Tools for the native helper.

```sh
git clone https://github.com/Ye-0413/AI-Office-Workspace.git
cd AI-Office-Workspace
npm --prefix office ci
npm --prefix office test
npm --prefix office start
```

```sh
# Native renderer smoke check
npm --prefix office run verify:renderer
# Local .app, DMG and ZIP
npm --prefix office run build:mac
```

Builds are written to `dist-mini-office/`. The five workshop companions are included in the public source; they do not require restoring upstream character artwork. Legacy artwork may be prepared only from an authorized local checkout, using the optional procedure in the [app guide](office/README.md#公开源码版准备).

## Source, artwork and attribution

Source code is licensed **AGPL-3.0-only**: [LICENSE](LICENSE). The repository builds on and preserves code, provider definitions and history from [Clawd on Desk](UPSTREAM-README.md); it is not an entirely original codebase.

The five workshop characters, generated environments and application icon have documented project-specific creation records. Character artwork retains **All Rights Reserved** under the [artwork notice](office/assets/WORKSHOP-ARTWORK-NOTICE.md); the code license does not grant an open artwork license. Existing third-party licenses and notices remain applicable. [Originality statement](ORIGINALITY.md) · [Notices](NOTICE.md) · [App credits](office/UPSTREAM-NOTICE.md).

Other retained language READMEs describe the upstream reference project, rather than this release. Current project documentation is available in English here and in [简体中文](README.zh-CN.md).
