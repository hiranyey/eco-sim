// Diplomacy: what the houses think of each other, the treaties they sign, vassals, and negotiated deals.
// DOM-free so it runs in Node tests.
//
// Opinion is "how house a feels about house b", from −100 to 100. It is built from standing reasons
// (wars, treaties, borders, envy, fear) plus remembered deeds (gifts, broken oaths) that fade each turn.
// A deal is a list of items put on the table; the other house weighs each one and accepts if the sum is
// positive. Every reason is returned so the interface can show exactly why a house says yes or no.
import { randInt } from './rng.js';
import { TECHS, RENOWN_TO_WIN, PACT_TURNS } from './data.js';
import { newCharacter, titled } from './world.js';
import {
  relation, citiesOf, addRenown, log, strength, makePeace, declareWar, atWarWith, hasTrait, withdraw, nearestFree, unitsOf,
} from './rules.js';
import { trigger } from './events.js';
import { distance } from './hex.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Older saves predate diplomacy: fill in the blanks.
export function ensureDiplomacy(s) {
  s.memory ??= {};
  for (const r of Object.values(s.relations)) {
    r.pact ??= 0;
    r.alliance ??= false;
    r.trade ??= false;
  }
  for (const f of s.factions) f.overlord ??= null;
  return s;
}

// ---------- standing ----------
export const overlordOf = (s, fid) => (fid >= 0 ? s.factions[fid].overlord ?? null : null);
export const vassalsOf = (s, fid) => s.factions.filter((f) => f.alive && f.overlord === fid).map((f) => f.id);
export const allied = (s, a, b) => a !== b && a >= 0 && b >= 0 && !!relation(s, a, b).alliance;
export const pactWith = (s, a, b) => a !== b && a >= 0 && b >= 0 && relation(s, a, b).pact > s.turn;

// Friends may march through each other's land.
export function friendly(s, a, b) {
  if (a === b) return true;
  if (a < 0 || b < 0) return false;
  return allied(s, a, b) || overlordOf(s, a) === b || overlordOf(s, b) === a;
}

export function bordering(s, a, b) {
  const ca = citiesOf(s, a);
  const cb = citiesOf(s, b);
  return ca.some((x) => cb.some((y) => distance(s.W, x.tile, y.tile) <= 6));
}

// A house's armies plus what its friends would bring to a fight (used by the AI to size up a target).
export function bloc(s, fid) {
  let v = strength(s, fid);
  for (const f of s.factions) {
    if (!f.alive || f.id === fid) continue;
    if (allied(s, fid, f.id) || f.overlord === fid || overlordOf(s, fid) === f.id) v += strength(s, f.id) * 0.6;
  }
  return v;
}

// Gold a house earns each turn from one trade partner.
export function tradeGold(s, fid, partner) {
  return clamp(Math.round(citiesOf(s, partner).length / 2), 1, 3) + (s.factions[fid].key === 'selene' ? 1 : 0);
}

// ---------- memories ----------
function memVal(s, m) {
  const d = Math.max(0, s.turn - m.turn) * m.decay;
  return m.v > 0 ? Math.max(0, m.v - d) : Math.min(0, m.v + d);
}

// House a remembers something house b did. Repeats of the same deed stack up to a cap.
export function remember(s, a, b, text, v, { decay = 1, cap = 60 } = {}) {
  if (a < 0 || b < 0 || a === b) return;
  s.memory ??= {};
  const list = (s.memory[`${a}>${b}`] ??= []);
  const old = list.find((m) => m.text === text);
  if (old) {
    old.v = clamp(memVal(s, old) + v, -cap, cap);
    old.turn = s.turn;
    old.decay = decay;
  } else list.push({ text, v: clamp(v, -cap, cap), turn: s.turn, decay });
}

export function pruneMemory(s) {
  for (const k of Object.keys(s.memory ?? {})) {
    s.memory[k] = s.memory[k].filter((m) => Math.round(memVal(s, m)) !== 0);
    if (!s.memory[k].length) delete s.memory[k];
  }
}

// ---------- opinion ----------
const TEMPER = {
  varr: { text: 'House Varr trusts few', v: -10 },
  selene: { text: 'Selene prefers deals to wars', v: 5 },
  ashkar: { text: 'Ashkar respects only strength', v: -5 },
};

