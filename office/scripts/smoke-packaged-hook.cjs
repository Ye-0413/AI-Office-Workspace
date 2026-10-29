'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {executable,archive}=require('./packaged-app.cjs').resolvePackagedApp(process.argv[2]);
const script=path.join(archive,'hooks/observe.cjs');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-packaged-hook-'));
try{
  const child=spawnSync(executable,[script,'--provider','codex','--event','PreToolUse','--mini-office-observer-v1'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',MINI_OFFICE_DATA_DIR:dataDir},input:JSON.stringify({session_id:'packaged-smoke-only',turn_id:'smoke-turn',tool_use_id:'smoke-call',tool_name:'Bash',tool_input:{command:'npm test'},cwd:dataDir}),encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),{});
  const events=fs.readdirSync(path.join(dataDir,'events')).flatMap(name=>fs.readFileSync(path.join(dataDir,'events',name),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
  assert.ok(events.some(e=>e.provider==='codex'&&e.sessionId==='packaged-smoke-only'&&e.activity==='testing'));
  console.log('PASS: packaged app supplies its own Node runtime, reads ASAR observer code, emits a passive empty response, and records a normalized test-start in an isolated temporary directory.');
}finally{fs.rmSync(dataDir,{recursive:true,force:true});}
