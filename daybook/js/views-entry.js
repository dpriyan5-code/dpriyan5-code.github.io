/* Home, first-run setup, daily entry modules, attendance, housekeeping, EMO duty checklist. */
(function (G) {
  'use strict';
  var UI = G.UI, DB = G.DB, REP = G.REP, SC = G.DB_SCHEMA, U = REP.util, h = UI.h;
  var SEED_AT = '2000-01-01T00:00:00.000Z'; // seeds lose to any real edit when phones are merged

  function ensureSeeds() {
    if (!DB.get('cfg/staff')) DB.put('cfg/staff', { list: SC.STAFF_SEED.map(function (s, i) { return { id: 's' + (i + 1), name: s[0], desig: s[1] }; }) }, { at: SEED_AT, by: 'setup' });
    if (!DB.get('cfg/drugs')) DB.put('cfg/drugs', { list: SC.DRUG_SEED.map(function (d, i) { return { id: 'd' + (i + 1), name: d[0], strength: d[1], cat: d[2], ved: d[3], unit: d[4], rate: d[5], amc: d[6], stock: d[7], onOrder: d[8], mult: d[9], remarks: '' }; }) }, { at: SEED_AT, by: 'setup' });
    if (!DB.get('cfg/compliance')) DB.put('cfg/compliance', { list: SC.COMPLIANCE_SEED.map(function (n, i) { return { id: 'c' + (i + 1), name: n, status: '', valid: '', remarks: '' }; }) }, { at: SEED_AT, by: 'setup' });
  }

  function roleOf() { var u = UI.user(); return u ? u.role : ''; }
  var EXTRA_TILES = {
    att: { title: 'Attendance', ic: 'att', who: ['cmo', 'clerk', 'nurse'], desc: 'Staff present / leave / OD' },
    clean: { title: 'Housekeeping & BMW', ic: 'clean', who: ['hk', 'nurse', 'cmo'], desc: 'Cleaning rounds, BMW kg, fogging' },
    chk: { title: 'EMO duty checklist', ic: 'chk', who: ['doctor'], desc: '15-point handover checklist' },
  };
  var MOD_IC = { op: 'op', ip: 'bed', emg: 'emg', ot: 'ot', svc: 'lab', hmis: 'hmis', qa: 'kpi', admin: 'fund', meta: 'user' };

  function moduleStatus(date, modId) {
    var env = DB.get('day/' + date + '/' + modId);
    var rows = SC.ALL_ROWS.filter(function (r) { return r.m === modId && (r.t === 'n' || r.t === 'txt' || r.t === 'sel'); });
    var filled = env ? rows.filter(function (r) { return !U.isBlank(env.v[r.k]); }).length : 0;
    return { filled: filled, total: rows.length, by: env && env.by, at: env && env.at };
  }
  function statusBadge(st) {
    if (!st.filled) return '<span class="badge">not started</span>';
    if (st.filled >= st.total) return '<span class="badge ok">✓ done</span>';
    return '<span class="badge warn">' + st.filled + '/' + st.total + '</span>';
  }

  // ---------------- setup
  UI.route('setup', function () {
    ensureSeeds();
    var staff = REP.staffList(), u = UI.user() || {};
    UI.render(UI.topbar('Welcome to GH-UTM Daybook', REP.settings().hospital) + '<div class="wrap">' +
      '<div class="card"><div class="hd"><b>Who is using this phone?</b></div><div class="bd">' +
      '<p class="muted small">Your name is saved with every entry you make, so reports show who filled what. Each staff member can use their own phone; entries are combined using the Share screen.</p>' +
      '<div class="fgrid"><div class="f wide"><label>Your name</label><input type="text" id="su_name" list="stafflist" value="' + h(u.name || '') + '" placeholder="Type or pick your name" autocomplete="off">' +
      '<datalist id="stafflist">' + staff.map(function (s) { return '<option value="' + h(s.name) + '">' + h(s.desig) + '</option>'; }).join('') + '</datalist></div>' +
      '<div class="f wide"><label>Your role</label><select id="su_role">' + SC.ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (u.role === r[0] ? ' selected' : '') + '>' + h(r[1]) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="btns"><button class="btn pri block" id="su_go">Start</button></div></div></div>' +
      '<div class="note info small">Works without internet. Data stays on this phone until you share it. Install it: <b>Android</b> – Chrome menu ⋮ → <i>Install app</i>. <b>iPhone</b> – Safari Share ⬆ → <i>Add to Home Screen</i>.</div></div>', false);
    UI.$('#su_go').onclick = function () {
      var name = UI.$('#su_name').value.trim(); if (!name) { UI.toast('Please enter your name', true); return; }
      var role = UI.$('#su_role').value;
      UI.setUser({ name: name, role: role }); UI.go(role === 'cmo' && !G.AUTH.isAdmin() ? 'admin' : 'home');
    };
  });

  // ---------------- home
  UI.route('home', function () {
    ensureSeeds();
    var u = UI.user(), role = u.role, date = UI.state.date, cfg = REP.settings();
    var d = REP.day(date);
    var mods = SC.DAY_MODULES.filter(function (m) { return m.id !== 'meta'; });
    function tile(href, ic, title, desc, badge, mine) {
      return '<a class="tile' + (mine ? ' mine' : '') + '" href="#' + href + '">' + (badge || '') + '<span class="ib">' + UI.icon(ic) + '</span><b>' + h(title) + '</b><small>' + h(desc) + '</small></a>';
    }
    var admin = G.AUTH.isAdmin();
    if (!admin) mods = mods.filter(function (m) { return m.id !== 'admin'; });
    var entry = mods.map(function (m) { return { href: 'day/' + m.id, ic: MOD_IC[m.id], title: m.title, desc: m.desc, badge: statusBadge(moduleStatus(date, m.id)), mine: m.who.indexOf(role) >= 0 }; });
    var a = REP.attendanceSummary(date), c = REP.cleaningSummary(date), chk = DB.keys('chk/' + date + '/');
    if (admin) entry.push({ href: 'att', ic: EXTRA_TILES.att.ic, title: 'Attendance', desc: EXTRA_TILES.att.desc, badge: a.total ? '<span class="badge ok">' + a.c.P + ' present</span>' : '<span class="badge">not marked</span>', mine: EXTRA_TILES.att.who.indexOf(role) >= 0 });
    entry.push({ href: 'clean', ic: EXTRA_TILES.clean.ic, title: 'Housekeeping & BMW', desc: EXTRA_TILES.clean.desc, badge: c.marked ? '<span class="badge ' + (c.pct >= 90 ? 'ok' : 'warn') + '">' + c.pct + '%</span>' : '<span class="badge">not marked</span>', mine: EXTRA_TILES.clean.who.indexOf(role) >= 0 });
    entry.push({ href: 'chk', ic: EXTRA_TILES.chk.ic, title: 'EMO duty checklist', desc: EXTRA_TILES.chk.desc, badge: chk.length ? '<span class="badge ok">' + chk.length + ' shift' + (chk.length > 1 ? 's' : '') + '</span>' : '<span class="badge">—</span>', mine: EXTRA_TILES.chk.who.indexOf(role) >= 0 });
    entry.sort(function (x, y) { return (y.mine ? 1 : 0) - (x.mine ? 1 : 0); });

    // alerts
    var alerts = [];
    var w = d.any ? REP.validate(d.v).concat(REP.unusual(date, d.v)) : [];
    if (w.length) alerts.push('<div class="note warn"><b>Please check today\'s entries</b><ul>' + w.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul></div>');
    var comp = (DB.get('cfg/compliance') || { list: [] }).list.filter(function (x) { return x.valid; }).map(function (x) { return { n: x.name, d: Math.round((U.parse(x.valid) - U.parse(UI.todayIso())) / 864e5) }; }).filter(function (x) { return x.d <= 60; });
    if (comp.length) alerts.push('<div class="note bad"><b>Licences expiring / expired</b><ul>' + comp.map(function (x) { return '<li>' + h(x.n) + ' – ' + (x.d < 0 ? 'expired ' + (-x.d) + ' days ago' : 'in ' + x.d + ' days') + '</li>'; }).join('') + '</ul><a href="#office">Open compliance tracker</a></div>');
    var crit = REP.drugs().filter(function (dr) { return REP.vedCalc(dr, cfg).status === 'CRITICAL'; }).length;
    if (crit && (role === 'pharm' || role === 'cmo')) alerts.push('<div class="note bad"><b>' + crit + ' vital drug' + (crit > 1 ? 's' : '') + ' below safety stock.</b> <a href="#pharm">Open VED indent</a></div>');
    var lastBk = localStorage.getItem('ghd_lastbackup');
    if (!lastBk || (Date.now() - +lastBk) > 7 * 864e5) alerts.push('<div class="note info small">No backup in the last 7 days. <a href="#sync">Make a backup</a> (keeps your records safe if the phone is lost).</div>');

    var meta = DB.get('day/' + date + '/meta');
    var core = ['op', 'ip', 'emg', 'ot', 'svc', 'hmis'];
    var done = core.filter(function (m) { return moduleStatus(date, m).filled > 0; }).length, pct = Math.round(done / core.length * 100);
    var hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    UI.render(UI.topbar(cfg.short + ' Daybook', u.name + ' · ' + (SC.ROLES.filter(function (r) { return r[0] === role; })[0] || ['', ''])[1]) + '<div class="wrap">' +
      UI.datebar() +
      '<div class="hero"><div class="ring" style="--p:' + pct + '"><span>' + pct + '%</span></div><div class="grow"><h1>' + h(greet) + ', ' + h(/^dr\.?$/i.test(u.name.split(' ')[0]) ? u.name.split(' ').slice(0, 2).join(' ') : u.name.split(' ')[0]) + '</h1>' +
      '<p>' + done + ' of ' + core.length + ' main daily sections complete for ' + U.dmy(date) + '</p><p>DMO: <b>' + h((meta && meta.v.dmo) || '—') + '</b> · Filled by: <b>' + h((meta && meta.v.filledby) || '—') + '</b> · <a href="#day/meta">edit</a></p></div></div>' +
      (d.any ? '<div class="kv">' +
        [['OP', 'op_tot'], ['Midnight census', 'mc_tot'], ['Admissions', 'na_tot'], ['TAEI', 'te_tot'], ['MLC', 'mlc_tot'], ['Deaths', 'd_tot']].map(function (x) { return '<div><small>' + x[0] + '</small><b>' + U.num(d.v[x[1]]) + '</b></div>'; }).join('') + '</div>' : '') +
      alerts.join('') +
      otCard(date) +
      '<h2 class="sec">Daily entry · ' + U.dmy(date) + '</h2><div class="tiles">' + entry.map(function (t) { return tile(t.href, t.ic, t.title, t.desc, t.badge, t.mine); }).join('') + '</div>' +
      '<h2 class="sec">Registers & forms</h2><div class="tiles">' +
      tile('regs', 'regs', 'Case registers', 'MLC, referral, death, fever, bites, OT, delivery…') +
      tile('forms/ref', 'ref', 'Referral form', 'Clinical referral letter – print & file in register') +
      tile('referrals', 'ref', 'Referral follow-up', 'Outcome of referred patients') +
      tile('forms/ds', 'doc', 'Discharge summary', 'Fill & print DS-01 format') +
      tile('forms/preauth', 'rx', 'CMCHIS pre-auth', 'Fill & print pre-authorisation') +
      '</div><h2 class="sec">Pharmacy & office</h2><div class="tiles">' +
      tile('pharm', 'pill', 'VED drug indent', 'AMC, stock, TNMSC indent', '', role === 'pharm') +
      tile('office', 'office', 'Licences & office', 'TNCEA checklist, letters, maintenance', '', role === 'clerk') +
      '</div><h2 class="sec">Reports</h2><div class="tiles">' +
      tile('msg', 'msg', 'Daily WhatsApp report', 'One tap text for the group', '', true) +
      (admin ? tile('reports', 'report', 'Monthly reports', 'TAEI, KPI, CM dashboard, fever, MedLeaPR, NCD – Excel / PDF') : '') +
      tile('import', 'upload', 'Upload & Excel forms', 'Excel, PDF, photo – fill entries; download fill-in forms') +
      tile('admin', 'office', admin ? 'CMO / Admin' : 'CMO / Admin sign-in', admin ? 'Signed in – reports, funds, attendance, corrections' : 'Reports, funds, attendance, corrections') +
      tile('sync', 'share', 'Share & backup', 'Combine entries from all phones') +
      '</div></div>', 'home');
  });

  // OT line list for the selected day, shown on the dashboard
  function otCard(date) {
    var recs = REP.registerRecords('ot', date, date), mm = date.slice(0, 7);
    var month = REP.registerRecords('ot', mm + '-01', mm + '-31');
    var major = month.filter(function (r) { return r.f.cat !== 'Minor'; }).length;
    return '<h2 class="sec">OT line list · ' + U.dmy(date) + '</h2><div class="card"><div class="hd"><b>' + recs.length + ' case' + (recs.length === 1 ? '' : 's') + ' today</b>' +
      '<span class="badge info">This month: ' + month.length + ' (major ' + major + ', minor ' + (month.length - major) + ')</span></div>' +
      (recs.length ? '<div style="overflow-x:auto"><table class="ot"><tr><th>Time</th><th>Patient</th><th>IP No.</th><th>Procedure</th><th>Dept</th><th>Type</th><th>Surgeon</th><th>Anaesthesia</th></tr>' +
        recs.map(function (r) {
          var f = r.f;
          return '<tr><td>' + h(f.start || '') + '</td><td><a href="#rec/ot/' + h(r.id) + '">' + h(f.name || '') + '</a><br><span class="small muted">' + h([f.age, f.sex].filter(Boolean).join(' / ')) + '</span></td><td>' + h(f.ipno || '') + '</td><td>' + h(f.proc || f.dx || '') + '</td><td>' + h(f.dept || '') + '</td><td>' +
            '<span class="badge ' + (f.cat === 'Minor' ? '' : 'warn') + '">' + h(f.cat || 'Major') + (f.emerg === 'Yes' ? ' · Emergency' : '') + '</span></td><td>' + h(f.surgeon || '') + '</td><td>' + h(f.atype || '') + (f.anaes ? '<br><span class="small muted">' + h(f.anaes) + '</span>' : '') + '</td></tr>';
        }).join('') + '</table></div>' : '<div class="empty small">No operations entered for this date.</div>') +
      '<div class="bd" style="padding-top:0"><div class="btns" style="margin-bottom:0"><a class="btn sm pri" href="#rec/ot/new">+ Add OT case</a><a class="btn sm ghost" href="#reg/ot">Month line list</a></div></div></div>';
  }

  // ---------------- daily entry module
  function groupsOf(modId) {
    var order = [], map = {};
    SC.ALL_ROWS.forEach(function (r) {
      if (r.m !== modId || r.t === 'hd') return;
      if (!map[r.g]) { map[r.g] = []; order.push(r.g); }
      map[r.g].push(r);
    });
    return order.map(function (g) { return { g: g, rows: map[g] }; });
  }
  function fmtCalc(v, r) { if (U.isBlank(v)) return '–'; return r.k === 'bor' || r.k === 'tr_refpct' ? v + '%' : v; }

  UI.route('day', function (modId) {
    var mod = SC.DAY_MODULES.filter(function (m) { return m.id === modId; })[0];
    if (!mod) { UI.go('home'); return; }
    var date = UI.state.date, key = 'day/' + date + '/' + modId;
    var env = DB.get(key), vals = Object.assign({}, env ? env.v : {});
    var editable = G.AUTH.canEdit(date), orig = Object.assign({}, vals), logIt = G.AUTH.needsAudit(env, date), aid = G.AUTH.auditId();
    var groups = groupsOf(modId);
    var many = groups.reduce(function (a, g) { return a + g.rows.length; }, 0) > 60; // collapse only long screens (Emergency)
    var staff = REP.staffList();

    function rowHtml(r) {
      var v = vals[r.k];
      if (r.t === 'calc') return '<div class="nrow calcrow"><label>' + h(r.s) + '</label><span class="calc" data-calc="' + r.k + '">–</span></div>';
      if (r.t === 'txt') {
        var dl = (r.k === 'dmo' || r.k === 'filledby') ? ' list="stafflist"' : '';
        return '<div class="trow"><label>' + h(r.s) + '</label><input type="text" data-k="' + r.k + '" value="' + h(v) + '"' + dl + ' autocomplete="off"></div>';
      }
      if (r.t === 'sel') return '<div class="trow"><label>' + h(r.s) + '</label><select data-k="' + r.k + '"><option value="">—</option>' + r.opts.map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + h(o) + '</option>'; }).join('') + '</select></div>';
      return '<div class="nrow"><label>' + h(r.s) + (r.agg === 'last' ? '<small>Enter the latest figure – the month report takes the last value</small>' : '') + '</label><div class="step"><button type="button" data-step="-1" data-for="' + r.k + '" aria-label="minus">−</button>' +
        '<input type="number" inputmode="' + (r.agg === 'last' ? 'decimal' : 'numeric') + '" min="0" step="any" data-k="' + r.k + '" value="' + h(v) + '"><button type="button" data-step="1" data-for="' + r.k + '" aria-label="plus">+</button></div></div>';
    }
    function groupFilled(gr) { var ins = gr.rows.filter(function (r) { return r.t !== 'calc'; }); return [ins.filter(function (r) { return !U.isBlank(vals[r.k]); }).length, ins.length]; }

    // registers that can fill this module
    var regFill = SC.REGISTERS.filter(function (rg) { return rg.counts; }).map(function (rg) {
      var recs = REP.registerRecords(rg.id, date, date);
      if (!recs.length) return null;
      var res = rg.counts(recs);
      return res.module === modId ? { rg: rg, n: recs.length, values: res.values } : null;
    }).filter(Boolean);

    UI.render(UI.topbar(mod.title, U.dmy(date) + ' · ' + U.dow(date), 'home') + '<div class="wrap">' + UI.datebar() +
      '<datalist id="stafflist">' + staff.map(function (s) { return '<option value="' + h(s.name.indexOf('Dr') === 0 ? s.name : (/nurse/i.test(s.desig) ? 'S/N ' + s.name : s.name)) + '">'; }).join('') + '</datalist>' +
      (env ? '<p class="small muted">Last saved by <b>' + h(env.by) + '</b> at ' + new Date(env.at).toLocaleString() + '</p>' : '') +
      (!editable ? '<div class="note warn"><b>Locked.</b> Staff can enter data for today and yesterday only. To correct this date, ask the CMO / Admin to <a href="#admin/' + encodeURIComponent('day/' + modId) + '">sign in</a>.</div>' : logIt ? '<div class="note info small">CMO correction mode – your changes to this date are recorded in the corrections log.</div>' : '') +
      '<div class="' + (editable ? '' : 'locked-day') + '">' +
      (regFill.length ? '<div class="note info">' + regFill.map(function (x) { return '' + x.n + ' entr' + (x.n > 1 ? 'ies' : 'y') + ' in <b>' + h(x.rg.title) + '</b> for this date. <button class="btn sm ghost" data-fill="' + x.rg.id + '">Fill counts from register</button>'; }).join('<br>') + '</div>' : '') +
      '<div id="warns"></div>' +
      (many ? '<div class="btns noprint">' + groups.map(function (gr, i) { return '<button class="btn sm ghost" data-jump="' + i + '">' + h(gr.g) + '</button>'; }).join('') + '</div>' : '') +
      groups.map(function (gr, i) {
        var f = groupFilled(gr);
        return '<details class="grp" id="grp' + i + '" ' + (!many || i === 0 || f[0] ? 'open' : '') + '><summary><b>' + h(gr.g) + '</b><span class="badge' + (f[0] === f[1] ? ' ok' : '') + '" data-gb="' + i + '">' + f[0] + '/' + f[1] + '</span></summary>' +
          '<div class="rows">' + gr.rows.map(rowHtml).join('') + '</div>' +
          (gr.rows.some(function (r) { return r.t === 'n'; }) ? '<div class="nrow"><label class="small muted">Nothing to report in this section?</label><button class="btn sm ghost" data-nil="' + i + '">Fill blanks with 0</button></div>' : '') +
          '</details>';
      }).join('') +
      '</div><div class="btns"><a class="btn pri block" href="#home">✓ Done</a></div></div>', 'home');

    var cfg = REP.settings();
    function refresh() {
      var all = REP.rawDayMerged(date, modId, vals);
      var comp = REP.compute(all, cfg);
      UI.$$('[data-calc]').forEach(function (el) { el.textContent = fmtCalc(comp[el.dataset.calc], SC.ROW[el.dataset.calc]); });
      groups.forEach(function (gr, i) { var f = groupFilled(gr), b = UI.$('[data-gb="' + i + '"]'); if (b) { b.textContent = f[0] + '/' + f[1]; b.className = 'badge' + (f[0] === f[1] ? ' ok' : ''); } });
      var w = REP.validate(comp).concat(REP.unusual(date, comp));
      UI.$('#warns').innerHTML = w.length ? '<div class="note warn"><b>Please check</b><ul>' + w.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul></div>' : '';
    }
    function save() {
      UI.debounce('save-' + key, function () {
        var clean = {}; Object.keys(vals).forEach(function (k) { if (!U.isBlank(vals[k])) clean[k] = vals[k]; });
        if (!editable) return;
        if (Object.keys(clean).length) DB.put(key, { v: clean }); else if (DB.get(key)) DB.del(key);
        if (logIt) G.AUTH.audit(key, orig, clean, aid);
        UI.flashSaved();
      });
    }
    function setVal(k, raw) {
      var r = SC.ROW[k];
      if (r.t === 'n') { vals[k] = raw === '' ? '' : Math.max(0, +raw); } else vals[k] = raw;
      refresh(); save();
    }
    var app = UI.$('#app');
    app.addEventListener('input', function (e) { var k = e.target.dataset && e.target.dataset.k; if (k) setVal(k, e.target.value); });
    app.addEventListener('change', function (e) { var k = e.target.dataset && e.target.dataset.k; if (k && e.target.tagName === 'SELECT') setVal(k, e.target.value); });
    app.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step],[data-nil],[data-fill],[data-jump]'); if (!b) return;
      if (b.dataset.jump) { var gd = UI.$('#grp' + b.dataset.jump); gd.open = true; gd.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (b.dataset.step) {
        var k = b.dataset.for, inp = UI.$('input[data-k="' + k + '"]');
        var nv = Math.max(0, U.num(inp.value) + (+b.dataset.step)); inp.value = nv; setVal(k, String(nv));
      } else if (b.dataset.nil) {
        groups[+b.dataset.nil].rows.forEach(function (r) { if (r.t === 'n' && U.isBlank(vals[r.k])) { vals[r.k] = 0; var inp = UI.$('input[data-k="' + r.k + '"]'); if (inp) inp.value = 0; } });
        refresh(); save();
      } else if (b.dataset.fill) {
        var x = regFill.filter(function (y) { return y.rg.id === b.dataset.fill; })[0];
        Object.keys(x.values).forEach(function (k) { vals[k] = x.values[k]; var inp = UI.$('[data-k="' + k + '"]'); if (inp) inp.value = x.values[k]; });
        refresh(); save(); UI.toast('Counts filled from ' + x.rg.title);
      }
    });
    refresh();
  });

  // ---------------- attendance
  UI.route('att', function () {
    var date = UI.state.date, key = 'att/' + date, env = DB.get(key), vals = Object.assign({}, env ? env.v : {});
    var staff = REP.staffList();
    function counts() { var c = {}; SC.ATT.forEach(function (a) { c[a[0]] = 0; }); staff.forEach(function (s) { if (vals[s.id]) c[vals[s.id]]++; }); return c; }
    function summary() { var c = counts(); return SC.ATT.map(function (a) { return '<div><small>' + h(a[1]) + '</small><b>' + c[a[0]] + '</b></div>'; }).join(''); }
    UI.render(UI.topbar('Attendance', U.dmy(date) + ' · ' + staff.length + ' staff', 'home') + '<div class="wrap">' + UI.datebar() +
      '<div class="kv" id="attsum">' + summary() + '</div>' +
      '<div class="btns"><button class="btn ghost sm" id="allp">Mark unmarked as Present</button><a class="btn ghost sm" href="#staff">Edit staff list</a></div>' +
      '<div class="card"><div class="list">' + (staff.length ? staff.map(function (s) {
        return '<div class="it" style="cursor:default"><div class="m"><b>' + h(s.name) + '</b><small>' + h(s.desig) + '</small></div><div class="seg" data-sid="' + s.id + '">' +
          SC.ATT.map(function (a) { return '<button class="' + a[0] + (vals[s.id] === a[0] ? ' on' : '') + '" data-v="' + a[0] + '" title="' + h(a[1]) + '">' + a[0] + '</button>'; }).join('') + '</div></div>';
      }).join('') : '<div class="empty">No staff yet. <a href="#staff">Add staff</a></div>') + '</div></div>' +
      '<p class="small muted">P Present · L Leave · OD On duty outside · ND Night-duty off · M Missed punch · A Absent</p></div>', 'home');
    function save() { UI.debounce(key, function () { DB.put(key, { v: vals }); UI.flashSaved(); }, 200); UI.$('#attsum').innerHTML = summary(); }
    UI.$('#app').addEventListener('click', function (e) {
      var b = e.target.closest('.seg[data-sid] button'); if (!b) return;
      var sid = b.parentNode.dataset.sid, v = b.dataset.v;
      vals[sid] = vals[sid] === v ? '' : v; if (!vals[sid]) delete vals[sid];
      UI.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('on', x.dataset.v === vals[sid]); });
      save();
    });
    UI.$('#allp').onclick = function () { staff.forEach(function (s) { if (!vals[s.id]) vals[s.id] = 'P'; }); DB.put(key, { v: vals }); UI.dispatch(); };
  });

  // ---------------- housekeeping & BMW
  UI.route('clean', function () {
    var date = UI.state.date, key = 'cln/' + date, env = DB.get(key);
    var st = { v: {}, bmw: {}, tasks: {}, staff: '', sup: '', agency: '', time: '' };
    if (env) Object.keys(st).forEach(function (k) { if (env[k] != null) st[k] = typeof env[k] === 'object' ? Object.assign({}, env[k]) : env[k]; });
    var areas = REP.cleanAreas(), R = SC.CLEAN_ROUNDS;
    function cell(ar, rd) { var x = st.v[ar + '|' + rd], s = x ? x.s : ''; return '<button class="' + (s === 'Y' ? 'on Y' : s === 'N' ? 'on N' : '') + '" data-ar="' + h(ar) + '" data-rd="' + rd + '">' + rd.charAt(0) + (s === 'Y' ? ' ✓' : s === 'N' ? ' ✗' : '') + '</button>'; }
    function render() {
      var c = REP.cleaningSummaryFrom(st, areas);
      UI.render(UI.topbar('Housekeeping & BMW', U.dmy(date), 'home') + '<div class="wrap">' + UI.datebar() +
        '<div class="note info small">Tap a round once for ✓ done, again for ✗ not done, again to clear. M = Morning, A = Afternoon, N = Night. Done: <b>' + c.done + '/' + c.expected + ' (' + c.pct + '%)</b></div>' +
        '<div class="btns">' + R.map(function (rd) { return '<button class="btn ghost sm" data-allr="' + rd + '">All ✓ – ' + rd + '</button>'; }).join('') + '</div>' +
        '<div class="card"><div class="hd"><b>Cleaning rounds</b></div><div class="list">' + areas.map(function (ar) {
          return '<div class="it" style="cursor:default"><div class="m"><b>' + h(ar) + '</b></div><div class="seg">' + R.map(function (rd) { return cell(ar, rd); }).join('') + '</div></div>';
        }).join('') + '</div></div>' +
        '<div class="card"><div class="hd"><b>Bio-medical waste handed over</b></div><div class="bd"><div class="fgrid">' +
        SC.BMW.map(function (b) { return '<div class="f"><label>' + h(b[1]) + '</label><input type="number" inputmode="decimal" step="0.1" min="0" data-bmw="' + b[0] + '" value="' + h(st.bmw[b[0]]) + '"></div>'; }).join('') +
        '<div class="f"><label>Handover time</label><input type="time" data-top="time" value="' + h(st.time) + '"></div>' +
        '<div class="f"><label>Agency / vehicle</label><input type="text" data-top="agency" value="' + h(st.agency) + '"></div></div></div></div>' +
        '<div class="card"><div class="hd"><b>Other tasks today</b></div><div class="bd checks">' +
        SC.HK_TASKS.map(function (t) { return '<label><input type="checkbox" data-task="' + t[0] + '"' + (st.tasks[t[0]] ? ' checked' : '') + '> ' + h(t[1]) + '</label>'; }).join('') + '</div></div>' +
        '<div class="card"><div class="bd fgrid"><div class="f"><label>Housekeeping staff on duty</label><input type="text" data-top="staff" value="' + h(st.staff) + '"></div>' +
        '<div class="f"><label>Supervised by (nurse / RMO)</label><input type="text" data-top="sup" value="' + h(st.sup) + '"></div></div></div>' +
        '<div class="btns"><a class="btn ghost sm" href="#areas">Edit area list</a><a class="btn pri" href="#home">✓ Done</a></div></div>', 'home');
      bind();
    }
    function save() { if (!G.AUTH.canEdit(date)) { UI.toast('This date is locked – only the CMO can change it', true); return; } UI.debounce(key, function () { DB.put(key, st); UI.flashSaved(); }, 250); }
    function bind() {
    var app = UI.$('#app');
    app.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ar],[data-allr]'); if (!b) return;
      if (b.dataset.allr) { areas.forEach(function (ar) { st.v[ar + '|' + b.dataset.allr] = { s: 'Y' }; }); }
      else { var k = b.dataset.ar + '|' + b.dataset.rd, cur = st.v[k] ? st.v[k].s : ''; var nx = cur === '' ? 'Y' : cur === 'Y' ? 'N' : ''; if (nx) st.v[k] = { s: nx }; else delete st.v[k]; }
      save(); var y = window.scrollY; render(); window.scrollTo(0, y);
    });
    app.addEventListener('input', function (e) {
      var d = e.target.dataset; if (!d) return;
      if (d.bmw) st.bmw[d.bmw] = e.target.value; else if (d.top) st[d.top] = e.target.value; else return;
      save();
    });
    app.addEventListener('change', function (e) { var d = e.target.dataset; if (d && d.task) { if (e.target.checked) st.tasks[d.task] = true; else delete st.tasks[d.task]; save(); } });
    }
    render();
  });

  // ---------------- EMO duty checklist
  UI.route('chk', function (shiftArg) {
    var date = UI.state.date, shifts = ['Morning', 'Evening', 'Night', '24 hour'];
    var shift = shiftArg || (DB.keys('chk/' + date + '/')[0] || '').split('/')[2] || '24 hour';
    var key = 'chk/' + date + '/' + shift, env = DB.get(key);
    var st = { meta: {}, items: {} }; if (env) { st.meta = Object.assign({}, env.meta); st.items = JSON.parse(JSON.stringify(env.items || {})); }
    var counts = {}; Object.keys(SC.CHECK_LINKS).forEach(function (i) { counts[i] = REP.registerRecords(SC.CHECK_LINKS[i], date, date).length; });
    var done = SC.CHECKLIST.filter(function (x, i) { return st.items[i + 1] && st.items[i + 1].s === 'C'; }).length;
    UI.render(UI.topbar('EMO duty checklist', 'GH/UTM/TAEI/CHK/2026 Ver 1.0 · ' + U.dmy(date), 'home') + '<div class="wrap">' + UI.datebar() +
      '<div class="btns">' + shifts.map(function (s) { return '<a class="btn sm ' + (s === shift ? 'pri' : 'ghost') + '" href="#chk/' + encodeURIComponent(s) + '">' + s + '</a>'; }).join('') + '</div>' +
      '<div class="card"><div class="bd fgrid">' +
      [['doctor', 'Doctor on duty'], ['emo', 'EMO on duty'], ['nurse', 'Staff nurse'], ['htime', 'Handover time', 'time'], ['signver', 'Verified by (RMO / CMO)']].map(function (f) {
        return '<div class="f"><label>' + f[1] + '</label><input type="' + (f[2] || 'text') + '" data-meta="' + f[0] + '" value="' + h(st.meta[f[0]]) + '"></div>';
      }).join('') + '</div></div>' +
      '<p class="small"><b>' + done + '/' + SC.CHECKLIST.length + '</b> completed</p>' +
      '<div class="card"><div class="list">' + SC.CHECKLIST.map(function (t, i) {
        var n = i + 1, it = st.items[n] || {}, link = SC.CHECK_LINKS[n];
        return '<div class="it" style="display:block;cursor:default"><div class="row2"><div class="grow"><b>' + n + '. ' + h(t) + '</b>' +
          (link ? '<br><a class="small" href="#reg/' + link + '">' + counts[n] + ' register entr' + (counts[n] === 1 ? 'y' : 'ies') + ' today ›</a>' : '') + '</div>' +
          '<div class="seg" data-item="' + n + '"><button class="' + (it.s === 'C' ? 'on C' : '') + '" data-v="C">Completed</button><button class="' + (it.s === 'P' ? 'on Pe' : '') + '" data-v="P">Pending</button></div></div>' +
          '<input type="text" placeholder="Remarks" data-rmk="' + n + '" value="' + h(it.r) + '" style="margin-top:6px"></div>';
      }).join('') + '</div></div>' +
      '<div class="btns"><button class="btn ghost" onclick="window.print()">Print / PDF</button><a class="btn pri" href="#home">✓ Done</a></div></div>', 'home');
    function save() { if (!G.AUTH.canEdit(date)) { UI.toast('This date is locked – only the CMO can change it', true); return; } UI.debounce(key, function () { DB.put(key, st); UI.flashSaved(); }, 250); }
    var app = UI.$('#app');
    app.addEventListener('input', function (e) {
      var d = e.target.dataset; if (!d) return;
      if (d.meta) st.meta[d.meta] = e.target.value; else if (d.rmk) { st.items[d.rmk] = st.items[d.rmk] || {}; st.items[d.rmk].r = e.target.value; } else return;
      save();
    });
    app.addEventListener('click', function (e) {
      var b = e.target.closest('.seg[data-item] button'); if (!b) return;
      var n = b.parentNode.dataset.item; st.items[n] = st.items[n] || {};
      st.items[n].s = st.items[n].s === b.dataset.v ? '' : b.dataset.v;
      UI.$$('button', b.parentNode).forEach(function (x) { x.className = st.items[n].s === x.dataset.v ? 'on ' + (x.dataset.v === 'C' ? 'C' : 'Pe') : ''; });
      save();
    });
  });

  G.VIEWS_ENTRY = { ensureSeeds: ensureSeeds, moduleStatus: moduleStatus };
})(window);
