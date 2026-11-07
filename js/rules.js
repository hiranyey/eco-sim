// Game rules: queries and state-changing actions. DOM-free so it runs in Node tests.
import { rand, randInt } from './rng.js';
import { neighbors, distance, within } from './hex.js';
import {
  W, H, TERRAIN, UNITS, CITY_LEVELS, UPGRADE_COST, BUILDINGS, GOODS, RENOWN_TO_WIN, TURN_LIMIT, DIFFICULTY,
  TECHS, POLICIES, POLICY_COST, TRUCE_TURNS,
} from './data.js';
import { addUnit, maxHp, newCharacter, titled, sexOf } from './world.js';
import { rollEvent } from './events.js';
import { fogOn, vision, unitSeen, reveal } from './fog.js';
import {
  friendly, breakOath, rallyAllies, vassalsOf, tradeGold, diplomacyRound, remember,
} from './diplomacy.js';

// ---------- lookups ----------
export const unitAt = (s, tile) => s.units.find((u) => u.tile === tile) ?? null;
export const unitById = (s, id) => s.units.find((u) => u.id === id) ?? null;
export const cityAt = (s, tile) => s.cities.find((c) => c.tile === tile) ?? null;
export const citiesOf = (s, fid) => s.cities.filter((c) => c.owner === fid);
export const unitsOf = (s, fid) => s.units.filter((u) => u.owner === fid);
export const rulerOf = (s, fid) => (fid >= 0 ? s.characters[s.factions[fid].rulerId] : null);
export const hasTrait = (s, fid, t) => !!rulerOf(s, fid)?.traits.includes(t);
export const capitalOf = (s, fid) => s.cities.find((c) => c.owner === fid && c.capital) ?? null;
export const currentFaction = (s) => s.order[s.current];
export const territoryOwner = (s, tile) => (s.tiles[tile].city >= 0 ? s.cities[s.tiles[tile].city].owner : null);
export const hasTech = (s, fid, t) => fid >= 0 && !!s.factions[fid].techs?.includes(t);
export const hasPolicy = (s, fid, p) => fid >= 0 && !!s.factions[fid].policies?.includes(p);
const SELF = Object.freeze({ war: false, truce: 0, since: 0, pact: 0, alliance: false, trade: false });
export const relation = (s, a, b) => (a === b ? SELF : s.relations[a < b ? `${a}-${b}` : `${b}-${a}`]);

export function addRenown(s, fid, n, src) {
  const f = s.factions[fid];
  f.renown += n;
  f.stats.renown[src] = (f.stats.renown[src] ?? 0) + n;
}

export function log(s, text, kind = 'info') {
  s.log.push({ turn: s.turn, text, kind });
  if (s.log.length > 200) s.log.shift();
}

export function hostile(s, a, b) {
  if (a === b) return false;
  if (a < 0 || b < 0) return true;
  return relation(s, a, b).war;
}

export function atWarWith(s, fid) {
  return s.factions.filter((f) => f.alive && f.id !== fid && relation(s, fid, f.id).war).map((f) => f.id);
}

// ---------- movement ----------
export function movePoints(s, u) {
  let m = UNITS[u.type].move;
  if (u.type === 'cavalry' && u.owner >= 0 && s.factions[u.owner].key === 'ashkar') m += 1;
  if (u.type === 'ruler' && hasTrait(s, u.owner, 'tactician')) m += 1;
  if (u.type === 'knight' && hasTech(s, u.owner, 'stirrups')) m += 1;
  return m;
}

function blockedByPeace(s, u, tile) {
  const o = territoryOwner(s, tile);
  return o != null && o >= 0 && o !== u.owner && !hostile(s, u.owner, o) && !friendly(s, u.owner, o);
}

export function inZoc(s, owner, tile, seen = null) {
  for (const n of neighbors(W, H, tile)) {
    const e = unitAt(s, n);
    if (e && hostile(s, owner, e.owner) && (!seen || seen(e))) return true;
  }
  return false;
}

// Map of destination tile -> { rem, prev } for every tile the unit can end its move on.
export function reachable(s, u) {
  const out = new Map();
  if (u.moved || u.owner < 0) return out;
  // Under fog the player plans with what they can see: hidden enemies neither block nor pin the plan.
  const seen = seenBy(s, u.owner);
  const best = new Map([[u.tile, { rem: movePoints(s, u), prev: -1 }]]);
  const queue = [u.tile];
  while (queue.length) {
    queue.sort((a, b) => best.get(b).rem - best.get(a).rem);
    const cur = queue.shift();
    const { rem } = best.get(cur);
    if (rem <= 0) continue;
    for (const n of neighbors(W, H, cur)) {
      const T = TERRAIN[s.tiles[n].t];
      if (!T.pass || blockedByPeace(s, u, n)) continue;
      const occ = unitAt(s, n);
      if (occ && occ.owner !== u.owner && (!seen || seen(occ))) continue;
      let r = rem - 1;
      if (T.move > 1) r = 0; // rough ground ends movement
      if (inZoc(s, u.owner, n, seen)) r = 0; // enemies pin you down
      const prev = best.get(n);
      if (!prev || r > prev.rem) {
        best.set(n, { rem: r, prev: cur });
        queue.push(n);
      }
    }
  }
  for (const [t, v] of best) {
    const occ = unitAt(s, t);
    if (t !== u.tile && (!occ || (seen && !seen(occ)))) out.set(t, v);
  }
  return out;
}

