'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {adaptUpstream,ADAPTED_PROVIDERS}=require('../lib/upstream-adapter.cjs');
const {normalizeEvent,actorKey}=require('../lib/provider-events.cjs');
const adapt=(provider,raw,options={})=>adaptUpstream(provider,raw,{receivedAt:1000,...options},normalizeEvent);
const native={
 'deepseek-harness':{type:'turn/start',session:{id:'dsh-session'}},
 'copilot-cli':{hook_event_name:'userPromptSubmitted',sessionId:'copilot-session'},
 'gemini-cli':{hook_event_name:'BeforeAgent',session_id:'gemini-session'},
 'antigravity-cli':{hook_event_name:'PreInvocation',conversationId:'antigravity-session'},
 codebuddy:{hook_event_name:'UserPromptSubmit',session_id:'codebuddy-session'},
 'kiro-cli':{hook_event_name:'userPromptSubmit',cwd:'/actual/workspace'},
 kirocrew:{hook_event_name:'UserPromptSubmit',session_key:'crew-session'},
 'kimi-cli':{hook_event_name:'UserPromptSubmit',session_id:'kimi-session'},
 'qwen-code':{hook_event_name:'UserPromptSubmit',session_id:'qwen-session'},
 zcode:{hook_event_name:'UserPromptSubmit',session_id:'zcode-session'},
 codewhale:{hook_event_name:'message_submit',DEEPSEEK_SESSION_ID:'whale-session'},
 opencode:{type:'session.created',properties:{info:{id:'opencode-session'}}},
 mimocode:{type:'session.created',properties:{info:{id:'mimo-session'}}},
 pi:{type:'before_agent_start',session_id:'pi-session'},
 omp:{type:'before_agent_start',session_id:'omp-session'},
 openclaw:{type:'model_call_started',sessionId:'claw-session'},
 qoder:{hook_event_name:'UserPromptSubmit',session_id:'qoder-session'},
 reasonix:{hook_event_name:'UserPromptSubmit',session_id:'reasonix-session'},
 qoderwork:{hook_event_name:'UserPromptSubmit',session_id:'qoderwork-session'},
 qwenwork:{hook_event_name:'UserPromptSubmit',session_id:'qwenwork-session'},
 workbuddy:{hook_event_name:'UserPromptSubmit',session_id:'workbuddy-session'},
 traecode:{hook_event_name:'UserPromptSubmit',session_id:'trae-session'},
 'grok-build':{hookEventName:'user_prompt_submit',sessionId:'grok-session',promptId:'prompt-1'},
 minimax:{hook_event_name:'UserPromptSubmit',session_id:'minimax-session'},
};

test('all24 additional providers have actual native dialect fixtures and namespaced events',()=>{
 assert.deepEqual(Object.keys(native).sort(),[...ADAPTED_PROVIDERS].sort());
 for(const [provider,raw]of Object.entries(native)){
  const output=adapt(provider,raw);assert.ok(output,provider);
  assert.equal(output.provider,provider);assert.ok(output.id.startsWith(provider+':'),provider);
  assert.match(output.eventId,new RegExp('^'+provider+'-[a-f0-9]{24}$'));
  assert.equal(output.evidence.source,'hook');assert.ok(['session-start','turn-start'].includes(output.event),provider);
 }
});

test('reducedupstreamstate bodies retain all24 canonical providers',()=>{
 for(const provider of ADAPTED_PROVIDERS){
  const result=adapt(provider,{event:'UserPromptSubmit',session_id:'real-session',agent_id:provider},{source:'upstream'});
  assert.ok(result,provider);assert.equal(result.sessionId,'real-session');assert.equal(result.subagentId,undefined);
  assert.equal(result.evidence.source,'upstream-derived');assert.equal(result.event,'turn-start');
 }
});

