/* Nightcade background: defaults, shortcuts, badge, and cross-origin fetch proxy for the content script. */
(function () {
  'use strict';
  try { if (typeof importScripts === 'function') importScripts('shared/defaults.js'); } catch (e) { /* event page: loaded via manifest */ }
  var NC = globalThis.NC, api = NC.api;

  function normHost(url) {
    try { var u = new URL(url); return u.protocol === 'file:' ? 'file' : u.hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }
  function badge(s) {
    try {
      var off = !s.enabled;
      api.action.setBadgeText({ text: off ? 'OFF' : '' });
      api.action.setBadgeBackgroundColor({ color: '#B83A2D' });
      if (api.action.setBadgeTextColor) api.action.setBadgeTextColor({ color: '#FFFFFF' });
    } catch (e) { /* noop */ }
  }
  api.runtime.onInstalled.addListener(function () {
    NC.load().then(function (s) { return NC.save(s); });
  });
  NC.load().then(badge);
  api.storage.onChanged.addListener(function (ch) { if (ch[NC.KEY]) badge(NC.merge(ch[NC.KEY].newValue)); });

  api.commands.onCommand.addListener(function (cmd) {
    NC.load().then(function (s) {
      if (cmd === 'toggle-global') { s.enabled = !s.enabled; return NC.save(s); }
      if (cmd === 'toggle-site') {
        return api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
          var host = tabs[0] && normHost(tabs[0].url); if (!host) return;
          var d = NC.decide(Object.assign({}, s, { enabled: true }), host);
          var m = NC.ruleFor(s.siteRules, host), key = m ? m.host : host, r = Object.assign({}, m && m.rule);
          r.enabled = !d.active;
          s.siteRules[key] = r;
          return NC.save(s);
        });
      }
    });
  });

  var MAX_IMG = 1500000;
  function toB64(buf) {
    var u = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === 'nc-host') { sendResponse({ host: sender.tab ? normHost(sender.tab.url) : '' }); return; }
    if (msg.type === 'nc-fetch-text') {
      fetch(msg.url, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.text();
      }).then(function (t) { sendResponse({ ok: true, text: t.length > 4000000 ? '' : t }); }, function () { sendResponse({ ok: false }); });
      return true;
    }
    if (msg.type === 'nc-fetch-image') {
      fetch(msg.url, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        var len = +r.headers.get('content-length') || 0; if (len > MAX_IMG) throw new Error('big');
        var mime = (r.headers.get('content-type') || '').split(';')[0];
        return r.arrayBuffer().then(function (b) { if (b.byteLength > MAX_IMG) throw new Error('big'); return { ok: true, b64: toB64(b), mime: mime }; });
      }).then(sendResponse, function () { sendResponse({ ok: false }); });
      return true;
    }
  });
})();
