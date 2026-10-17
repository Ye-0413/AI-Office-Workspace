'use strict';
// Tests the actual installAudit helper. The independent oracle instead
// constructs each full swept body polygon from eight rectangle corners.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'support/walking-native-audit.cjs'),'utf8');
function extracted(name){const start=source.indexOf('  function '+name+'(');assert.ok(start>=0,'real shared audit helper '+name);const next=source.indexOf('\n  function ',start+1);assert.ok(next>start);return source.slice(start,next);}
const context={originalRoute:row=>row.route};vm.createContext(context);
vm.runInContext(extracted('futureSweepsOverlap')+extracted('remainingRoute'),context);
const actual=context.futureSweepsOverlap;
const sweep=(from,to,extents={left:2,right:2,top:2,bottom:2})=>({from,to,extents});
const rectangle=(point,e)=>[{x:point.x-e.left,y:point.y-e.top},{x:point.x+e.right,y:point.y-e.top},{x:point.x+e.right,y:point.y+e.bottom},{x:point.x-e.left,y:point.y+e.bottom}];
function hull(values){
 const points=values.slice().sort((a,b)=>a.x-b.x||a.y-b.y).filter((p,i,all)=>!i||p.x!==all[i-1].x||p.y!==all[i-1].y);
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lower=[],upper=[];
 for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(const p of points.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function independent(a,b,tolerance=1){
 // Shrinking both body rectangles .5*tolerance per side gives exactly the
 // original required >tolerance axis overlap, without constructing relative
 // centre coordinates or the production Minkowski window.
 const polygon=value=>{const e=Object.fromEntries(Object.entries(value.extents).map(([key,n])=>[key,n-tolerance/2]));assert.ok(e.left+e.right>0&&e.top+e.bottom>0,'oracle uses nonempty bodies');return hull([...rectangle(value.from,e),...rectangle(value.to,e)]);};
 const left=polygon(a),right=polygon(b);
 for(const p of [left,right])for(let i=0;i<p.length;i++){
  const from=p[i],to=p[(i+1)%p.length],normal={x:from.y-to.y,y:to.x-from.x},length=Math.hypot(normal.x,normal.y);if(!length)continue;
  const projection=polygon=>{const values=polygon.map(point=>(point.x*normal.x+point.y*normal.y)/length);return[Math.min(...values),Math.max(...values)];};
  const x=projection(left),y=projection(right);if(x[1]<=y[0]+1e-8||y[1]<=x[0]+1e-8)return false;
 }
 return true;
}
function assertSymmetric(a,b,expected,tolerance=1){assert.equal(actual(a,b,tolerance),expected);assert.equal(actual(b,a,tolerance),expected,'exchanging physical route owners preserves the answer');assert.equal(independent(a,b,tolerance),expected,'independent eight-corner sweep oracle');}
function enclosing(value){const from=rectangle(value.from,value.extents),to=rectangle(value.to,value.extents),all=from.concat(to);return{left:Math.min(...all.map(p=>p.x)),right:Math.max(...all.map(p=>p.x)),top:Math.min(...all.map(p=>p.y)),bottom:Math.max(...all.map(p=>p.y))};}

test('actual dense synthetic capture diagonal and horizontal leg separate continuously despite the old AABB alarm',()=>{
 // Coordinates are from a wholly synthetic native fixture, with no real
 // session IDs, user paths, screenshots or runtime data dependency.
 const diagonal=sweep({x:640,y:496.79998779296875},{x:951.739990234375,y:539.280029296875},
  {left:9.246555175781282,right:9.246608886718718,top:9.666888427734364,bottom:7.313244628906261});
 const horizontal=sweep({x:664.1799926757812,y:538.1199951171875},{x:396.6000061035156,y:538.1199951171875},
  {left:9.246989746093732,right:9.246174316406268,top:9.667032226562495,bottom:7.313070312500005});
 const a=enclosing(diagonal),b=enclosing(horizontal);
 assert.ok(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1,'the previous double-AABB check really reports this pair');
 assertSymmetric(diagonal,horizontal,false,0);assertSymmetric(diagonal,horizontal,false,1);
});

test('a true crossing at two different progress values remains forbidden independently of either Animation clock',()=>{
 const a=sweep({x:0,y:0},{x:100,y:0}),b=sweep({x:90,y:-10},{x:90,y:90});
 assertSymmetric(a,b,true); // Crossing occurs at a(.9), b(.1), not a(t)=b(t).
});

test('asymmetric nameplate extents and the original one-pixel tolerance retain their exact orientation',()=>{
 const a=sweep({x:0,y:0},{x:10,y:0},{left:2,right:12,top:3,bottom:9});
 const b=sweep({x:26,y:0},{x:26,y:0},{left:5,right:1,top:2,bottom:2});
 assertSymmetric(a,b,false,1); // A.right=22, B.left=21: exactly one pixel.
 b.from.x=b.to.x=25.99999;assertSymmetric(a,b,true,1);
 b.from.x=b.to.x=26.00001;assertSymmetric(a,b,false,1);
 const below=sweep({x:5,y:13},{x:5,y:13},{left:2,right:2,top:5,bottom:2});
 assertSymmetric(a,below,false,1);below.from.y=below.to.y=12.99999;assertSymmetric(a,below,true,1);
});

test('a genuine 1e-5 pixel interior overlap is rejected instead of being rounded away',()=>{
 const a=sweep({x:0,y:0},{x:10,y:0}),b=sweep({x:0,y:4},{x:10,y:4});
 assertSymmetric(a,b,false,0);b.from.y=b.to.y=3.99999;assertSymmetric(a,b,true,0);
 b.from.y=b.to.y=2.99999;assertSymmetric(a,b,true,1);
 b.from.y=b.to.y=3.00001;assertSymmetric(a,b,false,1);
});

test('parallel, reversed, zero-length and coincident endpoint legs receive full continuous-body checks',()=>{
 const a=sweep({x:0,y:0},{x:100,y:0});
 assertSymmetric(a,sweep({x:90,y:0},{x:10,y:0}),true);
 assertSymmetric(a,sweep({x:0,y:6},{x:100,y:6}),false);
 assertSymmetric(a,sweep({x:50,y:0},{x:50,y:0}),true);
 assertSymmetric(sweep({x:0,y:0},{x:0,y:0}),sweep({x:2,y:0},{x:2,y:0}),true);
 assertSymmetric(sweep({x:0,y:0},{x:0,y:0}),sweep({x:8,y:0},{x:8,y:0}),false);
 // The geometry helper has no IDs and grants unrelated endpoint bodies no
 // named-family permission; that remains a separate audit-owner predicate.
 for(const point of [a.from,a.to])assertSymmetric(a,sweep(point,point),true,1);
});

test('actual remainingRoute preserves an unpassed corner and releases only the physically completed prefix',()=>{
 const e={left:2,right:2,top:2,bottom:2},points=[{x:0,y:0,offset:0},{x:10,y:0,offset:.5},{x:10,y:10,offset:1}];
 const row=(x,y,progress)=>({x,y,worldBox:{left:x-2,right:x+2,top:y-2,bottom:y+2},route:{points,progress}});
 const crossing=sweep({x:0,y:5},{x:20,y:5},e),before=context.remainingRoute(row(8,0,.4)),after=context.remainingRoute(row(10,9,.95));
 assert.equal(before.length,2);assert.deepEqual(JSON.parse(JSON.stringify(before[0].from)),{x:8,y:0});
 assert.ok(before.some(leg=>actual(leg,crossing,1)),'the actual first leg has not passed the vertical corridor');
 assert.equal(after.length,1);assert.deepEqual(JSON.parse(JSON.stringify(after[0].from)),{x:10,y:9});
 assert.ok(after.every(leg=>!actual(leg,crossing,1)),'only a truly completed prefix may release the crossing');
 assert.equal(context.remainingRoute({...row(8,0,.4),route:null}),null);
});

test('deterministic asymmetric continuous sweeps agree with an independent eight-corner polygon SAT oracle',()=>{
 let seed=0x16c0111d;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let positives=0,negatives=0;
 for(let i=0;i<2000;i++){
  const route=()=>{const from={x:random()*100-50,y:random()*100-50},to=i%13===0?{...from}:{x:random()*100-50,y:random()*100-50};return sweep(from,to,{left:2+random()*10,right:2+random()*10,top:2+random()*10,bottom:2+random()*10});};
  const a=route(),b=route(),tolerance=i%2,expected=independent(a,b,tolerance);
  assert.equal(actual(a,b,tolerance),expected,'continuous sweep pair '+i);assert.equal(actual(b,a,tolerance),expected,'symmetric pair '+i);
  if(expected)positives++;else negatives++;
 }
 assert.ok(positives>300&&negatives>300,'batch contains meaningful intersecting and disjoint geometries');
});
