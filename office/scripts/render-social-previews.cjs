'use strict';
// Public original stand-ins + unchanged production choreography. Imports inert.
// Electron/ffmpeg run only through the explicit main entry; root owns exporting.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {pathToFileURL,fileURLToPath}=require('node:url'),{execFileSync}=require('node:child_process');
const Social=require('../lib/social-interactions.js');
const repo=path.resolve(__dirname,'../..');
const SETTINGS=Object.freeze({fps:48,frames:168,width:1000,height:720,minimumDistinctFrames:31});
const SOURCES=Object.freeze(['office/lib/scene-model.js','office/lib/social-interactions.js','office/renderer/agent-social.js','office/renderer/agent-social.css','office/scripts/render-social-previews.cjs']);
function groups(catalog=Social.CATALOG){
  const labels={workshop:['工坊 · 小小默契','Workshop'],teahouse:['茶室 · 一盏相伴','Teahouse'],observatory:['观星室 · 同看星河','Observatory']};
  return Social.VENUES.map(venue=>({venue,label:labels[venue][0],english:labels[venue][1],cards:catalog[venue].map(item=>{
    assert.match(item.id,/^[a-z][a-z0-9-]*$/);assert.ok(Number.isFinite(item.duration)&&item.duration>0&&item.duration<=3500);
    return {id:item.id,label:item.labelZh,english:item.labelEn,duration:item.duration};
  })}));
}
function samplingTiming(duration){
  const durationMs=SETTINGS.frames*1000/SETTINGS.fps;assert.ok(Number.isFinite(duration)&&duration>0&&duration<=durationMs);
  const firstStoppedFrame=Math.ceil(duration*SETTINGS.fps/1000),firstStoppedFrameMs=firstStoppedFrame*1000/SETTINGS.fps;
  return {fps:SETTINGS.fps,frames:SETTINGS.frames,durationMs,productionProgramDurationMs:duration,
    nominalStillTailMs:durationMs-duration,firstStoppedFrame,firstStoppedFrameMs,
    nominalFrameGridStillTailMs:Math.max(0,durationMs-firstStoppedFrameMs)};
}
// GIF delays have centisecond resolution; report the encoded values instead of
// assuming the nominal 48fps grid is representable without quantization.
function gifTiming(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=14);assert.match(bytes.toString('ascii',0,6),/^GIF8[79]a$/);
  const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8),delays=[];
  let cursor=13+((bytes[10]&128)?3*(2**((bytes[10]&7)+1)):0),pendingDelay=0,trailer=false;
  const need=count=>assert.ok(cursor+count<=bytes.length,'Truncated GIF');
  const subblocks=()=>{while(true){need(1);const n=bytes[cursor++];if(!n)return;need(n);cursor+=n;}};
  while(cursor<bytes.length){
    const tag=bytes[cursor++];if(tag===0x3b){trailer=true;break;}
    if(tag===0x21){need(1);const type=bytes[cursor++];if(type===0xf9){need(6);assert.equal(bytes[cursor],4);assert.equal(bytes[cursor+5],0);pendingDelay=bytes.readUInt16LE(cursor+2)*10;cursor+=6;}else subblocks();}
    else if(tag===0x2c){need(9);const packed=bytes[cursor+8];cursor+=9;if(packed&128){const n=3*(2**((packed&7)+1));need(n);cursor+=n;}need(1);cursor++;subblocks();delays.push(pendingDelay);pendingDelay=0;}
    else assert.fail('Unexpected GIF block '+tag);
  }
  assert.ok(trailer&&delays.length>0);assert.ok(delays.every(n=>n>0),'Every encoded frame needs an explicit positive delay');
  return {width,height,frames:delays.length,durationMs:delays.reduce((a,b)=>a+b,0),frameDelaysMs:delays};
}

