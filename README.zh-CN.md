<p align="center">
  <img src="office/assets/studio-icon.png" width="88" alt="AI Office Workspace 工作室图标">
</p>

# AI Office Workspace · 小小工作室

**让真实的 AI 工作，在桌面上有个小小的家。**

折纸读书，墨滴敲键，苔藓慢慢推演，毛线绕过小机关，琥珀里亮着一粒暖光。你的 AI 会话在温暖的房间里各自忙碌，真实身份、父子关系与工作状态依然清楚。

[下载 v0.24.0](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0) · [English](README.md) · [版本说明](docs/releases/release-v0.24.0.md) · [原创与来源声明](ORIGINALITY.md)

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/animations/workshop-demo.png">
  <img src="docs/animations/workshop-demo.svg" width="1100" alt="五只工坊伙伴的公开动画示意">
</picture>

*使用生产动作的原生渲染离线采样，以合成会话安排五位伙伴与同族小分身；不是用户实时任务截图。[静态预览](docs/animations/workshop-demo.png)。*

为 **5 英寸、1280 × 720 副屏**设计，也可以作为普通 macOS 窗口使用。

[![Office quality](https://github.com/Ye-0413/AI-Office-Workspace/actions/workflows/office-quality.yml/badge.svg)](https://github.com/Ye-0413/AI-Office-Workspace/actions/workflows/office-quality.yml)

## 五位伙伴，五种性格

它们有不同的轮廓、材质与动作，不只是换个颜色：

- **纸团 Folio**：奶油白折纸身体，短短的纸脚，耳角和折痕带着认真劲。
- **墨豆 Ink**：低低的深蓝墨滴，一道发亮的眼缝；分身分成墨珠，再融回主身。
- **苔盒 Moss**：稳稳的陶土四足，背着苔藓与小枝，用根须操作叶片工具。
- **线团 Thread**：珊瑚色毛线，一只圈耳、一缕散线，把编织变成工作的小动作。
- **灯籽 Glow**：透明琥珀种子，四只小支脚，内核的暖光沿着不同轨迹移动。

前五个主 Agent 家族使用五种不同的原色造型；更多家族复用造型并获得配色变体。分身继承真实根家族的造型与颜色，体型更小。在场家族不会因别人加入或离开而换外观。角色性格只是视觉设定，不改变 AI 工具的能力与任务分工。

五位角色来自用户提供的概念与参考，使用 AI 辅助生成姿态图，再由项目实现渲染、动作编排与状态连接。[查看中英双语原创声明](ORIGINALITY.md)。

## 550 套动作，让忙碌有细节

**5 位伙伴 × 11 类真实活动 × 每类 10 套动作。** 各自使用符合材质的道具、接触顺序和运动路径：纸张折叠与送入，根须敲打叶片键盘，毛线穿过小机构，暖光沿透明轨道运行。

阅读 · 搜索 · 思考规划 · 编程 · 设计 · 测试 · 构建 · 执行 · 等待工具 · 等待用户 · 异常

编程保持持续输入，构建组装结构，执行表现已启动的运行回路。等待时工具停下来；异常保留卡纸、断路、断根或线结，不假装已经修好。单次工具成功只有轻微、去重的回应；整轮完成需要真实完成证据。

打开 **房间偏好 → 工坊伙伴 → 动作图鉴**，可逐一选择角色、活动与动作，播放或暂停查看。[浏览公开动画预览](docs/animations/README.md)。

## 房间热闹，工作仍有边界

- **真实父子。** 每个独立会话保留自己的 ID。分身从实际父级身上凝聚，走向工位，结束后走回父级；嵌套关系也清楚可查。
- **身体和名字更大。** 手动选择 65%–135% 的固定大小，人数变化不会缩小角色或名牌。移动可以相互穿行，最终工位按完整身体与名牌包络分开。所选大小暂时无法安全入场的新角色会等待空位，真实身份继续保留在名单中。
- **动作懂得休息。** 普通刷新不重播动作，隐藏窗口暂停原来的动画对象与时钟；减少动作和节能模式保留清楚、安静的姿态。
- **每天换个地方。** 六间日常房间、27 间节日房间有不同建筑与布局；「每日新房间」跟随香港日期，手动选择会持续保留。[逛逛房间](docs/rooms/README.md)。
- **抬眼就能看懂。** 用 **⌘K** 搜索伙伴，查看真实关系与活动；使用记录、今日 Token 和本周用量留在本机。[监测范围与限制](office/docs/monitoring.md)。
- **小小的生活感。** 真实到站且空间允许时，家具才会回应；12 种双人互动与可关闭的装饰访客，让房间有日常，不虚构 AI 工作。

## 本地观察，连接由你决定

工作室读取已适配的本机会话日志，以及你选择接入的 hooks／插件事件。无需云端账号、AI API Key 或遥测服务；设置与观察历史保存在应用的本机数据目录。[存储内容与边界](office/README.md#local-data-and-credits)有详细说明。

在 **连接 AI 工具 → 一键初始化** 中明确点击后，才检测并安装或更新本应用拥有的观察配置。目录包含 28 种接入方式，支持范围取决于宿主与版本；配置和事件回归通过不等于所有真实客户端均已验证。工具审批继续在原 AI 工具中处理，装饰动作不会把任务变成成功。

## 下载 v0.24.0

**macOS 13 或更新版本 · Apple Silicon / arm64。** 这是目前可验证的平台。安装包自带 Electron 运行时，使用者无需另装 Node.js 或启动开发服务器。

1. 前往 [v0.24.0 Release 页面](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0)，下载 arm64 DMG 或 ZIP。
2. DMG 中将 **AI Mini Office.app** 拖入「应用程序」；ZIP 解压后将应用移入该目录。
3. 打开应用，连接所用的 AI 工具，并在原工具中产生一次新活动。

当前分发采用本地 ad-hoc 签名，尚未经过 Apple 公证。macOS 可能提示开发者身份未识别；请核对发布来源与校验值，再决定是否打开。项目不要求关闭系统安全防护。

[v0.24.0 更新内容](docs/releases/release-v0.24.0.md) · [发布索引](docs/releases/README.md)

## 从源码运行

主应用在 **`office/`**。根目录的 package 命令属于保留的上游参考项目。开发需要 macOS、Node.js 24+；构建原生辅助程序需要 Xcode Command Line Tools。

```sh
git clone https://github.com/Ye-0413/AI-Office-Workspace.git
cd AI-Office-Workspace
npm --prefix office ci
npm --prefix office test
npm --prefix office start
```

```sh
# 原生渲染冒烟检查
npm --prefix office run verify:renderer
# 生成本地 .app、DMG 与 ZIP
npm --prefix office run build:mac
```

构建产物位于 `dist-mini-office/`。五只工坊伙伴已经包含在公开源码中，不需要还原上游角色素材。只有需要旧素材兼容、且拥有使用权限时，才按[应用说明](office/README.md#公开源码版准备)中的可选流程从本地导入。

## 原创、来源与许可

源码使用 **AGPL-3.0-only**：[LICENSE](LICENSE)。仓库基于并保留 [Clawd on Desk](UPSTREAM-README.md) 的源码、工具注册表和历史，不能把整个仓库称为从零原创。

五只工坊角色、生成场景和应用图标有各自的项目创作记录。角色美术沿用[素材声明](office/assets/WORKSHOP-ARTWORK-NOTICE.md)的 **All Rights Reserved／保留所有权利**；代码开源许可不会自动授予美术开源授权。既有第三方许可与署名继续有效。[原创声明](ORIGINALITY.md) · [第三方通知](NOTICE.md) · [应用来源与致谢](office/UPSTREAM-NOTICE.md)。

仓库内其它语种的 README 是保留的上游参考资料，不代表本次发行的当前翻译。当前项目说明提供本页简体中文与 [English](README.md)。
