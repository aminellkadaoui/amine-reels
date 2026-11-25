// تحليل الريلز (Reels Analysis) — service worker.
// 1) keyboard command → toggle the in-page app
// 2) AR_OPEN_LIBRARY → open the library page
// 3) AR_DOWNLOAD → download reels' original files exactly as Instagram serves them (chrome.downloads, no re-encode)
// 4) update notice: unpacked copies never auto-update, so on startup and every 12 h ask GitHub for the latest
//    release tag (one GET, no user data sent). Newer → badge «جديد» + ar_update for the popup banner.

// ---------------- update notice ----------------
const UPDATE_API = 'https://api.github.com/repos/aminellkadaoui/amine-reels/releases/latest';
const UPDATE_PAGE = 'https://aminellkadaoui.github.io/amine-reels/';
const UPDATE_ALARM = 'ar_update_check';
function verParts(v) { return String(v || '').replace(/^v/i, '').split(/[.\-+]/).slice(0, 3).map((x) => parseInt(x, 10) || 0); }
function isNewer(remote, local) {
  const a = verParts(remote), b = verParts(local);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return false;
}
// localOverride: only for testing the banner without touching the manifest
async function checkUpdate(localOverride) {
  const local = localOverride || chrome.runtime.getManifest().version;
  let rel;
  try {
    const res = await fetch(UPDATE_API, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    rel = await res.json();
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  const tag = rel && rel.tag_name;
  if (!tag) return { ok: false };
  if (isNewer(tag, local)) {
    const version = String(tag).replace(/^v/i, '');
    const notes = String(rel.body || '').replace(/\r/g, '').trim().slice(0, 400);
    await chrome.storage.local.set({ ar_update: { version, url: UPDATE_PAGE, notes, checkedAt: Date.now() } });
    try { await chrome.action.setBadgeBackgroundColor({ color: '#0F6BFF' }); } catch (e) { }
    try { if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' }); } catch (e) { }
    await chrome.action.setBadgeText({ text: 'جديد' });
    return { ok: true, newer: true, version };
  }
  await chrome.storage.local.remove('ar_update');
  await chrome.action.setBadgeText({ text: '' });
  return { ok: true, newer: false, version: String(tag).replace(/^v/i, '') };
}
function scheduleUpdateCheck() {
  try { chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 12 * 60 }); } catch (e) { }
  checkUpdate().catch(() => {});
}
chrome.runtime.onStartup.addListener(scheduleUpdateCheck);
chrome.runtime.onInstalled.addListener(scheduleUpdateCheck);
chrome.alarms.onAlarm.addListener((a) => { if (a && a.name === UPDATE_ALARM) checkUpdate().catch(() => {}); });
self.checkUpdate = checkUpdate;

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-app') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'AR_TOGGLE_APP' }); } catch (e) { /* page without the app */ }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'AR_CHECK_UPDATE') {
    checkUpdate().then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'AR_OPEN_LIBRARY') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/library.html') });
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'AR_DOWNLOAD') {
    const reels = Array.isArray(msg.reels) ? msg.reels.filter(Boolean) : [];
    if (!reels.length) { sendResponse({ ok: false, error: 'لا توجد ريلز للتنزيل.' }); return; }
    const jobId = 'dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const job = { jobId, reels, folderName: msg.folderName || '', tabId: sender && sender.tab ? sender.tab.id : null,
      done: 0, total: reels.length, failed: [], finished: false, current: null };
    jobs.set(jobId, job);
    queue = queue.then(() => runJob(job)).catch(() => {});
    sendResponse({ ok: true, jobId });
    return;
  }
  if (msg.type === 'AR_DL_STATUS') {
    const j = jobs.get(msg.jobId);
    sendResponse(j ? { ok: true, ...progressOf(j) } : { ok: false });
  }
});

// ---------------- downloads ----------------
const jobs = new Map();
let queue = Promise.resolve();            // jobs run one after another, never in parallel
const GAP_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function progressOf(j) {
  return { jobId: j.jobId, done: j.done, total: j.total, failed: j.failed.slice(), finished: j.finished, current: j.current };
}
function report(j) {
  const m = { type: 'AR_DL_PROGRESS', ...progressOf(j) };
  chrome.runtime.sendMessage(m).catch(() => {});                              // extension pages (library, popup)
  if (j.tabId != null) chrome.tabs.sendMessage(j.tabId, m).catch(() => {});  // the in-page app that asked
}

// Safe file/folder names on macOS and Windows.
function clean(s, max) {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>:"/\\|?*~]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = '_' + s;
  return s.slice(0, max || 80).trim();
}
// Keep the extension of the served file (normally .mp4).
function extOf(url) {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (m && /^(mp4|m4v|mov|webm|mkv)$/i.test(m[1])) return '.' + m[1].toLowerCase();
  } catch (e) { /* bad url */ }
  return '.mp4';
}

// Keep the worker alive while a job runs (an extension API call resets the idle timer).
function keepAlive() {
  const t = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
  return () => clearInterval(t);
}

