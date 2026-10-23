'use strict';
// Exporter contracts run without Electron or generated media. Production art
// remains the original station module; only its controller/DOM boundary is a spy.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Exporter=require('../scripts/render-station-previews.cjs');
const Station=require('../renderer/station-arrival.js'),Scene=require('../lib/scene-model.js'),Layout=require('../lib/walking-layout.js'),Social=require('../lib/social-interactions.js');
const repo=path.resolve(__dirname,'../..');
const plain=value=>JSON.parse(JSON.stringify(value));

test('the real exporter entry runs under Electron default-app loading while imports remain inert',()=>{
  const filename=path.join(repo,'office/scripts/render-station-previews.cjs'),source=fs.readFileSync(filename,'utf8');
  const footer=source.slice(source.lastIndexOf('\nmodule.exports='));assert.ok(footer.includes('main().catch'));
  for(const scenario of [
    {name:'Electron default-app direct script',electron:true,direct:false,argv:filename,expected:1},
    {name:'Electron Chromium flags before direct application',electron:true,direct:false,flags:['--force-device-scale-factor=1','--disable-backgrounding-occluded-windows'],argv:filename,expected:1},
    {name:'Node direct entry',electron:false,direct:true,argv:filename,expected:1},
    {name:'Node imported module',electron:false,direct:false,argv:filename,expected:0},
    {name:'Electron imported module',electron:true,direct:false,argv:path.join(repo,'office/test/other-entry.cjs'),expected:0},
    {name:'Electron missing application argv',electron:true,direct:false,argv:undefined,expected:0},
    {name:'Electron resolved relative application argv',electron:true,direct:false,argv:path.relative(process.cwd(),filename),expected:1},
    {name:'Electron import with this file only as later input',electron:true,direct:false,flags:['--force-device-scale-factor=1'],argv:path.join(repo,'office/test/other-entry.cjs'),extra:[filename],expected:0}
  ]){
    const module={exports:{}},require=()=>assert.fail('entry check must not load Electron');require.main=scenario.direct?module:{};
    let calls=0;const context={...Exporter,module,require,path,__filename:filename,process:{versions:scenario.electron?{electron:'41.10.4'}:{},argv:['runtime',scenario.argv]},main:()=>{calls++;return Promise.resolve();},console};
    context.process.argv=['runtime',...(scenario.flags||[]),scenario.argv,...(scenario.extra||[])];
    vm.runInNewContext(footer,context,{filename});assert.equal(calls,scenario.expected,scenario.name);
  }
});

