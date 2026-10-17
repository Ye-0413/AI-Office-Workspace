'use strict';
// Pure Node: real renderer/model with a deterministic DOM/WAAPI boundary.
// No Electron, screenshots or media generation; native PNG claims stay pending.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Exporter=require('../scripts/render-social-previews.cjs'),Social=require('../lib/social-interactions.js'),Scene=require('../lib/scene-model.js');
const repo=path.resolve(__dirname,'../..'),production=fs.readFileSync(path.join(repo,'office/renderer/agent-social.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(group=Exporter.groups()[0]){
  const raf=new Map(),instances=[],allMotions=[],cards=new Map();let sequence=0,unsafeResource=false,foreignMotion=null;
  const style=()=>({setProperty(name,value){this[name]=String(value);}});
  class Node{
    constructor(tag){this.tagName=tag;this.ownerDocument=document;this.children=[];this.style=style();this.dataset={};this.attrs={};this.className='';this.animations=[];this.parentNode=null;this.connected=false;}
    get parentElement(){return this.parentNode;}
    get isConnected(){return this.connected||Boolean(this.parentNode?.isConnected);}
    append(...nodes){for(const n of nodes){this.children.push(n);n.parentNode=this;}}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    setAttribute(name,value){this.attrs[name]=String(value);if(name==='class')this.className=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
    get classList(){return{add:name=>{if(!this.className.split(' ').includes(name))this.className+=(this.className?' ':'')+name;}};}
    matches(selector){return selector[0]==='.'?this.className.split(' ').includes(selector.slice(1)):this.tagName===selector;}
    querySelectorAll(selector){return this.children.flatMap(n=>[...(selector.split(',').some(s=>n.matches(s.trim()))?[n]:[]),...n.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    contains(n){return this===n||this.children.some(c=>c.contains(n));}
    get outerHTML(){return JSON.stringify({tag:this.tagName,attrs:this.attrs,dataset:this.dataset,className:this.className,style:this.style,children:this.children.map(n=>n.outerHTML)});}
    getBoundingClientRect(){if(this.box)return this.box;if(this.className==='preview-capsule'){const x=parseFloat(this.parentNode.style.left),y=parseFloat(this.parentNode.style.top);return{left:x,top:y,x,y,width:154,height:129,right:x+154,bottom:y+129};}return{left:0,top:0,x:0,y:0,width:1280,height:720,right:1280,bottom:720};}
    animate(frames,options){const a=new Animation(this,frames,options);this.animations.push(a);allMotions.push(a);return a;}
    getAnimations({subtree=false}={}){const own=this.animations.filter(a=>!a.cancelled),result=[...own,...(subtree?this.children.flatMap(n=>n.getAnimations({subtree:true})):[])];if(this.className==='agent-social-vignette'&&foreignMotion)result.push(foreignMotion);return result;}
  }
  class Animation{
    constructor(target,frames,options){this.frames=frames;this.effect={target,getTiming:()=>({iterations:options.iterations??1,duration:options.duration})};this.playState='running';this.ready=Promise.resolve();this.value=0;this.writes=[];this.finished=new Promise((_resolve,reject)=>{this.reject=reject;});}
    pause(){this.playState='paused';}
    set currentTime(value){assert.equal(this.playState,'paused','sampling can seek only a paused prop');this.value=value;this.writes.push(value);}
    get currentTime(){return this.value;}
    cancel(){if(!this.cancelled){this.cancelled=true;this.playState='idle';this.reject(Error('cancelled'));}}
    opacity(){const values=this.frames.filter(f=>f.opacity!==undefined);if(!values.length)return null;const p=Math.max(0,Math.min(1,this.value/this.effect.getTiming().duration));return values[0].opacity+(values.at(-1).opacity-values[0].opacity)*p;}
  }
  const document={hidden:false,getElementById:id=>cards.get(id),createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag),querySelector:()=>unsafeResource?new Node('image'):null};
  const view={matchMedia:()=>({matches:false}),getComputedStyle:n=>({opacity:String(n.animations.filter(a=>!a.cancelled).map(a=>a.opacity()).filter(n=>n!==null).at(-1)??n.style.opacity??1),visibility:'visible',display:'block',getPropertyValue:key=>n.style[key]||''}),requestAnimationFrame:callback=>{const id=++sequence;raf.set(id,callback);return id;},cancelAnimationFrame:id=>raf.delete(id)};document.defaultView=view;
  for(const[index,card]of group.cards.entries()){
    const element=new Node('section'),clip=new Node('div'),world=new Node('div'),layer=new Node('div');element.connected=true;clip.className='preview-clip';clip.box={x:20+index%2*490,y:94+Math.floor(index/2)*290,width:470,height:215};world.className='preview-world';world.clientWidth=1280;world.clientHeight=720;layer.className='preview-props';element.append(clip);clip.append(world);world.append(layer);cards.set('card-'+card.id,element);
  }
  const timeline={};Object.defineProperty(timeline,'currentTime',{get:()=>1234,set:()=>assert.fail('document clock replacement is forbidden')});document.timeline=timeline;
  const context={...view,document,OfficeSocialInteractions:Social,OfficeScene:Scene};context.window=context;vm.createContext(context);vm.runInContext(production,context);
  const actual=context.OfficeAgentSocial;context.OfficeAgentSocial={create(options){const api=actual.create(options);instances.push({api,options});return api;}};
  const runtime=vm.runInContext('('+Exporter.previewRuntime.toString()+')',context)(plain(group));
  async function frame(ms){const pending=runtime.frame(ms);for(let i=0;i<5;i++)await Promise.resolve();const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn(1234));return pending;}
  return{runtime,frame,instances,allMotions,cards,context,timeline,raf,setUnsafe:()=>{unsafeResource=true;},setForeign:motion=>{foreignMotion=motion;}};
}

test('catalog comes from actual dynamic production definitions and binds every rendering source',()=>{
  const groups=Exporter.groups();assert.deepEqual(groups.map(g=>g.venue),Social.VENUES);assert.equal(groups.flatMap(g=>g.cards).length,12);assert.ok(groups.every(g=>g.cards.length===4));
  for(const group of groups)assert.deepEqual(group.cards.map(c=>({id:c.id,duration:c.duration})),Social.CATALOG[group.venue].map(c=>({id:c.id,duration:c.duration})));
  assert.deepEqual(Exporter.SETTINGS,{fps:48,frames:168,width:1000,height:720,minimumDistinctFrames:31});
  for(const source of ['office/lib/social-interactions.js','office/renderer/agent-social.js','office/renderer/agent-social.css','office/scripts/render-social-previews.cjs'])assert.ok(Exporter.SOURCES.includes(source));
  for(const file of Exporter.SOURCES){assert.equal(path.isAbsolute(file),false);assert.ok(fs.statSync(path.join(repo,file)).isFile());}
});
test('nominal frame grid reports exact full-program transparent tails without claiming GIF timing precision',()=>{
  for(const [ms,first]of [[2800,135],[3000,144],[3200,154]]){const t=Exporter.samplingTiming(ms);assert.equal(t.durationMs,3500);assert.equal(t.firstStoppedFrame,first);assert.equal(t.firstStoppedFrameMs,first*1000/48);assert.equal(t.nominalStillTailMs,3500-ms);assert.equal(t.nominalFrameGridStillTailMs,3500-first*1000/48);assert.ok((first-1)*1000/48<ms);assert.ok(t.firstStoppedFrameMs>=ms);}
  const offGrid=Exporter.samplingTiming(3151);assert.equal(offGrid.firstStoppedFrame,152);assert.ok(offGrid.firstStoppedFrameMs>3151);assert.ok(offGrid.nominalFrameGridStillTailMs<offGrid.nominalStillTailMs);
  for(const bad of [0,-1,3501,NaN,Infinity])assert.throws(()=>Exporter.samplingTiming(bad));
});
function gif(delays){const header=Buffer.from('47494638396101000100800000000000ffffff','hex'),image=Buffer.from('2c0000000001000100000202440100','hex');return Buffer.concat([header,...delays.flatMap(delay=>{const gce=Buffer.from('21f9040000000000','hex');gce.writeUInt16LE(delay,4);return[gce,image];}),Buffer.from([0x3b])]);}
test('encoded GIF timing reads actual centisecond delays instead of rounding the nominal fps',()=>{
  const timing=Exporter.gifTiming(gif([3,4,3]));assert.deepEqual(timing,{width:1,height:1,frames:3,durationMs:100,frameDelaysMs:[30,40,30]});assert.throws(()=>Exporter.gifTiming(gif([0])));assert.throws(()=>Exporter.gifTiming(gif([3]).subarray(0,-2)));assert.throws(()=>Exporter.gifTiming(Buffer.from('not a gif file')));
});
test('public page uses only unchanged local modules and original static capsule shapes',()=>{
  for(const group of Exporter.groups()){const html=Exporter.markup(group),inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(inline.length,1);new vm.Script(inline[0][1]);assert.equal((html.match(/class="card"/g)||[]).length,group.cards.length);assert.ok(html.includes('不代表真实导航、身体接触或 IK'));assert.ok(html.includes('img-src \'none\''));assert.doesNotMatch(html,/<(?:img|image|use)\b|assets\/avatars|room-art|data:image|data:video/i);for(const file of Exporter.SOURCES.filter(f=>f.endsWith('.js')&&!f.includes('/scripts/')))assert.ok(html.includes(file));}
});
test('all168 elapsed samples run actual public choreography with fresh finite owners and identical static actors',async()=>{
  for(const group of Exporter.groups()){
    const h=fixture(group),actors=new Map(),previous=[];
    for(let frame=0;frame<168;frame++){
      const ms=frame*1000/48,reports=await h.frame(ms),fresh=h.instances.slice(-group.cards.length);assert.equal(reports.length,group.cards.length);
      for(const [index,instance]of fresh.entries()){
        const def=group.cards[index];assert.equal(reports[index].program,def.id);assert.equal(reports[index].transparentPropTail,ms>=def.duration);
        for(const[id,actor]of instance.options.getActors()){if(actors.has(id))assert.equal(actor,actors.get(id));else actors.set(id,actor);assert.equal(actor.node.getAnimations({subtree:true}).length,0);assert.equal(actor.serial,1);assert.equal(actor.session.provider,'offline-preview');}
        const motions=instance.options.layer.querySelector('.agent-social-vignette').getAnimations({subtree:true});assert.ok(motions.length>=4);assert.ok(motions.every(a=>a.effect.getTiming().iterations===1&&a.effect.getTiming().duration===def.duration));assert.ok(motions.every(a=>a.writes.length===1&&a.writes[0]===Math.min(ms,def.duration)));
      }
      assert.ok(previous.every(api=>api.state().destroyed),'old owners are destroyed instead of rewound');previous.push(...fresh.map(i=>i.api));assert.equal(h.timeline.currentTime,1234);
    }
    assert.equal(actors.size,group.cards.length*2);h.runtime.destroy();assert.ok(h.instances.every(i=>i.api.state().destroyed));assert.equal(h.raf.size,0);
  }
});
test('mutation, outside animation ownership and unexpected image resources fail closed without touching their clocks',async()=>{
  const mutation=fixture();await mutation.frame(0);const actor=[...mutation.instances[0].options.getActors().values()][0];actor.serial++;await assert.rejects(mutation.frame(100),/changed a mounted actor/);actor.serial--;mutation.runtime.destroy();
  const foreign=fixture(),outside={effect:{target:{},getTiming:()=>({iterations:1,duration:3000})},currentTime:777,pause(){assert.fail('outside clock must not be paused');}};foreign.setForeign(outside);await assert.rejects(foreign.frame(100),/outside or non-finite/);assert.equal(outside.currentTime,777);foreign.setForeign(null);foreign.runtime.destroy();
  const resource=fixture();resource.setUnsafe();await assert.rejects(resource.frame(0),/image references/);resource.runtime.destroy();
  const route=fixture();await route.frame(0);const walking=[...route.instances[0].options.getActors().values()][0];walking.navigation={kind:'station',target:{x:55,y:44}};await assert.rejects(route.frame(100),/changed a mounted actor/);delete walking.navigation;route.runtime.destroy();
});
test('invalid elapsed, actual hidden and reduced-motion contexts cannot produce normal-motion gallery evidence',async()=>{
  for(const value of [-1,3500,NaN,Infinity]){const h=fixture();await assert.rejects(h.frame(value),/Invalid social preview/);h.runtime.destroy();}
  const hidden=fixture();hidden.context.document.hidden=true;await assert.rejects(hidden.frame(0),/visible document/);hidden.runtime.destroy();
  const quiet=fixture();quiet.context.matchMedia=()=>({matches:true});await assert.rejects(quiet.frame(0),/normal motion/);quiet.runtime.destroy();
});
test('Electron direct-entry detection runs main once but Node or Electron imports remain inert',()=>{
  const filename=path.join(repo,'office/scripts/render-social-previews.cjs'),source=fs.readFileSync(filename,'utf8'),footer=source.slice(source.lastIndexOf('\nmodule.exports='));
  for(const [electron,direct,argv,expected]of [[true,false,filename,1],[false,true,filename,1],[false,false,filename,0],[true,false,path.join(repo,'office/test/other.cjs'),0],[true,false,undefined,0]]){
    const module={exports:{}},require=()=>assert.fail('entry check must not import Electron');require.main=direct?module:{};let calls=0;
    vm.runInNewContext(footer,{...Exporter,module,require,path,__filename:filename,process:{versions:electron?{electron:'41'}:{},argv:['runtime',argv]},main:()=>{calls++;return Promise.resolve();},console});assert.equal(calls,expected);
  }
});
