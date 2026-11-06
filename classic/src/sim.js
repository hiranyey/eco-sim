// The monthly tick: ties all systems together.
import { TAX_LEVELS, INNOVATIONS, TRAITS, BUILDINGS } from './data.js';
import { rand, randInt } from './rng.js';
import {
  GAME_MONTHS, clamp, sum, provincesOf, totalPop, charOf, stat, ageOf, newCharacter, realmMods, provinceMods,
  log, fullName, aliveRealms,
} from './core.js';
import { economy } from './economy.js';
import { processWars, armyStrength } from './war.js';
import { rollEvents, dropStaleEvents } from './events.js';
import { aiMonthly, automate, driftRelations, pickResearch } from './ai.js';

export function tick(s) {
  if (s.gameOver) return;
  s.month++;
  economy(s);
  populations(s);
  construction(s);
  for (const r of aliveRealms(s)) {
    manpowerAndResearch(s, r);
    characters(s, r);
    r.legitimacy = clamp(r.legitimacy + 0.08 + realmMods(s, r).legit + (r.treasury < 0 ? -0.5 : 0), 0, 100);
    if (!r.warExhaustion) r.warExhaustion = 0;
    if (!s.wars.some((w) => w.attackers.includes(r.id) || w.defenders.includes(r.id))) {
      r.warExhaustion = Math.max(0, r.warExhaustion - 0.6);
    }
  }
  for (const r of aliveRealms(s)) if (r.treasury < -3000) bankruptcy(s, r);
  processWars(s);
  for (const r of aliveRealms(s)) {
    if (r.id === s.playerId) automate(s, r);
    else aiMonthly(s, r);
  }
  driftRelations(s);
  rollEvents(s);
  dropStaleEvents(s);
  for (const m of s.modifiers) m.months--;
  s.modifiers = s.modifiers.filter((m) => m.months > 0);
  recordHistory(s);
  if (s.month % 12 === 0) yearly(s);
  checkGameOver(s);
}

function populations(s) {
  const mods = {};
  const over = {};
  for (const r of aliveRealms(s)) {
    mods[r.id] = realmMods(s, r);
    over[r.id] = overextension(s, r.id);
  }
  for (const p of s.provinces) {
    const r = s.realms[p.owner];
    if (!r.alive) continue;
    const m = mods[r.id];
    const pm = provinceMods(s, p);
    const f = r.market.fill;
    const sol = 0.55 * f.grain + 0.3 * f.cloth + 0.15 * f.luxuries;
    p.prosperity += (sol * 100 - p.prosperity) * 0.1;
    let growth = (sol - 0.5) * 0.0025 + m.growth + pm.growth + (p.buildings.sanitation ?? 0) * BUILDINGS.sanitation.growth;
    if (f.grain < 0.85) growth -= (0.85 - f.grain) * 0.012;
    if (p.occupiedBy != null) growth -= 0.002;
    p.pop = Math.max(1, p.pop * (1 + growth));
    const chancellor = charOf(s, r.council.chancellor);
    const target = Math.max(0, (0.65 - sol) * 120) + TAX_LEVELS[r.taxLevel].unrest + (50 - r.legitimacy) * 0.3 +
      r.warExhaustion * 0.4 + over[r.id] + m.unrest + pm.unrest + (p.occupiedBy != null ? 20 : 0) + (r.treasury < 0 ? 15 : 0) -
      (p.isCapital ? 5 : 0) - stat(chancellor, 'diplomacy') * 0.5;
    p.unrest += (clamp(target, 0, 100) - p.unrest) * 0.08;
  }
}

// Ruling far more land than your peers breeds unrest.
export function overextension(s, rid) {
  const alive = aliveRealms(s);
  const avg = s.provinces.length / Math.max(1, alive.length);
  const mine = provincesOf(s, rid).length;
  return Math.max(0, mine - Math.max(avg * 1.3, 16)) * 1.5;
}

// Debts are written off at a heavy political price.
export function bankruptcy(s, r) {
  r.treasury = 0;
  r.legitimacy = clamp(r.legitimacy - 25, 0, 100);
  r.regiments = Math.floor(r.regiments * 0.6);
  for (const p of provincesOf(s, r.id)) {
    p.unrest = clamp(p.unrest + 20, 0, 100);
    p.construction = [];
  }
  log(s, `💸 ${r.name} declares bankruptcy! Debts are repudiated, armies go unpaid and desert.`, r.id === s.playerId ? 'bad' : 'world');
}

function construction(s) {
  for (const p of s.provinces) {
    if (p.occupiedBy != null || !p.construction.length) continue;
    p.construction = p.construction.filter((c) => {
      c.left--;
      if (c.left > 0) return true;
      p.buildings[c.type] = (p.buildings[c.type] ?? 0) + 1;
      log(s, `✅ A ${BUILDINGS[c.type].name} is completed in ${p.name}.`, 'good', [p.owner]);
      return false;
    });
  }
}

export function researchRate(s, r) {
  const m = realmMods(s, r);
  const ateliers = sum(provincesOf(s, r.id), (p) => p.buildings.atelier ?? 0);
  return (1 + stat(charOf(s, r.rulerId), 'stewardship') * 0.05 + totalPop(s, r.id) / 400 + ateliers * 0.15) * (1 + m.research);
}

