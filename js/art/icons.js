import { useDef } from './sprites.js';

// Hand-drawn SVG icon set for the interface. Every icon sits in a 24×24 box.
// Resource icons are full colour; interface glyphs use currentColor.

const I = {
  gold: `<ellipse cx="13.5" cy="16" rx="7.5" ry="3.6" fill="#7a5410"/><ellipse cx="13.5" cy="14.6" rx="7.5" ry="3.6" fill="url(#ig-coin)" stroke="#6b4a0c" stroke-width="0.9"/>
    <circle cx="10" cy="10" r="7" fill="url(#ig-coin)" stroke="#6b4a0c" stroke-width="1"/><circle cx="10" cy="10" r="4.6" fill="none" stroke="#a8741a" stroke-width="0.9"/>
    <path d="M10 7.2v5.6M8.3 8.4h2.6a1.2 1.2 0 0 1 0 2.4H9.2a1.2 1.2 0 0 0 0 2.4h2.6" fill="none" stroke="#7a5410" stroke-width="1" stroke-linecap="round"/>`,
  grain: `<path d="M12 22V7" stroke="#8a6a24" stroke-width="1.4" stroke-linecap="round"/>
    <g fill="#f0c95a" stroke="#8a6a24" stroke-width="0.8"><ellipse cx="12" cy="4.6" rx="1.7" ry="2.8"/>
    <ellipse cx="9.4" cy="8" rx="1.6" ry="2.7" transform="rotate(-30 9.4 8)"/><ellipse cx="14.6" cy="8" rx="1.6" ry="2.7" transform="rotate(30 14.6 8)"/>
    <ellipse cx="9.4" cy="12" rx="1.6" ry="2.7" transform="rotate(-30 9.4 12)"/><ellipse cx="14.6" cy="12" rx="1.6" ry="2.7" transform="rotate(30 14.6 12)"/>
    <ellipse cx="9.6" cy="16" rx="1.5" ry="2.5" transform="rotate(-30 9.6 16)"/><ellipse cx="14.4" cy="16" rx="1.5" ry="2.5" transform="rotate(30 14.4 16)"/></g>`,
  timber: `<g stroke="#4a2e14" stroke-width="0.9"><rect x="3" y="12.5" width="16" height="6" rx="3" fill="#a8743f"/><ellipse cx="19" cy="15.5" rx="2.4" ry="3" fill="#e8c38c"/>
    <rect x="5" y="6" width="16" height="6" rx="3" fill="#b8824a"/><ellipse cx="21" cy="9" rx="2.4" ry="3" fill="#f0cf9a"/></g>
    <path d="M7 9h8M5.5 15.5h8" stroke="#6b4422" stroke-width="0.8" stroke-linecap="round"/><circle cx="21" cy="9" r="1" fill="none" stroke="#a8743f" stroke-width="0.6"/><circle cx="19" cy="15.5" r="1" fill="none" stroke="#a8743f" stroke-width="0.6"/>`,
  iron: `<path d="M2.5 18.5l3-6h11l3 6z" fill="#56616c" stroke="#2c333a" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M5.5 12.5l2.4-5h8.2l2.4 5z" fill="url(#ig-iron)" stroke="#2c333a" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M8.6 9h3.6" stroke="#fff" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>`,
  lore: `<path d="M6 4h11a2 2 0 0 1 2 2v12.5a2.5 2.5 0 0 1-2.5 2.5H7" fill="#f2e2b8" stroke="#6b4f22" stroke-width="1"/>
    <path d="M6 4a2 2 0 0 0-2 2v1.5h4V6a2 2 0 0 0-2-2z" fill="#d9c08a" stroke="#6b4f22" stroke-width="1"/>
    <path d="M7 21a2.5 2.5 0 0 1-2.5-2.5V17H14v1.5A2.5 2.5 0 0 0 16.5 21z" fill="#d9c08a" stroke="#6b4f22" stroke-width="1"/>
    <path d="M9 8.5h7M9 11h7M9 13.5h5" stroke="#8a6a3a" stroke-width="0.9" stroke-linecap="round"/>`,
  renown: `<path d="M12 2.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.3l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="#ffd76a" stroke="#8a5f0c" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 5.5l1.7 3.5 3.6.5" fill="none" stroke="#fff6cf" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>`,
  hp: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="#e5594a" stroke="#7a1f16" stroke-width="1"/><path d="M8 9.5a2.2 2.2 0 0 1 2.2-1.4" stroke="#ffc2b8" stroke-width="1" fill="none" stroke-linecap="round"/>',
  // ---- glyphs (currentColor)
  attack: '<path d="M4 20l3-3M6 15l3 3M8.5 15.5L19 5V3h-2L6.5 13.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  defence: '<path d="M12 3l7.5 2.6V11c0 4.7-3.2 8.3-7.5 10-4.3-1.7-7.5-5.3-7.5-10V5.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5v11" stroke="currentColor" stroke-width="1.3" opacity="0.6"/>',
  move: '<path d="M7 4.5c2 0 3 1.6 3 4.5v4.5l6.5 1.8c1.8.5 3 1.8 3 3.7H5V9c0-2.9.6-4.5 2-4.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M5 16h4" stroke="currentColor" stroke-width="1.4"/>',
  range: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  crown: '<path d="M3.5 17.5L2.5 7l5 4 4.5-6.5 4.5 6.5 5-4-1 10.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 20.5h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  castle: '<path d="M3 21V9h3v2h2.5V9h2v3h3V9h2v2H18V9h3v12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 21v-4a2 2 0 0 1 4 0v4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 9V3l4 1.5L12 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  scales: '<path d="M12 4v16M7 20h10M5 7h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1H9M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h7M9 14.5h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6v13" stroke="currentColor" stroke-width="1.4"/>',
  flask: '<path d="M9.5 3h5M10.5 3v6L5 18.5A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.5L13.5 9V3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 15h9" stroke="currentColor" stroke-width="1.4"/>',
  danger: '<path d="M12 3.5l9.5 16.5h-19z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1" fill="currentColor"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  next: '<path d="M5 5l7 7-7 7M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  help: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.8v.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor"/>',
  sound: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  mute: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  minus: '<path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  shrine: '<path d="M12 2.5l1.6 5.2 5.4.1-4.4 3.2 1.7 5.2L12 13l-4.3 3.2 1.7-5.2L5 7.8l5.4-.1z" fill="currentColor"/><path d="M6 21h12M8 21v-3h8v3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  hammer: '<path d="M14 6.5l3.5 3.5M4 20l9-9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M11 5.5l4-2.5 5.5 5.5-2.5 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  skull: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 4 2.8 5v3h9.4v-3c1.7-1 2.8-2.6 2.8-5 0-4-3.1-7-7.5-7z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="1.8" fill="currentColor"/><circle cx="15" cy="11" r="1.8" fill="currentColor"/><path d="M10.5 18.5v2M13.5 18.5v2" stroke="currentColor" stroke-width="1.4"/>',
  dove: '<path d="M3 13c3 0 5-1 7-4 1-1.5 2.5-3 5-3 1.5 0 2.5.7 3 1.6l2.5.4-2.2 1.6c0 4.4-3.3 8.4-9.3 8.4-2.3 0-4.4-.7-6-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="8" r="0.9" fill="currentColor"/>',
};

