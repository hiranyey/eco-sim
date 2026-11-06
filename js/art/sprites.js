// Board sprites as SVG strings: faction crests, unit emblems, towns and shrines.
// Drawn around (0, 0) so the board can translate them onto a hex centre.

const INK = '#2a1d10';

// Shared gradient definitions live in one hidden <svg> on the page, so markup that
// references them stays identical between renders and ids never collide.
const registry = new Set();
let host = null;
export function useDef(id, markup) {
  if (registry.has(id)) return;
  registry.add(id);
  if (typeof document === 'undefined') return;
  if (!host) {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    wrap.innerHTML = '<defs></defs>';
    document.body.prepend(wrap);
    host = wrap.firstChild;
  }
  host.insertAdjacentHTML('beforeend', markup);
}
const CREAM = '#f7eed6';

// ---------- faction crests ----------
const SHIELD = 'M4 3.5h32v15.5c0 12.5-8 19.5-16 23.5C12 38.5 4 31.5 4 19z';
const EMBLEMS = {
  // Crossed swords
  varr: `<g stroke="${INK}" stroke-width="0.8" stroke-linejoin="round" fill="${CREAM}">
    <path d="M10.5 9.5l2-1 14 17-1.6 1.4z"/><path d="M29.5 9.5l-2-1-14 17 1.6 1.4z"/>
    <path d="M12.5 26.5l3.5-3 1.4 1.4-3.2 3.5zM27.5 26.5l-3.5-3-1.4 1.4 3.2 3.5z"/>
    <circle cx="12" cy="30" r="1.8"/><circle cx="28" cy="30" r="1.8"/></g>`,
  // Crescent and star
  selene: `<g stroke="${INK}" stroke-width="0.8" fill="${CREAM}"><path d="M22 8.5a11 11 0 1 0 6 20.5 9 9 0 1 1-6-20.5z"/>
    <path d="M25.5 13.5l1.3 2.8 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"/></g>`,
  // Oak tree
  thorne: `<g stroke="${INK}" stroke-width="0.8" fill="${CREAM}"><path d="M18.5 32v-7l-3-3 1-1 2.5 2V20h3v4.5l2.5-2.5 1 1-3.5 3.5V32z"/>
    <path d="M20 7c3.5 0 5.5 2 6 4 3 .5 4.5 3 3.5 5.5 1.5 2.5-.5 5.5-3.5 5H14c-3 .5-5-2.5-3.5-5-1-2.5.5-5 3.5-5.5.5-2 2.5-4 6-4z"/>
    <path d="M14 33.5h12" stroke-width="1.6" stroke="${CREAM}"/></g>`,
  // Horse head
  ashkar: `<path d="M26 33l-.6-7.5c0-5-1.3-9.2-4.4-11.8l-.6-4.2-2.6 3.2c-3.8.6-7 3.8-9 8.2l-1.3 3.2c0 2.3 2.2 3.2 3.9 1.7l3.2-2.3c1.3 2.6 1 5.8-.6 9.5z" fill="${CREAM}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>
    <circle cx="16.4" cy="17.4" r="1.1" fill="${INK}"/><path d="M21.5 13.5c2.5 1 4.5 4 5.5 8M23 12.5c2.5 1.5 4.5 4 5 7" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linecap="round"/>`,
  rebel: `<g fill="none" stroke="${CREAM}" stroke-width="2.2" stroke-linecap="round"><path d="M13 30l14-18M14 12l13 18"/></g>`,
};

export function crest(key, color, cls = 'crest') {
  const id = color.slice(1);
  useDef(`cr-${id}`, `<linearGradient id="cr-${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -0.45)}"/></linearGradient>`);
  useDef('cg-gold', '<linearGradient id="cg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset="0.5" stop-color="#d9a640"/><stop offset="1" stop-color="#8a5f18"/></linearGradient>');
  return `<svg class="${cls}" viewBox="0 0 40 46" aria-hidden="true">
    <path d="${SHIELD}" fill="url(#cr-${id})" stroke="url(#cg-gold)" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M7 6.5h26v12c0 10-6.5 16-13 19.5" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1.2"/>
    ${EMBLEMS[key] ?? EMBLEMS.rebel}</svg>`;
}

// ---------- colour helpers ----------
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amt < 0 ? c * (1 + amt) : c + (255 - c) * amt;
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- unit emblems (about ±9 units) ----------
// Each emblem is drawn twice: a dark outline pass, then the cream pass on top.
const line = (d, w = 2) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${CREAM}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d, extra = '') => `<path d="${d}" fill="${CREAM}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round" ${extra}/>`;

