# Originality, provenance & rights / 原创、来源与权利声明

This statement describes the project-specific creative work in **AI Office Workspace / AI Mini Office** and the material it builds on. It records provenance; it does not claim that the entire repository was written or drawn from scratch, or replace any existing license or notice.

本声明说明 **AI Office Workspace／小小工作室** 的项目创作与所沿用的材料，用于记录来源；不宣称整个仓库的代码或美术均从零创作，也不替代既有许可证及第三方声明。

## Five workshop companions / 五只工坊伙伴

Folio／纸团、Ink／墨豆、Moss／苔盒、Thread／线团 and Glow／灯籽 are credited to **AI Office Workspace contributors**, with **user-supplied concepts + AI-assisted image generation + project implementation**. The five materials and visual reference came from the user; this provenance does not certify the rights in every external reference.

The self-contained [Workshop artwork notice](office/assets/WORKSHOP-ARTWORK-NOTICE.md) ships with the app and is the authoritative project record for these five characters' creation and retained rights. It links the exact prompts and explains the separation between raster artwork and AGPL rendering/motion code. This page refers to that record rather than duplicating it.

五只工坊伙伴署名 **AI Office Workspace contributors**，准确来源为 **用户概念＋AI 辅助图像生成＋项目实现**。五种材质与视觉参考由用户提供；该来源记录不替全部外部参考证明权属。

可随应用独立分发的[工坊角色美术声明](office/assets/WORKSHOP-ARTWORK-NOTICE.md)是这五只角色的项目创作与保留权利记录，内含完整提示及位图美术与 AGPL 渲染／动作代码的边界。本页引用该记录，避免复制后出现版本不一致。

## Environments and icon / 场景与图标

The office background and application icon were generated for this project with the built-in image tool. The two additional base interiors and 43 complete seasonal workshop paintings use documented reference-based generation. The 33 distinct room designs use generation without reference images, followed by project-authored furniture, floor and navigation geometry. These different workflows are preserved rather than described collectively as hand-painted assets.

工作室背景与应用图标使用内置图像工具为本项目生成。另两种基础室内场景及 43 幅完整节令工坊画面保留了基于参考图的生成记录；33 种独立房间采用不带参考图的生成流程，之后由项目编写家具、地面及导航几何。各自流程均保留记录，不统一宣称为人工逐笔绘制。

- [Original office prompt / 工作室背景提示](office/docs/office-art-prompt.txt)
- [Base interior provenance / 基础室内来源](office/assets/scenes/generation.json)
- [Seasonal painting provenance / 节令画面来源](office/assets/scenes/themes/generation.json)
- [Independent room provenance, prompts and hashes / 独立房间来源、提示与摘要](office/assets/scenes/rooms/generation.json)
- [Application icon prompt / 应用图标提示](office/docs/studio-icon-prompt.txt)

## Upstream and third parties / 上游与第三方

This repository retains and adapts **Clawd on Desk** source, provider definitions, hooks, documentation and history. The app in `office/` is a project-specific implementation built with those foundations, Electron and other dependencies. Its local usage monitoring also adapts mechanisms credited to **CC Switch**. Existing artwork, icons, sounds and other third-party materials keep their own attribution and license terms. The project does not claim ownership of Anthropic's Clawd, provider trademarks or third-party contributions.

本仓库保留并改编 **Clawd on Desk** 的源码、工具定义、hooks、文档与历史。`office/` 是在这些基础、Electron 及其它依赖之上实现的本项目应用；本地用量监测也沿用了已署名的 **CC Switch** 机制。既有美术、图标、声音等第三方材料继续适用各自署名与许可；本项目不主张拥有 Anthropic 的 Clawd、工具品牌或第三方贡献。

[Upstream project reference / 上游项目参考](UPSTREAM-README.md) · [Repository notices / 仓库声明](NOTICE.md) · [App upstream notices, including CC Switch / 应用上游声明](office/UPSTREAM-NOTICE.md)

## License boundary / 许可边界

Source code remains **AGPL-3.0-only** under [LICENSE](LICENSE), with preserved third-party notices. The five characters' **All Rights Reserved** policy and exact artwork/code boundary are recorded in the [Workshop artwork notice](office/assets/WORKSHOP-ARTWORK-NOTICE.md); this page grants no additional artwork license. Restricted upstream characters remain subject to their [separate artwork notice](office/assets/ORIGINAL-ARTWORK-LICENSE.txt), including its explicit asset-specific exceptions. An authorized local restoration procedure does not confer redistribution rights.

源码继续适用 [LICENSE](LICENSE) 的 **AGPL-3.0-only**，并保留第三方声明。五只角色的 **All Rights Reserved／保留所有权利**政策及美术／代码边界，统一以[工坊角色美术声明](office/assets/WORKSHOP-ARTWORK-NOTICE.md)记录；本页不新增美术授权。受限上游角色继续适用其[独立素材声明](office/assets/ORIGINAL-ARTWORK-LICENSE.txt)及明确列出的个别素材许可例外。授权本地还原流程不赋予再分发权限。

[Project home / 项目首页](README.md) · [简体中文](README.zh-CN.md) · [v0.24.0](docs/releases/release-v0.24.0.md)
