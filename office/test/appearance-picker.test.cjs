'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../lib/agent-appearance.js');
const source = fs.readFileSync(path.join(__dirname, '../renderer/appearance-picker.js'), 'utf8');

function fixture({ sizeSetting = false, model = Model } = {}) {
  const document = { createElement: tag => node(tag) };
  function matches(element, selector) { return selector.startsWith('.') && element.className.split(/\s+/).includes(selector.slice(1)); }
  function node(tag = 'div') {
    const attributes = new Map(), events = new Map();
    return {
      tagName: tag.toUpperCase(), ownerDocument: document, dataset: {}, children: [], style: {}, className: '', textContent: '', parentNode: null,
      setAttribute(key, value) { attributes.set(key, String(value)); },
      getAttribute(key) { return attributes.get(key); },
      append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } },
      querySelector(selector) { for (const child of this.children) { if (matches(child, selector)) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; },
      after(child) { child.parentNode = this.parentNode; const index = this.parentNode.children.indexOf(this); this.parentNode.children.splice(index + 1, 0, child); },
      addEventListener(event, callback) { events.set(event, callback); },
      click() { events.get('click')?.(); },
      remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    };
  }
  const container = node();
  if (sizeSetting) { const size = node(); size.className = 'agent-size-setting'; container.append(size); }
  const changes = [], context = vm.createContext({ OfficeAgentAppearance: model });
  vm.runInContext(source, context);
  const picker = context.OfficeAppearancePicker.create({ container, onChange: value => changes.push(value) });
  function all(element = container) { return [element, ...element.children.flatMap(child => all(child))]; }
  const nodes = () => all();
  const buttons = () => nodes().filter(element => element.tagName === 'BUTTON');
  const button = id => buttons().find(element => element.dataset.appearance === id);
  return { container, picker, changes, nodes, buttons, button };
}

test('the picker is a read-only gallery of five companions with automatic family policy', () => {
  const { container, nodes, buttons, changes } = fixture({ sizeSetting: true });
  const section = container.children[1], cards = nodes().filter(node => node.className === 'appearance-card');
  assert.equal(section.className, 'appearance-setting');
  assert.equal(section.dataset.appearancePolicy, 'family-unique');
  assert.deepEqual(cards.map(node => node.dataset.appearancePreview), Model.IDS);
  assert.equal(buttons().length, 0, 'no global click-all assignment can create duplicate mains');
  assert.equal(nodes().find(node => node.id === 'appearance-note').textContent, '主 Agent 随机分配不同角色；分身继承主身外观，体型更小。超过五位主 Agent 时，以不同配色区分。');
  for (const [index,card] of cards.entries()) {
    const design = Model.catalog[index];
    assert.equal(card.getAttribute('role'), 'listitem');
    assert.ok(card.getAttribute('aria-label').includes(design.labelZh));
    assert.ok(card.getAttribute('aria-label').includes(design.roleZh));
    assert.ok(card.getAttribute('aria-label').includes(design.descriptionZh));
    card.click();
  }
  assert.deepEqual(changes, []);
  assert.equal(nodes().filter(node => node.tagName === 'IMG').length, 5);
  assert.ok(nodes().every(node => node.getAttribute('aria-pressed') === undefined));
});

test('each read-only preview crops the single idle cell of its six-pose sheet', () => {
  const { nodes } = fixture();
  const previews = nodes().filter(node => node.className.includes('appearance-pose-preview'));
  assert.equal(previews.length, Model.catalog.length);
  for (let index = 0; index < previews.length; index += 1) {
    const preview = previews[index], image = preview.children[0];
    assert.equal(preview.dataset.pose, 'idle'); assert.equal(preview.getAttribute('aria-hidden'), 'true');
    assert.equal(image.src, '../assets/avatars/' + Model.catalog[index].asset);
    assert.equal(image.style.width, '300%'); assert.equal(image.style.height, '200%');
    assert.equal(image.alt, ''); assert.equal(image.draggable, false);
  }
  const css = fs.readFileSync(path.join(__dirname, '../renderer/appearance-picker.css'), 'utf8');
  assert.match(css, /\.appearance-preview\{[^}]*overflow:hidden/);
  assert.match(css, /\.appearance-pose-preview img\{[^}]*left:0;top:0;max-width:none/);
  assert.match(css, /\.appearance-pose-preview\{[^}]*aspect-ratio:1/);
  assert.doesNotMatch(css, /:hover|cursor:pointer|:active/);
});

test('language changes retain accessible character descriptions without reviving retired controls', () => {
  const { picker, nodes, buttons, changes } = fixture();
  picker.update({ value: 'thread', language: 'en' });
  assert.equal(nodes().find(node => node.id === 'appearance-title').textContent, 'Workshop companions');
  const note = nodes().find(node => node.id === 'appearance-note').textContent;
  assert.ok(note.includes('Helpers inherit their main agent'));
  assert.ok(note.includes('smaller size')); assert.ok(note.includes('colour variations'));
  for (const card of nodes().filter(node => node.className === 'appearance-card')) {
    const design = Model.catalog.find(item => item.id === card.dataset.appearancePreview);
    assert.ok(card.getAttribute('aria-label').includes(design.descriptionEn));
  }
  picker.update({ value: 'original', language: 'zh' });
  assert.equal(buttons().length, 0); assert.deepEqual(changes, []);
});

test('destroy removes only the gallery and a missing catalog does not create an empty control', () => {
  const { picker, container } = fixture({ sizeSetting: true });
  picker.destroy(); picker.destroy(); assert.equal(container.children.length, 1);
  assert.equal(container.children[0].className, 'agent-size-setting');
  const missing = fixture({ model: null }); assert.equal(missing.picker, null); assert.equal(missing.container.children.length, 0);
});
