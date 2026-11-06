'use strict';
// Native production-path audit. Synthetic specimens never enter the roster.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const Manifest = require('../renderer/creature-frame-manifest.js');
const Appearance = require('../lib/agent-appearance.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pixel-frames-'));
app.setPath('userData', scratch); app.disableHardwareAcceleration();
// Native screenshot bytes must have deterministic RGB values on wide-gamut displays.
app.commandLine.appendSwitch('force-color-profile', 'srgb');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let win; const errors = [];
const run = source => win.webContents.executeJavaScript(source, true);
async function until(source, label) { const end = Date.now() + 15000; while (Date.now() < end) { if (await run(source)) return; await wait(30); } throw Error(label); }
const guard = setTimeout(() => app.exit(2), 90000);

app.whenReady().then(async () => {
  const specimens = Object.entries(Manifest.strips).flatMap(([species, states]) => Object.entries(states).map(([activity, entry]) => ({ design: Appearance.catalog.find(item => item.id === species), activity, entry })));
  assert.equal(specimens.length, 55);
  assert.equal(Manifest.fps, 30);
  assert.equal(Manifest.cell, 68);
  assert.equal(Manifest.columns, 12);
  for (const { design, activity, entry } of specimens) {
    const id = design.id + '/' + activity;
    const bytes = fs.readFileSync(path.join(__dirname, '../assets/avatars/frames', id + '.png'));
    assert.equal(entry.frames, Math.ceil(entry.duration * 30 / 1000), id + ' frame count');
    assert.equal(bytes.readUInt32BE(16), Manifest.columns * Manifest.cell, id + ' PNG width');
    assert.equal(bytes.readUInt32BE(20), Math.ceil(entry.frames / Manifest.columns) * Manifest.cell, id + ' PNG height');
  }
  const base = pathToFileURL(path.resolve(__dirname, '../renderer')).href + '/';
  const scripts = ['../lib/avatar-performance-model.js', ...Appearance.catalog.map(item => 'repertoire-' + item.id + '.js'), 'creature-repertoire.js', 'creature-activity.js', 'creature-frame-manifest.js', 'creature-frames.js', 'creature-emotes.js', 'creature-performance.js'];
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">${['style.css', 'avatar-performance.css', 'creature-activity.css', 'creature-performance.css'].map(name => '<link rel="stylesheet" href="' + name + '">').join('')}<style>
  html,body{margin:0;width:1100px;height:auto;overflow:visible;background:#eee5d5;color:#5b472f;font:13px -apple-system,sans-serif}h1{font-size:22px;margin:24px 24px 6px}p{margin:0 24px 20px;color:#82715c}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px}.specimen{height:234px;position:relative;background:#fbf5e8;border:1px solid #dcccb2;border-radius:0}.specimen h2{font-size:14px;margin:13px}.specimen small{position:absolute;bottom:14px;left:13px}.specimen .character-body{position:absolute;left:29px;top:81px;--avatar-presentation-scale:1.8}.ground{position:absolute;top:190px;left:38px;width:135px;height:8px;background:#836a4420;clip-path:polygon(5% 0,95% 0,95% 25%,100% 25%,100% 75%,95% 75%,95% 100%,5% 100%,5% 75%,0 75%,0 25%,5% 25%)}
  </style></head><body><h1>像素工坊 / Pixel Workshop</h1><p>合成状态预览 · 与真实会话分开 / Synthetic specimens, separate from real sessions</p><main class="grid"></main>${scripts.map(name => '<script src="' + name + '"></script>').join('')}<script>
  window.items=[];for(const spec of ${JSON.stringify(specimens)}){const actor=document.createElement('section');actor.className='specimen';actor.innerHTML='<h2>'+spec.design.labelZh+' / '+spec.design.labelEn+'</h2><span class="ground"></span><small>'+spec.activity+'</small>';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.src='../assets/avatars/'+spec.design.asset;body.append(image);actor.append(body);document.querySelector('.grid').append(actor);const session={id:'pixel-test:'+spec.design.id+':'+spec.activity,provider:'codex',status:'active',activity:spec.activity};const controller=OfficeCreaturePerformance.create({actorNode:actor,body,image,session,design:spec.design});controller.update(session,{now:0});items.push({...spec,actor,body,image,session,controller});}
  window.paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  window.reels=item=>item.body.getAnimations({subtree:true}).filter(a=>a.effect?.target?.matches('.cp-frame'));
  window.settle=async()=>{for(const item of items)for(const a of item.body.getAnimations({subtree:true})){if(a.effect.getTiming().iterations!==Infinity)a.finish();else a.pause();}await paint();};
  </script></body></html>`;
  const file = path.join(scratch, 'frames.html'); fs.writeFileSync(file, html);
  win = new BrowserWindow({ width: 1100, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', detail => { if (detail.level === 'error') errors.push(detail.message); });
  await win.loadFile(file);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await until(`items.every(item=>item.body.querySelector('.creature-performance').dataset.artState==='healthy'&&item.body.querySelector('.creature-performance').dataset.frames==='true'&&item.body.querySelector('.cp-frames').dataset.ready==='true')`, 'Every local strip must decode before replacing its fallback');
  await wait(300); await run('settle()');
  // Decode each actual source bitmap and inspect the native RGBA grid.
  // Playback may intentionally hold some poses, but sparse placeholders
  // cannot pass as a 30 Hz authored sequence.
  const raster = await run(`(async()=>{
    const canvas=document.createElement('canvas'), context=canvas.getContext('2d',{willReadFrequently:true}), results=[];
    const cell=${Manifest.cell}, columns=${Manifest.columns};
    for(const item of items){
      const image=new Image();
      image.src=item.body.querySelector('.cp-frame').getAttribute('href');
      await image.decode();
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      context.drawImage(image,0,0);
      const {data}=context.getImageData(0,0,canvas.width,canvas.height);
      const stride=canvas.width*4, offsets=Array.from({length:item.entry.frames},(_,index)=>
        (Math.floor(index/columns)*cell*canvas.width+index%columns*cell)*4);
      let nonempty=0,changed=0;
      for(const [index,offset] of offsets.entries()){
        const next=offsets[(index+1)%offsets.length];
        let visible=false,different=false;
        for(let y=0;y<cell&&(!visible||!different);y++){
          for(let x=0;x<cell&&(!visible||!different);x++){
            const relative=y*stride+x*4, a=offset+relative, b=next+relative;
            visible ||= data[a+3]!==0;
            different ||= data[a]!==data[b]||data[a+1]!==data[b+1]||data[a+2]!==data[b+2]||data[a+3]!==data[b+3];
          }
        }
        nonempty+=Number(visible);changed+=Number(different);
      }
      results.push({id:item.design.id+'/'+item.activity,frames:offsets.length,nonempty,changed});
    }
    return results;
  })()`);
  for (const reel of raster) {
    assert.equal(reel.nonempty, reel.frames, reel.id + ' decoded raster cells are populated');
    assert.ok(reel.changed / reel.frames >= .8, reel.id + ' adjacent raster change ratio ' + reel.changed / reel.frames);
  }
  const decodedFrames = raster.reduce((sum, reel) => sum + reel.frames, 0);
  const minimumRasterChange = Math.min(...raster.map(reel => reel.changed / reel.frames));
  const sample = await run(`(async()=>{
    const results=[];
    for(let check=0;check<7;check++){
      for(const delta of [-1,1]){
        for(const item of items){
          const {frames,duration}=item.entry;
          const boundary=[0,1,11,12,Math.floor(frames/2),frames-1,frames][check];
          const time=boundary*duration/frames+delta+(boundary===0?duration:0);
          for(const animation of reels(item))animation.currentTime=time;
        }
        await paint();
        for(const item of items){
          const {frames,duration}=item.entry, nodes=[...item.body.querySelectorAll('.cp-frame')];
          const boundary=[0,1,11,12,Math.floor(frames/2),frames-1,frames][check];
          const style=getComputedStyle(nodes[0]), matrix=new DOMMatrixReadOnly(style.transform);
          const reel=reels(item)[0];
          results.push({id:item.design.id+'/'+item.activity,frames,boundary,delta,
            nodes:nodes.length,clocks:reels(item).length,offset:[matrix.m41,matrix.m42],
            cadence:reel.effect.getTiming().duration/frames,opaque:Number(style.opacity),
            vector:item.body.querySelector('.cp-activity').dataset.activity,sampling:style.imageRendering});
        }
      }
    }
    return results;
  })()`);
  for (const row of sample) {
    const expected = (row.boundary + (row.delta < 0 ? row.frames - 1 : 0)) % row.frames;
    const x = expected % Manifest.columns, y = Math.floor(expected / Manifest.columns);
    assert.deepEqual(row.offset, [x ? -x * Manifest.span : 0, y ? -y * Manifest.span : 0], row.id + ' exact held cel at boundary ' + row.boundary);
    assert.ok(Math.abs(row.cadence - 1000 / 30) < .001, row.id + ' 30 Hz interval');
    assert.equal(row.clocks, 1, row.id + ' one native reel');
    assert.equal(row.nodes, 1, row.id + ' one clipped image');
    assert.equal(row.opaque, 1, row.id + ' no crossfade');
    assert.equal(row.vector, '', row.id + ' no duplicate vector prop');
    assert.equal(row.sampling, 'pixelated');
  }
  await run(`items.forEach(item=>item.body.getAnimations({subtree:true}).forEach(a=>a.play()));window.owners=items.flatMap(reels);items.forEach(item=>item.controller.update({...item.session,title:'metadata only'},{now:100}));void 0`);
  assert.equal(await run(`owners.every(a=>items.some(item=>reels(item).includes(a)))`), true, 'metadata retains objects');
  await run(`items.forEach(item=>item.controller.update(item.session,{now:200,hidden:true}));void 0`); await wait(50);
  assert.equal(await run(`owners.every(a=>a.playState==='paused')`), true);
  const times = await run('owners.map(a=>a.currentTime)'); await wait(100);
  assert.deepEqual(await run('owners.map(a=>a.currentTime)'), times);
  await run(`items.forEach(item=>item.controller.update(item.session,{now:300,hidden:false}));void 0`);
  await until(`owners.every(a=>a.playState==='running'&&items.some(item=>reels(item).includes(a)))`, 'Showing resumes the same pixel reels');
  await run(`items.forEach(item=>item.controller.update(item.session,{now:400,reducedMotion:true}));void 0`); await wait(40);
  const quietFirstCel = `items.every(item=>{
    const frame=item.body.querySelector('.cp-frame'), style=getComputedStyle(frame);
    return frame.parentNode.dataset.ready==='true'&&item.body.getAnimations({subtree:true}).length===0&&
      Number(style.opacity)===1&&new DOMMatrixReadOnly(style.transform).isIdentity;
  })`;
  await until(quietFirstCel, 'Reduced motion holds K0 without a native clock');
  await run(`items.forEach(item=>item.controller.update(item.session,{now:500,lowPower:true}));void 0`);
  await until(quietFirstCel, 'Low power also holds the same K0 without a native clock');
  await run(`items.forEach(item=>item.controller.update(item.session,{now:600}));void 0`); await wait(300);
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    await run(`items.forEach(item=>item.actor.hidden=true);const selected=['folio','ink','moss','thread','glow'].map((species,i)=>items.find(item=>item.design.id===species&&item.activity===['reading','coding','waiting-tool','error','waiting-user'][i])||items.find(item=>item.design.id===species)).filter(Boolean);selected.forEach(item=>{item.actor.hidden=false;document.querySelector('.grid').append(item.actor);});void 0`);
    await run('settle()');
    await run(`(async()=>{for(const item of items)for(const a of reels(item))a.currentTime=0;await paint();})()`);
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'pixel-lineup.png'), (await win.webContents.capturePage({ x: 0, y: 0, width: 1100, height: 360 })).toPNG());
    if (process.env.MINI_OFFICE_CAPTURE_MOTION === '1') {
      for (let index = 0; index < 4 * Manifest.fps; index++) {
        await run(`(async()=>{for(const item of items)for(const a of reels(item))a.currentTime=${index}*1000/${Manifest.fps}+1;await paint();})()`);
        fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'pixel-' + String(index).padStart(3, '0') + '.png'), (await win.webContents.capturePage({ x: 0, y: 0, width: 1100, height: 360 })).toPNG());
      }
    }
  }
  await run(`items.forEach(item=>item.controller.destroy());void 0`);
  assert.equal(await run(`document.querySelectorAll('.creature-performance').length`), 0);
  console.log(JSON.stringify({ pixelActivities: raster.length, decodedFrames, minimumRasterChange, nativeSamples: sample.length, cadenceHz: Manifest.fps }));

  const { CLIPS, SPAN, COLUMNS } = require('../renderer/creature-emotes.js');
  await run(`(()=>{
    const grid=document.querySelector('.grid');
    grid.replaceChildren();
    window.expressions=[];
    for(const design of ${JSON.stringify(Appearance.catalog)}){
      const actor=document.createElement('section');actor.className='specimen';
      const label=document.createElement('h2');label.textContent=design.labelZh+' / '+design.labelEn;
      const body=document.createElement('span');body.className='character-body';
      const image=document.createElement('img');image.src='../assets/avatars/'+design.asset;body.append(image);actor.append(label,body);grid.append(actor);
      const session={id:'pixel-idle:'+design.id,provider:'codex',status:'active',activity:'unknown'};
      const controller=OfficeCreaturePerformance.create({actorNode:actor,body,image,session,design});
      controller.update(session,{now:0});
      expressions.push({actor,body,session,controller,cel:body.querySelector('[data-pixel-emote]'),normal:body.querySelector('.cp-gesture')});
    }
    window.expressionClocks=item=>item.body.getAnimations({subtree:true}).filter(a=>a.effect.target===item.cel||a.effect.target===item.normal);
    window.viewExpression=item=>{
      const style=getComputedStyle(item.cel),matrix=new DOMMatrixReadOnly(style.transform);
      return {sprite:Number(style.opacity),normal:Number(getComputedStyle(item.normal).opacity),
        cel:(Math.round(-matrix.m41/${SPAN})+Math.round(-matrix.m42/${SPAN})*${COLUMNS})||0};
    };
  })()`);
  await until(`expressions.every(item=>item.cel.parentNode.dataset.ready==='true'&&expressionClocks(item).length===2)`, 'Five expression sheets decode and run the seeded idle micro loop');
  await run(`window.idleClocks=expressions.map(expressionClocks);for(const item of expressions)item.controller.update(item.session,{now:200,hidden:true});void 0`);
  assert.equal(await run(`idleClocks.every((clocks,index)=>clocks.every(a=>a.playState==='paused'&&expressionClocks(expressions[index]).includes(a)))`), true);
  const heldExpressions = await run(`idleClocks.map(clocks=>clocks.map(a=>a.currentTime))`);
  await wait(60);
  assert.deepEqual(await run(`idleClocks.map(clocks=>clocks.map(a=>a.currentTime))`), heldExpressions);
  assert.equal(await run(`expressions.some(item=>item.controller.cue('rare'))`), false, 'hidden avatars suppress decorative reactions');
  const idleCels = await run(`(async()=>{
    const result=[];
    for(const phase of [.20,.30,.35,.71,.78,.88]){
      for(const clocks of idleClocks)for(const animation of clocks)animation.currentTime=animation.effect.getTiming().duration*phase;
      await paint();result.push(expressions.map(viewExpression));
    }
    return result;
  })()`);
  for (const [index, row] of idleCels.entries()) {
    for (const state of row) {
      const visible = [1, 3, 5].includes(index);
      assert.equal(state.sprite, Number(visible));
      assert.equal(state.normal, Number(!visible));
      if (visible) {
        const clips = index === 3 ? [CLIPS['glance-left'], CLIPS['glance-right']] : [CLIPS.blink];
        assert.ok(clips.some(clip => state.cel > clip.first && state.cel < clip.first + clip.frames), 'idle advances into the authored blink or glance');
      }
    }
  }
  await run(`for(const item of expressions)item.controller.update(item.session,{now:300});void 0`);
  await until(`idleClocks.flat().every(a=>a.playState==='running')`, 'Showing resumes the same idle expression clocks');
  const crop = { x: 0, y: 0, width: 1100, height: 360 };
  const bodyBounds = await run(`expressions.map(item=>item.body.getBoundingClientRect().toJSON())`);
  await run('paint()');
  const beforeRare = await win.webContents.capturePage(crop);
  const cues = [
    {kind:'glance',direction:-1,clip:'glance-left'}, {kind:'glance',direction:1,clip:'glance-right'},
    {kind:'wave',clip:'greet'}, {kind:'startle',clip:'startle'},
    {kind:'tool-success',clip:'success'}, {kind:'rare',clip:'rare'}
  ].flatMap(cue => [.16, .34, .50, .67].map(phase => ({...cue,phase})));
  for (const cue of cues) {
    const states = await run(`(async()=>{
      for(const item of expressions){
        for(const a of expressionClocks(item))if(a.effect.getTiming().iterations===1)a.finish();
        await Promise.resolve();
        if(!item.controller.cue(${JSON.stringify(cue.kind)}, { direction: ${cue.direction || 0} }))throw Error('Cue failed '+${JSON.stringify(cue.kind)});
        for(const a of expressionClocks(item)){a.pause();a.currentTime=a.effect.getTiming().duration*${cue.phase};}
      }
      await paint();return expressions.map(viewExpression);
    })()`);
    const clip = CLIPS[cue.clip], expected = clip.first + Math.floor(clip.frames * cue.phase + 1e-7);
    for (const state of states) assert.deepEqual(state, { sprite:1, normal:0, cel:expected }, cue.kind+' '+cue.phase);
  }
  const afterRare = await win.webContents.capturePage(crop);
  const { width } = afterRare.getSize(), density = width / crop.width;
  const normalBytes = beforeRare.toBitmap(), rareBytes = afterRare.toBitmap();
  for (const { left, right, top } of bodyBounds) {
    let visibleChanges = 0;
    for (let y = Math.ceil((top - 35) * density); y < Math.floor(top * density); y++) {
      for (let x = Math.ceil(left * density); x < Math.floor(right * density); x++) {
        const pixel = (y * width + x) * 4;
        if (rareBytes[pixel] !== normalBytes[pixel] || rareBytes[pixel + 1] !== normalBytes[pixel + 1] || rareBytes[pixel + 2] !== normalBytes[pixel + 2]) visibleChanges++;
      }
    }
    assert.ok(visibleChanges >= 4, 'The rare decoration paints above the original body crop');
  }
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    await run(`document.querySelector('h1').textContent='访客彩蛋 / Rare visitor expressions';paint()`);
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'pixel-expressions.png'),
      (await win.webContents.capturePage(crop)).toPNG());
  }
  const walk = await run(`(async()=>{
    const route={};
    for(const item of expressions)item.controller.update(item.session,{now:400,walking:true});
    await paint();
    for(const item of expressions)item.controller.locomotion({owner:route,distanceWorld:0,speedWorld:320});
    const frames=[];
    for(let frame=0;frame<${CLIPS.walk.frames};frame++){
      const distanceWorld=(frame+.5)/${CLIPS.walk.frames}*192;
      for(const item of expressions)item.controller.locomotion({owner:route,distanceWorld,speedWorld:320});
      await paint();
      frames.push(expressions.map(item=>({ ...viewExpression(item), hiddenFallback:getComputedStyle(item.normal).visibility==='hidden',
        gaitPaused:expressionClocks(item).some(clock=>clock.animationName==='cp-walk-cels'&&clock.playState==='paused') })));
    }
    for(const item of expressions){
      item.controller.locomotion(null,route);
      item.controller.update(item.session,{now:500});
    }
    return frames;
  })()`);
  for (const [index, row] of walk.entries()) {
    for (const state of row) {
      assert.equal(state.cel,index,'192 world units advance one complete authored stride');
      assert.equal(state.sprite,1);
      assert.equal(state.hiddenFallback,true,'the atlas gait does not double the stationary toes');
      assert.equal(state.gaitPaused,true,'route distance, not wall time, advances the gait');
    }
  }
  for (const preference of ['reducedMotion','lowPower']) {
    await run(`for(const item of expressions)item.controller.update(item.session,{now:400,[${JSON.stringify(preference)}]:true});void 0`);
    assert.equal(await run(`expressions.every(item=>expressionClocks(item).length===0&&viewExpression(item).normal===1&&!item.controller.cue('rare'))`), true);
  }
  await run(`for(const item of expressions)item.controller.destroy();void 0`);
  assert.equal(await run(`document.querySelectorAll('.cp-emotes').length`), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, strips: specimens.length, nativeSamples: sample.length, expressionSpecies: Appearance.catalog.length, expressionChecks: cues.length * Appearance.catalog.length, distanceStrideCels: walk.length, checks: ['decode before display', 'one opaque cel per cut', 'nearest-neighbor sampling', 'loop seams', 'no vector props', 'metadata retention', 'hidden object/time retention', 'quiet K0', 'cleanup'] }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
