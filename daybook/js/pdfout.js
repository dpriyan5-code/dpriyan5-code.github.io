/* Turn a printed form (.paper) into a real A4 PDF file, fully offline.
 * The form is laid out at A4 width off screen, drawn to a picture with html2canvas (vendor/, loaded on first
 * use), cut into pages between rows, and each page is stored as a JPEG in a small hand-written PDF.
 * Used where the phone's own print screen cannot save a PDF (iPhone home-screen app).
 */
(function (G) {
  'use strict';
  var A4W = 595.28, A4H = 841.89;       // points
  var CSSW = 794;                       // A4 width in CSS px at 96 dpi
  var MARGIN = 38;                      // ~10 mm, in CSS px
  var loading = null;

  function loadH2C() {
    if (G.html2canvas) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'vendor/html2canvas/html2canvas.min.js'; s.onload = res;
      s.onerror = function () { loading = null; rej(new Error('Could not load the PDF maker. Open the app once with internet so it is saved for offline use.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // Offsets (from the top of `root`) where a page may end: the bottom of each row or block.
  function breakPoints(root) {
    var top = root.getBoundingClientRect().top, pts = [];
    root.querySelectorAll('tr, .ph, .lbl, .box, .sig, p, h3, h4, table, .fgrid > *, .paper > div').forEach(function (el) {
      var r = el.getBoundingClientRect(); if (r.height) pts.push(r.bottom - top);
    });
    return pts.sort(function (a, b) { return a - b; });
  }

  // Cut [from, to] into pieces no taller than pageH, ending on a row boundary when one is in the lower half.
  function pageSlices(from, to, pageH, pts) {
    var out = [], start = from;
    while (start < to - 1) {
      var limit = start + pageH, end = Math.min(limit, to);
      if (limit < to) {
        for (var i = pts.length - 1; i >= 0; i--) { if (pts[i] <= limit && pts[i] > start + pageH * 0.5) { end = pts[i]; break; } }
      }
      out.push([start, end]); start = end;
    }
    return out;
  }

  function b64bytes(dataUrl) {
    var bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  // Minimal PDF: one JPEG image per page, scaled to the page width.
  function buildPdf(pages, title) {
    var enc = new TextEncoder(), parts = [], offsets = [], len = 0;
    function add(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body) { offsets[n] = len; add(n + ' 0 obj\n'); body(); add('\nendobj\n'); }
    var n = pages.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, function () { add('<< /Type /Catalog /Pages 2 0 R >>'); });
    obj(2, function () { add('<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>'); });
    pages.forEach(function (p, i) {
      var po = 3 + i * 3, co = po + 1, io = po + 2;
      var w = A4W - 2 * MARGIN * 0.75, h = w * p.h / p.w, x = MARGIN * 0.75, y = A4H - MARGIN * 0.75 - h;
      var cs = 'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im0 Do Q';
      obj(po, function () { add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4W + ' ' + A4H + '] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>'); });
      obj(co, function () { add('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream'); });
      obj(io, function () {
        add('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>\nstream\n');
        add(p.jpg); add('\nendstream');
      });
    });
    var info = 3 + n * 3;
    obj(info, function () { add('<< /Title (' + String(title || 'GH Daybook').replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '') + ') /Producer (GH Daybook) >>'); });
    var xref = len, rows = ['0000000000 65535 f '];
    for (var k = 1; k <= info; k++) rows.push(String(offsets[k]).padStart(10, '0') + ' 00000 n ');
    add('xref\n0 ' + (info + 1) + '\n' + rows.join('\n') + '\ntrailer\n<< /Size ' + (info + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  // el: the .paper element on screen. Resolves to a PDF Blob.
  function fromElement(el, title) {
    return loadH2C().then(function () {
      var host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + CSSW + 'px;background:#fff';
      var clone = el.cloneNode(true);
      clone.style.cssText = 'border:0;border-radius:0;overflow:visible;margin:0;padding:' + MARGIN + 'px;width:' + CSSW + 'px;box-sizing:border-box';
      host.appendChild(clone); document.body.appendChild(host);
      var total = clone.offsetHeight, pts = breakPoints(clone);
      var contentW = CSSW - 2 * MARGIN, pageH = contentW * (A4H - 2 * MARGIN * 0.75) / (A4W - 2 * MARGIN * 0.75);
      var scale = Math.min(2, Math.sqrt(15e6 / (CSSW * total)));    // stay under the iPhone canvas size limit
      return G.html2canvas(clone, { scale: scale, backgroundColor: '#ffffff', logging: false, windowWidth: CSSW, scrollX: 0, scrollY: -window.scrollY })
        .then(function (canvas) {
          host.remove();
          var pages = pageSlices(MARGIN, total - MARGIN, pageH, pts).map(function (sl) {
            var c = document.createElement('canvas');
            c.width = Math.round(contentW * scale); c.height = Math.max(1, Math.round((sl[1] - sl[0]) * scale));
            var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            g.drawImage(canvas, Math.round(MARGIN * scale), Math.round(sl[0] * scale), c.width, c.height, 0, 0, c.width, c.height);
            return { w: c.width, h: c.height, jpg: b64bytes(c.toDataURL('image/jpeg', 0.9)) };
          });
          return buildPdf(pages, title);
        }, function (e) { host.remove(); throw e; });
    });
  }

  G.PDFOUT = { fromElement: fromElement, _buildPdf: buildPdf, _pageSlices: pageSlices };
})(typeof window !== 'undefined' ? window : globalThis);
