'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const repo=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(repo,'office/scripts/render-lifecycle-previews.cjs'),'utf8'),Timing=require('../lib/walk-timing.js');
const begin=source.indexOf('function markup(group){'),end=source.indexOf('\nconst guard=',begin);assert.ok(begin>=0&&end>begin);
const markup=new Function('path','pathToFileURL','repo','scratch','width','height',source.slice(begin,end)+';return markup;')(path,pathToFileURL,repo,'/tmp/public-lifecycle-test',800,420);
function fixture(group='walking'){
  const html=markup({id:group,label:'Original preview',detail:'In-place joint sampling'}),inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];new Function(inline);
  let ownedWrite=false,owner=null;const calls=[];
  const loop=()=>{let value=0;return{animationName:undefined,startTime:1000,playState:'paused',effect:{getTiming:()=>({iterations:Infinity})},get currentTime(){return value;},set currentTime(next){assert.equal(ownedWrite,true,'only the real locomotion API owns a stride clock');value=next;}};};
  const loops=group==='walking'?Array.from({length:8},loop):[],finite=Array.from({length:group==='walking'?1:8},()=>({startTime:1050,currentTime:99,playState:'running',ready:Promise.resolve(),effect:{getTiming:()=>({iterations:1})},pause(){this.playState='paused';}}));
  const layer={hidden:true,style:{},dataset:{}},body={querySelector:selector=>selector==='.avatar-performance'?layer:selector==='.ap-rig'?{}:{innerHTML:''}};
  const actor={dataset:{},style:{transform:'translate(400px,320px) scale(2.35)'},querySelector:()=>body,getAnimations:()=>[...loops,...finite]};
  const controller={update(){actor.dataset.locomotion='true';},locomotion(sample){if(owner)assert.equal(sample.owner,owner);else owner=sample.owner;calls.push({...sample});ownedWrite=true;for(const a of loops)a.currentTime=sample.distanceWorld*600/192;ownedWrite=false;actor.dataset.locomotionPhase=String(sample.distanceWorld*600/192);return true;}};
  const timeline={currentTime:1000},context={document:{timeline,querySelector:selector=>selector==='image,use,img'?null:actor,querySelectorAll:()=>[]},OfficeWalkTiming:Timing,OfficeAvatarPerformance:{create:()=>controller},OfficeAnimationPreviewBody:{install(){}},OfficeCloneMotion:{burst:()=>({})},requestAnimationFrame:callback=>callback(),console};context.window=context;vm.createContext(context);vm.runInContext(inline,context);
  return{context,actor,loops,finite,timeline,calls,html};
}
test('public walking frames call the real timing shape and preserve stride clock ownership at a fixed screen anchor',async()=>{
  const h=fixture(),prepared=await h.context.prepare();assert.equal(prepared.walkingPlan.worldDistance,384);assert.equal(prepared.walkingPlan.plannedDurationMs,1800);assert.ok(h.html.includes('../lib/walk-timing.js'));
  const loopRefs=h.loops.slice(),anchor=h.actor.style.transform;
  for(let frame=0;frame<96;frame++){
    const ms=frame*1000/48,result=await h.context.seek(ms),expected=Timing.planWalk([{x:0,y:0},{x:30,y:0}]).sampleAt(ms),call=h.calls.at(-1);
    assert.equal(call.elapsedMs,ms);assert.equal(result.pathDistance,expected.pathDistance);assert.equal(call.speedWorld,expected.worldSpeed);assert.equal(result.stridePhaseMs,expected.pathDistance*600/192);assert.equal(h.actor.style.transform,anchor);assert.ok(h.loops.every((a,i)=>a===loopRefs[i]));
  }
  assert.equal(h.calls.at(-1).distanceWorld,384);assert.equal(h.calls.at(-1).speedWorld,0);assert.equal(h.timeline.currentTime,1000,'exporter never replaces or drives document.timeline');
});
test('only finite clocks use exporter seeking; the infinite distance phase is not the old fixed 600ms wall loop',async()=>{
  const h=fixture();await h.context.prepare();await h.context.seek(100);
  assert.equal(h.finite[0].currentTime,50);assert.notEqual(h.loops[0].currentTime,100);assert.notEqual(h.loops[0].currentTime,50);assert.equal(h.loops[0].currentTime,Timing.planWalk([{x:0,y:0},{x:30,y:0}]).sampleAt(100).pathDistance*600/192);
});
for(const group of ['split','absorb'])test(group+' retains the original finite FX sampling without inventing a locomotion owner',async()=>{
  const h=fixture(group),prepared=await h.context.prepare();assert.equal(prepared.walkingPlan,null);assert.equal(prepared.motions,8);assert.equal(await h.context.seek(200),null);assert.equal(h.calls.length,0);assert.ok(h.finite.every(a=>a.currentTime===150));
});
