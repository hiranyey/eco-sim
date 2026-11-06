// Computer opponents. aiTurn is a generator: each yielded value is one visible action,
// so the UI can animate it before asking for the next.
import { rand } from './rng.js';
import { neighbors, distance } from './hex.js';
import { W, H, TERRAIN, UNITS, GOODS, RENOWN_TO_WIN } from './data.js';
import {
  unitAt, cityAt, citiesOf, unitsOf, hostile, relation, reachable, combatPreview, canAttack, defenseBonus,
  moveUnit, attack, recruit, upgradeCity, build, trade, income, unitCost, upgradeCost, buildingCost, canAfford,
  strength, declareWar, makePeace, territoryOwner, atWarWith, capitalOf, recruitLimit,
} from './rules.js';
import { trigger } from './events.js';

// Distance-to-goal field (lower = more attractive) via multi-source Dijkstra.
function goalField(s, fid, forRuler = false) {
  const field = new Array(W * H).fill(Infinity);
  const sources = [];
  const enemies = new Set(atWarWith(s, fid));
  if (forRuler) {
    for (const c of citiesOf(s, fid)) sources.push([c.tile, c.capital ? 0 : 2]);
  } else {
    for (const c of s.cities) {
      if (c.owner === fid) {
        const threat = s.units.some((u) => hostile(s, fid, u.owner) && u.owner >= 0 && distance(W, u.tile, c.tile) <= 3);
        const held = unitAt(s, c.tile)?.owner === fid;
        if (threat && !held) sources.push([c.tile, -3]);
      } else if (c.owner === -1) sources.push([c.tile, 0]);
      else if (enemies.has(c.owner)) sources.push([c.tile, c.capital ? -1 : 0]);
    }
    s.tiles.forEach((t, i) => {
      if (t.shrine && unitAt(s, i)?.owner !== fid) sources.push([i, 1]);
    });
    for (const u of s.units) if (enemies.has(u.owner)) sources.push([u.tile, 2]);
    if (!sources.length) for (const c of citiesOf(s, fid)) sources.push([c.tile, 3]);
  }
  const q = [];
  for (const [t, v] of sources) if (v < field[t]) { field[t] = v; q.push(t); }
  while (q.length) {
    q.sort((a, b) => field[a] - field[b]);
    const c = q.shift();
    for (const n of neighbors(W, H, c)) {
      const T = TERRAIN[s.tiles[n].t];
      if (!T.pass) continue;
      const o = territoryOwner(s, n);
      if (o != null && o >= 0 && o !== fid && !hostile(s, fid, o)) continue;
      const v = field[c] + (T.move > 1 ? 2 : 1);
      if (v < field[n]) { field[n] = v; q.push(n); }
    }
  }
  return field;
}

function danger(s, fid, tile) {
  let d = 0;
  for (const e of s.units) {
    if (e.owner < 0 || !hostile(s, fid, e.owner)) continue;
    const U = UNITS[e.type];
    if (distance(W, e.tile, tile) <= U.move + U.range) d += U.atk;
  }
  return d;
}

function attackValue(s, u, t, from) {
  const p = combatPreview(s, u, t, from);
  let v = p.dmg * 1.5 - p.ret * 1.2;
  if (p.kill) v += 12 + (t.type === 'ruler' ? 40 : 0) + (cityAt(s, t.tile) ? 8 : 0);
  if (p.dies) v -= 25;
  if (u.type === 'ruler') {
    v -= p.ret * 2.5;
    if (p.dies || u.hp - p.ret < 5) v -= 200;
  }
  return v;
}