export const EMBLEM = {
  militia: line('M0 9V-3') + line('M-4.5-9v4.5Q-4.5-2.5 0-2.5T4.5-4.5V-9M0-9v6.5', 1.7),
  spear: line('M-7.5 8.5L4-3', 2) + fill('M8.8-7.8L2.6-5.6 6-2.2z') + line('M-0.5-2.8l3.3 3.3', 1.6),
  archer: line('M-3.5-9Q8.5 0-3.5 9', 2) + `<path d="M-3.5-9L-7 0l3.5 9" fill="none" stroke="${CREAM}" stroke-width="0.9"/>` + line('M-7 0H6', 1.6) + fill('M9.5 0L5-2.8v5.6z') + line('M-7 0l-2-2.2M-7 0l-2 2.2', 1.1),
  cavalry: fill('M6 9l-.5-6c0-4-1-7.4-3.5-9.4L1.5-9.8 0-7.2c-3 .5-5.6 3-7.2 6.6L-8.3 2c0 1.8 1.8 2.6 3.1 1.4l2.6-1.9c1 2.1.8 4.6-.5 7.5z')
    + `<circle cx="-3" cy="-2.6" r="0.95" fill="${INK}"/><path d="M2.5-6c2 .8 3.6 3.2 4.4 6.4M4-6.8c2 1.2 3.6 3.2 4 5.6" fill="none" stroke="${INK}" stroke-width="0.8" stroke-linecap="round"/>`,
  knight: fill('M0-11c2.5 1 5.5.5 7.5-1.5-.5 3-2.5 4.5-5 5z', 'opacity="0.95"')
    + fill('M-6.8-4.5C-6.8-9 6.8-9 6.8-4.5V5.5C6.8 8 4 9 0 9S-6.8 8-6.8 5.5z')
    + `<path d="M-5.5-0.8H5.5" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/><path d="M0-8V-1.5" stroke="${INK}" stroke-width="0.9"/>
       <g fill="${INK}"><circle cx="-2.6" cy="3.6" r="0.6"/><circle cx="0" cy="3.6" r="0.6"/><circle cx="2.6" cy="3.6" r="0.6"/><circle cx="-1.3" cy="5.6" r="0.6"/><circle cx="1.3" cy="5.6" r="0.6"/></g>`,
  catapult: line('M-8.5 5.5H8.5', 1.8) + line('M-3 5.5L1-1.5 5 5.5', 1.6) + line('M-6.5 2.5L7.5-7.5', 1.8)
    + `<circle cx="7.6" cy="-8.4" r="2.2" fill="${CREAM}" stroke="${INK}" stroke-width="1"/>`
    + `<circle cx="-5" cy="7.5" r="2.3" fill="${INK}" stroke="${CREAM}" stroke-width="1.2"/><circle cx="5" cy="7.5" r="2.3" fill="${INK}" stroke="${CREAM}" stroke-width="1.2"/>`,
  ruler: fill('M-8.5 4L-9-5.5l4.6 4L0-8.5l4.4 7 4.6-4L8.5 4z', 'fill="#ffe08a"') + fill('M-8.5 4.2h17v3.6h-17z', 'fill="#ffe08a"')
    + `<circle cx="0" cy="6" r="1.2" fill="#c73b2c"/><circle cx="-4.6" cy="6" r="0.9" fill="#2f6fc0"/><circle cx="4.6" cy="6" r="0.9" fill="#2f6fc0"/>
       <g fill="#fff6cf" stroke="${INK}" stroke-width="0.7"><circle cx="-9" cy="-6.2" r="1.2"/><circle cx="0" cy="-9.4" r="1.3"/><circle cx="9" cy="-6.2" r="1.2"/></g>`,
};

// ---------- towns ----------
function house(x, y, w, h, roof = '#b4532f', flip = false) {
  const rh = h * 0.75;
  const side = flip ? -1 : 1;
  return `<g>
    <path d="M${x - w / 2},${y}v${-h}h${w}v${h}z" fill="#efe1c0" stroke="${INK}" stroke-width="0.9"/>
    <path d="M${x + (w / 2) * side - 0.01},${y}v${-h}h${-w * 0.32 * side}v${h}z" fill="#c9b48c" opacity="0.8"/>
    <path d="M${x - w / 2 - 1.5},${y - h}L${x},${y - h - rh}L${x + w / 2 + 1.5},${y - h}z" fill="${roof}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M${x},${y - h - rh}L${x + (w / 2 + 1.5) * side},${y - h}" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>
    <rect x="${x - 1.2}" y="${y - 3.4}" width="2.4" height="3.4" fill="${INK}"/>
  </g>`;
}

