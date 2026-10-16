/* Local presentation colour key. The source SVG remains external and intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeFamilyAppearance=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg';let serial=0;
  const validColor=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value);
  function create({actorNode,body,image}={}){
    if(!actorNode||!actorNode.ownerDocument)throw new TypeError('A family appearance needs its real actor node.');
    const document=actorNode.ownerDocument,id='office-family-tint-'+(++serial);
    const defs=document.createElementNS(NS,'svg');defs.setAttribute('class','family-filter-defs');defs.setAttribute('aria-hidden','true');
    // Difference is zero only for the source's flat skin colour. A tiny RGB
    // neighbourhood becomes an alpha mask; eyes and props remain unchanged.
    defs.innerHTML=`<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feFlood flood-color="#de886d" result="skinKey"/><feBlend in="SourceGraphic" in2="skinKey" mode="difference" result="skinDifference"/><feColorMatrix in="skinDifference" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -80 -80 -80 0 1" result="skinCandidate"/><feComposite in="skinCandidate" in2="SourceAlpha" operator="in" result="skinMask"/><feFlood class="family-tint-flood" flood-color="#6d9bdd" result="familyInk"/><feComposite in="familyInk" in2="skinMask" operator="in" result="tintedSkin"/><feComposite in="SourceGraphic" in2="skinMask" operator="out" result="originalDetails"/><feMerge><feMergeNode in="originalDetails"/><feMergeNode in="tintedSkin"/></feMerge></filter></defs>`;
    actorNode.append(defs);
    const flood=defs.querySelector('.family-tint-flood');
    const badge=document.createElement('span');badge.className='family-badge';badge.setAttribute('aria-hidden','true');
    const plate=actorNode.querySelector('.nameplate');(plate||actorNode).append(badge);
    if(image)image.classList.add('family-tint-source');
    actorNode.classList.add('family-appearance');
    // Absolute same-document URL also works in standalone QA documents that
    // use a <base> for loading the app's external images and stylesheets.
    actorNode.style.setProperty('--family-body-filter',`url("${String(document.URL||'').split('#')[0]}#${id}")`);
    let key='',destroyed=false;
    function update({rootId='',appearance,helper=false,depth=0,language='zh'}={}){
      if(destroyed)return;
      const value=appearance&&validColor(appearance.color)?appearance:null;
      if(!value)return;
      const tint=helper&&validColor(value.helperColor)?value.helperColor:validColor(value.bodyColor)?value.bodyColor:value.color;
      const code=String(value.badge||'').replace(/[^0-9]/g,'').slice(0,8);
      const next=JSON.stringify([rootId,tint,value.color,code,Boolean(helper),depth,language]);
      if(next===key)return;
      key=next;
      flood.setAttribute('flood-color',tint);
      actorNode.dataset.appearanceFamily=String(rootId);
      actorNode.dataset.familyHelper=String(Boolean(helper));
      actorNode.style.setProperty('--family-color',value.color);
      badge.textContent=(helper?'↳':'')+code;
      badge.dataset.helper=String(Boolean(helper));
      badge.title=language==='en'?'Group '+code+(helper?' · helper level '+Math.max(1,Number(depth)||1):''):'同组 '+code+(helper?' · 第 '+Math.max(1,Number(depth)||1)+' 层分身':'');
    }
    function destroy(){
      if(destroyed)return;destroyed=true;
      defs.remove();badge.remove();
      actorNode.classList.remove('family-appearance');
      actorNode.style.removeProperty('--family-body-filter');
      delete actorNode.dataset.appearanceFamily;delete actorNode.dataset.familyHelper;
      if(image)image.classList.remove('family-tint-source');
    }
    return Object.freeze({update,destroy});
  }
  return Object.freeze({create});
});
