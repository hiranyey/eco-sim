// Static game data: goods, terrain, buildings, traits, innovations, policies.

export const GOODS = {
  grain: { name: 'Grain', base: 10, icon: '🌾' },
  timber: { name: 'Timber', base: 12, icon: '🪵' },
  iron: { name: 'Iron', base: 18, icon: '⛏' },
  cloth: { name: 'Cloth', base: 20, icon: '🧵' },
  tools: { name: 'Tools', base: 30, icon: '🔨' },
  luxuries: { name: 'Luxuries', base: 50, icon: '💎' },
};

export const TERRAIN = {
  plains: { name: 'Plains', color: '#b5c97a', mods: { farm: 1.3, lumber: 0.6, mine: 0.4 }, pop: [30, 55] },
  forest: { name: 'Forest', color: '#4f8a46', mods: { farm: 0.8, lumber: 1.5, mine: 0.5 }, pop: [18, 35] },
  hills: { name: 'Hills', color: '#c2a66c', mods: { farm: 0.9, lumber: 0.8, mine: 1.3 }, pop: [18, 35] },
  mountains: { name: 'Mountains', color: '#9a958c', mods: { farm: 0.5, lumber: 0.7, mine: 1.8 }, pop: [10, 22] },
  marsh: { name: 'Marsh', color: '#7a9b8a', mods: { farm: 1.0, lumber: 1.1, mine: 0.3 }, pop: [15, 30] },
};

// Each level employs JOBS_PER_LEVEL thousand workers. Quantities are per month.
export const BUILDINGS = {
  farm: { name: 'Farm', cost: 1000, months: 6, outputs: { grain: 12 }, inputs: {}, terrainKey: 'farm', toolUser: true },
  lumber: { name: 'Lumber Camp', cost: 1000, months: 6, outputs: { timber: 8 }, inputs: {}, terrainKey: 'lumber', toolUser: true },
  mine: { name: 'Mine', cost: 1400, months: 8, outputs: { iron: 6 }, inputs: {}, terrainKey: 'mine', toolUser: true },
  weaver: { name: 'Weavery', cost: 1800, months: 9, outputs: { cloth: 5 }, inputs: { grain: 4 } },
  toolworks: { name: 'Toolworks', cost: 2400, months: 10, outputs: { tools: 5 }, inputs: { iron: 3, timber: 2 } },
  infrastructure: { name: 'Infrastructure', cost: 2000, months: 8, outputs: {}, inputs: {}, jobs: 0, max: 5, desc: 'Roads, canals and warehouses: +10% output of every building in the province. Needs no workers.' },
  sanitation: { name: 'Sanitation', cost: 2500, months: 10, outputs: {}, inputs: {}, jobs: 0, max: 3, growth: 0.0006, desc: 'Wells, drains and physicians: faster population growth here. Needs no workers.' },
  atelier: { name: 'Atelier', cost: 3200, months: 12, outputs: { luxuries: 3 }, inputs: { cloth: 3, tools: 1 } },
};

export const TRAITS = {
  ambitious: { name: 'Ambitious', desc: '+2 Martial, +1 Stewardship', stats: { martial: 2, stewardship: 1 } },
  just: { name: 'Just', desc: '+2 Stewardship, −5 unrest', stats: { stewardship: 2 }, unrest: -5 },
  cruel: { name: 'Cruel', desc: '+2 Martial, +5 unrest', stats: { martial: 2 }, unrest: 5 },
  charismatic: { name: 'Charismatic', desc: '+3 Diplomacy', stats: { diplomacy: 3 } },
  greedy: { name: 'Greedy', desc: '+8% tax income, +3 unrest', tax: 0.08, unrest: 3 },
  brave: { name: 'Brave', desc: '+3 Martial', stats: { martial: 3 } },
  craven: { name: 'Craven', desc: '−2 Martial', stats: { martial: -2 } },
  scholar: { name: 'Scholar', desc: '+30% research', research: 0.3 },
  sickly: { name: 'Sickly', desc: 'More likely to die young', health: -1 },
  robust: { name: 'Robust', desc: 'Less likely to die', health: 1 },
  diligent: { name: 'Diligent', desc: '+1 to all skills', stats: { diplomacy: 1, martial: 1, stewardship: 1 } },
  lazy: { name: 'Lazy', desc: '−1 to all skills', stats: { diplomacy: -1, martial: -1, stewardship: -1 } },
  pious: { name: 'Pious', desc: 'Legitimacy recovers faster', legit: 0.15 },
  shrewd: { name: 'Shrewd', desc: '+3 Stewardship', stats: { stewardship: 3 } },
};

