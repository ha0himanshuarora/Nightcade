/* Nightcade colour engine: parsing, theme-aware dark mapping, value tokenizer. */
(function (g) {
  'use strict';
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- colour space helpers ---------- */
  function rgb2hsl(r, gg, b) {
    r /= 255; gg /= 255; b /= 255;
    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn, h = 0, s = 0, l = (mx + mn) / 2;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((gg - b) / d) % 6; else if (mx === gg) h = (b - r) / d + 2; else h = (r - gg) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, gg = 0, b = 0;
    if (h < 60) { r = c; gg = x; } else if (h < 120) { r = x; gg = c; } else if (h < 180) { gg = c; b = x; }
    else if (h < 240) { gg = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((gg + m) * 255), b: Math.round((b + m) * 255) };
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b); if (l1 < l2) { var t = l1; l1 = l2; l2 = t; }
    return (l1 + 0.05) / (l2 + 0.05);
  }
  function hex2(n) { n = clamp(Math.round(n), 0, 255); return (n < 16 ? '0' : '') + n.toString(16); }
  function toCss(c) {
    if (c.a >= 0.999 || c.a === undefined) return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
    return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + (Math.round(c.a * 1000) / 1000) + ')';
  }
  function hexToRgb(h) { h = h.replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }

  /* ---------- parsing ---------- */
  var NAMED = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
  var COLOR_FN = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix']);
  var pcache = new Map(), cvs = null;

  function viaCanvas(str) {
    try {
      if (!cvs) { var c = document.createElement('canvas'); c.width = c.height = 1; cvs = c.getContext('2d', { willReadFrequently: true }); }
      cvs.clearRect(0, 0, 1, 1);
      cvs.fillStyle = '#010203'; cvs.fillStyle = str;
      var probe = cvs.fillStyle;
      cvs.fillStyle = '#030201'; cvs.fillStyle = str;
      if (probe === '#010203' && cvs.fillStyle === '#030201') return null;      // rejected by browser
      cvs.fillRect(0, 0, 1, 1);
      var d = cvs.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) { return null; }
  }
  function num(s, pct) { return s.slice(-1) === '%' ? parseFloat(s) / 100 * pct : parseFloat(s); }

  function parseColor(str) {
    if (typeof str !== 'string') return null;
    var s = str.trim().toLowerCase();
    if (!s) return null;
    if (pcache.has(s)) return pcache.get(s);
    var res = null, m;
    if (s === 'transparent') res = { r: 0, g: 0, b: 0, a: 0 };
    else if ((m = /^#([0-9a-f]+)$/.exec(s)) && [3, 4, 6, 8].indexOf(m[1].length) >= 0) {
      var h = m[1];
      if (h.length < 6) h = h.split('').map(function (x) { return x + x; }).join('');
      res = { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    } else if ((m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(s))) {
      res = { r: clamp(num(m[1], 255), 0, 255), g: clamp(num(m[2], 255), 0, 255), b: clamp(num(m[3], 255), 0, 255), a: m[4] === undefined ? 1 : clamp(num(m[4], 1), 0, 1) };
    } else if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(s))) {
      var rgb = hsl2rgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
      res = { r: rgb.r, g: rgb.g, b: rgb.b, a: m[4] === undefined ? 1 : clamp(num(m[4], 1), 0, 1) };
    } else if (NAMED.has(s)) res = viaCanvas(s);
    else {
      var fn = /^([a-z-]+)\(/.exec(s);
      if (fn && COLOR_FN.has(fn[1]) && s.indexOf('var(') < 0 && s.indexOf('currentcolor') < 0) res = viaCanvas(s);
    }
    if (pcache.size > 5000) pcache.clear();
    pcache.set(s, res);
    return res;
  }

  /* ---------- the theme-aware mapper ---------- */
  function createMapper(face, tune, light, invert) {
    var darkFace = face;
    tune = tune || {};
    var bgC = hexToRgb(darkFace[0]), cream = hexToRgb(darkFace[6]);
    var hb = rgb2hsl(bgC.r, bgC.g, bgC.b), hc = rgb2hsl(cream.r, cream.g, cream.b);
    var T = {
      Hb: hb[0], Sb: Math.min(hb[1], tune.custom ? 0.7 : 0.3), Lb: hb[2] < 0.03 ? hb[2] : (tune.custom ? clamp(hb[2], 0.02, 0.4) : clamp(hb[2], 0.05, 0.16)),   // a custom background is honoured more closely
      Hc: hc[0], Sc: Math.min(hc[1], 0.45), Lt: Math.max(hc[2], 0.82)
    };
    var b = (tune.brightness == null ? 100 : tune.brightness) / 100, ct = (tune.contrast == null ? 100 : tune.contrast) / 100,
      sp = (tune.sepia || 0) / 100, gs = (tune.grayscale || 0) / 100;
    var refBg = hsl2rgb(T.Hb, T.Sb, T.Lb);
    var plain = b === 1 && ct === 1 && !sp && !gs;

    function applyTune(c) {
      if (plain) return c;
      var r = c.r / 255, gg = c.g / 255, bl = c.b / 255;
      r *= b; gg *= b; bl *= b;
      r = (r - 0.5) * ct + 0.5; gg = (gg - 0.5) * ct + 0.5; bl = (bl - 0.5) * ct + 0.5;
      r = clamp(r, 0, 1); gg = clamp(gg, 0, 1); bl = clamp(bl, 0, 1);
      if (sp) {
        var r2 = (0.393 + 0.607 * (1 - sp)) * r + (0.769 - 0.769 * (1 - sp)) * gg + (0.189 - 0.189 * (1 - sp)) * bl;
        var g2 = (0.349 - 0.349 * (1 - sp)) * r + (0.686 + 0.314 * (1 - sp)) * gg + (0.168 - 0.168 * (1 - sp)) * bl;
        var b2 = (0.272 - 0.272 * (1 - sp)) * r + (0.534 - 0.534 * (1 - sp)) * gg + (0.131 + 0.869 * (1 - sp)) * bl;
        r = clamp(r2, 0, 1); gg = clamp(g2, 0, 1); bl = clamp(b2, 0, 1);
      }
      if (gs) {
        var y = 0.2126 * r + 0.7152 * gg + 0.0722 * bl;
        r = lerp(r, y, gs); gg = lerp(gg, y, gs); bl = lerp(bl, y, gs);
      }
      return { r: r * 255, g: gg * 255, b: bl * 255, a: c.a };
    }
    function out(h, s, l, a) { var c = hsl2rgb(h, s, l); c.a = a; return applyTune(c); }

    function mapBgHsl(h, s, l, neutral) {
      var L, S = s;
      if (!neutral && s > 0.35 && l > 0.15 && l <= 0.82) {              // brand / accent colours: keep identity
        L = Math.min(l, 0.5) * (l > 0.62 ? 0.85 : 1); S = s * 0.92;
      } else if (l >= 0.5) {
        var t = (1 - l) / 0.5; L = T.Lb + 0.17 * Math.pow(t, 0.65); S = neutral ? T.Sb : s * (l > 0.85 ? 0.55 : 0.72);
      } else {
        var lo = T.Lb * 0.6; L = lo + (l / 0.5) * (T.Lb + 0.17 - lo); S = neutral ? T.Sb : s;
      }
      return [neutral ? T.Hb : h, S, L];
    }
    function mapColorDark(c, role) {
      var hsl = rgb2hsl(c.r, c.g, c.b), h = hsl[0], s = hsl[1], l = hsl[2];
      var chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255, neutral = s < 0.14 || chroma < 0.075;
      if (role === 'sh') { if (l < 0.5) return c; role = 'bg'; }
      if (role === 'bg' && neutral && c.a < 0.6) {
        if (c.a < 0.3 && l < 0.5) return { r: 255, g: 255, b: 255, a: c.a };
        if (l < 0.5 || c.a < 0.3) return c;
      }
      var m;
      if (role === 'bg') { m = mapBgHsl(h, s, l, neutral); return out(m[0], m[1], m[2], c.a); }
      if (role === 'bd') {
        var L2, S2, H2 = neutral ? T.Hb : h;
        if (l >= 0.5) { m = mapBgHsl(h, s, l, neutral); L2 = m[2] + 0.1; S2 = m[1]; }
        else { L2 = lerp(0.5, 0.36, l / 0.5); S2 = neutral ? T.Sb : s * 0.8; }
        return out(H2, S2, L2, c.a);
      }
      /* fg */
      var Lf, Sf, Hf;
      if (l >= 0.5) { Lf = Math.min(l, 0.95); Sf = neutral ? T.Sc * 0.5 : s; Hf = neutral ? T.Hc : h; }
      else { Lf = lerp(T.Lt, 0.64, l / 0.5); Sf = neutral ? T.Sc * 0.6 : Math.min(s, 0.9) * 0.9; Hf = neutral ? T.Hc : h; }
      var cand = hsl2rgb(Hf, Sf, Lf);
      while (contrast(cand, refBg) < 4.6 && Lf < 0.88) { Lf += 0.03; cand = hsl2rgb(Hf, Sf, Lf); }   // keep saturated text readable (pure blue, red...)
      return out(Hf, Sf, Lf, c.a);
    }
    /* ---- light face: tint a light page with the theme's light palette ---- */
    var P = darkFace.map(function (h) { return h ? hexToRgb(h) : null; });
    var mixc = function (a, b, t) { return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) }; };
    var pBg = P[0], pSur = P[1], pVar = P[2], pOnv = P[3], pOut = P[4], pInk = P[5];
    var darkVar = { r: pVar.r * 0.72, g: pVar.g * 0.72, b: pVar.b * 0.72 };
    function fin(c, a) { var o = applyTune({ r: c.r, g: c.g, b: c.b, a: a }); return o; }
    function mapColorLight(c, role) {
      var hsl = rgb2hsl(c.r, c.g, c.b), h = hsl[0], s = hsl[1], l = hsl[2];
      var chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255, neutral = s < 0.14 || chroma < 0.075;
      var lI = Math.min(1, (1 - l) + 0.06);                                                // lightness flipped (dark-only sites)
      if (role === 'sh') { if (l < 0.5) return c; role = 'bg'; }
      if (role === 'bg') {
        if (neutral && c.a < 0.6) return (invert && l >= 0.5) ? fin(pInk, c.a) : c;
        if (!invert && l < 0.3) return fin(c, c.a);                                         // dark areas stay dark on light sites
        if (!neutral && s > 0.35 && l > 0.15 && l <= 0.82) return fin(c, c.a);             // brand colours keep identity
        if (invert && !neutral && l < 0.4) return fin(hsl2rgb(h, s * 0.5, clamp(lI, 0.86, 0.96)), c.a);
        if (!neutral) { var k = 0.55 + 0.45 * hsl2lum(pBg); var q = hsl2rgb(h, s * 0.7, l * k); return fin(q, c.a); }   // tinted pastels
        var L = (invert && l < 0.5) ? lI : l, out;
        if (L >= 0.985) out = pBg;
        else if (L >= 0.95) out = pSur;
        else if (L >= 0.88) out = mixc(pVar, pSur, (L - 0.88) / 0.07);
        else if (L >= 0.5) out = mixc(darkVar, pVar, (L - 0.5) / 0.38);
        else out = mixc(pInk, darkVar, L / 0.5);
        return fin(out, c.a);
      }
      if (role === 'bd') {
        var bo, lb = invert ? 1 - l : l;
        if (lb >= 0.5) bo = mixc(mixc(pVar, pInk, 0.22), pVar, clamp((lb - 0.5) / 0.5, 0, 1) * 0.5);
        else bo = mixc(pInk, pVar, lb / 0.5 * 0.55);
        if (!neutral) bo = hsl2rgb(h, s * 0.6, clamp(l, 0.35, 0.7));
        return fin(bo, c.a);
      }
      /* fg */
      var lf = l;
      if (invert && l >= 0.5) lf = 1 - l;                                                 // light text on a dark-only site becomes dark
      else if (l >= 0.5) return fin(c, c.a);                                              // light text sits on a coloured/dark face
      var fo;
      if (neutral) fo = mixc(pInk, pOnv, clamp(lf / 0.5, 0, 1) * 0.85);
      else { fo = hsl2rgb(h, Math.min(s, 0.9), Math.min(lf, 0.42)); }
      var tries = 0;
      while (contrast(fo, pBg) < 4.6 && tries++ < 10) fo = mixc(fo, pInk, 0.2);
      return fin(fo, c.a);
    }
    function hsl2lum(c) { return lum(c); }
    var baseMap = light ? mapColorLight : mapColorDark;
    /* ---- accents: saturated brand colours become the theme's own accent colours (by hue family) ---- */
    var E = { bg: true, text: true, accentText: true, accentBg: true, borders: true, icons: true, shadows: true, selection: true };
    if (tune.elements) Object.keys(tune.elements).forEach(function (k) { if (k in E) E[k] = tune.elements[k] !== false; });
    var aRed = P[7], aGreen = P[8], aMust = P[9], aPrimary = light ? P[7] : P[9];
    function accentFor(h) {
      if (h >= 345 || h < 20) return aRed;
      if (h < 75) return aMust;
      if (h < 190) return aGreen;
      return aPrimary;
    }
    function mapColor(c, role) {
      if (role !== 'sh') {
        var hsl = rgb2hsl(c.r, c.g, c.b), s = hsl[1], l = hsl[2];
        var chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
        if (s > 0.35 && chroma > 0.16 && l > (role === 'bg' ? 0.25 : 0.15) && l < (role === 'bg' ? 0.85 : 0.9)) {   // brand / accent colour
          if (!(role === 'fg' ? E.accentText : E.accentBg)) return c;                                            // switched off: leave as the site had it
          var ac = accentFor(hsl[0]), ah = rgb2hsl(ac.r, ac.g, ac.b);
          var res = hsl2rgb(ah[0], ah[1], clamp(ah[2] + (l - 0.5) * (role === 'bg' ? 0.3 : 0), 0.18, 0.88));   // keep hover/active shades distinct
          if (role === 'fg') {
            var ref = light ? pBg : refBg, tries = 0;
            while (contrast(res, ref) < 4.6 && tries++ < 12) res = light ? mixc(res, pInk, 0.15) : mixc(res, { r: 255, g: 255, b: 255 }, 0.12);
          }
          return fin(res, c.a);
        }
        if (role === 'fg' && !E.text) return c;
      }
      return baseMap(c, role);
    }

    /* make fg readable on a known bg (rules that set both) */
    function fixContrast(fg, bg, min) {
      min = min || 3.5;
      if (contrast(fg, bg) >= min) return fg;
      var hsl = rgb2hsl(fg.r, fg.g, fg.b);
      var up = hsl2rgb(hsl[0], hsl[1] * 0.6, 0.93), dn = hsl2rgb(hsl[0], hsl[1], 0.08);
      var cu = contrast(up, bg), cd = contrast(dn, bg);
      var pick = cu >= cd ? up : dn; pick.a = fg.a; return pick;
    }

    var vcache = new Map();
    function colorToken(tok, role) {
      var c = parseColor(tok);
      if (!c || c.a === 0) return tok;
      return toCss(mapColor(c, role));
    }
    function matchParen(s, open) {
      var depth = 0, q = null;
      for (var i = open; i < s.length; i++) {
        var ch = s[i];
        if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") q = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (!depth) return i; }
      }
      return -1;
    }
    function splitTop(s, sep) {
      var out = [], depth = 0, cur = '', q = null;
      for (var i = 0; i < s.length; i++) {
        var ch = s[i];
        if (q) { cur += ch; if (ch === '\\') { cur += s[++i] || ''; } else if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === '(') depth++; else if (ch === ')') depth--;
        if (!depth && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (sep !== ' ' || cur) { out.push(cur); cur = ''; } }
        else cur += ch;
      }
      if (cur || sep !== ' ') out.push(cur);
      return out;
    }
    var ROLE_KEY = { bg: 'bg', sh: 'bg', fg: 'fg', bd: 'bd' };
    function varRewrite(inner, role) {
      var parts = splitTop(inner, ',');
      var name = parts[0].trim();
      if (name.slice(0, 2) !== '--') return 'var(' + inner + ')';
      var fb = parts.length > 1 ? parts.slice(1).join(',') : null;
      var nm = '--nc-' + ROLE_KEY[role] + '-' + name.slice(2);
      var orig = 'var(' + name + (fb !== null ? ',' + mapValue(fb, role) : '') + ')';
      return 'var(' + nm + ',' + orig + ')';
    }
    var resolver = null;
    function resolveVars(t) {                              // hsl(var(--x)) and friends: inline the variable's value
      for (var n = 0; n < 6 && t.indexOf('var(') >= 0; n++) {
        var before = t;
        t = t.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, function (all, name, fb) { var v = resolver(name); return v ? v : (fb != null ? fb.trim() : all); });
        if (t === before) break;
      }
      return t;
    }
    function mapValue(val, role) {
      var key = role + '\u0001' + val, useCache = !(resolver && val.indexOf('var(') >= 0);
      var hit = useCache ? vcache.get(key) : undefined; if (hit !== undefined) return hit;
      var o = '', i = 0, n = val.length, m;
      while (i < n) {
        var ch = val[i];
        if (ch === '"' || ch === "'") { var j = i + 1; while (j < n && val[j] !== ch) { if (val[j] === '\\') j++; j++; } o += val.slice(i, j + 1); i = j + 1; continue; }
        if (ch === '#') {
          m = /^#[0-9a-fA-F]+/.exec(val.slice(i, i + 10));
          if (m && [4, 5, 7, 9].indexOf(m[0].length) >= 0) { o += colorToken(m[0], role); i += m[0].length; continue; }
          o += ch; i++; continue;
        }
        if (/[a-zA-Z_]/.test(ch) || (ch === '-' && /[a-zA-Z_-]/.test(val[i + 1] || ''))) {
          m = /^-?-?[a-zA-Z_][\w-]*/.exec(val.slice(i, i + 80));
          if (!m) { o += ch; i++; continue; }
          var id = m[0], lid = id.toLowerCase(), e = i + id.length;
          if (val[e] === '(') {
            var close = matchParen(val, e);
            if (close < 0) { o += val.slice(i); break; }
            var inner = val.slice(e + 1, close);
            if (lid === 'url') o += val.slice(i, close + 1);
            else if (lid === 'var') o += varRewrite(inner, role);
            else if (COLOR_FN.has(lid)) {
              var ct = val.slice(i, close + 1);
              if (ct.indexOf('var(') >= 0 && resolver) {
                /* rgb(var(--c) / var(--opacity)): the opacity can differ per element (a state class sets it to 0), so keep it live
                   and only inline the colour channels. Resolving it once would turn every faded-out item fully opaque. */
                var sl = ct.lastIndexOf('/'), alpha = sl > 0 ? ct.slice(sl + 1, -1).trim() : '';
                if (alpha && alpha.indexOf('var(') >= 0) {
                  var hp = parseColor(colorToken(resolveVars(ct.slice(0, sl)) + ' / 1)', role));
                  if (hp) { o += 'rgb(' + Math.round(hp.r) + ' ' + Math.round(hp.g) + ' ' + Math.round(hp.b) + ' / ' + alpha + ')'; i = close + 1; continue; }
                }
                ct = resolveVars(ct);
              }
              o += colorToken(ct, role);
            }
            else o += id + '(' + mapValue(inner, role) + ')';
            i = close + 1; continue;
          }
          if (NAMED.has(lid)) o += colorToken(lid, role); else o += id;
          i = e; continue;
        }
        m = /^[+-]?[\d.]+[a-zA-Z%]*/.exec(val.slice(i, i + 40));
        if (m) { o += m[0]; i += m[0].length; continue; }
        o += ch; i++;
      }
      if (useCache) { if (vcache.size > 8000) vcache.clear(); vcache.set(key, o); }
      return o;
    }
    return { setResolver: function (f) { resolver = f; vcache.clear(); }, mapColor: mapColor, mapValue: mapValue, fixContrast: fixContrast, splitTop: splitTop, matchParen: matchParen, tune: applyTune, params: T,
      baseBg: light ? toCss(applyTune(pBg)) : toCss(applyTune(hsl2rgb(T.Hb, T.Sb, T.Lb))),
      invert: !!invert, el: E, textScale: +tune.textScale || 1, baseFg: light ? toCss(applyTune(pInk)) : toCss(applyTune(hsl2rgb(T.Hc, T.Sc * 0.6, T.Lt))), light: !!light };
  }

  g.NCColor = { parseColor: parseColor, createMapper: createMapper, rgb2hsl: rgb2hsl, hsl2rgb: hsl2rgb, lum: lum, contrast: contrast, toCss: toCss, hexToRgb: hexToRgb, NAMED: NAMED };
})(typeof globalThis !== 'undefined' ? globalThis : this);
