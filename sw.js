/* Cache-first service worker so Dino Bob plays offline once installed. */

var CACHE = 'dinobob-v3';
var FILES = [
  '.',
  'index.html',
  'css/style.css',
  'js/tuning.js',
  'js/data.js',
  'js/save.js',
  'js/audio.js',
  'js/sprites.js',
  'js/art.js',
  'js/game.js',
  'js/ui.js',
  'js/main.js',
  'intro/intro.dc.html',
  'intro/support.js',
  'intro/intro.jsx',
  'intro/assets/forest.png',
  'intro/assets/dino_0.png',
  'intro/assets/dino_3.png',
  'intro/assets/bow.png',
  'intro/assets/arrow_fire.png',
  'intro/assets/target.png',
  'intro/assets/coin.png',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/sprites/char_dinobob.png',
  'assets/sprites/char_ninja.png',
  'assets/sprites/char_astronaut.png',
  'assets/sprites/char_robot.png',
  'assets/sprites/char_bear.png',
  'assets/sprites/arrow_wooden.png',
  'assets/sprites/arrow_fire.png',
  'assets/sprites/arrow_ice.png',
  'assets/sprites/arrow_lightning.png',
  'assets/sprites/bow.png',
  'assets/sprites/balloon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        // cache same-origin gets (and the Google fonts) as we go
        if (e.request.method === 'GET' && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    }).catch(function () { return caches.match('index.html'); })
  );
});
