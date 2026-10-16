'use strict';
// Native gallery of the shipped original scene props. No avatars or observations.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),target=path.resolve(process.env.MINI_OFFICE_ATLAS_DIR||path.join(root,'docs/scenes'));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-scene-atlas-'));app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
const renderer=pathToFileURL(path.join(root,'office/renderer/')).href;
const html=path.join(scratch,'atlas.html');
fs.writeFileSync(html,`<!doctype html><html><head><base href="${renderer}"><meta charset="utf-8"><link rel="stylesheet" href="festival-stage.css"><script defer src="../lib/festival-studies.js"></script><script defer src="../lib/festival-model.js"></script><script defer src="festival-stage.js"></script><style>*{box-sizing:border-box}html,body{margin:0;background:#e9dbbc;color:#655037;font-family:-apple-system,'PingFang SC',sans-serif}body{padding:16px}header{height:50px;font-size:20px;font-weight:600}header small{display:block;font-size:10px;font-weight:400;line-height:20px}.grid{display:grid;grid-template-columns:repeat(8,160px);gap:8px}.cell{position:relative;height:160px;border:1px solid #bda57a;border-radius:5px;background:linear-gradient(135deg,#f5e9ca,#ddcba4);overflow:hidden}.cell h2{position:absolute;left:7px;right:7px;top:4px;text-align:center;font-size:12px;margin:0;font-weight:600}.cell .world{position:absolute;inset:0}.cell .festival-widget{left:50%;top:56%;}.cell .festival-caption{font-size:9px;max-width:150px}.festival-weather,.festival-chooser,.festival-feedback{display:none!important}.festival-control{pointer-events:none}</style></head><body><header>节令机关 · Scene interaction atlas<small>43 套原创机关，播放实际应用代码 · 43 original props from the shipped renderer · no agent artwork</small></header><div class="grid"></div></body></html>`);
let win;
app.whenReady().then(async()=>{
  fs.mkdirSync(target,{recursive:true});fs.mkdirSync(path.join(target,'frames'),{recursive:true});
  win=new BrowserWindow({width:1368,height:1080,useContentSize:true,show:true,focusable:false,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(html);
  await win.webContents.executeJavaScript(`(()=>{window.atlasControllers=[];for(const theme of OfficeFestivals.THEMES){const office=document.createElement('section');office.className='cell';const label=document.createElement('h2');label.textContent=theme.nameZh;const world=document.createElement('div');world.className='world';office.append(label,world);document.querySelector('.grid').append(office);atlasControllers.push(OfficeFestivalStage.create({office,world,getState:()=>({theme:theme.id,weather:'off',language:'zh'})}));}for(const button of document.querySelectorAll('.festival-control'))button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));window.atlasAnimations=document.getAnimations();for(const animation of atlasAnimations)animation.pause();void 0})()`);
  for(let index=0;index<41;index++){
    await win.webContents.executeJavaScript(`for(const animation of atlasAnimations)animation.currentTime=${index*25};void 0`);
    await new Promise(resolve=>setTimeout(resolve,25));
    const png=(await win.webContents.capturePage()).toPNG();fs.writeFileSync(path.join(target,'frames','frame-'+String(index).padStart(3,'0')+'.png'),png);
    if(index===20)fs.writeFileSync(path.join(target,'overview.png'),png);
  }
  const F=require('../lib/festival-model.js');fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({themes:F.THEMES.map(({id,nameZh,nameEn,actionZh,actionEn,kind})=>({id,nameZh,nameEn,actionZh,actionEn,kind})),samples:41,durationMs:1000,sourceHashes:Object.fromEntries(['office/lib/festival-model.js','office/lib/festival-studies.js','office/renderer/festival-stage.js','office/renderer/festival-stage.css'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')])),source:['office/lib/festival-model.js','office/lib/festival-studies.js','office/renderer/festival-stage.js']},null,2)+'\n');
  console.log(JSON.stringify({ok:true,themes:F.THEMES.length,frames:41,target}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