export function opinion(s, a, b) {
  const A = s.factions[a];
  const B = s.factions[b];
  const parts = [];
  const add = (text, v) => { v = Math.round(v); if (v) parts.push({ text, v }); };
  const r = relation(s, a, b);
  const T = TEMPER[A.key];
  if (T) add(T.text, T.v);
  if (r.war) add('At war with us', -40);
  if (r.alliance) add('Our allies', 25);
  if (r.pact > s.turn) add('Non-aggression pact', 10);
  if (r.trade) add('Trade partners', 10);
  if (A.overlord === b) { add('Our liege lord', 10); add('Resents paying tribute', -15); }
  if (B.overlord === a) add('Our sworn vassal', 15);
  if (s.factions.some((x) => x.alive && x.id !== a && x.id !== b && relation(s, a, x.id).war && relation(s, b, x.id).war)) add('A common enemy', 15);
  if (!r.war && !r.alliance && bordering(s, a, b)) add('Our borders touch', -5);
  const top = s.factions.filter((x) => x.alive).sort((x, y) => y.renown - x.renown)[0];
  if (top && top.id === b && B.renown > A.renown + 5 && B.renown >= RENOWN_TO_WIN * 0.4) add('Envies your renown', -15);
  if (!r.war && strength(s, b) > strength(s, a) * 1.6 + 2) add('Fears your armies', 10);
  for (const m of s.memory?.[`${a}>${b}`] ?? []) add(m.text, memVal(s, m));
  return { total: clamp(parts.reduce((t, p) => t + p.v, 0), -100, 100), parts };
}
export const opinionOf = (s, a, b) => opinion(s, a, b).total;

export function mood(v) {
  if (v >= 50) return { name: 'Devoted', cls: 'dev' };
  if (v >= 20) return { name: 'Friendly', cls: 'fri' };
  if (v > -10) return { name: 'Neutral', cls: 'neu' };
  if (v > -40) return { name: 'Wary', cls: 'war' };
  return { name: 'Hostile', cls: 'hos' };
}

// ---------- deals ----------
// Items: { k:'gold', by, n } { k:'town', by, id } { k:'tech', by, key } and the mutual treaties
// { k:'peace' } { k:'pact' } { k:'trade' } { k:'alliance' } { k:'marriage' } (a's heir weds into b),
// plus { k:'vassal' } (b swears fealty to a) and { k:'joinwar', target } (b declares war on target).
export const TREATIES = {
  peace: { name: 'Peace', desc: 'End the war with a truce' },
  pact: { name: 'Non-aggression pact', desc: `Neither may attack the other for ${PACT_TURNS} turns without breaking an oath` },
  trade: { name: 'Trade agreement', desc: 'Both earn gold every turn from the other\'s towns' },
  alliance: { name: 'Alliance', desc: 'Each defends the other, armies may cross allied land, and you share sight' },
  marriage: { name: 'Royal marriage', desc: 'Your heir weds into their house: lasting goodwill, a pact and +2 renown' },
  vassal: { name: 'Swear fealty to you', desc: 'They pay you a quarter of their gold, fight your wars, and give you +1 renown a turn' },
  joinwar: { name: 'Join your war', desc: 'They declare war on your enemy' },
};
const MUTUAL = ['peace', 'pact', 'trade', 'alliance', 'marriage'];

export const heirOf = (s, fid) => (s.factions[fid].heirId != null ? s.characters[s.factions[fid].heirId] : null);

// Techs house `from` could teach house `to`: ones they lack whose earlier rung they already know.
export function teachable(s, from, to) {
  const T = s.factions[to];
  const prev = (k) => Object.keys(TECHS).find((x) => TECHS[x].branch === TECHS[k].branch && TECHS[x].tier === TECHS[k].tier - 1);
  return s.factions[from].techs.filter((k) => !T.techs.includes(k) && (TECHS[k].tier === 1 || T.techs.includes(prev(k))));
}

