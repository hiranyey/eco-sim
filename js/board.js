// SVG game board: static terrain plus dynamic layers for territory, towns, units, highlights and effects.
import { center, corners, mapSize, neighborDir, HEX } from './hex.js';
import { REBEL_COLOR, UNITS } from './data.js';
import { maxHp } from './world.js';
import { paintTerrain } from './art/painter.js';
import { reveal, unitSeen, knownOwner } from './fog.js';
import { EMBLEM, townSprite, ribbon, shrineSprite, shade } from './art/sprites.js';

const NS = 'http://www.w3.org/2000/svg';
const pts = (cs) => cs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Unit emblems live in art/sprites.js; re-exported for the UI.
export const ICONS = EMBLEM;

export function createBoard(svg, handlers) {
  let s = null;
  const units = new Map();
  let layers = {};
  let hoverPoly = null;
  let fogKey = '';
  let vis = null; // what the player can see this frame (null: no fog)
  // Camera: the visible part of the map as an SVG viewBox.
  let full = [0, 0, 1, 1];
  let view = [0, 0, 1, 1];

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
    full = [0, 0, Math.round(w), Math.round(h)];
    view = [...full];
    applyView();
    const owners = [...s.factions.map((f) => [f.id, f.color]), [-1, REBEL_COLOR]];
    svg.innerHTML = `<defs>
      <radialGradient id="shrineGlow"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.9"/><stop offset="0.5" stop-color="#ffd35a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd35a" stop-opacity="0"/></radialGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0.6" dy="2" stdDeviation="1.4" flood-color="#0a0604" flood-opacity="0.6"/></filter>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
      <linearGradient id="rim-steel" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset="0.45" stop-color="#a7a39b"/><stop offset="1" stop-color="#3f3b36"/></linearGradient>
      <linearGradient id="rim-gold" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fff4c2"/><stop offset="0.45" stop-color="#e0aa3e"/><stop offset="1" stop-color="#6d4710"/></linearGradient>
      <linearGradient id="rim-sel" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe9a8"/></linearGradient>
      <radialGradient id="gloss" cx="0.35" cy="0.2" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></radialGradient>
      <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgb(200 40 25 / 0.14)"/><rect width="2.6" height="7" fill="rgb(230 60 40 / 0.42)"/></pattern>
      <pattern id="glint" width="60" height="44" patternUnits="userSpaceOnUse"><path d="M6,10q4,-2.6 8,0M30,30q5,-3 10,0M44,8q3,-2 6,0M14,36q3,-2 6,0" fill="none" stroke="rgb(235 248 255 / 0.55)" stroke-width="0.9" stroke-linecap="round"/></pattern>
      <radialGradient id="cloud"><stop offset="0" stop-color="#0a1420" stop-opacity="0.24"/><stop offset="0.6" stop-color="#0a1420" stop-opacity="0.1"/><stop offset="1" stop-color="#0a1420" stop-opacity="0"/></radialGradient>
      <filter id="fogBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4.5"/></filter>
      <radialGradient id="mist"><stop offset="0" stop-color="#3b4b60" stop-opacity="0.55"/><stop offset="1" stop-color="#3b4b60" stop-opacity="0"/></radialGradient>
      <pattern id="fogPat" width="150" height="110" patternUnits="userSpaceOnUse"><rect width="150" height="110" fill="#0d141e"/>
        <ellipse cx="30" cy="26" rx="42" ry="22" fill="url(#mist)"/><ellipse cx="112" cy="70" rx="50" ry="24" fill="url(#mist)"/><ellipse cx="60" cy="92" rx="34" ry="16" fill="url(#mist)"/><ellipse cx="140" cy="12" rx="30" ry="14" fill="url(#mist)"/>
        <path d="M8,60q14,-6 28,0t28,0M84,30q12,-5 24,0t24,0M96,100q10,-4 20,0" fill="none" stroke="#5a6a80" stroke-opacity="0.22" stroke-width="1.2" stroke-linecap="round"/></pattern>
      <radialGradient id="spark"><stop offset="0" stop-color="#fff8d8"/><stop offset="1" stop-color="#ffd35a" stop-opacity="0"/></radialGradient>
      ${owners.map(([id, c]) => `<radialGradient id="tok${id}" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="${shade(c, 0.28)}"/><stop offset="0.65" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.45)}"/></radialGradient>`).join('')}
      <clipPath id="waterClip">${s.tiles.map((t, i) => (t.t === 'water' ? `<polygon points="${pts(corners(...center(s.W, i), HEX + 1))}"/>` : '')).join('')}</clipPath>
      <clipPath id="mapClip"><rect x="3" y="3" width="${(w - 6).toFixed(0)}" height="${(h - 6).toFixed(0)}" rx="3"/></clipPath>
    </defs>`;
    layers = {};
    for (const name of ['terrain', 'water', 'grid', 'tint', 'borders', 'clouds', 'hl', 'sites', 'fog', 'marks', 'hover', 'path', 'units', 'rings', 'fx']) layers[name] = el('g', { class: `layer-${name}` }, svg);
    const art = paintTerrain(s);
    el('image', { href: art.url, x: 0, y: 0, width: art.width, height: art.height, preserveAspectRatio: 'none' }, layers.terrain);
    // Atmosphere: glints drifting over open water, cloud shadows drifting over everything.
    layers.water.setAttribute('clip-path', 'url(#waterClip)');
    el('rect', { x: -120, y: -60, width: art.width + 240, height: art.height + 120, fill: 'url(#glint)', class: 'glints' }, layers.water);
    el('rect', { x: -120, y: -60, width: art.width + 240, height: art.height + 120, fill: 'url(#glint)', class: 'glints two' }, layers.water);
    layers.clouds.setAttribute('clip-path', 'url(#mapClip)');
    layers.fog.setAttribute('clip-path', 'url(#mapClip)');
    fogKey = '';
    for (let k = 0; k < 5; k++) {
      const cy = (art.height * (k + 0.5)) / 5 + ((k * 37) % 40) - 20;
      const rx = 90 + ((k * 53) % 70);
      el('ellipse', { cx: -rx, cy, rx, ry: rx * 0.55, fill: 'url(#cloud)', class: 'cloud', style: `--dur:${110 + k * 23}s;--delay:${-k * 31}s;--dist:${art.width + rx * 2}px` }, layers.clouds);
    }
    hoverPoly = el('polygon', { points: '', class: 'hover-hex' }, layers.hover);
    for (let i = 0; i < s.tiles.length; i++) {
      const [cx, cy] = center(s.W, i);
      el('polygon', { points: pts(corners(cx, cy, HEX)), class: `tile t-${s.tiles[i].t}`, 'data-tile': i }, layers.grid);
    }
    el('rect', { x: 1.5, y: 1.5, width: art.width - 3, height: art.height - 3, rx: 3, class: 'frame-outer' }, layers.grid);
    el('rect', { x: 5, y: 5, width: art.width - 10, height: art.height - 10, rx: 2, class: 'frame-inner' }, layers.grid);
    svg.onclick = (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const t = tileFromEvent(e);
      if (t != null) handlers.onTileClick(t, e);
    };
    svg.oncontextmenu = (e) => { e.preventDefault(); handlers.onCancel?.(); };
    svg.onmousemove = (e) => { if (!dragging) handlers.onTileHover(tileFromEvent(e), e); };
    svg.onmouseleave = () => handlers.onTileHover(null, null);
    if (handlers.interactive !== false) bindCamera();
  }

  // ---------- camera ----------
  const MAX_ZOOM = 2.6;
  let suppressClick = false;
  let dragging = false;
  const pointers = new Map();
  let pinch = null;

  function zoomLevel() { return full[2] / view[2]; }

  // When zoomed in, the view takes the shape of the screen area so no space is wasted.
  function heightFor(w) {
    const r = svg.getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : full[2] / full[3];
    return Math.min(full[3], w / aspect);
  }

  function applyView() {
    // Keep the view inside the map (with a little slack) and no wider than the whole map.
    const z = zoomLevel();
    if (z <= 1.001) view = [...full];
    else {
      const cy = view[1] + view[3] / 2;
      view[3] = heightFor(view[2]);
      view[1] = cy - view[3] / 2;
      view[0] = Math.min(Math.max(view[0], -view[2] * 0.08), full[2] - view[2] * 0.92);
      view[1] = Math.min(Math.max(view[1], -view[3] * 0.08), full[3] - view[3] * 0.92);
    }
    svg.setAttribute('viewBox', view.map((v) => v.toFixed(1)).join(' '));
    svg.classList.toggle('zoomed', zoomLevel() > 1.01);
    handlers.onView?.(zoomLevel());
  }

  function toMap(clientX, clientY) {
    const m = svg.getScreenCTM();
    if (!m) return [view[0] + view[2] / 2, view[1] + view[3] / 2];
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  function zoomAt(clientX, clientY, factor) {
    const z = zoomLevel();
    const nz = Math.min(MAX_ZOOM, Math.max(1, z * factor));
    if (Math.abs(nz - z) < 1e-4) return;
    const [mx, my] = clientX == null ? [view[0] + view[2] / 2, view[1] + view[3] / 2] : toMap(clientX, clientY);
    const nw = full[2] / nz;
    const nh = nz <= 1.001 ? full[3] : heightFor(nw);
    view = [mx - ((mx - view[0]) / view[2]) * nw, my - ((my - view[1]) / view[3]) * nh, nw, nh];
    applyView();
  }

  function panBy(dxClient, dyClient) {
    const m = svg.getScreenCTM();
    if (!m) return;
    view[0] -= dxClient / m.a;
    view[1] -= dyClient / m.d;
    applyView();
  }

  function centerOn(tile) {
    if (zoomLevel() <= 1.01) return;
    const [x, y] = center(s.W, tile);
    const margin = 0.18;
    const inside = x > view[0] + view[2] * margin && x < view[0] + view[2] * (1 - margin) && y > view[1] + view[3] * margin && y < view[1] + view[3] * (1 - margin);
    if (inside) return;
    view[0] = x - view[2] / 2;
    view[1] = y - view[3] / 2;
    applyView();
  }

  function bindCamera() {
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomLevel() };
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = pinch.z * (d / Math.max(1, pinch.d));
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / zoomLevel());
        panBy(dx / 2, dy / 2);
        dragging = true;
        return;
      }
      if (!dragging && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 7 && zoomLevel() > 1.01) {
        dragging = true;
        svg.setPointerCapture?.(e.pointerId);
        svg.classList.add('panning');
        handlers.onTileHover(null, null);
      }
      if (dragging) panBy(dx, dy);
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0 && dragging) {
        dragging = false;
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        svg.classList.remove('panning');
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
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

  const escapeXml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colorOf = (owner) => (owner < 0 ? REBEL_COLOR : s.factions[owner].color);

  const seenTile = (i) => !vis || !!s.fog.explored[i];

  function render(ui) {
    if (!s) return;
    vis = handlers.interactive === false ? null : reveal(s); // the start-screen preview shows the whole map
    drawFog();
    // Territory tint and borders, as the player last saw them
    layers.tint.innerHTML = '';
    layers.borders.innerHTML = '';
    const ownerOf = (i) => (s.tiles[i].city >= 0 && seenTile(i) ? knownOwner(s, s.cities[s.tiles[i].city], vis) : null);
    const edges = new Map();
    for (let i = 0; i < s.tiles.length; i++) {
      const o = ownerOf(i);
      if (o == null) continue;
      const [cx, cy] = center(s.W, i);
      el('polygon', { points: pts(corners(cx, cy, HEX + 0.4)), fill: colorOf(o), class: `tint${o < 0 ? ' free' : ''}` }, layers.tint);
      const cs = corners(cx, cy, HEX - 2.4);
      for (let k = 0; k < 6; k++) {
        const n = neighborDir(s.W, s.H, i, k);
        if (n >= 0 && ownerOf(n) === o) continue;
        const [a, b] = [cs[k], cs[(k + 1) % 6]];
        const d = `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
        if (!edges.has(o)) edges.set(o, []);
        edges.get(o).push(d);
      }
    }
    for (const [o, ds] of edges) {
      const d = ds.join('');
      el('path', { d, class: 'border-under' }, layers.borders);
      el('path', { d, stroke: colorOf(o), class: `border${o < 0 ? ' free' : ''}` }, layers.borders);
    }
    // Towns and shrines
    layers.sites.innerHTML = '';
    s.tiles.forEach((t, i) => {
      if (!t.shrine || !seenTile(i)) return;
      const [cx, cy] = center(s.W, i);
      const holder = s.units.find((u) => u.tile === i && (!vis || unitSeen(s, s.playerId, u, vis)));
      const held = holder && holder.owner >= 0;
      el('circle', { cx, cy, r: 30, fill: 'url(#shrineGlow)', class: 'shrine-glow' }, layers.sites);
      const g = el('g', { class: `shrine${held ? ' held' : ''}`, transform: `translate(${cx},${cy})` }, layers.sites);
      g.innerHTML = shrineSprite(held ? colorOf(holder.owner) : null);
    });
    for (const c of s.cities) if (seenTile(c.tile)) drawCity(c);
    // Highlights
    layers.hl.innerHTML = '';
    layers.marks.innerHTML = '';
    layers.rings.innerHTML = '';
    if (ui.danger) {
      for (const t of ui.danger) {
        const [cx, cy] = center(s.W, t);
        el('polygon', { points: pts(corners(cx, cy, HEX - 1)), class: 'danger' }, layers.hl);
      }
    }
    if (ui.reach) {
      // One outline around the whole area the unit can reach.
      const area = new Set(ui.reach.keys());
      if (ui.selectedTile != null) area.add(ui.selectedTile);
      let d = '';
      for (const t of area) {
        const [cx, cy] = center(s.W, t);
        el('polygon', { points: pts(corners(cx, cy, HEX + 0.3)), class: 'reach' }, layers.hl);
        const cs = corners(cx, cy, HEX - 1.2);
        for (let k = 0; k < 6; k++) {
          const n = neighborDir(s.W, s.H, t, k);
          if (n >= 0 && area.has(n)) continue;
          const [a, b] = [cs[k], cs[(k + 1) % 6]];
          d += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
        }
      }
      if (d) { el('path', { d, class: 'reach-edge-under' }, layers.marks); el('path', { d, class: 'reach-edge' }, layers.marks); }
      for (const t of ui.reach.keys()) {
        const [cx, cy] = center(s.W, t);
        el('circle', { cx, cy, r: 3.2, class: 'reach-dot' }, layers.marks);
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

  function drawCity(c) {
    const [cx, cy] = center(s.W, c.tile);
    const held = s.units.some((u) => u.tile === c.tile && (!vis || unitSeen(s, s.playerId, u, vis)));
    const owner = knownOwner(s, c, vis);
    const g = el('g', { class: `town lvl${c.level}`, transform: `translate(${cx},${cy - 4})` }, layers.sites);
    g.innerHTML = `<g transform="translate(${held ? -8 : 0},0)">${townSprite({ ...c, owner }, colorOf(owner))}</g>${ribbon(escapeXml(c.name), colorOf(owner), 28)}`;
  }

  // Unexplored land lies under dark cloud; explored land out of sight is dimmed.
  function drawFog() {
    if (!vis) { if (fogKey) { layers.fog.innerHTML = ''; fogKey = ''; } return; }
    let key = '';
    for (let i = 0; i < s.tiles.length; i++) key += vis.tiles.has(i) ? 'v' : s.fog.explored[i] ? 'e' : 'u';
    if (key === fogKey) return;
    fogKey = key;
    layers.fog.innerHTML = '';
    const dim = el('g', { class: 'fog-dim', filter: 'url(#fogBlur)' }, layers.fog);
    const dark = el('g', { class: 'fog-dark', filter: 'url(#fogBlur)' }, layers.fog);
    for (let i = 0; i < s.tiles.length; i++) {
      if (key[i] === 'v') continue;
      const [cx, cy] = center(s.W, i);
      el('polygon', { points: pts(corners(cx, cy, HEX + 3)) }, key[i] === 'e' ? dim : dark);
    }
  }

  const isFogged = (tile) => !!vis && !vis.tiles.has(tile);
  const isExplored = (tile) => seenTile(tile);

  // Units standing in a town step down and shrink a little so the town stays visible.
  function spot(tile) {
    const [x, y] = center(s.W, tile);
    const garrison = s.tiles[tile].city >= 0 && s.cities[s.tiles[tile].city].tile === tile;
    return garrison ? `translate(${x + 11}px, ${y + 3}px) scale(0.8)` : `translate(${x}px, ${y}px)`;
  }

  function placeUnit(gEl, tile, instant = false) {
    const tf = spot(tile);
    if (instant) {
      gEl.style.transition = 'none';
      gEl.style.transform = tf;
      gEl.getBoundingClientRect();
      gEl.style.transition = '';
    } else gEl.style.transform = tf;
  }

  function setHover(tile) {
    if (!hoverPoly) return;
    if (tile == null) { hoverPoly.setAttribute('points', ''); return; }
    const [cx, cy] = center(s.W, tile);
    hoverPoly.setAttribute('points', pts(corners(cx, cy, HEX - 1.5)));
  }

  function renderUnits(ui) {
    const alive = new Set();
    const exists = new Set(s.units.map((u) => u.id));
    for (const u of s.units) {
      if (vis && !unitSeen(s, s.playerId, u, vis)) continue;
      alive.add(u.id);
      let g = units.get(u.id);
      if (!g) {
        g = el('g', { class: 'unit spawn' }, layers.units);
        g.innerHTML = `<ellipse class="foot" cx="0" cy="13.5" rx="12" ry="3.6"/>
          <g class="tok" filter="url(#shadow)"><circle r="16" class="rim"/><circle r="13.4" class="body"/><circle r="13.4" fill="url(#gloss)" class="gloss"/><g class="icon">${EMBLEM[u.type]}</g></g>
          <rect x="-12.5" y="16.5" width="25" height="5" rx="2.5" class="hpbg"/><rect x="-11.5" y="17.5" width="23" height="3" rx="1.5" class="hp"/>
          <g class="ready"><circle cx="12" cy="-12" r="4.4"/><path d="M10,-12.2l1.5,1.6 2.6,-3"/></g>
          <path d="M-12,-17l1.5,3.1 3.4,0.5-2.5,2.4 0.6,3.4-3-1.6-3,1.6 0.6-3.4-2.5-2.4 3.4-0.5z" class="vet"/>`;
        units.set(u.id, g);
        placeUnit(g, u.tile, true);
        setTimeout(() => g.classList.remove('spawn'), 400);
      }
      if (!g.dataset.anim) placeUnit(g, u.tile);
      g.style.setProperty('--c', colorOf(u.owner));
      const body = g.querySelector('.body');
      if (body.dataset.owner !== String(u.owner)) {
        body.dataset.owner = String(u.owner);
        body.setAttribute('fill', `url(#tok${u.owner})`);
      }
      const frac = Math.max(0, u.hp / maxHp(s, u.type, u.owner, u.vet));
      const hp = g.querySelector('.hp');
      hp.setAttribute('width', (23 * frac).toFixed(1));
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
      if (!alive.has(id) && exists.has(id)) {
        // Slipped out of sight: fade away quietly.
        units.delete(id);
        g.classList.add('fading');
        setTimeout(() => g.remove(), 300);
      } else if (!alive.has(id)) {
        units.delete(id);
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(g.style.transform);
        if (m) puff(+m[1], +m[2]);
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
    if (!g && !tg && isFogged(res.from) && isFogged(res.at)) return; // a fight nobody of yours saw
    const [ax, ay] = center(s.W, res.from);
    const [tx, ty] = center(s.W, res.at);
    if (g) {
      g.dataset.anim = '1';
      g.style.setProperty('--step', `${90 * speed}ms`);
      g.style.transform = `translate(${ax + (tx - ax) * 0.35}px, ${ay + (ty - ay) * 0.35}px)`;
      await sleep(95 * speed);
      g.style.transform = spot(res.from);
    }
    if (UNITS[s.units.find((u) => u.id === res.uid)?.type]?.range > 1 || Math.hypot(tx - ax, ty - ay) > HEX * 2.2) {
      await projectile(ax, ay, tx, ty, Math.max(160, 220 * speed));
    } else slash(tx, ty);
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

  async function projectile(ax, ay, tx, ty, ms) {
    const ang = (Math.atan2(ty - ay, tx - ax) * 180) / Math.PI;
    const g = el('g', { class: 'missile' }, layers.fx);
    g.innerHTML = '<path d="M-9,0H6" class="shaft"/><path d="M9,0L4,-2.6V2.6Z" class="head"/><path d="M-9,0l-2.5,-2.5M-9,0l-2.5,2.5" class="fletch"/>';
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const x = ax + (tx - ax) * k;
        const y = ay + (ty - ay) * k - Math.sin(k * Math.PI) * 26;
        const slope = Math.cos(k * Math.PI) * -26 * Math.PI;
        const a2 = ang + (Math.atan2(slope, Math.hypot(tx - ax, ty - ay) || 1) * 180) / Math.PI * 0.6;
        g.setAttribute('transform', `translate(${x},${y}) rotate(${a2})`);
        if (k < 1) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    g.remove();
    burst(tx, ty);
  }

  function slash(x, y) {
    const g = el('g', { class: 'slash', transform: `translate(${x},${y})` }, layers.fx);
    g.innerHTML = '<path d="M-13,-11Q2,-4 12,12"/><path d="M-6,-14Q6,-6 14,6" class="thin"/>';
    burst(x, y);
    setTimeout(() => g.remove(), 420);
  }

  function burst(x, y) {
    const g = el('g', { class: 'burst', transform: `translate(${x},${y})` }, layers.fx);
    let d = '';
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI / 4) * k + 0.3;
      d += `M${(Math.cos(a) * 6).toFixed(1)},${(Math.sin(a) * 6).toFixed(1)}L${(Math.cos(a) * 14).toFixed(1)},${(Math.sin(a) * 14).toFixed(1)}`;
    }
    g.innerHTML = `<path d="${d}"/>`;
    setTimeout(() => g.remove(), 450);
  }

  function puff(x, y) {
    const g = el('g', { class: 'puff', transform: `translate(${x},${y})` }, layers.fx);
    let out = '';
    for (let k = 0; k < 7; k++) {
      const a = (Math.PI * 2 * k) / 7;
      out += `<circle cx="${(Math.cos(a) * 5).toFixed(1)}" cy="${(Math.sin(a) * 4 - 2).toFixed(1)}" r="${5 + (k % 3)}" style="--dx:${(Math.cos(a) * 14).toFixed(1)}px;--dy:${(Math.sin(a) * 10 - 10).toFixed(1)}px"/>`;
    }
    g.innerHTML = out;
    setTimeout(() => g.remove(), 900);
  }

  function shockwave(tile, color = '#ffd76a') {
    const [x, y] = center(s.W, tile);
    const g = el('g', { class: 'shock', transform: `translate(${x},${y})` }, layers.fx);
    g.innerHTML = `<circle r="16" stroke="${color}"/><circle r="16" stroke="#fff6cf" class="b"/><circle r="26" fill="url(#spark)" class="flash"/>`;
    setTimeout(() => g.remove(), 1000);
  }

  function sparkle(tile) {
    const [x, y] = center(s.W, tile);
    const g = el('g', { class: 'sparkle', transform: `translate(${x},${y - 10})` }, layers.fx);
    let out = '';
    for (let k = 0; k < 9; k++) {
      const dx = ((k * 37) % 40) - 20;
      const d = 0.08 * k;
      out += `<path d="M0,-4L1,-1L4,0L1,1L0,4L-1,1L-4,0L-1,-1Z" transform="translate(${dx},${(k % 3) * 6})" style="animation-delay:${d.toFixed(2)}s"/>`;
    }
    g.innerHTML = out;
    setTimeout(() => g.remove(), 1500);
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
    const [ex, ey] = center(s.W, path[path.length - 1]);
    el('circle', { cx: ex, cy: ey, r: 9, class: 'path-end' }, layers.path);
    el('circle', { cx: ex, cy: ey, r: 3.4, class: 'path-dot' }, layers.path);
  }

  return {
    build, render, animateMove, animateAttack, float, pulse, showPath, setHover, shockwave, sparkle,
    zoomIn: () => zoomAt(null, null, 1.4), zoomOut: () => zoomAt(null, null, 1 / 1.4), resetView: () => { view = [...full]; applyView(); },
    centerOn, zoomLevel, tileCenter: (t) => center(s.W, t), isFogged, isExplored,
    zoomTo: (z, tile) => {
      const nz = Math.min(MAX_ZOOM, Math.max(1, z));
      const [x, y] = center(s.W, tile);
      const nw = full[2] / nz;
      const nh = heightFor(nw);
      view = [x - nw / 2, y - nh / 2, nw, nh];
      applyView();
    },
  };
}
