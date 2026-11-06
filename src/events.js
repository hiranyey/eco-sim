// Narrative events with choices. The player gets a pop-up; AI rulers pick automatically.
import { ROLES, SKILLS, TRAITS } from './data.js';
import { pick, weightedPick, chance } from './rng.js';
import {
  clamp, provincesOf, charOf, ageOf, addModifier, addRelation, neighborRealms, getRelation, log, fullName,
} from './core.js';
import { makePeace } from './war.js';

const P = (s, c) => s.provinces[c.pid];
const allProv = (s, r, f) => provincesOf(s, r.id).forEach(f);
const gold = (r, x) => { r.treasury += x; };
const legit = (r, x) => { r.legitimacy = clamp(r.legitimacy + x, 0, 100); };
const unrest = (p, x) => { p.unrest = clamp(p.unrest + x, 0, 100); };

export const EVENTS = {
  harvest: {
    title: 'A Bountiful Harvest', weight: 10,
    find: (s, r) => {
      const ps = provincesOf(s, r.id).filter((p) => p.buildings.farm > 0);
      return ps.length ? { pid: pick(s, ps).id } : null;
    },
    text: (s, r, c) => `The fields of ${P(s, c).name} groan under the weight of grain. Your stewards ask how the windfall should be used.`,
    options: [
      { label: 'Invest in better fields', hint: `Farms in this province +30% for 2 years`, fx: (s, r, c) => addModifier(s, 'province', c.pid, 'bld.farm', 0.3, 24, 'Bountiful Harvest') },
      { label: 'Sell the surplus', hint: '+300 gold', fx: (s, r) => gold(r, 300) },
    ],
  },
  plague: {
    title: 'Sickness Spreads', weight: 5,
    find: (s, r) => {
      const ps = provincesOf(s, r.id).filter((p) => p.pop > 15);
      return ps.length ? { pid: pick(s, ps).id } : null;
    },
    text: (s, r, c) => `A wasting fever has broken out in ${P(s, c).name}. Physicians beg for the roads to be closed.`,
    options: [
      { label: 'Quarantine the province', hint: '−150 gold, −2% population, +10 unrest there', fx: (s, r, c) => { gold(r, -150); P(s, c).pop *= 0.98; unrest(P(s, c), 10); } },
      { label: 'Let it run its course', hint: '−8% population there', fx: (s, r, c) => { P(s, c).pop *= 0.92; } },
    ],
  },
  guild: {
    title: 'The Merchant Guild', weight: 6,
    find: () => ({}),
    text: () => 'The merchant guild petitions for a royal charter: freedom from tolls in exchange for loyalty and coin.',
    options: [
      { label: 'Grant the charter', hint: '+15% trade efficiency for 5 years, −5 legitimacy', fx: (s, r) => { addModifier(s, 'realm', r.id, 'trade', 0.15, 60, 'Guild Charter'); legit(r, -5); } },
      { label: 'Tax them instead', hint: '+250 gold, +5 unrest everywhere', fx: (s, r) => { gold(r, 250); allProv(s, r, (p) => unrest(p, 5)); } },
    ],
  },
  inventor: {
    title: 'A Curious Inventor', weight: 6,
    find: () => ({}),
    text: () => 'A tinkerer arrives at court with drawings of marvellous machines, asking for a patron.',
    options: [
      { label: 'Fund the workshop', hint: '−200 gold, +30 research', fx: (s, r) => { gold(r, -200); r.research += 30; } },
      { label: 'Send them away', hint: 'Nothing happens', fx: () => {} },
    ],
  },
  ambition: {
    title: 'An Ambitious Advisor', weight: 5,
    find: (s, r) => {
      const roles = Object.keys(ROLES).filter((k) => charOf(s, r.council[k]));
      return roles.length ? { role: pick(s, roles) } : null;
    },
    text: (s, r, c) => `${fullName(charOf(s, r.council[c.role]))}, your ${ROLES[c.role].name}, demands a greater say in the affairs of the realm.`,
    options: [
      { label: 'Grant more authority', hint: '+2 to their skill, −5 legitimacy', fx: (s, r, c) => { const a = charOf(s, r.council[c.role]); if (a) a.stats[ROLES[c.role].skill] += 2; legit(r, -5); } },
      { label: 'Remind them of their place', hint: '+5 legitimacy; 50% chance they resign', fx: (s, r, c) => { legit(r, 5); if (chance(s, 0.5)) { const a = charOf(s, r.council[c.role]); if (a) { delete s.characters[a.id]; r.council[c.role] = null; log(s, `${a.name} resigns in a huff.`, 'bad', [r.id]); } } } },
    ],
  },
  grievance: {
    title: 'Peasant Grievances', weight: 12,
    find: (s, r) => {
      const ps = provincesOf(s, r.id).filter((p) => p.unrest > 35);
      return ps.length ? { pid: pick(s, ps).id } : null;
    },
    text: (s, r, c) => `The people of ${P(s, c).name} gather in the square with a list of complaints against your officials.`,
    options: [
      { label: 'Grant local relief', hint: '−150 gold, −25 unrest there', fx: (s, r, c) => { gold(r, -150); unrest(P(s, c), -25); } },
      { label: 'Disperse them with soldiers', hint: '−1 regiment, −15 unrest there, −5 legitimacy', fx: (s, r, c) => { r.regiments = Math.max(0, r.regiments - 1); unrest(P(s, c), -15); legit(r, -5); } },
      { label: 'Ignore them', hint: '+10 unrest there', fx: (s, r, c) => unrest(P(s, c), 10) },
    ],
  },
  education: {
    title: "The Heir's Education", weight: 14,
    find: (s, r) => {
      const h = charOf(s, r.heirId);
      return h && !h.flags.educated && ageOf(s, h) >= 8 && ageOf(s, h) <= 15 ? { cid: h.id } : null;
    },
    text: (s, r, c) => `${charOf(s, c.cid).name}, your heir, is of an age to be tutored. Which path shall they follow?`,
    options: [
      ...Object.entries(SKILLS).map(([k, name]) => ({
        label: `Tutor in ${name}`, hint: `−150 gold, heir +3 ${name}`,
        fx: (s, r, c) => { const h = charOf(s, c.cid); if (h) { h.stats[k] += 3; h.flags.educated = true; } gold(r, -150); },
      })),
      { label: 'Let them roam free', hint: 'Free; they gain a random trait', fx: (s, r, c) => { const h = charOf(s, c.cid); if (h) { h.flags.educated = true; const t = pick(s, Object.keys(TRAITS)); if (!h.traits.includes(t)) h.traits.push(t); } } },
    ],
  },
  border: {
    title: 'Border Incident', weight: 7,
    find: (s, r) => {
      const ns = neighborRealms(s, r.id).filter((n) => getRelation(s, r.id, n) < 15);
      return ns.length ? { rid: pick(s, ns) } : null;
    },
    text: (s, r, c) => `Soldiers of ${s.realms[c.rid].name} have crossed the border and burned a mill. Your court is outraged.`,
    options: [
      { label: 'Demand reparations', hint: '+150 gold, −25 relations with them', fx: (s, r, c) => { gold(r, 150); addRelation(s, r.id, c.rid, -25); } },
      { label: 'Let it pass', hint: '+10 relations, −3 prestige', fx: (s, r, c) => { addRelation(s, r.id, c.rid, 10); r.prestige -= 3; } },
    ],
  },
  vein: {
    title: 'A Rich Vein', weight: 5,
    find: (s, r) => {
      const ps = provincesOf(s, r.id).filter((p) => p.terrain === 'hills' || p.terrain === 'mountains');
      return ps.length ? { pid: pick(s, ps).id } : null;
    },
    text: (s, r, c) => `Prospectors in ${P(s, c).name} have struck a rich seam of ore.`,
    options: [
      { label: 'Open a crown mine', hint: '+1 Mine level, free', fx: (s, r, c) => { P(s, c).buildings.mine = (P(s, c).buildings.mine ?? 0) + 1; } },
      { label: 'Sell the rights', hint: '+400 gold', fx: (s, r) => gold(r, 400) },
    ],
  },
  famine: {
    title: 'Famine Looms', weight: 25,
    find: (s, r) => (r.market.fill.grain < 0.8 ? {} : null),
    text: () => 'Granaries are running dry and bread prices soar. The hungry are restless.',
    options: [
      { label: 'Buy grain abroad', hint: '−300 gold, −15 unrest everywhere', fx: (s, r) => { gold(r, -300); allProv(s, r, (p) => unrest(p, -15)); } },
      { label: 'Impose rationing', hint: '+10 unrest everywhere', fx: (s, r) => allProv(s, r, (p) => unrest(p, 10)) },
    ],
  },
  festival: {
    title: 'A Royal Anniversary', weight: 5,
    find: (s, r) => (r.treasury > 600 ? {} : null),
    text: (s, r) => `It has been years since ${charOf(s, r.rulerId)?.name ?? 'the ruler'} took the throne. The court suggests a celebration.`,
    options: [
      { label: 'A grand festival', hint: '−400 gold, +10 prestige, +5 legitimacy, −10 unrest everywhere', fx: (s, r) => { gold(r, -400); r.prestige += 10; legit(r, 5); allProv(s, r, (p) => unrest(p, -10)); } },
      { label: 'A modest feast', hint: '−100 gold, +3 legitimacy', fx: (s, r) => { gold(r, -100); legit(r, 3); } },
    ],
  },
  migrants: {
    title: 'Migrants at the Border', weight: 4,
    find: (s, r) => {
      const ps = provincesOf(s, r.id);
      return ps.length && ps.reduce((a, p) => a + p.prosperity, 0) / ps.length > 55 ? { pid: pick(s, ps).id } : null;
    },
    text: (s, r, c) => `Families fleeing hardship abroad seek to settle in ${P(s, c).name}.`,
    options: [
      { label: 'Welcome them', hint: '+6% population there, +5 unrest there', fx: (s, r, c) => { P(s, c).pop *= 1.06; unrest(P(s, c), 5); } },
      { label: 'Turn them away', hint: 'Nothing happens', fx: () => {} },
    ],
  },
  illness: {
    title: 'The Ruler Falls Ill', weight: 4,
    find: (s, r) => (ageOf(s, charOf(s, r.rulerId)) > 40 ? {} : null),
    text: (s, r) => `${charOf(s, r.rulerId).name} has taken to bed with a fever.`,
    options: [
      { label: 'Summon the best physicians', hint: '−200 gold, recovers', fx: (s, r) => gold(r, -200) },
      { label: 'Trust in rest', hint: 'Small chance of death', fx: (s, r) => { if (chance(s, 0.15)) { const c = charOf(s, r.rulerId); if (c) c.flags.doomed = true; } } },
    ],
  },
  // ---------- special events (not rolled randomly) ----------
  revolt: {
    title: 'Open Revolt!', special: true,
    text: (s, r, c) => `The people of ${P(s, c).name} have taken up arms against the crown.`,
    options: [
      { label: 'Crush the rebels', hint: 'Lose 15% of regiments, −3% population there, unrest drops to 25', fx: (s, r, c) => { r.regiments = Math.max(0, Math.floor(r.regiments * 0.85)); P(s, c).pop *= 0.97; P(s, c).unrest = 25; } },
      { label: 'Negotiate', hint: '−300 gold (debt if needed), unrest drops to 45', fx: (s, r, c) => { gold(r, -300); P(s, c).unrest = 45; } },
    ],
  },
  peace_offer: {
    title: 'Envoys Arrive', special: true,
    valid: (s, r, c) => s.wars.some((w) => w.id === c.warId),
    text: (s, r, c) => {
      const w = s.wars.find((x) => x.id === c.warId);
      const enemy = s.realms[(w.attackers.includes(r.id) ? w.defenders : w.attackers)[0]];
      if (c.terms === 'demand') return `${enemy.name} is winning the ${w.name}. Their envoys demand you cede every province they occupy.`;
      if (c.terms === 'surrender') return `${enemy.name} is beaten. Their envoys offer to cede every province you occupy if the fighting stops.`;
      return `The ${w.name} has dragged on with no victor. ${enemy.name} proposes a white peace.`;
    },
    options: [
      { label: 'Accept', hint: 'End the war on these terms', fx: (s, r, c) => {
        const w = s.wars.find((x) => x.id === c.warId);
        if (!w) return;
        const mySide = w.attackers.includes(r.id) ? 'attackers' : 'defenders';
        const other = mySide === 'attackers' ? 'defenders' : 'attackers';
        makePeace(s, w, c.terms === 'white' ? null : c.terms === 'demand' ? other : mySide);
      } },
      { label: 'Refuse — the war goes on', hint: 'They will not ask again for 6 months', fx: () => {} },
    ],
  },
};

