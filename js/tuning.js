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

  // ---------- WIND ----------
  // Sometimes the round gets a breeze! Wind pushes arrows sideways while
  // they fly. Watch the little flag at the top of the screen.
  WIND_MAX: 55,            // strongest push possible (px/s^2) — big gusts are rare!
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
  // Marathon is ENDLESS! It never runs out of time or arrows, but if three
  // targets get away (float off, fly past, or fall), the run is over.
  MARATHON_ESCAPES: 3,       // hearts: how many targets may escape before game over
  MARATHON_WAVE_SECONDS: 30, // a new wave starts every this-many seconds
  MARATHON_MOVERS_AT: 30,    // wave when targets start moving
  MARATHON_CHAOS_AT: 60,     // wave-second when CHAOS MODE kicks in... and keeps growing!
  MARATHON_RAMP: 0.18,       // extra speed added every wave past wave 3 — it gets wild!

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
  PRICE_SHINY: 750,
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
  SCREEN_SHAKE: true         // shake the screen on a bullseye?
};
