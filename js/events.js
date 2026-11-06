// Court events. The player chooses from a card; AI houses decide on their own.
import { rand, pick, randInt } from './rng.js';
import { within } from './hex.js';
import { makePeace, addRenown } from './rules.js';
import { W, H, TERRAIN, TRAITS } from './data.js';
import { addUnit, maxHp } from './world.js';

const fac = (s, fid) => s.factions[fid];
const ruler = (s, fid) => s.characters[fac(s, fid).rulerId];
const heirOf = (s, fid) => (fac(s, fid).heirId != null ? s.characters[fac(s, fid).heirId] : null);
const cities = (s, fid) => s.cities.filter((c) => c.owner === fid);
const unitAt = (s, t) => s.units.find((u) => u.tile === t);
const rulerUnit = (s, fid) => s.units.find((u) => u.owner === fid && u.type === 'ruler');
const rel = (s, a, b) => s.relations[a < b ? `${a}-${b}` : `${b}-${a}`];
const gold = (n) => (s, fid) => fac(s, fid).gold >= n;

function spawnNear(s, type, owner, tile) {
  const spots = within(W, H, tile, 2).filter((t) => TERRAIN[s.tiles[t].t].pass && !unitAt(s, t));
  if (!spots.length) return null;
  return addUnit(s, type, owner, pick(s, spots));
}

