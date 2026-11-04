/* Local window light and a decorative harbour. Never changes agent state. */
(function (root) {
  'use strict';
  const CLOCK_DIGITS = Object.freeze({
    0: '.##./#..#/#..#/#..#/#..#/#..#/.##.',
    1: '.#../##../.#../.#../.#../.#../###.',
    2: '.##./#..#/...#/..#./.#../#.../####',
    3: '###./...#/...#/.##./...#/...#/###.',
    4: '..#./.##./#.#./#.#./####/..#./..#.',
    5: '####/#.../#.../###./...#/...#/###.',
    6: '.##./#.../#.../###./#..#/#..#/.##.',
    7: '####/...#/..#./..#./.#../.#../.#..',
    8: '.##./#..#/#..#/.##./#..#/#..#/.##.',
    9: '.##./#..#/#..#/.###/...#/...#/.##.',
    ':': '././#/./#/./.'
  });
  function pixelClock(clock, value) {
    let x = 0, d = '';
    for (const digit of value) {
      const rows = CLOCK_DIGITS[digit].split('/');
      rows.forEach((row, y) => Array.from(row).forEach((pixel, i) => {
        if (pixel === '#') d += `M${x + i} ${y}h1v1h-1z`;
      }));
      x += rows[0].length + 1;
    }
    const artwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x - 1} 7" shape-rendering="crispEdges"><path fill="#fff2c4" d="${d}"/></svg>`;
    clock.style.setProperty('--clock-pixels', `url("data:image/svg+xml,${encodeURIComponent(artwork)}")`);
    clock.dataset.pixelClock = '';
  }
  function artwork(id) {
    return `<svg viewBox="0 0 200 330" preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <defs><linearGradient id="${id}-sky" x2="0" y2="1"><stop class="sky-top"/><stop offset="1" class="sky-bottom"/></linearGradient><linearGradient id="${id}-sea" x2="0" y2="1"><stop class="water-top"/><stop offset="1" stop-color="#263c48"/></linearGradient></defs>
      <path fill="url(#${id}-sky)" d="M0 0h200v330H0z"/>
      <path class="harbour-stars" fill="#fff0c7" d="M20 66h2v2h2v2h-2v2h-2v-2h-2v-2h2zm66-30h2v2h-2zm52 26h2v2h-2zm38-32h2v2h-2zm-116 76h2v2h-2zm100 2h2v2h-2z"/>
      <path class="harbour-sun" fill="#ffe6ab" d="M-8-14H8v4h4v4h2V6h-2v4H8v4H-8v-4h-4V6h-2V-6h2v-4h4z"/>
      <path class="harbour-moon" fill="#fff1ce" d="M146 46h6v4h-6v6h-2v6h4v4h6v2h8v4h-4v4h-14v-4h-4v-4h-4V56h4v-6h6z"/>
      <g class="harbour-cloud cloud-back" fill="#fff4df" opacity=".22"><path d="M-50 88h8v-4h6v-4h14v4h14v-2H6v4h8v4h-64z"/><path d="M94 44h8v-4h8v-4h10v4h16v-2h8v4h6v4H94z"/></g>
      <path class="harbour-mountain" d="M0 168 17 153 31 158 58 137 76 147 91 141 113 157 132 145 154 158 177 143 200 157v173H0z"/>
      <path fill="url(#${id}-sea)" d="M0 211h200v119H0z"/>
      <g class="harbour-city"><path d="M0 217v-37h12v-17h6v54h8v-48h12v-19h4v67h6v-30h14v30h9v-45h11v-28h3v-22h3v22h3v28h10v45h9v-35h9v-20h4v55h8v-31h12v31h7v-47l8-13 8 13v47h8v-35h11v35h10v-27h14v27z"/>
      <path class="harbour-lights" d="M3 184h5v3H3zm0 9h5v3H3zm28-15h5v3h-5zm0 10h5v3h-5zm22 5h5v3h-5zm23-13h5v3h-5zm12-14h5v3h-5zm0 12h5v3h-5zm8 13h5v3h-5zm17 1h5v3h-5zm21 1h5v3h-5zm20-13h5v3h-5zm0 10h5v3h-5zm23 0h5v3h-5z" fill="#ffe0a0"/></g>
      <g class="harbour-reflections" stroke="#ffe0a0" stroke-width="1" opacity=".3"><path d="M5 232h18m-8 7h21m-31 8h19m37-18h12m-8 7h27m-21 9h16m49-11h22m-13 7h23m-18 8h10"/></g>
      <g class="harbour-ferry"><path d="M0 0h38v2h-4v4h-4v2H6V6H2V2H0z" fill="#e8d5a7"/><path d="M6-8h24v8H6z" fill="#497b69"/><path d="M10-6h4v4h-4zm8 0h4v4h-4zm8 0h2v4h-2z" fill="#f8e6b7"/><path d="M-10 12h36v2H-10zm-10 4h12v2h-12z" fill="#e9e0bc" opacity=".35"/></g>
      <g class="harbour-cloud cloud-front" fill="#fff1da" opacity=".15"><path d="M20 118h10v-4h10v-4h14v4h14v-2h12v4h6v6H20z"/></g>
    </svg>`;
  }
  function create({ office, world, layer }) {
    const modes = root.OfficeDayCycle.MODES;
    const views = modes.map((mode, index) => {
      const view = document.createElement('div');
      view.className = 'harbour-view';
      view.innerHTML = artwork('harbour-' + index);
      view.dataset.time = mode;
      layer.append(view);
      return view;
    });
    // Full room paintings already contain their own outdoor scene. The door
    // gets the same bounded, transparent light as the main glass, with a
    // separate surface per phase so an interrupted preview never repaints an
    // outgoing gradient. These surfaces have no animation loop or timer.
    const door = world.querySelector('.door-window');
    const doorViews = modes.map(mode => {
      const view = document.createElement('i');
      view.className = 'door-theme-wash';
      view.dataset.time = mode;
      view.setAttribute('aria-hidden', 'true');
      if (door) door.append(view);
      return view;
    });
    let first = true;
    function paintLight(view, state) {
      for (const key of ['skyTop', 'skyBottom', 'water', 'skyline']) view.style.setProperty('--' + key, state[key]);
      // Preserve at least 80% of the painted scene even in the darkest phase.
      const shade = Number.isFinite(state.roomShade) ? state.roomShade : 0;
      view.style.setProperty('--theme-wash-alpha', String(Math.min(.2, Math.max(.045, .045 + shade * .36))));
    }
    function paint(view, state) {
      paintLight(view, state);
      view.querySelector('.harbour-sun').style.transform = `translate(${Math.round(state.sunX) * 2}px,${Math.round(state.sunY * 1.65) * 2}px)`;
      view.querySelector('.harbour-sun').style.opacity = state.sunOpacity;
      view.querySelector('.harbour-moon').style.opacity = state.moonOpacity;
      view.querySelector('.harbour-stars').style.opacity = state.starsOpacity;
      view.querySelector('.harbour-lights').style.opacity = state.windowGlow;
      view.querySelector('.harbour-reflections').style.opacity = .1 + state.windowGlow * .4;
    }
    // Give each preview its own surface. Even repeated changes mid-fade keep
    // the current presentation values, without repainting an outgoing sky.
    views.forEach((view, index) => {
      const state = root.OfficeDayCycle.at(Date.now(), {sceneTime:modes[index]});
      paint(view, state);
      paintLight(doorViews[index], state);
    });
    function updateClock(settings, language, now = Date.now(), state = root.OfficeDayCycle.at(now, settings)) {
      const clock = document.getElementById('hk-clock');
      if (clock.textContent !== state.clock) {
        clock.textContent = state.clock;
        if (clock.dataset) pixelClock(clock, state.clock);
      }
      clock.dateTime = new Date(now).toISOString();
      const calendar = document.getElementById('hk-date');
      calendar.textContent = language === 'en' ? state.dateEn : state.dateZh;
      calendar.dateTime = state.dateIso;
      const [hour, minute] = state.clock.split(':').map(Number);
      document.querySelector('.wall-hour').style.transform = 'rotate(' + ((hour % 12) * 30 + minute / 2) + 'deg)';
      document.querySelector('.wall-minute').style.transform = 'rotate(' + (minute * 6) + 'deg)';
      const label = language === 'en' ? state.labelEn : state.labelZh;
      document.getElementById('day-phase').textContent = label + (state.preview ? (language === 'en' ? ' · Preview' : ' · 预览') : '');
      const button = document.getElementById('day-clock');
      button.setAttribute('aria-label', (language === 'en' ? 'Hong Kong time ' : '香港时间 ') + state.clock + ' · ' + calendar.textContent + ' · ' + label + (state.preview ? (language === 'en' ? ', time preview' : '，时段预览') : ''));
      button.querySelector('.day-clock-icon').textContent = state.night ? '☾' : '☀';
      document.getElementById('day-reset').hidden = !state.preview;
      return state;
    }
    function update(settings, language, now = Date.now()) {
      const state = root.OfficeDayCycle.at(now, settings);
      office.dataset.dayPhase = state.phase;
      office.dataset.night = String(state.night);
      office.dataset.timePreview = String(state.preview);
      const mode = state.preview ? state.phase : 'auto';
      if (!state.preview) { paint(views[0], state); paintLight(doorViews[0], state); }
      for (const view of [...views, ...doorViews]) view.dataset.visible = String(view.dataset.time === mode);
      world.querySelector('.scene-night').style.opacity = state.roomShade;
      world.querySelector('.scene-lamplight').style.opacity = state.lamplight;
      world.style.setProperty('--door-sky', state.skyBottom);
      world.style.setProperty('--door-sky-top', state.skyTop);
      world.style.setProperty('--door-city', state.skyline);
      world.querySelector('.door-window-lights').style.opacity = state.windowGlow;
      updateClock(settings, language, now, state);
      if (first) { layer.dataset.ready = 'true'; first = false; }
      return state;
    }
    return { update, updateClock, destroy() { layer.replaceChildren(); for (const view of doorViews) view.remove(); } };
  }
  root.OfficeDayScenery = Object.freeze({ create });
})(window);
