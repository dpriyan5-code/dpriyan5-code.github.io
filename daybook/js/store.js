/* Offline key–value store: IndexedDB with an in-memory copy (falls back to localStorage, then memory).
 * Every value is an envelope { ...data, by, at } where `at` is an ISO time; deletes are kept as
 * tombstones { del: true, at } so that merging another phone's export also carries deletions.
 * Merge rule: newer `at` wins, per key. Keys:
 *   day/<date>/<module>  att/<date>  cln/<date>  chk/<date>/<shift>  rec/<type>/<id>  form/<type>/<id>  cfg/<name>
 */
(function (G) {
  'use strict';
  var DBNAME = 'ghutm-daybook', OS = 'kv';
  var mem = Object.create(null);
  var idb = null;
  var mode = 'memory';
  var listeners = [];

  function openIdb() {
    return new Promise(function (res) {
      if (!G.indexedDB) return res(null);
      var req;
      try { req = G.indexedDB.open(DBNAME, 1); } catch (e) { return res(null); }
      req.onupgradeneeded = function () { req.result.createObjectStore(OS); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { res(null); };
    });
  }
  function lsOk() { try { var k = '__t'; G.localStorage.setItem(k, '1'); G.localStorage.removeItem(k); return true; } catch (e) { return false; } }

  function init() {
    return openIdb().then(function (db) {
      if (db) {
        idb = db; mode = 'indexeddb';
        return new Promise(function (res) {
          var tx = db.transaction(OS, 'readonly'), os = tx.objectStore(OS);
          var req = os.openCursor();
          req.onsuccess = function () { var c = req.result; if (c) { mem[c.key] = c.value; c.continue(); } else res(); };
          req.onerror = function () { res(); };
        });
      }
      if (G.localStorage && lsOk()) {
        mode = 'localstorage';
        for (var i = 0; i < G.localStorage.length; i++) {
          var k = G.localStorage.key(i);
          if (k.indexOf('dbk:') === 0) { try { mem[k.slice(4)] = JSON.parse(G.localStorage.getItem(k)); } catch (e) { /* skip */ } }
        }
      }
    }).then(function () {
      if (G.navigator && navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
      return mode;
    });
  }

  function persist(key, val) {
    if (mode === 'indexeddb') {
      try { var tx = idb.transaction(OS, 'readwrite'); tx.objectStore(OS).put(val, key); } catch (e) { console.error(e); }
    } else if (mode === 'localstorage') {
      try { G.localStorage.setItem('dbk:' + key, JSON.stringify(val)); } catch (e) { console.error(e); }
    }
  }

  function nowIso() { return new Date().toISOString(); }
  var currentUser = '';

  function get(key) { var v = mem[key]; return v && !v.del ? v : null; }
  function put(key, data, opt) {
    var env = Object.assign({}, data, { by: (opt && opt.by) || currentUser, at: (opt && opt.at) || nowIso() });
    delete env.del;
    mem[key] = env; persist(key, env); emit(key);
    return env;
  }
  function del(key) { var t = { del: true, at: nowIso(), by: currentUser }; mem[key] = t; persist(key, t); emit(key); }
  function keys(prefix) { return Object.keys(mem).filter(function (k) { return k.indexOf(prefix) === 0 && !mem[k].del; }).sort(); }
  function list(prefix) { return keys(prefix).map(function (k) { return { key: k, val: mem[k] }; }); }
  function emit(key) { listeners.forEach(function (fn) { try { fn(key); } catch (e) { console.error(e); } }); }

  // Export everything (or keys changed since `since`, or matching prefixes) for backup / sharing.
  function exportData(opt) {
    opt = opt || {};
    var out = {};
    Object.keys(mem).forEach(function (k) {
      var v = mem[k];
      if (opt.since && v.at < opt.since) return;
      if (opt.prefixes && !opt.prefixes.some(function (p) { return k.indexOf(p) === 0; })) return;
      if (opt.excludeCfg && k.indexOf('cfg/') === 0) return;
      out[k] = v;
    });
    return { app: 'ghutm-daybook', v: 1, exportedAt: nowIso(), by: currentUser, data: out };
  }
  // Settings, lists and the CMO sign-in (cfg/*) are only taken from a file when the CMO is signed in,
  // except the very first CMO sign-in record on a phone that has none yet.
  function importData(pkg, opt) {
    if (!pkg || pkg.app !== 'ghutm-daybook' || !pkg.data) throw new Error('This file is not a GH-UTM Daybook export.');
    opt = opt || {};
    var added = 0, updated = 0, skipped = 0, protectedSkipped = 0;
    Object.keys(pkg.data).forEach(function (k) {
      var inc = pkg.data[k], cur = mem[k];
      if (!inc || typeof inc.at !== 'string') { skipped++; return; }
      if (k.indexOf('cfg/') === 0 && !opt.admin && !(k === 'cfg/admin' && (!cur || cur.del))) { protectedSkipped++; return; }
      if (k.indexOf('audit/') === 0 && !opt.admin) { protectedSkipped++; return; }
      if (!cur) { mem[k] = inc; persist(k, inc); added++; }
      else if (inc.at > cur.at) { mem[k] = inc; persist(k, inc); updated++; }
      else skipped++;
    });
    emit('*');
    return { added: added, updated: updated, skipped: skipped, protectedSkipped: protectedSkipped };
  }
  function wipe() {
    mem = Object.create(null);
    if (mode === 'indexeddb') { try { idb.transaction(OS, 'readwrite').objectStore(OS).clear(); } catch (e) { /* ignore */ } }
    if (mode === 'localstorage') { Object.keys(G.localStorage).forEach(function (k) { if (k.indexOf('dbk:') === 0) G.localStorage.removeItem(k); }); }
    emit('*');
  }
  function sizeBytes() { try { return JSON.stringify(mem).length; } catch (e) { return 0; } }

  G.DB = {
    init: init, get: get, put: put, del: del, keys: keys, list: list, exportData: exportData, importData: importData, wipe: wipe,
    sizeBytes: sizeBytes, mode: function () { return mode; }, setUser: function (u) { currentUser = u || ''; }, getUser: function () { return currentUser; },
    on: function (fn) { listeners.push(fn); }, _mem: function () { return mem; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
