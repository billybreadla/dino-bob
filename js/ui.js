/* All DOM screens: title, profiles, home, arcade, closet, results,
   plus the confetti/fireworks overlay and kid-proof modal. */

var UI = (function () {

  var $ = function (id) { return document.getElementById(id); };
  var screens = ['title', 'profiles', 'home', 'game', 'results', 'arcade', 'closet', 'adventure', 'challenge', 'family', 'settings'];
  var activeMode = { type: 'practice', options: null };
  var familySession = null;

  function show(name) {
    screens.forEach(function (s) {
      $('screen-' + s).classList.toggle('hidden', s !== name);
    });
  }

  /* ============ tiny character portrait renderer ============ */

  function portrait(canvas, charId, opts) {
    var c = canvas.getContext('2d');
    canvas.width = 150; canvas.height = 160;
    c.clearRect(0, 0, 150, 160);
    ART.drawCharacter(c, charId, 75, 150, 0.92, opts || {});
  }

  function equippedOpts(p, t) {
    var outfit = DATA.outfitById(p.equipped.outfit);
    return {
      hat: p.equipped.hat,
      outfitColor: outfit.swap,
      outfitId: p.equipped.outfit,
      shiny: p.equipped.shiny && SAVE.owns('shiny', p.equipped.character),
      t: t || 1
    };
  }

  /* ============ modal (double-confirm capable) ============ */

  function modal(text, onYes) {
    $('modal-text').textContent = text;
    $('modal').classList.remove('hidden');
    $('modal-yes').onclick = function () {
      AUDIO.click();
      $('modal').classList.add('hidden');
      onYes();
    };
    $('modal-no').onclick = function () {
      AUDIO.click();
      $('modal').classList.add('hidden');
    };
  }

  /* ============ fx overlay: confetti + fireworks ============ */

  var fx = (function () {
    var canvas, ctx, parts = [], raf = null;
    function ensure() {
      if (!canvas) {
        canvas = $('fx-canvas');
        ctx = canvas.getContext('2d');
      }
      canvas.width = innerWidth;
      canvas.height = innerHeight;
    }
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(function (p) {
        p.life -= 0.016;
        p.x += p.vx * 0.016;
        p.y += p.vy * 0.016;
        p.vy += p.grav * 0.016;
        p.rot += p.vr * 0.016;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      parts = parts.filter(function (p) { return p.life > 0; });
      if (parts.length) raf = requestAnimationFrame(loop);
      else { raf = null; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    var COLORS = ['#ffd23a', '#ff5fa2', '#62e6ff', '#9fd636', '#9b5fe8', '#ff7a1a'];
    return {
      confetti: function () {
        ensure();
        for (var i = 0; i < TUNING.CONFETTI_AMOUNT; i++) {
          parts.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * canvas.height * 0.3,
            vx: (Math.random() - 0.5) * 120,
            vy: 120 + Math.random() * 240,
            grav: 60,
            r: 4 + Math.random() * 6,
            rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 10,
            life: 2 + Math.random() * 1.5,
            color: COLORS[i % COLORS.length],
            shape: 'rect'
          });
        }
        kick();
      },
      fireworks: function (n) {
        ensure();
        var count = n || TUNING.HIGH_SCORE_FIREWORKS;
        for (var f = 0; f < count; f++) {
          (function (f) {
            setTimeout(function () {
              AUDIO.firework();
              var cx = canvas.width * (0.15 + Math.random() * 0.7);
              var cy = canvas.height * (0.15 + Math.random() * 0.45);
              var color = COLORS[Math.floor(Math.random() * COLORS.length)];
              for (var i = 0; i < 36; i++) {
                var a = i / 36 * Math.PI * 2;
                var sp = 120 + Math.random() * 220;
                parts.push({
                  x: cx, y: cy,
                  vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                  grav: 160, r: 2.5 + Math.random() * 3,
                  rot: 0, vr: 0,
                  life: 0.8 + Math.random() * 0.7,
                  color: color, shape: 'dot'
                });
              }
              kick();
            }, f * 420);
          })(f);
        }
      }
    };
  })();

  /* ============ title ============ */

  var titleT = 0;
  function animateTitle() {
    if ($('screen-title').classList.contains('hidden')) return;
    titleT += 0.016;
    var cv = $('title-hero');
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    ART.drawCharacter(c, 'dinobob', 175, 320, 2.0, { t: titleT, look: 0 });
    ART.drawBow(c, 255, 200, -0.3, 0.15 + Math.sin(titleT * 2) * 0.1, 1.7);
    requestAnimationFrame(animateTitle);
  }

  /* ============ profiles ============ */

  function renderProfiles() {
    var list = $('profile-list');
    list.innerHTML = '';
    SAVE.profiles().forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'profile-card';
      var cv = document.createElement('canvas');
      card.appendChild(cv);
      var nm = document.createElement('div');
      nm.className = 'p-name'; nm.textContent = p.name;
      var cn = document.createElement('div');
      cn.className = 'p-coins'; cn.textContent = '🪙 ' + p.coins;
      card.appendChild(nm); card.appendChild(cn);

      var del = document.createElement('button');
      del.className = 'p-del'; del.textContent = '✕';
      del.onclick = function (e) {
        e.stopPropagation();
        modal('Delete ' + p.name + "'s game? All their coins and unlocks will be gone!", function () {
          modal('Are you REALLY sure? This cannot be undone!', function () {
            SAVE.deleteProfile(p.id);
            renderProfiles();
          });
        });
      };
      card.appendChild(del);

      portrait(cv, p.equipped.character, {
        hat: p.equipped.hat,
        outfitColor: DATA.outfitById(p.equipped.outfit).swap,
        outfitId: p.equipped.outfit
      });
      card.onclick = function () {
        AUDIO.click();
        SAVE.selectProfile(p.id);
        goHome();
      };
      list.appendChild(card);
    });

    // add-new card
    var add = document.createElement('div');
    add.className = 'profile-card add-card';
    add.innerHTML = '<div class="plus">+</div><div>New Player</div>';
    add.onclick = function () {
      AUDIO.click();
      list.classList.add('hidden');
      $('profile-new').classList.remove('hidden');
      $('profile-name-input').value = '';
      $('profile-name-input').focus();
    };
    list.appendChild(add);

    list.classList.remove('hidden');
    $('profile-new').classList.add('hidden');
  }

  function createProfile() {
    var name = $('profile-name-input').value.trim();
    if (!name) { AUDIO.nope(); $('profile-name-input').placeholder = 'Name first!'; return; }
    SAVE.addProfile(name, 'dinobob');
    AUDIO.fanfare();
    fx.confetti();
    goHome();
  }

  /* ============ home ============ */

  var homeT = 0;
  function animateHome() {
    if ($('screen-home').classList.contains('hidden')) return;
    homeT += 0.016;
    var p = SAVE.current();
    if (!p) return;
    var cv = $('home-hero');
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    ART.drawCharacter(c, p.equipped.character, 210, 410, 2.4, equippedOpts(p, homeT));
    requestAnimationFrame(animateHome);
  }

  function goHome() {
    if (familySession) {           // bailed out of a family match: give the starting player their profile back
      SAVE.selectProfile(familySession.original);
      familySession = null;
    }
    var p = SAVE.current();
    if (!p) { show('profiles'); renderProfiles(); return; }
    $('home-coins').textContent = p.coins;
    $('home-name').textContent = p.name;
    $('home-best').textContent = p.highScore;
    var char = DATA.characterById(p.equipped.character);
    var arrow = DATA.arrowById(p.equipped.arrow);
    $('home-perk').textContent = char.name + ': ' + char.perkText + ' · ' + arrow.name;
    show('home');
    animateHome();
  }

  /* ============ game ============ */

  function startRound(options, mode) {
    if (mode) activeMode = { type: mode, options: options || null, stage: options && options.stageIndex };
    else if (!activeMode.options) activeMode = { type: 'practice', options: null };
    show('game');
    AUDIO.stopMusic();
    GAME.start($('game-canvas'), function (results) {
      if (activeMode.type === 'family') handleFamilyResult(results);
      else {
        if (activeMode.type === 'adventure') finishAdventureRound(results);
        showResults(results);
      }
    }, options || activeMode.options || {});
  }

  function showResults(r) {
    show('results');
    if (AUDIO.musicPlaying() || musicWanted) AUDIO.startMusic();
    $('results-score').textContent = r.score;
    var s = r.stats || {};
    $('results-accuracy').textContent = (s.shots ? Math.min(100, Math.round(100 * s.hits / s.shots)) : 0) + '%';
    $('results-bullseyes').textContent = s.bullseyes || 0;
    $('results-coins-score').textContent = '+' + r.coinsFromScore;
    $('results-coins-direct').textContent = '+' + r.coinsDirect;
    var bonusRow = $('results-bonus-row');
    if (r.coinBonus > 0) {
      bonusRow.classList.remove('hidden');
      $('results-bonus-label').textContent = DATA.characterById(SAVE.current().equipped.character).name + ' bonus';
      $('results-bonus').textContent = '+' + Math.round(r.coinBonus * 100) + '%';
    } else {
      bonusRow.classList.add('hidden');
    }
    $('results-coins').textContent = '+' + r.coins;
    var returnLabel = $('btn-results-home').querySelector('span');
    if (returnLabel) returnLabel.textContent = activeMode.type === 'adventure' ? 'MAP' : 'Home';
    var banner = $('results-highscore');
    banner.classList.toggle('hidden', !r.isHighScore);
    $('results-header').textContent = r.adventureWon ? 'STAGE COMPLETE!' : (r.isHighScore ? 'AMAZING!' : 'ROUND OVER!');
    animateResultCharacter(r);
    if (r.isHighScore && r.score > 0) {
      fx.fireworks();
    }
  }

  var resultAnim = 0;
  function animateResultCharacter(r) {
    resultAnim++;
    var token = resultAnim;
    var p = SAVE.current();
    var char = DATA.characterById(p.equipped.character);
    var quips = {
      dinobob: ['ROAR-SOME SHOOTING!', 'DINO-MITE!'],
      ninja: ['SILENT. SWIFT. SHARP.', 'SHADOW SHOT!'],
      astronaut: ['THAT SCORE IS ORBITAL!', 'TO THE MOON!'],
      robot: ['RESULT: EXCELLENT.', 'AIM CALCULATED!'],
      bear: ['BEAR-Y IMPRESSIVE!', 'PAWSOME!']
    };
    var lines = quips[char.id] || quips.dinobob;
    $('results-quip').textContent = lines[r.score % lines.length];
    var t = 0;
    function dance() {
      if (token !== resultAnim || $('screen-results').classList.contains('hidden')) return;
      t += 0.045;
      var cv = $('results-character'), c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.save();
      var bounce = Math.abs(Math.sin(t * (char.id === 'robot' ? 5 : 3))) * 8;
      c.translate(0, -bounce);
      c.rotate(Math.sin(t * 2.5) * (char.id === 'ninja' ? 0.08 : 0.04));
      ART.drawCharacter(c, char.id, 85, 146, 0.92, equippedOpts(p, t));
      c.restore();
      requestAnimationFrame(dance);
    }
    dance();
  }

  /* ============ adventure map ============ */

  // Stage + boss data lives in js/stages.js so new worlds can be added there.
  var ADVENTURE = STAGES.list;
  var selectedStage = 0;

  function openAdventure() {
    activeMode = { type: 'adventure', options: null, stage: 0 };
    show('adventure');
    renderAdventure();
  }

  function renderAdventure() {
    var p = SAVE.current();
    var stars = p.adventureStars || [];
    var highestCleared = stars.reduce(function (max, idx) { return Math.max(max, idx); }, -1);
    var unlocked = Math.min(STAGES.count - 1, Math.max(p.adventureStage || 0, highestCleared + 1));
    selectedStage = Math.min(selectedStage, unlocked);
    $('adventure-stars').textContent = stars.length + ' / ' + STAGES.count + ' ★';
    var map = $('adventure-map');
    map.innerHTML = '';
    renderAdventureTrail(map, unlocked, stars);
    ADVENTURE.forEach(function (stage, i) {
      var btn = document.createElement('button');
      var done = stars.indexOf(i) !== -1;
      var locked = i > unlocked;
      btn.className = 'stage-node' + (done ? ' complete' : '') + (locked ? ' locked' : '') + (i === selectedStage ? ' selected' : '');
      btn.setAttribute('aria-label', (locked ? 'Locked stage: ' : 'Stage ' + (i + 1) + ': ') + stage.name);
      btn.innerHTML =
        '<span class="stage-sigil stage-sigil-' + ((stage.node && stage.node.sigil) || 'dot') + '"></span>' +
        '<span class="stage-num">' + (locked ? 'LOCK' : 'STAGE ' + (i + 1)) + '</span>' +
        '<span class="stage-name">' + (stage.shortName || stage.name) + '</span>';
      // Map node position + color come from the stage data (js/stages.js).
      if (stage.node) {
        btn.style.left = stage.node.x;
        btn.style.top = stage.node.y;
        if (stage.node.color) btn.style.background = stage.node.color;
        if (stage.node.accent) btn.style.setProperty('--stage-accent', stage.node.accent);
      }
      btn.onclick = function () {
        if (locked) { AUDIO.nope(); return; }
        AUDIO.click(); selectedStage = i; renderAdventure();
      };
      map.appendChild(btn);
    });
    renderAdventureDetail();
  }

  function renderAdventureTrail(map, unlocked, stars) {
    var pts = STAGES.nodePoints ? STAGES.nodePoints() : [];
    if (pts.length < 2) return;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'adventure-trail');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    var path = pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
    var shadow = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    shadow.setAttribute('class', 'trail-shadow');
    shadow.setAttribute('points', path);
    var base = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    base.setAttribute('class', 'trail-base');
    base.setAttribute('points', path);
    var lit = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    lit.setAttribute('class', 'trail-lit');
    lit.setAttribute('points', pts.slice(0, Math.max(1, unlocked + 1)).map(function (p) { return p.x + ',' + p.y; }).join(' '));
    svg.appendChild(shadow);
    svg.appendChild(base);
    svg.appendChild(lit);
    pts.forEach(function (p, i) {
      if (stars.indexOf(i) === -1) return;
      var star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      star.setAttribute('class', 'trail-star');
      star.setAttribute('cx', p.x);
      star.setAttribute('cy', p.y);
      star.setAttribute('r', '1.2');
      svg.appendChild(star);
    });
    map.appendChild(svg);
  }

  function renderAdventureDetail() {
    var stage = ADVENTURE[selectedStage];
    var detail = $('adventure-detail');
    var isBoss = stage.win && stage.win.type === 'boss';
    var accent = stage.node && stage.node.accent ? stage.node.accent : '#ffd23a';
    detail.style.setProperty('--stage-accent', accent);
    detail.innerHTML =
      '<div class="adventure-detail-kicker">Stage ' + (selectedStage + 1) + ' of ' + STAGES.count + (isBoss ? ' · Boss finale' : ' · Painted world') + '</div>' +
      '<h3>' + stage.name + '</h3><p>' + stage.blurb + STAGES.goalText(selectedStage) + '</p>' +
      '<div class="adventure-detail-tags"><span>' + (isBoss ? 'Boss battle' : 'Score quest') + '</span><span>' +
      (stage.background || 'surprise').replace(/^bg_/, '').replace(/_/g, ' ') + '</span></div>';
    var play = document.createElement('button');
    play.className = 'btn btn-orange'; play.textContent = 'PLAY STAGE ' + (selectedStage + 1);
    play.onclick = function () {
      AUDIO.click();
      var options = STAGES.optionsFor(selectedStage);
      activeMode = { type: 'adventure', options: options, stage: selectedStage };
      startRound(options, 'adventure');
      activeMode.stage = selectedStage;
    };
    detail.appendChild(play);
  }

  function finishAdventureRound(r) {
    var stageIndex = activeMode.stage || 0;
    var won = STAGES.won(stageIndex, r);
    if (won) {
      SAVE.completeAdventureStage(stageIndex);
      r.adventureWon = true;
      $('results-header').textContent = 'STAGE COMPLETE!';
      fx.confetti();
    }
  }

  /* ============ Penny's Challenge Maker ============ */

  function challengeFromControls() {
    var chaos = $('challenge-chaos').value;
    var rule = $('challenge-rule').value;
    var seconds = Number($('challenge-time').value);
    return {
      mode: 'challenge', label: "PENNY'S CUSTOM CHALLENGE",
      roundSeconds: seconds,
      arrows: Number($('challenge-arrows').value),
      targetSpeed: Number($('challenge-speed').value) / 100,
      moversAt: chaos === 'calm' ? seconds + 1 : (chaos === 'wild' ? 0 : Math.round(seconds * 0.28)),
      chaosAt: chaos === 'calm' ? seconds + 2 : (chaos === 'wild' ? 1 : Math.round(seconds * 0.68)),
      background: $('challenge-bg').value,
      theme: $('challenge-bg').value === 'cave' ? 'cave' : null,
      specialRule: rule,
      bossAtStart: rule === 'boss',
      maker: { chaos: chaos, bg: $('challenge-bg').value, rule: rule }
    };
  }

  function openChallenge() {
    var saved = SAVE.current().customChallenge;
    if (saved) {
      $('challenge-time').value = saved.roundSeconds || 45;
      $('challenge-arrows').value = saved.arrows || 18;
      $('challenge-speed').value = Math.round((saved.targetSpeed || 1) * 100);
      $('challenge-chaos').value = saved.maker && saved.maker.chaos || 'mixed';
      $('challenge-bg').value = saved.maker && saved.maker.bg || 'random';
      $('challenge-rule').value = saved.maker && saved.maker.rule || 'normal';
    }
    updateChallengeLabels();
    show('challenge');
  }

  function updateChallengeLabels() {
    $('challenge-time-value').textContent = $('challenge-time').value + 's';
    $('challenge-arrows-value').textContent = $('challenge-arrows').value;
    var n = Number($('challenge-speed').value);
    $('challenge-speed-value').textContent = n < 90 ? 'Gentle' : n > 120 ? 'Zoomy!' : 'Normal';
  }

  /* ============ two-player family mode ============ */

  function openFamily() {
    show('family');
    $('family-setup').classList.remove('hidden');
    $('family-handoff').classList.add('hidden');
    $('family-finish').classList.add('hidden');
    var profiles = SAVE.profiles();
    ['family-player-1', 'family-player-2'].forEach(function (id, selectIndex) {
      var select = $(id); select.innerHTML = '';
      profiles.forEach(function (p, i) {
        var opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
        if (i === selectIndex) opt.selected = true;
        select.appendChild(opt);
      });
    });
    $('btn-family-start').disabled = profiles.length < 2;
    var lede = $('family-setup').querySelector('.mode-lede');
    if (lede) lede.textContent = profiles.length < 2 ?
      'Family Mode needs two players. Tap the 👤 button on the home screen to add another player, then come back!' :
      'Choose two players. Each gets the same 45-second challenge.';
  }

  function beginFamilyMatch() {
    var p1 = $('family-player-1').value, p2 = $('family-player-2').value;
    if (!p1 || !p2 || p1 === p2) { AUDIO.nope(); return; }
    familySession = { players: [p1, p2], results: [], turn: 0, original: SAVE.current().id };
    SAVE.selectProfile(p1);
    var options = { mode: 'family', label: 'FAMILY MATCH · PLAYER 1', roundSeconds: 45, arrows: 18,
      moversAt: 12, chaosAt: 31, targetSpeed: 1, background: 'random' };
    activeMode = { type: 'family', options: options };
    startRound(options, 'family');
  }

  function handleFamilyResult(r) {
    familySession.results.push(r);
    AUDIO.startMusic();
    if (familySession.turn === 0) {
      familySession.turn = 1;
      show('family');
      $('family-setup').classList.add('hidden');
      $('family-finish').classList.add('hidden');
      $('family-handoff').classList.remove('hidden');
      var next = SAVE.profiles().find(function (p) { return p.id === familySession.players[1]; });
      $('family-handoff-text').textContent = r.score + ' points! Pass the game to ' + next.name + '.';
    } else {
      renderFamilyFinish();
    }
  }

  function familyNextTurn() {
    SAVE.selectProfile(familySession.players[1]);
    var options = { mode: 'family', label: 'FAMILY MATCH · PLAYER 2', roundSeconds: 45, arrows: 18,
      moversAt: 12, chaosAt: 31, targetSpeed: 1, background: 'random' };
    activeMode = { type: 'family', options: options };
    startRound(options, 'family');
  }

  function renderFamilyFinish() {
    show('family');
    $('family-setup').classList.add('hidden');
    $('family-handoff').classList.add('hidden');
    $('family-finish').classList.remove('hidden');
    var ps = familySession.players.map(function (id) { return SAVE.profiles().find(function (p) { return p.id === id; }); });
    var rs = familySession.results;
    var winner = rs[0].score === rs[1].score ? 'A PERFECT TIE!' :
      (rs[0].score > rs[1].score ? ps[0].name : ps[1].name) + ' WINS!';
    $('family-winner').textContent = winner;
    var awards = [
      ['🏆 Arrow Champion', rs[0].score >= rs[1].score ? ps[0].name : ps[1].name, Math.max(rs[0].score, rs[1].score) + ' points'],
      ['🎯 Bullseye Royalty', rs[0].stats.bullseyes >= rs[1].stats.bullseyes ? ps[0].name : ps[1].name, Math.max(rs[0].stats.bullseyes, rs[1].stats.bullseyes) + ' bullseyes'],
      ['🎈 Balloon Buster', rs[0].stats.balloons >= rs[1].stats.balloons ? ps[0].name : ps[1].name, Math.max(rs[0].stats.balloons, rs[1].stats.balloons) + ' balloons'],
      ['🌪️ Wildest Shot', rs[0].stats.misses >= rs[1].stats.misses ? ps[0].name : ps[1].name, Math.max(rs[0].stats.misses, rs[1].stats.misses) + ' adventurous misses']
    ];
    $('family-awards').innerHTML = awards.map(function (a) {
      return '<div class="family-award"><b>' + a[0] + '</b>' + a[1] + '<br><small>' + a[2] + '</small></div>';
    }).join('');
    SAVE.selectProfile(familySession.original);
    fx.confetti();
  }

  /* ============ arcade ============ */

  var currentTab = 'characters';
  var confirmingId = null; // tap-twice-to-buy

  function renderArcade() {
    var p = SAVE.current();
    $('arcade-coins').textContent = p.coins;
    var grid = $('arcade-grid');
    grid.innerHTML = '';
    confirmingId = null;

    if (currentTab === 'characters') {
      DATA.characters.forEach(function (ch) {
        grid.appendChild(shopItem({
          id: 'char_' + ch.id,
          name: ch.name,
          perk: ch.perkText,
          price: ch.price,
          owned: SAVE.owns('characters', ch.id),
          equipped: p.equipped.character === ch.id,
          draw: function (cv) { portrait(cv, ch.id); },
          buy: function () { SAVE.unlock('characters', ch.id); SAVE.equip('character', ch.id); },
          equip: function () { SAVE.equip('character', ch.id); }
        }));
      });
    } else if (currentTab === 'arrows') {
      DATA.arrows.forEach(function (a) {
        grid.appendChild(shopItem({
          id: 'arrow_' + a.id,
          name: a.name,
          perk: a.perkText,
          price: a.price,
          owned: SAVE.owns('arrows', a.id),
          equipped: p.equipped.arrow === a.id,
          draw: function (cv) {
            var c = cv.getContext('2d');
            cv.width = 150; cv.height = 160;
            ART.drawArrow(c, 75, 80, -Math.PI / 4, a, 1.7, 1);
          },
          buy: function () { SAVE.unlock('arrows', a.id); SAVE.equip('arrow', a.id); },
          equip: function () { SAVE.equip('arrow', a.id); }
        }));
      });
    } else {
      // skins: hats, then outfits, then shiny variants of owned characters
      DATA.hats.forEach(function (h) {
        grid.appendChild(shopItem({
          id: 'hat_' + h.id,
          name: h.name,
          perk: 'A stylish hat!',
          price: h.price,
          owned: SAVE.owns('hats', h.id),
          equipped: p.equipped.hat === h.id,
          draw: function (cv) {
            var c = cv.getContext('2d');
            cv.width = 150; cv.height = 160;
            ART.drawHat(c, h.id, 75, 105, 2.2);
          },
          buy: function () { SAVE.unlock('hats', h.id); SAVE.equip('hat', h.id); },
          equip: function () { SAVE.equip('hat', h.id); }
        }));
      });
      DATA.outfits.forEach(function (o) {
        if (!o.swap) return; // classic is default, not sold
        grid.appendChild(shopItem({
          id: 'outfit_' + o.id,
          name: o.name,
          perk: 'A fresh new color!',
          price: o.price,
          owned: SAVE.owns('outfits', o.id),
          equipped: p.equipped.outfit === o.id,
          draw: function (cv) { portrait(cv, p.equipped.character, { outfitColor: o.swap, outfitId: o.id }); },
          buy: function () { SAVE.unlock('outfits', o.id); SAVE.equip('outfit', o.id); },
          equip: function () { SAVE.equip('outfit', o.id); }
        }));
      });
      p.unlocked.characters.forEach(function (chId) {
        var ch = DATA.characterById(chId);
        grid.appendChild(shopItem({
          id: 'shiny_' + chId,
          name: 'Shiny ' + ch.name,
          perk: '✨ Sparkles everywhere! ✨',
          price: TUNING.PRICE_SHINY,
          owned: SAVE.owns('shiny', chId),
          equipped: p.equipped.shiny && p.equipped.character === chId,
          draw: function (cv) { portrait(cv, chId, { shiny: true, t: 1.2 }); },
          buy: function () {
            SAVE.unlock('shiny', chId);
            SAVE.equip('character', chId);
            SAVE.equip('shiny', true);
          },
          equip: function () {
            SAVE.equip('character', chId);
            SAVE.equip('shiny', true);
          }
        }));
      });
    }
  }

  function shopItem(item) {
    var p = SAVE.current();
    var el = document.createElement('div');
    el.className = 'shop-item' +
      (item.owned ? ' owned' : ' locked') +
      (item.equipped ? ' equipped' : '');
    var cv = document.createElement('canvas');
    el.appendChild(cv);
    item.draw(cv);
    if (item.owned || item.equipped) el.classList.remove('locked');

    var nm = document.createElement('div');
    nm.className = 's-name';
    nm.textContent = item.owned ? item.name : '???';
    el.appendChild(nm);

    var pk = document.createElement('div');
    pk.className = 's-perk';
    pk.textContent = item.perk;
    el.appendChild(pk);

    var btn = document.createElement('button');
    btn.className = 's-btn';
    if (item.equipped) {
      btn.classList.add('equipped-label');
      btn.textContent = '★ EQUIPPED';
    } else if (item.owned) {
      btn.classList.add('equip');
      btn.textContent = 'EQUIP';
      btn.onclick = function () {
        AUDIO.click();
        item.equip();
        renderArcade();
      };
    } else {
      var afford = p.coins >= item.price;
      btn.classList.add('buy');
      if (!afford) btn.classList.add('cant');
      btn.textContent = '🪙 ' + item.price;
      btn.onclick = function () {
        if (!afford) { AUDIO.nope(); return; }
        if (confirmingId !== item.id) {
          confirmingId = item.id;
          btn.classList.remove('buy');
          btn.classList.add('confirm');
          btn.textContent = 'BUY IT?';
          AUDIO.click();
          setTimeout(function () {
            if (confirmingId === item.id) { confirmingId = null; renderArcade(); }
          }, 2500);
          return;
        }
        // confirmed!
        if (SAVE.spend(item.price)) {
          item.buy();
          AUDIO.fanfare();
          fx.confetti();
          renderArcade();
        } else {
          AUDIO.nope();
        }
      };
    }
    el.appendChild(btn);
    return el;
  }

  function openArcade() {
    confirmingId = null;
    show('arcade');
    renderArcade();
  }

  /* ============ closet ============ */

  var closetT = 0;
  function animateClosetPreview() {
    if ($('screen-closet').classList.contains('hidden')) return;
    closetT += 0.016;
    var p = SAVE.current();
    var cv = $('closet-preview');
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    ART.drawCharacter(c, p.equipped.character, 85, 168, 1.05, equippedOpts(p, closetT));
    requestAnimationFrame(animateClosetPreview);
  }

  function closetOption(label, isEquipped, drawFn, onPick) {
    var el = document.createElement('div');
    el.className = 'closet-opt' + (isEquipped ? ' equipped' : '');
    if (drawFn) {
      var cv = document.createElement('canvas');
      el.appendChild(cv);
      drawFn(cv);
    }
    var lb = document.createElement('div');
    lb.textContent = label;
    el.appendChild(lb);
    el.onclick = function () { AUDIO.click(); onPick(); renderCloset(); };
    return el;
  }

  function renderCloset() {
    var p = SAVE.current();
    var body = $('closet-body');
    body.innerHTML = '';

    function section(title) {
      var sec = document.createElement('div');
      sec.className = 'closet-section';
      sec.innerHTML = '<h3>' + title + '</h3>';
      var row = document.createElement('div');
      row.className = 'closet-row';
      sec.appendChild(row);
      body.appendChild(sec);
      return row;
    }

    var rowC = section('CHARACTER');
    p.unlocked.characters.forEach(function (id) {
      var ch = DATA.characterById(id);
      rowC.appendChild(closetOption(ch.name, p.equipped.character === id,
        function (cv) { portrait(cv, id); },
        function () {
          SAVE.equip('character', id);
          if (!SAVE.owns('shiny', id)) SAVE.equip('shiny', false);
        }));
    });

    var rowA = section('ARROW');
    p.unlocked.arrows.forEach(function (id) {
      var a = DATA.arrowById(id);
      rowA.appendChild(closetOption(a.name.replace(' Arrow', ''), p.equipped.arrow === id,
        function (cv) {
          var c = cv.getContext('2d');
          cv.width = 100; cv.height = 108;
          ART.drawArrow(c, 50, 54, -Math.PI / 4, a, 1.1, 1);
        },
        function () { SAVE.equip('arrow', id); }));
    });

    var rowH = section('HAT');
    rowH.appendChild(closetOption('None', !p.equipped.hat, function (cv) {
      cv.width = 100; cv.height = 108;
      var c = cv.getContext('2d');
      c.font = '40px sans-serif'; c.textAlign = 'center';
      c.fillText('🚫', 50, 66);
    }, function () { SAVE.equip('hat', null); }));
    p.unlocked.hats.forEach(function (id) {
      var h = DATA.hatById(id);
      rowH.appendChild(closetOption(h.name, p.equipped.hat === id,
        function (cv) {
          var c = cv.getContext('2d');
          cv.width = 100; cv.height = 108;
          ART.drawHat(c, id, 50, 72, 1.6);
        },
        function () { SAVE.equip('hat', id); }));
    });

    var rowO = section('OUTFIT');
    p.unlocked.outfits.forEach(function (id) {
      var o = DATA.outfitById(id);
      rowO.appendChild(closetOption(o.name, p.equipped.outfit === id,
        function (cv) {
          cv.width = 100; cv.height = 108;
          var c = cv.getContext('2d');
          var sw = document.createElement('div');
          c.beginPath(); c.arc(50, 50, 26, 0, Math.PI * 2);
          c.fillStyle = o.swap || ART.PALETTES[p.equipped.character].body;
          c.fill();
        },
        function () { SAVE.equip('outfit', id); }));
    });

    if (SAVE.owns('shiny', p.equipped.character)) {
      var rowS = section('✨ SHINY MODE');
      rowS.appendChild(closetOption('Shiny ON', p.equipped.shiny,
        function (cv) { portrait(cv, p.equipped.character, { shiny: true, t: 1.2 }); },
        function () { SAVE.equip('shiny', true); }));
      rowS.appendChild(closetOption('Shiny OFF', !p.equipped.shiny,
        function (cv) { portrait(cv, p.equipped.character); },
        function () { SAVE.equip('shiny', false); }));
    }

    var earned = (p.badges || []).length;
    var rowB = section('🏅 STICKERS (' + earned + '/' + DATA.badges.length + ')');
    DATA.badges.forEach(function (b) {
      var owned = SAVE.hasBadge(b.id);
      rowB.appendChild(closetOption(owned ? b.name : '???', false,
        function (cv) {
          cv.width = 100; cv.height = 108;
          var c = cv.getContext('2d');
          c.globalAlpha = owned ? 1 : 0.28;
          c.font = '52px sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(owned ? b.emoji : '❓', 50, 50);
          c.globalAlpha = 1;
        },
        function () { /* stickers aren't equippable */ }));
    });
  }

  function openCloset() {
    show('closet');
    renderCloset();
    animateClosetPreview();
  }

  /* ============ settings (audio + accessibility) ============ */
  var musicWanted = true;

  function setToggle(el, on) {
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    var txt = el.querySelector('.toggle-text');
    if (txt) txt.textContent = on ? 'ON' : 'OFF';
  }

  // Keep the header music chip + the settings music toggle in sync, persist the
  // choice, and start/stop the loop.
  function setMusicPref(on) {
    musicWanted = on;
    SAVE.setSetting('music', on);
    AUDIO.setMusic(on);
    $('btn-music').classList.toggle('off', !on);
    setToggle($('set-music'), on);
  }

  function renderSettings() {
    var s = SAVE.settings();
    setToggle($('set-music'), s.music);
    setToggle($('set-sfx'), s.sfx);
    setToggle($('set-easy'), s.easy);
  }

  function openSettings() {
    renderSettings();
    show('settings');
  }

  // Apply saved settings once at boot (music itself starts on the first tap).
  function applySettings() {
    var s = SAVE.settings();
    musicWanted = s.music;
    AUDIO.setSfx(s.sfx);
    $('btn-music').classList.toggle('off', !s.music);
  }

  /* ============ wire up ============ */

  function bind() {
    $('btn-title-play').onclick = function () {
      AUDIO.unlock();
      AUDIO.click();
      if (musicWanted) AUDIO.startMusic();
      var profiles = SAVE.profiles();
      if (profiles.length === 0) {
        show('profiles');
        renderProfiles();
        // jump straight to name entry for the very first player
        $('profile-list').classList.add('hidden');
        $('profile-new').classList.remove('hidden');
        setTimeout(function () { $('profile-name-input').focus(); }, 50);
      } else if (profiles.length === 1) {
        SAVE.selectProfile(profiles[0].id);
        goHome();
      } else {
        show('profiles');
        renderProfiles();
      }
    };

    $('btn-profile-create').onclick = function () { createProfile(); };
    $('profile-name-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') createProfile();
    });
    $('btn-profile-cancel').onclick = function () {
      AUDIO.click();
      if (SAVE.profiles().length === 0) { show('title'); animateTitle(); }
      else renderProfiles();
    };

    $('btn-play').onclick = function () { AUDIO.click(); startRound({}, 'practice'); };
    $('btn-adventure').onclick = function () { AUDIO.click(); openAdventure(); };
    $('btn-challenge').onclick = function () { AUDIO.click(); openChallenge(); };
    $('btn-family').onclick = function () { AUDIO.click(); openFamily(); };
    $('btn-arcade').onclick = function () { AUDIO.click(); openArcade(); };
    $('btn-closet').onclick = function () { AUDIO.click(); openCloset(); };
    $('btn-switch-profile').onclick = function () {
      AUDIO.click();
      show('profiles');
      renderProfiles();
    };
    $('btn-music').onclick = function () {
      AUDIO.unlock();
      setMusicPref(!musicWanted);
    };
    $('btn-settings').onclick = function () { AUDIO.click(); openSettings(); };
    $('btn-settings-back').onclick = function () { AUDIO.click(); goHome(); };
    $('set-music').onclick = function () { AUDIO.unlock(); setMusicPref(!SAVE.settings().music); };
    $('set-sfx').onclick = function () {
      var on = !SAVE.settings().sfx;
      SAVE.setSetting('sfx', on);
      AUDIO.setSfx(on);
      setToggle($('set-sfx'), on);
      if (on) AUDIO.click();   // little confirmation chirp when turning back on
    };
    $('set-easy').onclick = function () {
      AUDIO.click();
      var on = !SAVE.settings().easy;
      SAVE.setSetting('easy', on);
      setToggle($('set-easy'), on);
    };
    $('set-reset').onclick = function () {
      AUDIO.click();
      modal('Reset all progress for this player? Coins, unlocks and stars will be gone!', function () {
        modal('Are you REALLY sure? This cannot be undone!', function () {
          SAVE.resetProgress();
          AUDIO.fanfare();
          goHome();
        });
      });
    };

    $('btn-quit-round').onclick = function () {
      modal('End this round early?', function () {
        GAME.stop();
        goHome();
        if (musicWanted) AUDIO.startMusic();
      });
    };

    $('btn-again').onclick = function () { AUDIO.click(); startRound(activeMode.options || {}, activeMode.type); };
    $('btn-results-arcade').onclick = function () { AUDIO.click(); openArcade(); };
    $('btn-results-home').onclick = function () {
      AUDIO.click();
      if (activeMode.type === 'adventure') openAdventure();
      else goHome();
    };

    $('btn-arcade-back').onclick = function () { AUDIO.click(); goHome(); };
    $('btn-closet-back').onclick = function () { AUDIO.click(); goHome(); };
    $('btn-adventure-back').onclick = function () { AUDIO.click(); goHome(); };
    $('btn-challenge-back').onclick = function () { AUDIO.click(); goHome(); };
    $('btn-family-back').onclick = function () { AUDIO.click(); goHome(); };

    ['challenge-time', 'challenge-arrows', 'challenge-speed'].forEach(function (id) {
      $(id).addEventListener('input', updateChallengeLabels);
    });
    $('btn-challenge-start').onclick = function () {
      AUDIO.click();
      var challenge = challengeFromControls();
      SAVE.saveChallenge(challenge);
      startRound(challenge, 'challenge');
    };
    $('btn-family-start').onclick = function () { AUDIO.click(); beginFamilyMatch(); };
    $('btn-family-next').onclick = function () { AUDIO.click(); familyNextTurn(); };
    $('btn-family-again').onclick = function () { AUDIO.click(); openFamily(); };
    $('btn-family-home').onclick = function () { AUDIO.click(); goHome(); };

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.onclick = function () {
        AUDIO.click();
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        renderArcade();
      };
    });
  }

  return {
    boot: function () {
      SAVE.load();
      bind();
      applySettings();
      show('title');
      animateTitle();
    },
    show: show,
    goHome: goHome
  };
})();
