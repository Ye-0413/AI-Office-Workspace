'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DayCycle = require('../lib/day-cycle.js');

function fixture() {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.nodes = new Map(); this.attributes = {}; this.style = { setProperty(key, value) { this[key] = value; } }; }
    append(node) { this.children.push(node); node.parent = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
    replaceChildren() { this.children = []; }
    querySelector(key) { if (!this.nodes.has(key)) this.nodes.set(key, new Element()); return this.nodes.get(key); }
    setAttribute(key, value) { this.attributes[key] = value; }
  }
  const world = new Element(), office = new Element(), layer = new Element(), document = new Element();
  document.createElement = () => new Element();
  document.getElementById = key => document.querySelector(key);
  const context = vm.createContext({window:{OfficeDayCycle:DayCycle}, document, setTimeout(){throw Error('scenery must not start timers');}, setInterval(){throw Error('scenery must not start timers');}, requestAnimationFrame(){throw Error('scenery must not start a frame loop');}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/day-scenery.js'),'utf8'), context);
  const api = context.window.OfficeDayScenery.create({office,world,layer});
  return {api,office,world,layer,door:world.querySelector('.door-window')};
}

test('five previews reuse bounded window and door surfaces with transparent Hong Kong colours', () => {
  const f = fixture(), glass = [...f.layer.children], door = [...f.door.children];
  assert.equal(glass.length,6); assert.equal(door.length,6);
  const palettes = new Set(), now = Date.parse('2026-10-16T04:00:00Z');
  for (const phase of DayCycle.MODES.slice(1)) {
    const state = f.api.update({sceneTime:phase},'zh',now);
    for (const surfaces of [glass,door]) {
      assert.equal(surfaces.filter(n=>n.dataset.visible==='true').length,1);
      const active = surfaces.find(n=>n.dataset.visible==='true');
      assert.equal(active.dataset.time,phase);
      assert.equal(active.style['--skyTop'],state.skyTop);
      assert.equal(active.style['--skyBottom'],state.skyBottom);
      assert.ok(Number(active.style['--theme-wash-alpha'])>=.045&&Number(active.style['--theme-wash-alpha'])<=.2);
    }
    palettes.add(glass.find(n=>n.dataset.visible==='true').style['--skyTop']);
  }
  assert.equal(palettes.size,5);
  assert.deepEqual(f.layer.children,glass); assert.deepEqual(f.door.children,door);
});

test('live Hong Kong daylight changes without repainting outgoing preview surfaces or spawning work', () => {
  const f=fixture(), preview=f.layer.children.find(n=>n.dataset.time==='sunset');
  f.api.update({sceneTime:'sunset'},'en',Date.parse('2026-10-16T04:00:00Z'));
  const previous=JSON.stringify(preview.style);
  const day=f.api.update({sceneTime:'auto'},'en',Date.parse('2026-10-16T04:00:00Z'));
  const night=f.api.update({sceneTime:'auto'},'en',Date.parse('2026-10-16T16:00:00Z'));
  assert.notEqual(day.skyTop,night.skyTop);
  assert.equal(f.layer.children[0].style['--skyTop'],night.skyTop);
  assert.equal(f.door.children[0].style['--skyTop'],night.skyTop);
  assert.equal(JSON.stringify(preview.style),previous);
  assert.equal(f.layer.children.length,6); assert.equal(f.door.children.length,6);
});

test('destroy removes owned door overlays and leaves original door artwork elements intact', () => {
  const f=fixture(), original={id:'original-city'};
  f.door.append(original);
  f.api.destroy();
  assert.equal(f.layer.children.length,0);
  assert.deepEqual(f.door.children,[original]);
});
