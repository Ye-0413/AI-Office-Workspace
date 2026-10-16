'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const net=require('node:net');
const {inspectHermes,mutateHermes,reloadHermesGateway,GATEWAY_HOOKS,PLUGIN_ID}=require('../lib/hermes-observer.cjs');
const {normalizeEvent,actorKey}=require('../lib/provider-events.cjs');
const {createSessionStore}=require('../lib/session-store.cjs');
const {createObserverBridge}=require('../lib/observer-bridge.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'office-hermes-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const homeDir=path.join(root,'home');fs.mkdirSync(homeDir);const calls=[];return{root,homeDir,env:{PATH:''},dataDir:path.join(root,'data'),appRoot:path.join(__dirname,'..'),electronPath:process.execPath,calls,runCli:(file,args,options)=>{calls.push({file,args,home:options.env.HERMES_HOME});return{status:0};}};}
function cli(o){const file=path.join(o.homeDir,'.local','bin','hermes');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'#!/bin/sh\nexit 0\n',{mode:0o700});}
const raw=(hook,patch={})=>({hook_event_name:hook,session_id:'chat-one',turn_id:'turn-one',...patch});
const normalize=(hook,patch={},at=1000)=>normalizeEvent('hermes',raw(hook,patch),{receivedAt:at});
async function gateway(t,o,respond) {
  // macOS has a 104-byte Unix socket path limit; its normal temp dir is longer.
  const home=fs.realpathSync(fs.mkdtempSync(path.join('/tmp','office-gw-')));o.env.HERMES_HOME=home;
  const requests=[],sockets=new Set(),file=path.join(home,'gateway.sock');
  const identity={protocol:1,kind:'hermes-gateway',pid:123,hermes_home:home};
  const loaded={reloaded:true,home,plugins:[PLUGIN_ID],activations:[{name:PLUGIN_ID,key:PLUGIN_ID,activated_now:{hooks:GATEWAY_HOOKS}}],adapters_rewired:1};
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let input='';
    socket.on('data',chunk=>{
      input+=chunk.toString('utf8');if(!input.includes('\n'))return;
      const request=JSON.parse(input.split('\n')[0]);requests.push(request);
      if(respond)return respond(socket,request,{identity,loaded});
      socket.end(JSON.stringify({ok:true,protocol:1,id:request.id,result:request.verb==='identify'?identity:loaded})+'\n');
    });
  });
  t.after(()=>{for(const socket of sockets)socket.destroy();server.close();fs.rmSync(home,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(file,resolve);});fs.chmodSync(file,0o600);
  return {home,file,requests,server,identity,loaded};
}

