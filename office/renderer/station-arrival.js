/* A finite furniture response to an observed physical work arrival. No actor writes. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeStationArrival = api;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const OUT = 'cubic-bezier(.23,1,.32,1)', MOVE = 'cubic-bezier(.77,0,.175,1)';
  const DURATION = 1400, BRIDGE_WAIT = 240, EXIT = 160, STATION_INTERVAL = 2400;
  const ACTIVITIES = Object.freeze({ reading: 'library', searching: 'library', planning: 'board', designing: 'board', coding: 'desk', building: 'bench', testing: 'bench', running: 'bench' });
  const MOUNTS = Object.freeze({
    library: Object.freeze([[308,250],[235,250],[185,250],[235,145],[285,150],[185,145],[270,250]]),
    board: Object.freeze([[775,205],[492,205],[640,205]]),
    desk: Object.freeze([[550,345],[750,365],[475,355]]),
    bench: Object.freeze([[1130,145],[1040,165],[1190,180],[1215,245],[995,235],[995,250]])
  });
  const PROGRAMS = Object.freeze({
    workshop: Object.freeze({library:'field-book',board:'blueprint-links',desk:'circuit-spool',bench:'bench-dial'}),
    teahouse: Object.freeze({library:'tea-scroll',board:'folded-note',desk:'tea-filter',bench:'tea-thermometer'}),
    observatory: Object.freeze({library:'star-atlas',board:'constellation',desk:'armillary',bench:'lens-iris'})
  });
  const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
  const same = (a,b) => point(a) && point(b) && Math.hypot(a.x-b.x,a.y-b.y) < .001;
  const overlaps = (a,b) => a.left < b.right + 3 && a.right > b.left - 3 && a.top < b.bottom + 3 && a.bottom > b.top - 3;
  function create({layer,world,getActors,getContext} = {}) {
    const Scene = root.OfficeScene, areas = root.OfficeWalkingLayout?.ZONE_AREAS, physicalBusy = root.OfficeSocialInteractions?.physicalBusy, activityKey = root.OfficeSocialInteractions?.activityKey;
    if (!layer || !world || !Scene || !areas || typeof physicalBusy !== 'function' || typeof activityKey !== 'function' || typeof getActors !== 'function' || typeof getContext !== 'function') throw new TypeError('Station arrivals need the real scene, physical-owner contract and actor/context readers');
    const document = layer.ownerDocument, view = document.defaultView;
    const records = new Set(), ledger = new WeakMap(), stationTimes = new Map();
    const counts = {started:0,finished:0,canceled:0,skipped:0,reasons:Object.create(null)};
    let destroyed = false, frame = 0, lastStart = -Infinity;
    layer.classList.add('station-arrival-layer'); layer.setAttribute('aria-hidden','true');
    const now = () => view.performance.now();
    const actors = () => { const value=getActors(); return value && typeof value.get==='function' && typeof value.values==='function' ? [...value.values()] : Array.from(value || []); };
    function context(override) {
      const value = override && typeof override==='object' ? override : getContext() || {};
      const theme = value.resolvedTheme || (root.OfficeFestivals?.resolve ? root.OfficeFestivals.resolve(value).theme : value.theme || 'auto');
      return {...value,theme,venue:PROGRAMS[value.venue || value.scene] ? value.venue || value.scene : 'workshop',hidden:Boolean(document.hidden || value.hidden)};
    }
    const quiet = ctx => Boolean(ctx.hidden || ctx.reducedMotion || ctx.lowPower || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const skip = reason => { counts.skipped++; counts.reasons[reason]=(counts.reasons[reason] || 0)+1; return false; };
    const svg = (tag,attrs={},parent) => { const node=document.createElementNS(NS,tag); for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value)); if(parent)parent.append(node); return node; };
    function physical(actor) {
      try { const m=new view.DOMMatrixReadOnly(view.getComputedStyle(actor.node).transform); return {x:m.m41/12.8,y:m.m42/7.2,scale:Math.hypot(m.m11,m.m12)}; } catch (_) { return null; }
    }
    function reason(record,ctx,byId) {
      const actor=record.actor;
      if (destroyed || (byId || new Map(actors().map(item=>[item.id,item]))).get(record.id)!==actor || actor.serial!==record.serial) return 'owner';
      const session=actor.session || {}, activity=session.activity, zone=ACTIVITIES[activity];
      if (session.status!=='active' || session.closed || session.disconnected || session.attention || !zone || Scene.activitySpec(session).zone!==zone) return 'activity';
      if (activityKey(actor)!==record.activityKey || zone!==record.zone) return 'activity';
      if (actor.entryPending || actor.stagedEntry || actor.departing || actor.completing || actor.holdingFamily || actor.retireRequested || physicalBusy(actor,ctx) || actor.node.dataset.walking==='true' || actor.node.dataset.reaction==='true') return 'physical-owner';
      const area=areas[zone]?.find(area=>(!actor.target?.area || area.id===actor.target.area) && record.position.x>=area.x1-.000001 && record.position.x<=area.x2+.000001 && record.position.y>=area.y1-.000001 && record.position.y<=area.y2+.000001);
      const targetZone=actor.target?.workZone || (actor.target?.zone==='stage' ? zone : actor.target?.zone);
      if (!actor.node.isConnected || !actor.body?.isConnected || !same(actor.position,record.position) || !same(actor.target,record.position) || targetZone!==zone || !area) return 'endpoint';
      const style=view.getComputedStyle(actor.node), actual=physical(actor);
      if (style.display==='none' || style.visibility==='hidden' || Number(style.opacity)<.99 || !same(actual,record.position)) return 'endpoint';
      if (quiet(ctx)) return 'quiet';
      if (ctx.fitting || ctx.mode && ctx.mode!=='live' || ctx.venue!==record.venue || ctx.theme!==record.theme || ctx.artworkKey!==record.artworkKey || Math.abs((ctx.scale ?? actual.scale)-record.scale)>.00001 || Math.abs(actual.scale-record.scale)>.00001) return 'context';
      return '';
    }
    function jointBridge(actor) {
      return actor.body.getAnimations?.({subtree:true}).some(motion=> {
        const target=motion.effect?.target;
        return motion.constructor.name==='Animation' && motion.effect?.getTiming().duration===180 && (motion.playState==='running' || motion.pending)
          && target?.matches?.('.ap-upper,.ap-eyes,.ap-arm,.ap-foot');
      }) || false;
    }
    function blockedRects(cast=actors()) {
      const room=world.getBoundingClientRect(),fx=1280/room.width,fy=720/room.height;
      if (!(room.width>0 && room.height>0)) return null;
      const rectangles=[...(Scene.CLOCK_RESERVED || [{left:470,top:65,right:830,bottom:175}])];
      for (const actor of cast) {
        if(!actor.node?.isConnected || actor.entryPending)continue;
        const style=view.getComputedStyle(actor.node); if(style.display==='none' || style.visibility==='hidden' || Number(style.opacity)<.01)continue;
        // A moving body already owns a known endpoint. Reserve the same
        // measured parts there too, so a nearby response does not begin in
        // space that this peer will occupy as its current route finishes.
        // This is an endpoint reservation, not a future-corridor guarantee.
        const navigation=[actor.navigation,actor.resumeNavigation].find(value=>value && typeof value==='object' && typeof value.kind==='string' && value.kind.trim() && point(value.target));
        const reservation=actor.routeReservation;
        const reserved=Number.isSafeInteger(actor.serial) && actor.serial>=0 && reservation
          && Number.isSafeInteger(reservation.token) && reservation.token>0 && reservation.serial===actor.serial;
        const moving=actor.motion || actor.walking || reserved || actor.yielding===true || navigation;
        const endpoint=navigation?.target || actor.target;
        const foot=moving && physical(actor);
        const dx=point(foot) && point(endpoint)?(endpoint.x-foot.x)*12.8:0;
        const dy=point(foot) && point(endpoint)?(endpoint.y-foot.y)*7.2:0;
        for(const part of actor.node.querySelectorAll('.character-body,.nameplate,.actor-title,.actor-relation,.actor-subline,.family-badge,.actor-keepsake')) {
          const b=part.getBoundingClientRect(); if(!(b.width && b.height))continue;
          const bounds={left:(b.left-room.left)*fx,right:(b.right-room.left)*fx,top:(b.top-room.top)*fy,bottom:(b.bottom-room.top)*fy};
          rectangles.push(bounds);
          if(Math.hypot(dx,dy)>.001)rectangles.push({left:bounds.left+dx,right:bounds.right+dx,top:bounds.top+dy,bottom:bounds.bottom+dy});
        }
      }
      // Existing interactive room art is above this furniture layer. Reserve
      // its small authored viewport plus its complete local motion envelope,
      // not a transparent inset:0 stage (which would block the whole room).
      // Festival rotation/scale/lift needs asymmetric space; labels do not
      // move with its primary group. Venue meteor tails can leave their SVG.
      for(const part of world.querySelectorAll('.festival-art,.festival-caption,.venue-control svg,.venue-control-label,.venue-readout,.venue-note-text,.venue-star-target')) {
        if(!part.isConnected)continue;
        let visible=true,alpha=1;
        for(let parent=part;parent;parent=parent.parentNode) {
          const style=view.getComputedStyle(parent);
          alpha*=Number(style.opacity);
          if(style.display==='none' || style.visibility==='hidden' || alpha<.01) {visible=false;break;}
          if(parent===world)break;
        }
        if(!visible)continue;
        const b=part.getBoundingClientRect();if(!(b.width>0 && b.height>0))continue;
        const festival=part.matches('.festival-art'),art=festival || part.matches('.venue-control svg');
        const tail=art && !festival && part.querySelectorAll('.venue-meteor').length>0;
        const padding=festival?{left:40,right:40,top:48,bottom:32}:art?{left:24,right:tail?56:24,top:24,bottom:tail?32:24}:{left:3,right:3,top:3,bottom:3};
        rectangles.push({left:(b.left-room.left)*fx-padding.left,right:(b.right-room.left)*fx+padding.right,top:(b.top-room.top)*fy-padding.top,bottom:(b.bottom-room.top)*fy+padding.bottom});
      }
      for(const record of records)if(record.bounds && record.phase!=='waiting')rectangles.push(record.bounds);
      return rectangles;
    }
    function mount(zone,blocked=blockedRects()) {
      if(!blocked)return null;
      const rx=zone==='board'?30:54,ry=zone==='board'?24:36;
      for(const [x,y] of MOUNTS[zone]) {
        const bounds={left:x-rx,right:x+rx,top:y-ry,bottom:y+ry};
        if(!blocked.some(rect=>overlaps(bounds,rect)))return {x,y,bounds};
      }
      return null;
    }
    function remove(record,finished=false) {
      if(!records.delete(record))return;
      for(const motion of record.animations || [])motion.cancel();
      record.node?.remove();
      if(finished)counts.finished++;
    }
    function cancel(record,immediate=false) {
      if(!records.has(record) || record.phase==='fading') { if(immediate)remove(record); return; }
      counts.canceled++;
      if(immediate || !record.node) { remove(record); return; }
      const alpha=Number(view.getComputedStyle(record.node).opacity);
      record.phase='fading'; record.node.dataset.phase='fading'; record.until=now()+EXIT;
      // Keep each decorative part at its actual pose while fading its parent.
      // No actor, resource-health or work Animation is in this owned list.
      for(const motion of record.animations) { const at=motion.currentTime; motion.pause(); if(Number.isFinite(at))motion.currentTime=at; }
      record.node.style.opacity=String(Number.isFinite(alpha)?alpha:0);
      record.presence.cancel();
      if(!(alpha>.001)) { remove(record); return; }
      const fade=record.node.animate([{opacity:alpha},{opacity:0}],{duration:EXIT,easing:OUT,fill:'both'});
      fade.finished.catch(()=>{}); record.animations.push(fade);
    }
    function draw(record,anchor) {
      const {zone,venue}=record, node=svg('svg',{class:'station-arrival',viewBox:'0 0 120 80','data-zone':zone,'data-venue':venue,'data-kind':record.kind,'data-program':PROGRAMS[venue][zone],'data-owner-id':record.id,'data-owner-serial':record.serial,'data-phase':'playing','aria-hidden':'true'});
      node.style.left=(anchor.x-60)+'px';node.style.top=(anchor.y-40)+'px';layer.append(node);
      record.node=node;record.bounds=anchor.bounds;record.anchor={x:anchor.x,y:anchor.y};record.phase='playing';record.until=now()+DURATION;record.animations=[];
      const animate=(target,frames,easing=MOVE)=>{const motion=target.animate(frames.map((value,index)=>index<frames.length-1?{easing,...value}:value),{duration:DURATION,easing:'linear',fill:'both'});motion.finished.catch(()=>{});record.animations.push(motion);return motion;};
      record.presence=animate(node,[{opacity:0,offset:0},{opacity:.95,offset:.1},{opacity:.95,offset:.82},{opacity:0,offset:1}],OUT);
      const origin=svg('g',{transform:'translate(60 40)'},node);
      const art=svg('g',zone==='board'?{transform:'scale(.8)'}:{},origin);
      const path=(d,parent=art,cls='station-line')=>svg('path',{d,class:cls},parent);
      const g=()=>svg('g',{},art);
      const palette=venue==='teahouse'?'tea':venue==='observatory'?'star':'wood';node.dataset.palette=palette;
      if(zone==='library') {
        const left=g(),right=g(),slip=g();
        path(venue==='teahouse'?'M-31-17H0V17H-31Z':'M0-16Q-20-25-38-15V16Q-18 8 0 17Z',left,'station-paper');
        path(venue==='teahouse'?'M0-17H31V17H0Z':'M0-16Q20-25 38-15V16Q18 8 0 17Z',right,'station-paper');
        for(const side of [-1,1])for(let i=0;i<3;i++)path('M'+(side*7)+' '+(-9+i*7)+'Q'+(side*19)+' '+(-13+i*7)+' '+(side*31)+' '+(-8+i*7),side<0?left:right);
        if(venue==='workshop') {
          path('M20-23H28V-3L24-7 20-3Z',slip,'station-accent');path('M-22 2L-16-5-9 2V8H-22Z',left);
          animate(left,[{transform:'rotate(7deg)',offset:0},{transform:'rotate(-5deg)',offset:.3},{transform:'rotate(2deg)',offset:.68},{transform:'rotate(0deg)',offset:1}]);
          animate(right,[{transform:'rotate(-7deg)',offset:0},{transform:'rotate(6deg)',offset:.4},{transform:'rotate(-2deg)',offset:.72},{transform:'rotate(0deg)',offset:1}]);
          animate(slip,[{transform:'translate(0px,-6px)',offset:0},{transform:'translate(0px,7px)',offset:.6},{transform:'translate(0px,2px)',offset:1}]);
        } else if(venue==='teahouse') {
          path('M-36-20H-30V20H-36Z',left,'station-metal');path('M30-20H36V20H30Z',right,'station-metal');
          path('M8 5Q16-9 27-9Q27 4 8 5ZM10 4L22-4',slip,'station-leaf');
          animate(left,[{transform:'translateX(4px) scaleX(.95)',offset:0},{transform:'translateX(-3px) scaleX(1)',offset:.55},{transform:'translateX(0px) scaleX(1)',offset:1}]);
          animate(right,[{transform:'translateX(-4px) scaleX(.95)',offset:0},{transform:'translateX(3px) scaleX(1)',offset:.55},{transform:'translateX(0px) scaleX(1)',offset:1}]);
          animate(slip,[{transform:'translate(-7px,-8px) rotate(-12deg)',offset:0},{transform:'translate(2px,5px) rotate(9deg)',offset:.6},{transform:'translate(0px,2px) rotate(0deg)',offset:1}]);
        } else {
          path('M-20 5L-8-7 10 1 24-9',right,'station-line');svg('circle',{cx:14,cy:0,r:12,class:'station-metal'},slip);path('M4 0H24M14-10V10',slip,'station-accent-line');
          [[9,-7],[23,-2],[16,8]].forEach(([x,y],i)=>{const star=g();path('M'+(x-3)+' '+y+'H'+(x+3)+'M'+x+' '+(y-3)+'V'+(y+3),star,'station-accent-line');animate(star,[{opacity:0,offset:0},{opacity:0,offset:.1+i*.13},{opacity:1,offset:.36+i*.13},{opacity:.6,offset:1}],OUT);});
          animate(left,[{transform:'rotate(-4deg) scaleY(.95)',offset:0},{transform:'rotate(2deg) scaleY(1)',offset:.48},{transform:'rotate(0deg) scaleY(1)',offset:1}]);
          animate(right,[{transform:'rotate(4deg) scaleY(.95)',offset:0},{transform:'rotate(-2deg) scaleY(1)',offset:.48},{transform:'rotate(0deg) scaleY(1)',offset:1}]);
          slip.style.transformOrigin='14px 0px';animate(slip,[{transform:'rotate(-24deg)',offset:0},{transform:'rotate(28deg)',offset:.7},{transform:'rotate(36deg)',offset:1}]);
        }
      } else if(zone==='board') {
        const sheet=g();path('M-33-18H33V18H-33Z',sheet,'station-paper');
        if(venue==='teahouse') {
          path('M-11-18V18M11-18V18',sheet);const note=g();path('M-20-8H20V9H-20Z',note,'station-accent');path('M-12-2H10M-12 4H3',note);
          animate(note,[{transform:'translate(0px,4px) rotate(-6deg)',offset:0},{transform:'translate(0px,-3px) rotate(4deg)',offset:.45},{transform:'translate(0px,0px) rotate(0deg)',offset:1}]);
        } else {
          const coords=venue==='observatory'?[[-23,8],[-9,-8],[9,2],[25,-9]]:[[-25,-8],[-9,-8],[-9,8],[24,8]];
          coords.slice(1).forEach((p,i)=>{const prev=coords[i],link=g();path('M'+prev[0]+' '+prev[1]+'L'+p[0]+' '+p[1],link,'station-accent-line');animate(link,[{opacity:0,offset:0},{opacity:0,offset:.08+i*.13},{opacity:1,offset:.3+i*.13},{opacity:.65,offset:1}],OUT);});
          for(const[x,y]of coords)svg(venue==='observatory'?'circle':'rect',venue==='observatory'?{cx:x,cy:y,r:2.8,class:'station-accent'}:{x:x-3,y:y-3,width:6,height:6,class:'station-accent'},sheet);
        }
        animate(sheet,[{transform:'translate(0px,2px) scaleX(.95)',offset:0},{transform:'translate(0px,-2px) scaleX(1)',offset:.4},{transform:'translate(0px,0px) scaleX(1)',offset:1}]);
      } else if(zone==='desk') {
        if(venue==='workshop') {
          path('M-35-12H35V13H-35Z',art,'station-paper');path('M-24 0H-12V-6H1V7H17V-2H28',art,'station-accent-line');
          for(const x of [-35,35]) {const wheel=g();svg('circle',{cx:x,cy:0,r:9,class:'station-metal'},wheel);path('M'+(x-6)+' 0H'+(x+6)+'M'+x+'-6V6',wheel);wheel.style.transformOrigin=x+'px 0px';animate(wheel,[{transform:'rotate(-12deg)',offset:0},{transform:'rotate(30deg)',offset:.7},{transform:'rotate(36deg)',offset:1}]);}
          const current=g();svg('circle',{cx:0,cy:0,r:2.5,class:'station-accent'},current);animate(current,[{transform:'translate(-24px,0px)',offset:0},{transform:'translate(-12px,-6px)',offset:.25},{transform:'translate(1px,7px)',offset:.55},{transform:'translate(28px,-2px)',offset:1}]);
        } else if(venue==='teahouse') {
          path('M-34 17H34M-25-18V17M25-18V17M-25-16H25',art,'station-metal');const filter=g();path('M-14-10H14L6 3H-6Z',filter,'station-paper');path('M-11 7H11L9 19H-8Z',art,'station-accent');
          animate(filter,[{transform:'rotate(-6deg) translateY(-2px)',offset:0},{transform:'rotate(5deg) translateY(3px)',offset:.4},{transform:'rotate(-2deg) translateY(0px)',offset:.75},{transform:'rotate(0deg)',offset:1}]);
          const drop=g();path('M0-2Q-6 6 0 7Q6 6 0-2Z',drop,'station-leaf');animate(drop,[{opacity:0,transform:'translateY(-1px)',offset:0},{opacity:1,transform:'translateY(3px)',offset:.35},{opacity:0,transform:'translateY(10px)',offset:.75},{opacity:0,offset:1}]);
        } else {
          path('M-26 19H26M0 14V21',art,'station-metal');const orbit=g();svg('ellipse',{cx:0,cy:-3,rx:30,ry:13,class:'station-metal'},orbit);svg('ellipse',{cx:0,cy:-3,rx:14,ry:24,class:'station-line'},orbit);svg('circle',{cx:0,cy:-3,r:7,class:'station-accent'},orbit);
          animate(orbit,[{transform:'rotate(-9deg)',offset:0},{transform:'rotate(10deg)',offset:.48},{transform:'rotate(-3deg)',offset:.8},{transform:'rotate(0deg)',offset:1}]);
        }
      } else {
        path('M-33 21H33L30-18H-30Z',art,'station-paper');const dial=g();if(venue!=='teahouse')svg('circle',{cx:0,cy:0,r:17,class:'station-metal'},dial);
        if(venue==='teahouse') {
          path('M-5-18Q0-23 5-18V6Q14 19 0 22Q-14 19-5 6Z',dial,'station-metal');const column=g();path('M0-12V13',column,'station-accent-line');svg('circle',{cx:0,cy:14,r:5,class:'station-accent'},column);
          animate(column,[{transform:'translateY(3px)',offset:0},{transform:'translateY(-3px)',offset:.5},{transform:'translateY(0px)',offset:1}]);
          const bubble=g();svg('circle',{cx:0,cy:9,r:2,class:'station-accent'},bubble);animate(bubble,[{opacity:0,transform:'translateY(0px)',offset:0},{opacity:1,transform:'translateY(-7px)',offset:.4},{opacity:0,transform:'translateY(-22px)',offset:1}]);
          const steam=g();path('M25-3Q21-10 26-14M32-2Q28-8 32-13',steam,'station-steam');animate(steam,[{opacity:0,transform:'translateY(3px)',offset:0},{opacity:.8,transform:'translateY(0px)',offset:.5},{opacity:0,transform:'translateY(-5px)',offset:1}]);
        } else {
        for(let i=0;i<5;i++){const angle=(-140+i*70)*Math.PI/180;path('M'+(Math.cos(angle)*13)+' '+(Math.sin(angle)*13)+'L'+(Math.cos(angle)*16)+' '+(Math.sin(angle)*16),dial);}
        if(venue==='observatory')for(let i=0;i<4;i++){const blade=g();blade.style.transformOrigin='0px 0px';path('M0 0L7-13 15-5 7 5Z',blade,'station-accent');animate(blade,[{transform:'rotate('+i*90+'deg)',offset:0},{transform:'rotate('+(i*90+24)+'deg)',offset:.45},{transform:'rotate('+(i*90+7)+'deg)',offset:1}]);}
        else {const needle=g();path('M0 3V-12',needle,'station-accent-line');svg('circle',{cx:0,cy:0,r:3,class:'station-accent'},needle);animate(needle,[{transform:'rotate(-34deg)',offset:0},{transform:'rotate(27deg)',offset:.45},{transform:'rotate(-8deg)',offset:.75},{transform:'rotate(0deg)',offset:1}]);}
        }
      }
      counts.started++;stationTimes.set(zone,now());lastStart=now();
    }
    function ensureFrame() { if(!frame && records.size && !destroyed)frame=view.requestAnimationFrame(run); }
    function run() { frame=0;update();ensureFrame(); }
    function update(override) {
      if(destroyed)return;
      const ctx=context(override),at=now(),cast=actors(),byId=new Map(cast.map(actor=>[actor.id,actor]));
      let obstacles;
      const geometry=()=>obstacles===undefined ? (obstacles=blockedRects(cast)) : obstacles;
      for(const record of records) {
        if(quiet(ctx)) { cancel(record,true);continue; }
        if(record.phase==='fading') { if(at>=record.until)remove(record);continue; }
        const invalid=reason(record,ctx,byId);
        if(invalid) { cancel(record);continue; }
        if(record.phase==='waiting') {
          if(at>record.until) { counts.reasons['bridge-timeout']=(counts.reasons['bridge-timeout']||0)+1;remove(record);continue; }
          if(jointBridge(record.actor))continue;
          const blocked=geometry(),anchor=mount(record.zone,blocked);if(!anchor){skip('occluded');remove(record);continue;}
          draw(record,anchor);blocked.push(anchor.bounds);
        } else {
          if(at>=record.until) {remove(record,true);continue;}
          const obstacles=geometry();
          // Ignore this prop's own reservation, but never draw through a new
          // real body / clock or another live furniture response.
          if(!obstacles || obstacles.some(rect=>rect!==record.bounds&&overlaps(record.bounds,rect)))cancel(record);
        }
      }
      if(!records.size && frame){view.cancelAnimationFrame(frame);frame=0;}
      ensureFrame();
    }
    function arrive(detail) {
      if(destroyed)return false;
      if(!detail || !['entry','station'].includes(detail.kind))return skip('kind');
      const actor=detail.actor,ctx=context(),workZone=ACTIVITIES[actor?.session?.activity],actual=actor && physical(actor);
      if(!actor || actor.id!==detail.actorId || !Number.isFinite(detail.serial) || !point(detail.position) || !actual || !workZone)return skip('evidence');
      if(detail.zone!==workZone && detail.zone!=='stage')return skip('zone');
      const record={actor,id:actor.id,serial:detail.serial,kind:detail.kind,activityKey:activityKey(actor),zone:workZone,venue:ctx.venue,theme:ctx.theme,artworkKey:ctx.artworkKey,scale:ctx.scale ?? actual.scale,position:{...detail.position},phase:'waiting',until:now()+BRIDGE_WAIT};
      const invalid=reason(record,ctx);
      // A valid quiet arrival is consumed, never replayed after preferences
      // change. It may not bypass any identity or physical endpoint checks.
      if(invalid && invalid!=='quiet')return skip(invalid);
      const previous=ledger.get(actor),key=[detail.serial,detail.kind,workZone,detail.position.x,detail.position.y].join('/');
      if(previous?.key===key || previous?.zone===workZone)return skip('same-station');
      ledger.set(actor,{key,zone:workZone});
      if(invalid==='quiet')return skip('quiet');
      if(records.size>=2 || [...records].some(value=>value.zone===workZone) || now()-(stationTimes.get(workZone) ?? -Infinity)<STATION_INTERVAL || now()-lastStart<350)return skip('budget');
      records.add(record);
      if(!jointBridge(actor)) {const anchor=mount(workZone);if(!anchor){remove(record);return skip('occluded');}draw(record,anchor);}
      ensureFrame();return true;
    }
    function destroy() { if(destroyed)return;destroyed=true;if(frame)view.cancelAnimationFrame(frame);frame=0;for(const record of records)remove(record);stationTimes.clear(); }
    return Object.freeze({arrive,update,tick:update,destroy,state:()=>({destroyed,rafActive:Boolean(frame),pending:[...records].filter(record=>record.phase==='waiting').length,active:[...records].filter(record=>record.node).map(record=>({ownerId:record.id,serial:record.serial,zone:record.zone,venue:record.venue,program:PROGRAMS[record.venue][record.zone],phase:record.phase,anchor:{...record.anchor},bounds:{...record.bounds}})),...counts,reasons:{...counts.reasons}})});
  }
  return Object.freeze({create,DURATION,BRIDGE_WAIT,EXIT,PROGRAMS,MOUNTS});
});
