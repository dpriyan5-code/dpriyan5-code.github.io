/* GH-UTM Daybook — data definitions.
 * DAILY_ROWS follows the prescribed "TAEI Daily Report" sheet row-for-row (same order and labels),
 * so the monthly sheet can be rebuilt exactly. EXTRA_ROWS hold items needed for the KPI sheet,
 * M.O. review and ranking indicators; they export to a separate "Other Services" sheet.
 * Row fields: k key · l [col A, col B, col C] labels · m module · g entry-screen group · s short label
 *   t: 'n' number (default) | 'txt' text | 'sel' choice | 'calc' computed | 'hd' heading-only row
 *   agg: 'sum' (default) | 'last' (cumulative money figures — month takes latest entry) | 'text'
 */
(function (G) {
  'use strict';
  var rows = [];
  var cur = { l1: '', m: '', g: '' };
  function sec(l1, m, g) { cur = { l1: l1, m: m, g: g || l1 }; }
  function r(k, l2, l3, o) {
    o = o || {};
    rows.push({
      k: k, l: [o.l1 != null ? o.l1 : cur.l1, l2 || '', l3 || ''], m: o.m || cur.m, g: o.g || cur.g,
      s: o.s || l3 || l2 || cur.l1, t: o.t || 'n', sum: o.sum, fn: o.fn, agg: o.agg || (o.t === 'txt' || o.t === 'sel' ? 'text' : 'sum'),
      opts: o.opts, hint: o.hint,
    });
  }
  var MF = function (p, l1, label) {
    r(p + '_am', 'ADULT', 'MALE', { s: 'Adult – Male' });
    r(p + '_af', 'ADULT', 'FEMALE', { s: 'Adult – Female' });
    r(p + '_mch', 'CHILD', 'MCH', { s: 'Child – Male (MCH)' });
    r(p + '_fch', 'CHILD', 'FCH', { s: 'Child – Female (FCH)' });
    r(p + '_tot', label, '', { t: 'calc', sum: [p + '_am', p + '_af', p + '_mch', p + '_fch'], s: 'Total' });
  };

  sec('DMO', 'meta', 'Duty');
  r('dmo', '', '', { t: 'txt', s: 'DMO (Duty Medical Officer)' });
  r('filledby', '', '', { t: 'txt', s: 'Report filled by', l1: 'REPORT FILLED BY' });

  sec('GENERAL - TOTAL', 'op', 'OP census');
  MF('op', 'GENERAL - TOTAL', 'TOTAL OP');

  sec('IP MIDNIGHT CENSUS', 'ip', 'Midnight census');
  MF('mc', 'IP MIDNIGHT CENSUS', 'TOTAL IP (MIDNIGHT CENSUS)');
  r('bor', '', '', { l1: 'BOR', t: 'calc', s: 'Bed occupancy % (BOR)', fn: 'bor' });

  sec('IP TOTAL', 'ip', 'IP total (7:30 to 7:30)');
  MF('ipt', 'IP TOTAL', 'TOTAL IP OF THE DAY (7:30 TO 7:30)');
  sec('NEW ADMISSIONS', 'ip', 'New admissions');
  MF('na', 'NEW ADMISSIONS', 'TOTAL NEW ADMISSIONS OF THE DAY (7:30 TO 7:30)');
  sec('DIET', 'ip', 'Diet');
  MF('dt', 'DIET', 'TOTAL DIET OF THE DAY (7:30 TO 7:30)');

  sec('DISCHARGES', 'ip', 'Discharges');
  r('dis_n', 'NORMAL', '', { s: 'Normal discharge' });
  r('dis_lama', 'LAMA', '', { s: 'LAMA' });
  r('dis_absc', 'ABSCONDED', '', { s: 'Absconded' });
  r('dis_tot', 'TOTAL DIS', '', { t: 'calc', sum: ['dis_n', 'dis_lama', 'dis_absc'], s: 'Total discharges' });
  r('bed_days', '', 'PATIENT BED DAYS', { l1: 'SUM OF NO. OF DAYS OF STAY OF ALL THE PTS DISCHARGED', t: 'calc', sum: ['mc_tot'], s: 'Patient bed days (= midnight census)' });

  sec('No of cases received IN TAEI', 'emg', 'TAEI cases received');
  r('te_op_m', 'OP', 'Male', { s: 'OP – Male' });
  r('te_op_f', 'OP', 'Female', { s: 'OP – Female' });
  r('te_op_t', 'OP', 'Total', { t: 'calc', sum: ['te_op_m', 'te_op_f'], s: 'OP – Total' });
  r('te_ip_m', 'IP', 'Male', { s: 'IP – Male' });
  r('te_ip_f', 'IP', 'Female', { s: 'IP – Female' });
  r('te_ip_t', 'IP', 'Total', { t: 'calc', sum: ['te_ip_m', 'te_ip_f'], s: 'IP – Total' });
  r('te_tot', '', '', { l1: 'Total OP/IP (TAEI ALONE)', t: 'calc', sum: ['te_op_t', 'te_ip_t'], s: 'Total OP + IP (TAEI)' });

  sec('SCHEME', 'ip', 'Insurance schemes');
  r('sch_cmchis', '', 'CMCHIS', { s: 'CMCHIS' });
  r('sch_ikt', '', 'IKT', { s: 'IKT (Innuyir Kappom)' });

  sec('ANTI RABIES', 'emg', 'Anti-rabies');
  r('arv_doses', '', 'ARV DOSES', { s: 'ARV doses (total)' });
  r('arv_new', '', 'NEW ARV Doses', { s: 'New ARV cases (1st dose)' });
  r('hrig', '', 'HRIG', { s: 'HRIG given' });
  r('pai', '', '', { l1: 'No. Of Cases PAI', g: 'Trauma', s: 'PAI cases' });

  var REG = [['poison', 'Poison'], ['trauma', 'Trauma'], ['mi', 'MI'], ['stroke', 'Stroke'], ['burns', 'Burns'], ['prem', 'PREM'], ['others', 'Others']];
  [['r108', 'TAEI Registry 108', '108', 'TAEI registry – via 108'], ['rn', 'TAEI Registry Non 108', 'Non 108', 'TAEI registry – non-108']].forEach(function (x) {
    sec(x[1], 'emg', x[3]);
    REG.forEach(function (c) {
      r(x[0] + '_' + c[0] + '_rec', c[1], 'Received', { s: c[1] + ' – received' });
      r(x[0] + '_' + c[0] + '_ent', c[1], 'Entry', { s: c[1] + ' – entered in portal' });
    });
    r(x[0] + '_tot_rec', 'Total', 'Received', { l1: x[2], t: 'calc', sum: REG.map(function (c) { return x[0] + '_' + c[0] + '_rec'; }), s: 'Total received' });
    r(x[0] + '_tot_ent', 'Total', 'Entry', { l1: x[2], t: 'calc', sum: REG.map(function (c) { return x[0] + '_' + c[0] + '_ent'; }), s: 'Total entered' });
  });

  sec('Triage Category', 'emg', 'Triage');
  r('tg_red', 'Red', '', { s: 'Red' });
  r('tg_yel', 'Yellow', '', { s: 'Yellow' });
  r('tg_grn', 'Green', '', { s: 'Green' });
  r('tg_blk', 'Black', '', { s: 'Black' });
  r('tg_tot', 'Total', '', { t: 'calc', sum: ['tg_red', 'tg_yel', 'tg_grn', 'tg_blk'], s: 'Triage total' });
  r('crit', '', 'NO. OF CRITICAL EMERGENCIES', { l1: 'MI, CVA, MAJOR TRAUMA, RED ZONE, POISON, SNAKE BITE, REFERRALS', s: 'Critical emergencies (MI, CVA, major trauma, red, poison, snake bite, referrals)' });

  sec('Referral out (Non ANC)', 'ip', 'Referrals & deaths');
  r('ref_nonanc', '', '', { s: 'Referral out (non-ANC)' });
  r('ref_anc', '', '', { l1: 'REF. OUT (ANC)', s: 'Referral out (ANC)' });
  r('ref_reason', '', '', { l1: 'Reason for referral', t: 'txt', s: 'Reason(s) for referral' });
  r('d_bd', '', 'BROUGHT DEAD', { l1: 'DEATHS', s: 'Brought dead' });
  r('d_ip', '', 'IP DEAD', { l1: 'DEATHS', s: 'IP death' });
  r('d_tot', '', 'TOTAL', { l1: 'DEATHS', t: 'calc', sum: ['d_bd', 'd_ip'], s: 'Total deaths' });

  sec('MLC 1', 'emg', 'MLC');
  var MLC = [['rta', 'RTA'], ['assault', 'ASSAULT'], ['poison', 'POISON'], ['bites', 'BITES'], ['selffall', 'ACCIDENTAL SELF FALL'], ['occ', 'OCCUPATIONAL INJURY'], ['sexual', 'SEXUAL ASSAULT'], ['selfinf', 'Self inflicted wounds'], ['burns', 'BURNS'], ['hi', 'HEAD INJURY'], ['fall', 'FALL FROM HEIGHT'], ['hanging', 'HANGING'], ['drown', 'DROWNING'], ['others', 'OTHERS']];
  MLC.forEach(function (c) { r('mlc_' + c[0], '', c[1], { s: c[1].charAt(0) + c[1].slice(1).toLowerCase() }); });
  r('mlc_tot', '', 'TOTAL', { t: 'calc', sum: MLC.map(function (c) { return 'mlc_' + c[0]; }), s: 'MLC total' });
  r('mlc_remand', '', 'REMAND', { l1: 'MLC 2', s: 'Remand' });
  r('mlc_dd', '', 'DD', { l1: 'MLC 2', s: 'Dying declaration (DD)' });
  r('medleapr', '', 'MedleapR', { l1: 'MLC 3', s: 'MedLeaPR entries' });

  sec('Self Harm Cases', 'emg', 'Self harm');
  r('sh_rec', 'Received', '', { s: 'Received' });
  r('sh_trt', 'Treated', '', { s: 'Treated' });
  r('sh_ref', 'Ref. out', '', { s: 'Referred out' });
  r('sh_death', 'Death', '', { s: 'Death' });
  r('sh_consent', 'No of consent forms uploaded', '', { s: 'Consent forms uploaded' });
  r('sh_poison', '', 'Poisoning', { s: 'By poisoning' });
  r('sh_hanging', '', 'Hanging', { s: 'By hanging' });
  r('sh_selfinf', '', 'Self inflicted wounds', { s: 'Self-inflicted wounds' });
  r('sh_fall', '', 'FALL FROM HEIGHT', { s: 'Fall from height' });
  r('sh_others', '', 'Others', { s: 'Others' });

  sec('HEAD INJURY', 'emg', 'Head injury');
  r('hi_rta', '', 'RTA', { s: 'RTA' });
  r('hi_assault', '', 'ASSAULT', { s: 'Assault' });
  r('hi_selffall', '', 'ACCIDENTAL SELF FALL', { s: 'Accidental self fall' });
  r('hi_others', '', 'OTHERS', { s: 'Others' });
  r('hi_tot', '', 'TOTAL', { t: 'calc', sum: ['hi_rta', 'hi_assault', 'hi_selffall', 'hi_others'], s: 'Head injury total' });

  sec('Surgeries', 'ot', 'Surgeries');
  r('sx_major', '', 'Major', { s: 'Major surgeries' });
  r('sx_minor', '', 'Minor', { s: 'Minor surgeries' });
  r('sx_tot', '', 'Total', { t: 'calc', sum: ['sx_major', 'sx_minor'], s: 'Total surgeries' });
  sec('OT', 'ot', 'Operation theatre');
  r('ot_og', 'MAJOR OT', 'OG', { s: 'Major OT – OG' });
  r('ot_gen', 'MAJOR OT', 'Gen surgery', { s: 'Major OT – General surgery' });
  r('ot_ortho', 'MAJOR OT', 'Ortho Surgery', { s: 'Major OT – Ortho' });
  r('ot_ent', 'MAJOR OT', 'ENT', { s: 'Major OT – ENT' });
  r('ot_oph', 'MAJOR OT', 'Ophthal', { s: 'Major OT – Ophthal' });
  r('ot_minor', 'MINOR OT', 'GENERAL', { s: 'Minor OT – General' });

  sec('OG', 'ot', 'Obstetrics & Gynaecology');
  r('og_op', 'OP', 'OP', { s: 'OG OP' });
  r('og_hrop', 'OP', 'High risk OP', { s: 'High-risk OP' });
  r('og_ref', 'OP', 'Referral', { s: 'OG OP referral' });
  r('del_ln', 'Delivery', 'Delivery LN', { s: 'Delivery – Labour natural' });
  r('del_ast', 'Delivery', 'Delivery Assisted', { s: 'Delivery – Assisted' });
  r('del_lscs', 'Delivery', 'LSCS', { s: 'LSCS' });
  r('del_nlscs', 'Delivery', 'Night LSCS', { s: 'Night LSCS (of the above)' });
  r('fp_mtp', 'Family Planning', 'MTP', { s: 'MTP' });
  r('fp_tat', 'Family Planning', 'TAT/PS', { s: 'TAT / PS (sterilisation)' });
  r('fp_chayya', 'Family Planning', 'Chayya', { s: 'Chhaya' });
  r('fp_antara', 'Family Planning', 'ANTARA', { s: 'Antara' });
  r('fp_ppiucd', 'Family Planning', 'PPIUCD', { s: 'PPIUCD' });
  r('anc_ref', 'ANC', 'Referral', { s: 'ANC referral' });
  r('gyn_minor', 'gynecology', 'Minor procedures', { s: 'Gynaec minor procedures' });
  r('gyn_major', 'gynecology', 'Major procedures', { s: 'Gynaec major procedures' });
  r('og_dis', 'Discharges', '', { s: 'OG discharges' });

  sec('Emergency - TRAUMA', 'emg', 'Trauma');
  r('tm_minor', 'Minor trauma', '', { s: 'Minor trauma' });
  r('tm_major', 'Major Trauma', '', { s: 'Major trauma' });
  r('tm_tot', 'Total major+ minor', '', { t: 'calc', sum: ['tm_minor', 'tm_major'], s: 'Total trauma (major + minor)' });
  r('dept_gen', 'Emergency and Referral - DEPT WISE', 'GEN SUR', { s: 'Dept – General surgery' });
  r('dept_ortho', 'Emergency and Referral - DEPT WISE', 'Ortho', { s: 'Dept – Ortho' });
  r('dept_plas', 'Emergency and Referral - DEPT WISE', 'PLAS SUR', { s: 'Dept – Plastic surgery' });
  r('dept_ent', 'Emergency and Referral - DEPT WISE', 'ENT', { s: 'Dept – ENT' });
  r('dept_oph', 'Emergency and Referral - DEPT WISE', 'OPHTHAL', { s: 'Dept – Ophthal' });
  sec('Emergency Surgery Procedure', 'emg', 'Emergency surgery – time taken');
  r('es_lt6', 'TIME TAKEN', '< 6 HRS', { s: '< 6 hrs' });
  r('es_6_24', 'TIME TAKEN', '6-24 HRS', { s: '6–24 hrs' });
  r('es_gt24', 'TIME TAKEN', '>24 HRS', { s: '> 24 hrs' });
  r('es_tot', 'TIME TAKEN', 'TOTAL', { t: 'calc', sum: ['es_lt6', 'es_6_24', 'es_gt24'], s: 'Total' });
  r('tref_n', '', '', { l1: 'No. Of TRAUMA cases referred', g: 'Trauma referral & death', s: 'Trauma cases referred' });
  sec('Reason for referral TRAUMA', 'emg', 'Trauma referral & death');
  r('tref_spec', 'Non Availability of Specialist', '', { s: 'Reason – no specialist' });
  r('tref_equip', 'Non availability of Equipment', '', { s: 'Reason – no equipment' });
  r('tref_oth', 'Others', '', { s: 'Reason – others' });
  r('tref_oth_reason', 'If others, reason', '', { t: 'txt', s: 'If others, reason' });
  r('tref_tot', 'Total', '', { t: 'calc', sum: ['tref_spec', 'tref_equip', 'tref_oth'], s: 'Total (by reason)' });
  sec('Death TRAUMA', 'emg', 'Trauma referral & death');
  r('td_bd', 'Brought dead', '', { s: 'Trauma – brought dead' });
  r('td_ed', 'Death in ED', '', { s: 'Trauma – death in ED' });
  r('td_tot', 'Total', '', { t: 'calc', sum: ['td_bd', 'td_ed'], s: 'Trauma deaths total' });

  sec('Operational cost fund', 'admin', 'Operational cost fund');
  r('ocf_hd', '', '', { t: 'hd' });
  r('ocf_rec', '', '', { l1: 'Amount received', agg: 'last', s: 'Amount received (₹, cumulative)' });
  r('ocf_used', '', '', { l1: 'Amount Utilized', agg: 'last', s: 'Amount utilised (₹, cumulative)' });
  r('ocf_bal', '', '', { l1: 'Balance', t: 'calc', fn: 'ocfBal', agg: 'calc', s: 'Balance (₹)' });
  r('ocf_uc', '', '', { l1: 'whether UC sent Yes / No', t: 'sel', opts: ['Yes', 'No'], s: 'UC sent?' });

  sec('E FAST', 'emg', 'MI (heart attack)');
  r('efast', '', '', { s: 'E-FAST done' });
  sec('No. of MI Cases Received', 'emg', 'MI (heart attack)');
  r('mi_stemi', 'No. of STEMI', '', { s: 'STEMI' });
  r('mi_nstemi', 'No.of NSTEMI', '', { s: 'NSTEMI' });
  r('mi_tot', 'Total', '', { t: 'calc', sum: ['mi_stemi', 'mi_nstemi'], s: 'Total MI' });
  r('mi_lysis', 'No. of Thrombolysis', '', { l1: 'MI', s: 'Thrombolysis done' });
  r('cath_pci', 'No.of PCI Done', '', { l1: 'Cath Lab Procedures', s: 'PCI done' });
  r('cath_pharm', 'No.of Pharmacoinvasive therapy', '', { l1: 'Cath Lab Procedures', s: 'Pharmaco-invasive' });
  r('cath_tot', 'Total', '', { l1: 'Cath Lab Procedures', t: 'calc', sum: ['cath_pci', 'cath_pharm'], s: 'Cath lab total' });
  r('mi_refin', 'Ref.in Cases', '', { l1: 'Referred Cases - MI', s: 'MI referred in' });
  r('mi_refout', 'Ref. Out Cases', '', { l1: 'Referred Cases - MI', s: 'MI referred out' });
  r('mi_d_stemi', 'No. Death due to STEMI', '', { l1: 'Death due to MI', s: 'Death – STEMI' });
  r('mi_d_nstemi', 'No. of Death due to NSTEMI', '', { l1: 'Death due to MI', s: 'Death – NSTEMI' });
  r('mi_d_tot', 'Total', '', { l1: 'Death due to MI', t: 'calc', sum: ['mi_d_stemi', 'mi_d_nstemi'], s: 'MI deaths total' });

  sec('No. of Stroke Cases Received', 'emg', 'Stroke');
  r('st_isch', 'No. of Ischemic Stroke', '', { s: 'Ischaemic stroke' });
  r('st_haem', 'No. of Hemorrhagic Stroke', '', { s: 'Haemorrhagic stroke' });
  r('st_tot', 'Total', '', { t: 'calc', sum: ['st_isch', 'st_haem'], s: 'Total stroke' });
  r('st_ct', '', '', { l1: 'No. of CT Scan done (Stroke)', s: 'CT done (stroke)' });
  r('st_mri', '', '', { l1: 'No. of MRI Scan (stroke)', s: 'MRI done (stroke)' });
  r('st_lysis', 'No. of thrombolized', '', { l1: 'STROKE', s: 'Thrombolysed' });
  r('st_refin', 'Ref. in Cases', '', { l1: 'Referred Cases STROKE', s: 'Stroke referred in' });
  r('st_refout', 'Ref. Out Cases', '', { l1: 'Referred Cases STROKE', s: 'Stroke referred out' });
  r('st_death', 'No. of Death   due to stroke', '', { l1: 'Referred Cases STROKE', s: 'Death due to stroke' });
  r('alt_lifted', '', '', { l1: 'INJ. ALTEPLASE - No of vials lifted- KPM, Erode, CDL, Perambalur', m: 'admin', g: 'Alteplase (stroke)', s: 'Inj. Alteplase – vials lifted' });
  r('alt_used', '', '', { l1: 'INJ. ALTEPLASE - No of vials used-KPM, Erode, CDL, Perambalur', m: 'admin', g: 'Alteplase (stroke)', s: 'Inj. Alteplase – vials used' });
  r('alt_amt', '', '', { l1: 'Amount spent from Rs. 600000-KPM, Erode, CDL, Perambalur', m: 'admin', g: 'Alteplase (stroke)', agg: 'last', s: 'Amount spent from ₹6,00,000 (cumulative)' });
  sec('STROKE', 'emg', 'Stroke');
  r('st2_rec', 'Received', '', { s: 'Stroke – received' });
  r('st2_trt', 'Treated', '', { s: 'Stroke – treated' });
  r('st2_ref', 'Ref. out', '', { s: 'Stroke – referred out' });
  r('st2_death', 'Death', '', { s: 'Stroke – death' });

  [['POISON', 'po', 'Poison'], ['Snake Bite', 'sb', 'Snake bite'], ['Scorpion Bite and Other Bites', 'ob', 'Scorpion & other bites']].forEach(function (x) {
    sec(x[0], 'emg', x[2]);
    r(x[1] + '_rec', 'Received', '', { s: 'Received' });
    r(x[1] + '_trt', 'Treated', '', { s: 'Treated' });
    if (x[1] === 'sb') {
      r('sb_ven', 'Venomous', '', { s: 'Venomous' });
      r('sb_nonven', 'Non-venomous', '', { s: 'Non-venomous' });
      r('sb_asv', 'No . ASV Used', '', { s: 'ASV vials used' });
    }
    r(x[1] + '_ref', 'Ref. out', '', { s: 'Referred out' });
    r(x[1] + '_death', 'Death', '', { s: 'Death' });
  });

  sec('BURNS', 'emg', 'Burns');
  r('bu_rec', 'No of cases Received', '', { s: 'Cases received' });
  [['lt20', 'Less than 20% Burns', '< 20%'], ['2040', '20% to 40% Burns', '20–40%'], ['gt40', 'above 40% of Burns', '> 40%']].forEach(function (b) {
    r('bu_' + b[0] + '_adm', b[1], 'Admission', { s: b[2] + ' – admitted' });
    r('bu_' + b[0] + '_d', b[1], 'Death', { s: b[2] + ' – death' });
    r('bu_' + b[0] + '_ref', b[1], 'Ref Out', { s: b[2] + ' – referred out' });
  });
  r('bu_acid', 'Acid / Chemical Burns', '', { s: 'Acid / chemical' });
  r('bu_crack', 'Crackers/ Explosion', '', { s: 'Crackers / explosion' });
  r('bu_dis', 'Discharge', '', { s: 'Discharged' });
  r('bu_refin', 'Ref IN', '', { s: 'Referred in' });
  r('bu_refout', 'Ref OUT', '', { s: 'Referred out' });
  r('bu_death', 'Total Death due to burns', '', { s: 'Total deaths (burns)' });

  sec('PREM (PEDIATRIC EMERGENGY)', 'emg', 'PREM (paediatric emergency)');
  r('pr_cases', 'No of cases', '', { s: 'No. of cases' });
  r('pr_rec', 'No.of Cases Received', '', { s: 'Cases received' });
  r('pr_adm', 'Admitted and Treated', '', { s: 'Admitted & treated' });
  r('pr_dis', 'Discharge from UTR GH', '', { s: 'Discharged' });
  r('pr_ref', 'Ref out to Other centres', '', { s: 'Referred out' });
  r('pr_death', 'Death', '', { s: 'Death' });

  sec('TAEI OPERATIONAL COST', 'admin', 'TAEI operational cost');
  r('toc_appr', 'APPROVED AMOUNT', '', { agg: 'last', s: 'Approved amount (₹)' });
  r('toc_exp', 'EXPENDITURE INCURRED', '', { agg: 'last', s: 'Expenditure incurred (₹, cumulative)' });
  r('toc_bal', 'BALANCE AMOUNT', '', { t: 'calc', fn: 'tocBal', agg: 'calc', s: 'Balance (₹)' });

  r('helmet', '', '', { l1: 'Number of  Two wheeler RTA cases where in the victim wore helmet', m: 'emg', g: 'RTA & assault', s: 'Two-wheeler RTA – victim wore helmet' });
  sec('TRAUMA', 'emg', 'RTA & assault');
  r('tr_seen', 'Trauma cases referred out', 'No of trauma cases seen', { s: 'Trauma cases seen' });
  r('tr_refout', 'Trauma cases referred out', 'No of trauma cases Referred out', { s: 'Trauma cases referred out' });
  r('tr_refpct', 'Trauma cases referred out', '% of trauma cases referred out = (F/E)*100', { t: 'calc', fn: 'trRefPct', agg: 'calc', s: '% trauma referred out' });
  r('rta_major', 'No of RTA cases treated', 'Major injuries', { s: 'RTA – major injuries' });
  r('rta_minor', 'No of RTA cases treated', 'Minor injuries', { s: 'RTA – minor injuries' });
  r('rta_death', 'No of RTA cases treated', 'DEATH', { s: 'RTA – death' });
  r('rta_tot', 'No of RTA cases treated', 'Total RTA Cases', { t: 'calc', sum: ['rta_major', 'rta_minor', 'rta_death'], s: 'Total RTA cases' });
  r('rta_inc', 'No of RTA cases treated', 'Total RTA incidents', { s: 'Total RTA incidents' });
  r('rta_108', 'No of RTA cases treated', 'RTA came through 108', { s: 'RTA via 108' });
  r('rta_adm', 'No of RTA cases treated', 'RTA admissions', { s: 'RTA admissions' });
  r('rta_dama', 'No of RTA cases treated', 'RTA DAMA', { s: 'RTA DAMA' });
  r('rta_absc', 'No of RTA cases treated', 'RTA absconded', { s: 'RTA absconded' });
  r('rta_dis', 'No of RTA cases treated', 'RTA discharges', { s: 'RTA discharges' });
  r('rta_ref', 'No of RTA cases treated', 'RTA referrals', { s: 'RTA referrals' });
  r('rta_death2', 'No of RTA cases treated', 'RTA death (BD/2-6 hrs/6-24 hrs/>24 hrs)', { s: 'RTA death (BD / 2–6 h / 6–24 h / >24 h)' });
  r('as_major', 'No of Assault cases treated', 'Major injuries', { s: 'Assault – major' });
  r('as_minor', 'No of Assault cases treated', 'Minor injuries', { s: 'Assault – minor' });
  r('as_death', 'No of Assault cases treated', 'DEATH', { s: 'Assault – death' });
  r('as_tot', 'No of Assault cases treated', 'Total Assault Cases', { t: 'calc', sum: ['as_major', 'as_minor', 'as_death'], s: 'Total assault cases' });

  var DAILY_ROWS = rows;

  // ---- additional rows (KPI / M.O. review / ranking) -> "Other Services" sheet
  rows = [];
  sec('DIAGNOSTICS', 'svc', 'Lab & diagnostics');
  r('lab_op', 'Lab tests', 'OP', { s: 'Lab tests – OP' });
  r('lab_ip', 'Lab tests', 'IP', { s: 'Lab tests – IP' });
  r('lab_tot', 'Lab tests', 'Total', { t: 'calc', sum: ['lab_op', 'lab_ip'], s: 'Lab tests – total' });
  r('xray', 'X-Ray', '', { s: 'X-rays taken' });
  r('usg', 'Ultrasonogram', '', { s: 'USG done' });
  r('ecg', 'ECG', '', { s: 'ECG done' });
  r('ct', 'CT scan', '', { s: 'CT done' });
  sec('NCD SCREENING', 'svc', 'NCD screening');
  r('ncd_op', 'NCD cases managed in OPD', '', { s: 'NCD cases managed in OPD' });
  r('ht_scr', 'Hypertension', 'Screened', { s: 'HT – screened' });
  r('ht_pos', 'Hypertension', 'Positive', { s: 'HT – positive' });
  r('dm_scr', 'Diabetes', 'Screened', { s: 'DM – screened' });
  r('dm_pos', 'Diabetes', 'Positive', { s: 'DM – positive' });
  r('cbe_done', 'Ca Breast (CBE)', 'Done', { s: 'CBE done' });
  r('cbe_pos', 'Ca Breast (CBE)', 'Positive', { s: 'CBE positive' });
  r('via_done', 'Ca Cervix (VIA)', 'Done', { s: 'VIA done' });
  r('via_pos', 'Ca Cervix (VIA)', 'Positive', { s: 'VIA positive' });
  r('oral_scr', 'Oral cancer', 'Screened', { s: 'Oral – screened' });
  r('oral_susp', 'Oral cancer', 'Suspected', { s: 'Oral – suspected' });
  r('dfoot', 'Diabetic foot', 'Screened', { s: 'Diabetic foot – screened' });
  sec('MOTHER & CHILD', 'svc', 'Mother & child');
  r('anc_reg', 'ANC registrations', '', { s: 'ANC registrations' });
  r('hrp', 'High-risk pregnancies registered', '', { s: 'High-risk pregnancies registered' });
  r('live_births', 'Live births', '', { s: 'Live births' });
  r('nbsu', 'NBSU admissions', '', { s: 'NBSU admissions' });
  r('imm', 'Immunisations done', '', { s: 'Immunisations done' });
  r('aefi', 'AEFI cases reported', '', { s: 'AEFI reported' });
  r('mat_death', 'Maternal death', '', { s: 'Maternal death' });
  r('neo_death', 'Neonatal death', '', { s: 'Neonatal death' });
  r('tmtmt_backlog', 'TMTMT backlog beneficiaries', '', { s: 'TMTMT backlog beneficiaries' });
  r('tmtmt_rings', 'TMTMT rings distributed', '', { s: 'TMTMT rings distributed' });
  sec('OTHER SERVICES', 'svc', 'Other services');
  r('blood_units', 'Blood units transfused', '', { s: 'Blood units transfused' });
  r('pm_done', 'Post-mortems done', '', { s: 'Post-mortems done' });
  r('pm_pending', 'PM certificates pending', '', { agg: 'last', s: 'PM certificates pending (as on date)' });
  r('dental', 'Dental procedures', '', { s: 'Dental procedures' });
  r('burns_consent', 'Burns consent forms', '', { s: 'Burns – consent forms' });
  r('prem_appr', 'PREM fund', 'Approved (₹)', { agg: 'last', s: 'PREM fund – approved (₹)' });
  r('prem_exp', 'PREM fund', 'Expenditure (₹)', { agg: 'last', s: 'PREM fund – expenditure (₹, cumulative)' });
  sec('CMCHIS', 'svc', 'CMCHIS pre-auth');
  r('pa_sub', 'Pre-auth', 'Submitted', { s: 'Pre-auth submitted' });
  r('pa_appr', 'Pre-auth', 'Approved', { s: 'Pre-auth approved' });
  r('pa_den', 'Pre-auth', 'Denied', { s: 'Pre-auth denied' });
  r('pa_amt', 'Pre-auth', 'Approved amount (₹)', { s: 'Approved amount (₹)' });
  sec('MEDLEAPR', 'emg', 'MedLeaPR status');
  r('pm_entered', 'Post-mortem', 'Entered in MedLeaPR', { s: 'PM cases entered in MedLeaPR' });
  r('pm_frozen', 'Post-mortem', 'Frozen within 24 hrs', { s: 'PM cases frozen within 24 hrs' });
  r('pm_reason', 'Post-mortem', 'Reason not frozen', { t: 'txt', s: 'Reason PM not frozen' });
  r('police_memo', 'MLC', 'Police memo received', { s: 'Police memos received' });
  r('ar_done', 'MLC', 'AR entries done', { s: 'AR entries done' });
  r('mlc_reason', 'MLC', 'Reason not entered', { t: 'txt', s: 'Reason MLC not entered in portal' });
  r('remand_entered', 'Remand', 'Entered in MedLeaPR', { s: 'Remand cases entered in MedLeaPR' });
  r('remand_reason', 'Remand', 'Reason not entered', { t: 'txt', s: 'Reason remand not entered' });
  sec('FEVER', 'svc', 'Fever surveillance');
  r('fev_op', 'Fever cases', 'OP', { s: 'Fever – OP cases' });
  r('fev_ip_m', 'Fever cases', 'IP male', { s: 'Fever – IP male' });
  r('fev_ip_f', 'Fever cases', 'IP female', { s: 'Fever – IP female' });
  r('fev_ip', 'Fever cases', 'IP total', { t: 'calc', sum: ['fev_ip_m', 'fev_ip_f'], s: 'Fever – IP total' });
  [['den', 'Dengue (NS1 / IgM)'], ['widal', 'Typhoid (Widal)'], ['scrub', 'Scrub typhus'], ['lepto', 'Leptospirosis'], ['mal', 'Malaria']].forEach(function (x) {
    r(x[0] + '_test', x[1], 'Tested', { s: x[1] + ' – tested' });
    r(x[0] + '_pos', x[1], 'Positive', { s: x[1] + ' – positive' });
  });
  r('den_pos_ip', 'Dengue (NS1 / IgM)', 'Positive among IP', { s: 'Dengue positive – IP' });
  sec('HMIS', 'hmis', 'Entered in HMIS');
  r('hm_op', 'HMIS entries', 'OP registered', { s: 'OP registered in HMIS' });
  r('hm_ip', 'HMIS entries', 'IP admitted', { s: 'IP admissions in HMIS' });
  r('hm_lab', 'HMIS entries', 'Lab investigations', { s: 'Lab investigations in HMIS' });
  r('hm_dis', 'HMIS entries', 'Discharges', { s: 'Discharges closed in HMIS' });
  sec('ABHA', 'hmis', 'ABHA (HMIS count report)');
  r('abha_reg', 'ABHA', 'Total registrations', { s: 'Total registrations' });
  r('abha_mob', 'ABHA', 'Linked – mobile OTP', { s: 'ABHA linked – mobile OTP' });
  r('abha_aotp', 'ABHA', 'Linked – Aadhaar OTP', { s: 'ABHA linked – Aadhaar OTP' });
  r('abha_bio', 'ABHA', 'Linked – Aadhaar biometric', { s: 'ABHA linked – Aadhaar biometric' });
  r('abha_oth', 'ABHA', 'Linked – other', { s: 'ABHA linked – other' });
  r('abha_tot', 'ABHA', 'Total ABHA ID linked', { t: 'calc', sum: ['abha_mob', 'abha_aotp', 'abha_bio', 'abha_oth'], s: 'Total ABHA ID linked' });
  r('abha_op', 'ABHA created', 'In OP (A)', { s: 'ABHA created in OP (A)' });
  r('abha_taei', 'ABHA created', 'In TAEI (B)', { s: 'ABHA created in TAEI (B)' });
  r('abha_att', 'ABHA created', 'Other ID / attenders (C)', { s: 'Other ID / patient attenders (C)' });
  r('abha_abc', 'ABHA created', 'Total A+B+C', { t: 'calc', sum: ['abha_op', 'abha_taei', 'abha_att'], s: 'Total A + B + C' });
  sec('QUALITY (KPI)', 'qa', 'Quality indicators');
  r('op_doctors', 'Doctors in OPD today', '', { s: 'Doctors in OPD today' });
  r('ssi', 'Surgical site infections', '', { s: 'SSI cases detected' });
  r('stockout', 'Stock-out items (EML)', '', { s: 'Stock-out items today (EML)' });
  r('spec_calls', 'Emergency calls attended by specialist (8PM–8AM)', '', { s: 'Night emergency calls by specialist' });
  r('tb_reg', 'TB cases registered', '', { s: 'TB cases registered' });
  r('tb_success', 'TB cases successfully treated', '', { s: 'TB successfully treated' });
  r('sat_ipd_sum', 'Patient satisfaction – IPD', 'Sum of scores', { s: 'IPD satisfaction – sum of scores' });
  r('sat_ipd_n', 'Patient satisfaction – IPD', 'Respondents', { s: 'IPD satisfaction – respondents' });
  r('sat_opd_sum', 'Patient satisfaction – OPD', 'Sum of scores', { s: 'OPD satisfaction – sum of scores' });
  r('sat_opd_n', 'Patient satisfaction – OPD', 'Respondents', { s: 'OPD satisfaction – respondents' });
  r('ct_min', 'OPD consultation time', 'Total minutes observed', { s: 'Consultation time observed (min)' });
  r('ct_n', 'OPD consultation time', 'Patients observed', { s: 'Patients observed' });
  var EXTRA_ROWS = rows;

  var ALL_ROWS = DAILY_ROWS.concat(EXTRA_ROWS);
  var ROW = {};
  ALL_ROWS.forEach(function (x) { ROW[x.k] = x; });

  // Entry modules that write into the day sheet
  var DAY_MODULES = [
    { id: 'op', title: 'OP Census', icon: 'op', who: ['nurse', 'clerk', 'cmo'], desc: 'Outpatients: adult & child, male & female' },
    { id: 'ip', title: 'IP & Wards', icon: 'bed', who: ['nurse', 'cmo'], desc: 'Midnight census, admissions, diet, discharges, referrals, deaths' },
    { id: 'emg', title: 'Emergency / TAEI', icon: 'emg', who: ['doctor', 'nurse', 'cmo'], desc: 'Triage, registry, MLC & MedLeaPR, trauma, MI, stroke, bites, burns, PREM' },
    { id: 'ot', title: 'OT & Labour', icon: 'ot', who: ['doctor', 'nurse', 'cmo'], desc: 'Surgeries, OT, deliveries, family planning, gynaec' },
    { id: 'svc', title: 'Lab, NCD & MCH', icon: 'lab', who: ['lab', 'nurse', 'cmo'], desc: 'Lab, X-ray, USG, ECG, fever, NCD screening, ANC, immunisation' },
    { id: 'hmis', title: 'HMIS & ABHA', icon: 'hmis', who: ['clerk', 'cmo'], desc: 'OP, IP, lab entered in HMIS; ABHA counts' },
    { id: 'qa', title: 'Quality KPI', icon: 'kpi', who: ['cmo', 'clerk'], desc: 'Extra items for the 24 CHC KPIs' },
    { id: 'admin', title: 'Funds', icon: 'fund', who: ['clerk', 'cmo'], desc: 'Operational cost fund, TAEI cost, Alteplase' },
    { id: 'meta', title: 'Day details', icon: 'user', who: [], desc: 'DMO and report filled by' },
  ];

  // 24 CHC KPIs (KPI Reference sheet). n/d: functions over a values getter g(key) for one day or month.
  var KPIS = [
    ['Productivity', 1, 'Bed Occupancy Rate', 'Patient bed days (midnight census)', 'Functional beds × days', 'pct', function (g, c) { return [g('bed_days'), c.beds * c.days]; }, 'Midnight census'],
    ['Productivity', 2, 'Lab tests per 1000 patients', 'Total lab tests (OPD+IPD)', 'Total patients attended', 'k', function (g) { return [g('lab_tot'), g('op_tot') + g('na_tot')]; }, 'Lab Register'],
    ['Productivity', 3, 'High Risk Pregnancy / Obstetric Complication %', 'High risk pregnancies registered', 'Total ANC registrations', 'pct', function (g) { return [g('hrp'), g('anc_reg')]; }, 'ANC Register'],
    ['Productivity', 4, 'LSCS Rate (%)', 'C-section deliveries', 'Total deliveries', 'pct', function (g) { return [g('del_lscs'), g('del_ln') + g('del_ast') + g('del_lscs')]; }, 'Labour Room/OT Register'],
    ['Productivity', 5, 'NCD Cases managed in OPD (%)', 'NCD cases in OPD', 'Total OPD cases', 'pct', function (g) { return [g('ncd_op'), g('op_tot')]; }, 'OPD Register'],
    ['Productivity', 6, 'New-borns admitted to NBSU (%)', 'NBSU admissions', 'Total live births', 'pct', function (g) { return [g('nbsu'), g('live_births')]; }, 'NBSU Register'],
    ['Productivity', 7, 'Blood units transfused per admission', 'Blood units transfused', 'Total admissions', 'ratio', function (g) { return [g('blood_units'), g('na_tot')]; }, 'Blood Transfusion Register'],
    ['Productivity', 8, 'Major surgeries (excl. LSCS) ratio', 'Major surgeries excl. LSCS', 'Total surgeries (major+minor)', 'ratio', function (g) { return [Math.max(0, g('sx_major') - g('del_lscs')), g('sx_tot')]; }, 'OT Register'],
    ['Efficiency', 9, 'Referrals out of total admissions (%)', 'Patients referred out', 'Total admissions', 'pct', function (g) { return [g('ref_nonanc') + g('ref_anc'), g('na_tot')]; }, 'Referral Register'],
    ['Efficiency', 10, 'OPD per Doctor', 'Total OPD patients', 'Doctor-days in OPD', 'ratio', function (g, c) { return [g('op_tot'), g('op_doctors') || (c.opDoctors * c.daysWithOp)]; }, 'OPD Register'],
    ['Efficiency', 11, 'Critical Emergency cases (%)', 'Critical emergency cases (snake bite, trauma, CVA)', 'Total emergency registrations', 'pct', function (g) { return [g('crit'), g('te_tot')]; }, 'Emergency Register'],
    ['Efficiency', 12, 'Stock-outs as per EML (%)', 'Stock-out items (daily count)', 'Total EML drugs × days', 'pct', function (g, c) { return [g('stockout'), c.eml * c.days]; }, 'Stock Register'],
    ['Efficiency', 13, 'Emergency calls attended per specialist (8PM–8AM)', 'Emergency calls attended by specialist', 'Total specialists appointed', 'ratio', function (g, c) { return [g('spec_calls'), c.specialists]; }, 'Call Register'],
    ['Clinical Care & Safety', 14, 'Average Length of Stay', 'Patient bed days', 'Total discharges', 'ratio', function (g) { return [g('bed_days'), g('dis_tot')]; }, 'Admission & Discharge Register'],
    ['Clinical Care & Safety', 15, 'Surgical Site Infection (%)', 'SSI cases detected', 'Total surgeries conducted', 'pct', function (g) { return [g('ssi'), g('sx_tot')]; }, 'Infection Control Report'],
    ['Clinical Care & Safety', 16, 'Death Rate (%)', 'Deaths in hospital (IP deaths)', 'Total admissions', 'pct', function (g) { return [g('d_ip'), g('na_tot')]; }, 'Death Register'],
    ['Clinical Care & Safety', 17, 'AEFI cases reported (%)', 'AEFI cases reported', 'Total immunizations done', 'pct', function (g) { return [g('aefi'), g('imm')]; }, 'Immunization & AEFI Records'],
    ['Clinical Care & Safety', 18, 'DOTS treatment success (%)', 'TB cases successfully treated', 'Total TB cases registered', 'pct', function (g) { return [g('tb_success'), g('tb_reg')]; }, 'DOT Register'],
    ['Clinical Care & Safety', 19, 'Family Planning Indicators (HMIS)', '—', '—', 'see', null, 'HMIS Records'],
    ['Clinical Care & Safety', 20, 'LaQshya Indicators (Annexure C)', '—', '—', 'see', null, 'LaQshya Records'],
    ['Service Quality', 21, 'LAMA cases (%)', 'LAMA patients (excl. abscond, referral)', 'Total admissions', 'pct', function (g) { return [g('dis_lama'), g('na_tot')]; }, 'Admission/Discharge Register'],
    ['Service Quality', 22, 'Patient Satisfaction Score – IPD', 'Sum of avg satisfaction scores (IPD)', 'Total respondents (≥30)', 'ratio', function (g) { return [g('sat_ipd_sum'), g('sat_ipd_n')]; }, 'Patient Feedback Records'],
    ['Service Quality', 23, 'Patient Satisfaction Score – OPD', 'Sum of avg satisfaction scores (OPD)', 'Total respondents (≥30)', 'ratio', function (g) { return [g('sat_opd_sum'), g('sat_opd_n')]; }, 'Patient Feedback Records'],
    ['Service Quality', 24, 'Average OPD Consultation Time (min)', 'Total consultation time observed', 'Patients observed (≥30 or 5%)', 'ratio', function (g) { return [g('ct_min'), g('ct_n')]; }, 'Time Motion Study'],
  ].map(function (a) { return { type: a[0], no: a[1], name: a[2], num: a[3], den: a[4], kind: a[5], fn: a[6], src: a[7] }; });

  // ---- line-list registers (patient / event level)
  var SEX = ['M', 'F', 'TG'];
  var P = [{ k: 'name', l: 'Name', req: true, wide: true }, { k: 'age', l: 'Age', t: 'num' }, { k: 'sex', l: 'Sex', t: 'sel', o: SEX }];
  var ADDR = [{ k: 'addr', l: 'Address', wide: true }, { k: 'mob', l: 'Mobile', t: 'tel' }];
  var REF_OUTCOMES = ['Pending follow-up', 'Admitted at referral centre', 'Treated & discharged', 'Under treatment', 'Surgery done', 'Died en route', 'Died at referral centre', 'Did not go / LAMA', 'Returned to GH', 'Not traceable'];
  var DISP = ['Admitted', 'Referred', 'OP / sent home', 'LAMA', 'Absconded', 'Death'];
  var REGISTERS = [
    { id: 'mlc', title: 'MLC / AR register', group: 'Emergency', fields: P.concat(ADDR, [
      { k: 'arno', l: 'AR / MLC No.' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'type', l: 'Type', t: 'sel', o: ['RTA', 'Assault', 'Poison', 'Bites', 'Accidental self fall', 'Occupational injury', 'Sexual assault', 'Self inflicted wounds', 'Burns', 'Head injury', 'Fall from height', 'Hanging', 'Drowning', 'Others'] },
      { k: 'dx', l: 'Diagnosis / injuries', wide: true }, { k: 'findings', l: 'Important findings', wide: true },
      { k: 'disp', l: 'Disposition', t: 'sel', o: DISP }, { k: 'police', l: 'Police intimation', t: 'sel', o: ['Sent', 'Not sent', 'NA'] },
      { k: 'medleapr', l: 'MedLeaPR entered', t: 'sel', o: ['Yes', 'No'] }]),
      counts: function (list) {
        var map = { 'RTA': 'mlc_rta', 'Assault': 'mlc_assault', 'Poison': 'mlc_poison', 'Bites': 'mlc_bites', 'Accidental self fall': 'mlc_selffall', 'Occupational injury': 'mlc_occ', 'Sexual assault': 'mlc_sexual', 'Self inflicted wounds': 'mlc_selfinf', 'Burns': 'mlc_burns', 'Head injury': 'mlc_hi', 'Fall from height': 'mlc_fall', 'Hanging': 'mlc_hanging', 'Drowning': 'mlc_drown', 'Others': 'mlc_others' };
        var o = {}; list.forEach(function (x) { var k = map[x.f.type] || 'mlc_others'; o[k] = (o[k] || 0) + 1; if (x.f.medleapr === 'Yes') o.medleapr = (o.medleapr || 0) + 1; });
        return { module: 'emg', values: o };
      } },
    { id: 'referral', title: 'Referral register', group: 'Emergency', fields: P.concat([
      { k: 'dx', l: 'Diagnosis', wide: true, list: 'dx' }, { k: 'mode', l: '108 / Self', t: 'sel', o: ['108', 'Self', 'Other vehicle'] },
      { k: 'reason', l: 'Reason for referral', wide: true, list: 'refreason' },
      { k: 'to', l: 'Referred to', list: 'refto' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'outcome', l: 'Outcome', t: 'sel', o: REF_OUTCOMES }, { k: 'outcome_date', l: 'Outcome known on', t: 'date' },
      { k: 'outcome_note', l: 'Outcome details (who informed, treatment given)', wide: true },
      { k: 'ipno', l: 'OP / IP No.' }, { k: 'anc', l: 'ANC case?', t: 'sel', o: ['No', 'Yes'] }, { k: 'trauma', l: 'Trauma case?', t: 'sel', o: ['No', 'Yes'] }]),
      counts: function (list) {
        var o = { ref_nonanc: 0, ref_anc: 0 }; var reasons = [];
        list.forEach(function (x) { if (x.f.anc === 'Yes') o.ref_anc++; else o.ref_nonanc++; if (x.f.reason) reasons.push(x.f.reason); });
        if (reasons.length) o.ref_reason = reasons.join('; ');
        return { module: 'ip', values: o };
      } },
    { id: 'death', title: 'Death register', group: 'Wards', fields: P.concat([
      { k: 'ipno', l: 'IP No.' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'type', l: 'Type', t: 'sel', o: ['Brought dead', 'IP death', 'Death in ED'] }, { k: 'cause', l: 'Cause of death', wide: true },
      { k: 'trauma', l: 'Trauma death?', t: 'sel', o: ['No', 'Yes'] }, { k: 'mlc', l: 'MLC?', t: 'sel', o: ['No', 'Yes'] }, { k: 'pm', l: 'Post-mortem', t: 'sel', o: ['Not needed', 'Done', 'Pending'] }]),
      counts: function (list) {
        var o = { d_bd: 0, d_ip: 0 };
        list.forEach(function (x) {
          if (x.f.type === 'Brought dead') { o.d_bd++; if (x.f.trauma === 'Yes') o.td_bd = (o.td_bd || 0) + 1; }
          else if (x.f.type === 'Death in ED') { if (x.f.trauma === 'Yes') o.td_ed = (o.td_ed || 0) + 1; o.d_ip++; }
          else o.d_ip++;
        });
        return { module: 'ip', values: o };
      } },
    { id: 'fever', title: 'Fever line list', group: 'Emergency', fields: P.concat(ADDR, [
      { k: 'dx', l: 'Diagnosis', wide: true }, { k: 'inv', l: 'Investigations (RDT/NS1/IgM etc.)', wide: true },
      { k: 'disp', l: 'Disposition', t: 'sel', o: DISP }]) },
    { id: 'bite', title: 'Bites – ASV / ARV / HRIG', group: 'Emergency', fields: P.concat(ADDR, [
      { k: 'kind', l: 'Bite', t: 'sel', o: ['Snake – venomous', 'Snake – non-venomous', 'Dog', 'Cat', 'Monkey', 'Scorpion', 'Other'] },
      { k: 'asv', l: 'ASV vials', t: 'num' }, { k: 'arv', l: 'ARV dose no.', t: 'sel', o: ['', '1', '2', '3', '4', '5'] }, { k: 'hrig', l: 'HRIG given', t: 'sel', o: ['No', 'Yes'] },
      { k: 'disp', l: 'Disposition', t: 'sel', o: DISP }, { k: 'reftime', l: 'Referral time', t: 'time' }]),
      counts: function (list) {
        var o = {};
        function add(k, n) { o[k] = (o[k] || 0) + (n == null ? 1 : n); }
        list.forEach(function (x) {
          var f = x.f;
          if (/^Snake/.test(f.kind)) { add('sb_rec'); add(f.kind === 'Snake – venomous' ? 'sb_ven' : 'sb_nonven'); add('sb_asv', +f.asv || 0); if (f.disp === 'Referred') add('sb_ref'); else if (f.disp === 'Death') add('sb_death'); else add('sb_trt'); }
          else if (f.kind === 'Scorpion' || f.kind === 'Other') { add('ob_rec'); if (f.disp === 'Referred') add('ob_ref'); else if (f.disp === 'Death') add('ob_death'); else add('ob_trt'); }
          if (f.arv) { add('arv_doses'); if (f.arv === '1') add('arv_new'); }
          if (f.hrig === 'Yes') add('hrig');
        });
        return { module: 'emg', values: o };
      } },
    { id: 'lysis', title: 'Thrombolysis (STEMI / stroke)', group: 'Emergency', fields: P.concat([
      { k: 'ipno', l: 'IP No.' }, { k: 'dx', l: 'Diagnosis', t: 'sel', o: ['STEMI', 'Ischaemic stroke', 'Other'] },
      { k: 'door', l: 'Door time', t: 'time' }, { k: 'needle', l: 'Needle time', t: 'time' }, { k: 'drug', l: 'Drug', t: 'sel', o: ['Streptokinase', 'Tenecteplase', 'Alteplase', 'Reteplase', 'Other'] },
      { k: 'outcome', l: 'Outcome', t: 'sel', o: DISP }]) },
    { id: 'intub', title: 'Intubation', group: 'Emergency', fields: P.concat([
      { k: 'ipno', l: 'IP No.' }, { k: 'ind', l: 'Indication', wide: true }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'by', l: 'Done by' }, { k: 'outcome', l: 'Outcome', t: 'sel', o: DISP }]) },
    { id: 'scheme', title: 'CMCHIS / IKT cases', group: 'Wards', fields: P.concat([
      { k: 'scheme', l: 'Scheme', t: 'sel', o: ['CMCHIS', 'IKT'] }, { k: 'ipno', l: 'IP No.' }, { k: 'urn', l: 'URN / card no.' },
      { k: 'dx', l: 'Diagnosis', wide: true }, { k: 'pkg', l: 'Package / procedure', wide: true },
      { k: 'status', l: 'Pre-auth status', t: 'sel', o: ['Submitted', 'Approved', 'Denied', 'Cancelled', 'Claim submitted', 'Claim settled'] },
      { k: 'amt', l: 'Approved amount (₹)', t: 'num' }, { k: 'ddate', l: 'Discharge date', t: 'date' }]),
      counts: function (list) {
        var o = { sch_cmchis: 0, sch_ikt: 0 };
        list.forEach(function (x) { if (x.f.scheme === 'IKT') o.sch_ikt++; else o.sch_cmchis++; });
        return { module: 'ip', values: o };
      } },
    { id: 'ot', title: 'OT register', group: 'OT & Labour', fields: P.concat([
      { k: 'ipno', l: 'IP No.' }, { k: 'dept', l: 'Department', t: 'sel', o: ['OG', 'General surgery', 'Ortho', 'ENT', 'Ophthal', 'Dental', 'Other'] },
      { k: 'cat', l: 'Major / minor', t: 'sel', o: ['Major', 'Minor'] }, { k: 'dx', l: 'Diagnosis', wide: true }, { k: 'proc', l: 'Procedure', wide: true },
      { k: 'surgeon', l: 'Surgeon' }, { k: 'anaes', l: 'Anaesthetist' }, { k: 'atype', l: 'Anaesthesia', t: 'sel', o: ['GA', 'Spinal', 'Regional', 'Local', 'Sedation'] },
      { k: 'start', l: 'Start time', t: 'time' }, { k: 'lscs', l: 'LSCS?', t: 'sel', o: ['No', 'Yes'] }, { k: 'emerg', l: 'Emergency?', t: 'sel', o: ['No', 'Yes'] }]),
      counts: function (list) {
        var o = { sx_major: 0, sx_minor: 0 };
        var map = { 'OG': 'ot_og', 'General surgery': 'ot_gen', 'Ortho': 'ot_ortho', 'ENT': 'ot_ent', 'Ophthal': 'ot_oph' };
        list.forEach(function (x) {
          if (x.f.cat === 'Minor') { o.sx_minor++; o.ot_minor = (o.ot_minor || 0) + 1; }
          else { o.sx_major++; var k = map[x.f.dept]; if (k) o[k] = (o[k] || 0) + 1; }
        });
        return { module: 'ot', values: o };
      } },
    { id: 'delivery', title: 'Delivery register', group: 'OT & Labour', fields: [
      { k: 'name', l: 'Mother name', req: true, wide: true }, { k: 'age', l: 'Age', t: 'num' }, { k: 'ipno', l: 'IP No.' }, { k: 'picme', l: 'PICME No.' },
      { k: 'mode', l: 'Mode', t: 'sel', o: ['Normal (LN)', 'Assisted', 'LSCS'] }, { k: 'time', l: 'Time of delivery', t: 'time' },
      { k: 'bsex', l: 'Baby sex', t: 'sel', o: ['M', 'F'] }, { k: 'wt', l: 'Birth weight (kg)', t: 'num' },
      { k: 'outcome', l: 'Outcome', t: 'sel', o: ['Live birth', 'Still birth', 'Twins – live', 'Referred to NBSU'] }],
      counts: function (list) {
        var o = { del_ln: 0, del_ast: 0, del_lscs: 0, del_nlscs: 0 };
        list.forEach(function (x) {
          var f = x.f;
          if (f.mode === 'LSCS') { o.del_lscs++; var h = parseInt((f.time || '').split(':')[0], 10); if (h >= 20 || h < 8) o.del_nlscs++; }
          else if (f.mode === 'Assisted') o.del_ast++; else o.del_ln++;
        });
        return { module: 'ot', values: o };
      } },
    { id: 'letters', title: 'Letters (inward / outward)', group: 'Office', fields: [
      { k: 'dir', l: 'Inward / outward', t: 'sel', o: ['Inward', 'Outward'] }, { k: 'refno', l: 'Ref. No.' },
      { k: 'party', l: 'From / to', req: true, wide: true }, { k: 'subject', l: 'Subject', wide: true },
      { k: 'mode', l: 'Mode', t: 'sel', o: ['e-Office', 'Email', 'Post', 'Hand', 'WhatsApp', 'Fax'] },
      { k: 'due', l: 'Reply due by', t: 'date' }, { k: 'status', l: 'Status', t: 'sel', o: ['Pending', 'Replied', 'Filed', 'Forwarded'] }] },
    { id: 'maint', title: 'Maintenance & complaints', group: 'Office', fields: [
      { k: 'area', l: 'Area / equipment', req: true, wide: true }, { k: 'issue', l: 'Issue', wide: true },
      { k: 'to', l: 'Reported to', t: 'sel', o: ['PWD (civil)', 'PWD (electrical)', 'BME / equipment', 'Water / plumbing', 'IT / HMIS', 'Vendor', 'Other'] },
      { k: 'status', l: 'Status', t: 'sel', o: ['Open', 'In progress', 'Closed'] }, { k: 'closed', l: 'Closed on', t: 'date' }] },
  ];


  // Pick-lists for forms. Diagnoses carry an ICD-10 code; drugs are "name|strength|route".
  var DX = [
    ['Acute febrile illness', 'R50.9'], ['Dengue fever', 'A90'], ['Typhoid fever', 'A01.0'], ['Scrub typhus', 'A75.3'], ['Leptospirosis', 'A27.9'],
    ['Malaria – vivax', 'B51.9'], ['Malaria – falciparum', 'B50.9'], ['Acute gastroenteritis', 'A09'], ['Acute gastritis', 'K29.1'], ['Dyspepsia / acid peptic disease', 'K30'],
    ['Urinary tract infection', 'N39.0'], ['Renal colic', 'N23'], ['Acute kidney injury', 'N17.9'], ['Chronic kidney disease', 'N18.9'],
    ['Upper respiratory tract infection', 'J06.9'], ['Acute bronchitis', 'J20.9'], ['Community acquired pneumonia', 'J18.9'], ['Bronchial asthma – acute exacerbation', 'J45.9'],
    ['COPD – acute exacerbation', 'J44.1'], ['Pulmonary tuberculosis', 'A15.0'], ['Systemic hypertension', 'I10'], ['Type 2 diabetes mellitus', 'E11.9'],
    ['Diabetic ketoacidosis', 'E10.1'], ['Hypoglycaemia', 'E16.2'], ['Hyponatraemia', 'E87.1'], ['Acute STEMI', 'I21.3'], ['NSTEMI', 'I21.4'], ['Unstable angina', 'I20.0'],
    ['Congestive heart failure', 'I50.9'], ['Ischaemic stroke', 'I63.9'], ['Haemorrhagic stroke', 'I61.9'], ['Seizure disorder', 'G40.9'], ['Febrile seizure', 'R56.0'],
    ['Vertigo', 'R42'], ['Syncope', 'R55'], ['Organophosphate poisoning', 'T60.0'], ['Paraquat poisoning', 'T60.3'], ['Rat-killer (phosphide) poisoning', 'T60.4'],
    ['Drug overdose', 'T50.9'], ['Snake bite envenomation', 'T63.0'], ['Scorpion sting', 'T63.2'], ['Dog bite', 'W54'], ['Allergic reaction', 'T78.4'],
    ['Head injury', 'S09.9'], ['Concussion', 'S06.0'], ['Fracture distal radius', 'S52.5'], ['Fracture neck of femur', 'S72.0'], ['Fracture shaft tibia', 'S82.2'],
    ['Soft tissue injury / contusion', 'T14.0'], ['Cut lacerated wound', 'T14.1'], ['Burns', 'T30.0'], ['Attempted hanging', 'T71'],
    ['Acute appendicitis', 'K35.8'], ['Cellulitis', 'L03.9'], ['Abscess', 'L02.9'], ['Iron deficiency anaemia', 'D50.9'], ['Anaemia', 'D64.9'],
    ['Alcohol withdrawal', 'F10.3'], ['Conversion disorder', 'F44.9'], ['Neonatal jaundice', 'P59.9'],
    ['Normal vaginal delivery', 'O80'], ['Delivery by caesarean section', 'O82'], ['Anaemia in pregnancy', 'O99.0'], ['Gestational hypertension', 'O13'],
    ['Pre-eclampsia', 'O14.9'], ['Hyperemesis gravidarum', 'O21.0'], ['Threatened abortion', 'O20.0'], ['Incomplete abortion', 'O06.4'],
    ['Premature rupture of membranes', 'O42.9'], ['Postpartum haemorrhage', 'O72.1'],
  ];
  var DRUGS = [
    'Tab Paracetamol|500 mg|Oral', 'Syp Paracetamol|125 mg/5 ml|Oral', 'Tab Ibuprofen|400 mg|Oral', 'Tab Diclofenac|50 mg|Oral', 'Tab Tramadol|50 mg|Oral',
    'Cap Amoxicillin|500 mg|Oral', 'Syp Amoxicillin|125 mg/5 ml|Oral', 'Tab Amoxicillin + Clavulanate|625 mg|Oral', 'Tab Cefixime|200 mg|Oral', 'Tab Azithromycin|500 mg|Oral',
    'Tab Ciprofloxacin|500 mg|Oral', 'Tab Metronidazole|400 mg|Oral', 'Cap Doxycycline|100 mg|Oral', 'Tab Albendazole|400 mg|Oral',
    'Tab Pantoprazole|40 mg|Oral', 'Tab Ondansetron|4 mg|Oral', 'Tab Domperidone|10 mg|Oral', 'Tab Hyoscine butylbromide|10 mg|Oral', 'ORS sachet|20.5 g / 1 L|Oral', 'Tab Zinc|20 mg|Oral',
    'Tab Cetirizine|10 mg|Oral', 'Tab Chlorpheniramine|4 mg|Oral', 'Tab Montelukast|10 mg|Oral', 'Tab Salbutamol|4 mg|Oral', 'Salbutamol inhaler|100 mcg/puff|Inhalation',
    'Tab Prednisolone|10 mg|Oral', 'Tab Amlodipine|5 mg|Oral', 'Tab Atenolol|50 mg|Oral', 'Tab Enalapril|5 mg|Oral', 'Tab Telmisartan|40 mg|Oral',
    'Tab Labetalol|100 mg|Oral', 'Tab Nifedipine|10 mg|Oral', 'Tab Methyldopa|250 mg|Oral', 'Tab Metformin|500 mg|Oral', 'Tab Glibenclamide|5 mg|Oral',
    'Tab Glimepiride|1 mg|Oral', 'Tab Atorvastatin|10 mg|Oral', 'Tab Aspirin|75 mg|Oral', 'Tab Clopidogrel|75 mg|Oral', 'Tab Isosorbide dinitrate|5 mg|Sublingual',
    'Tab Frusemide|40 mg|Oral', 'Tab Spironolactone|25 mg|Oral', 'Tab Phenytoin|100 mg|Oral', 'Tab Sodium valproate|200 mg|Oral', 'Tab Diazepam|5 mg|Oral',
    'Tab Ferrous sulphate + Folic acid|100 mg + 0.5 mg|Oral', 'Tab Folic acid|5 mg|Oral', 'Tab Calcium + Vitamin D3|500 mg + 250 IU|Oral', 'Tab Vitamin B complex|—|Oral',
    'Oint Silver sulfadiazine|1%|Topical', 'Oint Povidone iodine|5%|Topical', 'Inj Tetanus toxoid|0.5 ml|IM', 'Inj Anti-rabies vaccine|0.1 ml|ID',
  ];
  var FREQ = ['1-0-1 (BD)', '1-1-1 (TDS)', '1-0-0 (OD morning)', '0-0-1 (HS / night)', '1-1-1-1 (QID)', 'SOS (when needed)', 'STAT', 'Once a week', 'Alternate days'];
  var ROUTES = ['Oral', 'IV', 'IM', 'SC', 'ID', 'Sublingual', 'Inhalation', 'Topical', 'Per rectal', 'Per vaginal', 'Eye drops', 'Ear drops'];
  var DAYS = ['1 day', '2 days', '3 days', '5 days', '7 days', '10 days', '14 days', '15 days', '21 days', '30 days', 'To continue', 'Till review'];
  var MED_NOTES = ['After food', 'Before food', 'At bedtime', 'With milk', 'Empty stomach', 'If fever > 100°F', 'If pain'];
  var REF_REASONS = ['Needs specialist opinion', 'Non-availability of specialist', 'Non-availability of equipment (CT / ventilator)', 'Needs ICU care', 'Needs surgery',
    'Needs neurosurgery', 'Poly-trauma', 'Needs dialysis', 'Needs blood transfusion', 'High-risk pregnancy', 'Patient / attender request'];
  var REF_TO = ['GHQH Kanchipuram', 'Chengalpattu Medical College Hospital', 'Rajiv Gandhi Government General Hospital, Chennai', 'Stanley Medical College Hospital, Chennai',
    'Kilpauk Medical College Hospital, Chennai', 'Institute of Child Health, Egmore', 'Institute of Obstetrics & Gynaecology, Egmore', 'GH Sriperumbudur', 'Private hospital'];
  var ADVICE = ['Take medicines regularly as advised', 'Plenty of oral fluids', 'Salt-restricted diet', 'Diabetic diet – avoid sugar and sweets', 'Soft bland diet',
    'Rest for one week', 'Keep the wound clean and dry', 'Limb elevation', 'Avoid alcohol and smoking', 'Check BP / sugar weekly at PHC', 'Complete the ARV schedule (days 3, 7, 28)'];
  var SPECIALTIES = ['General Medicine', 'Cardiology', 'Neurology', 'Neurosurgery', 'General Surgery', 'Orthopaedics', 'Obstetrics & Gynaecology', 'Paediatrics',
    'Neonatology', 'Nephrology', 'Urology', 'Gastroenterology', 'Pulmonology', 'Plastic Surgery / Burns', 'ENT', 'Ophthalmology', 'Psychiatry', 'Toxicology / ICU', 'Vascular Surgery', 'Oncology'];
  var PICK = { spec: SPECIALTIES, dx: DX.map(function (d) { return d[0]; }), refreason: REF_REASONS, refto: REF_TO };

  // Discharge summary (GH/UTM/MRD/FRM/2026/DS-01) and CMCHIS pre-authorisation form
  var FORMS = {
    ds: { id: 'ds', title: 'Discharge summary', code: 'GH/UTM/MRD/FRM/2026/DS-01', fields: [
      { k: 'name', l: 'Name', req: true }, { k: 'agesex', l: 'Age / Sex' }, { k: 'ipno', l: 'IP No.' }, { k: 'hospno', l: 'Hospital No.' },
      { k: 'doa', l: 'D.O.A.', t: 'date' }, { k: 'dos', l: 'D.O.S. (surgery)', t: 'date' }, { k: 'dod', l: 'D.O.D.', t: 'date' },
      { k: 'addr', l: 'Address', wide: true }, { k: 'aadhaar', l: 'Aadhaar No.' }, { k: 'mob', l: 'Mobile No.', t: 'tel' },
      { k: 'consultant', l: 'Consultant' }, { k: 'unit', l: 'Dept / Unit / Ward' }, { k: 'urn', l: 'URN (CMCHIS)' },
      { k: 'allergy', l: 'Allergies / drug reactions / known sensitivities', wide: true },
      { k: 'dx', l: 'Final diagnosis', wide: true, list: 'dx', icd: 'icd' }, { k: 'dx2', l: 'Other diagnoses', wide: true, list: 'dx' }, { k: 'icd', l: 'ICD-10 code' },
      { k: 'proc', l: 'Procedure done / surgery', t: 'area', wide: true },
      { k: 'hpi', l: 'History of present illness', t: 'area', wide: true },
      { k: 'past', l: 'Past history (HTN / DM / IHD / TB / Asthma / Allergy / Surgeries)', t: 'area', wide: true },
      { k: 'genex', l: 'General examination', t: 'area' }, { k: 'locex', l: 'Local examination', t: 'area' },
      { k: 'v_bp', l: 'Admission BP' }, { k: 'v_pr', l: 'PR' }, { k: 'v_rr', l: 'RR' }, { k: 'v_spo2', l: 'SpO2' }, { k: 'v_temp', l: 'Temp' }, { k: 'v_gcs', l: 'GCS' },
      { k: 'inv', l: 'Investigations (Hb / TC / DC / Plt / RBS / Urea / Creat / Na / K / LFT / ECG / X-ray / USG / CT)', t: 'area', wide: true },
      { k: 'tx', l: 'Treatment given during hospital stay', t: 'area', wide: true },
      { k: 'cond', l: 'Condition on discharge', t: 'sel', o: ['Stable', 'Improved', 'Same', 'Worsened', 'DAMA', 'Referred'] },
      { k: 'ref_to', l: 'If referred – hospital name', list: 'refto' }, { k: 'ref_spec', l: 'Specialty', list: 'spec' }, { k: 'ref_reason', l: 'Reason for referral', wide: true, list: 'refreason' },
      { k: 'd_bp', l: 'Discharge BP' }, { k: 'd_pr', l: 'PR' }, { k: 'd_temp', l: 'Temp' }, { k: 'd_spo2', l: 'SpO2' },
      { k: 'meds', l: 'Discharge medications', t: 'meds', wide: true },
      { k: 'advice', l: 'Discharge advice / lifestyle', t: 'area', chips: 'advice' }, { k: 'diet', l: 'Dietary advice', t: 'area' },
      { k: 'fu_date', l: 'Follow-up date', t: 'date' }, { k: 'fu_time', l: 'Follow-up time', t: 'time' }, { k: 'fu_opd', l: 'OPD / department' },
      { k: 'prep', l: 'Report prepared by' }, { k: 'cons_reg', l: 'Consultant Reg. No.' }, { k: 'att', l: 'Patient / attendant name' }, { k: 'att_mob', l: 'Attendant mobile', t: 'tel' }] },
    preauth: { id: 'preauth', title: 'CMCHIS pre-authorisation', code: 'TN CMCHIS – Pre-authorization form', fields: [
      { k: 'name', l: 'Name', req: true }, { k: 'age', l: 'Age' }, { k: 'sex', l: 'Sex', t: 'sel', o: ['M', 'F'] }, { k: 'ipno', l: 'IP No.' },
      { k: 'consultant', l: 'Consultant' }, { k: 'doa', l: 'Date of admission', t: 'date' },
      { k: 'cc', l: 'Chief complaints *', t: 'area', wide: true }, { k: 'dur', l: 'Duration of present ailment' },
      { k: 'past', l: 'Past history', t: 'area', wide: true }, { k: 'hist', l: 'Detailed history', t: 'area', wide: true },
      { k: 'bp', l: 'B.P.' }, { k: 'pulse', l: 'Pulse' }, { k: 'cvs', l: 'CVS' }, { k: 'pa', l: 'P/A' }, { k: 'rs', l: 'RS' }, { k: 'cns', l: 'CNS' },
      { k: 'other', l: 'Other clinical findings', wide: true },
      { k: 'compl', l: 'Complication of chronic / pre-existing disease or operation?', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] }, { k: 'compl_d', l: 'If yes, details' },
      { k: 'pdx', l: 'Provisional diagnosis', wide: true, list: 'dx' },
      { k: 'p_inv', l: 'Investigations', wide: true }, { k: 'p_icu', l: 'Intensive care', wide: true }, { k: 'p_med', l: 'Medical management', wide: true },
      { k: 'p_surg', l: 'Surgical management', wide: true }, { k: 'p_oth', l: 'Other treatments', wide: true },
      { k: 'regno', l: "Doctor's Reg. No." }, { k: 'docph', l: "Doctor's phone" }, { k: 'code', l: 'Code No.' },
      { k: 'pe_htn', l: 'Hypertension', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] }, { k: 'pe_dm', l: 'Diabetic', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] },
      { k: 'pe_heart', l: 'Heart diseases', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] }, { k: 'pe_copd', l: 'COPD / asthma', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] },
      { k: 'pe_std', l: 'S.T.D.', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] }, { k: 'pe_epi', l: 'Epilepsy', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] },
      { k: 'pe_oth', l: 'Other diseases', t: 'sel', o: ['No', 'Yes', 'Not mentioned'] }, { k: 'pe_alc', l: 'Alcohol / drugs intoxication', t: 'sel', o: ['No', 'Yes'] },
      { k: 'pe_note', l: 'Since when & remarks (pre-existing)', wide: true },
      { k: 'acc_date', l: 'Date of accident (if accident)', t: 'date' }, { k: 'mech', l: 'Mechanism of injury', t: 'area', wide: true },
      { k: 'cons_name', l: 'Name of the consultant *' }, { k: 'remarks', l: 'Any other remarks', wide: true }] },
  };

  // Clinical referral form (printable referral letter; also files an entry in the referral register)
  var YN3 = ['No', 'Yes', 'Ex-'];
  FORMS.ref = { id: 'ref', title: 'Referral form', code: 'GH/UTM/TAEI/REF', fields: [
    { k: 'date', l: 'Date of referral', t: 'date', req: true }, { k: 'time', l: 'Time', t: 'time' }, { k: 'mode', l: '108 / Self', t: 'sel', o: ['108', 'Self', 'Other vehicle'] },
    { k: 'name', l: 'Name', req: true }, { k: 'age', l: 'Age', t: 'num' }, { k: 'sex', l: 'Sex', t: 'sel', o: SEX },
    { k: 'addr', l: 'Address', wide: true }, { k: 'mob', l: 'Mobile no.', t: 'tel' }, { k: 'ipno', l: 'OP / IP No.' },
    { k: 'mlc', l: 'MLC / Non-MLC', t: 'sel', o: ['Non-MLC', 'MLC'] }, { k: 'mlcno', l: 'MLC number' },
    { k: 'dx', l: 'Diagnosis', wide: true, list: 'dx' },
    { k: 'cc', l: 'Presenting complaints', t: 'area', wide: true }, { k: 'assoc', l: 'Associated complaints', t: 'area', wide: true },
    { k: 'smoking', l: 'Smoking', t: 'sel', o: YN3 }, { k: 'alcohol', l: 'Alcohol', t: 'sel', o: YN3 },
    { k: 'past', l: 'Past history (HTN / DM / IHD / TB / asthma / seizures / surgeries)', t: 'area', wide: true },
    { k: 'v_bp', l: 'BP (mmHg)' }, { k: 'v_pr', l: 'Pulse (/min)' }, { k: 'v_rr', l: 'RR (/min)' }, { k: 'v_spo2', l: 'SpO2 (%)' }, { k: 'v_temp', l: 'Temp (°F)' }, { k: 'v_gcs', l: 'GCS' }, { k: 'v_grbs', l: 'GRBS (mg/dl)' },
    { k: 'ex_gen', l: 'General examination', t: 'area', wide: true }, { k: 'ex_cvs', l: 'CVS' }, { k: 'ex_rs', l: 'RS' }, { k: 'ex_pa', l: 'P/A' }, { k: 'ex_cns', l: 'CNS' },
    { k: 'ex_local', l: 'Local examination / other findings', t: 'area', wide: true },
    { k: 'inv', l: 'Investigations done', t: 'area', wide: true }, { k: 'tx', l: 'Treatment given', t: 'area', wide: true },
    { k: 'to', l: 'Referred to – hospital name', list: 'refto', req: true }, { k: 'spec', l: 'Specialty', list: 'spec' }, { k: 'reason', l: 'Reason for referral', wide: true, list: 'refreason' },
    { k: 'escort', l: 'Accompanied by (staff / attender)' }, { k: 'doctor', l: 'Referring doctor' }, { k: 'regno', l: 'Reg. No.' }] };

  // EMO duty completion checklist (GH/UTM/TAEI/CHK/2026 Ver 1.0)
  var CHECKLIST = [
    'Attendance completion', 'TAEI Registry – EMO & doctor entries', 'PREM entry – all paediatric cases', 'Admission counts reconciled with ward',
    'IKT – all RTA cases', 'CMCHIS documentation', 'AR / MLC entry – MedLeaPR', 'Referral register', 'Fever cases – line list',
    'ASV / HRIG administration', 'Thrombolysis (STEMI)', 'Intubation', 'Minor surgeries (split-up)', 'Letters received', 'DMO register completion',
  ];
  var CHECK_LINKS = { 5: 'scheme', 6: 'scheme', 7: 'mlc', 8: 'referral', 9: 'fever', 10: 'bite', 11: 'lysis', 12: 'intub', 14: 'letters' };

  // Housekeeping
  var CLEAN_AREAS = ['Casualty / Emergency', 'OP block & waiting area', 'Male ward', 'Female ward', 'Paediatric ward', 'Labour room', 'Post-natal ward',
    'Operation theatre', 'Laboratory', 'Pharmacy', 'X-ray / USG', 'Toilets – OP', 'Toilets – wards', 'Corridors & premises', 'Kitchen / diet'];
  var CLEAN_ROUNDS = ['Morning', 'Afternoon', 'Night'];
  var BMW = [['bmw_yellow', 'Yellow (kg)'], ['bmw_red', 'Red (kg)'], ['bmw_white', 'White – sharps (kg)'], ['bmw_blue', 'Blue – glass (kg)']];
  var HK_TASKS = [['hk_fogging', 'Fogging / vector control'], ['hk_pest', 'Pest control'], ['hk_tank', 'Water tank cleaned'], ['hk_mop', 'Mops & buckets disinfected'], ['hk_spill', 'Spill kits checked']];

  var ATT = [['P', 'Present'], ['L', 'Leave'], ['OD', 'On duty (outside)'], ['ND', 'Night-duty off'], ['M', 'Missed punch'], ['A', 'Absent']];

  var ROLES = [['cmo', 'CMO / Admin'], ['doctor', 'Doctor (DMO / EMO)'], ['nurse', 'Staff nurse'], ['pharm', 'Pharmacist'], ['lab', 'Lab / radiology'], ['clerk', 'Office / records'], ['hk', 'Housekeeping / sanitary'], ['other', 'Other staff']];

  var STAFF_SEED = [
    ['Dr Aarthi Priyanga', 'Assistant Surgeon'], ['Dr Anvar Sathick', 'Assistant Surgeon'], ['Dr Dhanaprabhakar', 'Assistant Surgeon'], ['Dr Priya P', 'Senior Assistant Surgeon'],
    ['Dr Naveen S', 'Assistant Surgeon'], ['Dr Muthtamilselvi', 'Assistant Surgeon'], ['Dr Harish S P', 'Assistant Surgeon'], ['Dr J Jeevitha', 'Assistant Surgeon'],
    ['Dr Karthick Prasaad', 'Assistant Surgeon'], ['Dr Prakyatha', 'Assistant Surgeon'], ['Dr Praveena', 'Assistant Surgeon'], ['Dr Joan Felicita', 'CCS'],
    ['Dr Bharathi', 'Assistant Surgeon'], ['Dr Abiramavalli', 'Assistant Surgeon'], ['Dr Ramadoss', 'Assistant Surgeon'], ['Dr Aruldoss', 'Assistant Surgeon'],
    ['Arunajothi S T', 'Staff Nurse'], ['Suganya', 'Staff Nurse'], ['Adhilakshmi P', 'Staff Nurse'], ['Anandhi A', 'Staff Nurse'], ['Chithra P', 'Staff Nurse'],
    ['Gayathri', 'Staff Nurse'], ['Manjula D', 'Staff Nurse'], ['Priya', 'Staff Nurse'], ['Kalaiyarasi Ponmozhi', 'Pharmacist'], ['Keerthana', 'AYUSH Pharmacist'],
    ['Ezhilarasan Ellan', 'Lab Technician (ICTC)'], ['M A Parveen', 'Counsellor (ICTC)'], ['Rani R', 'Hospital Worker'], ['Amudha M', 'Sweeper'],
    ['Nivetha', 'Dental Hygienist'], ['Vennila', 'MPHW'], ['Selvi', 'Hospital Worker (AYUSH)'],
  ];

  // TNCEA inspection checklist — tracked as a licence / compliance register
  var COMPLIANCE_SEED = ['TNCEA – application / registration / renewal', 'Pollution Control Board licence', 'Bio-medical waste agreement', 'Fire safety licence / NOC',
    'Doctors – TNMC registration', 'Nurses – TNNMWC registration', 'Building stability certificate', 'Property tax receipt / rental agreement',
    'Display – Hospital Protection Act 48/2008', 'Display – facilities & doctors list', 'Equipment list', 'Lift licence (if applicable)', 'PCPNDT licence (if applicable)',
    'Copy of TNCEA licence (if renewal)', 'AERB certificate (if applicable)', 'ART licence (if applicable)', 'Pharmacy licence', 'Blood bank / storage licence',
    'Pharmacist registration', 'Lab technician certificate', 'Physiotherapist certificate', 'FSSAI licence (kitchen)', 'Other applicable licences'];

  // VED indent — planning parameters (Setup sheet) and seed list (TNMSC indent, Aug 2026)
  var VED_BUFFER = { V: 1, E: 0.5, D: 0.25 };
  var DRUG_SEED = [
    ["Inj Adrenaline (Epinephrine)", "1 mg/ml", "Emergency / Resuscitation", "V", "Amp", 8, 60, 20, 0, 10],
    ["Inj Atropine Sulphate", "0.6 mg/ml", "Emergency / Antidote (OP)", "V", "Amp", 6, 120, 40, 0, 10],
    ["Inj Dopamine", "200 mg/5 ml", "Emergency / Inotrope", "V", "Amp", 15, 30, 8, 0, 5],
    ["Inj Hydrocortisone Na Succinate", "100 mg", "Emergency / Steroid", "V", "Vial", 18, 80, 25, 0, 10],
    ["Inj Dexamethasone", "4 mg/ml", "Emergency / Steroid", "V", "Amp", 5, 100, 30, 0, 10],
    ["Inj Frusemide", "10 mg/ml (20 mg)", "Emergency / Diuretic", "V", "Amp", 4, 90, 15, 0, 10],
    ["Inj Aminophylline", "25 mg/ml", "Emergency / Respiratory", "V", "Amp", 6, 40, 12, 0, 5],
    ["Inj Diazepam", "5 mg/ml", "Emergency / Anticonvulsant", "V", "Amp", 7, 70, 20, 0, 10],
    ["Inj Phenytoin Sodium", "50 mg/ml", "Emergency / Anticonvulsant", "V", "Amp", 12, 40, 10, 0, 5],
    ["Inj Magnesium Sulphate", "50%", "Obstetric / Emergency", "V", "Amp", 5, 50, 30, 0, 10],
    ["Inj Calcium Gluconate", "10%", "Emergency / Electrolyte", "V", "Amp", 6, 40, 15, 0, 10],
    ["Inj Sodium Bicarbonate", "7.5%", "Emergency / Electrolyte", "V", "Amp", 10, 30, 20, 0, 5],
    ["Inj Oxytocin", "5 IU/ml", "Obstetric", "V", "Amp", 5, 150, 40, 0, 20],
    ["Inj Tranexamic Acid", "500 mg/5 ml", "Emergency / Obstetric", "V", "Amp", 14, 60, 18, 0, 10],
    ["Inj Labetalol", "20 mg/4 ml", "Obstetric / Emergency", "V", "Amp", 40, 20, 6, 0, 5],
    ["Inj Human Insulin (Regular)", "40 IU/ml", "Emergency / Endocrine", "V", "Vial", 130, 25, 8, 0, 5],
    ["Anti-Snake Venom (Polyvalent)", "Lyophilised", "Antidote", "V", "Vial", 550, 40, 12, 0, 10],
    ["Anti-Rabies Vaccine (ARV)", "Cell culture", "Immunological", "V", "Vial", 300, 120, 35, 0, 10],
    ["Inj Pralidoxime (PAM)", "500 mg", "Antidote (OP poisoning)", "V", "Amp", 60, 30, 5, 0, 5],
    ["Inj Chlorpheniramine Maleate", "10 mg/ml", "Emergency / Anaphylaxis", "V", "Amp", 3, 80, 25, 0, 10],
    ["Inj Ceftriaxone", "1 g", "Antibiotic (sepsis)", "V", "Vial", 12, 300, 80, 0, 20],
    ["IV Fluid Normal Saline 0.9%", "500 ml", "IV Fluid", "V", "Bottle", 22, 800, 200, 0, 50],
    ["IV Fluid Ringer Lactate", "500 ml", "IV Fluid", "V", "Bottle", 24, 700, 180, 0, 50],
    ["IV Fluid Dextrose 5%", "500 ml", "IV Fluid", "V", "Bottle", 22, 400, 100, 0, 50],
    ["IV Fluid Dextrose 25%", "100 ml", "IV Fluid / Hypoglycaemia", "V", "Bottle", 18, 120, 30, 0, 10],
    ["Tab Aspirin (dispersible)", "325 mg", "Cardiac emergency", "V", "Tab", 0.4, 200, 60, 0, 100],
    ["Tab Nitroglycerin (sublingual)", "0.5 mg", "Cardiac emergency", "V", "Tab", 1.2, 100, 20, 0, 50],
    ["Salbutamol Respirator Solution", "5 mg/ml", "Emergency / Respiratory", "V", "Vial", 25, 30, 10, 0, 5],
    ["Inj Ondansetron", "2 mg/ml", "Emergency / Antiemetic", "V", "Amp", 4, 150, 50, 0, 20],
    ["Inj Pantoprazole", "40 mg", "Emergency / GI", "V", "Vial", 15, 200, 60, 0, 20],
    ["Tab Paracetamol", "500 mg", "Analgesic / Antipyretic", "E", "Tab", 0.3, 5000, 1500, 0, 500],
    ["Cap Amoxicillin", "500 mg", "Antibiotic", "E", "Cap", 1.2, 2000, 500, 0, 100],
    ["Tab Amoxicillin+Clavulanate", "625 mg", "Antibiotic", "E", "Tab", 6, 800, 200, 0, 100],
    ["Tab Azithromycin", "500 mg", "Antibiotic", "E", "Tab", 4, 600, 150, 0, 50],
    ["Tab Ciprofloxacin", "500 mg", "Antibiotic", "E", "Tab", 1.5, 1000, 250, 0, 100],
    ["Tab Metronidazole", "400 mg", "Antibiotic", "E", "Tab", 0.8, 1500, 400, 0, 100],
    ["Tab Metformin", "500 mg", "Antidiabetic", "E", "Tab", 0.5, 4000, 1000, 0, 500],
    ["Tab Glimepiride", "1 mg", "Antidiabetic", "E", "Tab", 0.6, 2000, 600, 0, 100],
    ["Tab Amlodipine", "5 mg", "Antihypertensive", "E", "Tab", 0.3, 3500, 900, 0, 500],
    ["Tab Telmisartan", "40 mg", "Antihypertensive", "E", "Tab", 0.8, 3000, 800, 0, 500],
    ["Tab Atenolol", "50 mg", "Cardiac / Beta-blocker", "E", "Tab", 0.4, 2000, 500, 0, 100],
    ["Tab Atorvastatin", "10 mg", "Lipid-lowering", "E", "Tab", 0.9, 2500, 700, 0, 100],
    ["Tab Pantoprazole", "40 mg", "GI / PPI", "E", "Tab", 1, 3000, 800, 0, 500],
    ["Tab Enalapril", "5 mg", "Cardiac / ACE-I", "E", "Tab", 0.5, 1500, 400, 0, 100],
    ["Tab Levothyroxine", "50 mcg", "Endocrine", "E", "Tab", 0.7, 1800, 500, 0, 100],
    ["Tab Prednisolone", "10 mg", "Steroid", "E", "Tab", 0.6, 800, 200, 0, 100],
    ["Tab Cetirizine", "10 mg", "Antihistamine", "E", "Tab", 0.3, 2000, 600, 0, 100],
    ["Tab Ibuprofen", "400 mg", "Analgesic / NSAID", "E", "Tab", 0.5, 2500, 700, 0, 500],
    ["Tab Diclofenac", "50 mg", "Analgesic / NSAID", "E", "Tab", 0.4, 2000, 600, 0, 100],
    ["Tab Albendazole", "400 mg", "Anthelmintic", "E", "Tab", 1.5, 1000, 300, 0, 100],
    ["Tab Ferrous Sulphate + Folic Acid", "IFA", "Haematinic", "E", "Tab", 0.3, 5000, 1200, 0, 500],
    ["Tab Folic Acid", "5 mg", "Haematinic", "E", "Tab", 0.2, 2000, 500, 0, 100],
    ["Tab Calcium + Vitamin D3", "500 mg", "Supplement", "E", "Tab", 1, 3000, 800, 0, 500],
    ["ORS Sachet (WHO)", "20.5 g/L", "Oral Rehydration", "E", "Sachet", 5, 800, 200, 0, 100],
    ["Syp Paracetamol", "250 mg/5 ml, 60 ml", "Paediatric", "E", "Bottle", 12, 400, 100, 0, 50],
    ["Tab Carbamazepine", "200 mg", "Anticonvulsant", "E", "Tab", 1, 900, 250, 0, 100],
    ["Tab Amitriptyline", "25 mg", "Psychiatric", "E", "Tab", 0.5, 600, 150, 0, 100],
    ["Inj Vitamin B-Complex", "2 ml", "Supplement", "E", "Amp", 4, 300, 80, 0, 50],
    ["Tab Frusemide", "40 mg", "Diuretic", "E", "Tab", 0.4, 1200, 350, 0, 100],
    ["Tab Spironolactone", "25 mg", "Diuretic", "E", "Tab", 1, 700, 200, 0, 100],
    ["Syp Multivitamin", "100 ml", "Supplement", "D", "Bottle", 15, 200, 120, 0, 20],
    ["Tab Vitamin B-Complex", "—", "Supplement", "D", "Tab", 0.3, 1500, 800, 0, 500],
    ["Antacid Gel", "170 ml", "GI / Symptomatic", "D", "Bottle", 18, 250, 150, 0, 20],
    ["Calamine Lotion", "100 ml", "Dermatology", "D", "Bottle", 12, 150, 100, 0, 20],
    ["Clotrimazole Cream 1%", "15 g", "Dermatology / Antifungal", "D", "Tube", 14, 200, 130, 0, 20],
    ["Povidone Iodine Ointment 5%", "15 g", "Antiseptic", "D", "Tube", 16, 180, 120, 0, 20],
    ["Lactulose Solution", "100 ml", "Laxative", "D", "Bottle", 45, 100, 70, 0, 10],
    ["Chlorhexidine Mouthwash", "100 ml", "Dental", "D", "Bottle", 20, 120, 90, 0, 10],
    ["Cough Syrup (expectorant)", "100 ml", "Symptomatic", "D", "Bottle", 16, 300, 180, 0, 20],
    ["Tab Vitamin C", "500 mg", "Supplement", "D", "Tab", 0.4, 1000, 700, 0, 100],
  ];

  G.DB_SCHEMA = {
    DAILY_ROWS: DAILY_ROWS, EXTRA_ROWS: EXTRA_ROWS, ALL_ROWS: ALL_ROWS, ROW: ROW, DAY_MODULES: DAY_MODULES, KPIS: KPIS,
    REGISTERS: REGISTERS, FORMS: FORMS, CHECKLIST: CHECKLIST, CHECK_LINKS: CHECK_LINKS, CLEAN_AREAS: CLEAN_AREAS, CLEAN_ROUNDS: CLEAN_ROUNDS,
    BMW: BMW, HK_TASKS: HK_TASKS, ATT: ATT, ROLES: ROLES, STAFF_SEED: STAFF_SEED, DX: DX, DRUGS: DRUGS, FREQ: FREQ, ROUTES: ROUTES, DAYS: DAYS, MED_NOTES: MED_NOTES, ADVICE: ADVICE, PICK: PICK, REF_OUTCOMES: REF_OUTCOMES, SPECIALTIES: SPECIALTIES, COMPLIANCE_SEED: COMPLIANCE_SEED, VED_BUFFER: VED_BUFFER, DRUG_SEED: DRUG_SEED,
  };
})(typeof window !== 'undefined' ? window : globalThis);
