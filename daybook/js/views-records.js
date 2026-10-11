/* Case registers, printable forms (discharge summary, CMCHIS pre-auth), VED drug indent, office & compliance, staff/area lists. */
(function (G) {
  'use strict';
  var UI = G.UI, DB = G.DB, REP = G.REP, SC = G.DB_SCHEMA, X = G.XLSX, U = REP.util, h = UI.h;

  var LISTS = { dx: SC.PICK.dx, refreason: SC.PICK.refreason, refto: SC.PICK.refto, spec: SC.PICK.spec };
  function fieldHtml(f, v, prefix) {
    var a = 'data-f="' + f.k + '" id="' + (prefix || 'f_') + f.k + '"';
    var input, extra = '';
    if (f.t === 'sel') input = '<select ' + a + '><option value="">—</option>' + f.o.filter(Boolean).map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + h(o) + '</option>'; }).join('') + '</select>';
    else if (f.t === 'area') input = '<textarea ' + a + '>' + h(v) + '</textarea>';
    else if (f.t === 'meds') input = medsEditor(v);
    else if (f.t === 'num') input = '<input type="number" inputmode="decimal" step="any" ' + a + ' value="' + h(v) + '">';
    else if (f.t === 'tel') input = '<input type="tel" inputmode="numeric" maxlength="12" ' + a + ' value="' + h(v) + '">';
    else if (f.t === 'date' || f.t === 'time') input = '<input type="' + f.t + '" ' + a + ' value="' + h(v) + '">';
    else {
      var dl = f.list && LISTS[f.list] ? ' list="dl_' + f.k + '"' : '';
      input = '<input type="text" ' + a + ' value="' + h(v) + '" autocomplete="off"' + dl + (f.list ? ' placeholder="Type or pick from list"' : '') + '>';
      if (dl) extra = '<datalist id="dl_' + f.k + '">' + LISTS[f.list].map(function (o) { return '<option value="' + h(o) + '">'; }).join('') + '</datalist>';
    }
    if (f.chips === 'advice') extra += '<div class="chips">' + SC.ADVICE.map(function (c) { return '<button type="button" class="chip" data-chip="' + f.k + '">' + h(c) + '</button>'; }).join('') + '</div>';
    return '<div class="f' + (f.wide || f.t === 'area' || f.t === 'meds' ? ' wide' : '') + '"><label for="' + (prefix || 'f_') + f.k + '">' + h(f.l) + (f.req ? ' <span class="req">*</span>' : '') + '</label>' + input + extra + '</div>';
  }

  // Discharge medications: one row per drug with pick-lists; stored as JSON in a hidden field.
  function parseMeds(v) {
    if (!v) return [];
    try { var a = JSON.parse(v); if (Array.isArray(a)) return a; } catch (e) { /* old free-text format */ }
    return String(v).split('\n').filter(function (x) { return x.trim(); }).map(function (l) { var p = l.split('|').map(function (x) { return x.trim(); }); return { d: p[0] || '', s: p[1] || '', r: p[2] || '', f: p[3] || '', du: p[4] || '', n: p[5] || '' }; });
  }
  function medRow(m, i) {
    function sel(k, opts) { return '<select data-m="' + k + '"><option value="">' + ({ r: 'Route', f: 'Frequency', du: 'Days' })[k] + '</option>' + opts.map(function (o) { return '<option' + (m[k] === o ? ' selected' : '') + '>' + h(o) + '</option>'; }).join('') + (m[k] && opts.indexOf(m[k]) < 0 ? '<option selected>' + h(m[k]) + '</option>' : '') + '</select>'; }
    return '<div class="med"><span>' + (i + 1) + '</span><input type="text" data-m="d" list="dl_drugs" placeholder="Drug" value="' + h(m.d) + '" autocomplete="off">' +
      '<input type="text" data-m="s" placeholder="Strength" value="' + h(m.s) + '">' + sel('r', SC.ROUTES) + sel('f', SC.FREQ) + sel('du', SC.DAYS) +
      '<input type="text" data-m="n" list="dl_mednotes" placeholder="Remarks" value="' + h(m.n) + '"><button type="button" class="x" data-mdel aria-label="Remove">✕</button></div>';
  }
  function medsEditor(v) {
    var list = parseMeds(v); if (!list.length) list = [{}, {}, {}];
    var drugs = SC.DRUGS.map(function (d) { return d.split('|')[0]; }).concat(REP.drugs().map(function (d) { return d.name; }));
    return '<input type="hidden" data-f="meds" value="' + h(JSON.stringify(list.filter(function (m) { return m.d; }))) + '">' +
      '<div class="meds" id="meds"><div class="med medhead"><span>#</span><span>Drug</span><span>Strength</span><span>Route</span><span>Frequency</span><span>Days</span><span>Remarks</span><span></span></div>' +
      list.map(medRow).join('') + '</div><div class="btns"><button type="button" class="btn ghost sm" id="medadd">+ Add drug</button></div>' +
      '<datalist id="dl_drugs">' + drugs.filter(function (x, i) { return drugs.indexOf(x) === i; }).map(function (d) { return '<option value="' + h(d) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl_mednotes">' + SC.MED_NOTES.map(function (d) { return '<option value="' + h(d) + '">'; }).join('') + '</datalist>';
  }
  // Wire pick-list behaviour on a form screen: ICD auto-fill, advice chips, medication rows.
  function bindPickers() {
    var app = UI.$('#app');
    function syncMeds() {
      var rows = UI.$$('#meds .med:not(.medhead)').map(function (r) { var o = {}; UI.$$('[data-m]', r).forEach(function (x) { if (x.value) o[x.dataset.m] = x.value; }); return o; }).filter(function (m) { return m.d; });
      var hid = UI.$('[data-f="meds"]'); if (hid) hid.value = JSON.stringify(rows);
    }
    function renumber() { UI.$$('#meds .med:not(.medhead) > span').forEach(function (s, i) { s.textContent = i + 1; }); }
    app.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.m === 'd') {
        var hit = SC.DRUGS.filter(function (d) { return d.split('|')[0] === t.value; })[0], row = t.closest('.med');
        if (!hit) { var vd = REP.drugs().filter(function (d) { return d.name === t.value; })[0]; if (vd) hit = vd.name + '|' + (vd.strength || '') + '|' + (/^Inj/.test(vd.name) ? 'IV' : 'Oral'); }
        if (hit) { var p = hit.split('|'), s2 = UI.$('[data-m="s"]', row), r2 = UI.$('[data-m="r"]', row); if (!s2.value) s2.value = p[1]; if (!r2.value) r2.value = p[2]; }
      }
      if (t.dataset.m) syncMeds();
      if (t.dataset.f === 'dx') {
        var icd = SC.DX.filter(function (d) { return d[0] === t.value; })[0], ic = UI.$('[data-f="icd"]');
        if (icd && ic && (!ic.value || ic.dataset.auto)) { ic.value = icd[1]; ic.dataset.auto = '1'; }
      }
    });
    app.addEventListener('change', function (e) { if (e.target.dataset.m) syncMeds(); });
    app.addEventListener('click', function (e) {
      var c = e.target.closest('[data-chip]');
      if (c) { var ta = UI.$('[data-f="' + c.dataset.chip + '"]'); ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + '\n' : '') + c.textContent; return; }
      if (e.target.closest('#medadd')) { var box = UI.$('#meds'), n = UI.$$('.med', box).length - 1; box.insertAdjacentHTML('beforeend', medRow({}, n)); UI.$$('[data-m="d"]', box).pop().focus(); return; }
      var d = e.target.closest('[data-mdel]'); if (d) { d.closest('.med').remove(); renumber(); syncMeds(); }
    });
  }

  function readFields(fields) { var o = {}; fields.forEach(function (f) { var el = UI.$('[data-f="' + f.k + '"]'); if (el && el.value !== '') o[f.k] = el.value; }); return o; }
  function monthState() { return UI.state.month || UI.defaultMonth(); }
  function monthRange(mm) { var ds = U.monthDates(mm.y, mm.m); return [ds[0], ds[ds.length - 1]]; }
  function regDef(id) { return SC.REGISTERS.filter(function (r) { return r.id === id; })[0]; }
  function summaryLine(def, r) {
    var bits = def.fields.slice(1, 6).map(function (f) { return r.f[f.k]; }).filter(function (x) { return !U.isBlank(x); });
    return bits.join(' · ');
  }

  // ---------------- registers index
  UI.route('regs', function () {
    var mm = monthState(), rg = monthRange(mm), groups = {};
    SC.REGISTERS.forEach(function (r) { (groups[r.group] = groups[r.group] || []).push(r); });
    UI.render(UI.topbar('Case registers', REP.MONTHS[mm.m - 1] + ' ' + mm.y, 'home') + '<div class="wrap">' + UI.monthbar(mm.y, mm.m) +
      Object.keys(groups).map(function (g) {
        return '<h2 class="sec">' + h(g) + '</h2><div class="card"><div class="list">' + groups[g].map(function (r) {
          var n = REP.registerRecords(r.id, rg[0], rg[1]).length;
          return '<a class="it" href="#reg/' + r.id + '"><div class="m"><b>' + h(r.title) + '</b><small>' + n + ' entr' + (n === 1 ? 'y' : 'ies') + ' this month' + (r.counts ? ' · fills daily counts' : '') + '</small></div><span class="chev">›</span></a>';
        }).join('') + '</div></div>';
      }).join('') + '</div>', 'home');
  });

  UI.route('reg', function (type) {
    var def = regDef(type); if (!def) { UI.go('regs'); return; }
    var mm = monthState(), rg = monthRange(mm);
    var recs = REP.registerRecords(type, rg[0], rg[1]).reverse();
    UI.render(UI.topbar(def.title, REP.MONTHS[mm.m - 1] + ' ' + mm.y + ' · ' + recs.length + ' entries', 'regs') + '<div class="wrap">' + UI.monthbar(mm.y, mm.m) +
      '<div class="btns"><a class="btn pri" href="#rec/' + type + '/new">+ New entry</a><button class="btn ghost" id="xl">Excel</button><button class="btn ghost" id="pr">Print</button></div>' +
      '<input type="search" id="q" placeholder="Search name, diagnosis…">' +
      '<div class="card"><div class="list" id="lst">' + (recs.length ? recs.map(function (r) {
        return '<a class="it" href="#rec/' + type + '/' + r.id + '" data-s="' + h(JSON.stringify(r.f).toLowerCase()) + '"><div class="m"><b>' + h(r.f[def.fields[0].k] || '(no name)') + '</b><small>' + U.dmy(r.date) + ' · ' + h(summaryLine(def, r)) + '</small></div><span class="chev">›</span></a>';
      }).join('') : '<div class="empty">No entries this month.</div>') + '</div></div></div>', 'home');
    UI.$('#q').oninput = function () { var q = this.value.toLowerCase(); UI.$$('#lst .it').forEach(function (a) { a.classList.toggle('hidden', q && a.dataset.s.indexOf(q) < 0); }); };
    UI.$('#xl').onclick = function () { var M = REP.month(mm.y, mm.m); UI.shareFile(X.build([REP.sheetRegister(type, M)]), def.title.replace(/[^A-Za-z0-9]+/g, '_') + '_' + M.mon + '.xlsx'); };
    UI.$('#pr').onclick = function () { UI.go('report/reg:' + type); };
  });

  UI.route('rec', function (type, id) {
    var def = regDef(type); if (!def) { UI.go('regs'); return; }
    var isNew = id === 'new', key = 'rec/' + type + '/' + (isNew ? UI.uid() : id), env = isNew ? null : DB.get(key);
    if (!isNew && !env) { UI.go('reg/' + type); return; }
    var date = env ? env.date : UI.state.date, f = env ? env.f : {};
    UI.render(UI.topbar((isNew ? 'New – ' : '') + def.title, env ? 'Entered by ' + env.by : '', 'reg/' + type) + '<div class="wrap">' +
      '<div class="card"><div class="bd"><div class="fgrid"><div class="f"><label>Date</label><input type="date" id="r_date" value="' + h(date) + '"></div>' +
      def.fields.map(function (fd) { return fieldHtml(fd, f[fd.k]); }).join('') + '</div>' +
      '<div class="btns"><button class="btn pri" id="sv">Save</button>' + (isNew ? '<button class="btn ghost" id="svn">Save & add another</button>' : '<button class="btn danger" id="del">Delete</button>') + '</div></div></div></div>', 'home');
    function save(next) {
      var vals = readFields(def.fields), miss = def.fields.filter(function (fd) { return fd.req && !vals[fd.k]; });
      if (miss.length) { UI.toast('Please fill: ' + miss.map(function (m) { return m.l; }).join(', '), true); return; }
      var d = UI.$('#r_date').value || UI.state.date;
      if (!G.AUTH.canEdit(d) || (env && !G.AUTH.canEdit(env.date))) { UI.toast('Entries older than yesterday can only be added or changed by the CMO / Admin', true); return; }
      if (G.AUTH.needsAudit(env, env ? env.date : d)) G.AUTH.audit(key, Object.assign({ date: env.date }, env.f), Object.assign({ date: d }, vals), G.AUTH.auditId());
      DB.put(key, { id: key.split('/')[2], date: d, f: vals });
      UI.toast('Saved');
      if (next) UI.go('rec/' + type + '/new'); else UI.go('reg/' + type);
    }
    bindPickers();
    UI.$('#sv').onclick = function () { save(false); };
    if (UI.$('#svn')) UI.$('#svn').onclick = function () { save(true); };
    if (UI.$('#del')) UI.$('#del').onclick = function () {
      if (!G.AUTH.canEdit(env.date)) { UI.toast('Only the CMO / Admin can delete older entries', true); return; }
      if (confirm('Delete this entry?')) { if (G.AUTH.needsAudit(env, env.date)) G.AUTH.audit(key, env.f, {}, G.AUTH.auditId()); DB.del(key); UI.go('reg/' + type); }
    };
  });

  // ---------------- forms: discharge summary & pre-auth
  UI.route('forms', function (type) {
    var def = SC.FORMS[type]; if (!def) { UI.go('home'); return; }
    var all = DB.list('form/' + type + '/').map(function (x) { return x.val; }).sort(function (a, b) { return b.at.localeCompare(a.at); });
    UI.render(UI.topbar(def.title, def.code, 'home') + '<div class="wrap">' +
      '<div class="btns"><a class="btn pri" href="#form/' + type + '/new">+ New ' + h(def.title.toLowerCase()) + '</a></div>' +
      '<input type="search" id="q" placeholder="Search name or IP no.">' +
      '<div class="card"><div class="list" id="lst">' + (all.length ? all.map(function (r) {
        return '<a class="it" href="#form/' + type + '/' + r.id + '" data-s="' + h(((r.f.name || '') + ' ' + (r.f.ipno || '')).toLowerCase()) + '"><div class="m"><b>' + h(r.f.name || '(no name)') + '</b><small>IP ' + h(r.f.ipno || '—') + ' · ' + new Date(r.at).toLocaleDateString() + ' · ' + h(r.by) + '</small></div><span class="chev">›</span></a>';
      }).join('') : '<div class="empty">None yet.</div>') + '</div></div></div>', 'home');
    UI.$('#q').oninput = function () { var q = this.value.toLowerCase(); UI.$$('#lst .it').forEach(function (a) { a.classList.toggle('hidden', q && a.dataset.s.indexOf(q) < 0); }); };
  });

  UI.route('form', function (type, id) {
    var def = SC.FORMS[type]; if (!def) { UI.go('home'); return; }
    var isNew = id === 'new', fid = isNew ? UI.uid() : id, key = 'form/' + type + '/' + fid, env = DB.get(key), f = env ? env.f : {};
    if (isNew && type === 'ds') f = { prep: UI.user().name };
    if (isNew && type === 'ref') { var nw = new Date(); f = { date: UI.state.date, time: UI.util2.pad(nw.getHours()) + ':' + UI.util2.pad(nw.getMinutes()), doctor: UI.user().name, mlc: 'Non-MLC' }; }
    if (isNew && G.__draftForm && G.__draftForm.type === type) { f = Object.assign(f, G.__draftForm.f); G.__draftForm = null; }
    UI.render(UI.topbar(def.title, def.code, 'forms/' + type) + '<div class="wrap"><div class="card"><div class="bd"><div class="fgrid">' +
      def.fields.map(function (fd) { return fieldHtml(fd, f[fd.k]); }).join('') + '</div>' +
      '<div class="btns"><button class="btn pri" id="sv">Save</button><button class="btn gold" id="pr">Save & print</button>' + (!isNew ? '<button class="btn danger" id="del">Delete</button>' : '') + '</div></div></div></div>', 'home');
    function save() {
      var vals = readFields(def.fields); if (!vals.name) { UI.toast('Please enter the patient name', true); return false; }
      DB.put(key, { id: fid, f: vals });
      if (type === 'ref') fileReferral(fid, vals);
      UI.toast('Saved'); return true;
    }
    bindPickers();
    UI.$('#sv').onclick = function () { if (save()) UI.go('forms/' + type); };
    UI.$('#pr').onclick = function () { if (save()) UI.go('fprint/' + type + '/' + fid); };
    if (UI.$('#del')) UI.$('#del').onclick = function () { if (confirm('Delete this form?')) { DB.del(key); UI.go('forms/' + type); } };
  });

  // A referral form also files (or updates) the matching entry in the referral register.
  function fileReferral(fid, v) {
    var key = 'rec/referral/' + fid, env = DB.get(key), f = Object.assign({}, env ? env.f : {});
    ['name', 'age', 'sex', 'dx', 'mode', 'reason', 'to', 'time', 'ipno'].forEach(function (k) { if (v[k]) f[k] = v[k]; else delete f[k]; });
    if (v.spec) f.to = (v.to || '') + ' (' + v.spec + ')';
    if (v.mlc === 'MLC') f.outcome_note = f.outcome_note || ('MLC No. ' + (v.mlcno || ''));
    f.trauma = f.trauma || (v.mlc === 'MLC' ? 'Yes' : 'No');
    DB.put(key, { id: fid, date: v.date || UI.state.date, f: f });
  }
  function refPaper(f, cfg) {
    function b(k) { return h(f[k] || ''); }
    function box(label, k) { return '<span class="lbl">' + label + '</span><div class="box">' + b(k) + '</div>'; }
    return '<div class="paper"><div class="ph"><div class="code"><span>GOVERNMENT OF TAMIL NADU</span><span>GH/UTM/TAEI/REF</span></div><h3>' + h(cfg.hospital.toUpperCase()) + '</h3><h4>REFERRAL FORM</h4></div>' +
      '<table><tr><th>Date</th><th>Time</th><th>Transport</th><th>OP / IP No.</th><th>MLC / Non-MLC</th><th>MLC No.</th></tr><tr><td>' + (f.date ? U.dmy(f.date) : '') + '</td><td>' + b('time') + '</td><td>' + b('mode') + '</td><td>' + b('ipno') + '</td><td>' + b('mlc') + '</td><td>' + b('mlcno') + '</td></tr></table>' +
      '<table><tr><th>Name</th><th>Age</th><th>Sex</th><th>Mobile</th></tr><tr><td>' + b('name') + '</td><td>' + b('age') + '</td><td>' + b('sex') + '</td><td>' + b('mob') + '</td></tr><tr><th colspan="4">Address</th></tr><tr><td colspan="4">' + b('addr') + '</td></tr></table>' +
      '<table><tr><th style="width:70%">DIAGNOSIS</th><th>Smoking / Alcohol</th></tr><tr><td>' + b('dx') + '</td><td>' + b('smoking') + ' / ' + b('alcohol') + '</td></tr></table>' +
      box('Presenting complaints', 'cc') + box('Associated complaints', 'assoc') + box('Past history', 'past') +
      '<table><tr><th>BP</th><th>Pulse</th><th>RR</th><th>SpO2</th><th>Temp</th><th>GCS</th><th>GRBS</th></tr><tr><td>' + ['v_bp', 'v_pr', 'v_rr', 'v_spo2', 'v_temp', 'v_gcs', 'v_grbs'].map(b).join('</td><td>') + '</td></tr></table>' +
      box('General examination', 'ex_gen') +
      '<table><tr><th>CVS</th><th>RS</th><th>P/A</th><th>CNS</th></tr><tr><td>' + ['ex_cvs', 'ex_rs', 'ex_pa', 'ex_cns'].map(b).join('</td><td>') + '</td></tr></table>' +
      box('Local examination / other findings', 'ex_local') + box('Investigations done', 'inv') + box('Treatment given', 'tx') +
      '<table><tr><th>Referred to (hospital)</th><th>Specialty</th></tr><tr><td><b>' + b('to') + '</b></td><td>' + b('spec') + '</td></tr><tr><th colspan="2">Reason for referral</th></tr><tr><td colspan="2">' + b('reason') + '</td></tr></table>' +
      '<p class="small">Accompanied by: ' + b('escort') + '</p>' +
      '<div class="sig" style="grid-template-columns:1fr 1fr"><div>Referring doctor: ' + b('doctor') + '<br>Reg. No.: ' + b('regno') + '<br>Signature & seal:</div><div>Received by (referral centre)<br>Name / signature / time:</div></div></div>';
  }
  function dsPaper(f, cfg) {
    function b(k) { return h(f[k] || ''); }
    function d(k) { return f[k] ? U.dmy(f[k]) : ''; }
    var meds = parseMeds(f.meds);
    while (meds.length < 6) meds.push({});
    return '<div class="paper"><div class="ph"><div class="code"><span>GOVERNMENT OF TAMIL NADU</span><span>GH/UTM/MRD/FRM/2026/DS-01</span></div><h3>' + h(cfg.hospital.toUpperCase()) + '</h3><h4>DISCHARGE SUMMARY</h4></div>' +
      '<table><tr><th>NAME</th><th>AGE / SEX</th><th>IP NO.</th><th>HOSPITAL NO.</th><th>D.O.A.</th></tr><tr><td>' + b('name') + '</td><td>' + b('agesex') + '</td><td>' + b('ipno') + '</td><td>' + b('hospno') + '</td><td>' + d('doa') + '</td></tr>' +
      '<tr><th>ADDRESS</th><th>AADHAAR NO.</th><th>MOBILE NO.</th><th colspan="2">D.O.S.</th></tr><tr><td>' + b('addr') + '</td><td>' + b('aadhaar') + '</td><td>' + b('mob') + '</td><td colspan="2">' + d('dos') + '</td></tr>' +
      '<tr><th>CONSULTANT</th><th>DEPT / UNIT / WARD</th><th>URN (CMCHIS)</th><th colspan="2">D.O.D.</th></tr><tr><td>' + b('consultant') + '</td><td>' + b('unit') + '</td><td>' + b('urn') + '</td><td colspan="2">' + d('dod') + '</td></tr></table>' +
      '<span class="lbl">Allergies / drug reactions / known sensitivities</span><div class="box">' + b('allergy') + '</div>' +
      '<table><tr><th style="width:75%">FINAL DIAGNOSIS</th><th>ICD-10 CODE</th></tr><tr><td style="white-space:pre-wrap">' + b('dx') + '</td><td>' + b('icd') + '</td></tr></table>' +
      '' + (f.dx2 ? '<span class="lbl">Other diagnoses</span><div class="box">' + b('dx2') + '</div>' : '') + '<span class="lbl">Procedure done / surgery</span><div class="box">' + b('proc') + '</div>' +
      '<span class="lbl">History of present illness</span><div class="box">' + b('hpi') + '</div>' +
      '<span class="lbl">Past history (HTN / DM / IHD / TB / Asthma / Allergy / Surgeries)</span><div class="box">' + b('past') + '</div>' +
      '<table><tr><th>GENERAL EXAMINATION</th><th>LOCAL EXAMINATION</th><th>VITALS ON ADMISSION</th></tr><tr><td style="white-space:pre-wrap">' + b('genex') + '</td><td style="white-space:pre-wrap">' + b('locex') + '</td>' +
      '<td>BP: ' + b('v_bp') + ' &nbsp; PR: ' + b('v_pr') + '<br>RR: ' + b('v_rr') + ' &nbsp; SpO2: ' + b('v_spo2') + '<br>Temp: ' + b('v_temp') + ' &nbsp; GCS: ' + b('v_gcs') + '</td></tr></table>' +
      '<span class="lbl">Investigations</span><div class="box">' + b('inv') + '</div>' +
      '<span class="lbl">Treatment given during hospital stay</span><div class="box">' + b('tx') + '</div>' +
      '<table><tr><th>CONDITION ON DISCHARGE</th><th>DISCHARGE VITALS</th></tr><tr><td>' + ['Stable', 'Improved', 'Same', 'Worsened', 'DAMA', 'Referred'].map(function (c) { return (f.cond === c ? '☑ ' : '☐ ') + c; }).join(' &nbsp; ') + '</td>' +
      '<td>BP: ' + b('d_bp') + ' &nbsp; PR: ' + b('d_pr') + ' &nbsp; Temp: ' + b('d_temp') + ' &nbsp; SpO2: ' + b('d_spo2') + '</td></tr></table>' +
      '<span class="lbl">Discharge medications</span><table><tr><th>S.No.</th><th>Drug name</th><th>Strength</th><th>Route</th><th>Dose / frequency</th><th>Duration</th><th>Remarks</th></tr>' +
      meds.map(function (m, i) { return '<tr><td>' + (i + 1) + '.</td><td>' + [m.d, m.s, m.r, m.f, m.du, m.n].map(function (x) { return h(x || ''); }).join('</td><td>') + '</td></tr>'; }).join('') + '</table>' +
      '<table><tr><th>DISCHARGE ADVICE / LIFESTYLE</th><th>DIETARY ADVICE</th></tr><tr><td style="white-space:pre-wrap">' + b('advice') + '</td><td style="white-space:pre-wrap">' + b('diet') + '</td></tr></table>' +
      '<table><tr><th>NEXT REVIEW / FOLLOW-UP</th><th>RETURN IMMEDIATELY IF</th></tr><tr><td>Date: ' + d('fu_date') + ' &nbsp; Time: ' + b('fu_time') + '<br>OPD / Department: ' + b('fu_opd') + '</td>' +
      '<td>Fever, bleeding, severe pain, breathlessness, wound discharge, vomiting, altered consciousness, or any new / worsening symptom.</td></tr></table>' +
      (f.cond === 'Referred' || f.ref_to ? '<table><tr><th>REFERRED TO (HOSPITAL)</th><th>SPECIALTY</th><th>REASON FOR REFERRAL</th></tr><tr><td>' + b('ref_to') + '</td><td>' + b('ref_spec') + '</td><td>' + b('ref_reason') + '</td></tr></table>' : '') +
      '<p class="small">IN CASE OF EMERGENCY CONTACT: ' + h(cfg.hospital) + ' • Emergency: 108 • Hospital: ' + h(cfg.phone || '____________') + '</p>' +
      '<div class="sig"><div>Report prepared by<br>Name: ' + b('prep') + '<br>Signature:</div><div>Counter-signed by (Consultant)<br>Reg. No.: ' + b('cons_reg') + '<br>Signature & seal:</div><div>Patient / attendant<br>Name: ' + b('att') + '<br>Mobile: ' + b('att_mob') + '<br>Signature:</div></div></div>';
  }
  function preauthPaper(f) {
    function b(k) { return h(f[k] || ''); }
    function yn(k) { return ['Yes', 'No', 'Not mentioned'].map(function (o) { return (f[k] === o ? '☑ ' : '☐ ') + o; }).join(' &nbsp; '); }
    return '<div class="paper"><div class="ph"><h3>TAMIL NADU CHIEF MINISTER’S COMPREHENSIVE HEALTH INSURANCE SCHEME</h3><h4>PRE-AUTHORIZATION FORM</h4></div>' +
      '<table><tr><td>Name: <b>' + b('name') + '</b></td><td>Age: ' + b('age') + '</td><td>Sex: ' + b('sex') + '</td><td>IP No: ' + b('ipno') + '</td></tr>' +
      '<tr><td colspan="2">Consultant: ' + b('consultant') + '</td><td colspan="2">Date of admission: ' + (f.doa ? U.dmy(f.doa) : '') + '</td></tr></table>' +
      '<span class="lbl">Chief complaints *</span><div class="box">' + b('cc') + '</div>' +
      '<span class="lbl">Duration of present ailment</span><div class="box">' + b('dur') + '</div>' +
      '<span class="lbl">Past history</span><div class="box">' + b('past') + '</div><span class="lbl">Detailed history</span><div class="box">' + b('hist') + '</div>' +
      '<table><tr><td>B.P.: ' + b('bp') + '</td><td>Pulse: ' + b('pulse') + '</td></tr><tr><td>CVS: ' + b('cvs') + '</td><td>P/A: ' + b('pa') + '</td></tr><tr><td>RS: ' + b('rs') + '</td><td>CNS: ' + b('cns') + '</td></tr>' +
      '<tr><td colspan="2">Other clinical findings: ' + b('other') + '</td></tr>' +
      '<tr><td colspan="2">Whether present ailment is a complication of any chronic / pre-existing disease / operation: ' + yn('compl') + (f.compl_d ? '<br>If yes: ' + b('compl_d') : '') + '</td></tr></table>' +
      '<span class="lbl">Provisional diagnosis</span><div class="box">' + b('pdx') + '</div>' +
      '<span class="lbl">Proposed line of treatment *</span><table><tr><td>Investigations</td><td>' + b('p_inv') + '</td></tr><tr><td>Intensive care</td><td>' + b('p_icu') + '</td></tr><tr><td>Medical management</td><td>' + b('p_med') + '</td></tr>' +
      '<tr><td>Surgical management</td><td>' + b('p_surg') + '</td></tr><tr><td>Other treatments</td><td>' + b('p_oth') + '</td></tr></table>' +
      '<table><tr><td>Doctor’s Reg No: ' + b('regno') + '</td><td>Doctor’s Ph No: ' + b('docph') + '</td><td>Code No: ' + b('code') + '</td></tr></table>' +
      '<span class="lbl">Pre-existing diseases – since when & remarks</span><table>' +
      [['Hypertension', 'pe_htn'], ['Diabetic', 'pe_dm'], ['Heart diseases', 'pe_heart'], ['COPD / Asthma', 'pe_copd'], ['S.T.D.', 'pe_std'], ['Epilepsy', 'pe_epi'], ['Other diseases', 'pe_oth'], ['Alcohol / drugs intoxication', 'pe_alc']].map(function (x) { return '<tr><td>' + x[0] + '</td><td>' + yn(x[1]) + '</td></tr>'; }).join('') +
      '<tr><td>Remarks</td><td>' + b('pe_note') + '</td></tr></table>' +
      '<span class="lbl">In case of accident</span><table><tr><td>Date of accident *: ' + (f.acc_date ? U.dmy(f.acc_date) : '') + '</td></tr><tr><td style="white-space:pre-wrap">Mechanism of injury: ' + b('mech') + '</td></tr></table>' +
      '<div class="sig" style="grid-template-columns:1fr 1fr"><div>Name of the consultant *<br>' + b('cons_name') + '</div><div>Signature & seal of consultant *</div></div>' +
      '<p class="small">[* the star marked should be filled mandatory]</p><span class="lbl">Any other remarks</span><div class="box">' + b('remarks') + '</div></div>';
  }
  UI.route('fprint', function (type, id) {
    var env = DB.get('form/' + type + '/' + id); if (!env) { UI.go('forms/' + type); return; }
    UI.render(UI.topbar('Print – ' + SC.FORMS[type].title, env.f.name, 'form/' + type + '/' + id) + '<div class="wrap"><div class="btns"><button class="btn gold" id="pdf">Save PDF / Share</button><button class="btn ghost" onclick="window.print()">Print</button><a class="btn ghost" href="#form/' + type + '/' + id + '">Edit</a></div>' +
      (type === 'ds' ? dsPaper(env.f, REP.settings()) : type === 'ref' ? refPaper(env.f, REP.settings()) : preauthPaper(env.f)) + '</div>', 'home');
    // A real PDF file. iPhones open the share sheet only straight after a tap, so once the PDF is ready
    // the button turns into "Share PDF" and a second tap shares it (Save to Files, WhatsApp, Mail …).
    var btn = UI.$('#pdf'), ready = null;
    var fname = SC.FORMS[type].title.replace(/[^A-Za-z0-9]+/g, '_') + '_' + String(env.f.name || id).replace(/[^A-Za-z0-9]+/g, '_') + '.pdf';
    btn.onclick = function () {
      if (ready) { UI.shareFile(ready, fname, SC.FORMS[type].title + ' – ' + (env.f.name || '')); return; }
      btn.disabled = true; btn.textContent = 'Making PDF…';
      PDFOUT.fromElement(UI.$('.paper'), SC.FORMS[type].title + ' – ' + (env.f.name || '')).then(function (blob) {
        ready = blob; btn.disabled = false;
        var file = new File([blob], fname, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { btn.textContent = 'Share PDF ⬆'; UI.toast('PDF ready – tap Share PDF, then Save to Files or WhatsApp'); }
        else { btn.textContent = 'Save PDF again'; UI.shareFile(blob, fname, SC.FORMS[type].title); }
      }, function (e) { btn.disabled = false; btn.textContent = 'Save PDF / Share'; UI.toast(e.message || 'Could not make the PDF', true); });
    };
  });

  // ---------------- pharmacy: VED indent
  UI.route('pharm', function (filter) {
    filter = filter || 'all';
    var cfg = REP.settings(), list = REP.drugs();
    var rows = list.map(function (d) { return { d: d, c: REP.vedCalc(d, cfg) }; });
    var shown = rows.filter(function (x) { return filter === 'all' || (filter === 'crit' && x.c.status !== 'OK' && x.c.status !== 'OVERSTOCK') || (filter === 'indent' && x.c.qty > 0) || (filter === x.d.ved); });
    var total = rows.reduce(function (a, x) { return a + x.c.value; }, 0), crit = rows.filter(function (x) { return x.c.status === 'CRITICAL'; }).length, zero = list.filter(function (d) { return U.num(d.stock) <= 0; }).length;
    var mm = UI.defaultMonth(); var next = new Date(); next.setDate(1); next.setMonth(next.getMonth() + 1);
    var monthLabel = REP.MONTHS[next.getMonth()] + ' ' + next.getFullYear();
    UI.render(UI.topbar('VED analysis & drug indent', 'TNMSC · ' + list.length + ' items', 'home') + '<div class="wrap">' +
      '<div class="kv"><div><small>Indent value</small><b>₹' + Math.round(total).toLocaleString('en-IN') + '</b></div><div><small>Vital below buffer</small><b>' + crit + '</b></div><div><small>Out of stock</small><b>' + zero + '</b></div></div>' +
      '<div class="btns">' + [['all', 'All'], ['crit', 'Below buffer'], ['indent', 'To indent'], ['V', 'Vital'], ['E', 'Essential'], ['D', 'Desirable']].map(function (f) { return '<a class="btn sm ' + (filter === f[0] ? 'pri' : 'ghost') + '" href="#pharm/' + f[0] + '">' + f[1] + '</a>'; }).join('') + '</div>' +
      '<p class="small muted">Enter AMC (average of last 3 months’ issues), current stock and stock on order. Indent qty = Max stock − stock − on order, rounded up to the order multiple. Max = AMC × (review + lead months) + safety stock (AMC × buffer).</p>' +
      '<div class="card"><div class="list">' + (shown.length ? shown.map(function (x) {
        var d = x.d, c = x.c, cls = c.status === 'CRITICAL' ? 'bad' : c.status === 'BELOW BUFFER' ? 'warn' : c.status === 'OVERSTOCK' ? 'info' : 'ok';
        return '<div class="it" style="display:block;cursor:default" data-id="' + d.id + '"><div class="row2"><div class="grow"><b>' + h(d.name) + '</b> <span class="small muted">' + h(d.strength) + ' · ' + h(d.unit) + ' · ₹' + h(d.rate) + '</span></div><span class="badge">' + h(d.ved) + '</span><span class="badge ' + cls + '" data-st>' + c.status + '</span></div>' +
          '<div class="fgrid" style="grid-template-columns:repeat(3,1fr);margin-top:6px">' +
          [['amc', 'AMC'], ['stock', 'Stock'], ['onOrder', 'On order']].map(function (f) { return '<div class="f"><label>' + f[1] + '</label><input type="number" inputmode="numeric" min="0" data-dk="' + f[0] + '" value="' + h(d[f[0]]) + '"></div>'; }).join('') + '</div>' +
          '<div class="small" style="margin-top:6px">Safety <b data-c="safety">' + c.safety + '</b> · Max <b data-c="max">' + c.max + '</b> · Indent <b data-c="qty">' + c.qty + '</b> · ₹<b data-c="value">' + c.value + '</b> <a href="#drug/' + d.id + '" style="float:right">Edit</a></div></div>';
      }).join('') : '<div class="empty">No items.</div>') + '</div></div>' +
      '<div class="btns"><a class="btn ghost" href="#drug/new">+ Add drug</a><button class="btn pri" id="xl">Indent Excel (' + monthLabel + ')</button><a class="btn ghost" href="#report/ved">Print</a>' +
      '<button class="btn ghost" id="so">Set today’s stock-out count (' + zero + ')</button></div>' +
      '<details class="grp"><summary><b>Planning parameters</b></summary><div class="bd" style="padding:12px"><div class="fgrid">' +
      '<div class="f"><label>Review period (months)</label><input type="number" step="0.5" min="0" data-cfg="reviewMonths" value="' + h(cfg.reviewMonths) + '"></div>' +
      '<div class="f"><label>TNMSC lead time (months)</label><input type="number" step="0.5" min="0" data-cfg="leadMonths" value="' + h(cfg.leadMonths) + '"></div>' +
      ['V', 'E', 'D'].map(function (v) { return '<div class="f"><label>Buffer ' + v + ' (months of AMC)</label><input type="number" step="0.25" min="0" data-buf="' + v + '" value="' + h(cfg.buffer[v]) + '"></div>'; }).join('') +
      '</div><p class="small muted">Vital buffer 1 month because TNMSC supply can be delayed or nil-stock; raise it to 2 for items you routinely buy on local purchase.</p></div></details></div>', 'home');

    var save = function () { UI.debounce('drugs', function () { DB.put('cfg/drugs', { list: list }); UI.flashSaved(); }, 400); };
    UI.$('#app').addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.dk) {
        var card = t.closest('[data-id]'), d = list.filter(function (x) { return x.id === card.dataset.id; })[0];
        d[t.dataset.dk] = t.value === '' ? '' : +t.value; save();
        var c = REP.vedCalc(d, cfg);
        ['safety', 'max', 'qty', 'value'].forEach(function (k) { UI.$('[data-c="' + k + '"]', card).textContent = c[k]; });
        var st = UI.$('[data-st]', card); st.textContent = c.status; st.className = 'badge ' + (c.status === 'CRITICAL' ? 'bad' : c.status === 'BELOW BUFFER' ? 'warn' : c.status === 'OVERSTOCK' ? 'info' : 'ok');
      } else if (t.dataset.cfg || t.dataset.buf) {
        var s = DB.get('cfg/settings'), v = Object.assign({}, s ? s.v : {});
        if (t.dataset.cfg) v[t.dataset.cfg] = +t.value; else { v.buffer = Object.assign({}, cfg.buffer, v.buffer); v.buffer[t.dataset.buf] = +t.value; }
        UI.debounce('cfgv', function () { DB.put('cfg/settings', { v: v }); UI.flashSaved(); }, 500);
      }
    });
    UI.$('#xl').onclick = function () { UI.shareFile(X.build([REP.sheetVed(monthLabel)]), 'VED_Indent_TNMSC_' + monthLabel.replace(' ', '_') + '.xlsx'); };
    UI.$('#so').onclick = function () {
      var k = 'day/' + UI.state.date + '/qa', e = DB.get(k), v = Object.assign({}, e ? e.v : {}); v.stockout = zero;
      DB.put(k, { v: v }); UI.toast('Stock-out count ' + zero + ' saved for ' + U.dmy(UI.state.date));
    };
  });

  UI.route('drug', function (id) {
    var list = REP.drugs(), d = id === 'new' ? { id: 'd' + UI.uid(), ved: 'E', mult: 1 } : list.filter(function (x) { return x.id === id; })[0];
    if (!d) { UI.go('pharm'); return; }
    var F = [{ k: 'name', l: 'Drug name', req: true, wide: true }, { k: 'strength', l: 'Strength / form' }, { k: 'cat', l: 'Therapeutic category' }, { k: 'ved', l: 'VED class', t: 'sel', o: ['V', 'E', 'D'] },
      { k: 'unit', l: 'Unit' }, { k: 'rate', l: 'Unit rate (₹)', t: 'num' }, { k: 'mult', l: 'Order multiple', t: 'num' }, { k: 'amc', l: 'AMC', t: 'num' }, { k: 'stock', l: 'Current stock', t: 'num' }, { k: 'onOrder', l: 'On order', t: 'num' }, { k: 'remarks', l: 'Remarks', wide: true }];
    UI.render(UI.topbar(id === 'new' ? 'Add drug' : d.name, 'VED indent item', 'pharm') + '<div class="wrap"><div class="card"><div class="bd"><div class="fgrid">' +
      F.map(function (f) { return fieldHtml(f, d[f.k]); }).join('') + '</div><div class="btns"><button class="btn pri" id="sv">Save</button>' + (id !== 'new' ? '<button class="btn danger" id="del">Remove item</button>' : '') + '</div></div></div></div>', 'home');
    UI.$('#sv').onclick = function () {
      var v = readFields(F); if (!v.name) { UI.toast('Enter the drug name', true); return; }
      ['rate', 'mult', 'amc', 'stock', 'onOrder'].forEach(function (k) { if (v[k] != null) v[k] = +v[k]; });
      var nd = Object.assign({ id: d.id }, v), i = list.findIndex(function (x) { return x.id === d.id; });
      if (i >= 0) list[i] = nd; else list.push(nd);
      DB.put('cfg/drugs', { list: list }); UI.go('pharm');
    };
    if (UI.$('#del')) UI.$('#del').onclick = function () { if (confirm('Remove ' + d.name + '?')) { DB.put('cfg/drugs', { list: list.filter(function (x) { return x.id !== d.id; }) }); UI.go('pharm'); } };
  });

  // ---------------- office & compliance
  UI.route('office', function () {
    var env = DB.get('cfg/compliance'), list = env ? env.list : [], today = UI.todayIso();
    var ST = ['Valid', 'Applied / renewal in process', 'Not available', 'Not applicable'];
    function badge(x) {
      if (x.status === 'Not applicable') return '<span class="badge">NA</span>';
      if (x.status === 'Not available') return '<span class="badge bad">missing</span>';
      if (!x.valid) return x.status ? '<span class="badge info">' + h(x.status.split(' ')[0]) + '</span>' : '<span class="badge">—</span>';
      var d = Math.round((U.parse(x.valid) - U.parse(today)) / 864e5);
      return d < 0 ? '<span class="badge bad">expired</span>' : d <= 60 ? '<span class="badge warn">' + d + ' days</span>' : '<span class="badge ok">valid</span>';
    }
    var letters = DB.list('rec/letters/').filter(function (x) { return x.val.f.status === 'Pending'; }).length;
    var maint = DB.list('rec/maint/').filter(function (x) { return x.val.f.status !== 'Closed'; }).length;
    UI.render(UI.topbar('Licences & office', REP.settings().hospital, 'home') + '<div class="wrap">' +
      '<div class="tiles"><a class="tile" href="#reg/letters"><span class="ib">' + UI.icon('msg') + '</span><b>Letters register</b><small>' + letters + ' pending reply</small></a>' +
      '<a class="tile" href="#reg/maint"><span class="ib">' + UI.icon('settings') + '</span><b>Maintenance</b><small>' + maint + ' open complaints</small></a>' +
      '<a class="tile" href="#staff"><span class="ib">' + UI.icon('att') + '</span><b>Staff list</b><small>' + REP.staffList().length + ' active</small></a>' +
      '<a class="tile" href="#forms/ds"><span class="ib">' + UI.icon('doc') + '</span><b>Discharge summaries</b><small>DS-01 format</small></a></div>' +
      '<h2 class="sec">TNCEA inspection checklist – licences & certificates</h2>' +
      '<div class="card"><div class="list">' + list.map(function (x, i) {
        return '<div class="it" style="display:block;cursor:default" data-i="' + i + '"><div class="row2"><b class="grow">' + (i + 1) + '. ' + h(x.name) + '</b>' + badge(x) + '</div>' +
          '<div class="fgrid" style="margin-top:6px"><div class="f"><label>Status</label><select data-c="status"><option value="">—</option>' + ST.map(function (s) { return '<option' + (x.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
          '<div class="f"><label>Valid till</label><input type="date" data-c="valid" value="' + h(x.valid) + '"></div><div class="f wide"><label>Remarks / licence no.</label><input type="text" data-c="remarks" value="' + h(x.remarks) + '"></div></div></div>';
      }).join('') + '</div></div>' +
      '<div class="btns"><button class="btn ghost" id="addc">+ Add item</button><button class="btn ghost" onclick="window.print()">Print checklist</button></div></div>', 'home');
    function save() { UI.debounce('comp', function () { DB.put('cfg/compliance', { list: list }); UI.flashSaved(); }, 400); }
    UI.$('#app').addEventListener('change', function (e) { var t = e.target; if (!t.dataset.c) return; list[+t.closest('[data-i]').dataset.i][t.dataset.c] = t.value; save(); });
    UI.$('#app').addEventListener('input', function (e) { var t = e.target; if (t.dataset.c !== 'remarks') return; list[+t.closest('[data-i]').dataset.i].remarks = t.value; save(); });
    UI.$('#addc').onclick = function () { var n = prompt('Licence / certificate name'); if (n) { list.push({ id: 'c' + UI.uid(), name: n, status: '', valid: '', remarks: '' }); DB.put('cfg/compliance', { list: list }); UI.dispatch(); } };
  });


  // ---------------- referral follow-up: record the outcome of referred patients
  UI.route('referrals', function (show) {
    show = show || 'pending';
    var from = U.addDays(UI.todayIso(), -90), all = REP.registerRecords('referral', from, '9999-12-31').reverse();
    var pend = all.filter(function (r) { return !r.f.outcome || r.f.outcome === 'Pending follow-up'; });
    var list = show === 'all' ? all : pend;
    UI.render(UI.topbar('Referral follow-up', pend.length + ' outcome' + (pend.length === 1 ? '' : 's') + ' pending · last 90 days', 'home') + '<div class="wrap">' +
      '<div class="btns"><a class="btn sm ' + (show !== 'all' ? 'pri' : 'ghost') + '" href="#referrals">Outcome pending (' + pend.length + ')</a><a class="btn sm ' + (show === 'all' ? 'pri' : 'ghost') + '" href="#referrals/all">All referrals (' + all.length + ')</a>' +
      '<a class="btn sm ghost" href="#rec/referral/new">+ New referral</a><a class="btn sm ghost" href="#report/referral">Monthly referral report</a></div>' +
      '<div class="card"><div class="list">' + (list.length ? list.map(function (r) {
        var f = r.f;
        return '<div class="it" style="display:block;cursor:default" data-rid="' + h(r.id) + '"><div class="row2"><div class="grow"><b>' + h(f.name || '(no name)') + '</b> <span class="small muted">' + h([f.age, f.sex].filter(Boolean).join(' / ')) + ' · ' + U.dmy(r.date) + (f.time ? ' ' + h(f.time) : '') + '</span>' +
          '<div class="small">' + h(f.dx || '—') + ' · <b>' + h(f.mode || '—') + '</b> · ' + h(f.reason || '') + (f.to ? ' → ' + h(f.to) : '') + '</div></div><a class="small" href="#rec/referral/' + h(r.id) + '">Edit</a></div>' +
          '<div class="fgrid" style="margin-top:8px"><div class="f"><label>Outcome</label><select data-o="outcome"><option value="">—</option>' + SC.REF_OUTCOMES.map(function (o) { return '<option' + (f.outcome === o ? ' selected' : '') + '>' + h(o) + '</option>'; }).join('') + '</select></div>' +
          '<div class="f"><label>Known on</label><input type="date" data-o="outcome_date" value="' + h(f.outcome_date || '') + '"></div><div class="f wide"><label>Details</label><input type="text" data-o="outcome_note" value="' + h(f.outcome_note || '') + '" placeholder="Who informed, treatment given, current status"></div></div></div>';
      }).join('') : '<div class="empty">' + (show === 'all' ? 'No referrals in the last 90 days.' : 'All referral outcomes are recorded.') + '</div>') + '</div></div></div>', 'home');
    function save(card) {
      var key = 'rec/referral/' + card.dataset.rid, env = DB.get(key); if (!env) return;
      var f = Object.assign({}, env.f);
      UI.$$('[data-o]', card).forEach(function (x) { if (x.value) f[x.dataset.o] = x.value; else delete f[x.dataset.o]; });
      if (f.outcome && f.outcome !== 'Pending follow-up' && !f.outcome_date) { f.outcome_date = UI.todayIso(); var dd = UI.$('[data-o="outcome_date"]', card); if (dd) dd.value = f.outcome_date; }
      DB.put(key, { id: env.id, date: env.date, f: f }); UI.flashSaved();
    }
    UI.$('#app').addEventListener('change', function (e) { var c = e.target.closest('[data-rid]'); if (c && e.target.dataset.o) save(c); });
    UI.$('#app').addEventListener('input', function (e) { var c = e.target.closest('[data-rid]'); if (c && e.target.dataset.o === 'outcome_note') UI.debounce('ref' + c.dataset.rid, function () { save(c); }, 600); });
  });

  // ---------------- upload: fill entries from files, and download pre-filled Excel forms
  UI.route('import', function () {
    var cfg = REP.settings(), admin = G.AUTH.isAdmin(), file = null, results = [];
    var mm = UI.state.month || { y: +UI.state.date.slice(0, 4), m: +UI.state.date.slice(5, 7) };
    var TPL = [
      ['taei', 'TAEI daily entry form', 'All 263 TAEI rows × days of the month, with what is already entered', false],
      ['other', 'Other services form', 'Lab, X-ray, fever, NCD, MCH, HMIS, ABHA rows × days', false],
      ['regs', 'Case register forms', 'One sheet per register (MLC, referral, OT, delivery, deaths …) with blank rows', false],
      ['att', 'Attendance form', 'Staff × days, codes P / L / OD / ND / M / A', true],
      ['ncd', 'NCD monthly 7-sheet form', 'Dialysis, Echo, Stroke, ICU, Hypertension, VIA, Ca breast', true],
    ];
    UI.render(UI.topbar('Upload & Excel forms', 'Fill entries from files', 'home') + '<div class="wrap">' +
      '<label class="drop" id="drop"><input type="file" id="fin" accept=".xlsx,.csv,.json,.txt,.pdf,image/*,.jpg,.jpeg,.png" hidden>' + UI.icon('upload') + '<b>Choose, photograph or drop a file</b>' +
      '<span class="small">Excel (.xlsx) · CSV · PDF · photo (JPG / PNG) · .daybook.json</span></label>' +
      '<div id="res"></div>' +
      '<details class="grp"><summary><b>Paste text instead</b></summary><div class="bd" style="padding:12px 14px"><p class="small muted">Paste a daily WhatsApp report (from this app) or the text of a discharge summary / referral form.</p>' +
      '<textarea id="ptxt" placeholder="Paste here"></textarea><div class="btns"><button class="btn ghost" id="pgo">Read pasted text</button></div></div></details>' +
      '<h2 class="sec">Excel forms to fill offline</h2><div class="card"><div class="bd" style="padding-bottom:4px">' +
      '<p class="small" style="margin-top:0">Each form comes ready with the hospital, month, dates, staff names and everything already entered. Fill the empty cells in Excel / WPS / Google Sheets, then upload it here – the app puts every value in its place.</p>' +
      '<div class="row2"><input type="month" id="tm" value="' + mm.y + '-' + U.pad(mm.m) + '" style="max-width:220px"><button class="btn gold" id="tall">Download all forms (one workbook)</button></div></div>' +
      '<div class="list">' + TPL.map(function (t) {
        var lock = t[3] && !admin;
        return '<div class="it" style="cursor:default"><span class="ib">' + UI.icon('report') + '</span><div class="m"><b>' + h(t[1]) + (lock ? ' <span class="badge">CMO</span>' : '') + '</b><small>' + h(t[2]) + '</small></div>' +
          '<button class="btn sm ghost" data-tpl="' + t[0] + '"' + (lock ? ' disabled title="CMO / Admin only"' : '') + '>Download</button></div>';
      }).join('') + '</div></div>' +
      '<details class="grp"><summary><b>What can be read from a file?</b></summary><div class="bd" style="padding:12px 14px"><ul class="small" style="margin:0;padding-left:18px">' +
      '<li><b>Excel / CSV:</b> TAEI Daily Report month sheet; HMIS ABHA Count Report (sheet for ' + h(cfg.inst) + '); every Excel form above (daily, other services, attendance, case registers, NCD).</li>' +
      '<li><b>PDF or photo of the attendance list</b> (biometric attendance print-out): each staff member’s status for that day.</li>' +
      '<li><b>PDF or photo of a filled discharge summary, referral form or CMCHIS pre-auth</b>: opens a new form with the fields filled in for you to check and save.</li>' +
      '<li><b>The daily WhatsApp report</b> (pasted text, screenshot or PDF): the day’s figures.</li>' +
      '<li><b>.daybook.json</b> files from other phones.</li></ul>' +
      '<p class="small muted">Photos are read on this phone (no internet). Clear, straight, well-lit photos of printed pages work best; handwriting is not read reliably, so always check the preview. The first photo or PDF takes longer while the reader loads.</p></div></details></div>', 'import');
    var drop = UI.$('#drop'), fin = UI.$('#fin');
    fin.onchange = function () { if (fin.files[0]) load(fin.files[0]); fin.value = ''; };
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) load(f); });
    UI.$('#pgo').onclick = function () {
      var t = UI.$('#ptxt').value; if (!t.trim()) { UI.toast('Paste some text first', true); return; }
      file = { name: 'pasted text' }; show(G.IMPORT.parseText(t, { inst: cfg.inst, date: UI.state.date }));
    };

    function load(f, year) {
      file = f; UI.$('#res').innerHTML = '<div class="note info" id="prog">Reading ' + h(f.name) + '…</div>';
      G.IMPORT.parseFile(f, { inst: cfg.inst, year: year, date: UI.state.date, onProgress: function (m) { var p = UI.$('#prog'); if (p) p.textContent = 'Reading ' + f.name + ' – ' + m; } }).then(function (out) {
        if (out.json) {
          var r = DB.importData(out.json, { admin: G.AUTH.isAdmin() });
          UI.$('#res').innerHTML = '<div class="note ok">Entries received from ' + h(f.name) + ': ' + r.added + ' new, ' + r.updated + ' updated, ' + r.skipped + ' unchanged.' + (r.protectedSkipped ? ' ' + r.protectedSkipped + ' settings / CMO items were not taken (CMO sign-in needed).' : '') + '</div>';
          return;
        }
        show(out);
      }).catch(function (e) { UI.$('#res').innerHTML = '<div class="note bad">Could not read ' + h(f.name) + ': ' + h(e.message) + '</div>'; });
    }
    function show(out) {
      results = out.results.filter(function (r) { if (r.kind === 'recs') return r.recs.length; if (r.kind === 'ncd') return G.IMPORT.plan(r, 'overwrite').add + G.IMPORT.plan(r, 'overwrite').change + G.IMPORT.plan(r, 'overwrite').same; return true; });
      var hidden = out.results.length - results.length;
      var html = out.errors.map(function (e) { return '<div class="note warn">' + h(e) + '</div>'; }).join('');
      if (!results.length && !out.errors.length) html += '<div class="note bad">Nothing in this file could be matched to the app’s registers or reports.' + (out.sheets ? ' Sheets found: ' + h(out.sheets.join(', ')) + '.' : '') + ' See “What can be read from a file?” below.</div>';
      html += results.map(card).join('');
      if (hidden) html += '<p class="small muted">' + hidden + ' sheet' + (hidden > 1 ? 's' : '') + ' in this file had no entries and were left out.</p>';
      if (out.text) html += '<details class="grp"><summary><b>Text read from the file</b></summary><div class="bd" style="padding:12px 14px"><textarea readonly style="min-height:220px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">' + h(out.text) + '</textarea></div></details>';
      UI.$('#res').innerHTML = html;
    }
    function card(r, i) {
      var head = '<div class="card"><div class="hd"><b>' + h(r.label) + '</b>' + (r.sheet && r.sheet !== 'text' ? '<span class="badge info">sheet “' + h(r.sheet) + '”</span>' : '') + '</div><div class="bd">';
      if (r.kind === 'form') {
        var def = SC.FORMS[r.type];
        return head + '<p class="small">' + Object.keys(r.f).length + ' fields found. Open the form, check every value and save.</p><div class="small">' +
          def.fields.filter(function (fd) { return r.f[fd.k] != null; }).map(function (fd) { return '<b>' + h(fd.l) + ':</b> ' + h(r.f[fd.k]); }).join(' · ') + '</div>' +
          '<div class="btns"><button class="btn pri" data-open="' + i + '">Open as new ' + h(def.title.toLowerCase()) + '</button></div></div></div>';
      }
      if (r.kind === 'att' && !G.AUTH.isAdmin()) return head + '<div class="note warn">Attendance can only be saved by the CMO / Admin. <a href="#admin/import">Sign in</a> and upload again.</div></div></div>';
      var pl = G.IMPORT.plan(r, 'blanks'), po = G.IMPORT.plan(r, 'overwrite'), span = '';
      if (r.days) { var dates = Object.keys(r.days).sort(); if (dates.length) span = dates.length + ' day' + (dates.length > 1 ? 's' : '') + ' · <b>' + U.dmy(dates[0]) + '</b> to <b>' + U.dmy(dates[dates.length - 1]) + '</b>'; }
      if (r.att) { var ad = Object.keys(r.att).sort(); span = ad.length + ' day' + (ad.length > 1 ? 's' : '') + (ad.length ? ' from ' + U.dmy(ad[0]) : '') + (r.unknown && r.unknown.length ? ' · <span class="muted">not matched to the staff list: ' + h(r.unknown.slice(0, 12).join(', ')) + (r.unknown.length > 12 ? ' …' : '') + '</span>' : ''); }
      if (r.recs) span = r.recs.length + ' row' + (r.recs.length === 1 ? '' : 's') + ' with a name';
      if (r.ncd) span = Object.keys(r.ncd).length + ' figures for ' + h(r.ym);
      var total = pl.add + po.change + pl.same + pl.keep;
      return head + '<p>' + span + '</p>' +
        (r.year ? '<div class="row2 small">Year used for the day columns: <input type="number" id="yr' + i + '" value="' + r.year + '" style="width:110px;min-height:36px"><button class="btn sm ghost" data-reyear="' + i + '">Use this year</button></div>' : '') +
        '<div class="kv"><div><small>New</small><b>' + pl.add + '</b></div><div><small>Already same</small><b>' + pl.same + '</b></div><div><small>Different from saved</small><b>' + po.change + '</b></div>' + (pl.locked ? '<div><small>Locked days (CMO only)</small><b>' + pl.locked + '</b></div>' : '') + '</div>' +
        '<div class="checks"><label><input type="radio" name="mode' + i + '" value="blanks" checked> Fill only empty boxes (keep what staff entered)</label><label><input type="radio" name="mode' + i + '" value="overwrite"> Replace saved values with the file</label></div>' +
        '<div class="btns"><button class="btn pri" data-apply="' + i + '"' + (total ? '' : ' disabled') + '>Save into the app</button></div></div></div>';
    }
    UI.$('#app').addEventListener('click', function (e) {
      var b = e.target.closest('[data-apply],[data-reyear],[data-open],[data-tpl],#tall'); if (!b) return;
      if (b.dataset.reyear) { load(file, +UI.$('#yr' + b.dataset.reyear).value); return; }
      if (b.dataset.open) { var r = results[+b.dataset.open]; G.__draftForm = { type: r.type, f: r.f }; UI.go('form/' + r.type + '/new'); return; }
      if (b.dataset.tpl || b.id === 'tall') { downloadForms(b.dataset.tpl || 'all'); return; }
      var i = +b.dataset.apply, mode = (UI.$('input[name="mode' + i + '"]:checked') || {}).value || 'blanks';
      var p = G.IMPORT.apply(results[i], mode, UI.user().name + ' (upload: ' + file.name + ')');
      b.disabled = true; b.textContent = 'Saved';
      UI.toast((p.add + p.change) + ' values saved' + (p.locked ? ' · ' + p.locked + ' locked days skipped' : ''));
    });
    function downloadForms(which) {
      var v = UI.$('#tm').value.split('-'), M = REP.month(+v[0], +v[1]), sp = [];
      if (which === 'taei' || which === 'all') sp.push(REP.sheetTaeiDaily(M));
      if (which === 'other' || which === 'all') sp.push(REP.sheetOther(M));
      if (which === 'regs' || which === 'all') SC.REGISTERS.forEach(function (r) { sp.push(REP.sheetRegister(r.id, M, 20)); });
      if ((which === 'att' || which === 'all') && G.AUTH.isAdmin()) sp.push(REP.sheetAttendance(M));
      if ((which === 'ncd' || which === 'all') && G.AUTH.isAdmin()) sp = sp.concat(G.NCD.sheetSpecs(M));
      UI.shareFile(X.build(sp), 'GH_UTM_Forms_' + (which === 'all' ? 'All' : which) + '_' + M.mon.replace('-', '_') + '.xlsx', 'Fill-in forms ' + M.label);
    }
  });

  // ---------------- staff & areas
  UI.route('staff', function () {
    var env = DB.get('cfg/staff'), list = env ? env.list : [];
    UI.render(UI.topbar('Staff list', list.length + ' staff', 'settings') + '<div class="wrap">' +
      '<p class="small muted">Used for attendance and name suggestions. Untick “active” for staff who are transferred – their old records stay.</p>' +
      '<div class="card"><div class="list">' + list.map(function (s, i) {
        return '<div class="it" style="display:block;cursor:default" data-i="' + i + '"><div class="fgrid" style="grid-template-columns:2fr 2fr auto"><input type="text" data-s="name" value="' + h(s.name) + '" aria-label="Name">' +
          '<input type="text" data-s="desig" value="' + h(s.desig) + '" aria-label="Designation"><label class="checks"><input type="checkbox" data-s="active"' + (s.inactive ? '' : ' checked') + '> active</label></div></div>';
      }).join('') + '</div></div><div class="btns"><button class="btn pri" id="add">+ Add staff</button></div></div>', 'settings');
    function save() { UI.debounce('staff', function () { DB.put('cfg/staff', { list: list }); UI.flashSaved(); }, 400); }
    UI.$('#app').addEventListener('input', function (e) { var t = e.target, k = t.dataset.s; if (!k || k === 'active') return; list[+t.closest('[data-i]').dataset.i][k] = t.value; save(); });
    UI.$('#app').addEventListener('change', function (e) { var t = e.target; if (t.dataset.s !== 'active') return; var s = list[+t.closest('[data-i]').dataset.i]; if (t.checked) delete s.inactive; else s.inactive = true; save(); });
    UI.$('#add').onclick = function () { list.push({ id: 's' + UI.uid(), name: '', desig: '' }); DB.put('cfg/staff', { list: list }); UI.dispatch(); setTimeout(function () { var x = UI.$$('[data-s="name"]').pop(); if (x) x.focus(); }, 50); };
  });
  UI.route('areas', function () {
    UI.render(UI.topbar('Cleaning areas', 'One area per line', 'clean') + '<div class="wrap"><div class="card"><div class="bd"><textarea id="ar" style="min-height:320px">' + h(REP.cleanAreas().join('\n')) + '</textarea>' +
      '<div class="btns"><button class="btn pri" id="sv">Save</button></div></div></div></div>', 'home');
    UI.$('#sv').onclick = function () { var l = UI.$('#ar').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); DB.put('cfg/areas', { list: l }); UI.go('clean'); };
  });
})(window);
