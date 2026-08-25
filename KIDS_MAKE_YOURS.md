# Make the game YOURS! (for Penny & Lachlan)

Two ways to put your own stuff in Dino Bob:

---

## 1. Put YOUR drawing in the game

Your drawing becomes a real target that wiggles around the field.
When someone hits it, the game shouts **"PENNY'S DOODLE!"** and gives bonus points!

1. Draw a monster (or anything!) on white paper. Bold crayon or marker works best.
2. Ask a grown-up to take a photo of it (plain table under it, good light).
3. Save the photo into the `dino-bob` folder.
4. In Terminal, type:

   ```
   python3 tools/import_drawing.py yourphoto.jpg --name monster
   ```

   (Pick any short name instead of `monster` -- no spaces.)
5. Reload the game. That's it -- your monster is IN the game!

Add as many as you want. The game picks a different one each time.

**Tips:** fill in the white inside with color if you want it colored in the game,
press hard with the crayon so the photo shows your lines, and BIG drawings work best.

---

## 2. Be the voice of the game!

Record these 4 lines (Voice Memos on iPad works great -- yell them BIG!):

| Say this                                  | When it plays          |
| ----------------------------------------- | ---------------------- |
| "ROAR! Here comes the boss!"              | a boss wakes up        |
| "BOSS DOWN! Best archer EVER!"            | you beat the boss      |
| "Stage complete! Stars for the map!"      | you win an adventure   |
| "NEW BEST SCORE! Confetti! CONFETTI!"     | brand-new high score   |

1. Record each line 2-3 times, keep them under 3 seconds.
2. Share -> Save to Files, named exactly: `boss_appear`, `boss_down`,
   `stage_clear`, `new_best` (`.m4a` is fine).
3. Drop them in the `audio/` folder. Reload. Now it's YOUR voice!

Right now a silly robot kid ("Junior" from the Mac) reads the lines as
placeholders -- beat his takes and the game is yours. Giggles at the end
of a take are encouraged.
