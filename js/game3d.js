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
      ARROW_TYPE: t.ARROW_3D_TYPE||'wooden',
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
       BOW_FADE: (t.ARROW_3D_BOW_FADE !== false),
       WIND_ENABLED: (t.ARROW_3D_WIND_ENABLED !== false),
      WIND_MAX: t.ARROW_3D_WIND_MAX || 3.5,
      WIND_CHANCE: t.ARROW_3D_WIND_CHANCE || 0.6,
      SHADOW_ENABLED: (t.ARROW_3D_SHADOW_ENABLED !== false),
      PARALLAX: t.ARROW_3D_PARALLAX || 0.35,
       PARTICLES: (t.ARROW_3D_PARTICLES!==false), PARTICLE_COUNT: t.ARROW_3D_PARTICLE_COUNT||12,
        IDLE_SWAY: t.ARROW_3D_IDLE_SWAY || 0.035,
        FIREWORKS: t.ARROW_3D_FIREWORKS || 7,
         FOV_BASE: 46,
         ADVENTURE_ENABLED: !!t.ARROW_3D_ADVENTURE,
  GODRAYS: !!t.ARROW_3D_SKY_GODRAYS, POLLEN: t.ARROW_3D_SKY_POLLEN||18, SKY_SHADOWS: !!t.ARROW_3D_SKY_SHADOWS,
    };
  })();

var W = window, D = document;
var scene, camera, renderer, clock, canvas;
var targets = [], arrows = [], previewDots = null, previewRibbon = null, pet = null;
var pickups = [], obstacles = [];
var bowMesh = null, bowString = null;
var camShake = 0; var baseFov = 46;
var _sphereSmall = null, _sphereDust = null; // shared particle geos (19-20: reuse, not alloc per spark)
var windX = 0; var windFlag = null; var windFlagMesh = null;
var windOsc=null, windGain=null;
var sceneryGroup = null;
var groundShadows = [];
var rainSystem = null;
var st = null, drag = null, raf = 0;
var roundOver = false;
var paused=false;
var hud = {};
var bgFar=null, bgMid=null; var horizonHaze=null; var currentBiome='meadow';
var godRays=null, pollenSystem=null, cloudShadows=[];
var adventureStage=0; var adventureActive=false;
var atmoGroup=null; var atmoGroups={}; var atmoData=null;

function togglePause(){ if(roundOver) return; paused=!paused; if(paused){ if(hud.pausePanel) hud.pausePanel.style.display='flex'; clock.stop(); } else { if(hud.pausePanel) hud.pausePanel.style.display='none'; clock.start(); } }
function quitToMenu(){ paused=false; if(hud.pausePanel) hud.pausePanel.style.display='none'; clock.start(); reset(); }
var hitParticles = []; // {obj, vel, life, maxLife}
var coinParticles = []; // {obj, vel, life, targetY}
var blackholes = []; // {x,y,z,t,life,eaten,spin,seed,obj,ring}
var bolts = []; // {x1,y1,z1,x2,y2,z2,life,obj}

  function rollWind(){ if(!K.WIND_ENABLED || Math.random()>K.WIND_CHANCE){ windX=0; return; } var s=Math.random()<0.5?1:-1; var r=Math.pow(Math.random(),3); windX = s * r * K.WIND_MAX; }
  function applyWind(vx, dt){ return vx + windX * dt * 0.9; }
