'use strict';
// Production navigation functions, with a deferred physical move. No decorative
// controller is invoked to manufacture the arrival being asserted.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function extract(name){
 const expression=new RegExp('\\n  (?:async )?function '+name+'\\('),match=expression.exec(source);
 assert.ok(match,'actual production '+name);
 const start=match.index+1,next=/\n  (?:async )?function /.exec(source.slice(start+1));
 assert.ok(next,'bounded production function '+name);
 return source.slice(start,start+1+next.index);
}
function fixture({helper=false,entryPending=false}={}){
 let finish;const physical=new Promise(resolve=>{finish=resolve;});
 const events=[],moves=[],finishes=[],refreshes=[],parent={id:'codex:observed-parent',position:{x:29.05,y:48.2}};
 const actor={id:'codex:observed-child',serial:7,helper,entryPending,position:{x:62,y:72},target:{x:32.2,y:69,zone:'board'},session:{id:'codex:observed-child',activity:'planning',status:'active'},node:{dataset:{},style:{}},spec:{},navigation:null,lastZone:''};
 const actors=new Map([[actor.id,actor],[parent.id,parent]]);
 const context={destroyed:false,actors,office:{dispatchEvent:event=>events.push(event.detail)},
  CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},
  currentPage:{exitOwnerIds:[]},currentPosition:value=>({...value.position}),
  queueLayoutRefresh:value=>refreshes.push(value),
  cancelAction:value=>++value.serial,
  Scene:{activitySpec:()=>({stale:false}),distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},
  ENTRY_POINT:{x:87,y:78},
  move:(value,seat,serial)=>{moves.push({id:value.id,source:{...value.position},target:{...seat},serial});return physical;},
  placeOutside:(value,point)=>{assert.equal(value.entryPending,true);value.position={...point};},
  cloneAncestor:()=>parent,clonePhase:(value,phase)=>{value.clonePhase=phase;},
  finishAtStation:value=>finishes.push({id:value.id,navigation:value.navigation,position:{...value.position}}),
  updateEntranceLane(){},queueNavigation(){},queueTraffic(){},say(){},setPose(){},text(){},requestStation(){},
 };
 vm.createContext(context);
 vm.runInContext(['actualArrival','settle','enterClone'].map(extract).join('\n')+'\nthis.production={actualArrival,settle,enterClone};',context);
 return {actor,parent,events,moves,finishes,refreshes,context,api:context.production,
  arrive(value=true){const target=moves.at(-1).target;actor.position={x:target.x,y:target.y};actor.entryPending=false;finish(value);},
  rejectMove(){finish(false);}};
}

test('production station feedback waits for the real endpoint and a cleared navigation owner',async()=>{
 const f=fixture(),seat={x:32.2,y:69,zone:'board'};
 const running=f.api.settle(f.actor,seat);
 assert.equal(f.moves.length,1);assert.equal(f.events.length,0,'desired target and queued route are not arrival');
 assert.equal(f.actor.navigation.kind,'station');
 f.arrive();await running;
 assert.equal(f.events.length,1);const event=f.events[0];
 assert.equal(event.actor,f.actor);assert.equal(event.actorId,f.actor.id);assert.equal(event.kind,'station');assert.equal(event.zone,'board');
 assert.equal(event.serial,f.actor.serial);assert.equal(f.actor.navigation,null);
 assert.deepEqual(JSON.parse(JSON.stringify(event.position)),{x:32.2,y:69});
 assert.equal(f.finishes.length,1);assert.equal(f.finishes[0].navigation,null);
 assert.equal(f.actor.session.status,'active');assert.equal(f.actor.session.activity,'planning');
});

test('failed physical moves and obsolete serials do not emit a station arrival',async()=>{
 const rejected=fixture(),first=rejected.api.settle(rejected.actor,{x:32.2,y:69,zone:'board'});
 rejected.rejectMove();await first;assert.equal(rejected.events.length,0);
 const obsolete=fixture(),second=obsolete.api.settle(obsolete.actor,{x:32.2,y:69,zone:'board'});
 obsolete.actor.serial++;obsolete.arrive();await second;assert.equal(obsolete.events.length,0);
});

test('a real child entry starts at its observed parent and emits feedback only after the actual split walk',async()=>{
 const f=fixture({helper:true,entryPending:true}),seat={x:32.2,y:69,zone:'board'};
 const running=f.api.enterClone(f.actor,seat);
 assert.equal(f.moves.length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.moves[0].source)),f.parent.position);
 assert.notDeepEqual(f.moves[0].source,{x:87,y:78},'an observed child is never proved as a main door entrance');
 assert.equal(f.actor.clonePhase,'splitting');assert.equal(f.events.length,0);
 f.arrive();await running;
 assert.equal(f.actor.clonePhase,'working');assert.equal(f.actor.navigation,null);
 assert.equal(f.events.length,1);assert.equal(f.events[0].kind,'entry');assert.equal(f.events[0].zone,'board');
 assert.equal(f.events[0].actor,f.actor);assert.equal(f.actor.session.activity,'planning');
});

test('arrival cannot outlive the real actor identity, admission or scene owner',()=>{
 for(const invalidate of [f=>{f.context.destroyed=true;},f=>{f.actor.entryPending=true;},f=>{f.context.actors.set(f.actor.id,{...f.actor});},f=>{f.actor.serial++;}]){
  const f=fixture(),serial=f.actor.serial;invalidate(f);
  f.api.actualArrival(f.actor,{x:32.2,y:69,zone:'board'},serial,'station');
  assert.equal(f.events.length,0);assert.equal(f.refreshes.length,0);
 }
});
