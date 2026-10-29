# 实拍宣传片工作流 / Actual-app promo workflow

这里保存真实 App 窗口录制、原创程序配乐与剪辑脚本。所有命令从仓库根目录运行。

This directory contains the real-window recorder, project-authored music generator and manifest-driven film editor. Run the commands below from the repository root.

本文记录可重复的制作流程。实际交付版本、成片时长与 QA 结果，以 `dist-mini-office/promo/` 下的本机交付清单及对应检查报告为准。

This guide documents the reproducible workflow. Consult the local handoff checklist and review reports under `dist-mini-office/promo/` for delivered versions, encoded durations and QA results.

## 真实画面与演示范围 / What the footage shows

- 使用 ScreenCaptureKit 的独立窗口采集，当前原始窗口约 **1236×690、30 fps**；通过 CUA 在实际 App 中点击、输入和选择。录制器不控制 UI，剪辑器不绘制模拟界面或假指针操作。
- 房间中是真实观察到的主 Agent **Moss／苔盒**及其真实小分身。其它角色和指定状态来自 App 自己的**动作图鉴**，必须保留「演示 / Demonstration」标注，不把它们描述为正在执行的真实任务。没有为录片伪造 AI 消息或审批。
- 横版 **1920×1080**、竖版 **1080×1920** 是后期设计画布；不是原生 1080p 录屏。裁切、缩放、画布、标题和转场属于剪辑层，不改变角色关系、状态或工具结果。

Capture uses ScreenCaptureKit's desktop-independent window filter. CUA performs genuine interactions in the installed App; neither script fabricates interface activity. The live family is an observed Moss main agent and its real helpers. Other characters and selected activities are labelled motion-gallery demonstrations. No AI messages or approvals were fabricated for filming. The 1080p delivery dimensions describe the **editorial canvas**, not the source capture resolution.

角色素材的创作与分发范围见[工坊角色声明](../../assets/WORKSHOP-ARTWORK-NOTICE.md)。本片里的动作表示观察状态或图鉴演示，不表示任务进度、测试通过或自动修复。

Character provenance is documented in the [workshop artwork notice](../../assets/WORKSHOP-ARTWORK-NOTICE.md). A performance depicts an observed activity or a labelled specimen; it does not establish progress, a passing test or a repaired error.

## 目录与公开边界 / Files and publication boundary

仓库内的可编辑源码：

- [record-window.swift](record-window.swift)：只录所选真实窗口，视频无系统声音或麦克风。
- [synthesize-workshop-music.py](synthesize-workshop-music.py)：原创编曲与程序合成；不读取外部音频样本、下载音乐或调用生成服务。
- [render-films.py](render-films.py)：根据显式清单裁切真实素材、遮隐指定用量区域、排双语字幕、合成音乐并输出报告。

Tracked source consists of these three scripts and this guide. The recorder produces silent source video; music is synthesized separately from a project-authored score, without external samples, recordings or downloaded tracks.

本机工作目录为 `dist-mini-office/promo/`，整个 `dist-mini-office/` 已被 Git 忽略：

```text
dist-mini-office/promo/
  raw/                      PRIVATE: original MOVs, capture logs, raw QA stills
  audio/                    generated WAV and its provenance/measurement JSON
  film-manifest.json        editable shot decisions, relative source paths
  films/                    candidate MP4s, subtitles, posters and render reports
    .render-cache/          local intermediate footage and canvas assets
```

**`raw/` 含私人用量，不得发布、提交或随素材包上传。** 捕获 JSON、原始 QA 截图和缓存也不应随整个目录打包。公开输出须避开用量面板或经遮隐，并逐镜确认；当前脚本只处理固定的用量矩形，不能自动识别其它私人标题、事件、路径或 ID。

**Raw recordings contain private usage figures and must remain local.** Do not publish capture logs, raw QA stills, caches or a blanket archive of this working directory. Review every public shot. The editor masks one specified usage rectangle; it is not a general personal-information detector.

