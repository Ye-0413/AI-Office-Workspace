'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { SOURCES, PROTOCOL, supportedVersion, prepareQuestionRequest, validateQuestionAnswers } = require('./agent-question-wire.cjs');

const OWNER = 'ai-mini-office-manual-questions-v1', MAX_BODY = 64 * 1024;
const HEADER = 'x-mini-office-server', LEASE_MS = 590000, ACK_MS = 12000;
const secret = () => randomBytes(32).toString('hex');
const same = (a,b) => {if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
const object = x => x && typeof x==='object' && !Array.isArray(x);
function secureDirectory(dir) {
  let current=path.parse(dir).root;
  for(const part of dir.slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);let s;
    try{s=fs.lstatSync(current);}catch(e){if(e.code!=='ENOENT')throw e;fs.mkdirSync(current,{mode:0o700});s=fs.lstatSync(current);}
    const aliases=process.platform==='darwin'?{'/tmp':'/private/tmp','/var':'/private/var'}:{};
    if(s.isSymbolicLink()&&aliases[current]&&fs.realpathSync(current)===aliases[current])continue;
    if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Unsafe question runtime directory');
  }
  const s=fs.lstatSync(dir);if(process.getuid&&s.uid!==process.getuid())throw new Error('Question runtime owner mismatch');fs.chmodSync(dir,0o700);
}

