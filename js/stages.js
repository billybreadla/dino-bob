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
 *             Score stages use the goal to award 1-3 stars.
 *   node      where its dot sits on the painted map: x/y are CSS percentages
 *             across the map, color is the dot color. Optional `sigil` and
 *             `accent` make the map marker and detail card feel hand-authored.
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
      shortName: 'Woods',
      blurb: 'Warm up among balloons and gentle targets.',
      background: 'bg_meadow',
      round: { roundSeconds: 40, arrows: 16, moversAt: 20, chaosAt: 34, targetSpeed: 0.82 },
      win: { type: 'score', goal: 700 },
      node: { x: '8%', y: '70%', color: '#3d964c', accent: '#9fd636', sigil: 'leaf' }
    },
    {
      id: 'sunset-beach',
      name: 'Sunset Beach',
      shortName: 'Beach',
      blurb: 'Fruit targets bounce through warm gold-and-pink seaside air.',
      background: 'bg_sunset_beach',
      round: { roundSeconds: 42, arrows: 17, moversAt: 14, chaosAt: 32, targetSpeed: 0.95, specialRule: 'fruit' },
      win: { type: 'score', goal: 950 },
      node: { x: '22%', y: '57%', color: '#f28a32', accent: '#ffd23a', sigil: 'sun' }
    },
    {
      id: 'sky-high-peaks',
      name: 'Sky-High Peaks',
      shortName: 'Peaks',
      blurb: 'Faster targets sweep across the mountain air.',
      background: 'bg_mountain',
      round: { roundSeconds: 45, arrows: 18, moversAt: 8, chaosAt: 27, targetSpeed: 1.18 },
      win: { type: 'score', goal: 1250 },
      node: { x: '40%', y: '42%', color: '#3d8fd0', accent: '#62e6ff', sigil: 'peak' }
    },
    {
      id: 'starlight-ridge',
      name: 'Starlight Ridge',
      shortName: 'Stars',
      blurb: 'Slow, glowing shots cross a midnight sky full of tricky movers.',
      background: 'bg_starlight',
      round: { roundSeconds: 46, arrows: 18, moversAt: 6, chaosAt: 25, targetSpeed: 1.08 },
      win: { type: 'score', goal: 1500 },
      node: { x: '57%', y: '30%', color: '#7652a8', accent: '#caa7ff', sigil: 'star' }
    },
    {
      id: 'bubble-reef',
      name: 'Bubble Reef',
      shortName: 'Reef',
      blurb: 'Balloon currents drift underwater before the final cave.',
      background: 'bg_underwater',
      round: { roundSeconds: 48, arrows: 20, moversAt: 7, chaosAt: 28, targetSpeed: 1.10, specialRule: 'balloons' },
      win: { type: 'score', goal: 1700 },
      node: { x: '72%', y: '43%', color: '#23aaa2', accent: '#8cf2ff', sigil: 'bubble' }
    },
    {
      id: 'moon-cave-boss',
      name: 'Moon Cave Boss',
      shortName: 'Cave',
      blurb: 'Face the Moonstone King in the glowing cave finale.',
      background: 'bg_moon_cave',
      round: { roundSeconds: 50, arrows: 22, moversAt: 0, chaosAt: 0, targetSpeed: 1.08 },
      win: { type: 'boss', boss: 'moonstone' },
      node: { x: '84%', y: '18%', color: '#3e255f', accent: '#ffe27a', sigil: 'crown' }
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

  function starRating(i, r) {
    var s = LIST[i];
    if (!s || !won(i, r)) return 0;
    if (s.win.type === 'boss') {
      var shots = r.stats && r.stats.shots ? r.stats.shots : 0;
      var hits = r.stats && r.stats.hits ? r.stats.hits : 0;
      var accuracy = shots ? hits / shots : 0;
      var arrowsLeft = r.arrowsLeft || 0;
      if (accuracy >= 0.55 && arrowsLeft >= 6) return 3;
      if (accuracy >= 0.40 || arrowsLeft >= 3) return 2;
      return 1;
    }
    var goal = s.win.goal || 1;
    if (r.score >= Math.round(goal * 1.45)) return 3;
    if (r.score >= Math.round(goal * 1.20)) return 2;
    return 1;
  }

  // Short goal text for the detail panel (empty for boss stages).
  function goalText(i) {
    var s = LIST[i];
    if (!s || s.win.type !== 'score') return '';
    return ' 1★ ' + s.win.goal + ' · 2★ ' + Math.round(s.win.goal * 1.20) + ' · 3★ ' + Math.round(s.win.goal * 1.45) + ' points.';
  }

  function starGoalText(i) {
    var s = LIST[i];
    if (!s) return '';
    if (s.win.type === 'boss') return '1★ beat the boss · 2★ sharp or spare arrows · 3★ accurate + 6 arrows left';
    return '1★ ' + s.win.goal + ' · 2★ ' + Math.round(s.win.goal * 1.20) + ' · 3★ ' + Math.round(s.win.goal * 1.45);
  }

  function nodePoints() {
    return LIST.map(function (s) {
      var n = s.node || { x: '50%', y: '50%' };
      return {
        x: parseFloat(n.x),
        y: parseFloat(n.y)
      };
    });
  }

  function bossDef(id) { return BOSSES[id] || BOSSES.moonstone; }

  return {
    list: LIST,
    bosses: BOSSES,
    count: LIST.length,
    optionsFor: optionsFor,
    won: won,
    starRating: starRating,
    goalText: goalText,
    starGoalText: starGoalText,
    nodePoints: nodePoints,
    bossDef: bossDef
  };
})();