function fixture(group=Exporter.GROUPS[0]) {
  let ids=0;const instances=[],motions=[],cards=new Map(),actors=[],timeline={};
  Object.defineProperty(timeline,'currentTime',{get:()=>1000,set:()=>assert.fail('public exporter cannot patch the document clock')});
  class Node {
    constructor(kind='div'){this.kind=kind;this.children=[];this.style={};this.dataset={};this.className='';this.animations=[];this.isConnected=true;}
    append(node){this.children.push(node);node.parent=this;}
    get outerHTML(){return JSON.stringify({kind:this.kind,className:this.className,style:this.style,children:this.children.map(n=>n.outerHTML)});}
    getAnimations({subtree=false}={}){return [...this.animations,...(subtree?this.children.flatMap(n=>n.getAnimations({subtree:true})):[])];}
    contains(node){return this===node || this.children.some(child=>child.contains(node));}
    querySelector(selector){return this.children.flatMap(child=>[child,child.querySelector(selector)]).find(child=>child?.className===selector.slice(1)) || null;}
    getBoundingClientRect(){return this.rect || {x:0,y:0,width:1280,height:720};}
  }
  class Animation {
    constructor(target){this.id=++ids;this.ready=Promise.resolve();this.playState='running';this.writes=[];this.effect={target,getTiming:()=>({iterations:1,duration:Station.DURATION})};motions.push(this);}
    pause(){this.playState='paused';}
    set currentTime(value){assert.equal(this.playState,'paused','an exporter seeks only its paused finite owner');this.writes.push(value);}
  }
  for(const [index,card]of group.cards.entries()){
    const element=new Node(),world=new Node(),layer=new Node(),clip=new Node();
    world.className='preview-world';layer.className='preview-props';clip.className='preview-clip';
    clip.rect={x:20+(index%2)*490,y:94+Math.floor(index/2)*290,width:470,height:215};
    element.append(clip);clip.append(world);world.append(layer);cards.set('card-'+card.zone,element);
  }
  let badResource=false;
  const document={hidden:false,timeline,getElementById:id=>cards.get(id),createElement:tag=>new Node(tag),querySelector:()=>badResource?new Node('image'):null};
  const controller={DURATION:Station.DURATION,create(options){
    const instance={options,destroyed:false,prop:null,stateValue:null,destroy(){assert.equal(this.destroyed,false,'finite owner is released once');this.destroyed=true;options.layer.children=[];},
      arrive(event){const actor=options.getActors().get(event.actorId),ctx=options.getContext();
        assert.equal(actor,event.actor);assert.equal(actor.serial,event.serial);assert.equal(event.kind,'station');assert.equal(actor.node.isConnected,true);assert.equal(actor.body.isConnected,true);assert.equal(Social.physicalBusy(actor,ctx),false);
        assert.equal(Scene.activitySpec(actor.session).zone,event.zone);assert.deepEqual(plain(event.position),plain(actor.position));
        assert.ok(Layout.ZONE_AREAS[event.zone].some(r=>actor.position.x>=r.x1 && actor.position.x<=r.x2 && actor.position.y>=r.y1 && actor.position.y<=r.y2));
        actors.push(actor);const prop=this.prop=new Node('svg');prop.className='station-arrival';prop.dataset={ownerId:actor.id,ownerSerial:String(actor.serial)};
        prop.animations=[new Animation(prop),new Animation(prop)];options.layer.append(prop);
        this.stateValue={active:[{phase:'playing',program:Station.PROGRAMS[ctx.venue][event.zone],anchor:{x:235,y:145}}]};return true;},state(){return this.stateValue;}};
    instances.push(instance);return instance;
  }};
  const context={document,OfficeStationArrival:controller,requestAnimationFrame:callback=>callback(),matchMedia:()=>({matches:false})};context.window=context;vm.createContext(context);
  const runtime=vm.runInContext('('+Exporter.previewRuntime.toString()+')',context)(plain(group));
  return {runtime,context,instances,motions,cards,actors,timeline,badResource:()=>{badResource=true;}};
}

test('public station catalog is exactly the twelve current production programs with source provenance',()=>{
  assert.deepEqual(Exporter.GROUPS.map(g=>g.venue),Object.keys(Station.PROGRAMS));
  assert.equal(Exporter.GROUPS.flatMap(g=>g.cards).length,12);
  for(const group of Exporter.GROUPS)for(const card of group.cards)assert.equal(card.program,Station.PROGRAMS[group.venue][card.zone]);
  assert.deepEqual(Exporter.SETTINGS,{fps:48,frames:72,width:1000,height:720,minimumDistinctFrames:31});
  for(const file of Exporter.SOURCES){assert.ok(fs.statSync(path.join(repo,file)).isFile());assert.ok(!path.isAbsolute(file));}
  for(const required of ['office/renderer/station-arrival.js','office/renderer/station-arrival.css','office/lib/scene-model.js','office/lib/walking-layout.js','office/lib/social-interactions.js','office/scripts/render-station-previews.cjs'])assert.ok(Exporter.SOURCES.includes(required));
});

test('tail provenance distinguishes the nominal duration from the first encoded stopped frame',()=>{
  const timing=Exporter.samplingTiming(Station.DURATION);
  assert.equal(timing.durationMs,1500);assert.equal(timing.productionProgramDurationMs,1400);
  assert.equal(timing.nominalStillTailMs,100);assert.equal(timing.firstStoppedFrame,68);
  assert.ok(Math.abs(timing.firstStoppedFrameMs-1416.6666666666667)<1e-9);
  assert.ok(Math.abs(timing.encodedStillTailMs-83.3333333333333)<1e-9);
  assert.ok((timing.firstStoppedFrame-1)*1000/timing.fps<Station.DURATION,'the preceding encoded frame is still before the authored endpoint');
  assert.ok(timing.firstStoppedFrameMs>=Station.DURATION);
  assert.ok(timing.encodedStillTailMs<timing.nominalStillTailMs,'sampling does not claim an actual 100ms encoded tail');
});