// ---- an Instagram tab whose content script answers AR_DATA
async function waitComplete(tabId, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const t = await chrome.tabs.get(tabId); if (t.status === 'complete') return true; } catch (e) { return false; }
    await sleep(300);
  }
  return false;
}
async function ask(tabId, fn, args) {
  try { return await chrome.tabs.sendMessage(tabId, { type: 'AR_DATA', fn, args }); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
async function igTab(ctx) {
  if (ctx.tabId != null) {
    try { await chrome.tabs.get(ctx.tabId); return ctx.tabId; } catch (e) { ctx.tabId = null; }
  }
  const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
  tabs.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
  for (const t of tabs) {
    if (t.status !== 'complete' || t.discarded) continue;
    const r = await ask(t.id, 'pageInfo', []);
    if (r && r.ok) { ctx.tabId = t.id; return t.id; }
  }
  if (ctx.openTried) return null;
  ctx.openTried = true;
  try {
    const t = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: false });
    ctx.opened = t.id;
    await waitComplete(t.id, 30000);
    await sleep(2000);
    for (let i = 0; i < 5; i++) {                       // the content script may need a moment
      const r = await ask(t.id, 'pageInfo', []);
      if (r && r.ok) { ctx.tabId = t.id; return t.id; }
      await sleep(1000);
    }
  } catch (e) { /* could not open a tab */ }
  return null;
}
async function freshUrl(ctx, reel) {
  const tabId = await igTab(ctx);
  if (tabId == null) return { url: null };
  const r = await ask(tabId, 'getReel', [reel.code || reel.url]);
  if (r && r.ok && r.result && r.result.videoUrl) return { url: r.result.videoUrl, meta: r.result };
  return { url: null, meta: r && r.ok ? r.result : null };
}

// ---- one chrome.downloads item; resolves when it completes or fails
function downloadOnce(url, filename) {
  return new Promise((resolve) => {
    let id = null, settled = false;
    const finish = (res) => { if (settled) return; settled = true; chrome.downloads.onChanged.removeListener(onCh); resolve(res); };
    const onCh = (d) => {
      if (id == null || d.id !== id) return;
      if (d.state && d.state.current === 'complete') finish({ ok: true, id });
      else if (d.state && d.state.current === 'interrupted') finish({ ok: false, error: (d.error && d.error.current) || 'INTERRUPTED' });
    };
    chrome.downloads.onChanged.addListener(onCh);
    chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, (newId) => {
      if (chrome.runtime.lastError || newId == null) {
        finish({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'FAILED' });
        return;
      }
      id = newId;
      chrome.downloads.search({ id }, (arr) => {        // it may have finished before the listener saw it
        const d = arr && arr[0]; if (!d) return;
        if (d.state === 'complete') finish({ ok: true, id });
        else if (d.state === 'interrupted') finish({ ok: false, error: d.error || 'INTERRUPTED' });
      });
    });
  });
}

const ERR_AR = {
  NETWORK_FAILED: 'انقطع الاتصال أثناء التنزيل', NETWORK_TIMEOUT: 'انتهت مهلة الاتصال', NETWORK_SERVER_DOWN: 'الخادم لا يستجيب',
  NETWORK_INVALID_REQUEST: 'رابط الفيديو غير صالح', SERVER_FORBIDDEN: 'رفض إنستغرام الرابط (انتهت صلاحيته غالبًا)',
  SERVER_UNAUTHORIZED: 'رفض إنستغرام الرابط (يحتاج تسجيل دخول)', SERVER_BAD_CONTENT: 'الملف غير موجود على الخادم',
  SERVER_FAILED: 'فشل خادم إنستغرام', FILE_NO_SPACE: 'لا توجد مساحة كافية في القرص', FILE_ACCESS_DENIED: 'لا يمكن الكتابة في مجلد التنزيلات',
  FILE_NAME_TOO_LONG: 'اسم الملف طويل جدًا', USER_CANCELED: 'أُلغي التنزيل', FILE_FAILED: 'تعذّر حفظ الملف'
};
const errAr = (e) => ERR_AR[e] || ('فشل التنزيل (' + e + ')');

async function runJob(job) {
  const stop = keepAlive();
  const ctx = { tabId: null, opened: null, openTried: false };
  const folder = clean(job.folderName, 60);
  const dir = 'تحليل الريلز/' + (folder ? folder + '/' : '');
  report(job);
  try {
    for (let i = 0; i < job.reels.length; i++) {
      const reel = job.reels[i];
      const code = reel.code || reel.id || ('reel-' + (i + 1));
      job.current = code;
      let reason = null;
      if (reel.platform && reel.platform !== 'instagram') {
        reason = 'ليس من إنستغرام';
      } else {
        const fresh = await freshUrl(ctx, reel);
        const tries = [];
        if (fresh.url) tries.push(fresh.url);
        if (reel.videoUrl && reel.videoUrl !== fresh.url) tries.push(reel.videoUrl);   // fallback: the stored link
        const user = clean((fresh.meta && fresh.meta.username) || reel.username || 'instagram', 50) || 'instagram';
        if (!tries.length) reason = 'لم أجد رابط الفيديو';
        let lastErr = null;
        for (const url of tries) {
          const res = await downloadOnce(url, dir + clean(user + ' - ' + code, 120) + extOf(url));
          if (res.ok) { lastErr = null; break; }
          lastErr = res.error;
        }
        if (tries.length && lastErr) reason = errAr(lastErr);
      }
      if (reason) job.failed.push({ code, username: reel.username || '', reason });
      job.done = i + 1;
      report(job);
      if (i < job.reels.length - 1) await sleep(GAP_MS);
    }
  } finally {
    job.current = null;
    job.finished = true;
    if (ctx.opened != null) { try { await chrome.tabs.remove(ctx.opened); } catch (e) { /* already closed */ } }
    report(job);
    stop();
    setTimeout(() => jobs.delete(job.jobId), 10 * 60 * 1000);
  }
}
