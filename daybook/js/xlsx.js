/* Minimal .xlsx writer (no dependencies). Produces a real Office Open XML workbook using an
 * uncompressed ZIP container, so it opens in Excel, Google Sheets, WPS and LibreOffice.
 * Sheet spec: { name, rows: [[cell...]...], cols: [widths], merges: ['A1:C1'], freeze: {r, c} }
 * Cell: number | string | null | { v, s }  where s is a style id from STYLES below.
 */
(function (G) {
  'use strict';
  // style ids
  var S = { normal: 0, bold: 1, head: 2, title: 3, cell: 4, num: 5, total: 6, pct: 7, sub: 8, warn: 9 };

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }

  function zip(files) { // files: [{name, data:string}]
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  function sheetXml(sh) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    if (sh.freeze) {
      var ref = colName(sh.freeze.c || 0) + ((sh.freeze.r || 0) + 1);
      out.push('<sheetViews><sheetView workbookViewId="0"><pane ' + (sh.freeze.c ? 'xSplit="' + sh.freeze.c + '" ' : '') + (sh.freeze.r ? 'ySplit="' + sh.freeze.r + '" ' : '') +
        'topLeftCell="' + ref + '" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>');
    }
    if (sh.cols && sh.cols.length) {
      out.push('<cols>');
      sh.cols.forEach(function (w, i) { out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'); });
      out.push('</cols>');
    }
    out.push('<sheetData>');
    sh.rows.forEach(function (row, ri) {
      out.push('<row r="' + (ri + 1) + '">');
      (row || []).forEach(function (cell, ci) {
        if (cell == null || cell === '') return;
        var v = cell, s = 0;
        if (typeof cell === 'object') { v = cell.v; s = cell.s || 0; if (v == null || v === '') { out.push('<c r="' + colName(ci) + (ri + 1) + '" s="' + s + '"/>'); return; } }
        var r = colName(ci) + (ri + 1);
        if (typeof v === 'number' && isFinite(v)) out.push('<c r="' + r + '" s="' + s + '"><v>' + v + '</v></c>');
        else out.push('<c r="' + r + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
      });
      out.push('</row>');
    });
    out.push('</sheetData>');
    if (sh.merges && sh.merges.length) {
      out.push('<mergeCells count="' + sh.merges.length + '">');
      sh.merges.forEach(function (m) { out.push('<mergeCell ref="' + m + '"/>'); });
      out.push('</mergeCells>');
    }
    out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
    out.push('<pageSetup orientation="' + (sh.landscape ? 'landscape' : 'portrait') + '" paperSize="9" fitToWidth="1" fitToHeight="0"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>' +
    '<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font>' +
    '<font><b/><sz val="13"/><color rgb="FF0B2545"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>' +
    '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0B2545"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F0E2"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE6EEF7"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE2E1"/></patternFill></fill></fills>' +
    '<borders count="2"><border/><border><left style="thin"><color rgb="FFB7C0CC"/></left><right style="thin"><color rgb="FFB7C0CC"/></right>' +
    '<top style="thin"><color rgb="FFB7C0CC"/></top><bottom style="thin"><color rgb="FFB7C0CC"/></bottom></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' + // 0 normal
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>' + // 1 bold
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 2 head
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>' + // 3 title
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 4 cell
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 5 num
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 6 total
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 7 pct/2dp
    '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 8 sub
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 9 warn
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function build(sheets) {
    var used = {};
    sheets.forEach(function (s) {
      var n = String(s.name || 'Sheet').replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
      var base = n, i = 2; while (used[n.toLowerCase()]) { n = base.slice(0, 28) + ' ' + i++; }
      used[n.toLowerCase()] = 1; s._n = n;
    });
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + esc(s._n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: STYLES },
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) }); });
    return zip(files);
  }

  G.XLSX = { build: build, S: S, colName: colName, _zip: zip };
})(typeof window !== 'undefined' ? window : globalThis);
