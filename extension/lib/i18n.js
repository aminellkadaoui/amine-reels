/* تحليل الريلز / Reels Analysis — shared translation module (isolated world + extension pages).
 * Language setting: chrome.storage.local `ar_settings.lang` = 'auto' | 'ar' | 'en'  (auto = browser UI language: ar* → Arabic, else English).
 * API (window.ARI18N):
 *   add({ ar:{key:'نص'}, en:{key:'text'} })   register strings (each owner file keeps its own dictionary)
 *   t(key, vars)        translated string; {name} placeholders filled from vars; falls back to Arabic, then the key
 *   lang()              'ar' | 'en' (resolved)      dir() → 'rtl' | 'ltr'
 *   pref()              the stored choice 'auto' | 'ar' | 'en'
 *   set(pref)           save the choice (all open pages/tabs update through onChange)
 *   ready               Promise resolved once the stored choice is loaded
 *   onChange(cb)        cb(lang) after the language changes (also fires when another page changes it)
 *   apply(root)         for static HTML: fills [data-i18n] textContent, [data-i18n-title] title, [data-i18n-ph] placeholder,
 *                       [data-i18n-aria] aria-label; sets <html lang/dir> when root is document
 * The resolved language is also written to <html data-ar-lang> on Instagram so the MAIN-world data layer (ig.js) can read it.
 */
(function () {
  'use strict';
  if (window.ARI18N) return;
  var dict = { ar: {}, en: {} };
  var prefVal = 'auto', listeners = [];
  function browserLang() {
    try { var l = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || navigator.language || 'en'; return /^ar/i.test(l) ? 'ar' : 'en'; }
    catch (e) { return /^ar/i.test(navigator.language || '') ? 'ar' : 'en'; }
  }
  function lang() { return prefVal === 'ar' || prefVal === 'en' ? prefVal : browserLang(); }
  function mark() { try { if (/instagram\.com$/.test(location.hostname)) document.documentElement.setAttribute('data-ar-lang', lang()); } catch (e) {} }
  function t(key, vars) {
    var s = dict[lang()][key];
    if (s == null) s = dict.ar[key];
    if (s == null) s = key;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function add(d) { ['ar', 'en'].forEach(function (l) { if (d && d[l]) for (var k in d[l]) dict[l][k] = d[l][k]; }); }
  function fire() { mark(); var l = lang(); listeners.slice().forEach(function (cb) { try { cb(l); } catch (e) {} }); }
  function apply(root) {
    root = root || document;
    var q = function (sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); };
    q('[data-i18n]', function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    q('[data-i18n-title]', function (el) { el.title = t(el.getAttribute('data-i18n-title')); });
    q('[data-i18n-ph]', function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    q('[data-i18n-aria]', function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    if (root === document) { document.documentElement.lang = lang(); document.documentElement.dir = lang() === 'ar' ? 'rtl' : 'ltr'; }
  }
  var ready = new Promise(function (res) {
    try {
      chrome.storage.local.get('ar_settings', function (o) {
        var s = o && o.ar_settings; if (s && s.lang) prefVal = s.lang;
        mark(); res(lang());
      });
    } catch (e) { mark(); res(lang()); }
  });
  try {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== 'local' || !ch.ar_settings) return;
      var n = ch.ar_settings.newValue && ch.ar_settings.newValue.lang;
      if (n && n !== prefVal) { prefVal = n; fire(); }
    });
  } catch (e) {}
  function set(p) {
    prefVal = p === 'ar' || p === 'en' ? p : 'auto';
    try {
      chrome.storage.local.get('ar_settings', function (o) {
        var s = (o && o.ar_settings) || {}; s.lang = prefVal;
        chrome.storage.local.set({ ar_settings: s });
      });
    } catch (e) {}
    fire();
  }
  window.ARI18N = {
    add: add, t: t, lang: lang, dir: function () { return lang() === 'ar' ? 'rtl' : 'ltr'; },
    pref: function () { return prefVal; }, set: set, ready: ready, apply: apply,
    onChange: function (cb) { listeners.push(cb); }
  };
})();