// A visibility test for the player's units under fog, or null when everything is in view.
function seenBy(s, fid) {
  if (!fogOn(s) || fid !== s.playerId) return null;
  const vis = vision(s, fid);
  return (x) => unitSeen(s, fid, x, vis);
}

export function pathTo(reach, from, to) {
  const path = [to];
  let cur = to;
  while (reach.get(cur) && reach.get(cur).prev !== from && reach.get(cur).prev !== -1) {
    cur = reach.get(cur).prev;
    path.unshift(cur);
  }
  return path;
}

// ---------- combat ----------
// Base attack/defence after research (shown on unit cards).
export function baseAtk(s, owner, type) {
  let a = UNITS[type].atk;
  if (type === 'archer' && hasTech(s, owner, 'longbow')) a += 1;
  if (type === 'cavalry' && hasTech(s, owner, 'stirrups')) a += 1;
  if (type === 'catapult' && hasTech(s, owner, 'trebuchet')) a += 1;
  return a;
}
export function baseDef(s, owner, type) {
  let d = UNITS[type].def;
  if ((type === 'militia' || type === 'spear') && hasTech(s, owner, 'drill')) d += 1;
  return d;
}

function attackStat(s, att, def, fromTile) {
  const A = UNITS[att.type];
  let a = baseAtk(s, att.owner, att.type);
  if (hasPolicy(s, att.owner, 'warcode')) a *= 1.15;
  if (att.type === 'ruler' && hasTrait(s, att.owner, 'brave')) a += 1;
  if (A.antiMounted && UNITS[def.type].mounted) a *= 1.5;
  if (att.type !== 'ruler' && att.owner >= 0) {
    const r = s.units.find((x) => x.owner === att.owner && x.type === 'ruler');
    if (r && distance(W, r.tile, fromTile) <= (hasTrait(s, att.owner, 'tactician') ? 2 : 1)) a *= 1.25;
  }
  return a;
}

export function defenseBonus(s, u, tile = u.tile) {
  const c = cityAt(s, tile);
  if (c && (c.owner === u.owner)) return c.buildings.includes('walls') || hasPolicy(s, u.owner, 'bastions') ? 2 : 1.5;
  const t = s.tiles[tile].t;
  if (t === 'forest' && u.owner >= 0 && s.factions[u.owner].key === 'thorne') return 1.5;
  return TERRAIN[t].def;
}

function defenseStat(s, def, att) {
  const D = UNITS[def.type];
  let d = baseDef(s, def.owner, def.type);
  if (D.antiMounted && UNITS[att.type].mounted) d *= 1.5;
  return d * defenseBonus(s, def);
}

export function canAttack(s, u) {
  if (u.attacked || u.owner < 0) return false;
  if (UNITS[u.type].siege && u.moved && !hasTech(s, u.owner, 'trebuchet')) return false;
  return true;
}

export function attackTargets(s, u) {
  if (!canAttack(s, u)) return [];
  const range = UNITS[u.type].range;
  const seen = seenBy(s, u.owner);
  return s.units.filter((e) => hostile(s, u.owner, e.owner) && distance(W, u.tile, e.tile) <= range && (!seen || seen(e)));
}

// Exact outcome of an attack. Deterministic so the UI can preview it.
export function combatPreview(s, att, def, fromTile = att.tile) {
  const aStat = attackStat(s, att, def, fromTile);
  const dStat = defenseStat(s, def, att);
  const aForce = aStat * (att.hp / maxHp(s, att.type, att.owner, att.vet));
  const dForce = dStat * (def.hp / maxHp(s, def.type, def.owner, def.vet));
  const total = aForce + dForce;
  let dmg = Math.round((aForce / total) * aStat * 4.5);
  if (UNITS[att.type].siege && cityAt(s, def.tile)) dmg *= 2;
  dmg = Math.max(1, dmg);
  const kill = dmg >= def.hp;
  let ret = 0;
  if (!kill && distance(W, fromTile, def.tile) <= UNITS[def.type].range) ret = Math.round((dForce / total) * dStat * 4.5);
  return { dmg, ret, kill, dies: ret >= att.hp };
}

