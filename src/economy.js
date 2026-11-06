// Production, markets, trade, finances.
import { GOODS, BUILDINGS, TERRAIN, TAX_LEVELS } from './data.js';
import {
  GOOD_KEYS, JOBS_PER_LEVEL, WORKFORCE_SHARE, SUBSISTENCE, TOOL_USE, TOOL_BONUS, NEEDS, REGIMENT_UPKEEP, REGIMENT_IRON,
  clamp, zeroGoods, sum, realmMods, provinceMods, charOf, stat, provincesOf, labor, tradeEfficiency, atWar, buildingLevels, totalPop,
} from './core.js';

export const realmLevels = (s, rid) => sum(provincesOf(s, rid), (p) => buildingLevels(p) + p.construction.length);

// Costs rise with how developed the realm already is, and with each level of the same type in the province.
export function buildingCost(s, r, type, m = realmMods(s, r), p = null, levels = realmLevels(s, r.id)) {
  const have = p ? (p.buildings[type] ?? 0) + p.construction.filter((c) => c.type === type).length : 0;
  return Math.round(BUILDINGS[type].cost * (1 + m.buildCost) * (1 + 0.1 * have) * (1 + levels / 150));
}

export function maxConstruction(s, r) {
  return 2 + Math.floor(stat(charOf(s, r.council.steward), 'stewardship') / 3) + Math.floor(provincesOf(s, r.id).length / 5);
}

export const activeConstruction = (s, rid) => sum(provincesOf(s, rid), (p) => p.construction.length);

function outputMult(r, p, type, m, pm) {
  const B = BUILDINGS[type];
  let mult = (B.terrainKey ? TERRAIN[p.terrain].mods[B.terrainKey] : 1) *
    (1 + (m.bld[type] ?? 0) + (pm.bld[type] ?? 0) + 0.1 * (p.buildings.infrastructure ?? 0));
  if (B.toolUser) mult *= 1 + TOOL_BONUS * r.market.fill.tools;
  return mult;
}

// Expected monthly value added of one fully-staffed level at current local prices.
export function expectedValue(s, r, p, type, m = realmMods(s, r)) {
  const B = BUILDINGS[type];
  if (type === 'infrastructure') return 0.1 * (p.stats?.value ?? 0) / (1 + 0.1 * (p.buildings.infrastructure ?? 0));
  if (type === 'sanitation') {
    const perPop = (r.ledger?.gdp ?? 0) / Math.max(1, totalPop(s, r.id));
    return p.pop * B.growth * 60 * perPop * WORKFORCE_SHARE;
  }
  const pm = provinceMods(s, p);
  const price = r.market.price;
  const mult = outputMult(r, p, type, m, pm);
  let v = 0;
  for (const [g, q] of Object.entries(B.outputs)) v += q * mult * price[g];
  for (const [g, q] of Object.entries(B.inputs)) v -= q * price[g];
  if (B.toolUser) v -= TOOL_USE * price.tools;
  return v;
}

// Best (province, building) investment by value per gold. `good` restricts to producers of that good.
export function bestInvestment(s, r, good = null) {
  const m = realmMods(s, r);
  const levels = realmLevels(s, r.id);
  let best = null;
  for (const p of provincesOf(s, r.id)) {
    if (p.occupiedBy != null) continue;
    const lab = labor(p);
    for (const type of Object.keys(BUILDINGS)) {
      const B = BUILDINGS[type];
      if (B.jobs !== 0 && lab.spare < JOBS_PER_LEVEL * 0.8) continue;
      if (B.max && (p.buildings[type] ?? 0) + p.construction.filter((c) => c.type === type).length >= B.max) continue;
      if (good && !B.outputs[good]) continue;
      if (B.terrainKey && TERRAIN[p.terrain].mods[B.terrainKey] < 0.6) continue;
      const value = expectedValue(s, r, p, type, m);
      if (value <= 0) continue;
      const cost = buildingCost(s, r, type, m, p, levels);
      const score = value / cost;
      if (!best || score > best.score) best = { pid: p.id, type, value, cost, score };
    }
  }
  return best;
}

