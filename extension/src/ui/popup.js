/* Reels Analysis — popup. Talks to the active tab: AR_DATA pageInfo, AR_TOGGLE_APP, AR_VC. */
(function () {
  'use strict';
  var PH = window.PH || {};
  var $ = function (id) { return document.getElementById(id); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-ic]'), function (n) { n.innerHTML = PH[n.getAttribute('data-ic')] || ''; });

  var tab = null;
  var KIND = { reel: 'صفحة ريل', profile: 'صفحة حساب', feed: 'خلاصة الريلز', other: 'صفحة أخرى' };

  function setStatus(text, ok) { var s = $('status'); s.textContent = text; s.className = 'status' + (ok ? ' ok' : ''); }
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
      setStatus('الإضافة تعمل في إنستغرام فقط. افتح إنستغرام لاستعمالها.');
      $('openGrid').disabled = true;
      return;
    }
    send({ type: 'AR_DATA', fn: 'pageInfo' }).then(function (r) {
      if (!r || !r.ok || !r.result) { setStatus('لم تجهز الصفحة بعد. أعد تحميلها.'); return; }
      var p = r.result;
      var t = 'إنستغرام' + ' · ' + (KIND[p.kind] || KIND.other);
      if (p.username) t += ' ⁦@' + p.username + '⁩';
      setStatus(t, true);
    }, function () { setStatus('أعد تحميل الصفحة لتعمل الإضافة فيها.'); });
  });

  $('openGrid').addEventListener('click', function () {
    send({ type: 'AR_TOGGLE_APP' }).then(function () { window.close(); }, function () { setStatus('أعد تحميل الصفحة ثم جرّب مرة أخرى.'); });
  });
  $('openLib').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/library.html') });
    window.close();
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
      $('updT').textContent = 'نسخة جديدة ' + u.version + ' متاحة';
      if (u.notes) $('updT').parentNode.title = u.notes;
      $('updBtn').addEventListener('click', function () { chrome.tabs.create({ url: u.url || 'https://aminellkadaoui.github.io/amine-reels/' }); window.close(); });
      $('upd').hidden = false;
    });
  } catch (e) {}

  // Video quick controls → overlay.js  in the active tab.
  Array.prototype.forEach.call(document.querySelectorAll('.vc [data-a]'), function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
      var value = v == null ? undefined : (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
      $('vcErr').hidden = true;
      send({ type: 'AR_VC', action: a, value: value }).then(function (r) {
        if (r && r.speed != null) $('speed').textContent = (+Number(r.speed).toFixed(2)) + '×';
        if (r && r.ok === false) { $('vcErr').textContent = 'لا يوجد فيديو ظاهر في هذه الصفحة.'; $('vcErr').hidden = false; }
      }, function () { $('vcErr').textContent = 'لا يوجد فيديو في هذه الصفحة، أو تحتاج إلى إعادة تحميلها.'; $('vcErr').hidden = false; });
    });
  });
})();

document.getElementById('openResearch').addEventListener('click', function () {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/research.html') });
});
