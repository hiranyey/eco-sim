// Shared helpers and constants used by every simulation module.
import { GOODS, BUILDINGS, TRAITS, INNOVATIONS, OPPOSITE_TRAITS } from './data.js';
import { rand, randInt, pick } from './rng.js';
import { givenName, dynastyName } from './names.js';

export const GOOD_KEYS = Object.keys(GOODS);
export const BUILDING_KEYS = Object.keys(BUILDINGS);
export const START_YEAR = 1820;
export const GAME_MONTHS = 80 * 12;
export const JOBS_PER_LEVEL = 2; // thousand workers per building level
export const WORKFORCE_SHARE = 0.4; // share of population that works
export const SUBSISTENCE = 2.0; // grain per thousand idle workers
export const TOOL_USE = 0.25;
export const TOOL_BONUS = 0.25;
export const NEEDS = { grain: 1.0, timber: 0.12, cloth: 0.25, luxuries: 0.04 };
export const REGIMENT_IRON = 0.3; // iron consumed per regiment per month // per thousand people
export const REGIMENT_UPKEEP = 6;
export const REGIMENT_COST = 150;
export const GIFT_COST = 100;
export const PLAYER_GRACE_MONTHS = 36;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const zeroGoods = () => Object.fromEntries(GOOD_KEYS.map((g) => [g, 0]));
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

export const dateOf = (month) => `${MONTHS[month % 12]} ${START_YEAR + Math.floor(month / 12)}`;
export const yearOf = (month) => START_YEAR + Math.floor(month / 12);

// ---------- lookups ----------
export const realmOf = (s, id) => s.realms[id];
export const playerRealm = (s) => s.realms[s.playerId];
export const provincesOf = (s, id) => s.provinces.filter((p) => p.owner === id);
export const controller = (p) => (p.occupiedBy ?? p.owner);
export const totalPop = (s, id) => sum(provincesOf(s, id), (p) => p.pop);
export const charOf = (s, id) => (id == null ? null : s.characters[id] ?? null);
export const aliveRealms = (s) => s.realms.filter((r) => r.alive);
export const capitalOf = (s, id) => s.provinces.find((p) => p.owner === id && p.isCapital) ?? null;

export function ensureCapital(s, id) {
  const ps = provincesOf(s, id);
  if (!ps.length || ps.some((p) => p.isCapital)) return;
  ps.sort((a, b) => b.pop - a.pop)[0].isCapital = true;
}

// ---------- diplomacy ----------
export const relKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const getRelation = (s, a, b) => s.relations[relKey(a, b)] ?? 0;
export function addRelation(s, a, b, d) {
  const k = relKey(a, b);
  s.relations[k] = clamp((s.relations[k] ?? 0) + d, -100, 100);
}
export const getPact = (s, a, b) => s.pacts[relKey(a, b)] ?? { trade: false, alliance: false };
export function setPact(s, a, b, key, value) {
  const k = relKey(a, b);
  s.pacts[k] = { ...getPact(s, a, b), [key]: value };
}
export const hasTruce = (s, a, b) => (s.truces[relKey(a, b)] ?? -1) > s.month;
export const warsOf = (s, id) => s.wars.filter((w) => w.attackers.includes(id) || w.defenders.includes(id));
export const atWar = (s, id) => warsOf(s, id).length > 0;
export function warBetween(s, a, b) {
  return s.wars.find((w) => (w.attackers.includes(a) && w.defenders.includes(b)) ||
    (w.attackers.includes(b) && w.defenders.includes(a))) ?? null;
}
export function enemiesOf(s, id) {
  const out = new Set();
  for (const w of warsOf(s, id)) {
    for (const e of (w.attackers.includes(id) ? w.defenders : w.attackers)) out.add(e);
  }
  return [...out];
}
export function neighborRealms(s, id) {
  const out = new Set();
  for (const p of s.provinces) {
    if (p.owner !== id) continue;
    for (const n of p.neighbors) {
      const o = s.provinces[n].owner;
      if (o !== id && s.realms[o].alive) out.add(o);
    }
  }
  return [...out];
}
export const alliesOf = (s, id) => aliveRealms(s).filter((r) => r.id !== id && getPact(s, id, r.id).alliance).map((r) => r.id);
export const tradePartners = (s, id) => aliveRealms(s).filter((r) => r.id !== id && getPact(s, id, r.id).trade).map((r) => r.id);

