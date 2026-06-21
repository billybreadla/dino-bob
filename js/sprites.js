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
    'fruit_apple', 'fruit_banana', 'fruit_pineapple', 'fruit_strawberry',
    'fruit_orange', 'fruit_grapes', 'fruit_pear', 'fruit_cherry', 'fruit_watermelon',
    'hat_cap', 'hat_viking', 'hat_robin', 'hat_bandana', 'hat_wizard',
    'hat_crown', 'hat_pirate', 'hat_dino', 'hat_astro'
  ];
  var imgs = {};
  NAMES.forEach(function (n) {
    var im = new Image();
    im._ok = false;
    im.onload = function () { im._ok = im.naturalWidth > 0; };
    im.onerror = function () { im._ok = false; };
    im.src = 'assets/sprites/' + n + '.png';
    imgs[n] = im;
  });

  return {
    get: function (name) {
      var im = imgs[name];
      return (im && im._ok) ? im : null;
    }
  };
})();
