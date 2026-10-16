'use strict';

// Explicit, owned plugin installation only. Inspection never edits Hermes files.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const net = require('node:net');
const PLUGIN_ID = 'ai-mini-office';
const OWNER = 'ai-mini-office-hermes-observer-v1';
const FILES = ['plugin.yaml','__init__.py','observer-config.json'];
const GATEWAY_HOOKS = ['on_session_start','on_session_reset','pre_llm_call','pre_tool_call','post_tool_call','on_session_end','on_session_finalize','subagent_start','subagent_stop','on_human_input_request','on_human_input_resolved'];
const gatewayReports = new Map();
const sha = value => createHash('sha256').update(value).digest('hex');
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; return null; } }
function directory(dir, create = false) {
  const absolute = path.resolve(dir); let current = path.parse(absolute).root;
  const aliases = process.platform === 'darwin' ? {'/var':'/private/var','/tmp':'/private/tmp','/etc':'/private/etc'} : {};
  for (const component of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,component); let entry = stat(current);
    if (!entry && create) { fs.mkdirSync(current,{mode:0o700}); entry = stat(current); }
    if (!entry) continue;
    if (entry.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Hermes 插件目录无法安全确认，未改动');
  }
}
function read(file, limit = 65536) {
  const entry = stat(file);
  if (!entry || !entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || entry.size > limit) throw new Error('Hermes 插件文件无法安全确认，已保留');
  const fd = fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try { const opened=fs.fstatSync(fd); if (opened.ino!==entry.ino || opened.dev!==entry.dev || opened.size>limit) throw new Error('Hermes 插件读取期间改变'); return fs.readFileSync(fd); }
  finally { fs.closeSync(fd); }
}
function hermesHome({homeDir,env}) {
  const home = env.HERMES_HOME || path.join(homeDir,'.hermes');
  if (typeof home !== 'string' || !path.isAbsolute(home) || /[\u0000-\u001f]/.test(home) || home.split(path.sep).includes('..')) throw new Error('HERMES_HOME 必须是明确的绝对路径');
  return home;
}
function executable(options) {
  const choices = (options.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,'hermes'));
  choices.push(path.join(options.homeDir,'.local','bin','hermes'),path.join(hermesHome(options),'hermes-agent','.hermes','bin','hermes'));
  return choices.find(file=>{try { return fs.statSync(file).isFile() && Boolean(fs.statSync(file).mode & 0o111); } catch { return false; }});
}
function owned(target) {
  directory(target);
  const entry = stat(target); if (!entry) return null;
  const manifest=JSON.parse(read(path.join(target,'.mini-office-owned.json')).toString('utf8'));
  if (manifest.owner!==OWNER || manifest.version!==1 || !manifest.files || !FILES.every(file=>typeof manifest.files[file]==='string')) throw new Error('Hermes 同名插件不是本应用拥有，已保留');
  for (const file of FILES) if (sha(read(path.join(target,file)))!==manifest.files[file]) throw new Error('Hermes 插件被外部修改，已保留');
  if (fs.readdirSync(target).some(file=>![...FILES,'.mini-office-owned.json','__pycache__'].includes(file))) throw new Error('Hermes 插件包含其他文件，已保留');
  return manifest;
}
// Hermes' supported local control protocol. This never runs on inspection or a
// timer: only an explicit Connect / Reload requests plugin discovery in a live
// gateway. No messages, tools, session resets or gateway restarts are sent.
function gatewaySocket(home) {
  directory(home);
  let file=path.join(home,'gateway.sock'), entry=stat(file);
  if (!entry) {
    const pointer=path.join(home,'gateway.sock.path'), pointerStat=stat(pointer);
    if (!pointerStat) return null;
    if (typeof process.getuid==='function' && pointerStat.uid!==process.getuid() || pointerStat.mode&0o022) throw new Error('unsafe gateway pointer');
    file=read(pointer,4096).toString('utf8').trim();
    if (!path.isAbsolute(file) || /[\u0000-\u001f]/.test(file) || file.split(path.sep).includes('..')) throw new Error('unsafe gateway pointer');
    entry=stat(file);
  }
  if (!entry || !entry.isSocket() || entry.isSymbolicLink() || entry.mode&0o077 || typeof process.getuid==='function' && entry.uid!==process.getuid()) throw new Error('unsafe gateway socket');
  return file;
}
function queryGateway(file, verb, params, timeout) {
  return new Promise((resolve,reject)=>{
    let done=false, bytes=0, chunks=[];
    const socket=net.createConnection({path:file});
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('gateway timeout')),timeout);
    socket.on('error',error=>finish(error));
    socket.on('connect',()=>socket.write(JSON.stringify({verb,id:1,protocol:1,...(params?{params}:{})})+'\n'));
    socket.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>512*1024)return finish(new Error('gateway response too large'));
      chunks.push(chunk);
      if(chunk.includes(10)) {
        try {
          const response=JSON.parse(Buffer.concat(chunks).toString('utf8').split('\n')[0]);
          if(response?.protocol!==1 || response.id!==1 || response.ok!==true || !response.result || typeof response.result!=='object')return finish(new Error('unsupported gateway response'));
          finish(null,response.result);
        } catch(error) { finish(error); }
      }
    });
    socket.on('end',()=>finish(new Error('incomplete gateway response')));
  });
}
async function reloadHermesGateway(options) {
  const home=hermesHome(options);
  const unavailable={gatewayLoaded:false,detail:'Hermes 只读插件已安装；未确认运行中的网关，请启动网关后重新加载，以收到真实事件为准'};
  let report;
  try {
    const file=gatewaySocket(home);
    if(!file)report={...unavailable,gatewayStatus:'not-running'};
    else {
      const timeout=Math.max(25,Math.min(options.gatewayTimeoutMs||8000,30000));
      const deadline=Date.now()+timeout;
      const identity=await queryGateway(file,'identify',null,timeout);
      if(identity.protocol!==1 || identity.kind!=='hermes-gateway' || typeof identity.hermes_home!=='string' || path.resolve(identity.hermes_home)!==path.resolve(home)) throw new Error('gateway identity mismatch');
      const result=await queryGateway(file,'reload-plugins',{home},Math.max(1,deadline-Date.now()));
      const activation=Array.isArray(result.activations) && result.activations.find(entry=>entry?.name===PLUGIN_ID || entry?.key===PLUGIN_ID);
      const hooks=activation?.activated_now?.hooks;
      if(result.reloaded!==true || typeof result.home!=='string' || path.resolve(result.home)!==path.resolve(home) || !Array.isArray(hooks) || !GATEWAY_HOOKS.every(name=>hooks.includes(name))) throw new Error('observer hooks not confirmed');
      report={gatewayLoaded:true,gatewayStatus:'loaded',gatewayVerifiedAt:Date.now(),gatewayHookCount:GATEWAY_HOOKS.length,
        detail:'Hermes 网关已确认观察钩子；无需重启，活动以收到真实事件为准'};
    }
  } catch {report={...unavailable,gatewayStatus:'unverified'};}
  gatewayReports.set(home,report);
  while(gatewayReports.size>16)gatewayReports.delete(gatewayReports.keys().next().value);
  return report;
}
function inspectHermes(options) {
  let available=false;
  try {
    available=Boolean(executable(options));
    const home=hermesHome(options), target=path.join(home,'plugins',PLUGIN_ID);
    const manifest=owned(target);
    return {available,installed:manifest?.activation==='enabled',provisioned:Boolean(manifest),
      detail:manifest?.activation==='enabled' ? 'Hermes 只读插件已安装；可重新加载运行中的网关，以收到真实事件为准' : '连接后安装 Hermes 只读插件；不接管审批，不自动重启 Hermes',
      ...(manifest?.activation==='enabled' ? gatewayReports.get(home) : {})};
  } catch (error) { return {available,installed:false,detail:error.message}; }
}
function runCli(file,args,options) {
  return new Promise(resolve=>{const child=execFile(file,args,options,(error)=>resolve({error,status:error?1:0}));child.stdin?.end();});
}
async function mutateHermes(options, install) {
  let staged, lockFd, lockFile, lockStat;
  try {
    const hermes=executable(options);
    if (install && !hermes) throw new Error('未找到 Hermes CLI；请先安装 Hermes Agent');
    const home=hermesHome(options), plugins=path.join(home,'plugins'), target=path.join(plugins,PLUGIN_ID);
    const before=owned(target);
    if (!install && !before) return {status:'unchanged',provider:'hermes',installed:false,detail:'没有本应用拥有的 Hermes 插件'};
    if (!install && !hermes) throw new Error('未找到 Hermes CLI；已保留插件，请恢复 Hermes 后移除');
    directory(plugins,true);
    lockFile=path.join(plugins,'.mini-office-hermes.lock');
    lockFd=fs.openSync(lockFile,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);
    lockStat=fs.fstatSync(lockFd); fs.writeFileSync(lockFd,JSON.stringify({owner:OWNER,pid:process.pid}));
    if (install) {
      const source=path.join(options.appRoot,'hooks','hermes-plugin');
      const values={
        'plugin.yaml':fs.readFileSync(path.join(source,'plugin.yaml')),
        '__init__.py':fs.readFileSync(path.join(source,'__init__.py')),
        'observer-config.json':Buffer.from(JSON.stringify({owner:OWNER,dataDir:options.dataDir,electronPath:options.electronPath,observer:path.join(options.appRoot,'hooks','observe.cjs')})),
      };
      const manifest={owner:OWNER,version:1,activation:'pending',files:Object.fromEntries(FILES.map(file=>[file,sha(values[file])]))};
      if (before?.activation==='enabled' && FILES.every(file=>before.files[file]===manifest.files[file])) {
        return {status:'unchanged',provider:'hermes',installed:true,...await reloadHermesGateway(options)};
      }
      staged=path.join(plugins,'.mini-office-stage-'+randomUUID()); fs.mkdirSync(staged,{mode:0o700});
      for (const file of FILES) fs.writeFileSync(path.join(staged,file),values[file],{flag:'wx',mode:0o600});
      fs.writeFileSync(path.join(staged,'.mini-office-owned.json'),JSON.stringify(manifest),{flag:'wx',mode:0o600});
      // Reverify ownership before replacing a previous managed generation.
      if (before) { const current=owned(target); if (JSON.stringify(current)!==JSON.stringify(before)) throw new Error('Hermes 插件准备期间改变，已保留'); }
      else if (stat(target)) throw new Error('Hermes 插件目标已出现，已保留');
      let backup;
      if (before) { backup=path.join(plugins,'.mini-office-backup-'+randomUUID()); fs.renameSync(target,backup); }
      try { fs.renameSync(staged,target); staged=null; } catch (error) { if (backup) fs.renameSync(backup,target); throw error; }
      if (backup) fs.rmSync(backup,{recursive:true});
      const result=await (options.runCli || runCli)(hermes,['plugins','enable',PLUGIN_ID],{env:{...options.env,HERMES_HOME:home},encoding:'utf8',timeout:10000,maxBuffer:65536});
      if (result.error || result.status!==0) throw new Error('Hermes 插件文件已就绪，但 CLI 启用未成功；请重试连接');
      owned(target);
      manifest.activation='enabled';
      const temp=path.join(target,'.activation-'+randomUUID()); fs.writeFileSync(temp,JSON.stringify(manifest),{flag:'wx',mode:0o600}); fs.renameSync(temp,path.join(target,'.mini-office-owned.json'));
      return {status:'ok',provider:'hermes',installed:true,...await reloadHermesGateway(options)};
    }
    const result=await (options.runCli || runCli)(hermes,['plugins','disable',PLUGIN_ID],{env:{...options.env,HERMES_HOME:home},encoding:'utf8',timeout:10000,maxBuffer:65536});
    if (result.error || result.status!==0) throw new Error('Hermes CLI 禁用未成功；已保留插件');
    const current=owned(target); if (JSON.stringify(current)!==JSON.stringify(before)) throw new Error('Hermes 插件移除前改变，已保留');
    fs.rmSync(target,{recursive:true});
    gatewayReports.delete(home);
    return {status:'ok',provider:'hermes',installed:false,detail:'已移除本应用拥有的 Hermes 只读插件'};
  } catch (error) { return {status:'error',provider:'hermes',installed:inspectHermes(options).installed,message:error.code==='EEXIST'?'Hermes 插件正在被另一操作使用，请稍后重试':error.message}; }
  finally {
    if (staged) try {fs.rmSync(staged,{recursive:true});} catch {}
    if (lockFd!==undefined) {try{fs.closeSync(lockFd);}catch{} try {const entry=stat(lockFile);if(entry&&!entry.isSymbolicLink()&&entry.ino===lockStat.ino&&entry.dev===lockStat.dev)fs.unlinkSync(lockFile);}catch{}}
  }
}
module.exports={PLUGIN_ID,OWNER,GATEWAY_HOOKS,inspectHermes,mutateHermes,reloadHermesGateway};
