// Hexmarch UI controller: start screen, input, panels, turn flow and animation.
import { newGame, titled } from './world.js';
import {
  UNITS, RECRUITABLE, BUILDINGS, GOODS, TERRAIN, TRAITS, FACTIONS, DIFFICULTY, RENOWN_TO_WIN, TURN_LIMIT, CITY_LEVELS,
  TECHS, BRANCHES, POLICIES, POLICY_COST, GIFT_GOLD,
} from './data.js';
import {
  unitAt, cityAt, citiesOf, reachable, pathTo, attackTargets, combatPreview, moveUnit, attack, recruit,
  upgradeCity, build, trade, quote, income, unitCost, upgradeCost, buildingCost, canAfford, relation, declareWar,
  offerPeace, endTurn, beginTurn, currentFaction, canAttack, readyUnits, hostile, defenseBonus,
  recruitLimit, renownIncome, movePoints, threatTiles, recruitSpot, baseAtk, baseDef, techAvailable, setResearch,
  policySlots, policyAvailable, adoptPolicy, dropPolicy,
} from './rules.js';
import { aiTurn } from './ai.js';
import { eventView, resolveEvent, pruneEvents } from './events.js';
import {
  opinion, mood, evaluateDeal, proposeDeal, treatyList, sendGift, releaseVassal, vassalsOf, teachable, heirOf,
  TREATIES, ensureDiplomacy, bloc,
} from './diplomacy.js';
import { createBoard } from './board.js';
import { tokenSvg, crest, townSprite } from './art/sprites.js';
import { icon, iconize } from './art/icons.js';
import { portrait } from './art/portrait.js';
import { vignette } from './art/vignettes.js';
import { maxHp } from './world.js';
import { sfx, isMuted, setMuted } from './audio.js';
import { fogOn, unitSeen, knownOwner, newFog, explored } from './fog.js';

const SAVE_KEY = 'hexmarch-save-v1';
const PREFS_KEY = 'hexmarch-prefs';
const root = document.getElementById('app');
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noHover = window.matchMedia?.('(hover: none)').matches;

let prefs = { speed: 'normal', seenTutorial: false, fog: true };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { /* ignore */ }
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };
const SPEEDS = { normal: 1, fast: 0.5, instant: 0 };

const costHtml = (cost) => Object.entries(cost).filter(([, v]) => v > 0)
  .map(([k, v]) => `<span class="cost">${icon(k)}${v}</span>`).join('');
