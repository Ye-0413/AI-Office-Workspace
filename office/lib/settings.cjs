'use strict';
const fs=require('node:fs');
const path=require('node:path');

const {MODES:SCENE_TIMES}=require('./day-cycle.js');
const DEFAULTS=Object.freeze({rain:false,night:false,sceneTime:'auto',reducedMotion:false,sound:false,lowPower:false,idleVisitor:true,selectedProject:'',displayId:null,alwaysOnTop:false,language:'zh'});
function createSettings(dataDir){
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const filename=path.join(dataDir,'settings.json');
  let values={...DEFAULTS};
  try{const stat=fs.lstatSync(filename);if(!stat.isSymbolicLink()&&stat.size<65536){const saved=JSON.parse(fs.readFileSync(filename,'utf8'));const legacySceneTime=saved&&saved.night===true&&!Object.hasOwn(saved,'sceneTime')?'night':'auto';values=validate({...DEFAULTS,sceneTime:legacySceneTime,...saved});}}catch{}
  function validate(candidate){const result={...DEFAULTS};for(const key of Object.keys(DEFAULTS)){if(typeof DEFAULTS[key]==='boolean'){if(typeof candidate[key]!=='boolean')throw new TypeError('Invalid setting: '+key);result[key]=candidate[key];}else if(key==='sceneTime'){if(!SCENE_TIMES.includes(candidate[key]))throw new TypeError('Invalid scene time');result[key]=candidate[key];}else if(key==='language'){if(!['en','zh'].includes(candidate[key]))throw new TypeError('Invalid language');result[key]=candidate[key];}else if(key==='selectedProject'){if(typeof candidate[key]!=='string'||candidate[key].length>2048)throw new TypeError('Invalid project');result[key]=candidate[key];}else{if(candidate[key]!==null&&!Number.isInteger(candidate[key]))throw new TypeError('Invalid display');result[key]=candidate[key];}}return result;}
  function get(){return{...values};}
  function set(patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new TypeError('Invalid settings');for(const key of Object.keys(patch))if(!Object.hasOwn(DEFAULTS,key))throw new TypeError('Unknown setting: '+key);const next=validate({...values,...patch});if(fs.existsSync(filename)&&fs.lstatSync(filename).isSymbolicLink())throw new Error('Settings path is a symbolic link');const temporary=filename+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify(next,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,filename);values=next;return get();}
  return{get,set};
}
module.exports={createSettings,DEFAULTS};