export function dealProblem(s, a, b, items) {
  const A = s.factions[a];
  const B = s.factions[b];
  const r = relation(s, a, b);
  if (!A.alive || !B.alive) return 'That house is gone';
  if (!items.length) return 'Put something on the table';
  const has = (k) => items.some((i) => i.k === k);
  if (r.war && !has('peace')) return 'You are at war: offer peace first';
  for (const it of items) {
    const giver = it.by != null ? s.factions[it.by] : null;
    switch (it.k) {
      case 'gold':
        if (!(it.n > 0)) return 'Name an amount';
        if (giver.gold < it.n) return `${giver.id === a ? 'You do' : `${giver.short} does`} not have ${it.n} gold`;
        break;
      case 'town': {
        const c = s.cities[it.id];
        if (!c || c.owner !== it.by) return 'That town is not theirs to give';
        if (c.capital) return 'No house gives up its capital';
        break;
      }
      case 'tech':
        if (!teachable(s, it.by, it.by === a ? b : a).includes(it.key)) return 'That knowledge cannot be shared';
        break;
      case 'peace': if (!r.war) return 'You are not at war'; break;
      case 'pact': if (r.pact > s.turn) return 'A pact already holds'; break;
      case 'trade': if (r.trade) return 'You already trade'; break;
      case 'alliance':
        if (r.alliance) return 'You are already allies';
        if (A.overlord === b || B.overlord === a) return 'Liege and vassal are already bound';
        break;
      case 'marriage': {
        const h = heirOf(s, a);
        if (!h) return 'You have no heir to wed';
        if (h.spouseId) return `${h.name} is already wed`;
        break;
      }
      case 'vassal':
        if (b === s.playerId) return 'You will never kneel';
        if (B.overlord != null) return `${B.short} already serves a liege`;
        if (A.overlord != null) return 'A vassal cannot take vassals';
        if (vassalsOf(s, b).length) return `${B.short} has vassals of its own`;
        break;
      case 'joinwar': {
        const X = s.factions[it.target];
        if (!X?.alive || it.target === a || it.target === b) return 'No such war';
        if (!relation(s, a, it.target).war) return `You are not at war with ${X.short}`;
        const rx = relation(s, b, it.target);
        if (rx.war) return `${B.short} already fights ${X.short}`;
        if (rx.truce > s.turn) return `${B.short} has a truce with ${X.short}`;
        if (B.overlord != null) return 'Vassals follow their liege';
        if (X.overlord === b) return `${X.short} is their vassal`;
        break;
      }
      default: return 'Unknown term';
    }
  }
  return null;
}

// How house b weighs a deal proposed by house a.
export function evaluateDeal(s, a, b, items) {
  const problem = dealProblem(s, a, b, items);
  const parts = [];
  const add = (text, v) => { v = Math.round(v); if (v) parts.push({ text, v }); };
  const A = s.factions[a];
  const B = s.factions[b];
  const r = relation(s, a, b);
  const op = opinionOf(s, b, a);
  // While at war, the war itself is weighed below, so opinion counts for less.
  add('What they think of you', r.war ? (op + 40) / 4 : op > 0 ? op / 4 : op / 3);
  const mine = strength(s, a);
  const theirs = strength(s, b);
  const ratio = theirs / Math.max(1, mine); // above 1: they are stronger
  const greed = hasTrait(s, b, 'greedy') ? 1.5 : 1;
  let gets = 0;
  let gives = 0;
  for (const it of items) {
    const fromA = it.by === a;
    switch (it.k) {
      case 'gold':
        if (fromA) { add(`${it.n} gold for them`, it.n * greed); gets++; } else { add(`${it.n} gold from their treasury`, -it.n * 1.4 * greed); gives++; }
        break;
      case 'town': {
        const c = s.cities[it.id];
        if (fromA) { add(`${c.name} joins their realm`, 10 + c.level * 6 + c.buildings.length * 2); gets++; } else {
          add(`Losing ${c.name}`, -(28 + c.level * 14 + c.buildings.length * 4));
          if (citiesOf(s, b).length <= 2) add('One of their last towns', -20);
          gives++;
        }
        break;
      }
      case 'tech': {
        const T = TECHS[it.key];
        if (fromA) { add(`Learning ${T.name}`, T.cost * 0.5); gets++; } else { add(`Teaching you ${T.name}`, -T.cost * 0.6); gives++; }
        break;
      }
      case 'peace': {
        const len = s.turn - r.since;
        if (ratio > 2.2) add('They are crushing you', -100);
        else add(ratio > 1 ? 'They are winning the war' : 'They are losing the war', (1 - ratio) * 25);
        add(`Weary after ${len} year${len === 1 ? '' : 's'} of war`, Math.min(15, len));
        if (r.aggressor === b && len < 10) add('Their war has barely begun', -(10 - len) * 2);
        add('Peace lets them rebuild', 6);
        break;
      }
      case 'pact':
        add('Secures their border', 5);
        if (ratio > 1.3 && bordering(s, a, b)) add('They eye your lands', -15);
        if (atWarWith(s, b).length) add('Busy with other wars', 8);
        break;
      case 'trade':
        add('Trade enriches both', 6);
        if (B.key === 'selene') add('A merchant house', 6);
        if (op < -20) add('Will not trade with rivals', -20);
        break;
      case 'alliance': {
        add('Alliances bind', -10);
        if (op < 20) add('Does not trust you enough', -30);
        const common = atWarWith(s, a).filter((x) => x !== b && relation(s, b, x).war);
        if (common.length) add('A common enemy', 20);
        const drag = atWarWith(s, a).filter((x) => x !== b && !relation(s, b, x).war).length;
        if (drag) add('Would be dragged into your wars', -10 * drag);
        if (ratio < 0.8) add('You are a strong friend', 10);
        else if (ratio > 1.6) add('You are a weak friend', -10);
        break;
      }
      case 'marriage':
        add('A fine match', 6);
        if (op < 0) add('Distrusts your house', -12);
        break;
      case 'vassal':
        add('Cherishes independence', -70);
        add(ratio < 1 ? 'Your might' : 'You are not mighty enough', (1 - ratio) * 60);
        if (r.war) add('Defeat looms', 15);
        if (citiesOf(s, b).length <= 2) add('Too small to stand alone', 15);
        if (B.renown > A.renown) add('Prouder than you', -20);
        gives++;
        break;
      case 'joinwar': {
        const X = s.factions[it.target];
        add('The cost of war', -15);
        add(`What they think of ${X.short}`, -opinionOf(s, b, it.target) / 2);
        if (strength(s, it.target) > theirs * 1.2) add(`${X.short} is strong`, -15);
        if (r.alliance) add('Honours the alliance', 15);
        const rx = relation(s, b, it.target);
        if (rx.pact > s.turn) add(`Would break their pact with ${X.short}`, -30);
        if (rx.alliance) add(`Allied to ${X.short}`, -100);
        gives++;
        break;
      }
    }
  }
  if (gives && !gets && !items.some((i) => MUTUAL.includes(i.k))) {
    add('Something for nothing', -10);
    if (ratio < 0.6) add('Dares not refuse you', (0.6 - ratio) * 40);
  }
  const score = parts.reduce((t, p) => t + p.v, 0);
  return { score, parts, problem, accept: !problem && score > 0 };
}

