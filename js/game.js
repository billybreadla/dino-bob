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
  // pause button sits between the timer and the arrow counter
  var PAUSE_BTN = { x: W / 2 + 130, y: 24, w: 56, h: 56 };
  var RESUME_R = 74;    // radius of the big resume button on the pause overlay

  var st = null;  // per-round state

  /* ============ round setup ============ */

  function newRound(options) {
    options = options || {};
    var p = SAVE.current();
    var char = DATA.characterById(p.equipped.character);
    var arrow = DATA.arrowById(p.equipped.arrow);
    var perk = char.perk || {};

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
      theme: options.theme || null
    };
    rules.reducedMotion = !!(typeof SAVE !== 'undefined' && SAVE.settings && SAVE.settings().reducedMotion);
    // Accessibility: Easier Mode gives more time, more arrows, slower targets.
    if (typeof SAVE !== 'undefined' && SAVE.settings && SAVE.settings().easy) {
      rules.arrows = Math.ceil(rules.arrows * 1.25);
      rules.roundSeconds = Math.round(rules.roundSeconds * 1.25);
      rules.targetSpeed = rules.targetSpeed * 0.8;
      rules.easy = true;
    }
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
      shake: 0,
      t: 0,                   // elapsed seconds (for animation)
      aiming: false,
      aim: { x: 0, y: 0, power: 0, angle: 0 },
      releaseKick: 0,
      lookTimer: 0,
      lastTickSec: 6,
      spawnCooldown: 0,
      combo: 0,               // hits in a row without a miss
      comboMult: 1,           // current score multiplier from the combo
      bestCombo: 0,
      slowUntil: 0,           // slow-motion power-up active until this time
      cinematicUntil: 0,
      bossSpawned: false,
      stats: { shots: 0, hits: 0, misses: 0, bullseyes: 0, balloons: 0, fruits: 0, chests: 0, bossDefeated: false },
      bgName: options.background && options.background !== 'random' ?
        (options.background === 'cave' ? 'bg_moon_cave' : options.background) :
        ['bg_meadow', 'bg_mountain', 'bg_sunset_beach', 'bg_starlight', 'bg_underwater'][(Math.random() * 5) | 0]
    };
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
    var elapsed = st.rules.roundSeconds - st.time;
    if (elapsed < st.rules.moversAt) return 1;
    if (elapsed < st.rules.chaosAt) return 2;
    return 3;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function makeBullseye(kind) {
    // Some targets stand far away in the distance: drawn small and hazy,
    // sitting on distant ground, worth FAR_TARGET_MULTIPLIER extra points.
    var far = kind !== 'swing' && Math.random() < (TUNING.FAR_TARGET_CHANCE || 0);
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
      if (kind === 'slide') {
        t.range = rand(55, 110);
        t.speed = rand(1.2, 2.0) * (phase() === 3 ? 1.6 : 1);
      }
    } else {
      t.baseX = x;
      t.y = GROUND - r - rand(0, 150);
      t.x = x;
      if (kind === 'slide') {
        t.range = rand(90, 180);
        t.speed = rand(1.2, 2.0) * (phase() === 3 ? 1.6 : 1);
      }
    }
    return t;
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
    var fromRight = Math.random() < 0.5;
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

  function makeChest() {
    return {
      type: 'chest', dead: false, hp: 2, frozenUntil: 0,
      x: rand(950, 1480), y: GROUND - 34,
      r: 52, wobble: 0
    };
  }

  // The rare Golden Banana — floats up fast and is worth a fortune.
  function makeGolden() {
    var fromRight = Math.random() < 0.5;
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

  // End-of-round boss: a giant target that takes several hits. Which boss (art +
  // hit count) comes from the stage's boss config in js/stages.js.
  function makeBoss() {
    var def = STAGES.bossDef(st.rules.bossId);
    return {
      type: 'boss', bossId: st.rules.bossId || 'moonstone',
      dead: false, hp: def.hp, maxHp: def.hp, frozenUntil: 0,
      // y puts the boss's feet on the ground so he stands in the scene
      // instead of floating in the sky (art bottom lands near GROUND).
      x: W / 2 + 120, baseX: W / 2 + 120, y: 620,
      r: 130, wobble: 0, mt: 0,
      motion: 'slide', range: 220, speed: 1.0
    };
  }

  function liveTargets() { return st.targets.filter(function (t) { return !t.dead; }); }

  function spawner(dt) {
    st.spawnCooldown -= dt;
    if (st.spawnCooldown > 0) return;
    var ph = phase();
    var live = liveTargets();

    // The BOSS appears once, when chaos mode begins.
    if ((st.rules.bossAtStart || ph === 3) && !st.bossSpawned) {
      st.targets.push(makeBoss());
      st.bossSpawned = true;
      st.floaters.push({ x: W / 2, y: 210, vy: -40, life: 2, text: 'BOSS!', big: true, color: '#ff5fa2' });
      AUDIO.roundEnd();
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
      st.targets.push(makeBullseye(kind));
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
    if (ph >= 2 && !live.some(function (t) { return t.type === 'golden'; }) && Math.random() < 0.02) {
      st.targets.push(makeGolden()); st.spawnCooldown = 3; return;
    }
    if (!live.some(function (t) { return t.type === 'powerup'; }) && Math.random() < 0.015) {
      st.targets.push(makePowerup()); st.spawnCooldown = 3; return;
    }

    // bonus objects
    var balloons = live.filter(function (t) { return t.type === 'balloon'; }).length;
    var chests = live.filter(function (t) { return t.type === 'chest'; }).length;
    var roll = Math.random();

    if (ph === 1) {
      if (balloons < 1 && roll < 0.4) { st.targets.push(makeBalloon()); st.spawnCooldown = 2.5; }
      else st.spawnCooldown = 1;
    } else if (ph === 2) {
      if (balloons < 2 && roll < 0.35) { st.targets.push(makeBalloon()); st.spawnCooldown = 1.6; }
      else if (roll < 0.55) { st.targets.push(makeFruit()); st.spawnCooldown = 2.2; }
      else if (chests < 1 && roll < 0.68) { st.targets.push(makeChest()); st.spawnCooldown = 4; }
      else st.spawnCooldown = 0.9;
    } else {
      if (balloons < 3 && roll < 0.35) { st.targets.push(makeBalloon()); st.spawnCooldown = 1.0; }
      else if (roll < 0.65) { st.targets.push(makeFruit()); st.spawnCooldown = 1.2; }
      else if (chests < 2 && roll < 0.8) { st.targets.push(makeChest()); st.spawnCooldown = 2.5; }
      else st.spawnCooldown = 0.6;
    }
  }

  function updateTarget(t, dt) {
    var frozen = st.t < t.frozenUntil;
    var sm = st.t < st.slowUntil ? 0.4 : 1;   // slow-motion power-up
    dt *= sm * st.rules.targetSpeed;
    if (!frozen) t.mt = (t.mt || 0) + dt;
    t.wobble = Math.max(0, (t.wobble || 0) - dt * 4);
    t.hitFlash = Math.max(0, (t.hitFlash || 0) - dt * 4.5);

    if (t.type === 'bullseye' || t.type === 'boss') {
      if (t.motion === 'slide' && !frozen) {
        t.x = t.baseX + Math.sin(t.mt * t.speed) * t.range;
      } else if (t.motion === 'swing') {
        var th = Math.sin(t.mt * t.speed) * t.amp;
        t.x = t.anchor.x + Math.sin(th) * t.len;
        t.y = t.anchor.y + Math.cos(th) * t.len;
      }
    } else if (t.type === 'balloon') {
      if (!frozen) {
        t.y += t.vy * dt;
        t.x += Math.sin(t.mt * 2 + t.sway) * 30 * dt;
      }
      if (t.y < -80) t.dead = true; // floated away
    } else if (t.type === 'fruit' || t.type === 'golden') {
      if (!frozen) {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.vy += 700 * dt;
      }
      if (t.y > GROUND + 80) t.dead = true; // fell
    } else if (t.type === 'powerup') {
      if (!frozen) {
        t.y += t.vy * dt;
        t.x += Math.sin(t.mt * 1.6 + t.sway) * 26 * dt;
      }
      if (t.y < -70) t.dead = true; // floated away
    } else if (t.type === 'chest' && t.opened) {
      t.openTimer -= dt;
      if (t.openTimer <= 0) t.dead = true; // fully-open reveal finished
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
  }

  function arrowGravity() {
    return GRAVITY * st.arrowType.gravityFactor * (1 - (st.perk.gravityCut || 0));
  }

  function simStep(p, dt) {
    p.vy += arrowGravity() * dt;
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

      // hit targets (swept)
      for (var i = 0; i < st.targets.length; i++) {
        var t = st.targets[i];
        if (t.dead) continue;
        var hit = segCircle(ox, oy, ar.x, ar.y, t.x, t.y, t.r);
        if (hit) {
          ar.hitSomething = true;
          onHit(t, hit, ar);
          // Soft targets pop and let the arrow keep flying; it only stops on
          // real targets (bullseyes, chests, boss).
          var soft = (t.type === 'balloon' || t.type === 'fruit' ||
                      t.type === 'golden' || t.type === 'powerup');
          if (!soft) {
            if (ar.pierceLeft > 0) { ar.pierceLeft--; flame(hit.x, hit.y); }
            else { ar.dead = true; }
            if (ar.dead) break;
          }
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
      award(TUNING.SCORE_BALLOON, o.x, o.y, { bonusObj: true }); burst(o.x, o.y, o.color);
      spawnCoins(TUNING.COINS_FROM_BALLOON, o.x, o.y); o.dead = true; track('balloons', 'balloons_50', 50);
    } else if (o.type === 'fruit') {
      award(o.value, o.x, o.y, { bonusObj: true }); fruitSplat(o); o.dead = true; track('fruits', 'fruits_100', 100);
    } else if (o.type === 'golden') {
      award(TUNING.SCORE_GOLDEN, o.x, o.y, { bonusObj: true }); burst(o.x, o.y, '#ffd23a');
      spawnCoins(12, o.x, o.y); o.dead = true; earn('golden');
    } else if (o.type === 'chest') {
      award(TUNING.SCORE_CHEST, o.x, o.y, { bonusObj: true }); spawnCoins(TUNING.COINS_FROM_CHEST, o.x, o.y);
      o.dead = true; track('chests', 'chests_10', 10);
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
        st.stats.bullseyes++;
        st.cinematicUntil = reducedMotion() ? st.t : st.t + 0.34;
        AUDIO.bullseye();
        addShake(0.35);
        ring(t.x, t.y, '#ffd23a');
        st.floaters.push({ x: t.x, y: t.y - t.r - 56, vy: -70, life: 1.3, text: 'BULLSEYE!', big: true, color: '#ffd23a' });
        earn('first_bullseye');
        characterMoment(t.x, t.y - t.r - 95);
      } else {
        AUDIO.thunk();
      }
    } else if (t.type === 'balloon') {
      st.stats.balloons++;
      award(TUNING.SCORE_BALLOON, t.x, t.y, { bonusObj: true });
      t.dead = true;
      AUDIO.pop();
      burst(t.x, t.y, t.color);
      spawnCoins(TUNING.COINS_FROM_BALLOON, t.x, t.y);
      track('balloons', 'balloons_50', 50);
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
      earn('golden');
    } else if (t.type === 'powerup') {
      applyPowerup(t);
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
        ring(t.x, t.y, '#ffd23a');
        burst(t.x, t.y, '#ff5fa2');
        bossDefeatBurst(t.x, t.y);
        spawnCoins(20, t.x, t.y);
        st.floaters.push({ x: t.x, y: t.y - t.r, vy: -50, life: 1.8, text: 'BOSS DOWN!', big: true, color: '#ffd23a' });
        earn('boss');
      } else {
        if (AUDIO.bossHit) AUDIO.bossHit(); else AUDIO.thunk();
        addShake(0.24);
        award(25, hit.x, hit.y - 10, {});
        snapArrow(hit.x, hit.y, Math.atan2(ar.vy, ar.vx), st.arrowType);
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
    if (st.char.id === 'trixie') { st.targets.push(makeFruit()); ring(x, y + 40, '#ff8ad4'); }
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
  function ring(x, y, color) {
    st.particles.push({ x: x, y: y, vx: 0, vy: 0, life: 0.4, max: 0.4, color: color, ring: true, r: 10 });
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
      if (p.ring) { p.r += 700 * dt; return; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += 900 * dt;
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
    st.releaseKick = Math.max(0, st.releaseKick - dt * 7.5);
    st.lookTimer += dt;

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

    st.time -= dt;
    // urgent beeps in the final 5 seconds
    if (st.time <= 5.5 && st.time > 0) {
      var sec = Math.ceil(st.time);
      if (sec !== st.lastTickSec) { st.lastTickSec = sec; AUDIO.tick(); }
    }

    var noArrows = st.arrowsLeft <= 0 && st.arrows.every(function (a) { return a.dead; });
    var bossWon = st.rules.bossAtStart && st.stats.bossDefeated && st.arrows.every(function (a) { return a.dead; });
    if (st.time <= 0 || noArrows || bossWon) {
      st.time = Math.max(0, st.time);
      st.over = true;
      AUDIO.roundEnd();
      return;
    }

    var worldDt = st.t < st.cinematicUntil ? dt * 0.18 : dt;
    spawner(worldDt);
    st.targets.forEach(function (t) { updateTarget(t, worldDt); });
    updateBlackholes(worldDt);
    st.targets = st.targets.filter(function (t) { return !t.dead; });
    updateArrows(worldDt);
    updateParticles(worldDt);
  }

  function finish() {
    running = false;
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
      , stats: st.stats
      , mode: st.rules.mode
      , label: st.rules.label
    });
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

  var gradeCache = {};
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
    gradeCache[key] = cv;
    return cv;
  }

  // A soft band of atmospheric haze where the painted background meets the
  // play plane; separates the "stage" from the backdrop like distant fog.
  function drawDepthHaze() {
    var amb = ambient();
    var g = ctx.createLinearGradient(0, GROUND - 330, 0, GROUND + 50);
    g.addColorStop(0, 'rgba(' + amb.haze + ',0)');
    g.addColorStop(0.72, 'rgba(' + amb.haze + ',0.13)');
    g.addColorStop(1, 'rgba(' + amb.haze + ',0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND - 330, W, 380);
  }

  function drawBackground() {
    var bg = SPRITES.get(st.bgName) || SPRITES.get('bg_meadow');
    if (bg) {
      ctx.drawImage(bg, 0, 0, W, H);
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
    var vignette = ctx.createRadialGradient(W * 0.58, H * 0.48, 160, W * 0.55, H * 0.48, 900);
    vignette.addColorStop(0, 'rgba(42,45,83,0.08)');
    vignette.addColorStop(0.65, 'rgba(28,19,48,0.48)');
    vignette.addColorStop(1, 'rgba(8,7,18,0.86)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
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

  function drawStageAtmosphere() {
    var name = st.bgName || '';
    var calm = reducedMotion();
    ctx.save();

    // Soft scene-grade overlays make the painted worlds feel like one coherent
    // diorama without touching the actual background assets.
    if (name.indexOf('moon_cave') >= 0 || st.rules.theme === 'cave') {
      var cave = ctx.createRadialGradient(W * 0.55, H * 0.45, 130, W * 0.55, H * 0.45, 880);
      cave.addColorStop(0, 'rgba(111,92,255,0.10)');
      cave.addColorStop(0.72, 'rgba(14,16,44,0.18)');
      cave.addColorStop(1, 'rgba(5,6,16,0.36)');
      ctx.fillStyle = cave; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < (calm ? 7 : 22); i++) {
        var gx = (i * 131 + (calm ? 0 : Math.sin(st.t * 0.4 + i) * 12)) % W;
        var gy = 120 + ((i * 73 + (calm ? 0 : st.t * 18)) % 620);
        ART.circle(ctx, gx, gy, 2 + (i % 3), i % 2 ? 'rgba(126,236,255,0.38)' : 'rgba(190,145,255,0.28)');
      }
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
    } else if (name.indexOf('starlight') >= 0) {
      ctx.fillStyle = 'rgba(21,24,72,0.12)'; ctx.fillRect(0, 0, W, H);
      for (var s = 0; s < (calm ? 12 : 32); s++) {
        var sx = (s * 97 + 47) % W;
        var sy = 40 + (s * 53) % 360;
        var tw = calm ? 0.35 : 0.35 + Math.sin(st.t * 2.3 + s) * 0.25;
        ART.circle(ctx, sx, sy, 1.5 + (s % 3), 'rgba(255,244,168,' + (0.25 + tw) + ')');
      }
    } else if (name.indexOf('sunset') >= 0) {
      var sunset = ctx.createLinearGradient(0, 0, 0, H);
      sunset.addColorStop(0, 'rgba(255,142,92,0.16)');
      sunset.addColorStop(0.55, 'rgba(255,220,138,0.08)');
      sunset.addColorStop(1, 'rgba(63,32,50,0.12)');
      ctx.fillStyle = sunset; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, 0, W, H);
      for (var p = 0; p < (calm ? 4 : 10); p++) {
        var px = (p * 173 + (calm ? 0 : st.t * (8 + p % 3))) % (W + 80) - 40;
        var py = 180 + (p * 61) % 410;
        ART.circle(ctx, px, py, 2.5, 'rgba(255,255,255,0.28)');
      }
    }

    // Gentle vignette focuses the play area like a stage.
    var vignette = ctx.createRadialGradient(W * 0.48, H * 0.48, 260, W * 0.5, H * 0.5, 920);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(0.72, 'rgba(24,22,34,0.04)');
    vignette.addColorStop(1, 'rgba(24,22,34,0.18)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawForegroundDepth() {
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
      t.type === 'chest' ? 'rgba(255,210,58,0.18)' : '';
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
    ctx.save();
    ctx.translate(0, groundY);
    ctx.scale(1, h / w);
    var g = ctx.createRadialGradient(0, 0, w * 0.12, 0, 0, w);
    g.addColorStop(0, 'rgba(20,16,20,' + a.toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(20,16,20,' + (a * 0.5).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(20,16,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill();
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

  function drawBoss2p5D(t, bdef, bossImg) {
    var img = bossImg || SPRITES.get('target');
    if (!img) {
      ART.circle(ctx, 0, 0, t.r, '#e23b3b');
      return { bh: t.r * 2, byoff: 0, bossImg: null };
    }

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

    var glow = ctx.createRadialGradient(0, 0, 8, 0, 0, t.r * (1.1 + targetPulse));
    glow.addColorStop(0, 'rgba(255,226,86,' + (0.22 + flash * 0.36) + ')');
    glow.addColorStop(0.38, 'rgba(98,230,255,' + (0.10 + flash * 0.2) + ')');
    glow.addColorStop(1, 'rgba(98,230,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, t.r * 1.2, 0, Math.PI * 2); ctx.fill();

    ctx.drawImage(img, -bw / 2, -bh / 2 - byoff, bw, bh);

    if (bossImg && !reducedMotion()) {
      var armSwing = Math.sin(st.t * 2.7 + t.mt) * 0.018 + recoil * 0.05;
      drawBossCrop(img, 0.02, 0.28, 0.29, 0.50, bw, bh, byoff, -recoil * 8, recoil * 7, -armSwing - recoil * 0.03, 1);
      drawBossCrop(img, 0.69, 0.28, 0.29, 0.50, bw, bh, byoff, recoil * 8, recoil * 7, armSwing + recoil * 0.03, 1);
      drawBossCrop(img, 0.27, 0.03, 0.46, 0.29, bw, bh, byoff, side * recoil * 10, -recoil * 8, side * recoil * 0.06 + Math.sin(st.t * 4.2) * 0.008, 1);
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
      var g = ctx.createRadialGradient(0, -t.r * 0.55, 4, 0, -t.r * 0.55, glowR);
      g.addColorStop(0, 'rgba(255,245,156,0.95)');
      g.addColorStop(0.38, 'rgba(255,185,48,0.42)');
      g.addColorStop(1, 'rgba(255,185,48,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -t.r * 0.55, glowR, 0, Math.PI * 2); ctx.fill();
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

    if (t.type === 'bullseye') {
      var timg = gradedSprite('target') || SPRITES.get('target');
      if (t.motion === 'swing') {
        // rope
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -t.r);
        ctx.lineTo(t.anchor.x - (t.x + wob), t.anchor.y - t.y);
        ctx.stroke();
      } else {
        // Far targets rest on distant terrain: short legs, not stilts to the
        // near ground line.
        ART.drawTargetStand(ctx, t.r, t.far ? t.r * 1.18 : GROUND - t.y, timg);
      }
      if (timg) {
        var tw = t.r * 2.15;
        var th = tw * timg.height / timg.width;
        // a gentle horizontal breathe reads as the disc turning in space
        var turn = reducedMotion() ? 0 : Math.sin(st.t * 1.1 + t.mt * 0.7) * 0.035;
        ctx.save();
        ctx.scale(1 + turn, 1);
        ctx.drawImage(timg, -tw / 2, -th / 2, tw, th);
        ctx.restore();
        if (t.far) {
          // atmospheric veil: distant objects pick up the sky's haze color
          var amb = ambient();
          var hz = ctx.createRadialGradient(0, 0, t.r * 0.2, 0, 0, t.r * 1.4);
          hz.addColorStop(0, 'rgba(' + amb.haze + ',0.18)');
          hz.addColorStop(1, 'rgba(' + amb.haze + ',0)');
          ctx.fillStyle = hz;
          ctx.beginPath(); ctx.arc(0, 0, t.r * 1.4, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        var rings = [
          [1, '#f4ead2'], [0.78, '#2a2622'], [0.58, '#3aa0e8'], [0.38, '#e23b3b'], [0.2, '#ffd23a']
        ];
        rings.forEach(function (r) { ART.circle(ctx, 0, 0, t.r * r[0], r[1]); });
      }
    } else if (t.type === 'balloon') {
      var bimg = gradedSprite('balloon') || SPRITES.get('balloon');
      if (bimg) {
        var bw = t.r * 2.3;
        var bh = bw * bimg.height / bimg.width;
        // sprite includes a short string; pin the bulb center near (0,0)
        if (t.hue) ctx.filter = 'hue-rotate(' + t.hue + 'deg)';
        ctx.drawImage(bimg, -bw / 2, -bh * 0.42, bw, bh);
        ctx.filter = 'none';
        // spherical light: white specular up-left, so the bulb reads round
        var spec = ctx.createRadialGradient(-t.r * 0.34, -t.r * 0.4, 2, -t.r * 0.34, -t.r * 0.4, t.r * 0.85);
        spec.addColorStop(0, 'rgba(255,255,255,0.32)');
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = spec;
        ctx.beginPath(); ctx.arc(0, -t.r * 0.05, t.r * 0.92, 0, Math.PI * 2); ctx.fill();
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
    } else if (t.type === 'fruit') {
      ctx.rotate(t.mt * (t.spin || 1));
      var fimg = gradedSprite('fruit_' + t.kind) || SPRITES.get('fruit_' + t.kind);
      if (fimg) {
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
      var gg = ctx.createRadialGradient(0, 0, 4, 0, 0, t.r * 1.9);
      gg.addColorStop(0, 'rgba(255,231,90,0.85)');
      gg.addColorStop(1, 'rgba(255,231,90,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(0, 0, t.r * 1.9, 0, Math.PI * 2); ctx.fill();
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
    } else if (t.type === 'boss') {
      var bdef = STAGES.bossDef(t.bossId);
      var bossSprite = bossDamageSprite(bdef, t);
      var bossImg = gradedSprite(bossSprite) || gradedSprite(bdef.sprite) || SPRITES.get(bossSprite) || SPRITES.get(bdef.sprite);
      var bossDraw = drawBoss2p5D(t, bdef, bossImg);
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
      for (var k = 0; k < 3; k++) simStep(p, 1 / 90);
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
    // Lean back a touch while drawing, kick forward on release.
    var lean = -draw * 8 + recoil * 14;
    var liftY = draw * 2;
    var bx = BOW.x + lean, by = BOW.y + liftY;

    if (poseImg) {
      var h = ARCHER_HEIGHT;
      var w = poseImg.width * (h / poseImg.height);
      var dx = bx - ARCHER_BOW_FX * w;
      var dy = by - ARCHER_BOW_FY * h;
      // contact shadow at the feet grounds the archer in the scene
      ctx.save();
      var psx = dx + w * 0.48, psy = dy + h + 4;
      var pg = ctx.createRadialGradient(psx, psy, 4, psx, psy, w * 0.42);
      pg.addColorStop(0, 'rgba(20,16,20,0.30)');
      pg.addColorStop(0.6, 'rgba(20,16,20,0.15)');
      pg.addColorStop(1, 'rgba(20,16,20,0)');
      ctx.translate(psx, psy);
      ctx.scale(1, 0.16);
      ctx.translate(-psx, -psy);
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(psx, psy, w * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      if (p.equipped.shiny) { ctx.shadowColor = 'rgba(255,247,180,0.9)'; ctx.shadowBlur = 22; }
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
      ART.drawBow(ctx, BOW.x, BOW.y, angle, draw, 1.2);
    }

    // Nocked arrow for poses WITHOUT baked draw frames (the draw frames already
    // show the arrow pulling back). Aim direction comes from drawAim's dots.
    if (!hasFrames) {
      var nockX = bx - Math.cos(angle) * draw * 46;
      var nockY = by - Math.sin(angle) * draw * 46;
      if (!st.aiming && st.arrowsLeft > 0 && !st.over) {
        ART.drawArrow(ctx, bx, by, angle, st.arrowType, 1, st.t);
      } else if (st.aiming) {
        ART.drawArrow(ctx, nockX, nockY, st.aim.angle, st.arrowType, 1, st.t);
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

    // timer — top center
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
    if (!reducedMotion() && st.shake > 0) {
      ctx.translate(rand(-1, 1) * st.shake * 22, rand(-1, 1) * st.shake * 22);
    }

    drawBackground();
    drawStageAtmosphere();
    drawDepthHaze();
    st.targets.forEach(drawTarget);
    drawBlackholes();
    drawBrokenArrows();
    drawAim();
    drawPlayer();

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
        reducedMotion: reducedMotion()
      });
    });

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
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6 * (p.life / p.max);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ART.circle(ctx, p.x, p.y, p.r, p.color);
      }
      ctx.globalAlpha = 1;
    });

    // homing coins
    st.coins.forEach(function (c) { ART.drawCoin(ctx, c.x, c.y, 13, c.t); });

    drawForegroundDepth();
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
      var msg = st.arrowsLeft <= 0 && st.time > 0 ? 'OUT OF ARROWS!' : "TIME'S UP!";
      ctx.strokeText(msg, W / 2, H / 2 - 20);
      ctx.fillText(msg, W / 2, H / 2 - 20);
    }

    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.033, (now - (frame.last || now)) / 1000);
    frame.last = now;
    if (!paused) update(dt);   // frozen world still renders (pause overlay)
    render();
    raf = requestAnimationFrame(frame);
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

  function onDown(e) {
    e.preventDefault();
    AUDIO.unlock();
    if (!st || st.over || st.countdown > 0) return;
    var pt = worldPoint(e);
    if (paused) {
      // only the big ▶ (or the HUD button) resumes; swallow all other taps
      if (Math.hypot(pt.x - W / 2, pt.y - (H / 2 + 70)) < RESUME_R + 30 ||
          (pt.x >= PAUSE_BTN.x && pt.x <= PAUSE_BTN.x + PAUSE_BTN.w &&
           pt.y >= PAUSE_BTN.y && pt.y <= PAUSE_BTN.y + PAUSE_BTN.h)) {
        paused = false;
        AUDIO.click();
      }
      return;
    }
    if (pt.x >= PAUSE_BTN.x && pt.x <= PAUSE_BTN.x + PAUSE_BTN.w &&
        pt.y >= PAUSE_BTN.y && pt.y <= PAUSE_BTN.y + PAUSE_BTN.h) {
      paused = true;
      st.aiming = false;
      AUDIO.click();
      return;
    }
    if (st.arrowsLeft <= 0) return;
    st.aiming = true;
    aimFrom(pt);
  }
  function onMove(e) {
    if (!st || !st.aiming) return;
    e.preventDefault();
    aimFrom(worldPoint(e));
  }
  function onUp(e) {
    if (!st || !st.aiming) return;
    e.preventDefault();
    fireArrow();
  }

  /* ============ public ============ */

  return {
    start: function (canvasEl, endCb, options) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      canvas.width = W;
      canvas.height = H;
      onEnd = endCb;
      st = newRound(options);
      running = true;
      paused = false;
      frame.last = undefined;

      // auto-pause when the iPad switches apps or the tab is hidden
      if (!visWired) {
        visWired = true;
        document.addEventListener('visibilitychange', function () {
          if (document.hidden && running && st && !st.over && st.countdown <= 0) paused = true;
        });
      }

      canvas.onmousedown = onDown;
      canvas.onmousemove = onMove;
      window.onmouseup = onUp;
      canvas.ontouchstart = onDown;
      canvas.ontouchmove = onMove;
      canvas.ontouchend = onUp;

      raf = requestAnimationFrame(frame);
    },
    stop: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      window.onmouseup = null;
    },
    isRunning: function () { return running; },
    togglePause: function () {
      if (running && st && !st.over && st.countdown <= 0) paused = !paused;
      return paused;
    },
    // Inert accessors for automated tests; safe to ignore in normal play.
    debugState: function () { return st; },
    debugStep: function (dt) { if (running && st) { update(dt); render(); } }
  };
})();
