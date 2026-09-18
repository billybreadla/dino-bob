/* ============================================================
   ⭐ PENNY'S DESIGNER ZONE ⭐
   ------------------------------------------------------------
   Hi designer! Every number and name in this file is YOURS.
   Change a number, save the file, refresh the game, and see
   what happens. You can't break anything — if the game ever
   acts weird, just change the number back.
   ============================================================ */

var TUNING = {

  // ---------- THE ROUND ----------
  ROUND_SECONDS: 60,        // how long one round lasts
  ARROWS_PER_ROUND: 24,     // how many arrows you get

  // When do targets start MOVING? (seconds into the round)
  MOVERS_START_AT: 15,
  // When does CHAOS MODE start? (fast targets everywhere!)
  CHAOS_START_AT: 40,

  // ---------- POINTS ----------
  SCORE_BULLSEYE_RINGS: [100, 50, 25, 10],  // center → outside
  SCORE_BALLOON: 25,
  SCORE_CHEST: 200,
  SCORE_GOLDEN: 500,             // the rare Golden Banana — big points!
  SCORE_BOSS: 600,              // beating the boss target
  MOVING_TARGET_MULTIPLIER: 2,   // moving targets are worth 2x!

  // ---------- FARAWAY TARGETS ----------
  // Some targets appear far in the distance: smaller, hazier, harder to hit.
  FAR_TARGET_CHANCE: 0.25,     // how often a target spawns far away (0 = never, 1 = always)
  FAR_TARGET_MULTIPLIER: 2,    // faraway targets are tiny but worth 2x points!

  // ---------- COMBO ----------
  COMBO_STEP: 2,        // every 2 hits in a row bumps the multiplier
  COMBO_MAX: 5,         // biggest multiplier you can reach (x5)


  // ---------- OBSTACLES / TRICK SHOTS ----------
  // From phase 2 on, some targets get blockers. Arrows THUNK and SNAP on them.
  // 0 = never, 1 = always. Start gentle so Penny can crank it up.
  OBSTACLE_CHANCE: 0.4,        // chance a new moving target gets an orbiting shield
  WALL_CHANCE: 0.22,           // chance to spawn a stone wall (phase 2+)
  OBSTACLE_SHIELD_SPEED: 1.05, // how fast the wooden shield orbits (turns per ~2s)
  OBSTACLE_SHIELD_SIZE: 34,    // shield hit radius
  WALL_HEIGHT: 210,            // stone wall height (arc over it!)
  WALL_WIDTH: 40,              // stone wall thickness

  // ---------- WIND ----------
  // Sometimes the round gets a breeze! Wind pushes arrows sideways while
  // they fly. Watch the little flag at the top of the screen.
  // UNITS: 2D world is pixels (1600×900), 3D world is metres (1 unit = 1 m).
  // These two numbers are the SAME wind, just in different ruler units.
  WIND_MAX: 55,            // 2D wind: strongest push (px/s²) ≈ 10-15% of arrow speed
  WIND_CHANCE: 0.6,        // chance a round is windy (0.6 = 60% of rounds). Rest are calm.
  WIND_MIN_SHOW: 4,        // a whisper of wind smaller than this shows no flag

  // ---------- WEATHER ----------
  // Some rounds get skies that move! Rain falls on grassy/sandy stages,
  // meteors streak over starlight, and embers drift up through the moon cave.
  WEATHER_RAIN_CHANCE: 0.4,      // chance a meadow/mountain/beach round rains
  WEATHER_METEOR_CHANCE: 0.3,    // chance a starlight round gets meteor streaks
  WEATHER_EMBER_CHANCE: 0.5,     // chance the moon cave fills with rising embers
  WEATHER_RAIN_COUNT: 90,        // raindrops falling at once during a storm
  WEATHER_LEAF_MIN: 12,          // fewest leaves blowing around a clear field
  WEATHER_LEAF_MAX: 18,          // most leaves — windier rounds blow more!
  WEATHER_LIGHTNING_MIN: 6,      // soonest lightning can strike again (seconds)
  WEATHER_LIGHTNING_MAX: 14,     // longest quiet stretch between lightning

  // ---------- MARATHON ----------
  // Marathon is ENDLESS time! No clock — you play until the arrows run out.
  // Land a BULLSEYE to earn +1 arrow; nail the GOLDEN BANANA for +3. Waves
  // still escalate so later rounds get wilder and wilder.
  MARATHON_BULLSEYE_ARROWS: 1,  // arrows gifted for a true bullseye (center ring)
  MARATHON_GOLDEN_ARROWS: 3,    // arrows gifted for the golden banana
  MARATHON_WAVE_SECONDS: 30,    // a new wave starts every this-many seconds
  MARATHON_MOVERS_AT: 30,       // seconds when targets start moving
  MARATHON_CHAOS_AT: 60,        // seconds when CHAOS MODE kicks in... and keeps growing!
  MARATHON_RAMP: 0.18,          // extra speed added every wave past wave 3 — it gets wild!

  // ---------- BOSS ATTACKS ----------
  // Each boss winds up (glow!) then does ONE telegraphed move kids can read.
  // Never spammy — long cooldown, and the "hurt" is shake / lost time, not HP.
  BOSS_ATTACK_COOLDOWN: 8,     // seconds between attacks (fair + readable)
  BOSS_ATTACK_TELEGRAPH: 1.25, // wind-up glow before the move lands
  BOSS_STONE_SPEED: 420,       // Moonstone slam-stone flight speed
  BOSS_STONE_BONUS: 75,        // points for bursting the stone mid-air
  BOSS_CHARGE_SPEED: 520,      // Crab King charge rush speed
  BOSS_SPIT_SPEED: 380,        // Angler spit blob speed

  // ---------- OBSIDIAN BLACK HOLE ----------
  BLACKHOLE_RADIUS: 210,   // how far the black hole reaches to suck things in
  BLACKHOLE_TIME: 0.95,    // seconds it stays open (expands then contracts)
  BLACKHOLE_PULL: 4.4,     // how hard it pulls targets toward the center
  BLACKHOLE_MAX_EATS: 3,   // max targets one black hole can fully swallow

  // ---------- POWER-UPS ----------
  POWERUP_ARROWS: 3,       // bonus arrows from the arrow power-up
  POWERUP_SLOWMO_TIME: 4,  // seconds of slow motion

  // ---------- FRUIT POINTS (Ms. Pac-Man style!) ----------
  // Each fruit is worth different points. Cherry = cheapest, banana = best!
  // Change any number to make a fruit worth more or less.
  FRUIT_VALUES: {
    cherry:     20,
    strawberry: 35,
    apple:      50,
    orange:     65,
    pear:       80,
    grapes:     95,
    watermelon: 110,
    pineapple:  130,
    banana:     150
  },

  // ---------- COINS ----------
  // Coins at the end = your score ÷ this number
  SCORE_PER_COIN: 10,
  // Bonus coins that fly out when you hit these:
  COINS_FROM_BALLOON: 2,
  COINS_FROM_CHEST: 15,

  // ---------- ARCADE PRICES ----------
  PRICE_CHARACTER: 1000,
  PRICE_HAT: 250,
  PRICE_OUTFIT: 500,
  // Shiny used to be just a glow (worse value than a 500c outfit). Now it
  // stacks WITH outfits, sparkles harder, and tosses bonus coins on bullseyes.
  PRICE_SHINY: 400,          // coins to unlock shiny for one character
  SHINY_BULLSEYE_COINS: 2,   // bonus coins that pop out on a true bullseye while shiny
  SHINY_GLOW_BLUR: 28,       // how soft/bright the shiny halo is (bigger = glowier)
  PRICE_FIRE_ARROW: 500,
  PRICE_ICE_ARROW: 1000,
  PRICE_LIGHTNING_ARROW: 2000,
  PRICE_OBSIDIAN_ARROW: 3500,

  // ---------- CHARACTER NAMES ----------
  // Rename anybody! (Their looks stay the same.)
  NAME_DINOBOB: 'Dino Bob',
  NAME_NINJA: 'Ninja',
  NAME_ASTRONAUT: 'Astronaut',
  NAME_ROBOT: 'Robot',
  NAME_BEAR: 'Bear',
  NAME_TRIXIE: 'Trixie',

  // ---------- SECRET FUN SWITCHES ----------
  CONFETTI_AMOUNT: 120,      // confetti pieces when you buy something
  HIGH_SCORE_FIREWORKS: 7,   // fireworks when you beat your high score
  SCREEN_SHAKE: true,        // shake the screen on a bullseye?
  // Depth parallax — extra motion on top of the global ×1.0 shake.
  // Bigger numbers = more 3D twist. 0 = flat (everything shakes together).
  PARALLAX_FAR: 0.15,        // far bg + sky atmosphere counter-move (net ×0.85)
  PARALLAX_ACTION: 0.15,     // targets, arrows, player (net ×1.15)
  PARALLAX_FG2: 0.4,         // nearest foreground strip (net ×1.4)


  // ---------- DAILY STREAK ----------
  // Play (or claim a quest) each day to keep the fire lit!
  // Day 1 = +25 coins, Day 2 = +50... up to the cap. Miss a day = back to 1.
  STREAK_COIN_PER_DAY: 25,   // coins added for each day in a row
  STREAK_COIN_CAP: 150,      // biggest streak bonus you can earn in one day

  // ---------- 3-STAR EVERYTHING ----------
  // Earn 3★ on EVERY adventure stage to unlock the Golden Bow forever.
  ALL_STARS_COIN_REWARD: 500,  // one-time coin jackpot when you perfect the map

  // ---------- PET SIDEKICK ----------
  // First baked pet: baby pterodactyl (assets/sprites/pet_ptero_*.webp).
  // Arcade shop tab comes later — flip SHOW_PET off to hide meanwhile.
  SHOW_PET: true,            // master switch for pet sidekicks
  NAME_PET_PTERO: 'Pip the Ptero',
  NAME_PET_TURTLE: 'Shelly',
  NAME_PET_FIREFLY: 'Glowbug',
  NAME_PET_BUNBUN: 'Bunbun',
  PRICE_PET: 2500,

  // ---------- 3D PROTOTYPE (graduating) ----------
  // These tune the 3D prototype in 3d.html. Same idea as the rest of this file:
  // change a number, save, refresh.
  // UNITS: 3D world is metres — 1 unit = 1 m.  Gravity 9.8 m/s² = Earth, so arrows arc like real life.
  ARROW_3D_SPEED_MIN: 26,
  ARROW_3D_SPEED_MAX: 52,
  ARROW_3D_GRAVITY: 9.8,        // 3D gravity (m/s²) — keep 9.8 so floaty/ice arrows feel right
  ARROW_3D_MAX_YAW: 0.55,      // radians left/right you can aim (0.55 ≈ 31° — was tunnel-vision 17°)
  ARROW_3D_MAX_PITCH: 0.52,    // radians up you can aim (0.52 ≈ 30°)
  ARROWS_3D: 20,
  ARROW_3D_EYE_HEIGHT: 1.65,
  ARROW_3D_PREVIEW_DOTS: 34,
  ARROW_3D_FAR_BONUS_METRES: 34,
  ARROW_3D_PULL_FRACTION: 0.38, // pull distance as fraction of viewport's smaller side (0.38 = 38%)
  ARROW_3D_DEAD_ZONE: 0.08,     // power below this is not a shot (shows hint instead)
  PET_3D_URL: 'assets/models/pet_ptero.glb',
  PET_3D_HEIGHT: 0.95,
  // Aim help — gentle magnetism when your aim is close to a target
  ARROW_3D_MAGNET_ENABLED: true,   // turn off for pure skill
  ARROW_3D_MAGNET_STRENGTH: 0.14,  // 0 = none, 0.14 = 14% pull toward nearest target
  ARROW_3D_MAGNET_RANGE: 1.9,      // how far off-target magnetism still helps (× target radius)
  ARROW_3D_FOV_NARROW: 38,         // FOV when at full pull (38 vs 46 at rest)
  ARROW_3D_CAM_SHAKE: 0.18,        // camera kick on fire
  ARROW_3D_BOW_ENABLED: true,      // show bow mesh
  // World feel — wind pushes arrows, ground shows depth
  // 3D wind uses metres per second (m/s) — same feel as WIND_MAX above, just a different ruler.
  ARROW_3D_WIND_ENABLED: true,
  ARROW_3D_WIND_MAX: 3.5,        // 3D wind: max sideways drift (m/s) — matches WIND_MAX in feel
  ARROW_3D_WIND_CHANCE: 0.6,     // 60% of rounds are windy (keep same as WIND_CHANCE)
  ARROW_3D_SHADOW_ENABLED: true,
  ARROW_3D_PARALLAX: 0.35,        // extra shake on foreground vs background
  ARROW_3D_PARTICLES: true,     // hit sparkles + dust puffs
  ARROW_3D_PARTICLE_COUNT: 12,  // sparks per bullseye
  ARROW_3D_IDLE_SWAY: 0.035,   // tiny camera wobble when you're not aiming — like the world is breathing
  ARROW_3D_FIREWORKS: 7,       // how many fireworks pop when you beat your best!
};

