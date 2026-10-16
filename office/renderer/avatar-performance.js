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

  function create({ actorNode, body, session = {} } = {}) {
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
    svg.innerHTML = `<defs><image id="${id}-source" href="../assets/avatars/${Model.ASSET}" x="40" y="40" width="75" height="80"/>${crop('torso', '<path clip-rule="evenodd" d="M50 70h55v35H50ZM60 80v10h5V80ZM90 80v10h5V80Z"/>')}${crop('patch', '<path d="M60 72h5v5h-5ZM90 72h5v5h-5Z"/>')}${crop('eyes', '<path d="M60 80h5v10h-5ZM90 80h5v10h-5Z"/>')}${crop('left', '<path d="M40 85h10v10H40Z"/>')}${crop('right', '<path d="M105 85h10v10h-10Z"/>')}${crop('foot1', '<path d="M55 105h5v10h-5Z"/>')}${crop('foot2', '<path d="M65 105h5v10h-5Z"/>')}${crop('foot3', '<path d="M85 105h5v10h-5Z"/>')}${crop('foot4', '<path d="M95 105h5v10h-5Z"/>')}</defs><g class="ap-feet"><g class="ap-foot ap-foot-1">${use('foot1')}</g><g class="ap-foot ap-foot-2">${use('foot2')}</g><g class="ap-foot ap-foot-3">${use('foot3')}</g><g class="ap-foot ap-foot-4">${use('foot4')}</g></g><g class="ap-upper"><g class="ap-torso">${use('torso')}<g transform="translate(0 -64) scale(1 2)">${use('patch')}</g></g><g class="ap-eyes"><g class="ap-blink">${use('eyes')}</g></g><g class="ap-props-back"></g><g class="ap-arm ap-arm-left">${use('left')}</g><g class="ap-arm ap-arm-right">${use('right')}</g><g class="ap-props-front"></g></g>`;
    const back = svg.querySelector('.ap-props-back');
    const front = svg.querySelector('.ap-props-front');
    layer.append(svg);
    body.append(layer);
    let last = null;
    let destroyed = false;
    // One bounded clock per supported kind (eleven maximum), only for this
    // actor identity. Brief tool bouts cannot erase accumulated thinking time.
    const visibleClocks = new Map();
    let clockIdentity = '', lastNow = null;
    const bridges = new Set();
    let ghost = null;
    const view = document.defaultView;
    const joints = () => typeof svg.querySelectorAll === 'function' ? [...svg.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')] : [];
    function stopBridge() {
      for (const motion of bridges) motion.cancel();
      bridges.clear();
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
      if (!view || !last || !last.active || typeof back.cloneNode !== 'function') return null;
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

    function update(value = session, options = {}) {
      if (destroyed) return Model.plan({}, {});
      session = value;
      const base = Model.plan(session, options);
      const now = Number.isFinite(options.now) ? options.now : null;
      // Credit only the kind that was actually visible since the previous
      // update. Other kinds, hidden intervals and quiet modes never catch up
      // from wall time. Returning to a kind resumes its own accumulated clock.
      const identity = JSON.stringify([session.provider, session.id || session.sessionId]);
      if (identity !== clockIdentity) {
        visibleClocks.clear(); clockIdentity = identity; lastNow = null;
      }
      if (now !== null && lastNow !== null && last && last.active && last.animate && Model.PROGRAMS[last.kind]) {
        visibleClocks.set(last.kind, (visibleClocks.get(last.kind) || 0) + Math.max(0, now - lastNow));
      }
      lastNow = now === null ? null : Math.max(lastNow === null ? now : lastNow, now);
      const visibleElapsed = visibleClocks.get(base.kind) || 0;
      const plan = Model.plan(session, { ...options, visibleElapsed });
      const changed = !last || last.program !== plan.program || last.kind !== plan.kind;
      const blend = changed && plan.active && plan.animate;
      const before = blend ? capture() : [];
      const oldProps = blend ? retainProps() : null;
      if (changed || !plan.animate) stopBridge();
      // No DOM writes for unchanged snapshots: animation timelines stay alive.
      if (changed) {
        // The hands must stay above their held objects: putting the laptop or
        // folio in front would hide the new wrist choreography completely.
        back.innerHTML = plan.active ? (PROPS[plan.kind] || '') + (EXTRA[plan.program] || '') : '';
        front.innerHTML = '';
        layer.dataset.kind = plan.kind;
        layer.dataset.program = plan.program;
        actorNode.dataset.performance = plan.kind;
        actorNode.dataset.performanceProgram = plan.program;
      }
      if (!last || last.key !== plan.key) {
        layer.dataset.variant = String(plan.variant);
        layer.style.setProperty('--ap-offset', plan.phaseOffset + 'ms');
      }
      if (!last || last.animate !== plan.animate) layer.dataset.animate = String(plan.animate);
      if (!last || last.active !== plan.active) {
        layer.hidden = !plan.active;
        body.classList.toggle('has-avatar-performance', plan.active);
      }
      if (blend) {
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
      }
      last = plan;
      return plan;
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopBridge();
      visibleClocks.clear();
      body.classList.remove('has-avatar-performance');
      delete actorNode.dataset.performance;
      delete actorNode.dataset.performanceProgram;
      layer.remove();
      last = null;
    }
    return Object.freeze({ update, destroy, get plan() { return last; } });
  }
  return Object.freeze({ create });
});
