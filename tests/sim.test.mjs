import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, setPlayer } from '../src/world.js';
import { tick, rankings } from '../src/sim.js';
import { resolveEvent } from '../src/events.js';
import { GOOD_KEYS, provincesOf } from '../src/core.js';
import * as act from '../src/actions.js';

function finite(s) {
  for (const r of s.realms) {
    for (const k of ['treasury', 'legitimacy', 'prestige', 'regiments', 'manpower', 'research']) {
      assert.ok(Number.isFinite(r[k]), `realm ${r.id} ${k} = ${r[k]}`);
    }
    for (const g of GOOD_KEYS) assert.ok(Number.isFinite(r.market.price[g]), `price ${g}`);
  }
  for (const p of s.provinces) {
    assert.ok(Number.isFinite(p.pop) && p.pop > 0, `pop ${p.name}`);
    assert.ok(Number.isFinite(p.unrest), `unrest ${p.name}`);
  }
}

function runGame(seed, months, playerAuto = true) {
  const s = newGame(seed, 0);
  setPlayer(s, 0);
  if (playerAuto) for (const k of ['autoBuild', 'autoResearch', 'autoArmy']) s.realms[0][k] = true;
  for (let i = 0; i < months && !s.gameOver; i++) {
    tick(s);
    while (s.pendingEvents.length) resolveEvent(s, 0);
  }
  return s;
}

test('world generation is deterministic', () => {
  const a = newGame('alpha');
  const b = newGame('alpha');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.realms.length, 5);
  for (const r of a.realms) assert.ok(provincesOf(a, r.id).length >= 5, 'realm has provinces');
});

test('state survives a JSON round-trip', () => {
  const s = runGame('json', 24);
  const copy = JSON.parse(JSON.stringify(s));
  tick(copy);
  finite(copy);
});

for (const seed of ['alpha', 'beta', 'gamma', 'delta']) {
  test(`full 80-year game stays numerically sane (${seed})`, () => {
    const s = runGame(seed, 960);
    finite(s);
    assert.ok(s.gameOver, 'game should end');
    const rank = rankings(s);
    assert.equal(rank.length, 5);
  });
}

test('economy is roughly balanced at start', () => {
  const s = newGame('econ');
  for (const r of s.realms) {
    assert.ok(r.market.fill.grain > 0.8, `grain fill ${r.market.fill.grain}`);
    assert.ok(r.ledger.net > 0, `net income ${r.ledger.net}`);
  }
});

test('player actions work', () => {
  const s = newGame('actions');
  setPlayer(s, 0);
  const p = provincesOf(s, 0)[0];
  assert.equal(act.build(s, 0, p.id, 'farm'), null);
  assert.equal(p.construction.length, 1);
  assert.equal(act.setTax(s, 0, 'high'), null);
  assert.equal(act.setResearch(s, 0, 'crop_rotation'), null);
  assert.notEqual(act.setResearch(s, 0, 'steam'), null);
  const cands = act.candidates(s, 0, 'steward');
  assert.equal(cands.length, 3);
  s.realms[0].treasury = 5000;
  assert.equal(act.hire(s, 0, 'steward', cands[0].id), null);
  assert.equal(s.realms[0].council.steward, cands[0].id);
});

test('war can be declared and peace made', () => {
  const s = newGame('war');
  setPlayer(s, 0);
  s.month = 40;
  const target = s.realms.find((r) => r.id !== 0 && s.provinces.some((p) => p.owner === 0 && p.neighbors.some((n) => s.provinces[n].owner === r.id)));
  assert.equal(act.declareWar(s, 0, target.id), null);
  assert.equal(s.wars.length, 1);
  s.realms[0].regiments = 200;
  for (let i = 0; i < 24 && s.wars.length; i++) {
    tick(s);
    s.pendingEvents = s.pendingEvents.filter((e) => e.id !== 'peace_offer');
    while (s.pendingEvents.length) resolveEvent(s, 0);
  }
  const war = s.wars.find((w) => w.attackers.includes(0));
  if (war) {
    const before = provincesOf(s, 0).length;
    const res = act.offerPeace(s, 0, war.id, 'demand');
    if (res === null) assert.ok(provincesOf(s, 0).length > before);
  }
  finite(s);
});