const ALIAS = { '💰': 'gold', '🌾': 'grain', '🪵': 'timber', '⛏': 'iron', '📜': 'lore', '★': 'renown', '❤': 'hp', '⚔': 'attack', '🛡': 'defence', '🥾': 'move', '🎯': 'range', '👑': 'crown', '🏰': 'castle', '⚖': 'scales' };

const DEFS = [
  ['ig-coin', '<radialGradient id="ig-coin" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff2b0"/><stop offset="0.55" stop-color="#f0c040"/><stop offset="1" stop-color="#a8741a"/></radialGradient>'],
  ['ig-iron', '<linearGradient id="ig-iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e2ea"/><stop offset="1" stop-color="#6d7c8a"/></linearGradient>'],
];

// Inline <svg>. Shared gradients are registered once in a hidden defs block.
export function icon(name, cls = '') {
  const key = ALIAS[name] ?? name;
  const body = I[key];
  if (!body) return '';
  for (const [id, markup] of DEFS) if (body.includes(`#${id})`)) useDef(id, markup);
  return `<svg class="ico ico-${key}${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// Swap the emoji the rules engine writes into log lines for matching icons.
const LOG_ICONS = { '💰': 'gold', '🌾': 'grain', '🪵': 'timber', '⛏': 'iron', '📜': 'lore', '⚔': 'attack', '🏰': 'castle', '☠': 'skull', '💀': 'skull', '👑': 'crown', '🕊': 'dove', '⬆': 'hammer', '⛪': 'shrine', '⭐': 'renown', '🔥': 'danger', '🍞': 'grain', '⚱': 'skull', '👶': 'crown' };
const LOG_RE = new RegExp(`(${Object.keys(LOG_ICONS).join('|')})\\uFE0F?`, 'gu');
export function iconize(escapedText) {
  return escapedText.replace(LOG_RE, (m, e) => icon(LOG_ICONS[e], 'inline'));
}
