# Workshop artwork notice / 工坊角色美术声明

**Project contribution credit / 项目创作署名：AI Work Space contributors** (formerly credited as / 原署名 AI Office Workspace contributors).

This notice accompanies the five workshop characters in AI Work Space (formerly AI Office Workspace / AI Mini Office): **Folio／纸团, Ink／墨豆, Moss／苔盒, Thread／线团 and Glow／灯籽**. It records their creation process and the existing artwork policy. It does not replace the source-code license or grant a new artwork license.

本声明随 AI Work Space（原 AI Office Workspace／AI Mini Office／小小工作室）的五只角色分发：**纸团 Folio、墨豆 Ink、苔盒 Moss、线团 Thread、灯籽 Glow**。它记录创作过程与既有美术政策，不替代源码许可证，也不新增美术授权。

## Pixel style / 像素风

The Pixel style is drawn on an integer grid by `office/scripts/draw-pixel-companions.cjs`. It generates five transparent 3×2 pose atlases (`avatars/workshop-<species>.png`), 55 four-cel activity strips (`avatars/frames/<species>/<activity>.png`) and five nine-cel expression strips (`avatars/pixel-emotes-<species>.png`). The generator defines the character contours, palettes and props directly in code.

像素风由 `office/scripts/draw-pixel-companions.cjs` 在整数像素网格上绘制，生成五张 3×2 透明姿态图集（`avatars/workshop-<species>.png`）、55 条四帧活动帧条（`avatars/frames/<species>/<activity>.png`）和五条九帧表情帧条（`avatars/pixel-emotes-<species>.png`）。角色轮廓、配色与道具由脚本直接定义。

## Painted style / 手绘风

The user supplied the character concepts and visual reference on 2026-10-29. The project used the built-in `image_gen` tool with individual prompts to make six-pose transparent sheets, then implemented their clipping, state selection, family color variants, resource fallback, floor anchoring and motion. The earlier 550 reference performances combine these raster sheets with project-authored SVG props and animation code; the current 55 activity performances use the painted keyframe strips described below.

This is **user-directed, AI-assisted image creation plus project implementation**. The sprites are not represented as entirely hand-drawn. “User-supplied reference” records the source of the creative input; it does not certify ownership or rights in every external reference. Provenance does not guarantee exclusive rights in every generated element or the absence of third-party claims.

用户于 2026-10-29 提供角色概念与视觉参考；项目使用内置 `image_gen` 工具，按各角色提示制作六姿态透明图集，再实现裁剪、状态选择、家族配色、资源备用显示、脚底定位与动作。此前 550 套参考动作将这些位图与项目编写的 SVG 道具、动画代码结合；当前 55 套活动动作使用下述绘制关键帧条。

准确来源为 **用户指导、AI 辅助图像创作与项目实现**，不宣称全部纯手绘。「用户提供参考」记录创意输入的来源，不替其证明全部外部参考的权属；来源记录不保证每个生成元素均有排他权利，也不保证不存在第三方权利主张。

Files covered / 涉及文件：

- `avatars/painted-folio.png`
- `avatars/painted-ink.png`
- `avatars/painted-moss.png`
- `avatars/painted-thread.png`
- `avatars/painted-glow.png`

[Complete prompts and generation method / 完整提示与生成方式](avatars/workshop-prompts.json)

### Keyframe strips / 关键帧条

From 2026-11-04 all five companions’ eleven work/wait/error activities have painted keyframe strips: **55 strips with four keys each, 220 painted keys**. Each strip derives from the corresponding workshop sheet’s idle cell, supplied to the built-in image tool as its identity reference. The tool paints the creature and its main prop together on a flat magenta key colour; `scripts/frame-qa.cjs` removes that colour, registers the keys against the idle reference, measures the result and writes the strip and its registration record. Idle, blinking and other identity poses continue to use the existing atlas. These are the same user-directed, AI-assisted creations as the sheets, under the same policy below. Literal prompts and source records for the expansion, and the earlier pilot’s honestly labeled surviving briefs, are recorded in the prompts file. Measurement exceptions are retained as `waived` entries; acceptance with a recorded exception is not a strict pass or evidence of a human readability test.

