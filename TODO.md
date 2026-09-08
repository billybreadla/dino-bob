# 🦕 Dino Bob — Task Board

Last groomed: 2026-07-04. This file is the single source of truth for open work.
Any model/agent picking up a task: read "House rules" first, do ONE task fully
(including verification), check it off here with a date + commit hash.

---

## House rules (read before touching anything)

1. **Deploy = `git push` to main.** Live at billybreadla.github.io/dino-bob
   (GitHub Pages). No build step, no Netlify, no credits. Never force-push.
2. **Bump the service worker on EVERY shipped change**: `sw.js` line 3
   (`var CACHE = 'dinobob-vNN-slug'`). If you add asset files, also add them
   to the `FILES` precache list in sw.js AND to `NAMES` in `js/sprites.js`.
3. **Verify before committing**: run `node .claude/skills/play-test/drive.mjs`
   from the repo root (needs no setup; 19 checks + screenshots to /tmp/dino-shots).
   All checks must pass with 0 console errors. `node --check` every JS file you edit.
4. **Penny's Designer Zone is sacred.** `js/tuning.js` is written for a kid to
   edit. New gameplay numbers belong THERE (with a friendly comment), not
   hard-coded in game.js. Never make tuning.js scary.
5. **Reduced Motion**: any new animation/particles must check
   `reducedMotion()` (game.js) or the `body.reduced-motion` class (CSS/ui).
6. **Sprites always need a fallback.** Every draw path must render something
   sane if the sprite isn't loaded (see existing patterns in `drawTarget`).
7. **New images ship as WebP.** sharp is NOT installed; use the Chrome canvas
   recipe: load PNG → canvas → `toDataURL('image/webp', 0.92)` → write file
   (working script pattern: see 2026-07-04 conversion, or ask Claude).
   Masters go in `assets/source/art-v6/` (gitignored), cutouts in `assets/sprites/`.
8. **Test harness gotcha**: `tools/harness.html` must be copied to the repo
   root, `../js/` paths changed to `js/`, and `<script src="js/stages.js">`
   added after data.js, or it dies with "STAGES is not defined".
9. Commit messages: what + why, end with the Co-Authored-By line for the model
   that did the work.

