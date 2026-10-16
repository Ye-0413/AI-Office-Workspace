'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const I18n = require('../lib/i18n-model.js');
const Scene = require('../lib/scene-model.js');

test('stable keys select supported locales and leave missing keys explicit', () => {
  assert.equal(I18n.t('en-US', 'app.name'), 'AI Mini Office');
  assert.equal(I18n.t('EN_gb', 'settings.title'), 'Room preferences');
  for (const locale of ['zh', 'zh-CN', 'zh-TW', 'fr', null]) assert.equal(I18n.t(locale, 'settings.title'), '房间偏好');
  assert.equal(I18n.t('en', 'not.a.known.key'), 'not.a.known.key');
  assert.equal(I18n.t('en', 'language.zh'), '中文');
  assert.equal(I18n.t('en', 'door.retire'), 'Heading out');
  assert.ok(Object.isFrozen(I18n));
});

test('fixed interface copy translates without changing Chinese output or whitespace', () => {
  assert.equal(I18n.translate('en', '连接 AI 工具'), 'Connect AI tools');
  assert.equal(I18n.translate('en', '\n  小小工作室，等大家入驻。  '), '\n  A little office, ready for your agents.  ');
  assert.equal(I18n.translate('en', '尚未安装观察配置；连接后只记录活动，不控制 AI'), 'Observation is not configured. Connecting records activity without controlling AI');
  for (const value of ['连接 AI 工具', '任意任务名', '', null, 5]) assert.equal(I18n.translate('zh-CN', value), value);
  assert.equal(I18n.translate('en', null), null);
});

test('bounded status templates handle counts, elapsed time, movement and known providers', () => {
  const cases = [
    ['1 项独立任务', '1 independent task'], ['3 项独立任务', '3 independent tasks'],
    ['2 位临时帮手', '2 temporary helpers'], ['4 个工具调用进行中', '4 tool calls in progress'],
    ['其他房间 2 项待处理', '2 need attention in other rooms'], ['1 项需要你 →', '1 need you →'],
    ['全部 8 位伙伴', 'All 8 agents'], ['2 / 3 组', '2 / 3 groups'],
    ['5 秒前收到事件', 'Event 5s ago'], ['3 分钟前收到事件', 'Event 3m ago'], ['2 小时前收到事件', 'Event 2h ago'],
    ['判断依据 90%', 'Confidence 90%'], ['前往代码工位', 'To Coding desks'],
    ['请回到 Claude Code 回答或处理审批。', 'Return to Claude Code to answer or handle approval.'],
    ['正在连接 Cursor…', 'Connecting Cursor…'], ['正在移除 Codex 观察配置…', 'Removing Codex observation setup…']
  ];
  for (const [zh, en] of cases) assert.equal(I18n.translate('en', zh), en, zh);
});

test('composite UI statuses translate only when every component is recognized', () => {
  assert.equal(I18n.translate('en', '3 项独立任务 · 1 位临时帮手 · 2 项信号暂未更新 · 另 4 位帮手在协作'), '3 independent tasks · 1 temporary helper · 2 signals not updated · 4 more helpers collaborating');
  assert.equal(I18n.translate('en', '正在观察 · 3 分钟前收到事件'), 'Observing · Event 3m ago');
  assert.equal(I18n.translate('en', '修改代码 · 工具返回'), 'Editing code · Tool returned');
  for (const unknown of ['我的任务 · 修改代码', '修改代码 · 用户自定义内容', '我要构思方案', '前往我的房间', '请回到 私人工具 回答或处理审批。', '3 项独立任务需要重新设计']) {
    assert.equal(I18n.translate('en', unknown), unknown);
  }
});

test('user values are inserted literally without recursive translation or placeholder expansion', () => {
  const title = '写代码 · {state} <b>不要改动</b>';
  const result = I18n.t('en', 'announce.attention', { provider: 'Codex', title });
  assert.equal(result, '“' + title + '” in Codex needs your attention. Open the original tool to continue.');
  assert.equal(I18n.t('en', 'room.option', { name: '构思方案', count: 2 }), '构思方案 · 2 tasks');
  assert.equal(I18n.t('en', 'identity.parent', { name: '小叶' }), 'Helping 小叶');
  assert.equal(I18n.t('en', 'room.option', { name: '项目' }), '项目 · {count} tasks');
  assert.equal(I18n.t('en', 'identity.parent', Object.create({ name: 'inherited' })), 'Helping {name}');
});

