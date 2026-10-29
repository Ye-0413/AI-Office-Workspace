'use strict';
const fs=require('node:fs');
const path=require('node:path');

const {MODES:SCENE_TIMES}=require('./day-cycle.js');
const {DEFAULT_VENUE,VENUE_IDS}=require('./venue-model.js');
const {DEFAULT_THEME,DEFAULT_WEATHER,THEME_IDS,WEATHER_MODES}=require('./festival-model.js');
const {IDS:ROOM_IDS}=require('./room-designs.js');
const {migrateMode:migrateAppearanceMode}=require('./agent-appearance.js');
const DEFAULTS=Object.freeze({rain:false,night:false,sceneTime:'auto',sceneVenue:DEFAULT_VENUE,sceneTheme:DEFAULT_THEME,sceneWeather:DEFAULT_WEATHER,roomDesign:'daily',nameStyle:'classic',agentAppearance:'mixed',agentScale:1,reducedMotion:false,sound:false,lowPower:false,idleVisitor:true,selectedProject:'',displayId:null,alwaysOnTop:false,language:'zh'});
function createSettings(dataDir){
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const filename=path.join(dataDir,'settings.json');
  let values={...DEFAULTS};
  try{const stat=fs.lstatSync(filename);if(!stat.isSymbolicLink()&&stat.size<65536){const saved=JSON.parse(fs.readFileSync(filename,'utf8'));const legacySceneTime=saved&&saved.night===true&&!Object.hasOwn(saved,'sceneTime')?'night':'auto';const legacySceneWeather=saved&&saved.rain===true&&!Object.hasOwn(saved,'sceneWeather')?'rain':'auto';values=validate({...DEFAULTS,sceneTime:legacySceneTime,sceneWeather:legacySceneWeather,...saved});}}catch{}
  function validate(candidate){const result={...DEFAULTS};for(const key of Object.keys(DEFAULTS)){if(typeof DEFAULTS[key]==='boolean'){if(typeof candidate[key]!=='boolean')throw new TypeError('Invalid setting: '+key);result[key]=candidate[key];}else if(key==='agentAppearance'){const mode=migrateAppearanceMode(candidate[key]);if(!mode)throw new TypeError('Invalid agent appearance');result[key]=mode;}else if(key==='agentScale'){if(typeof candidate[key]!=='number'||!Number.isFinite(candidate[key])||candidate[key]<.65||candidate[key]>1.35)throw new TypeError('Invalid agent scale');result[key]=candidate[key];}else if(key==='roomDesign'){if(!['daily','legacy',...ROOM_IDS].includes(candidate[key]))throw new TypeError('Invalid room design');result[key]=candidate[key];}else if(key==='nameStyle'){if(!['classic','harbour'].includes(candidate[key]))throw new TypeError('Invalid name style');result[key]=candidate[key];}else if(key==='sceneTime'){if(!SCENE_TIMES.includes(candidate[key]))throw new TypeError('Invalid scene time');result[key]=candidate[key];}else if(key==='sceneVenue'){if(!VENUE_IDS.includes(candidate[key]))throw new TypeError('Invalid scene venue');result[key]=candidate[key];}else if(key==='sceneTheme'){if(candidate[key]!==DEFAULT_THEME&&!THEME_IDS.includes(candidate[key]))throw new TypeError('Invalid scene theme');result[key]=candidate[key];}else if(key==='sceneWeather'){if(!WEATHER_MODES.includes(candidate[key]))throw new TypeError('Invalid scene weather');result[key]=candidate[key];}else if(key==='language'){if(!['en','zh'].includes(candidate[key]))throw new TypeError('Invalid language');result[key]=candidate[key];}else if(key==='selectedProject'){if(typeof candidate[key]!=='string'||candidate[key].length>2048)throw new TypeError('Invalid project');result[key]=candidate[key];}else{if(candidate[key]!==null&&!Number.isInteger(candidate[key]))throw new TypeError('Invalid display');result[key]=candidate[key];}}return result;}
  function get(){return{...values};}
  function set(patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new TypeError('Invalid settings');for(const key of Object.keys(patch))if(!Object.hasOwn(DEFAULTS,key))throw new TypeError('Unknown setting: '+key);const next=validate({...values,...patch});if(fs.existsSync(filename)&&fs.lstatSync(filename).isSymbolicLink())throw new Error('Settings path is a symbolic link');const temporary=filename+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify(next,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,filename);values=next;return get();}
  return{get,set};
}
module.exports={createSettings,DEFAULTS};
