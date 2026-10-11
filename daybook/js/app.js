/* Boot: open the store, apply PIN lock, start the router, register the offline service worker. */
(function (G) {
  'use strict';
  G.APP_VERSION = '1.2.2';
  var UI = G.UI;
  function start() {
    var u = UI.user(); if (u) G.DB.setUser(G.AUTH && G.AUTH.isAdmin() ? G.DB.getUser() || u.name : u.name);
    G.VIEWS_ENTRY.ensureSeeds();
    window.addEventListener('hashchange', UI.dispatch);
    UI.dispatch();
  }
  G.DB.init().then(function () {
    if (localStorage.getItem('ghd_pin')) G.VIEWS_REPORTS.lockScreen(start); else start();
  }).catch(function (e) {
    document.getElementById('app').innerHTML = '<p style="padding:20px">Could not open storage: ' + UI.h(e.message) + '</p>';
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(G.NATIVE && (G.NATIVE.android || G.NATIVE.desktop))) { // the installed apps carry their files already
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        w && w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) UI.toast('App updated – it will use the new version next time you open it');
        });
      });
    }).catch(function () { /* offline install not available */ });
  }
})(window);
