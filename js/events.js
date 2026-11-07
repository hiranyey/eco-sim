// Court events. The player chooses from a card; AI houses decide on their own.
import { rand, pick, randInt } from './rng.js';
import { within } from './hex.js';
import { makePeace, addRenown, declareWar, log } from './rules.js';
import { marry, applyDeal, remember, allied, endAlliance, tradeGold } from './diplomacy.js';
import { W, H, TERRAIN, TRAITS } from './data.js';
import { addUnit, maxHp, titled, pronoun } from './world.js';

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
      { label: 'Work it for the crown', hint: '+5 materials', fx: (s, fid) => { fac(s, fid).materials += 5; } },
      { label: 'Sell the mining rights', hint: '+7 gold', fx: (s, fid) => { fac(s, fid).gold += 7; } },
    ],
  },
  forest: {
    title: 'The Old Wood', weight: 6,
    find: () => ({}),
    text: () => 'Woodcutters ask leave to fell an ancient forest that local folk hold sacred.',
    options: [
      { label: 'Fell it', hint: '+6 materials', fx: (s, fid) => { fac(s, fid).materials += 6; } },
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
    text: (s, fid) => `A scholar offers to write the deeds of ${titled(ruler(s, fid), 'ruler')} into a great chronicle, for a fee.`,
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
    text: (s, fid, c) => `${titled(s.characters[c.cid], 'heir')}, your heir, is of an age for tutors. What should ${pronoun(s.characters[c.cid])} learn?`,
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
      const h = heirOf(s, fid);
      return ok.length && h && !h.spouseId ? { with: pick(s, ok).id } : null;
    },
    text: (s, fid, c) => `${s.factions[c.with].name} proposes to wed one of its own to ${heirOf(s, fid) ? titled(heirOf(s, fid), 'heir') : 'your heir'}, sealing a long friendship.`,
    options: [
      { label: 'Accept the match', hint: '+2 renown, a lasting bond with their court and a 12-turn non-aggression pact', fx: (s, fid, c) => {
        if (s.factions[c.with].alive && !rel(s, fid, c.with).war) marry(s, fid, c.with);
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
  // ---------- special: envoys and calls to arms (player only) ----------
  envoy_pact: {
    title: 'Envoys Seek a Pact', special: true, scene: 'envoy',
    valid: (s, fid, c) => s.factions[c.from].alive && !rel(s, fid, c.from).war && rel(s, fid, c.from).pact <= s.turn,
    text: (s, fid, c) => `Envoys of ${s.factions[c.from].name} propose a non-aggression pact: for twelve years neither house would march on the other.`,
    options: [
      { label: 'Seal the pact', hint: 'Breaking it later costs renown and every court\'s trust', fx: (s, fid, c) => applyDeal(s, fid, c.from, [{ k: 'pact' }]) },
      { label: 'Send them home', hint: 'They will feel slighted', fx: (s, fid, c) => remember(s, c.from, fid, 'Rebuffed our envoys', -8, { decay: 1 }) },
    ],
  },
  envoy_trade: {
    title: 'Merchants Bearing Letters', special: true, scene: 'envoy',
    valid: (s, fid, c) => s.factions[c.from].alive && !rel(s, fid, c.from).war && !rel(s, fid, c.from).trade,
    text: (s, fid, c) => `The merchants of ${s.factions[c.from].name} want open roads and fair tolls between your realms.`,
    options: [
      { label: 'Open the roads', hint: (c, s) => `Trade agreement: +${tradeGold(s, s.playerId, c.from)} gold a turn for you, and they profit too`, fx: (s, fid, c) => applyDeal(s, fid, c.from, [{ k: 'trade' }]) },
      { label: 'Keep the gates shut', hint: 'They will feel slighted', fx: (s, fid, c) => remember(s, c.from, fid, 'Rebuffed our envoys', -5, { decay: 1 }) },
    ],
  },
  envoy_alliance: {
    title: 'An Offer of Alliance', special: true, scene: 'envoy',
    valid: (s, fid, c) => s.factions[c.from].alive && !rel(s, fid, c.from).war && !rel(s, fid, c.from).alliance,
    text: (s, fid, c) => `${s.factions[c.from].name} proposes an alliance${c.against != null ? ` against ${s.factions[c.against].name}` : ''}. Each house would come to the other's defence.`,
    options: [
      { label: 'Join hands', hint: 'Allies defend each other and may cross each other\'s land. Refusing a later call to arms ends it.', fx: (s, fid, c) => applyDeal(s, fid, c.from, [{ k: 'alliance' }]) },
      { label: 'Decline', hint: 'They will be disappointed', fx: (s, fid, c) => remember(s, c.from, fid, 'Spurned our friendship', -10, { decay: 1 }) },
    ],
  },
  envoy_demand: {
    title: 'A Demand for Tribute', special: true, scene: 'demand',
    valid: (s, fid, c) => s.factions[c.from].alive && !rel(s, fid, c.from).war,
    text: (s, fid, c) => `The envoy of ${s.factions[c.from].name} does not bow. "Pay ${c.gold} gold, or our armies will collect it themselves."`,
    options: [
      { label: 'Pay the tribute', hint: (c) => `−${c.gold} gold; they leave you be for 6 turns`, can: (s, fid, c) => fac(s, fid).gold >= (c?.gold ?? 0), fx: (s, fid, c) => {
        fac(s, fid).gold -= c.gold;
        fac(s, c.from).gold += c.gold;
        const r = rel(s, fid, c.from);
        r.truce = Math.max(r.truce, s.turn + 6);
        remember(s, c.from, fid, 'Paid us tribute', 10, { decay: 1 });
        addRenown(s, fid, -Math.min(1, fac(s, fid).renown), 'events');
        log(s, `💰 ${fac(s, fid).short} pays ${c.gold} gold in tribute to ${fac(s, c.from).short}.`, 'bad');
      } },
      { label: 'Refuse', hint: 'They will declare war', fx: (s, fid, c) => { declareWar(s, c.from, fid); } },
    ],
  },
  call_to_arms: {
    title: 'A Call to Arms', special: true, scene: 'call_to_arms',
    valid: (s, fid, c) => s.factions[c.ally].alive && s.factions[c.enemy].alive && rel(s, c.ally, c.enemy).war && !rel(s, fid, c.enemy).war && allied(s, fid, c.ally),
    text: (s, fid, c) => `${s.factions[c.ally].name} ${c.defensive ? 'has been attacked by' : 'marches against'} ${s.factions[c.enemy].name} and calls on you, as its ally, to take the field.`,
    options: [
      { label: 'Honour the alliance', hint: (c, s) => {
        const r = rel(s, s.playerId, c.enemy);
        return `War with ${s.factions[c.enemy].short}, at no renown cost${r.truce > s.turn ? '. You have a truce with them, so you cannot' : r.pact > s.turn ? '. This breaks your pact with them' : ''}`;
      }, can: (s, fid, c) => !c || rel(s, fid, c.enemy).truce <= s.turn, fx: (s, fid, c) => {
        declareWar(s, fid, c.enemy, { called: true, quiet: true });
        log(s, `📯 ${fac(s, fid).short} answers ${fac(s, c.ally).short}'s call to arms against ${fac(s, c.enemy).short}!`, 'war');
        remember(s, c.ally, fid, 'Stood by us in war', 20, { decay: 0.5, cap: 30 });
      } },
      { label: 'Stay out of it', hint: (c) => (c.defensive ? 'The alliance ends, −3 renown, and they will not forget' : 'They will be disappointed'), fx: (s, fid, c) => {
        if (!c.defensive) { remember(s, c.ally, fid, 'Ignored our call', -10, { decay: 1 }); return; }
        addRenown(s, fid, -Math.min(3, fac(s, fid).renown), 'events');
        remember(s, c.ally, fid, 'Abandoned us in war', -35, { decay: 0.5 });
        endAlliance(s, fid, c.ally, `${fac(s, fid).short} abandons ${fac(s, c.ally).short} in its hour of need. The alliance is over.`);
      } },
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
  const opts = e.options.filter((o) => !o.can || o.can(s, fid, ctx));
  const choice = id === 'peace_offer' ? e.options[1] : opts[randInt(s, 0, opts.length - 1)];
  choice.fx(s, fid, ctx);
}

export function eventView(s, ev) {
  const e = EVENTS[ev.id];
  return {
    title: e.title,
    text: e.text(s, ev.fid, ev.ctx),
    scene: e.scene ?? ev.id,
    options: e.options.map((o) => ({ label: o.label, hint: typeof o.hint === 'function' ? o.hint(ev.ctx, s) : o.hint, ok: !o.can || o.can(s, ev.fid, ev.ctx) })),
  };
}

// Drop queued events that no longer make sense (an ally's war already over, an envoy's house destroyed).
export function pruneEvents(s) {
  s.pendingEvents = s.pendingEvents.filter((ev) => !EVENTS[ev.id].valid || EVENTS[ev.id].valid(s, ev.fid, ev.ctx));
}

export function resolveEvent(s, index) {
  const ev = s.pendingEvents.shift();
  if (!ev) return 'No event';
  const e = EVENTS[ev.id];
  if (e.valid && !e.valid(s, ev.fid, ev.ctx)) return null;
  const o = e.options[index];
  if (!o || (o.can && !o.can(s, ev.fid, ev.ctx))) {
    s.pendingEvents.unshift(ev);
    return 'You cannot afford that';
  }
  o.fx(s, ev.fid, ev.ctx);
  return null;
}

