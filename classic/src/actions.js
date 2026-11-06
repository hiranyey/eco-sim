// Every change a ruler (player or AI) can make. Each returns null on success or an error string.
import { randInt } from './rng.js';
import { BUILDINGS, INNOVATIONS, ROLES, TAX_LEVELS, STANCES } from './data.js';
import {
  REGIMENT_COST, GIFT_COST, JOBS_PER_LEVEL, clamp, labor, charOf, stat, newCharacter, getRelation, addRelation,
  getPact, setPact, log, warBetween, provincesOf,
} from './core.js';
import { buildingCost, maxConstruction, activeConstruction } from './economy.js';
import { declareWar as warDeclare, makePeace, separatePeace } from './war.js';

export function build(s, rid, pid, type) {
  const r = s.realms[rid];
  const p = s.provinces[pid];
  if (!p || p.owner !== rid) return 'Not your province';
  if (!BUILDINGS[type]) return 'Unknown building';
  if (p.occupiedBy != null) return 'Province is occupied';
  if (activeConstruction(s, rid) >= maxConstruction(s, r)) return 'All builders are busy (a better Steward adds capacity)';
  const B = BUILDINGS[type];
  if (B.jobs !== 0 && labor(p).spare < JOBS_PER_LEVEL * 0.5) return 'Not enough free workers in this province';
  if (B.max && (p.buildings[type] ?? 0) + p.construction.filter((c) => c.type === type).length >= B.max) return `Maximum ${B.max} levels`;
  const cost = buildingCost(s, r, type, undefined, p);
  if (r.treasury < cost) return `Need ${cost} gold`;
  r.treasury -= cost;
  p.construction.push({ type, left: BUILDINGS[type].months, total: BUILDINGS[type].months });
  log(s, `🏗 Construction of a ${BUILDINGS[type].name} begins in ${p.name}.`, 'info', [rid]);
  return null;
}

export function cancelBuild(s, rid, pid, index) {
  const p = s.provinces[pid];
  if (!p || p.owner !== rid || !p.construction[index]) return 'Nothing to cancel';
  const c = p.construction.splice(index, 1)[0];
  s.realms[rid].treasury += Math.round(buildingCost(s, s.realms[rid], c.type, undefined, p) * 0.5);
  return null;
}

export function setTax(s, rid, level) {
  if (!TAX_LEVELS[level]) return 'Unknown tax level';
  s.realms[rid].taxLevel = level;
  return null;
}

export function setStance(s, rid, stance) {
  if (!STANCES[stance]) return 'Unknown stance';
  s.realms[rid].stance = stance;
  return null;
}

export function recruit(s, rid, n = 1) {
  const r = s.realms[rid];
  n = Math.min(n, Math.floor(r.manpower));
  if (n <= 0) return 'No manpower available — it regrows each month';
  if (r.treasury < n * REGIMENT_COST) n = Math.floor(r.treasury / REGIMENT_COST);
  if (n <= 0) return `Need ${REGIMENT_COST} gold per regiment`;
  r.treasury -= n * REGIMENT_COST;
  r.manpower -= n;
  r.regiments += n;
  return null;
}

export function disband(s, rid, n = 1) {
  const r = s.realms[rid];
  n = Math.min(n, r.regiments);
  if (n <= 0) return 'No regiments to disband';
  r.regiments -= n;
  r.manpower += n * 0.5;
  return null;
}

export function setResearch(s, rid, id) {
  const r = s.realms[rid];
  const I = INNOVATIONS[id];
  if (!I) return 'Unknown innovation';
  if (r.innovations.includes(id)) return 'Already known';
  if (!I.req.every((q) => r.innovations.includes(q))) return 'Requirements not met';
  r.researchTarget = id;
  return null;
}

export function toggleAuto(s, rid, key) {
  const r = s.realms[rid];
  if (!['autoBuild', 'autoResearch', 'autoArmy'].includes(key)) return 'Unknown setting';
  r[key] = !r[key];
  return null;
}

// ---------- council ----------
export function candidates(s, rid, role) {
  const r = s.realms[rid];
  r.candidates = r.candidates ?? {};
  const cur = r.candidates[role];
  if (cur && s.month - cur.at < 12 && cur.ids.every((id) => s.characters[id])) return cur.ids.map((id) => s.characters[id]);
  if (cur) for (const id of cur.ids) delete s.characters[id];
  const ids = [0, 1, 2].map(() => newCharacter(s, { realmId: rid, ageYears: randInt(s, 24, 55), skillBias: ROLES[role].skill }).id);
  r.candidates[role] = { at: s.month, ids };
  return ids.map((id) => s.characters[id]);
}

export const hireCost = (c, role) => 30 + stat(c, ROLES[role].skill) * 30;