// ---------- actions (return an error string, or a result object) ----------
export function moveUnit(s, uid, dest) {
  const u = unitById(s, uid);
  if (!u) return 'No such unit';
  const reach = reachable(s, u);
  if (!reach.has(dest)) return 'Cannot move there';
  const path = pathTo(reach, u.tile, dest);
  const from = u.tile;
  // Under fog, a march can run into enemies nobody saw: it halts where they are found.
  let walked = path;
  let ambush = null;
  if (seenBy(s, u.owner)) {
    walked = [];
    for (const t of path) {
      const occ = unitAt(s, t);
      if (occ && occ.owner !== u.owner) { ambush = 'blocked'; break; }
      walked.push(t);
      if (t !== dest && inZoc(s, u.owner, t)) { ambush = 'spotted'; break; }
    }
    // Never stop on top of a friend: fall back to the last free hex.
    while (walked.length && unitAt(s, walked[walked.length - 1])) walked.pop();
  }
  const end = walked.length ? walked[walked.length - 1] : from;
  u.tile = end;
  u.moved = true;
  const result = { type: 'move', uid, from, path: walked, capture: null, ambush };
  if (ambush) {
    u.attacked = attackTargets(s, u).length === 0;
    if (u.owner === s.playerId) reveal(s);
    return result;
  }
  const c = cityAt(s, dest);
  if (c && c.owner !== u.owner && hostile(s, u.owner, c.owner)) {
    result.capture = capture(s, u, c);
    u.attacked = true;
  }
  return result;
}

export function attack(s, uid, targetId) {
  const u = unitById(s, uid);
  const t = unitById(s, targetId);
  if (!u || !t) return 'No such unit';
  if (!attackTargets(s, u).includes(t)) return 'Target out of range';
  const p = combatPreview(s, u, t);
  const res = { type: 'attack', uid, targetId, from: u.tile, at: t.tile, dmg: p.dmg, ret: p.ret, killed: false, died: false, advanced: false, capture: null };
  const hadMoved = u.moved;
  t.hp -= p.dmg;
  u.attacked = true;
  if (!(UNITS[u.type].skirmish && !hadMoved)) u.moved = true;
  if (t.hp <= 0) {
    res.killed = true;
    killUnit(s, t, u.owner);
    u.kills = (u.kills ?? 0) + 1;
    if (u.kills >= 3 && !u.vet && u.type !== 'ruler') {
      u.vet = true;
      u.hp += 4;
      res.veteran = true;
      if (u.owner === s.playerId) log(s, `⭐ Your ${UNITS[u.type].name} have become veterans (+4 HP).`, 'good');
    }
    if (u.owner >= 0) {
      s.factions[u.owner].stats.kills++;
      addRenown(s, u.owner, 1, 'battle');
    }
    // Melee victors advance into the vacated hex (and may take a town that way).
    if (UNITS[u.type].range === 1 && distance(W, u.tile, res.at) === 1 && !unitAt(s, res.at)) {
      u.tile = res.at;
      u.moved = true;
      res.advanced = true;
      const c = cityAt(s, res.at);
      if (c && c.owner !== u.owner && hostile(s, u.owner, c.owner)) res.capture = capture(s, u, c);
    }
  } else if (p.ret > 0) {
    u.hp -= p.ret;
    if (u.hp <= 0) {
      res.died = true;
      killUnit(s, u, t.owner);
    }
  }
  checkVictory(s);
  return res;
}

function killUnit(s, u, killer) {
  s.units = s.units.filter((x) => x !== u);
  if (u.owner >= 0) s.factions[u.owner].stats.lost++;
  if (u.type === 'ruler' && u.owner >= 0) {
    const f = s.factions[u.owner];
    const r = s.characters[f.rulerId];
    if (killer >= 0) {
      addRenown(s, killer, 4, 'battle');
      log(s, `☠ ${titled(r, 'ruler')} of ${f.name} falls in battle at the hands of ${s.factions[killer].short}! (+4 renown)`, 'war');
    }
    succession(s, u.owner, 'battle');
  }
}

export function capture(s, u, c) {
  const prev = c.owner;
  const wasCapital = c.capital;
  c.owner = u.owner;
  c.capital = false;
  c.recruits = 99;
  const f = s.factions[u.owner];
  let gain = wasCapital ? 8 : prev >= 0 ? 4 : 2;
  if (hasTrait(s, u.owner, 'conqueror')) gain += 2;
  addRenown(s, u.owner, gain, 'conquest');
  f.stats.captures++;
  log(s, `🏰 ${f.short} takes ${c.name}${prev >= 0 ? ` from ${s.factions[prev].short}` : ''}. (+${gain} renown)`, prev === s.playerId ? 'bad' : u.owner === s.playerId ? 'good' : 'war');
  if (prev >= 0) {
    if (wasCapital) relocateCapital(s, prev);
    checkElimination(s, prev);
  }
  checkVictory(s);
  return { cityId: c.id, gain, prev };
}

function relocateCapital(s, fid) {
  const cs = citiesOf(s, fid).sort((a, b) => b.level - a.level);
  if (cs.length) {
    cs[0].capital = true;
    log(s, `${s.factions[fid].short} moves its court to ${cs[0].name}.`, 'info');
  }
}