function tower(x, y, w, h, roof = null) {
  let out = `<path d="M${x - w / 2},${y}v${-h}h${w}v${h}z" fill="#c9c2b4" stroke="${INK}" stroke-width="0.9"/>
    <path d="M${x + w / 2},${y}v${-h}h${-w * 0.35}v${h}z" fill="#8f877a" opacity="0.7"/>
    <rect x="${x - 0.8}" y="${y - h * 0.62}" width="1.6" height="3" fill="${INK}"/>`;
  if (roof) {
    out += `<path d="M${x - w / 2 - 1.4},${y - h}L${x},${y - h - w * 1.25}L${x + w / 2 + 1.4},${y - h}z" fill="${roof}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
      <path d="M${x},${y - h - w * 1.25}L${x + w / 2 + 1.4},${y - h}" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>`;
  } else {
    const c = w / 5;
    let d = `M${x - w / 2},${y - h}`;
    for (let k = 0; k < 5; k++) d += k % 2 ? `h${c}` : `v-2.4h${c}v2.4`;
    out += `<path d="${d}" fill="#c9c2b4" stroke="${INK}" stroke-width="0.9"/>`;
  }
  return out;
}

function flag(x, y, color, h = 13) {
  return `<path d="M${x},${y}v${-h}" stroke="${INK}" stroke-width="1.1"/>
    <path class="flag-cloth" d="M${x + 0.4},${y - h}c3 -1.2 6 1.2 9 0l-1.8 2.6 1.8 2.6c-3 1.2-6-1.2-9 0z" fill="${color}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`;
}

function wall() {
  let d = 'M-19,12.5V6.5';
  for (let x = -19; x < 19; x += 3.8) d += `h1.9v-2.2h1.9v2.2`;
  d += 'V12.5z';
  return `<path d="${d}" fill="#bdb5a5" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M-19,9.5H19" stroke="#8f877a" stroke-width="0.6"/>
    <path d="M-3.2,12.5v-3.4a3.2,3.2 0 0 1 6.4,0v3.4z" fill="${INK}"/>`;
}

function cathedral() {
  return `<g transform="translate(14,4)">
    <path d="M-4.5,6v-11h9v11z" fill="#efe6cf" stroke="${INK}" stroke-width="0.9"/>
    <path d="M-4.5,-5l4.5,-17 4.5,17z" fill="#d9b357" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M0,-22v-5M-2,-25h4" stroke="#ffe9a0" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="0" cy="-1" r="1.8" fill="#4a7fc0" stroke="${INK}" stroke-width="0.7"/>
  </g>`;
}

export function townSprite(c, color) {
  const lv = c.level;
  let body = '<ellipse cx="0" cy="11" rx="21" ry="6" fill="#000" opacity="0.28"/>';
  let flagAt;
  if (lv === 1) {
    body += house(-9, 7, 8, 7, '#a9502c') + house(8.5, 8, 8, 6.5, '#8f4a2a', true) + house(0, 4, 10, 9, '#b85a31');
    flagAt = [0, -11];
  } else if (lv === 2) {
    body += house(-12, 4, 7, 6, '#a9502c') + house(12, 4, 7, 6, '#8f4a2a', true) + tower(0, 3, 9, 18, '#7d3a24')
      + house(-6, 10, 8, 7, '#b85a31') + house(6.5, 10.5, 8, 7, '#a9502c', true);
    flagAt = [0, -26];
  } else {
    body += tower(-11, 2, 7, 15) + tower(11, 2, 7, 15) + `<path d="M-8,2v-11h16v11z" fill="#d6cfc0" stroke="${INK}" stroke-width="0.9"/>`
      + tower(0, 0, 10, 24, '#6b2f20') + house(-13, 11, 8, 6.5, '#b85a31') + house(13, 11, 8, 6.5, '#a9502c', true) + house(-4.5, 12, 7, 5.5, '#8f4a2a');
    flagAt = [0, -36.5];
  }
  if (c.buildings.includes('cathedral')) body += cathedral();
  if (c.buildings.includes('walls')) body += wall();
  body += flag(flagAt[0], flagAt[1], color);
  if (c.capital) {
    const [x, y] = [flagAt[0] + 4.6, flagAt[1] - 17];
    body += `<path d="M${x - 5},${y + 3}l-.6-5.6 2.8 2.4 2.8-4.2 2.8 4.2 2.8-2.4-.6 5.6z" fill="#ffd76a" stroke="#5a3e08" stroke-width="0.8" stroke-linejoin="round"/>`;
  }
  return body;
}

