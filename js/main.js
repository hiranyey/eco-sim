// Hexmarch UI controller: start screen, input, panels, turn flow and animation.
import { newGame } from './world.js';
import {
  UNITS, RECRUITABLE, BUILDINGS, GOODS, TERRAIN, TRAITS, FACTIONS, DIFFICULTY, RENOWN_TO_WIN, TURN_LIMIT, CITY_LEVELS,
  TECHS, BRANCHES, POLICIES, POLICY_COST,
} from './data.js';
import {
  unitAt, cityAt, citiesOf, reachable, pathTo, attackTargets, combatPreview, moveUnit, attack, recruit,
  upgradeCity, build, trade, quote, income, unitCost, upgradeCost, buildingCost, canAfford, relation, declareWar,
  offerPeace, peaceTerms, strength, endTurn, beginTurn, currentFaction, canAttack, readyUnits, hostile, defenseBonus,
  recruitLimit, renownIncome, movePoints, threatTiles, recruitSpot, baseAtk, baseDef, techAvailable, setResearch,
  policySlots, policyAvailable, adoptPolicy, dropPolicy,
} from './rules.js';
import { aiTurn } from './ai.js';
import { eventView, resolveEvent } from './events.js';
import { createBoard, ICONS } from './board.js';
import { maxHp } from './world.js';
import { sfx, isMuted, setMuted } from './audio.js';

const SAVE_KEY = 'hexmarch-save-v1';
const PREFS_KEY = 'hexmarch-prefs';
const root = document.getElementById('app');
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noHover = window.matchMedia?.('(hover: none)').matches;

let prefs = { speed: 'normal', seenTutorial: false };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { /* ignore */ }
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };
const SPEEDS = { normal: 1, fast: 0.5, instant: 0 };

const costHtml = (cost) => Object.entries(cost).filter(([, v]) => v > 0)
  .map(([k, v]) => `<span class="cost">${k === 'gold' ? '💰' : GOODS[k].icon}${v}</span>`).join('');
const iconSvg = (type, color) => `<svg class="mini-unit" viewBox="-16 -16 32 32" style="--c:${color}"><circle r="15" class="body"/><g class="icon">${ICONS[type]}</g></svg>`;

const ui = {
  s: null, board: null, busy: false, selectedUnit: null, selectedTile: null, reach: null, targets: [], hoverTarget: null,
  tab: 'select', armedTarget: null, confirmWar: null, undo: null, showDanger: false,
};

function boardState() {
  const s = ui.s;
  return {
    reach: ui.reach, targets: ui.targets, hoverTarget: ui.hoverTarget, selectedTile: ui.selectedTile, selectedUnit: ui.selectedUnit,
    myTurn: myTurn(), canAttackFn: (u) => attackTargets(s, u).length > 0,
    danger: ui.showDanger && myTurn() ? threatTiles(s, s.playerId) : null,
  };
}

// ---------------------------------------------------------------- game screen
function mountGame(s) {
  ui.s = s;
  ui.selectedUnit = null;
  ui.selectedTile = null;
  ui.reach = null;
  ui.targets = [];
  ui.tab = 'select';
  root.innerHTML = `
    <div class="game">
      <header class="bar">
        <div class="logo">Hex<span>march</span></div>
        <div class="turn"></div>
        <div class="res"></div>
        <div class="race" title="First house to ${RENOWN_TO_WIN} renown wins"></div>
        <div class="tools">
          <button data-act="help" title="How to play (H)">?</button>
          <button data-act="mute" class="mute" title="Sound on/off"></button>
          <button data-act="menu" title="Menu">☰</button>
        </div>
      </header>
      <main class="stage">
        <section class="board-wrap">
          <svg class="board" role="img" aria-label="The Marches"></svg>
          <div class="banner"></div>
          <div class="tip"></div>
          <div class="map-tools">
            <button data-act="danger" class="chip" title="Shade every hex enemies can strike next turn (D)">⚠ Danger zones</button>
          </div>
          <div class="board-actions">
            <button class="undo" data-act="undo" title="Take back your last move (U)">↶ Undo move</button>
            <button class="next" data-act="next" title="Select next ready unit (N)">Next unit</button>
            <button class="end" data-act="end" title="End turn (E)">End turn</button>
          </div>
        </section>
        <aside class="side">
          <nav class="tabs">
            <button data-act="tab" data-v="select">Selection</button>
            <button data-act="tab" data-v="market">Market</button>
            <button data-act="tab" data-v="research">Research</button>
            <button data-act="tab" data-v="court">Court</button>
            <button data-act="tab" data-v="log">Chronicle</button>
          </nav>
          <div class="pane"></div>
        </aside>
      </main>
      <div class="modal"></div>
      <div class="toasts"></div>
    </div>`;
  ui.board = createBoard(root.querySelector('.board'), { onTileClick, onTileHover, onCancel: deselect });
  ui.board.build(s);
  root.querySelector('.game').addEventListener('click', onClick);
  render();
  if (!prefs.seenTutorial) showHelp(true);
  else afterPlayerTurnStarts();
}

const myTurn = () => !ui.busy && !ui.s.winner && currentFaction(ui.s) === ui.s.playerId && !ui.s.pendingEvents.length;
const me = () => ui.s.factions[ui.s.playerId];

function render() {
  const s = ui.s;
  ui.board.render(boardState());
  renderBar();
  renderPane();
  const ready = myTurn() ? readyUnits(s, s.playerId).length : 0;
  const end = root.querySelector('.end');
  end.disabled = !myTurn();
  end.innerHTML = myTurn() ? `End turn${ready ? ` <small>${ready} ready</small>` : ''}` : 'Waiting…';
  end.classList.toggle('glow', myTurn() && ready === 0);
  root.querySelector('.next').disabled = !myTurn() || !ready;
  root.querySelector('.undo').hidden = !(ui.undo && myTurn());
  root.querySelector('[data-act="danger"]').classList.toggle('on', ui.showDanger);
  root.querySelector('.mute').textContent = isMuted() ? '🔇' : '🔊';
}