const RANDOM_EVENTS = Object.entries(EVENTS).filter(([, e]) => !e.special);

export function rollEvents(s) {
  for (const r of s.realms) {
    if (!r.alive) continue;
    // Revolts
    for (const p of provincesOf(s, r.id)) {
      if (p.unrest > 75 && chance(s, 0.08)) trigger(s, r, 'revolt', { pid: p.id });
    }
    if (!chance(s, 0.05)) continue;
    const eligible = [];
    for (const [id, e] of RANDOM_EVENTS) {
      const ctx = e.find(s, r);
      if (ctx) eligible.push({ id, ctx, w: e.weight });
    }
    const chosen = weightedPick(s, eligible, (x) => x.w);
    if (chosen) trigger(s, r, chosen.id, chosen.ctx);
  }
}

function trigger(s, r, id, ctx) {
  if (r.id === s.playerId) {
    if (s.pendingEvents.length >= 3 || s.pendingEvents.some((e) => e.id === id)) return;
    s.pendingEvents.push({ id, realmId: r.id, ctx });
  } else {
    // AI: prefer the first affordable option
    const opts = EVENTS[id].options;
    const idx = r.treasury > 400 || opts.length === 1 ? 0 : opts.length - 1;
    opts[idx].fx(s, r, ctx);
  }
}

export function eventView(s, ev) {
  const e = EVENTS[ev.id];
  const r = s.realms[ev.realmId];
  return { title: e.title, text: e.text(s, r, ev.ctx), options: e.options.map((o) => ({ label: o.label, hint: o.hint })) };
}

export function resolveEvent(s, index) {
  const ev = s.pendingEvents.shift();
  if (!ev) return 'No event';
  const e = EVENTS[ev.id];
  const r = s.realms[ev.realmId];
  if (e.valid && !e.valid(s, r, ev.ctx)) return null;
  const opt = e.options[index];
  if (!opt) return 'Invalid option';
  opt.fx(s, r, ev.ctx);
  log(s, `📜 ${e.title}: ${opt.label}.`, 'info', [r.id]);
  return null;
}

export function dropStaleEvents(s) {
  s.pendingEvents = s.pendingEvents.filter((ev) => {
    const e = EVENTS[ev.id];
    const r = s.realms[ev.realmId];
    if (!r.alive) return false;
    if (e.valid && !e.valid(s, r, ev.ctx)) return false;
    if (ev.ctx?.pid != null && s.provinces[ev.ctx.pid].owner !== r.id) return false;
    return true;
  });
}