自 2026-11-04 起，五位伙伴的十一类工作／等待／异常活动均有绘制关键帧条，共 **55 条、每条四帧、合计 220 个关键帧**。每条以对应工坊图集的待机格作为身份参考，交给内置图像工具，在纯品红抠像底色上一起绘制角色与主道具，再由 `scripts/frame-qa.cjs` 去底色、相对待机图配准、测量，并写出帧条与配准记录。待命、眨眼及其它身份姿态继续使用已有图集。帧条与图集同属用户指导、AI 辅助创作，适用下文同一政策；此次扩展的逐字提示与来源记录，以及较早试点中明确标注为摘要的存续简述，保存在提示文件中。测量例外保留于 `waived` 字段；带例外接受不等于严格通过，也不证明已经做过人工可读性测试。

Published painted frames / 随应用分发的手绘帧条：`avatars/painted-frames/<species>/<activity>.png`. Species / 物种：`folio`, `ink`, `moss`, `thread`, `glow`. Activities / 活动：`reading`, `searching`, `planning`, `coding`, `designing`, `testing`, `building`, `running`, `waiting-tool`, `waiting-user`, `error`. The runtime manifest (`renderer/painted-creature-frame-manifest.js`) and package file list enumerate the exact 55 files. The generation records preserve the artwork paths used at creation. / 运行时清单（`renderer/painted-creature-frame-manifest.js`）与打包文件表逐项列出这 55 个文件，生成记录保留创作时使用的素材路径。

Both companion styles use project artwork independent of restored upstream Clawd or Calico sprites. Character names and material personalities are decorative, without changing provider abilities or proving a real task result. This notice does not authorize use of any third-party trademark or character.

两种伙伴风格均使用项目独立素材，与本地还原的上游 Clawd 或 Calico 角色图分开。名称与材质性格属于装饰，不改变工具能力，也不证明真实任务结果。本声明不授予任何第三方商标或角色的使用权。

## Rights retained / 权利保留

**All Rights Reserved.** The existing artwork policy remains in force; the source-code license does not grant an open license to these character images. This notice grants no additional standalone permission to copy, modify, redistribute or commercially reuse the workshop sheets or character artwork. Rights remain with the respective holders. Asset-specific third-party license exceptions stated in the [existing artwork notice](ORIGINAL-ARTWORK-LICENSE.txt) are unchanged.

The app's source code remains **AGPL-3.0-only** under its [LICENSE](../LICENSE). Animation and rendering source retain that code license; including or inspecting a PNG does not relicense the image. Restricted upstream artwork has separate restrictions and is not made redistributable by a local restoration script.

**All Rights Reserved／保留所有权利。** 既有美术政策继续有效；源码许可证不向这些角色图片授予开源美术许可。本声明不另行授予独立复制、修改、再分发或商业复用图集及角色美术的权限，权利由各自权利人保留。[既有素材声明](ORIGINAL-ARTWORK-LICENSE.txt)中已明确列出的个别第三方素材许可例外维持原样。

应用源码继续适用 [LICENSE](../LICENSE) 的 **AGPL-3.0-only**。动画与渲染源码保留该代码许可；图片随源码出现或可供查看，不会使图片自动改用代码许可证。受限上游角色另有约束，本地还原脚本不会授予其再分发权限。

## Credits and project record / 署名与项目记录

AI Work Space preserves and adapts Clawd on Desk foundations and third-party contributions. See the packaged [upstream notices](../UPSTREAM-NOTICE.md), including the CC Switch attribution. This project-specific notice is not a claim that the whole repository is original.

AI Work Space 保留并改编 Clawd on Desk 基础与第三方贡献；详见随应用提供的[上游与第三方声明](../UPSTREAM-NOTICE.md)，其中包含 CC Switch 署名。本项目美术声明不表示整个仓库均为原创。

[Full project originality statement / 项目整体原创声明](https://github.com/Ye-0413/AI-Office-Workspace/blob/main/ORIGINALITY.md) · [Project home / 项目首页](https://github.com/Ye-0413/AI-Office-Workspace)
