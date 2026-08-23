# From 2D Sprites to a True 3D Look — Game Plan for Dino Bob & If Penguins Could Fly

*Written Aug 22, 2026. Audience: Billy + Penny + Lachlan now; Claude Code next. Every task below is written to be handed directly to Claude Code as a work item.*

---

## 0. Executive verdict (read this first)

1. **Do not switch engines. Not to Three.js, not to Babylon, not ever.** A WebGL rewrite would take weeks-months, destroy the thing that makes these projects work (`tuning.js` as Penny's Designer Zone, single-file simplicity, PWA installability), and gain you almost nothing visually — because the games' "3D-ness" comes from *lighting, shadow, layering, and consistent art*, none of which require a renderer.
2. **The winning pipeline already exists in your repo and it has a name: pre-rendered 3D baked back to 2D.** Model or generate a real 3D asset once, light it once, render N turntable frames, ship them as sprites. Dino Bob's V6 pass (`target_3d_0..5`, `chest_3d_0..7`, `boss_moonstone_3d_*`, fruit tumbles) already proved this works inside your engine. Donkey Kong Country, Diablo, and Ori were all built this way. It is the industry-standard trick, not a compromise.
3. **The bottleneck is not ideas, it is *consistency*.** Your banana-tumble rejects sitting in `assets/source/art-v6/rejected/` are the proof: AI image generators cannot reliably redraw the same object from six angles. Blender can — it renders the *same model* every time. That is why the plan below moves animated/turning things to Blender (free, already installed at `/opt/homebrew/bin/blender`) and reserves AI image generators for single-frame art (backgrounds, key art, portraits) where consistency doesn't matter.
4. **Two universal fixes dwarf any asset work in perceived quality:** Dino Bob renders with **no devicePixelRatio handling** (everything is soft on your Retina Mac/iPad — verified: zero `devicePixelRatio` hits in `js/`), and If Penguins Could Fly's service worker **never serves its precached images due to a query-string mismatch** (verified: `sw.js:102` uses `caches.match(e.request)` with no `ignoreSearch`, while the game requests `images/x.webp?v=12` per `index.html:147`). Both are small, both make everything sharper/faster immediately.
5. **What you've been telling yourself that's wrong:** "we'll eventually need real 3D." You won't. "More particles/glow = more depth." No — depth reads from contact shadows, haze, occlusion, parallax, and scale, all of which you already have code for. "New art will fix it." Only if the new art obeys the existing lighting contract (key light upper-left, shared palette); inconsistent lighting is what makes swapped-in art look like stickers.

---

## 1. DINO BOB — Audit

### What's genuinely working
- **Architecture invites art upgrades instead of fighting them.** Central manifest (`js/sprites.js` NAMES, 128 entries, verified in sync with `sw.js` FILES and disk), access-only-via `SPRITES.get(name)`, and a mandatory procedural fallback for every sprite (house rule, TODO.md:24-25). Hitboxes are **world-space circles independent of sprite pixels** (`segCircle()`, game.js:418-426) — swapping same-name art cannot break collision.
- **A mature fake-3D vocabulary is already shipped** (commit 43532dc "Depth & lighting" + db2d5cd V6 wiring): radial-gradient contact shadows that shrink/fade with altitude (game.js:1293-1316), per-biome sprite light-grading via offscreen composite (`gradedSprite`, game.js:1014-1054), horizon haze bands (game.js:1058-1066), far targets with additive veil (×2 score), full-screen biome atmosphere passes, vignette, foreground occlusion strips, and pre-rendered 3D turntables for targets/chests/boss/fruits.
- **The 2.5D boss rig is generic.** `drawBoss2p5D` (game.js:1494-1553) does limb-crop wobble, squash-stretch breathing, progressive crack overlays, damage-state frame indexing — and your own TODO notes new bosses wire in cheaply through `STAGES`.
- Working tree is clean; deploy ritual (CACHE bump + drive.mjs verify) is codified in TODO.md house rules.

### What's genuinely broken
| Issue | Evidence | Impact |
|---|---|---|
| **No DPR rendering** | zero `devicePixelRatio` in `js/`; `GAME.start()` sets a fixed 1600×900 backing store (game.js:2332-2333), CSS-upscaled | Everything looks slightly soft on Retina/iPad. Cheapest large quality win in the whole plan. |
| **Unbounded `gradeCache`** | game.js:1027 caches a full-size canvas per (biome×sprite) forever; boss frames alone ≈ 900×900 ×9 candidates ≈ ~29 MB | Memory creep + jank risk on old iPads during long sessions. |
| **Per-frame gradient allocations** | vignette (1231), haze (1060), ground shadow per-target (1309), balloon specular (1733), arrow trails (art.js:520-527), plus `ctx.filter` hue-rotate per balloon (1729-1731, slow in WebKit) | Measurable on old devices; trivially hoistable. |
| **Play-test rig rotting** | `tools/harness.html` omits the `stages.js` script tag its own house rule requires; `drive.mjs --live` still points at the retired Netlify URL; SKILL.md says "3 stage nodes" (there are 6); README says Adventure has 3 stages (there are 6) | Your safety net for shipping visual changes is half-broken. Fix before touching art. |
| **Banana tumble frames unwired** | TODO.md:44-53; rejected arrow-baked frames parked in `art-v6/rejected/` | One of three fruits lacks the 3D tumble; known wiring steps already documented. |
| **Outfits/shiny are vapor** | outfit recolors affect nothing visually for 5 of 6 characters (only procedural fallback, art.js:165-186); Shiny = filter only (game.js:1806) | Shop integrity issue, noted in your own TODO. |
| **Offline-first-run gap** | sw.js precaches 7 of 14 `intro/assets` (no `dino_1/2`, `arrow_ice/gold/firegold`, `balloon`) | First launch offline can miss intro frames. |
| **Duplication** | chest-hit reward logic ×3 (game.js:699-722, 767-781, 566-568); ring-scoring award ×2 (626-628, 756) | Bug-fix hazard when adding new target types. |
| **Dead code** | no-op `if (st.arrowType.freeze && !t.dead) {}` (game.js:731); unreachable procedural hats party/cowboy/propeller/headphones (art.js:62-103); `PALETTES` lacks `trixie` (art.js:26-32) | Noise for future maintainers (including Claude). |

### What you've been telling yourself that might be wrong
- **"The characters need to become 3D next."** Resist this. The archer poses have hard fractional anchors (`ARCHER_BOW_FX/FY` = bow grip at 82% width / 64% height, game.js:1919) and a 3-frame draw cycle tuned to current art (game.js:1926-1934). 3D-rendered characters would fight those anchors, and character style-clash against the painted backgrounds is the fastest way to break the scene. The player already benefits from grading, squash/stretch, and contact shadow. Upgrade characters last, decoratively (menu heroes), not mechanically.
- **"We need more effects."** You have ~20 depth techniques layered in. The returns now come from *resolution* (DPR), *consistency* (one lighting contract across all assets), and *a few structural depth cues you're missing* (see P1: parallax-on-shake, background plane splitting).
- **"Art swaps are risky."** They aren't — same-name swaps with the CACHE bump are close to zero-risk *provided* you respect the documented couplings (§1.4 below and the frame-count contracts: chest×8, target frames 0-3 usable, boss ≥5, fruit×6, blackhole×3).

### Art-swap coupling cheat sheet (the only landmines)
1. Frame-count/name contracts: `chest_3d_0..7` (game.js:1441-1452), `target_3d_0..5` with disc-center pinned at **41% down** (1700-1707), `boss_moonstone_3d_0..5` indexed by damage thresholds (1424-1431), `fruit_*_3d_0..5` modulo cycling (1757-1758), `blackhole_0..2` (1325-1326).
2. Fractional anchors: archer bow grip 82%/64% (1919); bullseye scoring rings read at 0.25/0.5/0.75 of r so **painted ring positions in target.png define perceived scoring** (1663-1669 + 626-628); chest lid occupies top 42% (1559-1604); boss weak-spot aligned via `scale:2.5, lift:0.06` (stages.js:40-43); hat head-top at 84% up (art.js:327-330); balloon string baked into bottom (1728-1731).
3. Backgrounds must stay exactly 16:9 1600×900 (stretched at game.js:1071); foreground masters 1600 wide (1243-1245); adventure-map node %s match painted platforms (stages.js + style.css:355-364) — don't casually repaint the map.

---

## 2. DINO BOB — Prioritized plan

### P0 — Foundation (half a day, mostly Claude Code tasks)
1. **DPR-aware backing store.** Scale canvas backing store by `min(devicePixelRatio, 2)` in `GAME.start()` (game.js:2332-2333) + `ctx.setTransform(scale,…)`; map pointer coords through the inverse in the input handlers (game.js:2352-2357). ~20 lines. Verify with drive.mjs screenshots at 2×.
2. **Hoist per-frame gradients** (vignette, per-biome haze, HUD panel sheen) into lazily-built cached objects keyed by biome; cap `gradeCache` (evict on biome switch or cap entries at ~40).
3. **Fix the test rig**: add `<script src="js/stages.js">` to harness.html; update drive.mjs `--live` URL to the Pages URL; correct README (6 stages) and SKILL.md node count. Your future self relies on this net.
4. **Wire the banana tumble** exactly per TODO.md:46-53 instructions (kind check in the fruit branch, `NAMES` + `FILES`, CACHE bump). Regenerate frames via the Blender pipeline in §6 rather than re-rolling AI — that's what killed the last batch.
5. **Add the 7 missing intro assets** to sw.js FILES.

### P1 — The depth pass Dino Bob is actually missing (1-2 weekends)
6. **Parallax-on-shake.** Screen shake currently translates the entire frame uniformly (game.js:2115-2118). Make layers respond differentially: foreground strip ×1.4, targets/arrows ×1.15, background ×0.85, sky ×0.7 of the shake offset. ~10 lines in render(), instantly makes the arena read as a volume.
7. **Split each background into 2-2.5 planes.** Port the penguins approach: cut each 1600×900 painting into far/mid (optionally near) with alpha-feathered seams (their `tools/slice_bg0.py` pattern; replicate as `tools/slice_bg_dino.py`). Draw mid plane drifting ±20px opposite to a slow idle camera sway (add `camX = sin(t*0.1)*8` breathing even when idle). Combine with #6 for the biggest single visual jump available to this game. Backgrounds needing re-art for clean separation: generate with the prompt in §5.1 specifying distinct foreground/midground elements.
8. **Second, nearer foreground strip** per biome (blurrier, darker, ~1600×220 like the existing ones, drawn at ×1.25 scale, bottom-anchored) — two-plane occlusion beats one.
9. **Turntable batch #1 (Blender, §6): balloons + coins.** `balloon_3d_0..5` (replace flat hue-rotated balloon; keep red-base + runtime hue-rotate contract), `coin_3d_0..5` spinning. Low-risk objects: purely decorative motion, no anchor coupling beyond draw width.

### P2 — Baked-3D asset expansion (ongoing, one asset-set per session)
10. **Elemental arrows as lit 3D renders** (single frames, not turntables — they're seen edge-on in flight): fire/ice/lightning/obsidian, same aspect contract as current (~372-495×129-135), keep `orient_arrow` orientation convention from your cutout tools.
11. **Mini-bosses crab + anglerfish** (your TODO Tier 3): build in Blender or AI-3D (§4), render 6 damage-state turntables each, wire through the generic `drawBoss2p5D` + `STAGES` registry — explicitly designed for this.
12. **Pet companion** (TODO Tier 2): ideal first *fully new* Blender asset — no legacy anchors, small screen footprint, huge charm payoff for Penny.
13. **Menu hero upgrades**: render the six characters as 3D-lit turnaround frames for the title/home/results preview canvases only (decorative, zero gameplay coupling).
14. **Adventure stage 7** on the spare map platform, themed to whatever biome gets the best new background from #7.

### P3 — Explicitly not worth it (do not do these)
- Runtime normal-mapping / dynamic relighting in Canvas 2D — per-pixel JS is too slow; `gradedSprite` already gives you top-lighting for free.
- Three.js/PixiJS layer bolted on for "just the boss" — two renderers, two input coordinate systems, no payoff.
- Spine/DragonBones skeletal animation — integration cost exceeds benefit while art is painted-single-pose; revisit only if characters become the focus.
- Re-rendering the adventure map in 3D — the node-% ↔ painted-platform coupling makes this pure downside.

---

## 3. IF PENGUINS COULD FLY — Audit

### What's genuinely working
- **The strongest pseudo-3D trick in either game**: rings are drawn in two halves with the player drawn *between* them (index.html:2142-2146) so you visibly thread each ring. Plus the brand-new multiplane system: one painting sliced into far/mid/near planes scrolled at 1×/2.2×/3.8× (`slice_bg0.py`, `drawBgBand`, index.html:1277-1290), aerial-perspective haze band (1341-1350), midnight-navy soft contact shadows under everything (1351-1375), sun-glint orbiting the ring rim via evenodd-clip + `lighter` composite (1398-1413), and a 9-sprite cloud mood ladder that darkens as the boss approaches (1482-1486).
- Touch handling is genuinely good (per-identifier multitouch, separate FIRE button, haptics gated on reduced-motion); pause plumbing cancels RAF properly.
- `ART_DIRECTION.md` exists with a real palette — this is your consistency contract and most projects don't have one.

### What's genuinely broken
| Issue | Evidence | Impact |
|---|---|---|
| **Uncommitted V7 work** | `git status`: modified index.html (+76) & sw.js, untracked `bg0-{far,mid,near}.webp`, `tools/` — the whole multiplane pass exists only in the working tree | Commit it first. Anything else risks losing the best feature in the game. |
| **Service worker query-string bug (verified)** | runtime requests `?v=12` (index.html:147); SW precaches bare paths (sw.js:5-79); `caches.match(e.request)` without `ignoreSearch` (sw.js:102) | Precached copies NEVER serve; every asset stored twice; "offline-ready" is partly fiction. |
| **Eager decode of ~70 images at parse time** | all `Image`s fired at index.html:142-214, incl. seven 1400×933 world paintings + 1536×1024 title art | Startup jank and memory on phones, *before* you add heavier 3D-looking art. |
| **Per-frame gradient allocations** | sky gradient rebuilt every frame (1230), per-ring shine (1408), every glow (1452/1529/1539/1674/1679) | Same class of issue as Dino Bob. |
| **Stale/dead weight** | `publish/` snapshot at ASSET_VER 9 (gitignored decoy); `plane-classic-v5.webp` shipped+precached but never drawn (`skins[0]=null`, :180-185); missions frames rescue/map/badge defined, never spawned; `worldBg` keys 6 & 7 both load storm (:178-179); `cropFrac=1` no-op branch (1684) | Confusion tax; the dead skin is also a style-consistency trap. |

### Art-swap coupling cheat sheet
1. **`RING_FRAMES` pixel geometry is anchored to collision** (`holeCX/CY/holeH`, `holeFrac: 0.578`, index.html:121-126, 1384-1389). New ring art = remeasuring these by hand. High effort, low reward (see told-yourself-wrong below).
2. Hero flight strip assumes **square cells** (`cell = strip.height`, 1591); 4 frames mapped by `heroFrame()`.
3. Atlas frame tables are hardcoded pixel rects: `ADVENTURE_FRAMES`/`HAZARD_FRAMES`/`MISSION_FRAMES` (223-232). Replacement atlases must match layouts or the tables get edited.
4. Boss muzzle anchors `muzX/muzY/muzRx/muzRy` are per-sprite fractions (1038-1039) — new boss art keeps the bore position or gets retuned.
5. World paintings must tile horizontally (first/last columns matched) — keep this in every background prompt.
6. `BG0_BANDS` (218-222) must stay in sync with `slice_bg0.py` band fractions whenever either changes.

### What you've been telling yourself that might be wrong
- **"The rings need better art to feel 3D."** Wrong — the half/half/player sandwich already sells the fly-through. What would sell *more* depth is code: scale rings by proximity to the player (perspective cue) and let the existing sun-glint intensify as they near. Replacing ring art means re-measuring collision geometry for marginal gain. Park it.
- **"The multiplane pass is done."** It covers world 0 of 6. The pipeline generalizes almost for free to the other five worlds (same slicer, per-world band constants). That's where the depth budget should go.
- **"It needs a 3D engine for the flying feel."** Hold-to-climb physics in screen-height units is already resolution-independent and good. Perspective *cues* (scale-by-depth, haze, parallax) deliver the feel; a camera transform would break every hardcoded fraction in CONFIG.

---

## 4. IF PENGUINS COULD FLY — Prioritized plan

### P0 — Hygiene (one session)
1. **Commit the multiplane WIP** (suggest message: `Multiplane depth for world 0: sliced bg planes, haze, object shadows`).
2. **Fix the SW mismatch**: add `{ ignoreSearch: true }` to the `caches.match` call (sw.js:102) AND precache the versioned URLs (or build CORE from `?v=` strings). Bump `CACHE` name. Result: precache actually serves, storage halves.
3. **Lazy-decode heavy art**: keep `loadImg` for gameplay-critical sprites, but defer the six non-current world paintings + story insets until first use (world select / story screens). ~30 lines around the ASSETS object.
4. **Cache static gradients**: sky gradient per biome, haze band, shine gradient template. Hoist out of the frame path.
5. Delete `publish/` from disk (gitignored decoy); delete or wire `plane-classic-v5.webp`.

### P1 — Depth everywhere (the core of the 3D push, 1-2 weekends)
6. **Multiplane all six worlds**: generalize `slice_bg0.py` into `slice_world.py --src world-X.webp`, emit `-far/-mid/-near`, extend each `BIOMES` entry with plane refs and per-band scroll speeds (reuse 1×/2.2×/3.8× defaults). Keep `BG0_BANDS`-style tables per world.
7. **Scale-by-depth for scenery**: clouds spawn at 0.55-0.75 scale and grow toward 1.15 as they cross the screen (pure decoration — no collision). Fish/powerups get a subtler 0.9→1.08 growth. Boss entrance already telegraphs — add scale-up 1.0→1.06 during approach for menace.
8. **Ring proximity experiment** (behind a TUNING const, e.g. `ringPerspective: 0.12`): scale ring draw AND collision radii together by up to ±12% based on horizontal distance to player; intensify the existing rim-glint alpha as it approaches. Ship behind the flag, playtest with drive-equivalent, keep only if it feels fair.
9. **Ground/sea contact**: the player shadow offset (+0.135H, 1373-1374) implies a floor that isn't drawn. Add a faint scrolling near-water/near-ground band at that depth with its own scroll multiplier — one more plane, ties the shadow to something visible.

### P2 — Baked-3D asset expansion
10. **Fish set as Blender turntables** (`fish_0..6` — 7 single renders or gentle 3-frame wiggle cycles). Small, frequent on screen, zero collision coupling beyond circle radius.
11. **Powerups re-rendered as 3D icons**, same atlas layout contract (2172×724, five cells) OR individual frames if you also update `POWERUP_FRAMES`-equivalent rects.
12. **Hero upgrade — the big one**: render an **8-frame** flight strip in Blender (neutral/climb/bank-left/bank-right ×2 phases each, or neutral/climb/dive/bank-L/bank-R + 3 propeller phases). Wiring cost: change cell math from `frame*width` square assumption to explicit cell width constant + extend `heroFrame()` mapping. Player is always on screen — highest-leverage single asset in the game.
13. **Bosses as lit 3D models**: cruiser → gun deck → dreadnought, each with damaged/wrecked variants rendered at the SAME pixel dims as current V6 pairs (the same-dims contract is what lets damage states swap without layout shift). Keep bore/muzzle position within the existing `muzX/Y/Rx/Ry` fractions.
14. **Title key art re-rendered** as an actual 3D scene (models + Poly Haven HDRI + depth of field) for the 1536×1024 slot — one Blender afternoon, replaces the flattest large asset in the game.

### P3 — Not worth it
- New ring art (collision remeasure, marginal gain — see above).
- Star Fox-style tunnel perspective / rings receding into Z — changes the core game; park indefinitely.
- Normal-mapped 2D, WebGL layers, skeletal animation — same reasoning as Dino Bob §2-P3.
- Converting storybook insets to 3D — they're meant to look illustrated; that's the charm.

---

## 5. PROMPT LIBRARY (copy-paste ready)

> Universal rules for every prompt below:
> - Append the **format contract** line verbatim (dimensions/transparency) — these mirror your ART_ASSET_HANDOFF conventions.
> - For animated/turning things: **use Blender (§6), not an image generator.** For single-frame things: image gen is fine.
> - When an image generator supports it, feed an existing game sprite as the reference image (img2img at denoise 0.3-0.45, or the generator's "character reference" feature) and lock the seed while iterating. That is how you keep Penny's/Lachlan's existing style instead of generating a stranger's version of it.
> - Free generators that work well right now: Bing Image Creator, Google Gemini (AI Studio), Ideogram, Leonardo.ai (daily free credits). For unlimited offline generation on this Mac (M1 Pro/16GB): install **Draw Things** (free App Store app, runs SDXL locally) — slower but free forever, and kid-safe.

### 5.1 Shared STYLE BLOCK — Dino Bob (paste at the start of every Dino Bob prompt)

```
STYLE: Hand-painted children's picture-book style, chunky toy-like forms with
soft rounded silhouettes, visible painterly brush shading, gentle warm palette,
soft ambient occlusion where objects meet surfaces, KEY LIGHT FROM THE UPPER
LEFT consistently across every asset, no baked-in cast shadows or drop shadows
(the game engine paints those), no text, no watermark, no border.
```

### 5.2 Dino Bob asset prompts

**Balloon turntable reference (for Blender modeling; if sculpting by hand is too much, generate the base view with AI then image-to-3D it):**
> A single round toy balloon on a short curled string, glossy painted storybook style, bright cherry-red latex with a cream specular highlight upper-left, slightly squashed sphere proportions, cheerful and simple.

Format contract: render 6 turntable frames → `balloon_3d_0.webp .. _5.webp`, square canvas, balloon bulb center pinned ~58% down the frame (current pin is −bh*0.42 from top, game.js:1728-1731), string included at bottom, transparent background, 512×512.

**Coin:**
> A chunky golden coin, storybook-painted style, embossed dinosaur footprint in the center, warm gold with amber shading and a bright rim highlight upper-left, thick rounded edge.

Contract: `coin_3d_0..5.webp` spin cycle, square, transparent, 512×512.

**Elemental arrows (single frames, edge-on):**
> Wooden arrow shaft with [VARIANT] head, painted storybook style, seen perfectly side-on pointing RIGHT, fletching clearly readable at small sizes.
> VARIANT fire: wrapped cloth head burning with orange-gold flame, ember sparks.
> VARIANT ice: translucent crystal-blue arrowhead with frost mist trail.
> VARIANT lightning: brass-capped arrowhead crackling with jagged yellow-white arcs.
> VARIANT obsidian: black glass blade with purple void shimmer.

Contract: match current aspect ~3:1 (372-495 × 129-135), tip pointing right (matches `orient_arrow` convention), transparent PNG→WebP, names `arrow_fire.webp` etc. (direct replacements).

**Mini-boss CRAB (TODO Tier 3):**
> A giant steampunk hermit-crab golem wearing a cracked brass diving-helmet shell, painted storybook style, glowing concentric-ring weak spot on its belly like the Moonstone King's, stubby armored legs, one oversized claw, grumpy expression.

Contract: `boss_crab_3d_0..5.webp`, 900×900 square, weak-spot centered at the same relative position as `boss_moonstone` (~center, scales via `STAGES` def), transparent. Wire through STAGES + drawBoss2p5D.

**Mini-boss ANGLERFISH:**
> A deep-sea anglerfish golem with a glowing lantern lure containing a swirling golden target-ring, stone-plated body with barnacle armor, huge toothy grin, painted storybook style.

Contract: as crab, `boss_angler_3d_0..5.webp`.

**Background regeneration (only where splitting needs cleaner planes) — Meadow example:**
> Wide 16:9 painted storybook meadow valley for a 2D archery game. DISTINCT DEPTH PLANES: distant hazy blue mountains along the top third, a mid-ground band of rolling hills with scattered trees in the middle third, a clear open grassy field in the lower third with NO large objects (gameplay happens there). Soft morning haze between planes, key light upper-left, warm storybook palette, painterly brush strokes, no characters, no text.

Contract: exactly 1600×900 RGB; then run the slicer (§6.4) to produce far/mid/near planes. Repeat per biome swapping the middle sentence (mountain crags+pinewood / moon cave stalactites+glow crystals / starlight aurora ridge / sunset beach cliffs+palm silhouettes / underwater kelp+coral shelf). Caveat: underwater/starlight/cave skies are heavily graded procedurally (`drawStageAtmosphere`), so generate them slightly brighter than target and let the wash do the mood.

**Foreground near-strip (P1 item 8):**
> Extreme close-up painted storybook grass tufts, ferns and pebbles silhouetted dark against nothing, bottom-anchored composition occupying the lower half, soft and slightly out-of-focus feeling, [BIOME] foliage, transparent above the foliage line, no ground plane, no text.

Contract: 1600×220 transparent WebP, `fg2_<biome>.webp` (new names → add to NAMES + FILES + CACHE bump).

**Pet companion (P2 item 12, Penny's call on species):**
> A tiny [baby dragon / ladybird-beetle / puffball bird] companion, palm-sized, painted storybook style, big shiny eyes, [color] with cream belly, hovering pose with stubby wings, cheerful.

Contract: `pet_<name>.webp` 512×512 transparent single pose (bobbing is procedural), plus optional `pet_<name>_happy.webp`.

### 5.3 Shared STYLE BLOCK — If Penguins Could Fly

```
STYLE: Bright polar storybook aviation adventure. Chunky bold silhouettes,
glossy painted shading with strong midnight-navy (#102A56) OUTLINES on every
object, palette locked to: glacier sky #67D6FF, signal orange #FF7A45,
aurora gold #FFD34D, snow white #F6FBFF, storm violet #6C5B8F, midnight
navy #102A56. Steampunk brass aviation machinery for enemies. KEY LIGHT FROM
THE UPPER LEFT, no baked cast shadows (engine paints contact shadows in
navy), no text, no watermark.
```

### 5.4 Penguins asset prompts

**Hero flight strip (the big upgrade — build the model in Blender, see §6; AI prompt only for the base design if needed):**
> A plump emperor penguin aviator wearing brass flight goggles and a flowing signal-orange scarf, seated in a tiny propeller plane of riveted blue metal with golden wings, glossy painted storybook style, bold midnight-navy outlines, three-quarter side view facing LEFT (direction of travel), propeller on the LEFT nose.

Contract: 8 frames 512×512 each in a 4096×512 strip `hero-flight-strip-v7.webp` — frames: 0 neutral cruise, 1 climb pose, 2 dive pose, 3 bank-left, 4 bank-right, 5-7 propeller-blur variations of neutral. Plane footprint and penguin position IDENTICAL across frames except wings/scarf/prop/pitch. Wiring note for Claude Code: replace square-cell assumption (index.html:1591) with explicit cell-width constant; extend `heroFrame()` mapping.

**Fish set:**
> A chubby cartoon [arctic char / clownfish / golden koi / ice-fish / starfish / jellyfish / eel], glossy painted storybook style with midnight-navy outline, side view facing LEFT, cheerful.

Contract: `fish_0..6.webp` direct replacements, transparent, longest side ~256-320px, keep relative rarity colors of current set (types 1 & 6 special).

**Boss trio as 3D renders (Blender recommended for identical damage variants):**
> A massive steampunk AIRSHIP WAR GUN: riveted brass cannon mounted on a patched iron airship gondola with propellers and hanging chains, glowing furnace bore at [KEEP EXISTING MUZZLE POSITION], glossy painted storybook style, midnight-navy outlines, storm violet accents.
> Variant B: add battle damage — scorch marks, dents, thin smoke wisps. Variant C: wrecked — missing plating, glowing ember gaps, heavy smoke.

Contract: render each state at the EXACT pixel dims of the current sprites (boss 802×447, gun-deck 1536×1024, dreadnought 1200×803) so `bossDamageImg` swaps with zero layout shift; bore stays within existing muzzle fractions.

**World paintings (only if regenerating for multiplane slicing):**
> Wide 1400×933 painted polar storybook [sunset coastline / aurora night sky over peaks / outer space with candy planets / dusty canyon / storm sea]. DISTINCT DEPTH PLANES: far background silhouettes along the top, mid-ground landforms/cloud banks, clean open sky corridor through the CENTER THIRD of the canvas where gameplay happens (keep it uncluttered). FIRST AND LAST PIXEL COLUMNS MUST MATCH for seamless horizontal tiling. Palette: [insert from style block]. No characters, no text.

Contract: 1400×933 RGB, tileable, then slice with §6.4 tool.

### 5.5 Free AI-3D generator prompts (Meshy.ai / Tripo3D free tiers)

Key insight: **topology doesn't matter** — you're baking sprites, not animating meshes. So free-tier AI 3D is fully sufficient. Always prefer **image-to-3D**: upload the game's existing sprite (transparent PNG) as the reference; text-to-3D only as fallback. Prompts then stay minimal:

- `toy balloon, glossy cartoon, red, hand-painted style`
- `chubby cartoon penguin aviator with goggles and orange scarf, stylized, hand-painted`
- `steampunk brass airship gun, cartoon, hand-painted, weathered`
- `giant hermit crab golem with brass diving helmet, cartoon stylized`
- `golden coin with dinosaur footprint emboss, cartoon`

Workflow: generate → download GLB → drop into the Blender studio (§6) → render turntable under the standard light rig → post-process (§6.3). Free-tier reality check: Meshy/Tripo free credits renew monthly and are enough for a few assets/month — treat AI-3D as the *modeling shortcut* for organic shapes, and model simple things (coins, balloons, crates, rings) directly in Blender yourself in minutes.

---

## 6. THE BLENDER STUDIO (the heart of this plan)

Blender is already installed (`/opt/homebrew/bin/blender`, GUI in /Applications). One-time setup creates a reusable "photo studio" so EVERY asset renders under identical lighting — this uniformity is precisely what makes baked 3D read as one coherent game.

### 6.1 Studio setup (30 min, once, in the GUI)
1. New file → delete default cube.
2. **Camera**: Add → Camera at (0, −10, 1.8), rotate X ≈ 80° (slight top-down tilt, matching how the games view objects). Set Lens → **Orthographic**, Ortho Scale to taste (start 4). This flat, consistent perspective matches sprite expectations.
3. **Lights** (three-point): Key = Area light 5×5 m at (−3, −3, 4), 400 W (upper-left per the lighting contract); Fill = Area 5×5 at (3, −2, 1), 100 W; Rim = Area 3×3 at (0, 3, 3), 200 W. Optional: World → Surface → light gray, Strength 0.4 for ambient.
4. Render properties: Engine **EEVEE**, Film → **Transparent** ✓, Color Management → View Transform **Standard** (keeps colors punchy like the painted art; AgX mutes them).
5. Output: Resolution 1024×1024, PNG RGBA.
6. Save as `assets/source/blender-studio.blend`. Forever after: import model, frame it, render turntable with the script below.

Free model sources (all allow commercial/kids-project use): **Poly Haven** (HDRIs + textures, CC0), **Kenney.nl** and **Quaternius** (hundreds of CC0 game models), **Sketchfab** (filter: Downloadable + CC0 license — thousands of stylized props). For anything organic/custom: free-tier Meshy/Tripo image-to-3D from your own sprite art (§5.5).

### 6.2 Turntable render script — save as `tools/render_turntable.py`
Run headless: `blender -b assets/source/blender-studio.blend -P tools/render_turntable.py -- <model.glb> <outdir> <prefix> <frames> <res>`
e.g. `blender -b assets/source/blender-studio.blend -P tools/render_turntable.py -- ~/Downloads/balloon.glb /tmp/balloon balloon_3d 6 1024`

```python
import bpy, math, sys, os

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODEL  = argv[0]
OUTDIR = argv[1]
PREFIX = argv[2]
FRAMES = int(argv[3]) if len(argv) > 3 else 6
RES    = int(argv[4]) if len(argv) > 4 else 1024
START_ANGLE_DEG = float(argv[5]) if len(argv) > 5 else 0.0   # nudge so frame 0 = canonical view

os.makedirs(OUTDIR, exist_ok=True)
scene = bpy.context.scene

bpy.ops.import_scene.gltf(filepath=MODEL)

# Parent everything imported to one empty pivot
pivot = bpy.data.objects.new(PREFIX + "_pivot", None)
scene.collection.objects.link(pivot)
imported = [o for o in scene.objects if o.select_get()]
for o in imported:
    o.parent = pivot

# Compute bounding radius to auto-frame the ortho camera
import mathutils
radius = 0.001
for o in scene.objects:
    if o.type == 'MESH':
        for corner in o.bound_box:
            world = o.matrix_world @ mathutils.Vector(corner)
            radius = max(radius, world.length)
cam = next(o for o in scene.objects if o.type == 'CAMERA')
cam.data.ortho_scale = radius * 2.6          # padding so nothing clips

scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderEngine') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderEngine.bl_rna.properties['bl_idname'].enum_items] and False else 'BLENDER_EEVEE'
scene.render.resolution_x = RES
scene.render.resolution_y = RES
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'

for i in range(FRAMES):
    pivot.rotation_euler = (0.0, 0.0, math.radians(START_ANGLE_DEG) + (2 * math.pi * i / FRAMES))
    scene.render.filepath = os.path.join(OUTDIR, f"{PREFIX}_{i}.png")
    bpy.ops.render.render(write_still=True)
print("DONE", OUTDIR, PREFIX, FRAMES)
```

(If the engine-line ever errors on your Blender version, hardcode `scene.render.engine = 'BLENDER_EEVEE'` — or `'BLENDER_EEVEE_NEXT'` on 4.2+.)

### 6.3 Post-process to game sprites — save as `tools/bake_frames.py`
Run: `python3 tools/bake_frames.py /tmp/balloon balloon_3d assets/sprites 512 webp`

```python
import glob, sys
from PIL import Image

src_dir, prefix, dest_dir = sys.argv[1], sys.argv[2], sys.argv[3]
size = int(sys.argv[4]) if len(sys.argv) > 4 else 512
fmt = sys.argv[5] if len(sys.argv) > 5 else "webp"

files = sorted(glob.glob(f"{src_dir}/{prefix}_*.png"))
assert files, f"no {prefix}_*.png in {src_dir}"
for i, f in enumerate(files):
    im = Image.open(f)
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    out = f"{dest_dir}/{prefix}_{i}.{fmt}"
    canvas.save(out, "WEBP" if fmt == "webp" else "PNG", quality=90)
    print("wrote", out)
```

### 6.4 Background slicer for Dino Bob — port `"/Users/billylush/if penguins could fly/tools/slice_bg0.py"` to `dino-bob/tools/slice_bg.py`
Same technique (alpha-feathered horizontal band cuts + green-channel foliage cutout for the mid plane), parameterized per biome. Bands for Dino Bob landscapes roughly: far = top 45%, mid = 30-75%, near = bottom 25% — tune per painting, preview to `tmp/` before shipping.

### 6.5 Drop-in checklist (EVERY asset batch — this is your existing house rule, restated for the new pipeline)
1. Files named exactly per contract into `assets/sprites/` (or `images/` for penguins).
2. Add names to `sprites.js` NAMES (dino-bob) / `ASSETS` (penguins) — skipped for same-name replacements.
3. Add to sw.js FILES.
4. **Bump sw.js CACHE string** (mandatory even for replacements — cache-first never revalidates; penguins additionally: bump `ASSET_VER` in index.html).
5. Verify: `node --check` edited js; run the play-test driver (after P0 fixes it); eyeball screenshots at 2× DPR.

---

## 7. Code-change matrix (how much actually changes)

| Change | Files touched | Size | Risk |
|---|---|---|---|
| Same-name art replacement | sw.js CACHE bump only | ~1 line | Near zero (respect §couplings) |
| New turntable set, existing object type | NAMES + FILES + CACHE | ~3 lines | Zero |
| New object type (pet, mini-boss) | data/stages entry + one draw function following existing pattern | 30-80 lines | Low (patterns exist: `drawBoss2p5D`, pickup draws) |
| DPR backing store | game.js start/input | ~20 lines | Low, verify input mapping |
| Parallax-on-shake | game.js render() | ~10 lines | Low |
| BG plane splitting + idle sway | new tool + drawBackground | ~40 lines + art | Medium (tune per biome) |
| Hero strip 4→8 frames (penguins) | index.html cell math + heroFrame | ~15 lines | Medium (player-facing) |
| Ring proximity scale (penguins) | update + collision + draw | ~15 lines | Medium — ship behind TUNING flag |
| SW fixes (both games) | sw.js (+1 index.html line) | ~10 lines | Trivial, do first |
| **Engine rewrite** | everything | ∞ | **Don't** |

Bottom line: **roughly 95% of the visual upgrade lands as art files + the CACHE bump ritual; the remaining 5% is ~150 lines of small, well-precedented rendering code.**

---

## 8. Suggested order of operations

**Session 1 (hygiene, both games):**
Dino Bob P0 items 1-5 → commit. Penguins: commit WIP → SW fix → lazy-decode → gradient caching → commit.

**Session 2 (Blender studio day, fun with the kids):**
Set up studio blend file → download 2-3 CC0 models from Kenney/Quaternius → render first turntables (dino bob balloon + coin) → bake → wire → CACHE bump → play-test → deploy. Seeing their game hold a *real rotating 3D balloon* is the hook that sells the whole pipeline to Penny and Lachlan.

**Sessions 3-5 (depth passes):**
Dino Bob parallax-on-shake + bg slicing + near-strip. Penguins: multiplane remaining 5 worlds + cloud scale-by-depth + ring experiment (flagged).

**Then ongoing, one asset-set per session**, working down §2-P2 / §4-P2 (arrows → fish/powerups → mini-bosses → pet → hero strip → bosses → title art).

---

## 9. Honest limitations of this plan
- Blender has a learning curve; expect the first session to be mostly watching a 20-minute tutorial together. The turntable script removes the repeatable pain, not the first hurdle. Alternative if Blender stalls: Meshy/Tripo free-tier image-to-3D + the same bake script gets you 70% of the result with 10% of the learning.
- Free-tier AI services change limits often; Draw Things (local) is the hedge.
- Multiplane slicing needs per-painting eyeballing; the preview outputs exist precisely so the kids can help judge seams.
- The ring-proximity and hero-strip changes touch gameplay-facing code — both are flagged for play-test gating above, and both are reversible single-constant/strip swaps.
