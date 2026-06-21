---
name: play-test
description: Play-test Dino Bob by driving the real game in headless Chrome — seeds a profile, clicks through every screen and mode, plays a Target Practice round, runs the 2-player Family profile-restore check, screenshots each screen, and reports any JS console/page errors. Use when asked to play-test, smoke-test, or verify Dino Bob after a change.
---

# Play-test Dino Bob

Dino Bob is a browser-driven HTML5 canvas PWA (no build step). This skill drives
it in **real Google Chrome** via `puppeteer-core` (no Chromium download — it
points at the installed Chrome) and verifies it works end to end.

## One-time setup

`puppeteer-core` only (uses system Chrome). The default `~/.npm` cache is
root-owned on this Mac, so route npm to a writable cache:

```bash
npm i --prefix ~/.dino-playtest-tools --cache /tmp/npmcache puppeteer-core
```

The driver also looks in `/tmp/imgtools/node_modules` as a fallback.

## Run it

```bash
node ~/dino-bob/.claude/skills/play-test/drive.mjs          # LOCAL working tree (file://) — tests uncommitted changes
node ~/dino-bob/.claude/skills/play-test/drive.mjs --live   # the deployed site (dino-bob-penny.netlify.app)
```

It prints a step log + a PASS/FAIL summary and writes screenshots to
`/tmp/dino-shots/`. **Read the screenshots** (`01-title` … `09-after-back-home`)
— a blank canvas means the game failed to render. A clean run ends with
`JS errors: 0`.

## What it checks
- Loads, skips the intro overlay, reaches Home with all 6 mode buttons.
- Adventure map (3 stage nodes + stars), Challenge Maker (6 controls), Family setup.
- A Target Practice round: fires arrows, the round ends, the Results screen shows
  the **Accuracy %** and **Bullseyes** rows.
- The WebP backgrounds (`bg_meadow` / `bg_mountain`) are loaded.
- **Family profile-restore**: starts a 2-player match (current profile temporarily
  switches to player 1), then backs out at the handoff and asserts the original
  profile is restored (regression guard for the goHome family fix).

## Key facts the driver relies on (keep in sync with the game)
- Save: `localStorage['dinobob_save_v1']` = `{ profiles:[...], currentId }`. A
  profile needs `equipped` + `unlocked` (not auto-migrated) or `current()` crashes.
- Canvas world is `W=1600, H=900`; bow at `(225,690)`; `MAX_PULL=300`. To fire,
  map a world pull-point **left of and below the bow** to client coords (arrow
  flies up-right): `clientX = box.x + wx/1600*box.width`, `clientY = box.y + wy/900*box.height`,
  then mouse down→up on `#game-canvas`. There is a ~3.2s `3..2..1` countdown
  before input is accepted.
- The intro is an iframe `#intro-overlay` (loads React/Babel from a CDN). The
  driver removes it so the game UI is reachable without waiting/online deps.
- Screens are `#screen-<name>`; the visible one lacks the `hidden` class.

If the game's input model, save schema, or screen ids change, update `drive.mjs`.
