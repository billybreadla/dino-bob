/* All DOM screens: title, profiles, home, arcade, closet, results,
   plus the confetti/fireworks overlay and kid-proof modal. */

var UI = (function () {

  var $ = function (id) { return document.getElementById(id); };
  var screens = ['title', 'profiles', 'home', 'game', 'results', 'arcade', 'closet'];

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
        outfitColor: DATA.outfitById(p.equipped.outfit).swap
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

  function startRound() {
    show('game');
    AUDIO.stopMusic();
    GAME.start($('game-canvas'), function (results) {
      showResults(results);
    });
  }

  function showResults(r) {
    show('results');
    if (AUDIO.musicPlaying() || musicWanted) AUDIO.startMusic();
    $('results-score').textContent = r.score;
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
    var banner = $('results-highscore');
    banner.classList.toggle('hidden', !r.isHighScore);
    $('results-header').textContent = r.isHighScore ? 'AMAZING!' : 'ROUND OVER!';
    if (r.isHighScore && r.score > 0) {
      fx.fireworks();
    }
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
          draw: function (cv) { portrait(cv, p.equipped.character, { outfitColor: o.swap }); },
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

  /* ============ music preference ============ */
  var musicWanted = true;

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

    $('btn-play').onclick = function () { AUDIO.click(); startRound(); };
    $('btn-arcade').onclick = function () { AUDIO.click(); openArcade(); };
    $('btn-closet').onclick = function () { AUDIO.click(); openCloset(); };
    $('btn-switch-profile').onclick = function () {
      AUDIO.click();
      show('profiles');
      renderProfiles();
    };
    $('btn-music').onclick = function () {
      musicWanted = AUDIO.toggleMusic();
      $('btn-music').classList.toggle('off', !musicWanted);
    };

    $('btn-quit-round').onclick = function () {
      modal('End this round early?', function () {
        GAME.stop();
        goHome();
        if (musicWanted) AUDIO.startMusic();
      });
    };

    $('btn-again').onclick = function () { AUDIO.click(); startRound(); };
    $('btn-results-arcade').onclick = function () { AUDIO.click(); openArcade(); };
    $('btn-results-home').onclick = function () { AUDIO.click(); goHome(); };

    $('btn-arcade-back').onclick = function () { AUDIO.click(); goHome(); };
    $('btn-closet-back').onclick = function () { AUDIO.click(); goHome(); };

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
      show('title');
      animateTitle();
    },
    show: show,
    goHome: goHome
  };
})();