// Parchment name ribbon under a town, with the owner's colour on its tails.
export function ribbon(name, color, y = 20) {
  const w = Math.max(30, name.length * 5.3 + 14);
  const h = 11;
  const x0 = -w / 2;
  return `<g class="ribbon" transform="translate(0,${y})">
    <path d="M${x0 - 6},${2}l4,${h / 2 - 2}-4,${h / 2 - 2}h7v${-h + 2}z" fill="${color}" stroke="${INK}" stroke-width="0.8" transform="translate(0,-2)"/>
    <path d="M${-x0 + 6},${2}l-4,${h / 2 - 2} 4,${h / 2 - 2}h-7v${-h + 2}z" fill="${color}" stroke="${INK}" stroke-width="0.8" transform="translate(0,-2)"/>
    <rect x="${x0}" y="-2" width="${w}" height="${h}" rx="1.5" fill="#f3e6c4" stroke="${INK}" stroke-width="0.9"/>
    <text x="0" y="5.9" text-anchor="middle">${name}</text></g>`;
}

// ---------- shrine ----------
export function shrineSprite(holderColor) {
  const glow = holderColor ?? '#ffd35a';
  const stone = (x, y, w, h, r = 0) => `<g transform="translate(${x},${y}) rotate(${r})"><path d="M${-w / 2},0v${-h + 2}q0,-2 ${w / 2},-2.4q${w / 2},0.4 ${w / 2},2.4v${h - 2}z" fill="#a9a397" stroke="${INK}" stroke-width="0.9"/><path d="M${w / 2},0v${-h + 2}q0,-1.6 ${-w * 0.3},-2.2v${h}z" fill="#6f6a62" opacity="0.8"/></g>`;
  return `<ellipse cx="0" cy="6" rx="17" ry="6.5" fill="#000" opacity="0.25"/>
    <ellipse cx="0" cy="4" rx="14" ry="5" fill="#d9cfa8" stroke="${INK}" stroke-width="0.6" opacity="0.85"/>
    ${stone(-11, 3, 5, 12, -6)}${stone(11, 3, 5, 12, 6)}${stone(-5, -1, 5, 14, -2)}${stone(5.5, -1, 5, 13, 3)}
    <circle class="shrine-core" cx="0" cy="-2" r="4.2" fill="${glow}" stroke="#fff6cf" stroke-width="1.2"/>
    <path d="M0,-6.5l1.2,3.3 3.3,1.2-3.3,1.2L0,2.5l-1.2,-3.3-3.3,-1.2 3.3,-1.2z" fill="#fffbe8"/>
    ${stone(0, 10, 6, 9, 0)}`;
}

// Stand-alone token for the interface (recruit buttons, cards).
export function tokenSvg(type, color, cls = 'mini-unit') {
  const id = color.slice(1);
  const gold = type === 'ruler';
  useDef(`tb-${id}`, `<radialGradient id="tb-${id}" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="${shade(color, 0.28)}"/><stop offset="0.65" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -0.45)}"/></radialGradient>`);
  useDef('tr-steel', '<linearGradient id="tr-steel" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset="0.45" stop-color="#a7a39b"/><stop offset="1" stop-color="#3f3b36"/></linearGradient>');
  useDef('tr-gold', '<linearGradient id="tr-gold" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fff4c2"/><stop offset="0.45" stop-color="#e0aa3e"/><stop offset="1" stop-color="#6d4710"/></linearGradient>');
  useDef('tg-gloss', '<radialGradient id="tg-gloss" cx="0.35" cy="0.2" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></radialGradient>');
  return `<svg class="${cls}" viewBox="-18 -18 36 36" aria-hidden="true">
    <circle r="16" fill="url(#tr-${gold ? 'gold' : 'steel'})"/><circle r="13.4" fill="url(#tb-${id})" stroke="rgba(0,0,0,0.45)" stroke-width="0.8"/><circle r="13.4" fill="url(#tg-gloss)"/>${EMBLEM[type]}</svg>`;
}
