/* Authored joint choreography over the original, externally referenced static
 * avatar. Restricted artwork stays in its isolated SVG file; it is not copied
 * into this source, mutated, fetched, or exported. Props below are original. */
(function (root, factory) {
  'use strict';
  const api = factory(root.OfficeAvatarPerformanceModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAvatarPerformance = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Model) {
  'use strict';
  let serial = 0;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reducedOwners = new WeakMap();
  function watchReduced(view, callback) {
    if (!view?.matchMedia) return { matches: () => false, destroy() {} };
    let owner = reducedOwners.get(view);
    if (!owner) {
      const query = view.matchMedia('(prefers-reduced-motion: reduce)'), callbacks = new Set();
      const listener = () => { for (const notify of [...callbacks]) notify(); };
      query.addEventListener('change', listener);
      owner = { query, callbacks, listener }; reducedOwners.set(view, owner);
    }
    owner.callbacks.add(callback);
    return { matches: () => owner.query.matches, destroy() {
      owner.callbacks.delete(callback);
      if (!owner.callbacks.size) { owner.query.removeEventListener('change', owner.listener); reducedOwners.delete(view); }
    } };
  }
  const PROPS = Object.freeze({
    folio: `<g class="ap-folio"><path fill="#8d6948" d="M47 95 76 99 106 95 106 117 77 122 47 117Z"/><path fill="#f5e5bf" d="M49 94 76 98 104 94 104 114 77 119 49 114Z"/><path fill="#c9aa79" d="M76 98h2v21h-2Z"/><path stroke="#bc9b70" fill="none" d="m53 100 18 3m-18 2 18 3m-18 2 13 2m17-9 16-3m-16 8 16-3m-16 8 12-2"/><g class="ap-page"><path fill="#fff0d2" d="m78 98 25-5v20l-25 6Z"/><path stroke="#c3a37c" d="m82 102 15-3m-15 7 15-3m-15 7 10-2"/></g><path fill="#b7795f" d="m66 117 3 1v9l-2-2-1 1Z"/></g>`,
    lens: `<g class="ap-reference"><path fill="#a2b7a4" d="M43 77h31v41H43Z"/><path fill="#f3e7c6" d="M46 79h25v36H46Z"/><path fill="#9ca48a" d="M50 84h17v2H50Zm0 5h13v2H50Zm0 5h17v2H50Zm0 10h13v2H50Z"/><path fill="#d5ba86" d="M49 98h18v3H49Z"/></g><g class="ap-lens"><path fill="#604d39" d="m84 82 5-3 13 18-5 3Z"/><path fill="#ddc188" d="M70 62h15v4h4v15h-4v4H70v-4h-4V66h4Z"/><path fill="#526b65" d="M71 66h13v14H71Z"/><path fill="#bad8ce" opacity=".72" d="M73 68h9v10h-9Z"/><path fill="#f4efcf" d="M73 68h3v3h-3Z"/></g>`,
    notebook: `<g class="ap-notebook"><path fill="#786345" d="M92 43h42v39H92Z"/><path fill="#efe1b8" d="M94 45h38v35H94Z"/><path stroke="#b99b6b" fill="none" d="M99 49v26m0-22h10v9h10v10m-10-15h17"/><path fill="#b9c7a0" d="M104 49h10v8h-10Z"/><path fill="#c79473" d="M119 56h9v8h-9Z"/><path fill="#c7b077" d="M113 69h11v7h-11Z"/><path fill="#453c32" d="M96 44h2v3h-2Zm10 0h2v3h-2Zm10 0h2v3h-2Zm10 0h2v3h-2Z"/></g><g class="ap-pencil"><path fill="#c89e58" d="m103 81 3-1 10 24-3 1Z"/><path fill="#453c32" d="m113 105 3-1v5Z"/><path fill="#e9b1a2" d="m102 78 3-1 1 3-3 1Z"/></g>`,
    keyboard: `<g class="ap-laptop"><path fill="#765d43" d="M43 87h65v30H43Z"/><path fill="#9b9e80" d="M45 89h61v26H45Z"/><path fill="#344d4b" d="M48 92h55v20H48Z"/><path fill="#95bca0" d="M52 97h6v2h-6Zm10 0h16v2H62Zm-10 5h10v2H52Zm14 0h23v2H66Z"/><g class="ap-cursor"><path fill="#d9ce9c" d="M92 103h3v5h-3Z"/></g><path fill="#c1b68e" d="m43 116 65 0 6 8H37Z"/><path fill="#887f62" d="M47 118h58v2H47Z"/><g class="ap-key-left"><path fill="#e1d4ab" d="M52 118h8v2h-8Z"/></g><g class="ap-key-right"><path fill="#e1d4ab" d="M86 118h8v2h-8Z"/></g><path fill="#8f886c" d="M68 121h15v2H68Z"/></g>`,
    drafting: `<g class="ap-draft"><path fill="#b39669" d="m37 105 52-10 19 20-53 11Z"/><path fill="#f4e6bd" d="m41 105 47-8 15 17-47 10Z"/><path stroke="#8da8a0" fill="none" d="m52 107 28-5 11 10-28 5Zm4 4 28-5m-21-1 10 10"/><path fill="#c1af83" d="m38 102 6-1 2 4-6 1Zm60 11 5-1 4 4-6 1Z"/></g><g class="ap-brush"><path fill="#735441" d="m98 78 3 1-15 31-3-2Z"/><path fill="#d9c594" d="m84 106 3 2-3 6-3-2Z"/><path fill="#7a9a9a" d="m81 111 3 2-7 6 1-5Z"/></g><g class="ap-swatch"><path fill="#7b6746" d="M108 91h19v27h-19Z"/><path fill="#dfb17c" d="M111 94h13v5h-13Z"/><path fill="#83a8a0" d="M111 102h13v5h-13Z"/><path fill="#b4bb8c" d="M111 110h13v5h-13Z"/></g>`,
    probe: `<g class="ap-instrument"><path fill="#7d6c4e" d="M106 62h30v44h-30Z"/><path fill="#c0b992" d="M108 64h26v39h-26Z"/><path fill="#3e5550" d="M111 68h20v16h-20Z"/><path fill="#b5c7a3" d="M114 72h3v2h-3Zm5 5h3v2h-3Zm5-6h3v2h-3Z"/><g class="ap-meter"><path fill="#d9c98d" d="M115 87h2v8h-2Z"/></g><path fill="#8c8568" d="M123 90h7v7h-7Z"/><path fill="#d7c895" d="M125 92h3v3h-3Z"/></g><g class="ap-probe"><path stroke="#6a5943" fill="none" d="M105 100q12 19 26 4"/><path fill="#cbb784" d="m96 82 4-1 9 21-4 2Z"/><path fill="#667f77" d="m94 76 3-1 3 6-3 1Z"/></g><g class="ap-test-sheet"><path fill="#e5d8b5" d="M37 92h23v27H37Z"/><path fill="#a5ad8b" d="M40 96h3v3h-3Zm0 7h3v3h-3Zm0 7h3v3h-3Z"/><path stroke="#b3a07c" d="M46 98h10m-10 7h10m-10 7h10"/></g>`,
    assembly: `<g class="ap-workmat"><path fill="#7a8f7b" d="M39 110h75v14H39Z"/><path stroke="#a5b29b" d="M44 115h64m-59-4v12m15-12v12m15-12v12m15-12v12"/></g><g class="ap-component"><path fill="#d2bd8a" d="M58 99h25v13H58Z"/><path fill="#9c875e" d="M61 102h19v7H61Z"/><path fill="#eee0b6" d="M64 103h4v4h-4Z"/></g><g class="ap-bracket"><path fill="#b4b79c" d="M88 96h6v14h13v5H88Z"/><path fill="#718275" d="M90 99h2v3h-2Zm8 12h3v2h-3Z"/></g><g class="ap-wrench"><path fill="#a7b8a5" d="m98 76 5 2 2 6-3 5 6 18-4 1-7-19-5-2-1-6 3-4 1 6 4 2 2-4Z"/><path fill="#d0d3b9" d="m101 91 2-1 6 15-2 1Z"/></g>`,
    console: `<g class="ap-console"><path fill="#7d6848" d="M96 72h39v39H96Z"/><path fill="#a0aa8b" d="M98 74h35v34H98Z"/><path fill="#344d49" d="M101 77h29v22h-29Z"/><path fill="#b8c6a0" d="M105 82h3v2h-3Zm6 0h12v2h-12Zm-6 5h9v2h-9Z"/><g class="ap-console-cursor"><path fill="#ddca8a" d="M117 88h3v5h-3Z"/></g><path fill="#797e63" d="M103 103h6v2h-6Zm10 0h6v2h-6Zm10 0h6v2h-6Z"/></g><g class="ap-console-note"><path fill="#e2d4ad" d="M41 97h26v23H41Z"/><path stroke="#af9970" d="M46 103h16m-16 5h12m-12 5h16"/></g>`,
    listening: `<g class="ap-wait-clock"><path fill="#a4865b" d="M111 90h15v4h4v15h-4v4h-15v-4h-4V94h4Z"/><path fill="#efe0b8" d="M112 94h13v14h-13Z"/><path fill="#b39d73" d="M118 95h2v2h-2Zm0 10h2v2h-2Zm-5-5h2v2h-2Zm10 0h2v2h-2Z"/><g class="ap-clock-hand"><path fill="#6c7155" d="M118 98h2v4h-2Z"/></g><path fill="#79674a" d="M110 113h18v3h-18Z"/></g>`,
    hand: `<g class="ap-question-card"><path fill="#897249" d="M39 94h30v27H39Z"/><path fill="#eee0bb" d="M41 96h26v23H41Z"/><path fill="#b3a27c" d="M46 102h16v2H46Zm0 6h12v2H46Z"/><path fill="#d3b27d" d="M50 92h9v5h-9Z"/></g>`,
    puzzled: `<g class="ap-problem-sheet"><path fill="#9b7b59" d="M39 91h28v30H39Z"/><path fill="#eddfbc" d="M41 93h24v26H41Z"/><path stroke="#b8a17b" d="M46 98h14m-14 5h10m-10 5h14"/><path fill="#b87857" d="M51 111h3v4h-3Zm0 5h3v2h-3Z"/></g><g class="ap-question"><path fill="#dfc491" d="M112 52h10v3h3v7h-3v3h-4v4h-3v-7h5v-6h-5v3h-3Zm3 20h4v4h-4Z"/></g>`
  });
  // Small work objects carry no task contents, percentages, or success marks.
  const PEN = '<g class="ap-annotation-pen"><path fill="#b69251" d="m103 87 3 1-12 26-3-1Z"/><path fill="#554b39" d="m91 113 3 1-5 5Z"/><path fill="#d6b49a" d="m103 85 4 1-1 3-4-1Z"/></g>';
  const CARD = '<g class="ap-second-card"><path fill="#9caa8c" d="M108 90h26v32h-26Z"/><path fill="#f1e6c7" d="M110 92h22v28h-22Z"/><path stroke="#b7a178" d="M114 98h14m-14 6h10m-10 6h14m-14 6h8"/></g>';
  const RULER = '<g class="ap-straightedge"><path fill="#d4be88" d="M48 108h58v6H48Z"/><path stroke="#8f825d" d="M53 108v4m7-4v2m7-2v4m7-4v2m7-2v4m7-4v2m7-2v4m7-4v2"/></g>';
  const EXTRA = Object.freeze({
    'read-annotate': PEN, 'read-compare': CARD,
    'search-index': '<g class="ap-index-fan"><path fill="#9eab8e" d="m103 95 21-4 6 28-21 4Z"/><path fill="#cebc8c" d="m109 91 22 2-2 29-22-2Z"/><path fill="#f0e0b7" d="M109 96h24v25h-24Z"/><path fill="#ac9e77" d="M113 101h15v2h-15Zm0 6h10v2h-10Zm0 6h15v2h-15Z"/><path fill="#bf8a68" d="M113 92h8v5h-8Z"/></g>',
    'search-compare': CARD,
    'code-pointer': '<g class="ap-mouse"><path fill="#d3c79f" d="M115 112h9v3h2v10h-13v-10h2Z"/><path stroke="#8c8769" d="M120 114v5"/><path fill="#87977d" d="M119 115h2v3h-2Z"/></g>',
    'design-swatches': '<g class="ap-colour-fan"><path fill="#c79a77" d="m43 98 13-5 10 25-13 5Z"/><path fill="#86a59b" d="m51 94 14 1-2 28-14-1Z"/><path fill="#b6bc86" d="m63 95 13 5-10 25-13-5Z"/><path fill="#f0ddb0" d="M55 118h3v3h-3Z"/></g>',
    'design-ruler': RULER,
    'test-inspect': '<g class="ap-inspection-lens"><path fill="#685840" d="m119 87 3-2 9 14-3 2Z"/><path fill="#d8c38e" d="M107 67h15v4h4v14h-4v4h-15v-4h-4V71h4Z"/><path fill="#a3c0ad" fill-opacity=".7" d="M108 71h13v13h-13Z"/><path fill="#ece5bd" d="M109 72h3v3h-3Z"/></g>',
    'build-align': RULER,
    'build-blueprint': '<g class="ap-blueprint"><path fill="#9ab4ab" d="M103 75h31v35h-31Z"/><path stroke="#e3ead2" fill="none" d="M108 81h20v21h-20Zm0 7h20m-13-7v21m-7-7h20"/><path fill="#c1d0b7" d="M106 105h25v2h-25Z"/></g>',
    'run-keyboard': '<g class="ap-command-keys"><path fill="#80765a" d="M44 111h61l5 13H39Z"/><path fill="#c6bd97" d="M46 114h56v3H46Zm-3 5h62v3H43Z"/><path stroke="#8c886d" d="M53 114v3m9-3v3m9-3v3m9-3v3m9-3v3m9-3v3"/></g>',
    'error-review': CARD
  });

  const paper = (x,y,w,h,ink='#f1e5c3') => `<path fill="#8b7350" d="M${x-2} ${y-2}h${w+4}v${h+4}H${x-2}Z"/><path fill="${ink}" d="M${x} ${y}h${w}v${h}H${x}Z"/><path stroke="#b8a27a" fill="none" d="M${x+4} ${y+6}h${w-8}m${8-w} 6h${w-12}m${12-w} 6h${w-8}"/>`;
  const terminal = (x,y,w,h) => `<path fill="#7a684b" d="M${x-2} ${y-2}h${w+4}v${h+4}H${x-2}Z"/><path fill="#344e4c" d="M${x} ${y}h${w}v${h}H${x}Z"/><path stroke="#b3c6a4" stroke-width="2" d="M${x+4} ${y+5}h4m4 0h${w-16}m${12-w} 6h${w-12}m${12-w} 6h6"/>`;
  const workmat = '<path fill="#798e7c" d="M36 115h84v10H36Z"/><path stroke="#a2b09b" d="M42 120h72m-60-4v8m15-8v8m15-8v8m15-8v8"/>';
  const leftPaper = `<g class="ap-held-left">${paper(22,77,27,32)}</g>`;
  const rightPaper = `<g class="ap-held-right">${paper(88,77,25,32)}</g>`;
  const rightPen = '<g class="ap-held-right"><path fill="#c4a66b" d="m115 79 3 2-17 28-3-2Z"/><path fill="#504e3c" d="m98 107 3 2-6 5Z"/></g>';
  const leftPen = '<g class="ap-held-left"><path fill="#c4a66b" d="m39 79 3-2 17 28-3 2Z"/><path fill="#504e3c" d="m56 107 3-2 5 7Z"/></g>';
  const openBook = '<g class="ap-scene-a"><path fill="#8c6b4a" d="m45 102 31 4 32-4v19l-32 5-31-5Z"/><path fill="#f3e5c2" d="m47 100 29 4 30-4v18l-30 5-29-5Z"/><path stroke="#baa079" d="m51 106 20 3m-20 2 16 2m15-4 19-3m-19 8 19-3"/></g>';
  const flatPlan = '<g class="ap-scene-a"><path fill="#d6c38f" d="m40 105 63-7 12 21-65 7Z"/><path stroke="#9caa92" fill="none" d="m48 109 19-2 3 6-19 2Zm25-3 19-2 3 6-19 2Zm-7 7 14-2m-21 9 31-4"/></g>';
  const testMark = '<path fill="#b87857" d="M63 107h3v5h-3Zm0 7h3v2h-3Z"/>';
  const WORK_SCENES = Object.freeze({
    'read-scroll': `<g class="ap-scene-a"><path fill="#ede0ba" d="M53 96h49v23H53Z"/><path stroke="#bba279" d="M60 101h34m-34 5h29m-29 5h34"/></g><g class="ap-held-left"><path fill="#a98c5b" d="M42 77h6v31h-6Z"/><path fill="#dbc48c" d="M40 76h10v4H40Zm0 29h10v4H40Z"/></g><g class="ap-held-right"><path fill="#a98c5b" d="M107 77h6v31h-6Z"/><path fill="#dbc48c" d="M105 76h10v4h-10Zm0 29h10v4h-10Z"/></g>`,
    'read-outline': leftPaper+`<g class="ap-held-left"><path fill="#b58b68" d="M49 80h5v5h-5Z"/><path fill="#8aa99b" d="M49 89h5v5h-5Z"/><path fill="#c1b67a" d="M49 98h5v5h-5Z"/></g>`,
    'read-footnote': leftPaper+`<g class="ap-held-right">${paper(99,80,22,19)}<path fill="#b09263" d="M103 83h3v3h-3Z"/></g>`,
    'read-bookmark': openBook+`<g class="ap-held-right"><path fill="#af7562" d="M108 89h4v21l-2-2-2 2Z"/></g>`,
    'read-diagram': `<g class="ap-scene-a"><path fill="#eee1ba" d="m40 99 24 3 26-4 23 4v20l-23-4-26 4-24-3Z"/><path stroke="#b5a17a" fill="none" d="M64 102v20m26-24v20m-41-11h10m11-1h14v6h11m-20-6v9h-5m25-8h12"/><path fill="#8ea89b" d="M69 104h5v4h-5Zm24 5h5v4h-5Z"/></g>`,
    'search-catalogue': `<g class="ap-scene-a"><path fill="#9a7b51" d="M94 105h42v20H94Z"/><path fill="#665a40" d="M98 107h34v9H98Z"/><path fill="#d6c798" d="M101 109h29v5h-29Z"/><path fill="#b5a579" d="M109 120h13v2h-13Z"/></g><g class="ap-held-right">${paper(100,72,26,23)}</g>`,
    'search-map': flatPlan+`<g class="ap-held-right"><path fill="#8b7650" d="m108 89 3-2 9 14-3 2Z"/><path fill="#d6bd83" d="M96 78h13v3h3v12h-3v3H96v-3h-3V81h3Z"/><path fill="#a3beb0" fill-opacity=".7" d="M97 81h11v11H97Z"/></g>`,
    'search-clues': `<g class="ap-scene-a">${paper(38,106,24,15)}${paper(78,106,24,15)}<path fill="#bd9473" d="M43 109h5v3h-5Z"/><path fill="#8ea698" d="M83 109h5v3h-5Z"/></g><g class="ap-held-right">${paper(98,75,24,24)}<path fill="#bdb37b" d="M103 80h5v3h-5Z"/></g>`,
    'search-shelves': `<g class="ap-scene-a"><path fill="#735e44" d="M25 119h45v5H25Z"/><path fill="#b6bf99" d="M28 91h8v28h-8Z"/><path fill="#bd936d" d="M38 85h9v34h-9Z"/><path fill="#a2b3a2" d="M58 88h9v31h-9Z"/></g><g class="ap-held-left"><path fill="#ddc38f" d="M48 80h9v30h-9Z"/><path fill="#998763" d="M50 86h5v2h-5Zm0 5h5v2h-5Z"/></g>`,
    'search-query': `<g class="ap-scene-a">${paper(40,104,45,18)}</g><g class="ap-scene-b">${terminal(106,62,29,31)}</g>`+rightPen,
    'plan-decompose': workmat+`<g class="ap-held-left"><path fill="#e7d6a9" d="M43 81h20v18H43Z"/><path fill="#99ad99" d="M48 85h10v3H48Z"/></g><g class="ap-held-right"><path fill="#dbc28d" d="M92 81h20v18H92Z"/><path fill="#b28c6c" d="M96 85h10v3H96Z"/></g><path stroke="#b5a374" stroke-dasharray="3 3" d="M72 117h12"/>`,
    'plan-sequence': `<g class="ap-scene-a"><path fill="#eee0b6" d="M40 103h71v21H40Z"/><path stroke="#9ea891" fill="none" d="M47 109h12v8H47Zm23 0h12v8H70Zm23 0h12v8H93Zm-34 4h11m12 0h11"/></g>`+rightPen,
    'plan-branches': `<g class="ap-held-right"><path fill="#b3c29f" d="m94 58 17-5 12 36-17 5Z"/><path fill="#d7bd88" d="m105 51 18 2-4 38-18-2Z"/><path fill="#efe1bd" d="m118 56 16 8-17 32-16-8Z"/><path stroke="#a28c66" d="m105 65 6 2m4 5 6 2m-8 8 6 2"/></g>`,
    'plan-trace': `<g class="ap-held-left"><g transform="translate(-23 0)">${paper(43,77,32,33)}<path stroke="#879e91" fill="none" d="M48 85h10v9h11m-11-5h9m-9 5v9"/></g></g>`+rightPen,
    'code-debug': PROPS.keyboard+`<g class="ap-scene-a"><path fill="none" stroke="#d5bf83" d="M68 95h30v12H68Z"/></g>`,
    'code-refactor': PROPS.keyboard+`<g class="ap-scene-a"><path fill="#53706a" d="M73 93h2v18h-2Z"/></g><g class="ap-held-left"><path fill="#ddc994" d="M43 87h22v6H43Z"/><path stroke="#9b906d" d="M48 90h12"/></g>`,
    'code-terminal': `<g class="ap-scene-a">${terminal(92,61,42,40)}<path fill="#9b9471" d="M43 111h75l4 13H38Z"/><path stroke="#d8cea8" stroke-width="2" d="M46 115h26m7 0h32m-66 6h66"/></g>`,
    'code-patch': PROPS.keyboard+leftPaper,
    'code-document': PROPS.keyboard+`<g class="ap-held-left"><path fill="#a0b39c" d="M26 80h25v30H26Z"/><path fill="#e9dcba" d="M29 82h20v26H29Z"/><path stroke="#b29d78" d="M32 88h14m-14 6h10m-10 6h14"/></g>`,
    'design-layout': workmat+`<g class="ap-held-left"><path fill="#d2b781" d="M43 83h19v15H43Z"/><path fill="#edddb4" d="M46 86h13v3H46Z"/></g><g class="ap-held-right"><path fill="#94ad9f" d="M92 82h21v17H92Z"/><path fill="#dce3bd" d="M96 86h12v3H96Z"/></g>`,
    'design-compass': flatPlan+`<g class="ap-held-right"><path stroke="#bba774" stroke-width="3" fill="none" d="m109 87-13 24m13-24 10 25"/><path fill="#6c7462" d="M107 84h5v6h-5Z"/></g><path stroke="#91a99a" fill="none" d="M68 116q12-18 28-2"/>`,
    'design-type': `<g class="ap-held-left"><g transform="translate(-23 0)">${paper(43,73,33,34)}<path stroke="#819b92" stroke-width="2" fill="none" d="M52 96V83h9v13m-9-6h9m5-7v13"/></g></g><g class="ap-held-right"><path fill="#d6bf84" d="M83 88h31v5H83Z"/><path stroke="#8c805f" d="M87 88v3m6-3v2m6-2v3m6-3v2"/></g>`,
    'design-trace': flatPlan+`<g class="ap-held-left"><path fill="#e7ead3" fill-opacity=".7" d="M44 83h42v22H44Z"/><path stroke="#9eb2a0" fill="none" d="m50 100 10-11 12 4 8 8"/></g>`+rightPen,
    'design-palette': flatPlan+`<g class="ap-held-left"><path fill="#cbb27e" d="M37 78h31v22H37Z"/><path fill="#c99274" d="M41 82h7v6h-7Z"/><path fill="#82a397" d="M52 82h7v6h-7Z"/><path fill="#b0b981" d="M43 91h7v5h-7Z"/><path fill="#eee0bc" d="M58 92h5v5h-5Z"/></g>`+rightPen,
    'test-cases': `<g class="ap-held-left"><g transform="translate(-20 0)"><path fill="#b4bf9c" d="m38 76 22-3 5 33-22 3Z"/><path fill="#d3bd89" d="m45 74 23 2-3 33-23-2Z"/><path fill="#efe1bc" d="M46 79h25v29H46Z"/><path stroke="#af9b72" d="M50 86h16m-16 6h12m-12 6h16"/></g></g><g class="ap-scene-a">${terminal(109,68,24,28)}</g>`,
    'test-boundary': workmat+`<g class="ap-scene-a"><path fill="#e1ca91" d="M55 106h47v8H55Z"/><path fill="#a5b297" d="M61 109h35v2H61Z"/></g><g class="ap-held-left"><path fill="#a7b8a1" d="M42 84h4v18h12v4H42Z"/></g><g class="ap-held-right"><path fill="#a7b8a1" d="M109 84h4v22H97v-4h12Z"/></g>`,
    'test-calibrate': `<g class="ap-scene-a"><path fill="#c4bc93" d="M96 63h38v54H96Z"/>${terminal(101,69,28,23)}<path fill="#8e9478" d="M116 99h12v12h-12Z"/><path stroke="#ded0a0" d="M122 101v8"/></g>`,
    'test-reproduce': leftPaper+workmat+`<g class="ap-scene-a"><path fill="#b2b998" d="M86 101h25v17H86Z"/><path fill="#526f64" d="M91 105h15v7H91Z"/><path fill="#d4c798" d="M96 107h5v3h-5Z"/></g>`,
    'test-compare': `<g class="ap-held-left"><g transform="translate(-20 0)"><path fill="#b1bea0" d="M41 77h25v32H41Z"/>${terminal(45,82,17,21)}</g></g><g class="ap-held-right"><g transform="translate(16 0)"><path fill="#d1bb8a" d="M92 77h25v32H92Z"/>${terminal(96,82,17,21)}</g></g>`,
    'build-fit': workmat+`<g class="ap-held-left"><path fill="#cfb987" d="M40 81h20v7h5v7h-5v7H40Z"/><path fill="#958662" d="M45 86h9v10h-9Z"/></g><g class="ap-held-right"><path fill="#a2b49d" d="M94 81h21v21H94v-7h5v-7h-5Z"/><path fill="#6f8777" d="M105 86h6v10h-6Z"/></g>`,
    'build-sort': workmat+`<g class="ap-scene-a"><path fill="#a18b61" d="M30 109h31v14H30Zm65 0h31v14H95Z"/><path fill="#7f7757" d="M33 112h25v8H33Zm65 0h25v8H98Z"/><path fill="#c9ba88" d="M36 115h6v4h-6Zm9 0h8v4h-8Zm56 0h4v4h-4Zm10 0h8v4h-8Z"/></g><g class="ap-held-right"><path fill="#d8c18b" d="M104 86h13v8h-13Z"/><path fill="#8a9f88" d="M108 88h5v3h-5Z"/></g>`,
    'build-wire': workmat+`<g class="ap-held-left"><path fill="#c3b483" d="M42 84h22v14H42Z"/><path fill="#667e6d" d="M50 88h8v6h-8Z"/></g><g class="ap-held-right"><path stroke="#74664b" stroke-width="3" fill="none" d="M110 90q20 10 4 15"/><path fill="#a9b59b" d="M105 85h12v9h-12Z"/><path fill="#d6cc9e" d="M106 81h3v5h-3Zm6 0h3v5h-3Z"/></g>`,
    'build-rotate': `<g class="ap-scene-a"><path fill="none" stroke="#c8bd91" stroke-width="5" d="M55 88h45v25H55Z"/><path fill="#8ba08e" d="M73 94h9v13h-9Z"/></g>`,
    'build-stack': workmat+`<g class="ap-scene-a"><path fill="#a4b394" d="M44 109h25v11H44Z"/><path fill="#c5b37e" d="M49 100h22v9H49Z"/><path fill="#8d9f88" d="M46 94h19v6H46Z"/></g><g class="ap-held-left"><path fill="#d9c48f" d="M42 86h20v7H42Z"/></g><g class="ap-held-right">${paper(99,70,27,31)}<path stroke="#91a391" d="M104 90h16m-13-5h10m-7-5h4"/></g>`,
    'run-log': `<g class="ap-scene-a">${terminal(96,56,39,55)}</g><g class="ap-held-right"><path fill="#d7c493" d="M98 88h27v4H98Z"/></g>`,
    'run-scroll': PROPS.console+`<g class="ap-scene-a"><path fill="#c8bd94" d="M114 109h12v15h-12Z"/><path fill="#8b987d" d="M118 112h4v7h-4Z"/></g>`,
    'run-monitor': `<g class="ap-scene-a">${terminal(25,64,25,35)}<path fill="#927a53" d="M35 100h4v18h-4Zm-9 18h24v4H26Z"/></g><g class="ap-scene-b">${terminal(108,64,25,35)}<path fill="#927a53" d="M119 100h4v18h-4Zm-9 18h24v4h-24Z"/></g>`,
    'run-reference': `<g class="ap-held-left"><g transform="translate(-21 0)">${paper(40,75,30,34)}<path fill="#879f91" d="M44 83h3v3h-3Zm0 6h3v3h-3Z"/></g></g><g class="ap-scene-a">${terminal(104,66,30,38)}</g>`,
    'run-trace': `<g class="ap-scene-a"><path fill="#b5b88e" d="M38 103h51v21H38Z"/><path stroke="#6d8b7a" fill="none" d="M44 110h12v8h16v-9h11"/><path fill="#d8d2a5" d="M43 107h5v5h-5Zm27 8h5v5h-5Z"/></g><g class="ap-scene-b">${terminal(106,63,28,34)}</g>`,
    'wait-console': `<g class="ap-scene-a">${terminal(105,77,29,34)}<path fill="#9d906b" d="M113 113h14v4h-14Z"/></g>`,
    'wait-tray': `<g class="ap-scene-a"><path fill="#a78c60" d="m52 105 49 0 7 17H45Z"/><path fill="#665e44" d="m55 108 43 0 3 9H51Z"/><path fill="#c2ac7a" d="M45 120h63v4H45Z"/></g>`,
    'wait-headset': `<g class="ap-scene-a"><path stroke="#827352" stroke-width="4" fill="none" d="M48 77V65h59v12"/><path fill="#b3bd9e" d="M46 74h7v16h-7Zm57 0h7v16h-7Z"/><path fill="#627b6d" d="M48 77h3v10h-3Zm57 0h3v10h-3Z"/></g>`,
    'wait-bookmark': `<g class="ap-held-left"><path fill="#99ad98" d="M41 78h26v31H41Z"/><path fill="#e0d1a9" d="M45 80h20v26H45Z"/><path fill="#af7e67" d="M57 78h4v19l-2-2-2 2Z"/></g>`,
    'wait-pencil-roll': `<g class="ap-scene-a"><path fill="#c9ad70" d="M63 102h31v4H63Z"/><path fill="#756147" d="m94 102 6 2-6 2Z"/><path fill="#cca493" d="M62 102h4v4h-4Z"/></g>`,
    'wait-wrist': `<g class="ap-held-left"><path fill="#8c7756" d="M50 84h4v13h-4Z"/><path fill="#d8c28e" d="M48 87h11v9H48Z"/><path fill="#f0e2bb" d="M50 89h7v5h-7Z"/><path stroke="#667b65" d="M53 89v3h2"/></g>`,
    'ask-present': leftPaper,
    'ask-point-line': `<g class="ap-scene-a">${paper(56,102,48,20)}<path fill="#cfb27f" d="M74 99h12v5H74Z"/></g>`,
    'ask-tilt-card': `<g class="ap-held-right">${paper(104,62,25,31)}<path fill="#d5b781" d="M110 60h10v5h-10Z"/></g>`,
    'ask-pencil-rest': `<g class="ap-held-left"><path fill="#d1be8d" d="M42 80h30v26H42Z"/><path fill="#f0e2bc" d="M44 82h26v22H44Z"/></g>`+rightPen,
    'ask-open-folder': `<g class="ap-scene-a"><path fill="#aaa97e" d="m52 99 24 5v21l-24-5Z"/><path fill="#e8dbb6" d="m54 101 20 4v17l-20-4Z"/><path fill="#c5b07b" d="m77 104 25-5v21l-25 5Z"/><path fill="#eee2bf" d="m79 105 21-4v17l-21 4Z"/></g>`,
    'ask-hand-to-heart': leftPaper,
    'error-magnify': `<g class="ap-held-left"><g transform="translate(-21 0)">${paper(43,78,29,34)}<path fill="#b87857" d="M58 101h3v4h-3Zm0 6h3v2h-3Z"/></g></g><g class="ap-held-right"><path fill="#8b7650" d="m108 89 3-2 9 14-3 2Z"/><path fill="#d6bd83" d="M96 78h13v3h3v12h-3v3H96v-3h-3V81h3Z"/><path fill="#a3beb0" fill-opacity=".7" d="M97 81h11v11H97Z"/></g>`,
    'error-trace': `<g class="ap-scene-a">${paper(49,104,57,18)}<path fill="#b87857" d="M82 110h3v4h-3Zm0 6h3v2h-3Z"/></g>`+rightPen,
    'error-overlay': `<g class="ap-held-left"><g transform="translate(-20 0)">${paper(42,77,29,34)}<path fill="#b87857" d="M58 101h3v4h-3Zm0 6h3v2h-3Z"/></g></g><g class="ap-held-right"><g transform="translate(20 0)"><path fill="#d8e3cb" fill-opacity=".7" d="M87 77h27v33H87Z"/><path stroke="#8fa698" d="M91 85h18m-18 6h13m-13 6h18"/></g></g>`,
    'error-reference': `<g class="ap-held-left"><g transform="translate(-13 0)"><path fill="#9d8961" d="m29 81 17 3 18-3v25l-18 3-17-3Z"/><path fill="#ede0ba" d="m31 79 15 3 16-3v24l-16 3-15-3Z"/><path stroke="#baa47c" d="m35 87 7 1m-7 5 7 1m8-6 8-1m-8 7 8-1"/></g></g><g class="ap-held-right"><g transform="translate(8 0)">${paper(97,73,27,34)}<path fill="#b87857" d="M109 96h3v4h-3Zm0 6h3v2h-3Z"/></g></g>`,
    'error-mark-place': `<g class="ap-held-left"><g transform="translate(-22 0)">${paper(43,78,30,34)}<path fill="#b87857" d="M58 101h3v4h-3Zm0 6h3v2h-3Z"/></g></g><g class="ap-held-right"><path stroke="#b8bea1" stroke-width="2" fill="none" d="M107 85v11h6V83h-9v15"/></g>`,
    'error-set-down': `<g class="ap-scene-a">${paper(56,98,44,21)}<path fill="#b87857" d="M76 104h3v5h-3Zm0 7h3v2h-3Z"/></g>`
  });

  function create({ actorNode, body, session = {}, clockRegistry } = {}) {
    if (!Model) throw new Error('Avatar performance model must load before its renderer.');
    if (!actorNode || !body || !body.ownerDocument) throw new TypeError('An actor node and character body are required.');
    const document = body.ownerDocument;
    const id = 'ap-' + (++serial);
    const layer = document.createElement('span');
    layer.className = 'avatar-performance';
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 154 129');
    svg.setAttribute('class', 'ap-rig');
    svg.setAttribute('focusable', 'false');
    // Each crop reuses the same locally authorized external image. The source
    // remains an isolated <image>; no restricted SVG markup is embedded here.
    const crop = (name, content) => `<clipPath id="${id}-${name}">${content}</clipPath>`;
    const use = name => `<use href="#${id}-source" clip-path="url(#${id}-${name})"/>`;
    svg.innerHTML = `<defs><image id="${id}-source" href="../assets/avatars/${Model.ASSET}" x="40" y="40" width="75" height="80"/>${crop('torso', '<path clip-rule="evenodd" d="M50 70h55v35H50ZM60 80v10h5V80ZM90 80v10h5V80Z"/>')}${crop('patch', '<path d="M60 72h5v5h-5ZM90 72h5v5h-5Z"/>')}${crop('eyes', '<path d="M60 80h5v10h-5ZM90 80h5v10h-5Z"/>')}${crop('left', '<path d="M40 85h10v10H40Z"/>')}${crop('right', '<path d="M105 85h10v10h-10Z"/>')}${crop('foot1', '<path d="M55 105h5v10h-5Z"/>')}${crop('foot2', '<path d="M65 105h5v10h-5Z"/>')}${crop('foot3', '<path d="M85 105h5v10h-5Z"/>')}${crop('foot4', '<path d="M95 105h5v10h-5Z"/>')}</defs><g class="ap-feet"><g class="ap-foot ap-foot-1">${use('foot1')}</g><g class="ap-foot ap-foot-2">${use('foot2')}</g><g class="ap-foot ap-foot-3">${use('foot3')}</g><g class="ap-foot ap-foot-4">${use('foot4')}</g></g><g class="ap-breath"><g class="ap-upper"><g class="ap-torso">${use('torso')}<g transform="translate(0 -64) scale(1 2)">${use('patch')}</g></g><g class="ap-eyes"><g class="ap-blink">${use('eyes')}</g></g><g class="ap-props-back"></g><g class="ap-props-transit"></g><g class="ap-arm ap-arm-left">${use('left')}</g><g class="ap-arm ap-arm-right">${use('right')}</g><g class="ap-props-front"></g></g></g>`;
    const back = svg.querySelector('.ap-props-back');
    const breath = svg.querySelector('.ap-breath');
    const front = svg.querySelector('.ap-props-front');
    const transit = svg.querySelector('.ap-props-transit');
    layer.append(svg);
    body.append(layer);
    let last = null;
    let destroyed = false;
    // One bounded clock per supported kind (eleven maximum), only for this
    // actor identity. Brief tool bouts cannot erase accumulated thinking time.
    const visibleClocks = new Map();
    let clockIdentity = '', lastNow = null;
    let clockLease = null;
    const bridges = new Set();
    let bridgeClockOwner = null;
    const transients = new Set();
    let ghost = null;
    const view = document.defaultView;
    let systemMotion = null, inheritedOptions = {};
    const bitmap = body.querySelector('img');
    const originalBitmapOpacity = bitmap?.style?.getPropertyValue?.('opacity') || '';
    let visual = null, presence = 'inactive', presenceSerial = 0, hiddenWork = false;
    const fades = new Set(), paused = new Map();
    let frozen = [];
    const joints = () => typeof svg.querySelectorAll === 'function' ? [...svg.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')] : [];
    function releaseBridgeClocks(owner, resume = true) {
      if (!owner || bridgeClockOwner !== owner) return;
      bridgeClockOwner = null;
      const live = new Set(layer.getAnimations?.({ subtree: true }) || []);
      for (const [motion, state] of owner.clocks) if (resume && !destroyed
        && state === 'running' && motion.playState === 'paused'
        && !paused.has(motion) && live.has(motion)) motion.play();
    }
    function holdBridgeClocks() {
      const owner = { clocks: new Map() };
      bridgeClockOwner = owner;
      for (const motion of layer.getAnimations?.({ subtree: true }) || []) {
        if (typeof motion.animationName !== 'string') continue;
        owner.clocks.set(motion, motion.playState);
        if (motion.playState === 'running' || motion.pending) {
          // Freeze the same CSS object at the phase used by the bridge's
          // target. Letting it run behind that static target causes a jump
          // when the finite transform effect ends 180ms later.
          if (motion.currentTime === null) motion.currentTime = 0;
          motion.pause();
        }
      }
      return owner;
    }
    function finishBridgeClocks(owner) {
      Promise.allSettled([...bridges].map(motion => motion.finished)).then(() => {
        releaseBridgeClocks(owner);
      });
    }
    let landing = null;
    function stopLanding() {
      if (landing) { landing.cancel(); landing = null; }
    }
    let eyeCue = null;
    function stopCue() {
      if (eyeCue) { eyeCue.cancel(); eyeCue = null; }
    }
    // Brief eye reactions to observed room events. They add onto the current
    // work track and own no clock, so cancelling one never moves a joint.
    function cue(kind, { direction = 0 } = {}) {
      const eyes = svg.querySelector('.ap-eyes');
      if (destroyed || gait || layer.hidden || frozen.length || !last?.animate
        || !['active', 'entering'].includes(presence) || typeof eyes?.animate !== 'function') return false;
      const sine = 'cubic-bezier(.37,0,.63,1)';
      let frames, duration;
      if (kind === 'glance' && direction) {
        const look = `translate(${Math.sign(direction) * 2}px,0px)`;
        frames = [{ transform: 'translate(0px,0px)', easing: sine }, { transform: look, offset: .25 },
          { transform: look, offset: .7, easing: sine }, { transform: 'translate(0px,0px)' }];
        duration = 1200;
      } else if (kind === 'startle') {
        frames = [{ transform: 'scale(1,1)', easing: 'cubic-bezier(.23,1,.32,1)' },
          { transform: 'scale(1.12,1.22)', offset: .2, easing: sine }, { transform: 'scale(1,1)' }];
        duration = 600;
      } else return false;
      stopCue();
      const motion = eyes.animate(frames, { duration, composite: 'add' });
      eyeCue = motion;
      motion.finished.catch(() => {}).finally(() => { if (eyeCue === motion) eyeCue = null; });
      return true;
    }
    function stopBridge(resumeClocks = true) {
      stopLanding();
      for (const motion of bridges) motion.cancel();
      bridges.clear();
      releaseBridgeClocks(bridgeClockOwner, resumeClocks);
      if (ghost) { ghost.remove(); ghost = null; }
    }
    function animate(node, frames) {
      if (typeof node.animate !== 'function') return;
      const motion = node.animate(frames, { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' });
      bridges.add(motion);
      motion.finished.catch(() => {}).finally(() => bridges.delete(motion));
      return motion;
    }
    function capture() {
      if (!view || typeof view.getComputedStyle !== 'function') return [];
      return joints().map(node => ({ node, transform: view.getComputedStyle(node).transform }));
    }
    function retainProps() {
      if (!view || !visual || typeof back.cloneNode !== 'function') return null;
      const copy = back.cloneNode(true);
      const originals = [back, ...back.querySelectorAll('*')];
      const copies = [copy, ...copy.querySelectorAll('*')];
      originals.forEach((node, index) => {
        const style = view.getComputedStyle(node);
        copies[index].style.setProperty('animation', 'none', 'important');
        copies[index].style.transform = style.transform;
        copies[index].style.opacity = style.opacity;
      });
      return copy;
    }
    const opacity = (node, fallback) => {
      const value = node && view?.getComputedStyle ? Number(view.getComputedStyle(node).opacity) : NaN;
      return Number.isFinite(value) ? value : fallback;
    };
    function stopFade(preserve = false) {
      const rigOpacity = preserve ? opacity(layer, 0) : 0, imageOpacity = preserve ? opacity(bitmap, 1) : 1;
      presenceSerial++;
      for (const motion of fades) motion.cancel();
      fades.clear();
      if (preserve) { layer.style.opacity = String(rigOpacity); if (bitmap) bitmap.style.opacity = String(imageOpacity); }
    }
    function freezeVisual() {
      if (frozen.length || !view?.getComputedStyle || !svg.querySelectorAll) return;
      stopLanding(); stopCue();
      // Capture the actual composed pose, including an interrupted 180ms
      // bridge and its outgoing object. Pause the original CSS clocks instead
      // of changing program selectors or rebuilding any body crop.
      const nodes = [...svg.querySelectorAll('.ap-upper,.ap-eyes,.ap-blink,.ap-arm,.ap-foot,.ap-props-back,.ap-props-back *,.ap-props-front,.ap-props-front *')].filter(node => !transit?.contains(node));
      frozen = nodes.map(node => {
        const style = view.getComputedStyle(node);
        const values = ['transform', 'opacity'].map(name => ({ name, value: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name), computed: style[name] }));
        return { node, values };
      });
      for (const item of frozen) for (const value of item.values) item.node.style.setProperty(value.name, value.computed, 'important');
      for (const motion of layer.getAnimations?.({ subtree: true }) || []) {
        // Resource-health fades have a separate finite owner. Pausing them
        // here would strand healing when a different work program resumes.
        if (!bridges.has(motion) && typeof motion.animationName !== 'string') continue;
        paused.set(motion, bridgeClockOwner?.clocks.get(motion) || motion.playState);
        if (motion.playState === 'running' || motion.pending) {
          // pause() may commit on the next timeline sample. Hold the phase
          // actually observed now instead of crediting an extra hidden frame.
          const at = motion.currentTime;
          motion.pause();
          if (Number.isFinite(at)) motion.currentTime = at;
        }
      }
    }
    function clearTransients() {
      for (const item of transients) { item.motion.cancel(); item.node.remove(); }
      transients.clear();
    }
    function keepPropSnapshot(source) {
      if (!transit || !source.childNodes.length || opacity(source, 1) < .001) return;
      // A bridge can already contain an outgoing prop at partial opacity.
      // Snapshot that composed subtree before its old owner cancels. These
      // finite copies survive a quick walk/work interruption independently.
      const copy = source.cloneNode(true);
      for (const node of [copy, ...copy.querySelectorAll('*')]) node.style.setProperty('animation', 'none', 'important');
      const from = opacity(source, 1);
      copy.style.setProperty('opacity', '0');
      transit.append(copy);
      const motion = copy.animate([{ opacity: from }, { opacity: 0 }],
        { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' });
      const item = { node: copy, motion };
      transients.add(item);
      motion.finished.catch(() => {}).finally(() => { copy.remove(); transients.delete(item); });
    }
    function thawVisual(resume = false) {
      for (const item of frozen) for (const value of item.values) {
        if (value.value) item.node.style.setProperty(value.name, value.value, value.priority);
        else item.node.style.removeProperty(value.name);
      }
      frozen = [];
      for (const [motion, state] of paused) if (resume && state === 'running' && motion.playState === 'paused'
        && !bridgeClockOwner?.clocks.has(motion)) motion.play();
      paused.clear();
    }
    function fadePresence(active) {
      const rigFrom = opacity(layer, active ? 0 : 1), imageFrom = opacity(bitmap, active ? 1 : 0);
      const token = ++presenceSerial;
      const rigTo = active ? 1 : 0, imageTo = active ? 0 : 1;
      layer.style.opacity = String(rigTo); if (bitmap) bitmap.style.opacity = String(imageTo);
      const options = { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' };
      const motion = layer.animate([{ opacity: rigFrom }, { opacity: rigTo }], options);
      fades.add(motion);
      if (bitmap?.animate) {
        const imageMotion = bitmap.animate([{ opacity: imageFrom }, { opacity: imageTo }], options);
        fades.add(imageMotion);imageMotion.finished.catch(() => {}).finally(() => fades.delete(imageMotion));
      }
      motion.finished.then(() => {
        if (destroyed || token !== presenceSerial) return;
        presence = active ? 'active' : 'inactive';
        if (!active) body.classList.remove('has-avatar-performance');
      }).catch(() => {}).finally(() => fades.delete(motion));
      presence = active ? 'entering' : 'exiting';
    }
    function settleInactive() {
      stopCue(); stopGait(); stopFade(); stopBridge(false); clearTransients();
      layer.hidden = true; layer.style.opacity = '0';
      layer.dataset.animate = 'false';
      thawVisual(false);
      body.classList.remove('has-avatar-performance');
      if (bitmap) bitmap.style.opacity = '1';
      presence = 'inactive';
    }

    let gait = null;
    const retiredGaitOwners = new WeakSet();
    // A fixed world stride bounds cadence at 1.67Hz for the route's 320px/s
    // ceiling, including dense .4/.1 fits. This is distance synchronisation,
    // not world-space foot locking or inverse kinematics.
    const GAIT_WORLD_STRIDE = 192;
    function gaitNow() {
      const time = document.timeline?.currentTime;
      return Number.isFinite(time) ? time : view?.performance?.now?.() || 0;
    }
    function gaitMatrix(transform) {
      const Matrix = view?.DOMMatrixReadOnly || view?.DOMMatrix;
      const value = new Matrix(transform === 'none' ? undefined : transform);
      return [value.a, value.b, value.c, value.d, value.e, value.f];
    }
    function gaitTakeoverWeight(elapsed) {
      const progress = Math.max(0, Math.min(1, elapsed / 180));
      if (progress === 0 || progress === 1) return progress;
      // The existing 180ms cubic-bezier(.23,1,.32,1), evaluated against the
      // shared ticker. The whole trajectory blends, not just its first frame.
      let low = 0, high = 1;
      for (let pass = 0; pass < 18; pass++) {
        const t = (low + high) / 2, u = 1 - t;
        if (3*u*u*t*.23 + 3*u*t*t*.32 + t*t*t < progress) low = t;
        else high = t;
      }
      return 1 - Math.pow(1 - (low + high) / 2, 3);
    }
    function locomotion(sample, releasedOwner) {
      if (destroyed || !gait) return false;
      const current = gait;
      if (sample === null) {
        if (!releasedOwner || current.distanceOwner !== releasedOwner) return false;
        retiredGaitOwners.add(releasedOwner); current.distanceOwner = null;
        // Keep the sampled final pose paused until update(walking:false)
        // transfers it to the ordinary work/freeze owner.
        return true;
      }
      const owner = sample?.owner, distance = sample?.distanceWorld, speed = sample?.speedWorld;
      if (!owner || !['object', 'function'].includes(typeof owner) || retiredGaitOwners.has(owner)
        || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(speed) || speed < 0) return false;
      const elapsed = Number.isFinite(sample.elapsedMs) ? sample.elapsedMs
        : Number.isFinite(owner.currentTime) ? owner.currentTime : gaitNow();
      if (!current.distanceDriven) {
        const actual = new Map(capture().map(item => [item.node, item.transform]));
        current.phaseMs = Math.max(0, Number(current.entries[0]?.loop.currentTime) || 0);
        current.distanceDriven = true; current.blendElapsed = 0;
        for (const entry of current.entries) {
          entry.before = gaitMatrix(actual.get(entry.node) || 'none');
          entry.matrices = entry.frames.map(frame => gaitMatrix(frame.transform));
          entry.loop.pause();
        }
        for (const motion of current.takeovers) { motion.cancel(); current.motions.delete(motion); }
        current.takeovers.clear();
        actorNode.dataset.locomotionSource = 'distance';
      }
      if (current.distanceOwner !== owner) {
        if (current.distanceOwner) retiredGaitOwners.add(current.distanceOwner);
        current.distanceOwner = owner; current.lastDistance = distance; current.lastElapsed = elapsed;
      }
      const advance = Math.max(0, distance - current.lastDistance);
      current.lastDistance = Math.max(current.lastDistance, distance);
      current.phaseMs += advance * 600 / GAIT_WORLD_STRIDE;
      current.blendElapsed += Math.max(0, elapsed - current.lastElapsed);
      current.lastElapsed = Math.max(current.lastElapsed, elapsed);
      const weight = gaitTakeoverWeight(current.blendElapsed);
      for (const entry of current.entries) {
        if (weight < 1) {
          entry.loop.effect.setKeyframes(entry.frames.map((frame, index) => ({ ...frame,
            transform: 'matrix(' + entry.matrices[index].map((value, axis) =>
              Number((entry.before[axis] + (value - entry.before[axis]) * weight).toFixed(8))).join(',') + ')' })));
          entry.blended = true;
        } else if (entry.blended) { entry.loop.effect.setKeyframes(entry.frames); entry.blended = false; }
        entry.loop.currentTime = current.phaseMs;
      }
      actorNode.dataset.locomotionPhase = String(current.phaseMs);
      return true;
    }
    function startGait(canFade) {
      if (gait) return;
      const before = capture();
      stopFade(true);
      freezeVisual();
      keepPropSnapshot(back); keepPropSnapshot(front);
      stopBridge();
      const motions = new Set();
      gait = { motions, entries: [], takeovers: new Set(), distanceOwner: null, distanceDriven: false, phaseMs: 0 };
      actorNode.dataset.locomotion = 'true';
      const carrying = Boolean(actorNode.querySelector?.('.actor-prop[data-carry="true"]'));
      const neutral = 'translate(0px,0px) rotate(0deg)';
      const timing = { duration: 600, iterations: Infinity, easing: 'linear' };
      const start = document.timeline?.currentTime;
      const curves = frames => frames.map((frame, index) => index < frames.length - 1
        ? { easing: 'cubic-bezier(.37,0,.63,1)', ...frame } : frame);
      for (const item of before) {
        const node = item.node;
        node.style.removeProperty('transform');
        let frames;
        if (node.classList.contains('ap-foot')) {
          const index = [...svg.querySelectorAll('.ap-foot')].indexOf(node);
          const first = index % 2 === 0;
          frames = [
            { transform: neutral, offset: 0 },
            { transform: first ? 'translate(1.5px,-2.5px) rotate(-5deg)' : 'translate(-1px,0px) rotate(4deg)', offset: .25 },
            { transform: neutral, offset: .5 },
            { transform: first ? 'translate(-1px,0px) rotate(4deg)' : 'translate(1.5px,-2.5px) rotate(-5deg)', offset: .75 },
            { transform: neutral, offset: 1 }
          ];
        } else if (node.classList.contains('ap-arm')) {
          const left = node.classList.contains('ap-arm-left'), direction = left ? 1 : -1;
          const hold = 'translate(3px,4px) rotate(5deg)';
          frames = carrying && !left ? [{ transform: hold }, { transform: hold }] : [
            { transform: neutral, offset: 0 },
            { transform: `translate(${-direction * 1.5}px,1px) rotate(${direction * 9}deg)`, offset: .28 },
            { transform: neutral, offset: .5 },
            { transform: `translate(${direction * 1.5}px,-1px) rotate(${-direction * 9}deg)`, offset: .78 },
            { transform: neutral, offset: 1 }
          ];
        } else if (node.classList.contains('ap-upper')) {
          // Body rises over the passing foot and sways toward it.
          frames = [{ transform: neutral }, { transform: 'translate(.4px,-2px) rotate(.9deg)', offset: .25 },
            { transform: neutral, offset: .5 }, { transform: 'translate(-.4px,-2px) rotate(-.9deg)', offset: .75 }, { transform: neutral }];
        } else if (node.classList.contains('ap-eyes')) {
          frames = [{ transform: neutral }, { transform: 'translate(0px,.5px) rotate(0deg)', offset: .32 },
            { transform: neutral, offset: .5 }, { transform: 'translate(0px,.5px) rotate(0deg)', offset: .82 }, { transform: neutral }];
        } else frames = [{ transform: neutral }, { transform: neutral }];
        const trajectory = curves(frames);
        const loop = node.animate(trajectory, timing);
        gait.entries.push({ node, loop, frames: trajectory });
        motions.add(loop);
        loop.finished.catch(() => {});
        // The compositor starts the loop exactly where the 180ms takeover ends.
        // No JS timer or repeated first-frame jump occurs on later strides.
        if (Number.isFinite(start)) loop.startTime = start + 180;
        const takeover = node.animate([{ transform: item.transform }, { transform: frames[0].transform }],
          { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' });
        gait.takeovers.add(takeover);
        motions.add(takeover);
        takeover.finished.catch(() => {}).finally(() => motions.delete(takeover));
      }
      for (const props of [back, front]) props.style.setProperty('opacity', '0');
      layer.hidden = false;
      body.classList.add('has-avatar-performance');
      if (canFade) fadePresence(true);
      else { layer.style.opacity = '1'; if (bitmap) bitmap.style.opacity = '0'; presence = 'active'; }
    }
    function stopGait() {
      if (!gait) return [];
      const actual = capture();
      const owner = gait;
      gait = null;
      if (owner.distanceOwner) retiredGaitOwners.add(owner.distanceOwner);
      for (const motion of owner.motions) motion.cancel();
      owner.motions.clear();
      // Keep the last physical stride for a natural fade or work-pose takeover.
      // thawVisual later restores the original inline styles and CSS clock leases.
      for (const item of actual) item.node.style.setProperty('transform', item.transform, 'important');
      delete actorNode.dataset.locomotion;
      delete actorNode.dataset.locomotionSource;
      delete actorNode.dataset.locomotionPhase;
      return actual;
    }

    function update(value = session, options = {}) {
      if (destroyed) return Model.plan({}, {});
      inheritedOptions = options;
      options = { ...options, reducedMotion: Boolean(options.reducedMotion || systemMotion?.matches()) };
      session = value;
      const base = Model.plan(session, options);
      // The public plan still reports hidden/inactive. Only the clock's work
      // kind is retained so a hidden interval cannot erase its visible history.
      const workBase = options.hidden ? Model.plan(session, { ...options, hidden: false }) : base;
      const now = Number.isFinite(options.now) ? options.now : null;
      // Credit only the kind that was actually visible since the previous
      // update. Other kinds, hidden intervals and quiet modes never catch up
      // from wall time. Returning to a kind resumes its own accumulated clock.
      const identity = Model.identityFor(session);
      if (identity !== clockIdentity) {
        if (clockLease) clockLease.release();
        visibleClocks.clear(); clockIdentity = identity; lastNow = null;
        clockLease = clockRegistry && typeof clockRegistry.open === 'function' ? clockRegistry.open(session) : null;
      }
      if (!clockLease && now !== null && lastNow !== null && last && last.active && last.animate && Model.PROGRAMS[last.kind]) {
        visibleClocks.set(last.kind, (visibleClocks.get(last.kind) || 0) + Math.max(0, now - lastNow));
      }
      lastNow = now === null ? null : Math.max(lastNow === null ? now : lastNow, now);
      const visibleElapsed = clockLease ? clockLease.sample(workBase.kind, { now, visible: base.active && base.animate }) : visibleClocks.get(workBase.kind) || 0;
      const plan = Model.plan(session, { ...options, visibleElapsed });
      const changed = !visual || visual.program !== plan.program || visual.kind !== plan.kind;
      const quiet = Boolean(options.reducedMotion || options.lowPower || options.hidden);
      const canFade = Boolean(view?.getComputedStyle && layer.animate && bitmap?.animate && !quiet);
      const hiddenPlan = options.hidden && workBase.active ? Model.plan(session, { ...options, hidden: false, visibleElapsed }) : null;
      if (hiddenPlan?.animate && visual?.animate && hiddenPlan.key === visual.key && !gait
        && (hiddenWork || presence === 'active' || presence === 'entering')
        && !layer.hidden && layer.dataset.animate === 'true' && view?.getComputedStyle && joints().length) {
        // Hiding alone is a pause lease, not a new lifecycle or CSS program.
        // Preserve selectors/props and synchronously freeze the actual phase;
        // independent health fades keep their own finite owner.
        freezeVisual(); hiddenWork = true; last = plan;
        return plan;
      }
      const wasHidden = hiddenWork;
      hiddenWork = false;
      // Locomotion is visual evidence of a real route, never an AI work kind.
      // The same crops and health owner continue to render its stepping feet.
      if (options.walking && !options.reaction && canFade && joints().length) {
        startGait(canFade);
        if (actorNode.dataset.performance !== 'none') actorNode.dataset.performance = 'none';
        if (actorNode.dataset.performanceProgram) actorNode.dataset.performanceProgram = '';
        last = plan;
        return plan;
      }
      const wasWalking = Boolean(gait), walkingPose = wasWalking ? stopGait() : null;
      if (!plan.active) {
        // Natural inactive states keep the actual final joint pose during
        // the finite handoff. The original work clocks remain suspended.
        const returning = plan.reason === 'departing' && !options.reaction;
        const natural = ['stale', 'unclassified', 'closed', 'walking'].includes(plan.reason) || returning;
        if (natural && (visual?.animate || wasWalking) && canFade) {
          if (presence === 'active' || presence === 'entering') {
            stopFade(true); freezeVisual(); fadePresence(false);
          }
        } else if (!last || last.active || presence !== 'inactive' || layer.dataset.animate !== 'false') settleInactive();
        if (!last || last.active) { actorNode.dataset.performance = 'none'; actorNode.dataset.performanceProgram = ''; }
        last = plan;
        return plan;
      }
      const resuming = Boolean(wasHidden || wasWalking || visual && presence !== 'active' && presence !== 'entering');
      const blend = (changed || wasWalking) && plan.animate;
      if (blend) stopCue();
      const before = blend ? walkingPose || capture() : [];
      const oldProps = blend && !wasWalking ? retainProps() : null;
      if (resuming || !plan.animate) { stopFade(true); thawVisual(plan.animate && !changed); }
      if (changed || wasWalking || !plan.animate) stopBridge(plan.animate);
      // No DOM writes for unchanged snapshots: animation timelines stay alive.
      if (changed) {
        // The hands must stay above their held objects: putting the laptop or
        // folio in front would hide the new wrist choreography completely.
        back.innerHTML = WORK_SCENES[plan.program] || (PROPS[plan.kind] || '') + (EXTRA[plan.program] || '');
        front.innerHTML = '';
        layer.dataset.kind = plan.kind;
        layer.dataset.program = plan.program;
      }
      if (actorNode.dataset.performance !== plan.kind) actorNode.dataset.performance = plan.kind;
      if (actorNode.dataset.performanceProgram !== plan.program) actorNode.dataset.performanceProgram = plan.program;
      if (!visual || visual.key !== plan.key) {
        layer.dataset.variant = String(plan.variant);
        layer.style.setProperty('--ap-offset', plan.phaseOffset + 'ms');
      }
      if (layer.dataset.animate !== String(plan.animate)) layer.dataset.animate = String(plan.animate);
      if (!last || !last.active || !plan.animate) {
        layer.hidden = false;
        body.classList.toggle('has-avatar-performance', true);
        if (resuming && canFade && plan.animate) fadePresence(true);
        else { layer.style.opacity = '1'; if (bitmap) bitmap.style.opacity = '0'; presence = 'active'; }
      }
      if (blend) {
        const clockOwner = holdBridgeClocks();
        for (const item of before) {
          const target = view.getComputedStyle(item.node).transform;
          if (item.transform !== target) animate(item.node, [{ transform: item.transform }, { transform: target }]);
        }
        animate(back, [{ opacity: 0, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }]);
        if (oldProps) {
          ghost = oldProps; front.append(oldProps);
          const fading = animate(oldProps, [{ opacity: 1 }, { opacity: 0 }]);
          if (fading) fading.finished.catch(() => {}).finally(() => { oldProps.remove(); if (ghost === oldProps) ghost = null; });
        }
        if (wasWalking && !quiet && typeof breath?.animate === 'function') {
          // Settle into the work pose once the 180ms bridge has landed. It owns
          // no work clock and adds onto breathing, so neither end can jump.
          // Vertical scale stays at or below 1 so held props keep their frame.
          stopLanding();
          const sine = 'cubic-bezier(.37,0,.63,1)';
          const settle = breath.animate([
            { transform: 'scale(1,1)', easing: sine },
            { transform: 'scale(1.035,.955)', offset: .3, easing: sine },
            { transform: 'scale(.992,1)', offset: .65, easing: sine },
            { transform: 'scale(1,1)' }
          ], { duration: 460, delay: 180, composite: 'add' });
          landing = settle;
          settle.finished.catch(() => {}).finally(() => { if (landing === settle) landing = null; });
        }
        finishBridgeClocks(clockOwner);
      }
      visual = plan; last = plan;
      return plan;
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      systemMotion?.destroy();
      stopCue(); stopGait(); stopFade(); thawVisual(false);
      stopBridge(false); clearTransients();
      if (clockLease) { clockLease.release(); clockLease = null; }
      visibleClocks.clear();
      body.classList.remove('has-avatar-performance');
      if (bitmap?.style?.removeProperty) {
        if (originalBitmapOpacity) bitmap.style.setProperty('opacity', originalBitmapOpacity);
        else bitmap.style.removeProperty('opacity');
      }
      delete actorNode.dataset.performance;
      delete actorNode.dataset.performanceProgram;
      layer.remove();
      visual = null; last = null;
    }
    // A single shared media listener cancels finite fades as well as CSS
    // choreography. No wall-time credit is inferred from this local UI event.
    systemMotion = watchReduced(view, () => update(session, { ...inheritedOptions, now: undefined }));
    return Object.freeze({ update, locomotion, cue, destroy, get plan() { return last; } });
  }
  return Object.freeze({ create });
});
