'use strict';
// Production controller, real Scene/physical-owner model, and a deterministic
// DOM/WAAPI boundary. These tests do not claim browser rendering or FPS.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js'),Social=require('../lib/social-interactions.js'),Layout=require('../lib/walking-layout.js');
const Venues=require('../lib/venue-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/station-arrival.js'),'utf8');
function fixture({venue='workshop',zone='library',activity,quiet=false}={}) {
  let time=1000,next=0;const raf=new Map(),motions=[];
  const settings={venue,theme:'spring',scale:1,mode:'live',reducedMotion:quiet,lowPower:false,hidden:false,fitting:false};
  const classes=n=>(n.attrs.class || '').split(/\s+/);
  class Node {
    constructor(tag){this.tagName=tag;this.attrs={};this.dataset={};this.style={};this.children=[];this.parentNode=null;this.ownerDocument=document;this.animations=[];this.classList={add:(...values)=>this.attrs.class=[...new Set([...classes(this),...values])].join(' ')};}
    get isConnected(){return this===world||Boolean(this.parentNode?.isConnected);}
    append(node){this.children.push(node);node.parentNode=this;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    setAttribute(key,value){this.attrs[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
    matches(selector){return selector.split(',').some(s=>{const parts=s.trim().split(/\s+/),part=parts.pop(),own=part[0]==='.'?classes(this).includes(part.slice(1)):this.tagName===part;if(!own)return false;if(!parts.length)return true;for(let p=this.parentNode;p;p=p.parentNode)if(p.matches(parts.join(' ')))return true;return false;});}
    querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
    getBoundingClientRect(){this.rectReads=(this.rectReads || 0)+1;return this.box || {left:0,top:0,right:1280,bottom:720,width:1280,height:720};}
    getAnimations({subtree=false}={}){return [...this.animations,...(subtree?this.children.flatMap(n=>n.getAnimations({subtree:true})):[])].filter(m=>m.playState!=='idle'&&m.playState!=='finished');}
    animate(frames,options){const motion=new Animation(this,frames,options);this.animations.push(motion);motions.push(motion);return motion;}
  }
  class Animation {
    constructor(target,frames,options){this.frames=frames;this.options=options;this.effect={target,getTiming:()=>options};this.playState='running';this.pending=false;this.start=time;this.hold=0;this.finished=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});}
    get currentTime(){return this.playState==='running'?time-this.start:this.hold;}
    set currentTime(at){this.hold=at;this.start=time-at;this.pending=false;}
    pause(){this.hold=this.currentTime;this.playState='paused';}
    cancel(){if(this.playState==='idle')return;this.playState='idle';this.reject(Error('cancelled'));}
    opacity(){const u=Math.min(1,this.currentTime/this.options.duration),frames=this.frames.filter(f=>f.opacity!==undefined);if(!frames.length)return null;const points=frames.map((f,i)=>({...f,offset:f.offset ?? i/(frames.length-1)}));let a=points[0],b=points.at(-1);for(let i=1;i<points.length;i++)if(u<=points[i].offset){a=points[i-1];b=points[i];break;}const p=b.offset===a.offset?1:(u-a.offset)/(b.offset-a.offset);return a.opacity+(b.opacity-a.opacity)*Math.max(0,Math.min(1,p));}
    step(){if(this.playState==='running'&&this.currentTime>=this.options.duration){this.hold=this.options.duration;this.playState='finished';this.resolve();}}
  }
  const document={hidden:false,createElementNS:(_ns,tag)=>new Node(tag)};
  const view={performance:{now:()=>time},matchMedia:()=>({matches:false}),DOMMatrixReadOnly:function(transform){const v=/matrix\(([^)]+)\)/.exec(transform)?.[1].split(',').map(Number);if(!v)throw Error('invalid transform');Object.assign(this,{m11:v[0],m12:v[1],m41:v[4],m42:v[5]});},getComputedStyle(node){const latest=node.animations.filter(m=>m.playState!=='idle').map(m=>m.opacity()).filter(n=>n!==null).at(-1);return {transform:node.style.transform || 'matrix(1,0,0,1,0,0)',opacity:String(latest ?? node.style.opacity ?? (classes(node).includes('station-arrival')?0:1)),visibility:node.style.visibility || 'visible',display:node.style.display || 'block'};},requestAnimationFrame:cb=>{const id=++next;raf.set(id,cb);return id;},cancelAnimationFrame:id=>raf.delete(id)};
  document.defaultView=view;
  const world=new Node('world'),layer=new Node('layer');world.append(layer);
  const actors=new Map(),ctx={OfficeScene:Scene,OfficeWalkingLayout:Layout,OfficeSocialInteractions:Social};vm.createContext(ctx);vm.runInContext(source,ctx);
  function actor(id='codex:test',z=zone,a=activity){
    const positions={library:{x:19,y:44},board:{x:50,y:44},desk:{x:42,y:70},bench:{x:81,y:44}},position={...positions[z]};
    const node=new Node('actor'),body=new Node('body'),plate=new Node('plate');body.classList.add('character-body');plate.classList.add('nameplate');node.append(body);node.append(plate);world.append(node);
    node.style.transform=`matrix(1,0,0,1,${position.x*12.8},${position.y*7.2})`;
    const b=Scene.actorBounds(position,{uniformScale:1});body.box={left:b.left,right:b.right,top:b.top,bottom:position.y*7.2,width:b.right-b.left,height:position.y*7.2-b.top};plate.box={left:b.left,right:b.right,top:position.y*7.2,bottom:b.bottom,width:b.right-b.left,height:b.bottom-position.y*7.2};
    const row={id,serial:1,session:{id,provider:'codex',status:'active',activity:a || {library:'reading',board:'planning',desk:'coding',bench:'testing'}[z]},node,body,position,target:{...position,zone:z}};actors.set(id,row);return row;
  }
  const original=actor(),api=ctx.OfficeStationArrival.create({layer,world,getActors:()=>actors,getContext:()=>settings});
  const event=(row=original,kind='entry',zoneName=row.target.zone)=>({actor:row,actorId:row.id,serial:row.serial,kind,zone:zoneName,position:{...row.position}});
  function step(ms){time+=ms;for(const motion of motions)motion.step();const callbacks=[...raf.values()];raf.clear();callbacks.forEach(cb=>cb(time));}
  return {api,actor:original,makeActor:actor,actors,event,settings,layer,world,document,motions,view,step,raf,Node,Animation,get time(){return time;},programs:ctx.OfficeStationArrival.PROGRAMS};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const box=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
function roomPart(f,tag,classes,bounds,parent=f.world){const n=new f.Node(tag);n.classList.add(...classes.split(' '));n.box=bounds;parent.append(n);return n;}
function actualReadingEndpoint(f){
  const position={x:10,y:40.9};f.actor.position=position;f.actor.target={...position,zone:'library'};f.actor.node.style.transform=`matrix(1,0,0,1,${position.x*12.8},${position.y*7.2})`;
  const r=Scene.actorBounds(position,{uniformScale:1}),x=position.x*12.8,y=position.y*7.2;
  // Body and wider label are separate real-painted boxes; combining their
  // empty corners would falsely block the shelf before the existing plant.
  f.actor.body.box=box(x-40,y-100,x+40,y);f.actor.node.children[1].box=box(r.left,y,r.right,r.bottom);
}

test('twelve original furniture programs are finite, distinct and do not edit real actor nodes or state',()=>{
  const signatures=new Set();
  for(const venue of ['workshop','teahouse','observatory'])for(const zone of ['library','board','desk','bench']){
    const f=fixture({venue,zone}),snapshot=()=>JSON.stringify({session:f.actor.session,serial:f.actor.serial,position:f.actor.position,target:f.actor.target,style:f.actor.node.style,dataset:f.actor.node.dataset}),before=snapshot(),children=f.actor.node.children.slice();
    assert.equal(f.api.arrive(f.event()),true,venue+'/'+zone);
    const state=f.api.state();assert.equal(state.started,1);assert.equal(state.pending,0);assert.equal(state.active[0].program,f.programs[venue][zone]);
    const cue=f.layer.children[0],serialize=n=>({tag:n.tagName,attrs:Object.fromEntries(Object.entries(n.attrs).filter(([key])=>!key.startsWith('data-'))),children:n.children.map(serialize)});
    signatures.add(JSON.stringify({geometry:serialize(cue),motion:f.motions.map(m=>m.frames)}));
    assert.ok(f.motions.some(m=>new Set(m.frames.map(frame=>frame.transform).filter(Boolean)).size>=2),'every program moves a real authored part');assert.ok(f.motions.every(m=>m.options.duration===1400));
    assert.equal(f.actor.node.children.length,children.length);assert.equal(f.actor.node.children[0],children[0]);
    assert.equal(snapshot(),before,'controller cannot modify the real actor/session');
    f.step(1401);assert.equal(f.api.state().active.length,0);assert.equal(f.raf.size,0);f.api.destroy();
  }
  assert.equal(signatures.size,12);
});

test('old identities, serials, route owners and mismatched actual work endpoints cannot produce cues',()=>{
  for(const change of [
    f=>f.actors.set(f.actor.id,{...f.actor}),
    f=>{f.actor.serial++;},
    f=>{f.actor.motion={};},
    f=>{f.actor.routeReservation={token:2,serial:1};},
    f=>{f.actor.resumeNavigation={kind:'station',target:{x:42,y:70}};},
    f=>{f.actor.pendingStation={seat:{x:42,y:70},due:1200};},
    f=>{f.actor.yielding=true;},
    f=>{f.actor.holdingFamily=true;},
    f=>{f.actor.session.activity='coding';},
    f=>{f.actor.position={x:80,y:80};},
    f=>{f.actor.target={x:21,y:44,zone:'library'};},
    f=>{f.actor.node.style.transform='matrix(1,0,0,1,1,1)';}
  ]){const f=fixture(),e=f.event();change(f);assert.equal(f.api.arrive(e),false);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);}
});

