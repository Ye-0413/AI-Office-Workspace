'use strict';
// Original public stand-in, production gait/effects, deterministic WAAPI sampling.
// Run with Electron; ffmpeg required. No avatar assets are read or exported.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),out=path.join(repo,'docs/animations/lifecycle');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-public-lifecycle-'));
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
const fps=48,frames=96,width=800,height=420,errors=[],assets=[];
const groups=[{id:'walking',label:'四足步态',detail:'原工作关节暂停 · 脚步交替 · 平滑起步'},
 {id:'split',label:'分身凝聚特效',detail:'300 毫秒凝聚准备 · 900 毫秒烟雾与光环'},
 {id:'absorb',label:'分身归返特效',detail:'680 毫秒吸收准备 · 900 毫秒向心收束'}];
let win,blocked=0;
const sources=['office/lib/avatar-performance-model.js','office/renderer/avatar-performance.js','office/renderer/avatar-performance.css','office/renderer/clone-motion.js','office/renderer/clone-motion.css','docs/animations/preview-body.js','office/scripts/render-lifecycle-previews.cjs'];
const run=code=>win.webContents.executeJavaScript(code,true);
function markup(group){
 const base=pathToFileURL(path.join(repo,'office/renderer')).href+'/';
 return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><base href="${base}"><link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="clone-motion.css"><style>
 :root{--ease-in-out:cubic-bezier(.77,0,.175,1)}*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#eee9df;color:#344f54;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{padding:19px 28px}h1{margin:0;font-size:25px}header p{margin:8px 0;color:#6b7770;font-size:13px}.actor{position:absolute;left:0;top:0;transform:translate(400px,320px) scale(2.35);z-index:1;--family-color:#718da7}.character-body{position:absolute;left:-77px;top:-115px;width:154px;height:129px}.stage-back{position:absolute;left:180px;right:180px;top:100px;bottom:52px;border-radius:12px;background:#796b54;border:1px solid #dacaa078;box-shadow:inset 0 0 70px #3d483124}.floor{position:absolute;left:280px;top:315px;width:240px;height:18px;border-radius:50%;background:#263a322e}footer{position:absolute;bottom:17px;left:0;right:0;text-align:center;font-size:12px;color:#6b7770}
 </style></head><body><header><h1>${group.label}</h1><p>${group.detail}</p></header><div class="stage-back"></div><div class="floor"></div><div class="actor"><span class="character-body"></span></div><footer>原创示意外观 · 应用实际关节／特效 · 独立离线演示</footer><script src="../lib/avatar-performance-model.js"></script><script src="${pathToFileURL(path.join(scratch,'public-renderer.js')).href}"></script><script src="clone-motion.js"></script><script src="${pathToFileURL(path.join(repo,'docs/animations/preview-body.js')).href}"></script><script>
 window.prepare=async()=>{const actor=document.querySelector('.actor'),body=actor.querySelector('.character-body'),session={id:'public-lifecycle',provider:'codex',status:'active',activity:'coding',activeTools:1};window.controller=OfficeAvatarPerformance.create({actorNode:actor,body,session});OfficeAnimationPreviewBody.install(body.querySelector('.ap-rig'));
 // Four separately visible original nubs expose all production foot joints;
 // the older work atlas's capsule shoes combine each neighboring pair.
 for(const [index,x]of [55,65,85,95].entries())body.querySelector('.ap-foot-'+(index+1)).innerHTML='<rect x="'+x+'" y="105" width="6" height="11" rx="2" fill="'+(index%2?'#a7c3c1':'#557a88')+'"/>';
 const layer=body.querySelector('.avatar-performance');layer.hidden=false;layer.style.opacity='1';layer.dataset.animate='false';
 const before=document.timeline.currentTime;
 if('${group.id}'==='walking')controller.update(session,{now:0,walking:true});else window.effect=OfficeCloneMotion.burst({anchor:actor,kind:'${group.id}'==='split'?'split':'absorb',ownerId:'public-preview'});
 window.motions=actor.getAnimations({subtree:true}).map(animation=>({animation,offset:Math.max(0,(animation.startTime??before)-before)}));for(const {animation}of motions){animation.pause();animation.currentTime=0;}await Promise.all(motions.map(({animation})=>animation.ready));
 if(document.querySelector('image,use,img'))throw Error('Public export contains an image reference');
 return{motions:motions.length,locomotion:actor.dataset.locomotion||null,externalElements:document.querySelectorAll('image,use,img').length};};
 window.seek=async(ms)=>{for(const {animation,offset}of motions)if(animation.playState!=='idle')animation.currentTime=Math.max(0,ms-offset);await new Promise(resolve=>requestAnimationFrame(resolve));};
 </script></body></html>`;
}
const guard=setTimeout(()=>{console.error('Public lifecycle export timed out');app.exit(1);},180000);
app.whenReady().then(async()=>{
 execFileSync('ffmpeg',['-version'],{stdio:'ignore'});fs.mkdirSync(out,{recursive:true});
 let source=fs.readFileSync(path.join(repo,'office/renderer/avatar-performance.js'),'utf8');
 const texture='href="../assets/avatars/${Model.ASSET}"',bitmap="const bitmap = body.querySelector('img');";
 assert.equal(source.split(texture).length,2);assert.equal(source.split(bitmap).length,2);
 // Only the resource adapter changes: detached, resource-free span provides the
 // bitmap fade API. All production joints, gait and finite FX are unmodified.
 source=source.replace(texture,'href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E"').replace(bitmap,"const bitmap = document.createElement('span');");
 fs.writeFileSync(path.join(scratch,'public-renderer.js'),source);
 win=new BrowserWindow({width,height,useContentSize:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 win.webContents.session.webRequest.onBeforeRequest({urls:['file:///*','http://*/*','https://*/*']},(details,callback)=>{const forbidden=details.url.includes('/assets/avatars/');if(forbidden)blocked++;callback({cancel:forbidden||/^https?:/.test(details.url)});});
 for(const group of groups){
  const page=path.join(scratch,group.id+'.html');fs.writeFileSync(page,markup(group));await win.loadFile(page);
  if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  assert.equal(await run('document.hidden'),false,'clone overlays need a genuinely visible document');
  const verified=await run('prepare()');assert.ok(verified.motions>=8);if(group.id==='walking')assert.equal(verified.locomotion,'true');assert.equal(verified.externalElements,0);
  const dir=path.join(scratch,group.id);fs.mkdirSync(dir);const hashes=new Set();
  for(let frame=0;frame<frames;frame++){await run('seek('+frame*1000/fps+')');const png=(await win.webContents.capturePage()).toPNG();hashes.add(createHash('sha256').update(png).digest('hex'));fs.writeFileSync(path.join(dir,'frame-'+String(frame).padStart(3,'0')+'.png'),png);}
  assert.ok(hashes.size>=31,group.id+' needs at least 31 changing production poses');
  const target=path.join(out,group.id+'.gif');execFileSync('ffmpeg',['-v','error','-framerate',String(fps),'-i',path.join(dir,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=128:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0','-y',target],{stdio:'pipe'});
  const bytes=fs.statSync(target).size;assert.ok(bytes<5*1024*1024);assets.push({file:group.id+'.gif',label:group.label,width,height,frames,fps,durationMs:frames*1000/fps,distinctPngFrames:hashes.size,bytes,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex')});
  console.log(JSON.stringify({generated:group.id,...assets.at(-1)}));fs.rmSync(dir,{recursive:true,force:true});
 }
 assert.deepEqual(errors,[]);assert.equal(blocked,0);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:require('../package.json').version,publicBody:'original capsule robot with four visible feet; resource-free detached span adapts bitmap fade API; no external sprite references',scope:'production four-foot gait and clone effect overlays; navigation and actor opacity are verified separately in native fixtures',sourceHashes:Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(repo,file))).digest('hex')])),assets,restrictedImageElements:0,blockedSpriteRequests:blocked},null,2)+'\n');console.log(JSON.stringify({ok:true,files:assets.length,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