公开交付应只选择已经审阅的 MP4、封面、中文字幕、英文字幕和双语字幕。剪辑清单与程序配乐可另行提供可公开副本；JSON 报告可能含本机绝对路径，须先清理。再剪辑可使用审核后的成片或另行输出并检查过的遮隐镜头；**“可再剪辑”不等于公开未遮隐原片**。

Publish only approved films, posters and subtitle files. A sanitized edit manifest and the generated soundtrack may accompany them. Reports can contain machine-specific paths, so review them before sharing. Recut from approved films or separately reviewed, sanitized takes; editability does not require releasing private originals.

## 环境 / Requirements

- 录制器：**macOS 14+**、Xcode Command Line Tools / `swiftc`、系统录屏授权。这是拍摄辅助程序的要求，不是对 App 最低系统版本的修改。
- 剪辑：Python 3、Pillow、`ffmpeg`（含 `libx264`）及 `ffprobe`。当前排版使用 macOS 的 Hiragino Sans GB 和 Avenir Next 字体。
- 配乐：Python 3、NumPy；`ffmpeg` 用于响度分析。

Recording requires macOS 14+, Swift tooling and the real macOS screen-capture permission. Editing requires Python 3, Pillow, ffmpeg/libx264 and ffprobe. Music generation uses NumPy. The current caption layout uses the named macOS system fonts.

## 1. 编译与真实窗口录制 / Build and record a real window

```sh
swiftc -parse-as-library office/scripts/promo/record-window.swift -o /tmp/office-record-window
/tmp/office-record-window list
mkdir -p dist-mini-office/promo/raw
```

`list` 返回实际窗口 ID、所属 App、标题及窗口点尺寸。选择当前工作室窗口的 ID；窗口重建后需重新查询。系统授权通过真正的 macOS 界面处理，不通过改数据库绕过。

`list` reports actual on-screen window IDs. Choose the studio window and list again if it is recreated. Handle any recording permission through the real macOS UI.

下面的 `12345` 是占位 ID，需替换。录制器拒绝覆盖已有文件；重拍时使用新的 take 文件名，并在清单中更新路径。保持原生窗口可用，录制期间用 CUA 操作实际 App，不通过 DOM 注入或模拟页面重建 UI。

Replace the example ID. Existing files are never overwritten by the recorder: use a new take name and update the manifest. Perform the desired actions through CUA in the real App while capture runs.

```sh
PROMO_WINDOW_ID=12345
/tmp/office-record-window record --window-id "$PROMO_WINDOW_ID" --output dist-mini-office/promo/raw/gallery.mov --duration 180 --fps 30 --cursor yes --codec h264 --max-width 1236
/tmp/office-record-window record --window-id "$PROMO_WINDOW_ID" --output dist-mini-office/promo/raw/studio.mov --duration 240 --fps 30 --cursor yes --codec h264 --max-width 1236
/tmp/office-record-window record --window-id "$PROMO_WINDOW_ID" --output dist-mini-office/promo/raw/preferences.mov --duration 120 --fps 30 --cursor yes --codec h264 --max-width 1236
```

参数：`--duration` 大于 0 且不超过 600 秒；`--fps` 为 24、30 或 60；`--cursor yes|no`；`--codec h264|prores`；`--max-width` 仅限制采集宽度，不放大源窗口，尺寸随窗口实际比例确定。输出可为 MOV 或 MP4；ProRes 必须使用 MOV。录制不包含桌面其它窗口、系统声音或麦克风。

The optional width cap never upscales the source. Geometry follows the selected window's real content and pixel scale. ProRes requires MOV. Capture is limited to that window, with no system or microphone audio.

完成时 stdout 输出 JSON，包括尺寸、帧率、帧数、实际编码时长、`completeCaptureFrames` 与 `heldOutputFrames`。固定输出帧率可能重用最近一帧；**30 fps 文件不等于 App 每秒生成了 30 个不同画面**。这些本机报告留在私有工作目录。

