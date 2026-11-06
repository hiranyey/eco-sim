// Computer rulers — and the player's optional automation (auto-build, auto-research, auto-army).
import { INNOVATIONS, ROLES } from './data.js';
import { rand, chance } from './rng.js';
import {
  REGIMENT_COST, totalPop, provincesOf, charOf, atWar, warsOf, neighborRealms, getRelation, getPact, alliesOf,
  hasTruce, aliveRealms, sum, stat, PLAYER_GRACE_MONTHS,
} from './core.js';
import { bestInvestment, maxConstruction, activeConstruction } from './economy.js';
import { armyStrength, canDeclareWar } from './war.js';
import * as act from './actions.js';

export function autoBuild(s, r, reserve) {
  for (let i = 0; i < 2; i++) {
    if (activeConstruction(s, r.id) >= maxConstruction(s, r)) return;
    const best = bestInvestment(s, r);
    if (!best || r.treasury < best.cost + reserve) return;
    if (act.build(s, r.id, best.pid, best.type)) return;
  }
}

export function pickResearch(s, r) {
  const avail = Object.entries(INNOVATIONS)
    .filter(([id, I]) => !r.innovations.includes(id) && I.req.every((q) => r.innovations.includes(q)))
    .sort((a, b) => a[1].cost - b[1].cost);
  return avail.length ? avail[0][0] : null;
}

export function armyTarget(s, r) {
  const base = Math.round(totalPop(s, r.id) / 28) + 3;
  const rich = Math.min(base, Math.floor(Math.max(0, r.treasury - 3000) / 3000));
  return (atWar(s, r.id) ? Math.round(base * 1.5) : base) + rich;
}

export function autoArmy(s, r) {
  const target = armyTarget(s, r);
  if (r.regiments < target && r.manpower >= 1 && r.treasury > REGIMENT_COST * 2 && (r.ledger?.net ?? 0) > -50) {
    act.recruit(s, r.id, Math.min(2, target - r.regiments));
  } else if (r.treasury < -200 && r.regiments > 3 && !atWar(s, r.id)) {
    act.disband(s, r.id, 1);
  }
}

export function automate(s, r) {
  if (r.autoResearch && !r.researchTarget) {
    const id = pickResearch(s, r);
    if (id) r.researchTarget = id;
  }
  if (r.autoBuild) autoBuild(s, r, r.id === s.playerId ? 300 : 150);
  if (r.autoArmy) autoArmy(s, r);
}

export function aiMonthly(s, r) {
  automate(s, r);
  // Taxes
  const ps = provincesOf(s, r.id);
  const avgUnrest = ps.length ? sum(ps, (p) => p.unrest) / ps.length : 0;
  if (r.treasury < 0 || (r.ledger?.net ?? 0) < -30) r.taxLevel = avgUnrest > 55 ? 'normal' : 'high';
  else if (avgUnrest > 45) r.taxLevel = 'low';
  else if (r.treasury > 3000) r.taxLevel = 'low';
  else r.taxLevel = 'normal';
  r.stance = atWar(s, r.id) && armyStrength(s, r) < 5 ? 'defensive' : 'balanced';

  // Council
  for (const role of Object.keys(ROLES)) {
    if (!charOf(s, r.council[role]) && r.treasury > 300) {
      const cands = act.candidates(s, r.id, role);
      const best = cands.sort((a, b) => stat(b, ROLES[role].skill) - stat(a, ROLES[role].skill))[0];
      act.hire(s, r.id, role, best.id);
    }
  }

  // Diplomacy & war, spread across the year
  if (s.month % 12 !== r.id % 12) return;
  for (const o of aliveRealms(s)) {
    if (o.id === r.id || o.id === s.playerId) continue;
    const rel = getRelation(s, r.id, o.id);
    if (rel >= 10 && !getPact(s, r.id, o.id).trade) act.proposeTrade(s, r.id, o.id);
    if (rel >= 50 && !getPact(s, r.id, o.id).alliance && neighborRealms(s, r.id).some((n) => n !== o.id && getRelation(s, o.id, n) < -10)) {
      act.proposeAlliance(s, r.id, o.id);
    }
  }
  considerWar(s, r);
}

function considerWar(s, r) {
  if (warsOf(s, r.id).length || r.treasury < 0 || r.legitimacy < 30 || s.month < 24) return;
  const avg = s.provinces.length / Math.max(1, aliveRealms(s).length);
  if (provincesOf(s, r.id).length > avg * 1.8) return;
  const mine = armyStrength(s, r);
  let best = null;
  for (const n of neighborRealms(s, r.id)) {
    if (canDeclareWar(s, r.id, n) || hasTruce(s, r.id, n) || getPact(s, r.id, n).alliance) continue;
    if (n === s.playerId && s.month < PLAYER_GRACE_MONTHS) continue;
    const rel = getRelation(s, r.id, n);
    if (rel > 0) continue;
    const theirs = armyStrength(s, s.realms[n]) + sum(alliesOf(s, n), (a) => armyStrength(s, s.realms[a]));
    const ratio = mine / Math.max(1, theirs);
    if (ratio > 1.3 && (!best || ratio > best.ratio)) best = { n, ratio, rel };
  }
  if (best && chance(s, 0.35 + Math.min(0.3, -best.rel / 200))) act.declareWar(s, r.id, best.n);
}

// Relations slowly drift toward a baseline each month.
export function driftRelations(s) {
  const realms = aliveRealms(s);
  const size = {};
  const nbrs = {};
  for (const r of realms) {
    size[r.id] = provincesOf(s, r.id).length;
    nbrs[r.id] = neighborRealms(s, r.id);
  }
  const avg = s.provinces.length / Math.max(1, realms.length);
  const threats = realms.filter((r) => size[r.id] > avg * 1.4).map((r) => r.id);
  for (let i = 0; i < realms.length; i++) {
    for (let j = i + 1; j < realms.length; j++) {
      const a = realms[i];
      const b = realms[j];
      const pact = getPact(s, a.id, b.id);
      let target = 0;
      if (pact.alliance) target += 40;
      if (pact.trade) target += 15;
      if (nbrs[a.id].includes(b.id)) target -= 15;
      // Everyone distrusts a sprawling realm…
      target -= Math.max(0, size[a.id] - avg * 1.4) * 2 + Math.max(0, size[b.id] - avg * 1.4) * 2;
      // …and its neighbours draw together against it.
      if (threats.some((t) => t !== a.id && t !== b.id && nbrs[a.id].includes(t) && nbrs[b.id].includes(t))) target += 35;
      if (warsOf(s, a.id).some((w) => w.attackers.includes(b.id) || w.defenders.includes(b.id))) target = -80;
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      const cur = s.relations[key] ?? 0;
      const diploA = stat(charOf(s, a.council.chancellor), 'diplomacy');
      const diploB = stat(charOf(s, b.council.chancellor), 'diplomacy');
      target += (diploA + diploB) * 0.4;
      s.relations[key] = cur + (target - cur) * 0.02 + (rand(s) - 0.5) * 0.6;
    }
  }
}
