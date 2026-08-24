/* All DOM screens: title, profiles, home, arcade, closet, results,
   plus the confetti/fireworks overlay and kid-proof modal. */

var UI = (function () {

  var $ = function (id) { return document.getElementById(id); };
  var menuDpr = Math.min(window.devicePixelRatio || 1, 2);

  // Sizes a menu canvas to logical CSS pixels × devicePixelRatio so the small
  // hero/portrait canvases render sharp on retina; drawing code keeps using
  // logical coordinates through the returned context's transform.
  function hidpi(canvas, w, h) {
    var bw = Math.round(w * menuDpr), bh = Math.round(h * menuDpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var c = canvas.getContext('2d');
    c.setTransform(menuDpr, 0, 0, menuDpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return c;
  }

  var screens = ['title', 'profiles', 'home', 'game', 'results', 'arcade', 'closet', 'adventure', 'challenge', 'workshop', 'family', 'settings', 'quests'];
  var activeMode = { type: 'practice', options: null };
  var familySession = null;

  function show(name) {
    screens.forEach(function (s) {
      $('screen-' + s).classList.toggle('hidden', s !== name);
    });
  }

  /* ============ tiny character portrait renderer ============ */

  function portrait(canvas, charId, opts) {
    var c = hidpi(canvas, 150, 160);
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

  function previewCharacter(canvas, charId, opts, t) {
    var c = hidpi(canvas, 260, 220);
    ART.drawCharacter(c, charId, 130, 210, 1.3, Object.assign({ t: t || 1 }, opts || {}));
  }

  function previewArrow(canvas, arrow, t) {
    var c = hidpi(canvas, 260, 220);
    c.save();
    c.translate(130, 110);
    var pulse = wantsReducedMotion() ? 1 : 1 + Math.sin((t || 0) * 5) * 0.06;
    c.scale(pulse, pulse);
    c.rotate(-0.12);
    c.globalAlpha = 0.35;
    c.strokeStyle = arrow.tipColor || '#62e6ff';
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-86, 34);
    c.lineTo(70, -34);
    c.stroke();
    c.globalAlpha = 1;
    ART.drawArrow(c, 0, 0, -Math.PI / 5, arrow, 2.4, 1);
    c.restore();
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

  /* ============ what's new (Ship Day notes from js/changelog.js) ============ */

  function renderWhatsNew() {
    var list = $('whats-new-list');
    list.innerHTML = '';
    (typeof CHANGELOG === 'undefined' ? [] : CHANGELOG).forEach(function (entry) {
      var wrap = document.createElement('div');
      var head = document.createElement('div');
      head.innerHTML = '<span class="whatsnew-version">v' + entry.v + '</span>' +
        '<span class="whatsnew-date">' + entry.date + '</span>';
      var ul = document.createElement('ul');
      entry.notes.forEach(function (note) {
        var li = document.createElement('li');
        li.textContent = note;
        ul.appendChild(li);
      });
      wrap.appendChild(head);
      wrap.appendChild(ul);
      list.appendChild(wrap);
    });
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
        var reduced = wantsReducedMotion();
        var total = reduced ? Math.min(18, Math.ceil(TUNING.CONFETTI_AMOUNT * 0.15)) : TUNING.CONFETTI_AMOUNT;
        for (var i = 0; i < total; i++) {
          parts.push({
            x: Math.random() * canvas.width,
            y: reduced ? canvas.height * 0.12 + Math.random() * canvas.height * 0.18 : -20 - Math.random() * canvas.height * 0.3,
            vx: (Math.random() - 0.5) * (reduced ? 36 : 120),
            vy: reduced ? 35 + Math.random() * 55 : 120 + Math.random() * 240,
            grav: reduced ? 18 : 60,
            r: 4 + Math.random() * (reduced ? 3 : 6),
            rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * (reduced ? 2 : 10),
            life: reduced ? 0.8 + Math.random() * 0.4 : 2 + Math.random() * 1.5,
            color: COLORS[i % COLORS.length],
            shape: 'rect'
          });
        }
        kick();
      },
      fireworks: function (n) {
        ensure();
        var reduced = wantsReducedMotion();
        var count = reduced ? 1 : (n || TUNING.HIGH_SCORE_FIREWORKS);
        for (var f = 0; f < count; f++) {
          (function (f) {
            setTimeout(function () {
              if (!reduced) AUDIO.firework();
              var cx = canvas.width * (0.15 + Math.random() * 0.7);
              var cy = canvas.height * (0.15 + Math.random() * 0.45);
              var color = COLORS[Math.floor(Math.random() * COLORS.length)];
              var sparks = reduced ? 10 : 36;
              for (var i = 0; i < sparks; i++) {
                var a = i / sparks * Math.PI * 2;
                var sp = reduced ? 45 + Math.random() * 55 : 120 + Math.random() * 220;
                parts.push({
                  x: cx, y: cy,
                  vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                  grav: reduced ? 45 : 160, r: 2.5 + Math.random() * (reduced ? 1.5 : 3),
                  rot: 0, vr: 0,
                  life: reduced ? 0.45 + Math.random() * 0.25 : 0.8 + Math.random() * 0.7,
                  color: color, shape: 'dot'
                });
              }
              kick();
            }, f * (reduced ? 0 : 420));
          })(f);
        }
      }
    };
  })();

  /* ============ title ============ */

  // The cinematic title scene (tools/title_scene.py) carries the visuals
  // now; the little canvas hero was retired with it.

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
    var c = hidpi(cv, 420, 430);
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
    var dailyBest = SAVE.dailyBest();
    $('home-daily-best').textContent = dailyBest > 0 ? dailyBest : '—';
    var mBest = SAVE.marathonBest();
    var mChip = $('home-marathon-best');
    if (mChip) {
      mChip.textContent = 'BEST ' + mBest;
      mChip.classList.toggle('hidden', !(mBest > 0));
    }
    renderQuestBanner();
    show('home');
    animateHome();
    // A shared challenge link (#c=...) waits until we're home with a profile
    // loaded, then offers to play it once.
    checkSharedChallenge();
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
        creditQuests(results);
        if (activeMode.type === 'adventure') finishAdventureRound(results);
        if (activeMode.type === 'daily') applyDailyResult(results);
        if (activeMode.type === 'workshop') finishWorkshopRound(results);
        showResults(results);
      }
    }, options || activeMode.options || {});
  }

  // Feed a finished round's totals into today's daily quests (single-player only).
  function creditQuests(r) {
    var s = r.stats || {};
    SAVE.addQuestProgress({
      bullseyes: s.bullseyes || 0,
      balloons: s.balloons || 0,
      fruits: s.fruits || 0,
      chests: s.chests || 0,
      coins: r.coins || 0,
      rounds: 1,
      score: r.score || 0
    });
  }

  /* ============ daily quests ============ */

  function questTmpl(id) {
    return (DATA.questPool || []).find(function (t) { return t.id === id; }) || { icon: '❓', text: 'Quest', target: 1 };
  }

  // Home banner: show how many quests are ready to claim.
  function renderQuestBanner() {
    var btn = $('btn-quests');
    if (!btn) return;
    var ready = SAVE.questsClaimable();
    var badge = $('home-quests-badge');
    if (badge) {
      badge.textContent = ready;
      badge.classList.toggle('hidden', ready === 0);
    }
    btn.classList.toggle('ready', ready > 0);
  }

  function openQuests() {
    renderQuests();
    show('quests');
  }

  function renderQuests() {
    var list = $('quests-list');
    list.innerHTML = '';
    SAVE.dailyQuests().forEach(function (q) {
      var t = questTmpl(q.id);
      var done = q.progress >= q.target;
      var card = document.createElement('div');
      card.className = 'quest-card' + (q.claimed ? ' claimed' : (done ? ' done' : ''));
      var pct = Math.round(100 * Math.min(1, q.progress / q.target));
      card.innerHTML =
        '<div class="quest-icon">' + t.icon + '</div>' +
        '<div class="quest-main">' +
          '<div class="quest-text">' + t.text.replace('%n', t.target) + '</div>' +
          '<div class="quest-bar"><span style="width:' + pct + '%"></span></div>' +
          '<div class="quest-progress">' + Math.min(q.progress, q.target) + ' / ' + q.target + '</div>' +
        '</div>';
      var action = document.createElement('div');
      action.className = 'quest-action';
      if (q.claimed) {
        action.innerHTML = '<span class="quest-claimed">✓</span>';
      } else if (done) {
        var claim = document.createElement('button');
        claim.className = 'btn btn-green quest-claim';
        claim.textContent = '+' + q.reward + ' 🪙';
        claim.onclick = function () {
          var got = SAVE.claimQuest(q.id);
          if (got > 0) { AUDIO.coin(); fx.confetti(); renderQuests(); renderQuestBanner(); $('home-coins').textContent = SAVE.current().coins; }
        };
        action.appendChild(claim);
      } else {
        action.innerHTML = '<span class="quest-reward">+' + q.reward + ' 🪙</span>';
      }
      card.appendChild(action);
      list.appendChild(card);
    });
  }

  function showResults(r) {
    show('results');
    if (AUDIO.musicPlaying() || musicWanted) AUDIO.startMusic();
    // Marathon: bank the per-profile best before drawing the results card.
    if (activeMode.type === 'marathon') {
      r.marathonRecord = SAVE.recordMarathonBest(r.score);
      r.marathonBest = SAVE.marathonBest();
    }
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
    if (activeMode.type === 'workshop' && r.workshopWon) $('results-header').textContent = 'BOSS DEFEATED!';
    if (activeMode.type === 'marathon') $('results-header').textContent = r.marathonRecord ? 'NEW MARATHON BEST!' : 'MARATHON OVER!';
    // context line: who sent a shared challenge, or the daily challenge tag
    var ctx = $('results-context');
    if (ctx) {
      if (r.challengeFrom) ctx.textContent = '🎁 Challenge from ' + r.challengeFrom + '!';
      else if (activeMode.type === 'daily') ctx.textContent = "📅 Today's family challenge";
      else if (activeMode.type === 'marathon') {
        ctx.textContent = r.marathonRecord ? '🏆 Waves survived: ' + (r.waves || 1) :
          '🏃 Waves survived: ' + (r.waves || 1) + ' · Best: ' + r.marathonBest;
      }
      else if (activeMode.type === 'workshop' && r.workshopWon && r.workshopBoss) ctx.textContent = '👑 ' + r.workshopBoss + ' has fallen!';
      else ctx.textContent = '';
      ctx.classList.toggle('hidden', !ctx.textContent);
    }
    var dailyBanner = $('results-daily');
    if (dailyBanner) dailyBanner.classList.toggle('hidden', !(activeMode.type === 'daily' && r.dailyRecord));
    var adventureRow = $('results-adventure-row');
    if (adventureRow) {
      if (activeMode.type === 'adventure' && r.adventureWon) {
        var reward = r.adventureReward || { improved: 0, reward: r.adventureRewardCoins || 0, replay: false };
        adventureRow.classList.remove('hidden');
        $('results-adventure-stars').innerHTML = starHTML(r.adventureStars || 1);
        $('results-adventure-text').textContent =
          (reward.improved > 0 ? '+' + reward.improved + ' new star' + (reward.improved > 1 ? 's' : '') : 'Replay clear') +
          ' · +' + (reward.reward || 0) + ' bonus coins';
        $('results-coins').textContent = '+' + ((r.coins || 0) + (reward.reward || 0));
      } else {
        adventureRow.classList.add('hidden');
      }
    }
    // Workshop win: the +50 boss bonus is already banked, fold it into the total.
    if (activeMode.type === 'workshop' && r.workshopBonus) {
      $('results-coins').textContent = '+' + ((r.coins || 0) + r.workshopBonus);
    }
    animateResultCharacter(r);
    if (r.isHighScore && r.score > 0) {
      AUDIO.voice('new_best');
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
      var cv = $('results-character'), c = hidpi(cv, 170, 150);
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

  function starHTML(n) {
    n = Math.max(0, Math.min(3, n || 0));
    var out = '';
    for (var i = 1; i <= 3; i++) out += i <= n ? '★' : '<span class="dim">★</span>';
    return out;
  }

  function openAdventure() {
    activeMode = { type: 'adventure', options: null, stage: 0 };
    show('adventure');
    renderAdventure();
  }

  function renderAdventure() {
    var p = SAVE.current();
    var stars = p.adventureStars || [];
    var starTotal = SAVE.adventureStarTotal ? SAVE.adventureStarTotal() : stars.length;
    var highestCleared = stars.reduce(function (max, idx) { return Math.max(max, idx); }, -1);
    var unlocked = Math.min(STAGES.count - 1, Math.max(p.adventureStage || 0, highestCleared + 1));
    selectedStage = Math.min(selectedStage, unlocked);
    $('adventure-stars').textContent = starTotal + ' / ' + (STAGES.count * 3) + ' ★';
    var map = $('adventure-map');
    map.innerHTML = '';
    renderAdventureTrail(map, unlocked, stars);
    ADVENTURE.forEach(function (stage, i) {
      var btn = document.createElement('button');
      var done = stars.indexOf(i) !== -1;
      var rating = SAVE.adventureStarRating ? SAVE.adventureStarRating(i) : (done ? 1 : 0);
      var locked = i > unlocked;
      btn.className = 'stage-node' + (done ? ' complete' : '') + (locked ? ' locked' : '') + (i === selectedStage ? ' selected' : '');
      btn.setAttribute('aria-label', (locked ? 'Locked stage: ' : 'Stage ' + (i + 1) + ': ') + stage.name);
      btn.innerHTML =
        '<span class="stage-sigil stage-sigil-' + ((stage.node && stage.node.sigil) || 'dot') + '"></span>' +
        '<span class="stage-num">' + (locked ? 'LOCK' : 'STAGE ' + (i + 1)) + '</span>' +
        '<span class="stage-name">' + (stage.shortName || stage.name) + '</span>' +
        (rating ? '<span class="stage-rating">' + starHTML(rating) + '</span>' : '');
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
    var rating = SAVE.adventureStarRating ? SAVE.adventureStarRating(selectedStage) : 0;
    var accent = stage.node && stage.node.accent ? stage.node.accent : '#ffd23a';
    detail.style.setProperty('--stage-accent', accent);
    detail.innerHTML =
      '<div class="adventure-detail-kicker">Stage ' + (selectedStage + 1) + ' of ' + STAGES.count + (isBoss ? ' · Boss finale' : ' · Painted world') + '</div>' +
      '<div class="adventure-detail-stars">' + starHTML(rating) + '</div>' +
      '<h3>' + stage.name + '</h3><p>' + stage.blurb + '</p>' +
      '<div class="adventure-detail-goals">' + STAGES.starGoalText(selectedStage) + '</div>' +
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
      var stars = STAGES.starRating(stageIndex, r);
      var reward = SAVE.completeAdventureStage(stageIndex, stars);
      r.adventureWon = true;
      r.adventureStars = stars;
      r.adventureReward = reward;
      r.adventureRewardCoins = reward.reward;
      $('results-header').textContent = 'STAGE COMPLETE!';
      AUDIO.voice('stage_clear');
      fx.confetti();
    }
  }

  /* ============ Penny's Challenge Maker ============ */

  // One builder for challenge configs, used by the maker controls, shared
  // links and the daily challenge so all three produce identical shapes.
  function challengeFromValues(seconds, arrows, speedPct, chaos, bg, rule, author) {
    seconds = Math.max(20, Math.min(120, Math.round(seconds)));
    arrows = Math.max(5, Math.min(40, Math.round(arrows)));
    speedPct = Math.max(60, Math.min(180, Math.round(speedPct)));
    return {
      mode: 'challenge',
      label: author ? 'CHALLENGE FROM ' + String(author).toUpperCase() : "PENNY'S CUSTOM CHALLENGE",
      roundSeconds: seconds,
      arrows: arrows,
      targetSpeed: speedPct / 100,
      moversAt: chaos === 'calm' ? seconds + 1 : (chaos === 'wild' ? 0 : Math.round(seconds * 0.28)),
      chaosAt: chaos === 'calm' ? seconds + 2 : (chaos === 'wild' ? 1 : Math.round(seconds * 0.68)),
      background: bg,
      theme: bg === 'cave' ? 'cave' : null,
      specialRule: rule,
      bossAtStart: rule === 'boss',
      maker: { chaos: chaos, bg: bg, rule: rule },
      from: author || null
    };
  }

  function challengeFromControls() {
    return challengeFromValues(
      Number($('challenge-time').value),
      Number($('challenge-arrows').value),
      Number($('challenge-speed').value),
      $('challenge-chaos').value,
      $('challenge-bg').value,
      $('challenge-rule').value,
      SAVE.current() ? SAVE.current().name : null
    );
  }

  /* ---- shareable challenge codes (#c=... in the page URL) ----
     share-codes:start  (pure string math below: no DOM, safe to unit-test)
     Config → tiny JSON (v1, defaults dropped) → base64url → "#c=<body.check>"
     where check is the char-code sum of body mod 97, so smudged or mistyped
     codes are rejected before we ever try to play one. */
  function b64uEncode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    var b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return decodeURIComponent(escape(atob(b)));
  }
  function challengeChecksum(s) {
    var sum = 0;
    for (var i = 0; i < s.length; i++) sum = (sum + s.charCodeAt(i)) % 97;
    return sum;
  }
  // Compact schema: v=version, t=time(s), a=arrows, s=speed(%), c=chaos,
  // b=scenery, r=special rule, n=author name. Defaults are omitted to keep
  // the link short.
  function challengeCodeEncode(cfg) {
    var o = { v: 1 };
    if (cfg.roundSeconds !== 45) o.t = cfg.roundSeconds;
    if (cfg.arrows !== 18) o.a = cfg.arrows;
    if (cfg.targetSpeed !== 1) o.s = Math.round(cfg.targetSpeed * 100);
    if (cfg.maker && cfg.maker.chaos !== 'mixed') o.c = cfg.maker.chaos;
    if (cfg.maker && cfg.maker.bg !== 'random') o.b = cfg.maker.bg;
    if (cfg.maker && cfg.maker.rule !== 'normal') o.r = cfg.maker.rule;
    if (cfg.from && String(cfg.from).length <= 12) o.n = String(cfg.from);
    var body = b64uEncode(JSON.stringify(o));
    return body + '.' + challengeChecksum(body);
  }
  function clampNum(v, lo, hi, dflt) {
    v = Number(v);
    return isNaN(v) ? dflt : Math.round(Math.max(lo, Math.min(hi, v)));
  }
  // Returns a full round config, or null for any tampered/garbage code.
  function challengeConfigFromCode(code) {
    try {
      if (typeof code !== 'string') return null;
      var dot = code.lastIndexOf('.');
      if (dot < 1) return null;
      var body = code.slice(0, dot);
      if (Number(code.slice(dot + 1)) !== challengeChecksum(body)) return null;
      var o = JSON.parse(b64uDecode(body));
      if (!o || o.v !== 1) return null;
      var chaos = ['calm', 'mixed', 'wild'].indexOf(o.c) !== -1 ? o.c : 'mixed';
      var bg = ['random', 'bg_meadow', 'bg_sunset_beach', 'bg_mountain', 'bg_starlight', 'bg_underwater', 'cave']
        .indexOf(o.b) !== -1 ? o.b : 'random';
      var rule = ['normal', 'balloons', 'fruit', 'boss'].indexOf(o.r) !== -1 ? o.r : 'normal';
      return challengeFromValues(
        o.t === undefined ? 45 : clampNum(o.t, 20, 120, 45),
        o.a === undefined ? 18 : clampNum(o.a, 5, 40, 18),
        o.s === undefined ? 100 : clampNum(o.s, 60, 180, 100),
        chaos, bg, rule,
        typeof o.n === 'string' ? o.n.slice(0, 12) : null
      );
    } catch (e) {
      return null;
    }
  }
  /* share-codes:end */

  // Old-school clipboard fallback for browsers/settings where the async
  // clipboard API is unavailable (e.g. plain http on some iPads).
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---- incoming challenges: offer shared codes after boot/home ---- */
  function clearChallengeHash() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  // Called from goHome(): by then a profile always exists, so GAME.start is
  // safe. "No" (and bad codes) wipe the hash so it never nags again.
  function checkSharedChallenge() {
    var match = /^#c=([A-Za-z0-9_\-.]+)$/.exec(location.hash);
    if (!match) return;
    var code = match[1];
    clearChallengeHash();
    var cfg = challengeConfigFromCode(code);
    if (!cfg) {
      modal("That challenge link got smudged on its way here and won't open. Ask for a fresh one!", function () {});
      return;
    }
    modal((cfg.from || 'Someone') + ' sent you a challenge! Play it?', function () {
      startRound(cfg, 'challenge');
    });
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

  /* ============ Marathon endless mode ============ */

  // Endless score attack: no clock, no arrow limit. Three targets escaping
  // ends the run; every 30s wave pushes speed past the normal phase-3 cap.
  function marathonOptions() {
    return {
      mode: 'marathon',
      label: 'MARATHON',
      roundSeconds: 3600,          // never counts down — rules.endless turns the clock off
      arrows: 99999,               // endless arrows (∞ on the HUD)
      moversAt: TUNING.MARATHON_MOVERS_AT,
      chaosAt: TUNING.MARATHON_CHAOS_AT,
      targetSpeed: 1,
      background: 'random',
      endless: true
    };
  }

  /* ============ daily family challenge ============ */

  // Same PRNG flavor as game.js so a seed means the same thing everywhere.
  function mulberry32ui(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) | 0;
      var z = t;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seed from the calendar date, so every device on Earth gets the same
  // layout that day — zero network required.
  function todaySeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  // Deterministic per-day config: scenery, action style, special rule,
  // timing, arrows and target speed all roll off one seeded stream. Boss is
  // excluded — a whole round of just boss is a bit much before breakfast.
  function dailyChallengeFor(seed) {
    var rnd = mulberry32ui(seed);
    function pickOne(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    var cfg = challengeFromValues(
      pickOne([40, 45, 50]),
      16 + Math.floor(rnd() * 5),                       // 16..20 arrows
      90 + Math.floor(rnd() * 5) * 10,                  // 90%..130% speed
      pickOne(['calm', 'mixed', 'wild']),
      pickOne(['bg_meadow', 'bg_sunset_beach', 'bg_mountain', 'bg_starlight', 'bg_underwater', 'cave']),
      pickOne(['normal', 'balloons', 'fruit']),
      null
    );
    cfg.mode = 'daily';
    cfg.daily = true;
    cfg.seed = seed;
    cfg.label = "TODAY'S FAMILY CHALLENGE";
    return cfg;
  }

  function startDailyChallenge() {
    var seed = todaySeed();
    startRound(dailyChallengeFor(seed), 'daily');
  }

  // Device-wide family record: returns true when today's best was beaten.
  function applyDailyResult(r) {
    r.dailyRecord = SAVE.recordDailyBest(r.score);
  }

  /* ============ Penny's Boss Workshop ============ */

  // Design a Moonstone-King-style boss, watch it idle in the live preview,
  // save up to four designs per player, then fight it in the moon cave.
  var previewToken = 0;

  function workshopCfg() {
    var weakBtn = document.querySelector('#boss-weak-row .seg-btn.selected');
    var bodyBtn = document.querySelector('#boss-body-row .seg-btn.selected');
    var name = ($('boss-name').value || '').trim().slice(0, 16);
    return {
      id: 'wb' + Date.now() + Math.floor(Math.random() * 1000),
      name: name || "Penny's Boss",
      body: bodyBtn ? bodyBtn.dataset.body : 'moonstone',
      hue: Number($('boss-hue').value) || 0,
      scale: Number($('boss-size').value) || 2.5,
      hp: Number($('boss-hp-value').textContent) || 6,
      weak: weakBtn ? weakBtn.dataset.weak : 'mid',
      wobble: Number($('boss-wobble').value) || 50,
      created: Date.now()
    };
  }

  function updateWorkshopLabels() {
    var hue = Number($('boss-hue').value) || 0;
    var swatch = $('boss-hue-swatch');
    swatch.style.background = 'hsl(' + hue + ', 78%, 60%)';
    var size = Number($('boss-size').value);
    $('boss-size-value').textContent = size < 2.1 ? 'Small-ish' : size < 2.9 ? 'Big' : 'GIANT!';
    var wobble = Number($('boss-wobble').value);
    $('boss-wobble-value').textContent = wobble === 0 ? 'Stone still' : wobble <= 40 ? 'Gentle' : wobble <= 60 ? 'Classic' : 'Wobbly!!';
  }

  // Live preview: one frame of the boss per tick through GAME.previewBoss —
  // the real game draw path with a minimal fake boss state. Under reduced
  // motion we paint a single static pose instead of looping.
  function animateBossPreview() {
    var token = ++previewToken;
    var reduced = SAVE.settings().reducedMotion;
    var t0 = performance.now();
    function frame() {
      if (token !== previewToken || $('screen-workshop').classList.contains('hidden')) return;
      GAME.previewBoss($('boss-preview'), workshopCfg(), reduced ? 1.3 : (performance.now() - t0) / 1000);
      if (!reduced) requestAnimationFrame(frame);
    }
    frame();
  }

  function renderSavedBosses() {
    var wrap = $('workshop-saved');
    if (!wrap) return;
    wrap.innerHTML = '';
    SAVE.customBosses().forEach(function (b) {
      var chip = document.createElement('div');
      chip.className = 'saved-boss-chip';
      chip.innerHTML =
        '<span class="saved-boss-dot" style="background:hsl(' + (b.hue || 0) + ',78%,60%)"></span>' +
        '<span class="saved-boss-name"></span>';
      chip.querySelector('.saved-boss-name').textContent = b.name;   // textContent: no HTML injection
      var fight = document.createElement('button');
      fight.className = 'btn btn-pink';
      fight.textContent = 'FIGHT';
      fight.onclick = function () { AUDIO.click(); startRound(workshopRoundOptions(b), 'workshop'); };
      var del = document.createElement('button');
      del.className = 'btn btn-ghost';
      del.textContent = '✕';
      del.onclick = function () {
        AUDIO.click();
        modal('Send "' + b.name + '" away forever?', function () {
          modal('Are you REALLY sure? This cannot be undone!', function () {
            SAVE.deleteCustomBoss(b.id);
            renderSavedBosses();
          });
        });
      };
      chip.appendChild(fight);
      chip.appendChild(del);
      wrap.appendChild(chip);
    });
    if (!SAVE.customBosses().length) {
      var empty = document.createElement('span');
      empty.className = 'saved-boss-name';
      empty.style.opacity = '0.6';
      empty.textContent = 'No bosses saved yet — design one above!';
      wrap.appendChild(empty);
    }
  }

  function openWorkshop() {
    updateWorkshopLabels();
    renderSavedBosses();
    show('workshop');
    animateBossPreview();
  }

  function saveWorkshopBoss() {
    var shelf = SAVE.customBosses();
    var doSave = function () {
      SAVE.saveCustomBoss(workshopCfg());
      AUDIO.fanfare();
      fx.confetti();
      renderSavedBosses();
    };
    if (shelf.length >= 4) {
      // Destructive: saving a 5th evicts the oldest, so confirm it twice.
      modal('Your boss shelf is full! Saving this one will replace "' + shelf[0].name + '".', function () {
        modal('Really replace your oldest boss?', doSave);
      });
    } else {
      doSave();
    }
  }

  // Standalone boss encounter: mirrors the adventure's moon-cave boss stage
  // (STAGES.optionsFor for win.type 'boss') but marks mode 'workshop' and
  // carries the custom design in the round options. Normal adventure /
  // challenge / daily rounds never set customBoss, so their paths are
  // untouched.
  function workshopRoundOptions(cfg) {
    return {
      mode: 'workshop',
      label: 'BOSS WORKSHOP · ' + String(cfg.name || "Penny's Boss").toUpperCase(),
      roundSeconds: 50,
      arrows: 22,
      moversAt: 0,
      chaosAt: 0,
      targetSpeed: 1.08,
      background: 'bg_moon_cave',
      theme: 'cave',
      specialRule: 'boss',
      bossAtStart: true,
      bossId: 'custom',
      customBoss: cfg
    };
  }

  function fightWorkshopBoss() {
    startRound(workshopRoundOptions(workshopCfg()), 'workshop');
  }

  function finishWorkshopRound(r) {
    if (!(r.stats && r.stats.bossDefeated)) return;
    var cfg = activeMode.options && activeMode.options.customBoss;
    r.workshopWon = true;
    r.workshopBoss = cfg ? cfg.name : null;
    r.workshopBonus = 50;   // banked here, shown on the results card
    SAVE.addCoins(50);
    AUDIO.voice('stage_clear');
    fx.confetti();
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
  var arcadePreviewId = null;
  var arcadePreviewItem = null;
  var arcadePreviewRaf = null;
  var arcadePreviewT = 0;

  function renderArcade() {
    var p = SAVE.current();
    $('arcade-coins').textContent = p.coins;
    var grid = $('arcade-grid');
    grid.innerHTML = '';
    confirmingId = null;
    var items = [];
    function addItem(item) {
      items.push(item);
      grid.appendChild(shopItem(item));
    }

    if (currentTab === 'characters') {
      DATA.characters.forEach(function (ch) {
        addItem({
          id: 'char_' + ch.id,
          name: ch.name,
          perk: ch.perkText,
          price: ch.price,
          owned: SAVE.owns('characters', ch.id),
          equipped: p.equipped.character === ch.id,
          draw: function (cv) { portrait(cv, ch.id); },
          previewDraw: function (cv, t) { previewCharacter(cv, ch.id, { t: t }); },
          buy: function () { SAVE.unlock('characters', ch.id); SAVE.equip('character', ch.id); },
          equip: function () { SAVE.equip('character', ch.id); }
        });
      });
    } else if (currentTab === 'arrows') {
      DATA.arrows.forEach(function (a) {
        addItem({
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
          previewDraw: function (cv, t) { previewArrow(cv, a, t); },
          buy: function () { SAVE.unlock('arrows', a.id); SAVE.equip('arrow', a.id); },
          equip: function () { SAVE.equip('arrow', a.id); }
        });
      });
    } else {
      // skins: hats, then outfits, then shiny variants of owned characters
      DATA.hats.forEach(function (h) {
        addItem({
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
          previewDraw: function (cv, t) { previewCharacter(cv, p.equipped.character, Object.assign(equippedOpts(p, t), { hat: h.id }), t); },
          buy: function () { SAVE.unlock('hats', h.id); SAVE.equip('hat', h.id); },
          equip: function () { SAVE.equip('hat', h.id); }
        });
      });
      DATA.outfits.forEach(function (o) {
        if (!o.swap) return; // classic is default, not sold
        addItem({
          id: 'outfit_' + o.id,
          name: o.name,
          perk: 'A fresh new color!',
          price: o.price,
          owned: SAVE.owns('outfits', o.id),
          equipped: p.equipped.outfit === o.id,
          draw: function (cv) { portrait(cv, p.equipped.character, { outfitColor: o.swap, outfitId: o.id }); },
          previewDraw: function (cv, t) { previewCharacter(cv, p.equipped.character, { hat: p.equipped.hat, outfitColor: o.swap, outfitId: o.id, shiny: p.equipped.shiny, t: t }, t); },
          buy: function () { SAVE.unlock('outfits', o.id); SAVE.equip('outfit', o.id); },
          equip: function () { SAVE.equip('outfit', o.id); }
        });
      });
      p.unlocked.characters.forEach(function (chId) {
        var ch = DATA.characterById(chId);
        addItem({
          id: 'shiny_' + chId,
          name: 'Shiny ' + ch.name,
          perk: '✨ Sparkles everywhere! ✨',
          price: TUNING.PRICE_SHINY,
          owned: SAVE.owns('shiny', chId),
          equipped: p.equipped.shiny && p.equipped.character === chId,
          draw: function (cv) { portrait(cv, chId, { shiny: true, t: 1.2 }); },
          previewDraw: function (cv, t) { previewCharacter(cv, chId, { hat: p.equipped.hat, shiny: true, t: t }, t); },
          buy: function () {
            SAVE.unlock('shiny', chId);
            SAVE.equip('character', chId);
            SAVE.equip('shiny', true);
          },
          equip: function () {
            SAVE.equip('character', chId);
            SAVE.equip('shiny', true);
          }
        });
      });
    }
    if (!items.some(function (item) { return item.id === arcadePreviewId; })) {
      var equipped = items.find(function (item) { return item.equipped; });
      arcadePreviewId = (equipped || items[0] || {}).id || null;
    }
    arcadePreviewItem = items.find(function (item) { return item.id === arcadePreviewId; }) || items[0] || null;
    Array.from(grid.children).forEach(function (child, i) {
      child.classList.toggle('selected', !!items[i] && items[i].id === arcadePreviewId);
    });
    renderArcadePreview();
  }

  function renderArcadePreview(t) {
    var item = arcadePreviewItem;
    var cv = $('arcade-preview-canvas');
    var p = SAVE.current();
    if (!item || !cv) return;
    (item.previewDraw || item.draw)(cv, t || arcadePreviewT);
    $('arcade-preview-kicker').textContent = item.equipped ? 'Equipped now' : (item.owned ? 'Unlocked reward' : 'Reward preview');
    $('arcade-preview-name').textContent = item.name;
    $('arcade-preview-perk').textContent = item.perk || 'Looks awesome in game.';
    var status = $('arcade-preview-status');
    status.className = 'arcade-preview-status';
    if (item.equipped) {
      status.classList.add('equipped');
      status.textContent = '★ Equipped and ready to play';
    } else if (item.owned) {
      status.classList.add('owned');
      status.textContent = 'Unlocked · tap EQUIP on the card';
    } else if ((p.coins || 0) >= item.price) {
      status.classList.add('can-buy');
      status.textContent = 'Costs ' + item.price + ' coins · you can unlock it';
    } else {
      status.classList.add('need-coins');
      status.textContent = 'Costs ' + item.price + ' coins · need ' + (item.price - (p.coins || 0)) + ' more';
    }
  }

  function startArcadePreviewLoop() {
    if (arcadePreviewRaf) return;
    function loop() {
      if ($('screen-arcade').classList.contains('hidden')) { arcadePreviewRaf = null; return; }
      arcadePreviewT += 0.016;
      renderArcadePreview(arcadePreviewT);
      arcadePreviewRaf = requestAnimationFrame(loop);
    }
    arcadePreviewRaf = requestAnimationFrame(loop);
  }

  function celebrateArcadePreview() {
    var panel = $('arcade-preview-panel');
    var burst = $('arcade-preview-burst');
    panel.classList.remove('celebrate');
    burst.classList.remove('hidden');
    // restart CSS animations
    void panel.offsetWidth;
    panel.classList.add('celebrate');
    setTimeout(function () {
      burst.classList.add('hidden');
      panel.classList.remove('celebrate');
    }, 1200);
  }

  function shopItem(item) {
    var p = SAVE.current();
    var el = document.createElement('div');
    el.className = 'shop-item' +
      (item.owned ? ' owned' : ' locked') +
      (item.equipped ? ' equipped' : '') +
      (item.id === arcadePreviewId ? ' selected' : '');
    el.onclick = function () {
      arcadePreviewId = item.id;
      arcadePreviewItem = item;
      AUDIO.click();
      renderArcade();
    };
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
      btn.onclick = function (e) {
        e.stopPropagation();
        AUDIO.click();
        item.equip();
        arcadePreviewId = item.id;
        renderArcade();
      };
    } else {
      var afford = p.coins >= item.price;
      btn.classList.add('buy');
      if (!afford) btn.classList.add('cant');
      btn.textContent = '🪙 ' + item.price;
      btn.onclick = function (e) {
        e.stopPropagation();
        arcadePreviewId = item.id;
        arcadePreviewItem = item;
        renderArcadePreview();
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
          arcadePreviewId = item.id;
          AUDIO.fanfare();
          fx.confetti();
          renderArcade();
          celebrateArcadePreview();
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
    startArcadePreviewLoop();
  }

  /* ============ closet ============ */

  var closetT = 0;
  function animateClosetPreview() {
    if ($('screen-closet').classList.contains('hidden')) return;
    closetT += 0.016;
    var p = SAVE.current();
    var cv = $('closet-preview');
    var c = hidpi(cv, 170, 180);
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

  function wantsReducedMotion() {
    var s = SAVE.settings();
    return !!(s && s.reducedMotion);
  }

  function applyReducedMotionClass(on) {
    document.body.classList.toggle('reduced-motion', !!on);
  }

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
    setToggle($('set-reduced-motion'), s.reducedMotion);
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
    applyReducedMotionClass(s.reducedMotion);
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
      if (SAVE.profiles().length === 0) show('title');
      else renderProfiles();
    };

    $('btn-play').onclick = function () { AUDIO.click(); startRound({}, 'practice'); };
    $('btn-marathon').onclick = function () { AUDIO.click(); startRound(marathonOptions(), 'marathon'); };
    $('btn-daily').onclick = function () { AUDIO.click(); startDailyChallenge(); };
    $('btn-adventure').onclick = function () { AUDIO.click(); openAdventure(); };
    $('btn-challenge').onclick = function () { AUDIO.click(); openChallenge(); };
    $('btn-family').onclick = function () { AUDIO.click(); openFamily(); };
    $('btn-arcade').onclick = function () { AUDIO.click(); openArcade(); };
    $('btn-closet').onclick = function () { AUDIO.click(); openCloset(); };
    $('btn-quests').onclick = function () { AUDIO.click(); openQuests(); };
    $('btn-quests-back').onclick = function () { AUDIO.click(); goHome(); };
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
    $('btn-version').textContent = 'v' + (typeof CHANGELOG !== 'undefined' ? CHANGELOG[0].v : '?');
    $('btn-version').onclick = function () {
      AUDIO.click();
      renderWhatsNew();
      $('whats-new').classList.remove('hidden');
    };
    $('whats-new-close').onclick = function () {
      AUDIO.click();
      $('whats-new').classList.add('hidden');
    };
    $('whats-new').addEventListener('click', function (e) {
      if (e.target === this) this.classList.add('hidden');
    });
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
    $('set-reduced-motion').onclick = function () {
      AUDIO.click();
      var on = !SAVE.settings().reducedMotion;
      SAVE.setSetting('reducedMotion', on);
      setToggle($('set-reduced-motion'), on);
      applyReducedMotionClass(on);
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
    $('btn-challenge-share').onclick = function () {
      AUDIO.click();
      var msg = $('challenge-share-msg');
      var OK = 'Link copied!';
      var FAIL = 'Could not copy — long-press the address bar to share it!';
      var showMsg = function (text) {
        msg.textContent = text;
        msg.classList.remove('hidden');
        setTimeout(function () { msg.classList.add('hidden'); }, 2600);
      };
      try {
        var url = location.origin + location.pathname + '#c=' + challengeCodeEncode(challengeFromControls());
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(
            function () { showMsg(OK); },
            function () { showMsg(legacyCopy(url) ? OK : FAIL); }
          );
        } else {
          showMsg(legacyCopy(url) ? OK : FAIL);
        }
      } catch (e) {
        showMsg(FAIL);
      }
    };
    $('btn-family-start').onclick = function () { AUDIO.click(); beginFamilyMatch(); };

    /* ---- Penny's Boss Workshop ---- */
    $('btn-workshop').onclick = function () { AUDIO.click(); openWorkshop(); };
    $('btn-workshop-back').onclick = function () { AUDIO.click(); goHome(); };
    ['boss-hue', 'boss-size', 'boss-wobble'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        updateWorkshopLabels();
        animateBossPreview();
      });
    });
    $('boss-hp-minus').onclick = function () {
      AUDIO.click();
      var v = Number($('boss-hp-value').textContent);
      $('boss-hp-value').textContent = Math.max(3, v - 1);
      animateBossPreview();
    };
    $('boss-hp-plus').onclick = function () {
      AUDIO.click();
      var v = Number($('boss-hp-value').textContent);
      $('boss-hp-value').textContent = Math.min(9, v + 1);
      animateBossPreview();
    };
    $('boss-weak-row').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      AUDIO.click();
      this.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      animateBossPreview();
    });
    $('boss-body-row').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      AUDIO.click();
      this.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      animateBossPreview();
    });
    $('btn-workshop-save').onclick = function () { AUDIO.click(); saveWorkshopBoss(); };
    $('btn-workshop-fight').onclick = function () { AUDIO.click(); fightWorkshopBoss(); };
    $('btn-family-next').onclick = function () { AUDIO.click(); familyNextTurn(); };
    $('btn-family-again').onclick = function () { AUDIO.click(); openFamily(); };
    $('btn-family-home').onclick = function () { AUDIO.click(); goHome(); };

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.onclick = function () {
        AUDIO.click();
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        arcadePreviewId = null;
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
    },
    show: show,
    goHome: goHome
  };
})();
