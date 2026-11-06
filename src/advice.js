// The Advisor: turns the simulation into a short, prioritised to-do list with one-click fixes.
import { GOODS, BUILDINGS, ROLES } from './data.js';
import {
  provincesOf, charOf, warsOf, neighborRealms, sum, labor, JOBS_PER_LEVEL, playerRealm, PLAYER_GRACE_MONTHS,
} from './core.js';
import { bestInvestment, maxConstruction, activeConstruction } from './economy.js';
import { armyStrength } from './war.js';
import { armyTarget } from './ai.js';

const pct = (x) => `${Math.round(x * 100)}%`;

// level: 'urgent' | 'warn' | 'tip' | 'good'
export function advice(s) {
  const r = playerRealm(s);
  const out = [];
  const L = r.ledger ?? { net: 0 };
  const mk = r.market;
  const ps = provincesOf(s, r.id);
  const buildOffer = (b, why) => ({
    act: 'build', args: [b.pid, b.type], label: `Build ${BUILDINGS[b.type].name} in ${s.provinces[b.pid].name} (${b.cost}g)`, why,
  });
  const canBuild = activeConstruction(s, r.id) < maxConstruction(s, r);

  if (r.treasury < 0) {
    out.push({ level: 'urgent', title: 'The treasury is empty', text: `You are ${Math.round(-r.treasury)} gold in debt and paying interest. Below −3000 the realm goes bankrupt.`,
      action: r.taxLevel !== 'high' ? { act: 'setTax', args: ['high'], label: 'Raise taxes to High' } : { act: 'disband', args: [3], label: 'Disband 3 regiments' } });
  } else if (L.net < 0) {
    out.push({ level: 'warn', title: 'Spending more than you earn', text: `Net income is ${Math.round(L.net)} gold/month.`,
      action: r.taxLevel === 'low' ? { act: 'setTax', args: ['normal'], label: 'Set taxes to Normal' } : { act: 'tab', args: ['economy'], label: 'Open the ledger' } });
  }

  if (s.pendingEvents.length) {
    out.push({ level: 'urgent', title: 'A decision awaits', text: 'Your court needs an answer before time can move on.', action: { act: 'openEvent', args: [], label: 'Decide now' } });
  }

  for (const w of warsOf(s, r.id)) {
    const side = w.attackers.includes(r.id) ? 1 : -1;
    const sc = w.score * side;
    const enemy = s.realms[(side === 1 ? w.defenders : w.attackers)[0]];
    out.push({ level: sc < -20 ? 'urgent' : 'warn', title: `At war with ${enemy.short}`, text: `War score ${sc > 0 ? '+' : ''}${sc}. ${sc >= 20 ? 'You could demand the land you occupy.' : sc < -20 ? 'You are losing — consider peace or more troops.' : 'The war hangs in the balance.'}`,
      action: { act: 'tab', args: ['military'], label: 'Open the war room' } });
  }

  if (mk.fill.grain < 0.9) {
    const b = bestInvestment(s, r, 'grain');
    out.push({ level: 'urgent', title: 'Food shortage', text: `Only ${pct(mk.fill.grain)} of the grain your people need is available. Starvation shrinks the population.`,
      action: b && canBuild ? buildOffer(b) : { act: 'tab', args: ['diplomacy'], label: 'Sign trade pacts to import food' } });
  }

  const unhappy = ps.filter((p) => p.unrest > 55).sort((a, b) => b.unrest - a.unrest);
  if (unhappy.length) {
    const p = unhappy[0];
    out.push({ level: p.unrest > 75 ? 'urgent' : 'warn', title: `Unrest in ${p.name}`, text: `${Math.round(p.unrest)}% unrest${unhappy.length > 1 ? ` (and ${unhappy.length - 1} more province${unhappy.length > 2 ? 's' : ''})` : ''}. Above 75% revolts break out. Lower taxes, end wars, or raise prosperity.`,
      action: r.taxLevel !== 'low' ? { act: 'setTax', args: ['low'], label: 'Lower taxes' } : { act: 'select', args: [p.id], label: 'Inspect province' } });
  }

  for (const role of Object.keys(ROLES)) {
    if (!charOf(s, r.council[role])) {
      out.push({ level: 'warn', title: `No ${ROLES[role].name} appointed`, text: `${ROLES[role].desc}. An empty seat gives no bonus.`, action: { act: 'tab', args: ['realm'], label: 'Appoint someone' } });
    }
  }

  // Market opportunities
  const hot = Object.keys(GOODS).filter((g) => g !== 'grain' && mk.price[g] > GOODS[g].base * 1.5 && mk.demand[g] > 1)
    .sort((a, b) => mk.price[b] / GOODS[b].base - mk.price[a] / GOODS[a].base);
  if (hot.length && canBuild) {
    const g = hot[0];
    const b = bestInvestment(s, r, g);
    if (b) {
      const afford = r.treasury >= b.cost;
      out.push({ level: 'tip', title: `${GOODS[g].name} is scarce`, text: `It sells for ${pct(mk.price[g] / GOODS[g].base)} of its normal price. A new ${BUILDINGS[b.type].name} would add about ${Math.round(b.value)} gold/month of output.${afford ? '' : ` Save up ${Math.round(b.cost - r.treasury)} more gold.`}`,
        action: afford ? buildOffer(b) : null });
    }
  }

  if (canBuild && !r.autoBuild) {
    const b = bestInvestment(s, r);
    if (b && r.treasury >= b.cost && !out.some((o) => o.action?.act === 'build' && o.action.args[0] === b.pid && o.action.args[1] === b.type)) {
      out.push({ level: 'tip', title: 'Builders are idle', text: `Best investment right now: ${BUILDINGS[b.type].name} in ${s.provinces[b.pid].name}, about +${Math.round(b.value)} gold/month of output.`,
        action: buildOffer(b) });
    }
  }

  const noWorkers = ps.length > 0 && ps.every((p) => labor(p).spare < JOBS_PER_LEVEL);
  if (noWorkers) {
    out.push({ level: 'tip', title: 'Every worker is employed', text: 'New workshops need people. Build Sanitation or Infrastructure (they need no workers), raise prosperity, or conquer new land.', action: { act: 'tab', args: ['economy'], label: 'Open the economy' } });
  }

  if (!r.researchTarget && !r.autoResearch) {
    out.push({ level: 'warn', title: 'No innovation chosen', text: 'Your scholars are idle. Research is banked, but nothing gets discovered.', action: { act: 'tab', args: ['research'], label: 'Pick an innovation' } });
  }

  if (!warsOf(s, r.id).length) {
    const mine = armyStrength(s, r);
    const threats = neighborRealms(s, r.id).map((n) => s.realms[n]).filter((n) => armyStrength(s, n) > mine * 1.3);
    if (threats.length) {
      const t = threats.sort((a, b) => armyStrength(s, b) - armyStrength(s, a))[0];
      const turn = s.month < PLAYER_GRACE_MONTHS ? ' Neighbours will not attack in the first three years.' : '';
      out.push({ level: 'warn', title: `${t.short} outguns you`, text: `Their army is ${Math.round(armyStrength(s, t))} strong versus your ${Math.round(mine)}. Weak realms invite invasion.${turn}`,
        action: r.manpower >= 1 ? { act: 'recruit', args: [Math.min(5, Math.floor(r.manpower))], label: `Recruit ${Math.min(5, Math.floor(r.manpower))} regiments` } : { act: 'tab', args: ['diplomacy'], label: 'Find allies' } });
    } else if (r.regiments < armyTarget(s, r) * 0.5 && !r.autoArmy) {
      out.push({ level: 'tip', title: 'A thin army', text: 'Your army is small for a realm of your size.', action: { act: 'tab', args: ['military'], label: 'Open the war room' } });
    }
  }

  if (!charOf(s, r.heirId)) {
    out.push({ level: 'tip', title: 'No heir', text: 'If your ruler dies without an heir, a distant cousin takes over and legitimacy collapses. Heirs are born over time.', action: null });
  }

  if (!out.length) out.push({ level: 'good', title: 'All is well', text: 'The realm is stable. Let time flow, or look for opportunities in the Economy and Diplomacy tabs.', action: null });
  const order = { urgent: 0, warn: 1, tip: 2, good: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export const realmSize = (s, rid) => sum(provincesOf(s, rid), () => 1);
