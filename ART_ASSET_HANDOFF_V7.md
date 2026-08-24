# 🎨 Art Asset Handoff V7 — Mini-bosses (crab + anglerfish)

Goal: two mid-journey mini-bosses for Adventure, built as lit 3D turntables
exactly like the Moonstone King (`boss_moonstone_3d_0..5.webp`). The engine
side is already generic — `STAGES.BOSSES` + `drawBoss2p5D` were explicitly
designed so new bosses are a data entry plus art files. Claude wires and ships.

Style: match `boss_moonstone_3d_0.webp` — painted storybook look, soft key
light from the upper left (the engine draws contact shadows under it), glowing
concentric-ring weak spot like the Moonstone King's belly ring.

Delivery: 6-frame turntables per boss, transparent WebP, 900×900 square,
weak-spot centered (the `STAGES` def scales/aligns it). Damage states come
free: the engine cross-fades turntable frames as HP drops, so the 6 frames
should progress subtly from healthy (frame 0) to battle-worn (frame 5) —
cracks, scuffs, dents. Do NOT wire anything into js — naming is enough.

## 1. Hermit Crab Golem (Sunset Beach mini-boss)
> A giant steampunk hermit-crab golem wearing a cracked brass diving-helmet
> shell, painted storybook style, glowing concentric-ring weak spot on its
> belly, stubby armored legs, one oversized claw, grumpy expression.

- Files: `boss_crab_3d_0.webp` .. `boss_crab_3d_5.webp`
- Turntable: slow Z-rotation like the Moonstone frames (face-on at frame 0,
  ~25° turned by frame 5 — the frames CYCLE as a wobble, not a full spin).
- Planned home: Adventure stage 2 (Sunset Beach) gains
  `win:{ type:'boss', boss:'crab' }` once art lands.

## 2. Anglerfish Golem (Bubble Reef mini-boss)
> A deep-sea anglerfish golem with a glowing lantern lure containing a
> swirling golden target-ring, stone-plated body with barnacle armor, huge
> toothy grin, painted storybook style.

- Files: `boss_angler_3d_0.webp` .. `boss_angler_3d_5.webp`
- Same contract as the crab. The lure's golden ring should read at small
  size — it doubles as the aim target when the boss bobs.
- Planned home: Adventure stage 5 (Bubble Reef) gains
  `win:{ type:'boss', boss:'angler' }` once art lands.

## Wiring plan (Claude, when art arrives)
1. `STAGES.BOSSES` entries: `crab` + `angler` (name, sprite base name,
   `renderFrames` array, hp 5-6, scale ~2.3, lift to taste).
2. Flip stage 2 / stage 5 `win` to boss type; keep score goals as the
   3-star accuracy bar (boss star logic already handles this).
3. NAMES + sw.js FILES + CACHE bump ritual, drive.mjs, ship.

Priority if only one gets built: crab first (beach comes earlier in the
journey, and Penny asked for "a crab with a helmet" by name).