// Clawd's request-scoped question channel, adapted to this app's checked IPC.
// There are deliberately no tool approval, automatic answer or message APIs.
function createManualQuestions({dataDir,onChange=()=>{},now=Date.now}={}) {
  if(typeof dataDir!=='string'||!path.isAbsolute(dataDir))throw new TypeError('Absolute question data directory required');
  const dir=path.join(dataDir,'manual-questions'),file=path.join(dir,'runtime.json'),entries=new Map();
  const instance=secret(),token=secret();let server,port=null,running=false,error='',closed=false;
  const changed=()=>{try{onChange();}catch{}};
  function finish(entry,state='resolved') {
    clearTimeout(entry.timer);clearTimeout(entry.ackTimer);
    if(!entry.response.writableEnded&&!entry.response.destroyed){entry.response.writeHead(204,{[HEADER]:OWNER});entry.response.end();}
    entry.state=state;entries.delete(entry.id);changed();
  }
  function snapshot() {
    return [...entries.values()].map(e=>({id:e.id,provider:e.provider,sessionId:e.request.sessionID,toolCallId:e.request.tool.callID,
      questions:e.display.questions,state:e.state,canAnswer:e.state==='waiting',createdAt:e.createdAt,expiresAt:e.createdAt+LEASE_MS}));
  }
  function status(){return{available:running,running,providers:['opencode','mimocode'],...(error?{error}:{})};}
  function fallback(res,code=204){if(!res.writableEnded&&!res.destroyed){res.writeHead(code,{[HEADER]:OWNER});res.end();}}
  function handle(req,res) {
    if(req.method!=='POST'||req.url!=='/question'){fallback(res,404);req.resume();return;}
    if(req.headers.origin||!same(req.headers.authorization,'Bearer '+token)){fallback(res,403);req.resume();return;}
    let size=0;const chunks=[];let over=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){over=true;chunks.length=0;fallback(res,413);}else if(!over)chunks.push(chunk);});
    req.on('error',()=>fallback(res));
    req.on('end',()=>{
      if(over||res.writableEnded||res.destroyed)return;
      let packet;try{packet=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fallback(res,400);return;}
      const prepared=prepareQuestionRequest(packet?.request),provider=packet?.agent_id;
      if(!object(packet)||!Object.hasOwn(SOURCES,provider)||packet.hook_source!==SOURCES[provider]
        ||packet.question_protocol!==PROTOCOL||!supportedVersion(provider,packet.host_version)
        ||typeof packet.question_instance_id!=='string'||!/^[a-f0-9]{32}$/.test(packet.question_instance_id)
        ||!prepared||packet.host||packet.wsl||packet.headless===true){fallback(res);return;}
      const existing=[...entries.values()].find(e=>e.provider===provider&&e.request.id===prepared.wire.id&&e.request.sessionID===prepared.wire.sessionID);
      if(packet.question_result!==undefined){
        if(!existing||existing.instance!==packet.question_instance_id||existing.version!==packet.host_version
          ||!['awaiting-delivery','unconfirmed'].includes(existing.state)||!same(packet.confirmation_token,existing.confirmation)
          ||JSON.stringify(existing.request)!==JSON.stringify(prepared.wire)){fallback(res);return;}
        if(['accepted','resolved-elsewhere'].includes(packet.question_result))finish(existing);
        else if(['native-fallback','unknown'].includes(packet.question_result)){clearTimeout(existing.ackTimer);existing.state='unconfirmed';changed();}
        fallback(res);return;
      }
      if(existing||entries.size>=32){fallback(res);return;}
      const entry={id:secret(),provider,instance:packet.question_instance_id,version:packet.host_version,request:prepared.wire,
        display:prepared.displayInput,response:res,state:'waiting',createdAt:now()};
      entry.timer=setTimeout(()=>finish(entry,'expired'),LEASE_MS);entry.timer.unref?.();
      res.on('close',()=>{if(!res.writableEnded&&entries.has(entry.id))finish(entry,'disconnected');});
      entries.set(entry.id,entry);changed();
    });
  }
  async function start() {
    if(running||closed)return status();
    try{
      secureDirectory(dir);server=http.createServer(handle);server.headersTimeout=15000;server.requestTimeout=15000;
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      port=server.address().port;
      let old;try{const s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1||s.size>8192||process.getuid&&s.uid!==process.getuid())throw new Error('Unsafe question runtime file');old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.owner!==OWNER)throw new Error('Foreign question runtime file');}catch(e){if(e.code!=='ENOENT')throw e;}
      const temporary=path.join(dir,'.runtime-'+instance+'.tmp');
      try{fs.writeFileSync(temporary,JSON.stringify({owner:OWNER,instance,token,port,pid:process.pid})+'\n',{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}finally{try{fs.unlinkSync(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}}
      running=true;error='';changed();
    }catch{error='Manual question channel unavailable';server?.close();server=null;running=false;}
    return status();
  }
  function submit(input) {
    if(!object(input)||typeof input.id!=='string')throw new TypeError('Question identity required');
    const entry=entries.get(input.id);
    if(!entry||entry.state!=='waiting'||now()>entry.createdAt+LEASE_MS||entry.response.destroyed||entry.response.writableEnded)throw new Error('Question is no longer answerable');
    const answers=validateQuestionAnswers(entry.request,input.answers);
    if(!answers)throw new TypeError('Answers do not match the pending question');
    entry.confirmation=secret();entry.state='awaiting-delivery';
    entry.ackTimer=setTimeout(()=>{if(entries.has(entry.id)&&entry.state==='awaiting-delivery'){entry.state='unconfirmed';changed();}},ACK_MS);entry.ackTimer.unref?.();
    entry.response.writeHead(200,{'Content-Type':'application/json',[HEADER]:OWNER,'x-mini-office-question-confirmation':entry.confirmation});
    entry.response.end(JSON.stringify({answers,confirmation_token:entry.confirmation}));changed();
    return{id:entry.id,state:entry.state};
  }
  function native(id){const entry=entries.get(id);if(!entry)throw new Error('Question is no longer pending');finish(entry,'native-fallback');return{dismissed:true};}
  function stop(){closed=true;running=false;for(const e of [...entries.values()])finish(e);server?.close();server=null;
    try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.instance===instance){const s=fs.lstatSync(file);if(s.isFile()&&!s.isSymbolicLink())fs.unlinkSync(file);}}catch{} }
  return Object.freeze({start,stop,status,snapshot,submit,native});
}
module.exports={createManualQuestions,OWNER,HEADER};
