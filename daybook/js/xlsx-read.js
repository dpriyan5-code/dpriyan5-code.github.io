/* Minimal .xlsx reader (no dependencies). Unzips with the browser's DecompressionStream and
 * returns every sheet as a grid of values: { sheets: [{ name, rows: [[v...]], merges: [] }] }.
 * Dates come back as Excel serial numbers; use XLSXR.dateOf(v) to turn them into 'YYYY-MM-DD'.
 */
(function (G) {
  'use strict';

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot open Excel files. Please update Chrome / Edge / Safari.'));
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // Read the central directory and return { name: Promise<Uint8Array> } lazily.
  function unzip(buf) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) { if (u32(b, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('Not an .xlsx file (zip directory not found). Old .xls files must be saved as .xlsx first.');
    var n = u16(b, eocd + 10), off = u32(b, eocd + 16), files = {};
    for (var k = 0; k < n; k++) {
      if (u32(b, off) !== 0x02014b50) break;
      var method = u16(b, off + 10), csize = u32(b, off + 20), nlen = u16(b, off + 28), xlen = u16(b, off + 30), clen = u16(b, off + 32), lho = u32(b, off + 42);
      var name = new TextDecoder().decode(b.subarray(off + 46, off + 46 + nlen));
      (function (method, csize, lho) {
        files[name] = function () {
          var start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28), data = b.subarray(start, start + csize);
          return method === 0 ? Promise.resolve(data) : inflate(data);
        };
      })(method, csize, lho);
      off += 46 + nlen + xlen + clen;
    }
    return files;
  }

  function text(files, name) { return files[name] ? files[name]().then(function (d) { return new TextDecoder().decode(d); }) : Promise.resolve(null); }
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function kids(el, tag) { var out = []; if (!el) return out; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === tag) out.push(c); return out; }
  function all(el, tag) { return Array.prototype.slice.call(el.getElementsByTagNameNS('*', tag)); }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function rowIndex(ref) { return +/(\d+)$/.exec(ref)[1] - 1; }

  function read(buf) {
    var files;
    try { files = unzip(buf); } catch (e) { return Promise.reject(e); }
    return Promise.all([text(files, 'xl/workbook.xml'), text(files, 'xl/_rels/workbook.xml.rels'), text(files, 'xl/sharedStrings.xml')]).then(function (r) {
      if (!r[0]) throw new Error('Not an Excel workbook.');
      var wb = xml(r[0]), rels = {}, shared = [];
      if (r[1]) all(xml(r[1]), 'Relationship').forEach(function (x) { rels[x.getAttribute('Id')] = x.getAttribute('Target'); });
      if (r[2]) all(xml(r[2]), 'si').forEach(function (si) { shared.push(all(si, 't').map(function (t) { return t.textContent; }).join('')); });
      var sheets = all(wb, 'sheet').map(function (sh) {
        var rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var target = (rels[rid] || '').replace(/^\/?xl\//, '').replace(/^\//, '');
        return { name: sh.getAttribute('name'), path: 'xl/' + target };
      });
      return Promise.all(sheets.map(function (sh) {
        return text(files, sh.path).then(function (s) {
          var rows = [], merges = [];
          if (!s) return { name: sh.name, rows: rows, merges: merges };
          var doc = xml(s);
          all(doc, 'c').forEach(function (c) {
            var ref = c.getAttribute('r'); if (!ref) return;
            var t = c.getAttribute('t'), v = kids(c, 'v')[0], val = null;
            if (t === 's') val = v ? shared[+v.textContent] : null;
            else if (t === 'inlineStr') val = all(c, 't').map(function (x) { return x.textContent; }).join('');
            else if (t === 'str' || t === 'e') val = v ? v.textContent : null;
            else if (t === 'b') val = v ? v.textContent === '1' : null;
            else val = v ? +v.textContent : null;
            var ri = rowIndex(ref), ci = colIndex(ref);
            (rows[ri] = rows[ri] || [])[ci] = val;
          });
          all(doc, 'mergeCell').forEach(function (m) { merges.push(m.getAttribute('ref')); });
          for (var i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
          return { name: sh.name, rows: rows, merges: merges };
        });
      })).then(function (list) { return { sheets: list }; });
    });
  }

  // Excel serial date (1900 system) or 'dd/mm/yyyy' / 'dd.mm.yy' text -> 'YYYY-MM-DD'
  function dateOf(v) {
    if (v == null || v === '') return null;
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 864e5));
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(String(v).trim());
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }

  G.XLSXR = { read: read, dateOf: dateOf };
})(typeof window !== 'undefined' ? window : globalThis);
