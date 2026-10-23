'use strict';
// Manual question transport adapted from Clawd on Desk's opencode-family
// plugin. It never registers permission handlers or sends chat messages.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {SOURCES,PROTOCOL,supportedVersion,prepareQuestionRequest,validateQuestionAnswers}=require('./question-wire.cjs');
const OWNER='ai-mini-office-manual-questions-v1',HEADER='x-mini-office-server';
function privateJson(file,max=32768){
  const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>max||s.mode&0o077||process.getuid&&s.uid!==process.getuid())throw new Error('Untrusted question runtime');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{const opened=fs.fstatSync(fd);if(opened.dev!==s.dev||opened.ino!==s.ino||opened.size>max)throw new Error('Question runtime changed');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
}
function readRuntime(configFile){
  const config=privateJson(configFile);
  if(config.owner!=='ai-mini-office-passive-plugin-v1'||!path.isAbsolute(config.dataDir||''))return null;
  const dir=path.join(config.dataDir,'manual-questions'),s=fs.lstatSync(dir);
  if(s.isSymbolicLink()||!s.isDirectory()||s.mode&0o077||process.getuid&&s.uid!==process.getuid())return null;
  const value=privateJson(path.join(dir,'runtime.json'),8192);
  if(value.owner!==OWNER||!Number.isInteger(value.port)||value.port<1||value.port>65535||!/^[a-f0-9]{64}$/.test(value.token||'')||!Number.isInteger(value.pid))return null;
  try{process.kill(value.pid,0);}catch{return null;}
  return value;
}
function nativeBase(ctx){
  let configured;try{configured=ctx.client?._client?.getConfig?.()?.baseUrl||ctx.serverUrl;}catch{return null;}
  if(!configured)return null;
  try{const url=new URL(String(configured));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    if(url.hostname==='0.0.0.0')url.hostname='127.0.0.1';if(url.hostname==='[::]')url.hostname='[::1]';
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return null;
    return url.toString().replace(/\/$/,'');
  }catch{return null;}
}
function createQuestionClient(provider,ctx,configFile){
  const active=new Map(),settled=new Set(),parents=new Map();let disposed=false;
  const remember=id=>{settled.add(id);while(settled.size>512)settled.delete(settled.values().next().value);};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const sameSchema=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  function finishNative(id,session,answers){
    const target=active.get(id);if(!target||target.request.sessionID!==session)return;
    target.nativeResolved=true;target.nativeAnswers=answers;
    if(!target.submitting)target.controller.abort();
  }
  function start(request){
    try{const serialized=JSON.stringify(request);if(Buffer.byteLength(serialized)>64*1024)return;request=JSON.parse(serialized);}catch{return;}
    const prepared=prepareQuestionRequest(request),baseUrl=nativeBase(ctx),client=ctx.client?._client,directory=ctx.directory;
    if(disposed||!prepared||!baseUrl||!ctx.directory||typeof client?.get!=='function'||typeof client?.post!=='function'
      ||parents.has(request.sessionID)||active.has(request.id)||settled.has(request.id)||active.size>=32)return;
    let runtime;try{runtime=readRuntime(configFile);}catch{return;}if(!runtime)return;
    const controller=new AbortController(),target={request:prepared.wire,controller,submitting:false,nativeResolved:false};
    active.set(request.id,target);
    const current=()=>!disposed&&!controller.signal.aborted&&active.get(request.id)===target;
    const options=()=>({baseUrl,query:{directory},signal:controller.signal,redirect:'error'});
    const pending=async()=>{const result=await client.get({url:'/question',...options()});return current()&&!result?.error&&Array.isArray(result?.data)&&result.data.some(q=>q.id===request.id&&q.sessionID===request.sessionID&&q.tool?.messageID===request.tool.messageID&&q.tool?.callID===request.tool.callID&&sameSchema(q.questions,request.questions));};
    const timer=setTimeout(()=>controller.abort(),590000);timer.unref?.();
    let packet,confirmation,outcome='native-fallback';
    target.completion=(async()=>{
      const health=await client.get({url:'/global/health',...options()});
      if(!current()||health?.error||health?.data?.healthy!==true||!supportedVersion(provider,health.data.version)||!await pending())return;
      packet={agent_id:provider,hook_source:SOURCES[provider],question_protocol:PROTOCOL,host_version:health.data.version,
        question_instance_id:randomBytes(16).toString('hex'),request:prepared.wire};
      const url=`http://127.0.0.1:${runtime.port}/question`;
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+runtime.token},body:JSON.stringify(packet),redirect:'error',signal:controller.signal});
      if(response.status!==200||response.headers.get(HEADER)!==OWNER||!current())return;
      const header=response.headers.get('x-mini-office-question-confirmation');if(!/^[a-f0-9]{64}$/.test(header||''))return;
      confirmation=header;
      const text=await response.text();if(Buffer.byteLength(text)>64*1024)return;const reply=JSON.parse(text);
      const indexed=Object.fromEntries((Array.isArray(reply?.answers)?reply.answers:[]).map((answer,i)=>[String(i),answer]));
      const answers=validateQuestionAnswers(prepared.wire,indexed);
      if(reply.confirmation_token!==confirmation||!answers||!current()||!await pending())return;
      target.submitting=true;
      const result=await client.post({url:'/question/{requestID}/reply',path:{requestID:request.id},body:{answers},headers:{'Content-Type':'application/json'},...options()});
      if(provider==='opencode')outcome=!result?.error&&result?.data===true?'accepted':result?.response?.status===404?'resolved-elsewhere':result?.error?'native-fallback':'unknown';
      else outcome=!result?.error&&result?.data===true&&sameSchema(target.nativeAnswers,answers)?'accepted':target.nativeResolved||result?.response?.status===404?'resolved-elsewhere':'unknown';
    })().catch(()=>{outcome=target.submitting?'unknown':'native-fallback';}).finally(async()=>{
      clearTimeout(timer);
      if(packet&&confirmation){const receipt=new AbortController(),timeout=setTimeout(()=>receipt.abort(),2000);timeout.unref?.();
        try{await fetch(`http://127.0.0.1:${runtime.port}/question`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+runtime.token},redirect:'error',body:JSON.stringify({...packet,question_result:outcome,confirmation_token:confirmation}),signal:receipt.signal});}catch{}finally{clearTimeout(timeout);}}
      if(active.get(request.id)===target)active.delete(request.id);remember(request.id);
    });
  }
  function event(raw){
    const p=raw?.properties||{},info=p.info||{};
    if(raw?.type==='session.created'&&info.parentID){parents.set(info.id,info.parentID);while(parents.size>512)parents.delete(parents.keys().next().value);}
    if(raw?.type==='question.asked')start(p);
    else if(['question.replied','question.rejected'].includes(raw?.type))finishNative(p.requestID||p.id,p.sessionID,p.answers);
    else if(raw?.type==='session.deleted'){const id=info.id||p.sessionID;for(const [key,t]of active)if(t.request.sessionID===id){t.controller.abort();active.delete(key);remember(key);}parents.delete(id);}
  }
  function dispose(){disposed=true;for(const t of active.values())t.controller.abort();active.clear();parents.clear();}
  return{event,dispose,pending:()=>[...active.values()].map(t=>t.completion)};
}
module.exports={createQuestionClient};
