'use strict';
// A public local HTML atlas, not a screenshot of private observation state.
// Original room PNGs are referenced in place; no restored avatar is read.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const Rooms=require('../lib/room-designs.js'),Calendar=require('../lib/room-calendar.js');
const Scene=require('../lib/scene-model.js'),Walking=require('../lib/walking-layout.js'),Size=require('../lib/size-stability.js');
const repo=path.resolve(__dirname,'../..'),out=path.join(repo,'docs/rooms');
const SOURCES=Object.freeze(['office/package.json','office/lib/room-calendar.js','office/lib/festival-model.js','office/lib/festival-studies.js','office/lib/provider-labels.js',
  'office/lib/room-designs.js','office/lib/room-holiday-designs.js','office/lib/scene-model.js',
  'office/lib/walking-layout.js','office/lib/scene-traffic.js','office/lib/size-stability.js',
  'office/renderer/style.css','office/scripts/sync-room-designs.cjs','office/scripts/render-room-gallery.cjs',
  'office/assets/scenes/rooms/generation.json']);
const ZONES=['library','board','bench','desk','sofa','archive','front','lobby','exit'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(value,null,2)+'\n';
const rounded=n=>Math.round(n*1e6)/1e6;
function completeCatalog(catalog){
  assert.equal(catalog.filter(r=>r.kind==='everyday').length,6,'Public room release requires six everyday interiors');
  const holidays=catalog.filter(r=>r.kind==='holiday');
  assert.deepEqual(holidays.map(r=>r.event).sort(),[...Calendar.EVENT_IDS].sort(),
    'Finish every holiday room before publishing the complete gallery');
  assert.equal(catalog.length,33,'Public room release requires 33 complete interiors');
  assert.equal(new Set(catalog.map(r=>r.id)).size,catalog.length,'Gallery identities must be unique');
}
function helperFrameScale(){
  const css=fs.readFileSync(path.join(repo,'office/renderer/style.css'),'utf8');
  const match=/\.actor\[data-helper=["']true["']\]\s*\.actor-button\s*\{[^}]*\bscale\s*:\s*([\d.]+)/.exec(css);
  const scale=match?Number(match[1]):1;
  assert.ok(Number.isFinite(scale)&&scale>0&&scale<=1.35,'Unsupported helper frame scale');
  return scale;
}
function pngDimensions(bytes){
  assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a','Room artwork must be a PNG');
  return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
function dataForRoom(room,metadata,frameScale){
  assert.match(room.id,/^[a-z0-9-]+$/);
  const file='office/assets/scenes/rooms/'+room.id+'.png',bytes=fs.readFileSync(path.join(repo,file));
  const artwork=metadata.images.find(record=>record.id===room.id);
  assert.ok(artwork,'Missing generation provenance for '+room.id);
  assert.equal(artwork.file,room.id+'.png');
  assert.equal(sha(bytes),artwork.sha256,'Original artwork hash changed: '+room.id);
  const dimensions=pngDimensions(bytes);
  assert.equal(dimensions.width,artwork.width);assert.equal(dimensions.height,artwork.height);
  const scene=Rooms.createScene(Scene,room),walking=Walking.forScene(scene);
  const cast=[{id:'preview-main',provider:'codex',status:'active',activity:'reading'},
    {id:'preview-helper',provider:'cursor',status:'active',activity:'planning',parentId:'preview-main'}];
  const page=walking.layoutAllWalking(cast,{requestedScale:1.25,passThrough:true});
  assert.equal(page.seats.size,2);assert.deepEqual(page.overflowIds,[]);
  const markers=cast.map(session=>{
    const point=page.seats.get(session.id),helper=Boolean(session.parentId);
    const footprint=helper?scene.ACTOR_FOOTPRINT.helper:scene.ACTOR_FOOTPRINT.root;
    assert.ok(walking.legalPoint(point,{uniformScale:page.uniformScale,footprint}),room.id+' marker must stand on legal floor');
    const route=walking.route(room.entry,point,{uniformScale:page.uniformScale,footprint});
    assert.ok(route.length>1,room.id+' preview marker must have a real entrance route');
    assert.ok(Math.abs(route.at(-1).x-point.x)<1e-6&&Math.abs(route.at(-1).y-point.y)<1e-6);
    return{id:session.id,helper,zone:scene.activitySpec(session).zone,area:point.area||null,
      x:rounded(point.x),y:rounded(point.y),scale:rounded(page.uniformScale),bodyRatio:Size.bodyRatio(session),
      frameScale:helper?frameScale:1,route:route.map(p=>({x:rounded(p.x),y:rounded(p.y)}))};
  });
  assert.equal(scene.actorsOverlap(page.seats.get(cast[0].id),{uniformScale:page.uniformScale},
    page.seats.get(cast[1].id),{uniformScale:page.uniformScale,helper:true},page.gap),false);
  const geometry={floor:room.floor,entry:room.entry,furniture:room.furniture,obstacles:room.obstacles,areas:room.areas,labels:room.labels};
  return{room:{id:room.id,nameZh:room.nameZh,nameEn:room.nameEn,kind:room.kind,event:room.event||null,
      architecture:room.architecture,src:'../../'+file,...geometry,markers},
    record:{id:room.id,file,sha256:sha(bytes),bytes:bytes.length,...dimensions,geometrySha256:sha(stable(geometry))}};
}
const CSS=`
:root{color-scheme:dark;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0e1720;color:#eaf0f3}
*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button,a,input,select{outline-offset:4px}
button{cursor:pointer}a{color:#9bdbdd}header,main,footer{max-width:1600px;margin:auto;padding:24px 28px}header{padding-bottom:8px}
.eyebrow{color:#a9bac6;font-size:12px;letter-spacing:.13em;text-transform:uppercase}h1{font-size:clamp(27px,4vw,44px);line-height:1.15;margin:8px 0 12px;letter-spacing:-.035em}h2{font-size:18px;line-height:1.3;margin:0}.intro{max-width:930px;color:#bdcbd4;margin:0 0 14px}.notice{font-size:13px;color:#b8c9d0}.toolbar{position:sticky;top:0;z-index:2;padding:14px 28px;background:#0e1720f5;border-block:1px solid #2c3c48}.controls{max-width:1544px;margin:auto;display:flex;flex-wrap:wrap;gap:9px;align-items:center}.controls label{display:flex;gap:8px;align-items:center}.controls input,.controls select,button{border:1px solid #405565;border-radius:8px;background:#1a2a36;color:inherit;padding:8px 11px}.controls input{width:210px}.controls button[aria-pressed=true]{background:#285959;border-color:#75c8c8}.spacer{flex:1}.count{font-size:13px;color:#b9cad5;white-space:nowrap}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.card{min-width:0;background:#14222d;border:1px solid #314552;border-radius:14px;overflow:hidden}.open-room{display:block;width:100%;padding:0;border:0;border-radius:0;background:#0d1720;line-height:0}.room-view{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#1c2932}.card-copy{padding:15px 18px 18px}.card-heading{display:flex;align-items:flex-start;gap:12px}.kind{font-size:11px;white-space:nowrap;border:1px solid #4a6872;border-radius:20px;padding:3px 8px;color:#aed7d4}.room-id{font:12px/1.4 ui-monospace,SFMono-Regular,monospace;color:#92a9b9;margin-top:5px}.architecture{font-size:13px;color:#bdcbd4;margin:10px 0 0}.footnote{font-size:12px;color:#9db1bf;margin-top:10px}.secondary-name{font-size:13px;color:#a6bdc9;margin-top:3px}.empty{color:#b9cad5;grid-column:1/-1;padding:40px 0}.map-legend{display:flex;flex-wrap:wrap;gap:5px 14px;max-width:1544px;margin:9px auto 0;font-size:12px;color:#bed0d8}.legend-item{display:inline-flex;align-items:center;gap:6px}.swatch{width:10px;height:10px;border-radius:2px}.swatch[data-zone=library]{background:#64c7eb}.swatch[data-zone=board]{background:#cba4fa}.swatch[data-zone=bench]{background:#f2b75e}.swatch[data-zone=desk]{background:#62d5b3}.swatch[data-zone=sofa]{background:#ee99ad}.swatch[data-zone=archive]{background:#e3da77}.swatch[data-zone=front]{background:#e89b70}.swatch[data-zone=lobby]{background:#a7c0d3}.swatch[data-zone=exit]{background:#ffffff}.layers-note{font-size:12px;color:#95acbb;max-width:1544px;margin:8px auto 0}.furniture-layer,.areas-layer,.routes-layer,.clock-layer{display:none}body[data-furniture=true] .furniture-layer,body[data-areas=true] .areas-layer,body[data-routes=true] .routes-layer,body[data-furniture=true] .clock-layer{display:inline}body[data-markers=false] .markers-layer{display:none}svg text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}dialog{border:1px solid #527181;border-radius:14px;background:#101e28;color:inherit;max-width:calc(100vw - 32px);width:1440px;max-height:calc(100vh - 32px);padding:0;overflow:auto}dialog::backdrop{background:#02080ddc}.detail-heading{display:flex;gap:16px;align-items:center;padding:15px 18px}.detail-heading h2{flex:1}.detail-close{flex:none}#detail-view{padding:0 12px 12px}#detail-view .room-view{width:100%;height:min(calc(100vh - 190px),800px);min-height:160px;aspect-ratio:auto}#detail-copy{padding:0 18px 18px;color:#bdcbd4;font-size:13px}footer{font-size:12px;color:#9eb4c1;padding-top:8px;padding-bottom:40px}footer p{max-width:980px}noscript{display:block;padding:24px;color:#ffd7a6}@media(min-width:1800px){.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:850px){.gallery{grid-template-columns:1fr}header,main,footer{padding-inline:16px}.toolbar{padding:12px 16px}.controls input{width:170px}.controls button,.controls input,.controls select{font-size:13px;padding:7px 9px}.spacer{display:none}.count{width:100%}dialog{max-width:calc(100vw - 16px);max-height:calc(100vh - 16px)}}
`;
function browserGallery(data){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const colors={library:'#64c7eb',board:'#cba4fa',bench:'#f2b75e',desk:'#62d5b3',sofa:'#ee99ad',archive:'#e3da77',front:'#e89b70',lobby:'#a7c0d3',exit:'#ffffff'};
  const copy={en:{title:'33 rooms. 33 different places.',intro:'Six everyday interiors and 27 holiday rooms, each with its own architecture, furniture and usable floor. Inspect the original art, then turn on the geometry to compare layouts.',
    notice:'Public preview · two original capsule markers, no real sessions or restricted character artwork.',search:'Find a room',filter:'Room type',all:'All rooms',everyday:'Everyday',holiday:'Holiday',language:'中文',furniture:'Furniture map',areas:'Activity areas',routes:'Entrance routes',markers:'Preview markers',count:(n,total)=>n+' of '+total+' rooms',open:'Inspect full room',close:'Close',main:'Demo main',helper:'Demo helper',reading:'Reading',planning:'Planning',entry:'Entrance',clock:'Clock reserve',fit:'Two-marker model fit',architecture:'Architecture',scope:'Geometry overlays and routes come from the production scene and walking models for two synthetic identities. The capsule drawings are original schematic markers; they do not show avatar choreography, live-client activity or proof of arbitrary crowd readability.',source:'Calendar rules and verification boundaries',kind:'Type'},
    zh:{title:'33 个房间，33 种空间。',intro:'六种日常建筑与二十七种节日空间，各有独立建筑、家具与可用地面。先看完整原画，再打开几何图层比较布局。',
    notice:'公开预览 · 两个原创示意角色，不含真实会话或受限角色素材。',search:'搜索房间',filter:'房间类型',all:'全部房间',everyday:'日常',holiday:'节日',language:'EN',furniture:'家具范围',areas:'活动区域',routes:'入口路径',markers:'示意角色',count:(n,total)=>n+' / '+total+' 个房间',open:'查看完整房间',close:'关闭',main:'示意主角色',helper:'示意分身',reading:'阅读',planning:'规划',entry:'入口',clock:'时钟保留区',fit:'两个示意角色的模型适配',architecture:'建筑',scope:'几何区域与路径由实际场景和行路模型针对两个虚构身份计算。原创胶囊图形只是空间示意，不展示角色动作或真实客户端活动，也不证明任意拥挤程度下昵称仍可读。',source:'日历规则与验证范围',kind:'类型'}};
  const zoneNames={library:['Reference','资料'],board:['Planning','规划'],bench:['Testing','测试'],desk:['Coding','代码'],sofa:['Lounge','休息'],archive:['Archive','归档'],front:['Reply','联络'],lobby:['Observation','观察'],exit:['Entrance','入口']};
  let language='en';
  const $=id=>document.getElementById(id),word=key=>copy[language][key],name=room=>language==='en'?room.nameEn:room.nameZh;
  function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function svg(tag,attributes={},text){const node=document.createElementNS(NS,tag);for(const[key,value]of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
  function rectPercent(rect,attributes={}){return svg('rect',{x:rect.x1*12.8,y:rect.y1*7.2,width:(rect.x2-rect.x1)*12.8,height:(rect.y2-rect.y1)*7.2,...attributes});}
  function marker(item){
    const color=item.helper?'#b0ead9':'#a7d6f0',group=svg('g',{transform:'translate('+item.x*12.8+' '+item.y*7.2+') scale('+item.scale+')','data-preview-marker':item.id});
    const frame=svg('g',{transform:'scale('+item.frameScale+')'}),body=svg('g',{transform:'scale('+item.bodyRatio+')'});
    body.append(svg('rect',{x:-40,y:-85,width:80,height:78,rx:21,fill:color,stroke:'#18323c','stroke-width':3}),
      svg('rect',{x:-48,y:-57,width:12,height:28,rx:5,fill:color,stroke:'#18323c','stroke-width':3}),
      svg('rect',{x:36,y:-57,width:12,height:28,rx:5,fill:color,stroke:'#18323c','stroke-width':3}),
      svg('rect',{x:-30,y:-10,width:22,height:11,rx:4,fill:'#274958'}),svg('rect',{x:8,y:-10,width:22,height:11,rx:4,fill:'#274958'}),
      svg('circle',{cx:-14,cy:-56,r:5,fill:'#1c3440'}),svg('circle',{cx:14,cy:-56,r:5,fill:'#1c3440'}));
    frame.append(body,svg('rect',{x:-110,y:12,width:220,height:63,rx:9,fill:'#11232eee',stroke:color,'stroke-width':2}),
      svg('text',{x:0,y:40,'text-anchor':'middle','font-size':24,'font-weight':650,fill:'#f2f7f8'},word(item.helper?'helper':'main')),
      svg('text',{x:0,y:62,'text-anchor':'middle','font-size':15,fill:color},(item.helper?'↳ ':'')+word(item.helper?'planning':'reading')));
    group.append(frame);return group;
  }
  function roomView(room){
    const view=svg('svg',{viewBox:'0 0 1280 720',class:'room-view',role:'img','aria-label':name(room)+' · '+room.architecture});
    view.append(svg('title',{},name(room)),svg('image',{href:room.src,x:0,y:0,width:1280,height:720,preserveAspectRatio:'xMidYMid slice'}));
    const furniture=svg('g',{class:'furniture-layer'});
    for(const rect of room.obstacles)furniture.append(rectPercent(rect,{fill:'#ff7d4019',stroke:'#ff8f62','stroke-width':2,'stroke-dasharray':'3 5'}));
    for(const[id,rect]of Object.entries(room.furniture)){furniture.append(rectPercent(rect,{fill:'#ff715014',stroke:'#ffb091','stroke-width':2,'stroke-dasharray':'8 4'}));
      furniture.append(svg('text',{x:(rect.x1+rect.x2)*6.4,y:rect.y2*7.2-7,'text-anchor':'middle','font-size':16,fill:'#fff8ef',stroke:'#332419','stroke-width':4,'paint-order':'stroke'},room.labels[id][language==='en'?1:0]));}
    furniture.append(rectPercent(room.floor,{fill:'none',stroke:'#eaf8f3','stroke-width':2,'stroke-dasharray':'3 8'}));
    const areas=svg('g',{class:'areas-layer'});
    for(const[id,rects]of Object.entries(room.areas))for(const rect of rects)areas.append(rectPercent(rect,{fill:colors[id],opacity:.22,stroke:colors[id],'stroke-width':2}));
    const clock=svg('g',{class:'clock-layer'});for(const rect of data.clockReserved){clock.append(svg('rect',{x:rect.left,y:rect.top,width:rect.right-rect.left,height:rect.bottom-rect.top,fill:'#07111a66',stroke:'#f4f6f7','stroke-width':2,'stroke-dasharray':'5 6'}),svg('text',{x:(rect.left+rect.right)/2,y:(rect.top+rect.bottom)/2,'text-anchor':'middle','font-size':20,fill:'#ffffff'},word('clock')));}
    const routes=svg('g',{class:'routes-layer'});
    for(const item of room.markers)routes.append(svg('polyline',{points:item.route.map(p=>p.x*12.8+','+p.y*7.2).join(' '),fill:'none',stroke:item.helper?'#b0ead9':'#a7d6f0','stroke-width':5,'stroke-linejoin':'round','stroke-linecap':'round','stroke-dasharray':item.helper?'10 7':'none'}));
    routes.append(svg('circle',{cx:room.entry.x*12.8,cy:room.entry.y*7.2,r:11,fill:'#ffffff',stroke:'#153140','stroke-width':4}),svg('text',{x:room.entry.x*12.8,y:room.entry.y*7.2+34,'text-anchor':'middle','font-size':18,fill:'#ffffff',stroke:'#132733','stroke-width':4,'paint-order':'stroke'},word('entry')));
    const markers=svg('g',{class:'markers-layer'});room.markers.slice().sort((a,b)=>a.y-b.y).forEach(item=>markers.append(marker(item)));
    view.append(furniture,areas,clock,routes,markers);return view;
  }
  function inspect(room){$('detail-title').textContent=name(room);$('detail-view').replaceChildren(roomView(room));$('detail-copy').textContent=room.architecture+' · '+word('fit')+': '+Math.round(room.markers[0].scale*100)+'%';$('detail').showModal();}
  function render(){
    const query=$('search').value.trim().toLocaleLowerCase(),kind=$('kind').value;
    const rooms=data.rooms.filter(room=>(kind==='all'||room.kind===kind)&&[room.id,room.nameEn,room.nameZh,room.architecture,room.event||''].join(' ').toLocaleLowerCase().includes(query));
    const cards=rooms.map(room=>{const card=el('article','card'),open=el('button','open-room');open.type='button';open.setAttribute('aria-label',word('open')+': '+name(room));open.append(roomView(room));open.addEventListener('click',()=>inspect(room));
      const details=el('div','card-copy'),heading=el('div','card-heading'),names=el('div');names.append(el('h2','',name(room)),el('div','secondary-name',language==='en'?room.nameZh:room.nameEn));heading.append(names,el('span','kind',word(room.kind)));details.append(heading,el('div','room-id',room.id),el('p','architecture',room.architecture),el('div','footnote',word('fit')+': '+Math.round(room.markers[0].scale*100)+'% · '+word('open')));card.append(open,details);return card;});
    $('gallery').replaceChildren(...cards);if(!cards.length)$('gallery').append(el('p','empty',language==='en'?'No matching rooms.':'没有匹配的房间。'));
    $('count').textContent=word('count')(rooms.length,data.rooms.length);
  }
  function translate(){document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'AI Work Space · Complete room gallery':'AI Work Space · 完整房间图鉴';
    for(const node of document.querySelectorAll('[data-copy]'))node.textContent=word(node.dataset.copy);$('search').placeholder=word('search');$('search').setAttribute('aria-label',word('search'));$('kind').setAttribute('aria-label',word('filter'));
    $('legend').replaceChildren(...Object.entries(colors).map(([id])=>{const item=el('span','legend-item'),swatch=el('span','swatch');swatch.dataset.zone=id;item.append(swatch,el('span','',zoneNames[id][language==='en'?0:1]));return item;}));render();}
  $('search').addEventListener('input',render);$('kind').addEventListener('change',render);$('language').addEventListener('click',()=>{language=language==='en'?'zh':'en';translate();});
  for(const button of document.querySelectorAll('[data-layer]'))button.addEventListener('click',()=>{const key=button.dataset.layer,enabled=document.body.dataset[key]!=='true';document.body.dataset[key]=String(enabled);button.setAttribute('aria-pressed',String(enabled));});
  $('detail-close').addEventListener('click',()=>$('detail').close());$('detail').addEventListener('click',event=>{if(event.target===$('detail')){const rect=$('detail').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('detail').close();}});
  translate();
}
function documentFor(data){
  const script='('+browserGallery.toString()+')('+JSON.stringify(data).replace(/</g,'\\u003c')+');';
  const policy="default-src 'none'; img-src 'self' file:; style-src 'sha256-"+crypto.createHash('sha256').update(CSS).digest('base64')+"'; script-src 'sha256-"+crypto.createHash('sha256').update(script).digest('base64')+"'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><title>AI Work Space · Complete room gallery</title><style>'+CSS+'</style></head>\n'+
    '<body data-furniture="false" data-areas="false" data-routes="false" data-markers="true"><header><div class="eyebrow">AI Work Space · Room atlas</div><h1 data-copy="title">33 rooms. 33 different places.</h1><p class="intro" data-copy="intro"></p><p class="notice" data-copy="notice"></p></header>'+
    '<section class="toolbar" aria-label="Gallery controls"><div class="controls"><input id="search" type="search" autocomplete="off"><select id="kind"><option value="all" data-copy="all">All rooms</option><option value="everyday" data-copy="everyday">Everyday</option><option value="holiday" data-copy="holiday">Holiday</option></select>'+
    '<button type="button" data-layer="furniture" data-copy="furniture" aria-pressed="false">Furniture map</button><button type="button" data-layer="areas" data-copy="areas" aria-pressed="false">Activity areas</button><button type="button" data-layer="routes" data-copy="routes" aria-pressed="false">Entrance routes</button><button type="button" data-layer="markers" data-copy="markers" aria-pressed="true">Preview markers</button><span class="spacer"></span><button id="language" type="button" data-copy="language">中文</button><output id="count" class="count" aria-live="polite"></output></div><div id="legend" class="map-legend"></div><p class="layers-note">1280 × 720 · original paintings · production furniture / floor / entrance coordinates</p></section>'+
    '<main><div id="gallery" class="gallery"></div></main><footer><p data-copy="scope"></p><a href="../../office/docs/room-designs.md" data-copy="source">Calendar rules and verification boundaries</a><p>Original room artwork is referenced from the repository. No provider messages, private data, remote resources or restricted avatar files are used.</p></footer>'+
    '<dialog id="detail" aria-labelledby="detail-title"><div class="detail-heading"><h2 id="detail-title"></h2><button id="detail-close" type="button" class="detail-close" data-copy="close">Close</button></div><div id="detail-view"></div><div id="detail-copy"></div></dialog><noscript>This local gallery needs JavaScript to draw geometry and synthetic markers. The original PNGs remain in office/assets/scenes/rooms/.</noscript><script>'+script+'</script></body></html>\n';
}
function buildGallery(){
  completeCatalog(Rooms.CATALOG);
  const compiled=require('./sync-room-designs.cjs').build();
  assert.equal(fs.readFileSync(path.join(repo,'office/lib/room-holiday-designs.js'),'utf8'),compiled.source,'Compile holiday profiles before exporting the gallery');
  const profileFiles=compiled.rows.map(room=>'office/design/room-profiles/'+room.id+'.json');
  const hashes=()=>Object.fromEntries(SOURCES.concat(profileFiles).map(file=>[file,sha(fs.readFileSync(path.join(repo,file)))]));
  const sourceHashes=hashes();
  const metadata=require('../assets/scenes/rooms/generation.json'),frameScale=helperFrameScale();
  const rows=Rooms.CATALOG.map(room=>dataForRoom(room,metadata,frameScale));
  const data={rooms:rows.map(row=>row.room),clockReserved:Scene.CLOCK_RESERVED};
  const html=documentFor(data);
  assert.deepEqual(hashes(),sourceHashes,'Production/gallery sources changed during room export');
  const manifest={schemaVersion:1,version:require('../package.json').version,scope:'33 complete original room paintings: six everyday interiors and all 27 holiday occasions. Public static capsule markers and optional production geometry overlays only.',
    rooms:rows.map(row=>row.record),everydayIds:Rooms.DAILY_IDS,holidayEvents:Calendar.EVENT_IDS,
    preview:{identities:2,source:'Synthetic root reading and its synthetic planning helper, fitted by production scene/walking models with passThrough enabled and a 125% ceiling.',
      avatars:'Original code-native SVG capsule markers; no restored character assets, avatar URLs, observed sessions or native captures.',
      helperBodyRatio:Size.bodyRatio({parentId:'preview-main'}),helperFrameScale:frameScale,restrictedArtworkReads:0,networkRequests:0,
      certifiesLiveClient:false,certifiesAvatarChoreography:false,certifiesArbitraryCrowdReadability:false},
    sourceHashes,html:{file:'index.html',sha256:sha(html),bytes:Buffer.byteLength(html)}};
  return{html,manifest};
}
function main(){
  const {html,manifest}=buildGallery(),htmlPath=path.join(out,'index.html'),manifestPath=path.join(out,'manifest.json');
  if(process.argv.includes('--check')){
    assert.ok(fs.existsSync(htmlPath)&&fs.existsSync(manifestPath),'Generate the complete room gallery first');
    assert.equal(fs.readFileSync(htmlPath,'utf8'),html,'Re-export the room gallery after changing its sources');
    assert.equal(fs.readFileSync(manifestPath,'utf8'),stable(manifest),'Room gallery manifest no longer matches artwork, geometry or production sources');
  }else{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(htmlPath,html);fs.writeFileSync(manifestPath,stable(manifest));}
  console.log(JSON.stringify({ok:true,checked:process.argv.includes('--check'),rooms:manifest.rooms.length,syntheticMarkersPerRoom:2,restrictedArtworkReads:0,html:htmlPath}));
}
if(require.main===module)main();
module.exports={SOURCES,completeCatalog,buildGallery,documentFor,browserGallery};
