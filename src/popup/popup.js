/* Nightcade popup: one scrolling settings list (groups, rows, sheets, sub-pages), Arcadia + Cyberpunk. */
(function () {
  'use strict';
  var NC = globalThis.NC, api = NC.api, THEMES = globalThis.NC_THEMES, ICONS = globalThis.NCIcons;
  var S = null, tab = { id: null, url: '', host: '', restricted: true }, status = null, fileOk = true;
  var syncs = [], R = {}, root = document.documentElement;

  /* ---------------------------------------------------------------- tiny DOM helpers */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
    return e;
  }
  function ico(name) { return ICONS.svg(name, S ? S.ui.style : 'arcadia'); }
  function sticker(o) {
    var kids = Array.prototype.slice.call(arguments, 1);
    var sw = h(o.tag || 'button', { class: 'sw ' + (o.block ? 'block ' : '') + (o.small ? 'small ' : '') + (o.flat ? 'flat ' : '') + (o.cls || '') });
    if (sw.tagName === 'BUTTON') sw.type = 'button';
    var st = h('span', { class: 'st' }), inn = h('span', { class: 'in f-' + (o.fill || 'surface') });
    kids.forEach(function (k) { if (k != null) inn.append(k.nodeType ? k : document.createTextNode(k)); });
    st.append(inn); sw.append(st); sw.inn = inn; return sw;
  }
  function setFill(sw, f) { sw.inn.className = 'in f-' + f; }
  function reg(o) { syncs.push(o.sync); return o; }

  /* ---------------------------------------------------------------- persistence */
  var saveT = null;
  function persist(delay) { clearTimeout(saveT); saveT = setTimeout(function () { NC.save(S); }, delay || 0); }
  function commit(fn, delay) { fn(S); persist(delay); syncAll(); }
  function syncAll() { applyUI(); syncs.forEach(function (f) { f(); }); if (R.nores) applyFilter(R.inp ? R.inp.value : ''); }

  /* ---------------------------------------------------------------- theming of the popup itself */
  function lum(hex) {
    var v = [1, 3, 5].map(function (i) { var c = parseInt(hex.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); if (x < y) { var t = x; x = y; y = t; } return (x + 0.05) / (y + 0.05); }
  function onFace(face, ink, cream) { return ratio(face, ink) >= ratio(face, cream) ? ink : cream; }
  var PAT = {
    dots: ['<rect x="6" y="6" width="2" height="2"/>', 14],
    grid: ['<rect width="14" height="1"/><rect width="1" height="14"/>', 14],
    scan: ['<rect y="0" width="14" height="1"/><rect y="4" width="14" height="1"/><rect y="7" width="14" height="1"/><rect y="11" width="14" height="1"/>', 14],
    check: ['<rect width="17" height="17" fill-opacity=".45"/><rect x="17" y="17" width="17" height="17" fill-opacity=".45"/>', 34],
    stripe: ['<path d="M0 14L14 0M-1 1L1-1M13 15L15 13" stroke="#000" stroke-width="1" fill="none"/>', 14]
  };
  function patUrl(id) {
    var p = PAT[id]; if (!p) return 'none';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + p[1] + '" height="' + p[1] + '" shape-rendering="crispEdges" fill="#000">' + p[0] + '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  function systemDark() { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return true; } }
  function faceFor(id) { return globalThis.NC_face(id, S.face, systemDark()); }
  function applyUI() {
    var ui = S.ui, t = THEMES[S.theme] || THEMES.arcadia;
    var dark = faceFor(S.theme) === 'd';
    var p = dark ? t.d : t.l, st = root.style;
    var names = ['bg', 'surface', 'variant', 'onv', 'outline', 'ink', 'cream', 'red', 'green', 'mustard', 'floor'];
    names.forEach(function (n, i) { st.setProperty('--' + n, p[i]); });
    var ink = p[5], cream = p[6], primary = dark ? p[9] : p[7];
    st.setProperty('--primary', primary);
    st.setProperty('--text', dark ? cream : ink);
    st.setProperty('--on-bg', onFace(p[0], ink, cream)); st.setProperty('--on-surface', onFace(p[1], ink, cream));
    st.setProperty('--on-variant', onFace(p[2], ink, cream)); st.setProperty('--on-primary', onFace(primary, ink, cream));
    st.setProperty('--on-red', onFace(p[7], ink, cream)); st.setProperty('--on-green', onFace(p[8], ink, cream));
    st.setProperty('--on-mustard', onFace(p[9], ink, cream)); st.setProperty('--on-cream', onFace(cream, ink, cream));
    st.setProperty('--shadow', ui.style === 'cyber' && dark ? p[7] : ink);
    st.setProperty('--ts', ui.textSize / 100);
    root.setAttribute('data-style', ui.style);
    var pu = patUrl(ui.backdrop), size = PAT[ui.backdrop] ? PAT[ui.backdrop][1] : 14;
    st.setProperty('--pat-img', pu); st.setProperty('--pat-size', size + 'px');
    st.setProperty('--pat', dark ? cream : ink);
    st.setProperty('--pat-op', PAT[ui.backdrop] ? (ui.backdropStrength / 100) * (dark ? 0.2 : 0.3) : 0);
    document.querySelectorAll('svg.ico').forEach(function (s) { if (s.getAttribute('data-st') !== ui.style) { ICONS.fill(s, s.getAttribute('data-ico'), ui.style); s.setAttribute('data-st', ui.style); } });
  }


  /* ---------------------------------------------------------------- controls */
  function slider(label, min, max, step, get, set, fmt) {
    var val = h('span', { class: 'val' }), inp = h('input', { type: 'range', min: min, max: max, step: step, 'aria-label': label });
    var el = h('div', { class: 'slider' }, h('div', { class: 'top' }, h('span', { text: label }), val), inp);
    inp.addEventListener('input', function () { var v = +inp.value; set(v); paint(); });
    inp.addEventListener('change', function () { persist(0); });
    function paint() { var v = +inp.value; val.textContent = fmt ? fmt(v) : v; inp.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%'); }
    return reg({ el: el, sync: function () { if (document.activeElement !== inp) inp.value = get(); paint(); } });
  }
  function reveal(content, isOpen) {
    var el = h('div', { class: 'reveal' }, h('div', null, content));
    return reg({ el: el, sync: function () { el.classList.toggle('open', !!isOpen()); } });
  }
  function switchBtn(get, set, label) {
    var t = sticker({ cls: 'tgl', fill: 'variant' }, h('span', { class: 'knob' }));
    t.setAttribute('role', 'switch'); if (label) t.setAttribute('aria-label', label);
    t.addEventListener('click', function (e) { e.stopPropagation(); set(!get()); });
    t.paint = function () { t.setAttribute('aria-checked', get() ? 'true' : 'false'); };
    return t;
  }

  /* tab strip: items [{ v, label }]; paint() reflects get(); setLabel(i, text) */
  function tabStrip(items, get, set) {
    var btns = items.map(function (it) {
      var b = sticker({ cls: 'tab', fill: 'variant' }, it.label); b.setAttribute('role', 'tab'); b.v = it.v;
      b.addEventListener('click', function () { set(it.v); });
      return b;
    });
    var el = h('div', { class: 'tabs', role: 'tablist' }); btns.forEach(function (b) { el.append(b); });
    el.paint = function () { btns.forEach(function (b) { var on = get() === b.v; b.setAttribute('aria-selected', on ? 'true' : 'false'); setFill(b, on ? 'primary' : 'variant'); }); };
    el.setLabel = function (i, t) { btns[i].inn.firstChild.nodeValue = t; };
    return el;
  }

  /* ---------------------------------------------------------------- settings rows and groups */
  var groups = [];
  function rowEl(o) {
    var tag = o.kind === 'chev' ? 'button' : 'div';
    var el = h(tag, { class: 'rw' + (o.kind === 'chev' ? '' : ' tap') });
    if (tag === 'button') el.type = 'button';
    var lab = h('div', { class: 'lab', text: o.label }), sub = h('div', { class: 'sub', text: o.sub || '' });
    var val = h('span', { class: 'val' });
    var parts = [];
    if (o.icon) parts.push(h('span', { class: 'ri' }, ico(o.icon)));
    parts.push(h('div', { class: 'txt' }, lab, sub));
    var tgl = null;
    if (o.kind === 'switch') { tgl = switchBtn(o.get, o.set, o.label); parts.push(tgl); el.addEventListener('click', function () { if (!tgl.disabled) o.set(!o.get()); }); }
    else if (o.kind === 'chev') { parts.push(val); if (o.onclick) el.addEventListener('click', o.onclick); }
    parts.forEach(function (p) { el.append(p); });
    var r = { el: el, q: '', tgl: tgl };
    reg({ sync: function () {
      var L = typeof o.label === 'function' ? o.label() : o.label, Sb = typeof o.sub === 'function' ? o.sub() : (o.sub || '');
      lab.textContent = L; sub.textContent = Sb; sub.classList.toggle('hide', !Sb); sub.classList.add('sub');
      var V = o.value ? o.value() : '';
      val.textContent = ''; if (o.kind === 'chev') { if (V) val.append(h('span', { text: V })); val.append(ico('chev')); }
      if (tgl) tgl.paint();
      if (o.disabled) { var d = !!o.disabled(); el.toggleAttribute('disabled', d); if (tgl) tgl.disabled = d; }
      if (o.icon && o.iconDyn) { var ri = el.querySelector('.ri'); var nn = o.iconDyn(); if (ri.firstChild.getAttribute('data-ico') !== nn) { ri.textContent = ''; ri.append(ico(nn)); } }
      if (o.show) el.classList.toggle('hide', !o.show());
      r.q = (L + ' ' + Sb + ' ' + (o.keys || '')).toLowerCase();
    } });
    el.rowRef = r; return r;
  }
  function blockEl(label, keys, valueFn, content) {
    var val = h('span', { class: 'val' }), el = h('div', { class: 'rowblock' }, h('div', { class: 'bh' }, h('span', { text: label }), val), content);
    var r = { el: el, q: (label + ' ' + keys).toLowerCase() };
    reg({ sync: function () { val.textContent = valueFn ? valueFn() : ''; } });
    return r;
  }
  function group(title, items) {
    var rows = h('div', { class: 'rows' }), card = sticker({ block: true, tag: 'div', fill: 'surface' }, rows);
    card.classList.add('group');
    items.forEach(function (it) { rows.append(it.el); });
    var g = { label: h('div', { class: 'glabel', text: title }), card: card, items: items, rows: rows };
    groups.push(g); return g;
  }
  function applyFilter(q) {
    q = (q || '').trim().toLowerCase(); var any = false;
    groups.forEach(function (g) {
      var vis = [];
      g.items.forEach(function (it) {
        var off = it.el.classList.contains('hide') && !it.el._f;
        var hit = !q || it.q.indexOf(q) >= 0;
        it.el._f = !hit; it.el.style.display = hit ? '' : 'none';
        it.el.classList.remove('lastvis');
        if (hit && !(it.el.hasAttribute('hidden'))) vis.push(it);
        void off;
      });
      var shown = vis.filter(function (it) { return !it.el.classList.contains('hide'); });
      if (shown.length) shown[shown.length - 1].el.classList.add('lastvis');
      var ok = shown.length > 0; g.label.style.display = ok ? '' : 'none'; g.card.style.display = ok ? '' : 'none'; if (ok) any = true;
    });
    R.nores.classList.toggle('hide', any);
  }

  /* ---------------------------------------------------------------- sheets */
  function closeSheet() { R.scrim.classList.remove('on'); R.sheet.classList.remove('on'); R.sheet.textContent = ''; if (R.sheetFrom && R.sheetFrom.focus) { try { R.sheetFrom.focus(); } catch (e) { /* noop */ } } R.sheetFrom = null; }
  function openSheet(title, build, from) {
    R.sheet.textContent = ''; R.sheetFrom = from || document.activeElement;
    R.sheet.append(h('div', { class: 'grip' }), h('h2', { text: title }));
    build(R.sheet); R.scrim.classList.add('on'); R.sheet.classList.add('on'); R.sheet.scrollTop = 0;
    var f = R.sheet.querySelector('.opt.cur') || R.sheet.querySelector('.opt, .sw'); if (f) f.focus();
  }
  function optionSheet(title, options, get, set) {
    return function (e) {
      openSheet(title, function (sh) {
        options.forEach(function (o) {
          var b = h('button', { class: 'opt' + (String(get()) === String(o.v) ? ' cur' : ''), type: 'button' },
            h('div', { class: 'txt' }, h('div', { class: 'lab', text: o.label }), o.sub ? h('div', { class: 'sub', text: o.sub }) : null), h('span', { class: 'mark' }, ico('check')));
          b.addEventListener('click', function () { set(o.v); closeSheet(); });
          sh.append(b);
        });
      }, e && e.currentTarget);
    };
  }
  function labelOf(options, v) { for (var i = 0; i < options.length; i++) if (String(options[i].v) === String(v)) return options[i].label; return String(v); }

  /* ---------------------------------------------------------------- site helpers */
  function siteDecision() { return NC.decide(Object.assign({}, S, { enabled: true }), tab.host); }
  function setSiteEnabled(on) {
    if (!tab.host) return;
    commit(function (s) {
      var m = NC.ruleFor(s.siteRules, tab.host), key = m ? m.host : tab.host;
      if (on === (s.applyTo === 'all')) delete s.siteRules[key]; else s.siteRules[key] = { enabled: on };
    });
    setTimeout(refreshStatus, 500);
  }
  function siteMsg() {
    var d = siteDecision();
    if (tab.restricted) return 'Browser pages can’t be themed by any extension';
    if (!S.enabled) return 'Nightcade is switched off';
    if (!status) return tab.url.indexOf('file:') === 0 && !fileOk ? 'File access is off' : 'Engine idle — reload the tab if it just opened';
    if (status.active) return 'Active · ' + (status.face === 'l' ? 'light' : 'dark') + ' face';
    return d.active ? 'Starting…' : 'Off for this site';
  }
  function fileOff() { return tab.url.indexOf('file:') === 0 && !fileOk; }

  /* ---------------------------------------------------------------- options */
  var OPT_STYLE = [{ v: 'arcadia', label: 'Arcadia', sub: 'Rounded stickers, pixel type' }, { v: 'cyber', label: 'Cyberpunk', sub: 'Cut corners, neon offset' }];
  var OPT_FACE = [{ v: 'system', label: 'System', sub: 'Follow your OS setting' }, { v: 'light', label: 'Light', sub: 'The theme’s light palette' }, { v: 'dark', label: 'Dark', sub: 'The theme’s dark palette' }];
  var OPT_SIZE = [85, 100, 115, 130].map(function (n) { return { v: n, label: n + '%' }; });
  var OPT_IMG = [{ v: 'smart', label: 'Smart', sub: 'Photos stay real, dark logos and white diagrams are fixed' }, { v: 'dim', label: 'Dim only', sub: 'Lower image brightness, nothing is inverted' }, { v: 'off', label: 'Off', sub: 'Images are never touched' }];
  var OPT_APPLY = [{ v: 'all', label: 'All sites', sub: 'Everywhere except sites marked off' }, { v: 'listed', label: 'Listed only', sub: 'Only sites marked on' }];
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var ANDROID = /Android/i.test(navigator.userAgent);
  var TOUCH = ANDROID || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
  if (TOUCH) document.documentElement.classList.add('fit');
  var ELEMENTS = [
    { k: 'bg', icon: 'palette', label: 'Backgrounds', sub: 'Page, cards, panels and other surfaces' },
    { k: 'text', icon: 'text', label: 'Text', sub: 'Regular text colors' },
    { k: 'accentText', icon: 'globe', label: 'Links & colored text', sub: 'Links and other colored text use the theme accents' },
    { k: 'accentBg', icon: 'power', label: 'Buttons & highlights', sub: 'Buttons, badges and colored backgrounds' },
    { k: 'borders', icon: 'list', label: 'Borders & outlines', sub: 'Lines, dividers, focus rings' },
    { k: 'icons', icon: 'eye', label: 'Icons & SVG', sub: 'Icon and graphic fill and stroke colors' },
    { k: 'shadows', icon: 'moon', label: 'Shadows', sub: 'Box and text shadows' },
    { k: 'selection', icon: 'check', label: 'Text selection', sub: 'Highlight color when selecting text' }
  ];
  var BACKDROPS = ['dots', 'grid', 'scan', 'check', 'stripe', 'plain'];

  /* ---------------------------------------------------------------- horizontal swatch lines */
  function themeLine() {
    var line = h('div', { class: 'hline', role: 'listbox', 'aria-label': 'Colors' }), tiles = [];
    globalThis.NC_THEME_ORDER.forEach(function (id) {
      var t = THEMES[id], blocks = h('span', { class: 'blocks' }), is = [];
      for (var k = 0; k < 5; k++) { var i = h('i'); is.push(i); blocks.append(i); }
      var chk = h('span', { class: 'chk' }, ico('check'));
      var b = sticker({ small: true, cls: 'tile', fill: 'surface' }, h('span', { style: 'display:block;width:100%' }, blocks, h('span', { class: 'lab', text: t.name })));
      b.append(chk); b.title = t.name; b.setAttribute('role', 'option');
      b.addEventListener('click', function () { commit(function (s) { if (id === 'custom') useCustom(s); else s.theme = id; }); });
      b.id_ = id; b.is = is; tiles.push(b); line.append(b);
    });
    var first = true;
    reg({ sync: function () {
      tiles.forEach(function (b) {
        var p = faceFor(b.id_) === 'd' ? THEMES[b.id_].d : THEMES[b.id_].l, cs = [p[0], p[2], p[7], p[8], p[9]];
        b.is.forEach(function (i, k) { i.style.background = cs[k]; });
        var on = b.id_ === S.theme; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on);
      });
      if (first) { first = false; requestAnimationFrame(function () { var s = line.querySelector('.sel'); if (s) line.scrollLeft = Math.max(0, s.offsetLeft - 40); }); }
    } });
    return line;
  }
  function backdropLine() {
    var line = h('div', { class: 'hline', role: 'listbox', 'aria-label': 'Page backdrop' }), tb = [];
    BACKDROPS.forEach(function (id) {
      var pat = h('span', { class: 'pat' }); pat.style.setProperty('--img', patUrl(id)); pat.style.setProperty('--pat-size', (PAT[id] ? PAT[id][1] : 14) + 'px');
      var b = sticker({ small: true, cls: 'tile', fill: 'surface' }, h('span', { style: 'display:block;width:100%' }, pat, h('span', { class: 'lab', text: id })));
      b.append(h('span', { class: 'chk' }, ico('check'))); b.setAttribute('role', 'option');
      b.addEventListener('click', function () { commit(function (s) { s.ui.backdrop = id; }); }); b.id_ = id; tb.push(b); line.append(b);
    });
    reg({ sync: function () { tb.forEach(function (b) { var on = b.id_ === S.ui.backdrop; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); }); } });
    return line;
  }

  /* ---------------------------------------------------------------- pages */
  function buildMain() {
    var site = rowEl({ icon: 'globe', kind: 'switch',
      label: function () { return tab.restricted ? 'N/A' : (tab.host === 'file' ? 'Local files' : tab.host || '—'); },
      sub: siteMsg, keys: 'this site website dark mode toggle',
      get: function () { return siteDecision().active && !!tab.host && !tab.restricted; },
      set: function (on) { setSiteEnabled(on); },
      disabled: function () { return !tab.host || tab.restricted; } });
    var fileRow = rowEl({ icon: 'warn', kind: 'chev', label: 'Local files need one extra step', sub: 'Turn on “Allow access to file URLs”, then reload the file', value: function () { return 'Open'; }, onclick: openExtPage, show: fileOff, keys: 'file local access' });
    var gSite = group('This site', [site, fileRow]);

    var style = rowEl({ icon: 'eye', kind: 'chev', label: 'UI style', sub: 'Look of this popup', value: function () { return labelOf(OPT_STYLE, S.ui.style); }, keys: 'arcadia cyberpunk look',
      onclick: optionSheet('UI style', OPT_STYLE, function () { return S.ui.style; }, function (v) { commit(function (s) { s.ui.style = v; }); }) });
    var amoled = function () { return (THEMES[S.theme] || {}).forcesDark; };
    var face = rowEl({ icon: 'moon', iconDyn: function () { return faceFor(S.theme) === 'd' ? 'moon' : 'sun'; }, kind: 'chev', label: 'Theme face', keys: 'light dark system mode amoled',
      sub: function () { return amoled() ? 'Forced dark by AMOLED' : 'Popup and websites'; },
      value: function () { return amoled() ? 'Dark' : labelOf(OPT_FACE, S.face); },
      onclick: optionSheet('Theme face', OPT_FACE, function () { return S.face; }, function (v) { commit(function (s) { s.face = v; }); }) });
    var size = rowEl({ icon: 'text', kind: 'chev', label: 'Text size', sub: 'Popup and websites', value: function () { return S.ui.textSize + '%'; }, keys: 'font scale zoom page',
      onclick: optionSheet('Text size', OPT_SIZE, function () { return S.ui.textSize; }, function (v) { commit(function (s) { s.ui.textSize = v; }); }) });
    var colors = blockEl('Colors', 'theme palette colour color', function () { return (THEMES[S.theme] || {}).name; }, themeLine());
    var bs = slider('Backdrop visibility', 0, 100, 1, function () { return S.ui.backdropStrength; }, function (v) { commit(function (s) { s.ui.backdropStrength = v; }, 160); }, function (v) { return v + '%'; });
    var bdContent = h('div', null, backdropLine(), reveal(h('div', { style: 'padding:.2rem .2rem .6rem 0' }, bs.el), function () { return S.ui.backdrop !== 'plain'; }).el);
    var backdrop = blockEl('Page backdrop', 'pattern background dots grid scan check stripe', function () { return S.ui.backdrop; }, bdContent);
    var customRow = rowEl({ icon: 'palette', kind: 'chev', label: 'Custom colors', sub: 'Pick your own color for everything', keys: 'custom own colour color picker theme palette hex',
      value: function () { return 'Edit'; }, onclick: function () { editFace = faceFor(S.theme); go('custom'); } });
    var customReveal = reveal(customRow.el, function () { return S.theme === 'custom'; });      // slides down under Colors, like the backdrop slider
    var gLook = group('Appearance', [style, face, size, colors, { el: customReveal.el, q: customRow.q }, backdrop]);

    var elsRow = rowEl({ icon: 'palette', kind: 'chev', label: 'Elements to theme', sub: 'Backgrounds, text, links, buttons, borders…', keys: 'text link links button highlight background border icon svg shadow selection accent color elements what',
      value: function () { var on = ELEMENTS.filter(function (e) { return S.elements[e.k] !== false; }).length; return on === ELEMENTS.length ? 'All' : on + ' of ' + ELEMENTS.length; },
      onclick: function () { go('elements'); } });
    var tuned = function () { return S.brightness !== 100 || S.contrast !== 100 || S.sepia !== 0 || S.grayscale !== 0; };
    var tune = rowEl({ icon: 'sliders', kind: 'chev', label: 'Color tuning', sub: 'Brightness, contrast, sepia, grayscale', value: function () { return tuned() ? 'Custom' : 'Default'; }, keys: 'brightness contrast sepia grayscale', onclick: function () { go('tune'); } });
    var imgs = rowEl({ icon: 'image', kind: 'chev', label: 'Images', sub: 'Logos, diagrams and dimming', value: function () { return labelOf(OPT_IMG, S.imageMode); }, keys: 'image picture photo logo dim diagram', onclick: function () { go('images'); } });
    var apply = rowEl({ icon: 'list', kind: 'chev', label: 'Apply to', sub: 'Which sites get themed', value: function () { return labelOf(OPT_APPLY, S.applyTo); }, keys: 'all sites listed',
      onclick: optionSheet('Apply to', OPT_APPLY, function () { return S.applyTo; }, function (v) { commit(function (s) { s.applyTo = v; }); setTimeout(refreshStatus, 500); }) });
    var rules = rowEl({ icon: 'shield', kind: 'chev', label: 'Site rules', sub: 'Enabled and disabled sites', value: function () { var n = Object.keys(S.siteRules).length; return n ? String(n) : 'None'; }, keys: 'exclude whitelist blacklist per site', onclick: function () { go('sites'); } });
    var gWeb = group('Websites', [elsRow, tune, imgs, apply, rules]);

    var short = rowEl({ icon: 'kbd', kind: 'info', label: 'Shortcuts', sub: (MAC ? 'Control' : 'Alt') + '+Shift+D this site · ' + (MAC ? 'Control' : 'Alt') + '+Shift+G everywhere (change in your browser’s shortcut settings)', keys: 'keyboard hotkey command' });
    var reset = rowEl({ icon: 'reload', kind: 'chev', label: 'Reset everything', sub: 'Back to the default settings', value: function () { return ''; }, keys: 'default restore',
      onclick: function (e) {
        openSheet('Reset everything?', function (sh) {
          sh.append(h('div', { class: 'sub', text: 'All settings and site rules go back to their defaults.' }));
          var no = sticker({ small: true, fill: 'surface', cls: 'btn' }, 'Cancel'), yes = sticker({ small: true, fill: 'red', cls: 'btn' }, 'Reset');
          no.addEventListener('click', closeSheet);
          yes.addEventListener('click', function () { commit(function (s) { var d = NC.merge(null); Object.keys(d).forEach(function (k) { s[k] = d[k]; }); }); closeSheet(); setTimeout(refreshStatus, 500); });
          sh.append(h('div', { class: 'sheetbtns' }, no, yes));
        }, e.currentTarget);
      } });
    var gGen = group('General', ANDROID ? [reset] : [short, reset]);

    R.nores = h('div', { class: 'nores hide', text: 'No settings found' });
    var page = h('div', { class: 'page' });
    [gSite, gLook, gWeb, gGen].forEach(function (g) { page.append(g.label, g.card); });
    page.append(R.nores);
    return page;
  }

  function subPage(items) { var page = h('div', { class: 'page' }); items.forEach(function (n) { page.append(n); }); return page; }
  function simpleGroup(rowsArr) { var rows = h('div', { class: 'rows' }); rowsArr.forEach(function (r) { rows.append(r); }); var c = sticker({ block: true, tag: 'div', fill: 'surface' }, rows); c.classList.add('group'); c.style.marginTop = '1.2rem'; return c; }
  function block(content) { return h('div', { class: 'rowblock' }, content); }

  function buildTune() {
    var sl = function (label, key, min, max) { return block(slider(label, min, max, 1, function () { return S[key]; }, function (v) { commit(function (s) { s[key] = v; }, 160); }, function (v) { return v + '%'; }).el); };
    var reset = sticker({ small: true, fill: 'surface', block: true, cls: 'btn' }, ico('reload'), 'Reset tuning');
    reset.addEventListener('click', function () { commit(function (s) { s.brightness = 100; s.contrast = 100; s.sepia = 0; s.grayscale = 0; }); });
    return subPage([simpleGroup([sl('Brightness', 'brightness', 50, 150), sl('Contrast', 'contrast', 50, 150), sl('Sepia', 'sepia', 0, 100), sl('Grayscale', 'grayscale', 0, 100)]),
      h('div', { class: 'note', text: 'Applied on top of the theme colors, on every themed page.' }), h('div', { style: 'margin-top:1.4rem' }, reset)]);
  }
  function buildElements() {
    var items = ELEMENTS.map(function (e) {
      return rowEl({ icon: e.icon, kind: 'switch', label: e.label, sub: e.sub, keys: 'theme',
        get: function () { return S.elements[e.k] !== false; }, set: function (v) { commit(function (s) { s.elements[e.k] = v; }); } });
    });
    var all = sticker({ small: true, fill: 'surface', cls: 'btn' }, 'Enable all'), none = sticker({ small: true, fill: 'surface', cls: 'btn' }, 'Disable all');
    var setAll = function (v) { return function () { commit(function (s) { ELEMENTS.forEach(function (e) { s.elements[e.k] = v; }); }); }; };
    all.addEventListener('click', setAll(true)); none.addEventListener('click', setAll(false));
    var rows = h('div', { class: 'rows' }); items.forEach(function (i) { rows.append(i.el); });
    var card = sticker({ block: true, tag: 'div', fill: 'surface' }, rows); card.classList.add('group'); card.style.marginTop = '1.2rem';
    reg({ sync: function () { var vis = items.map(function (i) { return i.el; }); vis.forEach(function (e) { e.classList.remove('lastvis'); }); vis[vis.length - 1].classList.add('lastvis'); } });
    return subPage([card, h('div', { class: 'note', text: 'Only the switched-on parts are themed. Anything turned off keeps the site’s own colors.' }), h('div', { class: 'sheetbtns' }, all, none)]);
  }
  function buildImages() {
    var mode = rowEl({ icon: 'image', kind: 'chev', label: 'Image handling', sub: function () { return labelOf(OPT_IMG, S.imageMode) === 'Smart' ? 'Photos stay real' : (S.imageMode === 'dim' ? 'Only dimmed' : 'Untouched'); }, value: function () { return labelOf(OPT_IMG, S.imageMode); },
      onclick: optionSheet('Image handling', OPT_IMG, function () { return S.imageMode; }, function (v) { commit(function (s) { s.imageMode = v; }); }) });
    var dim = slider('Image dimming', 0, 70, 1, function () { return S.imageDim; }, function (v) { commit(function (s) { s.imageDim = v; }, 160); }, function (v) { return v + '%'; });
    var logos = rowEl({ icon: 'moon', kind: 'switch', label: 'Dark logos', sub: 'Invert dark-on-transparent logos and icons', get: function () { return S.invertLogos; }, set: function (v) { commit(function (s) { s.invertLogos = v; }); } });
    var diag = rowEl({ icon: 'sun', kind: 'switch', label: 'White diagrams', sub: 'Darken charts with a plain white background', get: function () { return S.invertDiagrams; }, set: function (v) { commit(function (s) { s.invertDiagrams = v; }); } });
    var dimBlk = h('div', { class: 'rowblock' }, dim.el);
    var smartOnly = function (n) { return function () { return S.imageMode === 'smart'; }; };
    void smartOnly;
    R.imgNote = h('div', { class: 'note' });
    reg({ sync: function () {
      dimBlk.classList.toggle('hide', S.imageMode === 'off');
      logos.el.classList.toggle('hide', S.imageMode !== 'smart'); diag.el.classList.toggle('hide', S.imageMode !== 'smart');
      var rows = mode.el.parentNode; if (rows) { Array.prototype.forEach.call(rows.children, function (c) { c.classList.remove('lastvis'); }); var vis = Array.prototype.filter.call(rows.children, function (c) { return !c.classList.contains('hide'); }); if (vis.length) vis[vis.length - 1].classList.add('lastvis'); }
      R.imgNote.textContent = faceFor(S.theme) === 'l' ? 'Image fixes only apply on dark faces. Light pages keep their images as they are.' : '';
    } });
    return subPage([simpleGroup([mode.el, dimBlk, logos.el, diag.el]), R.imgNote]);
  }
  /* ---------------------------------------------------------------- custom theme */
  function useCustom(s) {                                   // switch to Custom, remembering where you came from
    prepCustom(s);
    if (s.theme !== 'custom') s.custom.prev = s.theme;
    s.theme = 'custom';
  }
  function prepCustom(s) {                                   // first use: start as a copy of the theme you are on
    if (s.custom.init) return;
    var t = THEMES[s.theme];
    if (t && s.theme !== 'custom') { s.custom.d = t.d.slice(); s.custom.l = t.l.slice(); }
    s.custom.init = true;
  }
  var editFace = 'd';
  function buildCustom() {
    function palOf(face) { var t = S.theme === 'custom' ? S.custom : THEMES[S.theme] || THEMES.arcadia; return face === 'd' ? t.d : t.l; }
    function normHex(v) { v = String(v || '').trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/(.)/g, '$1$1'); return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : ''; }
    function setColor(i, v) {
      commit(function (s) { prepCustom(s); s.custom[editFace][i] = v; useCustom(s); globalThis.NC_applyCustom(s.custom); }, 150);
    }
    var simpleRows = [], advRows = [];
    function colorRow(list, label, sub, idxFn) {
      var lab = h('div', { class: 'lab', text: typeof label === 'function' ? label() : label }), note = sub ? h('div', { class: 'sub', text: sub }) : null;
      var sw = h('input', { type: 'color', class: 'cw' }), hex = h('input', { type: 'text', class: 'hx', maxlength: 7, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
      sw.setAttribute('aria-label', typeof label === 'function' ? label() : label); hex.setAttribute('aria-label', (typeof label === 'function' ? label() : label) + ' hex code');
      sw.addEventListener('input', function () { setColor(idxFn(), sw.value); });
      hex.addEventListener('change', function () { var v = normHex(hex.value); if (v) setColor(idxFn(), v); else hex.value = palOf(editFace)[idxFn()]; });
      var el = h('div', { class: 'rw crow' }, h('div', { class: 'txt' }, lab, note), sw, hex);
      list.push({ el: el, sync: function () {
        var c = palOf(editFace)[idxFn()];
        if (typeof label === 'function') lab.textContent = label();
        if (sw.value !== c) sw.value = c;
        if (document.activeElement !== hex) hex.value = c.toUpperCase();
      } });
      reg(list[list.length - 1]);
      return el;
    }
    function card(rowsEls) { var rows = h('div', { class: 'rows' }); rowsEls.forEach(function (e) { rows.append(e); }); if (rows.lastChild) rows.lastChild.classList.add('lastvis'); var c = sticker({ block: true, tag: 'div', fill: 'surface' }, rows); c.classList.add('group'); return c; }
    var textIdx = function () { return editFace === 'd' ? 6 : 5; }, otherInk = function () { return editFace === 'd' ? 5 : 6; };
    var main = card([
      colorRow(simpleRows, 'Background', 'Page color', function () { return 0; }),
      colorRow(simpleRows, 'Surface', 'Cards, boxes, fields', function () { return 1; }),
      colorRow(simpleRows, 'Text', 'Main text color', textIdx),
      colorRow(simpleRows, 'Accent 1', 'Replaces reds', function () { return 7; }),
      colorRow(simpleRows, 'Accent 2', 'Replaces greens', function () { return 8; }),
      colorRow(simpleRows, 'Accent 3', 'Replaces yellows and oranges', function () { return 9; })
    ]);
    var adv = card([
      colorRow(advRows, 'Tiles', 'Buttons, tabs, chips', function () { return 2; }),
      colorRow(advRows, 'Quiet text', 'Hints and captions', function () { return 3; }),
      colorRow(advRows, 'Outline', 'Borders and dividers', function () { return 4; }),
      colorRow(advRows, function () { return editFace === 'd' ? 'Dark ink' : 'Light ink'; }, 'Text on bright accents', otherInk),
      colorRow(advRows, 'Panel', 'Dark panels and screens', function () { return 10; })
    ]);
    var advOpen = false;
    var advBtn = rowEl({ icon: 'sliders', kind: 'chev', label: 'Advanced colors', sub: 'Tiles, outline, quiet text and more', keys: 'advanced outline tiles panel ink', value: function () { return advOpen ? 'Hide' : 'Show'; }, onclick: function () { advOpen = !advOpen; syncAll(); } });
    var advGroup = card([advBtn.el]);
    var advReveal = reveal(h('div', { style: 'padding-top:1rem' }, adv), function () { return advOpen; });

    var tabs = tabStrip([{ v: 'd', label: 'Dark face' }, { v: 'l', label: 'Light face' }], function () { return editFace; }, function (v) { editFace = v; syncAll(); });
    tabs.style.marginBottom = '1.2rem'; reg({ sync: function () { tabs.paint(); } });
    var info = h('div', { class: 'note', style: 'margin:0 .2rem 1rem' });
    reg({ sync: function () { info.textContent = (S.theme === 'custom' ? 'Custom theme is on. ' : 'Change any color to switch to Custom. ') + 'You are editing the ' + (editFace === 'd' ? 'dark' : 'light') + ' face; websites and this popup use the face chosen in Theme face.'; } });
    var copy = rowEl({ icon: 'reload', kind: 'chev', label: 'Copy colors from a theme', sub: 'Replaces both faces of Custom', keys: 'copy start reset preset theme', value: function () { return ''; },
      onclick: optionSheet('Copy colors from', globalThis.NC_THEME_ORDER.filter(function (id) { return id !== 'custom'; }).map(function (id) { return { v: id, label: THEMES[id].name }; }), function () { return ''; }, function (v) {
        commit(function (s) { var t = THEMES[v]; s.custom.d = t.d.slice(); s.custom.l = t.l.slice(); s.custom.init = true; useCustom(s); globalThis.NC_applyCustom(s.custom); });
      }) });
    var useRow = rowEl({ icon: 'palette', kind: 'switch', label: 'Use Custom theme', sub: 'Turn off to go back to the theme you picked before', keys: 'custom on off enable',
      get: function () { return S.theme === 'custom'; }, set: function (on) { commit(function (s) { if (on) useCustom(s); else s.theme = s.custom.prev && THEMES[s.custom.prev] && s.custom.prev !== 'custom' ? s.custom.prev : 'arcadia'; }); if (!on && nav[nav.length - 1] === 'custom') back(); } });
    return subPage([tabs, info, h('div', { class: 'glabel', text: 'Main colors' }), main, h('div', { style: 'height:1.2rem' }), advGroup, advReveal.el, h('div', { style: 'height:1.2rem' }), h('div', { class: 'glabel', text: 'Options' }), card([useRow.el, copy.el])]);
  }

  function parseSite(v) {
    v = String(v || '').trim().toLowerCase();
    if (v === 'file' || v === 'local files' || v === 'local file' || /^file:\/\//.test(v)) return 'file';
    v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[\/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/^www\./, '').replace(/\.+$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(v)) return '';
    return (v.indexOf('.') > 0 || v === 'localhost') ? v : '';
  }
  function buildSites() {
    var which = true;                                                  // true: showing the Enabled list, false: the Disabled list
    function setRule(host, on) { commit(function (s) { s.siteRules[host] = { enabled: on }; }); setTimeout(refreshStatus, 500); }
    function siteName(x) { return x === 'file' ? 'Local files' : x; }
    function keysFor(on) { return Object.keys(S.siteRules).filter(function (x) { return S.siteRules[x].enabled === on; }).sort(); }

    /* which list to show */
    var tabs = tabStrip([{ v: true, label: 'Enabled' }, { v: false, label: 'Disabled' }], function () { return which; }, function (v) { which = v; syncAll(); });
    tabs.style.marginBottom = '1.4rem';

    /* add the current site / type a site, into the list being shown */
    var curBtn = sticker({ small: true, fill: 'primary', block: true, cls: 'btn' }, ico('plus'), h('span', { class: 'addlab' }));
    curBtn.addEventListener('click', function () { var k = tab.host; if (k && !tab.restricted) setRule(k, which); });
    var inp = h('input', { type: 'text', placeholder: 'example.com or paste a URL', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Site to add', enterkeyhint: 'done' });
    var field = sticker({ small: true, fill: 'surface', block: true, tag: 'div', cls: 'search' }, inp);
    var addBtn = sticker({ small: true, fill: 'primary', cls: 'btn' }, 'Add');
    var err = h('div', { class: 'note errnote' });
    function addTyped() {
      var k = parseSite(inp.value);
      if (!k) { err.textContent = 'Enter a site like example.com'; return; }
      err.textContent = ''; inp.value = ''; setRule(k, which);
    }
    addBtn.addEventListener('click', addTyped);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } });
    inp.addEventListener('input', function () { err.textContent = ''; });

    /* the list */
    var rows = h('div', { class: 'rows' }), card = sticker({ block: true, tag: 'div', fill: 'surface' }, rows);
    card.classList.add('group');
    var head = h('div', { class: 'glabel' }), note = h('div', { class: 'note', style: 'margin:0 .2rem .8rem' });
    var foot = h('div', { class: 'note' });
    reg({ sync: function () {
      var nEn = keysFor(true).length, nDis = keysFor(false).length;
      tabs.setLabel(0, 'Enabled' + (nEn ? ' · ' + nEn : '')); tabs.setLabel(1, 'Disabled' + (nDis ? ' · ' + nDis : '')); tabs.paint();
      head.textContent = which ? 'Enabled sites' : 'Disabled sites';
      note.textContent = which ? 'Always themed, with every page and subdomain.' : 'Never themed, with every page and subdomain.';
      var k = tab.host, ok = !!k && !tab.restricted, r = ok && S.siteRules[k];
      curBtn.querySelector('.addlab').textContent = (which ? 'Enable on ' : 'Disable on ') + (ok ? siteName(k) : 'this site');
      curBtn.disabled = !ok || !!(r && r.enabled === which);
      rows.textContent = '';
      var keys = keysFor(which);
      if (!keys.length) rows.append(h('div', { class: 'empty', text: which ? 'No enabled sites' : 'No disabled sites' }));
      keys.forEach(function (x) {
        var tg = switchBtn(function () { return S.siteRules[x] ? S.siteRules[x].enabled : which; }, function (v) { setRule(x, v); }, siteName(x) + ': on or off'); tg.paint();
        var rm = sticker({ small: true, cls: 'iconbtn', fill: 'surface' }, ico('trash')); rm.title = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + x);
        rm.addEventListener('click', function () { commit(function (st) { delete st.siteRules[x]; }); setTimeout(refreshStatus, 500); });
        rows.append(h('div', { class: 'rw' }, h('div', { class: 'txt' }, h('div', { class: 'lab', text: siteName(x) })), tg, rm));
      });
      if (rows.lastChild) rows.lastChild.classList.add('lastvis');
      foot.textContent = S.applyTo === 'all' ? 'Sites in neither list are themed (Apply to: All sites).' : 'Sites in neither list are not themed (Apply to: Listed only).';
    } });
    return subPage([tabs, curBtn, h('div', { style: 'height:.9rem' }), h('div', { class: 'addrow' }, field, addBtn), err,
      h('div', { style: 'height:1.2rem' }), head, note, card, h('div', { style: 'height:.8rem' }), foot]);
  }

  /* ---------------------------------------------------------------- navigation */
  var PAGES = {};
  function go(id) { nav.push(id); showPage(true); }
  function back() { if (nav.length > 1) { nav.pop(); showPage(false); } }
  var nav = ['main'];
  function showPage(animate) {
    var id = nav[nav.length - 1];
    Object.keys(PAGES).forEach(function (k) { PAGES[k].page.classList.toggle('on', k === id); PAGES[k].page.classList.remove('slide'); });
    if (animate) { void PAGES[id].page.offsetWidth; PAGES[id].page.classList.add('slide'); }
    PAGES[id].page.scrollTop = 0;
    R.mainTop.classList.toggle('hide', id !== 'main'); R.subTop.classList.toggle('hide', id === 'main');
    R.ptitle.textContent = PAGES[id].title;
    if (id !== 'main') R.backBtn.focus();
  }
  function buildTop() {
    var power = sticker({ cls: 'power', fill: 'green' }, ico('power')); power.title = 'Master switch'; power.setAttribute('aria-label', 'Master switch');
    power.addEventListener('click', function () { commit(function (s) { s.enabled = !s.enabled; }); setTimeout(refreshStatus, 500); });
    reg({ sync: function () { setFill(power, S.enabled ? 'green' : 'red'); power.setAttribute('aria-pressed', S.enabled); } });
    var inp = h('input', { type: 'search', placeholder: 'Search settings', 'aria-label': 'Search settings', autocomplete: 'off', spellcheck: 'false' });
    var clear = h('button', { class: 'clear', type: 'button', 'aria-label': 'Clear search' }, ico('x'));
    var sr = sticker({ block: true, tag: 'label', cls: 'search flat', fill: 'surface' }, ico('search'), inp, clear);
    sr.style.filter = 'drop-shadow(3px 3px 0 var(--shadow))'; sr.classList.remove('flat');
    inp.addEventListener('input', function () { sr.classList.toggle('has', !!inp.value); applyFilter(inp.value); });
    clear.addEventListener('click', function (e) { e.preventDefault(); inp.value = ''; sr.classList.remove('has'); applyFilter(''); inp.focus(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); clear.click(); } });
    R.mainTop = h('div', { class: 'top' }, h('div', { class: 'header' }, logo(), h('div', { class: 'grow' }, h('div', { class: 'title', text: 'NIGHTCADE' }), h('div', { class: 'sub caps', text: 'Dark mode, arcade style' })), power), sr);
    R.backBtn = sticker({ cls: 'iconbtn', fill: 'surface' }, ico('back')); R.backBtn.title = 'Back'; R.backBtn.setAttribute('aria-label', 'Back');
    R.backBtn.addEventListener('click', back);
    R.ptitle = h('div', { class: 'ptitle' });
    R.subTop = h('div', { class: 'top hide' }, h('div', { class: 'pagehead' }, R.backBtn, R.ptitle));
    R.inp = inp;
  }

  function logo() {
    var c = h('canvas', { class: 'logo', width: 16, height: 16 }), x = c.getContext('2d');
    var mus = getComputedStyle(root).getPropertyValue('--mustard') || '#E8A04A';
    for (var yy = 0; yy < 16; yy++) for (var xx = 0; xx < 16; xx++) {
      var d1 = Math.hypot(xx - 7.5, yy - 8.5), d2 = Math.hypot(xx - 10.2, yy - 6.8);
      if (d1 < 5.6 && d2 >= 4.7) { x.fillStyle = d1 > 4.6 ? '#C77D2B' : '#E8A04A'; x.fillRect(xx, yy, 1, 1); }
    }
    x.fillStyle = '#DCC9A9'; [[12, 3], [14, 7], [11, 11], [3, 2], [13, 13]].forEach(function (p) { x.fillRect(p[0], p[1], 1, 1); });
    void mus; return c;
  }
  function openExtPage() {
    var ua = navigator.userAgent, scheme = /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Vivaldi/.test(ua) ? 'vivaldi' : 'chrome';
    try { api.tabs.create({ url: scheme + '://extensions/?id=' + api.runtime.id }); } catch (e) { /* noop */ }
  }

  /* ---------------------------------------------------------------- tab / status plumbing */
  function normHost(url) {
    try { var u = new URL(url); if (u.protocol === 'file:') return 'file'; return u.hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }
  function getTab() {
    return api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var t = tabs && tabs[0]; if (!t) return;
      tab.id = t.id; tab.url = t.url || ''; tab.host = normHost(tab.url);
      tab.restricted = !/^(https?|file|ftp):/i.test(tab.url);
    }).catch(function () { /* noop */ });
  }
  function refreshStatus() {
    status = null;
    if (tab.id == null || tab.restricted) { syncAll(); return Promise.resolve(); }
    return api.tabs.sendMessage(tab.id, { type: 'nc-status' }, { frameId: 0 }).then(function (r) { status = r || null; }, function () { status = null; }).then(syncAll);
  }
  function fileAccess() {
    try {
      var f = api.extension && api.extension.isAllowedFileSchemeAccess;
      if (!f) return Promise.resolve(true);
      var r = f.call(api.extension, function () { });
      return r && r.then ? r.catch(function () { return true; }) : new Promise(function (res) { api.extension.isAllowedFileSchemeAccess(res); });
    } catch (e) { return Promise.resolve(true); }
  }

  function init() {
    Promise.all([NC.load(), getTab(), fileAccess()]).then(function (r) {
      S = r[0]; fileOk = r[2] !== false;
      applyUI();
      var app = document.getElementById('app');
      R.scrim = h('div', { class: 'scrim' }); R.sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
      R.scrim.addEventListener('click', closeSheet);
      buildTop();
      var pages = h('div', { class: 'pages' });
      PAGES.main = { title: 'Nightcade', page: buildMain() };
      PAGES.tune = { title: 'Color tuning', page: buildTune() };
      PAGES.elements = { title: 'Elements', page: buildElements() };
      PAGES.custom = { title: 'Custom colors', page: buildCustom() };
      PAGES.images = { title: 'Images', page: buildImages() };
      PAGES.sites = { title: 'Site rules', page: buildSites() };
      Object.keys(PAGES).forEach(function (k) { pages.append(PAGES[k].page); });
      app.append(R.mainTop, R.subTop, pages, R.scrim, R.sheet);
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (R.sheet.classList.contains('on')) { closeSheet(); e.preventDefault(); } else if (nav.length > 1) { back(); e.preventDefault(); }
      });
      showPage(false); syncAll(); applyFilter('');
      refreshStatus();
      try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (S.face === 'system') syncAll(); }); } catch (e) { /* noop */ }
      api.storage.onChanged.addListener(function (ch) {
        if (!ch[NC.KEY]) return;
        var n = NC.merge(ch[NC.KEY].newValue);
        if (JSON.stringify(n) !== JSON.stringify(S)) { S = n; syncAll(); }
      });
    });
  }
  init();
})();
