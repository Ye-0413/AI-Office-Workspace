'use strict';
// Imports an explicitly selected, original imagegen output; never generates
// artwork, downloads resources or reads upstream avatar assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [id,sourceArg,briefArg]=process.argv.slice(2);
if(!/^[a-z][a-z0-9-]{0,63}$/.test(id||'')||!sourceArg||!briefArg)throw Error('Usage: node import-generated-room.cjs room-id selected.png prompt-brief.json');
const source=path.resolve(sourceArg),brief=JSON.parse(fs.readFileSync(path.resolve(briefArg),'utf8'));
if(typeof brief.prompt!=='string'||!brief.prompt.trim())throw Error('An exact generation prompt is required');
const stat=fs.lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Selected output must be a regular local PNG');
const bytes=fs.readFileSync(source),digest=crypto.createHash('sha256').update(bytes).digest('hex');
if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected PNG output');
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
if(width<1280||height<720||width/height<1.7||width/height>1.85)throw Error('Room output needs a full-resolution 16:9 composition');
const folder=path.resolve(__dirname,'../assets/scenes/rooms'),destination=path.join(folder,id+'.png'),manifestPath=path.join(folder,'generation.json');
fs.mkdirSync(folder,{recursive:true});
if(fs.existsSync(destination)){
  if(!fs.lstatSync(destination).isFile()||fs.lstatSync(destination).isSymbolicLink()||!fs.readFileSync(destination).equals(bytes))throw Error('Refusing to overwrite a different existing room; use a new versioned id');
}else fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const record={id,file:id+'.png',sourceFile:path.basename(source),prompt:brief.prompt,
  ...(brief.editPrompt?{editPrompt:brief.editPrompt}:{}),...(brief.attempts?{attempts:brief.attempts}:{}),
  review:'Architecture and furnishing composition visually reviewed; geometry is authored against the delivered painting.',
  sha256:digest,bytes:bytes.length,width,height};
manifest.images=manifest.images.filter(row=>row.id!==id).concat(record);
const temporary=manifestPath+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify(manifest,null,2)+'\n');fs.renameSync(temporary,manifestPath);
console.log(JSON.stringify({id,file:destination,width,height,sha256:digest}));
