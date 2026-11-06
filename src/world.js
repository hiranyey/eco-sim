// Procedural world generation: hex continent, terrain, realms, rulers.
import { TERRAIN, REALM_COLORS, REALM_TITLES } from './data.js';
import { rand, randInt, pick, shuffle, hashSeed } from './rng.js';
import { placeName, realmBase } from './names.js';
import { initMarket, newCharacter, relKey } from './core.js';
import { economy } from './economy.js';

export const MAP_W = 13;
export const MAP_H = 10;
export const REALM_COUNT = 5;

// Odd-r offset neighbours, indexed by edge: E, SE, SW, W, NW, NE.
const DIRS = {
  even: [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]],
  odd: [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]],
};
export const neighborCell = (x, y, dir) => {
  const [dx, dy] = DIRS[y & 1 ? 'odd' : 'even'][dir];
  return [x + dx, y + dy];
};

function genLand(s) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blobs = [];
    const n = randInt(s, 4, 6);
    for (let i = 0; i < n; i++) {
      blobs.push({ x: MAP_W * (0.22 + rand(s) * 0.56), y: MAP_H * (0.22 + rand(s) * 0.56), r: 2.2 + rand(s) * 2.3 });
    }
    const land = new Set();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const px = x + 0.5 * (y & 1);
        const py = y * 0.866;
        let best = -Infinity;
        for (const b of blobs) best = Math.max(best, b.r - Math.hypot(px - b.x, py - b.y * 0.866));
        if (best + (rand(s) - 0.5) * 0.9 > 0 && x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) land.add(`${x},${y}`);
      }
    }
    // keep the largest connected component
    const seen = new Set();
    let biggest = [];
    for (const k of land) {
      if (seen.has(k)) continue;
      const comp = [];
      const q = [k];
      seen.add(k);
      while (q.length) {
        const c = q.pop();
        comp.push(c);
        const [x, y] = c.split(',').map(Number);
        for (let d = 0; d < 6; d++) {
          const nk = neighborCell(x, y, d).join(',');
          if (land.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
      }
      if (comp.length > biggest.length) biggest = comp;
    }
    if (biggest.length >= 50 && biggest.length <= 80) return biggest.map((k) => k.split(',').map(Number));
  }
  throw new Error('Map generation failed');
}