test('only active entry or station work evidence is consumed, including a verified stage seat',()=>{
  for(const kind of ['return','exit','holding','restore','unknown']){const f=fixture();assert.equal(f.api.arrive(f.event(f.actor,kind)),false);}
  for(const value of [{status:'idle'},{status:'stale'},{status:'closed'},{activity:'unknown'},{activity:'waiting-user'},{activity:'error'},{attention:true},{disconnected:true}]){const f=fixture();Object.assign(f.actor.session,value);assert.equal(f.api.arrive(f.event()),false);}
  const f=fixture();assert.equal(f.api.arrive(f.event(f.actor,'station','stage')),true);
});

test('only the current finite joint bridge can delay a cue, bounded to 240ms with no hidden prop or late replay',()=>{
  const f=fixture(),joint=new f.Node('g');joint.classList.add('ap-foot');f.actor.body.append(joint);joint.animate([{transform:'none'},{transform:'none'}],{duration:180}).finished.catch(()=>{});
  assert.equal(f.api.arrive(f.event()),true);assert.equal(f.layer.children.length,0);assert.equal(f.api.state().pending,1);
  f.step(170);assert.equal(f.layer.children.length,0);f.step(15);assert.equal(f.api.state().started,1);
  f.api.destroy();
  const g=fixture(),slow=new g.Node('g');slow.classList.add('ap-arm');g.actor.body.append(slow);const motion=slow.animate([{transform:'none'},{transform:'none'}],{duration:180});motion.finished.catch(()=>{});motion.pause();motion.pending=true;
  assert.equal(g.api.arrive(g.event()),true);g.step(241);assert.equal(g.layer.children.length,0);assert.equal(g.api.state().pending,0);
  motion.pending=false;g.step(500);g.api.update();assert.equal(g.api.state().started,0);assert.equal(g.raf.size,0);
});

