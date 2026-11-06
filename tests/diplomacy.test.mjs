import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../js/world.js';
import {
  beginTurn, endTurn, currentFaction, declareWar, makePeace, relation, citiesOf, income, unitsOf, checkVictory, reachable,
} from '../js/rules.js';
import {
  opinion, opinionOf, evaluateDeal, proposeDeal, applyDeal, remember, sendGift, swearFealty, releaseVassal, vassalsOf,
  ensureDiplomacy, friendly, treatyList,
} from '../js/diplomacy.js';
import { aiTurn } from '../js/ai.js';
import { eventView, resolveEvent, pruneEvents } from '../js/events.js';
import { neighbors } from '../js/hex.js';
import { W, H, TERRAIN } from '../js/data.js';

function fresh(seed = 'dip') {
  const s = newGame({ seed });
  beginTurn(s, currentFaction(s));
  return s;
}
const why = (o, text) => o.parts.find((p) => p.text === text)?.v;

test('opinion lists its reasons, and remembered deeds fade', () => {
  const s = fresh();
  const P = s.playerId;
  const X = (P + 1) % 4;
  const base = opinionOf(s, X, P);
  remember(s, X, P, 'Generous gifts', 10);
  assert.equal(opinionOf(s, X, P), base + 10);
  s.turn += 4;
  assert.equal(why(opinion(s, X, P), 'Generous gifts'), 6, 'memories fade by their decay each turn');
  declareWar(s, P, X);
  const o = opinion(s, X, P);
  assert.equal(why(o, 'At war with us'), -40);
  assert.ok(why(o, 'Declared war on us') < 0);
});

test('a fair trade deal is accepted and pays both sides every turn', () => {
  const s = fresh();
  const P = s.playerId;
  const X = (P + 1) % 4;
  const before = income(s, P).gold;
  const ev = evaluateDeal(s, P, X, [{ k: 'trade' }, { k: 'gold', by: P, n: 10 }]);
  assert.ok(ev.accept, JSON.stringify(ev));
  assert.equal(typeof proposeDeal(s, P, X, [{ k: 'trade' }, { k: 'gold', by: P, n: 10 }]), 'object');
  assert.ok(relation(s, P, X).trade);
  assert.ok(income(s, P).gold > before);
  assert.ok(income(s, P).trade >= 1);
  assert.ok(treatyList(s, P, X).some((t) => t.k === 'trade'));
});

test('asking for something for nothing is refused, and the reasons say so', () => {
  const s = fresh();
  const P = s.playerId;
  const X = (P + 1) % 4;
  const ev = evaluateDeal(s, P, X, [{ k: 'gold', by: X, n: 10 }]);
  assert.equal(ev.accept, false);
  assert.ok(why(ev, 'Something for nothing') < 0);
  assert.equal(typeof proposeDeal(s, P, X, [{ k: 'gold', by: X, n: 10 }]), 'string');
  assert.match(evaluateDeal(s, P, X, [{ k: 'pact' }, { k: 'gold', by: P, n: 9999 }]).problem, /not have/);
});

test('breaking a pact costs renown and every court remembers', () => {
  const s = fresh();
  const P = s.playerId;
  const X = (P + 1) % 4;
  const Y = (P + 2) % 4;
  applyDeal(s, P, X, [{ k: 'pact' }]);
  s.factions[P].renown = 20;
  const yBefore = opinionOf(s, Y, P);
  assert.equal(typeof declareWar(s, P, X), 'object');
  assert.equal(s.factions[P].renown, 20 - 4 - 2, 'oath (−4) plus the usual war cost (−2)');
  assert.ok(why(opinion(s, X, P), 'Betrayed us') < 0);
  assert.ok(opinionOf(s, Y, P) < yBefore, 'third parties think less of an oathbreaker');
});

test('allies answer a call to arms; the player is asked by event', () => {
  const s = fresh();
  const P = s.playerId;
  const [A, B, C] = [1, 2, 3].map((k) => (P + k) % 4);
  relation(s, A, B).alliance = true;
  remember(s, B, A, 'Old friends', 40);
  declareWar(s, C, A);
  assert.ok(relation(s, B, C).war, 'a friendly ally joins the defence');
  // Now the player is someone's ally.
  const s2 = fresh('dip2');
  const P2 = s2.playerId;
  const [D, E] = [1, 2].map((k) => (P2 + k) % 4);
  applyDeal(s2, P2, D, [{ k: 'alliance' }]);
  declareWar(s2, E, D);
  pruneEvents(s2);
  assert.equal(s2.pendingEvents[0]?.id, 'call_to_arms');
  assert.equal(eventView(s2, s2.pendingEvents[0]).options.length, 2);
  resolveEvent(s2, 1); // stay out of a defensive war
  assert.ok(!relation(s2, P2, D).alliance, 'refusing ends the alliance');
});

