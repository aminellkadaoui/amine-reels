/* Reels Analysis — Instagram data layer (MAIN world, document_start).
 * Read-only. Sources, in order:
 *   1. passive cache: JSON the page itself already loaded (SSR <script type="application/json"> + fetch/XHR responses)
 *   2. same-origin reads the logged-in page itself does (web_profile_info, clips/user, media/info, feed/user)
 *   3. logged-out fallback: same-origin GET of the public page HTML and parse its SSR JSON
 * Answers window.postMessage {__ar:'req', id, fn, args} only on instagram.com, only from event.source === window.
 */
(function () {
  'use strict';
  if (!/(^|\.)instagram\.com$/.test(location.hostname)) return;
  if (window.__arIG) return;
  window.__arIG = true;

  const APP_ID = '936619743392459';
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const RESERVED = new Set(['reel', 'reels', 'p', 'tv', 'explore', 'stories', 'direct', 'accounts', 'about', 'developer', 'legal', 'web', 'api', 'graphql', 'ajax', 'challenge', 'emails', 'session', 'login', 'privacy', 'terms', 'directory', 'static', 'oauth', 'nametag', 'lite', 'your_activity', 'topics']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const media = new Map();   // code -> normalized Reel (merged)
  const users = new Map();   // lower username -> Profile (+ id)
  const subtitleUrls = new Map(); // code -> [url]

  /* ---------------- helpers ---------------- */
  function codeToPk(code) {
    code = String(code).slice(0, 11);
    let n = 0n;
    for (const ch of code) {
      const i = ALPHA.indexOf(ch);
      if (i < 0) return null;
      n = n * 64n + BigInt(i);
    }
    return n.toString();
  }
  function parseCode(x) {
    if (!x) return null;
    const s = String(x).trim();
    const m = s.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{5,}$/.test(s)) return s;
    return null;
  }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  function first(...vals) { for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; return undefined; }
  function dashDuration(xml) {
    const m = typeof xml === 'string' && xml.match(/mediaPresentationDuration="PT(?:(\d+)H)?(?:(\d+)M)?([\d.]+)S"/);
    if (!m) return undefined;
    return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + parseFloat(m[3]);
  }
  function csrf() { const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function headers(extra) {
    let claim = '0';
    try { claim = sessionStorage.getItem('www-claim-v2') || '0'; } catch (e) { }
    return Object.assign({ 'X-IG-App-ID': APP_ID, 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest', 'X-ASBD-ID': '359341', 'X-IG-WWW-Claim': claim, 'Accept': '*/*' }, extra || {});
  }
  function err(msg) { return new Error(msg); }
  const E_LOGIN = 'إنستغرام لم يُرجع البيانات. تأكّد أنك مسجّل الدخول في إنستغرام بهذا المتصفح ثم أعد المحاولة.';
  const E_RATE = 'إنستغرام أوقف الطلبات مؤقتًا (كثرة طلبات). انتظر بضع دقائق ثم أعد المحاولة.';

  const diag = [];   // what each request returned, shown to the user when results are partial
  function logReq(path, what) { diag.push(path.replace(/\?.*$/, '').replace(/\/\d{6,}\//, '/{id}/') + ' → ' + what); if (diag.length > 12) diag.shift(); }
  async function igJSON(url, opts) {
    try { return await igJSON0(url, opts); }
    catch (e) { logReq(url, e.message.slice(0, 80)); throw e; }
  }
  async function igJSON0(url, opts) {
    let res;
    try {
      res = await _fetch(url, Object.assign({ credentials: 'include', headers: headers() }, opts || {}));
    } catch (e) { throw err('تعذّر الاتصال بإنستغرام. تحقّق من الإنترنت ثم أعد المحاولة.'); }
    logReq(url, String(res.status));
    if (res.status === 429) throw err(E_RATE);
    const text = await res.text();
    if (/^\s*</.test(text)) throw err(res.status === 404 ? E_LOGIN : 'إنستغرام أعاد صفحة بدل البيانات (' + res.status + ').');
    let j;
    try { j = JSON.parse(text.replace(/^for \(;;\);/, '')); } catch (e) { throw err('ردّ غير مفهوم من إنستغرام (' + res.status + ').'); }
    if (j && (j.message === 'Please wait a few minutes before you try again.' || j.spam)) throw err(E_RATE);
    if (j && (j.require_login || j.message === 'login_required' || res.status === 401 || res.status === 403)) throw err(E_LOGIN);
    if (!res.ok) throw err('خطأ من إنستغرام (' + res.status + ').');
    ingest(j);
    return j;
  }

  /* ---------------- normalization ---------------- */
  function looksLikeMedia(o) {
    const code = o.code || o.shortcode;
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{5,}$/.test(code)) return false;
    return ('like_count' in o) || ('play_count' in o) || ('taken_at' in o) || ('taken_at_timestamp' in o) || ('video_view_count' in o) ||
      ('edge_media_preview_like' in o) || ('display_uri' in o) || ('image_versions2' in o) || ('video_versions' in o) || ('media_type' in o);
  }
  function normMedia(o) {
    const code = o.code || o.shortcode;
    const u = o.user || o.owner || {};
    const capText = (o.caption && typeof o.caption === 'object') ? o.caption.text
      : typeof o.caption === 'string' ? o.caption
      : (o.edge_media_to_caption && o.edge_media_to_caption.edges && o.edge_media_to_caption.edges[0] && o.edge_media_to_caption.edges[0].node.text);
    const hidden = o.like_and_view_counts_disabled === true;
    // take the largest real count: feed objects often carry play_count 0 / null next to a real ig_play_count
    const vc = [o.play_count, o.ig_play_count, o.video_play_count, o.view_count, o.video_view_count, o.clips_metadata && o.clips_metadata.play_count].map(num).filter(v => v !== undefined);
    const views = vc.length ? Math.max(...vc) : undefined;
    // 0 views next to real likes means Instagram hid the count here, not a real zero
    const viewsShown = (views === 0 && num(o.like_count) > 0) ? undefined : views;
    const likes = first(num(o.like_count), o.edge_media_preview_like && num(o.edge_media_preview_like.count), o.edge_liked_by && num(o.edge_liked_by.count));
    const comments = first(num(o.comment_count), o.edge_media_to_comment && num(o.edge_media_to_comment.count), o.edge_media_preview_comment && num(o.edge_media_preview_comment.count));
    const cands = o.image_versions2 && o.image_versions2.candidates;
    const isClip = o.product_type === 'clips' || o.media_type === 2 || o.is_video === true;
    const r = {
      platform: 'instagram',
      id: o.pk ? String(o.pk) : (o.id && /^\d+(_\d+)?$/.test(String(o.id)) ? String(o.id).split('_')[0] : undefined),
      code,
      url: 'https://www.instagram.com/' + (o.product_type === 'clips' || o.product_type === undefined && isClip ? 'reel' : 'p') + '/' + code + '/',
      username: u.username,
      fullName: u.full_name,
      caption: capText,
      views: (viewsShown === 0 && likes > 0) ? undefined : viewsShown,
      likes: hidden ? -1 : likes,
      comments: comments,
      takenAt: first(num(o.taken_at), num(o.taken_at_timestamp)),
      duration: first(num(o.video_duration), dashDuration(o.video_dash_manifest)),
      thumb: first(cands && cands[0] && cands[0].url, o.display_uri, o.display_url, o.thumbnail_src),
      videoUrl: first(o.video_versions && o.video_versions[0] && o.video_versions[0].url, o.video_url),
      _userId: u.pk ? String(u.pk) : (u.id && /^\d+$/.test(String(u.id)) ? String(u.id) : undefined),
      _isVideo: isClip || !!o.video_versions || o.has_audio === true,
      _hidden: hidden,
    };
    return r;
  }
  function mergeMedia(r) {
    const prev = media.get(r.code) || {};
    const out = Object.assign({}, prev);
    for (const k in r) if (r[k] !== undefined && r[k] !== null && r[k] !== '') out[k] = r[k];
    // a later object with views 0 must not erase a real count
    if (prev.views > 0 && !(r.views > 0)) out.views = prev.views;
    media.set(r.code, out);
    return out;
  }
  function findSubtitleUrls(o, code) {
    // any string URL under a key that smells like subtitles / transcript / vtt
    const found = [];
    (function walk(x, depth) {
      if (!x || typeof x !== 'object' || depth > 6) return;
      for (const k in x) {
        const v = x[k];
        if (typeof v === 'string' && /subtit|vtt|transcri|closed_?caption|caption_?ur[il]/i.test(k) && /^https?:\/\//.test(v)) found.push(v);
        else if (v && typeof v === 'object' && k !== 'user' && k !== 'owner') walk(v, depth + 1);
      }
    })(o, 0);
    // DASH manifest text track
    if (typeof o.video_dash_manifest === 'string' && /contentType="text"|mimeType="text\/vtt"/.test(o.video_dash_manifest)) {
      const m = o.video_dash_manifest.match(/<AdaptationSet[^>]*(?:contentType="text"|mimeType="text\/vtt")[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/);
      if (m) found.push(m[1].replace(/&amp;/g, '&'));
    }
    if (found.length) subtitleUrls.set(code, Array.from(new Set((subtitleUrls.get(code) || []).concat(found))));
  }
  function ingestUser(o) {
    if (typeof o.username !== 'string') return;
    const followers = first(num(o.follower_count), o.edge_followed_by && num(o.edge_followed_by.count));
    const id = o.pk ? String(o.pk) : (o.id && /^\d+$/.test(String(o.id)) && String(o.id).length < 17 ? String(o.id) : undefined);
    if (followers === undefined && !id) return;
    const key = o.username.toLowerCase();
    const prev = users.get(key) || { platform: 'instagram', username: o.username };
    const next = Object.assign({}, prev);
    if (o.full_name !== undefined) next.fullName = o.full_name;
    if (followers !== undefined) next.followers = followers;
    const pic = first(o.hd_profile_pic_url_info && o.hd_profile_pic_url_info.url, o.profile_pic_url_hd, o.profile_pic_url);
    if (pic) next.pic = pic;
    if (id) next.id = id;
    users.set(key, next);
  }
  function ingest(root) {
    const seen = new Set();
    (function walk(o, depth) {
      if (!o || typeof o !== 'object' || depth > 80 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      if (looksLikeMedia(o)) {
        try { const r = mergeMedia(normMedia(o)); findSubtitleUrls(o, r.code); } catch (e) { /* ignore one bad node */ }
      }
      if (typeof o.username === 'string') ingestUser(o);
      // user objects that carry pk + polaris_clips_connection but no username: link by id later
      for (const k in o) {
        const v = o[k];
        if (v && typeof v === 'object') walk(v, depth + 1);
      }
    })(root, 0);
    // fill usernames on media from user id map
    for (const r of media.values()) {
      if (!r.username && r._userId) {
        for (const u of users.values()) if (u.id === r._userId) { r.username = u.username; r.fullName = r.fullName || u.fullName; break; }
      }
    }
  }
  function ingestText(text) {
    if (!text || text.length < 20) return;
    const t = text.replace(/^for \(;;\);/, '');
    if (!/"(code|shortcode|username)"/.test(t)) return;
    // graphql responses can be several JSON objects separated by newlines (streamed)
    const parts = /^\s*[\[{]/.test(t) ? [t] : [];
    for (const p of parts) {
      try { ingest(JSON.parse(p)); }
      catch (e) { for (const line of p.split('\n')) { try { if (line.trim()) ingest(JSON.parse(line)); } catch (e2) { /* skip */ } } }
    }
  }
  function scanDocument(doc) {
    const scripts = (doc || document).querySelectorAll('script[type="application/json"]');
    for (const s of scripts) {
      const t = s.textContent;
      if (t && /"(code|username)"/.test(t)) { try { ingest(JSON.parse(t)); } catch (e) { /* skip */ } }
    }
  }

  /* ---------------- passive capture (patch fetch / XHR) ---------------- */
  const _fetch = window.fetch.bind(window);
  const isApi = (u) => /\/(api\/v1|api\/graphql|graphql\/query)/.test(u);
  // Instagram's own "load more reels" request, learned from the page itself and replayed for paging
  const TPL_KEY = 'ar_reels_tpl';
  let reelsTpl = null;
  try { reelsTpl = JSON.parse(localStorage.getItem(TPL_KEY) || 'null'); } catch (e) { }
  function maybeLearn(url, method, hdrs, body) {
    try {
      if (!/graphql/.test(url) || typeof body !== 'string') return;
      if (!/clips_?_?user|ProfileReels|reels_tab|ClipsTab/i.test(body)) return;
      const h = {};
      for (const k in (hdrs || {})) if (!/^content-length$/i.test(k)) h[k] = hdrs[k];
      reelsTpl = { url, method: method || 'POST', headers: h, body, at: Date.now() };
      localStorage.setItem(TPL_KEY, JSON.stringify(reelsTpl));
    } catch (e) { }
  }
  function hdrObj(h) {
    const o = {};
    try { if (h instanceof Headers) h.forEach((v, k) => { o[k] = v; }); else if (Array.isArray(h)) h.forEach(([k, v]) => { o[k] = v; }); else Object.assign(o, h || {}); } catch (e) { }
    return o;
  }
  window.fetch = function (input, init) {
    try {
      const u0 = typeof input === 'string' ? input : (input && input.url) || '';
      if (init && typeof init.body === 'string') maybeLearn(u0, init.method, hdrObj(init.headers), init.body);
      else if (init && (init.body instanceof URLSearchParams || init.body instanceof FormData)) maybeLearn(u0, init.method, hdrObj(init.headers), new URLSearchParams(init.body).toString());
    } catch (e) { }
    const p = _fetch(input, init);
    try {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      if (isApi(u)) p.then((res) => { try { res.clone().text().then(ingestText, () => {}); } catch (e) { } }, () => {});
    } catch (e) { }
    return p;
  };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  const XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { try { this.__arU = String(u); this.__arM = m; this.__arH = {}; } catch (e) { } return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { if (this.__arH) this.__arH[k] = v; } catch (e) { } return XH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__arU) maybeLearn(this.__arU, this.__arM, this.__arH, typeof body === 'string' ? body : ((body instanceof URLSearchParams || body instanceof FormData) ? new URLSearchParams(body).toString() : null));
    } catch (e) { }
    try {
      if (this.__arU && isApi(this.__arU)) {
        this.addEventListener('load', function () {
          try {
            if (this.responseType === '' || this.responseType === 'text') ingestText(this.responseText);
            else if (this.responseType === 'json' && this.response) ingest(this.response);
          } catch (e) { }
        });
      }
    } catch (e) { }
    return XS.apply(this, arguments);
  };

  /* ---------------- SPA navigation events ---------------- */
  let lastUrl = location.href;
  function emitNav() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(() => { try { scanDocument(); } catch (e) { } }, 300);
    window.postMessage({ __ar: 'evt', event: 'navigate', data: { url: location.href, kind: pageInfo().kind } }, '*');
  }
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(emitNav, 0); return r; };
  }
  window.addEventListener('popstate', () => setTimeout(emitNav, 0));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { try { scanDocument(); } catch (e) { } });
  else { try { scanDocument(); } catch (e) { } }

  /* ---------------- public functions ---------------- */
  function pageInfo() {
    const parts = location.pathname.split('/').filter(Boolean);
    const out = { platform: 'instagram', kind: 'other', url: location.href };
    if (!parts.length) { out.kind = 'feed'; return out; }
    const a = parts[0];
    if ((a === 'reel' || a === 'p' || a === 'tv') && parts[1]) { out.kind = 'reel'; out.code = parts[1]; }
    else if (a === 'reels') { out.kind = parts[1] ? 'reel' : 'feed'; if (parts[1]) out.code = parts[1]; if (!parts[1] || parts[1] === 'audio') { delete out.code; out.kind = 'feed'; } }
    else if (parts[1] === 'reel' || parts[1] === 'p') { out.kind = 'reel'; out.code = parts[2]; out.username = a; }
    else if (!RESERVED.has(a) && /^[A-Za-z0-9._]{1,30}$/.test(a)) { out.kind = 'profile'; out.username = a; }
    else if (a === 'explore') out.kind = 'feed';
    if (out.code) {
      const r = media.get(out.code);
      if (r && r.username && !out.username) out.username = r.username;
    }
    return out;
  }

  function publicReel(r) {
    if (!r) return null;
    return {
      platform: 'instagram', id: r.id || codeToPk(r.code), code: r.code, url: r.url, username: r.username || '', fullName: r.fullName,
      caption: r.caption || '', views: r.views > 0 ? r.views : null, likes: r.likes === undefined ? -1 : r.likes,
      comments: r.comments === undefined ? -1 : r.comments, takenAt: r.takenAt || 0, duration: r.duration || 0,
      thumb: r.thumb || '', videoUrl: r.videoUrl, outlier: r.outlier, hasCaptions: subtitleUrls.has(r.code),
    };
  }
  const complete = (r) => r && r.takenAt && r.views !== undefined && r.username;

  async function fetchReelHtml(code) {
    // logged-out fallback: the public reel page carries the media JSON (no play_count there though)
    const res = await _fetch('/reel/' + code + '/', { credentials: 'include' });
    if (res.status === 429) throw err(E_RATE);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    scanDocument(doc);
    // a script fetch of the page usually has no media JSON, but its meta tags do:
    // description = '677K likes, 12K comments - garyvee on June 29, 2022: "caption…"' (count words are localized)
    const meta = (sel) => { const m = doc.querySelector(sel); return m ? (m.getAttribute('content') || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '') : ''; };
    const desc = meta('meta[property="og:description"]') || meta('meta[name="description"]');
    const ogUrl = meta('meta[property="og:url"]');
    const r = { code, platform: 'instagram' };
    const um = ogUrl.match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:reel|p)\//);
    if (um) r.username = um[1];
    const dm = desc.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
    if (dm) { const t = Date.parse(dm[1] + ' 12:00 UTC'); if (t) r.takenAt = Math.floor(t / 1000); }
    const cm = desc.match(/\d{4}\s*:\s*"([\s\S]*)$/);
    if (cm) r.caption = cm[1].replace(/"\s*\.?\s*$/, '');
    const img = meta('meta[property="og:image"]');
    if (img) r.thumb = img;
    const prev = media.get(code) || {};
    const out = Object.assign({}, prev);
    for (const k in r) if (out[k] === undefined || out[k] === '' || out[k] === 0) out[k] = r[k];
    if (!out.url) out.url = 'https://www.instagram.com/reel/' + code + '/';
    out._fetched = true;
    media.set(code, out);
  }

  async function getReel(codeOrUrl) {
    const code = parseCode(codeOrUrl);
    if (!code) throw err('رابط الريل غير صحيح.');
    let r = media.get(code);
    // a video with no real view count yet → ask media/info once (it carries play_count when logged in)
    const needViews = r && r._isVideo !== false && !(r.views > 0) && !r._infoTried;
    if (complete(r) && (r.videoUrl || r._fetched) && !needViews) return publicReel(r);
    if (r) r._infoTried = true;
    const pk = (r && r.id) || codeToPk(code);
    let lastErr = null;
    try {
      const j = await igJSON('/api/v1/media/' + pk + '/info/');
      if (j && j.items && j.items[0]) ingest(j.items[0]);
    } catch (e) { lastErr = e; }
    r = media.get(code);
    if (!complete(r)) {
      try { await fetchReelHtml(code); } catch (e) { lastErr = lastErr || e; }
      r = media.get(code);
    }
    if (!r) throw lastErr || err('لم أجد بيانات هذا الريل.');
    return publicReel(r);
  }

  function visibleVideo() {
    let best = null, bestArea = 0;
    const vh = window.innerHeight, vw = window.innerWidth;
    for (const v of document.querySelectorAll('video')) {
      const b = v.getBoundingClientRect();
      const w = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0));
      const h = Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0));
      let area = w * h;
      if (!v.paused) area *= 1.5;
      if (area > bestArea) { bestArea = area; best = v; }
    }
    return best;
  }
  function codeNear(el) {
    for (let n = el, i = 0; n && i < 18; n = n.parentElement, i++) {
      const a = n.querySelector && n.querySelector('a[href*="/reel/"], a[href*="/p/"], a[href*="/reels/"]');
      if (a) { const c = parseCode(a.getAttribute('href')); if (c && c !== 'audio') return c; }
    }
    return null;
  }
  async function getCurrentReel() {
    const pi = pageInfo();
    let code = pi.code;
    if (!code) {
      const v = visibleVideo();
      if (v) code = codeNear(v);
    }
    if (!code) return null;
    return getReel(code);
  }

  async function getProfile(username) {
    const key = username.toLowerCase();
    let p = users.get(key);
    if (p && p.id && p.followers !== undefined) return p;
    try {
      const j = await igJSON('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username));
      if (j && j.data && j.data.user) ingestUser(j.data.user);
    } catch (e) {
      // logged-out: the public profile page SSR carries id, followers and the first 12 reels
      try {
        const res = await _fetch('/' + encodeURIComponent(username) + '/reels/', { credentials: 'include' });
        if (res.status === 429) throw err(E_RATE);
        scanDocument(new DOMParser().parseFromString(await res.text(), 'text/html'));
      } catch (e2) { /* fall through */ }
      if (!users.get(key)) throw e;
    }
    p = users.get(key);
    if (!p) throw err('لم أجد الحساب @' + username + '.');
    return p;
  }

  function median(nums) {
    const a = nums.filter((n) => n > 0).sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function findConn(o, depth) {
    if (!o || typeof o !== 'object' || depth > 12) return null;
    if (Array.isArray(o.edges) && o.page_info) return o;
    for (const k in o) { const r = findConn(o[k], (depth || 0) + 1); if (r) return r; }
    return null;
  }
  // one page through Instagram's own request (same doc, same tokens), with another user / cursor
  async function tplPage(uid, cursor) {
    if (!reelsTpl) throw err('NO_TPL');
    const b = new URLSearchParams(reelsTpl.body);
    let v = {};
    try { v = JSON.parse(b.get('variables') || '{}'); } catch (e) { }
    const setUid = (o) => { for (const k in o) { if (/target_user_id|^user_id$|^id$/.test(k) && typeof o[k] !== 'object') o[k] = uid; else if (o[k] && typeof o[k] === 'object') setUid(o[k]); } };
    setUid(v);
    v.after = cursor || null; if ('before' in v) v.before = null;
    b.set('variables', JSON.stringify(v));
    const tok = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    const h = Object.assign({}, reelsTpl.headers);
    if (tok) for (const k in h) if (/x-csrftoken/i.test(k)) h[k] = decodeURIComponent(tok[1]);
    const res = await _fetch(reelsTpl.url, { method: 'POST', credentials: 'include', headers: h, body: b.toString() });
    logReq("graphql(reels)", String(res.status));
    if (res.status === 429) throw err(E_RATE);
    const text = (await res.text()).replace(/^for \(;;\);/, '');
    let j; try { j = JSON.parse(text.split('\n')[0]); } catch (e) { throw err('ردّ غير مفهوم من إنستغرام (' + res.status + ').'); }
    if (j.errors && !j.data) throw err('إنستغرام رفض الطلب.');
    ingest(j);
    const c = findConn(j.data || j, 0);
    if (!c) throw err('لم أجد الريلز في الرد.');
    const codes = [];
    for (const e of c.edges) { const m = e && e.node && (e.node.media || e.node); if (m && (m.code || m.shortcode)) codes.push(m.code || m.shortcode); }
    return { codes, cursor: c.page_info.end_cursor, more: !!c.page_info.has_next_page };
  }
  // last resort on the visible profile page: scroll like a person, the page loads more by itself
  async function scrollCollect(username, uid, limit, add) {
    const mine = () => { let n = 0; for (const r of media.values()) if ((r.username && r.username.toLowerCase() === username.toLowerCase()) || (uid && r._userId === uid)) { add(r.code); n++; } return n; };
    if (document.hidden) return false;
    const y0 = window.scrollY, t0 = Date.now(), MAX_MS = 90000;
    const path0 = location.pathname;
    const hadTpl = !!reelsTpl;
    // the person takes over (scrolls, types, clicks) → stop at once and leave the page where they put it
    let userActed = false;
    const stopIt = (e) => { if (e.isTrusted) userActed = true; };
    const evs = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    evs.forEach((t) => window.addEventListener(t, stopIt, { capture: true, passive: true }));
    let last = mine(), still = 0;
    try {
      // fast: jump to the bottom, move on the moment new reels arrive (poll every 120 ms, give up after ~2.5 s)
      for (let i = 0; i < 200 && last < limit && still < 3; i++) {
        if (userActed || document.hidden || location.pathname !== path0 || Date.now() - t0 > MAX_MS) break;
        window.scrollTo(0, document.documentElement.scrollHeight);
        let n = last;
        for (let w = 0; w < 21; w++) {
          await sleep(120);
          if (userActed) break;
          n = mine();
          if (n > last) break;
          if (w % 5 === 4) { window.scrollBy(0, -400); window.scrollTo(0, document.documentElement.scrollHeight); }
        }
        if (n > last) { last = n; still = 0; } else still++;
        // the page just sent its own "load more" request: stop scrolling, page through it directly (much faster)
        if (!hadTpl && reelsTpl) break;
      }
    } finally {
      evs.forEach((t) => window.removeEventListener(t, stopIt, { capture: true }));
      if (!userActed && location.pathname === path0) window.scrollTo(0, y0);
    }
    logReq("scroll", last + " ريل");
    return last > 12;
  }

  async function getProfileReels(username, opts) {
    username = String(username || pageInfo().username || '').replace(/^@/, '');
    if (!username) throw err('افتح صفحة حساب أولًا.');
    const limit = Math.max(1, Math.min(500, (opts && opts.limit) || 60));
    const prof = await getProfile(username);
    const uid = prof.id;
    const codes = [];
    let lastProg = 0;
    const prog = (step) => { const now = Date.now(); if (now - lastProg < 400) return; lastProg = now; window.postMessage({ __ar: 'evt', event: 'progress', data: { username, count: codes.length, limit, step } }, '*'); };
    const add = (code) => { if (code && !codes.includes(code)) { codes.push(code); prog('يجمع الريلز'); } };
    prog('يبدأ');
    let note;

    let fetched = false, lastErr = null;
    // fastest first: Instagram's own learned request; then the REST reads, unless they already failed here
    if (uid && reelsTpl && !(window.__arTplBroken)) {
      try {
        let cur = null, more = true, page = 0;
        while (more && codes.length < limit && page < 50) {
          const pg = await tplPage(uid, cur);
          pg.codes.forEach(add);
          cur = pg.cursor; more = pg.more && !!cur; page++; fetched = true;
          if (more && codes.length < limit) await sleep(200 + Math.random() * 100);
        }
      } catch (e) { if (e.message === E_RATE) lastErr = e; else window.__arTplBroken = true; }
    }
    if (uid && !fetched && !window.__arRestBroken) {
      // 1) the reels tab's own read: POST /api/v1/clips/user/
      let maxId = '', more = true, page = 0;
      try {
        while (more && codes.length < limit && page < 40) {
          const body = new URLSearchParams({ target_user_id: uid, page_size: '12', include_feed_video: 'true' });
          if (maxId) body.set('max_id', maxId);
          const j = await igJSON('/api/v1/clips/user/', { method: 'POST', body, headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded' }) });
          for (const it of (j.items || [])) { const m = it.media || it; if (m && m.code) add(m.code); }
          more = !!(j.paging_info && j.paging_info.more_available);
          maxId = j.paging_info && j.paging_info.max_id;
          if (!maxId) more = false;
          fetched = true; page++;
          if (more && codes.length < limit) await sleep(650 + Math.random() * 300);
        }
      } catch (e) { lastErr = e; }
      // 2) fallback: user feed (videos only)
      if (!fetched && !(lastErr && lastErr.message === E_RATE)) {
        try {
          let maxId2 = '', more2 = true, page2 = 0;
          while (more2 && codes.length < limit && page2 < 40) {
            const j = await igJSON('/api/v1/feed/user/' + uid + '/?count=12' + (maxId2 ? '&max_id=' + encodeURIComponent(maxId2) : ''));
            for (const m of (j.items || [])) if (m.media_type === 2 && m.code) add(m.code);
            more2 = !!j.more_available; maxId2 = j.next_max_id; if (!maxId2) more2 = false;
            fetched = true; page2++;
            if (more2 && codes.length < limit) await sleep(650 + Math.random() * 300);
          }
        } catch (e) { lastErr = lastErr || e; }
      }
    }
    if (uid && !fetched && lastErr && lastErr.message !== E_RATE) window.__arRestBroken = true;
    // 3) Instagram's own reels request (learned from the page), paged with the cursor
    if (uid && codes.length < limit && !(lastErr && lastErr.message === E_RATE) && reelsTpl) {
      try {
        let cur = null, more = true, page = 0;
        while (more && codes.length < limit && page < 40) {
          const pg = await tplPage(uid, cur);
          pg.codes.forEach(add);
          cur = pg.cursor; more = pg.more && !!cur; page++; fetched = true;
          if (more && codes.length < limit) await sleep(250 + Math.random() * 150);
        }
      } catch (e) { if (e.message !== 'NO_TPL') lastErr = lastErr || e; }
    }
    // 4) on this user's own profile page: scroll it, the page loads the rest itself
    const pi0 = pageInfo();
    if (codes.length < limit && pi0.username && pi0.username.toLowerCase() === username.toLowerCase() && !(opts && opts.noScroll)) {
      try { if (await scrollCollect(username, uid, limit, add)) fetched = true; } catch (e) { }
      if (uid && codes.length < limit && reelsTpl) {
        try {
          let cur = null, more = true, page = 0;
          while (more && codes.length < limit && page < 50) {
            const pg = await tplPage(uid, cur);
            pg.codes.forEach(add);
            cur = pg.cursor; more = pg.more && !!cur; page++; fetched = true;
            if (more && codes.length < limit) await sleep(250 + Math.random() * 150);
          }
        } catch (e) { lastErr = lastErr || e; }
      }
    }
    // 5) whatever the page already loaded for this user (logged-out SSR gives ~12)
    if (codes.length < limit) {
      for (const r of media.values()) {
        if (codes.length >= limit) break;
        if (((r.username && r.username.toLowerCase() === username.toLowerCase()) || (uid && r._userId === uid)) && r._isVideo !== false) add(r.code);
      }
    }
    if (!codes.length) throw lastErr || err('لم أجد ريلز لهذا الحساب.');
    if (!fetched) note = 'نتيجة جزئية: عرضتُ الريلز التي حمّلتها الصفحة فقط (' + codes.length + ').' + (lastErr ? ' السبب: ' + lastErr.message : ' سجّل الدخول في إنستغرام لجلب المزيد مع التواريخ.') ;
    if (!fetched && diag.length) try { console.debug('[Reels Analysis] requests:', diag.slice(-6).join(' · ')); } catch (e) { } // technical details stay out of the Arabic UI

    // fill missing dates / views one by one from media/info (the request the reel page itself makes)
    if (!(lastErr && lastErr.message === E_RATE)) {
      const todo = codes.slice(0, limit).map((c) => media.get(c)).filter((r) => r && !(r.takenAt && r.views > 0) && !r._infoTried).slice(0, 30);
      let stop = false, done = 0;
      const one = async (r) => {
        if (stop) return;
        r._infoTried = true;
        try {
          const j = await igJSON('/api/v1/media/' + (r.id || codeToPk(r.code)) + '/info/');
          if (j && j.items && j.items[0]) ingest(j.items[0]);
        } catch (e) { stop = true; if (!note) note = 'لم أستطع جلب التواريخ: ' + e.message; }
        done++; prog('يكمل التواريخ والمشاهدات (' + done + ' من ' + todo.length + ')');
      };
      for (let i = 0; i < todo.length && !stop; i += 4) { await Promise.all(todo.slice(i, i + 4).map(one)); if (!stop) await sleep(150); }
    }

    const reels = codes.slice(0, limit).map((c) => publicReel(media.get(c))).filter(Boolean);
    for (const r of reels) { if (!r.username) r.username = prof.username; if (!r.fullName) r.fullName = prof.fullName; }
    const med = median(reels.map((r) => r.views));
    // null = views hidden → UI shows —; tiny ratios keep 2 decimals so they never round down to 0
    for (const r of reels) { const x = med > 0 && r.views > 0 ? r.views / med : null; r.outlier = x == null ? null : x >= 0.1 ? Math.round(x * 10) / 10 : Math.max(0.01, Math.round(x * 100) / 100); }
    const profile = { platform: 'instagram', username: prof.username, fullName: prof.fullName || '', followers: prof.followers != null ? prof.followers : null, pic: prof.pic || '', id: prof.id || '' };
    const out = { profile, reels, median: med };
    if (note) { out.partial = true; out.note = note; }
    return out;
  }

  /* ---------------- transcript ---------------- */
  function parseVtt(text) {
    const segs = [];
    const toS = (t) => { const p = t.trim().replace(',', '.').split(':').map(parseFloat); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    const blocks = text.replace(/\r/g, '').split(/\n\n+/);
    for (const b of blocks) {
      const lines = b.split('\n');
      const i = lines.findIndex((l) => l.includes('-->'));
      if (i < 0) continue;
      const [a, z] = lines[i].split('-->');
      const t = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
      if (t) segs.push({ start: toS(a), end: toS(z.split(' ').filter(Boolean)[0]), text: t });
    }
    return segs;
  }
  async function getTranscript(codeOrUrl) {
    const code = parseCode(codeOrUrl) || pageInfo().code;
    if (!code) return { ok: false, reason: 'افتح ريلًا أولًا.' };
    if (!subtitleUrls.has(code)) { try { await getReel(code); } catch (e) { /* keep going */ } }
    const urls = subtitleUrls.get(code) || [];
    for (const u of urls) {
      try {
        const res = await _fetch(u, { credentials: 'omit' });
        if (!res.ok) continue;
        const t = await res.text();
        const segments = parseVtt(t);
        if (segments.length) {
          return { ok: true, source: 'subtitles', lang: (u.match(/[?&](?:lang|locale)=([a-zA-Z_-]+)/) || [])[1] || '', text: segments.map((s) => s.text).join(' '), segments };
        }
      } catch (e) { /* try next */ }
    }
    return { ok: false, reason: 'هذا الريل ليس فيه ترجمة أو نص مرفق من إنستغرام، فلا أستطيع تفريغه بدون خدمة تفريغ صوتي.' };
  }

  /* ---------------- RPC ---------------- */
  const API = { pageInfo, getCurrentReel, getReel, getProfileReels, getTranscript };
  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__ar !== 'req' || typeof d.fn !== 'string') return;
    const f = API[d.fn];
    if (!f) return; // yt.js may own it; never answer for unknown fns
    try {
      const result = await f.apply(null, Array.isArray(d.args) ? d.args : []);
      window.postMessage({ __ar: 'res', id: d.id, ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) }, '*');
    } catch (e) {
      window.postMessage({ __ar: 'res', id: d.id, ok: false, error: (e && e.message) || String(e) }, '*');
    }
  });
})();
