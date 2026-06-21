/* Target Practice — the round engine.
   World space is 1600x900; the canvas scales to fit the screen. */

var GAME = (function () {
  var W = 1600, H = 900, GROUND = 790;
  var GRAVITY = 1500;                 // px/s^2 for the wooden arrow
  var BOW = { x: 225, y: 690 };       // bow anchor (at the player's hands)
  var MAX_PULL = 300;                 // drag distance for full power

  var canvas, ctx, raf = null, onEnd = null;
  var running = false;

  var st = null;  // per-round state

  /* ============ round setup ============ */

  function newRound() {
    var p = SAVE.current();
    var char = DATA.characterById(p.equipped.character);
    var arrow = DATA.arrowById(p.equipped.arrow);
    var perk = char.perk || {};

    return {
      profile: p,
      char: char,
      arrowType: arrow,
      perk: perk,
      time: TUNING.ROUND_SECONDS,
      countdown: 3.2,         // 3..2..1..GO
      over: false,
      overTimer: 0,
      score: 0,
      coinsDirect: 0,
      arrowsLeft: TUNING.ARROWS_PER_ROUND,
      arrows: [],             // in flight
      targets: [],
      particles: [],
      floaters: [],
      coins: [],              // coins flying to the HUD
      bolts: [],              // lightning visuals
      blackholes: [],         // obsidian-arrow black holes
      shake: 0,
      t: 0,                   // elapsed seconds (for animation)
      aiming: false,
      aim: { x: 0, y: 0, power: 0, angle: 0 },
      lookTimer: 0,
      lastTickSec: 6,
      spawnCooldown: 0,
      combo: 0,               // hits in a row without a miss
      comboMult: 1,           // current score multiplier from the combo
      bestCombo: 0,
      slowUntil: 0,           // slow-motion power-up active until this time
      bossSpawned: false,
      bgName: Math.random() < 0.5 ? 'bg_mountain' : 'bg_meadow'
    };
  }

  /* ============ targets ============ */

  function phase() {
    var elapsed = TUNING.ROUND_SECONDS - st.time;
    if (elapsed < TUNING.MOVERS_START_AT) return 1;
    if (elapsed < TUNING.CHAOS_START_AT) return 2;
    return 3;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function makeBullseye(kind) {
    var r = rand(58, 78);
    var x = rand(750, 1480);
    var t = {
      type: 'bullseye', r: r, hp: 1,
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
    } else {
      t.baseX = x;
      t.y = GROUND - r - rand(0, 220);
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
      r: 44, wobble: 0
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

  // End-of-round boss: a giant target that takes several hits.
  function makeBoss() {
    return {
      type: 'boss', dead: false, hp: 6, maxHp: 6, frozenUntil: 0,
      x: W / 2 + 120, baseX: W / 2 + 120, y: 300,
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
    if (ph === 3 && !st.bossSpawned) {
      st.targets.push(makeBoss());
      st.bossSpawned = true;
      st.floaters.push({ x: W / 2, y: 210, vy: -40, life: 2, text: 'BOSS!', big: true, color: '#ff5fa2' });
      AUDIO.roundEnd();
      st.spawnCooldown = 0.6;
      return;
    }

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
    dt *= sm;
    if (!frozen) t.mt = (t.mt || 0) + dt;
    t.wobble = Math.max(0, (t.wobble || 0) - dt * 4);

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
    var a = st.arrowType;
    var speedFactor = a.speedFactor * (1 + (st.perk.speedBonus || 0));
    var speed = (650 + st.aim.power * 1450) * speedFactor;
    st.arrows.push({
      x: BOW.x, y: BOW.y,
      vx: Math.cos(st.aim.angle) * speed,
      vy: Math.sin(st.aim.angle) * speed,
      pierceLeft: a.pierce ? 1 : 0,
      dead: false, t: 0
    });
    AUDIO.shoot();
    st.aiming = false;
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
    st.blackholes.push({ x: x, y: y, t: 0, life: TUNING.BLACKHOLE_TIME });
    AUDIO.zap();
    if (TUNING.SCREEN_SHAKE) st.shake = 0.4;
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
      st.targets.forEach(function (o) {
        if (o.dead || o.type === 'boss') return; // the boss is too big to pull
        var dx = bh.x - o.x, dy = bh.y - o.y;
        var dist = Math.hypot(dx, dy) || 0.001;
        if (dist < TUNING.BLACKHOLE_RADIUS) {
          o.motion = 'static';                 // stop its own movement
          o.frozenUntil = st.t + 0.05;
          var f = TUNING.BLACKHOLE_PULL * (1 - dist / TUNING.BLACKHOLE_RADIUS);
          o.x += dx / dist * f * 60 * dt;
          o.y += dy / dist * f * 60 * dt;
          if (dist < 40) consumeByHole(o);
        }
      });
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
    var moving = t.type === 'bullseye' && t.motion !== 'static' && st.t >= t.frozenUntil;

    if (t.type === 'bullseye') {
      var d = Math.hypot(hit.x - t.x, hit.y - t.y) / t.r;
      var rings = TUNING.SCORE_BULLSEYE_RINGS;
      var base = d < 0.25 ? rings[0] : d < 0.5 ? rings[1] : d < 0.75 ? rings[2] : rings[3];
      var pts = award(base, t.x, t.y - t.r - 10, { moving: moving });
      t.dead = true;
      splinters(hit.x, hit.y);
      if (base === rings[0]) {
        AUDIO.bullseye();
        if (TUNING.SCREEN_SHAKE) st.shake = 0.35;
        ring(t.x, t.y, '#ffd23a');
        st.floaters.push({ x: t.x, y: t.y - t.r - 56, vy: -70, life: 1.3, text: 'BULLSEYE!', big: true, color: '#ffd23a' });
        earn('first_bullseye');
      } else {
        AUDIO.thunk();
      }
    } else if (t.type === 'balloon') {
      award(TUNING.SCORE_BALLOON, t.x, t.y, { bonusObj: true });
      t.dead = true;
      AUDIO.pop();
      burst(t.x, t.y, t.color);
      spawnCoins(TUNING.COINS_FROM_BALLOON, t.x, t.y);
      track('balloons', 'balloons_50', 50);
    } else if (t.type === 'fruit') {
      award(t.value, t.x, t.y, { bonusObj: true });
      t.dead = true;
      AUDIO.splat();
      fruitSplat(t);
      track('fruits', 'fruits_100', 100);
    } else if (t.type === 'golden') {
      award(TUNING.SCORE_GOLDEN, t.x, t.y - 20, { bonusObj: true });
      t.dead = true;
      AUDIO.chest();
      if (TUNING.SCREEN_SHAKE) st.shake = 0.3;
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
      splinters(hit.x, hit.y);
      if (t.hp <= 0) {
        award(TUNING.SCORE_BOSS, t.x, t.y - t.r - 20, {});
        t.dead = true;
        AUDIO.chest();
        if (TUNING.SCREEN_SHAKE) st.shake = 0.5;
        ring(t.x, t.y, '#ffd23a');
        burst(t.x, t.y, '#ff5fa2');
        spawnCoins(20, t.x, t.y);
        st.floaters.push({ x: t.x, y: t.y - t.r, vy: -50, life: 1.8, text: 'BOSS DOWN!', big: true, color: '#ffd23a' });
        earn('boss');
      } else {
        award(25, hit.x, hit.y - 10, {});
        AUDIO.thunk();
      }
    } else if (t.type === 'chest') {
      t.hp--;
      t.wobble = 1;
      if (t.hp <= 0) {
        award(TUNING.SCORE_CHEST, t.x, t.y - 50, { bonusObj: true });
        t.opened = true;          // show the fully-open chest, then it fades
        t.openTimer = 0.7;
        AUDIO.chest();
        ring(t.x, t.y, '#ffd23a');
        spawnCoins(TUNING.COINS_FROM_CHEST, t.x, t.y - 20);
        if (TUNING.SCREEN_SHAKE) st.shake = 0.3;
        track('chests', 'chests_10', 10);
      } else {
        AUDIO.thunk();
        st.floaters.push({ x: t.x, y: t.y - 70, vy: -70, life: 0.9, text: 'One more!', color: '#fff' });
      }
    }

    // ----- obsidian black hole -----
    if (st.arrowType.blackhole) spawnBlackhole(hit.x, hit.y);

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
          best.hp--; best.wobble = 1;
          if (best.hp <= 0) {
            award(TUNING.SCORE_CHEST, best.x, best.y - 50, { half: true, bonusObj: true });
            best.dead = true; AUDIO.chest();
            spawnCoins(Math.ceil(TUNING.COINS_FROM_CHEST / 2), best.x, best.y - 20);
            track('chests', 'chests_10', 10);
          }
        }
      }
    }
  }

  /* ============ particles ============ */

  function part(x, y, vx, vy, life, color, r, grav) {
    st.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, r: r, grav: grav !== false });
  }
  function splinters(x, y) {
    for (var i = 0; i < 10; i++) part(x, y, rand(-260, 260), rand(-320, 60), rand(0.3, 0.7), pick(['#a06a35', '#8a5a2b', '#e8dccb']), rand(2, 5));
  }
  function burst(x, y, color) {
    for (var i = 0; i < 14; i++) part(x, y, rand(-320, 320), rand(-320, 320), rand(0.25, 0.6), color, rand(3, 7));
  }
  function fruitSplat(t) {
    var colors = {
      apple: ['#e23b3b', '#f4ead2'], orange: ['#ff9a1a', '#ffd9a0'],
      watermelon: ['#ff5f7a', '#2f9d4e'], cherry: ['#c41e3a', '#e23b3b'],
      strawberry: ['#e8344e', '#ffd9e0'], banana: ['#ffd23a', '#f4ead2'],
      pear: ['#9fd636', '#eef7c8'], grapes: ['#8e4fd0', '#c9a8ff'],
      pineapple: ['#ffcf3a', '#e8a91d']
    }[t.kind] || ['#ff9a1a', '#ffd9a0'];
    for (var i = 0; i < 16; i++) part(t.x, t.y, rand(-300, 300), rand(-360, 100), rand(0.3, 0.8), pick(colors), rand(3, 8));
  }
  function dust(x, y) {
    for (var i = 0; i < 6; i++) part(x, y, rand(-90, 90), rand(-140, -30), rand(0.2, 0.5), '#cbb27e', rand(2, 5));
  }
  function flame(x, y) {
    for (var i = 0; i < 8; i++) part(x, y, rand(-140, 140), rand(-200, -40), rand(0.2, 0.5), pick(['#ff7a1a', '#ffb43a']), rand(3, 6), false);
  }
  function snow(x, y) {
    for (var i = 0; i < 8; i++) part(x, y, rand(-100, 100), rand(-160, -20), rand(0.4, 0.8), pick(['#bfeaff', '#ffffff']), rand(2, 5), false);
  }
  function ring(x, y, color) {
    st.particles.push({ x: x, y: y, vx: 0, vy: 0, life: 0.4, max: 0.4, color: color, ring: true, r: 10 });
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
    if (st.time <= 0 || noArrows) {
      st.time = Math.max(0, st.time);
      st.over = true;
      AUDIO.roundEnd();
      return;
    }

    spawner(dt);
    st.targets.forEach(function (t) { updateTarget(t, dt); });
    updateBlackholes(dt);
    st.targets = st.targets.filter(function (t) { return !t.dead; });
    updateArrows(dt);
    updateParticles(dt);
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
      coinBonus: coinBonus,
      isHighScore: isHigh,
      highScore: SAVE.current().highScore
    });
  }

  /* ============ rendering ============ */

  function drawBackground() {
    var bg = SPRITES.get(st.bgName) || SPRITES.get('bg_meadow');
    if (bg) {
      ctx.drawImage(bg, 0, 0, W, H);
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

  function drawBlackholes() {
    st.blackholes.forEach(function (bh) {
      var p = bh.t / bh.life;
      var env = p < 0.45 ? p / 0.45 : (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
      env = Math.max(0, Math.min(1, env));
      var frame = p < 0.25 ? 0 : (p < 0.55 ? 1 : 2);
      var img = SPRITES.get('blackhole_' + frame) || SPRITES.get('blackhole_1');
      var R = TUNING.BLACKHOLE_RADIUS * 0.95 * env;
      ctx.save();
      ctx.translate(bh.x, bh.y);
      ctx.rotate(bh.t * 6);
      ctx.globalAlpha = env;
      if (img) ctx.drawImage(img, -R, -R, R * 2, R * 2);
      else ART.circle(ctx, 0, 0, R, '#0a1a2a');
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  function drawTarget(t) {
    var frozen = st.t < t.frozenUntil;
    ctx.save();
    var wob = Math.sin(st.t * 40) * (t.wobble || 0) * 4;
    ctx.translate(t.x + wob, t.y);

    if (t.type === 'bullseye') {
      if (t.motion === 'swing') {
        // rope
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -t.r);
        ctx.lineTo(t.anchor.x - (t.x + wob), t.anchor.y - t.y);
        ctx.stroke();
      } else {
        // wooden stand
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(-t.r * 0.5, t.r * 0.4); ctx.lineTo(-t.r * 0.75, GROUND - t.y);
        ctx.moveTo(t.r * 0.5, t.r * 0.4); ctx.lineTo(t.r * 0.75, GROUND - t.y);
        ctx.stroke();
      }
      var timg = SPRITES.get('target');
      if (timg) {
        var tw = t.r * 2.15;
        var th = tw * timg.height / timg.width;
        ctx.drawImage(timg, -tw / 2, -th / 2, tw, th);
      } else {
        var rings = [
          [1, '#f4ead2'], [0.78, '#2a2622'], [0.58, '#3aa0e8'], [0.38, '#e23b3b'], [0.2, '#ffd23a']
        ];
        rings.forEach(function (r) { ART.circle(ctx, 0, 0, t.r * r[0], r[1]); });
      }
    } else if (t.type === 'balloon') {
      var bimg = SPRITES.get('balloon');
      if (bimg) {
        var bw = t.r * 2.3;
        var bh = bw * bimg.height / bimg.width;
        // sprite includes a short string; pin the bulb center near (0,0)
        if (t.hue) ctx.filter = 'hue-rotate(' + t.hue + 'deg)';
        ctx.drawImage(bimg, -bw / 2, -bh * 0.42, bw, bh);
        ctx.filter = 'none';
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
      var fimg = SPRITES.get('fruit_' + t.kind);
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
      var col = t.kind === 'arrows' ? '#9fd636' : '#62e6ff';
      ART.circle(ctx, 0, 0, t.r + 3, 'rgba(255,255,255,0.85)');
      ART.circle(ctx, 0, 0, t.r, col);
      ART.ellipse(ctx, -t.r * 0.3, -t.r * 0.35, t.r * 0.25, t.r * 0.32, 'rgba(255,255,255,0.5)');
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + Math.round(t.r * 1.0) + 'px Nunito, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.kind === 'arrows' ? '+3' : '⏱', 0, 2);
    } else if (t.type === 'boss') {
      var bimgT = SPRITES.get('target');
      if (bimgT) {
        var bw = t.r * 2.15, bh = bw * bimgT.height / bimgT.width;
        ctx.drawImage(bimgT, -bw / 2, -bh / 2, bw, bh);
      } else {
        ART.circle(ctx, 0, 0, t.r, '#e23b3b');
      }
      ctx.font = Math.round(t.r * 0.7) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('👑', 0, -t.r * 0.85);
      // health bar
      var hbw = t.r * 1.6, hx = -hbw / 2, hy = -t.r - 30;
      ART.rr(ctx, hx - 3, hy - 3, hbw + 6, 20, 8, 'rgba(0,0,0,0.5)');
      ART.rr(ctx, hx, hy, hbw * Math.max(0, t.hp) / t.maxHp, 14, 7, '#ff4d6d');
    } else if (t.type === 'chest') {
      var cname = t.opened ? 'chest_open' : (t.hp === 1 ? 'chest_semi' : 'chest_closed');
      var cimg = SPRITES.get(cname);
      if (cimg) {
        var cw = t.r * 2.7;
        var ch = cw * cimg.height / cimg.width;
        ctx.drawImage(cimg, -cw / 2, -ch * 0.62, cw, ch);
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

  function drawPlayer() {
    var p = st.profile;
    var outfit = DATA.outfitById(p.equipped.outfit);
    ART.drawCharacter(ctx, p.equipped.character, 150, GROUND + 10, 1.15, {
      hat: p.equipped.hat,
      outfitColor: outfit.swap,
      shiny: p.equipped.shiny,
      t: st.t,
      look: 1
    });
    var angle = st.aiming ? st.aim.angle : -0.25;
    var draw = st.aiming ? st.aim.power : 0;
    ART.drawBow(ctx, BOW.x, BOW.y, angle, draw, 1.2);
    if (!st.aiming && st.arrowsLeft > 0 && !st.over) {
      ART.drawArrow(ctx, BOW.x, BOW.y, angle, st.arrowType, 1, st.t);
    } else if (st.aiming) {
      var nockX = BOW.x - Math.cos(st.aim.angle) * st.aim.power * 46;
      var nockY = BOW.y - Math.sin(st.aim.angle) * st.aim.power * 46;
      ART.drawArrow(ctx, nockX, nockY, st.aim.angle, st.arrowType, 1, st.t);
    }
  }

  function hudPanel(x, y, w, h) {
    ctx.fillStyle = 'rgba(26,24,34,0.82)';
    ART.rr(ctx, x, y, w, h, h / 2, 'rgba(26,24,34,0.82)');
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
    if (st.shake > 0) {
      ctx.translate(rand(-1, 1) * st.shake * 22, rand(-1, 1) * st.shake * 22);
    }

    drawBackground();
    st.targets.forEach(drawTarget);
    drawBlackholes();
    drawAim();
    drawPlayer();

    // arrows in flight
    st.arrows.forEach(function (a) {
      if (a.dead) return;
      ART.drawArrow(ctx, a.x, a.y, Math.atan2(a.vy, a.vx), st.arrowType, 1, a.t);
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
    update(dt);
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
    if (!st || st.over || st.countdown > 0 || st.arrowsLeft <= 0) return;
    st.aiming = true;
    aimFrom(worldPoint(e));
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
    start: function (canvasEl, endCb) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      canvas.width = W;
      canvas.height = H;
      onEnd = endCb;
      st = newRound();
      running = true;
      frame.last = undefined;

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
    // Inert accessors for automated tests; safe to ignore in normal play.
    debugState: function () { return st; },
    debugStep: function (dt) { if (running && st) { update(dt); render(); } }
  };
})();
