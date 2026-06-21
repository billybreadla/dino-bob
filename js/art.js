/* Procedural cartoon art. Everything is drawn with canvas shapes so v1
   needs zero image downloads. To swap in real art later, replace these
   draw functions with image blits from /assets (keep the same names). */

var ART = (function () {

  function circle(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
  }
  function rr(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fillStyle = fill; ctx.fill();
  }

  /* Base palettes per character: body, belly/accent, face skin */
  var PALETTES = {
    dinobob:   { body: '#2f6fd6', belly: '#9fd636', skin: '#f3c08c', dark: '#22518f' },
    ninja:     { body: '#2c2f38', belly: '#444a58', skin: '#e8b07a', dark: '#16181f' },
    astronaut: { body: '#e9edf2', belly: '#c4ccd6', skin: '#caa06a', dark: '#9aa3b0' },
    robot:     { body: '#8d97a5', belly: '#5b6470', skin: '#39404a', dark: '#4c545f' },
    bear:      { body: '#9c6b3a', belly: '#d8b27e', skin: '#f3c08c', dark: '#6f4b27' }
  };

  function eyes(ctx, x, y, s, look) {
    var dx = (look || 0) * 2 * s;
    circle(ctx, x - 9 * s, y, 5.5 * s, '#fff');
    circle(ctx, x + 9 * s, y, 5.5 * s, '#fff');
    circle(ctx, x - 9 * s + dx, y, 2.8 * s, '#2a2622');
    circle(ctx, x + 9 * s + dx, y, 2.8 * s, '#2a2622');
  }
  function smile(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 6 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#2a2622';
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawHat(ctx, id, x, y, s) {
    var sp = typeof SPRITES !== 'undefined' && SPRITES.get('hat_' + id);
    if (sp) {
      var w = 56 * s, h = w * sp.height / sp.width;
      ctx.drawImage(sp, x - w / 2, y - h * 0.82, w, h);
      return;
    }
    switch (id) {
      case 'party':
        ctx.beginPath();
        ctx.moveTo(x, y - 34 * s); ctx.lineTo(x - 13 * s, y - 2 * s); ctx.lineTo(x + 13 * s, y - 2 * s);
        ctx.closePath(); ctx.fillStyle = '#ff5fa2'; ctx.fill();
        rr(ctx, x - 13 * s, y - 14 * s, 26 * s, 5 * s, 2 * s, '#ffd23a');
        circle(ctx, x, y - 34 * s, 5 * s, '#ffd23a');
        break;
      case 'crown':
        ctx.beginPath();
        ctx.moveTo(x - 16 * s, y); ctx.lineTo(x - 16 * s, y - 18 * s);
        ctx.lineTo(x - 8 * s, y - 8 * s); ctx.lineTo(x, y - 20 * s);
        ctx.lineTo(x + 8 * s, y - 8 * s); ctx.lineTo(x + 16 * s, y - 18 * s);
        ctx.lineTo(x + 16 * s, y);
        ctx.closePath(); ctx.fillStyle = '#ffc83a'; ctx.fill();
        circle(ctx, x, y - 4 * s, 3.5 * s, '#e23b3b');
        break;
      case 'cowboy':
        ellipse(ctx, x, y - 2 * s, 26 * s, 7 * s, '#8a5a2b');
        rr(ctx, x - 12 * s, y - 20 * s, 24 * s, 19 * s, 8 * s, '#a06a35');
        rr(ctx, x - 12 * s, y - 8 * s, 24 * s, 5 * s, 2 * s, '#6f4b27');
        break;
      case 'wizard':
        ctx.beginPath();
        ctx.moveTo(x + 2 * s, y - 38 * s); ctx.lineTo(x - 18 * s, y - 2 * s); ctx.lineTo(x + 18 * s, y - 2 * s);
        ctx.closePath(); ctx.fillStyle = '#5b3fd0'; ctx.fill();
        ellipse(ctx, x, y - 2 * s, 24 * s, 6 * s, '#5b3fd0');
        circle(ctx, x - 4 * s, y - 18 * s, 2.5 * s, '#ffd23a');
        circle(ctx, x + 6 * s, y - 26 * s, 2 * s, '#ffd23a');
        break;
      case 'propeller':
        rr(ctx, x - 14 * s, y - 12 * s, 28 * s, 12 * s, 7 * s, '#3aa0e8');
        ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(x, y - 12 * s); ctx.lineTo(x, y - 18 * s); ctx.stroke();
        ellipse(ctx, x - 10 * s, y - 19 * s, 9 * s, 3.5 * s, '#e23b3b');
        ellipse(ctx, x + 10 * s, y - 19 * s, 9 * s, 3.5 * s, '#ffd23a');
        break;
      case 'headphones':
        ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.arc(x, y + 4 * s, 19 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        rr(ctx, x - 24 * s, y - 2 * s, 9 * s, 14 * s, 4 * s, '#e23b3b');
        rr(ctx, x + 15 * s, y - 2 * s, 9 * s, 14 * s, 4 * s, '#e23b3b');
        break;
    }
  }

  function sparkles(ctx, x, y, s, t) {
    for (var i = 0; i < 5; i++) {
      var a = t * 1.5 + i * (Math.PI * 2 / 5);
      var px = x + Math.cos(a) * 42 * s;
      var py = y - 45 * s + Math.sin(a * 1.3) * 50 * s;
      var tw = (Math.sin(t * 6 + i * 2) + 1) / 2;
      ctx.save();
      ctx.globalAlpha = 0.35 + tw * 0.6;
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.fillStyle = '#fff7c4';
      var r = (2 + tw * 3) * s;
      ctx.beginPath();
      ctx.moveTo(0, -r * 2); ctx.lineTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 2, 0);
      ctx.lineTo(r * 0.6, r * 0.6); ctx.lineTo(0, r * 2); ctx.lineTo(-r * 0.6, r * 0.6);
      ctx.lineTo(-r * 2, 0); ctx.lineTo(-r * 0.6, -r * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  /* Draw a character standing, feet at (x, y). scale 1 ≈ 130px tall.
     opts: { hat, outfitColor, shiny, t, look } */
  function drawCharacter(ctx, id, x, y, scale, opts) {
    opts = opts || {};

    // Use the real rendered sprite when it's available.
    var sp = typeof SPRITES !== 'undefined' && SPRITES.get('char_' + id);
    if (sp) { drawCharacterSprite(ctx, sp, x, y, scale, opts); return; }

    var s = scale;
    var pal = PALETTES[id] || PALETTES.dinobob;
    var body = opts.outfitColor || pal.body;
    var headY = y - 100 * s;

    ctx.save();

    // feet
    ellipse(ctx, x - 17 * s, y - 5 * s, 13 * s, 8 * s, body);
    ellipse(ctx, x + 17 * s, y - 5 * s, 13 * s, 8 * s, body);

    // tail (dino & bear)
    if (id === 'dinobob' || id === 'bear') {
      ctx.beginPath();
      ctx.moveTo(x - 20 * s, y - 30 * s);
      ctx.quadraticCurveTo(x - 55 * s, y - 26 * s, x - 48 * s, y - 8 * s);
      ctx.quadraticCurveTo(x - 35 * s, y - 4 * s, x - 18 * s, y - 14 * s);
      ctx.fillStyle = body; ctx.fill();
    }

    // body
    rr(ctx, x - 26 * s, y - 72 * s, 52 * s, 66 * s, 22 * s, body);
    // belly
    ellipse(ctx, x, y - 38 * s, 17 * s, 24 * s, opts.outfitColor ? shade(opts.outfitColor, 30) : pal.belly);
    if (id === 'dinobob') {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1.5 * s;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 14 * s, y - (52 - i * 12) * s);
        ctx.lineTo(x + 14 * s, y - (52 - i * 12) * s);
        ctx.stroke();
      }
    }

    // arms
    ellipse(ctx, x - 27 * s, y - 48 * s, 8 * s, 16 * s, body);
    ellipse(ctx, x + 27 * s, y - 48 * s, 8 * s, 16 * s, body);

    // head / hood
    circle(ctx, x, headY, 30 * s, body);

    // dino spikes / bear ears / robot antenna
    if (id === 'dinobob') {
      ctx.fillStyle = '#9fd636';
      [-14, 0, 14].forEach(function (dx, i) {
        ctx.beginPath();
        ctx.moveTo(x + (dx - 7) * s, headY - 26 * s + Math.abs(dx) * 0.3 * s);
        ctx.lineTo(x + dx * s, headY - (40 - Math.abs(dx) * 0.4) * s);
        ctx.lineTo(x + (dx + 7) * s, headY - 26 * s + Math.abs(dx) * 0.3 * s);
        ctx.closePath(); ctx.fill();
      });
    }
    if (id === 'bear') {
      circle(ctx, x - 20 * s, headY - 22 * s, 9 * s, body);
      circle(ctx, x + 20 * s, headY - 22 * s, 9 * s, body);
      circle(ctx, x - 20 * s, headY - 22 * s, 4.5 * s, pal.belly);
      circle(ctx, x + 20 * s, headY - 22 * s, 4.5 * s, pal.belly);
    }
    if (id === 'robot') {
      ctx.strokeStyle = pal.dark; ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.moveTo(x, headY - 30 * s); ctx.lineTo(x, headY - 40 * s); ctx.stroke();
      circle(ctx, x, headY - 42 * s, 4 * s, '#ff5fa2');
    }

    // face opening
    if (id === 'robot') {
      rr(ctx, x - 20 * s, headY - 14 * s, 40 * s, 28 * s, 9 * s, pal.skin);
      // glowing robot eyes
      circle(ctx, x - 9 * s, headY, 5 * s, '#62e6ff');
      circle(ctx, x + 9 * s, headY, 5 * s, '#62e6ff');
      rr(ctx, x - 7 * s, headY + 8 * s, 14 * s, 3 * s, 1.5 * s, '#62e6ff');
    } else if (id === 'ninja') {
      // only an eye slit
      rr(ctx, x - 19 * s, headY - 7 * s, 38 * s, 15 * s, 7 * s, pal.skin);
      eyes(ctx, x, headY, s);
      // headband
      rr(ctx, x - 26 * s, headY - 18 * s, 52 * s, 8 * s, 4 * s, '#e23b3b');
      ctx.fillStyle = '#e23b3b';
      ctx.beginPath();
      ctx.moveTo(x + 24 * s, headY - 14 * s);
      ctx.lineTo(x + 40 * s, headY - 8 * s);
      ctx.lineTo(x + 34 * s, headY - 18 * s);
      ctx.closePath(); ctx.fill();
    } else if (id === 'astronaut') {
      // glass visor
      ellipse(ctx, x, headY + 1 * s, 21 * s, 18 * s, pal.skin);
      eyes(ctx, x, headY, s, opts.look);
      smile(ctx, x, headY + 7 * s, s);
      ctx.beginPath(); ctx.ellipse(x, headY + 1 * s, 21 * s, 18 * s, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(140,200,255,0.8)'; ctx.lineWidth = 3 * s; ctx.stroke();
    } else {
      ellipse(ctx, x, headY + 2 * s, 20 * s, 17 * s, pal.skin);
      // hair curl for dino bob
      if (id === 'dinobob') {
        circle(ctx, x - 7 * s, headY - 9 * s, 5 * s, '#5a3a22');
        circle(ctx, x + 1 * s, headY - 11 * s, 5 * s, '#5a3a22');
        circle(ctx, x + 8 * s, headY - 9 * s, 4.5 * s, '#5a3a22');
      }
      if (id === 'bear') {
        ellipse(ctx, x, headY + 8 * s, 7 * s, 5 * s, '#fff');
        circle(ctx, x, headY + 6 * s, 3 * s, '#2a2622');
      }
      eyes(ctx, x, headY - 2 * s, s, opts.look);
      smile(ctx, x, headY + (id === 'bear' ? 12 : 6) * s, s);
      circle(ctx, x - 15 * s, headY + 5 * s, 3.5 * s, 'rgba(255,120,120,0.45)');
      circle(ctx, x + 15 * s, headY + 5 * s, 3.5 * s, 'rgba(255,120,120,0.45)');
    }

    // hat
    if (opts.hat) drawHat(ctx, opts.hat, x, headY - 24 * s, s);

    // shiny sparkles
    if (opts.shiny) sparkles(ctx, x, y, s, opts.t || 0);

    ctx.restore();
  }

  /* Sprite-backed character: feet at (x, y), visual height ≈ 132*scale to
     roughly match the procedural proportions callers expect. */
  function drawCharacterSprite(ctx, img, x, y, scale, opts) {
    var h = 138 * scale;
    var w = h * img.width / img.height;
    ctx.save();
    if (opts.shiny) { ctx.shadowColor = 'rgba(255,247,180,0.9)'; ctx.shadowBlur = 18 * scale; }
    ctx.drawImage(img, x - w / 2, y - h, w, h);
    ctx.restore();

    if (opts.hat) {
      // Place a procedural hat near the top of the head (~16% down from top).
      var hatS = (w / 120);
      drawHat(ctx, opts.hat, x, y - h * 0.84, hatS);
    }
    if (opts.shiny) sparkles(ctx, x, y - h * 0.1, scale * 1.05, opts.t || 0);
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.max(0, (n >> 16) + amt));
    var g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    var b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* Bow held by the player character. angle = aim direction, draw = 0..1 pull */
  function drawBow(ctx, x, y, angle, draw, scale) {
    var s = scale || 1;

    var img = typeof SPRITES !== 'undefined' && SPRITES.get('bow');
    if (img) {
      var h = 132 * s;
      var w = h * img.width / img.height;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      // native sprite is vertical with the string toward the archer; the grip
      // sits at the sprite's center, which we pin to the bow anchor.
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#6f4b27';
    ctx.lineWidth = 7 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 42 * s, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
    // string
    var tipY = Math.sin(Math.PI * 0.42) * 42 * s;
    var tipX = Math.cos(Math.PI * 0.42) * 42 * s;
    var pull = -draw * 38 * s;
    ctx.strokeStyle = '#f4ead2';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(tipX, -tipY);
    ctx.lineTo(pull, 0);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.restore();
  }

  /* An arrow, drawn pointing right from its tail. */
  function drawArrow(ctx, x, y, angle, type, scale, t) {
    var s = scale || 1;

    var img = typeof SPRITES !== 'undefined' && SPRITES.get('arrow_' + type.id);
    if (img) {
      // sprite points right (+x) with the tip leading; flame/ice/spark baked in
      var w = 92 * s;
      var h = w * img.height / img.width;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // trail effects per type
    if (type.id === 'fire') {
      for (var i = 0; i < 3; i++) {
        var fa = 0.5 - i * 0.15;
        ctx.globalAlpha = fa;
        circle(ctx, -30 * s - i * 14 * s, Math.sin((t || 0) * 30 + i) * 3, (9 - i * 2) * s, i === 0 ? '#ffb43a' : '#ff7a1a');
      }
      ctx.globalAlpha = 1;
    } else if (type.id === 'ice') {
      ctx.globalAlpha = 0.4;
      circle(ctx, -28 * s, 0, 7 * s, '#bfeaff');
      circle(ctx, -42 * s, 2, 5 * s, '#e2f6ff');
      ctx.globalAlpha = 1;
    } else if (type.id === 'lightning') {
      ctx.strokeStyle = 'rgba(255,227,58,0.7)';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(-24 * s, 0);
      ctx.lineTo(-34 * s, -6 * s); ctx.lineTo(-44 * s, 4 * s); ctx.lineTo(-56 * s, -3 * s);
      ctx.stroke();
    }

    // shaft
    ctx.strokeStyle = type.color;
    ctx.lineWidth = 4.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-26 * s, 0); ctx.lineTo(16 * s, 0); ctx.stroke();
    // fletching
    ctx.fillStyle = '#e23b3b';
    ctx.beginPath();
    ctx.moveTo(-26 * s, 0); ctx.lineTo(-34 * s, -7 * s); ctx.lineTo(-22 * s, -2 * s); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-26 * s, 0); ctx.lineTo(-34 * s, 7 * s); ctx.lineTo(-22 * s, 2 * s); ctx.closePath(); ctx.fill();
    // tip
    ctx.fillStyle = type.tipColor;
    ctx.beginPath();
    ctx.moveTo(28 * s, 0); ctx.lineTo(14 * s, -6 * s); ctx.lineTo(14 * s, 6 * s); ctx.closePath(); ctx.fill();
    if (type.id === 'lightning') {
      ctx.shadowColor = '#ffe33a'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(28 * s, 0); ctx.lineTo(14 * s, -6 * s); ctx.lineTo(14 * s, 6 * s); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /* Gold coin for HUD + pickups */
  function drawCoin(ctx, x, y, r, t) {
    var squish = t !== undefined ? Math.abs(Math.cos(t * 4)) * 0.6 + 0.4 : 1;
    var cimg = typeof SPRITES !== 'undefined' && SPRITES.get('coin');
    if (cimg) {
      var w = r * 2.2, h = w * cimg.height / cimg.width;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(squish, 1);
      ctx.drawImage(cimg, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squish, 1);
    circle(ctx, 0, 0, r, '#e8a91d');
    circle(ctx, 0, 0, r * 0.78, '#ffd23a');
    ctx.fillStyle = '#e8a91d';
    ctx.font = 'bold ' + r * 1.2 + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // star
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
      ctx.lineTo(Math.cos(a2) * r * 0.22, Math.sin(a2) * r * 0.22);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  return {
    drawCharacter: drawCharacter,
    drawBow: drawBow,
    drawArrow: drawArrow,
    drawCoin: drawCoin,
    drawHat: drawHat,
    circle: circle,
    ellipse: ellipse,
    rr: rr,
    shade: shade,
    PALETTES: PALETTES
  };
})();