export function proposeDeal(s, a, b, items) {
  const ev = evaluateDeal(s, a, b, items);
  if (ev.problem) return ev.problem;
  if (!ev.accept) return `${s.factions[b].short} refuses`;
  applyDeal(s, a, b, items, ev);
  return { type: 'deal', with: b };
}

export function applyDeal(s, a, b, items, ev = null) {
  const A = s.factions[a];
  const B = s.factions[b];
  const r = relation(s, a, b);
  const said = [];
  const ordered = [...items].sort((x, y) => (y.k === 'peace') - (x.k === 'peace'));
  for (const it of ordered) {
    const to = it.by === a ? b : a;
    switch (it.k) {
      case 'gold':
        s.factions[it.by].gold -= it.n;
        s.factions[to].gold += it.n;
        said.push(`💰${it.n} to ${s.factions[to].short}`);
        break;
      case 'town':
        cedeTown(s, s.cities[it.id], to);
        said.push(`${s.cities[it.id].name} to ${s.factions[to].short}`);
        break;
      case 'tech': {
        const T = s.factions[to];
        T.techs.push(it.key);
        if (T.research === it.key) T.research = null;
        if (TECHS[it.key].renown) addRenown(s, to, TECHS[it.key].renown, 'research');
        said.push(`the secrets of ${TECHS[it.key].name} for ${T.short}`);
        break;
      }
      case 'peace': makePeace(s, a, b); break;
      case 'pact':
        r.pact = s.turn + PACT_TURNS;
        said.push(`a non-aggression pact until turn ${r.pact}`);
        break;
      case 'trade':
        r.trade = true;
        said.push('a trade agreement');
        break;
      case 'alliance':
        r.alliance = true;
        said.push('an alliance');
        break;
      case 'marriage': marry(s, a, b); break;
      case 'vassal': swearFealty(s, b, a); break;
      case 'joinwar':
        said.push(`${B.short} marches on ${s.factions[it.target].short}`);
        break;
    }
  }
  const mine = a === s.playerId || b === s.playerId;
  if (said.length) log(s, `🤝 ${A.short} and ${B.short} agree: ${said.join(', ')}.`, mine ? 'good' : 'world');
  for (const it of ordered) if (it.k === 'joinwar') declareWar(s, b, it.target, { called: true });
  // Generous terms are remembered.
  if (ev) {
    const surplus = ev.score - (ev.parts.find((p) => p.text === 'What they think of you')?.v ?? 0);
    if (surplus > 6) remember(s, b, a, 'Generous dealings', Math.min(25, surplus / 2), { decay: 1, cap: 30 });
  }
}

