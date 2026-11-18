/* Family badge shared by both avatar styles. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OfficeFamilyAppearance=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const validColor = value => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value);
  function create({actorNode} = {}) {
    if (!actorNode?.ownerDocument) throw new TypeError('A family badge needs its real actor node.');
    const badge = actorNode.ownerDocument.createElement('span');
    badge.className = 'family-badge';
    badge.setAttribute('aria-hidden', 'true');
    (actorNode.querySelector('.nameplate') || actorNode).append(badge);
    let key = '', destroyed = false;

    function update({rootId = '', appearance, helper = false, depth = 0, language = 'zh'} = {}) {
      if (destroyed || !validColor(appearance?.color)) return;
      const code = String(appearance.badge || '').replace(/[^0-9]/g, '').slice(0, 8);
      const next = JSON.stringify([rootId, appearance.color, code, helper, depth, language]);
      if (next === key) return;
      key = next;
      actorNode.dataset.appearanceFamily = String(rootId);
      actorNode.dataset.familyHelper = String(Boolean(helper));
      actorNode.style.setProperty('--family-color', appearance.color);
      badge.textContent = (helper ? '↳' : '') + code;
      badge.dataset.helper = String(Boolean(helper));
      const level = Math.max(1, Number(depth) || 1);
      badge.title = language === 'en'
        ? 'Group ' + code + (helper ? ' · helper level ' + level : '')
        : '同组 ' + code + (helper ? ' · 第 ' + level + ' 层分身' : '');
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      badge.remove();
      delete actorNode.dataset.appearanceFamily;
      delete actorNode.dataset.familyHelper;
    }
    return Object.freeze({update, destroy});
  }
  return Object.freeze({create});
});