test('metadata and same-zone fit serial changes never replay arrival feedback, while real cross-zone work can',()=>{
  const f=fixture();assert.equal(f.api.arrive(f.event()),true);f.step(1500);
  f.actor.serial++;f.actor.session.title='metadata';assert.equal(f.api.arrive(f.event(f.actor,'station')),false);assert.equal(f.api.state().started,1);
  f.actor.serial++;f.actor.session.activity='planning';f.actor.position={x:50,y:44};f.actor.target={...f.actor.position,zone:'board'};f.actor.node.style.transform='matrix(1,0,0,1,640,316.8)';
  assert.equal(f.api.arrive(f.event(f.actor,'station')),true);assert.equal(f.api.state().started,2);
});

test('quiet arrivals are consumed without motion, queued replay, periodic work or user-state mutation',()=>{
  for(const setting of ['reducedMotion','lowPower','hidden','fitting']){
    const f=fixture();f.settings[setting]=true;assert.equal(f.api.arrive(f.event()),false);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
    f.settings[setting]=false;f.api.tick();assert.equal(f.api.state().started,0);
    if(setting!=='fitting')assert.equal(f.api.arrive(f.event()),false,'quiet evidence is never replayed after preferences change');
  }
});

test('activity, exact-owner and scene/scale changes fade from the composed alpha within 160ms, then stop all owned work',()=>{
  for(const change of [f=>{f.actor.session.activity='searching';},f=>{f.actor.serial++;},f=>{f.settings.venue='teahouse';},f=>{f.settings.theme='winter';},f=>{f.settings.artworkKey='workshop/winter';},f=>{f.actor.session.turnId='fresh-turn';},f=>{f.settings.scale=.65;},f=>{f.actor.motion={};}]){
    const f=fixture();f.api.arrive(f.event());f.step(500);const node=f.layer.children[0],alpha=Number(f.view.getComputedStyle(node).opacity),original=f.motions.slice();change(f);f.api.update();
    assert.equal(node.dataset.phase,'fading');const fade=f.motions.at(-1);assert.equal(fade.options.duration,160);assert.equal(fade.frames[0].opacity,alpha);assert.ok(original.filter(m=>m!==original[0]).every(m=>m.playState==='paused'));
    f.step(159);assert.equal(f.layer.children.length,1);f.step(2);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
  }
});

test('quiet, hidden and destroy immediately revoke only decorative owners and obsolete completions cannot recreate them',async()=>{
  for(const mode of ['lowPower','hidden','destroy']){
    const f=fixture();const external=f.actor.body.animate([{opacity:1},{opacity:1}],{duration:4000});external.finished.catch(()=>{});f.api.arrive(f.event());f.step(300);
    if(mode==='destroy')f.api.destroy();else{f.settings[mode]=true;f.api.update();}
    assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);assert.equal(external.playState,'running');
    f.step(2000);await Promise.resolve();assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
  }
});

test('station/global budgets and full-animation envelopes prevent clutter, clock overlap and occluded props without a queue',()=>{
  const f=fixture();f.api.arrive(f.event());const same=f.makeActor('codex:same');assert.equal(f.api.arrive(f.event(same)),false);assert.equal(f.api.state().pending,0);
  f.step(400);const second=f.makeActor('codex:second','bench');assert.equal(f.api.arrive(f.event(second)),true);f.step(400);const third=f.makeActor('codex:third','desk');assert.equal(f.api.arrive(f.event(third)),false);assert.equal(f.api.state().active.length,2);
  for(const cue of f.api.state().active)assert.ok(!Scene.CLOCK_RESERVED.some(r=>cue.bounds.left<r.right&&cue.bounds.right>r.left&&cue.bounds.top<r.bottom&&cue.bounds.bottom>r.top));
  f.step(2000);assert.equal(f.api.state().active.length,0);assert.equal(f.api.state().pending,0);assert.equal(f.api.state().started,2,'skipped third arrival never flashes later');
  const g=fixture();g.actor.body.box={left:0,top:0,right:1280,bottom:720,width:1280,height:720};assert.equal(g.api.arrive(g.event()),false);assert.equal(g.api.state().reasons.occluded,1);assert.equal(g.raf.size,0);
});