function bestPlan(s, u, field, rulerField) {
  const options = [u.tile, ...reachable(s, u).keys()];
  const f = field;
  const isRuler = u.type === 'ruler';
  const cap = capitalOf(s, u.owner);
  let best = null;
  for (const dest of options) {
    let score = 0;
    const gf = isRuler ? rulerField[dest] : f[dest];
    score -= (gf === Infinity ? 30 : gf) * 3;
    const c = cityAt(s, dest);
    if (c && dest !== u.tile && c.owner !== u.owner && hostile(s, u.owner, c.owner)) score += 45 + c.level * 10 + (c.capital ? 40 : 0);
    if (c && c.owner === u.owner) score += 3;
    if (s.tiles[dest].shrine) score += 14;
    score += (defenseBonus(s, u, dest) - 1) * 6;
    const dz = danger(s, u.owner, dest);
    score -= dz * (isRuler ? 3 : 0.4);
    if (isRuler && cap) score -= Math.max(0, distance(W, dest, cap.tile) - 2) * 6;
    // Attacks available from here
    let atk = null;
    const canHit = canAttack(s, u) && !(UNITS[u.type].siege && dest !== u.tile);
    if (canHit && !(c && dest !== u.tile && c.owner !== u.owner)) {
      const range = UNITS[u.type].range;
      for (const t of s.units) {
        if (!hostile(s, u.owner, t.owner) || distance(W, dest, t.tile) > range) continue;
        const v = attackValue(s, u, t, dest);
        if (v > 0 && (!atk || v > atk.v)) atk = { v, id: t.id };
      }
    }
    const total = score + (atk ? atk.v : 0) + (dest === u.tile ? 0.5 : 0);
    if (!best || total > best.total) best = { total, dest, atk };
  }
  if (!best || (best.dest === u.tile && !best.atk)) return null;
  return best;
}

function* moveUnits(s, fid) {
  const field = goalField(s, fid);
  const rulerField = goalField(s, fid, true);
  const rank = { catapult: 0, archer: 1, knight: 2, spear: 3, militia: 4, cavalry: 5, ruler: 6 };
  const order = unitsOf(s, fid).sort((a, b) => rank[a.type] - rank[b.type]).map((u) => u.id);
  for (const id of order) {
    for (let step = 0; step < 2; step++) {
      const u = s.units.find((x) => x.id === id);
      if (!u || s.winner) break;
      const plan = bestPlan(s, u, field, rulerField);
      if (!plan) break;
      if (plan.dest !== u.tile) {
        const r = moveUnit(s, u.id, plan.dest);
        if (typeof r === 'string') break;
        yield r;
        if (r.capture) break;
      }
      if (plan.atk && s.units.includes(u)) {
        const r = attack(s, u.id, plan.atk.id);
        if (typeof r === 'string') break;
        yield r;
      }
      if (!UNITS[u.type].skirmish) break;
    }
  }
}

function economy(s, fid) {
  const f = s.factions[fid];
  const inc = income(s, fid);
  const grainNet = inc.grain - inc.upkeep;
  if (f.grain + grainNet * 2 < 0 && f.gold > 6) trade(s, fid, 'grain', Math.min(6, Math.ceil(-(f.grain + grainNet * 2))), 'buy');
  const keep = { grain: 10 + inc.upkeep * 2, timber: 12, iron: 10 };
  for (const g of Object.keys(GOODS)) {
    const extra = f[g] - keep[g];
    if (extra > 0 && s.market[g] >= GOODS[g].base * 0.8) trade(s, fid, g, Math.min(extra, 8), 'sell');
  }
  if (f.gold > 25 && f.iron < 3) trade(s, fid, 'iron', 3, 'buy');
  if (f.gold > 25 && f.timber < 4) trade(s, fid, 'timber', 4, 'buy');
}

function develop(s, fid, reserve) {
  const f = s.factions[fid];
  const cs = citiesOf(s, fid).sort((a, b) => (b.capital - a.capital) || (b.level - a.level));
  const inc = income(s, fid);
  for (const c of cs) {
    if (c.level < 3) {
      const cost = upgradeCost(s, fid, c);
      if (canAfford(f, { ...cost, gold: cost.gold + reserve })) upgradeCity(s, fid, c.id);
    }
    const slots = c.level - c.buildings.filter((b) => b !== 'cathedral').length;
    if (slots > 0) {
      const wants = [];
      if (inc.grain - inc.upkeep < 2) wants.push('granary');
      if (c.capital) wants.push('market');
      if (atWarWith(s, fid).length && !c.capital) wants.push('walls');
      wants.push('workshop', 'market', 'barracks', 'granary');
      const b = wants.find((x) => !c.buildings.includes(x));
      if (b && canAfford(f, { ...buildingCost(s, fid, b), gold: buildingCost(s, fid, b).gold + reserve })) build(s, fid, c.id, b);
    }
    if (c.level === 3 && !s.cities.some((x) => x.owner === fid && x.buildings.includes('cathedral')) && canAfford(f, { ...buildingCost(s, fid, 'cathedral'), gold: 20 + reserve })) build(s, fid, c.id, 'cathedral');
  }
}

