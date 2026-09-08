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
      streak: { count: 0, lastDay: null },  // consecutive days with play/claim
      claimedRewards: { allStars: false },  // one-time payouts (3★ everything)
      unlocks: { goldenBow: false },        // cosmetic unlocks (Golden Bow trail)
      customChallenge: null,
      stats: {},        // running tallies for badges (bullseyes, balloons, ...)
      badges: [],       // earned badge ids
      unlocked: {
        characters: ['dinobob'],
        arrows: ['wooden'],
        hats: [],
        outfits: ['classic'],
        shiny: [],
        pets: []
      },
      equipped: {
        character: 'dinobob',
        arrow: 'wooden',
        hat: null,
        outfit: 'classic',
        shiny: false,
        pet: null
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
      if (!Array.isArray(p.customBosses)) p.customBosses = [];   // Penny's Boss Workshop
      if (typeof p.marathonBest !== 'number') p.marathonBest = 0; // Marathon endless best
      if (!p.unlocked) p.unlocked = {};
      if (!Array.isArray(p.unlocked.pets)) p.unlocked.pets = [];
      if (!p.equipped) p.equipped = {};
      if (typeof p.equipped.pet === 'undefined') p.equipped.pet = null;
      if (!p.streak || typeof p.streak.count !== 'number') p.streak = { count: 0, lastDay: null };
      if (!p.claimedRewards) p.claimedRewards = { allStars: false };
      if (typeof p.claimedRewards.allStars !== 'boolean') p.claimedRewards.allStars = false;
      if (!p.unlocks) p.unlocks = { goldenBow: false };
      if (typeof p.unlocks.goldenBow !== 'boolean') p.unlocks.goldenBow = !!p.unlocks.goldenBow;
    });
    // device-wide settings (audio + accessibility), not per-profile
    if (!state.settings) state.settings = {};
    if (typeof state.settings.music !== 'boolean') state.settings.music = true;
    if (typeof state.settings.sfx !== 'boolean') state.settings.sfx = true;
    if (typeof state.settings.easy !== 'boolean') state.settings.easy = false;
    if (typeof state.settings.reducedMotion !== 'boolean') {
      state.settings.reducedMotion = !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    // family daily-challenge best: { date:'YYYY-M-D', score } — shared by the
    // whole device, wiped naturally when a new day begins (see dailyBest).
    if (!state.dailyBest || typeof state.dailyBest.score !== 'number') state.dailyBest = null;
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
  function yesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  // Touch the daily streak once per calendar day. Consecutive days increment;
  // a missed day resets to 1. Returns {count, bonus, firstToday} so UI can toast.
  function noteStreakActivity(p) {
    if (!p) return { count: 0, bonus: 0, firstToday: false };
    if (!p.streak || typeof p.streak.count !== 'number') p.streak = { count: 0, lastDay: null };
    var day = todayStr();
    if (p.streak.lastDay === day) {
      return { count: p.streak.count || 0, bonus: 0, firstToday: false };
    }
    if (p.streak.lastDay === yesterdayStr()) p.streak.count = (p.streak.count || 0) + 1;
    else p.streak.count = 1;
    p.streak.lastDay = day;
    var per = (typeof TUNING !== 'undefined' && TUNING.STREAK_COIN_PER_DAY) || 25;
    var cap = (typeof TUNING !== 'undefined' && TUNING.STREAK_COIN_CAP) || 150;
    var bonus = Math.min(cap, p.streak.count * per);
    p.coins = Math.max(0, Math.round((p.coins || 0) + bonus));
    persist();
    return { count: p.streak.count, bonus: bonus, firstToday: true };
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

    /* ----- family daily challenge best (device-wide, per calendar day) -----
       Everyone playing on this device shares one "TODAY'S BEST" for the
       deterministic daily layout. A new day starts fresh automatically. */
    dailyBest: function () {
      if (!state) load();
      return (state.dailyBest && state.dailyBest.date === todayStr()) ? state.dailyBest.score : 0;
    },
    // Record a finished daily round; true only when the family record fell.
    recordDailyBest: function (score) {
      if (!state) load();
      score = Math.max(0, Math.round(score || 0));
      if (score <= 0) return false;
      var today = todayStr();
      if (!state.dailyBest || state.dailyBest.date !== today) {
        state.dailyBest = { date: today, score: score };
        persist();
        return true;
      }
      if (score > state.dailyBest.score) {
        state.dailyBest.score = score;
        persist();
        return true;
      }
      return false;
    },

    // ----- Marathon endless best (per-profile, like highScore) -----
    marathonBest: function () {
      var p = current();
      return p ? (p.marathonBest || 0) : 0;
    },
    // Record a finished Marathon run; true only when this player's best fell.
    recordMarathonBest: function (score) {
      var p = current();
      if (!p) return false;
      score = Math.max(0, Math.round(score || 0));
      if (score > (p.marathonBest || 0)) {
        p.marathonBest = score;
        persist();
        return true;
      }
      return false;
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
      if (!Array.isArray(p.unlocked[kind])) p.unlocked[kind] = [];
      if (p.unlocked[kind].indexOf(id) === -1) p.unlocked[kind].push(id);
      persist();
    },

    owns: function (kind, id) {
      var p = current();
      return !!p && Array.isArray(p.unlocked[kind]) && p.unlocked[kind].indexOf(id) !== -1;
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

    /* ----- Penny's Boss Workshop -----
       Each player keeps up to 4 of their own boss designs, saved per-profile
       like everything else. Saving a 5th evicts the oldest (the workshop asks
        before it lets that happen). Schema:
       { id, name, hue, scale, hp, weak:'top'|'mid'|'low', wobble, created } */
    customBosses: function () {
      var p = current();
      return (p && Array.isArray(p.customBosses)) ? p.customBosses : [];
    },
    saveCustomBoss: function (boss) {
      var p = current();
      if (!p || !boss) return null;
      if (!Array.isArray(p.customBosses)) p.customBosses = [];
      p.customBosses.push(boss);
      while (p.customBosses.length > 4) p.customBosses.shift();   // oldest out
      persist();
      return boss;
    },
    deleteCustomBoss: function (id) {
      var p = current();
      if (!p) return;
      p.customBosses = (p.customBosses || []).filter(function (b) { return b.id !== id; });
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
        if (d <= 0 || q.progress >= q.target) return;
        // Combo quests track the best streak reached (max), not a running sum.
        if (tmpl.stat === 'combo') q.progress = Math.min(q.target, Math.max(q.progress, d));
        else q.progress = Math.min(q.target, q.progress + d);
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
      noteStreakActivity(p); // claiming counts as today's quest activity
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


    // Daily streak: count of consecutive calendar days with play/claim activity.
    streakInfo: function () {
      var p = current();
      if (!p || !p.streak) return { count: 0, lastDay: null };
      return { count: p.streak.count || 0, lastDay: p.streak.lastDay || null };
    },
    // Call once when a round finishes (or a quest is claimed). Pays the daily
    // streak bonus the first time that calendar day. See TUNING.STREAK_*.
    noteDailyActivity: function () {
      return noteStreakActivity(current());
    },

    hasGoldenBow: function () {
      var p = current();
      return !!(p && p.unlocks && p.unlocks.goldenBow);
    },

    // True when every adventure stage has a 3★ rating.
    allStagesThreeStars: function () {
      var p = current();
      if (!p) return false;
      var n = (typeof STAGES !== 'undefined' ? STAGES.count : 0);
      if (!n) return false;
      for (var i = 0; i < n; i++) {
        if (this.adventureStarRating(i) < 3) return false;
      }
      return true;
    },

    // One-time payout when the map is fully 3★'d: coins + Golden Bow + badge.
    // Returns null if not ready / already claimed; otherwise the grant payload.
    tryClaimAllStarsReward: function () {
      var p = current();
      if (!p) return null;
      if (!p.claimedRewards) p.claimedRewards = { allStars: false };
      if (p.claimedRewards.allStars) return null;
      if (!this.allStagesThreeStars()) return null;
      var coins = (typeof TUNING !== 'undefined' && TUNING.ALL_STARS_COIN_REWARD) || 500;
      p.claimedRewards.allStars = true;
      if (!p.unlocks) p.unlocks = { goldenBow: false };
      p.unlocks.goldenBow = true;
      p.coins = Math.max(0, Math.round((p.coins || 0) + coins));
      persist();
      var badgeNew = false;
      if (!Array.isArray(p.badges)) p.badges = [];
      if (p.badges.indexOf('all_stars') === -1) {
        p.badges.push('all_stars');
        badgeNew = true;
        persist();
      }
      return { coins: coins, goldenBow: true, badge: badgeNew };
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
