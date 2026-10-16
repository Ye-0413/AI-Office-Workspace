'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const F=require('../lib/festival-studies.js');

class SvgNode {
  constructor(tag,attrs={}){this.tagName=tag;this.attrs={...attrs};this.children=[];this.style={};this.textContent='';this.parentNode=null;}
  setAttribute(key,value){this.attrs[key]=String(value);}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  insertBefore(node,reference){if(node.parentNode){const at=node.parentNode.children.indexOf(node);node.parentNode.children.splice(at,1);}node.parentNode=this;this.children.splice(this.children.indexOf(reference),0,node);return node;}
}
const factory=(tag,attrs)=>new SvgNode(tag,attrs);
const walk=node=>[node,...node.children.flatMap(walk)];
const part=(art,name)=>walk(art.svg).find(node=>node.attrs['data-part']===name);
function picture(node,{structural=false}={}){
  const attrs=Object.fromEntries(Object.entries(node.attrs).filter(([key])=>!key.startsWith('data-')&&key!=='aria-hidden'&&key!=='focusable'&&(!structural||!['fill','stroke','opacity'].includes(key))));
  const style=structural?{}:Object.fromEntries(Object.entries(node.style).filter(([key])=>['transform','opacity'].includes(key)));
  return JSON.stringify({tag:node.tagName,attrs,style,text:node.textContent,children:node.children.map(child=>picture(child,{structural}))});
}
function advance(id,count=1){let state={step:0,open:false,selection:0};for(let i=0;i<count;i++)state=F.activate(id,state);return state;}
function numbers(frame){return frame.transform.match(/-?\d+(?:\.\d+)?/g).map(Number);}

test('30 independent manual studies make 43 themes with the core catalog',()=>{
  assert.equal(F.CATALOG.length,30);assert.equal(new Set(F.CATALOG.map(item=>item.id)).size,30);
  const core=require('../lib/festival-model.js');assert.equal(core.THEMES.length,43);
  for(const item of F.CATALOG){
    assert.ok(['spring','summer','autumn','winter'].includes(item.season));
    assert.ok(['festival','seasonal-study'].includes(item.kind));
    for(const key of ['nameZh','nameEn','actionZh','actionEn','detailZh','detailEn'])assert.ok(item[key]?.length>2,item.id+':'+key);
    assert.equal(core.resolve({theme:item.id,now:Date.parse('2026-10-17T12:00:00+08:00')}).reason,'manual');
    assert.deepEqual(item.source,{kind:'manual-art-study',calendar:false},'manual art attribution does not assert a verified holiday date');
    assert.ok(Object.isFrozen(item));
  }
  for(let month=1;month<=12;month++)assert.ok(!F.CATALOG.some(item=>item.id===core.automaticTheme(Date.UTC(2026,month-1,12,12)).id),'extensions never become automatic holiday dates');
});

test('all builds contain different real object structures and visible state mechanisms',()=>{
  const signatures=[];
  for(const {id}of F.CATALOG){
    const art=F.build(id,{svgNode:factory}),all=walk(art.svg);
    assert.equal(art.svg.attrs.viewBox,'0 0 120 110');assert.equal(art.primary.tagName,'g');assert.equal(art.primary.parentNode,art.svg);
    assert.ok(all.length>=12,id+' has detailed parts');assert.ok(all.some(node=>node.tagName==='path'),id+' has drawn objects');
    signatures.push(picture(art.svg,{structural:true}));
    let state={step:0,open:false,selection:0},seen=new Set([picture(art.svg)]),phases=new Set();
    for(let i=0;i<8;i++){
      state=F.activate(id,state);art.apply({...state,reducedMotion:true});
      seen.add(picture(art.svg));phases.add(state.phase);
      assert.ok(state.statusZh&&state.statusEn);assert.equal(art.svg.attrs['data-phase'],state.phase);
      assert.ok(Number.isInteger(state.step)&&state.step>=0&&state.step<=5);
    }
    assert.ok(seen.size>=3,id+' has at least three visibly different configurations, ignoring all data attributes');
    assert.ok(phases.size>=3,id+' has multiple operating stages');
    const primary=art.primary,nodes=walk(art.svg),stable=picture(art.svg);
    art.apply({...state,reducedMotion:true});assert.equal(picture(art.svg),stable,id+' repeated state is idempotent');
    assert.equal(art.primary,primary);assert.deepEqual(walk(art.svg),nodes,id+' does not rebuild parts on an ordinary update');
  }
  assert.equal(new Set(signatures).size,30,'unique drawn geometry, not just a different title or palette');
});

