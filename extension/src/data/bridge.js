/* Reels Analysis — data bridge (isolated world). Relays ARData.call() to the MAIN-world ig.js / yt.js
 * via window.postMessage, and serves chrome.runtime messages {type:'AR_DATA', fn, args} from popup/library.
 */
(function () {
  'use strict';
  if (window.ARData) return;

  const TIMEOUT = 30000;
  const pending = new Map();
  const listeners = { navigate: [] };
  let seq = 0;
  const host = location.hostname;
  const platform = /(^|\.)instagram\.com$/.test(host) ? 'instagram' : /(^|\.)youtube\.com$/.test(host) ? 'youtube' : null;

  // messages in the user's language: through ARI18N (lib/i18n.js loads before this file on Instagram), local fallback otherwise
  const MSG = {
    ar: { 'b.notIg': 'هذه الصفحة ليست إنستغرام أو يوتيوب.', 'b.timeout': 'انتهت المهلة ({s} ثانية) دون رد. حدّث الصفحة ثم أعد المحاولة.' },
    en: { 'b.notIg': 'This page is not Instagram or YouTube.', 'b.timeout': 'No reply within {s} seconds. Reload the page and try again.' }
  };
  if (window.ARI18N) window.ARI18N.add(MSG);
  function tr(key, vars) {
    if (window.ARI18N) return window.ARI18N.t(key, vars);
    return String(MSG.ar[key] || key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.__ar === 'res') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.ok) p.resolve(d.result); else p.reject(new Error(d.error || 'Unknown error'));
    } else if (d.__ar === 'evt' && d.event === 'progress') {
      try { chrome.runtime.sendMessage({ type: 'AR_PROGRESS', data: d.data }).catch(() => {}); } catch (e) { }
    } else if (d.__ar === 'evt' && d.event === 'navigate') {
      fireNavigate(d.data && d.data.url);
    }
  });

  function call(fn, ...args) {
    if (!platform) {
      if (fn === 'pageInfo') return Promise.resolve({ platform: null, kind: 'other', url: location.href });
      return Promise.reject(new Error(tr('b.notIg')));
    }
    return new Promise((resolve, reject) => {
      const id = 'ar' + Date.now().toString(36) + '_' + (++seq);
      // fetching many reels pages through slowly on purpose: give it up to 4 minutes
      const ms = fn === 'getProfileReels' ? 240000 : TIMEOUT;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(tr('b.timeout', { s: Math.round(ms / 1000) })));
      }, ms);
      pending.set(id, { resolve, reject, timer });
      window.postMessage({ __ar: 'req', id, fn, args }, '*');
    });
  }

  // navigate: from MAIN-world history hooks, plus a light URL poll as a safety net
  let lastUrl = location.href;
  let navTimer = null;
  function fireNavigate(url) {
    url = url || location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    clearTimeout(navTimer);
    navTimer = setTimeout(async () => {
      let kind = 'other';
      try { kind = (await call('pageInfo')).kind; } catch (e) { }
      for (const cb of listeners.navigate.slice()) { try { cb({ url, kind }); } catch (e) { console.error('[Reels Analysis]', e); } }
    }, 150);
  }
  setInterval(() => { if (location.href !== lastUrl) fireNavigate(location.href); }, 700);

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    return () => { const a = listeners[event]; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); };
  }

  window.ARData = { call, on, platform };

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== 'AR_DATA' || typeof msg.fn !== 'string') return;
      call(msg.fn, ...(Array.isArray(msg.args) ? msg.args : []))
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => sendResponse({ ok: false, error: (e && e.message) || String(e) }));
      return true;
    });
  } catch (e) { /* not in an extension context */ }
})();