**Suggested owner key** (Billy's routing, not a hard rule):
- 🎨 CODEX-ART = image generation + cutouts (no JS)
- 🟢 SMALL = well-scoped code, clear spec (Sonnet / Codex)
- 🔴 BIG = game-feel, physics, design judgment, tricky refactors (Opus / Fable)
- 👧 PENNY = design decision for the boss (the 9-year-old kind)

---

## 🔄 In progress

- [x] 🎨 **Banana tumble frames redo** _(shipped 2026-09-07: Blender `build_banana` → fruit_banana_3d_0..5 clean tumble, no arrows)_

---

## 🥇 Tier 1 — biggest player-facing wins

- [x] 🔴 **Obstacles / trick shots.** _(shipped 2026-09-06: orbiting wooden shield + stone wall, SNAP on hit, aim preview stops, TUNING.OBSTACLE_*)_ Nothing ever blocks an arrow today.
  Add 1-2 obstacle types that make shots into puzzles: a wooden shield that
  slowly orbits a target, and/or a stone wall you must arc over. Spawn them
  in phases 2-3 only, never on the first stage. Arrows should THUNK and snap
  on obstacles (reuse `snapArrow` + `AUDIO.thunk`). Tuning knobs:
  `OBSTACLE_CHANCE`, kid-named. Files: game.js (spawner, updateTarget,
  updateArrows collision, drawTarget), tuning.js. This changes game feel —
  needs taste + play-testing, not just code.
- [x] 🔴 **Wind.** _(shipped 2026-09-07: per-round wind on simStep+drawAim, HUD flag, wind leaf particles, TUNING.WIND_*)_
- [x] 🟢 **Endless mode ("Marathon").** _(shipped 2026-09-07: no timer, arrows-out, bullseye +1 / golden +3, marathonBest, home+results)_
- [x] 🔴 **Boss fights back.** _(shipped 2026-09-07: Moonstone slam / Crab charge / Angler spit — telegraphed, shootable projectiles)_

## 🥈 Tier 2 — retention & progression

- [x] 🟢 **Daily streak.** _(shipped 2026-09-07: streak{count,lastDay}, home chip, TUNING.STREAK_*, toast)_
- [x] 🟢 **3-star-everything reward.** _(shipped 2026-09-07: Golden Bow + coins + Map Master badge, claimedRewards.allStars)_
- [ ] 🟢 **Coin sink: pet companion.** After the shop is bought out (~20k
  coins) money is meaningless. Add a "Pets" arcade tab: 3 pets (suggest:
  baby pterodactyl, turtle, firefly) at 2500 each. Pet follows behind the
  player with a simple bob animation and cheers (a floater + hop) on
  bullseyes. Pure cosmetic. Needs 🎨 CODEX-ART sprites first (see art queue).
- [ ] 🟢 **More daily quest variety.** questPool (data.js) additions that the
  stat system already supports or nearly supports: "hit N far targets"
  (needs a `farHits` stat increment in onHit), "reach a xN combo",
  "beat the boss once", "score N in a single round" (needs single-round
  check in finish rather than cumulative — small save.js change).

## 🥉 Tier 3 — content expansion

- [ ] 🎨→🔴 **Mini-boss per world.** BOSSES registry (stages.js) is data-driven
  and has exactly one entry. Add 2 new bosses: 🦀 Giant Crab (Sunset Beach),
  🐟 Angler Fish (Bubble Reef). Each needs: base sprite + cracked + broken
  (or 6 render frames like moonstone), hp/scale/lift config, and a stage
  entry change (`win:{type:'boss',boss:'crab'}` on beach, etc. — or better,
  ADD two new stages so score stages aren't lost; the painted map has one
  spare platform). ART FIRST (handoff doc pattern: write ART_ASSET_HANDOFF_V7),
  then wiring is small because drawBoss2p5D is generic.
- [x] 🟢 **Adventure stage 7.** _(Crystal Pool — fruit master stage on spare platform; README/play-test updated)_
- [ ] 🔴 **Real music.** Current music = procedural pentatonic loop
  (audio.js musicTick). Option A: compose 2-3 short loops in code with a
  proper chord progression + bass + melody per biome group. Option B:
  generate short audio files (but repo is no-build static; keep files small,
  <300KB total, and add to SW precache). Must respect the Music toggle and
  not autoplay before first tap (AUDIO.unlock pattern).
- [ ] 🎨 **Outfit recolors for the other 5 characters.** Only Dino Bob has
  ruby/grape/gold/mint/shiny sprites. Ninja/Astronaut/Robot/Bear/Trixie
  outfits silently don't change appearance (long-standing gap). 5 chars ×
  5 variants = 25 sprites; batch per character. Alternative 🟢 fix if art
  never happens: hide the outfit tab for characters without recolor art
  (small ui.js change, honest UX) — do this first, it's shipped-in-an-hour.

## 🧹 Housekeeping / small fixes

- [ ] 🟢 **Shiny value fix.** Shiny (750c) is a glow filter; outfits (500c)
  don't work for most characters (see above). Until recolors exist, either
  price-drop shinies to 400 or make shiny ALSO add sparkle particles on
  bullseyes so it feels premium. Tiny game.js/ui.js change.
- [ ] 🟢 **Quest-claim confetti** respects reduced motion but always plays
  the full sound; route through the sfx setting check. (audio.js/ui.js, 15 min.)
- [ ] 🟢 **`GAME.debugStep` bypasses pause** (calls update directly). Fine for
  tests, but add a comment there so nobody "fixes" pause by accident.
- [ ] 🟢 **Play-test suite additions**: a pause check (togglePause → overlay
  pixel test or state assert), a far-target spawn check (force
  FAR_TARGET_CHANCE=1, assert t.far exists + standStyle), an endless-mode
  check when that ships. File: `.claude/skills/play-test/drive.mjs`.
- [ ] 👧 **Penny decisions** (ask her, then file follow-up tasks):
  final say on character names (tuning.js bottom), pet choices (Tier 2),
  what the 18-star reward should be (Golden Bow is a placeholder idea),
  round length feel (60s default — too long? too short?).

## 🎨 Art queue (Codex) — summary

1. Banana tumble redo (in progress, see top).
2. Pet sprites: 3 pets × idle/hop (2 frames each is plenty), transparent PNG.
3. Mini-bosses: crab + angler fish (base/cracked/broken or 6-frame turntable,
   like `boss_moonstone_3d_*`).
4. Character outfit recolors (25 sprites, batch per character).
5. (Stretch) Backgrounds with a flatter ground plane in the bottom third —
   current scenes are gorgeous but a couple read "cliff view" while gameplay
   is flat. Only worth it if targets keep looking odd on a given bg.

Always: masters to `assets/source/art-v6/` (or v7 dir), cutouts named
exactly as specced, transparent PNG; Claude converts to WebP + wires + ships.

## ✏️ Penny's Doodle Enemies — how to use (shipped 2026-08-22)

1. Draw a creature on white paper (or any app), photograph/save it.
2. From the repo root run:
   `python3 tools/import_drawing.py path/to/drawing.png --name mymonster`
   (add `--points 60` for a rarer one; background is removed automatically —
   rembg if installed, corner flood-fill otherwise).
3. Reload the game. During phases 2-3, ~10% of bullseye slots become doodles
   (max 2 alive, soft targets, worth the entry's `points`, default 40).
4. Remove one: delete its block from `assets/sprites/doodles.json` + the
   `assets/sprites/doodle_<name>.png` file. Manifest empty = feature dormant.

Kids' voice lines work the same way: drop MP3/M4A files named per
`tools/VOICE_LINES.md` into `audio/`. Missing files are silent no-ops.

---

## ✅ Shipped (recent, newest first)

- 2026-09-07 — **v59 streak-stars**: Adventure stage 7 Crystal Pool (fruit),
  Blender banana tumble redo (no arrows), daily streak + 3★-everything Golden
  Bow reward. SW dinobob-v59-streak-stars.
- 2026-08-24 — **v34.1 "Kids' features live"**: both dormant kid pipelines are
  now ACTIVE with sample content -- two crayon doodle enemies (spiky + ghost,
  imported through tools/import_drawing.py, flood-fill cutout path verified)
  and 4 placeholder announcer lines (macOS 'Junior' TTS in audio/*.m4a, the
  mp3-first 404 probe is by design). Verified live: doodle spawned, wobbled,
  got hit -> "PENNY'S DOODLE! +40". New KIDS_MAKE_YOURS.md one-pager for
  Penny & Lachlan (draw monsters / record voice lines).
- 2026-08-24 — **v34 "Angler" wave**: THE ANGLER GOLEM — second procedural
  Blender boss (stone body, glowing lure target-ring, big fangs; 6 damage
  frames) now guards Bubble Reef (stage 5 flipped to boss, hp 7); Boss
  Workshop body picker (STONE / CRAB / ANGLER frames for custom bosses);
  removed a leftover weather test hack that forced every round to rainy
  meadow (found via the angler probe — the agent that wrote it said it
  reverted it; lesson: grep for 'TEMP TEST' after agent batches).
- 2026-08-24 — **v33 "Boss King" wave** (uncommitted, one commit pending):
  THE CRAB KING — procedural Blender mini-boss (tools/model_toys.py
  build_crab: hermit crab + brass diving helmet + glowing belly weak-spot;
  6 frames = 3 damage states x 2 yaws; ~16KB webp each) now guards Sunset
  Beach (stage 2 win flipped to boss per ART_ASSET_HANDOFF_V7 — art built
  in-house, handoff doc now covers the anglerfish only); boss spectacle
  (rage phase at half HP: floater + shake + camKick + faster spawns; stomp
  rumble on a 3.4s cadence; death slow-mo shatter + zoom); procedural MUSIC
  engine (js/audio.js: lookahead scheduler, meadow/tense/sea loops as note
  data, crossfade switching, mute+unlock wired; boss rounds switch to
  'tense', round end reverts).
- 2026-08-23 — **v32 "Cinematic" wave** (uncommitted, one commit pending):
  ALL of the v31 "Alive" items below PLUS: 3D title screen (tools/
  title_scene.py + title_post.py — Blender dusk vista, 15KB webp, ken-burns
  CSS drift, flat hero art composited on the ridge; canvas hero retired);
  per-biome weather (rain + lightning + thunder + splashes, wind-driven
  leaves, cave embers, starlight meteors; rolled beside wind, TUNING.
  WEATHER_*); cinematic camera (aim-lean drift, release zoom-punch, bullseye
  zoom on the existing slow-mo, last-arrow slow-send, boss entrance zoom;
  st.camZoom/X/Y, photoMode + reducedMotion pin it).
- 2026-08-23 — **v31 "Alive" wave** (folded into the same pending commit): perf/DPR
  polish (backing store at min(dpr,2), cached gradients/glows/tints, FIFO
  caches capped); first Blender toy bakes (balloon_3d + coin_3d via
  tools/model_toys.py — NOTE: Base Color sockets are LINEAR, feed them
  srgb()-converted colors); 2x super-resolution art pass (EDSR_x2 via
  tools/upscale_x2.py: 6 biomes + adventure_map + fg strips, planes re-sliced,
  originals backed up in assets/source/backup-1600/); depth pass
  (tools/slice_bg.py far/mid planes all 6 biomes, idle camera sway,
  differential shake via shared st.shakeX/Y, fg2_ nearest strips); wind system
  (TUNING.WIND_MAX/CHANCE, gusts bend arrows, aim preview shows true path,
  HUD wind flag); MARATHON endless mode (3 hearts, ∞ arrows, 30s waves,
  per-profile marathonBest); adventure stage 7 Crystal Pool; impact juice
  (balloon shreds + string, bullseye shockwave/sparks/flash, coin sparkle
  trails — new particle types shred/string/line/star/flash); living skies
  (god-rays/pollen, cloud shadows/wind streaks, water shimmer, twinkles +
  shooting star, caustics/bubbles, crystal pulses/fireflies); 3D gear (glossy
  toy bow replaces bow.png, arrow_<type>_3d roll frames cycle in flight);
  hero idle breathing. ART_ASSET_HANDOFF_V7 (crab + anglerfish). SW v31.
- 2026-08-22 — **v29 "Penny Studio" wave** (uncommitted, one commit pending):
  Boss Workshop (design + fight custom bosses, SAVE.customBosses); Doodle
  Enemies pipeline (tools/import_drawing.py + doodles.json manifest, dormant
  until Penny adds a drawing); Daily Challenge (seeded YYYYMMDD) +
  shareable challenge codes (#c= URL hash, checksummed); Photo Mode with
  share card; keyboard + gamepad aiming/firing; kids' voice-line system
  (audio/, see tools/VOICE_LINES.md); crossover plane flyby from the
  penguins game; What's New screen (js/changelog.js — Penny writes notes);
  Blender turntable/toy tooling (tools/render_turntable.py,
  bake_frames.py, TOY_PIPELINE.md). SW v29.
- 2026-07-04 `db2d5cd` — V6 art wired: ground stands (turntable/easel), rendered
  pickups, apple/watermelon 3D tumbles, per-biome foreground occlusion strips;
  27 assets WebP'd 10.5MB→1.8MB. SW v27.
- 2026-07-03 `ed4f5d8` — Pause button + auto-pause on app switch; Trixie's
  TA-DA! moment (bullseye tosses a bonus fruit); V6 art handoff written. SW v26.
- 2026-07-03 `43532dc` — Depth & lighting pass: contact shadows everywhere,
  far targets (2x points), per-biome sprite light grading, atmosphere haze,
  boss grounded, sphere pickups, stilt-height cap. SW v25.
- 2026-07-02 — Moved to GitHub Pages (push=deploy, zero Netlify credits).
- Older history: see git log + memory notes.