test('mechanical regressions: objects move, connect, illuminate, fold and choose real positions',()=>{
  let art=F.build('dragonboat',{svgNode:factory}),before=part(art,'oar-0').style.transform;art.apply(advance('dragonboat'));assert.notEqual(part(art,'oar-0').style.transform,before);
  art=F.build('tanabata',{svgNode:factory});assert.equal(part(art,'bridge-span-0').attrs.opacity,'0.13');art.apply(advance('tanabata'));assert.equal(part(art,'bridge-span-0').attrs.opacity,'1');assert.equal(part(art,'bridge-span-1').attrs.opacity,'0.13');
  art=F.build('diwali',{svgNode:factory});art.apply(advance('diwali',3));assert.equal(part(art,'flame-2').attrs.opacity,'1');assert.equal(part(art,'flame-3').attrs.opacity,'0');
  art=F.build('stpatrick',{svgNode:factory});assert.equal(part(art,'leaf-240').attrs.opacity,'0.15');art.apply(advance('stpatrick',3));assert.equal(part(art,'leaf-240').attrs.opacity,'1');assert.equal(part(art,'green-ribbon-wreath').attrs.opacity,'1');assert.equal(walk(art.svg).filter(node=>/^leaf-\d+$/.test(node.attrs['data-part']||'')).length,3);
  art=F.build('thanksgiving',{svgNode:factory});art.apply(advance('thanksgiving',2));assert.match(part(art,'corn').style.transform,/34px/);assert.match(part(art,'pumpkin').style.transform,/34px/);assert.match(part(art,'apple').style.transform,/0px, 0px/);
  art=F.build('ocean',{svgNode:factory});before=part(art,'bottle-chart').style.transform;art.apply(advance('ocean',3));assert.notEqual(part(art,'bottle-chart').style.transform,before);assert.match(part(art,'bottle-chart').style.transform,/scale\(1\.6, 1\)/);
  art=F.build('sailing',{svgNode:factory});art.apply(advance('sailing',3));assert.equal(part(art,'paper-sheet').attrs.opacity,'0');assert.equal(part(art,'paper-hull').attrs.opacity,'1');assert.equal(part(art,'paper-sail').attrs.opacity,'1');
  art=F.build('chess',{svgNode:factory});const target=part(art,'knight-target');art.apply(advance('chess'));assert.match(part(art,'chess-knight').style.transform,/translate\(19px, -38px\)/);assert.equal(target.attrs.x,'79');assert.equal(target.attrs.y,'20');
  art=F.build('dawn',{svgNode:factory});art.apply(advance('dawn',3));assert.equal(part(art,'white-light-ray').attrs.opacity,'1');assert.equal(part(art,'split-spectrum').attrs.opacity,'1');
  art=F.build('nightmarket',{svgNode:factory});art.apply(advance('nightmarket',2));assert.equal(part(art,'stall-lantern-0').attrs.opacity,'1');assert.equal(part(art,'stall-lantern-1').attrs.opacity,'0');
});

