'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Appearance=require('../renderer/family-appearance.js');
const Family=require('../lib/family-model.js');
function fixture(){let writes=0;const document={createElement:()=>node(),createElementNS:()=>node()};function node(){const attrs={},styles={},classes=new Set(),queries=new Map();return{ownerDocument:document,dataset:{},children:[],classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},contains:name=>classes.has(name)},style:{setProperty(name,value){writes++;styles[name]=value;},removeProperty(name){delete styles[name];},getPropertyValue:name=>styles[name]},setAttribute(name,value){writes++;attrs[name]=value;},getAttribute:name=>attrs[name],append(child){this.children.push(child);},remove(){this.removed=true;},querySelector(selector){if(!queries.has(selector))queries.set(selector,node());return queries.get(selector);},set innerHTML(value){this.markup=value;},get innerHTML(){return this.markup;}};}const actor=node(),image=node(),controller=Appearance.create({actorNode:actor,image});return{actor,image,controller,writes:()=>writes};}
test('body colour is a local keyed filter without copying source artwork or filtering articulated props',()=>{
  const {actor,image,controller,writes}=fixture(),registry=Family.createPaletteRegistry();registry.update(['real:id']);
  const value={rootId:'real:id',appearance:registry.forRoot('real:id'),language:'zh'};controller.update(value);
  const count=writes();controller.update({...value});assert.equal(writes(),count,'ordinary metadata refreshes do not rewrite the filter');
  assert.equal(image.classList.contains('family-tint-source'),true);
  const defs=actor.children[0];assert.match(defs.markup,/mode="difference"/);assert.match(defs.markup,/color-interpolation-filters="sRGB"/);assert.match(defs.markup,/in="SourceGraphic" in2="skinMask" operator="out"/);assert.doesNotMatch(defs.markup,/<image|<script|body-color-group|master-group/);
  const css=fs.readFileSync(path.join(__dirname,'../renderer/family-appearance.css'),'utf8');assert.match(css,/\.ap-torso/);assert.match(css,/\.ap-arm/);assert.match(css,/\.ap-foot/);assert.doesNotMatch(css,/\.ap-props[^\n]*filter:|\.ap-eyes[^\n]*filter:/);
  controller.destroy();controller.destroy();assert.equal(actor.children[0].removed,true);assert.equal(image.classList.contains('family-tint-source'),false);assert.equal(actor.classList.contains('family-appearance'),false);assert.equal(actor.style.getPropertyValue('--family-body-filter'),undefined);assert.equal(actor.style.getPropertyValue('--family-hand-filter'),undefined);
});
test('helper badge and body tint keep the same group, with bilingual local presentation labels',()=>{
  const {actor,controller}=fixture(),registry=Family.createPaletteRegistry();registry.update(['root']);const appearance=registry.forRoot('root');
  controller.update({rootId:'root',appearance,helper:true,depth:2,language:'en'});
  const flood=actor.children[0].querySelector('.family-tint-flood');assert.equal(flood.getAttribute('flood-color'),appearance.helperColor);
  const badge=actor.querySelector('.nameplate').children[0];assert.equal(badge.textContent,'↳'+appearance.badge);assert.match(badge.title,/Group .*helper level 2/);
  controller.update({rootId:'root',appearance,helper:true,depth:2,language:'zh'});assert.match(badge.title,/同组 .*第 2 层分身/);
  controller.update({rootId:'root',appearance:{color:'url(javascript:bad)'},helper:true});assert.equal(flood.getAttribute('flood-color'),appearance.helperColor,'untrusted colour strings never reach CSS or SVG');
});
test('all eight families keep a darker hand shade and a crisp edge, for main agents and helpers',()=>{
  const luminance=hex=>{const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];};
  for(const color of Family.COLORS.flatMap(value=>[value,Family.lighten(value)])){
    const hands=Appearance.handColors(color);assert.ok((luminance(color)+.05)/(luminance(hands.fill)+.05)>=1.5,'hand fill differs from torso '+color);assert.ok((luminance(color)+.05)/(luminance(hands.edge)+.05)>=4,'edge separates hand from torso '+color);
    const {actor,controller}=fixture();controller.update({appearance:{color,bodyColor:color}});const defs=actor.children[0];assert.equal(defs.querySelector('.family-hand-flood').getAttribute('flood-color'),hands.fill);assert.equal(actor.style.getPropertyValue('--family-hand-edge'),hands.edge);assert.doesNotMatch(defs.markup,/feGaussianBlur|feDropShadow/);assert.notEqual(actor.style.getPropertyValue('--family-hand-filter'),actor.style.getPropertyValue('--family-body-filter'));controller.destroy();
  }
  assert.equal(Appearance.handColors('url(javascript:bad)'),null);const css=fs.readFileSync(path.join(__dirname,'../renderer/family-appearance.css'),'utf8');assert.match(css,/\.ap-arm>use\{filter:var\(--family-hand-filter\)\}/);assert.match(css,/stroke-width:1\.5/);assert.match(fs.readFileSync(path.join(__dirname,'../renderer/family-appearance.js'),'utf8'),/vector-effect','non-scaling-stroke/);
});
