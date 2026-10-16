'use strict';
// Synthetic persistence check using only the packaged runtime and ASAR modules.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

if (process.argv[2] !== '--usage-child') {
  const appPath = path.resolve(process.argv[2] || path.join(__dirname, '../../dist-mini-office/mac-arm64/AI Mini Office.app'));
  const child = spawnSync(path.join(appPath,'Contents/MacOS/AI Mini Office'), [__filename,'--usage-child',path.join(appPath,'Contents/Resources/app.asar')], {
    env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:20000,maxBuffer:1024*1024
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) console.error(child.error.message);
  process.exitCode = child.status === 0 ? 0 : 1;
} else {
  (async()=>{
    const archive=process.argv[3], {createUsageLog}=require(path.join(archive,'lib/usage-log.cjs'));
    const {createUsageApi}=require(path.join(archive,'lib/usage-api.cjs'));
    const {createSessionStore}=require(path.join(archive,'lib/session-store.cjs'));
    const {normalizeEvent}=require(path.join(archive,'lib/provider-events.cjs'));
    const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'office-packaged-usage-'));
    let time=Date.parse('2026-10-16T15:59:58Z'), log;
    try {
      log=createUsageLog({dataDir,now:()=>time});
      const store=createSessionStore({now:()=>time,staleMs:180000});
      store.onAccepted(event=>log.record(event,store.snapshot()));
      const emit=raw=>store.ingest(normalizeEvent('codex',raw,{receivedAt:time,source:'hook'}));
      const base={session_id:'packaged-usage-main',turn_id:'turn-1',cwd:'/fixture/usage'};
      emit({...base,hook_event_name:'UserPromptSubmit',prompt:'PRIVATE_FIXTURE_PROMPT'});
      time+=1000;
      emit({...base,hook_event_name:'PreToolUse',tool_use_id:'call-1',tool_name:'Bash',tool_input:{command:'PRIVATE_FIXTURE_COMMAND'}});
      time+=2000;
      emit({...base,hook_event_name:'SubagentStart',agent_id:'helper-1'});
      time+=5000; log.reconcile(store.snapshot());
      const first=log.query({});
      assert.equal(first.ok,true);assert.equal(first.totals.agents,2);
      assert.equal(first.totals.roots,1);assert.equal(first.totals.helpers,1);
      assert.equal(first.totals.activeMs,8000);
      assert.equal(first.totals.waitingMs,5000,'a clone start without its own work evidence retains waiting-tool time');
      assert.ok(log.query({from:'2026-10-16',to:'2026-10-16'}).totals.activeMs>0);
      assert.ok(log.query({from:'2026-10-17',to:'2026-10-17'}).totals.activeMs>0);
      assert.doesNotMatch(JSON.stringify(first),/PRIVATE_FIXTURE/);
      assert.equal(fs.statSync(log.status().path).mode&0o777,0o600);
      log.close(); time+=3600000;
      log=createUsageLog({dataDir,now:()=>time});
      const restored=log.query({});
      assert.deepEqual(restored.totals,first.totals);
      log.reconcile([]);assert.deepEqual(log.query({}).totals,first.totals);
      const filePath=path.join(dataDir,'usage.csv');
      const api=createUsageApi({log,now:()=>time,chooseExport:async()=>({filePath}),openFolder:async()=>''});
      const exported=await api.export({});assert.equal(exported.rows,2);
      assert.doesNotMatch(fs.readFileSync(filePath,'utf8'),/PRIVATE_FIXTURE/);
      const timeline=log.events({id:'codex:packaged-usage-main'});
      assert.equal(timeline.total,2); assert.ok(timeline.items.some(e=>e.event==='tool-start'));
      console.log(JSON.stringify({ok:true,synthetic:true,liveProviderVerification:false,
        version:require(path.join(archive,'package.json')).version,electron:process.versions.electron,
        node:process.versions.node,sqlite:process.versions.sqlite,
        agents:restored.totals.agents,events:restored.totals.events,observedActiveMs:restored.totals.activeMs,observedWaitingMs:restored.totals.waitingMs,
        checks:['packaged SQLite writes and reopens','accepted root/helper metadata','Hong Kong midnight split','offline time excluded','metadata only','private database permissions','filtered CSV and timeline']},null,2));
    } finally { log?.close();fs.rmSync(dataDir,{recursive:true,force:true}); }
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
