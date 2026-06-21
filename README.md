# 🦕 Dino Bob — Arrow Blast!

A touch-based arrow shooting game designed by Penny, built with Claude Code.
Drag back like a slingshot, release to fire, earn coins, and spend them at
the Arcade on new characters, magic arrows, and skins.

## How to play it right now

Double-click `index.html` — it opens in the browser and plays immediately.
(Sound starts after the first tap, that's a browser rule.)

For the full experience with offline play + "Add to Home Screen" on the
iPad/iPhone, it needs to be hosted (see below).

## ⭐ Penny's Designer Zone

Open **`js/tuning.js`** in any text editor. Every number in that file is
safe to change: round length, scores, prices, character names, how much
confetti you get. Save the file and refresh the browser to see the change.

## Putting it on the iPad

1. Host the folder anywhere (Netlify drag-and-drop works great — same
   account as billybread.com).
2. Open the URL in Safari on the iPad.
3. Share button → **Add to Home Screen**.
4. It launches fullscreen in landscape like a real app, and works offline
   after the first load.

## Files

| File | What it is |
|---|---|
| `index.html` | All the screens (title, home, game, arcade, closet) |
| `js/tuning.js` | ⭐ Penny's Designer Zone — all the tweakable numbers |
| `js/data.js` | The catalogs: characters, arrows, hats, outfits |
| `js/game.js` | The Target Practice round: physics, targets, scoring |
| `js/art.js` | All the art, drawn with code (replace with real art later) |
| `js/ui.js` | Menus, shop, closet, profiles, confetti |
| `js/audio.js` | All sounds + music, synthesized (no audio files) |
| `js/save.js` | Profiles + saving (browser localStorage) |
| `assets/icons/` | App icon |

## Design notes

- Game world is 1600×900 and scales to any screen; iPad landscape first.
- Saves live in `localStorage` per browser/device — no accounts, no server.
- Game logic (`game.js`) never touches the DOM, so a future Capacitor
  App Store build won't require a rewrite.
- v1 art is all canvas-drawn shapes. To swap in real art, replace the draw
  functions in `js/art.js` with image blits from `assets/`.
