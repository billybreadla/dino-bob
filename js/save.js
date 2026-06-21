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
    });
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