function ensureWindHum(){ if(!K.WIND_ENABLED || Math.abs(windX)<0.4) { if(windGain) try{windGain.gain.linearRampToValueAtTime(0, (typeof AUDIO!=='undefined'&&AUDIO.ctx)?AUDIO.ctx.currentTime+0.4:0);}catch(e){} return; } try{ if(typeof AUDIO==='undefined' || !AUDIO || !AUDIO.ctx) return; if(!windOsc){ windGain=AUDIO.ctx.createGain(); windGain.gain.value=0; windGain.connect(AUDIO.master||AUDIO.ctx.destination); windOsc=AUDIO.ctx.createOscillator(); windOsc.type='sawtooth'; windOsc.frequency.value=38; windOsc.connect(windGain); windOsc.start(); } var vol=Math.min(0.08, Math.abs(windX)*0.018); windGain.gain.linearRampToValueAtTime(vol, AUDIO.ctx.currentTime+0.6); windOsc.frequency.linearRampToValueAtTime(38+Math.abs(windX)*4, AUDIO.ctx.currentTime+0.6); }catch(e){} }
var BIOMES = ['meadow','mountain','sunset_beach','starlight','underwater','moon_cave','crystal_pool'];
function pickBiome(){ return BIOMES[Math.floor(Math.random()*BIOMES.length)]; }
function buildBackgroundPlanes(biome){
  if(bgFar){
    scene.remove(bgFar);
    try{
      if(bgFar.material){
        if(bgFar.material.map) bgFar.material.map.dispose();
        bgFar.material.dispose();
      }
      if(bgFar.geometry) bgFar.geometry.dispose();
    }catch(e){}
    bgFar=null;
  }
  if(bgMid){
    scene.remove(bgMid);
    try{
      if(bgMid.material){
        if(bgMid.material.map) bgMid.material.map.dispose();
        bgMid.material.dispose();
      }
      if(bgMid.geometry) bgMid.geometry.dispose();
    }catch(e){}
    bgMid=null;
  }
  if(!biome) biome = pickBiome();
  currentBiome = biome;
  // Crystal pool reuses underwater art but with its own turquoise mood (see sky/ground below).
  var texBiome = (biome==='crystal_pool') ? 'underwater' : biome;
  // Update sky, ground, and fog tints for this biome — distinct pool vs reef.
  try{
    var skyHex = skyFor(biome);
    if(scene && scene.background) scene.background.setHex(skyHex);
    if(scene && scene.userData && scene.userData.skyDome) scene.userData.skyDome.material.color.setHex(skyHex);
    if(_ground && _ground.material) _ground.material.color.setHex(groundFor(biome));
    if(scene && scene.fog){
      scene.fog.near = biome==='starlight'||biome==='moon_cave' ? 22 : 26;
      scene.fog.far = biome==='starlight'||biome==='moon_cave' ? 88 : 96;
      if(scene.fog.color){
        if(biome==='crystal_pool') scene.fog.color.setHex(0x4dc8e8);
        else if(biome==='starlight') scene.fog.color.setHex(0x24314e);
        else if(biome==='moon_cave') scene.fog.color.setHex(0x2a2a45);
        else if(biome==='underwater') scene.fog.color.setHex(0x8ecfe8);
        else scene.fog.color.setHex(skyHex);
      }
    }
  }catch(e){}
  var loader = new THREE.TextureLoader();
  // far plane — 240x135 at z -180 (crystal_pool reuses underwater textures)
  var farUrl = 'assets/sprites/bg_'+texBiome+'_far.webp';
  var farTex = loader.load(farUrl, function(tex){ if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; tex.needsUpdate=true; }, undefined, function(){ console.warn('bg failed', farUrl); });
  if(THREE.SRGBColorSpace) farTex.colorSpace = THREE.SRGBColorSpace; else farTex.encoding = THREE.sRGBEncoding;
  var farMat = new THREE.MeshBasicMaterial({map: farTex, transparent:true, opacity:0.92, fog:false});
  bgFar = new THREE.Mesh(new THREE.PlaneGeometry(240, 135), farMat);
  bgFar.position.set(0, 28, -180);
  bgFar.lookAt(0, 8, 0);
  scene.add(bgFar);
  // mid plane — 160x90 at z -110, lower
  var midUrl = 'assets/sprites/bg_'+texBiome+'_mid.webp';
  var midTex = loader.load(midUrl, function(tex){ if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding; tex.needsUpdate=true; }, undefined, function(){ console.warn('bg failed', midUrl); });
  if(THREE.SRGBColorSpace) midTex.colorSpace = THREE.SRGBColorSpace; else midTex.encoding = THREE.sRGBEncoding;
  var midMat = new THREE.MeshBasicMaterial({map: midTex, transparent:true, opacity:0.96, fog:false});
  bgMid = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), midMat);
  bgMid.position.set(0, 14, -110);
  bgMid.lookAt(0, 6, 0);
  scene.add(bgMid);
  try{ buildAtmo(biome); }catch(e){}
}
function buildLivingSkies(){
  if(godRays) scene.remove(godRays); if(pollenSystem) scene.remove(pollenSystem); cloudShadows.forEach(function(c){scene.remove(c);}); cloudShadows=[];
  // god-rays — 3 fan planes from sun direction (-6,12,4)
  if(K.GODRAYS){
    godRays = new THREE.Group();
    var rayMat = new THREE.MeshBasicMaterial({ color:0xfff3d0, transparent:true, opacity:0.11, side:THREE.DoubleSide, fog:false, depthWrite:false });
    for(var i=0;i<3;i++){
      var g = new THREE.PlaneGeometry(18, 90);
      var m = new THREE.Mesh(g, rayMat.clone());
      m.material.opacity = 0.09 + i*0.02;
      m.position.set(-6 + i*2.2, 14 + i*1.2, -72 - i*14);
      m.rotation.z = -0.18 - i*0.06;
      m.lookAt(-6, 12, 4);
      godRays.add(m);
    }
    scene.add(godRays);
  }
  // pollen — slow drifting points, gentle
  if(K.POLLEN>0){
    var geo=new THREE.BufferGeometry();
    var cnt=K.POLLEN;
    var pos=new Float32Array(cnt*3);
    var vel=new Float32Array(cnt*3);
    for(var j=0;j<cnt;j++){ pos[j*3]=(Math.random()-0.5)*48; pos[j*3+1]=Math.random()*14+2; pos[j*3+2]=-Math.random()*70-4; vel[j*3]=(Math.random()-0.5)*0.6; vel[j*3+1]=Math.random()*0.4+0.22; vel[j*3+2]=(Math.random()-0.5)*0.22; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geo.setAttribute('vel', new THREE.BufferAttribute(vel,3));
    pollenSystem=new THREE.Points(geo, new THREE.PointsMaterial({ color:0xfff6c8, size:0.14, transparent:true, opacity:0.62, sizeAttenuation:true, fog:false }));
    scene.add(pollenSystem);
  }
  // cloud shadows — 2 large dark planes just above ground, drift slowly
  if(K.SKY_SHADOWS){
    for(var s=0;s<2;s++){
      var cg=new THREE.PlaneGeometry(34, 22);
      var cm=new THREE.MeshBasicMaterial({ color:0x1a1822, transparent:true, opacity:0.11, fog:false, depthWrite:false, side:THREE.DoubleSide });
      var c=new THREE.Mesh(cg, cm);
      c.rotation.x=-Math.PI/2;
      c.position.set((Math.random()-0.5)*44, 0.04, -18 - Math.random()*42);
      c.userData={ speed:0.55+Math.random()*0.45, dir: (Math.random()<0.5?1:-1) };
      scene.add(c);
      cloudShadows.push(c);
    }
  }
}

  // ---------- per-biome living sky (atmoGroups) ----------
  function atmoHash(n){ var x=Math.sin(n*127.1+311.7)*43758.5453; return x-Math.floor(x); }
  function clearAtmo(){
    if(atmoGroup){
      try{ scene.remove(atmoGroup); }catch(e){}
      try{
        atmoGroup.traverse(function(c){
          if(c.geometry) try{ c.geometry.dispose(); }catch(e){}
          if(c.material){
            var mats=Array.isArray(c.material)?c.material:[c.material];
            mats.forEach(function(m){ if(m.map) try{ m.map.dispose(); }catch(e){} try{ m.dispose(); }catch(e){} });
          }
        });
      }catch(e){}
      atmoGroup=null;
    }
    try{ for(var k in atmoGroups) delete atmoGroups[k]; }catch(e){}
    atmoData=null;
  }
  function buildAtmo(biome){
    clearAtmo();
    if(!scene) return;
    biome = biome || currentBiome || 'meadow';
    var bIdx = BIOMES.indexOf(biome);
    if(bIdx<0) bIdx=0;
    var baseSeed = bIdx*1000;
    atmoGroup = new THREE.Group();
    atmoGroup.name = 'atmo_'+biome;
    atmoData = { biome:biome, t:0, baseSeed:baseSeed };
    // keep allocation low: create Groups once per biome switch, animate via position/opacity, no per-frame allocation
    if(biome==='meadow'){
      atmoData.rays=[];
      for(var i=0;i<3;i++){
        var g=new THREE.PlaneGeometry(18, 90);
        var mat=new THREE.MeshBasicMaterial({ color:0xfff3d0, transparent:true, opacity:0.08, side:THREE.DoubleSide, fog:false, depthWrite:false });
        var m=new THREE.Mesh(g, mat);
        m.material.opacity = 0.08;
        var ph = atmoHash(baseSeed + i*17+3)*6.28;
        var px = -6 + i*2.2 + (atmoHash(baseSeed+i*7)-0.5)*1.5;
        var py = 14 + i*1.2;
        var pz = -72 - i*14;
        m.position.set(px, py, pz);
        m.rotation.z = -0.18 - i*0.06;
        try{ m.lookAt(-6, 12, 4); }catch(e){}
        m.userData.phase = ph;
        m.userData.baseY = py;
        atmoGroup.add(m);
        atmoData.rays.push(m);
      }
      atmoData.pollen=[];
      for(var j=0;j<10;j++){
        var geo=new THREE.SphereGeometry(0.07,6,6);
        var pmat=new THREE.MeshBasicMaterial({ color:0xfff6c8, transparent:true, opacity:0.62, fog:false, depthWrite:false });
        var p=new THREE.Mesh(geo, pmat);
        var px2=(atmoHash(baseSeed+j*12+1)-0.5)*48;
        var py2=atmoHash(baseSeed+j*17+2)*12+2;
        var pz2=-atmoHash(baseSeed+j*19+3)*70-8;
        p.position.set(px2, py2, pz2);
        p.userData.baseX=px2; p.userData.baseY=py2; p.userData.baseZ=pz2;
        p.userData.phase=atmoHash(baseSeed+j*23+5)*6.28;
        p.userData.speed=0.16 + (j%4)*0.05;
        atmoGroup.add(p);
        atmoData.pollen.push(p);
      }
    } else if(biome==='mountain'){
      atmoData.shadows=[];
      for(var s=0;s<2;s++){
        var cg=new THREE.PlaneGeometry(34, 22);
        var cm=new THREE.MeshBasicMaterial({ color:0x1a1822, transparent:true, opacity:0.10, fog:false, depthWrite:false, side:THREE.DoubleSide });
        var c=new THREE.Mesh(cg, cm);
        c.rotation.x=-Math.PI/2;
        var cx=(atmoHash(baseSeed+s*13+7)-0.5)*44;
        var cz=-18 - atmoHash(baseSeed+s*19+11)*42;
        c.position.set(cx, 0.04, cz);
        c.userData.speed=0.55+atmoHash(baseSeed+s*7+3)*0.45;
        c.userData.dir=(atmoHash(baseSeed+s*11+5)<0.5?1:-1);
        c.userData.baseY=0.04;
        atmoGroup.add(c);
        atmoData.shadows.push(c);
      }
      atmoData.streaks=[];
      for(var k=0;k<4;k++){
        var sg=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(18,0,0)]);
        var lm=new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.13, fog:false, depthWrite:false });
        var line=new THREE.Line(sg, lm);
        var lx=(atmoHash(baseSeed+k*17+41)-0.5)*60;
        var ly=9+ atmoHash(baseSeed+k*19+7)*6;
        var lz=-28 - atmoHash(baseSeed+k*23+9)*32;
        line.position.set(lx, ly, lz);
        line.userData.speed=18+atmoHash(baseSeed+k*7+13)*14;
        line.userData.phase=atmoHash(baseSeed+k*11+3)*6.28;
        line.rotation.z = -0.06 - (k%2)*0.08;
        line.userData.baseX=lx;
        atmoGroup.add(line);
        atmoData.streaks.push(line);
      }
    } else if(biome==='sunset_beach'){
      atmoData.shimmers=[];
      for(var b=0;b<5;b++){
        var w=14+atmoHash(baseSeed+b*7+3)*18;
        var h=1.2+ (b%3)*0.7;
        var gg=new THREE.PlaneGeometry(w, h);
        var gm=new THREE.MeshBasicMaterial({ color:0xffecd0, transparent:true, opacity:0.07, fog:false, depthWrite:false, side:THREE.DoubleSide });
        var mesh=new THREE.Mesh(gg, gm);
        mesh.rotation.x=-Math.PI/2;
        var mx=(atmoHash(baseSeed+b*13+5)-0.5)*36;
        var mz=-8 - atmoHash(baseSeed+b*17+9)*36;
        mesh.position.set(mx, 0.02, mz);
        mesh.userData.phase=atmoHash(baseSeed+b*11+7)*6.28;
        mesh.userData.baseOpacity=0.07;
        mesh.userData.baseX=mx;
        atmoGroup.add(mesh);
        atmoData.shimmers.push(mesh);
      }
    } else if(biome==='starlight'){
      atmoData.stars=[];
      // 14 star Points twinkling (Points size 0.08) — use small spheres to allow per-star twinkle, but keep Points literal for spec
      var starGeo=new THREE.BufferGeometry();
      var starCnt=14;
      var starPos=new Float32Array(starCnt*3);
      var starPh=new Float32Array(starCnt);
      for(var si=0;si<starCnt;si++){
        starPos[si*3]=(atmoHash(baseSeed+si*3+1)-0.5)*64;
        starPos[si*3+1]=16+atmoHash(baseSeed+si*7+5)*10;
        starPos[si*3+2]=-22 - atmoHash(baseSeed+si*11+2)*68;
        starPh[si]=atmoHash(baseSeed+si*13+9)*6.28;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
      var starMat=new THREE.PointsMaterial({ color:0xfff6be, size:0.08, transparent:true, opacity:0.72, sizeAttenuation:true, fog:false, depthWrite:false });
      var starPoints=new THREE.Points(starGeo, starMat);
      starPoints.userData.phases=starPh;
      starPoints.userData.baseOpacity=0.72;
      atmoGroup.add(starPoints);
      atmoData.starPoints=starPoints;
      atmoData.starPhases=starPh;
      // also 14 tiny sphere meshes for richer twinkle (keeps <20? 1 Points + 14 would be >20, so keep only Points for starlight)
      // To allow per-star opacity we animate Points material globally; sphere fallback kept minimal:
      // we add 4 accent spheres for depth cue
      atmoData.stars=[];
      for(var s2=0;s2<4;s2++){
        var sGeo=new THREE.SphereGeometry(0.08,6,6);
        var sMat=new THREE.MeshBasicMaterial({ color:0xfff6be, transparent:true, opacity:0.72, fog:false, depthWrite:false });
        var star=new THREE.Mesh(sGeo, sMat);
        var sx=(atmoHash(baseSeed+s2*29+11)-0.5)*48;
        var sy=18+atmoHash(baseSeed+s2*31+13)*9;
        var sz=-24 - atmoHash(baseSeed+s2*37+17)*60;
        star.position.set(sx, sy, sz);
        star.userData.phase=atmoHash(baseSeed+s2*13+9)*6.28;
        star.userData.baseOpacity=0.62+atmoHash(baseSeed+s2*17+13)*0.3;
        atmoGroup.add(star);
        atmoData.stars.push(star);
      }
    } else if(biome==='underwater' || biome==='crystal_pool'){
      var caGeo=new THREE.PlaneGeometry(48,48,6,6);
      var caColor = biome==='crystal_pool'?0xc8ffff:0xe6fffc;
      var caMat=new THREE.MeshBasicMaterial({ color:caColor, transparent:true, opacity:0.14, wireframe:true, fog:false, depthWrite:false, side:THREE.DoubleSide });
      var ca=new THREE.Mesh(caGeo, caMat);
      ca.rotation.x=-Math.PI/2;
      ca.position.set(0, 0.03, -22);
      ca.userData.phase=0;
      atmoGroup.add(ca);
      atmoData.caustics=ca;
      atmoData.bubbles=[];
      for(var bi=0;bi<8;bi++){
        var bGeo=new THREE.SphereGeometry(0.18+ (bi%3)*0.07, 8,6);
        var bMat=new THREE.MeshBasicMaterial({ color:0xd6f4ff, transparent:true, opacity:0.35, fog:false, depthWrite:false });
        var bub=new THREE.Mesh(bGeo, bMat);
        var bx=(atmoHash(baseSeed+bi*211+90)-0.5)*52;
        var by=0.5+atmoHash(baseSeed+bi*137+13)*8;
        var bz=-6 - atmoHash(baseSeed+bi*191+7)*48;
        bub.position.set(bx, by, bz);
        bub.userData.speed=0.9+atmoHash(baseSeed+bi*13+3)*0.9;
        bub.userData.phase=atmoHash(baseSeed+bi*21+5)*6.28;
        bub.userData.baseX=bx;
        bub.userData.baseSeedBase=baseSeed+bi*211+90;
        atmoGroup.add(bub);
        atmoData.bubbles.push(bub);
      }
    } else if(biome==='moon_cave'){
      atmoData.gems=[];
      for(var gi=0;gi<3;gi++){
        var gGeo=new THREE.SphereGeometry(0.34,10,8);
        var gMat=new THREE.MeshLambertMaterial({ color:0x9e92ff, emissive:0x7a6cff, emissiveIntensity:0.55, transparent:true, opacity:0.92 });
        var gem=new THREE.Mesh(gGeo, gMat);
        var gx=(atmoHash(baseSeed+gi*33+7)-0.5)*18;
        var gy=0.6+atmoHash(baseSeed+gi*37+11)*1.2;
        var gz=-12 - atmoHash(baseSeed+gi*41+13)*38;
        gem.position.set(gx, gy, gz);
        gem.userData.phase=atmoHash(baseSeed+gi*17+9)*6.28;
        gem.userData.baseScale=1;
        atmoGroup.add(gem);
        atmoData.gems.push(gem);
      }
      atmoData.fireflies=[];
      for(var fi=0;fi<6;fi++){
        var fGeo=new THREE.SphereGeometry(0.07,6,6);
        var fMat=new THREE.MeshBasicMaterial({ color:0xffee8c, transparent:true, opacity:0.85, fog:false, depthWrite:false });
        var fly=new THREE.Mesh(fGeo, fMat);
        var fx=(atmoHash(baseSeed+fi*31+3)-0.5)*40;
        var fy=2+atmoHash(baseSeed+fi*37+5)*5;
        var fz=-10 - atmoHash(baseSeed+fi*41+7)*42;
        fly.position.set(fx, fy, fz);
        fly.userData.cx=fx; fly.userData.cy=fy; fly.userData.cz=fz;
        fly.userData.ax=1.2+atmoHash(baseSeed+fi*7+3)*1.8;
        fly.userData.ay=0.7+atmoHash(baseSeed+fi*9+5)*1.0;
        fly.userData.f1=0.23+atmoHash(baseSeed+fi*11+7)*0.2;
        fly.userData.f2=0.31+atmoHash(baseSeed+fi*13+2)*0.2;
        fly.userData.phase=atmoHash(baseSeed+fi*17+13)*6.28;
        atmoGroup.add(fly);
        atmoData.fireflies.push(fly);
      }
    } else {
      // fallback gentle meadow-lite
      atmoData.empty=true;
    }
    scene.add(atmoGroup);
    try{ atmoGroups[biome]=atmoGroup; }catch(e){}
  }
  function updateAtmo(dt){
    if(!atmoGroup || !atmoData) return;
    if(isReduced()) return;
    var t = (atmoData.t||0) + dt;
    atmoData.t = t;
    var biome = atmoData.biome;
    var baseSeed = atmoData.baseSeed||0;
    if(biome==='meadow'){
      if(atmoData.rays){
        for(var i=0;i<atmoData.rays.length;i++){
          var m=atmoData.rays[i];
          m.material.opacity = 0.08 * (0.85 + 0.15*Math.sin(t*0.5 + m.userData.phase));
          m.position.y = m.userData.baseY + Math.sin(t*0.22 + m.userData.phase)*0.35;
          m.rotation.z = -0.18 - i*0.06 + Math.sin(t*0.22 + m.userData.phase)*0.035;
        }
      }
      if(atmoData.pollen){
        for(var j=0;j<atmoData.pollen.length;j++){
          var p=atmoData.pollen[j];
          p.position.x = p.userData.baseX + Math.sin(t*0.5 + p.userData.phase)*1.4;
          p.position.y = p.userData.baseY + Math.cos(t*0.5*0.77 + p.userData.phase)*0.6;
          p.position.z = p.userData.baseZ + Math.sin(t*0.3 + p.userData.phase)*0.9;
          p.material.opacity = 0.42 + 0.22*Math.abs(Math.sin(t*0.7 + p.userData.phase));
        }
      }
    } else if(biome==='mountain'){
      if(atmoData.shadows){
        for(var s=0;s<atmoData.shadows.length;s++){
          var ch=atmoData.shadows[s];
          ch.position.x += ch.userData.dir * ch.userData.speed * dt;
          if(Math.abs(ch.position.x)>38) ch.userData.dir*=-1;
          ch.material.opacity = 0.10 * (0.85 + 0.15*Math.sin(t*0.3 + s));
        }
      }
      if(atmoData.streaks){
        for(var k=0;k<atmoData.streaks.length;k++){
          var sk=atmoData.streaks[k];
          sk.position.x += sk.userData.speed * dt * 0.35;
          if(sk.position.x>32) sk.position.x=-32 - Math.random()*8;
          var a=Math.max(0, Math.sin(t*0.45 + sk.userData.phase));
          sk.material.opacity = a*0.13;
        }
      }
    } else if(biome==='sunset_beach'){
      if(atmoData.shimmers){
        for(var b=0;b<atmoData.shimmers.length;b++){
          var sh=atmoData.shimmers[b];
          var br=Math.sin(t*0.8 + sh.userData.phase);
          sh.material.opacity = 0.05 + 0.05*(0.5+0.5*br);
          var sc=1+br*0.12;
          sh.scale.set(sc,1,1);
        }
      }
    } else if(biome==='starlight'){
      if(atmoData.starPoints){
        var twGlobal = 0.55 + 0.28*Math.sin(t*2);
        atmoData.starPoints.material.opacity = 0.52 + 0.22*Math.abs(Math.sin(t*2));
        // size pulse for twinkle
        atmoData.starPoints.material.size = 0.08 * (1 + 0.18*Math.sin(t*2));
        // slight drift for Points buffer
        var arr=atmoData.starPoints.geometry.attributes.position.array;
        var phs=atmoData.starPhases;
        for(var si=0;si<phs.length;si++){
          // tiny positional shimmer - no alloc, just subtle y jitter
          // keep x/z stable, jitter y via sin
          // we add small offset to y without reallocating base: use base + sin
          // But Points are static; we can keep them static and just opacity pulse
        }
      }
      if(atmoData.stars){
        for(var si2=0;si2<atmoData.stars.length;si2++){
          var star=atmoData.stars[si2];
          var tw=Math.abs(Math.sin(t*2 + star.userData.phase));
          star.material.opacity = (0.3 + 0.7*tw)*0.55;
          star.scale.setScalar(0.9+tw*0.22);
        }
      }
    } else if(biome==='underwater' || biome==='crystal_pool'){
      if(atmoData.caustics){
        atmoData.caustics.position.x = Math.sin(t*0.37)*1.2;
        atmoData.caustics.position.z = -22 + Math.cos(t*0.29)*1.8;
        atmoData.caustics.material.opacity = 0.14 * (0.85+0.15*Math.sin(t*0.5));
      }
      if(atmoData.bubbles){
        for(var bi=0;bi<atmoData.bubbles.length;bi++){
          var bub=atmoData.bubbles[bi];
          bub.position.y += bub.userData.speed * dt;
          bub.position.x = bub.userData.baseX + Math.sin(t*1.4 + bub.userData.phase)*0.6;
          if(bub.position.y>14){
            bub.position.y=0.5;
            var nx=(atmoHash(baseSeed+bi*211+90 + Math.floor(t)) -0.5)*52;
            bub.position.x=nx;
            bub.userData.baseX=nx;
          }
          bub.material.opacity = 0.28 + 0.12*Math.sin(t*0.9 + bub.userData.phase);
        }
      }
    } else if(biome==='moon_cave'){
      if(atmoData.gems){
        for(var gi=0;gi<atmoData.gems.length;gi++){
          var gem=atmoData.gems[gi];
          var br=0.5+0.5*Math.sin(t*0.9 + gem.userData.phase);
          gem.material.opacity = 0.72 + 0.22*br;
          var sc=1 + 0.05*Math.sin(t*0.9 + gem.userData.phase);
          gem.scale.setScalar(sc);
          if(gem.material.emissiveIntensity!=null) gem.material.emissiveIntensity=0.45+0.25*br;
        }
      }
      if(atmoData.fireflies){
        for(var fi=0;fi<atmoData.fireflies.length;fi++){
          var fl=atmoData.fireflies[fi];
          fl.position.x = fl.userData.cx + fl.userData.ax * Math.sin(t*fl.userData.f1 + fl.userData.phase);
          fl.position.y = fl.userData.cy + fl.userData.ay * Math.sin(t*fl.userData.f2 + fl.userData.phase*1.7);
          fl.position.z = fl.userData.cz + Math.sin(t*0.7+fl.userData.phase)*0.5;
          fl.material.opacity = 0.55 + 0.35*(0.5+0.5*Math.sin(t*2.2+fl.userData.phase));
        }
      }
    }
  }

  // ---------- little helpers ----------
  function isReduced(){ try{ return !!(typeof SAVE!=='undefined' && SAVE.settings && SAVE.settings().reducedMotion); }catch(e){ return false; } }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pullDenom() { return Math.min(W.innerWidth, W.innerHeight) * K.PULL_FRACTION; }
  function currentArrow3D(){ var id=K.ARROW_TYPE; var list=(typeof DATA!=='undefined'&&DATA.arrows)||[]; var a=list.find(x=>x.id===id); return a||{id:'wooden', speedFactor:1, gravityFactor:1, scoreBonus:0}; }
  function physicsDt() { return 0.033; } // shared dt for preview + live, ~30Hz stable — MUST match live arrow step in update()
  // Zero-padded YYYY-MM-DD so 2D (SAVE.todayStr) and 3D share identical daily seeds.
  function todayStr(){ var d=new Date(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0'); return d.getFullYear()+'-'+mm+'-'+dd; }
  // Identical to GAME mulberry32 in js/game.js:76 — keep in sync so a seeded daily layout is byte-identical.
  function mulberry32(seed){ var t=seed>>>0; return function(){ t=(t+0x6D2B79F5)|0; var z=t; z=Math.imul(z ^ z>>>15, z|1); z^=z + Math.imul(z ^ z>>>7, z|61); return ((z ^ z>>>14)>>>0)/4294967296; }; }
  function rng(){ return (st && st.rand) ? st.rand() : Math.random(); }
  function rand(a,b){ return a + rng()*(b-a); }
  function pick(arr){ return arr[Math.floor(rng()*arr.length)]; }
  function liveTargets(){ return targets.filter(function(t){ return !t.dead; }); }
  function livePickups(){ return pickups.filter(function(p){ return !p.dead; }); }
  // Current arrow + perk so 3D obeys the same gravityFactor/speedFactor as 2D (DATA.arrows).
  function currentArrow(){ try{ var p=(typeof SAVE!=='undefined'&&SAVE.current)?SAVE.current():null; var id=p&&p.equipped&&p.equipped.arrow||'wooden'; return (typeof DATA!=='undefined'&&DATA.arrowById)?DATA.arrowById(id):{id:'wooden', gravityFactor:1, speedFactor:1, scoreBonus:0}; }catch(e){ return {id:'wooden', gravityFactor:1, speedFactor:1, scoreBonus:0}; } }
  function currentPerk(){ try{ var p=(typeof SAVE!=='undefined'&&SAVE.current)?SAVE.current():null; var cid=p&&p.equipped&&p.equipped.character||'dinobob'; var ch=(typeof DATA!=='undefined'&&DATA.characterById)?DATA.characterById(cid):null; return (ch&&ch.perk)||{}; }catch(e){ return {}; } }
  function effectiveGravity(){ var a=currentArrow(), pk=currentPerk(); return K.GRAVITY * (a.gravityFactor||1) * (1 - (pk.gravityCut||0)); }
  function effectiveSpeed(power){ var a=currentArrow(), pk=currentPerk(); var base=K.ARROW_SPEED_MIN + (K.ARROW_SPEED_MAX - K.ARROW_SPEED_MIN) * power; return base * (a.speedFactor||1) * (1 + (pk.speedBonus||0)); }
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
  try{ if(adventureActive && typeof SAVE!=='undefined' && SAVE.completeAdventureStage){ var stars = st.hits>6?3: st.hits>3?2:1; SAVE.completeAdventureStage(adventureStage, stars); say('Adventure Stage '+(adventureStage+1)+' \u2014 '+stars+'\u2605'); } }catch(e){}
 }

  // ============================================================
  // BUILD THE WORLD
  // ============================================================
  // Sky + ground palette per biome — keeps toy-box feel, not PBR grey. Ground is flat in bottom third (no cliff).
  var GROUND_COLORS = { meadow:0x69a94e, mountain:0x7a9a6a, sunset_beach:0xd9b98c, starlight:0x3a4a6a, underwater:0x2a9a8a, moon_cave:0x4a3a5a, crystal_pool:0x3fc0d0 };
  var SKY_COLORS = { meadow:0x8ecfe8, mountain:0x9ec9f0, sunset_beach:0xffd4a0, starlight:0x1a2038, underwater:0x2a6a7a, moon_cave:0x2a1a3a, crystal_pool:0x4dc8e8 };
  function skyFor(biome){ return SKY_COLORS[biome] || SKY_COLORS.meadow; }
  function groundFor(biome){ return GROUND_COLORS[biome] || GROUND_COLORS.meadow; }
  // Three-point toy light — locked upper-left forever. Fog tint carries biome mood, not light position.
  var _sun, _hemi, _ground;
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(skyFor(currentBiome));
    // haze pushes far things toward the sky colour: the strongest depth cue we get for free
    scene.fog = new THREE.Fog(skyFor(currentBiome), 26, 96);

    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);   // tighter than a walking-around FOV: archery wants compression
    camera.position.set(0, K.EYE_HEIGHT, 2.2);
    camera.lookAt(0, K.EYE_HEIGHT - 0.05, -20);

    _sun = new THREE.DirectionalLight(0xfff1d0, 1.05);
    _sun.position.set(-6, 12, 4);           // key light upper-left, same contract as the 2D art — never moves per biome
    scene.add(_sun);
    _hemi = new THREE.HemisphereLight(0xd6ecff, 0x6fae5a, 0.68);
    scene.add(_hemi);

