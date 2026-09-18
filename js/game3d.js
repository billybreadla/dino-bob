/* ============================================================
   DINO BOB 3D — PROTOTYPE (not the shipped game)
   ------------------------------------------------------------
   This is a feel test, not a rewrite. It answers one question:
   is Dino Bob better when arrows fly INTO the screen?

   It never touches index.html, game.js or sw.js. It borrows
   TUNING (scores) and AUDIO (sounds) from the real game, so the
   shooting sounds and the ring values are the ones you know.

   The knobs live in K below while this is a prototype. If the
   prototype graduates they move into js/tuning.js so Penny owns
   them like everything else.
   ============================================================ */

var GAME3D = (function () {
  'use strict';

  // ---------- prototype knobs ----------
  // PULL_FRACTION replaces MAX_PULL_PX: viewport-normalized (fraction of min(width,height)) so aim feels same on phone vs desktop.
  var K = (function () {
    var t = (typeof TUNING !== 'undefined' ? TUNING : {});
    return {
      ARROW_SPEED_MIN: t.ARROW_3D_SPEED_MIN || 26,
      ARROW_SPEED_MAX: t.ARROW_3D_SPEED_MAX || 52,
      GRAVITY: t.ARROW_3D_GRAVITY || 9.8,
      MAX_YAW: t.ARROW_3D_MAX_YAW || 0.55,
      MAX_PITCH: t.ARROW_3D_MAX_PITCH || 0.52,
      ARROWS: t.ARROWS_3D || 20,
      EYE_HEIGHT: t.ARROW_3D_EYE_HEIGHT || 1.65,
      PREVIEW_DOTS: t.ARROW_3D_PREVIEW_DOTS || 34,
      FAR_BONUS_METRES: t.ARROW_3D_FAR_BONUS_METRES || 34,
      PULL_FRACTION: t.ARROW_3D_PULL_FRACTION || 0.38,
      DEAD_ZONE: t.ARROW_3D_DEAD_ZONE || 0.08,
      PET_URL: t.PET_3D_URL || 'assets/models/pet_ptero.glb',
      PET_HEIGHT: t.PET_3D_HEIGHT || 0.95,
      MAGNET_ENABLED: (t.ARROW_3D_MAGNET_ENABLED !== false),
      MAGNET_STRENGTH: t.ARROW_3D_MAGNET_STRENGTH || 0.14,
      MAGNET_RANGE: t.ARROW_3D_MAGNET_RANGE || 1.9,
      FOV_NARROW: t.ARROW_3D_FOV_NARROW || 38,
      CAM_SHAKE: t.ARROW_3D_CAM_SHAKE || 0.18,
      BOW_ENABLED: (t.ARROW_3D_BOW_ENABLED !== false),
      WIND_ENABLED: (t.ARROW_3D_WIND_ENABLED !== false),
      WIND_MAX: t.ARROW_3D_WIND_MAX || 3.5,
      WIND_CHANCE: t.ARROW_3D_WIND_CHANCE || 0.6,
      SHADOW_ENABLED: (t.ARROW_3D_SHADOW_ENABLED !== false),
      PARALLAX: t.ARROW_3D_PARALLAX || 0.35,
       PARTICLES: (t.ARROW_3D_PARTICLES!==false), PARTICLE_COUNT: t.ARROW_3D_PARTICLE_COUNT||12,
       IDLE_SWAY: t.ARROW_3D_IDLE_SWAY || 0.035,
       FIREWORKS: t.ARROW_3D_FIREWORKS || 7,
       FOV_BASE: 46
    };
  })();

var W = window, D = document;
var scene, camera, renderer, clock, canvas;
var targets = [], arrows = [], previewDots = null, previewRibbon = null, pet = null;
var pickups = [], obstacles = [];
var bowMesh = null, bowString = null;
var camShake = 0; var baseFov = 46;
var windX = 0; var windFlag = null; var windFlagMesh = null;
var sceneryGroup = null;
var groundShadows = [];
var rainSystem = null;
var st = null, drag = null, raf = 0;
var roundOver = false;
var paused=false;
var hud = {};
var bgFar=null, bgMid=null; var horizonHaze=null; var currentBiome='meadow';

function togglePause(){ if(roundOver) return; paused=!paused; if(paused){ if(hud.pausePanel) hud.pausePanel.style.display='flex'; clock.stop(); } else { if(hud.pausePanel) hud.pausePanel.style.display='none'; clock.start(); } }
function quitToMenu(){ paused=false; if(hud.pausePanel) hud.pausePanel.style.display='none'; clock.start(); reset(); }
var hitParticles = []; // {obj, vel, life, maxLife}

  function rollWind(){ if(!K.WIND_ENABLED || Math.random()>K.WIND_CHANCE){ windX=0; return; } var s=Math.random()<0.5?1:-1; var r=Math.pow(Math.random(),3); windX = s * r * K.WIND_MAX; }
  function applyWind(vx, dt){ return vx + windX * dt * 0.9; }
var BIOMES = ['meadow','mountain','sunset_beach','starlight','underwater','moon_cave'];
function pickBiome(){ return BIOMES[Math.floor(Math.random()*BIOMES.length)]; }
function buildBackgroundPlanes(biome){
  if(bgFar) scene.remove(bgFar); if(bgMid) scene.remove(bgMid);
  bgFar=null; bgMid=null;
  if(!biome) biome = pickBiome();
  currentBiome = biome;
  if(scene && scene.fog){
    scene.fog.near = biome==='starlight'||biome==='moon_cave' ? 22 : 26;
    scene.fog.far = biome==='starlight'||biome==='moon_cave' ? 88 : 96;
    if(scene.fog.color){
      if(biome==='starlight') scene.fog.color.setHex(0x24314e);
      else if(biome==='moon_cave') scene.fog.color.setHex(0x2a2a45);
      else scene.fog.color.setHex(0x8ecfe8);
    }
  }
  var loader = new THREE.TextureLoader();
  // far plane — 240x135 at z -180
  var farUrl = 'assets/sprites/bg_'+biome+'_far.webp';
  var farTex = loader.load(farUrl, function(tex){ if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; tex.needsUpdate=true; }, undefined, function(){ console.warn('bg failed', farUrl); });
  if(THREE.SRGBColorSpace) farTex.colorSpace = THREE.SRGBColorSpace; else farTex.encoding = THREE.sRGBEncoding;
  var farMat = new THREE.MeshBasicMaterial({map: farTex, transparent:true, opacity:0.92, fog:false});
  bgFar = new THREE.Mesh(new THREE.PlaneGeometry(240, 135), farMat);
  bgFar.position.set(0, 28, -180);
  bgFar.lookAt(0, 8, 0);
  scene.add(bgFar);
  // mid plane — 160x90 at z -110, lower
  var midUrl = 'assets/sprites/bg_'+biome+'_mid.webp';
  var midTex = loader.load(midUrl, function(tex){ if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; tex.needsUpdate=true; }, undefined, function(){ console.warn('bg failed', midUrl); });
  if(THREE.SRGBColorSpace) midTex.colorSpace = THREE.SRGBColorSpace; else midTex.encoding = THREE.sRGBEncoding;
  var midMat = new THREE.MeshBasicMaterial({map: midTex, transparent:true, opacity:0.96, fog:false});
  bgMid = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), midMat);
  bgMid.position.set(0, 14, -110);
  bgMid.lookAt(0, 6, 0);
  scene.add(bgMid);
}

  // ---------- little helpers ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pullDenom() { return Math.min(W.innerWidth, W.innerHeight) * K.PULL_FRACTION; }
  function physicsDt() { return 0.033; } // shared dt for preview + live, ~30Hz stable
  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function mulberry32(seed){ return function(){ var t=seed+=0x6D2B79F5; t=Math.imul(t ^ t>>>15, t | 1); t^=t + Math.imul(t ^ t>>>7, t | 61); return ((t ^ t>>>14)>>>0)/4294967296; }; }
  function seededTargets(seedStr){
    var seed=0; for(var i=0;i<seedStr.length;i++) seed=(seed*31+seedStr.charCodeAt(i))>>>0;
    var rnd=mulberry32(seed);
    var out=[];
    for(var k=0;k<4;k++){
      var x=(rnd()-0.5)*8; // -4..4
      var z=-(12 + rnd()*42); // -12..-54
      var r=0.9 + rnd()*0.45; // 0.9..1.35
      var mover = rnd()<0.5;
      out.push({x:x, z:z, r:r, mover:mover});
    }
    return out;
  }
  function el(id) { return D.getElementById(id); }
  function say(msg) { if (hud.msg) { hud.msg.textContent = msg; hud.msg.style.opacity = 1;
    clearTimeout(hud.msgT); hud.msgT = setTimeout(function () { hud.msg.style.opacity = 0; }, 1400); } }