export const EVENTS = {
  harvest: {
    title: 'A Golden Harvest', weight: 10,
    find: () => ({}),
    text: () => 'The granaries overflow after a fine summer. Your steward asks what to do with the surplus.',
    options: [
      { label: 'Fill the army stores', hint: '+6 grain', fx: (s, fid) => { fac(s, fid).grain += 6; } },
      { label: 'Sell it at market', hint: '+8 gold', fx: (s, fid) => { fac(s, fid).gold += 8; } },
    ],
  },
  vein: {
    title: 'A Rich Seam', weight: 7,
    find: () => ({}),
    text: () => 'Miners in the hills have struck a seam of good iron.',
    options: [
      { label: 'Work it for the crown', hint: '+4 iron', fx: (s, fid) => { fac(s, fid).iron += 4; } },
      { label: 'Sell the mining rights', hint: '+7 gold', fx: (s, fid) => { fac(s, fid).gold += 7; } },
    ],
  },
  forest: {
    title: 'The Old Wood', weight: 6,
    find: () => ({}),
    text: () => 'Woodcutters ask leave to fell an ancient forest that local folk hold sacred.',
    options: [
      { label: 'Fell it', hint: '+6 timber', fx: (s, fid) => { fac(s, fid).timber += 6; } },
      { label: 'Spare the grove', hint: '+1 renown', fx: (s, fid) => { addRenown(s, fid, 1, 'events'); } },
    ],
  },
  mercenaries: {
    title: 'Sellswords at the Gate', weight: 7,
    find: (s, fid) => (cities(s, fid).some((c) => c.capital) ? {} : null),
    text: () => 'A company of mounted mercenaries offers its lances to whoever pays first.',
    options: [
      { label: 'Hire them', hint: '−9 gold: a Cavalry unit joins near your capital', can: gold(9), fx: (s, fid) => {
        fac(s, fid).gold -= 9;
        const cap = cities(s, fid).find((c) => c.capital);
        const u = cap && spawnNear(s, 'cavalry', fid, cap.tile);
        if (u) { u.moved = true; u.attacked = true; }
      } },
      { label: 'Send them away', hint: 'Nothing happens', fx: () => {} },
    ],
  },
  chronicle: {
    title: 'The Court Chronicler', weight: 6,
    find: () => ({}),
    text: (s, fid) => `A scholar offers to write the deeds of ${ruler(s, fid).name} into a great chronicle, for a fee.`,
    options: [
      { label: 'Commission it', hint: '−6 gold, +2 renown', can: gold(6), fx: (s, fid) => { fac(s, fid).gold -= 6; addRenown(s, fid, 2, 'events'); } },
      { label: 'Decline', hint: 'Nothing happens', fx: () => {} },
    ],
  },
  tournament: {
    title: 'A Grand Tournament', weight: 5,
    find: (s, fid) => (rulerUnit(s, fid) ? {} : null),
    text: () => 'Knights from across the Marches gather. Hosting a tournament would be costly, but glorious.',
    options: [
      { label: 'Host it', hint: '−5 gold, +2 renown, your ruler is restored to full health', can: gold(5), fx: (s, fid) => {
        fac(s, fid).gold -= 5;
        addRenown(s, fid, 2, 'events');
        const u = rulerUnit(s, fid);
        if (u) u.hp = maxHp(s, 'ruler', fid);
      } },
      { label: 'Not this year', hint: 'Nothing happens', fx: () => {} },
    ],
  },
  education: {
    title: "The Heir's Education", weight: 14,
    find: (s, fid) => {
      const h = heirOf(s, fid);
      return h && !h.educated && h.age >= 6 && h.age <= 16 ? { cid: h.id } : null;
    },
    text: (s, fid, c) => `${s.characters[c.cid].name}, your heir, is of an age for tutors. What should they learn?`,
    options: ['brave', 'builder', 'pious'].map((t) => ({
      label: `${t === 'brave' ? 'Arms' : t === 'builder' ? 'Statecraft' : 'Faith'}`,
      hint: `−4 gold, heir becomes ${TRAITS[t].name}: ${TRAITS[t].desc}`,
      can: gold(4),
      fx: (s, fid, c) => {
        const h = s.characters[c.cid];
        fac(s, fid).gold -= 4;
        if (!h) return;
        h.educated = true;
        if (!h.traits.includes(t)) h.traits[h.traits.includes('frail') ? h.traits.indexOf('frail') : 1] = t;
      },
    })).concat([{ label: 'Let them run wild', hint: 'Free', fx: (s, fid, c) => { const h = s.characters[c.cid]; if (h) h.educated = true; } }]),
  },
  plague: {
    title: 'Sickness in the Town', weight: 5,
    find: (s, fid) => {
      const cs = cities(s, fid);
      return cs.length ? { city: pick(s, cs).id } : null;
    },
    text: (s, fid, c) => `A fever spreads through ${s.cities[c.city].name}. Physicians beg for coin to fight it.`,
    options: [
      { label: 'Pay the physicians', hint: '−6 gold', can: gold(6), fx: (s, fid) => { fac(s, fid).gold -= 6; } },
      { label: 'Let it burn out', hint: 'Units within 1 hex of the town lose 4 HP (cannot die from this)', fx: (s, fid, c) => {
        const t = s.cities[c.city].tile;
        for (const u of s.units) if (u.owner === fid && within(W, H, t, 1).includes(u.tile)) u.hp = Math.max(1, u.hp - 4);
      } },
    ],
  },
  bandits: {
    title: 'Brigands on the Road', weight: 6,
    find: (s, fid) => {
      const cs = cities(s, fid).filter((c) => !c.capital);
      return cs.length && s.turn > 4 ? { city: pick(s, cs).id } : null;
    },
    text: (s, fid, c) => `Brigands have gathered in the hills near ${s.cities[c.city].name} and demand tribute.`,
    options: [
      { label: 'Pay them off', hint: '−5 gold', can: gold(5), fx: (s, fid) => { fac(s, fid).gold -= 5; } },
      { label: 'Let them come', hint: 'A rebel band appears near the town', fx: (s, fid, c) => { spawnNear(s, 'militia', -1, s.cities[c.city].tile); } },
    ],
  },
  pilgrims: {
    title: 'Pilgrims at the Shrine', weight: 8,
    find: (s, fid) => (s.units.some((u) => u.owner === fid && s.tiles[u.tile].shrine) ? {} : null),
    text: () => 'Pilgrims flock to the shrine your soldiers guard, bearing offerings.',
    options: [
      { label: 'Welcome them', hint: '+3 gold, +1 renown', fx: (s, fid) => { fac(s, fid).gold += 3; addRenown(s, fid, 1, 'events'); } },
      { label: 'Charge a toll', hint: '+8 gold', fx: (s, fid) => { fac(s, fid).gold += 8; } },
    ],
  },
  assassin: {
    title: 'A Knife in the Dark', weight: 6,
    find: (s, fid) => {
      const enemies = s.factions.filter((f) => f.alive && f.id !== fid && rel(s, fid, f.id).war);
      return enemies.length && rulerUnit(s, fid) ? { by: pick(s, enemies).id } : null;
    },
    text: (s, fid, c) => `Your spymaster has uncovered an assassin sent by ${s.factions[c.by].short}. They may not be alone.`,
    options: [
      { label: 'Double the guard', hint: '−6 gold', can: gold(6), fx: (s, fid) => { fac(s, fid).gold -= 6; } },
      { label: 'Trust to luck', hint: '50%: your ruler is wounded for 7 HP (cannot die from this)', fx: (s, fid) => {
        const u = rulerUnit(s, fid);
        if (u && rand(s) < 0.5) u.hp = Math.max(1, u.hp - 7);
      } },
    ],
  },
  marriage: {
    title: 'A Marriage Proposal', weight: 5,
    find: (s, fid) => {
      const ok = s.factions.filter((f) => f.alive && f.id !== fid && !rel(s, fid, f.id).war);
      return ok.length && heirOf(s, fid) ? { with: pick(s, ok).id } : null;
    },
    text: (s, fid, c) => `${s.factions[c.with].name} proposes to wed one of theirs to your heir, sealing a long friendship.`,
    options: [
      { label: 'Accept the match', hint: '+2 renown; neither house can declare war on the other for 10 turns', fx: (s, fid, c) => {
        addRenown(s, fid, 2, 'events');
        const r = rel(s, fid, c.with);
        r.truce = Math.max(r.truce, s.turn + 10);
      } },
      { label: 'Refuse', hint: 'Keep your options open', fx: () => {} },
    ],
  },
  // ---------- special: AI peace offers to the player ----------
  peace_offer: {
    title: 'Envoys Under a White Flag', special: true,
    valid: (s, fid, c) => rel(s, fid, c.from).war && s.factions[c.from].alive,
    text: (s, fid, c) => `${s.factions[c.from].name} is weary of war. Their envoys offer peace${c.gold ? ` and a tribute of ${c.gold} gold` : ''}.`,
    options: [
      { label: 'Accept peace', hint: (c) => `End the war${c.gold ? `, +${c.gold} gold` : ''}; 8-turn truce`, fx: (s, fid, c) => {
        const g = Math.min(c.gold, s.factions[c.from].gold);
        s.factions[c.from].gold -= g;
        fac(s, fid).gold += g;
        makePeace(s, fid, c.from);
      } },
      { label: 'Fight on', hint: 'They will not ask again soon', fx: () => {} },
    ],
  },
};

