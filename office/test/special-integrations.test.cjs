'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const toml=require('@iarna/toml');
const{inspectSpecial,mutateSpecial,EVENTS}=require('../lib/special-integrations.cjs');
function setup(t,provider){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-special-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const homeDir=path.join(root,'home'),dataDir=path.join(root,'office');fs.mkdirSync(homeDir);fs.mkdirSync(dataDir);
 return{provider,homeDir,dataDir,env:{PATH:''},electronPath:process.execPath,appRoot:path.resolve(__dirname,'..')};
}
function file(options,relative,text){const target=path.join(options.homeDir,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text,{mode:0o600});return target;}

test('Kimi TOML preserves exact existing settings/comments and both native generations',async t=>{
 const options=setup(t,'kimi-cli');
 const source='# user comment\nmodel = "native-model"\n[provider]\nkey = "local-value"\n';
 const modern=file(options,'.kimi-code/config.toml',source),legacy=file(options,'.kimi/config.toml',source);
 const result=await mutateSpecial(options,true);assert.equal(result.status,'ok',result.message);
 assert.equal(inspectSpecial(options).installed,true);
 for(const target of [modern,legacy])assert.ok(fs.readFileSync(target,'utf8').startsWith(source));
 const m=toml.parse(fs.readFileSync(modern,'utf8')),l=toml.parse(fs.readFileSync(legacy,'utf8'));
 assert.ok(m.hooks.some(h=>h.event==='Interrupt'));assert.equal(l.hooks.some(h=>h.event==='Interrupt'),false);
 assert.ok(m.hooks.every(h=>!h.event.startsWith('Permission')));assert.equal(m.model,'native-model');
 const before=fs.readFileSync(modern,'utf8');assert.equal((await mutateSpecial(options,true)).status,'ok');assert.equal(fs.readFileSync(modern,'utf8'),before);
 assert.equal((await mutateSpecial(options,false)).status,'ok');assert.equal(fs.readFileSync(modern,'utf8'),source);assert.equal(fs.readFileSync(legacy,'utf8'),source);
});

test('CodeWhale TOML preserves foreign hooks and honors explicit config path',async t=>{
 const options=setup(t,'codewhale');const source='# keep original\n[hooks]\nenabled = true\n[[hooks.hooks]]\nevent = "session_start"\ncommand = "foreign observer"\nbackground = true\n';
 const target=file(options,'custom/codewhale.toml',source);options.env.CODEWHALE_CONFIG_PATH=target;
 assert.equal((await mutateSpecial(options,true)).status,'ok');const current=fs.readFileSync(target,'utf8');assert.ok(current.startsWith(source));
 const parsed=toml.parse(current);assert.equal(parsed.hooks.hooks.length,EVENTS.codewhale.length+1);assert.equal(parsed.hooks.hooks[0].command,'foreign observer');
 assert.equal((await mutateSpecial(options,false)).status,'ok');assert.equal(fs.readFileSync(target,'utf8'),source);
});

test('invalid TOML and user-disabled hooks remain unchanged',async t=>{
 for(const source of ['[hooks\ninvalid = true\n','[hooks]\nenabled = false\n']){
  const options=setup(t,'codewhale');const target=file(options,'.codewhale/config.toml',source);
  assert.equal((await mutateSpecial(options,true)).status,'error');assert.equal(fs.readFileSync(target,'utf8'),source);
 }
});

test('modified owned TOML blocks are not adopted or overwritten',async t=>{
 const options=setup(t,'kimi-cli');const target=file(options,'.kimi-code/config.toml','# original\n');
 assert.equal((await mutateSpecial(options,true)).status,'ok');const edited=fs.readFileSync(target,'utf8').replace('timeout = 2','timeout = 3');fs.writeFileSync(target,edited);
 assert.equal((await mutateSpecial(options,false)).status,'error');assert.equal(fs.readFileSync(target,'utf8'),edited);
});

