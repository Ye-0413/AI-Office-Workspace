'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Scene=require('../lib/scene-model.js'),Traffic=require('../lib/scene-traffic.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const route=source.slice(source.indexOf('  function walkingRoute('),source.indexOf('  function measureActorFootprints('));
const entry={x:87,y:78},target={x:30,y:78},footprint={left:20,right:20,top:20,bottom:20};
function harness(){
  let fallbacks=0;const hint=[entry,{x:60,y:78},target],paths=new Map([['actor',hint]]);
  const context={ENTRY_POINT:entry,uniformScale:1,actorFootprints:new Map([['actor',{...footprint}]]),currentPage:{seats:new Map([['actor',target]]),uniformScale:1,pathsById:paths,routeGeometry:{paths,scale:1,footprints:new Map([['actor',{...footprint}]])}},WalkingLayout:{route:(from,to)=>{fallbacks++;return[from,to];}}};
  vm.createContext(context);vm.runInContext(route,context);
  const actor={id:'actor',position:entry,uniformScale:1,footprint:{...footprint},staged:true,canYield:false};
  return{context,actor,hint,call:(from=entry,to=target,actorOptions=actor)=>context.walkingRoute(from,to,actorOptions),fallbacks:()=>fallbacks};
}
test('production route reuses only the exact actor entrance proof and returns independent point copies',()=>{
  const h=harness(),path=h.call();assert.equal(h.fallbacks(),0);assert.deepEqual(Array.from(path,p=>[p.x,p.y]),h.hint.map(p=>[p.x,p.y]));
  path[1].x=0;assert.equal(h.hint[1].x,60,'Traffic must not mutate the cached allocator proof');
});
test('different identity, endpoint, scale, measured footprint or proof revision falls back to normal furniture routing',()=>{
  const mutations=[
    h=>h.call(entry,target,{...h.actor,id:'other'}),
    h=>h.call({x:86.9,y:78}),h=>h.call(entry,{x:30.1,y:78}),
    h=>h.call(entry,target,{...h.actor,uniformScale:.9}),
    h=>{h.context.uniformScale=.9;h.call();},
    h=>{h.context.currentPage.uniformScale=.9;h.call();},
    h=>h.call(entry,target,{...h.actor,footprint:{...footprint,bottom:21}}),
    h=>{h.context.actorFootprints.set('actor',{...footprint,right:21});h.call();},
    h=>{h.context.currentPage.pathsById=new Map(h.context.currentPage.pathsById);h.call();},
    h=>{h.hint[0]={x:86,y:78};h.call();},h=>{h.hint[1].x=NaN;h.call();},
  ];
  for(const mutate of mutations){const h=harness();mutate(h);assert.equal(h.fallbacks(),1,mutate.toString());}
});
test('a proven hint remains subject to current complete bodies and reserved moving corridors',()=>{
  for(const obstruction of ['none','body','corridor']){
    const h=harness();
    const traffic=Traffic.createCoordinator({gap:2,maxConcurrent:4,obstacles:[],bounds:Scene.actorBounds,
      legalPoint:(p,a)=>a.id==='walker'||Math.abs(p.y-78)<1e-7,route:(from,to,a)=>h.context.walkingRoute(from,to,a)});
    const blocker={id:obstruction==='corridor'?'walker':'blocker',position:obstruction==='corridor'?{x:60,y:60}:{x:60,y:78},uniformScale:1,footprint,canYield:false};
    traffic.sync(obstruction==='none'?[h.actor]:[h.actor,blocker]);
    if(obstruction==='corridor'){traffic.request(blocker.id,{x:60,y:90});assert.equal(traffic.nextAny().kind,'move');}
    const before=h.fallbacks();traffic.request(h.actor.id,target);const selected=traffic.nextAny();
    assert.equal(selected.kind,obstruction==='none'?'move':'wait',obstruction);
    assert.equal(h.fallbacks(),before,'the cached hint was presented, then checked by real Traffic rather than trusted as an exemption');
    assert.equal(traffic.state().activeMoves.length,obstruction==='body'?0:1);
  }
});
