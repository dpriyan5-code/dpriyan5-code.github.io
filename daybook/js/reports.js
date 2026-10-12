/* Calculations and report builders. Every monthly report is built once as a "sheet spec"
 * ({ name, title, rows, cols, merges, freeze }) — the same spec is rendered on screen, printed
 * to PDF, and written to .xlsx, so the three always agree.
 */
(function (G) {
  'use strict';
  var SC = G.DB_SCHEMA, DB = G.DB, X = G.XLSX;
  var S = X.S;
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  var DEFAULT_SETTINGS = {
    hospital: 'Government Hospital, Uthiramerur', short: 'GH Uthiramerur', district: 'Kancheepuram', inst: 'Uthiramerur',
    hospId: '1831', type: 'Taluk Hospital (SDH)', beds: 70, sanctionedBeds: 105, doctors: 9, doctorsSanctioned: 10, opDoctors: 4,
    specialists: 1, eml: 70, reportingStaff: '', contact: '', reviewMonths: 1, leadMonths: 1, buffer: { V: 1, E: 0.5, D: 0.25 },
    vedDoc: 'GH/UTM/PHAR/VED-INDENT/2026/v1', phone: '', editDays: 2,
    feverBeds: 14, netBeds: 10, netAdultM: 8, netAdultF: 3, netPaed: 3, windowMesh: 'Yes', ihip: 'Yes', feverNodal: '', feverContact: '', ncdMobile: '',
  };
  function settings() { var s = DB.get('cfg/settings'); return Object.assign({}, DEFAULT_SETTINGS, s ? s.v : {}); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function daysIn(y, m) { return new Date(y, m, 0).getDate(); } // m: 1-12
  function monthDates(y, m) { var a = []; for (var d = 1; d <= daysIn(y, m); d++) a.push(y + '-' + pad(m) + '-' + pad(d)); return a; }
  function dmy(s) { var p = s.split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
  function dow(s) { return DOW[parse(s).getDay()]; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function isBlank(v) { return v == null || v === ''; }
  function round(n, d) { var f = Math.pow(10, d == null ? 2 : d); return Math.round(n * f) / f; }
  function div(a, b, mult) { return b ? round((a * (mult || 1)) / b, 2) : ''; }

  // ---------- day values
  function rawDay(date) {
    var v = {}, meta = {};
    DB.keys('day/' + date + '/').forEach(function (k) {
      var e = DB.get(k); if (!e) return;
      Object.assign(v, e.v || {});
      meta[k.split('/')[2]] = { by: e.by, at: e.at };
    });
    return { v: v, meta: meta };
  }
  function hasData(raw) { return Object.keys(raw).some(function (k) { return !isBlank(raw[k]); }); }

  var FN = {
    bor: function (g, c) { return c.beds ? round(g('mc_tot') / c.beds * 100, 2) : ''; },
    ocfBal: function (g) { return g('ocf_rec') - g('ocf_used'); },
    tocBal: function (g) { return g('toc_appr') - g('toc_exp'); },
    trRefPct: function (g) { return g('tr_seen') ? round(g('tr_refout') / g('tr_seen') * 100, 2) : 0; },
  };
  // Fill calculated rows. `raw` = entered values for one day.
  function compute(raw, cfg) {
    var out = Object.assign({}, raw);
    var g = function (k) { return num(out[k]); };
    SC.ALL_ROWS.forEach(function (r) {
      if (r.t !== 'calc') return;
      if (r.sum) out[r.k] = r.sum.reduce(function (a, k) { return a + g(k); }, 0);
      else if (r.fn) out[r.k] = FN[r.fn](g, cfg);
    });
    return out;
  }
  function day(date) {
    var raw = rawDay(date);
    var any = hasData(raw.v);
    return { date: date, raw: raw.v, any: any, v: any ? compute(raw.v, settings()) : {}, meta: raw.meta };
  }

  // ---------- validation
  function validate(v) {
    var w = [];
    function g(k) { return num(v[k]); }
    function has(k) { return !isBlank(v[k]); }
    if (has('tg_red') || has('tg_grn') || has('tg_yel')) {
      if (g('tg_tot') !== g('te_op_t') && has('te_op_m')) w.push('Triage total (' + g('tg_tot') + ') ≠ TAEI OP total (' + g('te_op_t') + ').');
    }
    if (g('rta_tot') > g('tr_seen') && has('tr_seen')) w.push('Total RTA cases (' + g('rta_tot') + ') is more than trauma cases seen (' + g('tr_seen') + ').');
    if (g('tr_refout') > g('tr_seen')) w.push('Trauma referred out is more than trauma cases seen.');
    if (g('sb_ven') + g('sb_nonven') > g('sb_rec')) w.push('Snake bite: venomous + non-venomous is more than received.');
    if (g('del_nlscs') > g('del_lscs')) w.push('Night LSCS is more than total LSCS.');
    if (g('mi_lysis') > g('mi_stemi') && has('mi_lysis')) w.push('Thrombolysis count is more than STEMI cases.');
    if (g('ht_pos') > g('ht_scr') || g('dm_pos') > g('dm_scr')) w.push('NCD: positives are more than screened.');
    if (g('lab_tot') && !g('op_tot')) { /* lab without OP is fine */ }
    if (g('ipt_tot') && g('mc_tot') > g('ipt_tot')) w.push('Midnight census is more than total IP of the day.');
    if (g('sh_rec') && (g('sh_poison') + g('sh_hanging') + g('sh_selfinf') + g('sh_fall') + g('sh_others')) !== g('sh_rec')) w.push('Self harm: break-up does not add up to received.');
    if (g('mi_d_tot') > g('mi_tot')) w.push('MI deaths are more than MI cases.');
    if (g('pa_appr') + g('pa_den') > g('pa_sub') && has('pa_sub')) w.push('Pre-auth approved + denied is more than submitted.');
    return w;
  }
  // Values far from the previous 7 days' average (catches typing slips like 25 for 1025).
  function unusual(date, v) {
    var keys = ['op_tot', 'mc_tot', 'na_tot', 'dt_tot', 'te_tot', 'dis_tot'];
    var hist = [];
    for (var i = 1; i <= 7; i++) { var d = day(addDays(date, -i)); if (d.any) hist.push(d.v); }
    if (hist.length < 3) return [];
    var w = [];
    keys.forEach(function (k) {
      if (isBlank(v[k]) || !num(v[k])) return;
      var avg = hist.reduce(function (a, h) { return a + num(h[k]); }, 0) / hist.length;
      if (avg >= 10 && (num(v[k]) > avg * 2.5 || num(v[k]) < avg / 2.5)) w.push(SC.ROW[k].s + ' = ' + num(v[k]) + ' (last 7-day average ' + Math.round(avg) + '). Please re-check.');
    });
    return w;
  }

  // ---------- month aggregation
  function month(y, m) {
    var cfg = settings();
    var dates = monthDates(y, m);
    var days = dates.map(day);
    var tot = {}, lastVal = {};
    SC.ALL_ROWS.forEach(function (r) {
      if (r.t === 'n' || (r.t === 'calc' && r.sum)) {
        if (r.agg === 'last') {
          var lv = '';
          days.forEach(function (d) { if (d.any && !isBlank(d.raw[r.k])) lv = num(d.raw[r.k]); });
          tot[r.k] = lv; lastVal[r.k] = lv;
        } else tot[r.k] = days.reduce(function (a, d) { return a + num(d.v[r.k]); }, 0);
      } else if (r.t === 'txt' || r.t === 'sel') {
        var seen = [];
        days.forEach(function (d) { var x = d.v[r.k]; if (!isBlank(x) && seen.indexOf(String(x)) < 0) seen.push(String(x)); });
        tot[r.k] = r.k === 'ocf_uc' ? (seen.length ? seen[seen.length - 1] : '') : seen.join('; ');
      }
    });
    var g = function (k) { return num(tot[k]); };
    var nDays = dates.length, filled = days.filter(function (d) { return d.any; }).length;
    tot.bor = cfg.beds ? round(g('mc_tot') / (cfg.beds * nDays) * 100, 2) : '';
    tot.ocf_bal = isBlank(tot.ocf_rec) && isBlank(tot.ocf_used) ? '' : g('ocf_rec') - g('ocf_used');
    tot.toc_bal = isBlank(tot.toc_appr) && isBlank(tot.toc_exp) ? '' : g('toc_appr') - g('toc_exp');
    tot.tr_refpct = g('tr_seen') ? round(g('tr_refout') / g('tr_seen') * 100, 2) : 0;
    return { y: y, m: m, dates: dates, days: days, tot: tot, g: g, nDays: nDays, filled: filled, cfg: cfg,
      label: MONTHS[m - 1] + ' ' + y, mon: MONTHS[m - 1].charAt(0) + MONTHS[m - 1].slice(1, 3).toLowerCase() + '-' + String(y).slice(2) };
  }

  // ---------- daily WhatsApp text
  function dailyText(date, opt) {
    opt = opt || {};
    var cfg = settings(), d = day(date), v = d.v, sk = opt.skipZero !== false;
    function g(k) { return num(v[k]); }
    function list(pairs) { // [[label,key]] -> "a 1, b 2"
      return pairs.filter(function (p) { return !sk || g(p[1]); }).map(function (p) { return p[0] + ' ' + g(p[1]); }).join(', ');
    }
    var L = [];
    var B = function (s) { return '*' + s + '*'; };
    var pendingHead = null;
    function flushHead() { if (pendingHead) { if (L.length && L[L.length - 1] !== '') L.push(''); L.push(B(pendingHead)); pendingHead = null; } }
    function line(label, total, detail) {
      if (sk && !total && !detail) return;
      flushHead();
      L.push('• ' + label + ': ' + (total == null ? '' : total) + (detail ? ' (' + detail + ')' : ''));
    }
    // a heading is written only when a line follows it
    function head(t) { pendingHead = t; }
    var want = opt.sections || { census: 1, emg: 1, ot: 1, svc: 1, att: 1, clean: 1 };

    L.push(B(cfg.short.toUpperCase() + ' – DAILY REPORT'));
    L.push('Date: ' + dmy(date) + ' (' + dow(date) + ')  |  7:30 AM – 7:30 AM');
    if (v.dmo) L.push('DMO: ' + v.dmo);
    if (v.filledby) L.push('Filled by: ' + v.filledby);
    if (!d.any) { L.push(''); L.push('_No entries yet for this date._'); return L.join('\n'); }

    if (want.census) {
      head('OP & IP');
      line('Total OP', g('op_tot'), list([['M', 'op_am'], ['F', 'op_af'], ['MCH', 'op_mch'], ['FCH', 'op_fch']]));
      line('IP midnight census', g('mc_tot'), g('mc_tot') ? 'BOR ' + (v.bor === '' ? '-' : v.bor) + '%' : '');
      line('New admissions', g('na_tot'), list([['M', 'na_am'], ['F', 'na_af'], ['MCH', 'na_mch'], ['FCH', 'na_fch']]));
      line('Diet', g('dt_tot'));
      line('Discharges', g('dis_tot'), list([['Normal', 'dis_n'], ['LAMA', 'dis_lama'], ['Absconded', 'dis_absc']]));
      line('Referrals out', g('ref_nonanc') + g('ref_anc'), list([['Non-ANC', 'ref_nonanc'], ['ANC', 'ref_anc']]));
      if (v.ref_reason) { flushHead(); L.push('   Reason: ' + v.ref_reason); }
      line('Deaths', g('d_tot'), list([['Brought dead', 'd_bd'], ['IP', 'd_ip']]));
      line('CMCHIS / IKT', g('sch_cmchis') + g('sch_ikt'), list([['CMCHIS', 'sch_cmchis'], ['IKT', 'sch_ikt']]));
    }
    if (want.emg) {
      head('EMERGENCY / TAEI');
      line('TAEI cases', g('te_tot'), list([['OP', 'te_op_t'], ['IP', 'te_ip_t']]));
      line('Triage', g('tg_tot'), list([['Red', 'tg_red'], ['Yellow', 'tg_yel'], ['Green', 'tg_grn'], ['Black', 'tg_blk']]));
      line('Critical emergencies', g('crit'));
      var regTot = g('r108_tot_rec') + g('rn_tot_rec');
      line('Registry received / entered', regTot, regTot && '108: ' + g('r108_tot_rec') + '/' + g('r108_tot_ent') + ', non-108: ' + g('rn_tot_rec') + '/' + g('rn_tot_ent'));
      line('Trauma', g('tm_tot'), list([['Major', 'tm_major'], ['Minor', 'tm_minor']]));
      line('RTA', g('rta_tot'), list([['Major', 'rta_major'], ['Minor', 'rta_minor'], ['Death', 'rta_death'], ['Helmet', 'helmet']]));
      line('Assault', g('as_tot'), list([['Major', 'as_major'], ['Minor', 'as_minor'], ['Death', 'as_death']]));
      line('Trauma referred', g('tref_n'), list([['No specialist', 'tref_spec'], ['No equipment', 'tref_equip'], ['Others', 'tref_oth']]));
      line('MLC', g('mlc_tot'), list([['RTA', 'mlc_rta'], ['Assault', 'mlc_assault'], ['Poison', 'mlc_poison'], ['Bites', 'mlc_bites'], ['Self fall', 'mlc_selffall'], ['Burns', 'mlc_burns'], ['Hanging', 'mlc_hanging'], ['Others', 'mlc_others']]));
      line('MedLeaPR entries', g('medleapr'));
      line('MI', g('mi_tot'), list([['STEMI', 'mi_stemi'], ['NSTEMI', 'mi_nstemi'], ['Lysis', 'mi_lysis'], ['Ref out', 'mi_refout']]));
      line('Stroke', g('st_tot'), list([['Ischaemic', 'st_isch'], ['Haemorrhagic', 'st_haem'], ['Ref out', 'st_refout']]));
      line('Poison', g('po_rec'), list([['Treated', 'po_trt'], ['Ref out', 'po_ref'], ['Death', 'po_death']]));
      line('Snake bite', g('sb_rec'), list([['Venomous', 'sb_ven'], ['ASV vials', 'sb_asv'], ['Ref out', 'sb_ref'], ['Death', 'sb_death']]));
      line('Scorpion / other bites', g('ob_rec'), list([['Treated', 'ob_trt'], ['Ref out', 'ob_ref']]));
      line('Self harm', g('sh_rec'), list([['Treated', 'sh_trt'], ['Ref out', 'sh_ref'], ['Death', 'sh_death']]));
      line('Burns', g('bu_rec'), list([['Ref out', 'bu_refout'], ['Death', 'bu_death']]));
      line('PREM', g('pr_rec'), list([['Admitted', 'pr_adm'], ['Ref out', 'pr_ref']]));
      line('Head injury', g('hi_tot'));
      line('ARV doses', g('arv_doses'), list([['New', 'arv_new'], ['HRIG', 'hrig']]));
      line('PAI', g('pai'));
    }
    if (want.ot) {
      var dl = g('del_ln') + g('del_ast') + g('del_lscs');
      if (!sk || g('sx_tot') || dl || g('og_op') || g('fp_tat')) head('OT & LABOUR');
      line('Surgeries', g('sx_tot'), list([['Major', 'sx_major'], ['Minor', 'sx_minor']]));
      line('Deliveries', dl, list([['Normal', 'del_ln'], ['Assisted', 'del_ast'], ['LSCS', 'del_lscs']]));
      line('OG OP', g('og_op'), list([['High risk', 'og_hrop']]));
      line('Family planning', g('fp_tat') + g('fp_ppiucd') + g('fp_antara') + g('fp_chayya') + g('fp_mtp'), list([['TAT/PS', 'fp_tat'], ['PPIUCD', 'fp_ppiucd'], ['Antara', 'fp_antara'], ['Chhaya', 'fp_chayya'], ['MTP', 'fp_mtp']]));
    }
    if (want.svc) {
      var anySvc = ['lab_tot', 'xray', 'usg', 'ecg', 'ht_scr', 'dm_scr', 'anc_reg', 'imm', 'fev_op', 'fev_ip', 'hm_op', 'abha_reg'].some(function (k) { return g(k); });
      if (!sk || anySvc) head('DIAGNOSTICS, NCD & HMIS');
      line('Lab tests', g('lab_tot'));
      var diag = list([['X-ray', 'xray'], ['USG', 'usg'], ['ECG', 'ecg'], ['CT', 'ct']]);
      if (diag) { flushHead(); L.push('• ' + diag); }
      line('NCD screened', g('ht_scr') + g('dm_scr'), list([['HT', 'ht_scr'], ['HT+', 'ht_pos'], ['DM', 'dm_scr'], ['DM+', 'dm_pos']]));
      line('ANC registrations', g('anc_reg'));
      line('Immunisations', g('imm'));
      line('Fever', g('fev_op') + g('fev_ip'), list([['OP', 'fev_op'], ['IP', 'fev_ip'], ['Dengue +', 'den_pos'], ['Widal +', 'widal_pos'], ['Scrub +', 'scrub_pos']]));
      line('HMIS entered', g('hm_op') + g('hm_ip'), list([['OP', 'hm_op'], ['IP', 'hm_ip'], ['Lab', 'hm_lab']]));
      line('ABHA linked', g('abha_tot'), list([['Registrations', 'abha_reg']]));
    }
    var w = validate(v);
    if (opt.withWarnings && w.length) { head('PLEASE CHECK'); flushHead(); w.forEach(function (x) { L.push('• ' + x); }); }
    if (want.att) {
      var a = attendanceSummary(date);
      if (a.total) { head('STAFF'); flushHead(); L.push('• Present ' + a.c.P + ' / ' + a.total + (a.c.L ? ', Leave ' + a.c.L : '') + (a.c.OD ? ', OD ' + a.c.OD : '') + (a.c.A ? ', Absent ' + a.c.A : '') + (a.c.M ? ', Missed punch ' + a.c.M : '')); if (a.leave.length) L.push('   On leave: ' + a.leave.join(', ')); }
    }
    if (want.clean) {
      var c = cleaningSummary(date);
      if (c.marked) { head('HOUSEKEEPING'); flushHead(); L.push('• Cleaning rounds done ' + c.done + '/' + c.expected + ' (' + c.pct + '%)'); if (c.bmw) L.push('• BMW handed over: ' + c.bmw + ' kg'); if (c.missed.length) L.push('   Not done: ' + c.missed.slice(0, 6).join(', ') + (c.missed.length > 6 ? ' …' : '')); }
    }
    pendingHead = null;
    L.push('');
    L.push('_' + cfg.hospital + '_');
    return L.join('\n');
  }

  function staffList() { var s = DB.get('cfg/staff'); return s ? s.list.filter(function (x) { return !x.inactive; }) : []; }
  function attendanceSummary(date) {
    var a = DB.get('att/' + date), staff = staffList(), c = { P: 0, L: 0, OD: 0, ND: 0, M: 0, A: 0 }, leave = [];
    if (!a) return { total: 0, c: c, leave: leave };
    var marked = 0;
    staff.forEach(function (s) { var st = a.v[s.id]; if (st) { marked++; c[st] = (c[st] || 0) + 1; if (st === 'L') leave.push(s.name); } });
    return { total: marked ? staff.length : 0, c: c, leave: leave };
  }
  function cleanAreas() { var a = DB.get('cfg/areas'); return a ? a.list : SC.CLEAN_AREAS; }
  function cleaningSummary(date) { return cleaningSummaryFrom(DB.get('cln/' + date), cleanAreas()); }
  function cleaningSummaryFrom(cl, areas) {
    var rounds = SC.CLEAN_ROUNDS;
    var out = { marked: 0, done: 0, expected: areas.length * rounds.length, pct: 0, missed: [], bmw: 0 };
    if (!cl) return out;
    areas.forEach(function (ar) {
      rounds.forEach(function (rd) {
        var x = (cl.v || {})[ar + '|' + rd];
        if (x && x.s) { out.marked++; if (x.s === 'Y') out.done++; else out.missed.push(ar + ' (' + rd + ')'); }
      });
    });
    out.pct = out.expected ? Math.round(out.done / out.expected * 100) : 0;
    out.bmw = round(SC.BMW.reduce(function (a, b) { return a + num((cl.bmw || {})[b[0]]); }, 0), 1);
    return out;
  }
  // Entered values of a day with one module's (unsaved) values swapped in.
  function rawDayMerged(date, modId, vals) {
    var v = {};
    DB.keys('day/' + date + '/').forEach(function (k) { if (k.split('/')[2] !== modId) { var e = DB.get(k); if (e) Object.assign(v, e.v); } });
    return Object.assign(v, vals);
  }

  // ---------- sheet builders
  function T(v, s) { return { v: v, s: s }; }
  function headerBlock(title, sub, cfg, width) {
    return { rows: [[T(cfg.hospital.toUpperCase(), S.title)], [T(title, S.bold)], sub ? [T(sub, S.normal)] : [], []], merges: [] };
  }

  // 1. TAEI Daily Report (prescribed month grid)
  function sheetTaeiDaily(M) {
    var rows = [], dates = M.dates;
    var hdr = [T('', S.head), T('', S.head), T('', S.head)].concat(dates.map(function (d) { return T(d.slice(8) + '/' + d.slice(5, 7), S.head); }), [T('TOTAL', S.head)]);
    rows.push(hdr);
    rows.push([T('Day', S.sub), T('', S.sub), T('', S.sub)].concat(dates.map(function (d) { return T(dow(d), S.num); }), [T('', S.num)]));
    var prev = ['', ''];
    SC.DAILY_ROWS.forEach(function (r) {
      var l1 = r.l[0] === prev[0] ? '' : r.l[0];
      var l2 = r.l[0] === prev[0] && r.l[1] === prev[1] ? '' : r.l[1];
      prev = [r.l[0], r.l[1]];
      var isTot = r.t === 'calc';
      var row = [T(l1, S.sub), T(l2, S.cell), T(r.l[2], S.cell)];
      M.days.forEach(function (d) {
        var x = d.any ? d.v[r.k] : '';
        if (r.t === 'hd') x = '';
        if (r.t === 'n' && d.any && isBlank(d.raw[r.k])) x = '';
        row.push(T(isBlank(x) ? '' : (typeof x === 'number' ? x : (isNaN(+x) || r.t === 'txt' || r.t === 'sel' ? x : +x)), isTot ? S.total : (r.k === 'bor' ? S.pct : S.num)));
      });
      var tv = r.t === 'hd' ? '' : M.tot[r.k];
      if (r.k === 'dmo' || r.k === 'filledby' || r.k === 'ref_reason' || r.k === 'tref_oth_reason') tv = '';
      row.push(T(isBlank(tv) ? '' : tv, S.total));
      rows.push(row);
    });
    return { name: 'TAEI Daily Report - ' + M.mon, title: 'TAEI Daily Report – ' + M.label, rows: rows, cols: [26, 22, 26].concat(dates.map(function () { return 7; }), [9]), freeze: { r: 2, c: 3 }, landscape: true };
  }

  // 1b. Other services (extra rows)
  function sheetOther(M) {
    var rows = [[T('ITEM', S.head), T('', S.head), T('', S.head)].concat(M.dates.map(function (d) { return T(d.slice(8) + '/' + d.slice(5, 7), S.head); }), [T('TOTAL', S.head)])];
    var prev = ['', ''];
    SC.EXTRA_ROWS.forEach(function (r) {
      var l1 = r.l[0] === prev[0] ? '' : r.l[0], l2 = r.l[0] === prev[0] && r.l[1] === prev[1] ? '' : r.l[1];
      prev = [r.l[0], r.l[1]];
      var row = [T(l1, S.sub), T(l2, S.cell), T(r.l[2], S.cell)];
      M.days.forEach(function (d) { var x = d.any && !(r.t === 'n' && isBlank(d.raw[r.k])) ? d.v[r.k] : ''; row.push(T(isBlank(x) ? '' : +x, r.t === 'calc' ? S.total : S.num)); });
      row.push(T(M.tot[r.k], S.total));
      rows.push(row);
    });
    return { name: 'Other Services - ' + M.mon, title: 'Other services (Lab, NCD, MCH, quality) – ' + M.label, rows: rows, cols: [24, 22, 18].concat(M.dates.map(function () { return 7; }), [9]), freeze: { r: 1, c: 3 }, landscape: true };
  }

  // 2. KPI Daily Data (24 CHC KPIs)
  function sheetKpi(M) {
    var cfg = M.cfg, rows = [];
    rows.push([T('KPI DAILY DATA CAPTURE – ' + M.label + '  |  ' + cfg.hospital, S.title)]);
    rows.push([T('Auto-calculated from the daily entries. Numerator / denominator per day; monthly value in the last column.', S.normal)]);
    rows.push([T('Type', S.head), T('S.No', S.head), T('Quality Indicator', S.head), T('Field (Num / Den)', S.head), T('Formula', S.head)]
      .concat(M.dates.map(function (d) { return T(d.slice(8) + '/' + d.slice(5, 7) + ' ' + dow(d).charAt(0) + dow(d).slice(1).toLowerCase(), S.head); }), [T('Monthly Total', S.head), T('Value', S.head)]));
    var lastType = '';
    SC.KPIS.forEach(function (k) {
      var type = k.type === lastType ? '' : k.type; lastType = k.type;
      var formula = k.kind === 'pct' ? '(Num×100/Den)' : k.kind === 'k' ? '(Num×1000/Den)' : k.kind === 'see' ? (k.no === 19 ? 'See HMIS' : 'See LaQshya') : '(Num/Den)';
      if (!k.fn) { rows.push([T(type, S.sub), T(k.no, S.num), T(k.name, S.cell), T('—', S.cell), T(formula, S.cell)]); return; }
      var numRow = [T(type, S.sub), T(k.no, S.num), T(k.name, S.cell), T('Numerator: ' + k.num, S.cell), T(formula, S.cell)];
      var denRow = [T('', S.sub), T('', S.num), T('', S.cell), T('Denominator: ' + k.den, S.cell), T('', S.cell)];
      M.days.forEach(function (d) {
        var g = function (key) { return num(d.v[key]); };
        var nd = d.any ? k.fn(g, { beds: cfg.beds, days: 1, eml: cfg.eml, specialists: cfg.specialists, opDoctors: cfg.opDoctors, daysWithOp: num(d.v.op_tot) ? 1 : 0 }) : ['', ''];
        numRow.push(T(nd[0], S.num)); denRow.push(T(nd[1], S.num));
      });
      var daysWithOp = M.days.filter(function (d) { return num(d.v.op_tot); }).length;
      var mt = k.fn(M.g, { beds: cfg.beds, days: M.nDays, eml: cfg.eml, specialists: cfg.specialists, opDoctors: cfg.opDoctors, daysWithOp: daysWithOp });
      var val = div(mt[0], mt[1], k.kind === 'pct' ? 100 : k.kind === 'k' ? 1000 : 1);
      numRow.push(T(mt[0], S.total), T(val, S.pct)); denRow.push(T(mt[1], S.total), T('', S.num));
      rows.push(numRow, denRow);
    });
    return { name: 'KPI Daily Data - ' + M.mon, title: 'KPI daily data – ' + M.label, rows: rows, cols: [16, 5, 30, 34, 13].concat(M.dates.map(function () { return 7; }), [11, 9]), freeze: { r: 3, c: 5 }, landscape: true };
  }
  function kpiMonthly(M) {
    var cfg = M.cfg, daysWithOp = M.days.filter(function (d) { return num(d.v.op_tot); }).length;
    return SC.KPIS.map(function (k) {
      if (!k.fn) return { k: k, n: '', d: '', val: '' };
      var mt = k.fn(M.g, { beds: cfg.beds, days: M.nDays, eml: cfg.eml, specialists: cfg.specialists, opDoctors: cfg.opDoctors, daysWithOp: daysWithOp });
      return { k: k, n: mt[0], d: mt[1], val: div(mt[0], mt[1], k.kind === 'pct' ? 100 : k.kind === 'k' ? 1000 : 1) };
    });
  }

  // 3. TAEI Performance Report (13 tables, monthly format)
  function sheetPerf(M) {
    var g = M.g, t = M.tot, inst = M.cfg.inst.toUpperCase();
    var rows = [[T(M.cfg.hospital.toUpperCase(), S.title)], [T('TAEI PERFORMANCE REPORT – ' + M.label, S.bold)], []];
    var maxCols = 0;
    function table(title, heads, vals) {
      rows.push([T(title, S.bold)]);
      rows.push([T('Institution', S.head)].concat(heads.map(function (h) { return T(h, S.head); })));
      rows.push([T(inst, S.sub)].concat(vals.map(function (v) { return T(v, S.num); })));
      rows.push([]);
      maxCols = Math.max(maxCols, heads.length + 1);
    }
    table('1. CASES RECEIVED & TRIAGE CATEGORY', ['OP Male', 'OP Female', 'OP Total', 'IP Male', 'IP Female', 'IP Total', 'Total OP/IP', 'Red', 'Yellow', 'Green', 'Black', 'Triage Total'],
      [g('te_op_m'), g('te_op_f'), g('te_op_t'), g('te_ip_m'), g('te_ip_f'), g('te_ip_t'), g('te_tot'), g('tg_red'), g('tg_yel'), g('tg_grn'), g('tg_blk'), g('tg_tot')]);
    table('2. PAI & EMERGENCY TRAUMA SURGERY', ['No. of Cases PAI', 'Minor Trauma', 'Major Trauma', 'Total Major+Minor', 'Gen. Surgical Emg.', 'Ortho Surgery', 'Plastic Surgery', 'ENT', 'Ophthalmic Surgery'],
      [g('pai'), g('tm_minor'), g('tm_major'), g('tm_tot'), g('dept_gen'), g('dept_ortho'), g('dept_plas'), g('dept_ent'), g('dept_oph')]);
    table('3. REASON FOR REFERRAL & TRAUMA DEATH', ['< 6 hrs', '6–24 hrs', '> 24 hrs', 'Ref. Total', 'Non-Avail. Specialist', 'Non-Avail. Equipment', 'Others', 'Total', 'Brought Dead', 'Death in ED', 'Total Death'],
      [g('es_lt6'), g('es_6_24'), g('es_gt24'), g('tref_n'), g('tref_spec'), g('tref_equip'), g('tref_oth'), g('tref_tot'), g('td_bd'), g('td_ed'), g('td_tot')]);
    table('4. MI (HEART ATTACK) CASES', ['E-FAST', 'STEMI', 'Non-STEMI', 'Total MI', 'Thrombolysis', 'PCI Done', 'Pharmacoinvasive', 'Total', 'Ref. In', 'Ref. Out', 'Death STEMI', 'Death NSTEMI', 'Total Death'],
      [g('efast'), g('mi_stemi'), g('mi_nstemi'), g('mi_tot'), g('mi_lysis'), g('cath_pci'), g('cath_pharm'), g('cath_tot'), g('mi_refin'), g('mi_refout'), g('mi_d_stemi'), g('mi_d_nstemi'), g('mi_d_tot')]);
    table('5. STROKE CASES', ['Ischemic Stroke', 'Haemorrhagic Stroke', 'Total Stroke', 'CT Scan (Stroke)', 'MRI (Stroke)', 'Thrombolyzed', 'Ref. In', 'Ref. Out', 'Death'],
      [g('st_isch'), g('st_haem'), g('st_tot'), g('st_ct'), g('st_mri'), g('st_lysis'), g('st_refin'), g('st_refout'), g('st_death')]);
    table('6. POISON CASES', ['Received', 'Treated', 'Ref. Out', 'Death'], [g('po_rec'), g('po_trt'), g('po_ref'), g('po_death')]);
    table('7. SNAKE BITE', ['Received', 'Treated', 'ASV Used', 'Ref. Out', 'Death'], [g('sb_rec'), g('sb_trt'), g('sb_asv'), g('sb_ref'), g('sb_death')]);
    table('8. SCORPION & OTHER BITES', ['Received', 'Treated', 'Ref. Out', 'Death'], [g('ob_rec'), g('ob_trt'), g('ob_ref'), g('ob_death')]);
    table('9. SELF HARM CASES', ['Received', 'Treated', 'Ref. Out', 'Death'], [g('sh_rec'), g('sh_trt'), g('sh_ref'), g('sh_death')]);
    table('10. BURNS CASES', ['Consent Forms', 'Cases Received', '<20% Adm.', '<20% Death', '<20% Ref.', '20-40% Adm.', '20-40% Death', '20-40% Ref.', '> 40% Adm.', '> 40% Death', '> 40% Ref.', 'Acid/Chemical', 'Crackers/Expl.', 'Discharge', 'Ref. Cases', 'Total Death'],
      [g('burns_consent'), g('bu_rec'), g('bu_lt20_adm'), g('bu_lt20_d'), g('bu_lt20_ref'), g('bu_2040_adm'), g('bu_2040_d'), g('bu_2040_ref'), g('bu_gt40_adm'), g('bu_gt40_d'), g('bu_gt40_ref'), g('bu_acid'), g('bu_crack'), g('bu_dis'), g('bu_refout'), g('bu_death')]);
    table('11. PREMATURITY (PREM)', ['Approved Amt (Rs.)', 'Expenditure (Rs.)', 'Balance (Rs.)', 'No. of Cases', 'Cases Received', 'Admitted & Treated', 'Discharge', 'Ref. Out', 'Death'],
      [g('prem_appr'), g('prem_exp'), g('prem_appr') - g('prem_exp'), g('pr_cases'), g('pr_rec'), g('pr_adm'), g('pr_dis'), g('pr_ref'), g('pr_death')]);
    table('12. TAEI OPERATIONAL COST', ['Approved Amount (Rs.)', 'Expenditure Incurred (Rs.)', 'Balance Amount (Rs.)'], [g('toc_appr'), g('toc_exp'), g('toc_appr') - g('toc_exp')]);
    table('13. RTA CASES & HELMET USAGE', ['Total Trauma Cases', 'Trauma Ref. Out', '% Ref. Out', 'RTA Major', 'RTA Minor', 'RTA Mortality', 'Total RTA', 'Assault Major', 'Assault Minor', 'Assault Mortality', 'Total Assault', 'Helmet Cases'],
      [g('tr_seen'), g('tr_refout'), t.tr_refpct + '%', g('rta_major'), g('rta_minor'), g('rta_death'), g('rta_tot'), g('as_major'), g('as_minor'), g('as_death'), g('as_tot'), g('helmet')]);
    var cols = [16]; for (var i = 1; i < maxCols; i++) cols.push(11);
    return { name: 'TAEI Performance ' + M.mon, title: 'TAEI performance report – ' + M.label, rows: rows, cols: cols, landscape: true };
  }

  // 4. CM Dashboard TAEI row (state format)
  function sheetCm(M) {
    var g = M.g, cfg = M.cfg;
    var rows = [
      [T('CM DASH BOARD – TAEI REPORT – ' + M.label, S.title)], [],
      [T('MONTH / YEAR', S.head), T('District', S.head), T('Name of the Institution', S.head), T('Name of the reporting staff', S.head), T('Contact Number', S.head),
        T('Tamil Nadu Accident and Emergency Care Initiative (TAEI)', S.head)],
      [T('', S.head), T('', S.head), T('', S.head), T('', S.head), T('', S.head), T('No of hospitals with TAEI facilities', S.head), T('Trauma cases referred out', S.head), T('', S.head), T('', S.head),
        T('No of RTA cases treated', S.head), T('', S.head), T('', S.head), T('', S.head), T('No of Assault cases treated', S.head), T('', S.head), T('', S.head), T('', S.head)],
      [T('', S.head), T('', S.head), T('', S.head), T('', S.head), T('', S.head), T('', S.head), T('No of trauma cases seen', S.head), T('No of trauma cases Referred out', S.head), T('% of trauma cases referred out = (F/E)*100', S.head),
        T('Major injuries', S.head), T('Minor injuries', S.head), T('No of mortality', S.head), T('Total RTA Cases', S.head), T('Major injuries', S.head), T('Minor injuries', S.head), T('No of mortality', S.head), T('Total Assault Cases', S.head)],
      [T(M.mon, S.num), T(cfg.district, S.cell), T(cfg.inst, S.cell), T(cfg.reportingStaff, S.cell), T(cfg.contact, S.cell), T(1, S.num), T(g('tr_seen'), S.num), T(g('tr_refout'), S.num), T(M.tot.tr_refpct, S.pct),
        T(g('rta_major'), S.num), T(g('rta_minor'), S.num), T(g('rta_death'), S.num), T(g('rta_tot'), S.total), T(g('as_major'), S.num), T(g('as_minor'), S.num), T(g('as_death'), S.num), T(g('as_tot'), S.total)],
    ];
    return { name: 'CM Dashboard ' + M.mon, title: 'CM Dashboard – TAEI – ' + M.label, rows: rows, cols: [11, 14, 16, 20, 14, 12, 12, 12, 14, 10, 10, 10, 10, 10, 10, 10, 10],
      merges: ['A3:A5', 'B3:B5', 'C3:C5', 'D3:D5', 'E3:E5', 'F3:Q3', 'F4:F5', 'G4:I4', 'J4:M4', 'N4:Q4'], landscape: true };
  }

  // 5. TAEI registry: received vs entered in portal
  function sheetRegistry(M) {
    var g = M.g;
    var cats = [['poison', 'Poison'], ['trauma', 'Trauma'], ['mi', 'MI'], ['stroke', 'Stroke'], ['burns', 'Burns'], ['prem', 'PREM'], ['others', 'Others'], ['tot', 'TOTAL']];
    var rows = [[T('TAEI REGISTRY – RECEIVED vs ENTERED – ' + M.label, S.title)], [],
      [T('Category', S.head), T('108 – Received', S.head), T('108 – Entered', S.head), T('Non-108 – Received', S.head), T('Non-108 – Entered', S.head), T('Total received', S.head), T('Total entered', S.head), T('Pending entry', S.head), T('% entered', S.head)]];
    cats.forEach(function (c) {
      var a = g('r108_' + c[0] + '_rec'), b = g('r108_' + c[0] + '_ent'), cc = g('rn_' + c[0] + '_rec'), d = g('rn_' + c[0] + '_ent');
      var pend = a + cc - b - d, st = c[0] === 'tot' ? S.total : S.num;
      rows.push([T(c[1], S.sub), T(a, st), T(b, st), T(cc, st), T(d, st), T(a + cc, st), T(b + d, st), T(pend, pend > 0 ? S.warn : st), T(div(b + d, a + cc, 100), S.pct)]);
    });
    return { name: 'Registry ' + M.mon, title: 'TAEI registry reconciliation – ' + M.label, rows: rows, cols: [14, 12, 12, 13, 13, 12, 12, 12, 10] };
  }

  // 6. Monthly performance summary (M.O. review & DM&RHS ranking indicators)
  function sheetSummary(M, P) {
    var g = M.g, cfg = M.cfg, n = M.nDays;
    var dl = g('del_ln') + g('del_ast') + g('del_lscs');
    var pg = P ? P.g : function () { return ''; };
    var pdl = P ? pg('del_ln') + pg('del_ast') + pg('del_lscs') : '';
    var rows = [[T(cfg.hospital.toUpperCase(), S.title)], [T('MONTHLY PERFORMANCE SUMMARY – ' + M.label, S.bold)],
      [T('Days with entries: ' + M.filled + ' of ' + n + '   |   Beds (functional): ' + cfg.beds + '   |   Doctors in position: ' + cfg.doctors, S.normal)], [],
      [T('Indicator', S.head), T(M.mon, S.head), T(P ? P.mon : 'Previous', S.head), T('Change', S.head), T('Per day', S.head)]];
    function line(label, a, b, perDay) {
      var ch = (typeof a === 'number' && typeof b === 'number') ? round(a - b, 2) : '';
      rows.push([T(label, S.cell), T(a, S.num), T(b, S.num), T(ch, typeof ch === 'number' && ch < 0 ? S.warn : S.num), T(perDay ? round(a / n, 1) : '', S.num)]);
    }
    function sec(t) { rows.push([T(t, S.sub), T('', S.sub), T('', S.sub), T('', S.sub), T('', S.sub)]); }
    function both(k) { return [g(k), P ? pg(k) : '']; }
    sec('INSTITUTIONAL SERVICE');
    line('Total outpatients', g('op_tot'), P ? pg('op_tot') : '', true);
    line('OP / day / doctor', round(g('op_tot') / n / (cfg.doctors || 1), 1), P ? round(pg('op_tot') / P.nDays / (cfg.doctors || 1), 1) : '');
    line('New admissions (inpatients)', g('na_tot'), P ? pg('na_tot') : '', true);
    line('IP / day (avg midnight census)', round(g('mc_tot') / n, 1), P ? round(pg('mc_tot') / P.nDays, 1) : '');
    line('IP / day / doctor', round(g('mc_tot') / n / (cfg.doctors || 1), 2), P ? round(pg('mc_tot') / P.nDays / (cfg.doctors || 1), 2) : '');
    line('Bed occupancy rate (%)', M.tot.bor, P ? P.tot.bor : '');
    line('Average length of stay (days)', div(g('bed_days'), g('dis_tot')), P ? div(pg('bed_days'), pg('dis_tot')) : '');
    line('LAMA', g('dis_lama'), P ? pg('dis_lama') : '');
    line('Absconded', g('dis_absc'), P ? pg('dis_absc') : '');
    line('Referrals out (non-ANC + ANC)', g('ref_nonanc') + g('ref_anc'), P ? pg('ref_nonanc') + pg('ref_anc') : '');
    line('Deaths (brought dead + IP)', g('d_tot'), P ? pg('d_tot') : '');
    sec('MATERNITY / CEmONC & FAMILY WELFARE');
    line('Normal deliveries', g('del_ln'), P ? pg('del_ln') : '');
    line('Assisted deliveries', g('del_ast'), P ? pg('del_ast') : '');
    line('Caesareans (LSCS)', g('del_lscs'), P ? pg('del_lscs') : '');
    line('Night LSCS', g('del_nlscs'), P ? pg('del_nlscs') : '');
    line('Total deliveries', dl, pdl);
    line('% LSCS', div(g('del_lscs'), dl, 100), P ? div(pg('del_lscs'), pdl, 100) : '');
    line('Sterilisation (TAT / PS)', g('fp_tat'), P ? pg('fp_tat') : '');
    line('PPIUCD / Antara / Chhaya', g('fp_ppiucd') + g('fp_antara') + g('fp_chayya'), P ? pg('fp_ppiucd') + pg('fp_antara') + pg('fp_chayya') : '');
    line('Maternal deaths', g('mat_death'), P ? pg('mat_death') : '');
    line('Neonatal deaths', g('neo_death'), P ? pg('neo_death') : '');
    sec('DIAGNOSTICS');
    line('Lab investigations', g('lab_tot'), P ? pg('lab_tot') : '', true);
    line('X-ray', g('xray'), P ? pg('xray') : '', true);
    line('Ultrasonogram', g('usg'), P ? pg('usg') : '', true);
    line('ECG', g('ecg'), P ? pg('ecg') : '', true);
    line('CT', g('ct'), P ? pg('ct') : '');
    sec('NCD SCREENING');
    [['Hypertension', 'ht_scr', 'ht_pos'], ['Diabetes', 'dm_scr', 'dm_pos'], ['Ca breast (CBE)', 'cbe_done', 'cbe_pos'], ['Ca cervix (VIA)', 'via_done', 'via_pos'], ['Oral cancer', 'oral_scr', 'oral_susp']].forEach(function (x) {
      line(x[0] + ' – screened', g(x[1]), P ? pg(x[1]) : '');
      line(x[0] + ' – positive', g(x[2]), P ? pg(x[2]) : '');
      line(x[0] + ' – positivity (%)', div(g(x[2]), g(x[1]), 100), P ? div(pg(x[2]), pg(x[1]), 100) : '');
    });
    line('Diabetic foot screened', g('dfoot'), P ? pg('dfoot') : '');
    sec('SURGERIES');
    [['Major surgeries', 'sx_major'], ['Minor surgeries', 'sx_minor'], ['OG (major OT)', 'ot_og'], ['General surgery', 'ot_gen'], ['Ortho', 'ot_ortho'], ['ENT', 'ot_ent'], ['Ophthal (cataract)', 'ot_oph'], ['Dental procedures', 'dental']].forEach(function (x) { var b = both(x[1]); line(x[0], b[0], b[1]); });
    sec('EMERGENCY / MEDICO-LEGAL');
    [['TAEI cases (OP + IP)', 'te_tot'], ['Critical emergencies', 'crit'], ['MLC', 'mlc_tot'], ['RTA cases', 'rta_tot'], ['Assault cases', 'as_tot'], ['Snake bite', 'sb_rec'], ['ASV vials used', 'sb_asv'], ['Poison', 'po_rec'], ['MI (STEMI + NSTEMI)', 'mi_tot'], ['Stroke', 'st_tot'], ['ARV doses', 'arv_doses'], ['Post-mortems done', 'pm_done']].forEach(function (x) { var b = both(x[1]); line(x[0], b[0], b[1]); });
    sec('CMCHIS');
    [['Pre-auth submitted', 'pa_sub'], ['Pre-auth approved', 'pa_appr'], ['Pre-auth denied', 'pa_den'], ['Approved amount (₹)', 'pa_amt'], ['CMCHIS cases', 'sch_cmchis'], ['IKT cases', 'sch_ikt']].forEach(function (x) { var b = both(x[1]); line(x[0], b[0], b[1]); });
    sec('OTHERS');
    [['Blood units transfused', 'blood_units'], ['ANC registrations', 'anc_reg'], ['Immunisations', 'imm']].forEach(function (x) { var b = both(x[1]); line(x[0], b[0], b[1]); });
    return { name: 'Summary ' + M.mon, title: 'Monthly performance summary – ' + M.label, rows: rows, cols: [36, 12, 12, 10, 10] };
  }

  // 7. Attendance register
  function sheetAttendance(M) {
    var staff = staffList();
    var codes = SC.ATT.map(function (a) { return a[0]; });
    var rows = [[T('ATTENDANCE REGISTER – ' + M.label, S.title)], [T('P Present · L Leave · OD On duty · ND Night-duty off · M Missed punch · A Absent', S.normal)], [],
      [T('S.No', S.head), T('Name', S.head), T('Designation', S.head)].concat(M.dates.map(function (d) { return T(d.slice(8), S.head); }), codes.map(function (c) { return T(c, S.head); }))];
    var att = M.dates.map(function (d) { var a = DB.get('att/' + d); return a ? a.v : {}; });
    staff.forEach(function (s, i) {
      var cnt = {}; codes.forEach(function (c) { cnt[c] = 0; });
      var row = [T(i + 1, S.num), T(s.name, S.cell), T(s.desig, S.cell)];
      att.forEach(function (a) { var x = a[s.id] || ''; if (x) cnt[x]++; row.push(T(x, x === 'A' || x === 'M' ? S.warn : S.num)); });
      codes.forEach(function (c) { row.push(T(cnt[c], S.total)); });
      rows.push(row);
    });
    return { name: 'Attendance ' + M.mon, title: 'Attendance – ' + M.label, rows: rows, cols: [5, 22, 18].concat(M.dates.map(function () { return 4; }), codes.map(function () { return 5; })), freeze: { r: 4, c: 3 }, landscape: true };
  }

  // 8. Housekeeping & BMW
  function sheetCleaning(M) {
    var areas = cleanAreas(), R = SC.CLEAN_ROUNDS;
    var rows = [[T('HOUSEKEEPING & BIO-MEDICAL WASTE – ' + M.label, S.title)], [T('Cells show cleaning rounds completed out of ' + R.length + ' (' + R.join(', ') + ').', S.normal)], [],
      [T('Area', S.head)].concat(M.dates.map(function (d) { return T(d.slice(8), S.head); }), [T('Done', S.head), T('Compliance %', S.head)])];
    var cl = M.dates.map(function (d) { return DB.get('cln/' + d); });
    var gd = 0, ge = 0;
    areas.forEach(function (ar) {
      var row = [T(ar, S.cell)], done = 0, exp = 0;
      cl.forEach(function (c) {
        if (!c) { row.push(T('', S.num)); return; }
        var n = 0; R.forEach(function (rd) { var x = (c.v || {})[ar + '|' + rd]; if (x && x.s === 'Y') n++; });
        done += n; exp += R.length;
        row.push(T(n, n < R.length ? S.warn : S.num));
      });
      gd += done; ge += exp;
      row.push(T(done, S.total), T(exp ? Math.round(done / exp * 100) : '', S.total));
      rows.push(row);
    });
    rows.push([T('OVERALL', S.sub)].concat(M.dates.map(function () { return T('', S.sub); }), [T(gd, S.total), T(ge ? Math.round(gd / ge * 100) : '', S.total)]));
    rows.push([]);
    rows.push([T('Bio-medical waste (kg)', S.head)].concat(M.dates.map(function (d) { return T(d.slice(8), S.head); }), [T('Total', S.head)]));
    SC.BMW.forEach(function (b) {
      var row = [T(b[1], S.cell)], t = 0;
      cl.forEach(function (c) { var x = c && c.bmw ? c.bmw[b[0]] : ''; t += num(x); row.push(T(isBlank(x) ? '' : num(x), S.num)); });
      row.push(T(round(t, 1), S.total)); rows.push(row);
    });
    rows.push([]);
    rows.push([T('Other tasks (✓ = done)', S.head)].concat(M.dates.map(function (d) { return T(d.slice(8), S.head); }), [T('Days', S.head)]));
    SC.HK_TASKS.forEach(function (h) {
      var row = [T(h[1], S.cell)], t = 0;
      cl.forEach(function (c) { var x = c && c.tasks ? c.tasks[h[0]] : ''; if (x) t++; row.push(T(x ? '✓' : '', S.num)); });
      row.push(T(t, S.total)); rows.push(row);
    });
    return { name: 'Housekeeping ' + M.mon, title: 'Housekeeping & BMW – ' + M.label, rows: rows, cols: [26].concat(M.dates.map(function () { return 4.5; }), [8, 12]), freeze: { r: 4, c: 1 }, landscape: true };
  }

  // 9. Line-list register export
  function registerRecords(type, from, to) {
    return DB.list('rec/' + type + '/').map(function (x) { return x.val; })
      .filter(function (r) { return r.date >= from && r.date <= to; })
      .sort(function (a, b) { return (a.date + (a.f.time || '')).localeCompare(b.date + (b.f.time || '')); });
  }
  // blankRows > 0 turns the sheet into a fill-in form (numbered empty rows; upload it back to add the entries)
  function sheetRegister(type, M, blankRows) {
    var def = SC.REGISTERS.filter(function (r) { return r.id === type; })[0];
    var recs = registerRecords(type, M.dates[0], M.dates[M.dates.length - 1]);
    var rows = [[T(def.title.toUpperCase() + ' – ' + M.label, S.title)], [T(blankRows ? 'Fill one patient per row. Date as dd-mm-yyyy. Leave “Record ID” blank for new entries; upload this file back on the Upload screen.' : '', S.normal)],
      [T('S.No', S.head), T('Date', S.head)].concat(def.fields.map(function (f) { return T(f.l + (f.t === 'sel' ? ' (' + f.o.filter(Boolean).join(' / ') + ')' : ''), S.head); }), [T('Entered by', S.head), T('Record ID', S.head)])];
    recs.forEach(function (r, i) { rows.push([T(i + 1, S.num), T(dmy(r.date), S.cell)].concat(def.fields.map(function (f) { var x = r.f[f.k]; return T(isBlank(x) ? '' : (f.t === 'num' ? num(x) : f.t === 'date' && x ? dmy(x) : x), S.cell); }), [T(r.by || '', S.cell), T(r.id || '', S.cell)])); });
    for (var b = 0; b < (blankRows || 0); b++) rows.push([T(recs.length + b + 1, S.num), T('', S.cell)].concat(def.fields.map(function () { return T('', S.cell); }), [T('', S.cell), T('', S.cell)]));
    if (!recs.length && !blankRows) rows.push([T('', S.cell), T('No entries this month', S.cell)]);
    return { name: def.title.replace(/[^A-Za-z0-9 &()-]/g, ' ').slice(0, 24) + ' ' + M.mon, title: def.title + ' – ' + M.label, rows: rows, cols: [5, 11].concat(def.fields.map(function (f) { return f.wide ? 26 : 13; }), [16, 12]), freeze: { r: 3, c: 2 }, landscape: true };
  }


  // ---------- range totals (weekly MedLeaPR etc.)
  function rangeAgg(dates) {
    var days = dates.map(day), sums = {}, texts = {};
    days.forEach(function (d) {
      if (!d.any) return;
      Object.keys(d.v).forEach(function (k) {
        var r = SC.ROW[k]; if (!r) return;
        if (r.t === 'txt' || r.t === 'sel') { if (!isBlank(d.v[k])) (texts[k] = texts[k] || []).push(String(d.v[k])); }
        else sums[k] = (sums[k] || 0) + num(d.v[k]);
      });
    });
    return { g: function (k) { return sums[k] || 0; }, t: function (k) { return (texts[k] || []).filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; '); }, filled: days.filter(function (d) { return d.any; }).length };
  }
  function weeks(M) { var out = []; for (var i = 0; i < M.dates.length; i += 7) out.push(M.dates.slice(i, i + 7)); return out; }
  function dotted(d) { return d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4); }

  // 11. Referral register with outcome (Name, Age, Sex, Diagnosis, 108/Self, Reason, Outcome)
  function sheetReferral(M) {
    var recs = registerRecords('referral', M.dates[0], M.dates[M.dates.length - 1]);
    var rows = [[T(M.cfg.hospital.toUpperCase(), S.title)], [T('REFERRAL REGISTER WITH OUTCOME – ' + M.label, S.bold)], [],
      ['S.No', 'Date', 'Time', 'Name', 'Age', 'Sex', 'Diagnosis', '108 / Self', 'Reason for referral', 'Referred to', 'Outcome', 'Outcome known on', 'Outcome details', 'ANC', 'Trauma'].map(function (x) { return T(x, S.head); })];
    var cnt = {};
    recs.forEach(function (r, i) {
      var f = r.f, oc = f.outcome || 'Pending follow-up'; cnt[oc] = (cnt[oc] || 0) + 1;
      rows.push([T(i + 1, S.num), T(dmy(r.date), S.cell), T(f.time || '', S.cell), T(f.name || '', S.cell), T(f.age ? num(f.age) : '', S.num), T(f.sex || '', S.num), T(f.dx || '', S.cell),
        T(f.mode || '', S.num), T(f.reason || '', S.cell), T(f.to || '', S.cell), T(oc, oc === 'Pending follow-up' ? S.warn : S.cell), T(f.outcome_date ? dmy(f.outcome_date) : '', S.cell), T(f.outcome_note || '', S.cell), T(f.anc || '', S.num), T(f.trauma || '', S.num)]);
    });
    if (!recs.length) rows.push([T('', S.cell), T('No referrals entered this month', S.cell)]);
    rows.push([]);
    rows.push([T('Outcome', S.head), T('Cases', S.head)]);
    SC.REF_OUTCOMES.forEach(function (o) { if (cnt[o]) rows.push([T(o, S.cell), T(cnt[o], S.num)]); });
    rows.push([T('Total referrals', S.sub), T(recs.length, S.total)]);
    var by108 = recs.filter(function (r) { return r.f.mode === '108'; }).length;
    rows.push([T('Through 108', S.cell), T(by108, S.num)], [T('Self / other vehicle', S.cell), T(recs.length - by108, S.num)]);
    return { name: 'Referrals ' + M.mon, title: 'Referral register with outcome – ' + M.label, rows: rows, cols: [5, 11, 7, 22, 5, 5, 24, 9, 26, 22, 22, 12, 28, 6, 7], freeze: { r: 4, c: 4 }, landscape: true };
  }

  // 12. Fever reports (district "Fever" sheet + "Details of fever cases")
  function sheetFever(M) {
    var g = M.g, cfg = M.cfg;
    var rows = [[T(dotted(M.dates[0]) + ' to ' + dotted(M.dates[M.dates.length - 1]), S.title)], [],
      [T('Name of the Institution', S.head), T('Fever', S.head), T('', S.head), T('', S.head), T('LAB', S.head), T('', S.head)],
      [T('', S.head), T('OP', S.head), T('IP', S.head), T('Dengue +ve IP', S.head), T('Widal tested', S.head), T('Widal +ve', S.head)],
      [T(cfg.inst + ' GH', S.sub), T(g('fev_op'), S.num), T(g('fev_ip'), S.num), T(g('den_pos_ip'), S.num), T(g('widal_test'), S.num), T(g('widal_pos'), S.num)], [],
      [T('Lab report', S.head), T('Dengue', S.head), T('', S.head), T('Scrub typhus', S.head), T('', S.head), T('Typhoid', S.head), T('', S.head), T('Malaria', S.head), T('', S.head), T('Leptospirosis', S.head), T('', S.head)],
      [T('', S.head)].concat([1, 2, 3, 4, 5].reduce(function (a) { return a.concat([T('Tested', S.head), T('+ve', S.head)]); }, [])),
      [T(M.mon, S.sub), T(g('den_test'), S.num), T(g('den_pos'), S.num), T(g('scrub_test'), S.num), T(g('scrub_pos'), S.num), T(g('widal_test'), S.num), T(g('widal_pos'), S.num), T(g('mal_test'), S.num), T(g('mal_pos'), S.num), T(g('lepto_test'), S.num), T(g('lepto_pos'), S.num)],
      [], [T('DETAILS OF FEVER CASES REPORT', S.bold)],
      ['Name of Hospital', 'Fever ward beds', 'Mosquito net beds', 'Adults M', 'Adults F', 'Paediatrics', "Window's mesh", 'IHIP fever portal entry', 'Nodal officer', 'Contact no.', 'Month', 'IP fever – Male', 'IP fever – Female', 'Total', 'Dengue tested', 'Dengue +ve', 'Lepto tested', 'Lepto +ve', 'Scrub tested', 'Scrub +ve', 'Typhoid tested', 'Typhoid +ve'].map(function (x) { return T(x, S.head); }),
      [T(cfg.inst + ' GH', S.sub), T(cfg.feverBeds, S.num), T(cfg.netBeds, S.num), T(cfg.netAdultM, S.num), T(cfg.netAdultF, S.num), T(cfg.netPaed, S.num), T(cfg.windowMesh, S.num), T(cfg.ihip, S.num), T(cfg.feverNodal, S.cell), T(cfg.feverContact, S.cell),
        T(M.mon, S.num), T(g('fev_ip_m'), S.num), T(g('fev_ip_f'), S.num), T(g('fev_ip'), S.total), T(g('den_test'), S.num), T(g('den_pos'), S.num), T(g('lepto_test'), S.num), T(g('lepto_pos'), S.num), T(g('scrub_test'), S.num), T(g('scrub_pos'), S.num), T(g('widal_test'), S.num), T(g('widal_pos'), S.num)]];
    return { name: 'Fever ' + M.mon, title: 'Fever reports – ' + M.label, rows: rows, cols: [20, 10, 10, 10, 10, 10, 10, 10, 18, 13, 9, 9, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8],
      merges: ['A1:F1', 'A3:A4', 'B3:D3', 'E3:F3', 'A7:A8', 'B7:C7', 'D7:E7', 'F7:G7', 'H7:I7', 'J7:K7'], landscape: true };
  }

  // 13. Deliveries – TMTMT backlog beneficiary details
  function sheetDeliveries(M) {
    var g = M.g, dl = g('del_ln') + g('del_ast') + g('del_lscs');
    var rows = [[T('TMTMT Backlog Beneficiary details', S.title)], [T(dotted(M.dates[0]) + ' to ' + dotted(M.dates[M.dates.length - 1]), S.bold)], [],
      [T('Name of the Institution', S.head), T('No of Deliveries', S.head), T('No of Live birth', S.head), T('Backlog Beneficiary', S.head), T('Rings distributed', S.head)],
      [T(M.cfg.inst + ' GH', S.sub), T(dl, S.num), T(g('live_births'), S.num), T(g('tmtmt_backlog'), S.num), T(g('tmtmt_rings'), S.num)], [],
      [T('Break-up', S.head), T('Normal', S.head), T('Assisted', S.head), T('LSCS', S.head), T('Night LSCS', S.head)],
      [T(M.mon, S.sub), T(g('del_ln'), S.num), T(g('del_ast'), S.num), T(g('del_lscs'), S.num), T(g('del_nlscs'), S.num)]];
    return { name: 'Deliveries ' + M.mon, title: 'Deliveries & TMTMT – ' + M.label, rows: rows, cols: [24, 13, 13, 14, 13] };
  }

  // 14. MedLeaPR case status – weekly blocks and the whole month
  function medleaprRows(A, label) {
    var pmNot = Math.max(0, A.g('pm_done') - A.g('pm_frozen'));
    return [T(label, S.sub), T(A.g('pm_done'), S.num), T(A.g('pm_entered'), S.num), T(A.g('pm_frozen'), S.num), T(pmNot, pmNot ? S.warn : S.num), T(A.t('pm_reason'), S.cell),
      T(A.g('police_memo'), S.num), T(A.g('ar_done'), S.num), T(A.g('medleapr'), S.num), T(A.t('mlc_reason'), S.cell),
      T(A.g('mlc_remand'), S.num), T(A.g('remand_entered'), S.num), T(A.t('remand_reason'), S.cell)];
  }
  function sheetMedleapr(M) {
    var head2 = ['Period', 'No of Post Mortem done in the institution', 'No of Post Mortem cases entered in MedLEaPR Portal', 'No of Cases freezed within 24 Hours', 'Number of Cases not freezed', 'Reason for not freezed',
      'No of Police Memo received', 'No of AR Entries Done', 'No of Cases entered in MedLEaPR Portal', 'Reason for not entered in Portal', 'No of Entries Done', 'No of Cases entered in MedLEaPR Portal', 'Reason for not entered in Portal'];
    var rows = [[T('MedLEaPR Case Status – ' + M.cfg.inst + ' GH – ' + M.label, S.title)], [],
      [T('', S.head), T('PM Cases', S.head), T('', S.head), T('', S.head), T('', S.head), T('', S.head), T('MLC', S.head), T('', S.head), T('', S.head), T('', S.head), T('Remand', S.head), T('', S.head), T('', S.head)],
      head2.map(function (x) { return T(x, S.head); })];
    weeks(M).forEach(function (w) { rows.push(medleaprRows(rangeAgg(w), dotted(w[0]) + ' to ' + dotted(w[w.length - 1]))); });
    rows.push(medleaprRows(rangeAgg(M.dates), 'Month ' + dotted(M.dates[0]) + ' to ' + dotted(M.dates[M.dates.length - 1])));
    var last = rows[rows.length - 1]; last.forEach(function (c) { if (c.s === S.num || c.s === S.sub) c.s = S.total; });
    return { name: 'MedLeaPR ' + M.mon, title: 'MedLEaPR case status – ' + M.label, rows: rows, cols: [24, 12, 13, 12, 11, 20, 11, 11, 13, 20, 11, 13, 20], merges: ['B3:F3', 'G3:J3', 'K3:M3'], landscape: true };
  }

  // 15. HMIS ABHA count report
  function sheetAbha(M) {
    var rows = [[T('Health Management Information System', S.title)], [T(M.cfg.hospital, S.bold)], [T(M.cfg.inst + ', ' + M.cfg.district, S.normal)],
      [T('ABHA Count Report Between ' + dotted(M.dates[0]) + ' TO ' + dotted(M.dates[M.dates.length - 1]), S.bold)],
      ['S.No', 'Date', 'Total Registrations', 'ABHA ID Linked through Mobile OTP', 'ABHA ID Linked through Aadhaar OTP', 'ABHA ID Linked through Aadhaar Biometrics', 'ABHA ID Linked through other', 'Total ABHA ID Linked', 'ABHA created in OP (A)', 'ABHA created in TAEI (B)', 'Other ID / attenders (C)', 'Total A+B+C'].map(function (x) { return T(x, S.head); })];
    var K = ['abha_reg', 'abha_mob', 'abha_aotp', 'abha_bio', 'abha_oth', 'abha_tot', 'abha_op', 'abha_taei', 'abha_att', 'abha_abc'];
    M.days.forEach(function (d, i) { rows.push([T(i + 1, S.num), T(dmy(d.date), S.cell)].concat(K.map(function (k) { return T(d.any && !isBlank(d.v[k]) && (SC.ROW[k].t === 'calc' ? hasAny(d, SC.ROW[k].sum) : true) ? num(d.v[k]) : '', S.num); }))); });
    rows.push([T('Total', S.sub), T('', S.sub)].concat(K.map(function (k) { return T(M.g(k), S.total); })));
    return { name: 'ABHA ' + M.mon, title: 'ABHA count report – ' + M.label, rows: rows, cols: [6, 12, 12, 12, 12, 13, 12, 12, 11, 11, 12, 10], freeze: { r: 5, c: 2 } };
  }
  function hasAny(d, keys) { return keys.some(function (k) { return !isBlank(d.raw[k]); }); }

  // 16. HMIS vs manual register (ISMR) – daily capture gap
  function sheetHmis(M) {
    var P = [['OP', 'op_tot', 'hm_op'], ['IP admissions', 'na_tot', 'hm_ip'], ['Lab investigations', 'lab_tot', 'hm_lab'], ['Discharges', 'dis_tot', 'hm_dis']];
    var rows = [[T('HMIS ENTRY vs MANUAL REGISTER – ' + M.label, S.title)], [T('Manual = daily census in this app (ISMR). Gap = manual − HMIS.', S.normal)], [],
      [T('Date', S.head)].concat(P.reduce(function (a, p) { return a.concat([T(p[0] + ' – manual', S.head), T('HMIS', S.head), T('Gap', S.head)]); }, []))];
    M.days.forEach(function (d) {
      var row = [T(dmy(d.date), S.cell)];
      P.forEach(function (p) {
        var a = d.any ? num(d.v[p[1]]) : '', b = d.any && !isBlank(d.raw[p[2]]) ? num(d.raw[p[2]]) : '';
        var gap = a !== '' && b !== '' ? a - b : '';
        row.push(T(a, S.num), T(b, S.num), T(gap, gap > 0 ? S.warn : S.num));
      });
      rows.push(row);
    });
    var tot = [T('Total', S.sub)], pct = [T('% entered in HMIS', S.sub)];
    P.forEach(function (p) { var a = M.g(p[1]), b = M.g(p[2]); tot.push(T(a, S.total), T(b, S.total), T(a - b, S.total)); pct.push(T('', S.num), T(div(b, a, 100), S.pct), T('', S.num)); });
    rows.push(tot, pct);
    return { name: 'HMIS vs manual ' + M.mon, title: 'HMIS entry vs manual register – ' + M.label, rows: rows, cols: [12, 10, 9, 8, 10, 9, 8, 10, 9, 8, 10, 9, 8], freeze: { r: 4, c: 1 }, landscape: true };
  }

  // 10. VED analysis & drug indent (TNMSC)
  function drugs() { var d = DB.get('cfg/drugs'); return d ? d.list : []; }
  function vedCalc(d, cfg) {
    var buf = num((cfg.buffer || {})[d.ved]); if (!(d.ved in (cfg.buffer || {}))) buf = SC.VED_BUFFER[d.ved] || 0;
    var cover = num(cfg.reviewMonths) + num(cfg.leadMonths);
    var amc = num(d.amc), stock = num(d.stock), onOrder = num(d.onOrder), mult = num(d.mult);
    var safety = Math.ceil(amc * buf), max = Math.ceil(amc * cover + safety), net = Math.max(0, max - stock - onOrder);
    var qty = mult > 0 ? Math.ceil(net / mult) * mult : net;
    var status = stock > max ? 'OVERSTOCK' : stock < safety ? (d.ved === 'V' ? 'CRITICAL' : 'BELOW BUFFER') : 'OK';
    return { buf: buf, safety: safety, cover: cover, max: max, net: net, qty: qty, value: round(qty * num(d.rate), 2), status: status };
  }
  function sheetVed(monthLabel) {
    var cfg = settings(), list = drugs();
    var rows = [[T(cfg.hospital.toUpperCase() + '  —  PHARMACY', S.title)], [T('VED ANALYSIS & MONTHLY DRUG INDENT  –  TNMSC', S.bold)],
      [T('Indent Month: ' + monthLabel + '     |     Doc No: ' + cfg.vedDoc, S.normal)], [],
      ['S.No', 'Drug Name', 'Strength / Form', 'Therapeutic Category', 'VED', 'Unit', 'Unit Rate (₹)', 'AMC', 'Current Stock', 'On Order', 'Buffer (mo)', 'Safety Stock', 'Coverage (mo)', 'Max Stock', 'Net Need', 'Order Mult.', 'Indent Qty', 'Indent Value (₹)', 'Status', 'Remarks'].map(function (h) { return T(h, S.head); })];
    var tv = 0, cls = { V: [0, 0], E: [0, 0], D: [0, 0] };
    list.forEach(function (d, i) {
      var c = vedCalc(d, cfg); tv += c.value; if (cls[d.ved]) { cls[d.ved][0]++; cls[d.ved][1] += c.value; }
      rows.push([T(i + 1, S.num), T(d.name, S.cell), T(d.strength, S.cell), T(d.cat, S.cell), T(d.ved, S.num), T(d.unit, S.num), T(num(d.rate), S.num), T(num(d.amc), S.num), T(num(d.stock), S.num), T(num(d.onOrder), S.num),
        T(c.buf, S.num), T(c.safety, S.num), T(c.cover, S.num), T(c.max, S.num), T(c.net, S.num), T(num(d.mult), S.num), T(c.qty, S.total), T(c.value, S.total), T(c.status, c.status === 'OK' ? S.num : S.warn), T(d.remarks || '', S.cell)]);
    });
    rows.push([T('', S.sub), T('TOTAL INDENT VALUE (₹)', S.sub)].concat([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(function () { return T('', S.sub); }), [T(round(tv, 2), S.total)]));
    rows.push([]);
    rows.push([T('VED distribution', S.head), T('Items', S.head), T('Indent value (₹)', S.head)]);
    [['Vital (V)', 'V'], ['Essential (E)', 'E'], ['Desirable (D)', 'D']].forEach(function (x) { rows.push([T(x[0], S.cell), T(cls[x[1]][0], S.num), T(round(cls[x[1]][1], 2), S.num)]); });
    return { name: 'VED Indent', title: 'VED analysis & drug indent – ' + monthLabel, rows: rows, cols: [5, 30, 16, 24, 5, 7, 9, 7, 9, 8, 8, 9, 9, 9, 9, 8, 9, 12, 13, 18], freeze: { r: 5, c: 2 }, landscape: true };
  }

  G.REP = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, MONTHS: MONTHS, settings: settings, day: day, compute: compute, validate: validate, unusual: unusual, month: month,
    dailyText: dailyText, attendanceSummary: attendanceSummary, cleaningSummary: cleaningSummary, cleaningSummaryFrom: cleaningSummaryFrom, rawDayMerged: rawDayMerged, cleanAreas: cleanAreas, staffList: staffList,
    sheetTaeiDaily: sheetTaeiDaily, sheetOther: sheetOther, sheetKpi: sheetKpi, kpiMonthly: kpiMonthly, sheetPerf: sheetPerf, sheetCm: sheetCm, sheetRegistry: sheetRegistry,
    sheetSummary: sheetSummary, sheetAttendance: sheetAttendance, sheetCleaning: sheetCleaning, sheetRegister: sheetRegister, registerRecords: registerRecords,
    sheetVed: sheetVed, vedCalc: vedCalc, drugs: drugs, rangeAgg: rangeAgg,
    sheetReferral: sheetReferral, sheetFever: sheetFever, sheetDeliveries: sheetDeliveries, sheetMedleapr: sheetMedleapr, sheetAbha: sheetAbha, sheetHmis: sheetHmis,
    util: { pad: pad, iso: iso, parse: parse, addDays: addDays, daysIn: daysIn, monthDates: monthDates, dmy: dmy, dow: dow, num: num, isBlank: isBlank, round: round },
  };
})(typeof window !== 'undefined' ? window : globalThis);
