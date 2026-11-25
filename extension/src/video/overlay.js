/* Reels Analysis — video control overlay .
 * Runs in every page and frame (isolated world). Self-contained: depends on no other file.
 * Shadow DOM host: #amine-vc-root. API: window.AmineVC. Messages: {type:'AR_VC', action, value}.
 * Rules: no animations/transitions, no DOM rebuilds while playing (only textContent / style widths). */
(function () {
  'use strict';
  if (window.__amineVCLoaded) return;
  window.__amineVCLoaded = true;

  // ---------- constants ----------
  var BLUE = '#0F6BFF';
  var SKIP_ROOT_ID = 'amine-reels-root';
  var HOST_ID = 'amine-vc-root';
  var MIN_W = 160, MIN_H = 200;         // smaller videos are ignored (icons, avatars, grid previews)
  var FLASH_MS = 1600;                  // bar stays visible this long after a shortcut
  var TOAST_MS = 700;
  var DEFAULT_FPS = 30;
  var SEEK_SHIFT_ARROW = 5;              // Shift+← / Shift+→ seek step in seconds (owner may want 30: change it here)
  var LRM = '\u200E';
  function ltr(t) { return '\u2066' + t + '\u2069'; } // keep '+5' / '1.5×' left-to-right inside Arabic toasts
  // translations: lib/i18n.js + lib/i18n-app.js (vc.* keys). Without them (not loaded) the key itself shows, nothing breaks.
  var I = window.ARI18N || { t: function (k, v) { return String(k).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); },
    dir: function () { return 'rtl'; }, ready: Promise.resolve(), onChange: function () {} };
  function T(k, v) { return I.t(k, v); }

  // Phosphor Regular paths (MIT, @phosphor-icons/core assets/regular/*.svg)
  var P = {
    play: 'M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z',
    pause: 'M200,32H160a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32Zm0,176H160V48h40ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Zm0,176H56V48H96Z',
    back: 'M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z',
    fwd: 'M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16H211.4L184.81,71.64l-.25-.24a80,80,0,1,0-1.67,114.78,8,8,0,0,1,11,11.63A95.44,95.44,0,0,1,128,224h-1.32A96,96,0,1,1,195.75,60L224,85.8V56a8,8,0,1,1,16,0Z',
    caretL: 'M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z',
    caretR: 'M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z',
    vol: 'M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z',
    mute: 'M53.92,34.62A8,8,0,1,0,42.08,45.38L73.55,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V175.09l42.08,46.29a8,8,0,1,0,11.84-10.76ZM32,96H72v64H32ZM144,207.64,88,164.09V95.89l56,61.6Zm42-63.77a24,24,0,0,0,0-31.72,8,8,0,1,1,12-10.57,40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.59Zm-80.16-76a8,8,0,0,1,1.4-11.23l39.85-31A8,8,0,0,1,160,32v74.83a8,8,0,0,1-16,0V48.36l-26.94,21A8,8,0,0,1,105.84,67.91ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z',
    repeat: 'M24,128A72.08,72.08,0,0,1,96,56H204.69L194.34,45.66a8,8,0,0,1,11.32-11.32l24,24a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L204.69,72H96a56.06,56.06,0,0,0-56,56,8,8,0,0,1-16,0Zm200-8a8,8,0,0,0-8,8,56.06,56.06,0,0,1-56,56H51.31l10.35-10.34a8,8,0,0,0-11.32-11.32l-24,24a8,8,0,0,0,0,11.32l24,24a8,8,0,0,0,11.32-11.32L51.31,200H160a72.08,72.08,0,0,0,72-72A8,8,0,0,0,224,120Z',
    pin: 'M235.32,81.37,174.63,20.69a16,16,0,0,0-22.63,0L98.37,74.49c-10.66-3.34-35-7.37-60.4,13.14a16,16,0,0,0-1.29,23.78L85,159.71,42.34,202.34a8,8,0,0,0,11.32,11.32L96.29,171l48.29,48.29A16,16,0,0,0,155.9,224c.38,0,.75,0,1.13,0a15.93,15.93,0,0,0,11.64-6.33c19.64-26.1,17.75-47.32,13.19-60L235.33,104A16,16,0,0,0,235.32,81.37ZM224,92.69h0l-57.27,57.46a8,8,0,0,0-1.49,9.22c9.46,18.93-1.8,38.59-9.34,48.62L48,100.08c12.08-9.74,23.64-12.31,32.48-12.31A40.13,40.13,0,0,1,96.81,91a8,8,0,0,0,9.25-1.51L163.32,32,224,92.68Z',
    minus: 'M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z',
    plus: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z'
  };

  // ---------- state ----------
  var sessionSpeed = 1, userSetSpeed = false;
  try {
    var ss = parseFloat(sessionStorage.getItem('ar_vc_speed'));
    if (ss >= 0.25 && ss <= 3) { sessionSpeed = ss; userSetSpeed = ss !== 1; }
  } catch (e) {}
  var target = null;          // current HTMLVideoElement
  var videos = [];            // known videos (light DOM + reachable shadow roots)
  var fpsMap = new WeakMap(); // video -> detected fps
  var pointer = { x: -1, y: -1, inside: false };
  var flashUntil = 0, dragging = null, loopOn = false, lastHref = location.href;
  var host, shadow, bar, toastEl, ui = {}, toastTimer = 0;
  var last = {}; // last rendered values (avoid redundant DOM writes)

  var hasChrome = false;
  try { hasChrome = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); } catch (e) {}

  // ---------- helpers ----------
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function durationOf(v) {
    var d = v.duration;
    if (isFinite(d) && d > 0) return d;
    try { if (v.seekable && v.seekable.length) return v.seekable.end(v.seekable.length - 1); } catch (e) {}
    return 0;
  }
  function speedLabel(r) { return LRM + (Math.round(r * 100) / 100) + '×'; }
  function isTyping(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      var t = (el.type || '').toLowerCase();
      return ['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'image', 'color', 'file'].indexOf(t) < 0;
    }
    return false;
  }
  function deepActive() {
    var a = document.activeElement;
    try { while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; } catch (e) {}
    return a;
  }
  function inSkippedRoot(v) {
    var n = v, guard = 0;
    while (n && guard++ < 20) {
      try { if (n.closest && n.closest('#amine-reels-root,#amine-reels-inline,#amine-reels-dock')) return true; } catch (e) {}
      var r = n.getRootNode ? n.getRootNode() : null;
      if (r && r.host) { if (/^amine-reels/.test(r.host.id || '')) return true; n = r.host; } else break;
    }
    return false;
  }
  // The extension's own windows (reel viewer, separate grid) cover the page: no bar, no keys, no room-making.
  function appCovers() {
    var de = document.documentElement;
    return !!de && (de.hasAttribute('data-ar-viewer') || de.hasAttribute('data-ar-grid'));
  }
  // The reel's own box: the topmost ancestor whose rect is the video's rect (caption/author overlays included,
  // Instagram's action-button column and comments column excluded).
  function reelBox(v) {
    var vb = v.getBoundingClientRect(), box = v;
    for (var n = v.parentElement, i = 0; n && n !== document.body && i < 12; n = n.parentElement, i++) {
      var b = n.getBoundingClientRect();
      if (Math.abs(b.left - vb.left) > 1.5 || Math.abs(b.top - vb.top) > 1.5 || Math.abs(b.width - vb.width) > 1.5 || Math.abs(b.height - vb.height) > 1.5) break;
      box = n;
    }
    return box;
  }
  // Really on screen: look at everything stacked at the video centre. Above the video (or its first hit-testable
  // ancestor) there may only be see-through layers (Instagram's click-catchers, captions). An opaque layer, a picture
  // or one of our own windows above it = the video is hidden (closed post window, profile grid, our viewer).
  function opaque(el) {
    var t = el.tagName;
    if (t === 'IMG' || t === 'VIDEO' || t === 'CANVAS' || t === 'IFRAME') return true;
    try {
      var cs = getComputedStyle(el);
      if (/url\(/.test(cs.backgroundImage || '')) return true;      // a picture; gradients are only caption shades
      var m = cs.backgroundColor.match(/[\d.]+/g);
      if (m && m.length >= 3 && (m.length < 4 || +m[3] > 0.5) && +(cs.opacity) > 0.5) return true;
    } catch (e) {}
    return false;
  }
  function reallyVisible(v, r) {
    try {
      var x = clamp(r.left + r.width / 2, 1, window.innerWidth - 2), y = clamp(r.top + r.height / 2, 1, window.innerHeight - 2);
      var box = reelBox(v), own = columnOf(box) || box;            // the reel's own container: its layers are part of the video
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length && i < 40; i++) {
        var el = stack[i];
        if (el === v || el.contains(v)) return true;
        if (own !== v && own.contains(el)) continue;               // the reel's own overlays (play icon, click-catcher, mute, caption)
        if (el.id && /^amine-reels/.test(el.id)) return false;
        if (opaque(el)) return false;
      }
      return false;
    } catch (e) { return true; }
  }
  // grid tiles / hover previews are videos inside a link to a post
  function inPostLink(v) {
    try { return !!(v.closest && v.closest('a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"]')); } catch (e) { return false; }
  }
  function visibleArea(r) {
    var w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    var h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  // ---------- discovery ----------
  var scanTimer = 0, lastDeepScan = 0, DEEP_EVERY = 8000; // walking every element for shadow roots is costly on Instagram
  function collectFrom(root, out, deep) {
    var list = root.querySelectorAll('video');
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    if (!deep) return;
    var all = root.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var sr = all[j].shadowRoot;
      if (sr && all[j].id !== HOST_ID && all[j].id !== SKIP_ROOT_ID) collectFrom(sr, out, true);
    }
  }
  function scan() {
    scanTimer = 0;
    var now = Date.now(), deep = now - lastDeepScan > DEEP_EVERY;
    var out = [];
    try { collectFrom(document, out, deep); } catch (e) {}
    if (deep) lastDeepScan = now;
    else {
      // keep shadow-root videos found by an earlier deep scan if still connected
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        if (v.isConnected && out.indexOf(v) < 0 && v.getRootNode() !== document) out.push(v);
      }
    }
    videos = out;
    pickTarget();
  }
  function scheduleScan(delay) {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, delay == null ? 250 : delay);
  }

  // ---------- target selection ----------
  function score(v) {
    if (!v.isConnected || inSkippedRoot(v) || inPostLink(v)) return null;
    var r = v.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return null;
    var a = visibleArea(r);
    if (a < r.width * r.height * 0.3) return null;       // mostly scrolled away
    try {
      var cs = getComputedStyle(v);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return null;
    } catch (e) {}
    if (!reallyVisible(v, r)) return null;
    var playing = !v.paused && !v.ended && v.readyState > 2;
    return { v: v, area: a, playing: playing };
  }
  function pickTarget() {
    var best = null;
    for (var i = 0; i < videos.length; i++) {
      var s = score(videos[i]);
      if (!s) continue;
      if (!best || (s.playing && !best.playing) || (s.playing === best.playing && s.area > best.area)) best = s;
    }
    // a momentary miss on the current reel is not a reason to drop it: tick() drops it after ~750 ms of misses
    if (!best && target && target.isConnected && !inSkippedRoot(target)) return;
    setTarget(best ? best.v : null);
  }
  var targetEvents = ['play', 'pause', 'playing', 'loadeddata', 'ratechange', 'volumechange', 'emptied'];
  function onTargetEvent(e) {
    if (e.type === 'playing' || e.type === 'loadeddata') applySessionSpeed();
    if (e.type === 'playing') detectFps(target);
    requestTick();
  }
  function setTarget(v) {
    if (v === target) return;
    var prev = target;
    if (target) targetEvents.forEach(function (t) { target.removeEventListener(t, onTargetEvent); });
    undoRoom();                 // never leave Instagram's reel shrunk after the target changes
    target = v;
    last = {};
    lastCheck = Date.now(); targetSince = Date.now();
    // Feed: from one reel straight to the next. Make the new reel's room now, in the same task that undid the old
    // one, so the next frame paints the old reel unscaled, the new one scaled and the bar under it: one step, no blink.
    if (v && prev) { try { ensureRoom(false, true); } catch (e) {} }
    if (bar) {
      if (!(v && underMode())) bar.classList.remove('on');
      last.shown = bar.classList.contains('on');
    }
    if (v) setTimeout(requestTick, ROOM_DELAY + 50); // Instagram's post window animates in: make room once it settled
    if (v) {
      targetEvents.forEach(function (t) { v.addEventListener(t, onTargetEvent, { passive: true }); });
      applySessionSpeed();
      if (loopOn) v.loop = true;
      detectFps(v);
    }
    requestTick();
  }
  function applySessionSpeed() {
    if (!target || !userSetSpeed) return;
    try { if (Math.abs(target.playbackRate - sessionSpeed) > 0.001) target.playbackRate = sessionSpeed; } catch (e) {}
  }

  // ---------- fps via requestVideoFrameCallback ----------
  function snapFps(f) {
    var c = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120], b = c[0];
    for (var i = 1; i < c.length; i++) if (Math.abs(c[i] - f) < Math.abs(b - f)) b = c[i];
    return Math.abs(b - f) < 2 ? b : Math.round(f);
  }
  function detectFps(v) {
    if (!v || !v.requestVideoFrameCallback || v.__arFpsRun) return;
    v.__arFpsRun = true;
    var prev = null, prevFrames = null, minD = Infinity, n = 0;
    function cb(now, meta) {
      if (prev != null && meta.presentedFrames - prevFrames === 1) {
        var d = meta.mediaTime - prev;
        if (d > 0.004 && d < 0.2) { minD = Math.min(minD, d); n++; }
      }
      prev = meta.mediaTime; prevFrames = meta.presentedFrames;
      if (n < 20) { try { v.requestVideoFrameCallback(cb); } catch (e) { v.__arFpsRun = false; } }
      else { v.__arFpsRun = false; if (isFinite(minD)) fpsMap.set(v, snapFps(1 / minD)); }
      if (n >= 6 && isFinite(minD)) fpsMap.set(v, snapFps(1 / minD));
    }
    try { v.requestVideoFrameCallback(cb); } catch (e) { v.__arFpsRun = false; }
  }
  function fpsOf(v) { return fpsMap.get(v) || DEFAULT_FPS; }

  // ---------- actions ----------
  function need() { if (!target || !score(target)) pickTarget(); return target && score(target) ? target : null; }
  function act(fn) { var v = need(); if (!v) return false; try { fn(v); } catch (e) {} flash(); requestTick(); return true; }
  // Instagram re-applies its own mute state when a reel is paused / played from outside its UI.
  // For a short moment after our play/pause, put the sound back exactly as it was.
  var soundGuard = null;
  function guardSound(v) { soundGuard = { v: v, muted: v.muted, volume: v.volume, until: Date.now() + 2500 }; }
  document.addEventListener('volumechange', function (e) {
    var g = soundGuard, v = e.target;
    if (!g || v !== g.v || Date.now() > g.until) return;
    if (v.muted !== g.muted || Math.abs(v.volume - g.volume) > 0.001) {
      try { v.muted = g.muted; v.volume = g.volume; } catch (er) {}
    }
  }, true);
  // ---------- previous / next reel (← / →) ----------
  // Instagram's own controls first (they do exactly what Instagram's ↑/↓ do), found by role/position, not by wording.
  var RX_NEXT = /next|suivant|siguiente|weiter|التالي|التالية/i, RX_PREV = /prev|back|précédent|anterior|zurück|السابق|السابقة|رجوع/i;
  function shown(el) { var r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth; }
  function labelOf(el) {
    var t = el.getAttribute('aria-label') || '';
    var s = el.querySelector('svg[aria-label]'); if (s) t += ' ' + s.getAttribute('aria-label');
    return t;
  }
  function clickable(el) { return el && el.getAttribute('aria-disabled') !== 'true' && !el.disabled; }
  function pickByLabel(list, dir) {
    var rx = dir > 0 ? RX_NEXT : RX_PREV, other = dir > 0 ? RX_PREV : RX_NEXT;
    for (var i = 0; i < list.length; i++) { var l = labelOf(list[i]); if (rx.test(l) && !other.test(l)) return list[i]; }
    return null;
  }
  // Feed (/reels/): a toolbar with an up button above a down button.
  function feedButton(dir) {
    var bars = document.querySelectorAll('[role="toolbar"]');
    for (var i = 0; i < bars.length; i++) {
      if (inSkippedRoot(bars[i])) continue;
      var bs = Array.prototype.filter.call(bars[i].querySelectorAll('[role="button"],button'), function (b) { return b.querySelector('svg') && shown(b); });
      if (!bs.length || bs.length > 2) continue;
      var byLabel = pickByLabel(bs, dir);
      if (byLabel) return byLabel;
      if (bs.length === 2) {
        bs.sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
        if (bs[1].getBoundingClientRect().top - bs[0].getBoundingClientRect().top > 10) return dir > 0 ? bs[1] : bs[0];
      }
    }
    return null;
  }
  // Post window (/reel/x/ opened from a profile): Instagram's arrows at the window's left / right edges.
  function dialogButton(v, dir) {
    var dlg = v.closest && v.closest('[role="dialog"]');
    if (!dlg) return null;
    var scope = dlg.parentElement || dlg;
    var vb = (columnOf(reelBox(v)) || reelBox(v)).getBoundingClientRect(), mid = window.innerHeight / 2;
    var bs = Array.prototype.filter.call(scope.querySelectorAll('button,[role="button"]'), function (b) {
      if (!b.querySelector('svg') || !shown(b) || inSkippedRoot(b)) return false;
      var r = b.getBoundingClientRect();
      return r.width < 80 && r.height < 80 && Math.abs(r.top + r.height / 2 - mid) < window.innerHeight * 0.2 && (r.right <= vb.left + 2 || r.left >= vb.right - 2);
    });
    var byLabel = pickByLabel(bs, dir);
    if (byLabel) return byLabel;
    var rtl = (document.documentElement.dir || getComputedStyle(document.documentElement).direction) === 'rtl';
    var wantRight = (dir > 0) !== rtl;  // LTR: next on the right; RTL: Instagram mirrors it
    var best = null;
    bs.forEach(function (b) {
      var r = b.getBoundingClientRect(), right = r.left > vb.right - 2;
      if (right !== wantRight) return;
      if (!best || (wantRight ? r.left > best.getBoundingClientRect().left : r.left < best.getBoundingClientRect().left)) best = b;
    });
    return best;
  }
  function scrollerOf(el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      try { var cs = getComputedStyle(n); if (/auto|scroll/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n; } catch (e) {}
    }
    return document.scrollingElement || document.documentElement;
  }
  // Fallback: the neighbour reel in the feed (vertical order), or one screen of the snap container.
  function scrollToNeighbour(v, dir) {
    var vt = v.getBoundingClientRect().top, best = null, bestD = Infinity;
    var all = document.querySelectorAll('video');
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === v || inSkippedRoot(o) || inPostLink(o)) continue;
      var r = o.getBoundingClientRect();
      if (r.width < MIN_W || r.height < MIN_H) continue;
      var d = (r.top - vt) * dir;
      if (d > 20 && d < bestD) { bestD = d; best = o; }
    }
    if (best) { reelBox(best).scrollIntoView({ block: 'center' }); return true; }
    var sc = scrollerOf(v);
    if (!sc) return false;
    sc.scrollBy({ top: dir * (sc.clientHeight || window.innerHeight) });
    return true;
  }
  function goReel(v, dir) {
    var b = dialogButton(v, dir) || (!(v.closest && v.closest('[role="dialog"]')) ? feedButton(dir) : null);
    if (b && clickable(b)) { b.click(); return true; }
    if (v.closest && v.closest('[role="dialog"]')) return false; // first / last post in the window: nothing to do
    return scrollToNeighbour(v, dir);
  }

  var A = {
    toggle: function () {
      return act(function (v) {
        guardSound(v);
        if (v.paused || v.ended) { var p = v.play(); if (p && p.catch) p.catch(function () {}); toast(T('vc.t.play')); }
        else { v.pause(); toast(T('vc.t.pause')); }
      });
    },
    seek: function (s) {
      s = Number(s) || 0;
      return act(function (v) {
        var d = durationOf(v);
        v.currentTime = clamp(v.currentTime + s, 0, d || v.currentTime + Math.max(s, 0));
        toast(T('vc.t.sec', { x: ltr((s > 0 ? '+' : '−') + Math.abs(s)) }));
      });
    },
    reel: function (dir) {
      dir = dir === 'prev' || Number(dir) < 0 ? -1 : 1;
      return act(function (v) {
        if (goReel(v, dir)) toast(T(dir > 0 ? 'vc.t.nextReel' : 'vc.t.prevReel'));
      });
    },
    jump: function (ratio) {
      return act(function (v) {
        var d = durationOf(v); if (!d) return;
        v.currentTime = clamp(ratio, 0, 1) * d;
        toast(ltr(Math.round(ratio * 100) + '%'));
      });
    },
    step: function (f) {
      f = Math.round(Number(f) || 1);
      return act(function (v) {
        if (!v.paused) v.pause();
        var fps = fpsOf(v), d = durationOf(v);
        v.currentTime = clamp(v.currentTime + f / fps, 0, d || Infinity);
        toast(T(Math.abs(f) === 1 ? 'vc.t.frame' : 'vc.t.frames', { x: ltr((f > 0 ? '+' : '−') + Math.abs(f)) }));
      });
    },
    speed: function (r) {
      return act(function (v) {
        var cur = v.playbackRate || 1, next;
        if (r === 'up') next = cur + 0.25;
        else if (r === 'down') next = cur - 0.25;
        else if (r === 'reset' || r == null) next = 1;
        else next = Number(r) || 1;
        next = clamp(Math.round(next * 100) / 100, 0.25, 3);
        v.playbackRate = next;
        sessionSpeed = next; userSetSpeed = true;
        try { sessionStorage.setItem('ar_vc_speed', String(next)); } catch (e) {}
        toast(ltr(speedLabel(next)));
      });
    },
    volume: function (val) {
      return act(function (v) {
        var cur = v.muted ? 0 : v.volume, next;
        if (val === 'up' && v.muted && v.volume > 0.001) next = v.volume; // first ↑ on a muted reel just unmutes
        else if (val === 'up') next = cur + 0.1;
        else if (val === 'down') next = cur - 0.1;
        else next = Number(val);
        if (!isFinite(next)) return;
        next = clamp(Math.round(next * 100) / 100, 0, 1);
        soundGuard = null;
        v.volume = next;
        v.muted = next === 0;
        toast(next === 0 ? T('vc.t.muted') : T('vc.t.volume', { x: ltr(Math.round(next * 100) + '%') }));
      });
    },
    mute: function () {
      return act(function (v) {
        soundGuard = null;
        v.muted = !v.muted;
        if (!v.muted && v.volume === 0) v.volume = 0.5;
        toast(v.muted ? T('vc.t.muted') : T('vc.t.volume', { x: ltr(Math.round(v.volume * 100) + '%') }));
      });
    },
    loop: function (on) {
      return act(function (v) {
        loopOn = on == null ? !v.loop : !!on;
        v.loop = loopOn;
        toast(loopOn ? T('vc.t.loopOn') : T('vc.t.loopOff'));
      });
    },
    // The bar under the reel is always visible now, so "pinned" is the default: kept as a harmless no-op
    // (old popups / messages may still send it).
    pin: function () { return true; }
  };

  // ---------- UI ----------
  function IG(name, fallback) { return 'rgb(var(--ig-' + name + ',' + fallback + '))'; }
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:"AR Thmanyah",system-ui,-apple-system,"Segoe UI",sans-serif}',
    // Instagram's own theme variables (comma triplets on :root, inherited into the shadow root): light and dark
    // follow Instagram automatically. The bar has no card of its own: it is the surface it sits on (--ar-surface).
    '.bar{position:fixed;display:none;direction:ltr;pointer-events:auto;background:var(--ar-surface,' + IG('primary-background', '255,255,255') + ');padding:2px 6px 4px;height:48px;color:' + IG('primary-text', '0,0,0') + ';user-select:none;-webkit-user-select:none;touch-action:none}',
    '.bar.on{display:block}',
    '.scrub{position:relative;height:14px;cursor:pointer}',
    '.track{position:absolute;left:0;right:0;top:5px;height:4px;border-radius:999px;background:' + IG('separator', '219,219,219') + ';overflow:hidden}',
    '.buf{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(var(--ig-secondary-text,115,115,115),.35)}',
    '.prog{position:absolute;left:0;top:0;bottom:0;width:0;background:' + BLUE + '}',
    '.knob{position:absolute;top:3px;width:8px;height:8px;margin-left:-4px;border-radius:999px;background:' + BLUE + ';left:0}',
    '.row{display:flex;align-items:center;gap:1px;height:28px;overflow:hidden}',
    '.row>*{flex-shrink:0}',
    'button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:28px;min-width:28px;padding:0 4px;border-radius:8px;color:' + IG('primary-text', '0,0,0') + ';cursor:pointer;font-size:12px;line-height:1;font-weight:500;position:relative}',
    'button:hover{background:' + IG('secondary-button-background', '239,239,239') + '}',
    'button.act,button.act:hover{color:#fff;background:' + BLUE + '}',
    'button svg{width:18px;height:18px;display:block}',
    'button.sm svg{width:14px;height:14px}',
    '.n{position:absolute;font-size:8px;font-weight:700;left:0;right:0;top:10px;text-align:center;pointer-events:none}',
    '.time{font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;padding:0 6px;white-space:nowrap;color:' + IG('secondary-text', '115,115,115') + '}',
    '.sp{flex:1 1 auto;min-width:4px}',
    '.spd{min-width:42px;font-variant-numeric:tabular-nums;font-weight:700}',
    '.vol{position:relative;width:64px;height:28px;cursor:pointer;flex:0 0 auto}',
    '.vol .track{top:12px}',
    '.vol .knob{top:10px}',
    '.sep{width:1px;height:16px;background:' + IG('separator', '219,219,219') + ';margin:0 3px}',
    // progressive hiding, chosen by measuring the row (see fitRow): volume slider, loop, time, frame steps
    '.h1 .vol,.h1 .sep2{display:none}',
    '.h2 .loopb{display:none}',
    '.h4 .time,.h4 .sep1{display:none}',
    '.h5 .fbk,.h5 .ffw{display:none}',
    '.toast{position:fixed;display:none;pointer-events:none;background:' + IG('primary-text', '0,0,0') + ';color:' + IG('primary-background', '255,255,255') + ';border-radius:8px;padding:6px 10px;font-size:13px;font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.toast.on{display:block}'
  ].join('');

  function ensureFontFace() {
    if (!hasChrome) return;
    try {
      if (document.getElementById('amine-vc-font')) return;
      var st = document.createElement('style');
      st.id = 'amine-vc-font';
      st.textContent = '@font-face{font-family:"AR Thmanyah";font-weight:500;font-style:normal;font-display:swap;src:local("Thmanyah Sans Medium"),local("thmanyahsans-Medium")}' +
        '@font-face{font-family:"AR Thmanyah";font-weight:700;font-style:normal;font-display:swap;src:local("Thmanyah Sans Bold"),local("thmanyahsans-Bold")}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }

  // DOM is built with createElement only (no innerHTML): safe on Trusted-Types pages such as YouTube.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, cls, attrs, kids) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (kids) kids.forEach(function (c) { el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function icon(name) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 256 256'); s.setAttribute('fill', 'currentColor'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', P[name]); s.appendChild(p);
    return s;
  }
  function btn(cls, name, title, extra) {
    var kids = [icon(name)];
    if (extra) kids.push(h('span', 'n', null, [extra]));
    return h('button', cls, { title: title, 'aria-label': title, type: 'button' }, kids);
  }
  function slider(cls, title, withBuf) {
    var track = h('div', 'track', null, withBuf ? [h('div', 'buf'), h('div', 'prog')] : [h('div', 'prog')]);
    return h('div', cls, { title: title }, [track, h('div', 'knob')]);
  }
  function buildUI() {
    host = document.createElement('div');
    host.id = HOST_ID;
    var hs = 'all:initial !important;position:fixed !important;left:0 !important;top:0 !important;width:0 !important;height:0 !important;' +
      'z-index:2147483647 !important;pointer-events:none !important;display:block !important;overflow:visible !important;';
    host.setAttribute('style', hs);
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style'); style.textContent = CSS;
    var row = h('div', 'row', null, [
      btn('playb', 'play', ''),
      btn('backb', 'back', '', '5'),
      btn('fwdb', 'fwd', '', '5'),
      btn('fbk sm', 'caretL', ''),
      btn('ffw sm', 'caretR', ''),
      h('span', 'sep sep1'), h('span', 'time', null, ['0:00 / 0:00']),
      h('span', 'sp'),
      h('button', 'spd', { type: 'button' }, ['1×']),
      h('span', 'sep sep2'),
      btn('muteb', 'vol', ''),
      slider('vol', ''),
      btn('loopb sm', 'repeat', '')
    ]);
    shadow.appendChild(style);
    shadow.appendChild(h('div', 'bar', null, [slider('scrub', '', true), row]));
    shadow.appendChild(h('div', 'toast'));
    var q = function (s) { return shadow.querySelector(s); };
    bar = q('.bar'); toastEl = q('.toast');
    ui = {
      play: q('.playb'), back: q('.backb'), fwd: q('.fwdb'), fbk: q('.fbk'), ffw: q('.ffw'),
      time: q('.time'), spd: q('.spd'), mute: q('.muteb'), row: q('.row'),
      loop: q('.loopb'),
      scrub: q('.scrub'), buf: q('.scrub .buf'), prog: q('.scrub .prog'), knob: q('.scrub .knob'),
      vol: q('.vol'), volProg: q('.vol .prog'), volKnob: q('.vol .knob')
    };
    ui.playPath = ui.play.querySelector('path');
    ui.mutePath = ui.mute.querySelector('path');
    paintLabels();
    I.onChange(paintLabels);   // language switched (here or in another tab): tooltips + toast direction, no rebuild

    // Clicks must never reach the page (Instagram click-catchers toggle play/mute on click).
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend', 'wheel', 'keydown']
      .forEach(function (t) {
        bar.addEventListener(t, function (e) { e.stopPropagation(); if (t === 'dblclick') e.preventDefault(); }, t === 'wheel' || t.indexOf('touch') === 0 ? { passive: true } : false);
      });

    var on = function (el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); fn(e); }); };
    on(ui.play, A.toggle);
    // Shift + click: 10 seconds / 10 frames
    on(ui.back, function (e) { A.seek(e.shiftKey ? -10 : -5); });
    on(ui.fwd, function (e) { A.seek(e.shiftKey ? 10 : 5); });
    on(ui.fbk, function (e) { A.step(e.shiftKey ? -10 : -1); });
    on(ui.ffw, function (e) { A.step(e.shiftKey ? 10 : 1); });
    // speed number: click = faster, Shift+click = slower, double-click or right-click = back to 1×
    on(ui.spd, function (e) { A.speed(e.shiftKey ? 'down' : 'up'); });
    ui.spd.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); A.speed('reset'); });
    ui.spd.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); A.speed('reset'); });
    ui.spd.addEventListener('wheel', function (e) { e.preventDefault(); e.stopPropagation(); A.speed(e.deltaY < 0 ? 'up' : 'down'); }, { passive: false });
    on(ui.mute, A.mute);
    on(ui.loop, function () { A.loop(); });

    dragSlider(ui.scrub, function (ratio) {
      if (!target) return;
      var d = durationOf(target); if (!d) return;
      target.currentTime = ratio * d;
    });
    dragSlider(ui.vol, function (ratio) {
      if (!target) return;
      target.volume = clamp(ratio, 0, 1);
      target.muted = ratio <= 0.001;
    });
    mount();
  }
  // tooltips / aria-labels in the current language (the control row itself stays LTR in both languages)
  function paintLabels() {
    var set = function (el, key) { if (!el) return; var t = T(key); el.title = t; if (el.tagName === 'BUTTON') el.setAttribute('aria-label', t); };
    set(ui.play, 'vc.play'); set(ui.back, 'vc.back'); set(ui.fwd, 'vc.fwd'); set(ui.fbk, 'vc.fbk'); set(ui.ffw, 'vc.ffw');
    set(ui.mute, 'vc.mute'); set(ui.vol, 'vc.volume'); set(ui.loop, 'vc.loop'); set(ui.scrub, 'vc.scrub');
    if (ui.spd) { ui.spd.title = T('vc.speedTitle'); ui.spd.setAttribute('aria-label', T('vc.speed')); }
    if (toastEl) toastEl.setAttribute('dir', I.dir());
  }
  function dragSlider(el, apply) {
    var ratioAt = function (e) { var r = el.getBoundingClientRect(); return clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1); };
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      dragging = el;
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
      apply(ratioAt(e)); requestTick();
    });
    el.addEventListener('pointermove', function (e) { if (dragging === el) { apply(ratioAt(e)); requestTick(); } });
    var end = function (e) { if (dragging === el) { dragging = null; try { el.releasePointerCapture(e.pointerId); } catch (x) {} requestTick(); } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  function mount() {
    // In fullscreen only the fullscreen element's subtree is painted: move the host inside it.
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    var parent = fs && fs.tagName !== 'VIDEO' ? fs : document.documentElement;
    if (host.parentNode !== parent) { try { parent.appendChild(host); } catch (e) {} }
  }

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('on');
    placeToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, TOAST_MS);
  }
  function placeToast() {
    if (!toastEl || !toastEl.classList.contains('on')) return;
    var b = last.box;
    if (!b) { toastEl.style.left = '50%'; toastEl.style.top = '20px'; return; }
    var w = toastEl.offsetWidth || 60;
    toastEl.style.left = Math.round(b.left + b.width / 2 - w / 2) + 'px';
    toastEl.style.top = Math.round(Math.max(4, b.top - 38)) + 'px';
  }
  function flash() { flashUntil = Date.now() + FLASH_MS; }

  // ---------- render loop (runs only while the bar is visible) ----------
  var BAR_H = 48, GAP = 8, EDGE = 4;   // even spacing: GAP above and below the bar
  var ticking = false, lastCheck = 0, misses = 0;
  function checkTarget() {
    if (!target) return;
    if (score(target)) { misses = 0; return; }
    if (dragging || pointerOnTarget()) return;
    if (++misses >= 3) { misses = 0; setTarget(null); hideBar(); scheduleScan(0); }
  }
  function pointerOnTarget() {
    if (!target || pointer.x < 0) return false;
    var r = target.getBoundingClientRect(), b = last.box;
    if (r.width > 0 && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom) return true;
    return !!(b && pointer.x >= b.left && pointer.x <= b.left + b.width && pointer.y >= b.top && pointer.y <= b.top + b.height);
  }
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }
  // Always UNDER the reel, exactly as wide as the video and centred on it (never beside it, never over Instagram's UI).
  function barBox(r) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.max(r.left, 0), right = Math.min(r.right, vw);
    var w = Math.max(0, right - left);
    var top = r.bottom + GAP;
    var limit = vh, col = room && room.v === target ? room.col : null;   // bottom of the reel's column, measured live
    if (col) { var cb = col.getBoundingClientRect(); if (cb.height > 0) limit = Math.min(vh, cb.bottom); }
    if (top + BAR_H > limit - GAP) top = Math.max(r.top, limit - GAP - BAR_H); // no room could be made
    if (top < EDGE) top = EDGE;
    return { left: Math.round(left), top: Math.round(top), width: Math.round(w), height: BAR_H };
  }
  // The bar has its own strip under the reel (room made, or the reel already leaves it): no hover needed.
  function underMode() { return !!(target && room && room.v === target && !room.fallback); }
  function shouldShow(r) {
    if (!target || !r) return false;
    if (visibleArea(r) <= 0) return false;
    // the extension's own reel window / separate grid is open: it has its own controls, never show this bar over it
    if (appCovers()) return false;
    if (underMode()) return true;      // under the reel: visible for as long as the reel is the target and on screen
    // fallback (no room could be made, fullscreen): the bar overlaps the video, so it shows on hover only
    if (dragging) return true;
    if (!room && Date.now() - targetSince < ROOM_DELAY + 100) return false; // room not decided yet: don't flash it over the video
    if (Date.now() < flashUntil) return true;
    if (pointer.x < 0) return false;
    var inV = pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom + GAP;
    var b = last.box;
    var inB = b && pointer.x >= b.left && pointer.x <= b.left + b.width && pointer.y >= b.top && pointer.y <= b.top + b.height;
    return inV || !!inB;
  }

  // ---------- room under the reel ----------
  // When the reel reaches the bottom of the screen (reels feed, post window), shrink the reel's OWN box with CSS
  // `scale` (origin top centre) just enough to free a strip for the bar under it, inside the video's column.
  // Applied once per target (not on hover); undone when the target changes, the page navigates or our window opens.
  var room = null; // {v, el, s, col, prevScale, prevOrigin, painted:[{el,v,p}]} or {v, none:true, col, fallback?}
  var targetSince = 0, ROOM_DELAY = 350;
  function undoRoom() {
    var r0 = room; room = null;
    if (!r0 || r0.none) return;
    try {
      (r0.painted || []).forEach(function (x) {
        if (x.v) x.el.style.setProperty('background-color', x.v, x.p); else x.el.style.removeProperty('background-color');
      });
      if (r0.el) {
        if (r0.prevScale.v) r0.el.style.setProperty('scale', r0.prevScale.v, r0.prevScale.p); else r0.el.style.removeProperty('scale');
        if (r0.prevOrigin.v) r0.el.style.setProperty('transform-origin', r0.prevOrigin.v, r0.prevOrigin.p); else r0.el.style.removeProperty('transform-origin');
      }
    } catch (e) {}
  }
  // Pure geometry (unit-tested): the reel box (top, height) must leave GAP + bar + GAP under it, inside its column.
  // Returns {s:1} when it already fits, {s} for the scale, or null when it would shrink too much.
  function roomGeometry(boxTop, boxH, limitBottom) {
    var need = boxTop + boxH + GAP + BAR_H + GAP - limitBottom;
    if (need <= 0) return { s: 1 };
    var s = Math.floor(((limitBottom - GAP - BAR_H - GAP - boxTop) / boxH) * 1000) / 1000;
    return s >= 0.55 && s < 1 ? { s: s } : null;
  }
  function rgbOf(c) { var m = c && c.match(/[\d.]+/g); return m && m.length >= 3 ? { r: +m[0], g: +m[1], b: +m[2], a: m.length >= 4 ? +m[3] : 1 } : null; }
  function bgOf(el) { try { var c = rgbOf(getComputedStyle(el).backgroundColor); return c && c.a > 0.5 ? c : null; } catch (e) { return null; } }
  // the reel's column: first ancestor of the reel box that is bigger than it (Instagram's black video column)
  function columnOf(box) {
    var bb = box.getBoundingClientRect();
    for (var n = box.parentElement, i = 0; n && n !== document.body && i < 8; n = n.parentElement, i++) {
      var b = n.getBoundingClientRect();
      if (b.height > bb.height + 1 || b.width > bb.width + 1) return n;
    }
    return null;
  }
  // the colour of the window around the reel: nearest opaque, not-black ancestor above the column
  function surroundColour(col) {
    for (var n = col && col.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var c = bgOf(n);
      if (c && c.r + c.g + c.b > 24) return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      if (c) break;
    }
    try {
      var de = getComputedStyle(document.documentElement), dark = document.documentElement.classList.contains('__fb-dark-mode');
      var v = (de.getPropertyValue(dark ? '--ig-elevated-background' : '--ig-primary-background') || '').trim();
      if (v) return 'rgb(' + v + ')';
    } catch (e) {}
    return null;
  }
  function planRoom(v) {
    // measured on Instagram's own (unscaled) layout
    var vh = window.innerHeight, r = v.getBoundingClientRect();
    var box = reelBox(v), bb = box.getBoundingClientRect();
    var col = columnOf(box), cb = col ? col.getBoundingClientRect() : null;
    if (bb.height < 50) return { none: true, col: col };
    var g, onScreen = r.top >= -2 && r.bottom <= vh + 40;
    if (onScreen) g = roomGeometry(bb.top, bb.height, Math.min(vh, cb ? cb.bottom : vh));
    // still scrolling into place (reels feed): a column that fits the screen gives the same answer measured inside it
    else if (cb && cb.height <= vh) g = roomGeometry(bb.top - cb.top, bb.height, cb.height);
    else return null;                                             // can't tell yet: decide later
    if (!g) return { none: true, col: col, fallback: true };      // would shrink too much: the bar overlaps (hover only)
    if (g.s === 1) return { none: true, col: col };               // already leaves the strip under it
    return { el: box, s: g.s, col: col };
  }
  // now = skip the settle delay (feed: the next reel's layout is already settled)
  function ensureRoom(force, now) {
    var v = target;
    if (!v || appCovers() || document.fullscreenElement || document.webkitFullscreenElement) { undoRoom(); return; }
    if (room && room.v === v && !force) return;
    if (!room && !now && Date.now() - targetSince < ROOM_DELAY) return;   // measure a settled layout, once
    var had = room && room.v === v ? room : null;
    var keep = had && !had.none ? { el: had.el, s: had.s, col: had.col } : null;
    undoRoom();                                   // same task: measure the original layout, nothing is painted in between
    var plan = planRoom(v);
    if (!plan) {                                                  // can't measure now: keep what we had for this target
      if (had && had.none) { room = had; return; }
      if (keep) plan = keep; else return;
    }
    if (plan.none) { room = { v: v, none: true, col: plan.col, fallback: !!plan.fallback, surface: plan.col ? surroundColour(plan.col) : null }; return; }
    var st = plan.el.style;
    room = { v: v, el: plan.el, s: plan.s, col: plan.col, painted: [],
      prevScale: { v: st.getPropertyValue('scale'), p: st.getPropertyPriority('scale') },
      prevOrigin: { v: st.getPropertyValue('transform-origin'), p: st.getPropertyPriority('transform-origin') } };
    // the freed strip shows the column's own (black) background: paint the column like the window around it
    var colour = plan.col ? surroundColour(plan.col) : null;
    room.surface = colour;
    if (colour) {
      for (var n = plan.el.parentElement; n; n = n.parentElement) {
        var c = bgOf(n);
        if (c && c.r + c.g + c.b <= 24) {
          room.painted.push({ el: n, v: n.style.getPropertyValue('background-color'), p: n.style.getPropertyPriority('background-color') });
          n.style.setProperty('background-color', colour, 'important');
        }
        if (n === plan.col) break;
      }
    }
    st.setProperty('transform-origin', 'top center', 'important');
    st.setProperty('scale', String(plan.s), 'important');
    last.box = null;
  }

  // measure which items fit (progressive hiding by the row's real width, only when the width changes)
  var HIDE = ['', 'h1', 'h1 h2', 'h1 h2 h3', 'h1 h2 h3 h4', 'h1 h2 h3 h4 h5'];
  function fitRow() {
    for (var i = 0; i < HIDE.length; i++) {
      bar.className = 'bar on ' + HIDE[i];
      if (ui.row.scrollWidth <= ui.row.clientWidth + 1) return HIDE[i];
    }
    return HIDE[HIDE.length - 1];
  }
  function hideBar() { if (last.shown) { bar.classList.remove('on'); last.shown = false; } }
  function onNavigate() {
    var from = lastHref;
    lastHref = location.href;
    // Reels feed: Instagram rewrites the URL (/reels/<id>/) for every reel while scrolling. Same page: keep the bar
    // on the current reel; pickTarget() moves it to the next one in one step (no hide in between).
    var feed = /^https?:\/\/[^/]+\/reels\//;
    if (feed.test(from) && feed.test(lastHref) && target && target.isConnected) { scheduleScan(0); return; }
    setTarget(null);           // the old reel is gone: hide now, undo any scale, look again shortly
    hideBar();
    scheduleScan(300);
  }
  function tick() {
    ticking = false;
    if (!bar) return;
    if (location.href !== lastHref) onNavigate();
    if (target && !target.isConnected) { setTarget(null); scheduleScan(0); }
    // re-check the target is still really visible (closed post window, covered by the page, tiny preview)
    var now = Date.now();
    // hide only after ~750 ms of "not visible" in a row, and never while the pointer is on the video / bar or while scrubbing
    if (target && now - lastCheck > 250) { lastCheck = now; checkTarget(); }
    try { ensureRoom(false); } catch (e) {}
    var r = target ? target.getBoundingClientRect() : null;
    var show = shouldShow(r);
    if (!show) { hideBar(); return; } // loop stops; restarted by pointer/scroll/key/media events
    if (host.parentNode == null) mount();
    if (!last.shown) { bar.classList.add('on'); last.shown = true; }
    // In Instagram's post window: the window's own colour. On the page (reels feed, reel page): no background at all,
    // so the bar sits on Instagram's page exactly like Instagram's own white (light) / black (dark), never a box.
    var inDlg = !!(target && target.closest && target.closest('[role="dialog"]'));
    var surf = underMode() ? (inDlg ? (room.surface || '') : 'transparent') : '';
    if (surf !== last.surf) { if (surf) bar.style.setProperty('--ar-surface', surf); else bar.style.removeProperty('--ar-surface'); last.surf = surf; }
    var b = barBox(r);
    var pb = last.box;
    if (!pb || pb.left !== b.left || pb.top !== b.top || pb.width !== b.width) {
      bar.style.left = b.left + 'px'; bar.style.top = b.top + 'px'; bar.style.width = b.width + 'px';
      if (!pb || pb.width !== b.width || last.cls == null) last.cls = fitRow();
      else bar.className = 'bar on ' + last.cls;
      last.box = b;
      placeToast();
    }
    render(target);
    requestTick();
  }
  function render(v) {
    var d = durationOf(v), t = v.currentTime || 0, ratio = d ? clamp(t / d, 0, 1) : 0;
    var pct = (ratio * 100).toFixed(2) + '%';
    if (pct !== last.pct) { ui.prog.style.width = pct; ui.knob.style.left = pct; last.pct = pct; }
    var bufEnd = 0;
    try { for (var i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 0.5) bufEnd = Math.max(bufEnd, v.buffered.end(i)); } catch (e) {}
    var bp = (d ? clamp(bufEnd / d, 0, 1) * 100 : 0).toFixed(1) + '%';
    if (bp !== last.bp) { ui.buf.style.width = bp; last.bp = bp; }
    var ts = fmt(t) + ' / ' + fmt(d);
    if (ts !== last.ts) { ui.time.textContent = ts; last.ts = ts; }
    var paused = v.paused || v.ended;
    if (paused !== last.paused) { ui.playPath.setAttribute('d', paused ? P.play : P.pause); last.paused = paused; }
    var rate = v.playbackRate || 1;
    if (rate !== last.rate) {
      ui.spd.textContent = speedLabel(rate);
      ui.spd.classList.toggle('act', Math.abs(rate - 1) > 0.001);
      last.rate = rate;
    }
    var vol = v.muted ? 0 : v.volume, vp = (vol * 100).toFixed(0) + '%';
    if (vp !== last.vp) { ui.volProg.style.width = vp; ui.volKnob.style.left = vp; last.vp = vp; }
    var muted = v.muted || v.volume === 0;
    if (muted !== last.muted) { ui.mutePath.setAttribute('d', muted ? P.mute : P.vol); last.muted = muted; }
    if (v.loop !== last.loop) { ui.loop.classList.toggle('act', v.loop); last.loop = v.loop; }
  }

  // ---------- keyboard ----------
  function onKey(e) {
    try {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (appCovers()) return; // our viewer / separate grid handles its own keys
      if (isTyping(deepActive()) || isTyping(e.composedPath ? e.composedPath()[0] : e.target)) return;
      var k = e.key, kl = k && k.length === 1 ? k.toLowerCase() : k;
      // Shift+, and Shift+. type < and >: read the physical key
      if (e.code === 'Comma') kl = ','; else if (e.code === 'Period') kl = '.';
      var big = e.shiftKey; // Shift = 10 seconds / 10 frames
      var fn = null;
      switch (kl) {
        case ' ': case 'Spacebar':
          var el = e.composedPath ? e.composedPath()[0] : e.target;
          var tag = el && el.tagName ? el.tagName.toLowerCase() : '';
          if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'summary') return; // let focused controls work
          fn = A.toggle; break;
        case 'k': fn = A.toggle; break;
        case 'j': fn = function () { A.seek(big ? -10 : -5); }; break;
        case 'l': fn = function () { A.seek(big ? 10 : 5); }; break;
        // ← / → : previous / next reel; with Shift: seek SEEK_SHIFT_ARROW seconds
        case 'ArrowLeft': fn = big ? function () { A.seek(-SEEK_SHIFT_ARROW); } : function () { A.reel(-1); }; break;
        case 'ArrowRight': fn = big ? function () { A.seek(SEEK_SHIFT_ARROW); } : function () { A.reel(1); }; break;
        case ',': fn = function () { A.step(big ? -10 : -1); }; break;
        case '.': fn = function () { A.step(big ? 10 : 1); }; break;
        case '[': fn = function () { A.speed('down'); }; break;
        case ']': fn = function () { A.speed('up'); }; break;
        case '\\': fn = function () { A.speed('reset'); }; break;
        case 'm': fn = A.mute; break;
        // ↑ = one frame forward, ↓ = one frame back (Shift: 10). Captured, so Instagram's own ↑/↓ reel switch doesn't fire.
        case 'ArrowUp': fn = function () { A.step(big ? 10 : 1); }; break;
        case 'ArrowDown': fn = function () { A.step(big ? -10 : -1); }; break;
        default:
          if (k && k.length === 1 && k >= '0' && k <= '9') { var n = +k; fn = function () { A.jump(n / 10); }; }
      }
      if (!fn) return;
      if (!need()) return;     // a fresh look: no visible reel → the page keeps its keys (scrolling etc.)
      if (e.repeat && (kl === ' ' || kl === 'k' || kl === 'm' || ((kl === 'ArrowLeft' || kl === 'ArrowRight') && !big))) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      fn();
    } catch (err) {}
  }
  // Swallow the matching keyup/keypress too, so sites that act on keyup (YouTube) don't double-act.
  var swallowNext = {};
  function onKeyGuard(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (swallowNext[e.code]) {
      if (e.type === 'keyup') delete swallowNext[e.code];
      e.stopImmediatePropagation();
    }
  }

  // ---------- global listeners ----------
  function onPointer(e) { pointer.x = e.clientX; pointer.y = e.clientY; requestTick(); }
  // Target re-evaluation is throttled with a timer (not rAF) so it also runs in background tabs/frames.
  function onScrollish() {
    requestTick(); // keeps the visible bar glued to the video during scroll
    if (!scrollQueued) { scrollQueued = true; setTimeout(function () { scrollQueued = false; pickTarget(); requestTick(); }, 80); }
  }
  var scrollQueued = false;

  function init() {
    if (!document.documentElement) return;
    ensureFontFace();
    buildUI();
    window.addEventListener('keydown', function (e) {
      var before = e.defaultPrevented;
      onKey(e);
      if (!before && e.defaultPrevented && e.code) swallowNext[e.code] = true;
    }, true);
    window.addEventListener('keyup', onKeyGuard, true);
    window.addEventListener('keypress', onKeyGuard, true);
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    window.addEventListener('mousemove', onPointer, { capture: true, passive: true });
    document.addEventListener('mouseleave', function () { pointer.x = pointer.y = -1; requestTick(); }, { passive: true });
    window.addEventListener('blur', function () { pointer.x = pointer.y = -1; requestTick(); }, { passive: true });
    window.addEventListener('scroll', onScrollish, { capture: true, passive: true });
    window.addEventListener('resize', function () { try { ensureRoom(true); } catch (e) {} onScrollish(); }, { passive: true });
    window.addEventListener('popstate', function () { setTimeout(function () { if (location.href !== lastHref) { onNavigate(); requestTick(); } }, 0); });
    ['play', 'playing', 'pause', 'loadedmetadata'].forEach(function (t) {
      document.addEventListener(t, function (e) { if (e.target && e.target.tagName === 'VIDEO') { if (videos.indexOf(e.target) < 0) videos.push(e.target); onScrollish(); } }, { capture: true, passive: true });
    });
    document.addEventListener('fullscreenchange', function () { mount(); last.box = null; requestTick(); });
    document.addEventListener('webkitfullscreenchange', function () { mount(); last.box = null; requestTick(); });
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.addedNodes.length || m.removedNodes.length) { scheduleScan(); break; }
        }
        if (host && !host.isConnected) mount();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    // SPA navigation (history API) + slow safety re-check (cheap; skipped while tab hidden)
    setInterval(function () {
      if (document.hidden) return;
      if (location.href !== lastHref) onNavigate();
      scan();
      checkTarget();                                        // misses add up here too while the bar is hidden (tick idle)
      try { ensureRoom(true); } catch (e) {}   // Instagram's post window animates in: measure again once it settled
      requestTick();                           // the bar under the reel shows as soon as its room is decided
    }, 1500);
    scan();
  }

  // ---------- public API ----------
  window.AmineVC = {
    target: function () { return need(); },
    toggle: A.toggle,
    seek: A.seek,
    step: A.step,
    speed: A.speed,
    volume: A.volume,
    mute: A.mute,
    loop: A.loop,
    pin: A.pin,
    jump: A.jump,
    reel: A.reel,
    fps: function () { var v = need(); return v ? fpsOf(v) : null; },
    refresh: function () { scan(); return target; }
  };

  if (hasChrome) {
    try {
      chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg || msg.type !== 'AR_VC') return;
        var a = msg.action, v = msg.value, fn = A[a];
        if (!fn) return;
        if (a !== 'pin' && !need()) return; // another frame (the one with the video) will answer
        var ok = fn(v);
        try { sendResponse({ ok: !!ok, speed: target ? target.playbackRate : null, pinned: true }); } catch (e) {}
      });
    } catch (e) {}
  }

  try {
    // build once the stored language is known (tooltips are right from the first paint)
    var start = function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init(); };
    Promise.resolve(I.ready).then(start, start);
  } catch (e) {}
})();
