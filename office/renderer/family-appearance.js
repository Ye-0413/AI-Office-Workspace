/* Local presentation colour key. The source SVG remains external and intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeFamilyAppearance=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg';let serial=0;
  const validColor=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value);
  function handColors(color){
    if(!validColor(color))return null;
    const shade=factor=>'#'+color.slice(1).match(/../g).map(channel=>Math.round(parseInt(channel,16)*factor).toString(16).padStart(2,'0')).join('');
    return Object.freeze({fill:shade(.78),edge:shade(.32)});
  }
  function create({actorNode,body,image}={}){
    if(!actorNode||!actorNode.ownerDocument)throw new TypeError('A family appearance needs its real actor node.');
    const document=actorNode.ownerDocument,id='office-family-tint-'+(++serial),handId=id+'-hands';
    const defs=document.createElementNS(NS,'svg');defs.setAttribute('class','family-filter-defs');defs.setAttribute('aria-hidden','true');
    // Difference is zero only for the source's flat skin colour. A tiny RGB
    // neighbourhood becomes an alpha mask; eyes and props remain unchanged.
    const keyed=`<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feFlood flood-color="#de886d" result="skinKey"/><feBlend in="SourceGraphic" in2="skinKey" mode="difference" result="skinDifference"/><feColorMatrix in="skinDifference" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -80 -80 -80 0 1" result="skinCandidate"/><feComposite in="skinCandidate" in2="SourceAlpha" operator="in" result="skinMask"/><feFlood class="family-tint-flood" flood-color="#6d9bdd" result="familyInk"/><feComposite in="familyInk" in2="skinMask" operator="in" result="tintedSkin"/><feComposite in="SourceGraphic" in2="skinMask" operator="out" result="originalDetails"/><feMerge><feMergeNode in="originalDetails"/><feMergeNode in="tintedSkin"/></feMerge></filter>`;
    // The two articulated arm crops contain flat skin only. Using their alpha
    // also recolours antialiased pixels, avoiding the original red fringe.
    const hands=`<filter id="${handId}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feFlood class="family-hand-flood" flood-color="#5579ac" result="handInk"/><feComposite in="handInk" in2="SourceAlpha" operator="in"/></filter>`;
    defs.innerHTML='<defs>'+keyed+hands+'</defs>';
    actorNode.append(defs);
    const flood=defs.querySelector('.family-tint-flood');
    const handFlood=defs.querySelector('.family-hand-flood');
    const badge=document.createElement('span');badge.className='family-badge';badge.setAttribute('aria-hidden','true');
    const plate=actorNode.querySelector('.nameplate');(plate||actorNode).append(badge);
    const outlines=[];
    // A constant screen-width SVG stroke stays legible at 65% and sharp at
    // 135%. It follows the existing wrist joint, without adding any animation.
    if(body&&typeof body.querySelector==='function')for(const [side,x]of[['left',40],['right',105]]){
      const arm=body.querySelector('.ap-arm-'+side);if(!arm)continue;
      const outline=document.createElementNS(NS,'rect');outline.setAttribute('class','family-hand-outline');outline.setAttribute('x',String(x));outline.setAttribute('y','85');outline.setAttribute('width','10');outline.setAttribute('height','10');outline.setAttribute('vector-effect','non-scaling-stroke');arm.append(outline);outlines.push(outline);
    }
    const eyes=body&&typeof body.querySelector==='function'?body.querySelector('.ap-eyes'):null;
    const eyeParent=eyes&&eyes.parentNode,eyeNext=eyes&&eyes.nextSibling;
    // Chest/temple poses can bring a hand to the edge of an eye. Expression is
    // painted last without changing either joint's transforms or choreography.
    if(eyeParent)eyeParent.append(eyes);
    if(image)image.classList.add('family-tint-source');
    actorNode.classList.add('family-appearance');
    // Absolute same-document URL also works in standalone QA documents that
    // use a <base> for loading the app's external images and stylesheets.
    actorNode.style.setProperty('--family-body-filter',`url("${String(document.URL||'').split('#')[0]}#${id}")`);
    actorNode.style.setProperty('--family-hand-filter',`url("${String(document.URL||'').split('#')[0]}#${handId}")`);
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
      const hands=handColors(tint);handFlood.setAttribute('flood-color',hands.fill);actorNode.style.setProperty('--family-hand-edge',hands.edge);
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
      actorNode.style.removeProperty('--family-hand-filter');actorNode.style.removeProperty('--family-hand-edge');for(const outline of outlines)outline.remove();
      delete actorNode.dataset.appearanceFamily;delete actorNode.dataset.familyHelper;
      if(image)image.classList.remove('family-tint-source');
      if(eyeParent&&eyes.parentNode===eyeParent){if(eyeNext&&eyeNext.parentNode===eyeParent)eyeParent.insertBefore(eyes,eyeNext);else eyeParent.append(eyes);}
    }
    return Object.freeze({update,destroy});
  }
  return Object.freeze({create,handColors});
});