test('current walking areas accept an actual board-left endpoint which the legacy narrow band rejected',()=>{
  const f=fixture({zone:'board'}),p={x:29.05,y:48.2};
  assert.equal(Scene.stationCompatible(p,'board'),false,'the legacy station band is not the current physical layout contract');
  f.actor.position=p;f.actor.target={...p,zone:'stage',workZone:'board',area:'board-left'};f.actor.node.style.transform=`matrix(1,0,0,1,${p.x*12.8},${p.y*7.2})`;
  assert.equal(f.api.arrive(f.event(f.actor,'station','stage')),true);
  const g=fixture({zone:'board'});g.actor.target.workZone='library';assert.equal(g.api.arrive(g.event()),false,'a different target work zone cannot borrow stage permission');
});

test('running is true bench work while waiting-tool never becomes an arrival celebration',()=>{
  const f=fixture({zone:'bench',activity:'running'});assert.equal(f.api.arrive(f.event()),true);
  const g=fixture({zone:'bench',activity:'waiting-tool'});assert.equal(g.api.arrive(g.event()),false);
});

test('old raw reservation metadata is not a real physical lease and title/time heartbeats retain a cue',()=>{
  const f=fixture();f.actor.routeReservation={token:8,serial:0};f.actor.walkTiming={old:true};assert.equal(f.api.arrive(f.event()),true);
  f.step(300);f.actor.session.title='new metadata';f.actor.session.lastEventAt=12345;f.actor.session.turnCompletedAt=999;f.api.update();
  assert.equal(f.api.state().active[0].phase,'playing');assert.equal(f.api.state().started,1);
});


test('two live programs share one RAF and one full-cast geometry snapshot per update',()=>{
  const f=fixture();assert.equal(f.api.arrive(f.event()),true);f.step(400);const other=f.makeActor('codex:second-geometry','bench');assert.equal(f.api.arrive(f.event(other)),true);
  assert.equal(f.raf.size,1,'program count cannot create extra RAF loops');
  const worldReads=f.world.rectReads,bodyReads=[f.actor.body.rectReads,other.body.rectReads];
  f.api.update();assert.equal(f.world.rectReads-worldReads,1);
  assert.equal(f.actor.body.rectReads-bodyReads[0],1);assert.equal(other.body.rectReads-bodyReads[1],1);
  assert.equal(f.raf.size,1);
});

test('a pending bridge loses its exact owner without creating an SVG or a deferred after-effect',()=>{
  const f=fixture(),joint=new f.Node('g');joint.classList.add('ap-foot');f.actor.body.append(joint);joint.animate([{transform:'none'},{transform:'none'}],{duration:180}).finished.catch(()=>{});
  assert.equal(f.api.arrive(f.event()),true);f.actor.serial++;f.step(30);assert.equal(f.api.state().pending,0);assert.equal(f.layer.children.length,0);f.step(2000);assert.equal(f.api.state().started,0);assert.equal(f.raf.size,0);
});

test('the actual spring control composition cannot hide a reading cue behind its plant or captions',()=>{
  for(const venue of ['workshop','teahouse','observatory']){
    const f=fixture({venue});actualReadingEndpoint(f);
    const stage=roomPart(f,'div','festival-stage',box(0,0,1280,720));
    const control=roomPart(f,'button','festival-control',box(196,58,316,186),stage);
    roomPart(f,'svg','festival-art',box(196,58,316,168),control);
    roomPart(f,'span','festival-caption',box(215,169,297,186),control);
    const venueControl=roomPart(f,'button','venue-control',box(347,110,447,206));
    roomPart(f,'svg','',box(347,110,447,182),venueControl);
    roomPart(f,'span','venue-control-label',box(365,184,430,201),venueControl);
    assert.equal(f.api.arrive(f.event()),true,'a genuinely free library furniture surface should remain usable');
    const cue=f.api.state().active[0];
    // Independent, conservatively expanded whole-motion box. Its lower edge
    // includes the static caption as well as the authored rotating plant.
    assert.ok(!Scene.boundsOverlap(cue.bounds,box(156,10,356,200),3),venue+' must clear the whole existing festival object');
    assert.ok(!Scene.boundsOverlap(cue.bounds,box(323,86,471,206),3),venue+' must clear the existing venue object');
    assert.ok(cue.anchor.x>=180&&cue.anchor.x<=320&&cue.anchor.y>=215&&cue.anchor.y<=260,'fallback stays on the left library furniture, not another zone');
    assert.equal(f.raf.size,1);f.api.destroy();
  }
});