function onRoundEnd(){
  if(!st) return;
  var score = st.score || 0;
  // stash for results panel (default before SAVE path)
  var _coinsTmp = Math.floor(score / (TUNING.SCORE_PER_COIN||10));
  st._coinsEarned=_coinsTmp; st._isHigh=false; st._streakInfo=null;
  // ensure SAVE is loaded
  if(typeof SAVE==='undefined' || !SAVE.current) return;
  try {
    SAVE.load();
    var p = SAVE.current();
    if(!p){
      // no profile yet — create a default one so 3D still saves
      if(SAVE.profiles().length===0) SAVE.addProfile('Player','dinobob');
      p = SAVE.current();
      if(!p) return;
    }
    var isHigh = SAVE.recordRound(score);
    var coins = Math.floor(score / (TUNING.SCORE_PER_COIN||10));
    if(coins>0) SAVE.addCoins(coins);
    SAVE.recordStat('score', score);
    if(st.hits) SAVE.recordStat('bullseyes', st.hits); // approximate
    // quest progress: simplest stat is rounds + score
    if(SAVE.addQuestProgress) SAVE.addQuestProgress({rounds:1, score:score, coins:coins, bullseyes: st.hits||0});
    var streak = SAVE.noteDailyActivity ? SAVE.noteDailyActivity() : null;
    st._coinsEarned=coins; st._isHigh=isHigh; st._streakInfo=streak;
    // daily best (family)
    var isDaily = SAVE.recordDailyBest ? SAVE.recordDailyBest(score) : false;
    // show HUD feedback
    if(isHigh) { say('NEW BEST! +' + coins + ' coins'); if(AUDIO && AUDIO.newBest) try{AUDIO.newBest();}catch(e){} }
    else if(coins>0) { say('+' + coins + ' coins'); }
    if(isHigh){ spawnFireworks(K.FIREWORKS); if(navigator.vibrate) try{navigator.vibrate([30,40,30,40,60]);}catch(e){} }
    if(streak && streak.firstToday && streak.bonus>0) { setTimeout(function(){ say('Streak Day '+streak.count+'! +'+streak.bonus+' coins'); }, 1800); }
    if(isDaily) { setTimeout(function(){ say('NEW FAMILY BEST!'); }, 900); }
    // also store best in hud for display
    if(hud.best){ hud.best.textContent = p.highScore; hud.bestChip.style.display=''; }
    SAVE.persist();
  } catch(e){ console.warn('save fail', e); }
}

  // ============================================================
  // BUILD THE WORLD
  // ============================================================
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ecfe8);
    // haze pushes far things toward the sky colour: the strongest depth cue we get for free
    scene.fog = new THREE.Fog(0x8ecfe8, 26, 96);

    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);   // tighter than a walking-around FOV: archery wants compression
    camera.position.set(0, K.EYE_HEIGHT, 2.2);
    camera.lookAt(0, K.EYE_HEIGHT - 0.05, -20);

    var sun = new THREE.DirectionalLight(0xfff1d0, 1.05);
    sun.position.set(-6, 12, 4);           // key light upper-left, same contract as the 2D art
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xd6ecff, 0x6fae5a, 0.68));

