/* Reels Analysis — popup. Talks to the active tab: AR_DATA pageInfo, AR_TOGGLE_APP, AR_VC. Strings: lib/i18n-pages.js */
(function () {
  'use strict';
  var PH = window.PH || {};
  var I = window.ARI18N, T = I.t;
  var $ = function (id) { return document.getElementById(id); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-ic]'), function (n) { n.innerHTML = PH[n.getAttribute('data-ic')] || ''; });

  var tab = null;
  var KINDS = ['reel', 'profile', 'feed', 'other'];
  // remembered so a language switch can redraw them
  var status = { key: 'p.checking', ok: false, page: null };
  var vcErrKey = null, upd = null;

  function drawStatus() {
    var s = $('status'), t;
    if (status.page) {
      var p = status.page;
      t = T('p.ig') + ' · ' + T('p.kind.' + (KINDS.indexOf(p.kind) >= 0 ? p.kind : 'other'));
      if (p.username) t += ' ⁦@' + p.username + '⁩';
    } else t = T(status.key);
    s.textContent = t; s.className = 'status' + (status.ok ? ' ok' : '');
  }
  function setStatus(key, ok, page) { status = { key: key, ok: !!ok, page: page || null }; drawStatus(); }
  function drawVcErr() { $('vcErr').hidden = !vcErrKey; if (vcErrKey) $('vcErr').textContent = T(vcErrKey); }
  function drawUpd() { if (upd) $('updT').textContent = T('p.updNew', { v: upd.version }); }
  function drawLang() {
    var pref = I.pref();
    Array.prototype.forEach.call(document.querySelectorAll('#lang [data-lang]'), function (b) {
      var on = b.getAttribute('data-lang') === pref;
      b.className = on ? 'on' : ''; b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function redraw() { drawStatus(); drawVcErr(); drawUpd(); drawLang(); }

  function send(msg) {
    return new Promise(function (res, rej) {
      if (!tab) return rej(new Error('no tab'));
      try {
        chrome.tabs.sendMessage(tab.id, msg, function (r) {
          var e = chrome.runtime.lastError;
          if (e) rej(new Error(e.message)); else res(r);
        });
      } catch (e) { rej(e); }
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    tab = tabs && tabs[0];
    var url = (tab && tab.url) || '';
    var supported = /^https:\/\/www\.instagram\.com\//.test(url);
    if (!supported) {
      setStatus('p.onlyIg');
      $('openGrid').disabled = true;
      return;
    }
    send({ type: 'AR_DATA', fn: 'pageInfo' }).then(function (r) {
      if (!r || !r.ok || !r.result) { setStatus('p.notReady'); return; }
      setStatus(null, true, r.result);
    }, function () { setStatus('p.reload'); });
  });

  $('openGrid').addEventListener('click', function () {
    send({ type: 'AR_TOGGLE_APP' }).then(function () { window.close(); }, function () { setStatus('p.reloadRetry'); });
  });
  $('openLib').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/library.html') });
    window.close();
  });
  $('openResearch').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/research.html') });
  });

  // language switch: Auto / العربية / English (saved in ar_settings.lang; every open page follows)
  Array.prototype.forEach.call(document.querySelectorAll('#lang [data-lang]'), function (b) {
    b.addEventListener('click', function () { I.set(b.getAttribute('data-lang')); drawLang(); });
  });

  try {
    chrome.storage.local.get('ar_library', function (o) {
      var n = ((o && o.ar_library) || []).length;
      $('libCount').textContent = n ? String(n) : '';
    });
  } catch (e) {}

  // update notice: background.js stores ar_update only while GitHub has a newer release (and clears it after updating)
  try {
    chrome.storage.local.get('ar_update', function (o) {
      var u = o && o.ar_update;
      if (!u || !u.version) return;
      upd = u; drawUpd();
      if (u.notes) $('updT').parentNode.title = u.notes;
      $('updBtn').addEventListener('click', function () { chrome.tabs.create({ url: u.url || 'https://aminellkadaoui.github.io/amine-reels/' }); window.close(); });
      $('upd').hidden = false;
    });
  } catch (e) {}

  // Video quick controls → overlay.js in the active tab.
  Array.prototype.forEach.call(document.querySelectorAll('.vc [data-a]'), function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
      var value = v == null ? undefined : (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
      vcErrKey = null; drawVcErr();
      send({ type: 'AR_VC', action: a, value: value }).then(function (r) {
        if (r && r.speed != null) $('speed').textContent = (+Number(r.speed).toFixed(2)) + '×';
        if (r && r.ok === false) { vcErrKey = 'p.noVideo'; drawVcErr(); }
      }, function () { vcErrKey = 'p.noVideo2'; drawVcErr(); });
    });
  });

  window.ARP.wire(redraw);
})();