function pickUnit(s, fid, city) {
  const f = s.factions[fid];
  const wars = atWarWith(s, fid);
  const nearMounted = s.units.some((u) => wars.includes(u.owner) && UNITS[u.type].mounted && distance(W, u.tile, city.tile) <= 4);
  const nearEnemyCity = s.cities.some((c) => (wars.includes(c.owner) || c.owner === -1) && distance(W, c.tile, city.tile) <= 4);
  const prefs = [];
  if (nearMounted) prefs.push('spear');
  if (wars.length && nearEnemyCity && rand(s) < 0.3) prefs.push('catapult');
  if (rand(s) < 0.5) prefs.push('knight');
  if (s.turn < 14 || f.key === 'ashkar') prefs.push('cavalry');
  prefs.push(rand(s) < 0.5 ? 'archer' : 'spear', 'archer', 'spear', 'militia');
  return prefs.find((t) => canAfford(f, unitCost(s, fid, t, city)));
}

function* recruitUnits(s, fid) {
  const f = s.factions[fid];
  const wars = atWarWith(s, fid).length;
  const cs = citiesOf(s, fid);
  const target = 3 + Math.round(cs.length * 1.4) + wars * 3;
  for (const c of cs.sort((a, b) => nearestThreat(s, fid, a) - nearestThreat(s, fid, b))) {
    for (let k = 0; k < recruitLimit(c); k++) {
      const army = unitsOf(s, fid).filter((u) => u.type !== 'ruler').length;
      const inc = income(s, fid);
      if (army >= target) return;
      if (inc.grain - inc.upkeep < -1 && f.grain < 4) return;
      if (unitAt(s, c.tile) || c.recruits >= recruitLimit(c)) break;
      const type = pickUnit(s, fid, c);
      if (!type) return;
      const r = recruit(s, fid, c.id, type);
      if (typeof r !== 'string') yield r;
    }
  }
}

function nearestThreat(s, fid, c) {
  let d = 99;
  for (const u of s.units) if (u.owner !== fid && hostile(s, fid, u.owner)) d = Math.min(d, distance(W, u.tile, c.tile));
  return d;
}

function near(s, a, b) {
  return citiesOf(s, a).some((x) => citiesOf(s, b).some((y) => distance(W, x.tile, y.tile) <= 6));
}

function diplomacy(s, fid) {
  const f = s.factions[fid];
  const mine = strength(s, fid);
  const wars = atWarWith(s, fid);
  for (const e of wars) {
    const theirs = strength(s, e);
    const r = relation(s, fid, e);
    const losing = mine < theirs * 0.6;
    const long = s.turn - r.since > 14;
    if (!losing && !long) continue;
    if (e === s.playerId) {
      if ((f.lastOffer ?? -99) + 6 > s.turn) continue;
      f.lastOffer = s.turn;
      trigger(s, s.playerId, 'peace_offer', { from: fid, gold: losing ? Math.min(f.gold, 6 + Math.round(theirs - mine)) : 0 });
    } else {
      const theirView = strength(s, e) < mine * 0.6 || long;
      if (theirView) makePeace(s, fid, e);
    }
  }
  if (s.turn < 8 || wars.length >= (mine > 25 ? 2 : 1)) return;
  const leader = [...s.factions].filter((x) => x.alive).sort((a, b) => b.renown - a.renown)[0];
  const aggression = s.difficulty === 'hard' ? 0.45 : s.difficulty === 'easy' ? 0.2 : 0.32;
  for (const o of s.factions) {
    if (!o.alive || o.id === fid || relation(s, fid, o.id).war || relation(s, fid, o.id).truce > s.turn) continue;
    if (!near(s, fid, o.id) || (o.id === s.playerId && s.turn < 10)) continue;
    const ratio = mine / Math.max(1, strength(s, o.id));
    const isLeader = o.id === leader.id && o.renown >= RENOWN_TO_WIN * 0.55;
    if ((ratio > 1.3 || (isLeader && ratio > 0.85)) && rand(s) < aggression + (isLeader ? 0.25 : 0)) {
      declareWar(s, fid, o.id);
      return;
    }
  }
}

export function* aiTurn(s, fid) {
  if (!s.factions[fid].alive || s.winner) return;
  diplomacy(s, fid);
  economy(s, fid);
  const reserve = atWarWith(s, fid).length ? 12 : 4;
  develop(s, fid, reserve);
  yield* moveUnits(s, fid);
  if (s.winner) return;
  yield* recruitUnits(s, fid);
  develop(s, fid, 0);
}