test('existingfour native providers remain delegated and unknown events/IDs rejected',()=>{
 for(const provider of ['codex','cursor','cursor-agent','claude','claude-code','hermes','unknown'])assert.equal(adapt(provider,{hook_event_name:'SessionStart',session_id:'real'}),null);
 for(const session_id of [undefined,'','default','gemini:default','contains spaces'])assert.equal(adapt('gemini-cli',{hook_event_name:'BeforeAgent',session_id}),null);
 assert.equal(adapt('qoder',{hook_event_name:'ImaginedHook',session_id:'real'}),null);
 assert.equal(adapt('qoder',{hook_event_name:'SessionStart',session_id:'real',internal:true}),null);
});

test('tool name aliases drive classification but preserve native names and correlations',()=>{
 const output=adapt('gemini-cli',{hook_event_name:'BeforeTool',session_id:'real',tool_name:'run_shell_command',tool_input:{command:'npm test'},tool_use_id:'call1',turn_id:'turn1'});
 assert.equal(output.activity,'testing');assert.equal(output.toolName,'run_shell_command');
 assert.equal(output.toolCallId,'call1');assert.equal(output.turnId,'turn1');
 assert.equal(JSON.stringify(output).includes('npm test'),false);
 const unknown=adapt('gemini-cli',{hook_event_name:'BeforeTool',session_id:'real',tool_name:'mcp_test_everything'});
 assert.equal(unknown.activity,'unknown');
});

test('tool results stay unknown unless explicit structured failure/exit evidence exists',()=>{
 const base={hook_event_name:'AfterTool',session_id:'real',tool_name:'read_file',tool_use_id:'call'};
 assert.equal(adapt('gemini-cli',base).outcome,'unknown');
 assert.equal(adapt('gemini-cli',{...base,tool_response:'passed without error'}).outcome,'unknown');
 assert.equal(adapt('gemini-cli',{...base,tool_response:{exit_code:0}}).outcome,'success');
 assert.equal(adapt('gemini-cli',{...base,tool_response:{exitCode:1}}).outcome,'failure');
 assert.equal(adapt('gemini-cli',{...base,tool_response:{isError:true}}).outcome,'failure');
 assert.equal(adapt('gemini-cli',{...base,is_interrupt:true}).outcome,'cancelled');
});

test('defaultKiro is scoped to actual absolute cwd while other missing IDs are rejected',()=>{
 const a=adapt('kiro-cli',{hook_event_name:'preToolUse',cwd:'/project/a',session_id:'default'});
 const b=adapt('kiro-cli',{hook_event_name:'preToolUse',cwd:'/project/b',session_id:'default'});
 assert.ok(a);assert.ok(b);assert.notEqual(a.id,b.id);
 assert.equal(a.id,adapt('kiro-cli',{hook_event_name:'stop',cwd:'/project/a'}).id);
 assert.equal(adapt('kiro-cli',{hook_event_name:'stop',cwd:'relative/path'}),null);
 assert.equal(adapt('kiro-cli',{hook_event_name:'stop'}),null);
});

test('parent and child identities are actualprovider and stable across lifecycle/tool callbacks',()=>{
 const start=adapt('minimax',{hook_event_name:'SubagentStart',session_id:'parent',subagent_id:'child'});
 assert.equal(start.id,actorKey('minimax','parent','child'));assert.equal(start.parentId,actorKey('minimax','parent'));
 const own=adapt('kirocrew',{hook_event_name:'UserPromptSubmit',child_session_id:'child-real',parent_session_id:'parent-real',session_id:'parent-real'});
 assert.equal(own.id,actorKey('kirocrew','child-real'));assert.equal(own.parentId,actorKey('kirocrew','parent-real'));
 assert.equal(own.sessionId,'child-real');assert.equal(own.subagentId,undefined);
 const nochild=adapt('minimax',{hook_event_name:'SubagentStart',session_id:'parent'});assert.equal(nochild,null);
});