test('each public page loads unchanged real modules and contains no restricted image or private path',()=>{
  for(const group of Exporter.GROUPS){
    const html=Exporter.markup(group),inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
    assert.equal(inline.length,1);new vm.Script(inline[0]);
    assert.equal((html.match(/class="card"/g)||[]).length,4);
    assert.ok(html.includes('不演示房间导航或身体接触'));
    assert.doesNotMatch(html,/<(?:img|image|use)\b|assets\/avatars|room-art|data:image|data:video/i);
    for(const file of Exporter.SOURCES.filter(file=>file.endsWith('.js')))assert.ok(html.includes(file));
    assert.ok(html.indexOf('scene-model.js')<html.indexOf('scene-traffic.js'));
    assert.ok(html.indexOf('scene-traffic.js')<html.indexOf('walking-layout.js'));
    assert.ok(html.indexOf('social-interactions.js')<html.indexOf('station-arrival.js'));
  }
});

test('all72 samples use fresh finite props while the mounted synthetic endpoint identity remains unchanged',async()=>{
  for(const group of Exporter.GROUPS){
    const f=fixture(group),actorsById=new Map();
    for(let frame=0;frame<Exporter.SETTINGS.frames;frame++){
      const ms=frame*1000/48,reports=await f.runtime.frame(ms);
      assert.equal(reports.length,4);
      for(const report of reports){assert.equal(report.motions,2);assert.equal(report.serial,1);assert.ok(report.crop.width>=300);}
      const fresh=f.instances.slice(-4);assert.equal(f.instances.length,(frame+1)*4);
      for(const instance of fresh){
        const actor=[...instance.options.getActors().values()][0],previous=actorsById.get(actor.id);
        if(previous)assert.equal(actor,previous);else actorsById.set(actor.id,actor);
        assert.equal(actor.node.getAnimations({subtree:true}).length,0);
        for(const animation of instance.prop.animations)assert.deepEqual(animation.writes,[Math.min(ms,Station.DURATION)]);
      }
      assert.ok(f.instances.slice(0,-4).every(instance=>instance.destroyed),'the previous finite controllers are disposed, never rewound');
      assert.equal(f.timeline.currentTime,1000);
    }
    assert.equal(actorsById.size,4);f.runtime.destroy();assert.ok(f.instances.every(instance=>instance.destroyed));
  }
});

test('an actor mutation, extra actor animation or unexpected resource aborts rather than exporting an unsafe claim',async()=>{
  const changed=fixture();await changed.runtime.frame(0);changed.actors[0].serial++;
  await assert.rejects(changed.runtime.frame(100),/changed its mounted actor evidence/);
  const unrelated=fixture();await unrelated.runtime.frame(0);unrelated.actors[0].node.animations.push({effect:{getTiming:()=>({iterations:Infinity})},currentTime:777});
  await assert.rejects(unrelated.runtime.frame(100),/must not create or drive actor animations/);
  assert.equal(unrelated.actors[0].node.animations[0].currentTime,777,'an unrelated actor clock is never sought');
  const resource=fixture();resource.badResource();await assert.rejects(resource.runtime.frame(0),/external image element/);
});

test('invalid elapsed, hidden or reduced contexts cannot silently produce normal-motion gallery frames',async()=>{
  for(const value of [-1,1500,Infinity,NaN])await assert.rejects(fixture().runtime.frame(value),/Invalid public preview/);
  const hidden=fixture();hidden.context.document.hidden=true;await assert.rejects(hidden.runtime.frame(0),/actually visible document/);
  const quiet=fixture();quiet.context.matchMedia=()=>({matches:true});await assert.rejects(quiet.runtime.frame(0),/explicitly enable normal motion/);
});