function checkElimination(s, fid) {
  const f = s.factions[fid];
  if (!f.alive || citiesOf(s, fid).length) return;
  f.alive = false;
  f.eliminatedTurn = s.turn;
  s.units = s.units.filter((u) => u.owner !== fid);
  for (const k of Object.keys(s.relations)) {
    const [a, b] = k.split('-').map(Number);
    if (a === fid || b === fid) Object.assign(s.relations[k], { war: false, alliance: false, trade: false, pact: 0 });
  }
  f.overlord = null;
  log(s, `💀 ${f.name} has been destroyed.`, fid === s.playerId ? 'bad' : 'war');
  for (const v of vassalsOf(s, fid)) {
    s.factions[v].overlord = null;
    log(s, `${s.factions[v].short} is freed from its oaths.`, 'info');
  }
  checkVictory(s);
}

export function succession(s, fid, cause) {
  const f = s.factions[fid];
  const old = s.characters[f.rulerId];
  old.alive = false;
  s.units = s.units.filter((u) => !(u.owner === fid && u.type === 'ruler'));
  const heir = f.heirId != null ? s.characters[f.heirId] : null;
  let revolt;
  if (heir) {
    f.rulerId = heir.id;
    f.heirId = null;
    revolt = cause === 'battle' ? 0.2 : 0.05;
    if (hasTech(s, fid, 'primogeniture')) revolt /= 2;
    log(s, `👑 ${titled(heir, 'ruler')} (age ${heir.age}) succeeds ${old.name} as head of ${f.name}.`, fid === s.playerId ? 'info' : 'world');
  } else {
    f.rulerId = newCharacter(s, randInt(s, 24, 40));
    revolt = 0.4;
    log(s, `👑 ${titled(old, 'ruler')} died without an heir! A distant cousin, ${s.characters[f.rulerId].name}, seizes power in ${f.name}.`, fid === s.playerId ? 'bad' : 'world');
  }
  if (hasTrait(s, fid, 'beloved')) revolt = 0;
  if (f.heirId == null && hasTech(s, fid, 'primogeniture')) f.heirId = newCharacter(s, randInt(s, 8, 16));
  for (const c of citiesOf(s, fid)) {
    if (c.capital || rand(s) >= revolt) continue;
    c.owner = -1;
    log(s, `🔥 ${c.name} rises in revolt against ${f.short}!`, fid === s.playerId ? 'bad' : 'war');
    if (!unitAt(s, c.tile)) addUnit(s, 'militia', -1, c.tile);
  }
  checkElimination(s, fid);
}

function spawnRuler(s, fid) {
  if (s.units.some((u) => u.owner === fid && u.type === 'ruler')) return;
  const cap = capitalOf(s, fid);
  if (!cap) return;
  // The new sovereign only takes the field somewhere safe.
  const spots = within(W, H, cap.tile, 2).filter((t) => TERRAIN[s.tiles[t].t].pass && !unitAt(s, t) && !inZoc(s, fid, t) && territoryOwner(s, t) !== -1);
  if (!spots.length) return;
  spots.sort((a, b) => distance(W, cap.tile, a) - distance(W, cap.tile, b));
  addUnit(s, 'ruler', fid, spots[0]);
}

// ---------- economy ----------
export function unitCost(s, fid, type, city = null) {
  const c = { ...UNITS[type].cost };
  const key = s.factions[fid].key;
  if (key === 'varr' && (type === 'spear' || type === 'knight')) c.materials = Math.max(0, (c.materials ?? 0) - 1);
  if (key === 'thorne' && type === 'archer') c.gold -= 2;
  if (key === 'ashkar' && type === 'cavalry') c.gold -= 1;
  if ((type === 'militia' || type === 'spear') && hasPolicy(s, fid, 'conscription')) c.gold = Math.max(1, c.gold - 2);
  if (city?.buildings.includes('barracks')) c.gold = Math.max(1, c.gold - 1);
  return c;
}

function discounted(s, fid, cost) {
  const c = { ...cost };
  if (hasTrait(s, fid, 'builder')) c.gold = Math.ceil(c.gold * 0.75);
  if (hasTech(s, fid, 'architecture')) for (const k of Object.keys(c)) c[k] = Math.ceil(c[k] * 0.75);
  return c;
}
export const upgradeCost = (s, fid, city) => discounted(s, fid, UPGRADE_COST[city.level + 1] ?? {});
export const buildingCost = (s, fid, b) => discounted(s, fid, BUILDINGS[b].cost);

export function canAfford(f, cost) {
  return Object.entries(cost).every(([k, v]) => (f[k] ?? 0) >= v);
}
function pay(f, cost) {
  for (const [k, v] of Object.entries(cost)) f[k] -= v;
}

export function recruitLimit(c) {
  return c.buildings.includes('barracks') ? 2 : 1;
}

export function recruit(s, fid, cityId, type) {
  const c = s.cities[cityId];
  const f = s.factions[fid];
  if (c.owner !== fid) return 'Not your town';
  if (!UNITS[type] || type === 'ruler') return 'Unknown unit';
  if (c.recruits >= recruitLimit(c)) return 'This town has already recruited this turn';
  const spot = recruitSpot(s, c);
  if (spot == null) return 'No free hex in or next to the town';
  const cost = unitCost(s, fid, type, c);
  if (!canAfford(f, cost)) return 'Not enough resources';
  pay(f, cost);
  c.recruits++;
  const u = addUnit(s, type, fid, spot);
  return { type: 'recruit', uid: u.id, tile: spot };
}

