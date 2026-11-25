/* Reels Analysis — research page — one mixed feed of reels from many Instagram creators, sorted by performance.
   Data comes only through an Instagram tab's content script ({type:'AR_DATA'}); cached in chrome.storage.local 'ar_research'. */
(function () {
  'use strict';
  var PH = window.PH || {};
  var KEY = 'ar_research', LIB = 'ar_library';
  var IG_HOME = 'https://www.instagram.com/';
  var $ = function (id) { return document.getElementById(id); };
  var RESERVED = ['reel', 'reels', 'p', 'tv', 'explore', 'stories', 'direct', 'accounts', 'about', 'developer', 'legal', 'web', 'api', 'graphql', 'ajax', 'challenge', 'emails', 'session', 'login', 'privacy', 'terms', 'directory', 'static', 'oauth', 'nametag', 'lite', 'your_activity', 'topics'];
  // matches ig.js rate-limit / refusal messages in both languages
  var RATE_RE = /كثرة طلبات|أوقف الطلبات|رفض الطلب|429|rate.?limit|too many requests|paused requests|rejected the request/i;
  var T = window.ARI18N.t, ARP = window.ARP;

  var state = { creators: [], settings: { sort: 'views', limit: 30, minOutlier: 0, period: 'all', from: '', to: '' } };
  var selected = {};            // username -> true (empty = all)
  var libKeys = {};             // keyOf(reel) -> true
  var saveBtns = {};            // keyOf(reel) -> button (updated in place)
  var job = null;               // { queue, i, stop, current }
  var undoCreator = null;

  Array.prototype.forEach.call(document.querySelectorAll('[data-ic]'), function (n) { n.innerHTML = PH[n.getAttribute('data-ic')] || ''; });

  // ---------------- helpers (same formats as library.js)
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function ic(name) { return el('span', { class: 'ic', html: PH[name] || '' }); }
  var fmtNum = ARP.fmtNum;
  function fmtPct(p) { if (p == null || isNaN(p)) return '—'; return (p >= 10 ? String(Math.round(p)) : p >= 0.1 ? (Math.round(p * 10) / 10).toFixed(1).replace(/\.0$/, '') : '<0.1') + '%'; }
  function fmtOutlier(o) { if (o == null || isNaN(o)) return '—'; if (o >= 0 && o < 0.1) return '<0.1×'; /* a real ratio is never 0 (0 views → null) */ return (o >= 10 ? String(Math.round(o)) : (Math.round(o * 10) / 10).toFixed(1).replace(/\.0$/, '')) + '×'; }
  function relTime(ts) { return ARP.relTime(ts, ''); }
  function keyOf(r) { return (r.platform || '') + ':' + (r.code || r.id || r.url); }
  function iso(ms) { return ms ? new Date(ms).toISOString() : ''; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function findCreator(u) { u = u.toLowerCase(); return state.creators.find(function (c) { return c.username.toLowerCase() === u; }); }

  // ---------------- storage
  function persist() { var o = {}; o[KEY] = state; return chrome.storage.local.set(o); }
  function load() {
    chrome.storage.local.get([KEY, LIB], function (o) {
      var s = o && o[KEY];
      if (s && Array.isArray(s.creators)) state.creators = s.creators;
      if (s && s.settings) for (var k in s.settings) state.settings[k] = s.settings[k];
      setLib((o && o[LIB]) || []);
      $('sort').value = state.settings.sort; $('minOutlier').value = String(state.settings.minOutlier);
      $('period').value = state.settings.period;
      var preset = [30, 60, 120, 500].indexOf(Number(state.settings.limit)) >= 0;
      $('limit').value = preset ? String(state.settings.limit) : 'custom';
      $('limitBox').hidden = preset; $('limitN').value = preset ? '' : String(state.settings.limit);
      $('dFrom').value = state.settings.from || ''; $('dTo').value = state.settings.to || '';
      $('rangeBox').hidden = $('rangeBox2').hidden = state.settings.period !== 'range';
      renderAll();
    });
  }
  function setLib(arr) { libKeys = {}; (arr || []).forEach(function (r) { libKeys[keyOf(r)] = true; }); }
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'local' || !ch[LIB]) return;
    setLib(ch[LIB].newValue || []);
    for (var k in saveBtns) paintSave(saveBtns[k], !!libKeys[k]);
  });

  // ---------------- parse input
  // Understands any form: name, @name, profile links with /reels/ /tagged/ ?hl=en, stories links,
  // m.instagram.com, and reel / post links (their owner is looked up from Instagram).
  var reelCodesFromInput = [];
  function parseNames(text) {
    var out = []; reelCodesFromInput = [];
    String(text || '').split(/[\s,،;|]+/).forEach(function (t) {
      t = t.trim().replace(/^[<("'«]+|[>)"'».]+$/g, ''); if (!t) return;
      var u = null, m = t.match(/instagram\.com\/(.+)$/i);
      if (m) {
        var parts = m[1].split(/[?#]/)[0].split('/').filter(Boolean);
        if (parts[0] === '_u') parts.shift();
        if (/^(reel|reels|p|tv)$/i.test(parts[0]) && parts[1]) { if (reelCodesFromInput.indexOf(parts[1]) < 0) reelCodesFromInput.push(parts[1]); return; }
        if (/^stories$/i.test(parts[0]) && parts[1]) u = parts[1];
        else u = parts[0];
      } else u = t;
      u = String(u || '').replace(/^@+/, '').replace(/[\/?#].*$/, '').toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(u) || RESERVED.indexOf(u) >= 0) return;
      if (out.indexOf(u) < 0) out.push(u);
    });
    return out;
  }

  // ---------------- Instagram tab (data only through its content script)
  function msgTab(tabId, msg, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms || 8000);
      try {
        chrome.tabs.sendMessage(tabId, msg, function (res) {
          if (done) return; done = true; clearTimeout(t);
          var e = chrome.runtime.lastError;
          if (e) reject(new Error(e.message)); else resolve(res);
        });
      } catch (e) { done = true; clearTimeout(t); reject(e); }
    });
  }
  function answers(tabId) {
    return msgTab(tabId, { type: 'AR_DATA', fn: 'pageInfo', args: [] }, 4000).then(function (r) { return !!(r && r.ok); }, function () { return false; });
  }
  function waitComplete(tabId) {
    return new Promise(function (resolve) {
      var t = setTimeout(fin, 30000);
      function fin() { clearTimeout(t); chrome.tabs.onUpdated.removeListener(lis); resolve(); }
      function lis(id, info) { if (id === tabId && info.status === 'complete') fin(); }
      chrome.tabs.onUpdated.addListener(lis);
      chrome.tabs.get(tabId, function (tab) { if (!chrome.runtime.lastError && tab && tab.status === 'complete') fin(); });
    });
  }
  async function openTab(url) {
    // a small window, not a hidden tab: Instagram only loads more reels while its page is on screen
    var win = await chrome.windows.create({ url: url, focused: true, width: 520, height: 820, type: 'popup' });
    var tab = win.tabs[0];
    await waitComplete(tab.id);
    await sleep(2000);
    for (var k = 0; k < 4; k++) { if (await answers(tab.id)) return { id: tab.id, opened: true }; await sleep(1500); }
    try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ }
    throw new Error(T('r.errNoTab'));
  }
  async function getIgTab() {
    var tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
    for (var i = 0; i < tabs.length; i++) if (!tabs[i].discarded && await answers(tabs[i].id)) return { id: tabs[i].id, opened: false };
    return openTab(IG_HOME);
  }
  // load a creator's reels page in OUR background tab (never the user's own tab). Logged out, Instagram only
  // gives a profile's reels on that profile's own page, so this is the fallback when the direct read fails.
  async function gotoProfile(tab, u) {
    var url = 'https://www.instagram.com/' + encodeURIComponent(u) + '/reels/';
    await chrome.tabs.update(tab.id, { url: url });
    await sleep(600);
    await waitComplete(tab.id);
    await sleep(2500);
    for (var k = 0; k < 4; k++) { if (await answers(tab.id)) return true; await sleep(1500); }
    return false;
  }
  function callReels(tabId, u, noScroll) {
    // noScroll: never scroll a tab the user is reading (only our own window may be scrolled)
    return msgTab(tabId, { type: 'AR_DATA', fn: 'getProfileReels', args: [u, { limit: Number(state.settings.limit) || 60, noScroll: !!noScroll }] }, 240000)
      .then(function (r) { return r || { ok: false, error: T('r.noReply') }; },
        function (e) { return { ok: false, conn: true, error: e.message === 'timeout' ? T('r.timeout') : T('r.disconnected') }; });
  }

  // ---------------- fetching (one creator at a time, 2–3 s apart)
  async function runFetch(names) {
    names = names.filter(function (u, i) { return names.indexOf(u) === i; });
    if (!names.length) return;
    if (job) { names.forEach(function (u) { if (job.queue.indexOf(u) < 0) job.queue.push(u); }); paintProgress(); renderChips(); return; }
    job = { queue: names, i: 0, stop: false, current: '' };
    var lines = [], rateHit = false, tab = null, worker = null, useWorker = false, okCount = 0, partials = [];
    showMsg(null);
    progKey = 'r.preparing'; paintProgress();
    renderChips();
    try {
      tab = await getIgTab();
      for (; job.i < job.queue.length; job.i++) {
        if (job.stop) break;
        var u = job.queue[job.i];
        job.current = u; paintProgress(); renderChips();
        var res;
        if (!useWorker) {
          res = await callReels(tab.id, u, !tab.opened);
          if (!res.ok && res.conn && !(await answers(tab.id))) { tab = await getIgTab(); res = await callReels(tab.id, u, !tab.opened); }
        }
        var few = res && res.ok && res.result && (res.result.partial || ((res.result.reels || []).length < Math.min(Number(state.settings.limit) || 60, 40) && (res.result.reels || []).length <= 16));
        if (useWorker || few || (!res.ok && !RATE_RE.test(res.error || ''))) {
          if (!worker) worker = tab.opened ? tab : await openTab(IG_HOME);
          if (await gotoProfile(worker, u)) {
            var res2 = await callReels(worker.id, u);
            if (res2.ok) useWorker = true;
            if (res2.ok && (!res.ok || (res2.result.reels || []).length >= (res.result.reels || []).length)) res = res2;
            else if (res2.ok || !res || res.ok === undefined || useWorker) res = res.ok ? res : res2;
            else if (RATE_RE.test(res2.error || '')) res = res2;
          } else if (!res) res = { ok: false, error: T('r.tabNoAnswer') };
        }
        var c = findCreator(u);
        if (!c) { c = { username: u, addedAt: Date.now(), lastFetched: 0, profile: null, reels: [], median: 0, note: '' }; state.creators.push(c); }
        if (res && res.ok && res.result) {
          var r = res.result;
          c.profile = r.profile || c.profile;
          if (r.profile && r.profile.username) c.username = r.profile.username;
          c.reels = (r.reels || []).map(function (x) { if (!x.username) x.username = c.username; return x; });
          c.median = r.median || 0;
          c.note = r.note || '';
          c.partial = !!r.partial;
          c.error = '';
          c.lastFetched = Date.now();
          okCount++;
          if (r.note) lines.push({ u: c.username, t: r.note });
        } else {
          var em = (res && res.error) || T('r.fetchFail');
          c.error = em;
          lines.push({ u: u, t: em, e: true });
          if (RATE_RE.test(em)) { rateHit = true; }
        }
        await persist();
        renderAll();
        if (rateHit) break;
        if (job.i < job.queue.length - 1 && !job.stop) await sleep(1000 + Math.random() * 500);
      }
    } catch (e) {
      lines.push({ t: e.message || String(e), e: true });
    }
    var total = job.queue.length, stopped = job.stop;
    var mine = [tab, worker].filter(function (t, i, a) { return t && t.opened && a.findIndex(function (x) { return x && x.id === t.id; }) === i; });
    for (var m = 0; m < mine.length; m++) { try { await chrome.tabs.remove(mine[m].id); } catch (e) { /* closed */ } }
    job = null;
    paintProgress();
    var head;
    var nums = { ok: okCount, total: total };
    if (rateHit) head = { k: 'r.rateStop', v: nums, e: true };
    else if (stopped) head = { k: 'r.stopped', v: nums };
    else if (okCount === total) head = { k: 'r.done', v: nums };
    else head = { k: 'r.finished', v: nums, e: okCount === 0 };
    if (partials.length) lines.unshift({ us: partials, k: 'r.partialNote' });
    showMsg([head].concat(lines), rateHit || okCount < total);
    renderAll();
  }

  var live = null; // live count from the Instagram tab while one creator is being fetched
  try {
    chrome.runtime.onMessage.addListener(function (m) {
      if (!m || m.type !== 'AR_PROGRESS' || !job || !m.data) return;
      if (String(m.data.username || '').toLowerCase() !== String(job.current || '').toLowerCase()) return;
      live = m.data; paintProgress();
    });
  } catch (e) { }
  var progKey = null;   // a fixed progress text (preparing / stopping) instead of the counter
  function paintProgress() {
    var p = $('prog');
    if (!job) { p.hidden = true; progKey = null; return; }
    p.hidden = false;
    var n = job.queue.length, i = Math.min(job.i + 1, n);
    var text = progKey && T(progKey);
    if (progKey === 'r.preparing' && job.current) { progKey = null; text = ''; }
    var extra = live && job && String(live.username || '').toLowerCase() === String(job.current || '').toLowerCase()
      ? ' — ' + T(live.limit >= 500 ? 'r.liveAll' : 'r.live', { step: live.step, count: live.count, limit: live.limit }) : '';
    $('progT').textContent = text || (T('r.prog', { i: i, n: n, u: job.current }) + extra);
    $('progBar').style.width = (text ? 0 : Math.round(((i - 1) / n) * 100)) + '%';
  }
  // lines: [{t: text | k: i18n key + v: vars, u?: username, us?: [usernames], e?: error}], lines.act = action node
  var lastMsg = null;
  function showMsg(lines, bad) {
    var m = $('msg'); m.textContent = '';
    lastMsg = lines && lines.length ? { lines: lines, bad: bad } : null;
    if (!lines || !lines.length) { m.hidden = true; return; }
    m.className = 'msg' + (bad ? ' bad' : '');
    lines.forEach(function (l) { m.appendChild(el('div', { class: 'l' + (l.e ? ' e' : '') }, [ic(l.e ? 'warning-circle' : 'check'), el('span', null, (l.us ? [T('r.partialFor')].concat(l.us.reduce(function (a, u, i) { if (i) a.push(window.ARI18N.lang() === 'ar' ? '\u060c ' : ', '); a.push(el('bdi', { dir: 'ltr', text: '@' + u })); return a; }, []), [': ']) : []).concat([l.u ? el('bdi', { dir: 'ltr', text: '@' + l.u }) : null, l.u ? ': ' : '', l.k ? T(l.k, l.v) : l.t]))])); });
    if (lines.act) m.appendChild(lines.act);
    m.hidden = false;
  }

  // ---------------- creators
  async function addFromInput() {
    var names = parseNames($('addIn').value);
    if (reelCodesFromInput.length) {
      // reel links: find whose reel it is, then add that creator
      showMsg([{ k: 'r.lookup', v: { n: reelCodesFromInput.length } }]);
      try {
        var tab = await getIgTab();
        for (var i = 0; i < reelCodesFromInput.length; i++) {
          var r = await msgTab(tab.id, { type: 'AR_DATA', fn: 'getReel', args: [reelCodesFromInput[i]] }, 30000).catch(function () { return null; });
          var owner = r && r.ok && r.result && r.result.username;
          if (owner && names.indexOf(owner.toLowerCase()) < 0) names.push(owner.toLowerCase());
        }
        if (tab.opened) { try { await chrome.tabs.remove(tab.id); } catch (e) { } }
      } catch (e) { }
      showMsg(null);
    }
    if (!names.length) { showMsg([{ k: 'r.noName', e: true }], true); return; }
    names.forEach(function (u) {
      if (!findCreator(u)) state.creators.push({ username: u, addedAt: Date.now(), lastFetched: 0, profile: null, reels: [], median: 0, note: '' });
    });
    $('addIn').value = '';
    persist(); renderAll();
    runFetch(names);
  }
  function removeCreator(c) {
    var idx = state.creators.indexOf(c); if (idx < 0) return;
    state.creators.splice(idx, 1); delete selected[c.username];
    undoCreator = { c: c, idx: idx };
    persist(); renderAll();
    var lines = [{ k: 'r.removedC', v: { u: c.username } }];
    lines.act = el('div', null, [el('button', { class: 'btn sm', type: 'button', onclick: function () {
      if (!undoCreator) return;
      state.creators.splice(Math.min(undoCreator.idx, state.creators.length), 0, undoCreator.c); undoCreator = null;
      persist(); renderAll(); showMsg(null);
    } }, [ic('arrow-counter-clockwise'), el('span', { text: T('c.undo') })])]);
    showMsg(lines);
  }

  function renderChips() {
    var box = $('chips'); box.textContent = '';
    if (!state.creators.length) return;
    var anySel = Object.keys(selected).length > 0;
    box.appendChild(el('button', { class: 'cchip all' + (anySel ? '' : ' cur'), type: 'button', onclick: function () { selected = {}; renderAll(); } }, [el('span', { text: T('c.all') })]));
    state.creators.forEach(function (c) {
      var p = c.profile || {};
      var busy = job && job.current.toLowerCase() === c.username.toLowerCase();
      var queued = job && !busy && job.queue.slice(job.i + 1).some(function (u) { return u.toLowerCase() === c.username.toLowerCase(); });
      var av = p.pic ? el('img', { class: 'av', src: p.pic, alt: '', referrerpolicy: 'no-referrer' }) : el('span', { class: 'av' }, [ic('user-circle')]);
      if (p.pic) av.addEventListener('error', function () { var s = el('span', { class: 'av' }, [ic('user-circle')]); av.replaceWith(s); });
      var st;
      if (busy) st = el('span', { class: 'wait', text: T('r.fetchingNow') });
      else if (queued) st = el('span', { class: 'wait', text: T('r.queued') });
      else if (!c.lastFetched) st = el('span', { class: 'st', text: T(c.error ? 'r.fetchErr' : 'r.notFetched') });
      else st = el('span', { class: 'st' }, [
        el('span', { class: 'num', text: fmtNum(p.followers) }), T('r.followers'), el('span', { class: 'num', text: fmtNum(c.median) }),
        ' · ', el('span', { class: 'num', text: String(c.reels.length) }), T('r.reelsDot'), T('r.updated', { t: relTime(c.lastFetched / 1000) })
      ]);
      var title = [p.fullName, c.error ? T('r.errPrefix') + c.error : '', c.note].filter(Boolean).join('\n');
      var chip = el('div', { class: 'cchip' + (selected[c.username] ? ' cur' : '') + (c.error ? ' err' : ''), title: title || null, role: 'button', tabindex: '0' }, [
        av,
        el('span', { class: 'tx' }, [el('span', { class: 'nm', text: '@' + c.username }), st]),
        el('button', { class: 'mini', type: 'button', title: T('r.refreshOne'), disabled: !!(busy || queued), onclick: function (e) { e.stopPropagation(); runFetch([c.username]); } }, [ic('arrow-clockwise')]),
        el('button', { class: 'mini del', type: 'button', title: T('r.removeAcc'), disabled: !!busy, onclick: function (e) { e.stopPropagation(); removeCreator(c); } }, [ic('x')])
      ]);
      function toggle() { if (selected[c.username]) delete selected[c.username]; else selected[c.username] = true; renderAll(); }
      chip.addEventListener('click', toggle);
      chip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      box.appendChild(chip);
    });
  }

  // ---------------- feed
  function feed() {
    var s = state.settings, anySel = Object.keys(selected).length > 0;
    var minO = Number(s.minOutlier) || 0;
    var since = s.period === 'all' ? 0 : s.period === 'range' ? (s.from ? new Date(s.from + 'T00:00:00').getTime() / 1000 : 0) : Date.now() / 1000 - Number(s.period) * 86400;
    var until = s.period === 'range' && s.to ? new Date(s.to + 'T23:59:59').getTime() / 1000 : 0;
    var list = [], noDate = 0;
    state.creators.forEach(function (c) {
      if (anySel && !selected[c.username]) return;
      (c.reels || []).forEach(function (r) {
        if (minO && !((r.outlier || 0) >= minO)) return;
        if (since || until) { if (!r.takenAt) { noDate++; return; } if (since && r.takenAt < since) return; if (until && r.takenAt > until) return; }
        list.push(r);
      });
    });
    var key = s.sort;
    // unknown values (null / hidden) always last
    var v = function (r) { var x = r[key]; return x == null || x < 0 ? -1 : x; };
    list.sort(function (a, b) { return v(b) - v(a) || (b.views || 0) - (a.views || 0); });
    return { list: list, noDate: noDate };
  }
  function shownCreators() {
    var anySel = Object.keys(selected).length > 0;
    return state.creators.filter(function (c) { return !anySel || selected[c.username]; });
  }

  function renderFeed() {
    var f = feed(), list = f.list, grid = $('grid'), empty = $('empty');
    var cs = shownCreators();
    var total = cs.reduce(function (a, c) { return a + (c.reels || []).length; }, 0);
    // header sub + summary
    var all = state.creators.reduce(function (a, c) { return a + (c.reels || []).length; }, 0);
    $('sub').textContent = state.creators.length ? T('r.subAll', { acc: ARP.count('r.accN', state.creators.length), n: all }) : T('r.subEmpty');
    var sm = $('summary'); sm.textContent = '';
    if (state.creators.length) {
      sm.appendChild(el('span', null, [el('span', { class: 'num', text: String(cs.length) }), ' ' + ARP.plural('r.accN', cs.length)]));
      sm.appendChild(el('span', { class: 'sep', text: '|' }));
      sm.appendChild(el('span', null, [el('span', { class: 'num', text: String(list.length) }), T('r.shown'), list.length !== total ? T('r.of') : '', list.length !== total ? el('span', { class: 'num', text: String(total) }) : null]));
      if (list.length) {
        var t = list[0], k = state.settings.sort;
        var val = k === 'outlier' ? fmtOutlier(t.outlier) + T('r.vsMedian') : k === 'shareOutlier' ? fmtOutlier(t.shareOutlier) + T('r.vsShareMedian')
          : k === 'shareRate' ? fmtPct(t.shareRate) + T('r.ofViews') : k === 'takenAt' ? (relTime(t.takenAt) || '—') : fmtNum(t[k]) + ' ' + T('r.u.' + k);
        sm.appendChild(el('span', { class: 'sep', text: '|' }));
        sm.appendChild(el('span', { class: 'top1' }, [ic('lightning'), T('r.top'),
          el('a', { href: t.url, target: '_blank', rel: 'noopener', dir: 'ltr', text: '@' + t.username }), ' — ', el('span', { class: 'num', text: val }),
          k !== 'views' ? ' · ' : '', k !== 'views' ? el('span', { class: 'num', text: fmtNum(t.views) }) : null, k !== 'views' ? ' ' + T('r.u.views') : '']));
      }
    }
    var notes = [];
    if (f.noDate) notes.push(T('r.noDate', { n: f.noDate }));
    var anyNoDate = cs.some(function (c) { return (c.reels || []).some(function (r) { return !r.takenAt; }); });
    if (state.settings.sort === 'takenAt' && anyNoDate) notes.push(T('r.noDateSort'));
    if (/^(shares|reposts|shareRate|shareOutlier)$/.test(state.settings.sort) && cs.some(function (c) { return (c.reels || []).some(function (r) { return r.shares == null; }); }))
      notes.push(T('r.noShares'));
    $('fnote').textContent = notes.join(' ');

    grid.textContent = ''; saveBtns = {};
    if (!list.length) {
      empty.hidden = false; empty.textContent = '';
      var none = !state.creators.length, unfetched = !none && !all;
      empty.appendChild(ic(none ? 'user-circle' : 'funnel'));
      empty.appendChild(el('div', { text: T(none ? 'r.emptyNone' : unfetched ? 'r.emptyUnfetched' : 'r.emptyFilter') }));
      return;
    }
    empty.hidden = true;
    var frag = document.createDocumentFragment();
    list.forEach(function (r, i) { frag.appendChild(card(r, i + 1)); });
    grid.appendChild(frag);
  }

  function paintSave(b, on) {
    b.className = 'btn sm grow' + (on ? ' on' : '');
    b.textContent = '';
    b.appendChild(ic(on ? 'bookmark-simple-fill' : 'bookmark-simple'));
    b.appendChild(el('span', { text: T(on ? 'r.saved' : 'c.save') }));
    b.title = T(on ? 'c.removeLib' : 'r.saveLib');
  }
  function toggleSave(r) {
    var k = keyOf(r);
    chrome.storage.local.get(LIB, function (o) {
      var arr = (o && o[LIB]) || [];
      var idx = arr.findIndex(function (x) { return keyOf(x) === k; });
      if (idx >= 0) arr.splice(idx, 1);
      else { var copy = JSON.parse(JSON.stringify(r)); copy.savedAt = Date.now(); arr.unshift(copy); }
      var w = {}; w[LIB] = arr; chrome.storage.local.set(w);
    });
  }

  function card(r, rank) {
    var hot = (r.outlier || 0) >= 3;
    var img = el('img', { src: r.thumb || '', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    var thumb = el('a', { class: 'thumb', href: r.url, target: '_blank', rel: 'noopener', title: T('r.openReelIg') }, [
      img,
      el('span', { class: 'badge num' + (hot ? ' hot' : ''), title: T('r.outlierTip'), text: fmtOutlier(r.outlier) }),
      el('span', { class: 'rank num', text: '#' + rank })
    ]);
    img.addEventListener('error', function () { img.remove(); thumb.insertBefore(el('div', { class: 'ph' }, [ic('instagram-logo')]), thumb.firstChild); });
    var k = keyOf(r);
    var sb = el('button', { type: 'button', onclick: function () { toggleSave(r); } });
    paintSave(sb, !!libKeys[k]); saveBtns[k] = sb;
    return el('div', { class: 'card' }, [
      thumb,
      el('div', { class: 'meta' }, [
        el('div', { class: 'user' }, [ic('instagram-logo'), el('span', { dir: 'ltr', text: '@' + (r.username || '') })]),
        el('div', { class: 'cap', dir: 'auto', text: r.caption || '' }),
        el('div', { class: 'stats' }, [
          el('span', { title: T('c.views') }, [ic('eye'), el('span', { class: 'num', text: fmtNum(r.views) })]),
          el('span', { title: T('c.likes') }, [ic('heart'), el('span', { class: 'num', text: fmtNum(r.likes) })]),
          el('span', { title: T('c.comments') }, [ic('chat-circle'), el('span', { class: 'num', text: fmtNum(r.comments) })]),
          el('span', { title: r.shareRate != null ? T('r.sharesTip', { p: fmtPct(r.shareRate) }) : T('c.shares') }, [ic('paper-plane-tilt'), el('span', { class: 'num', text: fmtNum(r.shares) })])
        ]),
        el('div', { class: 'date', text: r.takenAt ? T('r.posted', { t: relTime(r.takenAt) }) : T('r.noDateCard') })
      ]),
      el('div', { class: 'acts' }, [
        sb,
        el('a', { class: 'btn sm icon', href: r.url, target: '_blank', rel: 'noopener', title: T('c.openIg') }, [ic('arrow-up-right')])
      ])
    ]);
  }

  function renderAll() {
    renderChips(); renderFeed();
    $('refreshAll').disabled = !state.creators.length || !!job;
    $('addBtn').disabled = false;
    $('exCsv').disabled = !feed().list.length;
  }

  // ---------------- export
  function download(name, data, type) {
    var url = URL.createObjectURL(new Blob([data], { type: type }));
    var a = el('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  $('exCsv').addEventListener('click', function () {
    var meds = {}; state.creators.forEach(function (c) { meds[c.username.toLowerCase()] = c.median; });
    var cols = ['rank', 'username', 'url', 'views', 'likes', 'comments', 'shares', 'reposts', 'shareRatePct', 'outlier', 'shareOutlier', 'creatorMedian', 'publishedAt', 'duration', 'caption'];
    function cell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = feed().list.map(function (r, i) {
      return [i + 1, r.username, r.url, r.views, r.likes, r.comments, r.shares, r.reposts, r.shareRate, r.outlier, r.shareOutlier, meds[(r.username || '').toLowerCase()], r.takenAt ? iso(r.takenAt * 1000) : '', r.duration, r.caption].map(cell).join(',');
    });
    download('amine-research-' + stamp() + '.csv', '﻿' + cols.join(',') + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
  });

  // ---------------- events
  $('addBtn').addEventListener('click', addFromInput);
  $('addIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addFromInput(); } });
  $('refreshAll').addEventListener('click', function () { runFetch(state.creators.map(function (c) { return c.username; })); });
  $('stopBtn').addEventListener('click', function () { if (job) { job.stop = true; progKey = 'r.stopping'; paintProgress(); } });
  ['sort', 'minOutlier', 'period'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var v = $(id).value; state.settings[id] = id === 'minOutlier' ? Number(v) : v;
      if (id === 'period') $('rangeBox').hidden = $('rangeBox2').hidden = v !== 'range';
      persist(); renderAll();
    });
  });
  ['dFrom', 'dTo'].forEach(function (id) {
    $(id).addEventListener('change', function () { state.settings[id === 'dFrom' ? 'from' : 'to'] = $(id).value; persist(); renderAll(); });
  });
  $('limitN').addEventListener('change', function () {
    var n = Math.min(500, Math.max(1, Math.round(Number($('limitN').value) || 0)));
    if (!n) return;
    $('limitN').value = String(n); state.settings.limit = n; persist();
    showMsg([{ k: 'r.limitMsg', v: { n: n } }]);
  });
  $('limit').addEventListener('change', function () {
    if ($('limit').value === 'custom') { $('limitBox').hidden = false; $('limitN').focus(); return; }
    $('limitBox').hidden = true;
    state.settings.limit = Number($('limit').value); persist();
    showMsg([{ k: 'r.limitMsg', v: { n: state.settings.limit } }]);
  });
  // language: static strings via data-i18n, everything drawn by JS redrawn in place (no reload)
  var started = false;
  ARP.wire(function () {
    if (!started) { started = true; load(); return; }
    renderAll(); paintProgress();
    if (lastMsg) showMsg(lastMsg.lines, lastMsg.bad);
  });
})();
