/* Daily WhatsApp message, monthly reports (screen / Excel / PDF), share & backup, settings, PIN lock, demo data. */
(function (G) {
  'use strict';
  var UI = G.UI, DB = G.DB, REP = G.REP, SC = G.DB_SCHEMA, X = G.XLSX, U = REP.util, h = UI.h;

  // ---------------- daily message
  UI.route('msg', function (mode) {
    mode = mode || 'day';
    var pref = {}; try { pref = JSON.parse(localStorage.getItem('ghd_msgpref') || '{}'); } catch (e) { /* ignore */ }
    var secs = pref.secs || { census: 1, emg: 1, ot: 1, svc: 1, att: 1, clean: 1 };
    if (!G.AUTH.isAdmin()) secs = Object.assign({}, secs, { att: 0 }); // attendance is CMO-only
    var skip = pref.skip !== false, warn = !!pref.warn;
    var LBL0 = [['census', 'OP & IP'], ['emg', 'Emergency / TAEI'], ['ot', 'OT & labour'], ['svc', 'Diagnostics & NCD'], ['att', 'Staff attendance'], ['clean', 'Housekeeping']];
    var LBL = LBL0.filter(function (l) { return l[0] !== 'att' || G.AUTH.isAdmin(); });
    var text, title, bar;
    if (mode === 'month') {
      var mm = UI.state.month || UI.defaultMonth(); bar = UI.monthbar(mm.y, mm.m); title = 'Monthly summary message';
      text = monthText(REP.month(mm.y, mm.m));
    } else {
      bar = UI.datebar(); title = 'Daily report message';
      text = REP.dailyText(UI.state.date, { sections: secs, skipZero: skip, withWarnings: warn });
    }
    UI.render(UI.topbar(title, 'Copy or send to WhatsApp', 'home') + '<div class="wrap">' +
      '<div class="btns"><a class="btn sm ' + (mode !== 'month' ? 'pri' : 'ghost') + '" href="#msg">Daily</a><a class="btn sm ' + (mode === 'month' ? 'pri' : 'ghost') + '" href="#msg/month">Monthly</a></div>' + bar +
      (mode !== 'month' ? '<div class="card"><div class="bd"><div class="checks">' + LBL.map(function (l) { return '<label><input type="checkbox" data-sec="' + l[0] + '"' + (secs[l[0]] ? ' checked' : '') + '> ' + l[1] + '</label>'; }).join('') + '</div>' +
        '<div class="checks" style="margin-top:8px"><label><input type="checkbox" id="skip"' + (skip ? ' checked' : '') + '> Hide zero lines</label><label><input type="checkbox" id="warn"' + (warn ? ' checked' : '') + '> Add “please check” notes</label></div></div></div>' : '') +
      '<div class="btns"><button class="btn wa" id="wa">WhatsApp</button><button class="btn pri" id="cp">Copy</button><button class="btn ghost" id="sh">Share…</button></div>' +
      '<textarea class="msg" id="txt">' + h(text) + '</textarea><p class="small muted">You can edit the text before sending. *Stars* show as bold in WhatsApp.</p></div>', 'msg');
    function savePref() { try { localStorage.setItem('ghd_msgpref', JSON.stringify({ secs: secs, skip: skip, warn: warn })); } catch (e) { /* ignore */ } }
    UI.$('#app').addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.sec) { secs[t.dataset.sec] = t.checked ? 1 : 0; } else if (t.id === 'skip') skip = t.checked; else if (t.id === 'warn') warn = t.checked; else return;
      savePref(); UI.$('#txt').value = REP.dailyText(UI.state.date, { sections: secs, skipZero: skip, withWarnings: warn });
    });
    UI.$('#wa').onclick = function () { UI.whatsapp(UI.$('#txt').value); };
    UI.$('#cp').onclick = function () { UI.copyText(UI.$('#txt').value); };
    UI.$('#sh').onclick = function () { UI.shareText(UI.$('#txt').value); };
  });

  function monthText(M) {
    var g = M.g, cfg = M.cfg, dl = g('del_ln') + g('del_ast') + g('del_lscs');
    var L = ['*' + cfg.short.toUpperCase() + ' – MONTHLY REPORT*', '*' + M.label + '*  (entries on ' + M.filled + ' of ' + M.nDays + ' days)', ''];
    function l(a, b) { L.push('• ' + a + ': ' + b); }
    L.push('*OP & IP*');
    l('Total OP', g('op_tot') + ' (avg ' + Math.round(g('op_tot') / M.nDays) + '/day)');
    l('New admissions', g('na_tot'));
    l('BOR', M.tot.bor + '%  |  ALOS ' + (g('dis_tot') ? U.round(g('bed_days') / g('dis_tot'), 2) : '-') + ' days');
    l('Discharges', g('dis_tot') + ' (LAMA ' + g('dis_lama') + ', absconded ' + g('dis_absc') + ')');
    l('Referrals out', g('ref_nonanc') + g('ref_anc'));
    l('Deaths', g('d_tot') + ' (BD ' + g('d_bd') + ', IP ' + g('d_ip') + ')');
    L.push('', '*TAEI*');
    l('Cases', g('te_tot') + ' (OP ' + g('te_op_t') + ', IP ' + g('te_ip_t') + ')');
    l('Triage', 'R ' + g('tg_red') + ', Y ' + g('tg_yel') + ', G ' + g('tg_grn') + ', B ' + g('tg_blk'));
    l('Trauma seen / referred', g('tr_seen') + ' / ' + g('tr_refout') + ' (' + M.tot.tr_refpct + '%)');
    l('RTA / assault', g('rta_tot') + ' / ' + g('as_tot'));
    l('MLC', g('mlc_tot') + ' | MedLeaPR ' + g('medleapr'));
    l('MI / stroke', g('mi_tot') + ' / ' + g('st_tot'));
    l('Poison / snake bite / other bites', g('po_rec') + ' / ' + g('sb_rec') + ' / ' + g('ob_rec'));
    l('ARV doses', g('arv_doses'));
    L.push('', '*OT, LABOUR & DIAGNOSTICS*');
    l('Surgeries', g('sx_tot') + ' (major ' + g('sx_major') + ', minor ' + g('sx_minor') + ')');
    l('Deliveries', dl + ' (LSCS ' + g('del_lscs') + ')');
    l('Sterilisation', g('fp_tat'));
    l('Lab / X-ray / USG / ECG', g('lab_tot') + ' / ' + g('xray') + ' / ' + g('usg') + ' / ' + g('ecg'));
    l('HT screened (+ve)', g('ht_scr') + ' (' + g('ht_pos') + ')');
    l('DM screened (+ve)', g('dm_scr') + ' (' + g('dm_pos') + ')');
    L.push('', '_' + cfg.hospital + '_');
    return L.join('\n');
  }

  // ---------------- monthly reports
  // [id, icon, title, description, build(M) -> sheet spec or array of specs]
  var REPORT_GROUPS = [
    ['TAEI & emergency', [
      ['taei', 'regs', 'TAEI Daily Report', 'Prescribed month sheet – all 263 rows × days with totals', function (M) { return REP.sheetTaeiDaily(M); }],
      ['perf', 'emg', 'TAEI performance report', '13 tables: triage, trauma, MI, stroke, bites, burns, PREM, RTA', function (M) { return REP.sheetPerf(M); }],
      ['cm', 'office', 'CM Dashboard – TAEI', 'State format row: trauma, RTA, assault', function (M) { return REP.sheetCm(M); }],
      ['registry', 'doc', 'TAEI registry reconciliation', 'Cases received vs entered in portal', function (M) { return REP.sheetRegistry(M); }],
      ['referral', 'ref', 'Referral register with outcome', 'Name, age, sex, diagnosis, 108 / self, reason, outcome', function (M) { return REP.sheetReferral(M); }],
      ['medleapr', 'regs', 'MedLeaPR case status', 'PM, MLC and remand – weekly blocks and month total', function (M) { return REP.sheetMedleapr(M); }]]],
    ['Hospital performance', [
      ['summary', 'report', 'Monthly performance summary', 'For M.O. review / ranking: OP, IP, BOR, deliveries, diagnostics, NCD', function (M) { var p = new Date(M.y, M.m - 2, 1); return REP.sheetSummary(M, REP.month(p.getFullYear(), p.getMonth() + 1)); }],
      ['kpi', 'kpi', 'KPI daily data', '24 CHC quality indicators – numerator, denominator, value', function (M) { return REP.sheetKpi(M); }],
      ['hmis', 'hmis', 'HMIS entry vs manual register', 'OP, IP, lab, discharges – daily gap and % entered', function (M) { return REP.sheetHmis(M); }],
      ['abha', 'hmis', 'ABHA count report', 'HMIS format – registrations and ABHA linking by day', function (M) { return REP.sheetAbha(M); }],
      ['other', 'lab', 'Other services (day-wise)', 'Lab, X-ray, USG, fever, NCD, MCH, HMIS, quality items', function (M) { return REP.sheetOther(M); }]]],
    ['Programmes & surveillance', [
      ['ncd', 'heart', 'NCD monthly 7-sheet report', 'Dialysis, Echo, Stroke, ICU, Hypertension, VIA colposcopy, Ca breast', function (M) { return G.NCD.sheetSpecs(M); }],
      ['fever', 'fever', 'Fever reports', 'Fever OP / IP, dengue, widal, scrub, lepto, malaria + details of fever cases', function (M) { return REP.sheetFever(M); }],
      ['deliveries', 'bed', 'Deliveries & TMTMT', 'Deliveries, live births, backlog beneficiaries', function (M) { return REP.sheetDeliveries(M); }]]],
    ['Staff & facility', [
      ['att', 'att', 'Attendance register', 'Staff × days with P / L / OD counts', function (M) { return REP.sheetAttendance(M); }],
      ['clean', 'clean', 'Housekeeping & BMW', 'Cleaning compliance by area, BMW kg', function (M) { return REP.sheetCleaning(M); }]]],
  ];
  var REPORTS = REPORT_GROUPS.reduce(function (a, g) { return a.concat(g[1]); }, []);
  function specsFor(id, M) {
    var out;
    if (id === 'ved') { var n = new Date(); n.setDate(1); n.setMonth(n.getMonth() + 1); out = REP.sheetVed(REP.MONTHS[n.getMonth()] + ' ' + n.getFullYear()); }
    else if (id.indexOf('reg:') === 0) out = REP.sheetRegister(id.slice(4), M);
    else { var r = REPORTS.filter(function (x) { return x[0] === id; })[0]; out = r ? r[4](M) : null; }
    return out ? [].concat(out) : null;
  }
  function fileName(specs, M, id) {
    var base = specs.length > 1 ? (REPORTS.filter(function (x) { return x[0] === id; })[0] || [0, 0, id])[2] : specs[0].name;
    base = base.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '');
    return base + (base.indexOf(M.mon.replace(/[^A-Za-z0-9]+/g, '_')) >= 0 ? '' : '_' + M.mon.replace('-', '_')) + '.xlsx';
  }

  UI.route('reports', function () {
    var mm = UI.state.month || UI.defaultMonth(), M = REP.month(mm.y, mm.m);
    var kp = REP.kpiMonthly(M);
    function item(r) { return '<div class="it" data-go="report/' + r[0] + '"><span class="ib">' + UI.icon(r[1]) + '</span><div class="m"><b>' + h(r[2]) + '</b><small>' + h(r[3]) + '</small></div><button class="btn sm ghost" data-xl="' + r[0] + '">Excel</button></div>'; }
    UI.render(UI.topbar('Monthly reports', M.label, 'home') + '<div class="wrap">' + UI.monthbar(mm.y, mm.m) +
      (M.filled < M.nDays ? '<div class="note ' + (M.filled ? 'warn' : 'info') + ' small">Daily entries found for <b>' + M.filled + ' of ' + M.nDays + '</b> days. Collect entries from all phones on the <a href="#sync">Share</a> screen, or <a href="#import">upload</a> the TAEI daily sheet, before sending reports.</div>' : '<div class="note ok small">All ' + M.nDays + ' days have entries.</div>') +
      '<div class="kv">' + [['OP', U.num(M.tot.op_tot)], ['Admissions', U.num(M.tot.na_tot)], ['BOR %', M.tot.bor], ['TAEI', U.num(M.tot.te_tot)], ['Deliveries', U.num(M.tot.del_ln) + U.num(M.tot.del_ast) + U.num(M.tot.del_lscs)], ['ALOS', kp[13].val || '-']].map(function (x) { return '<div><small>' + x[0] + '</small><b>' + x[1] + '</b></div>'; }).join('') + '</div>' +
      '<div class="btns"><button class="btn gold" id="all">Download all reports – one Excel workbook</button><a class="btn ghost" href="#ncd">Fill NCD monthly form</a></div>' +
      REPORT_GROUPS.map(function (g) { return '<h2 class="sec">' + h(g[0]) + '</h2><div class="card"><div class="list">' + g[1].map(item).join('') + '</div></div>'; }).join('') +
      '<h2 class="sec">Pharmacy</h2><div class="card"><div class="list">' + item(['ved', 'pill', 'VED drug indent (TNMSC)', 'From the pharmacy screen – current stock']) + '</div></div>' +
      '<h2 class="sec">Case registers</h2><div class="card"><div class="list">' + SC.REGISTERS.map(function (r) {
        var n = REP.registerRecords(r.id, M.dates[0], M.dates[M.dates.length - 1]).length;
        return '<div class="it" data-go="report/reg:' + r.id + '"><div class="m"><b>' + h(r.title) + '</b><small>' + n + ' entries</small></div><button class="btn sm ghost" data-xl="reg:' + r.id + '">Excel</button></div>';
      }).join('') + '</div></div></div>', 'reports');
    UI.$('#app').addEventListener('click', function (e) {
      var b = e.target.closest('[data-xl]'); if (!b) return; e.stopPropagation();
      var specs = specsFor(b.dataset.xl, M); UI.shareFile(X.build(specs), fileName(specs, M, b.dataset.xl));
    }, true);
    UI.$('#all').onclick = function () {
      var specs = REPORTS.reduce(function (a, r) { return a.concat(r[4](M)); }, []);
      SC.REGISTERS.forEach(function (r) { if (r.id !== 'referral' && REP.registerRecords(r.id, M.dates[0], M.dates[M.dates.length - 1]).length) specs.push(REP.sheetRegister(r.id, M)); });
      UI.shareFile(X.build(specs), 'GH_UTM_Monthly_Reports_' + M.mon.replace('-', '_') + '.xlsx', M.label + ' reports');
    };
  });

  UI.route('report', function (id) {
    var mm = UI.state.month || UI.defaultMonth(), M = REP.month(mm.y, mm.m), specs = specsFor(id, M);
    if (!specs) { UI.go('reports'); return; }
    var title = specs.length > 1 ? (REPORTS.filter(function (x) { return x[0] === id; })[0] || [0, 0, ''])[2] + ' – ' + M.label : specs[0].title;
    UI.render(UI.topbar(title, REP.settings().hospital, id.indexOf('reg:') === 0 ? 'reg/' + id.slice(4) : id === 'ved' ? 'pharm' : id === 'referral' ? 'referrals' : 'reports') + '<div class="wrap">' +
      (id !== 'ved' ? UI.monthbar(mm.y, mm.m) : '') +
      '<div class="btns"><button class="btn pri" id="xl">Excel</button><button class="btn gold" onclick="window.print()">Print / PDF</button>' + (id === 'ncd' ? '<a class="btn ghost" href="#ncd">Edit NCD form</a>' : '') + '</div>' +
      specs.map(function (sp) { return (specs.length > 1 ? '<h2 class="sec">' + h(sp.name) + '</h2>' : '') + UI.sheetHtml(sp); }).join('') +
      '<p class="small muted noprint">Tip: on phone, turn sideways to see more columns. In the print dialog choose “Save as PDF”.</p></div>', 'reports');
    UI.$('#xl').onclick = function () { UI.shareFile(X.build(specs), fileName(specs, M, id)); };
  });

  // ---------------- share & backup
  UI.route('sync', function () {
    var u = UI.user(), last = localStorage.getItem('ghd_lastbackup');
    UI.render(UI.topbar('Share & backup', 'Combine entries from all phones', 'home') + '<div class="wrap">' +
      '<div class="note info small"><b>How staff phones are combined:</b> each person taps <b>Send my entries</b> and shares the file to the report in-charge (WhatsApp / email). The in-charge taps <b>Receive entries</b> and picks the files. Newer entries replace older ones; nothing is duplicated.</div>' +
      '<div class="card"><div class="hd"><b>Send my entries</b></div><div class="bd"><div class="fgrid"><div class="f"><label>Entries changed in</label><select id="per"><option value="1">Today</option><option value="7" selected>Last 7 days</option><option value="31">Last 31 days</option><option value="0">Everything</option></select></div></div>' +
      '<div class="checks" style="margin-top:8px"><label><input type="checkbox" id="mine"> Only entries made by me (' + h(u.name) + ')</label><label><input type="checkbox" id="cfg"> Include settings, staff & drug lists</label></div>' +
      '<div class="btns"><button class="btn pri" id="send">Send entries file</button></div></div></div>' +
      '<div class="card"><div class="hd"><b>Receive entries</b></div><div class="bd"><p class="small">Pick one or more <code>.daybook.json</code> files received from other phones (or a backup file to restore).</p>' +
      '<input type="file" id="imp" accept=".json,application/json" multiple></div></div>' +
      (G.AUTH.isAdmin() ? '' : '<p class="small muted">Full backup, settings and attendance are handled by the CMO / Admin.</p>') +
      '<div class="card' + (G.AUTH.isAdmin() ? '' : ' hidden') + '"><div class="hd"><b>Full backup</b></div><div class="bd"><p class="small">Everything on this phone in one file. Keep it in Google Drive / email. Last backup: <b>' + (last ? new Date(+last).toLocaleString() : 'never') + '</b></p>' +
      '<div class="btns"><button class="btn gold" id="bk">Make backup</button></div></div></div>' +
      '<p class="small muted">Storage: ' + DB.mode() + ' · ' + Math.round(DB.sizeBytes() / 1024) + ' KB used</p></div>', 'sync');
    UI.$('#send').onclick = function () {
      var days = +UI.$('#per').value, since = days ? new Date(Date.now() - days * 864e5).toISOString() : null;
      var pkg = DB.exportData({ since: since, excludeCfg: !UI.$('#cfg').checked || !G.AUTH.isAdmin() });
      if (!G.AUTH.isAdmin()) Object.keys(pkg.data).forEach(function (k) { if (/^att\//.test(k) || /^day\/[^/]+\/admin$/.test(k) || /^audit\//.test(k)) delete pkg.data[k]; });
      if (UI.$('#mine').checked) Object.keys(pkg.data).forEach(function (k) { if (pkg.data[k].by !== u.name) delete pkg.data[k]; });
      var n = Object.keys(pkg.data).length; if (!n) { UI.toast('Nothing to send for this period', true); return; }
      var blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
      UI.shareFile(blob, 'daybook_' + u.name.replace(/[^A-Za-z0-9]+/g, '') + '_' + UI.todayIso() + '.daybook.json', n + ' entries from ' + u.name);
    };
    UI.$('#bk').onclick = function () {
      var blob = new Blob([JSON.stringify(DB.exportData({}))], { type: 'application/json' });
      UI.shareFile(blob, 'daybook_BACKUP_' + UI.todayIso() + '.daybook.json', 'GH-UTM Daybook backup');
      try { localStorage.setItem('ghd_lastbackup', String(Date.now())); } catch (e) { /* ignore */ }
    };
    UI.$('#imp').onchange = function () {
      var files = Array.prototype.slice.call(this.files || []), tot = { added: 0, updated: 0, skipped: 0 }, errs = [];
      Promise.all(files.map(function (f) {
        return f.text().then(function (t) { var r = DB.importData(JSON.parse(t), { admin: G.AUTH.isAdmin() }); ['added', 'updated', 'skipped'].forEach(function (k) { tot[k] += r[k]; }); })
          .catch(function (e) { errs.push(f.name + ': ' + e.message); });
      })).then(function () {
        if (errs.length) UI.toast(errs.join('; '), true);
        UI.toast('Received: ' + tot.added + ' new, ' + tot.updated + ' updated, ' + tot.skipped + ' unchanged');
      });
    };
  });

  // ---------------- settings
  var SET_FIELDS = [
    ['hospital', 'Hospital name'], ['short', 'Short name (message header)'], ['district', 'District'], ['inst', 'Institution name (reports)'], ['hospId', 'TAEI hospital ID'],
    ['phone', 'Hospital phone (discharge summary)'], ['beds', 'Functional beds (for BOR)', 'n'], ['sanctionedBeds', 'Sanctioned beds', 'n'], ['doctors', 'Doctors in position', 'n'],
    ['opDoctors', 'Doctors in OPD per day (KPI default)', 'n'], ['specialists', 'Specialists appointed', 'n'], ['eml', 'Drugs in EML (stock-out KPI)', 'n'],
    ['editDays', 'Staff entry window (days, incl. today)', 'n'], ['reportingStaff', 'TAEI reporting staff (CM dashboard)'], ['contact', 'Reporting staff contact number'], ['vedDoc', 'VED indent document no.'],
    ['ncdMobile', 'NCD reports – staff in-charge mobile'], ['feverBeds', 'Fever ward beds', 'n'], ['netBeds', 'Mosquito net beds', 'n'], ['netAdultM', 'Net beds – adult male', 'n'],
    ['netAdultF', 'Net beds – adult female', 'n'], ['netPaed', 'Net beds – paediatric', 'n'], ['windowMesh', "Window's mesh (Yes / No)"], ['ihip', 'IHIP fever portal entry (Yes / No)'],
    ['feverNodal', 'Fever nodal officer'], ['feverContact', 'Fever nodal officer contact'],
  ];
  UI.route('settings', function () {
    var u = UI.user(), cfg = REP.settings(), pin = localStorage.getItem('ghd_pin');
    UI.render(UI.topbar('Settings', 'GH-UTM Daybook v' + G.APP_VERSION, 'home') + '<div class="wrap">' +
      '<div class="card"><div class="hd"><b>This phone’s user</b></div><div class="bd row2"><div class="grow">' + h(u.name) + '<br><small class="muted">' + h((SC.ROLES.filter(function (r) { return r[0] === u.role; })[0] || [])[1]) + '</small></div><a class="btn ghost sm" href="#setup">Change</a></div></div>' +
      '<div class="card"><div class="hd"><b>Hospital profile</b></div><div class="bd"><div class="fgrid">' +
      SET_FIELDS.map(function (f) { return '<div class="f' + (f[0] === 'hospital' ? ' wide' : '') + '"><label>' + h(f[1]) + '</label><input type="' + (f[2] === 'n' ? 'number' : 'text') + '" data-s="' + f[0] + '" value="' + h(cfg[f[0]]) + '"></div>'; }).join('') +
      '</div><p class="small muted">BOR = midnight census ÷ functional beds × 100. Your September sheet used 70 beds.</p></div></div>' +
      '<div class="card"><div class="list"><a class="it" href="#staff"><div class="m"><b>Staff list</b><small>' + REP.staffList().length + ' active staff</small></div><span class="chev">›</span></a>' +
      '<a class="it" href="#areas"><div class="m"><b>Cleaning areas</b><small>' + REP.cleanAreas().length + ' areas</small></div><span class="chev">›</span></a>' +
      '<a class="it" href="#office"><div class="m"><b>Licences & compliance</b><small>TNCEA checklist with expiry alerts</small></div><span class="chev">›</span></a></div></div>' +
      '<div class="card"><div class="hd"><b>App lock</b></div><div class="bd"><p class="small">' + (pin ? 'A PIN is set. The app asks for it when opened.' : 'Set a 4–6 digit PIN so patient details on this phone are protected.') + '</p>' +
      '<div class="btns"><button class="btn ghost" id="pin">' + (pin ? 'Change PIN' : 'Set PIN') + '</button>' + (pin ? '<button class="btn danger" id="nopin">Remove PIN</button>' : '') + '</div></div></div>' +
      '<div class="card"><div class="hd"><b>CMO / Admin sign-in</b></div><div class="bd"><p class="small">Two-factor sign-in (password + authenticator code) protects funds, attendance, monthly reports, settings and corrections.</p>' +
      '<div class="btns"><a class="btn ghost" href="#admin">Admin panel</a><button class="btn danger" id="resetadm">Reset CMO sign-in (new password / phone)</button></div></div></div>' +
      '<div class="card"><div class="hd"><b>Demo & reset</b></div><div class="bd"><p class="small">Demo data fills last month with sample numbers so you can try the reports. Remove it before real use.</p>' +
      '<div class="btns"><button class="btn ghost" id="demo">Load demo month</button><button class="btn ghost" id="undemo">Remove demo data</button><button class="btn danger" id="wipe">Erase ALL data on this phone</button></div></div></div>' +
      '<p class="small muted center">Storage: ' + DB.mode() + ' · data never leaves this phone unless you share it.</p></div>', 'settings');
    UI.$('#app').addEventListener('input', function (e) {
      var k = e.target.dataset.s; if (!k || e.target.closest('[data-i]')) return;
      var s = DB.get('cfg/settings'), v = Object.assign({}, s ? s.v : {});
      var f = SET_FIELDS.filter(function (x) { return x[0] === k; })[0]; v[k] = f && f[2] === 'n' ? +e.target.value : e.target.value;
      UI.debounce('settings', function () { DB.put('cfg/settings', { v: v }); UI.flashSaved(); }, 500);
    });
    UI.$('#pin').onclick = function () {
      var p = prompt('New PIN (4–6 digits)'); if (!p) return;
      if (!/^\d{4,6}$/.test(p)) { UI.toast('PIN must be 4–6 digits', true); return; }
      if (prompt('Type the PIN again') !== p) { UI.toast('PINs did not match', true); return; }
      UI.sha256('ghd:' + p).then(function (x) { localStorage.setItem('ghd_pin', x); UI.toast('PIN set'); UI.dispatch(); });
    };
    if (UI.$('#nopin')) UI.$('#nopin').onclick = function () { if (confirm('Remove the PIN?')) { localStorage.removeItem('ghd_pin'); UI.dispatch(); } };
    UI.$('#demo').onclick = function () { if (confirm('Add sample data for last month? Your real entries are not changed, but demo values will appear in last month’s reports until you remove them.')) { var n = loadDemo(); UI.toast(n + ' demo days added'); } };
    UI.$('#undemo').onclick = function () { var n = 0; Object.keys(DB._mem()).forEach(function (k) { var v = DB._mem()[k]; if (v && !v.del && v.by === DEMO) { DB.del(k); n++; } }); UI.toast(n + ' demo entries removed'); };
    UI.$('#resetadm').onclick = function () {
      if (!confirm('Remove the current CMO sign-in? You will set a new password and authenticator straight away.')) return;
      DB.del('cfg/admin'); G.AUTH.signOut(); UI.go('admin');
    };
    UI.$('#wipe').onclick = function () {
      if (!confirm('Erase ALL entries, registers and settings on this phone? Make a backup first.')) return;
      if (prompt('Type ERASE to confirm') !== 'ERASE') return;
      DB.wipe(); localStorage.removeItem('ghd_user'); UI.go('setup');
    };
  });

  // ---------------- demo data
  var DEMO = 'Demo data';
  function loadDemo() {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    var dates = U.monthDates(d.getFullYear(), d.getMonth() + 1), seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function n(mean, sd) { return Math.max(0, Math.round(mean + (rnd() + rnd() + rnd() - 1.5) * (sd || mean * 0.3))); }
    var docs = REP.staffList().filter(function (s) { return /^Dr/.test(s.name); }), nurses = REP.staffList().filter(function (s) { return /nurse/i.test(s.desig); });
    dates.forEach(function (date, i) {
      var sun = U.parse(date).getDay() === 0, f = sun ? 0.8 : 1, opt = { by: DEMO, at: date + 'T08:00:00.000Z' };
      var v = { op_am: n(450 * f, 40), op_af: n(440 * f, 40), op_mch: n(45, 10), op_fch: n(44, 10) };
      DB.put('day/' + date + '/op', { v: v }, opt);
      var mc = { mc_am: n(18), mc_af: n(19), mc_mch: n(4, 2), mc_fch: n(2, 1) };
      DB.put('day/' + date + '/ip', { v: Object.assign(mc, { na_am: n(12), na_af: n(12), na_mch: n(2, 1), na_fch: n(1, 1), dt_am: mc.mc_am, dt_af: mc.mc_af, dt_mch: mc.mc_mch, dt_fch: mc.mc_fch,
        dis_n: n(11), dis_lama: n(5, 2), dis_absc: n(3, 2), ref_nonanc: n(4, 2), ref_anc: n(0.3, 0.5), d_bd: n(0.3, 0.5), d_ip: n(0.2, 0.4), sch_cmchis: n(0.3, 0.5), sch_ikt: n(0.3, 0.5) }) }, opt);
      var opm = n(125, 20), opf = n(120, 20), red = n(1, 1), yel = n(25, 6);
      DB.put('day/' + date + '/emg', { v: { te_op_m: opm, te_op_f: opf, te_ip_m: n(8, 3), te_ip_f: n(7, 3), tg_red: red, tg_yel: yel, tg_grn: Math.max(0, opm + opf - red - yel), tg_blk: 0, crit: n(7, 3),
        arv_doses: n(18, 6), arv_new: n(5, 2), hrig: n(0.3, 0.5), pai: n(0.3, 0.5), mlc_rta: n(2, 1), mlc_assault: n(1, 1), mlc_poison: n(1, 1), mlc_others: n(2, 2), medleapr: n(4, 2),
        tm_minor: n(5, 2), tm_major: n(1, 1), tr_seen: n(6, 2), tr_refout: n(1, 1), rta_major: n(1, 1), rta_minor: n(3, 2), rta_death: 0, as_major: 0, as_minor: n(1, 1), as_death: 0, helmet: n(0.4, 0.5),
        po_rec: n(1, 1), po_trt: n(1, 1), po_ref: n(0.3, 0.5), ob_rec: n(3, 2), ob_trt: n(3, 2), sb_rec: n(0.5, 0.6), mi_nstemi: n(0.4, 0.5), st_isch: n(0.2, 0.4) } }, opt);
      DB.put('day/' + date + '/ot', { v: { sx_minor: n(2, 1), sx_major: n(0.3, 0.5), og_op: n(15, 4), og_hrop: n(2, 1), del_ln: n(0.2, 0.4), fp_tat: n(0.2, 0.4) } }, opt);
      DB.put('day/' + date + '/svc', { v: { lab_op: n(700, 80), lab_ip: n(120, 20), xray: n(22, 5), usg: n(5, 2), ecg: n(16, 4), ht_scr: n(40, 10), ht_pos: n(6, 2), dm_scr: n(20, 6), dm_pos: n(2, 1), ncd_op: n(90, 15) } }, opt);
      DB.put('day/' + date + '/meta', { v: { dmo: docs.length ? docs[i % Math.min(5, docs.length)].name : '', filledby: nurses.length ? 'S/N ' + nurses[Math.floor(i / 7) % nurses.length].name : '' } }, opt);
      var att = {}; REP.staffList().forEach(function (s) { var r = rnd(); att[s.id] = r < 0.85 ? 'P' : r < 0.93 ? 'L' : r < 0.97 ? 'OD' : 'M'; });
      DB.put('att/' + date, { v: att }, opt);
      var cl = { v: {}, bmw: { bmw_yellow: n(6, 1), bmw_red: n(4, 1), bmw_white: n(1, 0.5), bmw_blue: n(0.5, 0.5) }, tasks: {} };
      REP.cleanAreas().forEach(function (ar) { SC.CLEAN_ROUNDS.forEach(function (rd) { cl.v[ar + '|' + rd] = { s: rnd() < 0.93 ? 'Y' : 'N' }; }); });
      DB.put('cln/' + date, cl, opt);
    });
    return dates.length;
  }

  // ---------------- PIN lock
  function lockScreen(done) {
    var app = document.getElementById('app');
    app.innerHTML = '<div class="lock"><div class="box"><div class="mono" style="margin:0 auto;width:56px;height:56px;font-size:18px">GH</div><h2>GH-UTM Daybook</h2><p>Enter PIN</p>' +
      '<input type="password" inputmode="numeric" id="pinin" maxlength="6" autocomplete="off"><button class="btn gold block" id="pinok">Unlock</button>' +
      '<p class="small" style="opacity:.7;margin-top:18px">Forgot the PIN? Clear this site’s data in the browser settings (all entries on this phone will be lost unless backed up).</p></div></div>';
    var tries = 0;
    function check() {
      UI.sha256('ghd:' + document.getElementById('pinin').value).then(function (x) {
        if (x === localStorage.getItem('ghd_pin')) done();
        else { tries++; document.getElementById('pinin').value = ''; UI.toast('Wrong PIN', true); if (tries >= 5) { document.getElementById('pinok').disabled = true; setTimeout(function () { document.getElementById('pinok').disabled = false; tries = 0; }, 60000); } }
      });
    }
    document.getElementById('pinok').onclick = check;
    document.getElementById('pinin').onkeydown = function (e) { if (e.key === 'Enter') check(); };
    document.getElementById('pinin').focus();
  }

  G.VIEWS_REPORTS = { lockScreen: lockScreen, monthText: monthText, loadDemo: loadDemo };
})(window);
