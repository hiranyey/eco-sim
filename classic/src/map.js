// SVG hex map: built once per game, then updated in place each tick.
import { TERRAIN } from './data.js';

const SIZE = 30;
const SQ3 = Math.sqrt(3);
const PAD = 8;

export const MAP_MODES = {
  realm: 'Realms',
  terrain: 'Terrain',
  prosperity: 'Prosperity',
  unrest: 'Unrest',
  population: 'Population',
};

function center(x, y) {
  return [PAD + SIZE * SQ3 * (x + 0.5 * (y & 1)) + (SIZE * SQ3) / 2, PAD + SIZE * 1.5 * y + SIZE];
}

function corners(cx, cy, size = SIZE) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return out;
}

const pts = (cs) => cs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function scale3(t, lo, mid, hi) {
  return t < 0.5 ? lerpColor(lo, mid, t * 2) : lerpColor(mid, hi, (t - 0.5) * 2);
}

export function createMap(svg, s, onSelect) {
  const w = PAD * 2 + SIZE * SQ3 * (s.mapW + 0.5);
  const h = PAD * 2 + SIZE * 1.5 * (s.mapH - 1) + SIZE * 2;
  svg.setAttribute('viewBox', `0 0 ${w.toFixed(0)} ${h.toFixed(0)}`);
  const land = new Set(s.provinces.map((p) => `${p.x},${p.y}`));
  let html = '<defs>';
  for (const r of s.realms) {
    html += `<pattern id="hatch-${r.id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="transparent"/><rect width="3" height="7" fill="${r.color}"/></pattern>`;
  }
  html += '</defs><g class="sea-layer">';
  for (let y = 0; y < s.mapH; y++) {
    for (let x = 0; x < s.mapW; x++) {
      if (land.has(`${x},${y}`)) continue;
      const [cx, cy] = center(x, y);
      html += `<polygon class="sea" points="${pts(corners(cx, cy, SIZE + 0.5))}"/>`;
    }
  }
  html += '</g><g class="prov-layer">';
  for (const p of s.provinces) {
    const [cx, cy] = center(p.x, p.y);
    const cs = pts(corners(cx, cy, SIZE + 0.4));
    html += `<g class="prov" data-pid="${p.id}"><title>${p.name}</title><polygon class="hex" points="${cs}"/><polygon class="occ" points="${cs}"/>` +
      `<text class="cap" x="${cx}" y="${cy + 6}" text-anchor="middle">★</text>` +
      `<text class="bld" x="${cx}" y="${cy + 18}" text-anchor="middle"></text></g>`;
  }
  html += '</g><path class="borders"/><path class="coast"/><polygon class="sel" points=""/><g class="labels"></g>';
  svg.innerHTML = html;

  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.prov');
    if (g) onSelect(Number(g.dataset.pid));
  });

  // Coastline never changes.
  let coast = '';
  for (const p of s.provinces) {
    const cs = corners(...center(p.x, p.y));
    for (let d = 0; d < 6; d++) {
      if (p.edges[d] != null) continue;
      const [a, b] = [cs[d], cs[(d + 1) % 6]];
      coast += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
    }
  }
  svg.querySelector('.coast').setAttribute('d', coast);

  const groups = [...svg.querySelectorAll('.prov')];
  return {
    update(state, mode, selected) {
      const maxPop = Math.max(...state.provinces.map((p) => p.pop));
      groups.forEach((g, i) => {
        const p = state.provinces[i];
        const r = state.realms[p.owner];
        let fill;
        if (mode === 'terrain') fill = TERRAIN[p.terrain].color;
        else if (mode === 'prosperity') fill = scale3(p.prosperity / 100, '#b23a3a', '#d8c25a', '#3f9d57');
        else if (mode === 'unrest') fill = scale3(p.unrest / 100, '#3f9d57', '#d8c25a', '#b23a3a');
        else if (mode === 'population') fill = lerpColor('#2c3550', '#9fc2ff', Math.sqrt(p.pop / maxPop));
        else fill = r.color;
        const hex = g.children[1];
        hex.setAttribute('fill', fill);
        hex.classList.toggle('player', p.owner === state.playerId && mode === 'realm');
        const occ = g.children[2];
        if (p.occupiedBy != null) {
          occ.setAttribute('fill', `url(#hatch-${p.occupiedBy})`);
          occ.style.display = '';
        } else occ.style.display = 'none';
        g.children[3].style.display = p.isCapital ? '' : 'none';
        g.children[4].textContent = p.construction.length ? '⚒' : '';
        g.children[0].textContent = `${p.name} — ${r.short}${p.occupiedBy != null ? ` (occupied by ${state.realms[p.occupiedBy].short})` : ''}`;
      });
      let d = '';
      for (const p of state.provinces) {
        const cs = corners(...center(p.x, p.y));
        for (let k = 0; k < 6; k++) {
          const n = p.edges[k];
          if (n == null || n < p.id) continue;
          if (state.provinces[n].owner === p.owner) continue;
          const [a, b] = [cs[k], cs[(k + 1) % 6]];
          d += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
        }
      }
      svg.querySelector('.borders').setAttribute('d', d);
      const sel = svg.querySelector('.sel');
      if (selected != null) {
        const p = state.provinces[selected];
        sel.setAttribute('points', pts(corners(...center(p.x, p.y), SIZE - 2)));
        sel.style.display = '';
      } else sel.style.display = 'none';
      // Realm name labels at each realm's centre of mass.
      let labels = '';
      if (mode === 'realm') {
        for (const r of state.realms) {
          if (!r.alive) continue;
          const own = state.provinces.filter((p) => p.owner === r.id);
          let cx = 0;
          let cy = 0;
          for (const p of own) {
            const [x, y] = center(p.x, p.y);
            cx += x;
            cy += y;
          }
          cx /= own.length;
          cy /= own.length;
          const size = Math.max(11, Math.min(20, 7 + own.length * 0.6));
          labels += `<text x="${cx.toFixed(0)}" y="${cy.toFixed(0)}" text-anchor="middle" font-size="${size.toFixed(0)}">${r.short.toUpperCase()}</text>`;
        }
      }
      svg.querySelector('.labels').innerHTML = labels;
    },
  };
}

