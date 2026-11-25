/* Amine Reels — library page: saved reels ('ar_library'), folders ('ar_folders'), downloads of the original files. */
(function () {
  'use strict';
  // Phosphor 2.1.1 regular (MIT) — icons this page needs that lib/phosphor/icons.js may not carry.
  var EXTRA = {
    'folder-simple': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M216,72H130.67L102.93,51.2a16.12,16.12,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V200a16,16,0,0,0,16,16H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Zm0,128H40V64H93.33L123.2,86.4A8,8,0,0,0,128,88h88Z"/></svg>',
    'folder-simple-plus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M216,72H130.67L102.93,51.2a16.12,16.12,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V200a16,16,0,0,0,16,16H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Zm0,128H40V64H93.33L123.2,86.4A8,8,0,0,0,128,88h88Zm-56-56a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V152H104a8,8,0,0,1,0-16h16V120a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,144Z"/></svg>',
    'download-simple': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/></svg>',
    'check-square': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM224,48V208a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM208,208V48H48V208H208Z"/></svg>',
    'pencil-simple': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>'
  };
  var PH = {}; var k0;
  for (k0 in (window.PH || {})) PH[k0] = window.PH[k0];
  for (k0 in EXTRA) if (!PH[k0]) PH[k0] = EXTRA[k0];

  var KEY = 'ar_library', FKEY = 'ar_folders';
  var $ = function (id) { return document.getElementById(id); };
  var items = [], folders = [];
  var view = 'all';                  // 'all' or a folder id
  var selectMode = false, picked = {};   // key → true
  var sideEdit = null;               // {kind:'new'|'rename'|'delete', id}
  var cards = {};                    // key → {node, sig}
  var menuEl = null, menuFor = null;
  var undo = null, toastTimer = null;
  var job = null;                    // {jobId, name}

  Array.prototype.forEach.call(document.querySelectorAll('[data-ic]'), function (n) { n.innerHTML = PH[n.getAttribute('data-ic')] || ''; });

  // ---- helpers (same formats as the in-page app)
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
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (n < 0) return 'مخفية';
    function f(x) { var s = x.toFixed(1); return s.slice(-2) === '.0' ? s.slice(0, -2) : s; }
    if (n >= 1e9) return f(n / 1e9) + 'B';
    if (n >= 1e6) return f(n / 1e6) + 'M';
    if (n >= 1e3) return f(n / 1e3) + 'K';
    return String(Math.round(n));
  }
  function fmtOutlier(o) { if (o == null || isNaN(o)) return ''; if (o >= 0 && o < 0.1) return '<0.1×'; /* a real ratio is never 0 (0 views → null) */ return (o >= 10 ? String(Math.round(o)) : (Math.round(o * 10) / 10).toFixed(1).replace(/\.0$/, '')) + '×'; }
  function fmtTime(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  var UNITS = [[31536000, 'سنة', 'سنتين', 'سنوات', 'سنة'], [2592000, 'شهر', 'شهرين', 'أشهر', 'شهرًا'], [604800, 'أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'],
    [86400, 'يوم', 'يومين', 'أيام', 'يومًا'], [3600, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'], [60, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة']];
  function relTime(ts) {
    if (!ts) return '—';
    var d = Math.max(0, Date.now() / 1000 - ts);
    for (var i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      if (d >= u[0]) { var n = Math.floor(d / u[0]); return n === 1 ? 'قبل ' + u[1] : n === 2 ? 'قبل ' + u[2] : n <= 10 ? 'قبل ' + n + ' ' + u[3] : 'قبل ' + n + ' ' + u[4]; }
    }
    return 'الآن';
  }
  function reelsWord(n) { return n === 1 ? 'ريل' : 'ريلز'; }
  function keyOf(r) { return (r.platform || '') + ':' + (r.code || r.id || r.url); }
  function iso(ms) { return ms ? new Date(ms).toISOString() : ''; }
  function folderById(id) { for (var i = 0; i < folders.length; i++) if (folders[i].id === id) return folders[i]; return null; }
  function inFolder(r, id) { return Array.isArray(r.folders) && r.folders.indexOf(id) >= 0; }
  function countIn(id) { var n = 0; items.forEach(function (r) { if (inFolder(r, id)) n++; }); return n; }
  function newId() { return 'f_' + Date.now().toString(36); }

  // ---- storage (always read fresh before writing: app.js writes the same keys)
  function load() {
    chrome.storage.local.get([KEY, FKEY], function (o) {
      items = (o && o[KEY]) || []; folders = (o && o[FKEY]) || [];
      render();
    });
  }
  function mutate(fn, done) {
    chrome.storage.local.get([KEY, FKEY], function (o) {
      var lib = ((o && o[KEY]) || []).slice(), fl = ((o && o[FKEY]) || []).slice();
      var res = fn(lib, fl) || {};
      var out = {};
      if (res.lib !== false) out[KEY] = res.lib || lib;
      if (res.folders) out[FKEY] = res.folders;
      chrome.storage.local.set(out, function () { if (done) done(res); });
    });
  }
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'local' || (!ch[KEY] && !ch[FKEY])) return;
    if (ch[KEY]) items = ch[KEY].newValue || [];
    if (ch[FKEY]) folders = ch[FKEY].newValue || [];
    if (view !== 'all' && !folderById(view)) view = 'all';
    render();
  });

  // tag helpers: change one reel's folder list
  function setFolders(r, list) { var c = {}; for (var k in r) c[k] = r[k]; c.folders = list; return c; }
  function addTag(lib, keys, fid) {
    return lib.map(function (r) {
      if (!keys[keyOf(r)]) return r;
      var f = Array.isArray(r.folders) ? r.folders.slice() : [];
      if (f.indexOf(fid) < 0) f.push(fid);
      return setFolders(r, f);
    });
  }
  function dropTag(lib, keys, fid) {
    return lib.map(function (r) {
      if ((keys && !keys[keyOf(r)]) || !inFolder(r, fid)) return r;
      return setFolders(r, r.folders.filter(function (x) { return x !== fid; }));
    });
  }
  function createFolder(name, keys, done) {
    name = name.trim();
    if (!name) return done && done({ error: 'اكتب اسم المجلد.' });
    var exists = folders.some(function (f) { return f.name.trim() === name; });
    if (exists) return done && done({ error: 'يوجد مجلد بهذا الاسم.' });
    var f = { id: newId(), name: name, createdAt: Date.now() };
    mutate(function (lib, fl) {
      fl.push(f);
      return { lib: keys ? addTag(lib, keys, f.id) : false, folders: fl };
    }, function () { if (done) done({ folder: f }); });
  }

  // ---- filtering
  function inView() {
    return view === 'all' ? items.slice() : items.filter(function (r) { return inFolder(r, view); });
  }
  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var key = $('sort').value;
    var list = inView().filter(function (r) {
      if (!q) return true;
      var hay = [r.username, r.fullName, r.caption, r.transcript && r.transcript.text].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    list.sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
    return list;
  }
  function viewName() { var f = view !== 'all' && folderById(view); return f ? f.name : 'الكل'; }

  // ---- render
  function render() {
    renderSide();
    var list = filtered(), all = inView();
    $('sub').textContent = '';
    $('sub').appendChild(el('span', { class: 'num', text: String(items.length) }));
    $('sub').appendChild(document.createTextNode(items.length === 1 ? ' ريل محفوظ' : ' ريلز محفوظة'));
    $('sub').appendChild(document.createTextNode(' · '));
    $('sub').appendChild(el('span', { class: 'num', text: String(folders.length) }));
    $('sub').appendChild(document.createTextNode(folders.length === 1 ? ' مجلد' : ' مجلدات'));
    $('exJson').disabled = $('exCsv').disabled = !items.length;
    $('vname').textContent = viewName();
    $('vcount').textContent = list.length === all.length ? list.length + ' ' + reelsWord(list.length) : 'يظهر ' + list.length + ' من ' + all.length;
    $('dlAll').disabled = !list.length || !!(job && !job.finished);
    $('dlAll').lastChild.textContent = $('q').value.trim() && list.length !== all.length ? 'تنزيل الظاهر (' + list.length + ')' : 'تنزيل الكل';
    $('selBtn').className = 'btn' + (selectMode ? ' on' : '');
    $('selBtn').lastChild.textContent = selectMode ? 'إنهاء التحديد' : 'تحديد';

    // keep only picks that still exist
    var live = {}; items.forEach(function (r) { live[keyOf(r)] = 1; });
    for (var pk in picked) if (!live[pk]) delete picked[pk];
    renderSelbar(list);

    var grid = $('grid'), empty = $('empty');
    if (!list.length) {
      grid.textContent = '';
      empty.hidden = false; empty.textContent = '';
      empty.appendChild(ic(!items.length ? 'bookmark-simple' : view !== 'all' && !all.length ? 'folder-simple' : 'magnifying-glass'));
      empty.appendChild(el('div', { text: !items.length ? 'لا توجد ريلز محفوظة بعد. اضغط «حفظ» في عارض الريل لتظهر هنا.'
        : view !== 'all' && !all.length ? 'هذا المجلد فارغ. أضف إليه ريلز من «الكل» بزر «إضافة إلى مجلد».' : 'لا توجد نتائج لهذا البحث.' }));
      return;
    }
    empty.hidden = true;
    // reuse card nodes (no image reload, no flicker); rebuild a card only when its data changed
    var want = {};
    var nodes = list.map(function (r) {
      var k = keyOf(r); want[k] = 1;
      var sig = JSON.stringify([r.thumb, r.outlier, r.username, r.caption, r.views, r.likes, r.comments, r.takenAt, r.savedAt,
        !!(r.transcript && r.transcript.text), r.folders || [], folders.map(function (f) { return f.id + f.name; }), r.platform]);
      var c = cards[k];
      if (!c || c.sig !== sig) { if (c && c.node.parentNode) c.node.remove(); c = cards[k] = { node: card(r), sig: sig }; }
      c.node.classList.toggle('picked', !!(selectMode && picked[k]));
      c.node.classList.toggle('selecting', selectMode);
      c.pick = c.node.querySelector('.pick'); if (c.pick) c.pick.hidden = !selectMode;
      return c.node;
    });
    for (var ck in cards) if (!want[ck]) { if (cards[ck].node.parentNode) cards[ck].node.remove(); delete cards[ck]; }
    var cur = grid.firstChild;
    nodes.forEach(function (n) {
      if (n === cur) { cur = cur.nextSibling; return; }
      grid.insertBefore(n, cur);
    });
    while (cur) { var nx = cur.nextSibling; cur.remove(); cur = nx; }
  }

  // ---- sidebar
  function renderSide() {
    var side = $('side');
    var focusNow = document.activeElement && side.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (focusNow && sideEdit) return;   // don't rebuild while the user types a name
    side.textContent = '';
    side.appendChild(row('all', 'الكل', items.length, 'squares-four'));
    side.appendChild(el('div', { class: 'label', text: 'المجلدات' }));
    folders.forEach(function (f) {
      if (sideEdit && sideEdit.id === f.id && sideEdit.kind === 'rename') side.appendChild(nameEditor(f.name, 'حفظ', function (name, err) { renameFolder(f, name, err); }));
      else if (sideEdit && sideEdit.id === f.id && sideEdit.kind === 'delete') side.appendChild(deleteConfirm(f));
      else side.appendChild(row(f.id, f.name, countIn(f.id), 'folder-simple', f));
    });
    if (sideEdit && sideEdit.kind === 'new') {
      side.appendChild(nameEditor('', 'إنشاء', function (name, err) {
        createFolder(name, null, function (res) { if (res.error) return err(res.error); sideEdit = null; view = res.folder.id; render(); });
      }));
    } else {
      side.appendChild(el('button', { class: 'frow newf', type: 'button', onclick: function () { sideEdit = { kind: 'new' }; renderSide(); focusSide(); } },
        [ic('folder-simple-plus'), el('span', { class: 'name', text: 'مجلد جديد' })]));
    }
  }
  function row(id, name, count, icon, f) {
    var r = el('div', { class: 'frow' + (view === id ? ' cur' : ''), role: 'button', tabindex: '0', title: name,
      onclick: function () { if (view !== id) { view = id; closeMenu(); render(); window.scrollTo(0, 0); } } }, [
      ic(icon), el('span', { class: 'name', text: name }), el('span', { class: 'cnt num', text: String(count) })
    ]);
    if (f) {
      r.appendChild(el('button', { class: 'mini', type: 'button', title: 'إعادة تسمية', onclick: function (e) { e.stopPropagation(); sideEdit = { kind: 'rename', id: f.id }; renderSide(); focusSide(); } }, [ic('pencil-simple')]));
      r.appendChild(el('button', { class: 'mini del', type: 'button', title: 'حذف المجلد', onclick: function (e) { e.stopPropagation(); sideEdit = { kind: 'delete', id: f.id }; renderSide(); } }, [ic('trash')]));
    }
    return r;
  }
  function focusSide() { var i = $('side').querySelector('input'); if (i) { i.focus(); i.select(); } }
  function nameEditor(value, okLabel, onOk) {
    var input = el('input', { type: 'text', value: value, placeholder: 'اسم المجلد', maxlength: '60' });
    var err = el('div', { class: 'err', hidden: true });
    function showErr(t) { err.textContent = t; err.hidden = false; }
    function ok() { onOk(input.value, showErr); }
    function cancel() { sideEdit = null; input.blur(); renderSide(); }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') cancel(); });
    return el('div', { class: 'fedit' }, [input, err, el('div', { class: 'row' }, [
      el('button', { class: 'btn sm primary', type: 'button', text: okLabel, onclick: ok }),
      el('button', { class: 'btn sm', type: 'button', text: 'إلغاء', onclick: cancel })
    ])]);
  }
  function renameFolder(f, name, err) {
    name = name.trim();
    if (!name) return err('اكتب اسم المجلد.');
    if (folders.some(function (x) { return x.id !== f.id && x.name.trim() === name; })) return err('يوجد مجلد بهذا الاسم.');
    sideEdit = null;
    document.activeElement && document.activeElement.blur();
    mutate(function (lib, fl) {
      return { lib: false, folders: fl.map(function (x) { return x.id === f.id ? { id: x.id, name: name, createdAt: x.createdAt } : x; }) };
    });
  }
  function deleteConfirm(f) {
    var n = countIn(f.id);
    return el('div', { class: 'fedit' }, [
      el('div', { class: 'q', text: 'حذف المجلد «' + f.name + '»؟ ' + (n ? 'الريلز (' + n + ') تبقى في المكتبة.' : 'المجلد فارغ.') }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn sm danger solid', type: 'button', text: 'حذف', onclick: function () {
          sideEdit = null; if (view === f.id) view = 'all';
          mutate(function (lib, fl) { return { lib: dropTag(lib, null, f.id), folders: fl.filter(function (x) { return x.id !== f.id; }) }; });
        } }),
        el('button', { class: 'btn sm', type: 'button', text: 'إلغاء', onclick: function () { sideEdit = null; renderSide(); } })
      ])
    ]);
  }

  // ---- cards
  function card(r) {
    var k = keyOf(r);
    var hot = (r.outlier || 0) >= 3;
    var hasTx = !!(r.transcript && r.transcript.text);
    var img = el('img', { src: r.thumb || '', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    var thumb = el('a', { class: 'thumb', href: r.url, target: '_blank', rel: 'noopener', title: 'فتح الريل' }, [
      img,
      r.outlier != null ? el('span', { class: 'badge num' + (hot ? ' hot' : ''), text: fmtOutlier(r.outlier) }) : null,
      hasTx ? el('span', { class: 'txmark', title: 'محفوظ مع النص' }, [ic('waveform'), 'نص']) : null,
      el('span', { class: 'pick', hidden: true }, [ic('check')])
    ]);
    img.addEventListener('error', function () {
      img.remove();
      thumb.insertBefore(el('div', { class: 'ph' }, [ic('instagram-logo')]), thumb.firstChild);
    });
    var node;
    function togglePick(e) {
      if (!selectMode) return;
      e.preventDefault();
      if (picked[k]) delete picked[k]; else picked[k] = true;
      node.classList.toggle('picked', !!picked[k]);
      renderSelbar(filtered());
    }
    thumb.addEventListener('click', togglePick);
    var copyBtn = el('button', { class: 'btn sm grow', type: 'button', disabled: !hasTx, title: hasTx ? 'نسخ النص' : 'لم يُحفظ نص لهذا الريل' }, [ic('copy'), el('span', { text: 'نسخ النص' })]);
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(r.transcript.text).then(function () { copyBtn.lastChild.textContent = 'نُسخ'; setTimeout(function () { copyBtn.lastChild.textContent = 'نسخ النص'; }, 1500); });
    });
    var chips = (r.folders || []).map(folderById).filter(Boolean);
    var folderBtn = el('button', { class: 'btn sm icon', type: 'button', title: 'إضافة إلى مجلد' }, [ic('folder-simple-plus')]);
    folderBtn.addEventListener('click', function (e) { e.stopPropagation(); openReelMenu(folderBtn, r); });
    node = el('div', { class: 'card' }, [
      thumb,
      el('div', { class: 'meta', onclick: togglePick }, [
        el('div', { class: 'user' }, [ic(r.platform === 'youtube' ? 'youtube-logo' : 'instagram-logo'), el('span', { dir: 'ltr', text: '@' + (r.username || '') })]),
        el('div', { class: 'cap', dir: 'auto', text: r.caption || '' }),
        el('div', { class: 'stats' }, [
          el('span', null, [ic('eye'), el('span', { class: 'num', text: fmtNum(r.views) })]),
          el('span', null, [ic('heart'), el('span', { class: 'num', text: fmtNum(r.likes) })]),
          el('span', null, [ic('chat-circle'), el('span', { class: 'num', text: fmtNum(r.comments) })])
        ]),
        el('div', { class: 'date', text: 'نُشر ' + relTime(r.takenAt) + ' · حُفظ ' + relTime((r.savedAt || 0) / 1000) }),
        chips.length ? el('div', { class: 'chips' }, chips.map(function (f) { return el('span', { class: 'chip', title: f.name }, [ic('folder-simple'), f.name]); })) : null
      ]),
      el('div', { class: 'acts' }, [
        copyBtn,
        folderBtn,
        el('button', { class: 'btn sm icon', type: 'button', title: 'تنزيل الملف الأصلي', onclick: function () { startDownload([r], view !== 'all' ? viewName() : ''); } }, [ic('download-simple')]),
        el('a', { class: 'btn sm icon', href: r.url, target: '_blank', rel: 'noopener', title: 'فتح في إنستغرام' }, [ic('arrow-up-right')]),
        el('button', { class: 'btn sm icon danger', type: 'button', title: 'إزالة من المكتبة', onclick: function () { removeReels([k]); } }, [ic('trash')])
      ])
    ]);
    return node;
  }

  // ---- folder menu (card: checkboxes; selection: pick a target)
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; menuFor = null; } }
  document.addEventListener('mousedown', function (e) { if (menuEl && !menuEl.contains(e.target) && !(menuFor && menuFor.contains(e.target))) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  function placeMenu(anchor, m) {
    document.body.appendChild(m);
    var b = anchor.getBoundingClientRect();
    var w = m.offsetWidth, h = m.offsetHeight;
    var left = Math.min(Math.max(8, b.right - w), window.innerWidth - w - 8);
    var top = b.bottom + 6;
    if (top + h > window.innerHeight - 8 && b.top - h - 6 > 8) top = b.top - h - 6;
    m.style.left = (left + window.scrollX) + 'px';
    m.style.top = (top + window.scrollY) + 'px';
  }
  function newFolderItem(m, keys, after) {
    var holder = el('div');
    var btn = el('button', { class: 'mi newf', type: 'button' }, [ic('folder-simple-plus'), el('span', { class: 'name', text: 'مجلد جديد' })]);
    btn.addEventListener('click', function () {
      var input = el('input', { type: 'text', placeholder: 'اسم المجلد', maxlength: '60' });
      var err = el('div', { class: 'err', hidden: true });
      function ok() {
        createFolder(input.value, keys, function (res) {
          if (res.error) { err.textContent = res.error; err.hidden = false; return; }
          closeMenu(); if (after) after(res.folder);
        });
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      holder.textContent = '';
      holder.appendChild(el('div', { class: 'fedit' }, [input, err, el('div', { class: 'row' }, [
        el('button', { class: 'btn sm primary', type: 'button', text: 'إنشاء وإضافة', onclick: ok }),
        el('button', { class: 'btn sm', type: 'button', text: 'إلغاء', onclick: closeMenu })
      ])]));
      input.focus();
    });
    holder.appendChild(btn);
    m.appendChild(holder);
  }
  function openReelMenu(anchor, r) {
    if (menuFor === anchor) return closeMenu();
    closeMenu();
    var k = keyOf(r), keys = {}; keys[k] = true;
    var m = el('div', { class: 'menu' }, [el('div', { class: 'mt', text: 'إضافة إلى مجلد' })]);
    if (!folders.length) m.appendChild(el('div', { class: 'none', text: 'لا توجد مجلدات بعد.' }));
    folders.forEach(function (f) {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = inFolder(r, f.id);
      var lab = el('label', { class: 'mi' }, [cb, el('span', { class: 'name', text: f.name })]);
      cb.addEventListener('change', function () {
        var on = cb.checked;
        mutate(function (lib) { return { lib: on ? addTag(lib, keys, f.id) : dropTag(lib, keys, f.id) }; });
      });
      m.appendChild(lab);
    });
    m.appendChild(el('div', { class: 'sepl' }));
    newFolderItem(m, keys);
    menuEl = m; menuFor = anchor;
    placeMenu(anchor, m);
  }
  function openPickMenu(anchor, title, onPick, excludeId) {
    if (menuFor === anchor) return closeMenu();
    closeMenu();
    var m = el('div', { class: 'menu' }, [el('div', { class: 'mt', text: title })]);
    var list = folders.filter(function (f) { return f.id !== excludeId; });
    if (!list.length) m.appendChild(el('div', { class: 'none', text: 'لا توجد مجلدات أخرى.' }));
    list.forEach(function (f) {
      m.appendChild(el('button', { class: 'mi', type: 'button', onclick: function () { closeMenu(); onPick(f); } }, [ic('folder-simple'), el('span', { class: 'name', text: f.name }), el('span', { class: 'cnt num', text: String(countIn(f.id)) })]));
    });
    m.appendChild(el('div', { class: 'sepl' }));
    newFolderItem(m, null, onPick);
    menuEl = m; menuFor = anchor;
    placeMenu(anchor, m);
  }

  // ---- select mode
  function pickedKeys() { var o = {}, n = 0; for (var k in picked) { o[k] = true; n++; } return { keys: o, n: n }; }
  function renderSelbar(list) {
    var bar = $('selbar');
    if (!selectMode) { bar.hidden = true; return; }
    bar.hidden = false; bar.textContent = '';
    var p = pickedKeys(), n = p.n;
    var allPicked = list.length && list.every(function (r) { return picked[keyOf(r)]; });
    bar.appendChild(el('span', { class: 'count', text: n ? 'تم تحديد ' + n : 'اضغط على الريلز لتحديدها' }));
    bar.appendChild(el('button', { class: 'btn sm', type: 'button', text: allPicked ? 'إلغاء تحديد الكل' : 'تحديد الكل', onclick: function () {
      if (allPicked) picked = {}; else list.forEach(function (r) { picked[keyOf(r)] = true; });
      render();
    } }));
    bar.appendChild(el('span', { class: 'sp' }));
    var addBtn = el('button', { class: 'btn sm', type: 'button', disabled: !n }, [ic('folder-simple-plus'), el('span', { text: 'إضافة إلى مجلد' })]);
    addBtn.addEventListener('click', function () {
      openPickMenu(addBtn, 'إضافة المحدد إلى', function (f) {
        var keys = pickedKeys().keys;
        mutate(function (lib) { return { lib: addTag(lib, keys, f.id) }; }, function () { showToast('أُضيف ' + Object.keys(keys).length + ' إلى «' + f.name + '».'); });
      });
    });
    bar.appendChild(addBtn);
    if (view !== 'all') {
      var cur = view;
      var moveBtn = el('button', { class: 'btn sm', type: 'button', disabled: !n }, [ic('folder-simple'), el('span', { text: 'نقل إلى مجلد' })]);
      moveBtn.addEventListener('click', function () {
        openPickMenu(moveBtn, 'نقل المحدد إلى', function (f) {
          var keys = pickedKeys().keys;
          mutate(function (lib) { return { lib: dropTag(addTag(lib, keys, f.id), keys, cur) }; }, function () { picked = {}; showToast('نُقل ' + Object.keys(keys).length + ' إلى «' + f.name + '».'); });
        }, cur);
      });
      bar.appendChild(moveBtn);
      bar.appendChild(el('button', { class: 'btn sm', type: 'button', disabled: !n, onclick: function () {
        var keys = pickedKeys().keys; picked = {};
        mutate(function (lib) { return { lib: dropTag(lib, keys, cur) }; });
      } }, [ic('minus'), el('span', { text: 'إخراج من هذا المجلد' })]));
    }
    bar.appendChild(el('button', { class: 'btn sm', type: 'button', disabled: !n, onclick: function () {
      var sel = items.filter(function (r) { return picked[keyOf(r)]; });
      startDownload(sel, view !== 'all' ? viewName() : '');
    } }, [ic('download-simple'), el('span', { text: 'تنزيل المحدد' })]));
    bar.appendChild(el('button', { class: 'btn sm danger', type: 'button', disabled: !n, onclick: function () { removeReels(Object.keys(pickedKeys().keys)); } }, [ic('trash'), el('span', { text: 'إزالة من المكتبة' })]));
  }
  $('selBtn').addEventListener('click', function () { selectMode = !selectMode; picked = {}; closeMenu(); render(); });

  // ---- remove (with undo)
  function removeReels(keys) {
    if (!keys.length) return;
    var set = {}; keys.forEach(function (k) { set[k] = 1; });
    var removed = [];
    items.forEach(function (r, i) { if (set[keyOf(r)]) removed.push({ item: r, index: i }); });
    if (!removed.length) return;
    undo = removed;
    keys.forEach(function (k) { delete picked[k]; });
    mutate(function (lib) { return { lib: lib.filter(function (r) { return !set[keyOf(r)]; }) }; });
    showToast(removed.length === 1 ? 'أُزيل الريل من المكتبة.' : 'أُزيل ' + removed.length + ' من المكتبة.', 'تراجع', function () {
      if (!undo) return;
      var back = undo; undo = null;
      mutate(function (lib) {
        var have = {}; lib.forEach(function (r) { have[keyOf(r)] = 1; });
        back.forEach(function (u) { if (!have[keyOf(u.item)]) lib.splice(Math.min(u.index, lib.length), 0, u.item); });
        return { lib: lib };
      });
      hideToast();
    });
  }
  function showToast(text, actLabel, act) {
    var t = $('toast'); t.textContent = '';
    t.appendChild(el('span', { text: text }));
    if (actLabel) t.appendChild(el('button', { type: 'button', text: actLabel, onclick: act }));
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() { $('toast').hidden = true; }

  // ---- downloads (background.js does the work: AR_DOWNLOAD → AR_DL_PROGRESS)
  var dlParts = null;
  function startDownload(reels, folderName) {
    if (!reels.length) return;
    if (job && !job.finished) { showToast('يوجد تنزيل جارٍ، انتظر حتى ينتهي.'); return; }
    var clean = reels.map(function (r) { var c = {}; for (var k in r) if (k !== 'transcript') c[k] = r[k]; return c; });
    chrome.runtime.sendMessage({ type: 'AR_DOWNLOAD', reels: clean, folderName: folderName }, function (res) {
      if (chrome.runtime.lastError || !res || !res.ok) { showToast((res && res.error) || 'تعذّر بدء التنزيل.'); return; }
      job = { jobId: res.jobId, name: folderName, done: 0, total: reels.length, failed: [], finished: false };
      drawDl(); render();
    });
  }
  function drawDl() {
    var box = $('dl');
    if (!job) { box.hidden = true; return; }
    box.hidden = false;
    if (!dlParts || dlParts.jobId !== job.jobId || dlParts.finished !== job.finished) {
      box.textContent = '';
      dlParts = { jobId: job.jobId, finished: job.finished, t: el('span', { class: 't' }), fill: el('i'), list: el('ul') };
      var head = el('div', { class: 'head' }, [ic('download-simple'), dlParts.t]);
      if (job.finished) head.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'إغلاق', onclick: function () { job = null; dlParts = null; drawDl(); render(); } }));
      box.appendChild(head);
      box.appendChild(el('div', { class: 'bar' }, [dlParts.fill]));
      box.appendChild(el('div', { class: 'where', text: 'في مجلد التنزيلات: Amine Reels/' + (job.name ? job.name + '/' : '') + ' · بصيغة الملف الأصلية كما يقدّمها إنستغرام' }));
      box.appendChild(dlParts.list);
    }
    var ok = job.done - job.failed.length;
    dlParts.t.textContent = job.finished
      ? (job.failed.length ? 'انتهى التنزيل: نجح ' + ok + ' من ' + job.total + '، وفشل ' + job.failed.length : 'اكتمل التنزيل: ' + job.total + ' من ' + job.total)
      : 'تنزيل ' + Math.min(job.done + 1, job.total) + ' من ' + job.total;
    dlParts.fill.style.width = (job.total ? Math.round(job.done / job.total * 100) : 0) + '%';
    if (dlParts.list.childNodes.length !== job.failed.length) {
      dlParts.list.textContent = '';
      job.failed.forEach(function (f) {
        dlParts.list.appendChild(el('li', null, [el('span', { class: 'c', text: (f.username ? '@' + f.username + ' · ' : '') + f.code }), el('span', { class: 'r', text: f.reason })]));
      });
    }
  }
  chrome.runtime.onMessage.addListener(function (m) {
    if (!m || m.type !== 'AR_DL_PROGRESS' || !job || m.jobId !== job.jobId) return;
    job.done = m.done; job.total = m.total; job.failed = m.failed || []; job.finished = !!m.finished;
    drawDl();
    if (job.finished) render();
  });
  $('dlAll').addEventListener('click', function () { startDownload(filtered(), view !== 'all' ? viewName() : ''); });

  // ---- export
  function download(name, data, type) {
    var url = URL.createObjectURL(new Blob([data], { type: type }));
    var a = el('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function folderNames(r) { return (r.folders || []).map(folderById).filter(Boolean).map(function (f) { return f.name; }); }
  $('exJson').addEventListener('click', function () {
    var list = filtered().map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.folderNames = folderNames(r); return c; });
    download('amine-reels-' + stamp() + '.json', JSON.stringify(list, null, 2), 'application/json');
  });
  $('exCsv').addEventListener('click', function () {
    var cols = ['platform', 'username', 'code', 'url', 'views', 'likes', 'comments', 'outlier', 'publishedAt', 'duration', 'caption', 'savedAt', 'folders', 'transcript'];
    function cell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = filtered().map(function (r) {
      return [r.platform, r.username, r.code, r.url, r.views, r.likes, r.comments, r.outlier, r.takenAt ? iso(r.takenAt * 1000) : '', r.duration,
        r.caption, iso(r.savedAt), folderNames(r).join(' | '), r.transcript ? (r.transcript.segments && r.transcript.segments.length
          ? r.transcript.segments.map(function (s) { return '[' + fmtTime(s.start) + '] ' + s.text; }).join('\n') : r.transcript.text) : ''].map(cell).join(',');
    });
    download('amine-reels-' + stamp() + '.csv', '﻿' + cols.join(',') + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
  });

  $('q').addEventListener('input', render);
  $('sort').addEventListener('change', render);
  load();
})();
