/* UI copy only. Do not pass task titles, prompts, names, paths or tool output to translate. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeI18n = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Stable keys are for copy containing user-provided values. Parameters are inserted
  // literally, never translated or interpreted as HTML. Render with textContent.
  const keys = Object.freeze({
    'app.name': ['小小工作室', 'AI Mini Office'],
    'app.title': ['小小工作室 · AI Mini Office', 'AI Mini Office'],
    'language.label': ['语言', 'Language'],
    'language.description': ['选择界面语言，任务名称保持原样。', 'Choose the interface language. Task names stay as written.'],
    'language.zh': ['中文', '中文'],
    'language.en': ['English', 'English'],
    'language.switchToEnglish': ['切换到 English', 'Switch to English'],
    'language.switchToChinese': ['切换到中文', 'Switch to Chinese'],
    'settings.title': ['房间偏好', 'Room preferences'],
    'dayCycle.title': ['香港的一天', 'A day in Hong Kong'],
    'dayCycle.description': ['依照香港时间变换天色，也可以预览喜欢的时段。', 'The light follows Hong Kong time. Preview any part of the day.'],
    'dayCycle.auto': ['跟随香港时间', 'Follow Hong Kong time'],
    'dayCycle.dawn': ['晨曦', 'Dawn'],
    'dayCycle.morning': ['上午', 'Morning'],
    'dayCycle.afternoon': ['午后', 'Afternoon'],
    'dayCycle.sunset': ['日落', 'Sunset'],
    'dayCycle.night': ['夜晚', 'Night'],
    'dayCycle.clock': ['香港时间', 'Hong Kong time'],
    'dayCycle.preview': ['时段预览', 'Time preview'],
    'dayCycle.live': ['回到此刻', 'Back to now'],
    'identity.title': ['任务身份', 'Task identity'],
    'identity.name': ['角色昵称', 'Nickname'],
    'identity.description': ['每个任务都有固定的名字和外观，重新进门也能认出来。', 'Each task keeps its name and appearance, even when it returns.'],
    'identity.localDescription': ['这个名字只在工作室内使用，不会重命名原始会话。', 'This name is local to the office. The original session keeps its name.'],
    'identity.auto': ['保持自动命名', 'Use automatic names'],
    'identity.restore': ['恢复自动名称', 'Restore automatic name'],
    'identity.parent': ['协助 {name}', 'Helping {name}'],
    'family.clonesSummary': ['分身 {active} 活跃 · 累计 {total}', '{active} active clones · {total} total'],
    'room.overview': ['全部项目 · {count} 个主 Agent', 'All projects · {count} main agents'],
    'room.showAll': ['另有 {count} 个主 Agent · 查看全部', '{count} more main agents · Show all'],
    'family.clonesHint': ['累计保留本次观察期间出现过的独立分身；活跃只统计当前有工作依据的分身。', 'Total retains distinct clones observed in this app session; active requires current work evidence.'],
    'family.leader': ['领队 · {count} 位帮手', 'Leader · {count} helpers'],
    'identity.provider': ['{name} · 来自 {provider}', '{name} · from {provider}'],
    'door.enter': ['进入办公室', 'Enter the office'],
    'door.entering': ['正在进门', 'Coming in'],
    'door.retire': ['收工离开', 'Heading out'],
    'door.retiring': ['正在离开', 'Leaving'],
    'door.resting': ['门外休息', 'On a break outside'],
    'door.description': ['一轮结束后会暂离，有新工作再回来。', 'Agents step out after a turn and return when new work arrives.'],
    'room.option': ['{name} · {count} 项', '{name} · {count} tasks'],
    'room.helpersSuffix': [' + {count} 帮手', ' + {count} helpers'],
    'room.attentionSuffix': [' · {count} 待处理', ' · {count} need attention'],
    'room.quietOption': ['{name} · 暂时安静', '{name} · quiet for now'],
    'actor.ariaLabel': ['{provider} · {title}，{state}。单击查看详情，双击打招呼。', '{provider} · {title}, {state}. Click for details; double-click to wave.'],
    'announce.attention': ['{provider} 的“{title}”需要你查看，请回到原工具处理。', '“{title}” in {provider} needs your attention. Open the original tool to continue.'],
    'inspector.backToTool': ['请回到 {provider} 回答或处理审批。', 'Return to {provider} to answer or handle approval.'],
    'connections.connecting': ['正在连接 {provider}…', 'Connecting {provider}…'],
    'connections.removing': ['正在移除 {provider} 观察配置…', 'Removing {provider} observation setup…'],
    'connections.ariaLabel': ['连接 AI 工具，{count} 个正在观察', 'Connect AI tools, {count} being observed'],
    'display.fallback': ['显示器 {id}', 'Display {id}'],
    'display.option': ['{name} · {width} × {height}', '{name} · {width} × {height}'],
    'display.primarySuffix': [' · 主屏', ' · Primary']
  });

  const phrases = [
    ['今日活跃 Agent', 'Agents active today'],
    ['按香港日期统计实际观察到的 Agent，同一会话多轮只计一次；主 Agent 与分身分别去重，重启后保留。', 'Unique agents observed active per Hong Kong day. Repeated turns count once; main agents and clones are counted separately and retained after restart.'],
    ['Agent 大小', 'Agent size'],
    ['同步调整角色与名牌，房间自动安排间距。', 'Scale characters and nameplates together. Spacing adjusts automatically.'],
    ['恢复的等待状态', 'Restored observed wait'],
    ['分身出现', 'Clone appearing'],
    ['结束分身', 'Releasing clone'],
    ['结束分身。', 'Clone released.'],
    ['分身暂歇', 'Clone resting'],
    ['分身暂歇。', 'Clone resting.'],
    ['等分身归位', 'Waiting for clones'],
    ['演示故事', 'Demo story'],
    ['伙伴昵称', 'Agent names'],
    ['海港名字与小性格，只在工作室里使用。', 'Harbour names and little personalities, just for the office.'],
    ['经典昵称', 'Classic names'],
    ['海港昵称', 'Harbour names'],
    ['工作室里的小性格', 'A little office personality'],
    ['打个招呼', 'Say hello'],
    ['香港的一天', 'A day in Hong Kong'],
    ['依照香港时间变换天色，也可以预览喜欢的时段。', 'The light follows Hong Kong time. Preview any part of the day.'],
    ['跟随香港时间', 'Follow Hong Kong time'],
    ['晨曦', 'Dawn'],
    ['上午', 'Morning'],
    ['午后', 'Afternoon'],
    ['日落', 'Sunset'],
    ['夜晚', 'Night'],
    ['香港时间', 'Hong Kong time'],
    ['时段预览', 'Time preview'],
    ['回到此刻', 'Back to now'],
    ['重新加载','Reload plugin'],
    ['闲时串门', 'Idle visitors'],
    ['安静时有访客来逛逛；真实任务入驻就让路。', 'A guest drops by when it is quiet and makes room for real tasks.'],
    ['子任务 · 父任务未在场', 'Helper · parent is outside'],
    ['AI 小小工作室', 'AI Mini Office'],
    ['迷你办公室，书架、构思白板、构建实验台、代码工位、咖啡休息角和成果架围绕中央通路', 'A miniature office with a library, planning board, build bench, coding desks, coffee corner and results shelf around a central walkway'],
    ['当前项目的任务角色', 'Task characters in this project'],
    ['所有项目的任务角色', 'Task characters from all projects'],
    ['项目房间', 'Project room'],
    ['连接 AI 工具', 'Connect AI tools'],
    ['搜索 AI 工具', 'Search AI tools'],
    ['搜索 AI 工具…', 'Search AI tools…'],
    ['房间偏好与显示器', 'Room preferences and displays'],
    ['关闭错误提示', 'Dismiss error'],
    ['上一组任务', 'Previous group of tasks'],
    ['下一组任务', 'Next group of tasks'],
    ['从头播放演示', 'Restart demo'],
    ['任务详情', 'Task details'],
    ['关闭任务详情', 'Close task details'],
    ['关闭连接面板', 'Close connections'],
    ['关闭伙伴列表', 'Close roster'],
    ['关闭房间偏好', 'Close room preferences'],
    ['资料书架', 'Library'],
    ['构思白板', 'Planning board'],
    ['构建实验台', 'Build bench'],
    ['代码工位', 'Coding desks'],
    ['咖啡休息角', 'Coffee corner'],
    ['成果架', 'Results shelf'],
    ['观察位', 'Observation spot'],
    ['离开房间', 'Leaving the room'],
    ['工作室门口', 'Office door'],
    ['小小工作室，等大家入驻。', 'A little office, ready for your agents.'],
    ['连接正在使用的 AI 工具，', 'Connect the AI tools you use.'],
    ['任务会自己找到书架、工位和休息角。', 'Tasks find their way to books, desks and the coffee corner.'],
    ['连接正在使用的 AI 工具，任务会自己找到书架、工位和休息角。', 'Connect your AI tools. Tasks find their way to books, desks and the coffee corner.'],
    ['先看看演示 →', 'Try the demo →'],
    ['这里观察任务动态，确认与审批留在原工具里。', 'Watch task activity here. Answer and approve in the original tool.'],
    ['这个房间暂时安静下来。', 'This room is quiet for now.'],
    ['其他项目的伙伴仍会继续工作。', 'Agents in other projects keep working.'],
    ['实时观察', 'Live view'],
    ['正在打开办公室…', 'Opening the office…'],
    ['房间里的伙伴', 'Agents in the room'],
    ['模拟事件', 'Simulated events'],
    ['暂停', 'Pause'],
    ['下一幕 →', 'Next scene →'],
    ['回到实时', 'Back to live'],
    ['临时帮手', 'Temporary helper'],
    ['帮手', 'Helper'],
    ['独立任务', 'Independent task'],
    ['打开项目文件夹 ↗', 'Open project folder ↗'],
    ['角色行动来自观察事件', 'Actions follow observed events'],
    ['最近活动与判断依据', 'Recent activity and evidence'],
    ['让伙伴们入驻', 'Welcome your agents'],
    ['每个独立任务成为一个角色。工具事件决定它去哪里、做什么；审批与回答继续在原工具完成。', 'Each independent task gets a character. Tool events guide its actions and location. Answer and approve in the original tool.'],
    ['Codex 的官方 hooks 需要在 Codex 中审核信任后才会生效。已有会话的日志可作为只读补充；无法判断的事件会显示“观察中”。', 'Review and trust official hooks in Codex to enable them. Existing session logs provide read-only signals. Unrecognized activity appears as “Observing”.'],
    ['回到办公室', 'Back to the office'],
    ['每项任务都有自己的位置', 'A place for every task'],
    ['同一工具的独立 session 分别入驻。选择任务，可以在房间中找到它。', 'Independent sessions from the same tool arrive separately. Select a task to find it in the room.'],
    ['把小房间放到喜欢的地方', 'Find a home for your little office'],
    ['晚间灯光', 'Evening light'],
    ['温暖的台灯，安静的夜色。', 'Warm lamps for a quiet evening.'],
    ['窗外细雨', 'Rain outside'],
    ['只改变环境，不代表任务状态。', 'Sets the mood, independent of task status.'],
    ['减少动作', 'Reduce motion'],
    ['保留位置与状态，暂停角色循环及装饰动作。', 'Keep positions and states; pause looping and decorative motion.'],
    ['节能观察', 'Low power view'],
    ['保留状态变化，减少持续动画与场景特效。', 'Keep state changes; reduce continuous animation and effects.'],
    ['放到哪块屏幕？', 'Which display?'],
    ['移到这块屏幕', 'Move to this display'],
    ['推荐在 1280 × 720 副屏全屏观看。', 'Best viewed full screen on a 1280 × 720 secondary display.'],
    ['动作取自 Clawd on Desk。房间只呈现有依据的活动：安静不等于睡觉，一轮完成也不会关闭会话。', 'Animations by Clawd on Desk. The room shows observed activity: quiet does not mean sleeping, and a finished turn keeps the session open.'],
    ['房间只呈现有依据的活动：安静不等于睡觉。一轮结束后会暂离，有新工作再回来。', 'The room shows observed activity: quiet does not mean sleeping. Agents step out after a turn and return for new work.'],
    ['完成', 'Done'],
    ['操作未完成', 'Action could not be completed'],
    ['桌面连接尚未就绪，请重新打开小小工作室。', 'The desktop connection is not ready. Reopen AI Mini Office.'],
    ['操作未完成，请稍后重试。', 'Action could not be completed. Try again shortly.'],
    ['角色素材未能加载，请重新打开应用。任务状态仍在观察。', 'Character art could not load. Reopen the app. Task observation continues.'],
    ['角色素材暂未加载，后续状态更新会重试。任务状态仍在观察。', 'Character art is temporarily unavailable. A later state update will retry. Task observation continues.'],
    ['房间背景未能加载，请重新打开应用。', 'The room background could not load. Reopen the app.'],
    ['尚未收到事件', 'No events yet'],
    ['刚刚收到事件', 'Event just received'],
    ['工具 hook 事件', 'Tool hook event'],
    ['只读会话日志', 'Read-only session log'],
    ['事件来源未提供', 'Event source unavailable'],
    ['明确事件', 'Explicit event'],
    ['基于工具类型判断', 'Based on tool type'],
    ['活动尚不确定', 'Activity uncertain'],
    ['查看原始事件核对', 'Check the original event'],
    ['找找这里的线索', 'Looking for clues'],
    ['把思路理一理', 'Sorting out the plan'],
    ['开始动手', 'Getting to work'],
    ['看看运行结果', 'Checking the results'],
    ['需要你看一下', 'Need your attention'],
    ['等下一项工作', 'Ready for the next task'],
    ['这一轮完成', 'Turn finished'],
    ['这一份交给你', 'Over to you'],
    ['这一轮完成啦', 'All done for this turn'],
    ['把这一轮收好', 'Putting this turn away'],
    ['会话还在，等下一轮', 'Session open, ready for the next turn'],
    ['会话结束，收拾一下', 'Session ended, packing up'],
    ['这次先收工啦', 'Calling it a day'],
    ['出去歇一会儿', 'Stepping out for a break'],
    ['有新工作再回来', 'Back when there is new work'],
    ['门外休息', 'On a break outside'],
    ['请回原工具看一下', 'Please check the original tool'],
    ['收到，你也在这里呀', 'Oh, hello there!'],
    ['单击查看详情，双击打招呼。', 'Click for details; double-click to wave.'],
    ['未命名任务', 'Untitled task'],
    ['未分类项目', 'Unsorted project'],
    ['未分组', 'Ungrouped'],
    ['演示中的模拟项目，不对应本地文件夹。', 'A simulated demo project with no local folder.'],
    ['最后位置已保留，尚不能确认当前进度。', 'Last position retained; current progress is unknown.'],
    ['此按钮打开 Finder。任务与对话请回到原工具查看。', 'Opens Finder. View tasks and conversations in the original tool.'],
    ['收到活动事件', 'Activity event received'],
    ['尚无可显示的活动记录', 'No activity to show yet'],
    ['正在观察', 'Observing'],
    ['等待新会话事件', 'Waiting for session events'],
    ['已配置 · 等待工具产生事件', 'Configured · Waiting for tool events'],
    ['已配置', 'Configured'],
    ['等待工具产生事件', 'Waiting for tool events'],
    ['尚未接入', 'Not connected'],
    ['同一个工具的多个 session 会分别入驻。', 'Each session from the same tool gets its own character.'],
    ['添加状态观察 hooks，保留原有配置。', 'Add observation hooks while preserving existing configuration.'],
    ['移除配置', 'Remove setup'],
    ['连接', 'Connect'],
    ['实时办公室 · 等待任务入驻', 'Live office · Waiting for tasks'],
    ['暂停事件', 'Pause events'],
    ['继续演示', 'Resume demo'],
    ['演示房间', 'Demo room'],
    ['当前是模拟演示，点击回到实时观察', 'Demo mode. Click to return to live observation'],
    ['当前是实时观察，点击体验演示房间', 'Live view. Click to explore the demo room'],
    ['已保存到这台 Mac。', 'Saved on this Mac.'],
    ['已移除观察配置；本地只读观察仍可继续', 'Observation setup removed; local read-only observation may continue'],
    ['已移除本应用的观察配置。', 'This app’s observation setup has been removed.'],
    ['配置已就绪，请在 Codex 中审核 hooks 信任，再开始新任务。', 'Setup ready. Review hook trust in Codex, then start a new task.'],
    ['观察配置已就绪，请在原工具开始一个任务。', 'Observation setup ready. Start a task in the original tool.'],
    ['主屏', 'Primary'],
    ['办公室已移到选中的屏幕。', 'Office moved to the selected display.'],
    ['读代码', 'Reading code'],
    ['查阅资料', 'Reading material'],
    ['查找线索', 'Finding clues'],
    ['检索文件与资料', 'Searching files and material'],
    ['构思方案', 'Planning'],
    ['梳理下一步', 'Planning the next step'],
    ['写代码', 'Coding'],
    ['修改项目文件', 'Editing project files'],
    ['设计中', 'Designing'],
    ['推敲设计', 'Refining the design'],
    ['构建中', 'Building'],
    ['等待构建结果', 'Waiting for build results'],
    ['测一测', 'Testing'],
    ['执行测试', 'Running tests'],
    ['运行工具', 'Running a tool'],
    ['执行命令', 'Running a command'],
    ['等你回复', 'Waiting for you'],
    ['请回到原工具处理', 'Continue in the original tool'],
    ['工具运行中', 'Tool running'],
    ['等待工具返回', 'Waiting for the tool'],
    ['这一轮已歇下', 'Taking a break'],
    ['会话仍在，等待下一项工作', 'Session open, waiting for new work'],
    ['遇到问题', 'Something went wrong'],
    ['请查看原工具的错误', 'Check the error in the original tool'],
    ['观察中', 'Observing'],
    ['尚无可识别的工作事件', 'No recognized work event yet'],
    ['信号暂未更新', 'Signal has not updated'],
    ['保留最后观察位置，不推测工作进度', 'Keeping the last observed position; progress is unknown'],
    ['会话已结束', 'Session ended'],
    ['归档并离开房间', 'Archiving and leaving the room'],
    ['读取资料', 'Reading material'],
    ['检索项目', 'Searching the project'],
    ['整理计划', 'Planning'],
    ['修改代码', 'Editing code'],
    ['构建项目', 'Building the project'],
    ['运行测试', 'Running tests'],
    ['执行工具', 'Running a tool'],
    ['等待你的确认', 'Waiting for your confirmation'],
    ['等待工具结果', 'Waiting for tool results'],
    ['本轮已停下', 'Turn stopped'],
    ['遇到问题，等待后续活动', 'An error occurred; waiting for further activity'],
    ['工具活动，类别待确认', 'Tool activity; category uncertain'],
    ['工具已中断', 'Tool interrupted'],
    ['工具执行未成功', 'Tool execution failed'],
    ['工具返回', 'Tool returned'],
    ['工具已返回，结果待确认', 'Tool returned; outcome uncertain'],
    ['会话已进入工作室', 'Session entered the office'],
    ['收到新任务', 'New task received'],
    ['请求审批，可能需要你确认', 'Approval requested; your confirmation may be needed'],
    ['等待你的输入', 'Waiting for your input'],
    ['协作伙伴开始工作', 'Helper started working'],
    ['协作伙伴本轮已停下', 'Helper stopped this turn'],
    ['协作伙伴遇到问题', 'Helper encountered an error'],
    ['主响应停下，仍有后台活动', 'Main response stopped; background activity continues'],
    ['本轮已停下，可继续对话', 'Turn stopped; conversation can continue'],
    ['本轮遇到问题', 'An error occurred this turn'],
    ['本轮已中断', 'Turn interrupted'],
    ['需要你的关注', 'Needs your attention'],
    ['整理上下文', 'Organizing context'],
    ['会话元信息更新', 'Session metadata updated'],
    ['已收到你的输入，等待后续活动', 'Your input was received; waiting for further activity'],
    ['任务正在推进', 'Task in progress'],
    ['正在修改代码', 'Editing code'],
    ['正在读取资料', 'Reading material'],
    ['正在检索', 'Searching'],
    ['正在运行测试', 'Running tests'],
    ['正在构建', 'Building'],
    ['正在执行工具', 'Running a tool'],
    ['观察到任务活动', 'Task activity observed'],
    ['本轮已终止，未完整观察到该工具结果', 'Turn ended before the full tool result was observed'],
    ['观察到模型活动', 'Model activity observed'],
    ['恢复正在进行的任务状态', 'Restoring an ongoing task’s observed state'],
    ['观察到会话活动', 'Session activity observed'],
    ['尚未安装观察配置；连接后只记录活动，不控制 AI', 'Observation is not configured. Connecting records activity without controlling AI'],
    ['观察配置已安装；请在 Codex /hooks 审核信任，收到真实事件后才可确认生效', 'Observation configured. Review trust in Codex /hooks; incoming events confirm it is active'],
    ['当前 Cursor 3.24.12 被动响应已静态核实；真实活动仍以收到的事件为准', 'Passive responses were checked against Cursor 3.24.12 code. Incoming events confirm actual activity'],
    ['保守兼容：只观察完成和结束事件；当前桌面版本的开始事件尚未核实', 'Compatibility mode: observing completion and end events only. Start events in this desktop version are unverified'],
    ['观察配置已安装；Claude Code 真实客户端收发尚待验证', 'Observation configured. Events from a live Claude Code client are not yet verified'],
    ['没有本应用拥有的观察配置', 'No observation setup owned by this app'],
    ['观察配置正在被另一操作使用；未接管锁，请稍后重试', 'Another operation is using the observation setup. Its lock was preserved; try again shortly'],
    ['活动记录不是普通文件，已停止读取', 'Activity log is not a regular file; reading stopped'],
    ['活动记录的轮换锁仍存在；轮换竞争或遗留锁可能漏记事件，AI 继续正常运行', 'A log rotation lock exists. Rotation contention or a leftover lock may skip events; AI continues normally'],
    ['活动记录备份无法安全确认，已保留；轮换暂停，AI 继续正常运行', 'The log backup could not be verified and was preserved. Rotation paused; AI continues normally'],
    ['活动记录备份来源不明，已保留；轮换暂停，AI 继续正常运行', 'The log backup source is unknown and was preserved. Rotation paused; AI continues normally'],
    ['活动记录暂时无法安全检查；观察可能漏记，AI 继续正常运行', 'Activity logs cannot currently be checked safely. Events may be skipped; AI continues normally'],
    ['不支持的 AI 工具', 'Unsupported AI tool'],
    ['不支持的观察事件', 'Unsupported observation event'],
    ['Cursor hooks 配置版本未知，已保留原文件', 'Unknown Cursor hooks configuration version; the original file was preserved'],
    ['配置 JSON 已损坏，未自动修复', 'Configuration JSON is invalid; no automatic repair was made'],
    ['配置顶层或重复键有歧义，未改动', 'Ambiguous configuration structure or duplicate keys; no changes made'],
    ['配置 hooks 不是对象，未改动', 'Configuration hooks is not an object; no changes made'],
    ['配置在准备期间被修改；请重试', 'Configuration changed during preparation; try again'],
    ['配置在写入前被修改；已保留外部修改', 'Configuration changed before writing; external changes were preserved'],
    ['配置超过安全读取上限，已保留', 'Configuration exceeds the read limit and was preserved'],
    ['读取时配置身份改变', 'Configuration file changed while being read'],
    ['自定义 AI 配置目录必须是明确的绝对路径', 'Custom AI configuration directories must be explicit absolute paths'],
    ['任务身份', 'Task identity'],
    ['身份名称', 'Identity name'],
    ['任务名', 'Task name'],
    ['为这位伙伴取个名字', 'Name this agent'],
    ['仅在本机显示', 'Shown only on this Mac'],
    ['新任务入驻', 'New task arriving'],
    ['离开办公室', 'Leave the office'],
    ['界面语言', 'Interface language'],
    ['切换语言', 'Switch language']
  ];

  // Only fixed connection/backend copy is reversible. Ordinary English task
  // text, names, tool output and product names never enter a general translator.
  const connectionPhrases = [
    ['无法安全确认网关路径指针','unsafe gateway pointer'],
    ['无法安全确认网关套接字','unsafe gateway socket'],
    ['网关响应超时','gateway timeout'],
    ['网关响应超过读取上限','gateway response too large'],
    ['网关响应格式不受支持','unsupported gateway response'],
    ['网关响应不完整','incomplete gateway response'],
    ['网关身份与目标目录不符','gateway identity mismatch'],
    ['未确认观察钩子已加载','observer hooks not confirmed'],
    ['Hermes 只读插件已安装；可重新加载运行中的网关，以收到真实事件为准','Hermes observer is installed. Reload it into the running gateway; live events confirm activity.'],
    ['Hermes 只读插件已安装；未确认运行中的网关，请启动网关后重新加载，以收到真实事件为准','Hermes observer is installed, but a running gateway was not confirmed. Start the gateway and reload the plugin.'],
    ['Hermes 网关已确认观察钩子；无需重启，活动以收到真实事件为准','The running Hermes gateway confirmed the observer hooks. No restart is needed; activity follows real events.'],
    ['被动观察配置；仅收到真实事件后确认客户端生效', 'Passive observation configured; incoming events confirm the client is active'],
    ['已安装只读插件；请开始新的工具会话加载插件，以实际事件确认连接。', 'Passive plugin installed; start a new host session to load it. Actual events confirm the connection.'],
    ['连接会安装本应用拥有的只读活动插件，并保留其他插件与原生审批。', 'Connect installs an owned passive activity plugin; existing plugins and approvals are preserved.'],
    ['请先初始化工具的 profile，再连接。', 'Initialize the host profile before connecting.'],
    ['请先初始化工具的 profile，再连接', 'Initialize the host profile before connecting'],
    ['已安装只读观察器；请开始新的客户端会话，以实际事件确认生效。', 'Passive observer installed; start a new client session. Real events confirm activation.'],
    ['已安装只读 hooks。使用 Kiro 内置 Agent 时，需切换到生成的 mini-office Agent，以实际事件确认生效。', 'Passive hooks installed. Built-in Kiro agents require switching to the generated mini-office agent. Real events confirm activation.'],
    ['连接仅添加工作室的活动观察器，保留原生审批和其他 hooks。', 'Connect adds only Mini Office activity observers; native approvals and foreign hooks stay in place.'],
    ['已移除本应用拥有的插件文件与注册项。', 'Removed only Mini Office owned plugin files and registrations.'],
    ['已移除本应用拥有的活动观察 hooks。', 'Removed only Mini Office owned observation hooks.'],
    ['另一个插件操作正在进行，请稍后重试。', 'Another plugin operation is in progress; retry later.'],
    ['另一个观察配置操作正在进行，请稍后重试。', 'Another observer operation is in progress; retry later.'],
    ['观察配置需要安全读取器、绝对目录和命令构造器', 'Upstream observation planner needs safe reader, absolute home, and command builder'],
    ['不支持的命令观察配置格式', 'Unsupported command observation format'],
    ['AI 配置目录必须是明确的绝对路径', 'AI configuration home must be an explicit absolute path'],
    ['进程 hook 需要观察器的绝对调用路径', 'Process hook needs absolute observer invocation paths'],
    ['观察器配置组的结构未知', 'Observer group has an unknown structure'],
    ['AI hooks 的结构未知', 'AI hooks has an unknown structure'],
    ['AI hooks.events 的结构未知', 'AI hooks.events has an unknown structure'],
    ['Copilot hook 配置版本未知，已保留原文件', 'Copilot hook schema version is unknown; original preserved'],
    ['插件路径必须是明确的绝对路径', 'Plugin path must be an explicit absolute path'],
    ['插件路径包含无法确认的目录或符号链接，已保留', 'Plugin path contains an untrusted directory or symlink; preserved'],
    ['插件或配置文件无法安全确认，已保留', 'Plugin/config file cannot be safely confirmed; preserved'],
    ['插件或配置文件的身份已改变', 'Plugin/config identity changed'],
    ['现有插件不属于本应用，已保留', 'Existing plugin is not owned by Mini Office; preserved'],
    ['插件所有权记录无效，已保留', 'Invalid plugin ownership manifest; preserved'],
    ['插件被其他程序修改，已保留', 'Plugin was changed outside Mini Office; preserved'],
    ['插件包含其他文件，已保留', 'Plugin contains external files; preserved'],
    ['不支持的只读插件工具', 'Unsupported passive plugin provider'],
    ['OpenClaw 配置引用了其他文件，已保留', 'OpenClaw config includes other files; preserved'],
    ['OpenClaw plugins 必须是对象', 'OpenClaw plugins must be an object'],
    ['用户已禁用 OpenClaw 插件，已保留', 'OpenClaw plugins are disabled by the user; preserved'],
    ['OpenClaw 插件允许列表必须是数组', 'OpenClaw plugin allowlist must be an array'],
    ['OpenClaw 同名允许列表条目不属于本应用，已保留', 'OpenClaw same-name allowlist entry is externally owned; preserved'],
    ['OpenClaw 插件配置结构不明确，已保留', 'OpenClaw plugin shape is ambiguous; preserved'],
    ['OpenClaw 插件路径列表必须是数组', 'OpenClaw plugin paths must be an array'],
    ['OpenClaw 同名注册项被外部创建或修改，已保留', 'OpenClaw same-name registration is externally owned/changed; preserved'],
    ['请先初始化 DeepSeek Harness 的 profile，已保留配置', 'Initialize the DeepSeek Harness profile first; preserved'],
    ['DSH dependencies 必须是对象', 'DSH dependencies must be an object'],
    ['DSH 同名依赖被外部创建或修改，已保留', 'DSH same-name dependency is externally owned/changed; preserved'],
    ['同路径插件注册项没有可核实的所有者，已保留', 'Same-path plugin registration has no verified owner; preserved'],
    ['工具配置在准备期间改变，已保留', 'Host config changed while preparing; preserved'],
    ['工具配置在提交前改变，已保留', 'Host config changed before commit; preserved'],
    ['无法确认 OpenCode 版本，已保留配置', 'OpenCode version could not be confirmed; config preserved'],
    ['OpenCode 版本未知，请先安装 CLI 再连接', 'OpenCode version is unknown; install its CLI before connecting'],
    ['插件所有权在提交前改变，已保留', 'Plugin ownership changed before commit; preserved'],
    ['AI 配置必须是对象，已保留', 'AI config must be an object; preserved'],
    ['观察器参数无效', 'Invalid observer argument'],
    ['不支持的特殊格式观察工具', 'Unsupported special observer provider'],
    ['Kimi hooks 不是数组，已保留', 'Kimi hooks is not an array; preserved'],
    ['CodeWhale hooks 不是表，已保留', 'CodeWhale hooks is not a table; preserved'],
    ['用户已禁用 CodeWhale hooks，已保留', 'CodeWhale hooks were disabled by the user; preserved'],
    ['观察器 TOML 配置块被外部修改，已保留', 'Observer TOML block changed externally; preserved'],
    ['观察器 TOML 所有权标记格式有误，已保留', 'Observer TOML ownership marker is malformed; preserved'],
    ['Kiro Agent hooks 结构未知，已保留', 'Kiro agent hooks has an unknown structure; preserved'],
    ['Kiro hook 事件不是数组，已保留', 'Kiro hook event is not an array; preserved'],
    ['KiroCrew hook 配置必须包含数组，已保留', 'KiroCrew hook store must contain an array; preserved'],
    ['MiniMax 插件所有权不明，已保留', 'MiniMax plugin has unknown ownership; preserved'],
    ['MiniMax 观察器被外部修改，已保留', 'MiniMax observer changed externally; preserved'],
    ['MiniMax 观察器存在其他文件，已保留', 'MiniMax observer has external files; preserved'],
    ['MiniMax 观察器包含其他文件，已保留', 'MiniMax observer contains external files; preserved'],
    ['请先初始化自定义 Kiro Agent 或安装 kiro-cli，再连接', 'Initialize a custom Kiro agent or install kiro-cli before connecting'],
    ['MiniMax 所有权在提交前改变，已保留', 'MiniMax ownership changed before commit; preserved'],
    ['KiroCrew 原生网关或配置锁工具不可用，已保留配置', 'KiroCrew native gateway/store lock helper is unavailable; config preserved'],
    ['KiroCrew 观察配置目前需要 macOS 原生锁工具', 'KiroCrew observation configuration currently requires the macOS native lock helper'],
    ['原生配置锁参数无效', 'Invalid native lock specification'],
    ['原生配置锁握手无效', 'Native lock handshake is invalid'],
    ['JSONC 注释未结束', 'Unterminated JSONC comment'],
    ['配置嵌套超过上限', 'Config nesting exceeds limit'],
    ['配置字符串未结束', 'Unterminated config string'],
    ['配置键重复或无效', 'Duplicate or invalid config key'],
    ['配置对象无效', 'Invalid config object'],
    ['配置分隔符无效', 'Invalid config separator'],
    ['配置未结束', 'Unterminated config'],
    ['配置值无效', 'Invalid config value'],
    ['配置必须是单个对象', 'Config must be one object'],
    ['Hermes 只读插件已安装；新会话或手动重启网关后生效，以收到真实事件为准', 'Hermes observation plugin installed. Start a new session or manually restart the gateway; real events confirm activation'],
    ['连接后安装 Hermes 只读插件；不接管审批，不自动重启 Hermes', 'Connecting installs a passive Hermes plugin. Approvals stay in Hermes, which is not restarted automatically'],
    ['Hermes 插件目录无法安全确认，未改动', 'Hermes plugin directory could not be verified; no changes made'],
    ['Hermes 插件文件无法安全确认，已保留', 'Hermes plugin file could not be verified and was preserved'],
    ['Hermes 插件读取期间改变', 'Hermes plugin changed while being read'],
    ['HERMES_HOME 必须是明确的绝对路径', 'HERMES_HOME must be an explicit absolute path'],
    ['Hermes 同名插件不是本应用拥有，已保留', 'The same-name Hermes plugin is not owned by this app and was preserved'],
    ['Hermes 插件被外部修改，已保留', 'Hermes plugin was changed externally and was preserved'],
    ['Hermes 插件包含其他文件，已保留', 'Hermes plugin contains external files and was preserved'],
    ['未找到 Hermes CLI；请先安装 Hermes Agent', 'Hermes CLI was not found. Install Hermes Agent before connecting'],
    ['没有本应用拥有的 Hermes 插件', 'No Hermes plugin owned by this app'],
    ['未找到 Hermes CLI；已保留插件，请恢复 Hermes 后移除', 'Hermes CLI was not found. The plugin was preserved; restore Hermes before removing it'],
    ['Hermes 插件准备期间改变，已保留', 'Hermes plugin changed during preparation and was preserved'],
    ['Hermes 插件目标已出现，已保留', 'The Hermes plugin target appeared during preparation and was preserved'],
    ['Hermes 插件文件已就绪，但 CLI 启用未成功；请重试连接', 'Hermes plugin files are ready, but CLI activation failed. Try connecting again'],
    ['Hermes CLI 禁用未成功；已保留插件', 'Hermes CLI could not disable the plugin; its files were preserved'],
    ['Hermes 插件移除前改变，已保留', 'Hermes plugin changed before removal and was preserved'],
    ['已移除本应用拥有的 Hermes 只读插件', 'This app’s passive Hermes plugin has been removed'],
    ['Hermes 插件正在被另一操作使用，请稍后重试', 'Another operation is using the Hermes plugin. Try again shortly'],
    ['KiroCrew 正在使用配置；请结束网关后重试', 'KiroCrew is using the configuration. Stop its gateway and try again'],
    ['KiroCrew 原生配置锁无法取得，未改动', 'The native KiroCrew configuration lock could not be acquired; no changes made'],
    ['KiroCrew 原生配置锁超时，未改动', 'The native KiroCrew configuration lock timed out; no changes made'],
    ['KiroCrew 原生配置锁已释放，未改动', 'The native KiroCrew configuration lock was released; no changes made'],
    ['KiroCrew 原生配置锁意外释放，请重新检查配置', 'The native KiroCrew configuration lock was released unexpectedly. Check the configuration again'],
    ['本地 rollout 只读观察中', 'Observing local rollout logs without modifying them'],
    ['不支持的观察配置格式', 'Unsupported observation configuration format'],
    ['配置路径或参数包含不支持的控制字符', 'Configuration path or argument contains unsupported control characters'],
    ['无法创建配置目录', 'Could not create the configuration directory'],
    ['JSON 字符串未结束', 'Unterminated JSON string'],
    ['观察桥路径必须是绝对路径', 'Observer bridge paths must be absolute paths'],
    ['人工输入等待已结束', 'Human input wait ended'],
    ['工具已返回', 'Tool returned']
  ];
  const usagePhrases = [
    ['使用记录', 'Usage history'], ['关闭使用记录', 'Close usage history'],
    ['使用概览', 'Usage overview'], ['历史记录分页', 'Agent history pages'], ['事件时间线分页', 'Event timeline pages'],
    ['留在本机的工作足迹', 'Work footprints, kept on this Mac'],
    ['这里只统计本机已观测的 Agent 活动，不代表 token 或费用；应用关闭期间不计时，历史记录不会重新进入房间。', 'Only agent activity observed on this Mac is counted, not tokens or cost. Time while the app is closed is excluded; history never re-enters the room.'],
    ['时间范围', 'Date range'], ['近 7 天', 'Last 7 days'], ['近 30 天', 'Last 30 days'], ['全部时间', 'All time'], ['自选日期', 'Custom dates'],
    ['AI 工具', 'AI tool'], ['全部工具', 'All tools'], ['角色关系', 'Relationship'], ['全部角色', 'All agents'], ['主 Agent', 'Main agents'], ['分身', 'Clones'],
    ['开始日期（香港）', 'From (Hong Kong)'], ['结束日期（香港）', 'To (Hong Kong)'], ['刷新', 'Refresh'],
    ['Agent 历史', 'Agent history'], ['上一页', 'Previous'], ['下一页', 'Next'], ['事件时间线', 'Event timeline'], ['收起', 'Collapse'],
    ['以下时间均为香港时间 · Asia/Hong_Kong', 'All times are Hong Kong time · Asia/Hong_Kong'],
    ['导出 CSV', 'Export CSV'], ['打开日志文件夹', 'Open log folder'],
    ['记录保存在本机；此面板只展示身份、关系与活动元数据，不展示对话正文或提示词。', 'Records stay on this Mac. This panel shows identity, relationships and activity metadata, without conversation text or prompts.']
  ];
  const setupPhrases = [
    ['一键初始化本机工具','Set up local tools in one click'], ['一键初始化','Initialize tools'], ['重试失败项','Retry failures'],
    ['查看逐项结果','Per-tool results'],
    ['自动识别已有 AI 工具，逐项安装或更新观察配置，并保留原有配置。未检测到的工具会跳过；信任确认仍在原工具中完成。','Detect existing AI tools, then install or update observation configuration while preserving current settings. Undetected tools are skipped; trust is confirmed in the original tool.'],
    ['配置完成不等于已收到真实活动；下方详情会说明信任、重启或新会话要求。','Configuration does not confirm live activity. Details below show trust, restart or new-session requirements.']
  ];
  const copy = new Map([...phrases,...connectionPhrases,...usagePhrases,...setupPhrases]);
  const connectionChinese = new Map(connectionPhrases.map(([zh,en])=>[en,zh]));
  for (const [zh, en] of Object.values(keys)) if (!zh.includes('{') && zh !== en) copy.set(zh, en);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const english = (language) => typeof language === 'string' && /^en(?:[-_]|$)/i.test(language);

  function format(template, params) {
    if (!params || typeof params !== 'object') return template;
    return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (token, key) => own(params, key) ? String(params[key]) : token);
  }

  function t(language, key, params) {
    const entry = own(keys, key) ? keys[key] : null;
    return format(entry ? entry[english(language) ? 1 : 0] : String(key), params);
  }

  function fragment(value) {
    if (copy.has(value)) return copy.get(value);
    let match;
    const counts = [
      [/^(\d+) 项独立任务$/, (n) => n + ' independent task' + (n === '1' ? '' : 's')],
      [/^(\d+) 位临时帮手$/, (n) => n + ' temporary helper' + (n === '1' ? '' : 's')],
      [/^(\d+) 项信号暂未更新$/, (n) => n + ' signal' + (n === '1' ? '' : 's') + ' not updated'],
      [/^另 (\d+) 位帮手在协作$/, (n) => n + ' more helper' + (n === '1' ? '' : 's') + ' collaborating'],
      [/^其他房间 (\d+) 项待处理$/, (n) => n + ' need attention in other rooms'],
      [/^(\d+) 项需要你 →$/, (n) => n + ' need you →'],
      [/^(\d+) 个工具调用进行中$/, (n) => n + ' tool call' + (n === '1' ? '' : 's') + ' in progress'],
      [/^另 (\d+) 位伙伴 · 查看全部$/, (n) => n + ' more agent' + (n === '1' ? '' : 's') + ' · View all'],
      [/^全部 (\d+) 位伙伴$/, (n) => 'All ' + n + ' agent' + (n === '1' ? '' : 's')],
      [/^(\d+) 秒前收到事件$/, (n) => 'Event ' + n + 's ago'],
      [/^(\d+) 分钟前收到事件$/, (n) => 'Event ' + n + 'm ago'],
      [/^(\d+) 小时前收到事件$/, (n) => 'Event ' + n + 'h ago'],
      [/^判断依据 (\d{1,3})%$/, (n) => 'Confidence ' + n + '%'],
      [/^连接 AI 工具，(\d+) 个正在观察$/, (n) => 'Connect AI tools, ' + n + ' being observed'],
      [/^显示器 (\d+)$/, (n) => 'Display ' + n]
    ];
    for (const [pattern, render] of counts) {
      match = pattern.exec(value);
      if (match) return render(match[1]);
    }
    match = /^(\d+) \/ (\d+) 组$/.exec(value);
    if (match) return match[1] + ' / ' + match[2] + ' groups';
    match = /^前往(资料书架|构思白板|构建实验台|代码工位|咖啡休息角|等你回复|成果架|观察位|工作室门口|离开房间)$/.exec(value);
    if (match) return 'To ' + copy.get(match[1]);
    match = /^请回到 (Codex|Cursor|Claude Code) 回答或处理审批。$/.exec(value);
    if (match) return t('en', 'inspector.backToTool', { provider: match[1] });
    match = /^正在连接 (Codex|Cursor|Claude Code)…$/.exec(value);
    if (match) return t('en', 'connections.connecting', { provider: match[1] });
    match = /^正在移除 (Codex|Cursor|Claude Code) 观察配置…$/.exec(value);
    if (match) return t('en', 'connections.removing', { provider: match[1] });
    return null;
  }

  const hookNames=new Set(('SessionStart SessionEnd UserPromptSubmit PreToolUse PostToolUse PostToolUseFailure PermissionRequest Stop StopFailure SubagentStart SubagentStop Notification PreCompact PostCompact Elicitation ElicitationResult Interrupt sessionStart sessionEnd beforeSubmitPrompt userPromptSubmitted preToolUse postToolUse postToolUseFailure errorOccurred agentStop subagentStart subagentStop preCompact BeforeAgent BeforeTool AfterTool AfterAgent PreCompress PreInvocation PostInvocation agentSpawn userPromptSubmit stop AgentSpawn session_start session_end message_submit tool_call_before tool_call_after mode_change on_error user_prompt_submit pre_tool_use post_tool_use post_tool_use_failure stop_failure stop_cancelled notification pre_compact post_compact PermissionDenied StopCancelled PermissionResult').split(' '));
  const providerNames=new Set(['Codex','Cursor','Claude Code','Codex CLI','Cursor Agent','DeepSeek Harness (experimental)','Copilot CLI','Gemini CLI','Antigravity CLI','CodeBuddy','Kiro CLI','KiroCrew','Kimi Code','Qwen Code','ZCode','CodeWhale','OpenCode','MiMo Code','Pi','OMP','OpenClaw','Hermes Agent','Qoder','Reasonix','QoderWork','QwenWork','WorkBuddy','TraeCode','Grok Build','MiniMax Code']);
  const pathCopy=[
    ['目录不是可核实的普通目录：','Directory is not a verifiable regular directory: '],
    ['配置目录在创建时改变：','Configuration directory changed while being created: '],
    ['配置不是普通文件，已保留：','Configuration is not a regular file and was preserved: ']
  ];
  function backendFragment(value,toEnglish) {
    if (!toEnglish && connectionChinese.has(value)) return connectionChinese.get(value);
    const rolloutErrorFrom = toEnglish ? '本地 rollout 只读观察异常：' : 'Local rollout observation error: ';
    const rolloutErrorAt = value.startsWith(rolloutErrorFrom) ? 0 : value.indexOf(' · ' + rolloutErrorFrom);
    if (rolloutErrorAt >= 0) {
      const prefix = rolloutErrorAt ? value.slice(0, rolloutErrorAt) : '';
      const prefixParts = prefix ? prefix.split(' · ').map(part => backendFragment(part,toEnglish) ?? (toEnglish ? fragment(part) : connectionChinese.get(part) ?? null)) : [];
      const diagnostic = value.slice(rolloutErrorAt + (rolloutErrorAt ? 3 : 0) + rolloutErrorFrom.length);
      if (diagnostic.length > 0 && diagnostic.length <= 256 && !/[\u0000-\u001f\u007f]/.test(diagnostic)) {
        if (prefixParts.every(part => part !== null)) return (prefix ? prefixParts.join(' · ') + ' · ' : '') + (toEnglish ? 'Local rollout observation error: ' : '本地 rollout 只读观察异常：') + diagnostic;
      }
    }
    let match=(toEnglish?/^正在连接 ([^\r\n]{1,96})…$/:/^Connecting ([^\r\n]{1,96})…$/).exec(value);
    if(match&&providerNames.has(match[1]))return t(toEnglish?'en':'zh','connections.connecting',{provider:match[1]});
    match=(toEnglish?/^正在移除 ([^\r\n]{1,96}) 观察配置…$/:/^Removing ([^\r\n]{1,96}) observation setup…$/).exec(value);
    if(match&&providerNames.has(match[1]))return t(toEnglish?'en':'zh','connections.removing',{provider:match[1]});
    match=(toEnglish?/^请回到 ([^\r\n]{1,96}) 回答或处理审批。$/:/^Return to ([^\r\n]{1,96}) to answer or handle approval\.$/).exec(value);
    if(match&&providerNames.has(match[1]))return t(toEnglish?'en':'zh','inspector.backToTool',{provider:match[1]});
    // Parameters in these exact diagnostic templates remain literal. In
    // particular, whitespace and Chinese characters within paths are untouched.
    for(const [zh,en] of pathCopy){
      const from=toEnglish?zh:en,to=toEnglish?en:zh;
      if(value.startsWith(from)){
        const suffix=value.slice(from.length);
        if(suffix.length<=4096&&!/[\u0000-\u001f\u007f]/.test(suffix)&&(/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(suffix)))return to+suffix;
      }
    }
    match=(toEnglish?/^事件 ([A-Za-z][A-Za-z0-9_:/.\-]{0,95}) 的配置结构未知，未改动$/:/^Event ([A-Za-z][A-Za-z0-9_:/.\-]{0,95}) configuration has an unknown structure; no changes made$/).exec(value);
    if(match&&hookNames.has(match[1]))return toEnglish?'Event '+match[1]+' configuration has an unknown structure; no changes made':'事件 '+match[1]+' 的配置结构未知，未改动';
    match=(toEnglish?/^Hook ([A-Za-z][A-Za-z0-9_:/.\-]{0,95}) 结构未知，已保留原文件$/:/^Hook ([A-Za-z][A-Za-z0-9_:/.\-]{0,95}) has an unknown structure; original preserved$/).exec(value);
    if(match&&hookNames.has(match[1]))return toEnglish?'Hook '+match[1]+' has an unknown structure; original preserved':'Hook '+match[1]+' 结构未知，已保留原文件';
    match=(toEnglish?/^配置 (plugin|plugins) 必须是数组$/:/^Config (plugin|plugins) must be an array$/).exec(value);
    if(match)return toEnglish?'Config '+match[1]+' must be an array':'配置 '+match[1]+' 必须是数组';
    return null;
  }

  function translate(language, text) {
    const toEnglish=english(language);
    if (typeof text !== 'string' || (!toEnglish && !(typeof language==='string'&&/^zh(?:[-_]|$)/i.test(language)))) return text;
    const parts = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    const value = parts[2].replace(/\s+/g, ' ');
    let result=backendFragment(parts[2],toEnglish);
    if(result===null)result=toEnglish?fragment(value):connectionChinese.get(value)??null;
    // Composite UI statuses are accepted only when every part is known. Arbitrary
    // prose, task names and mixed user content are never partially rewritten.
    if (result === null && value.includes(' · ')) {
      const translated = parts[2].split(' · ').map(part=>backendFragment(part,toEnglish)??(toEnglish?fragment(part):connectionChinese.get(part)??null));
      if (translated.every(part => part !== null)) result = translated.join(' · ');
    }
    return result === null ? text : parts[1] + result + parts[3];
  }

  return Object.freeze({ t, translate });
});