// Embedded verbatim, exercised by Node edge-contract tests. Never patches the
// document clock or writes the actor body, session, route or original clocks.
function previewRuntime(config){
  const fixtures=[],view=window;
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const truth=actor=>JSON.stringify({state:Object.fromEntries(Object.entries(actor).filter(([key])=>key!=='node'&&key!=='body')),html:actor.node.outerHTML});
  for(const definition of config.cards){
    const card=document.getElementById('card-'+definition.id),world=card.querySelector('.preview-world'),layer=card.querySelector('.preview-props'),actors=new Map();
    for(const [side,x,color]of [['left',440,'#bb7959'],['right',760,'#698f8b']]){
      const node=document.createElement('div'),body=document.createElement('div');node.className='preview-actor';body.className='preview-capsule';
      node.style.left=x+'px';node.style.top='340px';node.style.setProperty('--family-color',color);body.style.backgroundColor=color;
      for(const name of ['eye eye-left','eye eye-right','capsule-mark']){const part=document.createElement('span');part.className=name;body.append(part);}
      node.append(body);world.append(node);
      const id='public-social:'+config.venue+':'+definition.id+':'+side,position={x:x/12.8,y:469/7.2};
      const actor={id,serial:1,node,body,position,target:{...position},session:{id,provider:'offline-preview',status:'active',activity:'coding',turnId:'synthetic-public-stand-in'}};
      actors.set(id,actor);
    }
    const context={venue:config.venue,language:'zh',theme:'spring',resolvedTheme:'spring',artworkKey:'original-offline-social',mode:'live',fitting:false,hidden:false,reducedMotion:false,lowPower:false};
    fixtures.push({definition,card,world,layer,actors,context,api:null,truth:new Map([...actors].map(([id,actor])=>[id,truth(actor)])),originalAnimations:new Map([...actors].map(([id,actor])=>[id,actor.node.getAnimations({subtree:true})]))});
  }
  function checkActors(fixture){
    for(const[id,actor]of fixture.actors){
      check(truth(actor)===fixture.truth.get(id),'Social preview changed a mounted actor or observation');
      const original=fixture.originalAnimations.get(id),current=actor.node.getAnimations({subtree:true});
      check(current.length===original.length&&current.every((motion,i)=>motion===original[i]),'Social preview changed original actor animations');
      check(current.length===0,'Original public stand-ins must remain static, without avatar work clocks');
    }
  }
  function alpha(node,root){let value=1;while(node){value*=Number(getComputedStyle(node).opacity);if(node===root)return value;node=node.parentElement;}return value;}
  async function frame(elapsedMs){
    check(Number.isFinite(elapsedMs)&&elapsedMs>=0&&elapsedMs<3500,'Invalid social preview elapsed time');
    check(!document.hidden,'Social export requires a visible document');
    check(!view.matchMedia('(prefers-reduced-motion: reduce)').matches,'Social export requires explicitly normal motion');
    check(!document.querySelector('img,image,use'),'Social export cannot contain image references');
    const owners=[],reports=[];
    for(const f of fixtures){
      f.api?.destroy();checkActors(f);
      const api=f.api=OfficeAgentSocial.create({layer:f.layer,world:f.world,getActors:()=>f.actors,getContext:()=>f.context});
      check(api.trigger({kind:f.definition.id}),'Production social controller rejected '+f.definition.id);
      const active=api.state().active,prop=f.layer.querySelector('.agent-social-vignette');
      check(active&&active.kind===f.definition.id&&active.ids.length===2&&prop?.dataset.socialKind===f.definition.id,'Wrong actual social program');
      const motions=prop.getAnimations({subtree:true});check(motions.length>=4,'Production social program has too few finite prop owners');
      check(motions.every(motion=>prop.contains(motion.effect.target)&&motion.effect.getTiming().iterations===1&&motion.effect.getTiming().duration===f.definition.duration),'Exporter cannot seek an outside or non-finite animation');
      for(const motion of motions){motion.pause();motion.currentTime=Math.min(elapsedMs,f.definition.duration);}owners.push(...motions);
      reports.push({program:f.definition.id,ownerIds:[...active.ids],serials:[...f.actors.values()].map(actor=>actor.serial),duration:f.definition.duration,finiteDecorativeAnimations:motions.length});
    }
    await Promise.all(owners.map(motion=>motion.ready));await new Promise(resolve=>requestAnimationFrame(resolve));
    check(!document.querySelector('img,image,use'),'Production props added an image reference');
    return reports.map((report,i)=>{
      const f=fixtures[i],active=f.api.state().active;checkActors(f);check(active?.kind===f.definition.id,'Fresh finite owner was lost during the sample');
      const prop=f.layer.querySelector('.agent-social-vignette'),shapeNodes=prop.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline,text');
      check(shapeNodes.length>0,'No original production prop geometry');
      if(elapsedMs>=f.definition.duration)check([...shapeNodes].every(node=>alpha(node,prop)<=.001),'Authored social props must be transparent in their declared still tail');
      const box=f.card.querySelector('.preview-clip').getBoundingClientRect();
      return {...report,shapeCount:shapeNodes.length,transparentPropTail:elapsedMs>=f.definition.duration,crop:{x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),height:Math.round(box.height)}};
    });
  }
  function destroy(){for(const f of fixtures){f.api?.destroy();f.api=null;checkActors(f);}}
  return Object.freeze({frame,destroy});
}

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markup(group){
  const url=file=>pathToFileURL(path.join(repo,file)).href,json=JSON.stringify(group).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' file: 'unsafe-inline'; style-src 'self' file: 'unsafe-inline'; img-src 'none'; connect-src 'none'; object-src 'none'"><link rel="stylesheet" href="${url('office/renderer/agent-social.css')}"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1000px;height:720px;overflow:hidden;background:#eee9df;color:#344f54;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{height:94px;padding:19px 25px}h1{margin:0;font-size:25px}header p{margin:7px 0;font-size:13px;color:#6b7770}.grid{display:grid;grid-template-columns:470px 470px;gap:20px;padding:0 20px}.card{height:270px;border:1px solid #c8bdab;border-radius:10px;background:#e5dbc8;overflow:hidden}.preview-clip{position:relative;width:470px;height:215px;overflow:hidden;background:radial-gradient(ellipse at center,#f0e8d6,#dbd1be)}.preview-world{position:absolute;left:0;top:0;width:1280px;height:720px;transform-origin:0 0;transform:translate(-340px,-232px) scale(.85)}.preview-props{position:absolute;inset:0}.preview-actor{position:absolute;width:154px;height:129px;visibility:visible;opacity:1}.preview-capsule{position:relative;width:154px;height:129px;border:3px solid #514435;border-radius:58px 58px 44px 44px;box-shadow:inset 0 -12px 0 #00000018,0 5px 0 #9b815e33}.eye{position:absolute;top:47px;width:7px;height:10px;border-radius:3px;background:#f9efd9}.eye-left{left:48px}.eye-right{right:48px}.capsule-mark{position:absolute;left:57px;top:86px;width:34px;height:9px;border:2px solid #edd7a0;border-radius:5px}.title{height:55px;padding:7px 15px;border-top:1px solid #c8bdab;background:#f4eedf;font-size:16px}.title small{display:block;margin-top:3px;color:#6b7770;font-size:11px}footer{position:absolute;bottom:14px;left:20px;right:20px;text-align:center;font-size:12px;color:#6b7770}
  </style></head><body><header><h1>${escape(group.label)}</h1><p>${escape(group.english)} · 原创胶囊角色／真实双人道具编舞</p></header><main class="grid">${group.cards.map(card=>`<section class="card" id="card-${escape(card.id)}"><div class="preview-clip"><div class="preview-world"><div class="preview-props"></div></div></div><div class="title">${escape(card.label)}<small>${escape(card.english)}</small></div></section>`).join('')}</main><footer>离线编舞图鉴 · 独立有限道具采样 · 不代表真实导航、身体接触或 IK</footer>${SOURCES.filter(file=>file.endsWith('.js')&&!file.includes('/scripts/')).map(file=>`<script src="${url(file)}"></script>`).join('')}<script>window.preview=(${previewRuntime.toString()})(${json});</script></body></html>`;
}

async function main(){
  const {app,BrowserWindow}=require('electron'),catalog=groups();
  const out=path.join(repo,'docs/animations/social'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-public-social-'));
  app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();let win,blocked=0;const errors=[],assets=[];
  const sha=value=>createHash('sha256').update(value).digest('hex'),guard=setTimeout(()=>{console.error('Public social export exceeded180seconds');app.exit(1);},180000);
  try{
    assert.ok(catalog.length===3&&catalog.every(group=>group.cards.length===4),'Public social gallery requires the current twelve production programs');
    const sourceHashes=Object.fromEntries(SOURCES.map(file=>[file,sha(fs.readFileSync(path.join(repo,file)))]));
    const verifySources=()=>assert.deepEqual(Object.fromEntries(SOURCES.map(file=>[file,sha(fs.readFileSync(path.join(repo,file)))])),sourceHashes,'Production sources changed during public export');
    execFileSync('ffmpeg',['-version'],{stdio:'ignore'});await app.whenReady();fs.mkdirSync(out,{recursive:true});
    win=new BrowserWindow({width:SETTINGS.width,height:SETTINGS.height,useContentSize:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
    const allowed=new Set(SOURCES.map(file=>path.join(repo,file)));
    win.webContents.session.webRequest.onBeforeRequest({urls:['file:///*','http://*/*','https://*/*']},(details,callback)=>{let permitted=false;try{permitted=details.url.startsWith('file:')&&allowed.has(fileURLToPath(details.url));}catch(_){}if(!permitted)blocked++;callback({cancel:!permitted});});
    const run=code=>win.webContents.executeJavaScript(code,true);
    for(const group of catalog){
      verifySources();
      const page=path.join(scratch,group.venue+'.html');fs.writeFileSync(page,markup(group));allowed.add(page);await win.loadFile(page);
      if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});assert.equal(await run('document.hidden'),false);
      const dir=path.join(scratch,group.venue);fs.mkdirSync(dir);const data=new Map(group.cards.map(card=>[card.id,{card,hashes:new Set(),identities:new Set(),transparentTailSamples:0}])),gridHashes=new Set();
      for(let frame=0;frame<SETTINGS.frames;frame++){
        const elapsed=frame*1000/SETTINGS.fps,reports=await run('preview.frame('+elapsed+')');assert.equal(reports.length,4);
        const image=await win.webContents.capturePage(),png=image.toPNG();assert.deepEqual(image.getSize(),{width:SETTINGS.width,height:SETTINGS.height});gridHashes.add(sha(png));fs.writeFileSync(path.join(dir,'frame-'+String(frame).padStart(3,'0')+'.png'),png);
        for(const r of reports){const program=data.get(r.program);assert.ok(program);assert.equal(r.duration,program.card.duration);assert.equal(r.ownerIds.length,2);assert.deepEqual(r.serials,[1,1]);program.hashes.add(sha(image.crop(r.crop).toPNG()));program.identities.add(JSON.stringify(r.ownerIds));if(r.transparentPropTail)program.transparentTailSamples++;}
      }
      const target=path.join(out,group.venue+'.gif');execFileSync('ffmpeg',['-v','error','-framerate',String(SETTINGS.fps),'-i',path.join(dir,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=128:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0','-y',target],{stdio:'pipe'});
      const buffer=fs.readFileSync(target),encoded=gifTiming(buffer);assert.equal(encoded.width,SETTINGS.width);assert.equal(encoded.height,SETTINGS.height);assert.equal(encoded.frames,SETTINGS.frames);assert.ok(buffer.length<6*1024*1024);
      const programs=[...data].map(([id,item])=>{assert.ok(item.hashes.size>=SETTINGS.minimumDistinctFrames,id+' needs31 distinct actual PNG crops');assert.equal(item.identities.size,1);const timing=samplingTiming(item.card.duration);assert.equal(item.transparentTailSamples,SETTINGS.frames-timing.firstStoppedFrame);return {id,label:item.card.label,labelEn:item.card.english,distinctPngFrames:item.hashes.size,sampledPngFrames:SETTINGS.frames,mountedActorIdentitiesUnchanged:true,...timing,transparentPropTailSamples:item.transparentTailSamples,encodedTransparentPropTailMs:encoded.frameDelaysMs.slice(timing.firstStoppedFrame).reduce((a,b)=>a+b,0)};});
      assets.push({file:group.venue+'.gif',venue:group.venue,width:SETTINGS.width,height:SETTINGS.height,bytes:buffer.length,sha256:sha(buffer),distinctGridPngFrames:gridHashes.size,encodedTiming:encoded,programs});await run('preview.destroy()');verifySources();fs.rmSync(dir,{recursive:true,force:true});console.log(JSON.stringify({generated:group.venue,programs:programs.map(p=>({id:p.id,distinctPngFrames:p.distinctPngFrames}))}));
    }
    assert.deepEqual(errors,[]);assert.equal(blocked,0,'Unlisted resource request');
    verifySources();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:require('../package.json').version,scope:'Twelve actual OfficeAgentSocial choreographies with original static capsule stand-ins at fixed synthetic endpoints. No provider connection, observed AI fact, room navigation, body-contact or IK demonstration.',sampling:{fps:SETTINGS.fps,frames:SETTINGS.frames,nominalDurationMs:3500,method:'Each elapsed sample creates a fresh actual public create/trigger finite owner. Pause/seek is confined to that new vignette subtree. No document timeline, Date/performance, actor, body, route or original-animation clock writes. Exact GIF centisecond delays and per-program tail durations are reported separately.',stillTailScope:'Only authored decorative props become transparent; original static stand-ins stay visible.',continuousRoomPlaybackCertified:false,continuousOwnerLifetimeCertified:false,avatarWorkClockCertified:false,sourceGeometry:'Fixed mounted synthetic endpoints; no actual room walk is performed.'},sourceHashes,assets,restrictedImageElements:0,unlistedResourceRequests:blocked},null,2)+'\n');console.log(JSON.stringify({ok:true,files:3,programs:assets.reduce((n,a)=>n+a.programs.length,0),errors}));
  }catch(error){console.error(error);process.exitCode=1;}
  finally{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);}
}

module.exports=Object.freeze({SETTINGS,SOURCES,groups,samplingTiming,gifTiming,previewRuntime,markup});
if(require.main===module||process.versions.electron&&process.argv[1]&&path.resolve(process.argv[1])===__filename)main().catch(error=>{console.error(error);process.exitCode=1;});