test('visible scene labels and readouts block cues, hidden ancestors do not, and transparent stages never block the room',()=>{
  for(const labelClass of ['festival-caption','venue-control-label','venue-readout','venue-note-text']){
    const f=fixture(),label=roomPart(f,'span',labelClass,box(0,0,1280,720));label.textContent='Visible room control';
    assert.equal(f.api.arrive(f.event()),false,labelClass+' must participate in the actual painted composition');assert.equal(f.api.state().reasons.occluded,1);assert.equal(f.raf.size,0);
  }
  for(const property of ['opacity','display','visibility']){
    const f=fixture(),stage=roomPart(f,'div','festival-stage',box(0,0,1280,720));
    stage.style[property]=({opacity:'0',display:'none',visibility:'hidden'})[property];roomPart(f,'svg','festival-art',box(0,0,1280,720),stage);
    assert.equal(f.api.arrive(f.event()),true,'hidden parent '+property+' does not invent an occluder');f.api.destroy();
  }
  const f=fixture();roomPart(f,'div','festival-stage',box(0,0,1280,720));roomPart(f,'div','venue-stage',box(0,0,1280,720));
  assert.equal(f.api.arrive(f.event()),true,'transparent inset stage boxes are never obstacles');f.api.destroy();
});

test('new higher scene art interrupts the finite prop from its actual alpha without relocation or later replay',()=>{
  const f=fixture();assert.equal(f.api.arrive(f.event()),true);f.step(400);
  const cue=f.api.state().active[0],node=f.layer.children[0],style={...node.style},alpha=Number(f.view.getComputedStyle(node).opacity);
  roomPart(f,'svg','festival-art',box(cue.bounds.left,cue.bounds.top,cue.bounds.right,cue.bounds.bottom));f.api.update();
  assert.equal(node.dataset.phase,'fading');assert.equal(node.style.left,style.left);assert.equal(node.style.top,style.top);assert.equal(f.motions.at(-1).frames[0].opacity,alpha);
  f.step(161);assert.equal(f.api.state().active.length,0);assert.equal(f.raf.size,0);f.step(3000);assert.equal(f.api.state().started,1);
});

test('all twelve programs retain a safe furniture mount beside the real catalog controls and spring viewport',()=>{
  for(const venue of Venues.CATALOG)for(const zone of ['library','board','desk','bench']){
    const f=fixture({venue:venue.id,zone});
    if(zone==='library')actualReadingEndpoint(f);
    else {const x=f.actor.position.x*12.8,y=f.actor.position.y*7.2;f.actor.body.box=box(x-40,y-100,x+40,y);}
    const stage=roomPart(f,'div','festival-stage',box(0,0,1280,720));
    roomPart(f,'svg','festival-art',box(196,58,316,168),stage);roomPart(f,'span','festival-caption',box(215,169,297,186),stage);
    for(const item of venue.interactions){
      const x=item.x*12.8,y=item.y*7.2,parent=roomPart(f,'button','venue-control',box(x-50,y-48,x+50,y+48));
      const svg=roomPart(f,'svg','',box(x-50,y-48,x+50,y+24),parent);
      if(item.type==='meteor-note')roomPart(f,'path','venue-meteor',box(x-20,y-32,x+20,y-15),svg);
      roomPart(f,'span','venue-control-label',box(x-48,y+26,x+48,y+43),parent);
      roomPart(f,'span','venue-readout',box(x-30,y+9,x+30,y+21),parent);
    }
    assert.equal(f.api.arrive(f.event()),true,venue.id+'/'+zone+' keeps a safe surface in the single-body case');
    assert.equal(f.api.state().active[0].program,f.programs[venue.id][zone]);f.step(700);assert.equal(f.api.state().active[0].phase,'playing');
    f.api.destroy();assert.equal(f.raf.size,0);
  }
});

