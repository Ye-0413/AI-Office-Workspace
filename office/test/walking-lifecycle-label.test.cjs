'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const I18n=require('../lib/i18n-model.js'),Scene=require('../lib/scene-model.js'),Director=require('../lib/animation-director.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function fn(name){const start=source.search(new RegExp('  (?:async )?function '+name+'\\('));assert.notEqual(start,-1);const lineEnd=source.indexOf('\n',start);if(/\}\s*$/.test(source.slice(start,lineEnd)))return source.slice(start,lineEnd);const tail=source.slice(start+1).search(/\n  (?:async )?function /);return tail<0?source.slice(start):source.slice(start,start+1+tail);}
function harness(language,patch={},oldPhrase='修改代码'){
 const motion={currentTime:331.5},props={marker:'same props'},node={dataset:{},style:{setProperty(){},removeProperty(){}}},actor={id:'codex:body',session:{id:'codex:body',provider:'codex',status:'active',activity:'coding'},spec:Scene.activitySpec({activity:'coding',status:'active'}),node,button:{setAttribute(){}},title:{},relation:{},provider:{dataset:{}},state:{textContent:I18n.translate(language==='en'?'zh':'en',oldPhrase)},serial:4,performance:{motion,props},motion:null,yielding:false,completing:false,...patch};let posed=0;
 const context={language,I18n,Scene,Director,office:{dataset:{nameplateMode:'full'}},actors:new Map([[actor.id,actor]]),selectedSession:'',familyGraph:{info:new Map(),byId:new Map()},cloneLedger:{rootFor:id=>id,stats:()=>({active:0,total:0})},paletteRegistry:{forRoot:()=>({color:'#abc'})},trafficWaiters:new Map(),cloneBusy:a=>['splitting','returning','absorbing'].includes(a.clonePhase),displayName:()=>language==='en'?'Cloud Runner':'踏云',cloneSummary:()=>language==='en'?'Main agent':'主Agent',transitCaption:()=>{},setPose:()=>posed++};
 vm.createContext(context);vm.runInContext("function tr(value){return I18n.translate(language,String(value??''))}function text(node,value){node.textContent=tr(value)}"+fn('completedCloneReturn')+(source.includes('  function lifecycleCaption(')?fn('lifecycleCaption'):'')+fn('nameplateRelation')+fn('updateActorLabel'),context);
 return{actor,context,motion,props,posed:()=>posed,update:()=>context.updateActorLabel(actor)};
}
const cases=[
 ['returning','结束分身',{helper:true,departing:true,clonePhase:'returning',returnReason:'ended',motion:{},navigation:{kind:'return',reason:'ended'}}],
 ['absorbing','分身暂歇',{helper:true,departing:true,clonePhase:'absorbing',returnReason:'resting',navigation:{kind:'absorb',reason:'resting'}}],
 ['splitting charge','分身出现',{helper:true,departing:false,clonePhase:'splitting',navigation:{kind:'entry'}}],
 ['main exit','会话已结束',{helper:false,departing:true,navigation:{kind:'exit',inactive:false}}]
];
for(const language of ['en','zh'])for(const[kind,phrase,patch]of cases)test(language+' lifecycle language switch redraws '+kind+' from canonical evidence',()=>{
 const h=harness(language,patch,phrase),facts=JSON.stringify(h.actor.session),nav=h.actor.navigation,body=h.actor.node,serial=h.actor.serial;h.update();assert.equal(h.actor.state.textContent,I18n.translate(language,phrase));assert.equal(h.actor.navigation,nav);assert.equal(h.actor.node,body);assert.equal(h.actor.serial,serial);assert.equal(h.actor.performance.motion,h.motion);assert.equal(h.motion.currentTime,331.5);assert.equal(h.actor.performance.props,h.props);assert.equal(h.posed(),0,'language redraw cannot restart a rig, bitmap, split or route');assert.equal(JSON.stringify(h.actor.session),facts);
});
for(const language of ['en','zh'])test(language+' canonical holding and fit-paused exits preserve their actual reason',()=>{
 const held=harness(language,{holdingFamily:true,retireRequested:{inactive:false},navigation:{kind:'exit'}},'等分身归位');held.update();assert.equal(held.actor.state.textContent,I18n.translate(language,'等分身归位'));
 for(const inactive of [false,true]){const h=harness(language,{departing:true,resumeNavigation:{kind:'exit',inactive},navigation:null},inactive?'这一轮已歇下':'会话已结束');h.update();assert.equal(h.actor.state.textContent,I18n.translate(language,inactive?'这一轮已歇下':'会话已结束'));}
 const waiting=harness(language,{retireRequested:{inactive:true}},'这一轮已歇下');waiting.update();assert.equal(waiting.actor.state.textContent,I18n.translate(language,'这一轮已歇下'));
});
test('fresh active recovery redraws actual work after all finite owners are revoked, without reverse translating old display text',()=>{
 const h=harness('zh',{departing:true,clonePhase:'returning',returnReason:'ended',navigation:{kind:'return',reason:'ended'}},'结束分身');h.update();assert.equal(h.actor.state.textContent,'结束分身');h.actor.departing=false;h.actor.clonePhase='working';h.actor.returnReason='';h.actor.navigation=null;h.update();assert.equal(h.actor.state.textContent,Scene.activitySpec(h.actor.session).label);assert.equal(h.posed(),0);
});
for(const language of ['en','zh'])for(const inactive of [false,true])test(language+' actual main exit walk retains '+(inactive?'idle':'ended')+' lifecycle caption',async()=>{
 const phrase=inactive?'这一轮已歇下':'会话已结束',h=harness(language,{helper:false,departing:true,navigation:{kind:'exit',inactive},position:{x:30,y:69},carry:{dataset:{}},arrival:{animate(){}}},phrase),c=h.context,oldOwner=h.actor.navigation;
 Object.assign(c,{WalkTiming:require('../lib/walk-timing.js'),uniformScale:1,document:{hidden:false},nativeWindowHidden:false,performance:{now:()=>10},reduced:()=>false,quietSprites:()=>true,actorTransform:p=>'translate('+p.x+','+p.y+')',getComputedStyle:()=>({transform:'matrix(1,0,0,1,0,0)'}),ensureMotionTicker:()=>{},setPose:()=>{},transitCaption:()=>assert.fail('ordinary exit is not cooperative yielding')});h.actor.node.animate=()=>({currentTime:0,finished:Promise.resolve(),cancel(){}});vm.runInContext(fn('sceneHidden')+fn('syncWalkingGait')+fn('animateWalk'),c);assert.equal(await c.animateWalk(h.actor,[{x:30,y:69},{x:32,y:69}],h.actor.serial),true);assert.equal(h.actor.state.textContent,I18n.translate(language,phrase));assert.equal(h.actor.navigation,oldOwner);assert.equal(h.actor.serial,4);
});
