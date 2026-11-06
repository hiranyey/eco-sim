// Deterministic RNG (mulberry32). The generator state lives on the game
// state object (`s.rng`) so saves and replays are reproducible.

export function rand(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
export const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
export const chance = (s, p) => rand(s) < p;

export function weightedPick(s, items, weightFn) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  if (total <= 0) return null;
  let roll = rand(s) * total;
  for (const it of items) {
    roll -= Math.max(0, weightFn(it));
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

export function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
