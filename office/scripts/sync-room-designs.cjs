'use strict';
// Original room geometry is authored as reviewable JSON, then shipped as one
// local browser module. No runtime file/network discovery is required.
const fs=require('node:fs'),path=require('node:path');
const Calendar=require('../lib/room-calendar.js');
const folder=path.resolve(__dirname,'../design/room-profiles'),target=path.resolve(__dirname,'../lib/room-holiday-designs.js');
const zones=['library','board','bench','desk','sofa','archive','front','lobby','exit'];
function rectangle(r){return Array.isArray(r)&&r.length===4&&r.every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&r[0]<r[2]&&r[1]<r[3];}
function build(){
  const rows=fs.readdirSync(folder).filter(name=>name.endsWith('.json')).map(name=>{
    const row=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
    if(name!==row.id+'.json'||!Calendar.EVENT_IDS.includes(row.id)||row.event!==row.id||row.kind!=='holiday')throw Error('Invalid holiday room identity: '+name);
    if(![row.nameZh,row.nameEn,row.architecture].every(v=>typeof v==='string'&&v.trim()))throw Error('Missing bilingual room identity or architecture: '+name);
    if(!rectangle(row.floor)||!Array.isArray(row.entry)||row.entry.length!==2||!row.entry.every(Number.isFinite))throw Error('Invalid floor or entry: '+name);
    for(const id of zones){if(!row.areas[id]?.length||!row.areas[id].every(rectangle))throw Error('Missing real station apron '+id+': '+name);}
    for(const id of zones.slice(0,6))if(!rectangle(row.furniture[id]))throw Error('Missing furniture footprint '+id+': '+name);
    if(row.obstacles&&!row.obstacles.every(rectangle)||row.extraObstacles&&!row.extraObstacles.every(rectangle))throw Error('Invalid furniture collision map: '+name);
    if(!fs.existsSync(path.resolve(folder,'../../assets/scenes/rooms',row.id+'.png')))throw Error('Selected original painting is missing: '+name);
    return row;
  }).sort((a,b)=>Calendar.EVENT_IDS.indexOf(a.id)-Calendar.EVENT_IDS.indexOf(b.id));
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate room identity');
  const source="/* Generated from office/design/room-profiles by sync-room-designs.cjs. */\n(function(root,factory){'use strict';const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.OfficeHolidayRooms=value;})(typeof globalThis==='object'?globalThis:this,function(){\n  'use strict';\n  return "+JSON.stringify(rows,null,2).split('\n').join('\n  ')+";\n});\n";
  return{rows,source};
}
if(require.main===module){
  const {rows,source}=build();
  if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==source)throw Error('Run node office/scripts/sync-room-designs.cjs after editing room profiles');}
  else fs.writeFileSync(target,source);
  console.log(JSON.stringify({ok:true,holidayRooms:rows.length,checked:process.argv.includes('--check')}));
}
module.exports={build};