export function newGame(seedInput = Date.now(), playerId = 0) {
  const seed = typeof seedInput === 'number' ? seedInput >>> 0 : hashSeed(seedInput);
  const s = {
    version: 1, seed, rng: seed, month: 0, playerId, nextId: 1,
    provinces: [], realms: [], characters: {}, relations: {}, pacts: {}, truces: {}, wars: [],
    modifiers: [], log: [], pendingEvents: [], worldPrice: {}, gameOver: null,
    mapW: MAP_W, mapH: MAP_H,
  };
  const cells = genLand(s);
  const index = new Map();
  const tKeys = Object.keys(TERRAIN);
  const seeds = cells.filter(() => rand(s) < 0.18).map((c) => ({ c, t: pick(s, tKeys) }));
  if (!seeds.length) seeds.push({ c: cells[0], t: 'plains' });
  const usedNames = new Set();
  cells.forEach(([x, y], i) => {
    let near = seeds[0];
    let nd = Infinity;
    for (const sd of seeds) {
      const d = Math.hypot(sd.c[0] - x, sd.c[1] - y) + rand(s) * 0.8;
      if (d < nd) { nd = d; near = sd; }
    }
    const terrain = rand(s) < 0.2 ? pick(s, tKeys) : near.t;
    let name;
    do name = placeName(s); while (usedNames.has(name));
    usedNames.add(name);
    const [lo, hi] = TERRAIN[terrain].pop;
    s.provinces.push({
      id: i, name, x, y, terrain, owner: -1, occupiedBy: null, isCapital: false,
      pop: lo + rand(s) * (hi - lo), unrest: 10, prosperity: 55, buildings: {}, construction: [], neighbors: [], edges: [], stats: null,
    });
    index.set(`${x},${y}`, i);
  });
  for (const p of s.provinces) {
    for (let d = 0; d < 6; d++) {
      const nk = neighborCell(p.x, p.y, d).join(',');
      const n = index.has(nk) ? index.get(nk) : null;
      p.edges.push(n);
      if (n != null) p.neighbors.push(n);
    }
  }

  // Realm seeds: farthest-point sampling over BFS distance
  const dist = (from) => {
    const d = new Array(s.provinces.length).fill(Infinity);
    d[from] = 0;
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const n of s.provinces[c].neighbors) if (d[n] === Infinity) { d[n] = d[c] + 1; q.push(n); }
    }
    return d;
  };
  const capitals = [randInt(s, 0, s.provinces.length - 1)];
  let minD = dist(capitals[0]);
  while (capitals.length < REALM_COUNT) {
    let best = 0;
    for (let i = 0; i < minD.length; i++) if (minD[i] > minD[best]) best = i;
    capitals.push(best);
    const d = dist(best);
    minD = minD.map((v, i) => Math.min(v, d[i]));
  }
  capitals.forEach((c, i) => { s.provinces[c].owner = i; s.provinces[c].isCapital = true; });
  const capDist = capitals.map((c) => dist(c));
  // Round-robin growth so realms end up similar in size
  let unassigned = s.provinces.filter((p) => p.owner === -1).length;
  while (unassigned > 0) {
    let progressed = false;
    for (let r = 0; r < REALM_COUNT; r++) {
      const frontier = s.provinces.filter((p) => p.owner === -1 && p.neighbors.some((n) => s.provinces[n].owner === r));
      if (!frontier.length) continue;
      // Claim the frontier cell closest to our capital, so realms stay compact.
      let bestD = Infinity;
      let choice = [];
      for (const p of frontier) {
        const d = capDist[r][p.id];
        if (d < bestD) { bestD = d; choice = [p]; } else if (d === bestD) choice.push(p);
      }
      pick(s, choice).owner = r;
      unassigned--;
      progressed = true;
      if (!unassigned) break;
    }
    if (!progressed) break;
  }
  for (const p of s.provinces) if (p.owner === -1) p.owner = s.provinces[p.neighbors[0] ?? capitals[0]].owner;

  // Starting buildings
  for (const p of s.provinces) {
    const b = p.buildings;
    if (p.terrain === 'plains') b.farm = 3;
    if (p.terrain === 'forest') { b.lumber = 2; b.farm = 1; }
    if (p.terrain === 'hills') { b.mine = 1; b.farm = 2; }
    if (p.terrain === 'mountains') b.mine = 2;
    if (p.terrain === 'marsh') { b.farm = 2; b.lumber = 1; }
    if (p.isCapital) { p.pop *= 1.5; b.weaver = 1; b.toolworks = 1; b.farm = (b.farm ?? 0) + 1; }
  }

  // Realms
  const colors = shuffle(s, [...REALM_COLORS]);
  const usedRealm = new Set();
  for (let i = 0; i < REALM_COUNT; i++) {
    let base;
    do base = realmBase(s); while (usedRealm.has(base));
    usedRealm.add(base);
    const ruler = newCharacter(s, { realmId: i, ageYears: randInt(s, 24, 50) });
    const r = {
      id: i, short: base, name: `${pick(s, REALM_TITLES)} of ${base}`, color: colors[i], alive: true,
      treasury: 3000, taxLevel: 'normal', legitimacy: 70, prestige: 0, regiments: 0, manpower: 3,
      research: 0, researchTarget: null, innovations: [], warExhaustion: 0, stance: 'balanced',
      rulerId: ruler.id, heirId: null, council: { chancellor: null, marshal: null, steward: null },
      market: initMarket(), ledger: null, history: [], candidates: {},
      autoBuild: i !== playerId, autoResearch: i !== playerId, autoArmy: i !== playerId,
    };
    s.realms.push(r);
    if (ageOf0(ruler) > 20 && rand(s) < 0.7) {
      const heir = newCharacter(s, { realmId: i, ageYears: randInt(s, 1, Math.max(1, ageOf0(ruler) - 18)), dynasty: ruler.dynasty, parent: ruler });
      r.heirId = heir.id;
    }
    for (const role of ['chancellor', 'marshal', 'steward']) {
      const skill = { chancellor: 'diplomacy', marshal: 'martial', steward: 'stewardship' }[role];
      const c = newCharacter(s, { realmId: i, ageYears: randInt(s, 25, 55), role, skillBias: skill });
      r.council[role] = c.id;
    }
    const n = s.provinces.filter((p) => p.owner === i).length;
    r.regiments = 6 + n;
  }
  for (let a = 0; a < REALM_COUNT; a++) for (let b = a + 1; b < REALM_COUNT; b++) s.relations[relKey(a, b)] = randInt(s, -20, 30);

  // Warm up markets so the first month shows sensible prices.
  const saved = s.realms.map((r) => r.treasury);
  for (let i = 0; i < 12; i++) economy(s);
  s.realms.forEach((r, i) => { r.treasury = saved[i]; r.history = []; });
  s.log.unshift({ m: 0, text: 'A new age dawns. Your court awaits your command.', kind: 'info' });
  return s;
}

const ageOf0 = (c) => Math.floor(-c.born / 12);

// Short descriptions of each realm for the start screen.
export function realmSummaries(s) {
  return s.realms.map((r) => {
    const ps = s.provinces.filter((p) => p.owner === r.id);
    const terrains = {};
    for (const p of ps) terrains[p.terrain] = (terrains[p.terrain] ?? 0) + 1;
    return {
      id: r.id, name: r.name, color: r.color, provinces: ps.length,
      pop: Math.round(ps.reduce((a, p) => a + p.pop, 0)),
      ruler: s.characters[r.rulerId],
      terrain: Object.entries(terrains).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => TERRAIN[t].name).join(' & '),
    };
  });
}

export function setPlayer(s, id) {
  s.playerId = id;
  for (const r of s.realms) {
    const isP = r.id === id;
    r.autoBuild = !isP;
    r.autoResearch = true; // the player can switch this off in the Research tab
    r.autoArmy = !isP;
  }
}
