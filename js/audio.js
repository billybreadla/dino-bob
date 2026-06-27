/* All sound is synthesized with WebAudio — no audio files needed.
   Audio starts on the first user tap (browser autoplay rules). */

var AUDIO = (function () {
  var ctx = null;
  var musicOn = true;
  var sfxGain, musicGain;
  var musicTimer = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(ctx.destination);
    return true;
  }

  function tone(opts) {
    if (!ensure()) return;
    var t = ctx.currentTime + (opts.delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + (opts.dur || 0.2));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.2));
    o.connect(g);
    g.connect(opts.music ? musicGain : sfxGain);
    o.start(t);
    o.stop(t + (opts.dur || 0.2) + 0.05);
  }

  function noise(opts) {
    if (!ensure()) return;
    var t = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.15;
    var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = opts.filter || 'lowpass';
    f.frequency.setValueAtTime(opts.freq || 800, t);
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slide), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }

  /* ----- a gentle, cheerful pentatonic music loop ----- */
  var SCALE = [262, 294, 330, 392, 440, 523, 587, 659]; // C major pentatonic-ish
  var step = 0;
  function musicTick() {
    if (!musicOn || !ctx) return;
    var beat = 0.28;
    // melody: wander the scale, mostly small steps
    var idx = Math.max(0, Math.min(SCALE.length - 1,
      (musicTick.last || 3) + [-1, -1, 0, 1, 1, 2, -2][Math.floor(Math.random() * 7)]));
    musicTick.last = idx;
    if (step % 2 === 0) {
      tone({ freq: SCALE[idx], type: 'triangle', dur: beat * 1.8, vol: 0.5, music: true });
    }
    // soft bass on the downbeat
    if (step % 4 === 0) {
      tone({ freq: SCALE[0] / 2, type: 'sine', dur: beat * 3, vol: 0.5, music: true });
    }
    step++;
    musicTimer = setTimeout(musicTick, beat * 1000);
  }

  return {
    unlock: function () { ensure(); },

    startMusic: function () {
      if (!ensure()) return;
      if (musicTimer) return;
      musicOn = true;
      musicTick();
    },
    stopMusic: function () {
      musicOn = false;
      if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    },
    toggleMusic: function () {
      if (musicTimer) { this.stopMusic(); return false; }
      this.startMusic(); return true;
    },
    musicPlaying: function () { return !!musicTimer; },

    /* ----- game sfx ----- */
    shoot: function () { noise({ freq: 2400, slide: 300, dur: 0.18, vol: 0.35 }); },
    stretch: function (power) { tone({ freq: 120 + power * 160, type: 'triangle', dur: 0.06, vol: 0.08 }); },
    thunk: function () {
      noise({ freq: 500, dur: 0.08, vol: 0.5 });
      tone({ freq: 130, slide: 70, type: 'square', dur: 0.12, vol: 0.25 });
    },
    snap: function () {
      noise({ freq: 1800, filter: 'highpass', slide: 650, dur: 0.09, vol: 0.42 });
      tone({ freq: 360, slide: 110, type: 'square', dur: 0.08, vol: 0.16 });
      tone({ freq: 190, slide: 80, type: 'triangle', dur: 0.11, vol: 0.12, delay: 0.045 });
    },
    bullseye: function () {
      tone({ freq: 660, type: 'square', dur: 0.1, vol: 0.25 });
      tone({ freq: 880, type: 'square', dur: 0.12, vol: 0.25, delay: 0.08 });
      tone({ freq: 1320, type: 'square', dur: 0.2, vol: 0.25, delay: 0.16 });
    },
    pop: function () { noise({ freq: 3000, filter: 'highpass', dur: 0.1, vol: 0.45 }); tone({ freq: 500, slide: 900, dur: 0.07, vol: 0.2 }); },
    splat: function () { noise({ freq: 700, slide: 150, dur: 0.18, vol: 0.4 }); },
    coin: function () {
      tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.18 });
      tone({ freq: 1319, type: 'square', dur: 0.18, vol: 0.18, delay: 0.07 });
    },
    chest: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.3, delay: i * 0.09 });
      });
    },
    freeze: function () { tone({ freq: 1800, slide: 600, type: 'sine', dur: 0.4, vol: 0.25 }); },
    zap: function () { tone({ freq: 1400, slide: 120, type: 'sawtooth', dur: 0.18, vol: 0.25 }); },
    tick: function () { tone({ freq: 880, type: 'square', dur: 0.05, vol: 0.15 }); },
    roundEnd: function () {
      [392, 523, 659, 784].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.3, delay: i * 0.12 });
      });
    },
    fanfare: function () {
      [523, 523, 659, 784, 1047, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'square', dur: 0.18, vol: 0.2, delay: i * 0.11 });
      });
    },
    click: function () { tone({ freq: 700, type: 'sine', dur: 0.05, vol: 0.15 }); },
    nope: function () { tone({ freq: 220, slide: 150, type: 'square', dur: 0.2, vol: 0.18 }); },
    firework: function () {
      noise({ freq: 1500, slide: 200, dur: 0.4, vol: 0.3 });
      tone({ freq: 900 + Math.random() * 600, slide: 300, dur: 0.3, vol: 0.15 });
    }
  };
})();
