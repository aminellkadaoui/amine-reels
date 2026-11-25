/* Strings for popup, library, research pages — owner: pages agent.
 * Also defines window.ARP (helpers shared by the three pages):
 *   ARP.plural(key, n)   word form for n ('a|b|c|d' Arabic: 1 / 2 / 3–10 / 11+; 'one|other' English)
 *   ARP.count(key, n)    'n word'
 *   ARP.relTime(ts, empty)  relative time from unix seconds ('قبل 3 أيام' / '3 days ago'); empty → returned when ts is falsy
 *   ARP.fmtNum(n)        1.6M / 93.2K / hidden
 *   ARP.wire(render)     apply(document) once the language is loaded and on every change, then call render()
 */
(function () {
  'use strict';
  var I = window.ARI18N;
  if (!I) return;
  I.add({
    ar: {
      // common
      'c.app': 'تحليل الريلز', 'c.hidden': 'مخفية', 'c.now': 'الآن', 'c.ago': 'قبل {t}',
      'c.u.year': 'سنة|سنتين|سنوات|سنة', 'c.u.month': 'شهر|شهرين|أشهر|شهرًا', 'c.u.week': 'أسبوع|أسبوعين|أسابيع|أسبوعًا',
      'c.u.day': 'يوم|يومين|أيام|يومًا', 'c.u.hour': 'ساعة|ساعتين|ساعات|ساعة', 'c.u.minute': 'دقيقة|دقيقتين|دقائق|دقيقة',
      'c.cancel': 'إلغاء', 'c.undo': 'تراجع', 'c.all': 'الكل', 'c.close': 'إغلاق', 'c.save': 'حفظ',
      'c.openIg': 'فتح في إنستغرام', 'c.views': 'المشاهدات', 'c.likes': 'الإعجابات', 'c.comments': 'التعليقات',
      'c.shares': 'المشاركات', 'c.outlier': 'نقاط التميّز', 'c.takenAt': 'تاريخ النشر', 'c.reels': 'ريل|ريلز|ريلز|ريلز',
      'c.dlRoot': 'تحليل الريلز', 'c.removeLib': 'إزالة من المكتبة',

      // popup
      'p.checking': 'جارٍ فحص الصفحة…', 'p.updDl': 'صفحة التحميل', 'p.updNew': 'نسخة جديدة {v} متاحة',
      'p.updHint': 'للتحديث: نزّل النسخة الجديدة، وضعها مكان مجلد الإضافة القديم، ثم اضغط زر إعادة التحميل في صفحة الإضافات (chrome://extensions).',
      'p.openGrid': 'افتح شبكة الريلز', 'p.library': 'المكتبة', 'p.research': 'تحليل المحتوى', 'p.vc': 'التحكم في الفيديو',
      'p.back5': 'رجوع 5 ثوانٍ', 'p.frameBack': 'إطار للخلف', 'p.playPause': 'تشغيل / إيقاف', 'p.frameFwd': 'إطار للأمام',
      'p.fwd5': 'تقديم 5 ثوانٍ', 'p.slower': 'أبطأ', 'p.faster': 'أسرع', 'p.normal': 'سرعة عادية', 'p.mute': 'كتم',
      'p.shortcuts': 'الاختصارات', 'p.kSeek': 'رجوع / تقديم 5 ثوانٍ', 'p.kFrame': 'فريم للخلف / للأمام (مع Shift: 10)', 'p.kReel': 'الريل السابق / التالي', 'p.kSpeed': 'أبطأ / أسرع',
      'p.kMute': 'كتم الصوت', 'p.kGrid': 'فتح شبكة الريلز',
      'p.noteA': 'في عارض الريل:', 'p.noteB': 'للريل التالي والسابق، و', 'p.noteC': 'للإغلاق.',
      'p.lang': 'اللغة', 'p.langAuto': 'تلقائي',
      'p.onlyIg': 'الإضافة تعمل في إنستغرام فقط. افتح إنستغرام لاستعمالها.', 'p.notReady': 'لم تجهز الصفحة بعد. أعد تحميلها.',
      'p.reload': 'أعد تحميل الصفحة لتعمل الإضافة فيها.', 'p.reloadRetry': 'أعد تحميل الصفحة ثم جرّب مرة أخرى.', 'p.ig': 'إنستغرام',
      'p.kind.reel': 'صفحة ريل', 'p.kind.profile': 'صفحة حساب', 'p.kind.feed': 'خلاصة الريلز', 'p.kind.other': 'صفحة أخرى',
      'p.noVideo': 'لا يوجد فيديو ظاهر في هذه الصفحة.', 'p.noVideo2': 'لا يوجد فيديو في هذه الصفحة، أو تحتاج إلى إعادة تحميلها.',

      // library
      'l.title': 'المكتبة · تحليل الريلز', 'l.h1': 'المكتبة', 'l.search': 'ابحث في الحساب أو الوصف أو النص', 'l.sSaved': 'تاريخ الحفظ',
      'l.select': 'تحديد', 'l.selectEnd': 'إنهاء التحديد', 'l.dlAll': 'تنزيل الكل', 'l.dlShown': 'تنزيل الظاهر ({n})',
      'l.savedN': 'ريل محفوظ|ريلز محفوظة|ريلز محفوظة|ريلز محفوظة', 'l.foldersN': 'مجلد|مجلدات|مجلدات|مجلدات', 'l.showing': 'يظهر {n} من {m}',
      'l.emptyLib': 'لا توجد ريلز محفوظة بعد. اضغط «حفظ» في عارض الريل لتظهر هنا.',
      'l.emptyFolder': 'هذا المجلد فارغ. أضف إليه ريلز من «الكل» بزر «إضافة إلى مجلد».', 'l.noResults': 'لا توجد نتائج لهذا البحث.',
      'l.folders': 'المجلدات', 'l.newFolder': 'مجلد جديد', 'l.create': 'إنشاء', 'l.rename': 'إعادة تسمية', 'l.delFolder': 'حذف المجلد',
      'l.folderName': 'اسم المجلد', 'l.errName': 'اكتب اسم المجلد.', 'l.errExists': 'يوجد مجلد بهذا الاسم.',
      'l.delQ': 'حذف المجلد «{name}»؟', 'l.delKeep': 'الريلز ({n}) تبقى في المكتبة.', 'l.delEmpty': 'المجلد فارغ.', 'l.del': 'حذف',
      'l.openReel': 'فتح الريل', 'l.hasTx': 'محفوظ مع النص', 'l.tx': 'نص', 'l.copyTx': 'نسخ النص', 'l.noTx': 'لم يُحفظ نص لهذا الريل', 'l.copied': 'نُسخ',
      'l.addToFolder': 'إضافة إلى مجلد', 'l.dlOrig': 'تنزيل الملف الأصلي', 'l.dates': 'نُشر {a} · حُفظ {b}',
      'l.noFolders': 'لا توجد مجلدات بعد.', 'l.noOther': 'لا توجد مجلدات أخرى.', 'l.createAdd': 'إنشاء وإضافة',
      'l.picked': 'تم تحديد {n}', 'l.pickHint': 'اضغط على الريلز لتحديدها', 'l.unpickAll': 'إلغاء تحديد الكل', 'l.pickAll': 'تحديد الكل',
      'l.addPickedTo': 'إضافة المحدد إلى', 'l.added': 'أُضيف {n} إلى «{name}».', 'l.move': 'نقل إلى مجلد', 'l.movePickedTo': 'نقل المحدد إلى',
      'l.moved': 'نُقل {n} إلى «{name}».', 'l.takeOut': 'إخراج من هذا المجلد', 'l.dlPicked': 'تنزيل المحدد',
      'l.removed1': 'أُزيل الريل من المكتبة.', 'l.removedN': 'أُزيل {n} من المكتبة.',
      'l.dlBusy': 'يوجد تنزيل جارٍ، انتظر حتى ينتهي.', 'l.dlFail': 'تعذّر بدء التنزيل.',
      'l.where': 'في مجلد التنزيلات: {dir} · بصيغة الملف الأصلية كما يقدّمها إنستغرام',
      'l.dlDoneFail': 'انتهى التنزيل: نجح {ok} من {total}، وفشل {failed}', 'l.dlDone': 'اكتمل التنزيل: {total} من {total}', 'l.dlProg': 'تنزيل {i} من {total}',

      // research
      'r.title': 'تحليل المحتوى — تحليل الريلز', 'r.h1': 'تحليل المحتوى', 'r.refreshAll': 'تحديث الكل', 'r.exCsv': 'تصدير CSV',
      'r.accounts': 'الحسابات', 'r.addBtn': 'إضافة وجلب', 'r.stop': 'إيقاف',
      'r.hint': 'اكتب اسم المستخدم أو رابط الحساب. يمكنك لصق عدة حسابات معًا، تفصل بينها مسافة أو فاصلة أو سطر جديد.',
      'r.sort': 'الترتيب', 'r.oShareRate': 'نسبة المشاركة (من المشاهدات)', 'r.oShareOutlier': 'تميّز المشاركات', 'r.oReposts': 'إعادة النشر', 'r.oNewest': 'الأحدث',
      'r.outlierLb': 'التميّز', 'r.x2': '2× فأكثر', 'r.x3': '3× فأكثر', 'r.x5': '5× فأكثر', 'r.x10': '10× فأكثر',
      'r.period': 'الفترة', 'r.p30': 'آخر 30 يومًا', 'r.p90': 'آخر 90 يومًا', 'r.p365': 'آخر سنة', 'r.pRange': 'من تاريخ إلى تاريخ',
      'r.from': 'من', 'r.to': 'إلى', 'r.perAcc': 'لكل حساب', 'r.l30': '30 ريل', 'r.l60': '60 ريل', 'r.l120': '120 ريل', 'r.lAll': 'كل الريلز',
      'r.lCustom': 'مخصص…', 'r.count': 'العدد',
      'r.errNoTab': 'لم يستجب تبويب إنستغرام. افتح instagram.com في تبويب ثم أعد المحاولة.', 'r.noReply': 'لم يصل رد من تبويب إنستغرام.',
      'r.timeout': 'انتهت مهلة الجلب.', 'r.disconnected': 'انقطع الاتصال بتبويب إنستغرام.', 'r.preparing': 'يجهّز تبويب إنستغرام…',
      'r.tabNoAnswer': 'لم يستجب تبويب إنستغرام.', 'r.fetchFail': 'تعذّر الجلب.',
      'r.rateStop': 'توقّف الجلب: إنستغرام أوقف الطلبات مؤقتًا بسبب كثرتها. حُفظ ما جُلب ({ok} من {total}). انتظر بضع دقائق ثم اضغط «تحديث» للبقية.',
      'r.stopped': 'أوقفتَ الجلب. حُفظ ما جُلب ({ok} من {total}).', 'r.done': 'اكتمل الجلب: {ok} من {total}.', 'r.finished': 'انتهى الجلب: نجح {ok} من {total}.',
      'r.partialNote': 'بدون تسجيل الدخول يعطي إنستغرام نحو 12 ريل لكل حساب وبلا تواريخ نشر. سجّل الدخول في إنستغرام بهذا المتصفح ثم حدّث لجلب المزيد.',
      'r.partialFor': 'نتيجة جزئية لـ ', 'r.prog': 'جلب {i} من {n}: @{u}', 'r.live': '{step}: {count} من {limit} ريل', 'r.liveAll': '{step}: {count} ريل',
      'r.stopping': 'يتوقّف بعد الحساب الحالي…', 'r.lookup': 'أتعرّف على أصحاب روابط الريلز ({n})…',
      'r.noName': 'لم أجد اسم مستخدم صالحًا. اكتب مثل: garyvee أو رابط الحساب.', 'r.removedC': 'أُزيل @{u} من القائمة.',
      'r.fetchingNow': 'يجلب الآن…', 'r.queued': 'في الانتظار', 'r.fetchErr': 'تعذّر الجلب', 'r.notFetched': 'لم يُجلب بعد',
      'r.followers': ' متابع · الوسيط ', 'r.reelsDot': ' ريل · ', 'r.updated': 'آخر تحديث {t}', 'r.errPrefix': 'خطأ: ',
      'r.refreshOne': 'تحديث هذا الحساب', 'r.removeAcc': 'إزالة الحساب', 'r.accN': 'حساب|حسابان|حسابات|حسابًا',
      'r.subAll': '{acc} · {n} ريل محفوظ للتحليل', 'r.subEmpty': 'أضف حسابات إنستغرام لترى أفضل ريلزها في قائمة واحدة.',
      'r.shown': ' ريل معروض', 'r.of': ' من ', 'r.vsMedian': ' عن وسيطه', 'r.vsShareMedian': ' عن وسيط مشاركاته', 'r.ofViews': ' من المشاهدات',
      'r.u.views': 'مشاهدة', 'r.u.likes': 'إعجاب', 'r.u.comments': 'تعليق', 'r.u.shares': 'مشاركة', 'r.u.reposts': 'إعادة نشر', 'r.top': 'الأعلى: ',
      'r.noDate': '{n} ريل بلا تاريخ نشر لا تظهر مع فلتر الفترة (سجّل الدخول في إنستغرام لجلب التواريخ).',
      'r.noDateSort': 'بعض الريلز بلا تاريخ، فتظهر في آخر الترتيب.',
      'r.noShares': 'الريلز التي لم يرسل إنستغرام عدد مشاركاتها تظهر في آخر الترتيب (حدّث الحساب لجلبه).',
      'r.emptyNone': 'لا توجد حسابات بعد. اكتب أسماء المستخدمين في الأعلى ثم اضغط «إضافة وجلب».',
      'r.emptyUnfetched': 'لم تُجلب ريلز بعد. اضغط «تحديث الكل».', 'r.emptyFilter': 'لا توجد ريلز تطابق هذه الفلاتر.',
      'r.saved': 'محفوظ', 'r.saveLib': 'حفظ في المكتبة', 'r.openReelIg': 'فتح الريل في إنستغرام',
      'r.outlierTip': 'نقاط التميّز: المشاهدات ÷ وسيط الحساب', 'r.sharesTip': 'المشاركات ({p} من المشاهدات)',
      'r.posted': 'نُشر {t}', 'r.noDateCard': 'تاريخ النشر غير معروف',
      'r.limitMsg': 'الحد الجديد ({n} ريل لكل حساب) يُطبَّق في الجلب القادم. اضغط «تحديث الكل» لتطبيقه الآن.'
    },
    en: {
      'c.app': 'Reels Analysis', 'c.hidden': 'hidden', 'c.now': 'just now', 'c.ago': '{t} ago',
      'c.u.year': 'year|years', 'c.u.month': 'month|months', 'c.u.week': 'week|weeks',
      'c.u.day': 'day|days', 'c.u.hour': 'hour|hours', 'c.u.minute': 'minute|minutes',
      'c.cancel': 'Cancel', 'c.undo': 'Undo', 'c.all': 'All', 'c.close': 'Close', 'c.save': 'Save',
      'c.openIg': 'Open in Instagram', 'c.views': 'Views', 'c.likes': 'Likes', 'c.comments': 'Comments',
      'c.shares': 'Shares', 'c.outlier': 'Outlier score', 'c.takenAt': 'Publish date', 'c.reels': 'reel|reels',
      'c.dlRoot': 'Reels Analysis', 'c.removeLib': 'Remove from library',

      'p.checking': 'Checking this page…', 'p.updDl': 'Download page', 'p.updNew': 'New version {v} available',
      'p.updHint': 'To update: download the new version, put it in place of the old extension folder, then press Reload on the extensions page (chrome://extensions).',
      'p.openGrid': 'Open reels grid', 'p.library': 'Library', 'p.research': 'Content research', 'p.vc': 'Video control',
      'p.back5': 'Back 5 seconds', 'p.frameBack': 'Previous frame', 'p.playPause': 'Play / pause', 'p.frameFwd': 'Next frame',
      'p.fwd5': 'Forward 5 seconds', 'p.slower': 'Slower', 'p.faster': 'Faster', 'p.normal': 'Normal speed', 'p.mute': 'Mute',
      'p.shortcuts': 'Shortcuts', 'p.kSeek': 'Back / forward 5 seconds', 'p.kFrame': 'Previous / next frame (Shift: 10)', 'p.kReel': 'Previous / next reel', 'p.kSpeed': 'Slower / faster',
      'p.kMute': 'Mute', 'p.kGrid': 'Open reels grid',
      'p.noteA': 'In the reel viewer:', 'p.noteB': 'next / previous reel, ', 'p.noteC': 'to close.',
      'p.lang': 'Language', 'p.langAuto': 'Auto',
      'p.onlyIg': 'The extension works on Instagram only. Open Instagram to use it.', 'p.notReady': 'The page isn’t ready yet. Reload it.',
      'p.reload': 'Reload the page to use the extension on it.', 'p.reloadRetry': 'Reload the page, then try again.', 'p.ig': 'Instagram',
      'p.kind.reel': 'Reel page', 'p.kind.profile': 'Profile page', 'p.kind.feed': 'Reels feed', 'p.kind.other': 'Other page',
      'p.noVideo': 'No visible video on this page.', 'p.noVideo2': 'No video on this page, or the page needs a reload.',

      'l.title': 'Library · Reels Analysis', 'l.h1': 'Library', 'l.search': 'Search accounts, captions or transcripts', 'l.sSaved': 'Date saved',
      'l.select': 'Select', 'l.selectEnd': 'Done selecting', 'l.dlAll': 'Download all', 'l.dlShown': 'Download shown ({n})',
      'l.savedN': 'saved reel|saved reels', 'l.foldersN': 'folder|folders', 'l.showing': 'Showing {n} of {m}',
      'l.emptyLib': 'No saved reels yet. Press “Save” in the reel viewer and they show up here.',
      'l.emptyFolder': 'This folder is empty. Add reels from “All” with “Add to folder”.', 'l.noResults': 'No results for this search.',
      'l.folders': 'Folders', 'l.newFolder': 'New folder', 'l.create': 'Create', 'l.rename': 'Rename', 'l.delFolder': 'Delete folder',
      'l.folderName': 'Folder name', 'l.errName': 'Enter a folder name.', 'l.errExists': 'A folder with this name already exists.',
      'l.delQ': 'Delete folder “{name}”?', 'l.delKeep': 'Its reels ({n}) stay in the library.', 'l.delEmpty': 'The folder is empty.', 'l.del': 'Delete',
      'l.openReel': 'Open reel', 'l.hasTx': 'Saved with transcript', 'l.tx': 'Text', 'l.copyTx': 'Copy transcript', 'l.noTx': 'No transcript saved for this reel', 'l.copied': 'Copied',
      'l.addToFolder': 'Add to folder', 'l.dlOrig': 'Download original file', 'l.dates': 'Posted {a} · saved {b}',
      'l.noFolders': 'No folders yet.', 'l.noOther': 'No other folders.', 'l.createAdd': 'Create and add',
      'l.picked': '{n} selected', 'l.pickHint': 'Click reels to select them', 'l.unpickAll': 'Deselect all', 'l.pickAll': 'Select all',
      'l.addPickedTo': 'Add selected to', 'l.added': 'Added {n} to “{name}”.', 'l.move': 'Move to folder', 'l.movePickedTo': 'Move selected to',
      'l.moved': 'Moved {n} to “{name}”.', 'l.takeOut': 'Remove from this folder', 'l.dlPicked': 'Download selected',
      'l.removed1': 'Reel removed from the library.', 'l.removedN': 'Removed {n} from the library.',
      'l.dlBusy': 'A download is already running. Wait until it finishes.', 'l.dlFail': 'Couldn’t start the download.',
      'l.where': 'In your Downloads folder: {dir} · original file format, as Instagram serves it',
      'l.dlDoneFail': 'Download finished: {ok} of {total} done, {failed} failed', 'l.dlDone': 'Download complete: {total} of {total}', 'l.dlProg': 'Downloading {i} of {total}',

      'r.title': 'Content research — Reels Analysis', 'r.h1': 'Content research', 'r.refreshAll': 'Refresh all', 'r.exCsv': 'Export CSV',
      'r.accounts': 'Accounts', 'r.addBtn': 'Add & fetch', 'r.stop': 'Stop',
      'r.hint': 'Type a username or profile link. Paste several accounts at once, separated by spaces, commas or new lines.',
      'r.sort': 'Sort', 'r.oShareRate': 'Share rate (of views)', 'r.oShareOutlier': 'Share outlier', 'r.oReposts': 'Reposts', 'r.oNewest': 'Newest',
      'r.outlierLb': 'Outlier', 'r.x2': '2× or more', 'r.x3': '3× or more', 'r.x5': '5× or more', 'r.x10': '10× or more',
      'r.period': 'Period', 'r.p30': 'Last 30 days', 'r.p90': 'Last 90 days', 'r.p365': 'Last year', 'r.pRange': 'Date range',
      'r.from': 'From', 'r.to': 'To', 'r.perAcc': 'Per account', 'r.l30': '30 reels', 'r.l60': '60 reels', 'r.l120': '120 reels', 'r.lAll': 'All reels',
      'r.lCustom': 'Custom…', 'r.count': 'Count',
      'r.errNoTab': 'The Instagram tab didn’t respond. Open instagram.com in a tab and try again.', 'r.noReply': 'No reply from the Instagram tab.',
      'r.timeout': 'Fetching timed out.', 'r.disconnected': 'Lost the connection to the Instagram tab.', 'r.preparing': 'Preparing an Instagram tab…',
      'r.tabNoAnswer': 'The Instagram tab didn’t respond.', 'r.fetchFail': 'Couldn’t fetch.',
      'r.rateStop': 'Fetching stopped: Instagram paused requests for now (too many requests). Kept what was fetched ({ok} of {total}). Wait a few minutes, then press “Refresh” for the rest.',
      'r.stopped': 'You stopped fetching. Kept what was fetched ({ok} of {total}).', 'r.done': 'Fetch complete: {ok} of {total}.', 'r.finished': 'Fetch finished: {ok} of {total} succeeded.',
      'r.partialNote': 'When logged out, Instagram gives about 12 reels per account and no publish dates. Log in to Instagram in this browser, then refresh to get more.',
      'r.partialFor': 'Partial result for ', 'r.prog': 'Fetching {i} of {n}: @{u}', 'r.live': '{step}: {count} of {limit} reels', 'r.liveAll': '{step}: {count} reels',
      'r.stopping': 'Stopping after the current account…', 'r.lookup': 'Finding the owners of the reel links ({n})…',
      'r.noName': 'No valid username found. Type something like garyvee, or a profile link.', 'r.removedC': 'Removed @{u} from the list.',
      'r.fetchingNow': 'Fetching…', 'r.queued': 'Queued', 'r.fetchErr': 'Fetch failed', 'r.notFetched': 'Not fetched yet',
      'r.followers': ' followers · median ', 'r.reelsDot': ' reels · ', 'r.updated': 'updated {t}', 'r.errPrefix': 'Error: ',
      'r.refreshOne': 'Refresh this account', 'r.removeAcc': 'Remove account', 'r.accN': 'account|accounts',
      'r.subAll': '{acc} · {n} reels saved for research', 'r.subEmpty': 'Add Instagram accounts to see their best reels in one list.',
      'r.shown': ' reels shown', 'r.of': ' of ', 'r.vsMedian': ' vs. their median', 'r.vsShareMedian': ' vs. their median shares', 'r.ofViews': ' of views',
      'r.u.views': 'views', 'r.u.likes': 'likes', 'r.u.comments': 'comments', 'r.u.shares': 'shares', 'r.u.reposts': 'reposts', 'r.top': 'Top: ',
      'r.noDate': '{n} reels without a publish date are hidden by the period filter (log in to Instagram to get dates).',
      'r.noDateSort': 'Some reels have no date, so they come last.',
      'r.noShares': 'Reels whose share count Instagram didn’t send come last (refresh the account to get it).',
      'r.emptyNone': 'No accounts yet. Type usernames above, then press “Add & fetch”.',
      'r.emptyUnfetched': 'No reels fetched yet. Press “Refresh all”.', 'r.emptyFilter': 'No reels match these filters.',
      'r.saved': 'Saved', 'r.saveLib': 'Save to library', 'r.openReelIg': 'Open reel in Instagram',
      'r.outlierTip': 'Outlier score: views ÷ the account’s median', 'r.sharesTip': 'Shares ({p} of views)',
      'r.posted': 'Posted {t}', 'r.noDateCard': 'Publish date unknown',
      'r.limitMsg': 'The new limit ({n} reels per account) applies on the next fetch. Press “Refresh all” to apply it now.'
    }
  });

  function plural(key, n) {
    var f = String(I.t(key)).split('|');
    if (I.lang() === 'ar') return f[n === 1 ? 0 : n === 2 ? 1 : (n >= 3 && n <= 10) ? 2 : 3] || f[f.length - 1];
    return n === 1 ? f[0] : (f[1] || f[0]);
  }
  var UNITS = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  function relTime(ts, empty) {
    if (!ts) return empty == null ? '' : empty;
    var d = Math.max(0, Date.now() / 1000 - ts);
    for (var i = 0; i < UNITS.length; i++) {
      if (d < UNITS[i][0]) continue;
      var n = Math.floor(d / UNITS[i][0]), w = plural('c.u.' + UNITS[i][1], n);
      // Arabic: «قبل سنة» / «قبل سنتين» carry no number
      var t = I.lang() === 'ar' && n <= 2 ? w : n + ' ' + w;
      return I.t('c.ago', { t: t });
    }
    return I.t('c.now');
  }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (n < 0) return I.t('c.hidden');
    function f(x) { var s = x.toFixed(1); return s.slice(-2) === '.0' ? s.slice(0, -2) : s; }
    if (n >= 1e9) return f(n / 1e9) + 'B';
    if (n >= 1e6) return f(n / 1e6) + 'M';
    if (n >= 1e3) return f(n / 1e3) + 'K';
    return String(Math.round(n));
  }
  function wire(render) {
    function go() { I.apply(document); try { if (render) render(); } catch (e) { console.error('[Reels Analysis]', e); } }
    I.onChange(go);
    return I.ready.then(go);
  }
  window.ARP = { plural: plural, count: function (key, n) { return (I.lang() === 'ar' && (n === 1 || n === 2)) ? plural(key, n) : n + ' ' + plural(key, n); }, relTime: relTime, fmtNum: fmtNum, wire: wire };
})();
