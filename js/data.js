/* Catalogs for characters, arrows, and skins.
   Display names + prices live in tuning.js (Penny's Designer Zone). */

var DATA = {

  characters: [
    {
      id: 'dinobob',
      get name() { return TUNING.NAME_DINOBOB; },
      price: 0,
      perkText: '+10% coins · bullseyes drop a bonus coin',
      perk: { coinBonus: 0.10 }
    },
    {
      id: 'ninja',
      get name() { return TUNING.NAME_NINJA; },
      get price() { return TUNING.PRICE_CHARACTER; },
      perkText: '15% faster · bullseyes return an arrow',
      perk: { speedBonus: 0.15 }
    },
    {
      id: 'astronaut',
      get name() { return TUNING.NAME_ASTRONAUT; },
      get price() { return TUNING.PRICE_CHARACTER; },
      perkText: 'Floaty arrows · bullseyes trigger slow motion',
      perk: { gravityCut: 0.15 }
    },
    {
      id: 'robot',
      get name() { return TUNING.NAME_ROBOT; },
      get price() { return TUNING.PRICE_CHARACTER; },
      perkText: 'Long aiming line · bullseyes add time',
      perk: { previewBonus: 1.8 }
    },
    {
      id: 'bear',
      get name() { return TUNING.NAME_BEAR; },
      get price() { return TUNING.PRICE_CHARACTER; },
      perkText: '+1s ice · bullseyes freeze every target',
      perk: { freezeBonus: 1, bonusObjBonus: 0.10 }
    },
    {
      id: 'trixie',
      get name() { return TUNING.NAME_TRIXIE; },
      get price() { return TUNING.PRICE_CHARACTER; },
      perkText: '+15% points on fruit and balloons',
      perk: { bonusObjBonus: 0.15 }
    }
  ],

  arrows: [
    {
      id: 'wooden', name: 'Wooden Arrow', price: 0,
      scoreBonus: 0, gravityFactor: 1.0, speedFactor: 1.0,
      perkText: 'The trusty classic',
      color: '#8a5a2b', tipColor: '#9aa3ab'
    },
    {
      id: 'fire', name: 'Fire Arrow',
      get price() { return TUNING.PRICE_FIRE_ARROW; },
      scoreBonus: 0.25, gravityFactor: 0.75, speedFactor: 1.15,
      pierce: true,
      perkText: '+25% points · burns through the first target and keeps flying!',
      color: '#7a3010', tipColor: '#ff7a1a'
    },
    {
      id: 'ice', name: 'Ice Arrow',
      get price() { return TUNING.PRICE_ICE_ARROW; },
      scoreBonus: 0.50, gravityFactor: 0.60, speedFactor: 1.25,
      freeze: 2,
      perkText: '+50% points · freezes moving targets solid for 2 seconds!',
      color: '#1d5e8f', tipColor: '#8fdcff'
    },
    {
      id: 'lightning', name: 'Lightning Arrow',
      get price() { return TUNING.PRICE_LIGHTNING_ARROW; },
      scoreBonus: 1.00, gravityFactor: 0.15, speedFactor: 1.5,
      chain: true,
      perkText: '+100% points · zaps a bolt to the nearest target for half points!',
      color: '#7a6a10', tipColor: '#ffe33a'
    },
    {
      id: 'obsidian', name: 'Obsidian Arrow',
      get price() { return TUNING.PRICE_OBSIDIAN_ARROW; },
      scoreBonus: 0.75, gravityFactor: 0.35, speedFactor: 1.35,
      blackhole: true,
      perkText: '+75% points · opens a small BLACK HOLE that can swallow up to 3 nearby targets!',
      color: '#1a2630', tipColor: '#3fe0ff'
    }
  ],

  hats: [
    { id: 'cap',     name: 'Star Cap',       get price() { return TUNING.PRICE_HAT; } },
    { id: 'viking',  name: 'Viking Helmet',  get price() { return TUNING.PRICE_HAT; } },
    { id: 'robin',   name: 'Feather Cap',    get price() { return TUNING.PRICE_HAT; } },
    { id: 'bandana', name: 'Ninja Bandana',  get price() { return TUNING.PRICE_HAT; } },
    { id: 'wizard',  name: 'Wizard Hat',     get price() { return TUNING.PRICE_HAT; } },
    { id: 'crown',   name: 'Royal Crown',    get price() { return TUNING.PRICE_HAT; } },
    { id: 'pirate',  name: 'Pirate Hat',     get price() { return TUNING.PRICE_HAT; } },
    { id: 'dino',    name: 'Dino Hood',      get price() { return TUNING.PRICE_HAT; } },
    { id: 'astro',   name: 'Space Helmet',   get price() { return TUNING.PRICE_HAT; } }
  ],

  // Badges / stickers the player can earn (checked in game.js)
  badges: [
    { id: 'first_bullseye', emoji: '🎯', name: 'Bullseye!',     desc: 'Hit your first bullseye' },
    { id: 'balloons_50',    emoji: '🎈', name: 'Balloon Buster', desc: 'Pop 50 balloons' },
    { id: 'fruits_100',     emoji: '🍉', name: 'Fruit Ninja',    desc: 'Smash 100 fruits' },
    { id: 'chests_10',      emoji: '💎', name: 'Treasure Hunter', desc: 'Open 10 chests' },
    { id: 'golden',         emoji: '🍌', name: 'Golden Banana',  desc: 'Hit a Golden Banana' },
    { id: 'boss',           emoji: '👑', name: 'Boss Slayer',    desc: 'Defeat a boss target' },
    { id: 'blackhole',      emoji: '🕳️', name: 'Singularity',    desc: 'Open a black hole' },
    { id: 'combo_x5',       emoji: '🔥', name: 'On Fire!',       desc: 'Reach a x5 combo' }
  ],

  // Daily quest templates. Each day picks 3 (see SAVE.dailyQuests). Progress is
  // cumulative across the day's rounds; %n in text is replaced with the target.
  questPool: [
    { id: 'q_bullseyes', icon: '🎯', text: 'Hit %n bullseyes',        stat: 'bullseyes', target: 8,    reward: 40 },
    { id: 'q_balloons',  icon: '🎈', text: 'Pop %n balloons',         stat: 'balloons',  target: 15,   reward: 40 },
    { id: 'q_fruits',    icon: '🍉', text: 'Splat %n fruits',         stat: 'fruits',    target: 12,   reward: 40 },
    { id: 'q_chests',    icon: '🎁', text: 'Open %n treasure chests', stat: 'chests',    target: 3,    reward: 55 },
    { id: 'q_coins',     icon: '🪙', text: 'Earn %n coins',           stat: 'coins',     target: 200,  reward: 40 },
    { id: 'q_rounds',    icon: '🏹', text: 'Play %n rounds',          stat: 'rounds',    target: 3,    reward: 30 },
    { id: 'q_score',     icon: '⭐', text: 'Score %n points total',   stat: 'score',     target: 1500, reward: 50 }
  ],

  outfits: [
    { id: 'classic', name: 'Classic',      price: 0,    swap: null },
    { id: 'ruby',    name: 'Ruby Red',     get price() { return TUNING.PRICE_OUTFIT; }, swap: '#e23b3b' },
    { id: 'grape',   name: 'Grape Purple', get price() { return TUNING.PRICE_OUTFIT; }, swap: '#8e4fd0' },
    { id: 'gold',    name: 'Golden',       get price() { return TUNING.PRICE_OUTFIT; }, swap: '#e8a91d' },
    { id: 'mint',    name: 'Minty Fresh',  get price() { return TUNING.PRICE_OUTFIT; }, swap: '#36c98e' }
  ],

  // shiny variants are generated per character: id 'shiny_<characterId>'

  characterById: function (id) {
    return this.characters.find(function (c) { return c.id === id; }) || this.characters[0];
  },
  arrowById: function (id) {
    return this.arrows.find(function (a) { return a.id === id; }) || this.arrows[0];
  },
  hatById: function (id) {
    return this.hats.find(function (h) { return h.id === id; }) || null;
  },
  outfitById: function (id) {
    return this.outfits.find(function (o) { return o.id === id; }) || this.outfits[0];
  },
  badgeById: function (id) {
    return this.badges.find(function (b) { return b.id === id; }) || null;
  }
};