test('logical event IDs are stable with explicit call IDs and differ by actual provider',()=>{
 const raw={hook_event_name:'PostToolUse',session_id:'same',tool_use_id:'call',event_id:'native-event'};
 const a=adapt('qoder',raw),b=adapt('qoder',raw,{receivedAt:2000}),c=adapt('qwenwork',raw);
 assert.equal(a.eventId,b.eventId);assert.notEqual(a.eventId,c.eventId);
 assert.equal(a.id,actorKey('qoder','same'));
});

test('OMP continuation and OpenClaw reset boundaries cannot falsely close working sessions',()=>{
 assert.equal(adapt('omp',{type:'agent_end',session_id:'s',willContinue:true,main_session_stop_confirmed:true}),null);
 assert.equal(adapt('omp',{type:'agent_end',session_id:'s'}),null);
 assert.equal(adapt('omp',{type:'agent_end',session_id:'s',main_session_stop_confirmed:true}).event,'turn-end');
 assert.equal(adapt('openclaw',{type:'session_end',sessionId:'s',reason:'reset'}),null);
 assert.equal(adapt('openclaw',{type:'session_end',sessionId:'s',reason:'shutdown'}).event,'session-end');
});

test('workpermission events remain working observations and interrupted boundaries never succeed',()=>{
 for(const provider of ['qoderwork','qwenwork'])assert.equal(adapt(provider,{hook_event_name:'PermissionRequest',session_id:'s'}).event,'activity');
 const result=adapt('grok-build',{hook_event_name:'StopCancelled',sessionId:'s',promptId:'p'});
 assert.equal(result.event,'interrupted');assert.equal(result.outcome,'cancelled');
 assert.equal(adapt('antigravity-cli',{hook_event_name:'Stop',conversationId:'s',fullyIdle:false}).event,'activity');
});


test('anonymous tool boundaries are point-in-time activities without invented call identities',()=>{
 const before=adapt('qoder',{hook_event_name:'PreToolUse',session_id:'s',tool_name:'Read'});
 assert.equal(before.event,'activity');assert.equal(before.activity,'reading');assert.equal(before.toolCallId,undefined);
 const after=adapt('qoder',{hook_event_name:'PostToolUse',session_id:'s',tool_name:'Read'});
 assert.equal(after.event,'activity');assert.equal(after.activity,'unknown');assert.equal(after.outcome,'unknown');
 const failed=adapt('qoder',{hook_event_name:'PostToolUseFailure',session_id:'s',tool_name:'Read'});
 assert.equal(failed.event,'activity');assert.equal(failed.activity,'error');
});

test('CodeWhale environment metadata supplies actual identity and tool classification',()=>{
 const before=adapt('codewhale',{hook_event_name:'tool_call_before',DEEPSEEK_SESSION_ID:'whale-real',DEEPSEEK_TOOL_NAME:'read_file',DEEPSEEK_WORKSPACE:'/real/project'});
 assert.equal(before.event,'activity');assert.equal(before.activity,'reading');assert.equal(before.toolName,'read_file');assert.equal(before.sessionId,'whale-real');
 const after=adapt('codewhale',{hook_event_name:'tool_call_after',DEEPSEEK_SESSION_ID:'whale-real',DEEPSEEK_TOOL_EXIT_CODE:'1'});
 assert.equal(after.activity,'error');assert.equal(after.outcome,'failure');
});

test('two actual command hook deliveries append to the same owned provider spool',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-upstream-spool-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 const observer=path.join(__dirname,'../hooks/observe.cjs');
 for(const event of ['BeforeAgent','AfterAgent']){
  const result=spawnSync(process.execPath,[observer,'--provider','gemini-cli','--event',event,'--mini-office-observer-v1'],{input:JSON.stringify({session_id:'actual-client-session'}),encoding:'utf8',env:{...process.env,MINI_OFFICE_DATA_DIR:dataDir}});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'{}\n');
 }
 const records=fs.readFileSync(path.join(dataDir,'events','gemini-cli.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(records.length,2);assert.deepEqual(records.map(r=>r.event),['turn-start','turn-end']);assert.ok(records.every(r=>r.evidence.source==='hook'));
});