function manpowerAndResearch(s, r) {
  const pop = totalPop(s, r.id);
  r.manpower = Math.min(pop * 0.03, r.manpower + pop * 0.0008);
  r.research += researchRate(s, r);
  if (!r.researchTarget && r.autoResearch) r.researchTarget = pickResearch(s, r);
  const t = r.researchTarget;
  if (t && r.research >= INNOVATIONS[t].cost) {
    r.research -= INNOVATIONS[t].cost;
    r.innovations.push(t);
    r.researchTarget = null;
    r.prestige += 2;
    log(s, `💡 Innovation discovered: ${INNOVATIONS[t].name} — ${INNOVATIONS[t].desc}.`, 'good', [r.id]);
  }
}

function deathChance(s, c) {
  const age = ageOf(s, c);
  let p = age < 16 ? 0.0004 : age < 40 ? 0.0004 : age < 55 ? 0.0012 : age < 65 ? 0.004 : age < 75 ? 0.009 : 0.02;
  for (const t of c.traits) p *= TRAITS[t].health === -1 ? 2 : TRAITS[t].health === 1 ? 0.6 : 1;
  if (c.flags.doomed) p = 0.2;
  return p;
}

function characters(s, r) {
  const ruler = charOf(s, r.rulerId);
  if (ruler && rand(s) < deathChance(s, ruler)) succession(s, r);
  const heir = charOf(s, r.heirId);
  if (heir && rand(s) < deathChance(s, heir)) {
    heir.alive = false;
    r.heirId = null;
    log(s, `⚱ ${heir.name}, heir of ${r.name}, has died.`, 'bad', [r.id]);
  }
  const cur = charOf(s, r.rulerId);
  if (!charOf(s, r.heirId) && cur && ageOf(s, cur) >= 18 && ageOf(s, cur) <= 55 && rand(s) < 0.025) {
    const child = newCharacter(s, { realmId: r.id, ageYears: 0, dynasty: cur.dynasty, parent: cur });
    child.born = s.month;
    r.heirId = child.id;
    log(s, `👶 An heir is born: ${child.name} ${child.dynasty}.`, 'good', [r.id]);
  }
  for (const role of Object.keys(r.council)) {
    const a = charOf(s, r.council[role]);
    if (a && rand(s) < deathChance(s, a)) {
      delete s.characters[a.id];
      r.council[role] = null;
      log(s, `⚱ ${a.name}, your ${role}, has died. The seat is empty.`, 'bad', [r.id]);
    }
  }
}

export function succession(s, r) {
  const old = charOf(s, r.rulerId);
  if (old) old.alive = false;
  const heir = charOf(s, r.heirId);
  if (heir) {
    r.rulerId = heir.id;
    r.heirId = null;
    const minor = ageOf(s, heir) < 16;
    r.legitimacy = clamp(r.legitimacy - (minor ? 20 : 8), 0, 100);
    log(s, `👑 ${old ? fullName(old) : 'The ruler'} has died. ${fullName(heir)} inherits ${r.name}${minor ? ' (a regency rules until they come of age)' : ''}.`, 'world');
  } else {
    const cousin = newCharacter(s, { realmId: r.id, ageYears: randInt(s, 22, 45), dynasty: old?.dynasty });
    r.rulerId = cousin.id;
    r.legitimacy = clamp(r.legitimacy - 30, 0, 100);
    for (const p of provincesOf(s, r.id)) p.unrest = clamp(p.unrest + 15, 0, 100);
    log(s, `👑 ${old ? fullName(old) : 'The ruler'} died without an heir! A distant cousin, ${fullName(cousin)}, claims ${r.name}. Legitimacy plummets.`, 'world');
  }
}

function recordHistory(s) {
  for (const r of aliveRealms(s)) {
    r.history = r.history ?? [];
    r.history.push({ m: s.month, t: Math.round(r.treasury), g: Math.round(r.ledger?.gdp ?? 0) });
    if (r.history.length > 120) r.history.shift();
  }
}

function yearly(s) {
  // Prune dead, unreferenced characters to keep saves small.
  const keep = new Set();
  for (const r of s.realms) {
    keep.add(r.rulerId);
    keep.add(r.heirId);
    for (const id of Object.values(r.council)) keep.add(id);
    for (const c of Object.values(r.candidates ?? {})) for (const id of c.ids) keep.add(id);
  }
  for (const id of Object.keys(s.characters)) if (!keep.has(Number(id))) delete s.characters[id];
}

export function score(s, r) {
  if (!r.alive) return 0;
  const ps = provincesOf(s, r.id);
  return Math.round((r.ledger?.gdp ?? 0) * 0.3 + r.prestige * 3 + ps.length * 25 + r.innovations.length * 20 +
    totalPop(s, r.id) * 0.5 + armyStrength(s, r) * 2);
}

export function rankings(s) {
  return s.realms.map((r) => ({ id: r.id, name: r.name, color: r.color, alive: r.alive, score: score(s, r) }))
    .sort((a, b) => b.score - a.score);
}

function checkGameOver(s) {
  const p = s.realms[s.playerId];
  if (!p.alive) s.gameOver = { reason: 'defeat', text: `${p.name} has fallen. Your dynasty's story ends here.` };
  else if (s.month >= GAME_MONTHS) {
    const rank = rankings(s).findIndex((x) => x.id === s.playerId) + 1;
    s.gameOver = { reason: 'end', text: `The age draws to a close. ${p.name} finishes ranked #${rank} of ${s.realms.length}.` };
  } else if (aliveRealms(s).length === 1) {
    s.gameOver = { reason: 'victory', text: `${p.name} stands alone, master of the continent!` };
  }
}