test('each route provides at least 31 distinct continuous poses, bounded adjacent movement, and seamless endpoints',()=>{
  const signatures=[];
  for(const {id}of F.CATALOG){
    const frames=F.frames(id);assert.equal(frames.length,41);assert.equal(frames[0].offset,0);assert.equal(frames.at(-1).offset,1);
    assert.ok(new Set(frames.map(f=>f.transform+'|'+f.opacity)).size>=31,id+' has real continuous motion');
    assert.deepEqual(numbers(frames[0]),[0,0,0,1,1],id+' starts at current identity');
    assert.deepEqual(numbers(frames.at(-1)),[0,0,0,1,1],id+' settles at identity');
    for(let i=0;i<frames.length;i++){
      const f=frames[i],n=numbers(f);assert.equal(n.length,5);assert.ok(n.every(Number.isFinite));assert.equal(f.opacity,1);
      assert.ok(Math.abs(n[0])<=8&&Math.abs(n[1])<=8&&Math.abs(n[2])<=8&&n[3]>=.9&&n[3]<=1.1&&n[4]>=.9&&n[4]<=1.1,id+' stays in its miniature');
      if(i){const old=numbers(frames[i-1]);assert.ok(n.slice(0,3).every((value,k)=>Math.abs(value-old[k])<2),id+' has no jump between elapsed samples');assert.ok(f.offset>frames[i-1].offset);}
    }
    signatures.push(JSON.stringify(frames));assert.deepEqual(F.frames(id),frames,'no random clock or accumulated timers');
    assert.equal(F.frames(id,61).length,61,'elapsed sampling works beyond a fixed frame rate');
  }
  assert.equal(new Set(signatures).size,30,'every route has a different motion signature');
});

test('short inner transitions respect quiet settings and ordinary updates reuse every node',()=>{
  for(const {id}of F.CATALOG){
    const art=F.build(id,{svgNode:factory}),nodes=walk(art.svg),next=advance(id);
    art.apply(next);assert.ok(nodes.some(node=>String(node.style.transition).includes('520ms')),id+' interpolates actual inner parts');
    art.apply({...next,reducedMotion:true});assert.ok(nodes.filter(node=>node.style.transform!==undefined).every(node=>node.style.transition==='none'),id+' quiet completion is immediate');
    art.apply({...next,reducedMotion:false});assert.deepEqual(walk(art.svg),nodes);
    assert.ok(nodes.filter(node=>node.style.transform!==undefined).every(node=>node.style.transition==='none'),id+' normal metadata does not retroanimate a quiet completion before paint');
  }
});

test('state handling is bounded, deterministic, does not mutate callers and rejects unknown studies',()=>{
  for(const {id}of F.CATALOG){
    const previous=Object.freeze({step:0,open:false,selection:0});assert.deepEqual(F.activate(id,previous),F.activate(id,previous));assert.equal(previous.step,0);
    for(const step of [NaN,Infinity,-1,'2',Number.MAX_SAFE_INTEGER+1])assert.equal(F.activate(id,{step}).step,1);
    const art=F.build(id,{svgNode:factory});art.apply({step:Infinity});art.apply({step:Number.MAX_SAFE_INTEGER,reducedMotion:true});
  }
  for(const method of [()=>F.build('missing',{svgNode:factory}),()=>F.activate('missing'),()=>F.frames('missing')])assert.throws(method,TypeError);
  assert.throws(()=>F.build('dragonboat'),TypeError);
  for(const count of [0,1,122,Infinity,'41',41.5])assert.throws(()=>F.frames('dragonboat',count),RangeError);
});

test('browser UMD loads without timers, DOM globals, network or actor state access',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../lib/festival-studies.js'),'utf8'),context=vm.createContext({});vm.runInContext(code,context);
  assert.equal(context.OfficeFestivalStudies.CATALOG.length,30);
  const art=context.OfficeFestivalStudies.build('music',{svgNode:factory});art.apply(context.OfficeFestivalStudies.activate('music',{step:0}));
  assert.equal(art.svg.attrs['data-study'],'music');assert.equal(Object.keys(context).join(','),'OfficeFestivalStudies');
});
