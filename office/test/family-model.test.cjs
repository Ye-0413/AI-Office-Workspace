'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const Family=require('../lib/family-model.js');
test('nested helpers share their leader color and retain their immediate parent',()=>{const graph=Family.build([{id:'grand',parentId:'child'},{id:'other'},{id:'child',parentId:'root'},{id:'root'}]);assert.deepEqual(graph.ordered.map(s=>s.id),['other','root','child','grand']);assert.equal(graph.info.get('grand').rootId,'root');assert.equal(graph.info.get('grand').parentId,'child');assert.equal(graph.info.get('grand').depth,2);assert.equal(graph.info.get('root').descendants,2);assert.equal(graph.info.get('root').children,1);assert.equal(graph.info.get('grand').color,graph.info.get('root').color);});
test('missing parents and cycles never hide actors or hang family traversal',()=>{const graph=Family.build([{id:'orphan',parentId:'missing'},{id:'b',parentId:'a'},{id:'a',parentId:'b'}]);assert.equal(graph.ordered.length,3);assert.equal(graph.info.get('a').rootId,graph.info.get('b').rootId);assert.equal(graph.info.get('orphan').parentId,'missing');assert.equal(graph.info.get('a').cycle,true);assert.equal(Family.color('full-task-id'),Family.color('full-task-id'));});
test('a descendant with an earlier ID shares the canonical family of its cyclic ancestors',()=>{const graph=Family.build([{id:'0-child',parentId:'a'},{id:'a',parentId:'b'},{id:'b',parentId:'a'}]);assert.equal(new Set([...graph.info.values()].map(item=>item.rootId)).size,1);assert.equal(new Set([...graph.info.values()].map(item=>item.color)).size,1);});
test('eight colliding root hashes receive eight visible body colours without changing real identities',()=>{
  const groups=new Map();let roots;
  for(let index=0;index<200;index++){const id='codex:full-root-'+index,key=Family.color(id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(id);if(groups.get(key).length===8){roots=groups.get(key);break;}}
  assert.ok(roots);assert.equal(new Set(roots.map(Family.color)).size,1,'fixture really exercises a hash collision');
  const registry=Family.createPaletteRegistry();registry.update(roots);
  const appearances=roots.map(id=>registry.forRoot(id));
  assert.equal(new Set(appearances.map(item=>item.bodyColor)).size,8);
  assert.equal(new Set(appearances.map(item=>item.badge)).size,8);
  for(let index=0;index<roots.length;index++){assert.equal(appearances[index].rootId,roots[index]);assert.notEqual(appearances[index].bodyColor,'#de886d');}
});
test('arrivals and shuffled snapshots preserve established concurrent colours and badges',()=>{
  const registry=Family.createPaletteRegistry();const first=['root-z','root-a','root-m'];registry.update(first);
  const original=first.map(id=>registry.forRoot(id));
  registry.update(['new-4','root-m','new-2','root-a','new-1','root-z','new-3','new-5']);
  assert.deepEqual(first.map(id=>registry.forRoot(id)),original);
  for(let tick=0;tick<50;tick++)registry.update(['new-5','new-4','new-3','new-2','new-1',...first]);
  assert.deepEqual(first.map(id=>registry.forRoot(id)),original);
  assert.equal(new Set(['new-5','new-4','new-3','new-2','new-1',...first].map(id=>registry.forRoot(id).color)).size,8);
});
test('nested helpers inherit the complete family appearance while preserving immediate ancestry',()=>{
  const registry=Family.createPaletteRegistry();registry.update(['codex:root','cursor:root']);
  const sessions=[{id:'grand',parentId:'child'},{id:'child',parentId:'codex:root'},{id:'codex:root'},{id:'cursor:root'}];
  const graph=Family.build(sessions,{registry});const root=graph.info.get('codex:root'),grand=graph.info.get('grand');
  assert.equal(grand.parentId,'child');assert.equal(grand.depth,2);assert.equal(grand.badge,root.badge);assert.equal(grand.bodyColor,root.bodyColor);assert.equal(grand.helperColor,root.helperColor);assert.notEqual(grand.helperColor,root.bodyColor);
  assert.notEqual(graph.info.get('cursor:root').bodyColor,root.bodyColor);
  assert.deepEqual(sessions,[{id:'grand',parentId:'child'},{id:'child',parentId:'codex:root'},{id:'codex:root'},{id:'cursor:root'}]);
});
test('overflow remains identifiable without recolouring the existing eight families',()=>{
  const registry=Family.createPaletteRegistry();const roots=Array.from({length:8},(_,i)=>'family-'+i);registry.update(roots);
  const before=roots.map(id=>registry.forRoot(id));const all=Array.from({length:20},(_,i)=>'family-'+i);registry.update(all);
  assert.deepEqual(roots.map(id=>registry.forRoot(id)),before);
  assert.equal(new Set(all.map(id=>registry.forRoot(id).badge)).size,20);
  assert.equal(new Set(all.map(id=>registry.forRoot(id).color)).size,8);
  registry.update(all.slice(5,13));assert.equal(new Set(all.slice(5,13).map(id=>registry.forRoot(id).color)).size,8,'available slots repair overflow collisions after the visible set shrinks');
});
test('absent history is bounded and returning families do not steal another visible colour',()=>{
  const registry=Family.createPaletteRegistry({retentionLimit:8});const old=Array.from({length:8},(_,i)=>'old-'+i),next=Array.from({length:8},(_,i)=>'new-'+i);
  registry.update(old);registry.update(next);assert.equal(registry.size,8);
  assert.equal(new Set(next.map(id=>registry.forRoot(id).color)).size,8);
  registry.update([...next,'extra']);assert.equal(registry.size,9,'current identities are protected even above the soft history bound');
});
test('historical appearance lookups never consume concurrent colour slots',()=>{
  const registry=Family.createPaletteRegistry();registry.update(['open-one']);
  const before=registry.forRoot('open-one');
  const historical=Array.from({length:40},(_,i)=>({id:'closed-'+i,closed:true}));
  const history=Family.build(historical,{registry});
  assert.equal(history.info.size,40);
  const visible=['open-one',...Array.from({length:7},(_,i)=>'new-open-'+i)];
  registry.update(visible);
  assert.deepEqual(registry.forRoot('open-one'),before);
  assert.equal(new Set(visible.map(id=>registry.forRoot(id).bodyColor)).size,8);
  // Passive lookups between snapshots must not influence the next allocation.
  const baseline=Family.createPaletteRegistry();baseline.update(['open-one']);baseline.update(visible);
  assert.deepEqual(visible.map(id=>registry.forRoot(id).bodyColor),visible.map(id=>baseline.forRoot(id).bodyColor));
});

test('siblings reserve the same family colour and number before their main appears', () => {
  const registry = Family.createPaletteRegistry();
  const members = [{id:'alpha', parentId:'main'}, {id:'beta', parentId:'main'}, {id:'nested', parentId:'beta'}];
  const before = Family.build(members, {registry}).info;
  const after = Family.build([...members, {id:'main'}], {registry}).info;
  for (const {id} of members) {
    assert.equal(before.get(id).rootId, 'main');
    assert.equal(before.get(id).badge, after.get('main').badge);
    assert.equal(before.get(id).color, after.get('main').color);
  }
});

test('a busy family folds excess helpers under its main across reordered snapshots', () => {
  const sessions = [{id:'main'}, {id:'other'}, {id:'other-child',parentId:'other'},
    ...['a','b','c','d','e'].map(id=>({id,parentId:'main'})), {id:'grand',parentId:'d'}];
  const graph = Family.build(sessions);
  const residents = new Set(['b','c','d']);
  const fold = rows => [...Family.foldedHelpers(rows, graph, residents, () => true)].sort();
  assert.deepEqual(fold(sessions), ['a','e','grand']);
  assert.deepEqual(fold([...sessions].reverse()), fold(sessions));
  assert.deepEqual(fold(sessions.filter(row => row.id !== 'main')), []);
});

test('siblings keep their group when evidence for an intermediate parent drops out of the snapshot', () => {
  const ledger = require('../lib/clone-lifecycle.js').createLedger();
  const middle = { id: 'middle', parentId: 'main' };
  const children = [{ id: 'one', parentId: 'middle' }, { id: 'two', parentId: 'main' }];
  ledger.update([middle, ...children]);
  ledger.update(children);
  const graph = Family.build(children, { ledger });
  for (const child of children) assert.equal(graph.info.get(child.id).rootId, 'main');
  assert.equal(graph.info.get('one').parentId, 'middle');
});
