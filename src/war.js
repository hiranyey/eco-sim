// Armies, war declaration, battles, occupation and peace.
import { STANCES } from './data.js';
import { rand, pick } from './rng.js';
import {
  clamp, sum, charOf, stat, realmMods, provincesOf, controller, getPact, setPact, addRelation, relKey,
  hasTruce, alliesOf, warsOf, log, ensureCapital, PLAYER_GRACE_MONTHS,
} from './core.js';

export function armyStrength(s, r) {
  if (!r.alive) return 0;
  const m = realmMods(s, r);
  const marshal = charOf(s, r.council.marshal);
  const ruler = charOf(s, r.rulerId);
  const fill = r.market.fill;
  const equip = 0.7 + 0.3 * Math.min(fill.iron, fill.tools);
  return r.regiments * (1 + 0.04 * stat(marshal, 'martial') + 0.02 * stat(ruler, 'martial') + m.army) * equip;
}

export function canDeclareWar(s, a, b) {
  if (a === b) return 'Cannot attack yourself';
  if (!s.realms[b].alive) return 'That realm no longer exists';
  if (warsOf(s, a).some((w) => w.attackers.includes(b) || w.defenders.includes(b))) return 'Already at war with them';
  if (hasTruce(s, a, b)) return 'A truce is in effect';
  if (b === s.playerId && s.month < PLAYER_GRACE_MONTHS) return 'Too early';
  return null;
}

export function declareWar(s, attackerId, defenderId) {
  const err = canDeclareWar(s, attackerId, defenderId);
  if (err) return err;
  const att = s.realms[attackerId];
  const def = s.realms[defenderId];
  if (getPact(s, attackerId, defenderId).alliance) {
    setPact(s, attackerId, defenderId, 'alliance', false);
    att.legitimacy = clamp(att.legitimacy - 15, 0, 100);
  }
  setPact(s, attackerId, defenderId, 'trade', false);
  const defenders = [defenderId];
  for (const ally of alliesOf(s, defenderId)) {
    if (ally === attackerId || warsOf(s, ally).length) continue;
    defenders.push(ally);
    addRelation(s, attackerId, ally, -25);
  }
  const war = {
    id: s.nextId++, attackers: [attackerId], defenders,
    battleScore: 0, score: 0, months: 0, lastOffer: 0, start: s.month,
    name: `${att.short}–${def.short} War`,
  };
  s.wars.push(war);
  addRelation(s, attackerId, defenderId, -60);
  if ((s.relations[relKey(attackerId, defenderId)] ?? 0) > -40) att.prestige -= 5;
  const allyText = defenders.length > 1 ? ` ${defenders.slice(1).map((d) => s.realms[d].short).join(', ')} join the defence.` : '';
  log(s, `⚔ ${att.name} declares war on ${def.name}!${allyText}`, 'war');
  return null;
}

function sideStrength(s, side) {
  return sum(side, (id) => armyStrength(s, s.realms[id]) * STANCES[s.realms[id].stance].strength);
}

// Pick an enemy province for the winning side to occupy (or one of its own to liberate).
function occupationTarget(s, winners, losers) {
  const controlled = (p) => winners.includes(controller(p));
  const adjacent = (p) => p.neighbors.some((n) => controlled(s.provinces[n]));
  const liberate = s.provinces.filter((p) => winners.includes(p.owner) && losers.includes(p.occupiedBy) && adjacent(p));
  if (liberate.length) return { p: pick(s, liberate), liberate: true };
  const take = s.provinces.filter((p) => losers.includes(p.owner) && !winners.includes(controller(p)) && adjacent(p));
  if (take.length) {
    take.sort((a, b) => (b.isCapital - a.isCapital) || (b.pop - a.pop));
    return { p: rand(s) < 0.5 ? take[0] : pick(s, take), liberate: false };
  }
  return null;
}

