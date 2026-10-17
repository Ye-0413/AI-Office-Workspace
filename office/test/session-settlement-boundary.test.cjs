'use strict';
// Real reducer facts, no clocks or outcomes fabricated from elapsed time.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSessionStore}=require('../lib/session-store.cjs');
const base=Date.parse('2026-10-17T01:00:00Z');
function fixture(){
  let time=base,sequence=0;const accepted=[],store=createSessionStore({now:()=>time,staleMs:180000});
  store.onAccepted(event=>accepted.push(event));
  const event=extra=>({provider:'codex',sessionId:'family',event:'turn-start',turnId:'parent-turn',eventId:'boundary-'+(++sequence),at:time,activity:'planning',evidence:{source:'codex-jsonl',kind:'native'},...extra});
  const ingest=extra=>{const e=event(extra);assert.equal(store.ingest(e),true,JSON.stringify(e));return e;};
  const child=extra=>ingest({subagentId:'child',parentId:'codex:family',turnId:'child-turn',activity:'coding',...extra});
  const parent=()=>store.snapshot().find(s=>s.id==='codex:family');
  return {store,accepted,event,ingest,child,parent,set:ms=>time=base+ms};
}
const boundary=(event,ms)=>({event,at:base+ms});

test('late interrupted-parent settlement survives a stale snapshot without inventing successful completion',()=>{
  const f=fixture();f.ingest({});f.child({event:'subagent-start'});f.set(100);f.ingest({event:'interrupted',activity:'idle'});
  assert.equal(f.parent().activity,'waiting-tool');assert.equal(f.parent().settlementBoundary,undefined,'pending child means no settlement fact yet');
  f.set(181000);f.child({event:'subagent-end',activity:'idle',at:base+500});
  const parent=f.parent();assert.equal(parent.status,'stale');assert.equal(parent.activity,'unknown');assert.equal(parent.closed,false);
  assert.deepEqual(parent.settlementBoundary,boundary('interrupted',500));assert.equal(parent.turnCompletedAt,undefined);
  assert.equal(f.accepted.length,4);assert.deepEqual(parent.events.map(e=>e.event),['turn-start','interrupted'],'the field creates no new parent event/result');
});

test('parent Stop1070 and a late child end1000 expose the actual maxpending1070 settlement',()=>{
  const f=fixture();f.ingest({});f.child({event:'subagent-start'});f.set(1070);f.ingest({event:'turn-end',activity:'planning'});
  assert.equal(f.parent().settlementBoundary,undefined);assert.equal(f.parent().turnCompletedAt,undefined);
  f.set(1200);f.child({event:'subagent-end',activity:'idle',at:base+1000});
  assert.deepEqual(f.parent().settlementBoundary,boundary('turn-end',1070));assert.equal(f.parent().turnCompletedAt,base+1070);
  const child=f.store.snapshot().find(s=>s.subagentId);assert.deepEqual(child.settlementBoundary,boundary('subagent-end',1000));assert.equal(child.turnCompletedAt,undefined);
});

test('all four actual terminal settlements report their own kind without adding success to abort or teardown',()=>{
  for(const kind of ['turn-end','interrupted','session-end','subagent-end']){
    const f=fixture();f.ingest({});f.set(1000);f.ingest({event:kind,activity:'idle'});
    const p=f.parent();assert.deepEqual(p.settlementBoundary,boundary(kind,1000));
    assert.equal(p.turnCompletedAt,kind==='turn-end'?base+1000:undefined);
    assert.equal(p.closed,['session-end','subagent-end'].includes(kind));assert.equal(p.activity,'idle');
    assert.deepEqual(p.events.map(e=>e.event),['turn-start',kind]);assert.equal(f.accepted.length,2);
  }
});

test('snapshots copy the settlement object; rejected same-turn starts and duplicate facts cannot erase it',()=>{
  const f=fixture();f.ingest({});f.set(1000);const terminal=f.ingest({event:'turn-end',activity:'idle'});
  const observed=f.parent();observed.settlementBoundary.at=0;observed.settlementBoundary.event='success';
  assert.deepEqual(f.parent().settlementBoundary,boundary('turn-end',1000),'a reader cannot mutate the reducer-owned fact');
  assert.equal(f.store.ingest(terminal),false);assert.equal(f.store.ingest(f.event({event:'turn-start',at:base+1001})),false);
  assert.deepEqual(f.parent().settlementBoundary,boundary('turn-end',1000));assert.equal(f.accepted.length,2);
});

test('a new native turn clears the old marker before work and receives only its own later settlement',()=>{
  const f=fixture();f.ingest({});f.set(1000);f.ingest({event:'turn-end',activity:'idle'});
  f.set(2000);f.ingest({event:'turn-start',turnId:'fresh',activity:'coding'});
  assert.equal(f.parent().settlementBoundary,undefined);assert.equal(f.parent().turnCompletedAt,undefined);assert.equal(f.parent().activity,'coding');
  f.set(2500);f.ingest({event:'interrupted',turnId:'fresh',activity:'idle'});
  assert.deepEqual(f.parent().settlementBoundary,boundary('interrupted',2500));assert.equal(f.parent().turnCompletedAt,undefined);
});

test('an accepted native lifecycle start clears its old closed marker without altering the legacy truth state',()=>{
  const f=fixture();f.ingest({});f.set(1000);f.ingest({event:'session-end',activity:'idle'});
  assert.equal(f.parent().closed,true);f.set(2000);f.ingest({event:'session-start',turnId:undefined,activity:'idle'});
  assert.equal(f.parent().settlementBoundary,undefined);assert.equal(f.parent().closed,false);assert.equal(f.parent().status,'idle');assert.equal(f.parent().turnCompletedAt,undefined);
});

test('a trusted ended snapshot clears prior native settlement and observed-ended child release never fabricates one',()=>{
  const f=fixture();f.set(1000);f.ingest({});f.set(1500);f.ingest({event:'turn-end',activity:'idle'});
  f.set(1800);f.child({event:'subagent-start'});
  f.set(2500);f.ingest({event:'metadata',turnId:'restored-next',supersedesTurnId:'parent-turn',turnStartedAt:base+2000,turnEndedAt:base+2500,
    evidence:{source:'codex-jsonl',rawEvent:'rollout:ended-turn-snapshot',snapshot:'ended-turn',restored:true}});
  assert.equal(f.parent().settlementBoundary,undefined);assert.equal(f.parent().turnCompletedAt,undefined);assert.equal(f.parent().activity,'waiting-tool');
  f.set(3000);f.child({event:'subagent-end',activity:'idle'});
  assert.equal(f.parent().activity,'idle');assert.equal(f.parent().settlementBoundary,undefined);assert.equal(f.parent().turnCompletedAt,undefined);
});

test('clock-derived parent waiting and ordinary metadata supply no terminal settlement',()=>{
  const f=fixture();f.ingest({});f.child({event:'subagent-start'});f.set(180100);
  f.child({event:'tool-start',toolCallId:'late-child-call',activity:'coding',at:base+179500});
  assert.equal(f.parent().activity,'waiting-tool');assert.equal(f.parent().settlementBoundary,undefined);assert.equal(f.parent().turnCompletedAt,undefined);
  f.ingest({event:'metadata',at:base,activity:'planning'});assert.equal(f.parent().settlementBoundary,undefined);
});