const iconSvg = (type, color) => tokenSvg(type, color);

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
      <header class="topbar">
        <div class="brand"><div class="logo">Hex<span>march</span></div><div class="turn"></div></div>
        <div class="res"></div>
        <div class="race" title="First house to ${RENOWN_TO_WIN} renown wins"></div>
        <div class="tools">
          <button data-act="help" title="How to play (H)">${icon('help')}</button>
          <button data-act="mute" class="mute" title="Sound on/off"></button>
          <button data-act="menu" title="Menu">${icon('menu')}</button>
        </div>
      </header>
      <main class="stage">
        <section class="board-wrap">
          <svg class="board" role="img" aria-label="The Marches"></svg>
          <div class="banner"></div>
          <div class="tip"></div>
          <div class="zoom-tools">
            <button data-act="zoomin" title="Zoom in (+ or mouse wheel)">${icon('plus')}</button>
            <button data-act="zoomout" title="Zoom out (−)">${icon('minus')}</button>
            <button data-act="zoomfit" title="Show the whole map (0)">${icon('fit')}</button>
          </div>
          <div class="map-tools">
            <button data-act="danger" class="chip" title="Shade every hex enemies can strike next turn (D)">${icon('danger')}<span>Danger zones</span></button>
          </div>
          <div class="board-actions">
            <button class="undo" data-act="undo" title="Take back your last move (U)">${icon('undo')}<span>Undo move</span></button>
            <button class="next" data-act="next" title="Select next ready unit (N)">${icon('next')}<span>Next unit</span></button>
            <button class="end" data-act="end" title="End turn (E)">End turn</button>
          </div>
        </section>
        <aside class="side">
          <nav class="tabs">
            <button data-act="tab" data-v="select">${icon('castle')}<span>Selection</span></button>
            <button data-act="tab" data-v="market">${icon('scales')}<span>Market</span></button>
            <button data-act="tab" data-v="research">${icon('book')}<span>Research</span></button>
            <button data-act="tab" data-v="court">${icon('crown')}<span>Court</span></button>
            <button data-act="tab" data-v="diplo">${icon('handshake')}<span>Diplomacy</span></button>
            <button data-act="tab" data-v="log">${icon('scroll')}<span>Chronicle</span></button>
          </nav>
          <div class="pane"></div>
        </aside>
      </main>
      <div class="modal"></div>
      <div class="toasts"></div>
    </div>`;
  ui.board = createBoard(root.querySelector('.board'), { onTileClick, onTileHover, onCancel: deselect, onView: onZoom });
  ui.board.build(s);
  // Phones: start zoomed in on the capital so units are big enough to tap.
  const cap = s.cities.find((c) => c.owner === s.playerId && c.capital);
  if (cap && window.innerWidth < 700) ui.board.zoomTo(1.8, cap.tile);
  root.querySelector('.game').addEventListener('click', onClick);
  render();
  if (!prefs.seenTutorial) showHelp(true);
  else afterPlayerTurnStarts();
}

const myTurn = () => !ui.busy && !ui.s.winner && currentFaction(ui.s) === ui.s.playerId && !ui.s.pendingEvents.length;
const me = () => ui.s.factions[ui.s.playerId];
// The unit on a hex as the player sees it: hidden enemies under fog are not there.
const seenUnitAt = (tile) => {
  const x = tile != null ? unitAt(ui.s, tile) : null;
  return x && unitSeen(ui.s, ui.s.playerId, x) ? x : null;
};

function render() {
  const s = ui.s;
  ui.board.render(boardState());
  renderBar();
  renderPane();
  const ready = myTurn() ? readyUnits(s, s.playerId).length : 0;
  const end = root.querySelector('.end');
  end.disabled = !myTurn();
  end.innerHTML = myTurn() ? `<span>End turn</span>${ready ? `<small>${ready} unit${ready > 1 ? 's' : ''} ready</small>` : ''}` : '<span>Waiting…</span>';
  end.classList.toggle('glow', myTurn() && ready === 0);
  root.querySelector('.next').disabled = !myTurn() || !ready;
  root.querySelector('.undo').hidden = !(ui.undo && myTurn());
  root.querySelector('[data-act="danger"]').classList.toggle('on', ui.showDanger);
  const mute = root.querySelector('.mute');
  if (mute.dataset.m !== String(isMuted())) { mute.dataset.m = String(isMuted()); mute.innerHTML = icon(isMuted() ? 'mute' : 'sound'); }
}

function renderBar() {
  const s = ui.s;
  const f = me();
  const inc = income(s, s.playerId);
  const net = inc.grain - inc.upkeep;
  root.querySelector('.turn').innerHTML = `<b>Turn ${s.turn}</b><small>/ ${TURN_LIMIT}</small>`;
  const r = (ic, v, d, title, warn = false) => `<div class="r${warn ? ' warn' : ''}" title="${title}">${icon(ic)}<b>${v}</b><small class="${d < 0 ? 'neg' : 'pos'}">${d >= 0 ? '+' : ''}${d}</small></div>`;
  root.querySelector('.res').innerHTML =
    r('💰', f.gold, inc.gold, `Gold: recruits, upgrades and buildings${inc.trade ? ` (trade +${inc.trade})` : ''}${inc.tribute ? ` (tribute ${inc.tribute > 0 ? '+' : ''}${inc.tribute})` : ''}`) +
    r('🌾', f.grain, net, `Grain: each soldier eats 1 per turn (${inc.grain} grown, ${inc.upkeep} eaten). If it runs out, soldiers starve.`, f.grain + net < 0) +
    r('🪵', f.timber, inc.timber, 'Timber: archers, catapults, upgrades and buildings') +
    r('⛏', f.iron, inc.iron, 'Iron: spearmen, cavalry, knights') +
    loreChip(f, inc.lore);
  root.querySelector('.race').innerHTML = s.factions.map((x) => `
    <div class="runner ${x.alive ? '' : 'dead'} ${x.id === s.playerId ? 'me' : ''} ${currentFaction(s) === x.id ? 'active' : ''}" title="${esc(x.name)}: ${x.renown} renown${x.overlord != null ? `, vassal of ${esc(s.factions[x.overlord].short)}` : ''}">
      <span class="nm">${crest(x.key, x.color, 'crest xs')}${esc(x.short)}${x.overlord != null ? icon('chain', 'vas') : ''}</span><b>${x.renown}</b><span class="track"><span style="width:${Math.min(100, (x.renown / RENOWN_TO_WIN) * 100)}%;background:${x.color}"></span></span>
    </div>`).join('');
}

function loreChip(f, gain) {
  const T = f.research ? TECHS[f.research] : null;
  const idle = !T && Object.keys(TECHS).some((k) => techAvailable(ui.s, ui.s.playerId, k));
  const title = T ? `Researching ${T.name}: ${f.lore}/${T.cost} lore` : idle ? 'Nothing being researched: lore is banked. Click to choose.' : 'Lore';
  return `<button class="r lore${idle ? ' idle' : ''}" data-act="tab" data-v="research" title="${esc(title)}">${icon('lore')}<b>${T ? `${Math.min(f.lore, T.cost)}/${T.cost}` : f.lore}</b><small class="pos">+${gain}</small>${T ? `<i class="lore-bar"><i style="width:${Math.min(100, (f.lore / T.cost) * 100)}%"></i></i>` : ''}</button>`;
}

// ---------------------------------------------------------------- side panes
function renderPane() {
  root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === ui.tab));
  const pane = root.querySelector('.pane');
  const html = { select: paneSelect, market: paneMarket, research: paneResearch, court: paneCourt, diplo: paneDiplo, log: paneLog }[ui.tab]();
  if (pane.dataset.html !== html) {
    const top = pane.scrollTop;
    pane.innerHTML = html;
    pane.dataset.html = html;
    pane.scrollTop = top;
  }
}

function statLine(u) {
  const U = UNITS[u.type];
  return `<div class="stats"><span title="Attack">${icon('attack')}${baseAtk(ui.s, u.owner, u.type)}</span><span title="Defence">${icon('defence')}${baseDef(ui.s, u.owner, u.type)}</span><span title="Movement">${icon('move')}${movePoints(ui.s, u)}</span><span title="Range">${icon('range')}${U.range}</span></div>`;
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
  const pct = u.hp / max;
  const hold = mine && myTurn() && (!u.moved || !u.attacked) ? '<button class="small" data-act="hold" title="Skip this unit; units that hold still heal (F)">Hold</button>' : '';
  return `<div class="card unit-card">
    <div class="ph">${ruler ? portrait(ruler, owner.color, { cls: 'portrait sm' }) : iconSvg(u.type, owner.color)}<div><div class="ph-title">${ruler ? esc(titled(ruler, 'ruler')) : U.name}${u.vet ? ' <span class="tag">Veteran</span>' : ''}</div><div class="ph-sub"><span class="dot" style="background:${owner.color}"></span>${esc(owner.name)} · ${TERRAIN[s.tiles[u.tile].t].name}${defenseBonus(s, u) > 1 ? ` ×${defenseBonus(s, u)} def` : ''}</div></div></div>
    <div class="meter"><div class="meter-l"><span>Health</span><b>${u.hp} / ${max}</b></div><div class="meter-bar"><span class="${pct < 0.34 ? 'low' : pct < 0.67 ? 'mid' : ''}" style="width:${pct * 100}%"></span></div></div>
    ${statLine(u)}
    <p class="hint">${U.desc}</p>
    ${status ? `<div class="card-foot"><span class="status ${status.startsWith('Done') ? 'done' : ''}">${status}</span>${hold}</div>` : ''}
  </div>`;
}

function fogCityCard(c) {
  const s = ui.s;
  const o = knownOwner(s, c, null);
  const owner = o < 0 ? { name: 'Free town (rebels)', color: '#6d6a75' } : s.factions[o];
  const k = s.fog.known[c.id];
  return `<div class="card city-card">
    <div class="ph"><svg class="town-pic" viewBox="-26 -44 52 62" aria-hidden="true">${townSprite({ ...c, owner: o, level: k?.level ?? c.level }, owner.color)}</svg><div><div class="ph-title">${esc(c.name)}</div><div class="ph-sub">Last seen: <span class="dot" style="background:${owner.color}"></span>${esc(owner.name)} · Level ${k?.level ?? c.level}</div></div></div>
    <p class="hint">Its garrison and current owner are hidden by the fog.</p></div>`;
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
  let out = `<div class="card city-card">
    <div class="ph"><svg class="town-pic" viewBox="-26 -44 52 62" aria-hidden="true">${townSprite(c, owner.color)}</svg><div><div class="ph-title">${esc(c.name)}${c.capital ? '<span class="tag">Capital</span>' : ''}</div><div class="ph-sub"><span class="dot" style="background:${owner.color}"></span>${esc(owner.name)} · Level ${c.level}</div></div></div>
    <div class="yields"><span>${icon('gold')}${L.gold + (c.capital ? 2 : 0)}</span>${c.capital ? `<span>${icon('grain')}+2</span>` : ''}${Object.entries(yields).map(([k, v]) => `<span>${icon(k)}${v}</span>`).join('')}<span class="hint">per turn</span></div>`;
  if (!mine) {
    out += `<p class="hint">${c.owner < 0 ? 'Walk a unit into an empty free town to claim it (+2 renown).' : hostile(s, s.playerId, c.owner) ? 'At war: take it by moving a unit into it once it is empty (+4 renown, +8 for a capital).' : peaceWords(c.owner)}</p></div>`;
    return out;
  }
  const can = myTurn();
  // Upgrade
  if (c.level < 3) {
    const cost = upgradeCost(s, s.playerId, c);
    out += `<div class="act-row"><div><b>Grow to level ${c.level + 1}</b><div class="hint">More gold${c.level === 2 ? ', double yields, +2 renown' : ''}, +1 building slot</div></div>
      <button data-act="upgrade" data-v="${c.id}" ${can && canAfford(f, cost) ? '' : 'disabled'}>${costHtml(cost)}</button></div>`;
  }
  // Buildings
  const used = c.buildings.filter((b) => b !== 'cathedral').length;
  out += `<h4>Buildings <span>${used} of ${c.level} slots used</span></h4><div class="blds">`;
  for (const [k, B] of Object.entries(BUILDINGS)) {
    const has = c.buildings.includes(k);
    const cost = buildingCost(s, s.playerId, k);
    const realmHasCathedral = k === 'cathedral' && s.cities.some((x) => x.owner === s.playerId && x.buildings.includes('cathedral'));
    const blocked = has || (B.minLevel && c.level < B.minLevel) || (k !== 'cathedral' && used >= c.level) || realmHasCathedral;
    out += `<button class="bld ${has ? 'has' : ''}" data-act="build" data-v="${c.id}" data-b="${k}" ${!has && can && !blocked && canAfford(f, cost) ? '' : 'disabled'} title="${esc(B.desc)}">
      <b>${has ? icon('check') : ''}${B.name}</b><small>${esc(B.desc)}</small>${has ? '' : `<span>${costHtml(cost)}</span>`}</button>`;
  }
  out += '</div>';
  // Recruit
  const left = recruitLimit(c) - c.recruits;
  const blocked = recruitSpot(s, c) == null;
  out += `<h4>Recruit <span>${left > 0 ? `${left} left this turn` : 'Done this turn'}</span></h4>
    ${blocked ? '<p class="hint mb">No free hex in or beside the town to muster troops.</p>' : unitAt(s, c.tile) ? '<p class="hint mb">The town is occupied, so recruits will muster beside it.</p>' : ''}<div class="recruits">`;
  for (const t of RECRUITABLE) {
    const cost = unitCost(s, s.playerId, t, c);
    const ok = can && left > 0 && !blocked && canAfford(f, cost);
    const U = UNITS[t];
    out += `<button class="rec" data-act="recruit" data-v="${c.id}" data-u="${t}" ${ok ? '' : 'disabled'} title="${esc(U.desc)}">
      ${iconSvg(t, s.factions[s.playerId].color)}<b>${U.name}</b><small>${icon('attack')}${baseAtk(s, s.playerId, t)} ${icon('defence')}${baseDef(s, s.playerId, t)} ${icon('move')}${U.move + (t === 'knight' && f.techs.includes('stirrups') ? 1 : 0) + (t === 'cavalry' && f.key === 'ashkar' ? 1 : 0)}${U.range > 1 ? ` ${icon('range')}${U.range}` : ''} ${icon('hp')}${U.hp}</small><span>${costHtml(cost)}</span></button>`;
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
    ['Pick something to research', f.research != null || f.techs.length > 0],
  ];
  if (list.every(([, d]) => d) || s.turn > 15) return '';
  const done = list.filter(([, d]) => d).length;
  return `<div class="card goals"><div class="ph-title">First steps<small>${done} of ${list.length}</small></div>${list.map(([txt, d]) => `<div class="goal ${d ? 'done' : ''}"><i>${d ? icon('check') : ''}</i>${txt}</div>`).join('')}</div>`;
}

function paneSelect() {
  const s = ui.s;
  if (ui.selectedTile == null) {
    const f = me();
    const ruler = s.characters[f.rulerId];
    return `<div class="card intro">
      <div class="house-head">${crest(f.key, f.color, 'crest md')}<div><div class="ph-title">${esc(f.name)}</div><div class="ph-sub">${esc(FACTIONS[s.playerId].bonus)}: ${esc(FACTIONS[s.playerId].bonusDesc)}</div></div></div>
      <div class="statrow">${[
        ['castle', citiesOf(s, s.playerId).length, 'Towns'],
        ['attack', s.units.filter((u) => u.owner === s.playerId && u.type !== 'ruler').length, 'Soldiers'],
        ['gold', `+${income(s, s.playerId).gold}`, 'Gold'],
        ['renown', `+${renownIncome(s, s.playerId)}`, 'Renown'],
      ].map(([ic, v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
      <div class="ruler-line">${portrait(ruler, f.color, { cls: 'portrait xs' })}<div>Ruled by <b>${esc(titled(ruler, 'ruler'))}</b>, ${ruler.age}<div class="hint">${ruler.traits.map((t) => TRAITS[t].name).join(' · ')}</div></div></div></div>
      ${goals()}
      <p class="hint">Select a unit to see where it can go, or a town to recruit and build. First house to ${RENOWN_TO_WIN} renown wins. Press <kbd>H</kbd> for the full rules.</p>`;
  }
  const t = s.tiles[ui.selectedTile];
  if (!explored(s, ui.selectedTile)) {
    return `<div class="card fog-card"><div class="ph-title">${icon('fog')}Unexplored</div><p class="hint">Nobody of yours has seen this land. Send a unit to scout it: cavalry see three hexes, other troops two, and anyone on a hill one more.</p></div>${goals()}`;
  }
  const u = seenUnitAt(ui.selectedTile);
  const c = cityAt(s, ui.selectedTile);
  const fogged = fogOn(s) && ui.board.isFogged(ui.selectedTile);
  let out = '';
  if (fogged) out += `<p class="small fog-note">${icon('fog')}Out of sight: what you see here is what your scouts last reported.</p>`;
  if (u) out += unitCard(u);
  if (c) out += fogged && c.owner !== s.playerId ? fogCityCard(c) : cityCard(c);
  if (!u && !c) {
    const T = TERRAIN[t.t];
    out += `<div class="card"><div class="ph-title">${T.name}</div>
      <div class="kv"><span>Movement</span><b>${T.pass ? (T.move > 1 ? 'Ends your move' : 'Normal') : 'Impassable'}</b></div>
      ${T.pass ? `<div class="kv"><span>Defence</span><b>×${T.def}</b></div>` : ''}
      ${t.city >= 0 ? `<div class="kv"><span>Worked by ${esc(s.cities[t.city].name)}</span><b>${icon(T.yields)}</b></div>` : ''}
      ${t.shrine ? `<p class="hint">${icon('shrine', 'inline')}Ancient shrine: a unit standing here at the start of your turn earns +1 renown.</p>` : ''}</div>`;
  } else if (t.shrine) out += `<p class="hint">${icon('shrine', 'inline')}Shrine: +1 renown per turn for whoever stands here.</p>`;
  return out + goals();
}

// Tiny price chart: the line is the market price by round, the dashed line the base price.
function sparkline(vals, base) {
  const W = 92;
  const H = 26;
  const v = vals.slice(-20);
  if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${W} ${H}"><path d="M0,${H / 2}H${W}" class="base"/></svg>`;
  const lo = Math.min(base * 0.6, ...v);
  const hi = Math.max(base * 1.4, ...v);
  const y = (x) => (H - 3 - ((x - lo) / (hi - lo)) * (H - 6)).toFixed(1);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${y(x)}`);
  const last = v[v.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="M0,${y(base)}H${W}" class="base"/>
    <path d="M0,${H}L${pts.join('L')}L${W},${H}Z" class="area"/><path d="M${pts.join('L')}" class="line ${last > base * 1.1 ? 'hi' : last < base * 0.9 ? 'lo' : ''}"/>
    <circle cx="${W}" cy="${y(last)}" r="2.4" class="dot"/></svg>`;
}

function paneMarket() {
  const s = ui.s;
  const f = me();
  const can = myTurn();
  const rows = Object.entries(GOODS).map(([g, G]) => {
    const p = s.market[g];
    const trend = p > G.base * 1.15 ? '<small class="neg">High</small>' : p < G.base * 0.85 ? '<small class="pos">Low</small>' : '<small class="faint">Steady</small>';
    const b1 = quote(s, s.playerId, g, 1, 'buy').total;
    const b5 = quote(s, s.playerId, g, 5, 'buy').total;
    const s1 = quote(s, s.playerId, g, 1, 'sell').total;
    const s5 = quote(s, s.playerId, g, 5, 'sell').total;
    return `<div class="card ware">
      <div class="ph"><div><div class="ph-title">${icon(g)}${G.name}</div><div class="ph-sub">You have <b>${f[g]}</b> · base price ${G.base}</div></div>
        <div class="ware-mid">${sparkline([...(s.priceHistory?.[g] ?? []), p], G.base)}<span class="price">${p.toFixed(1)}${trend}</span></div></div>
      <div class="tradebar">
        <button data-act="trade" data-g="${g}" data-n="1" data-side="buy" ${can && f.gold >= b1 ? '' : 'disabled'}>Buy 1 <small>−${b1}${icon('gold')}</small></button>
        <button data-act="trade" data-g="${g}" data-n="5" data-side="buy" ${can && f.gold >= b5 ? '' : 'disabled'}>Buy 5 <small>−${b5}${icon('gold')}</small></button>
        <button data-act="trade" data-g="${g}" data-n="1" data-side="sell" ${can && f[g] >= 1 ? '' : 'disabled'}>Sell 1 <small>+${s1}${icon('gold')}</small></button>
        <button data-act="trade" data-g="${g}" data-n="5" data-side="sell" ${can && f[g] >= 5 ? '' : 'disabled'}>Sell 5 <small>+${s5}${icon('gold')}</small></button>
      </div></div>`;
  }).join('');
  return `<p class="hint">One market serves all four houses: every purchase raises the price for everyone, every sale lowers it, and prices drift back over time.</p>${rows}`;
}

function charCard(c, label, role = 'ruler') {
  if (!c) return `<div class="card"><div class="char"><div class="portrait-empty">?</div><div><div class="eyebrow-l">${label}</div><div class="char-name">None yet</div><p class="hint">An heir may still be born. Without one, a cousin seizes power and more towns revolt.</p></div></div></div>`;
  return `<div class="card"><div class="char">${portrait(c, me().color, { role, cls: 'portrait lg' })}<div><div class="eyebrow-l">${label}</div><div class="char-name">${esc(titled(c, role))}<small>age ${c.age}</small></div>
    <div class="traits">${c.traits.map((t) => `<span class="trait">${TRAITS[t].name}<small>${esc(TRAITS[t].desc)}</small></span>`).join('')}</div></div></div>${spouseLine(c)}</div>`;
}

function spouseLine(c) {
  if (!c?.spouseId) return '';
  const sp = ui.s.characters[c.spouseId];
  const house = sp.house != null ? ui.s.factions[sp.house] : null;
  return `<div class="spouse">${portrait(sp, house?.color ?? '#888888', { cls: 'portrait xs' })}<span>${c.age < 16 ? 'Betrothed to' : 'Wed to'} <b>${esc(sp.name)}</b>${house ? ` of ${esc(house.name)}` : ''}, ${sp.age}</span></div>`;
}

function paneCourt() {
  const s = ui.s;
  const f = me();
  const ruler = s.characters[f.rulerId];
  const heir = f.heirId != null ? s.characters[f.heirId] : null;
  const rn = renownIncome(s, s.playerId);
  return `${charCard(ruler, 'Ruler')}${charCard(heir, 'Heir', 'heir')}
    <p class="hint">If your ruler falls, the heir inherits and some towns may revolt. Each turn is one year. Wed your heir from the Diplomacy tab.</p>
    <div class="card"><div class="ph-title">${esc(FACTIONS[s.playerId].bonus)}</div><p class="hint">${esc(FACTIONS[s.playerId].bonusDesc)}</p>
      <div class="kv"><span>Renown</span><b>${f.renown} / ${RENOWN_TO_WIN}</b></div>
      ${rn ? `<div class="kv"><span>From shrines, cathedrals and vassals</span><b class="pos">+${rn} / turn</b></div>` : ''}</div>`;
}

// ---------------------------------------------------------------- diplomacy
const TREATY_ICON = { war: 'attack', truce: 'dove', alliance: 'handshake', pact: 'seal', trade: 'scales', vassal: 'chain' };

// The web of the Marches: each house a node, each pair a line styled by how they stand.
function diploWeb() {
  const s = ui.s;
  const P = s.playerId;
  const others = s.factions.filter((x) => x.id !== P).map((x) => x.id);
  // You sit in the middle; the rivals form a triangle around you, so no two lines share a midpoint.
  const pos = { [P]: [120, 92] };
  [[30, 140], [120, 22], [210, 140]].forEach((p, i) => { pos[others[i]] = p; });
  let lines = '';
  let marks = '';
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const A = s.factions[a];
      const B = s.factions[b];
      const [x1, y1] = pos[a];
      const [x2, y2] = pos[b];
      if (!A.alive || !B.alive) { lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="wl dead"/>`; continue; }
      const r = relation(s, a, b);
      const vas = A.overlord === b || B.overlord === a;
      const k = r.war ? 'war' : vas ? 'vassal' : r.alliance ? 'alliance' : r.pact > s.turn ? 'pact' : r.trade ? 'trade' : r.truce > s.turn ? 'truce' : 'none';
      lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="wl ${k}"/>`;
      const extra = [r.trade && k !== 'trade' && !r.war ? 'trade' : null, r.pact > s.turn && k !== 'pact' && !r.war ? 'pact' : null].filter(Boolean);
      const shown = [k, ...extra].filter((x) => x !== 'none');
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      shown.forEach((x, i) => {
        const ox = mx + (i - (shown.length - 1) / 2) * 15;
        marks += `<g class="wm ${x}" transform="translate(${ox - 6.5},${my - 6.5})"><circle cx="6.5" cy="6.5" r="7.5"/><svg width="13" height="13" viewBox="0 0 24 24">${icon(TREATY_ICON[x]).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg></g>`;
      });
    }
  }
  const nodes = s.factions.map((x) => {
    const [cx, cy] = pos[x.id];
    const c = crest(x.key, x.color, '').replace('<svg class=""', `<svg x="${cx - 13}" y="${cy - 15}" width="26" height="30"`);
    return `<g class="wn ${x.alive ? '' : 'dead'}">${c}<text x="${cx}" y="${cy + 25}" text-anchor="middle">${esc(x.id === P ? 'You' : x.short)}${x.overlord != null ? ' ⛓' : ''}</text></g>`;
  }).join('');
  return ` <svg class="web" viewBox="0 0 240 172" role="img" aria-label="Relations between the houses">${lines}${marks}${nodes}</svg>
    <div class="legend">${['war', 'alliance', 'pact', 'trade', 'vassal', 'truce'].map((k) => `<span class="lg ${k}"><i></i>${{ war: 'War', alliance: 'Alliance', pact: 'Pact', trade: 'Trade', vassal: 'Vassal', truce: 'Truce' }[k]}</span>`).join('')}</div>`;
}

function opinionBar(v) {
  const w = Math.min(50, Math.abs(v) / 2);
  return `<span class="opbar" title="Opinion of you: ${v}"><i class="${v < 0 ? 'neg' : 'pos'}" style="${v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i></span>`;
}

function reasons(parts, cls = '') {
  return `<ul class="why ${cls}">${parts.map((p) => `<li class="${p.v > 0 ? 'pos' : 'neg'}"><span>${esc(p.text)}</span><b>${p.v > 0 ? '+' : ''}${p.v}</b></li>`).join('') || '<li class="muted">No strong feelings either way</li>'}</ul>`;
}

function paneDiplo() {
  const s = ui.s;
  const f = me();
  const P = s.playerId;
  const can = myTurn();
  const inc = income(s, P);
  const mine = bloc(s, P);
  const rows = s.factions.filter((x) => x.id !== P).map((x) => {
    if (!x.alive) return `<div class="card dip dead">${crest(x.key, x.color, 'crest sm')}<b>${esc(x.name)}</b><span class="hint">· destroyed</span></div>`;
    const r = relation(s, P, x.id);
    const op = opinion(s, x.id, P);
    const ruler = s.characters[x.rulerId];
    const theirs = bloc(s, x.id);
    const badges = treatyList(s, P, x.id);
    if (!r.war && !badges.length) badges.push({ k: 'peace', text: 'At peace' });
    let war = '';
    if (r.war) war = '';
    else if (ui.confirmWar === x.id) {
      const oath = r.alliance ? 'This betrays your alliance: −6 renown, and every court will remember.' : r.pact > s.turn ? 'This breaks your pact: −4 renown, and every court will remember.' : 'Costs 2 renown.';
      const allies = s.factions.filter((o) => o.alive && o.id !== P && o.id !== x.id && (relation(s, o.id, x.id).alliance || x.overlord === o.id || o.overlord === x.id));
      war = `<div class="confirm"><span class="small">Declare war on ${esc(x.short)}? ${oath}${allies.length ? ` ${allies.map((o) => esc(o.short)).join(' and ')} may come to their aid.` : ''}</span><div><button class="danger" data-act="war" data-v="${x.id}">Declare war</button><button class="ghost" data-act="nowar">Cancel</button></div></div>`;
    } else if (x.overlord === P) {
      war = `<button class="ghost" data-act="release" data-v="${x.id}" ${can ? '' : 'disabled'}>Release vassal</button>`;
    } else if (r.truce <= s.turn) {
      war = `<button class="ghost danger-text" data-act="askwar" data-v="${x.id}" ${can ? '' : 'disabled'}>${icon('attack')}War…</button>`;
    }
    const lord = x.overlord != null ? s.factions[x.overlord] : null;
    const m = mood(op.total);
    const might = theirs > mine * 1.2 ? 'Stronger' : theirs < mine * 0.8 ? 'Weaker' : 'Even';
    return `<div class="card dip">
      <div class="dip-top">${portrait(ruler, x.color, { cls: 'portrait xs' })}<div><div class="ph-title">${crest(x.key, x.color, 'crest xs')}${esc(x.name)}</div><div class="ph-sub">${esc(titled(ruler, 'ruler'))}, ${ruler.age}</div><div class="ph-sub">${citiesOf(s, x.id).length} towns · ${x.renown} renown${lord ? ` · vassal of ${esc(lord.short)}` : ''}</div></div>
        <div class="dip-mood ${m.cls}"><b>${op.total > 0 ? '+' : ''}${op.total}</b><small>${m.name}</small></div></div>
      ${opinionBar(op.total)}
      <div class="badges">${badges.map((b) => `<span class="badge ${b.k}">${icon(TREATY_ICON[b.k] ?? 'dove')}${esc(b.text)}</span>`).join('')}</div>
      <details class="whybox"><summary>Why they feel this way</summary>${reasons(op.parts)}</details>
      <div class="dip-facts"><span>Might</span><span class="pbar"><span style="width:${Math.min(100, (theirs / Math.max(1, mine, theirs)) * 100)}%;background:${x.color}"></span></span><span>${might}${might === 'Even' ? '' : ' than you'}</span></div>
      <div class="acts">
        ${x.overlord != null && x.overlord !== P ? '<span class="hint">Speaks only through its liege.</span>' : `<button class="primary-lite" data-act="deal" data-v="${x.id}" ${can ? '' : 'disabled'}>${icon('handshake')}${r.war ? 'Negotiate peace' : 'Negotiate'}</button>`}
        ${!r.war ? `<button class="ghost" data-act="gift" data-v="${x.id}" ${can && f.gold >= GIFT_GOLD ? '' : 'disabled'} title="Send ${GIFT_GOLD} gold: they will think better of you for a while">${icon('gift')}Gift ${GIFT_GOLD}</button>` : ''}
        ${war}
      </div>
    </div>`;
  }).join('');
  const flows = [];
  if (inc.trade) flows.push(`<span>${icon('scales')}Trade <b class="pos">+${inc.trade}</b> gold</span>`);
  if (inc.tribute > 0) flows.push(`<span>${icon('chain')}Tribute <b class="pos">+${inc.tribute}</b> gold</span>`);
  const vs = vassalsOf(s, P);
  if (vs.length) flows.push(`<span>${icon('renown')}Vassals <b class="pos">+${vs.length}</b> renown</span>`);
  return `${diploWeb()}
    ${flows.length ? `<div class="flows">${flows.join('')}<span class="faint">per turn</span></div>` : ''}
    ${rows}`;
}

// ---------- negotiation table
function dealItems() {
  const d = ui.deal;
  const P = ui.s.playerId;
  const items = [];
  if (d.giveGold) items.push({ k: 'gold', by: P, n: d.giveGold });
  if (d.askGold) items.push({ k: 'gold', by: d.with, n: d.askGold });
  for (const id of d.giveTowns) items.push({ k: 'town', by: P, id });
  for (const id of d.askTowns) items.push({ k: 'town', by: d.with, id });
  for (const key of d.giveTechs) items.push({ k: 'tech', by: P, key });
  for (const key of d.askTechs) items.push({ k: 'tech', by: d.with, key });
  for (const k of d.treaties) items.push(k.startsWith('joinwar:') ? { k: 'joinwar', target: +k.split(':')[1] } : { k });
  return items;
}

function showDeal(fid) {
  ui.deal ??= null;
  if (!ui.deal || ui.deal.with !== fid) {
    ui.deal = { with: fid, giveGold: 0, askGold: 0, giveTowns: [], askTowns: [], giveTechs: [], askTechs: [], treaties: relation(ui.s, ui.s.playerId, fid).war ? ['peace'] : [] };
  }
  renderDeal();
}

function renderDeal() {
  const s = ui.s;
  const d = ui.deal;
  const P = s.playerId;
  const X = s.factions[d.with];
  const f = me();
  const r = relation(s, P, d.with);
  const items = dealItems();
  const ev = evaluateDeal(s, P, d.with, items);
  const chip = (group, val, label, on, ok = true, title = '') => `<button class="chip-t ${on ? 'on' : ''}" data-dg="${group}" data-dv="${val}" ${ok || on ? '' : 'disabled'} ${title ? `title="${esc(title)}"` : ''}>${on ? icon('check') : ''}${label}</button>`;
  const stepper = (side, have) => {
    const v = side === 'give' ? d.giveGold : d.askGold;
    return `<div class="stepper"><span>${icon('gold')}<b>${v}</b><small class="muted">/ ${have}</small></span><span class="steps">${[-10, -5, 5, 10].map((n) => `<button data-dgold="${side}" data-dn="${n}" ${(n < 0 && v <= 0) || (n > 0 && v >= have) ? 'disabled' : ''}>${n > 0 ? '+' : '−'}${Math.abs(n)}</button>`).join('')}</span></div>`;
  };
  const towns = (fid, list, group) => {
    const cs = citiesOf(s, fid).filter((c) => !c.capital);
    return cs.length ? cs.map((c) => chip(group, c.id, `${icon('castle')}${esc(c.name)} <small>L${c.level}</small>`, list.includes(c.id))).join('') : '<span class="hint">No towns besides the capital</span>';
  };
  const techs = (from, to, list, group) => {
    const ts = teachable(s, from, to);
    return ts.length ? ts.map((k) => chip(group, k, `${icon('book')}${esc(TECHS[k].name)}`, list.includes(k))).join('') : '<span class="hint">No techs to teach</span>';
  };
  const treaty = (k, extra = '') => {
    const on = d.treaties.includes(k);
    const probe = evaluateDeal(s, P, d.with, [...(r.war && k !== 'peace' ? [{ k: 'peace' }] : []), k.startsWith('joinwar:') ? { k: 'joinwar', target: +k.split(':')[1] } : { k }]);
    const blocked = probe.problem && !probe.problem.includes('offer peace');
    const base = k.split(':')[0];
    return chip('treaty', k, `${icon({ peace: 'dove', pact: 'seal', trade: 'scales', alliance: 'handshake', marriage: 'ring', vassal: 'chain', joinwar: 'attack' }[base])}${esc(extra || TREATIES[base].name)}`, on, !blocked, blocked ? probe.problem : TREATIES[base].desc);
  };
  const wars = s.factions.filter((o) => o.alive && o.id !== P && o.id !== d.with && r && relation(s, P, o.id).war);
  const treatyRow = [
    r.war ? treaty('peace') : '',
    treaty('pact'), treaty('trade'), treaty('alliance'),
    heirOf(s, P) ? treaty('marriage', `Wed ${titled(heirOf(s, P), 'heir')}`) : '',
    treaty('vassal'),
    ...wars.map((o) => treaty(`joinwar:${o.id}`, `Join war on ${o.short}`)),
  ].join('');
  const verdict = !items.length ? `<div class="verdict idle">${icon('scales')}Add terms to see how ${esc(X.short)} weighs them</div>`
    : ev.problem ? `<div class="verdict bad">${icon('lock')}${esc(ev.problem)}</div>`
    : `<div class="verdict ${ev.accept ? 'good' : 'bad'}">${ev.accept ? `${icon('check')}${esc(X.short)} will accept` : `${esc(X.short)} will refuse`}<span class="score">${ev.score > 0 ? '+' : ''}${ev.score}</span></div>`;
  const m = root.querySelector('.modal');
  const keep = m.querySelector('.dialog')?.scrollTop ?? 0;
  const again = !!m.querySelector('.deal');
  openModal(`<div class="deal">
    <div class="eyebrow">The negotiation table · Turn ${s.turn}</div>
    <div class="deal-head">
      <div class="side-h">${portrait(s.characters[f.rulerId], f.color, { role: 'ruler', cls: 'portrait sm' })}<div><b>${esc(f.short)}</b><small class="muted">${icon('gold')}${f.gold}</small></div></div>
      <div class="vs">${icon('handshake')}</div>
      <div class="side-h r"><div><b>${esc(X.short)}</b><small class="muted">${icon('gold')}${X.gold}</small></div>${portrait(s.characters[X.rulerId], X.color, { role: 'ruler', cls: 'portrait sm' })}</div>
    </div>
    <h4>Terms</h4>
    <div class="treaties">${treatyRow}</div>
    <div class="deal-cols">
      <div class="col"><h4>You give</h4>${stepper('give', f.gold)}<div class="chips">${towns(P, d.giveTowns, 'giveTown')}</div><div class="chips">${techs(P, d.with, d.giveTechs, 'giveTech')}</div></div>
      <div class="col"><h4>You ask for</h4>${stepper('ask', X.gold)}<div class="chips">${towns(d.with, d.askTowns, 'askTown')}</div><div class="chips">${techs(d.with, P, d.askTechs, 'askTech')}</div></div>
    </div>
    ${verdict}
    ${items.length ? `<details class="whybox" open><summary>How ${esc(X.short)} weighs it</summary>${reasons(ev.parts)}</details>` : ''}
    <div class="actions"><button class="primary" data-dsend ${ev.accept ? '' : 'disabled'}>Propose</button><button class="ghost" data-dclear>Clear</button><button class="ghost" data-close>Leave the table</button></div>
  </div>`);
  const dialog = m.querySelector('.dialog');
  dialog.classList.add('wide');
  if (again) dialog.style.animation = 'none';
  dialog.scrollTop = keep;
  dialog.addEventListener('click', onDealClick);
}

function onDealClick(e) {
  const d = ui.deal;
  const s = ui.s;
  const b = e.target.closest('button');
  if (!b || b.disabled || !d) return;
  const toggle = (list, v) => { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); };
  if (b.dataset.dgold) {
    const key = b.dataset.dgold === 'give' ? 'giveGold' : 'askGold';
    const have = b.dataset.dgold === 'give' ? me().gold : s.factions[d.with].gold;
    d[key] = Math.max(0, Math.min(have, d[key] + +b.dataset.dn));
  } else if (b.dataset.dg) {
    const v = b.dataset.dv;
    const g = b.dataset.dg;
    if (g === 'giveTown') toggle(d.giveTowns, +v);
    else if (g === 'askTown') toggle(d.askTowns, +v);
    else if (g === 'giveTech') toggle(d.giveTechs, v);
    else if (g === 'askTech') toggle(d.askTechs, v);
    else if (g === 'treaty') toggle(d.treaties, v);
  } else if (b.hasAttribute('data-dclear')) {
    ui.deal = null;
    return showDeal(d.with);
  } else if (b.hasAttribute('data-dsend')) {
    const res = proposeDeal(s, s.playerId, d.with, dealItems());
    if (typeof res === 'string') { toast(res); sfx.bad(); return; }
    sfx.coin();
    ui.deal = null;
    ui.undo = null;
    closeModal();
    toast(`${s.factions[res.with].short} agrees`, 'ok');
    autosave();
    if (s.winner) return showEnd();
    render();
    if (s.pendingEvents.length) showEvent();
    return;
  } else return;
  renderDeal();
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
    <div class="ph"><div class="ph-title">${icon('lore')}${T ? esc(T.name) : 'No research'}</div><span class="hint">${f.lore} lore · +${inc.lore} / turn</span></div>
    ${T ? `<div class="meter lore"><div class="meter-l"><span>Done in ${turnsLeft(T.cost)}</span><b>${Math.min(f.lore, T.cost)} / ${T.cost}</b></div><div class="meter-bar"><span style="width:${Math.min(100, (f.lore / T.cost) * 100)}%"></span></div></div>`
    : '<p class="hint">Lore is banked until you pick a tech below. Each branch is a ladder: master one step to unlock the next.</p>'}</div>`;
  // Each branch is a ladder, drawn as a list: one rung per tier, with a rail linking the rungs.
  out += '<div class="tree">';
  for (const [bk, B] of Object.entries(BRANCHES)) {
    const rungs = Object.entries(TECHS).filter(([, x]) => x.branch === bk).sort((a, b) => a[1].tier - b[1].tier);
    const have = rungs.filter(([k]) => f.techs.includes(k)).length;
    out += `<div class="branch"><h4>${icon({ war: 'attack', econ: 'scales', state: 'crown' }[bk])}${B.name}<span>${have} of ${rungs.length}</span></h4><div class="list">`;
    for (const [k, X] of rungs) {
      const done = f.techs.includes(k);
      const avail = techAvailable(s, fid, k);
      const cur = f.research === k;
      const unlocks = Object.values(POLICIES).filter((p) => p.req === k).map((p) => p.name);
      const state = done ? 'done' : cur ? 'cur' : avail ? 'avail' : 'locked';
      const right = done ? '<span class="tech-r pos">Learned</span>'
        : cur ? `<span class="tech-r gold">${turnsLeft(X.cost) === 'now' ? 'Next turn' : turnsLeft(X.cost)}</span>`
          : `<span class="tech-r"><span class="cost">${icon('lore')}${X.cost}</span>${avail ? `<small>${turnsLeft(X.cost)}</small>` : ''}</span>`;
      out += `<button class="tech ${state}" data-act="research" data-v="${k}" ${can && avail && !cur ? '' : 'disabled'} title="${avail && !cur ? `Research ${esc(X.name)}` : ''}">
        <i class="rung">${done ? icon('check') : cur ? '<span></span>' : ''}</i>
        <span class="tech-m"><b>${X.name}</b><small>${esc(X.desc)}${unlocks.length ? ` <em>Unlocks ${unlocks.join(', ')}.</em>` : ''}</small></span>${right}</button>`;
    }
    out += '</div></div>';
  }
  out += '</div>';
  const slots = policySlots(s, fid);
  out += `<h4>Policies <span>${f.policies.length} of ${slots} slots used</span></h4>
    <p class="hint mb">Adopting costs ${POLICY_COST} gold, dropping is free. Code of Laws and Bureaucracy add slots.</p><div class="list policies">`;
  for (const [k, P] of Object.entries(POLICIES)) {
    const on = f.policies.includes(k);
    const avail = policyAvailable(s, fid, k);
    const full = f.policies.length >= slots;
    const btn = on ? `<button class="ghost small" data-act="droppol" data-v="${k}" ${can ? '' : 'disabled'}>Drop</button>`
      : avail ? `<button class="small" data-act="adopt" data-v="${k}" ${can && !full && f.gold >= POLICY_COST ? '' : 'disabled'} title="${full ? 'No free slot: drop a policy first' : ''}">Adopt <small>−${POLICY_COST}${icon('gold')}</small></button>`
        : `<span class="hint">Needs ${TECHS[P.req].name}</span>`;
    out += `<div class="policy ${on ? 'on' : avail ? '' : 'locked'}"><div><b>${on ? icon('check') : ''}${P.name}</b><small>${esc(P.desc)}</small></div>${btn}</div>`;
  }
  return `${out}</div>`;
}

function paneLog() {
  const items = [...ui.s.log].reverse().slice(0, 90);
  let out = '<div class="log">';
  let turn = null;
  for (const l of items) {
    if (l.turn !== turn) {
      turn = l.turn;
      out += `<div class="log-turn"><span>Turn ${l.turn}</span></div>`;
    }
    out += `<div class="entry ${l.kind}"><span>${iconize(esc(l.text))}</span></div>`;
  }
  return `${out}</div>`;
}

// ---------------------------------------------------------------- input
function select(tile) {
  const s = ui.s;
  ui.selectedTile = tile;
  ui.armedTarget = null;
  const u = seenUnitAt(tile);
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
  select(tile === ui.selectedTile && !seenUnitAt(tile) ? null : tile);
}

function onZoom(z) {
  const zt = root.querySelector('.zoom-tools');
  if (!zt) return;
  zt.querySelector('[data-act="zoomout"]').disabled = z <= 1.01;
  zt.querySelector('[data-act="zoomfit"]').disabled = z <= 1.01;
  zt.querySelector('[data-act="zoomin"]').disabled = z >= 2.55;
}

function onTileHover(tile, e) {
  const s = ui.s;
  if (!s || noHover) return;
  ui.board.setHover(ui.busy ? null : tile);
  if (ui.busy) return;
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
    const u = seenUnitAt(tile);
    const known = tile != null && explored(s, tile);
    const c = known ? cityAt(s, tile) : null;
    if (u && u.owner !== s.playerId && e) showUnitTip(u, e);
    else if (c && e && !sel) showTownTip(c, e);
    else if (tile != null && !known && e && !sel) tipAt(`<div class="pv"><div class="pv-h">${icon('fog')} Unexplored</div><div class="small">Scout it to see what lies here.</div></div>`, e);
    else if (known && s.tiles[tile].shrine && e && !sel) tipAt(`<div class="pv"><div class="pv-h">${icon('shrine')} Ancient shrine</div><div class="small">Stand a unit here at the start of your turn for +1 renown.</div></div>`, e);
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
    const tw = tip.offsetWidth || 240;
    const th = tip.offsetHeight || 120;
    if (x + tw > wrap.width - 8) x = e.clientX - wrap.left - tw - 16;
    if (y + th > wrap.height - 8) y = Math.max(8, e.clientY - wrap.top - th - 16);
    x = Math.max(8, x);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  } else {
    tip.style.left = '12px';
    tip.style.top = '12px';
  }
}
function hideTip() { root.querySelector('.tip')?.classList.remove('on'); }

function showPreview(att, def, e) {
  const s = ui.s;
  const p = combatPreview(s, att, def);
  const aMax = maxHp(s, att.type, att.owner, att.vet);
  const dMax = maxHp(s, def.type, def.owner, def.vet);
  const colorOf = (o) => (o < 0 ? '#6d6a75' : s.factions[o].color);
  const side = (u, max, loss, label) => {
    const left = Math.max(0, u.hp - loss);
    return `<div class="pv-side">${tokenSvg(u.type, colorOf(u.owner))}<div class="pv-info">
      <div class="pv-name">${label}</div>
      <div class="pv-bar"><span class="keep" style="width:${(left / max) * 100}%"></span><span class="loss" style="left:${(left / max) * 100}%;width:${(Math.min(u.hp, loss) / max) * 100}%"></span></div>
      <div class="pv-num">${loss ? `<span class="neg">−${loss}</span> · ` : '<span class="muted">unharmed</span> · '}${u.hp} → <b>${left}</b><span class="muted"> / ${max}</span></div></div></div>`;
  };
  const gain = p.dmg / dMax - p.ret / aMax;
  const [cls, verdict] = p.dies ? ['bad', 'Your unit will die'] : p.kill ? ['good', p.ret ? 'Destroys them' : 'Destroys them, unharmed'] : p.ret === 0 ? ['good', 'Free hit: no strike back'] : gain > 0.15 ? ['good', 'Good trade'] : gain < -0.15 ? ['bad', 'Bad trade'] : ['even', 'Even trade'];
  const owner = def.owner < 0 ? 'Rebel' : s.factions[def.owner].short;
  tipAt(`<div class="pv">
    ${side(att, aMax, p.ret, `Your ${UNITS[att.type].name}`)}
    <div class="pv-vs"><span>vs</span></div>
    ${side(def, dMax, p.dmg, `${esc(owner)} ${UNITS[def.type].name}`)}
    <div class="pv-verdict ${cls}">${verdict}</div>
    ${p.kill && UNITS[att.type].range === 1 ? '<div class="muted small">Your unit will advance into the hex.</div>' : ''}
    ${noHover ? '<div class="small gold">Tap again to attack</div>' : ''}</div>`, e);
}

function peaceWords(fid) {
  const s = ui.s;
  const P = s.playerId;
  const r = relation(s, P, fid);
  if (s.factions[fid].overlord === P) return 'Your vassal: your armies may pass';
  if (s.factions[P].overlord === fid) return 'Your liege';
  if (r.alliance) return 'Your ally: your armies may pass';
  if (r.pact > s.turn) return `At peace, with a pact until turn ${r.pact}`;
  return 'At peace with you';
}

function showTownTip(c, e) {
  const s = ui.s;
  const fogged = fogOn(s) && ui.board.isFogged(c.tile);
  const o = fogged ? knownOwner(s, c, null) : c.owner;
  const owner = o < 0 ? null : s.factions[o];
  const g = fogged ? null : unitAt(s, c.tile);
  const status = fogged ? 'Out of sight: last seen like this' : c.owner === s.playerId ? 'Your town' : !owner ? 'Free town: walk in to claim it' : hostile(s, s.playerId, c.owner) ? 'At war: take it when it is empty' : peaceWords(c.owner);
  tipAt(`<div class="pv town-tip"><div class="pv-h">${owner ? crest(owner.key, owner.color, 'crest sm') : ''}${esc(c.name)}${c.capital ? ' <span class="tag">Capital</span>' : ''}</div>
    <div class="small">${owner ? esc(owner.name) : 'Rebels'} · Level ${c.level}${c.buildings.length ? ` · ${c.buildings.map((b) => BUILDINGS[b].name).join(', ')}` : ''}</div>
    <div class="small">${fogged ? 'Garrison unknown' : g ? `Garrison: ${UNITS[g.type].name} (${g.hp} HP)` : 'No garrison'}</div>
    <div class="small muted">${status}</div></div>`, e);
}

function showUnitTip(u, e) {
  const owner = u.owner < 0 ? 'Rebels' : ui.s.factions[u.owner].name;
  const U = UNITS[u.type];
  const ruler = u.type === 'ruler' && u.owner >= 0 ? ui.s.characters[ui.s.factions[u.owner].rulerId] : null;
  const town = cityAt(ui.s, u.tile);
  tipAt(`<div class="pv">${ruler ? `<div class="tip-ruler">${portrait(ruler, ui.s.factions[u.owner].color, { cls: 'portrait xs' })}<div><b>${esc(titled(ruler, 'ruler'))}</b>, age ${ruler.age}<div class="muted small">${ruler.traits.map((t) => TRAITS[t].name).join(' · ')}</div></div></div>` : ''}<div class="pv-h">${esc(owner)}: ${U.name}${u.vet ? ' ★' : ''}</div>${town ? `<div class="small muted">Holding ${esc(town.name)}</div>` : ''}<div class="small stats">${icon('hp')}${u.hp}/${maxHp(ui.s, u.type, u.owner, u.vet)} ${icon('attack')}${baseAtk(ui.s, u.owner, u.type)} ${icon('defence')}${baseDef(ui.s, u.owner, u.type)} ${icon('move')}${movePoints(ui.s, u)} ${icon('range')}${U.range}</div></div>`, e);
}

async function doMove(u, tile) {
  const s = ui.s;
  const snapshot = JSON.stringify(s);
  const res = moveUnit(s, u.id, tile);
  if (typeof res === 'string') return toast(res);
  const path = res.path;
  // An ambush reveals what was hidden, so it cannot be taken back.
  ui.undo = res.capture || res.ambush ? null : { snapshot, uid: u.id };
  s.tut = { ...(s.tut ?? {}), moved: true };
  ui.busy = true;
  ui.reach = null;
  ui.targets = [];
  ui.board.showPath(null);
  hideTip();
  sfx.move();
  await ui.board.animateMove(u.id, path, 110);
  ui.busy = false;
  if (res.ambush) {
    sfx.bad();
    ui.board.float(u.tile, 'Ambush!', 'kill');
    toast(res.ambush === 'blocked' ? `Your ${UNITS[u.type].name} ran into enemies hidden in the fog and halted.` : `Your ${UNITS[u.type].name} spotted hidden enemies and halted.`);
  }
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
  const owner = ui.s.cities[cap.cityId]?.owner;
  ui.board.shockwave(tile, owner >= 0 ? ui.s.factions[owner].color : '#ffd76a');
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
    case 'tab': {
      ui.tab = b.dataset.v;
      ui.confirmWar = null;
      render();
      const pane = root.querySelector('.pane');
      pane.classList.remove('fade');
      void pane.offsetWidth;
      pane.classList.add('fade');
      clearTimeout(pane._fade);
      pane._fade = setTimeout(() => pane.classList.remove('fade'), 300);
      pane.scrollTop = 0;
      break;
    }
    case 'end': if (myTurn()) await playerEndTurn(); break;
    case 'next': nextUnit(); break;
    case 'hold': {
      const u = s.units.find((x) => x.id === ui.selectedUnit) ?? unitAt(s, ui.selectedTile);
      if (u) { u.moved = true; u.attacked = true; }
      nextUnit();
      break;
    }
    case 'recruit': r(recruit(s, fid, +b.dataset.v, b.dataset.u), () => { sfx.build(); s.tut = { ...(s.tut ?? {}), recruited: true }; }); break;
    case 'upgrade': r(upgradeCity(s, fid, +b.dataset.v), () => { sfx.build(); ui.board.pulse(s.cities[+b.dataset.v].tile, 'pulse gold'); ui.board.sparkle(s.cities[+b.dataset.v].tile); }); break;
    case 'build': r(build(s, fid, +b.dataset.v, b.dataset.b), () => { sfx.build(); ui.board.pulse(s.cities[+b.dataset.v].tile, 'pulse gold'); ui.board.sparkle(s.cities[+b.dataset.v].tile); }); break;
    case 'research': r(setResearch(s, fid, b.dataset.v), () => { sfx.build(); s.tut = { ...(s.tut ?? {}), researched: true }; }); break;
    case 'adopt': r(adoptPolicy(s, fid, b.dataset.v), () => sfx.coin()); break;
    case 'droppol': r(dropPolicy(s, fid, b.dataset.v)); break;
    case 'trade': r(trade(s, fid, b.dataset.g, +b.dataset.n, b.dataset.side), () => sfx.coin()); break;
    case 'askwar': ui.confirmWar = +b.dataset.v; render(); break;
    case 'nowar': ui.confirmWar = null; render(); break;
    case 'war': ui.confirmWar = null; r(declareWar(s, fid, +b.dataset.v), () => sfx.bad()); if (s.pendingEvents.length) showEvent(); break;
    case 'peace': r(offerPeace(s, fid, +b.dataset.v, +b.dataset.gold), () => sfx.event()); break;
    case 'deal': showDeal(+b.dataset.v); break;
    case 'gift': r(sendGift(s, fid, +b.dataset.v, GIFT_GOLD), () => sfx.coin()); break;
    case 'release': r(releaseVassal(s, fid, +b.dataset.v), () => sfx.event()); break;
    case 'zoomin': ui.board.zoomIn(); break;
    case 'zoomout': ui.board.zoomOut(); break;
    case 'zoomfit': ui.board.resetView(); break;
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
  if (ui.showDanger && !threatTiles(ui.s, ui.s.playerId).size) toast('No army at war with you can reach your lands. Rebels never leave their towns.', 'info');
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
  ui.board.centerOn(u.tile);
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
  else if (k === '+' || k === '=') ui.board.zoomIn();
  else if (k === '-' || k === '_') ui.board.zoomOut();
  else if (k === '0') ui.board.resetView();
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
    banner(`${f.name}`, f.color, f);
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
  banner(`Turn ${s.turn} · Your move`, me().color, me());
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
  pruneEvents(ui.s);
  render();
  if (ui.s.pendingEvents.length) showEvent();
  else nextUnitIfAny();
}

function nextUnitIfAny() {
  const r = readyUnits(ui.s, ui.s.playerId);
  if (r.length && ui.selectedUnit == null) {
    const t = r.find((u) => u.type !== 'ruler')?.tile ?? r[0].tile;
    select(t);
    ui.board.centerOn(t);
  }
}

function banner(text, color, f = null) {
  const b = root.querySelector('.banner');
  b.innerHTML = `${f ? crest(f.key, f.color, 'crest banner-crest') : ''}<span>${esc(text)}</span>`;
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
  const stay = !!m.querySelector('.deal'); // leaving the negotiation table keeps you on the Diplomacy tab
  m.classList.remove('on');
  m.innerHTML = '';
  if (ui.s && !ui.s.winner && myTurn() && !stay) nextUnitIfAny();
}

function showEvent() {
  const s = ui.s;
  pruneEvents(s);
  const ev = s.pendingEvents[0];
  if (!ev) { render(); return nextUnitIfAny(); }
  const v = eventView(s, ev);
  sfx.event();
  openModal(`<div class="eyebrow">Turn ${s.turn} · ${esc(me().name)}</div>${vignette(v.scene)}<h2>${esc(v.title)}</h2><p>${esc(v.text)}</p>
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
      <div><b>${icon('range')}Goal</b><p>Be the first house to reach <b>${RENOWN_TO_WIN} renown</b>, or the last one standing. If nobody gets there by turn ${TURN_LIMIT}, the most renowned house wins.</p></div>
      <div><b>${icon('renown')}Renown</b><p>Claim free towns (+2), seize rival towns (+4, capitals +8), stand on a shrine <span class="gold">✦</span> (+1 each turn), win battles (+1, a ruler +4), grow towns to level 3 (+2), raise a cathedral (+4 and +1 each turn).</p></div>
      <div><b>${icon('attack')}Units</b><p>Click a unit: lit hexes are where it can go, red rings are enemies it can hit. <b>Hover an enemy for the exact outcome</b>: every fight is predictable. Forests and hills end your move but defend well. Moving next to an enemy stops you (zone of control).</p></div>
      <div><b>${icon('castle')}Towns</b><p>Click your town to recruit (one unit per turn, two with Barracks), grow it, and add buildings. Each soldier eats 1 grain per turn. Run out and your army starves.</p></div>
      <div><b>${icon('lore')}Research</b><p>Your towns make lore. In the Research tab, pick a tech in Warfare, Economy or Statecraft; it completes once enough lore is banked. Techs unlock policies: pick one per slot to shape your realm.</p></div>
      <div><b>${icon('fog')}Fog of war</b><p>You only see what your troops and towns can see: two hexes for most units, three for cavalry, one more from a hill. Enemies in forest show only when you stand next to them. March blind and you may run into an ambush. Allies and vassals share their sight.</p></div>
      <div><b>${icon('handshake')}Diplomacy</b><p>Every house has an opinion of you, and you can see each reason behind it. At the negotiation table, trade gold, towns and techs, or sign pacts, trade agreements, alliances and royal marriages. Crush a rival and it may swear fealty. Break an oath and every court remembers.</p></div>
      <div><b>${icon('scales')}Market</b><p>Sell what you have too much of, buy what you lack. Prices move with every trade, including your rivals' trades.</p></div>
      <div><b>${icon('renown')}Veterans</b><p>A unit that wins three fights becomes a veteran: +4 HP. Keep your veterans alive.</p></div>
      <div><b>${icon('danger')}Danger zones</b><p>Toggle them to see every hex the enemy can strike next turn. Misclicked a move? Undo it (as long as nothing was attacked or captured).</p></div>
      <div><b>${icon('crown')}Your ruler</b><p>Your ruler fights on the map and inspires adjacent troops (+25% attack). If they fall, your heir inherits, and some of your towns may revolt.</p></div>
    </div>
    <h4>The troops</h4>
    <div class="roster">${[...RECRUITABLE, 'ruler'].map((t) => { const U = UNITS[t]; return `<div class="ro">${tokenSvg(t, me().color)}<div><b>${U.name}</b><span class="ro-stats">${icon('attack')}${U.atk} ${icon('defence')}${U.def} ${icon('move')}${U.move} ${icon('range')}${U.range} ${icon('hp')}${U.hp}</span><small>${esc(U.desc)}</small></div></div>`; }).join('')}</div>
    <p class="small muted keys">Keys: <kbd>N</kbd> next unit · <kbd>F</kbd> hold · <kbd>U</kbd> undo move · <kbd>D</kbd> danger zones · <kbd>E</kbd> end turn · <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd> zoom · <kbd>Esc</kbd> deselect</p>
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
    const s = newGame({ seed: ui.s.seed, playerFaction: ui.s.playerId, difficulty: ui.s.difficulty, fog: fogOn(ui.s) });
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
  const why = { renown: `reached ${RENOWN_TO_WIN} renown`, conquest: 'conquered or subjugated every rival', time: `had the most renown when the age ended`, eliminated: 'outlasted you' }[s.winner.reason];
  const f = me();
  const src = Object.entries(f.stats.renown).filter(([, v]) => v > 0);
  const maxSrc = Math.max(1, ...src.map(([, v]) => v));
  const ranking = [...s.factions].sort((a, b) => b.renown - a.renown);
  openModal(`<div class="endscreen ${won ? 'won' : 'lost'}">
    <div class="eyebrow">Turn ${s.turn}</div>
    <h2>${won ? 'Victory!' : 'Defeat'}</h2>
    <div class="end-portrait">${portrait(s.characters[w.rulerId], w.color, { cls: 'portrait xl' })}${crest(w.key, w.color, 'crest lg')}</div>
    <p>${won ? `${esc(f.name)} ${why}. The Marches are yours.` : `${esc(w.name)} ${why}.`}</p>
    <div class="ranking">${ranking.map((x, i) => `<div class="row ${x.id === s.playerId ? 'me' : ''}"><span>#${i + 1} ${crest(x.key, x.color, 'crest xs')}${esc(x.name)}${x.alive ? '' : ' †'}</span><b>${x.renown}</b></div>`).join('')}</div>
    <h4>Where your renown came from</h4>
    <div class="srcs">${src.map(([k, v]) => `<div class="row"><span>${k}</span><span class="pbar"><span style="width:${(v / maxSrc) * 100}%"></span></span><b>${v}</b></div>`).join('') || '<p class="muted">None, alas.</p>'}</div>
    <div class="statsline"><span>${icon('attack')}${f.stats.kills} enemies slain</span><span>${icon('castle')}${f.stats.captures} towns taken</span><span>${icon('skull')}${f.stats.lost} units lost</span><span>${icon('hammer')}${f.stats.built} works built</span></div>
    <div class="actions"><button class="primary" data-again>Play again</button><button class="ghost" data-close>Look at the map</button></div></div>`);
  root.querySelector('[data-again]').addEventListener('click', () => showStart());
  if (won && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 37) % 100}%;--t:${2.4 + ((i * 13) % 20) / 10}s;--d:${((i * 7) % 15) / 10}s;--x:${((i * 29) % 120) - 60}px;--r:${((i * 53) % 720) - 360}deg"></i>`).join('');
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

// Summarise what happened during the enemies' turns.
function report(entries) {
  const s = ui.s;
  const me_ = me();
  const mine = entries.filter((l) => l.kind === 'bad' || l.kind === 'good' || l.text.includes(me_.short) || l.text.includes(me_.name));
  const big = entries.filter((l) => !mine.includes(l) && /declares war|destroyed|falls in battle|cathedral|make peace|bends the knee|breaks its|independence|an alliance/.test(l.text));
  const items = [...mine, ...big].slice(-5);
  if (!items.length) return;
  if (items.some((l) => l.kind === 'bad')) sfx.bad();
  const box = root.querySelector('.report') ?? Object.assign(document.createElement('div'), { className: 'report' });
  root.querySelector('.board-wrap').appendChild(box);
  box.innerHTML = `<div class="report-h"><span>While you waited</span><button class="x" data-dismiss aria-label="Dismiss">✕</button></div>${items.map((l) => `<div class="entry ${l.kind}">${iconize(esc(l.text))}</div>`).join('')}`;
  box.classList.add('on');
  box.querySelector('[data-dismiss]').onclick = () => box.classList.remove('on');
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('on'), 9000);
  void s;
}

function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
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
    if (s) s.fog ??= newFog(false); // saves from before fog of war play on without it
    return s ? ensureDiplomacy(s) : s;
  } catch { return null; }
}