function renderBar() {
  const s = ui.s;
  const f = me();
  const inc = income(s, s.playerId);
  const net = inc.grain - inc.upkeep;
  root.querySelector('.turn').innerHTML = `<b>Turn ${s.turn}</b><small>of ${TURN_LIMIT}</small>`;
  const r = (icon, v, d, title, warn = false) => `<div class="r${warn ? ' warn' : ''}" title="${title}"><span>${icon}</span><b>${v}</b><small class="${d < 0 ? 'neg' : 'pos'}">${d >= 0 ? '+' : ''}${d}</small></div>`;
  root.querySelector('.res').innerHTML =
    r('💰', f.gold, inc.gold, 'Gold: recruits, upgrades and buildings') +
    r('🌾', f.grain, net, `Grain: each soldier eats 1 per turn (${inc.grain} grown, ${inc.upkeep} eaten). If it runs out, soldiers starve.`, f.grain + net < 0) +
    r('🪵', f.timber, inc.timber, 'Timber: archers, catapults, upgrades and buildings') +
    r('⛏', f.iron, inc.iron, 'Iron: spearmen, cavalry, knights') +
    loreChip(f, inc.lore);
  root.querySelector('.race').innerHTML = s.factions.map((x) => `
    <div class="runner ${x.alive ? '' : 'dead'} ${x.id === s.playerId ? 'me' : ''} ${currentFaction(s) === x.id ? 'active' : ''}" title="${esc(x.name)}: ${x.renown} renown">
      <span class="nm">${esc(x.short)}</span><span class="track"><span style="width:${Math.min(100, (x.renown / RENOWN_TO_WIN) * 100)}%;background:${x.color}"></span></span><b>${x.renown}</b>
    </div>`).join('');
}

function loreChip(f, gain) {
  const T = f.research ? TECHS[f.research] : null;
  const idle = !T && Object.keys(TECHS).some((k) => techAvailable(ui.s, ui.s.playerId, k));
  const title = T ? `Researching ${T.name}: ${f.lore}/${T.cost} lore` : idle ? 'Nothing being researched: lore is banked. Click to choose.' : 'Lore';
  return `<button class="r lore${idle ? ' idle' : ''}" data-act="tab" data-v="research" title="${esc(title)}"><span>📜</span><b>${T ? `${Math.min(f.lore, T.cost)}/${T.cost}` : f.lore}</b><small class="pos">+${gain}</small>${T ? `<i class="lore-bar"><i style="width:${Math.min(100, (f.lore / T.cost) * 100)}%"></i></i>` : ''}</button>`;
}

// ---------------------------------------------------------------- side panes
function renderPane() {
  root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === ui.tab));
  const pane = root.querySelector('.pane');
  const html = { select: paneSelect, market: paneMarket, research: paneResearch, court: paneCourt, log: paneLog }[ui.tab]();
  if (pane.dataset.html !== html) {
    const top = pane.scrollTop;
    pane.innerHTML = html;
    pane.dataset.html = html;
    pane.scrollTop = top;
  }
}

function statLine(u) {
  const U = UNITS[u.type];
  return `<div class="stats"><span title="Attack">⚔ ${baseAtk(ui.s, u.owner, u.type)}</span><span title="Defence">🛡 ${baseDef(ui.s, u.owner, u.type)}</span><span title="Movement">🥾 ${movePoints(ui.s, u)}</span><span title="Range">🎯 ${U.range}</span></div>`;
}

function unitCard(u) {
  const s = ui.s;
  const U = UNITS[u.type];
  const owner = u.owner < 0 ? { name: 'Rebels', color: '#6d6a75' } : s.factions[u.owner];
  const max = maxHp(s, u.type, u.owner, u.vet);
  const mine = u.owner === s.playerId;
  let status = '';
  if (mine && myTurn()) {
    const canMove = !u.moved;
    const canHit = canAttack(s, u);
    status = canMove && canHit ? 'Ready to move and attack' : canHit ? (attackTargets(s, u).length ? 'Can still attack' : 'Can attack (no targets in range)') : canMove ? 'Can still move' : 'Done for this turn';
  }
  const ruler = u.type === 'ruler' && u.owner >= 0 ? s.characters[s.factions[u.owner].rulerId] : null;
  return `<div class="card unit-card" style="--c:${owner.color}">
    <div class="row">${iconSvg(u.type, owner.color)}<div><b>${ruler ? `${esc(ruler.name)}, ` : ''}${U.name}</b><div class="muted">${esc(owner.name)} · ${TERRAIN[s.tiles[u.tile].t].name}${defenseBonus(s, u) > 1 ? ` (×${defenseBonus(s, u)} defence)` : ''}</div></div></div>
    <div class="hpbar"><span style="width:${(u.hp / max) * 100}%"></span><em>${u.hp} / ${max} HP</em></div>
    ${statLine(u)}
    <p class="muted small">${U.desc}</p>
    ${status ? `<p class="status">${status}</p>` : ''}
    ${mine && myTurn() && (!u.moved || !u.attacked) ? '<button class="ghost small" data-act="hold" title="Skip this unit; units that hold still heal (F)">Hold position</button>' : ''}
  </div>`;
}

