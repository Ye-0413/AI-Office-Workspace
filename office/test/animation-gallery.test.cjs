'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const Repertoire=require('../renderer/creature-repertoire.js');
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
// Archived public recordings retain their actual recording version and
// hashes. A distribution bump cannot pretend that old frames were captured
// again. Any source drift needs an exact, reversible provenance certificate.
function archivedSources(manifest){
 assert.equal(manifest.version,manifest.recordedVersion);
 assert.equal(manifest.distributionVersion,require('../package.json').version);
 assert.equal(manifest.provenance.status,'carried-forward');assert.equal(manifest.provenance.currentWorkshopRenderingCertified,false);
 assert.match(manifest.provenance.recording,/no (?:new native recording|re-recording)/i);
 recordedSources(manifest);
}
function recordedSources(manifest){
 const changes=manifest.provenance?.sourceChanges||[];
 assert.equal(new Set(changes.map(change=>change.file)).size,changes.length);
 for(const change of changes)assert.ok(manifest.sourceHashes[change.file]);
 for(const[name,recorded]of Object.entries(manifest.sourceHashes)){
  const current=fs.readFileSync(path.join(repo,name)),currentHash=createHash('sha256').update(current).digest('hex'),change=changes.find(change=>change.file===name);
  if(!change){assert.equal(currentHash,recorded,name);continue;}
  assert.equal(currentHash,change.currentSha256,name+' unreviewed source drift');assert.equal(recorded,change.recordedSha256);assert.ok(change.reason.length>20);
  let reconstructed=current.toString('utf8');assert.ok(change.reconstructRecordedSource.length>0);
  for(const patch of change.reconstructRecordedSource){assert.ok(patch.find.length>0);assert.equal(reconstructed.split(patch.find).length,2,name+' exact provenance patch');reconstructed=reconstructed.replace(patch.find,patch.replace);}
  assert.equal(createHash('sha256').update(reconstructed).digest('hex'),recorded,name+' recorded source must reconstruct byte-for-byte');
 }
}
test('public gallery records the current five-species, 550-recipe production library',()=>{
 const manifest=require('../../docs/animations/manifest.json');
 assert.equal(manifest.version,require('../package.json').version);
 assert.deepEqual(manifest.catalog,{species:5,activities:11,variantsPerActivity:10,recipes:550});
 const recipes=Object.values(Repertoire.catalog).flatMap(pack=>Object.values(pack.states).flat());assert.equal(recipes.length,550);assert.equal(new Set(recipes.map(recipe=>recipe.id)).size,550);
 const sections=manifest.assets.filter(item=>item.file!=='overview.gif');assert.equal(sections.length,11);
 for(const activity of Repertoire.ACTIVITIES){const expected=Repertoire.SPECIES.map(species=>Repertoire.recipes(species,activity)[0].id);assert.deepEqual(sections.find(item=>item.file===activity+'.gif')?.recipes,expected);}
 const overview=manifest.assets.find(item=>item.file==='overview.gif');assert.equal(overview.recipes.length,5);
 recordedSources(manifest);
 if(manifest.provenance){
  assert.equal(manifest.provenance.status,'preserved-recording');assert.equal(manifest.provenance.currentNameplateLayoutCertified,false);
  assert.match(manifest.provenance.recording,/no new native recording/i);
  assert.ok(manifest.provenance.sourceChanges.length>=1&&manifest.provenance.sourceChanges.length<=2);
  const change=manifest.provenance.sourceChanges.find(item=>item.file==='office/renderer/style.css');assert.ok(change);
  for(const item of manifest.provenance.sourceChanges)assert.ok(['office/renderer/style.css','office/renderer/creature-performance.js'].includes(item.file));
  const standby=manifest.provenance.sourceChanges.find(item=>item.file==='office/renderer/creature-performance.js');
  if(standby){assert.equal(manifest.provenance.currentStandbyRenderingCertified,false);assert.deepEqual(standby.reconstructRecordedSource,[{find:"    if (options.standby) return options.standbyPhase === 'play' ? 'idle' : 'resting';\n",replace:''}]);}

  // The unchanged exporter has cards and a helper, without a live room or
  // nameplate. Only those absent room selectors may carry source drift.
  const exporter=fs.readFileSync(path.join(repo,'office/scripts/render-workshop-demo.cjs'),'utf8');
  assert.doesNotMatch(exporter,/className\s*=\s*['"](?:office|actor|nameplate)\b/);
  assert.doesNotMatch(exporter,/class=['"](?:office|actor|nameplate)\b/);
  assert.doesNotMatch(exporter,/\bstandby(?:Phase)?\s*:/);
  for(const patch of change.reconstructRecordedSource)for(const css of [patch.find,patch.replace]){
   const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').trim().split('}').filter(rule=>rule.trim());assert.ok(rules.length>0);
   for(const rule of rules){const [selectors,body]=rule.split('{');assert.ok(body);for(const selector of selectors.split(','))assert.match(selector.trim(),/^\.office\[data-flat="true"\](?:\[data-nameplate-mode="compact"\])? \.actor(?:\[| |$)/);}
  }
 }
 for(const species of Repertoire.SPECIES)assert.ok(manifest.sourceHashes['office/assets/avatars/workshop-'+species+'.png']);
 assert.match(manifest.publicBody,/five original textured workshop creatures/);assert.match(manifest.scope,/synthetic/);assert.match(manifest.scope,/No local sessions/);
});
test('every published workshop GIF is a changing, complete native recording',()=>{
 const manifest=require('../../docs/animations/manifest.json');assert.equal(manifest.assets.length,12);
 for(const item of manifest.assets){const buffer=fs.readFileSync(path.join(dir,item.file)),gif=inspectGif(buffer);assert.equal(buffer.length,item.bytes,item.file);assert.equal(createHash('sha256').update(buffer).digest('hex'),item.sha256);assert.ok(buffer.length<1024*1024);assert.equal(gif.width,item.width);assert.equal(gif.height,item.height);assert.equal(gif.frames,item.frames,item.file);assert.equal(gif.frames,42);assert.ok(item.distinctPngFrames>=31);assert.ok(gif.uniqueImages>=31,item.file+' needs changing encoded pixels');assert.equal(gif.loop,0);assert.ok(Math.abs(gif.delay-item.durationMs/10)<=5,item.file+' duration '+gif.delay);}
});
test('README SVG is self-contained, animation-capable and paired with a native reduced-motion fallback',()=>{
 const manifest=require('../../docs/animations/manifest.json'),demo=manifest.demo,svg=fs.readFileSync(path.join(dir,demo.file),'utf8');
 assert.equal(Buffer.byteLength(svg),demo.bytes);assert.equal(createHash('sha256').update(svg).digest('hex'),demo.sha256);assert.ok(demo.bytes<3*1024*1024);
 assert.doesNotMatch(svg,/<(?:script|foreignObject)\b|(?:href|src)=["'](?:https?:|file:)|url\(["']?(?:https?:|file:)/i);
 assert.match(svg,/@keyframes recorded-/);assert.match(svg,/@media\(prefers-reduced-motion:reduce\)/);assert.match(svg,/data:image\/png;base64,/);assert.match(svg,/Synthetic demo sessions/);
 assert.equal(demo.selfContained,true);assert.equal(demo.scripts,0);assert.equal(demo.externalResources,0);assert.equal(demo.imageContextVerified,true);assert.equal(demo.nativeFramesDiffer,true);assert.equal(demo.reducedFramesIdentical,true);
 assert.deepEqual([...new Set(demo.recordedRecipes.map(item=>item.species))],Repertoire.SPECIES);assert.equal(demo.recordedRecipes.length,6);assert.equal(demo.recordedRecipes.find(item=>item.helper).species,'thread');assert.ok(demo.recordedRecipes.some(item=>!item.helper&&item.species==='thread'));
 const png=fs.readFileSync(path.join(dir,demo.fallback));assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1100);assert.equal(png.readUInt32BE(20),450);assert.ok(png.length>10000);
});
test('README media links resolve and identify the current original synthetic demonstration',()=>{
 for(const name of ['README.md','README.zh-CN.md','office/README.md','docs/animations/README.md','docs/releases/release-v0.24.0.md']){
  const file=path.join(repo,name),source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)|(?:src|srcset)=["']([^"']+)["']/g)){
   const target=match[1]||match[2];if(/^(?:https?:|#|data:)/.test(target))continue;
   assert.ok(fs.existsSync(path.resolve(path.dirname(file),target.split('#')[0])),name+' broken link '+target);
  }
  assert.match(source,/550/);assert.match(source,/原创|original/i);
  if(name!=='office/README.md'){assert.match(source,/<picture>/);assert.match(source,/<source\b[^>]*media=["']\(prefers-reduced-motion: reduce\)["'][^>]*srcset=["'][^"']*workshop-demo\.png["']/);assert.match(source,/<img\b[^>]*src=["'][^"']*workshop-demo\.svg["']/);}
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

test('archived lifecycle previews retain recorded provenance and at least 31 changing poses',()=>{
 const folder=path.join(dir,'lifecycle'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
 archivedSources(manifest);
 assert.match(manifest.publicBody,/original capsule robot/);assert.equal(manifest.restrictedImageElements,0);assert.equal(manifest.blockedSpriteRequests,0);
 assert.deepEqual(manifest.assets.map(item=>item.file),['walking.gif','split.gif','absorb.gif']);
 assert.equal(Object.keys(manifest.sourceHashes).length,8);assert.ok(manifest.sourceHashes['office/lib/walk-timing.js']);
 for(const item of manifest.assets){const bytes=fs.readFileSync(path.join(folder,item.file)),gif=inspectGif(bytes);assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(bytes.length<5*1024*1024);assert.equal(gif.width,item.width);assert.equal(gif.height,item.height);assert.equal(gif.frames,item.frames);assert.ok(item.fps>=40);assert.ok(item.distinctPngFrames>=31);assert.ok(gif.uniqueImages>=31,item.file+' needs changing encoded image data');assert.equal(gif.loop,0);assert.ok(Math.abs(gif.delay-item.durationMs/10)<=5);}
 const walk=manifest.assets[0].walkingCertificate;assert.ok(walk);assert.equal(walk.inPlace,true);assert.equal(walk.roomNavigationCertified,false);assert.equal(walk.worldDistance,384);assert.equal(walk.plannedDurationMs,1800);assert.equal(walk.samplingDurationMs,2000);assert.equal(walk.stillTailMs,200);assert.ok(walk.encodedStillMs>=180);assert.equal(walk.worldStride,192);assert.equal(walk.completedStrideCycles,2);assert.equal(walk.controller,'OfficeAvatarPerformance.locomotion');assert.equal(walk.sameStrideAnimationObjects,true);assert.equal(walk.first.pathDistance,0);assert.equal(walk.first.worldSpeed,0);assert.equal(walk.last.pathDistance,384);assert.equal(walk.last.worldSpeed,0);assert.ok(Math.abs(walk.last.stridePhaseMs-1200)<.001);
});


test('station gallery certifies all twelve current furniture programs and actual complete looping media',()=>{
 const Station=require('../renderer/station-arrival.js'),Exporter=require('../scripts/render-station-previews.cjs');
 const folder=path.join(dir,'stations'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
 archivedSources(manifest);assert.equal(manifest.restrictedImageElements,0);assert.equal(manifest.unlistedResourceRequests,0);
 assert.equal(manifest.sampling.continuousRoomPlaybackCertified,false);assert.equal(manifest.sampling.continuousOwnerLifetimeCertified,false);assert.match(manifest.scope,/synthetic/);assert.match(manifest.scope,/no provider connection/);
 assert.deepEqual(Object.keys(manifest.sourceHashes).sort(),[...Exporter.SOURCES].sort());
 assert.deepEqual(manifest.assets.map(a=>a.venue),Object.keys(Station.PROGRAMS));
 for(const item of manifest.assets){
  const bytes=fs.readFileSync(path.join(folder,item.file)),gif=inspectGif(bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(bytes.length,item.bytes);assert.ok(bytes.length<5*1024*1024);
  assert.equal(gif.width,1000);assert.equal(gif.height,720);assert.equal(gif.frames,72);assert.equal(gif.loop,0);assert.ok(gif.uniqueImages>=31);assert.ok(Math.abs(gif.delay-150)<=5);
  assert.deepEqual(item.programs.map(p=>p.program),Object.values(Station.PROGRAMS[item.venue]));
  for(const program of item.programs){assert.equal(program.sampledFrames,72);assert.ok(program.distinctPngFrames>=31);assert.equal(program.mountedEndpointIdentityUnchanged,true);assert.ok(program.finiteDecorativeAnimations>=2);}
 }
 assert.equal(new Set(manifest.assets.flatMap(a=>a.programs.map(p=>p.program))).size,12);
});

test('public pair gallery contains all twelve current programs and complete source-bound 48fps samples',()=>{
 const Social=require('../lib/social-interactions.js'),Export=require('../scripts/render-social-previews.cjs');
 const manifest=require('../../docs/animations/social/manifest.json');
 archivedSources(manifest);
 assert.equal(manifest.sampling.fps,48);assert.equal(manifest.sampling.frames,168);
 assert.equal(manifest.sampling.continuousOwnerLifetimeCertified,false);
 assert.equal(manifest.sampling.continuousRoomPlaybackCertified,false);
 assert.equal(manifest.sampling.avatarWorkClockCertified,false);
 assert.equal(manifest.restrictedImageElements,0);assert.equal(manifest.unlistedResourceRequests,0);
 assert.equal(manifest.assets.length,3);
 for(const asset of manifest.assets){
  assert.deepEqual(asset.programs.map(p=>p.id),Social.CATALOG[asset.venue].map(p=>p.id));
  const buffer=fs.readFileSync(path.join(dir,'social',asset.file)),gif=inspectGif(buffer),timing=Export.gifTiming(buffer);
  assert.equal(buffer.length,asset.bytes);assert.equal(createHash('sha256').update(buffer).digest('hex'),asset.sha256);
  assert.equal(gif.loop,0);assert.equal(gif.frames,168);assert.ok(gif.uniqueImages>=31);
  assert.equal(gif.width,1000);assert.equal(gif.height,720);assert.deepEqual(timing,asset.encodedTiming);
  assert.ok(Math.abs(timing.durationMs-3500)<=20);
  for(const program of asset.programs){assert.ok(program.distinctPngFrames>=31);assert.equal(program.sampledPngFrames,168);assert.equal(program.mountedActorIdentitiesUnchanged,true);assert.ok(program.transparentPropTailSamples>0);}
 }
});
