# AI Office Workspace · 小小工作室

一个把真实 AI 活动变成房间日常的 macOS 桌面应用，为 5 英寸、1280 × 720 副屏设计。当前版本 **0.3.1**。

![小小工作室房间背景](office/assets/office-room.jpg)

- 每个独立任务拥有固定昵称；主任务与子 Agent 使用家族颜色、父角色名称及箭头连线。
- 角色根据真实事件翻阅资料、思考、写代码、测试、等待输入，从门口进出。
- 空闲时有装饰访客串门，包含 10 个停留区域、500 条中英双语气泡和随机彩蛋。
- 支持中文／English、晚间灯光、细雨、减少动作和节能观察。
- 工具目录对齐 28 种 Agent；Codex 支持本地日志观察，Hermes Gateway 支持无重启加载观察插件。
- 只观察活动；审批和回答继续在原 AI 工具中完成。

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

0.3.1 本地源码测试 285 项、原生界面检查 28 项通过；另有隔离的 Hermes Python → 打包 ASAR → 活动桥验证。本源码导出新增本地素材准备检查。

28 种工具的隔离事件／配置检查，不等同于 28 种真实客户端都已运行。Codex 已有实际活动观察记录；本机 Hermes Gateway 的 11 个观察钩子已确认加载，下一次真实任务仍需实际使用验收。

更多说明见 [应用文档](office/README.md)。