const RANDOM = Object.entries(EVENTS).filter(([, e]) => !e.special);

export function rollEvent(s, fid) {
  if (s.turn < 3 || rand(s) > 0.22) return;
  const eligible = [];
  for (const [id, e] of RANDOM) {
    const ctx = e.find(s, fid);
    if (ctx) eligible.push({ id, ctx, w: e.weight });
  }
  if (!eligible.length) return;
  let roll = rand(s) * eligible.reduce((a, x) => a + x.w, 0);
  const chosen = eligible.find((x) => (roll -= x.w) <= 0) ?? eligible[0];
  trigger(s, fid, chosen.id, chosen.ctx);
}

export function trigger(s, fid, id, ctx) {
  const e = EVENTS[id];
  if (fid === s.playerId) {
    s.pendingEvents.push({ id, fid, ctx });
    return;
  }
  const opts = e.options.filter((o) => !o.can || o.can(s, fid));
  const choice = id === 'peace_offer' ? e.options[1] : opts[randInt(s, 0, opts.length - 1)];
  choice.fx(s, fid, ctx);
}

export function eventView(s, ev) {
  const e = EVENTS[ev.id];
  return {
    title: e.title,
    text: e.text(s, ev.fid, ev.ctx),
    options: e.options.map((o) => ({ label: o.label, hint: typeof o.hint === 'function' ? o.hint(ev.ctx) : o.hint, ok: !o.can || o.can(s, ev.fid) })),
  };
}

export function resolveEvent(s, index) {
  const ev = s.pendingEvents.shift();
  if (!ev) return 'No event';
  const e = EVENTS[ev.id];
  if (e.valid && !e.valid(s, ev.fid, ev.ctx)) return null;
  const o = e.options[index];
  if (!o || (o.can && !o.can(s, ev.fid))) {
    s.pendingEvents.unshift(ev);
    return 'You cannot afford that';
  }
  o.fx(s, ev.fid, ev.ctx);
  return null;
}

