// Static rules data for Hexmarch.

export const W = 14;
export const H = 10;
export const RENOWN_TO_WIN = 75;
export const TURN_LIMIT = 60;

export const GOODS = {
  grain: { name: 'Grain', icon: '🌾', base: 3 },
  timber: { name: 'Timber', icon: '🪵', base: 3 },
  iron: { name: 'Iron', icon: '⛏', base: 4 },
};

export const TERRAIN = {
  plains: { name: 'Plains', move: 1, def: 1, yields: 'grain', color: '#a9c46a', pass: true },
  forest: { name: 'Forest', move: 2, def: 1.25, yields: 'timber', color: '#5f9b4c', pass: true },
  hills: { name: 'Hills', move: 2, def: 1.5, yields: 'iron', color: '#c3a76a', pass: true },
  mountain: { name: 'Mountains', move: 99, def: 1, yields: 'iron', color: '#8f8a83', pass: false },
  water: { name: 'Lake', move: 99, def: 1, yields: 'grain', color: '#3c6f96', pass: false },
};

// Combat stats follow a simple, fully predictable formula (see rules.combatPreview).
export const UNITS = {
  militia: { name: 'Militia', cost: { gold: 3, grain: 1 }, hp: 8, atk: 2, def: 2, move: 1, range: 1, desc: 'Cheap levies. Good for holding towns.' },
  spear: { name: 'Spearmen', cost: { gold: 5, iron: 1 }, hp: 10, atk: 2, def: 3, move: 1, range: 1, antiMounted: true, desc: 'Sturdy. ×1.5 attack and defence against mounted units.' },
  archer: { name: 'Archers', cost: { gold: 5, timber: 2 }, hp: 8, atk: 2.5, def: 1, move: 1, range: 2, desc: 'Shoot from 2 hexes away. Melee units cannot strike back.' },
  cavalry: { name: 'Cavalry', cost: { gold: 7, grain: 2, iron: 1 }, hp: 10, atk: 3, def: 1, move: 3, range: 1, mounted: true, skirmish: true, desc: 'Fast. Can still move after attacking if it has not moved yet.' },
  knight: { name: 'Knights', cost: { gold: 10, iron: 3 }, hp: 15, atk: 4, def: 3, move: 2, range: 1, mounted: true, desc: 'Heavy shock troops. Expensive in iron.' },
  catapult: { name: 'Catapult', cost: { gold: 8, timber: 3, iron: 1 }, hp: 8, atk: 4, def: 0, move: 1, range: 3, siege: true, desc: 'Range 3, double damage to units in towns. Cannot fire after moving.' },
  ruler: { name: 'Ruler', cost: {}, hp: 15, atk: 3, def: 3, move: 2, range: 1, ruler: true, desc: 'Your sovereign. Adjacent allies hit 25% harder. If they fall, your realm may splinter.' },
};
export const RECRUITABLE = ['militia', 'spear', 'archer', 'cavalry', 'knight', 'catapult'];

export const CITY_LEVELS = {
  1: { gold: 2, tileYield: 1 },
  2: { gold: 4, tileYield: 1 },
  3: { gold: 6, tileYield: 2 },
};
export const UPGRADE_COST = { 2: { gold: 15, timber: 6 }, 3: { gold: 30, timber: 12, iron: 4 } };

export const BUILDINGS = {
  market: { name: 'Market', cost: { gold: 10, timber: 4 }, desc: '+3 gold per turn' },
  granary: { name: 'Granary', cost: { gold: 10, timber: 4 }, desc: '+3 grain per turn' },
  workshop: { name: 'Workshop', cost: { gold: 10, timber: 4 }, desc: '+1 timber and +1 iron per turn' },
  barracks: { name: 'Barracks', cost: { gold: 10, timber: 4 }, desc: 'Recruit 2 units per turn here, each 1 gold cheaper' },
  walls: { name: 'Walls', cost: { gold: 10, timber: 5 }, desc: 'Defenders here get ×2 defence instead of ×1.5' },
  cathedral: { name: 'Cathedral', cost: { gold: 40, timber: 15, iron: 8 }, minLevel: 3, desc: 'A grand work, one per realm: +4 renown now and +1 every turn' },
};