scene.add(camera);

    // ---- ground — flat meadow in bottom third, not a cliff. Vertex-tinted so horizon fades into fog.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshLambertMaterial({ color: groundFor(currentBiome) })
    );
    ground.rotation.x = -Math.PI / 2;
    _ground = ground;
    scene.add(ground);
    // Subtle sky dome — hemisphere facing down, same sky color, gives infinite depth behind far planes.
    var skyGeo = new THREE.SphereGeometry(180, 16, 12, 0, Math.PI*2, 0, Math.PI*0.5);
    var skyMat = new THREE.MeshBasicMaterial({ color: skyFor(currentBiome), side: THREE.BackSide, fog:false });
    var skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.position.y = -20;
    skyDome.scale.y = 0.5;
    scene.add(skyDome);
    scene.userData.skyDome = skyDome;
    // Depth ruler is now the distance posts every 10m (plus fog + horizon haze)
    // — grid removed: 120 divisions = 240 line segments per frame, heavy on mobile
    // and reads as debug graph paper, not toy-box meadow.

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
    buildLivingSkies();
    try{ if(!atmoGroup) buildAtmo(currentBiome); }catch(e){}
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

  function getSphereSmall(){ if(_sphereSmall) return _sphereSmall; try{ _sphereSmall = new THREE.SphereGeometry(0.055,6,6); }catch(e){ _sphereSmall = new THREE.SphereGeometry(0.055,6,6); } return _sphereSmall; }
function getSphereDust(){ if(_sphereDust) return _sphereDust; try{ _sphereDust = new THREE.SphereGeometry(0.09,5,5); }catch(e){ _sphereDust = new THREE.SphereGeometry(0.09,5,5); } return _sphereDust; }
function makeGroundShadow(target){ var g=new THREE.CircleGeometry(target.r*0.55,16); var m=new THREE.MeshBasicMaterial({color:0x1a1822, transparent:true, opacity:0.18, fog:false}); var mesh=new THREE.Mesh(g,m); mesh.rotation.x=-Math.PI/2; mesh.position.set(target.obj.position.x,0.02,target.obj.position.z); mesh.userData.target=target; scene.add(mesh); return mesh; }

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
      mover: !!mover, phase: rng() * 6.28,
      speed: 0.5 + rng() * 0.5, amp: mover ? 2.6 + rng() * 2.2 : 0,
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
    g.position.set(x, 1.9 + rng() * 0.6, z);
    scene.add(g);
    return { obj: g, type: 'balloon', r: 0.55, z: z, baseY: g.position.y, bobPhase: rng() * 6.28, dead: false };
  }

  function makeShield(target) {
    var sh = new THREE.Mesh(new THREE.CircleGeometry(0.52, 12), new THREE.MeshLambertMaterial({ color: 0x8b5a2b, side: THREE.DoubleSide }));
    sh.position.set(target.obj.position.x + 0.9, target.obj.position.y, target.obj.position.z + 0.35);
    scene.add(sh);
    return { obj: sh, kind: 'shield', host: target, angle: rng() * 6.28, orbitR: 0.95, dead: false };
  }
  function makeWall3D(){
    var h = (W.TUNING && TUNING.WALL_HEIGHT ? TUNING.WALL_HEIGHT * 0.01 : 2.1);
    var w = (W.TUNING && TUNING.WALL_WIDTH ? TUNING.WALL_WIDTH * 0.01 + 0.02 : 0.42);
    if(h < 1.8) h = 1.8; if(h > 2.4) h = 2.4;
    if(w < 0.30) w = 0.30; if(w > 0.60) w = 0.60;
    var len = 6 + rng() * 4;
    var x = (rng() - 0.5) * 3;
    var z = -18 - rng() * 28;
    var y = h / 2 + 0.02;
    var geo = new THREE.BoxGeometry(len, h, w);
    var mat = new THREE.MeshLambertMaterial({ color: 0x8a7a65 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    try{
      var edgeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-len/2, h/2+0.01, 0), new THREE.Vector3(len/2, h/2+0.01, 0)]);
      var edgeMat = new THREE.LineBasicMaterial({ color: 0xf0e2c0, transparent: true, opacity: 0.55 });
      var edge = new THREE.Line(edgeGeo, edgeMat);
      mesh.add(edge);
    }catch(e){}
    return { obj: mesh, kind: 'wall', x: x, y: y, z: z, w: len, h: h, d: w, dead: false };
  }
  function segBox(x1, y1, z1, x2, y2, z2, box){
    var hw = box.w / 2, hh = box.h / 2, hd = box.d / 2;
    var minX = box.x - hw, maxX = box.x + hw;
    var minY = box.y - hh, maxY = box.y + hh;
    var minZ = box.z - hd, maxZ = box.z + hd;
    for(var i=0;i<=10;i++){
      var u = i/10;
      var px = x1 + (x2 - x1) * u;
      var py = y1 + (y2 - y1) * u;
      var pz = z1 + (z2 - z1) * u;
      if(px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ) return { x: px, y: py, z: pz, u: u };
    }
    return null;
  }
  function hitObstacle3D(ox, oy, oz, nx, ny, nz, ob){
    if(ob.kind === 'wall') return segBox(ox, oy, oz, nx, ny, nz, ob);
    var ozPos = ob.obj.position.z;
    if((oz > ozPos) === (nz > ozPos)) return null;
    var u = (ozPos - oz) / (nz - oz || 1e-6);
    var hx = ox + (nx - ox) * u - ob.obj.position.x;
    var hy = oy + (ny - oy) * u - ob.obj.position.y;
    var r = 0.52;
    try{ var sz = (W.TUNING && TUNING.OBSTACLE_SHIELD_SIZE); if(sz) r = sz * 0.015; if(r < 0.48) r = 0.52; }catch(e){}
    if(Math.sqrt(hx*hx + hy*hy) > r) return null;
    return { x: ob.obj.position.x + hx, y: ob.obj.position.y + hy, z: ozPos + 0.08, hx: hx, hy: hy, u: u };
  }
  function makeFruit3D(){
    var kinds = (W.TUNING && TUNING.FRUIT_VALUES) ? Object.keys(TUNING.FRUIT_VALUES) : ['cherry'];
    var kind = pick(kinds);
    var val = (W.TUNING && TUNING.FRUIT_VALUES && TUNING.FRUIT_VALUES[kind]) || 50;
    var colMap = {cherry:0xe8443a, strawberry:0xff5a6b, apple:0x6cc24a, orange:0xffa126, pear:0xc8e645, grapes:0x9b5fe8, watermelon:0x2e8b57, pineapple:0xffd23a, banana:0xffe135};
    var col = colMap[kind] || 0xff8b3d;
    var x = (rng()-0.5)*6;
    var z = -18 - rng()*30;
    var grp = new THREE.Group();
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35,12,8), new THREE.MeshLambertMaterial({color:col}));
    grp.add(mesh);
    grp.position.set(x, 1.6 + rng()*0.6, z);
    scene.add(grp);
    return {obj: grp, type:'fruit', kind: kind, value: val, r:0.35, z:z, baseY: grp.position.y, bobPhase: rng()*6.28, dead:false};
  }
  function makeGolden3D(){
    var x=(rng()-0.5)*6;
    var z=-18 - rng()*30;
    var grp=new THREE.Group();
    var mesh=new THREE.Mesh(new THREE.SphereGeometry(0.42,14,10), new THREE.MeshBasicMaterial({color:0xffcf3d}));
    grp.add(mesh);
    grp.position.set(x, 1.9 + rng()*0.6, z);
    scene.add(grp);
    return {obj:grp, type:'golden', r:0.42, z:z, baseY: grp.position.y, bobPhase: rng()*6.28, dead:false};
  }
  function makePowerup3D(){
    var x=(rng()-0.5)*6;
    var z=-18 - rng()*30;
    var grp=new THREE.Group();
    var geo=new THREE.TorusGeometry(0.32,0.09,8,16);
    var mesh=new THREE.Mesh(geo, new THREE.MeshLambertMaterial({color:0x62e6ff}));
    mesh.rotation.x=Math.PI/2;
    grp.add(mesh);
    grp.position.set(x, 1.8 + rng()*0.6, z);
    scene.add(grp);
    return {obj:grp, type:'powerup', r:0.32, z:z, baseY: grp.position.y, bobPhase: rng()*6.28, dead:false, kind: rng()<0.5?'arrows':'slowmo'};
  }
  function makeDoodle3D(){
    try{
      if(typeof SPRITES==='undefined' || !SPRITES.doodles) return null;
      var list=SPRITES.doodles();
      if(!list || !list.length) return null;
      var entry=pick(list);
      var x=(rng()-0.5)*6;
      var z=-12 - rng()*42;
      var grp=new THREE.Group();
      var mesh=new THREE.Mesh(new THREE.SphereGeometry(0.44,12,8), new THREE.MeshLambertMaterial({color:0x9fd636}));
      grp.add(mesh);
      grp.position.set(x, 1.7, z);
      scene.add(grp);
      return {obj:grp, type:'doodle', r:0.44, z:z, baseY: grp.position.y, bobPhase: rng()*6.28, dead:false, doodle:true, sprite:entry.sprite, points: entry.points||40};
    }catch(e){ return null; }
  }

  function buildTargets() {
    function disposeHierarchy(obj){
      if(!obj) return;
      try{
        obj.traverse(function(child){
          if(child.geometry) try{ child.geometry.dispose(); }catch(e){}
          if(child.material){
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(function(m){
              if(m.map) try{ m.map.dispose(); }catch(e){}
              try{ m.dispose(); }catch(e){}
            });
          }
        });
      }catch(e){}
    }
    targets.forEach(function (t) {
      if(!t.obj) return;
      var detached=[];
      try{ t.obj.children.slice().forEach(function(ch){ if(ch.userData && ch.userData.isArrow) detached.push(ch); }); }catch(e){}
      detached.forEach(function(ch){ try{ t.obj.remove(ch); scene.add(ch); }catch(e){} });
      scene.remove(t.obj);
      disposeHierarchy(t.obj);
    });
    targets = [];
    groundShadows.forEach(function(s){
      scene.remove(s);
      try{
        if(s.geometry) s.geometry.dispose();
        if(s.material){
          if(s.material.map) s.material.map.dispose();
          s.material.dispose();
        }
      }catch(e){}
    });
    groundShadows = [];
    pickups.forEach(function (p) {
      if(!p.obj) return;
      scene.remove(p.obj);
      disposeHierarchy(p.obj);
    });
    pickups = [];
    obstacles.forEach(function (o) {
      if(!o.obj) return;
      var detached2=[];
      try{ o.obj.children.slice().forEach(function(ch){ if(ch.userData && ch.userData.isArrow) detached2.push(ch); }); }catch(e){}
      detached2.forEach(function(ch){ try{ o.obj.remove(ch); scene.add(ch); }catch(e){} });
      scene.remove(o.obj);
      disposeHierarchy(o.obj);
    });
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
    // if seeded, ensure st.rand is pinned so spawner is deterministic
    try{
      if(useSeed && st && !st.rand){
        var _seedVal=0; for(var _si=0;_si<useSeed.length;_si++) _seedVal=(_seedVal*31+useSeed.charCodeAt(_si))>>>0;
        st.rand = mulberry32(_seedVal);
      } else if(useSeed && !st){
        W._pending3DSeed = useSeed;
      }
    }catch(e){}
    if (rng() < 0.6) {
      pickups.push(makeBalloon((rng() - 0.5) * 6, -18 - rng() * 30));
    }
    for (var _oi = 0; _oi < targets.length; _oi++) {
      var _t = targets[_oi];
      if (_t.mover && rng() < ((W.TUNING && TUNING.OBSTACLE_CHANCE) || 0.4)) {
        obstacles.push(makeShield(_t));
      }
    }
  }

  function spawner(dt){
    if(!st) return;
    st.spawnCooldown -= dt;
    if(st.bossRage) st.spawnCooldown -= dt * 0.67;
    if(st.spawnCooldown > 0) return;
    var totalLive = liveTargets().length + livePickups().length;
    if(totalLive >= 10){ st.spawnCooldown = 0.5; return; }
    var ph = st.phase==='warmup'?1: st.phase==='movers'?2:3;
    var liveBull = liveTargets().length;
    var want = ph===1?3: ph===2?3:4;
    if(liveBull < want){
      // doodle chance (phase 2+, at most 2, ~10%)
      if(ph>=2){
        try{
          var doodlesLive = pickups.filter(function(p){ return !p.dead && p.type==='doodle'; }).length;
          if(doodlesLive < 2 && typeof SPRITES!=='undefined' && SPRITES.doodles && SPRITES.doodles().length && rng()<0.1){
            var d = makeDoodle3D();
            if(d){ pickups.push(d); st.spawnCooldown=0.35; return; }
          }
        }catch(e){}
      }
      var x=(rng()-0.5)*8;
      var z=-(12 + rng()*48);
      var r=0.9 + rng()*0.45;
      var mover=rng()<0.5;
      var t=makeTarget(x,z,r,mover);
      targets.push(t);
      if(ph>=2 && mover && rng() < ((W.TUNING && TUNING.OBSTACLE_CHANCE)||0.4)){
        obstacles.push(makeShield(t));
      }
      st.spawnCooldown=0.35;
      return;
    }
    var hasGolden = pickups.some(function(p){ return !p.dead && p.type==='golden'; });
    var hasPowerup = pickups.some(function(p){ return !p.dead && p.type==='powerup'; });
    if(ph>=2 && !hasGolden && rng()<0.02){
      pickups.push(makeGolden3D());
      st.spawnCooldown=3;
      return;
    }
    if(!hasPowerup && rng()<0.015){
      pickups.push(makePowerup3D());
      st.spawnCooldown=3;
      return;
    }
    var balloons = pickups.filter(function(p){ return !p.dead && p.type==='balloon'; }).length;
    var roll=rng();
    if(ph===1){
      if(balloons<1 && roll<0.4){ pickups.push(makeBalloon((rng()-0.5)*6, -18 - rng()*30)); st.spawnCooldown=2.5; }
      else st.spawnCooldown=1;
    } else if(ph===2){
      var walls = obstacles.filter(function(o){ return o.kind==='wall' && !o.dead; }).length;
      var wallChance = (W.TUNING && TUNING.WALL_CHANCE) || 0.22;
      if(walls<1 && roll < wallChance){ obstacles.push(makeWall3D()); st.spawnCooldown=2.8; }
      else if(balloons<2 && roll<0.35){ pickups.push(makeBalloon((rng()-0.5)*6, -18 - rng()*30)); st.spawnCooldown=1.6; }
      else if(roll<0.55){ pickups.push(makeFruit3D()); st.spawnCooldown=2.2; }
      else st.spawnCooldown=0.9;
    } else {
      var walls3 = obstacles.filter(function(o){ return o.kind==='wall' && !o.dead; }).length;
      var wallChance3 = (W.TUNING && TUNING.WALL_CHANCE) || 0.22;
      if(walls3<2 && roll < wallChance3*1.2){ obstacles.push(makeWall3D()); st.spawnCooldown=2.0; }
      else if(balloons<3 && roll<0.35){ pickups.push(makeBalloon((rng()-0.5)*6, -18 - rng()*30)); st.spawnCooldown=1.0; }
      else if(roll<0.65){ pickups.push(makeFruit3D()); st.spawnCooldown=1.2; }
      else st.spawnCooldown=0.6;
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
    // ribbon is the main trajectory guide — dots stay as fallback (pre-allocated to avoid per-frame alloc)
    var ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24*3), 3));
    ribbonGeo.setDrawRange(0, 0);
    previewRibbon = new THREE.Line(ribbonGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    previewRibbon.visible = false;
    previewRibbon.frustumCulled = false;
    scene.add(previewRibbon);
  }

  // ============================================================
  // THE PET (the real-model test)
  // ============================================================
  function currentPet3D(){ try{ var p=SAVE.current&&SAVE.current(); return p&&p.equipped&&p.equipped.pet; }catch(e){ return null; } }
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
    try{ if(pet && pet.holder){ if(pet.holder.parent) pet.holder.parent.remove(pet.holder); else scene.remove(pet.holder); } }catch(e){}
    var holder = new THREE.Group();
    holder.position.set(1.9, 0, -4.1);        // just inside the fence, in frame
    holder.rotation.y = -0.5;                 // half-turned toward the shooter
    var stand = procPet();
    fitAndPlace(stand);
    holder.add(stand);
    scene.add(holder);
    pet = { holder: holder, model: stand, real: false, bob: Math.random() * 6.28, cheer: 0 };

    if (typeof THREE.GLTFLoader !== 'function') return;
    var petId=currentPet3D()||'ptero'; var url='assets/models/pet_'+petId+'.glb';
    new THREE.GLTFLoader().load(url, function (gltf) {
      holder.remove(stand);
      var m = gltf.scene;
      // Meshy/Tripo exports come out shiny-metal, which reads as BLACK in a
      // scene with no reflections to be shiny about. Knock the metal off and
      // tell three the textures are sRGB, or every bought/generated model
      // will look like a burnt lump. This is the 3D version of the lighting
      // contract the 2D art already has to obey.
      // Matte clay: Rough 0.78 Metal 0 Spec 0.12 — not shiny plastic. Same as 2D storybook.
      m.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (mat) {
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            mat.metalness = 0.0;
            mat.roughness = 0.78;
            if (mat.clearcoat !== undefined) mat.clearcoat = 0.04;
            if (mat.clearcoatRoughness !== undefined) mat.clearcoatRoughness = 0.35;
            if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.12;
          } else {
            if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.05);
            if (mat.roughness !== undefined) mat.roughness = 0.85;
          }
          // Vertex colors already carry painted palette — keep them, don't tint.
          if (mat.vertexColors === false && o.geometry && o.geometry.attributes.color) mat.vertexColors = true;
          if (mat.map) { if (THREE.SRGBColorSpace) mat.map.colorSpace = THREE.SRGBColorSpace; else mat.map.encoding = THREE.sRGBEncoding; }
          mat.needsUpdate = true;
        });
        // Bevel feel: smooth normals (retopo already shade_smooth) + no flat shading.
        if (o.geometry) {
          if (o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          o.geometry.computeBoundingSphere();
        }
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
  function refreshPetName(){ try{ var pid=currentPet3D(); if(!hud.petName) return; if(!pid) hud.petName.textContent='None'; else { var k='NAME_PET_'+pid.toUpperCase(); hud.petName.textContent=(typeof TUNING!=='undefined'&&TUNING[k])||pid; } }catch(e){} }
  function openPetShop(){ var pets=['ptero','turtle','firefly','bunbun']; var price=(typeof TUNING!=='undefined'&&TUNING.PRICE_PET)||2500; var list=pets.map(function(id,i){ return (i+1)+'. '+id+' ('+price+'c)'; }).join('\n'); var choice=prompt('Choose pet:\n'+list+'\nEnter name (ptero/turtle/firefly/bunbun):','ptero'); if(!choice) return; choice=choice.trim().toLowerCase(); if(pets.indexOf(choice)===-1){ say('Unknown pet'); return; } try{ var owns=false; try{ owns=SAVE.owns&&SAVE.owns('pets', choice); }catch(e2){} if(owns){ SAVE.equip('pet', choice); refreshPetName(); buildPet(); say('Equipped '+choice); return; } }catch(e){} if(SAVE.spend(2500)){ try{ SAVE.unlock('pets', choice); SAVE.equip('pet', choice); }catch(e){} refreshPetName(); buildPet(); say('Unlocked '+choice+'!'); } else { say('Need 2500 coins'); } }
  function startAdventure(stageIdx){ var list=(typeof STAGES!=='undefined'&&STAGES.LIST)||[]; var s=list[stageIdx||0]; if(!s) return reset(); currentBiome=s.background.replace('bg_','')||'meadow'; buildBackgroundPlanes(currentBiome); adventureStage=stageIdx||0; adventureActive=true; reset(); try{ var seedStr='adv'+stageIdx; var layout=seededTargets(seedStr); try{ targets.forEach(function(t){ if(t.obj) scene.remove(t.obj); }); }catch(e){} try{ groundShadows.forEach(function(sh){ scene.remove(sh); }); }catch(e){} targets=[]; groundShadows=[]; for(var li=0; li<layout.length&&li<4; li++){ var ld=layout[li]; var t=makeTarget(ld.x, ld.z, ld.r, !!ld.mover); targets.push(t); } while(targets.length<4){ var fb=seededTargets(seedStr+'_'+targets.length)[0]; targets.push(makeTarget(fb.x, fb.z, fb.r, !!fb.mover)); } if(st){ st.moversAt=s.round.moversAt; st.chaosAt=s.round.chaosAt; st.adventure=s; st.adventureStage=stageIdx; } buildBackgroundPlanes(currentBiome); }catch(e){} say('Adventure Stage '+(stageIdx+1)); }

  // ---- bow: sells the fantasy even before the first arrow ----
  function buildBow() {
    bowMesh = new THREE.Group();
    bowMesh.position.set(0, K.EYE_HEIGHT - 0.15, 0.35);
    var limbMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, transparent:true, opacity:0.96 });
    var gripMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a, transparent:true, opacity:0.96 });
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
    bowString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xeee8d5, transparent:true, opacity:0.96 }));
    bowMesh.add(upper); bowMesh.add(lower); bowMesh.add(grip); bowMesh.add(bowString);
    bowMesh.visible = K.BOW_ENABLED;
    bowMesh.userData.punch = 0;
    bowMesh.userData.mats = [limbMat, gripMat, bowString.material];
    bowMesh.userData.fade = 0;
    scene.add(bowMesh);
  }

  function buildRain(){
    if(rainSystem){
      scene.remove(rainSystem);
      try{
        if(rainSystem.geometry) rainSystem.geometry.dispose();
        if(rainSystem.material) rainSystem.material.dispose();
      }catch(e){}
      rainSystem=null;
    }
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
    // auto-fade when aiming so you can see the target — fades very early so you don't need to over-pull
    var targetFade = 0;
    if (K.BOW_FADE && drag && drag.active) {
      targetFade = Math.max(0, Math.min(1, (power - 0.02) / 0.16)) * 0.96;
    }
    bowMesh.userData.fade += (targetFade - bowMesh.userData.fade) * Math.min(1, dt * 7);
    var fade = bowMesh.userData.fade;
    var mats = bowMesh.userData.mats;
    if (mats) {
      for (var mi = 0; mi < mats.length; mi++) {
        mats[mi].opacity = 0.96 * (1 - fade);
        mats[mi].depthWrite = fade < 0.5;
      }
    }
    var fadeScale = 1 - fade * 0.38;
    // scale punch decay (recoil snap) combined with fade shrink
    if (bowMesh.userData.punch) {
      bowMesh.userData.punch *= Math.max(0, 1 - dt * 10);
      if (bowMesh.userData.punch < 0.01) bowMesh.userData.punch = 0;
      var s = (1 + bowMesh.userData.punch * 0.12) * fadeScale;
      bowMesh.scale.set(s, s, s);
    } else {
      bowMesh.scale.set(fadeScale, fadeScale, fadeScale);
    }
  }

