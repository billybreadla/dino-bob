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

- [ ] 🎨 **Banana tumble frames redo** (Codex told 2026-07-04). The V6 batch
  came back with arrows already stuck in the bananas; rejects parked in
  `assets/source/art-v6/rejected/`. Need: `fruit_banana_3d_0..5`, a single
  banana bunch tumbling, NO arrows, transparent PNG ~500px.
  Wiring is already live — once files land as WebP in `assets/sprites/`,
  add `'banana'` to the `t.kind === 'apple' || t.kind === 'watermelon'`
  check in `drawTarget`'s fruit branch (game.js), add to sprites.js NAMES
  (auto-WebP) + sw.js FILES, bump SW.

---

## 🥇 Tier 1 — biggest player-facing wins

- [ ] 🔴 **Obstacles / trick shots.** Nothing ever blocks an arrow today.
  Add 1-2 obstacle types that make shots into puzzles: a wooden shield that
  slowly orbits a target, and/or a stone wall you must arc over. Spawn them
  in phases 2-3 only, never on the first stage. Arrows should THUNK and snap
  on obstacles (reuse `snapArrow` + `AUDIO.thunk`). Tuning knobs:
  `OBSTACLE_CHANCE`, kid-named. Files: game.js (spawner, updateTarget,
  updateArrows collision, drawTarget), tuning.js. This changes game feel —
  needs taste + play-testing, not just code.
- [ ] 🔴 **Wind.** A per-round (or per-phase) horizontal wind that pushes
  arrows in flight, shown as a little animated flag on the HUD and drifting
  leaf particles. One force number + direction; affects `simStep` and the
  aim preview in `drawAim` (the preview MUST show the true wind-bent path,
  kids can't compensate for invisible physics). `TUNING.WIND_MAX` in
  Penny's zone. Start gentle (10-15% of arrow speed max).
- [ ] 🟢 **Endless mode ("Marathon").** New home-screen mode: no timer, you
  play until arrows run out; every bullseye +1 arrow, golden banana +3.
  Track a separate `marathonBest` on the profile, show on results + home.
  Mostly wiring: a `mode:'endless'` rules object (roundSeconds ~9999,
  arrows from TUNING), end condition already exists (OUT OF ARROWS),
  ui.js home button + results copy, save.js field. Follow the pattern of
  how `openChallenge`/`startRound` work.
- [ ] 🔴 **Boss fights back.** The Moonstone King only slides. Give him ONE
  telegraphed move: every ~8s he winds up (glow + sound cue) and lobs a slow
  stone arc toward the player side; if the player hits the stone mid-air it
  bursts for bonus points, otherwise it thuds harmlessly with screen shake
  (never punish, this is a kids' game — the "damage" is lost time/arrows
  wasted dodging). Files: game.js boss section, stages.js bossDef gets
  `attack:{...}` config so future bosses vary.

## 🥈 Tier 2 — retention & progression

- [ ] 🟢 **Daily streak.** save.js already tracks quest day (`todayStr`,
  `dailyQuests`). Add `streak` {count, lastDay} per profile: playing ≥1
  round a day increments, missing a day resets. Show "🔥 Day N" chip on the
  home screen; +25 coin bonus per day capped at +150. Toast on first round
  of the day. Files: save.js, ui.js (home render), game.js finish().
- [ ] 🟢 **3-star-everything reward.** Stars are tracked
  (`SAVE.adventureStarTotal()`, max = STAGES.count*3 = 18) but gate nothing.
  At 18 stars unlock a **Golden Bow** skin: gold bow + gold trail on all
  arrows (drawArrow/drawBow tint), a badge, and a banner on the adventure
  map. Store as `profile.unlocks.goldenBow`. Check on adventure results.
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
- [ ] 🟢 **Adventure stage 7.** The painted map (`adventure_map.webp`) has one
  unused platform. Add a 7th stage to STAGES.LIST (pick an existing bg,
  crank difficulty, maybe specialRule:'fruit' + high goal). Purely data —
  this is the easiest task on the board, good smoke test for a new model.
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

---

## ✅ Shipped (recent, newest first)

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
