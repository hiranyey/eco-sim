// Procedural terrain painter. Renders the static map once into a raster image that looks
// like a painted chart: blended biomes, hill shading, organic coastlines with surf, forests,
// mountains, farmland around towns and dirt roads between them.
import { center, mapSize, neighbors, HEX, PAD } from '../hex.js';

const SQ3 = Math.sqrt(3);

// ---------- seeded noise ----------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return s / (1 - 0.5 ** oct);
}
const rnd = (i, k, seed) => hash2(i, k, seed + 991);

// ---------- palette ----------
const BASE = {
  plains: [164, 181, 96],
  forest: [92, 128, 64],
  hills: [184, 162, 104],
  mountain: [146, 138, 126],
  water: [70, 120, 150],
};
const HEIGHT = { water: -0.3, plains: 0.12, forest: 0.22, hills: 0.55, mountain: 1.05 };
const DEEP = [30, 70, 104];
const SHALLOW = [78, 140, 166];
const SAND = [222, 205, 150];
const FOAM = [236, 244, 240];

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function seedOf(s) {
  let h = 2166136261;
  for (const ch of String(s.seed ?? 'x')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 100000;
}

// ---------- main entry ----------
const cache = new Map();

export function paintTerrain(s, scale = 2) {
  const key = `${s.W}x${s.H}:${s.tiles.map((t) => t.t[0]).join('')}:${s.cities.map((c) => c.tile).join(',')}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  const [mw, mh] = mapSize(s.W, s.H);
  const W = Math.ceil(mw);
  const H = Math.ceil(mh);
  const seed = seedOf(s);

  // Field pass at 1 unit per pixel: blended land, height and colour.
  const field = paintField(s, W, H, seed);
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  small.getContext('2d').putImageData(field, 0, 0);

  const cv = document.createElement('canvas');
  cv.width = Math.round(W * scale);
  cv.height = Math.round(H * scale);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, cv.width, cv.height);
  ctx.scale(scale, scale);

  drawDetails(ctx, s, seed);

  // Gentle vignette so the map sits in the frame.
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(8,14,24,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const url = cv.toDataURL('image/jpeg', 0.9);
  const out = { url, width: W, height: H };
  cache.set(key, out);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return out;
}

function tileAt(s, col, row) {
  if (col < 0 || row < 0 || col >= s.W || row >= s.H) return null;
  return s.tiles[row * s.W + col];
}

function paintField(s, W, H, seed) {
  const n = W * H;
  const land = new Float32Array(n);
  const hgt = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const sigma = HEX * 0.4;
  const inv = 1 / (2 * sigma * sigma);
  const rowH = HEX * 1.5;
  const colW = HEX * SQ3;
  for (let py = 0; py < H; py++) {
    const r0 = Math.round((py - PAD - HEX) / rowH);
    for (let px = 0; px < W; px++) {
      let ws = 0;
      let l = 0;
      let h = 0;
      let cr = 0;
      let cg = 0;
      let cb = 0;
      for (let row = r0 - 1; row <= r0 + 1; row++) {
        const off = row & 1 ? colW / 2 : 0;
        const c0 = Math.round((px - PAD - colW / 2 - off) / colW);
        for (let c = c0 - 1; c <= c0 + 1; c++) {
          const cx = PAD + colW * (c + 0.5 * (row & 1)) + colW / 2;
          const cy = PAD + rowH * row + HEX;
          const d2 = (cx - px) ** 2 + (cy - py) ** 2;
          if (d2 > 4 * HEX * HEX) continue;
          const w = Math.exp(-d2 * inv);
          const t = tileAt(s, c, row);
          const kind = t ? t.t : 'water';
          const base = BASE[kind];
          ws += w;
          if (kind !== 'water') l += w;
          h += w * HEIGHT[kind];
          cr += w * base[0];
          cg += w * base[1];
          cb += w * base[2];
        }
      }
      const i = py * W + px;
      if (ws === 0) { land[i] = 0; hgt[i] = -0.3; col.set(DEEP, i * 3); continue; }
      land[i] = l / ws;
      hgt[i] = h / ws;
      col[i * 3] = cr / ws;
      col[i * 3 + 1] = cg / ws;
      col[i * 3 + 2] = cb / ws;
    }
  }

  const img = new ImageData(W, H);
  const d = img.data;
  const lx = -0.62;
  const ly = -0.78;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const warp = (fbm(px / 26, py / 26, seed, 3) - 0.5) * 0.36 + (vnoise(px / 7, py / 7, seed + 5) - 0.5) * 0.08;
      const L = land[i] + warp;
      let c;
      if (L < 0.5) {
        // Water: deeper away from the shore, with soft swell bands.
        const depth = smooth(0.5, 0.05, L);
        c = mix(SHALLOW, DEEP, depth);
        const swell = fbm(px / 40 + py / 90, py / 18, seed + 3, 3);
        c = mix(c, [120, 170, 190], clamp((swell - 0.55) * 0.9) * (1 - depth * 0.6));
        const surf = smooth(0.4, 0.49, L);
        c = mix(c, FOAM, surf * 0.75);
        const ring = smooth(0.3, 0.36, L) * (1 - smooth(0.36, 0.42, L));
        c = mix(c, [150, 196, 206], ring * 0.35);
      } else {
        c = [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]];
        // Painterly variation: meadows, dry patches, fine grain.
        const m = fbm(px / 34, py / 34, seed + 11, 4);
        const fine = vnoise(px / 3.2, py / 3.2, seed + 13);
        c = mix(c, [196, 190, 112], clamp((m - 0.55) * 1.6) * 0.45);
        c = mix(c, [112, 150, 74], clamp((0.45 - m) * 1.6) * 0.4);
        const k = 0.94 + fine * 0.12;
        c = [c[0] * k, c[1] * k, c[2] * k];
        // Hill shading from the blended height field.
        const xl = px > 0 ? hgt[i - 1] : hgt[i];
        const xr = px < W - 1 ? hgt[i + 1] : hgt[i];
        const yu = py > 0 ? hgt[i - W] : hgt[i];
        const yd = py < H - 1 ? hgt[i + W] : hgt[i];
        const gx = (xr - xl) * 22;
        const gy = (yd - yu) * 22;
        const shade = clamp(1 - (gx * lx + gy * ly) * 1.1 - Math.hypot(gx, gy) * 0.15, 0.6, 1.3);
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
        // Beaches
        const beach = 1 - smooth(0.5, 0.56, L);
        c = mix(c, SAND, beach * 0.85);
      }
      const j = i * 4;
      d[j] = c[0];
      d[j + 1] = c[1];
      d[j + 2] = c[2];
      d[j + 3] = 255;
    }
  }
  return img;
}

// ---------- hand-placed details ----------
function inHex(dx, dy, r) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ay <= r && ax * SQ3 / 2 + ay / 2 <= r * SQ3 / 2 && ax <= r * SQ3 / 2;
}

function drawDetails(ctx, s, seed) {
  const sprites = [];
  const farm = [];
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i].t;
    const [cx, cy] = center(s.W, i);
    if (t === 'forest') forestTile(sprites, s, i, cx, cy, seed);
    else if (t === 'hills') hillTile(sprites, i, cx, cy, seed);
    else if (t === 'mountain') mountainTile(sprites, i, cx, cy, seed);
    else if (t === 'plains') {
      if (s.tiles[i].city >= 0 && s.cities[s.tiles[i].city].tile !== i) farm.push([i, cx, cy]);
      plainsTile(sprites, s, i, cx, cy, seed);
    } else if (t === 'water') waterTile(ctx, i, cx, cy, seed);
  }
  for (const [i, cx, cy] of farm) fields(ctx, i, cx, cy, seed);
  roads(ctx, s);
  for (const c of s.cities) {
    const [cx, cy] = center(s.W, c.tile);
    const g = ctx.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, 24);
    g.addColorStop(0, 'rgba(176,150,104,0.85)');
    g.addColorStop(1, 'rgba(176,150,104,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 26, 17, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  sprites.sort((a, b) => a.y - b.y);
  for (const sp of sprites) if (sp.shadow) sp.shadow(ctx);
  for (const sp of sprites) sp.draw(ctx);
}

function tree(sprites, x, y, sz, conifer, tint) {
  sprites.push({
    y,
    shadow: (ctx) => {
      ctx.fillStyle = 'rgba(20,30,10,0.32)';
      ctx.beginPath();
      ctx.ellipse(x + sz * 0.5, y + 0.6, sz * 0.95, sz * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    draw: (ctx) => {
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(x - 0.6, y - sz * 0.5, 1.2, sz * 0.55);
      if (conifer) {
        const dark = mix([34, 74, 46], tint, 0.15);
        const lite = mix([70, 118, 64], tint, 0.15);
        for (let k = 0; k < 2; k++) {
          const top = y - sz * (2.1 - k * 0.6);
          const base = y - sz * (0.35 + (1 - k) * 0.45);
          const w = sz * (0.62 + k * 0.22);
          ctx.fillStyle = rgb(dark);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x + w, base);
          ctx.lineTo(x - w, base);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = rgb(lite);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, base);
          ctx.lineTo(x - w, base);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        const r = sz * 0.78;
        const cy = y - sz * 0.95;
        ctx.fillStyle = rgb(mix([40, 82, 40], tint, 0.2));
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, Math.PI * 2);
        ctx.arc(x + r * 0.55, cy + r * 0.3, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgb(mix([76, 126, 58], tint, 0.2));
        ctx.beginPath();
        ctx.arc(x - r * 0.22, cy - r * 0.22, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(190,220,120,0.55)';
        ctx.beginPath();
        ctx.arc(x - r * 0.42, cy - r * 0.45, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });
}

function forestTile(sprites, s, i, cx, cy, seed) {
  const step = 8.2;
  let k = 0;
  for (let gy = -HEX; gy <= HEX; gy += step * 0.86) {
    for (let gx = -HEX; gx <= HEX; gx += step) {
      k++;
      const x = gx + (rnd(i, k, seed) - 0.5) * step * 0.9 + ((Math.round(gy / step) & 1) ? step / 2 : 0);
      const y = gy + (rnd(i, k + 400, seed) - 0.5) * step * 0.7;
      if (!inHex(x, y + 3, HEX * 0.84)) continue;
      if (rnd(i, k + 800, seed) < 0.12) continue;
      const sz = 4.2 + rnd(i, k + 1200, seed) * 2.2;
      const tint = [rnd(i, k + 2, seed) * 80, 60 + rnd(i, k + 3, seed) * 60, 20];
      tree(sprites, cx + x, cy + y + 4, sz, rnd(i, k + 1600, seed) < 0.45, tint);
    }
  }
  void s;
}

function plainsTile(sprites, s, i, cx, cy, seed) {
  // Stray trees where plains meet a forest.
  for (const n of neighbors(s.W, s.H, i)) {
    if (s.tiles[n].t !== 'forest') continue;
    const [nx, ny] = center(s.W, n);
    const count = 1 + Math.floor(rnd(i, n, seed) * 2);
    for (let k = 0; k < count; k++) {
      const t = 0.42 + rnd(i, n * 7 + k, seed) * 0.12;
      const side = (rnd(i, n * 13 + k, seed) - 0.5) * 22;
      const dx = (nx - cx) / HEX / SQ3;
      const dy = (ny - cy) / HEX / SQ3;
      tree(sprites, cx + (nx - cx) * t - dy * side, cy + (ny - cy) * t + dx * side + 3, 3.6 + rnd(i, k + 50, seed) * 1.6, rnd(i, k + 60, seed) < 0.4, [40, 90, 20]);
    }
  }
  // Grass tufts and wild flowers
  sprites.push({
    y: cy - HEX,
    draw: (ctx) => {
      ctx.lineCap = 'round';
      for (let k = 0; k < 9; k++) {
        const x = cx + (rnd(i, k + 30, seed) - 0.5) * HEX * 1.4;
        const y = cy + (rnd(i, k + 60, seed) - 0.5) * HEX * 1.2;
        if (!inHex(x - cx, y - cy, HEX * 0.85)) continue;
        ctx.strokeStyle = 'rgba(70,100,40,0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.4, y - 3.2);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.2, y - 3.8);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1.6, y - 3);
        ctx.stroke();
      }
      for (let k = 0; k < 5; k++) {
        const x = cx + (rnd(i, k + 90, seed) - 0.5) * HEX * 1.3;
        const y = cy + (rnd(i, k + 120, seed) - 0.5) * HEX * 1.1;
        if (!inHex(x - cx, y - cy, HEX * 0.8)) continue;
        const pal = ['#f4f0d8', '#f2d35a', '#e07a6a', '#c9a8e8'];
        ctx.fillStyle = pal[Math.floor(rnd(i, k + 150, seed) * pal.length)];
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });
}

function hillTile(sprites, i, cx, cy, seed) {
  const n = 2 + (rnd(i, 1, seed) < 0.5 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const x = cx + (k - (n - 1) / 2) * 17 + (rnd(i, k + 10, seed) - 0.5) * 6;
    const y = cy + (k % 2 ? 9 : -2) + (rnd(i, k + 20, seed) - 0.5) * 6;
    const w = 13 + rnd(i, k + 30, seed) * 5;
    const h = 9 + rnd(i, k + 40, seed) * 5;
    sprites.push({
      y,
      shadow: (ctx) => {
        ctx.fillStyle = 'rgba(60,40,10,0.25)';
        ctx.beginPath();
        ctx.ellipse(x + 4, y + 1, w * 1.05, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
      },
      draw: (ctx) => {
        const top = y - h * 1.05;
        const crest = x - w * 0.12;
        const mound = () => {
          ctx.beginPath();
          ctx.moveTo(x - w, y);
          ctx.bezierCurveTo(x - w * 0.62, y - h * 0.55, crest - w * 0.3, top, crest, top);
          ctx.bezierCurveTo(crest + w * 0.35, top, x + w * 0.62, y - h * 0.5, x + w, y);
          ctx.closePath();
        };
        const g = ctx.createLinearGradient(x - w, top, x + w * 0.6, y);
        g.addColorStop(0, '#c9c27a');
        g.addColorStop(0.5, '#a99a58');
        g.addColorStop(1, '#7c6a3a');
        ctx.fillStyle = g;
        mound();
        ctx.fill();
        // Shaded flank
        ctx.save();
        mound();
        ctx.clip();
        ctx.fillStyle = 'rgba(70,50,20,0.28)';
        ctx.beginPath();
        ctx.moveTo(crest, top);
        ctx.bezierCurveTo(crest + w * 0.1, y - h * 0.5, x + w * 0.1, y - h * 0.1, x + w * 0.2, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, top);
        ctx.closePath();
        ctx.fill();
        // Sunlit rim
        ctx.strokeStyle = 'rgba(255,248,200,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.7, y - h * 0.4);
        ctx.bezierCurveTo(x - w * 0.5, y - h * 0.8, crest - w * 0.2, top + 0.6, crest, top + 0.6);
        ctx.stroke();
        ctx.restore();
        mound();
        ctx.strokeStyle = 'rgba(70,52,22,0.7)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        // Scrub and stones
        for (let q = 0; q < 3; q++) {
          const tx = x - w * 0.55 + q * w * 0.5 + (rnd(i, q + k * 7, seed) - 0.5) * 4;
          const ty = y - 1.5 - rnd(i, q + k * 9, seed) * h * 0.35;
          ctx.fillStyle = 'rgba(74,104,44,0.85)';
          ctx.beginPath();
          ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
          ctx.arc(tx + 1.4, ty + 0.5, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#8d8578';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.45, y - 1.2, 1.8, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }
}

function mountainTile(sprites, i, cx, cy, seed) {
  const peaks = [[-9, 6, 15, 25], [9, 8, 13, 20], [0, -3, 16, 30]].map(([x, y, w, h], k) => [cx + x + (rnd(i, k, seed) - 0.5) * 5, cy + y + (rnd(i, k + 9, seed) - 0.5) * 3, w, h * (0.85 + rnd(i, k + 19, seed) * 0.3)]);
  peaks.sort((a, b) => a[1] - b[1]);
  for (const [x, y, w, h] of peaks) {
    const lean = (rnd(i, Math.round(x), seed) - 0.5) * w * 0.4;
    sprites.push({
      y,
      shadow: (ctx) => {
        ctx.fillStyle = 'rgba(30,25,20,0.3)';
        ctx.beginPath();
        ctx.ellipse(x + 6, y + 1, w * 1.1, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      },
      draw: (ctx) => {
        const tx = x + lean;
        const ty = y - h;
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#b3aa9b';
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.lineTo(tx - w * 0.2, ty + h * 0.35);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx + w * 0.05, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#6e665c';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + w * 0.35, ty + h * 0.4);
        ctx.lineTo(x + w, y);
        ctx.lineTo(tx + w * 0.05, y);
        ctx.closePath();
        ctx.fill();
        // Snow cap
        if (h > 20) {
          const sh = h * 0.32;
          ctx.fillStyle = '#f6f4ee';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + w * 0.28, ty + sh);
          ctx.lineTo(tx + w * 0.1, ty + sh * 0.8);
          ctx.lineTo(tx - w * 0.02, ty + sh * 1.05);
          ctx.lineTo(tx - w * 0.14, ty + sh * 0.75);
          ctx.lineTo(tx - w * 0.2, ty + sh * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(160,175,200,0.7)';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + w * 0.28, ty + sh);
          ctx.lineTo(tx + w * 0.1, ty + sh * 0.8);
          ctx.lineTo(tx + w * 0.02, ty + sh * 0.95);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(40,32,24,0.75)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.lineTo(tx - w * 0.2, ty + h * 0.35);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx + w * 0.35, ty + h * 0.4);
        ctx.lineTo(x + w, y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(40,32,24,0.35)';
        ctx.beginPath();
        ctx.moveTo(tx, ty + 2);
        ctx.lineTo(tx + w * 0.05, y - 2);
        ctx.stroke();
      },
    });
  }
}

function waterTile(ctx, i, cx, cy, seed) {
  ctx.strokeStyle = 'rgba(220,240,250,0.32)';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const x = cx + (rnd(i, k, seed) - 0.5) * 34;
    const y = cy + (rnd(i, k + 5, seed) - 0.5) * 30;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x - 2.5, y - 2.2, x, y);
    ctx.quadraticCurveTo(x + 2.5, y - 2.2, x + 5, y);
    ctx.stroke();
  }
}

function fields(ctx, i, cx, cy, seed) {
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k - Math.PI / 6;
    const r = HEX * 0.8;
    ctx[k ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.clip();
  const ang = (rnd(i, 3, seed) - 0.5) * 0.9;
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  const crops = [[214, 190, 108], [168, 184, 86], [150, 120, 80], [196, 170, 92], [136, 166, 78]];
  const cols = 3;
  const rows = 2;
  const fw = 17;
  const fh = 14;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd(i, r * 7 + c + 40, seed) < 0.3) continue;
      const x = (c - cols / 2) * fw + 1;
      const y = (r - rows / 2) * fh + 1;
      const crop = crops[Math.floor(rnd(i, r * 5 + c, seed) * crops.length)];
      ctx.fillStyle = rgb(crop, 0.85);
      ctx.fillRect(x, y, fw - 2, fh - 2);
      ctx.strokeStyle = rgb(mix(crop, [60, 50, 20], 0.35), 0.6);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let q = 2; q < fh - 2; q += 2.4) {
        ctx.moveTo(x + 1, y + q);
        ctx.lineTo(x + fw - 3, y + q);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function roads(ctx, s) {
  const pass = (i) => s.tiles[i].t !== 'water' && s.tiles[i].t !== 'mountain';
  const edges = new Set();
  const paths = [];
  for (const a of s.cities) {
    // BFS to the two nearest towns over passable ground.
    const prev = new Map([[a.tile, -1]]);
    const q = [a.tile];
    const found = [];
    while (q.length && found.length < 2) {
      const cur = q.shift();
      if (cur !== a.tile && s.tiles[cur].city >= 0 && s.cities[s.tiles[cur].city].tile === cur) {
        found.push(cur);
        continue;
      }
      for (const n of neighbors(s.W, s.H, cur)) {
        if (prev.has(n) || !pass(n)) continue;
        prev.set(n, cur);
        q.push(n);
      }
    }
    for (const b of found) {
      const k = a.tile < b ? `${a.tile}-${b}` : `${b}-${a.tile}`;
      if (edges.has(k)) continue;
      edges.add(k);
      const path = [b];
      let cur = b;
      while (prev.get(cur) !== -1) { cur = prev.get(cur); path.unshift(cur); }
      if (path.length <= 6) paths.push(path);
    }
  }
  const draw = (w, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of paths) {
      const pts = p.map((t) => center(s.W, t));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length - 1; k++) {
        const mx = (pts[k][0] + pts[k + 1][0]) / 2;
        const my = (pts[k][1] + pts[k + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }
  };
  draw(4.2, 'rgba(110,84,48,0.45)');
  draw(2.4, 'rgba(214,190,140,0.85)');
}
