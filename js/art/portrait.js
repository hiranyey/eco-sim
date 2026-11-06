// Procedural ruler portraits. Every character gets a stable face from their id: skin, hair,
// eyes, brows and build vary; gender shapes the hairstyle, jaw, brows, lashes, lips and beard;
// age greys the hair and lines the face; some traits show
// (scars, a pendant, a gold chain, a pallid look). Rulers wear a crown, heirs a circlet.
import { useDef, shade } from './sprites.js';
import { sexOf } from '../world.js';

const INK = '#2a1d10';
const SKIN = ['#f3d6ba', '#ebc39f', '#dcaa83', '#c48f66', '#a06e4a', '#7a4f33', '#5e3b26'];
const HAIR = ['#1f1712', '#3b2416', '#5a3a22', '#7a4a26', '#9c5a2a', '#b8873e', '#d9b46a', '#2c2c30'];
const EYES = ['#4a3020', '#2f5f8a', '#4f7a3a', '#6b6f75', '#7a5a2a', '#2a2a2a'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p, sh) => (p >> sh) & 255;
  const m = [16, 8, 0].map((sh) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function portrait(c, color, { role = 'ruler', cls = 'portrait' } = {}) {
  if (!c) return '';
  let seed = c.id * 2654435761;
  for (const ch of c.name) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const r = rng(seed);
  const age = c.age;
  const child = age < 15;
  const traits = c.traits ?? [];
  const has = (t) => traits.includes(t);

  // ---- features
  let skin = pickR(r, SKIN);
  if (has('frail')) skin = mixHex(skin, '#e9e4dc', 0.35);
  const skinShade = shade(skin, -0.22);
  const baseHair = pickR(r, HAIR);
  const grey = age >= 70 ? 0.85 : age >= 58 ? 0.6 : age >= 46 ? 0.3 : 0;
  const hair = mixHex(baseHair, '#d8d4cc', grey);
  const hairDark = shade(hair, -0.3);
  const eye = pickR(r, EYES);
  const female = sexOf(c) === 'f';
  const hairStyle = female
    ? pickR(r, child ? ['long', 'braid', 'bun', 'curly'] : ['long', 'braid', 'bun', 'swept', 'curly', 'long', 'bun'])
    : child ? pickR(r, ['short', 'curly', 'swept']) : age > 50 && r() < 0.35 ? 'bald' : pickR(r, ['short', 'swept', 'curly', 'short', 'long']);
  const beard = !female && !child && age >= 18 && r() < 0.6 ? pickR(r, ['full', 'goatee', 'moustache', 'full']) : null;
  const wide = (has('robust') ? 3 : 0) - (has('frail') ? 2 : 0) + (r() - 0.5) * 3 - (female ? 1.8 : 0);
  const w = (child ? 21 : 24) + wide;
  const cx = 50;
  const top = child ? 36 : 30;
  const chin = child ? 80 : 84 - (sexOf(c) === 'f' ? 1.5 : 0);
  const eyeY = child ? 62 : 58;
  const eyeDx = child ? 9 : 10;
  const stern = has('conqueror') || has('brave');
  const smile = has('beloved') || (has('greedy') && r() < 0.5);
  const scar = (has('brave') || has('conqueror')) && r() < 0.6;

  const id = color.slice(1);
  useDef(`pbg-${id}`, `<radialGradient id="pbg-${id}" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="${shade(color, 0.15)}"/><stop offset="1" stop-color="${shade(color, -0.6)}"/></radialGradient>`);
  useDef('pgold', '<linearGradient id="pgold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset="0.5" stop-color="#d9a640"/><stop offset="1" stop-color="#7a5212"/></linearGradient>');
  useDef('pvig', '<radialGradient id="pvig" cx="0.5" cy="0.45" r="0.6"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>');

  const face = `M${cx},${top} C${cx + w},${top} ${cx + w + 2},${eyeY - 6} ${cx + w - 1},${eyeY + 6} C${cx + w - 5},${chin - 6} ${cx + 7},${chin} ${cx},${chin} C${cx - 7},${chin} ${cx - w + 5},${chin - 6} ${cx - w + 1},${eyeY + 6} C${cx - w - 2},${eyeY - 6} ${cx - w},${top} ${cx},${top}Z`;
  let out = '';

  // ---- background and body
  out += `<rect width="100" height="120" fill="url(#pbg-${id})"/>`;
  out += `<path d="M14,120 C14,100 24,92 38,90 L62,90 C76,92 86,100 86,120Z" fill="${shade(color, -0.25)}" stroke="${INK}" stroke-width="1"/>`;
  out += `<path d="M38,90 L50,108 L62,90" fill="none" stroke="#e8c76a" stroke-width="1.6"/>`;
  if (role === 'ruler' && !child) {
    // fur mantle
    out += `<path d="M14,120 C14,104 22,95 34,92 C38,98 44,100 50,100 C56,100 62,98 66,92 C78,95 86,104 86,120 L76,120 C74,110 70,104 64,102 L36,102 C30,104 26,110 24,120Z" fill="#efe6d4" stroke="${INK}" stroke-width="0.9"/>`;
    for (let k = 0; k < 7; k++) out += `<path d="M${24 + k * 8.5},${108 + (k % 2) * 4}l1.2,3.2-1.2,1.6-1.2-1.6z" fill="${INK}"/>`;
  }
  // neck
  out += `<path d="M${cx - 8},${chin - 8} L${cx - 9},92 C${cx - 4},96 ${cx + 4},96 ${cx + 9},92 L${cx + 8},${chin - 8}Z" fill="${skinShade}" stroke="${INK}" stroke-width="0.8"/>`;
  if (has('pious')) out += `<path d="M${cx},96v10M${cx - 3.5},99.5h7" stroke="#e8c76a" stroke-width="2.2" stroke-linecap="round"/><path d="M${cx - 9},92 Q${cx},100 ${cx + 9},92" fill="none" stroke="#c9a24a" stroke-width="0.8"/>`;
  if (has('greedy')) out += `<path d="M${cx - 14},94 Q${cx},108 ${cx + 14},94" fill="none" stroke="#f0c850" stroke-width="2.2" stroke-dasharray="2.2 1.2"/><circle cx="${cx}" cy="102.5" r="3" fill="url(#pgold)" stroke="${INK}" stroke-width="0.6"/>`;

  // ---- hair behind the head
  if (hairStyle === 'bun') {
    out += `<circle cx="${cx}" cy="${top - 4}" r="9" fill="${hair}" stroke="${INK}" stroke-width="0.9"/><path d="M${cx - 5},${top - 7} q5,-4 10,0" fill="none" stroke="${hairDark}" stroke-width="0.9"/>`;
  }
  if (hairStyle === 'long' || hairStyle === 'braid') {
    out += `<path d="M${cx - w - 3},${eyeY - 8} C${cx - w - 6},${eyeY + 20} ${cx - w - 2},${chin + 8} ${cx - w + 6},${chin + 12} L${cx + w - 6},${chin + 12} C${cx + w + 2},${chin + 8} ${cx + w + 6},${eyeY + 20} ${cx + w + 3},${eyeY - 8}Z" fill="${hairDark}" stroke="${INK}" stroke-width="0.8"/>`;
  }
  // ears
  out += `<ellipse cx="${cx - w + 1}" cy="${eyeY + 3}" rx="3.6" ry="6" fill="${skin}" stroke="${INK}" stroke-width="0.8"/><ellipse cx="${cx + w - 1}" cy="${eyeY + 3}" rx="3.6" ry="6" fill="${skin}" stroke="${INK}" stroke-width="0.8"/>`;
  // face with soft shading on the shadow side
  out += `<path d="${face}" fill="${skin}" stroke="${INK}" stroke-width="1"/>`;
  out += `<path d="M${cx + 4},${top + 2} C${cx + w},${top + 2} ${cx + w + 1},${eyeY} ${cx + w - 2},${eyeY + 8} C${cx + w - 6},${chin - 6} ${cx + 8},${chin - 1} ${cx + 2},${chin - 1} C${cx + 10},${chin - 10} ${cx + 14},${eyeY} ${cx + 4},${top + 2}Z" fill="${skinShade}" opacity="0.45"/>`;
  out += `<ellipse cx="${cx - eyeDx - 2}" cy="${eyeY + 10}" rx="5" ry="3" fill="#d9655a" opacity="${child ? 0.3 : 0.16}"/><ellipse cx="${cx + eyeDx + 2}" cy="${eyeY + 10}" rx="5" ry="3" fill="#d9655a" opacity="${child ? 0.3 : 0.12}"/>`;

  // ---- eyes and brows
  const squint = has('shrewd') ? 0.55 : 1;
  const er = child ? 3.6 : 3.1;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * eyeDx;
    out += `<path d="M${ex - 5},${eyeY} Q${ex},${eyeY - 4.2 * squint} ${ex + 5},${eyeY} Q${ex},${eyeY + 3 * squint} ${ex - 5},${eyeY}Z" fill="#f8f4ea" stroke="${INK}" stroke-width="0.7"/>`;
    out += `<circle cx="${ex + 0.3}" cy="${eyeY - 0.2}" r="${(er * Math.min(1, squint + 0.2)).toFixed(2)}" fill="${eye}"/><circle cx="${ex + 0.3}" cy="${eyeY - 0.2}" r="1.3" fill="#111"/><circle cx="${ex - 0.8}" cy="${eyeY - 1.2}" r="0.7" fill="#fff"/>`;
    out += `<path d="M${ex - 5.4},${eyeY - 0.4} Q${ex},${eyeY - 4.8 * squint} ${ex + 5.4},${eyeY - 0.4}" fill="none" stroke="${INK}" stroke-width="${female ? 1.7 : 1.3}" stroke-linecap="round"/>`;
    if (female && !child) out += `<path d="M${ex + sx * 5},${eyeY - 0.8}l${sx * 2.2},-1.6M${ex + sx * 3.4},${eyeY - 2.2}l${sx * 1.6},-2" stroke="${INK}" stroke-width="0.9" stroke-linecap="round"/>`;
    if (has('frail') || age >= 60) out += `<path d="M${ex - 4},${eyeY + 3.2} Q${ex},${eyeY + 5.4} ${ex + 4},${eyeY + 3.2}" fill="none" stroke="${skinShade}" stroke-width="1.1"/>`;
    const tilt = stern ? 2.4 : smile ? -0.8 : (r() - 0.5) * 1.6;
    const thick = female ? (stern ? 1.9 : 1.4) : has('robust') || stern ? 2.6 : 1.8;
    const by = eyeY - 7.5;
    const inner = ex - sx * 5.5;
    const outer = ex + sx * 6;
    out += `<path d="M${inner},${by + tilt} Q${ex},${by - 2.4} ${outer},${by + 0.8}" fill="none" stroke="${age >= 58 ? mixHex(hairDark, '#dddddd', 0.5) : hairDark}" stroke-width="${thick}" stroke-linecap="round"/>`;
  }
  // nose
  const nl = child ? 7 : 10;
  out += `<path d="M${cx + 1},${eyeY + 1} C${cx + 2},${eyeY + nl * 0.6} ${cx + 4},${eyeY + nl - 1} ${cx + 2},${eyeY + nl}" fill="none" stroke="${skinShade}" stroke-width="1.4" stroke-linecap="round"/>`;
  out += `<path d="M${cx - 3.5},${eyeY + nl + 0.5} Q${cx},${eyeY + nl + 2.6} ${cx + 3.5},${eyeY + nl + 0.5}" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/>`;
  // mouth
  const my = eyeY + nl + 7;
  const mc = smile ? 2.6 : stern ? -1.4 : 0.6;
  if (female && !child) {
    out += `<path d="M${cx - 6},${my} Q${cx - 3},${my - 2.4} ${cx},${my - 1.2} Q${cx + 3},${my - 2.4} ${cx + 6},${my} Q${cx},${my + 3.4 + Math.max(0, mc)} ${cx - 6},${my}Z" fill="#b5534a" stroke="#7a3328" stroke-width="0.8" stroke-linejoin="round"/>`;
    out += `<path d="M${cx - 5.5},${my} Q${cx},${my + mc * 0.6} ${cx + 5.5},${my}" fill="none" stroke="#6a2a22" stroke-width="0.9"/>`;
  } else {
    out += `<path d="M${cx - 6},${my} Q${cx},${my + mc} ${cx + 6},${my}" fill="none" stroke="#7a3328" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  if (smile) out += `<path d="M${cx - 4},${my + 0.6} Q${cx},${my + mc + 1.6} ${cx + 4},${my + 0.6}" fill="#a8483c" opacity="0.5"/>`;
  // age lines
  if (age >= 45) {
    out += `<path d="M${cx - 9},${top + 9} Q${cx},${top + 7} ${cx + 9},${top + 9}" fill="none" stroke="${skinShade}" stroke-width="0.9"/>`;
    out += `<path d="M${cx - 8},${eyeY + 9} Q${cx - 10},${my - 2} ${cx - 8},${my + 2}M${cx + 8},${eyeY + 9} Q${cx + 10},${my - 2} ${cx + 8},${my + 2}" fill="none" stroke="${skinShade}" stroke-width="0.9"/>`;
  }
  if (age >= 60) {
    out += `<path d="M${cx - 10},${top + 13} Q${cx},${top + 11} ${cx + 10},${top + 13}M${cx - eyeDx - 7},${eyeY - 1}l-3,-1.5M${cx - eyeDx - 7},${eyeY + 1.5}l-3,1M${cx + eyeDx + 7},${eyeY - 1}l3,-1.5M${cx + eyeDx + 7},${eyeY + 1.5}l3,1" fill="none" stroke="${skinShade}" stroke-width="0.8"/>`;
  }
  if (scar) {
    const sx = r() < 0.5 ? -1 : 1;
    out += `<path d="M${cx + sx * (eyeDx - 4)},${eyeY - 11} L${cx + sx * (eyeDx + 3)},${eyeY + 9}" stroke="#a5574a" stroke-width="1.5" stroke-linecap="round"/>`;
    out += `<path d="M${cx + sx * (eyeDx - 3)},${eyeY - 7}l${sx * 2.4},-1M${cx + sx * eyeDx},${eyeY + 1}l${sx * 2.4},-1M${cx + sx * (eyeDx + 2)},${eyeY + 6}l${sx * 2.4},-1" stroke="#a5574a" stroke-width="0.8"/>`;
  }

  // ---- beard
  if (beard === 'full') {
    out += `<path d="M${cx - w + 2},${eyeY + 6} C${cx - w + 2},${chin + 2} ${cx - 8},${chin + 10} ${cx},${chin + 10} C${cx + 8},${chin + 10} ${cx + w - 2},${chin + 2} ${cx + w - 2},${eyeY + 6} C${cx + w - 6},${my - 2} ${cx + 10},${my - 3} ${cx + 7},${my - 3} Q${cx},${my - 5} ${cx - 7},${my - 3} C${cx - 10},${my - 3} ${cx - w + 6},${my - 2} ${cx - w + 2},${eyeY + 6}Z" fill="${hair}" stroke="${INK}" stroke-width="0.9"/>`;
    out += `<path d="M${cx - 5},${my + 1} Q${cx},${my + 3} ${cx + 5},${my + 1}" fill="none" stroke="#5a2620" stroke-width="1.4" stroke-linecap="round"/>`;
    out += `<path d="M${cx - 6},${chin} q2,4 0,7M${cx + 4},${chin + 1} q2,4 0,6M${cx - 14},${my + 3} q1,4 -1,7M${cx + 13},${my + 3} q1,4 -1,7" fill="none" stroke="${hairDark}" stroke-width="0.8"/>`;
  } else if (beard === 'goatee') {
    out += `<path d="M${cx - 7},${my - 3} Q${cx},${my - 6} ${cx + 7},${my - 3} L${cx + 6},${my - 1} Q${cx},${my - 3} ${cx - 6},${my - 1}Z" fill="${hair}" stroke="${INK}" stroke-width="0.6"/>`;
    out += `<path d="M${cx - 4},${my + 3} Q${cx},${my + 2} ${cx + 4},${my + 3} L${cx + 2},${chin + 6} L${cx},${chin + 8} L${cx - 2},${chin + 6}Z" fill="${hair}" stroke="${INK}" stroke-width="0.7"/>`;
  } else if (beard === 'moustache') {
    out += `<path d="M${cx},${my - 4} C${cx - 4},${my - 6} ${cx - 10},${my - 4} ${cx - 11},${my + 1} C${cx - 8},${my - 1} ${cx - 4},${my - 1} ${cx},${my - 2} C${cx + 4},${my - 1} ${cx + 8},${my - 1} ${cx + 11},${my + 1} C${cx + 10},${my - 4} ${cx + 4},${my - 6} ${cx},${my - 4}Z" fill="${hair}" stroke="${INK}" stroke-width="0.7"/>`;
  }

  // ---- hair in front
  const crown = top + 1;
  if (hairStyle === 'bald') {
    out += `<path d="M${cx - w - 1},${eyeY - 2} C${cx - w - 2},${eyeY - 14} ${cx - w + 4},${top + 10} ${cx - w + 8},${top + 8} L${cx - w + 6},${eyeY - 6}Z M${cx + w + 1},${eyeY - 2} C${cx + w + 2},${eyeY - 14} ${cx + w - 4},${top + 10} ${cx + w - 8},${top + 8} L${cx + w - 6},${eyeY - 6}Z" fill="${hair}" stroke="${INK}" stroke-width="0.8"/>`;
    out += `<path d="M${cx - 8},${top + 5} Q${cx - 2},${top + 1} ${cx + 4},${top + 3}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>`;
  } else if (hairStyle === 'curly') {
    let d = `M${cx - w - 2},${eyeY - 2}`;
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI + (Math.PI * k) / n;
      const x = cx + Math.cos(a) * (w + 4);
      const y = crown + 14 + Math.sin(a) * 20;
      d += ` Q${(x - Math.cos(a) * 6).toFixed(1)},${(y - 6).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    }
    d += ` L${cx + w - 2},${eyeY - 8} Q${cx},${top + 12} ${cx - w + 2},${eyeY - 8}Z`;
    out += `<path d="${d}" fill="${hair}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>`;
  } else {
    const part = hairStyle === 'swept' ? 8 : r() < 0.5 ? -4 : 4;
    out += `<path d="M${cx - w - 2},${eyeY + (hairStyle === 'short' || hairStyle === 'bun' ? -3 : 8)} C${cx - w - 4},${crown - 4} ${cx - 8},${crown - 8} ${cx + 2},${crown - 7} C${cx + w + 2},${crown - 6} ${cx + w + 5},${eyeY - 12} ${cx + w + 2},${eyeY + (hairStyle === 'short' || hairStyle === 'bun' ? -3 : 8)} C${cx + w - 1},${eyeY - 9} ${cx + w - 4},${top + 12} ${cx + part},${top + 9} C${cx - 6},${top + 14} ${cx - w + 2},${top + 14} ${cx - w + 1},${eyeY - 4}Z" fill="${hair}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>`;
    out += `<path d="M${cx - w + 4},${top + 6} C${cx - 8},${crown - 3} ${cx + 6},${crown - 3} ${cx + w - 6},${top + 4}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="2.2" stroke-linecap="round"/>`;
    if (hairStyle === 'braid') {
      for (let k = 0; k < 4; k++) out += `<ellipse cx="${cx + w + 3}" cy="${eyeY + 10 + k * 7}" rx="3.6" ry="4.2" fill="${hair}" stroke="${INK}" stroke-width="0.7"/>`;
    }
  }

  if (female && !child && (hairStyle === 'bun' || hairStyle === 'swept')) {
    out += `<circle cx="${cx - w + 1}" cy="${eyeY + 10}" r="1.7" fill="url(#pgold)" stroke="${INK}" stroke-width="0.5"/><circle cx="${cx + w - 1}" cy="${eyeY + 10}" r="1.7" fill="url(#pgold)" stroke="${INK}" stroke-width="0.5"/>`;
  }

  // ---- headwear
  if (role === 'ruler') {
    const y0 = crown + 2;
    out += `<path d="M${cx - 19},${y0 + 4} L${cx - 22},${y0 - 12} L${cx - 11},${y0 - 4} L${cx},${y0 - 17} L${cx + 11},${y0 - 4} L${cx + 22},${y0 - 12} L${cx + 19},${y0 + 4}Z" fill="url(#pgold)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`;
    out += `<path d="M${cx - 19},${y0 + 4} L${cx + 19},${y0 + 4} L${cx + 19.5},${y0 + 9} L${cx - 19.5},${y0 + 9}Z" fill="url(#pgold)" stroke="${INK}" stroke-width="1"/>`;
    out += `<circle cx="${cx}" cy="${y0 + 6.5}" r="2" fill="#c0392b" stroke="${INK}" stroke-width="0.5"/><circle cx="${cx - 10}" cy="${y0 + 6.5}" r="1.5" fill="#2f6fc0"/><circle cx="${cx + 10}" cy="${y0 + 6.5}" r="1.5" fill="#2f6fc0"/>`;
    out += `<circle cx="${cx}" cy="${y0 - 17}" r="2" fill="#fff4c8" stroke="${INK}" stroke-width="0.6"/><circle cx="${cx - 22}" cy="${y0 - 12}" r="1.6" fill="#fff4c8" stroke="${INK}" stroke-width="0.6"/><circle cx="${cx + 22}" cy="${y0 - 12}" r="1.6" fill="#fff4c8" stroke="${INK}" stroke-width="0.6"/>`;
  } else if (role === 'heir') {
    out += `<path d="M${cx - w + 1},${top + 12} Q${cx},${top + 4} ${cx + w - 1},${top + 12}" fill="none" stroke="url(#pgold)" stroke-width="2.6"/><circle cx="${cx}" cy="${top + 8}" r="1.8" fill="#c0392b" stroke="${INK}" stroke-width="0.5"/>`;
  }

  out += '<rect width="100" height="120" fill="url(#pvig)"/>';
  return `<svg class="${cls}" viewBox="6 8 88 106" aria-hidden="true">${out}</svg>`;
}