test('Kiro preserves custom agent capabilities and foreign hooks while adding passive hooks',async t=>{
 const options=setup(t,'kiro-cli');const original={name:'custom',tools:['read'],allowedTools:['read'],prompt:'native prompt',hooks:{preToolUse:[{command:'foreign'}]}};
 const target=file(options,'.kiro/agents/custom.json',JSON.stringify(original));
 assert.equal((await mutateSpecial(options,true)).status,'ok');assert.equal(inspectSpecial(options).installed,true);
 const value=JSON.parse(fs.readFileSync(target));assert.deepEqual(value.tools,original.tools);assert.deepEqual(value.allowedTools,original.allowedTools);assert.equal(value.prompt,'native prompt');assert.equal(value.hooks.preToolUse[0].command,'foreign');
 assert.equal((await mutateSpecial(options,false)).status,'ok');const after=JSON.parse(fs.readFileSync(target));assert.deepEqual(after.hooks.preToolUse,original.hooks.preToolUse);
});

test('Kiro built-in-only setup clones an actual supplied native template without changing approvals',async t=>{
 const options=setup(t,'kiro-cli');options.kiroTemplate={name:'kiro_default',tools:['read'],allowedTools:[],prompt:'same native defaults'};
 assert.equal((await mutateSpecial(options,true)).status,'ok');const value=JSON.parse(fs.readFileSync(path.join(options.homeDir,'.kiro/agents/mini-office.json')));
 assert.equal(value.name,'mini-office');assert.deepEqual(value.allowedTools,[]);assert.equal(value.prompt,'same native defaults');
});

test('KiroCrew requires real lock helper and keeps all work inside acquired locks',async t=>{
 const options=setup(t,'kirocrew');const original={hooks:[{id:'foreign',event:'Stop',command:'foreign',enabled:true}]};
 const target=file(options,'.kiro/crew/hooks.json',JSON.stringify(original));
 assert.equal((await mutateSpecial(options,true)).status,'error');assert.deepEqual(JSON.parse(fs.readFileSync(target)),original);
 let calls=0;options.withNativeLock=async(spec,operation)=>{calls++;assert.equal(spec.gateway,path.join(options.homeDir,'.kiro/crew/gateway.lock'));assert.equal(spec.store,target+'.lock');return await operation();};
 assert.equal((await mutateSpecial(options,true)).status,'ok');assert.equal(calls,1);
 const value=JSON.parse(fs.readFileSync(target));assert.equal(value.hooks.length,5);assert.deepEqual(value.hooks[0],original.hooks[0]);assert.equal(value.hooks.some(h=>h.event==='PreToolUse'),false);
 assert.equal((await mutateSpecial(options,false)).status,'ok');assert.deepEqual(JSON.parse(fs.readFileSync(target)),original);
});

test('MiniMax publishes an owned native Claude plugin and removes only that plugin',async t=>{
 const options=setup(t,'minimax');const other=file(options,'.minimax/plugins/foreign/plugin.json','{"name":"foreign"}');
 assert.equal((await mutateSpecial(options,true)).status,'ok');assert.equal(inspectSpecial(options).installed,true);
 const root=path.join(options.homeDir,'.minimax/plugins/ai-mini-office-state');const manifest=JSON.parse(fs.readFileSync(path.join(root,'.claude-plugin/plugin.json')));assert.deepEqual(manifest.hooks,['hooks/hooks.json']);
 const hooks=JSON.parse(fs.readFileSync(path.join(root,'hooks/hooks.json'))).hooks;assert.equal(hooks.SessionStart[0].hooks[0].command,'/usr/bin/env');assert.ok(hooks.SessionStart[0].hooks[0].args.includes('ELECTRON_RUN_AS_NODE=1'));assert.equal(hooks.PermissionRequest,undefined);
 assert.equal((await mutateSpecial(options,false)).status,'ok');assert.equal(fs.existsSync(root),false);assert.equal(fs.existsSync(other),true);
});

test('MiniMax unknown directory and symlink targets remain untouched',async t=>{
 const options=setup(t,'minimax');const target=file(options,'.minimax/plugins/ai-mini-office-state/user.txt','foreign');
 assert.equal((await mutateSpecial(options,true)).status,'error');assert.equal(fs.readFileSync(target,'utf8'),'foreign');
 const symbolic=setup(t,'kimi-cli');const outside=file(symbolic,'outside.toml','model="keep"\n');fs.mkdirSync(path.join(symbolic.homeDir,'.kimi-code'));fs.symlinkSync(outside,path.join(symbolic.homeDir,'.kimi-code/config.toml'));
 assert.equal((await mutateSpecial(symbolic,true)).status,'error');assert.equal(fs.readFileSync(outside,'utf8'),'model="keep"\n');
});
