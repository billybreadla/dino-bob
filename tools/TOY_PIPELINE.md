# 📸 The Toy Pipeline: real 3D things in Dino Bob

This is the kid-friendly recipe for turning a real toy (or a downloaded model)
into a rotating sprite inside the game. Full technical background lives in
`VISUAL_3D_GAME_PLAN.md` §6 — this page is the step-by-step you can follow
with Penny and Lachlan on a rainy afternoon.

The whole loop:

```
toy ──(RealityScan/Polycam)──▶ GLB ──(Blender studio + render_turntable.py)──▶ PNG frames
     ──(bake_frames.py)──▶ assets/sprites/*.webp ──(house ritual)──▶ IN THE GAME 🎉
```

---

## Step 1 — Capture or download a model (free)

**Photogrammetry from a real toy:**
- iPhone/iPad: **Polycam** or **RealityScan** free tier. Walk around the toy in
  a bright room, let it process, export as **GLB**.

**Or grab a ready-made model (all allow kids-project/commercial use):**
- **Poly Haven** (CC0), **Kenney.nl**, **Quaternius** (hundreds of CC0 models),
  **Sketchfab** filtered to *Downloadable* + *CC0*.
- For anything custom: free-tier Meshy/Tripo image-to-3D from your own sprite art.

## Step 2 — One-time Blender studio setup (~30 min, once, in the GUI)

Blender is already installed (`/opt/homebrew/bin/blender`, GUI in /Applications).
You are building one reusable "photo studio" so EVERY asset renders under
identical lighting — that uniformity is what makes baked 3D read as one game.

1. New file → delete default cube.
2. **Camera**: Add → Camera at `(0, −10, 1.8)`, rotate X ≈ 80° (slight top-down
   tilt, matching how the game views objects). Lens → **Orthographic**,
   Ortho Scale to taste (start 4). Flat, consistent perspective = sprite-like.
3. **Lights** (three-point rig):
   - Key  = Area light **5×5 m** at `(−3, −3, 4)`, **400 W** (upper-left)
   - Fill = Area light **5×5 m** at `(3, −2, 1)`, **100 W**
   - Rim  = Area light **3×3 m** at `(0, 3, 3)`, **200 W**
   - Optional: World → Surface → light gray, Strength **0.4** for ambient.
4. Render properties: Engine **EEVEE**, Film → **Transparent ✓**,
   Color Management → View Transform **Standard** (keeps colors punchy like the
   painted art; AgX mutes them).
5. Output: Resolution **1024×1024**, PNG RGBA.
6. Save as `assets/source/blender-studio.blend`.

Forever after, every model is just: open studio → render turntable with the script.

## Step 3 — Render the turntable (headless)

```sh
blender -b assets/source/blender-studio.blend -P tools/render_turntable.py -- \
    <model.glb> <outdir> <prefix> <frames> <res>
# real example:
blender -b assets/source/blender-studio.blend -P tools/render_turntable.py -- \
    ~/Downloads/balloon.glb /tmp/balloon balloon_3d 6 1024
```

- `frames` = number of spin poses (6 is plenty; the game wiggles them anyway)
- optional 6th arg nudges the start angle so frame 0 is the canonical view.
- Writes `/tmp/balloon/balloon_3d_0.png … _5.png` with transparent backgrounds.

## Step 4 — Bake into game sprites

```sh
python3 tools/bake_frames.py /tmp/balloon balloon_3d assets/sprites 512 webp
```

Centers each frame on a square transparent canvas and writes WebP sprites.
(`--help` shows all options.)

## Step 5 — The house ritual (EVERY asset batch — non-negotiable!)

1. Files named exactly per contract into `assets/sprites/`.
2. Add names to `js/sprites.js` **NAMES** — skipped for same-name replacements.
3. Add files to `sw.js` **FILES**.
4. **Bump the `sw.js` CACHE string** (mandatory even for replacements —
   cache-first never revalidates).
5. Verify: `node --check` edited js · run the play-test driver · eyeball
   screenshots at 2× DPR.

## Good first targets

| Object | Why it's perfect |
|---|---|
| **Balloon** | Simple shape, always moving — rotation reads beautifully |
| **Coin** | Tiny, iconic, spins on its own already |
| **Pet** | A 3D pet that turns to look around would be pure magic |

(Later: targets, fruit, chests. See plan §6.5 checklist and §7 change-matrix:
a new turntable set for an *existing* object type is only ~3 lines of code.)

## Backgrounds (later)

Plan §6.4 sketches a `tools/slice_bg.py` port (alpha-feathered horizontal band
cuts + green-channel foliage cutout per biome: far ≈ top 45%, mid ≈ 30–75%,
near ≈ bottom 25%, preview into `tmp/`). Not built yet — ask when we get there.
