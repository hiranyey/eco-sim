// Fog of war, for the human player. DOM-free so it runs in Node tests.
//
// Each unit sees a few hexes around it (cavalry further, anyone on hills one more); towns watch the land
// around them. Allies and vassals share what they see. Ground once seen stays explored, and towns there
// are remembered as they were last seen. Units standing in forest can only be spotted from next door.
// Computer houses are not limited by fog.
import { W, H } from './data.js';
import { within } from './hex.js';

export const SIGHT = { militia: 2, spear: 2, archer: 2, cavalry: 3, knight: 2, catapult: 1, ruler: 2 };

export const fogOn = (s) => !!s.fog?.on;

export function newFog(on = true) {
  return { on, explored: new Array(W * H).fill(0), known: {} };
}

// Houses whose eyes this house can use: itself, its allies, its liege and its vassals.
export function sightSharers(s, fid) {
  const out = [fid];
  for (const f of s.factions) {
    if (!f.alive || f.id === fid) continue;
    const key = fid < f.id ? `${fid}-${f.id}` : `${f.id}-${fid}`;
    const r = s.relations[key];
    if (r?.alliance || f.overlord === fid || s.factions[fid].overlord === f.id) out.push(f.id);
  }
  return out;
}

export function sightOf(s, u) {
  return (SIGHT[u.type] ?? 2) + (s.tiles[u.tile].t === 'hills' ? 1 : 0);
}

// { tiles: hexes in view, close: hexes right next to an observer (where forest hides nothing) }
export function vision(s, fid) {
  const tiles = new Set();
  const close = new Set();
  const eyes = new Set(sightSharers(s, fid));
  for (const u of s.units) {
    if (!eyes.has(u.owner)) continue;
    for (const t of within(W, H, u.tile, sightOf(s, u))) tiles.add(t);
    for (const t of within(W, H, u.tile, 1)) close.add(t);
  }
  for (const c of s.cities) {
    if (!eyes.has(c.owner)) continue;
    for (const t of within(W, H, c.tile, c.capital ? 3 : 2)) tiles.add(t);
    for (const t of within(W, H, c.tile, 1)) close.add(t);
  }
  return { tiles, close, eyes };
}

// Can house fid see this unit right now?
export function unitSeen(s, fid, u, vis = null) {
  if (!fogOn(s) || fid !== s.playerId) return true;
  vis ??= vision(s, fid);
  if (vis.eyes.has(u.owner)) return true;
  if (!vis.tiles.has(u.tile)) return false;
  if (s.tiles[u.tile].t === 'forest' && !vis.close.has(u.tile)) return false;
  return true;
}

// The player's view, refreshed: marks ground explored and remembers towns as they look now.
export function reveal(s) {
  if (!fogOn(s)) return null;
  const vis = vision(s, s.playerId);
  const ex = s.fog.explored;
  for (const t of vis.tiles) ex[t] = 1;
  for (const c of s.cities) {
    if (vis.tiles.has(c.tile)) s.fog.known[c.id] = { owner: c.owner, level: c.level };
  }
  return vis;
}

export const explored = (s, t) => !fogOn(s) || !!s.fog.explored[t];

// The owner of a town as the player knows it (last seen, if it is out of view).
export function knownOwner(s, c, vis) {
  if (!fogOn(s) || vis?.tiles.has(c.tile)) return c.owner;
  return s.fog.known[c.id]?.owner ?? c.owner;
}
