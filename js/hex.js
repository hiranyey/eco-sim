// Hex grid helpers. Tiles use "odd-r" offset coordinates and are stored as a flat index y * W + x.

const DIRS = {
  even: [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]],
  odd: [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]],
};

export function neighbors(W, H, idx) {
  const x = idx % W;
  const y = (idx - x) / W;
  const out = [];
  for (const [dx, dy] of DIRS[y & 1 ? 'odd' : 'even']) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx);
  }
  return out;
}

// Neighbour in a given edge direction (0=E,1=SE,2=SW,3=W,4=NW,5=NE) or -1.
export function neighborDir(W, H, idx, d) {
  const x = idx % W;
  const y = (idx - x) / W;
  const [dx, dy] = DIRS[y & 1 ? 'odd' : 'even'][d];
  const nx = x + dx;
  const ny = y + dy;
  return nx >= 0 && ny >= 0 && nx < W && ny < H ? ny * W + nx : -1;
}

function cube(W, idx) {
  const x = idx % W;
  const y = (idx - x) / W;
  const q = x - (y - (y & 1)) / 2;
  return [q, y, -q - y];
}

export function distance(W, a, b) {
  const [aq, ar, as] = cube(W, a);
  const [bq, br, bs] = cube(W, b);
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

export function within(W, H, idx, radius) {
  const out = [];
  const seen = new Set([idx]);
  let frontier = [idx];
  out.push(idx);
  for (let r = 0; r < radius; r++) {
    const next = [];
    for (const t of frontier) {
      for (const n of neighbors(W, H, t)) {
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

export const HEX = 34;
const SQ3 = Math.sqrt(3);
export const PAD = 6;

export function center(W, idx, size = HEX) {
  const x = idx % W;
  const y = (idx - x) / W;
  return [PAD + size * SQ3 * (x + 0.5 * (y & 1)) + (size * SQ3) / 2, PAD + size * 1.5 * y + size];
}

export function corners(cx, cy, size = HEX) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return out;
}

export function mapSize(W, H, size = HEX) {
  return [PAD * 2 + size * SQ3 * (W + 0.5), PAD * 2 + size * 1.5 * (H - 1) + size * 2];
}