// New recruits muster in the town, or on a free hex beside it if the town is occupied.
export function recruitSpot(s, c) {
  if (!unitAt(s, c.tile)) return c.tile;
  for (const n of neighbors(W, H, c.tile)) {
    if (!TERRAIN[s.tiles[n].t].pass || unitAt(s, n)) continue;
    const o = territoryOwner(s, n);
    if (o == null || o === c.owner) return n;
  }
  return null;
}

export function upgradeCity(s, fid, cityId) {
  const c = s.cities[cityId];
  const f = s.factions[fid];
  if (c.owner !== fid) return 'Not your town';
  if (c.level >= 3) return 'Already at the highest level';
  const cost = upgradeCost(s, fid, c);
  if (!canAfford(f, cost)) return 'Not enough resources';
  pay(f, cost);
  c.level++;
  let gain = c.level === 3 ? 2 : 0;
  if (hasTrait(s, fid, 'beloved')) gain += 1;
  addRenown(s, fid, gain, 'building');
  f.stats.built++;
  log(s, `⬆ ${c.name} grows to a level ${c.level} town.${gain ? ` (+${gain} renown)` : ''}`, fid === s.playerId ? 'good' : 'info');
  checkVictory(s);
  return { type: 'upgrade' };
}

export function build(s, fid, cityId, b) {
  const c = s.cities[cityId];
  const f = s.factions[fid];
  const B = BUILDINGS[b];
  if (c.owner !== fid) return 'Not your town';
  if (!B) return 'Unknown building';
  if (c.buildings.includes(b)) return 'Already built';
  if (B.minLevel && c.level < B.minLevel) return `Requires a level ${B.minLevel} town`;
  if (b === 'cathedral' && s.cities.some((x) => x.owner === fid && x.buildings.includes('cathedral'))) return 'Your realm already has its cathedral';
  if (b !== 'cathedral' && c.buildings.filter((x) => x !== 'cathedral').length >= c.level) return 'No free building slot. Upgrade the town first';
  const cost = buildingCost(s, fid, b);
  if (!canAfford(f, cost)) return 'Not enough resources';
  pay(f, cost);
  c.buildings.push(b);
  f.stats.built++;
  if (b === 'cathedral') {
    addRenown(s, fid, 4, 'building');
    log(s, `⛪ ${f.short} raises a great cathedral in ${c.name}. (+4 renown)`, fid === s.playerId ? 'good' : 'war');
    checkVictory(s);
  }
  return { type: 'build' };
}

export function tileYield(s, tile) {
  const T = TERRAIN[s.tiles[tile].t];
  return T.yields;
}

export function income(s, fid) {
  const f = s.factions[fid];
  const out = { gold: 0, grain: 0, materials: 0, lore: 0, upkeep: 0 };
  const has = (t) => hasTech(s, fid, t);
  const pol = (p) => hasPolicy(s, fid, p);
  const cs = citiesOf(s, fid);
  for (const c of cs) {
    const L = CITY_LEVELS[c.level];
    out.gold += L.gold + (c.capital ? 2 : 0) + (c.capital && f.key === 'selene' ? 3 : 0);
    out.lore += c.level + (c.capital ? 1 + (has('bureaucracy') ? 2 : 0) : 0);
    if (c.capital) out.grain += 2;
    if (has('rotation')) out.grain += 1;
    if (has('coinage')) out.gold += 1;
    if (c.buildings.includes('market')) out.gold += (f.key === 'selene' ? 5 : 3) + (has('guilds') ? 2 : 0) + (pol('freetrade') ? 2 : 0);
    if (c.buildings.includes('granary')) out.grain += 3;
    if (c.buildings.includes('library')) out.lore += 2;
    if (c.buildings.includes('workshop')) out.materials += has('guilds') ? 4 : 2;
    for (const t of within(W, H, c.tile, 1)) {
      if (s.tiles[t].city !== c.id) continue;
      out[tileYield(s, t)] += L.tileYield;
    }
  }
  if (hasTrait(s, fid, 'greedy')) out.gold += 2;
  if (f.ai) out.gold = Math.round(out.gold * (DIFFICULTY[s.difficulty]?.aiGold ?? 1));
  const soldiers = unitsOf(s, fid).filter((u) => u.type !== 'ruler').length;
  out.upkeep = pol('rations') ? Math.ceil((soldiers * 2) / 3) : soldiers;
  if (pol('tithes')) { out.gold += cs.length; out.grain -= cs.length; }
  if (pol('conscription')) out.lore -= 2;
  if (pol('patronage')) { out.lore = Math.floor(out.lore * 1.5); out.gold -= 3; }
  if (pol('warcode')) out.gold -= Math.floor(soldiers / 3);
  if (pol('bastions')) out.gold -= cs.length;
  if (pol('pilgrimage')) out.gold -= 2;
  out.lore = Math.max(0, out.lore);
  // Diplomacy: trade routes, and the tribute that flows from vassal to liege.
  out.trade = 0;
  for (const o of s.factions) if (o.alive && o.id !== fid && relation(s, fid, o.id).trade) out.trade += tradeGold(s, fid, o.id);
  out.gold += out.trade;
  out.tribute = 0;
  if (f.overlord != null) {
    out.tribute = -Math.max(1, Math.floor(Math.max(0, out.gold) / 4));
  } else {
    for (const v of vassalsOf(s, fid)) out.tribute -= income(s, v).tribute;
  }
  out.gold += out.tribute;
  return out;
}

