/* Sprite loader. Real art lives in assets/sprites/<name>.png and is loaded
   once at boot. Every draw path falls back to the procedural art in art.js
   if a sprite is missing or hasn't loaded yet, so the game always renders. */

var SPRITES = (function () {
  var NAMES = [
    'char_dinobob', 'char_ninja', 'char_astronaut', 'char_robot', 'char_bear',
    'arm_dinobob_upper', 'arm_dinobob_bowhand', 'arm_dinobob_stringhand',
    'arm_ninja_upper', 'arm_ninja_bowhand', 'arm_ninja_stringhand',
    'arm_astronaut_upper', 'arm_astronaut_bowhand', 'arm_astronaut_stringhand',
    'arm_robot_upper', 'arm_robot_bowhand', 'arm_robot_stringhand',
    'arm_bear_upper', 'arm_bear_bowhand', 'arm_bear_stringhand',
    'arrow_wooden', 'arrow_fire', 'arrow_ice', 'arrow_lightning',
    'bow', 'balloon',
    'bg_meadow', 'bg_mountain', 'target', 'coin',
    'arrow_obsidian', 'blackhole_0', 'blackhole_1', 'blackhole_2',
    'chest_closed', 'chest_semi', 'chest_open',
    'chest_3d_0', 'chest_3d_1', 'chest_3d_2', 'chest_3d_3', 'chest_3d_4', 'chest_3d_5', 'chest_3d_6', 'chest_3d_7',
    'fruit_apple', 'fruit_banana', 'fruit_pineapple', 'fruit_strawberry',
    'fruit_orange', 'fruit_grapes', 'fruit_pear', 'fruit_cherry', 'fruit_watermelon',
    'hat_cap', 'hat_viking', 'hat_robin', 'hat_bandana', 'hat_wizard',
    'hat_crown', 'hat_pirate', 'hat_dino', 'hat_astro',
    // V5 art overhaul
    'char_trixie', 'arm_trixie_upper', 'arm_trixie_bowhand', 'arm_trixie_stringhand',
    'char_dinobob_ruby', 'char_dinobob_grape', 'char_dinobob_gold', 'char_dinobob_mint', 'char_dinobob_shiny',
    'boss_moonstone', 'boss_moonstone_cracked', 'boss_moonstone_broken',
    'boss_moonstone_3d_0', 'boss_moonstone_3d_1', 'boss_moonstone_3d_2',
    'boss_moonstone_3d_3', 'boss_moonstone_3d_4', 'boss_moonstone_3d_5',
    'bg_moon_cave', 'bg_starlight', 'bg_sunset_beach', 'bg_underwater', 'adventure_map',
    // Integrated in-game archer poses (replace the old articulated arms)
    'char_dinobob_archer', 'char_ninja_archer', 'char_astronaut_archer',
    'char_robot_archer', 'char_bear_archer', 'char_trixie_archer',
    // Dino Bob draw-animation frames (string hand pulls back; 0 relaxed..2 full)
    'char_dinobob_draw0', 'char_dinobob_draw1', 'char_dinobob_draw2',
    // V6 "Real Objects" art: easel stand, target turntable frames, rendered
    // pickups, tumbling fruit frames, per-biome foreground strips (all WebP)
    'target_stand',
    'target_3d_0', 'target_3d_1', 'target_3d_2', 'target_3d_3', 'target_3d_4', 'target_3d_5',
    'pickup_arrows', 'pickup_slowmo',
    'fruit_apple_3d_0', 'fruit_apple_3d_1', 'fruit_apple_3d_2',
    'fruit_apple_3d_3', 'fruit_apple_3d_4', 'fruit_apple_3d_5',
    'fruit_watermelon_3d_0', 'fruit_watermelon_3d_1', 'fruit_watermelon_3d_2',
    'fruit_watermelon_3d_3', 'fruit_watermelon_3d_4', 'fruit_watermelon_3d_5',
    'fg_meadow', 'fg_mountain', 'fg_sunset_beach', 'fg_starlight', 'fg_underwater', 'fg_moon_cave'
  ];
  // Big scenes + the heavy 3D boss frames ship as WebP (~85% smaller); the rest stay PNG.
  var WEBP = { bg_meadow: 1, bg_mountain: 1, bg_moon_cave: 1, bg_starlight: 1, bg_sunset_beach: 1, bg_underwater: 1, adventure_map: 1,
    boss_moonstone: 1, boss_moonstone_cracked: 1, boss_moonstone_broken: 1,
    boss_moonstone_3d_0: 1, boss_moonstone_3d_1: 1, boss_moonstone_3d_2: 1, boss_moonstone_3d_3: 1, boss_moonstone_3d_4: 1, boss_moonstone_3d_5: 1 };
  // every V6 asset shipped as WebP from day one
  NAMES.slice(NAMES.indexOf('target_stand')).forEach(function (n) { WEBP[n] = 1; });
  var imgs = {};
  NAMES.forEach(function (n) {
    var im = new Image();
    im._ok = false;
    im.onload = function () { im._ok = im.naturalWidth > 0; };
    im.onerror = function () { im._ok = false; };
    im.src = 'assets/sprites/' + n + (WEBP[n] ? '.webp' : '.png');
    imgs[n] = im;
  });

  return {
    get: function (name) {
      var im = imgs[name];
      return (im && im._ok) ? im : null;
    }
  };
})();
