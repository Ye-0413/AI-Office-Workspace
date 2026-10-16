/* A decorative guest lives outside the observed-session roster. */
(function(root){
  'use strict';
  root.OfficeIdleVisitor={create({layer,world,context,openDoor}){
    const Scene=root.OfficeScene,Model=root.OfficeVisitorModel,Dialogue=root.OfficeVisitorDialogue;
    const director=Model.createVisitor();
    const quotes=Model.createShuffleBag(Dialogue.entries);
    const names=[['栗子','Chestnut'],['糯米','Mochi'],['布丁','Pudding'],['小苔','Moss'],['汤圆','Dumpling'],['豆包','Beanbun'],['松果','Pinecone'],['饼干','Biscuit']];
    let guest=null,disposed=false,lastContext=null,poseNonce=0;
    const make=(tag,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;return el;};
    const transform=p=>'translate3d('+(p.x*12.8)+'px,'+(p.y*7.2)+'px,0) scale('+((.76+p.y/500)*.88)+')';
    function pose(name,replay=false){if(!guest)return;const c=lastContext,quiet=c.reducedMotion||c.lowPower||c.hidden;const asset=quiet?'clawd-static-base.svg':name;guest.wantedPose=name;if(guest.asset===asset&&(!replay||quiet))return;guest.asset=asset;guest.image.dataset.asset=asset;guest.image.src='../assets/avatars/'+asset+(replay&&!quiet?'?_t='+(++poseNonce):'');}
    function stopMotion(){if(!guest?.motion)return;const matrix=new DOMMatrixReadOnly(getComputedStyle(guest.node).transform);guest.point={x:matrix.m41/12.8,y:matrix.m42/7.2};guest.node.style.transform=transform(guest.point);guest.motion.cancel();guest.motion=null;guest.node.dataset.walking='false';}
    function clearProps(){for(const prop of world.querySelectorAll('[data-visitor-active]'))delete prop.dataset.visitorActive;}
    function remove(){if(!guest)return;stopMotion();clearTimeout(guest.bubbleTimer);guest.node.remove();guest=null;clearProps();world.dataset.visitor='false';}
    function copy(){if(!guest)return;const en=lastContext.language==='en';guest.title.textContent=guest.name[en?1:0];guest.badge.textContent=en?'VISITOR':'串门访客';guest.state.textContent=guest.leaving?(en?'Heading out':'下次再来'):en?'Just visiting':'随便逛逛';guest.button.setAttribute('aria-label',(en?'Decorative visitor ':'装饰访客 ')+guest.title.textContent+(en?'; click to say hello':'；点击打招呼'));if(guest.quote)guest.bubble.textContent=guest.quote[en?'en':'zh'];}
    function speak(zone){if(!guest||guest.leaving||lastContext.hidden)return;const quote=quotes.next(item=>item.zone===zone);if(!quote)return;guest.quote=quote;copy();guest.bubble.dataset.quoteId=quote.id;guest.bubble.dataset.show='true';clearTimeout(guest.bubbleTimer);guest.bubbleTimer=setTimeout(()=>{if(guest)guest.bubble.dataset.show='false';},6500);}
    function create(){
      const node=make('div','visitor'),button=make('button','actor-button'),body=make('span','character-body'),image=make('img'),plate=make('span','nameplate'),title=make('span','actor-title'),badge=make('span','visitor-badge'),state=make('span','actor-state'),bubble=make('span','actor-bubble'),trinket=make('span','visitor-trinket');
      button.type='button';image.alt='';image.draggable=false;bubble.setAttribute('aria-hidden','true');trinket.setAttribute('aria-hidden','true');
      body.append(image);plate.append(title,badge,state);button.append(body,plate,bubble,trinket);node.append(make('span','actor-shadow'),button);layer.append(node);
      guest={node,button,image,title,badge,state,bubble,trinket,name:names[Math.floor(Math.random()*names.length)],point:{x:Scene.ZONES.exit.x,y:Scene.ZONES.exit.y},motion:null,generation:-1,stopSerial:-1,bubbleTimer:0,quote:null,asset:'',wantedPose:'clawd-mini-peek.svg',leaving:false,lastHello:0};
      node.style.transform=transform(guest.point);world.dataset.visitor='true';copy();pose('clawd-mini-peek.svg');openDoor();
      image.addEventListener('error',()=>{if(guest&&guest.asset!=='clawd-static-base.svg')pose('clawd-static-base.svg');});
      button.addEventListener('click',()=>{if(!guest||guest.leaving||Date.now()-guest.lastHello<3000)return;guest.lastHello=Date.now();speak(guest.stop?.zone||'door');if(!guest.motion)pose('clawd-mini-happy.svg',true);});
    }
    async function travel(target,generation,stopSerial,leaving){
      stopMotion();const current=guest;if(!current)return;
      const path=Scene.route(current.point,target),length=path.slice(1).reduce((sum,p,i)=>sum+Scene.distance(path[i],p),0);
      const finish=()=>{if(guest!==current||current.generation!==generation||current.stopSerial!==stopSerial)return false;current.point={x:target.x,y:target.y};current.node.style.transform=transform(current.point);current.node.style.zIndex=String(Math.round(target.y*10));current.node.dataset.walking='false';return true;};
      if(!lastContext.reducedMotion&&length>.65&&path.length>1){
        let traveled=0;const frames=path.map((point,index)=>{if(index)traveled+=Scene.distance(path[index-1],point);return{transform:transform(point),offset:traveled/length};});
        current.node.dataset.walking='true';pose('clawd-static-base.svg');
        const motion=current.node.animate(frames,{duration:Math.max(360,Math.min(leaving?2400:6000,length*(leaving?34:65))),easing:'linear',fill:'forwards'});current.motion=motion;
        if(lastContext.hidden)motion.pause();
        try{await motion.finished;}catch{return;}
        if(!finish())return;current.motion=null;motion.cancel();
      }else if(!finish())return;
      if(leaving){openDoor();remove();director.departed(generation);return;}
      director.arrived(stopSerial,generation);pose(current.stop.pose,Boolean(current.stop.easterEgg));current.trinket.textContent=current.stop.easterEgg?'✦':({book:'≡',coffee:'☕',plant:'❧',note:'✎',broom:'〰',star:'✦'})[current.stop.prop]||'';
      current.node.dataset.rare=String(Boolean(current.stop.easterEgg));
      const prop=world.querySelector('[data-zone-prop="'+current.stop.zone+'"]');if(prop)prop.dataset.visitorActive='true';
      speak(current.stop.zone);tick();
    }
    function tick(){
      if(disposed)return;const previous=lastContext;lastContext=context();const state=director.update(lastContext);
      if(state.phase==='absent'){remove();return;}
      if(!guest&&state.phase==='leaving'){director.departed(state.generation);return;}
      if(!guest)create();copy();
      // Hidden guests can leave without running an invisible route. A paused
      // departure must never retain a guest across a later real task.
      if(state.phase==='leaving'&&(lastContext.hidden||lastContext.mode!=='live'||lastContext.reducedMotion)){openDoor();remove();director.departed(state.generation);return;}
      if(state.phase==='leaving'){
        if(guest.leaving)return;guest.leaving=true;guest.generation=state.generation;guest.stopSerial=-1;guest.bubble.dataset.show='false';clearTimeout(guest.bubbleTimer);clearProps();copy();travel(Scene.ZONES.exit,state.generation,-1,true);return;
      }
      if(previous&&(previous.hidden!==lastContext.hidden||previous.reducedMotion!==lastContext.reducedMotion||previous.lowPower!==lastContext.lowPower)){
        if(guest.motion){if(lastContext.hidden)guest.motion.pause();else guest.motion.play();if(lastContext.reducedMotion){const target=guest.stop.point;stopMotion();travel(target,state.generation,state.stopSerial,false);}}
        else pose(guest.wantedPose);
        if(lastContext.hidden)guest.bubble.dataset.show='false';
      }
      if(state.stop&&guest.stopSerial!==state.stopSerial){guest.leaving=false;guest.generation=state.generation;guest.stopSerial=state.stopSerial;guest.stop=state.stop;guest.node.dataset.zone=state.stop.zone;guest.bubble.dataset.show='false';guest.trinket.textContent='';clearProps();travel(state.stop.point,state.generation,state.stopSerial,false);}
    }
    const timer=setInterval(tick,1000);
    return{tick,destroy(){disposed=true;clearInterval(timer);remove();director.clear();}};
  }};
})(window);