scene.add(camera);

    // ---- ground ----
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshLambertMaterial({ color: 0x69a94e })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // A faint grid is the cheapest depth ruler there is: it tells your eye
    // how far away everything is before you have thrown a single arrow.
    var grid = new THREE.GridHelper(240, 120, 0x5c9444, 0x5c9444);
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    grid.position.y = 0.01;
    scene.add(grid);

    // horizon haze — soft wash where ground meets sky, strongest depth cue after fog
    var hazeGeo = new THREE.PlaneGeometry(240, 18);
    var hazeMat = new THREE.MeshBasicMaterial({ color:0xc9ecfa, transparent:true, opacity:0.42, fog:false, side:THREE.DoubleSide });
    var haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.position.set(0, 7.2, -62);
    haze.lookAt(0, 7.2, 0);
    scene.add(haze);
    horizonHaze = haze;

    buildScenery();
    buildTargets();
    buildPreview();
    buildPet();
    buildBow();
    // wind flag — tiny tell for the sideways push so kids read it at a glance
    windFlag = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,1.8,6), new THREE.MeshLambertMaterial({color:0x8b5a2b}));
    pole.position.y = 0.9;
    var flagMat = new THREE.MeshLambertMaterial({color:0xff3b30});
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.45,4,2), flagMat);
    flag.position.set(0.45,1.5,0);
    flag.rotation.y = -0.1;
    windFlag.add(pole);
    windFlag.add(flag);
    windFlag.position.set(-4.2,0,-5.5);
    windFlag.visible = false;
    scene.add(windFlag);
    windFlagMesh = flag;
    buildBackgroundPlanes(pickBiome());
  }

  // Trees and distance posts. They exist so your eye can measure depth.
  function buildScenery() {
    var g = new THREE.Group();
    var trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6);
    var leafGeo = new THREE.ConeGeometry(1.15, 2.6, 7);
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4630 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7f37 });

    for (var i = 0; i < 46; i++) {
      var side = i % 2 ? 1 : -1;
      var z = -6 - Math.random() * 84;
      var x = side * (7 + Math.random() * 22);
      var s = 0.75 + Math.random() * 0.9;
      var t = new THREE.Mesh(trunkGeo, trunkMat);
      t.position.set(x, 0.8 * s, z); t.scale.setScalar(s);
      var l = new THREE.Mesh(leafGeo, leafMat);
      l.position.set(x, (1.6 + 1.3) * s, z); l.scale.setScalar(s);
      g.add(t); g.add(l);
    }

    // a low fence a few metres out: the near end of the depth ruler
    var railMat = new THREE.MeshLambertMaterial({ color: 0xc8a06a });
    for (var f = -13; f <= 13; f += 2) {
      var fp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.0, 0.13), railMat);
      fp.position.set(f, 0.5, -5.5);
      g.add(fp);
    }
    var rail = new THREE.Mesh(new THREE.BoxGeometry(27, 0.12, 0.1), railMat);
    rail.position.set(0, 0.86, -5.5);
    g.add(rail);

    // distance posts every 10m down the range
    var postGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14);
    var postMat = new THREE.MeshLambertMaterial({ color: 0xf0e2c0 });
    for (var d = 10; d <= 60; d += 10) {
      var p = new THREE.Mesh(postGeo, postMat);
      p.position.set(-3.4, 0.5, -d);
      g.add(p);
      var canvasD=document.createElement('canvas'); canvasD.width=128; canvasD.height=64; var ctxD=canvasD.getContext('2d'); ctxD.fillStyle='rgba(26,24,34,0.92)'; if(ctxD.roundRect){ ctxD.beginPath(); ctxD.roundRect(6,12,116,40,14); ctxD.fill(); } else ctxD.fillRect(6,12,116,40); ctxD.strokeStyle='rgba(255,255,255,0.18)'; ctxD.lineWidth=3; ctxD.stroke(); ctxD.fillStyle='#ffd23a'; ctxD.font='900 24px Lilita One, Nunito, sans-serif'; ctxD.textAlign='center'; ctxD.textBaseline='middle'; ctxD.fillText(d+'m',64,34); var tex=new THREE.CanvasTexture(canvasD); if(THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace; else tex.encoding=THREE.sRGBEncoding; var label=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.45), new THREE.MeshBasicMaterial({map:tex, transparent:true, fog:false})); label.position.set(-3.4,1.55,-d); label.lookAt(0,1.55,0); g.add(label);
    }
    scene.add(g);
    sceneryGroup = g;
  }

  function makeGroundShadow(target){ var g=new THREE.CircleGeometry(target.r*0.55,16); var m=new THREE.MeshBasicMaterial({color:0x1a1822, transparent:true, opacity:0.18}); var mesh=new THREE.Mesh(g,m); mesh.rotation.x=-Math.PI/2; mesh.position.set(target.obj.position.x,0.02,target.obj.position.z); mesh.userData.target=target; scene.add(mesh); return mesh; }

  // ---- a target: four scoring rings on a post, facing the player ----
  function makeTarget(x, z, radius, mover) {
    var group = new THREE.Group();
    var colors = [0xe8443a, 0xf6f2e8, 0xe8443a, 0xf6f2e8]; // centre outward
    for (var r = 3; r >= 0; r--) {
      var outer = radius * (r + 1) / 4;
      var disc = new THREE.Mesh(
        new THREE.CircleGeometry(outer, 40),
        new THREE.MeshLambertMaterial({ color: colors[r] })
      );
      disc.position.z = 0.004 * (3 - r);   // stack them so the centre sits proud
      group.add(disc);
    }
    var gold = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.13, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcf3d })
    );
    gold.position.z = 0.02;
    group.add(gold);

    var post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x7a5236 })
    );
    post.position.y = -radius - 0.6;
    post.scale.y = (radius + 1.2) / 2;
    group.add(post);

    group.position.set(x, radius + 1.1, z);
    scene.add(group);

    var targetObj = {
      obj: group, baseX: x, z: z, r: radius,
      mover: !!mover, phase: Math.random() * 6.28,
      speed: 0.5 + Math.random() * 0.5, amp: mover ? 2.6 + Math.random() * 2.2 : 0,
      dead: false
    };
    if(K.SHADOW_ENABLED){
      var sh = makeGroundShadow(targetObj);
      groundShadows.push(sh);
    }
    return targetObj;
  }

  function makeBalloon(x, z) {
    var g = new THREE.Group();
    var blob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshLambertMaterial({ color: 0xe8443a }));
    blob.scale.set(1, 1.18, 1);
    var knot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 6), new THREE.MeshLambertMaterial({ color: 0xc8a06a }));
    knot.position.y = -0.55;
    knot.rotation.x = Math.PI;
    var str = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0.08, -1.1, 0)]), new THREE.LineBasicMaterial({ color: 0x8b5a2b }));
    g.add(blob);
    g.add(knot);
    g.add(str);
    g.position.set(x, 1.9 + Math.random() * 0.6, z);
    scene.add(g);
    return { obj: g, type: 'balloon', r: 0.55, z: z, baseY: g.position.y, bobPhase: Math.random() * 6.28, dead: false };
  }

  function makeShield(target) {
    var sh = new THREE.Mesh(new THREE.CircleGeometry(0.52, 12), new THREE.MeshLambertMaterial({ color: 0x8b5a2b, side: THREE.DoubleSide }));
    sh.position.set(target.obj.position.x + 0.9, target.obj.position.y, target.obj.position.z + 0.35);
    scene.add(sh);
    return { obj: sh, host: target, angle: Math.random() * 6.28, orbitR: 0.95 };
  }

  function buildTargets() {
    targets.forEach(function (t) { scene.remove(t.obj); });
    groundShadows.forEach(function(s){ scene.remove(s); });
    groundShadows = [];
    pickups.forEach(function (p) { scene.remove(p.obj); });
    pickups = [];
    obstacles.forEach(function (o) { scene.remove(o.obj); });
    obstacles = [];
    var hash = W.location && W.location.hash || '';
    var m = hash.match(/3d=([^&]+)/);
    var daily = hash.match(/daily=([^&]+)/);
    var useSeed = null;
    if(m) try{ useSeed = decodeURIComponent(m[1]); }catch(e){}
    else if(daily) useSeed = todayStr();
    var layout = null;
    if(useSeed){
      if(m){
        try{
          var code = useSeed;
          var json = atob(code.replace(/-/g,'+').replace(/_/g,'/'));
          var arr = JSON.parse(json);
          if(Array.isArray(arr) && arr.length){
            layout = arr;
          }
        }catch(e){}
        if(!layout){
          try{ layout = seededTargets(useSeed); }catch(e){}
        }
      } else {
        try{ layout = seededTargets(useSeed); }catch(e){}
      }
    }
    if(layout && layout.length){
      targets = [];
      for(var _li=0; _li<layout.length && _li<4; _li++){
        var _ld = layout[_li];
        var _lx = typeof _ld.x==='number' ? _ld.x : 0;
        var _lz = typeof _ld.z==='number' ? _ld.z : -(12+_li*14);
        var _lr = typeof _ld.r==='number' ? _ld.r : 1.05;
        var _lm = !!_ld.mover;
        targets.push(makeTarget(_lx, _lz, _lr, _lm));
      }
      while(targets.length<4){
        var _k=targets.length;
        var _fb = seededTargets(useSeed+'_'+_k);
        var _fd=_fb[0];
        targets.push(makeTarget(_fd.x, _fd.z, _fd.r, _fd.mover));
      }
    } else {
      targets = [
        makeTarget(-2.2, -12, 1.15, false),
        makeTarget(2.6, -27, 1.05, true),
        makeTarget(-0.6, -41, 0.95, true),
        makeTarget(4.2, -54, 1.30, false)
      ];
    }
    if (Math.random() < 0.6) {
      pickups.push(makeBalloon((Math.random() - 0.5) * 6, -18 - Math.random() * 30));
    }
    for (var _oi = 0; _oi < targets.length; _oi++) {
      var _t = targets[_oi];
      if (_t.mover && Math.random() < ((W.TUNING && TUNING.OBSTACLE_CHANCE) || 0.4)) {
        obstacles.push(makeShield(_t));
      }
    }
  }

  // dotted arc showing where this pull would send the arrow
  function buildPreview() {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(K.PREVIEW_DOTS * 3), 3));
    previewDots = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.10, transparent: true, opacity: 0.85, sizeAttenuation: true
    }));
    previewDots.visible = false;
    previewDots.frustumCulled = false;
    scene.add(previewDots);
    // ribbon is the main trajectory guide — dots stay as fallback
    previewRibbon = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    previewRibbon.visible = false;
    previewRibbon.frustumCulled = false;
    scene.add(previewRibbon);
  }

  // ============================================================
  // THE PET (the real-model test)
  // ============================================================
  // House rule 6 applies here exactly as it does to sprites: something sane
  // must render even when the model does not load. It will not load from a
  // double-clicked file:// page, because Chrome blocks reading the .glb off
  // disk. Run a local server to see the real one (see the note in 3d.html).
  function procPet() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12),
      new THREE.MeshLambertMaterial({ color: 0x8bd45f }));
    body.scale.set(1, 0.85, 1.25);
    body.position.y = 0.42;
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x20303a }));
    eye.position.set(0.14, 0.56, -0.32);
    var eye2 = eye.clone(); eye2.position.x = -0.14;
    g.add(body); g.add(eye); g.add(eye2);
    return g;
  }

  function fitAndPlace(obj) {
    var box = new THREE.Box3().setFromObject(obj);
    var size = box.getSize(new THREE.Vector3());
    var scale = K.PET_HEIGHT / (size.y || 1);
    obj.scale.setScalar(scale);
    box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;              // stand it on the ground, not through it
  }

  function buildPet() {
    var holder = new THREE.Group();
    holder.position.set(1.9, 0, -4.1);        // just inside the fence, in frame
    holder.rotation.y = -0.5;                 // half-turned toward the shooter
    var stand = procPet();
    fitAndPlace(stand);
    holder.add(stand);
    scene.add(holder);
    pet = { holder: holder, model: stand, real: false, bob: Math.random() * 6.28, cheer: 0 };

    if (typeof THREE.GLTFLoader !== 'function') return;
    new THREE.GLTFLoader().load(K.PET_URL, function (gltf) {
      holder.remove(stand);
      var m = gltf.scene;
      // Meshy/Tripo exports come out shiny-metal, which reads as BLACK in a
      // scene with no reflections to be shiny about. Knock the metal off and
      // tell three the textures are sRGB, or every bought/generated model
      // will look like a burnt lump. This is the 3D version of the lighting
      // contract the 2D art already has to obey.
      m.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (mat) {
          if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.05);
          if (mat.roughness !== undefined) mat.roughness = 0.85;
          if (mat.map) mat.map.encoding = THREE.sRGBEncoding;
          mat.needsUpdate = true;
        });
      });
      fitAndPlace(m);
      holder.add(m);
      pet.model = m;
      pet.real = true;
      say('real 3D model loaded');
    }, undefined, function () {
      // stays procedural, and that is a fine answer
    });
  }

  // ---- bow: sells the fantasy even before the first arrow ----
  function buildBow() {
    bowMesh = new THREE.Group();
    bowMesh.position.set(0, K.EYE_HEIGHT - 0.15, 0.35);
    var limbMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    var gripMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    // upper limb — angled 12° outward
    var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.65, 8), limbMat);
    upper.position.set(0, 0.325, 0);
    upper.rotation.z = 0.209;
    // lower limb
    var lower = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.65, 8), limbMat);
    lower.position.set(0, -0.325, 0);
    lower.rotation.z = -0.209;
    // grip — the handle you hold
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.06), gripMat);
    // string — 3 points: top, nock, bottom (nock pulls back with power)
    var sg = new THREE.BufferGeometry();
    sg.setFromPoints([new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, -0.6, 0)]);
    bowString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xeee8d5 }));
    bowMesh.add(upper); bowMesh.add(lower); bowMesh.add(grip); bowMesh.add(bowString);
    bowMesh.visible = K.BOW_ENABLED;
    bowMesh.userData.punch = 0;
    scene.add(bowMesh);
  }

  function buildRain(){
    if(rainSystem) { scene.remove(rainSystem); rainSystem=null; }
    if(!K.WIND_ENABLED) return;
    if(Math.random()>0.4) return;
    var geo=new THREE.BufferGeometry();
    var count=120;
    var pos=new Float32Array(count*3);
    for(var i=0;i<count;i++){ pos[i*3]=(Math.random()-0.5)*80; pos[i*3+1]=Math.random()*22+4; pos[i*3+2]=-Math.random()*90 -2; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    rainSystem=new THREE.Points(geo, new THREE.PointsMaterial({color:0x9ecfff, size:0.18, transparent:true, opacity:0.55}));
    scene.add(rainSystem);
  }

  function updateBow(dt) {
    if (!bowMesh) return;
    bowMesh.visible = K.BOW_ENABLED;
    if (!K.BOW_ENABLED) return;
    var power = 0, offX = 0;
    if (drag && drag.active) {
      var denom = pullDenom();
      power = Math.min(Math.sqrt(drag.dx * drag.dx + drag.dy * drag.dy), denom) / denom;
      offX = -(drag.dx / denom) * 0.18;
    }
    var nockZ = 0.02 + power * 0.38;
    var top = new THREE.Vector3(0, 0.6, 0);
    var bot = new THREE.Vector3(0, -0.6, 0);
    var nock = new THREE.Vector3(offX, 0, nockZ);
    bowString.geometry.setFromPoints([top, nock, bot]);
    // lean slightly with drag
    var denom2 = pullDenom();
    var lean = (drag && drag.active) ? -(drag.dx / denom2) * 0.12 : 0;
    bowMesh.position.x += (lean - bowMesh.position.x) * Math.min(1, dt * 8);
    // scale punch decay (recoil snap)
    if (bowMesh.userData.punch) {
      bowMesh.userData.punch *= Math.max(0, 1 - dt * 10);
      if (bowMesh.userData.punch < 0.01) bowMesh.userData.punch = 0;
      var s = 1 + bowMesh.userData.punch * 0.12;
      bowMesh.scale.set(s, s, s);
    } else {
      bowMesh.scale.set(1, 1, 1);
    }
  }

function spawnBullseyeParticles(x,y,z, r){
  if(!K.PARTICLES) return;
  var n = K.PARTICLE_COUNT || 12;
  for(var i=0;i<n;i++){
    var ang = (i/n)*Math.PI*2 + Math.random()*0.3;
    var sp = 1.8 + Math.random()*2.2;
    var vel = new THREE.Vector3(Math.cos(ang)*sp*0.6, Math.sin(ang)*sp*0.6 + 1.2, (Math.random()-0.5)*sp*0.5);
    var geo = new THREE.SphereGeometry(0.055,6,6);
    var mat = new THREE.MeshBasicMaterial({color: i%2?0xffcf3d:0xffffff, transparent:true, opacity:0.95});
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x,y,z+0.22);
    scene.add(m);
    hitParticles.push({obj:m, vel:vel, life:0.42+Math.random()*0.18, maxLife:0.42+Math.random()*0.18});
  }
  // ring shockwave
  var ringGeo = new THREE.RingGeometry(r*0.22, r*0.26, 24);
  var ringMat = new THREE.MeshBasicMaterial({color:0xffd23a, transparent:true, opacity:0.85, side:THREE.DoubleSide});
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(x,y,z+0.25);
  ring.lookAt(camera.position);
  scene.add(ring);
  hitParticles.push({obj:ring, vel:new THREE.Vector3(0,0,0), life:0.28, maxLife:0.28, isRing:true, baseR:r});
  camShake = Math.max(camShake, K.CAM_SHAKE*1.4);
}