function occupy(s, winners, losers, involved) {
  const t = occupationTarget(s, winners, losers);
  if (!t) return;
  if (t.liberate) {
    t.p.occupiedBy = null;
    log(s, `🏳 ${t.p.name} has been liberated.`, 'good', involved);
  } else {
    const by = winners.find((w) => t.p.neighbors.some((n) => controller(s.provinces[n]) === w)) ?? winners[0];
    t.p.occupiedBy = by;
    log(s, `🚩 ${s.realms[by].short} occupies ${t.p.name}.`, winners.includes(s.playerId) ? 'good' : 'bad', involved);
  }
}

export function computeScore(s, war) {
  let occA = 0;
  let occD = 0;
  for (const p of s.provinces) {
    if (p.occupiedBy == null) continue;
    const w = p.isCapital ? 2 : 1;
    if (war.defenders.includes(p.owner) && war.attackers.includes(p.occupiedBy)) occA += w;
    if (war.attackers.includes(p.owner) && war.defenders.includes(p.occupiedBy)) occD += w;
  }
  war.score = clamp(Math.round(war.battleScore + 10 * (occA - occD)), -100, 100);
  return war.score;
}

export function processWars(s) {
  for (const war of [...s.wars]) {
    war.months++;
    const A = war.attackers;
    const D = war.defenders;
    const involved = [...A, ...D];
    const sa = sideStrength(s, A);
    const sd = sideStrength(s, D);
    if (sa + sd > 0 && rand(s) < 0.55) {
      const pa = sa ** 1.5 / (sa ** 1.5 + sd ** 1.5);
      const attackersWin = rand(s) < pa;
      const winners = attackersWin ? A : D;
      const losers = attackersWin ? D : A;
      for (const id of losers) {
        const r = s.realms[id];
        if (r.regiments > 0) r.regiments = Math.max(0, r.regiments - Math.max(1, Math.round(r.regiments * 0.12 * STANCES[r.stance].losses)));
        r.warExhaustion = clamp(r.warExhaustion + 3, 0, 100);
      }
      for (const id of winners) {
        const r = s.realms[id];
        if (r.regiments > 0) r.regiments = Math.max(0, r.regiments - Math.round(r.regiments * 0.05 * STANCES[r.stance].losses));
      }
      war.battleScore = clamp(war.battleScore + (attackersWin ? 7 : -7), -60, 60);
      const winnerLead = s.realms[winners[0]];
      const playerWon = winners.includes(s.playerId);
      log(s, `⚔ Battle in the ${war.name}: ${winnerLead.short} ${winners.length > 1 ? 'and allies ' : ''}prevail.`,
        playerWon ? 'good' : 'bad', involved);
      if (rand(s) < 0.6 * STANCES[winnerLead.stance].occupy) occupy(s, winners, losers, involved);
    } else {
      // Undefended realms get overrun without battles.
      if (sd < 1 && sa >= 1 && rand(s) < 0.5) occupy(s, A, D, involved);
      else if (sa < 1 && sd >= 1 && rand(s) < 0.5) occupy(s, D, A, involved);
    }
    for (const id of involved) s.realms[id].warExhaustion = clamp(s.realms[id].warExhaustion + 0.5, 0, 100);
    computeScore(s, war);
    resolveAIWar(s, war);
  }
}

function resolveAIWar(s, war) {
  const playerIn = war.attackers.includes(s.playerId) || war.defenders.includes(s.playerId);
  const sc = war.score;
  if (!playerIn) {
    if (sc >= 50 || (war.months >= 24 && sc >= 25)) makePeace(s, war, 'attackers');
    else if (sc <= -50 || (war.months >= 24 && sc <= -25)) makePeace(s, war, 'defenders');
    else if (war.months >= 60) makePeace(s, war, null);
    return;
  }
  // The AI proposes terms to the player now and then.
  if (s.month - war.lastOffer < 6 || s.pendingEvents.some((e) => e.ctx?.warId === war.id)) return;
  const playerSide = war.attackers.includes(s.playerId) ? 1 : -1;
  const ps = sc * playerSide;
  let terms = null;
  if (ps <= -45) terms = 'demand';
  else if (ps >= 60) terms = 'surrender';
  else if (war.months >= 48 && Math.abs(ps) < 25) terms = 'white';
  if (terms) {
    war.lastOffer = s.month;
    s.pendingEvents.push({ id: 'peace_offer', realmId: s.playerId, ctx: { warId: war.id, terms } });
  }
}

