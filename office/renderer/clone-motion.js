/* Local, finite clone effects. Character artwork remains an external image. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCloneMotion = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';

  function burst({ anchor, kind = 'split', ownerId = '', asset = '' } = {}) {
    if (!anchor || !anchor.ownerDocument) throw new TypeError('A clone effect needs its actual scene anchor.');
    const document = anchor.ownerDocument;
    const node = document.createElement('span');
    node.className = 'clone-effect'; node.dataset.cloneEffect = kind; node.dataset.ownerId = ownerId;
    node.setAttribute('aria-hidden', 'true');
    const motions = [];
    const run = (element, frames) => motions.push(element.animate(frames, { duration: 240, easing: EASE_OUT }));
    const ring = document.createElement('i'); ring.className = 'clone-ring'; node.append(ring);
    for (let index = 0; index < 5; index++) {
      const puff = document.createElement('i'); puff.className = 'clone-smoke';
      puff.style.left = (-47 + index * 19) + 'px'; puff.style.top = (-71 + Math.abs(index - 2) * 8) + 'px';
      node.append(puff);
    }
    if (asset) {
      const echo = document.createElement('span'); echo.className = 'clone-echo';
      const image = document.createElement('img'); image.src = asset; image.alt = ''; image.draggable = false;
      echo.append(image); node.append(echo);
    }
    anchor.append(node);
    run(ring, [{ transform: 'scale(.95)', opacity: 0 }, { opacity: .7, offset: .2 }, { transform: 'scale(1.18)', opacity: 0 }]);
    [...node.querySelectorAll('.clone-smoke')].forEach((puff, index) => {
      const direction = index - 2;
      const outward = 'translate3d(' + (direction * 8) + 'px,' + (-7 - Math.abs(direction) * 2) + 'px,0) scale(1.13)';
      const inward = 'translate3d(' + (direction * 2) + 'px,2px,0) scale(.95)';
      run(puff, kind === 'absorb'
        ? [{ transform: outward, opacity: 0 }, { opacity: .8, offset: .25 }, { transform: inward, opacity: 0 }]
        : [{ transform: inward, opacity: 0 }, { opacity: .8, offset: .2 }, { transform: outward, opacity: 0 }]);
    });
    const echo = node.querySelector('.clone-echo');
    if (echo) run(echo, kind === 'absorb'
      ? [{ transform: 'translate3d(8px,-2px,0) scale(.97)', opacity: .36 }, { transform: 'translate3d(0,0,0) scale(1)', opacity: 0 }]
      : [{ transform: 'translate3d(0,0,0) scale(1)', opacity: .4 }, { transform: 'translate3d(-8px,-2px,0) scale(.97)', opacity: 0 }]);
    let cleaned = false;
    function cancel() {
      if (cleaned) return;
      cleaned = true;
      for (const motion of motions) motion.cancel();
      node.remove();
    }
    const finished = Promise.all(motions.map(motion => motion.finished.catch(() => {}))).finally(cancel);
    return Object.freeze({ finished, cancel });
  }
  return Object.freeze({ burst });
});
