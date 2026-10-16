'use strict';

// Command-observer configuration plans, based on the upstream installers' actual
// schemas. The bridge supplies its existing safe reader, lock and atomic writer.
const fs=require('node:fs');
const path=require('node:path');
const {getProvider}=require('./provider-catalog.cjs');
const GROUP='mini-office-observer-v1';
const COMMON_EVENTS=['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop','StopFailure','SubagentStart','SubagentStop','Notification','PreCompact','PostCompact'];
const DEFINITIONS=Object.freeze({
 codebuddy:{dir:'.codebuddy',file:['settings.json'],shape:'nested'},
 'grok-build':{dir:'.grok',file:['hooks','mini-office-observer.json'],env:'GROK_HOME',shape:'nested',events:['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop','StopFailure','StopCancelled','Notification','PreCompact','PostCompact']},
 'copilot-cli':{dir:'.copilot',file:['hooks','hooks.json'],env:'COPILOT_HOME',shape:'copilot',events:['sessionStart','userPromptSubmitted','preToolUse','postToolUse','sessionEnd','errorOccurred','agentStop','subagentStart','subagentStop','preCompact']},
 'gemini-cli':{dir:'.gemini',file:['settings.json'],shape:'nested',events:['SessionStart','SessionEnd','BeforeAgent','BeforeTool','AfterTool','AfterAgent','Notification','PreCompress']},
 'antigravity-cli':{dir:'.gemini',file:['config','hooks.json'],shape:'antigravity',events:['PreInvocation','PostToolUse','PostInvocation']},
 'qwen-code':{dir:'.qwen',file:['settings.json'],shape:'nested',events:['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','Stop']},
 qoder:{dir:'.qoder',file:['settings.json'],shape:'nested'},
 reasonix:{dir:'.reasonix',file:['settings.json'],env:'REASONIX_HOME',shape:'flat'},
 qoderwork:{dir:'.qoderwork',file:['settings.json'],shape:'nested'},
 qwenwork:{dir:'.QwenWorkCN',file:['settings.json'],shape:'nested'},
 workbuddy:{dir:'.workbuddy-ai',file:['settings.json'],shape:'nested',legacy:'.workbuddy'},
 traecode:{dir:'.trae-cn',file:['hooks.json'],shape:'nested'},
 zcode:{dir:'.zcode',file:['cli','config.json'],shape:'process',events:['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop']},
});
const PROVIDERS=Object.freeze(Object.keys(DEFINITIONS));
const EVENTS=Object.freeze(Object.fromEntries(PROVIDERS.map(provider=>[provider,Object.freeze((DEFINITIONS[provider].events||COMMON_EVENTS.filter(event=>Object.hasOwn(getProvider(provider).eventMap,event))).slice())])));
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function createUpstreamIntegrations(options={}){
 const {homeDir,env={},readConfig,buildCommand}=options;
 if(typeof homeDir!=='string'||!path.isAbsolute(homeDir)||typeof readConfig!=='function'||typeof buildCommand!=='function')throw new Error('Upstream observation planner needs safe reader, absolute home, and command builder');
 const events=EVENTS;
 function definition(provider){const value=DEFINITIONS[provider];if(!value)throw new Error('Unsupported command observation format');return value;}
 function target(provider){
  const def=definition(provider);let dir;
  if(def.env&&env[def.env]!==undefined&&String(env[def.env]).trim()){
   dir=String(env[def.env]).trim();
   if(!path.isAbsolute(dir)||dir.split(path.sep).includes('..')||/[\u0000-\u001f\u007f$~]/.test(dir))throw new Error('AI configuration home must be an explicit absolute path');
  }else dir=path.join(homeDir,def.dir);
  if(def.legacy&&!fs.existsSync(dir)&&fs.existsSync(path.join(homeDir,def.legacy,...def.file)))dir=path.join(homeDir,def.legacy);
  return{file:path.join(dir,...def.file),dir};
 }
 function processHandler(provider,event){
  if(typeof options.buildProcess==='function')return options.buildProcess(provider,event);
  const commandOptions=options.commandOptions;
  if(!commandOptions||!['dataDir','electronPath','appRoot'].every(name=>typeof commandOptions[name]==='string'&&path.isAbsolute(commandOptions[name])&&!/[\u0000-\u001f\u007f]/.test(commandOptions[name])))throw new Error('Process hook needs absolute observer invocation paths');
  return{type:'process',command:'/usr/bin/env',args:[`MINI_OFFICE_DATA_DIR=${commandOptions.dataDir}`,'ELECTRON_RUN_AS_NODE=1',commandOptions.electronPath,path.join(commandOptions.appRoot,'hooks','observe.cjs'),'--provider',provider,'--event',event,'--mini-office-observer-v1'],timeoutMs:2000};
 }
 function handler(provider,event){
  const shape=definition(provider).shape,command=buildCommand(provider,event);
  if(shape==='process')return processHandler(provider,event);
  if(shape==='copilot')return{type:'command',bash:command,timeoutSec:2};
  if(shape==='flat')return{match:'*',command};
  if(provider==='gemini-cli'||provider==='qwen-code')return{type:'command',name:'ai-mini-office',command,timeout:2000};
  if(provider==='grok-build'||shape==='antigravity')return{type:'command',command,timeout:2};
  return{type:'command',command};
 }
 function owned(value,provider){
  if(!object(value))return false;
  return events[provider].some(event=>{
   const expected=handler(provider,event);
   if(expected.type==='process')return value.type==='process'&&value.command===expected.command&&JSON.stringify(value.args)===JSON.stringify(expected.args);
   return expected.bash?value.bash===expected.bash:value.command===expected.command;
  });
 }
 function groups(value,def,create){
  if(def.shape==='antigravity'){
   if(value[GROUP]!==undefined&&!object(value[GROUP]))throw new Error('Observer group has an unknown structure');
   if(!value[GROUP]&&create)value[GROUP]={};return value[GROUP]||{};
  }
  if(value.hooks!==undefined&&!object(value.hooks))throw new Error('AI hooks has an unknown structure');
  if(!value.hooks&&create)value.hooks={};const hooks=value.hooks||{};
  if(def.shape!=='process')return hooks;
  if(hooks.events!==undefined&&!object(hooks.events))throw new Error('AI hooks.events has an unknown structure');
  if(!hooks.events&&create)hooks.events={};return hooks.events||{};
 }
 function installed(provider,value){
  const group=groups(value,definition(provider),false);let count=0;
  for(const event of events[provider]){
   if(!Array.isArray(group[event]))continue;
   for(const entry of group[event]){
    if(owned(entry,provider))count++;
    else if(object(entry)&&Array.isArray(entry.hooks))count+=entry.hooks.filter(item=>owned(item,provider)).length;
   }
  }return count;
 }
 function inspect(provider){
  const {file,dir}=target(provider),before=readConfig(file,homeDir);
  return{provider,installed:installed(provider,before.value)>0,available:before.exists||fs.existsSync(dir),detail:'被动观察配置；仅收到真实事件后确认客户端生效'};
 }
 function plan(provider,install){
  const def=definition(provider),{file}=target(provider),before=readConfig(file,homeDir),value=structuredClone(before.value);
  if(def.shape==='copilot'&&value.version!==undefined&&value.version!==1)throw new Error('Copilot hook schema version is unknown; original preserved');
  const group=groups(value,def,install);
  for(const event of events[provider]){
   if(group[event]!==undefined&&!Array.isArray(group[event]))throw new Error(`Hook ${event} has an unknown structure; original preserved`);
   if(!Array.isArray(group[event]))continue;
   group[event]=group[event].flatMap(entry=>{
    if(owned(entry,provider))return[];
    if(!object(entry)||!Array.isArray(entry.hooks))return[entry];
    const remaining=entry.hooks.filter(item=>!owned(item,provider));
    if(remaining.length===entry.hooks.length)return[entry];
    if(!remaining.length&&Object.keys(entry).every(key=>['matcher','hooks'].includes(key)))return[];
    return[{...entry,hooks:remaining}];
   });
  }
  if(install){
   if(def.shape==='copilot')value.version=1;
   for(const event of events[provider]){
    const item=handler(provider,event);let entry;
    if(['flat','copilot'].includes(def.shape)||def.shape==='antigravity'&&event!=='PostToolUse')entry=item;
    else{
     entry={hooks:[item]};
     const matcherless=def.shape==='process'||provider==='gemini-cli'||provider==='qwen-code'&&['UserPromptSubmit','Stop'].includes(event);
     if(!matcherless)entry.matcher=provider==='workbuddy'||provider==='traecode'?'':'*';
    }
    (group[event]||=[]).push(entry);
   }
  }
  return{provider,file,before,value,installed:Boolean(install),changed:JSON.stringify(before.value)!==JSON.stringify(value)};
 }
 return{providers:PROVIDERS,events,inspect,plan};
}
module.exports={PROVIDERS,EVENTS,DEFINITIONS,createUpstreamIntegrations};