// Renown earned at the start of each turn: { shrines, building }.
export function renownSources(s, fid) {
  const out = { shrines: 0, building: 0, vassals: vassalsOf(s, fid).length };
  const per = (hasTrait(s, fid, 'pious') ? 2 : 1) + (hasTech(s, fid, 'divine') ? 1 : 0) + (hasPolicy(s, fid, 'pilgrimage') ? 1 : 0);
  for (const u of unitsOf(s, fid)) if (s.tiles[u.tile].shrine) out.shrines += per;
  for (const c of citiesOf(s, fid)) if (c.buildings.includes('cathedral')) out.building += 1 + (hasPolicy(s, fid, 'pilgrimage') ? 1 : 0);
  return out;
}
export function renownIncome(s, fid) {
  const r = renownSources(s, fid);
  return r.shrines + r.building + r.vassals;
}

// ---------- research & policies ----------
export function techAvailable(s, fid, key) {
  const T = TECHS[key];
  if (!T || hasTech(s, fid, key)) return false;
  return T.tier === 1 || Object.entries(TECHS).some(([k, x]) => x.branch === T.branch && x.tier === T.tier - 1 && hasTech(s, fid, k));
}

export function setResearch(s, fid, key) {
  const f = s.factions[fid];
  if (key != null && !techAvailable(s, fid, key)) return 'Not available yet';
  f.research = key;
  const done = progressResearch(s, fid);
  return { type: 'research', done };
}

// Completes the current tech if enough lore is banked. Returns the finished tech key or null.
export function progressResearch(s, fid) {
  const f = s.factions[fid];
  if (!f.research) return null;
  const T = TECHS[f.research];
  if (f.lore < T.cost) return null;
  const key = f.research;
  f.lore -= T.cost;
  f.techs.push(key);
  f.research = null;
  if (T.renown) addRenown(s, fid, T.renown, 'research');
  if (key === 'primogeniture' && f.heirId == null) f.heirId = newCharacter(s, randInt(s, 8, 16));
  log(s, `📜 ${f.short} masters ${T.name}.${T.renown ? ` (+${T.renown} renown)` : ''}`, fid === s.playerId ? 'good' : 'world');
  checkVictory(s);
  return key;
}

export function policySlots(s, fid) {
  return 1 + (hasTech(s, fid, 'laws') ? 1 : 0) + (hasTech(s, fid, 'bureaucracy') ? 1 : 0);
}

export function policyAvailable(s, fid, key) {
  const P = POLICIES[key];
  return !!P && (!P.req || hasTech(s, fid, P.req));
}

export function adoptPolicy(s, fid, key) {
  const f = s.factions[fid];
  if (!policyAvailable(s, fid, key)) return `Requires ${TECHS[POLICIES[key]?.req]?.name ?? 'research'}`;
  if (f.policies.includes(key)) return 'Already adopted';
  if (f.policies.length >= policySlots(s, fid)) return 'No free policy slot. Drop a policy first';
  if (f.gold < POLICY_COST) return `Need ${POLICY_COST} gold`;
  f.gold -= POLICY_COST;
  f.policies.push(key);
  return { type: 'policy' };
}

export function dropPolicy(s, fid, key) {
  const f = s.factions[fid];
  if (!f.policies.includes(key)) return 'Not adopted';
  f.policies = f.policies.filter((p) => p !== key);
  return { type: 'policy' };
}

// ---------- exchange ----------
// Fixed prices: buy for 1 gold more than a good is worth, sell for 1 less.
// Each merchant edge (a Shrewd ruler, Free Trade) closes the gap by a step: first sell at full worth, then buy at it.
// House Selene trades at full worth from the start.
export function prices(s, fid, good) {
  const edges = (s.factions[fid].key === 'selene' ? 2 : 0) + hasTrait(s, fid, 'shrewd') + hasPolicy(s, fid, 'freetrade');
  const base = GOODS[good].base;
  return { buy: base + (edges >= 2 ? 0 : 1), sell: base - (edges >= 1 ? 0 : 1) };
}

export function quote(s, fid, good, n, side) {
  return { total: prices(s, fid, good)[side] * n };
}

export function trade(s, fid, good, n, side) {
  const f = s.factions[fid];
  if (!GOODS[good] || n <= 0) return 'Invalid trade';
  const q = quote(s, fid, good, n, side);
  if (side === 'buy') {
    if (f.gold < q.total) return `Need ${q.total} gold`;
    f.gold -= q.total;
    f[good] += n;
  } else {
    if (f[good] < n) return `You only have ${f[good]} ${GOODS[good].name.toLowerCase()}`;
    f[good] -= n;
    f.gold += q.total;
  }
  return { type: 'trade', total: q.total };
}