function spawnDustPuff(x,z){
  if(!K.PARTICLES) return;
  for(var i=0;i<6;i++){
    var vel = new THREE.Vector3((Math.random()-0.5)*1.6, 0.8+Math.random()*1.1, (Math.random()-0.5)*1.6);
    var mat = new THREE.MeshBasicMaterial({color:0xc8a06a, transparent:true, opacity:0.42});
    var m = new THREE.Mesh(new THREE.SphereGeometry(0.09,5,5), mat);
    m.position.set(x,0.12,z);
    m.scale.setScalar(0.7+Math.random()*0.5);
    scene.add(m);
    hitParticles.push({obj:m, vel:vel, life:0.38, maxLife:0.38});
  }
}

function spawnBalloonShreds(x,y,z){
  if(!K.PARTICLES) return;
  var colors=[0xe8443a,0xf6f2e8,0xffcf3d];
  for(var i=0;i<9;i++){
    var vel=new THREE.Vector3((Math.random()-0.5)*3.2, 1.5+Math.random()*2.0, (Math.random()-0.5)*2.0);
    var c=colors[i%3];
    var m=new THREE.Mesh(new THREE.PlaneGeometry(0.18,0.22), new THREE.MeshBasicMaterial({color:c, side:THREE.DoubleSide, transparent:true, opacity:0.9}));
    m.position.set(x,y,z);
    m.rotation.set(Math.random()*6.28, Math.random()*6.28, Math.random()*6.28);
    scene.add(m);
    hitParticles.push({obj:m, vel:vel, life:0.55, maxLife:0.55, spin:new THREE.Vector3(Math.random()*6-3, Math.random()*6-3, Math.random()*6-3)});
  }
  // string wobble line
  var sg=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,-0.7,0)]);
  var line=new THREE.Line(sg, new THREE.LineBasicMaterial({color:0x8b5a2b, transparent:true, opacity:0.7}));
  line.position.set(x, y-0.6, z);
  scene.add(line);
  hitParticles.push({obj:line, vel:new THREE.Vector3(0,-1.2,0), life:0.45, maxLife:0.45, isString:true});
}

function spawnFireworks(n){
  if(!K.PARTICLES) return;
  for(var f=0;f<n;f++){
    (function(){
      var fx = (Math.random()-0.5)*12;
      var fy = 8 + Math.random()*6;
      var fz = -12 - Math.random()*40;
      var col = [0xffd23a,0xe8443a,0x6cc24a,0x9b5fe8,0x5ac8ff][f%5];
      setTimeout(function(){
        for(var i=0;i<18;i++){
          var ang=Math.random()*Math.PI*2;
          var sp=2.5+Math.random()*2.8;
          var vel=new THREE.Vector3(Math.cos(ang)*sp*0.55, Math.sin(ang)*sp*0.55+1.0, (Math.random()-0.5)*sp*0.4);
          var m=new THREE.Mesh(new THREE.SphereGeometry(0.07,5,5), new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.95}));
          m.position.set(fx,fy,fz);
          scene.add(m);
          hitParticles.push({obj:m, vel:vel, life:0.9+Math.random()*0.4, maxLife:0.9+Math.random()*0.4});
        }
        camShake=Math.max(camShake,0.22);
        if(AUDIO && AUDIO.firework) try{AUDIO.firework();}catch(e){}
      }, f*220);
    })();
  }
}

