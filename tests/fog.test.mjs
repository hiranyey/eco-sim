import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, addUnit } from '../js/world.js';
import { beginTurn, currentFaction, reachable, pathTo, moveUnit, attackTargets, relation, unitAt } from '../js/rules.js';
import { vision, unitSeen, reveal, explored, knownOwner } from '../js/fog.js';
import { neighbors, distance } from '../js/hex.js';
import { W, H, TERRAIN } from '../js/data.js';

function fresh(seed = 'fog', fog = true) {
  const s = newGame({ seed, fog });
  beginTurn(s, currentFaction(s));
  return s;
}
const free = (s, t) => TERRAIN[s.tiles[t].t].pass && !unitAt(s, t);

test('the player sees only near their troops and towns, and explored land stays explored', () => {
  const s = fresh();
  const P = s.playerId;
  const vis = vision(s, P);
  for (const u of s.units) if (u.owner === P) assert.ok(vis.tiles.has(u.tile));
  const far = s.units.filter((u) => u.owner !== P && !vis.tiles.has(u.tile));
  assert.ok(far.length > 0, 'distant rivals start hidden');
  for (const u of far) assert.equal(unitSeen(s, P, u, vis), false);
  const before = s.fog.explored.filter(Boolean).length;
  assert.ok(before > 0 && before < W * H);
  // March a unit away: the old ground stays explored.
  const mine = s.units.find((u) => u.owner === P && u.type !== 'ruler');
  const dest = [...reachable(s, mine).keys()].sort((a, b) => distance(W, b, mine.tile) - distance(W, a, mine.tile))[0];
  moveUnit(s, mine.id, dest);
  reveal(s);
  assert.ok(s.fog.explored.filter(Boolean).length >= before);
});

test('rival towns are remembered as last seen', () => {
  const s = fresh();
  const P = s.playerId;
  reveal(s);
  const vis = vision(s, P);
  const hidden = s.cities.find((c) => !vis.tiles.has(c.tile));
  assert.ok(hidden);
  s.fog.explored[hidden.tile] = 1;
  s.fog.known[hidden.id] = { owner: -1, level: 1 };
  hidden.owner = (P + 1) % 4;
  assert.equal(knownOwner(s, hidden, vis), -1, 'out of sight: still the old owner');
  assert.equal(explored(s, hidden.tile), true);
});

test('forest hides troops except from next door; archers cannot shoot what they cannot see', () => {
  for (const seed of ['fog', 'f2', 'f3', 'f4', 'f5', 'f6']) {
    const s = fresh(seed);
    const P = s.playerId;
    const E = (P + 1) % 4;
    relation(s, P, E).war = true;
    const archer = addUnit(s, 'archer', P, s.units.find((u) => u.owner === P && u.type !== 'ruler').tile);
    s.units = s.units.filter((u) => u !== archer);
    // Find a free hex with a forest exactly two hexes away that nothing of ours stands next to.
    let spot = null;
    let wood = null;
    for (let t = 0; t < W * H && spot == null; t++) {
      if (!free(s, t)) continue;
      for (let x = 0; x < W * H; x++) {
        if (s.tiles[x].t !== 'forest' || !free(s, x) || distance(W, t, x) !== 2) continue;
        if (s.units.some((u) => u.owner === P && distance(W, u.tile, x) <= 1)) continue;
        if (s.cities.some((c) => c.owner === P && distance(W, c.tile, x) <= 1)) continue;
        spot = t; wood = x; break;
      }
    }
    if (spot == null) continue;
    archer.tile = spot;
    archer.moved = false;
    archer.attacked = false;
    s.units.push(archer);
    const foe = addUnit(s, 'spear', E, wood);
    assert.equal(unitSeen(s, P, foe), false, 'hidden in the trees');
    assert.ok(!attackTargets(s, archer).includes(foe));
    foe.tile = neighbors(W, H, spot).find((n) => free(s, n));
    if (foe.tile == null) continue;
    assert.equal(unitSeen(s, P, foe), true, 'next door, nothing hides');
    return;
  }
  assert.fail('no test map with a suitable forest');
});

test('a march into hidden enemies halts in an ambush', () => {
  for (const seed of ['amb1', 'amb2', 'amb3', 'amb4', 'amb5', 'amb6', 'amb7', 'amb8']) {
    const s = fresh(seed);
    const P = s.playerId;
    const E = (P + 1) % 4;
    relation(s, P, E).war = true;
    const u = s.units.find((x) => x.owner === P && x.type !== 'ruler');
    u.type = 'cavalry';
    u.moved = false;
    const reach = reachable(s, u);
    for (const dest of reach.keys()) {
      const path = pathTo(reach, u.tile, dest);
      if (path.length < 2) continue;
      const step = path[0];
      // A forest beside the first step, out of sight, off the path.
      const x = neighbors(W, H, step).find((n) => s.tiles[n].t === 'forest' && free(s, n) && !path.includes(n) && n !== u.tile
        && !s.units.some((v) => v.owner === P && distance(W, v.tile, n) <= 1) && !s.cities.some((c) => c.owner === P && distance(W, c.tile, n) <= 1));
      if (x == null) continue;
      const foe = addUnit(s, 'spear', E, x);
      if (unitSeen(s, P, foe) || !reachable(s, u).has(dest)) { s.units = s.units.filter((v) => v !== foe); continue; }
      const res = moveUnit(s, u.id, dest);
      assert.equal(typeof res, 'object');
      assert.equal(res.ambush, 'spotted');
      assert.equal(u.tile, step, 'halted where the enemy was found');
      assert.equal(unitSeen(s, P, foe), true);
      return;
    }
  }
  assert.fail('no test map produced an ambush');
});

test('allies share sight; with fog off everything is seen', () => {
  const s = fresh();
  const P = s.playerId;
  const A = (P + 1) % 4;
  const theirs = s.units.find((u) => u.owner === A);
  const before = vision(s, P).tiles.has(theirs.tile);
  relation(s, P, A).alliance = true;
  assert.equal(vision(s, P).tiles.has(theirs.tile), true);
  assert.equal(before, false);
  const open = fresh('fog', false);
  for (const u of open.units) assert.equal(unitSeen(open, open.playerId, u), true);
});
