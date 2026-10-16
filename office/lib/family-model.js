/* Presentation-only family graph. Missing parents and cycles remain inspectable. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeFamily=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const COLORS=Object.freeze(['#8aa883','#c49b66','#7f9db3','#b38aa4','#a7a563','#b98c78']);
  function color(id){let hash=2166136261;for(const c of String(id)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return COLORS[(hash>>>0)%COLORS.length];}
  function build(sessions){
    const byId=new Map(sessions.map(s=>[s.id,s]));
    const info=new Map();
    for(const s of sessions){
      const chain=[s.id],seen=new Set(chain);let cursor=s;
      while(cursor.parentId&&byId.has(cursor.parentId)&&!seen.has(cursor.parentId)){cursor=byId.get(cursor.parentId);chain.push(cursor.id);seen.add(cursor.id);}
      const cycle=Boolean(cursor.parentId&&seen.has(cursor.parentId));
      const rootId=cycle?chain.slice(chain.indexOf(cursor.parentId)).sort()[0]:cursor.id;
      info.set(s.id,{id:s.id,parentId:s.parentId||'',rootId,depth:chain.length-1,ancestors:chain.slice(1),color:color(rootId),children:0,descendants:0,cycle});
    }
    for(const s of sessions){const item=info.get(s.id);if(info.has(item.parentId))info.get(item.parentId).children++;for(const id of item.ancestors)info.get(id).descendants++;}
    const ordered=[],visited=new Set();
    function visit(s){if(visited.has(s.id))return;visited.add(s.id);ordered.push(s);for(const child of sessions)if(child.parentId===s.id)visit(child);}
    for(const s of sessions)if(!s.parentId||!byId.has(s.parentId))visit(s);
    for(const s of sessions)visit(s);
    return {info,byId,ordered};
  }
  return Object.freeze({build,color,COLORS});
});
