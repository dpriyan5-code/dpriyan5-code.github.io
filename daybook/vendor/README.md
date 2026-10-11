Third-party libraries, bundled so PDF and photo reading work offline. Loaded only when a PDF or image is uploaded.

- `pdfjs/` – pdf.js 3.11.174 (Mozilla, Apache-2.0): reads text from PDF files.
- `tesseract/` – tesseract.js 5.1.1 + tesseract.js-core 5.1.1 (Apache-2.0) and the English `eng.traineddata` (4.0.0_best_int): reads text from photos and scanned PDFs.
- `html2canvas/` – html2canvas 1.4.1 (Niklas von Hertzen, MIT): draws a printed form so it can be saved as a PDF file. Loaded only when **Save PDF** is tapped.