function cityCard(c) {
  const s = ui.s;
  const f = me();
  const mine = c.owner === s.playerId;
  const owner = c.owner < 0 ? { name: 'Free town (rebels)', color: '#6d6a75' } : s.factions[c.owner];
  const L = CITY_LEVELS[c.level];
  const tiles = s.tiles.map((t, i) => i).filter((i) => s.tiles[i].city === c.id);
  const yields = {};
  for (const t of tiles) { const y = TERRAIN[s.tiles[t].t].yields; yields[y] = (yields[y] ?? 0) + L.tileYield; }
  let out = `<div class="card city-card" style="--c:${owner.color}">
    <div class="row"><div class="castle">🏰</div><div><b>${esc(c.name)}</b>${c.capital ? ' <span class="tag">Capital</span>' : ''}<div class="muted">${esc(owner.name)} · Level ${c.level}</div></div></div>
    <div class="yields">💰${L.gold + (c.capital ? 2 : 0)} ${c.capital ? '🌾+2 ' : ''}${Object.entries(yields).map(([k, v]) => `${GOODS[k].icon}${v}`).join(' ')}<span class="muted small">per turn</span></div>`;
  if (!mine) {
    out += `<p class="muted small">${c.owner < 0 ? 'Walk a unit into an empty free town to claim it (+2 renown).' : hostile(s, s.playerId, c.owner) ? 'At war: take it by moving a unit into it once it is empty (+4 renown, +8 for a capital).' : 'You are at peace with its owner.'}</p></div>`;
    return out;
  }
  const can = myTurn();
  // Upgrade
  if (c.level < 3) {
    const cost = upgradeCost(s, s.playerId, c);
    out += `<div class="act-row"><div><b>Grow to level ${c.level + 1}</b><div class="muted small">More gold${c.level === 2 ? ', double yields, +2 renown' : ''}, +1 building slot</div></div>
      <button data-act="upgrade" data-v="${c.id}" ${can && canAfford(f, cost) ? '' : 'disabled'}>${costHtml(cost)}</button></div>`;
  }
  // Buildings
  const used = c.buildings.filter((b) => b !== 'cathedral').length;
  out += `<h4>Buildings <span class="muted">${used}/${c.level} slots</span></h4><div class="blds">`;
  for (const [k, B] of Object.entries(BUILDINGS)) {
    const has = c.buildings.includes(k);
    const cost = buildingCost(s, s.playerId, k);
    const realmHasCathedral = k === 'cathedral' && s.cities.some((x) => x.owner === s.playerId && x.buildings.includes('cathedral'));
    const blocked = has || (B.minLevel && c.level < B.minLevel) || (k !== 'cathedral' && used >= c.level) || realmHasCathedral;
    out += `<button class="bld ${has ? 'has' : ''}" data-act="build" data-v="${c.id}" data-b="${k}" ${!has && can && !blocked && canAfford(f, cost) ? '' : 'disabled'} title="${esc(B.desc)}">
      <b>${has ? '✓ ' : ''}${B.name}</b><small>${esc(B.desc)}</small>${has ? '' : `<span>${costHtml(cost)}</span>`}</button>`;
  }
  out += '</div>';
  // Recruit
  const left = recruitLimit(c) - c.recruits;
  const blocked = recruitSpot(s, c) == null;
  out += `<h4>Recruit <span class="muted">${left > 0 ? `${left} left this turn` : 'done this turn'}</span></h4>
    ${blocked ? '<p class="muted small">No free hex in or beside the town to muster troops.</p>' : unitAt(s, c.tile) ? '<p class="muted small">The town is occupied, so recruits will muster beside it.</p>' : ''}<div class="recruits">`;
  for (const t of RECRUITABLE) {
    const cost = unitCost(s, s.playerId, t, c);
    const ok = can && left > 0 && !blocked && canAfford(f, cost);
    const U = UNITS[t];
    out += `<button class="rec" data-act="recruit" data-v="${c.id}" data-u="${t}" ${ok ? '' : 'disabled'} title="${esc(U.desc)}">
      ${iconSvg(t, s.factions[s.playerId].color)}<b>${U.name}</b><small>⚔${baseAtk(s, s.playerId, t)} 🛡${baseDef(s, s.playerId, t)} 🥾${U.move + (t === 'knight' && f.techs.includes('stirrups') ? 1 : 0) + (t === 'cavalry' && f.key === 'ashkar' ? 1 : 0)}${U.range > 1 ? ` 🎯${U.range}` : ''} ❤${U.hp}</small><span>${costHtml(cost)}</span></button>`;
  }
  out += '</div></div>';
  return out;
}

function goals() {
  const s = ui.s;
  const f = me();
  const t = s.tut ?? {};
  const list = [
    ['Move a unit (click it, then a lit hex)', t.moved],
    ['Win a fight (hover a red ring first)', f.stats.kills > 0],
    ['Claim a town (walk into an empty one)', f.stats.captures > 0],
    ['Recruit a unit (click your town)', t.recruited],
    ['Stand on a shrine ✦ for renown', (f.stats.renown.shrines ?? 0) > 0],
    ['Grow a town or add a building', f.stats.built > 0],
    ['Pick something to research (📜)', f.research != null || f.techs.length > 0],
  ];
  if (list.every(([, d]) => d) || s.turn > 15) return '';
  return `<div class="card goals"><b>Early goals</b>${list.map(([txt, d]) => `<div class="goal ${d ? 'done' : ''}"><span>${d ? '✔' : '○'}</span>${txt}</div>`).join('')}</div>`;
}

function paneSelect() {
  const s = ui.s;
  if (ui.selectedTile == null) {
    const f = me();
    const ruler = s.characters[f.rulerId];
    return `<div class="card intro" style="--c:${f.color}">
      <b>${esc(f.name)}</b><p class="muted">${esc(FACTIONS[s.playerId].bonus)}: ${esc(FACTIONS[s.playerId].bonusDesc)}</p>
      <p>Ruled by <b>${esc(ruler.name)}</b>, age ${ruler.age}.</p></div>
      ${goals()}
      <div class="howto-mini">
        <p><b>Click a unit</b> to see where it can go. <b>Red rings</b> are enemies in range: hover one to preview the fight.</p>
        <p><b>Click a town</b> to recruit, grow it, or add buildings.</p>
        <p>Win renown by taking towns ${'(+2/+4/+8)'}, holding shrines <span class="gold">✦</span> (+1 per turn each), winning battles and building. First to <b>${RENOWN_TO_WIN}</b> wins.</p>
      </div>`;
  }
  const u = unitAt(s, ui.selectedTile);
  const c = cityAt(s, ui.selectedTile);
  const t = s.tiles[ui.selectedTile];
  let out = '';
  if (u) out += unitCard(u);
  if (c) out += cityCard(c);
  if (!u && !c) {
    const T = TERRAIN[t.t];
    out += `<div class="card"><b>${T.name}</b><p class="muted small">${T.pass ? `Movement: ${T.move > 1 ? 'ends your move when entered' : 'normal'}. Defence ×${T.def}.` : 'Impassable.'} ${t.city >= 0 ? `Worked by ${esc(s.cities[t.city].name)}: yields ${GOODS[T.yields].icon}.` : ''}</p>
      ${t.shrine ? '<p><span class="gold">✦ Ancient shrine.</span> A unit standing here at the start of your turn earns +1 renown.</p>' : ''}</div>`;
  } else if (t.shrine) out += '<p class="small"><span class="gold">✦</span> Shrine: +1 renown per turn for whoever stands here.</p>';
  return out + goals();
}

function paneMarket() {
  const s = ui.s;
  const f = me();
  const can = myTurn();
  const rows = Object.entries(GOODS).map(([g, G]) => {
    const p = s.market[g];
    const trend = p > G.base * 1.15 ? '<span class="neg">▲ high</span>' : p < G.base * 0.85 ? '<span class="pos">▼ low</span>' : '<span class="muted">steady</span>';
    const b1 = quote(s, s.playerId, g, 1, 'buy').total;
    const b5 = quote(s, s.playerId, g, 5, 'buy').total;
    const s1 = quote(s, s.playerId, g, 1, 'sell').total;
    const s5 = quote(s, s.playerId, g, 5, 'sell').total;
    return `<div class="good">
      <div class="row"><b>${G.icon} ${G.name}</b><span>${p.toFixed(1)} ${trend}</span><span class="muted">you have ${f[g]}</span></div>
      <div class="trade">
        <button data-act="trade" data-g="${g}" data-n="1" data-side="buy" ${can && f.gold >= b1 ? '' : 'disabled'}>Buy 1 <small>−${b1}💰</small></button>
        <button data-act="trade" data-g="${g}" data-n="5" data-side="buy" ${can && f.gold >= b5 ? '' : 'disabled'}>Buy 5 <small>−${b5}💰</small></button>
        <button data-act="trade" data-g="${g}" data-n="1" data-side="sell" ${can && f[g] >= 1 ? '' : 'disabled'}>Sell 1 <small>+${s1}💰</small></button>
        <button data-act="trade" data-g="${g}" data-n="5" data-side="sell" ${can && f[g] >= 5 ? '' : 'disabled'}>Sell 5 <small>+${s5}💰</small></button>
      </div></div>`;
  }).join('');
  return `<p class="muted small">One market serves all four houses. Every purchase pushes the price up and every sale pushes it down, for everyone. Prices drift back over time. Buy cheap, sell dear, and starve your rivals of what they need.</p>${rows}`;
}