// Recorded native full-mode bench endpoint, world1280x720 at origin0. These
// are observed DOM rectangles, not sampled character pixels or approximate
// Scene.actorBounds. The controller still owns filtering and source padding.
function capturedFullBenchComposition(f){
  const position={x:89.375,y:40.9};
  f.actor.serial=4;f.actor.position=position;
  f.actor.target={...position,zone:'bench',workZone:'bench',area:'bench-front'};
  f.actor.node.style.transform='matrix(1,0,0,1,1144,294.48)';
  const actorRects=[
    ['character-body',[1067,179.48001098632812,1221,308.4800109863281]],
    ['nameplate',[1034,311.4800109863281,1254,381.4800109863281]],
    ['actor-title',[1043,320.4800109863281,1197,340.4800109863281]],
    ['actor-relation',[1043,344.4800109863281,1245,360.4800109863281]],
    ['actor-subline',[1043,362.4800109863281,1245,375.4800109863281]],
    ['actor-keepsake',[1224,322.9800109863281,1245,343.9800109863281]],
    ['family-badge',[1201,325.4800109863281,1220,335.4800109863281]]
  ];
  const plate=f.actor.node.children[1];
  f.actor.body.box=box(...actorRects[0][1]);plate.box=box(...actorRects[1][1]);
  for(const [classes,r]of actorRects.slice(2)){
    const node=roomPart(f,'span',classes,box(...r),plate);
    if(classes==='actor-keepsake')node.style.opacity='0';
  }
  const controls=[
    ['workshop-blueprint',[346.796875,110.390625,446.796875,182.390625],[370.796875,184.390625,422.796875,203.390625]],
    ['workshop-circuit',[1025.1875,96,1125.1875,168],[1039.1875,170,1111.1875,189]],
    ['workshop-bell',[846,103.1875,946,175.1875],[870,177.1875,922,196.1875]]
  ];
  const expanded=(r,p)=>box(r[0]-p.left,r[1]-p.top,r[2]+p.right,r[3]+p.bottom);
  const svgPad={left:24,right:24,top:24,bottom:24},captionPad={left:3,right:3,top:3,bottom:3};
  const blocked=[...Scene.CLOCK_RESERVED,...actorRects.map(([,r])=>box(...r))];
  for(const [id,art,label]of controls){
    const parent=roomPart(f,'button','venue-control',box(art[0],art[1],art[2],label[3]));
    parent.dataset.interaction=id;
    roomPart(f,'svg','',box(...art),parent);
    const caption=roomPart(f,'span','venue-control-label',box(...label),parent);caption.style.opacity='.88';
    blocked.push(expanded(art,svgPad),expanded(label,captionPad));
  }
  const festivalArt=[196,58.390625,316,168.390625],festivalCaption=[225,169.390625,287,188.390625];
  const festival=roomPart(f,'div','festival-stage',box(0,0,1280,720));
  roomPart(f,'svg','festival-art',box(...festivalArt),festival);
  roomPart(f,'span','festival-caption',box(...festivalCaption),festival);
  blocked.push(expanded(festivalArt,{left:40,right:40,top:48,bottom:32}),expanded(festivalCaption,captionPad));
  return blocked;
}

test('the captured full-size bench arrival finds a clear furniture fallback without moving its actual owner',()=>{
  const f=fixture({zone:'bench'}),blocked=capturedFullBenchComposition(f);
  const legacy=[[1130,145],[1040,165],[1190,180],[1215,245],[995,235]];
  assert.equal(blocked.length,16,'the actual clock, all seven body/plate parts and eight control rectangles remain reserved');
  for(const [x,y]of legacy)assert.ok(blocked.some(r=>Scene.boundsOverlap(box(x-54,y-36,x+54,y+36),r,3)),
    'each original bench surface really is occluded in this native composition');
  const clear={left:941,top:214,right:1049,bottom:286};
  assert.ok(blocked.every(r=>!Scene.boundsOverlap(clear,r,3)),'the added left furniture surface clears every actual source-padded blocker by the original3px');
  const before=JSON.stringify({session:f.actor.session,serial:f.actor.serial,position:f.actor.position,target:f.actor.target,style:f.actor.node.style,dataset:f.actor.node.dataset});
  const original={actor:f.actor,node:f.actor.node,body:f.actor.body,plate:f.actor.node.children[1],position:f.actor.position,target:f.actor.target};
  assert.equal(f.api.arrive(f.event(f.actor,'station')),true,'the actual bench endpoint must retain one safe furniture response');
  const state=f.api.state(),cue=state.active[0];
  assert.equal(state.started,1);assert.equal(state.pending,0);assert.equal(cue.ownerId,original.actor.id);assert.equal(cue.serial,4);
  assert.deepEqual(plain(cue.anchor),{x:995,y:250});assert.deepEqual(plain(cue.bounds),clear);
  assert.equal(cue.program,'bench-dial');assert.equal(f.actors.get(original.actor.id),original.actor);
  assert.equal(f.actor.node,original.node);assert.equal(f.actor.body,original.body);assert.equal(f.actor.node.children[1],original.plate);
  assert.equal(f.actor.position,original.position);assert.equal(f.actor.target,original.target);
  assert.equal(JSON.stringify({session:f.actor.session,serial:f.actor.serial,position:f.actor.position,target:f.actor.target,style:f.actor.node.style,dataset:f.actor.node.dataset}),before,'safe placement cannot move the actor, alter its observation, or replace its physical owner');
  f.step(1401);assert.equal(f.api.state().finished,1);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);f.api.destroy();
});

test('an actually occupied new bench fallback is skipped and never flashes later after its blocker disappears',()=>{
  const f=fixture({zone:'bench'});capturedFullBenchComposition(f);
  const blocker=roomPart(f,'span','venue-note-text',box(941,214,1049,286));
  const original={node:f.actor.node,body:f.actor.body,position:f.actor.position,target:f.actor.target,serial:f.actor.serial};
  assert.equal(f.api.arrive(f.event(f.actor,'station')),false);
  assert.equal(f.api.state().reasons.occluded,1);assert.equal(f.api.state().started,0);assert.equal(f.api.state().pending,0);
  assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
  blocker.remove();f.step(3000);f.api.update();
  assert.equal(f.api.state().started,0);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0,'blocked evidence cannot create a queued or delayed cue');
  assert.equal(f.api.arrive(f.event(f.actor,'station')),false,'the consumed same actual arrival cannot replay once space becomes free');
  assert.equal(f.api.state().reasons['same-station'],1);
  assert.equal(f.actor.node,original.node);assert.equal(f.actor.body,original.body);assert.equal(f.actor.position,original.position);assert.equal(f.actor.target,original.target);assert.equal(f.actor.serial,original.serial);
  f.api.destroy();
});