export const TRAITS = {
  brave: { name: 'Brave', desc: 'Ruler +1 attack' },
  tactician: { name: 'Tactician', desc: 'Ruler +1 move; inspires allies within 2 hexes' },
  shrewd: { name: 'Shrewd', desc: 'Better market prices' },
  builder: { name: 'Builder', desc: 'Upgrades and buildings cost 25% less gold' },
  beloved: { name: 'Beloved', desc: 'Towns never revolt on succession; +1 renown per town upgrade' },
  conqueror: { name: 'Conqueror', desc: '+2 extra renown per captured town' },
  pious: { name: 'Pious', desc: 'Shrines give double renown' },
  greedy: { name: 'Greedy', desc: '+2 gold per turn' },
  robust: { name: 'Robust', desc: 'Ruler +4 HP and lives longer' },
  frail: { name: 'Frail', desc: 'Ruler −4 HP and dies younger' },
};

export const FACTIONS = [
  { key: 'varr', name: 'House Varr', short: 'Varr', color: '#d0503c', bonus: 'Ironsworn', bonusDesc: 'Spearmen and Knights cost 1 less iron', motto: 'Steel remembers.' },
  { key: 'selene', name: 'House Selene', short: 'Selene', color: '#3d86e0', bonus: 'Merchant Princes', bonusDesc: 'Better market prices, Markets give +5 gold, capital +2 gold, +6 starting gold', motto: 'Every crown has a price.' },
  { key: 'thorne', name: 'House Thorne', short: 'Thorne', color: '#3caa5c', bonus: 'Woodwardens', bonusDesc: 'Archers cost 2 gold less; +1 defence in forests', motto: 'The forest watches.' },
  { key: 'ashkar', name: 'House Ashkar', short: 'Ashkar', color: '#e0a92a', bonus: 'Horselords', bonusDesc: 'Cavalry +1 move and 1 gold cheaper', motto: 'The steppe has no walls.' },
];
export const REBEL_COLOR = '#6d6a75';

export const DIFFICULTY = {
  easy: { name: 'Squire', aiGold: 0.7, aiStart: 0 },
  normal: { name: 'Lord', aiGold: 1, aiStart: 0 },
  hard: { name: 'Warlord', aiGold: 1.35, aiStart: 1 },
};

export const GIVEN = ['Aldric', 'Brenna', 'Cassian', 'Dorin', 'Elsa', 'Fenwick', 'Gisela', 'Halvard', 'Ilse', 'Joren', 'Katrin', 'Leof',
  'Maren', 'Niall', 'Odile', 'Piers', 'Quilla', 'Roderic', 'Sabine', 'Tamsin', 'Ulric', 'Vera', 'Wystan', 'Yara', 'Edda', 'Corwin',
  'Liesel', 'Matthias', 'Rowena', 'Sigrun', 'Anselm', 'Beatrix', 'Conrad', 'Dagny', 'Emeric', 'Freya', 'Gideon', 'Ivo', 'Magnus', 'Petra'];
export const PLACE_A = ['Ash', 'Bel', 'Cor', 'Dun', 'El', 'Fen', 'Gal', 'Har', 'Kel', 'Lun', 'Mor', 'Nor', 'Ost', 'Pel', 'Rav', 'Sel',
  'Tor', 'Ul', 'Val', 'Wen', 'Bry', 'Cael', 'Eir', 'Gwyn', 'Thal', 'Brin', 'Stone', 'Oak', 'Mill', 'Crow'];
export const PLACE_B = ['ford', 'mere', 'vale', 'holm', 'stead', 'wick', 'by', 'ton', 'burg', 'moor', 'fell', 'brook', 'crest', 'haven', 'gate', 'reach'];
