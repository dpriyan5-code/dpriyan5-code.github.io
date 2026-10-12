/* App shell: helpers, router, top bar, bottom navigation, toasts, file sharing. */
(function (G) {
  'use strict';
  var U = G.REP.util;

  function h(v) { return v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayIso() { return U.iso(new Date()); }

  var debTimers = {}, debFns = {};
  function debounce(key, fn, ms) {
    clearTimeout(debTimers[key]); debFns[key] = fn;
    debTimers[key] = setTimeout(function () { delete debFns[key]; fn(); }, ms || 350);
  }
  // Save anything still waiting when the phone hides or closes the app.
  function flushPending() { Object.keys(debFns).forEach(function (k) { clearTimeout(debTimers[k]); var f = debFns[k]; delete debFns[k]; f(); }); }
  window.addEventListener('pagehide', flushPending);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushPending(); });

  function toast(msg, bad) {
    var box = $('#toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
    box.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 4500 : 2400);
  }
  function flashSaved() { var s = $('#savedot'); if (s) { s.textContent = '✓ saved'; clearTimeout(flashSaved.t); flashSaved.t = setTimeout(function () { s.textContent = ''; }, 1400); } }

  // ---- app state
  var state = {
    date: (function () { try { return sessionStorage.getItem('ghd_date') || todayIso(); } catch (e) { return todayIso(); } })(),
    month: null,
  };
  function setDate(d) { state.date = d; try { sessionStorage.setItem('ghd_date', d); } catch (e) { /* ignore */ } }
  function user() { try { return JSON.parse(localStorage.getItem('ghd_user') || 'null'); } catch (e) { return null; } }
  function setUser(u) { try { localStorage.setItem('ghd_user', JSON.stringify(u)); } catch (e) { /* ignore */ } G.DB.setUser(u ? u.name : ''); }
  function defaultMonth() {
    var d = new Date(); if (d.getDate() <= 7) d.setMonth(d.getMonth() - 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  }

  // ---- layout
  function topbar(title, sub, back) {
    return '<div class="top"><div class="row">' +
      (back ? '<button class="back" data-go="' + h(back) + '" aria-label="Back"><svg viewBox="0 0 24 24" class="ico"><path d="M15 5l-7 7 7 7"/></svg></button>' : '<div class="mono">GH</div>') +
      '<div class="t"><b>' + h(title) + '</b><small>' + h(sub || '') + '</small></div><span class="savedot" id="savedot"></span></div></div>';
  }
  // Line icons (24×24, stroke = currentColor)
  var IC = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    op: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-2M20 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    bed: 'M3 7v13M3 14h18v6M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
    emg: 'M3 16V8h10v8M13 10h4l4 4v2H13M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 10v4M6 12h4',
    ot: 'M4 20l9-9M14 4l6 6-5 5-6-6zM9 9l-4 4',
    lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
    kpi: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
    fund: 'M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
    hmis: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    att: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a6 6 0 0 1 12 0M16 11l2 2 4-4',
    clean: 'M14 3l-3 9M8 12h8l2 9H6zM10 16v5M14 16v5',
    chk: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 13l3 3 5-6',
    regs: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
    doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
    rx: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
    pill: 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM8.5 8.5l7 7',
    office: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h.01M12 11h.01M16 11h.01',
    msg: 'M4 5h16v11H9l-5 4z',
    report: 'M4 4h16v16H4zM8 16v-3M12 16V8M16 16v-5',
    share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    heart: 'M12 20s-7-4.4-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.6-9 9-9 9zM3 12h4l2-3 3 6 2-3h7',
    fever: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v8',
    ref: 'M4 12h12M12 6l6 6-6 6M20 4v16',
  };
  function icon(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (IC[name] || IC.doc) + '"/></svg>'; }

  var NAV = [['home', 'home', 'Home'], ['msg', 'msg', 'Message'], ['reports', 'report', 'Reports'], ['import', 'upload', 'Upload'], ['settings', 'settings', 'Settings']];
  function nav(active) {
    return '<nav class="nav noprint">' + NAV.map(function (n) {
      return '<a href="#' + n[0] + '" class="' + (active === n[0] ? 'on' : '') + '">' + icon(n[1]) + n[2] + '</a>';
    }).join('') + '</nav>';
  }
  // Side menu for laptops / desktops (hidden on phones)
  var SIDE = [
    ['', [['home', 'home', 'Home'], ['msg', 'msg', 'Daily WhatsApp report']]],
    ['Daily entry', [['day/op', 'op', 'OP census'], ['day/ip', 'bed', 'IP & wards'], ['day/emg', 'emg', 'Emergency / TAEI'], ['day/ot', 'ot', 'OT & labour'], ['day/svc', 'lab', 'Lab, fever, NCD, MCH'],
      ['day/hmis', 'hmis', 'HMIS & ABHA'], ['day/qa', 'kpi', 'Quality KPI'], ['day/admin', 'fund', 'Funds'], ['att', 'att', 'Attendance'], ['clean', 'clean', 'Housekeeping & BMW'], ['chk', 'chk', 'EMO checklist']]],
    ['Records', [['regs', 'regs', 'Case registers'], ['forms/ref', 'ref', 'Referral form'], ['referrals', 'ref', 'Referral follow-up'], ['forms/ds', 'doc', 'Discharge summary'], ['forms/preauth', 'rx', 'CMCHIS pre-auth'], ['pharm', 'pill', 'VED drug indent'], ['office', 'office', 'Licences & office']]],
    ['Reports', [['reports', 'report', 'Monthly reports'], ['ncd', 'heart', 'NCD monthly form'], ['import', 'upload', 'Upload & Excel forms'], ['sync', 'share', 'Share & backup'], ['settings', 'settings', 'Settings']]],
    ['CMO / Admin', [['admin', 'office', 'CMO sign-in'], ['audit', 'regs', 'Corrections log']]],
  ];
  function side() {
    var cur = location.hash.replace(/^#/, '') || 'home', u = user();
    return '<aside class="side noprint"><div class="brand"><div class="mono">GH</div><div><b>' + h(G.REP.settings().short) + '</b><small>Daybook</small></div></div>' +
      SIDE.map(function (g) {
        return (g[0] ? '<div class="sh">' + g[0] + '</div>' : '') + g[1].map(function (n) {
          var on = cur === n[0] || (n[0] !== 'home' && cur.indexOf(n[0] + '/') === 0);
          var lock = G.AUTH && !G.AUTH.isAdmin() && !G.AUTH.allow(n[0].split('/'));
          return '<a href="#' + n[0] + '" class="' + (on ? 'on' : '') + (lock ? ' locked' : '') + '">' + icon(n[1]) + '<span>' + n[2] + '</span>' + (lock ? '<em>CMO</em>' : '') + '</a>';
        }).join('');
      }).join('') + (u ? '<a class="who" href="#setup">' + icon('user') + '<span>' + h(u.name) + (G.AUTH && G.AUTH.isAdmin() ? ' · CMO signed in' : '') + '</span></a>' : '') + '</aside>';
  }
  function datebar() {
    return '<div class="datebar noprint"><button data-dshift="-1" aria-label="Previous day">◀</button>' +
      '<input type="date" id="datepick" value="' + h(state.date) + '"><span class="dw">' + U.dow(state.date) + '</span>' +
      '<button data-dshift="1" aria-label="Next day">▶</button></div>';
  }
  function monthbar(y, m) {
    return '<div class="datebar noprint"><button data-mshift="-1" aria-label="Previous month">◀</button>' +
      '<input type="month" id="monthpick" value="' + y + '-' + U.pad(m) + '"><button data-mshift="1" aria-label="Next month">▶</button></div>';
  }
  function render(html, active) {
    // fresh node each time so listeners added by the previous screen are dropped
    var old = $('#app'), app = old.cloneNode(false);
    old.replaceWith(app);
    app.innerHTML = (active === false ? html : side() + '<main class="main">' + html + '</main>' + nav(active));
    app.className = active === false ? '' : 'shell';
    window.scrollTo(0, 0);
  }

  // ---- router
  var routes = {};
  function route(name, fn) { routes[name] = fn; }
  function go(hash) { if (location.hash === '#' + hash) dispatch(); else location.hash = hash; }
  function dispatch() {
    var parts = (location.hash.replace(/^#/, '') || 'home').split('/').map(decodeURIComponent);
    if (!user() && parts[0] !== 'setup') { parts = ['setup']; }
    if (G.AUTH && !G.AUTH.allow(parts)) { G.AUTH.denied(parts); return; }
    var fn = routes[parts[0]] || routes.home;
    try { fn.apply(null, parts.slice(1)); } catch (e) { console.error(e); render(topbar('Something went wrong', '') + '<div class="wrap"><div class="note bad">' + h(e.message) + '</div><a class="btn pri" href="#home">Go home</a></div>', 'home'); }
  }

  // Enter in a number box jumps to the next box (fast keyboard entry on desktop)
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.matches('input[type=number], input[type=text][data-k]')) return;
    var all = $$('input[type=number], input[data-k], select[data-k]').filter(function (x) { return x.offsetParent; });
    var i = all.indexOf(e.target); if (i >= 0 && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); if (all[i + 1].select) all[i + 1].select(); }
  });
  // global clicks for date/month bars and data-go
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-dshift],[data-mshift]'); if (!t) return;
    if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); return; }
    if (t.dataset.dshift) { setDate(U.addDays(state.date, +t.dataset.dshift)); dispatch(); return; }
    if (t.dataset.mshift) {
      var mm = state.month || defaultMonth(); var d = new Date(mm.y, mm.m - 1 + (+t.dataset.mshift), 1);
      state.month = { y: d.getFullYear(), m: d.getMonth() + 1 }; dispatch();
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'datepick' && e.target.value) { setDate(e.target.value); dispatch(); }
    if (e.target.id === 'monthpick' && e.target.value) { var p = e.target.value.split('-'); state.month = { y: +p[0], m: +p[1] }; dispatch(); }
  });

  // ---- files
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  // Share a file through the phone's share sheet (WhatsApp, Gmail, Drive …); falls back to download.
  function shareFile(blob, name, text) {
    try {
      var file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: name, text: text || '' }).catch(function (e) { if (e && e.name !== 'AbortError') download(blob, name); });
      }
    } catch (e) { /* fall through */ }
    download(blob, name);
    return Promise.resolve();
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { toast('Copied – paste it in WhatsApp'); }, fallback);
    fallback();
    return Promise.resolve();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed – select the text and copy', true); } ta.remove();
    }
  }
  function shareText(text) {
    if (navigator.share) return navigator.share({ text: text }).catch(function () { /* cancelled */ });
    return copyText(text);
  }
  function whatsapp(text) { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }

  // render a report sheet spec as an HTML table
  function sheetHtml(spec) {
    var maxc = spec.rows.reduce(function (a, r) { return Math.max(a, (r || []).length); }, 0);
    var out = ['<div class="tblwrap"><table class="rep">'];
    spec.rows.forEach(function (r) {
      out.push('<tr>');
      if (!r || !r.length) { out.push('<td class="s0" colspan="' + maxc + '">&nbsp;</td>'); }
      else r.forEach(function (c, i) {
        var v = c && typeof c === 'object' ? c.v : c, s = c && typeof c === 'object' ? (c.s || 0) : 0;
        var span = (i === r.length - 1 && (s === 3 || s === 1 || s === 0) && r.length === 1) ? ' colspan="' + maxc + '"' : '';
        out.push('<td class="s' + s + '"' + span + '>' + h(v == null ? '' : v) + '</td>');
      });
      out.push('</tr>');
    });
    out.push('</table></div>');
    return out.join('');
  }

  function sha256(text) {
    if (G.crypto && crypto.subtle && G.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      });
    }
    var hsh = 5381; for (var i = 0; i < text.length; i++) hsh = ((hsh << 5) + hsh + text.charCodeAt(i)) | 0;
    return Promise.resolve('d' + (hsh >>> 0).toString(16));
  }

  G.UI = {
    h: h, $: $, $$: $$, uid: uid, todayIso: todayIso, debounce: debounce, toast: toast, flashSaved: flashSaved, state: state, setDate: setDate,
    user: user, setUser: setUser, defaultMonth: defaultMonth, topbar: topbar, nav: nav, datebar: datebar, monthbar: monthbar, render: render,
    route: route, go: go, dispatch: dispatch, download: download, shareFile: shareFile, copyText: copyText, shareText: shareText, whatsapp: whatsapp,
    sheetHtml: sheetHtml, sha256: sha256, icon: icon, util2: U,
  };
})(window);
