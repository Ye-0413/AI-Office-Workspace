'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createManualQuestions,OWNER,HEADER}=require('../lib/manual-questions.cjs');
const {mutatePlugin,inspectPlugin}=require('../lib/plugin-integrations.cjs');
const packet=(extra={})=>({agent_id:'opencode',hook_source:'opencode-plugin',question_protocol:'clawd.question.v1',host_version:'1.18.31',question_instance_id:'a'.repeat(32),request:{id:'que_test',sessionID:'ses_test',tool:{messageID:'msg_test',callID:'call-test'},questions:[{question:'PRIVATE_QUESTION Which?',header:'Pick',options:[{label:'A',description:'first'},{label:'B',description:'second'}],custom:true}]},...extra});
async function waitFor(fn){const deadline=Date.now()+3000;while(!fn()){if(Date.now()>deadline)throw new Error('Question fixture timed out');await new Promise(r=>setTimeout(r,5));}}
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'office-questions-')),dataDir=path.join(root,'data');
  let changes=0,time=Date.now();const service=createManualQuestions({dataDir,onChange(){changes++;},now:()=>time});
  t.after(()=>{service.stop();fs.rmSync(root,{recursive:true,force:true});});
  const status=await service.start();assert.equal(status.available,true,status.error);
  const runtime=JSON.parse(fs.readFileSync(path.join(dataDir,'manual-questions','runtime.json')));
  const post=(body,token=runtime.token,headers={})=>fetch(`http://127.0.0.1:${runtime.port}/question`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:typeof body==='string'?body:JSON.stringify(body),redirect:'error'});
  return{root,dataDir,service,runtime,post,changes:()=>changes,tick:ms=>{time+=ms;}};
}
test('manual questions bind one answer to one native request and require authenticated delivery confirmation',async t=>{
  const f=await fixture(t),body=packet(),response=f.post(body);
  await waitFor(()=>f.service.snapshot().length===1);const question=f.service.snapshot()[0];
  assert.equal(question.sessionId,'ses_test');assert.equal(question.canAnswer,true);
  assert.throws(()=>f.service.submit({id:'wrong-session',answers:{'0':['A']}}),/no longer/);
  assert.throws(()=>f.service.submit({id:question.id,answers:{'0':[]}}),/match/);
  f.service.submit({id:question.id,answers:{'0':['B']}});
  const res=await response,reply=await res.json();assert.equal(res.headers.get(HEADER),OWNER);assert.deepEqual(reply.answers,[['B']]);
  assert.equal(f.service.snapshot()[0].state,'awaiting-delivery');
  assert.throws(()=>f.service.submit({id:question.id,answers:{'0':['A']}}),/no longer/);
  await f.post({...body,question_result:'accepted',confirmation_token:'b'.repeat(64)});
  assert.equal(f.service.snapshot().length,1,'forged receipts cannot mark delivery');
  await f.post({...body,question_result:'unknown',confirmation_token:reply.confirmation_token});
  assert.equal(f.service.snapshot()[0].state,'unconfirmed');
  await f.post({...body,question_result:'accepted',confirmation_token:reply.confirmation_token});
  assert.equal(f.service.snapshot().length,0,'a valid delayed receipt resolves the still-locked question');assert.ok(f.changes()>=3);
  const saved=fs.readFileSync(path.join(f.dataDir,'manual-questions','runtime.json'),'utf8');assert.doesNotMatch(saved,/PRIVATE_QUESTION|ses_test|answers/);
  assert.equal(fs.statSync(path.join(f.dataDir,'manual-questions','runtime.json')).mode&0o777,0o600);
});
test('foreign web origins, wrong tokens, unknown host versions, malformed and oversized payloads cannot open prompts',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post(packet(),'bad')).status,403);
  assert.equal((await f.post(packet(),f.runtime.token,{Origin:'https://example.invalid'})).status,403);
  assert.equal((await f.post(packet({host_version:'2.0.0'}))).status,204);
  assert.equal((await f.post('{')).status,400);
  assert.equal((await f.post('x'.repeat(65537))).status,413);
  assert.deepEqual(f.service.snapshot(),[]);
});
test('native fallback and ambiguous delivery never imply success or permit automatic retries',async t=>{
  const f=await fixture(t),body=packet(),response=f.post(body);await waitFor(()=>f.service.snapshot().length===1);
  const q=f.service.snapshot()[0];f.service.submit({id:q.id,answers:{'0':['custom answer']}});const reply=await(await response).json();
  await f.post({...body,question_result:'unknown',confirmation_token:reply.confirmation_token});
  assert.equal(f.service.snapshot()[0].state,'unconfirmed');assert.equal(f.service.snapshot()[0].canAnswer,false);
  assert.throws(()=>f.service.submit({id:q.id,answers:{'0':['A']}}),/no longer/);
  f.service.native(q.id);assert.equal(f.service.snapshot().length,0);
  const next=f.post(packet({question_instance_id:'c'.repeat(32),request:{...body.request,id:'que_next'}}));await waitFor(()=>f.service.snapshot().length===1);
  f.service.native(f.service.snapshot()[0].id);assert.equal((await next).status,204);
});
test('installed OpenCode question bridge rechecks pending schema and sends exactly one explicit native reply',async t=>{
  const f=await fixture(t),homeDir=path.join(f.root,'home');fs.mkdirSync(homeDir);
  const options={provider:'opencode',homeDir,dataDir:f.dataDir,appRoot:path.resolve(__dirname,'..'),electronPath:process.execPath,env:{PATH:''},hostMajor:1};
  assert.equal((await mutatePlugin(options,true)).status,'ok');const target=inspectPlugin(options).targetPaths[0];
  const {createQuestionClient}=require(path.join(target,'questions.cjs'));
  const request=packet().request,calls=[];let isPending=true;
  const client=createQuestionClient('opencode',{directory:f.root,client:{_client:{getConfig:()=>({baseUrl:'http://127.0.0.1:12345'}),
    get:async input=>{calls.push(input.url);return input.url==='/global/health'?{data:{healthy:true,version:'1.18.31'}}:{data:isPending?[{...request,questions:request.questions.map(q=>({custom:q.custom,options:q.options.map(o=>({description:o.description,label:o.label})),header:q.header,question:q.question}))}]:[]};},
    post:async input=>{calls.push(input);isPending=false;return{data:true};}}}},path.join(target,'observer-config.json'));
  t.after(()=>client.dispose());
  client.event({type:'question.asked',properties:request});client.event({type:'question.asked',properties:request});
  await waitFor(()=>f.service.snapshot().length===1);assert.equal(calls.filter(x=>typeof x==='object').length,0);
  f.service.submit({id:f.service.snapshot()[0].id,answers:{'0':['A']}});await Promise.all(client.pending());
  const posts=calls.filter(x=>typeof x==='object');assert.equal(posts.length,1);assert.equal(posts[0].url,'/question/{requestID}/reply');
  assert.deepEqual(posts[0].path,{requestID:'que_test'});assert.deepEqual(posts[0].body,{answers:[['A']]});assert.equal(f.service.snapshot().length,0);
  client.event({type:'question.asked',properties:request});assert.equal(client.pending().length,0,'settled request never replays');
});
test('a native reply racing the UI, unsupported native endpoints and a changed pending schema cannot send an answer',async t=>{
  const f=await fixture(t),homeDir=path.join(f.root,'home');fs.mkdirSync(homeDir);
  const options={provider:'opencode',homeDir,dataDir:f.dataDir,appRoot:path.resolve(__dirname,'..'),electronPath:process.execPath,env:{PATH:''},hostMajor:1};
  await mutatePlugin(options,true);const target=inspectPlugin(options).targetPaths[0],{createQuestionClient}=require(path.join(target,'questions.cjs'));
  const request=packet().request;let reads=0,posts=0;
  const nativeClient={
    getConfig:()=>({baseUrl:'http://127.0.0.1:12345'}),
    get:async input=>input.url==='/global/health'?{data:{healthy:true,version:'1.18.31'}}:{data:++reads===1?[request]:[{...request,tool:{...request.tool,callID:'different'}}]},
    post:async()=>{posts++;return{data:true};}
  };
  const ctx={directory:f.root,client:{_client:nativeClient}};
  const client=createQuestionClient('opencode',ctx,path.join(target,'observer-config.json'));t.after(()=>client.dispose());
  client.event({type:'question.asked',properties:request});await waitFor(()=>f.service.snapshot().length===1);
  f.service.submit({id:f.service.snapshot()[0].id,answers:{'0':['A']}});await Promise.all(client.pending());assert.equal(posts,0);assert.equal(f.service.snapshot()[0].state,'unconfirmed');
  const remote=createQuestionClient('opencode',{...ctx,client:{_client:{...ctx.client._client,getConfig:()=>({baseUrl:'https://remote.example'})}}},path.join(target,'observer-config.json'));
  remote.event({type:'question.asked',properties:{...request,id:'que_remote'}});assert.equal(remote.pending().length,0);remote.dispose();
});
test('mutating the original host event while the form is open cannot redirect the displayed answer to a changed question',async t=>{
  const f=await fixture(t),homeDir=path.join(f.root,'home');fs.mkdirSync(homeDir);
  const options={provider:'opencode',homeDir,dataDir:f.dataDir,appRoot:path.resolve(__dirname,'..'),electronPath:process.execPath,env:{PATH:''},hostMajor:1};
  await mutatePlugin(options,true);const target=inspectPlugin(options).targetPaths[0],{createQuestionClient}=require(path.join(target,'questions.cjs'));
  const request=packet().request;let posts=0;
  const nativeClient={getConfig:()=>({baseUrl:'http://127.0.0.1:12345'}),
    get:async input=>input.url==='/global/health'?{data:{healthy:true,version:'1.18.31'}}:{data:[request]},post:async()=>{posts++;return{data:true};}};
  const client=createQuestionClient('opencode',{directory:f.root,client:{_client:nativeClient}},path.join(target,'observer-config.json'));t.after(()=>client.dispose());
  client.event({type:'question.asked',properties:request});await waitFor(()=>f.service.snapshot().length===1);
  assert.match(f.service.snapshot()[0].questions[0].question,/PRIVATE_QUESTION/);
  request.questions[0].question='A different native question';
  f.service.submit({id:f.service.snapshot()[0].id,answers:{'0':['A']}});await Promise.all(client.pending());
  assert.equal(posts,0);assert.equal(f.service.snapshot()[0].state,'unconfirmed');
});
