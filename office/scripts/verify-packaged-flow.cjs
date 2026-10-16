'use strict';

// This is a synthetic protocol check, not a live-provider or visual review.
// Every production module and hook is loaded from the already-built app.asar.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

if (process.argv[2] !== '--packaged-flow-child') {
  const appPath = path.resolve(process.argv[2] || path.join(__dirname, '../../dist-mini-office/mac-arm64/AI Mini Office.app'));
  const executable = path.join(appPath, 'Contents/MacOS/AI Mini Office');
  const archive = path.join(appPath, 'Contents/Resources/app.asar');
  const child = spawnSync(executable, [__filename, '--packaged-flow-child', archive], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 * 1024,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) console.error(child.error.message);
  process.exitCode = child.status === 0 ? 0 : 1;
} else {
  run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}

async function run() {
  assert.ok(process.versions.electron, 'Must use the packaged Electron runtime');
  const archive = path.resolve(process.argv[3]);
  const { createObserverBridge } = require(path.join(archive, 'lib/observer-bridge.cjs'));
  const { createSessionStore } = require(path.join(archive, 'lib/session-store.cjs'));
  const Scene = require(path.join(archive, 'lib/scene-model.js'));
  const { PROVIDER_IDS } = require(path.join(archive, 'lib/provider-catalog.cjs'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-packaged-flow-'));
  const dataDir = path.join(scratch, 'data');
  const isolatedHome = path.join(scratch, 'home');
  const project = path.join(scratch, 'office-project');
  const otherProject = path.join(scratch, 'writing-project');
  for (const dir of [dataDir, path.join(dataDir, 'events'), isolatedHome, project, otherProject]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const store = createSessionStore({ staleMs: 180000 });
  const delivered = [];
  const checks = [];
  let assertions = 0;
  let catalogProvidersVerified = 0;
  let packagedNativeLockVerified = false;
  let packagedTomlVerified = false;
  const bridge = createObserverBridge({
    dataDir, homeDir: isolatedHome, env: {}, appRoot: archive, electronPath: process.execPath,
    onEvent(event) { delivered.push(event); store.ingest(event); },
  });
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const actor = id => {
    const session = store.snapshot().find(item => item.id === id);
    assert.ok(session, 'Missing actor ' + id);
    return session;
  };
  const expectActor = (id, activity, status, zone) => {
    const session = actor(id);
    assert.equal(session.activity, activity, id + ' activity');
    assert.equal(session.status, status, id + ' status');
    assert.equal(Scene.activitySpec(session).zone, zone, id + ' physical station');
    assert.equal(session.evidence.source, 'hook');
    assertions += 4;
    return session;
  };
  const codex = (id, turn, extra = {}) => ({ session_id: id, turn_id: turn, cwd: project, ...extra });
  const cursor = (generation, extra = {}) => ({ conversation_id: 'flow-cursor', generation_id: generation, workspace_roots: [project], ...extra });
  const claude = (extra = {}) => ({ session_id: 'flow-claude', prompt_id: 'prompt-1', cwd: otherProject, ...extra });

  async function send(provider, event, payload, options = {}) {
    const target = delivered.length + 1;
    const child = spawnSync(process.execPath, [path.join(archive, 'hooks/observe.cjs'), '--provider', provider, '--event', event, '--mini-office-observer-v1'], {
      env: { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: '1', MINI_OFFICE_DATA_DIR: dataDir },
      input: options.emptyInput ? '' : JSON.stringify(options.nativeRaw ? payload : { ...payload, hook_event_name: event }), encoding: 'utf8', timeout: 10000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    assert.deepEqual(JSON.parse(child.stdout), {}, 'The observer must never decide approval');
    const deadline = Date.now() + 5000;
    while (delivered.length < target && Date.now() < deadline) await pause(25);
    assert.equal(delivered.length, target, provider + ' ' + event + ' must reach the packaged bridge');
  }
  async function check(name, fn) { await fn(); checks.push(name); }

  bridge.start();
  try {
    await check('three concurrent Codex sessions and two other providers retain five independent roots in two project rooms', async () => {
      for (const id of ['a', 'b', 'c']) await send('codex', 'UserPromptSubmit', codex('flow-' + id, 'turn-' + id, { prompt: 'Synthetic fixture ' + id + '\nDO_NOT_PERSIST_SECOND_LINE_FLOW_FIXTURE' }));
      await send('cursor', 'beforeSubmitPrompt', cursor('generation-1', { prompt: 'Synthetic Cursor fixture' }));
      await send('claude-code', 'UserPromptSubmit', claude({ prompt: 'Synthetic Claude fixture' }));
      assert.equal(store.snapshot().length, 5);
      assert.equal(Scene.roomsFor(store.snapshot()).length, 2);
      for (const id of ['a', 'b', 'c']) expectActor('codex:flow-' + id, 'planning', 'active', 'board');
      expectActor('cursor:flow-cursor', 'planning', 'active', 'board');
      expectActor('claude-code:flow-claude', 'planning', 'active', 'board');
    });

    await check('documented hook schemas drive testing, coding, reading, building, user attention and a distinct helper to their stations', async () => {
      await send('codex', 'PreToolUse', codex('flow-a', 'turn-a', { tool_name: 'Bash', tool_use_id: 'test-a', tool_input: { command: 'npm test' } }));
      await send('codex', 'PreToolUse', codex('flow-b', 'turn-b', { tool_name: 'apply_patch', tool_use_id: 'patch-b', tool_input: { command: '*** Begin Patch\n*** End Patch' } }));
      await send('codex', 'PreToolUse', codex('flow-c', 'turn-c', { tool_name: 'Bash', tool_use_id: 'read-c', tool_input: { command: 'cat README.md' } }));
      await send('cursor', 'preToolUse', cursor('generation-1', { tool_name: 'Shell', tool_use_id: 'build-cursor', tool_input: { command: 'npm run build' } }));
      await send('claude-code', 'PreToolUse', claude({ tool_name: 'AskUserQuestion', tool_use_id: 'question-claude', tool_input: { questions: [] } }));
      await send('claude-code', 'PreToolUse', claude({ tool_name: 'Read', tool_use_id: 'parallel-read-claude', tool_input: { file_path: '/synthetic/README.md' } }));
      await send('codex', 'SubagentStart', codex('flow-a', 'turn-a', { agent_id: 'helper-a', agent_type: 'reviewer' }));
      expectActor('codex:flow-a', 'testing', 'active', 'bench');
      expectActor('codex:flow-b', 'coding', 'active', 'desk');
      expectActor('codex:flow-c', 'reading', 'active', 'library');
      expectActor('cursor:flow-cursor', 'building', 'active', 'bench');
      assert.equal(expectActor('claude-code:flow-claude', 'waiting-user', 'waiting', 'front').attention, true);
      assert.equal(expectActor('codex:flow-a:helper-a', 'waiting-tool', 'active', 'bench').parentId, 'codex:flow-a');
      const inProject = store.snapshot().filter(session => Scene.inRoom(session, project) && !Scene.isClosed(session));
      assert.equal(inProject.length, 5);
      // The two build roots and their helper cannot borrow the library to
      // manufacture a five-body page. Every identity must remain reachable.
      for (const session of inProject) {
        const selected = Scene.pageSessions(store.snapshot(), project, 0, session.id);
        assert.ok(selected.visible.some(item => item.id === session.id), session.id + ' must be selectable');
        assert.equal(selected.seats.fits, true);
        for (const item of selected.visible) assert.ok(Scene.stationCompatible(selected.seats.get(item.id), Scene.activitySpec(item).zone), item.id + ' must use its own station');
        for (let i = 0; i < selected.visible.length; i++) for (let j = i + 1; j < selected.visible.length; j++) {
          const a = selected.visible[i], b = selected.visible[j];
          assert.equal(Scene.actorsOverlap(selected.seats.get(a.id), { helper: !!a.parentId }, selected.seats.get(b.id), { helper: !!b.parentId }), false);
        }
      }
    });

    await check('Stop waits for tools and children; other sessions cannot release an unrelated question', async () => {
      await send('codex', 'Stop', codex('flow-a', 'turn-a'));
      assert.equal(expectActor('codex:flow-a', 'waiting-tool', 'active', 'bench').turnCompletedAt, undefined);
      await send('codex', 'PostToolUse', codex('flow-b', 'turn-b', { tool_name: 'apply_patch', tool_use_id: 'patch-b', tool_response: { exit_code: 0 } }));
      await send('codex', 'Stop', codex('flow-b', 'turn-b'));
      assert.equal(expectActor('codex:flow-b', 'idle', 'idle', 'sofa').closed, false);
      await send('codex', 'PostToolUse', codex('flow-c', 'turn-c', { tool_name: 'Bash', tool_use_id: 'read-c', tool_response: 'A fixture file, with no numeric exit evidence' }));
      assert.equal(delivered.at(-1).outcome, 'unknown', 'Output prose cannot prove a successful command');
      await send('codex', 'PermissionRequest', codex('flow-c', 'turn-c', { tool_name: 'Bash', tool_use_id: 'permission-c', tool_input: { command: 'npm ci' } }));
      expectActor('codex:flow-c', 'waiting-user', 'waiting', 'front');
      await send('claude-code', 'PostToolUse', claude({ tool_name: 'Read', tool_use_id: 'parallel-read-claude', tool_response: 'A synthetic concurrent read result' }));
      expectActor('claude-code:flow-claude', 'waiting-user', 'waiting', 'front');
      await send('codex', 'PostToolUse', codex('flow-a', 'turn-a', { tool_name: 'Bash', tool_use_id: 'test-a', tool_response: { exit_code: 0 } }));
      assert.equal(expectActor('codex:flow-a', 'waiting-tool', 'active', 'bench').turnCompletedAt, undefined);
      await send('codex', 'SubagentStop', codex('flow-a', 'turn-a', { agent_id: 'helper-a' }));
      assert.ok(expectActor('codex:flow-a', 'idle', 'idle', 'sofa').turnCompletedAt);
      assert.equal(expectActor('codex:flow-a:helper-a', 'idle', 'closed', 'archive').closed, true);
    });

    await check('Cursor generations reuse one actor and late old-generation results do not overwrite new work', async () => {
      await send('cursor', 'postToolUse', cursor('generation-1', { tool_name: 'Shell', tool_use_id: 'build-cursor', tool_output: '{"exitCode":0,"stdout":"synthetic output"}' }));
      await send('cursor', 'stop', cursor('generation-1', { status: 'completed' }));
      assert.equal(expectActor('cursor:flow-cursor', 'idle', 'idle', 'sofa').closed, false);
      await send('cursor', 'beforeSubmitPrompt', cursor('generation-2', { prompt: 'Synthetic next generation' }));
      await send('cursor', 'preToolUse', cursor('generation-2', { tool_name: 'Read', tool_use_id: 'read-cursor', tool_input: { file_path: '/synthetic/README.md' } }));
      await send('cursor', 'postToolUse', cursor('generation-1', { tool_name: 'Shell', tool_use_id: 'late-old-call', tool_output: '{"exitCode":1}' }));
      assert.equal(expectActor('cursor:flow-cursor', 'reading', 'active', 'library').turnId, 'generation-2');
      assert.equal(store.snapshot().filter(item => item.provider === 'cursor').length, 1);
    });

    await check('answering Claude clears only its correlated question; only SessionEnd closes its room actor', async () => {
      await send('claude-code', 'PostToolUse', claude({ tool_name: 'AskUserQuestion', tool_use_id: 'question-claude', tool_response: { answers: { fixture: 'yes' } } }));
      assert.equal(expectActor('claude-code:flow-claude', 'planning', 'active', 'board').attention, false);
      expectActor('codex:flow-c', 'waiting-user', 'waiting', 'front');
      await send('claude-code', 'Stop', claude());
      assert.equal(expectActor('claude-code:flow-claude', 'idle', 'idle', 'sofa').closed, false);
      await send('claude-code', 'SessionEnd', claude());
      assert.equal(expectActor('claude-code:flow-claude', 'idle', 'closed', 'archive').closed, true);
      assert.equal(Scene.roomsFor(store.snapshot()).length, 1);
    });

    await check('numeric test failure reaches the problem bench and interruption never creates a success celebration', async () => {
      await send('codex', 'UserPromptSubmit', codex('flow-a', 'turn-a2', { prompt: 'Synthetic failure recovery' }));
      await send('codex', 'PreToolUse', codex('flow-a', 'turn-a2', { tool_name: 'Bash', tool_use_id: 'test-a2', tool_input: { command: 'npm test' } }));
      await send('codex', 'PostToolUse', codex('flow-a', 'turn-a2', { tool_name: 'Bash', tool_use_id: 'test-a2', tool_response: { exit_code: 1 } }));
      assert.equal(Scene.needsAttention(expectActor('codex:flow-a', 'error', 'active', 'bench')), true);
      await send('codex', 'Interrupt', codex('flow-a', 'turn-a2'));
      assert.equal(expectActor('codex:flow-a', 'idle', 'idle', 'sofa').turnCompletedAt, undefined);
      expectActor('codex:flow-c', 'waiting-user', 'waiting', 'front');
    });

    await check('all28 native or delivered callback dialects cross the packaged passive collector and bridge as independent actors', async () => {
      const shared='catalog-shared-task';
      // These are deliberately vendor/callback-shaped inputs, not pre-normalized
      // office events. Equal chat IDs across tools must remain separate actors.
      const cases={
        'claude-code':['UserPromptSubmit',{session_id:shared,prompt_id:'catalog-turn'}],
        'deepseek-harness':['turn/start',{type:'turn/start',session:{id:shared}}],
        codex:['UserPromptSubmit',{session_id:shared,turn_id:'catalog-turn'}],
        'copilot-cli':['userPromptSubmitted',{sessionId:shared}],
        'gemini-cli':['BeforeAgent',{session_id:shared}],
        'antigravity-cli':['PreInvocation',{conversationId:shared}],
        cursor:['beforeSubmitPrompt',{conversation_id:shared,generation_id:'catalog-turn'}],
        codebuddy:['UserPromptSubmit',{session_id:shared}],
        'kiro-cli':['userPromptSubmit',{cwd:project}],
        kirocrew:['UserPromptSubmit',{session_key:shared}],
        'kimi-cli':['UserPromptSubmit',{session_id:shared}],
        'qwen-code':['UserPromptSubmit',{session_id:shared}],
        zcode:['UserPromptSubmit',{session_id:shared}],
        codewhale:['message_submit',{}, {emptyInput:true,env:{DEEPSEEK_SESSION_ID:shared,DEEPSEEK_WORKSPACE:project,DEEPSEEK_PROMPT:'DO_NOT_PERSIST_CATALOG_PROMPT',DEEPSEEK_MODEL:'DO_NOT_PERSIST_CATALOG_MODEL',DEEPSEEK_ERROR:'DO_NOT_PERSIST_CATALOG_ERROR'}}],
        opencode:['session.created',{type:'session.created',properties:{info:{id:shared}}}],
        mimocode:['session.created',{type:'session.created',properties:{info:{id:shared}}}],
        pi:['before_agent_start',{type:'before_agent_start',session_id:shared}],
        omp:['before_agent_start',{type:'before_agent_start',session_id:shared}],
        openclaw:['model_call_started',{type:'model_call_started',sessionId:shared}],
        hermes:['pre_llm_call',{session_id:shared,turn_id:'catalog-turn'}],
        qoder:['UserPromptSubmit',{session_id:shared}],
        reasonix:['UserPromptSubmit',{session_id:shared}],
        qoderwork:['UserPromptSubmit',{session_id:shared}],
        qwenwork:['UserPromptSubmit',{session_id:shared}],
        workbuddy:['UserPromptSubmit',{session_id:shared}],
        traecode:['UserPromptSubmit',{session_id:shared}],
        'grok-build':['user_prompt_submit',{hookEventName:'user_prompt_submit',sessionId:shared,promptId:'catalog-turn'}],
        minimax:['UserPromptSubmit',{session_id:shared}],
      };
      assert.deepEqual(Object.keys(cases).sort(),PROVIDER_IDS.map(id=>id==='cursor-agent'?'cursor':id).sort(),'Fixture covers the actual complete packaged catalog');
      const ids=new Set(),providers=new Set();
      for(const [provider,[event,payload,options]] of Object.entries(cases)){
        await send(provider,event,{cwd:project,prompt:'Synthetic packaged provider fixture\nDO_NOT_PERSIST_CATALOG_PROMPT',assistant_response:'DO_NOT_PERSIST_CATALOG_ANSWER',answers:{fixture:'DO_NOT_PERSIST_CATALOG_ANSWER'},...payload},{nativeRaw:true,...options});
        const sessionId=provider==='kiro-cli'?'cwd:'+createHash('sha256').update(project).digest('hex').slice(0,24):shared;
        const id=provider+':'+encodeURIComponent(sessionId),normalized=delivered.at(-1);
        assert.equal(normalized.provider,provider);assert.equal(normalized.id,id);assert.equal(normalized.sessionId,sessionId);assert.equal(normalized.evidence.rawEvent,event);assertions+=4;
        const idle=provider==='opencode'||provider==='mimocode';
        expectActor(id,idle?'idle':'planning',idle?'idle':'active',idle?'sofa':'board');
        ids.add(id);providers.add(normalized.provider);
      }
      assert.equal(ids.size,28,'Every tool has a distinct actor namespace');assert.equal(providers.size,28);
      catalogProvidersVerified=providers.size;
    });

    await check('packaged unpacked native helper excludes KiroCrew writers and packaged TOML handles isolated Kimi configuration', async () => {
      assert.equal(process.platform,'darwin','The delivered app and native helper target macOS');
      const {withNativeLock}=require(path.join(archive,'lib/native-lock.cjs'));
      const {mutateSpecial}=require(path.join(archive,'lib/special-integrations.cjs'));
      const toml=require(path.join(archive,'node_modules/@iarna/toml'));
      const fixtureHome=path.join(scratch,'integration-home'),fixtureData=path.join(scratch,'integration-data');
      const directory=path.join(fixtureHome,'.kiro','crew');fs.mkdirSync(directory,{recursive:true,mode:0o700});
      const file=path.join(directory,'hooks.json'),original={hooks:[{id:'foreign',event:'Stop',command:'keep packaged fixture'}]};
      fs.writeFileSync(file,JSON.stringify(original),{mode:0o600});
      const spec={directory,gateway:path.join(directory,'gateway.lock'),store:file+'.lock'};
      fs.writeFileSync(spec.gateway,'fixture gateway ownership content',{mode:0o600});
      const helper=path.join(archive,'assets/helpers/mini-office-flock').replace(/\.asar([/\\])/ ,'.asar.unpacked$1');
      fs.accessSync(helper,fs.constants.X_OK);assert.ok(fs.statSync(helper).isFile(),'Native helper is materialized outside ASAR');
      const options={provider:'kirocrew',homeDir:fixtureHome,dataDir:fixtureData,appRoot:archive,electronPath:process.execPath,env:{},withNativeLock};
      await withNativeLock(spec,async()=>{
        await assert.rejects(withNativeLock(spec,()=>assert.fail('A competing writer must never enter the operation')),/正在使用/);
        const blocked=await mutateSpecial(options,true);assert.equal(blocked.status,'error');assert.deepEqual(JSON.parse(fs.readFileSync(file)),original);
      });
      assert.equal(fs.readFileSync(spec.gateway,'utf8'),'fixture gateway ownership content');
      const connected=await mutateSpecial(options,true);assert.equal(connected.status,'ok',connected.message);assert.equal(JSON.parse(fs.readFileSync(file)).hooks.length,5);
      const removed=await mutateSpecial(options,false);assert.equal(removed.status,'ok',removed.message);assert.deepEqual(JSON.parse(fs.readFileSync(file)),original);
      packagedNativeLockVerified=true;

      const kimiDir=path.join(fixtureHome,'.kimi-code'),kimiFile=path.join(kimiDir,'config.toml');fs.mkdirSync(kimiDir,{recursive:true,mode:0o700});
      const kimiBefore='model = "synthetic-fixture"\n# Preserve this comment and literal spaces.\ncustom = "两个  空格"\n';
      fs.writeFileSync(kimiFile,kimiBefore,{mode:0o600});
      const kimiOptions={...options,provider:'kimi-cli'};
      const kimiConnected=await mutateSpecial(kimiOptions,true);assert.equal(kimiConnected.status,'ok',kimiConnected.message);
      const parsed=toml.parse(fs.readFileSync(kimiFile,'utf8'));assert.equal(parsed.model,'synthetic-fixture');assert.equal(parsed.custom,'两个  空格');assert.ok(parsed.hooks.length>=10);
      const kimiRemoved=await mutateSpecial(kimiOptions,false);assert.equal(kimiRemoved.status,'ok',kimiRemoved.message);assert.equal(fs.readFileSync(kimiFile,'utf8'),kimiBefore);
      packagedTomlVerified=true;
    });

    assert.equal(fs.readdirSync(isolatedHome).length, 0, 'No provider configuration must be created');
    for (const event of delivered) {
      for (const field of ['prompt', 'user_message','assistant_response','conversation_history','tool_input', 'tool_response', 'tool_output', 'answers']) assert.equal(Object.hasOwn(event, field), false);
    }
    const spool = fs.readdirSync(path.join(dataDir, 'events')).map(name => fs.readFileSync(path.join(dataDir, 'events', name), 'utf8')).join('');
    assert.equal(spool.includes('DO_NOT_PERSIST_SECOND_LINE_FLOW_FIXTURE'), false);
    assert.equal(spool.includes('A synthetic concurrent read result'), false);
    for(const marker of ['DO_NOT_PERSIST_CATALOG_PROMPT','DO_NOT_PERSIST_CATALOG_ANSWER','DO_NOT_PERSIST_CATALOG_MODEL','DO_NOT_PERSIST_CATALOG_ERROR'])assert.equal(spool.includes(marker),false,marker+' must not enter the spool');
    console.log(JSON.stringify({
      ok: true, synthetic: true, liveProviderVerification: false, visualInspection: false,
      packagedElectron: process.versions.electron, packagedVersion: require(path.join(archive, 'package.json')).version,
      deliveredEvents: delivered.length, actorStateAssertions: assertions, checks,
      catalogProvidersVerified,packagedNativeLockVerified,packagedTomlVerified,isolatedConfigurationFixtures:true,
      providerConfigurationUntouched: true, approvalResponses: 'all empty objects',
    }, null, 2));
  } finally {
    bridge.stop();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
