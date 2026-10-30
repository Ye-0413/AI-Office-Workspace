<p align="center">
  <img src="office/assets/studio-icon.png" width="88" alt="AI Work Space 图标">
</p>

<h1 align="center">AI Work Space</h1>
<p align="center"><strong>Observe your agent team collaboration in your spare display</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a></p>
<p align="center">
  <a href="https://github.com/Ye-0413/AI-Office-Workspace/stargazers"><img src="https://img.shields.io/github/stars/Ye-0413/AI-Office-Workspace?style=flat-square&logo=github&label=Stars&labelColor=3C3730&color=8B6E4D" alt="GitHub Star 数量"></a>
  <a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0"><img src="https://img.shields.io/badge/release-v0.24.0-8B6E4D?style=flat-square&labelColor=3C3730" alt="发布版本 v0.24.0"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/macOS-13%2B%20%C2%B7%20arm64-8B6E4D?style=flat-square&labelColor=3C3730" alt="macOS 13 或更新版本，Apple Silicon arm64"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-AGPL--3.0--only-8B6E4D?style=flat-square&labelColor=3C3730" alt="源码许可 AGPL-3.0-only"></a>
</p>
<p align="center">
  <a href="#demo">演示</a> · <a href="#features">功能</a> · <a href="#quick-start">快速开始</a> · <a href="#agent-tools">支持工具</a> · <a href="#companions">原创角色</a> · <a href="#docs">文档</a>
</p>

<a id="demo"></a>

<a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-brand-40s.mp4">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/ai-work-space-preview.jpg">
    <img src="docs/media/ai-work-space-preview.gif" width="1100" alt="点击观看短片：真实工作室中的主 Agent 与同族小分身">
  </picture>
</a>

<p align="center"><strong><a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-brand-40s.mp4">▶ 观看 40 秒品牌短片</a></strong></p>
<p align="center">
  <a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-product-tour-60s.mp4">60 秒 · 功能演示</a> · <a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-social-20s-vertical.mp4">20 秒 · 竖版短片</a> · <a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-loop-12s-silent.mp4">12 秒 · 静音循环</a>
</p>

让 **Codex、Claude Code、Cursor、OpenCode** 的真实会话与分身，住进一间安静的 macOS 工作室。适合 **5 英寸、1280 × 720 副屏**，也可独立窗口使用。

*真实 v0.24.0 录屏，更新品牌包装，中英字幕；图鉴演示已标注。[录制与素材说明](docs/media/README.md)。*

<a id="工作看得见陪伴也有细节"></a>

<a id="features"></a>

## 功能

- **真实协作：** 独立会话、父子关系、小一号分身，11 类活动各有动作。
- **固定大小：** 身体与名字同步调整 65%–135%；人数增加不缩小，落位工作不重叠。
- **⌘K 搜索：** 按名字、任务、工具、项目或 ID 查找，查看详情、定位伙伴。
- **本地用量：** 7 种工具的 Token 日／周统计与模型明细；活动历史可筛选并导出 CSV。
- **数据留在本地：** 无需云账号、API Key 或遥测；连接与支持的原生问答由你操作。
- **安静陪伴：** 减少动态、节能模式、隐藏窗口暂停；可选访客与 12 种伙伴互动。

| ⌘K，找到你的伙伴 | 身体和名字，一起放大 |
| :---: | :---: |
| ![真实 App 的伙伴搜索界面](docs/media/ai-work-space-search.jpg) | ![真实 App 的角色与名字大小设置](docs/media/ai-work-space-sizing.jpg) |

<a id="下载-v0240"></a>

<a id="quick-start"></a>

## 快速开始

| 平台 | 下载 v0.24.0 |
| --- | --- |
| **macOS 13+ · Apple Silicon / arm64** | [DMG](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Mini-Office-0.24.0-arm64.dmg) · [ZIP](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Mini-Office-0.24.0-arm64.zip) · [校验值](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/SHA256SUMS.txt) |

1. 下载 DMG 或 ZIP，运行环境已包含在安装包中。
2. 将 **AI Mini Office.app** 移入「应用程序」并打开。
3. 连接你的工具，再到原工具中开始工作。

v0.24.0 发布包仍名为 **AI Mini Office.app**；新源码构建名为 **AI Work Space.app**。当前采用 ad-hoc 签名，**未经 Apple 公证**；安装前请核对校验值。

<a id="从源码运行"></a>

<details>
<summary>从源码运行 / 构建</summary>

需要 macOS、Node.js 24+、Xcode Command Line Tools。主应用在 `office/`；根 package 属于上游参考项目。

