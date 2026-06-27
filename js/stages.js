/* ============================================================================
 * Adventure stage + boss configuration  (data-driven world builder)
 * ----------------------------------------------------------------------------
 * Everything about the Adventure journey lives here as DATA so new worlds and
 * bosses can be added without touching game.js or ui.js.
 *
 * TO ADD A STAGE: copy a block in LIST, then set:
 *   id        unique slug
 *   name      shown on the map node + detail
 *   blurb     one-line description in the detail panel
 *   background a bg sprite name from sprites.js (e.g. 'bg_sunset_beach',
 *             'bg_starlight', 'bg_underwater', 'bg_meadow', 'bg_mountain',
 *             'bg_moon_cave')
 *   round     the round feel: roundSeconds, arrows, moversAt, chaosAt,
 *             targetSpeed (optional: specialRule 'balloons'|'fruit', theme)
 *   win       how to clear it:  { type:'score', goal: 900 }
 *                          or:  { type:'boss',  boss:'moonstone' }
 *   node      where its dot sits on the painted map: x/y are CSS percentages
 *             across the map, color is the dot color.
 *
 * TO ADD A BOSS: add an entry to BOSSES (keyed by id), then point a stage at it
 * with win:{ type:'boss', boss:'<id>' }.
 * ========================================================================== */
var STAGES = (function () {

  // Bosses are big, multi-hit targets.
  //   sprite  SPRITES name for the boss art
  //   hp      how many hits to defeat
  //   scale   art size relative to the round hitbox radius
  //   lift    fraction to raise the art so its weak-spot lines up with the hitbox
  var BOSSES = {
    moonstone: { name: 'Moonstone King', sprite: 'boss_moonstone', hp: 6, scale: 2.5, lift: 0.06 }
  };

  var LIST = [
    {
      id: 'whispering-woods',
      name: 'Whispering Woods',
      blurb: 'Warm up among balloons and gentle targets.',
      background: 'bg_meadow',
      round: { roundSeconds: 40, arrows: 16, moversAt: 20, chaosAt: 34, targetSpeed: 0.82 },
      win: { type: 'score', goal: 700 },
      node: { x: '4%', y: '70%', color: '#3d964c' }
    },
    {
      id: 'sky-high-peaks',
      name: 'Sky-High Peaks',
      blurb: 'Faster targets sweep across the mountain air.',
      background: 'bg_mountain',
      round: { roundSeconds: 45, arrows: 18, moversAt: 8, chaosAt: 27, targetSpeed: 1.18 },
      win: { type: 'score', goal: 1250 },
      node: { x: '39%', y: '43%', color: '#3d8fd0' }
    },
    {
      id: 'moon-cave-boss',
      name: 'Moon Cave Boss',
      blurb: 'Defeat the crowned target before your arrows run out!',
      background: 'bg_moon_cave',
      round: { roundSeconds: 50, arrows: 22, moversAt: 0, chaosAt: 0, targetSpeed: 1.08 },
      win: { type: 'boss', boss: 'moonstone' },
      node: { x: '73%', y: '15%', color: '#7652a8' }
    }
  ];

  // Build the options object that GAME.startRound() consumes from a stage.
  function optionsFor(i) {
    var s = LIST[i];
    if (!s) return null;
    var isBoss = s.win.type === 'boss';
    return {
      mode: 'adventure',
      stageIndex: i,
      label: 'STAGE ' + (i + 1) + ' · ' + s.name.toUpperCase(),
      roundSeconds: s.round.roundSeconds,
      arrows: s.round.arrows,
      moversAt: s.round.moversAt,
      chaosAt: s.round.chaosAt,
      targetSpeed: s.round.targetSpeed,
      background: s.background,
      specialRule: isBoss ? 'boss' : (s.round.specialRule || 'normal'),
      bossAtStart: isBoss,
      bossId: isBoss ? s.win.boss : null,
      theme: s.round.theme || null
    };
  }

  // Did this finished round clear stage i?
  function won(i, r) {
    var s = LIST[i];
    if (!s) return false;
    if (s.win.type === 'boss') return !!(r.stats && r.stats.bossDefeated);
    return r.score >= s.win.goal;
  }

  // Short goal text for the detail panel (empty for boss stages).
  function goalText(i) {
    var s = LIST[i];
    if (!s || s.win.type !== 'score') return '';
    return ' Goal: ' + s.win.goal + ' points.';
  }

  function bossDef(id) { return BOSSES[id] || BOSSES.moonstone; }

  return {
    list: LIST,
    bosses: BOSSES,
    count: LIST.length,
    optionsFor: optionsFor,
    won: won,
    goalText: goalText,
    bossDef: bossDef
  };
})();
