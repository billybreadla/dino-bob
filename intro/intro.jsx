/* Dino Bob — Opening Sequence
   Self-contained timeline animation. Mounts as window.Opening (a React component).
   Engine (Stage/PlaybackBar + easing helpers) is inlined so there is no cross-file
   global race; the whole sequence is driven off a single useTime() playhead.        */

const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;

/* ───────────────────────── easing + interpolation ───────────────────────── */
const Easing = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: t => (--t) * t * t + 1,
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outQuart: t => 1 - (--t) * t * t * t,
  outExpo: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  outSine: t => Math.sin((t * Math.PI) / 2),
  inSine: t => 1 - Math.cos((t * Math.PI) / 2),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: t => { const c4 = (2 * Math.PI) / 3; if (t === 0) return 0; if (t === 1) return 1; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function interpolate(input, output, ease = Easing.linear) {
  return t => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const lt = span === 0 ? 0 : (t - input[i]) / span;
        const ef = Array.isArray(ease) ? (ease[i] || Easing.linear) : ease;
        return output[i] + (output[i + 1] - output[i]) * ef(lt);
      }
    }
    return output[output.length - 1];
  };
}
// single-segment tween, clamped outside [start,end]
function seg(t, start, end, from, to, ease = Easing.inOutCubic) {
  if (t <= start) return from;
  if (t >= end) return to;
  return from + (to - from) * ease((t - start) / (end - start));
}
// pulse helper 0..1..0 across [start,end]
function pulse(t, start, end) {
  if (t < start || t > end) return 0;
  const p = (t - start) / (end - start);
  return Math.sin(p * Math.PI);
}

/* ───────────────────────── timeline context + Stage ──────────────────────── */
const TL = createContext({ time: 0, duration: 10 });
const useTime = () => useContext(TL).time;

function IconButton({ children, onClick, title }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: h ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#f3efe6',
        cursor: 'pointer', padding: 0, transition: 'background 120ms' }}>
      {children}
    </button>
  );
}

function PlaybackBar({ time, duration, playing, onPlayPause, onReset, onSeek, onHover }) {
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const tFromE = e => { const r = trackRef.current.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * duration; };
  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(false);
    const mv = e => { if (trackRef.current) onSeek(tFromE(e)); };
    window.addEventListener('mouseup', up); window.addEventListener('mousemove', mv);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv); };
  }, [drag]);
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const fmt = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100); return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
      background: 'rgba(18,16,14,0.94)', borderTop: '1px solid rgba(255,255,255,0.08)',
      width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 8, color: '#f3efe6',
      fontFamily: 'Fredoka, system-ui, sans-serif', userSelect: 'none', flexShrink: 0 }}>
      <IconButton onClick={onReset} title="Restart (0)">
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2v10M12 2L5 7l7 5V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" fill="none" /></svg>
      </IconButton>
      <IconButton onClick={onPlayPause} title="Play/pause (space)">
        {playing
          ? <svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="2" width="3" height="10" fill="currentColor" /><rect x="8" y="2" width="3" height="10" fill="currentColor" /></svg>
          : <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2l9 5-9 5V2z" fill="currentColor" /></svg>}
      </IconButton>
      <div style={{ fontFamily: mono, fontSize: 12, width: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(time)}</div>
      <div ref={trackRef} onMouseDown={e => { setDrag(true); onSeek(tFromE(e)); }}
        onMouseMove={e => { if (!drag) onHover(tFromE(e)); }} onMouseLeave={() => !drag && onHover(null)}
        style={{ flex: 1, height: 22, position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.14)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 0, width: pct + '%', height: 4, background: '#e8a13c', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: pct + '%', top: '50%', width: 12, height: 12, marginLeft: -6, marginTop: -6, background: '#fff', borderRadius: 6, boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }} />
      </div>
      <div style={{ fontFamily: mono, fontSize: 12, width: 62, color: 'rgba(243,239,230,0.5)', fontVariantNumeric: 'tabular-nums' }}>{fmt(duration)}</div>
    </div>
  );
}