The completion JSON records capture geometry, encoded duration and held frames. Constant-rate output may reuse the latest captured frame; the container frame rate is not an application-performance claim. Keep these machine-local logs private.

## 2. 生成原创程序配乐 / Generate the original instrumental bed

```sh
python3 office/scripts/promo/synthesize-workshop-music.py --duration 70 --bpm 90 --sample-rate 48000 --seed 20261029 --output dist-mini-office/promo/audio/workshop-warm-90bpm-70s.wav
```

默认参数即 70 秒、90 BPM、48 kHz、立体声 24-bit PCM。可选时长 20–180 秒、速度 75–105 BPM、采样率 44100 或 48000；`--seed` 记录确定的随机种子。WAV 旁生成同名 JSON，记录编曲、来源、参数、SHA-256 与测量结果，便于复现与再剪辑。

Defaults are 70 seconds, 90 BPM, 48 kHz stereo, 24-bit PCM. The adjacent JSON documents the project-authored arrangement, seed, parameters, file hash and measurements.

原始录屏是静音的。配乐在后期加入；12 秒 GitHub 循环不加音轨。当前剪辑器对有声版本以 −19 LUFS 为目标归一化并加片尾淡出，最终声音仍须试听与核验，不能仅凭目标值声明已达标。

Music is added in post. The GitHub loop has no audio stream. The editor targets −19 LUFS and applies a tail fade to music-backed cuts; listen to and measure the actual result before certifying it.

## 3. 清单与剪辑 / Manifest and editing

本机清单为 `dist-mini-office/promo/film-manifest.json`，默认包含四种**双语画布**剪辑配置：

- `brand`：约 40 秒，1920×1080，`films/01-brand-film-40s.mp4`。
- `walkthrough`：约 60 秒，1920×1080，`films/02-product-tour-60s.mp4`。
- `portrait`：约 20 秒，1080×1920，`films/03-social-teaser-20s-vertical.mp4`。
- `github-loop`：约 12 秒，1920×1080，静音循环，`films/04-github-loop-12s-silent.mp4`。

These dimensions and nominal durations describe the edit profiles. The canvas carries Chinese and English; separate Chinese, English and bilingual SRT files are also generated. Separate language-only films require explicit additional manifest versions.

```sh
python3 office/scripts/promo/render-films.py dist-mini-office/promo/film-manifest.json
python3 office/scripts/promo/render-films.py dist-mini-office/promo/film-manifest.json --only brand
python3 office/scripts/promo/render-films.py dist-mini-office/promo/film-manifest.json --only walkthrough --force
```

`--only` 按 `id` 选择一版；`--force` 重做中间镜头，否则使用由源文件、字体及脚本等摘要验证的缓存。后期编码会替换清单指定的成片路径；它不会覆盖原始录制。输入、配乐和输出的相对路径均以**清单所在目录**为基准。

`--only` selects one version ID. `--force` rebuilds intermediate renders instead of using validated caches. Final encoding replaces the specified film output, not the raw take. Relative paths resolve against the **manifest directory**.

最小清单示例 / Minimal manifest:

```json
{
  "music": "audio/workshop-warm-90bpm-70s.wav",
  "versions": [{
    "id": "example",
    "width": 1920,
    "height": 1080,
    "output": "films/example.mp4",
    "title": {"zh": "AI Work Space", "en": "Observe your agent team collaboration in your spare display"},
    "shots": [{
      "source": "raw/studio.mov",
      "start": 3,
      "duration": 5,
      "layout": "room",
      "crop": [0, 0.24, 1, 0.7],
      "zh": "给工作，留一间小房间。",
      "en": "A little room for your work.",
      "eyebrow": "ACTUAL APP CAPTURE"
    }]
  }]
}
```

清单字段 / Manifest contract:

