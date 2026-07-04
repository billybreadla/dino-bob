# 🎨 Art Asset Handoff V6 — "Real Objects" pass

Goal: finish making gameplay objects read as 3D things in the scene.
The code side (contact shadows, biome light grading, haze, far targets)
shipped 2026-07-03; these assets complete it.

Style: match the existing painted look (see `assets/sprites/boss_moonstone_3d_0.webp`,
`chest_3d_0.png`, the V5 backgrounds). Soft light from the upper left on all
transparent-object renders, consistent with the shadows the engine now draws.

Delivery: masters in `assets/source/art-v6/`, cutouts as transparent PNG
(~1024px on the long side) in `assets/sprites/` with the exact names below.
Do NOT wire anything into js — naming is enough; Claude wires and ships.

## 1. Target stand (highest impact)
A sturdy wooden tripod/easel target stand, 3/4 view, hay or log base,
that a round archery target visibly rests on. The current code-drawn
stilt legs are the worst offender in the whole game.
- `target_stand.png` — stand only, no target disc, transparent.
- Proportions: roughly as wide as the target disc, about 1.4x as tall.

## 2. Bullseye turntable frames
Same recipe as the chest frames: the archery target slowly turning in 3D.
- `target_3d_0.png` .. `target_3d_5.png` — 6 frames, from face-on (frame 0)
  to about 25 degrees turned (frame 5). Same disc art as `target.png`
  (colored rings must stay centered — hit scoring reads ring distance).

## 3. Power-up pickups (replace flat circles)
Two small glowing collectibles, rendered-object style like the boss:
- `pickup_arrows.png` — a little quiver with 3 arrows, green glow.
- `pickup_slowmo.png` — an hourglass with swirling blue sand, cyan glow.

## 4. Tumbling fruit frames (3 fruits only)
6-frame tumble turnarounds for the three most common/valuable:
- `fruit_apple_3d_0..5.png`
- `fruit_watermelon_3d_0..5.png`
- `fruit_banana_3d_0..5.png`

## 5. Foreground occlusion cutouts (one per biome, optional stretch)
A strip of foreground foliage/rocks (transparent top, sits at the bottom
screen edge, ~1600x220) matching each background, for cheap parallax:
- `fg_meadow.png`, `fg_mountain.png`, `fg_sunset_beach.png`,
  `fg_starlight.png`, `fg_underwater.png`, `fg_moon_cave.png`

Priority order if time is short: 1, 3, 2, 4, 5.