// winnerSide: 'attackers' | 'defenders' | null (white peace)
export function makePeace(s, war, winnerSide) {
  const winners = winnerSide === 'attackers' ? war.attackers : winnerSide === 'defenders' ? war.defenders : [];
  const losers = winnerSide === 'attackers' ? war.defenders : winnerSide === 'defenders' ? war.attackers : [];
  const all = [...war.attackers, ...war.defenders];
  const gained = [];
  for (const p of s.provinces) {
    if (p.occupiedBy == null) continue;
    if (winners.includes(p.occupiedBy) && losers.includes(p.owner)) {
      gained.push(p.name);
      transferProvince(s, p, p.occupiedBy);
      s.realms[p.owner].prestige += 5;
    } else if (all.includes(p.occupiedBy) && all.includes(p.owner)) {
      p.occupiedBy = null;
    }
  }
  for (const id of winners) s.realms[id].prestige += 10;
  for (const id of losers) {
    const r = s.realms[id];
    r.legitimacy = clamp(r.legitimacy - 10, 0, 100);
    r.prestige -= 5;
  }
  for (const a of war.attackers) for (const d of war.defenders) s.truces[relKey(a, d)] = s.month + 60;
  s.wars = s.wars.filter((w) => w !== war);
  const how = winnerSide ? `${s.realms[winners[0]].name} is victorious` : 'White peace';
  log(s, `🕊 ${war.name} ends. ${how}.${gained.length ? ` Ceded: ${gained.join(', ')}.` : ''}`,
    winners.includes(s.playerId) ? 'good' : losers.includes(s.playerId) ? 'bad' : 'world', all);
  cleanupRealms(s);
}

// Player-only: leave a war you do not lead, on white-peace terms.
export function separatePeace(s, war, rid) {
  for (const p of s.provinces) {
    const enemies = war.attackers.includes(rid) ? war.defenders : war.attackers;
    if ((p.owner === rid && enemies.includes(p.occupiedBy)) || (enemies.includes(p.owner) && p.occupiedBy === rid)) p.occupiedBy = null;
  }
  war.attackers = war.attackers.filter((x) => x !== rid);
  war.defenders = war.defenders.filter((x) => x !== rid);
  for (const e of [...war.attackers, ...war.defenders]) s.truces[relKey(rid, e)] = s.month + 60;
  log(s, `🕊 ${s.realms[rid].short} signs a separate peace in the ${war.name}.`, 'info', [rid]);
}

export function transferProvince(s, p, newOwner) {
  const old = p.owner;
  p.owner = newOwner;
  p.occupiedBy = null;
  p.isCapital = false;
  p.construction = [];
  p.unrest = clamp(p.unrest + 25, 0, 100);
  ensureCapital(s, old);
}

export function cleanupRealms(s) {
  for (const r of s.realms) {
    if (!r.alive) continue;
    if (provincesOf(s, r.id).length === 0) {
      r.alive = false;
      log(s, `💀 ${r.name} has fallen and is no more.`, 'world');
      for (const p of s.provinces) if (p.occupiedBy === r.id) p.occupiedBy = null;
    }
  }
  for (const w of [...s.wars]) {
    w.attackers = w.attackers.filter((id) => s.realms[id].alive);
    w.defenders = w.defenders.filter((id) => s.realms[id].alive);
    if (!w.attackers.length || !w.defenders.length) {
      for (const p of s.provinces) {
        if (p.occupiedBy != null && [...w.attackers, ...w.defenders].includes(p.occupiedBy)) {
          if (!s.wars.some((o) => o !== w && warsOf(s, p.owner).includes(o))) p.occupiedBy = null;
        }
      }
      s.wars = s.wars.filter((x) => x !== w);
    }
  }
}