test('all current static HTML Chinese text and accessible labels have English copy', () => {
  const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
  const labels = [...html.matchAll(/(?:aria-label|title|alt|placeholder)="([^"]+)"/g)].map(match => match[1]);
  const textNodes = [...html.matchAll(/>([^<>]+)</g)].map(match => match[1].trim());
  const source = [...new Set([...labels, ...textNodes].filter(value => /\p{Script=Han}/u.test(value)))];
  assert.ok(source.includes('房间偏好') && source.includes('连接 AI 工具'), 'the coverage check must inspect both actual configuration panels');
  for (const value of source) {
    const translated = I18n.translate('en', value);
    assert.notEqual(translated, value, value);
    assert.doesNotMatch(translated, /\p{Script=Han}/u, value);
  }
});

test('scene zones, activity labels, verbs and provider fixed summaries have English copy', () => {
  const states = [...Object.values(Scene.SPECS), Scene.activitySpec({ status: 'stale' }), Scene.activitySpec({ closed: true })];
  const fixed = [...Object.values(Scene.ZONES).map(zone => zone.name), ...states.flatMap(spec => [spec.label, spec.verb]),
    '工具已中断', '工具执行未成功', '会话已进入工作室', '收到新任务', '等待你的输入', '协作伙伴开始工作', '协作伙伴本轮已停下', '主响应停下，仍有后台活动', '本轮已停下，可继续对话', '本轮遇到问题', '本轮已中断', '会话元信息更新', '已收到你的输入，等待后续活动'];
  for (const value of fixed) {
    assert.notEqual(I18n.translate('en', value), value, value);
    assert.doesNotMatch(I18n.translate('en', value), /\p{Script=Han}/u, value);
  }
});

test('the browser UMD module loads without DOM, Electron, Node or side effects', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/i18n-model.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { timeout: 1000 });
  assert.deepEqual(Object.keys(context), ['OfficeI18n']);
  assert.equal(context.OfficeI18n.translate('en', '运行测试'), 'Running tests');
  assert.equal(context.OfficeI18n.t('zh', 'app.name'), '小小工作室');
});

test('connection details switch both directions while preserving restart and profile requirements',()=>{
  const cases=[
    ['Hermes 只读插件已安装；新会话或手动重启网关后生效，以收到真实事件为准','Hermes observation plugin installed. Start a new session or manually restart the gateway; real events confirm activation'],
    ['连接后安装 Hermes 只读插件；不接管审批，不自动重启 Hermes','Connecting installs a passive Hermes plugin. Approvals stay in Hermes, which is not restarted automatically'],
    ['未找到 Hermes CLI；请先安装 Hermes Agent','Hermes CLI was not found. Install Hermes Agent before connecting'],
    ['Hermes 插件文件已就绪，但 CLI 启用未成功；请重试连接','Hermes plugin files are ready, but CLI activation failed. Try connecting again'],
    ['已安装只读 hooks。使用 Kiro 内置 Agent 时，需切换到生成的 mini-office Agent，以实际事件确认生效。','Passive hooks installed. Built-in Kiro agents require switching to the generated mini-office agent. Real events confirm activation.'],
    ['请先初始化工具的 profile，再连接。','Initialize the host profile before connecting.'],
    ['已安装只读插件；请开始新的工具会话加载插件，以实际事件确认连接。','Passive plugin installed; start a new host session to load it. Actual events confirm the connection.'],
    ['已安装只读观察器；请开始新的客户端会话，以实际事件确认生效。','Passive observer installed; start a new client session. Real events confirm activation.'],
    ['连接仅添加工作室的活动观察器，保留原生审批和其他 hooks。','Connect adds only Mini Office activity observers; native approvals and foreign hooks stay in place.'],
    ['KiroCrew 正在使用配置；请结束网关后重试','KiroCrew is using the configuration. Stop its gateway and try again'],
    ['已移除本应用拥有的插件文件与注册项。','Removed only Mini Office owned plugin files and registrations.'],
    ['被动观察配置；仅收到真实事件后确认客户端生效','Passive observation configured; incoming events confirm the client is active']
  ];
  for(const [zh,en]of cases){assert.equal(I18n.translate('en',zh),en);assert.equal(I18n.translate('zh-CN',en),zh);assert.equal(I18n.translate('en',en),en);assert.equal(I18n.translate('zh',zh),zh);}
  const en='\n  '+cases[0][1]+'  ';
  assert.equal(I18n.translate('zh',en),'\n  '+cases[0][0]+'  ');
});

