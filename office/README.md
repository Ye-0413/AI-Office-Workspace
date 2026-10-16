# AI Mini Office / 小小工作室

A local macOS playground for watching independent AI sessions inhabit a tiny office. Designed for a five-inch 1280×720 secondary display.

## 公开源码版准备

公开仓库不含受限角色素材和原图标。先运行 `npm ci`，再执行 `node scripts/prepare-local-artwork.cjs --from /absolute/path/to/original-project`，核验并导入你有权使用的本地素材。随后运行测试、启动或构建。

## 本地体验

打开构建产物中的 **AI Mini Office.app**；使用 DMG 时先将应用拖进「应用程序」，再打开并连接 AI 工具。应用只有「实时观察」，只读观察最近的本地 Codex 会话；每个独立 session 是一个角色，子 Agent 来自真实父子关系。空房间不会自动生成模拟任务。

没有伙伴在场时，初始界面只展示完整的空工作室和右上角控制区。连接与偏好从右上角打开为木框纸色面板；语言切换也在同一区域。历史闲置任务不会触发中央欢迎卡片。真实伙伴全部离场、空闲 8 秒后，会有一位明确标记的装饰访客来串门：在 10 个角落随机停留，翻书、喝咖啡、看看植物，偶尔变个小魔术。500 条独立撰写的中英双语气泡按区域轮换，真实工作出现即让路；逛约两分半后离开，过一会儿再来。可在右上角偏好中关闭「闲时串门」。访客不会加入任务数、伙伴列表或真实事件记录。

每个任务 ID 对应固定的一对中英文昵称；中文界面显示中文昵称，英文界面显示英文昵称，切换语言不会改变真实会话身份。任务描述变化、重新入场和重启不改变昵称映射。只有独立主 Agent 从门口入场；新分身从所属主 Agent 身体位置出现，结束后走回主 Agent 并显示「结束分身。」。嵌套分身保留实际父子连线，统一回到所属主 Agent；主 Agent 会等分身归位后离开。缺少可见主 Agent 时使用已知父级或原地过渡，不虚构门口入场。

Codex 的线程 UUID 与每轮 ID 分开识别，子 Agent 日志中复制的父会话历史不会覆盖角色身份。Thinking 期间保持同一个循环动画；短暂工具调用的过期路线会取消，目的地稳定后再起身行走。Codex 脚本中包装的修改、命令、测试也会识别；在刷新间隔内已结束的真实工具动作，会在原地短暂呈现「刚刚在改代码」等有依据的动作，不触发来回奔走。主任务与各级子任务使用同色铭牌、持续可见的箭头连线和父角色名称；伙伴列表按树形排列，点击详情中的父角色可直接定位。

继续几周前创建的 Codex 对话时，活动仍写入原始日期目录。观察器会分批扫描历史目录，重新打开工作室也能发现最近恢复的旧会话；不会把创建日期当成活跃日期。默认「全部项目」总览同时展示不同项目的独立主 Agent，同一个 Codex 下的会话保持独立。每页最多五个主 Agent，分页按完整身份保持稳定，活动刷新不会把角色挤到别页。仍可主动筛选某个项目；其它项目存在主 Agent 时，可用「查看全部」入口返回总览。伙伴列表选择角色也保留总览和实际家族关系。

在房间设置中选择 1280×720 副屏，再通过原生窗口绿色按钮进入全屏。角色会根据实际状态前往书架、白板、工位、测试区，并在同一活动中经历不同的动作段落。动作导演使用 26 种素材，结合实际并行工具数量、子 Agent 和工具结果产生反应；没有结果时不会假装成功。

右上角 **EN / 中文** 切换界面语言，并保存到本机。昵称随界面语言切换；任务原文、项目名称和 ID 保持原样。

「连接」面板可搜索并接入 28 种工具，包括 Hermes Agent。工具目录在测试时检查、构建时从项目工具注册表同步；事件适配、普通 hooks、插件及特殊配置分别处理。只有点击「连接」才会安装该工具的被动观察入口；「移除配置」只卸载本应用拥有的部分。工具审批继续由原工具处理。接入后需要在相应工具中产生新事件；Hermes 会核验本机 Gateway 并热加载 11 个观察钩子，已经启用的插件也可通过「重新加载」重新接入，通常无需重启 Gateway。未确认热加载时会明确提示；其他插件可能需要新会话或手动重启宿主，应用不会自动重启 AI。移除 Codex hooks 后，本地只读观察仍可继续。

28 种接入方式已做隔离配置和事件回归检查；这不表示 28 种真实客户端都已运行。Codex 已验证真实多 Agent 日志到角色显示，其他客户端仍需实际会话验收。各工具的宿主版本、配置路径与已知边界见 `docs/upstream-compatibility.md`。KiroCrew 的网关、目录和配置锁使用随应用打包的 macOS 原生小程序，无需额外 Python。

房间默认跟随香港时间，晨曦、上午、午后、日落和夜晚使用连续的天色与室内灯光。左侧木窗与门上的玻璃都能看见海港剪影，慢云、渡轮、城市灯与海面反光保持在窗内。香港时钟放在白板下的木柜上，数字为 34px，挂钟指针也与真实香港时间同步。点击柜上的时钟可预览时段，再用「回到此刻」恢复实时；预览期间时钟仍显示真实香港时间。减少动作、节能和隐藏窗口都会暂停装饰循环，不改变真实任务状态。

