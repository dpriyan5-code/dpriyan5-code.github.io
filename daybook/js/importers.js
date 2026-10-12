/* Fill daily entries from uploaded files. Each detector looks at a parsed workbook and, if it
 * recognises the layout, returns { kind, label, sheet, days: { 'YYYY-MM-DD': { key: value } }, notes }.
 * Recognised: the prescribed TAEI Daily Report month sheet (also the app's own export of it),
 * the app's "Other services" sheet (lab, fever, HMIS, ABHA…), and the HMIS ABHA Count Report.
 */
(function (G) {
  'use strict';
  var SC = G.DB_SCHEMA, DB = G.DB, R = G.XLSXR;

  function norm(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim().toUpperCase(); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // Guess the year from file / sheet names such as "Sept 2026", "Sep-26", "2026-09".
  function guessYear(str, month) {
    var m = /(20\d\d)/.exec(str); if (m) return +m[1];
    m = /(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s\-_']*(\d\d)\b/i.exec(str); if (m) return 2000 + +m[1];
    var now = new Date(), y = now.getFullYear();
    return month && month > now.getMonth() + 2 ? y - 1 : y;
  }
  // Header row with day columns like '01/09' -> [{ col, day, month }]
  function dayColumns(row) {
    var out = [];
    (row || []).forEach(function (v, ci) {
      var m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(v == null ? '' : v).trim());
      if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) out.push({ col: ci, day: +m[1], month: +m[2] });
    });
    return out;
  }
  function cellVal(row, k, v) {
    var r = SC.ROW[k];
    if (v == null || v === '') return undefined;
    if (r.t === 'n') { if (isNum(v)) return Math.max(0, v); var n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? undefined : Math.max(0, n); }
    if (r.t === 'txt' || r.t === 'sel') return String(v).trim();
    return undefined;
  }

  function taeiDaily(sheet, ctx) {
    var rows = sheet.rows, dmo = -1;
    for (var i = 0; i < Math.min(rows.length, 15); i++) if (norm(rows[i][0]) === 'DMO') { dmo = i; break; }
    if (dmo < 0) return null;
    var gen = rows[dmo + 2] || [];
    if (norm(gen[0]).indexOf('GENERAL') !== 0) return null;
    var hdr = -1, cols = [];
    for (var h = dmo - 1; h >= 0; h--) { cols = dayColumns(rows[h]); if (cols.length) { hdr = h; break; } }
    if (!cols.length) return null;
    // check alignment of the 263 prescribed rows against the sheet's own labels
    var hits = 0, checked = 0;
    SC.DAILY_ROWS.forEach(function (r, idx) {
      var row = rows[dmo + idx] || [];
      [0, 1, 2].forEach(function (c) { var a = norm(row[c]); if (a && a !== '108' && a !== '108.0') { checked++; if (a.replace(/\s/g, '') === norm(r.l[c]).replace(/\s/g, '')) hits++; } });
    });
    if (!checked || hits / checked < 0.8) return { error: 'This looks like a TAEI Daily Report, but its rows do not line up with the prescribed format (' + Math.round(hits / checked * 100) + '% of labels match).' };
    var year = ctx.year || guessYear(ctx.fileName + ' ' + sheet.name, cols[0].month);
    var days = {};
    cols.forEach(function (c) {
      var date = year + '-' + pad(c.month) + '-' + pad(c.day), vals = {};
      SC.DAILY_ROWS.forEach(function (r, idx) {
        if (r.t === 'calc' || r.t === 'hd') return;
        var v = cellVal(null, r.k, (rows[dmo + idx] || [])[c.col]);
        if (v !== undefined) vals[r.k] = v;
      });
      if (Object.keys(vals).length) days[date] = vals;
    });
    return { kind: 'taei', label: 'TAEI Daily Report (prescribed format)', sheet: sheet.name, days: days, year: year, months: uniq(cols.map(function (c) { return c.month; })) };
  }

  // "Other services" sheet exported by the app: labels carried down like the TAEI sheet.
  function otherServices(sheet, ctx) {
    var rows = sheet.rows;
    if (norm((rows[0] || [])[0]) !== 'ITEM') return null;
    var cols = dayColumns(rows[0]); if (!cols.length) return null;
    var byLabel = {};
    SC.EXTRA_ROWS.forEach(function (r) { byLabel[[norm(r.l[0]), norm(r.l[1]), norm(r.l[2])].join('|')] = r; });
    var l1 = '', l2 = '', map = [];
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i] || [];
      if (norm(row[0])) { l1 = norm(row[0]); l2 = ''; }
      if (norm(row[1])) l2 = norm(row[1]);
      var r = byLabel[[l1, l2, norm(row[2])].join('|')];
      if (r && r.t !== 'calc') map.push({ i: i, r: r });
    }
    if (!map.length) return null;
    var year = ctx.year || guessYear(ctx.fileName + ' ' + sheet.name, cols[0].month), days = {};
    cols.forEach(function (c) {
      var date = year + '-' + pad(c.month) + '-' + pad(c.day), vals = {};
      map.forEach(function (x) { var v = cellVal(null, x.r.k, rows[x.i][c.col]); if (v !== undefined) vals[x.r.k] = v; });
      if (Object.keys(vals).length) days[date] = vals;
    });
    return { kind: 'other', label: 'Other services sheet (lab, fever, NCD, HMIS, ABHA …)', sheet: sheet.name, days: days, year: year };
  }

  // HMIS "ABHA Count Report": S.No | Date | Total Registrations | Mobile OTP | Aadhaar OTP | Biometric | Other | Total
  function abha(sheet, ctx) {
    var rows = sheet.rows, hdr = -1;
    for (var i = 0; i < Math.min(rows.length, 12); i++) if ((rows[i] || []).some(function (v) { return norm(v) === 'TOTAL REGISTRATIONS'; })) { hdr = i; break; }
    if (hdr < 0) return null;
    var head = rows[hdr].map(norm), col = {};
    head.forEach(function (h, ci) {
      if (h === 'DATE') col.date = ci;
      else if (h === 'TOTAL REGISTRATIONS') col.abha_reg = ci;
      else if (/MOBILE OTP/.test(h)) col.abha_mob = ci;
      else if (/AADHAAR OTP/.test(h)) col.abha_aotp = ci;
      else if (/BIOMETRIC/.test(h)) col.abha_bio = ci;
      else if (/LINKED THROUGH OTHER/.test(h)) col.abha_oth = ci;
    });
    if (col.date == null) return null;
    var title = rows.slice(0, hdr).map(function (r) { return (r || []).filter(Boolean).join(' '); }).join(' ');
    var days = {};
    for (var j = hdr + 1; j < rows.length; j++) {
      var d = R.dateOf((rows[j] || [])[col.date]); if (!d) continue;
      var vals = {};
      ['abha_reg', 'abha_mob', 'abha_aotp', 'abha_bio', 'abha_oth'].forEach(function (k) { if (col[k] != null) { var v = cellVal(null, k, rows[j][col[k]]); if (v !== undefined) vals[k] = v; } });
      if (Object.keys(vals).length) days[d] = vals;
    }
    return { kind: 'abha', label: 'HMIS ABHA Count Report', sheet: sheet.name, days: days, title: title };
  }

  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  function monthOf(text) { var m = new RegExp('(' + MONTHS.join('|') + ')\\s+(20\\d\\d)').exec(norm(text)); return m ? { y: +m[2], m: MONTHS.indexOf(m[1]) + 1 } : null; }
  function staffIndex() {
    var list = (DB.get('cfg/staff') || { list: [] }).list;
    return list.map(function (s) {
      var toks = norm(s.name).replace(/[^A-Z ]/g, ' ').split(' ').filter(function (t) { return t && t !== 'DR' && t !== 'S/N'; });
      return { id: s.id, name: s.name, toks: toks, first: toks.filter(function (t) { return t.length >= 3; })[0] || toks[0] };
    });
  }
  function matchStaff(idx, text) {
    var n = ' ' + norm(text).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var full = idx.filter(function (s) { return s.toks.length && s.toks.every(function (t) { return n.indexOf(' ' + t + ' ') >= 0; }); });
    if (full.length) return full.sort(function (a, b) { return b.toks.length - a.toks.length; })[0];
    var first = idx.filter(function (s) { return s.first && s.first.length >= 4 && n.indexOf(' ' + s.first + ' ') >= 0; });
    return first.length === 1 ? first[0] : null;
  }

  // Attendance register sheet exported by the app (fill-in form): S.No | Name | Designation | 01 … 31
  function attendanceSheet(sheet) {
    var rows = sheet.rows, title = norm((rows[0] || [])[0]);
    if (title.indexOf('ATTENDANCE REGISTER') !== 0) return null;
    var mo = monthOf(title); if (!mo) return null;
    var hdr = -1; for (var i = 0; i < 8; i++) if (norm((rows[i] || [])[0]) === 'S.NO' && norm(rows[i][1]) === 'NAME') { hdr = i; break; }
    if (hdr < 0) return null;
    var cols = []; rows[hdr].forEach(function (v, ci) { var d = parseInt(v, 10); if (ci > 2 && d >= 1 && d <= 31 && /^\d{1,2}$/.test(String(v).trim())) cols.push({ col: ci, day: d }); });
    var idx = staffIndex(), att = {}, unknown = [], codes = SC.ATT.map(function (a) { return a[0]; });
    for (var r = hdr + 1; r < rows.length; r++) {
      var nm = rows[r][1]; if (!nm) continue;
      var st = matchStaff(idx, nm); if (!st) { unknown.push(nm); continue; }
      cols.forEach(function (c) {
        var v = norm(rows[r][c.col]); if (!v || codes.indexOf(v) < 0) return;
        var d = mo.y + '-' + pad(mo.m) + '-' + pad(c.day); (att[d] = att[d] || {})[st.id] = v;
      });
    }
    return { kind: 'att', label: 'Attendance register', sheet: sheet.name, att: att, unknown: unknown };
  }

  // Case-register sheets exported by the app (also its fill-in forms)
  function registerSheet(sheet) {
    var rows = sheet.rows, title = norm((rows[0] || [])[0]);
    var def = SC.REGISTERS.filter(function (d) { return title.indexOf(norm(d.title) + ' – ') === 0 || title.indexOf(norm(d.title) + ' - ') === 0; })[0];
    if (!def) return null;
    var hdr = -1; for (var i = 0; i < 6; i++) if (norm((rows[i] || [])[0]) === 'S.NO' && norm(rows[i][1]) === 'DATE') { hdr = i; break; }
    if (hdr < 0) return null;
    var map = {}, idCol = -1;
    rows[hdr].forEach(function (v, ci) {
      var lab = norm(v).replace(/\s*\(.*\)$/, '');
      if (lab === 'RECORD ID') idCol = ci;
      def.fields.forEach(function (f) { if (norm(f.l) === lab) map[ci] = f; });
    });
    var recs = [];
    for (var r = hdr + 1; r < rows.length; r++) {
      var row = rows[r] || [], f = {}, any = false;
      Object.keys(map).forEach(function (ci) {
        var fd = map[ci], v = row[ci]; if (v == null || v === '') return;
        if (fd.t === 'date') v = R.dateOf(v) || String(v); else if (fd.t === 'time' && typeof v === 'number') { var mins = Math.round(v * 1440); v = pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60); }
        f[fd.k] = typeof v === 'number' ? v : String(v).trim(); any = true;
      });
      if (!any || !f[def.fields[0].k]) continue;
      recs.push({ id: idCol >= 0 && row[idCol] ? String(row[idCol]) : null, date: R.dateOf(row[1]), f: f });
    }
    return { kind: 'recs', type: def.id, label: def.title, sheet: sheet.name, recs: recs };
  }

  // NCD 7-sheet report produced by the app: title row, group row, label row, number row, values row
  function ncdSheet(sheet) {
    if (!G.NCD) return null;
    var rows = sheet.rows, title = norm((rows[0] || [])[0]);
    var spec = G.NCD.SHEETS.filter(function (x) { return title.indexOf(x.title + ' – ') === 0; })[0];
    if (!spec) return null;
    var mo = monthOf(title); if (!mo) return null;
    var vals = (rows[4] || []).slice(), keys = [null, null, null, null, null];
    spec.cols.forEach(function (c) { if (c[3] === 'mf') keys.push(c[2] + '_m', c[2] + '_f', null); else keys.push(c[3] === 'calc' ? null : c[2]); });
    if (spec.id === 'icu') { var bed = keys.splice(5, 1)[0]; keys.splice(4, 0, bed); }
    var v = {};
    keys.forEach(function (k, i) { var x = vals[i]; if (!k || x == null || x === '' || x === '-') return; v[k] = typeof x === 'number' ? x : (isNaN(+x) ? String(x) : +x); });
    return { kind: 'ncd', label: 'NCD report – ' + spec.title, sheet: sheet.name, ym: mo.y + '-' + pad(mo.m), ncd: v };
  }

  // ---------- text sources (PDF, photos, pasted WhatsApp text)
  // lines: [{ text, items: [{ str, x }] }]
  function linesFromText(t) { return String(t).split(/\r?\n/).map(function (l) { return { text: l, items: [{ str: l, x: 0 }] }; }); }

  // Daily attendance list such as the biometric attendance PDF (name … status / in-time)
  function attendanceText(lines, ctx) {
    var all = lines.map(function (l) { return l.text; }).join('\n');
    if (!/IN\s*TIME|STATUS/i.test(all) || !/DESIGNATION|STAFF NURSE|ASSISTANT SURGEON/i.test(all)) return null;
    var dm = /(\d{2})[-\/.](\d{2})[-\/.](\d{4})/.exec(all), date = dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : ctx.date;
    var idx = staffIndex(), att = {}, seen = {}, found = [];
    lines.forEach(function (l, li) {
      var st = matchStaff(idx, l.text); if (!st || seen[st.id]) return;
      var t = l.text;
      var code = /\bleave\b/i.test(t) ? 'L' : /missed/i.test(t) ? 'M' : /absent/i.test(t) ? 'A' : /\bOD\b|on duty/i.test(t) ? 'OD' : (/\d{1,2}:\d{2}/.test(t) || /\s(P|Present)\s*$/i.test(t)) ? 'P' : null; // a lone "P" inside a name is an initial, not a status
      if (!code) return;
      seen[st.id] = 1; att[st.id] = code; found.push(st.name + ' – ' + code);
    });
    if (!found.length) return null;
    var out = {}; out[date] = att;
    return { kind: 'att', label: 'Attendance list for ' + date.split('-').reverse().join('-'), sheet: 'text', att: out, found: found, unknown: idx.filter(function (s) { return !seen[s.id]; }).map(function (s) { return s.name; }) };
  }

  // Our daily WhatsApp report (pasted, or a screenshot / PDF of it) back into daily figures
  var MSG = [
    ['TOTAL OP', 'op_tot', { M: 'op_am', F: 'op_af', MCH: 'op_mch', FCH: 'op_fch' }], ['IP MIDNIGHT CENSUS', null, {}], ['NEW ADMISSIONS', null, { M: 'na_am', F: 'na_af', MCH: 'na_mch', FCH: 'na_fch' }],
    ['DISCHARGES', null, { NORMAL: 'dis_n', LAMA: 'dis_lama', ABSCONDED: 'dis_absc' }], ['REFERRALS OUT', null, { 'NON-ANC': 'ref_nonanc', ANC: 'ref_anc' }],
    ['DEATHS', null, { 'BROUGHT DEAD': 'd_bd', IP: 'd_ip' }], ['CMCHIS / IKT', null, { CMCHIS: 'sch_cmchis', IKT: 'sch_ikt' }], ['TAEI CASES', null, {}],
    ['TRIAGE', null, { RED: 'tg_red', YELLOW: 'tg_yel', GREEN: 'tg_grn', BLACK: 'tg_blk' }], ['CRITICAL EMERGENCIES', 'crit', {}], ['TRAUMA', null, { MAJOR: 'tm_major', MINOR: 'tm_minor' }],
    ['RTA', null, { MAJOR: 'rta_major', MINOR: 'rta_minor', DEATH: 'rta_death', HELMET: 'helmet' }], ['ASSAULT', null, { MAJOR: 'as_major', MINOR: 'as_minor', DEATH: 'as_death' }],
    ['TRAUMA REFERRED', 'tref_n', { 'NO SPECIALIST': 'tref_spec', 'NO EQUIPMENT': 'tref_equip', OTHERS: 'tref_oth' }],
    ['MLC', null, { RTA: 'mlc_rta', ASSAULT: 'mlc_assault', POISON: 'mlc_poison', BITES: 'mlc_bites', 'SELF FALL': 'mlc_selffall', BURNS: 'mlc_burns', HANGING: 'mlc_hanging', OTHERS: 'mlc_others' }],
    ['MEDLEAPR ENTRIES', 'medleapr', {}], ['MI', null, { STEMI: 'mi_stemi', NSTEMI: 'mi_nstemi', LYSIS: 'mi_lysis', 'REF OUT': 'mi_refout' }],
    ['STROKE', null, { ISCHAEMIC: 'st_isch', HAEMORRHAGIC: 'st_haem', 'REF OUT': 'st_refout' }], ['POISON', 'po_rec', { TREATED: 'po_trt', 'REF OUT': 'po_ref', DEATH: 'po_death' }],
    ['SNAKE BITE', 'sb_rec', { VENOMOUS: 'sb_ven', 'ASV VIALS': 'sb_asv', 'REF OUT': 'sb_ref', DEATH: 'sb_death' }], ['SCORPION / OTHER BITES', 'ob_rec', { TREATED: 'ob_trt', 'REF OUT': 'ob_ref' }],
    ['SELF HARM', 'sh_rec', { TREATED: 'sh_trt', 'REF OUT': 'sh_ref', DEATH: 'sh_death' }], ['BURNS', 'bu_rec', { 'REF OUT': 'bu_refout', DEATH: 'bu_death' }], ['PREM', 'pr_rec', { ADMITTED: 'pr_adm', 'REF OUT': 'pr_ref' }],
    ['ARV DOSES', 'arv_doses', { NEW: 'arv_new', HRIG: 'hrig' }], ['PAI', 'pai', {}], ['SURGERIES', null, { MAJOR: 'sx_major', MINOR: 'sx_minor' }],
    ['DELIVERIES', null, { NORMAL: 'del_ln', ASSISTED: 'del_ast', LSCS: 'del_lscs' }], ['OG OP', 'og_op', { 'HIGH RISK': 'og_hrop' }],
    ['FAMILY PLANNING', null, { 'TAT/PS': 'fp_tat', PPIUCD: 'fp_ppiucd', ANTARA: 'fp_antara', CHHAYA: 'fp_chayya', MTP: 'fp_mtp' }], ['LAB TESTS', 'lab_op', {}],
    ['NCD SCREENED', null, { HT: 'ht_scr', 'HT+': 'ht_pos', DM: 'dm_scr', 'DM+': 'dm_pos' }], ['ANC REGISTRATIONS', 'anc_reg', {}], ['IMMUNISATIONS', 'imm', {}],
    ['FEVER', null, { OP: 'fev_op', 'DENGUE +': 'den_pos', 'WIDAL +': 'widal_pos', 'SCRUB +': 'scrub_pos' }], ['HMIS ENTERED', null, { OP: 'hm_op', IP: 'hm_ip', LAB: 'hm_lab' }],
    ['ABHA LINKED', null, { REGISTRATIONS: 'abha_reg' }], ['DIET', null, {}],
  ];
  function messageText(lines, ctx) {
    var all = lines.map(function (l) { return l.text; }).join('\n');
    if (!/DAILY REPORT/i.test(all)) return null;
    var dm = /Date:\s*(\d{2})-(\d{2})-(\d{4})/i.exec(all), date = dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : ctx.date, v = {};
    lines.forEach(function (l) {
      var m = /^[•\-*\s]*([^:]+):\s*([\d.]+)?\s*(?:\((.*)\))?/.exec(l.text.trim()); if (!m) return;
      var label = norm(m[1]), spec = MSG.filter(function (x) { return x[0] === label; })[0];
      if (!spec) { var dg = /^X-RAY|^USG|^ECG/.test(norm(l.text.replace(/^[•\s]+/, ''))); if (dg) l.text.replace(/^[•\s]+/, '').split(',').forEach(function (p) { var q = /(X-ray|USG|ECG|CT)\s+(\d+)/i.exec(p); if (q) v[{ 'X-RAY': 'xray', USG: 'usg', ECG: 'ecg', CT: 'ct' }[norm(q[1])]] = +q[2]; }); return; }
      if (spec[1] && m[2] != null) v[spec[1]] = +m[2];
      (m[3] || '').split(',').forEach(function (p) {
        var q = /^\s*(.+?)\s+([\d.]+)\s*$/.exec(p); if (!q) return;
        var k = spec[2][norm(q[1])]; if (k) v[k] = +q[2];
      });
    });
    if (v.op_tot != null && v.op_am != null) delete v.op_tot; // total is calculated from the break-up
    delete v.op_tot;
    var dmo = /DMO:\s*(.+)/i.exec(all), fb = /Filled by:\s*(.+)/i.exec(all);
    if (dmo) v.dmo = dmo[1].trim(); if (fb) v.filledby = fb[1].trim();
    if (Object.keys(v).length < 2) return null;
    var days = {}; days[date] = v;
    return { kind: 'days', label: 'Daily WhatsApp report for ' + date.split('-').reverse().join('-'), sheet: 'text', days: days };
  }

  // Filled discharge summary / referral form / pre-auth form -> a draft form to review and save
  var SYN = { name: ['NAME', 'PATIENT NAME', 'NAME OF THE PATIENT'], age: ['AGE'], sex: ['SEX', 'GENDER'], agesex: ['AGE / SEX', 'AGE/SEX'], ipno: ['IP NO', 'IP NO.', 'IP NUMBER', 'OP / IP NO.', 'OP/IP NO'],
    hospno: ['HOSPITAL NO', 'HOSPITAL NO.'], doa: ['D.O.A.', 'D.O.A', 'DOA', 'DATE OF ADMISSION'], dod: ['D.O.D.', 'D.O.D', 'DOD', 'DATE OF DISCHARGE'], dos: ['D.O.S.', 'D.O.S'],
    addr: ['ADDRESS'], mob: ['MOBILE', 'MOBILE NO', 'MOBILE NO.', 'PHONE', 'CONTACT NO'], aadhaar: ['AADHAAR NO', 'AADHAAR NO.'], consultant: ['CONSULTANT'], unit: ['DEPT / UNIT / WARD'], urn: ['URN (CMCHIS)', 'URN'],
    dx: ['FINAL DIAGNOSIS', 'DIAGNOSIS', 'PROVISIONAL DIAGNOSIS'], pdx: ['PROVISIONAL DIAGNOSIS'], icd: ['ICD-10 CODE', 'ICD-10', 'ICD'], cc: ['PRESENTING COMPLAINTS', 'CHIEF COMPLAINTS', 'CHIEF COMPLAINTS*'],
    assoc: ['ASSOCIATED COMPLAINTS'], past: ['PAST HISTORY'], to: ['REFERRED TO', 'REFERRED TO (HOSPITAL)', 'REFERRED TO – HOSPITAL NAME'], spec: ['SPECIALTY', 'SPECIALITY'], reason: ['REASON FOR REFERRAL'],
    mlcno: ['MLC NO', 'MLC NO.', 'MLC NUMBER'], tx: ['TREATMENT GIVEN', 'TREATMENT GIVEN DURING HOSPITAL STAY'], inv: ['INVESTIGATIONS', 'INVESTIGATIONS DONE'],
    ref_to: ['REFERRED TO (HOSPITAL)', 'IF REFERRED – HOSPITAL NAME'], ref_spec: ['SPECIALTY', 'SPECIALITY'], ref_reason: ['REASON FOR REFERRAL'],
    v_bp: ['BP', 'B.P.', 'B.P'], v_pr: ['PR', 'PULSE'], v_rr: ['RR'], v_spo2: ['SPO2'], v_temp: ['TEMP'], v_gcs: ['GCS'], v_grbs: ['GRBS'] };
  function formText(lines, ctx) {
    var all = norm(lines.map(function (l) { return l.text; }).join(' '));
    var type = /DISCHARGE SUMMARY/.test(all) ? 'ds' : /PRE-?AUTHORI[SZ]ATION/.test(all) ? 'preauth' : /REFERRAL FORM|REFERRED TO/.test(all) ? 'ref' : null;
    if (!type) return null;
    var def = SC.FORMS[type], keys = def.fields.map(function (f) { return f.k; }), labels = [];
    function key(x) { return norm(x).replace(/[^A-Z0-9]/g, ''); } // PDFs often drop hyphens and brackets
    def.fields.forEach(function (f) { (SYN[f.k] || []).concat([norm(f.l).replace(/\s*\(.*\)$/, '').replace(/\s*\*$/, '')]).forEach(function (l) { labels.push({ l: key(l), k: f.k }); }); });
    labels.sort(function (a, b) { return b.l.length - a.l.length; });
    var f = {};
    function labelAt(str) { var u = key(str); return u ? labels.filter(function (x) { return x.l === u; })[0] : null; }
    function headingLike(str) { return /^[A-Z0-9 \/&.,()'’-]+$/.test(str) && /[A-Z]{3,}[\s\/]+[A-Z]{3,}/.test(str); }
    lines.forEach(function (ln, li) {
      // "Label: value" pairs on one line
      var t = ln.text, re = /([A-Za-z][A-Za-z0-9 .\/()\-–]{1,40}?)\s*:\s*/g, m, hits = [];
      while ((m = re.exec(t))) { var lab = labelAt(m[1]); if (lab) hits.push({ k: lab.k, s: m.index, e: re.lastIndex }); }
      hits.forEach(function (hh, i) { var val = t.slice(hh.e, i + 1 < hits.length ? hits[i + 1].s : undefined).trim(); if (val && !labelAt(val) && !/^_+$/.test(val) && f[hh.k] == null) f[hh.k] = val; });
      // a row of column headings followed by a row of values (tables in printed forms)
      var heads = ln.items.map(function (it) { var lb = labelAt(it.str); return lb ? { k: lb.k, x: it.x } : null; }).filter(Boolean);
      var next = lines[li + 1];
      if (heads.length >= 2 && next && !next.items.some(function (it) { return labelAt(it.str.replace(/:.*$/, '')) || headingLike(it.str); })) {
        next.items.forEach(function (it) {
          var best = heads.reduce(function (a, b) { return Math.abs(b.x - it.x) < Math.abs(a.x - it.x) ? b : a; });
          if (it.str.trim() && f[best.k] == null) f[best.k] = it.str.trim();
        });
      }
    });
    def.fields.forEach(function (fd) {
      if (f[fd.k] == null) return;
      if (fd.t === 'date') f[fd.k] = R.dateOf(f[fd.k]) || '';
      if (fd.k === 'sex') f.sex = /^F/i.test(f.sex) ? 'F' : /^M/i.test(f.sex) ? 'M' : f.sex;
      if (fd.t === 'num') f[fd.k] = String(f[fd.k]).replace(/[^\d.]/g, '');
      if (fd.t === 'sel' && fd.o.indexOf(f[fd.k]) < 0) delete f[fd.k];
      if (f[fd.k] === '') delete f[fd.k];
    });
    Object.keys(f).forEach(function (k) { if (keys.indexOf(k) < 0) delete f[k]; });
    if (!f.name && Object.keys(f).length < 3) return null;
    return { kind: 'form', type: type, label: def.title + (f.name ? ' – ' + f.name : ''), sheet: 'text', f: f };
  }

  function fromLines(lines, ctx) {
    var out = [attendanceText(lines, ctx), messageText(lines, ctx), formText(lines, ctx)].filter(Boolean);
    return { results: out, errors: [], text: lines.map(function (l) { return l.text; }).join('\n') };
  }

  // CSV -> one sheet
  function csvSheet(text, name) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    rows = rows.map(function (r) { return r.map(function (v) { var n = v.trim(); return n !== '' && !isNaN(+n) ? +n : (n || null); }); });
    return { sheets: [{ name: name, rows: rows, merges: [] }] };
  }

  function fromWorkbook(wb, ctx) {
    var inst = norm(ctx.inst || ''), results = [], errors = [], abhaCands = [];
    wb.sheets.forEach(function (sh) {
      var r = taeiDaily(sh, ctx) || otherServices(sh, ctx) || attendanceSheet(sh) || registerSheet(sh) || ncdSheet(sh);
      if (r && r.error) { errors.push(r.error); return; }
      if (r) { results.push(r); return; }
      var a = abha(sh, ctx); if (a) abhaCands.push(a);
    });
    if (abhaCands.length) {
      var mine = abhaCands.filter(function (a) { return inst && norm(a.title).indexOf(inst) >= 0; });
      var pick = mine[0] || (abhaCands.length === 1 ? abhaCands[0] : null);
      if (pick) results.push(pick);
      else errors.push('ABHA report has sheets for several hospitals (' + abhaCands.map(function (a) { return a.sheet; }).join(', ') + ') but none mentions "' + (ctx.inst || '') + '". Check the institution name in Settings.');
    }
    return { results: results, errors: errors, sheets: wb.sheets.map(function (s) { return s.name; }) };
  }

  // Parse any supported file. Text extraction for PDFs and photos lives in docread.js (loaded on demand).
  function parseFile(file, ctx) {
    ctx = Object.assign({ fileName: file.name }, ctx || {});
    var n = file.name.toLowerCase();
    if (/\.json$/.test(n)) return file.text().then(function (t) { return { json: JSON.parse(t) }; });
    if (/\.csv$/.test(n)) return file.text().then(function (t) { return fromWorkbook(csvSheet(t, file.name), ctx); });
    if (/\.txt$/.test(n)) return file.text().then(function (t) { return fromLines(linesFromText(t), ctx); });
    if (/\.pdf$/.test(n) || /^image\//.test(file.type) || /\.(jpe?g|png|webp|bmp|gif)$/.test(n)) {
      return G.DOCREAD.read(file, ctx.onProgress).then(function (lines) { var r = fromLines(lines, ctx); r.ocr = true; return r; });
    }
    if (/\.xls$/.test(n)) return Promise.reject(new Error('Old .xls files cannot be read. Open the file in Excel and “Save as” .xlsx, then upload again.'));
    return file.arrayBuffer().then(R.read).then(function (wb) { return fromWorkbook(wb, ctx); });
  }
  function parseText(text, ctx) { return fromLines(linesFromText(text), ctx || {}); }

  // ---------- preview and apply
  function canDate(d) { return !G.AUTH || G.AUTH.canEdit(d); }
  // mode: 'blanks' (keep existing values) | 'overwrite'
  function plan(result, mode) {
    var p = { days: 0, add: 0, change: 0, same: 0, keep: 0, locked: 0, writes: {} };
    if (result.kind === 'days' || result.days) {
      Object.keys(result.days).sort().forEach(function (date) {
        if (!canDate(date)) { p.locked++; return; }
        var vals = result.days[date], touched = false;
        Object.keys(vals).forEach(function (k) {
          var mod = SC.ROW[k].m, key = 'day/' + date + '/' + mod, env = DB.get(key), cur = env && env.v[k];
          var has = cur != null && cur !== '';
          if (!has) p.add++; else if (String(cur) === String(vals[k])) { p.same++; return; } else if (mode === 'overwrite') p.change++; else { p.keep++; return; }
          (p.writes[key] = p.writes[key] || { type: 'merge', v: {} }).v[k] = vals[k]; touched = true;
        });
        if (touched) p.days++;
      });
    } else if (result.kind === 'att') {
      Object.keys(result.att).forEach(function (date) {
        var key = 'att/' + date, env = DB.get(key), cur = env ? env.v : {}, w = {};
        Object.keys(result.att[date]).forEach(function (sid) {
          var v = result.att[date][sid];
          if (!cur[sid]) { p.add++; w[sid] = v; } else if (cur[sid] === v) p.same++; else if (mode === 'overwrite') { p.change++; w[sid] = v; } else p.keep++;
        });
        if (Object.keys(w).length) { p.days++; p.writes[key] = { type: 'merge', v: w }; }
      });
    } else if (result.kind === 'recs') {
      result.recs.forEach(function (r) {
        var key = r.id ? 'rec/' + result.type + '/' + r.id : null, env = key && DB.get(key), date = r.date || G.UI.todayIso();
        if (!canDate(date)) { p.locked++; return; }
        if (!env) { p.add++; key = key || 'rec/' + result.type + '/' + G.UI.uid(); p.writes[key] = { type: 'rec', v: { id: key.split('/')[2], date: date, f: r.f } }; }
        else if (JSON.stringify(env.f) === JSON.stringify(r.f) && env.date === date) p.same++;
        else if (mode === 'overwrite') { p.change++; p.writes[key] = { type: 'rec', v: { id: env.id, date: date, f: r.f } }; } else p.keep++;
      });
      p.days = Object.keys(p.writes).length;
    } else if (result.kind === 'ncd') {
      var key = 'mon/' + result.ym + '/ncd', env = DB.get(key), cur = env ? env.v : {}, w = {};
      var ym = result.ym.split('-'), auto = G.NCD ? G.NCD.resolve(G.REP.month(+ym[0], +ym[1])) : { v: {}, src: {} };
      Object.keys(result.ncd).forEach(function (k) {
        if ((cur[k] == null || cur[k] === '') && auto.src[k] && String(auto.v[k]) === String(result.ncd[k])) return; // figure comes from daily entries anyway
        if (cur[k] == null || cur[k] === '') { p.add++; w[k] = result.ncd[k]; } else if (String(cur[k]) === String(result.ncd[k])) p.same++; else if (mode === 'overwrite') { p.change++; w[k] = result.ncd[k]; } else p.keep++;
      });
      if (Object.keys(w).length) { p.days = 1; p.writes[key] = { type: 'merge', v: w }; }
    }
    return p;
  }
  function apply(result, mode, by) {
    var p = plan(result, mode);
    Object.keys(p.writes).forEach(function (key) {
      var w = p.writes[key];
      if (w.type === 'rec') { DB.put(key, w.v, { by: by }); return; }
      var env = DB.get(key), v = Object.assign({}, env ? env.v : {}, w.v);
      DB.put(key, { v: v }, { by: by });
    });
    return p;
  }

  G.IMPORT = { parseFile: parseFile, parseText: parseText, plan: plan, apply: apply, csvSheet: csvSheet,
    _detect: { taeiDaily: taeiDaily, otherServices: otherServices, abha: abha, attendanceSheet: attendanceSheet, registerSheet: registerSheet, ncdSheet: ncdSheet, attendanceText: attendanceText, messageText: messageText, formText: formText } };
})(typeof window !== 'undefined' ? window : globalThis);