// A peer is between route vertices: actor.position still records the departure
// point, while its real computed transform is the current physical foot. Local
// body/plate extents and the .65 reading endpoint come from the native v6 case.
function movingPeerComposition(f){
  f.settings.scale=.65;
  const main={x:6.828125,y:40.9};f.actor.position=main;
  f.actor.target={...main,zone:'library',workZone:'library',area:'library-front'};
  f.actor.node.style.transform='matrix(.65,0,0,.65,87.4,294.48)';
  f.actor.body.box=box(37.35000305175782,219.73000488281252,137.45000305175782,303.580029296875);
  f.actor.node.children[1].box=box(15.900001525878906,305.53000488281253,158.9000015258789,351.03000488281253);
  const peer=f.makeActor('codex:moving-peer','board');peer.serial=2;
  peer.position={x:50,y:78};peer.target={x:32.2,y:40.9,zone:'board',workZone:'board',area:'board-front'};
  peer.node.style.transform='matrix(.65,0,0,.65,512,504)';
  peer.body.box=box(461.95,429.25,562.05,513.1);
  peer.node.children[1].box=box(440.5,515.05,583.5,560.55);
  return peer;
}
function observedActorState(actor){
  return JSON.stringify({serial:actor.serial,session:actor.session,position:actor.position,target:actor.target,
    style:actor.node.style,dataset:actor.node.dataset,navigation:actor.navigation,resumeNavigation:actor.resumeNavigation,
    routeReservation:actor.routeReservation,yielding:actor.yielding});
}

test('a real moving peer reserves its known endpoint from the computed foot without changing either actual actor',()=>{
  for(const owner of ['motion','walking','navigation','resumeNavigation','reservation','yielding']){
    const f=fixture({venue:'observatory'}),peer=movingPeerComposition(f);
    if(owner==='motion')peer.motion={playState:'running',currentTime:100};
    if(owner==='walking')peer.walking=true;
    if(owner==='navigation')peer.navigation={kind:'station',target:{...peer.target}};
    if(owner==='resumeNavigation')peer.resumeNavigation={kind:'station',target:{...peer.target}};
    if(owner==='reservation')peer.routeReservation={token:7,serial:peer.serial};
    if(owner==='yielding')peer.yielding=true;
    const before=[observedActorState(f.actor),observedActorState(peer)],identity=[f.actor.node,f.actor.body,peer.node,peer.body];
    const current=[peer.body.box,peer.node.children[1].box],first=box(254,214,362,286);
    assert.ok(current.every(r=>!Scene.boundsOverlap(first,r,3)),'the currently painted peer is not the blocker');
    assert.ok(Scene.boundsOverlap(first,box(362.11,219.73,462.21,303.58),3),'the independently translated known body endpoint intersects the original first mount');
    assert.equal(f.api.arrive(f.event(f.actor,'station')),true,owner);
    const cue=f.api.state().active[0];assert.deepEqual(plain(cue.anchor),{x:235,y:250},owner+' should use the next genuinely clear furniture surface');
    // Translating from stale actor.position(50,78) instead of actual(40,70)
    // would also block235; thus this checks the real transform coordinate frame.
    assert.deepEqual([observedActorState(f.actor),observedActorState(peer)],before);
    assert.deepEqual([f.actor.node,f.actor.body,peer.node,peer.body],identity);
    assert.equal(cue.ownerId,f.actor.id);assert.equal(cue.serial,f.actor.serial);
    f.step(700);assert.equal(f.api.state().active[0].phase,'playing');
    f.step(701);assert.equal(f.api.state().finished,1);assert.equal(f.raf.size,0);f.api.destroy();
  }
});