function charCard(c, label) {
  if (!c) return `<div class="card char muted">${label}: none. An heir may yet be born.</div>`;
  return `<div class="card char"><div class="muted small">${label}</div><b>${esc(c.name)}</b> <span class="muted">age ${c.age}</span>
    <div class="traits">${c.traits.map((t) => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}<small>${esc(TRAITS[t].desc)}</small></span>`).join('')}</div></div>`;
}

function paneCourt() {
  const s = ui.s;
  const f = me();
  const can = myTurn();
  const mine = strength(s, s.playerId);
  const rows = s.factions.filter((x) => x.id !== s.playerId).map((x) => {
    if (!x.alive) return `<div class="dip dead"><b>${esc(x.name)}</b> <span class="muted">destroyed</span></div>`;
    const r = relation(s, s.playerId, x.id);
    const theirs = strength(s, x.id);
    const ruler = s.characters[x.rulerId];
    let actions = '';
    if (r.war) {
      const { need } = peaceTerms(s, s.playerId, x.id);
      actions = need === Infinity ? '<span class="muted small">They will not talk peace while winning this badly.</span>'
        : `<button data-act="peace" data-v="${x.id}" data-gold="${need}" ${can && f.gold >= need ? '' : 'disabled'}>Offer peace${need ? ` (+${need}💰 tribute)` : ''}</button>`;
    } else if (ui.confirmWar === x.id) {
      actions = `<span class="small">Declare war? Costs 2 renown.</span> <button class="danger" data-act="war" data-v="${x.id}">Declare war</button><button class="ghost" data-act="nowar">Cancel</button>`;
    } else {
      actions = r.truce > s.turn ? `<span class="muted small">Truce until turn ${r.truce}</span>` : `<button class="ghost danger-text" data-act="askwar" data-v="${x.id}" ${can ? '' : 'disabled'}>Declare war…</button>`;
    }
    return `<div class="dip" style="--c:${x.color}">
      <div class="row"><b>${esc(x.name)}</b><span class="badge ${r.war ? 'war' : 'peace'}">${r.war ? 'At war' : 'Peace'}</span></div>
      <div class="muted small">${esc(ruler.name)} (${ruler.traits.map((t) => TRAITS[t].name).join(', ')}) · ${citiesOf(s, x.id).length} towns · ${x.renown} renown</div>
      <div class="power"><span>Army</span><span class="pbar"><span style="width:${Math.min(100, (theirs / Math.max(1, mine, theirs)) * 100)}%;background:${x.color}"></span></span><span class="muted small">${theirs > mine * 1.2 ? 'stronger than you' : theirs < mine * 0.8 ? 'weaker than you' : 'about even'}</span></div>
      <div class="acts">${actions}</div>
    </div>`;
  }).join('');
  const rn = renownIncome(s, s.playerId);
  return `${charCard(s.characters[f.rulerId], 'Your ruler')}${charCard(f.heirId != null ? s.characters[f.heirId] : null, 'Heir')}
    <p class="muted small">If your ruler dies in battle, the heir takes over, but some towns may revolt. With no heir, a cousin seizes power and the revolts are worse. Each turn is one year.</p>
    <div class="card"><b>${esc(FACTIONS[s.playerId].bonus)}</b><p class="muted small">${esc(FACTIONS[s.playerId].bonusDesc)}</p>
    <div class="small">Renown: <b>${f.renown}</b> / ${RENOWN_TO_WIN}${rn ? ` · +${rn} per turn from shrines and cathedrals` : ''}</div></div>
    <h4>The other houses</h4>${rows}`;
}

function paneResearch() {
  const s = ui.s;
  const f = me();
  const fid = s.playerId;
  const can = myTurn();
  const inc = income(s, fid);
  const T = f.research ? TECHS[f.research] : null;
  const turnsLeft = (cost) => (f.lore >= cost ? 'now' : inc.lore > 0 ? `${Math.ceil((cost - f.lore) / inc.lore)} turns` : 'never');
  let out = `<div class="card research-now">
    <div class="row"><b>📜 Lore ${f.lore}</b><span class="muted small">+${inc.lore} per turn</span></div>
    ${T ? `<div class="small">Researching <b>${T.name}</b> · ${Math.min(f.lore, T.cost)}/${T.cost} · done in ${turnsLeft(T.cost)}</div>
      <div class="hpbar lore"><span style="width:${Math.min(100, (f.lore / T.cost) * 100)}%"></span></div>`
    : '<div class="small">Nothing being researched. Lore is banked until you choose.</div>'}
    <p class="muted small">Every town makes lore equal to its level, the capital +1, a Library +2. Each branch is a ladder: master one step to unlock the next. You won't have time for everything.</p></div>`;
  out += '<div class="tree">';
  for (const [bk, B] of Object.entries(BRANCHES)) {
    out += `<div class="branch"><h4>${B.icon} ${B.name}</h4>`;
    for (const [k, X] of Object.entries(TECHS).filter(([, x]) => x.branch === bk).sort((a, b) => a[1].tier - b[1].tier)) {
      const done = f.techs.includes(k);
      const avail = techAvailable(s, fid, k);
      const cur = f.research === k;
      const unlocks = Object.values(POLICIES).filter((p) => p.req === k).map((p) => p.name);
      out += `<button class="tech ${done ? 'done' : cur ? 'cur' : avail ? 'avail' : 'locked'}" data-act="research" data-v="${k}" ${can && avail && !cur ? '' : 'disabled'}>
        <b>${done ? '✓ ' : cur ? '▶ ' : ''}${X.name}</b><small>${esc(X.desc)}</small>
        ${unlocks.length ? `<small class="unlock">Unlocks policy: ${unlocks.join(', ')}</small>` : ''}
        ${done ? '' : `<span class="cost">📜${X.cost}${avail && !cur ? ` · ${turnsLeft(X.cost)}` : ''}</span>`}</button>`;
    }
    out += '</div>';
  }
  out += '</div>';
  const slots = policySlots(s, fid);
  out += `<h4>Policies <span class="muted">${f.policies.length}/${slots} slots</span></h4>
    <p class="muted small">Adopting a policy costs ${POLICY_COST} gold. Dropping one is free. More slots come from Code of Laws and Bureaucracy.</p><div class="policies">`;
  for (const [k, P] of Object.entries(POLICIES)) {
    const on = f.policies.includes(k);
    const avail = policyAvailable(s, fid, k);
    const full = f.policies.length >= slots;
    const btn = on ? `<button class="ghost small" data-act="droppol" data-v="${k}" ${can ? '' : 'disabled'}>Drop</button>`
      : avail ? `<button class="small" data-act="adopt" data-v="${k}" ${can && !full && f.gold >= POLICY_COST ? '' : 'disabled'} title="${full ? 'No free slot: drop a policy first' : ''}">Adopt <small>−${POLICY_COST}💰</small></button>`
        : `<span class="muted small">Needs ${TECHS[P.req].name}</span>`;
    out += `<div class="policy ${on ? 'on' : avail ? '' : 'locked'}"><div><b>${on ? '✓ ' : ''}${P.name}</b><small>${esc(P.desc)}</small></div>${btn}</div>`;
  }
  return `${out}</div>`;
}

