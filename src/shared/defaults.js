/* Shared settings model + storage helpers (popup, background and content script). */
(function (g) {
  var api = typeof browser !== 'undefined' ? browser : chrome;
  var KEY = 'nc';
  var DEFAULTS = {
    enabled: true,
    applyTo: 'all',           // 'all' (except excluded sites) | 'listed' (only enabled sites)
    face: 'system',           // 'system' | 'light' | 'dark'  (shared by popup and pages; AMOLED forces dark)
    theme: 'arcadia',
    elements: { bg: true, text: true, accentText: true, accentBg: true, borders: true, icons: true, shadows: true, selection: true },   // what gets themed
    brightness: 100, contrast: 100, sepia: 0, grayscale: 0,
    imageMode: 'smart',       // 'smart' | 'dim' | 'off'
    imageDim: 15,
    invertLogos: true,
    invertDiagrams: true,
    custom: {                 // the Custom theme: your own colours, one palette per face (11 colours each, same order as themes.js)
      init: false, prev: '',
      d: ['#1F1D1B', '#2B2825', '#38342F', '#B5A688', '#4A4540', '#1C1B1A', '#DCC9A9', '#B83A2D', '#4E6851', '#E8A04A', '#223027'],
      l: ['#DCC9A9', '#F3E8CF', '#CDB88F', '#4A4237', '#1C1B1A', '#1C1B1A', '#DCC9A9', '#B83A2D', '#4E6851', '#E8A04A', '#223027']
    },
    siteRules: {},            // host -> { enabled: bool }
    ui: { style: 'arcadia', textSize: 100, backdrop: 'dots', backdropStrength: 40 }
  };
  function merge(saved) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!saved || typeof saved !== 'object') return out;
    Object.keys(saved).forEach(function (k) {
      if (k === 'ui' && saved.ui && typeof saved.ui === 'object') {
        ['style', 'textSize', 'backdrop', 'backdropStrength'].forEach(function (u) { if (u in saved.ui) out.ui[u] = saved.ui[u]; });
        if (saved.face === undefined && saved.ui.face) out.face = saved.ui.face;     // migrate v1.0
      } else if (k === 'custom') {
        var sc = saved.custom, hx = /^#[0-9a-fA-F]{6}$/;
        if (sc && typeof sc === 'object') {
          ['d', 'l'].forEach(function (f) { var a = sc[f]; if (Array.isArray(a) && a.length === 11 && a.every(function (x) { return typeof x === 'string' && hx.test(x); })) out.custom[f] = a.map(function (x) { return x.toLowerCase(); }); });
          out.custom.init = sc.init === true; out.custom.prev = typeof sc.prev === 'string' ? sc.prev : '';
        }
      } else if (k === 'elements' && saved.elements && typeof saved.elements === 'object') {
        Object.keys(out.elements).forEach(function (e) { if (typeof saved.elements[e] === 'boolean') out.elements[e] = saved.elements[e]; });
      } else if (k === 'accents') {
        if (saved.accents === false) { out.elements.accentText = false; out.elements.accentBg = false; }   // migrate the earlier single switch
      } else if (k in out && k !== 'ui' && k !== 'elements' && k !== 'custom') out[k] = saved[k];
    });
    if (['system', 'light', 'dark'].indexOf(out.face) < 0) out.face = 'system';
    var rules = {};
    Object.keys(out.siteRules || {}).forEach(function (h) {
      var r = out.siteRules[h];
      if (r && typeof r.enabled === 'boolean') rules[h] = { enabled: r.enabled };   // v1.0 engine/force flags are gone
    });
    out.siteRules = rules;
    if (g.NC_applyCustom) g.NC_applyCustom(out.custom);
    return out;
  }
  function load() {
    return api.storage.local.get(KEY).then(function (r) { return merge(r && r[KEY]); }).catch(function () { return merge(null); });
  }
  function save(s) { var o = {}; o[KEY] = s; return api.storage.local.set(o); }
  /* longest-suffix match: sub.example.com falls back to example.com */
  function ruleFor(rules, host) {
    if (!host) return null;
    var parts = host.split('.');
    var min = Math.min(2, parts.length);
    for (var i = 0; parts.length - i >= min; i++) {
      var h = parts.slice(i).join('.');
      if (rules[h]) return { host: h, rule: rules[h] };
    }
    return null;
  }
  function decide(s, host) {
    if (!s.enabled) return { active: false, reason: 'global-off' };
    var m = ruleFor(s.siteRules || {}, host);
    var r = m && m.rule;
    var on = r && typeof r.enabled === 'boolean' ? r.enabled : s.applyTo === 'all';
    if (!on) return { active: false, reason: 'site-off', rule: r, ruleHost: m && m.host };
    return { active: true, rule: r, ruleHost: m && m.host };
  }
  g.NC = { api: api, KEY: KEY, DEFAULTS: DEFAULTS, merge: merge, load: load, save: save, ruleFor: ruleFor, decide: decide };
})(typeof globalThis !== 'undefined' ? globalThis : this);
