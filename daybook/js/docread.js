/* Read text out of PDFs and photos, fully offline.
 * PDF: pdf.js gives the text with positions; if a page has almost no text (a scan), it is rendered to an
 * image and read with OCR. Photos (jpg / png / webp): Tesseract OCR (English).
 * Result: lines [{ text, items: [{ str, x }] }] in reading order, with x positions so table columns survive.
 * The libraries (vendor/, ~13 MB) load only the first time a PDF or photo is uploaded.
 */
(function (G) {
  'use strict';
  var base = 'vendor/';
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { loaded[src] = null; rej(new Error('Could not load ' + src + '. Open the app once with internet so it is saved for offline use.')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  // group positioned text pieces into lines (same baseline within a tolerance)
  function toLines(pieces) {
    pieces.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var lines = [];
    pieces.forEach(function (p) {
      var ln = lines[lines.length - 1];
      if (ln && Math.abs(ln.y - p.y) <= Math.max(3, p.h * 0.5)) ln.items.push(p); else lines.push({ y: p.y, items: [p] });
    });
    return lines.map(function (ln) {
      ln.items.sort(function (a, b) { return a.x - b.x; });
      // merge pieces that touch into words/phrases; keep wider gaps as separate cells
      var cells = [];
      ln.items.forEach(function (it) {
        var c = cells[cells.length - 1];
        if (c && it.x - c.end < Math.max(4, it.h * 0.8)) { c.str += (it.x - c.end > 1 ? ' ' : '') + it.str; c.end = it.x + it.w; }
        else cells.push({ str: it.str, x: it.x, end: it.x + it.w });
      });
      cells = cells.filter(function (c) { return c.str.trim(); });
      return { text: cells.map(function (c) { return c.str.trim(); }).join('  '), items: cells.map(function (c) { return { str: c.str.trim(), x: c.x }; }) };
    }).filter(function (l) { return l.text.trim(); });
  }

  var worker = null;
  function ocrWorker(progress) {
    if (worker) return worker;
    worker = loadScript(base + 'tesseract/tesseract.min.js').then(function () {
      return G.Tesseract.createWorker('eng', 1, {
        workerPath: new URL(base + 'tesseract/worker.min.js', location.href).href,
        corePath: new URL(base + 'tesseract/', location.href).href,
        langPath: new URL(base + 'tesseract/', location.href).href,
        // the Android build tools unpack .gz assets (eng.traineddata.gz → eng.traineddata)
        gzip: !(G.NATIVE && G.NATIVE.android), workerBlobURL: false, cacheMethod: 'none',
        logger: function (m) { if (progress && m.status) progress(m.status + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '')); },
      });
    });
    worker.catch(function () { worker = null; });
    return worker;
  }
  function ocr(image, progress, offsetY) {
    return ocrWorker(progress).then(function (w) { return w.recognize(image); }).then(function (r) {
      var pieces = [];
      (r.data.words || []).forEach(function (wd) {
        if (!wd.text || wd.confidence < 35) return;
        var b = wd.bbox; pieces.push({ str: wd.text, x: b.x0, y: (offsetY || 0) + (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0 });
      });
      return pieces;
    });
  }

  function readPdf(file, progress) {
    return loadScript(base + 'pdfjs/pdf.min.js').then(function () {
      var lib = G.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = new URL(base + 'pdfjs/pdf.worker.min.js', location.href).href;
      return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; });
    }).then(function (pdf) {
      var all = [], chain = Promise.resolve();
      for (var n = 1; n <= Math.min(pdf.numPages, 30); n++) (function (n) {
        chain = chain.then(function () { return pdf.getPage(n); }).then(function (page) {
          if (progress) progress('Reading page ' + n + ' of ' + pdf.numPages);
          var vp = page.getViewport({ scale: 1 });
          return page.getTextContent().then(function (tc) {
            var pieces = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
              return { str: it.str, x: it.transform[4], y: (n - 1) * 2000 + (vp.height - it.transform[5]), w: it.width, h: Math.abs(it.transform[3]) || 10 };
            });
            if (pieces.length >= 8) { all = all.concat(pieces); return; }
            // scanned page: render and OCR
            var v2 = page.getViewport({ scale: 2 }), cv = document.createElement('canvas');
            cv.width = v2.width; cv.height = v2.height;
            return page.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise.then(function () { return ocr(cv, progress, (n - 1) * 4000); }).then(function (p) { all = all.concat(p); });
          });
        });
      })(n);
      return chain.then(function () { return toLines(all); });
    });
  }

  function read(file, progress) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return readPdf(file, progress);
    if (/\.hei[cf]$/i.test(file.name)) return Promise.reject(new Error('iPhone HEIC photos cannot be read here. In the iPhone camera settings choose “Most Compatible” (JPG), or share the photo as JPG.'));
    return ocr(file, progress).then(toLines);
  }

  G.DOCREAD = { read: read, toLines: toLines };
})(window);