export const OPPOSITE_TRAITS = [
  ['brave', 'craven'], ['diligent', 'lazy'], ['just', 'cruel'], ['sickly', 'robust'],
];

export const ROLES = {
  chancellor: { name: 'Chancellor', skill: 'diplomacy', desc: 'Improves relations and calms unrest' },
  marshal: { name: 'Marshal', skill: 'martial', desc: 'Makes your army fight better' },
  steward: { name: 'Steward', skill: 'stewardship', desc: 'Raises tax efficiency and construction capacity' },
};

export const SKILLS = { diplomacy: 'Diplomacy', martial: 'Martial', stewardship: 'Stewardship' };

export const TAX_LEVELS = {
  low: { name: 'Low', rate: 0.07, unrest: -5, desc: 'Happy people, thin coffers' },
  normal: { name: 'Normal', rate: 0.11, unrest: 5, desc: 'A fair balance' },
  high: { name: 'High', rate: 0.16, unrest: 20, desc: 'Full coffers, angry people' },
};

export const STANCES = {
  defensive: { name: 'Defensive', strength: 1.0, occupy: 0.3, losses: 0.7, desc: 'Hold the line, lose fewer men, rarely take land' },
  balanced: { name: 'Balanced', strength: 1.0, occupy: 1.0, losses: 1.0, desc: 'A measured campaign' },
  aggressive: { name: 'Aggressive', strength: 1.1, occupy: 1.6, losses: 1.35, desc: 'Push hard for land, at a bloody price' },
};

export const INNOVATIONS = {
  crop_rotation: { name: 'Crop Rotation', cost: 120, req: [], desc: 'Farms +20% output', effects: { bld: { farm: 0.2 } } },
  sawmills: { name: 'Sawmills', cost: 120, req: [], desc: 'Lumber camps +25% output', effects: { bld: { lumber: 0.25 } } },
  deep_mining: { name: 'Deep Mining', cost: 135, req: [], desc: 'Mines +25% output', effects: { bld: { mine: 0.25 } } },
  bureaucracy: { name: 'Bureaucracy', cost: 150, req: [], desc: '+10% tax efficiency', effects: { tax: 0.1 } },
  drill: { name: 'Drill Regulations', cost: 150, req: [], desc: 'Army strength +15%', effects: { army: 0.15 } },
  printing: { name: 'Printing Press', cost: 180, req: [], desc: 'Research +25%', effects: { research: 0.25 } },
  power_looms: { name: 'Power Looms', cost: 210, req: ['crop_rotation'], desc: 'Weaveries +30% output', effects: { bld: { weaver: 0.3 } } },
  precision_tools: { name: 'Precision Tools', cost: 210, req: ['deep_mining'], desc: 'Toolworks +30% output', effects: { bld: { toolworks: 0.3 } } },
  banking: { name: 'Banking', cost: 240, req: ['bureaucracy'], desc: 'Construction 20% cheaper', effects: { buildCost: -0.2 } },
  fine_arts: { name: 'Fine Arts', cost: 240, req: ['printing'], desc: 'Ateliers +30%, −5 unrest', effects: { bld: { atelier: 0.3 }, unrest: -5 } },
  steam: { name: 'Steam Power', cost: 420, req: ['power_looms', 'precision_tools'], desc: 'Weaveries, toolworks and ateliers +25%', effects: { bld: { weaver: 0.25, toolworks: 0.25, atelier: 0.25 } } },
  rifles: { name: 'Rifled Muskets', cost: 360, req: ['drill', 'precision_tools'], desc: 'Army strength +25%', effects: { army: 0.25 } },
  public_schools: { name: 'Public Schools', cost: 450, req: ['printing', 'bureaucracy'], desc: 'Research +30%, faster population growth', effects: { research: 0.3, growth: 0.0002 } },
  railways: { name: 'Railways', cost: 600, req: ['steam'], desc: 'Trade efficiency +25%, raw goods +10%', effects: { trade: 0.25, bld: { farm: 0.1, lumber: 0.1, mine: 0.1 } } },
};

export const REALM_COLORS = ['#c94c3c', '#3b7dd8', '#d9a520', '#3fa45b', '#9157c2', '#e07b2a'];
export const REALM_TITLES = ['Kingdom', 'Grand Duchy', 'Principality', 'Kingdom', 'Duchy', 'Realm'];
