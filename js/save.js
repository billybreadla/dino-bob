/* Profiles + persistence. Everything lives in localStorage under one key. */

var SAVE = (function () {
  var KEY = 'dinobob_save_v1';
  var state = null;

  function blankProfile(name, avatar) {
    return {
      id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
      name: name,
      avatar: avatar || 'dinobob',
      coins: 0,
      highScore: 0,
      roundsPlayed: 0,
      adventureStage: 0,
      adventureStars: [],
      adventureStarRatings: {},
      quests: null,     // { day:'YYYY-MM-DD', list:[{id,target,reward,progress,claimed}] }
      customChallenge: null,
      stats: {},        // running tallies for badges (bullseyes, balloons, ...)
      badges: [],       // earned badge ids
      unlocked: {
        characters: ['dinobob'],
        arrows: ['wooden'],
        hats: [],
        outfits: ['classic'],
        shiny: []
      },
      equipped: {
        character: 'dinobob',
        arrow: 'wooden',
        hat: null,
        outfit: 'classic',
        shiny: false
      }
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : null;
    } catch (e) {
      state = null;
    }
    if (!state || !Array.isArray(state.profiles)) {
      state = { profiles: [], currentId: null };
    }
    // migrate older saves so new fields always exist
    state.profiles.forEach(function (p) {
      if (!p.stats) p.stats = {};
      if (!Array.isArray(p.badges)) p.badges = [];
      if (typeof p.adventureStage !== 'number') p.adventureStage = 0;
      if (!Array.isArray(p.adventureStars)) p.adventureStars = [];
      if (!p.adventureStarRatings) p.adventureStarRatings = {};
      p.adventureStars.forEach(function (idx) {
        if (!p.adventureStarRatings[idx]) p.adventureStarRatings[idx] = 1;
      });
      if (!p.customChallenge) p.customChallenge = null;
    });
    // device-wide settings (audio + accessibility), not per-profile
    if (!state.settings) state.settings = {};
    if (typeof state.settings.music !== 'boolean') state.settings.music = true;
    if (typeof state.settings.sfx !== 'boolean') state.settings.sfx = true;
    if (typeof state.settings.easy !== 'boolean') state.settings.easy = false;
    if (typeof state.settings.reducedMotion !== 'boolean') {
      state.settings.reducedMotion = !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    return state;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* storage full or blocked — keep playing in memory */ }
  }

  function current() {
    if (!state) load();
    var p = state.profiles.find(function (p) { return p.id === state.currentId; });
    return p || null;
  }

  /* ----- daily quests ----- */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  // Deterministic per-day pick so every session that day sees the same quests.
  function pickDailyQuests(day) {
    var pool = (typeof DATA !== 'undefined' && DATA.questPool) ? DATA.questPool.slice() : [];
    var seed = 0;
    for (var i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var j = pool.length - 1; j > 0; j--) {       // seeded Fisher-Yates
      var k = Math.floor(rnd() * (j + 1));
      var tmp = pool[j]; pool[j] = pool[k]; pool[k] = tmp;
    }
    return pool.slice(0, 3).map(function (q) {
      return { id: q.id, target: q.target, reward: q.reward, progress: 0, claimed: false };
    });
  }
  function ensureQuests(p) {
    var day = todayStr();
    if (!p.quests || p.quests.day !== day) {
      p.quests = { day: day, list: pickDailyQuests(day) };
      persist();
    }
    return p.quests.list;
  }

  return {
    load: load,
    persist: persist,
    current: current,

    profiles: function () { if (!state) load(); return state.profiles; },

    addProfile: function (name, avatar) {
      var p = blankProfile(name, avatar);
      state.profiles.push(p);
      state.currentId = p.id;
      persist();
      return p;
    },

    selectProfile: function (id) {
      state.currentId = id;
      persist();
    },

    deleteProfile: function (id) {
      state.profiles = state.profiles.filter(function (p) { return p.id !== id; });
      if (state.currentId === id) state.currentId = state.profiles.length ? state.profiles[0].id : null;
      persist();
    },

    /* ----- device settings (audio + accessibility) ----- */
    settings: function () { if (!state) load(); return state.settings; },
    setSetting: function (key, val) {
      if (!state) load();
      state.settings[key] = val;
      persist();
    },

    // Wipe the CURRENT player's progress (coins, unlocks, adventure, stats,
    // badges, high score) but keep their name/avatar so they stay logged in.
    resetProgress: function () {
      var p = current();
      if (!p) return;
      var fresh = blankProfile(p.name, p.avatar);
      fresh.id = p.id;
      var idx = state.profiles.findIndex(function (x) { return x.id === p.id; });
      if (idx !== -1) state.profiles[idx] = fresh;
      persist();
    },

    addCoins: function (n) {
      var p = current();
      if (!p) return;
      p.coins = Math.max(0, Math.round(p.coins + n));
      persist();
    },

    spend: function (n) {
      var p = current();
      if (!p || p.coins < n) return false;
      p.coins -= n;
      persist();
      return true;
    },

    unlock: function (kind, id) {
      var p = current();
      if (!p) return;
      if (p.unlocked[kind].indexOf(id) === -1) p.unlocked[kind].push(id);
      persist();
    },

    owns: function (kind, id) {
      var p = current();
      return !!p && p.unlocked[kind].indexOf(id) !== -1;
    },

    equip: function (slot, value) {
      var p = current();
      if (!p) return;
      p.equipped[slot] = value;
      persist();
    },

    saveChallenge: function (challenge) {
      var p = current();
      if (!p) return;
      p.customChallenge = challenge;
      persist();
    },

    adventureStarRating: function (stageIndex) {
      var p = current();
      if (!p) return 0;
      if (p.adventureStarRatings && p.adventureStarRatings[stageIndex]) return p.adventureStarRatings[stageIndex];
      return p.adventureStars && p.adventureStars.indexOf(stageIndex) !== -1 ? 1 : 0;
    },

    adventureStarTotal: function () {
      var p = current();
      if (!p) return 0;
      var total = 0;
      var ratings = p.adventureStarRatings || {};
      Object.keys(ratings).forEach(function (k) { total += ratings[k] || 0; });
      return total;
    },

    completeAdventureStage: function (stageIndex, stars) {
      var p = current();
      if (!p) return { oldStars: 0, newStars: 0, improved: 0, reward: 0, replay: false };
      stars = Math.max(1, Math.min(3, stars || 1));
      if (!p.adventureStarRatings) p.adventureStarRatings = {};
      var oldStars = p.adventureStarRatings[stageIndex] || (p.adventureStars.indexOf(stageIndex) !== -1 ? 1 : 0);
      var improved = Math.max(0, stars - oldStars);
      if (stars > oldStars) p.adventureStarRatings[stageIndex] = stars;
      if (p.adventureStars.indexOf(stageIndex) === -1) p.adventureStars.push(stageIndex);
      // Unlock the next stage. Cap at the last stage so progression grows with
      // however many stages are defined in js/stages.js (no hard-coded count).
      var lastStage = (typeof STAGES !== 'undefined' ? STAGES.count : 3) - 1;
      p.adventureStage = Math.max(p.adventureStage || 0, Math.min(lastStage, stageIndex + 1));
      var reward = 25 + improved * 75;
      p.coins = Math.max(0, Math.round((p.coins || 0) + reward));
      persist();
      return { oldStars: oldStars, newStars: Math.max(oldStars, stars), improved: improved, reward: reward, replay: improved === 0 };
    },

    // today's 3 quests (regenerates at the start of a new day)
    dailyQuests: function () {
      var p = current();
      if (!p) return [];
      return ensureQuests(p);
    },

    // Apply a finished round's totals to today's quests. `deltas` is keyed by the
    // quest `stat` names (bullseyes, balloons, fruits, chests, coins, rounds, score).
    addQuestProgress: function (deltas) {
      var p = current();
      if (!p) return;
      var list = ensureQuests(p);
      var pool = (typeof DATA !== 'undefined' && DATA.questPool) ? DATA.questPool : [];
      list.forEach(function (q) {
        var tmpl = pool.find(function (t) { return t.id === q.id; });
        if (!tmpl) return;
        var d = deltas[tmpl.stat] || 0;
        if (d > 0 && q.progress < q.target) q.progress = Math.min(q.target, q.progress + d);
      });
      persist();
    },

    // Claim a finished quest's coins once; returns the reward (0 if not claimable).
    claimQuest: function (id) {
      var p = current();
      if (!p) return 0;
      var q = ensureQuests(p).find(function (x) { return x.id === id; });
      if (!q || q.claimed || q.progress < q.target) return 0;
      q.claimed = true;
      p.coins = Math.max(0, Math.round((p.coins || 0) + q.reward));
      persist();
      return q.reward;
    },

    // How many quests are done but not yet claimed (for the home badge).
    questsClaimable: function () {
      var p = current();
      if (!p) return 0;
      return ensureQuests(p).filter(function (q) { return !q.claimed && q.progress >= q.target; }).length;
    },

    // add n to a running stat, return the new total
    recordStat: function (key, n) {
      var p = current();
      if (!p) return 0;
      if (!p.stats) p.stats = {};
      p.stats[key] = (p.stats[key] || 0) + (n || 1);
      persist();
      return p.stats[key];
    },

    hasBadge: function (id) {
      var p = current();
      return !!p && Array.isArray(p.badges) && p.badges.indexOf(id) !== -1;
    },

    // earn a badge; returns true only the first time it's earned
    earnBadge: function (id) {
      var p = current();
      if (!p) return false;
      if (!Array.isArray(p.badges)) p.badges = [];
      if (p.badges.indexOf(id) !== -1) return false;
      p.badges.push(id);
      persist();
      return true;
    },

    recordRound: function (score) {
      var p = current();
      if (!p) return false;
      p.roundsPlayed++;
      var isHigh = score > p.highScore;
      if (isHigh) p.highScore = score;
      persist();
      return isHigh;
    }
  };
})();
