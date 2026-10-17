'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSessionStore}=require('../lib/session-store.cjs');
const {createUsageLog}=require('../lib/usage-log.cjs');
test('real capacity pressure cannot create a parent completion or lose the final child fact in Store to SQLite',t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'office-capacity-usage-'));let time=Date.parse('2026-10-17T07:00:00Z'),sequence=0;const base=time,logs=[];
  const create=()=>{const log=createUsageLog({dataDir,now:()=>time,staleMs:180000});logs.push(log);return log;};
  t.after(()=>{for(const log of logs)log.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const log=create(),store=createSessionStore({now:()=>time,staleMs:180000,maxSessions:2}),writes=[],accepted=[];
  store.onAccepted(event=>{accepted.push(event);writes.push(log.record(event,store.snapshot()));});
  const send=extra=>{const event={provider:'codex',sessionId:'family',turnId:'parent-turn',event:'turn-start',activity:'planning',at:time,eventId:'capacity-log-'+(++sequence),evidence:{source:'codex-jsonl',kind:'native'},...extra};assert.equal(store.ingest(event),true);assert.equal(writes.at(-1),true);return event;};
  send({});time=base+100;send({subagentId:'child',parentId:'codex:family',turnId:'child-turn',event:'subagent-start',activity:'coding'});
  time=base+200;send({event:'turn-end',activity:'planning'});time=base+1000;assert.equal(log.reconcile(store.snapshot()),true);
  time=base+1100;send({sessionId:'other',turnId:'other-turn',activity:'reading'});
  assert.equal(store.snapshot().length,3);assert.ok(store.snapshot().some(s=>s.id==='codex:family:child'));
  time=base+1200;send({event:'metadata',evidence:{source:'codex-jsonl',rawEvent:'event_msg:token_count'}});
  let parent=store.snapshot().find(s=>s.id==='codex:family');assert.equal(parent.activity,'waiting-tool');assert.equal(parent.settlementBoundary,undefined);assert.equal(parent.turnCompletedAt,undefined);
  assert.equal(log.query().items.find(row=>row.id===parent.id).waitingMs,1000);
  // The normal result does not need to repeat parentId. The store already owns
  // that real relationship, and subscribers must see it on this final fact.
  time=base+1500;const end=send({subagentId:'child',turnId:'child-turn',event:'subagent-end',activity:'idle',at:base+1000});
  parent=store.snapshot().find(s=>s.id==='codex:family');assert.equal(parent.turnCompletedAt,base+1000);assert.deepEqual(parent.settlementBoundary,{event:'turn-end',at:base+1000});assert.equal(store.snapshot().length,2);
  const check=archive=>{const rows=archive.query().items,p=rows.find(row=>row.id===parent.id),c=rows.find(row=>row.id==='codex:family:child');assert.equal(p.activeMs,200);assert.equal(p.waitingMs,800);assert.deepEqual(p.activityMs,{planning:200,'waiting-tool':800});assert.equal(p.events,3);assert.equal(p.lastSeenAt,base+1200);assert.equal(p.status,'idle');assert.equal(p.activity,'idle');assert.equal(c.activeMs,900);assert.equal(c.status,'closed');assert.equal(c.parentId,parent.id);assert.equal(c.events,2);assert.equal(archive.query().totals.failures,0);};
  check(log);assert.equal(store.ingest(end),false);assert.equal(log.record(end,store.snapshot()),false);assert.equal(accepted.filter(e=>e.event==='subagent-end').length,1);
  time+=5000;assert.equal(log.reconcile(store.snapshot()),true);check(log);assert.equal(log.close(),true);check(create());
});

function continuityFixture(t) {
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'office-continuity-usage-'));
  const base=Date.parse('2026-10-17T07:00:00Z');let time=base,sequence=0,log;const logs=[];
  const create=()=>{log=createUsageLog({dataDir,now:()=>time,staleMs:180000});logs.push(log);return log;};
  const store=createSessionStore({now:()=>time,staleMs:180000,maxSessions:2});
  store.onAccepted(event=>assert.equal(log.record(event,store.snapshot()),true));
  t.after(()=>{for(const item of logs)item.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const send=extra=>{const e={provider:'codex',sessionId:'work',turnId:'turn',event:'turn-start',activity:'planning',at:time,eventId:'continuity-'+(++sequence),evidence:{source:'codex-jsonl',kind:'native'},...extra};assert.equal(store.ingest(e),true);return e;};
  return{base,store,create,send,set:ms=>time=base+ms,row:()=>log.query().items.find(row=>row.id==='codex:work')};
}
test('passive archive timestamps retain the same process work lease and its later real terminal reduction',t=>{
  const f=continuityFixture(t),log=f.create();f.send({});f.set(1000);assert.equal(log.reconcile(f.store.snapshot()),true);
  f.set(1200);f.send({event:'metadata',evidence:{source:'codex-jsonl',rawEvent:'event_msg:token_count'}});
  assert.equal(f.store.snapshot()[0].lastEventAt,f.base);assert.equal(f.row().lastSeenAt,f.base+1200);
  f.set(1400);assert.equal(log.reconcile(f.store.snapshot()),true);assert.equal(f.row().activeMs,1400,'accepted passive metadata cannot close a genuinely ongoing work interval');
  f.set(1500);f.send({event:'turn-end',activity:'planning',at:f.base+1000});
  const row=f.row();assert.equal(row.activeMs,1000);assert.deepEqual(row.activityMs,{planning:1000});assert.equal(row.status,'idle');assert.equal(row.activity,'idle');assert.equal(row.lastSeenAt,f.base+1200);
  f.set(1800);assert.equal(log.reconcile(f.store.snapshot()),true);assert.equal(f.row().activeMs,1000);
});
test('a cold archive cannot reconstruct a work lease behind its later passive timestamp',t=>{
  const f=continuityFixture(t),log=f.create();f.send({});f.set(1200);f.send({event:'metadata',evidence:{source:'codex-jsonl',rawEvent:'event_msg:token_count'}});
  assert.equal(log.close(),true);const reopened=f.create();f.set(1500);assert.equal(reopened.reconcile(f.store.snapshot()),true);assert.equal(f.row().activeMs,1200);
  f.set(1600);f.send({event:'turn-end',activity:'planning',at:f.base+1000});
  assert.equal(f.row().activeMs,1200,'no same-process credited lease survives restart for a retrospective correction');assert.equal(f.row().lastSeenAt,f.base+1200);assert.equal(f.row().status,'active');
  f.set(5000);assert.equal(reopened.reconcile(f.store.snapshot()),true);assert.equal(f.row().activeMs,1200);
});
test('a regressing actual heartbeat does not gain continuity permission from an existing process track',t=>{
  const f=continuityFixture(t),log=f.create();f.send({});const oldSnapshot=f.store.snapshot();
  f.set(1000);f.send({event:'activity',activity:'coding'});f.set(1200);f.send({event:'metadata',evidence:{source:'codex-jsonl',rawEvent:'event_msg:token_count'}});
  f.set(1300);assert.equal(log.reconcile(oldSnapshot),true);const row=f.row();assert.equal(row.status,'active');assert.equal(row.activity,'coding');assert.equal(row.lastSeenAt,f.base+1200);assert.deepEqual(row.activityMs,{planning:1000,coding:300});
  f.set(1800);assert.equal(log.reconcile(oldSnapshot),true);assert.equal(f.row().activeMs,1300,'old reducer snapshots neither reopen nor backfill the dropped lease');
});
