# AI Office Workspace · 小小工作室

一个把真实 AI 活动变成房间日常的 macOS 桌面应用，为 5 英寸、1280 × 720 副屏设计。当前版本 **0.8.1**。

[![Office quality](https://github.com/Ye-0413/AI-Office-Workspace/actions/workflows/office-quality.yml/badge.svg)](https://github.com/Ye-0413/AI-Office-Workspace/actions/workflows/office-quality.yml)

## 当前动画 · 11 类 × 8 种 = 88 种

阅读、搜索、思考规划、写代码、设计、测试、构建、命令执行、等待工具、等待用户与异常排查，每类都有八套不同的关节动作和工作道具。下面同时播放每类的一个例子。

![当前 11 类活动动画同步预览](docs/animations/overview.gif)

**[查看全部 88 种动画 GIF 图鉴 →](docs/animations/README.md)** · [静态总览](docs/animations/overview.png)

公开预览使用原创示意角色，播放应用当前的关节动画与道具；此处不展示受限角色外观。图集为离线演示，不代表真实任务或工具结果。图集同步为 12 秒循环，应用保留实际动作节奏；同类动作按约 18–24 秒可见工作时间轮换，翻页或换房间后继续累计。

- 多个 Codex session 分别显示独立主 Agent，家族身体颜色、组号与真实父子连线帮助辨识。
- 中文昵称取意于神话、山海、星宿与文房；英文界面使用独立英文昵称。
- 只有主 Agent 从门口进入；新分身从主 Agent 出现，结束后归位并显示「结束分身。」。
- Agent 与名牌可在 65%–135% 间缩放，自动安排间距；拥堵时排队、让位并回到原工位。
- 场景跟随香港的一天，木窗与门窗同步变化；时钟显示时间、完整日期和星期，旁边统计今日已观察到的活跃 Agent。
- 支持中文／English、细雨、减少动作和节能观察；空闲访客有 10 个区域与 500 条中英双语气泡。
- 工具目录对齐 28 种 Agent；只观察活动，审批和回答继续在原 AI 工具中完成。

<details>
<summary>查看工作室场景背景</summary>

![小小工作室房间背景](office/assets/office-room.jpg)

</details>

## 运行与构建

主应用位于 `office/`。根目录的 `agents/`、`hooks/`、`src/` 等保留为集成注册表与参考源码；请从 `office/` 运行应用。

需要 macOS 13+ 和 Node.js 24+，本地验证目标为 Apple Silicon。

```sh
git clone https://github.com/Ye-0413/AI-Office-Workspace.git
cd AI-Office-Workspace/office
npm ci

# 从你本地、已取得使用权限的原项目目录准备角色素材。
node scripts/prepare-local-artwork.cjs --from /absolute/path/to/original-project

npm test
npm start
# 生成本地 .app、DMG 和 ZIP：
npm run build:mac
```

素材准备脚本不会联网；它核对固定版本的 50 个 SVG 和图标的 SHA-256，然后仅写入本项目的本地素材目录。原素材来自 [原项目](https://github.com/rullerzhou-afk/clawd-on-desk)，对应版本 `c52e2df6ff778bf85310166882c516385f2f6eab`。

构建产物位于 `dist-mini-office/`。安装包包含 Electron／Node 运行时，安装后无需开发服务器。

## 素材与许可

代码使用 **AGPL-3.0-only**，详见 [LICENSE](LICENSE)。代码许可不覆盖原角色素材；原素材声明保留所有权利并限制再分发，详见 [素材许可](office/assets/ORIGINAL-ARTWORK-LICENSE.txt)。公开源码不包含这些受限素材，也不发布含有这些素材的安装包；拥有相应权限后才能使用或分发。生成的房间背景及其原始提示随 `office/assets/` 和 `office/docs/` 保留。

原项目的代码、集成注册表和相关通知保留用于溯源，见 [第三方通知](office/UPSTREAM-NOTICE.md) 与 [参考项目说明](UPSTREAM-README.md)。

## 验证与边界

Office quality 在每次 main 推送与 PR 上运行自动测试及原生观察锁检查。动画图鉴核对全部 88 种真实程序、GIF 动画帧与源码一致性；原生窗口检查覆盖动作、翻页续播、分身、避让、时钟日期及中英文界面。公开源码检查无需还原角色素材。

28 种工具的隔离事件／配置检查，不等同于 28 种真实客户端都已运行。Codex 已有实际活动观察记录；本机 Hermes Gateway 的 11 个观察钩子已确认加载，下一次真实任务仍需实际使用验收。

更多说明见 [应用文档](office/README.md)。