test('retargeted and released peer owners leave no endpoint ghost, while invalid projection never erases actual parts',()=>{
  const cases=[
    ['no owner',()=>{}],
    ['expired reservation',p=>{p.routeReservation={token:8,serial:1};}],
    ['zero reservation token',p=>{p.routeReservation={token:0,serial:2};}],
    ['invalid current serial',p=>{p.serial=NaN;p.routeReservation={token:8,serial:NaN};}],
    ['inert navigation',p=>{p.navigation={target:{...p.target}};}],
    ['empty navigation kind',p=>{p.navigation={kind:' ',target:{...p.target}};}],
    ['inert resume',p=>{p.resumeNavigation={target:{...p.target}};}],
    ['truthy nonboolean yielding',p=>{p.yielding='false';}],
    ['nonfinite endpoint with actual motion',p=>{p.motion={};p.target={x:NaN,y:40.9};}],
    ['valid navigation overrides stale actor target',p=>{p.navigation={kind:'station',target:{x:60,y:75}};}],
    ['invalid navigation cannot shadow valid resume',p=>{p.navigation={target:{...p.target}};p.resumeNavigation={kind:'station',target:{x:60,y:75}};}],
    ['nonfinite navigation cannot shadow valid resume',p=>{p.navigation={kind:'station',target:{x:NaN,y:40.9}};p.resumeNavigation={kind:'station',target:{x:60,y:75}};}]
  ];
  for(const [name,configure]of cases){
    const f=fixture({venue:'observatory'}),peer=movingPeerComposition(f);configure(peer);
    assert.equal(f.api.arrive(f.event(f.actor,'station')),true,name);
    assert.deepEqual(plain(f.api.state().active[0].anchor),{x:308,y:250},name+' must not reserve the stale target');
    f.api.destroy();assert.equal(f.raf.size,0);
  }
  const f=fixture({venue:'observatory'}),peer=movingPeerComposition(f);
  peer.navigation={kind:'station',target:{...peer.target}};
  assert.equal(f.api.arrive(f.event(f.actor,'station')),true);assert.equal(f.api.state().active[0].anchor.x,235);
  peer.navigation=null;peer.motion=null;peer.routeReservation=null;peer.resumeNavigation=null;peer.yielding=false;
  f.api.update();assert.equal(f.api.state().active[0].anchor.x,235,'releasing a peer cannot relocate an already visible response');
  f.step(2501);assert.equal(f.api.state().active.length,0);
  // A later real identity at this observed endpoint gets a fresh geometry
  // read. The first actor has left this harness; no two bodies are overlaid.
  const retired=f.actor;f.actors.delete(retired.id);retired.node.remove();
  const next=f.makeActor('codex:later-arrival','library');
  next.position={...retired.position};next.target={...retired.target};next.node.style.transform=retired.node.style.transform;
  next.body.box={...retired.body.box};next.node.children[1].box={...retired.node.children[1].box};
  assert.equal(f.api.arrive(f.event(next,'station')),true);
  assert.deepEqual(plain(f.api.state().active[0].anchor),{x:308,y:250},'the released peer has left no stored endpoint obstacle');
  assert.equal(f.api.state().started,2);f.api.destroy();assert.equal(f.raf.size,0);
  const g=fixture({venue:'observatory'}),actual=movingPeerComposition(g);
  actual.motion={};actual.target={x:NaN,y:Infinity};
  actual.node.style.transform='matrix(.65,0,0,.65,412.16,294.48)';
  actual.body.box=box(362.11,219.73,462.21,303.58);
  actual.node.children[1].box=box(340.66,305.53,483.66,351.03);
  assert.equal(g.api.arrive(g.event(g.actor,'station')),true);
  assert.deepEqual(plain(g.api.state().active[0].anchor),{x:235,y:250},'invalid endpoint cannot remove the real current body blocker');
  g.api.destroy();
});

test('full-size moving child and actual room controls leave the added library surface clear by the original margin',()=>{
  const f=fixture({zone:'bench'}),nativeBlocked=capturedFullBenchComposition(f);
  // Reuse the captured full-mode seven local painted parts and real eight
  // padded controls, translated only from the bench foot to the reading foot.
  for(const part of f.actor.node.querySelectorAll('.character-body,.nameplate,.actor-title,.actor-relation,.actor-subline,.family-badge,.actor-keepsake')){
    const r=part.box;part.box=box(r.left-1016,r.top,r.right-1016,r.bottom);
  }
  f.actor.session.activity='reading';f.actor.position={x:10,y:40.9};
  f.actor.target={...f.actor.position,zone:'library',workZone:'library',area:'library-front'};
  f.actor.node.style.transform='matrix(1,0,0,1,128,294.48)';
  const peer=f.makeActor('codex:full-size-child','board');peer.session.parentId=f.actor.id;
  peer.position={x:50,y:78};peer.target={x:32.2,y:46.1,zone:'board',workZone:'board',area:'board-left'};
  peer.node.style.transform='matrix(1,0,0,1,640,561.6)';peer.motion={playState:'running',currentTime:50};
  peer.navigation={kind:'station',target:{...peer.target}};
  peer.body.box=box(563,446.6,717,575.6);peer.node.children[1].box=box(530,578.6,750,648.6);
  const projected=[box(335.16,216.92,489.16,345.92),box(302.16,348.92,522.16,418.92)];
  const all=[...nativeBlocked.filter((_,i)=>i===0||i>=8),...f.actor.node.querySelectorAll('.character-body,.nameplate,.actor-title,.actor-relation,.actor-subline,.family-badge,.actor-keepsake').map(p=>p.box),peer.body.box,peer.node.children[1].box,...projected];
  for(const [x,y]of [[308,250],[235,250],[185,250],[235,145],[285,150],[185,145]])
    assert.ok(all.some(r=>Scene.boundsOverlap(box(x-54,y-36,x+54,y+36),r,3)),'all original library mounts are actually reserved');
  const clear=box(216,214,324,286);assert.ok(all.every(r=>!Scene.boundsOverlap(clear,r,3)),'new270 surface clears actual body, actual controls and known child endpoint');
  const before=[observedActorState(f.actor),observedActorState(peer)];
  assert.equal(f.api.arrive(f.event(f.actor,'station')),true);
  assert.deepEqual(plain(f.api.state().active[0].anchor),{x:270,y:250});
  assert.deepEqual(plain(f.api.state().active[0].bounds),{left:216,right:324,top:214,bottom:286});
  assert.deepEqual([observedActorState(f.actor),observedActorState(peer)],before);
  f.step(700);assert.equal(f.api.state().active[0].phase,'playing');f.step(701);assert.equal(f.api.state().finished,1);assert.equal(f.raf.size,0);f.api.destroy();
});
