/* Physical time law on the exact reserved polyline. Never changes geometry or task facts. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeWalkTiming=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const DEFAULTS=Object.freeze({maxSpeed:320,minDuration:360,width:1280,height:720});
  // x(u)=u for these cubics. The y polynomials below therefore describe the
  // browser's segment easing directly, including its endpoint derivatives.
  // Strong UI easing tokens do not impose a physical world-speed bound.
  const EASINGS=Object.freeze({
    cruise:'linear',
    rest:'cubic-bezier(.3333333333,0,.6666666667,1)',
    accelerate:'cubic-bezier(.3333333333,0,.6666666667,.5)',
    brake:'cubic-bezier(.3333333333,.5,.6666666667,1)'
  });
  const finitePoint=p=>p&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const point=p=>Object.freeze({x:p.x,y:p.y});
  function polynomial(kind,u){
    if(kind==='rest')return {distance:u*u*(3-2*u),derivative:6*u*(1-u)};
    if(kind==='accelerate')return {distance:u*u*(1.5-.5*u),derivative:3*u-1.5*u*u};
    if(kind==='brake')return {distance:1.5*u-.5*u*u*u,derivative:1.5-1.5*u*u};
    return {distance:u,derivative:1};
  }
  function unavailable(reason){
    return Object.freeze({valid:false,reason,duration:0,rawDuration:0,worldLength:0,vertices:Object.freeze([]),segments:Object.freeze([]),firstNonzeroSegmentIndex:null,lastNonzeroSegmentIndex:null,
      sampleAt:()=>Object.freeze({point:null,pathDistance:0,worldSpeed:0,phase:'invalid',segmentIndex:null,progress:0,done:true})});
  }
  function planWalk(path,options={}){
    if(!Array.isArray(path)||!path.length)return unavailable('empty-path');
    if(!path.every(finitePoint))return unavailable('invalid-point');
    if(!options||typeof options!=='object')return unavailable('invalid-options');
    const width=options.world===undefined?DEFAULTS.width:options.world?.width,height=options.world===undefined?DEFAULTS.height:options.world?.height;
    const maxSpeed=options.maxSpeed===undefined?DEFAULTS.maxSpeed:options.maxSpeed,minDuration=options.minDuration===undefined?DEFAULTS.minDuration:options.minDuration;
    if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||!Number.isFinite(maxSpeed)||maxSpeed<=0||!Number.isFinite(minDuration)||minDuration<0)return unavailable('invalid-options');
    const points=path.map(point),lengths=[],directions=[],nonzero=[];
    let worldLength=0;
    for(let i=0;i<points.length-1;i++){
      const dx=(points[i+1].x-points[i].x)*width/100,dy=(points[i+1].y-points[i].y)*height/100,length=Math.hypot(dx,dy);
      if(!Number.isFinite(length))return unavailable('distance-overflow');
      lengths.push(length);directions.push(length?{x:dx/length,y:dy/length}:null);worldLength+=length;
      if(length)nonzero.push(i);
    }
    if(!Number.isFinite(worldLength))return unavailable('distance-overflow');
    const first=nonzero[0]??null,last=nonzero.at(-1)??null;
    if(first===null){
      const vertices=Object.freeze(points.map((p,i)=>Object.freeze({point:p,originalIndex:i,offset:points.length===1?0:i/(points.length-1),easing:EASINGS.cruise})));
      const segments=Object.freeze(lengths.map((_,i)=>Object.freeze({index:i,fromIndex:i,toIndex:i+1,length:0,startMs:0,endMs:0,duration:0,startDistance:0,endDistance:0,startSpeed:0,endSpeed:0,kind:'still',easing:EASINGS.cruise})));
      return Object.freeze({valid:true,reason:'still',duration:0,rawDuration:0,worldLength:0,maxSpeed,world:Object.freeze({width,height}),vertices,segments,firstNonzeroSegmentIndex:null,lastNonzeroSegmentIndex:null,
        sampleAt:()=>Object.freeze({point:point(points.at(-1)),pathDistance:0,worldSpeed:0,phase:'still',segmentIndex:null,progress:1,done:true})});
    }
    // Only a same-direction straight continuation carries nonzero velocity
    // through a vertex. Every real turn has zero velocity on both sides, so
    // its world-space vector velocity is C1 without rounding the safe path.
    const speeds=points.map((_,i)=>{
      const before=nonzero.findLast(index=>index<i),after=nonzero.find(index=>index>=i);
      if(before===undefined||after===undefined)return 0;
      const a=directions[before],b=directions[after],cross=a.x*b.y-a.y*b.x,dot=a.x*b.x+a.y*b.y;
      return Math.abs(cross)<=1e-9&&dot>0?maxSpeed:0;
    });
    const rawSegments=lengths.map((length,i)=>{
      const from=speeds[i],to=speeds[i+1],kind=!length?'still':from&&to?'cruise':!from&&!to?'rest':to?'accelerate':'brake';
      const rawMs=length/maxSpeed*(kind==='cruise'?1000:1500);
      return {kind,rawMs,easing:EASINGS[kind]||EASINGS.cruise};
    });
    const rawDuration=rawSegments.reduce((sum,s)=>sum+s.rawMs,0);
    if(!(rawDuration>0)||!Number.isFinite(rawDuration))return unavailable('duration-overflow');
    // The former 6000ms truncation would increase peak speed on a long route.
    // A minimum can only stretch this clock; the original 100-body native
    // completion limit remains a separate acceptance constraint.
    const duration=Math.max(minDuration,rawDuration),times=[0],segments=[];
    let rawTime=0,distance=0;
    for(let i=0;i<lengths.length;i++){
      const raw=rawSegments[i],length=lengths[i],startMs=times.at(-1),startDistance=distance;
      rawTime+=raw.rawMs;distance+=length;
      const endMs=i>=last?duration:rawTime/rawDuration*duration,segmentDuration=endMs-startMs;
      if(length&&(!(segmentDuration>0)||!Number.isFinite(segmentDuration)))return unavailable('duration-overflow');
      const rate=length?length/segmentDuration*1000:0;
      segments.push(Object.freeze({index:i,fromIndex:i,toIndex:i+1,length,startMs,endMs,duration:segmentDuration,startDistance,endDistance:distance,
        startSpeed:rate*polynomial(raw.kind,0).derivative,endSpeed:rate*polynomial(raw.kind,1).derivative,kind:raw.kind,easing:raw.easing}));
      times.push(endMs);
    }
    const vertices=Object.freeze(points.map((p,i)=>Object.freeze({point:p,originalIndex:i,offset:i===points.length-1?1:times[i]/duration,easing:rawSegments[i]?.easing||EASINGS.cruise})));
    const moving=nonzero.map(i=>segments[i]);
    function sampleAt(elapsedMs){
      const input=typeof elapsedMs==='number'&&!Number.isNaN(elapsedMs)?elapsedMs:0,t=Math.max(0,Math.min(duration,input));
      if(t>=duration)return Object.freeze({point:point(points.at(-1)),pathDistance:worldLength,worldSpeed:0,phase:'arrived',segmentIndex:last,progress:1,done:true});
      let lo=0,hi=moving.length-1;
      while(lo<hi){const middle=(lo+hi)>>1;if(t<moving[middle].endMs)hi=middle;else lo=middle+1;}
      const s=moving[lo],u=Math.max(0,Math.min(1,(t-s.startMs)/s.duration)),value=polynomial(s.kind,u),a=points[s.fromIndex],b=points[s.toIndex];
      const phase=t>0&&t===s.startMs&&s.startSpeed===0?'turning':s.kind==='cruise'?'cruising':s.kind==='accelerate'?'accelerating':s.kind==='brake'?'braking':u<.5?'accelerating':'braking';
      return Object.freeze({point:point({x:a.x+(b.x-a.x)*value.distance,y:a.y+(b.y-a.y)*value.distance}),pathDistance:s.startDistance+s.length*value.distance,
        worldSpeed:s.length/s.duration*1000*value.derivative,phase,segmentIndex:s.index,progress:t/duration,done:false});
    }
    // These indices describe geometry only. They do not authorize a wider
    // parent/child exemption than Traffic's actual first/last reserved leg.
    return Object.freeze({valid:true,reason:'moving',duration,rawDuration,worldLength,maxSpeed,world:Object.freeze({width,height}),vertices,segments:Object.freeze(segments),firstNonzeroSegmentIndex:first,lastNonzeroSegmentIndex:last,sampleAt});
  }
  return Object.freeze({DEFAULTS,EASINGS,planWalk});
});