// Hand a town to another house. The old owner's troops inside walk out.
export function cedeTown(s, c, to) {
  const prev = c.owner;
  c.owner = to;
  c.capital = false;
  c.recruits = 99;
  for (const u of unitsOf(s, prev)) {
    if (s.tiles[u.tile].city !== c.id) continue;
    const t = nearestFree(s, u);
    if (t != null) u.tile = t;
    else s.units = s.units.filter((x) => x !== u);
  }
  if (prev >= 0) remember(s, prev, to, `Took ${c.name}`, -10, { decay: 0.5 });
}

export function marry(s, a, b) {
  const heir = heirOf(s, a);
  if (!heir || heir.spouseId) return;
  const sex = heir.sex === 'f' ? 'm' : 'f';
  const id = newCharacter(s, clamp(heir.age + randInt(s, -3, 3), 1, 70), sex);
  const sp = s.characters[id];
  sp.house = b;
  sp.spouseId = heir.id;
  heir.spouseId = id;
  const r = relation(s, a, b);
  r.pact = Math.max(r.pact, s.turn + PACT_TURNS);
  remember(s, a, b, 'Royal marriage', 30, { decay: 0.25, cap: 40 });
  remember(s, b, a, 'Royal marriage', 30, { decay: 0.25, cap: 40 });
  addRenown(s, a, 2, 'diplomacy');
  const A = s.factions[a];
  const B = s.factions[b];
  const verb = heir.age < 16 ? 'is betrothed to' : 'weds';
  log(s, `💍 ${titled(heir, 'heir')} of ${A.short} ${verb} ${sp.name} of ${B.name}. (+2 renown)`, a === s.playerId || b === s.playerId ? 'good' : 'world');
}

export function swearFealty(s, v, lord) {
  const V = s.factions[v];
  V.overlord = lord;
  const r = relation(s, v, lord);
  r.war = false;
  r.alliance = false;
  r.pact = 0;
  // The vassal's quarrels end unless its liege shares them; the liege's wars become its own.
  for (const x of atWarWith(s, v)) if (!relation(s, lord, x).war) makePeace(s, v, x);
  log(s, `⛓ ${V.name} bends the knee and becomes a vassal of ${s.factions[lord].name}. (+5 renown)`, v === s.playerId || lord === s.playerId ? 'good' : 'world');
  addRenown(s, lord, 5, 'diplomacy');
  for (const x of atWarWith(s, lord)) if (x !== v && !relation(s, v, x).war) declareWar(s, v, x, { called: true, quiet: true });
}

export function releaseVassal(s, lord, v) {
  const V = s.factions[v];
  if (V.overlord !== lord) return 'They are not your vassal';
  V.overlord = null;
  const r = relation(s, lord, v);
  r.pact = s.turn + PACT_TURNS;
  remember(s, v, lord, 'Granted us freedom', 30, { decay: 0.5 });
  log(s, `🕊 ${s.factions[lord].short} releases ${V.name} from its oaths.`, lord === s.playerId ? 'good' : 'world');
  return { type: 'release' };
}

export function sendGift(s, a, b, n) {
  if (s.factions[a].gold < n) return 'Not enough gold';
  if (relation(s, a, b).war) return 'They will not accept gifts from an enemy';
  s.factions[a].gold -= n;
  s.factions[b].gold += n;
  remember(s, b, a, 'Generous gifts', Math.round(n * 1.2), { decay: 1, cap: 30 });
  log(s, `🎁 ${s.factions[a].short} sends ${s.factions[b].short} a gift of 💰${n}.`, a === s.playerId ? 'info' : 'world');
  return { type: 'gift' };
}

// ---------- oaths and calls to arms ----------
// Called by declareWar before the war starts, when the attacker had a pact or alliance with the target.
export function breakOath(s, a, b) {
  const r = relation(s, a, b);
  const sacred = r.alliance;
  if (!sacred && !(r.pact > s.turn)) return;
  const cost = sacred ? 6 : 4;
  addRenown(s, a, -Math.min(cost, s.factions[a].renown), 'events');
  remember(s, b, a, 'Betrayed us', -45, { decay: 0.4 });
  for (const x of s.factions) if (x.alive && x.id !== a && x.id !== b) remember(s, x.id, a, 'Oathbreaker', -15, { decay: 0.3, cap: 30 });
  log(s, `💔 ${s.factions[a].short} breaks its ${sacred ? 'alliance' : 'pact'} with ${s.factions[b].short}! Every court takes note. (−${cost} renown)`, a === s.playerId || b === s.playerId ? 'bad' : 'war');
  r.alliance = false;
  r.pact = 0;
}

