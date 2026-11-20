/* Nightcade page engine.
 * Rewrites the page's own colours (stylesheets, inline styles, SVG, shadow DOM) with a theme-aware mapper
 * for the resolved face (dark or the theme's light palette). Images stay untouched except smart logo
 * handling and optional dimming on dark pages. Already-dark sites are recoloured too, never skipped. */
(function () {
  'use strict';
  if (globalThis.__nightcade) return;
  globalThis.__nightcade = true;

  var NC = globalThis.NC, C = globalThis.NCColor, api = NC.api;
  var isTop = true; try { isTop = window.top === window; } catch (e) { isTop = false; }
  var isFirefox = typeof browser !== 'undefined' && /Firefox/.test(navigator.userAgent);
  var useAdopted = !isFirefox && typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in Document.prototype;
  var DOC = document;

  var settings = null, hostKey = '', S = null;   // S = running session state
  var xo = new Map();                              // cross-origin css cache: href -> CSSStyleSheet | null | 'pending'

  /* ------------------------------------------------------------------ helpers */
  function normHost(h) { return (h || '').replace(/^www\./, '').toLowerCase(); }
  function ownHost() { return location.protocol === 'file:' ? 'file' : normHost(location.hostname); }
  function send(msg) {
    return new Promise(function (res) {
      try {
        var p = api.runtime.sendMessage(msg);
        if (p && p.then) p.then(res, function () { res(undefined); }); else res(undefined);
      } catch (e) { res(undefined); }
    });
  }
  function shadowOf(el) {
    try { if (el.shadowRoot) return el.shadowRoot; } catch (e) { /* noop */ }
    try { if (globalThis.chrome && chrome.dom && chrome.dom.openOrClosedShadowRoot) return chrome.dom.openOrClosedShadowRoot(el); } catch (e) { /* noop */ }
    try { if (el.openOrClosedShadowRoot) return el.openOrClosedShadowRoot; } catch (e) { /* noop */ }
    return null;
  }
  function later(fn, ms) { return setTimeout(fn, ms || 0); }

  /* ------------------------------------------------------------------ declaration mapper */
  var COLOR_PROPS_FG = ['color', '-webkit-text-fill-color', 'caret-color', 'fill', 'stroke', '-webkit-text-stroke-color', 'text-emphasis-color'];
  var BORDER_SH = ['border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-block', 'border-inline',
    'border-block-start', 'border-block-end', 'border-inline-start', 'border-inline-end', 'outline', 'column-rule', 'text-decoration', 'border-color', 'border-block-color', 'border-inline-color'];
  var BORDER_LONG = /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?|outline|column-rule)-color$/;
  var COLOR_VAR_HINT = /(col|bg|back|border|line|fg|fore|text|ink|surface|shadow|bd|outline|stroke|fill|tint|theme|accent|brand|primary|secondary|danger|success|warn|info|link|muted|gr[ae]y|white|black|red|blue|green|yellow|orange|purple|pink|overlay|divider|separator|hover|active|focus|ring|paper|canvas|panel|card)/i;
  var NOT_COLOR_VAR = /(width|size|radius|space|spacing|gap|font|weight|height|opacity|z-?index|duration|delay|ease|offset|spread|blur|margin|padding|ratio|scale|columns|rows|pos|position|repeat|origin)/i;
  var KW_COLOR = /^(inherit|initial|unset|revert|revert-layer|currentcolor|transparent)$/i;   // keep these in the override sheet so a generic !important rule can't beat a more specific one
  var rootVarCache = new Map();

  function rootVar(name) {
    if (rootVarCache.has(name)) return rootVarCache.get(name);
    var v = '';
    try { v = getComputedStyle(DOC.documentElement).getPropertyValue(name).trim(); } catch (e) { /* noop */ }
    if (v) rootVarCache.set(name, v); return v;
  }
  var curStyle = null;
  function resolveVar(name) {
    if (curStyle) { try { var v = curStyle.getPropertyValue(name).trim(); if (v) return v; } catch (e) { /* noop */ } }
    var r = rootVar(name); if (r) return r;
    return /opacity$/.test(name) ? '1' : '';
  }
  function varName(tok) { var m = /^var\(\s*(--[\w-]+)/.exec(tok); return m && m[1]; }
  function isColorVar(name) {
    var rv = rootVar(name);
    if (rv) return C.parseColor(rv) !== null;
    return COLOR_VAR_HINT.test(name) && !NOT_COLOR_VAR.test(name);
  }
  function isColorTok(t) {
    if (/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(.*var\(/i.test(t)) return true;
    if (/^var\(/i.test(t)) { var n = varName(t); return !!n && isColorVar(n); }
    return C.parseColor(t) !== null;
  }
  function hasCompositeColorVar(value, M) {
    var toks = M.splitTop(value, ' ');
    for (var i = 0; i < toks.length; i++) {
      var n = varName(toks[i]); if (!n) continue;
      var rv = rootVar(n);
      if (rv && C.parseColor(rv) === null && M.mapValue(rv, 'bd') !== rv) return true;
    }
    return false;
  }
  function colorTokenIn(value, M) {
    var layers = M.splitTop(value, ','), last = layers[layers.length - 1], toks = M.splitTop(last, ' '), found = null;
    for (var i = 0; i < toks.length; i++) if (isColorTok(toks[i])) found = toks[i];
    return found;
  }
  function imageTokensOf(value, M) {
    var layers = M.splitTop(value, ','), out = [], any = false;
    layers.forEach(function (l) {
      var toks = M.splitTop(l, ' '), pick = null;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (/^(repeating-)?(linear|radial|conic)-gradient\(/i.test(t) || /^url\(/i.test(t) || /^image-set\(/i.test(t)) { pick = t; break; }
        if (/^var\(/i.test(t)) { var n = varName(t); if (n && /gradient\(/i.test(rootVar(n))) { pick = t; break; } }
      }
      if (pick && !/^url\(/i.test(pick)) any = true;
      out.push(pick || 'none');
    });
    return any ? out.join(',') : null;
  }

  /* which "element" switch does a property belong to? */
  function propGroup(p) {
    if (p.charAt(0) === '-' && p.charAt(1) === '-') return null;
    if (p.indexOf('background') === 0) return 'bg';
    if (p === 'color' || p === 'caret-color' || p === '-webkit-text-fill-color' || p === 'text-emphasis-color' || p === '-webkit-text-stroke-color' || p === 'text-decoration-color') return 'text';
    if (p === 'fill' || p === 'stroke' || p === 'stop-color') return 'icons';
    if (p === 'box-shadow' || p === 'text-shadow') return 'shadows';
    if (/^(border|outline|column-rule|text-decoration)/.test(p)) return 'borders';
    return null;
  }
  function filterDecls(res, M) {
    var E = M.el; if (!E) return res;
    return res.filter(function (d) { var g = propGroup(d[0]); return !g || E[g] !== false; });
  }

  /* returns [[prop, value], ...] of colour overrides for a CSSStyleDeclaration */
  var FS_KW = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
  function scaleFontSize(v, k, isRoot) {                 // absolute sizes are scaled; rem/em/% follow the (scaled) root and parent
    v = v.trim().toLowerCase(); if (!v) return null;
    if (/^[\d.]+(px|pt|pc|in|cm|mm|q)$/.test(v)) return 'calc(' + v + ' * ' + k + ')';
    if (FS_KW[v]) return 'calc(' + FS_KW[v] + 'px * ' + k + ')';
    if (isRoot && /^[\d.]+(%|em)$/.test(v)) return 'calc(' + v + ' * ' + k + ')';
    if (/^(clamp|calc|min|max)\(/.test(v) && !/rem|em\b|%|var\(/.test(v)) return 'calc(' + v + ' * ' + k + ')';
    var vm = /^var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)$/.exec(v);
    if (vm) { var rv = resolveVar(vm[1]); if (rv && /^[\d.]+(px|pt|pc|in|cm|mm|q)$/i.test(rv.trim())) return 'calc(' + v + ' * ' + k + ')'; }
    return null;
  }
  var curRoot = false;
  function declsFor(style, M, own, isRoot) { curRoot = !!isRoot; return filterDecls(declsForRaw(style, M, own), M); }
  function declsForRaw(style, M, own) {
    curStyle = style;
    var res = [], arr = [], i;
    try { for (i = 0; i < style.length; i++) arr.push(style[i]); } catch (e) { return res; }
    if (!arr.length) return res;
    var joined = ' ' + arr.join(' ') + ' ';
    var get = function (p) {
      var v = ''; try { v = style.getPropertyValue(p).trim(); } catch (e) { return ''; }
      if (own) { var o = own.get(p); if (o && o.out === v) return ''; }
      return v;
    };
    var push = function (p, v) { res.push([p, v]); };
    var bgMapped = null, fgMapped = null, fgIndex = -1;

    /* custom properties */
    if (joined.indexOf(' --') >= 0) {
      arr.forEach(function (n) {
        if (n.slice(0, 2) !== '--' || n.slice(0, 5) === '--nc-') return;
        var v = get(n); if (!v || v.length > 700) return;
        var nm = n.slice(2);
        if (C.parseColor(v) !== null || v.indexOf('var(') >= 0) {
          push('--nc-bg-' + nm, M.mapValue(v, 'bg')); push('--nc-fg-' + nm, M.mapValue(v, 'fg')); push('--nc-bd-' + nm, M.mapValue(v, 'bd'));
        } else if (/[#(]|[a-z]/i.test(v)) {
          var mv = M.mapValue(v, 'bg'); if (mv !== v) { push('--nc-bg-' + nm, mv); push('--nc-bd-' + nm, M.mapValue(v, 'bd')); }
        }
      });
    }
    /* backgrounds */
    if (joined.indexOf(' background') >= 0) {
      var sh = get('background'), ctok = null, img = null;
      if (sh) { ctok = colorTokenIn(sh, M); img = imageTokensOf(sh, M); }
      else { ctok = get('background-color') || null; img = get('background-image') || null; if (img && !/gradient\(|var\(/i.test(img)) img = null; }
      if (ctok) {
        var mc = M.mapValue(ctok, 'bg');
        if (mc !== ctok) {
          push('background-color', mc); var pc = C.parseColor(mc);
          if (!pc && /^var\(/i.test(ctok)) { var vn = varName(ctok), vv = vn && resolveVar(vn), vc = vv && C.parseColor(vv); if (vc) pc = M.mapColor(vc, 'bg'); }   // colour lives in a variable
          if (pc && pc.a > 0.9) bgMapped = pc;
        } else if (KW_COLOR.test(ctok.trim())) push('background-color', ctok);
      } else if (sh) push('background-color', 'transparent');
      if (img && /gradient\(|var\(/i.test(img)) { var mi = M.mapValue(img, 'bg'); if (mi !== img) push('background-image', mi); }
    }
    /* borders / outlines / decoration colours */
    if (/ (border|outline|column-rule|text-decoration)/.test(joined)) {
      var done = {};
      BORDER_SH.forEach(function (sh2) {
        var isC = /-color$/.test(sh2);                                  // border-color & co are shorthands: only probed, never listed
        if (!isC && joined.indexOf(' ' + sh2 + '-') < 0) return;
        var v = get(sh2); if (!v) return;
        if (isC) { var cv = M.mapValue(v, 'bd'); if (cv !== v) push(sh2, cv); done[sh2] = 1; return; }
        var tok = colorTokenIn(v, M), role = sh2 === 'text-decoration' ? 'fg' : 'bd';
        if (!tok) {
          if (v.indexOf('var(') >= 0 && hasCompositeColorVar(v, M)) push(sh2, M.mapValue(v, role));
          done[sh2] = 1; return;
        }
        var mv = M.mapValue(tok, role);
        if (mv !== tok) push(sh2 + '-color', mv);
        done[sh2] = 1;
      });
      arr.forEach(function (n) {
        if (!BORDER_LONG.test(n) && n !== 'border-color' && n !== 'text-decoration-color') return;
        var base = n.slice(0, -6);
        if (done[base] || (done.border && /^border/.test(n))) return;
        for (var k in done) if (k !== 'border' && k !== base && n.indexOf(k + '-') === 0) return;
        var v = get(n); if (!v) return;
        var mv = M.mapValue(v, n === 'text-decoration-color' ? 'fg' : 'bd');
        if (mv !== v) push(n, mv); else if (KW_COLOR.test(v)) push(n, v);
      });
    }
    /* foreground-ish */
    COLOR_PROPS_FG.forEach(function (p) {
      if (joined.indexOf(' ' + p + ' ') < 0) return;
      var v = get(p); if (!v) return;
      var mv = M.mapValue(v, 'fg');
      if (mv !== v) {
        push(p, mv);
        if (p === 'color') { var pf = C.parseColor(mv); if (pf) { fgMapped = pf; fgIndex = res.length - 1; } }
      } else if (KW_COLOR.test(v)) push(p, v);
    });
    if (joined.indexOf(' accent-color ') >= 0) { var acv = get('accent-color'); if (acv && !/^(auto|inherit|initial|unset|revert)$/i.test(acv)) { var mac = M.mapValue(acv, 'bg'); if (mac !== acv) push('accent-color', mac); } }
    if (joined.indexOf(' stop-color ') >= 0) { var sc = get('stop-color'); if (sc) { var ms = M.mapValue(sc, 'bg'); if (ms !== sc) push('stop-color', ms); } }
    ['box-shadow', 'text-shadow'].forEach(function (p) {
      if (joined.indexOf(' ' + p + ' ') < 0) return;
      var v = get(p); if (!v || v === 'none') return;
      var mv = M.mapValue(v, 'sh'); if (mv !== v) push(p, mv);
    });
    if (M.textScale && M.textScale !== 1 && joined.indexOf(' font-size ') >= 0) {
      var fsv = get('font-size'), fss = fsv && scaleFontSize(fsv, M.textScale, curRoot);
      if (fss) push('font-size', fss);
    }
    if (bgMapped && !fgMapped && joined.indexOf(' color ') >= 0) {           // text kept as-is (e.g. white) on a recoloured background
      var ov = get('color'), opc = ov && C.parseColor(ov);
      if (opc && opc.a > 0.9) { var of = M.fixContrast(opc, bgMapped); if (of !== opc) push('color', C.toCss(of)); }
    }
    /* a rule that sets both: guarantee readable text */
    if (bgMapped && fgMapped && fgIndex >= 0) {
      var fixed = M.fixContrast(fgMapped, bgMapped);
      if (fixed !== fgMapped) res[fgIndex][1] = C.toCss(fixed);
    }
    return res;
  }

  /* ------------------------------------------------------------------ rules -> override css */
  function getRules(sheet) {
    try { return sheet.cssRules; } catch (e) { /* cross-origin */ }
    var href = sheet.href; if (!href) return null;
    return xoRules(href);
  }
  function xoRules(href) {
    var c = xo.get(href);
    if (c && c !== 'pending') return c.cssRules;
    if (c === undefined) {
      xo.set(href, 'pending');
      send({ type: 'nc-fetch-text', url: href }).then(function (r) {
        var parsed = null;
        if (r && r.ok && typeof r.text === 'string') {
          try { parsed = new CSSStyleSheet({ baseURL: href }); parsed.replaceSync(r.text); } catch (e) { parsed = null; }
        }
        xo.set(href, parsed);
        if (S) S.dirty();
      });
    }
    return null;
  }
  function declText(d) { return d.map(function (x) { return x[0] + ':' + x[1] + '!important'; }).join(';'); }
  function plainText(d) { return d.map(function (x) { return x[0] + ':' + x[1]; }).join(';'); }

  function ruleToCss(rule, M, mode) {
    try {
      if (rule instanceof CSSStyleRule) {
        var nested = '';
        if (rule.cssRules && rule.cssRules.length) nested = rulesToCss(rule.cssRules, M, mode);
        var d = declText(declsFor(rule.style, M, null, /(^|,)\s*(html|:root)\s*(,|$)/i.test(rule.selectorText)));
        if (!d && !nested) return '';
        return rule.selectorText + '{' + d + (d && nested ? ';' : '') + nested + '}';
      }
      if (rule instanceof CSSMediaRule) { var im = rulesToCss(rule.cssRules, M, mode); return im ? '@media ' + rule.media.mediaText + '{' + im + '}' : ''; }
      if (rule instanceof CSSSupportsRule) { var isp = rulesToCss(rule.cssRules, M, mode); return isp ? '@supports ' + rule.conditionText + '{' + isp + '}' : ''; }
      if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) { var il = rulesToCss(rule.cssRules, M, mode); return il ? '@layer ' + (rule.name || '') + '{' + il + '}' : ''; }
      if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) {
        var ic = rulesToCss(rule.cssRules, M, mode);
        return ic ? '@container ' + (rule.containerName ? rule.containerName + ' ' : '') + (rule.containerQuery || rule.conditionText) + '{' + ic + '}' : '';
      }
      if (rule instanceof CSSImportRule) {
        var sh = rule.styleSheet; if (!sh) return '';
        var rr = getRules(sh) || (rule.href ? xoRules(rule.href) : null); if (!rr) return '';
        var inner = rulesToCss(rr, M, mode); if (!inner) return '';
        var mt = rule.media && rule.media.mediaText;
        if (rule.layerName) inner = '@layer ' + rule.layerName + '{' + inner + '}';
        return mt && mt !== 'all' ? '@media ' + mt + '{' + inner + '}' : inner;
      }
      if (rule instanceof CSSKeyframesRule) {
        var kf = '';
        for (var i = 0; i < rule.cssRules.length; i++) {
          var k = rule.cssRules[i], kd = declsFor(k.style, M);
          if (kd.length) kf += k.keyText + '{' + plainText(kd) + '}';
        }
        return kf ? '@keyframes ' + rule.name + '{' + kf + '}' : '';
      }
      if (typeof CSSNestedDeclarations !== 'undefined' && rule instanceof CSSNestedDeclarations) {
        var nd = declsFor(rule.style, M); return nd.length ? declText(nd) + ';' : '';
      }
      if (rule.cssRules && rule.cssRules.length && rule.cssText) {          // @scope, @starting-style, ...
        var hi = rule.cssText.indexOf('{'); var ig = rulesToCss(rule.cssRules, M, mode);
        return hi > 0 && ig ? rule.cssText.slice(0, hi) + '{' + ig + '}' : '';
      }
    } catch (e) { /* skip rule */ }
    return '';
  }
  function rulesToCss(rules, M, mode) {
    var s = '';
    for (var i = 0; i < rules.length; i++) s += ruleToCss(rules[i], M, mode);
    return s;
  }

  /* ------------------------------------------------------------------ output sheets per root */
  var ours = new WeakSet();
  function createRef(ctx) {
    if (useAdopted) {
      var sh = new CSSStyleSheet(); ours.add(sh);
      return { sheet: sh, set: function (css) { try { sh.replaceSync(css); } catch (e) { /* noop */ } }, disable: function (b) { sh.disabled = b; }, remove: function () { /* detached by attach() */ } };
    }
    var el = DOC.createElement('style'); el.setAttribute('data-nightcade', '');
    (ctx.isDoc ? DOC.documentElement : ctx.root).appendChild(el);
    return { el: el, set: function (css) { el.textContent = css; }, disable: function (b) { if (el.sheet) el.sheet.disabled = b; }, remove: function () { el.remove(); } };
  }
  function attach(ctx) {
    if (!useAdopted) return;
    try {
      var keep = Array.prototype.filter.call(ctx.root.adoptedStyleSheets, function (s) { return !ours.has(s); });
      ctx.root.adoptedStyleSheets = keep.concat(ctx.list.map(function (r) { return r.sheet; }));
    } catch (e) { /* noop */ }
  }
  function ensureAttached(ctx) {
    if (!useAdopted || !ctx.list.length) return;
    var a = ctx.root.adoptedStyleSheets, n = ctx.list.length;
    if (a.length < n) return attach(ctx);
    for (var i = 0; i < n; i++) if (a[a.length - n + i] !== ctx.list[i].sheet) return attach(ctx);
  }

  var PAT = {
    dots: ['<rect x="6" y="6" width="2" height="2"/>', 14],
    grid: ['<rect width="14" height="1"/><rect width="1" height="14"/>', 14],
    scan: ['<rect y="0" width="14" height="1"/><rect y="4" width="14" height="1"/><rect y="7" width="14" height="1"/><rect y="11" width="14" height="1"/>', 14],
    check: ['<rect width="17" height="17" fill-opacity=".45"/><rect x="17" y="17" width="17" height="17" fill-opacity=".45"/>', 34],
    stripe: ['<path d="M0 14L14 0M-1 1L1-1M13 15L15 13" stroke="#000" stroke-width="1" fill="none"/>', 14]
  };
  function backdropCss(st) {
    var ui = st.settings.ui || {}, p = PAT[ui.backdrop]; if (!p) return '';
    var strength = clampN(ui.backdropStrength, 0, 100) / 100; if (!strength) return '';
    var dark = st.face === 'd', col = dark ? st.pal[6] : st.pal[5], op = strength * (dark ? 0.2 : 0.3);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + p[1] + '" height="' + p[1] + '" shape-rendering="crispEdges" fill="#000">' + p[0] + '</svg>';
    var url = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    return 'html::before{content:""!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:block!important;background:' + col + '!important;opacity:' + op.toFixed(3) + '!important;-webkit-mask-image:var(--nc-hole,linear-gradient(#000,#000)),' + url + '!important;mask-image:var(--nc-hole,linear-gradient(#000,#000)),' + url + '!important;-webkit-mask-size:100% 100%,' + p[1] + 'px!important;mask-size:100% 100%,' + p[1] + 'px!important;-webkit-mask-repeat:no-repeat,repeat!important;mask-repeat:no-repeat,repeat!important;-webkit-mask-composite:source-in!important;mask-composite:intersect!important}';
  }
  function baseCss(ctx, st) {
    var M = st.M, s = st.settings, css = '', light = st.face === 'l';
    if (ctx.isDoc) {
      var ac = C.hexToRgb(st.pal[9]);
      var E = M.el || {};
      if (E.accentBg !== false) css += ':root{accent-color:' + (light ? st.pal[7] : st.pal[9]) + '}';   // native checkboxes, radios, sliders, progress
      if (light) css += '[data-nc-glow],#cinematics,#cinematics-container,#cinematic-container,yt-cinematic-container-renderer,[id*="ambient-mode" i],ytd-watch-flexy #cinematics *{visibility:hidden!important;background:transparent!important}';
      if (E.bg !== false) css += ':root{color-scheme:' + (light ? 'light' : 'dark') + '!important}';
      if (E.bg !== false) {                                           // native controls the page left unstyled; :where() keeps specificity at zero so any site rule still wins
        var fg0 = E.text !== false ? 'color:' + M.baseFg + ';' : '';
        css += ':where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]):not([type=file]):not([type=color]),select,textarea){background-color:' + st.pal[1] + ';' + fg0 + 'border-color:' + st.pal[4] + '}' +
          ':where(button,input[type=button],input[type=submit],input[type=reset]){background-color:' + st.pal[2] + ';' + fg0 + 'border-color:' + st.pal[4] + '}' +
          'input::file-selector-button{background-color:' + st.pal[2] + ';' + fg0 + 'border-color:' + st.pal[4] + '}';
      }
      var hb = (E.bg !== false ? 'background-color:' + M.baseBg + ';' : '') + (E.text !== false ? 'color:' + M.baseFg : '');
      if (hb) css += 'html{' + hb + '}';
      if (M.textScale && M.textScale !== 1) css += 'html{font-size:' + Math.round(M.textScale * 10000) / 100 + '%}';
      if (isTop) css += backdropCss(st);
      if (E.selection !== false) css += '::selection{background-color:rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',.45)}';
    }
    if (ctx.isDoc && isTop && !light) {                              // built-in PDF viewers live in an <embed>: filter it, since page colors can't be reached
      var bt = (s.brightness || 100) / 100, ct = (s.contrast || 100) / 100;
      var pdfDoc = DOC.contentType === 'application/pdf';
      css += (pdfDoc ? 'html' : 'embed[type="application/x-google-chrome-pdf"],embed[type="application/pdf"]') + '{filter:invert(.92) hue-rotate(180deg) brightness(' + bt + ') contrast(' + ct + ')!important;background:' + M.baseBg + '!important}';
      if (pdfDoc) {                                                  // tint: multiply by the colour the filter turns into the theme background
        var tb = C.hexToRgb(st.pal[0]), t = [tb.r / 255, tb.g / 255, tb.b / 255];
        var rot = [-0.574 * t[0] + 1.430 * t[1] + 0.144 * t[2], 0.426 * t[0] + 0.430 * t[1] + 0.144 * t[2], 0.426 * t[0] + 1.430 * t[1] - 0.856 * t[2]];
        var pre = rot.map(function (v) { return Math.round(255 * Math.max(0, Math.min(1, (0.92 - v) / 0.84))); });
        css += 'html::after{content:""!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;mix-blend-mode:multiply!important;background:rgb(' + pre.join(',') + ')!important}';
      }
    }
    if (!light || st.invert) {                                      // images only need care on dark pages
      var dim = 1 - clampN(s.imageDim, 0, 70) / 100;
      if (s.imageMode !== 'off' && dim < 1 && !st.invert) css += ':where(img:not([data-nc-img="logo"]):not([data-nc-img="diagram"])){filter:brightness(' + dim + ')}';
      if (s.imageMode === 'smart') {
        if (s.invertLogos) css += 'img[data-nc-img="logo"]{filter:invert(1) hue-rotate(180deg)!important}';
        if (s.invertDiagrams && !st.invert) css += 'img[data-nc-img="diagram"]{filter:invert(1) hue-rotate(180deg) brightness(.92)!important}';
      }
    }
    return css;
  }
  function clampN(v, a, b) { v = +v; if (isNaN(v)) v = a; return Math.min(b, Math.max(a, v)); }

  function makeCtx(root, isDoc, st) {
    var ctx = { root: root, isDoc: isDoc, list: [], srcMap: new Map(), base: null };
    ctx.base = createRef(ctx); ctx.list.push(ctx.base); ctx.base.set(baseCss(ctx, st)); attach(ctx);
    return ctx;
  }

  function scanRoot(ctx, st) {
    var srcs = [], i;
    try { for (i = 0; i < ctx.root.styleSheets.length; i++) srcs.push(ctx.root.styleSheets[i]); } catch (e) { /* noop */ }
    if (useAdopted) {
      try { Array.prototype.forEach.call(ctx.root.adoptedStyleSheets, function (s) { if (!ours.has(s)) srcs.push(s); }); } catch (e) { /* noop */ }
    }
    var seen = new Set(), changed = false;
    srcs.forEach(function (sheet) {
      var on = sheet.ownerNode;
      if (on && on.hasAttribute && on.hasAttribute('data-nightcade')) return;
      seen.add(sheet);
      var ent = ctx.srcMap.get(sheet);
      var rules = sheet.disabled ? [] : getRules(sheet);
      if (!rules) return;
      var n = rules.length, mt = sheet.media && sheet.media.mediaText || '';
      if (!ent) { ent = { ref: createRef(ctx), n: -1, mt: null }; ctx.srcMap.set(sheet, ent); ctx.list.push(ent.ref); changed = true; }
      if (ent.n !== n || ent.mt !== mt) {
        var css = rulesToCss(rules, st.M);
        if (css && mt && mt !== 'all') css = '@media ' + mt + '{' + css + '}';
        ent.ref.set(css); ent.n = n; ent.mt = mt;
      }
    });
    ctx.srcMap.forEach(function (ent, sheet) {
      if (!seen.has(sheet)) {
        ctx.srcMap.delete(sheet); ent.ref.remove();
        ctx.list = ctx.list.filter(function (r) { return r !== ent.ref; }); changed = true;
      }
    });
    if (changed) attach(ctx); else ensureAttached(ctx);
  }

  /* ------------------------------------------------------------------ inline styles & legacy attributes */
  function applyInline(el, st) {
    var style = el.style; if (!style) return;
    var own = st.own.get(el);
    var decls = declsFor(style, st.M, own);
    var isSvg = typeof SVGElement !== 'undefined' && el instanceof SVGElement;
    var extra = function (attr, prop, role) {
      var v = el.getAttribute(attr); if (!v || own && own.has(prop)) return;
      if (C.parseColor(v) === null) return;
      var mv = st.M.mapValue(v, role); if (mv !== v) decls.push([prop, mv]);
    };
    if (el.hasAttribute('bgcolor')) extra('bgcolor', 'background-color', 'bg');
    if (el.localName === 'font') extra('color', 'color', 'fg');
    if (el.localName === 'body') { extra('text', 'color', 'fg'); }
    if (isSvg) {
      var fa = el.getAttribute('fill'), fc = fa && C.parseColor(fa);
      extra('fill', 'fill', el.localName === 'rect' && fc && fc.a > 0.5 && C.lum(fc) > 0.7 ? 'bg' : 'fg'); extra('stroke', 'stroke', 'fg'); extra('stop-color', 'stop-color', 'bg');
    }
    decls = filterDecls(decls, st.M);
    if (!decls.length) return;
    if (!own) { own = new Map(); st.own.set(el, own); st.ownList.add(el); }
    decls.forEach(function (d) {
      var p = d[0], prev = own.get(p);
      var orig = prev ? prev.orig : { v: style.getPropertyValue(p), pr: style.getPropertyPriority(p) };
      try { style.setProperty(p, d[1], 'important'); } catch (e) { return; }
      own.set(p, { out: style.getPropertyValue(p), orig: orig });
    });
    el.__ncs = el.getAttribute('style');
  }
  function revertInline(st) {
    st.ownList.forEach(function (el) {
      var own = st.own.get(el); if (!own) return;
      own.forEach(function (rec, p) {
        try {
          if (el.style.getPropertyValue(p) !== rec.out) return;      // page changed it since: leave alone
          if (rec.orig.v) el.style.setProperty(p, rec.orig.v, rec.orig.pr); else el.style.removeProperty(p);
        } catch (e) { /* noop */ }
      });
      try { if (el.getAttribute('style') === '') el.removeAttribute('style'); } catch (e) { /* noop */ }
      delete el.__ncs;
    });
    st.own = new WeakMap(); st.ownList = new Set();
  }
  var INLINE_SEL = '[style],[bgcolor],font[color],body[text],svg [fill],svg [stroke],svg [stop-color],svg[fill],svg[stroke]';

  /* ------------------------------------------------------------------ images */
  var imgCache = new Map();
  function classifyPixels(d, w, h) {
    var total = w * h, tr = 0, n = 0, sumL = 0, white = 0, buckets = new Set();
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) { tr++; continue; }
      n++; sumL += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++;
      buckets.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    }
    if (!n) return 'skip';
    var trF = tr / total, avg = sumL / n;
    if (trF > 0.12 && avg < 0.42) return 'logo';
    if (trF > 0.12 && avg > 0.7) return 'lightlogo';
    if (trF < 0.05 && white / n > 0.55 && buckets.size <= 48 && w >= 24) return 'diagram';
    return 'photo';
  }
  function classifySvgText(txt) {
    if (/<image[\s>]/i.test(txt) || /<(linearGradient|radialGradient)/i.test(txt) && false) return 'photo';
    var cols = [], re = /(?:fill|stroke|stop-color|color)\s*[=:]\s*["']?\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)/gi, m;
    while ((m = re.exec(txt))) {
      var v = m[1].toLowerCase(); if (v === 'none' || v === 'currentcolor' || v === 'inherit' || v === 'transparent') continue;
      var c = C.parseColor(v); if (c && c.a > 0.2) cols.push(c);
    }
    if (!cols.length) return /<svg/i.test(txt) ? 'logo' : 'skip';   // default SVG fill is black
    var avg = cols.reduce(function (a, c) { return a + C.lum(c); }, 0) / cols.length;
    return avg < 0.15 ? 'logo' : (avg > 0.8 ? 'lightlogo' : 'photo');
  }
  function drawAndClassify(src, w, h) {
    var maxd = Math.max(w, h), sc = Math.min(1, 64 / maxd), cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
    var cv = DOC.createElement('canvas'); cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(src, 0, 0, cw, ch);
    return classifyPixels(cx.getImageData(0, 0, cw, ch).data, cw, ch);
  }
  function b64ToBlob(b64, type) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: type || 'image/png' });
  }
  function classifyImage(img) {
    var src = img.currentSrc || img.src; if (!src) return Promise.resolve('skip');
    if (imgCache.has(src)) return Promise.resolve(imgCache.get(src));
    var done = function (c) { imgCache.set(src, c); return c; };
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var isSvg = /^data:image\/svg\+xml/i.test(src) || /\.svg(\?|#|$)/i.test(src);
    if (isSvg) {
      if (/^data:/i.test(src)) {
        try { var txt = /;base64,/i.test(src) ? atob(src.split(',')[1]) : decodeURIComponent(src.slice(src.indexOf(',') + 1)); return Promise.resolve(done(classifySvgText(txt))); } catch (e) { return Promise.resolve(done('skip')); }
      }
      return send({ type: 'nc-fetch-text', url: src }).then(function (r) { return done(r && r.ok ? classifySvgText(r.text) : 'skip'); });
    }
    if (!nw || !nh) return Promise.resolve('skip');
    if (nw * nh < 9 || (nw < 3 && nh < 3)) return Promise.resolve(done('skip'));
    try { return Promise.resolve(done(drawAndClassify(img, nw, nh))); } catch (e) { /* tainted */ }
    if (nw * nh > 360000) return Promise.resolve(done('photo'));
    return send({ type: 'nc-fetch-image', url: src }).then(function (r) {
      if (!r || !r.ok) return done('photo');
      return createImageBitmap(b64ToBlob(r.b64, r.mime)).then(function (bmp) { return done(drawAndClassify(bmp, bmp.width, bmp.height)); }, function () { return done('photo'); });
    });
  }
  function handleImg(img, st) {
    if ((st.face === 'l' && !st.invert) || st.settings.imageMode !== 'smart' || !(st.settings.invertLogos || st.settings.invertDiagrams)) return;
    if (!img.complete) return;
    var cur = img.currentSrc || img.src;
    if (img.__ncSrc === cur) return;
    img.__ncSrc = cur;
    classifyImage(img).then(function (c) {
      if (!S || S !== st) return;
      if (st.invert) c = c === 'lightlogo' ? 'logo' : (c === 'logo' || c === 'diagram' ? 'photo' : c); else if (c === 'lightlogo') c = 'photo';
      if (c === 'logo' && !st.settings.invertLogos) c = 'photo';
      if (c === 'diagram' && !st.settings.invertDiagrams) c = 'photo';
      if (c === 'skip') img.removeAttribute('data-nc-img'); else if (img.getAttribute('data-nc-img') !== c) img.setAttribute('data-nc-img', c);
    });
  }

  /* ------------------------------------------------------------------ session (dynamic mode) */
  function systemDark() { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return true; } }
  function startDynamic(cfg) {
    var theme = globalThis.NC_THEMES[cfg.theme] || globalThis.NC_THEMES.arcadia;
    var face = globalThis.NC_face(cfg.theme, cfg.face, systemDark());
    var pal = face === 'l' ? theme.l : theme.d;
    var invert = face === 'l' && !!cfg.__invert;
    var M = C.createMapper(pal, { brightness: cfg.brightness, contrast: cfg.contrast, sepia: cfg.sepia, grayscale: cfg.grayscale, elements: cfg.elements, custom: cfg.theme === 'custom', textScale: ((cfg.ui && cfg.ui.textSize) || 100) / 100 }, face === 'l', invert);
    M.setResolver(resolveVar);
    var st = S = {
      settings: cfg, theme: theme, face: face, invert: invert, pal: pal, M: M, ctxs: new Map(), own: new WeakMap(), ownList: new Set(),
      mo: null, timer: null, queue: new Set(), imgQueue: new Set(), ceQueue: new Map(), pending: false, disabled: false
    };
    st.dirty = function () { schedule(); };
    var docCtx = makeCtx(DOC, true, st); st.ctxs.set(DOC, docCtx);

    function registerRoot(sr) {
      if (st.ctxs.has(sr)) return;
      var ctx = makeCtx(sr, false, st); st.ctxs.set(sr, ctx);
      try { st.mo.observe(sr, MO_OPTS); } catch (e) { /* noop */ }
      try { sr.addEventListener('load', onLoad, true); } catch (e) { /* noop */ }
      queueSubtree(sr); discover(sr);
    }
    function discover(node) {
      var list;
      try { list = node.querySelectorAll ? node.querySelectorAll('*') : []; } catch (e) { return; }
      for (var i = 0; i < list.length; i++) checkCE(list[i]);
      if (node.nodeType === 1) checkCE(node);
    }
    function checkCE(el) {
      var sr = shadowOf(el);
      if (sr) { registerRoot(sr); st.ceQueue.delete(el); }
      else if (el.localName.indexOf('-') > 0 && !st.ceQueue.has(el)) st.ceQueue.set(el, 0);   // custom elements attach their root late
    }
    function queueSubtree(node) {
      try {
        if (node.nodeType === 1) { if (node.matches && node.matches(INLINE_SEL)) st.queue.add(node); if (node.localName === 'img') st.imgQueue.add(node); }
        if (node.querySelectorAll) {
          node.querySelectorAll(INLINE_SEL).forEach(function (e) { st.queue.add(e); });
          node.querySelectorAll('img').forEach(function (e) { st.imgQueue.add(e); });
        }
      } catch (e) { /* noop */ }
    }
    function work() {
      st.pending = false;
      if (S !== st || st.disabled) return;
      st.ctxs.forEach(function (ctx) { scanRoot(ctx, st); });
      var t0 = performance.now();
      var it = st.queue.values(), n;
      while (!(n = it.next()).done) {
        st.queue.delete(n.value);
        if (n.value.isConnected) { applyInline(n.value, st); }
        if (performance.now() - t0 > 12) break;
      }
      var it2 = st.imgQueue.values(), m;
      while (!(m = it2.next()).done) { st.imgQueue.delete(m.value); handleImg(m.value, st); if (performance.now() - t0 > 18) break; }
      if (st.queue.size || st.imgQueue.size) schedule();
      if (st.selfWrites) { st.mo.takeRecords(); st.selfWrites = false; }
    }
    function schedule() {
      if (st.pending || S !== st) return; st.pending = true;
      (typeof requestAnimationFrame === 'function' && !DOC.hidden) ? requestAnimationFrame(work) : later(work, 30);
    }
    var MO_OPTS = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'bgcolor', 'color', 'fill', 'stroke', 'text', 'rel', 'href', 'media', 'disabled'], characterData: true };
    function onLoad(ev) {
      var t = ev.target; if (!t || t.nodeType !== 1) return;
      if (t.localName === 'img') { st.imgQueue.add(t); schedule(); }
      else if (t.localName === 'link') schedule();
    }
    st.onLoad = onLoad;
    st.mo = new MutationObserver(function (muts) {
      var touched = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var nd = m.addedNodes[j]; if (nd.nodeType !== 1) continue;
            if (nd.hasAttribute && nd.hasAttribute('data-nightcade')) continue;
            queueSubtree(nd); touched = true;
            checkCE(nd);
            if (nd.firstElementChild) { var cs = nd.querySelectorAll('*'); for (var k = 0; k < cs.length && k < 4000; k++) checkCE(cs[k]); }
          }
          if (m.removedNodes.length) touched = true;
        } else if (m.type === 'attributes') {
          var t = m.target;
          if (m.attributeName === 'style' && t.__ncs === t.getAttribute('style')) continue;
          if (t.hasAttribute && t.hasAttribute('data-nightcade')) continue;
          if (t.localName === 'link' || t.localName === 'style') touched = true; else { st.queue.add(t); touched = true; }
        } else if (m.type === 'characterData') touched = true;
      }
      if (touched) { schedule(); if (st.markAudit) st.markAudit(); }
    });
    st.mo.observe(DOC, MO_OPTS);
    DOC.addEventListener('load', onLoad, true);

    function nativeDarkNow() {                              // is the page's own look dark? (checked on the visible area)
      try {
        var el = DOC.elementFromPoint(Math.max(1, innerWidth / 2), Math.max(1, innerHeight / 2));
        for (var e = el; e && e !== DOC.documentElement; e = e.parentElement) { var c = C.parseColor(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return C.lum(c) < 0.2; }
        var bb = DOC.body && C.parseColor(getComputedStyle(DOC.body).backgroundColor); if (bb && bb.a > 0.5) return C.lum(bb) < 0.2;
        var cb = C.parseColor(getComputedStyle(DOC.documentElement).backgroundColor); return !!(cb && cb.a > 0.5 && C.lum(cb) < 0.2);
      } catch (e2) { return false; }
    }
    function detect() { if (S === st && !st.invert && st.face === 'l' && !invertDoc && nativeDarkNow()) { invertDoc = true; decideAndRun(); } }
    function onReady() { scanRoot(docCtx, st); queueSubtree(DOC); discover(DOC); schedule(); if (st.face === "l") { later(detect, 250); later(detect, 1500); later(detect, 4000); } }
    if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', onReady, { once: true }); else later(onReady, 0);
    st.timer = setInterval(function () {
      if (S !== st || st.disabled || DOC.hidden) return;
      st.ceQueue.forEach(function (n, el) {
        var sr = shadowOf(el);
        if (sr) { registerRoot(sr); st.ceQueue.delete(el); } else if (n > 12 || !el.isConnected) st.ceQueue.delete(el); else st.ceQueue.set(el, n + 1);
      });
      st.ctxs.forEach(function (ctx) { scanRoot(ctx, st); });
    }, 700);

    /* ---- contrast audit: any visible text that still ends up unreadable against its real background gets a corrected colour.
       Generic safety net for colours that live in separate rules, variables or inherited values. ---- */
    var aRef = createRef(docCtx); docCtx.list.push(aRef); attach(docCtx);
    var aColors = new Set(), aWalker = null, aDirty = true, aDone = null, aBg = null;
    var A_SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, OPTION: 1, TITLE: 1 };
    function aBlend(a, b) { var al = a.a == null ? 1 : a.a; return { r: a.r * al + b.r * (1 - al), g: a.g * al + b.g * (1 - al), b: a.b * al + b.b * (1 - al), a: 1 }; }
    function aBgOf(el) {
      if (!el || el.nodeType !== 1) return { c: C.parseColor(M.baseBg) };
      var hit = aBg.get(el); if (hit) return hit;
      var cs = getComputedStyle(el), b = C.parseColor(cs.backgroundColor), img = cs.backgroundImage, res;
      var plainRoot = el === DOC.body || el === DOC.documentElement;
      if (img && img !== 'none' && !plainRoot) res = { c: null };                       // text over a picture or gradient: unknown, leave it
      else if (b && b.a >= 0.98) res = { c: b };
      else { var up = aBgOf(el.parentElement); res = !up.c ? up : { c: b && b.a > 0 ? aBlend(b, up.c) : up.c }; }
      aBg.set(el, res); return res;
    }
    function aHex(c) { return '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(''); }
    function auditNode(nd) {
      var txt = nd.nodeValue; if (!txt || !/\S/.test(txt)) return;
      var el = nd.parentElement; if (!el || A_SKIP[el.tagName] || aDone.has(el)) return;
      aDone.add(el);
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible' || +cs.opacity === 0) return;
      var fg = C.parseColor(cs.color); if (!fg || fg.a < 0.2) return;
      var bg = aBgOf(el); if (!bg.c) return;
      var f = fg.a < 1 ? aBlend(fg, bg.c) : fg;
      if (C.contrast(f, bg.c) >= 3) return;
      var fx = M.fixContrast(f, bg.c, 4.5), hex = aHex(fx);
      el.setAttribute('data-nc-c', hex);
      if (!aColors.has(hex)) { aColors.add(hex); var css = ''; aColors.forEach(function (h) { css += ':root [data-nc-c="' + h + '"]{color:' + h + '!important}'; }); aRef.set(css); }
    }
    function auditRun() {
      if (S !== st || st.disabled || !DOC.body || DOC.hidden || M.el.text === false) return;
      var t0 = performance.now();
      if (!aWalker) { if (!aDirty) return; aDirty = false; aWalker = DOC.createTreeWalker(DOC.body, 4, null); aDone = new WeakSet(); aBg = new WeakMap(); }
      var nd, n = 0;
      while ((nd = aWalker.nextNode())) {
        try { auditNode(nd); } catch (e) { /* noop */ }
        if ((++n & 15) === 0 && performance.now() - t0 > 10) return;                    // continue on the next tick
      }
      aWalker = null; aDone = null; aBg = null;
    }
    st.markAudit = function () { aDirty = true; };
    st.atimer = setInterval(auditRun, 250);
    /* ambient glow (blurred halo canvases such as YouTube's ambient mode): drawn from the video, so it can't be recoloured and is dark by design.
       On a light face it would paint a black block over the page, so such canvases are hidden there. */
    if (st.face === 'l') {
      var blurPx = function (f) { var m = /blur\(\s*([\d.]+)px/.exec(f || ''); return m ? +m[1] : 0; };
      var glowRun = function () {
        if (S !== st || st.disabled || DOC.hidden) return;
        var cv = DOC.querySelectorAll('canvas'), n = Math.min(cv.length, 60);
        var hb = DOC.querySelectorAll('[id*="cinematic" i],[class*="cinematic" i],[id*="ambient" i]');
        for (var j = 0; j < hb.length && j < 20; j++) { if (hb[j] !== DOC.body && hb[j] !== DOC.documentElement && !hb[j].querySelector('video') && !hb[j].hasAttribute('data-nc-glow')) { var rr = hb[j].getBoundingClientRect(); if (rr.width * rr.height >= 60000) hb[j].setAttribute('data-nc-glow', ''); } }
        for (var i = 0; i < n; i++) {
          var c = cv[i]; if (c.hasAttribute('data-nc-glow')) continue;
          if (/ambient|cinematic|glow/i.test((c.id || '') + ' ' + (typeof c.className === 'string' ? c.className : '') + ' ' + (c.parentElement ? c.parentElement.id : ''))) { c.setAttribute('data-nc-glow', ''); continue; }
          for (var e = c, d = 0; e && e !== DOC.body && d < 5; e = e.parentElement, d++) {
            var fl = ''; try { fl = getComputedStyle(e).filter; } catch (x) { /* noop */ }
            if (blurPx(fl) >= 12) { var r = e.getBoundingClientRect(); if (r.width * r.height >= 60000 && !e.querySelector('video')) e.setAttribute('data-nc-glow', ''); break; }
          }
        }
      };
      glowRun(); st.gtimer = setInterval(glowRun, 1000);
    }
    /* backdrop pattern stays off photos and video: cut holes in the pattern overlay where media sits (viewport rects, refreshed on scroll/resize/tick) */
    if (isTop && backdropCss(st)) {
      var holeKey = '', holeRaf = 0;
      var holeRun = function () {
        holeRaf = 0;
        if (S !== st || st.disabled) return;
        var W = innerWidth, H = innerHeight, r = '', n = 0, ms = DOC.querySelectorAll('video,img,canvas,picture,iframe');
        for (var i = 0; i < ms.length && n < 80; i++) {
          var b = ms[i].getBoundingClientRect();
          if (b.width < 48 || b.height < 48 || b.bottom < 0 || b.top > H || b.right < 0 || b.left > W) continue;
          if (ms[i].localName === 'iframe' && b.width * b.height < 40000) continue;
          var x0 = Math.max(0, b.left), y0 = Math.max(0, b.top), x1 = Math.min(W, b.right), y1 = Math.min(H, b.bottom);
          r += '<rect x="' + Math.round(x0) + '" y="' + Math.round(y0) + '" width="' + Math.round(x1 - x0) + '" height="' + Math.round(y1 - y0) + '"/>'; n++;
        }
        var key = W + 'x' + H + r; if (key === holeKey) return; holeKey = key;
        try {
          if (!r) { DOC.documentElement.style.removeProperty('--nc-hole'); return; }
          var sv = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><mask id="m"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' + r + '</g></mask><rect width="100%" height="100%" mask="url(#m)"/></svg>';
          DOC.documentElement.style.setProperty('--nc-hole', 'url("data:image/svg+xml,' + encodeURIComponent(sv) + '")');
        } catch (e3) { /* noop */ }
      };
      var holeQ = function () { if (!holeRaf) holeRaf = requestAnimationFrame(holeRun); };
      st.holeQ = holeQ; st.htimer = setInterval(holeQ, 400);
      addEventListener('scroll', holeQ, { passive: true, capture: true }); addEventListener('resize', holeQ, { passive: true });
      st.holeOff = function () { removeEventListener('scroll', holeQ, true); removeEventListener('resize', holeQ); try { DOC.documentElement.style.removeProperty('--nc-hole'); } catch (e4) { /* noop */ } };
      holeQ();
    }
    scanRoot(docCtx, st); queueSubtree(DOC); schedule();
  }
  /* ------------------------------------------------------------------ lifecycle */
  function stop() {
    var st = S; if (!st) return;
    S = null;
    try { if (st.timer) clearInterval(st.timer); if (st.atimer) clearInterval(st.atimer); if (st.gtimer) clearInterval(st.gtimer); if (st.htimer) clearInterval(st.htimer); if (st.holeOff) st.holeOff(); } catch (e) { /* noop */ }
    try { if (st.mo) st.mo.disconnect(); } catch (e) { /* noop */ }
    try { DOC.removeEventListener('load', st.onLoad, true); } catch (e) { /* noop */ }
    if (st.ctxs) {
      st.ctxs.forEach(function (ctx) {
        if (useAdopted) { try { ctx.root.adoptedStyleSheets = Array.prototype.filter.call(ctx.root.adoptedStyleSheets, function (s) { return !ours.has(s); }); } catch (e) { /* noop */ } }
        else ctx.list.forEach(function (r) { r.remove(); });
      });
    }
    if (st.ownList) { try { revertInline(st); } catch (e) { /* noop */ } }
    try { DOC.querySelectorAll('img[data-nc-img]').forEach(function (i) { i.removeAttribute('data-nc-img'); }); DOC.querySelectorAll('[data-nc-c]').forEach(function (i) { i.removeAttribute('data-nc-c'); }); DOC.querySelectorAll('[data-nc-glow]').forEach(function (i) { i.removeAttribute('data-nc-glow'); }); } catch (e) { /* noop */ }
  }

  var invertDoc = false;
  function decideAndRun() {
    if (!settings) return;
    var d = NC.decide(settings, hostKey);
    stop();
    if (!d.active) return;
    startDynamic(Object.assign({}, settings, { __invert: invertDoc }));
  }

  function boot() {
    NC.load().then(function (s) {
      settings = s;
      var go = function () { decideAndRun(); };
      if (isTop) { hostKey = ownHost(); go(); }
      else {
        hostKey = ownHost(); go();                                  // optimistic until we know the tab's site
        send({ type: 'nc-host' }).then(function (r) { if (r && r.host && r.host !== hostKey) { hostKey = r.host; decideAndRun(); } });
      }
    });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (settings && settings.face === 'system') decideAndRun(); }); } catch (e) { /* noop */ }
    api.storage.onChanged.addListener(function (ch, area) {
      if (!ch[NC.KEY]) return;
      settings = NC.merge(ch[NC.KEY].newValue);
      clearTimeout(boot.t); boot.t = setTimeout(decideAndRun, 60);
    });
    api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg && msg.type === 'nc-status') {
        sendResponse({ host: hostKey, top: isTop, active: !!(S && !S.disabled), face: S && S.face, decision: settings ? NC.decide(settings, hostKey).active : false });
      }
    });
  }
  boot();
})();
