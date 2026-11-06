/* Pointer presentation for existing controls. Native dialog and disclosure
 * behavior owns focus, keyboard access and dismissal. */
(function () {
  'use strict';
  const office = document.getElementById('office');
  if (!office) return;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const quietFlags = ['data-reduced-motion', 'data-low-power', 'data-hidden'];
  const pressable = 'button:is(.button,.icon-button,.language-button,.mode-button,.attention-button,.attention-jump,.roster-button,.dialog-close,.close-inspector),summary.festival-summary';
  const triggers = {
    'settings-button': 'settings-dialog',
    'day-clock': 'settings-dialog',
    'connections-button': 'connections-dialog',
    'roster-button': 'roster-dialog',
    'usage-history-button': 'usage-history-dialog',
    'manual-questions-button': 'manual-questions-dialog'
  };
  const triggerSelector = Object.keys(triggers).map(id => '#' + id).join(',');
  const live = new Map();
  let press = null, pending = 0, cueFrame = 0;

  function enabled() {
    return root.dataset.avatarStyle === 'pixel' && !document.hidden && !reduce.matches &&
      !quietFlags.some(flag => office.getAttribute(flag) === 'true');
  }

  function release() {
    press?.node.removeAttribute('data-pixel-pressed');
    press = null;
  }

  function stop(surface) {
    const record = live.get(surface);
    if (!record) return;
    live.delete(surface);
    for (const animation of record.animations) animation.cancel();
  }

  function clear() {
    release();
    if (pending) cancelAnimationFrame(pending);
    pending = 0;
    if (cueFrame) cancelAnimationFrame(cueFrame);
    cueFrame = 0;
    delete office.dataset.pixelKeyboardCue;
    for (const surface of live.keys()) stop(surface);
  }

  function open(surface) {
    return surface.isConnected && (surface.id === 'inspector' ? !surface.hidden : surface.open);
  }

  const changes = new MutationObserver(() => {
    if (!enabled()) clear();
    else for (const surface of live.keys()) if (!open(surface)) stop(surface);
  });
  changes.observe(root, { attributes: true, attributeFilter: ['data-avatar-style'] });
  changes.observe(office, { attributes: true, attributeFilter: quietFlags });

  function panelFor(trigger) {
    if (trigger.matches('.festival-summary')) {
      const surface = trigger.closest('.festival-chooser');
      return surface && { surface, panel: surface.querySelector('.festival-panel'), kind: 'popover' };
    }
    if (trigger.matches('.actor-button,.roster-row,#attention-jump,#other-attention')) {
      const panel = document.getElementById('inspector');
      return { surface: panel, panel, kind: 'inspector' };
    }
    const panel = document.getElementById(triggers[trigger.id]);
    return { surface: panel, panel, kind: panel?.matches('.settings-dialog,.connections-dialog') ? 'dock' : 'dialog' };
  }

  const entrance = {
    dialog: { opacity: .4, transform: 'translateY(8px) scale(.97)', duration: 240, steps: 7 },
    dock: { opacity: .48, transform: 'translateY(-6px) scale(.98)', duration: 220, steps: 6 },
    popover: { opacity: .56, transform: 'translateY(-4px) scale(.97)', duration: 160, steps: 5 },
    inspector: { opacity: .65, transform: 'translateY(4px)', duration: 160, steps: 5 }
  };
  function reveal({ surface, panel, kind }, trigger) {
    if (!enabled() || !open(surface)) return;
    stop(surface);
    const { opacity, transform, duration, steps } = entrance[kind];
    const start = { opacity, transform }, end = { opacity: 1, transform: 'none' };
    if (kind === 'popover' || kind === 'dock') {
      const button = trigger.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      const x = Math.max(0, Math.min(bounds.width, button.left + button.width / 2 - bounds.left));
      start.transformOrigin = end.transformOrigin = Math.round(x) + 'px 0';
    }
    const timing = { duration, easing: 'steps(' + steps + ', end)' };
    const motion = panel.animate([start, end], timing);
    motion.id = 'pixel-ui-' + kind;
    const animations = [motion];
    if (surface instanceof HTMLDialogElement) {
      const backdrop = surface.animate([{ opacity: .45 }, { opacity: 1 }], { ...timing, pseudoElement: '::backdrop' });
      backdrop.id = 'pixel-ui-backdrop';
      animations.push(backdrop);
    }
    const record = { animations };
    live.set(surface, record);
    changes.observe(surface, { attributes: true, attributeFilter: ['open', 'hidden'] });
    Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (live.get(surface) === record) stop(surface);
    });
  }

  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted || !enabled() || event.button !== 0 || !event.isPrimary) return;
    const node = event.target.closest?.(pressable);
    if (!node || !(office.contains(node) || node.closest('.manual-questions-dialog')) || node.matches(':disabled,[aria-disabled="true"]')) return;
    release();
    press = { node, pointer: event.pointerId };
    node.setAttribute('data-pixel-pressed', '');
  }, true);
  function pointerEnded(event) {
    if (press?.pointer === event.pointerId) release();
  }
  window.addEventListener('pointerup', pointerEnded, true);
  window.addEventListener('pointercancel', pointerEnded, true);

  document.addEventListener('click', event => {
    if (!event.isTrusted || !enabled() || event.button !== 0) return;
    if (event.detail < 1) {
      if (!event.target.closest?.('#greet-agent,.visitor .actor-button')) return;
      office.dataset.pixelKeyboardCue = 'true';
      if (cueFrame) cancelAnimationFrame(cueFrame);
      // Keep transition suppression through the click's first painted state.
      cueFrame = requestAnimationFrame(() => {
        cueFrame = requestAnimationFrame(() => {
          cueFrame = 0;
          delete office.dataset.pixelKeyboardCue;
        });
      });
      return;
    }
    const trigger = event.target.closest?.(triggerSelector + ',.actor-button,.roster-row,#attention-jump,#other-attention,.festival-summary');
    if (!trigger || !office.contains(trigger)) return;
    const target = panelFor(trigger);
    if (!target?.panel || open(target.surface)) return;
    if (pending) cancelAnimationFrame(pending);
    // Run after the click's own action, including the native details toggle.
    // The new surface stays interactive even during its first painted cel.
    pending = requestAnimationFrame(() => {
      pending = 0;
      reveal(target, trigger);
    });
  }, true);
  document.addEventListener('keydown', clear, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  reduce.addEventListener('change', () => { if (reduce.matches) clear(); });
  window.addEventListener('blur', clear);
  window.addEventListener('beforeunload', clear, { once: true });
})();
