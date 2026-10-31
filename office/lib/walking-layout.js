/* Reachable furniture-side parking. Pure coordinates; never changes observations. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./scene-model.js') : root.OfficeScene, typeof module === 'object' && module.exports ? require('./scene-traffic.js') : root.OfficeSceneTraffic, undefined,
    () => (typeof module === 'object' && module.exports ? require('./size-stability.js') : root.OfficeSizeStability)?.ACTOR_FOOTPRINT);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeWalkingLayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLayout(Scene, Traffic, entrance, footprintDefaults) {
  'use strict';
  const W = Scene.WORLD.width, H = Scene.WORLD.height, EPS = 1e-7;
  const proofCache = new WeakMap();
  const proofBySeat = new WeakMap();
  const FIT_FLOOR = .9;
  const ENTRY_POINT = Object.freeze(entrance ? {x:entrance.x,y:entrance.y} : Scene.ENTRY_POINT ? {...Scene.ENTRY_POINT} : { x: 87, y: 78 });
  const entranceLayouts = new Map();
  const HOLDING = Symbol('empty walking holding pocket');
  const HOLDING_CANDIDATES = Object.freeze((Scene.HOLDING_POINTS || [...(entrance?[{x:30.5,y:73},{x:50,y:73},{x:15,y:44.5}]:[]),{x:50,y:78},{x:30.5,y:44.5},{x:74,y:60},{x:12,y:78},{x:88,y:44.5},{x:93,y:84}]).map(Object.freeze));
  // One measured thirteen-body distribution, not a higher global search
  // threshold. These zone/ordinal coordinates are only a cheap hint: final
  // access, actual transition and named clone endpoints must still prove.
  const THIRTEEN_PROFILE = Object.freeze({scale:.4,holding:{x:30.5,y:82},points:{library:[[8,44],[19,44]],board:[[43,44],[56,44],[69.05,53]],desk:[[40,84],[48.3,84]],bench:[[82,44],[93,44]],sofa:[[8,84],[19,84]],lobby:[[56.6,84],[64.9,84]]}});
  const CORRIDORS = Object.freeze((Scene.CORRIDORS || [[{x:31.5,y:44.5},{x:31.5,y:82}],[{x:73.5,y:44.5},{x:73.5,y:82}],[{x:31.5,y:78},{x:Math.min(82,ENTRY_POINT.x),y:ENTRY_POINT.y}],[{x:31.5,y:44.5},{x:73.5,y:44.5}]]).map(path=>Object.freeze(path.map(Object.freeze))));
  const OBSTACLES = Object.freeze(Scene.OBSTACLES.map(rect => Object.freeze({ ...rect })));
  const defaultGapForScale = scale => 2 + 10 * Math.max(0, Number(scale) || 0);
  const gapForScale = scale => fullFloorMode ? 2 : defaultGapForScale(scale);
  function rememberProof(seats,record){proofCache.set(seats,record);for(const seat of seats.values())proofBySeat.set(seat,record);}
  function freezePlain(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezePlain(child);Object.freeze(value);}return value;}
  function atScale(page,scale){
    const targetUniformScale=page.targetUniformScale||page.uniformScale;
    if(Math.abs(scale-page.uniformScale)<EPS&&page.targetUniformScale)return page;
    const seats=new Map([...page.seats].map(([id,p])=>[id,{...p,uniformScale:scale,targetUniformScale}]));
    Object.defineProperties(seats,{fits:{value:true},unplacedIds:{value:[]}});
    return{...page,seats,uniformScale:scale,targetUniformScale,gap:gapForScale(scale),readability:{canvasPixels:154*scale,paintedHeadPixels:55*scale,paintedSpanPixels:75*scale,nameplatePixels:176*scale,recommendedMinimumScale:.35,needsMoreSpace:scale<.35,expansionFactor:Math.max(1,.35/scale)}};
  }
  const area = (id, x1, y1, x2, y2, zh, en) => Object.freeze({ id, x1, y1, x2, y2, labelZh: zh, labelEn: en });
  // Side seats stay on the corresponding furniture's side of the workshop.
  // They are real floor aprons, never points in a desk or the opposite bench.
  const ZONE_AREAS = Object.freeze(Scene.WALKING_AREAS || {
    library: Object.freeze([area('library-front',5.2,40.9,31.8,48.1,'书架前','Library apron'),area('library-side',29.05,48.2,32.05,75.5,'书架侧廊','Library side aisle'),area('reading-nook',5.2,76,31.8,85.7,'阅读茶桌侧席','Reading nook')]),
    board: Object.freeze([area('board-front',32.2,40.9,69.1,46.1,'白板前','Board apron'),area('board-left',29.05,48.2,32.05,68.7,'白板左侧廊','Left discussion aisle'),area('board-right',69.05,48.2,77.05,68.7,'白板右侧廊','Right discussion aisle'),area('planning-table-front',32.2,69,73,75.5,'构思讨论席','Planning discussion apron')]),
    bench: Object.freeze([area('bench-front',70,40.9,94.8,46.1,'实验台前','Bench apron'),area('bench-side',69.05,48.2,77.05,75.5,'实验台侧廊','Bench side aisle'),area('equipment-apron',69.05,76,94.8,85.7,'器材架侧席','Equipment side seats')]),
    desk: Object.freeze([area('desk-front',30,69,73,85.7,'工作台前','Desk apron'),area('desk-left',29.05,48.2,32.05,68.7,'工作台左侧廊','Left desk aisle'),area('desk-right',69.05,48.2,77.05,75.5,'工作台右侧廊','Right desk aisle'),area('desk-back',33,40.9,68.5,46.1,'工作台背侧席','Rear desk approach')]),
    sofa: Object.freeze([area('lounge-front',5.2,76,31.8,85.7,'沙发茶桌前','Lounge apron'),area('lounge-side',29.05,54,32.05,75.5,'沙发侧席','Lounge side seats')]),
    front: Object.freeze([area('reply-apron',30,76,73,85.7,'联络台前','Reply apron'),area('reply-left',29.05,69,32.05,75.5,'联络左侧席','Left reply seats'),area('reply-right',69.05,69,77.05,75.5,'联络右侧席','Right reply seats')]),
    archive: Object.freeze([area('archive-front',69.05,76,94.8,85.7,'成果架前','Archive apron'),area('archive-side',69.05,49,77.05,75.5,'成果架侧廊','Archive side aisle')]),
    lobby: Object.freeze([area('lobby-front',54,76,82,85.7,'门厅观察席','Lobby observation seats'),area('lobby-side',69.05,48.2,77.05,75.5,'门厅侧廊','Lobby side aisle')]),
    exit: Object.freeze([area('door-side',76,76,94.8,85.7,'入口侧席','Doorway side seats'),area('door-approach',69.05,68.9,77.05,75.5,'入口侧廊','Doorway approach')])
  });
  const ZONE_ANCHORS = Object.freeze(Object.fromEntries(Object.entries(Scene.ZONES).map(([id, zone]) => [id, Object.freeze({ x: zone.x, y: zone.y, zone: id, areas: ZONE_AREAS[id], element: ({library:'leaves',board:'paper',bench:'water',desk:'plant',sofa:'tea',front:'windchime',archive:'seed',lobby:'rain',exit:'bell'})[id] })])));
  const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
  const validFootprint = f => f && ['left','right','top','bottom'].every(key => Number.isFinite(f[key]) && f[key] >= 0) && f.left+f.right>0 && f.top+f.bottom>0;
  const footprintOf = value => validFootprint(value) ? value : Scene.ACTOR_FOOTPRINT.root;
  const scaleOf = value => Number.isFinite(value?.uniformScale) && value.uniformScale>0 ? value.uniformScale : Number.isFinite(value?.scale) && value.scale>0 ? value.scale : 1;
  const requestedScaleOf = options => Number.isFinite(options.physicalScale) && options.physicalScale>0 && options.physicalScale<=1.35
    ? options.physicalScale : Math.max(.65,Math.min(1.35,Number(options.requestedScale)||1));
  const pixel = p => ({x:p.x*W/100,y:p.y*H/100});
  const percent = p => ({x:p.x*100/W,y:p.y*100/H});
  const inArea = (p,a) => p.x>=a.x1-EPS&&p.x<=a.x2+EPS&&p.y>=a.y1-EPS&&p.y<=a.y2+EPS;
  const zoneArea = (p,zone) => (ZONE_AREAS[zone]||ZONE_AREAS.lobby).find(a=>inArea(p,a));
  // A full zone may lend neighbouring floor; the seat keeps its own work zone.
  const ALL_AREAS = Object.freeze([...new Map(Object.values(ZONE_AREAS).flat().map(a=>[a.id,a])).values()]);
  const FLOOR_DOMAIN = Scene.ACTOR_DOMAIN || {x1:5,x2:95,y1:40.7,y2:86};
  const FULL_FLOOR = area('open-floor',FLOOR_DOMAIN.x1,FLOOR_DOMAIN.y1,FLOOR_DOMAIN.x2,FLOOR_DOMAIN.y2,'开放工位','Open floor station');
  const spillAreas = zone => { const anchor=Scene.ZONES[zone]||Scene.ZONES.lobby,own=new Set((ZONE_AREAS[zone]||[]).map(a=>a.id)); return ALL_AREAS.filter(a=>!own.has(a.id)).sort((a,b)=>Math.hypot((a.x1+a.x2)/2-anchor.x,(a.y1+a.y2)/2-anchor.y)-Math.hypot((b.x1+b.x2)/2-anchor.x,(b.y1+b.y2)/2-anchor.y)||a.id.localeCompare(b.id)); };
  function legalPoint(point, actor={}) {
    return Scene.legalActorPoint(point,{...actor,uniformScale:scaleOf(actor),footprint:footprintOf(actor.footprint),layoutMode:'walking',reservedRects:actor.reservedRects||Scene.CLOCK_RESERVED});
  }
  function dimensions(scale,footprint,viewport=Scene.ACTOR_VIEWPORT) {
    const domain=Scene.ACTOR_DOMAIN||{x1:5,x2:95,y1:40.7,y2:86};
    return {left:Math.max(domain.x1*W/100,viewport.left+footprint.left*scale),right:Math.min(domain.x2*W/100,viewport.right-footprint.right*scale),top:Math.max(domain.y1*H/100,viewport.top+footprint.top*scale),bottom:Math.min(domain.y2*H/100,viewport.bottom-footprint.bottom*scale)};
  }
  function staticBlocks(scale,footprint,reservedRects) {
    return OBSTACLES.map(r=>({left:(r.x1-.8)*W/100,right:(r.x2+.8)*W/100,top:(r.y1-.8)*H/100,bottom:(r.y2+.8)*H/100})).concat(reservedRects.map(r=>({left:r.left-footprint.right*scale-4,right:r.right+footprint.left*scale+4,top:r.top-footprint.bottom*scale-4,bottom:r.bottom+footprint.top*scale+4})));
  }
  function segmentBlocked(a,b,blocks) {
    return blocks.some(r=>Scene.segmentHitsRect(a,b,{x1:r.left,y1:r.top,x2:r.right,y2:r.bottom},0));
  }
  function outsideDomain(p,d) { return p.x<d.left-EPS||p.x>d.right+EPS||p.y<d.top-EPS||p.y>d.bottom+EPS; }
  function route(start,target,actor={}) {
    if(!validPoint(start)||!validPoint(target))return [];
    const scale=scaleOf(actor),footprint=footprintOf(actor.footprint),reserved=actor.reservedRects||Scene.CLOCK_RESERVED;
    const d=dimensions(scale,footprint,actor.viewport||Scene.ACTOR_VIEWPORT),a=pixel(start),b=pixel(target),blocks=staticBlocks(scale,footprint,reserved);
    if(outsideDomain(a,d)||outsideDomain(b,d)||segmentBlocked(a,a,blocks)||segmentBlocked(b,b,blocks))return[{...start}];
    if(!segmentBlocked(a,b,blocks))return[{...start},{...target}];
    const nodes=[a,b];
    for(const r of blocks)for(const p of [{x:r.left-1,y:r.top-1},{x:r.right+1,y:r.top-1},{x:r.left-1,y:r.bottom+1},{x:r.right+1,y:r.bottom+1}])if(!outsideDomain(p,d)&&!segmentBlocked(p,p,blocks))nodes.push(p);
    const costs=new Float64Array(nodes.length).fill(Infinity),parents=new Int32Array(nodes.length).fill(-1),visited=new Uint8Array(nodes.length);costs[0]=0;
    for(let pass=0;pass<nodes.length;pass++){
      let at=-1;for(let i=0;i<nodes.length;i++)if(!visited[i]&&(at<0||costs[i]<costs[at]))at=i;
      if(at<0||!Number.isFinite(costs[at]))break;
      if(at===1){const path=[];for(let i=1;i>=0;i=parents[i])path.unshift(percent(nodes[i]));path[0]={...start};path[path.length-1]={...target};return path;}
      visited[at]=1;
      for(let i=0;i<nodes.length;i++)if(!visited[i]&&!segmentBlocked(nodes[at],nodes[i],blocks)){const cost=costs[at]+Math.hypot(nodes[at].x-nodes[i].x,nodes[at].y-nodes[i].y);if(cost<costs[i]){costs[i]=cost;parents[i]=at;}}
    }
    return[{...start}];
  }
  // A retired main owns a finite trip from its real feet to the doorway,
  // followed by removal. It does not need another permanent work station or
  // a peer-free destination after arrival. Walking is already pass-through;
  // furniture, the clock and the complete viewport envelope still apply.
  function retiringRoute(start,options={}) {
    if(!validPoint(start))return null;
    const uniformScale=scaleOf({uniformScale:options.uniformScale,scale:options.requestedScale});
    const defaults=footprintDefaults?.()||Scene.ACTOR_FOOTPRINT;
    const footprint=validFootprint(options.footprint)?options.footprint:defaults.root;
    const viewport=options.viewport||Scene.ACTOR_VIEWPORT,reservedRects=options.reservedRects||Scene.CLOCK_RESERVED;
    const actor={uniformScale,footprint,viewport,reservedRects};
    if(!legalPoint(start,actor))return null;
    const journey=entryPoint=>{
      if(!legalPoint(entryPoint,actor))return null;
      const path=route(start,entryPoint,actor);
      if(!path.length||!validPoint(path.at(-1))||Math.abs(path.at(-1).x-entryPoint.x)>EPS||Math.abs(path.at(-1).y-entryPoint.y)>EPS)return null;
      // A zero-leg arrival is valid only at the exact legal doorway point.
      if(path.length===1&&!legalPoint(start,actor))return null;
      return{path,entryPoint:{...entryPoint},uniformScale};
    };
    if(validPoint(options.entryPoint)){const preferred=journey(options.entryPoint);if(preferred)return preferred;}
    const direct=journey(ENTRY_POINT);if(direct)return direct;
    const d=dimensions(uniformScale,footprint,viewport);
    if(d.left>d.right||d.top>d.bottom)return null;
    const source=pixel(ENTRY_POINT),candidates=[percent({x:Math.max(d.left,Math.min(d.right,source.x)),y:Math.max(d.top,Math.min(d.bottom,source.y))})];
    for(let y=d.top;y<=d.bottom+EPS;y+=18)for(let x=d.left;x<=d.right+EPS;x+=24)candidates.push(percent({x,y}));
    candidates.sort((a,b)=>Scene.distance(a,ENTRY_POINT)-Scene.distance(b,ENTRY_POINT)||a.y-b.y||a.x-b.x);
    for(const candidate of candidates){const result=journey(candidate);if(result)return result;}
    return null;
  }
  function inflatedActor(point,own,mover,scale,gap) {
    const bounds=Scene.actorBounds(point,{uniformScale:scale,footprint:own});
    return {left:bounds.left-mover.right*scale-gap,right:bounds.right+mover.left*scale+gap,top:bounds.top-mover.bottom*scale-gap,bottom:bounds.bottom+mover.top*scale+gap};
  }
  function reachability(seats,footprints,scale,envelope,reservedRects,viewport,extraTargets=new Map()) {
    const d=dimensions(scale,envelope,viewport),step=Math.max(1,Math.min(3,(envelope.left+envelope.right)*scale/8)),cols=Math.floor((d.right-d.left)/step)+1,rows=Math.floor((d.bottom-d.top)/step)+1;
    if(cols<1||rows<1)return null;
    const total=cols*rows,blocked=new Uint8Array(total),parents=new Int32Array(total).fill(-2),queue=new Int32Array(total);
    const fixed=staticBlocks(scale,envelope,reservedRects),actors=[...seats].filter(()=>!passThroughMode).map(([id,p])=>({id,...inflatedActor(p,footprints.get(id),envelope,scale,gapForScale(scale))})),blocks=fixed.concat(actors);
    for(const r of blocks){const x0=Math.max(0,Math.ceil((r.left-step/2-d.left)/step)),x1=Math.min(cols-1,Math.floor((r.right+step/2-d.left)/step)),y0=Math.max(0,Math.ceil((r.top-step/2-d.top)/step)),y1=Math.min(rows-1,Math.floor((r.bottom+step/2-d.top)/step));for(let y=y0;y<=y1;y++)blocked.fill(1,y*cols+x0,y*cols+x1+1);}
    const gridPoint=index=>({x:d.left+index%cols*step,y:d.top+Math.floor(index/cols)*step}),entry=pixel(ENTRY_POINT);
    let origin=-1;
    const ex=Math.round((entry.x-d.left)/step),ey=Math.round((entry.y-d.top)/step);
    for(let radius=0;radius<5&&origin<0;radius++)for(let dy=-radius;dy<=radius&&origin<0;dy++)for(let dx=-radius;dx<=radius;dx++){const x=ex+dx,y=ey+dy,i=y*cols+x;if(x>=0&&x<cols&&y>=0&&y<rows&&!blocked[i]&&!segmentBlocked(entry,gridPoint(i),blocks)){origin=i;break;}}
    if(origin<0)return null;
    let head=0,tail=1;queue[0]=origin;parents[origin]=-1;
    while(head<tail){const at=queue[head++],x=at%cols,y=Math.floor(at/cols);for(const next of [x>0?at-1:-1,x+1<cols?at+1:-1,y>0?at-cols:-1,y+1<rows?at+cols:-1])if(next>=0&&!blocked[next]&&parents[next]===-2){parents[next]=at;queue[tail++]=next;}}
    const paths=new Map();
    for(const [id,point] of new Map([...seats,...extraTargets])){
      const target=pixel(point),own=actors.find(a=>a.id===id)||{left:target.x-1,right:target.x+1,top:target.y-1,bottom:target.y+1},other=blocks.filter(b=>b!==own),candidates=[];
      for(const f of [0,.25,.5,.75,1]){
        const x=own.left+(own.right-own.left)*f,y=own.top+(own.bottom-own.top)*f;
        for(const p of [{x,y:own.top-step*2},{x,y:own.bottom+step*2},{x:own.left-step*2,y},{x:own.right+step*2,y}]){
          const cx=Math.round((p.x-d.left)/step),cy=Math.round((p.y-d.top)/step);
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const gx=cx+dx,gy=cy+dy,i=gy*cols+gx;if(gx>=0&&gx<cols&&gy>=0&&gy<rows&&parents[i]!==-2&&!blocked[i]){const p2=gridPoint(i);if(!segmentBlocked(p2,target,other))candidates.push({i,point:p2,cost:Math.hypot(p2.x-target.x,p2.y-target.y)});}}
        }
      }
      if(!candidates.length)return null;
      candidates.sort((a,b)=>a.cost-b.cost||a.i-b.i);const selected=candidates[0],raw=[];
      for(let i=selected.i;i>=0;i=parents[i])raw.unshift(gridPoint(i));raw.unshift(entry);raw.push(target);
      const corners=[raw[0]];for(let i=1;i<raw.length-1;i++){const a=raw[i-1],b=raw[i],c=raw[i+1];if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>EPS)corners.push(b);}corners.push(target);
      const smooth=[corners[0]];let at=0;while(at<corners.length-1){let next=corners.length-1;while(next>at+1&&segmentBlocked(corners[at],corners[next],other))next--;if(segmentBlocked(corners[at],corners[next],other))return null;smooth.push(corners[next]);at=next;}
      const path=smooth.map(percent);path[0]={...ENTRY_POINT};path[path.length-1]={...point};paths.set(id,path);
    }
    return paths;
  }
  function drainProof(ctx,scale,reservedRects,limit) {
    const moves=[],gap=gapForScale(scale);
    function valid(move) {
      if(ctx.validMove&&!ctx.validMove(move))return false;
      const actor=ctx.actors.get(move.id),f=actor.footprint;
      for(let i=1;i<move.path.length;i++){
        const from=move.path[i-1],to=move.path[i],a=pixel(from),b=pixel(to);
        if(!(passThroughMode&&i===1||legalPoint(from,{...actor,reservedRects}))||!legalPoint(to,{...actor,reservedRects}))return false;
        for(const r of reservedRects)if(Scene.segmentHitsRect(a,b,{x1:r.left-f.right*scale-4,x2:r.right+f.left*scale+4,y1:r.top-f.bottom*scale-4,y2:r.bottom+f.top*scale+4},0))return false;
        if(!passThroughMode)for(const [id,other]of ctx.actors)if(id!==move.id&&!other.staged){
          // Real clone endpoint overlap is permitted only on its first/last
          // leg. The coordinator still owns the exact named exemption.
          // An ordinary transition exempts only its exact original source:
          // a finite split can still be inside the required clearance after
          // its canvases separate. It never gains a destination exemption.
          const r=Scene.actorBounds(other.position,other),source=ctx.sourceOverlapOrigins?.get(move.id);
          const sourceExempt=i===1&&(ctx.sourceOverlapOrigins?source&&Math.abs(source.x-from.x)<.001&&Math.abs(source.y-from.y)<.001&&Scene.boundsOverlap(Scene.actorBounds(from,actor),r,gap):Scene.boundsOverlap(Scene.actorBounds(from,actor),r,0));
          const targetExempt=!ctx.sourceOverlapOrigins&&i===move.path.length-1&&Scene.boundsOverlap(Scene.actorBounds(to,actor),r,0);
          const exempt=ctx.overlaps?.get(move.id)?.has(id)&&(sourceExempt||targetExempt);
          if(!exempt&&Scene.segmentHitsRect(a,b,{x1:r.left-f.right*scale-gap,x2:r.right+f.left*scale+gap,y1:r.top-f.bottom*scale-gap,y2:r.bottom+f.top*scale+gap},0))return false;
        }
        if(OBSTACLES.some(r=>Scene.segmentHitsRect(from,to,r,.8)))return false;
      }
      return true;
    }
    for(let pass=0;pass<limit;pass++){
      if(ctx.budget&&ctx.budget.drainCalls>=384)return null;
      if(ctx.budget)ctx.budget.drainCalls++;
      const batch=passThroughMode&&ctx.traffic.nextBatch?ctx.traffic.nextBatch():[ctx.traffic.nextAny()];
      if(batch.length===1&&batch[0].kind==='idle')return moves;
      if(batch.some(move=>!['move','arrived'].includes(move.kind)))return null;
      // Target exchanges are one departure set. Validate against the same
      // actual source snapshot, then complete every reserved member before
      // syncing; a serial sync would resurrect a peer's vacated source.
      if(batch.some(move=>move.kind==='move'&&!valid(move)))return null;
      for(const move of batch)if(move.kind==='move'){
        const actor=ctx.actors.get(move.id);actor.position={...move.target};actor.staged=false;
      }
      for(const move of batch){
        if(move.kind==='arrived'){
          if(ctx.afterArrival&&ctx.afterArrival(move)===false)return null;
        }else{
          if(!ctx.traffic.finish(move.id,move.token,move.target))return null;
          if(ctx.afterFinish)ctx.afterFinish(move);
          moves.push(move);
        }
      }
      ctx.sync();
    }
    return null;
  }
  function cooperativeProof(seats,footprints,scale,envelope,reservedRects,pocket,immovableIds,yieldPoints=[],budget) {
    if(!Traffic?.createCoordinator)return null;
    const out=new Map(),schedules=new Map();
    const make=()=>{
      const actors=new Map([...seats].map(([id,p])=>[id,{id,position:{x:p.x,y:p.y},uniformScale:scale,footprint:footprints.get(id),canYield:!immovableIds.has(id)}]));
      const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:(p,a)=>legalPoint(p,{...a,reservedRects}),route:(a,b,s)=>route(a,b,{...s,reservedRects}),gap:gapForScale,obstacles:OBSTACLES,reservedRects,passThrough:passThroughMode,holdingPoints:[pocket,...yieldPoints,...HOLDING_CANDIDATES]});
      const sync=()=>traffic.sync([...actors.values()]);sync();return{actors,traffic,sync,budget};
    };
    const drain=ctx=>drainProof(ctx,scale,reservedRects,seats.size*4+8);
    for(const [id,target]of seats){
      const ctx=make();ctx.traffic.request(id,ENTRY_POINT);const exit=drain(ctx);if(!exit)return null;
      ctx.actors.get(id).staged=true;ctx.sync();ctx.traffic.request(id,target);const enter=drain(ctx);if(!enter)return null;
      out.set(id,enter.find(m=>m.id===id&&!m.temporary)?.path||[ENTRY_POINT,target]);schedules.set(id,{exit,enter});
    }
    const ctx=make();let id='__geometry_holding_probe__';while(seats.has(id))id+='x';ctx.actors.set(id,{id,position:ENTRY_POINT,uniformScale:scale,footprint:envelope,staged:true,canYield:false});ctx.sync();ctx.traffic.request(id,pocket);const holding=drain(ctx);if(!holding)return null;
    return {paths:out,schedules,holdingActorId:id,holdingPoint:{...pocket},holdingPath:holding.find(m=>m.id===id)?.path,holdingMoves:holding};
  }
  function transitionProof(seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current,allowedOverlaps,fixedPositions,requireEntryProof=false) {
    const initialPositions=new Map([...current].filter(([id,p])=>seats.has(id)&&validPoint(p)).map(([id,p])=>[id,{x:p.x,y:p.y}]));
    if((!current.size&&!requireEntryProof)||[...seats].every(([id,p])=>validPoint(current.get(id))&&Math.abs(p.x-current.get(id).x)<.001&&Math.abs(p.y-current.get(id).y)<.001))return {scale,moves:[],initialPositions};
    const actors=new Map([...seats].map(([id])=>{const p=current.get(id);return[id,{id,position:validPoint(p)?{x:p.x,y:p.y}:{...ENTRY_POINT},uniformScale:scale,footprint:footprints.get(id),staged:!validPoint(p),canYield:!immovableIds.has(id)}];}));
    // An observed parent/child meeting permits separation from that actual
    // source only. It never permits an ordinary target to land on the other
    // current body, even though the fit calculation exempts this named pair.
    const overlaps=new Map([...seats.keys()].map(id=>[id,new Set([...seats.keys()].filter(other=>{
      if(other===id||!allowedOverlaps?.has(JSON.stringify([id,other].sort())))return false;
      const own=actors.get(id),peer=actors.get(other);
      return !own.staged&&!peer.staged&&Scene.boundsOverlap(Scene.actorBounds(own.position,own),Scene.actorBounds(peer.position,peer),gapForScale(scale))
        &&!Scene.boundsOverlap(Scene.actorBounds(seats.get(id),own),Scene.actorBounds(peer.position,peer),gapForScale(scale));
    }))]));
    const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:(p,a)=>legalPoint(p,{...a,reservedRects}),route:(a,b,s)=>route(a,b,{...s,reservedRects}),gap:gapForScale,obstacles:OBSTACLES,reservedRects,passThrough:passThroughMode,holdingPoints:[...holdingPoints,...HOLDING_CANDIDATES]});
    const sync=()=>traffic.sync([...actors.values()]);sync();
    const targets=[...seats];
    if(requireEntryProof)targets.sort(([a,p],[b,q])=>Number(!current.has(a))-Number(!current.has(b))
      || (!current.has(a)?Math.hypot(q.x-ENTRY_POINT.x,q.y-ENTRY_POINT.y)-Math.hypot(p.x-ENTRY_POINT.x,p.y-ENTRY_POINT.y):0));
    for(const [id,target]of targets){
      if(fixedPositions.has(id)){
        const p=fixedPositions.get(id);if(Math.abs(p.x-target.x)>.001||Math.abs(p.y-target.y)>.001)return null;
        continue; // Stale or explicitly held bodies have no ordinary station owner.
      }
      if(!traffic.request(id,target,{overlapIds:[...overlaps.get(id)]}))return null;
    }
    const moves=drainProof({actors,traffic,sync,overlaps,sourceOverlapOrigins:initialPositions},scale,reservedRects,seats.size*8+16);
    if(!moves||[...seats].some(([id,p])=>Math.abs(p.x-actors.get(id).position.x)>.001||Math.abs(p.y-actors.get(id).position.y)>.001))return null;
    // Missing bodies are geometric portal probes only. Real helpers still
    // leave their real parent under the renderer's own endpoint reservation.
    return {scale,moves,initialPositions,stagedAtPortalIds:[...seats.keys()].filter(id=>!initialPositions.has(id))};
  }
  // A certificate describes three owned destination intents, never cached
  // route authority. Every leg is still proved by the unmodified coordinator
  // and independently swept above. The two participants cannot auto-yield;
  // all incidental yielders must return before the next intent is requested.
  function twoSlotTransferProof(candidate,footprints,scale,envelope,reservedRects,immovableIds,current,fixedPositions,scope,budget,eligibleIds) {
    const seats=candidate.seats,same=(a,b)=>validPoint(a)&&validPoint(b)&&Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001;
    if([...seats.keys()].some(id=>!validPoint(current.get(id))))return null;
    const changed=[...seats.keys()].filter(id=>!same(seats.get(id),current.get(id)));
    if(changed.length!==2||changed.some(id=>immovableIds.has(id)||fixedPositions.has(id)||eligibleIds&&!eligibleIds.has(id)))return null;
    if(!same(seats.get(changed[0]),current.get(changed[1]))||!same(seats.get(changed[1]),current.get(changed[0])))return null;
    const points=ids=>ids.map(id=>({id,x:current.get(id).x,y:current.get(id).y}));
    const initialPositions=points([...seats.keys()]),finalTargets=[...seats].map(([id,p])=>({id,x:p.x,y:p.y,workZone:p.workZone||p.zone}));
    const sourceKey=JSON.stringify([scope,initialPositions,scale]),targetKey=JSON.stringify([scale,finalTargets]);
    // Only a holding pocket with a complete final-access proof is eligible.
    // A second verified pocket can be supplied by a future profile; unproved
    // generic holding candidates are never elevated to transfer destinations.
    const pockets=[candidate.coordinated?.holdingPoint].filter(validPoint).filter((p,i,all)=>all.findIndex(q=>same(p,q))===i).slice(0,2);
    for(const order of [changed,[...changed].reverse()])for(const pocket of pockets){
      const planKey=JSON.stringify([sourceKey,targetKey,order,pocket]);
      if(budget.seen.has(planKey))continue;
      if(budget.plans>=4||budget.drainCalls>=384)return null;
      budget.seen.add(planKey);budget.plans++;
      const actors=new Map([...seats.keys()].map(id=>[id,{id,position:{...current.get(id)},uniformScale:scale,footprint:footprints.get(id),canYield:!immovableIds.has(id)&&!changed.includes(id)}]));
      const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:(p,a)=>legalPoint(p,{...a,reservedRects}),route:(a,b,aSpec)=>route(a,b,{...aSpec,reservedRects}),gap:gapForScale,obstacles:OBSTACLES,reservedRects,passThrough:passThroughMode,holdingPoints:[candidate.pocket,...(candidate.yieldPoints||[])]});
      const sync=()=>traffic.sync([...actors.values()]);sync();
      const intents=[{id:order[0],target:pocket,final:false},{id:order[1],target:seats.get(order[1]),final:true},{id:order[0],target:seats.get(order[0]),final:true}],moves=[],steps=[];
      let failed=false;
      for(const intent of intents){
        if(!traffic.request(intent.id,intent.target)){failed=true;break;}
        const phase=drainProof({actors,traffic,sync,budget,validMove:move=>!fixedPositions.has(move.id)&&(!changed.includes(move.id)||!move.yielding)},scale,reservedRects,seats.size*8+16);
        if(!phase||!same(actors.get(intent.id).position,intent.target)){failed=true;break;}
        const expected=new Map(initialPositions.map(p=>[p.id,p]));
        for(const done of [...steps,intent])expected.set(done.id,done.target);
        if([...actors].some(([id,a])=>!same(a.position,expected.get(id)))){failed=true;break;}
        moves.push(...phase);steps.push({id:intent.id,target:{x:intent.target.x,y:intent.target.y},final:intent.final,drainIds:[...new Set(phase.map(m=>m.id))],settledPositions:[...actors].map(([id,a])=>({id,x:a.position.x,y:a.position.y}))});
      }
      if(failed||[...seats].some(([id,p])=>!same(actors.get(id).position,p)))continue;
      // Re-run complete future exit/re-entry at the certificate's physical
      // scale. Its calls share the same budget as every attempted plan.
      const finalAccess=cooperativeProof(seats,footprints,scale,envelope,reservedRects,candidate.pocket,immovableIds,candidate.yieldPoints||[],budget);
      if(!finalAccess)continue;
      const certificate=freezePlain({version:1,kind:'two-slot-swap',scale,sourceKey,targetKey,participants:[...order],affectedIds:[...new Set(moves.map(m=>m.id))],initialPositions,finalTargets,steps,scope});
      return {transition:{scale,moves,initialPositions:new Map(initialPositions.map(p=>[p.id,{x:p.x,y:p.y}])),stagedAtPortalIds:[],transfer:true},certificate,finalAccess};
    }
    return null;
  }
  function actualReturnProof(docks,seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current) {
    const parents=new Set(docks.map(dock=>dock.parentId));
    // A nested parent finishes its child's owned return before beginning its
    // own. Likewise, one merging sibling can release its dock before another
    // sibling enters. Prove a real finite next completion, never a fake route
    // through a currently occupied sibling. Pick just one deterministic leaf:
    // the whole fit has at most 18 route attempts, not 18 times every owner.
    // Its actual removal causes the next owner's geometry to be proved again.
    for(const dock of docks.filter(dock=>!parents.has(dock.childId)).slice(0,1)){
      const actors=new Map([...seats].map(([id])=>{const p=current.get(id);return[id,{id,position:validPoint(p)?{x:p.x,y:p.y}:{...ENTRY_POINT},uniformScale:scale,footprint:footprints.get(id),staged:!validPoint(p),canYield:!immovableIds.has(id)&&!parents.has(id)}];}));
      const parent=actors.get(dock.parentId),child=actors.get(dock.childId);
      if(!parent||!child||parent.staged||child.staged)continue;
      child.canYield=false;
      const target={...parent.position},overlaps=new Map([[dock.childId,new Set([dock.parentId])]]);
      const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:(p,a)=>legalPoint(p,{...a,reservedRects}),route:(a,b,s)=>route(a,b,{...s,reservedRects}),gap:gapForScale,obstacles:OBSTACLES,reservedRects,passThrough:passThroughMode,holdingPoints:[...holdingPoints,...HOLDING_CANDIDATES]});
      const sync=()=>traffic.sync([...actors.values()]);sync();
      if(!traffic.request(dock.childId,target,{overlapIds:[dock.parentId]}))continue;
      const moves=drainProof({actors,traffic,sync,overlaps},scale,reservedRects,Math.min(32,seats.size*4+8));
      if(!moves||moves.some(move=>parents.has(move.id))||Math.abs(child.position.x-target.x)>.001||Math.abs(child.position.y-target.y)>.001)continue;
      return {scale,childId:dock.childId,parentId:dock.parentId,target,moves,initialPositions:new Map([...current].filter(([id,p])=>seats.has(id)&&validPoint(p)).map(([id,p])=>[id,{x:p.x,y:p.y}])),awaitingOwnerIds:docks.filter(other=>other.childId!==dock.childId).map(other=>other.childId)};
    }
    return null;
  }
  function fitActualReturn(docks,seats,footprints,maximum,reservedRects,holdingPoints,immovableIds,current,allowShrink=true){
    const prove=scale=>actualReturnProof(docks,seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current);
    let scale=maximum,upper=maximum,proof=prove(scale),trials=1;
    if(!proof&&!allowShrink)return null;
    for(let pass=0;!proof&&pass<12;pass++){upper=scale;scale*=.82;proof=prove(scale);trials++;}
    if(!proof)return null;
    if(scale<maximum)for(let pass=0;pass<5;pass++){
      const mid=(scale+upper)/2,candidate=prove(mid);trials++;
      if(candidate){scale=mid;proof=candidate;}else upper=mid;
    }
    return {...proof,trials};
  }
  function actualOpeningProof(dock,seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current){
    const source=current.get(dock.parentId),target=seats.get(dock.childId);
    if(!validPoint(source)||!validPoint(target)||validPoint(current.get(dock.childId)))return null;
    const actors=new Map([...seats].map(([id])=>{const p=current.get(id);return[id,{id,position:validPoint(p)?{x:p.x,y:p.y}:{...ENTRY_POINT},uniformScale:scale,footprint:footprints.get(id),staged:!validPoint(p),canYield:!immovableIds.has(id)}];}));
    const parent=actors.get(dock.parentId),child=actors.get(dock.childId);
    if(!parent||!child||parent.staged)return null;
    parent.canYield=false;child.canYield=false;child.position={x:source.x,y:source.y};
    // Splitting grants only a source meeting. A normal work destination must
    // be fully clear of the actual parent; this is never absorption permission.
    if(Scene.actorsOverlap(target,child,source,parent,gapForScale(scale)))return null;
    const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:(p,a)=>legalPoint(p,{...a,reservedRects}),route:(a,b,s)=>route(a,b,{...s,reservedRects}),gap:gapForScale,obstacles:OBSTACLES,reservedRects,passThrough:passThroughMode,holdingPoints:[...holdingPoints,...HOLDING_CANDIDATES]});
    const sync=()=>traffic.sync([...actors.values()]);sync();
    if(!traffic.request(dock.childId,target,{overlapIds:[dock.parentId]}))return null;
    const overlaps=new Map([[dock.childId,new Set([dock.parentId])]]),moves=drainProof({actors,traffic,sync,overlaps},scale,reservedRects,Math.min(32,seats.size*4+8));
    if(!moves||moves.some(move=>move.id===dock.parentId)||Math.abs(child.position.x-target.x)>.001||Math.abs(child.position.y-target.y)>.001)return null;
    return{scale,childId:dock.childId,parentId:dock.parentId,source:{x:source.x,y:source.y},target:{x:target.x,y:target.y},moves,initialPositions:new Map([...current].filter(([id,p])=>seats.has(id)&&validPoint(p)).map(([id,p])=>[id,{x:p.x,y:p.y}]))};
  }
  function fitActualOpening(dock,seats,footprints,maximum,reservedRects,holdingPoints,immovableIds,current,allowShrink=true){
    const prove=scale=>actualOpeningProof(dock,seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current);
    let scale=maximum,upper=maximum,proof=prove(scale),trials=1;
    if(!proof&&!allowShrink)return null;
    for(let pass=0;!proof&&pass<12;pass++){upper=scale;scale*=.82;proof=prove(scale);trials++;}
    if(!proof)return null;
    if(scale<maximum)for(let pass=0;pass<5;pass++){const mid=(scale+upper)/2,candidate=prove(mid);trials++;if(candidate){scale=mid;proof=candidate;}else upper=mid;}
    return{...proof,trials};
  }
  function finiteExitProof(exitIds,seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current){
    // Missing actual coordinates mean a body has not been admitted yet. Keep
    // its identity/seat in the page, but never invent a ghost at ENTRY which
    // would make the old door occupant and new arrival wait for each other.
    if([...exitIds].some(id=>!seats.has(id)||!validPoint(current.get(id))))return null;
    const unadmittedIds=[...seats.keys()].filter(id=>!validPoint(current.get(id)));
    const initialPositions=new Map([...seats.keys()].filter(id=>validPoint(current.get(id))).map(id=>[id,{x:current.get(id).x,y:current.get(id).y}]));
    const actors=new Map([...initialPositions].map(([id,p])=>[id,{id,position:{...p},uniformScale:scale,footprint:footprints.get(id),canYield:!exitIds.has(id)&&!immovableIds.has(id)}]));
    const traffic=Traffic.createCoordinator({bounds:Scene.actorBounds,legalPoint:(p,a)=>legalPoint(p,{...a,reservedRects}),route:(a,b,s)=>route(a,b,{...s,reservedRects}),gap:gapForScale,obstacles:OBSTACLES,reservedRects,passThrough:passThroughMode,holdingPoints:[...holdingPoints,...HOLDING_CANDIDATES]});
    const sync=()=>traffic.sync([...actors.values()]);sync();
    for(const id of exitIds)if(!traffic.request(id,ENTRY_POINT))return null;
    const removedIds=[],steps=[],ctx={actors,traffic,sync,
      validMove:move=>exitIds.has(move.id)?!move.temporary&&!move.yielding:!immovableIds.has(move.id),
      afterFinish:move=>{steps.push(move);if(exitIds.has(move.id)&&Math.abs(move.target.x-ENTRY_POINT.x)<.001&&Math.abs(move.target.y-ENTRY_POINT.y)<.001){actors.delete(move.id);removedIds.push(move.id);}},
      afterArrival:arrival=>{
        const actor=actors.get(arrival.id);
        if(!exitIds.has(arrival.id)||!actor||Math.abs(actor.position.x-ENTRY_POINT.x)>=.001||Math.abs(actor.position.y-ENTRY_POINT.y)>=.001||Math.abs(arrival.target.x-ENTRY_POINT.x)>=EPS||Math.abs(arrival.target.y-ENTRY_POINT.y)>=EPS||!legalPoint(actor.position,{...actor,reservedRects}))return false;
        steps.push({...arrival,actualPosition:{...actor.position}});actors.delete(arrival.id);removedIds.push(arrival.id);
      }
    };
    const moves=drainProof(ctx,scale,reservedRects,Math.min(1024,seats.size*8+16));
    if(!moves||removedIds.length!==exitIds.size||[...actors].some(([id,a])=>Math.abs(a.position.x-initialPositions.get(id).x)>.001||Math.abs(a.position.y-initialPositions.get(id).y)>.001))return null;
    return{scale,moves,steps,initialPositions,unadmittedIds,removedIds,retainedPositions:new Map([...actors].map(([id,a])=>[id,{...a.position}]))};
  }
  function fitFiniteExit(exitIds,seats,footprints,maximum,reservedRects,holdingPoints,immovableIds,current,budget,allowShrink=true){
    const prove=scale=>{if(budget.trials>=12)return null;budget.trials++;return finiteExitProof(exitIds,seats,footprints,scale,reservedRects,holdingPoints,immovableIds,current);};
    let scale=maximum,upper=maximum,proof=prove(scale);
    if(!proof&&!allowShrink)return null;
    for(let pass=0;!proof&&pass<7&&budget.trials<12;pass++){upper=scale;scale*=.82;proof=prove(scale);}
    if(!proof)return null;
    if(scale<maximum)for(let pass=0;pass<4&&budget.trials<12;pass++){const mid=(scale+upper)/2,candidate=prove(mid);if(candidate){scale=mid;proof=candidate;}else upper=mid;}
    return{...proof,trials:budget.trials};
  }
  let passThroughMode=false,spillMode=false,fullFloorMode=false;
  function layoutWalking(present,options={}) {
    passThroughMode=options.passThrough===true;spillMode=passThroughMode&&options.spillZones===true;fullFloorMode=passThroughMode&&options.fullFloor===true;
    const fixedScale=options.fixedScale===true;
    const unique=new Map();for(const session of Array.isArray(present)?present:[])if(session&&typeof session.id==='string'&&session.id)unique.set(session.id,session);
    const visible=[...unique.values()].sort((a,b)=>a.id.localeCompare(b.id)),requestedScale=requestedScaleOf(options);
    const sizeCeiling=Number.isFinite(options.maximumScale)&&options.maximumScale>0?Math.min(requestedScale,options.maximumScale):requestedScale;
    const previous=options.previousSeats instanceof Map?options.previousSeats:new Map(),current=options.currentPositions instanceof Map?options.currentPositions:new Map(),viewport=options.viewport||Scene.ACTOR_VIEWPORT;
    const reservedRects=(options.reservedRects||Scene.CLOCK_RESERVED).filter(r=>r&&['left','right','top','bottom'].every(k=>Number.isFinite(r[k]))),footprints=new Map(visible.map(s=>[s.id,(validFootprint(options.footprints?.get(s.id))?options.footprints.get(s.id):s.parentId?Scene.ACTOR_FOOTPRINT.helper:Scene.ACTOR_FOOTPRINT.root)]));
    const envelope=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,footprints.size?Math.max(...[...footprints.values()].map(f=>f[k])):Scene.ACTOR_FOOTPRINT.root[k]]));
    const workZones=new Map(visible.map(s=>{const spec=Scene.activitySpec(s),old=previous.get(s.id),oldZone=old?.workZone||old?.zone;return[s.id,old&&ZONE_AREAS[oldZone]&&(options.retainStations||spec.stale||(Scene.isClosed(s)&&validPoint(old)&&zoneArea(old,oldZone)))?oldZone:spec.zone];}));
    const thirteenProfile=visible.length===13&&Object.entries(THIRTEEN_PROFILE.points).every(([zone,points])=>[...workZones.values()].filter(value=>value===zone).length===points.length);
    const actualPositions=options.transitionPositions instanceof Map?options.transitionPositions:current;
    const fixedStale=new Map(visible.filter(s=>Scene.activitySpec(s).stale&&validPoint(actualPositions.get(s.id)||previous.get(s.id))).map(s=>{const p=actualPositions.get(s.id)||previous.get(s.id);return[s.id,{x:p.x,y:p.y}];}));
    // Unlike canYield=false, this explicit runtime fact forbids an ordinary
    // own station request. A first late-parent rehome or a real in-flight
    // holding owner is deliberately absent from this set.
    const fixedHolding=new Map(visible.filter(s=>options.fixedHoldingIds?.has(s.id)&&validPoint(actualPositions.get(s.id))).map(s=>{const p=actualPositions.get(s.id);return[s.id,{x:p.x,y:p.y}];}));
    const fixedPositions=new Map([...fixedStale,...fixedHolding]);
    const immovableIds=new Set(visible.filter(s=>options.immovableIds?.has(s.id)||fixedHolding.has(s.id)||Scene.activitySpec(s).stale||Scene.isClosed(s)).map(s=>s.id));
    const closingDockPairs=options.closingDockPairs instanceof Map?options.closingDockPairs:new Map();
    const openingDockPairs=options.openingDockPairs instanceof Map?options.openingDockPairs:new Map();
    const openingDocks=visible.filter(s=>s.parentId&&unique.has(openingDockPairs.get(s.id))&&!validPoint(current.get(s.id))&&validPoint(current.get(openingDockPairs.get(s.id)))).map(s=>({childId:s.id,parentId:openingDockPairs.get(s.id)}));
    const openingBusyIds=visible.filter(s=>options.openingBusyIds?.has(s.id)&&validPoint(current.get(s.id))).map(s=>s.id);
    const isObservedAncestor=id=>visible.some(s=>{const seen=new Set();let parent=s.parentId;while(parent&&!seen.has(parent)){if(parent===id)return true;seen.add(parent);parent=unique.get(parent)?.parentId;}return false;});
    const finiteExitIds=new Set(visible.filter(s=>options.finiteExitIds?.has(s.id)&&!s.parentId&&validPoint(current.get(s.id))&&!isObservedAncestor(s.id)).map(s=>s.id));
    const finiteBudget={trials:0};
    const transferBudget=options._transferBudget||{plans:0,drainCalls:0,seen:new Set()};
    const slotHints=new Map([...(options.slotHints instanceof Map?options.slotHints:previous)].filter(([id,p])=>unique.has(id)&&validPoint(p)).map(([id,p])=>[id,{...p}]));
    const transferEligibleIds=options.transferEligibleIds instanceof Set?new Set(options.transferEligibleIds):null;
    const transferBusyIds=visible.filter(s=>options.openingBusyIds?.has(s.id)&&validPoint(actualPositions.get(s.id))).map(s=>s.id);
    const transferScope={requestedScale,sizeCeiling,viewport:{...viewport},reservedRects:reservedRects.map(r=>({...r})),allowTransfers:options.allowTransfers!==false,transferEligibleIds:transferEligibleIds?[...transferEligibleIds].sort():null,participantsAutoYield:false,openingBusyIds:[...transferBusyIds].sort(),allowedOverlaps:[...(options.allowedOverlaps||[])].sort(),immovableIds:[...immovableIds].sort(),fixedHoldingIds:[...fixedHolding.keys()].sort(),openingDockPairs:[...openingDockPairs].map(p=>[...p]),closingDockPairs:[...closingDockPairs].map(p=>[...p]),finiteExitIds:[...finiteExitIds],cast:visible.map(s=>({id:s.id,parentId:s.parentId||null,workZone:workZones.get(s.id),activity:s.activity||null,status:s.status||null,turnId:s.turnId||null,provider:s.provider||null,attention:Boolean(s.attention),disconnected:Boolean(s.disconnected),closed:Boolean(s.closed),footprint:{...footprints.get(s.id)},canYield:!immovableIds.has(s.id),fixedPosition:fixedPositions.has(s.id)?{...fixedPositions.get(s.id)}:null}))};
    const transferSourceKey=scale=>JSON.stringify([transferScope,visible.filter(s=>validPoint(actualPositions.get(s.id))).map(s=>({id:s.id,x:actualPositions.get(s.id).x,y:actualPositions.get(s.id).y})),scale]);
    const transferSettingsKey=JSON.stringify([options.allowTransfers!==false,options.allowTransfers!==false?[...transferBusyIds].sort():null,transferEligibleIds?[...transferEligibleIds].sort():null,options.slotHints instanceof Map?[...slotHints].map(([id,p])=>[id,p.x,p.y,p.workZone||p.zone]).sort((a,b)=>a[0].localeCompare(b[0])):null,transferScope.cast.map(s=>[s.id,s.activity,s.status,s.turnId,s.attention,s.disconnected,s.closed])]);
    const signature=JSON.stringify([passThroughMode,spillMode,fullFloorMode,fixedScale,transferSettingsKey,requestedScale,sizeCeiling,viewport,reservedRects,options.cooperative!==false,options.holdingOccupiedForProof!==false,[...immovableIds].sort(),[...closingDockPairs].sort(([a],[b])=>a.localeCompare(b)),[...openingDockPairs].sort(([a],[b])=>a.localeCompare(b)),openingDockPairs.size?openingBusyIds:null,[...finiteExitIds],finiteExitIds.size?[...(options.allowedOverlaps||[])].sort():null,closingDockPairs.size||openingDockPairs.size||finiteExitIds.size?visible.filter(s=>validPoint(current.get(s.id))).map(s=>[s.id,current.get(s.id).x,current.get(s.id).y]):null,[...fixedStale],[...fixedHolding],visible.map(s=>[s.id,s.parentId||'',workZones.get(s.id),footprints.get(s.id)])]);
    const residentGeometry=JSON.stringify([requestedScale,viewport,reservedRects,visible.map(s=>[s.id,s.parentId||null,footprints.get(s.id)])]);
    const targetSignature=seats=>JSON.stringify([...seats].map(([id,p])=>[id,p.x,p.y,p.workZone||p.zone,p.area,p.holdingPoint,p.targetUniformScale]).sort((a,b)=>a[0].localeCompare(b[0])));
    const ratio=(clearance,extent)=>extent>0?clearance/extent:clearance>=0?Infinity:-Infinity;
    let maximum=sizeCeiling;
    // Pass-through bodies walk off their current feet, so only the door bounds size.
    const anchors=[{id:'__door__',point:ENTRY_POINT,footprint:envelope},...visible.filter(s=>!passThroughMode&&validPoint(current.get(s.id))).map(s=>({id:s.id,point:current.get(s.id),footprint:footprints.get(s.id)}))];
    for(const a of anchors){const p=pixel(a.point),f=a.footprint;maximum=Math.min(maximum,ratio(p.x-viewport.left,f.left),ratio(viewport.right-p.x,f.right),ratio(p.y-viewport.top,f.top),ratio(viewport.bottom-p.y,f.bottom));for(const r of reservedRects)maximum=Math.min(maximum,Math.max(ratio(r.left-4-p.x,f.right),ratio(p.x-r.right-4,f.left),ratio(r.top-4-p.y,f.bottom),ratio(p.y-r.bottom-4,f.top)));}
    const physical=anchors.slice(1);for(let i=0;i<physical.length;i++)for(let j=i+1;j<physical.length;j++){const a=physical[i],b=physical[j],key=JSON.stringify([a.id,b.id].sort());if(options.allowedOverlaps?.has(key))continue;const dx=(b.point.x-a.point.x)*W/100,dy=(b.point.y-a.point.y)*H/100;maximum=Math.min(maximum,Math.max((Math.abs(dx)-2)/((dx>=0?a.footprint.right+b.footprint.left:a.footprint.left+b.footprint.right)+10),(Math.abs(dy)-2)/((dy>=0?a.footprint.bottom+b.footprint.top:a.footprint.top+b.footprint.bottom)+10)));}
    if(!(maximum>0))throw new RangeError('Current real body positions have no positive-size non-overlapping walking fit');
    const fitRealCast=Boolean(Scene.ROOM_LAYOUT&&options.fitRealCast);
    if(fixedScale&&!fitRealCast&&maximum<requestedScale-EPS)throw new RangeError('The chosen body size needs a free floor position');
    if(fixedScale&&!fitRealCast)maximum=requestedScale;
    const cached=proofCache.get(previous)||proofBySeat.get(previous.values().next().value);
    function finishExit(page,cacheHit=false){
      if(options.targetOnly||!finiteExitIds.size||cacheHit)return page;
      const proof=fitFiniteExit(finiteExitIds,page.seats,footprints,page.uniformScale,reservedRects,page.holdingPoints||[],immovableIds,current,finiteBudget,!fixedScale),scale=proof?.scale||page.uniformScale;
      const result={...atScale(page,scale),exitOwnerIds:[...finiteExitIds],transferCertificate:null,exitProof:proof,finiteExitDeferred:!proof,exitProofAttempts:finiteBudget.trials};
      // Growth is deferred until the real exit owners have actually released
      // their bodies. A cached settled target cannot enlarge this finite fit.
      result.targetUniformScale=scale;
      result.seats=new Map([...result.seats].map(([id,p])=>[id,{...p,targetUniformScale:scale}]));
      Object.defineProperties(result.seats,{fits:{value:true},unplacedIds:{value:[]}});
      if(!proof)result.fitReason='waiting-for-exit-route';
      if(result.returnProof&&result.returnProof.scale!==scale)result.returnProof=actualReturnProof(returningDocks,result.seats,footprints,scale,reservedRects,result.holdingPoints||[],immovableIds,current);
      if(result.openingProof&&result.openingProof.scale!==scale){
        result.openingProof=actualOpeningProof(openingDocks[0],result.seats,footprints,scale,reservedRects,result.holdingPoints||[],immovableIds,current);
        result.openingDeferred=!result.openingProof;
      }
      const record=proofCache.get(page.seats);if(record)rememberProof(result.seats,{...record,signature,targets:targetSignature(result.seats),page:result});
      return result;
    }
    function finishOpening(page,cacheHit=false){
      if(options.targetOnly||!openingDocks.length||cacheHit)return page;
      // One explicit next-admission owner, matching the renderer's staging
      // order. Other pending helpers wait for a fresh actual-origin proof.
      const dock=openingDocks[0],busy=openingBusyIds.filter(id=>id!==dock.parentId&&id!==dock.childId);
      // A real finite mover can clear this source or destination. First try
      // the unchanged scale, retaining concurrent safe splits. Only a failed
      // proof waits for its endpoint instead of treating a transient foot as
      // a permanent obstacle and needlessly shrinking the whole room.
      const openingProof=fitActualOpening(dock,page.seats,footprints,page.uniformScale,reservedRects,page.holdingPoints||[],immovableIds,current,!fixedScale&&!busy.length);
      const result={...atScale(page,openingProof?.scale||page.uniformScale),openingProof,transferCertificate:null,openingDeferred:!openingProof,openingOwnerId:dock.childId,openingBusyDeferred:!openingProof&&busy.length>0,openingBusyIds:busy};
      if(!openingProof)result.fitReason='waiting-for-split-route';
      if(result.returnProof&&result.returnProof.scale!==result.uniformScale){
        const returnDocks=[...closingDockPairs].filter(([child,parent])=>result.seats.has(child)&&result.seats.has(parent)&&immovableIds.has(child)&&immovableIds.has(parent)).map(([childId,parentId])=>({childId,parentId}));
        result.returnProof=actualReturnProof(returnDocks,result.seats,footprints,result.uniformScale,reservedRects,result.holdingPoints||[],immovableIds,current);
      }
      const record=proofCache.get(page.seats);if(record)rememberProof(result.seats,{...record,signature,targets:targetSignature(result.seats),page:result});
      return result;
    }
    if(cached&&cached.signature===signature&&cached.targets===targetSignature(previous)&&(!cached.page.transferCertificate||cached.page.transferCertificate.sourceKey===transferSourceKey(cached.page.transferCertificate.scale))){
      const settled=visible.every(s=>{const p=current.get(s.id),q=previous.get(s.id);return validPoint(p)&&Math.abs(p.x-q.x)<.001&&Math.abs(p.y-q.y)<.001;});
      const scale=Math.min(maximum,finiteExitIds.size?cached.page.uniformScale:settled?(cached.page.targetUniformScale||cached.page.uniformScale):cached.page.uniformScale);
      const page={...atScale(cached.page,scale),visible,roots:visible.filter(s=>cached.page.rootIdsBySession.get(s.id)===s.id),venue:['workshop','teahouse','observatory'].includes(options.venue)?options.venue:'workshop',cachedProof:true};
      rememberProof(page.seats,{...cached,targets:targetSignature(page.seats),page});return finishExit(finishOpening(page,true),true);
    }
    const returningDocks=visible.filter(s=>s.parentId&&unique.has(closingDockPairs.get(s.id))&&options.immovableIds?.has(s.id)&&options.immovableIds?.has(closingDockPairs.get(s.id))&&validPoint(current.get(s.id))&&validPoint(current.get(closingDockPairs.get(s.id)))).map(s=>({childId:s.id,parentId:closingDockPairs.get(s.id)}));
    const priorProofMode=['deferred-clone-return','deferred-main-exit'].includes(cached?.page.proofMode)?cached.page.priorProofMode:cached?.page.proofMode;
    if(!returningDocks.length&&finiteExitIds.size&&cached&&cached.targets===targetSignature(previous)&&['cooperative','stationary','scheduled'].includes(priorProofMode)&&visible.length<=previous.size&&visible.every(s=>previous.has(s.id)&&validPoint(current.get(s.id))&&cached.page.visible.find(old=>old.id===s.id)?.parentId===s.parentId)){
      const cap=Math.min(maximum,cached.page.uniformScale),oldSeats=new Map(visible.map(s=>[s.id,previous.get(s.id)]));
      const exitProof=fitFiniteExit(finiteExitIds,oldSeats,footprints,cap,reservedRects,cached.page.holdingPoints||[],immovableIds,current,finiteBudget,!fixedScale),scale=exitProof?.scale||cap,gap=gapForScale(scale);
      const retained=new Map(visible.map(s=>{const old=previous.get(s.id),p=fixedPositions.get(s.id)||old;return[s.id,{...old,x:p.x,y:p.y,uniformScale:scale,targetUniformScale:scale,requestedScale,...(workZones.get(s.id)!==(old.workZone||old.zone)?{pendingWorkZone:workZones.get(s.id)}:{})}];}));
      const legal=[...retained].every(([id,p])=>legalPoint(p,{uniformScale:scale,footprint:footprints.get(id),reservedRects,viewport})&&![...retained].some(([other,q])=>other!==id&&Scene.actorsOverlap(p,{uniformScale:scale,footprint:footprints.get(id)},q,{uniformScale:scale,footprint:footprints.get(other)},gap)));
      if(exitProof&&legal){
        Object.defineProperties(retained,{fits:{value:true},unplacedIds:{value:[]}});
        const page={...atScale(cached.page,scale),visible,seats:retained,roots:visible.filter(s=>cached.page.rootIdsBySession.get(s.id)===s.id),rootIdsBySession:new Map([...cached.page.rootIdsBySession].filter(([id])=>unique.has(id))),capacity:visible.length,helperCapacity:visible.filter(s=>s.parentId).length,uniformScale:scale,targetUniformScale:scale,gap,requestedScale,pathsById:new Map(),holdingPaths:[],coordinatedProof:null,transitionProof:null,transferCertificate:null,exitProof,exitOwnerIds:[...finiteExitIds],finiteExitDeferred:false,exitProofAttempts:finiteBudget.trials,proofMode:'deferred-main-exit',priorProofMode,fitReason:'waiting-for-main-exit',transitionDeferred:true,cachedProof:false,venue:['workshop','teahouse','observatory'].includes(options.venue)?options.venue:'workshop'};
        rememberProof(retained,{signature,targets:targetSignature(retained),page});return finishOpening(page);
      }
    }
    if(returningDocks.length&&cached&&cached.targets===targetSignature(previous)&&['cooperative','stationary','scheduled'].includes(priorProofMode)&&visible.length<=previous.size&&visible.every(s=>previous.has(s.id)&&cached.page.visible.find(old=>old.id===s.id)?.parentId===s.parentId)){
      const cap=Math.min(maximum,cached.page.uniformScale);
      const retainedIds=new Map(visible.map(s=>[s.id,previous.get(s.id)]));
      const returnProof=fitActualReturn(returningDocks,retainedIds,footprints,cap,reservedRects,cached.page.holdingPoints||[],immovableIds,current,!fixedScale);
      const scale=returnProof?.scale||cap,gap=gapForScale(scale);
      const retained=new Map(visible.map(s=>{const old=previous.get(s.id),p=fixedPositions.get(s.id)||old;return[s.id,{...old,x:p.x,y:p.y,uniformScale:scale,targetUniformScale:scale,requestedScale,...(workZones.get(s.id)!==(old.workZone||old.zone)?{pendingWorkZone:workZones.get(s.id)}:{})}];}));
      const legal=[...retained].every(([id,p])=>legalPoint(p,{uniformScale:scale,footprint:footprints.get(id),reservedRects,viewport})&&![...retained].some(([other,q])=>other!==id&&Scene.actorsOverlap(p,{uniformScale:scale,footprint:footprints.get(id)},q,{uniformScale:scale,footprint:footprints.get(other)},gap)));
      if(legal){
        // An explicitly owned returning helper holds a finite real dock. Keep
        // the last proved arrangement until that body actually disappears;
        // do not shrink everyone to prove that temporary dock lasts forever.
        Object.defineProperties(retained,{fits:{value:true},unplacedIds:{value:[]}});
        const page={...atScale(cached.page,scale),visible,seats:retained,roots:visible.filter(s=>cached.page.rootIdsBySession.get(s.id)===s.id),rootIdsBySession:new Map([...cached.page.rootIdsBySession].filter(([id])=>unique.has(id))),capacity:visible.length,helperCapacity:visible.filter(s=>s.parentId).length,uniformScale:scale,targetUniformScale:scale,gap,requestedScale,pathsById:new Map(),holdingPaths:[],coordinatedProof:null,transitionProof:null,transferCertificate:null,returnProof,proofMode:'deferred-clone-return',priorProofMode,fitReason:returnProof?'waiting-for-clone-return':'waiting-for-return-route',transitionDeferred:true,blockedByIds:[...new Set(returningDocks.flatMap(s=>[s.childId,s.parentId]))].sort(),cachedProof:false,venue:['workshop','teahouse','observatory'].includes(options.venue)?options.venue:'workshop'};
        rememberProof(retained,{signature,targets:targetSignature(retained),page});return finishExit(finishOpening(page));
      }
    }
    // A dense old foot arrangement may temporarily limit the physical size.
    // Prove a more spacious destination first, walk there at the current safe
    // size, and only grow once the actual feet support the already-proven fit.
    const geometryChanged=previous.size!==visible.length||visible.some(s=>{const old=previous.get(s.id);return !old||(old.workZone||old.zone)!==workZones.get(s.id)||old.requestedScale!==requestedScale||(old.targetUniformScale||old.uniformScale)>old.uniformScale+EPS;})||cached&&cached.signature!==signature;
    if(!fixedScale&&!options.targetOnly&&visible.length&&(visible.length<=12||thirteenProfile)&&previous.size&&geometryChanged){
      const retained=new Map(visible.filter(s=>(Scene.activitySpec(s).stale||Scene.isClosed(s)||fixedHolding.has(s.id))&&previous.has(s.id)).map(s=>[s.id,{...previous.get(s.id),...(!Scene.isClosed(s)?current.get(s.id)||{}:{}),...(fixedHolding.get(s.id)||{}),workZone:workZones.get(s.id)}]));
      const previousScale=Math.min(...visible.map(s=>previous.get(s.id)?.uniformScale||maximum));
      const goal=layoutWalking(visible,{...options,_transferBudget:transferBudget,slotHints,targetOnly:true,previousSeats:retained,currentPositions:new Map([...current].filter(([id])=>retained.has(id))),transitionPositions:current,transitionMaximum:maximum,transitionPreviousScale:previousScale});
      const scale=Math.min(maximum,goal.uniformScale,maximum+EPS>=goal.uniformScale?goal.uniformScale:previousScale);
      const page=atScale(goal,scale);
      rememberProof(page.seats,{signature,targets:targetSignature(page.seats),page});return finishExit(finishOpening(page));
    }
    let proofTrials=0;const PROOF_BUDGET=16;
    const transitionPositions=options.transitionPositions instanceof Map?options.transitionPositions:current;
    const samePoint=(a,b)=>a&&b&&Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001;
    const seatArea=(p,zone,id)=>zoneArea(p,zone)||(spillMode?ALL_AREAS.find(a=>inArea(p,a)):null)||(fullFloorMode&&inArea(p,FULL_FLOOR)?FULL_FLOOR:null)||(samePoint(p,fixedHolding.get(id))?{id:'held-clone-anchor',labelZh:'分身归位锚点',labelEn:'Clone return anchor'}:samePoint(p,fixedStale.get(id))?{id:'last-observed-position',labelZh:'最后观察位置',labelEn:'Last observed position'}:null);
    function deferEntrance(candidate,scale){
      const blockedByIds=[...fixedStale].filter(([id,p])=>validPoint(actualPositions.get(id))&&Scene.actorsOverlap(p,{uniformScale:scale,footprint:footprints.get(id)},ENTRY_POINT,{uniformScale:scale,footprint:envelope},gapForScale(scale))).map(([id])=>id);
      // This is a real occupied portal, not a general escape hatch for failed
      // navigation. Preserve safe targets and let the existing traffic queue
      // wait; never claim entry paths through the observed body.
      return blockedByIds.length?{...candidate,paths:new Map(),holdingPath:[],deferredEntrance:blockedByIds}:null;
    }
    function proveTransition(candidate,scale) {
      if(!candidate||visible.length>12&&!thirteenProfile)return candidate;
      const cap=Number.isFinite(options.transitionMaximum)?options.transitionMaximum:maximum;
      const previousScale=Number.isFinite(options.transitionPreviousScale)?options.transitionPreviousScale:scale;
      const physicalScale=Math.min(scale,cap,cap+EPS>=scale?scale:previousScale);
      const transition=transitionProof(candidate.seats,footprints,physicalScale,reservedRects,[candidate.pocket,...(candidate.yieldPoints||[])],immovableIds,transitionPositions,options.allowedOverlaps,fixedPositions);
      if(transition)return {...candidate,transition};
      if(options.allowTransfers===false||!candidate.coordinated||Math.abs(physicalScale-scale)>EPS||openingDockPairs.size||closingDockPairs.size||finiteExitIds.size||transferBusyIds.length||options.allowedOverlaps?.size)return null;
      const transfer=twoSlotTransferProof(candidate,footprints,physicalScale,envelope,reservedRects,immovableIds,transitionPositions,fixedPositions,transferScope,transferBudget,transferEligibleIds);
      return transfer?{...candidate,transition:transfer.transition,transferCertificate:transfer.certificate,coordinated:transfer.finalAccess,paths:transfer.finalAccess.paths,holdingPath:transfer.finalAccess.holdingPath}:null;
    }
    function place(scale,variant=0,cooperative=false,reallocate=false,realCastOnly=false) {
      const gap=gapForScale(scale),seats=new Map(),occupied=[],entry=Scene.actorBounds(ENTRY_POINT,{uniformScale:scale,footprint:envelope});
      // The complete future newcomer canvas remains free along the actual door
      // throat, not merely its foot point.
      const throat=Scene.actorBounds({x:Math.min(82,ENTRY_POINT.x),y:ENTRY_POINT.y},{uniformScale:scale,footprint:envelope});
      const entrance={left:Math.min(entry.left,throat.left),right:Math.max(entry.right,throat.right),top:Math.min(entry.top,throat.top),bottom:Math.max(entry.bottom,throat.bottom)};
      const oldPocket=previous.values().next().value?.holdingPoint;
      const pocketOrder=(validPoint(oldPocket)?[oldPocket]:[]).concat(visible.length>12?[HOLDING_CANDIDATES.at(-1),...HOLDING_CANDIDATES.slice(0,-1)]:HOLDING_CANDIDATES.slice(variant%HOLDING_CANDIDATES.length).concat(HOLDING_CANDIDATES.slice(0,variant%HOLDING_CANDIDATES.length)));
      const pocket=pocketOrder.find(p=>legalPoint(p,{uniformScale:scale,footprint:envelope,reservedRects,viewport})&&!Scene.boundsOverlap(Scene.actorBounds(p,{uniformScale:scale,footprint:envelope}),entrance,gap+1)&&!visible.some(s=>{const old=fixedPositions.get(s.id)||previous.get(s.id);return validPoint(old)&&(fixedPositions.has(s.id)||zoneArea(old,workZones.get(s.id)))&&Scene.boundsOverlap(Scene.actorBounds(old,{uniformScale:scale,footprint:footprints.get(s.id)}),Scene.actorBounds(p,{uniformScale:scale,footprint:envelope}),gap+1);}))||(realCastOnly?ENTRY_POINT:null);
      if(!pocket)return null;
      if(!realCastOnly&&!passThroughMode&&(!fixedScale||visible.length!==1))occupied.push(Scene.actorBounds(pocket,{uniformScale:scale,footprint:envelope}));
      if(visible.length>12&&!fullFloorMode)for(const [from,to]of CORRIDORS){const a=Scene.actorBounds(from,{uniformScale:scale,footprint:envelope}),b=Scene.actorBounds(to,{uniformScale:scale,footprint:envelope});occupied.push({left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom)});}
      const prove=()=>{const proofSeats=new Map(seats),extra=new Map();if(options.holdingOccupiedForProof===false)extra.set(HOLDING,pocket);else proofSeats.set(HOLDING,pocket);const proofFootprints=new Map(footprints);proofFootprints.set(HOLDING,envelope);return reachability(proofSeats,proofFootprints,scale,envelope,reservedRects,viewport,extra);};
      const safe=(p,s)=>{if((fixedPositions.has(s.id)&&!samePoint(p,fixedPositions.get(s.id)))||!seatArea(p,workZones.get(s.id),s.id)||!legalPoint(p,{uniformScale:scale,footprint:footprints.get(s.id),reservedRects,viewport}))return false;const b=Scene.actorBounds(p,{uniformScale:scale,footprint:footprints.get(s.id)});return(fixedPositions.has(s.id)||fixedScale&&(visible.length===1||realCastOnly)||!Scene.boundsOverlap(b,entrance,gap+1))&&!occupied.some(r=>Scene.boundsOverlap(b,r,gap+1));};
      const remember=(s,p)=>{const a=seatArea(p,workZones.get(s.id),s.id);seats.set(s.id,{x:p.x,y:p.y,zone:workZones.get(s.id),area:a.id,areaLabelZh:a.labelZh,areaLabelEn:a.labelEn,...(fixedStale.has(s.id)?{fixedStale:true}:{}),...(fixedHolding.has(s.id)?{fixedHolding:true}:{})});occupied.push(Scene.actorBounds(p,{uniformScale:scale,footprint:footprints.get(s.id)}));};
      function floorCandidates(session) {
        const preferredZone=variant===4?'lobby':workZones.get(session.id);
        const f=footprints.get(session.id),d=dimensions(scale,f,viewport),anchor=pixel(Scene.ZONES[preferredZone]||Scene.ZONES.lobby);
        if(d.left>d.right||d.top>d.bottom)return [];
        const xs=new Set(),ys=new Set(),x=value=>xs.add(Math.max(d.left,Math.min(d.right,value))),y=value=>ys.add(Math.max(d.top,Math.min(d.bottom,value)));
        x(d.left);x(d.right);x(anchor.x);y(d.top);y(d.bottom);y(anchor.y);
        // Full-floor capacity depends on actual geometry, not the current
        // work verb. Include every room anchor in the candidate lattice so
        // changing from coding to planning cannot remove an otherwise usable
        // row or column from the identical measured cast's placement search.
        for(const zone of Object.values(Scene.ZONES)){x(zone.x*W/100);y(zone.y*H/100);}
        const dx=(f.left+f.right)*scale+gap+1,dy=(f.top+f.bottom)*scale+gap+1;
        for(let value=d.left;value<=d.right+EPS;value+=dx)x(value);
        for(let value=d.top;value<=d.bottom+EPS;value+=dy)y(value);
        for(const bounds of occupied){
          x(bounds.right+gap+1+f.left*scale);x(bounds.left-gap-1-f.right*scale);x(bounds.left+f.left*scale);x(bounds.right-f.right*scale);
          y(bounds.bottom+gap+1+f.top*scale);y(bounds.top-gap-1-f.bottom*scale);y(bounds.top+f.top*scale);y(bounds.bottom-f.bottom*scale);
        }
        // Furniture forbids feet, while the clock reserves the complete visual
        // envelope. Their edges are useful candidates without a dense pixel scan.
        for(const r of OBSTACLES){x((r.x1-.81)*W/100);x((r.x2+.81)*W/100);y((r.y1-.81)*H/100);y((r.y2+.81)*H/100);}
        for(const r of reservedRects){x(r.left-5-f.right*scale);x(r.right+5+f.left*scale);y(r.top-5-f.bottom*scale);y(r.bottom+5+f.top*scale);}
        const result=[];for(const py of ys)for(const px of xs)result.push(percent({x:px,y:py}));
        result.sort((a,b)=>variant===1?a.y-b.y||a.x-b.x:variant===2?b.y-a.y||a.x-b.x:variant===3?a.y-b.y||b.x-a.x:
          Number(!zoneArea(a,preferredZone))-Number(!zoneArea(b,preferredZone))||Math.hypot(a.x*W/100-anchor.x,a.y*H/100-anchor.y)-Math.hypot(b.x*W/100-anchor.x,b.y*H/100-anchor.y)||a.y-b.y||a.x-b.x);
        return result;
      }
      for(const s of visible)if(fixedPositions.has(s.id)){const p=fixedPositions.get(s.id);if(!safe(p,s))return null;remember(s,p);}
      if(!reallocate)for(const s of visible)if(!seats.has(s.id)){const p=previous.get(s.id);if(validPoint(p)&&safe(p,s)&&(options.retainStations||(p.workZone||p.zone)===workZones.get(s.id)))remember(s,p);}
      const pending=visible.filter(s=>!seats.has(s.id));
      pending.sort((a,b)=>{if(fullFloorMode){const af=footprints.get(a.id),bf=footprints.get(b.id);return(bf.left+bf.right)*(bf.top+bf.bottom)-(af.left+af.right)*(af.top+af.bottom)||a.id.localeCompare(b.id);}return(ZONE_AREAS[workZones.get(a.id)].reduce((sum,r)=>sum+(r.x2-r.x1)*(r.y2-r.y1),0)-ZONE_AREAS[workZones.get(b.id)].reduce((sum,r)=>sum+(r.x2-r.x1)*(r.y2-r.y1),0))||a.id.localeCompare(b.id);});
      const lists=new Map();
      for(const s of pending){const zone=workZones.get(s.id),listKey=fullFloorMode?s.id:zone;if(fullFloorMode)lists.set(listKey,floorCandidates(s));if(!lists.has(listKey)){
        const result=[],seen=new Set(),add=p=>{const k=p.x.toFixed(5)+'/'+p.y.toFixed(5);if(!seen.has(k)){seen.add(k);result.push(p);}};
        if(!cooperative&&visible.length<=6){const preferred=Scene.ZONES[zone];const outer=!Scene.ROOM_LAYOUT&&zone==='library'?{x:Math.max(5.2,(viewport.left+envelope.left*scale)/W*100),y:44.5}:!Scene.ROOM_LAYOUT&&zone==='bench'?{x:Math.min(94.8,(viewport.right-envelope.right*scale)/W*100),y:44.5}:null;if(outer)add(outer);else add({x:preferred.seats[0][0],y:preferred.seats[0][1]});}
        const width=(envelope.left+envelope.right)*scale,height=(envelope.top+envelope.bottom)*scale,xStep=(width+gap+4)*100/W,yStep=(2*(height+gap)+4)*100/H;
        const groups=[];for(const r of spillMode?[...ZONE_AREAS[zone],...spillAreas(zone)]:ZONE_AREAS[zone]){const local=[];const addLocal=p=>local.push(p);
          const x1=Math.max(r.x1,(viewport.left+envelope.left*scale)*100/W),x2=Math.min(r.x2,(viewport.right-envelope.right*scale)*100/W);
          const y1=Math.max(r.y1,(viewport.top+envelope.top*scale)*100/H),y2=Math.min(r.y2,(viewport.bottom-envelope.bottom*scale)*100/H);
          const vertical=(r.y2-r.y1)*H>(r.x2-r.x1)*W*2,dx=vertical?(2*(width+gap)+4)*100/W:xStep,dy=vertical?(height+gap+4)*100/H:yStep;
          const xs=[],ys=[];
          if(zone==='bench'&&vertical)for(let x=x2;x>=x1-EPS;x-=dx)xs.push(x);else for(let x=x1;x<=x2+EPS;x+=dx)xs.push(x);
          if(r.y1>=75)for(let y=y2;y>=y1-EPS;y-=dy)ys.push(y);else for(let y=y1;y<=y2+EPS;y+=dy)ys.push(y);
          if(variant%2)xs.reverse();if(variant>1)ys.reverse();
          for(const y of ys)for(const x of xs)addLocal({x,y});
          if(visible.length<=12)for(const y of [y2,(y1+y2)/2])for(const x of [x1,x2,(x1+x2)/2])addLocal({x,y});groups.push(local);
        }
        if(cooperative){for(let i=0;i<Math.max(...groups.map(g=>g.length));i++)for(const group of groups)if(group[i])add(group[i]);}else for(const group of groups)for(const p of group)add(p);lists.set(listKey,result);
      }let target=null;for(const p of lists.get(listKey)){if(!safe(p,s))continue;if(!fullFloorMode&&!cooperative&&visible.length<=12&&!(fixedScale&&visible.length===1)){seats.set(s.id,p);const reachable=prove();seats.delete(s.id);if(!reachable)continue;}target=p;break;}if(!target)return null;remember(s,target);}
      const deferred=deferEntrance({seats,pocket},scale);if(deferred)return realCastOnly?null:deferred;
      if(fixedScale&&visible.length===1){
        // One full-size body needs its own reversible entrance/exit route,
        // not space for a second hypothetical holding body. Further real
        // admissions still require the ordinary complete multi-body proof.
        const id=visible[0].id,target=seats.get(id),path=route(ENTRY_POINT,target,{uniformScale:scale,footprint:footprints.get(id),reservedRects});
        if(path.length<2||!samePoint(path.at(-1),target))return null;
        return proveTransition({seats,paths:new Map([[id,path]]),pocket,holdingPath:[],singleBody:true},scale);
      }
      if(realCastOnly){
        // Prove the actual arrivals and a finite ordered departure of this
        // cast. A hypothetical extra holding body is not a capacity claim.
        // Every segment still uses the unchanged coordinator and full sweep.
        const transition=transitionProof(seats,footprints,scale,reservedRects,[],immovableIds,transitionPositions,options.allowedOverlaps,fixedPositions,true);
        if(!transition)return null;
        if(fullFloorMode){
          // Only observed exits own the portal. Requiring every future worker
          // to finish at that one portal together would invent a docking
          // collision even though today's complete stations and journeys fit.
          const paths=new Map();for(const move of transition.moves)if(move.path&&samePoint(move.target,seats.get(move.id)))paths.set(move.id,move.path);
          return{seats,paths,pocket,holdingPath:[],realCastOnly:true,transition,scheduledProof:{entry:transition}};
        }
        const exits=finiteExitProof(new Set(seats.keys()),seats,footprints,scale,reservedRects,[],immovableIds,seats);
        if(!exits)return null;
        const paths=new Map();for(const move of transition.moves)if(move.path&&samePoint(move.target,seats.get(move.id)))paths.set(move.id,move.path);
        for(const move of exits.moves)if(!paths.has(move.id)&&move.path&&samePoint(move.target,ENTRY_POINT))paths.set(move.id,move.path.slice().reverse());
        return{seats,paths,pocket,holdingPath:[],realCastOnly:true,transition,scheduledProof:{entry:transition,exit:exits}};
      }
      if(cooperative){if(proofTrials>=PROOF_BUDGET)return null;proofTrials++;const proof=cooperativeProof(seats,footprints,scale,envelope,reservedRects,pocket,immovableIds);return proof?proveTransition({seats,paths:proof.paths,pocket,holdingPath:proof.holdingPath,coordinated:proof},scale):null;}
      const paths=prove();
      if(!paths)return null;const holdingPath=paths.get(HOLDING);paths.delete(HOLDING);
      return proveTransition({seats,paths,pocket,holdingPath},scale);
    }

    // These are furniture-side coordinate hints found by offline search, not
    // capacity promises. Every actual footprint and every complete coordinated
    // exit/re-entry is checked again before a hint can become a visible seat.
    const profiles=[
      {scale:.5,holding:{x:50,y:78},yieldPoints:[[40,86]],points:{library:[[6,40.9],[29.05,48.2]],board:[[32.2,69],[63.1201,69]],desk:[[30,85.7]],bench:[[80.3067,40.9]],sofa:[[6,85.7]],lobby:[[69.05,48.2]]}},
      // This second arrangement keeps the central transfer lane open during
      // simultaneous real function changes. It is only a coordinate hint;
      // both final exits/entries and the actual old-to-new cast must pass.
      {scale:.5,holding:{x:50,y:78},yieldPoints:[[40,86]],points:{library:[[6,40.9],[29.05,48.2]],board:[[32.2,69],[63.1201,69]],desk:[[40,85.7]],bench:[[80.3067,40.9]],sofa:[[6,85.7]],lobby:[[74,58]]}},
      {scale:.4,holding:{x:30.5,y:44.5},points:{library:[[8,44],[19,44]],board:[[43,44],[56,44]],desk:[[40,84],[48.3,84]],bench:[[82,44],[93,44]],sofa:[[8,84],[19,84]],lobby:[[56.6,84],[64.9,84]]}},
      {scale:.4,holding:{x:30.5,y:44.5},points:{library:[[8,44],[19,44]],board:[[43,44],[56,44]],desk:[[69.05,53],[48.3,84]],bench:[[82,44],[93,44]],sofa:[[8,84],[19,84]],lobby:[[56.6,84],[64.9,84]]}},
      {scale:.4,holding:{x:30.5,y:44.5},points:{library:[[8,44],[19,44]],board:[[43,44],[56,44]],desk:[[40,84],[69.05,53]],bench:[[82,44],[93,44]],sofa:[[8,84],[19,84]],lobby:[[56.6,84],[64.9,84]]}},
      {scale:.4,holding:{x:30.5,y:82},points:{library:[[19,44],[8,44]],board:[[41.5,44],[64,69]],desk:[[40,84],[48.3,84]],bench:[[82,44],[93,44]],sofa:[[8,84],[19,84]],lobby:[[56.6,84],[64.9,84]]}}
    ];
    function seeded(profile) {
      if(proofTrials>=PROOF_BUDGET)return null;
      const scale=Math.min(maximum,profile.scale),gap=gapForScale(scale),seats=new Map(),pocket=profile.holding;
      const holdingBounds=Scene.actorBounds(pocket,{uniformScale:scale,footprint:envelope});
      const doorBounds=Scene.actorBounds(ENTRY_POINT,{uniformScale:scale,footprint:envelope}),throatBounds=Scene.actorBounds({x:Math.min(82,ENTRY_POINT.x),y:ENTRY_POINT.y},{uniformScale:scale,footprint:envelope});
      const entrance={left:Math.min(doorBounds.left,throatBounds.left),right:Math.max(doorBounds.right,throatBounds.right),top:Math.min(doorBounds.top,throatBounds.top),bottom:Math.max(doorBounds.bottom,throatBounds.bottom)};
      if(!legalPoint(pocket,{uniformScale:scale,footprint:envelope,reservedRects,viewport})||Scene.boundsOverlap(holdingBounds,entrance,gap+1))return null;
      const claimed=new Map(),assigned=new Map();
      const pointFor=(session,index)=>{const point=profile.points[workZones.get(session.id)]?.[index],f=footprints.get(session.id);return point?{x:point[0],y:Math.min(point[1],(viewport.bottom-f.bottom*scale)*100/H)}:null;};
      const claim=(session,p,index)=>{assigned.set(session.id,p);if(index>=0){const zone=workZones.get(session.id);if(!claimed.has(zone))claimed.set(zone,new Set());claimed.get(zone).add(index);}};
      // Physical fixed anchors own a matching slot first. An arbitrary fixed
      // corridor point does not consume an unrelated sorted ordinal.
      for(const session of visible)if(fixedPositions.has(session.id)){
        const p=fixedPositions.get(session.id),points=profile.points[workZones.get(session.id)]||[],index=points.findIndex((_,i)=>!claimed.get(workZones.get(session.id))?.has(i)&&samePoint(p,pointFor(session,i)));
        claim(session,p,index);
      }
      // Copied hints retain only exact legal slots in the actor's actual work
      // zone. They are never substituted for true transition source feet.
      for(const session of visible)if(!assigned.has(session.id)){
        const hint=slotHints.get(session.id),zone=workZones.get(session.id);
        if(!hint||(hint.workZone||hint.zone)!==zone)continue;
        const index=(profile.points[zone]||[]).findIndex((_,i)=>!claimed.get(zone)?.has(i)&&samePoint(hint,pointFor(session,i)));
        if(index>=0)claim(session,pointFor(session,index),index);
      }
      for(const session of visible)if(!assigned.has(session.id)){
        const zone=workZones.get(session.id),index=(profile.points[zone]||[]).findIndex((_,i)=>!claimed.get(zone)?.has(i));
        if(index<0)return null;claim(session,pointFor(session,index),index);
      }
      for(const session of visible){
        const zone=workZones.get(session.id),fixed=fixedPositions.get(session.id),f=footprints.get(session.id),p=assigned.get(session.id),a=seatArea(p,zone,session.id);
        if(!a||!legalPoint(p,{uniformScale:scale,footprint:f,reservedRects,viewport}))return null;
        const bounds=Scene.actorBounds(p,{uniformScale:scale,footprint:f});
        if((!fixed&&Scene.boundsOverlap(bounds,entrance,gap+1))||Scene.boundsOverlap(bounds,holdingBounds,gap+1)||[...seats].some(([id,q])=>Scene.actorsOverlap(p,{uniformScale:scale,footprint:f},q,{uniformScale:scale,footprint:footprints.get(id)},gap+1)))return null;
        seats.set(session.id,{...p,zone,area:a.id,areaLabelZh:a.labelZh,areaLabelEn:a.labelEn,...(fixedStale.has(session.id)?{fixedStale:true}:{}),...(fixedHolding.has(session.id)?{fixedHolding:true}:{})});
      }
      const yieldPoints=(profile.yieldPoints||[]).map(([x,y])=>({x,y:Math.min(y,(viewport.bottom-envelope.bottom*scale)*100/H)})).filter(p=>legalPoint(p,{uniformScale:scale,footprint:envelope,reservedRects,viewport})&&!Scene.boundsOverlap(Scene.actorBounds(p,{uniformScale:scale,footprint:envelope}),entrance,gap+1)&&![...seats].some(([id,q])=>Scene.actorsOverlap(p,{uniformScale:scale,footprint:envelope},q,{uniformScale:scale,footprint:footprints.get(id)},gap+1)));
      const deferred=deferEntrance({seats,pocket,scale,yieldPoints},scale);if(deferred)return deferred;
      proofTrials++;const proof=cooperativeProof(seats,footprints,scale,envelope,reservedRects,pocket,immovableIds,yieldPoints);
      return proof?proveTransition({seats,paths:proof.paths,pocket,holdingPath:proof.holdingPath,coordinated:proof,scale,yieldPoints},scale):null;
    }
    let chosen=null,scale=maximum,upper=maximum;
    if(options.cooperative!==false&&Traffic?.createCoordinator&&visible.length&&(visible.length<=12||thirteenProfile)){
      if(visible.length<=4){
        for(let pass=0;pass<(fixedScale?1:4)&&!chosen&&proofTrials<PROOF_BUDGET;pass++){
          for(let variant=0;variant<4&&!chosen&&proofTrials<PROOF_BUDGET;variant++)chosen=place(scale,variant,true);
          if(!chosen&&!fixedScale){upper=scale;scale*=.82;}
        }
        if(chosen&&scale<maximum){let low=scale,high=upper;for(let pass=0;pass<4&&proofTrials<PROOF_BUDGET;pass++){const mid=(low+high)/2,candidate=place(mid,0,true);if(candidate){low=mid;chosen=candidate;}else high=mid;}scale=low;}
      }else if(!fixedScale&&!Scene.ROOM_LAYOUT)for(const profile of thirteenProfile?[THIRTEEN_PROFILE]:profiles){const candidate=seeded(profile);if(candidate){chosen=candidate;scale=candidate.scale;break;}}
    }
    // The stricter all-other-bodies-stationary proof remains a bounded fallback
    // for unmatched work-zone distributions or an unavailable traffic module.
    if(!chosen){scale=maximum;upper=maximum;}

    if(!visible.length)chosen={seats:new Map(),paths:new Map(),pocket:HOLDING_CANDIDATES[0],holdingPath:route(ENTRY_POINT,HOLDING_CANDIDATES[0],{uniformScale:scale,footprint:envelope,reservedRects})};
    for(let pass=0;!chosen&&pass<(fixedScale?1:48);pass++){
      for(let variant=0;variant<(fullFloorMode?5:visible.length<=12?4:1)&&!chosen;variant++)chosen=place(scale,variant,false,false,fullFloorMode);
      if(!chosen&&!fixedScale){upper=scale;scale*=.82;}
    }
    if(!chosen&&fixedScale&&!options.retainStations&&previous.size&&visible.length>1&&(visible.length<=12||fullFloorMode)&&!openingBusyIds.length&&[...immovableIds].every(id=>fixedPositions.has(id))){
      // An unchanged resident's old seat is a preference, not a permanent
      // obstacle. Before deferring new work, retry bounded fresh assignments
      // for ordinary stations once finite owners release their routes.
      // Physical stale/held anchors remain fixed, and
      // every reassignment still needs complete access and actual transitions.
      if(options.cooperative!==false&&Traffic?.createCoordinator)for(let variant=0;variant<4&&!chosen&&proofTrials<PROOF_BUDGET;variant++)chosen=place(scale,variant,true,true);
      for(let variant=0;variant<(fullFloorMode?5:4)&&!chosen;variant++)chosen=place(scale,variant,false,true,fullFloorMode);
    }
    if(!chosen&&fixedScale&&options.retainStations&&cached?.residentGeometry===residentGeometry&&cached.targets===targetSignature(previous)&&['cooperative','stationary','scheduled'].includes(cached.page.proofMode)&&Math.abs(cached.page.uniformScale-requestedScale)<EPS&&!returningDocks.length&&!openingDocks.length&&!finiteExitIds.size&&visible.every(s=>validPoint(transitionPositions.get(s.id)))){
      // A finite split or return can temporarily forbid a resident from
      // yielding. That can block both a new station and a hypothetical future
      // exit without invalidating the already admitted resident targets. Keep
      // only that exact proved geometry, and prove the actual current-to-old
      // transition again under today's locks and named endpoint overlaps.
      const gap=gapForScale(requestedScale),retained=new Map(visible.map(s=>{
        const {pendingWorkZone:_,...old}=previous.get(s.id),desired=Scene.activitySpec(s).zone;
        return[s.id,{...old,...(desired!==(old.workZone||old.zone)?{pendingWorkZone:desired}:{})}];
      }));
      const legal=(points,allowSourceOverlaps=false)=>[...points].every(([id,p])=>legalPoint(p,{uniformScale:requestedScale,footprint:footprints.get(id),reservedRects,viewport})&&![...points].some(([other,q])=>other!==id&&!(allowSourceOverlaps&&options.allowedOverlaps?.has(JSON.stringify([id,other].sort())))&&Scene.actorsOverlap(p,{uniformScale:requestedScale,footprint:footprints.get(id)},q,{uniformScale:requestedScale,footprint:footprints.get(other)},gap)));
      const actual=new Map(visible.map(s=>[s.id,transitionPositions.get(s.id)]));
      // The source map is restricted to admitted bodies; unrelated runtime
      // records cannot create an overlap exemption or alter this certificate.
      const transition=legal(retained)&&legal(actual,true)?transitionProof(retained,footprints,requestedScale,reservedRects,cached.page.holdingPoints||[],immovableIds,transitionPositions,options.allowedOverlaps,fixedPositions):null;
      if(transition){
        Object.defineProperties(retained,{fits:{value:true},unplacedIds:{value:[]}});
        const page={...cached.page,visible,seats:retained,roots:visible.filter(s=>cached.page.rootIdsBySession.get(s.id)===s.id),pathsById:new Map(),holdingPaths:[],coordinatedProof:null,transitionProof:transition,transferCertificate:null,openingProof:null,returnProof:null,exitProof:null,proofMode:'deferred-resident-stations',priorProofMode:cached.page.proofMode,fitReason:'waiting-for-station-route',transitionDeferred:true,blockedByIds:[...immovableIds].sort(),cachedProof:false,venue:['workshop','teahouse','observatory'].includes(options.venue)?options.venue:'workshop'};
        // Retain the historical complete proof, not this deferred result as a
        // cache hit. Every locked heartbeat revalidates actual geometry; a
        // released owner retries normal station allocation.
        rememberProof(retained,{...cached,targets:targetSignature(retained)});return page;
      }
    }
    // A larger manual size can fit the real roots while failing the stronger
    // spare-body/re-entry probe. Keep this bounded and prove actual ingress
    // plus ordered egress; future arrivals must obtain their own new proof.
    // Helpers enter as portal probes here; their real split still needs the
    // opening-dock proof. Seated residents keep their stations when possible.
    if(!chosen&&fixedScale&&requestedScale>1&&visible.length>1&&visible.length<=6)for(const reallocate of [false,true])for(let variant=0;variant<4&&!chosen;variant++)chosen=place(maximum,variant,true,reallocate,true);
    if(!chosen)throw new RangeError('No reachable positive-size furniture-side parking fits the full observed cast');
    if(scale<maximum&&visible.length&&!chosen.coordinated&&!chosen.deferredEntrance){let low=scale,high=upper;for(let pass=0;pass<6;pass++){const mid=(low+high)/2,candidate=place(mid);if(candidate){low=mid;chosen=candidate;}else high=mid;}scale=low;}
    const rootIdsBySession=new Map();for(const s of visible){const chain=[],seen=new Set();let p=s;while(p?.parentId&&unique.has(p.parentId)&&!seen.has(p.id)){seen.add(p.id);chain.push(p.id);p=unique.get(p.parentId);}const id=p&&seen.has(p.id)?[...chain,p.id].sort()[0]:p?.id||s.id;rootIdsBySession.set(s.id,id);}
    const seats=new Map(visible.map(s=>[s.id,{...chosen.seats.get(s.id),workZone:workZones.get(s.id),helper:Boolean(s.parentId),depth:1,uniformScale:scale,targetUniformScale:scale,requestedScale,holdingPoint:chosen.pocket,layoutMode:'walking'}]));
    Object.defineProperties(seats,{fits:{value:true},unplacedIds:{value:[]}});
    const page={visible,seats,roots:visible.filter(s=>rootIdsBySession.get(s.id)===s.id),rootIdsBySession,requestedScale,uniformScale:scale,layoutMode:'walking',gap:gapForScale(scale),stageRect:null,page:0,pages:1,capacity:visible.length,helperCapacity:visible.filter(s=>s.parentId).length,hidden:0,helperOverflow:0,layoutFits:true,pathsById:chosen.paths,envelope,holdingPoints:chosen.singleBody||chosen.realCastOnly?[]:[chosen.pocket,...(chosen.yieldPoints||[])],holdingPaths:chosen.singleBody||chosen.realCastOnly?[]:[chosen.holdingPath],corridors:CORRIDORS,readability:{canvasPixels:154*scale,paintedHeadPixels:55*scale,paintedSpanPixels:75*scale,nameplatePixels:176*scale,recommendedMinimumScale:.35,needsMoreSpace:scale<.35,expansionFactor:Math.max(1,.35/scale)},venue:['workshop','teahouse','observatory'].includes(options.venue)?options.venue:'workshop',fitReason:scale<requestedScale-EPS?(scale<.18?'dense-furniture-side-fit':'reachable-furniture-side-fit'):'requested-size',cachedProof:false,proofMode:chosen.realCastOnly?'scheduled':chosen.coordinated?'cooperative':'stationary',proofTrials,coordinatedProof:chosen.coordinated||null,transitionProof:chosen.transition||null,scheduledProof:chosen.scheduledProof||null,transferCertificate:chosen.transferCertificate||null,transferProofAttempts:transferBudget.plans,transferDrainCalls:transferBudget.drainCalls};
    if(chosen.deferredEntrance){page.proofMode='deferred-entrance';page.fitReason='waiting-for-entrance';page.blockedByIds=chosen.deferredEntrance;page.transitionDeferred=true;page.holdingPaths=[];}
    page.targetUniformScale=scale;rememberProof(seats,{signature,targets:targetSignature(seats),page,residentGeometry:fixedScale?residentGeometry:null});return finishExit(finishOpening(page));
  }
  function entranceFor(present,options) {
    if(Scene.ROOM_LAYOUT)return ENTRY_POINT;
    const scale=Math.max(.65,Math.min(1.35,Number(options.requestedScale)||1));
    const bodies=Array.isArray(present)?present:[];
    const envelope=Object.fromEntries(['left','right','top','bottom'].map(key=>[key,Math.max(Scene.ACTOR_FOOTPRINT.root[key],...bodies.filter(s=>s&&s.id).map(s=>(validFootprint(options.footprints?.get(s.id))?options.footprints.get(s.id):s.parentId?Scene.ACTOR_FOOTPRINT.helper:Scene.ACTOR_FOOTPRINT.root)[key]))]));
    return [{x:87,y:78},{x:76.5,y:73.5},{x:76,y:71},{x:73.5,y:73.5}].find(point=>legalPoint(point,{uniformScale:scale,footprint:envelope,reservedRects:options.reservedRects||Scene.CLOCK_RESERVED}));
  }
  function layoutForEntrance(entry) {
    const key=entry.x+':'+entry.y;
    if(!entranceLayouts.has(key))entranceLayouts.set(key,createLayout(Scene,Traffic,entry,footprintDefaults));
    return entranceLayouts.get(key);
  }
  // The saved size is a ceiling. First try the entire real cast at that size;
  // if it does not fit, use the bounded full-cast fitter, never a partial cast.
  function layoutAllWalking(present,options={}) {
    const entry=entranceFor(present,options);
    if(entry&&(entry.x!==ENTRY_POINT.x||entry.y!==ENTRY_POINT.y))return layoutForEntrance(entry).layoutAllWalking(present,options);
    const unique=new Map((Array.isArray(present)?present:[]).filter(s=>s&&typeof s.id==='string'&&s.id).map(s=>[s.id,s]));
    const cast=[...unique.values()];
    const requested=Math.max(.65,Math.min(1.35,Number(options.requestedScale)||1));
    const passThrough=options.passThrough===true,customRoom=Boolean(Scene.ROOM_LAYOUT);
    // Kept stations are only a preference: with pass-through walking a fresh
    // assignment from the actual feet costs a walk, not a blocked route.
    const kept=options.previousSeats instanceof Map&&options.previousSeats.size>0;
    const attempt=(scale,spillZones,fresh)=>{
      try { return layoutWalking(cast,{...options,...(fresh?{previousSeats:new Map()}:{}),requestedScale:scale,fixedScale:true,fitRealCast:customRoom,passThrough,spillZones}); }
      catch(error) { if(!(error instanceof RangeError))throw error; return null; }
    };
    const tryAt=(scale,spillZones)=>attempt(scale,spillZones,false)||(passThrough&&kept?attempt(scale,spillZones,true):null);
    // Prefer at least 90% of the chosen size, first inside each agent's own
    // work zone, then on neighbouring floor. Only a still-full room shrinks
    // further, and the bounded fitter remains the final full-cast fallback.
    const floor=Math.max(.65,requested*FIT_FLOOR),steps=[];
    for(let i=0;i<=4;i++)steps.push(requested-(requested-floor)*i/4);
    const below=[];for(let scale=floor*.92;scale>.65+EPS;scale*=.92)below.push(scale);below.push(.65);
    let page=null;
    for(const scale of steps)if(!page)page=tryAt(scale,false);
    if(passThrough)for(const scale of steps.concat(below))if(!page)page=tryAt(scale,true);
    if(!page&&customRoom&&cast.length<=6){
      // A compact custom-room apron must fit the actual small cast before
      // reserving an additional hypothetical body in a narrow alcove.
      const ceiling=Math.min(requested,Number(options.maximumScale)>0?options.maximumScale:Infinity);
      const smallOptions={...options,...(passThrough?{previousSeats:new Map()}:{}),fixedScale:true,fitRealCast:true,passThrough,spillZones:passThrough};
      let upper=ceiling,scale=ceiling;
      for(let pass=0;!page&&pass<12;pass++){
        upper=scale;scale*=.82;
        try{page=layoutWalking(cast,{...smallOptions,maximumScale:scale});}
        catch(error){if(!(error instanceof RangeError))throw error;}
      }
      if(page)for(let pass=0;pass<4;pass++){
        const mid=(scale+upper)/2;
        try{page=layoutWalking(cast,{...smallOptions,maximumScale:mid});scale=mid;}
        catch(error){if(!(error instanceof RangeError))throw error;upper=mid;}
      }
    }
    if(!page)page=layoutWalking(cast,{...options,...(passThrough?{previousSeats:new Map()}:{}),fixedScale:false,passThrough,spillZones:passThrough});
    return{...page,requestedScale:requested,overflowIds:[],hidden:0,helperOverflow:0,fitAll:true,
      entryPoint:{...ENTRY_POINT},fitReason:page.uniformScale<requested-EPS?'fit-all-agents':page.fitReason};
  }
  // The user owns the physical size. Unlike the legacy ceiling fitter this
  // entry point never retries a smaller scale or admits only part of the cast.
  function layoutFullSizeWalking(present,options={}) {
    const unique=new Map((Array.isArray(present)?present:[]).filter(s=>s&&typeof s.id==='string'&&s.id).map(s=>[s.id,s]));
    const cast=[...unique.values()],requested=requestedScaleOf(options);
    const defaults=footprintDefaults?.()||Scene.ACTOR_FOOTPRINT;
    const footprints=new Map(cast.map(s=>[s.id,validFootprint(options.footprints?.get(s.id))?options.footprints.get(s.id):s.parentId?defaults.helper:defaults.root]));
    const failure=cause=>{
      const error=new RangeError('The full observed cast has no non-overlapping floor arrangement at the chosen fixed size');
      error.code='FIXED_SIZE_CAPACITY';error.requestedScale=requested;error.actorIds=cast.map(s=>s.id);if(cause)error.cause=cause;return error;
    };
    const viewport=options.viewport||Scene.ACTOR_VIEWPORT,reservedRects=options.reservedRects||Scene.CLOCK_RESERVED;
    const envelope=Object.fromEntries(['left','right','top','bottom'].map(key=>[key,Math.max(...(cast.length?cast.map(s=>footprints.get(s.id)[key]):[defaults.root[key]]))]));
    // This is only a main's future entrance rendezvous. Actual resident feet,
    // clone origins and finite return docks remain owned by currentPositions.
    const d=dimensions(requested,envelope,viewport),entryCandidates=[ENTRY_POINT];
    if(d.left<=d.right&&d.top<=d.bottom){
      const source=pixel(ENTRY_POINT);
      entryCandidates.push(percent({x:Math.max(d.left,Math.min(d.right,source.x)),y:Math.max(d.top,Math.min(d.bottom,source.y))}));
      for(let y=d.top;y<=d.bottom+EPS;y+=18)for(let x=d.left;x<=d.right+EPS;x+=24)entryCandidates.push(percent({x,y}));
    }
    const entry=entryCandidates.filter(p=>legalPoint(p,{uniformScale:requested,footprint:envelope,reservedRects,viewport})).sort((a,b)=>Scene.distance(a,ENTRY_POINT)-Scene.distance(b,ENTRY_POINT)||a.y-b.y||a.x-b.x)[0];
    if(!entry)throw failure();
    if(Math.abs(entry.x-ENTRY_POINT.x)>EPS||Math.abs(entry.y-ENTRY_POINT.y)>EPS)return layoutForEntrance(entry).layoutFullSizeWalking(cast,options);
    const strict={...options,footprints,requestedScale:requested,maximumScale:requested,fixedScale:true,passThrough:true,spillZones:true,cooperative:false,allowTransfers:false};
    let page,cause;
    for(const fullFloor of [false,true]){
      try{
        const candidate=layoutWalking(cast,{...strict,fullFloor,fitRealCast:fullFloor});
        if(Math.abs(candidate.uniformScale-requested)>EPS||Math.abs((candidate.targetUniformScale||candidate.uniformScale)-requested)>EPS)throw failure();
        page=candidate;break;
      }catch(error){if(!(error instanceof RangeError))throw error;cause=error;}
    }
    if(!page)throw failure(cause);
    return{...page,requestedScale:requested,uniformScale:requested,targetUniformScale:requested,fixedScale:true,fitAll:true,fullSize:true,
      entryPoint:{...ENTRY_POINT},overflowIds:[],hidden:0,helperOverflow:0,fitReason:page.transitionDeferred?page.fitReason:'fixed-user-size'};
  }
  // Capacity may borrow one tenth of the saved manual size. Only independent
  // mains choose that common scale; helpers keep their ordinary relative size
  // and still participate in the complete, actual collision/route proof.
  // A fresh main-only probe avoids deriving size from transient clone docks or
  // repeatedly multiplying the already reduced physical scale.
  function layoutAdaptiveWalking(present,options={}) {
    const unique=new Map((Array.isArray(present)?present:[]).filter(s=>s&&typeof s.id==='string'&&s.id).map(s=>[s.id,s]));
    const cast=[...unique.values()],mains=cast.filter(s=>!s.parentId);
    const manualScale=Math.max(.65,Math.min(1.35,Number(options.requestedScale)||1)),minimumScale=manualScale*.9;
    const capacityOptions={requestedScale:manualScale,footprints:options.footprints,viewport:options.viewport,reservedRects:options.reservedRects};
    let adaptiveTargetScale=manualScale;
    if(mains.length){
      // These are geometry probes, never replacement source sessions. A main
      // count with identical measured bodies has the same capacity while its
      // real tools, attention and work zones change.
      const mainProbes=mains.map(session=>({id:session.id,status:'active',activity:'unknown'}));
      try{layoutFullSizeWalking(mainProbes,capacityOptions);}
      catch(error){if(error.code!=='FIXED_SIZE_CAPACITY')throw error;adaptiveTargetScale=minimumScale;}
    }
    const actualOptions={...options,requestedScale:manualScale,physicalScale:adaptiveTargetScale};
    let page,adaptiveReflowPage=null;
    try{page=layoutFullSizeWalking(cast,actualOptions);}
    catch(error){
      if(error.code!=='FIXED_SIZE_CAPACITY')throw error;
      page=layoutFixedWalking(cast,{...actualOptions,fullSize:true});
      if(Number.isFinite(options.previousScale)&&Math.abs(options.previousScale-adaptiveTargetScale)>EPS){
        // A changed physical size may invalidate edge feet or an old traffic
        // arrangement even though the full target cast fits. The renderer may
        // choose its existing presentation-only readmission once finite clone
        // and exit owners have released. A heartbeat at the same scale never
        // receives this permission to replace already admitted bodies.
        try{adaptiveReflowPage=layoutFullSizeWalking(cast,{...capacityOptions,physicalScale:adaptiveTargetScale});}
        catch(reflowError){if(reflowError.code!=='FIXED_SIZE_CAPACITY')throw reflowError;}
      }
    }
    const describe=result=>({...result,requestedScale:manualScale,manualScale,minimumScale,adaptiveTargetScale,effectiveScale:result.uniformScale,
      scaleReduced:result.uniformScale<manualScale-EPS,sizingMainCount:mains.length,
      sizingReason:adaptiveTargetScale<manualScale-EPS?'main-capacity':'manual-size'});
    return{...describe(page),adaptiveNeedsReflow:Boolean(adaptiveReflowPage),adaptiveReflowPage:adaptiveReflowPage?describe(adaptiveReflowPage):null};
  }
  // Keep every real resident in the geometry problem. New observations wait
  // outside when the selected size cannot safely fit them; no fact is dropped
  // from the caller's source/roster and no smaller proof is adopted.
  function layoutFixedWalking(present,options={}) {
    if(options.fullSize===true){
      const unique=new Map((Array.isArray(present)?present:[]).filter(s=>s&&typeof s.id==='string'&&s.id).map(s=>[s.id,s]));
      const cast=[...unique.values()],previous=options.previousSeats instanceof Map?options.previousSeats:new Map();
      const residentIds=options.residentIds instanceof Set?options.residentIds:new Set(previous.keys());
      const admitted=cast.filter(s=>residentIds.has(s.id)),pending=cast.filter(s=>!residentIds.has(s.id));
      let page;
      try{page=layoutFullSizeWalking(admitted,options);}
      catch(error){
        if(error.code!=='FIXED_SIZE_CAPACITY')throw error;
        // Hold the last displayed resident geometry when a new manual size
        // has no proof. No body disappears and no old fit is relabelled as
        // proof of that new size; the caller can report the pending request.
        const scale=Number.isFinite(options.previousScale)&&options.previousScale>0?options.previousScale:
          [...previous.values()].find(p=>Number.isFinite(p.uniformScale))?.uniformScale||requestedScaleOf(options);
        const current=options.currentPositions instanceof Map?options.currentPositions:new Map();
        const held=new Map(admitted.map(s=>{
          const old=previous.get(s.id),actual=current.get(s.id),point=validPoint(old)?old:validPoint(actual)?actual:ENTRY_POINT;
          return[s.id,{...point,zone:old?.zone||Scene.activitySpec(s).zone,workZone:old?.workZone||old?.zone||Scene.activitySpec(s).zone,
            helper:Boolean(s.parentId),uniformScale:scale,targetUniformScale:scale,requestedScale:Number(options.requestedScale)||1,layoutMode:'walking'}];
        }));
        Object.defineProperties(held,{fits:{value:false},unplacedIds:{value:pending.map(s=>s.id)}});
        const empty=layoutFullSizeWalking([],options);
        return{...empty,visible:admitted,seats:held,uniformScale:scale,targetUniformScale:scale,roots:admitted.filter(s=>!s.parentId),capacity:admitted.length,
          helperCapacity:admitted.filter(s=>s.parentId).length,layoutFits:false,layoutDeferred:true,pendingScale:Number(options.requestedScale)||1,
          overflowIds:pending.map(s=>s.id),hidden:pending.length,helperOverflow:pending.filter(s=>s.parentId).length,
          pathsById:new Map(),holdingPoints:[],holdingPaths:[],transitionProof:null,scheduledProof:null,proofMode:'retained-residents',fitReason:'fixed-size-residents-held'};
      }
      const depth=session=>{const seen=new Set();let at=session,count=0;while(at?.parentId&&!seen.has(at.id)){seen.add(at.id);count++;at=unique.get(at.parentId);}return count;};
      for(const session of pending.sort((a,b)=>depth(a)-depth(b)||a.id.localeCompare(b.id))){
        if(session.parentId&&unique.has(session.parentId)&&!admitted.some(s=>s.id===session.parentId))continue;
        try{page=layoutFullSizeWalking(admitted.concat(session),{...options,previousSeats:page.seats,retainStations:true});admitted.push(session);}
        catch(error){if(error.code!=='FIXED_SIZE_CAPACITY')throw error;}
      }
      const admittedIds=new Set(admitted.map(s=>s.id)),overflowIds=cast.filter(s=>!admittedIds.has(s.id)).map(s=>s.id);
      return{...page,visible:admitted,overflowIds,hidden:overflowIds.length,helperOverflow:cast.filter(s=>overflowIds.includes(s.id)&&s.parentId).length,
        fitReason:overflowIds.length?'waiting-for-fixed-size-floor':page.fitReason};
    }
    // The legacy portal is sized for a 100% whole envelope. Larger manual
    // sizes use the room's existing doorway approach, with every proof bound
    // to that same anchor through an isolated geometry instance.
    const entry=entranceFor(present,options);
    if(entry&&(entry.x!==ENTRY_POINT.x||entry.y!==ENTRY_POINT.y)) {
      return layoutForEntrance(entry).layoutFixedWalking(present,options);
    }
    const unique=new Map((Array.isArray(present)?present:[]).filter(s=>s&&typeof s.id==='string'&&s.id).map(s=>[s.id,s]));
    const cast=[...unique.values()],previous=options.previousSeats instanceof Map?options.previousSeats:new Map();
    const residentIds=options.residentIds instanceof Set?options.residentIds:new Set(previous.keys());
    const residents=cast.filter(s=>residentIds.has(s.id)&&previous.has(s.id));
    const pending=cast.filter(s=>!residents.includes(s));
    const strict={...options,fixedScale:true,maximumScale:options.requestedScale};
    const attempt=sessions=>layoutWalking(sessions,strict);
    let admitted=residents.slice(),page;
    try { page=attempt(cast); admitted=cast; }
    catch(error) {
      if(!(error instanceof RangeError))throw error;
      try { page=attempt(admitted); }
      catch(residentError) {
        if(!(residentError instanceof RangeError))throw residentError;
        if(admitted.length) {
          // A changed activity can request a newly blocked station. Keep the
          // occupied stations while traffic/lifecycle owners clear it.
          page=layoutWalking(admitted,{...strict,retainStations:true});
        } else {
          // Some user sizes cannot clear this room's doorway. An empty floor
          // needs no route proof: leave its observed agents in the roster.
          page={...layoutWalking([],{...options,requestedScale:1,maximumScale:1,previousSeats:new Map(),currentPositions:new Map()}),
            requestedScale:Number(options.requestedScale)||1,uniformScale:Number(options.requestedScale)||1,targetUniformScale:Number(options.requestedScale)||1,
            pathsById:new Map(),holdingPaths:[],holdingPoints:[]};
        }
      }
      for(const session of pending) {
        if(session.parentId&&unique.has(session.parentId)&&!admitted.some(s=>s.id===session.parentId))continue;
        try { const next=layoutWalking(admitted.concat(session),{...strict,retainStations:true}); page=next;admitted.push(session); }
        catch(candidateError) { if(!(candidateError instanceof RangeError))throw candidateError; }
      }
    }
    const admittedIds=new Set(admitted.map(s=>s.id)),overflowIds=cast.filter(s=>!admittedIds.has(s.id)).map(s=>s.id);
    return {...page,visible:admitted,overflowIds,hidden:overflowIds.length,helperOverflow:cast.filter(s=>overflowIds.includes(s.id)&&s.parentId).length,
      fixedScale:true,entryPoint:{...ENTRY_POINT},fitReason:overflowIds.length?'waiting-for-floor-space':page.fitReason};
  }
  const sceneLayouts=new WeakMap();
  function forScene(scene){if(scene===Scene)return api;if(!sceneLayouts.has(scene))sceneLayouts.set(scene,createLayout(scene,Traffic,undefined,footprintDefaults));return sceneLayouts.get(scene);}
  const api=Object.freeze({layoutWalking,layoutAllWalking,layoutFullSizeWalking,layoutAdaptiveWalking,layoutFixedWalking,forScene,gapForScale:defaultGapForScale,legalPoint,route,retiringRoute,ENTRY_POINT,OBSTACLES,ZONE_AREAS,ZONE_ANCHORS,HOLDING_CANDIDATES,CORRIDORS});
  return api;
});
