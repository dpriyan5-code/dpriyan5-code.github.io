// Offline cache for the app shell. Data is never cached here – it lives in IndexedDB on the phone.
// Bump VERSION whenever any file below changes so phones pick up the new version.
const VERSION = 'ghd-v1.2.4';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'js/schema.js', 'js/store.js', 'js/xlsx.js', 'js/xlsx-read.js', 'js/importers.js', 'js/ncd.js', 'js/docread.js', 'js/auth.js', 'js/native.js', 'js/reports.js', 'js/ui.js',
  'js/views-entry.js', 'js/views-records.js', 'js/views-reports.js', 'js/app.js', 'js/pdfout.js',
  'vendor/html2canvas/html2canvas.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Only our own caches: other apps on the same site (e.g. dpriyan5-code.github.io) keep theirs.
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ghd-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache first (opens instantly with no signal), refreshed from the network in the background.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit || c.match('index.html'));
    return hit || net;
  })));
});
