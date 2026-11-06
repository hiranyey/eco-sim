// SVG game board: static terrain plus dynamic layers for territory, towns, units, highlights and effects.
import { center, corners, mapSize, neighborDir, HEX } from './hex.js';
import { TERRAIN, REBEL_COLOR } from './data.js';
import { maxHp } from './world.js';

const NS = 'http://www.w3.org/2000/svg';
const pts = (cs) => cs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (i, k = 0) => {
  let h = (i * 374761393 + k * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const ICONS = {
  militia: '<path d="M0,-7V7M-4.5,-7V-3.5Q-4.5,-1 0,-1Q4.5,-1 4.5,-3.5V-7" class="ic-stroke"/>',
  spear: '<path d="M-5,7L5,-5M-2,-1L1,2" class="ic-stroke"/><path d="M7,-7L2.5,-5.5L5.5,-2.5Z" class="ic-fill"/>',
  archer: '<path d="M-2,-7.5Q7,0 -2,7.5" class="ic-stroke"/><path d="M-2,-7.5V7.5" class="ic-thin"/><path d="M-7,0H5" class="ic-stroke"/><path d="M7,0L3.5,-2.5V2.5Z" class="ic-fill"/>',
  cavalry: '<path d="M-5,7L-5,1Q-6,-3 -2,-6L1,-8L1.5,-5.5Q6,-4.5 6.5,0L4.5,1.5L1.5,-0.5L1,2L3,7Z" class="ic-fill"/>',
  knight: '<path d="M-6,-6.5H6V0Q6,5.5 0,8Q-6,5.5 -6,0Z" class="ic-fill"/><path d="M0,-4.5V5M-3.5,-1H3.5" class="ic-cross"/>',
  catapult: '<circle cx="-3.5" cy="4.5" r="2.6" class="ic-stroke"/><circle cx="4" cy="4.5" r="2.6" class="ic-stroke"/><path d="M-6,1.5H7M-1,1.5L5,-7" class="ic-stroke"/><circle cx="5.5" cy="-7" r="2" class="ic-fill"/>',
  ruler: '<path d="M-7.5,5V-4L-3.5,0L0,-7L3.5,0L7.5,-4V5Z" class="ic-fill"/>',
};

export function createBoard(svg, handlers) {
  let s = null;
  const units = new Map();
  let layers = {};

  function el(tag, attrs = {}, parent = null) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  function build(state) {
    s = state;
    units.clear();
    const [w, h] = mapSize(s.W, s.H);
    svg.setAttribute('viewBox', `0 0 ${w.toFixed(0)} ${h.toFixed(0)}`);
    svg.innerHTML = `<defs>
      <radialGradient id="shrineGlow"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.95"/><stop offset="0.5" stop-color="#ffd35a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd35a" stop-opacity="0"/></radialGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity="0.55"/></filter>
    </defs>`;
    layers = {};
    for (const name of ['terrain', 'deco', 'tint', 'borders', 'hl', 'sites', 'path', 'units', 'rings', 'fx']) layers[name] = el('g', { class: `layer-${name}` }, svg);
    // Static terrain
    for (let i = 0; i < s.tiles.length; i++) {
      const [cx, cy] = center(s.W, i);
      const t = s.tiles[i].t;
      el('polygon', { points: pts(corners(cx, cy, HEX + 0.6)), class: `tile t-${t}`, fill: TERRAIN[t].color, 'data-tile': i }, layers.terrain);
      drawDeco(i, t, cx, cy);
    }
    svg.onclick = (e) => {
      const t = tileFromEvent(e);
      if (t != null) handlers.onTileClick(t, e);
    };
    svg.oncontextmenu = (e) => { e.preventDefault(); handlers.onCancel?.(); };
    svg.onmousemove = (e) => handlers.onTileHover(tileFromEvent(e), e);
    svg.onmouseleave = () => handlers.onTileHover(null, null);
  }

  function tileFromEvent(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < s.tiles.length; i++) {
      const [cx, cy] = center(s.W, i);
      const d = (cx - p.x) ** 2 + (cy - p.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return bd <= HEX * HEX ? best : null;
  }

  function drawDeco(i, t, cx, cy) {
    const g = layers.deco;
    if (t === 'forest') {
      for (let k = 0; k < 3; k++) {
        const x = cx + (hash(i, k) - 0.5) * 30;
        const y = cy + (hash(i, k + 7) - 0.5) * 22;
        el('path', { d: `M${x},${y - 9}L${x + 6},${y + 4}L${x - 6},${y + 4}Z`, class: 'tree' }, g);
        el('path', { d: `M${x},${y + 4}V${y + 7}`, class: 'trunk' }, g);
      }
    } else if (t === 'hills') {
      for (let k = 0; k < 2; k++) {
        const x = cx + (k ? 8 : -9) + (hash(i, k) - 0.5) * 6;
        const y = cy + (k ? 6 : -2);
        el('path', { d: `M${x - 10},${y + 3}Q${x},${y - 11} ${x + 10},${y + 3}`, class: 'hill' }, g);
      }
    } else if (t === 'mountain') {
      el('path', { d: `M${cx - 18},${cy + 12}L${cx - 4},${cy - 14}L${cx + 9},${cy + 12}Z`, class: 'peak' }, g);
      el('path', { d: `M${cx - 2},${cy + 12}L${cx + 9},${cy - 6}L${cx + 20},${cy + 12}Z`, class: 'peak2' }, g);
      el('path', { d: `M${cx - 4},${cy - 14}L${cx - 9},${cy - 5}L${cx - 4},${cy - 7}L${cx},${cy - 5}Z`, class: 'snow' }, g);
    } else if (t === 'water') {
      for (let k = 0; k < 2; k++) {
        const x = cx - 10 + hash(i, k) * 6;
        const y = cy - 6 + k * 11;
        el('path', { d: `M${x},${y}q4,-3 8,0t8,0`, class: 'wave' }, g);
      }
    } else if (t === 'plains') {
      for (let k = 0; k < 4; k++) {
        const x = cx + (hash(i, k) - 0.5) * 34;
        const y = cy + (hash(i, k + 3) - 0.5) * 26;
        el('path', { d: `M${x},${y}l-1.5,-4M${x},${y}l1.5,-4`, class: 'grass' }, g);
      }
    }
  }

  const colorOf = (owner) => (owner < 0 ? REBEL_COLOR : s.factions[owner].color);

  function render(ui) {
    if (!s) return;
    // Territory tint and borders
    layers.tint.innerHTML = '';
    layers.borders.innerHTML = '';
    const ownerOf = (i) => (s.tiles[i].city >= 0 ? s.cities[s.tiles[i].city].owner : null);
    for (let i = 0; i < s.tiles.length; i++) {
      const o = ownerOf(i);
      if (o == null) continue;
      const [cx, cy] = center(s.W, i);
      el('polygon', { points: pts(corners(cx, cy, HEX)), fill: colorOf(o), class: 'tint' }, layers.tint);
      const cs = corners(cx, cy, HEX - 2.2);
      for (let k = 0; k < 6; k++) {
        const n = neighborDir(s.W, s.H, i, k);
        if (n >= 0 && ownerOf(n) === o) continue;
        const [a, b] = [cs[k], cs[(k + 1) % 6]];
        el('path', { d: `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`, stroke: colorOf(o), class: 'border' }, layers.borders);
      }
    }
    // Towns and shrines
    layers.sites.innerHTML = '';
    s.tiles.forEach((t, i) => {
      if (!t.shrine) return;
      const [cx, cy] = center(s.W, i);
      const holder = s.units.find((u) => u.tile === i);
      el('circle', { cx, cy, r: 26, fill: 'url(#shrineGlow)', class: 'shrine-glow' }, layers.sites);
      el('path', { d: star(cx, cy - 1, 11, 4.5), class: `shrine${holder && holder.owner >= 0 ? ' held' : ''}`, style: holder && holder.owner >= 0 ? `--c:${colorOf(holder.owner)}` : '' }, layers.sites);
    });
    for (const c of s.cities) drawCity(c);
    // Highlights
    layers.hl.innerHTML = '';
    layers.rings.innerHTML = '';
    if (ui.danger) {
      for (const t of ui.danger) {
        const [cx, cy] = center(s.W, t);
        el('polygon', { points: pts(corners(cx, cy, HEX - 1)), class: 'danger' }, layers.hl);
      }
    }
    if (ui.reach) {
      for (const t of ui.reach.keys()) {
        const [cx, cy] = center(s.W, t);
        el('polygon', { points: pts(corners(cx, cy, HEX - 3)), class: 'reach' }, layers.hl);
        el('circle', { cx, cy, r: 4, class: 'reach-dot' }, layers.hl);
      }
    }
    if (ui.selectedTile != null) {
      const [cx, cy] = center(s.W, ui.selectedTile);
      el('polygon', { points: pts(corners(cx, cy, HEX - 2)), class: 'sel-tile' }, layers.hl);
    }
    for (const t of ui.targets ?? []) {
      const [cx, cy] = center(s.W, t.tile);
      el('circle', { cx, cy, r: 20, class: `target${ui.hoverTarget === t.id ? ' hot' : ''}` }, layers.rings);
    }
    renderUnits(ui);
  }

  function star(cx, cy, R, r) {
    let p = '';
    for (let k = 0; k < 10; k++) {
      const a = (Math.PI / 5) * k - Math.PI / 2;
      const rad = k % 2 ? r : R;
      p += `${k ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
    }
    return `${p}Z`;
  }

  function drawCity(c) {
    const [cx, cy] = center(s.W, c.tile);
    const g = el('g', { class: `town lvl${c.level}`, transform: `translate(${cx},${cy})`, style: `--c:${colorOf(c.owner)}` }, layers.sites);
    const towers = c.level === 1 ? [0] : c.level === 2 ? [-8, 8] : [-12, 0, 12];
    el('rect', { x: -15, y: 2, width: 30, height: 10, rx: 1.5, class: 'wall' }, g);
    for (const x of towers) {
      const tall = x === 0 || c.level === 2 ? 14 : 10;
      el('rect', { x: x - 4.5, y: 12 - tall - 8, width: 9, height: tall + 8, class: 'tower' }, g);
      el('path', { d: `M${x - 4.5},${12 - tall - 8}v-3h3v2h3v-2h3v3`, class: 'tower' }, g);
    }
    el('path', { d: `M${towers[towers.length >> 1]},${-14 - (c.level - 1) * 2}v-10l9,3.5l-9,3.5`, class: 'flag' }, g);
    if (c.capital) el('path', { d: star(-14, -14, 5, 2.2), class: 'capital' }, g);
    if (c.buildings.includes('cathedral')) el('path', { d: 'M13,-15v-8M10,-20h6', class: 'cathedral' }, g);
    const label = el('text', { x: 0, y: 25, class: 'town-name', 'text-anchor': 'middle' }, g);
    label.textContent = c.name;
  }

  function placeUnit(gEl, tile, instant = false) {
    const [x, y] = center(s.W, tile);
    if (instant) {
      gEl.style.transition = 'none';
      gEl.style.transform = `translate(${x}px, ${y}px)`;
      gEl.getBoundingClientRect();
      gEl.style.transition = '';
    } else gEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  function renderUnits(ui) {
    const alive = new Set();
    for (const u of s.units) {
      alive.add(u.id);
      let g = units.get(u.id);
      if (!g) {
        g = el('g', { class: 'unit spawn' }, layers.units);
        g.innerHTML = `<g class="tok" filter="url(#shadow)"><circle r="15.5" class="ring"/><circle r="13" class="body"/><g class="icon">${ICONS[u.type]}</g></g>
          <rect x="-12" y="15" width="24" height="4" rx="2" class="hpbg"/><rect x="-12" y="15" width="24" height="4" rx="2" class="hp"/><circle cx="11" cy="-11" r="3.6" class="ready"/><path d="M-11,-16l1.4,2.9 3.2,0.4-2.3,2.2 0.6,3.1-2.9-1.5-2.9,1.5 0.6-3.1-2.3-2.2 3.2-0.4z" class="vet"/>`;
        units.set(u.id, g);
        placeUnit(g, u.tile, true);
        setTimeout(() => g.classList.remove('spawn'), 400);
      }
      if (!g.dataset.anim) placeUnit(g, u.tile);
      g.style.setProperty('--c', colorOf(u.owner));
      const frac = Math.max(0, u.hp / maxHp(s, u.type, u.owner, u.vet));
      const hp = g.querySelector('.hp');
      hp.setAttribute('width', (24 * frac).toFixed(1));
      hp.setAttribute('class', `hp ${frac < 0.35 ? 'low' : frac < 0.7 ? 'mid' : ''}`);
      const mine = u.owner === s.playerId;
      const ready = mine && ui.myTurn && ((!u.moved) || (!u.attacked && ui.canAttackFn?.(u)));
      g.classList.toggle('is-ready', !!ready);
      g.classList.toggle('spent', mine && ui.myTurn && !ready);
      g.classList.toggle('selected', ui.selectedUnit === u.id);
      g.classList.toggle('rebel', u.owner < 0);
      g.classList.toggle('ruler', u.type === 'ruler');
      g.classList.toggle('veteran', !!u.vet);
    }
    for (const [id, g] of units) {
      if (!alive.has(id)) {
        units.delete(id);
        g.classList.add('dying');
        setTimeout(() => g.remove(), 350);
      }
    }
  }

  async function animateMove(uid, path, step = 110) {
    const g = units.get(uid);
    if (!g) return;
    g.dataset.anim = '1';
    g.style.setProperty('--step', `${step}ms`);
    for (const t of path) {
      placeUnit(g, t);
      await sleep(step);
    }
    delete g.dataset.anim;
  }

  async function animateAttack(res, speed = 1) {
    const g = units.get(res.uid);
    const tg = units.get(res.targetId);
    const [ax, ay] = center(s.W, res.from);
    const [tx, ty] = center(s.W, res.at);
    if (g) {
      g.dataset.anim = '1';
      g.style.setProperty('--step', `${90 * speed}ms`);
      g.style.transform = `translate(${ax + (tx - ax) * 0.35}px, ${ay + (ty - ay) * 0.35}px)`;
      await sleep(95 * speed);
      g.style.transform = `translate(${ax}px, ${ay}px)`;
    }
    if (tg) {
      tg.classList.add('hit');
      setTimeout(() => tg.classList.remove('hit'), 300);
    }
    float(res.at, `−${res.dmg}`, res.killed ? 'kill' : 'dmg');
    await sleep(160 * speed);
    if (res.ret > 0 && !res.killed) {
      if (g) { g.classList.add('hit'); setTimeout(() => g.classList.remove('hit'), 300); }
      float(res.from, `−${res.ret}`, res.died ? 'kill' : 'dmg');
      await sleep(140 * speed);
    }
    if (g) {
      delete g.dataset.anim;
      if (res.advanced) {
        await sleep(60 * speed);
        placeUnit(g, res.at);
        await sleep(110 * speed);
      }
    }
  }

  function float(tile, text, cls = '') {
    if (!s) return;
    const [x, y] = center(s.W, tile);
    const t = el('text', { x, y: y - 18, class: `float ${cls}`, 'text-anchor': 'middle' }, layers.fx);
    t.textContent = text;
    setTimeout(() => t.remove(), 1100);
  }

  function pulse(tile, cls = 'pulse') {
    const [cx, cy] = center(s.W, tile);
    const p = el('polygon', { points: pts(corners(cx, cy, HEX)), class: cls }, layers.fx);
    setTimeout(() => p.remove(), 900);
  }

  function showPath(path) {
    layers.path.innerHTML = '';
    if (!path || path.length < 2) return;
    const d = path.map((t, i) => {
      const [x, y] = center(s.W, t);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join('');
    el('path', { d, class: 'path' }, layers.path);
  }

  return { build, render, animateMove, animateAttack, float, pulse, showPath, tileCenter: (t) => center(s.W, t) };
}