export function economy(s) {
  const realms = s.realms.filter((r) => r.alive);
  const mods = {};
  const acc = {};
  for (const r of realms) {
    mods[r.id] = realmMods(s, r);
    acc[r.id] = { supply: zeroGoods(), demand: zeroGoods(), gdp: 0 };
  }

  // 1. Production & demand
  for (const p of s.provinces) {
    const r = s.realms[p.owner];
    if (!r.alive) continue;
    const a = acc[r.id];
    const m = mods[r.id];
    const pm = provinceMods(s, p);
    const mk = r.market;
    const workforce = p.pop * WORKFORCE_SHARE;
    // Farms are staffed first so a labour shortage never starves the province.
    let jobs = 0;
    let farmJobs = 0;
    for (const [t, L] of Object.entries(p.buildings)) {
      const j = L * (BUILDINGS[t].jobs ?? 1) * JOBS_PER_LEVEL;
      jobs += j;
      if (t === 'farm') farmJobs += j;
    }
    // When food is short, some workers leave the workshops to grow their own.
    const reserve = workforce * clamp((1 - mk.fill.grain) * 0.6, 0, 0.4);
    const avail = workforce - reserve;
    const farmStaff = farmJobs > 0 ? Math.min(1, avail / farmJobs) : 0;
    const restJobs = jobs - farmJobs;
    const restStaff = restJobs > 0 ? Math.min(1, Math.max(0, avail - farmJobs) / restJobs) : 0;
    const staff = jobs > 0 ? Math.min(1, avail / jobs) : 0;
    const idle = Math.max(0, workforce - Math.min(jobs, avail));
    const occ = p.occupiedBy != null ? 0.5 : 1;
    const out = {};
    const sub = idle * SUBSISTENCE * TERRAIN[p.terrain].mods.farm * occ;
    a.supply.grain += sub;
    out.grain = sub;

    let value = 0;
    for (const [type, L] of Object.entries(p.buildings)) {
      const B = BUILDINGS[type];
      if (!L || B.jobs === 0) continue;
      const eff = L * (type === 'farm' ? farmStaff : restStaff) * occ;
      const mult = outputMult(r, p, type, m, pm);
      let inFill = 1;
      for (const g of Object.keys(B.inputs)) inFill = Math.min(inFill, mk.fill[g]);
      for (const [g, q] of Object.entries(B.inputs)) {
        a.demand[g] += eff * q;
        a.gdp -= eff * q * inFill * mk.price[g];
      }
      if (B.toolUser) {
        a.demand.tools += eff * TOOL_USE;
        a.gdp -= eff * TOOL_USE * mk.fill.tools * mk.price.tools;
      }
      for (const [g, q] of Object.entries(B.outputs)) {
        const amt = eff * q * mult * inFill;
        a.supply[g] += amt;
        a.gdp += amt * mk.price[g];
        value += amt * mk.price[g];
        out[g] = (out[g] ?? 0) + amt;
      }
    }
    for (const [g, q] of Object.entries(NEEDS)) a.demand[g] += p.pop * q;
    p.stats = { workforce, jobs, staff, output: out, value };
  }

  for (const r of realms) acc[r.id].demand.iron += r.regiments * REGIMENT_IRON;

  // 2. Trade through a shared world market
  s.worldPrice = s.worldPrice ?? {};
  const tradeIncome = {};
  for (const r of realms) tradeIncome[r.id] = 0;
  for (const g of GOOD_KEYS) {
    let E = 0;
    let I = 0;
    for (const r of realms) {
      const net = acc[r.id].supply[g] - acc[r.id].demand[g];
      if (net > 0) E += net; else I -= net;
    }
    const wp = GOODS[g].base * clamp(((I + 1) / (E + 1)) ** 0.5, 0.4, 2.5);
    s.worldPrice[g] = wp;
    const imports = {};
    let T = 0;
    for (const r of realms) {
      const net = acc[r.id].supply[g] - acc[r.id].demand[g];
      imports[r.id] = 0;
      if (net < 0 && E > 0) {
        imports[r.id] = -net * Math.min(1, E / I) * tradeEfficiency(s, r, mods[r.id]);
        T += imports[r.id];
      }
    }
    for (const r of realms) {
      const net = acc[r.id].supply[g] - acc[r.id].demand[g];
      const exp = net > 0 && E > 0 ? (net / E) * T : 0;
      r.market.imports[g] = imports[r.id];
      r.market.exports[g] = exp;
      tradeIncome[r.id] += (imports[r.id] + exp) * wp * 0.08;
    }
  }

  // 3. Fill ratios and prices
  for (const r of realms) {
    const a = acc[r.id];
    const mk = r.market;
    for (const g of GOOD_KEYS) {
      const avail = a.supply[g] + mk.imports[g] - mk.exports[g];
      mk.supply[g] = a.supply[g];
      mk.demand[g] = a.demand[g];
      mk.fill[g] = a.demand[g] > 0 ? Math.min(1, avail / a.demand[g]) : 1;
      const target = GOODS[g].base * clamp(((a.demand[g] + 0.5) / (avail + 0.5)) ** 0.7, 0.25, 4);
      mk.price[g] += (target - mk.price[g]) * 0.25;
    }

    // 4. Finances
    const m = mods[r.id];
    const ruler = charOf(s, r.rulerId);
    const steward = charOf(s, r.council.steward);
    const taxEff = 0.75 + 0.03 * stat(steward, 'stewardship') + 0.01 * stat(ruler, 'stewardship') + m.tax;
    const gdp = Math.max(0, a.gdp);
    const income = {
      taxes: gdp * TAX_LEVELS[r.taxLevel].rate * taxEff,
      trade: tradeIncome[r.id],
    };
    const council = sum(Object.values(r.council), (id) => {
      const c = charOf(s, id);
      return c ? 2 + sum(Object.values(c.stats)) * 0.4 : 0;
    });
    const expenses = {
      army: r.regiments * REGIMENT_UPKEEP * (atWar(s, r.id) ? 1.5 : 1),
      council,
      court: 15 + provincesOf(s, r.id).length * 2 + totalPop(s, r.id) * 0.15,
      interest: r.treasury < 0 ? -r.treasury * 0.01 : 0,
    };
    const inc = income.taxes + income.trade;
    const exp = sum(Object.values(expenses));
    r.treasury += inc - exp;
    r.ledger = { gdp, income, expenses, net: inc - exp, taxEff };
  }
}
