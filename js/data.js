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
      perkText: '+15% fruit & balloon points \u00b7 bullseyes toss up a bonus fruit',
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

  pets: [
    {
      id: 'ptero',
      get name() { return TUNING.NAME_PET_PTERO; },
      get price() { return TUNING.PRICE_PET; },
      perkText: 'Flies behind you and hops on bullseyes!',
      frames: ['pet_ptero_0', 'pet_ptero_1', 'pet_ptero_2', 'pet_ptero_3', 'pet_ptero_4', 'pet_ptero_5']
    },
    {
      id: 'turtle',
      get name() { return TUNING.NAME_PET_TURTLE; },
      get price() { return TUNING.PRICE_PET; },
      perkText: 'A chill shell buddy who hops on bullseyes!',
      frames: ['pet_turtle_0', 'pet_turtle_1', 'pet_turtle_2', 'pet_turtle_3', 'pet_turtle_4', 'pet_turtle_5']
    },
    {
      id: 'firefly',
      get name() { return TUNING.NAME_PET_FIREFLY; },
      get price() { return TUNING.PRICE_PET; },
      perkText: 'A tiny glowing friend who flares on bullseyes!',
      frames: ['pet_firefly_0', 'pet_firefly_1', 'pet_firefly_2', 'pet_firefly_3', 'pet_firefly_4', 'pet_firefly_5']
    }
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
    { id: 'combo_x5',       emoji: '🔥', name: 'On Fire!',       desc: 'Reach a x5 combo' },
    { id: 'all_stars',      emoji: '🌟', name: 'Map Master',     desc: 'Earn 3★ on every adventure stage' }
  ],

  // Daily quest templates. Each day picks 3 (see SAVE.dailyQuests). Progress is
  // cumulative across the day's rounds; %n in text is replaced with the target.
  questPool: [
    // Classic targets (kids know these)
    { id: 'q_bullseyes',   icon: '🎯', text: 'Hit %n bullseyes',          stat: 'bullseyes', target: 8,    reward: 40 },
    { id: 'q_bullseyes_big',icon: '🎯', text: 'Nail %n bullseyes today',   stat: 'bullseyes', target: 20,   reward: 70 },
    { id: 'q_balloons',    icon: '🎈', text: 'Pop %n balloons',           stat: 'balloons',  target: 15,   reward: 40 },
    { id: 'q_balloons_party',icon:'🎈', text: 'Pop a party of %n balloons',stat: 'balloons', target: 30,   reward: 65 },
    { id: 'q_fruits',      icon: '🍉', text: 'Splat %n fruits',           stat: 'fruits',    target: 12,   reward: 40 },
    { id: 'q_fruits_feast',icon: '🍍', text: 'Feast on %n fruits',        stat: 'fruits',    target: 25,   reward: 60 },
    { id: 'q_chests',      icon: '🎁', text: 'Open %n treasure chests',   stat: 'chests',    target: 3,    reward: 55 },
    { id: 'q_coins',       icon: '🪙', text: 'Earn %n coins',             stat: 'coins',     target: 200,  reward: 40 },
    { id: 'q_coins_bank',  icon: '🪙', text: 'Bank %n coins today',       stat: 'coins',     target: 500,  reward: 75 },
    { id: 'q_rounds',      icon: '🏹', text: 'Play %n rounds',            stat: 'rounds',    target: 3,    reward: 30 },
    { id: 'q_rounds_day',  icon: '🗓️', text: 'Play %n rounds in a day',   stat: 'rounds',    target: 5,    reward: 50 },
    { id: 'q_score',       icon: '⭐', text: 'Score %n points total',     stat: 'score',     target: 1500, reward: 50 },
    { id: 'q_score_star',  icon: '🌟', text: 'Rack up %n points today',   stat: 'score',     target: 4000, reward: 80 },
    // Variety — use round stats already tracked in game.js
    { id: 'q_golden',      icon: '🍌', text: 'Catch %n Golden Bananas',   stat: 'golden',    target: 1,    reward: 60 },
    { id: 'q_boss',        icon: '👑', text: 'Defeat a boss target',      stat: 'boss',      target: 1,    reward: 80 },
    { id: 'q_planes',      icon: '✈️', text: 'Sky-hit %n planes',         stat: 'planes',    target: 2,    reward: 45 },
    { id: 'q_doodles',     icon: '✏️', text: 'Pop %n doodle enemies',     stat: 'doodles',   target: 5,    reward: 45 },
    { id: 'q_combo',       icon: '🔥', text: 'Reach a x%n combo',         stat: 'combo',     target: 5,    reward: 55 }
  ],

  outfits: [
    // hue = canvas hue-rotate for characters without painted recolor sprites
    // (Dino Bob still uses char_dinobob_<id>.png when present).
    { id: 'classic', name: 'Classic',      price: 0,    swap: null,     hue: 0 },
    { id: 'ruby',    name: 'Ruby Red',     get price() { return TUNING.PRICE_OUTFIT; }, swap: '#e23b3b', hue: 340 },
    { id: 'grape',   name: 'Grape Purple', get price() { return TUNING.PRICE_OUTFIT; }, swap: '#8e4fd0', hue: 275 },
    { id: 'gold',    name: 'Golden',       get price() { return TUNING.PRICE_OUTFIT; }, swap: '#e8a91d', hue: 48 },
    { id: 'mint',    name: 'Minty Fresh',  get price() { return TUNING.PRICE_OUTFIT; }, swap: '#36c98e', hue: 145 }
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
  petById: function (id) {
    return this.pets.find(function (p) { return p.id === id; }) || null;
  },
  badgeById: function (id) {
    return this.badges.find(function (b) { return b.id === id; }) || null;
  }
};
