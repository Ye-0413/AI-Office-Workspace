'use strict';

// Synthetic integration check only: the packaged Python observer invokes the
// packaged Electron/ASAR collector and the packaged bridge reads a private spool.
// No Hermes process, real gateway, user profile or live conversation is touched.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

if(process.argv[2]!=='--hermes-packaged-child') {
  const appPath=path.resolve(process.argv[2]||path.join(__dirname,'../../dist-mini-office/mac-arm64/AI Mini Office.app'));
  const report=path.resolve(process.argv[3]||path.join(__dirname,'../../.local-work/hermes-packaged-report.json'));
  const result=spawnSync(path.join(appPath,'Contents/MacOS/AI Mini Office'),[__filename,'--hermes-packaged-child',path.join(appPath,'Contents/Resources/app.asar'),report],{
    env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:30000,maxBuffer:1024*1024,
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error)console.error(result.error.message);
  process.exitCode=result.status===0?0:1;
} else {
  run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
}

async function run() {
  assert.ok(process.versions.electron,'Must use the packaged Electron runtime');
  const archive=path.resolve(process.argv[3]),reportFile=path.resolve(process.argv[4]);
  const {createObserverBridge}=require(path.join(archive,'lib/observer-bridge.cjs'));
  const {createSessionStore}=require(path.join(archive,'lib/session-store.cjs'));
  const scratch=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'office-hermes-packaged-')));
  const dataDir=path.join(scratch,'data'),homeDir=path.join(scratch,'home'),pluginDir=path.join(scratch,'plugin'),projectDir=path.join(scratch,'project');
  for(const dir of [dataDir,homeDir,pluginDir,projectDir])fs.mkdirSync(dir,{mode:0o700});
  const delivered=[],states=[],store=createSessionStore({settleMs:0});
  const bridge=createObserverBridge({dataDir,homeDir,env:{},appRoot:archive,electronPath:process.execPath,onEvent:event=>{
    delivered.push(event);store.ingest(event);
    states.push({event:event.event,sessionId:event.sessionId,activity:store.snapshot().find(session=>session.id===event.id)?.activity});
  }});
  try {
    // Python cannot open virtual ASAR files. Extract only its own packaged plugin
    // into the isolated fixture, exactly as the owned installation does.
    fs.writeFileSync(path.join(pluginDir,'__init__.py'),fs.readFileSync(path.join(archive,'hooks/hermes-plugin/__init__.py')),{mode:0o600});
    fs.writeFileSync(path.join(pluginDir,'observer-config.json'),JSON.stringify({owner:'ai-mini-office-hermes-observer-v1',electronPath:process.execPath,observer:path.join(archive,'hooks/observe.cjs'),dataDir}),{mode:0o600});
    const python=`import importlib.util,json,time
spec=importlib.util.spec_from_file_location('packaged_hermes_observer',${JSON.stringify(path.join(pluginDir,'__init__.py'))})
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Context:
 def __init__(self):self.hooks={};self.cleanup=[]
 def register_hook(self,name,callback):self.hooks[name]=callback
 def on_unload(self,callback):self.cleanup.append(callback)
context=Context();module.register(context)
assert len(context.hooks)==11
events=[
 ('pre_llm_call',dict(session_id='packaged-hermes-parent',turn_id='turn-1',user_message='DO_NOT_PERSIST_HERMES_PROMPT')),
 ('subagent_start',dict(parent_session_id='packaged-hermes-parent',child_session_id='packaged-hermes-child',child_goal='DO_NOT_PERSIST_HERMES_GOAL')),
 ('pre_tool_call',dict(session_id='packaged-hermes-child',tool_name='terminal',tool_call_id='tool-1',args={'command':'npm test'})),
 ('post_tool_call',dict(session_id='packaged-hermes-child',tool_name='terminal',tool_call_id='tool-1',status='ok',result='DO_NOT_PERSIST_HERMES_RESULT')),
 ('on_human_input_request',dict(session_id='packaged-hermes-parent',request_id='request-1',prompt='DO_NOT_PERSIST_HERMES_QUESTION')),
 ('on_human_input_resolved',dict(session_id='packaged-hermes-parent',request_id='request-1',outcome='answered',answer='DO_NOT_PERSIST_HERMES_ANSWER')),
 ('subagent_stop',dict(parent_session_id='packaged-hermes-parent',child_session_id='packaged-hermes-child',child_status='completed')),
 ('on_session_end',dict(session_id='packaged-hermes-parent',turn_id='turn-1',completed=True)),
 ('on_session_finalize',dict(session_id='packaged-hermes-parent')),
]
for name,payload in events:
 assert context.hooks[name](**payload) is None
assert len(context.cleanup)==1
for close in context.cleanup:close()
deadline=time.monotonic()+3
while any(thread.name=='mini-office-observer' and thread.is_alive() for thread in __import__('threading').enumerate()) and time.monotonic()<deadline:time.sleep(.01)
assert not any(thread.name=='mini-office-observer' and thread.is_alive() for thread in __import__('threading').enumerate())
print(json.dumps({'callbacks':len(context.hooks),'events':len(events),'nonDirective':True,'cleanupStoppedWorker':True}))
`;
    bridge.start();
    const result=spawnSync('python3',['-c',python],{cwd:projectDir,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:20000,maxBuffer:65536});
    assert.equal(result.status,0,result.stderr||result.error?.message);
    const pythonReport=JSON.parse(result.stdout);
    assert.deepEqual(pythonReport,{callbacks:11,events:9,nonDirective:true,cleanupStoppedWorker:true});
    const deadline=Date.now()+5000;
    while(delivered.length<9&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(delivered.length,9,'Every real Python subprocess send must reach the packaged bridge');
    const parent=store.snapshot().find(session=>session.sessionId==='packaged-hermes-parent');
    const child=store.snapshot().find(session=>session.sessionId==='packaged-hermes-child');
    assert.equal(store.snapshot().length,2);assert.equal(child.parentId,parent.id);assert.equal(child.closed,true);assert.equal(parent.closed,true);
    assert.ok(states.some(entry=>entry.event==='tool-start'&&entry.sessionId===child.sessionId&&entry.activity==='testing'));
    assert.ok(states.some(entry=>entry.event==='waiting-user'&&entry.sessionId===parent.sessionId&&entry.activity==='waiting-user'));
    assert.equal(delivered.find(event=>event.event==='tool-end'&&event.sessionId===child.sessionId).outcome,'success');
    const spool=path.join(dataDir,'events/hermes.jsonl'),spoolText=fs.readFileSync(spool,'utf8');
    assert.equal(fs.statSync(spool).mode&0o777,0o600);
    assert.equal(/DO_NOT_PERSIST|npm test|tool_input|user_message|conversation_history|child_goal|command/.test(spoolText),false);
    const report={version:JSON.parse(fs.readFileSync(path.join(archive,'package.json'),'utf8')).version,syntheticOnly:true,packagedElectron:true,pythonToAsarCollector:true,packagedBridgeAndStore:true,events:delivered.length,actors:2,parentChildLinked:true,testingObserved:true,humanWaitObserved:true,finalizationObserved:true,privateSpool:true,contentStripped:true,...pythonReport};
    fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    console.log('PASS: packaged Hermes Python observer → packaged Electron ASAR collector → isolated spool → packaged bridge/store.');
  } finally {
    bridge.stop();store.close?.();fs.rmSync(scratch,{recursive:true,force:true});
  }
}