function paneLog() {
  return `<div class="log">${[...ui.s.log].reverse().slice(0, 80).map((l) => `<div class="entry ${l.kind}"><time>T${l.turn}</time>${esc(l.text)}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- input
function select(tile) {
  const s = ui.s;
  ui.selectedTile = tile;
  ui.armedTarget = null;
  const u = tile != null ? unitAt(s, tile) : null;
  if (u && u.owner === s.playerId && myTurn()) {
    ui.selectedUnit = u.id;
    ui.reach = reachable(s, u);
    ui.targets = attackTargets(s, u);
  } else {
    ui.selectedUnit = null;
    ui.reach = null;
    ui.targets = [];
  }
  ui.tab = 'select';
  ui.board.showPath(null);
  hideTip();
  render();
}

function deselect() {
  select(null);
}

async function onTileClick(tile) {
  const s = ui.s;
  if (ui.busy) return;
  const sel = ui.selectedUnit != null ? s.units.find((u) => u.id === ui.selectedUnit) : null;
  if (sel && myTurn()) {
    const target = ui.targets.find((t) => t.tile === tile);
    if (target) {
      if (noHover && ui.armedTarget !== target.id) {
        ui.armedTarget = target.id;
        ui.hoverTarget = target.id;
        showPreview(sel, target);
        render();
        return;
      }
      return doAttack(sel, target);
    }
    if (ui.reach?.has(tile)) return doMove(sel, tile);
  }
  sfx.select();
  select(tile === ui.selectedTile && !unitAt(s, tile) ? null : tile);
}

function onTileHover(tile, e) {
  const s = ui.s;
  if (!s || ui.busy || noHover) return;
  const sel = ui.selectedUnit != null ? s.units.find((u) => u.id === ui.selectedUnit) : null;
  const target = sel ? ui.targets.find((t) => t.tile === tile) : null;
  const newHover = target ? target.id : null;
  if (newHover !== ui.hoverTarget) {
    ui.hoverTarget = newHover;
    ui.board.render(boardState());
  }
  if (target) {
    showPreview(sel, target, e);
    ui.board.showPath(null);
  } else if (sel && ui.reach?.has(tile)) {
    ui.board.showPath([sel.tile, ...pathTo(ui.reach, sel.tile, tile)]);
    hideTip();
  } else {
    ui.board.showPath(null);
    const u = tile != null ? unitAt(s, tile) : null;
    if (u && u.owner !== s.playerId && e) showUnitTip(u, e);
    else hideTip();
  }
}

function tipAt(html, e) {
  const tip = root.querySelector('.tip');
  tip.innerHTML = html;
  tip.classList.add('on');
  const wrap = root.querySelector('.board-wrap').getBoundingClientRect();
  if (e) {
    let x = e.clientX - wrap.left + 16;
    let y = e.clientY - wrap.top + 16;
    if (x + 240 > wrap.width) x -= 260;
    if (y + 120 > wrap.height) y -= 130;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  } else {
    tip.style.left = '12px';
    tip.style.top = '12px';
  }
}
function hideTip() { root.querySelector('.tip')?.classList.remove('on'); }

function showPreview(att, def, e) {
  const p = combatPreview(ui.s, att, def);
  const owner = def.owner < 0 ? 'Rebel' : ui.s.factions[def.owner].short;
  tipAt(`<div class="pv"><div class="pv-h">${UNITS[att.type].name} ⚔ ${owner} ${UNITS[def.type].name}</div>
    <div class="pv-row"><span>You deal</span><b class="${p.kill ? 'pos' : ''}">${p.dmg}${p.kill ? ' · KILL' : ` (${def.hp - p.dmg} left)`}</b></div>
    <div class="pv-row"><span>You take</span><b class="${p.dies ? 'neg' : p.ret ? 'warn' : 'pos'}">${p.ret}${p.dies ? ' · YOU DIE' : p.ret === 0 ? (p.kill ? '' : ' (out of reach)') : ` (${att.hp - p.ret} left)`}</b></div>
    ${p.kill && UNITS[att.type].range === 1 ? '<div class="muted small">Your unit will advance into the hex.</div>' : ''}
    ${noHover ? '<div class="small gold">Tap again to attack</div>' : ''}</div>`, e);
}

function showUnitTip(u, e) {
  const owner = u.owner < 0 ? 'Rebels' : ui.s.factions[u.owner].name;
  const U = UNITS[u.type];
  tipAt(`<div class="pv"><div class="pv-h">${esc(owner)}: ${U.name}</div><div class="small">❤ ${u.hp}/${maxHp(ui.s, u.type, u.owner, u.vet)} · ⚔${U.atk} 🛡${U.def} 🥾${U.move} 🎯${U.range}</div></div>`, e);
}

async function doMove(u, tile) {
  const s = ui.s;
  const path = [...pathTo(ui.reach, u.tile, tile)];
  const snapshot = JSON.stringify(s);
  const res = moveUnit(s, u.id, tile);
  if (typeof res === 'string') return toast(res);
  ui.undo = res.capture ? null : { snapshot, uid: u.id };
  s.tut = { ...(s.tut ?? {}), moved: true };
  ui.busy = true;
  ui.reach = null;
  ui.targets = [];
  ui.board.showPath(null);
  hideTip();
  sfx.move();
  await ui.board.animateMove(u.id, path, 110);
  ui.busy = false;
  if (res.capture) onCapture(res.capture, tile);
  afterAction();
  // Keep the unit selected so it can attack right away.
  if (s.units.includes(u)) select(u.tile);
}

async function doAttack(u, target) {
  const s = ui.s;
  const res = attack(s, u.id, target.id);
  if (typeof res === 'string') return toast(res);
  ui.undo = null;
  if (res.veteran) setTimeout(() => { ui.board.float(s.units.includes(u) ? u.tile : res.from, '★ Veteran', 'renown'); sfx.capture(); }, 500);
  ui.busy = true;
  ui.reach = null;
  ui.targets = [];
  hideTip();
  (UNITS[u.type].range > 1 ? sfx.arrow : sfx.hit)();
  if (res.killed) setTimeout(sfx.kill, 120);
  await ui.board.animateAttack(res);
  ui.busy = false;
  render();
  if (res.capture) onCapture(res.capture, res.at);
  afterAction();
  if (s.units.includes(u)) select(u.tile);
  else deselect();
}

function onCapture(cap, tile) {
  sfx.capture();
  ui.board.pulse(tile, 'pulse gold');
  ui.board.float(tile, `+${cap.gain} ★`, 'renown');
}

function afterAction() {
  autosave();
  if (ui.s.winner) return showEnd();
  render();
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const s = ui.s;
  const act = b.dataset.act;
  const fid = s.playerId;
  const r = (res, ok) => {
    if (typeof res === 'string') { toast(res); sfx.bad(); return false; }
    if (ok) ok();
    ui.undo = null;
    autosave();
    if (s.winner) showEnd();
    render();
    return true;
  };
  switch (act) {
    case 'tab': ui.tab = b.dataset.v; ui.confirmWar = null; render(); break;
    case 'end': if (myTurn()) await playerEndTurn(); break;
    case 'next': nextUnit(); break;
    case 'hold': {
      const u = s.units.find((x) => x.id === ui.selectedUnit) ?? unitAt(s, ui.selectedTile);
      if (u) { u.moved = true; u.attacked = true; }
      nextUnit();
      break;
    }
    case 'recruit': r(recruit(s, fid, +b.dataset.v, b.dataset.u), () => { sfx.build(); s.tut = { ...(s.tut ?? {}), recruited: true }; }); break;
    case 'upgrade': r(upgradeCity(s, fid, +b.dataset.v), () => { sfx.build(); ui.board.pulse(s.cities[+b.dataset.v].tile, 'pulse gold'); }); break;
    case 'build': r(build(s, fid, +b.dataset.v, b.dataset.b), () => { sfx.build(); ui.board.pulse(s.cities[+b.dataset.v].tile, 'pulse gold'); }); break;
    case 'research': r(setResearch(s, fid, b.dataset.v), () => { sfx.build(); s.tut = { ...(s.tut ?? {}), researched: true }; }); break;
    case 'adopt': r(adoptPolicy(s, fid, b.dataset.v), () => sfx.coin()); break;
    case 'droppol': r(dropPolicy(s, fid, b.dataset.v)); break;
    case 'trade': r(trade(s, fid, b.dataset.g, +b.dataset.n, b.dataset.side), () => sfx.coin()); break;
    case 'askwar': ui.confirmWar = +b.dataset.v; render(); break;
    case 'nowar': ui.confirmWar = null; render(); break;
    case 'war': ui.confirmWar = null; r(declareWar(s, fid, +b.dataset.v), () => sfx.bad()); break;
    case 'peace': r(offerPeace(s, fid, +b.dataset.v, +b.dataset.gold), () => sfx.event()); break;
    case 'help': showHelp(false); break;
    case 'danger': toggleDanger(); break;
    case 'undo': undoMove(); break;
    case 'mute': setMuted(!isMuted()); render(); break;
    case 'menu': showMenu(); break;
    default: break;
  }
}

function toggleDanger() {
  ui.showDanger = !ui.showDanger;
  if (ui.showDanger && !threatTiles(ui.s, ui.s.playerId).size) toast('No army at war with you can reach your lands. Rebels never leave their towns.');
  render();
}

function undoMove() {
  if (!ui.undo || !myTurn()) return;
  const snap = JSON.parse(ui.undo.snapshot);
  const uid = ui.undo.uid;
  for (const k of Object.keys(snap)) ui.s[k] = snap[k];
  ui.undo = null;
  sfx.select();
  autosave();
  const u = ui.s.units.find((x) => x.id === uid);
  select(u ? u.tile : null);
}

function nextUnit() {
  const s = ui.s;
  if (!myTurn()) return;
  const ready = readyUnits(s, s.playerId);
  if (!ready.length) { deselect(); return; }
  const idx = ready.findIndex((u) => u.id === ui.selectedUnit);
  const u = ready[(idx + 1) % ready.length];
  sfx.select();
  select(u.tile);
}

document.addEventListener('keydown', (e) => {
  if (!ui.s || e.target.closest('input')) return;
  if (root.querySelector('.modal.on')) {
    if (e.key === 'Escape' && root.querySelector('.modal [data-close]')) closeModal();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'e' && myTurn()) playerEndTurn();
  else if (k === 'n') nextUnit();
  else if (k === 'escape') deselect();
  else if (k === 'f' && ui.selectedUnit != null) root.querySelector('[data-act="hold"]')?.click();
  else if (k === 'u' || ((e.ctrlKey || e.metaKey) && k === 'z')) undoMove();
  else if (k === 'd') toggleDanger();
  else if (k === 'h' || k === '?') showHelp(false);
});

// ---------------------------------------------------------------- turn flow
async function playerEndTurn() {
  const s = ui.s;
  ui.busy = true;
  ui.undo = null;
  deselect();
  const logStart = s.log.length;
  const turnStart = s.turn;
  endTurn(s);
  while (!s.winner && currentFaction(s) !== s.playerId) {
    const fid = currentFaction(s);
    const f = s.factions[fid];
    const speed = SPEEDS[prefs.speed];
    banner(`${f.name}`, f.color);
    render();
    for (const res of aiTurn(s, fid)) {
      if (speed > 0) await animateAI(res, speed);
    }
    endTurn(s);
    render();
    if (speed > 0) await sleep(200 * speed);
  }
  ui.busy = false;
  autosave();
  if (s.winner) return showEnd();
  sfx.turn();
  banner(`Turn ${s.turn} · Your move`, me().color);
  report(s.log.slice(Math.max(0, logStart - (s.log.length > 190 ? 10 : 0))).filter((l) => l.turn >= turnStart));
  afterPlayerTurnStarts();
}

async function animateAI(res, speed) {
  const s = ui.s;
  if (res.type === 'move') {
    ui.board.render({ myTurn: false });
    await ui.board.animateMove(res.uid, res.path, 85 * speed);
    if (res.capture) { onCapture(res.capture, res.path[res.path.length - 1]); await sleep(250 * speed); }
  } else if (res.type === 'attack') {
    (UNITS[s.units.find((u) => u.id === res.uid)?.type ?? 'militia'].range > 1 ? sfx.arrow : sfx.hit)();
    await ui.board.animateAttack(res, speed);
    if (res.capture) onCapture(res.capture, res.at);
  } else if (res.type === 'recruit') {
    await sleep(60 * speed);
  }
  ui.board.render({ myTurn: false });
  renderBar();
}

function afterPlayerTurnStarts() {
  render();
  if (ui.s.pendingEvents.length) showEvent();
  else nextUnitIfAny();
}

function nextUnitIfAny() {
  const r = readyUnits(ui.s, ui.s.playerId);
  if (r.length && ui.selectedUnit == null) select(r.find((u) => u.type !== 'ruler')?.tile ?? r[0].tile);
}

function banner(text, color) {
  const b = root.querySelector('.banner');
  b.textContent = text;
  b.style.setProperty('--c', color);
  b.classList.remove('on');
  void b.offsetWidth;
  b.classList.add('on');
}

// ---------------------------------------------------------------- modals
function openModal(html, { closable = true } = {}) {
  const m = root.querySelector('.modal');
  m.innerHTML = `<div class="dialog">${closable ? '<button class="x" data-close aria-label="Close">✕</button>' : ''}${html}</div>`;
  m.classList.add('on');
  m.onclick = (e) => {
    if (e.target.closest('[data-close]') || (closable && e.target === m)) closeModal();
  };
}
function closeModal() {
  const m = root.querySelector('.modal');
  m.classList.remove('on');
  m.innerHTML = '';
  if (ui.s && !ui.s.winner && myTurn()) nextUnitIfAny();
}

function showEvent() {
  const s = ui.s;
  const ev = s.pendingEvents[0];
  const v = eventView(s, ev);
  sfx.event();
  openModal(`<div class="eyebrow">Turn ${s.turn} · ${esc(me().name)}</div><h2>${esc(v.title)}</h2><p>${esc(v.text)}</p>
    <div class="options">${v.options.map((o, i) => `<button class="option" data-opt="${i}" ${o.ok ? '' : 'disabled'}><b>${esc(o.label)}</b><small>${esc(o.hint)}</small></button>`).join('')}</div>`, { closable: false });
  root.querySelector('.modal').querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
    const err = resolveEvent(s, +b.dataset.opt);
    if (err) return toast(err);
    ui.undo = null;
    root.querySelector('.modal').classList.remove('on');
    autosave();
    if (s.winner) return showEnd();
    render();
    if (s.pendingEvents.length) showEvent();
    else nextUnitIfAny();
  }));
}