// ---------- diplomacy ----------
export function strength(s, fid) {
  let v = 0;
  for (const u of unitsOf(s, fid)) {
    const U = UNITS[u.type];
    v += (U.atk + U.def) * (u.hp / maxHp(s, u.type, u.owner, u.vet));
  }
  return v;
}

// opts.called: drawn in by a liege or ally (no renown cost, no further calls).
// opts.quiet: the caller writes its own log line.
export function declareWar(s, a, b, opts = {}) {
  const r = relation(s, a, b);
  if (!s.factions[b].alive) return 'That house is gone';
  if (r.war) return 'Already at war';
  if (r.truce > s.turn) return `A truce holds until turn ${r.truce}`;
  if (!opts.called && s.factions[a].overlord != null) return 'A vassal cannot declare war on its own';
  if (!opts.called && s.factions[b].overlord === a) return 'They are your sworn vassal: release them first';
  breakOath(s, a, b);
  r.war = true;
  r.since = s.turn;
  r.aggressor = a;
  r.trade = false;
  r.alliance = false;
  r.pact = 0;
  withdraw(s, a, b);
  remember(s, b, a, 'Declared war on us', -20, { decay: 0.5, cap: 40 });
  const mine = a === s.playerId || b === s.playerId;
  if (!opts.called) addRenown(s, a, -Math.min(2, s.factions[a].renown), 'events');
  if (!opts.quiet) log(s, `⚔ ${s.factions[a].name} declares war on ${s.factions[b].name}!`, mine ? 'bad' : 'war');
  if (!opts.called) rallyAllies(s, a, b);
  return { type: 'war' };
}

export function makePeace(s, a, b) {
  const r = relation(s, a, b);
  r.war = false;
  r.truce = s.turn + TRUCE_TURNS;
  withdraw(s, a, b);
  log(s, `🕊 ${s.factions[a].short} and ${s.factions[b].short} make peace. Truce until turn ${r.truce}.`, a === s.playerId || b === s.playerId ? 'good' : 'world');
  // Vassals lay down arms with their liege.
  for (const [x, y] of [[a, b], [b, a]]) {
    for (const v of vassalsOf(s, x)) {
      const rv = relation(s, v, y);
      if (v !== y && rv.war) { rv.war = false; rv.truce = s.turn + TRUCE_TURNS; withdraw(s, v, y); }
    }
  }
  return { type: 'peace' };
}

// Armies standing in the other's land (where they are no longer welcome) go home.
export function withdraw(s, a, b) {
  for (const u of s.units) {
    if (u.owner !== a && u.owner !== b) continue;
    const o = territoryOwner(s, u.tile);
    if (o == null || o === u.owner || (o !== a && o !== b)) continue;
    if (hostile(s, u.owner, o) || friendly(s, u.owner, o)) continue;
    const home = nearestFree(s, u);
    if (home != null) u.tile = home;
  }
}

export function nearestFree(s, u) {
  for (let rad = 1; rad <= 6; rad++) {
    for (const t of within(W, H, u.tile, rad)) {
      if (!TERRAIN[s.tiles[t].t].pass || unitAt(s, t)) continue;
      const o = territoryOwner(s, t);
      if (o == null || o === u.owner || o === -1) return t;
    }
  }
  return null;
}

export function peaceTerms(s, from, to) {
  const ratio = strength(s, to) / Math.max(1, strength(s, from));
  const r = relation(s, from, to);
  const long = s.turn - r.since >= 8;
  let need = Math.max(0, Math.round((ratio - (long ? 0.9 : 0.7)) * 25));
  if (ratio > 2.2) need = Infinity;
  return { need, ratio };
}

export function offerPeace(s, from, to, gold = 0) {
  const r = relation(s, from, to);
  if (!r.war) return 'You are not at war';
  const { need } = peaceTerms(s, from, to);
  if (gold < need) return need === Infinity ? `${s.factions[to].short} smells victory and refuses all terms` : `${s.factions[to].short} wants at least ${need} gold`;
  if (s.factions[from].gold < gold) return 'Not enough gold';
  s.factions[from].gold -= gold;
  s.factions[to].gold += gold;
  return makePeace(s, from, to);
}