- `source`、`start`、`duration`：真实源片、起始秒数和镜头长度。起点非负，镜头至少 0.8 秒；长度对齐当前 30 fps 编码帧网格。
- `crop`：相对**原始录屏**的 `[x, y, width, height]`，范围 0–1；不是输出画布坐标。改变裁切后重新确认私人区域是否入镜。
- `layout`：当前可用 `room`、`full`、`panel`、`close`、`end`，仅选择后期构图模板。
- `zh`、`en`、`eyebrow`：镜头的中英标题和小标题；`title` 提供默认文案。图鉴镜头使用 `captionZh`、`captionEn` 明确标示演示，例如「真实 App 动作图鉴 · 演示 / Actual motion gallery capture · Demonstration」。
- `silent: true`：无音轨；否则使用版本或顶层指定的 `music`。
- `loop: true`：当前仅支持**一个镜头且静音**，对真实源片首尾作 0.5 秒叠化。要得到约 12 秒循环，当前清单取 12.5 秒源片。这是剪辑接缝处理，不是 App 的原生循环保证。
- `posterTime`：可选封面时间，默认约为成片 40% 处。
- `testOnly: true`：测试素材必须显式标注，避免试片被当作正式真实 App 宣传片。

Crop coordinates address the original source. Layout templates and captions are editorial additions, never replacement UI. For gallery footage, keep explicit demonstration captions. The optional loop is a silent, single-shot edit with a half-second tail/head blend.

普通多镜头版本当前每处叠化为 0.35 秒，因此成片长度不是镜头长度的简单相加。当前编码目标是 30 fps、H.264、`yuv420p`、CRF 18、fast-start MP4；有声版另有 AAC 立体声音轨。以最终 `ffprobe` 信息确认实际输出。

Multi-shot durations account for 0.35-second overlaps. The present encoder settings target 30 fps H.264/yuv420p MP4 with fast-start and, where applicable, AAC stereo. Confirm the actual geometry, duration, frame count and audio streams from the encoded file.

用量遮隐目前使用源画面中的归一化矩形 `[0.28, 0.08, 0.19, 0.15]`：`full` 镜头或裁切与该区域相交时，先对原始画面中的该块作 7×4 像素马赛克，再裁切与缩放。其余安全镜头避开这块区域。若窗口布局、比例或用量面板位置改变，必须重新确认遮隐区域，不能沿用旧坐标作隐私保证。

The current mask is a fixed normalized usage rectangle, applied before crop/scale when required. It does not certify arbitrary future window layouts. Recheck its coverage whenever framing or UI geometry changes.

## 4. 输出、复核与交付 / Outputs, review and handoff

每个候选 MP4 旁产生：

- `.zh.srt`、`.en.srt`、`.bilingual.srt`；
- `.poster.jpg`；
- `.ffprobe.json`；
- `.render.json`：源片与脚本摘要、取片区间、裁切、遮隐、时长、帧数、字幕、配乐和循环参数。

The sidecars make the edit inspectable and repeatable. A `testOnly: false` flag or a successful render report records a script setting; it does not replace visual review or prove that a source was genuinely captured.

交付前逐项确认实际成片：四版的时长与尺寸；文字和 UI 不裁切；图鉴演示标识；真实主/分身关系；私人用量及其它敏感内容不暴露；字幕可读；有声版本的音轨与结尾；静音版确实无音轨；循环首尾没有明显跳变。确认后再填写正式交付清单和发布链接，本文不预填「已通过」。

Before release, review the actual encoded films for geometry and timing, readable captions, unclipped UI, gallery labels, truthful family relationships, private-data coverage, audio and ending, and the silent loop boundary. Record the results in the final handoff; this guide intentionally does not mark them as passed.

仅把经审阅的公开文件加入交付包。保留私有原片和本机清单，后续可通过修改镜头区间、裁切、字幕与音乐重新剪辑；不要为便于交付而把 `raw/` 或整个 `dist-mini-office/promo/` 一起打包。

Package an explicit allowlist of approved public files. Keep the private originals and local manifest for later editing; do not bundle `raw/` or the entire working directory.