function updateHitParticles(dt){
  for(var i=hitParticles.length-1;i>=0;i--){
    var p=hitParticles[i];
    p.life-=dt;
    if(p.life<=0){ scene.remove(p.obj); hitParticles.splice(i,1); continue; }
    var t=p.life/p.maxLife;
    if(p.isRing){
      var s=1 + (1-t)*2.2;
      p.obj.scale.set(s,s,s);
      p.obj.material.opacity = t*0.85;
      p.obj.lookAt(camera.position);
    } else if(p.isString){
      p.obj.position.y += p.vel.y*dt;
      p.obj.material.opacity = t*0.7;
    } else {
      p.vel.y -= 6.5*dt;
      p.obj.position.x += p.vel.x*dt;
      p.obj.position.y += p.vel.y*dt;
      p.obj.position.z += p.vel.z*dt;
      p.obj.material.opacity = t*0.95;
      if(p.spin){ p.obj.rotation.x += p.spin.x*dt; p.obj.rotation.y += p.spin.y*dt; p.obj.rotation.z += p.spin.z*dt; }
      p.obj.scale.setScalar(0.7 + (1-t)*0.4);
    }
  }
}

  function updatePet(dt) {
    if (!pet) return;
    pet.bob += dt * 2.2;
    var hop = 0;
    if (pet.cheer > 0) {
      pet.cheer -= dt;
      hop = Math.abs(Math.sin(pet.cheer * 12)) * 0.42;
      pet.holder.rotation.y += dt * 7;
    } else {
      pet.holder.rotation.y += (-0.5 - pet.holder.rotation.y) * Math.min(1, dt * 3);
    }
    // combo cheer — pet gets extra excited when you're on a streak!
    if(st && st.combo>2) pet.cheer = Math.max(pet.cheer, 0.6);
    pet.model.position.y = pet.model.userData.baseY === undefined
      ? (pet.model.userData.baseY = pet.model.position.y)
      : pet.model.userData.baseY;
    pet.model.position.y += Math.sin(pet.bob) * 0.06 + hop;
    // keep pet planted — gentle drift back to perch so he never wanders off
    pet.holder.position.x += (1.9 - pet.holder.position.x)*dt*0.5;
  }

  // ============================================================
  // SHOOTING
  // ============================================================
  function aimFromDrag() {
    var denom = Math.max(80, pullDenom()); // clamp min 80px so tiny phones still work
    var len = Math.min(Math.sqrt(drag.dx*drag.dx + drag.dy*drag.dy), denom);
    var power = len / denom;
    var yaw = -(drag.dx / denom) * K.MAX_YAW;
    var pitch = (drag.dy / denom) * K.MAX_PITCH;
    yaw = clamp(yaw, -K.MAX_YAW, K.MAX_YAW);
    pitch = clamp(pitch, -K.MAX_PITCH*0.4, K.MAX_PITCH);
    var mag = applyMagnetism(yaw, pitch);
    yaw = mag.yaw; pitch = mag.pitch;
    var speed = K.ARROW_SPEED_MIN + (K.ARROW_SPEED_MAX - K.ARROW_SPEED_MIN) * power;
    return { power:power, yaw:yaw, pitch:pitch, denom:denom, vx:Math.sin(yaw)*Math.cos(pitch)*speed, vy:Math.sin(pitch)*speed, vz:-Math.cos(yaw)*Math.cos(pitch)*speed };
  }

  // gentle aim help — pulls yaw/pitch a little toward the nearest target when close
  function applyMagnetism(yaw, pitch) {
    if (!K.MAGNET_ENABLED || !drag || !drag.active) return { yaw: yaw, pitch: pitch };
    var best = null, bestDist = Infinity, bestYaw = yaw, bestPitch = pitch;
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (tg.dead) continue;
      var dx = tg.obj.position.x - 0;
      var dy = tg.obj.position.y - K.EYE_HEIGHT;
      var dz = tg.obj.position.z - 0.6;
      var targetYaw = Math.atan2(dx, -dz);
      var targetPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
      var dYaw = targetYaw - yaw;
      var dPitch = targetPitch - pitch;
      var dist = Math.sqrt(dYaw * dYaw + dPitch * dPitch);
      var angRadius = (tg.r / Math.abs(tg.z)) * K.MAGNET_RANGE * 0.8;
      if (dist < angRadius && dist < bestDist) {
        bestDist = dist;
        best = tg;
        bestYaw = yaw + dYaw * K.MAGNET_STRENGTH;
        bestPitch = pitch + dPitch * K.MAGNET_STRENGTH;
      }
    }
    if (best !== null) {
      bestYaw = clamp(bestYaw, -K.MAX_YAW, K.MAX_YAW);
      bestPitch = clamp(bestPitch, -K.MAX_PITCH * 0.4, K.MAX_PITCH);
      return { yaw: bestYaw, pitch: bestPitch };
    }
    return { yaw: yaw, pitch: pitch };
  }

  function updatePreview() {
    if (!drag || !drag.active) {
      previewDots.visible = false;
      if (previewRibbon) previewRibbon.visible = false;
      return;
    }
    var a = aimFromDrag();
    var pos = previewDots.geometry.attributes.position;
    var x = 0, y = K.EYE_HEIGHT, z = 0.6;
    var vx = a.vx, vy = a.vy, vz = a.vz, dt = physicsDt();
    for (var i = 0; i < K.PREVIEW_DOTS; i++) {
      vy -= K.GRAVITY * dt;
      vx += windX * dt * 0.65;
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < 0.02) y = 0.02;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    // ribbon — 24 points along same physics arc (main guide)
    if (previewRibbon) {
      var rx = 0, ry = K.EYE_HEIGHT, rz = 0.6;
      var rvx = a.vx, rvy = a.vy, rvz = a.vz;
      var pts = [];
      for (var k = 0; k < 24; k++) {
        rvy -= K.GRAVITY * dt;
        rvx += windX * dt * 0.65;
        rx += rvx * dt; ry += rvy * dt; rz += rvz * dt;
        if (ry < 0.02) ry = 0.02;
        pts.push(new THREE.Vector3(rx, ry, rz));
      }
      previewRibbon.geometry.setFromPoints(pts);
      previewRibbon.visible = true;
      previewRibbon.material.opacity = 0.35 + a.power * 0.5;
      // ribbon is main guide — hide dots when ribbon is on
      previewDots.visible = false;
    } else {
      previewDots.visible = true;
      previewDots.material.opacity = 0.35 + a.power * 0.5;
    }
  }

  function makeArrowMesh() {
    var g = new THREE.Group();
    var shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6),
      new THREE.MeshLambertMaterial({ color: 0xd9b98c })
    );
    shaft.rotation.x = Math.PI / 2;          // lie the arrow down its own -Z
    var head = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.26, 7),
      new THREE.MeshLambertMaterial({ color: 0x9aa4ad })
    );
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.6;
    var fletch = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.3, 4),
      new THREE.MeshLambertMaterial({ color: 0xe86a4a })
    );
    fletch.rotation.x = Math.PI / 2;
    fletch.position.z = 0.5;
    g.add(shaft); g.add(head); g.add(fletch);
    return g;
  }

  function shoot() {
    if (roundOver) return;
    if (st.arrowsLeft <= 0 || st.timeLeft <= 0) return;
    var a = aimFromDrag();
    if (a.power < K.DEAD_ZONE) { say('Pull harder!'); if (navigator.vibrate) navigator.vibrate(20); return; }
    st.arrowsLeft--;
    var mesh = makeArrowMesh();
    mesh.position.set(0, K.EYE_HEIGHT, 0.6);
    scene.add(mesh);
    var ar={ obj: mesh, x: 0, y: K.EYE_HEIGHT, z: 0.6, vx: a.vx, vy: a.vy, vz: a.vz, stuck: false, life: 0 };
    arrows.push(ar);
    var trailGeo=new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12*3),3)); var trail=new THREE.Points(trailGeo, new THREE.PointsMaterial({color:0xffffff, size:0.12, transparent:true, opacity:0.65, sizeAttenuation:true})); scene.add(trail); ar.trail=trail; ar.trailPos=[];
    if (W.AUDIO && AUDIO.shoot) AUDIO.shoot();
    camShake = K.CAM_SHAKE;
    if (navigator.vibrate) navigator.vibrate(10);
    if (bowMesh) bowMesh.userData.punch = 1;
    var flash=new THREE.Mesh(new THREE.CircleGeometry(0.22,12), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.85, side:THREE.DoubleSide})); flash.position.set(0, K.EYE_HEIGHT, 0.35+0.22); flash.lookAt(camera.position); scene.add(flash); setTimeout(function(){ scene.remove(flash); }, 90);
    refreshHud();
  }

  function pointAlong(m, vx, vy, vz) {
    m.lookAt(m.position.x + vx, m.position.y + vy, m.position.z + vz);
    m.rotateY(Math.PI);   // meshes are built pointing down -Z, lookAt aims +Z
  }

  // ============================================================
  // SCORING
  // ============================================================
  function scoreHit(t, hx, hy) {
    var dist = Math.sqrt(hx * hx + hy * hy);
    var ring = clamp(Math.floor(dist / t.r * 4), 0, 3);
    var rings = (W.TUNING && TUNING.SCORE_BULLSEYE_RINGS) || [100, 50, 25, 10];
    var pts = rings[ring];
    var why = '';
    var comboMult = 1;
    if (ring === 0) {
      st.combo++;
      var step = (W.TUNING && TUNING.COMBO_STEP) || 2;
      var max = (W.TUNING && TUNING.COMBO_MAX) || 5;
      comboMult = Math.min(max, 1 + Math.floor(st.combo / step));
      if (comboMult > 1) { pts *= comboMult; why += ' x' + comboMult; }
      if (t.mover) { pts *= (W.TUNING && TUNING.MOVING_TARGET_MULTIPLIER) || 2; why += ' MOVING x2'; }
      if (-t.z > K.FAR_BONUS_METRES) { pts *= (W.TUNING && TUNING.FAR_TARGET_MULTIPLIER) || 2; why += ' FAR x2'; }
      if (W.AUDIO && AUDIO.bullseye) AUDIO.bullseye();
      if (pet) pet.cheer = 1.1;
      say('BULLSEYE! +' + pts + why);
      spawnBullseyeParticles(t.obj.position.x, t.obj.position.y, t.z+0.08, t.r);
      if(navigator.vibrate) navigator.vibrate(18);
    } else {
      if (t.mover) { pts *= (W.TUNING && TUNING.MOVING_TARGET_MULTIPLIER) || 2; why += ' MOVING x2'; }
      if (-t.z > K.FAR_BONUS_METRES) { pts *= (W.TUNING && TUNING.FAR_TARGET_MULTIPLIER) || 2; why += ' FAR x2'; }
      st.combo = 0;
      if (W.AUDIO && AUDIO.thunk) AUDIO.thunk();
      say('+' + pts + ' at ' + Math.round(-t.z) + 'm' + why);
      if(navigator.vibrate) navigator.vibrate(10);
    }
    st.score += pts;
    st.hits++;
    refreshHud();
  }

  // ============================================================
  // FRAME
  // ============================================================
  function update(dt) {
    if(paused || roundOver) return;
    if (!st) return;
    st.elapsed += dt;
    st.timeLeft = Math.max(0, ((W.TUNING && TUNING.ROUND_SECONDS) || 60) - st.elapsed);
    var moversAt = (W.TUNING && TUNING.MOVERS_START_AT) || 15;
    var chaosAt = (W.TUNING && TUNING.CHAOS_START_AT) || 40;
    if (st.elapsed < moversAt) st.phase = 'warmup';
    else if (st.elapsed < chaosAt) st.phase = 'movers';
    else st.phase = 'chaos';
    if(st.timeLeft<=0 || st.arrowsLeft<=0){
      roundOver=true;
      onRoundEnd();
      refreshHud();
      return;
    }
    var i, t;
    for (i = 0; i < targets.length; i++) {
      t = targets[i];
      if (!t.mover) continue;
      if (st.phase === 'warmup') continue;
      var speedMul = st.phase === 'chaos' ? 1.7 : 1.0;
      t.phase += dt * t.speed * speedMul;
      t.obj.position.x = t.baseX + Math.sin(t.phase) * t.amp;
    }
    // ground contact shadows — follow targets, fade when high, breathe a little
    for (i = 0; i < targets.length; i++) {
      t = targets[i];
      var sh = groundShadows[i];
      if(!sh) continue;
      sh.position.x = t.obj.position.x;
      sh.material.opacity = 0.18 * (1 - Math.min(1, t.obj.position.y/6));
      sh.scale.setScalar(0.9 + Math.sin(t.phase)*0.05);
    }
    for (i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      p.bobPhase += dt * 1.8;
      p.obj.position.y = p.baseY + Math.sin(p.bobPhase) * 0.35;
      p.obj.position.x += Math.sin(p.bobPhase * 0.7) * dt * 0.5;
    }
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (!o.host || o.host.dead) continue;
      o.angle += dt * ((W.TUNING && TUNING.OBSTACLE_SHIELD_SPEED) || 1.05);
      o.obj.position.x = o.host.obj.position.x + Math.cos(o.angle) * o.orbitR;
      o.obj.position.y = o.host.obj.position.y + Math.sin(o.angle) * o.orbitR * 0.7;
      o.obj.position.z = o.host.obj.position.z + 0.35;
      o.obj.lookAt(camera.position);
    }

    for (i = 0; i < arrows.length; i++) {
      var ar = arrows[i];
      ar.life += dt;
      if (ar.stuck) {
        if (ar.life > 6) { scene.remove(ar.obj); if(ar.trail) scene.remove(ar.trail); arrows.splice(i--, 1); }
        else if(ar.trail) ar.trail.material.opacity=0;
        continue;
      }
      var px = ar.x, py = ar.y, pz = ar.z;
      ar.vy -= K.GRAVITY * dt;
      ar.vx += windX * dt * 0.65;
      ar.x += ar.vx * dt; ar.y += ar.vy * dt; ar.z += ar.vz * dt;
      if(ar.trail && ar.trailPos){ ar.trailPos.unshift({x:ar.x,y:ar.y,z:ar.z}); if(ar.trailPos.length>12) ar.trailPos.pop(); var pos=ar.trail.geometry.attributes.position; for(var ti=0;ti<12;ti++){ if(ti<ar.trailPos.length) pos.setXYZ(ti, ar.trailPos[ti].x, ar.trailPos[ti].y, ar.trailPos[ti].z); else pos.setXYZ(ti, ar.x,ar.y,ar.z); } pos.needsUpdate=true; ar.trail.material.opacity = ar.stuck?0:0.65; }

      var _blocked = false;
      for (var k = 0; k < obstacles.length; k++) {
        var ob = obstacles[k];
        if (!ob.host || ob.host.dead) continue;
        var oz = ob.obj.position.z;
        if ((pz > oz) === (ar.z > oz)) continue;
        var uo = (oz - pz) / (ar.z - pz || 1e-6);
        var hxO = px + (ar.x - px) * uo - ob.obj.position.x;
        var hyO = py + (ar.y - py) * uo - ob.obj.position.y;
        if (Math.sqrt(hxO * hxO + hyO * hyO) > 0.52) continue;
        ar.stuck = true; ar.life = 0; if(ar.trail) ar.trail.material.opacity=0;
        ar.obj.position.set(ob.obj.position.x + hxO, ob.obj.position.y + hyO, oz + 0.08);
        pointAlong(ar.obj, ar.vx, ar.vy, ar.vz);
        ob.obj.add(ar.obj);
        ar.obj.position.set(hxO, hyO, 0.08);
        say('BLOCKED!');
        if (W.AUDIO && AUDIO.thunk) AUDIO.thunk();
        spawnDustPuff(ob.obj.position.x, ob.obj.position.z);
        if(navigator.vibrate) navigator.vibrate([25,30,25]);
        st.combo = 0;
        refreshHud();
        _blocked = true;
        break;
      }
      if (_blocked) continue;
      if (ar.stuck) continue;

      // did it cross a target's plane this step?
      for (var j = 0; j < targets.length; j++) {
        t = targets[j];
        if ((pz > t.z) === (ar.z > t.z)) continue;            // no crossing
        var u = (t.z - pz) / (ar.z - pz || 1e-6);
        var hx = px + (ar.x - px) * u - t.obj.position.x;
        var hy = py + (ar.y - py) * u - t.obj.position.y;
        if (Math.sqrt(hx * hx + hy * hy) > t.r) continue;     // missed the disc
        ar.stuck = true; ar.life = 0; if(ar.trail) ar.trail.material.opacity=0;
        ar.obj.position.set(t.obj.position.x + hx, t.obj.position.y + hy, t.z + 0.08);
        pointAlong(ar.obj, ar.vx, ar.vy, ar.vz);
        t.obj.add(ar.obj);                                    // ride along if it moves
        ar.obj.position.set(hx, hy, 0.08);
        scoreHit(t, hx, hy);
        break;
      }
      if (ar.stuck) continue;

      for (var j2 = 0; j2 < pickups.length; j2++) {
        var pp = pickups[j2];
        if (pp.dead) continue;
        if ((pz > pp.z) === (ar.z > pp.z)) continue;
        var up = (pp.z - pz) / (ar.z - pz || 1e-6);
        var hxP = px + (ar.x - px) * up - pp.obj.position.x;
        var hyP = py + (ar.y - py) * up - pp.obj.position.y;
        if (Math.sqrt(hxP * hxP + hyP * hyP) > pp.r) continue;
        scene.remove(pp.obj);
        spawnBalloonShreds(pp.obj.position.x, pp.obj.position.y, pp.z);
        pickups.splice(j2, 1);
        j2--;
        var stepB = (W.TUNING && TUNING.COMBO_STEP) || 2;
        var maxB = (W.TUNING && TUNING.COMBO_MAX) || 5;
        var comboMultB = Math.min(maxB, 1 + Math.floor(st.combo / stepB));
        var balloonPts = (W.TUNING && TUNING.SCORE_BALLOON) || 25;
        balloonPts *= comboMultB;
        st.score += balloonPts;
        st.hits++;
        var popMsg = 'POP! +' + balloonPts;
        if (comboMultB > 1) popMsg += ' x' + comboMultB;
        say(popMsg);
        if (W.AUDIO && AUDIO.pop) AUDIO.pop();
        else if (W.AUDIO && AUDIO.thunk) AUDIO.thunk();
        st.combo++;
        if (pet) pet.cheer = 0.8;
        refreshHud();
        break;
      }
      if (ar.stuck) continue;

      if (ar.y <= 0.05) {                                     // stuck in the dirt
        ar.y = 0.05; ar.stuck = true; ar.life = 0;
        if(ar.trail) ar.trail.material.opacity=0;
        st.combo = 0;
        if (W.AUDIO && AUDIO.snap) AUDIO.snap();
        say('MISS at ' + Math.round(-ar.z) + 'm');
        spawnDustPuff(ar.x, ar.z);
      }
      if (ar.z < -120) { scene.remove(ar.obj); if(ar.trail) scene.remove(ar.trail); arrows.splice(i--, 1); continue; }

      ar.obj.position.set(ar.x, ar.y, ar.z);
      pointAlong(ar.obj, ar.vx, ar.vy, ar.vz);
    }

    // FOV narrows as you pull — zooms you in for precision
    var power = (drag && drag.active) ? aimFromDrag().power : 0;
    var targetFov = baseFov - (baseFov - K.FOV_NARROW) * power;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();

    // camera leans with the aim so pulling back feels physical
    var denom = pullDenom();
    var leanX = (drag && drag.active) ? -(drag.dx / denom) * 0.5 : 0;
    var leanY = (drag && drag.active) ? (drag.dy / denom) * 0.22 : 0;
    camera.position.x += (clamp(leanX, -0.6, 0.6) - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += ((K.EYE_HEIGHT + clamp(leanY, -0.2, 0.3)) - camera.position.y) * Math.min(1, dt * 6);
    // idle sway — gentle breathing when not aiming (feels alive, not static)
    if(!drag || !drag.active){
      var idleT = Date.now()*0.0005;
      var idleX = Math.sin(idleT*1.1)*K.IDLE_SWAY;
      var idleY = Math.cos(idleT*0.8)*K.IDLE_SWAY*0.6;
      camera.position.x += idleX * dt * 6;
      camera.position.y += idleY * dt * 6;
      if(bgFar) { bgFar.rotation.y = idleX*0.02; }
    }
    // shake decays quickly — additive kick on fire, with differential parallax
    camShake *= Math.max(0, 1 - dt * 7);
    if (camShake > 0.001) {
      var shakeX = (Math.random()-0.5)*camShake;
      var shakeY = (Math.random()-0.5)*camShake*0.6;
      camera.position.x += shakeX * (1 + K.PARALLAX*0.15);
      camera.position.y += shakeY * (1 + K.PARALLAX*0.15);
      if(bowMesh) bowMesh.position.x += shakeX * (1 + K.PARALLAX*0.4) *0.3;
      if(sceneryGroup) sceneryGroup.position.x = -shakeX * K.PARALLAX *0.15;
    }
    camera.lookAt(camera.position.x * 0.4, K.EYE_HEIGHT - 0.2, -24);
    // roll with horizontal drag
    var targetRoll = (drag && drag.active) ? clamp(-(drag.dx / denom) * 0.04, -0.04, 0.04) : 0;
    camera.rotation.z += (targetRoll - camera.rotation.z) * Math.min(1, dt * 8);

    // wind flag — wave when windy
    if(windFlag){
      if(Math.abs(windX)>0.3){
        windFlag.visible=true;
        if(windFlagMesh){
          windFlagMesh.rotation.z = Math.sin(Date.now()*0.004)*0.2 + windX*0.15;
          windFlagMesh.scale.y = 0.9+Math.abs(windX)*0.1;
        }
      } else windFlag.visible=false;
    }
    // lightweight weather — rain falls and drifts with wind
    if(rainSystem){
      var rainPos=rainSystem.geometry.attributes.position;
      var arr=rainPos.array;
      for(var ri=0; ri<arr.length; ri+=3){
        arr[ri+1] -= 22*dt + windX*0.3;
        arr[ri] += windX*dt*0.2;
        if(arr[ri+1] < 0) { arr[ri+1]=22+Math.random()*4; arr[ri]=(Math.random()-0.5)*80; arr[ri+2]= -Math.random()*90 -2; }
      }
      rainPos.needsUpdate=true;
    }
    if(bgFar) { bgFar.position.x = Math.sin(Date.now()*0.00008)*2.5; bgFar.position.y = 28 + Math.sin(Date.now()*0.00011)*0.9; } if(bgMid) { bgMid.position.x = Math.sin(Date.now()*0.00012 +1)*1.8; }
    // HUD wind chip
    if(hud.wind){
      if(Math.abs(windX)>0.3){
        hud.wind.style.display='';
        var wv=Math.round(Math.abs(windX)*10)/10;
        var dir=windX>0 ? '→ ' : '← ';
        var elw=hud.wind.querySelector('#hudWind');
        if(elw) elw.textContent=dir+wv+'m/s';
      } else hud.wind.style.display='none';
    }
    if (hud.time) hud.time.textContent = Math.ceil(st.timeLeft);
    if (hud.phase) {
      hud.phase.textContent = st.phase === 'warmup' ? 'Warm-up' : st.phase === 'movers' ? 'Moving!' : 'CHAOS!';
    }

    updateHitParticles(dt);
    updatePreview();
    updatePet(dt);
    updateBow(dt);
  }

  function frame() {
    if(paused){ renderer.render(scene,camera); raf=requestAnimationFrame(frame); return; }
    raf = requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    renderer.render(scene, camera);
  }

  // ============================================================
  // INPUT + HUD
  // ============================================================
  function bindInput() {
    function xy(e) { var p = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e); return { x: p.clientX, y: p.clientY }; }
    function down(e) {
      if(e.target){
        var _tid=e.target.id;
        if(_tid==='pauseBtn' || _tid==='share3dBtn' || _tid==='daily3dBtn' || _tid==='againBtn' || _tid==='resumeBtn' || _tid==='quitBtn') return;
        if(e.target.closest){
          var _btn=e.target.closest('button');
          if(_btn) return;
          var _chip=e.target.closest('.chip');
          if(_chip && _chip.tagName==='BUTTON') return;
        }
      }
      if (e.pointerType === 'touch' || e.touches) e.preventDefault();
      if (W.AUDIO && AUDIO.unlock) AUDIO.unlock();
      if (e.pointerId !== undefined && canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
      var p = xy(e);
      drag = { active: true, sx: p.x, sy: p.y, dx: 0, dy: 0 };
    }
    function move(e) {
      if (!drag.active) return;
      if (e.pointerType === 'touch' || e.touches) e.preventDefault();
      var p = xy(e);
      drag.dx = p.x - drag.sx; drag.dy = p.y - drag.sy;
      if (W.AUDIO && AUDIO.stretch) {
        var denom = pullDenom();
        var len = Math.sqrt(drag.dx * drag.dx + drag.dy * drag.dy);
        if (Math.random() < 0.25) AUDIO.stretch(Math.min(1, len / denom));
      }
    }
    function up(e) {
      if (!drag.active) return;
      if (e.pointerType === 'touch' || e.touches || e.changedTouches) e.preventDefault();
      shoot();
      drag = { active: false, sx: 0, sy: 0, dx: 0, dy: 0 };
      previewDots.visible = false;
      if (previewRibbon) previewRibbon.visible = false;
    }
    canvas.addEventListener('pointerdown', down);
    W.addEventListener('pointermove', move);
    W.addEventListener('pointerup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    W.addEventListener('touchmove', move, { passive: false });
    W.addEventListener('touchend', up, { passive: false });
    W.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!drag.active) {
          drag = { active: true, sx: 0, sy: 0, dx: 0, dy: pullDenom() * 0.65 };
        }
        shoot();
        drag = { active: false, sx: 0, sy: 0, dx: 0, dy: 0 };
        previewDots.visible = false;
        if (previewRibbon) previewRibbon.visible = false;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!drag.active) drag = { active: true, sx: 0, sy: 0, dx: 0, dy: pullDenom() * 0.4 };
        drag.dx -= 18;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!drag.active) drag = { active: true, sx: 0, sy: 0, dx: 0, dy: pullDenom() * 0.4 };
        drag.dx += 18;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!drag.active) drag = { active: true, sx: 0, sy: 0, dx: 0, dy: pullDenom() * 0.4 };
        drag.dy -= 18;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!drag.active) drag = { active: true, sx: 0, sy: 0, dx: 0, dy: pullDenom() * 0.4 };
        drag.dy += 18;
      } else if(e.key==='p' || e.key==='P' || e.key==='Escape'){ e.preventDefault(); togglePause(); }
    });
  }

  function refreshHud() {
    if (!st) return;
    if (hud.score) hud.score.textContent = st.score;
    if (hud.arrows) hud.arrows.textContent = st.arrowsLeft;
    if (hud.combo) hud.combo.textContent = st.combo > 1 ? ('x' + st.combo) : '';
    if (hud.time) hud.time.textContent = Math.ceil(st.timeLeft);
    if (hud.phase) hud.phase.textContent = st.phase === 'warmup' ? 'Warm-up' : st.phase === 'movers' ? 'Moving!' : 'CHAOS!';
    if(hud.overTitle) hud.overTitle.textContent = st.timeLeft<=0 ? 'Time!' : (st.arrowsLeft<=0?'Out of arrows!':'Round Over!');
    if(hud.overCoins) hud.overCoins.textContent = st._coinsEarned||0;
    if(hud.overHigh) hud.overHigh.style.display = st._isHigh?'':'none';
    if(hud.overBest) try{ var p=SAVE.current&&SAVE.current(); hud.overBest.textContent=p?p.highScore:st.score; }catch(e){}
    if(hud.overStreak) try{ var s=SAVE.streakInfo&&SAVE.streakInfo(); hud.overStreak.textContent=s.count?'🔥 Day '+s.count:''; }catch(e){}
    if (hud.over) hud.over.style.display = (st.arrowsLeft <= 0 || st.timeLeft <= 0 || roundOver) ? 'flex' : 'none';
    if (hud.final) hud.final.textContent = st.score;
  }

  function resize() {
    var w = W.innerWidth, h = W.innerHeight;
    renderer.setPixelRatio(Math.min(W.devicePixelRatio || 1, 2));  // the DPR fix the 2D game still needs
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function reset() {
    arrows.forEach(function (a) { if (a.obj.parent) a.obj.parent.remove(a.obj); if(a.trail) scene.remove(a.trail); });
    arrows = [];
    hitParticles.forEach(p=>scene.remove(p.obj)); hitParticles=[];
    roundOver = false;
    rollWind();
    buildTargets();
    buildRain();
    buildBackgroundPlanes(pickBiome());
    st = { score: 0, arrowsLeft: K.ARROWS, combo: 0, hits: 0, elapsed: 0, timeLeft: (typeof TUNING !== 'undefined' ? TUNING.ROUND_SECONDS : 60), phase: 'warmup' };
    drag = { active: false, sx: 0, sy: 0, dx: 0, dy: 0 };
    refreshHud();
    try{ var p=SAVE.current&&SAVE.current(); if(p && hud.best) { hud.best.textContent=p.highScore; hud.bestChip.style.display=''; } }catch(e){}
    // also refresh wind chip immediately
    if(hud.wind){
      if(Math.abs(windX)>0.3){ hud.wind.style.display=''; var wv=Math.round(Math.abs(windX)*10)/10; var dir=windX>0?'→ ':'← '; var elw=hud.wind.querySelector('#hudWind'); if(elw) elw.textContent=dir+wv+'m/s'; } else hud.wind.style.display='none';
    }
    if (hud.time) hud.time.textContent = Math.ceil(st.timeLeft);
    if (hud.phase) hud.phase.textContent = 'Warm-up';
  }

  function start() {
    // Without this, sRGB output washes every flat colour out to pastel.
    // With it, three converts our hex colours properly and the palette holds.
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    canvas = el('c3d');
    hud.score = el('hudScore'); hud.arrows = el('hudArrows'); hud.combo = el('hudCombo');
    hud.time = el('hudTime'); hud.phase = el('hudPhase');
    if (!hud.time) {
      hud.time = document.createElement('span');
      hud.time.id = 'hudTime';
      hud.time.textContent = '60';
      var hudRootTmp = document.querySelector('.hud');
      if (hudRootTmp) {
        var chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = '<small>Time</small>';
        chip.appendChild(hud.time);
        chip.appendChild(document.createTextNode('s'));
        hudRootTmp.insertBefore(chip, hudRootTmp.querySelector('.spacer'));
      }
    }
    if (!hud.phase) {
      hud.phase = document.createElement('div');
      hud.phase.id = 'hudPhase';
      hud.phase.className = 'chip';
      hud.phase.style.opacity = '0.85';
      hud.phase.textContent = 'Warm-up';
      var hudRootTmp2 = document.querySelector('.hud');
      if (hudRootTmp2) hudRootTmp2.insertBefore(hud.phase, hudRootTmp2.querySelector('.spacer'));
    }
    hud.msg = el('hudMsg'); hud.over = el('overPanel'); hud.final = el('finalScore');
    hud.overTitle=el('overTitle'); hud.overCoins=el('overCoins'); hud.overHigh=el('overHigh'); hud.overBest=el('overBest'); hud.overStreak=el('overStreak'); hud.pausePanel=el('pausePanel'); hud.pauseBtn=el('pauseBtn'); hud.resumeBtn=el('resumeBtn'); hud.quitBtn=el('quitBtn');
    if(hud.pauseBtn) hud.pauseBtn.addEventListener('click', togglePause);
    if(hud.resumeBtn) hud.resumeBtn.addEventListener('click', togglePause);
    if(hud.quitBtn) hud.quitBtn.addEventListener('click', quitToMenu);
    // wind HUD chip — appears only when breezy
    hud.wind=document.createElement('div');
    hud.wind.className='chip';
    hud.wind.style.background='rgba(255,60,40,0.85)';
    hud.wind.style.display='none';
    hud.wind.innerHTML='<small>Wind</small><span id="hudWind"></span>';
    var hudRoot=document.querySelector('.hud');
    if(hudRoot) hudRoot.appendChild(hud.wind);
    var bestChip = document.createElement('div'); bestChip.className='chip'; bestChip.style.background='rgba(20,32,44,0.62)'; bestChip.style.display='none'; bestChip.innerHTML='<small>Best</small><span id="hudBest">0</span>'; if(hudRoot) hudRoot.insertBefore(bestChip, hudRoot.querySelector('#hudPhase')||hudRoot.firstChild); hud.best = bestChip.querySelector('#hudBest'); hud.bestChip = bestChip;
    try{ if(typeof SAVE!=='undefined' && SAVE.current){ var _p=SAVE.current(); if(_p && hud.best){ hud.best.textContent=_p.highScore; hud.bestChip.style.display=''; } } }catch(e){}
    hud.shareBtn=el('share3dBtn'); hud.dailyBtn=el('daily3dBtn');
    if(hud.shareBtn) hud.shareBtn.addEventListener('click', function(){
      var data = targets.map(function(t){ return {x:Math.round(t.baseX*10)/10, z:Math.round(t.z), r:Math.round(t.r*100)/100, mover:t.mover}; });
      var code = btoa(JSON.stringify(data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      var url = W.location.href.split('#')[0] + '#3d=' + code;
      if(navigator.clipboard) navigator.clipboard.writeText(url).then(function(){ say('Link copied!'); }, function(){ prompt('Copy link', url); });
      else prompt('Copy link', url);
    });
    if(hud.dailyBtn) hud.dailyBtn.addEventListener('click', function(){
      W.location.hash = 'daily='+todayStr();
      reset();
      buildBackgroundPlanes(pickBiome());
      say('Daily: '+todayStr());
    });
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.outputEncoding = THREE.sRGBEncoding;   // textured models need this or they look muddy
    clock = new THREE.Clock();
    buildScene();
    reset();
    bindInput();
    resize();
    W.addEventListener('resize', resize);
    var again = el('againBtn');
    if (again) again.addEventListener('click', function () { reset(); });
    frame();
  }

  return { start: start, reset: reset, K: K, state: function () { return st; },
           petReal: function () { return !!(pet && pet.real); }, togglePause: togglePause };
})();
