'use strict';

// Explicit Connect-only adapters for nonstandard upstream configuration formats.
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const toml=require('@iarna/toml');
const jsonc=require('./plugin-jsonc.cjs');
const {_files:{directory,read,writeConfig,stat,absolute}}=require('./plugin-integrations.cjs');
const OWNER='ai-mini-office-special-observer-v1';
const PROVIDERS=Object.freeze(['kiro-cli','kirocrew','kimi-cli','codewhale','minimax']);
const EVENTS=Object.freeze({
 'kiro-cli':['agentSpawn','userPromptSubmit','preToolUse','postToolUse','stop'],
 kirocrew:['AgentSpawn','UserPromptSubmit','PostToolUse','Stop'],
 'kimi-cli':['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop','StopFailure','SubagentStart','SubagentStop','PreCompact','PostCompact','Notification','Interrupt'],
 codewhale:['session_start','session_end','message_submit','tool_call_before','tool_call_after','mode_change','on_error'],
 minimax:['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','Stop','SubagentStart','SubagentStop','PreCompact','PostCompact'],
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function json(bytes){const value=jsonc.parse(bytes?.toString('utf8')||'{}').value;if(!object(value))throw new Error('AI config must be an object; preserved');return value;}
function envPath(options,key,fallback){const raw=typeof options.env?.[key]==='string'?options.env[key].trim():'';return absolute(raw||fallback);}
function quote(value){if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Invalid observer argument');return `'${value.replace(/'/g,"'\\''")}'`;}
function command(options,provider,event){
 for(const field of ['dataDir','electronPath','appRoot'])absolute(options[field]);
 return `MINI_OFFICE_DATA_DIR=${quote(options.dataDir)} ELECTRON_RUN_AS_NODE=1 ${quote(options.electronPath)} ${quote(path.join(options.appRoot,'hooks','observe.cjs'))} --provider ${quote(provider)} --event ${quote(event)} --mini-office-observer-v1`;
}
function rawTargets(options){
 const {provider,homeDir}=options;absolute(homeDir);if(!PROVIDERS.includes(provider))throw new Error('Unsupported special observer provider');
 if(provider==='codewhale')return[{file:envPath(options,'CODEWHALE_CONFIG_PATH',options.env?.DEEPSEEK_CONFIG_PATH||path.join(homeDir,'.codewhale/config.toml')),kind:'toml'}];
 if(provider==='kimi-cli'){
  const legacy={file:path.join(homeDir,'.kimi/config.toml'),kind:'toml',legacy:true};
  const modern={file:path.join(envPath(options,'KIMI_CODE_HOME',path.join(homeDir,'.kimi-code')),'config.toml'),kind:'toml'};
  const list=[legacy,modern].filter(target=>stat(path.dirname(target.file))||stat(target.file));return list.length?list:[modern];
 }
 if(provider==='kirocrew')return[{file:path.join(envPath(options,'KIROCREW_HOME',path.join(homeDir,'.kiro/crew')),'hooks.json'),kind:'crew'}];
 if(provider==='minimax'){
  const data=envPath(options,'MINIMAX_DATA_DIR',options.env?.MAVIS_DATA_DIR||path.join(homeDir,'.minimax'));
  return[{target:path.join(data,'plugins','ai-mini-office-state'),kind:'minimax'}];
 }
 const dir=path.join(homeDir,'.kiro','agents');directory(dir);
 const list=stat(dir)?fs.readdirSync(dir).filter(name=>name.endsWith('.json')&&!name.includes('.example')&&name!=='kiro_default.json').map(name=>({file:path.join(dir,name),kind:'kiro'})):[];
 return list.length?list:[{file:path.join(dir,'mini-office.json'),kind:'kiro',needsTemplate:true}];
}
function nativeEvents(options,target){return target.legacy?EVENTS['kimi-cli'].filter(event=>event!=='Interrupt'):EVENTS[options.provider];}
function tomlBlock(options,target){
 const {provider}=options,events=nativeEvents(options,target);
 const lines=[];
 for(const event of events){
  lines.push(provider==='codewhale'?'[[hooks.hooks]]':'[[hooks]]',`event = ${JSON.stringify(event)}`,`command = ${JSON.stringify(command(options,provider,event))}`);
  if(provider==='codewhale')lines.push(`background = ${event==='session_end'?'false':'true'}`);
  else lines.push('matcher = ""','timeout = 2');
  lines.push('');
 }
 return lines.join('\n');
}
function tomlPrepared(options,target,before,install){
 const source=before?.toString('utf8')||'',parsed=toml.parse(source),provider=options.provider;
 if(provider==='kimi-cli'&&parsed.hooks!==undefined&&!Array.isArray(parsed.hooks))throw new Error('Kimi hooks is not an array; preserved');
 if(provider==='codewhale'&&parsed.hooks!==undefined&&!object(parsed.hooks))throw new Error('CodeWhale hooks is not a table; preserved');
 if(provider==='codewhale'&&parsed.hooks?.enabled===false&&install)throw new Error('CodeWhale hooks were disabled by the user; preserved');
 const block=tomlBlock(options,target),marker=`# MINI_OFFICE_OBSERVER_V1 ${provider}`;
 const pattern=new RegExp(`\\n${marker} BEGIN ([a-f0-9]{64})\\n([\\s\\S]*?)${marker} END\\n`,'g');
 let owned=false;
 const stripped=source.replace(pattern,(whole,digest,body)=>{
  if(sha(body)!==digest||body!==block)throw new Error('Observer TOML block changed externally; preserved');
  owned=true;return'';
 });
 if(source.includes(`${marker} BEGIN`)&&!owned)throw new Error('Observer TOML ownership marker is malformed; preserved');
 let next=stripped;
 if(install){
  if(provider==='codewhale'&&!parsed.hooks)next+='\n[hooks]\nenabled = true\n';
  next+=`\n${marker} BEGIN ${sha(block)}\n${block}${marker} END\n`;
 }
 toml.parse(next); // Full real parser catches duplicate tables, invalid escapes and unsupported syntax.
 return{file:target.file,before,next,installed:owned};
}
function mergeKiro(options,before,template,install){
 const value=before?json(before):structuredClone(template||{});
 if(value.hooks!==undefined&&!object(value.hooks))throw new Error('Kiro agent hooks has an unknown structure; preserved');
 const hooks=value.hooks||{};
 for(const event of EVENTS['kiro-cli']){
  if(hooks[event]!==undefined&&!Array.isArray(hooks[event]))throw new Error('Kiro hook event is not an array; preserved');
  const expected=command(options,'kiro-cli',event);
  const entries=(hooks[event]||[]).filter(entry=>!object(entry)||entry.command!==expected);
  if(install)entries.push({command:expected});
  if(entries.length||hooks[event]!==undefined)hooks[event]=entries;
 }
 if(install||value.hooks)value.hooks=hooks;
 return JSON.stringify(value,null,2)+'\n';
}
function mergeCrew(options,before,install){
 const value=json(before);if(value.hooks!==undefined&&!Array.isArray(value.hooks))throw new Error('KiroCrew hook store must contain an array; preserved');
 const owned=entry=>object(entry)&&EVENTS.kirocrew.some(event=>entry.event===event&&entry.command===command(options,'kirocrew',event));
 const hooks=(value.hooks||[]).filter(entry=>!owned(entry));
 if(install)for(const event of EVENTS.kirocrew)hooks.push({id:`mini-office-${event}`,name:`AI Work Space — ${event}`,event,matcher:'',matcher_mode:'glob',command:command(options,'kirocrew',event),skills:[],timeout:2,enabled:true});
 if(install||value.hooks)value.hooks=hooks;
 return JSON.stringify(value,null,2)+'\n';
}
function miniFiles(options){
 const manifest={name:'ai-mini-office-state',displayName:'AI Work Space',version:'1.0.0',description:'Passive local AI activity observer',hooks:['hooks/hooks.json']};
 for(const field of ['dataDir','electronPath','appRoot'])absolute(options[field]);
 const hooks={};for(const event of EVENTS.minimax)hooks[event]=[{hooks:[{type:'command',command:'/usr/bin/env',args:[`MINI_OFFICE_DATA_DIR=${options.dataDir}`,'ELECTRON_RUN_AS_NODE=1',options.electronPath,path.join(options.appRoot,'hooks','observe.cjs'),'--provider','minimax','--event',event,'--mini-office-observer-v1'],timeout:2}]}];
 const files={'.claude-plugin/plugin.json':JSON.stringify(manifest,null,2)+'\n','hooks/hooks.json':JSON.stringify({hooks},null,2)+'\n'};
 files['.mini-office-owned.json']=JSON.stringify({owner:OWNER,version:1,files:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,sha(value)]))},null,2)+'\n';return files;
}
function miniOwned(target){
 directory(target);if(!stat(target))return null;
 const marker=json(read(path.join(target,'.mini-office-owned.json')));
 if(marker.owner!==OWNER||marker.version!==1||!object(marker.files)||JSON.stringify(Object.keys(marker.files).sort())!==JSON.stringify(['.claude-plugin/plugin.json','hooks/hooks.json']))throw new Error('MiniMax plugin has unknown ownership; preserved');
 for(const [name,digest]of Object.entries(marker.files))if(sha(read(path.join(target,name)))!==digest)throw new Error('MiniMax observer changed externally; preserved');
 const rootNames=fs.readdirSync(target).sort();if(JSON.stringify(rootNames)!==JSON.stringify(['.claude-plugin','.mini-office-owned.json','hooks']))throw new Error('MiniMax observer has external files; preserved');
 for(const [sub,name]of [['.claude-plugin','plugin.json'],['hooks','hooks.json']])if(JSON.stringify(fs.readdirSync(path.join(target,sub)))!==JSON.stringify([name]))throw new Error('MiniMax observer contains external files; preserved');
 return marker;
}
function inspectSpecial(options){
 try{
  const targets=rawTargets(options);let installed=targets.length>0;
  for(const target of targets){
   if(target.kind==='minimax'){installed=Boolean(miniOwned(target.target))&&installed;continue;}
   const before=read(target.file,true);
   if(target.kind==='toml'){installed=tomlPrepared(options,target,before,false).installed&&installed;continue;}
   const value=json(before);
   const found=target.kind==='crew'?(Array.isArray(value.hooks)&&value.hooks.some(entry=>EVENTS.kirocrew.some(event=>entry?.command===command(options,'kirocrew',event))))
    :EVENTS['kiro-cli'].some(event=>Array.isArray(value.hooks?.[event])&&value.hooks[event].some(entry=>entry?.command===command(options,'kiro-cli',event)));
   installed=Boolean(found)&&installed;
  }
  return{available:targets.some(target=>stat(path.dirname(target.file||target.target))),installed,targetPaths:targets.map(target=>target.file||target.target),detail:installed?options.provider==='kiro-cli'?'Passive hooks installed. Built-in Kiro agents require switching to the generated mini-office agent. Real events confirm activation.':'Passive observer installed; start a new client session. Real events confirm activation.':'Connect adds only AI Work Space activity observers; native approvals and foreign hooks stay in place.'};
 }catch(error){return{available:false,installed:false,detail:error.message};}
}
function kiroTemplate(options){
 if(options.kiroTemplate&&object(options.kiroTemplate))return{...structuredClone(options.kiroTemplate),name:'mini-office'};
 const program=(options.env?.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,'kiro-cli')).find(file=>stat(file)?.isFile());
 if(!program)throw new Error('Initialize a custom Kiro agent or install kiro-cli before connecting');
 directory(options.dataDir,true);const dir=fs.mkdtempSync(path.join(options.dataDir,'kiro-template-')),name='mini_office_template_'+randomUUID().replace(/-/g,'');
 try{
  (options.execFileSync||execFileSync)(program,['agent','create',name,'--directory',dir,'--from','kiro_default'],{env:options.env,encoding:'utf8',timeout:5000,maxBuffer:64*1024});
  const file=path.join(dir,name+'.json'),value=json(read(file));value.name='mini-office';return value;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
async function mutateSpecial(options,install){
 let lock,fd,identity;
 try{
  directory(options.dataDir,true);lock=path.join(options.dataDir,`.special-${options.provider}.lock`);
  fd=fs.openSync(lock,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);identity=fs.fstatSync(fd);
  const run=async()=>{
   const targets=rawTargets(options);
   const prepared=targets.map(target=>{
    if(target.kind==='minimax')return{target,owned:miniOwned(target.target),files:install?miniFiles(options):null};
    const before=read(target.file,true);
    if(target.kind==='toml')return{target,...tomlPrepared(options,target,before,install)};
    if(target.kind==='crew')return{target,file:target.file,before,next:mergeCrew(options,before,install)};
    const template=install&&!before&&target.needsTemplate?kiroTemplate(options):null;
    return{target,file:target.file,before,next:mergeKiro(options,before,template,install)};
   });
   // All source documents and ownership checks are validated before the first write.
   for(const item of prepared){
    if(item.target.kind!=='minimax'){
     if(!install&&!item.before)continue;
     writeConfig(item.file,item.before,item.next);continue;
    }
    const {target,owned,files}=item;if(!install&&!owned)continue;
    directory(path.dirname(target.target),true);let stage,backup;
    try{
     // MiniMax scans every directory inside plugins/, including dot names.
     // Stage and retire beside plugins/ so incomplete copies cannot load.
     const workParent=path.dirname(path.dirname(target.target));
     if(install){stage=path.join(workParent,'.mini-office-minimax-stage-'+randomUUID());directory(stage,true);for(const [name,value]of Object.entries(files)){directory(path.dirname(path.join(stage,name)),true);fs.writeFileSync(path.join(stage,name),value,{flag:'wx',mode:0o600});}}
     if(JSON.stringify(miniOwned(target.target))!==JSON.stringify(owned))throw new Error('MiniMax ownership changed before commit; preserved');
     if(owned){backup=path.join(workParent,'.mini-office-minimax-backup-'+randomUUID());fs.renameSync(target.target,backup);}
     if(install){fs.renameSync(stage,target.target);stage=null;}
     if(backup){fs.rmSync(backup,{recursive:true});backup=null;}
    }finally{if(stage&&stat(stage))fs.rmSync(stage,{recursive:true});if(backup&&!stat(target.target))fs.renameSync(backup,target.target);}
   }
   return{status:'ok',provider:options.provider,installed:install,detail:install?inspectSpecial(options).detail:'Removed only AI Work Space owned observation hooks.'};
  };
  if(options.provider==='kirocrew'){
   const file=rawTargets(options)[0].file,dir=path.dirname(file);directory(dir,true);
   if(typeof options.withNativeLock!=='function')throw new Error('KiroCrew native gateway/store lock helper is unavailable; config preserved');
   return await options.withNativeLock({directory:dir,gateway:path.join(dir,'gateway.lock'),store:file+'.lock'},run);
  }
  return await run();
 }catch(error){return{status:'error',provider:options.provider,installed:inspectSpecial(options).installed,message:error.code==='EEXIST'?'Another observer operation is in progress; retry later.':error.message};}
 finally{if(fd!==undefined){fs.closeSync(fd);const current=stat(lock);if(current&&!current.isSymbolicLink()&&current.ino===identity.ino&&current.dev===identity.dev)fs.unlinkSync(lock);}}
}
module.exports={PROVIDERS,EVENTS,inspectSpecial,mutateSpecial};
