'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
const {PROVIDERS,createUpstreamIntegrations}=require('../lib/upstream-integrations.cjs');
function setup(t,env={}){
 const homeDir=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-integrations-'));
 t.after(()=>fs.rmSync(homeDir,{recursive:true,force:true}));
 const state=new Map();
 const readConfig=(file)=>({exists:state.has(file),value:structuredClone(state.get(file)||{})});
 const commandOptions={dataDir:path.join(homeDir,'office'),electronPath:'/Applications/AI Mini Office.app/Contents/MacOS/AI Mini Office',appRoot:path.join(homeDir,'app')};
 const api=createUpstreamIntegrations({homeDir,env,readConfig,buildCommand:(provider,event)=>`mini-office:${provider}:${event}`,commandOptions});
 return{homeDir,state,api};
}
function commands(value){
 if(Array.isArray(value))return value.flatMap(commands);
 if(value&&typeof value==='object')return Object.entries(value).flatMap(([key,item])=>['command','bash'].includes(key)&&typeof item==='string'?[item]:commands(item));
 return[];
}

test('all13 JSON formats build valid passive plans without writing config files',t=>{
 const{homeDir,api}=setup(t);
 for(const provider of PROVIDERS){
  const plan=api.plan(provider,true);assert.ok(plan.changed,provider);assert.equal(plan.installed,true);
  assert.ok(plan.file.startsWith(homeDir+path.sep));assert.equal(fs.existsSync(plan.file),false);
  assert.ok(commands(plan.value).length>0,provider);
  for(const event of api.events[provider])assert.ok(!/permission/i.test(event),event);
 }
});

test('install/remove is idempotent and preserves foreign hooks and settings',t=>{
 const{state,api}=setup(t);
 const file=api.plan('qoder',true).file;
 const original={theme:'user-theme',hooks:{PreToolUse:[{matcher:'Read',hooks:[{type:'command',command:'foreign-check'}]}],PermissionRequest:[{hooks:[{command:'never touch approvals'}]}]},other:{nested:1}};
 state.set(file,original);
 const first=api.plan('qoder',true);state.set(file,first.value);
 assert.equal(api.inspect('qoder').installed,true);
 assert.equal(api.plan('qoder',true).changed,false);
 const remove=api.plan('qoder',false);state.set(file,remove.value);
 assert.equal(api.inspect('qoder').installed,false);
 assert.equal(remove.value.theme,'user-theme');assert.deepEqual(remove.value.other,{nested:1});
 assert.deepEqual(remove.value.hooks.PermissionRequest,original.hooks.PermissionRequest);
 assert.deepEqual(remove.value.hooks.PreToolUse,original.hooks.PreToolUse);
 assert.equal(api.plan('qoder',false).changed,false);
});

test('exact invocation ownership does not strip similar foreign commands',t=>{
 const{api,state}=setup(t);const file=api.plan('reasonix',true).file;
 const foreign={match:'*',command:'mini-office:reasonix:SessionStart --other-owner'};
 state.set(file,{hooks:{SessionStart:[foreign]}});
 const first=api.plan('reasonix',true);state.set(file,first.value);
 const remove=api.plan('reasonix',false);
 assert.deepEqual(remove.value.hooks.SessionStart,[foreign]);
});

test('Copilot, Reasonix, Antigravity and ZCode preserve actual distinct schema shapes',t=>{
 const{api}=setup(t);
 const copilot=api.plan('copilot-cli',true).value;assert.equal(copilot.version,1);assert.equal(copilot.hooks.sessionStart[0].type,'command');assert.ok(copilot.hooks.sessionStart[0].bash);assert.equal(copilot.hooks.permissionRequest,undefined);
 const reasonix=api.plan('reasonix',true).value;assert.equal(reasonix.hooks.SessionStart[0].match,'*');assert.ok(reasonix.hooks.SessionStart[0].command);
 const agy=api.plan('antigravity-cli',true).value['mini-office-observer-v1'];assert.ok(agy.PreInvocation[0].command);assert.ok(agy.PostToolUse[0].hooks[0].command);assert.equal(agy.Stop,undefined);
 const zcode=api.plan('zcode',true).value.hooks.events;assert.equal(zcode.PreToolUse[0].hooks[0].type,'process');assert.equal(zcode.PreToolUse[0].hooks[0].command,'/usr/bin/env');assert.ok(zcode.PreToolUse[0].hooks[0].args.includes('ELECTRON_RUN_AS_NODE=1'));assert.equal(zcode.PermissionRequest,undefined);
});

test('absolute environment overrides honored and ambiguous expansion paths rejected',t=>{
 const{homeDir}=setup(t);
 const api=createUpstreamIntegrations({homeDir,env:{COPILOT_HOME:path.join(homeDir,'custom')},readConfig:()=>({exists:false,value:{}}),buildCommand:()=> 'command'});
 assert.equal(api.plan('copilot-cli',true).file,path.join(homeDir,'custom/hooks/hooks.json'));
 for(const value of ['relative','~/reasonix','/tmp/$CONFIG','/tmp/../target']){
  const invalid=createUpstreamIntegrations({homeDir,env:{REASONIX_HOME:value},readConfig:()=>({exists:false,value:{}}),buildCommand:()=> 'command'});
  assert.throws(()=>invalid.plan('reasonix',true));
 }
});

test('unknown schema shapes and Copilot versions rejected without changing snapshots',t=>{
 const{state,api}=setup(t);
 const file=api.plan('copilot-cli',true).file;
 const invalid={version:2,hooks:{}};state.set(file,invalid);assert.throws(()=>api.plan('copilot-cli',true));assert.deepEqual(state.get(file),invalid);
 const qfile=api.plan('qwen-code',true).file;state.set(qfile,{hooks:{PreToolUse:'not an array'}});assert.throws(()=>api.plan('qwen-code',true));
 assert.throws(()=>api.plan('hermes',true));
});

test('WorkBuddy uses current config and recognizes genuine legacy settings only',t=>{
 const{homeDir,api}=setup(t);
 const current=path.join(homeDir,'.workbuddy-ai/settings.json');
 assert.equal(api.plan('workbuddy',true).file,current);
 fs.mkdirSync(path.join(homeDir,'.workbuddy'));assert.equal(api.plan('workbuddy',true).file,current);
 fs.writeFileSync(path.join(homeDir,'.workbuddy/settings.json'),'{}');assert.equal(api.plan('workbuddy',true).file,path.join(homeDir,'.workbuddy/settings.json'));
 fs.mkdirSync(path.join(homeDir,'.workbuddy-ai'));assert.equal(api.plan('workbuddy',true).file,current);
});


test('Gemini tool phases use neutral BeforeTool observation and millisecond timeouts',t=>{
 const{api}=setup(t);const plan=api.plan('gemini-cli',true);
 assert.ok(plan.value.hooks.BeforeTool);
 assert.equal(plan.value.hooks.BeforeTool[0].matcher,undefined);
 assert.equal(plan.value.hooks.BeforeTool[0].hooks[0].timeout,2000);
 assert.equal(plan.value.hooks.BeforeTool[0].hooks[0].name,'ai-mini-office');
 const qwen=api.plan('qwen-code',true);assert.equal(qwen.value.hooks.PreToolUse[0].hooks[0].timeout,2000);
 const zcode=api.plan('zcode',true);assert.ok(Object.values(zcode.value.hooks.events).every(entries=>entries.every(entry=>entry.matcher===undefined)));
});