function Stage({ width, height, duration, background = '#0a0a0a', persistKey = 'stage', showBar = true, loop = true, onTap, children }) {
  const [time, setTime] = useState(() => { if (!loop) return 0; try { const v = parseFloat(localStorage.getItem(persistKey + ':t') || '0'); return isFinite(v) ? clamp(v, 0, duration) : 0; } catch { return 0; } });
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(null);
  const [scale, setScale] = useState(1);
  const wrapRef = useRef(null), raf = useRef(null), last = useRef(null);
  useEffect(() => { if (!loop) return; try { localStorage.setItem(persistKey + ':t', String(time)); } catch {} }, [time]);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => { const s = Math.min(el.clientWidth / width, (el.clientHeight - (showBar ? 52 : 0)) / height); setScale(Math.max(0.05, s)); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [width, height, showBar]);
  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let elapsed = 0, autoAdvanced = false;
    const step = ts => {
      if (last.current == null) last.current = ts;
      const dt = (ts - last.current) / 1000; last.current = ts;
      // loop mode wraps; play-once mode lets time grow past duration so the
      // "TAP TO START" blink keeps animating while the scene holds on its end.
      setTime(t => { let n = t + dt; if (loop && n >= duration) n = n % duration; return n; });
      // play-once: if the scene has held a few seconds past its end and nobody
      // has tapped, auto-advance so a child is never stuck on the last frame.
      if (!loop && onTap && !autoAdvanced) {
        elapsed += dt;
        if (elapsed >= duration + 3) { autoAdvanced = true; onTap(); }
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); last.current = null; };
  }, [playing, duration]);
  useEffect(() => {
    const onKey = e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.code === 'ArrowLeft') setTime(t => clamp(t - (e.shiftKey ? 1 : 0.1), 0, duration));
      else if (e.code === 'ArrowRight') setTime(t => clamp(t + (e.shiftKey ? 1 : 0.1), 0, duration));
      else if (e.key === '0' || e.code === 'Home') setTime(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration]);
  const dt = hover != null ? hover : time;
  useEffect(() => { window.__seek = (x) => { setPlaying(false); setTime(clamp(x, 0, duration)); }; window.__play = () => setPlaying(true); }, [duration]);
  const ctx = useMemo(() => ({ time: dt, duration }), [dt, duration]);
  return (
    <div ref={wrapRef} onPointerDown={onTap} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0b0a09', cursor: onTap ? 'pointer' : 'default' }}>
      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width, height, background, position: 'relative', transform: `scale(${scale})`, transformOrigin: 'center', flexShrink: 0, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.5)' }}>
          <TL.Provider value={ctx}>{children}</TL.Provider>
        </div>
      </div>
      {showBar && (
        <PlaybackBar time={dt} duration={duration} playing={playing}
          onPlayPause={() => setPlaying(p => !p)} onReset={() => setTime(0)} onSeek={setTime} onHover={setHover} />
      )}
    </div>
  );
}

/* ───────────────────────────── assets + constants ────────────────────────── */
const A = {
  forest: 'assets/forest.png',
  dinoFront: 'assets/dino_0.png',
  dinoAim: 'assets/dino_3.png',
  bow: 'assets/bow.png',
  fire: 'assets/arrow_fire.png',
  target: 'assets/target.png',
  coin: 'assets/coin.png',
};
/* Playback speed — 1 = original pace, 1.5 = 50% faster. The whole sequence is
   driven off one playhead, so this one number rescales the entire animation. */
const SPEED = 1.5;
// scene timing (seconds)
const T = {
  dinoIn: 3.4, idle: 4.3, turn: 6.2, bowIn: 6.7,
  draw: 7.3, release: 11.0, flyA: 11.4, flyB: 14.2,
  impact: 14.2, title: 17.3,
};
// world anchor points (in 1920x1080 canvas space)
const DINO_X = 560, DINO_FEET = 902;
const BULLSEYE = { x: 1486, y: 470 };
const NOCK = { x: 792, y: 612 };           // where the arrow sits on the bow
const ARROW_ROT = 33;                       // deg to bring the fire-arrow art to horizontal (head right)

/* deterministic firefly field */
const FIREFLIES = Array.from({ length: 16 }, (_, i) => {
  const r = (a) => { const x = Math.sin(i * 12.9898 + a * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { x: 120 + r(1) * 1700, y: 180 + r(2) * 640, s: 3 + r(3) * 6, sp: 0.4 + r(4) * 0.9, ph: r(5) * 6.28, amp: 14 + r(6) * 34 };
});

/* ─────────────────────────────── sub-views ───────────────────────────────── */

function Firefly({ f, t }) {
  const dx = Math.sin(t * f.sp + f.ph) * f.amp;
  const dy = Math.cos(t * f.sp * 0.8 + f.ph) * f.amp * 0.6;
  const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + f.ph * 2));
  return (
    <div style={{ position: 'absolute', left: f.x + dx, top: f.y + dy, width: f.s, height: f.s, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,247,200,0.95) 0%, rgba(255,214,120,0.6) 40%, rgba(255,214,120,0) 70%)',
      boxShadow: `0 0 ${f.s * 2.4}px rgba(255,224,150,0.9)`, opacity: tw, pointerEvents: 'none' }} />
  );
}

