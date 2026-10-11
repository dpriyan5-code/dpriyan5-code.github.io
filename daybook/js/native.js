/* When the app runs inside the Android app (Capacitor) the browser's download, share and print
 * functions are not available, so they are routed to Android's own share sheet and printing.
 * In a normal browser and in the Windows desktop app this file does nothing.
 */
(function (G) {
  'use strict';
  var C = G.Capacitor, UI = G.UI;
  var android = !!(C && C.isNativePlatform && C.isNativePlatform());
  G.NATIVE = { android: android, desktop: /Electron\//.test(navigator.userAgent) };
  if (!android) return;
  var P = C.Plugins;
  function base64(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(blob); });
  }
  // Save into the app's cache and open the share sheet (WhatsApp, Gmail, Drive, Files → "Save").
  function shareFile(blob, name, text) {
    return base64(blob).then(function (data) { return P.Filesystem.writeFile({ path: name, data: data, directory: 'CACHE' }); })
      .then(function (r) { return P.Share.share({ title: name, text: text || name, files: [r.uri], dialogTitle: 'Send or save ' + name }); })
      .catch(function (e) { var m = (e && e.message) || String(e); if (!/cancel/i.test(m)) UI.toast('Could not share the file: ' + m, true); });
  }
  UI.download = function (blob, name) { return shareFile(blob, name); };
  UI.shareFile = shareFile;
  UI.shareText = function (text) { return P.Share.share({ text: text, dialogTitle: 'Send report' }).catch(function () { /* cancelled */ }); };
  UI.whatsapp = function (text) { return P.Share.share({ text: text, dialogTitle: 'Send to WhatsApp' }).catch(function () { /* cancelled */ }); };
  window.print = function () { if (G.AndroidPrint) G.AndroidPrint.print(document.title || 'GH Daybook'); else UI.toast('Printing is not available on this phone', true); };
  document.documentElement.classList.add('native-android');
})(window);
