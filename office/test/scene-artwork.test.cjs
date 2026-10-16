'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const Artwork=require('../lib/scene-artwork.js'),Festivals=require('../lib/festival-model.js'),Venues=require('../lib/venue-model.js');
test('each of the 43 workshop themes selects a different complete local room painting',()=>{
  assert.equal(Artwork.CATALOG.length,43);
  assert.equal(new Set(Artwork.CATALOG.map(item=>item.background)).size,43);
  for(const theme of Festivals.THEMES){const item=Artwork.resolve({venue:'workshop',theme:theme.id});assert.equal(item.id,theme.id);assert.equal(item.key,'workshop:'+theme.id);assert.match(item.background,/^\.\.\/assets\/scenes\/themes\/[a-z]+\.jpg$/);assert.ok(item.altZh.includes(theme.nameZh));assert.ok(item.altEn.includes(theme.nameEn));}
});
test('automatic full-room changes follow the same Hong Kong calendar boundary as local mechanisms',()=>{
  assert.equal(Artwork.resolve({theme:'auto',now:'2026-10-30T15:59:59Z'}).id,'autumn');
  assert.equal(Artwork.resolve({theme:'auto',now:'2026-10-30T16:00:00Z'}).id,'halloween');
  assert.equal(Artwork.resolve({theme:'auto',now:'2026-12-23T16:00:00Z'}).id,'christmas');
});
test('tea house and observatory retain their own whole rooms for every seasonal decoration',()=>{
  for(const venue of Venues.CATALOG.filter(item=>item.id!=='workshop'))for(const theme of Festivals.THEMES){const art=Artwork.resolve({venue:venue.id,theme:theme.id});assert.equal(art.key,venue.id);assert.equal(art.background,venue.background);assert.equal(art.id,null);}
});
test('unknown inputs cannot escape the local artwork catalogue or mutate its shared entries',()=>{
  const safe=Artwork.resolve({venue:'../../outside',theme:'../../outside',now:'2026-07-01T00:00:00Z'});assert.equal(safe.id,'summer');
  assert.throws(()=>{Artwork.CATALOG[0].background='https://outside.invalid';},TypeError);
});
test('sandboxed renderer resolves the same catalogue without Node or network access',()=>{
  const context=vm.createContext({OfficeFestivals:Festivals,OfficeVenues:Venues});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/scene-artwork.js'),'utf8'),context);
  assert.equal(context.OfficeSceneArtwork.resolve({theme:'qingming'}).key,'workshop:qingming');
});
test('every complete painting is shipped with matching provenance and distinct final image bytes',()=>{
  const dir=path.join(__dirname,'../assets/scenes/themes'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'generation.json')));
  assert.deepEqual(manifest.images.map(item=>item.id),Artwork.CATALOG.map(item=>item.id));
  assert.equal(new Set(manifest.images.map(item=>item.sha256)).size,43);
  assert.equal(manifest.referenceSha256,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../assets/office-room.jpg'))).digest('hex'));
  for(const item of manifest.images){const bytes=fs.readFileSync(path.join(dir,item.file));assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(item.prompt.length>500);assert.match(item.sourceSha256,/^[a-f0-9]{64}$/);}
  assert.doesNotMatch(JSON.stringify(manifest),/\/Users\/|\/private\/|file:\/\//);
});
