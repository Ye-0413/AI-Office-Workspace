'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const caption=source.slice(source.indexOf('  function transitCaption('),source.indexOf('  function clearTrafficBlock('));
function fixture(extra={}){
  let settled=0;const actor={id:'real-walker',node:{dataset:{walking:'true'}},session:{activity:'coding'},state:{},spec:{label:'coding'},motion:null,...extra};
  const context={Director:{plan:()=>({label:'writing code'})},language:'en',cloneBusy:a=>a.cloneBusy,finishAtStation:a=>{settled++;a.node.dataset.walking='false';},text:(node,value)=>node.textContent=value};
  vm.createContext(context);vm.runInContext(caption,context);return{actor,context,settled:()=>settled};
}
test('a yielding walker keeps its just-started walking/gait owner before the route Animation is assigned',()=>{
  const h=fixture();h.context.transitCaption(h.actor,true);
  assert.equal(h.actor.node.dataset.trafficHint,'yielding');assert.equal(h.actor.node.dataset.walking,'true');
  assert.equal(h.settled(),0,'an empty motion slot during synchronous startup is not an actual station arrival');assert.equal(h.actor.state.textContent,'writing code');
});
test('real queued stationary work can settle its current pose; an actual motion or clone owner cannot',()=>{
  const h=fixture({node:{dataset:{walking:'false'}}});h.context.transitCaption(h.actor);assert.equal(h.settled(),1);
  for(const change of [{motion:{}},{cloneBusy:true},{holdingFamily:true},{departing:true}]){
    const h=fixture({node:{dataset:{walking:'false'}},...change});h.context.transitCaption(h.actor,true);assert.equal(h.settled(),0,JSON.stringify(change));
  }
});