// ---------- turn flow ----------
export function beginTurn(s, fid) {
  const f = s.factions[fid];
  if (!f.alive) return;
  spawnRuler(s, fid);
  for (const u of unitsOf(s, fid)) { u.moved = false; u.attacked = false; }
  for (const c of citiesOf(s, fid)) c.recruits = 0;
  const inc = income(s, fid);
  f.gold += inc.gold;
  f.grain += inc.grain - inc.upkeep;
  f.materials += inc.materials;
  f.lore += inc.lore;
  if (f.gold < 0) f.gold = 0;
  progressResearch(s, fid);
  if (f.grain < 0) {
    f.grain = 0;
    let lost = 0;
    for (const u of unitsOf(s, fid)) {
      if (u.type === 'ruler') continue;
      u.hp -= 2;
      if (u.hp <= 0) { killUnit(s, u, -1); lost++; }
    }
    log(s, `🍞 ${f.short}'s armies go hungry! Every soldier loses 2 HP${lost ? `; ${lost} unit(s) desert` : ''}.`, fid === s.playerId ? 'bad' : 'info');
  }
  const rn = renownSources(s, fid);
  if (rn.shrines) addRenown(s, fid, rn.shrines, 'shrines');
  if (rn.building) addRenown(s, fid, rn.building, 'building');
  if (rn.vassals) addRenown(s, fid, rn.vassals, 'vassals');
  rollEvent(s, fid);
  if (fid === s.playerId) reveal(s);
  checkVictory(s);
}

function heal(s, fid) {
  for (const u of unitsOf(s, fid)) {
    const max = maxHp(s, u.type, u.owner, u.vet);
    let h = 0;
    if (!u.moved && !u.attacked) {
      const c = cityAt(s, u.tile);
      h = c && c.owner === fid ? 4 : 2;
    }
    if (u.type === 'ruler') h = Math.max(h, 2);
    u.hp = Math.min(max, u.hp + h);
  }
}

function newRound(s) {
  s.turn++;
  diplomacyRound(s);
  for (const f of s.factions) {
    if (!f.alive) continue;
    const r = s.characters[f.rulerId];
    r.age++;
    let p = r.age < 50 ? 0.004 : r.age < 60 ? 0.025 : r.age < 70 ? 0.07 : 0.15;
    if (r.traits.includes('robust')) p *= 0.5;
    if (r.traits.includes('frail')) p *= 2;
    const heir = f.heirId != null ? s.characters[f.heirId] : null;
    if (heir) heir.age++;
    if (rand(s) < p) {
      log(s, `⚱ ${titled(r, 'ruler')} of ${f.name} dies of old age at ${r.age}.`, f.id === s.playerId ? 'bad' : 'world');
      succession(s, f.id, 'age');
    } else if (!heir && r.age >= 18 && r.age <= 55 && rand(s) < 0.12) {
      f.heirId = newCharacter(s, 0);
      log(s, `👶 ${sexOf(s.characters[f.heirId]) === 'f' ? 'A daughter' : 'A son'}, ${s.characters[f.heirId].name}, is born to ${f.short}.`, f.id === s.playerId ? 'good' : 'world');
    }
  }
  if (s.turn > TURN_LIMIT && !s.winner) {
    const best = [...s.factions].filter((f) => f.alive).sort((a, b) => b.renown - a.renown)[0];
    s.winner = { id: best.id, reason: 'time' };
  }
}

export function endTurn(s) {
  const fid = currentFaction(s);
  heal(s, fid);
  for (let guard = 0; guard < 8; guard++) {
    s.current++;
    if (s.current >= s.order.length) {
      s.current = 0;
      newRound(s);
    }
    if (s.factions[currentFaction(s)].alive) break;
  }
  if (!s.winner) beginTurn(s, currentFaction(s));
}

export function checkVictory(s) {
  if (s.winner) return;
  const alive = s.factions.filter((f) => f.alive);
  const top = alive.find((f) => f.renown >= RENOWN_TO_WIN);
  if (top) s.winner = { id: top.id, reason: 'renown' };
  else if (alive.filter((f) => f.overlord == null).length === 1) s.winner = { id: alive.find((f) => f.overlord == null).id, reason: 'conquest' };
  else if (!s.factions[s.playerId].alive) s.winner = { id: [...alive].sort((a, b) => b.renown - a.renown)[0].id, reason: 'eliminated' };
}

// Hexes that enemy armies (at war with fid) could strike on their next turn.
export function threatTiles(s, fid) {
  const out = new Set();
  const seen = seenBy(s, fid);
  for (const e of s.units) {
    if (e.owner < 0 || !hostile(s, fid, e.owner) || (seen && !seen(e))) continue;
    const U = UNITS[e.type];
    const from = new Map([[e.tile, movePoints(s, e)]]);
    if (!U.siege) {
      const q = [e.tile];
      while (q.length) {
        const c = q.shift();
        const rem = from.get(c);
        if (rem <= 0) continue;
        for (const n of neighbors(W, H, c)) {
          const T = TERRAIN[s.tiles[n].t];
          if (!T.pass) continue;
          const occ = unitAt(s, n);
          if (occ && occ.owner !== e.owner) continue;
          const r = T.move > 1 ? 0 : rem - 1;
          if (!from.has(n) || from.get(n) < r) { from.set(n, r); q.push(n); }
        }
      }
    }
    for (const t of from.keys()) for (const x of within(W, H, t, U.range)) if (TERRAIN[s.tiles[x].t].pass) out.add(x);
  }
  return out;
}

export function readyUnits(s, fid) {
  return unitsOf(s, fid).filter((u) => (!u.moved && reachable(s, u).size) || attackTargets(s, u).length);
}

