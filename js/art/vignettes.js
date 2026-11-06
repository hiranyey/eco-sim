// Woodcut-style vignettes for court events: ink on parchment, one small scene per event.
const INK = '#3a2814';
const PAPER = '#f6ecd0';
const WASH = '#e9d7a8';

const ln = (d, w = 1.4) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const sh = (d, fill = PAPER, w = 1.3) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;

function hatch(x0, y0, x1, y1, step = 4, w = 0.7) {
  let d = '';
  for (let x = x0; x < x1; x += step) d += `M${x},${y1}L${Math.min(x1, x + (y1 - y0))},${y0}`;
  return `<path d="${d}" stroke="${INK}" stroke-width="${w}" opacity="0.45"/>`;
}

function sun(x, y, r = 11) {
  let rays = '';
  for (let k = 0; k < 12; k++) {
    const a = (Math.PI * 2 * k) / 12;
    rays += `M${(x + Math.cos(a) * (r + 3)).toFixed(1)},${(y + Math.sin(a) * (r + 3)).toFixed(1)}L${(x + Math.cos(a) * (r + (k % 2 ? 7 : 10))).toFixed(1)},${(y + Math.sin(a) * (r + (k % 2 ? 7 : 10))).toFixed(1)}`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${WASH}" stroke="${INK}" stroke-width="1.2"/>${ln(rays, 1)}`;
}

function moon(x, y, r = 10) {
  return sh(`M${x + r * 0.4},${y - r} A${r},${r} 0 1 0 ${x + r * 0.4},${y + r} A${r * 0.75},${r * 0.75} 0 1 1 ${x + r * 0.4},${y - r}Z`, WASH, 1.2);
}

function hills(y = 70) {
  return sh(`M0,${y} Q40,${y - 18} 80,${y - 6} T160,${y - 10} T240,${y - 4} V100 H0Z`, WASH, 1.1)
    + ln(`M14,${y - 4}q6,-3 12,0M58,${y - 8}q5,-3 10,0M188,${y - 8}q6,-3 12,0`, 0.8);
}

function ground(y = 84) {
  let d = `M0,${y} Q60,${y - 4} 120,${y} T240,${y}`;
  for (let x = 8; x < 236; x += 9) d += `M${x},${y + 4}l-3,6`;
  return sh(`M0,${y} Q60,${y - 4} 120,${y} T240,${y} V100 H0Z`, '#e3cf9a', 1.1) + ln(d.slice(d.indexOf('M', 2)), 0.7);
}

function pine(x, y, h) {
  const w = h * 0.32;
  let d = '';
  for (let k = 0; k < 3; k++) {
    const t = y - h + k * h * 0.26;
    const b = t + h * 0.42;
    const ww = w * (0.6 + k * 0.25);
    d += `M${x},${t}L${x + ww},${b}L${x - ww},${b}Z`;
  }
  return sh(d, '#d9c48c', 1.1) + ln(`M${x},${y - h * 0.15}V${y}`, 1.8);
}

function sheaf(x, y) {
  let d = '';
  for (let k = -4; k <= 4; k++) d += `M${x + k * 1.2},${y}L${x + k * 3.2},${y - 30}`;
  let heads = '';
  for (let k = -4; k <= 4; k++) heads += `<ellipse cx="${x + k * 3.4}" cy="${y - 33}" rx="2" ry="4.5" transform="rotate(${k * 6} ${x + k * 3.4} ${y - 33})" fill="${WASH}" stroke="${INK}" stroke-width="0.9"/>`;
  return ln(d, 1) + heads + sh(`M${x - 7},${y - 14}h14v4h-14z`, '#c9a660', 1);
}

function figure(x, y, staff = true, hood = true) {
  return sh(`M${x - 6},${y}L${x - 3},${y - 16}Q${x},${y - 20} ${x + 3},${y - 16}L${x + 6},${y}Z`, '#d9c48c', 1)
    + `<circle cx="${x}" cy="${y - 21}" r="3.6" fill="${hood ? '#cbb27a' : PAPER}" stroke="${INK}" stroke-width="1"/>`
    + (staff ? ln(`M${x + 8},${y}L${x + 5},${y - 28}M${x + 5},${y - 28}q3,-2 2,-5`, 1.2) : '');
}

function tent(x, y, w, h, stripes) {
  let d = `M${x - w},${y}L${x},${y - h}L${x + w},${y}Z`;
  let s = '';
  for (let k = 1; k < stripes; k++) s += `M${x},${y - h}L${x - w + (2 * w * k) / stripes},${y}`;
  return sh(d, PAPER) + ln(s, 0.9) + sh(`M${x - w * 0.25},${y}L${x},${y - h * 0.45}L${x + w * 0.25},${y}Z`, INK, 0.8)
    + ln(`M${x},${y - h}V${y - h - 12}`, 1.2) + sh(`M${x},${y - h - 12}l10,3-10,3z`, '#c0392b', 0.9);
}

const SCENES = {
  harvest: () => sun(196, 26) + hills(68) + ground(84) + sheaf(70, 86) + sheaf(104, 88) + sheaf(138, 86)
    + ln('M168,86q14,-26 30,-10M168,86l-6,8', 1.8),
  vein: () => hills(66) + sh('M60,86 Q60,30 120,26 Q180,30 182,86Z', WASH) + hatch(70, 40, 175, 86, 6)
    + sh('M100,86V52Q120,38 140,52V86Z', INK, 1) + ln('M96,86V50h48v36M94,50h52', 2.4)
    + ground(86) + ln('M164,84l26,-26M182,52q12,4 16,16M182,52q-2,10 -14,14', 2)
    + sh('M40,84h30l-4,-12h-22z', PAPER) + `<circle cx="47" cy="86" r="4" fill="${PAPER}" stroke="${INK}"/><circle cx="64" cy="86" r="4" fill="${PAPER}" stroke="${INK}"/>`
    + sh('M46,72l5,-7 6,3 5,-5 4,9z', '#8d8578', 0.9),
  forest: () => sun(40, 24, 9) + hills(70) + pine(70, 86, 52) + pine(104, 88, 66) + pine(140, 86, 58) + pine(176, 88, 46) + pine(200, 86, 34) + ground(86)
    + sh('M118,92h18v-8h-18z', '#d9c48c') + `<ellipse cx="127" cy="84" rx="9" ry="3" fill="${WASH}" stroke="${INK}"/>` + ln('M130,82l12,-12M138,68l8,6', 1.6),
  mercenaries: () => sun(200, 22, 8) + ln('M60,24l2,46M92,14l2,56M124,20l2,50M156,16l2,54M186,26l2,44', 1.6)
    + ['M62,26l14,4-14,4', 'M94,16l14,4-14,4', 'M126,22l14,4-14,4', 'M158,18l14,4-14,4', 'M188,28l12,4-12,4'].map((d, k) => sh(d, k % 2 ? '#c0392b' : '#2f6fc0', 0.9)).join('')
    + [64, 96, 128, 160, 190].map((x) => sh(`M${x - 8},74q0,-12 8,-14q8,2 8,14z`, '#b8b0a0', 1) + ln(`M${x - 6},68h12`, 1)).join('')
    + hills(74) + ground(88),
  chronicle: () => sh('M50,86 Q86,70 120,80 Q154,70 190,86 L190,40 Q154,26 120,36 Q86,26 50,40Z', PAPER)
    + ln('M120,36V80M60,46q24,-8 50,-2M60,54q24,-8 50,-2M60,62q24,-8 50,-2M130,44q26,-6 50,2M130,52q26,-6 50,2M130,60q26,-6 50,2', 0.9)
    + sh('M196,86h20v-12h-20z', INK) + ln('M206,74L230,22', 1.4) + sh('M230,22q-12,6 -18,24q10,-6 18,-24z', PAPER, 1)
    + sh('M24,86h14V58h-14z', PAPER) + sh('M31,58q-6,-8 0,-16q6,8 0,16z', '#f0c040', 1),
  tournament: () => sun(206, 20, 8) + hills(70) + tent(64, 82, 26, 40, 5) + tent(176, 82, 26, 40, 5) + ground(84)
    + ln('M90,92L150,40M150,92L90,40', 2.6) + sh('M116,64h8v8h-8z', '#c0392b', 0.8),
  education: () => sh('M40,86h70v-10h-70zM46,76h60v-10h-60zM42,66h66v-10h-66z', PAPER) + ln('M48,81h56M52,71h48M48,61h54', 0.7)
    + sh('M130,86h30l-6,-14 6,-14h-30l6,14z', PAPER) + sh('M138,72q7,-9 14,0q-7,9 -14,0z', '#f0d080', 0.9)
    + `<circle cx="194" cy="54" r="20" fill="${WASH}" stroke="${INK}" stroke-width="1.3"/>` + ln('M174,54h40M194,34v40M194,34q-12,20 0,40M194,34q12,20 0,40M178,44q16,4 32,0M178,64q16,-4 32,0', 0.8)
    + ln('M170,54a24,24 0 0 0 48,0', 1.6) + sh('M188,86h12l-2,-8h-8z', '#c9a660', 1) + ln('M194,78v-4', 1.6),
  plague: () => moon(196, 26, 12) + hills(72) + ln('M40,86C50,60 60,50 84,44M64,56L50,40M74,48L84,30M84,44l20,-6', 2)
    + sh('M92,40q6,-10 16,-6l8,-2-6,6q2,10 -8,12l-6,6 0,-6q-6,0 -4,-10z', INK, 1) + `<circle cx="106" cy="35" r="1.2" fill="${PAPER}"/>`
    + ground(86) + sh('M140,86V52h40v34z', PAPER) + sh('M136,52l24,-18 24,18z', WASH) + ln('M160,58v22M150,68h20', 2.4),
  bandits: () => moon(40, 22, 9) + hills(70) + pine(204, 86, 50) + ground(86)
    + sh('M104,86l16,-10 16,10z', '#c9a660') + sh('M108,78q4,-18 12,-28q4,12 10,10q2,10 -4,18z', '#f0c040', 1) + sh('M114,78q2,-8 6,-12q4,8 4,12z', '#c0392b', 0.8)
    + ln('M62,40l30,30M92,40l-30,30', 2.4) + ln('M58,36l8,8M96,36l-8,8', 3.2) + figure(160, 86, false, true),
  pilgrims: () => sun(206, 24, 8) + sh('M120,60 Q160,40 238,48 V100 H120Z', WASH, 1.1)
    + sh('M168,50v-16q3,-4 6,0v16zM182,48v-20q3,-4 6,0v20zM196,50v-14q3,-4 6,0v14z', '#cbbf9e', 1)
    + `<circle cx="185" cy="38" r="6" fill="#f6dc8f" stroke="${INK}"/>` + ground(86) + ln('M20,90Q80,80 140,74T200,56', 1, ) + figure(48, 88) + figure(80, 84) + figure(110, 80),
  assassin: () => moon(52, 30, 13) + sh('M140,92V36Q170,10 200,36V92Z', '#d9c48c') + sh('M150,92V42Q170,24 190,42V92Z', INK, 1) + ln('M170,26V92M150,58h40', 1.2)
    + sh('M98,28l6,-4 22,48 -4,6z', '#e8e4dc', 1.1) + ln('M101,27l20,47', 0.6)
    + sh('M90,30l22,-10 2,4-22,10z', '#c9a660', 1) + sh('M92,22l-6,-12 5,-2 6,12z', '#5a3a22', 1) + `<circle cx="87" cy="8" r="3.4" fill="#c9a660" stroke="${INK}"/>`
    + sh('M122,78q3,6 0,10q-3,-4 0,-10z', '#c0392b', 0.8) + ground(92),
  marriage: () => sun(120, 30, 10) + ln('M30,70q20,-30 40,-10M210,70q-20,-30 -40,-10', 1.2)
    + sh('M54,86V40h4l20,6-20,6v34z', '#2f6fc0', 1) + sh('M186,86V40h-4l-20,6 20,6v34z', '#c0392b', 1)
    + `<circle cx="110" cy="68" r="14" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="110" cy="68" r="14" fill="none" stroke="#f0c850" stroke-width="3"/>`
    + `<circle cx="130" cy="68" r="14" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="130" cy="68" r="14" fill="none" stroke="#f0c850" stroke-width="3"/>`
    + `<path d="M118.5,55.6 A14,14 0 0 1 121.5,80" fill="none" stroke="#f0c850" stroke-width="3"/>` + ground(90),
  envoy: () => sun(40, 24, 9) + hills(70)
    + sh('M168,88V46h9v-8h8v8h9v-8h8v8h9v-8h8v8h9V88z', WASH, 1.2) + sh('M190,88v-16a9,9 0 0 1 18,0v16z', INK, 1) + hatch(168, 46, 238, 88, 6, 0.5)
    + ground(90) + ln('M62,90V34', 1.8) + sh('M62,34q14,-4 28,2q-6,6 0,12q-14,-6 -28,-2z', '#3a7d4a', 1)
    + figure(104, 90, true, true) + sh('M112,58h36v22h-36z', PAPER, 1.2) + ln('M116,64h28M116,69h24M116,74h18', 0.8)
    + `<circle cx="146" cy="80" r="5" fill="#c0392b" stroke="${INK}" stroke-width="1"/>` + ln('M144,85l-2,6M148,85l2,6', 1),
  demand: () => moon(200, 24, 10) + hills(70) + ground(90)
    + sh('M117,46h6v40l-3,7-3,-7z', '#ece6d6', 1.1) + ln('M120,50v34', 0.6) + sh('M102,41h36v5h-36z', '#c9a660', 1.1)
    + sh('M117,24h6v17h-6z', '#5a3a22', 1) + `<circle cx="120" cy="21" r="4.2" fill="#c9a660" stroke="${INK}" stroke-width="1"/>`
    + [[90, 92], [102, 89], [114, 93], [128, 90], [140, 92], [152, 89], [98, 84], [126, 84], [140, 84], [110, 80], [133, 78]]
      .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="3.4" fill="#e8c860" stroke="${INK}" stroke-width="1"/>`).join(''),
  call_to_arms: () => sun(120, 24, 9) + hills(70) + ground(90)
    + ln('M66,90L96,28', 2) + sh('M96,28l-32,2 6,10 -9,9 31,-3z', '#c0392b', 1.1)
    + ln('M174,90L144,28', 2) + sh('M144,28l32,2 -6,10 9,9 -31,-3z', '#2f6fc0', 1.1)
    + sh('M92,72Q120,86 148,60l7,6Q126,98 90,80z', WASH, 1.2) + sh('M148,60l12,-8 4,18 -9,-4z', '#c9a660', 1.1)
    + ln('M104,78q4,-3 8,0M118,80q4,-3 8,-1', 0.8) + ln('M166,54l10,-6M168,62l12,0M166,70l10,6', 1),
  peace_offer: () => sun(196, 24, 9) + hills(72) + ln('M40,90V30', 2) + sh('M40,30q20,-6 40,2q-8,8 0,16q-20,-8 -40,-2z', PAPER, 1.1) + ground(88)
    + sh('M110,56q20,-24 46,-18q-10,4 -14,12q18,-2 30,6q-24,6 -40,2q-10,8 -24,6q6,-4 2,-8z', PAPER, 1.2)
    + `<circle cx="154" cy="42" r="1.4" fill="${INK}"/>` + sh('M158,40l8,1-8,3z', '#e8b04a', 0.8)
    + ln('M166,46q14,6 26,2', 1.2) + sh('M174,48q3,-5 6,0q-3,4 -6,0zM184,48q3,-5 6,0q-3,4 -6,0z', '#9cb06a', 0.8),
};

export function vignette(id) {
  const scene = SCENES[id];
  if (!scene) return '';
  return `<svg class="vignette" viewBox="0 0 240 100" aria-hidden="true"><defs><clipPath id="vclip"><rect x="2" y="2" width="236" height="96" rx="8"/></clipPath></defs>
    <g clip-path="url(#vclip)"><rect width="240" height="100" fill="${PAPER}"/>${scene()}</g>
    <rect x="2" y="2" width="236" height="96" rx="8" fill="none" stroke="${INK}" stroke-width="1.6"/><rect x="5.5" y="5.5" width="229" height="89" rx="6" fill="none" stroke="${INK}" stroke-width="0.6" opacity="0.6"/></svg>`;
}
