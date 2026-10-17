/* Authored seasonal objects. Decorative only: no actor or session mutations. */
(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const COPY={
    zh:{title:'节令',heading:'四季与节日',theme:'主题',weather:'窗边天气',auto:'跟随香港日期',manual:'手动预览',automatic:'日期自动',study:'季节灵感',festival:'节日主题',decorative:'天气只是装饰，不是实时气象。',snow:'装饰雪',rain:'装饰雨',off:'关闭',weatherAuto:'随主题变化',ready:'再点一下，继续探索。',error:'设置未能保存，请再试一次。'},
    en:{title:'Season',heading:'Seasons & celebrations',theme:'Theme',weather:'Window weather',auto:'Follow Hong Kong date',manual:'Manual preview',automatic:'Calendar automatic',study:'Seasonal study',festival:'Celebration',decorative:'Decorative weather, not live conditions.',snow:'Decorative snow',rain:'Decorative rain',off:'Off',weatherAuto:'Follow the theme',ready:'Tap again to explore.',error:'The setting could not be saved. Please try again.'}
  };
  function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
  function svgNode(tag,attributes={}){const n=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,String(value));return n;}
  function coreArt(id){
    const svg=svgNode('svg',{viewBox:'0 0 120 110','aria-hidden':'true',focusable:'false',class:'festival-art'});
    const add=(tag,attrs,parent=svg)=>{const n=svgNode(tag,attrs);parent.append(n);return n;};
    const path=(d,fill,stroke='#655039',parent=svg,extra={})=>add('path',{d,fill,stroke,'stroke-width':2,...extra},parent);
    const group=className=>add('g',{class:className});
    const primary=group('festival-primary');
    const parts={};
    path('M12 99h96v7H12z','#95714a');path('M18 101h84','#e1c58f','#e1c58f');
    if(id==='spring'){
      path('M35 70h50l-7 28H42z','#b87c53');path('M31 69h58v8H31z','#d6a16b');
      path('M59 71V39','#66845a','#4a6948',primary,{'stroke-width':4});
      path('M58 57Q28 38 33 57q9 13 25 7M61 51q27-27 30-10 0 15-30 18','#7e9b67','#4a6948',primary);
      parts.flower=add('g',{'data-part':'flower'},primary);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;add('rect',{x:55+Math.cos(a)*8,y:28+Math.sin(a)*8,width:9,height:9,fill:'#d7a193',stroke:'#906e59','stroke-width':1},parts.flower);}
      add('rect',{x:56,y:30,width:7,height:7,fill:'#e9c876'},parts.flower);
      path('M18 29h17v13H18zM34 33l11 5M21 26v-7h10v7','#97a9a2','#5c7975');
      add('path',{d:'M44 42v4m6-1v5m-1 4v4',stroke:'#adc4b9','stroke-width':2});
    }else if(id==='summer'){
      path('M56 90h8v11h-8z','#a47b4b');
      path('M60 89 14 32Q59-9 106 32z','#d9bd86','#745938',primary);
      for(const [x,y]of [[20,31],[35,20],[51,16],[69,16],[86,21],[100,31]])path(`M60 89 ${x} ${y}`,'none','#9c8151',primary,{'stroke-width':1.5});
      path('M27 36q12-12 25-9m9-2q16-1 27 10M37 48q23-18 46 0','none','#7b9272',primary);
      add('circle',{cx:60,cy:86,r:5,fill:'#a47b4b',stroke:'#745938','stroke-width':2},primary);
    }else if(id==='autumn'){
      path('M22 74h72l6 23H17z','#d8c18e');path('M28 78h60M31 85h45M34 91h52','none','#a28b61');
      path('m59 30 10 12 15-5-5 16 13 9-20 6-8 19-7-18-22-5 13-11-4-15 12 6z','#b9794f','#795039',primary);
      path('M60 46v32m0-16L49 53m11 8 13-12','none','#e3b976',primary);
      path('M22 75v23M94 75v23','none','#856643');
    }else if(id==='winter'){
      path('M32 86h56l8 13H24z','#a77c50');path('M38 88h44M32 94h56','none','#e0bf85');
      add('circle',{cx:60,cy:50,r:38,fill:'#abc1bb',stroke:'#6c8987','stroke-width':3},primary);
      path('M27 67q31-14 66 0v12H27z','#e6e2c6','#bbccbc',primary);
      path('m58 25-16 29h9L40 68h40L67 54h9z','#65826b','#4e6b5b',primary);
      for(const [x,y]of [[34,35],[78,33],[44,58],[79,61],[60,18],[31,56],[62,72]])add('rect',{x,y,width:3,height:3,fill:'#faf0d1',class:'festival-globe-flake'},primary);
      path('M36 36q-4-14 10-20','none','#edf2d8',primary,{'stroke-width':3});
    }else if(id==='halloween'){
      path('M31 46q-4-15 29-15t29 15v24q-2 25-29 25T31 70z','#bd7b41','#755136');
      path('M44 37q-9 32 2 54m17-56v59m13-55q13 28-1 52','none','#9d612f');
      parts.light=path('m41 57 10-8 5 12zm23 4 6-12 10 8zM46 73l7 3 6-4 7 5 8-4-6 12H53z','#f0cb78');
      path('M32 38q29-20 57 0l-6 9H38z','#ce9651','#755136',primary);
      path('M58 32v-12h10l-6 14','#71845b','#4a5c40',primary);
      path('m18 20 8 3 5-6 2 9 8 5-12 2-8 7-1-11-6-5z','#66574a','#4b4035');
    }else if(id==='christmas'){
      path('m77 15-22 31h12L48 67h15L47 88h60L92 67h13L87 46h11z','#6f8763','#4b664e');
      path('m77 5 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z','#dfbe75');
      parts.lights=add('g',{'data-part':'tree-lights'});for(const [x,y]of [[76,31],[68,48],[87,56],[63,72],[91,79]])add('rect',{x,y,width:4,height:4,fill:'#ead29c'},parts.lights);
      path('M20 65h40v31H20z','#b77957');path('M36 65h8v31','#dfc58b');
      path('M16 59h48v10H16z','#c58d65','#755339',primary);path('M35 59h9v10','#e7ca85','#8d7146',primary);
      path('M40 59q-26-20-18-1m18 1q25-20 18-1','none','#ddc384',primary,{'stroke-width':4});
    }else if(id==='qingming'){
      path('M18 93q14-23 29-13m36 11q6-19 17-17','none','#7b9667',svg,{'stroke-width':3});
      path('M59 72q23 9 6 24','none','#d1bc8d');
      path('m60 22 24 25-24 27-23-27z','#a2b69b','#596e55',primary);
      path('M60 23v50M37 47h47','none','#d8cca4',primary);
      path('m60 74-5 8 11 6-10 5','none','#bf9971',primary,{'stroke-width':3});
      path('M39 94h34','none','#a39165');
    }else if(id==='newyear'){
      path('M27 23h66v5H27zM34 28v67m52-67v67','none','#a88c57',svg,{'stroke-width':4});
      path('M43 36h34v45H43z','#d2ba87');path('m60 41 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z','#9b6a44');
      parts.wishes=add('g',{'data-part':'wish-marks'});path('M49 69h22M53 74h14','none','#8b714b',parts.wishes);
      for(let i=0;i<10;i++){const a=i*Math.PI*2/10,x=60+Math.cos(a)*37,y=49+Math.sin(a)*33;path(`M${x} ${y}l${Math.cos(a)*8} ${Math.sin(a)*8}`,'none',i%2?'#d1b478':'#d6a376',primary,{'stroke-width':3});}
    }else if(id==='lunarnewyear'){
      path('M60 3v13M44 15h32','none','#a68b57',svg,{'stroke-width':3});
      path('M37 24q23-12 46 0v43q-23 15-46 0z','#b87055','#784d3a',primary);
      path('M47 22q-12 27 0 48M60 20v53M73 22q12 27 0 48','none','#d5ad6a',primary);
      path('M39 20h42v8H39zM39 64h42v8H39z','#ccad6f','#7c603b',primary);
      parts.tassel=path('m60 75 10 10-10 10-10-10zM60 94v10','none','#d5b76e',primary,{'stroke-width':3,'data-part':'lantern-tassel'});
      parts.light=path('m60 34 9 11-9 11-9-11z','#efd28e','#8b6847',primary);
    }else if(id==='midautumn'){
      add('circle',{cx:68,cy:42,r:29,fill:'#e5c98b',stroke:'#a68957','stroke-width':2},primary);
      parts.crescent=path('M71 15q-26 21-1 53 26-15 20-36z','#778c83','#778c83',primary);
      path('M16 65q0-10 10-10 3-13 15-5 12-5 17 8H16z','#b9c5b0','#839c90');
      path('M70 78q-5-24 0-25 8-1 7 24m2 1q0-26 6-24 7 4-1 25','#d8d7b8','#8c967a');
      path('M65 88q-5-15 10-16 16 0 16 15v10H62z','#dfdfc1','#8c967a');add('rect',{x:82,y:81,width:2,height:2,fill:'#6a715e'});
      path('M17 85h31v13H17z','#c9a064');path('M20 89h25m-21 5h17','none','#97784b');
    }else if(id==='hanami'){
      path('M30 93 47 64l27-29 18-18M47 64 24 45m39 3 23 14','none','#806146',primary,{'stroke-width':5});
      parts.blooms=[];for(const [x,y]of [[28,45],[44,63],[63,48],[77,33],[88,19],[84,61]]){
        const flower=add('g',{'data-part':'blossom-'+parts.blooms.length},primary);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;add('rect',{x:x-3+Math.cos(a)*5,y:y-3+Math.sin(a)*5,width:6,height:6,fill:'#dcb3a6',stroke:'#a67c68','stroke-width':.8},flower);}add('rect',{x:x-2,y:y-2,width:4,height:4,fill:'#efd59c'},flower);parts.blooms.push(flower);
      }
      path('M27 94h27l-3 10H30z','#a58962');
    }else if(id==='midsummer'){
      path('M56 26h8v76h-8z','#9c855a');
      add('circle',{cx:60,cy:30,r:22,fill:'none',stroke:'#7f9669','stroke-width':10});
      for(let i=0;i<8;i++){const a=i*Math.PI/4;add('rect',{x:57+Math.cos(a)*23,y:27+Math.sin(a)*23,width:6,height:6,fill:i%2?'#dcc69a':'#d2a48c'});}
      parts.ribbonA=path('M43 45q34 13 6 25t16 26','none','#d3b06e',primary,{'stroke-width':6});
      parts.ribbonB=path('M76 45q-34 13-6 25T54 96','none','#9cb098',primary,{'stroke-width':6});
      parts.ribbonAltA=path('M43 45q-9 20 17 25t-12 26','none','#d3b06e',primary,{'stroke-width':6});
      parts.ribbonAltB=path('M76 45q9 20-17 25t12 26','none','#9cb098',primary,{'stroke-width':6});
      parts.ribbonA.setAttribute('data-part','ribbon-a');parts.ribbonAltA.setAttribute('data-part','ribbon-alt-a');
    }else if(id==='dayofdead'){
      path('M14 12h92','none','#a58b5c',svg,{'stroke-width':3});
      path('M20 15h80v42l-8-4-8 5-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 4z','#be966e','#816448',primary);
      path('m35 26 6-6 6 6-6 6zm19 0 6-6 6 6-6 6zm19 0 6-6 6 6-6 6zM31 39h58m-48-5v13m19-13v13m19-13v13','none','#ead6a5',primary);
      parts.marigolds=[];for(const [x,y]of [[34,77],[57,84],[84,76]]){const flower=add('g',{'data-part':'marigold-'+parts.marigolds.length});for(let i=0;i<8;i++){const a=i*Math.PI/4;add('rect',{x:x-3+Math.cos(a)*7,y:y-3+Math.sin(a)*7,width:6,height:6,fill:i%2?'#d4aa60':'#c7924f'},flower);}add('rect',{x:x-3,y:y-3,width:6,height:6,fill:'#a57c42'},flower);parts.marigolds.push(flower);}
      path('M18 79h8v20h-8zM97 79h8v20h-8z','#e0c996');
      parts.light=add('g',{'data-part':'candlelight'});path('M22 66q-8 12 0 12 7-1 0-12m79 0q-8 12 0 12 7-1 0-12','#ebc77f','#b38a52',parts.light);
    }
    let appliedState='';
    function apply(result){
      const open=Boolean(result.open),step=result.step||0;
      const stateKey=step+'|'+open,changed=stateKey!==appliedState;appliedState=stateKey;
      const fading=[parts.flower,parts.light,parts.lights,parts.crescent,parts.wishes,parts.ribbonA,parts.ribbonB,parts.ribbonAltA,parts.ribbonAltB,parts.tassel,...(parts.blooms||[]),...(parts.marigolds||[])].filter(Boolean);
      // Leaving quiet mode must not retroactively animate its settled state.
      // An unchanged heartbeat also leaves an in-flight transition untouched.
      if(changed||result.reducedMotion)for(const part of fading)part.style.transition=result.reducedMotion?'none':'opacity 800ms linear, transform 800ms cubic-bezier(.77,0,.175,1)';
      if(parts.flower)parts.flower.style.opacity=step%3===2?'1':'.15';
      if(parts.light)parts.light.style.opacity=open?'1':'.2';
      if(parts.lights)parts.lights.style.opacity=open?'1':'.2';
      if(parts.crescent)parts.crescent.style.opacity=step%2?'0':'1';
      if(parts.blooms)parts.blooms.forEach((n,i)=>{n.style.opacity=i<2+step%3*2?'1':'.18';});
      if(parts.ribbonA){parts.ribbonA.style.opacity=parts.ribbonB.style.opacity=step%2?'1':'0';parts.ribbonAltA.style.opacity=parts.ribbonAltB.style.opacity=step%2?'0':'1';}
      if(parts.tassel){parts.tassel.style.transformOrigin='60px 75px';parts.tassel.style.transform='translateY('+(open?1:-2)+'px) rotate('+(open?-5:4)+'deg)';}
      if(parts.marigolds)parts.marigolds.forEach((flower,i)=>{flower.style.transform='translate('+(open?[5,0,-5][i]:0)+'px,'+(open?[0,-3,0][i]:0)+'px)';});
      if(parts.wishes)parts.wishes.setAttribute('transform','rotate('+[-3,0,3][step%3]+' 60 70)');
    }
    apply({step:0,open:false});
    return {svg,primary,apply};
  }
  function rebaseFrames(frames,currentTransform,currentOpacity){
    const start=new DOMMatrixReadOnly(frames[0].transform),current=new DOMMatrixReadOnly(currentTransform==='none'?undefined:currentTransform);
    const keys=['a','b','c','d','e','f'],delta=keys.map(key=>current[key]-start[key]),opacityDelta=Number(currentOpacity)-(frames[0].opacity??1);
    return frames.map((frame,index)=>{const p=frame.offset??index/(frames.length-1),matrix=new DOMMatrixReadOnly(frame.transform),values=keys.map((key,i)=>Number((matrix[key]+delta[i]*(1-p)).toFixed(7)));return {...frame,transform:'matrix('+values.join(',')+')',opacity:Math.max(0,Math.min(1,(frame.opacity??1)+opacityDelta*(1-p)))};});
  }
  function create({office,world,topbar,getState=()=>({}),onSelectTheme,onSelectWeather,onInteraction}={}){
    const model=root.OfficeFestivals;
    if(!office||!world||!model)return {update(){},destroy(){}};
    const layer=el('div','festival-stage');layer.setAttribute('role','group');
    const weatherLayer=el('div','festival-weather');weatherLayer.setAttribute('aria-hidden','true');world.append(weatherLayer,layer);
    const widget=el('div','festival-widget'),button=el('button','festival-control'),caption=el('span','festival-caption');button.type='button';widget.append(button);layer.append(widget);
    const feedback=el('div','festival-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');office.append(feedback);
    const chooser=el('details','festival-chooser'),summary=el('summary','festival-summary'),summaryText=el('span','festival-summary-text'),panel=el('div','festival-panel');
    const leaf=svgNode('svg',{viewBox:'0 0 20 20','aria-hidden':'true',focusable:'false'});leaf.append(svgNode('path',{d:'M15 3Q3 2 4 12q5 7 11-9ZM4 16l8-9',fill:'none',stroke:'currentColor','stroke-width':1.7}));summary.append(leaf,summaryText);chooser.append(summary,panel);
    const heading=el('strong','festival-heading'),themeLabel=el('label','festival-field-label'),themeSelect=el('select','festival-theme-select'),weatherLabel=el('label','festival-field-label'),weatherSelect=el('select','festival-weather-select'),dateLabel=el('p','festival-date'),disclaimer=el('p','festival-disclaimer');
    themeSelect.id='festival-theme-select';weatherSelect.id='festival-weather-select';themeLabel.htmlFor=themeSelect.id;weatherLabel.htmlFor=weatherSelect.id;
    for(const id of model.THEME_IDS){const option=el('option','');option.value=id;themeSelect.append(option);}
    for(const id of model.WEATHER_MODES){const option=el('option','');option.value=id;weatherSelect.append(option);}
    panel.append(heading,themeLabel,themeSelect,weatherLabel,weatherSelect,dateLabel,disclaimer);
    const tray=topbar?.querySelector('.top-actions')||topbar||office;tray.prepend(chooser);
    const listeners=[],records=new Map();let state={theme:'auto',weather:'auto',language:'zh',reducedMotion:false,lowPower:false,hidden:false,venue:'workshop'},resolved,art,currentId='',serial=0,animation=null,lastFrame=null,destroyed=false,lastSource='pointer',lastStatus=null;
    const language=()=>state.language==='en'?'en':'zh',copy=()=>COPY[language()],quiet=()=>Boolean(state.reducedMotion||state.lowPower||state.hidden);
    const listen=(n,event,fn)=>{n.addEventListener(event,fn);listeners.push(()=>n.removeEventListener(event,fn));};
    function say(result){lastStatus=result;feedback.textContent=(language()==='en'?result.statusEn:result.statusZh)||model.getTheme(currentId)[language()==='en'?'detailEn':'detailZh'];}
    function stop(finish=false){serial++;if(animation){if(finish&&art&&lastFrame){art.primary.style.transform=lastFrame.transform;art.primary.style.opacity=String(lastFrame.opacity);}animation.cancel();animation=null;}widget.dataset.playing='false';}
    function apply(result,keyboard=false){art?.apply?.({...result,language:language(),reducedMotion:Boolean(quiet()||keyboard)});widget.dataset.state=result.phase||'rest';if(art)art.svg.dataset.state=result.phase||'rest';}
    function coreActivate(previous){
      return model.activateCore(currentId,previous);
    }
    function activate(source='pointer'){
      if(destroyed||!art)return;
      const currentTransform=getComputedStyle(art.primary).transform,currentOpacity=getComputedStyle(art.primary).opacity;stop();
      const previous=records.get(currentId)||{step:0,open:false,selection:0},studies=root.OfficeFestivalStudies;
      let result;
      try{result=!model.CORE_THEMES.some(item=>item.id===currentId)&&studies?.activate?studies.activate(currentId,{...previous}):coreActivate(previous);}catch(_){result=coreActivate(previous);}
      records.set(currentId,result);apply(result,source==='keyboard');say(result);
      const theme=model.getTheme(currentId);
      if(typeof onInteraction==='function')try{const answer=onInteraction({venue:state.venue||'workshop',theme:currentId,id:'festival-'+currentId,type:theme.action,state:result.phase,point:{x:20,y:17},source});if(answer?.catch)answer.catch(()=>{});}catch(_){}
      let frames=model.interactionFrames(currentId,result).map(frame=>({...frame}));
      const final=frames.at(-1);lastFrame=final;
      if(quiet()||source==='keyboard'||!art.primary.animate){art.primary.style.transform=final.transform;art.primary.style.opacity=String(final.opacity);return;}
      // Carry the current pose through the entire trajectory. Replacing only
      // frame zero would jump back to the authored frame one after 25ms.
      frames=rebaseFrames(frames,currentTransform,currentOpacity);
      widget.dataset.playing='true';const token=serial,currentArt=art;
      const effect=art.primary.animate(frames,{duration:model.INTERACTION_DURATION,easing:'linear',fill:'forwards'});animation=effect;
      effect.finished.then(()=>{if(destroyed||token!==serial||currentArt!==art)return;art.primary.style.transform=final.transform;art.primary.style.opacity=String(final.opacity);widget.dataset.playing='false';effect.cancel();animation=null;}).catch(()=>{});
    }
    function paintWeather(weather){
      if(weatherLayer.dataset.weather===weather)return;weatherLayer.dataset.weather=weather;weatherLayer.replaceChildren();
      if(weather==='off')return;
      const sky=svgNode('svg',{viewBox:'0 0 200 330',preserveAspectRatio:'none','aria-hidden':'true',focusable:'false'});
      for(let i=0;i<18;i++){
        const x=(i*43+11)%195,y=(i*71+13)%310;
        const particle=svgNode('g',{class:'festival-weather-particle'});particle.style.animationDelay=(-i*.37)+'s';
        if(weather==='rain')particle.append(svgNode('path',{d:`M${x} ${y}l-4 17`,stroke:'#d6e3d6','stroke-width':1.4,opacity:.65}));
        else particle.append(svgNode('path',{d:`M${x-2} ${y}h4m-2-2v4`,stroke:'#f2edd4','stroke-width':1.3,opacity:.85}));
        sky.append(particle);
      }
      weatherLayer.append(sky);
    }
    function update(next={}){
      if(destroyed)return;state={...state,...next};resolved=model.resolve({theme:state.theme,weather:state.weather,now:next.now===undefined?Date.now():next.now});
      const theme=model.getTheme(resolved.theme),changed=currentId!==theme.id;
      if(changed){
        stop();currentId=theme.id;lastStatus=null;feedback.textContent='';
        art=model.CORE_THEMES.some(item=>item.id===currentId)?coreArt(currentId):root.OfficeFestivalStudies?.build(currentId,{svgNode});
        if(!art?.svg||!art.primary)art=coreArt('spring');
        art.svg.classList.add('festival-art');art.primary.classList.add('festival-primary');
        const saved=records.get(currentId),frames=model.interactionFrames(currentId,saved),rest=saved?frames.at(-1):frames[0];
        lastFrame=null;art.primary.style.transform=rest.transform;art.primary.style.opacity=String(rest.opacity);
        button.replaceChildren(art.svg,caption);apply(saved||{step:0,open:false,selection:0,phase:'rest'});
      }
      if(quiet())stop(true);
      layer.dataset.theme=theme.id;layer.dataset.quiet=String(quiet());layer.dataset.mode=resolved.mode;layer.dataset.phase=state.dayPhase||'';weatherLayer.dataset.quiet=String(quiet());
      widget.dataset.theme=theme.id;widget.dataset.quiet=String(quiet());
      const name=theme[language()==='en'?'nameEn':'nameZh'],action=theme[language()==='en'?'actionEn':'actionZh'];
      layer.setAttribute('aria-label',name);button.setAttribute('aria-label',action);button.title=action+' · '+theme[language()==='en'?'detailEn':'detailZh'];caption.textContent=action;
      summaryText.textContent=copy().title;summary.title=name+' · '+copy()[resolved.mode==='manual'?'manual':'automatic'];summary.setAttribute('aria-label',copy().heading+' · '+name);
      heading.textContent=copy().heading;themeLabel.textContent=copy().theme;weatherLabel.textContent=copy().weather;
      for(const option of themeSelect.options)option.textContent=option.value==='auto'?copy().auto:model.getTheme(option.value)[language()==='en'?'nameEn':'nameZh'];
      for(const option of weatherSelect.options)option.textContent=copy()[{auto:'weatherAuto',off:'off',rain:'rain',snow:'snow'}[option.value]];
      themeSelect.value=resolved.selected;weatherSelect.value=resolved.weatherMode;
      dateLabel.textContent=resolved.dateIso+' · HK · '+copy()[resolved.mode==='manual'?'manual':'automatic']+' · '+name+' · '+copy()[theme.kind==='festival'?'festival':'study'];
      disclaimer.textContent=copy().decorative;paintWeather(resolved.weather);
      const record=records.get(currentId);if(record)apply(record);if(lastStatus)say(lastStatus);
    }
    function save(callback,value){try{const answer=callback?.(value,{source:lastSource});if(answer?.catch)answer.catch(()=>{feedback.textContent=copy().error;});}catch(_){feedback.textContent=copy().error;}lastSource='pointer';}
    for(const select of [themeSelect,weatherSelect]){listen(select,'keydown',()=>{lastSource='keyboard';});listen(select,'pointerdown',()=>{lastSource='pointer';});}
    listen(themeSelect,'change',()=>{update({...state,theme:themeSelect.value});save(onSelectTheme,themeSelect.value);});
    listen(weatherSelect,'change',()=>{update({...state,weather:weatherSelect.value});save(onSelectWeather,weatherSelect.value);});
    listen(button,'click',event=>activate(event.detail===0?'keyboard':'pointer'));
    listen(chooser,'keydown',event=>{if(event.key==='Escape'&&chooser.open){chooser.open=false;summary.focus();event.preventDefault();}});
    listen(document,'pointerdown',event=>{if(chooser.open&&!chooser.contains(event.target))chooser.open=false;});
    update(getState());
    return {update,destroy(){if(destroyed)return;destroyed=true;stop();listeners.splice(0).forEach(remove=>remove());layer.remove();weatherLayer.remove();chooser.remove();feedback.remove();records.clear();art=null;}};
  }
  root.OfficeFestivalStage=Object.freeze({create});
})(window);
