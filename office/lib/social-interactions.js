/* Decorative studio interactions only; never provider messages or task facts. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeSocialInteractions=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const VENUES=Object.freeze(['workshop','teahouse','observatory']);
  const CATALOG=Object.freeze({
    workshop:Object.freeze([
      Object.freeze({id:'blueprint-pass',labelZh:'递一张小图纸',labelEn:'Pass a little blueprint',duration:2800}),
      Object.freeze({id:'paperplane-nod',labelZh:'纸飞机与点头',labelEn:'Paper plane and a nod',duration:3000}),
      Object.freeze({id:'magnet-puzzle',labelZh:'拼好一块磁贴',labelEn:'Fit two little magnets',duration:3000})]),
    teahouse:Object.freeze([
      Object.freeze({id:'tea-toast',labelZh:'遥遥互敬一盏茶',labelEn:'Raise a cup together',duration:3000}),
      Object.freeze({id:'pastry-pass',labelZh:'传一碟小茶点',labelEn:'Share a little pastry',duration:3000}),
      Object.freeze({id:'chime-duet',labelZh:'接续一声风铃',labelEn:'Answer a wind chime',duration:3200})]),
    observatory:Object.freeze([
      Object.freeze({id:'star-link',labelZh:'共绘一段星线',labelEn:'Sketch a constellation',duration:3200}),
      Object.freeze({id:'star-note',labelZh:'传一页星笺',labelEn:'Pass a star note',duration:3000}),
      Object.freeze({id:'meteor-gaze',labelZh:'一起抬头看流星',labelEn:'Watch a meteor together',duration:3200})])
  });
  const TYPES=Object.freeze({workshop:Object.freeze({blueprint:'blueprint-pass',circuit:'magnet-puzzle',bell:'paperplane-nod'}),teahouse:Object.freeze({tea:'tea-toast',windchime:'chime-duet',note:'pastry-pass'}),observatory:Object.freeze({starmap:'star-link',telescope:'meteor-gaze','meteor-note':'star-note'})});
  const LIMITS=Object.freeze({pairDistance:520,actorCooldown:18000,manualGap:1400,autoGap:24000,pairs:128,actors:256});
  const venueOf=context=>VENUES.includes(context?.venue)?context.venue:VENUES.includes(context?.scene)?context.scene:'workshop';
  const quiet=context=>!!(context?.hidden||context?.reducedMotion||context?.lowPower||context?.mode&&context.mode!=='live');
  function eligible(actor,context={}){
    const s=actor?.session;
    return !!(!quiet(context)&&actor&&typeof actor.id==='string'&&actor.id&&s&&typeof s==='object'&&s.provider
      &&actor.visible!==false&&!actor.entryPending&&!actor.stagedEntry&&!actor.motion&&!actor.walking&&!actor.departing&&!actor.completing&&!actor.holdingFamily&&!actor.reacting
      &&!['splitting','returning','absorbing'].includes(actor.clonePhase)
      &&!s.closed&&!s.disconnected&&!['stale','closed','waiting'].includes(s.status)&&!s.attention
      &&!['waiting-user','error'].includes(s.activity)&&!actor.spec?.stale
      &&actor.point&&Number.isFinite(actor.point.x)&&Number.isFinite(actor.point.y));
  }
  function activityKey(actor){const s=actor.session;return JSON.stringify([actor.id,s.provider,s.status,s.activity,s.turnId||'',s.parentId||'',Boolean(s.attention),Boolean(s.disconnected),Boolean(s.closed)]);}
  function rootFor(actor,byId){const visited=new Set();let current=actor;while(current?.session?.parentId&&!visited.has(current.id)){visited.add(current.id);const parent=current.session.parentId;if(!byId.has(parent))return parent;current=byId.get(parent);}return current?.id||actor.id;}
  function choosePair(actors,context={},blocked=new Set()){
    const cast=actors.filter(actor=>eligible(actor,context)&&!blocked.has(actor.id)).sort((a,b)=>a.id.localeCompare(b.id)),byId=new Map(actors.map(actor=>[actor.id,actor])),roots=new Map(cast.map(actor=>[actor.id,rootFor(actor,byId)]));let best=null;
    for(let i=0;i<cast.length;i++)for(let j=i+1;j<cast.length;j++){
      const a=cast[i],b=cast[j],distance=Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y);
      if(distance<24||distance>LIMITS.pairDistance)continue;
      const pair={actors:[a,b],family:roots.get(a.id)===roots.get(b.id),distance,key:JSON.stringify([a.id,b.id])};
      if(!best||Number(pair.family)>Number(best.family)||pair.family===best.family&&(pair.distance<best.distance||pair.distance===best.distance&&pair.key.localeCompare(best.key)<0))best=pair;
    }
    return best;
  }
  function createScheduler({now=Date.now,random=Math.random}={}){
    const bags=new Map(),lastKind=new Map(),actorTimes=new Map(),pairTimes=new Map();let active=null,serial=0,lastStart=-Infinity,nextAuto=null;
    const time=()=>{const n=Number(now());return Number.isFinite(n)?n:0;};
    const remember=(map,key,value,limit)=>{map.delete(key);map.set(key,value);while(map.size>limit)map.delete(map.keys().next().value);};
    function nextKind(venue,requested){
      if(CATALOG[venue].some(item=>item.id===requested)){lastKind.set(venue,requested);let bag=bags.get(venue);if(bag)bags.set(venue,bag.filter(id=>id!==requested));return requested;}
      let bag=bags.get(venue);
      if(!bag?.length){bag=CATALOG[venue].map(item=>item.id);for(let i=bag.length-1;i>0;i--){const n=Number(random()),j=Math.min(i,Math.max(0,Math.floor((Number.isFinite(n)?n:0)* (i+1))));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag[0]===lastKind.get(venue))[bag[0],bag[1]]=[bag[1],bag[0]];bags.set(venue,bag);}
      const kind=bag.shift();lastKind.set(venue,kind);return kind;
    }
    function plan(actors,context={},request={}){
      const at=time(),venue=venueOf(context),manual=request.manual===true;
      if(nextAuto===null)nextAuto=at+LIMITS.autoGap;
      if(active||quiet(context)||at-lastStart<LIMITS.manualGap||!manual&&at<nextAuto)return null;
      const blocked=new Set([...actorTimes].filter(([,last])=>at-last<LIMITS.actorCooldown).map(([id])=>id));
      const pair=choosePair(actors,context,manual?new Set():blocked);
      if(!pair)return null;
      if(!manual&&at-(pairTimes.get(pair.key)??-Infinity)<LIMITS.autoGap)return null;
      const mapped=request.venue&&request.venue!==venue?undefined:TYPES[venue][request.type],kind=nextKind(venue,request.kind||mapped),definition=CATALOG[venue].find(item=>item.id===kind);
      active={token:++serial,venue,kind,definition,ids:pair.actors.map(actor=>actor.id),keys:pair.actors.map(activityKey),startedAt:at,endsAt:at+definition.duration};
      lastStart=at;nextAuto=at+LIMITS.autoGap+Math.max(0,Math.min(1,Number(random())||0))*12000;
      for(const actor of pair.actors)remember(actorTimes,actor.id,at,LIMITS.actors);remember(pairTimes,pair.key,at,LIMITS.pairs);
      return {...active,ids:[...active.ids],keys:[...active.keys]};
    }
    function valid(actors,context={}){if(!active||quiet(context)||venueOf(context)!==active.venue)return false;const byId=new Map(actors.map(actor=>[actor.id,actor]));return active.ids.every((id,i)=>{const actor=byId.get(id);return eligible(actor,context)&&activityKey(actor)===active.keys[i];});}
    function cancel(){active=null;}
    function finish(token){if(active?.token!==token)return false;active=null;return true;}
    function state(){return {active:active?{token:active.token,venue:active.venue,kind:active.kind,ids:[...active.ids],startedAt:active.startedAt,endsAt:active.endsAt}:null,pairEntries:pairTimes.size,actorEntries:actorTimes.size,nextAuto};}
    return Object.freeze({plan,valid,cancel,finish,state});
  }
  return Object.freeze({VENUES,CATALOG,TYPES,LIMITS,venueOf,eligible,activityKey,choosePair,createScheduler});
});