test('all fixed English errors from the actual connection helpers have Chinese copy and round-trip',()=>{
  const files=['hermes-observer.cjs','upstream-integrations.cjs','plugin-integrations.cjs','special-integrations.cjs','native-lock.cjs','plugin-jsonc.cjs'];
  const messages=new Set();
  for(const file of files){const source=fs.readFileSync(path.join(__dirname,'../lib',file),'utf8');for(const match of source.matchAll(/new Error\('([^'\n]+)'\)/g))if(/^[A-Za-z]/.test(match[1])&&!/\p{Script=Han}/u.test(match[1]))messages.add(match[1]);}
  assert.ok(messages.size>=50,'coverage must read actual ownership, config and native-lock error paths');
  for(const message of messages){const zh=I18n.translate('zh',message);assert.notEqual(zh,message,message);assert.match(zh,/\p{Script=Han}/u,message);assert.equal(I18n.translate('en',zh),message,message);}
});

test('connection templates accept only known providers, hook names and config keys',()=>{
  const providers=require('../lib/provider-catalog.cjs').PROVIDERS.map(p=>p.name).concat(['Codex','Cursor']);
  for(const provider of providers){
    const zh='正在连接 '+provider+'…',en='Connecting '+provider+'…';assert.equal(I18n.translate('en',zh),en);assert.equal(I18n.translate('zh',en),zh);
    assert.equal(I18n.translate('en','正在移除 '+provider+' 观察配置…'),'Removing '+provider+' observation setup…');
    assert.equal(I18n.translate('zh','Return to '+provider+' to answer or handle approval.'),'请回到 '+provider+' 回答或处理审批。');
  }
  for(const hook of ['SessionStart','BeforeTool','beforeSubmitPrompt','postToolUseFailure','tool_call_before']){
    const en='Hook '+hook+' has an unknown structure; original preserved';const zh='Hook '+hook+' 结构未知，已保留原文件';assert.equal(I18n.translate('zh',en),zh);assert.equal(I18n.translate('en',zh),en);
  }
  assert.equal(I18n.translate('zh','Config plugins must be an array'),'配置 plugins 必须是数组');
  assert.equal(I18n.translate('en','事件 PermissionRequest 的配置结构未知，未改动'),'Event PermissionRequest configuration has an unknown structure; no changes made');
  for(const literal of ['正在连接 My Private Agent…','Connecting My Private Agent…','Hook MyTask has an unknown structure; original preserved','Config my-task must be an array'])for(const language of ['en','zh'])assert.equal(I18n.translate(language,literal),literal);
});

test('diagnostic paths retain their exact bytes and unknown paths/task content/brands stay literal',()=>{
  const suffix='/Users/example/我的  项目/Planning · 代码工位.json';
  const zh='配置不是普通文件，已保留：'+suffix,en='Configuration is not a regular file and was preserved: '+suffix;
  assert.equal(I18n.translate('en',zh),en);assert.equal(I18n.translate('zh',en),zh);
  const literals=[suffix,'Hermes Agent','AI Mini Office','Planning','Sunbeam Truffle','我的任务 · Passive plugin installed; start a new host session to load it. Actual events confirm the connection.',
    'Fix this: Plugin ownership changed before commit; preserved','配置不是普通文件，已保留：relative/path','Configuration is not a regular file and was preserved: '+ '/'.repeat(4097),
    'Hook '+ 'A'.repeat(5000)+' has an unknown structure; original preserved'];
  for(const literal of literals)for(const language of ['en','zh'])assert.equal(I18n.translate(language,literal),literal);
  const name='Passive observer installed; start a new client session. Real events confirm activation.';
  assert.equal(I18n.t('zh','identity.parent',{name}),'协助 '+name,'user parameters stay literal even if they equal fixed backend copy');
  assert.equal(I18n.translate('fr',name),name);
});
