import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, addUnit } from '../js/world.js';
import {
  beginTurn, endTurn, currentFaction, reachable, combatPreview, attack, moveUnit, recruit, trade, quote, unitAt, cityAt,
  declareWar, offerPeace, relation, citiesOf, income,
} from '../js/rules.js';
import { aiTurn } from '../js/ai.js';
import { resolveEvent, eventView } from '../js/events.js';
import { W, H, TERRAIN, RENOWN_TO_WIN, TURN_LIMIT } from '../js/data.js';
import { neighbors, distance } from '../js/hex.js';

function playOut(seed, playerFaction = 0) {
  const s = newGame({ seed, playerFaction });
  beginTurn(s, currentFaction(s));
  let steps = 0;
  while (!s.winner && steps++ < 4000) {
    for (const r of aiTurn(s, currentFaction(s))) assert.equal(typeof r, 'object');
    while (s.pendingEvents.length) {
      const v = eventView(s, s.pendingEvents[0]);
      resolveEvent(s, Math.max(0, v.options.findIndex((o) => o.ok)));
    }
    endTurn(s);
  }
  return s;
}

function sane(s) {
  const tiles = new Set();
  for (const u of s.units) {
    assert.ok(!tiles.has(u.tile), 'two units share a hex');
    tiles.add(u.tile);
    assert.ok(TERRAIN[s.tiles[u.tile].t].pass, 'unit on impassable terrain');
    assert.ok(u.hp > 0, 'dead unit left on the map');
  }
  for (const f of s.factions) {
    for (const k of ['gold', 'grain', 'timber', 'iron', 'renown']) assert.ok(Number.isFinite(f[k]) && f[k] >= 0, `${f.short} ${k}=${f[k]}`);
    if (f.alive) assert.ok(citiesOf(s, f.id).length > 0, 'alive house without towns');
    assert.ok(s.units.filter((u) => u.owner === f.id && u.type === 'ruler').length <= 1, 'more than one ruler on the map');
  }
}

test('maps are deterministic and well-formed', () => {
  for (const seed of ['one', 'two', 'three', 'four', 'five']) {
    const a = newGame({ seed });
    assert.equal(JSON.stringify(a), JSON.stringify(newGame({ seed })));
    assert.equal(a.cities.filter((c) => c.capital).length, 4);
    assert.equal(a.tiles.filter((t) => t.shrine).length, 3);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(distance(W, a.cities[i].tile, a.cities[j].tile) >= 4);
    sane(a);
  }
});

test('combat preview matches the real result', () => {
  const s = newGame({ seed: 'combat' });
  beginTurn(s, currentFaction(s));
  const cap = s.cities[s.playerId].tile;
  const spot = neighbors(W, H, cap).find((n) => TERRAIN[s.tiles[n].t].pass && !unitAt(s, n));
  const enemyTile = neighbors(W, H, spot).find((n) => TERRAIN[s.tiles[n].t].pass && !unitAt(s, n) && !cityAt(s, n));
  const me = s.units.find((u) => u.owner === s.playerId && u.type !== 'ruler');
  me.tile = spot;
  me.moved = false;
  me.attacked = false;
  const foe = addUnit(s, 'militia', -1, enemyTile);
  const p = combatPreview(s, me, foe);
  const hpFoe = foe.hp;
  const hpMe = me.hp;
  const r = attack(s, me.id, foe.id);
  assert.equal(r.dmg, p.dmg);
  assert.equal(r.ret, p.ret);
  if (!r.killed) assert.equal(foe.hp, hpFoe - p.dmg);
  if (!r.died && !r.killed) assert.equal(me.hp, hpMe - p.ret);
});

test('movement respects terrain and other units', () => {
  const s = newGame({ seed: 'move' });
  beginTurn(s, currentFaction(s));
  for (const u of s.units.filter((x) => x.owner === s.playerId)) {
    for (const t of reachable(s, u).keys()) {
      assert.ok(TERRAIN[s.tiles[t].t].pass);
      assert.equal(unitAt(s, t), null);
    }
  }
  const u = s.units.find((x) => x.owner === s.playerId && x.type !== 'ruler');
  const dest = [...reachable(s, u).keys()][0];
  const r = moveUnit(s, u.id, dest);
  assert.equal(typeof r, 'object');
  assert.equal(u.tile, dest);
  assert.equal(reachable(s, u).size, 0, 'cannot move twice');
});

test('recruiting, trading and income', () => {
  const s = newGame({ seed: 'econ' });
  beginTurn(s, currentFaction(s));
  const f = s.factions[s.playerId];
  const cap = s.cities[s.playerId];
  const ruler = unitAt(s, cap.tile);
  if (ruler) ruler.tile = neighbors(W, H, cap.tile).find((n) => TERRAIN[s.tiles[n].t].pass && !unitAt(s, n));
  f.gold = 50;
  assert.equal(typeof recruit(s, s.playerId, cap.id, 'militia'), 'object');
  assert.equal(typeof recruit(s, s.playerId, cap.id, 'militia'), 'string', 'one recruit per turn without barracks');
  const q = quote(s, s.playerId, 'iron', 3, 'buy');
  const before = f.gold;
  trade(s, s.playerId, 'iron', 3, 'buy');
  assert.equal(f.gold, before - q.total);
  assert.ok(s.market.iron > 4, 'buying raises the price');
  const inc = income(s, s.playerId);
  assert.ok(inc.gold > 0);
});

test('war and peace', () => {
  const s = newGame({ seed: 'diplo' });
  beginTurn(s, currentFaction(s));
  const other = (s.playerId + 1) % 4;
  assert.equal(typeof declareWar(s, s.playerId, other), 'object');
  assert.ok(relation(s, s.playerId, other).war);
  s.factions[s.playerId].gold = 500;
  for (const u of s.units) if (u.owner === other) u.hp = 1;
  assert.equal(typeof offerPeace(s, s.playerId, other, 50), 'object');
  assert.ok(!relation(s, s.playerId, other).war);
  assert.equal(typeof declareWar(s, s.playerId, other), 'string', 'truce blocks war');
});

for (const seed of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) {
  test(`full AI game ends cleanly (${seed})`, () => {
    const s = playOut(seed, ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].indexOf(seed) % 4);
    assert.ok(s.winner, 'someone wins');
    assert.ok(s.turn <= TURN_LIMIT + 1);
    const w = s.factions[s.winner.id];
    if (s.winner.reason === 'renown') assert.ok(w.renown >= RENOWN_TO_WIN);
    sane(s);
    const copy = JSON.parse(JSON.stringify(s));
    assert.deepEqual(copy, s);
  });
}
