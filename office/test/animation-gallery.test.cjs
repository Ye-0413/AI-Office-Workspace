'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const Model=require('../lib/avatar-performance-model.js');
const repo=path.resolve(__dirname,'../..'),dir=path.join(repo,'docs/animations');
function inspectGif(buffer){
 assert.match(buffer.toString('ascii',0,6),/^GIF8[79]a$/);assert.ok(buffer.length>=14);
 const width=buffer.readUInt16LE(6),height=buffer.readUInt16LE(8);let at=13,frames=0,delay=0,loop=null,trailer=false;const images=new Set();
 if(buffer[10]&128)at+=3*(1<<((buffer[10]&7)+1));
 const blocks=()=>{const chunks=[];while(true){assert.ok(at<buffer.length,'unterminated GIF subblocks');const n=buffer[at++];if(!n)break;assert.ok(at+n<=buffer.length,'truncated GIF subblock');chunks.push(buffer.subarray(at,at+n));at+=n;}return Buffer.concat(chunks);};
 while(at<buffer.length){const tag=buffer[at++];
  if(tag===0x3b){trailer=true;break;}
  if(tag===0x21){const type=buffer[at++];
   if(type===0xf9){const n=buffer[at++];assert.equal(n,4);delay+=buffer.readUInt16LE(at+1);at+=n;assert.equal(buffer[at++],0);}
   else if(type===0xff){const n=buffer[at++],name=buffer.toString('ascii',at,at+n);at+=n;const data=blocks();if(name==='NETSCAPE2.0'&&data[0]===1)loop=data.readUInt16LE(1);}
   else blocks();
  }else if(tag===0x2c){assert.ok(at+9<buffer.length);const start=at,packed=buffer[at+8];at+=9;if(packed&128)at+=3*(1<<((packed&7)+1));at++;blocks();images.add(createHash('sha256').update(buffer.subarray(start,at)).digest('hex'));frames++;}
  else assert.fail('Unknown GIF block '+tag);
 }
 assert.equal(trailer,true);assert.equal(at,buffer.length);return{width,height,frames,delay,loop,uniqueImages:images.size};
}
test('public gallery maps every current program to a real category GIF and Chinese title',()=>{
 const manifest=require('../../docs/animations/manifest.json'),labels=require('../../docs/animations/labels.json');
 const ids=Object.values(Model.PROGRAMS).flat();assert.deepEqual(Object.keys(labels).sort(),[...ids].sort());
 const sections=manifest.assets.filter(item=>item.file!=='overview.gif');assert.equal(sections.length,Object.keys(Model.KINDS).length);
 for(const [activity,kind]of Object.entries(Model.KINDS))assert.deepEqual(sections.find(item=>item.file===activity+'.gif')?.programs,Model.PROGRAMS[kind]);
 assert.equal(new Set(sections.flatMap(item=>item.programs)).size,ids.length);
 const overview=manifest.assets.find(item=>item.file==='overview.gif');assert.equal(overview.programs.length,11);
 for(const [name,hash]of Object.entries(manifest.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex'),hash,'re-export GIFs after changing their source: '+name);
 assert.match(manifest.publicBody,/original capsule robot/);
});
test('every published GIF is a complete looping animation rather than a still or broken image',()=>{
 const manifest=require('../../docs/animations/manifest.json');assert.equal(manifest.assets.length,12);
 for(const item of manifest.assets){const buffer=fs.readFileSync(path.join(dir,item.file)),gif=inspectGif(buffer);assert.equal(buffer.length,item.bytes,item.file);assert.ok(buffer.length<5*1024*1024);assert.equal(gif.width,item.width);assert.equal(gif.height,item.height);assert.equal(gif.frames,item.frames,item.file);assert.equal(gif.frames,144);assert.ok(gif.uniqueImages>=24,item.file+' needs changing image data');assert.equal(gif.loop,0);assert.ok(Math.abs(gif.delay-1200)<=5,item.file+' duration '+gif.delay);}
});
test('README animation links resolve locally and explain the public preview appearance',()=>{
 for(const name of ['README.md','office/README.md','docs/animations/README.md']){
  const file=path.join(repo,name),source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
   const target=match[1];if(/^(?:https?:|#)/.test(target))continue;
   assert.ok(fs.existsSync(path.resolve(path.dirname(file),target.split('#')[0])),name+' broken link '+target);
  }
  assert.match(source,/88/);assert.match(source,/原创示意/);
 }
});

test('seasonal gallery covers every real theme with at least 31 distinct animated frames',()=>{
 const F=require('../lib/festival-model.js'),gallery=path.join(repo,'docs/scenes'),manifest=JSON.parse(fs.readFileSync(path.join(gallery,'manifest.json')));
 assert.ok(F.THEMES.length>=43);assert.deepEqual(manifest.themes.map(t=>t.id),F.THEMES.map(t=>t.id));assert.equal(new Set(manifest.themes.map(t=>t.id)).size,F.THEMES.length);
 assert.equal(manifest.samples,41);assert.ok(manifest.durationMs>=600);
 for(const [name,hash]of Object.entries(manifest.sourceHashes||{}))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex'),hash,'re-export scene GIF after changing '+name);
 assert.equal(Object.keys(manifest.sourceHashes||{}).length,4,'the gallery must identify the actual four rendering sources');
 const gif=inspectGif(fs.readFileSync(path.join(gallery,'overview.gif')));assert.equal(gif.frames,41);assert.ok(gif.uniqueImages>=31);assert.equal(gif.loop,0);
 for(const name of ['overview.png','rooms.png']){const bytes=fs.readFileSync(path.join(gallery,name));assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.ok(bytes.length>10000);}
 assert.equal(manifest.rooms.completePaintings,43);assert.equal(createHash('sha256').update(fs.readFileSync(path.join(gallery,'rooms.png'))).digest('hex'),manifest.rooms.sha256);
 for(const [name,hash]of Object.entries(manifest.rooms.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex'),hash,'re-export complete rooms after changing '+name);
});
