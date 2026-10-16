/* Original capsule robot for public documentation previews (AGPL-3.0-only).
 * The app's restricted sprite is never used in exported frames. Joint groups,
 * choreography, work props and their grip transforms remain the production ones.
 */
(function(root){
  'use strict';
  function install(svg){
    if(!svg)throw new TypeError('A production performance rig is required');
    svg.querySelector('defs')?.remove();
    svg.querySelectorAll('image,use').forEach(node=>node.remove());
    const set=(selector,markup)=>{const node=svg.querySelector(selector);if(!node)throw new Error('Missing preview joint '+selector);node.innerHTML=markup;};
    set('.ap-torso','<path fill="#81a6b0" stroke="#375560" stroke-width="1.5" d="M54 79c0-10 8-18 24-18s24 8 24 18v20c0 5-6 8-24 8s-24-3-24-8Z"/><path fill="#d7e4df" d="M58 80c0-4 3-7 7-7h26c4 0 7 3 7 7v12c0 4-3 7-7 7H65c-4 0-7-3-7-7Z"/><path stroke="#375560" stroke-width="2" d="M78 61v-8"/><circle fill="#e9bf74" stroke="#375560" stroke-width="1.5" cx="78" cy="50" r="3.5"/><path fill="#557a88" d="M70 102h16v3H70Z"/>');
    set('.ap-blink','<rect fill="#294751" x="60.5" y="81" width="4" height="8" rx="2"/><rect fill="#294751" x="90.5" y="81" width="4" height="8" rx="2"/>');
    set('.ap-arm-left','<circle fill="#e5ece1" stroke="#557a88" stroke-width="1.5" cx="45" cy="90" r="5"/><circle fill="#9bb8b9" cx="45" cy="90" r="2"/>');
    set('.ap-arm-right','<circle fill="#e5ece1" stroke="#557a88" stroke-width="1.5" cx="110" cy="90" r="5"/><circle fill="#9bb8b9" cx="110" cy="90" r="2"/>');
    set('.ap-foot-1','<rect fill="#557a88" x="55" y="105" width="10" height="11" rx="4"/>');
    set('.ap-foot-2','<rect fill="#c7d5cc" x="60" y="112" width="9" height="4" rx="2"/>');
    set('.ap-foot-3','<rect fill="#557a88" x="86" y="105" width="10" height="11" rx="4"/>');
    set('.ap-foot-4','<rect fill="#c7d5cc" x="92" y="112" width="9" height="4" rx="2"/>');
    if(svg.querySelector('image,use'))throw new Error('A public preview cannot contain a sprite reference');
  }
  root.OfficeAnimationPreviewBody=Object.freeze({install});
})(globalThis);