export function hire(s, rid, role, cid) {
  const r = s.realms[rid];
  const list = r.candidates?.[role];
  if (!list || !list.ids.includes(cid)) return 'Candidate not available';
  const c = s.characters[cid];
  const cost = hireCost(c, role);
  if (r.treasury < cost) return `Need ${cost} gold`;
  r.treasury -= cost;
  const old = charOf(s, r.council[role]);
  if (old) delete s.characters[old.id];
  c.role = role;
  r.council[role] = cid;
  for (const id of list.ids) if (id !== cid) delete s.characters[id];
  delete r.candidates[role];
  log(s, `👤 ${c.name} ${c.dynasty} is appointed ${ROLES[role].name}.`, 'info', [rid]);
  return null;
}

export function dismiss(s, rid, role) {
  const r = s.realms[rid];
  const c = charOf(s, r.council[role]);
  if (!c) return 'Seat is empty';
  delete s.characters[c.id];
  r.council[role] = null;
  return null;
}

// ---------- diplomacy ----------
export function gift(s, rid, target) {
  const r = s.realms[rid];
  if (r.treasury < GIFT_COST) return `Need ${GIFT_COST} gold`;
  if (warBetween(s, rid, target)) return 'You are at war';
  r.treasury -= GIFT_COST;
  const chancellor = charOf(s, r.council.chancellor);
  addRelation(s, rid, target, 10 + stat(chancellor, 'diplomacy'));
  return null;
}

export function proposeTrade(s, rid, target) {
  if (getPact(s, rid, target).trade) return 'Already trading';
  if (warBetween(s, rid, target)) return 'You are at war';
  if (getRelation(s, rid, target) < 0) return `${s.realms[target].short} refuses (relations must be 0 or better)`;
  setPact(s, rid, target, 'trade', true);
  addRelation(s, rid, target, 5);
  log(s, `🤝 Trade pact signed between ${s.realms[rid].short} and ${s.realms[target].short}.`, 'good', [rid, target]);
  return null;
}

export function cancelTrade(s, rid, target) {
  setPact(s, rid, target, 'trade', false);
  addRelation(s, rid, target, -10);
  return null;
}

export function proposeAlliance(s, rid, target) {
  if (getPact(s, rid, target).alliance) return 'Already allied';
  if (warBetween(s, rid, target)) return 'You are at war';
  if (getRelation(s, rid, target) < 40) return `${s.realms[target].short} refuses (relations must be 40 or better)`;
  setPact(s, rid, target, 'alliance', true);
  log(s, `🛡 ${s.realms[rid].short} and ${s.realms[target].short} form a defensive alliance.`, 'good', [rid, target]);
  return null;
}

export function breakAlliance(s, rid, target) {
  setPact(s, rid, target, 'alliance', false);
  addRelation(s, rid, target, -30);
  s.realms[rid].legitimacy = clamp(s.realms[rid].legitimacy - 5, 0, 100);
  return null;
}

export const declareWar = (s, rid, target) => warDeclare(s, rid, target);

// terms: 'white' | 'demand' (take what you occupy) | 'concede' (give them what they occupy)
export function peaceAcceptance(s, rid, war, terms) {
  const side = war.attackers.includes(rid) ? 1 : -1;
  const ps = war.score * side;
  const mine = side === 1 ? war.attackers : war.defenders;
  const theirs = side === 1 ? war.defenders : war.attackers;
  const enemyExhaustion = Math.max(...theirs.map((id) => s.realms[id].warExhaustion));
  const occupied = s.provinces.filter((p) => theirs.includes(p.owner) && mine.includes(p.occupiedBy)).length;
  if (terms === 'concede') return { ok: true, why: 'They will gladly accept' };
  if (terms === 'white') {
    const ok = ps >= -10 || enemyExhaustion > 50 || (war.months > 36 && ps > -30);
    return { ok, why: ok ? 'They are willing' : 'They believe they are winning' };
  }
  if (occupied === 0) return { ok: false, why: 'You occupy none of their land' };
  const need = Math.max(20, occupied * 10) - (enemyExhaustion > 40 ? 10 : 0);
  return { ok: ps >= need, why: ps >= need ? `They will cede ${occupied} province(s)` : `War score must reach ${need}` };
}

export function offerPeace(s, rid, warId, terms) {
  const war = s.wars.find((w) => w.id === warId);
  if (!war) return 'War not found';
  const leader = war.attackers[0] === rid || war.defenders[0] === rid;
  const { ok, why } = peaceAcceptance(s, rid, war, terms);
  if (!ok) return why;
  if (!leader) {
    if (terms !== 'white') return 'Only the war leader can negotiate terms — you may sign a white peace';
    separatePeace(s, war, rid);
    return null;
  }
  const side = war.attackers.includes(rid) ? 'attackers' : 'defenders';
  const other = side === 'attackers' ? 'defenders' : 'attackers';
  makePeace(s, war, terms === 'white' ? null : terms === 'demand' ? side : other);
  return null;
}

export const ownedProvinceIds = (s, rid) => provincesOf(s, rid).map((p) => p.id);
