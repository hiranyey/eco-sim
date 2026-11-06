// Procedural map and initial game state.
import { rand, randInt, pick, shuffle, hashSeed } from './rng.js';
import { neighbors, distance, within } from './hex.js';
import { W, H, TERRAIN, FACTIONS, UNITS, GOODS, DIFFICULTY, GIVEN, PLACE_A, PLACE_B, TRAITS } from './data.js';

function noiseField(s, cell) {
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const grid = Array.from({ length: gw * gh }, () => rand(s));
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const g = (a, b) => grid[(b) * gw + a];
    const top = g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx;
    const bot = g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
}

const passable = (s, i) => TERRAIN[s.tiles[i].t].pass;

function bfs(s, from, ok = (i) => passable(s, i)) {
  const d = new Array(W * H).fill(Infinity);
  d[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    for (const n of neighbors(W, H, c)) if (d[n] === Infinity && ok(n)) { d[n] = d[c] + 1; q.push(n); }
  }
  return d;
}

function genTerrain(s) {
  const land = noiseField(s, 3.2);
  const land2 = noiseField(s, 1.7);
  const rough = noiseField(s, 2.4);
  const wood = noiseField(s, 2.1);
  s.tiles = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 * (y & 1);
      const dx = (px - (W - 0.5) / 2) / (W / 2);
      const dy = (y - (H - 1) / 2) / (H / 2);
      const edge = Math.max(Math.abs(dx), Math.abs(dy) * 1.05);
      const v = land(px, y) * 0.65 + land2(px, y) * 0.35 - Math.max(0, edge - 0.62) * 1.6;
      let t;
      if (v < 0.3) t = 'water';
      else {
        const r = rough(px, y);
        const w = wood(px, y);
        if (r > 0.74) t = 'mountain';
        else if (r > 0.6) t = 'hills';
        else if (w > 0.58) t = 'forest';
        else t = 'plains';
      }
      s.tiles.push({ t, city: -1, shrine: false });
    }
  }
  // Keep only the largest passable region; strand everything else as water/mountain.
  const seen = new Set();
  let best = [];
  for (let i = 0; i < W * H; i++) {
    if (!passable(s, i) || seen.has(i)) continue;
    const d = bfs(s, i);
    const comp = [];
    d.forEach((v, j) => { if (v < Infinity) { comp.push(j); seen.add(j); } });
    if (comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  for (let i = 0; i < W * H; i++) if (passable(s, i) && !keep.has(i)) s.tiles[i].t = 'water';
  return best.length;
}

function placeName(s, used) {
  let n;
  let guard = 0;
  do n = pick(s, PLACE_A) + pick(s, PLACE_B); while (used.has(n) && guard++ < 50);
  used.add(n);
  return n;
}

export function newCharacter(s, age) {
  const keys = Object.keys(TRAITS);
  const traits = [];
  while (traits.length < 2) {
    const t = pick(s, keys);
    if (traits.includes(t)) continue;
    if ((t === 'robust' && traits.includes('frail')) || (t === 'frail' && traits.includes('robust'))) continue;
    traits.push(t);
  }
  const id = s.nextId++;
  s.characters[id] = { id, name: pick(s, GIVEN), age, traits, alive: true };
  return id;
}

export function newGame({ seed = Date.now(), playerFaction = 0, difficulty = 'normal' } = {}) {
  const seedNum = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  const s = {
    version: 1, seed: String(seed), rng: seedNum, turn: 1, current: 0, playerId: playerFaction, difficulty,
    W, H, tiles: [], cities: [], units: [], factions: [], characters: {}, relations: {},
    market: Object.fromEntries(Object.entries(GOODS).map(([k, g]) => [k, g.base])),
    log: [], pendingEvents: [], winner: null, nextId: 1, order: [],
  };

  let capitals = null;
  for (let attempt = 0; attempt < 60 && !capitals; attempt++) {
    const size = genTerrain(s);
    if (size < 70) continue;
    const pass = [];
    for (let i = 0; i < W * H; i++) if (passable(s, i)) pass.push(i);
    // Farthest-point sampling for capitals, preferring tiles with room around them.
    const roomy = pass.filter((i) => neighbors(W, H, i).filter((n) => passable(s, n)).length >= 4);
    if (roomy.length < 10) continue;
    const caps = [pick(s, roomy)];
    let minD = bfs(s, caps[0]);
    while (caps.length < 4) {
      let bestI = -1;
      for (const i of roomy) if (!caps.includes(i) && (bestI < 0 || minD[i] > minD[bestI])) bestI = i;
      caps.push(bestI);
      const d = bfs(s, bestI);
      minD = minD.map((v, i) => Math.min(v, d[i]));
    }
    let ok = true;
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (bfs(s, caps[a])[caps[b]] < 5) ok = false;
    if (ok) capitals = caps;
  }
  if (!capitals) throw new Error('map generation failed');

  // Factions
  const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const usedNames = new Set();
  shuffle(s, capitals);
  FACTIONS.forEach((F, i) => {
    const ruler = newCharacter(s, randInt(s, 26, 40));
    const heir = rand(s) < 0.75 ? newCharacter(s, randInt(s, 2, 14)) : null;
    s.factions.push({
      id: i, key: F.key, name: F.name, short: F.short, color: F.color, alive: true, ai: i !== playerFaction,
      gold: 10, grain: 4, timber: 4, iron: 2, renown: 0, rulerId: ruler, heirId: heir,
      stats: { kills: 0, captures: 0, lost: 0, built: 0, renown: {} }, eliminatedTurn: null,
    });
    s.cities.push({ id: i, name: placeName(s, usedNames), tile: capitals[i], owner: i, level: 1, buildings: [], capital: true, recruits: 0 });
  });
  // Neutral towns
  const pass = [];
  for (let i = 0; i < W * H; i++) if (passable(s, i)) pass.push(i);
  shuffle(s, pass);
  for (const i of pass) {
    if (s.cities.length >= 16) break;
    if (s.cities.some((c) => distance(W, c.tile, i) < 3)) continue;
    if (neighbors(W, H, i).filter((n) => passable(s, n)).length < 2) continue;
    s.cities.push({ id: s.cities.length, name: placeName(s, usedNames), tile: i, owner: -1, level: 1, buildings: [], capital: false, recruits: 0 });
  }
  for (const c of s.cities) for (const t of within(W, H, c.tile, 1)) s.tiles[t].city = c.id;
  // Shrines: on contested ground, roughly equidistant from every capital.
  const capD = capitals.map((c) => bfs(s, c));
  const fairness = (i) => {
    const ds = capD.map((d) => d[i]);
    return Math.max(...ds) - Math.min(...ds) + Math.min(...ds) * 0.15 + rand(s) * 1.5;
  };
  const free = pass.filter((i) => s.tiles[i].city === -1).map((i) => [i, fairness(i)]).sort((a, b) => a[1] - b[1]).map(([i]) => i);
  const shrines = [];
  for (const i of free) {
    if (shrines.length >= 3) break;
    if (shrines.some((x) => distance(W, x, i) < 3)) continue;
    if (s.cities.some((c) => distance(W, c.tile, i) < 2)) continue;
    shrines.push(i);
    s.tiles[i].shrine = true;
  }

  // Starting armies
  for (const f of s.factions) {
    const cap = s.cities[f.id].tile;
    addUnit(s, 'ruler', f.id, cap);
    const spots = neighbors(W, H, cap).filter((n) => passable(s, n));
    shuffle(s, spots);
    addUnit(s, 'militia', f.id, spots[0]);
    addUnit(s, { varr: 'spear', selene: 'militia', thorne: 'archer', ashkar: 'cavalry' }[f.key], f.id, spots[1]);
    if (f.key === 'selene') f.gold += 6;
    if (f.ai && diff.aiStart) addUnit(s, 'spear', f.id, spots[2]);
  }
  // Rebel garrisons in most neutral towns, tougher far from capitals.
  for (const c of s.cities) {
    if (c.owner !== -1) continue;
    const far = Math.min(...capitals.map((k) => distance(W, k, c.tile)));
    if (rand(s) < 0.75) addUnit(s, far >= 5 && rand(s) < 0.5 ? 'spear' : 'militia', -1, c.tile);
  }
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) s.relations[`${a}-${b}`] = { war: false, truce: 0, since: 0 };
  s.order = [playerFaction, ...[0, 1, 2, 3].filter((i) => i !== playerFaction)];
  s.log.push({ turn: 1, text: 'Four houses stake their claims on the Marches. Take towns, hold the shrines, and win renown.', kind: 'info' });
  return s;
}

export function addUnit(s, type, owner, tile) {
  const u = { id: s.nextId++, type, owner, tile, hp: maxHp(s, type, owner), moved: true, attacked: true };
  s.units.push(u);
  return u;
}

export function maxHp(s, type, owner, vet = false) {
  let hp = UNITS[type].hp + (vet ? 4 : 0);
  if (type === 'ruler' && owner >= 0) {
    const r = s.characters[s.factions[owner].rulerId];
    if (r?.traits.includes('robust')) hp += 4;
    if (r?.traits.includes('frail')) hp -= 4;
  }
  return hp;
}
