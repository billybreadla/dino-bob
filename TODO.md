# 🦕 Dino Bob — To-Do List

## Batch 4 + feature push — DONE 2026-06-17
- [x] **Bullseye alignment fixed** — `target.png` re-cut centered on the colored rings
      (detect vivid-ring centroid in `tools/process_batch4.py`); center hits now score max.
- [x] **Arrows per round doubled** — `ARROWS_PER_ROUND` = 24.
- [x] **Obsidian arrow** (`arrow_obsidian.png`) — opens a BLACK HOLE on hit that expands,
      sucks in nearby targets (`blackhole_0/1/2.png`), then contracts. Price 3500.
- [x] **Random background** — each round picks `bg_meadow` or `bg_mountain` (`st.bgName`).
- [x] **9 hats** wired (cap/viking/robin/bandana/wizard/crown/pirate/dino/astro),
      sprite-backed `drawHat`; show in shop, closet, and on the player.
- [x] **Combo multiplier** — hits in a row build x2..x5 (`TUNING.COMBO_*`); miss resets it.
- [x] **Golden Banana** — rare high-value target (`SCORE_GOLDEN` 500), glowing.
- [x] **Power-ups** — `+3 arrows` and `slow-mo` floating pickups.
- [x] **Boss target** — giant multi-hit target with HP bar at chaos time (`SCORE_BOSS`).
- [x] **Stickers/badges** — 8 badges tracked in the save, earn-toast in play,
      viewable in the closet STICKERS section.

## Art still code-drawn
- [ ] Hats are sprites now; nothing else pending here.

## Nice-to-have / open
- [ ] Outfit color-swaps don't visibly recolor the new sprite characters
      (needs recolored character variants as their own sprites).
- [ ] Host on Netlify so it gets a URL for the iPad (then Add to Home Screen).
      NOTE: Dino Bob is a no-build static site, so redeploys cost ~nothing
      (unlike the Next.js Billy Bread site).
- [ ] Penny's design calls: final character names/perks, round length, celebration.

## Dev tools
- `tools/process_batch3.py`, `process_batch4.py` — rembg cutout pipelines.
- `tools/preview.html` — static art lineup (screenshot with headless Chrome).
- `tools/harness.html` — drives a real round via GAME.debugStep to smoke-test.
  Run it from the REPO ROOT (copy/symlink) so `assets/` paths resolve.
</content>
