/* Cache-first service worker so Dino Bob plays offline once installed. */

var CACHE = 'dinobob-v22-smooth-arms';
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
  'js/stages.js',
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
  // every sprite the game can draw (all confirmed present on disk) so a cache
  // version bump never strands the game with blank art while offline
  'assets/sprites/char_dinobob.png',
  'assets/sprites/char_ninja.png',
  'assets/sprites/char_astronaut.png',
  'assets/sprites/char_robot.png',
  'assets/sprites/char_bear.png',
  'assets/sprites/arm_dinobob_upper.png',
  'assets/sprites/arm_dinobob_bowhand.png',
  'assets/sprites/arm_dinobob_stringhand.png',
  'assets/sprites/arm_ninja_upper.png',
  'assets/sprites/arm_ninja_bowhand.png',
  'assets/sprites/arm_ninja_stringhand.png',
  'assets/sprites/arm_astronaut_upper.png',
  'assets/sprites/arm_astronaut_bowhand.png',
  'assets/sprites/arm_astronaut_stringhand.png',
  'assets/sprites/arm_robot_upper.png',
  'assets/sprites/arm_robot_bowhand.png',
  'assets/sprites/arm_robot_stringhand.png',
  'assets/sprites/arm_bear_upper.png',
  'assets/sprites/arm_bear_bowhand.png',
  'assets/sprites/arm_bear_stringhand.png',
  'assets/sprites/arrow_wooden.png',
  'assets/sprites/arrow_fire.png',
  'assets/sprites/arrow_ice.png',
  'assets/sprites/arrow_lightning.png',
  'assets/sprites/arrow_obsidian.png',
  'assets/sprites/bow.png',
  'assets/sprites/balloon.png',
  'assets/sprites/bg_meadow.webp',
  'assets/sprites/bg_mountain.webp',
  'assets/sprites/target.png',
  'assets/sprites/coin.png',
  'assets/sprites/blackhole_0.png',
  'assets/sprites/blackhole_1.png',
  'assets/sprites/blackhole_2.png',
  'assets/sprites/chest_closed.png',
  'assets/sprites/chest_semi.png',
  'assets/sprites/chest_open.png',
  'assets/sprites/chest_3d_0.png',
  'assets/sprites/chest_3d_1.png',
  'assets/sprites/chest_3d_2.png',
  'assets/sprites/chest_3d_3.png',
  'assets/sprites/chest_3d_4.png',
  'assets/sprites/chest_3d_5.png',
  'assets/sprites/chest_3d_6.png',
  'assets/sprites/chest_3d_7.png',
  'assets/sprites/fruit_apple.png',
  'assets/sprites/fruit_banana.png',
  'assets/sprites/fruit_pineapple.png',
  'assets/sprites/fruit_strawberry.png',
  'assets/sprites/fruit_orange.png',
  'assets/sprites/fruit_grapes.png',
  'assets/sprites/fruit_pear.png',
  'assets/sprites/fruit_cherry.png',
  'assets/sprites/fruit_watermelon.png',
  'assets/sprites/hat_cap.png',
  'assets/sprites/hat_viking.png',
  'assets/sprites/hat_robin.png',
  'assets/sprites/hat_bandana.png',
  'assets/sprites/hat_wizard.png',
  'assets/sprites/hat_crown.png',
  'assets/sprites/hat_pirate.png',
  'assets/sprites/hat_dino.png',
  'assets/sprites/hat_astro.png',
  // V5 art overhaul
  'assets/sprites/char_trixie.png',
  'assets/sprites/arm_trixie_upper.png',
  'assets/sprites/arm_trixie_bowhand.png',
  'assets/sprites/arm_trixie_stringhand.png',
  'assets/sprites/char_dinobob_ruby.png',
  'assets/sprites/char_dinobob_grape.png',
  'assets/sprites/char_dinobob_gold.png',
  'assets/sprites/char_dinobob_mint.png',
  'assets/sprites/char_dinobob_shiny.png',
  'assets/sprites/boss_moonstone.webp',
  'assets/sprites/boss_moonstone_cracked.webp',
  'assets/sprites/boss_moonstone_broken.webp',
  'assets/sprites/boss_moonstone_3d_0.webp',
  'assets/sprites/boss_moonstone_3d_1.webp',
  'assets/sprites/boss_moonstone_3d_2.webp',
  'assets/sprites/boss_moonstone_3d_3.webp',
  'assets/sprites/boss_moonstone_3d_4.webp',
  'assets/sprites/boss_moonstone_3d_5.webp',
  'assets/sprites/bg_moon_cave.webp',
  'assets/sprites/bg_starlight.webp',
  'assets/sprites/bg_sunset_beach.webp',
  'assets/sprites/bg_underwater.webp',
  'assets/sprites/adventure_map.webp'
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