export function endAlliance(s, a, b, why) {
  const r = relation(s, a, b);
  if (!r.alliance) return;
  r.alliance = false;
  withdraw(s, a, b);
  log(s, `💔 ${why}`, a === s.playerId || b === s.playerId ? 'bad' : 'world');
}

// After a declaration: vassals follow their liege, and allies on both sides are called.
export function rallyAllies(s, attacker, defender) {
  for (const v of vassalsOf(s, attacker)) if (v !== defender) joinWar(s, v, defender);
  for (const v of vassalsOf(s, defender)) if (v !== attacker) joinWar(s, v, attacker);
  const lord = overlordOf(s, defender);
  if (lord != null && lord !== attacker) joinWar(s, lord, attacker);
  for (const x of s.factions) {
    if (!x.alive || x.id === attacker || x.id === defender) continue;
    if (allied(s, x.id, defender)) callToArms(s, x.id, defender, attacker, true);
    else if (allied(s, x.id, attacker)) callToArms(s, x.id, attacker, defender, false);
  }
}

function joinWar(s, x, enemy) {
  const r = relation(s, x, enemy);
  if (r.war || !s.factions[x].alive || !s.factions[enemy].alive || r.truce > s.turn) return;
  declareWar(s, x, enemy, { called: true, quiet: true });
  log(s, `📯 ${s.factions[x].short} takes the field against ${s.factions[enemy].short}.`, x === s.playerId || enemy === s.playerId ? 'war' : 'world');
}

export function callToArms(s, x, friend, enemy, defensive) {
  const r = relation(s, x, enemy);
  if (r.war) return;
  if (x === s.playerId) {
    trigger(s, x, 'call_to_arms', { ally: friend, enemy, defensive });
    return;
  }
  // A truce, a pact or an alliance with the enemy keeps an ally out without shame.
  if (r.truce > s.turn || r.pact > s.turn || r.alliance || overlordOf(s, enemy) === x) return;
  const op = opinionOf(s, x, friend) - opinionOf(s, x, enemy) / 2;
  const willing = defensive ? op >= 5 : op >= 30 && strength(s, x) > strength(s, enemy) * 0.7;
  const X = s.factions[x];
  if (willing) {
    declareWar(s, x, enemy, { called: true, quiet: true });
    remember(s, friend, x, 'Stood by us in war', 20, { decay: 0.5, cap: 30 });
    log(s, `📯 ${X.short} answers ${s.factions[friend].short}'s call to arms against ${s.factions[enemy].short}!`, [x, friend, enemy].includes(s.playerId) ? 'war' : 'world');
  } else if (defensive) {
    remember(s, friend, x, 'Abandoned us in war', -35, { decay: 0.5 });
    endAlliance(s, x, friend, `${X.short} refuses to defend ${s.factions[friend].short}. Their alliance is over.`);
  }
}

// What the player sees in the Diplomacy tab for one rival.
export function treatyList(s, a, b) {
  const r = relation(s, a, b);
  const out = [];
  if (r.war) out.push({ k: 'war', text: `At war since turn ${r.since}` });
  else if (r.truce > s.turn) out.push({ k: 'truce', text: `Truce until turn ${r.truce}` });
  if (r.alliance) out.push({ k: 'alliance', text: 'Allied' });
  if (r.pact > s.turn && !r.war) out.push({ k: 'pact', text: `Pact until turn ${r.pact}` });
  if (r.trade && !r.war) out.push({ k: 'trade', text: `Trade +${tradeGold(s, a, b)} gold a turn` });
  if (s.factions[b].overlord === a) out.push({ k: 'vassal', text: 'Your vassal' });
  if (s.factions[a].overlord === b) out.push({ k: 'vassal', text: 'Your liege' });
  return out;
}

// Called once per round: let memories fade and announce lapsed pacts.
export function diplomacyRound(s) {
  pruneMemory(s);
  for (const [k, r] of Object.entries(s.relations)) {
    if (r.pact && r.pact === s.turn) {
      const [a, b] = k.split('-').map(Number);
      if (a === s.playerId || b === s.playerId) log(s, `📜 The pact between ${s.factions[a].short} and ${s.factions[b].short} has lapsed.`, 'info');
    }
  }
}
