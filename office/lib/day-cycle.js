/* A decorative Hong Kong day. No timers, weather claims or agent state. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeDayCycle = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const TIME_ZONE = 'Asia/Hong_Kong';
  const MODES = Object.freeze(['auto', 'dawn', 'morning', 'afternoon', 'sunset', 'night']);
  const LABELS = Object.freeze({
    dawn: Object.freeze(['晨曦', 'Dawn']), morning: Object.freeze(['上午', 'Morning']),
    afternoon: Object.freeze(['午后', 'Afternoon']), sunset: Object.freeze(['日落', 'Sunset']),
    night: Object.freeze(['夜晚', 'Night'])
  });
  const PREVIEW_HOURS = Object.freeze({ dawn: 6, morning: 9, afternoon: 14, sunset: 18, night: 22 });
  const MONTHS_EN = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  const WEEKDAYS_ZH = Object.freeze({ Mon: '星期一', Tue: '星期二', Wed: '星期三', Thu: '星期四', Fri: '星期五', Sat: '星期六', Sun: '星期日' });
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  // Keyframes describe art direction rather than astronomical sunrise times.
  // Duplicate midnight endpoints make every rendered value continuous at 00:00.
  const KEYFRAMES = Object.freeze([
    [0, '#142343', '#314768', '#263f59', '#172b3c', .88, .42, .91, .86],
    [5, '#293653', '#877f99', '#526779', '#2c4051', .68, .32, .79, .38],
    [6, '#b1b4ca', '#f1bfa2', '#9ba8a7', '#65747a', .28, .17, .57, .08],
    [9, '#83b9cf', '#e2e7d1', '#72a5b2', '#627c84', .02, .035, .3, 0],
    [14, '#659fbf', '#d8ddd1', '#6194a6', '#557482', 0, .025, .26, 0],
    [18, '#a78cae', '#f4ae78', '#ae8685', '#685d75', .43, .18, .68, 0],
    [20, '#26335a', '#78617c', '#45506c', '#26354b', .85, .37, .9, .62],
    [24, '#142343', '#314768', '#263f59', '#172b3c', .88, .42, .91, .86]
  ].map(frame => Object.freeze(frame)));
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const n = clamp(value); return n * n * (3 - 2 * n); };
  const mix = (a, b, amount) => a + (b - a) * amount;
  const round = value => Math.round(value * 10000) / 10000;
  function mixColor(from, to, amount) {
    const channels = [1, 3, 5].map(offset => Math.round(mix(parseInt(from.slice(offset, offset + 2), 16), parseInt(to.slice(offset, offset + 2), 16), amount)).toString(16).padStart(2, '0'));
    return '#' + channels.join('');
  }
  function phaseAt(hour) {
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 19) return 'sunset';
    return 'night';
  }
  function at(timestamp, options = {}) {
    const milliseconds = timestamp instanceof Date ? timestamp.getTime()
      : typeof timestamp === 'number' ? timestamp : typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(milliseconds)) throw new TypeError('A valid timestamp is required for the Hong Kong day');
    const date = new Date(milliseconds);
    if (!Number.isFinite(date.getTime())) throw new TypeError('A valid timestamp is required for the Hong Kong day');
    const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const clock = parts.hour + ':' + parts.minute;
    const dateIso = parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day;
    const dateZh = parts.year + '年' + Number(parts.month) + '月' + Number(parts.day) + '日 ' + WEEKDAYS_ZH[parts.weekday];
    const dateEn = parts.weekday + ', ' + Number(parts.day) + ' ' + MONTHS_EN[Number(parts.month) - 1] + ' ' + parts.year;
    const liveHour = Number(parts.hour) + Number(parts.minute) / 60 + Number(parts.second) / 3600 + date.getUTCMilliseconds() / 3600000;
    const selected = options && MODES.includes(options.sceneTime) ? options.sceneTime
      : options && options.night === true ? 'night' : 'auto';
    const preview = selected !== 'auto';
    const hour = preview ? PREVIEW_HOURS[selected] : liveHour;
    const phase = phaseAt(hour);
    const index = KEYFRAMES.findIndex(frame => frame[0] > hour);
    const start = KEYFRAMES[index - 1], end = KEYFRAMES[index];
    const amount = smooth((hour - start[0]) / (end[0] - start[0]));
    const orbit = (hour - 12) / 24 * Math.PI * 2;
    return {
      phase, clock, dateIso, dateZh, dateEn, labelZh: LABELS[phase][0], labelEn: LABELS[phase][1],
      preview, night: phase === 'night',
      skyTop: mixColor(start[1], end[1], amount), skyBottom: mixColor(start[2], end[2], amount),
      water: mixColor(start[3], end[3], amount), skyline: mixColor(start[4], end[4], amount),
      windowGlow: round(mix(start[5], end[5], amount)),
      roomShade: round(mix(start[6], end[6], amount)),
      lamplight: round(mix(start[7], end[7], amount)),
      starsOpacity: round(mix(start[8], end[8], amount)),
      sunX: round(50 + Math.sin(orbit) * 36), sunY: round(62 - Math.max(0, Math.cos(orbit)) * 44),
      sunOpacity: round(smooth((hour - 5) / 1.25) * (1 - smooth((hour - 17.75) / 1.25))),
      moonOpacity: round(1 - smooth((hour - 4.5) / 2.5) + smooth((hour - 18) / 2))
    };
  }

  return Object.freeze({ TIME_ZONE, MODES, at });
});
