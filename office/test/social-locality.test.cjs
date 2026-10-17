'use strict';
// Actual scheduler, synthetic observed actors. World positions are pixels;
// control payloads are the existing venue/festival percentages, not pixels.
const {test}=require('node:test'),assert=require('node:assert/strict');
const Social=require('../lib/social-interactions.js');
const actor=(id,x,y,parentId)=>({id,visible:true,point:{x:x*12.8,y:y*7.2},session:{id,provider:'codex',status:'active',activity:'coding',turnId:'observed',...(parentId?{parentId}:{})}});
const context={venue:'workshop',language:'en',mode:'live'};
function scheduler(){let time=1000,randomCalls=0;const api=Social.createScheduler({now:()=>time,random:()=>{randomCalls++;return 0;}});return {api,advance:ms=>time+=ms,get randomCalls(){return randomCalls;}};}
const control={manual:true,venue:'workshop',type:'circuit',point:{x:82,y:30}};
const ids=plan=>plan.ids.slice().sort();

test('a manual control selects its actual local pair instead of a more tightly spaced remote family',()=>{
  for(const names of [['z-parent','a-child','b-near','c-near'],['a-parent','z-child','y-near','x-near']]){
    const cast=[actor(names[0],8,44),actor(names[1],12,44,names[0]),actor(names[2],82,44),actor(names[3],93,44)],before=structuredClone(cast);
    for(const order of [cast,cast.slice().reverse()]){
      const s=scheduler(),plan=s.api.plan(order,context,control);
      assert.ok(plan);assert.deepEqual(ids(plan),names.slice(2).sort());assert.equal(plan.kind,'magnet-puzzle');
    }
    assert.deepEqual(cast,before,'selection cannot alter actual actors, ancestry, positions or observations');
  }
});

test('manual radius is one station neighbourhood, not the original 520px pair span',()=>{
  const s=scheduler(),remote=[actor('center-a',56,44),actor('center-b',58,44)],before=s.api.state();
  assert.ok(Math.hypot((82-56)*12.8,(30-44)*7.2)>340);
  assert.equal(s.api.plan(remote,context,control),null,'two middle-of-room actors are not local to the right control');
  assert.deepEqual(s.api.state(),before,'an empty local invitation consumes no scheduler deadline/history');assert.equal(s.randomCalls,0);
  assert.equal(s.api.plan([remote[0],actor('near',82,44)],context,control),null,'both participants must be local');
  const plan=s.api.plan([actor('bench-a',82,44),actor('bench-b',93,44)],context,control);
  assert.ok(plan,'the same instant remains available to a genuinely local bench pair');
  assert.equal(Social.LIMITS.manualRadius,260);assert.equal(Social.LIMITS.pairDistance,520);
});

test('local ranking follows control distance before pair distance/family with deterministic ties',()=>{
  const s=scheduler(),cast=[actor('remote-parent',69,44),actor('remote-child',72,44,'remote-parent'),actor('local-a',82,30),actor('local-b',85,30)];
  const plan=s.api.plan(cast,context,control);assert.deepEqual(ids(plan),['local-a','local-b']);
  const tied=[actor('z',80,30),actor('a',84,30),actor('b',82,34)];
  assert.deepEqual(ids(scheduler().api.plan(tied,context,control)),ids(scheduler().api.plan(tied.slice().reverse(),context,control)));
});

test('percent conversion, finite inclusive radius, zero-valued control coordinates and invalid input are explicit',()=>{
  // 260px exactly is admitted; a physically farther second actor is rejected.
  const near=[actor('edge-a',260/12.8,0),actor('edge-b',0,260/7.2)],origin={manual:true,point:{x:0,y:0}};
  assert.ok(scheduler().api.plan(near,context,origin));
  assert.equal(scheduler().api.plan([near[0],actor('outside',0,260.001/7.2)],context,origin),null);
  for(const point of [null,undefined,{}, {x:82}, {x:'82',y:30},{x:NaN,y:30},{x:82,y:Infinity},{x:-.01,y:30},{x:100.01,y:30},{x:82,y:-1},{x:82,y:101}]){
    const s=scheduler(),before=s.api.state();assert.equal(s.api.plan(near,context,{manual:true,point}),null,JSON.stringify(point));
    assert.deepEqual(s.api.state(),before);assert.equal(s.randomCalls,0);
  }
});

test('no-local rejection does not consume bags or cooldown and physically busy local actors remain ineligible',()=>{
  const s=scheduler(),pair=[actor('near-a',82,44),actor('near-b',93,44)];
  for(const extra of [{motion:{}},{navigation:{kind:'station',target:{x:82,y:44}}},{routeReservation:{token:1,serial:7},serial:7},{pendingStation:{seat:{x:82,y:44},due:1000}},{yielding:true},{entryPending:true},{holdingFamily:true}]){
    const before=s.api.state();assert.equal(s.api.plan([{...pair[0],...extra},pair[1]],context,{manual:true,point:control.point}),null);
    assert.deepEqual(s.api.state(),before);assert.equal(s.randomCalls,0);
  }
  const actual=s.api.plan(pair,context,{manual:true,point:control.point}),fresh=scheduler().api.plan(pair,context,{manual:true,point:control.point});
  assert.equal(actual.kind,fresh.kind,'rejections do not advance the deterministic program bag');assert.equal(actual.token,1);
});

test('automatic and manual-without-point requests retain the original remote-family strategy',()=>{
  const cast=[actor('family',8,44),actor('child',12,44,'family'),actor('local-a',82,44),actor('local-b',93,44)];
  assert.deepEqual(ids(scheduler().api.plan(cast,context,{manual:true})),['child','family']);
  const a=scheduler(),b=scheduler();assert.equal(a.api.plan(cast,context),null);assert.equal(b.api.plan(cast,context),null);
  a.advance(24000);b.advance(24000);
  assert.deepEqual(a.api.plan(cast,context),b.api.plan(cast,context,{point:{x:82,y:30}}),'automatic payload points do not change old selection or random cadence');
  const empty=scheduler();assert.equal(empty.api.plan([],context,{manual:true}),null);assert.equal(empty.api.state().nextAuto,25000,'legacy no-point empty attempts retain their original automatic-deadline initialization');
});