/* the whole sequence */
function Scene() {
  const t = useTime() * SPEED;

  /* ── camera (applied to world wrapper): zoom toward a focus point ── */
  const camS = interpolate(
    [0, T.idle, T.draw, T.release, T.flyA, 13.5, T.impact, T.impact + 0.18, T.title, T.title + 1.2, 22],
    [1.07, 1.10, 1.24, 1.05, 1.02, 1.03, 1.20, 1.30, 1.20, 1.06, 1.06],
    Easing.inOutCubic)(t);
  const camFX = interpolate(
    [0, T.idle, T.draw, T.release, T.flyA, 13.6, T.impact, T.title, 22],
    [760, 660, 648, 980, 980, 1120, BULLSEYE.x, 960, 960],
    Easing.inOutCubic)(t);
  const camFY = interpolate(
    [0, T.idle, T.draw, T.release, T.impact, T.title, 22],
    [500, 560, 604, 560, BULLSEYE.y, 560, 560],
    Easing.inOutCubic)(t);
  // impact shake
  const shM = pulse(t, T.impact, T.impact + 0.55);
  const shk = shM > 0 ? Math.exp(-(t - T.impact) * 9) : 0;
  const shX = Math.sin(t * 92) * 26 * shk;
  const shY = Math.cos(t * 78) * 18 * shk;
  const camOX = camFX * (1 - camS) + shX;
  const camOY = camFY * (1 - camS) + shY;
  const worldTransform = `translate(${camOX}px, ${camOY}px) scale(${camS})`;

  /* ── forest ── */
  const fKB = interpolate([0, T.release, 22], [1.0, 1.06, 1.10], Easing.inOutSine)(t); // slow ken burns inside layer
  const fPanX = seg(t, T.flyA, T.flyB, 0, -120, Easing.inOutSine);
  const fBlur = pulse(t, T.flyA, T.flyB) * 2.4;
  const titleDim = seg(t, T.title - 0.2, T.title + 1.0, 0, 0.7, Easing.inOutCubic);
  // fade the whole action layer out as the title takes over
  const actionFade = 1 - seg(t, T.title - 0.05, T.title + 0.7, 0, 1, Easing.inOutCubic);

  /* ── Dino entrance / pose ── */
  const dinoInP = clamp((t - T.dinoIn) / 0.8, 0, 1);
  const dinoY = t < T.dinoIn ? 460 : (1 - Easing.outBack(dinoInP)) * 460;     // drop from above
  const dinoSquash = pulse(t, T.dinoIn + 0.72, T.dinoIn + 1.05);              // land squash
  const breathe = Math.sin(t * 2.3) * 0.012;
  const dinoOpacity = t < T.dinoIn ? 0 : clamp((t - T.dinoIn) / 0.35, 0, 1);
  // recoil on release
  const recoil = pulse(t, T.release, T.release + 0.5) * Math.exp(-(t - T.release) * 4);
  const dinoLean = (t >= T.release ? -recoil * 16 : 0);
  // cross-fade front -> aim pose at the turn
  const aimMix = clamp((t - T.turn) / 0.45, 0, 1);
  // title-scene hero hop
  const heroIn = clamp((t - (T.title + 1.0)) / 0.7, 0, 1);

  /* ── bow + nocked arrow ── */
  const bowOpacity = clamp((t - T.bowIn) / 0.4, 0, 1);
  const bowShake = pulse(t, T.release, T.release + 0.45) * Math.exp(-(t - T.release) * 5);
  // draw: arrow pulls back a touch (anticipation) then snaps on release
  const drawPull = seg(t, T.draw, T.release, 0, 26, Easing.inOutSine);   // px pulled left
  const nockShown = t >= T.bowIn && t < T.flyA;
  const nockPull = t < T.release ? drawPull : 0;
  const fireBuild = clamp((t - T.draw) / (T.release - T.draw), 0, 1);    // flame intensity 0..1
  const fireFlick = 0.86 + 0.14 * Math.sin(t * 22);

  /* ── flying arrow ── */
  const flying = t >= T.flyA && t <= T.impact + 0.02;
  const fp = clamp((t - T.flyA) / (T.flyB - T.flyA), 0, 1);
  const fpe = Easing.inOutCubic(fp);                                     // slow-fast-slow
  const ax = lerp(NOCK.x, BULLSEYE.x, fpe);
  const arcLift = Math.sin(fpe * Math.PI) * 70;                          // gentle arc
  const ay = lerp(NOCK.y, BULLSEYE.y, fpe) - arcLift;
  // tangent angle of path for arrow heading
  const fpe2 = Easing.inOutCubic(clamp(fp + 0.02, 0, 1));
  const ax2 = lerp(NOCK.x, BULLSEYE.x, fpe2);
  const ay2 = lerp(NOCK.y, BULLSEYE.y, fpe2) - Math.sin(fpe2 * Math.PI) * 70;
  const pathAng = Math.atan2(ay2 - ay, ax2 - ax) * 180 / Math.PI;

  /* ── impact fx ── */
  const impP = clamp((t - T.impact) / 0.6, 0, 1);
  const ringScale = lerp(0.2, 3.0, Easing.outCubic(impP));
  const ringOp = (1 - impP) * (t >= T.impact ? 1 : 0);
  const flash = pulse(t, T.impact, T.impact + 0.22);
  const stuckArrow = t >= T.impact;                                      // arrow embedded in target
  // celebration coins/stars
  const burst = Array.from({ length: 14 }, (_, i) => {
    const ang = (-150 + i * (300 / 13)) * Math.PI / 180;
    const sp = 360 + (i % 4) * 90;
    const lt = clamp(t - (T.impact + 0.04), 0, 3);
    const bx = Math.cos(ang) * sp * lt;
    const by = Math.sin(ang) * sp * lt + 0.5 * 900 * lt * lt;            // gravity
    const op = clamp(1 - lt / 1.5, 0, 1);
    return { bx, by, op, r: 18 + (i % 3) * 8, spin: lt * 540 * (i % 2 ? 1 : -1), star: i % 2 === 0 };
  });

  /* ── BULLSEYE! popup ── */
  const beIn = clamp((t - (T.impact + 0.12)) / 0.4, 0, 1);
  const beScale = Easing.outBack(beIn);
  const beOp = beIn * clamp((T.title + 0.1 - t) / 0.4, 0, 1);

  /* ── title ── */
  const logoDrop = clamp((t - (T.title + 0.15)) / 0.7, 0, 1);
  const logoY = (1 - Easing.outBack(logoDrop)) * -260;
  const logoSquash = pulse(t, T.title + 0.78, T.title + 1.05);
  const logoOp = clamp((t - (T.title + 0.05)) / 0.3, 0, 1);
  const subOp = clamp((t - (T.title + 0.95)) / 0.5, 0, 1);
  const subY = (1 - clamp((t - (T.title + 0.95)) / 0.5, 0, 1)) * 18;
  const dedOp = clamp((t - (T.title + 1.7)) / 0.6, 0, 1);
  const startBlink = t > T.title + 2.3 ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((t) * 4.2)) : 0;
  const titleBurst = pulse(t, T.title + 0.7, T.title + 1.6);

  const W = 1920, H = 1080;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'Fredoka, system-ui, sans-serif', background: '#0c1410' }}>
      {/* ===== WORLD (camera-transformed) ===== */}
      <div style={{ position: 'absolute', inset: 0, transform: worldTransform, transformOrigin: '0 0', willChange: 'transform' }}>
        {/* forest-glade base (fallback tint behind the photo) */}
        <div style={{ position: 'absolute', left: -240, top: -240, right: -240, bottom: -240, background: 'radial-gradient(68% 58% at 60% 36%, #d4dd97 0%, #7a9a55 20%, #38583a 52%, #16301f 100%)' }} />
        {/* forest photo (transform on wrapper, plain img inside for export friendliness) */}
        <div style={{ position: 'absolute', left: -180, top: -260, width: 2280, height: 1520, transform: `translateX(${fPanX}px) scale(${fKB})`, transformOrigin: 'center', filter: fBlur ? `blur(${fBlur}px)` : 'none' }}>
          <img src={A.forest} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        {/* soft depth vignette baked into world */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 62% 42%, rgba(0,0,0,0) 45%, rgba(8,16,10,0.45) 100%)', pointerEvents: 'none' }} />

        {/* fireflies */}
        {FIREFLIES.map((f, i) => <Firefly key={i} f={f} t={t} />)}

        {/* ===== ACTION LAYER (fades out for the title) ===== */}
        <div style={{ position: 'absolute', inset: 0, opacity: actionFade }}>
        {/* ground contact shadow for dino */}
        <div style={{ position: 'absolute', left: DINO_X - 130, top: DINO_FEET - 26, width: 260, height: 52, borderRadius: '50%',
          background: 'radial-gradient(50% 50%, rgba(0,0,0,0.42), rgba(0,0,0,0))', opacity: dinoOpacity * (1 - heroIn * 0.6) }} />

        {/* ===== DINO BOB (left) ===== */}
        <div style={{ position: 'absolute', left: DINO_X, top: DINO_FEET, opacity: dinoOpacity }}>
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(-50%, 0) translate(${dinoLean}px, ${dinoY}px)`, transformOrigin: 'bottom center' }}>
            <div style={{ transform: `scaleY(${1 - dinoSquash * 0.12 + breathe}) scaleX(${1 + dinoSquash * 0.10})`, transformOrigin: 'bottom center' }}>
              <img src={A.dinoFront} alt="" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', height: 470, opacity: 1 - aimMix, display: 'block', filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.3))' }} />
              <img src={A.dinoAim} alt="" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-54%)', height: 470, opacity: aimMix, display: 'block', filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.3))' }} />
            </div>
          </div>
        </div>

        {/* bow — held in front, appears at aim */}
        <div style={{ position: 'absolute', left: 706, top: 632, opacity: bowOpacity, transform: `translate(-50%,-50%) rotate(${-4 + bowShake * 9}deg)`, transformOrigin: 'center' }}>
          <img src={A.bow} alt="" style={{ height: 392, display: 'block', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.4))' }} />
        </div>

        {/* nocked fire arrow (on the bow, pre-release) */}
        {nockShown && (
          <div style={{ position: 'absolute', left: NOCK.x - nockPull, top: NOCK.y, transform: `translate(-12%, -50%) rotate(${ARROW_ROT}deg)`, transformOrigin: 'center' }}>
            <div style={{ position: 'relative' }}>
              {/* charge glow building during draw */}
              <div style={{ position: 'absolute', right: -10, top: '50%', width: 90 + fireBuild * 70, height: 90 + fireBuild * 70, transform: 'translate(0,-50%)',
                background: 'radial-gradient(circle, rgba(255,180,60,'+(0.18+0.5*fireBuild)+') 0%, rgba(255,120,30,0) 65%)', borderRadius: '50%', opacity: fireFlick }} />
              <img src={A.fire} alt="" style={{ height: 150, display: 'block', filter: `drop-shadow(0 0 ${6 + fireBuild * 16}px rgba(255,150,40,${0.5 + 0.4 * fireBuild}))`, transform: `scale(${1 + fireBuild * 0.06})` }} />
            </div>
          </div>
        )}

        {/* aim glint line target during draw */}
        {t >= T.draw + 0.4 && t < T.release && (
          <div style={{ position: 'absolute', left: NOCK.x, top: NOCK.y - 6, width: BULLSEYE.x - NOCK.x, height: 2,
            background: 'linear-gradient(90deg, rgba(255,210,120,0.0), rgba(255,210,120,'+(0.10+0.18*fireBuild)+') 60%, rgba(255,240,180,'+(0.3*fireBuild)+'))',
            transform: `rotate(${Math.atan2(BULLSEYE.y - NOCK.y, BULLSEYE.x - NOCK.x) * 180 / Math.PI}deg)`, transformOrigin: 'left center', opacity: 0.8 }} />
        )}

        {/* ===== TARGET (right) ===== */}
        <div style={{ position: 'absolute', left: BULLSEYE.x, top: BULLSEYE.y, transform: 'translate(-50%,-50%)' }}>
          {/* easel legs */}
          <div style={{ position: 'absolute', left: -64, top: 150, width: 26, height: 220, background: 'linear-gradient(90deg,#7a5230,#a9763f,#6b4827)', borderRadius: 8, transform: 'rotate(13deg)', transformOrigin: 'top center', zIndex: 0 }} />
          <div style={{ position: 'absolute', left: 64, top: 150, width: 26, height: 220, background: 'linear-gradient(90deg,#6b4827,#a9763f,#7a5230)', borderRadius: 8, transform: 'rotate(-13deg)', transformOrigin: 'top center', zIndex: 0 }} />
          <div style={{ position: 'absolute', left: -150, top: 350, width: 300, height: 40, borderRadius: '50%', background: 'radial-gradient(50% 50%, rgba(0,0,0,0.4), rgba(0,0,0,0))', zIndex: 0 }} />
          {/* impact wobble */}
          <div style={{ transform: `translateX(${shX * 0.5}px) rotate(${shk * Math.sin(t * 80) * 3}deg)`, transformOrigin: 'bottom center', position: 'relative', zIndex: 1 }}>
            <img src={A.target} alt="" style={{ height: 470, display: 'block', transform: 'translate(-50%,-50%)', position: 'absolute', left: 0, top: 0, filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.4))' }} />
          </div>
        </div>

        {/* flying fire arrow + trail */}
        {flying && (
          <div style={{ position: 'absolute', left: ax, top: ay, transform: `translate(-50%,-50%) rotate(${ARROW_ROT + pathAng}deg)`, transformOrigin: 'center' }}>
            {/* trail */}
            <div style={{ position: 'absolute', right: 40, top: '50%', width: 260 + fp * 120, height: 26, transform: 'translateY(-50%)',
              background: 'linear-gradient(90deg, rgba(255,120,30,0) 0%, rgba(255,150,40,0.55) 60%, rgba(255,220,120,0.85) 100%)',
              borderRadius: 20, filter: 'blur(3px)' }} />
            <img src={A.fire} alt="" style={{ height: 150, display: 'block', filter: 'drop-shadow(0 0 16px rgba(255,150,40,0.85))' }} />
          </div>
        )}

        {/* arrow stuck in target after impact */}
        {stuckArrow && t < T.title + 0.2 && (
          <div style={{ position: 'absolute', left: BULLSEYE.x + 6, top: BULLSEYE.y - 6, transform: `translate(-72%,-50%) rotate(${ARROW_ROT}deg)`, transformOrigin: 'center', opacity: clamp((T.title + 0.2 - t) / 0.4, 0, 1) }}>
            <img src={A.fire} alt="" style={{ height: 150, display: 'block', filter: 'drop-shadow(0 0 10px rgba(255,150,40,0.7))' }} />
          </div>
        )}

        {/* impact ring + sparks + coin burst */}
        {t >= T.impact && t < T.title && (
          <div style={{ position: 'absolute', left: BULLSEYE.x, top: BULLSEYE.y }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 120, height: 120, marginLeft: -60, marginTop: -60, borderRadius: '50%', border: '8px solid rgba(255,210,120,0.9)', transform: `scale(${ringScale})`, opacity: ringOp }} />
            <div style={{ position: 'absolute', left: 0, top: 0, width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,240,0.95), rgba(255,200,90,0))', transform: `scale(${1 + flash * 4})`, opacity: flash }} />
            {burst.map((b, i) => (
              <div key={i} style={{ position: 'absolute', left: b.bx, top: b.by, transform: `translate(-50%,-50%) rotate(${b.spin}deg)`, opacity: b.op }}>
                {b.star
                  ? <div style={{ width: b.r, height: b.r, background: '#ffd34d', clipPath: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)', filter: 'drop-shadow(0 0 6px rgba(255,200,80,0.9))' }} />
                  : <img src={A.coin} alt="" style={{ width: b.r * 2, display: 'block', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }} />}
              </div>
            ))}
          </div>
        )}

        {/* BULLSEYE! popup (world space, above target) */}
        {beOp > 0.01 && (
          <div style={{ position: 'absolute', left: BULLSEYE.x, top: BULLSEYE.y - 300, transform: `translate(-50%,-50%) scale(${beScale}) rotate(-6deg)`, opacity: beOp, transformOrigin: 'center' }}>
            <div style={{ fontFamily: 'Luckiest Guy, cursive', fontSize: 96, color: '#ffd23f', WebkitTextStroke: '7px #5a2d12', paintOrder: 'stroke', letterSpacing: '0.02em', textShadow: '0 8px 0 rgba(90,45,18,0.35)', whiteSpace: 'nowrap' }}>
              BULLSEYE!
            </div>
          </div>
        )}
        </div>{/* /action layer */}
      </div>

      {/* ===== SCREEN-SPACE OVERLAYS ===== */}
      {/* cinematic vignette */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(130% 100% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)' }} />

      {/* title backdrop dim */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: titleDim,
        background: 'radial-gradient(80% 80% at 50% 42%, rgba(10,22,14,0.4) 0%, rgba(6,12,8,0.92) 100%)' }} />

      {/* ===== TITLE CARD ===== */}
      {t >= T.title - 0.1 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* radial sun burst behind logo */}
          <div style={{ position: 'absolute', left: '50%', top: '30%', width: 1200, height: 1200, transform: `translate(-50%,-50%) scale(${0.6 + titleBurst * 0.6}) rotate(${t * 8}deg)`, opacity: titleBurst * 0.22,
            background: 'repeating-conic-gradient(from 0deg, rgba(255,221,120,0.5) 0deg 7deg, rgba(255,221,120,0) 7deg 14deg)', borderRadius: '50%' }} />

          {/* mascot shadow */}
          <div style={{ position: 'absolute', left: '50%', top: '73%', width: 230, height: 40, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(50% 50%, rgba(0,0,0,0.45), rgba(0,0,0,0))', opacity: heroIn }} />
          {/* hero mascot bounces into the title */}
          <img src={A.dinoFront} alt="" style={{ position: 'absolute', left: '50%', top: '73%', height: 248,
            transform: `translate(-50%,-100%) translateY(${(1 - Easing.outBack(heroIn)) * 320 + Math.sin(t * 3.4) * 6}px)`, opacity: heroIn,
            filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.5))' }} />

          {/* logo */}
          <div style={{ position: 'absolute', left: '50%', top: '27%', transform: `translate(-50%,-50%) translateY(${logoY}px) scaleY(${1 - logoSquash * 0.12}) scaleX(${1 + logoSquash * 0.1})`, opacity: logoOp, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Luckiest Guy, cursive', fontSize: 200, lineHeight: 0.9, color: '#7ec24a',
              WebkitTextStroke: '11px #23351c', paintOrder: 'stroke', whiteSpace: 'nowrap',
              textShadow: '0 13px 0 #3f7a2a, 0 16px 24px rgba(0,0,0,0.5)', letterSpacing: '0.01em' }}>
              DINO BOB
            </div>
          </div>

          {/* subtitle */}
          <div style={{ position: 'absolute', left: '50%', top: 'calc(27% + 138px)', transform: `translate(-50%,0) translateY(${subY}px)`, opacity: subOp, textAlign: 'center' }}>
            <span style={{ fontFamily: 'Luckiest Guy, cursive', fontSize: 46, color: '#ffd23f', WebkitTextStroke: '4px #5a2d12', paintOrder: 'stroke', letterSpacing: '0.18em', whiteSpace: 'nowrap' }}>
              ARCHER OF THE FOREST
            </span>
          </div>

          {/* dedication */}
          <div style={{ position: 'absolute', left: '50%', bottom: 118, transform: 'translateX(-50%)', opacity: dedOp, textAlign: 'center' }}>
            <span style={{ fontFamily: 'Fredoka, sans-serif', fontWeight: 500, fontSize: 30, color: '#f3e7cf', letterSpacing: '0.04em', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
              Made with love for Penny <span style={{ color: '#ff5d6c' }}>&#10084;</span>
            </span>
          </div>

          {/* tap to start */}
          <div style={{ position: 'absolute', left: '50%', bottom: 56, transform: 'translateX(-50%)', opacity: startBlink, textAlign: 'center' }}>
            <span style={{ fontFamily: 'Fredoka, sans-serif', fontWeight: 600, fontSize: 26, color: '#fff', letterSpacing: '0.22em', textShadow: '0 2px 10px rgba(0,0,0,0.7)', whiteSpace: 'nowrap' }}>
              &#9654; TAP TO START
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Opening() {
  // Tell the host game page we mounted OK (so it knows the intro is alive and
  // not blocked offline), and again when the kid taps to start.
  useEffect(() => {
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'dinobob-intro-ready' }, '*'); } catch (e) {}
  }, []);
  const finish = () => {
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'dinobob-intro-done' }, '*'); } catch (e) {}
  };
  return (
    <Stage width={1920} height={1080} duration={22 / SPEED} background="#0c1410"
      persistKey="dinobob-intro" showBar={false} loop={false} onTap={finish}>
      <Scene />
    </Stage>
  );
}

window.Opening = Opening;
if (typeof module !== 'undefined') module.exports = { Opening };
