/* Target Practice — the round engine.
   World space is 1600x900; the canvas scales to fit the screen. */

var GAME = (function () {
  var W = 1600, H = 900, GROUND = 790;
  var GRAVITY = 1500;                 // px/s^2 for the wooden arrow
  var BOW = { x: 225, y: 690 };       // bow anchor (at the player's hands)
  var MAX_PULL = 300;                 // drag distance for full power

  var canvas, ctx, raf = null, onEnd = null;
  var running = false;
  var paused = false;
  var visWired = false;
  var keysWired = false;
  // ---- Photo Mode ---- lives on top of pause: world stays frozen, but the
  // rAF loop keeps running so pan/zoom redraw every frame.
  var photoMode = false;
  var photoPan = { x: 0, y: 0 };
  var photoZoomIdx = 0;
  var photoDragLast = null;       // pointer pos while panning
  var photoFlashUntil = 0;        // shutter-flash deadline (performance.now ms)
  // ---- keyboard / gamepad synthetic aim ----
  var kbHeld = {};                // held-key map keyed by e.code
  var synthAngle = -0.25;         // persistent aim angle for keys/stick-free aim
  var kbRotEase = 0;              // 0..1 ease-in while a rotate key is held
  var drawSrc = null;             // who owns the current hold-draw: 'key' | 'gp0'
  var gpPauseTimer = null;        // polls Start-button while the loop is paused
  var gpPrevStart = false, gpPrevB1 = false, gpB0Prev = false, gpWasDeflected = false;
  var GP_DEADZONE = 0.25;
  var KB_ROT_SPEED = 1.35;        // rad/s at full ease (~dt*6-style easing ramp)
  // pause button sits between the timer and the arrow counter
  var PAUSE_BTN = { x: W / 2 + 130, y: 24, w: 56, h: 56 };
  var RESUME_R = 74;    // radius of the big resume button on the pause overlay
  // [PHOTO] pill hangs just below the pause card — tertiary action styling
  var PHOTO_PAUSE_BTN = { x: W / 2 - 110, y: H / 2 + 240, w: 220, h: 56 };
  // photo bar (bottom center): ZOOM pill · shutter · EXIT pill
  var PHOTO_ZOOMS = [1, 1.15, 1.3];
  var PHOTO_ZOOM_BTN = { x: W / 2 - 225, y: H - 98, w: 150, h: 64 };
  var PHOTO_EXIT_BTN = { x: W / 2 + 75, y: H - 98, w: 150, h: 64 };
  var PHOTO_SHUTTER = { x: W / 2, y: H - 66, r: 44 };

  function requestFrame() {
    if (!raf && running && (!paused || photoMode)) raf = requestAnimationFrame(frame);
  }

  function cancelFrame() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function setPaused(next) {
    next = !!next;
    if (!running || !st || st.over) return paused;
    if (paused === next) return paused;
    paused = next;
    st.aiming = false;
    cancelSynthDraw(); // a held Space/A draw must never fire after a pause
    frame.last = undefined; // resume from a clean timestamp so physics never jumps
    if (paused) {
      cancelFrame();
      render(); // draw the frozen frame + overlay once; no RAF churn while paused
      ensureGpPausePoll(); // keep the Start button able to un-pause
    } else {
      clearGpPausePoll();
      AUDIO.click();
      requestFrame();
    }
    return paused;
  }

  /* ============ round setup ============ */

  // mulberry32: a tiny seeded PRNG. Daily-challenge and shared-code rounds
  // pass a fixed seed so every player sees the same target rolls; normal
  // rounds just use plain Math.random().
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) | 0;
      var z = t;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newRound(options) {
    options = options || {};
    var p = SAVE.current();
    var char = DATA.characterById(p.equipped.character);
    var arrow = DATA.arrowById(p.equipped.arrow);
    var perk = char.perk || {};
    // Pinned randomness for daily/shared rounds (options.seed); null keeps
    // the default unseeded behaviour.
    var randFn = typeof options.seed === 'number' ? mulberry32(options.seed) : null;

    var rules = {
      mode: options.mode || 'practice',
      label: options.label || '',
      roundSeconds: options.roundSeconds || TUNING.ROUND_SECONDS,
      arrows: options.arrows || TUNING.ARROWS_PER_ROUND,
      moversAt: options.moversAt === undefined ? TUNING.MOVERS_START_AT : options.moversAt,
      chaosAt: options.chaosAt === undefined ? TUNING.CHAOS_START_AT : options.chaosAt,
      targetSpeed: options.targetSpeed || 1,
      specialRule: options.specialRule || 'normal',
      bossAtStart: !!options.bossAtStart,
      bossId: options.bossId || null,
      // Penny's Boss Workshop: a saved design rides along in the round rules
      // so the boss code can build its def without touching STAGES data.
      customBoss: options.customBoss || null,
      theme: options.theme || null,
      challengeFrom: options.challengeFrom || null,
      // Marathon endless mode: no clock; arrows still count (see rules.endless).
      endless: !!options.endless
    };
    if (rules.bossAtStart && AUDIO.music) AUDIO.music.start('tense');
    rules.reducedMotion = !!(typeof SAVE !== 'undefined' && SAVE.settings && SAVE.settings().reducedMotion);
    // Accessibility: Easier Mode gives more time, more arrows, slower targets.
    if (typeof SAVE !== 'undefined' && SAVE.settings && SAVE.settings().easy) {
      rules.arrows = Math.ceil(rules.arrows * 1.25);
      rules.roundSeconds = Math.round(rules.roundSeconds * 1.25);
      rules.targetSpeed = rules.targetSpeed * 0.8;
      rules.easy = true;
    }
    // ---- WIND ---- rolls ONCE per round, right here (seeded rounds roll it
    // through the pinned PRNG so everyone shares the same breeze). 40% of
    // rounds are perfectly calm; windy rounds cube a -1..1 roll so gentle
    // breezes are common and full gales are rare. Wind is PHYSICS, not
    // decoration: it bends real arrows and the aim preview alike, always.
    var wroll = ((randFn ? randFn() : Math.random()) * 2 - 1);
    rules.wind = Math.abs(wroll) < (1 - TUNING.WIND_CHANCE) ? 0 :
      Math.sign(wroll) * Math.pow(Math.abs(wroll), 3) * TUNING.WIND_MAX;

    // ---- WEATHER ---- rolls ONCE per round right beside the breeze (seeded
    // rounds roll it through the pinned PRNG so everyone shares the same
    // skies). Intensity rides the round's wind value: a windy + rainy round
    // means driving diagonal rain, while calm rounds get gentle weather.
    var bgName = options.background && options.background !== 'random' ?
      (options.background === 'cave' ? 'bg_moon_cave' : options.background) :
      (function () {
        // Surprise scenery — seeded rounds roll it through the pinned PRNG.
        var bgs = ['bg_meadow', 'bg_mountain', 'bg_sunset_beach', 'bg_starlight', 'bg_underwater'];
        return bgs[Math.floor((randFn ? randFn() : Math.random()) * bgs.length)];
      })();
    var biomeKey = weatherBiome(bgName);
    var wsky = (randFn ? randFn() : Math.random());
    var wkind = 'clear';
    if ((biomeKey === 'grass' || biomeKey === 'beach') && wsky < TUNING.WEATHER_RAIN_CHANCE) wkind = 'rain';
    else if (biomeKey === 'starlight' && wsky < TUNING.WEATHER_METEOR_CHANCE) wkind = 'meteor';
    else if (biomeKey === 'cave' && wsky < TUNING.WEATHER_EMBER_CHANCE) wkind = 'embers';
    // underwater always stays clear: its bubbles already live in the atmosphere
    var wf = Math.min(1, Math.abs(rules.wind) / TUNING.WIND_MAX);
    var weather = {
      kind: wkind,
      biome: biomeKey,
      intensity: 0.55 + wf * 0.8,          // scales WITH the wind roll
      lean: Math.max(-1, Math.min(1, rules.wind / TUNING.WIND_MAX)),
      splashAcc: 0,                        // rain-splash ring throttle bucket
      flashT: 0,                           // lightning flash time left
      nextFlash: TUNING.WEATHER_LIGHTNING_MIN +
        Math.random() * (TUNING.WEATHER_LIGHTNING_MAX - TUNING.WEATHER_LIGHTNING_MIN),
      prevT: null,                         // last st.t seen (for dt math)
      vk: null,                            // resolved visual kind ('leaves' etc)
      table: null                          // fixed-size table, built once/round
    };

    return {
      profile: p,
      char: char,
      arrowType: arrow,
      perk: perk,
      rules: rules,
      time: rules.roundSeconds,
      countdown: 3.2,         // 3..2..1..GO
      over: false,
      overTimer: 0,
      score: 0,
      coinsDirect: 0,
      arrowsLeft: rules.arrows,
      arrows: [],             // in flight
      targets: [],
      particles: [],
      floaters: [],
      coins: [],              // coins flying to the HUD
      bolts: [],              // lightning visuals
      brokenArrows: [],       // snap visuals when an arrow hits armor
      blackholes: [],         // obsidian-arrow black holes
      planes: [],             // the penguins' crossover flyby (max 1 airborne)
      shake: 0,
      shakeX: 0,              // this frame's shake vector (shared by layers)
      shakeY: 0,
      t: 0,                   // elapsed seconds (for animation)
      aiming: false,
      aim: { x: 0, y: 0, power: 0, angle: 0 },
      releaseKick: 0,
      lookTimer: 0,
      lastTickSec: 6,
      spawnCooldown: 0,
      escaped: 0,             // soft counter (escapes no longer end Marathon)
      wave: 1,                // MARATHON: current 30-second wave number
      baseSpeed: rules.targetSpeed, // MARATHON: speed the escalation ramp builds from
      combo: 0,               // hits in a row without a miss
      comboMult: 1,           // current score multiplier from the combo
      bestCombo: 0,
      slowUntil: 0,           // slow-motion power-up active until this time
      cinematicUntil: 0,
      bossSpawned: false,
      stats: { shots: 0, hits: 0, misses: 0, bullseyes: 0, balloons: 0, fruits: 0, chests: 0, doodles: 0, planes: 0, golden: 0, bossDefeated: false },
      weather: weather,       // this round's skies (see WEATHER roll above)
      bgName: bgName,
      // Per-round spawn RNG. rand()/pick()/spawner rolls all flow through
      // st.rand so a seeded round plays out the same layout for everyone;
      // cosmetic randomness (particles, lightning jitter, audio) deliberately
      // stays on Math.random and is never seeded.
      rand: randFn
    };
  }

  function hasGoldenBow() {
    try { return !!(typeof SAVE !== 'undefined' && SAVE.hasGoldenBow && SAVE.hasGoldenBow()); }
    catch (e) { return false; }
  }
  function reducedMotion() {
    return !!(st && st.rules && st.rules.reducedMotion);
  }

  function addShake(amount) {
    if (!reducedMotion() && TUNING.SCREEN_SHAKE) st.shake = Math.max(st.shake, amount);
  }

  function motionCount(n) {
    return reducedMotion() ? Math.max(1, Math.ceil(n * 0.35)) : n;
  }

  /* ============ targets ============ */

  function phase() {
    // Marathon is endless: there is no countdown clock, so "elapsed" is just
    // st.t. Waves keep escalating forever past phase 3 via targetSpeed.
    var elapsed = st.rules.endless ? st.t : st.rules.roundSeconds - st.time;
    if (elapsed < st.rules.moversAt) return 1;
    if (elapsed < st.rules.chaosAt) return 2;
    return 3;
  }

  // Spawn-relevant randomness flows through rng(): st.rand is pinned for
  // daily/shared-code rounds, otherwise plain Math.random().
  function rng() {
    return (st && st.rand) ? st.rand() : Math.random();
  }
  function rand(a, b) { return a + rng() * (b - a); }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

  function makeBullseye(kind) {
    // Some targets stand far away in the distance: drawn small and hazy,
    // sitting on distant ground, worth FAR_TARGET_MULTIPLIER extra points.
    var far = kind !== 'swing' && rng() < (TUNING.FAR_TARGET_CHANCE || 0);
    var r = far ? rand(36, 46) : rand(58, 78);
    var x = rand(750, 1480);
    var t = {
      type: 'bullseye', r: r, hp: 1, far: far,
      wobble: 0, dead: false, frozenUntil: 0,
      motion: kind, // 'static' | 'slide' | 'swing'
      mt: rand(0, 10)
    };
    if (kind === 'swing') {
      t.anchor = { x: rand(800, 1450), y: rand(-30, 40) };
      t.len = rand(220, 360);
      t.amp = rand(0.5, 0.9) * (phase() === 3 ? 1.2 : 1);
      t.speed = rand(1.2, 1.8) * (phase() === 3 ? 1.5 : 1);
      t.x = t.anchor.x; t.y = t.anchor.y + t.len;
    } else if (far) {
      t.baseX = rand(880, 1500);
      t.y = rand(470, 580);        // high on screen = far down the valley
      t.x = t.baseX;
      t.standStyle = 'frames';
      if (kind === 'slide') {
        t.range = rand(55, 110);
        t.speed = rand(1.2, 2.0) * (phase() === 3 ? 1.6 : 1);
      }
    } else {
      // Near targets stand ON the ground now (V6 art), on one of two stands:
      // the turntable unit's own short legs, or the tall wooden easel.
      t.standStyle = rng() < 0.4 ? 'easel' : 'frames';
      t.baseX = x;
      t.y = t.standStyle === 'easel' ? GROUND - 1.88 * r : GROUND - 1.55 * r;
      t.x = x;
      if (kind === 'slide') {
        t.range = rand(90, 180);
        t.speed = rand(1.2, 2.0) * (phase() === 3 ? 1.6 : 1);
      }
    }
    return t;
  }


  // Wooden shield that orbits a host bullseye — blocks arrows (SNAP!).
  function makeShield(host) {
    var speed = (TUNING.OBSTACLE_SHIELD_SPEED || 1) * (rng() < 0.5 ? 1 : -1);
    return {
      type: 'obstacle', kind: 'shield', dead: false, hp: 1, frozenUntil: 0,
      host: host,
      angle: rand(0, Math.PI * 2),
      orbitSpeed: speed,
      orbitR: (host.r || 60) + 52,
      r: TUNING.OBSTACLE_SHIELD_SIZE || 34,
      x: host.x, y: host.y, mt: 0
    };
  }

  // Tall stone wall — arc your shot over it. Phase 2+ only.
  function makeWall() {
    var h = TUNING.WALL_HEIGHT || 210;
    var w = TUNING.WALL_WIDTH || 40;
    return {
      type: 'obstacle', kind: 'wall', dead: false, hp: 1, frozenUntil: 0,
      x: rand(780, 1180),
      y: GROUND - h / 2 - 8,
      w: w, h: h,
      r: w * 0.55,
      mt: 0
    };
  }

  // Segment vs axis-aligned box (stone walls). Samples the flight segment.
  function segAABB(x1, y1, x2, y2, cx, cy, bw, bh) {
    var left = cx - bw / 2, right = cx + bw / 2, top = cy - bh / 2, bot = cy + bh / 2;
    for (var i = 0; i <= 10; i++) {
      var u = i / 10;
      var px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u;
      if (px >= left && px <= right && py >= top && py <= bot) return { x: px, y: py };
    }
    return null;
  }

  function hitObstacle(ox, oy, nx, ny, t) {
    if (t.kind === 'wall') return segAABB(ox, oy, nx, ny, t.x, t.y, t.w, t.h);
    return segCircle(ox, oy, nx, ny, t.x, t.y, t.r);
  }

  function makeBalloon() {
    return {
      type: 'balloon', dead: false, hp: 1, frozenUntil: 0,
      x: rand(700, 1500), y: GROUND + 60,
      r: 34, vy: -rand(45, 80), sway: rand(0, 10),
      color: pick(['#ff5fa2', '#ffd23a', '#62e6ff', '#9fd636', '#ff7a1a']),
      // hue rotation applied to the red balloon sprite for color variety
      hue: pick([0, 45, 90, 150, 200, 280])
    };
  }

  function makeFruit() {
    var fromRight = rng() < 0.5;
    var kind = pick(Object.keys(TUNING.FRUIT_VALUES));
    return {
      type: 'fruit', dead: false, hp: 1, frozenUntil: 0,
      x: fromRight ? rand(1200, 1550) : rand(650, 900),
      y: GROUND + 50,
      vx: fromRight ? -rand(60, 160) : rand(60, 160),
      vy: -rand(620, 800),
      r: 30, spin: rand(-3, 3),
      kind: kind,
      value: TUNING.FRUIT_VALUES[kind]
    };
  }

  function makeBonusFruit(x, y) {
    var kind = pick(Object.keys(TUNING.FRUIT_VALUES));
    return {
      type: 'fruit', dead: false, hp: 1, frozenUntil: 0,
      // Trixie's bullseye perk should visibly toss fruit from the trick shot,
      // not call the normal random ground spawner.
      x: x + rand(-40, 40),
      y: Math.max(130, y + 35),
      vx: rand(-130, 130),
      vy: -rand(520, 700),
      r: 30, spin: rand(-3, 3),
      kind: kind,
      value: TUNING.FRUIT_VALUES[kind],
      bonusFruit: true
    };
  }

  function makeChest() {
    return {
      type: 'chest', dead: false, hp: 2, frozenUntil: 0,
      x: rand(950, 1480), y: GROUND - 34,
      r: 52, wobble: 0
    };
  }

  // The rare Golden Banana — floats up fast and is worth a fortune.
  function makeGolden() {
    var fromRight = rng() < 0.5;
    return {
      type: 'golden', dead: false, hp: 1, frozenUntil: 0,
      x: fromRight ? rand(1250, 1520) : rand(680, 950),
      y: GROUND + 40,
      vx: fromRight ? -rand(90, 150) : rand(90, 150),
      vy: -rand(120, 170),
      r: 36, mt: 0
    };
  }

  // Power-up pickups: 'arrows' (+arrows) or 'slowmo' (slow motion).
  function makePowerup() {
    return {
      type: 'powerup', dead: false, hp: 1, frozenUntil: 0,
      kind: pick(['arrows', 'slowmo']),
      x: rand(720, 1480), y: GROUND + 40,
      vy: -rand(40, 70), r: 30, mt: 0, sway: rand(0, 10)
    };
  }

  // Penny's Doodle Enemies: her actual drawings, imported with
  // tools/import_drawing.py, wobble onto the field like paper stickers.
  function makeDoodle(entry) {
    var t = {
      type: 'doodle', dead: false, hp: 1, frozenUntil: 0,
      sprite: entry.sprite, points: entry.points || 40,
      baseX: rand(750, 1480),
      y: GROUND - 52,               // sticker stands just above the ground line
      r: 44, mt: rand(0, 10),
      rot: rand(-0.07, 0.07),       // glued on slightly crooked, like real art
      seed: rand(0, Math.PI * 2),
      motion: rng() < 0.5 ? 'slide' : 'static'
    };
    t.x = t.baseX;
    if (t.motion === 'slide') {
      t.range = rand(70, 140);
      t.speed = rand(1.2, 2.0) * (phase() === 3 ? 1.6 : 1);
    }
    return t;
  }

  // Crossover cameo: the penguins' little blue plane (from "If Penguins Could
  // Fly") buzzes across the sky above the arena. Purely a bonus target.
  function makePlane() {
    var y = rand(160, 300);
    return {
      type: 'plane', dead: false, hp: 1, frozenUntil: 0,
      x: W + 90, y: y, baseY: y,
      vx: -(W + 260) / 6,           // crosses the whole arena in about 6s
      vy: 0,
      r: 46, mt: rand(0, 10), seed: rand(0, Math.PI * 2),
      tumble: false, rot: 0, vr: 0
    };
  }

  // End-of-round boss: a giant target that takes several hits. Which boss (art +
  // hit count) comes from the stage's boss config in js/stages.js.

  /* ---- Penny's Boss Workshop ----
     A workshop round (rules.mode 'workshop') carries its own boss design in
     rules.customBoss. We turn it into a def with the exact same shape as a
     STAGES.bossDef entry so every existing boss code path — spawn, damage
     states, drawing, defeat — works on it unchanged.
     GUARD: resolveBossDef() only returns this custom def when the round's
     bossId is literally 'custom'; every normal adventure / challenge / daily
     boss keeps flowing through STAGES.bossDef exactly as before.
     Weak spot: expressed as an art lift fraction so the hitbox circle lands
     on TOP / MIDDLE / LOW of the sprite (lift = fraction - 0.5). */
  var WORKSHOP_BODIES = {
    moonstone: ['boss_moonstone_3d_0', 'boss_moonstone_3d_1', 'boss_moonstone_3d_2', 'boss_moonstone_3d_3', 'boss_moonstone_3d_4', 'boss_moonstone_3d_5'],
    crab: ['boss_crab_3d_0', 'boss_crab_3d_1', 'boss_crab_3d_2', 'boss_crab_3d_3', 'boss_crab_3d_4', 'boss_crab_3d_5'],
    angler: ['boss_angler_3d_0', 'boss_angler_3d_1', 'boss_angler_3d_2', 'boss_angler_3d_3', 'boss_angler_3d_4', 'boss_angler_3d_5'],
    oak: ['boss_oak_3d_0', 'boss_oak_3d_1', 'boss_oak_3d_2', 'boss_oak_3d_3', 'boss_oak_3d_4', 'boss_oak_3d_5'],
    roc: ['boss_roc_3d_0', 'boss_roc_3d_1', 'boss_roc_3d_2', 'boss_roc_3d_3', 'boss_roc_3d_4', 'boss_roc_3d_5'],
    aurora: ['boss_aurora_3d_0', 'boss_aurora_3d_1', 'boss_aurora_3d_2', 'boss_aurora_3d_3', 'boss_aurora_3d_4', 'boss_aurora_3d_5'],
    prism: ['boss_prism_3d_0', 'boss_prism_3d_1', 'boss_prism_3d_2', 'boss_prism_3d_3', 'boss_prism_3d_4', 'boss_prism_3d_5']
  };

  function workshopDef() {
    var c = st.rules.customBoss || {};
    var frames = WORKSHOP_BODIES[c.body] || WORKSHOP_BODIES.moonstone;
    var bodyAtk = (STAGES.bosses[c.body] || STAGES.bosses.moonstone || {}).attack || null;
    return {
      name: c.name || "Penny's Boss",
      sprite: frames[0],
      damageSprites: [frames[0], frames[2], frames[4]],
      renderFrames: frames,
      hp: c.hp,
      scale: c.scale,
      lift: (c.weak === 'top' ? -0.20 : c.weak === 'low' ? 0.20 : 0),
      hue: c.hue || 0,
      wobbleAmp: c.wobble / 50,          // slider 0..100 -> amplitude x0..x2 (50 = classic)
      attack: bodyAtk                   // inherit slam/charge/spit from the body type
    };
  }

  function resolveBossDef(id) {
    if (id === 'custom' && st.rules.customBoss) return workshopDef();
    return STAGES.bossDef(id);
  }

  function makeBoss() {
    // Custom bosses scale their hitbox along with their art (the Moonstone's
    // own r=130 at scale 2.5 stays the baseline).
    var custom = st.rules.bossId === 'custom' && st.rules.customBoss;
    var def = resolveBossDef(st.rules.bossId);
    var hitR = custom ? Math.round(130 * (def.scale / 2.5)) : 130;
    var atk = def.attack || null;
    return {
      type: 'boss', bossId: st.rules.bossId || 'moonstone',
      dead: false, hp: def.hp, maxHp: def.hp, frozenUntil: 0,
      // y puts the boss's feet on the ground so he stands in the scene
      // instead of floating in the sky (art bottom lands near GROUND).
      x: W / 2 + 120, baseX: W / 2 + 120, y: 620,
      r: hitR, wobble: 0, mt: 0,
      motion: 'slide', range: 220, speed: 1.0,
      // Telegraphed attack: idle → windup (glow) → active → recover.
      atkKind: atk ? atk.kind : null,
      atkCd: atk ? (atk.cooldown || TUNING.BOSS_ATTACK_COOLDOWN) * 0.55 : 9999,
      atkTele: atk ? (atk.telegraph || TUNING.BOSS_ATTACK_TELEGRAPH) : 1.2,
      atkPhase: 'idle',
      atkT: 0,
      atkGlow: 0,
      chargeHomeX: W / 2 + 120,
      chargeDir: -1
    };
  }

  function liveTargets() { return st.targets.filter(function (t) { return !t.dead; }); }

  function spawner(dt) {
    st.spawnCooldown -= dt;
    // boss RAGE: cooldowns drain ~67% faster while the wounded king is up
    if (st.bossRage) st.spawnCooldown -= dt * 0.67;
    if (st.spawnCooldown > 0) return;
    var ph = phase();
    var live = liveTargets();

    // The penguins' plane crosses the sky now and then once things get
    // moving (phase 2+). Only one up there at a time!
    if (ph >= 2 && st.planes.length === 0 && rng() < 0.08) {
      st.planes.push(makePlane());
    }

    // The BOSS appears once, when chaos mode begins.
    if ((st.rules.bossAtStart || ph === 3) && !st.bossSpawned) {
      st.targets.push(makeBoss());
      st.bossSpawned = true;
      if (!reducedMotion()) st.camKick = (st.camKick || 0) + 0.09; // entrance zoom
      st.floaters.push({ x: W / 2, y: 210, vy: -40, life: 2, text: 'BOSS!', big: true, color: '#ff5fa2' });
      AUDIO.roundEnd();
      AUDIO.voice('boss_appear');
      st.spawnCooldown = 0.6;
      return;
    }

    if (st.rules.bossAtStart) { st.spawnCooldown = 5; return; }

    var bullseyes = live.filter(function (t) { return t.type === 'bullseye'; }).length;
    var want = ph === 1 ? 3 : ph === 2 ? 3 : 4;

    if (bullseyes < want) {
      var kind = 'static';
      if (ph >= 2) kind = pick(['slide', 'swing', 'slide']);
      if (ph === 3) kind = pick(['slide', 'swing']);
      // Sometimes one of Penny's drawings takes the bullseye's place --
      // only from phase 2 on, and never more than two at once.
      var doodlesLive = live.filter(function (t) { return t.type === 'doodle'; }).length;
      if (ph >= 2 && doodlesLive < 2 && SPRITES.doodles().length && rng() < 0.1) {
        st.targets.push(makeDoodle(pick(SPRITES.doodles())));
        st.spawnCooldown = 0.35;
        return;
      }
      var bye = makeBullseye(kind);
      st.targets.push(bye);
      // Phase 2+: sometimes an orbiting wooden shield — trick shot time!
      if (ph >= 2 && kind !== 'static' && !bye.far &&
          rng() < (TUNING.OBSTACLE_CHANCE || 0)) {
        st.targets.push(makeShield(bye));
      }
      st.spawnCooldown = 0.35;
      return;
    }

    if (st.rules.specialRule === 'balloons') {
      if (live.filter(function (t) { return t.type === 'balloon'; }).length < 5) st.targets.push(makeBalloon());
      st.spawnCooldown = 0.65;
      return;
    }
    if (st.rules.specialRule === 'fruit') {
      if (live.filter(function (t) { return t.type === 'fruit'; }).length < 5) st.targets.push(makeFruit());
      st.spawnCooldown = 0.55;
      return;
    }

    // rare goodies: the Golden Banana and power-ups
    if (ph >= 2 && !live.some(function (t) { return t.type === 'golden'; }) && rng() < 0.02) {
      st.targets.push(makeGolden()); st.spawnCooldown = 3; return;
    }
    if (!live.some(function (t) { return t.type === 'powerup'; }) && rng() < 0.015) {
      st.targets.push(makePowerup()); st.spawnCooldown = 3; return;
    }

    // bonus objects
    var balloons = live.filter(function (t) { return t.type === 'balloon'; }).length;
    var chests = live.filter(function (t) { return t.type === 'chest'; }).length;
    var roll = rng();

    if (ph === 1) {
      if (balloons < 1 && roll < 0.4) { st.targets.push(makeBalloon()); st.spawnCooldown = 2.5; }
      else st.spawnCooldown = 1;
    } else if (ph === 2) {
      var walls2 = live.filter(function (t) { return t.type === 'obstacle' && t.kind === 'wall'; }).length;
      if (walls2 < 1 && roll < (TUNING.WALL_CHANCE || 0.22)) { st.targets.push(makeWall()); st.spawnCooldown = 2.8; }
      else if (balloons < 2 && roll < 0.35) { st.targets.push(makeBalloon()); st.spawnCooldown = 1.6; }
      else if (roll < 0.55) { st.targets.push(makeFruit()); st.spawnCooldown = 2.2; }
      else if (chests < 1 && roll < 0.68) { st.targets.push(makeChest()); st.spawnCooldown = 4; }
      else st.spawnCooldown = 0.9;
    } else {
      var walls3 = live.filter(function (t) { return t.type === 'obstacle' && t.kind === 'wall'; }).length;
      if (walls3 < 2 && roll < (TUNING.WALL_CHANCE || 0.22) * 1.2) { st.targets.push(makeWall()); st.spawnCooldown = 2.0; }
      else if (balloons < 3 && roll < 0.35) { st.targets.push(makeBalloon()); st.spawnCooldown = 1.0; }
      else if (roll < 0.65) { st.targets.push(makeFruit()); st.spawnCooldown = 1.2; }
      else if (chests < 2 && roll < 0.8) { st.targets.push(makeChest()); st.spawnCooldown = 2.5; }
      else st.spawnCooldown = 0.6;
    }
  }

  // A target left the arena without being shot (balloon floated off, fruit
  // splatted, plane flew home). In Marathon each escape costs one of the three
  // hearts; other modes just let it go quietly.
  function escapeTarget(t) {
    t.dead = true;
    if (!st.rules.endless || t.escapedCounted) return;
    // Gifts never count against you, and neither do perk-spawned bonus fruit.
    if (t.type === 'powerup' || t.bonusFruit) return;
    t.escapedCounted = true;
    st.escaped++;
    // Soft feedback only — Marathon ends when arrows run out, not on escapes.
  }


  // ---- Boss telegraphed attacks (one readable move each) ----
  function updateBossAttack(t, dt, frozen) {
    if (!t.atkKind || frozen) return;
    if (t.atkPhase === 'charge') return; // motion handled in updateTarget
    var cd = (resolveBossDef(t.bossId).attack || {}).cooldown || TUNING.BOSS_ATTACK_COOLDOWN;
    var tele = t.atkTele || TUNING.BOSS_ATTACK_TELEGRAPH;
    if (t.atkPhase === 'idle') {
      t.atkCd -= dt;
      t.atkGlow = Math.max(0, (t.atkGlow || 0) - dt);
      if (t.atkCd <= 0) {
        t.atkPhase = 'windup';
        t.atkT = tele;
        t.atkGlow = 1;
        AUDIO.tick();
        st.floaters.push({
          x: t.x, y: t.y - t.r - 70, vy: -40, life: 1.1,
          text: t.atkKind === 'slam' ? 'SLAM!' : t.atkKind === 'charge' ? 'CHARGE!' : 'SPIT!',
          big: true, color: '#ff8ad4'
        });
      }
      return;
    }
    if (t.atkPhase === 'windup') {
      t.atkT -= dt;
      t.atkGlow = 0.55 + 0.45 * Math.sin(st.t * 14);
      if (t.atkT <= 0) fireBossAttack(t);
      return;
    }
    if (t.atkPhase === 'recover') {
      t.atkT -= dt;
      t.atkGlow = Math.max(0, (t.atkGlow || 0) - dt * 1.5);
      if (t.atkT <= 0) {
        t.atkPhase = 'idle';
        t.atkCd = cd;
        t.atkGlow = 0;
      }
    }
  }

  function fireBossAttack(t) {
    var kind = t.atkKind;
    t.atkGlow = 1;
    if (kind === 'slam') {
      // Lob a slow stone arc toward the player side — shoot it for a bonus!
      var tx = BOW.x + 80 + rand(-40, 80);
      var ty = GROUND - 10;
      var T = 1.15;
      var vx = (tx - t.x) / T;
      var vy = (ty - t.y) / T - 0.5 * 520 * T;
      st.targets.push({
        type: 'bossShot', kind: 'stone', dead: false, hp: 1, frozenUntil: 0,
        x: t.x - 30, y: t.y - 40, r: 28,
        vx: vx, vy: vy, grav: 520, life: 2.4,
        color: '#b8c4d4', bonus: TUNING.BOSS_STONE_BONUS || 75
      });
      AUDIO.thunk();
      t.atkPhase = 'recover';
      t.atkT = 0.7;
    } else if (kind === 'charge') {
      t.chargeHomeX = t.baseX;
      t.chargeTargetX = Math.max(260, BOW.x + 160);
      t.chargeDir = t.chargeTargetX < t.x ? -1 : 1;
      t.chargeVx = t.chargeDir * (TUNING.BOSS_CHARGE_SPEED || 520);
      t.atkPhase = 'charge';
      t.atkT = 1.1;
      addShake(0.18);
      AUDIO.roundEnd();
    } else if (kind === 'spit') {
      var sx = BOW.x + 60 + rand(-30, 50);
      var sy = GROUND - 20;
      var TT = 1.25;
      var svx = (sx - t.x) / TT;
      var svy = (sy - t.y) / TT - 0.5 * 380 * TT;
      st.targets.push({
        type: 'bossShot', kind: 'spit', dead: false, hp: 1, frozenUntil: 0,
        x: t.x - 20, y: t.y - 50, r: 24,
        vx: svx, vy: svy, grav: 380, life: 2.6,
        color: '#62e6ff', bonus: 60
      });
      AUDIO.pop();
      t.atkPhase = 'recover';
      t.atkT = 0.65;
    } else {
      t.atkPhase = 'idle';
      t.atkCd = TUNING.BOSS_ATTACK_COOLDOWN;
    }
  }

  function updateTarget(t, dt) {
    var frozen = st.t < t.frozenUntil;
    var sm = st.t < st.slowUntil ? 0.4 : 1;   // slow-motion power-up
    dt *= sm * st.rules.targetSpeed;
    if (!frozen) t.mt = (t.mt || 0) + dt;
    t.wobble = Math.max(0, (t.wobble || 0) - dt * 4);
    t.hitFlash = Math.max(0, (t.hitFlash || 0) - dt * 4.5);

    if (t.type === 'bullseye' || t.type === 'boss' || t.type === 'doodle') {
      if (t.type === 'boss' && t.atkPhase === 'charge' && !frozen) {
        // Crab rush: fly toward the bow, then ease home.
        t.atkT -= dt;
        t.x += t.chargeVx * dt;
        if ((t.chargeDir < 0 && t.x <= t.chargeTargetX) ||
            (t.chargeDir > 0 && t.x >= t.chargeTargetX) ||
            t.atkT <= 0) {
          t.atkPhase = 'recover';
          t.atkT = 0.55;
          t.baseX = t.chargeHomeX;
          t.mt = 0;
        }
      } else if (t.motion === 'slide' && !frozen && t.atkPhase !== 'charge') {
        t.x = t.baseX + Math.sin(t.mt * t.speed) * t.range;
      } else if (t.motion === 'swing') {
        var th = Math.sin(t.mt * t.speed) * t.amp;
        t.x = t.anchor.x + Math.sin(th) * t.len;
        t.y = t.anchor.y + Math.cos(th) * t.len;
      }
      if (t.type === 'boss') updateBossAttack(t, dt, frozen);
    } else if (t.type === 'bossShot') {
      if (!frozen) {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.vy += (t.grav || 0) * dt;
        t.life -= dt;
      }
      if (t.life <= 0 || t.y > GROUND + 40 || t.x < -80 || t.x > W + 80) {
        // Harmless thud — shake + sparkle, never player damage.
        if (!t.burst) {
          addShake(0.28);
          AUDIO.thunk();
          burst(t.x, Math.min(t.y, GROUND), t.color || '#c9a07a');
          st.floaters.push({
            x: Math.max(120, Math.min(W - 120, t.x)), y: Math.min(t.y, GROUND) - 40,
            vy: -50, life: 1.0, text: 'THUD!', big: false, color: '#c9a07a'
          });
        }
        t.dead = true;
      }
    } else if (t.type === 'balloon') {
      if (!frozen) {
        t.y += t.vy * dt;
        t.x += Math.sin(t.mt * 2 + t.sway) * 30 * dt;
      }
      if (t.y < -80) escapeTarget(t); // floated away
    } else if (t.type === 'fruit' || t.type === 'golden') {
      if (!frozen) {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.vy += 700 * dt;
      }
      if (t.y > GROUND + 80) escapeTarget(t); // fell
    } else if (t.type === 'powerup') {
      if (!frozen) {
        t.y += t.vy * dt;
        t.x += Math.sin(t.mt * 1.6 + t.sway) * 26 * dt;
      }
      if (t.y < -70) escapeTarget(t); // floated away
    } else if (t.type === 'plane') {
      if (t.tumble) {
        // shot down: nose-dive off the side of the world
        t.vy += 900 * dt;
        t.x += t.vx * dt; t.y += t.vy * dt;
        t.rot += t.vr * dt;
        if (t.y > H + 150) t.dead = true;
      } else {
        t.x += t.vx * dt;
        // gentle sine bob + a little rocking, like riding a breeze
        var bob = reducedMotion() ? 0 : Math.sin(t.mt * 2.1 + t.seed) * 26;
        t.y = t.baseY + bob;
        t.rot = reducedMotion() ? 0 : Math.sin(t.mt * 2.1 + t.seed + Math.PI / 2) * 0.09;
        if (t.x < -120) escapeTarget(t); // flew offscreen
      }
    } else if (t.type === 'chest' && t.opened) {
      t.openTimer -= dt;
      if (t.openTimer <= 0) t.dead = true; // fully-open reveal finished
    } else if (t.type === 'obstacle') {
      if (t.kind === 'shield') {
        var host = t.host;
        if (!host || host.dead) { t.dead = true; return; }
        if (!frozen) t.angle += t.orbitSpeed * dt;
        t.x = host.x + Math.cos(t.angle) * t.orbitR;
        t.y = host.y + Math.sin(t.angle) * t.orbitR * 0.72; // slight ellipse so it reads in front/behind
      }
      // walls stay put
    }
  }

  /* ============ shooting ============ */

  function fireArrow() {
    if (st.arrowsLeft <= 0 || st.aim.power < 0.12) { st.aiming = false; return; }
    st.arrowsLeft--;
    st.stats.shots++;
    var a = st.arrowType;
    var speedFactor = a.speedFactor * (1 + (st.perk.speedBonus || 0));
    var speed = (650 + st.aim.power * 1450) * speedFactor;
    st.arrows.push({
      x: BOW.x, y: BOW.y,
      vx: Math.cos(st.aim.angle) * speed,
      vy: Math.sin(st.aim.angle) * speed,
      pierceLeft: a.pierce ? 1 : 0,
      blackholeSpent: false,
      dead: false, t: 0
    });
    AUDIO.shoot();
    st.aiming = false;
    st.releaseKick = 1;
    // camera punch on release; the LAST arrow gets a dramatic slow-send
    if (!reducedMotion()) {
      st.camKick = (st.camKick || 0) + 0.045;
      if (st.arrowsLeft === 0) {
        st.cinematicUntil = Math.max(st.cinematicUntil, st.t + 0.16);
        st.camKick += 0.05;
      }
    }
  }

  function arrowGravity() {
    return GRAVITY * st.arrowType.gravityFactor * (1 - (st.perk.gravityCut || 0));
  }

  // Wind is a sideways gravity: a constant horizontal acceleration that every
  // arrow feels for its whole flight. simStep is shared by the real arrows AND
  // the aim-preview dots, so preview = truth automatically.
  function arrowWind() {
    return st.rules.wind || 0;
  }

  function simStep(p, dt) {
    p.vy += arrowGravity() * dt;
    p.vx += arrowWind() * dt;   // wind bends the flight path sideways
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  function segCircle(x1, y1, x2, y2, cx, cy, r) {
    // distance from circle center to segment; returns closest point if hit
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy || 1;
    var u = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
    var px = x1 + u * dx, py = y1 + u * dy;
    var d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    return d2 <= r * r ? { x: px, y: py } : null;
  }

  function updateArrows(dt) {
    st.arrows.forEach(function (ar) {
      if (ar.dead) return;
      ar.t += dt;
      var ox = ar.x, oy = ar.y;
      simStep(ar, dt);

      // Obstacles block first — wooden shields & stone walls SNAP the arrow.
      for (var oi = 0; oi < st.targets.length; oi++) {
        var obs = st.targets[oi];
        if (obs.dead || obs.type !== 'obstacle') continue;
        var ohit = hitObstacle(ox, oy, ar.x, ar.y, obs);
        if (ohit) {
          ar.hitSomething = true;
          ar.dead = true;
          snapArrow(ohit.x, ohit.y, Math.atan2(ar.vy, ar.vx), st.arrowType);
          st.floaters.push({
            x: ohit.x, y: ohit.y - 50, vy: -60, life: 0.9,
            text: obs.kind === 'wall' ? 'ARC OVER!' : 'BLOCKED!',
            big: false, color: '#c9a07a'
          });
          break;
        }
      }
      if (ar.dead) return;

      // hit targets (swept)
      for (var i = 0; i < st.targets.length; i++) {
        var t = st.targets[i];
        if (t.dead || t.type === 'obstacle') continue;
        var hit = segCircle(ox, oy, ar.x, ar.y, t.x, t.y, t.r);
        if (hit) {
          ar.hitSomething = true;
          onHit(t, hit, ar);
          // Soft targets pop and let the arrow keep flying; it only stops on
          // real targets (bullseyes, chests, boss). Doodles are paper: soft.
          var soft = (t.type === 'balloon' || t.type === 'fruit' ||
                      t.type === 'golden' || t.type === 'powerup' ||
                      t.type === 'doodle' || t.type === 'bossShot');
          if (!soft) {
            if (ar.pierceLeft > 0) { ar.pierceLeft--; flame(hit.x, hit.y); }
            else { ar.dead = true; }
            if (ar.dead) break;
          }
        }
      }

      // The penguins' plane flies above everything: hit it for bonus points,
      // but arrows never stop for it (it's a soft, friendly target).
      for (var pj = 0; pj < st.planes.length; pj++) {
        var pl = st.planes[pj];
        if (pl.dead || pl.tumble) continue;
        var phit = segCircle(ox, oy, ar.x, ar.y, pl.x, pl.y, pl.r);
        if (phit) {
          ar.hitSomething = true;
          onHit(pl, phit, ar);
        }
      }

      if (!ar.dead && ar.y > GROUND + 6) { // stick in the dirt
        ar.dead = true;
        dust(ar.x, GROUND);
        AUDIO.thunk();
        if (!ar.hitSomething) comboMiss();
      }
      if (!ar.dead && (ar.x > W + 100 || ar.x < -100 || ar.y < -2000)) {
        ar.dead = true;
        if (!ar.hitSomething) comboMiss();
      }
    });
    st.arrows = st.arrows.filter(function (a) { return !a.dead || a.t < 0.05; });
  }

  /* ============ scoring ============ */

  function award(points, x, y, opts) {
    opts = opts || {};
    var mult = 1 + st.arrowType.scoreBonus;
    if (opts.moving) mult *= TUNING.MOVING_TARGET_MULTIPLIER;
    if (opts.far) mult *= TUNING.FAR_TARGET_MULTIPLIER || 1;
    if (opts.bonusObj) mult *= 1 + (st.perk.bonusObjBonus || 0);
    mult *= st.comboMult;
    if (opts.half) mult *= 0.5;
    var final = Math.round(points * mult);
    st.score += final;
    st.floaters.push({
      x: x, y: y, vy: -90, life: 1.1,
      text: '+' + final,
      big: final >= 150,
      color: opts.half ? '#ffe33a' : (final >= 150 ? '#ffd23a' : '#ffffff')
    });
    if (!opts.noCombo) bumpCombo();
    return final;
  }

  /* ============ combo + badges ============ */

  function bumpCombo() {
    st.combo++;
    if (st.combo > st.bestCombo) st.bestCombo = st.combo;
    var m = Math.min(TUNING.COMBO_MAX, 1 + Math.floor(st.combo / TUNING.COMBO_STEP));
    if (m > st.comboMult) {
      st.comboMult = m;
      st.floaters.push({ x: W / 2, y: 160, vy: -45, life: 1.2, text: 'COMBO x' + m + '!', big: true, color: '#ff8a3a' });
      AUDIO.coin();
      if (m >= 5) earn('combo_x5');
    } else {
      st.comboMult = m;
    }
  }

  function comboMiss() {
    st.stats.misses++;
    st.combo = 0;
    st.comboMult = 1;
  }

  // bump a lifetime stat and, if a badge threshold is crossed, earn it
  function track(stat, badge, threshold) {
    var total = SAVE.recordStat(stat, 1);
    if (badge && total >= threshold) earn(badge);
  }

  function earn(badgeId) {
    if (!SAVE.earnBadge(badgeId)) return; // already had it
    var b = DATA.badgeById(badgeId);
    if (!b) return;
    st.floaters.push({ x: W / 2, y: 120, vy: -30, life: 2.2, text: b.emoji + ' ' + b.name + '!', big: true, color: '#ffe33a' });
    AUDIO.chest();
  }

  function spawnCoins(n, x, y) {
    for (var i = 0; i < n; i++) {
      st.coins.push({
        x: x, y: y,
        vx: rand(-220, 220), vy: rand(-420, -120),
        t: 0, phase: 'burst'
      });
    }
  }

  /* ============ obsidian black hole ============ */

  function spawnBlackhole(x, y) {
    st.blackholes.push({
      x: x,
      y: y,
      t: 0,
      life: TUNING.BLACKHOLE_TIME,
      eaten: 0,
      spin: rand(-1, 1) < 0 ? -1 : 1,
      seed: rand(0, Math.PI * 2)
    });
    AUDIO.zap();
    addShake(0.24);
    earn('blackhole');
  }

  // award + destroy a single target that got pulled into the hole
  function consumeByHole(o) {
    if (o.type === 'bullseye') {
      award(TUNING.SCORE_BULLSEYE_RINGS[0], o.x, o.y - o.r, {}); splinters(o.x, o.y); o.dead = true;
    } else if (o.type === 'balloon') {
      award(TUNING.SCORE_BALLOON, o.x, o.y, { bonusObj: true }); balloonPop(o.x, o.y, o.color);
      spawnCoins(TUNING.COINS_FROM_BALLOON, o.x, o.y); o.dead = true; track('balloons', 'balloons_50', 50);
    } else if (o.type === 'fruit') {
      award(o.value, o.x, o.y, { bonusObj: true }); fruitSplat(o); o.dead = true; track('fruits', 'fruits_100', 100);
    } else if (o.type === 'golden') {
      award(TUNING.SCORE_GOLDEN, o.x, o.y, { bonusObj: true }); burst(o.x, o.y, '#ffd23a');
      spawnCoins(12, o.x, o.y); o.dead = true; st.stats.golden = (st.stats.golden || 0) + 1; earn('golden');
    } else if (o.type === 'chest') {
      award(TUNING.SCORE_CHEST, o.x, o.y, { bonusObj: true }); spawnCoins(TUNING.COINS_FROM_CHEST, o.x, o.y);
      o.dead = true; track('chests', 'chests_10', 10);
    } else if (o.type === 'doodle') {
      award(o.points || 40, o.x, o.y, { bonusObj: true }); burst(o.x, o.y, '#9fd636'); o.dead = true;
    } else if (o.type === 'powerup') {
      applyPowerup(o); // trigger its effect (no recursive black hole)
    }
  }

  function updateBlackholes(dt) {
    st.blackholes.forEach(function (bh) {
      bh.t += dt; // runs in real time, not affected by slow-mo
      if (bh.eaten == null) bh.eaten = 0;
      if (!bh.spin) bh.spin = 1;
      if (bh.seed == null) bh.seed = 0;
      st.targets.forEach(function (o) {
        if (o.dead || o.type === 'boss') return; // the boss is too big to pull
        if (bh.eaten >= TUNING.BLACKHOLE_MAX_EATS) return;
        var dx = bh.x - o.x, dy = bh.y - o.y;
        var dist = Math.hypot(dx, dy) || 0.001;
        if (dist < TUNING.BLACKHOLE_RADIUS) {
          // Pause the target's own pattern while it is inside the pull,
          // but let moving targets resume afterward.
          o.frozenUntil = st.t + 0.05;
          var pull = TUNING.BLACKHOLE_PULL * Math.pow(1 - dist / TUNING.BLACKHOLE_RADIUS, 1.35);
          var swirl = Math.min(1.8, pull * 0.55);
          var nx = dx / dist, ny = dy / dist;
          o.x += (nx * pull + -ny * swirl * bh.spin) * 60 * dt;
          o.y += (ny * pull + nx * swirl * bh.spin) * 60 * dt;
          if (dist < 28) {
            consumeByHole(o);
            if (o.dead) {
              bh.eaten++;
              bh.pulse = 0.16;
            }
          }
        }
      });
      bh.pulse = Math.max(0, (bh.pulse || 0) - dt);
    });
    st.blackholes = st.blackholes.filter(function (bh) { return bh.t < bh.life; });
  }

  function applyPowerup(t) {
    t.dead = true;
    AUDIO.coin();
    ring(t.x, t.y, '#62e6ff');
    if (t.kind === 'arrows') {
      st.arrowsLeft += TUNING.POWERUP_ARROWS;
      st.floaters.push({ x: t.x, y: t.y - 40, vy: -60, life: 1.4, text: '+' + TUNING.POWERUP_ARROWS + ' ARROWS!', big: true, color: '#9fd636' });
    } else {
      st.slowUntil = st.t + TUNING.POWERUP_SLOWMO_TIME;
      st.floaters.push({ x: t.x, y: t.y - 40, vy: -60, life: 1.4, text: 'SLOW-MO!', big: true, color: '#62e6ff' });
    }
  }

  function onHit(t, hit, ar) {
    st.stats.hits++;
    var moving = t.type === 'bullseye' && t.motion !== 'static' && st.t >= t.frozenUntil;

    if (t.type === 'bossShot') {
      // Burst the telegraphed projectile mid-air for a bonus — kids' win!
      t.dead = true; t.burst = true;
      award(t.bonus || 75, t.x, t.y - 20, { bonusObj: true });
      AUDIO.coin();
      ring(t.x, t.y, t.color || '#ffd23a');
      burst(t.x, t.y, t.color || '#ffd23a');
      st.floaters.push({
        x: t.x, y: t.y - 50, vy: -60, life: 1.2,
        text: t.kind === 'spit' ? 'BLOCKED!' : 'STONE BURST!',
        big: true, color: '#ffd23a'
      });
      return;
    }

    if (t.type === 'bullseye') {
      var d = Math.hypot(hit.x - t.x, hit.y - t.y) / t.r;
      var rings = TUNING.SCORE_BULLSEYE_RINGS;
      var base = d < 0.25 ? rings[0] : d < 0.5 ? rings[1] : d < 0.75 ? rings[2] : rings[3];
      var pts = award(base, t.x, t.y - t.r - 10, { moving: moving, far: !!t.far });
      t.dead = true;
      splinters(hit.x, hit.y);
      if (t.far) {
        st.floaters.push({ x: t.x, y: t.y - t.r - 34, vy: -60, life: 1.2, text: 'LONG SHOT!', big: true, color: '#8fdcff' });
      }
      if (base === rings[0]) {
        st.stats.bullseyes++; st.petCheer = 1;
        st.cinematicUntil = reducedMotion() ? st.t : st.t + 0.34;
        if (!reducedMotion()) st.camKick = (st.camKick || 0) + 0.05;
        AUDIO.bullseye();
        addShake(0.35);
        bullseyeJuice(t);
        st.floaters.push({ x: t.x, y: t.y - t.r - 56, vy: -70, life: 1.3, text: 'BULLSEYE!', big: true, color: '#ffd23a' });
        earn('first_bullseye');
        characterMoment(t.x, t.y - t.r - 95);
        // Marathon: a true bullseye gifts another arrow so the run keeps going!
        if (st.rules.endless) {
          var ba = TUNING.MARATHON_BULLSEYE_ARROWS || 1;
          st.arrowsLeft += ba;
          st.floaters.push({
            x: t.x, y: t.y - t.r - 90, vy: -55, life: 1.2,
            text: '+' + ba + ' ARROW!', big: false, color: '#9fd636'
          });
        }
      } else {
        AUDIO.thunk();
      }
    } else if (t.type === 'balloon') {
      st.stats.balloons++;
      award(TUNING.SCORE_BALLOON, t.x, t.y, { bonusObj: true });
      t.dead = true;
      AUDIO.pop();
      balloonPop(t.x, t.y, t.color);
      spawnCoins(TUNING.COINS_FROM_BALLOON, t.x, t.y);
      track('balloons', 'balloons_50', 50);
    } else if (t.type === 'doodle') {
      // Same scoring path as a balloon: award() handles the combo multiplier
      // and the floating "+N" text; we just add the pop and the confetti.
      st.stats.doodles++;
      award(t.points || 40, t.x, t.y - 10, { bonusObj: true });
      t.dead = true;
      AUDIO.pop();
      burst(t.x, t.y, '#9fd636');
      ring(t.x, t.y, '#9fd636');
      st.floaters.push({ x: t.x, y: t.y - t.r - 34, vy: -60, life: 1.2, text: "PENNY'S DOODLE!", big: true, color: '#9fd636' });
    } else if (t.type === 'fruit') {
      st.stats.fruits++;
      award(t.value, t.x, t.y, { bonusObj: true });
      t.dead = true;
      AUDIO.splat();
      fruitSplat(t);
      track('fruits', 'fruits_100', 100);
    } else if (t.type === 'golden') {
      award(TUNING.SCORE_GOLDEN, t.x, t.y - 20, { bonusObj: true });
      t.dead = true;
      AUDIO.chest();
      addShake(0.3);
      ring(t.x, t.y, '#ffd23a');
      burst(t.x, t.y, '#ffd23a');
      spawnCoins(12, t.x, t.y);
      st.floaters.push({ x: t.x, y: t.y - 60, vy: -60, life: 1.5, text: 'GOLDEN!', big: true, color: '#ffd23a' });
      st.stats.golden = (st.stats.golden || 0) + 1;
      earn('golden');
      // Marathon: golden banana is the big arrow jackpot!
      if (st.rules.endless) {
        var ga = TUNING.MARATHON_GOLDEN_ARROWS || 3;
        st.arrowsLeft += ga;
        st.floaters.push({
          x: t.x, y: t.y - 95, vy: -55, life: 1.4,
          text: '+' + ga + ' ARROWS!', big: true, color: '#9fd636'
        });
      }
    } else if (t.type === 'powerup') {
      applyPowerup(t);
    } else if (t.type === 'plane') {
      // Sky hit! The plane tumbles away with a confetti burst.
      st.stats.planes = (st.stats.planes || 0) + 1;
      award(75, t.x, t.y - 30, { bonusObj: true });
      t.tumble = true;
      t.vx *= 0.4;
      t.vy = -220;
      t.vr = rand(-11, -7);          // spins nose-down as it falls
      AUDIO.coin();
      ring(t.x, t.y, '#62e6ff');
      burst(t.x, t.y, '#9fdcff');
      burst(t.x, t.y, '#ffd23a');
      addShake(0.18);
      st.floaters.push({ x: t.x, y: t.y - 60, vy: -60, life: 1.3, text: 'SKY HIT!', big: true, color: '#62e6ff' });
    } else if (t.type === 'boss') {
      t.hp--;
      t.wobble = 1;
      t.hitFlash = 0.28;
      t.hitSide = hit.x < t.x ? -1 : 1;
      stoneChips(hit.x, hit.y, t.hp <= 0 ? 22 : 13);
      bossCrackPulse(t.x, t.y, t.hp / t.maxHp);
      if (t.hp <= 0) {
        st.stats.bossDefeated = true;
        award(TUNING.SCORE_BOSS, t.x, t.y - t.r - 20, {});
        t.dead = true;
        AUDIO.chest();
        addShake(0.5);
        // slow-mo shatter: the kill gets a beat to land
        if (!reducedMotion()) {
          st.cinematicUntil = Math.max(st.cinematicUntil, st.t + 0.3);
          st.camKick = (st.camKick || 0) + 0.06;
        }
        ring(t.x, t.y, '#ffd23a');
        burst(t.x, t.y, '#ff5fa2');
        bossDefeatBurst(t.x, t.y);
        spawnCoins(20, t.x, t.y);
        st.floaters.push({ x: t.x, y: t.y - t.r, vy: -50, life: 1.8, text: 'BOSS DOWN!', big: true, color: '#ffd23a' });
        earn('boss');
        AUDIO.voice('boss_down');
      } else {
        if (AUDIO.bossHit) AUDIO.bossHit(); else AUDIO.thunk();
        addShake(0.24);
        award(25, hit.x, hit.y - 10, {});
        snapArrow(hit.x, hit.y, Math.atan2(ar.vy, ar.vx), st.arrowType);
        // RAGE PHASE: below half health the boss doubles down — spawns come
        // faster and he lets you know it
        if (t.hp <= t.maxHp / 2 && !st.bossRage) {
          st.bossRage = true;
          addShake(0.32);
          if (!reducedMotion()) st.camKick = (st.camKick || 0) + 0.05;
          st.floaters.push({ x: W / 2, y: 250, vy: -42, life: 1.6, text: 'HE IS FURIOUS!', big: true, color: '#ff5f4a' });
        }
      }
    } else if (t.type === 'chest') {
      t.hp--;
      t.wobble = 1;
      t.hitFlash = 0.22;
      if (t.hp <= 0) {
        st.stats.chests++;
        award(TUNING.SCORE_CHEST, t.x, t.y - 50, { bonusObj: true });
        t.opened = true;          // show the fully-open chest, then it fades
        t.openTimer = 1.35;
        t.openStart = 1.35;
        AUDIO.chest();
        ring(t.x, t.y, '#ffd23a');
        chestSparkleBurst(t.x, t.y - 38);
        spawnCoins(TUNING.COINS_FROM_CHEST, t.x, t.y - 20);
        addShake(0.3);
        track('chests', 'chests_10', 10);
      } else {
        if (AUDIO.chestCrack) AUDIO.chestCrack(); else AUDIO.thunk();
        ring(t.x, t.y - 28, '#ffd23a');
        chestCrackBurst(hit.x, hit.y);
        snapArrow(hit.x, hit.y, Math.atan2(ar.vy, ar.vx), st.arrowType);
        st.floaters.push({ x: t.x, y: t.y - 70, vy: -70, life: 0.9, text: 'One more!', color: '#fff' });
      }
    }

    // ----- obsidian black hole -----
    if (st.arrowType.blackhole && !ar.blackholeSpent) {
      spawnBlackhole(hit.x, hit.y);
      ar.blackholeSpent = true;
    }

    // ----- arrow powers -----
    if (st.arrowType.freeze && !t.dead) { /* chest survived: still freeze nothing */ }
    if (st.arrowType.freeze) {
      var dur = st.arrowType.freeze + (st.perk.freezeBonus || 0);
      AUDIO.freeze();
      st.targets.forEach(function (o) {
        if (o.dead) return;
        if (Math.hypot(o.x - hit.x, o.y - hit.y) < 260) {
          o.frozenUntil = st.t + dur;
          snow(o.x, o.y);
        }
      });
    }
    if (st.arrowType.chain) {
      var best = null, bd = 1e9;
      st.targets.forEach(function (o) {
        if (o.dead || o === t) return;
        var d2 = Math.hypot(o.x - hit.x, o.y - hit.y);
        if (d2 < bd && d2 < 600) { bd = d2; best = o; }
      });
      if (best) {
        AUDIO.zap();
        st.bolts.push({ x1: hit.x, y1: hit.y, x2: best.x, y2: best.y, life: 0.25 });
        var fake = { x: best.x, y: best.y }; // count as a center-ish hit for points
        var was = st.arrowType; // keep bonuses
        if (best.type === 'bullseye') {
          award(TUNING.SCORE_BULLSEYE_RINGS[1], best.x, best.y - best.r, { half: true });
          best.dead = true;
          splinters(best.x, best.y);
        } else if (best.type === 'balloon') {
          award(TUNING.SCORE_BALLOON, best.x, best.y, { half: true, bonusObj: true });
          best.dead = true; AUDIO.pop(); burst(best.x, best.y, best.color);
          track('balloons', 'balloons_50', 50);
        } else if (best.type === 'doodle') {
          award(best.points || 40, best.x, best.y, { half: true, bonusObj: true });
          best.dead = true; AUDIO.pop(); burst(best.x, best.y, '#9fd636');
        } else if (best.type === 'fruit') {
          award(best.value, best.x, best.y, { half: true, bonusObj: true });
          best.dead = true; fruitSplat(best);
          track('fruits', 'fruits_100', 100);
        } else if (best.type === 'chest') {
          best.hp--; best.wobble = 1; best.hitFlash = 0.2;
          if (best.hp <= 0) {
            award(TUNING.SCORE_CHEST, best.x, best.y - 50, { half: true, bonusObj: true });
            best.opened = true; best.openTimer = 1.1; best.openStart = 1.1; AUDIO.chest();
            chestSparkleBurst(best.x, best.y - 38);
            spawnCoins(Math.ceil(TUNING.COINS_FROM_CHEST / 2), best.x, best.y - 20);
            track('chests', 'chests_10', 10);
          } else {
            if (AUDIO.chestCrack) AUDIO.chestCrack();
            ring(best.x, best.y - 28, '#ffd23a');
            chestCrackBurst(best.x, best.y);
            snapArrow(best.x, best.y, Math.atan2(best.y - hit.y, best.x - hit.x), st.arrowType);
          }
        }
      }
    }
  }

  function characterMoment(x, y) {
    var moments = {
      dinobob: ['ROAR-SOME!', '#9fd636'],
      ninja: ['SHADOW SHOT!', '#ff5f5f'],
      astronaut: ['TO THE MOON!', '#8fdcff'],
      robot: ['CALCULATED!', '#62e6ff'],
      bear: ['BEAR-Y NICE!', '#ffd23a'],
      trixie: ['TA-DA!', '#ff8ad4']
    };
    var m = moments[st.char.id] || moments.dinobob;
    st.floaters.push({ x: x, y: y, vy: -55, life: 1.15, text: m[0], big: true, color: m[1] });
    if (st.char.id === 'dinobob') spawnCoins(1, x, y + 45);
    if (st.char.id === 'astronaut') st.slowUntil = Math.max(st.slowUntil, st.t + 1.25);
    if (st.char.id === 'robot') { st.time += 0.75; ring(x, y + 40, '#62e6ff'); }
    if (st.char.id === 'bear') {
      st.targets.forEach(function (o) { if (!o.dead) o.frozenUntil = Math.max(o.frozenUntil, st.t + 0.9); });
      snow(x, y + 45);
    }
    if (st.char.id === 'ninja') { st.arrowsLeft++; flame(x, y + 45); }
    if (st.char.id === 'trixie') {
      st.targets.push(makeBonusFruit(x, y + 40));
      ring(x, y + 40, '#ff8ad4');
    }
  }

  /* ============ particles ============ */

  function part(x, y, vx, vy, life, color, r, grav) {
    st.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, r: r, grav: grav !== false });
  }
  function splinters(x, y) {
    for (var i = 0; i < motionCount(10); i++) part(x, y, rand(-260, 260), rand(-320, 60), rand(0.3, 0.7), pick(['#a06a35', '#8a5a2b', '#e8dccb']), rand(2, 5));
  }
  function stoneChips(x, y, n) {
    for (var i = 0; i < motionCount(n || 12); i++) {
      part(x, y, rand(-310, 310), rand(-360, 80), rand(0.34, 0.78), pick(['#8fa89e', '#5f7c76', '#d1ddd2', '#74d8cc']), rand(3, 8));
    }
  }
  function bossCrackPulse(x, y, healthFrac) {
    ring(x, y, healthFrac < 0.35 ? '#ffd23a' : '#62e6ff');
    if (reducedMotion()) return;
    for (var i = 0; i < 9; i++) {
      var a = i * Math.PI * 2 / 9 + rand(-0.18, 0.18);
      part(x + Math.cos(a) * 24, y + Math.sin(a) * 18, Math.cos(a) * rand(90, 240), Math.sin(a) * rand(70, 190), rand(0.22, 0.45), pick(['#ffe78a', '#62e6ff', '#ffffff']), rand(2, 4), false);
    }
  }
  function bossDefeatBurst(x, y) {
    for (var i = 0; i < motionCount(34); i++) {
      var a = rand(0, Math.PI * 2);
      var sp = rand(120, 430);
      part(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, rand(0.45, 1.0), pick(['#8fa89e', '#ffd23a', '#62e6ff', '#ffffff']), rand(3, 9));
    }
  }
  function chestCrackBurst(x, y) {
    for (var i = 0; i < motionCount(20); i++) {
      part(x, y, rand(-330, 330), rand(-380, 70), rand(0.30, 0.70), pick(['#8a5a2b', '#d28b38', '#ffd23a', '#fff0a0']), rand(3, 8));
    }
  }
  function chestSparkleBurst(x, y) {
    for (var i = 0; i < motionCount(36); i++) {
      part(x, y, rand(-360, 360), rand(-460, -20), rand(0.45, 1.05), pick(['#ffd23a', '#fff2a8', '#62e6ff', '#ffffff']), rand(3, 8), false);
    }
  }
  function burst(x, y, color) {
    for (var i = 0; i < motionCount(14); i++) part(x, y, rand(-320, 320), rand(-320, 320), rand(0.25, 0.6), color, rand(3, 7));
  }
  function fruitSplat(t) {
    var colors = {
      apple: ['#e23b3b', '#f4ead2'], orange: ['#ff9a1a', '#ffd9a0'],
      watermelon: ['#ff5f7a', '#2f9d4e'], cherry: ['#c41e3a', '#e23b3b'],
      strawberry: ['#e8344e', '#ffd9e0'], banana: ['#ffd23a', '#f4ead2'],
      pear: ['#9fd636', '#eef7c8'], grapes: ['#8e4fd0', '#c9a8ff'],
      pineapple: ['#ffcf3a', '#e8a91d']
    }[t.kind] || ['#ff9a1a', '#ffd9a0'];
    for (var i = 0; i < motionCount(16); i++) part(t.x, t.y, rand(-300, 300), rand(-360, 100), rand(0.3, 0.8), pick(colors), rand(3, 8));
  }
  function dust(x, y) {
    for (var i = 0; i < motionCount(6); i++) part(x, y, rand(-90, 90), rand(-140, -30), rand(0.2, 0.5), '#cbb27e', rand(2, 5));
  }
  function flame(x, y) {
    for (var i = 0; i < motionCount(8); i++) part(x, y, rand(-140, 140), rand(-200, -40), rand(0.2, 0.5), pick(['#ff7a1a', '#ffb43a']), rand(3, 6), false);
  }
  function snow(x, y) {
    for (var i = 0; i < motionCount(8); i++) part(x, y, rand(-100, 100), rand(-160, -20), rand(0.4, 0.8), pick(['#bfeaff', '#ffffff']), rand(2, 5), false);
  }
  function ring(x, y, color, speed, lw) {
    st.particles.push({ x: x, y: y, vx: 0, vy: 0, life: 0.4, max: 0.4, color: color, ring: true, r: 10, rspeed: speed || 700, lw: lw || 6 });
  }
  function balloonPop(x, y, color) {
    // the balloon's own skin tears into curling rubber shreds
    for (var i = 0; i < motionCount(9); i++) {
      st.particles.push({
        x: x, y: y, vx: rand(-320, 320), vy: rand(-380, 60),
        life: rand(0.35, 0.7), max: 0.7, color: color, r: rand(5, 11),
        grav: true, shred: true, rot: rand(0, Math.PI * 2), vr: rand(-10, 10)
      });
    }
    ring(x, y, color);             // sharp pop ring in the balloon's color
    ring(x, y, '#ffffff', 460, 3); // plus a softer white echo
    // and the string flutters down on its own
    st.particles.push({
      x: x, y: y + 16, vx: rand(-50, 50), vy: rand(40, 110),
      life: 0.9, max: 0.9, color: '#5c1a12', r: 9,
      grav: true, string: true, rot: 0, vr: rand(-5, 5)
    });
  }
  function bullseyeJuice(t) {
    // double shockwave in the target's own colors + radial spark lines
    ring(t.x, t.y, '#ffd23a');
    ring(t.x, t.y, '#ff5fa2', 520, 3);
    for (var i = 0; i < motionCount(12); i++) {
      var a = i / 12 * Math.PI * 2 + rand(-0.12, 0.12);
      var sp = rand(260, 460);
      st.particles.push({
        x: t.x, y: t.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.18, 0.34), max: 0.34, grav: false,
        color: pick(['#ffd23a', '#fff6d0', '#ffffff']), r: rand(9, 16), line: true
      });
    }
    // one soft golden flash at the center
    st.particles.push({ x: t.x, y: t.y, vx: 0, vy: 0, life: 0.22, max: 0.22, grav: false, color: '#ffe78a', r: t.r * 0.85, flash: true });
    // Shiny perk: extra star burst + a couple of bonus coins (stacks with outfits).
    var shinyOn = st.profile && st.profile.equipped && st.profile.equipped.shiny;
    if (shinyOn && !reducedMotion()) {
      for (var si = 0; si < motionCount(16); si++) {
        var sa = si / 16 * Math.PI * 2 + rand(-0.1, 0.1);
        var ssp = rand(140, 380);
        st.particles.push({
          x: t.x, y: t.y, vx: Math.cos(sa) * ssp, vy: Math.sin(sa) * ssp - 40,
          life: rand(0.35, 0.7), max: 0.7, grav: false,
          color: pick(['#fff7c4', '#ffffff', '#ffd23a', '#62e6ff']), r: rand(3, 7), star: true,
          rot: rand(0, Math.PI), vr: rand(-5, 5)
        });
      }
      var bonus = (typeof TUNING !== 'undefined' && TUNING.SHINY_BULLSEYE_COINS) ? TUNING.SHINY_BULLSEYE_COINS : 2;
      if (bonus > 0) spawnCoins(bonus, t.x, t.y - t.r);
    }
  }
  function coinSparkle(c) {
    st.particles.push({
      x: c.x + rand(-8, 8), y: c.y + rand(-8, 8), vx: rand(-30, 30), vy: rand(-60, -10),
      life: 0.38, max: 0.38, grav: false, color: pick(['#ffd23a', '#fff2a8', '#ffffff']),
      r: rand(3, 6), star: true, rot: rand(0, Math.PI), vr: rand(-4, 4)
    });
  }

  function snapArrow(x, y, angle, type) {
    if (AUDIO.snap) AUDIO.snap(); else AUDIO.thunk();
    addShake(0.16);
    st.floaters.push({ x: x, y: y - 42, vy: -66, life: 0.7, text: 'SNAP!', big: false, color: '#ffe3a3' });
    for (var i = 0; i < motionCount(9); i++) {
      part(x, y, rand(-160, 160), rand(-230, 40), rand(0.24, 0.55), pick(['#5a321c', '#a76b36', '#f4d08a']), rand(2, 5), true);
    }
    var speed = 260;
    st.brokenArrows.push(
      { x: x - Math.cos(angle) * 10, y: y - Math.sin(angle) * 10, vx: -Math.cos(angle) * speed + rand(-70, 40), vy: -Math.sin(angle) * speed + rand(-160, -40), rot: angle + rand(-0.9, -0.35), vr: rand(-8, -4), life: 0.75, max: 0.75, side: -1, type: type },
      { x: x + Math.cos(angle) * 10, y: y + Math.sin(angle) * 10, vx: Math.cos(angle) * speed + rand(-40, 70), vy: Math.sin(angle) * speed + rand(-160, -40), rot: angle + rand(0.35, 0.9), vr: rand(4, 8), life: 0.75, max: 0.75, side: 1, type: type }
    );
  }

  function updateParticles(dt) {
    st.particles.forEach(function (p) {
      p.life -= dt;
      if (p.ring) { p.r += (p.rspeed || 700) * dt; return; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += 900 * dt;
      if (p.vr) p.rot += p.vr * dt;
    });
    st.particles = st.particles.filter(function (p) { return p.life > 0; });

    st.floaters.forEach(function (f) { f.life -= dt; f.y += f.vy * dt; });
    st.floaters = st.floaters.filter(function (f) { return f.life > 0; });

    st.bolts.forEach(function (b) { b.life -= dt; });
    st.bolts = st.bolts.filter(function (b) { return b.life > 0; });

    st.brokenArrows.forEach(function (b) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 900 * dt;
      b.rot += b.vr * dt;
    });
    st.brokenArrows = st.brokenArrows.filter(function (b) { return b.life > 0; });

    // coins: burst out, then home to the HUD counter
    st.coins.forEach(function (c) {
      c.t += dt;
      if (c.phase === 'burst') {
        c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 900 * dt;
        if (c.t > 0.45) c.phase = 'home';
      } else {
        var hx = 95, hy = 48;
        c.x += (hx - c.x) * 8 * dt;
        c.y += (hy - c.y) * 8 * dt;
        // sparkle trail while the coin flies home
        if (!reducedMotion() && st.t - (c.lastSp || 0) > 0.05) {
          c.lastSp = st.t;
          coinSparkle(c);
        }
        if (Math.hypot(c.x - hx, c.y - hy) < 30) {
          c.done = true;
          st.coinsDirect++;
          if (!updateParticles.lastCoinSfx || st.t - updateParticles.lastCoinSfx > 0.09) {
            AUDIO.coin();
            updateParticles.lastCoinSfx = st.t;
          }
        }
      }
    });
    st.coins = st.coins.filter(function (c) { return !c.done; });
  }

  /* ============ main loop ============ */

  function update(dt) {
    st.t += dt;
    st.shake = Math.max(0, st.shake - dt);
    st.petCheer = Math.max(0, (st.petCheer || 0) - dt * 1.8);
    st.releaseKick = Math.max(0, st.releaseKick - dt * 7.5);
    st.lookTimer += dt;

    // boss STOMP: the ground rumbles on his cadence while he stands
    var bossUp = null;
    for (var bi = 0; bi < st.targets.length; bi++) {
      if (st.targets[bi].type === 'boss' && !st.targets[bi].dead) { bossUp = st.targets[bi]; break; }
    }
    if (bossUp && !reducedMotion()) {
      if (st.t >= (st.nextStomp || 0)) {
        st.nextStomp = st.t + 3.4;
        addShake(0.12);
        dust(bossUp.x, GROUND - bossUp.y + bossUp.r * 1.6);
        if (AUDIO.thunk) AUDIO.thunk();
      }
    }

    // cinematic camera: drift toward the aim while drawing, ease zoom punches
    // back to rest. Photo mode and reducedMotion pin it at identity.
    if (photoMode || reducedMotion()) {
      st.camZoom = 1; st.camX = 0; st.camY = 0; st.camKick = 0;
    } else {
      var lean = st.aiming ? 1 : 0;
      var tx = lean * (st.aim.x - W / 2) * 0.045;
      var ty = lean * (st.aim.y - H * 0.6) * 0.035;
      var tz = 1 + (st.camKick || 0) + lean * 0.05;
      var k = Math.min(1, dt * 8);
      st.camZoom = (st.camZoom || 1) + (tz - (st.camZoom || 1)) * k;
      st.camX = (st.camX || 0) + (tx - (st.camX || 0)) * Math.min(1, dt * 5);
      st.camY = (st.camY || 0) + (ty - (st.camY || 0)) * Math.min(1, dt * 5);
      st.camKick = Math.max(0, (st.camKick || 0) - dt * 0.28);
    }

    if (st.countdown > 0) {
      var before = Math.ceil(st.countdown);
      st.countdown -= dt;
      if (Math.ceil(st.countdown) !== before && st.countdown > 0) AUDIO.tick();
      if (st.countdown <= 0) AUDIO.bullseye();
      return;
    }

    if (st.over) {
      st.overTimer += dt;
      updateParticles(dt);
      if (st.overTimer > 1.4) finish();
      return;
    }

    // ---- MARATHON escalation ---- a fresh wave every 30s, forever. The first
    // three waves ride the normal phase ladder (movers at 30s, chaos at 60s);
    // after that targetSpeed climbs past anything phase 3 ever reaches.
    if (st.rules.endless) {
      var wv = Math.floor(st.t / TUNING.MARATHON_WAVE_SECONDS) + 1;
      if (wv !== st.wave) {
        st.wave = wv;
        st.floaters.push({ x: W / 2, y: 210, vy: -45, life: 1.6, text: 'WAVE ' + wv + '!', big: true, color: '#ff8ad4' });
        AUDIO.tick();
      }
      st.rules.targetSpeed = st.baseSpeed * (1 + Math.max(0, wv - 3) * TUNING.MARATHON_RAMP);
    } else {
      st.time -= dt;
    }
    // urgent beeps in the final 5 seconds
    if (st.time <= 5.5 && st.time > 0) {
      var sec = Math.ceil(st.time);
      if (sec !== st.lastTickSec) { st.lastTickSec = sec; AUDIO.tick(); }
    }

    var noArrows = st.arrowsLeft <= 0 && st.arrows.every(function (a) { return a.dead; });
    var bossWon = st.rules.bossAtStart && st.stats.bossDefeated && st.arrows.every(function (a) { return a.dead; });
    // Marathon (endless): no clock — the run ends when arrows are gone.
    if ((!st.rules.endless && st.time <= 0) || noArrows || bossWon) {
      st.time = Math.max(0, st.time);
      st.over = true;
      AUDIO.roundEnd();
      if (AUDIO.music) AUDIO.music.start(); // back to the round's ambient loop
      return;
    }

    var worldDt = st.t < st.cinematicUntil ? dt * 0.18 : dt;
    spawner(worldDt);
    st.targets.forEach(function (t) { updateTarget(t, worldDt); });
    st.planes.forEach(function (pl) { updateTarget(pl, worldDt); });
    updateBlackholes(worldDt);
    st.targets = st.targets.filter(function (t) { return !t.dead; });
    st.planes = st.planes.filter(function (pl) { return !pl.dead; });
    updateArrows(worldDt);
    updateParticles(worldDt);
  }

  function finish() {
    running = false;
    clearGpPausePoll();
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    var coinsFromScore = Math.round(st.score / TUNING.SCORE_PER_COIN);
    var coinBonus = st.perk.coinBonus || 0;
    var total = Math.round((coinsFromScore + st.coinsDirect) * (1 + coinBonus));
    var isHigh = SAVE.recordRound(st.score);
    SAVE.addCoins(total);
    if (onEnd) onEnd({
      score: st.score,
      coins: total,
      coinsFromScore: coinsFromScore,
      coinsDirect: st.coinsDirect,
      arrowsLeft: st.arrowsLeft,
      roundArrows: st.rules.arrows,
      coinBonus: coinBonus,
      isHighScore: isHigh,
      highScore: SAVE.current().highScore
      , stats: Object.assign({}, st.stats, { bestCombo: st.bestCombo || 0 })
      , bestCombo: st.bestCombo || 0
      , mode: st.rules.mode
      , waves: st.wave || 1
      , escaped: st.escaped
      , label: st.rules.label
      , challengeFrom: st.rules.challengeFrom || null
    });
  }

  /* ============ photo mode + share card ============
     Entered from the pause overlay's [PHOTO] pill. The world stays frozen
     (update() gated off) but the loop keeps running so drag-to-pan and the
     ZOOM cycle redraw every frame through a transform around all world layers.
     HUD and overlays hide; only the minimal photo bar shows at the bottom. */

  function enterPhotoMode() {
    if (!running || !st || st.over || photoMode) return;
    photoMode = true;
    photoPan.x = 0; photoPan.y = 0;
    photoZoomIdx = 0;
    photoDragLast = null;
    st.aiming = false;
    cancelSynthDraw();
    AUDIO.click();
    frame.last = undefined;
    requestFrame(); // bring the loop back while paused to serve pan/zoom frames
  }

  function exitPhotoMode() {
    if (!photoMode) return;
    photoMode = false;
    photoDragLast = null;
    photoPan.x = 0; photoPan.y = 0;
    photoZoomIdx = 0;
    AUDIO.click();
    if (paused) {
      // restore the frozen pause overlay exactly as it was
      cancelFrame();
      render();
    } else {
      requestFrame();
    }
  }

  var PHOTO_MODE_NAMES = {
    practice: 'TARGET PRACTICE',
    adventure: 'ADVENTURE',
    daily: 'DAILY CHALLENGE',
    challenge: "PENNY'S CHALLENGE",
    family: 'FAMILY MATCH',
    workshop: 'BOSS WORKSHOP'
  };

  // Small DOM toast — the only feedback that works while the canvas is paused
  // (in-round floaters live in update(), which photo mode gates off).
  var photoToastEl = null;
  function photoToast(text) {
    try {
      if (photoToastEl) photoToastEl.remove();
      var el = document.createElement('div');
      el.textContent = text;
      el.style.cssText =
        'position:absolute;left:50%;bottom:130px;transform:translateX(-50%);' +
        'background:rgba(26,24,34,0.92);color:#ffd23a;font:800 20px Nunito,sans-serif;' +
        'padding:12px 26px;border-radius:999px;border:2px solid rgba(255,210,58,0.7);' +
        'z-index:30;pointer-events:none;';
      var host = document.getElementById('screen-game') || document.body;
      host.appendChild(el);
      photoToastEl = el;
      setTimeout(function () { el.remove(); if (photoToastEl === el) photoToastEl = null; }, 1700);
    } catch (err) { /* cosmetic only */ }
  }

  // SHUTTER: snapshot the main canvas at its full backing-store resolution
  // (world × devicePixelRatio), frame it in a HUD-toned card with a caption
  // strip, then hand it to the share sheet or a download fallback.
  function takePhoto() {
    try {
      var snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d').drawImage(canvas, 0, 0);
      composeShareCard(snap);
      if (!reducedMotion()) photoFlashUntil = performance.now() + 170;
      AUDIO.shoot(); // little pluck doubles as the camera chirp
    } catch (err) {
      photoToast('Photo failed — try again!');
    }
  }

  function composeShareCard(snap) {
    var PAD = 34, CAP_H = 176;
    var outW = W + PAD * 2, outH = PAD + H + CAP_H;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var out = document.createElement('canvas');
    out.width = Math.round(outW * dpr);
    out.height = Math.round(outH * dpr);
    var c = out.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // dark navy card + warm gold hairline, matching hudPanel / theme tones
    ART.rr(c, 0, 0, outW, outH, 40, '#201d2c');
    c.strokeStyle = 'rgba(255,210,58,0.85)';
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(14, 14, outW - 28, outH - 28, 30);
    c.stroke();

    // the frozen world snapshot (downscaled from the retina backing store)
    c.drawImage(snap, PAD, PAD, W, H);

    // caption strip
    var label = st.rules.label || PHOTO_MODE_NAMES[st.rules.mode] || 'TARGET PRACTICE';
    var dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
    var cy = PAD + H;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffd23a';
    c.font = '900 46px Lilita One, Nunito, sans-serif';
    c.fillText('DINO BOB', outW / 2, cy + 52);
    c.fillStyle = '#fff';
    c.font = '800 27px Nunito, sans-serif';
    c.fillText('⭐ ' + st.score + '   ·   🪙 +' + st.coinsDirect + '   ·   ' + label + '   ·   ' + dateStr,
      outW / 2, cy + 100);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = 'italic 600 21px Nunito, sans-serif';
    c.fillText('designed by Penny', outW / 2, cy + 140);

    if (out.toBlob) {
      out.toBlob(deliverPhotoBlob, 'image/png');
    } else {
      // ancient fallback: dataURL straight to download
      deliverPhotoBlob(dataURLToBlob(out.toDataURL('image/png')));
    }
  }

  function dataURLToBlob(dataURL) {
    try {
      var parts = dataURL.split(',');
      var bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: 'image/png' });
    } catch (err) { return null; }
  }

  function deliverPhotoBlob(blob) {
    if (!blob) { photoToast('Photo failed — try again!'); return; }
    var file = null;
    try { file = new File([blob], 'dino-bob-photo.png', { type: 'image/png' }); } catch (err) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Dino Bob' }).then(function () {
        photoToast('Shared! 📸');
      }, function () { /* share sheet dismissed — not an error */ });
    } else {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dino-bob-photo.png'; // synthetic click → downloads like any file
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      photoToast('Saved! 📸');
    }
  }

  function drawPhotoBar() {
    ctx.textBaseline = 'middle';
    // white shutter flash (skipped under reduced motion)
    if (photoFlashUntil && !reducedMotion()) {
      var age = (performance.now() - (photoFlashUntil - 170)) / 170;
      if (age >= 0 && age < 1) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - age)).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      } else if (age >= 1) {
        photoFlashUntil = 0;
      }
    }
    // hint line
    ctx.font = '800 24px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('📷 PHOTO MODE — drag anywhere to pan', W / 2, 40);

    // ZOOM pill (cycles 1 → 1.15 → 1.3)
    hudPanel(PHOTO_ZOOM_BTN.x, PHOTO_ZOOM_BTN.y, PHOTO_ZOOM_BTN.w, PHOTO_ZOOM_BTN.h);
    ctx.fillStyle = '#ffd23a';
    ctx.font = '900 30px Lilita One, Nunito, sans-serif';
    ctx.fillText(PHOTO_ZOOMS[photoZoomIdx] + '×',
      PHOTO_ZOOM_BTN.x + PHOTO_ZOOM_BTN.w / 2, PHOTO_ZOOM_BTN.y + PHOTO_ZOOM_BTN.h / 2 + 1);

    // SHUTTER circle
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.arc(PHOTO_SHUTTER.x, PHOTO_SHUTTER.y, PHOTO_SHUTTER.r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1822'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(PHOTO_SHUTTER.x, PHOTO_SHUTTER.y, PHOTO_SHUTTER.r - 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(PHOTO_SHUTTER.x, PHOTO_SHUTTER.y, PHOTO_SHUTTER.r - 16, 0, Math.PI * 2);
    ctx.fillStyle = '#3d964c'; ctx.fill();
    ctx.restore();

    // EXIT pill
    hudPanel(PHOTO_EXIT_BTN.x, PHOTO_EXIT_BTN.y, PHOTO_EXIT_BTN.w, PHOTO_EXIT_BTN.h);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px Nunito, sans-serif';
    ctx.fillText('✕ EXIT', PHOTO_EXIT_BTN.x + PHOTO_EXIT_BTN.w / 2, PHOTO_EXIT_BTN.y + PHOTO_EXIT_BTN.h / 2 + 1);
  }

  /* ============ rendering ============ */

  /* Per-biome scene light. Every sprite gets graded once (cached) with the
     scene's ambient tint plus a top-light/ground-shade gradient, so objects
     share the background's lighting instead of looking like stickers. */
  var AMBIENT = {
    bg_meadow:       { tint: '255,243,214', light: 'rgba(255,255,235,0.13)', shade: 'rgba(46,60,38,0.15)',  haze: '212,234,255' },
    bg_mountain:     { tint: '224,237,255', light: 'rgba(255,255,255,0.13)', shade: 'rgba(38,52,74,0.17)',  haze: '224,240,255' },
    bg_sunset_beach: { tint: '255,222,182', light: 'rgba(255,236,190,0.16)', shade: 'rgba(84,42,60,0.17)',  haze: '255,216,176' },
    bg_starlight:    { tint: '202,210,255', light: 'rgba(216,228,255,0.14)', shade: 'rgba(20,24,64,0.21)',  haze: '178,192,255' },
    bg_underwater:   { tint: '192,239,237', light: 'rgba(224,255,252,0.14)', shade: 'rgba(16,72,84,0.19)',  haze: '170,231,231' },
    bg_moon_cave:    { tint: '206,195,255', light: 'rgba(218,206,255,0.14)', shade: 'rgba(24,16,56,0.22)',  haze: '162,152,230' }
  };

  function ambient() {
    return AMBIENT[st.bgName] || AMBIENT.bg_meadow;
  }

  var GRADE_CACHE_MAX = 48;
  var gradeCache = {};
  var gradeCacheOrder = [];
  function gradedSprite(name) {
    var img = SPRITES.get(name);
    if (!img) return null;
    var amb = ambient();
    var key = st.bgName + '|' + name;
    if (gradeCache[key]) return gradeCache[key];
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    var c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgba(' + amb.tint + ',0.45)';
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(img, 0, 0);   // multiply bleeds into transparent pixels; re-mask
    c.globalCompositeOperation = 'source-atop';
    var g = c.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, amb.light);
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, amb.shade);
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
    while (gradeCacheOrder.length >= GRADE_CACHE_MAX) {
      delete gradeCache[gradeCacheOrder.shift()];   // FIFO: boss frames are huge, never let this grow unbounded
    }
    gradeCache[key] = cv;
    gradeCacheOrder.push(key);
    return cv;
  }

  /* ---- cached per-frame paint (allocation hygiene) ----
     Gradients that never change are baked once into offscreen canvases or
     memoized CanvasGradients instead of being rebuilt every frame. */
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  var overlayCache = {};
  function overlaySprite(key, paint) {
    var sp = overlayCache[key];
    if (!sp) {
      sp = makeCanvas(W, H);
      paint(sp.getContext('2d'));
      overlayCache[key] = sp;
    }
    return sp;
  }

  var glowSprites = {};
  var glowSpriteOrder = [];
  var GLOW_SPRITE_MAX = 40;
  // Memoized soft-glow sprite; `radius` is bucketed to 16px so continuous
  // sizes map to a small set of cached canvases.
  function memoGlowSprite(key, radius, paint) {
    var R = Math.max(12, Math.round(radius / 16) * 16);
    var k = key + '|' + R;
    if (glowSprites[k]) return { sp: glowSprites[k], R: R };
    var cv = makeCanvas(R * 2, R * 2);
    paint(cv.getContext('2d'), R);
    while (glowSpriteOrder.length >= GLOW_SPRITE_MAX) {
      delete glowSprites[glowSpriteOrder.shift()];
    }
    glowSprites[k] = cv;
    glowSpriteOrder.push(k);
    return { sp: cv, R: R };
  }

  // One unit soft shadow blob (black radial fade), tinted/scaled per use via
  // globalAlpha + transform instead of building a gradient per target/frame.
  var unitShadow = null;
  function shadowSprite() {
    if (!unitShadow) {
      unitShadow = makeCanvas(256, 256);
      var c = unitShadow.getContext('2d');
      var g = c.createRadialGradient(128, 128, 256 * 0.06, 128, 128, 128);
      g.addColorStop(0, 'rgba(20,16,20,1)');
      g.addColorStop(0.6, 'rgba(20,16,20,0.5)');
      g.addColorStop(1, 'rgba(20,16,20,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    }
    return unitShadow;
  }

  /* ---- Penny's Boss Workshop: cached hue-shifted sprites ----
     Same ctx.filter='hue-rotate(...)' trick the balloons use, but baked into
     an offscreen canvas once per (sprite,hue) pair instead of every frame.
     The cache is deliberately small and FIFO: oldest entry evicted when it
     passes HUE_CACHE_MAX, so recoloring can never grow unbounded. */
  var HUE_CACHE_MAX = 24;
  var hueCache = {};      // 'key|hue' -> canvas
  var hueCacheOrder = []; // insertion order for oldest-first eviction
  function hueShiftedImg(img, key, hue) {
    hue = ((Math.round(hue || 0)) % 360 + 360) % 360;
    if (!hue || !img) return null;         // 0 = classic look, no copy needed
    var k = key + '|' + hue;
    if (hueCache[k]) return hueCache[k];
    var cv = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
    var c = cv.getContext('2d');
    c.filter = 'hue-rotate(' + hue + 'deg)';
    c.drawImage(img, 0, 0);
    c.filter = 'none';
    while (hueCacheOrder.length >= HUE_CACHE_MAX) {
      delete hueCache[hueCacheOrder.shift()];
    }
    hueCache[k] = cv;
    hueCacheOrder.push(k);
    return cv;
  }
  function hueShiftedSprite(name, hue) {
    return hueShiftedImg(SPRITES.get(name), name, hue);
  }

  // A soft band of atmospheric haze where the painted background meets the
  // play plane; separates the "stage" from the backdrop like distant fog.
  function drawDepthHaze() {
    var key = 'haze|' + (st.bgName || '');
    var sp = overlayCache[key];
    if (!sp) {
      var amb = ambient();
      sp = makeCanvas(W, 380);
      var c = sp.getContext('2d');
      var g = c.createLinearGradient(0, 0, 0, 380);
      g.addColorStop(0, 'rgba(' + amb.haze + ',0)');
      g.addColorStop(0.72, 'rgba(' + amb.haze + ',0.13)');
      g.addColorStop(1, 'rgba(' + amb.haze + ',0.02)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, 380);
      overlayCache[key] = sp;
    }
    ctx.drawImage(sp, 0, GROUND - 330);
  }

  function drawBackground() {
    // depth pass: biomes sliced into far/mid planes (tools/slice_bg.py) draw
    // as a two-plane diorama — the far plane counter-moves against shake
    // (net x0.85 vs the x1.0 baseline the global shake translate applies)
    // and the mid plane breathes with a slow idle sway so the world never
    // sits perfectly still. reducedMotion pins both planes.
    var far = SPRITES.get(st.bgName + '_far');
    var mid = SPRITES.get(st.bgName + '_mid');
    if (far && mid) {
      var sx = st.shakeX || 0, sy = st.shakeY || 0;
      var sway = reducedMotion() ? 0 : Math.sin(st.t * 0.1) * 8;
      var farK = (typeof TUNING !== 'undefined' && TUNING.PARALLAX_FAR != null) ? TUNING.PARALLAX_FAR : 0.15;
      ctx.drawImage(far, -sx * farK, -sy * farK, W, H);
      // mid spans W+16 so the ±8px sway never exposes an edge seam
      ctx.drawImage(mid, sway - 8, 0, W + 16, H);
      if (st.rules.theme === 'cave') drawCaveOverlay();
      return;
    }
    var bg = SPRITES.get(st.bgName) || SPRITES.get('bg_meadow');
    if (bg) {
      // same far-plane contract as the sliced path: counter-shake + gentle sway
      var bsx = st.shakeX || 0, bsy = st.shakeY || 0;
      var bsway = reducedMotion() ? 0 : Math.sin(st.t * 0.1) * 8;
      var farK = (typeof TUNING !== 'undefined' && TUNING.PARALLAX_FAR != null) ? TUNING.PARALLAX_FAR : 0.15;
      ctx.drawImage(bg, bsway - 8 - bsx * farK, -bsy * farK, W + 16, H);
      if (st.rules.theme === 'cave') drawCaveOverlay();
      return;
    }
    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6db9f2');
    sky.addColorStop(0.65, '#aadcf7');
    sky.addColorStop(1, '#d9f2fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // sun
    ART.circle(ctx, 1430, 110, 58, '#fff3b0');
    ART.circle(ctx, 1430, 110, 44, '#ffe33a');

    // clouds
    [[260, 130, 1], [820, 90, 0.8], [1180, 170, 0.65]].forEach(function (c) {
      var x = (c[0] + st.t * 12 * c[2]) % (W + 300) - 150;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ART.ellipse(ctx, x, c[1], 70 * c[2], 26 * c[2], 'rgba(255,255,255,0.92)');
      ART.ellipse(ctx, x - 45 * c[2], c[1] + 10, 45 * c[2], 20 * c[2], 'rgba(255,255,255,0.92)');
      ART.ellipse(ctx, x + 50 * c[2], c[1] + 8, 50 * c[2], 22 * c[2], 'rgba(255,255,255,0.92)');
    });

    // far hills
    ctx.fillStyle = '#79c46a';
    ctx.beginPath();
    ctx.moveTo(0, 620);
    ctx.quadraticCurveTo(300, 520, 650, 600);
    ctx.quadraticCurveTo(1000, 680, 1300, 580);
    ctx.quadraticCurveTo(1500, 530, 1600, 590);
    ctx.lineTo(1600, 900); ctx.lineTo(0, 900);
    ctx.closePath(); ctx.fill();

    // pines
    [[90, 600, 1.1], [380, 590, 0.8], [560, 615, 1.0], [1330, 575, 0.9], [1530, 600, 1.15]].forEach(function (p) {
      pine(p[0], p[1], p[2]);
    });

    // meadow
    var grass = ctx.createLinearGradient(0, GROUND - 120, 0, H);
    grass.addColorStop(0, '#8fd14f');
    grass.addColorStop(1, '#5fae3a');
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.moveTo(0, GROUND - 40);
    ctx.quadraticCurveTo(400, GROUND - 80, 800, GROUND - 50);
    ctx.quadraticCurveTo(1200, GROUND - 20, 1600, GROUND - 60);
    ctx.lineTo(1600, 900); ctx.lineTo(0, 900);
    ctx.closePath(); ctx.fill();

    // dirt path
    ctx.fillStyle = '#cbb27e';
    ctx.beginPath();
    ctx.moveTo(80, 900);
    ctx.quadraticCurveTo(500, GROUND + 10, 1100, GROUND + 30);
    ctx.quadraticCurveTo(1350, GROUND + 40, 1600, 870);
    ctx.lineTo(1600, 900);
    ctx.closePath(); ctx.fill();

    // flowers
    for (var i = 0; i < 9; i++) {
      var fx = 140 + i * 170 + (i % 3) * 40;
      var fy = GROUND - 30 + (i % 4) * 22;
      ART.circle(ctx, fx, fy, 6, ['#ff5fa2', '#ffd23a', '#fff'][i % 3]);
      ART.circle(ctx, fx, fy, 2.5, '#e8a91d');
    }
  }

  function drawCaveOverlay() {
    ctx.drawImage(overlaySprite('cave-vignette', function (c) {
      var vignette = c.createRadialGradient(W * 0.58, H * 0.48, 160, W * 0.55, H * 0.48, 900);
      vignette.addColorStop(0, 'rgba(42,45,83,0.08)');
      vignette.addColorStop(0.65, 'rgba(28,19,48,0.48)');
      vignette.addColorStop(1, 'rgba(8,7,18,0.86)');
      c.fillStyle = vignette;
      c.fillRect(0, 0, W, H);
    }), 0, 0);
    ctx.fillStyle = 'rgba(119,91,211,0.35)';
    for (var i = 0; i < 9; i++) {
      var cx = 550 + i * 125, ch = 28 + (i % 3) * 16;
      ctx.beginPath(); ctx.moveTo(cx - 14, H); ctx.lineTo(cx, H - ch); ctx.lineTo(cx + 14, H); ctx.fill();
    }
  }

  function pine(x, y, s) {
    ctx.fillStyle = '#6f4b27';
    ctx.fillRect(x - 8 * s, y + 90 * s, 16 * s, 40 * s);
    ctx.fillStyle = '#2f7d46';
    for (var i = 0; i < 3; i++) {
      var w = (90 - i * 22) * s, ty = y + i * -55 * s + 90 * s;
      ctx.beginPath();
      ctx.moveTo(x, ty - 85 * s);
      ctx.lineTo(x - w, ty);
      ctx.lineTo(x + w, ty);
      ctx.closePath(); ctx.fill();
    }
  }

  /* ---- per-biome atmosphere decorations ----
     Static geometry lives in lazily-built tables (atmoTable) or baked sprites
     (overlaySprite/memoGlowSprite); the per-frame path is pure math + draw
     calls with fixed fill styles, no allocations. Everything here is skipped
     entirely under reduced motion. */
  var atmoTables = {};
  function atmoTable(key, count, make) {
    var tbl = atmoTables[key];
    if (!tbl) {
      tbl = [];
      for (var i = 0; i < count; i++) tbl.push(make(i));
      atmoTables[key] = tbl;
    }
    return tbl;
  }
  function atmoHash(n) {   // deterministic 0..1 pseudo-random
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // meadow: 3 swaying god-ray shafts + 10 wandering pollen motes
  function drawMeadowAtmosphere(calm) {
    if (calm) return;
    var ray = overlaySprite('god-ray', function (c) {
      var w = 340;
      var g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,243,196,0)');
      g.addColorStop(0.42, 'rgba(255,243,196,0.55)');
      g.addColorStop(0.58, 'rgba(255,243,196,0.55)');
      g.addColorStop(1, 'rgba(255,243,196,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, H);
      var f = c.createLinearGradient(0, 0, 0, H);
      f.addColorStop(0, 'rgba(0,0,0,1)');
      f.addColorStop(0.22, 'rgba(0,0,0,0)');
      f.addColorStop(0.86, 'rgba(0,0,0,0)');
      f.addColorStop(1, 'rgba(0,0,0,0.92)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = f;
      c.fillRect(0, 0, w, H);
    });
    var rays = atmoTable('meadow.rays', 3, function (i) {
      return { ax: 120 + i * 310, ang: 0.58 + i * 0.17, ph: i * 2.1 };
    });
    for (var i = 0; i < rays.length; i++) {
      var rr = rays[i];
      ctx.save();
      ctx.translate(rr.ax, -90);
      ctx.rotate(rr.ang + Math.sin(st.t * 0.22 + rr.ph) * 0.035);   // slow ±2° sway
      ctx.globalAlpha = 0.27;
      ctx.drawImage(ray, -170, 0);
      ctx.restore();
    }
    ctx.fillStyle = 'rgb(255,216,130)';
    var pollen = atmoTable('meadow.pollen', 10, function (i) {
      return { x: (i * 167 + 60) % W, y: 150 + (i * 97) % 480, sp: 0.16 + (i % 4) * 0.05, ph: i * 1.93 };
    });
    for (var p = 0; p < pollen.length; p++) {
      var m = pollen[p];
      ctx.globalAlpha = 0.08 + 0.07 * (0.5 + 0.5 * Math.sin(st.t * 0.7 + m.ph));
      ctx.beginPath();
      ctx.arc(m.x + Math.sin(st.t * m.sp + m.ph) * 46, m.y + Math.cos(st.t * m.sp * 0.77 + m.ph) * 30, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // mountain: 2 sweeping cloud-shadow bands + 4 phased wind-streak arcs
  function drawMountainAtmosphere(calm) {
    if (calm) return;
    var band = overlaySprite('cloud-band', function (c) {
      var bw = 560;
      c.translate(W / 2, H / 2);
      c.scale(1, 0.42);
      var g = c.createRadialGradient(0, 0, 24, 0, 0, bw / 2);
      g.addColorStop(0, 'rgba(36,42,64,0.55)');
      g.addColorStop(1, 'rgba(36,42,64,0)');
      c.fillStyle = g;
      c.fillRect(-bw / 2, -bw / 2, bw, bw);
    });
    var bands = atmoTable('mtn.bands', 2, function (i) {
      return { y: 120 + i * 260, sp: 34 + i * 19, off: i * 700 };
    });
    for (var i = 0; i < bands.length; i++) {
      var bd = bands[i];
      var travel = W + 560;
      var bx = ((st.t * bd.sp + bd.off) % travel) - 560;
      ctx.globalAlpha = i ? 0.10 : 0.15;
      ctx.drawImage(band, bx, bd.y);
      ctx.drawImage(band, bx - travel, bd.y);   // seamless wrap
    }
    ctx.strokeStyle = 'rgb(255,255,255)';
    ctx.lineWidth = 2;
    var streaks = atmoTable('mtn.streaks', 4, function (i) {
      return { y: 120 + i * 92, sp: 56 + i * 13, ph: i * 1.57 + 0.6, seed: atmoHash(i + 41) * 900 };
    });
    for (var k = 0; k < streaks.length; k++) {
      var sk = streaks[k];
      var a = Math.max(0, Math.sin(st.t * 0.45 + sk.ph));   // staggered fade in/out
      if (a <= 0.01) continue;
      var x0 = ((st.t * sk.sp + sk.seed) % (W + 340)) - 340;
      ctx.globalAlpha = a * 0.13;
      ctx.beginPath();
      ctx.moveTo(x0, sk.y);
      ctx.quadraticCurveTo(x0 + 135, sk.y - 26 - (k % 2) * 12, x0 + 280, sk.y - 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // sunset beach: 5 breathing shimmer bands across the lower 35%
  function drawBeachShimmer(calm) {
    if (calm) return;
    ctx.fillStyle = 'rgb(255,236,200)';
    var bands = atmoTable('beach.shimmer', 5, function (i) {
      return { y: H * 0.65 + i * (H * 0.35 / 5) + 12, w: 190 + atmoHash(i + 3) * 430, ph: i * 1.31, h: 8 + (i % 3) * 5 };
    });
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var br = Math.sin(st.t * 0.8 + b.ph);
      var bw = b.w * (1 + br * 0.22);
      ctx.globalAlpha = 0.05 + 0.05 * (0.5 + 0.5 * br);
      ctx.fillRect((W - bw) / 2 + Math.sin(st.t * 0.5 + b.ph) * 60, b.y, bw, b.h);
    }
    ctx.globalAlpha = 1;
  }

  // starlight: 14 seeded twinkling stars + a shooting star every ~11s
  function drawStarlightExtras(calm) {
    var stars = atmoTable('star.twinkles', 14, function (i) {
      return { x: 30 + atmoHash(i * 3 + 1) * (W - 60), y: 24 + atmoHash(i * 7 + 5) * H * 0.55, r: 1 + atmoHash(i * 11 + 2) * 1.4, ph: atmoHash(i * 13 + 9) * 6.28 };
    });
    ctx.fillStyle = 'rgb(255,246,190)';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = calm ? 0.5 : Math.abs(Math.sin(st.t * 2.1 + s.ph));
      ctx.globalAlpha = (0.3 + 0.7 * tw) * 0.18;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!calm) {
      var cyc = st.t % 11;
      if (cyc < 1.15) {
        var pr = cyc / 1.15;
        var n = Math.floor(st.t / 11);
        var hx = 180 + atmoHash(n * 5 + 2) * 700 + pr * 640;
        var hy = 50 + atmoHash(n * 9 + 4) * 170 + pr * 260;
        var fade = Math.sin(pr * Math.PI);
        ctx.strokeStyle = 'rgb(255,250,225)';
        ctx.lineWidth = 2;
        ctx.globalAlpha = fade * 0.45;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - 115, hy - 47);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.7;
        ctx.fillStyle = 'rgb(255,255,240)';
        ctx.beginPath();
        ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // underwater: dual-speed panned caustic web + 8 rising wobbling bubbles
  function drawUnderwaterExtras(calm) {
    var ca = overlaySprite('caustics', function (c) {
      c.strokeStyle = 'rgba(230,255,252,0.5)';
      c.lineWidth = 5;
      var cell = 128;
      for (var gy = 0; gy < H + cell; gy += cell) {
        for (var gx = 0; gx < W + cell; gx += cell) {
          c.beginPath(); c.arc(gx, gy, cell * 0.52, 0, Math.PI); c.stroke();
          c.beginPath(); c.arc(gx + cell / 2, gy + cell / 2, cell * 0.52, Math.PI, Math.PI * 2); c.stroke();
        }
      }
    });
    var o1, o2;
    if (!calm) {
      o1 = -((st.t * 26) % W);
      o2 = -((st.t * 47) % W);
      ctx.globalAlpha = 0.14;
      ctx.drawImage(ca, o1, Math.sin(st.t * 0.37) * 12);
      ctx.drawImage(ca, o1 + W, Math.sin(st.t * 0.37) * 12);
      ctx.globalAlpha = 0.09;
      ctx.drawImage(ca, o2, Math.cos(st.t * 0.29) * 18 + 60);
      ctx.drawImage(ca, o2 + W, Math.cos(st.t * 0.29) * 18 + 60);
    } else {
      ctx.globalAlpha = 0.10;
      ctx.drawImage(ca, 0, 0);
    }
    ctx.strokeStyle = 'rgb(214,244,255)';
    ctx.lineWidth = 1.5;
    var bub = atmoTable('uw.bubbles', 8, function (i) {
      return { x: (i * 211 + 90) % W, sp: calm ? 0 : 46 + (i % 4) * 14, ph: atmoHash(i + 21) * 6.28, r: 3 + (i % 3) * 2 };
    });
    for (var i = 0; i < bub.length; i++) {
      var b = bub[i];
      var by = calm ? 200 + i * 60 : H + 20 - ((st.t * b.sp + b.ph * 40) % (H + 40));
      var bx = b.x + (calm ? 0 : Math.sin(st.t * 1.4 + b.ph) * 16);
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // moon cave: 3 breathing crystal glows + 6 Lissajous fireflies
  function drawCaveExtras(calm) {
    var glow = memoGlowSprite('cave-crystal', 170, function (c, R) {
      var g = c.createRadialGradient(R, R, R * 0.08, R, R, R);
      g.addColorStop(0, 'rgba(158,146,255,0.7)');
      g.addColorStop(1, 'rgba(158,146,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, R * 2, R * 2);
    });
    var gems = atmoTable('cave.gems', 3, function (i) {
      return { x: [330, 1190, 760][i], y: [700, 668, 772][i], ph: i * 2.09 };
    });
    for (var i = 0; i < gems.length; i++) {
      var gm = gems[i];
      var br = calm ? 0.5 : 0.5 + 0.5 * Math.sin(st.t * 0.9 + gm.ph);
      var sc = 1 + (calm ? 0 : 0.05 * Math.sin(st.t * 0.9 + gm.ph));
      ctx.globalAlpha = (0.08 + 0.11 * br) * sc;
      ctx.drawImage(glow.sp, gm.x - glow.R * sc, gm.y - glow.R * sc, glow.R * 2 * sc, glow.R * 2 * sc);
    }
    var ff = memoGlowSprite('ff-glow', 30, function (c, R) {
      var g = c.createRadialGradient(R, R, 2, R, R, R);
      g.addColorStop(0, 'rgba(255,238,140,0.85)');
      g.addColorStop(1, 'rgba(255,238,140,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, R * 2, R * 2);
    });
    var flies = atmoTable('cave.flies', 6, function (i) {
      return { cx: 180 + atmoHash(i * 3 + 31) * (W - 360), cy: 240 + atmoHash(i * 5 + 17) * 400, ax: 70 + atmoHash(i * 7 + 3) * 90, ay: 40 + atmoHash(i * 9 + 5) * 70, f1: 0.23 + atmoHash(i * 11 + 7) * 0.2, f2: 0.31 + atmoHash(i * 13 + 2) * 0.2, ph: atmoHash(i * 17 + 13) * 6.28 };
    });
    for (var j = 0; j < flies.length; j++) {
      var fl = flies[j];
      var fx = fl.cx + (calm ? 0 : fl.ax * Math.sin(st.t * fl.f1 + fl.ph));
      var fy = fl.cy + (calm ? 0 : fl.ay * Math.sin(st.t * fl.f2 + fl.ph * 1.7));
      ctx.globalAlpha = 0.10 + 0.06 * (calm ? 0.5 : 0.5 + 0.5 * Math.sin(st.t * 2.2 + fl.ph));
      ctx.drawImage(ff.sp, fx - ff.R, fy - ff.R);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgb(255,244,170)';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawStageAtmosphere() {
    var name = st.bgName || '';
    var calm = reducedMotion();
    ctx.save();

    // Soft scene-grade overlays make the painted worlds feel like one coherent
    // diorama without touching the actual background assets.
    if (name.indexOf('moon_cave') >= 0 || st.rules.theme === 'cave') {
      ctx.drawImage(overlaySprite('cave-atmo', function (c) {
        var cave = c.createRadialGradient(W * 0.55, H * 0.45, 130, W * 0.55, H * 0.45, 880);
        cave.addColorStop(0, 'rgba(111,92,255,0.10)');
        cave.addColorStop(0.72, 'rgba(14,16,44,0.18)');
        cave.addColorStop(1, 'rgba(5,6,16,0.36)');
        c.fillStyle = cave;
        c.fillRect(0, 0, W, H);
      }), 0, 0);
      for (var i = 0; i < (calm ? 7 : 22); i++) {
        var gx = (i * 131 + (calm ? 0 : Math.sin(st.t * 0.4 + i) * 12)) % W;
        var gy = 120 + ((i * 73 + (calm ? 0 : st.t * 18)) % 620);
        ART.circle(ctx, gx, gy, 2 + (i % 3), i % 2 ? 'rgba(126,236,255,0.38)' : 'rgba(190,145,255,0.28)');
      }
      drawCaveExtras(calm);
    } else if (name.indexOf('underwater') >= 0) {
      ctx.fillStyle = 'rgba(34,164,190,0.12)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(208,255,255,0.16)';
      ctx.lineWidth = 3;
      for (var u = 0; u < (calm ? 3 : 7); u++) {
        var yy = 110 + u * 92 + (calm ? 0 : Math.sin(st.t * 0.9 + u) * 12);
        ctx.beginPath();
        for (var x = -30; x <= W + 30; x += 60) {
          var wy = yy + (calm ? Math.sin(x * 0.015 + u) * 4 : Math.sin(x * 0.015 + st.t * 1.7 + u) * 12);
          if (x === -30) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      for (var b = 0; b < (calm ? 5 : 14); b++) {
        var bx = (b * 117 + (calm ? 0 : Math.sin(st.t + b) * 18)) % W;
        var by = calm ? (160 + b * 83) % H : H - ((st.t * (28 + b % 4 * 10) + b * 79) % H);
        ctx.strokeStyle = 'rgba(220,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 5 + (b % 4) * 3, 0, Math.PI * 2); ctx.stroke();
      }
      drawUnderwaterExtras(calm);
    } else if (name.indexOf('starlight') >= 0) {
      ctx.fillStyle = 'rgba(21,24,72,0.12)'; ctx.fillRect(0, 0, W, H);
      for (var s = 0; s < (calm ? 12 : 32); s++) {
        var sx = (s * 97 + 47) % W;
        var sy = 40 + (s * 53) % 360;
        var tw = calm ? 0.35 : 0.35 + Math.sin(st.t * 2.3 + s) * 0.25;
        ART.circle(ctx, sx, sy, 1.5 + (s % 3), 'rgba(255,244,168,' + (0.25 + tw) + ')');
      }
      drawStarlightExtras(calm);
    } else if (name.indexOf('sunset') >= 0) {
      ctx.drawImage(overlaySprite('sunset-atmo', function (c) {
        var sunset = c.createLinearGradient(0, 0, 0, H);
        sunset.addColorStop(0, 'rgba(255,142,92,0.16)');
        sunset.addColorStop(0.55, 'rgba(255,220,138,0.08)');
        sunset.addColorStop(1, 'rgba(63,32,50,0.12)');
        c.fillStyle = sunset;
        c.fillRect(0, 0, W, H);
      }), 0, 0);
      drawBeachShimmer(calm);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, 0, W, H);
      for (var p = 0; p < (calm ? 4 : 10); p++) {
        var px = (p * 173 + (calm ? 0 : st.t * (8 + p % 3))) % (W + 80) - 40;
        var py = 180 + (p * 61) % 410;
        ART.circle(ctx, px, py, 2.5, 'rgba(255,255,255,0.28)');
      }
      if (name.indexOf('meadow') >= 0) drawMeadowAtmosphere(calm);
      else if (name.indexOf('mountain') >= 0) drawMountainAtmosphere(calm);
    }

    // Gentle vignette focuses the play area like a stage.
    ctx.drawImage(overlaySprite('vignette', function (c) {
      var vignette = c.createRadialGradient(W * 0.48, H * 0.48, 260, W * 0.5, H * 0.5, 920);
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(0.72, 'rgba(24,22,34,0.04)');
      vignette.addColorStop(1, 'rgba(24,22,34,0.18)');
      c.fillStyle = vignette;
      c.fillRect(0, 0, W, H);
    }), 0, 0);
    ctx.restore();
  }

  /* ---- round weather ----
     Kind is rolled beside WIND in makeState and stored on st.weather. Same
     hygiene as the living-skies decor: a fixed-size table built once per
     round on st.weather, then the per-frame path is pure st.t math + draw
     calls — no allocation. Skipped entirely under reduced motion. */

  function weatherBiome(name) {
    name = String(name || '');
    if (name.indexOf('cave') >= 0) return 'cave';
    if (name.indexOf('underwater') >= 0) return 'underwater';
    if (name.indexOf('starlight') >= 0) return 'starlight';
    if (name.indexOf('sunset') >= 0) return 'beach';
    return 'grass';   // meadow & mountain share the rainy/leafy family
  }

  function buildWeatherTable(w) {
    // clear grassy rounds blow leaves instead of rain; everything else maps 1:1
    var vk = w.kind === 'clear' && w.biome === 'grass' ? 'leaves' : w.kind;
    w.vk = vk;
    var i, t = [];
    if (vk === 'rain') {
      // thin streaks leaned 8-20° with the wind; speed/alpha jittered per drop
      var sgn = w.lean < -0.02 ? -1 : 1;
      for (i = 0; i < TUNING.WEATHER_RAIN_COUNT; i++) {
        var tilt = Math.min(0.35, Math.max(0.14, Math.abs(w.lean) * 0.30 + atmoHash(i * 3 + 1) * 0.08));
        var spd = (900 + atmoHash(i * 5 + 2) * 500) * (0.75 + w.intensity * 0.35);
        t.push({
          x0: atmoHash(i * 7 + 3) * (W + 400), y0: atmoHash(i * 11 + 4) * (H + 120),
          vx: Math.sin(tilt) * spd * sgn, vy: Math.cos(tilt) * spd,
          len: 18 + atmoHash(i * 13 + 6) * 14,
          a: 0.25 + atmoHash(i * 17 + 8) * 0.20
        });
      }
    } else if (vk === 'leaves') {
      // lime & amber leaves tumbling across with the wind direction
      var n = TUNING.WEATHER_LEAF_MIN +
        Math.round(wf0(w) * (TUNING.WEATHER_LEAF_MAX - TUNING.WEATHER_LEAF_MIN));
      var dir = w.lean < -0.02 ? -1 : 1;
      var cols = ['#a8d43a', '#d9a621', '#8bc34a', '#e8b23a'];
      for (i = 0; i < n; i++) {
        t.push({
          x0: atmoHash(i * 3 + 11) * (W + 140), y0: 60 + atmoHash(i * 5 + 13) * (GROUND - 170),
          sp: (55 + atmoHash(i * 7 + 17) * 110) * (0.6 + w.intensity * 0.5),
          r: 3.5 + atmoHash(i * 11 + 19) * 3.5,
          rot: atmoHash(i * 13 + 23) * 6.28, vr: (atmoHash(i * 17 + 29) * 2 - 1) * 4,
          sw: 26 + atmoHash(i * 19 + 31) * 26, ph: atmoHash(i * 23 + 37) * 6.28,
          c: cols[i % cols.length], dir: dir
        });
      }
    } else if (vk === 'embers') {
      // glowing motes rising with sine sway; denser when windy
      var en = 14 + Math.round(wf0(w) * 8);
      for (i = 0; i < en; i++) {
        t.push({
          x0: atmoHash(i * 3 + 41) * W, y0: atmoHash(i * 5 + 43) * (H + 80),
          sp: 42 + atmoHash(i * 7 + 47) * 58, r: 1.6 + atmoHash(i * 11 + 53) * 2.2,
          ax: 16 + atmoHash(i * 13 + 59) * 26, ph: atmoHash(i * 17 + 61) * 6.28,
          fq: 0.9 + atmoHash(i * 19 + 67) * 1.4
        });
      }
    } else if (vk === 'meteor') {
      // one faint background streak roughly every 25s (~2-3 per minute)
      t.push({ per: 25, dur: 0.95 });
    }
    w.table = t;
  }

  function wf0(w) { return Math.min(1, Math.abs(w.lean)); }

  function updateWeather(dt) {
    if (dt <= 0 || !st.weather || st.weather.kind !== 'rain') return;
    var w = st.weather;
    // ground splash rings where drops land — throttled ~12/s, capped so the
    // shared particle pool never floods during a big combo
    w.splashAcc += dt * 12;
    while (w.splashAcc >= 1) {
      w.splashAcc -= 1;
      if (st.particles.length < 420) {
        ring(Math.random() * W, GROUND + 8 + Math.random() * 72, 'rgba(205,232,255,0.55)', 240, 3);
      }
    }
    // lightning moments: 2-step white flash + jagged bolt + deep thunder
    w.nextFlash -= dt;
    if (w.nextFlash <= 0) {
      w.flashT = 0.24;
      w.nextFlash = TUNING.WEATHER_LIGHTNING_MIN +
        Math.random() * (TUNING.WEATHER_LIGHTNING_MAX - TUNING.WEATHER_LIGHTNING_MIN);
      var bx = 140 + Math.random() * (W - 280);
      st.bolts.push({ x1: bx, y1: -10, x2: bx + Math.random() * 180 - 90, y2: GROUND - 60 - Math.random() * 130, life: 0.25 });
      AUDIO.thunder();
      addShake(0.35);
    }
    if (w.flashT > 0) w.flashT -= dt;
  }

  function drawWeather() {
    var w = st.weather;
    if (!w || reducedMotion()) return;
    if (w.kind === 'clear' && w.biome !== 'grass') return;   // truly clear skies
    var now = st.t;
    var dt = (w.prevT === null || now < w.prevT) ? 0 : Math.min(0.05, now - w.prevT);
    w.prevT = now;
    if (!w.table) buildWeatherTable(w);   // fixed size, built once per round
    updateWeather(dt);
    ctx.save();
    var i, e, spanX, spanY;
    if (w.vk === 'rain') {
      spanX = W + 400; spanY = H + 120;
      ctx.strokeStyle = 'rgb(190,214,255)';
      ctx.lineWidth = 2;
      for (i = 0; i < w.table.length; i++) {
        e = w.table[i];
        var rx = ((e.x0 + e.vx * now) % spanX + spanX) % spanX - 200;
        var ry = ((e.y0 + e.vy * now) % spanY + spanY) % spanY - 60;
        var k = e.len / Math.max(1, Math.hypot(e.vx, e.vy));
        ctx.globalAlpha = e.a;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - e.vx * k, ry - e.vy * k);
        ctx.stroke();
      }
      // lightning flash overlay (strong step, then the softer echo)
      if (w.flashT > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = w.flashT > 0.08 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)';
        ctx.fillRect(-400, -400, W + 800, H + 800);
      }
    } else if (w.vk === 'leaves') {
      spanX = W + 140;
      for (i = 0; i < w.table.length; i++) {
        e = w.table[i];
        var lx = ((e.x0 + e.dir * e.sp * now) % spanX + spanX) % spanX - 70;
        var ly = Math.min(GROUND - 6, Math.max(30, e.y0 + Math.sin(now * 1.3 + e.ph) * e.sw));
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(e.rot + e.vr * now + Math.sin(now * 2 + e.ph) * 0.6);
        ART.ellipse(ctx, 0, 0, e.r, e.r * 0.52, e.c);
        ctx.restore();
      }
    } else if (w.vk === 'embers') {
      spanY = H + 80;
      for (i = 0; i < w.table.length; i++) {
        e = w.table[i];
        var ey = H + 40 - ((e.y0 + e.sp * now) % spanY);
        var ex = e.x0 + Math.sin(now * e.fq + e.ph) * e.ax;
        var fl = 0.35 + 0.3 * Math.sin(now * (2 + e.fq) + e.ph * 3);
        ctx.globalAlpha = fl * 0.45;
        ART.circle(ctx, ex, ey, e.r * 2.4, 'rgb(255,120,30)');
        ctx.globalAlpha = fl;
        ART.circle(ctx, ex, ey, e.r, 'rgb(255,205,110)');
      }
    } else if (w.vk === 'meteor') {
      var cyc = now % w.table[0].per;
      if (cyc < w.table[0].dur) {
        var pr = cyc / w.table[0].dur;
        var nn = Math.floor(now / w.table[0].per);
        var mx = 140 + atmoHash(nn * 7 + 91) * (W - 460) + pr * 520;
        var my = 46 + atmoHash(nn * 11 + 87) * 200 + pr * 300;
        var mf = Math.sin(pr * Math.PI);   // fade in/out along the flight
        ctx.strokeStyle = 'rgb(210,235,255)';
        ctx.lineWidth = 2;
        ctx.globalAlpha = mf * 0.38;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - 130, my - 74); ctx.stroke();
        ctx.globalAlpha = mf * 0.22;
        ctx.beginPath(); ctx.moveTo(mx - 130, my - 74); ctx.lineTo(mx - 240, my - 136); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawForegroundDepth() {
    // V6 painted foreground strip for this biome: drawn in front of the
    // action so grass/flowers/rocks occlude feet and low objects (depth cue).
    // fg2 is a derived twin (blur+darken+flipped) drawn in front of it as the
    // nearest plane, taking shake at x1.4 — the camera sits just behind it.
    var biome = String(st.bgName || '').replace('bg_', '');
    var fg = SPRITES.get('fg_' + biome);
    var fg2 = SPRITES.get('fg2_' + biome);
    if (fg || fg2) {
      if (fg) {
        var fh = W * fg.height / fg.width;   // strips are 1600-wide masters
        ctx.drawImage(fg, 0, H - fh, W, fh);
      }
      if (fg2) {
        var sx = st.shakeX || 0, sy = st.shakeY || 0;
        var fgK = (typeof TUNING !== 'undefined' && TUNING.PARALLAX_FG2 != null) ? TUNING.PARALLAX_FG2 : 0.4;
        var f2h = W * fg2.height / fg2.width;
        ctx.drawImage(fg2, sx * fgK, H - f2h + sy * fgK, W, f2h);
      }
      return;
    }
    ctx.save();
    var g = ctx.createLinearGradient(0, GROUND - 12, 0, H);
    g.addColorStop(0, 'rgba(72,138,44,0)');
    g.addColorStop(1, 'rgba(32,88,35,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND - 18, W, H - GROUND + 18);

    for (var i = 0; i < (reducedMotion() ? 8 : 18); i++) {
      var x = (i * 101 + 33) % W;
      var y = GROUND + 10 + (i % 4) * 24;
      var h = 18 + (i % 5) * 7;
      ctx.strokeStyle = i % 3 ? 'rgba(47,125,70,0.42)' : 'rgba(255,210,58,0.42)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.quadraticCurveTo(x + (reducedMotion() ? 0 : Math.sin(st.t + i) * 8), y + h * 0.45, x + 5, y);
      ctx.stroke();
    }

    for (var r = 0; r < 7; r++) {
      ART.ellipse(ctx, 80 + r * 240, H - 18 + (r % 2) * 8, 34 + (r % 3) * 10, 12, 'rgba(57,58,52,0.18)');
    }
    ctx.restore();
  }

  function drawObjectAura(t) {
    if (t.type === 'boss') return;
    var pulse = reducedMotion() ? 1 : 1 + Math.sin(st.t * 5 + t.x * 0.01) * 0.05;
    var color =
      t.type === 'golden' ? 'rgba(255,226,70,0.44)' :
      t.type === 'powerup' ? 'rgba(98,230,255,0.30)' :
      t.type === 'chest' ? 'rgba(255,210,58,0.18)' :
      t.type === 'obstacle' ? 'rgba(160,120,70,0.16)' : '';
    if (!color) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = t.type === 'powerup' ? 5 : 4;
    ctx.beginPath();
    ctx.arc(0, 0, t.r * (1.16 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Soft contact shadow under every object. It shrinks and fades the higher
  // the object flies; this grounding is the strongest "3D" cue we have.
  function drawGroundShadow(t) {
    // Far targets sit on distant terrain, so their shadow hugs their base
    // instead of dropping all the way to the near ground line.
    var local = t.type === 'bullseye' && t.far;
    if (!local && t.y > GROUND + 10) return;
    var groundY = local ? t.r * 1.18 + 8 : GROUND - t.y + 8;
    var drop = local ? 24 : Math.max(0, GROUND - t.y);
    var k = Math.max(0.2, 1 - drop / 950);
    var base = t.type === 'boss' ? t.r * 1.7 :
               (t.type === 'balloon' || t.type === 'powerup') ? t.r * 0.9 : t.r * 1.15;
    var w = base * (0.5 + 0.5 * k) * (local ? 0.8 : 1);
    var h = Math.max(5, w * 0.17);
    var a = (t.type === 'boss' ? 0.26 : 0.3) * k + 0.05;
    var sp = shadowSprite();
    ctx.save();
    ctx.translate(0, groundY);
    ctx.scale(1, h / w);
    ctx.globalAlpha = a;
    ctx.drawImage(sp, -w, -w, w * 2, w * 2);
    ctx.restore();
  }

  function drawBlackholes() {
    st.blackholes.forEach(function (bh) {
      var p = bh.t / bh.life;
      if (!bh.spin) bh.spin = 1;
      if (bh.seed == null) bh.seed = 0;
      var env = p < 0.45 ? p / 0.45 : (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
      env = Math.max(0, Math.min(1, env));
      var frame = p < 0.25 ? 0 : (p < 0.55 ? 1 : 2);
      var img = SPRITES.get('blackhole_' + frame) || SPRITES.get('blackhole_1');
      var pulse = (bh.pulse || 0) * 2.4;
      var wob = reducedMotion() ? 1 + pulse * 0.35 : 1 + Math.sin(st.t * 18 + bh.seed) * 0.05 + pulse;
      var R = TUNING.BLACKHOLE_RADIUS * 0.95 * env * wob;
      ctx.save();
      ctx.translate(bh.x, bh.y);
      ctx.globalAlpha = env;

      // Gravity well shimmer: the outer rings make the pull radius readable,
      // while the sprite stays as the dark center of the effect.
      for (var i = 0; i < (reducedMotion() ? 1 : 3); i++) {
        var rr = R * (0.48 + i * 0.24 + (reducedMotion() ? 0.08 : ((st.t * 0.9 + i * 0.17 + bh.seed) % 0.18)));
        ctx.beginPath();
        ctx.strokeStyle = i === 0 ? '#72f0ff' : (i === 1 ? '#8b5cff' : '#1b2438');
        ctx.globalAlpha = env * (0.28 - i * 0.06);
        ctx.lineWidth = Math.max(2, 6 - i * 1.4);
        ctx.ellipse(0, 0, rr, rr * (0.55 + i * 0.08), reducedMotion() ? i * 0.35 : bh.spin * (st.t * 3.8 + i), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.rotate(reducedMotion() ? bh.seed : bh.spin * (bh.t * 8 + bh.seed));
      ctx.globalAlpha = env;
      if (img) ctx.drawImage(img, -R * 0.62, -R * 0.62, R * 1.24, R * 1.24);
      else ART.circle(ctx, 0, 0, R * 0.62, '#0a1a2a');

      // Spark crumbs orbiting inward make it feel like space is being twisted.
      for (var j = 0; j < (reducedMotion() ? 3 : 10); j++) {
        var a = bh.seed + (reducedMotion() ? 0 : st.t * bh.spin * (3.2 + j * 0.07)) + j * 0.78;
        var spiral = R * (0.18 + ((j * 0.13 + p * 1.4) % 0.78));
        var sx = Math.cos(a) * spiral;
        var sy = Math.sin(a) * spiral * 0.62;
        ctx.globalAlpha = env * (0.15 + (j % 3) * 0.04);
        ctx.fillStyle = j % 2 ? '#72f0ff' : '#d8b4ff';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.5, R * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  function drawBrokenArrows() {
    st.brokenArrows.forEach(function (b) {
      var alpha = Math.max(0, b.life / b.max);
      var s = 1;
      var shaft = b.side < 0 ? [-42, 2] : [-2, 42];
      var type = b.type || st.arrowType;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.lineCap = 'round';
      ctx.strokeStyle = type && type.color ? type.color : '#7a4a23';
      ctx.lineWidth = 7 * s;
      ctx.beginPath();
      ctx.moveTo(shaft[0] * s, 0);
      ctx.lineTo(shaft[1] * s, 0);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(shaft[0] * s, -2 * s);
      ctx.lineTo(shaft[1] * s, -2 * s);
      ctx.stroke();

      ctx.fillStyle = '#f4d08a';
      ctx.beginPath();
      ctx.moveTo(-2 * s, -9 * s);
      ctx.lineTo(8 * s, 0);
      ctx.lineTo(-2 * s, 9 * s);
      ctx.closePath();
      ctx.fill();

      if (b.side > 0) {
        ctx.fillStyle = type && type.tipColor ? type.tipColor : '#d9dde4';
        ctx.beginPath();
        ctx.moveTo(47 * s, 0);
        ctx.lineTo(32 * s, -9 * s);
        ctx.lineTo(32 * s, 9 * s);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#7bd3ff';
        ctx.beginPath();
        ctx.moveTo(-47 * s, -10 * s);
        ctx.lineTo(-31 * s, 0);
        ctx.lineTo(-47 * s, 10 * s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  // The penguins' plane: drawn ABOVE the targets layer (it flies overhead),
  // with a running ground shadow using the same trick as flying arrows.
  function drawPlanes() {
    st.planes.forEach(function (pl) {
      var k = Math.max(0, 1 - (GROUND - pl.y) / 900);
      ctx.save();
      ctx.globalAlpha = 0.05 + 0.13 * k;
      ART.ellipse(ctx, pl.x, GROUND + 4, 40 + 46 * k, 9 + 4 * k, 'rgba(20,16,20,1)');
      ctx.restore();

      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(pl.rot || 0);
      var pimg = gradedSprite('plane_flyby') || SPRITES.get('plane_flyby');
      var size = pl.r * 2.5;
      if (pimg) {
        ctx.drawImage(pimg, -size / 2, -size / 2, size, size);
      } else {
        // Fallback: a simple folded paper plane so it still reads as "friend
        // from another game flying by".
        var R = pl.r;
        ctx.fillStyle = '#bfe3ff';
        ctx.beginPath();
        ctx.moveTo(R, 0); ctx.lineTo(-R, -R * 0.62); ctx.lineTo(-R * 0.45, R * 0.18);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#62a8f0';
        ctx.beginPath();
        ctx.moveTo(R, 0); ctx.lineTo(-R, -R * 0.62); ctx.lineTo(-R * 0.2, -R * 0.05);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8f4ff';
        ctx.beginPath();
        ctx.moveTo(R, 0); ctx.lineTo(-R * 0.45, R * 0.18); ctx.lineTo(-R * 0.2, -R * 0.05);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
  }

  function bossDamageSprite(bdef, t) {
    if (bdef.renderFrames && bdef.renderFrames.length) {
      var healthDamage = t.maxHp ? 1 - Math.max(0, t.hp) / t.maxHp : 0;
      var hitFlash = Math.max(0, Math.min(1, t.hitFlash || 0));
      if (hitFlash > 0.1) return bdef.renderFrames[healthDamage > 0.42 ? 3 : 1] || bdef.sprite;
      if (healthDamage > 0.72) return bdef.renderFrames[4] || bdef.sprite;
      if (healthDamage > 0.28) return bdef.renderFrames[2] || bdef.sprite;
      return bdef.renderFrames[0] || bdef.sprite;
    }
    var bossSprite = bdef.sprite;
    if (bdef.damageSprites && bdef.damageSprites.length && t.maxHp) {
      var damage = 1 - Math.max(0, t.hp) / t.maxHp;
      var damageIndex = Math.min(bdef.damageSprites.length - 1, Math.floor(damage * bdef.damageSprites.length));
      bossSprite = bdef.damageSprites[damageIndex] || bdef.sprite;
    }
    return bossSprite;
  }

  function chest3DFrame(t) {
    if (t.opened) {
      var openTotal = t.openStart || 1.35;
      var openProgress = 1 - Math.max(0, t.openTimer || 0) / openTotal;
      var idx = 3 + Math.min(4, Math.floor(Math.max(0, Math.min(0.999, openProgress)) * 5));
      return 'chest_3d_' + idx;
    }
    if (t.hp === 1) {
      return (t.hitFlash || 0) > 0.05 ? 'chest_3d_1' : 'chest_3d_2';
    }
    return 'chest_3d_0';
  }

  function drawBossCrop(img, sx, sy, sw, sh, bw, bh, byoff, tx, ty, rot, scale) {
    if (!img) return;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var x = -bw / 2 + sx * bw, y = -bh / 2 - byoff + sy * bh;
    var w = sw * bw, h = sh * bh;
    ctx.save();
    ctx.translate(x + w * 0.5 + tx, y + h * 0.5 + ty);
    ctx.rotate(rot || 0);
    ctx.scale(scale || 1, scale || 1);
    ctx.drawImage(img, sx * iw, sy * ih, sw * iw, sh * ih, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawMoonstoneCrackLines(t, bw, bh, byoff) {
    var damage = t.maxHp ? 1 - Math.max(0, t.hp) / t.maxHp : 0;
    if (damage <= 0.03) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.32 + damage * 0.34;
    ctx.strokeStyle = damage > 0.55 ? '#ffe78a' : '#86f6ff';
    ctx.lineWidth = 3 + damage * 3;
    var cracks = [
      [[-30, -18], [-58, -58], [-44, -94], [-78, -128]],
      [[28, -12], [60, -48], [54, -88], [92, -122]],
      [[-8, 34], [-34, 72], [-24, 104], [-58, 146]],
      [[18, 40], [48, 84], [38, 128], [70, 170]]
    ];
    cracks.forEach(function (line, i) {
      if (damage < 0.22 + i * 0.12) return;
      ctx.beginPath();
      line.forEach(function (p, j) {
        var x = p[0] * (bw / 390), y = p[1] * (bh / 390);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawBoss2p5D(t, bdef, bossImg, wobbleAmp) {
    var img = bossImg || SPRITES.get('target');
    if (!img) {
      ART.circle(ctx, 0, 0, t.r, '#e23b3b');
      return { bh: t.r * 2, byoff: 0, bossImg: null };
    }
    // Limb-wobble intensity: 1 = classic Moonstone King idle. Workshop bosses
    // pass their slider here; everything else keeps the default untouched.
    var amp = typeof wobbleAmp === 'number' ? wobbleAmp : 1;

    var bw = t.r * (bossImg ? bdef.scale : 2.15);
    var bh = bw * img.height / img.width;
    var byoff = bossImg ? bh * bdef.lift : 0;
    var recoil = Math.max(0, Math.min(1, t.wobble || 0));
    var flash = Math.max(0, Math.min(1, t.hitFlash || 0));
    var side = t.hitSide || 1;
    var breathe = reducedMotion() ? 0 : Math.sin(st.t * 2.1 + t.mt) * 0.014;
    var targetPulse = reducedMotion() ? 0 : Math.sin(st.t * 6.2) * 0.08;

    ctx.save();
    ctx.translate(side * recoil * 7, -recoil * 10 + Math.sin(st.t * 2 + t.mt) * (reducedMotion() ? 0 : 3));
    ctx.scale(1 + breathe + recoil * 0.025, 1 - breathe * 0.55);

    // Idle glow is a memoized sprite, pulse-recreated by scaling; the brief
    // hit-flash variant still paints live (rare + short-lived).
    if (flash > 0.02) {
      var glow = ctx.createRadialGradient(0, 0, 8, 0, 0, t.r * (1.1 + targetPulse));
      glow.addColorStop(0, 'rgba(255,226,86,' + (0.22 + flash * 0.36) + ')');
      glow.addColorStop(0.38, 'rgba(98,230,255,' + (0.10 + flash * 0.2) + ')');
      glow.addColorStop(1, 'rgba(98,230,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, t.r * 1.2, 0, Math.PI * 2); ctx.fill();
    } else {
      var bg = memoGlowSprite('boss-glow|' + Math.round(t.r), t.r * 1.18, function (c, R) {
        var g = c.createRadialGradient(R, R, R * 0.04, R, R, R);
        g.addColorStop(0, 'rgba(255,226,86,0.22)');
        g.addColorStop(0.38, 'rgba(98,230,255,0.10)');
        g.addColorStop(1, 'rgba(98,230,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, R * 2, R * 2);
      });
      var f = t.r * (1.1 + targetPulse) / bg.R;
      ctx.drawImage(bg.sp, -bg.R * f, -bg.R * f, bg.R * 2 * f, bg.R * 2 * f);
    }

    ctx.drawImage(img, -bw / 2, -bh / 2 - byoff, bw, bh);

    // Wind-up telegraph: big pink/gold pulse kids can read before the attack.
    if ((t.atkGlow || 0) > 0.05) {
      var ag = Math.min(1, t.atkGlow);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + ag * 0.45;
      var ringR = t.r * (1.15 + ag * 0.35);
      ctx.strokeStyle = t.atkKind === 'spit' ? '#62e6ff' : (t.atkKind === 'charge' ? '#ff8a3a' : '#ff8ad4');
      ctx.lineWidth = 10 + ag * 10;
      ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if (bossImg && !reducedMotion()) {
      var armSwing = Math.sin(st.t * 2.7 + t.mt) * 0.018 * amp + recoil * 0.05;
      drawBossCrop(img, 0.02, 0.28, 0.29, 0.50, bw, bh, byoff, -recoil * 8, recoil * 7, -armSwing - recoil * 0.03, 1);
      drawBossCrop(img, 0.69, 0.28, 0.29, 0.50, bw, bh, byoff, recoil * 8, recoil * 7, armSwing + recoil * 0.03, 1);
      drawBossCrop(img, 0.27, 0.03, 0.46, 0.29, bw, bh, byoff, side * recoil * 10, -recoil * 8, side * recoil * 0.06 + Math.sin(st.t * 4.2) * 0.008 * amp, 1);
    }

    drawMoonstoneCrackLines(t, bw, bh, byoff);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + flash * 0.42;
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 8 + flash * 8;
    ctx.beginPath(); ctx.arc(0, 0, t.r * (0.38 + targetPulse * 0.3), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff5b8';
    ctx.lineWidth = 3 + flash * 4;
    ctx.beginPath(); ctx.arc(0, 0, t.r * 0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    if (flash > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = flash * 0.55;
      ctx.fillStyle = '#fff8c8';
      ctx.fillRect(-bw / 2, -bh / 2 - byoff, bw, bh);
      ctx.restore();
    }
    ctx.restore();
    return { bh: bh, byoff: byoff, bossImg: bossImg };
  }

  function drawChest2p5D(t, cimg) {
    var frameName = chest3DFrame(t);
    var frameImg = gradedSprite(frameName) || SPRITES.get(frameName);
    if (frameImg) cimg = frameImg;
    var cw = t.r * 3.05;
    var ch = cw * cimg.height / cimg.width;
    var wob = Math.max(0, Math.min(1, t.wobble || 0));
    var flash = Math.max(0, Math.min(1, t.hitFlash || 0));
    var openProgress = t.opened ? 1 - Math.max(0, t.openTimer || 0) / (t.openStart || 0.95) : 0;
    openProgress = Math.max(0, Math.min(1, openProgress));
    var bounce = wob ? Math.sin((1 - wob) * Math.PI) * 18 : 0;
    var squash = wob ? Math.sin((1 - wob) * Math.PI) : 0;

    ctx.save();
    ctx.translate(0, -bounce);
    ctx.scale(1 + squash * 0.16, 1 - squash * 0.10);

    if (flash > 0.02 || t.opened) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var shock = t.opened ? (0.4 + openProgress * 0.8) : (1.2 - flash * 0.3);
      ctx.globalAlpha = t.opened ? (0.22 + openProgress * 0.2) : flash * 0.75;
      ctx.strokeStyle = t.opened ? '#fff2a8' : '#ffd23a';
      ctx.lineWidth = t.opened ? 7 : 10;
      ctx.beginPath();
      ctx.ellipse(0, -t.r * 0.36, t.r * (1.25 + shock), t.r * (0.62 + shock * 0.35), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (t.opened) {
      var glowR = t.r * (1.45 + openProgress * 1.05);
      var cg = memoGlowSprite('chest-glow', glowR, function (c, R) {
        var g = c.createRadialGradient(R, R, R * 0.03, R, R, R);
        g.addColorStop(0, 'rgba(255,245,156,0.95)');
        g.addColorStop(0.38, 'rgba(255,185,48,0.42)');
        g.addColorStop(1, 'rgba(255,185,48,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, R * 2, R * 2);
      });
      ctx.drawImage(cg.sp, -cg.R, -t.r * 0.55 - cg.R, cg.R * 2, cg.R * 2);
    }

    ctx.drawImage(cimg, -cw / 2, -ch * 0.62, cw, ch);

    if (t.opened && !reducedMotion()) {
      var lidLift = 18 + Math.sin(openProgress * Math.PI) * 24;
      var iw = cimg.naturalWidth || cimg.width, ih = cimg.naturalHeight || cimg.height;
      ctx.save();
      ctx.translate(0, -ch * 0.42 - lidLift);
      ctx.rotate(-0.12 - openProgress * 0.18);
      ctx.drawImage(cimg, 0, 0, iw, ih * 0.42, -cw / 2, -ch * 0.25, cw, ch * 0.42);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.48 + openProgress * 0.45;
      for (var i = 0; i < 16; i++) {
        var a = st.t * (2.2 + i * 0.11) + i * 0.62;
        var rad = t.r * (0.22 + (i % 5) * 0.13 + openProgress * 0.24);
        var sx = Math.cos(a) * rad;
        var sy = -t.r * (0.58 + (i % 4) * 0.14) + Math.sin(a * 1.4) * 14;
        ART.circle(ctx, sx, sy, 3 + (i % 4), i % 3 ? '#fff5b8' : '#62e6ff');
      }
      ctx.restore();
    }

    if (!t.opened && t.hp === 1) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#fff0a0';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-cw * 0.16, -ch * 0.45);
      ctx.lineTo(-cw * 0.02, -ch * 0.33);
      ctx.lineTo(-cw * 0.08, -ch * 0.12);
      ctx.lineTo(cw * 0.05, ch * 0.03);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.32 + Math.sin(st.t * 7) * 0.12;
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.restore();
    }

    if (flash > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = flash * 0.45;
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(-cw / 2, -ch * 0.62, cw, ch);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTarget(t) {
    var frozen = st.t < t.frozenUntil;
    ctx.save();
    var wob = Math.sin(st.t * 40) * (t.wobble || 0) * 4;
    ctx.translate(t.x + wob, t.y);
    drawGroundShadow(t);
    drawObjectAura(t);

    if (t.type === 'obstacle') {
      if (t.kind === 'shield') {
        // Painted wooden shield (falls back to simple circles if sprite missing)
        var sr = t.r;
        ctx.rotate(t.angle || 0);
        var shImg = SPRITES.get('obstacle_shield');
        if (shImg) {
          var ss = sr * 2.15;
          ctx.drawImage(shImg, -ss / 2, -ss / 2, ss, ss);
        } else {
          ART.circle(ctx, 0, 0, sr, '#8a5a2b');
          ART.circle(ctx, 0, 0, sr * 0.92, '#a76b36');
          ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(0, 0, sr * 0.96, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (t.kind === 'wall') {
        // Painted stone pillar — arc your shot over the top
        var hw = t.w / 2, hh = t.h / 2;
        var wImg = SPRITES.get('obstacle_wall');
        if (wImg) {
          // sprite is a tall pillar; stretch to wall hitbox with a little bleed
          ctx.drawImage(wImg, -hw * 1.15, -hh * 1.05, t.w * 1.3, t.h * 1.12);
        } else {
          ART.rr(ctx, -hw, -hh, t.w, t.h, 8, '#6a6e78');
          ART.rr(ctx, -hw - 4, -hh - 10, t.w + 8, 18, 6, '#9aa3ab');
        }
      }
      ctx.restore();
      return;
    }

    if (t.type === 'bullseye') {
      var timg = gradedSprite('target') || SPRITES.get('target');
      // plain disc (used for swing + easel styles, and as fallback)
      var drawDisc = function () {
        if (timg) {
          var tw = t.r * 2.15;
          var th = tw * timg.height / timg.width;
          // a gentle horizontal breathe reads as the disc turning in space
          var turn = reducedMotion() ? 0 : Math.sin(st.t * 1.1 + t.mt * 0.7) * 0.035;
          ctx.save();
          ctx.scale(1 + turn, 1);
          ctx.drawImage(timg, -tw / 2, -th / 2, tw, th);
          ctx.restore();
        } else {
          var rings = [
            [1, '#f4ead2'], [0.78, '#2a2622'], [0.58, '#3aa0e8'], [0.38, '#e23b3b'], [0.2, '#ffd23a']
          ];
          rings.forEach(function (r) { ART.circle(ctx, 0, 0, t.r * r[0], r[1]); });
        }
      };

      if (t.motion === 'swing') {
        // rope
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -t.r);
        ctx.lineTo(t.anchor.x - (t.x + wob), t.anchor.y - t.y);
        ctx.stroke();
        drawDisc();
      } else if (t.standStyle === 'easel' && !t.far) {
        // tall wooden easel (V6 art), feet on the ground, disc resting on it
        var easel = gradedSprite('target_stand') || SPRITES.get('target_stand');
        if (easel) {
          var ew = t.r * 2.5, eh = ew * easel.height / easel.width;
          ctx.drawImage(easel, -ew / 2, GROUND - t.y - eh, ew, eh);
        } else {
          ART.drawTargetStand(ctx, t.r, GROUND - t.y, timg);
        }
        drawDisc();
      } else {
        // self-standing turntable unit (V6 art): the frames gently turn in 3D.
        // Disc center in the frame art sits ~41% down; pin that to the hitbox.
        // Only frames 0-3: past that the painted disc drifts off the true
        // hit center and ring scoring would feel unfair.
        var fi = reducedMotion() ? 0 : Math.round((Math.sin(st.t * 0.8 + (t.mt || 0)) * 0.5 + 0.5) * 3);
        var unit = gradedSprite('target_3d_' + fi) || SPRITES.get('target_3d_' + fi);
        if (unit) {
          var uw = t.r * 2.85, uh = uw * unit.height / unit.width;
          ctx.drawImage(unit, -uw / 2, -uh * 0.41, uw, uh);
        } else {
          ART.drawTargetStand(ctx, t.r, t.far ? t.r * 1.18 : GROUND - t.y, timg);
          drawDisc();
        }
      }

      if (t.far) {
        // atmospheric veil: distant objects pick up the sky's haze color
        var amb = ambient();
        var hz = ctx.createRadialGradient(0, 0, t.r * 0.2, 0, 0, t.r * 1.4);
        hz.addColorStop(0, 'rgba(' + amb.haze + ',0.18)');
        hz.addColorStop(1, 'rgba(' + amb.haze + ',0)');
        ctx.fillStyle = hz;
        ctx.beginPath(); ctx.arc(0, 0, t.r * 1.4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (t.type === 'balloon') {
      // baked 3D turntable, sine-cycled like target_3d (sway = per-balloon
      // phase). Measured art geometry: bulb center sits 56% down the frame
      // and spans 46.5% of its width, so draw width r*4.65 keeps the bulb's
      // on-screen footprint equal to the old flat blit (old pin -bh*0.42).
      var bf = reducedMotion() ? 0 : Math.round((Math.sin(st.t * 0.9 + (t.sway || 0)) * 0.5 + 0.5) * 5);
      var bimg = gradedSprite('balloon_3d_' + bf) || SPRITES.get('balloon_3d_' + bf);
      if (bimg) {
        var bw = t.r * 4.65;
        var bh = bw * bimg.height / bimg.width;
        // hue variants are baked once per (frame,biome,hue) into the shared cache
        if (t.hue) bimg = hueShiftedImg(bimg, 'balloon_3d_' + bf + '|' + (st.bgName || ''), t.hue) || bimg;
        ctx.drawImage(bimg, -bw / 2, -bh * 0.56, bw, bh);
      } else {
        // flat balloon.png fallback: short string baked in, needs its own pin
        // plus a painted specular so the bulb reads round
        var fimg = gradedSprite('balloon') || SPRITES.get('balloon');
        if (fimg) {
          var fw2 = t.r * 2.3;
          var fh2 = fw2 * fimg.height / fimg.width;
          if (t.hue) fimg = hueShiftedImg(fimg, 'balloon|' + (st.bgName || ''), t.hue) || fimg;
          ctx.drawImage(fimg, -fw2 / 2, -fh2 * 0.42, fw2, fh2);
          var sr = t.r * 0.92;
          var spec = memoGlowSprite('balloon-spec|' + Math.round(t.r), sr, function (c, R) {
            var g = c.createRadialGradient(R - t.r * 0.34, R - t.r * 0.35, 2, R - t.r * 0.34, R - t.r * 0.35, t.r * 0.85);
            g.addColorStop(0, 'rgba(255,255,255,0.32)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g;
            c.beginPath();
            c.arc(R, R, R, 0, Math.PI * 2);
            c.fill();
          });
          ctx.drawImage(spec.sp, -spec.R, -t.r * 0.05 - spec.R, spec.R * 2, spec.R * 2);
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, t.r);
          ctx.quadraticCurveTo(8, t.r + 25, -4, t.r + 48);
          ctx.stroke();
          ART.ellipse(ctx, 0, 0, t.r * 0.85, t.r, t.color);
          ART.ellipse(ctx, -t.r * 0.3, -t.r * 0.35, t.r * 0.22, t.r * 0.3, 'rgba(255,255,255,0.5)');
          ctx.fillStyle = t.color;
          ctx.beginPath();
          ctx.moveTo(-6, t.r - 2); ctx.lineTo(6, t.r - 2); ctx.lineTo(0, t.r + 8);
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (t.type === 'doodle') {
      // One of Penny's drawings, presented like a paper sticker: white
      // backing sheet first, then the drawing swaying gently on top.
      var side = t.r * 2.3;
      ctx.save();
      ctx.rotate(t.rot);
      ART.rr(ctx, -side / 2 - 4, -side / 2 - 4, side + 8, side + 8, side * 0.14, '#e8e4d8'); // sticker edge
      ART.rr(ctx, -side / 2, -side / 2, side, side, side * 0.12, '#fdfbf2');                 // paper sheet
      var dWob = reducedMotion() ? 0 : Math.sin(st.t * 2.2 + t.seed) * 0.1;   // ±0.1 rad sway
      var dBreathe = reducedMotion() ? 1 : 1 + Math.sin(st.t * 1.7 + t.seed) * 0.05; // 0.95..1.05
      ctx.rotate(dWob);
      ctx.scale(1, dBreathe);
      var dimg = SPRITES.get(t.sprite);
      var inner = side * 0.84;
      if (dimg) {
        ctx.drawImage(dimg, -inner / 2, -inner / 2, inner, inner);
      } else {
        // Fallback: a green crayon scribble blob so it still reads as art.
        ctx.strokeStyle = '#5aa02c';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (var ds = 0; ds < 16; ds++) {
          var da = t.seed + ds * 0.62;
          var dr = inner * 0.14 + (ds % 4) * inner * 0.055;
          var dxp = Math.cos(da) * dr * 1.15, dyp = Math.sin(da) * dr;
          if (ds === 0) ctx.moveTo(dxp, dyp);
          else ctx.quadraticCurveTo(Math.cos(da + 0.3) * dr * 1.7, Math.sin(da + 0.3) * dr * 1.4, dxp, dyp);
        }
        ctx.stroke();
        // two quick googly eyes make even a scribble feel alive
        ART.circle(ctx, -inner * 0.13, -inner * 0.08, inner * 0.075, '#ffffff');
        ART.circle(ctx, inner * 0.13, -inner * 0.08, inner * 0.075, '#ffffff');
        ART.circle(ctx, -inner * 0.11, -inner * 0.06, inner * 0.034, '#20242c');
        ART.circle(ctx, inner * 0.15, -inner * 0.06, inner * 0.034, '#20242c');
      }
      ctx.restore();
    } else if (t.type === 'fruit') {
      // apple + watermelon + banana have V6 tumble frames (real 3D turnaround);
      // the frames do the spinning, so only a light sway on top
      var f3d = null;
      if (t.kind === 'apple' || t.kind === 'watermelon' || t.kind === 'banana') {
        var ffi = reducedMotion() ? 0 : Math.floor((t.mt || 0) * 7) % 6;
        f3d = gradedSprite('fruit_' + t.kind + '_3d_' + ffi) || SPRITES.get('fruit_' + t.kind + '_3d_' + ffi);
      }
      var fimg = null;
      if (f3d) {
        if (!reducedMotion()) ctx.rotate(Math.sin((t.mt || 0) * 2.2) * 0.22 * (t.spin >= 0 ? 1 : -1));
        var f3w = t.r * 2.9, f3h = f3w * f3d.height / f3d.width;
        ctx.drawImage(f3d, -f3w / 2, -f3h / 2, f3w, f3h);
      } else {
        ctx.rotate(t.mt * (t.spin || 1));
        fimg = gradedSprite('fruit_' + t.kind) || SPRITES.get('fruit_' + t.kind);
      }
      if (f3d) {
        // drawn above
      } else if (fimg) {
        var fw = t.r * 2.6;
        var fh = fw * fimg.height / fimg.width;
        ctx.drawImage(fimg, -fw / 2, -fh / 2, fw, fh);
      } else if (t.kind === 'apple') {
        ART.circle(ctx, 0, 0, t.r, '#e23b3b');
        ART.ellipse(ctx, -t.r * 0.3, -t.r * 0.35, t.r * 0.2, t.r * 0.28, 'rgba(255,255,255,0.35)');
        ctx.strokeStyle = '#6f4b27'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, -t.r); ctx.lineTo(4, -t.r - 12); ctx.stroke();
        ART.ellipse(ctx, 12, -t.r - 8, 9, 5, '#2f9d4e');
      } else if (t.kind === 'orange') {
        ART.circle(ctx, 0, 0, t.r, '#ff9a1a');
        ART.circle(ctx, 0, 0, t.r * 0.85, '#ffae3d');
        ART.ellipse(ctx, 0, -t.r + 2, 7, 4, '#2f9d4e');
      } else {
        ART.circle(ctx, 0, 0, t.r, '#2f9d4e');
        ART.circle(ctx, 0, 0, t.r * 0.82, '#8fd14f');
        ART.circle(ctx, 0, 0, t.r * 0.68, '#ff5f7a');
        ctx.fillStyle = '#2a2622';
        for (var i = 0; i < 5; i++) {
          var a = i * 1.3 + 0.4;
          ART.ellipse(ctx, Math.cos(a) * t.r * 0.4, Math.sin(a) * t.r * 0.4, 3, 4.5, '#2a2622');
        }
      }
    } else if (t.type === 'golden') {
      // glowing halo + a golden banana
      var gg = memoGlowSprite('golden-halo', t.r * 1.9, function (c, R) {
        var g = c.createRadialGradient(R, R, R * 0.03, R, R, R);
        g.addColorStop(0, 'rgba(255,231,90,0.85)');
        g.addColorStop(1, 'rgba(255,231,90,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, R * 2, R * 2);
      });
      ctx.drawImage(gg.sp, -gg.R, -gg.R, gg.R * 2, gg.R * 2);
      ctx.rotate(Math.sin(t.mt * 3) * 0.25);
      var gimg = SPRITES.get('fruit_banana');
      if (gimg) {
        var gw = t.r * 2.7, gh = gw * gimg.height / gimg.width;
        ctx.save(); ctx.filter = 'brightness(1.15) saturate(1.5)';
        ctx.drawImage(gimg, -gw / 2, -gh / 2, gw, gh);
        ctx.filter = 'none'; ctx.restore();
      } else {
        ART.circle(ctx, 0, 0, t.r, '#ffd23a');
      }
    } else if (t.type === 'powerup') {
      var pimg = gradedSprite(t.kind === 'arrows' ? 'pickup_arrows' : 'pickup_slowmo') ||
                 SPRITES.get(t.kind === 'arrows' ? 'pickup_arrows' : 'pickup_slowmo');
      if (pimg) {
        // rendered pickup art (V6); it carries its own glow
        var pw = t.r * 2.5, ph = pw * pimg.height / pimg.width;
        var ppulse = reducedMotion() ? 1 : 1 + Math.sin(st.t * 4 + (t.mt || 0)) * 0.05;
        ctx.save();
        ctx.scale(ppulse, ppulse);
        ctx.drawImage(pimg, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
        ctx.restore();
        return;
      }
      var puColors = t.kind === 'arrows' ?
        ['#d4f7a0', '#9fd636', '#527f18'] : ['#c4f2ff', '#62e6ff', '#1f7fa6'];
      ART.circle(ctx, 0, 0, t.r + 3, 'rgba(255,255,255,0.85)');
      // shaded like a sphere (lit up-left) instead of a flat sticker circle
      var ball = ctx.createRadialGradient(-t.r * 0.32, -t.r * 0.36, 2, 0, 0, t.r * 1.05);
      ball.addColorStop(0, puColors[0]);
      ball.addColorStop(0.55, puColors[1]);
      ball.addColorStop(1, puColors[2]);
      ctx.fillStyle = ball;
      ctx.beginPath(); ctx.arc(0, 0, t.r, 0, Math.PI * 2); ctx.fill();
      ART.ellipse(ctx, -t.r * 0.32, -t.r * 0.4, t.r * 0.22, t.r * 0.28, 'rgba(255,255,255,0.55)');
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + Math.round(t.r * 1.0) + 'px Nunito, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.kind === 'arrows' ? '+3' : '⏱', 0, 2);
    } else if (t.type === 'bossShot') {
      // Telegraphed projectile — big readable stone / spit blob kids can shoot.
      var pulse = reducedMotion() ? 1 : 1 + Math.sin(st.t * 10) * 0.08;
      var glowCol = t.kind === 'spit' ? 'rgba(98,230,255,0.7)' : 'rgba(255,210,58,0.7)';
      var glow = memoGlowSprite('boss-shot|' + (t.kind || 'stone'), t.r * 1.8, function (c, R) {
        var g = c.createRadialGradient(R, R, R * 0.05, R, R, R);
        g.addColorStop(0, glowCol);
        g.addColorStop(1, 'rgba(255,210,58,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, R * 2, R * 2);
      });
      ctx.drawImage(glow.sp, -glow.R * pulse, -glow.R * pulse, glow.R * 2 * pulse, glow.R * 2 * pulse);
      if (t.kind === 'spit') {
        ART.circle(ctx, 0, 0, t.r * pulse, '#62e6ff');
        ART.circle(ctx, -t.r * 0.25, -t.r * 0.3, t.r * 0.35, 'rgba(255,255,255,0.65)');
        ART.circle(ctx, 0, 0, t.r * 0.45, '#1a7fb8');
      } else {
        ART.circle(ctx, 0, 0, t.r * pulse, '#9aa7b8');
        ART.circle(ctx, -t.r * 0.2, -t.r * 0.25, t.r * 0.55, '#c5ced8');
        ART.circle(ctx, t.r * 0.25, t.r * 0.15, t.r * 0.28, '#6d7888');
      }
    } else if (t.type === 'boss') {
      var bdef = resolveBossDef(t.bossId);
      var bossSprite = bossDamageSprite(bdef, t);
      // Workshop bosses get their hue-shifted recolor first; normal bosses
      // (bdef.hue falsy) take the exact same graded-sprite path as always.
      var bossImg = (bdef.hue ? hueShiftedSprite(bossSprite, bdef.hue) : null) ||
        gradedSprite(bossSprite) || gradedSprite(bdef.sprite) || SPRITES.get(bossSprite) || SPRITES.get(bdef.sprite);
      var bossDraw = drawBoss2p5D(t, bdef, bossImg, bdef.wobbleAmp);
      if (!bossImg) {   // the Moonstone art already wears its crown
        ctx.font = Math.round(t.r * 0.7) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('👑', 0, -t.r * 0.85);
      }
      // health bar (kept clear of the taller boss art)
      var hbw = t.r * 1.6, hx = -hbw / 2;
      var hy = (bossImg ? -bossDraw.bh / 2 - bossDraw.byoff - 26 : -t.r - 30);
      ART.rr(ctx, hx - 3, hy - 3, hbw + 6, 20, 8, 'rgba(0,0,0,0.5)');
      ART.rr(ctx, hx, hy, hbw * Math.max(0, t.hp) / t.maxHp, 14, 7, '#ff4d6d');
    } else if (t.type === 'chest') {
      var cname = t.opened ? 'chest_open' : (t.hp === 1 ? 'chest_semi' : 'chest_closed');
      var cimg = gradedSprite(cname) || SPRITES.get(cname);
      if (cimg) {
        drawChest2p5D(t, cimg);
      } else {
      ART.rr(ctx, -44, -20, 88, 54, 8, '#8a5a2b');
      ART.rr(ctx, -44, -34, 88, 26, 10, '#a06a35');
      ART.rr(ctx, -44, -12, 88, 7, 3, '#e8a91d');
      ART.rr(ctx, -8, -18, 16, 22, 4, '#ffd23a');
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(-5, -12, 10, 8);
      if (t.hp === 1) { // cracked
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-30, -30); ctx.lineTo(-18, -12); ctx.lineTo(-26, 8); ctx.lineTo(-14, 24);
        ctx.stroke();
      }
      }
    }

    // frozen overlay
    if (frozen) {
      ctx.fillStyle = 'rgba(150,220,255,0.45)';
      ctx.strokeStyle = 'rgba(220,245,255,0.9)';
      ctx.lineWidth = 4;
      var R = t.r + 12;
      ctx.beginPath();
      for (var k = 0; k < 8; k++) {
        var aa = k * Math.PI / 4 + 0.4;
        var rr2 = R * (k % 2 ? 0.92 : 1.08);
        ctx.lineTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }


  // ---- Wind leaf particles (gameplay cue, separate from biome weather) ----
  function ensureWindLeaves() {
    if (!st || !st.rules) return;
    var wind = st.rules.wind || 0;
    if (Math.abs(wind) < TUNING.WIND_MIN_SHOW || reducedMotion()) {
      st.windLeaves = null;
      return;
    }
    if (st.windLeaves && st.windLeaves.length) return;
    var n = 10 + Math.round(8 * Math.min(1, Math.abs(wind) / TUNING.WIND_MAX));
    var dir = wind >= 0 ? 1 : -1;
    var cols = ['#a8d43a', '#d9a621', '#8bc34a', '#e8b23a', '#c4e86a'];
    st.windLeaves = [];
    for (var i = 0; i < n; i++) {
      st.windLeaves.push({
        x: Math.random() * W,
        y: 40 + Math.random() * (GROUND - 120),
        sp: 70 + Math.random() * 120,
        r: 3.5 + Math.random() * 3.5,
        rot: Math.random() * 6.28,
        vr: (Math.random() * 2 - 1) * 4,
        sw: 20 + Math.random() * 30,
        ph: Math.random() * 6.28,
        c: cols[i % cols.length],
        dir: dir
      });
    }
  }

  function drawWindLeaves() {
    if (reducedMotion()) return;
    ensureWindLeaves();
    var leaves = st.windLeaves;
    if (!leaves || !leaves.length) return;
    var wind = st.rules.wind || 0;
    var boost = 0.7 + Math.min(1, Math.abs(wind) / TUNING.WIND_MAX);
    ctx.save();
    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      var x = ((L.x + L.dir * L.sp * boost * st.t) % (W + 80) + (W + 80)) % (W + 80) - 40;
      var y = L.y + Math.sin(st.t * 1.7 + L.ph) * L.sw;
      var rot = L.rot + st.t * L.vr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = L.c;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, 0, L.r * 1.6, L.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawAim() {
    if (!st.aiming || st.aim.power < 0.05) return;
    var a = st.arrowType;
    var speedFactor = a.speedFactor * (1 + (st.perk.speedBonus || 0));
    var speed = (650 + st.aim.power * 1450) * speedFactor;
    var p = {
      x: BOW.x, y: BOW.y,
      vx: Math.cos(st.aim.angle) * speed,
      vy: Math.sin(st.aim.angle) * speed
    };
    var steps = Math.floor(26 * (st.perk.previewBonus || 1));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < steps; i++) {
      var ax0 = p.x, ay0 = p.y;
      for (var k = 0; k < 3; k++) simStep(p, 1 / 90);
      // Preview tells the truth: stop the dots if the path hits a blocker.
      var blocked = false;
      for (var oi = 0; oi < st.targets.length; oi++) {
        var obs = st.targets[oi];
        if (obs.dead || obs.type !== 'obstacle') continue;
        if (hitObstacle(ax0, ay0, p.x, p.y, obs)) { blocked = true; break; }
      }
      if (blocked) break;
      if (i % 2 === 0) {
        ctx.globalAlpha = 1 - i / steps * 0.7;
        ART.circle(ctx, p.x, p.y, 6 - i / steps * 3, i < 4 ? '#fff' : '#ffe9a8');
      }
    }
    ctx.globalAlpha = 1;
  }

  // Where the bow's arrow-rest sits inside the archer pose sprite, as a fraction
  // of the image (calibrated so the painted bow lands on the BOW anchor).
  var ARCHER_BOW_FX = 0.82, ARCHER_BOW_FY = 0.64, ARCHER_HEIGHT = 320;
  var ARCHER_DEBUG = false;


  function drawPet() {
    // Cosmetic sidekick — painted turntable wobble (frames 0..2) + cheer (last).
    if (typeof TUNING === 'undefined' || !TUNING.SHOW_PET) return;
    var id = st.profile && st.profile.equipped ? st.profile.equipped.pet : null;
    if (!id) return;
    var pet = (typeof DATA !== 'undefined' && DATA.petById) ? DATA.petById(id) : null;
    if (pet && pet.comingSoon) return;
    var frames = (pet && pet.frames && pet.frames.length) ? pet.frames : null;
    var cheer = st.petCheer || 0;
    var img = null;
    if (frames) {
      if (cheer > 0.15) {
        // Mesh turntables: hop on current angle. Painted sets: last frame is cheer pose.
        var cheerIdx = frames.length >= 5 ? Math.floor(st.t * 2.4) % Math.min(6, frames.length) : (frames.length - 1);
        img = SPRITES.get(frames[cheerIdx]) || SPRITES.get(frames[0]);
      } else if (frames.length >= 5) {
        // Full mesh turntable (TripoSR bake) — same cadence as balloon_3d
        var n = Math.min(6, frames.length);
        var idx = reducedMotion() ? 0 : Math.floor(st.t * 2.4) % n;
        img = SPRITES.get(frames[idx]) || SPRITES.get(frames[0]);
      } else {
        // Painted multi-angle wobble: front → left → front → right
        var wobbleN = Math.min(3, frames.length);
        var phase = reducedMotion() ? 0 : Math.floor(st.t * 2.4) % 4;
        var idx2 = phase === 0 ? 0 : (phase === 1 ? Math.min(1, wobbleN - 1) : (phase === 2 ? 0 : Math.min(2, wobbleN - 1)));
        img = SPRITES.get(frames[idx2]) || SPRITES.get(frames[0]);
      }
    }
    if (!img) img = SPRITES.get('pet_' + id + '_0');
    if (!img) return;
    var bob = reducedMotion() ? 0 : Math.sin(st.t * 3.2) * 10;
    var hop = cheer > 0 ? Math.sin((1 - cheer) * Math.PI) * 28 : 0;
    var px = BOW.x - 150 + (reducedMotion() ? 0 : Math.sin(st.t * 1.7) * 6);
    var py = BOW.y - 40 + bob - hop;
    var s = 88 + (cheer > 0 ? 10 : 0);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ART.ellipse(ctx, px, GROUND + 2, s * 0.28, 7, 'rgba(20,16,20,1)');
    ctx.globalAlpha = 0.98;
    ctx.drawImage(img, px - s / 2, py - s / 2, s, s);
    ctx.restore();
  }

  function drawPlayer() {
    var p = st.profile;
    var id = p.equipped.character;
    var angle = st.aiming ? st.aim.angle : -0.25;
    var draw = st.aiming ? st.aim.power : 0;
    var recoil = st.releaseKick || 0;
    // Draw-stage frames: 0 = relaxed, 1 = half draw, 2 = full draw. The string
    // hand pulls back as you aim harder. Characters without frames fall back to
    // the single static archer pose.
    var frame = !st.aiming ? 0 : (draw < 0.5 ? 1 : 2);
    var poseImg = gradedSprite('char_' + id + '_draw' + frame);
    var hasFrames = !!poseImg;
    if (!poseImg) poseImg = gradedSprite('char_' + id + '_archer');
    // Lean back a touch while drawing, kick forward on release. While relaxed
    // the archer breathes — a gentle sway so the hero never freezes like a
    // cardboard cutout (pinned while aiming so the bow anchor stays true).
    var breathe = (!st.aiming && !reducedMotion()) ? Math.sin(st.t * 2.1) * 2.2 : 0;
    var lean = -draw * 8 + recoil * 14 + breathe * 0.6;
    var liftY = draw * 2 + breathe;
    var bx = BOW.x + lean, by = BOW.y + liftY;

    if (poseImg) {
      var h = ARCHER_HEIGHT;
      var w = poseImg.width * (h / poseImg.height);
      var dx = bx - ARCHER_BOW_FX * w;
      var dy = by - ARCHER_BOW_FY * h;
      // contact shadow at the feet grounds the archer in the scene
      ctx.save();
      var psx = dx + w * 0.48, psy = dy + h + 4;
      var pr = w * 0.42;
      ctx.translate(psx, psy);
      ctx.scale(1, 0.16);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(shadowSprite(), -pr, -pr, pr * 2, pr * 2);
      ctx.restore();
      ctx.save();
      if (p.equipped.shiny) { ctx.shadowColor = 'rgba(255,247,180,0.95)'; ctx.shadowBlur = (TUNING.SHINY_GLOW_BLUR || 28); }
      ctx.drawImage(poseImg, dx, dy, w, h);
      ctx.restore();
    } else {
      // Fallback (pose sprite not loaded yet): old articulated arms.
      var outfit = DATA.outfitById(p.equipped.outfit);
      ART.drawCharacter(ctx, id, 150, GROUND + 10, 1.15, {
        hat: p.equipped.hat, outfitColor: outfit.swap, outfitId: p.equipped.outfit,
        shiny: p.equipped.shiny, t: st.t, look: 1,
        aimPower: draw, aimAngle: angle, recoil: recoil, archer: true
      });
      var fnX = BOW.x - Math.cos(angle) * draw * 46, fnY = BOW.y - Math.sin(angle) * draw * 46;
      ART.drawArcherArms(ctx, id, 150, GROUND + 10, 1.15, { x: BOW.x, y: BOW.y },
        { x: fnX, y: fnY }, { aimPower: draw, aimAngle: angle, recoil: recoil });
      ART.drawBow(ctx, BOW.x, BOW.y, angle, draw, 1.2, hasGoldenBow());
    }

    // Nocked arrow for poses WITHOUT baked draw frames (the draw frames already
    // show the arrow pulling back). Aim direction comes from drawAim's dots.
    if (!hasFrames) {
      var nockX = bx - Math.cos(angle) * draw * 46;
      var nockY = by - Math.sin(angle) * draw * 46;
      if (!st.aiming && st.arrowsLeft > 0 && !st.over) {
        ART.drawArrow(ctx, bx, by, angle, st.arrowType, 1, st.t, { goldTrail: hasGoldenBow() });
      } else if (st.aiming) {
        ART.drawArrow(ctx, nockX, nockY, st.aim.angle, st.arrowType, 1, st.t, { goldTrail: hasGoldenBow() });
      }
    }

    if (ARCHER_DEBUG) {
      ctx.save();
      ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx - 16, by); ctx.lineTo(bx + 16, by);
      ctx.moveTo(bx, by - 16); ctx.lineTo(bx, by + 16);
      ctx.stroke();
      ctx.restore();
    }
  }

  function hudPanel(x, y, w, h) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ART.rr(ctx, x, y, w, h, h / 2, 'rgba(26,24,34,0.86)');
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, w - 2, h - 2, h / 2 - 1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ART.rr(ctx, x + 10, y + 6, w - 20, Math.max(4, h * 0.22), h * 0.12, 'rgba(255,255,255,0.08)');
    ctx.restore();
  }

  function drawHUD() {
    ctx.textBaseline = 'middle';

    // coins — top left
    hudPanel(28, 24, 190, 52);
    ART.drawCoin(ctx, 60, 50, 17);
    ctx.fillStyle = '#ffd23a';
    ctx.font = '800 30px Nunito, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String((st.profile.coins || 0) + st.coinsDirect), 88, 52);

    // score — under coins
    hudPanel(28, 86, 190, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '800 24px Nunito, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('★ ' + st.score, 52, 109);

    // combo multiplier — under score
    if (st.comboMult > 1) {
      var pulse = 1 + Math.sin(st.t * 12) * 0.06;
      hudPanel(28, 140, 150, 42);
      ctx.fillStyle = '#ff8a3a';
      ctx.font = '900 ' + Math.round(26 * pulse) + 'px Lilita One, Nunito, sans-serif';
      ctx.fillText('🔥 x' + st.comboMult, 48, 162);
    }

    // slow-motion indicator
    if (st.t < st.slowUntil) {
      ctx.fillStyle = 'rgba(98,230,255,0.9)';
      ctx.font = '800 22px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⏱ SLOW-MO', W / 2, 110);
    }

    // wind flag — windy rounds only. The arrow points WHERE the breeze blows
    // (+wind pushes arrows toward the targets) and stretches with its strength.
    // Calm rounds show nothing. It's gameplay info, so it draws even under
    // reduced motion — only the flutter animation sits that out.
    var wind = st.rules.wind || 0;
    if (Math.abs(wind) >= TUNING.WIND_MIN_SHOW) {
      var wdir = wind > 0 ? 1 : -1;
      var wk = Math.min(1, Math.abs(wind) / TUNING.WIND_MAX);
      var wx = W / 2 + 320, wy = 50;
      hudPanel(wx - 88, wy - 26, 176, 52);
      ctx.save();
      ctx.translate(wx, wy + (reducedMotion() ? 0 : Math.sin(st.t * 7) * 3 * (0.5 + wk)));
      ctx.strokeStyle = ctx.fillStyle = '#8fdcff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      var whalf = 20 + 36 * wk;                 // longer arrow = stronger gust
      ctx.beginPath();
      ctx.moveTo(-wdir * whalf, 0); ctx.lineTo(wdir * whalf, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wdir * (whalf + 11), 0);
      ctx.lineTo(wdir * (whalf - 8), -9);
      ctx.lineTo(wdir * (whalf - 8), 9);
      ctx.closePath(); ctx.fill();
      for (var gl = 0; gl < 2; gl++) {          // trailing gust lines appear as it blusters
        if (wk < 0.4 + gl * 0.35) break;
        ctx.globalAlpha = 0.55;
        var gly = gl === 0 ? -13 : 13;
        ctx.beginPath();
        ctx.moveTo(-wdir * (whalf * 0.45), gly);
        ctx.lineTo(-wdir * (whalf * 0.95), gly);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // timer — top center
    if (st.rules.endless) {
      // MARATHON: no clock! Show the wave number — arrows are the real life bar.
      hudPanel(W / 2 - 110, 24, 220, 56);
      ctx.fillStyle = '#ffd23a';
      ctx.font = '900 30px Lilita One, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WAVE ' + st.wave, W / 2, 53);
    } else {
    var urgent = st.time <= 5.5;
    hudPanel(W / 2 - 110, 24, 220, 56);
    ctx.fillStyle = urgent ? '#ff5f5f' : '#fff';
    ctx.font = '800 36px Nunito, sans-serif';
    ctx.textAlign = 'center';
    var tsec = Math.max(0, Math.ceil(st.time));
    var mm = Math.floor(tsec / 60), ss = ('0' + (tsec % 60)).slice(-2);
    var scalePulse = urgent ? 1 + Math.sin(st.t * 10) * 0.06 : 1;
    ctx.save();
    ctx.translate(W / 2 + 14, 53);
    ctx.scale(scalePulse, scalePulse);
    ctx.fillText(mm + ':' + ss, 0, 0);
    ctx.restore();
    ctx.font = '26px sans-serif';
    ctx.fillText('⏱', W / 2 - 72, 52);
    } // end normal-timer branch
    if (st.rules.label) {
      ctx.fillStyle = 'rgba(26,24,34,0.78)';
      ART.rr(ctx, W / 2 - 180, 88, 360, 38, 19, 'rgba(26,24,34,0.78)');
      ctx.fillStyle = '#ffd23a';
      ctx.font = '800 19px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.rules.label, W / 2, 108);
    }

    // pause button — right of the timer
    if (st.countdown <= 0 && !st.over) {
      hudPanel(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h);
      ctx.fillStyle = '#fff';
      if (paused) {
        ctx.beginPath();
        ctx.moveTo(PAUSE_BTN.x + 22, PAUSE_BTN.y + 16);
        ctx.lineTo(PAUSE_BTN.x + 42, PAUSE_BTN.y + 28);
        ctx.lineTo(PAUSE_BTN.x + 22, PAUSE_BTN.y + 40);
        ctx.closePath(); ctx.fill();
      } else {
        ART.rr(ctx, PAUSE_BTN.x + 18, PAUSE_BTN.y + 15, 7, 26, 3, '#fff');
        ART.rr(ctx, PAUSE_BTN.x + 31, PAUSE_BTN.y + 15, 7, 26, 3, '#fff');
      }
    }

    // arrows — top right
    hudPanel(W - 218, 24, 190, 52);
    ART.drawArrow(ctx, W - 168, 50, -0.5, st.arrowType, 0.62, st.t);
    ctx.fillStyle = '#fff';
    ctx.font = '800 30px Nunito, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('×' + st.arrowsLeft, W - 128, 52);

    // floaters
    st.floaters.forEach(function (f) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.font = '900 ' + (f.big ? 44 : 30) + 'px Lilita One, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 5;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    });
  }

  function render() {
    ctx.save();
    // one shake vector per frame, shared by every layer: the global translate
    // is the x1.0 baseline and depth layers add their own multiple on top
    // (far bg x0.85, fg strips x1.4) so the world twists coherently
    st.shakeX = 0;
    st.shakeY = 0;
    if (!reducedMotion() && st.shake > 0) {
      st.shakeX = rand(-1, 1) * st.shake * 22;
      st.shakeY = rand(-1, 1) * st.shake * 22;
      ctx.translate(st.shakeX, st.shakeY);
    }

    // Photo Mode wraps ALL world layers in one pan/zoom transform.
    ctx.save();
    if (!photoMode && (st.camZoom || 1) !== 1) {
      // cinematic camera: gentle zoom + aim-lean drift (zoom ≥1.03 keeps
      // the eased offsets from revealing canvas edges)
      var cz = Math.max(1.0, st.camZoom || 1);
      var cxo = st.camX || 0, cyo = st.camY || 0;
      if (cz !== 1 || cxo || cyo) {
        ctx.translate(W / 2 + cxo, H / 2 + cyo);
        ctx.scale(cz, cz);
        ctx.translate(-W / 2, -H / 2);
      }
    }
    if (photoMode) {
      ctx.fillStyle = '#14121c'; // letterbox tone behind any pan gaps at 1×
      ctx.fillRect(-240, -240, W + 480, H + 480);
      var pz = PHOTO_ZOOMS[photoZoomIdx];
      ctx.translate(W / 2 + photoPan.x, H / 2 + photoPan.y);
      ctx.scale(pz, pz);
      ctx.translate(-W / 2, -H / 2);
    }

    drawBackground();

    // Sky / haze rides with the far plane (counter-shake → net ×0.85).
    var farK = (typeof TUNING !== 'undefined' && TUNING.PARALLAX_FAR != null) ? TUNING.PARALLAX_FAR : 0.15;
    var actK = (typeof TUNING !== 'undefined' && TUNING.PARALLAX_ACTION != null) ? TUNING.PARALLAX_ACTION : 0.15;
    ctx.save();
    if (!reducedMotion() && (st.shakeX || st.shakeY)) {
      ctx.translate(-(st.shakeX || 0) * farK, -(st.shakeY || 0) * farK);
    }
    drawStageAtmosphere();
    drawDepthHaze();
    ctx.restore();

    // Action layer (targets, arrows, player, FX): net ×1.15 so it sits in front of bg.
    ctx.save();
    if (!reducedMotion() && (st.shakeX || st.shakeY)) {
      ctx.translate((st.shakeX || 0) * actK, (st.shakeY || 0) * actK);
    }
    st.targets.forEach(drawTarget);
    drawBlackholes();
    drawBrokenArrows();
    drawAim();
    drawPlayer();
    drawPet();

    // flying arrows cast a small running shadow on the ground below them
    st.arrows.forEach(function (a) {
      if (a.dead || a.y >= GROUND) return;
      var k = 1 - (GROUND - a.y) / 900;
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.05 + 0.15 * k;
      ART.ellipse(ctx, a.x, GROUND + 4, 14 + 16 * k, 4 + 2 * k, 'rgba(20,16,20,1)');
      ctx.restore();
    });

    // arrows in flight
    st.arrows.forEach(function (a) {
      if (a.dead) return;
      ART.drawArrow(ctx, a.x, a.y, Math.atan2(a.vy, a.vx), st.arrowType, 1, a.t, {
        flight: true,
        speed: Math.hypot(a.vx, a.vy),
        reducedMotion: reducedMotion(),
        goldTrail: hasGoldenBow()
      });
    });

    // the penguins' crossover flyby (above targets/arrows, below particles)
    drawPlanes();

    // lightning bolts
    st.bolts.forEach(function (b) {
      ctx.save();
      ctx.globalAlpha = b.life / 0.25;
      ctx.strokeStyle = '#ffe33a';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#ffe33a';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      var segs = 5;
      for (var i = 1; i <= segs; i++) {
        var u = i / segs;
        var jx = (Math.random() - 0.5) * 40 * (i < segs ? 1 : 0);
        var jy = (Math.random() - 0.5) * 40 * (i < segs ? 1 : 0);
        ctx.lineTo(b.x1 + (b.x2 - b.x1) * u + jx, b.y1 + (b.y2 - b.y1) * u + jy);
      }
      ctx.stroke();
      ctx.restore();
    });

    // particles
    st.particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max) * (p.flash ? 0.5 : 1);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = (p.lw || 6) * (p.life / p.max);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.shred) {
        // curling rubber shred: a little rotating arc
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0.35, Math.PI - 0.35);
        ctx.stroke();
        ctx.restore();
      } else if (p.string) {
        // the balloon's string, wiggling as it falls
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin((p.rot || 0) + st.t * 9) * 0.5);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(5, p.r * 0.6, 0, p.r);
        ctx.quadraticCurveTo(-5, p.r * 1.4, 0, p.r * 2);
        ctx.stroke();
        ctx.restore();
      } else if (p.line) {
        var L = Math.hypot(p.vx, p.vy) || 1;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx / L * p.r, p.y - p.vy / L * p.r);
        ctx.stroke();
      } else if (p.star) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.28, 0); ctx.lineTo(0, p.r); ctx.lineTo(-p.r * 0.28, 0);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-p.r, 0); ctx.lineTo(0, -p.r * 0.28); ctx.lineTo(p.r, 0); ctx.lineTo(0, p.r * 0.28);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.flash) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1.15 - p.life / p.max * 0.3), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ART.circle(ctx, p.x, p.y, p.r, p.color);
      }
      ctx.globalAlpha = 1;
    });

    // homing coins (undefined t under reduced motion => static 3D frame 0)
    st.coins.forEach(function (c) { ART.drawCoin(ctx, c.x, c.y, 13, reducedMotion() ? undefined : c.t); });

    ctx.restore(); // end action-layer parallax

    drawForegroundDepth();

    // live weather rides over the whole world but under the HUD
    drawWeather();
    drawWindLeaves();
    ctx.restore(); // end the photo pan/zoom world block

    if (photoMode) {
      // HUD and overlays stay hidden; only the minimal photo bar shows
      drawPhotoBar();
      ctx.restore();
      return;
    }

    drawHUD();

    // countdown
    if (st.countdown > 0) {
      ctx.fillStyle = 'rgba(20,18,28,0.45)';
      ctx.fillRect(0, 0, W, H);
      var n = Math.ceil(st.countdown);
      var label = n > 3 ? '' : (st.countdown < 0.35 ? 'GO!' : String(n));
      var frac = st.countdown % 1;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 + (1 - frac) * 0.4, 1 + (1 - frac) * 0.4);
      ctx.fillStyle = '#ffd23a';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 10;
      ctx.font = '900 150px Lilita One, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(label, 0, 0);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // pause overlay
    if (paused) {
      ctx.fillStyle = 'rgba(20,18,28,0.55)';
      ctx.fillRect(0, 0, W, H);
      ART.rr(ctx, W / 2 - 270, H / 2 - 210, 540, 420, 34, 'rgba(34,31,50,0.88)');
      ART.rr(ctx, W / 2 - 246, H / 2 - 186, 492, 372, 26, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = '#ffd23a';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 10;
      ctx.font = '900 120px Lilita One, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('PAUSED', W / 2, H / 2 - 110);
      ctx.fillText('PAUSED', W / 2, H / 2 - 110);
      // big friendly resume button
      var ry = H / 2 + 70;
      ctx.beginPath(); ctx.arc(W / 2, ry, RESUME_R + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      ctx.beginPath(); ctx.arc(W / 2, ry, RESUME_R, 0, Math.PI * 2);
      ctx.fillStyle = '#3d964c'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 20, ry - 32);
      ctx.lineTo(W / 2 + 34, ry);
      ctx.lineTo(W / 2 - 20, ry + 32);
      ctx.closePath(); ctx.fill();
      ctx.font = '800 26px Nunito, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('Tap to keep playing!', W / 2, ry + RESUME_R + 46);
      // [PHOTO] pill — opens the snapshot camera (same styling family as the HUD)
      ART.rr(ctx, PHOTO_PAUSE_BTN.x, PHOTO_PAUSE_BTN.y, PHOTO_PAUSE_BTN.w, PHOTO_PAUSE_BTN.h, 28, 'rgba(26,24,34,0.95)');
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(PHOTO_PAUSE_BTN.x + 1.5, PHOTO_PAUSE_BTN.y + 1.5, PHOTO_PAUSE_BTN.w - 3, PHOTO_PAUSE_BTN.h - 3, 26.5);
      ctx.stroke();
      ctx.fillStyle = '#ffd23a';
      ctx.font = '800 26px Nunito, sans-serif';
      ctx.fillText('📷 PHOTO', W / 2, PHOTO_PAUSE_BTN.y + PHOTO_PAUSE_BTN.h / 2 + 1);
    }

    // "TIME'S UP"
    if (st.over) {
      ctx.fillStyle = 'rgba(20,18,28,' + Math.min(0.5, st.overTimer) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd23a';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 8;
      ctx.font = '900 110px Lilita One, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var msg = st.rules.endless ? 'OUT OF ARROWS!' :
        (st.arrowsLeft <= 0 && st.time > 0 ? 'OUT OF ARROWS!' : "TIME'S UP!");
      ctx.strokeText(msg, W / 2, H / 2 - 20);
      ctx.fillText(msg, W / 2, H / 2 - 20);
    }

    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    raf = null;
    if (paused && !photoMode) return;
    var dt = Math.min(0.033, (now - (frame.last || now)) / 1000);
    frame.last = now;
    updateHeldKeys(dt); // keyboard aim/draw synthesis (same state the pointer uses)
    pollGamepad(dt);    // left-stick aim + A draw + Start/B edges
    if (!paused && !photoMode) update(dt); // photo mode: world frozen, render only
    render();
    requestFrame();
  }

  /* ============ input ============ */

  function worldPoint(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx / rect.width * W, y: cy / rect.height * H };
  }

  function aimFrom(pt) {
    var dx = BOW.x - pt.x;
    var dy = BOW.y - pt.y;
    var dist = Math.hypot(dx, dy);
    var lastPower = st.aim.power;
    st.aim.power = Math.min(1, dist / MAX_PULL);
    st.aim.angle = Math.atan2(dy, dx);
    if (Math.abs(st.aim.power - lastPower) > 0.06) AUDIO.stretch(st.aim.power);
  }

  function inRect(pt, r) {
    return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
  }

  function onDown(e) {
    e.preventDefault();
    AUDIO.unlock();
    if (!st || st.over) return;
    var pt = worldPoint(e);
    if (photoMode) {
      // pointer routes to photo controls instead of aiming
      if (Math.hypot(pt.x - PHOTO_SHUTTER.x, pt.y - PHOTO_SHUTTER.y) <= PHOTO_SHUTTER.r + 12) {
        takePhoto();
      } else if (inRect(pt, PHOTO_ZOOM_BTN)) {
        photoZoomIdx = (photoZoomIdx + 1) % PHOTO_ZOOMS.length;
        AUDIO.click();
      } else if (inRect(pt, PHOTO_EXIT_BTN)) {
        exitPhotoMode();
      } else {
        photoDragLast = pt; // begin a pan drag
      }
      return;
    }
    if (paused) {
      // only the big ▶ (or the HUD button) resumes; swallow all other taps
      if (Math.hypot(pt.x - W / 2, pt.y - (H / 2 + 70)) < RESUME_R + 30 ||
          (pt.x >= PAUSE_BTN.x && pt.x <= PAUSE_BTN.x + PAUSE_BTN.w &&
           pt.y >= PAUSE_BTN.y && pt.y <= PAUSE_BTN.y + PAUSE_BTN.h)) {
        setPaused(false);
      } else if (inRect(pt, PHOTO_PAUSE_BTN)) {
        AUDIO.click();
        enterPhotoMode();
      }
      return;
    }
    if (st.countdown > 0) return;
    if (pt.x >= PAUSE_BTN.x && pt.x <= PAUSE_BTN.x + PAUSE_BTN.w &&
        pt.y >= PAUSE_BTN.y && pt.y <= PAUSE_BTN.y + PAUSE_BTN.h) {
      setPaused(true);
      AUDIO.click();
      return;
    }
    if (st.arrowsLeft <= 0) return;
    st.aiming = true;
    aimFrom(pt);
  }
  function onMove(e) {
    if (photoMode) {
      e.preventDefault();
      if (!photoDragLast) return;
      var ppt = worldPoint(e);
      photoPan.x = Math.max(-80, Math.min(80, photoPan.x + (ppt.x - photoDragLast.x)));
      photoPan.y = Math.max(-80, Math.min(80, photoPan.y + (ppt.y - photoDragLast.y)));
      photoDragLast = ppt;
      return;
    }
    if (!st || !st.aiming) return;
    e.preventDefault();
    aimFrom(worldPoint(e));
  }
  function onUp(e) {
    if (photoMode) { photoDragLast = null; return; }
    if (!st || !st.aiming) return;
    e.preventDefault();
    fireArrow();
  }

  /* ============ keyboard + gamepad ============
     Both inputs route through the SAME aim state the pointer uses
     (st.aiming flag + st.aim {angle, power}), so trajectory dots, bow pose,
     and fireArrow physics behave identically no matter which input drives it.
     "Last active input wins" falls out naturally: every writer sets the same
     fields, and an idle stick (inside the deadzone) writes nothing. */

  function roundLive() {
    return !!(running && st && !paused && !photoMode && !st.over && st.countdown <= 0);
  }

  // Hold-draw ownership: Space and pad-button A both ramp power over ~0.9s,
  // then release fires through the normal fireArrow path (<0.12 cancels).
  function startSynthDraw(src) {
    if (drawSrc || !roundLive() || st.arrowsLeft <= 0) return;
    drawSrc = src;
    st.aiming = true;
    st.aim.angle = synthAngle;
    if (!(st.aim.power > 0)) st.aim.power = 0;
  }
  function releaseSynthDraw() {
    var src = drawSrc;
    drawSrc = null;
    if (!src) return;
    if (st && st.aiming && !st.over) fireArrow();
  }
  function cancelSynthDraw() {
    drawSrc = null;
    kbHeld = {};
    kbRotEase = 0;
  }

  function clampAimAngle(a) { return Math.max(-1.45, Math.min(0.75, a)); }

  // Runs once per frame from frame(). Rotates the keyboard aim and ramps any
  // active hold-draw. ArrowLeft/A raise the shot (screen-y is down, so angle
  // decreases); Right/D lower it; Up/W + Down/S fine-tune at half speed.
  function updateHeldKeys(dt) {
    if (!roundLive()) { kbRotEase = 0; return; }
    if (drawSrc) {
      var before = st.aim.power;
      st.aim.power = Math.min(1, st.aim.power + dt / 0.9);
      if (Math.abs(st.aim.power - before) > 0.06) AUDIO.stretch(st.aim.power);
    }
    var fast = (kbHeld.ArrowRight ? 1 : 0) - (kbHeld.ArrowLeft ? 1 : 0) +
               (kbHeld.KeyD ? 1 : 0) - (kbHeld.KeyA ? 1 : 0);
    fast = Math.max(-1, Math.min(1, fast));
    var fine = (kbHeld.ArrowDown ? 1 : 0) - (kbHeld.ArrowUp ? 1 : 0) +
               (kbHeld.KeyS ? 1 : 0) - (kbHeld.KeyW ? 1 : 0);
    fine = Math.max(-1, Math.min(1, fine));
    if (fast !== 0 || fine !== 0) {
      kbRotEase = Math.min(1, kbRotEase + dt * 4); // gentle ease-in while held
      var turn = KB_ROT_SPEED * kbRotEase * dt * (fast + 0.5 * fine);
      if (turn !== 0) {
        synthAngle = clampAimAngle(synthAngle + turn);
        st.aiming = true;
        st.aim.angle = synthAngle;
        if (!(st.aim.power > 0)) st.aim.power = 0;
      }
    } else {
      kbRotEase = 0;
    }
  }

  var KEY_AIM_CODES = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1 };

  function onKeyDown(e) {
    var c = e.code;
    if (c === 'Escape') {
      if (photoMode) { e.preventDefault(); exitPhotoMode(); }
      return;
    }
    if (!(c === 'Space' || KEY_AIM_CODES[c])) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '')) return;
    e.preventDefault(); // stop arrow-key scrolling / space page-jumps mid-round
    if (e.repeat) return;
    if (!roundLive()) return;
    kbHeld[c] = true;
    if (KEY_AIM_CODES[c] && !st.aiming && !drawSrc) {
      // fresh key aim: reuse the last angle, zero power until Space draws
      synthAngle = clampAimAngle(st.aim.angle ? st.aim.angle : synthAngle);
      st.aiming = true;
      st.aim.angle = synthAngle;
      st.aim.power = 0;
    }
    if (c === 'Space') startSynthDraw('key');
  }
  function onKeyUp(e) {
    var c = e.code;
    if (kbHeld[c]) kbHeld[c] = false;
    if (c === 'Space' && drawSrc === 'key') releaseSynthDraw();
  }

  // Pad button helper: pressed OR analog value past half travel.
  function gpBtn(gp, n) {
    return !!(gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.5));
  }

  // Called from frame() while the loop is alive. While fully paused the rAF
  // loop is stopped, so ensureGpPausePoll()'s interval watches Start instead.
  function pollGamepad(dt) {
    var pads = null, gp = null, i;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (err) { pads = null; }
    for (i = 0; pads && i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
    if (!gp) { gpWasDeflected = false; return; }

    // Button 9 (Start): pause toggle edge / photo-mode exit
    var start = gpBtn(gp, 9);
    if (start && !gpPrevStart) {
      if (photoMode) exitPhotoMode();
      else if (running && st && !st.over && !paused) { setPaused(true); AUDIO.click(); }
    }
    gpPrevStart = start;

    // Button 1 (B): opens the quit-round flow, which already modal-confirms
    // ("End this round early?") — the tap on Yes stays a screen tap.
    var b1 = gpBtn(gp, 1);
    if (b1 && !gpPrevB1 && running && st && !st.over && !paused && !photoMode) {
      var modalEl = document.getElementById('modal');
      if (modalEl && modalEl.classList.contains('hidden')) {
        var quitBtn = document.getElementById('btn-quit-round');
        if (quitBtn) quitBtn.click();
      }
    }
    gpPrevB1 = b1;

    var canAim = roundLive() && st.arrowsLeft > 0;
    var b0 = gpBtn(gp, 0);
    if (!canAim) {
      gpWasDeflected = false;
      if (gpB0Prev && drawSrc === 'gp0') releaseSynthDraw();
      gpB0Prev = b0;
      return;
    }

    // Button 0 (A): hold-to-draw, identical path to Space
    if (b0 && !gpB0Prev) startSynthDraw('gp0');
    else if (!b0 && gpB0Prev && drawSrc === 'gp0') releaseSynthDraw();
    gpB0Prev = b0;

    // Left stick: direct aim vector from the bow anchor. Only applied when the
    // stick is actually deflected, so a resting stick never overrides mouse aim.
    if (drawSrc) { gpWasDeflected = false; return; } // a hold-draw owns the shot
    var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    var len = Math.hypot(ax, ay);
    if (len > GP_DEADZONE) {
      gpWasDeflected = true;
      st.aiming = true;
      st.aim.angle = Math.atan2(ay, ax);
      st.aim.power = Math.min(1, (len - GP_DEADZONE) / (1 - GP_DEADZONE));
    } else if (gpWasDeflected) {
      // edge-detect: was-deflected → now-neutral releases the shot
      gpWasDeflected = false;
      fireArrow(); // fires above 0.12 power, cancels quietly below
    }
  }

  // While paused the rAF loop is cancelled, so a tiny interval keeps watching
  // the Start button to allow un-pausing from the couch. Cleared on resume.
  function ensureGpPausePoll() {
    if (gpPauseTimer) return;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    gpPauseTimer = setInterval(function () {
      var pads = null, gp = null, i;
      try { pads = navigator.getGamepads(); } catch (err) { pads = null; }
      for (i = 0; pads && i < pads.length; i++) {
        if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
      }
      var start = !!(gp && gp.buttons[9] && (gp.buttons[9].pressed || gp.buttons[9].value > 0.5));
      if (start && !gpPrevStart && !photoMode) {
        gpPrevStart = true;
        setPaused(false);
        return;
      }
      gpPrevStart = start;
    }, 140);
  }
  function clearGpPausePoll() {
    if (gpPauseTimer) { clearInterval(gpPauseTimer); gpPauseTimer = null; }
  }

  /* ============ public ============ */

  return {
    start: function (canvasEl, endCb, options) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      // Retina-sharp backing store; the dpr transform keeps every draw call in
      // world space (1600×900), so gameplay/render code is untouched.
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      onEnd = endCb;
      st = newRound(options);
      running = true;
      paused = false;
      cancelFrame();
      frame.last = undefined;

      // auto-pause when the iPad switches apps or the tab is hidden
      if (!visWired) {
        visWired = true;
        document.addEventListener('visibilitychange', function () {
          if (document.hidden && running && st && !st.over) {
            if (photoMode) exitPhotoMode(); // leave photo mode gracefully
            setPaused(true);
          }
        });
        window.addEventListener('blur', function () {
          if (running && st && !st.over) {
            if (photoMode) exitPhotoMode();
            setPaused(true);
          }
        });
      }

      // keyboard + gamepad plug-in notice, wired exactly once
      if (!keysWired) {
        keysWired = true;
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('gamepadconnected', function () {
          if (running && st && !paused && !photoMode && !reducedMotion()) {
            st.floaters.push({ x: W / 2, y: 190, vy: -32, life: 2,
              text: 'Controller connected!', big: true, color: '#8fdcff' });
          }
        });
      }

      canvas.onmousedown = onDown;
      canvas.onmousemove = onMove;
      window.onmouseup = onUp;
      canvas.ontouchstart = onDown;
      canvas.ontouchmove = onMove;
      canvas.ontouchend = onUp;

      requestFrame();
    },
    stop: function () {
      running = false;
      photoMode = false;
      cancelSynthDraw();
      clearGpPausePoll();
      cancelFrame();
      window.onmouseup = null;
    },
    isRunning: function () { return running; },
    togglePause: function () {
      if (running && st && !st.over) return setPaused(!paused);
      return paused;
    },
    // Inert accessors for automated tests; safe to ignore in normal play.
    debugState: function () { return st; },
    // Advances one sim tick for tests/harness. Gated on pause so a paused
    // round stays frozen (photo mode still allows render-only stepping).
    debugStep: function (dt) {
      if (!running || !st) return;
      if (paused && !photoMode) { render(); return; }
      update(dt); render();
    },
    isPaused: function () { return !!paused; },
    /* ---- Penny's Boss Workshop live preview ----
       Draws one frame of the workshop boss onto `canvasEl` using the REAL
       drawBoss2p5D path: we briefly swap the module canvas/state for a tiny
       fake boss, paint, then restore. Synchronous, so it can never collide
       with a running round's rAF loop. `timeSec` drives breathe/wobble;
       callers pass a frozen time under reduced motion. */
    previewBoss: function (canvasEl, cfg, timeSec) {
      if (!canvasEl || !cfg) return;
      var savedCtx = ctx, savedSt = st, savedRunning = running;
      var img = SPRITES.get('boss_moonstone_3d_0') || SPRITES.get('boss_moonstone');
      st = {
        t: timeSec || 0,
        rules: {
          reducedMotion: !!(typeof SAVE !== 'undefined' && SAVE.settings && SAVE.settings().reducedMotion),
          customBoss: cfg,
          bossId: 'custom'
        }
      };
      var def = workshopDef();
      var t = {
        type: 'boss', r: Math.round(130 * (def.scale / 2.5)),
        hp: def.hp, maxHp: def.hp,
        wobble: 0, hitFlash: 0, hitSide: 1, mt: 0
      };
      try {
        ctx = canvasEl.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.save();
        ctx.translate(canvasEl.width / 2, canvasEl.height * 0.56);
        var bossImg = def.hue ? hueShiftedSprite(def.sprite, def.hue) : null;
        drawBoss2p5D(t, def, bossImg || img, def.wobbleAmp);
        ctx.restore();
      } catch (e) { /* preview is cosmetic — never break the editor */ }
      ctx = savedCtx; st = savedSt; running = savedRunning;
    }
  };
})();
