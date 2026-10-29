<p align="center">
  <img src="office/assets/studio-icon.png" width="72" alt="AI Work Space icon">
</p>

# AI Work Space

**Observe your agent team collaboration in your spare display**

[Download for macOS](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0) · [简体中文](README.zh-CN.md) · [Release notes](docs/releases/release-v0.24.0.md)

A quiet desktop studio for your real **Codex, Claude Code, Cursor, OpenCode** sessions and their helpers—made for a spare display.

<a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-brand-40s.mp4">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/ai-work-space-preview.jpg">
    <img src="docs/media/ai-work-space-preview.gif" width="1100" alt="Play the film: a real AI Work Space studio with a main companion and its smaller helper">
  </picture>
</a>

| [▶ 40s · Brand film](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-brand-40s.mp4) | [60s · Product tour](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-product-tour-60s.mp4) | [20s · Vertical](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-social-20s-vertical.mp4) | [12s · Silent loop](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-loop-12s-silent.mp4) |
| :---: | :---: | :---: | :---: |

*Click to watch/download. Real v0.24.0 recordings, updated brand titles, bilingual captions; gallery demonstrations are labeled. [Media details](docs/media/README.md).*

## Meet the workshop

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/animations/workshop-demo.png">
  <img src="docs/animations/workshop-demo.svg" width="1100" alt="Folio, Ink, Moss, Thread and Glow perform their distinct material-based motions alongside a smaller family helper">
</picture>

| Folio · 纸团 | Ink · 墨豆 | Moss · 苔盒 | Thread · 线团 | Glow · 灯籽 |
| :---: | :---: | :---: | :---: | :---: |
| Folded paper | Flowing ink | Clay & moss | Coral yarn | Amber light |
| Writing & research | Coding & debugging | Long tasks & care | Design & exploration | Coordination |
| Earnest · meticulous | Quiet · determined | Steady · patient | Playful · inventive | Gentle · precise |

These are personality themes; **every companion supports all 11 activities**. **5 × 11 × 10 = 550 motions.** Above: offline production-animation samples using synthetic sessions. [Explore the motions](docs/animations/README.md).

The first five main agents receive different designs; later families use color variants. Helpers inherit their root's **shape and color, at a smaller size**. [Full character stories & family rules](docs/companions.md).

## Find a companion. Follow the work.

| Find with ⌘K | Keep everyone readable |
| :---: | :---: |
| ![Search real companions by task, tool, project or identity](docs/media/ai-work-space-search.jpg) | ![Adjust companion and nameplate size in room preferences](docs/media/ai-work-space-sizing.jpg) |

| At a glance | In the studio |
| --- | --- |
| **Real families** | Real session identities, ancestry and smaller helpers; observed work, waits and errors stay distinct. |
| **Fixed 65%–135% size** | Bodies and nameplates stay readable as agents arrive. Movement may cross; settled work positions stay separate. |
| **⌘K search** | Find by name, task, tool, project or ID. Inspect activity and locate a companion. |
| **Local usage** | Seven tools; daily/weekly Token totals, model breakdowns, activity history, filters and CSV export. |
| **Explicit connections** | Local data; no cloud account, API key or telemetry. You choose integrations and submit supported native answers manually. |
| **Quiet company** | Reduced motion, low-power mode and animation pauses when hidden; optional visitors and 12 pair interactions. |

[Usage & native-question support](office/docs/monitoring.md) · [Local data & controls](office/README.md#local-data-and-credits)

## From the observatory to 33 daily & holiday rooms

![The observatory room in the real application](docs/media/ai-work-space-observatory.jpg)

**33 rooms** · 6 everyday + 27 holiday · Hong Kong calendar · Day/night lighting · English / 中文

Choose a room or follow the calendar. Designed for a **5-inch, 1280 × 720 display**, and ordinary macOS windows. [Explore the room gallery →](docs/rooms/README.md)

## Bring your tools

| Coverage | Tools |
| --- | --- |
| **Activity observation · 28** | Codex CLI, Claude Code, Cursor Agent, Copilot CLI, Gemini CLI, OpenCode, OpenClaw, Hermes Agent & more |
| **Local Token accounting · 7** | Codex, Claude Code, Gemini CLI, Pi, OMP, Kimi Code, OpenCode |
| **Manual native questions** | OpenCode 1.x ≥ 1.18.31 · MiMo Code 0.1.x ≥ 0.1.15 |

All 28 have configuration/event regression coverage. Codex has real multi-agent verification; other clients still need live-session checks. [Compatibility](office/docs/upstream-compatibility.md) · [Coverage](office/docs/monitoring.md#actual-coverage)

<details>
<summary>All 28 observation integrations</summary>

- **Hooks / logs · 21:** Codex CLI, Claude Code, Copilot CLI, Gemini CLI, Antigravity CLI, Cursor Agent, CodeBuddy, Kiro CLI, KiroCrew, Kimi Code, Qwen Code, ZCode, CodeWhale, Qoder, Reasonix, QoderWork, QwenWork, WorkBuddy, TraeCode, Grok Build, MiniMax Code. Codex also observes bounded local session logs.
- **Plugins · 5:** OpenCode, MiMo Code, OpenClaw, Hermes Agent, DeepSeek Harness *(experimental)*.
- **Extensions · 2:** Pi, OMP.

[Authoritative provider registry](agents/registry.js)

</details>

## Get the studio

**macOS 13+ · Apple Silicon / arm64** · Self-contained Electron runtime

1. [Download v0.24.0 DMG or ZIP](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0).
2. Move **AI Mini Office.app** to Applications and open it.
3. Connect your tools; create a fresh event in the original client.

Published v0.24.0 installers retain **AI Mini Office.app**; current source builds **AI Work Space.app**. Locally ad-hoc signed, **not Apple-notarized**; verify release checksums before opening.

<a id="run-from-source"></a>

<details>
<summary>Build from source</summary>

Requires macOS, Node.js 24+ and Xcode Command Line Tools. The app lives in `office/`; root package commands belong to the upstream reference.

```sh
git clone https://github.com/Ye-0413/AI-Office-Workspace.git
cd AI-Office-Workspace
npm --prefix office ci
npm --prefix office test
npm --prefix office start
npm --prefix office run verify:renderer
npm --prefix office run build:mac
```

Builds appear in `dist-mini-office/`. Workshop artwork is included. [Development guide](office/README.md).

</details>

---

**Code:** [AGPL-3.0-only](LICENSE), building on [Clawd on Desk](UPSTREAM-README.md). **Character art:** [All Rights Reserved](office/assets/WORKSHOP-ARTWORK-NOTICE.md). User-supplied character concepts, AI-assisted artwork, project-authored rendering and motion.

[Originality & provenance](ORIGINALITY.md) · [Third-party notices](NOTICE.md) · [App credits](office/UPSTREAM-NOTICE.md) · [Release index](docs/releases/README.md)

Current documentation: English / [简体中文](README.zh-CN.md). Other language READMEs preserve upstream documentation.
