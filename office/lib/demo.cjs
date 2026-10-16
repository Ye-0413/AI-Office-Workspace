'use strict';
const {normalizeEvent}=require('./provider-events.cjs');
const {createSessionStore}=require('./session-store.cjs');
const {VIGNETTES,getVignette,eventsForFrame}=require('./demo-vignettes.cjs');

const STORIES=Object.freeze([
  Object.freeze({id:'classic',titleZh:'经典并行演示',titleEn:'Classic parallel demo'}),
  ...VIGNETTES.map(({id,titleZh,titleEn})=>Object.freeze({id,titleZh,titleEn})),
]);
const STORY_IDS=new Set(STORIES.map(story=>story.id));
const BASE_ACTIONS=new Set(['play','pause','reset','advance']);
const CLASSIC_LABELS=Object.freeze([
  ['五位伙伴开始一轮演示','Five companions begin a demonstration'],
  ['登录、界面与文档进入修改','Login, interface, and documentation edits begin'],
  ['构建出现问题，两个任务等你确认','A build problem appears; two tasks await you'],
  ['构建继续修复，文档这一轮歇下','Build repairs continue; the documentation turn rests'],
  ['登录测完，构建重试','Login checks return; the build retries'],
  ['构建结果已返回','The build result returns'],
  ['明确结束的会话离场，待确认仍保留','Explicitly ended sessions leave; pending decisions stay'],
].map(Object.freeze));

function isDemoAction(value){
  return typeof value==='string'&&(BASE_ACTIONS.has(value)||(value.startsWith('story:')&&STORY_IDS.has(value.slice(6))));
}

// Demonstration input uses the same adapters and lifecycle reducer as live data.
// It never writes native AI configuration or sends a decision to an agent.
function createDemo({onChange=()=>{},intervalMs=6500,now=Date.now}={}){
  const store=createSessionStore({now,staleMs:3600000});let tick=0,running=false,timer=null,sequence=0,storyId='classic',runNumber=0;
  const projects={office:'/Demo/小小工作室',web:'/Demo/官网项目'};
  const cast=[
    {provider:'codex',sid:'demo-login',title:'修复登录',cwd:projects.office},
    {provider:'codex',sid:'demo-build',title:'检查构建',cwd:projects.office},
    {provider:'codex',sid:'demo-ui',title:'调整界面',cwd:projects.office},
    {provider:'cursor',sid:'demo-docs',title:'整理文档',cwd:projects.office},
    {provider:'claude-code',sid:'demo-copy',title:'修改文案',cwd:projects.web},
  ];
  function emit(who,event,extra={}){const c=cast[who];const raw=c.provider==='cursor'?{conversation_id:c.sid,generation_id:'demo-turn',workspace_roots:[c.cwd],hook_event_name:event,...extra}:{session_id:c.sid,turn_id:'demo-turn',prompt_id:'demo-turn',cwd:c.cwd,hook_event_name:event,...extra};raw.event_id='demo-'+(++sequence);const normalized=normalizeEvent(c.provider,raw,{receivedAt:now(),source:'demo'});if(normalized){normalized.title=c.title;store.ingest(normalized);}}
  function tool(who,id,name,command){emit(who,cast[who].provider==='cursor'?'preToolUse':'PreToolUse',{tool_use_id:id,tool_name:name,tool_input:command?{command}: {file_path:'src/interface.ts'}});}
  function result(who,id,name,ok=true){emit(who,cast[who].provider==='cursor'?'postToolUse':'PostToolUse',{tool_use_id:id,tool_name:name,tool_response:{exit_code:ok?0:1},tool_output:JSON.stringify({exitCode:ok?0:1})});}
  const classicSteps=[
    ()=>{cast.forEach((c,i)=>emit(i,c.provider==='cursor'?'beforeSubmitPrompt':'UserPromptSubmit',{prompt:c.title}));tool(0,'login-read','Bash','cat src/auth.ts');tool(1,'build-check','Bash','npm run build');tool(2,'ui-read','Bash','cat src/view.ts');tool(3,'docs-read','read_file');tool(4,'copy-read','Read');},
    ()=>{result(0,'login-read','Bash');tool(0,'login-edit','apply_patch');result(2,'ui-read','Bash');tool(2,'ui-edit','apply_patch');result(3,'docs-read','read_file');tool(3,'docs-edit','edit_file');},
    ()=>{result(1,'build-check','Bash',false);result(0,'login-edit','apply_patch');tool(0,'login-test','Bash','npm test');result(2,'ui-edit','apply_patch');emit(2,'PermissionRequest',{tool_name:'Bash',tool_use_id:'ui-preview',tool_input:{command:'npm run preview'}});result(4,'copy-read','Read');emit(4,'PermissionRequest',{tool_name:'Write',tool_use_id:'copy-save'});},
    ()=>{tool(1,'build-fix','apply_patch');result(3,'docs-edit','edit_file');emit(3,'stop',{status:'completed'});},
    ()=>{result(0,'login-test','Bash');emit(0,'Stop');result(1,'build-fix','apply_patch');tool(1,'build-retry','Bash','npm run build');},
    ()=>{result(1,'build-retry','Bash');emit(1,'Stop');},
    ()=>{emit(0,'SessionEnd');emit(1,'SessionEnd');emit(3,'sessionEnd');},
  ];
  function totalFrames(){return storyId==='classic'?classicSteps.length:getVignette(storyId).frames.length;}
  function applyFrame(){
    if(storyId==='classic'){classicSteps[tick]();return;}
    for(const event of eventsForFrame(storyId,tick,{receivedAt:now(),runId:String(runNumber)}))store.ingest(event);
  }
  function notify(){onChange();}
  function schedule(){if(timer)clearTimeout(timer);timer=null;if(running&&tick<totalFrames()-1)timer=setTimeout(()=>{timer=null;advance();},intervalMs);else if(tick>=totalFrames()-1)running=false;}
  function reset(){if(timer)clearTimeout(timer);timer=null;running=false;tick=0;sequence=0;runNumber++;store.clear();applyFrame();notify();}
  function advance(){if(tick<totalFrames()-1){tick++;applyFrame();}schedule();notify();}
  function action(name){
    if(!isDemoAction(name))throw new Error('Unknown demo action');
    if(name==='reset')reset();
    else if(name==='advance'){running=false;advance();}
    else if(name==='play'){if(tick>=totalFrames()-1)reset();running=true;schedule();notify();}
    else if(name==='pause'){running=false;schedule();notify();}
    else{storyId=name.slice(6);reset();}
    return snapshot();
  }
  function snapshot(){
    const story=STORIES.find(candidate=>candidate.id===storyId);
    const current=storyId==='classic'?{labelZh:CLASSIC_LABELS[tick][0],labelEn:CLASSIC_LABELS[tick][1]}:getVignette(storyId).frames[tick];
    return{sessions:store.snapshot(),demo:{running,tick,storyId,titleZh:story.titleZh,titleEn:story.titleEn,frameLabelZh:current.labelZh,frameLabelEn:current.labelEn,totalFrames:totalFrames(),synthetic:true,stories:STORIES}};
  }
  function stop(){running=false;if(timer)clearTimeout(timer);timer=null;}
  reset();return{snapshot,action,stop};
}
module.exports={createDemo,isDemoAction};