```sh
git clone https://github.com/Ye-0413/AI-Office-Workspace.git
cd AI-Office-Workspace
npm --prefix office ci
npm --prefix office test
npm --prefix office start
npm --prefix office run verify:renderer
npm --prefix office run build:mac
```

产物在 `dist-mini-office/`；原创角色已包含在源码中。[开发与应用指南](office/README.md)。

</details>

<a id="agent-tools"></a>

## 支持哪些 AI 工具？

**28 种工具，一间工作室。**

<table width="100%">
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/codex.svg" align="middle" width="36" height="36" alt="Codex CLI"> &nbsp;<strong>Codex CLI</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/claude-code.svg" align="middle" width="36" height="36" alt="Claude Code"> &nbsp;<strong>Claude Code</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/cursor-agent.svg" align="middle" width="36" height="36" alt="Cursor Agent"> &nbsp;<strong>Cursor Agent</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/copilot-cli.svg" align="middle" width="36" height="36" alt="Copilot CLI"> &nbsp;<strong>Copilot CLI</strong></td>
  </tr>
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/gemini-cli.svg" align="middle" width="36" height="36" alt="Gemini CLI"> &nbsp;<strong>Gemini CLI</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/opencode.svg" align="middle" width="36" height="36" alt="OpenCode"> &nbsp;<strong>OpenCode</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/openclaw.svg" align="middle" width="36" height="36" alt="OpenClaw"> &nbsp;<strong>OpenClaw</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/hermes.svg" align="middle" width="36" height="36" alt="Hermes Agent"> &nbsp;<strong>Hermes Agent</strong></td>
  </tr>
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/kimi-cli.svg" align="middle" width="36" height="36" alt="Kimi Code"> &nbsp;<strong>Kimi Code</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/qwen-code.svg" align="middle" width="36" height="36" alt="Qwen Code"> &nbsp;<strong>Qwen Code</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/mimocode.svg" align="middle" width="36" height="36" alt="MiMo Code"> &nbsp;<strong>MiMo Code</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/minimax.svg" align="middle" width="36" height="36" alt="MiniMax Code"> &nbsp;<strong>MiniMax Code</strong></td>
  </tr>
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/pi.svg" align="middle" width="36" height="36" alt="Pi"> &nbsp;<strong>Pi</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/omp.svg" align="middle" width="36" height="36" alt="OMP"> &nbsp;<strong>OMP</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/codebuddy.svg" align="middle" width="36" height="36" alt="CodeBuddy"> &nbsp;<strong>CodeBuddy</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/traecode.svg" align="middle" width="36" height="36" alt="TraeCode"> &nbsp;<strong>TraeCode</strong></td>
  </tr>
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/kiro-cli.svg" align="middle" width="36" height="36" alt="Kiro CLI"> &nbsp;<strong>Kiro CLI</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/kirocrew.svg" align="middle" width="36" height="36" alt="KiroCrew"> &nbsp;<strong>KiroCrew</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/antigravity-cli.svg" align="middle" width="36" height="36" alt="Antigravity CLI"> &nbsp;<strong>Antigravity CLI</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/qoder.svg" align="middle" width="36" height="36" alt="Qoder"> &nbsp;<strong>Qoder</strong></td>
  </tr>
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/qoderwork.svg" align="middle" width="36" height="36" alt="QoderWork"> &nbsp;<strong>QoderWork</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/qwenwork.svg" align="middle" width="36" height="36" alt="QwenWork"> &nbsp;<strong>QwenWork</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/workbuddy.svg" align="middle" width="36" height="36" alt="WorkBuddy"> &nbsp;<strong>WorkBuddy</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/grok-build.svg" align="middle" width="36" height="36" alt="Grok Build"> &nbsp;<strong>Grok Build</strong></td>
  </tr>
  <tr>
    <td align="left" width="240"><img src="docs/media/tool-icons/codewhale.svg" align="middle" width="36" height="36" alt="CodeWhale"> &nbsp;<strong>CodeWhale</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/zcode.svg" align="middle" width="36" height="36" alt="ZCode"> &nbsp;<strong>ZCode</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/reasonix.svg" align="middle" width="36" height="36" alt="Reasonix"> &nbsp;<strong>Reasonix</strong></td>
    <td align="left" width="240"><img src="docs/media/tool-icons/deepseek-harness.svg" align="middle" width="36" height="36" alt="DeepSeek Harness"> &nbsp;<strong>DeepSeek Harness<sup>*</sup></strong></td>
  </tr>
</table>

