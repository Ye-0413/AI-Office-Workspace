/* Finite decorative pair choreography, isolated from real actor poses/state. */
(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg',EASE_OUT='cubic-bezier(.23,1,.32,1)',EASE_MOVE='cubic-bezier(.77,0,.175,1)';
  function create({layer,world,getActors,getContext}={}){
    const Model=root.OfficeSocialInteractions;
    if(!layer||!world||!Model||typeof getActors!=='function'||typeof getContext!=='function')throw new TypeError('Social interactions need the real scene layer, world and actor/context readers');
    const document=layer.ownerDocument,view=document.defaultView,scheduler=Model.createScheduler();
    let current=null,outgoing=null,destroyed=false,frame=0;
    layer.classList.add('agent-social-layer');layer.setAttribute('aria-hidden','true');
    const context=()=>{const value=getContext()||{};return {...value,hidden:!!(document.hidden||value.hidden)};};
    const svg=(tag,attrs={},parent)=>{const node=document.createElementNS(NS,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(parent)parent.append(node);return node;};
    function cast(onlyIds){
      const source=getActors(),actors=source instanceof Map?[...source.values()]:Array.isArray(source)?source:Array.from(source||[]),room=world.getBoundingClientRect(),width=world.clientWidth||1280,height=world.clientHeight||720;
      if(!room.width||!room.height)return [];
      return actors.filter(actor=>!onlyIds||onlyIds.has(actor?.id)).map(actor=>{
        if(!actor?.node||!actor?.body)return {...actor,visible:false};
        const box=actor.body.getBoundingClientRect(),style=view.getComputedStyle(actor.node),bodyStyle=view.getComputedStyle(actor.body);
        const visible=actor.node.isConnected&&actor.body.isConnected&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>.2&&bodyStyle.display!=='none'&&box.width>0&&box.height>0;
        return {...actor,visible,walking:actor.node.dataset.walking==='true',reacting:actor.node.dataset.reaction==='true',
          point:{x:(box.left+box.width*.5-room.left)*width/room.width,y:(box.top+box.height*.7-room.top)*height/room.height},
          anchor:{x:(box.left-room.left)*width/room.width,y:(box.top-room.top)*height/room.height,width:box.width*width/room.width,height:box.height*height/room.height},
          color:view.getComputedStyle(actor.node).getPropertyValue('--family-color').trim()||'#b87960'};
      });
    }
    const quiet=ctx=>!!(ctx.hidden||ctx.reducedMotion||ctx.lowPower||ctx.mode&&ctx.mode!=='live');
    function remove(record){
      if(!record)return;
      record.exit?.cancel();
      for(const animation of record.animations)animation.cancel();
      record.node.remove();
    }
    function cancel(immediate=false){
      const old=current;current=null;scheduler.cancel();
      if(frame){view.cancelAnimationFrame(frame);frame=0;}
      if(immediate||destroyed||quiet(context())){
        const leaving=outgoing;outgoing=null;remove(leaving);remove(old);return;
      }
      if(!old)return;
      // Only these original decorative trajectories are held. Real joints,
      // work props, body feet and their clocks keep their separate owners.
      for(const animation of old.animations){
        const at=animation.currentTime;animation.pause();
        if(Number.isFinite(at))animation.currentTime=at;
      }
      old.node.dataset.socialExiting='true';outgoing=old;
      const alpha=Number(view.getComputedStyle(old.node).opacity);
      old.exit=old.node.animate([{opacity:Number.isFinite(alpha)?alpha:1},{opacity:0}],{duration:160,easing:EASE_OUT,fill:'both'});
      old.exit.finished.catch(()=>{}).then(()=>{if(outgoing!==old)return;outgoing=null;remove(old);});
    }
    function sameGeometry(cast){
      if(!current)return false;
      const byId=new Map(cast.map(actor=>[actor.id,actor]));
      return current.anchors.every(saved=>{const a=byId.get(saved.id)?.anchor;return a&&['x','y','width','height'].every(key=>Math.abs(a[key]-saved[key])<.65);})
        &&current.worldWidth===world.getBoundingClientRect().width&&current.worldHeight===world.getBoundingClientRect().height;
    }
    function guard(){
      frame=0;if(!current||destroyed)return;
      const actors=cast(new Set(current.anchors.map(actor=>actor.id)));
      if(!scheduler.valid(actors,context())||!sameGeometry(actors)){cancel();return;}
      frame=view.requestAnimationFrame(guard);
    }
    function build(plan,actors,ctx){
      const byId=new Map(actors.map(actor=>[actor.id,actor])),pair=plan.ids.map(id=>byId.get(id));
      pair.sort((a,b)=>a.point.x-b.point.x||a.id.localeCompare(b.id));
      const[a,b]=pair,wa=world.clientWidth||1280,ha=world.clientHeight||720;
      const node=svg('svg',{class:'agent-social-vignette',viewBox:`0 0 ${wa} ${ha}`,'data-social-kind':plan.kind,'data-social-venue':plan.venue,'aria-hidden':'true'});
      layer.append(node);const animations=[],duration=plan.definition.duration;
      function animate(target,frames,easing=EASE_MOVE){const timed=frames.map((frame,index)=>index<frames.length-1?{easing,...frame}:frame);const animation=target.animate(timed,{duration,easing:'linear',fill:'both'});animations.push(animation);return animation;}
      function at(x,y,className=''){return svg('g',{transform:`translate(${x} ${y})`,class:className},node);}
      const propScale=Math.max(.35,Math.min(1.15,Math.min(a.anchor.width,b.anchor.width)/154));
      const left={x:a.anchor.x+a.anchor.width*.72,y:a.point.y},right={x:b.anchor.x+b.anchor.width*.28,y:b.point.y},dx=right.x-left.x,dy=right.y-left.y;
      const mid={x:(left.x+right.x)/2,y:(left.y+right.y)/2},captionY=Math.max(88,Math.min(570,Math.min(left.y,right.y)-108*propScale));
      const reserved=root.OfficeScene?.CLOCK_RESERVED||[{left:470,top:65,right:830,bottom:175}];
      const clearClock=(x,y,radius=20*propScale)=>{for(const rect of reserved)if(x+radius>rect.left&&x-radius<rect.right&&y-radius<rect.bottom&&y+radius>rect.top)y=rect.bottom+radius+8;return y;};
      const captionAnchor=at(Math.max(155,Math.min(wa-155,mid.x)),captionY,'social-caption-anchor'),caption=svg('g',{class:'social-caption'},captionAnchor),captionWidth=ctx.language==='en'?282:246;
      svg('rect',{x:-captionWidth/2,y:-13,width:captionWidth,height:25,rx:6},caption);
      if(actors.length>12||reserved.some(rect=>mid.x+captionWidth/2>rect.left&&mid.x-captionWidth/2<rect.right&&captionY+13>rect.top&&captionY-13<rect.bottom))caption.style.display='none';
      const title=svg('text',{'text-anchor':'middle',y:4},caption);title.textContent=(ctx.language==='en'?'Studio moment · ':'工作室小互动 · ')+plan.definition[ctx.language==='en'?'labelEn':'labelZh'];
      animate(caption,[{opacity:0,transform:'translateY(3px)',offset:0,easing:EASE_OUT},{opacity:.96,transform:'translateY(0)',offset:.08},{opacity:.96,offset:.92,easing:EASE_OUT},{opacity:0,transform:'translateY(-2px)',offset:1}],'linear');
      function hand(actor,p,role,frames){const anchor=at(p.x,p.y,`social-gesture-anchor social-${role}`),g=svg('g',{class:'social-hand','data-part':role},anchor);const shape=svg('g',{transform:`scale(${propScale})`},g);svg('path',{d:'M-8 3Q-12-1-8-5L-4-6-3-11Q-1-14 1-11L2-5 7-8Q11-9 11-5L9 5Q7 10 0 10Z',fill:actor.color},shape);svg('path',{d:'M-4 0L2 2 7 0',class:'social-palm-line'},shape);animate(g,frames);return g;}
      const give=[{opacity:0,transform:'translate(0px,5px) rotate(-12deg)',offset:0},{opacity:1,transform:'translate(5px,-4px) rotate(5deg)',offset:.18},{opacity:1,transform:'translate(9px,-3px) rotate(12deg)',offset:.44},{opacity:1,transform:'translate(2px,0px) rotate(-4deg)',offset:.74},{opacity:0,transform:'translate(0px,4px) rotate(0deg)',offset:1}];
      const receive=[{opacity:0,transform:'translate(0px,4px) rotate(10deg)',offset:0},{opacity:1,transform:'translate(-4px,-1px) rotate(-8deg)',offset:.28},{opacity:1,transform:'translate(-9px,-5px) rotate(-12deg)',offset:.59},{opacity:1,transform:'translate(-2px,-8px) rotate(6deg)',offset:.78},{opacity:0,transform:'translate(0px,3px)',offset:1}];
      function nod(actor,delay=.58,lookUp=false){
        const anchor=at(actor.anchor.x+actor.anchor.width*.5,actor.anchor.y+actor.anchor.height*.45,'social-reaction-anchor'),g=svg('g',{class:'social-reaction'},anchor),shape=svg('g',{transform:`scale(${propScale})`},g);
        svg('path',{d:lookUp?'M-13 3L-9-3-5 3M5 3L9-3 13 3':'M-14-1Q-9 5-4-1M4-1Q9 5 14-1'},shape);
        animate(g,[{opacity:0,transform:'translateY(1px)',offset:0},{opacity:0,offset:Math.max(0,delay-.08)},{opacity:1,transform:lookUp?'translateY(-7px) rotate(-3deg)':'translateY(3px) rotate(3deg)',offset:delay},{opacity:1,transform:lookUp?'translateY(-5px) rotate(2deg)':'translateY(-1px) rotate(-2deg)',offset:Math.min(.89,delay+.16)},{opacity:0,transform:'translateY(0)',offset:1}]);
      }
      function prop(x,y,kind,content){const anchor=at(x,y,`social-prop-anchor social-${kind}`),g=svg('g',{class:'social-prop','data-prop':kind},anchor);content(svg('g',{transform:`scale(${propScale})`},g));return g;}
      const pathFrames=(peak=-36,turn=-8)=>[{opacity:0,transform:'translate(0px,0px) rotate(-5deg) scale(.95)',offset:0},{opacity:1,transform:'translate(0px,-5px) rotate(-2deg) scale(1)',offset:.16},{opacity:1,transform:`translate(${dx*.46}px,${clearClock(left.x+dx*.46,left.y-10+dy*.46+peak*propScale)-(left.y-10)}px) rotate(${turn}deg)`,offset:.46},{opacity:1,transform:`translate(${dx}px,${dy-5}px) rotate(3deg)`,offset:.74},{opacity:0,transform:`translate(${dx}px,${dy+5}px) rotate(0deg) scale(.97)`,offset:1}];
      const noteShape=(g,star=false)=>{svg('path',{d:'M-17-13H12L18-7V13H-17Z',class:star?'social-star-paper':'social-blue-paper'},g);svg('path',{d:'M12-13V-7H18M-11-6H4M-11 0H10M-11 6H-1',class:'social-paper-lines'},g);if(star)svg('path',{d:'M8-3L10 1 14 2 11 5 11 9 7 7 3 9 4 5 1 2 6 1Z',class:'social-star'},g);};
      if(plan.kind==='blueprint-pass'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        const paper=prop(left.x,left.y-10,'blueprint',g=>{noteShape(g);svg('path',{d:'M-8 7V-2L-3-6 3-2V7Z',class:'social-blueprint-sketch'},g);});animate(paper,pathFrames(-24,-7));nod(b,.74);
      }else if(plan.kind==='paperplane-nod'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        const plane=prop(left.x,left.y-12,'paperplane',g=>{svg('path',{d:'M-19 7L20-9 2 15-2 2Z',class:'social-plane'},g);svg('path',{d:'M-2 2L20-9',class:'social-paper-lines'},g);});
        animate(plane,[{opacity:0,transform:'translate(-3px,3px) rotate(-12deg)',offset:0},{opacity:1,transform:'translate(2px,-5px) rotate(-12deg)',offset:.16},{opacity:1,transform:`translate(${dx*.55}px,${clearClock(left.x+dx*.55,left.y-12+dy*.55-65*propScale)-(left.y-12)}px) rotate(7deg)`,offset:.45},{opacity:1,transform:`translate(${dx}px,${dy-14}px) rotate(18deg)`,offset:.72},{opacity:0,transform:`translate(${dx+8}px,${dy-2}px) rotate(25deg)`,offset:1}]);nod(b,.78);nod(a,.82);
      }else if(plan.kind==='magnet-puzzle'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        const puzzle=(x,y,fill,side)=>prop(x,y,'magnet-'+side,g=>svg('path',{d:side==='left'?'M-15-13H1V-6Q11-10 11-1Q11 8 1 4V13H-15Z':'M15-13H-1V-6Q9-10 9-1Q9 8-1 4V13H15Z',fill,class:'social-magnet'},g));
        const l=puzzle(left.x,left.y-10,'#cc8f64','left'),r=puzzle(right.x,right.y-10,'#718f9e','right'),joinY=Math.min(left.y,right.y)-44*propScale;
        for(const[g,p,off]of[[l,left,-9],[r,right,9]])animate(g,[{opacity:0,transform:'translateY(4px) rotate(-6deg)',offset:0},{opacity:1,offset:.2},{opacity:1,transform:`translate(${mid.x-p.x+off}px,${joinY-p.y}px) rotate(0deg)`,offset:.55},{opacity:1,transform:`translate(${mid.x-p.x+off}px,${joinY-p.y-4}px) rotate(0deg)`,offset:.75},{opacity:0,transform:`translate(${mid.x-p.x+off}px,${joinY-p.y+3}px)`,offset:1}]);nod(a,.76);nod(b,.76);
      }else if(plan.kind==='tea-toast'){
        const cup=(p,side)=>prop(p.x,p.y-10,'teacup-'+side,g=>{svg('path',{d:'M-11-8H9L7 8H-8ZM9-5Q20-7 17 1Q14 5 8 3',class:'social-cup'},g);svg('path',{d:'M-6-13Q-10-18-5-22M3-13Q-1-18 4-22',class:'social-steam'},g);svg('path',{d:'M-14 10H13',class:'social-paper-lines'},g);});
        for(const[g,side]of[[cup(left,'left'),1],[cup(right,'right'),-1]])animate(g,[{opacity:0,transform:'translateY(5px)',offset:0},{opacity:1,transform:`translate(${side*8}px,-18px) rotate(${side*9}deg)`,offset:.28},{opacity:1,transform:`translate(${side*13}px,-23px) rotate(${side*12}deg)`,offset:.48},{opacity:1,transform:'translateY(-5px) rotate(0deg)',offset:.78},{opacity:0,transform:'translateY(5px)',offset:1}]);
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);nod(a,.55);nod(b,.6);
      }else if(plan.kind==='pastry-pass'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        const tray=prop(left.x,left.y-10,'pastry',g=>{svg('ellipse',{cx:0,cy:7,rx:24,ry:6,class:'social-plate'},g);svg('path',{d:'M-14 5V-4Q-9-15 0-7Q9-15 14-4V5Z',class:'social-pastry'},g);svg('path',{d:'M-8-1L-3 2M3-1L8 2',class:'social-paper-lines'},g);});animate(tray,pathFrames(-12,4));nod(b,.8);
      }else if(plan.kind==='chime-duet'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        for(const[p,index]of[[left,0],[right,1]]){
          const chime=prop(p.x,p.y-31,'chime-'+index,g=>{svg('path',{d:'M0-22V-14M-13 2Q-12-18 0-15Q12-18 13 2ZM0 2V16',class:'social-chime'},g);svg('path',{d:'M-4 16H5V30H-4Z',class:'social-chime-card'},g);});
          animate(chime,[{opacity:0,transform:'rotate(0deg)',offset:0},{opacity:1,transform:'rotate(0deg)',offset:.14+index*.22},{opacity:1,transform:`rotate(${index?-13:15}deg)`,offset:.26+index*.22},{opacity:1,transform:`rotate(${index?8:-8}deg)`,offset:.48+index*.22},{opacity:0,transform:'rotate(0deg)',offset:1}]);
        }
        const note=prop(left.x,left.y-10,'chime-answer',g=>{const n=svg('text',{x:0,y:0,class:'social-music-note'},g);n.textContent='♪';});animate(note,pathFrames(-36,0));nod(a,.58);nod(b,.82);
      }else if(plan.kind==='star-link'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        const constellation=at(mid.x,clearClock(mid.x,Math.max(100,Math.min(left.y,right.y)-43*propScale)),'social-constellation'),base=svg('g',{transform:`scale(${propScale})`},constellation),segments=[[-49,7,-20,-17],[-20,-17,10,1],[10,1,39,-18],[39,-18,60,9]];
        segments.forEach(([x1,y1,x2,y2],index)=>{const s=svg('path',{d:`M${x1} ${y1}L${x2} ${y2}`,class:'social-star-line'},base);animate(s,[{opacity:0,offset:0},{opacity:0,offset:.12+index*.11},{opacity:.95,offset:.25+index*.11},{opacity:.95,offset:.83},{opacity:0,offset:1}],EASE_OUT);});
        for(const[x,y]of[[-49,7],[-20,-17],[10,1],[39,-18],[60,9]]){const star=svg('path',{d:`M${x-4} ${y}H${x+4}M${x} ${y-4}V${y+4}`,class:'social-star-point'},base);animate(star,[{opacity:0,offset:0},{opacity:1,offset:.4},{opacity:.7,offset:.8},{opacity:0,offset:1}],EASE_OUT);}nod(a,.7,true);nod(b,.76,true);
      }else if(plan.kind==='star-note'){
        hand(a,left,'sender',give);hand(b,right,'receiver',receive);
        const note=prop(left.x,left.y-11,'star-note',g=>noteShape(g,true));animate(note,pathFrames(-58,16));nod(a,.78,true);nod(b,.74);
      }else if(plan.kind==='meteor-gaze'){
        const y=clearClock(mid.x,Math.max(100,Math.min(left.y,right.y)-85*propScale)),sky=at(mid.x-95*propScale,y,'social-meteor-anchor'),meteor=svg('g',{class:'social-meteor'},sky),meteorShape=svg('g',{transform:`scale(${propScale})`},meteor);
        svg('path',{d:'M-55-12L2 0',class:'social-meteor-tail'},meteorShape);svg('path',{d:'M-7 0L0-7 7 0 0 7Z',class:'social-star'},meteorShape);
        animate(meteor,[{opacity:0,transform:`translate(${-20*propScale}px,${-16*propScale}px)`,offset:0},{opacity:0,transform:`translate(${-20*propScale}px,${-16*propScale}px)`,offset:.2},{opacity:1,transform:`translate(${22*propScale}px,${-8*propScale}px)`,offset:.35},{opacity:1,transform:`translate(${154*propScale}px,${23*propScale}px)`,offset:.61},{opacity:0,transform:`translate(${210*propScale}px,${40*propScale}px)`,offset:.8},{opacity:0,offset:1}]);
        for(const[actor,p,side]of[[a,left,1],[b,right,-1]])hand(actor,p,side===1?'sender':'receiver',[{opacity:0,transform:'translateY(3px)',offset:0},{opacity:1,transform:`translate(${side*4}px,-20px) rotate(${side*22}deg)`,offset:.28},{opacity:1,transform:`translate(${side*7}px,-27px) rotate(${side*12}deg)`,offset:.67},{opacity:0,transform:'translateY(3px)',offset:1}]);nod(a,.38,true);nod(b,.38,true);
      }
      const room=world.getBoundingClientRect();
      current={token:plan.token,node,animations,anchors:pair.map(actor=>({id:actor.id,...actor.anchor})),worldWidth:room.width,worldHeight:room.height,kind:plan.kind};
      const token=plan.token;
      Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{if(current?.token!==token)return;current.node.remove();current=null;scheduler.finish(token);if(frame){view.cancelAnimationFrame(frame);frame=0;}});
      frame=view.requestAnimationFrame(guard);
    }
    function start(request){if(destroyed||outgoing)return false;const actors=cast(),ctx=context(),plan=scheduler.plan(actors,ctx,request);if(!plan)return false;try{build(plan,actors,ctx);return true;}catch(error){cancel();throw error;}}
    function update(){if(destroyed)return;if(quiet(context())){if(current||outgoing)cancel(true);return;}if(current){const actors=cast(new Set(current.anchors.map(actor=>actor.id)));if(!scheduler.valid(actors,context())||!sameGeometry(actors))cancel();}}
    function tick(){update();if(!current)start({manual:false});}
    function trigger(request={}){update();return start({...request,manual:true});}
    function destroy(){if(destroyed)return;destroyed=true;cancel(true);}
    return Object.freeze({update,tick,trigger,destroy,state:()=>({destroyed,exiting:outgoing?{kind:outgoing.kind,token:outgoing.token}:null,active:current?{kind:current.kind,token:current.token,ids:current.anchors.map(actor=>actor.id)}:null,...scheduler.state()})});
  }
  root.OfficeAgentSocial=Object.freeze({create});
})(typeof globalThis==='object'?globalThis:this);
