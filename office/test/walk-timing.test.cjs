'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Timing=require('../lib/walk-timing.js');
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const world=p=>({x:p.x*12.8,y:p.y*7.2});
test('a real room route starts and ends at rest and turns with continuous zero vector velocity',()=>{
  const path=[{x:20,y:70},{x:30,y:70},{x:30,y:80}],plan=Timing.planWalk(path);
  assert.equal(plan.valid,true);close(plan.worldLength,200);close(plan.duration,937.5);assert.equal(plan.sampleAt(0).worldSpeed,0);assert.equal(plan.sampleAt(plan.duration).worldSpeed,0);
  const turn=plan.segments[0].endMs,left=plan.sampleAt(turn-.0001),at=plan.sampleAt(turn),right=plan.sampleAt(turn+.0001);
  assert.ok(left.worldSpeed<.001&&right.worldSpeed<.001);assert.equal(at.worldSpeed,0);assert.equal(at.phase,'turning');assert.deepEqual(at.point,path[1]);
  const h=.001,atWorld=world(at.point),before=world(plan.sampleAt(turn-h).point),after=world(plan.sampleAt(turn+h).point);
  assert.ok(Math.hypot((atWorld.x-before.x)/h*1000,(atWorld.y-before.y)/h*1000)<.01);assert.ok(Math.hypot((after.x-atWorld.x)/h*1000,(after.y-atWorld.y)/h*1000)<.01);
});
test('the four segment laws match their endpoint velocities and stay within the physical speed bound',()=>{
  const plan=Timing.planWalk([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:30,y:0},{x:30,y:10},{x:40,y:10}]);
  assert.deepEqual(plan.segments.map(s=>s.kind),['accelerate','cruise','brake','rest','rest']);
  for(const s of plan.segments){
    assert.equal(plan.vertices[s.index].easing,s.easing);close(plan.sampleAt(s.startMs).worldSpeed,s.startSpeed);
    const beforeEnd=plan.sampleAt(s.endMs-1e-7);close(beforeEnd.worldSpeed,s.endSpeed,1e-5);
    for(let n=0;n<=500;n++){const p=plan.sampleAt(s.startMs+s.duration*n/500);assert.ok(p.worldSpeed>=0&&p.worldSpeed<=320+1e-8);}
  }
  for(let n=0;n<plan.segments.length-1;n++)close(plan.segments[n].endSpeed,plan.segments[n+1].startSpeed);
});
test('analytic samples agree with an independent inversion of the literal WAAPI cubic-bezier strings',()=>{
  const plan=Timing.planWalk([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:30,y:0},{x:30,y:10},{x:40,y:10}]);
  const cubic=(a,b,t)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  const derivative=(a,b,t)=>3*(1-t)*(1-t)*a+6*(1-t)*t*(b-a)+3*t*t*(1-b);
  for(const s of plan.segments)for(const u of [.001,.01,.1,.25,.5,.75,.9,.99,.999]){
    let y=u,slope=1;
    if(s.easing!=='linear'){
      const [x1,y1,x2,y2]=s.easing.slice('cubic-bezier('.length,-1).split(',').map(Number);let lo=0,hi=1;
      for(let n=0;n<60;n++){const at=(lo+hi)/2;if(cubic(x1,x2,at)<u)lo=at;else hi=at;}
      const at=(lo+hi)/2;y=cubic(y1,y2,at);slope=derivative(y1,y2,at)/derivative(x1,x2,at);
    }
    const sample=plan.sampleAt(s.startMs+s.duration*u),from=plan.vertices[s.fromIndex].point,to=plan.vertices[s.toIndex].point;
    close(sample.point.x,from.x+(to.x-from.x)*y,1e-8);close(sample.point.y,from.y+(to.y-from.y)*y,1e-8);close(sample.pathDistance,s.startDistance+s.length*y,1e-7);close(sample.worldSpeed,s.length/s.duration*1000*slope,1e-6);
  }
});
test('a reverse turn cannot inherit the nonzero velocity of a same-direction straight continuation',()=>{
  const plan=Timing.planWalk([{x:0,y:0},{x:10,y:0},{x:0,y:0}]);
  assert.deepEqual(plan.segments.map(s=>s.kind),['rest','rest']);assert.equal(plan.sampleAt(plan.segments[0].endMs).worldSpeed,0);assert.equal(plan.sampleAt(plan.segments[0].endMs).phase,'turning');
  assert.equal(plan.sampleAt(plan.duration).pathDistance,256);assert.deepEqual(plan.sampleAt(plan.duration).point,{x:0,y:0});
});
test('every original vertex and endpoint interval survives; repeated points cannot invent a wider clone exemption',()=>{
  const path=[{x:1,y:2},{x:1,y:2},{x:9,y:2},{x:9,y:2},{x:9,y:8},{x:9,y:8}],before=JSON.stringify(path),plan=Timing.planWalk(path);
  assert.equal(plan.valid,true);assert.equal(plan.vertices.length,path.length);assert.equal(plan.segments.length,path.length-1);assert.deepEqual(plan.vertices.map(v=>v.point),path);assert.deepEqual(plan.vertices.map(v=>v.originalIndex),[0,1,2,3,4,5]);
  assert.equal(plan.firstNonzeroSegmentIndex,1);assert.equal(plan.lastNonzeroSegmentIndex,3);assert.equal(plan.vertices[0].offset,plan.vertices[1].offset);assert.equal(plan.vertices[2].offset,plan.vertices[3].offset);assert.equal(plan.vertices[4].offset,plan.vertices[5].offset);
  assert.equal(plan.sampleAt(plan.segments[1].endMs).phase,'turning');assert.equal(JSON.stringify(path),before);assert.equal(plan.vertices[0].offset,0);assert.equal(plan.vertices.at(-1).offset,1);
});
test('the sampler is monotone on each exact reserved leg without diagonal corner cutting or overshoot',()=>{
  const path=[{x:6,y:44},{x:29.05,y:48.2},{x:32,y:66},{x:69,y:66},{x:87,y:78}],plan=Timing.planWalk(path);let distance=-1;
  for(let n=0;n<=5000;n++){
    const p=plan.sampleAt(plan.duration*n/5000),s=plan.segments[p.segmentIndex],a=path[s.fromIndex],b=path[s.toIndex],dx=b.x-a.x,dy=b.y-a.y;
    close((p.point.x-a.x)*dy-(p.point.y-a.y)*dx,0,1e-9);assert.ok(p.point.x>=Math.min(a.x,b.x)-1e-9&&p.point.x<=Math.max(a.x,b.x)+1e-9);assert.ok(p.point.y>=Math.min(a.y,b.y)-1e-9&&p.point.y<=Math.max(a.y,b.y)+1e-9);
    assert.ok(p.pathDistance>=distance);assert.ok(p.pathDistance<=plan.worldLength);assert.ok(p.worldSpeed<=320+1e-8);distance=p.pathDistance;
  }
});
test('world distances account for the fixed world aspect ratio, never window size or DPR',()=>{
  close(Timing.planWalk([{x:0,y:0},{x:10,y:0}]).worldLength,128);close(Timing.planWalk([{x:0,y:0},{x:0,y:10}]).worldLength,72);
  close(Timing.planWalk([{x:0,y:0},{x:3,y:4}],{world:{width:100,height:100}}).worldLength,5);
});
test('a minimum duration uniformly slows the route while a long route is never truncated to 6000ms',()=>{
  const plan=Timing.planWalk([{x:0,y:0},{x:.1,y:0},{x:.2,y:0},{x:.2,y:.1}]);assert.equal(plan.duration,360);assert.ok(plan.rawDuration<360);
  for(let n=0;n<plan.segments.length-1;n++)close(plan.segments[n].endSpeed,plan.segments[n+1].startSpeed);
  for(let n=0;n<=1000;n++)assert.ok(plan.sampleAt(plan.duration*n/1000).worldSpeed<=320);
  const long=Timing.planWalk([{x:0,y:0},{x:1000,y:0}]);assert.ok(long.duration>6000);close(long.sampleAt(long.duration/2).worldSpeed,320);assert.equal(long.sampleAt(long.duration).done,true);
});
test('zero, one-point, repeated and invalid data cannot yield NaN or a fabricated origin',()=>{
  for(const path of [[{x:1,y:2}],Array.from({length:4},()=>({x:1,y:2}))]){
    const plan=Timing.planWalk(path);assert.equal(plan.valid,true);assert.equal(plan.duration,0);assert.equal(plan.sampleAt(200).phase,'still');assert.deepEqual(plan.sampleAt(null).point,{x:1,y:2});assert.equal(plan.sampleAt(Infinity).worldSpeed,0);assert.equal(plan.firstNonzeroSegmentIndex,null);
  }
  for(const path of [null,[],[{}],[{x:NaN,y:0}],[{x:Infinity,y:0}]]){const plan=Timing.planWalk(path);assert.equal(plan.valid,false);assert.deepEqual(plan.sampleAt(123),{point:null,pathDistance:0,worldSpeed:0,phase:'invalid',segmentIndex:null,progress:0,done:true});}
  for(const options of [{maxSpeed:0},{maxSpeed:Infinity},{minDuration:-1},{world:{width:0,height:720}},null])assert.equal(Timing.planWalk([{x:0,y:0},{x:1,y:1}],options).valid,false);
});
test('pure sampling can rewind for a paused compositor and cannot leak an earlier route owner into a new route',()=>{
  const input=[{x:5,y:70},{x:30,y:70}],first=Timing.planWalk(input),p=first.sampleAt(first.duration*.4),same=first.sampleAt(first.duration*.4);
  assert.deepEqual(p,same);input[0].x=99;assert.equal(first.vertices[0].point.x,5);
  const next=Timing.planWalk([p.point,{x:30,y:80}]);assert.deepEqual(next.sampleAt(0).point,p.point);assert.equal(next.sampleAt(0).pathDistance,0);assert.equal(next.sampleAt(0).worldSpeed,0);assert.deepEqual(first.sampleAt(first.duration*.4),p);
  assert.equal(first.sampleAt(-Infinity).progress,0);assert.equal(first.sampleAt(Infinity).progress,1);assert.equal(first.sampleAt(NaN).progress,0);assert.equal(first.sampleAt(null).progress,0);
});
test('the same immutable API is available as plain browser UMD without dependencies or timers',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),context={};
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/walk-timing.js'),'utf8'),context);
  assert.equal(typeof context.OfficeWalkTiming.planWalk,'function');assert.equal(Object.keys(context).join(','),'OfficeWalkTiming');
  const plan=context.OfficeWalkTiming.planWalk([{x:0,y:0},{x:1,y:1}]);assert.equal(plan.valid,true);assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.vertices)&&Object.isFrozen(plan.segments));assert.equal(plan.sampleAt(0).worldSpeed,0);
});
