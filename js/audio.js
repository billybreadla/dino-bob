/* Sound effects are synthesized with WebAudio. Background music prefers a
   real looping file at assets/audio/music_loop.{ogg,mp3,m4a} when present,
   and falls back to the procedural biome loops below. Audio starts on the
   first user tap (browser autoplay rules). Mute/settings still work. */

var AUDIO = (function () {
  var ctx = null;
  var musicOn = true;
  var sfxOn = true;
  var sfxGain, musicGain;
  var musicTimer = null;
  var voiceEls = {};      // one HTMLAudio per line name
  var voiceMissing = {};  // names whose mp3 AND m4a both failed: silent forever
  var voiceLast = {};     // name -> timestamp of last play (throttle)

  /* Real music drop-in: place assets/audio/music_loop.ogg (or .mp3/.m4a).
     When the file loads we route it through musicGain so the Music toggle
     and volume bus still apply. Procedural loops stay as the fallback. */
  var fileMusic = {
    el: null, node: null, ready: false, failed: false, wanted: false, probing: false
  };
  var FILE_MUSIC_CANDIDATES = [
    'assets/audio/music_loop.ogg',
    'assets/audio/music_loop.mp3',
    'assets/audio/music_loop.m4a'
  ];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxOn ? 0.5 : 0;
    sfxGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(ctx.destination);
    return true;
  }

  // spatial helpers — tiny Panner per sfx when a 3D position is given
  function spatialPanner(pos) {
    if (!pos || typeof pos.x !== 'number') return null;
    try {
      var p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 5;
      p.maxDistance = 80;
      p.rolloffFactor = 1;
      // place sound relative to listener (camera). Listener is at 0,0,0 after setListenerPos.
      if (p.positionX) {
        p.positionX.setValueAtTime(pos.x, ctx.currentTime);
        p.positionY.setValueAtTime(pos.y, ctx.currentTime);
        p.positionZ.setValueAtTime(pos.z, ctx.currentTime);
      } else {
        p.setPosition(pos.x, pos.y, pos.z);
      }
      p.connect(sfxGain);
      return p;
    } catch (e) { return null; }
  }
  function setListenerPos(pos) {
    if (!ctx || !ctx.listener || !pos) return;
    try {
      if (ctx.listener.positionX) {
        ctx.listener.positionX.setValueAtTime(pos.x, ctx.currentTime);
        ctx.listener.positionY.setValueAtTime(pos.y, ctx.currentTime);
        ctx.listener.positionZ.setValueAtTime(pos.z, ctx.currentTime);
      } else if (ctx.listener.setPosition) {
        ctx.listener.setPosition(pos.x, pos.y, pos.z);
      }
    } catch (e) {}
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
    var panner = opts.pos ? spatialPanner(opts.pos) : null;
    if (panner) g.connect(panner);
    else g.connect(opts.music ? musicGain : sfxGain);
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
    src.connect(f); f.connect(g);
    var panner = opts.pos ? spatialPanner(opts.pos) : null;
    if (panner) g.connect(panner);
    else g.connect(sfxGain);
    src.start(t);
  }

  /* ----- procedural music engine -----
     Each loop is DATA (note-name bars, '.'=rest, '-'=hold). One lookahead
     scheduler (25ms interval, ~0.12s horizon) turns steps into cheap osc
     nodes ahead of time; nothing runs per-frame. A per-kind bus gain under
     musicGain gives instant stop/mute and a gentle 0.8s crossfade when the
     kind switches mid-session. Music always sits UNDER sfx. */
  var NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  var NOTE_RE = /^([a-g])([#b]?)(\d)$/;
  var LOOPS = {
    // Fallback procedural loops (used when assets/audio/music_loop.* is missing,
    // and always for boss 'tense' music). Real file music overrides ambient kinds.
    // bouncy C-major plink-tune with an oom-pah bass bounce
    meadow: {
      bpm: 112, spb: 2, melType: 'triangle', melVol: 0.34,
      bassType: 'square', bassVol: 0.15, attack: 0.008,
      mel: [
        'e5 . g5 . c6 . g5 .',
        'a5 g5 e5 . d5 . c5 .',
        'f5 . a5 . c6 . a5 f5',
        'g5 - e5 . d5 . . .',
        'e5 . g5 . c6 . e6 .',
        'd6 c6 a5 . g5 . a5 c6',
        'f5 a5 c6 - d6 . c6 .',
        'c6 - g5 e5 c5 . . .'
      ],
      bass: [
        'c3 . g2 . c3 . g2 .',
        'a2 . e3 . a2 . e3 .',
        'f2 . c3 . f2 . c3 .',
        'g2 . d3 . g2 . b2 .',
        'c3 . g2 . c3 . g2 .',
        'a2 . e3 . a2 . e3 .',
        'f2 . c3 . f2 . c3 .',
        'g2 . d3 . g2 b2 . .'
      ],
      hats: 'x.x.x.xx.', hatVol: 0.055
    },
    // minor + driving, lower-octave pulse (boss / mountain)
    tense: {
      bpm: 126, spb: 2, melType: 'square', melVol: 0.24,
      bassType: 'square', bassVol: 0.17, attack: 0.006,
      mel: [
        'a4 . c5 . e5 - c5 .',
        'a4 . c5 . f5 - e5 .',
        'd5 . c5 . a4 . f4 .',
        'e4 . gs4 . b4 . e5 .'
      ],
      bass: [
        'a2 a2 a3 a2 a2 a3 a2 a3',
        'a2 a2 a3 a2 a2 a3 a2 a3',
        'f2 f2 f3 f2 f2 f3 f2 f3',
        'e2 e2 e3 e2 e2 e3 e2 e3'
      ],
      hats: 'x.x.xxxx', hatVol: 0.04
    },
    // dreamy 6/8 waltz lilt, soft attacks (underwater / starlight)
    sea: {
      bpm: 100, spb: 3, melType: 'sine', melVol: 0.36,
      bassType: 'sine', bassVol: 0.3, attack: 0.09,
      mel: [
        '. a4 . c5 . f5',
        '. a4 . d5 . f5',
        '. bb4 . d5 . f5',
        '. g4 . c5 . e5'
      ],
      bass: [
        'f2 . . c3 . .',
        'd2 . . a2 . .',
        'bb2 . . f2 . .',
        'c3 . . g2 . .'
      ]
    }
  };

  var seq = { kind: null, ambient: 'meadow', timer: null, next: 0, idx: 0,
              count: 0, bus: null, fading: [], parsed: {} };
  var hatBuf = null;

  function parseTrack(kind) {
    if (seq.parsed[kind]) return seq.parsed[kind];
    var L = LOOPS[kind];
    function track(bars) {
      var toks = bars.join(' ').trim().split(/\s+/);
      var map = {};
      for (var i = 0; i < toks.length; i++) {
        var m = NOTE_RE.exec(toks[i]);
        if (!m) continue;
        var len = 1;
        while (i + len < toks.length && toks[i + len] === '-') len++;
        var semi = NOTE_BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        map[i] = { midi: 12 * (+m[3] + 1) + semi, len: len };
      }
      return map;
    }
    var p = {
      stepDur: 60 / L.bpm / L.spb,
      total: L.mel.join(' ').trim().split(/\s+/).length,
      mel: track(L.mel), bass: track(L.bass)
    };
    seq.parsed[kind] = p;
    return p;
  }

  function mNote(freq, at, dur, vol, type, attack) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(seq.bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  function hat(at, vol) {
    if (!hatBuf || hatBuf.sampleRate !== ctx.sampleRate) {
      hatBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.07), ctx.sampleRate);
      var d = hatBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = ctx.createBufferSource();
    src.buffer = hatBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(f); f.connect(g); g.connect(seq.bus);
    src.start(at);
  }

  function scheduleStep(L, P, s, at) {
    var me = P.mel[s % P.total];
    if (me) mNote(440 * Math.pow(2, (me.midi - 69) / 12), at, me.len * P.stepDur * 0.92,
                  L.melVol, L.melType, L.attack);
    var be = P.bass[s % P.total];
    if (be) mNote(440 * Math.pow(2, (be.midi - 69) / 12), at, be.len * P.stepDur * 0.95,
                  L.bassVol, L.bassType, Math.min(L.attack, 0.02));
    if (L.hats && L.hats.charAt(s % L.hats.length) === 'x') hat(at, L.hatVol);
    seq.count++;
  }

  function schedTick() {
    if (!musicOn || !ctx || !seq.kind) return;
    var now = ctx.currentTime;
    seq.fading = seq.fading.filter(function (f) {
      if (now > f.until) { try { f.g.disconnect(); } catch (e) {} return false; }
      return true;
    });
    if (ctx.state !== 'running') { seq.next = Math.max(seq.next, now + 0.08); return; }
    var L = LOOPS[seq.kind], P = parseTrack(seq.kind);
    var horizon = now + 0.12;
    while (seq.next < horizon) {
      scheduleStep(L, P, seq.idx % P.total, seq.next);
      seq.idx++;
      seq.next += P.stepDur;
    }
  }

  function makeBus() {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8); // fade-in
    g.connect(musicGain);
    return g;
  }

  function stopFileMusic() {
    fileMusic.wanted = false;
    if (fileMusic.el) {
      try { fileMusic.el.pause(); } catch (e) {}
    }
  }

  function playFileMusic() {
    if (!fileMusic.ready || !fileMusic.el || !musicOn) return false;
    fileMusic.wanted = true;
    // File music wins over procedural ambient once it is ready.
    if (musicTimer) {
      seq.kind = null;
      if (seq.bus) {
        try {
          seq.bus.gain.cancelScheduledValues(ctx.currentTime);
          seq.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
        } catch (e) {}
        seq.fading.push({ g: seq.bus, until: ctx.currentTime + 0.05 });
        seq.bus = null;
      }
      clearInterval(musicTimer); musicTimer = null;
    }
    try {
      fileMusic.el.loop = true;
      var p = fileMusic.el.play();
      if (p && p.catch) p.catch(function () { /* autoplay: wait for next unlock */ });
      return true;
    } catch (e) { return false; }
  }

  function attachFileMusicElement(url) {
    if (!ensure()) return;
    var el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    try {
      // MediaElementSource may only be created once per element.
      fileMusic.node = ctx.createMediaElementSource(el);
      fileMusic.node.connect(musicGain);
    } catch (e) {
      // Fallback: element plays through its own volume (still muteable via pause).
      el.volume = 0.35;
    }
    fileMusic.el = el;
    fileMusic.ready = true;
    if (fileMusic.wanted && musicOn) playFileMusic();
  }

  function probeFileMusic() {
    if (fileMusic.ready || fileMusic.failed || fileMusic.probing) return;
    fileMusic.probing = true;
    var i = 0;
    function tryNext() {
      if (i >= FILE_MUSIC_CANDIDATES.length) {
        fileMusic.failed = true;
        fileMusic.probing = false;
        // Fall back to procedural if music is wanted.
        if (fileMusic.wanted && musicOn) startProceduralKind(seq.ambient || 'meadow');
        return;
      }
      var url = FILE_MUSIC_CANDIDATES[i++];
      var probe = new Audio();
      var settled = false;
      function ok() {
        if (settled) return; settled = true;
        fileMusic.probing = false;
        attachFileMusicElement(url);
      }
      function bad() {
        if (settled) return; settled = true;
        tryNext();
      }
      probe.addEventListener('canplaythrough', ok);
      probe.addEventListener('loadeddata', ok);
      probe.addEventListener('error', bad);
      probe.preload = 'auto';
      probe.src = url;
      // Some browsers need an explicit load(); ignore failures.
      try { probe.load(); } catch (e) { bad(); }
      // Safety timeout so a hung probe never blocks music forever.
      setTimeout(function () { if (!settled) bad(); }, 2500);
    }
    tryNext();
  }

  function startProceduralKind(kind) {
    kind = LOOPS[kind] ? kind : seq.ambient;
    if (!LOOPS[kind]) return false;
    if (kind !== 'tense') seq.ambient = kind;   // remember the round default
    if (seq.timer && seq.kind === kind) return true; // already playing it
    if (!ensure()) return false;
    if (seq.bus) {                               // crossfade out the old kind
      var oldBus = seq.bus;
      try {
        oldBus.gain.cancelScheduledValues(ctx.currentTime);
        oldBus.gain.setValueAtTime(oldBus.gain.value, ctx.currentTime);
        oldBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      } catch (e) {}
      seq.fading.push({ g: oldBus, until: ctx.currentTime + 0.9 });
    }
    seq.kind = kind;
    seq.bus = makeBus();
    seq.idx = 0;
    seq.next = ctx.currentTime + 0.06;
    if (!musicTimer) { musicTimer = setInterval(schedTick, 25); }
    return true;
  }

  function startMusicKind(kind) {
    // Boss tense music always uses the procedural battle loop (short cue).
    // Ambient rounds prefer the real file loop when available.
    kind = LOOPS[kind] ? kind : seq.ambient;
    if (kind !== 'tense') seq.ambient = kind || seq.ambient;
    musicOn = true;
    fileMusic.wanted = true;
    if (kind === 'tense') {
      stopFileMusic();
      fileMusic.wanted = false; // tense is procedural-only
      return startProceduralKind('tense');
    }
    // Prefer file music for ambient/meadow/sea.
    if (fileMusic.ready) {
      // Stop procedural if it was running.
      if (musicTimer) {
        seq.kind = null;
        if (seq.bus) {
          try {
            seq.bus.gain.cancelScheduledValues(ctx.currentTime);
            seq.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
          } catch (e) {}
          seq.fading.push({ g: seq.bus, until: ctx.currentTime + 0.05 });
          seq.bus = null;
        }
        clearInterval(musicTimer); musicTimer = null;
      }
      return playFileMusic();
    }
    if (!fileMusic.failed && !fileMusic.probing) {
      probeFileMusic();
      // Start procedural immediately so kids hear something while probing;
      // if the file loads, playFileMusic will take over and we stop procedural.
      startProceduralKind(kind);
      return true;
    }
    return startProceduralKind(kind);
  }

  function stopMusicKind() {
    musicOn = false;
    stopFileMusic();
    seq.kind = null;
    if (seq.bus) {
      var b = seq.bus;
      try {   // instant silence, even for notes already scheduled ahead
        b.gain.cancelScheduledValues(ctx.currentTime);
        b.gain.setValueAtTime(0.0001, ctx.currentTime);
      } catch (e) {}
      seq.fading.push({ g: b, until: ctx.currentTime + 0.05 });
      seq.bus = null;
    }
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return {
    unlock: function () { ensure(); },

    /* legacy one-call API kept for ui.js (header chip + settings) */
    startMusic: function () { musicOn = true; startMusicKind(); },
    stopMusic: stopMusicKind,
    toggleMusic: function () {
      if (musicTimer) { stopMusicKind(); return false; }
      musicOn = true; startMusicKind(); return true;
    },
    setMusic: function (on) { if (on) { musicOn = true; startMusicKind(); } else stopMusicKind(); },
    musicPlaying: function () { return !!musicTimer || !!(fileMusic.el && !fileMusic.el.paused && fileMusic.wanted); },

    /* new engine: AUDIO.music.start('meadow'|'sky'.../'tense'|'sea') */
    music: {
      kinds: Object.keys(LOOPS),
      start: function (k) { musicOn = true; return startMusicKind(k); },
      stop: stopMusicKind,
      current: function () { return seq.kind; },
      notes: function () { return seq.count; }   // test probe: scheduled notes
    },

    /* ----- sound effects on/off (master SFX gain) ----- */
    setSfx: function (on) { sfxOn = on; if (sfxGain) sfxGain.gain.value = on ? 0.5 : 0; },
    sfxEnabled: function () { return sfxOn; },

    /* ----- kids' voice acting -----
       Real recordings (Penny!) live in audio/<name>.mp3, with .m4a probed as
       a fallback (Voice Memos records m4a). Fire-and-forget: if both files
       are missing we remember and stay silent forever -- never an error.
       Voice files can't ride the WebAudio sfx gain, so they honor the SFX
       toggle themselves. Same line is throttled to once per 4 seconds. */
    voice: function (name) {
      if (!sfxOn) return;
      var now = Date.now();
      if (voiceLast[name] && now - voiceLast[name] < 4000) return;
      voiceLast[name] = now;
      if (voiceMissing[name]) return;
      var el = voiceEls[name];
      if (!el) {
        el = new Audio('audio/' + name + '.mp3');
        el._triedM4a = false;
        el.addEventListener('error', function () {
          // first failure: probe .m4a once; second failure: give up quietly
          if (!el._triedM4a && el.src.indexOf('.m4a') === -1) {
            el._triedM4a = true;
            el.src = 'audio/' + name + '.m4a';
          } else {
            voiceMissing[name] = true;
          }
        });
        voiceEls[name] = el;
      }
      try { el.currentTime = 0; } catch (e) { /* not loaded yet: fine */ }
      var p = el.play();
      if (p && p.catch) p.catch(function () { /* autoplay rules: drop it */ });
    },

    // helper to forward optional 3D pos to tone/noise
    setListenerPos: setListenerPos,
    /* ----- game sfx (optional pos {x,y,z} for spatial) ----- */
    shoot: function (pos) { noise({ freq: 2400, slide: 300, dur: 0.18, vol: 0.35, pos: pos }); },
    stretch: function (power, pos) { tone({ freq: 120 + power * 160, type: 'triangle', dur: 0.06, vol: 0.08, pos: pos }); },
    thunk: function (pos) {
      noise({ freq: 500, dur: 0.08, vol: 0.5, pos: pos });
      tone({ freq: 130, slide: 70, type: 'square', dur: 0.12, vol: 0.25, pos: pos });
    },
    snap: function (pos) {
      noise({ freq: 1800, filter: 'highpass', slide: 650, dur: 0.09, vol: 0.42, pos: pos });
      tone({ freq: 360, slide: 110, type: 'square', dur: 0.08, vol: 0.16, pos: pos });
      tone({ freq: 190, slide: 80, type: 'triangle', dur: 0.11, vol: 0.12, delay: 0.045, pos: pos });
    },
    bullseye: function (pos) {
      tone({ freq: 660, type: 'square', dur: 0.1, vol: 0.25, pos: pos });
      tone({ freq: 880, type: 'square', dur: 0.12, vol: 0.25, delay: 0.08, pos: pos });
      tone({ freq: 1320, type: 'square', dur: 0.2, vol: 0.25, delay: 0.16, pos: pos });
    },
    pop: function (pos) { noise({ freq: 3000, filter: 'highpass', dur: 0.1, vol: 0.45, pos: pos }); tone({ freq: 500, slide: 900, dur: 0.07, vol: 0.2, pos: pos }); },
    splat: function (pos) { noise({ freq: 700, slide: 150, dur: 0.18, vol: 0.4, pos: pos }); },
    coin: function (pos) {
      tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.18, pos: pos });
      tone({ freq: 1319, type: 'square', dur: 0.18, vol: 0.18, delay: 0.07, pos: pos });
    },
    chest: function (pos) {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.3, delay: i * 0.09, pos: pos });
      });
    },
    chestCrack: function (pos) {
      noise({ freq: 900, filter: 'bandpass', slide: 240, dur: 0.13, vol: 0.38, pos: pos });
      tone({ freq: 260, slide: 120, type: 'square', dur: 0.11, vol: 0.13, delay: 0.02, pos: pos });
    },
    bossHit: function (pos) {
      noise({ freq: 560, slide: 95, dur: 0.20, vol: 0.46, pos: pos });
      tone({ freq: 120, slide: 62, type: 'sawtooth', dur: 0.18, vol: 0.18, pos: pos });
      tone({ freq: 420, slide: 260, type: 'triangle', dur: 0.12, vol: 0.12, delay: 0.04, pos: pos });
    },
    freeze: function (pos) { tone({ freq: 1800, slide: 600, type: 'sine', dur: 0.4, vol: 0.25, pos: pos }); },
    zap: function (pos) { tone({ freq: 1400, slide: 120, type: 'sawtooth', dur: 0.18, vol: 0.25, pos: pos }); },
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
    },
    thunder: function () {
      // deep rolling rumble: lowpass noise bursts decaying ~0.8s + a sub thump
      noise({ freq: 380, slide: 65, dur: 0.8, vol: 0.45 });
      noise({ freq: 150, slide: 45, dur: 1.05, vol: 0.32, delay: 0.07 });
      tone({ freq: 64, slide: 34, type: 'sine', dur: 0.85, vol: 0.2 });
    }
  };
})();
