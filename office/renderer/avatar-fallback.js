/* Original capsule robot. Broken external artwork never owns body visibility. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAvatarFallback = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let serial = 0;
  // Authored from the public preview capsule, adapted to the existing crop
  // coordinates. No external sprite markup or sampled character pixels.
  const NATIVE_BODY = '<path class="af-shell" fill="#de886d" stroke="#294751" stroke-width="1.4" d="M52 81Q52 70 64 70H91Q103 70 103 81V98Q103 105 92 105H63Q52 105 52 98Z"/>'
    + '<path fill="none" stroke="#f4dfbb" stroke-width="1.4" d="M57 92V81Q57 77 62 77H93Q98 77 98 81V92"/>'
    + '<path fill="#294751" d="M71 99H84V102H71Z"/>'
    + '<rect class="af-eye" fill="#203a43" x="60.5" y="81" width="4" height="8" rx="2"/><rect class="af-eye" fill="#203a43" x="90.5" y="81" width="4" height="8" rx="2"/>'
    + [45,110].map(x => '<circle class="af-hand-fill" fill="#de886d" cx="'+x+'" cy="90" r="4.2"/><circle class="af-hand-ring" fill="none" stroke="#294751" stroke-width="1.2" cx="'+x+'" cy="90" r="4.2"/>').join('')
    + [55,65,85,95].map(x => '<path class="af-foot" fill="#de886d" stroke="#294751" stroke-width=".8" d="M'+x+' 105h5v8q0 2-2.5 2t-2.5-2Z"/>').join('');
  function create({ actorNode, body, image } = {}) {
    if (!body?.ownerDocument || !actorNode) throw new TypeError('A fallback needs its existing actor and character body.');
    image = image || body.querySelector('img');
    const rig = body.querySelector('.ap-rig'), source = rig?.querySelector('defs image');
    if (!image || !source?.id) throw new TypeError('Create the existing performance rig and bitmap before its fallback.');
    const document = body.ownerDocument, view = document.defaultView;
    // Native designs fill their eye cut-outs with an unanimated surface path.
    // The failure capsule needs its own orange surface there; legacy artwork
    // has a <use> instead and keeps its existing source-reference ownership.
    const eyePatch = rig.querySelector('.ap-torso > g > path'), eyePatchFill = eyePatch?.getAttribute('fill');
    const fallbackId = 'office-native-body-' + (++serial);
    const native = document.createElementNS(NS, 'g');
    native.id = fallbackId; native.setAttribute('class', 'avatar-fallback-source'); native.innerHTML = NATIVE_BODY;
    source.parentNode.append(native);
    const references = [...rig.querySelectorAll('use')].filter(use => (use.getAttribute('href') || '').split('#').at(-1) === source.id)
      .map(use => {
        const backup = document.createElementNS(NS, 'use');
        backup.setAttribute('href', '#'+fallbackId);
        const clip = use.getAttribute('clip-path'); if (clip) backup.setAttribute('clip-path', clip);
        backup.setAttribute('class', 'avatar-fallback-joint'); backup.style.opacity = '0';
        use.parentNode.insertBefore(backup, use);
        return { use, backup, href: use.getAttribute('href'), opacity: use.style.getPropertyValue('opacity') };
      });
    const bitmap = document.createElementNS(NS, 'svg');
    bitmap.setAttribute('class', 'avatar-native-fallback'); bitmap.setAttribute('viewBox', '0 0 154 129');
    bitmap.setAttribute('aria-hidden', 'true'); bitmap.setAttribute('focusable', 'false');
    const base = document.createElementNS(NS, 'g'), outgoing = document.createElementNS(NS, 'g');
    base.setAttribute('class', 'avatar-fallback-base'); outgoing.setAttribute('class', 'avatar-fallback-outgoing');
    base.innerHTML = NATIVE_BODY; outgoing.innerHTML = NATIVE_BODY; outgoing.style.opacity = '0';
    bitmap.append(base, outgoing);
    body.insertBefore(bitmap, body.querySelector('.avatar-performance'));
    let destroyed = false, bitmapHealth = image.complete && image.naturalWidth > 0 ? 'healthy' : 'pending', rigHealth = 'pending';
    let rigMode = '', bitmapMode = '', rigEpoch = 0, bitmapEpoch = 0, lastRetry = 0, retrySerial = 0;
    let failedAt = 0;
    const trustedHref = source.getAttribute('href'), initialHealthAlpha = image.style.getPropertyValue('--avatar-art-alpha');
    // Also handles a controller attached after the SVG's cached load event.
    // This is one local resource probe, never a polling or timer loop.
    const probe = document.createElement?.('img');
    image.classList.add('avatar-fallback-managed');
    const mirrors = new Map(), rigFades = new Set(), bitmapFades = new Set();
    const attribute = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    function paintEyePatch(native) {
      if (!eyePatch) return;
      const fill = native ? '#de886d' : eyePatchFill;
      if (fill !== null) attribute(eyePatch, 'fill', fill);
      else if (eyePatch.getAttribute('fill') !== null) eyePatch.removeAttribute('fill');
    }
    const style = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
    const read = (node, property, fallback = 1) => {
      const computed = view?.getComputedStyle?.(node);
      const value = property === 'opacity' ? computed?.opacity : computed?.getPropertyValue?.(property);
      const number = parseFloat(value || node.style.getPropertyValue(property)); return Number.isFinite(number) ? number : fallback;
    };
    const office = actorNode.closest?.('.office');
    const motionQuery = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    const quiet = () => Boolean(document.hidden || office?.dataset.hidden === 'true' || office?.dataset.reducedMotion === 'true' || office?.dataset.lowPower === 'true' || motionQuery?.matches);
    function cancelFades(group) {
      for (const motion of group) motion.cancel();
      group.clear();
    }
    function fade(group, node, property, from, to) {
      style(node, property, String(to));
      if (quiet() || typeof node.animate !== 'function') return;
      const motion = node.animate([{ [property]: String(from) }, { [property]: String(to) }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
      group.add(motion);
      motion.finished.catch(() => {}).then(() => { if (group.has(motion)) { group.delete(motion); motion.cancel(); } });
    }
    function paintRig(immediate = false) {
      const mode = rigHealth === 'healthy' ? 'external' : 'native';
      if (mode === rigMode && !immediate) return;
      paintEyePatch(mode === 'native');
      // Immediate/quiet handoffs already have exact target alphas. Reading
      // every cropped use first would synchronously resolve styles for a pose
      // that is about to be discarded, including initial missing artwork.
      const immediateMode = immediate || quiet() || !rigMode;
      const before = immediateMode ? null : references.map(({ use, backup }) => ({ main: read(use,'opacity'), backup: read(backup,'opacity',0) }));
      cancelFades(rigFades); const epoch = ++rigEpoch;
      for (let i=0;i<references.length;i++) {
        const { use, backup, href } = references[i], from = before?.[i];
        if (immediateMode) {
          attribute(use,'href',mode === 'external' ? href : '#'+fallbackId);
          style(use,'opacity','1'); style(backup,'opacity','0');
        } else if (mode === 'external') {
          // Transfer the composed native coverage to the backing use before
          // restoring the same original use. Its joint and clock never change.
          const coverage = 1-(1-from.main)*(1-from.backup);
          style(backup,'opacity',String(coverage)); style(use,'opacity','0'); attribute(use,'href',href);
          fade(rigFades,use,'opacity',0,1); fade(rigFades,backup,'opacity',coverage,0);
        } else {
          // If healing is interrupted, both uses now draw the same native
          // capsule at their actual alpha; no blank or neutral joint frame.
          attribute(use,'href','#'+fallbackId);
          fade(rigFades,use,'opacity',from.main,1); fade(rigFades,backup,'opacity',from.backup,0);
        }
      }
      rigMode = mode;
      Promise.all([...rigFades.keys()].map(a=>a.finished.catch(()=>{}))).then(()=>{if(!destroyed&&epoch===rigEpoch)attribute(body,'data-rig-healing','false');});
      attribute(body,'data-rig-healing',String(rigFades.size>0));
    }
    function paintBitmap(immediate = false) {
      const mode = bitmapHealth === 'healthy' ? 'external' : 'native';
      if (mode === bitmapMode && !immediate) return;
      const immediateMode = immediate || quiet() || !bitmapMode;
      const from = immediateMode ? null : { main: read(image,'--avatar-art-alpha',bitmapMode === 'external' ? 1 : 0), base: read(base,'opacity'), outgoing: read(outgoing,'opacity',0) };
      cancelFades(bitmapFades); const epoch = ++bitmapEpoch;
      attribute(bitmap,'data-active','true');
      if (immediateMode) {
        style(image,'--avatar-art-alpha',mode === 'external' ? '1' : '0');
        style(base,'opacity',mode === 'external' ? '0' : '1'); style(outgoing,'opacity','0');
      } else if (mode === 'external') {
        const coverage = 1-(1-from.base)*(1-from.outgoing);
        style(base,'opacity',String(coverage)); style(outgoing,'opacity','0'); style(image,'--avatar-art-alpha','0');
        fade(bitmapFades,image,'--avatar-art-alpha',0,1); fade(bitmapFades,base,'opacity',coverage,0);
      } else {
        // The missing bitmap's current share is replaced by a second native
        // drawing, so failure during a recovery fade stays fully recognisable.
        const coverage = 1-(1-from.outgoing)*(1-from.main);
        style(image,'--avatar-art-alpha','0'); style(outgoing,'opacity',String(coverage));
        fade(bitmapFades,base,'opacity',from.base,1); fade(bitmapFades,outgoing,'opacity',coverage,0);
      }
      bitmapMode = mode;
      Promise.all([...bitmapFades.keys()].map(a=>a.finished.catch(()=>{}))).then(()=>{
        if(destroyed || epoch!==bitmapEpoch)return;
        attribute(bitmap,'data-active',String(bitmapMode!=='external')); attribute(body,'data-bitmap-healing','false');
        if(bitmapMode==='external')clearMirrors();
      });
      attribute(body,'data-bitmap-healing',String(bitmapFades.size>0));
      if (!bitmapFades.size) attribute(bitmap,'data-active',String(mode!=='external'));
    }
    function clearMirrors() { for (const motion of mirrors.values()) motion.cancel(); mirrors.clear(); }
    let lastImageOpacity = image.style.getPropertyValue('opacity');
    function syncOpacity() {
      const target = image.style.getPropertyValue('opacity');
      lastImageOpacity = target;
      if (bitmapHealth === 'healthy' && !bitmapFades.size) { clearMirrors(); return; }
      // The bitmap's inline target plus its own finite WAAPI opacity fade are
      // mirrored, never its CSS clock or the rig's original animations.
      if (target) style(bitmap, 'opacity', target);
      else if (view?.getComputedStyle) style(bitmap, 'opacity', view.getComputedStyle(image).opacity);
      if (quiet()) { clearMirrors(); return; }
      const live = new Set((image.getAnimations?.() || []).filter(motion => motion.effect?.getKeyframes?.().some(frame => frame.opacity !== undefined)));
      for (const [original, copy] of mirrors) if (!live.has(original)) { copy.cancel(); mirrors.delete(original); }
      if (typeof bitmap.animate !== 'function') return;
      for (const original of live) {
        if (mirrors.has(original)) continue;
        const copy = bitmap.animate(original.effect.getKeyframes(), original.effect.getTiming());
        mirrors.set(original, copy);
        if (original.startTime !== null) copy.startTime = original.startTime;
        else if (original.currentTime !== null) copy.currentTime = original.currentTime;
        if (original.playState === 'paused') copy.pause();
        original.finished.catch(() => {}).then(() => {
          if (mirrors.get(original) !== copy) return;
          copy.cancel(); mirrors.delete(original);
        });
      }
    }
    function sync() {
      if (destroyed) return;
      const settle = quiet() && Boolean(rigFades.size || bitmapFades.size);
      paintRig(settle); paintBitmap(settle);
      attribute(body, 'data-bitmap-health', bitmapHealth); attribute(body, 'data-rig-health', rigHealth);
      syncOpacity();
    }
    const bitmapError = () => { bitmapHealth = 'failed'; sync(); };
    const bitmapLoad = () => { if (image.naturalWidth > 0) bitmapHealth = 'healthy'; sync(); };
    const rigError = () => { rigHealth = 'failed'; failedAt = Date.now(); sync(); };
    const rigLoad = () => { rigHealth = 'healthy'; sync(); };
    const probeLoad = () => { if (!destroyed && source.getAttribute('href') === trustedHref && rigHealth !== 'healthy') rigLoad(); };
    const probeError = () => { if (!destroyed && source.getAttribute('href') === trustedHref && rigHealth === 'pending') rigError(); };
    image.addEventListener('error', bitmapError); image.addEventListener('load', bitmapLoad);
    source.addEventListener('error', rigError); source.addEventListener('load', rigLoad);
    const observer = view?.MutationObserver ? new view.MutationObserver(records => {
      if (destroyed) return;
      let relevant = false;
      for (const record of records) {
        if (record.target === image) {
          if (record.attributeName === 'src') { bitmapHealth = image.complete && image.naturalWidth > 0 ? 'healthy' : 'pending'; relevant = true; }
          // Our own health alpha also writes image.style. Only a changed
          // presence target needs new opacity mirroring; do not observe our
          // health bookkeeping a second time.
          else if (record.attributeName !== 'style' || image.style.getPropertyValue('opacity') !== lastImageOpacity) relevant = true;
        } else if (record.target === source && ['href','xlink:href'].includes(record.attributeName)) { rigHealth = 'pending'; relevant = true; }
        else if (record.target === body || record.target === office) relevant = true;
      }
      if (relevant) sync();
    }) : null;
    // These are the resource and presence owners. A subtree observer also
    // wakes for every joint freeze/thaw, family tint and our own backing uses.
    observer?.observe(image, { attributes: true, attributeFilter: ['src','style','class','hidden'] });
    observer?.observe(source, { attributes: true, attributeFilter: ['href','xlink:href'] });
    observer?.observe(body, { attributes: true, attributeFilter: ['class'] });
    if (office) observer?.observe(office,{attributes:true,attributeFilter:['data-reduced-motion','data-low-power','data-hidden']});
    document.addEventListener?.('visibilitychange',sync);
    motionQuery?.addEventListener?.('change',sync);
    sync();
    if (probe) {
      let url;try{url=new URL(trustedHref,document.baseURI||document.URL);}catch(_){}
      if(url?.protocol==='file:'){probe.addEventListener('load',probeLoad);probe.addEventListener('error',probeError);probe.src=url.href;}
    }
    return Object.freeze({ sync, retry(now = Date.now()) {
      sync();
      if(destroyed || rigHealth!=='failed' || !Number.isFinite(now) || now-failedAt<3000 || now-lastRetry<3000)return false;
      let url;try{url=new URL(trustedHref,document.baseURI||document.URL);}catch(_){return false;}
      if(url.protocol!=='file:')return false;
      lastRetry=now;rigHealth='pending';sync();
      url.searchParams.set('mini-office-art-retry',String(++retrySerial));source.setAttribute('href',url.href);return true;
    }, state: () => ({ destroyed, bitmap: bitmapHealth, rig: rigHealth, mirrors: mirrors.size, healing:rigFades.size+bitmapFades.size }), destroy() {
      if (destroyed) return; destroyed = true;
      observer?.disconnect();document.removeEventListener?.('visibilitychange',sync);motionQuery?.removeEventListener?.('change',sync);clearMirrors();cancelFades(rigFades);cancelFades(bitmapFades);rigEpoch++;bitmapEpoch++;
      if(probe){probe.removeEventListener('load',probeLoad);probe.removeEventListener('error',probeError);probe.removeAttribute('src');}
      image.removeEventListener('error', bitmapError); image.removeEventListener('load', bitmapLoad);
      source.removeEventListener('error', rigError); source.removeEventListener('load', rigLoad);
      for (const { use, backup, href, opacity } of references) {
        if (use.getAttribute('href') === '#'+fallbackId) use.setAttribute('href', href);
        if(opacity)use.style.setProperty('opacity',opacity);else use.style.removeProperty('opacity');
        backup.remove();
      }
      paintEyePatch(false);
      image.classList.remove('avatar-fallback-managed');
      if(initialHealthAlpha)image.style.setProperty('--avatar-art-alpha',initialHealthAlpha);else image.style.removeProperty('--avatar-art-alpha');
      native.remove(); bitmap.remove();
      delete body.dataset.bitmapHealth; delete body.dataset.rigHealth;delete body.dataset.bitmapHealing;delete body.dataset.rigHealing;
    } });
  }
  return Object.freeze({ create });
});