// ---------------------------------------------------------------- start screen
function showStart() {
  const saved = loadSave();
  let choice = { faction: 0, difficulty: 'normal', seed: Math.random().toString(36).slice(2, 8), fog: prefs.fog !== false };
  root.innerHTML = `<div class="backdrop"></div><div class="start">
    <div class="hero">
      <div class="hero-crests">${FACTIONS.map((F) => crest(F.key, F.color, 'crest md')).join('')}</div>
      <h1>Hex<span>march</span></h1>
      <p class="tag">Four houses. One contested borderland. Thirty-odd turns of steel, silver and succession.</p>
    </div>
    <div class="start-grid">
      <div class="preview"><svg class="board" role="img" aria-label="Map preview"></svg>
        <div class="seed-row"><label>Map <input class="seed" maxlength="16"></label><button class="ghost" data-s="reroll">${icon('dice')}<span>New map</span></button></div>
      </div>
      <div class="pick">
        <h3>Choose your house</h3>
        <div class="houses">${FACTIONS.map((F, i) => `<button class="house" data-house="${i}" style="--c:${F.color}">
          ${crest(F.key, F.color, 'crest lg')}<span class="house-txt"><b>${F.name}</b><i>“${F.motto}”</i><small><b>${F.bonus}:</b> ${F.bonusDesc}</small></span></button>`).join('')}</div>
        <h3>Difficulty</h3>
        <div class="seg diff">${Object.entries(DIFFICULTY).map(([k, D]) => `<button data-diff="${k}">${D.name}</button>`).join('')}</div>
        <h3>Fog of war</h3>
        <div class="seg fogsel"><button data-fog="1">${icon('fog')}On: scout to see</button><button data-fog="0">Off: see everything</button></div>
        <button class="primary big" data-s="go">Ride out</button>
        ${saved && !saved.winner ? `<button class="ghost" data-s="continue">Continue: ${esc(saved.factions[saved.playerId].name)}, turn ${saved.turn}</button>` : ''}
        <a class="classic" href="classic/">Prefer slow, sprawling grand strategy? Play Crowns &amp; Ledgers →</a>
      </div>
    </div></div>`;
  const svg = root.querySelector('.preview svg');
  const board = createBoard(svg, { onTileClick: () => {}, onTileHover: () => {}, interactive: false });
  const draw = () => {
    root.querySelector('.seed').value = choice.seed;
    const s = newGame({ seed: choice.seed, playerFaction: choice.faction, difficulty: choice.difficulty });
    board.build(s);
    board.render({ myTurn: false });
    const art = svg.querySelector('image')?.getAttribute('href');
    const bd = root.querySelector('.backdrop');
    if (art && bd) bd.style.backgroundImage = `url(${art})`;
    root.querySelectorAll('.house').forEach((b) => b.classList.toggle('on', +b.dataset.house === choice.faction));
    root.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === choice.difficulty));
    root.querySelectorAll('[data-fog]').forEach((b) => b.classList.toggle('on', (b.dataset.fog === '1') === choice.fog));
  };
  // Let the title paint before the (slower) first map paint.
  requestAnimationFrame(() => setTimeout(draw, 0));
  root.querySelector('.start').addEventListener('click', (e) => {
    const h = e.target.closest('[data-house]');
    if (h) { choice.faction = +h.dataset.house; sfx.select(); draw(); return; }
    const d = e.target.closest('[data-diff]');
    if (d) { choice.difficulty = d.dataset.diff; draw(); return; }
    const fg = e.target.closest('[data-fog]');
    if (fg) { choice.fog = fg.dataset.fog === '1'; prefs.fog = choice.fog; savePrefs(); root.querySelectorAll('[data-fog]').forEach((x) => x.classList.toggle('on', x === fg)); return; }
    const b = e.target.closest('[data-s]');
    if (!b) return;
    if (b.dataset.s === 'reroll') { choice.seed = Math.random().toString(36).slice(2, 8); draw(); }
    if (b.dataset.s === 'go') {
      const s = newGame({ seed: choice.seed, playerFaction: choice.faction, difficulty: choice.difficulty, fog: choice.fog });
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
window.__hexDebug = { showEnd, render, aiTurn, showEvent };
