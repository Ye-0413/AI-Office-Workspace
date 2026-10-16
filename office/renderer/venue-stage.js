/* Room scenery and deliberately local play. Never creates or changes a session. */
(function (root) {
  'use strict';

  const OUT = 'cubic-bezier(.23,1,.32,1)';
  const MOVE = 'cubic-bezier(.77,0,.175,1)';
  const NS = 'http://www.w3.org/2000/svg';
  const COPY = {
    zh: {
      choose: '场景', chooseLabel: '切换工作场景', hint: '选择场景；Tab 可探索场景机关',
      loadError: '场景背景暂未加载，机关仍可使用。',
      blueprint: ['蓝图已铺开，藏着下一项小发明。', '蓝图收好，灵感留在这里。'],
      circuit: ['线路接通，光点沿着铜线传递。', '线路休息，开关仍在这里。'],
      bell: count => '铜铃第 ' + count + ' 声，给灵感一个小小回应。',
      teaPour: '热水入壶，等茶香慢慢展开。', tea: count => '第 ' + count + ' 杯茶好了，再点一下可续杯。',
      windchime: count => '第 ' + count + ' 阵港风，轻轻拨响竹檐。',
      note: ['留笺展开：潮起有时，灵感也有时。', '留笺折好，留待下一次相遇。'],
      noteText: '潮起有时，\n灵感也有时。',
      starmap: count => '已连起 ' + count + ' 颗星。点一颗星，改写自己的星图。',
      star: n => '星图上的第 ' + n + ' 颗星',
      telescope: ['望向港湾，追一线远处的光。', '转向北天，寻找安静的北斗。', '抬向天顶，看看更远的星河。'],
      bearings: ['港湾', '北天', '天顶'], meteor: '流星划过，星笺留下这一刻。', meteorText: '把好奇心\n寄往星河。',
      opened: '已展开', closed: '已收起', powered: '已接通', off: '已关闭', cup: '杯', starCount: '颗星'
    },
    en: {
      choose: 'Scene', chooseLabel: 'Choose a workspace scene', hint: 'Choose a scene; use Tab to explore its objects',
      loadError: 'The room picture could not load. Its objects are still available.',
      blueprint: ['The blueprint unfolds with room for a little invention.', 'Blueprint rolled away. The idea stays here.'],
      circuit: ['Circuit on. Little signals travel along the copper trace.', 'Circuit resting. The switch is still here.'],
      bell: count => 'Brass bell, ring ' + count + '. A small reply to a new idea.',
      teaPour: 'Warm water pours in. Give the tea a moment.', tea: count => 'Cup ' + count + ' is ready. Tap again for a refill.',
      windchime: count => 'Harbour breeze ' + count + ' answers beneath the bamboo eaves.',
      note: ['A harbour note: tides take their time, and so do ideas.', 'Note folded, ready for the next visit.'],
      noteText: 'Tides take their time.\nSo do ideas.',
      starmap: count => count + ' stars connected. Tap a star to draw your own constellation.',
      star: n => 'Star ' + n + ' on the chart',
      telescope: ['Toward the harbour, following a distant light.', 'Toward the north, looking for the quiet Dipper.', 'Toward the zenith, a little further into the galaxy.'],
      bearings: ['Harbour', 'North', 'Zenith'], meteor: 'A meteor passes. A star note keeps the moment.', meteorText: 'Send curiosity\nto the stars.',
      opened: 'Unfolded', closed: 'Folded', powered: 'On', off: 'Off', cup: 'cups', starCount: 'stars'
    }
  };
  const STARS = [[16,29],[36,14],[57,30],[82,17],[72,52]];
  const PATTERNS = [[0,1,2,3,4],[0,2,4],[1,2,3,4]];
  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function svgNode(tag, attributes = {}) {
    const result = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, value);
    return result;
  }
  function picture(type) {
    const svg = svgNode('svg', { viewBox: '0 0 100 72', 'aria-hidden': 'true', focusable: 'false' });
    const add = (tag, attributes) => { const part = svgNode(tag, attributes); svg.append(part); return part; };
    if (type === 'blueprint') {
      add('path', { d: 'M12 16h76v43H12z', fill: '#654b36', stroke: '#b9965b', 'stroke-width': '3' });
      const sheet = add('g', { class: 'venue-blueprint-sheet' });
      sheet.append(svgNode('path', { d: 'M14 18h69v38H14z', fill: '#335c68', stroke: '#b4c0a0', 'stroke-width': '2' }));
      sheet.append(svgNode('path', { d: 'M24 18v38m13-38v38m13-38v38m13-38v38m13-38v38M14 30h69M14 43h69', fill: 'none', stroke: '#8faeaa', 'stroke-width': '.7', opacity: '.5' }));
      sheet.append(svgNode('path', { d: 'M23 47V32l14-8 18 10v14H23zm32 0h18V28H55m-17 7v12m-6-11h11', fill: 'none', stroke: '#f3d8a4', 'stroke-width': '2' }));
      add('path', { d: 'M10 14h8v46h-8zM82 14h8v46h-8z', fill: '#c49d64', stroke: '#624a32', 'stroke-width': '2' });
    } else if (type === 'circuit') {
      add('path', { d: 'M8 18h84v39H8z', fill: '#485d48', stroke: '#b6935c', 'stroke-width': '3' });
      add('path', { d: 'M15 45h21V29h24v16h23M36 29V21m24 24v11', fill: 'none', stroke: '#c5a366', 'stroke-width': '3' });
      for (const [cx, cy] of [[15,45],[36,21],[60,56],[83,45]]) add('rect', { x:cx-3,y:cy-3,width:6,height:6,class:'venue-circuit-led',fill:'#e9e0aa' });
      add('rect', { x:44,y:22,width:12,height:14,fill:'#b49562',stroke:'#342e27','stroke-width':'2' });
      add('path', { class:'venue-switch-lever',d:'M50 32V18',stroke:'#f5dda9','stroke-width':'4' });
      add('rect', { class:'venue-circuit-signal',x:12,y:42,width:6,height:6,fill:'#fff1bb' });
    } else if (type === 'bell' || type === 'windchime') {
      add('path', { d:'M50 2v12M32 10h36',stroke:'#775333','stroke-width':'3',fill:'none' });
      const hanging = add('g', { class:'venue-hanging' });
      if (type === 'bell') {
        hanging.append(svgNode('path',{d:'M35 38V29c0-21 30-21 30 0v9l7 10H28z',fill:'#caa45f',stroke:'#59432c','stroke-width':'3'}));
        hanging.append(svgNode('path',{d:'M42 22v14m16 0V22M45 52h10',stroke:'#f4d592','stroke-width':'3'}));
        hanging.append(svgNode('rect',{x:47,y:45,width:6,height:12,fill:'#674c31'}));
      } else {
        hanging.append(svgNode('path',{d:'M28 21 50 12l22 9z',fill:'#82956d',stroke:'#4a5641','stroke-width':'2'}));
        for (const [x,y,h] of [[34,22,23],[48,24,31],[62,22,25]]) hanging.append(svgNode('rect',{x,y,width:5,height:h,fill:'#d9bd78',stroke:'#6f5838','stroke-width':'1.5'}));
        hanging.append(svgNode('path',{d:'M51 53v14h10V54z',fill:'#bd866a',stroke:'#654b3a','stroke-width':'2'}));
      }
    } else if (type === 'tea') {
      add('path',{d:'M8 61h84',stroke:'#795837','stroke-width':'4'});
      const pot = add('g',{class:'venue-teapot'});
      pot.append(svgNode('path',{d:'M7 27h31l-3 23H11zM13 25h18l-3-6H17zM37 31l11-7-5 16h-7M9 31C-1 23-1 47 11 43',fill:'#a96d4c',stroke:'#583c2b','stroke-width':'3'}));
      add('path',{class:'venue-tea-stream',d:'M45 30q14 8 14 18',fill:'none',stroke:'#e2d9a7','stroke-width':'3'});
      add('path',{d:'M52 44h29l-4 14H57zM81 46q15-2 5 8h-8',fill:'#ddc599',stroke:'#654d36','stroke-width':'3'});
      add('path',{class:'venue-tea-liquid',d:'M56 46h21l-2 5H58z',fill:'#a57535'});
      const steam = add('g',{class:'venue-tea-steam',stroke:'#f8ecd0','stroke-width':'2',fill:'none'});
      steam.append(svgNode('path',{d:'M61 39q-6-6 0-12'}),svgNode('path',{d:'M70 38q6-6 0-13'}));
    } else if (type === 'note' || type === 'meteor-note') {
      add('path',{d:'M12 14h76v43H12z',fill:'#6b503b',stroke:'#b99a65','stroke-width':'3'});
      add('path',{class:'venue-note-fold',d:'M23 21h54v29H23z',fill:type==='note'?'#e4d5a2':'#c7c9b0',stroke:'#806847','stroke-width':'2'});
      add('path',{d:'m23 21 27 18 27-18M23 50l16-15m38 15L61 35',fill:'none',stroke:'#a3895c','stroke-width':'1.5'});
      add('rect',{class:'venue-note-seal',x:44,y:32,width:12,height:11,fill:type==='note'?'#a5654e':'#8b8259'});
      if(type==='meteor-note')add('path',{class:'venue-meteor',d:'m12 4 25 11m-5-5 5 5-7 1',stroke:'#f9dfa1','stroke-width':'2',fill:'none'});
    } else if (type === 'starmap') {
      add('path',{d:'M5 6h90v57H5z',fill:'#334a58',stroke:'#bca372','stroke-width':'3'});
      add('path',{d:'M50 8v53M7 35h86M20 12l60 45M80 12 20 57',stroke:'#a9b9aa','stroke-width':'.8',opacity:'.35'});
      add('g',{class:'venue-star-lines',stroke:'#f0ce83','stroke-width':'1.8',fill:'none'});
      STARS.forEach(([cx,cy],index)=>add('path',{class:'venue-star-mark', 'data-star':index,d:`M${cx-3} ${cy}h6m-3-3v6`,stroke:'#f4dca0','stroke-width':'2'}));
    } else if (type === 'telescope') {
      add('path',{d:'m50 37-17 27m17-27 18 27m-18-27v27',stroke:'#a98758','stroke-width':'4',fill:'none'});
      const scope=add('g',{class:'venue-telescope'});
      scope.append(svgNode('path',{d:'M22 26h55v17H22z',fill:'#bda375',stroke:'#594936','stroke-width':'3'}),svgNode('path',{d:'M73 22h12v25H73zM17 29h8v11h-8z',fill:'#677b75',stroke:'#4b4636','stroke-width':'3'}),svgNode('path',{d:'M35 29h27',stroke:'#eee0b5','stroke-width':'2'}));
      add('circle',{class:'venue-scope-light',cx:83,cy:12,r:4,fill:'#e3d59a'});
    }
    return svg;
  }

  function create({ office, world, topbar, getState = () => ({}), onSelectVenue, onInteraction } = {}) {
    if (!office || !world || !topbar || !root.OfficeVenues) return { update() {}, destroy() {} };
    const model = root.OfficeVenues;
    const originalArt = world.querySelector('#room-art');
    const originalSrc = originalArt?.getAttribute('src');
    const originalAlt = originalArt?.getAttribute('alt');
    const stage = node('div','venue-stage');
    stage.setAttribute('role','group');stage.setAttribute('aria-label','');
    const detail = node('div','venue-detail'); detail.setAttribute('aria-hidden','true');
    const detailBits = [node('i','venue-detail-one'),node('i','venue-detail-two'),node('i','venue-detail-three')];
    detail.append(...detailBits); stage.append(detail); world.append(stage);
    const feedback = node('div','venue-feedback'); feedback.setAttribute('role','status'); feedback.setAttribute('aria-live','polite'); feedback.setAttribute('aria-atomic','true'); office.append(feedback);
    const chooser=node('div','venue-chooser'), label=node('label','venue-chooser-label'), select=node('select','venue-select');
    select.id='venue-select'; label.htmlFor=select.id;
    for(const venue of model.CATALOG){const option=node('option','');option.value=venue.id;select.append(option);}
    chooser.append(label,select); topbar.insertBefore(chooser,topbar.querySelector('.room-switcher') || topbar.querySelector('.top-actions'));
    const records=new Map(), surfaces=new Set(), animations=new Set(), pendingImages=new Set();
    let state={venue:model.DEFAULT_VENUE,language:'zh',reducedMotion:false,lowPower:false,hidden:false,dayPhase:'morning'}, destroyed=false, artGeneration=0, paintedVenue='', requestedVenue='', selectionSource='pointer', lastFeedback=null;
    const artMotions=new Map();
    const language=()=>state.language==='en'?'en':'zh';
    const copy=()=>COPY[language()];
    const quiet=()=>Boolean(state.reducedMotion||state.lowPower||state.hidden);
    const listen=(target,event,handler)=>{target.addEventListener(event,handler);listeners.push(()=>target.removeEventListener(event,handler));};
    const listeners=[];
    const say=(key,arg)=>{lastFeedback={key,arg};const value=copy()[key];feedback.textContent=typeof value==='function'?value(arg):Array.isArray(value)?value[arg]:value||'';};
    function stop(record){record.generation++;for(const animation of record.animations){animation.cancel();animations.delete(animation);}record.animations.clear();}
    function motion(record,part,frames,options={}){
      if(quiet()||record.keyboard||!part?.animate)return Promise.resolve(true);
      const generation=record.generation;
      const animation=part.animate(frames,{duration:800,easing:OUT,fill:'none',...options});
      record.animations.add(animation);animations.add(animation);
      return animation.finished.then(()=>!destroyed&&generation===record.generation).catch(()=>false).finally(()=>{record.animations.delete(animation);animations.delete(animation);animation.cancel();});
    }
    function drawStars(record){
      const lines=record.svg.querySelector('.venue-star-lines');lines.replaceChildren();
      const chosen=[...record.stars];
      for(let i=1;i<chosen.length;i++){const a=STARS[chosen[i-1]],b=STARS[chosen[i]];lines.append(svgNode('path',{d:`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`}));}
      for(const star of record.starButtons){const selected=record.stars.has(Number(star.dataset.star));star.setAttribute('aria-pressed',String(selected));}
      record.readout.textContent=chosen.length+' '+copy().starCount;
    }
    function renderRecord(record){
      const {item,button,widget}=record;
      const caption=language()==='en'?item.labelEn:item.labelZh;
      record.label.textContent=caption;button.setAttribute('aria-label',caption);button.title=caption;
      if(['blueprint','circuit','note','meteor-note'].includes(item.type))button.setAttribute('aria-pressed',String(record.open));
      widget.dataset.state=record.phase;
      widget.dataset.quiet=String(quiet()||record.keyboard);
      record.readout.textContent=item.type==='tea'?record.count+' '+copy().cup:item.type==='telescope'?copy().bearings[record.bearing]:record.open?copy()[item.type==='circuit'?'powered':'opened']:'';
      if(record.note)record.note.textContent=copy()[item.type==='meteor-note'?'meteorText':'noteText'];
      if(item.type==='starmap'){
        record.starButtons.forEach((star,i)=>{star.setAttribute('aria-label',copy().star(i+1));star.title=copy().star(i+1);});drawStars(record);
      }
      if(item.type==='telescope')record.svg.querySelector('.venue-telescope').style.transform='rotate('+[-12,-30,-48][record.bearing]+'deg)';
    }
    function notify(record,source){
      if(typeof onInteraction==='function'){
        try{const result=onInteraction({venue:record.venue,id:record.item.id,type:record.item.type,state:record.phase,point:{x:record.item.x,y:record.item.y},source});if(result?.catch)result.catch(()=>{});}catch(_){/* Decoration must never block observation. */}
      }
    }
    async function activate(record,source='pointer'){
      if(destroyed||record.venue!==state.venue)return;
      const hanging=record.svg.querySelector('.venue-hanging'),pot=record.svg.querySelector('.venue-teapot');
      const hangingTransform=hanging?getComputedStyle(hanging).transform:'none',potTransform=pot?getComputedStyle(pot).transform:'none';
      const meteor=record.svg.querySelector('.venue-meteor'),continuingMeteor=Boolean(meteor&&record.animations.size),meteorTransform=meteor?getComputedStyle(meteor).transform:'none',meteorOpacity=meteor?Number(getComputedStyle(meteor).opacity):0;
      stop(record);record.keyboard=source==='keyboard';
      const generation=record.generation,{type}=record.item;
      if(type==='blueprint'||type==='circuit'||type==='note'){
        record.open=!record.open;record.phase=record.open?'open':'closed';say(type,record.open?0:1);
      }else if(type==='bell'||type==='windchime'){
        record.count++;record.phase='rung';say(type,record.count);renderRecord(record);
        motion(record,hanging,[{transform:hangingTransform},{transform:'rotate(-12deg)',offset:.2},{transform:'rotate(9deg)',offset:.5},{transform:'rotate(-4deg)',offset:.75},{transform:'rotate(0deg)'}],{easing:MOVE});
      }else if(type==='tea'){
        record.phase=quiet()||record.keyboard?'ready':'pouring';record.open=true;say('teaPour');renderRecord(record);notify(record,source);
        if(!await motion(record,pot,[{transform:potTransform},{transform:'rotate(18deg)'}],{duration:400,fill:'forwards',easing:MOVE}))return;
        if(destroyed||generation!==record.generation)return;
        record.phase='steeping';renderRecord(record);
        if(!await motion(record,record.svg.querySelector('.venue-tea-liquid'),[{opacity:.2},{opacity:1}],{duration:400,easing:OUT}))return;
        if(destroyed||generation!==record.generation)return;
        record.count++;record.phase='ready';say('tea',record.count);renderRecord(record);return;
      }else if(type==='starmap'){
        record.pattern=(record.pattern+1)%PATTERNS.length;record.stars=new Set(PATTERNS[record.pattern]);record.phase='charted';say('starmap',record.stars.size);
        renderRecord(record);motion(record,record.svg.querySelector('.venue-star-lines'),[{opacity:.2},{opacity:1}],{duration:800,easing:'linear'});
      }else if(type==='telescope'){
        record.bearing=(record.bearing+1)%3;record.phase='bearing-'+record.bearing;say('telescope',record.bearing);
      }else if(type==='meteor-note'){
        record.open=true;record.phase='charted';say('meteor');renderRecord(record);
        const frames=continuingMeteor?[{transform:meteorTransform,opacity:meteorOpacity},{transform:'translate(47px,23px)',opacity:0}]:[{transform:'translate(-15px,-8px)',opacity:0},{transform:'translate(1px,0)',opacity:1,offset:.2},{transform:'translate(47px,23px)',opacity:0}];
        motion(record,meteor,frames,{duration:700,easing:'linear'});
      }
      renderRecord(record);notify(record,source);
    }
    for(const venue of model.CATALOG){
      for(const item of venue.interactions){
        const widget=node('div','venue-widget');widget.dataset.venue=venue.id;widget.dataset.type=item.type;widget.dataset.interaction=item.id;widget.style.left=item.x+'%';widget.style.top=item.y+'%';
        const button=node('button','venue-control');button.type='button';
        const svg=picture(item.type),caption=node('span','venue-control-label'),readout=node('span','venue-readout');readout.setAttribute('aria-hidden','true');
        button.append(svg,caption,readout);widget.append(button);
        const record={venue:venue.id,item,widget,button,svg,label:caption,readout,phase:'closed',open:false,count:0,bearing:0,pattern:-1,stars:new Set(),starButtons:[],generation:0,animations:new Set(),keyboard:false};
        if(item.type==='note'||item.type==='meteor-note'){record.note=node('span','venue-note-text');record.note.setAttribute('aria-hidden','true');button.append(record.note);}
        if(item.type==='starmap')STARS.forEach(([x,y],index)=>{
          const star=node('button','venue-star-target');star.type='button';star.dataset.star=String(index);star.style.left=x+'%';star.style.top=y+'px';star.textContent='✦';
          listen(star,'click',event=>{if(destroyed||record.venue!==state.venue)return;stop(record);record.keyboard=event.detail===0;const chosen=Number(star.dataset.star);record.stars.has(chosen)?record.stars.delete(chosen):record.stars.add(chosen);record.phase='charted';say('starmap',record.stars.size);renderRecord(record);motion(record,record.svg.querySelector('.venue-star-lines'),[{opacity:.2},{opacity:1}],{duration:800,easing:'linear'});notify(record,event.detail===0?'keyboard':'pointer');});
          record.starButtons.push(star);widget.append(star);
        });
        listen(button,'click',event=>activate(record,event.detail===0?'keyboard':'pointer'));
        stage.append(widget);records.set(item.id,record);
      }
    }
    function cancelArt(preserve=false){for(const [surface,effect]of artMotions){if(preserve)surface.style.opacity=getComputedStyle(surface).opacity;effect.cancel();animations.delete(effect);}artMotions.clear();}
    function discardSurfaces(except){for(const surface of surfaces)if(surface!==except){surface.remove();surfaces.delete(surface);}}
    async function loadImage(image,path){
      pendingImages.add(image);
      try{image.src=path;if(typeof image.decode==='function')await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});return image.naturalWidth>0;}
      catch(_){return false;}finally{pendingImages.delete(image);}
    }
    async function paint(venue,instant){
      if(!originalArt)return;
      const generation=++artGeneration,path=venue.background;
      requestedVenue=venue.id;
      if(paintedVenue===venue.id&&!surfaces.size){originalArt.alt=language()==='en'?venue.subtitleEn:venue.subtitleZh;stage.dataset.artState='ready';chooser.dataset.artState='ready';select.setAttribute('aria-busy','false');return;}
      stage.dataset.artState='loading';chooser.dataset.artState='loading';select.setAttribute('aria-busy','true');
      const incoming=node('img','venue-art-buffer');incoming.alt='';incoming.draggable=false;incoming.setAttribute('aria-hidden','true');incoming.dataset.venue=venue.id;
      if(!await loadImage(incoming,path)){if(!destroyed&&generation===artGeneration){stage.dataset.artState='error';chooser.dataset.artState='error';select.setAttribute('aria-busy','false');say('loadError');}return;}
      if(destroyed||generation!==artGeneration)return;
      // Three reusable pictures retain the exact visible mix on interruption.
      // Every alpha retargets from its computed value; none is forced opaque.
      // The bound is the venue count, even during an indefinitely rapid switch.
      let surface=[...surfaces].find(item=>item.dataset.venue===venue.id);
      if(!surface){surface=incoming;surface.style.opacity='0';([...surfaces].at(-1)||originalArt).after(surface);surfaces.add(surface);}
      cancelArt(true);
      const effects=[];
      for(const item of surfaces){
        const alpha=item===surface?1:0;
        if(instant||quiet()||!item.animate){item.style.opacity=String(alpha);continue;}
        const effect=item.animate([{opacity:Number(getComputedStyle(item).opacity)},{opacity:alpha}],{duration:250,easing:OUT,fill:'forwards'});
        artMotions.set(item,effect);animations.add(effect);effects.push(effect.finished.then(()=>{item.style.opacity=String(alpha);effect.cancel();if(artMotions.get(item)===effect)artMotions.delete(item);}).finally(()=>animations.delete(effect)));
      }
      try{await Promise.all(effects);}catch(_){return;}
      if(destroyed||generation!==artGeneration)return;
      surface.style.opacity='1';originalArt.src=path;originalArt.alt=language()==='en'?venue.subtitleEn:venue.subtitleZh;
      try{await originalArt.decode();}catch(_){/* Decoded overlay remains until the next successful scene. */}
      if(destroyed||generation!==artGeneration)return;
      paintedVenue=venue.id;originalArt.dataset.venue=venue.id;stage.dataset.artState='ready';chooser.dataset.artState='ready';select.setAttribute('aria-busy','false');cancelArt();discardSurfaces();
    }
    function choose(){
      const id=model.getVenue(select.value).id;
      if(id===state.venue)return;
      const source=selectionSource;selectionSource='pointer';
      update({...state,venue:id,instant:source==='keyboard'});
      try{const result=onSelectVenue?.(id,{source});if(result?.catch)result.catch(()=>{});}catch(_){/* Settings persistence reports its own error. */}
    }
    listen(select,'keydown',()=>{selectionSource='keyboard';});listen(select,'pointerdown',()=>{selectionSource='pointer';});listen(select,'change',choose);
    function update(next={}){
      if(destroyed)return;
      const previous=state;state={...state,...next,venue:model.getVenue(next.venue===undefined?state.venue:next.venue).id,language:next.language===undefined?state.language:next.language==='en'?'en':'zh'};
      const venue=model.getVenue(state.venue),changed=previous.venue!==state.venue;
      office.dataset.venue=state.venue;stage.dataset.venue=state.venue;stage.dataset.phase=state.dayPhase||'morning';stage.dataset.quiet=String(quiet());
      stage.setAttribute('aria-label',language()==='en'?venue.subtitleEn:venue.subtitleZh);
      chooser.dataset.venue=state.venue;label.textContent=copy().choose;select.setAttribute('aria-label',copy().chooseLabel);select.title=(language()==='en'?venue.nameEn:venue.nameZh)+' · '+copy().hint;select.value=state.venue;
      [...select.options].forEach(option=>{const item=model.getVenue(option.value);option.textContent=item.icon+' '+(language()==='en'?item.nameEn:item.nameZh);});
      for(const record of records.values()){
        const visible=record.venue===state.venue;record.widget.hidden=!visible;
        if(!visible||quiet()){
          const brewing=['pouring','steeping'].includes(record.phase);stop(record);
          if(brewing){record.count++;record.phase='ready';if(visible)say('tea',record.count);}
        }
        renderRecord(record);
      }
      if(changed){feedback.textContent='';lastFeedback=null;}
      else if(lastFeedback){const saved=lastFeedback;say(saved.key,saved.arg);}
      if(changed||requestedVenue!==venue.id)paint(venue,Boolean(next.instant||quiet()));
      else if(originalArt)originalArt.alt=language()==='en'?venue.subtitleEn:venue.subtitleZh;
      if(quiet())for(const effect of artMotions.values())effect.finish();
    }
    update({...getState(),instant:true});
    return {
      update,
      destroy(){
        if(destroyed)return;destroyed=true;artGeneration++;
        for(const record of records.values())stop(record);
        cancelArt();for(const animation of animations)animation.cancel();animations.clear();discardSurfaces();
        for(const image of pendingImages){image.onload=null;image.onerror=null;image.removeAttribute('src');}pendingImages.clear();
        listeners.splice(0).forEach(remove=>remove());stage.remove();feedback.remove();chooser.remove();
        if(originalArt){originalArt.removeAttribute('data-venue');if(originalSrc!==null)originalArt.setAttribute('src',originalSrc);if(originalAlt!==null)originalArt.setAttribute('alt',originalAlt);}
        delete office.dataset.venue;
      }
    };
  }
  root.OfficeVenueStage=Object.freeze({create});
})(window);