function showHelp(first) {
  openModal(`<h2>How to play Hexmarch</h2>
    <div class="help">
      <div><b>🎯 Goal</b><p>Be the first house to reach <b>${RENOWN_TO_WIN} renown</b>, or the last one standing. If nobody gets there by turn ${TURN_LIMIT}, the most renowned house wins.</p></div>
      <div><b>★ Renown</b><p>Claim free towns (+2), seize rival towns (+4, capitals +8), stand on a shrine <span class="gold">✦</span> (+1 each turn), win battles (+1, a ruler +4), grow towns to level 3 (+2), raise a cathedral (+4 and +1 each turn).</p></div>
      <div><b>⚔ Units</b><p>Click a unit: blue hexes are where it can go, red rings are enemies it can hit. <b>Hover an enemy for the exact outcome</b>: every fight is predictable. Forests and hills end your move but defend well. Moving next to an enemy stops you (zone of control).</p></div>
      <div><b>🏰 Towns</b><p>Click your town to recruit (one unit per turn, two with Barracks), grow it, and add buildings. Each soldier eats 1 grain per turn. Run out and your army starves.</p></div>
      <div><b>📜 Research</b><p>Your towns make lore. In the Research tab, pick a tech in Warfare, Economy or Statecraft; it completes once enough lore is banked. Techs unlock policies: pick one per slot to shape your realm.</p></div>
      <div><b>⚖ Market</b><p>Sell what you have too much of, buy what you lack. Prices move with every trade, including your rivals' trades.</p></div>
      <div><b>⭐ Veterans</b><p>A unit that wins three fights becomes a veteran: +4 HP. Keep your veterans alive.</p></div>
      <div><b>⚠ Danger zones</b><p>Toggle them to see every hex the enemy can strike next turn. Misclicked a move? Undo it (as long as nothing was attacked or captured).</p></div>
      <div><b>👑 Your ruler</b><p>Your ruler fights on the map and inspires adjacent troops (+25% attack). If they fall, your heir inherits, and some of your towns may revolt.</p></div>
    </div>
    <p class="muted small">Keys: <kbd>N</kbd> next unit · <kbd>F</kbd> hold · <kbd>U</kbd> undo move · <kbd>D</kbd> danger zones · <kbd>E</kbd> end turn · <kbd>Esc</kbd> deselect</p>
    <div class="actions"><button class="primary" data-close>${first ? 'To war!' : 'Got it'}</button></div>`);
  if (first) { prefs.seenTutorial = true; savePrefs(); }
}

