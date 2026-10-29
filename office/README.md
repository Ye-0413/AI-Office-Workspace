# AI Work Space

**Observe your agent team collaboration in your spare display**

在闲置屏幕上，观察你的 Agent 团队协作。

**v0.24.0 · The workshop companions / 工坊伙伴**

A local macOS studio for watching real, independent AI sessions inhabit a little room. Designed for a five-inch 1280×720 secondary display.

[Download v0.24.0](https://github.com/Ye-0413/AI-Office-Workspace/releases/tag/v0.24.0) · [Release notes / 版本说明](../docs/releases/release-v0.24.0.md) · [English project home](../README.md) · [简体中文首页](../README.zh-CN.md) · [Originality / 原创声明](../ORIGINALITY.md)

## Watch the studio / 观看演示

<a href="https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-brand-40s.mp4">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="../docs/media/ai-work-space-preview.jpg">
    <img src="../docs/media/ai-work-space-preview.gif" width="1100" alt="AI Work Space 真实工作室视频预览 / real studio video preview">
  </picture>
</a>

点击预览观看或下载品牌短片。Click the preview to watch or download the brand film.

- [40 秒品牌短片 / 40-second brand film](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-brand-40s.mp4)
- [60 秒功能演示 / 60-second product tour](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-product-tour-60s.mp4)
- [20 秒竖版短片 / 20-second vertical teaser](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-social-20s-vertical.mp4)
- [12 秒静音循环 / 12-second silent loop](https://github.com/Ye-0413/AI-Office-Workspace/releases/download/v0.24.0/AI-Work-Space-loop-12s-silent.mp4)

真实 v0.24.0 App 录屏，后期使用 AI Work Space 品牌与中英双语文案；动作图鉴镜头已标注为演示。Recorded in the real v0.24.0 app, with updated AI Work Space titles, bilingual captions and labeled Motion gallery demonstrations. [录制说明与来源 / Recording details & credits](../docs/media/README.md).

This release introduces five material companions and 550 performances, larger bodies and names, and fixed manual sizing. The verified platform is **macOS 13+ on Apple Silicon / arm64**. Current packages use local ad-hoc signing and are **not Apple-notarized**. Install the DMG or ZIP from the Release page; installed users do not need Node.js.

本次发布包括五只材质伙伴、550 套动作、更大的身体与名字，以及不随人数变化的固定手动大小。可验证平台为 **macOS 13+、Apple Silicon／arm64**；当前安装包采用本地 ad-hoc 签名，**尚未经过 Apple 公证**。从 Release 下载 DMG 或 ZIP，安装后无需另装 Node.js。

Published v0.24.0 packages still contain **AI Mini Office.app**. New builds from the current source use **AI Work Space.app**; existing release files retain their original names.

已发布的 v0.24.0 安装包仍包含 **AI Mini Office.app**；当前源码的新构建使用 **AI Work Space.app**，已有 Release 文件保留原名。

Current builds use the manually selected Agent size for both bodies and nameplates. Changes in Agent count do not shrink them. Helpers retain a smaller body and label frame, moving characters may cross through each other, and settled positions keep their full body and nameplate envelopes separate. Local session accounting now covers seven AI tools, with Daily Token and Weekly usage on the homepage. Supported OpenCode and MiMo questions can receive an explicit manual answer through their native question API. Chinese nicknames remain 155 complete mythological names from the Shan Hai Jing, and the social library retains twelve pair choreographies. Active session families survive history-capacity pressure, and passive metadata cannot break an existing in-process usage interval.

Monitoring and size behavior last checked against source: **2026-10-29**. Implementation details and coverage boundaries: [local monitoring guide](docs/monitoring.md).

The signal-loss fix observes OpenClaw's native `before_agent_start` / `agent_end` run boundaries. A lost signal keeps an existing body on the floor for twenty seconds, then retains its identity and last state in the roster while releasing its floor position. This does not complete or close the native session. Fresh work restores the same identity; live descendants retain their actual ancestor anchors.

信号恢复修复使用 OpenClaw 原生 `before_agent_start`／`agent_end` 运行边界。已在场角色信号中断后保留二十秒，再释放画面位置，身份与末次状态继续留在名单；不会据此结束原会话。新活动恢复同一身份，仍有活跃分身的真实祖先会保留在场。

The daily Agent total and Daily Token / Weekly usage values use a brief 200 ms flip only when their displayed number changes. Initial loading and unchanged refreshes stay still; rapid updates share the current flip and always expose the latest value. Reduced motion, low power and hidden windows use instant updates without replaying skipped flips.

今日 Agent 总数与今日／本周 Token 数值变化时，会短暂翻转 200 毫秒；首次加载和相同数字刷新不播放。连续更新合并到当前翻转，无障碍读取始终使用最新数值。减少动作、节能或隐藏窗口时直接更新，不补播动画。

Cursor desktop/CLI activity is supported in completion-only compatibility mode. Fresh native tool results can reveal an active session even when its start was not observed; they do not create pending tools or reconstruct execution time. Existing waits, paired calls and explicit end boundaries retain their ownership.

Cursor 桌面版／CLI 在仅观察完成事件的兼容模式下也可显示角色。新收到的原生工具结果可显示真实会话活动，不虚构工具开始、未完成调用或执行时长；已有等待、成对调用与明确结束边界继续有效。

## 每日新房间与节日空间

「每日新房间」按香港日期自动选房：普通日期在六种独立建筑中轮换，节日使用对应的完整空间。本次房间设计覆盖 **6 种日常房间与 27 种节日房间**，每种都有自己的建筑风格、家具位置、入口和行路区域。听雨庭院、环星舰桥、大书房、日光温室、海岸画室与海底实验室采用不同平面；节日空间也分别重新设计。它们与保留共同布局的旧版 43 幅节令画面分开提供。

同一香港日期的自动选择在重启后保持一致；日常排程每六天完整轮换六种房间，相邻日常日期槽位不重复。节日优先，手动选择的房间则持续保留，重新选择「每日新房间」才恢复自动切换。日历结合香港节日与已有国际节庆；尚未有核实日期的未来流动节庆不会沿用旧年日期，仍可手动选房。

换房会等待当前行路与分身过渡完成，在新画面解码、固定尺寸的布局验证通过后一起切换画面与地面。保留同一角色身体、真实身份、父子关系和累计工作动作；换房本身不产生 AI 事件或到站反馈。完整范围、日期规则、素材来源与检查命令见 [房间设计与香港日历说明](docs/room-designs.md)。

Daily room uses a stable Hong Kong date schedule: six different everyday interiors, with a dedicated full room for each of 27 holiday occasions in the room-design release. Each has its own architecture and furniture layout. A manual choice persists until Daily room is selected again. See the [calendar and room design guide](docs/room-designs.md) for date coverage, overlap rules and verification boundaries, or inspect the [public room gallery](../docs/rooms/README.md) with optional furniture, activity-area and route overlays.

## 当前动画展示

五只工坊伙伴各有 11 类状态，每类 10 套材质动作，共 **550 套**。在应用的「房间偏好 → 工坊伙伴 → 动作图鉴」可逐一选择、播放或暂停。演示与真实会话分开。

<details>
<summary>展开离线动作预览 / Expand the offline animation preview</summary>

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="../docs/animations/workshop-demo.png">
  <img src="../docs/animations/workshop-demo.svg" width="1100" alt="五只工坊伙伴与同族分身的离线生产动作示意">
</picture>

</details>

[当前活动预览与演示范围](../docs/animations/README.md) · [静态预览](../docs/animations/workshop-demo.png)。公开演示采用生产渲染模块的离线原生采样，以合成会话展示，不是用户实时任务截图。完整 550 套在应用图鉴内查看。

保留的旧关节渲染器另有 88 套参考动作，其步态／分身和双人道具图使用原创示意外观，不代表当前工坊伙伴的材质动作。公开图鉴中的离线采样帧率不代表真实房间运行帧率。

## 一键初始化观察配置

打开右上角「连接 AI 工具」，点击 **一键初始化**。应用会检测已有工具及已安装的观察配置，串行安装或更新，显示逐项成功、失败与跳过结果；未检测到的工具不会新建配置目录。「重试失败项」只处理失败的工具。批量初始化与单项连接／移除互斥，连续点击不会启动重复安装。应用启动和打开面板只读取状态，不会自动改配置。

此入口复用各工具已有的配置写入机制：保留用户设置与其它 hooks、按需备份、检查文件锁和未知格式，不改变审批策略、不发送 AI 消息。配置完成与真正收到活动分开显示；Codex 的 hooks 信任确认、部分工具的新会话或重启要求，会保留在逐项详情里。无法安全写入的配置会报告失败，不会覆盖修复。

## Agent 外观与快捷操作

[认识五位伙伴：外形、性格与动作故事](../README.zh-CN.md#五位伙伴五种性格) · [Meet the five companions](../README.md#meet-the-workshop) · [支持的 AI 工具与功能](../README.zh-CN.md#支持哪些-ai-工具)

每个主 Agent 家族随机分配五只工坊伙伴之一：**纸团**（奶油白折纸）、**墨豆**（深蓝墨滴）、**苔盒**（陶土与苔藓）、**线团**（珊瑚色毛线）、**灯籽**（透明琥珀与暖光）。Claude 也使用新角色。分身继承主身的造型与配色，体型更小；同一场景中每个主 Agent 的「造型＋配色」唯一。先分配五种原色造型，超过五个家族时复用造型并添加配色变体。在场家族不随新成员加入或离开而换外观，离场过渡结束前仍保留其外观名额。名牌家族色与编号继续区分真实身份和父子关系。用途说明是角色性格设定，不会改变工具能力或任务分配。

「房间偏好 → 工坊伙伴」提供五种角色的大图图鉴，并说明家族外观规则。每只使用六格透明姿态图：待命、工作、思考、休息、异常／需留意、完成。姿态跟随实际观察状态，完成只在真实完成证据出现后呈现；节能、隐藏和减少动作时停止动态，保留正确姿态。外观分配保留真实身份、脚点和父子关系。旧版「全部原貌」、指定统一角色和几何外观偏好均迁移为家族自动分配。素材由内置图像生成工具依据用户提供的概念图制作，完整提示保存在 `assets/avatars/workshop-prompts.json`，不使用恢复的上游角色素材。

五只均支持阅读、搜索、思考、编程、设计、测试、构建、执行、等待工具、等待用户、异常，每个角色每类状态各有 **10 套动作，共 550 套**。每套有独立道具、操作路径或接触顺序，身体图与各材质的动态道具分层绘制。思考重排元素、编程输入、构建组装、执行运行回路；两类等待分别保留停止的工具和朝向观众的请求，异常保留卡纸、断路、断根或线结。工作循环约 2.6–4.2 秒，等待与异常为 6–9 秒；工作完成三个完整循环后轮换动作，等待与异常完成两个循环后轮换，不代表真实进度或预设测试结果。完整身份决定固定遍历顺序，十套动作全部出现后才重复；普通元数据刷新不会重启动作。隐藏保留同一动画对象和时钟，减少动作或节能保留静态道具。道具切换先停止旧动作再收起；单次工具成功只触发去重后的轻微反馈，不播放整轮完成。墨豆分身以墨滴分离和融回表现，仍由原有真实分身生命周期驱动。

按 **⌘K / Ctrl+K** 打开伙伴搜索，可按昵称、任务、工具、项目或真实 ID 查找，并筛选「仅需留意」。方向键、Home / End 可浏览结果，Enter 查看详情，Esc 关闭后返回来源；实时更新保留列表焦点和滚动位置。选中伙伴有静态脚底光圈，便于在房间中定位。

Each real main-agent family receives one randomly assigned workshop companion: **Folio**, a folded paper creature; **Ink**, a low fluid pebble; **Moss**, a moss-backed terracotta creature; **Thread**, a coral yarn creature; or **Glow**, a translucent amber seed. Claude also uses these characters. Helpers inherit their main agent’s shape and color at a smaller size. Every main agent on the floor has a unique shape-and-color combination: the first five families use distinct original designs; additional families reuse those shapes with new color variants. Existing families keep their appearance as others arrive or leave, and departing bodies retain their reservation until they leave the floor. Nameplate colors and numbers preserve family identification and actual ancestry. Role descriptions express character, without changing provider capability or task assignment.

Room preferences → Workshop companions offers a large character gallery and explains automatic family assignment. Six transparent poses follow observed idle, work, thought, rest, attention and confirmed completion states. Quiet modes stop motion without hiding the selected pose. Actor identities, foot anchors and parent relationships remain intact. Retired original, fixed-character and geometric appearance preferences all migrate to automatic family assignment. Assets were made with the built-in image generation tool from the user-supplied concept; complete prompts are retained in `assets/avatars/workshop-prompts.json`.

Each of the five companions has ten distinct choreographies for each of the eleven activities, giving **550 material-specific performances**. The motion gallery in Room preferences lets you select a character, activity and variation, then pause the isolated specimen for inspection. Separate tools distinguish reading, searching, planning, coding, designing, testing, building and running. Waiting stops the work loop; a tool wait retains its stopped mechanism while a user wait offers a request. Error states retain a visible jam, break or knot without claiming a repair. Work cycles take 2.6–4.2 seconds and waiting/error cycles take 6–9 seconds. Work changes variation after three complete cycles; waits/errors change after two. Full identity seeds a stable order that visits all ten before repeating. Native animations advance at cycle boundaries without per-character timers or frame callbacks; ordinary metadata does not restart playback. Hidden scenes preserve the exact paused clocks, while quiet preferences retain static poses. None of these loops implies progress or test success. A confirmed tool success gets one deduplicated, restrained response, separate from a confirmed turn completion. Ink helpers bud into droplets and merge back within the existing real clone lifecycle.

Use **⌘K / Ctrl+K** to search the roster by nickname, task, tool, project or real ID. Filter to agents needing attention, browse with arrows or Home / End, and press Enter for details. Focus and scroll survive live updates, and closing details restores focus.

A native 100-creature fixture covers all five materials and eleven activities: 2,500 unchanged metadata updates produce zero DOM mutations and retain all animation owners; hidden playback freezes exact clocks, and teardown leaves no renderer animations. Batch timings are local diagnostics, not a frame-rate promise. Run it with `office/node_modules/.bin/electron office/test/creature-repertoire-performance.cjs` from the repository root.

The resource-health controller observes only its image, source and presence owners, so joint and family-style changes no longer trigger health synchronization. Focused tests verify one initial computed-style read instead of 22, no repeated DOM writes across 100 unchanged quiet heartbeats, and continuity when changing silhouettes. These are local operation counts, not an application-wide frame-rate claim.

## 角色辨识、大小与每日活动

右上角的 **使用记录** 保存本机实际观察到的 Agent 档案与事件时间线，可按香港日期、AI 工具和主／分身筛选，分页查看或导出全部筛选结果的 CSV。活跃主体、未解决分身与其真实祖先不会因历史容量回收而丢失；历史容量是可回收记录的目标，必要时保留更多真实工作身份。记录包含身份、父子关系、项目名、活动与末次状态、轮次、工具调用、失败记录，以及分别统计的观测工作和等待时长；昵称跟随中英文界面。档案会在应用重启后保留，不会把历史 Agent 重新放进房间。

数据库保存在本应用用户数据目录的 `usage-history/usage.sqlite3`；面板中的「打开日志文件夹」可直接定位。使用 SQLite 事务与 WAL，目录权限 0700、文件权限 0600，默认保留全部历史。仅接受经会话状态模型确认的观察事件，跨重启去重；不保存对话正文、任务标题、提示词、工具输入输出或完整项目路径。旧版每日统计只有不可逆身份摘要，不能转换成完整使用档案；明细从本版本实际观察起积累。

时长只累计应用实际观察的活动区间，五秒检查点、正常退出补齐，香港午夜按日拆分；应用关闭、无信号超过三分钟和旧日志回放不补算工作。工作时长不含等待，工具并行不会让同一 Agent 重复计时。轮次和调用基于实际观测边界，不是 token、费用或完整客户端历史。异常退出保留已提交事件，最多丢失最后检查点后的时长。读取或写入失败会在记录按钮和面板中明确提示。筛选后的时长与次数只算所选日期，首次／末次观察与末次状态属于该身份全历史。

每个当前主 Agent 家族有独立的身体颜色，分身使用同色系；名牌保留组号和真实父子关系，超过八个同时出现的家族时可用组号继续辨识。中文昵称直接使用《山海经》中的 155 个二至四字神话名字，包含诸犍、英招、九凤、烛九阴等；英文为四至五个字母的独立单词。昵称只影响工作室显示，不改原始会话。

角色和道具按家族配色一起呈现，并保留各自的折纸、墨滴、陶土、毛线与琥珀材质。主身可见身体采用 1.8 倍呈现，分身身体内部为 1.44 倍；分身的按钮外框再统一缩到 82%，身体与名牌一起缩小，因此可见分身身体仍为同尺寸主身的 65.6%。直接和嵌套分身使用同一比例，不随家族深度继续缩小。静止图片、关节动画、备用身体与随身道具使用一致身体比例。名牌采用 264×76px 的基础盒和 29px 名称，分身外框把它们一并缩放；人数不切换名牌模式。布局分别测量实际主身与分身的身体及名牌包络，并计入放大后超出透明画布的绘制范围。旧版保存的项目筛选不会隐藏其它项目的当前会话身份。

「房间偏好 → Agent 大小」提供 65%–135% 的固定手动比例，100% 对应当前放大后的基础身体与名字。只有手动调整才改变大小，人数增加、减少、空房间和普通刷新都不会改变它。主身与分身共享这个手动比例，分身另保留上述身体与名牌的相对比例。「重新排列」按当前大小重新计算停靠位置。移动允许角色相互穿行，家具与时钟保留区仍参与路径检查；最终工作位置按完整身体与名牌包络分开安排。

脚底而非角色画布下缘锚定地面，持续约 1.7 秒的真实功能变化会安排身体走向相应家具区域，短暂工具切换先合并。行路与换路从当前实际脚点续接；最多八条路线可并行，角色行走时允许相互穿过，家具与时钟保留区仍会阻挡路径，最终停靠位置按完整包络分开安排。普通心跳和场景切换保留原身体、图片、关节动画与已累计的播放时间。

只有主 Agent 的身体从门口走入；新分身在已观察到的实际父级位置凝聚，再真实走向工作区，归位也回到实际父级。分身凝聚与吸收特效持续 900 毫秒，凝聚阶段后才起步，走回父级后才吸收。已入场身体不会因为交通阻塞而隐身；待入场数量会明确显示。已完成分身保留底层开放会话，后续收到明确活跃但尚未分类的活动也会重新显现，不会被“工作种类未知”误藏。

主 Agent 重新活跃会撤销旧的等分身离场请求；分身归位期间的新工作会保留原关节、道具和动画进度。切换语言造成的名牌增长只取消过时路线，不截断仍在进行的回收。分身凝聚、返回或吸收期间调整尺寸，会先保存设置并显示等待提示，保持原安全尺寸，等该过程完成后再按新尺寸验证入场；仅因尺寸调整重新入场不会重复触发工作区反馈。外部角色图片加载失败时，原创备用身体在相同关节与坐标下继续显示；后续真实状态刷新会有限重试，图片恢复通过短透明度过渡衔接。备用身体不依赖失效图片，也不改变观察到的任务状态。

多人确认退场时，布局先验证当前身体的实际离场路线；按当前手动尺寸核验路线，等身体真正走到门口后才释放位置。新工作、新分身与语言变化保留原身体并重验剩余路线；手动尺寸变化重新核验身体与名牌几何。分身出现、归返、吸收、等分身和主 Agent 离场文案随界面语言同步更新。

已经停稳等分身的父 Agent 会保留实际脚点；其他伙伴换功能区时，布局不会安排它执行实际不存在的换座。只有本轮确实观察到该身份恢复活动且回到当前在场名单，才解除此约束。首次拦截正在退场的父身仍会让它从实际位置走回安全停靠点，最后一个分身归位后也仍能按真实路线走出门。重新排列只更新目标停靠位置，不改变任务状态、真实父子关系或当前实际脚点。

已入场伙伴互换功能区时，会尽量保留其余合法旧席，再核验新的最终停靠点及家具间路径。行路允许角色交叉经过，不把另一位角色临时经过的身体当成永久路障；最终工位仍彼此分开。只有实际到达最终功能区才产生工位反馈。新活动、尺寸、语言、分身或可见性变化会撤销旧方案，从实际脚点重新协调。

背墙显示醒目的香港时间和「今日活跃 Agent」，按香港自然日对实际观察到有活动的主 Agent、分身分别去重；同一身份执行多轮只计一次。统计保存在本机，重启后保留，香港午夜开始新一天。它统计应用观察到的活动，不会回扫整天历史，也不代表所有打开的聊天窗口；纯元信息、装饰访客与未被接受的事件不计入。磁盘只保存日期与哈希身份，不保存任务内容，最多保留十四天。

## Token、会话监测与手动问答

首页统计同时显示 **Daily Token／今日 Token** 和 **Weekly usage／本周用量**。今日按香港自然日，本周按香港周一至周日统计全部本机项目；数值使用 M、B、T，分别代表百万、十亿和万亿。小于一百万时保留有意义的 M 小数；键盘聚焦统计区可查看准确计数、日期范围、来源工具与导入状态。历史首次导入会分批进行，尚未读完或发生读取错误时会明确提示不完整，不把缺失记录当成零用量。

Token 覆盖 **Codex、Claude Code、Gemini CLI、Pi、OMP、Kimi Code 与 OpenCode** 的已适配本机会话格式。它复用 CC Switch 的检查点、文件指纹、原生请求去重和累计用量核对思路，保存在独立的 `usage-history/tokens.sqlite3`。历史 Token 可以在应用关闭后补导入，历史活动时长不会因此补算，旧身份也不会重新进入房间。使用记录中的 Token 概览支持相同的日期、工具与主／分身筛选；现有 CSV 导出仍只导出已观测活动。显示的是日志报告的 Token，不推算费用、余额或订阅额度。

实时会话继续使用既有 hooks／插件与 Codex 只读日志。新增 Gemini CLI、Pi、OMP 的只读会话日志补充，只发布观察器启动后且仍新鲜的真实用户、工具和明确结束边界；近期 hooks 保留优先权。Kimi 和 OpenCode 的新增本地读取用于用量统计，其实时活动继续由已有 hooks／插件提供。每个工具的身份、父子关系、调用 ID、等待与结束证据分别处理；一个工具的导入错误不会把其它健康观察器标成故障。

右上角的 **Agent 问题** 入口复用 Clawd on Desk 的请求级手动问答机制。目前可在工作室回答 **OpenCode 1.x（1.18.31 起）** 与 **MiMo Code 0.1.x（0.1.15 起）** 的受支持原生问题，包括单选、多选与自填答案。只有用户明确提交才会通过原生问答 API 发送一次答案；发送前重新核对会话、请求、工具调用和完整问题结构，交付不明确时保持锁定，不自动重发。问题内容与草稿只在内存中保留。Codex、OpenCode 2.x 和其它未适配工具仍回到原工具回答；此入口不审批工具、不发送普通聊天消息，也不自动作答。

已安装的 OpenCode／MiMo 插件可在「连接 AI 工具」中明确重新连接，或执行「一键初始化」更新受管文件，再按宿主要求重新加载插件／开始新会话。应用启动只建立本机运行通道，不会自动改写宿主配置。支持的格式和问答版本已有隔离回归检查，不代表七种工具的所有宿主版本均已完成真实客户端验收。完整来源、存储、会计边界和问答限制见 [监测实现说明](docs/monitoring.md)。

## 公开源码版准备

公开仓库包含五只工坊伙伴、场景与本项目图标，可直接在 `office/` 中运行 `npm ci`、`npm test`、`npm start`，或构建本地应用；不需要还原上游角色素材。开发需要 Node.js 24+，构建原生辅助程序需要 macOS 与 Xcode Command Line Tools。

只有需要旧角色兼容、且拥有相应权限时，才可选运行 `node scripts/prepare-local-artwork.cjs --from /absolute/path/to/original-project`，从明确授权的本地检出目录核验并导入素材。脚本不联网，受限角色与上游图标不在公开应用源码中；还原不会授予再分发许可。构建使用本项目的 `assets/studio-icon.png`；其 AI 辅助生成记录见 [图标提示](docs/studio-icon-prompt.txt)。

## 本地体验

打开当前源码构建的 **AI Work Space.app**（已发布的 v0.24.0 下载仍为 **AI Mini Office.app**）；使用 DMG 时先将应用拖进「应用程序」，再打开并连接 AI 工具。房间使用「实时观察」：本地只读会话日志与已连接的 hooks／插件提供真实活动，每个独立 session 保持自己的身份，子 Agent 来自真实父子关系。角色使用固定的手动大小，人数变化不会自动缩小身体或名字；移动允许相互穿行，最终工作位置按身体和名牌的完整包络分开安排。空房间不会自动生成模拟任务。

没有伙伴在场时，初始界面只展示完整的空工作室和右上角控制区。连接与偏好从右上角打开为木框纸色面板；语言切换也在同一区域。历史闲置任务不会触发中央欢迎卡片。真实伙伴全部离场、空闲 8 秒后，会有一位明确标记的装饰访客来串门：在 10 个角落随机停留，翻书、喝咖啡、看看植物，偶尔变个小魔术。500 条独立撰写的中英双语气泡按区域轮换，真实工作出现即让路；逛约两分半后离开，过一会儿再来。可在右上角偏好中关闭「闲时串门」。访客不会加入任务数、伙伴列表或真实事件记录。

每个任务 ID 对应固定的一对中英文昵称；中文界面显示中文昵称，英文界面显示英文昵称，切换语言不会改变真实会话身份。任务描述变化、重新入场和重启不改变昵称映射。只有独立主 Agent 从门口入场；新分身从所属主 Agent 身体位置出现，结束后走回主 Agent 并显示「结束分身。」。嵌套分身保留实际父子连线，优先回到仍可见的实际父级；主 Agent 会等分身归位后离开。缺少可见主 Agent 时使用已知父级或原地过渡，不虚构门口入场。

Codex 的线程 UUID 与每轮 ID 分开识别，子 Agent 日志中复制的父会话历史不会覆盖角色身份。Thinking 期间保持同一个循环动画；短暂工具调用的过期路线会取消，目的地稳定后再起身行走。Codex 脚本中包装的修改、命令、测试也会识别；在刷新间隔内已结束的真实工具动作，会在原地短暂呈现「刚刚在改代码」等有依据的动作，不触发来回奔走。主任务与各级子任务使用同色铭牌、持续可见的箭头连线和父角色名称；伙伴列表按树形排列，点击详情中的父角色可直接定位。

继续几周前创建的 Codex 对话时，活动仍写入原始日期目录。观察器会分批扫描历史目录，重新打开工作室也能发现最近恢复的旧会话；不会把创建日期当成活跃日期。所有项目的当前主 Agent 与分身都保留在观察与伙伴列表中，同一个 Codex 下的多个 session 保持独立身份；角色使用共同的手动比例，伙伴列表和详情保留原始项目、ID 与父子关系。

在房间设置中选择 1280×720 副屏，再通过原生窗口绿色按钮进入全屏。角色步行到阅读、规划、写代码、测试等对应区域，在到达后呈现实际活动；同一活动有不同动作段落。身体沿原先核验的安全折线渐进起步、到站减速，真实转角先减至静止再转向；同向直线上的中间点不会无故停车。四足轮流抬落，双手配合摆动或持物，原工作动作与累计时钟暂停，到站平滑续接。步态由同一个身体动画的实际时钟与累计路程驱动，每 192 个世界像素完成一轮；手动调整大小不会让腿突然加速。走停保留同一组关节和工作动画，从当前姿势接续。这里采用距离同步步态，尚不保证足底无滑动或任意拥挤程度下昵称可读。动作导演结合实际并行工具数量、子 Agent 和工具结果产生反应，优先呈现工具结果与生命周期变化；没有结果时不会假装成功。

真实抵达工作区后，书架、白板、代码桌和实验台会作出约 1.4 秒的家具回应，三种房间共有 **12 种原创机关**。工坊翻开手绘笔记、接上图纸线索，转动电路卷轴与小针盘；茶舍展开茶笺和折札，滤下一滴茶、浮起温茶气泡；星台翻阅星册、连起星座，轻转浑仪和镜片光圈。

可在[公开到站响应图鉴](../docs/animations/README.md)中查看三种房间的全部机关。图鉴由当前生产模块离线采样，仅展示道具，不作为房间导航、身体接触或 IK 的验证。房间中的回应只在真实到站后出现，不代表工具进度或任务成功；同区微移、普通快照、归返、离场及未知工作不会触发。机关避开角色与时钟，空间不足时跳过，不排队延后闪现。

社交只选取已经完成行路与尺寸调整的角色，让路和待续行程不能提前开启互动。新活动或空间变化中断纸笺、茶杯等社交道具时，保留当前姿态并在 160 毫秒内淡出；隐藏、减少动作、节能和退出会直接清理。家具反馈和社交均不修改角色位置、关节、真实会话或工作时钟。

右上角 **EN / 中文** 切换界面语言，并保存到本机。昵称随界面语言切换；任务原文、项目名称和 ID 保持原样。

「连接」面板可搜索并接入 28 种工具，包括 Hermes Agent。工具目录在测试时检查、构建时从项目工具注册表同步；事件适配、普通 hooks、插件及特殊配置分别处理。只有点击「连接」才会安装该工具的被动观察入口；「移除配置」只卸载本应用拥有的部分。工具审批继续由原工具处理。接入后需要在相应工具中产生新事件；Hermes 会核验本机 Gateway 并热加载 11 个观察钩子，已经启用的插件也可通过「重新加载」重新接入，通常无需重启 Gateway。未确认热加载时会明确提示；其他插件可能需要新会话或手动重启宿主，应用不会自动重启 AI。移除 Codex hooks 后，本地只读观察仍可继续。

28 种接入方式已做隔离配置和事件回归检查；这不表示 28 种真实客户端都已运行。Codex 已验证真实多 Agent 日志到角色显示，其他客户端仍需实际会话验收。各工具的宿主版本、配置路径与已知边界见 `docs/upstream-compatibility.md`。KiroCrew 的网关、目录和配置锁使用随应用打包的 macOS 原生小程序，无需额外 Python。

房间默认跟随香港时间，晨曦、上午、午后、日落和夜晚使用连续的天色与室内灯光。左侧木窗与门上的玻璃都能看见海港剪影，慢云、渡轮、城市灯与海面反光保持在窗内。背墙木框钟使用醒目的 56px 数字，同时显示香港完整日期与星期；挂钟指针也与真实香港时间同步。中英文日期随界面语言切换，香港午夜会自动更新。点击时钟可预览时段，再用「回到此刻」恢复实时；预览期间时钟仍显示真实香港时间、日期和星期。减少动作、节能和隐藏窗口都会暂停装饰循环，不改变真实任务状态。

中文昵称是古籍中已有的完整名字，不再拼接前后词。英文昵称池有 4,096 个短单词，如 Lumi、Cosmo、Orbit；昵称池有限，昵称不作为身份标识。昵称随界面语言切换，不再需要单独选择风格。每个身份还有固定的小性格、纪念物和问候，任务详情保留原始标题与 ID。「打个招呼」只触发工作室里的回应。主 Agent 下方显示「分身 X 活跃 · 累计 Y」；累计按完整身份去重，包含本次观察中已经结束的分身，跨房间切换仍保留。真实子任务本轮完成也会收回身体，保留仍开放的底层会话；同一身份接到新工作后重新分身，累计不重复增加。普通闲置、失联、缺少快照都不会被当成已结束；新工作可以中断归位。

观察日志轮换时会先按文件身份排空保留文件的未读尾部，再读取新文件；每轮仍最多读取 64 KiB。损坏行和不同文件的 JSON 碎片会被隔离。GitHub 的 Office quality 工作流在 main 推送和 PR 上安装锁定依赖、重建原生锁并运行回归测试；公开源码检查无需还原角色素材。

保留的旧关节渲染器覆盖十一种真实活动，**每类八套，共 88 套参考关节动作**（当前工坊角色使用上文的 550 套材质动作）：思考与规划、阅读、搜索、写代码、设计、测试、构建、命令执行、等待工具、等待用户及错误。托腮、转笔、分解方案、推演分支；打字、调试、重构、核对补丁；展开卷轴、翻目录卡、检查测试边界、绕线装配等场景使用不同的道具及眼手脚编排。同一活动按约 18–24 秒可见工作时间自然轮换，普通事件刷新不会重启动作。每个完整身份分别累计各类活动时间，切换场景后会继续轮换，不重复从首个动作开始；离屏时间不算作工作时间。姿态与道具切换保留可中断的短暂衔接，工具结果和生命周期反应继续优先。动作只引用本地静态角色素材，不将受限 SVG 内容写入源码；减少动作、节能、隐藏、走路或离场时会暂停轮换。

## Run and build

Run these commands from `office/` (`cd office` from the repository root).

```sh
npm ci
npm run check:rooms
npm test
npm start
npm run build
npm run verify:bundle
npm run verify:renderer
npm run verify:packaged-hook
npm run verify:packaged-flow
npm run build:mac
```

The `.app` is generated in `../dist-mini-office/mac-arm64/`. The application contains Electron and its Node runtime; a packaged app does not require a separately installed Node or a running development server. `build:mac` also produces DMG and ZIP artifacts. Apple Silicon is the local verification target; an Intel build command is provided separately. Current local and v0.24.0 release builds use ad-hoc signing and are not Apple-notarized. macOS may identify the developer as unknown; check the published source and SHA-256 before deciding whether to open the app. No system-wide security disabling is required.

Tests and builds first check that authored holiday profiles match the generated room catalog; the check never rewrites it. After intentionally editing a profile, run `npm run sync:rooms`, review the generated change, then run `npm run check:rooms`. Room artwork provenance and the full-catalog native check are described in [the room guide](docs/room-designs.md).

## Observe real work

The default mode is **实时观察**. Existing hooks/plugins and the bounded Codex rollout observer supply real activity; native Gemini CLI, Pi and OMP session logs provide additional fresh read-only observations. Each session and reliably identified child agent has its own identity. Historical token imports never create a room actor or credit offline work time. There is no demonstration store, synthetic task timer, mode switch or demo IPC in the application. Synthetic events exist only in isolated regression fixtures.

The retained legacy joint renderer has eight reference choreographies for each of eleven activities, for 88 total; the current workshop companions use the 550 material-specific performances described above. In the reference renderer, props and joint motion distinguish reading, search, planning, coding, design, testing, builds, execution, tool waits, user waits and error inspection. A bounded per-identity clock keeps each activity's accumulated visible work across page and room navigation. Offscreen and quiet intervals do not advance the cycle; metadata does not replay it.

The connection panel installs or updates owned integrations only when explicitly selected. It preserves existing hooks and native approval behavior. Supported OpenCode/MiMo plugins also carry the request-scoped manual question channel; update an existing installation with an explicit reconnect or one-click Initialize, then follow the host's normal plugin reload/new-session path. Codex hook trust must still be reviewed in Codex; this app does not write trust hashes or approve tools. Unknown Cursor host versions use a conservative observation subset. A host must be available and run a real session before its end-to-end connection can be considered verified.

Tool starts, correlated results, user input, child agents, turn endings and session closures remain distinct. A quiet or stale source is not a completed task. Unrecognized events are retained as diagnostic uncertainty rather than invented animation claims. A successful command does not prove an entire compound test workflow succeeded.

An unanswered question keeps its attention state while parallel tools continue. If a waiting event has no reliable call identifier, an unrelated result cannot prove it was answered: the last observed wait remains until an explicit new turn, interruption, session closure or matching elicitation response. A stale source is labeled as a lost signal.

Open the room preferences to move the window to a secondary display. Use the native green window control or the Display menu to enter full screen. You can preview Hong Kong daylight, change rain, use reduced motion or low-power behavior, and choose a fixed Agent size from 65% to 135%. At 100%, the main body uses a 1.8 presentation scale and a helper uses 1.44 inside an additional 82% frame, retaining a visible body ratio of 65.6%; the frame also scales its nameplate. Only manual size changes alter these sizes. Agent counts, empty rooms and ordinary refreshes do not shrink or enlarge them. Both types have their actual body and nameplate envelopes measured separately, including paint that extends beyond the transparent canvas. Rearrange recomputes destinations at the current size. Up to eight walking routes can run concurrently and agents may cross through one another in transit. Furniture and the clock reservation still block routes; settled work positions keep their complete envelopes separate.

The larger Hong Kong clock sits beside a daily activity ledger and Daily Token / Weekly usage. Activity counts distinct observed active identities per Hong Kong calendar day, with separate main-agent and clone counts. Repeated turns count once and app restarts retain the day. Its private date/identity summaries retain at most fourteen days and exclude decorative visitors, plain metadata and rejected events. Token totals instead cover supported local session history across all projects, use Hong Kong calendar days and Monday–Sunday weeks, and display M/B/T units with exact counts in the keyboard-accessible source description. Initial imports and errors are explicitly marked incomplete.

## Local data and credits

Presentation preferences and a normalized event spool live in the application's local user-data directory. Each provider's spool rotates at approximately 8 MiB and retains one backup; simultaneous writes can briefly exceed the threshold. Ordinary appends do not compete for a lock. A rotation conflict can drop an observation, with the connection panel reporting a blocked rotation; AI execution continues. The collector drops full tool output and replies; task titles are bounded to a short first line. No cloud service, AI API key or telemetry is required. `MINI_OFFICE_DATA_DIR` can point to an isolated directory for local testing.

Source code remains **AGPL-3.0-only**. This repository retains and adapts upstream Clawd on Desk code and provider definitions; it is not wholly original. Third-party attribution, including CC Switch monitoring mechanisms, remains in [UPSTREAM-NOTICE.md](UPSTREAM-NOTICE.md).

The five workshop characters use **user-supplied concepts + AI-assisted image generation + project implementation**. Their self-contained [Workshop artwork notice](assets/WORKSHOP-ARTWORK-NOTICE.md) ships with the app. Artwork retains **All Rights Reserved**; the source-code license grants no open artwork license. Existing [upstream artwork restrictions](assets/ORIGINAL-ARTWORK-LICENSE.txt) remain separate. See the [bilingual project originality statement](../ORIGINALITY.md) for the full scope and sources.

The office background was generated with the built-in image tool; its prompt and source are preserved in `docs/office-art-prompt.txt` and `assets/office-room-source.png`. The 33 independent room paintings and exact prompts, source basenames and hashes are in `assets/scenes/rooms/generation.json`; the reference-based base interiors and 43 seasonal paintings have separate generation records. The public app source omits restricted upstream character artwork and the upstream icon. The optional authorized local restoration process does not grant redistribution rights.

Protocol sources, fixtures and verification boundaries are recorded in `docs/provider-events.md`. Completion evidence is tracked against the full requested scope in `docs/goal-evidence.md`.

`verify:packaged-flow` uses the built application's runtime and ASAR modules to replay synthetic Codex, Cursor and Claude Code hook events through the collector, bridge, session store and room rules. It does not open a GUI, run a real AI task or install global hooks; its result must not be described as live-client verification.

## 节令场景与机关

上方场景菜单保留山海工坊、港湾茶舍与星台观测室三个手动选项，另有「每日新房间」和全新独立布局的房间。旧版山海工坊随节令切换 43 幅完整主题画面，桌面、墙面、织物、灯光与窗外各有主题陈设，家具及通道保留统一布局；这 43 幅画面不计为不同平面。港湾茶舍和星台保留自己的室内画面与节令布景。旧场景各有三种原创机关及四套双人小互动。其「节令」提供 43 套主题机关、自动日期选择，以及关闭／雨／雪／随主题天气；设置保存在本机。机关的可见状态、轨迹和道具各有区别，标准播放使用 41 个连续姿态采样；双人互动持续 2.8–3.2 秒，不发送 AI 消息、不制造任务或工作结果。

[公开机关动画与完整清单](../docs/scenes/README.md)。自动模式使用香港日期：四季按月份，已核实节日优先，手动灵感主题不臆测地区花期或变化中的宗教节日日期。清明精确日期由香港天文台 2026–2035 表提供，范围外保留手动预览。雨雪为装饰，不是实况天气；减少动作、隐藏窗口与节能设置会停止装饰循环。切换主题不改真实 Agent 的位置、身份与动作时钟。背景在解码完成后从当前透明度衔接；快速连选时，已退场画面保持自己的短暂淡出时间，较晚解码的旧选择不会覆盖新选择。

Nameplates use a 264×76 base box and a 29px nickname before the common manual scale; helpers additionally scale their whole button frame to 82%, including the label. Agent count does not change the size or label mode. Current active and cumulative observed helper counts remain below every main; full names, parent relations and counts remain accessible in the inspector and labels. Family tokens and keepsakes reserve space inside the same label rather than covering the name. Moving characters may cross through each other; stationary work positions keep the complete body and nameplate envelopes separate.
