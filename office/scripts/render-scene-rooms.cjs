'use strict';
// Public original room art and code-native dressing; never loads avatars.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/scenes');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-public-rooms-'));
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
const base=pathToFileURL(path.join(root,'office/renderer/')).href,html=path.join(scratch,'rooms.html');let win;
fs.writeFileSync(html,`<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><link rel="stylesheet" href="theme-environment.css"><script defer src="../lib/festival-studies.js"></script><script defer src="../lib/festival-model.js"></script><script defer src="../lib/venue-model.js"></script><script defer src="../lib/scene-artwork.js"></script><script defer src="theme-environment.js"></script><style>*{box-sizing:border-box}html,body{margin:0;background:#e9dbbc;color:#655037;font-family:-apple-system,'PingFang SC',sans-serif}body{padding:12px}header{height:48px;font-size:20px;font-weight:600}header small{display:block;font-size:10px;font-weight:400;line-height:18px}.grid{display:grid;grid-template-columns:repeat(7,250px);gap:8px}.cell{position:relative;height:166px;overflow:hidden;border:1px solid #a88b5d;border-radius:4px;background:#d6c5a2}.cell h2{position:absolute;z-index:7;top:0;left:0;right:0;height:24px;padding:5px 4px;margin:0;text-align:center;font-size:11px;font-weight:600;background:#f1e5c6}.world{position:absolute;left:0;top:24px;width:1280px;height:720px;transform:scale(.1953125);transform-origin:0 0;overflow:hidden}.room-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.theme-dressing>g{opacity:1}</style></head><body><header>43 个节令工坊 · 43 themed workshops<small>43 幅完整工坊画面与真实布景代码 · no agent artwork</small></header><div class="grid"></div></body></html>`);
app.whenReady().then(async()=>{
  fs.mkdirSync(out,{recursive:true});
  win=new BrowserWindow({width:1822,height:1270,useContentSize:true,show:true,focusable:false,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(html);
  await win.webContents.executeJavaScript(`(async()=>{
    window.rooms=[];
    for(const theme of OfficeFestivals.THEMES){
      const office=document.createElement('section');office.className='cell';
      const title=document.createElement('h2');title.textContent=theme.nameZh+' · '+theme.nameEn;
      const world=document.createElement('div');world.className='world';
      // Decode one full painting at a time, then retain only its small canvas.
      // Forty-three full decoded textures can exceed Chromium's image budget.
      const image=new Image();image.src=OfficeSceneArtwork.resolve({venue:'workshop',theme:theme.id}).background;
      try{await image.decode()}catch(error){throw Error(theme.id+': '+String(error))}
      const canvas=document.createElement('canvas');canvas.className='room-art';canvas.width=512;canvas.height=288;
      const scale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
      const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      canvas.getContext('2d').drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
      image.removeAttribute('src');world.append(canvas);office.append(title,world);document.querySelector('.grid').append(office);
      rooms.push(OfficeThemeEnvironment.create({office,world,getState:()=>({theme:theme.id,weather:'off',dayPhase:'afternoon',language:'zh',reducedMotion:true})}));
    }
  })()`);
  const height=await win.webContents.executeJavaScript('document.body.scrollHeight');win.setContentSize(1822,height);
  await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const visible=await win.webContents.executeJavaScript('[...document.querySelectorAll(".cell")].length===43&&[...document.querySelectorAll(".cell")].every(n=>n.getBoundingClientRect().bottom<=innerHeight)');
  if(!visible)throw Error('Scene gallery is incomplete or clipped by the native viewport');
  fs.writeFileSync(path.join(out,'rooms.png'),(await win.webContents.capturePage()).toPNG());
  const manifestPath=path.join(out,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
  const names=['office/lib/scene-artwork.js','office/renderer/theme-environment.js','office/renderer/theme-environment.css','office/scripts/render-scene-rooms.cjs','office/assets/scenes/themes/generation.json'];
  const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  manifest.rooms={file:'rooms.png',completePaintings:43,version:require('../package.json').version,sha256:digest(path.join(out,'rooms.png')),sourceHashes:Object.fromEntries(names.map(name=>[name,digest(path.join(root,name))]))};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({ok:true,themes:43,restrictedArtwork:false,height}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
