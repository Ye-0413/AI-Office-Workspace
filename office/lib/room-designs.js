/* Complete rooms: authored furniture, usable floor, stations and entrances. */
(function(root,factory){
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./room-calendar.js'):root.OfficeRoomCalendar,
    typeof module==='object'&&module.exports?require('./room-holiday-designs.js'):root.OfficeHolidayRooms);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.OfficeRoomDesigns=api;
})(typeof globalThis==='object'?globalThis:this,function(Calendar,HolidayRooms){
  'use strict';
  const ZONES=['library','board','bench','desk','sofa','archive','front','lobby','exit'];
  const LABELS={library:['资料书架','Reference library'],board:['构思白板','Planning station'],bench:['构建实验台','Test bench'],
    desk:['代码工位','Coding desks'],sofa:['休息角','Lounge'],archive:['成果架','Archive'],front:['联络台','Reply station'],lobby:['观察位','Observation area'],exit:['入口','Entrance']};
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  const rect=([x1,y1,x2,y2])=>({x1,y1,x2,y2});
  function design(raw){
    const zones=Object.fromEntries(ZONES.map(id=>[id,(raw.areas[id]||raw.areas.lobby).map((bounds,i)=>({
      id:raw.id+'-'+id+'-'+i,...rect(bounds),labelZh:(raw.labels?.[id]||LABELS[id])[0],labelEn:(raw.labels?.[id]||LABELS[id])[1]
    }))]));
    const furniture=Object.fromEntries(Object.entries(raw.furniture).map(([id,bounds])=>[id,rect(bounds)]));
    const stationMounts=Object.fromEntries(Object.entries(furniture).map(([id,r])=>[id,[[(r.x1+r.x2)*6.4,(r.y1+r.y2)*3.6]]]));
    return freeze({...raw,areas:zones,furniture,obstacles:raw.obstacles?raw.obstacles.map(rect):[...Object.values(furniture),...(raw.extraObstacles||[]).map(rect)],
      stationMounts,background:'../assets/scenes/rooms/'+raw.id+'.png',key:'room:'+raw.id,
      floor:rect(raw.floor||[5,34,95,86]),entry:{x:raw.entry[0],y:raw.entry[1]},
      labels:Object.fromEntries(ZONES.map(id=>[id,raw.labels?.[id]||LABELS[id]]))});
  }
  // Coordinates were reviewed against the delivered paintings, not merely
  // copied from the generation prompts. Rectangles conservatively include
  // chairs and islands; each station is a real adjacent floor apron.
  const CATALOG=freeze([
    design({id:'rain-courtyard',nameZh:'听雨庭院',nameEn:'Rain Courtyard',icon:'☂',effectVenue:'teahouse',kind:'everyday',
      architecture:'Asymmetrical machiya courtyard, shoji walls, wet slate and low timber furnishings',entry:[50,77],floor:[5,39.5,95,86],
      furniture:{library:[67,27,88,40],board:[12,29,34,40],bench:[2,41,26,56],desk:[66,44,94,62],sofa:[1,59,26,77],archive:[94,41,100,70]},
      extraObstacles:[[0,81,38,100],[63,81,100,100]],
      areas:{library:[[68,41.1,91,43.1],[59,40,65,57]],board:[[28,42,37,55]],bench:[[28,56.9,39,63]],desk:[[65,64,92,72]],
        sofa:[[28,65,39,79]],archive:[[88,72,93,79]],front:[[40,72,61,80]],lobby:[[40,61,62,70]],exit:[[43,74,58,79]]},
      labels:{library:['藏书廊','Book alcove'],board:['绘图案','Drafting ledge'],bench:['器物台','Instrument table'],desk:['低案工位','Low worktables'],sofa:['竹榻','Bamboo lounge'],archive:['卷宗柜','Scroll archive']}}),
    design({id:'orbital-bridge',nameZh:'环星舰桥',nameEn:'Orbital Bridge',icon:'◉',effectVenue:'observatory',kind:'everyday',
      architecture:'Curved pressure hull and panoramic planet window around a hexagonal mission island',entry:[47,78],
      furniture:{library:[0,12,23,37],board:[33,34,68,55],bench:[0,37,23,63],desk:[61,25,94,44],sofa:[73,58,100,82],archive:[95,15,100,62]},
      extraObstacles:[[0,76,25,100]],
      areas:{library:[[25,45,31,50]],board:[[35,57,67,66]],bench:[[25,53,31,65]],desk:[[70,46,92,54]],
        sofa:[[64,65,71,80]],archive:[[88,46,93,56]],front:[[34,70,63,83]],lobby:[[53,68,64,79]],exit:[[40,75,54,82]]},
      labels:{library:['资料舱','Data alcove'],board:['任务中枢','Mission core'],bench:['仪器甲板','Instrument deck'],desk:['导航工位','Navigation bank'],sofa:['值航休息席','Crew lounge'],archive:['样本舱','Sample archive']}}),
    design({id:'grand-library',nameZh:'鎏金大书房',nameEn:'Grand Library',icon:'▥',effectVenue:'workshop',kind:'everyday',
      architecture:'Tall Art Deco vaulted salon, emerald mezzanines, angled reading table and writing carrels',entry:[53,78],floor:[5,39,95,86],
      furniture:{library:[9,50,36,85],board:[38,32,64,44],bench:[15,35,34,44],desk:[72,38,95,57],sofa:[79,60,100,88],archive:[0,10,8,65]},
      extraObstacles:[[17,7,35,34],[66,7,80,35]],
      areas:{library:[[38,52,45,78]],board:[[39,46,64,52]],bench:[[15,46,33,48.5]],desk:[[65,44,70,64]],
        sofa:[[67,67,77,84]],archive:[[10,40,13,48]],front:[[46,73,65,84]],lobby:[[47,57,63,70]],exit:[[47,75,62,83]]},
      labels:{library:['长桌阅览席','Reading table'],board:['舆图台','Map counter'],bench:['修复台','Restoration bench'],desk:['书写小间','Writing carrels'],sofa:['绿绒沙龙','Velvet salon'],archive:['珍本书墙','Rare-book wall']}}),
    design({id:'glasshouse',nameZh:'日光温室',nameEn:'Sunlit Glasshouse',icon:'❧',effectVenue:'teahouse',kind:'everyday',
      architecture:'Asymmetrical cast-iron conservatory, large specimen island and curved laptop bar',entry:[53,78],
      furniture:{library:[6,13,24,53],board:[60,31,86,48],bench:[15,40,53,62],desk:[68,55,92,80],sofa:[0,63,29,100],archive:[93,34,100,67]},
      areas:{library:[[26,35,40,38.5]],board:[[61,50,86,54]],bench:[[31,64,53,73]],desk:[[59,58,66,78]],
        sofa:[[31,76,42,85]],archive:[[87,44,92,52]],front:[[44,76,61,85]],lobby:[[54,65,65,74]],exit:[[47,75,61,83]]},
      labels:{library:['植物志柜','Botanical library'],board:['标本绘图台','Specimen drafting'],bench:['育苗实验岛','Specimen island'],desk:['日光工作吧','Sunlit workbar'],sofa:['藤椅花隅','Wicker lounge'],archive:['种子样本架','Seed archive']}}),
    design({id:'coastal-atelier',nameZh:'蔚蓝海岸画室',nameEn:'Coastal Atelier',icon:'≈',effectVenue:'workshop',kind:'everyday',
      architecture:'Limewashed vaulted loggia, asymmetric cobalt workbar and freestanding drawing table',entry:[48,78],
      furniture:{library:[72,10,94,43],board:[54,36,76,51],bench:[13,29,34,40],desk:[6,38,30,73],sofa:[80,53,100,100],archive:[0,20,7,86]},
      areas:{library:[[77,45,92,51]],board:[[51,53,76,63]],bench:[[32,41,40,51]],desk:[[32,53,41,73]],
        sofa:[[70,66,78,85]],archive:[[9,75,23,84]],front:[[42,74,66,84]],lobby:[[42,58,51,70]],exit:[[41,75,56,83]]},
      labels:{library:['海图书龛','Sea-chart alcove'],board:['画稿案','Drawing table'],bench:['陶器实验台','Ceramic bench'],desk:['蓝瓷工作吧','Cobalt workbar'],sofa:['海风休息席','Sea-breeze lounge'],archive:['画卷藏柜','Drawing archive']}}),
    design({id:'undersea-lab',nameZh:'深蓝海底实验室',nameEn:'Undersea Laboratory',icon:'⌁',effectVenue:'observatory',kind:'everyday',
      architecture:'Ribbed circular habitat with oval sea windows, front-left computer island and right lab peninsula',entry:[77,78],
      furniture:{library:[34,32,61,41],board:[65,24,87,44],bench:[69,41,94,70],desk:[7,50,38,80],sofa:[13,34,31,46],archive:[0,27,11,61]},
      extraObstacles:[[93,38,100,100]],
      areas:{library:[[35,43,60,49]],board:[[62,33,64,46]],bench:[[60,53,67,69]],desk:[[40,54,48,79]],
        sofa:[[14,47,30,49]],archive:[[12,47,18,49]],front:[[52,74,78,84]],lobby:[[51,56,59,70]],exit:[[71,73,87,82]]},
      labels:{library:['海洋文库','Ocean library'],board:['航图工作台','Chart bench'],bench:['深海实验台','Deep-sea bench'],desk:['潜航计算岛','Dive console island'],sofa:['水下休息舱','Habitat lounge'],archive:['珊瑚样本柜','Coral archive']}})
  ].concat((HolidayRooms||[]).map(design)));
  const IDS=freeze(CATALOG.map(r=>r.id));
  const DAILY_IDS=freeze(CATALOG.filter(r=>r.kind==='everyday').map(r=>r.id));
  const scenes=new WeakMap();
  function get(id){return CATALOG.find(r=>r.id===id)||null;}
  function resolve({selection='daily',now=Date.now(),seed='office'}={}){
    const manual=get(selection),occasion=Calendar.resolve(now);
    const special=CATALOG.find(r=>r.event===occasion.event&&r.kind==='holiday');
    const room=manual||special||get(Calendar.dailyChoice(DAILY_IDS,now,seed));
    return freeze({room,id:room.id,key:room.key,dateIso:occasion.dateIso,event:manual?null:occasion.event,
      mode:manual?'manual':special?'holiday':'daily',background:room.background});
  }
  function createScene(base,id){
    const room=typeof id==='string'?get(id):id;
    if(!room)throw new TypeError('Unknown room geometry');
    let cache=scenes.get(base);if(!cache){cache=new Map();scenes.set(base,cache);}if(cache.has(room.id))return cache.get(room.id);
    const domain=room.floor;
    const zones=Object.fromEntries(ZONES.map(id=>{const area=room.areas[id][0],x=(area.x1+area.x2)/2,y=(area.y1+area.y2)/2;
      return[id,{...base.ZONES[id],name:room.labels[id][0],x,y,seats:[[x,y]]}];}));
    const scene=Object.freeze({...base,ROOM_LAYOUT:room.id,ROOM:room,ACTOR_DOMAIN:domain,ENTRY_POINT:room.entry,
      ZONES:freeze(zones),OBSTACLES:room.obstacles,WALKING_AREAS:room.areas,CORRIDORS:[],
      HOLDING_POINTS:freeze(Array.from({length:35},(_,i)=>({x:14+(i%7)*12,y:44+Math.floor(i/7)*8}))),
      STATION_AREAS:freeze(Object.fromEntries(ZONES.map(id=>[id,room.areas[id][0]]))),
      stationCompatible:(p,id)=>(room.areas[id]||[]).some(a=>p&&p.x>=a.x1&&p.x<=a.x2&&p.y>=a.y1&&p.y<=a.y2),
      legalActorPoint:(p,options={})=>base.legalActorPoint(p,{...options,domain,obstacles:room.obstacles})});
    cache.set(room.id,scene);return scene;
  }
  function zoneLabel(id,zone,language='zh'){return get(id)?.labels[zone]?.[language==='en'?1:0]||'';}
  return Object.freeze({CATALOG,IDS,DAILY_IDS,get,resolve,createScene,zoneLabel});
});