// ---------- log ----------
// kind: info | good | bad | war | world
export function log(s, text, kind = 'info', rids = null) {
  if (rids && !rids.includes(s.playerId) && kind !== 'world') return;
  s.log.unshift({ m: s.month, text, kind });
  if (s.log.length > 150) s.log.length = 150;
}

// ---------- characters ----------
function rollTraits(s, n) {
  const keys = Object.keys(TRAITS);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 50) {
    const t = pick(s, keys);
    if (out.includes(t)) continue;
    if (OPPOSITE_TRAITS.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}

export function newCharacter(s, { realmId, ageYears, dynasty = null, role = null, parent = null, skillBias = null }) {
  const id = s.nextId++;
  const roll = () => randInt(s, 1, 7);
  const stats = { diplomacy: roll(), martial: roll(), stewardship: roll() };
  if (parent) {
    for (const k of Object.keys(stats)) stats[k] = Math.round((stats[k] + parent.stats[k]) / 2);
  }
  if (skillBias) stats[skillBias] += randInt(s, 1, 4);
  const c = {
    id, name: givenName(s), dynasty: dynasty ?? dynastyName(s),
    born: s.month - ageYears * 12 - randInt(s, 0, 11),
    traits: rollTraits(s, rand(s) < 0.3 ? 1 : 2),
    stats, realmId, role, alive: true, flags: {},
  };
  s.characters[id] = c;
  return c;
}

export function stat(c, k) {
  if (!c) return 0;
  let v = c.stats[k] ?? 0;
  for (const t of c.traits) v += TRAITS[t].stats?.[k] ?? 0;
  return Math.max(0, v);
}
export const ageOf = (s, c) => Math.floor((s.month - c.born) / 12);
export const fullName = (c) => (c ? `${c.name} ${c.dynasty}` : '—');

// ---------- modifiers ----------
export function addModifier(s, scope, id, key, value, months, label) {
  s.modifiers.push({ scope, id, key, value, months, label });
}

function addKey(m, key, v) {
  if (key.startsWith('bld.')) {
    const b = key.slice(4);
    m.bld[b] = (m.bld[b] ?? 0) + v;
  } else {
    m[key] = (m[key] ?? 0) + v;
  }
}

export function emptyMods() {
  return { bld: {}, tax: 0, army: 0, research: 0, trade: 0, unrest: 0, buildCost: 0, growth: 0, legit: 0 };
}

export function realmMods(s, r) {
  const m = emptyMods();
  for (const id of r.innovations) {
    const e = INNOVATIONS[id].effects;
    for (const [k, v] of Object.entries(e)) {
      if (k === 'bld') for (const [b, x] of Object.entries(v)) addKey(m, `bld.${b}`, x);
      else addKey(m, k, v);
    }
  }
  const ruler = charOf(s, r.rulerId);
  if (ruler) {
    for (const t of ruler.traits) {
      const T = TRAITS[t];
      if (T.tax) m.tax += T.tax;
      if (T.unrest) m.unrest += T.unrest;
      if (T.research) m.research += T.research;
      if (T.legit) m.legit += T.legit;
    }
  }
  for (const mod of s.modifiers) if (mod.scope === 'realm' && mod.id === r.id) addKey(m, mod.key, mod.value);
  return m;
}

export function provinceMods(s, p) {
  const m = emptyMods();
  for (const mod of s.modifiers) if (mod.scope === 'province' && mod.id === p.id) addKey(m, mod.key, mod.value);
  return m;
}

// ---------- markets ----------
export function initMarket() {
  return {
    price: Object.fromEntries(GOOD_KEYS.map((g) => [g, GOODS[g].base])),
    supply: zeroGoods(), demand: zeroGoods(), imports: zeroGoods(), exports: zeroGoods(),
    fill: Object.fromEntries(GOOD_KEYS.map((g) => [g, 1])),
  };
}

export const jobsOf = (type) => (BUILDINGS[type].jobs ?? 1) * JOBS_PER_LEVEL;

export function buildingLevels(p) {
  return sum(Object.values(p.buildings));
}

export function labor(p) {
  const workforce = p.pop * WORKFORCE_SHARE;
  const jobs = sum(Object.entries(p.buildings), ([t, L]) => L * jobsOf(t));
  const pending = sum(p.construction, (c) => jobsOf(c.type));
  return { workforce, jobs, pending, spare: workforce - jobs - pending };
}

export function tradeEfficiency(s, r, m = realmMods(s, r)) {
  return clamp(0.5 + 0.1 * Math.min(4, tradePartners(s, r.id).length) + m.trade, 0, 1);
}