28 种适配已有配置与事件回归；Codex 已验证真实多 Agent，其余仍需实机验收。*DeepSeek Harness 为实验性接入。*

<details>
<summary>连接方式、Token 统计与原生问题</summary>

通过 hooks、插件、扩展及支持的本地日志观察活动；可用事件取决于工具与版本。

| 额外能力 | 支持工具 |
| --- | --- |
| **本地 Token 统计 · 7 种** | Codex · Claude Code · Gemini CLI · Pi · OMP · Kimi Code · OpenCode |
| **手动回答原生问题** | OpenCode 1.x ≥ 1.18.31 · MiMo Code 0.1.x ≥ 0.1.15 |

原生回答须由你明确提交；工具审批仍在原客户端完成。[连接说明](office/docs/upstream-compatibility.md) · [用量范围](office/docs/monitoring.md#actual-coverage) · [图标来源](docs/media/tool-icons/README.md)

</details>

<a id="companions"></a>

## 五位伙伴，五种性格

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/animations/workshop-demo.png">
  <img src="docs/animations/workshop-demo.svg" width="1100" alt="纸团、墨豆、苔盒、线团、灯籽各自的材质动作，以及同族小分身">
</picture>

| 纸团 · FOLIO | 墨豆 · INK | 苔盒 · MOSS | 线团 · THREAD | 灯籽 · GLOW |
| :---: | :---: | :---: | :---: | :---: |
| 奶油折纸 | 流动墨滴 | 陶土苔藓 | 珊瑚毛线 | 琥珀暖光 |
| 文案与资料整理 | 编程与排错 | 长任务与维护 | 设计与创意探索 | 协调与提醒 |
| 认真 · 一丝不苟 | 安静 · 行动快 | 沉稳 · 有耐心 | 活泼 · 有巧思 | 温和 · 有分寸 |

**550 套动作 = 5 种角色 × 11 类活动 × 10 个变体。** 以上为性格主题，所有角色均支持全部活动。上图使用合成会话离线演示。[动作图鉴](docs/animations/README.md)。

前五个主 Agent 外观各异，更多主 Agent 使用配色变体。分身继承主身的**外观与配色，体型小一号**。[完整角色故事与家族规则](docs/companions.md)。

<a id="从星台到-33-种日常与节日空间"></a>

## 房间

![真实 App 中的星台房间](docs/media/ai-work-space-observatory.jpg)

从星台，到 **6 间日常＋27 间节日房间**。跟随香港日历、昼夜灯光，也可手动选择；支持中英切换。[逛逛房间 →](docs/rooms/README.md)

<a id="docs"></a>

## 文档导航

| 想了解什么 | 从这里开始 |
| --- | --- |
| 安装、设置与本地数据 | [应用指南](office/README.md) |
| 连接 AI 工具 | [兼容与接入](office/docs/upstream-compatibility.md) |
| 活动、用量与原生问题 | [监测说明](office/docs/monitoring.md) |
| 角色故事与 550 套动作 | [原创角色](docs/companions.md) · [动作图鉴](docs/animations/README.md) |
| 房间与演示素材 | [房间图鉴](docs/rooms/README.md) · [录制说明](docs/media/README.md) |
| 版本变化 | [v0.24.0](docs/releases/release-v0.24.0.md) · [发布记录](docs/releases/README.md) |

## 参与贡献

从[开发指南](office/README.md)开始；提交应用改动前运行 `npm --prefix office test`。

## 许可与致谢

**源码：** [AGPL-3.0-only](LICENSE)，基于 [Clawd on Desk](UPSTREAM-README.md)。**角色美术：** [保留所有权利](office/assets/WORKSHOP-ARTWORK-NOTICE.md)。用户提供角色概念，AI 辅助生成美术，项目编写渲染与动作。

[原创与来源](ORIGINALITY.md) · [第三方声明](NOTICE.md) · [应用致谢](office/UPSTREAM-NOTICE.md) · [发布记录](docs/releases/README.md)

[English](README.md) / 简体中文为本项目文档，其他语言 README 保留上游内容。

## Star 增长趋势

<p align="center">
  <a href="https://www.star-history.com/?repos=Ye-0413%2FAI-Office-Workspace&amp;type=date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Ye-0413/AI-Office-Workspace&amp;type=Date&amp;theme=dark">
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Ye-0413/AI-Office-Workspace&amp;type=Date">
      <img src="https://api.star-history.com/svg?repos=Ye-0413/AI-Office-Workspace&amp;type=Date" width="800" alt="AI Work Space GitHub Star 数量随时间变化的折线图">
    </picture>
  </a>
</p>