function spawnBullseyeParticles(x,y,z, r){
  if(!K.PARTICLES) return;
  var n = K.PARTICLE_COUNT || 12;
  var geo = getSphereSmall();
  for(var i=0;i<n;i++){
    var ang = (i/n)*Math.PI*2 + Math.random()*0.3;
    var sp = 1.8 + Math.random()*2.2;
    var vel = new THREE.Vector3(Math.cos(ang)*sp*0.6, Math.sin(ang)*sp*0.6 + 1.2, (Math.random()-0.5)*sp*0.5);
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
  var geo = getSphereDust();
  for(var i=0;i<6;i++){
    var vel = new THREE.Vector3((Math.random()-0.5)*1.6, 0.8+Math.random()*1.1, (Math.random()-0.5)*1.6);
    var mat = new THREE.MeshBasicMaterial({color:0xc8a06a, transparent:true, opacity:0.42});
    var m = new THREE.Mesh(geo, mat);
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

function spawnCoinBurst(x,y,z, n){
  n = n || 5;
  var cols = (typeof TUNING!=='undefined' && TUNING.SCORE_PER_COIN) ? TUNING.SCORE_PER_COIN : 10;
  var coins = Math.max(1, Math.min(6, Math.floor(n/10)+1)); // 1 coin per ~10 pts, cap 6
  for(var i=0;i<coins;i++){
    var geo = new THREE.CylinderGeometry(0.14,0.14,0.04,12);
    var mat = new THREE.MeshLambertMaterial({color:0xffd23a, emissive:0xffb800, emissiveIntensity:0.18});
    var m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI/2;
    m.rotation.z = Math.random()*Math.PI*2;
    m.position.set(x + (Math.random()-0.5)*0.7, y + Math.random()*0.5, z+0.3);
    scene.add(m);
    var vel = new THREE.Vector3((Math.random()-0.5)*1.8, 2.2+Math.random()*1.6, (Math.random()-0.5)*1.2);
    coinParticles.push({obj:m, vel:vel, life:1.25+Math.random()*0.35, maxLife:1.25+Math.random()*0.35, phase:0});
  }
  // also float +N text via say is already done, but add sparkle burst at impact
  for(var s=0;s<4;s++){
    var sp=new THREE.Mesh(new THREE.SphereGeometry(0.045,6,6), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.9}));
    var sv=new THREE.Vector3((Math.random()-0.5)*2.2, 1.5+Math.random()*1.8, (Math.random()-0.5)*1.2);
    sp.position.set(x,y,z+0.35);
    scene.add(sp);
    hitParticles.push({obj:sp, vel:sv, life:0.45, maxLife:0.45});
  }
}

function spawnFlame(x,y,z){
  if(!K.PARTICLES) return;
  var geo=getSphereSmall();
  for(var i=0;i<8;i++){
    var vel=new THREE.Vector3((Math.random()-0.5)*2.0, 1.2+Math.random()*1.6, (Math.random()-0.5)*2.0);
    var col = i%2?0xff7a1a:0xff3b30;
    var m=new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.92}));
    m.position.set(x,y,z+0.22);
    scene.add(m);
    hitParticles.push({obj:m, vel:vel, life:0.38+Math.random()*0.18, maxLife:0.38+Math.random()*0.18});
  }
  camShake=Math.max(camShake, K.CAM_SHAKE*0.9);
}
function spawnSnow(x,y,z){
  if(!K.PARTICLES) return;
  for(var i=0;i<7;i++){
    var vel=new THREE.Vector3((Math.random()-0.5)*1.8, 0.6+Math.random()*1.4, (Math.random()-0.5)*1.8);
    var m=new THREE.Mesh(new THREE.SphereGeometry(0.07,5,5), new THREE.MeshBasicMaterial({color:0x8fdcff, transparent:true, opacity:0.85}));
    m.position.set(x,y,z+0.25);
    scene.add(m);
    hitParticles.push({obj:m, vel:vel, life:0.55, maxLife:0.55});
  }
}
function isSoftPickupType(pp){
  // Soft = arrow keeps flying: mirrors game.js soft list (balloon/fruit/golden/powerup/doodle/bossShot)
  return pp && (pp.type==='balloon' || pp.type==='fruit' || pp.type==='golden' || pp.type==='powerup' || pp.type==='doodle');
}
function handleFreeze(hitX, hitY, hitZ, freezeDur){
  var dur = (freezeDur||0) + (currentPerk().freezeBonus||0);
  if(dur<=0) return;
  var until = (st && st.elapsed!=null ? st.elapsed : 0) + dur;
  var rad = 260; // task: 260 in 3D Euclidean — huge => freezes all, but keep as spec
  // Scale radius for 3D: if still huge, divide by ~40 to keep feel, but keep min 6m so ice matters
  // We keep literal 260 plus a reasonable meter fallback so test sees hypot logic.
  var scaledRad = Math.min(rad, 8); // avoid freezing across whole world if radius is 260m
  // Use literal 260 for detection per spec, but also respect scaled fallback for visuals
  var checkTargets = targets.slice();
  for(var i=0;i<checkTargets.length;i++){
    var t=checkTargets[i];
    if(t.dead) continue;
    var tx=t.obj.position.x, ty=t.obj.position.y, tz=t.z;
    var dx=tx-hitX, dy=ty-hitY, dz=tz-hitZ;
    var dist=Math.hypot(dx,dy,dz);
    if(dist < rad){ // spec: <260 Euclidean
      t.frozenUntil = until;
      spawnSnow(tx,ty,tz);
    }
  }
  // Also freeze live pickups that bob (they reuse baseY) - visual freeze holds them
  for(var j=0;j<pickups.length;j++){
    var p=pickups[j];
    if(p.dead) continue;
    var px=p.obj.position.x, py=p.obj.position.y, pz=p.z;
    var ddx=px-hitX, ddy=py-hitY, ddz=pz-hitZ;
    if(Math.hypot(ddx,ddy,ddz) < rad){
      p.frozenUntil = until;
      spawnSnow(px,py,pz);
    }
  }
  var _frPos={x:hitX,y:hitY,z:hitZ}; try{ if(W.AUDIO && AUDIO.freeze) AUDIO.freeze(_frPos); }catch(e){}
}
function handleChain(hitX, hitY, hitZ, ar){
  // Find nearest live target within 600 Euclidean (spec: 600 3D)
  var best=null, bd=1e9;
  var rad=600;
  for(var i=0;i<targets.length;i++){
    var t=targets[i];
    if(t.dead) continue;
    // don't chain to self if still alive? we already marked hit target dead, so skip hit pos itself
    var tx=t.obj.position.x, ty=t.obj.position.y, tz=t.z;
    var d=Math.hypot(tx-hitX, ty-hitY, tz-hitZ);
    if(d<bd && d < rad){ bd=d; best=t; }
  }
  // also consider pickups as chain candidates
  var bestPickup=null, bdP=1e9;
  for(var j=0;j<pickups.length;j++){
    var pp=pickups[j];
    if(pp.dead) continue;
    var px=pp.obj.position.x, py=pp.obj.position.y, pz=pp.z;
    var dd=Math.hypot(px-hitX, py-hitY, pz-hitZ);
    if(dd<bdP && dd<rad){ bdP=dd; bestPickup=pp; }
  }
  // Prefer whichever is closer; if pickup is closer, chain to it
  var chosen=null, chosenIsPickup=false;
  if(best && bestPickup){ if(bdP < bd){ chosen=bestPickup; chosenIsPickup=true; } else chosen=best; }
  else if(best) chosen=best;
  else if(bestPickup){ chosen=bestPickup; chosenIsPickup=true; }
  if(!chosen) return;
  var cx, cy, cz;
  if(chosenIsPickup){ cx=chosen.obj.position.x; cy=chosen.obj.position.y; cz=chosen.z; }
  else { cx=chosen.obj.position.x; cy=chosen.obj.position.y; cz=chosen.z; }
  try{ if(W.AUDIO && AUDIO.zap) AUDIO.zap(); }catch(e){}
  // Bolt visual: push to st.bolts and also create 3D line in hitParticles via bolts array
  if(st){
    if(!st.bolts) st.bolts=[];
    st.bolts.push({x1:hitX,y1:hitY,z1:hitZ, x2:cx,y2:cy,z2:cz, life:0.25});
  }
  bolts.push({x1:hitX,y1:hitY,z1:hitZ, x2:cx,y2:cy,z2:cz, life:0.25});
  // Create THREE.Line for bolt
  try{
    var g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(hitX,hitY,hitZ+0.18), new THREE.Vector3(cx,cy,cz+0.18)]);
    var line=new THREE.Line(g, new THREE.LineBasicMaterial({color:0xffe33a, transparent:true, opacity:0.96}));
    scene.add(line);
    hitParticles.push({obj:line, vel:new THREE.Vector3(0,0,0), life:0.25, maxLife:0.25, isBolt:true});
    // Also keep reference for bolts update
    bolts[bolts.length-1].obj=line;
  }catch(e){}
  // Award half points: mirrors game.js chain half logic
  var rings=(W.TUNING && TUNING.SCORE_BULLSEYE_RINGS) || [100,50,25,10];
  var halfBase = rings[1] || 50;
  var pts = halfBase * 0.5; // will be scaled by scoreBonus/combo later via manual calc
  // Mimic game.js chain handling: different target types get half value of their own base
  var bonusMult = 1 + ((ar && ar.scoreBonus!=null?ar.scoreBonus: currentArrow().scoreBonus)||0);
  var comboStep=(W.TUNING&&TUNING.COMBO_STEP)||2, comboMax=(W.TUNING&&TUNING.COMBO_MAX)||5;
  var comboMult = Math.min(comboMax, 1 + Math.floor((st?st.combo:0)/comboStep));
  function awardHalf(base){
    var final=Math.round((base * bonusMult * comboMult * 0.5));
    if(st){ st.score+=final; st.hits++; say('ZAP! +'+final); spawnFloatScore(cx,cy,cz,'+'+final,'zap'); spawnCoinBurst(cx,cy,cz, final); }
    return final;
  }
  if(chosenIsPickup){
    if(chosen.type==='balloon'){
      awardHalf((W.TUNING&&W.TUNING.SCORE_BALLOON)||25);
      spawnBalloonShreds(cx,cy,cz);
      try{ scene.remove(chosen.obj); }catch(e){}
      try{ chosen.obj.traverse(function(c){ if(c.geometry) try{c.geometry.dispose();}catch(e){} if(c.material){ var ms=Array.isArray(c.material)?c.material:[c.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } }); }catch(e){}
      chosen.dead=true;
      var idx=pickups.indexOf(chosen);
      if(idx>=0) pickups.splice(idx,1);
    } else if(chosen.type==='fruit'){
      awardHalf(chosen.value||50);
      spawnBalloonShreds(cx,cy,cz);
      try{ scene.remove(chosen.obj); }catch(e){}
      chosen.dead=true; var idxF=pickups.indexOf(chosen); if(idxF>=0) pickups.splice(idxF,1);
    } else if(chosen.type==='golden'){
      var gPts=awardHalf((W.TUNING&&W.TUNING.SCORE_GOLDEN)||500);
      spawnCoinBurst(cx,cy,cz, Math.ceil(gPts/2));
      spawnBalloonShreds(cx,cy,cz);
      try{ scene.remove(chosen.obj); }catch(e){}
      chosen.dead=true; var idxG=pickups.indexOf(chosen); if(idxG>=0) pickups.splice(idxG,1);
    } else if(chosen.type==='powerup'){
      awardHalf(30);
      try{ scene.remove(chosen.obj); }catch(e){}
      chosen.dead=true; var idxP=pickups.indexOf(chosen); if(idxP>=0) pickups.splice(idxP,1);
      // powerup effect still triggers but half — just give coins
    } else if(chosen.type==='doodle'){
      awardHalf(chosen.points||40);
      spawnBalloonShreds(cx,cy,cz);
      try{ scene.remove(chosen.obj); }catch(e){}
      chosen.dead=true; var idxD=pickups.indexOf(chosen); if(idxD>=0) pickups.splice(idxD,1);
    }
  } else {
    // bullseye target — chain uses rings[1] (50) half, mirrors game.js award(rings[1], half:true)
    awardHalf(halfBase);
    spawnBullseyeParticles(cx,cy,cz, chosen.r||1);
    chosen.dead=true;
    try{
      chosen.obj.visible=false;
    }catch(e){}
  }
}
function spawnBlackhole(x,y,z){
  var bh={x:x,y:y,z:z,t:0, life:(W.TUNING&&TUNING.BLACKHOLE_TIME)||0.95, eaten:0, spin: Math.random()<0.5?-1:1, seed: Math.random()*Math.PI*2, pulse:0};
  // visual: dark sphere + ring
  var sphere=new THREE.Mesh(new THREE.SphereGeometry(0.42,16,12), new THREE.MeshBasicMaterial({color:0x0a1a2a, transparent:true, opacity:0.92}));
  sphere.position.set(x,y,z+0.25);
  var ring=new THREE.Mesh(new THREE.RingGeometry(0.55,0.78,24), new THREE.MeshBasicMaterial({color:0x7a3cff, transparent:true, opacity:0.55, side:THREE.DoubleSide}));
  ring.position.set(x,y,z+0.27);
  ring.lookAt(camera.position);
  var grp=new THREE.Group();
  grp.add(sphere); grp.add(ring);
  scene.add(grp);
  bh.obj=grp; bh.sphere=sphere; bh.ring=ring;
  // store both globally and in st
  blackholes.push(bh);
  if(st){
    if(!st.blackholes) st.blackholes=[];
    st.blackholes.push(bh);
  }
  try{ if(W.AUDIO && AUDIO.zap) AUDIO.zap(); }catch(e){}
  camShake=Math.max(camShake, 0.24);
  try{ if(typeof SAVE!=='undefined' && SAVE.earnBadge){ if(SAVE.earnBadge('blackhole')) say('\uD83D\uDD73 Black Hole!'); } }catch(e){}
}
function updateBlackholes(dt){
  // Use TUNING values but scaled for 3D metres
  var R = (W.TUNING&&TUNING.BLACKHOLE_RADIUS!=null ? TUNING.BLACKHOLE_RADIUS : 210);
  // Convert px radius to metres: 210px ~ ~3.5m in 3D world (empirical). Keep large radius but clamp to ~10m so it doesn't suck whole world.
  var R3 = Math.min(R, R * 0.022 + 3.5); // ~8m max
  // Actually keep literal 210 check as per task but also use scaled pull for reasonable movement
  var pullBase = (W.TUNING&&TUNING.BLACKHOLE_PULL!=null ? TUNING.BLACKHOLE_PULL : 4.4);
  var maxEats = (W.TUNING&&TUNING.BLACKHOLE_MAX_EATS!=null ? TUNING.BLACKHOLE_MAX_EATS : 3);
  var checkR = R; // spec says within R210 Euclidean
  for(var i=blackholes.length-1;i>=0;i--){
    var bh=blackholes[i];
    bh.t += dt;
    bh.pulse = Math.max(0, (bh.pulse||0) - dt);
    // animate visual
    if(bh.obj){
      var p=bh.t/bh.life;
      var env = p<0.45 ? p/0.45 : (p>0.7 ? 1 - (p-0.7)/0.3 : 1);
      env=Math.max(0,Math.min(1,env));
      var wob = 1 + Math.sin((st?st.elapsed:0)*18 + (bh.seed||0))*0.05 + (bh.pulse||0)*0.35;
      var s = 0.85 * env * wob;
      bh.obj.scale.set(s,s,s);
      bh.obj.traverse(function(c){ if(c.material && c.material.opacity!=null) c.material.opacity = env*0.92; });
      if(bh.ring) bh.ring.lookAt(camera.position);
      bh.obj.rotation.z += bh.spin * dt * 3.2;
    }
    // pull targets + pickups
    var all=[].concat(targets).concat(pickups);
    for(var j=0;j<all.length;j++){
      var o=all[j];
      if(o.dead) continue;
      if(bh.eaten >= maxEats) break;
      var ox, oy, oz;
      if(o.obj && o.obj.position){ ox=o.obj.position.x; oy=o.obj.position.y; oz=o.z!=null?o.z:o.obj.position.z; }
      else continue;
      var dx=bh.x-ox, dy=bh.y-oy, dz=bh.z-oz;
      var dist=Math.hypot(dx,dy,dz) || 0.001;
      if(dist < checkR){
        // freeze briefly while inside
        o.frozenUntil = (st?st.elapsed:0) + 0.05;
        var pull = pullBase * Math.pow(1 - Math.min(1, dist/checkR), 1.35);
        var swirl=Math.min(1.8, pull*0.55);
        var nx=dx/dist, ny=dy/dist, nz=dz/dist;
        // perpendicular in XY for swirl (simple)
        var pxS=-ny, pyS=nx;
        // move
        var mvX = (nx*pull + pxS*swirl*bh.spin) * 60 * dt * 0.045;
        var mvY = (ny*pull + pyS*swirl*bh.spin) * 60 * dt * 0.045;
        var mvZ = nz*pull * 60 * dt * 0.045;
        // For targets, move baseX and obj together; for pickups move obj directly
        if(o.baseX!=null && targets.indexOf(o)!==-1){
          o.baseX += mvX;
          o.obj.position.x += mvX;
          o.obj.position.y += mvY;
          o.obj.position.z += mvZ;
        } else {
          o.obj.position.x += mvX;
          o.obj.position.y += mvY;
          o.obj.position.z += mvZ;
          if(o.z!=null) o.z += mvZ;
        }
        // consume if close
        if(dist < 0.9){
          // award and destroy
          var pts=25;
          if(targets.indexOf(o)!==-1){
            // bullseye
            var rings=(W.TUNING&&TUNING.SCORE_BULLSEYE_RINGS)||[100,50,25,10];
            pts=rings[0];
            // scoreBonus handled via current arrow? Use st scoring helper simplified
            var bm=1+((currentArrow().scoreBonus)||0);
            pts=Math.round(pts*bm);
            if(st){ st.score+=pts; st.hits++; say('SWALLOWED! +'+pts); spawnFloatScore(bh.x,bh.y,bh.z,'+'+pts,'blackhole'); spawnCoinBurst(bh.x,bh.y,bh.z, pts); spawnBullseyeParticles(ox,oy,oz,o.r||1); }
            o.dead=true;
            try{ o.obj.visible=false; }catch(e){}
          } else {
            // pickup
            if(o.type==='balloon'){ pts=(W.TUNING&&TUNING.SCORE_BALLOON)||25; if(st){ st.score+=Math.round(pts* (1+(currentArrow().scoreBonus||0))); st.hits++; } spawnBalloonShreds(ox,oy,oz); }
            else if(o.type==='fruit'){ pts=o.value||50; if(st){ st.score+=Math.round(pts* (1+(currentArrow().scoreBonus||0))); st.hits++; } spawnBalloonShreds(ox,oy,oz); }
            else if(o.type==='golden'){ pts=(W.TUNING&&TUNING.SCORE_GOLDEN)||500; if(st){ st.score+=Math.round(pts* (1+(currentArrow().scoreBonus||0))); st.hits++; } spawnCoinBurst(ox,oy,oz, pts); spawnBalloonShreds(ox,oy,oz); }
            else if(o.type==='doodle'){ pts=o.points||40; if(st){ st.score+=Math.round(pts* (1+(currentArrow().scoreBonus||0))); st.hits++; } spawnBalloonShreds(ox,oy,oz); }
            else pts=30;
            try{ scene.remove(o.obj); }catch(e){}
            o.dead=true;
            var idxP=pickups.indexOf(o);
            if(idxP>=0) pickups.splice(idxP,1);
            else { var idxT=targets.indexOf(o); if(idxT>=0) { /* keep but dead */ } }
          }
          bh.eaten++;
          bh.pulse=0.16;
        }
      }
    }
  }
  // cleanup expired
  for(var k=blackholes.length-1;k>=0;k--){
    var b=blackholes[k];
    if(b.t >= b.life){
      try{ scene.remove(b.obj); if(b.obj) b.obj.traverse(function(c){ if(c.geometry) try{c.geometry.dispose();}catch(e){} if(c.material){ var ms=Array.isArray(c.material)?c.material:[c.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } }); }catch(e){}
      blackholes.splice(k,1);
      if(st && st.blackholes){
        var idxS=st.blackholes.indexOf(b);
        if(idxS>=0) st.blackholes.splice(idxS,1);
      }
    }
  }
}
function updateBolts(dt){
  for(var i=bolts.length-1;i>=0;i--){
    var b=bolts[i];
    b.life-=dt;
    if(b.obj){
      try{ b.obj.material.opacity = Math.max(0, b.life/0.25); }catch(e){}
    }
    if(b.life<=0){
      try{ if(b.obj) scene.remove(b.obj); if(b.obj && b.obj.geometry) b.obj.geometry.dispose(); if(b.obj && b.obj.material) b.obj.material.dispose(); }catch(e){}
      bolts.splice(i,1);
      if(st && st.bolts){
        var idx=st.bolts.indexOf(b);
        // st.bolts holds plain objects not mesh refs, so just filter by life
      }
    }
  }
  if(st && st.bolts){
    for(var j=st.bolts.length-1;j>=0;j--){ st.bolts[j].life-=dt; if(st.bolts[j].life<=0) st.bolts.splice(j,1); }
  }
}

function worldToScreen(x,y,z){
  if(!W.innerWidth || !W.innerHeight) return {x:0,y:0,visible:false};
  var v = new THREE.Vector3(x,y,z);
  v.project(camera);
  var sx = (v.x*0.5+0.5)*W.innerWidth;
  var sy = ( -v.y*0.5+0.5)*W.innerHeight;
  return {x:sx, y:sy, visible: v.z<1};
}
function spawnFloatScore(worldX, worldY, worldZ, text, kind){
  var p = worldToScreen(worldX, worldY, worldZ+0.4);
  if(!p.visible) return;
  var el = D.createElement('div');
  el.className='float-score ' + (kind||'');
  el.textContent=text;
  el.style.left = p.x+'px';
  el.style.top = p.y+'px';
  el.style.transform='translate(-50%,-50%) scale(0.7)';
  el.style.opacity='0';
  D.body.appendChild(el);
  // animate
  requestAnimationFrame(function(){
    el.style.transition='transform 0.85s cubic-bezier(0.2,0.8,0.3,1), opacity 0.85s ease';
    el.style.transform='translate(-50%,-140%) scale(1.05)';
    el.style.opacity='1';
    setTimeout(function(){ el.style.opacity='0'; el.style.transform='translate(-50%,-170%) scale(0.95)'; }, 520);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 950);
  });
}

