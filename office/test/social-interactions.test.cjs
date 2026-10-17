'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Social=require('../lib/social-interactions.js');
const actor=(id,x=100,y=250,extra={})=>({id,point:{x,y},visible:true,entryPending:false,clonePhase:'',session:{id,provider:'codex',status:'active',activity:'coding',turnId:'one'},...extra});
const pair=()=>[actor('root',200),actor('helper',420,250,{helper:true,session:{id:'helper',provider:'codex',status:'active',activity:'reading',parentId:'root',turnId:'one'}})];
test('all three venues have four named finite choreographies while the original three control mappings remain',()=>{
  assert.deepEqual(Social.VENUES,['workshop','teahouse','observatory']);const ids=[];
  for(const venue of Social.VENUES){assert.equal(Social.CATALOG[venue].length,4);for(const entry of Social.CATALOG[venue]){assert.ok(entry.labelZh&&entry.labelEn);assert.ok(entry.duration>=2000&&entry.duration<=4000);ids.push(entry.id);}assert.equal(Object.keys(Social.TYPES[venue]).length,3);for(const kind of Object.values(Social.TYPES[venue]))assert.ok(Social.CATALOG[venue].some(entry=>entry.id===kind));}
  assert.equal(new Set(ids).size,12);
});
test('only real visible settled agents can socialize; waiting, stale, attention and lifecycle bodies cannot',()=>{
  const ordinary=actor('a');assert.equal(Social.eligible(ordinary),true);
  for(const extra of [{session:null},{visible:false},{entryPending:true},{stagedEntry:true},{motion:{}},{walking:true},{departing:true},{completing:true},{holdingFamily:true},{reacting:true},...['splitting','returning','absorbing'].map(clonePhase=>({clonePhase})),{session:{...ordinary.session,disconnected:true}},{session:{...ordinary.session,closed:true}},...['stale','closed','waiting'].map(status=>({session:{...ordinary.session,status}})),...['error','waiting-user'].map(activity=>({session:{...ordinary.session,activity}})),{session:{...ordinary.session,attention:true}},{spec:{stale:true}}])assert.equal(Social.eligible({...ordinary,...extra}),false,JSON.stringify(extra));
  for(const context of [{hidden:true},{reducedMotion:true},{lowPower:true},{mode:'demo'}])assert.equal(Social.eligible(ordinary,context),false);
  assert.equal(Social.choosePair([],{}),null);assert.equal(Social.choosePair([ordinary],{}),null);
});
test('nearby real families are preferred and arbitrary distant roots never become pretend participants',()=>{
  const root=actor('root',100),child=actor('child',480,250,{session:{provider:'codex',status:'active',activity:'planning',parentId:'root'}}),near=actor('unrelated',160);
  const result=Social.choosePair([near,child,root]);assert.equal(result.family,true);assert.deepEqual(result.actors.map(a=>a.id),['child','root']);
  assert.equal(Social.choosePair([root,actor('far',1000)]),null);
  const nested=actor('nested',230,250,{session:{provider:'codex',status:'active',activity:'planning',parentId:'child'}});
  assert.equal(Social.choosePair([root,child,nested]).family,true);
});
test('automatic scheduler is sparse, bounded, single-flight and uses a nonrepeat bag in each venue',()=>{
  let time=0;const scheduler=Social.createScheduler({now:()=>time,random:()=>0});const actors=pair();
  assert.equal(scheduler.plan(actors,{venue:'workshop'}),null);time=23999;assert.equal(scheduler.plan(actors,{venue:'workshop'}),null);time=24000;
  const seen=[];
  for(let i=0;i<9;i++){const plan=scheduler.plan(actors,{venue:'workshop'});assert.ok(plan);seen.push(plan.kind);assert.equal(scheduler.plan(actors,{venue:'workshop'},{manual:true}),null);assert.equal(scheduler.finish(plan.token+1),false);assert.equal(scheduler.finish(plan.token),true);time+=40000;}
  assert.equal(new Set(seen.slice(0,4)).size,4);assert.equal(new Set(seen.slice(4,8)).size,4);for(let i=1;i<seen.length;i++)assert.notEqual(seen[i],seen[i-1]);
});
test('stage manual requests map to their scene library and never change actual agent/session state',()=>{
  let time=1000;const scheduler=Social.createScheduler({now:()=>time,random:()=>0}),actors=pair(),truth=structuredClone(actors);
  for(const venue of Social.VENUES)for(const[type,expected]of Object.entries(Social.TYPES[venue])){const plan=scheduler.plan(actors,{scene:venue},{manual:true,venue,type});assert.equal(plan.kind,expected);assert.equal(plan.venue,venue);scheduler.finish(plan.token);time+=4000;}
  assert.deepEqual(actors,truth);
  const fallback=scheduler.plan(actors,{venue:'workshop'},{manual:true,venue:'teahouse',type:'tea'});assert.ok(Social.CATALOG.workshop.some(item=>item.id===fallback.kind));
});
test('scene, activity, turn, eligibility and removals invalidate a finite interaction, ordinary heartbeats do not',()=>{
  let time=0;const scheduler=Social.createScheduler({now:()=>time}),actors=pair();scheduler.plan(actors,{venue:'observatory'},{manual:true});
  assert.equal(scheduler.valid(actors,{venue:'observatory'}),true);assert.equal(scheduler.valid(actors.map(a=>({...a,session:{...a.session,lastEventAt:9000}})),{venue:'observatory'}),true);
  for(const context of [{venue:'workshop'},{venue:'observatory',hidden:true},{venue:'observatory',lowPower:true},{venue:'observatory',reducedMotion:true}])assert.equal(scheduler.valid(actors,context),false);
  assert.equal(scheduler.valid(actors.slice(0,1),{venue:'observatory'}),false);
  assert.equal(scheduler.valid(actors.map((a,i)=>i?a:{...a,session:{...a.session,activity:'testing'}}),{venue:'observatory'}),false);
  assert.equal(scheduler.valid(actors.map((a,i)=>i?a:{...a,session:{...a.session,turnId:'next'}}),{venue:'observatory'}),false);
  scheduler.cancel();assert.equal(scheduler.state().active,null);
});
test('history maps remain bounded during long-lived observed casts without fabricating arrivals',()=>{
  let time=0;const scheduler=Social.createScheduler({now:()=>time,random:()=>0});
  for(let i=0;i<360;i++){const actors=[actor('a'+i,100),actor('b'+i,300)];const plan=scheduler.plan(actors,{venue:'teahouse'},{manual:true});assert.ok(plan);scheduler.finish(plan.token);time+=4000;}
  assert.equal(scheduler.state().pairEntries,Social.LIMITS.pairs);assert.equal(scheduler.state().actorEntries,Social.LIMITS.actors);
});
test('a full 100-agent cast selects only a nearby pair without changing or suppressing any participant',()=>{
  const actors=Array.from({length:100},(_,i)=>actor('actor-'+String(i).padStart(3,'0'),60+(i%13)*88,130+Math.floor(i/13)*65)),truth=structuredClone(actors);
  const result=Social.choosePair(actors);assert.ok(result);assert.equal(result.actors.length,2);assert.equal(actors.length,100);assert.deepEqual(actors,truth);
  assert.ok(result.distance<=Social.LIMITS.pairDistance);
});


test('new gear, bamboo-fan and paper-orbit invitations keep their room, finite duration and genuine eligible pair',()=>{
  const additions=[['workshop','gear-turn',3000],['teahouse','fan-breeze',3200],['observatory','orbit-join',3200]];
  for(const[venue,kind,duration]of additions){
    let time=1000;const scheduler=Social.createScheduler({now:()=>time,random:()=>0}),actors=pair(),before=structuredClone(actors);
    const definition=Social.CATALOG[venue].find(x=>x.id===kind);assert.ok(definition,kind);assert.equal(definition.duration,duration);assert.ok(definition.labelZh&&definition.labelEn);
    const plan=scheduler.plan(actors,{venue},{manual:true,kind});assert.equal(plan.kind,kind);assert.equal(plan.endsAt-plan.startedAt,duration);assert.deepEqual(plan.ids,actors.map(x=>x.id).sort());assert.deepEqual(actors,before);
    assert.equal(scheduler.plan(actors,{venue},{manual:true,kind}),null);scheduler.finish(plan.token);time+=4000;
    assert.equal(scheduler.plan(actors.map(a=>({...a,entryPending:true})),{venue},{manual:true,kind}),null);
  }
});