function showMenu() {
  openModal(`<h2>Menu</h2>
    <h4>Enemy turn speed</h4>
    <div class="seg">${Object.keys(SPEEDS).map((k) => `<button data-speed="${k}" class="${prefs.speed === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <div class="actions col">
      <button data-menu="new">New game</button>
      <button data-menu="restart">Restart this map</button>
      <button class="ghost" data-close>Back to the game</button>
    </div>
    <p class="muted small">The game saves automatically after every action. Seed: <code>${esc(ui.s.seed)}</code></p>`);
  const m = root.querySelector('.modal');
  m.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { prefs.speed = b.dataset.speed; savePrefs(); showMenu(); }));
  m.querySelector('[data-menu="new"]').addEventListener('click', () => { clearSave(); showStart(); });
  m.querySelector('[data-menu="restart"]').addEventListener('click', () => {
    const s = newGame({ seed: ui.s.seed, playerFaction: ui.s.playerId, difficulty: ui.s.difficulty });
    beginTurn(s, currentFaction(s));
    closeModal();
    mountGame(s);
  });
}

function showEnd() {
  const s = ui.s;
  clearSave();
  const w = s.factions[s.winner.id];
  const won = w.id === s.playerId;
  (won ? sfx.win : sfx.lose)();
  const why = { renown: `reached ${RENOWN_TO_WIN} renown`, conquest: 'conquered every rival', time: `had the most renown when the age ended`, eliminated: 'outlasted you' }[s.winner.reason];
  const f = me();
  const src = Object.entries(f.stats.renown).filter(([, v]) => v > 0);
  const maxSrc = Math.max(1, ...src.map(([, v]) => v));
  const ranking = [...s.factions].sort((a, b) => b.renown - a.renown);
  openModal(`<div class="end ${won ? 'won' : 'lost'}">
    <div class="eyebrow">Turn ${s.turn}</div>
    <h2>${won ? 'Victory!' : 'Defeat'}</h2>
    <p>${won ? `${esc(f.name)} ${why}. The Marches are yours.` : `${esc(w.name)} ${why}.`}</p>
    <div class="ranking">${ranking.map((x, i) => `<div class="row ${x.id === s.playerId ? 'me' : ''}"><span>#${i + 1} <span class="dot" style="background:${x.color}"></span>${esc(x.name)}${x.alive ? '' : ' †'}</span><b>${x.renown}</b></div>`).join('')}</div>
    <h4>Where your renown came from</h4>
    <div class="srcs">${src.map(([k, v]) => `<div class="row"><span>${k}</span><span class="pbar"><span style="width:${(v / maxSrc) * 100}%"></span></span><b>${v}</b></div>`).join('') || '<p class="muted">None, alas.</p>'}</div>
    <div class="statsline">⚔ ${f.stats.kills} enemies slain · 🏰 ${f.stats.captures} towns taken · ☠ ${f.stats.lost} units lost · 🔨 ${f.stats.built} works built</div>
    <div class="actions"><button class="primary" data-again>Play again</button><button class="ghost" data-close>Look at the map</button></div></div>`);
  root.querySelector('[data-again]').addEventListener('click', () => showStart());
}

// Summarise what happened during the enemies' turns.
function report(entries) {
  const s = ui.s;
  const me_ = me();
  const mine = entries.filter((l) => l.kind === 'bad' || l.kind === 'good' || l.text.includes(me_.short) || l.text.includes(me_.name));
  const big = entries.filter((l) => !mine.includes(l) && /declares war|destroyed|falls in battle|cathedral|make peace/.test(l.text));
  const items = [...mine, ...big].slice(-5);
  if (!items.length) return;
  if (items.some((l) => l.kind === 'bad')) sfx.bad();
  const box = root.querySelector('.report') ?? Object.assign(document.createElement('div'), { className: 'report' });
  root.querySelector('.board-wrap').appendChild(box);
  box.innerHTML = `<div class="report-h">While you waited <button class="x" data-dismiss>✕</button></div>${items.map((l) => `<div class="entry ${l.kind}">${esc(l.text)}</div>`).join('')}`;
  box.classList.add('on');
  box.querySelector('[data-dismiss]').onclick = () => box.classList.remove('on');
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('on'), 9000);
  void s;
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  root.querySelector('.toasts')?.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------------------------------------------------------------- persistence
function autosave() {
  if (!ui.s || ui.s.winner) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(ui.s)); } catch { /* storage unavailable */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
function loadSave() {
  try {
    const d = localStorage.getItem(SAVE_KEY);
    const s = d ? JSON.parse(d) : null;
    for (const f of s?.factions ?? []) {
      f.lore ??= 0; f.techs ??= []; f.policies ??= []; f.research ??= null;
    }
    return s;
  } catch { return null; }
}

// ---------------------------------------------------------------- start screen
function showStart() {
  const saved = loadSave();
  let choice = { faction: 0, difficulty: 'normal', seed: Math.random().toString(36).slice(2, 8) };
  root.innerHTML = `<div class="start">
    <div class="hero">
      <h1>Hex<span>march</span></h1>
      <p class="tag">Four houses. One contested borderland. Thirty-odd turns of steel, silver and succession.</p>
    </div>
    <div class="start-grid">
      <div class="preview"><svg class="board" role="img" aria-label="Map preview"></svg>
        <div class="seed-row"><label>Map <input class="seed" maxlength="16"></label><button class="ghost" data-s="reroll">🎲 New map</button></div>
      </div>
      <div class="pick">
        <h3>Choose your house</h3>
        <div class="houses">${FACTIONS.map((F, i) => `<button class="house" data-house="${i}" style="--c:${F.color}">
          <span class="crest"></span><b>${F.name}</b><i>“${F.motto}”</i><small><b>${F.bonus}:</b> ${F.bonusDesc}</small></button>`).join('')}</div>
        <h3>Difficulty</h3>
        <div class="seg diff">${Object.entries(DIFFICULTY).map(([k, D]) => `<button data-diff="${k}">${D.name}</button>`).join('')}</div>
        <button class="primary big" data-s="go">Ride out</button>
        ${saved && !saved.winner ? `<button class="ghost" data-s="continue">Continue: ${esc(saved.factions[saved.playerId].name)}, turn ${saved.turn}</button>` : ''}
        <a class="classic" href="classic/">Prefer slow, sprawling grand strategy? Play Crowns &amp; Ledgers →</a>
      </div>
    </div></div>`;
  const svg = root.querySelector('.preview svg');
  const board = createBoard(svg, { onTileClick: () => {}, onTileHover: () => {} });
  const draw = () => {
    root.querySelector('.seed').value = choice.seed;
    const s = newGame({ seed: choice.seed, playerFaction: choice.faction, difficulty: choice.difficulty });
    board.build(s);
    board.render({ myTurn: false });
    root.querySelectorAll('.house').forEach((b) => b.classList.toggle('on', +b.dataset.house === choice.faction));
    root.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === choice.difficulty));
  };
  draw();
  root.querySelector('.start').addEventListener('click', (e) => {
    const h = e.target.closest('[data-house]');
    if (h) { choice.faction = +h.dataset.house; sfx.select(); draw(); return; }
    const d = e.target.closest('[data-diff]');
    if (d) { choice.difficulty = d.dataset.diff; draw(); return; }
    const b = e.target.closest('[data-s]');
    if (!b) return;
    if (b.dataset.s === 'reroll') { choice.seed = Math.random().toString(36).slice(2, 8); draw(); }
    if (b.dataset.s === 'go') {
      const s = newGame({ seed: choice.seed, playerFaction: choice.faction, difficulty: choice.difficulty });
      beginTurn(s, currentFaction(s));
      sfx.turn();
      mountGame(s);
    }
    if (b.dataset.s === 'continue') mountGame(saved);
  });
  root.querySelector('.seed').addEventListener('change', (e) => { choice.seed = e.target.value.trim() || 'marches'; draw(); });
}

showStart();
window.__hex = ui;
window.__hexDebug = { showEnd, render, aiTurn };