海港昵称提供 8,192 种固定双语组合，自动跟随界面语言，不再需要单独选择昵称风格。每个身份还有固定的小性格、纪念物和问候，任务详情保留原始标题与 ID。「打个招呼」只触发工作室里的回应。主 Agent 下方显示「分身 X 活跃 · 累计 Y」；累计按完整身份去重，包含本次观察中已经结束的分身，跨房间切换仍保留。真实子任务本轮完成也会收回身体，保留仍开放的底层会话；同一身份接到新工作后重新分身，累计不重复增加。普通闲置、失联、缺少快照都不会被当成已结束；新工作可以中断归位。

观察日志轮换时会先按文件身份排空保留文件的未读尾部，再读取新文件；每轮仍最多读取 64 KiB。损坏行和不同文件的 JSON 碎片会被隔离。GitHub 的 Office quality 工作流在 main 推送和 PR 上安装锁定依赖、重建原生锁并运行回归测试；公开源码检查无需还原角色素材。

头像覆盖十一种真实活动，提供 31 套原创关节动作：思考与规划四套；阅读、搜索、写代码、设计、测试、构建、命令执行各三套；等待工具、等待用户及错误各两套。托腮思考、转笔、审视规划图与挠头，连续打字、指向代码与停下来审阅，观察终端、记录运行信息与操作键盘使用不同的道具和眼手脚编排。同一活动按约 18–24 秒可见工作时间自然轮换，普通事件刷新不会重启动作；姿态与道具切换使用短暂衔接，工具结果和生命周期反应保留优先级。动作只引用本地静态角色素材，不将受限 SVG 内容写入源码；减少动作、节能、隐藏、走路或离场时会暂停轮换。

## Run and build

```sh
npm ci
npm test
npm start
npm run build
npm run verify:bundle
npm run verify:renderer
npm run verify:packaged-hook
npm run verify:packaged-flow
npm run build:mac
```

The `.app` is generated in `../dist-mini-office/mac-arm64/`. The application contains Electron and its Node runtime; a packaged app does not require a separately installed Node or a running development server. `build:mac` also produces DMG and ZIP artifacts. Apple Silicon is the local verification target; an Intel build command is provided separately. Local builds use ad-hoc signing and are not notarized distribution releases.

## Observe real work

The default mode is **实时观察**. A read-only, bounded Codex rollout observer discovers recent local activity. Each session and reliably identified child agent has its own identity. There is no demonstration store, synthetic task timer, mode switch or demo IPC in the application. Synthetic events exist only in isolated regression fixtures.

The connection panel installs optional passive observation hooks only when explicitly selected. It preserves existing hooks and native approval behavior. Codex hook trust must still be reviewed in Codex; this app does not write trust hashes or approve tools. Unknown Cursor host versions use a conservative observation subset. Claude Code must be available and run a real session before its end-to-end connection can be considered verified.

Tool starts, correlated results, user input, child agents, turn endings and session closures remain distinct. A quiet or stale source is not a completed task. Unrecognized events are retained as diagnostic uncertainty rather than invented animation claims. A successful command does not prove an entire compound test workflow succeeded.

An unanswered question keeps its attention state while parallel tools continue. If a waiting event has no reliable call identifier, an unrelated result cannot prove it was answered: the last observed wait remains until an explicit new turn, interruption, session closure or matching elicitation response. A stale source is labeled as a lost signal.

Open the room preferences to move the window to a secondary display. Use the native green window control or the Display menu to enter full screen. You can change evening lighting, rain, reduced motion and low-power behavior.

## Local data and credits

Presentation preferences and a normalized event spool live in the application's local user-data directory. Each provider's spool rotates at approximately 8 MiB and retains one backup; simultaneous writes can briefly exceed the threshold. Ordinary appends do not compete for a lock. A rotation conflict can drop an observation, with the connection panel reporting a blocked rotation; AI execution continues. The collector drops full tool output and replies; task titles are bounded to a short first line. No cloud service, AI API key or telemetry is required. `MINI_OFFICE_DATA_DIR` can point to an isolated directory for local testing.

The original source is AGPL-3.0-only. Character artwork has its own restrictions; see `assets/ORIGINAL-ARTWORK-LICENSE.txt` and `UPSTREAM-NOTICE.md`. The office background was generated with the built-in image tool; its prompt and source are preserved in `docs/office-art-prompt.txt` and `assets/office-room-source.png`. This public source export omits restricted character artwork and the upstream icon. Restore them only from an authorized local source with `scripts/prepare-local-artwork.cjs`; their separate license still applies.

Protocol sources, fixtures and verification boundaries are recorded in `docs/provider-events.md`. Completion evidence is tracked against the full requested scope in `docs/goal-evidence.md`.

`verify:packaged-flow` uses the built application's runtime and ASAR modules to replay synthetic Codex, Cursor and Claude Code hook events through the collector, bridge, session store and room rules. It does not open a GUI, run a real AI task or install global hooks; its result must not be described as live-client verification.
