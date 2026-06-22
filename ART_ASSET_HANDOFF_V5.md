# Dino Bob Art Overhaul V5 — Claude Handoff

Final production PNGs are in `assets/sprites/`. Original full-resolution generations are preserved in `assets/source/art-overhaul-v5/`.

## New biomes — 1600×900 RGB PNG

- `bg_moon_cave_v5.png`
- `bg_starlight_v5.png`
- `bg_sunset_beach_v5.png`
- `bg_underwater_v5.png`

## Adventure finale boss — 900×900 transparent PNG

- `boss_moonstone_v5.png`

The Moonstone King is a crowned triceratops stone golem. Its chest contains a high-contrast concentric weak spot designed to use the existing boss hitbox and six-hit health logic.

## Visible Dino Bob shop variants — 300×437 transparent PNG

- `char_dinobob_ruby_v5.png`
- `char_dinobob_grape_v5.png`
- `char_dinobob_gold_v5.png`
- `char_dinobob_mint_v5.png`
- `char_dinobob_shiny_v5.png`

Each uses the native `char_dinobob.png` canvas and its approximate production bounding box. Suggested sprite choice is `char_dinobob_<outfit>_v5`, with Shiny overriding the normal outfit when equipped.

## New playable character: Trixie

- `char_trixie_v5.png` — 300×437 transparent body
- `arm_trixie_upper_v5.png` — 426×315 transparent upper-arm segment
- `arm_trixie_bowhand_v5.png` — 485×298 transparent bow-hand forearm
- `arm_trixie_stringhand_v5.png` — 477×282 transparent string-hand forearm

The arm canvases exactly match Dino Bob's corresponding native rig canvases and use the same left-to-right joint orientation.

## Adventure map — 1600×900 RGB PNG

- `adventure_map_v5.png`

The map contains seven empty circular stage platforms along one continuous lower-left-to-upper-right route. It is ready for the existing HTML `.stage-node` controls to be positioned above it.

## Integration note

These are intentionally uncompressed PNG masters. Convert only the RGB backgrounds and map to WebP; keep the character, arm, and boss masters transparent.