test('Hermes inspection is passive; explicit plugin install/enable and remove preserve other plugins',async t=>{
  const o=fixture(t);assert.equal(inspectHermes(o).installed,false);assert.deepEqual(fs.readdirSync(o.homeDir),[]);cli(o);
  const foreign=path.join(o.homeDir,'.hermes','plugins','other');fs.mkdirSync(foreign,{recursive:true});fs.writeFileSync(path.join(foreign,'data'),'keep');
  assert.equal((await mutateHermes(o,true)).status,'ok');assert.equal(inspectHermes(o).installed,true);assert.deepEqual(o.calls[0].args,['plugins','enable',PLUGIN_ID]);
  assert.equal((await mutateHermes(o,true)).status,'unchanged');assert.equal(o.calls.length,1);
  const config=JSON.parse(fs.readFileSync(path.join(o.homeDir,'.hermes','plugins',PLUGIN_ID,'observer-config.json')));assert.equal(config.dataDir,o.dataDir);assert.equal(config.electronPath,process.execPath);
  assert.equal((await mutateHermes(o,false)).status,'ok');assert.deepEqual(o.calls[1].args,['plugins','disable',PLUGIN_ID]);assert.equal(fs.readFileSync(path.join(foreign,'data'),'utf8'),'keep');assert.equal(fs.existsSync(path.join(o.homeDir,'.hermes','config.yaml')),false);
});
test('Hermes refuses foreign/modified/symlink plugins and reports enable failure without pretending connected',async t=>{
  const o=fixture(t);cli(o);const target=path.join(o.homeDir,'.hermes','plugins',PLUGIN_ID);fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'plugin.yaml'),'foreign');
  assert.equal((await mutateHermes(o,true)).status,'error');assert.equal(fs.readFileSync(path.join(target,'plugin.yaml'),'utf8'),'foreign');assert.equal(o.calls.length,0);
  fs.rmSync(target,{recursive:true});o.runCli=()=>({status:1});assert.equal((await mutateHermes(o,true)).status,'error');assert.equal(inspectHermes(o).installed,false);
  o.runCli=()=>({status:0});assert.equal((await mutateHermes(o,true)).status,'ok');fs.appendFileSync(path.join(target,'__init__.py'),'\n# user edit\n');assert.equal((await mutateHermes(o,false)).status,'error');assert.ok(fs.readFileSync(path.join(target,'__init__.py'),'utf8').includes('# user edit'));
  fs.rmSync(target,{recursive:true});const outside=path.join(o.root,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,target);assert.equal((await mutateHermes(o,true)).status,'error');assert.deepEqual(fs.readdirSync(outside),[]);
});
test('Hermes custom home is respected and plugin locks are never stolen',async t=>{
  const o=fixture(t);cli(o);o.env.HERMES_HOME=path.join(o.root,'custom');assert.equal((await mutateHermes(o,true)).status,'ok');assert.equal(o.calls[0].home,o.env.HERMES_HOME);assert.equal(fs.existsSync(path.join(o.homeDir,'.hermes')),false);
  fs.writeFileSync(path.join(o.env.HERMES_HOME,'plugins','.mini-office-hermes.lock'),'foreign');assert.equal((await mutateHermes(o,false)).status,'error');assert.equal(fs.readFileSync(path.join(o.env.HERMES_HOME,'plugins','.mini-office-hermes.lock'),'utf8'),'foreign');
});
test('Hermes reconnect reloads an unchanged owned plugin in the identified gateway without restarting or rewriting it',async t=>{
  const o=fixture(t);cli(o);const g=await gateway(t,o);
  assert.equal(inspectHermes(o).installed,false);assert.equal(g.requests.length,0);
  const first=await mutateHermes(o,true);assert.equal(first.gatewayLoaded,true);assert.equal(first.gatewayHookCount,11);assert.equal(first.status,'ok');
  const target=path.join(g.home,'plugins',PLUGIN_ID),before=fs.readdirSync(target).map(name=>[name,fs.readFileSync(path.join(target,name)).toString('hex'),fs.statSync(path.join(target,name)).mtimeMs]);
  const second=await mutateHermes(o,true);assert.equal(second.status,'unchanged');assert.equal(second.gatewayLoaded,true);assert.equal(o.calls.length,1);
  assert.deepEqual(fs.readdirSync(target).map(name=>[name,fs.readFileSync(path.join(target,name)).toString('hex'),fs.statSync(path.join(target,name)).mtimeMs]),before);
  assert.deepEqual(g.requests.map(r=>r.verb),['identify','reload-plugins','identify','reload-plugins']);
  assert.ok(g.requests.filter(r=>r.verb==='reload-plugins').every(r=>r.params.home===g.home));
  assert.equal(inspectHermes(o).gatewayLoaded,true);assert.ok(inspectHermes(o).gatewayVerifiedAt>0);
  assert.equal(g.requests.length,4,'read-only inspection must not contact/reload the gateway');
});
test('Hermes gateway verification requires the same home, supported protocol and actual observer hook registrations',async t=>{
  const o=fixture(t);const g=await gateway(t,o,(socket,request,{identity,loaded})=>socket.end(JSON.stringify({ok:true,protocol:1,id:1,result:request.verb==='identify'?identity:loaded})+'\n'));
  g.identity.hermes_home=path.join(g.home,'other');assert.equal((await reloadHermesGateway(o)).gatewayLoaded,false);assert.deepEqual(g.requests.map(r=>r.verb),['identify']);
  g.identity.hermes_home=g.home;g.identity.protocol=2;assert.equal((await reloadHermesGateway(o)).gatewayLoaded,false);assert.equal(g.requests.length,2);
  g.identity.protocol=1;g.loaded.activations[0].activated_now.hooks=GATEWAY_HOOKS.slice(1);
  const result=await reloadHermesGateway(o);assert.equal(result.gatewayLoaded,false);assert.equal(result.gatewayStatus,'unverified');
  assert.deepEqual(g.requests.map(r=>r.verb),['identify','identify','identify','reload-plugins']);
});
test('Hermes unavailable or unsafe gateway sockets keep installation separate from actual activation',async t=>{
  const o=fixture(t);cli(o);let result=await mutateHermes(o,true);
  assert.equal(result.installed,true);assert.equal(result.gatewayLoaded,false);assert.equal(result.gatewayStatus,'not-running');
  const home=path.join(o.homeDir,'.hermes'),foreign=path.join(o.root,'foreign');fs.writeFileSync(foreign,'preserve');fs.symlinkSync(foreign,path.join(home,'gateway.sock'));
  result=await mutateHermes(o,true);assert.equal(result.status,'unchanged');assert.equal(result.installed,true);assert.equal(result.gatewayStatus,'unverified');assert.equal(fs.readFileSync(foreign,'utf8'),'preserve');
});
test('Hermes gateway responses are bounded, malformed replies do not imply activation, and no-response times out',async t=>{
  const o=fixture(t);let mode='malformed';await gateway(t,o,(socket,request)=>{
    if(mode==='malformed')socket.end('not-json\n');
    else if(mode==='oversized')socket.end(' '.repeat(512*1024+1)+'\n');
  });
  assert.equal((await reloadHermesGateway(o)).gatewayStatus,'unverified');
  mode='oversized';assert.equal((await reloadHermesGateway(o)).gatewayStatus,'unverified');
  mode='timeout';const start=Date.now();assert.equal((await reloadHermesGateway({...o,gatewayTimeoutMs:40})).gatewayStatus,'unverified');assert.ok(Date.now()-start<1000);
});
test('Hermes long-home gateway socket pointer is verified without accepting a writable or symbolic pointer',async t=>{
  const o=fixture(t);const g=await gateway(t,o),socketHome=g.home;
  const home=path.join(o.root,'custom-hermes');fs.mkdirSync(home);o.env.HERMES_HOME=home;g.identity.hermes_home=home;g.loaded.home=home;
  const pointer=path.join(home,'gateway.sock.path');fs.writeFileSync(pointer,path.join(socketHome,'gateway.sock'),{mode:0o600});
  assert.equal((await reloadHermesGateway(o)).gatewayLoaded,true);
  fs.chmodSync(pointer,0o622);assert.equal((await reloadHermesGateway(o)).gatewayLoaded,false);assert.equal(g.requests.length,2);
  fs.unlinkSync(pointer);const other=path.join(home,'other');fs.writeFileSync(other,g.file);fs.symlinkSync(other,pointer);
  assert.equal((await reloadHermesGateway(o)).gatewayLoaded,false);assert.equal(g.requests.length,2);
});
test('Hermes turn end stays open, finalization closes, and explicit failures/interruption remain distinct',()=>{
  assert.equal(normalize('on_session_end',{completed:true}).event,'turn-end');assert.equal(normalize('on_session_finalize').event,'session-end');
  assert.equal(normalize('on_session_end',{failed:true}).event,'error');assert.equal(normalize('on_session_end',{interrupted:true}).event,'interrupted');
  assert.equal(normalize('pre_llm_call').activity,'planning');assert.equal(normalize('post_llm_call'),null);assert.equal(normalizeEvent('hermes',{hook_event_name:'pre_llm_call'}),null);
});
test('Hermes exact tools are classified, paired by native call ID, and no payload bodies are retained',()=>{
  const one=normalize('pre_tool_call',{tool_name:'terminal',tool_call_id:'one',tool_input:{command:'npm test'},user_message:'SECRET PROMPT',args:{secret:'SECRET ARGS'}});
  assert.equal(one.activity,'testing');assert.equal(one.toolCallId,'one');assert.equal(normalize('pre_tool_call',{tool_name:'terminal'}),null);
  assert.equal(normalize('pre_tool_call',{tool_name:'my_read_test',tool_call_id:'x'}).activity,'unknown');
  for(const [status,outcome] of [['ok','success'],['error','failure'],['blocked','failure'],['cancelled','cancelled'],['unrecognized','unknown']])assert.equal(normalize('post_tool_call',{tool_name:'terminal',tool_call_id:'one',status,result:'SECRET OUTPUT'}).outcome,outcome);
  assert.equal(/SECRET|command|tool_input|user_message/.test(JSON.stringify(one)),false);
});
test('Hermes children use native chat identities and stay distinct from their parent and siblings',()=>{
  const children=['child-a','child-b'].map(child_session_id=>normalize('subagent_start',{parent_session_id:'chat-one',child_session_id}));
  assert.equal(children[0].id,actorKey('hermes','child-a'));assert.equal(children[0].parentId,actorKey('hermes','chat-one'));assert.notEqual(children[0].id,children[1].id);
  assert.equal(normalize('pre_tool_call',{session_id:'child-a',parent_session_id:'chat-one',tool_name:'read_file',tool_call_id:'read'}).id,children[0].id);
  assert.equal(normalize('subagent_start',{parent_session_id:'chat-one'}),null);
});
test('Hermes human input observation pairs real request IDs and clears waiting without retaining the answer',()=>{
  const store=createSessionStore({settleMs:0,now:()=>2000});store.ingest(normalize('pre_llm_call',{},100));
  store.ingest(normalize('on_human_input_request',{request_id:'request-a',prompt:'SECRET PROMPT'},200));assert.equal(store.snapshot()[0].activity,'waiting-user');
  const end=normalize('on_human_input_resolved',{request_id:'request-a',outcome:'answered',answer:'SECRET ANSWER'},300);store.ingest(end);assert.equal(store.snapshot()[0].activity,'planning');assert.equal(store.snapshot()[0].activeTools,0);assert.equal(/SECRET/.test(JSON.stringify(end)),false);store.close?.();
});
test('Hermes plugin callbacks are non-directive, bounded and strip content before dispatch',t=>{
  const python=spawnSync('python3',['--version'],{encoding:'utf8'});if(python.status!==0)return t.skip('Python unavailable');
  const file=path.join(__dirname,'..','hooks','hermes-plugin','__init__.py');
  const script=`import importlib.util,json,time,threading\nspec=importlib.util.spec_from_file_location('office_test',${JSON.stringify(file)})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nrecords=[]\no=m.Observer({},sender=records.append)\nassert o.observe('pre_llm_call',session_id='parent',user_message='SECRET',conversation_history=['SECRET']) is None\nassert o.observe('subagent_start',parent_session_id='parent',child_session_id='child',child_goal='SECRET') is None\nassert o.observe('pre_tool_call',session_id='child',tool_name='read_file',tool_call_id='read',args={'path':'SECRET'},result='SECRET') is None\no.flush()\nassert len(records)==3\nassert records[-1]['parent_session_id']=='parent'\nassert 'SECRET' not in json.dumps(records)\nassert all('hook_event_name' in x for x in records)\n# Even a blocked sender and full queue cannot block the policy callback.\ngate=threading.Event();blocked=m.Observer({},sender=lambda raw:gate.wait(1))\nstarted=time.monotonic()\nfor i in range(100):assert blocked.observe('pre_tool_call',session_id='p',tool_name='read_file',tool_call_id=str(i)) is None\nassert time.monotonic()-started<0.5\nassert blocked.events.qsize()<=64\ngate.set()\nprint(json.dumps({'records':len(records),'nonDirective':True,'parentLinked':True}))\n`;
  const result=spawnSync('python3',['-c',script],{encoding:'utf8',timeout:5000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{records:3,nonDirective:true,parentLinked:true});
});
test('Hermes Python plugin delivers real local subprocess events through the bounded spool and bridge',async t=>{
  if(spawnSync('python3',['--version']).status!==0)return t.skip('Python unavailable');
  const o=fixture(t);cli(o);assert.equal((await mutateHermes(o,true)).status,'ok');
  const received=[],store=createSessionStore({settleMs:0});
  const bridge=createObserverBridge({...o,onEvent:event=>{received.push(event);store.ingest(event);}});bridge.start();t.after(()=>bridge.stop());
  assert.equal(bridge.getConnections().find(c=>c.provider==='hermes').watching,false);
  const file=path.join(o.homeDir,'.hermes','plugins',PLUGIN_ID,'__init__.py');
  const script=`import importlib.util,json\nspec=importlib.util.spec_from_file_location('office_delivery',${JSON.stringify(file)})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nclass Context:\n def __init__(self):self.hooks={}\n def register_hook(self,name,callback):self.hooks[name]=callback\nc=Context();m.register(c)\nassert len(c.hooks)==11\nc.hooks['pre_llm_call'](session_id='parent',turn_id='one',user_message='SECRET PROMPT')\nc.hooks['subagent_start'](parent_session_id='parent',child_session_id='child',child_goal='SECRET GOAL')\nc.hooks['pre_tool_call'](session_id='child',tool_name='terminal',tool_call_id='call',args={'command':'npm test'})\nc.hooks['post_tool_call'](session_id='child',tool_name='terminal',tool_call_id='call',status='ok',result='SECRET OUTPUT')\nc.hooks['on_human_input_request'](session_id='parent',request_id='input',prompt='SECRET PROMPT')\nc.hooks['on_human_input_resolved'](session_id='parent',request_id='input',outcome='answered',answer='SECRET ANSWER')\nc.hooks['subagent_stop'](parent_session_id='parent',child_session_id='child',child_status='completed')\nc.hooks['on_session_end'](session_id='parent',turn_id='one',completed=True)\nc.hooks['on_session_finalize'](session_id='parent')\nprint('ok')\n`;
  const result=spawnSync('python3',['-c',script],{encoding:'utf8',timeout:10000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'ok');
  const end=Date.now()+4000;while(received.length<9&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(received.length,9);assert.equal(received.find(e=>e.event==='tool-start').activity,'testing');
  const child=store.snapshot().find(s=>s.sessionId==='child');assert.equal(child.parentId,'hermes:parent');assert.equal(child.closed,true);assert.equal(store.snapshot().find(s=>s.sessionId==='parent').closed,true);
  assert.equal(bridge.getConnections().find(c=>c.provider==='hermes').watching,true);
  const spool=path.join(o.dataDir,'events','hermes.jsonl');assert.equal(fs.statSync(spool).mode&0o777,0o600);assert.equal(/SECRET|npm test|tool_input|command/.test(fs.readFileSync(spool,'utf8')),false);
});
