/* NCD monthly 7-sheet report (Dialysis, Echo, Stroke, ICU, Hypertension, VIA colposcopy, Ca breast).
 * A monthly form stored at mon/<YYYY-MM>/ncd. Totals that the daily entries already hold are filled
 * in automatically (shown as "from daily") until someone types a different figure.
 * Column spec: [group, label, key, kind, auto]
 *   kind: 'n' number | 'mf' male/female/total triple (keys key_m, key_f; total = m + f) | 'txt' | 'calc'
 *   auto: daily key (or function of month totals) used when the field is left blank.
 */
(function (G) {
  'use strict';
  var REP = G.REP, DB = G.DB, X = G.XLSX, S = X.S, U = REP.util;

  var SHEETS = [
    { id: 'dialysis', title: 'DIALYSIS REPORT', cols: [
      ['Basic Information', 'Nodal Officer Name with Qualification', 'dl_nodal', 'txt'], ['Basic Information', 'Designation (AS/SAS/CS/SCS etc.)', 'dl_desig', 'txt'], ['Basic Information', 'Contact Details', 'dl_contact', 'txt'],
      ['Hemodialysis Machine Information', 'RO Plant Capacity in LPH', 'dl_ro', 'n'], ['Hemodialysis Machine Information', 'Machines supplied', 'dl_sup', 'n'], ['Hemodialysis Machine Information', 'Machines Functional', 'dl_func', 'n'],
      ['Hemodialysis Machine Information', 'Machines Under Repair', 'dl_rep', 'n'], ['Hemodialysis Machine Information', 'Machines Idle / Yet to be Installed', 'dl_idle', 'n'], ['Hemodialysis Machine Information', 'Machines for positive cases', 'dl_pos', 'n'],
      ['Hemodialysis Machine Information', 'Additional Machines required', 'dl_add', 'n'],
      ['Patient Information', 'Old Patients – Female', 'dl_old_f', 'n'], ['Patient Information', 'Old Patients – Male', 'dl_old_m', 'n'], ['Patient Information', 'New Patients – Female', 'dl_new_f', 'n'], ['Patient Information', 'New Patients – Male', 'dl_new_m', 'n'],
      ['Patient Information', 'Total Patients – old & new, male & female', 'dl_pt_tot', 'calc', function (v) { return sum(v, ['dl_old_f', 'dl_old_m', 'dl_new_f', 'dl_new_m']); }],
      ['Patient Information', 'No. of Normal Patients', 'dl_normal', 'n'], ['Patient Information', 'No. of Sero-Positive Patients', 'dl_sero', 'n'],
      ['Patient Information', 'Total Patients (Normal + Positive)', 'dl_np', 'calc', function (v) { return sum(v, ['dl_normal', 'dl_sero']); }], ['Patient Information', 'No. of Patients in Wish List', 'dl_wish', 'n'],
      ['Cycle Information', 'Total No. of Cycles done during the month', 'dl_cyc', 'n'], ['Cycle Information', 'No. of Cycles for positive patients', 'dl_cyc_pos', 'n'],
      ['Cycle Information', 'Cumulative Cycles (April to this month)', 'dl_cum', 'n'], ['Cycle Information', 'Cumulative Cycles for Sero-positive patients', 'dl_cum_pos', 'n'], ['Cycle Information', 'No. of cycles covered under CMCHIS', 'dl_cmchis', 'n'],
      ['HR Information', 'No. of Trained Doctors Available', 'dl_doc', 'n'], ['HR Information', 'No. of Trained Staff Nurses Available', 'dl_sn', 'n'], ['HR Information', 'No. of Dialysis Technicians Available', 'dl_tech', 'n'],
      ['', 'No. of Machines (functional − positive machines)', 'dl_m_net', 'calc', function (v) { return dif(v, 'dl_func', 'dl_pos'); }],
      ['', 'No. of Cycles done (total − positive cycles)', 'dl_c_net', 'calc', function (v) { return dif(v, 'dl_cyc', 'dl_cyc_pos'); }],
      ['', 'Average Number of Cycles done per Machine per day', 'dl_avg', 'calc', function (v, M) { var m = dif(v, 'dl_func', 'dl_pos'), c = dif(v, 'dl_cyc', 'dl_cyc_pos'); return m && c !== '' ? U.round(c / m / M.nDays, 2) : ''; }],
      ['', 'REMARKS', 'dl_rem', 'txt']] },
    { id: 'echo', title: 'ECHO REPORT', cols: [
      ['ECHO EQUIPMENT', 'Available', 'ec_av', 'n'], ['ECHO EQUIPMENT', 'Working', 'ec_wk', 'n'], ['ECHO EQUIPMENT', 'Not Working', 'ec_nw', 'n'],
      ['', 'Patients Undergone Echo during the month', 'ec_pts', 'n'], ['NO OF TRAINED PERSON', 'Cardiologist', 'ec_card', 'n'], ['NO OF TRAINED PERSON', 'ECHO Trained Physician', 'ec_phys', 'n']] },
    { id: 'stroke', title: 'STROKE REPORT', cols: [
      ['CT MACHINE', 'Available', 'sk_av', 'n'], ['CT MACHINE', 'Working', 'sk_wk', 'n'], ['CT MACHINE', 'Not Working', 'sk_nw', 'n'], ['CT MACHINE', 'Not Installed / Waiting for Installation', 'sk_ni', 'n'],
      ['Total Number of CT Done', '', 'sk_ct', 'mf', 'ct'], ['STROKE Patients Underwent CT', '', 'sk_stct', 'mf', 'st_ct'], ['New Stroke Patients', '', 'sk_new', 'mf', 'st_tot'],
      ['New Stroke Patients Underwent CT', '', 'sk_newct', 'mf'], ['New Stroke Patients who underwent CT within 4.5 hours of onset of symptoms', '', 'sk_45', 'mf'],
      ['… and found to be Non-Haemorrhagic Stroke', 'Total', 'sk_45nh', 'n'], ['Stroke Patients Thrombolysed with TPA (e.g. Alteplase)', 'Total', 'sk_tpa', 'n', 'st_lysis']] },
    { id: 'icu', title: 'ICU REPORT', cols: [
      ['', 'Bed Strength', 'icu_beds', 'n', function (M) { return M.cfg.sanctionedBeds; }],
      ['NEW STEMI Patients', 'New STEMI Patients during the month', 'icu_stemi', 'mf', 'mi_stemi'],
      ['NEW STEMI – THROMBOLYSIS', 'Thrombolysed with Streptokinase', 'icu_st_lys', 'mf', 'mi_lysis'],
      ['NEW STEMI – THROMBOLYSIS', 'Transferred to HUB after thrombolysis', 'icu_st_hub_lys', 'mf'],
      ['NEW STEMI – THROMBOLYSIS', 'Transferred to HUB without thrombolysis', 'icu_st_hub', 'mf'],
      ['NEW STEMI Patients – DEATH', 'New STEMI Patients DEATH', 'icu_st_d', 'mf', 'mi_d_stemi'],
      ['NEW NON-STEMI Patients', 'New NON-STEMI Patients during the month', 'icu_nst', 'mf', 'mi_nstemi'],
      ['NEW NON-STEMI – THROMBOLYSIS', 'Thrombolysed with Streptokinase', 'icu_nst_lys', 'mf'],
      ['NEW NON-STEMI – THROMBOLYSIS', 'Transferred to HUB after thrombolysis', 'icu_nst_hub_lys', 'mf'],
      ['NEW NON-STEMI – THROMBOLYSIS', 'Transferred to HUB without thrombolysis', 'icu_nst_hub', 'mf'],
      ['NEW NON-STEMI Patients – DEATH', 'New NON-STEMI Patients DEATH', 'icu_nst_d', 'mf', 'mi_d_nstemi'],
      ['IHD Patients OTHER THAN MI', 'No. of IHD patients other than MI', 'icu_ihd', 'mf'], ['OTHER CARDIAC Patients', 'No. of other cardiac patients', 'icu_oth', 'mf'],
      ['VENTILATORS', 'Total Number of Ventilators Available', 'icu_vent', 'n']] },
    { id: 'ht', title: 'HYPERTENSION REPORT', cols: [
      ['', 'Total No. of NCD Male OP', 'ht_op_m', 'n'], ['', 'Total No. of NCD Female OP', 'ht_op_f', 'n'],
      ['', 'Total NCD OP Strength', 'ht_op_t', 'calc', function (v, M) { var t = sum(v, ['ht_op_m', 'ht_op_f']); return t === '' ? M.g('ncd_op') || '' : t; }],
      ['NEW PATIENTS HYPERTENSION', 'SCREENED for Hypertension', 'ht_scr', 'mf', 'ht_scr'], ['NEW PATIENTS HYPERTENSION', 'POSITIVE for Hypertension', 'ht_pos', 'mf', 'ht_pos'],
      ['OLD PATIENTS HYPERTENSION', 'Hypertensive patients attended FOLLOW-UP', 'ht_fu', 'mf'],
      ['NEW PATIENTS DIABETES', 'SCREENED for Diabetes', 'dm_scr', 'mf', 'dm_scr'], ['NEW PATIENTS DIABETES', 'POSITIVE for Diabetes', 'dm_pos', 'mf', 'dm_pos'],
      ['', 'BOTH Comorbidities (HT & DM) New Positive', 'htdm_new', 'n'],
      ['OLD PATIENTS DIABETES', 'Diabetes patients attended FOLLOW-UP', 'dm_fu', 'mf'], ['OLD PATIENTS', 'BOTH comorbidities (HT & DM) FOLLOW-UP', 'htdm_fu', 'mf'],
      ['Retinopathy', 'Screened – New', 'ret_new', 'n'], ['Retinopathy', 'Screened – Old (once in 3 months)', 'ret_old', 'n'], ['Retinopathy', 'Abnormal', 'ret_ab', 'n'], ['Retinopathy', 'Referred', 'ret_ref', 'n'],
      ['RFT Parameters', 'Screened – New', 'rft_new', 'n'], ['RFT Parameters', 'Screened – Old (once in 3 months)', 'rft_old', 'n'], ['RFT Parameters', 'Urine protein 1+ or Urea creatinine > 1.3', 'rft_ab', 'n'], ['RFT Parameters', 'Referred', 'rft_ref', 'n'],
      ['Foot examination', 'Abnormal (callus, ulcer, fissure)', 'ft_ab', 'n'], ['Foot examination', 'Referred', 'ft_ref', 'n'],
      ['Dental examination', 'Screened – New', 'dn_new', 'n'], ['Dental examination', 'Screened – Old (once in 3 months)', 'dn_old', 'n'], ['Dental examination', 'Referred', 'dn_ref', 'n'],
      ['TB screened in', 'New diabetic patients', 'tb_new', 'n'], ['TB screened in', 'Old diabetic patients', 'tb_old', 'n'], ['TB screened in', 'Treatment started', 'tb_tx', 'n'],
      ['', 'No. of ECG Done', 'ht_ecg', 'n', 'ecg'], ['', 'No. of Echo Done (once in 6 months)', 'ht_echo', 'n']] },
    { id: 'via', title: 'VIA COLPOSCOPY REPORT', cols: [
      ['VIA CASES', 'Number screened for cancer cervix through VIA in G.H', 'via_scr', 'n', 'via_done'], ['VIA CASES', 'Number positive for cancer cervix through VIA in G.H', 'via_pos', 'n', 'via_pos'],
      ['VIA CASES', 'VIA positive patients referred from PHC to this G.H', 'via_phc', 'n'],
      ['VIA CASES', 'Total VIA positive patients (GH + PHC referral)', 'via_tot', 'calc', function (v) { return sum(v, ['via_pos', 'via_phc']); }],
      ['VIA CASES', 'VIA positive patients referred to other G.H for colposcopy', 'via_ref', 'n'],
      ['COLPOSCOPY (MANUAL)', 'Equipment available', 'cm_av', 'n'], ['COLPOSCOPY (MANUAL)', 'Equipment working', 'cm_wk', 'n'], ['COLPOSCOPY (MANUAL)', 'Equipment not working', 'cm_nw', 'n'],
      ['COLPOSCOPY (MANUAL)', 'Total colposcopy done (manual)', 'cm_done', 'n'], ['COLPOSCOPY (MANUAL)', 'Found ABNORMAL', 'cm_ab', 'n'], ['COLPOSCOPY (MANUAL)', 'Found NORMAL', 'cm_nor', 'n'], ['COLPOSCOPY (MANUAL)', 'Colposcopy-guided biopsy taken', 'cm_bx', 'n'],
      ['VIDEO COLPOSCOPY', 'Equipment available', 'cv_av', 'n'], ['VIDEO COLPOSCOPY', 'Equipment working', 'cv_wk', 'n'], ['VIDEO COLPOSCOPY', 'Equipment not working', 'cv_nw', 'n'],
      ['VIDEO COLPOSCOPY', 'Video colposcopy performance', 'cv_done', 'n'], ['VIDEO COLPOSCOPY', 'Found ABNORMAL', 'cv_ab', 'n'], ['VIDEO COLPOSCOPY', 'Found NORMAL', 'cv_nor', 'n'], ['VIDEO COLPOSCOPY', 'Video colposcopy-guided biopsy taken', 'cv_bx', 'n'],
      ['', 'TOTAL COLPOSCOPY DONE (MANUAL + VIDEO)', 'col_tot', 'calc', function (v) { return sum(v, ['cm_done', 'cv_done']); }],
      ['BIOPSY', 'Number of NORMAL reports', 'bx_nor', 'n'], ['BIOPSY', 'CIN 1 report', 'bx_c1', 'n'], ['BIOPSY', 'CIN 2 report', 'bx_c2', 'n'], ['BIOPSY', 'CIN 3 report', 'bx_c3', 'n'],
      ['BIOPSY', 'Cancer cervix confirmed patients', 'bx_ca', 'n'], ['BIOPSY', 'Report not yet collected', 'bx_pend', 'n'],
      ['CRYOTHERAPY', 'Equipment available', 'cr_av', 'n'], ['CRYOTHERAPY', 'Equipment working', 'cr_wk', 'n'], ['CRYOTHERAPY', 'Equipment not working', 'cr_nw', 'n'], ['CRYOTHERAPY', 'Total cryotherapy done', 'cr_done', 'n'], ['CRYOTHERAPY', 'Cryotherapy patients followed up', 'cr_fu', 'n'],
      ['WERTHEIMS / RADIOTHERAPY', 'Old patients', 'wr_old', 'n'], ['WERTHEIMS / RADIOTHERAPY', 'New patients', 'wr_new', 'n'], ['WERTHEIMS / RADIOTHERAPY', "Wertheim's hysterectomy done", 'wr_wh', 'n'],
      ['WERTHEIMS / RADIOTHERAPY', 'Radiotherapy / chemotherapy given', 'wr_rt', 'n'], ['WERTHEIMS / RADIOTHERAPY', 'CA patients referred to higher centre', 'wr_ref', 'n'],
      ['', 'Number of OG-cians available', 'og_n', 'n'], ['', 'Number of NCD staff in position', 'ncd_staff', 'n']] },
    { id: 'breast', title: 'CA BREAST', cols: [
      ['CA BREAST', 'Total number of woman outpatients', 'br_wop', 'n', function (M) { return M.g('op_af') || ''; }],
      ['CA BREAST', 'Clinical Breast Examination done', 'br_cbe', 'n', 'cbe_done'], ['CA BREAST', 'Clinical Breast Examination found positive', 'br_pos', 'n', 'cbe_pos'],
      ['MAMMOGRAPHY', 'Equipment available', 'mm_av', 'n'], ['MAMMOGRAPHY', 'Equipment working', 'mm_wk', 'n'], ['MAMMOGRAPHY', 'Equipment not working', 'mm_nw', 'n'],
      ['MAMMOGRAPHY', 'Mammography done', 'mm_done', 'n'], ['MAMMOGRAPHY', 'Mammography found positive', 'mm_pos', 'n'],
      ['', 'Number of FNAC taken', 'br_fnac', 'n'], ['', 'Number of biopsy done', 'br_bx', 'n'], ['', 'Cancer breast confirmed patients', 'br_ca', 'n'],
      ['', 'Patients referred to higher centre', 'br_ref', 'n'], ['', 'Radiologists available', 'br_rad', 'n'], ['', 'Radiographers (technicians) available', 'br_tech', 'n']] },
  ];
  // Fields that describe equipment / staff carry forward from the previous month.
  var CARRY = /(_av|_wk|_nw|_ni|_nodal|_desig|_contact|_ro|_sup|_func|_rep|_idle|_add|_doc|_sn|_tech|_card|_phys|_vent|^og_n|^ncd_staff|_rad|^icu_beds)$/;

  function num(v) { return v === '' || v == null ? '' : +v; }
  function sum(v, keys) { var any = false, t = 0; keys.forEach(function (k) { if (v[k] !== '' && v[k] != null) { any = true; t += +v[k]; } }); return any ? t : ''; }
  function dif(v, a, b) { return v[a] === '' || v[a] == null ? '' : (+v[a]) - (+v[b] || 0); }
  function key(M) { return 'mon/' + M.y + '-' + U.pad(M.m) + '/ncd'; }

  // Resolve every value for the month: entered value, else auto value from daily data.
  function resolve(M) {
    var env = DB.get(key(M)), v = Object.assign({}, env ? env.v : {}), out = {}, src = {};
    function autoOf(auto) { if (!auto) return ''; if (typeof auto === 'function') return auto(M); var x = M.g(auto); return x || ''; }
    SHEETS.forEach(function (sh) {
      sh.cols.forEach(function (c) {
        var k = c[2], kind = c[3];
        if (kind === 'mf') {
          out[k + '_m'] = num(v[k + '_m']); out[k + '_f'] = num(v[k + '_f']);
          var t = sum(out, [k + '_m', k + '_f']);
          if (t === '') { t = autoOf(c[4]); if (t !== '') src[k + '_t'] = 'auto'; }
          out[k + '_t'] = t;
        } else if (kind === 'n' || kind === 'txt') {
          if (v[k] != null && v[k] !== '') out[k] = kind === 'n' ? +v[k] : v[k];
          else { out[k] = autoOf(c[4]); if (out[k] !== '') src[k] = 'auto'; }
        }
      });
    });
    SHEETS.forEach(function (sh) { sh.cols.forEach(function (c) { if (c[3] === 'calc') out[c[2]] = c[4](out, M); }); });
    return { v: out, src: src, entered: v, env: env };
  }

  function sheetSpecs(M) {
    var cfg = M.cfg, R = resolve(M).v;
    return SHEETS.map(function (sh) {
      var g1 = ['S.No', 'District', 'Hospital', 'Type', 'Mobile number of staff in-charge'], g0 = ['', '', '', '', ''], vals = [1, cfg.district.toUpperCase(), cfg.inst.toUpperCase(), 'TK', cfg.ncdMobile || cfg.contact || ''];
      sh.cols.forEach(function (c) {
        if (c[3] === 'mf') {
          ['Male', 'Female', 'Total'].forEach(function (s, i) { g0.push(c[0]); g1.push((c[1] ? c[1] + ' – ' : '') + s); vals.push(R[c[2] + ['_m', '_f', '_t'][i]]); });
        } else { g0.push(c[0]); g1.push(c[1]); vals.push(R[c[2]]); }
      });
      if (sh.id === 'icu') [g0, g1, vals].forEach(function (a) { a.splice(4, 0, a.splice(5, 1)[0]); }); // Bed Strength sits before the mobile number
      var title = sh.title + ' – ' + M.label;
      var rows = [[T(title, S.title)], g0.map(function (x) { return T(x, S.head); }), g1.map(function (x) { return T(x, S.head); }),
        g1.map(function (x, i) { return T(i + 1, S.num); }), vals.map(function (x, i) { return T(x === '' || x == null ? '-' : x, i < 5 ? S.cell : S.num); })];
      // merge identical adjacent group headers
      var merges = [], start = 5;
      for (var i = 6; i <= g0.length; i++) {
        if (i === g0.length || g0[i] !== g0[start]) { if (g0[start] && i - 1 > start) merges.push(X.colName(start) + '2:' + X.colName(i - 1) + '2'); start = i; }
      }
      return { name: sh.title.replace(' REPORT', '').slice(0, 24), title: title, rows: rows, cols: g1.map(function (x, i) { return i < 5 ? [5, 14, 16, 6, 14][i] : 12; }), merges: merges, freeze: { r: 3, c: 3 }, landscape: true };
    });
  }
  function T(v, s) { return { v: v, s: s }; }

  // ---------------- monthly NCD form
  G.UI.route('ncd', function () {
    var UI = G.UI, h = UI.h, mm = UI.state.month || UI.defaultMonth(), M = REP.month(mm.y, mm.m), R = resolve(M), k = key(M);
    var ent = Object.assign({}, R.entered);
    function inp(fk, auto) {
      var v = ent[fk]; return '<input type="number" inputmode="numeric" min="0" step="any" data-nk="' + fk + '" value="' + h(v == null ? '' : v) + '" placeholder="' + h(auto === '' || auto == null ? '' : auto) + '">';
    }
    UI.render(UI.topbar('NCD monthly report', '7 sheets · ' + M.label, 'reports') + '<div class="wrap">' + UI.monthbar(mm.y, mm.m) +
      '<div class="note info small">Grey numbers in empty boxes come from the daily entries and are used unless you type a different figure. Equipment and staff counts can be copied from last month.</div>' +
      '<div class="btns"><button class="btn ghost" id="carry">Copy equipment & staff from last month</button><a class="btn pri" href="#report/ncd">View report</a></div>' +
      SHEETS.map(function (sh, si) {
        return '<details class="grp"' + (si === 4 ? ' open' : '') + '><summary><b>' + h(sh.title) + '</b></summary><div class="ncdgrid">' + sh.cols.map(function (c) {
          var label = (c[0] ? '<small>' + h(c[0]) + '</small>' : '') + h(c[1] || '');
          if (c[3] === 'calc') return '<div class="nrow calcrow"><label>' + label + '</label><span class="calc" data-ncalc="' + c[2] + '">' + h(R.v[c[2]] === '' ? '–' : R.v[c[2]]) + '</span></div>';
          if (c[3] === 'txt') return '<div class="trow"><label>' + label + '</label><input type="text" data-nk="' + c[2] + '" value="' + h(ent[c[2]] || '') + '"></div>';
          if (c[3] === 'mf') return '<div class="nrow mf"><label>' + label + (R.src[c[2] + '_t'] ? '<small>Total from daily: ' + R.v[c[2] + '_t'] + '</small>' : '') + '</label><div class="mfin"><span>M</span>' + inp(c[2] + '_m') + '<span>F</span>' + inp(c[2] + '_f') + '<b data-ncalc="' + c[2] + '_t">' + h(R.v[c[2] + '_t'] === '' ? '–' : R.v[c[2] + '_t']) + '</b></div></div>';
          return '<div class="nrow"><label>' + label + '</label>' + inp(c[2], R.src[c[2]] ? R.v[c[2]] : '') + '</div>';
        }).join('') + '</div></details>';
      }).join('') + '</div>', 'reports');
    function refresh() {
      var R2 = resolve(M);
      UI.$$('[data-ncalc]').forEach(function (el) { var x = R2.v[el.dataset.ncalc]; el.textContent = x === '' || x == null ? '–' : x; });
    }
    UI.$('#app').addEventListener('input', function (e) {
      var fk = e.target.dataset.nk; if (!fk) return;
      if (e.target.value === '') delete ent[fk]; else ent[fk] = e.target.type === 'number' ? +e.target.value : e.target.value;
      UI.debounce(k, function () { DB.put(k, { v: ent }); UI.flashSaved(); refresh(); }, 400);
    });
    UI.$('#carry').onclick = function () {
      var p = new Date(M.y, M.m - 2, 1), pk = 'mon/' + p.getFullYear() + '-' + U.pad(p.getMonth() + 1) + '/ncd', pe = DB.get(pk);
      if (!pe) { UI.toast('No NCD report saved for last month', true); return; }
      var n = 0; Object.keys(pe.v).forEach(function (fk) { if (CARRY.test(fk) && (ent[fk] == null || ent[fk] === '')) { ent[fk] = pe.v[fk]; n++; } });
      DB.put(k, { v: ent }); UI.toast(n + ' figures copied'); UI.dispatch();
    };
  });

  G.NCD = { SHEETS: SHEETS, resolve: resolve, sheetSpecs: sheetSpecs };
})(window);
