# 本地 AI 活动接入与房间行为证据

核对日期：2026-10-15。已实现直接观察协议包括 Cursor、Claude Code、OpenAI Codex 和 Hermes Agent；本方案不创建云端 Agent、不调用付费模型。本文区分官方协议、原项目行为和本应用的设计建议。

## 接入原则

优先使用各工具的本地 hooks，通过一个迅速退出、只观察的收集器将事件交给 Mini Office。收集器不返回批准、拒绝、修改输入、继续任务等决策。应用关闭时，观察器也必须正常退出，不能拖住 AI 工作。安装时保留现有 hooks，提供预览和卸载；Codex 非托管 hooks 仍需要用户在 Codex 内信任。插件安装不等于 hooks 获得信任。[OpenAI 插件说明](https://developers.openai.com/plugins/build/plugins#hooks)

不能仅凭应用进程存在、日志文件存在、最近修改时间，声称某个 session 正在工作。尚未安装 hooks、未收到事件、版本不支持或数据已过期时，界面应显示“尚未观察到活动”或“状态待更新”。静默并不等于完成。

## Codex：官方本地 hooks

官方配置支持用户级或项目级 `hooks.json`、`config.toml`。公共输入包括 `session_id`、`cwd`、`hook_event_name`；本轮关联使用 `turn_id`，工具配对使用 `tool_use_id`。`Bash` 和 `apply_patch` 的参数在 `tool_input.command`。输出位于 `tool_response`，其形状依工具而异。非零退出的 Bash 也触发 `PostToolUse`，不要注册一个未经文档确认的 `PostToolUseFailure`。`SubagentStart/Stop` 提供 `agent_id`；其 `session_id` 是父 session。`Stop` 是结束响应的尝试，不是永久关闭任务；`SessionEnd` 才是会话生命周期结束。转录文件不是稳定协议。[官方 Hooks](https://learn.chatgpt.com/docs/hooks)

下面是按官方字段构造、替换了标识符的**合成协议 fixture**，并非本机真实捕获：

```json
{
  "session_id": "office-codex-a",
  "cwd": "/example/project",
  "hook_event_name": "PreToolUse",
  "turn_id": "turn-a",
  "tool_name": "Bash",
  "tool_use_id": "call-a",
  "tool_input": { "command": "npm test" }
}
```

建议事件：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`SubagentStart`、`SubagentStop`、`Stop`、`Interrupt`、`SessionEnd`。普通工具调用不能证明模型正在推理；请求审批也可能被另一 hook 立即批准，等待提示应接受后续事件快速取消。

本应用若以后自己承载 Codex 运行，可以消费 app-server 的 `thread/status/changed`、`turn/*`、`item/*`，使用 `threadId`、`turnId`、`itemId`，并根据 `waitingOnApproval` 等状态提高准确性。读取存储历史不等于订阅实时活动；启动新的 app-server 进程也不等于自动附着所有其他客户端的运行。[官方 App Server](https://learn.chatgpt.com/docs/app-server)

`codex exec --json` 的 JSONL 是本应用发起的非交互任务的另一条通路，使用 `thread.started`、`turn.started`、`item.*`、`turn.completed`、`turn.failed`；它不是观察所有已有 Codex session 的全局流。[官方非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)

## Claude Code：官方 hooks

公共 session 标识为 `session_id`；新版本可提供 `prompt_id`。子 Agent 的工具事件可带 `agent_id`、`agent_type`。`PreToolUse` 用 `tool_name`、`tool_input`、`tool_use_id`；成功结果在 `tool_response`，执行失败由 `PostToolUseFailure` 提供 `error`、可选 `is_interrupt`、`duration_ms`。`PermissionRequest`、`AskUserQuestion` 工具和 `Elicitation` 可指示需要交互。`Stop` 可能带 `background_tasks`、`session_crons`：仍有后台工作时不播放全屋完成庆祝。转录异步写入，最终文字优先读 `last_assistant_message`。[Claude Code Hooks](https://code.claude.com/docs/en/hooks)

下面同样是按官方字段构造的**合成 fixture**：

```json
{
  "session_id": "office-claude-a",
  "cwd": "/example/project",
  "hook_event_name": "PostToolUseFailure",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "tool_use_id": "toolu-a",
  "error": "Exit code 1\nTests failed: 1",
  "is_interrupt": false
}
```

版本不同会缺少部分新字段，收集器必须允许缺失且标注能力。仅 `agent_type` 不足以确认子角色身份：主会话选择自定义 Agent 时也可能带该字段。以明确 `agent_id` 与已观察的子生命周期关联。

## Cursor：官方 hooks

事件名使用小驼峰：`sessionStart/End`、`beforeSubmitPrompt`、`preToolUse`、`postToolUse`、`postToolUseFailure`、`subagentStart/Stop`、`stop`。跨轮稳定标识是 `conversation_id`；`generation_id` 每条用户消息改变。成功结果 `tool_output` 是 JSON 字符串，失败信息在 `error_message`、`failure_type`、`is_interrupt`。`stop.status` 为 `completed/aborted/error`。子开始事件提供 `subagent_id`、`parent_conversation_id`、`tool_call_id`；子结束示例不保证含相同 ID，缺失关联时不能凭名称猜测关闭哪个孩子。官方未列通用 `PermissionRequest` hook；`beforeShellExecution` 本身不能证明在等用户。[Cursor Hooks](https://cursor.com/docs/hooks)

以下是合并官方公共字段与工具字段的**合成 fixture**：

```json
{
  "conversation_id": "office-cursor-a",
  "generation_id": "generation-a",
  "hook_event_name": "postToolUse",
  "workspace_roots": ["/example/project"],
  "cwd": "/example/project",
  "tool_name": "Shell",
  "tool_input": { "command": "npm test" },
  "tool_use_id": "call-a",
  "tool_output": "{\"exitCode\":0,\"stdout\":\"All tests passed\"}",
  "duration": 5432
}
```

工具观察优先使用通用 pre/post pair。不要同时把通用 Shell hook 和旧式 `before/afterShellExecution` 当成两次独立工作。Tab 补全与 Agent Chat 分开，避免每次行内补全都在房间里生成一个角色。

## Hermes Agent：本地 Python 插件

通过右上角连接面板显式安装 `ai-mini-office`，只写本应用拥有的插件目录，再调用 Hermes 自己的 `plugins enable/disable ai-mini-office`。不直接改写用户 YAML，不替换已有其他插件，不自动重启 Hermes 或网关。默认 `~/.hermes` 和显式 `HERMES_HOME` 均可使用；命名 profile 需要在对应 home 连接，不自动批量安装。插件更新后，已有长驻进程需要手动重启或开始新会话。

使用本机安装源码和[官方观察 Hook 合约](https://hermes-agent.nousresearch.com/docs/developer-guide/observer-hooks)核对了 11 个事件：会话开始/重置，LLM 轮次开始，工具前后，轮次结束，最终会话结束，子 Agent 开始/停止，人工输入请求/解除。`on_session_end` 是一轮运行结束；只有 `on_session_finalize` 关闭会话。子角色使用真实 `child_session_id`，并链接 `parent_session_id`；缺少身份时丢弃，绝不借用上一个活跃会话。

工具调用由真实 `tool_call_id` 配对。`terminal` 命令只在内存中送入原有保守分类器，落盘前移除。`read_file/search_files/write_file/patch` 等精确工具名对应阅读、检索、编码。`post_tool_call.status` 的 `ok/error/blocked/cancelled` 保留为明确结果，未知结果不推断成功。人工输入以 `request_id` 配对，只观察等待是否解除，不读取回答或作出审批。[官方 Hooks 说明](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks)

所有 Python 回调返回 `None`。尤其 `pre_tool_call` 支持阻止/修改工具的指令，本插件只将最小字段放入 64 项有界队列，回调不等磁盘或子进程。后台 worker 调用本应用原有被动观察器；写入仍使用同一 0600、8 MiB 轮换 JSONL 合约。队列满、超时或应用路径失效只会漏掉观察，不会回答、审批、修改工具或启动任务。轮次和最终结束的观察回调最多排空队列两秒，降低短命 CLI 丢尾事件风险。

验证包含独立临时 home 的安装/移除 mock、外部文件与符号链接保护，以及真实 Python 插件 → Node 观察器子进程 → JSONL → bridge → session store 的合成协议链。未在真实 Hermes 对话中启动模型；本机 Hermes bootstrap 的隔离导入会尝试准备依赖，已中止，因此不把它计为真实客户端验证。

## 原项目已经提供的能力与损失

阅读的固定版本是 `c52e2df6ff778bf85310166882c516385f2f6eab`，下面的链接都固定到该提交，避免主分支变化。

- [hooks/cursor-hook.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/hooks/cursor-hook.js)：将稳定对话映射为 `session_id`，有 reading/typing/building 动画提示，但发送给服务的 body 未保留原始工具参数和调用 ID，无法精确区分测试、构建或并发工具。
- [hooks/codex-hook.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/hooks/codex-hook.js)：保留工具名、ID、参数指纹，刻意不传原始输入；`Stop` 使用占位状态，由服务端再判断。工具名 `Bash` 本身不足以准确识别读文件、跑测试或构建。
- [hooks/clawd-hook.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/hooks/clawd-hook.js)：已有保守的测试命令/结果分类，保留调用关联与子 Agent 来源，以及后台工作数量。公开 `agent_id` 表示工具种类，真正的子身份另存 `subagent_id`；不可把前者直接当房间角色 ID。
- [test/clawd-hook.test.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/test/clawd-hook.test.js)：包含子身份、后台任务、测试命令、复合命令误判用例。文件自身说明多数测试是纯 helper；不能当成真实工具端到端录制。
- [test/codex-hook.test.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/test/codex-hook.test.js)：覆盖 session/turn、工具字段、审批清洗、继续 Stop、跨轮输出等，适合提取回归边界。
- [test/cursor-hook-delivery.test.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/test/cursor-hook-delivery.test.js)：启动实际 hook 子进程和本地 recorder，验证 stdin 到 HTTP 的输送；输入依旧是测试构造。
- [test/claude-stop-disposition.test.js](https://github.com/rullerzhou-afk/clawd-on-desk/blob/c52e2df6ff778bf85310166882c516385f2f6eab/test/claude-stop-disposition.test.js)：验证确定的后台子任务不能误触发完成。

建议在 hook 进程里从工具参数提取**最小活动摘要**，传结构化活动、命令类别、调用 ID 与证据等级；不必把完整源码、提示或终端输出传给渲染器。原项目 `/state` 是适配后的宠物状态，不等于供应商原始协议。

## 建议的 normalized event contract

这是 Mini Office 自己的协议，不声称由三家供应商直接提供。具体字段以本文“已实现的适配器接口”和实现文件为准；供应商、原始事件名与证据等级始终留在事件中，方便把动画表现追溯到真实活动。

角色运行状态与活动拆开：`active / waiting-user / waiting-tool / idle / completed / error / disconnected` 描述生命周期；`activity` 决定房间位置和动作。这样“等待测试结果”与“等待用户确认”不会共用同一个休息动画。

根角色键以 `provider + sessionId` 建立；子角色增加供应商明确给出的 child ID，持有父键。多个 Codex session 即使同一目录、同一进程、相同标题也不能合并。项目路径用于分房，不作为 session ID。无稳定标识的事件进诊断区，不能投递到一个共享 `default` 角色。标题只是可变标签。

缺少原生工具调用 ID 的协议使用 `activity` 观察事件，不编造调用 ID，也不计入可配对的 `activeTools`。开始事件保留已知活动；返回只在明确失败时显示错误，其余保持“观察中”或已有可确认的其他工具活动。它不能结束其他工具、解除人工输入等待或抹去待收尾的轮次。CodeWhale 的环境变量协议属于这种情况，只有真实 `DEEPSEEK_SESSION_ID` 才能投递。

## 活动到房间的映射

- 明确 Read/Grep/Glob 或严格识别的 `cat/sed/rg`：资料书架，拿书、翻页；证据为工具类型或命令分类。
- 规划工具或明确的计划阶段：白板，画连接和便签；普通没有工具事件的间隙只显示“处理中”，不声称已观察模型内部思考。
- Edit/Write/apply_patch：个人工位，坐下打字，文件卡片落在桌面。按每 session 固定工位，避免拥挤与抢座。
- 直接调用已识别的测试 runner：测试台，放下测试盒、运行指示灯；只有明确结果证据才亮绿灯或红灯。
- 已识别 build 命令：装配台，组装积木；`Shell/Bash` 但命令未知：普通工具台，不一律包装成构建。
- 确定需要审批或问答：到前台举提示板，保留独立等待徽标；同房其他角色继续自己的工作。
- 已启动工具仍未结束：站在设备旁等待；不会因等待超过几秒就自己去睡觉。
- 子任务明确开始：临时小伙伴从入口出现，沿路径到相关区域；仅知道子任务存在而不知道活动时，留在协作桌并显示“协作中”。
- 结束一轮且没有已知待办：简短收拾与喝水。明确关闭 session 后再离场。完成表现属于本轮，任务卡保留可继续的身份。
- 工具失败：检查红灯、挠头；下一次有效工具开始即可恢复。单次失败不代表整个任务失败。

动画属于对事件的表达，不应成为编造后续工作的事件源。新事件可以打断走路；角色先抵达合理交互点再触发操作循环。展示可短暂缓动，详情里的真实状态与时间应立即更新。

## 必须覆盖的回归与现场验证

合成 fixtures 应明确标 `source: fixture` 与源文档，不混进真实模式。最小回归序列：同工具三 session 并发、同角色两个并发工具、迟到的旧 turn 结果、重复投递、缺 ID、重开同 session、子任务不同 ID、Stop 后后台仍在、审批立即放行、中断、断连、失败后恢复、会话关闭后恢复。

命令分类加入反例：`echo 'npm test'`、`rg 'npm test'`、注释、脚本文件名、`setup && npm test` 在 setup 失败、`npm test && build` 在 build 失败，都不能伪造“测试失败”。调用分类与结果分类分别验证。复合 shell 的整体退出码不证明某个子步骤结果。

现场验收应分别在三个真实客户端里：打开两条对话，读文件、改文件、执行一条已知测试、制造一次可恢复失败、触发一次合法审批或问答、结束/中断并恢复；仅安装观察 hooks，不替用户发起模型请求。保存脱敏后的真实输入为 `captured` fixtures，记录版本、命令、期望事件、缺失能力。没有实际观察到的供应商/状态，验收报告标“未验证”，不能靠 fixture 测试通过宣称已接入。

本次研究只验证了文档和原项目源码；没有发起真实 AI 任务、安装用户级 hooks 或采集用户对话。

## 已实现的适配器接口

实现文件为 `office/lib/provider-events.cjs`，导出 `normalizeEvent(provider, raw, {receivedAt, source})`、`classifyShell(command)`、`actorKey(provider, sessionId, subagentId)`。当前对外合同如下：

```ts
type NormalizedEvent = {
  id: string; eventId: string; provider: 'codex' | 'cursor' | 'claude-code';
  sessionId: string; parentId?: string; subagentId?: string;
  turnId?: string; toolCallId?: string; at: number;
  event: 'session-start' | 'turn-start' | 'tool-start' | 'tool-end' |
    'waiting-user' | 'subagent-start' | 'subagent-end' | 'turn-end' |
    'session-end' | 'interrupted' | 'error' | 'metadata';
  activity: 'reading' | 'searching' | 'planning' | 'coding' | 'designing' |
    'building' | 'testing' | 'running' | 'waiting-user' | 'waiting-tool' |
    'idle' | 'error' | 'unknown';
  title?: string; projectPath?: string; toolName?: string; summary: string;
  outcome?: 'success' | 'failure' | 'cancelled' | 'unknown';
  evidence: {source: string; rawEvent: string; confidence: string};
};
```

`id` 是角色身份，包含转义后的 provider/session/child 组件，避免冒号碰撞。`eventId` 是事件摘要，有工具 ID 时允许重复投递去重；无调用关联时包含接收时间。`at` 是毫秒时间戳；调用者应传 `Date.now()`，未提供合法接收时间或原始时间时为 `0`，函数本身不读取时钟。事件 ID 不是供应商普遍保证提供的原生 event ID。

`source` 默认 `hook`。只有显式 `upstream` / `upstream-derived` 才接受原项目已转换的 `raw.event`；官方 hook 使用 `hook_event_name`。缺失稳定 ID、未知供应商、未知事件返回 `null`。已知事件缺少活动细节时返回 `unknown`；尤其不会从宠物 SVG 名称反推真实活动。

命令分类使用受限词法分析，只识别直接调用、可选的目录切换及有限 shell 包装。复合脚本、重定向、管道、展开、无法确认的工具留为 `running/unknown`。工具结果仅识别结构化数值退出码、明确取消/错误字段，以及成功/失败事件本身的语义；不会搜索回复里的“成功/失败”字样。工具失败摘要不会声称复合命令中的某个测试步骤失败。

测试命令为 `node --test test/provider-events.test.cjs`。包含 20 个明确注明 `official-example` / `upstream-derived` 的输入案例和 15 项身份、并发、去重、隐私、命令反例、结果边界回归；通过这些测试不等于供应商真实现场验收通过。

## Cursor 被动响应的本机静态核实

官方文档将 `preToolUse`、`subagentStart` 列为可阻断 hooks，因此不能仅凭“观察器”名称认定任意 stdout 都无害。本机已安装 Cursor CLI `2026.10.01-e373342` 的 `index.js`（SHA-256 `f6bd8dece34b56431ee74f1ac827e032d054381085e7da7088e85abdd1008330`）中，这两个事件的响应验证器都仅在 `permission` 非 `undefined` 时验证枚举，故空对象 `{}` 是该版本可接受的无决定响应；`beforeSubmitPrompt` 的 `continue` 字段也可省略。这是静态代码证据，未运行 AI 任务，不能外推到所有 Cursor 桌面版本。

观察器应始终输出合法 `{}`、退出 `0`，不设置 `failClosed`，不返回 `permission`、`continue:false`、`followup_message` 或修改工具的字段。实际客户端仍需按版本验证载入和不干预原生工作流。
