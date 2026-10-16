'use strict';
// Run from office/: electron scripts/render-animation-previews.cjs
// ffmpeg is required. No restored artwork is read or included in the output.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');const {createHash}=require('node:crypto');const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),office=path.join(repo,'office'),out=path.join(repo,'docs/animations');
const Model=require('../lib/avatar-performance-model.js'),labels=require('../../docs/animations/labels.json');
const version=require('../package.json').version;
const groups=Object.entries(Model.KINDS).map(([activity,kind])=>({activity,kind,programs:Model.PROGRAMS[kind]}));
const names={reading:'阅读',searching:'搜索',planning:'思考与规划',coding:'写代码',designing:'设计',testing:'测试',building:'构建',running:'命令执行','waiting-tool':'等待工具','waiting-user':'等待用户',error:'异常排查'};
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-public-animation-'));
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-color-profile','srgb');
const fps=12,seconds=12,frames=fps*seconds,width=1000,cardHeight=210,header=58,footer=30;
let win;const errors=[],reports=[];let blockedSprites=0;
function seedFor(activity,program){for(let seed=0;seed<5000;seed++){const session={id:'public-preview:'+program+':'+seed,provider:'codex',activity,status:'active'};if(Model.plan(session).program===program)return session;}throw new Error('No seed for '+program);}
function markup(group){
 const overview=group.activity==='overview',entries=overview?groups.map(g=>({activity:g.activity,program:g.programs[3]})):group.programs.map(program=>({activity:group.activity,program}));
 const data=entries.map(e=>({...e,session:seedFor(e.activity,e.program),label:overview?names[e.activity]:labels[e.program]}));
 const title=overview?'11 类活动 · 88 种动作':names[group.activity]+' · 八种动作';
 const height=header+Math.ceil(data.length/4)*cardHeight+footer;
 const base=pathToFileURL(path.join(office,'renderer')).href+'/';
 const body=pathToFileURL(path.join(out,'preview-body.js')).href;
 const safeRenderer=pathToFileURL(path.join(scratch,'public-renderer.js')).href;
 return {height,data,html:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${base}"><link rel="stylesheet" href="avatar-performance.css"><style>
 :root{--ease-in-out:cubic-bezier(.77,0,.175,1)}*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#eee9df;color:#344f54;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{height:${header}px;padding:13px 24px;display:flex;align-items:center;justify-content:space-between}header strong{font-size:23px;font-weight:650;letter-spacing:.025em}header span{font-size:12px;color:#75817c}.grid{display:grid;grid-template-columns:repeat(4,250px);grid-auto-rows:${cardHeight}px}.card{position:relative;margin:3px 5px;background:#fbf8f0;border:1px solid #d8d4c8;border-radius:7px;overflow:hidden}.character-body{position:absolute;left:20px;top:3px;width:154px;height:129px;transform:scale(1.28);transform-origin:0 0}.label{position:absolute;left:9px;right:9px;top:176px;text-align:center;font-size:17px;line-height:22px;font-weight:600}.code{display:none;position:absolute;left:6px;right:6px;bottom:5px;font:10px/14px ui-monospace,SFMono-Regular,monospace;text-align:center;color:#7e877d}.badge{position:absolute;left:9px;top:8px;font-size:10px;color:#89968b;z-index:5}.ap-rig{shape-rendering:geometricPrecision}.ap-meter{animation-duration:6s!important}footer{height:${footer}px;padding:7px 20px;text-align:center;font-size:11px;color:#7c857d}
 </style></head><body><header><strong>${title}</strong><span>AI MINI OFFICE · ${version}</span></header><main class="grid"></main><footer>原创示意外观 · 应用实际关节动作与道具 · 离线图集</footer><script src="../lib/avatar-performance-model.js"></script><script src="${safeRenderer}"></script><script src="${body}"></script><script>
 window.items=[];
 for(const [index,entry]of ${JSON.stringify(data)}.entries()){
  const actor=document.createElement('article');actor.className='card';
  const body=document.createElement('div');body.className='character-body';actor.append(body);
  const controller=OfficeAvatarPerformance.create({actorNode:actor,body,session:entry.session});controller.update(entry.session,{now:0});
  OfficeAnimationPreviewBody.install(body.querySelector('.ap-rig'));
  body.querySelector('.avatar-performance').style.setProperty('--ap-cycle','12s');body.querySelector('.avatar-performance').style.setProperty('--ap-offset','0ms');
  const label=document.createElement('div');label.className='label';label.textContent=entry.label;
  const code=document.createElement('div');code.className='code';code.textContent=entry.program;
  const badge=document.createElement('span');badge.className='badge';badge.textContent=String(index+1).padStart(2,'0');
  actor.append(label,code,badge);document.querySelector('.grid').append(actor);items.push({actor,body,controller,program:entry.program});
 }
 window.prepare=async()=>{if(document.querySelector('image,use,img'))throw new Error('A sprite reference reached the public preview');const animations=document.getAnimations();for(const a of animations){if(a.effect.getTiming().iterations===Infinity)a.pause();else a.finish();}await Promise.all(animations.map(a=>a.ready));window.loops=document.getAnimations().filter(a=>a.effect.getTiming().iterations===Infinity);for(const a of loops){const t=a.effect.getTiming();if(12000%Number(t.duration)!==0)throw new Error('Non-looping preview duration '+t.duration);}return items.map(i=>({program:i.actor.dataset.performanceProgram,joints:i.body.querySelectorAll('.ap-upper,.ap-arm,.ap-eyes,.ap-foot').length}));};
 window.seek=async(ms)=>{for(const a of loops)a.currentTime=ms;await new Promise(r=>requestAnimationFrame(r));};
 </script></body></html>`};
}
const guard=setTimeout(()=>{console.error('Animation export exceeded 12 minutes');app.exit(1);},720000);
app.whenReady().then(async()=>{
 execFileSync('ffmpeg',['-version'],{stdio:'ignore'});
 const originalRenderer=fs.readFileSync(path.join(office,'renderer/avatar-performance.js'),'utf8');
 const texture='href="../assets/avatars/${Model.ASSET}"';
 assert.equal(originalRenderer.split(texture).length,2,'The exporter must neutralize exactly one sprite URL');
 fs.writeFileSync(path.join(scratch,'public-renderer.js'),originalRenderer.replace(texture,'href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E"'));assert.equal(Object.keys(labels).length,88);fs.mkdirSync(out,{recursive:true});
 win=new BrowserWindow({width,height:800,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 win.webContents.session.webRequest.onBeforeRequest({urls:['file:///*','http://*/*','https://*/*']},(details,callback)=>{const sprite=details.url.includes('/assets/avatars/');if(sprite)blockedSprites++;callback({cancel:sprite||/^https?:/.test(details.url)});});
 const evaluate=source=>win.webContents.executeJavaScript(source,true);
 for(const group of [{activity:'overview'},...groups]){
  const page=markup(group),file=path.join(scratch,group.activity+'.html');fs.writeFileSync(file,page.html);win.setContentSize(width,page.height);await win.loadFile(file);
  const verified=await evaluate('prepare()');assert.deepEqual(verified.map(e=>e.program),page.data.map(e=>e.program));
  const dir=path.join(scratch,group.activity);fs.mkdirSync(dir);
  for(let frame=0;frame<frames;frame++){await evaluate('seek('+frame*1000/fps+')');const screenshot=await win.webContents.capturePage();fs.writeFileSync(path.join(dir,'frame-'+String(frame).padStart(3,'0')+'.png'),screenshot.toPNG());if(group.activity==='overview'&&frame===0)fs.writeFileSync(path.join(out,'overview.png'),screenshot.toPNG());}
  assert.equal(await evaluate('document.querySelectorAll("image,use,img").length'),0);
  const target=path.join(out,group.activity+'.gif');
  execFileSync('ffmpeg',['-v','error','-framerate',String(fps),'-i',path.join(dir,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=128:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0','-y',target],{stdio:'pipe'});
  const bytes=fs.statSync(target).size;assert.ok(bytes<5*1024*1024,'A README GIF must stay under 5 MiB');
  reports.push({file:group.activity+'.gif',programs:page.data.map(e=>e.program),width,height:page.height,frames,fps,seconds,bytes});
  console.log(JSON.stringify({generated:group.activity+'.gif',programs:verified.length,frames,bytes}));
  fs.rmSync(dir,{recursive:true,force:true});
 }
 const covered=new Set(reports.filter(r=>r.file!=='overview.gif').flatMap(r=>r.programs));assert.equal(covered.size,88);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version,publicBody:'original capsule robot; no external sprite references',source:{model:'office/lib/avatar-performance-model.js',renderer:'office/renderer/avatar-performance.js',css:'office/renderer/avatar-performance.css'},sourceHashes:Object.fromEntries(['office/renderer/avatar-performance.js','office/renderer/avatar-performance.css','docs/animations/preview-body.js'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex')])),previewTiming:'12-second synchronized cycles; application timing is unchanged',assets:reports},null,2)+'\n');
 console.log(JSON.stringify({ok:true,categories:groups.length,programs:covered.size,files:reports.length,restrictedImageElements:0,blockedSpriteRequests:blockedSprites,bytes:reports.reduce((n,r)=>n+r.bytes,0)}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
