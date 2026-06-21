/* Boot + PWA registration. */

window.addEventListener('DOMContentLoaded', function () {
  UI.boot();

  // PWA service worker (only works when served over http/https, not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline play just won't cache */ });
  }
});

// keep canvas sizing honest on rotate / resize
window.addEventListener('resize', function () {
  // canvas scales via CSS; nothing to recompute, but nudge a repaint
  document.body.style.minHeight = window.innerHeight + 'px';
});

// no pinch zoom / double-tap zoom while playing
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('dblclick', function (e) { e.preventDefault(); });
