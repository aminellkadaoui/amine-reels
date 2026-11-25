/* Reels Analysis — in-page app (isolated world, instagram.com / youtube.com).
 *  Uses window.ARData (bridge.js) and window.PH (lib/phosphor/icons.js).
 * Everything lives in one Shadow DOM under #amine-reels-root. No animations, no transitions.
 * Text that changes while a video plays is updated through text nodes only (no DOM rebuilds). */
(function () {
  'use strict';
  if (window.__amineReelsApp) return;
  window.__amineReelsApp = true;

  // ---------------------------------------------------------------- helpers
  var PH = window.PH || {};
  var FPS = 30;
  var SPEEDS = [0.5, 1, 1.25, 1.5, 2];
  var LIB_KEY = 'ar_library';
  var FONT = 'AR Thmanyah Sans';

  // translations (lib/i18n.js + lib/i18n-app.js): every visible string goes through T()
  var I = window.ARI18N || { t: function (k, v) { return String(k).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); },
    lang: function () { return 'ar'; }, dir: function () { return 'rtl'; }, pref: function () { return 'auto'; }, set: function () {}, ready: Promise.resolve('ar'), onChange: function () {} };
  function T(k, v) { return I.t(k, v); }
  function rtl() { return I.dir() === 'rtl'; }
  // a template with node placeholders: tn('app.followers', {n: numEl}) → ['', numEl, ' followers']
  function tn(key, nodes) {
    var raw = I.t(key), out = [], re = /\{(\w+)\}/g, m, at = 0;
    while ((m = re.exec(raw))) { if (m.index > at) out.push(raw.slice(at, m.index)); out.push(nodes && nodes[m[1]] != null ? nodes[m[1]] : m[0]); at = re.lastIndex; }
    if (at < raw.length) out.push(raw.slice(at));
    return out;
  }
  function ic(name) { return PH[name] || ''; }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function iconEl(name, cls) { return el('span', { class: 'ic' + (cls ? ' ' + cls : ''), html: ic(name), 'aria-hidden': 'true' }); }
  function btn(iconName, label, onclick, cls, title) {
    return el('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', onclick: onclick, title: title || label || null, 'aria-label': title || label || null },
      [iconName ? iconEl(iconName) : null, label ? el('span', { class: 'lbl', text: label }) : null]);
  }

  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (n < 0) return T('app.hidden');
    var a = Math.abs(n);
    function f(x) { var s = x.toFixed(1); return s.slice(-2) === '.0' ? s.slice(0, -2) : s; }
    if (a >= 1e9) return f(n / 1e9) + 'B';
    if (a >= 1e6) return f(n / 1e6) + 'M';
    if (a >= 1e4) return f(n / 1e3) + 'K';
    if (a >= 1e3) return f(n / 1e3) + 'K';
    return String(Math.round(n));
  }
  function fmtOutlier(o) {
    if (o == null || isNaN(o)) return '—';
    if (o >= 0 && o < 0.1) return '<0.1×'; /* a real ratio is never 0 (0 views → null) */   // never «0×» for a real but tiny ratio
    var s = o >= 10 ? String(Math.round(o)) : (Math.round(o * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return s + '×';
  }
  function fmtPct(p) {
    if (p == null || isNaN(p)) return '—';
    return (p >= 10 ? String(Math.round(p)) : p >= 0.1 ? (Math.round(p * 10) / 10).toFixed(1).replace(/\.0$/, '') : '<0.1') + '%';
  }
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
  }
  // Relative time. Forms (lib/i18n-app.js rel.<unit>.<form>): 1 / 2 (Arabic dual) / few = 3–10 (plural) / many = 11+ (singular accusative).
  var UNITS = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  function relTime(ts) {
    if (!ts) return '—';
    var diff = Math.max(0, Date.now() / 1000 - ts);
    if (diff < 60) return T('rel.now');
    for (var i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      if (diff >= u[0]) {
        var n = Math.floor(diff / u[0]);
        var form = n === 1 ? '1' : n === 2 ? '2' : n <= 10 ? 'few' : 'many';
        return T('rel.ago', { x: T('rel.' + u[1] + '.' + form, { n: n }) });
      }
    }
    return T('rel.now');
  }
  function platformName(p) { return T(p === 'youtube' ? 'app.youtube' : 'app.instagram'); }
  function errText(e) {
    var m = String((e && e.message) || e || '');
    var l = m.toLowerCase();
    // the data layer (ig.js) already writes its messages in the user's language: never translate them again
    if (/[\u0600-\u06FF]/.test(m)) return m;                                   // an Arabic sentence
    if (I.lang() === 'en' && /^[A-Z].*\s.*\s.*[.!)]$/.test(m) && !/^(HTTP|TypeError|Error|NetworkError|Failed)/.test(m)) return m; // an English sentence
    if (/429|rate|too many|wait|throttl|limit/.test(l)) return T('app.err.rate', { p: platformName(state.platform) });
    if (/401|403|login|logged|auth|checkpoint/.test(l)) return T('app.err.login', { p: platformName(state.platform) });
    if (/404|not found|no such|doesn.t exist/.test(l)) return T('app.err.notFound');
    if (/network|failed to fetch|timeout|timed out/.test(l)) return T('app.err.network');
    if (/context invalidated|extension/.test(l)) return T('app.err.updated');
    if (/ardata|bridge/.test(l)) return T('app.err.bridge');
    return T('app.err.generic', { m: m });
  }
  function dataCall() {
    var args = arguments;
    if (!window.ARData || typeof window.ARData.call !== 'function') return Promise.reject(new Error('ARData bridge not ready'));
    return window.ARData.call.apply(window.ARData, args);
  }
  function keyOf(r) { return (r.platform || '') + ':' + (r.code || r.id || r.url); }

  // ---------------------------------------------------------------- storage (library)
  var saved = {}; // key -> true
  function libGet() {
    return new Promise(function (res) {
      try { chrome.storage.local.get(LIB_KEY, function (o) { res((o && o[LIB_KEY]) || []); }); } catch (e) { res([]); }
    });
  }
  function libSet(arr) {
    return new Promise(function (res) {
      try { var o = {}; o[LIB_KEY] = arr; chrome.storage.local.set(o, function () { res(); }); } catch (e) { res(); }
    });
  }
  function refreshSaved() {
    return libGet().then(function (arr) {
      saved = {};
      arr.forEach(function (r) { saved[keyOf(r)] = true; });
      updateSaveButtons();
    });
  }
  function toggleSave(reel) {
    var k = keyOf(reel);
    return libGet().then(function (arr) {
      var i = arr.findIndex(function (r) { return keyOf(r) === k; });
      if (i >= 0) arr.splice(i, 1);
      else {
        var copy = Object.assign({}, reel, { savedAt: Date.now() });
        var t = transcripts[k];
        if (t && t.ok) copy.transcript = { text: t.text, segments: t.segments || [], lang: t.lang || '', source: t.source || '' };
        arr.unshift(copy);
      }
      return libSet(arr);
    }).then(refreshSaved);
  }
  function attachTranscriptIfSaved(reel, t) {
    var k = keyOf(reel);
    if (!saved[k] || !t || !t.ok) return;
    libGet().then(function (arr) {
      var r = arr.find(function (x) { return keyOf(x) === k; });
      if (!r) return;
      r.transcript = { text: t.text, segments: t.segments || [], lang: t.lang || '', source: t.source || '' };
      libSet(arr);
    });
  }
  try {
    chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'local' && ch[LIB_KEY]) refreshSaved(); });
  } catch (e) {}

  // ---------------------------------------------------------------- settings (display mode) + folders
  var SET_KEY = 'ar_settings', FOLD_KEY = 'ar_folders';
  var settings = { mode: 'inline', theme: 'auto' }; // inline = inside Instagram's own page, separate = floating windows
  function loadSettings() {
    return new Promise(function (res) {
      try { chrome.storage.local.get(SET_KEY, function (o) { if (o && o[SET_KEY]) Object.assign(settings, o[SET_KEY]); res(); }); } catch (e) { res(); }
    });
  }
  // Instagram's current theme: <html class="__fb-dark-mode"> / "__fb-light-mode"; else the page background
  function igDark() {
    var c = document.documentElement.classList;
    if (c.contains('__fb-dark-mode')) return true;
    if (c.contains('__fb-light-mode')) return false;
    try {
      var c = getComputedStyle(document.body).backgroundColor, m = c && c.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3 && !(m.length >= 4 && +m[3] === 0)) return (+m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114) < 110;
    } catch (e) {}
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function wantDark() { return settings.theme === 'dark' ? true : settings.theme === 'light' ? false : igDark(); }
  // .dark = dark palette; .ig = Instagram's own variables (same theme as the page), else the fixed fallback palette
  function applyTheme() {
    var d = wantDark(), ig = d === igDark();
    [typeof root !== 'undefined' ? root : null, typeof inlineRoot !== 'undefined' ? inlineRoot : null, typeof dockRoot !== 'undefined' ? dockRoot : null]
      .forEach(function (r) { if (r && r.classList) { r.classList.toggle('dark', d); r.classList.toggle('ig', ig); } });
    if (typeof dockEl !== 'undefined' && dockEl) dockEl.classList.toggle('dark', d);
    if (typeof entryRoot !== 'undefined' && entryRoot) { entryRoot.classList.toggle('dark', d); entryRoot.classList.toggle('ig', ig); }
  }
  function setTheme(t) { settings.theme = t; saveSettings(); applyTheme(); }
  // merge into the stored object: ar_settings.lang belongs to ARI18N (never write a stale copy back)
  function saveSettings() {
    try {
      chrome.storage.local.get(SET_KEY, function (o) {
        var cur = (o && o[SET_KEY]) || {}; cur.mode = settings.mode; cur.theme = settings.theme;
        var w = {}; w[SET_KEY] = cur; chrome.storage.local.set(w);
      });
    } catch (e) {}
  }
  function foldersGet() {
    return new Promise(function (res) { try { chrome.storage.local.get(FOLD_KEY, function (o) { res((o && o[FOLD_KEY]) || []); }); } catch (e) { res([]); } });
  }
  function foldersSet(arr) { return new Promise(function (res) { try { var o = {}; o[FOLD_KEY] = arr; chrome.storage.local.set(o, function () { res(); }); } catch (e) { res(); } }); }
  // put / remove a reel in a folder (saves the reel to the library if needed)
  function setReelFolder(reel, folderId, on) {
    var k = keyOf(reel);
    return libGet().then(function (arr) {
      var r = arr.find(function (x) { return keyOf(x) === k; });
      if (!r) { r = Object.assign({}, reel, { savedAt: Date.now(), folders: [] }); arr.unshift(r); }
      r.folders = (r.folders || []).filter(function (f) { return f !== folderId; });
      if (on) r.folders.push(folderId);
      if (reel.videoUrl) r.videoUrl = reel.videoUrl;
      return libSet(arr);
    }).then(refreshSaved);
  }
  function folderMenu(reel) {
    var box = el('div', { class: 'fmenu' }, [el('div', { class: 'fempty', text: T('app.f.loading') })]);
    function paint() {
      Promise.all([foldersGet(), libGet()]).then(function (x) {
        var folders = x[0], r = x[1].find(function (y) { return keyOf(y) === keyOf(reel); });
        var mine = (r && r.folders) || [];
        box.textContent = '';
        if (!folders.length) box.appendChild(el('div', { class: 'fempty', text: T('app.f.none') }));
        folders.forEach(function (f) {
          var cb = el('input', { type: 'checkbox' }); cb.checked = mine.indexOf(f.id) >= 0;
          cb.addEventListener('change', function () { setReelFolder(reel, f.id, cb.checked); });
          box.appendChild(el('label', null, [cb, el('span', { text: f.name })]));
        });
        var inp = el('input', { class: 'field', type: 'text', placeholder: T('app.f.newPh') });
        function create() {
          var name = inp.value.trim(); if (!name) return;
          var f = { id: 'f_' + Date.now().toString(36), name: name, createdAt: Date.now() };
          foldersGet().then(function (arr) { arr.push(f); return foldersSet(arr); }).then(function () { return setReelFolder(reel, f.id, true); }).then(paint);
        }
        inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') create(); });
        box.appendChild(el('div', { class: 'fnew' }, [inp, btn('plus', T('app.f.create'), create, 'sm primary')]));
      });
    }
    paint();
    return box;
  }
  function downloadReel(reel, msgEl) {
    var base = msgEl ? (msgEl.className.split(' ')[0] || 'dmsg') : 'dmsg';
    if (msgEl) { msgEl.className = base; msgEl.textContent = T('app.dl.busy'); }
    try {
      chrome.runtime.sendMessage({ type: 'AR_DOWNLOAD', reels: [reel], folderName: '' }, function (res) {
        var e = chrome.runtime.lastError;
        if (!msgEl) return;
        if (e || !res || !res.ok) { msgEl.className = base + ' err'; msgEl.textContent = res && res.error ? T('app.dl.failWhy', { e: res.error }) : T('app.dl.fail'); }
        else msgEl.textContent = T('app.dl.ok');
      });
    } catch (err) { if (msgEl) { msgEl.className = base + ' err'; msgEl.textContent = T('app.err.updated'); } }
  }

  // ---------------------------------------------------------------- fonts (document level)
  (function addFonts() {
    try {
      var u = function (f) { return f; };
      var css = [['Regular', 400], ['Medium', 500], ['Bold', 700]].map(function (w) {
        return "@font-face{font-family:'" + FONT + "';src:local('Thmanyah Sans " + w[0] + "'),local('thmanyahsans-" + w[0] + "');font-weight:" + w[1] + ";font-style:normal;font-display:block;}";
      }).join('\n');
      var st = document.createElement('style');
      st.id = 'amine-reels-fonts';
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  })();

  // ---------------------------------------------------------------- styles (shadow)
  var CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0;transition:none!important;animation:none!important}