test('allied armies may cross each other\'s land', () => {
  const s = fresh();
  const P = s.playerId;
  const X = (P + 1) % 4;
  const u = unitsOf(s, P).find((x) => x.type !== 'ruler');
  // Teleport the unit next to a rival town and see whether it may step into the rival's land.
  const town = citiesOf(s, X)[0];
  const free = (t) => TERRAIN[s.tiles[t].t].pass && !s.units.some((v) => v.tile === t);
  // Clear the rival's own troops out of the way, then stand just outside its land.
  s.units = s.units.filter((v) => v.owner !== X);
  const spot = s.tiles.map((_, i) => i).find((t) => free(t) && s.tiles[t].city === -1
    && neighbors(W, H, t).some((n) => s.tiles[n].city === town.id && n !== town.tile && free(n)));
  assert.ok(spot != null, 'test map has a hex beside the rival town');
  u.tile = spot; u.moved = false;
  const inLand = (r) => [...r.keys()].some((t) => s.tiles[t].city === town.id);
  assert.equal(inLand(reachable(s, u)), false, 'peaceful foreign land is closed');
  relation(s, P, X).alliance = true;
  assert.ok(friendly(s, P, X));
  assert.equal(inLand(reachable(s, u)), true, 'allied land is open');
});

test('vassals pay tribute, give renown, and count as conquered', () => {
  const s = fresh();
  const P = s.playerId;
  const [A, B, C] = [1, 2, 3].map((k) => (P + k) % 4);
  const before = income(s, P).gold;
  swearFealty(s, A, P);
  assert.deepEqual(vassalsOf(s, P), [A]);
  assert.ok(income(s, A).tribute < 0);
  assert.equal(income(s, P).gold, before - income(s, A).tribute);
  assert.ok(friendly(s, P, A));
  assert.equal(typeof declareWar(s, A, B), 'string', 'a vassal cannot start wars');
  declareWar(s, P, B);
  assert.ok(relation(s, A, B).war, 'the vassal marches with its liege');
  makePeace(s, P, B);
  assert.ok(!relation(s, A, B).war, 'and makes peace with it');
  // Eliminate B and C: with A a vassal, the player has conquered the Marches.
  for (const id of [B, C]) {
    s.factions[id].alive = false;
    for (const c of citiesOf(s, id)) c.owner = -1;
  }
  checkVictory(s);
  assert.equal(s.winner?.id, P);
  assert.equal(s.winner?.reason, 'conquest');
  assert.equal(typeof releaseVassal(s, P, A), 'object');
});

test('gifts warm a court; old saves gain diplomacy fields', () => {
  const s = fresh();
  const P = s.playerId;
  const X = (P + 1) % 4;
  s.factions[P].gold = 50;
  const before = opinionOf(s, X, P);
  assert.equal(typeof sendGift(s, P, X, 10), 'object');
  assert.ok(opinionOf(s, X, P) > before);
  const old = JSON.parse(JSON.stringify(s));
  delete old.memory;
  for (const r of Object.values(old.relations)) { delete r.pact; delete r.alliance; delete r.trade; }
  for (const f of old.factions) delete f.overlord;
  ensureDiplomacy(old);
  assert.equal(old.factions[X].overlord, null);
  assert.equal(relation(old, P, X).alliance, false);
  assert.equal(relation(s, P, P).war, false, 'a house is never at war with itself');
});

test('computer houses sign treaties among themselves over a long game', () => {
  let treaties = 0;
  for (const seed of ['t1', 't2', 't3', 't4']) {
    const s = newGame({ seed });
    beginTurn(s, currentFaction(s));
    let steps = 0;
    while (!s.winner && steps++ < 4000) {
      for (const r of aiTurn(s, currentFaction(s))) assert.equal(typeof r, 'object');
      pruneEvents(s);
      while (s.pendingEvents.length) {
        const v = eventView(s, s.pendingEvents[0]);
        resolveEvent(s, Math.max(0, v.options.findIndex((o) => o.ok)));
        pruneEvents(s);
      }
      endTurn(s);
    }
    assert.ok(s.winner, `game ${seed} ends`);
    treaties += s.log.filter((l) => l.text.includes('🤝')).length;
    for (const f of s.factions) if (f.overlord != null) assert.ok(s.factions[f.overlord].overlord == null, 'no vassal has vassals');
  }
  assert.ok(treaties > 4, `expected some treaties, saw ${treaties}`);
});
