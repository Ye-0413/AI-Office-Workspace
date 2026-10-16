/* Presentation-only grouping. Real IDs and ancestry never depend on colours. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeFamily=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const COLORS=Object.freeze(['#6d9bdd','#5ab882','#9c7fdd','#dd6c8d','#a7c65d','#dfbf54','#59c2cd','#cf81ce']);
  const validId=value=>typeof value==='string'&&value.length>0;
  function hash(id){let result=2166136261;for(let i=0;i<String(id).length;i++)result=Math.imul(result^String(id).charCodeAt(i),16777619);return result>>>0;}
  function color(id){return COLORS[hash(id)%COLORS.length];}
  function lighten(hex,amount=.08){return '#'+hex.slice(1).match(/../g).map(channel=>Math.round(parseInt(channel,16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('');}

  // Established visible families keep their slots when new work arrives. A
  // returning family keeps its colour if free, otherwise takes a free slot.
  // More than eight concurrent families retain distinct numeric badges.
  function createPaletteRegistry({retentionLimit=4096}={}){
    const entries=new Map();let active=new Set(),serial=0;
    const limit=Number.isInteger(retentionLimit)&&retentionLimit>=8?retentionLimit:4096;
    function descriptor(entry){return Object.freeze({rootId:entry.id,color:COLORS[entry.index],bodyColor:COLORS[entry.index],helperColor:lighten(COLORS[entry.index]),paletteIndex:entry.index,badge:String(entry.serial).padStart(2,'0')});}
    function nextIndex(id,counts){
      const start=hash(id)%COLORS.length;
      for(let step=0;step<COLORS.length;step++){const index=(start+step)%COLORS.length;if(!counts[index])return index;}
      const minimum=Math.min(...counts);
      for(let step=0;step<COLORS.length;step++){const index=(start+step)%COLORS.length;if(counts[index]===minimum)return index;}
      return start;
    }
    function update(rootIds){
      const ids=[...new Set((Array.isArray(rootIds)?rootIds:[]).filter(validId))].sort();
      const prior=active;active=new Set(ids);
      const counts=COLORS.map(()=>0),pending=[];
      for(const id of ids.filter(id=>prior.has(id)).sort((a,b)=>(entries.get(a)?.serial||0)-(entries.get(b)?.serial||0))){
        const entry=entries.get(id);
        if(entry&&(!counts[entry.index]||ids.length>COLORS.length))counts[entry.index]++;
        else pending.push(id);
      }
      for(const id of ids)if(!prior.has(id))pending.push(id);
      for(const id of pending){
        let entry=entries.get(id);
        if(!entry){entry={id,index:0,serial:++serial};entries.set(id,entry);entry.index=nextIndex(id,counts);}
        else if(counts[entry.index])entry.index=nextIndex(id,counts);
        counts[entry.index]++;
      }
      if(entries.size>limit)for(const [id] of entries){if(entries.size<=limit)break;if(!active.has(id))entries.delete(id);}
      return api;
    }
    // Lookup is deliberately passive: closed history and filtered graph reads
    // cannot claim a visible slot. Only update() defines concurrent families.
    function forRoot(rootId){
      const id=String(rootId||'unresolved');
      if(!entries.has(id))entries.set(id,{id,index:hash(id)%COLORS.length,serial:++serial});
      const value=descriptor(entries.get(id));
      if(entries.size>limit)for(const [cached] of entries){if(entries.size<=limit)break;if(!active.has(cached))entries.delete(cached);}
      return value;
    }
    const api=Object.freeze({update,forRoot,get size(){return entries.size;}});
    return api;
  }

  function build(input,{registry}={}){
    const sessions=(Array.isArray(input)?input:[]).filter(s=>s&&validId(s.id));
    const byId=new Map(sessions.map(s=>[s.id,s]));
    const info=new Map();
    for(const s of sessions){
      const chain=[s.id],seen=new Set(chain);let cursor=s;
      while(cursor.parentId&&byId.has(cursor.parentId)&&!seen.has(cursor.parentId)){cursor=byId.get(cursor.parentId);chain.push(cursor.id);seen.add(cursor.id);}
      const cycle=Boolean(cursor.parentId&&seen.has(cursor.parentId));
      const rootId=cycle?chain.slice(chain.indexOf(cursor.parentId)).sort()[0]:cursor.id;
      info.set(s.id,{id:s.id,parentId:s.parentId||'',rootId,depth:chain.length-1,ancestors:chain.slice(1),color:color(rootId),children:0,descendants:0,cycle});
    }
    // The caller may have updated with a fuller clone ledger already. Do not
    // shrink that current set when building a filtered room or roster.
    if(registry)for(const item of info.values())Object.assign(item,registry.forRoot(item.rootId));
    for(const s of sessions){const item=info.get(s.id);if(info.has(item.parentId))info.get(item.parentId).children++;for(const id of item.ancestors)info.get(id).descendants++;}
    const ordered=[],visited=new Set();
    function visit(s){if(visited.has(s.id))return;visited.add(s.id);ordered.push(s);for(const child of sessions)if(child.parentId===s.id)visit(child);}
    for(const s of sessions)if(!s.parentId||!byId.has(s.parentId))visit(s);
    for(const s of sessions)visit(s);
    return {info,byId,ordered};
  }
  return Object.freeze({build,color,COLORS,lighten,createPaletteRegistry});
});
