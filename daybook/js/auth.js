/* CMO / Admin access with two-factor sign-in: a password plus a 6-digit code from an authenticator
 * app (Google Authenticator, Microsoft Authenticator …, standard TOTP). Works offline.
 * The authenticator secret is stored encrypted with a key derived from the password (PBKDF2 → AES-GCM),
 * so the password unlocks the secret and the 6-digit code proves possession of the CMO's phone.
 * One-time recovery codes allow sign-in if that phone is lost.
 *
 * CMO-only: funds, attendance, monthly abstract reports, NCD form, settings, staff list, corrections log,
 * full backup, and editing entries older than the staff entry window (default: today and yesterday).
 * Note: this protects the app's screens; it does not encrypt the phone's stored data.
 */
(function (G) {
  'use strict';
  var UI = G.UI, DB = G.DB, REP = G.REP, U = REP.util, h = UI.h;
  var KEY = 'cfg/admin', SESSION = 'ghd_admin', FAIL = 'ghd_admin_fail', IDLE_MS = 20 * 60e3, ITER = 150000;
  var enc = new TextEncoder(), dec = new TextDecoder();

  // ---------- crypto helpers
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32enc(bytes) { var bits = 0, val = 0, out = ''; for (var i = 0; i < bytes.length; i++) { val = (val << 8) | bytes[i]; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
  function b32dec(s) { s = s.replace(/[\s=-]/g, '').toUpperCase(); var bits = 0, val = 0, out = []; for (var i = 0; i < s.length; i++) { var x = B32.indexOf(s[i]); if (x < 0) continue; val = (val << 5) | x; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
  function b64(bytes) { return btoa(String.fromCharCode.apply(null, Array.from(bytes))); }
  function unb64(s) { return new Uint8Array(atob(s).split('').map(function (c) { return c.charCodeAt(0); })); }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function subtle() { if (!G.crypto || !crypto.subtle) throw new Error('Secure sign-in needs the app to be opened over https (or installed). It cannot run in this window.'); return crypto.subtle; }
  function deriveKey(pass, salt, iter) {
    return subtle().importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return subtle().deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function hotp(secret, counter) {
    var msg = new Uint8Array(8), c = counter;
    for (var i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
    return subtle().importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']).then(function (k) { return subtle().sign('HMAC', k, msg); }).then(function (sig) {
      var b = new Uint8Array(sig), o = b[b.length - 1] & 15;
      var code = ((b[o] & 127) << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) % 1e6;
      return ('000000' + code).slice(-6);
    });
  }
  function totpOk(secret, code) {
    var t = Math.floor(Date.now() / 30000);
    return Promise.all([-1, 0, 1].map(function (d) { return hotp(secret, t + d); })).then(function (list) { return list.indexOf(String(code).replace(/\D/g, '')) >= 0; });
  }
  function sha(s) { return subtle().digest('SHA-256', enc.encode(s)).then(function (b) { return b64(new Uint8Array(b)); }); }

  // ---------- session
  function cfg() { return DB.get(KEY); }
  function session() { try { var s = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); return s && s.until > Date.now() ? s : null; } catch (e) { return null; } }
  function isAdmin() { return !!session(); }
  function touch() { var s = session(); if (s) { s.until = Date.now() + IDLE_MS; try { sessionStorage.setItem(SESSION, JSON.stringify(s)); } catch (e) { /* ignore */ } } }
  // while signed in, entries are stamped with the CMO's name
  function start(name) { try { sessionStorage.setItem(SESSION, JSON.stringify({ name: name, until: Date.now() + IDLE_MS })); } catch (e) { /* ignore */ } DB.setUser(name + ' (CMO)'); }
  function signOut() { try { sessionStorage.removeItem(SESSION); } catch (e) { /* ignore */ } DB.setUser(((UI.user() || {}).name) || ''); }
  ['click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, touch, true); });
  function failState() { try { return JSON.parse(localStorage.getItem(FAIL) || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; } }
  function setFail(f) { try { localStorage.setItem(FAIL, JSON.stringify(f)); } catch (e) { /* ignore */ } }

  // Staff may edit today and the previous (editDays − 1) days; the CMO can edit any date.
  function canEdit(date) {
    if (isAdmin()) return true;
    var today = UI.todayIso(), days = Math.max(1, +REP.settings().editDays || 2);
    return date <= today && date > U.addDays(today, -days);
  }

  // ---------- route guard
  function allow(parts) {
    var r = parts[0], a = parts[1] || '';
    if (isAdmin()) return true;
    if (r === 'day' && a === 'admin') return false;
    if (['att', 'reports', 'ncd', 'audit', 'settings', 'staff'].indexOf(r) >= 0) return false;
    if (r === 'report' && !(a.indexOf('reg:') === 0 || a === 'ved')) return false;
    return true;
  }
  function denied(parts) {
    UI.render(UI.topbar('CMO / Admin only', 'Sign in to continue', 'home') + '<div class="wrap"><div class="card"><div class="bd">' +
      '<p>This section (funds, attendance, monthly reports, settings, corrections) is open only to the CMO / administrator.</p>' +
      '<div class="btns"><a class="btn pri" href="#admin/' + encodeURIComponent(parts.join('/')) + '">Sign in as CMO / Admin</a><a class="btn ghost" href="#home">Back to home</a></div></div></div></div>', 'home');
  }

  // ---------- corrections log
  // Record (or update) one correction entry: id is fixed per editing session so typing does not create many entries.
  function audit(key, before, after, id) {
    var changes = [];
    Object.keys(Object.assign({}, before, after)).forEach(function (k) {
      var a = before[k], b = after[k];
      if ((a == null ? '' : String(a)) !== (b == null ? '' : String(b))) changes.push({ k: k, old: a == null ? '' : a, new: b == null ? '' : b });
    });
    var ak = 'audit/' + id;
    if (!changes.length) { if (DB.get(ak)) DB.del(ak); return; }
    DB.put(ak, { key: key, changes: changes });
  }

  // ---------- screens
  UI.route('admin', function (next) {
    var c = cfg(), s = session();
    next = next ? decodeURIComponent(next) : '';
    if (s) return panel();
    if (!c) return setup();
    var f = failState(), locked = f.until > Date.now();
    UI.render(UI.topbar('CMO / Admin sign-in', 'Password + authenticator code', 'home') + '<div class="wrap"><div class="card" style="max-width:520px"><div class="bd">' +
      (locked ? '<div class="note bad">Too many wrong attempts. Try again after ' + new Date(f.until).toLocaleTimeString() + '.</div>' : '') +
      '<div class="fgrid"><div class="f wide"><label for="ap">Admin password</label><input type="password" id="ap" autocomplete="current-password"></div>' +
      '<div class="f wide"><label for="ac">6-digit code from authenticator app (or a recovery code)</label><input type="text" id="ac" inputmode="numeric" autocomplete="one-time-code" maxlength="11"></div></div>' +
      '<div class="btns"><button class="btn pri" id="go"' + (locked ? ' disabled' : '') + '>Sign in</button></div>' +
      '<p class="small muted">Signed in as ' + h(c.name || 'CMO') + ' for 20 minutes of activity. Recovery codes work once each.</p></div></div></div>', 'home');
    UI.$('#go').onclick = function () {
      var pass = UI.$('#ap').value, code = UI.$('#ac').value.trim();
      if (!pass || !code) { UI.toast('Enter the password and the code', true); return; }
      UI.$('#go').disabled = true;
      deriveKey(pass, unb64(c.salt), c.iter).then(function (k) { return subtle().decrypt({ name: 'AES-GCM', iv: unb64(c.iv) }, k, unb64(c.ct)); })
        .then(function (plain) {
          var secret = b32dec(JSON.parse(dec.decode(plain)).totp);
          if (/^\d{6}$/.test(code.replace(/\s/g, ''))) return totpOk(secret, code);
          return sha(c.salt + ':' + code.replace(/[\s-]/g, '').toUpperCase()).then(function (hx) {
            var i = (c.rec || []).indexOf(hx); if (i < 0) return false;
            var nc = Object.assign({}, c, { rec: c.rec.filter(function (x, j) { return j !== i; }) }); DB.put(KEY, nc); UI.toast('Recovery code used – ' + nc.rec.length + ' left', true); return true;
          });
        }, function () { return false; })
        .then(function (ok) {
          if (!ok) {
            var f2 = failState(); f2.n++; if (f2.n >= 5) { f2.until = Date.now() + 5 * 60e3; f2.n = 0; } setFail(f2);
            UI.toast('Wrong password or code', true); UI.$('#go').disabled = false; return;
          }
          setFail({ n: 0, until: 0 }); start(c.name || 'CMO'); UI.toast('Signed in as CMO / Admin');
          UI.go(next || 'admin');
        }).catch(function (e) { UI.toast(e.message, true); UI.$('#go').disabled = false; });
    };
    UI.$('#ac').onkeydown = function (e) { if (e.key === 'Enter') UI.$('#go').click(); };
  });

  function setup() {
    var secret;
    try { secret = rand(20); } catch (e) { secret = null; }
    var b32 = secret ? b32enc(secret) : '', cfgS = REP.settings();
    var otp = 'otpauth://totp/' + encodeURIComponent('GH Daybook:' + cfgS.short) + '?secret=' + b32 + '&issuer=' + encodeURIComponent('GH Daybook');
    UI.render(UI.topbar('Set up CMO / Admin sign-in', 'One-time setup', 'home') + '<div class="wrap"><div class="card" style="max-width:640px"><div class="bd">' +
      '<div class="note info small">Do this on the CMO’s phone. If the CMO has already set this up on another phone, ask for the settings file (Share → Send entries → include settings) and receive it here instead.</div>' +
      '<div class="fgrid"><div class="f wide"><label for="sn">CMO / administrator name</label><input type="text" id="sn" value="' + h((UI.user() || {}).name || '') + '"></div>' +
      '<div class="f"><label for="sp">Admin password (8+ characters)</label><input type="password" id="sp" autocomplete="new-password"></div>' +
      '<div class="f"><label for="sp2">Type it again</label><input type="password" id="sp2" autocomplete="new-password"></div></div>' +
      '<h2 class="sec">Authenticator app</h2><p class="small">Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on the CMO’s phone → <i>Add account → Enter a setup key</i>. Account name: <b>GH Daybook</b>, key:</p>' +
      '<p style="font-family:ui-monospace,Consolas,monospace;font-size:18px;letter-spacing:2px;background:var(--brasst);padding:10px 12px;border-radius:10px;word-break:break-all">' + b32.replace(/(.{4})/g, '$1 ').trim() + '</p>' +
      '<p class="small">On the same phone you can also <a href="' + h(otp) + '">open the authenticator directly</a>. Choose “time based”.</p>' +
      '<div class="fgrid"><div class="f"><label for="sc">Enter the 6-digit code it shows now</label><input type="text" id="sc" inputmode="numeric" maxlength="6"></div></div>' +
      '<div class="btns"><button class="btn pri" id="sv">Turn on CMO / Admin sign-in</button></div><div id="rc"></div></div></div></div>', 'home');
    UI.$('#sv').onclick = function () {
      var name = UI.$('#sn').value.trim(), p1 = UI.$('#sp').value, p2 = UI.$('#sp2').value, code = UI.$('#sc').value.trim();
      if (!secret) { UI.toast('This browser cannot create secure keys', true); return; }
      if (!name) { UI.toast('Enter the CMO name', true); return; }
      if (p1.length < 8) { UI.toast('Password must be at least 8 characters', true); return; }
      if (p1 !== p2) { UI.toast('Passwords do not match', true); return; }
      totpOk(secret, code).then(function (ok) {
        if (!ok) { UI.toast('That code does not match. Check the phone’s time and the key, then try the newest code.', true); return; }
        var salt = rand(16), iv = rand(12), codes = [];
        for (var i = 0; i < 8; i++) codes.push(b32enc(rand(5)).slice(0, 8));
        return deriveKey(p1, salt, ITER).then(function (k) { return subtle().encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(JSON.stringify({ totp: b32 }))); }).then(function (ct) {
          var sb = b64(salt);
          return Promise.all(codes.map(function (x) { return sha(sb + ':' + x); })).then(function (hashes) {
            DB.put(KEY, { name: name, salt: sb, iv: b64(iv), ct: b64(new Uint8Array(ct)), iter: ITER, rec: hashes });
            start(name);
            UI.$('#sv').disabled = true;
            UI.$('#rc').innerHTML = '<div class="note ok"><b>CMO / Admin sign-in is on.</b> Write these recovery codes down and keep them safe – each works once if the authenticator phone is lost:<p style="font-family:ui-monospace,Consolas,monospace;font-size:16px;line-height:1.8">' +
              codes.map(function (x) { return x.slice(0, 4) + '-' + x.slice(4); }).join('<br>') + '</p><button class="btn pri" data-go="admin">Continue</button></div>';
          });
        });
      }).catch(function (e) { UI.toast(e.message, true); });
    };
  }

  function panel() {
    var c = cfg(), s = session();
    var log = DB.list('audit/').slice(-5).reverse();
    UI.render(UI.topbar('CMO / Admin', 'Signed in as ' + s.name, 'home') + '<div class="wrap">' +
      '<div class="note ok small">Signed in. You can open every report, correct any day’s entries (changes are logged), and manage funds, attendance and settings. Sign-in ends after 20 minutes without activity.</div>' +
      '<div class="tiles">' + [['reports', 'report', 'Monthly reports', 'All abstract reports'], ['day/admin', 'fund', 'Funds', 'Operational cost, TAEI cost, Alteplase'], ['att', 'att', 'Attendance', 'Daily attendance'],
        ['audit', 'regs', 'Corrections log', 'Who changed what'], ['settings', 'settings', 'Settings', 'Hospital, staff, entry window'], ['ncd', 'heart', 'NCD monthly form', '7-sheet report']].map(function (t) {
        return '<a class="tile" href="#' + t[0] + '"><span class="ib">' + UI.icon(t[1]) + '</span><b>' + t[2] + '</b><small>' + t[3] + '</small></a>';
      }).join('') + '</div>' +
      '<h2 class="sec">Recent corrections</h2><div class="card"><div class="list">' + (log.length ? log.map(auditItem).join('') : '<div class="empty">No corrections yet.</div>') + '</div></div>' +
      '<div class="btns"><button class="btn ghost" id="out">Sign out</button></div>' +
      '<p class="small muted">' + (c && c.rec ? c.rec.length + ' recovery codes left.' : '') + ' To change the password or authenticator, use Settings → “Reset CMO sign-in” while signed in.</p></div>', 'home');
    UI.$('#out').onclick = function () { signOut(); UI.go('home'); };
  }
  function auditItem(x) {
    var v = x.val, parts = v.key.split('/'), what = parts[0] === 'day' ? 'Day ' + U.dmy(parts[1]) + ' · ' + parts[2] : v.key;
    return '<div class="it" style="display:block;cursor:default"><b>' + h(what) + '</b> <span class="small muted">by ' + h(v.by) + ' · ' + new Date(v.at).toLocaleString() + '</span>' +
      '<div class="small">' + v.changes.slice(0, 12).map(function (c) { var r = G.DB_SCHEMA.ROW[c.k]; return h(r ? r.s : c.k) + ': <s>' + h(c.old === '' ? '—' : c.old) + '</s> → <b>' + h(c.new === '' ? '—' : c.new) + '</b>'; }).join(' · ') + (v.changes.length > 12 ? ' …' : '') + '</div></div>';
  }
  UI.route('audit', function () {
    var log = DB.list('audit/').reverse().slice(0, 300);
    UI.render(UI.topbar('Corrections log', log.length + ' changes', 'admin') + '<div class="wrap"><div class="card"><div class="list">' +
      (log.length ? log.map(auditItem).join('') : '<div class="empty">No corrections yet.</div>') + '</div></div></div>', 'home');
  });

  function auditId() { return new Date().toISOString() + '-' + UI.uid().slice(-4); }
  // Does a CMO edit of this record need logging? (entered by someone else, or outside the staff window)
  function needsAudit(env, date) {
    if (!isAdmin() || !env) return false;
    var today = UI.todayIso(), days = Math.max(1, +REP.settings().editDays || 2), me = DB.getUser();
    return env.by !== me || !(date <= today && date > U.addDays(today, -days));
  }
  if (session()) DB.setUser(session().name + ' (CMO)');
  // session expiry: drop back to the phone user's name
  setInterval(function () { if (!session() && /\(CMO\)$/.test(DB.getUser())) { DB.setUser(((UI.user() || {}).name) || ''); } }, 30000);
  G.AUTH = { auditId: auditId, needsAudit: needsAudit, isAdmin: isAdmin, canEdit: canEdit, allow: allow, denied: denied, audit: audit, signOut: signOut, hasAdmin: function () { return !!cfg(); }, _totp: { hotp: hotp, b32enc: b32enc, b32dec: b32dec } };
})(window);