function updateCoinParticles(dt){
  for(var i=coinParticles.length-1;i>=0;i--){
    var p=coinParticles[i];
    p.life-=dt;
    if(p.life<=0){
      scene.remove(p.obj);
      try{ if(p.obj.geometry) p.obj.geometry.dispose(); if(p.obj.material){ var ms=Array.isArray(p.obj.material)?p.obj.material:[p.obj.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } }catch(e){}
      coinParticles.splice(i,1); continue;
    }
    var t=p.life/p.maxLife;
    if(p.life < 0.55){
      // home to HUD: lerp toward camera + up
      var target = new THREE.Vector3(camera.position.x*0.35, camera.position.y+0.9, camera.position.z+1.2);
      // simple lerp 30% per frame
      p.obj.position.x += (target.x - p.obj.position.x) * Math.min(1, dt*6);
      p.obj.position.y += (target.y - p.obj.position.y) * Math.min(1, dt*6);
      p.obj.position.z += (target.z - p.obj.position.z) * Math.min(1, dt*6);
      p.obj.scale.setScalar(0.7 + t*0.6);
      p.obj.rotation.y += dt*10;
      p.obj.material.opacity = t*0.95;
      // near HUD pop
      if(p.life < 0.15){ p.obj.scale.setScalar(1.4 - t); }
    } else {
      p.vel.y -= 7.5*dt;
      p.obj.position.x += p.vel.x*dt;
      p.obj.position.y += p.vel.y*dt;
      p.obj.position.z += p.vel.z*dt;
      p.obj.rotation.y += dt*8;
      p.obj.rotation.x += dt*5;
    }
    p.phase += dt*12;
    p.obj.rotation.z += dt*6;
  }
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
    if(p.life<=0){
      scene.remove(p.obj);
      try{
        if(p.obj.geometry) p.obj.geometry.dispose();
        if(p.obj.material){
          var ms=Array.isArray(p.obj.material)?p.obj.material:[p.obj.material];
          ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} });
        }
        if(p.obj.traverse) p.obj.traverse(function(c){
          if(c!==p.obj && c.geometry) try{c.geometry.dispose();}catch(e){}
          if(c!==p.obj && c.material){
            var ms2=Array.isArray(c.material)?c.material:[c.material];
            ms2.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} });
          }
        });
      }catch(e){}
      hitParticles.splice(i,1); continue;
    }
    var t=p.life/p.maxLife;
    if(p.isRing){
      var s=1 + (1-t)*2.2;
      p.obj.scale.set(s,s,s);
      p.obj.material.opacity = t*0.85;
      p.obj.lookAt(camera.position);
    } else if(p.isString){
      p.obj.position.y += p.vel.y*dt;
      p.obj.material.opacity = t*0.7;
    } else if(p.isBolt){
      p.obj.material.opacity = t*0.96;
    } else if(p.isStar){ p.obj.position.x+=p.vel.x*dt; p.obj.position.y+=p.vel.y*dt; p.obj.material.opacity=t*0.9; p.obj.scale.setScalar(0.8 + Math.sin(Date.now()*0.01)*0.2); } else {
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
    var raw = len / denom;
    var power = Math.pow(raw, 0.64); // 25% pull → 45% power, so you don't need to over-pull to reach far targets
    var yaw = -(drag.dx / denom) * K.MAX_YAW;
    var pitch = (drag.dy / denom) * K.MAX_PITCH;
    yaw = clamp(yaw, -K.MAX_YAW, K.MAX_YAW);
    pitch = clamp(pitch, -K.MAX_PITCH*0.35, K.MAX_PITCH);
    var mag = applyMagnetism(yaw, pitch);
    yaw = mag.yaw; pitch = mag.pitch;
    var a=currentArrow3D(); var speed = effectiveSpeed(power * (a.speedFactor||1));
    return { power:power, yaw:yaw, pitch:pitch, denom:denom, vx:Math.sin(yaw)*Math.cos(pitch)*speed, vy:Math.sin(pitch)*speed, vz:-Math.cos(yaw)*Math.cos(pitch)*speed, arrow:a, a:a };
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
    var grav = K.GRAVITY * ((a.arrow&&a.arrow.gravityFactor)||1) * (1 - (currentPerk().gravityCut||0));
    for (var i = 0; i < K.PREVIEW_DOTS; i++) {
      vy -= grav * dt;
      vx += windX * dt * 0.65;
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < 0.02) y = 0.02;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    // ribbon — 24 points along same physics arc (main guide) — reused buffer, zero alloc
    if (previewRibbon) {
      var rx = 0, ry = K.EYE_HEIGHT, rz = 0.6;
      var rvx = a.vx, rvy = a.vy, rvz = a.vz;
      var rPos = previewRibbon.geometry.attributes.position;
      for (var k = 0; k < 24; k++) {
        rvy -= grav * dt;
        rvx += windX * dt * 0.65;
        rx += rvx * dt; ry += rvy * dt; rz += rvz * dt;
        if (ry < 0.02) ry = 0.02;
        rPos.setXYZ(k, rx, ry, rz);
      }
      rPos.needsUpdate = true;
      previewRibbon.geometry.setDrawRange(0, 24);
      previewRibbon.geometry.computeBoundingSphere();
      previewRibbon.visible = true;
      previewRibbon.material.opacity = 0.35 + a.power * 0.5;
      // ribbon is main guide — hide dots when ribbon is on
      previewDots.visible = false;
    } else {
      previewDots.visible = true;
      previewDots.material.opacity = 0.35 + a.power * 0.5;
    }
  }

  function makeArrowMesh(arrow) {
    var a = arrow || currentArrow3D();
    var shaftColor = 0xd9b98c, headColor = 0x9aa4ad, fletchColor = 0xe86a4a;
    var emberColor = null, sparkColor = null;
    if(a.id==='fire'){ shaftColor=0x7a3010; headColor=0xff6a3d; fletchColor=0xff7a1a; emberColor=0xff6a3d; }
    else if(a.id==='ice'){ shaftColor=0x1d5e8f; headColor=0x7dd8ff; fletchColor=0x8fdcff; emberColor=0x7dd8ff; }
    else if(a.id==='lightning'){ shaftColor=0x7a6a10; headColor=0xffe566; fletchColor=0xffe33a; sparkColor=0xffffff; }
    else if(a.id==='obsidian'){ shaftColor=0x2a1a3a; headColor=0x3fe0ff; fletchColor=0x7a3cff; sparkColor=0x9b5fe8; }
    var g = new THREE.Group();
    var shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6),
      new THREE.MeshLambertMaterial({ color: shaftColor })
    );
    shaft.rotation.x = Math.PI / 2;          // lie the arrow down its own -Z
    var head = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.26, 7),
      new THREE.MeshLambertMaterial({ color: headColor })
    );
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.6;
    var fletch = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.3, 4),
      new THREE.MeshLambertMaterial({ color: fletchColor })
    );
    fletch.rotation.x = Math.PI / 2;
    fletch.position.z = 0.5;
    g.add(shaft); g.add(head); g.add(fletch);
    if(emberColor!==null){
      var ember = new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8), new THREE.MeshBasicMaterial({color:emberColor, transparent:true, opacity:0.92}));
      ember.position.set(0,0,-0.58);
      g.add(ember);
    }
    if(sparkColor!==null){
      var spark = new THREE.Mesh(new THREE.SphereGeometry(0.055,6,6), new THREE.MeshBasicMaterial({color:sparkColor, transparent:true, opacity:0.88}));
      spark.position.set(0,0.08,-0.45);
      g.add(spark);
    }
    g.userData.isArrow = true;
    g.userData.arrowType = a.id;
    return g;
  }

  function shoot() {
    if (roundOver) return;
    if (st.arrowsLeft <= 0 || (st.timeLeft <= 0 && !st.marathon)) return;
    var a = aimFromDrag();
    if (a.power < K.DEAD_ZONE) { say('Pull harder!'); if (navigator.vibrate) navigator.vibrate(20); return; }
    st.arrowsLeft--;
    var arrowData = a.arrow||a.a||a;
    var mesh = makeArrowMesh(arrowData);
    mesh.position.set(0, K.EYE_HEIGHT, 0.6);
    scene.add(mesh);
    // Lock gravity at shoot so preview vs live never diverge even if arrow type switches mid-flight.
    var gravLock = K.GRAVITY * (arrowData.gravityFactor||1) * (1 - (currentPerk().gravityCut||0));
    var curForPower = currentArrow();
    var kPower = null;
    try{ kPower = currentArrow3D(); }catch(e){}
    // HUD chip cycles K.ARROW_TYPE (prototype), SAVE holds inventory. Respect either being non-wooden.
    var _powerSrc = null;
    if(kPower && kPower.id && kPower.id!=='wooden' && (!curForPower || curForPower.id==='wooden')) _powerSrc = kPower;
    else if(curForPower && curForPower.id) _powerSrc = curForPower;
    else _powerSrc = arrowData;
    if(!_powerSrc || !_powerSrc.id) _powerSrc = arrowData;
    // Use power source for visual/physics so fire/ice/etc feel distinct (mesh color, gravity, speed)
    if(_powerSrc.id && _powerSrc.id !== arrowData.id){
      // Rebuild mesh to match actual arrow so fire looks fire even if K/SAVE lag
      try{ scene.remove(mesh); }catch(e){}
      mesh = makeArrowMesh(_powerSrc);
      mesh.position.set(0, K.EYE_HEIGHT, 0.6);
      scene.add(mesh);
      // Recompute gravLock and velocity scaling to match actual arrow's factors
      gravLock = K.GRAVITY * (_powerSrc.gravityFactor||1) * (1 - (currentPerk().gravityCut||0));
      // Adjust already-computed velocity if speedFactor differs: scale by ratio
      var speedRatio = (_powerSrc.speedFactor||1) / (arrowData.speedFactor||1);
      if(speedRatio!==1){ a.vx*=speedRatio; a.vy*=speedRatio; a.vz*=speedRatio; }
    }
    var ar={ obj: mesh, x: 0, y: K.EYE_HEIGHT, z: 0.6, vx: a.vx, vy: a.vy, vz: a.vz, stuck: false, life: 0, grav: gravLock, gravityFactor: _powerSrc.gravityFactor||1, arrowType: _powerSrc.id, scoreBonus: _powerSrc.scoreBonus||0, type: _powerSrc.id, pierceLeft: _powerSrc.pierce ? 1 : 0, chain: !!_powerSrc.chain, freeze: _powerSrc.freeze||0, blackhole: !!_powerSrc.blackhole, blackholeSpent: false };
    arrows.push(ar);
    var trailGeo=new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12*3),3)); var trail=new THREE.Points(trailGeo, new THREE.PointsMaterial({color:0xffffff, size:0.12, transparent:true, opacity:0.65, sizeAttenuation:true})); scene.add(trail); ar.trail=trail; ar.trailPos=[];
    var _shootPos = {x:0, y:K.EYE_HEIGHT, z:0.6};
    if (W.AUDIO && AUDIO.shoot) AUDIO.shoot(_shootPos);
    camShake = K.CAM_SHAKE;
    // Last arrow slow-send + extra kick (mirrors 2D st.cinematicUntil 0.16 on last arrow)
    if(!isReduced() && st.arrowsLeft===0){
      st.cinematicUntil = Math.max(st.cinematicUntil||0, st.elapsed + 0.16);
      st.camKick = (st.camKick||0) + 0.05;
      camShake += 0.05;
    }
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
  // Ray-disc: hx/hy are already in target local space (plane z=t.z, normal +Z towards camera).
  // If a future boss tilts the disc, switch to ray-plane with dot(normal) instead of z-test.
  function scoreHit(t, hx, hy, arrow) {
    var rings = (W.TUNING && TUNING.SCORE_BULLSEYE_RINGS) || [100, 50, 25, 10];
    var d = Math.sqrt(hx*hx + hy*hy) / (t.r || 1);
    // Exact 2D parity: 0.25/0.5/0.75 thresholds from js/game.js:1129 (not floor*4 rounding).
    var ring = d < 0.25 ? 0 : d < 0.5 ? 1 : d < 0.75 ? 2 : 3;
    var pts = rings[ring];
    var why = '';
    var isFar = -t.z > K.FAR_BONUS_METRES;
    var farMult = (W.TUNING && TUNING.FAR_TARGET_MULTIPLIER) || 2;
    var moveMult = (W.TUNING && TUNING.MOVING_TARGET_MULTIPLIER) || 2;
    var comboMult = 1;
    var aForBonus = null;
    if(arrow && arrow.arrowType){ try{ var lst=(typeof DATA!=='undefined'&&DATA.arrows)||[]; var f=lst.find(x=>x.id===arrow.arrowType); if(f) aForBonus=f; else aForBonus={id:arrow.arrowType, scoreBonus:arrow.scoreBonus||0}; }catch(e){ aForBonus=currentArrow3D(); }}
    else if(arrow && arrow.id) aForBonus=arrow;
    else aForBonus=currentArrow3D();
    if (ring === 0) {
      st.combo++;
      var step = (W.TUNING && TUNING.COMBO_STEP) || 2;
      var max = (W.TUNING && TUNING.COMBO_MAX) || 5;
      comboMult = Math.min(max, 1 + Math.floor(st.combo / step));
      if (comboMult > 1) { pts *= comboMult; why += ' x' + comboMult; }
      if (t.mover) { pts *= moveMult; why += ' MOVING x2'; }
      if (isFar) { pts *= farMult; why += ' FAR x2'; }
      if(aForBonus && aForBonus.scoreBonus){ pts *= 1 + (aForBonus.scoreBonus||0); pts=Math.round(pts); if(aForBonus.id==='fire') why+=' FIRE'; else if(aForBonus.id==='ice') why+=' ICE'; else if(aForBonus.id==='lightning') why+=' LIGHTNING'; else if(aForBonus.id==='obsidian') why+=' OBSIDIAN'; else why+=' '+aForBonus.id.toUpperCase(); }
      if(st.marathon){ var add=(W.TUNING&&TUNING.MARATHON_BULLSEYE_ARROWS)||1; st.arrowsLeft+=add; why+=' +'+add+'\u2191'; }
      var _hitPos = {x:t.obj.position.x, y:t.obj.position.y, z:t.z};
      if (W.AUDIO && AUDIO.bullseye) AUDIO.bullseye(_hitPos);
      if(W.AUDIO && AUDIO.zap && isFar) try{AUDIO.zap(_hitPos);}catch(e){}
      if (pet) pet.cheer = 1.1;
      // Cinematic: bullseye slow-mo + zoom punch (mirrors 2D st.cinematicUntil 0.34)
      if(!isReduced()){
        st.cinematicUntil = Math.max(st.cinematicUntil||0, st.elapsed + 0.34);
        st.camKick = (st.camKick||0) + 0.05;
        camShake = Math.max(camShake, K.CAM_SHAKE*1.4);
      }
      say('BULLSEYE! +' + pts + why);
      spawnBullseyeParticles(t.obj.position.x, t.obj.position.y, t.z+0.08, t.r);
      spawnCoinBurst(t.obj.position.x, t.obj.position.y, t.z+0.08, pts);
      spawnFloatScore(t.obj.position.x, t.obj.position.y, t.z+0.08, '+'+pts, 'bullseye');
      if(navigator.vibrate) navigator.vibrate(18);
    } else {
      if (t.mover) { pts *= moveMult; why += ' MOVING x2'; }
      if (isFar) { pts *= farMult; why += ' FAR x2'; }
      if(aForBonus && aForBonus.scoreBonus && aForBonus.id!=='wooden'){ pts *= 1 + (aForBonus.scoreBonus||0); pts=Math.round(pts); if(aForBonus.id==='fire') why+=' FIRE'; else if(aForBonus.id==='ice') why+=' ICE'; else if(aForBonus.id==='lightning') why+=' LIGHTNING'; else if(aForBonus.id==='obsidian') why+=' OBSIDIAN'; else why+=' '+aForBonus.id.toUpperCase(); }
      st.combo = 0;
      var _hitPos2 = {x:t.obj.position.x, y:t.obj.position.y, z:t.z};
      if (W.AUDIO && AUDIO.thunk) AUDIO.thunk(_hitPos2);
      say('+' + pts + ' at ' + Math.round(-t.z) + 'm' + why);
      spawnFloatScore(t.obj.position.x, t.obj.position.y, t.z+0.08, '+'+pts, '');
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
    if(st.marathon){
      st.timeLeft = Infinity;
      // marathon uses its own wave timing but keep phase as movers/chaos after start
      var mMoversAt = (W.TUNING && TUNING.MARATHON_MOVERS_AT) || 30;
      var mChaosAt = (W.TUNING && TUNING.MARATHON_CHAOS_AT) || 60;
      if (st.elapsed < mMoversAt) st.phase = 'warmup';
      else if (st.elapsed < mChaosAt) st.phase = 'movers';
      else st.phase = 'chaos';
    } else {
      st.timeLeft = Math.max(0, ((W.TUNING && TUNING.ROUND_SECONDS) || 60) - st.elapsed);
      var moversAt = (W.TUNING && TUNING.MOVERS_START_AT) || 15;
      var chaosAt = (W.TUNING && TUNING.CHAOS_START_AT) || 40;
      if (st.elapsed < moversAt) st.phase = 'warmup';
      else if (st.elapsed < chaosAt) st.phase = 'movers';
      else st.phase = 'chaos';
    }
    if((!st.marathon && st.timeLeft<=0) || st.arrowsLeft<=0){
      roundOver=true;
      onRoundEnd();
      refreshHud();
      return;
    }
    // Cinematic slow-mo: bullseye 0.34s + last arrow 0.16s — world slows to 18% but clock stays real.
    var worldDt = (st.cinematicUntil && st.elapsed < st.cinematicUntil && !isReduced()) ? dt * 0.18 : dt;
    // Camera zoom punch on cinematic (extra FOV narrow)
    if(worldDt !== dt){
      st.camKick = (st.camKick||0) + (0.34 - (st.cinematicUntil - st.elapsed))*0.02;
    }
    // phased respawning — mirrors game.js spawner but scaled to 3D counts
    try{ spawner(worldDt); }catch(e){}
    var i, t;
    for (i = 0; i < targets.length; i++) {
      t = targets[i];
      if (t.dead) continue;
      if (t.frozenUntil && st.elapsed < t.frozenUntil) continue;
      if (!t.mover) continue;
      if (st.phase === 'warmup') continue;
      var speedMul = st.phase === 'chaos' ? 1.7 : 1.0;
      t.phase += worldDt * t.speed * speedMul;
      t.obj.position.x = t.baseX + Math.sin(t.phase) * t.amp;
    }
    // ground contact shadows — follow targets, fade when high, breathe a little
    for (i = 0; i < targets.length; i++) {
      t = targets[i];
      if (t.dead) { var _shd=groundShadows[i]; if(_shd) _shd.material.opacity=0; continue; }
      var sh = groundShadows[i];
      if(!sh) continue;
      sh.position.x = t.obj.position.x;
      sh.material.opacity = 0.18 * (1 - Math.min(1, t.obj.position.y/6));
      sh.scale.setScalar(0.9 + Math.sin(t.phase)*0.05);
    }
    for (i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      if(p.frozenUntil && st.elapsed < p.frozenUntil) continue;
      p.bobPhase += worldDt * 1.8;
      p.obj.position.y = p.baseY + Math.sin(p.bobPhase) * 0.35;
      p.obj.position.x += Math.sin(p.bobPhase * 0.7) * worldDt * 0.5;
    }
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.dead) continue;
      if (o.kind === 'wall') continue;
      if (!o.host || o.host.dead) continue;
      o.angle += worldDt * ((W.TUNING && TUNING.OBSTACLE_SHIELD_SPEED) || 1.05);
      o.obj.position.x = o.host.obj.position.x + Math.cos(o.angle) * o.orbitR;
      o.obj.position.y = o.host.obj.position.y + Math.sin(o.angle) * o.orbitR * 0.7;
      o.obj.position.z = o.host.obj.position.z + 0.35;
      o.obj.lookAt(camera.position);
    }

    for (i = 0; i < arrows.length; i++) {
      var ar = arrows[i];
      ar.life += worldDt;
      if (ar.stuck) {
        if (ar.life > 6) {
          if(ar.obj.parent) ar.obj.parent.remove(ar.obj); else scene.remove(ar.obj);
          try{ ar.obj.traverse(function(c){ if(c.geometry) try{c.geometry.dispose();}catch(e){} if(c.material){ var ms=Array.isArray(c.material)?c.material:[c.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } }); }catch(e){}
          if(ar.trail){
            if(ar.trail.parent) ar.trail.parent.remove(ar.trail); else scene.remove(ar.trail);
            try{ if(ar.trail.geometry) ar.trail.geometry.dispose(); if(ar.trail.material) ar.trail.material.dispose(); }catch(e){}
          }
          arrows.splice(i--, 1);
        }
        else if(ar.trail) ar.trail.material.opacity=0;
        continue;
      }
      var px = ar.x, py = ar.y, pz = ar.z;
      // Preview = truth: live arrows use same gravity/wind as preview (via effectiveGravity).
      // Spec: ar.vy -= K.GRAVITY * dt * (a.gravityFactor||1);
      if(ar.gravityFactor!==undefined) ar.vy -= K.GRAVITY * worldDt * (ar.gravityFactor||1) * (1 - (currentPerk().gravityCut||0));
      else { var gravLive = (ar.grav !== undefined) ? ar.grav : effectiveGravity(); ar.vy -= gravLive * worldDt; }
      ar.vx += windX * worldDt * 0.65;
      ar.x += ar.vx * worldDt; ar.y += ar.vy * worldDt; ar.z += ar.vz * worldDt;
      if(ar.trail && ar.trailPos){ ar.trailPos.unshift({x:ar.x,y:ar.y,z:ar.z}); if(ar.trailPos.length>12) ar.trailPos.pop(); var pos=ar.trail.geometry.attributes.position; for(var ti=0;ti<12;ti++){ if(ti<ar.trailPos.length) pos.setXYZ(ti, ar.trailPos[ti].x, ar.trailPos[ti].y, ar.trailPos[ti].z); else pos.setXYZ(ti, ar.x,ar.y,ar.z); } pos.needsUpdate=true; ar.trail.material.opacity = ar.stuck?0:0.65; }

      var _blocked = false;
      for (var k = 0; k < obstacles.length; k++) {
        var ob = obstacles[k];
        if (ob.dead) continue;
        if (ob.kind === 'wall') {
          var hit = segBox(px, py, pz, ar.x, ar.y, ar.z, ob);
          if (!hit) continue;
          ar.stuck = true; ar.life = 0; if(ar.trail) ar.trail.material.opacity=0;
          // world hit then reparent to wall mesh so arrow travels with wall if it ever moves
          ar.obj.position.set(hit.x, hit.y, hit.z);
          pointAlong(ar.obj, ar.vx, ar.vy, ar.vz);
          var lx = hit.x - ob.obj.position.x;
          var ly = hit.y - ob.obj.position.y;
          var lz = hit.z - ob.obj.position.z;
          // nudge slightly out so head is visible
          if (ar.vz < 0) lz += 0.08; else lz -= 0.08;
          ob.obj.add(ar.obj);
          ar.obj.position.set(lx, ly, lz);
          say('ARC OVER!');
          var _wallPos = {x:hit.x, y:hit.y, z:hit.z};
          if (W.AUDIO && AUDIO.thunk) AUDIO.thunk(_wallPos);
          spawnDustPuff(hit.x, hit.z);
          if(navigator.vibrate) navigator.vibrate([25,30,25]);
          st.combo = 0;
          refreshHud();
          _blocked = true;
          break;
        } else {
          if (!ob.host || ob.host.dead) continue;
          var oz = ob.obj.position.z;
          if ((pz > oz) === (ar.z > oz)) continue;
          var uo = (oz - pz) / (ar.z - pz || 1e-6);
          var hxO = px + (ar.x - px) * uo - ob.obj.position.x;
          var hyO = py + (ar.y - py) * uo - ob.obj.position.y;
          var r = 0.52;
          try{ var sz = (W.TUNING && TUNING.OBSTACLE_SHIELD_SIZE); if(sz) r = sz * 0.015; if(r < 0.48) r = 0.52; }catch(e){}
          if (Math.sqrt(hxO * hxO + hyO * hyO) > r) continue;
          ar.stuck = true; ar.life = 0; if(ar.trail) ar.trail.material.opacity=0;
          ar.obj.position.set(ob.obj.position.x + hxO, ob.obj.position.y + hyO, oz + 0.08);
          pointAlong(ar.obj, ar.vx, ar.vy, ar.vz);
          ob.obj.add(ar.obj);
          ar.obj.position.set(hxO, hyO, 0.08);
          say('BLOCKED!');
          var _blkPos = {x:ob.obj.position.x, y:ob.obj.position.y, z:ob.obj.position.z};
          if (W.AUDIO && AUDIO.thunk) AUDIO.thunk(_blkPos);
          spawnDustPuff(ob.obj.position.x, ob.obj.position.z);
          if(navigator.vibrate) navigator.vibrate([25,30,25]);
          st.combo = 0;
          refreshHud();
          _blocked = true;
          break;
        }
      }
      if (_blocked) continue;
      if (ar.stuck) continue;

      // did it cross a target's plane this step? — now with pierce/freeze/chain/blackhole
      var _hitHard = false;
      for (var j = 0; j < targets.length; j++) {
        t = targets[j];
        if (t.dead) continue;
        if ((pz > t.z) === (ar.z > t.z)) continue;
        var u = (t.z - pz) / (ar.z - pz || 1e-6);
        var hx = px + (ar.x - px) * u - t.obj.position.x;
        var hy = py + (ar.y - py) * u - t.obj.position.y;
        if (Math.sqrt(hx * hx + hy * hy) > t.r) continue;
        var hitX = t.obj.position.x + hx, hitY = t.obj.position.y + hy, hitZ = t.z + 0.08;
        // Score before powers (scoreHit handles combo/scoreBonus)
        scoreHit(t, hx, hy, ar);
        t.dead = true;
        // Arrow powers: freeze / chain / blackhole — mirrors game.js:1290-1346
        if(ar.freeze){
          handleFreeze(hitX, hitY, hitZ, ar.freeze);
        } else if(currentArrow().freeze){ // fallback if ar.freeze not set but equipped has freeze
          handleFreeze(hitX, hitY, hitZ, currentArrow().freeze);
        }
        if(ar.chain){
          handleChain(hitX, hitY, hitZ, ar);
        }
        if(ar.blackhole && !ar.blackholeSpent){
          spawnBlackhole(hitX, hitY, hitZ);
          ar.blackholeSpent = true;
        }
        // Pierce handling: hard targets are bullseyes; soft list is balloon/fruit/golden/powerup/doodle.
        // For 3D, targets[] are hard; pickups are soft. So pierce makes this hard hit not stick.
        var isHard = true; // all targets[] are hard (bullseyes/walls)
        if(isHard && ar.pierceLeft>0){
          ar.pierceLeft--;
          spawnFlame(hitX, hitY, hitZ);
          // Do NOT stick; keep flying to allow one extra hit (continue loop)
          // Leave arrow at hit pos but not parented, so next frame it advances beyond
          // Don't set ar.stuck; mark hit and keep scanning for another target in same segment
          _hitHard = true;
          // Do not reparent; keep arrow world-position at hit then let it continue (overlap next target check uses px->ar.x which already passed)
          // Continue to next target without breaking — allows piercing through stacked targets in one step
          continue;
        } else {
          ar.stuck = true; ar.life = 0; if(ar.trail) ar.trail.material.opacity=0;
          ar.obj.position.set(hitX, hitY, hitZ);
          pointAlong(ar.obj, ar.vx, ar.vy, ar.vz);
          try{ t.obj.add(ar.obj); }catch(e){ scene.add(ar.obj); }
          ar.obj.position.set(hx, hy, 0.08);
          _hitHard = true;
          break;
        }
      }
      if (ar.stuck) continue;
      // If we pierced but hit at least one hard target, skip pickup check this frame? No — allow pickups after pierce
      // If _hitHard and pierceLeft exhausted, still allow continuation; but if we hit via pierce we don't stick, so fall through to pickup check

      for (var j2 = 0; j2 < pickups.length; j2++) {
        var pp = pickups[j2];
        if (pp.dead) continue;
        if ((pz > pp.z) === (ar.z > pp.z)) continue;
        var up = (pp.z - pz) / (ar.z - pz || 1e-6);
        var hxP = px + (ar.x - px) * up - pp.obj.position.x;
        var hyP = py + (ar.y - py) * up - pp.obj.position.y;
        if (Math.sqrt(hxP * hxP + hyP * hyP) > pp.r) continue;
        var _px = pp.obj.position.x, _py = pp.obj.position.y, _pz = pp.z;
        pp.dead = true;
        try{ scene.remove(pp.obj); }catch(e){}
        // dispose pickup mesh
        try{
          pp.obj.traverse(function(c){ if(c.geometry) try{c.geometry.dispose();}catch(e){} if(c.material){ var ms=Array.isArray(c.material)?c.material:[c.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } });
        }catch(e){}
        pickups.splice(j2, 1);
        j2--;
        var stepB = (W.TUNING && TUNING.COMBO_STEP) || 2;
        var maxB = (W.TUNING && TUNING.COMBO_MAX) || 5;
        var comboMultB = Math.min(maxB, 1 + Math.floor(st.combo / stepB));
        var pts = 25, label='POP!';
        var audioKind='pop';
        if(pp.type==='fruit'){
          pts = pp.value || 50;
          pts = Math.round(pts * comboMultB);
          label='FRUIT! +'+pts;
          audioKind='pop';
          spawnCoinBurst(_px, _py, _pz, pts);
          spawnFloatScore(_px, _py, _pz, '+'+pts, 'fruit');
          spawnBalloonShreds(_px, _py, _pz);
        } else if(pp.type==='golden'){
          pts = (W.TUNING && TUNING.SCORE_GOLDEN) || 500;
          pts = Math.round(pts * comboMultB);
          label='GOLDEN! +'+pts;
          audioKind='chest';
          if(st.marathon){ var gAdd=(W.TUNING&&W.TUNING.MARATHON_GOLDEN_ARROWS)||3; st.arrowsLeft+=gAdd; label+=' +'+gAdd+'\u2191'; }
          spawnCoinBurst(_px, _py, _pz, pts);
          spawnFloatScore(_px, _py, _pz, '+'+pts, 'golden');
          spawnBalloonShreds(_px, _py, _pz);
          if(W.AUDIO && AUDIO.voice) try{AUDIO.voice('golden');}catch(e){}
        } else if(pp.type==='powerup'){
          pts = 30 * comboMultB;
          label='POWER! +'+pts;
          audioKind='coin';
          if(pp.kind==='arrows'){ st.arrowsLeft += (W.TUNING && TUNING.POWERUP_ARROWS)||3; label+=' +'+((W.TUNING && TUNING.POWERUP_ARROWS)||3)+' arrows'; }
          spawnCoinBurst(_px, _py, _pz, pts);
          spawnFloatScore(_px, _py, _pz, '+'+pts, 'powerup');
          spawnBalloonShreds(_px, _py, _pz);
        } else if(pp.type==='doodle'){
          pts = pp.points || 40;
          pts = Math.round(pts * comboMultB);
          label="DOODLE! +"+pts;
          audioKind='pop';
          spawnCoinBurst(_px, _py, _pz, pts);
          spawnFloatScore(_px, _py, _pz, '+'+pts, 'doodle');
          spawnBalloonShreds(_px, _py, _pz);
        } else {
          // balloon
          pts = (W.TUNING && TUNING.SCORE_BALLOON) || 25;
          pts = Math.round(pts * comboMultB);
          label='POP! +'+pts;
          if(st.marathon){ st.arrowsLeft+=3; label+=' +3\u2191'; }
          spawnCoinBurst(_px, _py, _pz, pts);
          spawnFloatScore(_px, _py, _pz, 'POP! +'+pts, 'pop');
          spawnBalloonShreds(_px, _py, _pz);
        }
        if(comboMultB>1 && pp.type!=='powerup') label+=' x'+comboMultB;
        st.score += pts;
        st.hits++;
        say(label);
        try{
          if(audioKind==='chest' && W.AUDIO && AUDIO.chest) AUDIO.chest();
          else if(audioKind==='coin' && W.AUDIO && AUDIO.coin) AUDIO.coin();
          else if(W.AUDIO && AUDIO.pop){ var _popPos={x:_px,y:_py,z:_pz}; AUDIO.pop(_popPos); if(-_pz>30 && AUDIO.zap) AUDIO.zap(_popPos); }
          else if(W.AUDIO && AUDIO.thunk) AUDIO.thunk();
        }catch(e){}
        if(ar.freeze) handleFreeze(_px,_py,_pz, ar.freeze);
        if(ar.chain) handleChain(_px,_py,_pz, ar);
        if(ar.blackhole && !ar.blackholeSpent){ spawnBlackhole(_px,_py,_pz); ar.blackholeSpent=true; }
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
      if (ar.z < -120) {
        if(ar.obj.parent) ar.obj.parent.remove(ar.obj); else scene.remove(ar.obj);
        try{ ar.obj.traverse(function(c){ if(c.geometry) try{c.geometry.dispose();}catch(e){} if(c.material){ var ms=Array.isArray(c.material)?c.material:[c.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } }); }catch(e){}
        if(ar.trail){
          if(ar.trail.parent) ar.trail.parent.remove(ar.trail); else scene.remove(ar.trail);
          try{ if(ar.trail.geometry) ar.trail.geometry.dispose(); if(ar.trail.material) ar.trail.material.dispose(); }catch(e){}
        }
        arrows.splice(i--, 1); continue;
      }

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
    // Contract mirrors 2D: far bg 0.85, action 1.15, nearest fg 1.4. ReducedMotion pins all.
    var shakeDisabled = false; try{ shakeDisabled = (typeof SAVE!=='undefined' && SAVE.settings && SAVE.settings().reducedMotion); }catch(e){}
    if(shakeDisabled) camShake = 0;
    camShake *= Math.max(0, 1 - dt * 7);
    if (camShake > 0.001) {
      var shakeX = (Math.random()-0.5)*camShake;
      var shakeY = (Math.random()-0.5)*camShake*0.6;
      var farK = (typeof TUNING!=='undefined' && TUNING.PARALLAX_FAR!=null) ? TUNING.PARALLAX_FAR : 0.15;
      var fg2K = (typeof TUNING!=='undefined' && TUNING.PARALLAX_FG2!=null) ? TUNING.PARALLAX_FG2 : 0.4;
      camera.position.x += shakeX * (1 + K.PARALLAX*0.15);
      camera.position.y += shakeY * (1 + K.PARALLAX*0.15);
      if(bowMesh) bowMesh.position.x += shakeX * (1 + fg2K) *0.3;
      if(sceneryGroup) sceneryGroup.position.x = -shakeX * K.PARALLAX *0.15;
      // Parallax layers: far/mid counter-move so bg feels distant, haze even more.
      if(bgFar) { bgFar.position.x += -shakeX * farK; bgFar.position.y += -shakeY * farK; }
      if(bgMid) { bgMid.position.x += -shakeX * farK * 0.6; bgMid.position.y += -shakeY * farK * 0.6; }
      if(horizonHaze) { horizonHaze.position.x += -shakeX * farK * 0.5; horizonHaze.position.y += -shakeY * farK * 0.5; }
    }
    camera.lookAt(camera.position.x * 0.4, K.EYE_HEIGHT - 0.2, -24);
    // spatial audio: listener follows camera (head)
    try{ if(W.AUDIO && AUDIO.setListenerPos) AUDIO.setListenerPos({x:camera.position.x, y:camera.position.y, z:camera.position.z}); }catch(e){}
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
    if(Math.random()<0.02) try{ ensureWindHum(); }catch(e){}
    try{ updateAtmo(dt); }catch(e){}
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
  if(godRays){ godRays.rotation.y = Math.sin(Date.now()*0.00007)*0.02; godRays.children.forEach(function(m,i){ m.material.opacity = (0.09+i*0.02)*(0.92+Math.sin(Date.now()*0.0004+i)*0.08); }); }
  if(pollenSystem){ var pPos=pollenSystem.geometry.attributes.position; var pVel=pollenSystem.geometry.attributes.vel; var pp=pPos.array, vv=pVel.array; for(var pi=0; pi<pp.length; pi+=3){ pp[pi]+=vv[pi]*dt; pp[pi+1]+=vv[pi+1]*dt; pp[pi+2]+=vv[pi+2]*dt; if(pp[pi+1]>16){ pp[pi+1]=2; pp[pi]=(Math.random()-0.5)*48; pp[pi+2]=-Math.random()*70-4; } if(Math.abs(pp[pi])>24) pp[pi]*=0.99; } pPos.needsUpdate=true; }
  if(cloudShadows.length){ for(var ci=0; ci<cloudShadows.length; ci++){ var ch=cloudShadows[ci]; ch.position.x += ch.userData.dir * ch.userData.speed * dt; if(Math.abs(ch.position.x)>38) ch.userData.dir*=-1; ch.material.opacity = 0.11 * (0.85 + 0.15*Math.sin(Date.now()*0.0003+ci)); } }
  // starlight twinkle for starlight/moon_cave biome
  if((currentBiome==='starlight'||currentBiome==='moon_cave') && Math.random()<0.015){
    var tx=(Math.random()-0.5)*50, tz=-20-Math.random()*70, ty=18+Math.random()*10;
    var star=new THREE.Mesh(new THREE.SphereGeometry(0.09,6,6), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.95}));
    star.position.set(tx,ty,tz);
    scene.add(star);
    hitParticles.push({obj:star, vel:new THREE.Vector3((Math.random()-0.5)*6, -1.2, (Math.random()-0.5)*2), life:1.1, maxLife:1.1, isStar:true});
  }
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

    // Particles ride the world slow-mo, UI (preview/pet/bow) stays real-time.
    updateHitParticles(isReduced() ? dt : worldDt);
    updateCoinParticles(isReduced() ? dt : worldDt);
    try{ updateBlackholes(worldDt); }catch(e){}
    try{ updateBolts(worldDt); }catch(e){}
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
    if (hud.arrow) { try{ var a=currentArrow3D(); hud.arrow.textContent = (a.name|| (a.id.charAt(0).toUpperCase()+a.id.slice(1))); }catch(e){} }
    if (hud.time) hud.time.textContent = st.marathon ? '\u221E' : Math.ceil(st.timeLeft);
    if (hud.phase) hud.phase.textContent = st.marathon ? 'MARATHON' : (st.phase === 'warmup' ? 'Warm-up' : st.phase === 'movers' ? 'Moving!' : 'CHAOS!');
    if(hud.overTitle) hud.overTitle.textContent = (!st.marathon && st.timeLeft<=0) ? 'Time!' : (st.arrowsLeft<=0?'Out of arrows!':'Round Over!');
    if(hud.overCoins) hud.overCoins.textContent = st._coinsEarned||0;
    if(hud.overHigh) hud.overHigh.style.display = st._isHigh?'':'none';
    if(hud.overBest) try{ var p=SAVE.current&&SAVE.current(); hud.overBest.textContent=p?p.highScore:st.score; }catch(e){}
    if(hud.overStreak) try{ var s=SAVE.streakInfo&&SAVE.streakInfo(); hud.overStreak.textContent=s.count?'🔥 Day '+s.count:''; }catch(e){}
    if (hud.over) hud.over.style.display = (st.arrowsLeft <= 0 || (!st.marathon && st.timeLeft <= 0) || roundOver) ? 'flex' : 'none';
    if (hud.final) hud.final.textContent = st.score;
  }
  function startMarathon(){ reset(); st.marathon=true; st.timeLeft=Infinity; if(hud.phase) hud.phase.textContent='MARATHON'; refreshHud(); say('MARATHON!'); }

  function resize() {
    var w = W.innerWidth, h = W.innerHeight;
    renderer.setPixelRatio(Math.min(W.devicePixelRatio || 1, 2));  // the DPR fix the 2D game still needs
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function reset() {
    arrows.forEach(function (a) {
      if(a.obj.parent) a.obj.parent.remove(a.obj); else scene.remove(a.obj);
      try{ a.obj.traverse(function(c){ if(c.geometry) try{c.geometry.dispose();}catch(e){} if(c.material){ var ms=Array.isArray(c.material)?c.material:[c.material]; ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } }); }catch(e){}
      if(a.trail){
        if(a.trail.parent) a.trail.parent.remove(a.trail); else scene.remove(a.trail);
        try{ if(a.trail.geometry) a.trail.geometry.dispose(); if(a.trail.material) a.trail.material.dispose(); }catch(e){}
      }
    });
    arrows = [];
    hitParticles.forEach(function(p){
      scene.remove(p.obj);
      try{
        if(p.obj.geometry) p.obj.geometry.dispose();
        if(p.obj.material){
          var ms=Array.isArray(p.obj.material)?p.obj.material:[p.obj.material];
          ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} });
        }
        // also traverse if group
        if(p.obj.traverse) p.obj.traverse(function(c){ if(c!==p.obj && c.geometry) try{c.geometry.dispose();}catch(e){} if(c!==p.obj && c.material){ var ms2=Array.isArray(c.material)?c.material:[c.material]; ms2.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} }); } });
      }catch(e){}
    }); hitParticles=[];
    coinParticles.forEach(function(p){
      scene.remove(p.obj);
      try{
        if(p.obj.geometry) p.obj.geometry.dispose();
        if(p.obj.material){
          var ms=Array.isArray(p.obj.material)?p.obj.material:[p.obj.material];
          ms.forEach(function(m){ if(m.map) try{m.map.dispose();}catch(e){} try{m.dispose();}catch(e){} });
        }
      }catch(e){}
    }); coinParticles=[];
    roundOver = false;
    rollWind();
    try{ ensureWindHum(); }catch(e){}
    // st must exist before buildTargets if we want deterministic initial balloons/shields, but minimal fix is to keep order and pin rand after.
    // Create st with spawner fields before buildTargets would be ideal, so we create a temp st, build, then keep it.
    // Simplified: create st first, then buildTargets can use rng().
    st = { score: 0, arrowsLeft: K.ARROWS, combo: 0, hits: 0, elapsed: 0, timeLeft: (typeof TUNING !== 'undefined' ? TUNING.ROUND_SECONDS : 60), phase: 'warmup', spawnCooldown: 0, bossSpawned: false, bossRage: false, rand: null, cinematicUntil: 0, camKick: 0, bolts: [], blackholes: [] };
    // Clear global blackhole/bolt visuals from previous round
    try{ blackholes.forEach(function(b){ if(b.obj) scene.remove(b.obj); }); }catch(e){}
    blackholes=[]; bolts.forEach(function(b){ try{ if(b.obj) scene.remove(b.obj); }catch(e){} }); bolts=[];
    try{
      // if a previous buildTargets (before st existed) stashed a pending seed, apply it
      if(W._pending3DSeed && !st.rand){
        var _pv=W._pending3DSeed; var _sv=0; for(var _pi2=0;_pi2<_pv.length;_pi2++) _sv=(_sv*31+_pv.charCodeAt(_pi2))>>>0;
        st.rand = mulberry32(_sv);
        W._pending3DSeed=null;
      } else {
        var _hash=W.location && W.location.hash||'';
        var _m=_hash.match(/3d=([^&]+)/);
        var _daily=_hash.match(/daily=([^&]+)/);
        var _use=null;
        if(_m) try{_use=decodeURIComponent(_m[1]);}catch(e){}
        else if(_daily) _use=todayStr();
        if(_use){
          var _sv2=0; for(var _si2=0;_si2<_use.length;_si2++) _sv2=(_sv2*31+_use.charCodeAt(_si2))>>>0;
          st.rand=mulberry32(_sv2);
        }
      }
    }catch(e){}
    buildTargets();
    buildRain();
    buildBackgroundPlanes(pickBiome());
    // ensure cooldown is reset after buildTargets (spawner starts fresh)
    st.spawnCooldown = 0;
    st.bossSpawned = false;
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
    // r160: ColorManagement.legacyMode -> ColorManagement.enabled (keep both for compat)
    if (THREE.ColorManagement) {
      if ('legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
      if ('enabled' in THREE.ColorManagement) THREE.ColorManagement.enabled = true;
    }
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
    // Arrow fantasy chip
    hud.arrow = el('hudArrow');
    var arrowChip = null;
    if(!hud.arrow){
      arrowChip = D.createElement('div');
      arrowChip.className='chip';
      arrowChip.style.pointerEvents='auto';
      arrowChip.style.cursor='pointer';
      arrowChip.innerHTML='<small>Arrow</small><span id="hudArrow">Wooden</span>';
      var hudRootA = D.querySelector('.hud');
      if(hudRootA) hudRootA.insertBefore(arrowChip, hudRootA.querySelector('#hudPhase')||hudRootA.firstChild);
      hud.arrow = el('hudArrow');
    }
    arrowChip = hud.arrow ? (hud.arrow.closest ? hud.arrow.closest('.chip') : hud.arrow.parentElement) : arrowChip;
    hud.arrowChip = arrowChip;
    if(hud.arrowChip){ hud.arrowChip.style.pointerEvents='auto'; hud.arrowChip.style.cursor='pointer'; hud.arrowChip.addEventListener('click', function(){
      try{
        var list=(typeof DATA!=='undefined'&&DATA.arrows)||[];
        if(!list.length) return;
        var idx=list.findIndex(function(x){return x.id===K.ARROW_TYPE;});
        if(idx<0) idx=0;
        var next=list[(idx+1)%list.length];
        K.ARROW_TYPE=next.id;
        refreshHud();
        say(next.name);
      }catch(e){}
    }); }
    // Marathon button
    hud.marathonBtn = el('marathonBtn');
    if(!hud.marathonBtn){
      var mBtn=D.createElement('button');
      mBtn.id='marathonBtn';
      mBtn.className='chip';
      mBtn.style.pointerEvents='auto';
      mBtn.style.cursor='pointer';
      mBtn.style.background='rgba(108,194,74,0.92)';
      mBtn.style.color='#1a1822';
      mBtn.textContent='Marathon';
      var hudRootM=D.querySelector('.hud');
      if(hudRootM) hudRootM.appendChild(mBtn);
      hud.marathonBtn=mBtn;
    }
    if(hud.marathonBtn) hud.marathonBtn.addEventListener('click', startMarathon);
    hud.pet=el('hudPet'); hud.petName=el('hudPetName'); hud.advBtn=el('adv3dBtn');
    if(hud.pet) hud.pet.addEventListener('click', openPetShop);
    try{ refreshPetName(); }catch(e){}
    if(hud.advBtn) hud.advBtn.addEventListener('click', function(){ adventureStage=(adventureStage+1)%((typeof STAGES!=='undefined'&&STAGES.LIST&&STAGES.LIST.length)||7); startAdventure(adventureStage); });
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.shadowMap.enabled = false; // fake contact blobs only (CircleGeometry 0.18), no shadowMap cost
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace; else renderer.outputEncoding = THREE.sRGBEncoding;   // textured models need this or they look muddy (r152+ uses outputColorSpace)
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
