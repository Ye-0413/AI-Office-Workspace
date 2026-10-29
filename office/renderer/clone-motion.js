/* Finite local clone choreography. Only the caller moves/fades real bodies. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeCloneMotion=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const EASE_OUT='cubic-bezier(.23,1,.32,1)',EASE_MOVE='cubic-bezier(.77,0,.175,1)';
  const DURATION=900,READY=Object.freeze({split:300,absorb:680});
  function burst({anchor,kind='split',ownerId='',reducedMotion=false,lowPower=false,hidden=false}={}){
    if(!anchor?.ownerDocument)throw new TypeError('A clone effect needs its actual scene anchor.');
    if(kind!=='split'&&kind!=='absorb')throw new TypeError('Unknown clone boundary.');
    const document=anchor.ownerDocument,view=document.defaultView;
    const room=anchor.closest?.('.office'),media=view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    const quiet=()=>reducedMotion||lowPower||hidden||document.hidden||media?.matches
      ||['reducedMotion','lowPower','hidden'].some(key=>room?.dataset[key]==='true');
    if(quiet()||anchor.isConnected===false)return Object.freeze({ready:Promise.resolve(true),finished:Promise.resolve(true),cancel(){}});
    let resolveReady,resolveFinished,readyDone=false,done=false,observer;
    const ready=new Promise(resolve=>{resolveReady=resolve;}),finished=new Promise(resolve=>{resolveFinished=resolve;});
    const node=document.createElement('span');node.className='clone-effect';node.dataset.cloneEffect=kind;node.dataset.ownerId=ownerId;node.setAttribute('aria-hidden','true');
    const motions=[];
    const settleReady=value=>{if(!readyDone){readyDone=true;resolveReady(value);}};
    function finish(value){
      if(done)return;done=true;settleReady(value);
      observer?.disconnect();document.removeEventListener?.('visibilitychange',guard);media?.removeEventListener?.('change',guard);
      for(const motion of motions)motion.cancel();node.remove();resolveFinished(value);
    }
    function cancel(){finish(false);}
    function guard(){if(quiet()||anchor.isConnected===false)cancel();}
    function part(name){const element=document.createElement('i');element.className=name;node.append(element);return element;}
    function run(element,frames,duration=DURATION,easing=EASE_MOVE){
      if(typeof element.animate!=='function')return null;
      const timed=frames.map((frame,index)=>index<frames.length-1?{easing,...frame}:frame);
      const motion=element.animate(timed,{duration,easing:'linear',fill:'both'});motions.push(motion);return motion;
    }
    let readyMotion;
    if(anchor.dataset?.bodyDesign==='ink'){
      node.className+=' clone-ink-effect';node.dataset.creatureEffect='ink';
      const puddle=part('clone-ink-puddle'),core=part('clone-ink-core');
      // The little core owns the same ready boundary as the legacy focus.
      // The puddle and droplets keep their own finite trailing phase.
      readyMotion=run(core,kind==='split'
        ?[{opacity:0,transform:'scale(.95,.9)'},{opacity:.9,transform:'scale(1.08,1.12)',offset:.64},{opacity:0,transform:'scale(1.14,.92)'}]
        :[{opacity:0,transform:'scale(1.08,.94)'},{opacity:.82,transform:'scale(1,1.12)',offset:.68},{opacity:0,transform:'scale(1.12,.92)'}],READY[kind],EASE_OUT);
      run(puddle,kind==='split'
        ?[{opacity:0,transform:'scale(.94,.9)'},{opacity:.88,transform:'scale(1.06,1.08)',offset:.22},{opacity:.84,transform:'scale(1.13,.96)',offset:.58},{opacity:0,transform:'scale(1.18,.9)'}]
        :[{opacity:0,transform:'scale(1.1,.92)'},{opacity:.7,transform:'scale(1.04,1)',offset:.2},{opacity:.94,transform:'scale(1.15,1.12)',offset:.72},{opacity:0,transform:'scale(1.06,.94)'}],DURATION,EASE_OUT);
      const drops=[[-53,-16,11],[-29,-40,14],[2,-51,9],[29,-38,13],[53,-15,10]];
      for(const [index,[x,y,size]]of drops.entries()){
        const drop=part('clone-ink-drop');drop.style.left=(-size/2)+'px';drop.style.top=(-12-size/2)+'px';drop.style.width=size+'px';drop.style.height=(size*1.22)+'px';
        const pose=(dx,dy,sx=1,sy=1,angle=0)=>`translate3d(${dx}px,${dy}px,0) rotate(${angle}deg) scale(${sx},${sy})`;
        const angle=x*.35,stagger=index*.012;
        run(drop,kind==='split'
          ?[{opacity:0,transform:pose(0,0,.95,.9)},{opacity:.84,transform:pose(x*.22,y*.25,.96,1.12,angle*.2),offset:.16+stagger},{opacity:.98,transform:pose(x*.82,y*.93,1.02,1.08,angle*.8),offset:.38+stagger},{opacity:.86,transform:pose(x,y,1.04,.95,angle),offset:.68},{opacity:0,transform:pose(x*.98,y+14,.96,.9,angle*.8)}]
          :[{opacity:0,transform:pose(x,y+4,.96,.9,angle)},{opacity:.94,transform:pose(x,y,.96,1.08,angle),offset:.14+stagger},{opacity:.98,transform:pose(x*.5,y*.6,.94,1.16,angle*.5),offset:.48+stagger},{opacity:.9,transform:pose(x*.06,-3,1.08,.82,0),offset:.72},{opacity:.24,transform:pose(0,0,1.13,.9),offset:.84},{opacity:0,transform:pose(0,2,1.04,.92)}]);
      }
    }else{
    const focus=part('clone-focus'),ring=part('clone-ring'),second=part('clone-ring clone-ring-inner');
    readyMotion=run(focus,kind==='split'
      ?[{opacity:0,transform:'scale(.95)'},{opacity:.7,transform:'scale(1)',offset:.65},{opacity:0,transform:'scale(1.04)'}]
      :[{opacity:0,transform:'scale(1.06)'},{opacity:.55,transform:'scale(1)',offset:.7},{opacity:.18,transform:'scale(.96)'}],READY[kind],EASE_OUT);
    const ringFrames=kind==='split'
      ?[{opacity:0,transform:'scale(.95) rotate(-8deg)'},{opacity:.55,transform:'scale(1) rotate(0deg)',offset:.24},{opacity:.7,transform:'scale(1.06) rotate(8deg)',offset:.42},{opacity:0,transform:'scale(1.17) rotate(19deg)'}]
      :[{opacity:0,transform:'scale(1.14) rotate(14deg)'},{opacity:.6,transform:'scale(1.08) rotate(8deg)',offset:.22},{opacity:.7,transform:'scale(.97) rotate(-5deg)',offset:.76},{opacity:0,transform:'scale(.94) rotate(-10deg)'}];
    run(ring,ringFrames);run(second,ringFrames.map(frame=>({...frame,opacity:(frame.opacity||0)*.65})),DURATION,EASE_OUT);
    for(let index=0;index<7;index++){
      const puff=part('clone-smoke'),side=index-3;
      puff.style.left=(-53+index*15)+'px';puff.style.top=(-65+Math.abs(side)*7)+'px';
      const inward=`translate3d(${-side*3}px,4px,0) scale(.95)`;
      const outward=`translate3d(${side*8}px,${-15-Math.abs(side)*3}px,0) scale(1.12)`;
      const delay=Math.abs(side)*.025;
      run(puff,kind==='split'
        ?[{opacity:0,transform:inward},{opacity:0,transform:inward,offset:.12+delay},{opacity:.64,transform:'translate3d(0px,-4px,0) scale(1)',offset:.34+delay},{opacity:.4,transform:outward,offset:.7},{opacity:0,transform:`translate3d(${side*10}px,-31px,0) scale(1.16)`}]
        :[{opacity:0,transform:outward},{opacity:.48,transform:outward,offset:.16+delay},{opacity:.62,transform:'translate3d(0px,-4px,0) scale(1)',offset:.56+delay},{opacity:.24,transform:inward,offset:.8},{opacity:0,transform:inward}]);
    }
    for(let index=0;index<4;index++){
      const curl=part('clone-curl');curl.style.left=(-45+index*28)+'px';curl.style.top=(-72+(index%2)*13)+'px';
      const side=index<2?-1:1,spread=`translate3d(${side*13}px,-11px,0) rotate(${side*24}deg)`;
      run(curl,kind==='split'
        ?[{opacity:0,transform:'translate3d(0px,3px,0) rotate(0deg)'},{opacity:.55,transform:'translate3d(0px,-3px,0) rotate(0deg)',offset:.3+index*.025},{opacity:.4,transform:spread,offset:.62},{opacity:0,transform:`translate3d(${side*19}px,-19px,0) rotate(${side*39}deg)`}]
        :[{opacity:0,transform:spread},{opacity:.48,transform:spread,offset:.24},{opacity:.6,transform:'translate3d(0px,0px,0) rotate(0deg)',offset:.64+index*.02},{opacity:0,transform:'translate3d(0px,4px,0) rotate(0deg)'}]);
    }
    for(let index=0;index<5;index++){
      const mote=part('clone-mote'),side=index-2;mote.style.left=(side*20)+'px';mote.style.top=(-38-Math.abs(side)*7)+'px';
      const out=`translate3d(${side*9}px,${-15-index*2}px,0) rotate(45deg)`;
      run(mote,kind==='split'
        ?[{opacity:0,transform:'translate3d(0px,4px,0) rotate(0deg)'},{opacity:0,offset:.3},{opacity:.7,transform:'translate3d(0px,0px,0) rotate(15deg)',offset:.46+index*.025},{opacity:0,transform:out}]
        :[{opacity:0,transform:out},{opacity:.6,transform:out,offset:.26+index*.02},{opacity:.7,transform:'translate3d(0px,0px,0) rotate(15deg)',offset:.74},{opacity:0,transform:'translate3d(0px,4px,0) rotate(0deg)'}],DURATION,EASE_OUT);
    }
    }
    anchor.append(node);
    document.addEventListener?.('visibilitychange',guard);media?.addEventListener?.('change',guard);
    if(typeof view?.MutationObserver==='function'){
      observer=new view.MutationObserver(guard);
      if(room)observer.observe(room,{attributes:true,attributeFilter:['data-reduced-motion','data-low-power','data-hidden']});
      if(document.body)observer.observe(document.body,{childList:true,subtree:true});
    }
    if(readyMotion)readyMotion.finished.then(()=>{if(!done)settleReady(true);},()=>finish(false));else settleReady(true);
    if(motions.length)Promise.all(motions.map(motion=>motion.finished)).then(()=>finish(true),()=>finish(false));else finish(true);
    return Object.freeze({ready,finished,cancel});
  }
  return Object.freeze({burst,DURATION,READY});
});
