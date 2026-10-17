'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSessionStore}=require('../lib/session-store.cjs');
const BASE=Date.parse('2026-10-17T07:00:00Z');
function fixture(options={}) {
  let time=BASE,sequence=0;const accepted=[],observed=[];
  const store=createSessionStore({now:()=>time,staleMs:180000,...options});
  store.onAccepted(event=>{accepted.push(event);observed.push({event,rows:store.snapshot()});});
  const event=extra=>({provider:'codex',sessionId:'family',turnId:'parent-turn',event:'turn-start',activity:'planning',evidence:{source:'codex-jsonl',kind:'native'},at:++time,eventId:'capacity-'+(++sequence),...extra});
  const send=extra=>{const e=event(extra);assert.equal(store.ingest(e),true,e.sessionId+':'+e.event);return e;};
  const child=extra=>send({subagentId:'child',parentId:'codex:family',turnId:'child-turn',event:'subagent-start',activity:'coding',...extra});
  const row=id=>store.snapshot().find(s=>s.id===id),ids=()=>store.snapshot().map(s=>s.id).sort();
  return{store,accepted,observed,event,send,child,row,ids,set:ms=>time=BASE+ms};
}
function family(f){f.send({});f.child({});f.send({event:'turn-end',activity:'planning'});assert.equal(f.row('codex:family').activity,'waiting-tool');}
function pressure(f,count,{active=false}={}){for(let i=0;i<count;i++)f.send({sessionId:'other-'+i,turnId:active?'other-turn':undefined,event:active?'turn-start':'metadata'});}
for(const count of [2,100])test(`${count===100?'actual default':'small'} retention target preserves a live child and pending parent under passive history pressure`,()=>{
  const f=fixture(count===100?{}:{maxSessions:count});family(f);const child=f.row('codex:family:child');
  pressure(f,count-1);f.send({event:'metadata',evidence:{source:'codex-jsonl',rawEvent:'event_msg:token_count'}});
  const parent=f.row('codex:family'),current=f.row(child.id);
  assert.ok(current,'an active child cannot be history eviction');assert.equal(current.lastEventAt,child.lastEventAt);assert.equal(current.turnId,child.turnId);assert.equal(current.activity,'coding');
  assert.equal(parent.status,'active');assert.equal(parent.activity,'waiting-tool');assert.equal(parent.turnCompletedAt,undefined);assert.equal(parent.settlementBoundary,undefined);
  assert.ok(f.store.snapshot().length<=count,'passive unreferenced metadata remains reclaimable');
  const end=f.child({event:'subagent-end',activity:'idle'});const done=f.row(parent.id);
  assert.equal(done.status,'idle');assert.equal(done.turnCompletedAt,end.at);assert.deepEqual(done.settlementBoundary,{event:'turn-end',at:end.at});
  assert.equal(f.store.ingest(end),false);assert.equal(f.accepted.filter(e=>e.event==='subagent-end').length,1);
});
test('all genuinely live identities may exceed the history target, including after observation becomes stale',()=>{
  const f=fixture({maxSessions:2});pressure(f,4,{active:true});const expected=f.ids();assert.equal(expected.length,4);
  f.set(200000);f.store.prune();assert.deepEqual(f.ids(),expected);assert.ok(f.store.snapshot().every(s=>s.status==='stale'&&!s.closed&&!s.settlementBoundary));
  for(let i=0;i<4;i++)f.send({sessionId:'other-'+i,turnId:'other-turn',event:'turn-end',activity:'planning'});
  assert.ok(f.store.snapshot().length<=2,'actual completion makes old history reclaimable without another identity');
  assert.equal(f.accepted.filter(e=>e.event==='turn-end').length,4);
});
test('safe metadata history still converges by oldest event and duplicate subscriptions remain bounded',()=>{
  const f=fixture({maxSessions:2});let calls=0;const off=f.store.onChange(()=>calls++);
  f.send({sessionId:'a',event:'metadata',turnId:undefined});off();f.send({sessionId:'b',event:'metadata',turnId:undefined});const last=f.send({sessionId:'c',event:'metadata',turnId:undefined});
  assert.deepEqual(f.ids(),['codex:b','codex:c']);assert.equal(calls,1);assert.equal(f.store.ingest(last),false);assert.equal(f.accepted.length,3);
  assert.ok(f.store.snapshot().every(s=>s.status==='idle'&&!s.turnCompletedAt&&!s.settlementBoundary));f.store.clear();assert.equal(f.store.snapshot().length,0);
});
test('unreferenced closed history is reclaimed before older idle history and never before a live row',()=>{
  const f=fixture({maxSessions:3});f.send({sessionId:'old-idle',event:'metadata',turnId:undefined});f.send({sessionId:'closed'});f.send({sessionId:'closed',event:'session-end'});f.send({sessionId:'live'});f.send({sessionId:'new-idle',event:'metadata',turnId:undefined});
  assert.deepEqual(f.ids(),['codex:live','codex:new-idle','codex:old-idle']);assert.equal(f.row('codex:live').status,'active');
});
for(const kind of ['tool','wait','wait-without-call','external'])test(`${kind} ownership cannot be discarded to satisfy a history target`,()=>{
  const f=fixture({maxSessions:1});f.send({});
  if(kind==='tool')f.send({event:'tool-start',toolCallId:'run',activity:'testing'});
  if(kind==='wait'||kind==='wait-without-call')f.send({event:'waiting-user',...(kind==='wait'?{toolCallId:'ask'}:{}),activity:'waiting-user'});
  f.send({event:'turn-end',activity:kind==='external'?'waiting-tool':'planning'});pressure(f,2,{active:true});
  assert.ok(f.row('codex:family'));assert.equal(f.row('codex:family').turnCompletedAt,undefined);assert.equal(f.row('codex:family').settlementBoundary,undefined);assert.equal(f.store.snapshot().length,3);
  if(kind==='tool')assert.equal(f.row('codex:family').activeTools,1);
  if(kind.startsWith('wait'))assert.equal(f.row('codex:family').status,'waiting');
  if(kind==='tool'){f.send({event:'tool-end',toolCallId:'run',outcome:'success'});assert.equal(f.accepted.filter(e=>e.event==='tool-end').length,1);}
  else if(kind==='external'){f.send({event:'turn-start',turnId:'fresh'});f.send({event:'turn-end',turnId:'fresh',activity:'planning'});}
  else f.send({event:'interrupted'});
  assert.equal(f.row('codex:family'),undefined,'only the actual resolving event makes this history reclaimable');
  for(let i=0;i<2;i++)f.send({sessionId:'other-'+i,turnId:'other-turn',event:'turn-end',activity:'planning'});
  assert.ok(f.store.snapshot().length<=1);
});
test('an explicitly closed ancestor remains while its real child still references it, then can be reclaimed',()=>{
  const f=fixture({maxSessions:1});f.send({});f.child({});f.send({event:'session-end',evidence:{source:'hook',kind:'native'}});
  assert.equal(f.row('codex:family').closed,true);assert.equal(f.row('codex:family:child').status,'active');pressure(f,1);
  assert.deepEqual(f.ids(),['codex:family','codex:family:child']);
  f.child({event:'subagent-end',activity:'idle'});assert.equal(f.store.snapshot().length,1);assert.equal(f.row('codex:family'),undefined,'live reference has ended; closed-first history can now converge');
});
test('idle observed ancestors are protected transitively and a missing ancestor is never fabricated',()=>{
  // Establish the actual chain without forcing idle history to survive before
  // it is referenced: the leaf arrives first, then its observed idle ancestors.
  const g=fixture({maxSessions:1});g.send({sessionId:'leaf',parentId:'codex:middle'});
  assert.deepEqual(g.ids(),['codex:leaf']);g.send({sessionId:'middle',event:'metadata',turnId:undefined,parentId:'codex:root'});g.send({sessionId:'root',event:'metadata',turnId:undefined});pressure(g,1);
  assert.deepEqual(g.ids(),['codex:leaf','codex:middle','codex:root']);assert.equal(g.row('codex:root').status,'idle');
  g.send({sessionId:'leaf',event:'session-end'});assert.ok(g.store.snapshot().length<=1);assert.equal(g.accepted.filter(e=>e.event==='session-end').length,1);
});
test('observed parent cycles terminate and lose protection once their only real work ends',()=>{
  const f=fixture({maxSessions:1});f.send({sessionId:'leaf',parentId:'codex:a'});f.send({sessionId:'a',event:'metadata',turnId:undefined,parentId:'codex:b'});f.send({sessionId:'b',event:'metadata',turnId:undefined,parentId:'codex:a'});pressure(f,1);
  assert.deepEqual(f.ids(),['codex:a','codex:b','codex:leaf']);f.send({sessionId:'leaf',event:'session-end'});assert.equal(f.store.snapshot().length,1);f.store.prune();assert.equal(f.store.snapshot().length,1);
});
test('accepted final facts remain observable before their now-safe history is reclaimed',()=>{
  const f=fixture({maxSessions:1});family(f);
  const end=f.send({event:'subagent-end',subagentId:'child',turnId:'child-turn',activity:'idle'});
  const observed=f.observed.find(row=>row.event.eventId===end.eventId);
  const child=observed.rows.find(s=>s.id==='codex:family:child'),parent=observed.rows.find(s=>s.id==='codex:family');
  assert.ok(child,'accepted subscribers can read the real closing identity before retention');assert.equal(child.closed,true);assert.equal(child.parentId,'codex:family');
  assert.deepEqual(parent.settlementBoundary,{event:'turn-end',at:end.at});assert.ok(f.store.snapshot().length<=1);
});
test('over-target live retention preserves per-actor event bounds and duplicate/old-turn fences',()=>{
  const f=fixture({maxSessions:1});pressure(f,3,{active:true});let last;
  for(let i=0;i<20;i++)last=f.send({sessionId:'other-0',turnId:'other-turn',event:'activity',activity:'reading'});
  assert.equal(f.row('codex:other-0').events.length,12);assert.equal(f.store.ingest(last),false);
  f.send({sessionId:'other-0',turnId:'fresh',event:'turn-start'});
  assert.equal(f.store.ingest(f.event({sessionId:'other-0',turnId:'other-turn',event:'turn-end'})),false);assert.equal(f.row('codex:other-0').turnId,'fresh');assert.equal(f.store.snapshot().length,3);
});