.root,.root *{font-family:'${FONT}',system-ui,sans-serif;font-feature-settings:"swsh" 1,"liga" 1;-webkit-font-smoothing:antialiased}
.root{color:#1E1E1E;font-size:14px;line-height:1.5;font-weight:400}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
input,select{font:inherit;color:inherit}
.ic{display:inline-flex;width:18px;height:18px;flex:none}
.ic svg{width:100%;height:100%;display:block}
.root[dir=rtl]{direction:rtl}.root[dir=ltr]{direction:ltr}
.num{font-weight:700;direction:ltr;unicode-bidi:isolate;font-feature-settings:"tnum" 1}
.muted{color:#8A919C}
/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:10px;background:#FFFFFF;border:1px solid #E3E8EF;color:#2A2E36;font-weight:500;white-space:nowrap}
.btn:hover{background:#F5F7FA}
.btn.primary{background:#0F6BFF;border-color:#0F6BFF;color:#FFFFFF}
.btn.primary:hover{background:#0A58D6;border-color:#0A58D6}
.btn.on{background:#E8F0FF;border-color:#0F6BFF;color:#0F6BFF}
.btn.icon{width:40px;padding:0}
.btn.sm{height:32px;padding:0 12px;gap:6px;font-size:13px}
.btn.sm.icon{width:32px;padding:0}
.btn.ghost{border-color:transparent;background:transparent}
.btn.ghost:hover{background:#F5F7FA}
.btn[disabled]{opacity:.45;cursor:default}
/* launcher */
.launcher{position:fixed;left:16px;bottom:16px;width:44px;height:44px;border-radius:12px;background:#0F6BFF;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px -4px rgba(15,107,255,.45);pointer-events:auto}
.launcher:hover{background:#0A58D6}
.launcher .ic{width:22px;height:22px}
/* modal shell */
.backdrop{position:fixed;inset:0;background:rgba(20,24,27,.55);display:flex;align-items:center;justify-content:center;pointer-events:auto;padding:24px}
.panel{background:#F5F7FA;border-radius:14px;width:min(1240px,100%);height:min(900px,100%);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 24px -8px rgba(20,24,27,.25)}
/* grid header */
.ghead{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap;padding:16px 24px;background:#FFFFFF;border-bottom:1px solid #E3E8EF}
.avatar{width:48px;height:48px;border-radius:999px;background:#E3E8EF;object-fit:cover;flex:none}
.who{display:flex;flex-direction:column;min-width:200px;flex:1}
.who .name{font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .meta{color:#8A919C;font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
.userform{display:flex;gap:8px;align-items:center}
.field{height:40px;border:1px solid #E3E8EF;border-radius:10px;background:#FFFFFF;color:#1E1E1E;padding:0 12px;outline:none;min-width:0}
.field:focus{border-color:#0F6BFF}
.toolbar{display:flex;align-items:center;gap:24px;padding:12px 24px;background:#FFFFFF;border-bottom:1px solid #E3E8EF;flex-wrap:wrap}
.tgroup{display:flex;align-items:center;gap:8px}
.tgroup .tl{color:#8A919C;font-size:13px;display:inline-flex;align-items:center;gap:4px}
.seg{display:inline-flex;background:#F5F7FA;border:1px solid #E3E8EF;border-radius:10px;padding:2px;gap:2px}
.seg button{height:30px;padding:0 12px;white-space:nowrap;border-radius:8px;font-size:13px;color:#2A2E36;font-weight:400}
.seg button.on{background:#FFFFFF;color:#0F6BFF;font-weight:500;box-shadow:0 1px 2px rgba(20,24,27,.08)}
.count{margin-inline-start:auto;color:#8A919C;font-size:13px}
.gbody{flex:1;overflow:auto;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:16px}
.card{background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E3E8EF;cursor:pointer;display:flex;flex-direction:column;text-align:start}
.card:hover{border-color:#0F6BFF}
.thumb{position:relative;aspect-ratio:9/16;background:#E3E8EF;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:8px;inset-inline-start:8px;height:26px;padding:0 10px;border-radius:999px;background:rgba(20,24,27,.72);color:#fff;display:inline-flex;align-items:center;font-size:13px}
.badge.hot{background:#0F6BFF}
.dur{position:absolute;bottom:8px;inset-inline-end:8px;height:22px;padding:0 8px;border-radius:999px;background:rgba(20,24,27,.72);color:#fff;font-size:12px;display:inline-flex;align-items:center}
.savedmark{position:absolute;top:8px;inset-inline-end:8px;width:26px;height:26px;border-radius:999px;background:#FFFFFF;color:#0F6BFF;display:flex;align-items:center;justify-content:center}
.savedmark .ic{width:16px;height:16px}
.cmeta{padding:12px;display:flex;flex-direction:column;gap:4px}
.cstats{display:flex;gap:12px;align-items:center;font-size:13px;color:#2A2E36}
.cstats span{display:inline-flex;align-items:center;gap:4px}
.cstats .ic{width:15px;height:15px;color:#8A919C}
.cdate{font-size:12px;color:#8A919C}
.state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:80px 24px;text-align:center;color:#2A2E36}
.state .ic{width:32px;height:32px;color:#8A919C}
.state.err .ic{color:#F0464E}
.state.err .msg{color:#F0464E}
.more{display:flex;justify-content:center;padding:24px 0 8px}
/* viewer */
.viewer{background:#FFFFFF;border-radius:14px;width:min(1040px,100%);height:min(860px,100%);display:flex;flex-direction:row;overflow:hidden;box-shadow:0 8px 24px -8px rgba(20,24,27,.25)}
.vside{width:380px;flex:none;display:flex;flex-direction:column;border-inline-end:1px solid #E3E8EF;min-height:0}
.vtop{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #E3E8EF}
.vtop .pos{flex:1;text-align:center;font-size:14px;color:#2A2E36}
.vscroll{flex:1;overflow:auto;padding:16px 24px 24px;display:flex;flex-direction:column;gap:16px;min-height:0}
.vscroll>*,.sbody>*{flex-shrink:0}
.vuser{display:flex;align-items:center;gap:8px;font-weight:500}
.vuser .ic{color:#8A919C}
.caption{color:#2A2E36;font-size:13px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.rows{display:flex;flex-direction:column;border:1px solid #E3E8EF;border-radius:14px;overflow:hidden}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #E3E8EF}
.row:last-child{border-bottom:0}
.row .k{display:inline-flex;align-items:center;gap:8px;color:#2A2E36}
.row .k .ic{color:#8A919C}
.row .v{font-size:15px;text-align:end}
.row .v.hot{color:#0F6BFF}
.row .v small{display:block;font-weight:400;font-size:12px;color:#8A919C;text-align:end}
.actions{display:flex;flex-direction:column;gap:8px}
.actions .btn{width:100%;justify-content:center}
.tx{border:1px solid #E3E8EF;border-radius:14px;display:flex;flex-direction:column;min-height:0}
.txbar{display:flex;align-items:center;gap:8px;padding:8px;padding-inline-start:12px;border-bottom:1px solid #E3E8EF}
.txbar .t{flex:1;font-weight:500;padding-inline-start:4px}
.txbody{padding:12px 16px;max-height:320px;overflow:auto;font-size:14px;line-height:1.8;white-space:pre-wrap;color:#1E1E1E}
.txbody .seg-line{display:flex;gap:12px}
.txbody .ts{color:#0F6BFF;font-size:12px;direction:ltr;flex:none;padding-top:3px;font-weight:500;cursor:pointer}
.txbody.err{color:#F0464E}
/* mode switch + notice */
.modesw{margin-inline-start:8px}
.notice{margin:0 0 16px;padding:10px 14px;border:1px solid #E3E8EF;border-inline-start:3px solid #0F6BFF;border-radius:10px;background:#FFFFFF;color:#2A2E36;font-size:13px}
/* inline grid (inside Instagram's page) */
.panel.inline{height:auto;width:100%;box-shadow:none;border:1px solid #E3E8EF;margin:16px 0 24px}
.panel.inline .gbody{overflow:visible;flex:none}
/* docked reel panel (inside Instagram's post column / beside the reel) */
.dock{color:#1E1E1E;padding:12px 16px;border-bottom:1px solid #E3E8EF;display:flex;flex-direction:column;gap:10px;background:transparent}
.dock.side{position:fixed;width:300px;background:#FFFFFF;border:1px solid #E3E8EF;border-radius:14px;pointer-events:auto}
.dock .dtop{display:flex;align-items:center;gap:8px;font-size:13px;color:#8A919C}
.dock .dtop .brand{display:inline-flex;align-items:center;gap:6px;color:#0F6BFF;font-weight:500}
.dock .dtop .brand .ic{width:16px;height:16px}
.dock .dtop .when{margin-inline-start:auto}
.dstats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px}
.dstat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:10px}
.dstat .num{font-size:15px}
.dstat .l{font-size:11px;color:#8A919C;display:inline-flex;align-items:center;gap:3px}
.dstat .l .ic{width:13px;height:13px}
.dstat.hot .num{color:#0F6BFF}
.dacts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.dacts .btn{min-width:0;height:34px;padding:0 4px;gap:4px;font-size:12px}
.dacts .btn .ic{width:16px;height:16px}
.dmsg{font-size:12px;color:#8A919C}
.dmsg.err{color:#F0464E}
.dock.dark .btn.on{color:#7FB0FF}
/* entry button inside Instagram's profile tab row */
.entry{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:52px;padding:0 4px;color:var(--mut);font-size:13px;font-weight:500;border-top:1px solid transparent;margin-top:-1px;white-space:nowrap}
.entry .ic{width:16px;height:16px}
.entry:hover{color:var(--t1)}
.entry.on{color:var(--t1);border-top-color:var(--t1)}
/* folder menu */
.fmenu{border:1px solid #E3E8EF;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px;font-size:13px}
.fmenu label{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:8px;cursor:pointer;color:#2A2E36}
.fmenu label:hover{background:rgba(15,107,255,.08)}
.fmenu input[type=checkbox]{accent-color:#0F6BFF;margin:0}
.fmenu .fnew{display:flex;gap:6px;margin-top:4px}
.fmenu .fnew .field{height:32px;flex:1;font-size:13px}
.fmenu .fempty{color:#8A919C;padding:4px 6px}
.vstage{flex:1;display:flex;flex-direction:column;background:#14181B;min-width:0}
.vframe{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-height:0}
.vbox{height:100%;max-width:100%;aspect-ratio:9/16;background:#000;border-radius:10px;overflow:hidden;position:relative}
.vbox video,.vbox img{width:100%;height:100%;object-fit:contain;display:block;background:#000}
.novid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:12px;padding:24px;background:linear-gradient(transparent 55%,rgba(0,0,0,.7))}
.novid p{color:#fff;font-size:13px;text-align:center}
.pctrl{direction:ltr;padding:8px 16px 16px;display:flex;flex-direction:column;gap:8px;color:#fff}
.scrub{width:100%;accent-color:#0F6BFF;height:16px;cursor:pointer;margin:0}
.prow{display:flex;align-items:center;gap:4px}
.pbtn{height:36px;min-width:36px;padding:0 8px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#fff;font-size:13px}
.pbtn:hover{background:rgba(255,255,255,.12)}
.pbtn .ic{width:20px;height:20px}
.pbtn.speed{min-width:52px;font-weight:700}
.ptime{font-size:13px;color:#fff;margin-left:8px;font-weight:500;font-feature-settings:"tnum" 1;white-space:nowrap}
.vol{width:84px;accent-color:#0F6BFF}
.spacer{flex:1}
/* stats card */
.scard{position:fixed;left:16px;top:16px;width:300px;background:#FFFFFF;border:1px solid #E3E8EF;border-radius:14px;box-shadow:0 8px 24px -8px rgba(20,24,27,.25);pointer-events:auto;display:flex;flex-direction:column;max-height:calc(100vh - 32px)}
.shead{display:flex;align-items:center;gap:8px;padding:8px;padding-inline-start:12px}
.shead .t{flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-inline-start:4px}
.sbody{padding:0 12px 12px;display:flex;flex-direction:column;gap:12px;overflow:auto;min-height:0}
.sbody .row{padding:8px 12px}
.sbody .actions{flex-direction:row}
.sbody .actions .btn{flex:1;padding:0 8px;gap:6px;font-size:13px}
.scard.min .sbody{display:none}
.chip{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:999px;background:#E8F0FF;color:#0F6BFF;font-size:12px}
.smsg{padding:4px 4px 8px;color:#8A919C;font-size:13px}
.smsg.err{color:#F0464E}
`;
  // Light / dark: the surface colours become variables; .dark swaps them (Instagram-like dark greys)
  CSS = CSS.replace(/background:#FFFFFF/g, 'background:var(--w)').replace(/#F5F7FA/g, 'var(--bg)').replace(/#E3E8EF/g, 'var(--line)')
    .replace(/#1E1E1E/g, 'var(--t1)').replace(/#2A2E36/g, 'var(--t2)').replace(/#8A919C/g, 'var(--mut)').replace(/#E8F0FF/g, 'var(--tint)');
  // fixed palettes = Instagram's light / dark colours; .ig = read Instagram's own variables (they inherit into shadow roots)
  CSS = '.root{--w:#FFFFFF;--bg:#FAFAFA;--line:#DBDBDB;--t1:#000000;--t2:#000000;--mut:#737373;--tint:#E8F0FF;color-scheme:light}\n' +
    '.root.dark{--w:#212328;--bg:#0C1014;--line:#363636;--t1:#F5F5F5;--t2:#F5F5F5;--mut:#A8A8A8;--tint:rgba(15,107,255,.18);color-scheme:dark}\n' +
    '.root.ig{--w:rgb(var(--ig-primary-background,255,255,255));--bg:rgb(var(--ig-secondary-background,250,250,250));--line:rgb(var(--ig-separator,219,219,219));' +
    '--t1:rgb(var(--ig-primary-text,0,0,0));--t2:rgb(var(--ig-primary-text,0,0,0));--mut:rgb(var(--ig-secondary-text,115,115,115))}\n' +
    '.root.ig.dark{--w:rgb(var(--ig-elevated-background,33,35,40));--bg:rgb(var(--ig-primary-background,12,16,20));--line:rgb(var(--ig-elevated-separator,54,54,54));' +
    '--t1:rgb(var(--ig-primary-text,245,245,245));--t2:rgb(var(--ig-primary-text,245,245,245));--mut:rgb(var(--ig-secondary-text,168,168,168))}\n' +
    '.root.dark .seg button.on{box-shadow:none}.root.dark .backdrop{background:rgba(0,0,0,.6)}\n' + CSS;
  // Native look: the reel panel on the page uses Instagram's own page colour and Instagram's own grey buttons,
  // so it reads as part of Instagram (no separate grey card on a black page).
  CSS += '\n.root .dock.side{background:#FFFFFF;border-color:#DBDBDB}' +
    '.root.dark .dock.side{background:#0C1014;border-color:#262626}' +
    '.root.ig .dock.side{background:rgb(var(--ig-primary-background,255,255,255));border-color:rgb(var(--ig-separator,219,219,219))}' +
    '.root.ig.dark .dock.side{background:rgb(var(--ig-primary-background,12,16,20));border-color:rgb(var(--ig-separator,38,38,38))}' +
    '.root .dock .btn{background:#EFEFEF;border-color:transparent;border-radius:8px;color:#000000;font-weight:500}' +
    '.root .dock .btn:hover{background:#DBDBDB}' +
    '.root.dark .dock .btn{background:#25292E;color:#F5F5F5}.root.dark .dock .btn:hover{background:#363636}' +
    '.root.ig .dock .btn{background:rgb(var(--ig-secondary-button-background,239,239,239));color:rgb(var(--ig-primary-text,0,0,0))}' +
    '.root.ig .dock .btn:hover{background:rgb(var(--ig-secondary-button-hover,219,219,219))}' +
    '.root.ig.dark .dock .btn{background:rgb(var(--ig-secondary-button-background,37,41,46));color:rgb(var(--ig-primary-text,245,245,245))}' +
    '.root.ig.dark .dock .btn:hover{background:rgb(var(--ig-secondary-button-hover,54,54,54))}' +
    '.root .dock .btn.on,.root.ig .dock .btn.on,.root.ig.dark .dock .btn.on{background:rgba(15,107,255,.14);color:#0F6BFF}' +
    '.root .dock .dtop,.root .dock .dstat .l,.root .dock .dmsg{color:var(--mut)}.root .dock{color:var(--t1)}';

  // ---------------------------------------------------------------- host
  var host = document.createElement('div');
  host.id = 'amine-reels-root';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;pointer-events:none;';
  var shadow = host.attachShadow({ mode: 'open' });
  shadow.appendChild(el('style', { text: CSS }));
  var root = el('div', { class: 'root', dir: I.dir(), lang: I.lang() });
  shadow.appendChild(root);
  (document.body || document.documentElement).appendChild(host);
  // keep the host attached if the SPA replaces body children
  setInterval(function () { if (!host.isConnected) (document.body || document.documentElement).appendChild(host); }, 3000);

  // ---------------------------------------------------------------- state
  var state = {
    platform: /youtube\.com$/.test(location.hostname) ? 'youtube' : 'instagram',
    page: null,           // pageInfo result
    gridOpen: false,
    username: null,
    limit: 30,          // default 30: fast; change it in the grid (30 / 60 / 120 / all / custom)
    sort: 'outlier',
    minOutlier: 0,
    data: null,           // {profile, reels, median}
    loading: false,
    error: null,
    list: [],             // filtered + sorted reels shown
    viewer: null          // {index}
  };
  var transcripts = {};   // key -> transcript result

  // ---------------------------------------------------------------- launcher
  // No floating button: on a profile page a small «ريلز مرتبة» entry sits in Instagram's own tab row
  // (المنشورات / ريلز / …). Re-inserted if Instagram re-renders. The popup and Alt+Shift+R stay.
  var entryHost = null, entryRoot = null, entryBtn = null, entryLbl = null;
  function ensureEntry() {
    var onProfile = state.page && state.page.kind === 'profile';
    if (!onProfile) { if (entryHost && entryHost.isConnected) entryHost.remove(); return; }
    // never touch Instagram's tree while React is still hydrating the first page (a foreign node there = React error #418)
    if (performance.now() < 5000) { setTimeout(function () { try { ensureEntry(); } catch (e) {} }, 5200 - performance.now()); return; }
    if (!entryHost) {
      entryHost = document.createElement('div');
      entryHost.id = 'amine-reels-entry';
      entryHost.style.cssText = 'display:flex;align-items:center;justify-content:center;flex:1 1 0;min-width:0;';
      var sh = entryHost.attachShadow({ mode: 'open' });
      sh.appendChild(el('style', { text: CSS }));
      entryRoot = el('div', { class: 'root', dir: I.dir(), lang: I.lang() });
      entryBtn = el('button', { class: 'entry', type: 'button', title: T('app.entryTitle'), onclick: function () { toggleGrid(); } },
        [iconEl('chart-line-up'), (entryLbl = el('span', { text: T('app.sorted') }))]);
      entryRoot.appendChild(entryBtn);
      sh.appendChild(entryRoot);
      applyTheme();
    }
    entryBtn.className = 'entry' + (state.gridOpen ? ' on' : '');
    var tl = document.querySelector('main [role="tablist"]');
    var row = tl;   // a sibling of Instagram's tabs (each tab sits in its own wrapper), last in the row
    if (row) { if (entryHost.parentNode !== row || entryHost.nextSibling) row.appendChild(entryHost); }
    else if (entryHost.isConnected) entryHost.remove();
  }

  // ---------------------------------------------------------------- grid
  var gridLayer = null, gridEls = {};
  var prevOverflow = null;
  function lockScroll(on) {
    var de = document.documentElement;
    if (on) { if (prevOverflow === null) { prevOverflow = de.style.overflow; de.style.overflow = 'hidden'; } }
    else if (prevOverflow !== null) { de.style.overflow = prevOverflow; prevOverflow = null; }
  }
  // one place decides: page scroll locked + data-ar-grid (read by overlay.js) only while something of ours covers the page
  function syncCover() {
    var sep = state.gridOpen && !!gridLayer && settings.mode !== 'inline';
    lockScroll(sep || !!state.viewer);
    if (sep) document.documentElement.setAttribute('data-ar-grid', ''); else document.documentElement.removeAttribute('data-ar-grid');
    if (typeof ensureEntry === 'function') try { ensureEntry(); } catch (e) {}
  }

  function toggleGrid(force) {
    var open = force != null ? force : !state.gridOpen;
    if (open) openGrid(); else closeGrid();
  }
  var inlineHost = null, inlineRoot = null;
  function inlineMount() {
    // a host inside Instagram's own page flow (top of <main>), so the grid scrolls with the page
    var main = document.querySelector('main') || document.body;
    if (!inlineHost) {
      inlineHost = document.createElement('div');
      inlineHost.id = 'amine-reels-inline';
      inlineHost.style.cssText = 'display:block;width:100%;max-width:1240px;margin:0 auto;padding:0 16px;box-sizing:border-box;position:relative;z-index:1;';
      var sh = inlineHost.attachShadow({ mode: 'open' });
      sh.appendChild(el('style', { text: CSS }));
      inlineRoot = el('div', { class: 'root', dir: I.dir(), lang: I.lang() });
      sh.appendChild(inlineRoot);
      applyTheme();
    }
    if (inlineHost.parentNode !== main) main.insertBefore(inlineHost, main.firstChild);
    return inlineRoot;
  }
  function closeGrid() {
    closeViewer();
    state.gridOpen = false;
    if (gridLayer) { gridLayer.remove(); gridLayer = null; }
    if (inlineHost) { inlineHost.remove(); }
    syncCover();
  }
  function setMode(m) {
    if (settings.mode === m) return;
    settings.mode = m; saveSettings();
    var wasOpen = state.gridOpen;
    if (wasOpen) { closeGrid(); openGrid(); }
    lastKey = ''; removeStatsCard(); pollReel();
  }
  function openGrid() {
    state.gridOpen = true;
    if (!gridLayer) buildGrid();
    else if (settings.mode === 'inline') inlineMount();
    syncCover();
    state.gridPath = location.pathname;
    if (settings.mode === 'inline') { inlineHost.scrollIntoView({ block: 'start' }); }
    var p = state.page || {};
    var u = p.username || (currentReel && currentReel.username) || null;
    if (u && (u !== state.username || !state.data) && !state.loading) loadProfile(u);
    else renderGridBody();
  }

  function segControl(options, current, onpick) {
    var wrap = el('div', { class: 'seg', role: 'group' });
    options.forEach(function (o) {
      var b = el('button', { type: 'button', class: o[0] === current ? 'on' : '', text: o[1], onclick: function () {
        Array.prototype.forEach.call(wrap.children, function (c) { c.className = ''; });
        b.className = 'on';
        onpick(o[0]);
      } });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function buildGrid() {
    gridEls = {};
    gridEls.avatar = el('img', { class: 'avatar', alt: '', referrerpolicy: 'no-referrer' });
    gridEls.name = el('div', { class: 'name', text: T('app.sorted') });
    gridEls.meta = el('div', { class: 'meta' });
    gridEls.input = el('input', { class: 'field', type: 'text', placeholder: T('app.userPh'), dir: 'ltr', style: 'width:180px', onkeydown: function (e) {
      if (e.key === 'Enter') submitUser();
    } });
    function submitUser() {
      var v = gridEls.input.value.trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').split(/[/?#]/)[0];
      if (v) loadProfile(v);
    }
    var head = el('div', { class: 'ghead' }, [
      gridEls.avatar,
      el('div', { class: 'who' }, [gridEls.name, gridEls.meta]),
      el('div', { class: 'userform' }, [gridEls.input, btn('magnifying-glass', T('app.show'), submitUser, 'primary')]),
      btn('folder-simple', T('app.folders'), function () { try { chrome.runtime.sendMessage({ type: 'AR_OPEN_LIBRARY' }); } catch (e) {} }, '', T('app.foldersTitle')),
      el('div', { class: 'modesw', title: T('app.modeTitle') }, [segControl([['inline', T('app.mode.inline')], ['separate', T('app.mode.separate')]], settings.mode, setMode)]),
      el('div', { class: 'modesw', title: T('app.themeTitle') }, [segControl([['auto', T('app.theme.auto')], ['light', T('app.theme.light')], ['dark', T('app.theme.dark')]], settings.theme, setTheme)]),
      // language names in their own language; picking one re-renders everything open (I.onChange)
      el('div', { class: 'modesw langsw', title: T('app.langTitle') }, [segControl([['auto', T('app.lang.auto')], ['ar', T('app.lang.ar')], ['en', T('app.lang.en')]], I.pref(), function (p) { I.set(p); })]),
      btn('x', null, closeGrid, 'icon ghost', T('app.close'))
    ]);
    gridEls.count = el('div', { class: 'count' });
    var toolbar = el('div', { class: 'toolbar' }, [
      el('div', { class: 'tgroup' }, [el('span', { class: 'tl' }, [iconEl('sort-ascending'), T('app.sortBy')]),
        (gridEls.sortWrap = el('span', { style: 'display:contents' }))]),
      el('div', { class: 'tgroup' }, [el('span', { class: 'tl' }, [iconEl('funnel'), T('app.minOutlier')]),
        segControl([[0, T('app.all')], [2, '2×'], [3, '3×'], [5, '5×'], [10, '10×']], state.minOutlier, function (v) { state.minOutlier = v; renderGridBody(); })]),
      el('div', { class: 'tgroup' }, [el('span', { class: 'tl' }, [iconEl('squares-four'), T('app.count')]),
        segControl([[30, '30'], [60, '60'], [120, '120'], [500, T('app.all')]], state.limit, function (v) { state.limit = v; gridEls.custom.value = ''; if (state.username) loadProfile(state.username); }),
        (gridEls.custom = el('input', { class: 'field', type: 'number', min: '1', max: '500', placeholder: T('app.customPh'), title: T('app.customTitle'), style: 'width:84px;height:34px', dir: 'ltr',
          value: [30, 60, 120, 500].indexOf(state.limit) < 0 ? String(state.limit) : '',
          onkeydown: function (e) {
            e.stopPropagation();
            if (e.key !== 'Enter') return;
            var n = Math.round(Number(gridEls.custom.value));
            if (!(n >= 1)) return;
            state.limit = Math.min(500, n); gridEls.custom.value = String(state.limit);
            Array.prototype.forEach.call(gridEls.custom.parentNode.querySelectorAll('.seg button'), function (b) { b.className = ''; });
            if (state.username) loadProfile(state.username);
          } }))]),
      gridEls.count
    ]);
    gridEls.body = el('div', { class: 'gbody' });
    paintSort();
    var inline = settings.mode === 'inline';
    var panel = el('div', { class: 'panel' + (inline ? ' inline' : ''), role: inline ? 'region' : 'dialog', 'aria-label': T('app.sorted') }, [head, toolbar, gridEls.body]);
    if (inline) { gridLayer = panel; inlineMount().appendChild(panel); }
    else {
      gridLayer = el('div', { class: 'backdrop', onmousedown: function (e) { if (e.target === gridLayer) closeGrid(); } }, [panel]);
      root.appendChild(gridLayer);
    }
  }

  // sort options: shares right after outlier (the metric worth studying); reposts / share outlier only when Instagram sent the data
  function paintSort() {
    if (!gridEls.sortWrap) return;
    var reels = (state.data && state.data.reels) || [];
    var has = function (k) { return reels.some(function (r) { return r[k] != null; }); };
    var opts = ['outlier', 'shares'];
    if (has('reposts')) opts.push('reposts');
    if (has('shareOutlier')) opts.push('shareOutlier');
    opts.push('views', 'likes', 'comments', 'newest');
    opts = opts.map(function (k) { return [k, T('app.sort.' + k)]; });
    if (!opts.some(function (o) { return o[0] === state.sort; })) state.sort = 'outlier';
    var sig = opts.map(function (o) { return o[0]; }).join(',') + '|' + state.sort + '|' + I.lang();
    if (gridEls.sortWrap.__sig === sig) return;
    gridEls.sortWrap.__sig = sig;
    gridEls.sortWrap.textContent = '';
    gridEls.sortWrap.appendChild(segControl(opts, state.sort, function (v) { state.sort = v; gridEls.sortWrap.__sig = ''; paintSort(); renderGridBody(); }));
  }
  function loadProfile(username) {
    state.username = username;
    state.loading = true; state.error = null; state.data = null;
    if (gridEls.input) gridEls.input.value = username;
    renderGridHead(); renderGridBody();
    var my = username + '|' + state.limit;
    state._req = my;
    dataCall('getProfileReels', username, { limit: state.limit }).then(function (res) {
      if (state._req !== my) return;
      state.loading = false; state.data = res || { reels: [] };
      renderGridHead(); renderGridBody();
    }, function (e) {
      if (state._req !== my) return;
      state.loading = false; state.error = errText(e);
      renderGridHead(); renderGridBody();
    });
  }

  function renderGridHead() {
    if (!gridLayer) return;
    paintSort();
    var d = state.data, p = d && d.profile;
    gridEls.meta.textContent = '';
    if (p) {
      gridEls.avatar.src = p.pic || '';
      gridEls.avatar.style.visibility = p.pic ? 'visible' : 'hidden';
      gridEls.name.textContent = p.fullName || p.username;
      gridEls.meta.appendChild(el('span', { dir: 'ltr', text: '@' + p.username }));
      if (p.followers != null) gridEls.meta.appendChild(el('span', null, tn('app.followers', { n: el('span', { class: 'num', text: fmtNum(p.followers) }) })));
      if (d.median) gridEls.meta.appendChild(el('span', null, tn('app.median', { n: el('span', { class: 'num', text: fmtNum(d.median) }) })));
      if (d.medianShares) gridEls.meta.appendChild(el('span', null, tn('app.medianShares', { n: el('span', { class: 'num', text: fmtNum(d.medianShares) }) })));
    } else {
      gridEls.avatar.style.visibility = 'hidden';
      gridEls.name.textContent = state.username ? '\u2066@' + state.username + '\u2069' : T('app.sorted');
      gridEls.meta.textContent = state.username ? '' : T('app.typeUser');
    }
  }

  function sortedFiltered() {
    var reels = (state.data && state.data.reels) || [];
    var min = state.minOutlier;
    var list = reels.filter(function (r) { return !min || (r.outlier || 0) >= min; });
    var key = { outlier: 'outlier', shares: 'shares', reposts: 'reposts', shareOutlier: 'shareOutlier', views: 'views', likes: 'likes', comments: 'comments', newest: 'takenAt' }[state.sort] || 'outlier';
    // unknown (null / hidden) values always go last
    var v = function (r) { var x = r[key]; return x == null || x < 0 ? -1 : x; };
    list.sort(function (a, b) { return v(b) - v(a) || (b.outlier || 0) - (a.outlier || 0) || (b.views || 0) - (a.views || 0); });
    return list;
  }

  function stateBox(iconName, msg, isErr, extra) {
    return el('div', { class: 'state' + (isErr ? ' err' : '') }, [iconEl(iconName), el('div', { class: 'msg', text: msg }), extra || null]);
  }

  function renderGridBody() {
    if (!gridLayer) return;
    var body = gridEls.body;
    body.textContent = '';
    gridEls.count.textContent = '';
    if (!state.username) { body.appendChild(stateBox('magnifying-glass', T('app.openProfile', { p: platformName(state.platform) }))); return; }
    if (state.loading) { body.appendChild(stateBox('clock', T('app.loadingReels'))); return; }
    if (state.error) { body.appendChild(stateBox('warning-circle', state.error, true, btn('arrow-clockwise', T('app.retry'), function () { loadProfile(state.username); }))); return; }
    var all = (state.data && state.data.reels) || [];
    state.list = sortedFiltered();
    gridEls.count.appendChild(el('span', null, tn('app.countOf', { a: el('span', { class: 'num', text: String(state.list.length) }), b: el('span', { class: 'num', text: String(all.length) }) })));
    if (!all.length) { body.appendChild(stateBox('film-reel', T('app.noReels'))); return; }
    if (!state.list.length) { body.appendChild(stateBox('funnel', T('app.noMatch'))); return; }
    if (state.data && state.data.note) body.appendChild(el('div', { class: 'notice', text: state.data.note }));
    var grid = el('div', { class: 'grid' });
    state.list.forEach(function (r, i) { grid.appendChild(cardEl(r, i)); });
    body.appendChild(grid);
    if (all.length >= state.limit && state.limit < 120) {
      body.appendChild(el('div', { class: 'more' }, [btn('download-simple', T('app.loadMore', { n: state.limit === 30 ? 60 : 120 }), function () {
        state.limit = state.limit === 30 ? 60 : 120;
        buildGridAgain();
        loadProfile(state.username);
      })]));
    }
  }
  function buildGridAgain() { if (gridLayer) { gridLayer.remove(); gridLayer = null; } buildGrid(); }
  // keep the inline grid in the page if Instagram re-renders <main>
  setInterval(function () {
    if (!state.gridOpen || settings.mode !== 'inline' || !inlineHost || inlineHost.isConnected) return;
    if (location.pathname === state.gridPath) inlineMount();   // same page, Instagram re-rendered <main>
    else closeGrid();                                           // another page: never carry the old grid into it
  }, 1500);

  function cardEl(r, i) {
    var hot = (r.outlier || 0) >= 3;
    var thumb = el('div', { class: 'thumb' }, [
      el('img', { src: r.thumb || '', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
      r.outlier != null ? el('span', { class: 'badge num' + (hot ? ' hot' : ''), text: fmtOutlier(r.outlier) }) : null,
      r.duration ? el('span', { class: 'dur num', text: fmtTime(r.duration) }) : null,
      el('span', { class: 'savedmark', html: '<span class="ic">' + ic('bookmark-simple-fill') + '</span>', style: saved[keyOf(r)] ? '' : 'display:none' })
    ]);
    thumb.__arKey = keyOf(r);
    var meta = el('div', { class: 'cmeta' }, [
      el('div', { class: 'cstats' }, [
        el('span', null, [iconEl('eye'), el('span', { class: 'num', text: fmtNum(r.views) })]),
        el('span', null, [iconEl('heart'), el('span', { class: 'num', text: fmtNum(r.likes) })]),
        el('span', { title: T('app.shares') }, [iconEl('paper-plane-tilt'), el('span', { class: 'num', text: fmtNum(r.shares) })])
      ]),
      el('div', { class: 'cdate', text: relTime(r.takenAt) })
    ]);
    return el('button', { class: 'card', type: 'button', onclick: function () { openViewer(i); } }, [thumb, meta]);
  }

  // ---------------------------------------------------------------- reel detail (shared by viewer + stats card)
  // Returns {rows, actions, tx, update(reel)}; buttons keep a reference so save state can update without rebuild.
  var saveButtons = []; // {btn, reel}
  function updateSaveButtons() {
    if (gridLayer) Array.prototype.forEach.call(gridLayer.querySelectorAll('.thumb'), function (t) {
      var m = t.querySelector('.savedmark'); if (m) m.style.display = saved[t.__arKey] ? '' : 'none';
    });
    saveButtons = saveButtons.filter(function (s) { return s.btn.isConnected; });
    saveButtons.forEach(function (s) { paintSave(s.btn, s.reel, s.compact); });
  }
  function paintSave(b, reel, compact) {
    var on = !!saved[keyOf(reel)];
    b.className = 'btn' + (on ? ' on' : '') + (compact ? '' : '');
    b.innerHTML = '';
    b.appendChild(iconEl(on ? 'bookmark-simple-fill' : 'bookmark-simple'));
    b.appendChild(el('span', { class: 'lbl', text: on ? T('app.saved') : T('app.save') }));
  }

  function statRows(r) {
    var hot = (r.outlier || 0) >= 3;
    function row(iconName, label, valueNode, cls) {
      return el('div', { class: 'row' }, [el('span', { class: 'k' }, [iconEl(iconName), label]), el('span', { class: 'v num' + (cls ? ' ' + cls : '') }, valueNode)]);
    }
    return el('div', { class: 'rows' }, [
      row('eye', T('app.views'), fmtNum(r.views)),
      row('heart', T('app.likes'), fmtNum(r.likes)),
      row('chat-circle', T('app.comments'), fmtNum(r.comments)),
      row('paper-plane-tilt', T('app.shares'), [fmtNum(r.shares), el('small', { text: r.shareRate != null ? T('app.ofViews', { p: fmtPct(r.shareRate) }) : r.shares == null ? T('app.notSent') : '' })]),
      r.reposts != null ? row('repeat', T('app.reposts'), fmtNum(r.reposts)) : null,
      el('div', { class: 'row' }, [el('span', { class: 'k' }, [iconEl('bookmark-simple'), T('app.saves')]),
        el('span', { class: 'v', style: 'font-weight:400;font-size:12px;color:var(--mut)', text: T('app.savesNote') })]),
      row('lightning', T('app.outlier'), r.outlier != null ? fmtOutlier(r.outlier) : '—', hot ? 'hot' : ''),
      el('div', { class: 'row' }, [el('span', { class: 'k' }, [iconEl('calendar-blank'), T('app.published')]),
        el('span', { class: 'v', style: 'font-weight:500' }, [relTime(r.takenAt), el('small', { class: 'num', style: 'font-weight:400', text: fmtDate(r.takenAt) })])])
    ]);
  }

  // transcript block; opts.seek(t) optional
  function transcriptBlock(reel, opts) {
    var k = keyOf(reel);
    var showTs = false;
    var body = el('div', { class: 'txbody' });
    var copyBtn = btn('copy', null, function () {
      var t = transcripts[k]; if (!t || !t.ok) return;
      var txt = showTs && t.segments && t.segments.length
        ? t.segments.map(function (s) { return '[' + fmtTime(s.start) + '] ' + s.text; }).join('\n') : t.text;
      copyText(txt).then(function () { copyBtn.title = T('app.tx.copied'); copyLbl.textContent = T('app.tx.copied'); setTimeout(function () { copyLbl.textContent = T('app.tx.copy'); copyBtn.title = T('app.tx.copyTitle'); }, 1500); });
    }, 'sm', T('app.tx.copyTitle'));
    var copyLbl = el('span', { class: 'lbl', text: T('app.tx.copy') }); copyBtn.appendChild(copyLbl);
    var tsBtn = btn('clock', T('app.tx.times'), function () {
      showTs = !showTs; tsBtn.className = 'btn sm' + (showTs ? ' on' : ''); paint();
    }, 'sm', T('app.tx.timesTitle'));
    var wrap = el('div', { class: 'tx' }, [el('div', { class: 'txbar' }, [el('span', { class: 't', text: T('app.tx.title') }), tsBtn, copyBtn]), body]);
    function paint() {
      var t = transcripts[k];
      body.className = 'txbody'; body.textContent = '';
      copyBtn.disabled = tsBtn.disabled = !(t && t.ok);
      if (!t) { body.className = 'txbody muted'; body.textContent = T('app.tx.loading'); return; }
      if (!t.ok) { body.className = 'txbody err'; body.textContent = t.reason || T('app.tx.none'); return; }
      if (showTs && t.segments && t.segments.length) {
        t.segments.forEach(function (s) {
          body.appendChild(el('div', { class: 'seg-line' }, [
            el('span', { class: 'ts', text: fmtTime(s.start), onclick: function () { if (opts && opts.seek) opts.seek(s.start); } }),
            el('span', { text: s.text })
          ]));
        });
      } else body.textContent = t.text || '';
    }
    paint();
    if (!transcripts[k]) {
      dataCall('getTranscript', reel.code || reel.url).then(function (t) {
        transcripts[k] = t || { ok: false, reason: T('app.tx.empty') };
        attachTranscriptIfSaved(reel, transcripts[k]);
        if (wrap.isConnected) paint();
      }, function (e) {
        transcripts[k] = { ok: false, reason: errText(e) };
        if (wrap.isConnected) paint();
      });
    }
    return wrap;
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(fallback);
    return fallback();
    function fallback() {
      return new Promise(function (res) {
        var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); res();
      });
    }
  }

  function actionButtons(reel, opts) {
    var sb = el('button', { type: 'button', class: 'btn', onclick: function () { toggleSave(reel); } });
    paintSave(sb, reel);
    saveButtons.push({ btn: sb, reel: reel });
    var txBtn = btn('waveform', T('app.transcribe'), function () { opts.onTranscript(); });
    var openBtn = btn(reel.platform === 'youtube' ? 'youtube-logo' : 'instagram-logo', opts.short ? T('app.open') : T('app.openOn', { p: platformName(reel.platform) }), function () {
      window.open(reel.url, '_blank', 'noopener');
    });
    // folder + download, with their own space under the buttons
    var slot = el('div'), msgEl = el('div', { class: 'smsg' });
    var folderBtn = btn('folder-simple', opts.short ? T('app.folder') : T('app.addFolder'), function () {
      if (slot.__k === 'f') { slot.textContent = ''; slot.__k = ''; return; }
      slot.textContent = ''; slot.__k = 'f'; slot.appendChild(folderMenu(reel));
    });
    var dlBtn = btn('download-simple', opts.short ? T('app.download') : T('app.downloadClip'), function () { downloadReel(reel, msgEl); });
    return el('div', { class: 'actions' }, [sb, folderBtn, dlBtn, txBtn, openBtn, msgEl, slot]);
  }

  // ---------------------------------------------------------------- viewer
  var viewerLayer = null, V = null;
  function openViewer(index) {
    if (!state.list.length) return;
    state.viewer = { index: index };
    renderViewer();
  }
  function closeViewer() {
    if (V && V.video) { try { V.video.pause(); V.video.removeAttribute('src'); V.video.load(); } catch (e) {} }
    if (V && V.raf) cancelAnimationFrame(V.raf);
    V = null;
    if (viewerLayer) { viewerLayer.remove(); viewerLayer = null; }
    document.documentElement.removeAttribute('data-ar-viewer');
    state.viewer = null;
    syncCover();
  }
  var playerPrefs = { volume: 1, muted: false, rate: 1 };
  function go(delta) {
    if (!state.viewer) return;
    var n = state.list.length, i = state.viewer.index + delta;
    if (i < 0 || i >= n) return;
    state.viewer.index = i;
    renderViewer();
  }

  // keep = same reel, new language: the playing <video> moves into the new layout (no reload, no restart)
  function renderViewer(keep) {
    var i = state.viewer.index, r = state.list[i], n = state.list.length;
    var reuse = keep && V && V.video && V.reel === r ? V.video : null;
    var txWasOpen = !!(keep && V && V.txOpen);
    var keepRate = V && V.video ? V.video.playbackRate : playerPrefs.rate;
    if (V && V.video && !reuse) { try { V.video.pause(); V.video.removeAttribute('src'); V.video.load(); } catch (e) {} }
    if (V && V.raf) cancelAnimationFrame(V.raf);
    var oldLayer = viewerLayer;
    playerPrefs.rate = keepRate;
    V = { reel: r };

    // side panel (first child → start side: right in Arabic, left in English)
    var prevB = btn(rtl() ? 'caret-right' : 'caret-left', null, function () { go(-1); }, 'icon ghost', T('app.v.prev'));
    var nextB = btn(rtl() ? 'caret-left' : 'caret-right', null, function () { go(1); }, 'icon ghost', T('app.v.next'));
    prevB.disabled = i === 0; nextB.disabled = i === n - 1;
    var top = el('div', { class: 'vtop' }, [
      prevB,
      el('div', { class: 'pos' }, tn('app.v.pos', { i: el('span', { class: 'num', text: String(i + 1) }), n: el('span', { class: 'num', text: String(n) }) })),
      nextB,
      btn('x', null, closeViewer, 'icon ghost', T('app.close'))
    ]);
    var txSlot = el('div');
    var scroll = el('div', { class: 'vscroll' }, [
      el('div', { class: 'vuser' }, [iconEl(r.platform === 'youtube' ? 'youtube-logo' : 'instagram-logo'), el('span', { dir: 'ltr', text: '@' + (r.username || '') })]),
      r.caption ? el('div', { class: 'caption', dir: 'auto', text: r.caption }) : null,
      statRows(r),
      actionButtons(r, { onTranscript: function () {
        if (txSlot.firstChild) { txSlot.textContent = ''; if (V) V.txOpen = false; return; }
        txSlot.appendChild(transcriptBlock(r, { seek: function (t) { if (V && V.video) { V.video.currentTime = t; } } }));
        if (V) V.txOpen = true;
        txSlot.scrollIntoView({ block: 'nearest' });
      } }),
      txSlot
    ]);
    var side = el('div', { class: 'vside' }, [top, scroll]);

    // stage
    var stage = el('div', { class: 'vstage' });
    var box = el('div', { class: 'vbox' });
    stage.appendChild(el('div', { class: 'vframe' }, [box]));
    if (reuse) {
      box.appendChild(reuse);
      V.video = reuse;
      stage.appendChild(buildControls(reuse));
    } else if (r.videoUrl) {
      var v = el('video', { src: r.videoUrl, playsinline: true, autoplay: true, loop: true, preload: 'auto', poster: r.thumb || null });
      v.volume = playerPrefs.volume; v.muted = playerPrefs.muted; v.playbackRate = playerPrefs.rate;
      box.appendChild(v);
      V.video = v;
      v.addEventListener('click', function () { togglePlay(); });
      stage.appendChild(buildControls(v));
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    } else {
      box.appendChild(el('img', { src: r.thumb || '', alt: '', referrerpolicy: 'no-referrer' }));
      box.appendChild(el('div', { class: 'novid' }, [
        el('p', { text: T('app.v.noVideo') }),
        btn('play', T('app.v.openToPlay'), function () { window.open(r.url, '_blank', 'noopener'); }, 'primary')
      ]));
    }
    var viewer = el('div', { class: 'viewer', role: 'dialog', 'aria-label': T('app.v.aria') }, [side, stage]);
    viewerLayer = el('div', { class: 'backdrop', style: 'background:rgba(20,24,27,.7)', onmousedown: function (e) { if (e.target === viewerLayer) closeViewer(); } }, [viewer]);
    // swap in one step (new layer in, old layer out in the same task): no empty frame in between
    if (oldLayer) oldLayer.replaceWith(viewerLayer); else root.appendChild(viewerLayer);
    if (txWasOpen) { txSlot.appendChild(transcriptBlock(r, { seek: function (t) { if (V && V.video) { V.video.currentTime = t; } } })); V.txOpen = true; }
    document.documentElement.setAttribute('data-ar-viewer', '');
    syncCover();
  }

  function buildControls(v) {
    var scrub = el('input', { class: 'scrub', type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': T('app.p.progress') });
    var scrubbing = false;
    scrub.addEventListener('input', function () { scrubbing = true; var d = v.duration || 0; if (d) v.currentTime = scrub.value / 1000 * d; paintTime(); });
    scrub.addEventListener('change', function () { scrubbing = false; });
    var playB = el('button', { class: 'pbtn', type: 'button', title: T('app.p.play'), onclick: togglePlay });
    var playIc = el('span', { class: 'ic' }); playB.appendChild(playIc);
    var speedB = el('button', { class: 'pbtn speed', type: 'button', title: T('app.p.speed'), onclick: function () {
      var cur = v.playbackRate, idx = SPEEDS.indexOf(cur);
      setRate(SPEEDS[(idx + 1) % SPEEDS.length] || 1);
    } });
    var speedTxt = document.createTextNode('1×'); speedB.appendChild(speedTxt);
    var muteB = el('button', { class: 'pbtn', type: 'button', title: T('app.p.mute'), onclick: function () { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = .5; } });
    var muteIc = el('span', { class: 'ic' }); muteB.appendChild(muteIc);
    var vol = el('input', { class: 'vol', type: 'range', min: '0', max: '1', step: '0.05', value: String(v.volume), 'aria-label': T('app.p.volume') });
    vol.addEventListener('input', function () { v.volume = +vol.value; v.muted = +vol.value === 0; });
    var timeTxt = document.createTextNode('0:00 / 0:00');
    var pb = function (iconName, title, fn, extra) {
      var b = el('button', { class: 'pbtn', type: 'button', title: title, onclick: fn }, [iconEl(iconName)]);
      if (extra) b.appendChild(el('span', { text: extra }));
      return b;
    };
    var row = el('div', { class: 'prow' }, [
      playB,
      pb('arrow-counter-clockwise', T('app.p.back'), function () { seekBy(-5); }, '5'),
      pb('arrow-clockwise', T('app.p.fwd'), function () { seekBy(5); }, '5'),
      pb('skip-back', T('app.p.fbk'), function () { stepFrame(-1); }),
      pb('skip-forward', T('app.p.ffw'), function () { stepFrame(1); }),
      speedB,
      el('span', { class: 'ptime' }, [timeTxt]),
      el('span', { class: 'spacer' }),
      muteB, vol
    ]);
    var lastPaused = null, lastMuted = null, lastVol = null, lastRate = null, lastT = '', lastS = -1;
    function paintTime() {
      var t = fmtTime(v.currentTime) + ' / ' + fmtTime(v.duration || (V && V.reel && V.reel.duration) || 0);
      if (t !== lastT) { timeTxt.nodeValue = t; lastT = t; }
      if (!scrubbing && v.duration) { var s = Math.round(v.currentTime / v.duration * 1000); if (s !== lastS) { scrub.value = String(s); lastS = s; } }
    }
    function paintState() {
      if (v.paused !== lastPaused) { lastPaused = v.paused; playIc.innerHTML = ic(v.paused ? 'play' : 'pause'); }
      var m = v.muted || v.volume === 0;
      if (m !== lastMuted) { lastMuted = m; muteIc.innerHTML = ic(m ? 'speaker-x' : 'speaker-high'); }
      if (v.volume !== lastVol || m) { lastVol = v.volume; vol.value = String(m ? 0 : v.volume); }
      if (v.playbackRate !== lastRate) { lastRate = v.playbackRate; speedTxt.nodeValue = (+v.playbackRate.toFixed(2)) + '×'; }
      playerPrefs.volume = v.volume; playerPrefs.muted = v.muted; playerPrefs.rate = v.playbackRate;
    }
    ['play', 'pause', 'volumechange', 'ratechange', 'loadedmetadata'].forEach(function (ev) { v.addEventListener(ev, function () { paintState(); paintTime(); }); });
    v.addEventListener('timeupdate', paintTime);
    v.addEventListener('seeked', paintTime);
    function loop() { if (!V || V.video !== v) return; if (!v.paused) paintTime(); V.raf = requestAnimationFrame(loop); }
    V.raf = requestAnimationFrame(loop);
    paintState(); paintTime();
    return el('div', { class: 'pctrl' }, [scrub, row]);
  }
  function togglePlay() { if (!V || !V.video) return; var v = V.video; if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); }
  function seekBy(s) { if (!V || !V.video) return; var v = V.video; v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 0.01, v.currentTime + s)); }
  function stepFrame(f) { if (!V || !V.video) return; var v = V.video; v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + f / FPS)); }
  function setRate(r) { if (!V || !V.video) return; V.video.playbackRate = Math.max(0.25, Math.min(3, Math.round(r * 100) / 100)); }
  function nudgeVol(d) { if (!V || !V.video) return; var v = V.video; v.volume = Math.max(0, Math.min(1, Math.round((v.volume + d) * 100) / 100)); v.muted = v.volume === 0; }

  // ---------------------------------------------------------------- keyboard (only while our modals are open)
  function typingInside(e) {
    var t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    if (tag === 'input' && /^(range|button|checkbox)$/.test(t.type)) return false;
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }
  function fromOurUI(e) {
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) if (path[i] && path[i].id && /^amine-reels/.test(path[i].id)) return true;
    return false;
  }
  window.addEventListener('keydown', function (e) {
    if (!state.gridOpen && !state.viewer) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typingInside(e)) {
      if (!fromOurUI(e)) return;                       // Instagram's own search / comment box: not ours, leave it alone
      if (e.key !== 'Escape') { e.stopPropagation(); return; }
    }
    // the inline grid is part of the page: Instagram's own post window / menus get Esc and keys first
    if (!state.viewer && settings.mode === 'inline' && document.querySelector('[role="dialog"]')) return;
    var k = e.key, handled = true;
    if (state.viewer) {
      if (k === 'Escape') closeViewer();
      else if (k === 'ArrowLeft') go(rtl() ? 1 : -1);     // Arabic: ← = next; English: ← = previous
      else if (k === 'ArrowRight') go(rtl() ? -1 : 1);
      else if (k === ' ' || k === 'k' || k === 'K') togglePlay();
      else if (k === 'j' || k === 'J') seekBy(e.shiftKey ? -10 : -5);          // Shift = 10 seconds
      else if (k === 'l' || k === 'L') seekBy(e.shiftKey ? 10 : 5);
      else if (e.code === 'Comma' || k === ',') stepFrame(e.shiftKey ? -10 : -1); // Shift = 10 frames
      else if (e.code === 'Period' || k === '.') stepFrame(e.shiftKey ? 10 : 1);
      else if (k === '[') { if (V && V.video) setRate(V.video.playbackRate - 0.25); }
      else if (k === ']') { if (V && V.video) setRate(V.video.playbackRate + 0.25); }
      else if (k === '\\') setRate(1);
      else if (k === 'm' || k === 'M') { if (V && V.video) V.video.muted = !V.video.muted; }
      else if (k === 'ArrowUp') nudgeVol(0.1);
      else if (k === 'ArrowDown') nudgeVol(-0.1);
      else handled = false;
    } else if (state.gridOpen) {
      if (k === 'Escape') closeGrid(); else handled = false;
    }
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---------------------------------------------------------------- stats card (reel page / reels feed / shorts)
  var currentReel = null, scardEl = null, scardMin = false, scardClosed = false, lastKey = '', lastHref = '';
  function isReelPage() { var k = state.page && state.page.kind; return k === 'reel' || k === 'feed' || k === 'shorts'; }

  function mostVisibleVideo() {
    var best = null, bestA = 0, vh = innerHeight, vw = innerWidth;
    var vids = document.getElementsByTagName('video');
    for (var i = 0; i < vids.length; i++) {
      var b = vids[i].getBoundingClientRect();
      var w = Math.min(b.right, vw) - Math.max(b.left, 0), h = Math.min(b.bottom, vh) - Math.max(b.top, 0);
      var a = w > 0 && h > 0 ? w * h : 0;
      if (a > bestA) { bestA = a; best = vids[i]; }
    }
    return best;
  }
  var vidSeq = 0;
  function visibleKey() {
    var v = mostVisibleVideo();
    if (!v) return location.pathname;
    if (!v.__arId) v.__arId = ++vidSeq;
    return location.pathname + '|' + v.__arId + '|' + (v.currentSrc || v.src || '').slice(-60);
  }

  function refreshPage() {
    lastHref = location.href;
    var prevUser = state.page && state.page.username;
    return dataCall('pageInfo').then(function (p) {
      state.page = p || null;
      if (p && p.platform) state.platform = p.platform;
      try { ensureEntry(); } catch (e) {}
      onGridNavigate(p, prevUser);
      if (isReelPage()) { lastKey = ''; pollReel(); }
      else removeStatsCard();
    }, function () { state.page = null; });
  }
  // the inline grid belongs to one profile page: another profile → load that one; another page → close it
  function onGridNavigate(p, prevUser) {
    if (!state.gridOpen || settings.mode !== 'inline') return;
    if (p && p.kind === 'profile' && p.username) {
      if ((p.username || '').toLowerCase() !== (prevUser || '').toLowerCase() && (p.username || '').toLowerCase() !== (state.username || '').toLowerCase()) {
        closeViewer(); state.gridPath = location.pathname; inlineMount(); loadProfile(p.username);
      } else state.gridPath = location.pathname;
      return;
    }
    // scrolling the reels feed changes the address on every reel: same page
    if (/^\/reels\//.test(state.gridPath || '') && /^\/reels\//.test(location.pathname)) { state.gridPath = location.pathname; return; }
    // a post opened from the grid page shows in Instagram's window on top of it: keep the grid; anything else closes it
    var href = location.href;
    setTimeout(function () {
      if (location.href !== href || !state.gridOpen) return;
      if (!document.querySelector('[role="dialog"]')) closeGrid();
    }, 900);
  }
  function pollReel() {
    if (document.hidden || scardClosed || !isReelPage()) return;
    if (dockEl && settings.mode === 'inline') placeDock();
    var k = visibleKey();
    if (k === lastKey) return;
    lastKey = k;
    dataCall('getCurrentReel').then(function (r) {
      if (!r) { if (!currentReel) renderStatsCard(null, T('app.noReel')); return; }
      if (currentReel && keyOf(currentReel) === keyOf(r) && (scardEl || (dockEl && dockHost && dockHost.isConnected))) return;
      currentReel = r;
      renderStatsCard(r);
    }, function (e) { renderStatsCard(null, errText(e), true); });
  }
  // Separate mode: the floating card. Inline mode: a panel docked INSIDE Instagram's post column,
  // or (reels feed, no column) attached to the side of the reel itself.
  var dockHost = null, dockRoot = null, dockEl = null, dockVideo = null, dockRaf = 0;
  function removeStatsCard() {
    if (scardEl) { scardEl.remove(); scardEl = null; }
    if (dockHost) { dockHost.remove(); }
    dockEl = null; dockVideo = null;
    currentReel = null;
  }
  function isDark(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      var c = getComputedStyle(n).backgroundColor, m = c && c.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3 && (m.length < 4 || +m[3] > 0.5)) return (+m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114) < 110;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  // the post's side column next to the video (header / comments / actions), if Instagram shows one
  function findColumn(video) {
    if (!video) return null;
    var vb = video.getBoundingClientRect(), n = video;
    for (var i = 0; i < 30 && n.parentElement; i++) {
      var p = n.parentElement, pb = p.getBoundingClientRect();
      if (pb.width > vb.width + 220 && pb.height >= vb.height * 0.6) {
        for (var j = 0; j < p.children.length; j++) {
          var c = p.children[j];
          if (c.contains(video)) continue;
          var cb = c.getBoundingClientRect();
          if (cb.width >= 260 && cb.height >= vb.height * 0.5) {
            while (c.children.length === 1 && c.firstElementChild.getBoundingClientRect().height >= cb.height * 0.9) c = c.firstElementChild;
            return c;
          }
        }
        return null;
      }
      n = p;
    }
    return null;
  }
  // computed background of the nearest opaque ancestor (Instagram's real surface colour)
  function surfaceOf(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      try {
        var c = getComputedStyle(n).backgroundColor, m = c && c.match(/[\d.]+/g);
        if (m && m.length >= 3 && (m.length < 4 || +m[3] > 0.5)) return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')';
      } catch (e) { return null; }
    }
    return null;
  }
  // The colour Instagram really paints behind the column. In the post window the column itself is transparent and the
  // window colour (dark: rgb(28,31,34), lighter than the page) sits on the column's own blocks, not on an ancestor:
  // read it from the header block above the panel first; only then from the ancestors.
  function opaqueIn(node, depth, minW) {
    if (!node || node.nodeType !== 1 || node.id === 'amine-reels-dock') return null;
    if (minW && node.getBoundingClientRect().width < minW) return null;   // only full-width blocks (never an avatar or a button)
    try {
      var c = getComputedStyle(node).backgroundColor, m = c && c.match(/[\d.]+/g);
      if (m && m.length >= 3 && (m.length < 4 || +m[3] > 0.5)) return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')';
    } catch (e) { return null; }
    if (depth <= 0) return null;
    for (var i = 0; i < node.children.length && i < 4; i++) { var r = opaqueIn(node.children[i], depth - 1, minW); if (r) return r; }
    return null;
  }
  function columnSurface(col) {
    var inDlg = !!(col.closest && col.closest('[role="dialog"]')), minW = col.getBoundingClientRect().width * 0.8;
    for (var i = 0; i < col.children.length && i < 3; i++) {
      if (col.children[i].id === 'amine-reels-dock') continue;
      var r = opaqueIn(col.children[i], 4, minW);
      if (r) return r;
    }
    var own = opaqueIn(col, 0);
    if (own) return own;
    if (inDlg) {             // Instagram's post window uses its elevated surface (light: white)
      try {
        var de = getComputedStyle(document.documentElement);
        var v = (de.getPropertyValue('--ig-elevated-background') || de.getPropertyValue('--ig-primary-background') || '').trim();
        if (v) return 'rgb(' + v + ')';
      } catch (e) {}
    }
    return surfaceOf(col);
  }
  function ensureDockHost() {
    if (!dockHost) {
      dockHost = document.createElement('div');
      dockHost.id = 'amine-reels-dock';
      var sh = dockHost.attachShadow({ mode: 'open' });
      sh.appendChild(el('style', { text: CSS }));
      dockRoot = el('div', { class: 'root', dir: I.dir(), lang: I.lang() });
      sh.appendChild(dockRoot);
      applyTheme();
    }
    return dockRoot;
  }
  function placeDock() {
    if (!dockEl || !dockHost) return;
    var v = dockVideo && dockVideo.isConnected ? dockVideo : mostVisibleVideo();
    var col = findColumn(v);
    if (col && performance.now() < 5000) return;   // first page still hydrating: dock it a moment later (pollReel repeats)
    if (col) {
      // inside the column, right under its first block (the author header)
      dockHost.style.cssText = 'display:block;position:relative;flex:none;';
      var ref = col.children.length > 1 ? col.children[1] : null;
      if (dockHost.parentNode !== col || dockHost.nextSibling !== ref) { if (ref !== dockHost) col.insertBefore(dockHost, ref); }
      dockEl.className = dockEl.className.replace(/\bside\b/g, '').trim();
      dockEl.style.cssText = '';
      // surfaces = exactly the column's own colour (no darker / blacker panel inside Instagram's column)
      var cc = columnSurface(col);
      if (cc) { dockRoot.style.setProperty('--w', cc); dockRoot.style.setProperty('--bg', cc); }
      return;
    }
    // reels feed: attach to the side of the reel, on the side with more free space
    if (!v) return;
    dockRoot.style.removeProperty('--w'); dockRoot.style.removeProperty('--bg');
    if (dockHost.parentNode !== document.body) document.body.appendChild(dockHost);
    dockHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147482000;';
    if (!/\bside\b/.test(dockEl.className)) dockEl.className += ' side';
    var b = v.getBoundingClientRect(), W = 300, gap = 84;
    // Never cover the reel or Instagram's own buttons (up/down arrows at the far left, like/comment column beside the reel).
    // Order: right side → above the reel → left side (clear of Instagram's columns) → right side, narrower.
    var H = dockEl.offsetHeight || 180, spR = innerWidth - b.right - 24, x, y = Math.max(8, b.top), w = W;
    if (spR >= W + 16) x = b.right + Math.min(gap, spR - W);
    else if (b.top - 64 >= H + 12) { x = b.left + (b.width - W) / 2; y = b.top - H - 12; }
    else if (b.left - 120 - W >= 96) x = b.left - 120 - W;
    else { w = Math.max(220, spR); x = innerWidth - 16 - w; }
    if (x < 8) x = 8; if (x + w > innerWidth - 8) x = innerWidth - 8 - w;
    dockEl.style.cssText = 'left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;width:' + Math.round(w) + 'px;';
  }
  function trackDock() {
    if (dockRaf) return;
    dockRaf = requestAnimationFrame(function () { dockRaf = 0; if (dockEl && /\bside\b/.test(dockEl.className)) placeDock(); });
  }
  window.addEventListener('scroll', trackDock, { passive: true, capture: true });
  window.addEventListener('resize', trackDock, { passive: true });

  var cardSlot = '';   // which panel (f = folders, t = transcript) is open under the dock / card: kept across a language change
  function renderDock(r, msg, isErr, keepSlot) {
    ensureDockHost();
    var oldDock = dockEl && dockEl.parentNode === dockRoot ? dockEl : null;
    dockVideo = mostVisibleVideo();
    var dark = wantDark();
    var top = el('div', { class: 'dtop' }, [el('span', { class: 'brand' }, [iconEl('chart-line-up'), T('app.brand')]),
      r ? el('span', { class: 'when', text: relTime(r.takenAt) + (r.takenAt ? ' · ' : '') }, r.takenAt ? [el('span', { class: 'num', style: 'font-weight:400', text: fmtDate(r.takenAt) })] : null) : null]);
    var kids = [top];
    if (!r) kids.push(el('div', { class: 'dmsg' + (isErr ? ' err' : ''), text: msg || '' }));
    else {
      var hot = (r.outlier || 0) >= 3;
      function stat(icn, label, val, cls) {
        return el('div', { class: 'dstat' + (cls ? ' ' + cls : '') }, [el('span', { class: 'num', text: val }), el('span', { class: 'l' }, [iconEl(icn), label])]);
      }
      kids.push(el('div', { class: 'dstats' }, [
        stat('eye', T('app.d.view'), fmtNum(r.views)), stat('heart', T('app.d.like'), fmtNum(r.likes)),
        stat('chat-circle', T('app.d.comment'), fmtNum(r.comments)), stat('paper-plane-tilt', T('app.d.share'), fmtNum(r.shares)), stat('lightning', T('app.d.outlier'), fmtOutlier(r.outlier), hot ? 'hot' : '')]));
      var slot = el('div'), msgEl = el('div', { class: 'dmsg' });
      var sb = el('button', { type: 'button', class: 'btn', onclick: function () { toggleSave(r); } });
      paintSave(sb, r); saveButtons.push({ btn: sb, reel: r });
      function toggleSlot(kind, build) {
        if (slot.__kind === kind) { slot.textContent = ''; slot.__kind = ''; cardSlot = ''; return; }
        slot.textContent = ''; slot.__kind = kind; cardSlot = kind; slot.appendChild(build());
      }
      var builders = {
        f: function () { return folderMenu(r); },
        t: function () { return transcriptBlock(r, { seek: function (t) { var v = mostVisibleVideo(); if (v) v.currentTime = t; } }); }
      };
      kids.push(el('div', { class: 'dacts' }, [
        sb,
        btn('folder-simple', T('app.folder'), function () { toggleSlot('f', builders.f); }),
        btn('waveform', T('app.d.text'), function () { toggleSlot('t', builders.t); }),
        btn('download-simple', T('app.download'), function () { downloadReel(r, msgEl); })
      ]));
      kids.push(msgEl, slot);
      if (keepSlot && builders[keepSlot]) toggleSlot(keepSlot, builders[keepSlot]); else cardSlot = '';
    }
    var prevStyle = oldDock ? oldDock.style.cssText : '', prevCls = oldDock && /\bside\b/.test(oldDock.className) ? ' side' : '';
    dockEl = el('div', { class: 'dock' + (dark ? ' dark' : '') + prevCls }, kids);
    if (prevStyle) dockEl.style.cssText = prevStyle;
    dockRoot.textContent = '';
    dockRoot.appendChild(dockEl);
    placeDock();
  }

  function renderStatsCard(r, msg, isErr, keepSlot) {
    if (scardClosed) return;
    if (settings.mode === 'inline') { if (scardEl) { scardEl.remove(); scardEl = null; } return renderDock(r, msg, isErr, keepSlot); }
    if (dockHost) dockHost.remove();
    var oldCard = scardEl;
    var minB = btn(scardMin ? 'caret-left' : 'minus', null, function () {
      scardMin = !scardMin; scardEl.className = 'scard' + (scardMin ? ' min' : '');
      minB.innerHTML = ''; minB.appendChild(iconEl(scardMin ? 'caret-left' : 'minus'));
      minB.title = scardMin ? T('app.c.show') : T('app.c.min');
    }, 'sm icon ghost', scardMin ? T('app.c.show') : T('app.c.min'));
    var closeB = btn('x', null, function () { scardClosed = true; removeStatsCard(); }, 'sm icon ghost', T('app.c.close'));
    var title = el('span', { class: 't' }, r ? [el('span', { dir: 'ltr', text: '@' + (r.username || '') })] : [T('app.brand')]);
    var chip = r && r.outlier != null ? el('span', { class: 'chip num', text: fmtOutlier(r.outlier) }) : null;
    var head = el('div', { class: 'shead' }, [iconEl('chart-line-up'), title, chip, minB, closeB]);
    var body = el('div', { class: 'sbody' });
    if (!r) body.appendChild(el('div', { class: 'smsg' + (isErr ? ' err' : ''), text: msg || '' }));
    else {
      var txSlot = el('div'), msgEl = el('div', { class: 'smsg' });
      body.appendChild(statRows(r));
      var openTx = function () {
        if (txSlot.__k === 't') { txSlot.textContent = ''; txSlot.__k = ''; cardSlot = ''; return; }
        txSlot.textContent = ''; txSlot.__k = 't'; cardSlot = 't';
        txSlot.appendChild(transcriptBlock(r, { seek: function (t) { var v = mostVisibleVideo(); if (v) v.currentTime = t; } }));
      };
      body.appendChild(actionButtons(r, { short: true, onTranscript: openTx }));
      body.appendChild(txSlot);
      if (keepSlot === 't') openTx(); else cardSlot = '';
    }
    scardEl = el('div', { class: 'scard' + (scardMin ? ' min' : '') }, [head, body]);
    if (oldCard && oldCard.parentNode === root) oldCard.replaceWith(scardEl);   // one-step swap: no flicker
    else root.insertBefore(scardEl, root.firstChild); // under our grid / viewer windows, never on top of them
  }

  // ---------------------------------------------------------------- language (ARI18N.onChange)
  // Everything open is rebuilt in place in one task (old node swapped for the new one): no reload, no empty frame.
  function applyDir() {
    var d = I.dir(), l = I.lang();
    [root, inlineRoot, dockRoot, entryRoot].forEach(function (r) { if (r) { r.setAttribute('dir', d); r.setAttribute('lang', l); } });
  }
  function relang() {
    applyDir();
    if (entryBtn) { entryBtn.title = T('app.entryTitle'); entryLbl.textContent = T('app.sorted'); }
    if (gridLayer && state.gridOpen) {
      var old = gridLayer, inline = settings.mode === 'inline', sc = old.querySelector('.gbody'), st = sc ? sc.scrollTop : 0;
      gridLayer = null; buildGrid();                   // buildGrid appends the new layer; take the old one out right after
      old.remove();
      if (gridEls.input && state.username) gridEls.input.value = state.username;
      renderGridHead(); renderGridBody();
      if (!inline && gridEls.body) gridEls.body.scrollTop = st;
      if (viewerLayer && viewerLayer.parentNode === root) root.appendChild(viewerLayer);   // the viewer stays on top
    }
    if (state.viewer && viewerLayer) renderViewer(true);
    if (currentReel && (scardEl || (dockEl && dockHost && dockHost.isConnected))) renderStatsCard(currentReel, null, false, cardSlot);
    else if (isReelPage()) { lastKey = ''; pollReel(); }
  }
  I.onChange(function () { try { relang(); } catch (e) {} });

  // ---------------------------------------------------------------- wiring
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg && msg.type === 'AR_TOGGLE_APP') { toggleGrid(); try { sendResponse({ ok: true, open: state.gridOpen }); } catch (e) {} }
    });
  } catch (e) {}

  function boot() {
    if (window.ARData && typeof window.ARData.on === 'function') {
      window.ARData.on('navigate', function () { scardClosed = false; refreshPage(); });
    }
    refreshSaved();
    // first render only once the stored language is known (no Arabic → English jump)
    Promise.all([loadSettings(), I.ready]).then(function () { applyDir(); applyTheme(); refreshPage(); });
    setInterval(function () { applyTheme(); try { ensureEntry(); } catch (e) {} }, 2000);
    setInterval(function () {
      if (location.href !== lastHref) { scardClosed = false; refreshPage(); return; }
      pollReel();
    }, 1500);
  }
  if (window.ARData) boot();
  else { var tries = 0; var t = setInterval(function () { if (window.ARData || ++tries > 20) { clearInterval(t); boot(); } }, 250); }
})();
