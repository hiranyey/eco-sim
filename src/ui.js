// DOM rendering for the in-game screen. All clicks go through one delegated handler.
import { GOODS, BUILDINGS, TERRAIN, TRAITS, ROLES, SKILLS, TAX_LEVELS, STANCES, INNOVATIONS } from './data.js';
import {
  REGIMENT_COST, REGIMENT_UPKEEP, GIFT_COST, GOOD_KEYS, JOBS_PER_LEVEL, dateOf, playerRealm, provincesOf, totalPop,
  charOf, stat, ageOf, fullName, getRelation, getPact, hasTruce, warBetween, warsOf, labor, realmMods, sum,
  tradeEfficiency, relKey,
} from './core.js';
import { buildingCost, expectedValue, maxConstruction, activeConstruction, realmLevels } from './economy.js';
import { armyStrength, canDeclareWar } from './war.js';
import { candidates, hireCost, peaceAcceptance } from './actions.js';
import { researchRate, rankings, overextension } from './sim.js';
import { eventView } from './events.js';
import { advice } from './advice.js';
import { createMap, MAP_MODES } from './map.js';

export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const gold = (n) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
export const popFmt = (k) => (k >= 1000 ? `${(k / 1000).toFixed(2)}M` : `${Math.round(k)}k`);
const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const btn = (act, args, label, { cls = '', disabled = false, title = '' } = {}) =>
  `<button class="${cls}" data-act="${act}" data-args='${esc(JSON.stringify(args))}'${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
const bar = (frac, cls = '') => `<span class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(0)}%"></span></span>`;
const dot = (color) => `<span class="dot" style="background:${color}"></span>`;

const TABS = {
  advisor: 'Advisor', province: 'Province', realm: 'Court', economy: 'Economy',
  military: 'Army', diplomacy: 'Diplomacy', research: 'Research',
};

export function createGameUI(root, game) {
  const ui = { tab: 'advisor', selected: null, mapMode: 'realm', expandedRole: null, confirmWar: null, lastLogKey: '', pointerDown: false, dirty: true };
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">Crowns <span>&amp;</span> Ledgers</div>
      <button class="realm-badge" data-act="tab" data-args='["realm"]'></button>
      <div class="top-stats"></div>
      <div class="clock">
        <span class="date"></span>
        <div class="speed">
          ${btn('pause', [], '❚❚', { title: 'Pause (Space)' })}${btn('speed', [1], '▶', { title: 'Normal speed (1)' })}${btn('speed', [2], '▶▶', { title: 'Fast (2)' })}${btn('speed', [3], '▶▶▶', { title: 'Very fast (3)' })}
        </div>
      </div>
      <div class="menu">${btn('save', [], 'Save')}${btn('load', [], 'Load')}${btn('newGame', [], 'New game')}</div>
    </header>
    <main class="layout">
      <section class="map-area">
        <div class="mapmodes">${Object.entries(MAP_MODES).map(([k, v]) => btn('mapMode', [k], v, { cls: 'chip' })).join('')}</div>
        <div class="map-wrap"><svg class="map" role="img" aria-label="Map of the continent"></svg></div>
        <div class="log" aria-live="polite"></div>
      </section>
      <aside class="panel">
        <nav class="tabs">${Object.entries(TABS).map(([k, v]) => btn('tab', [k], v, { cls: 'tab' })).join('')}</nav>
        <div class="tab-body"></div>
      </aside>
    </main>
    <div class="modal-root"></div>
    <div class="toasts"></div>`;
  const $ = (sel) => root.querySelector(sel);
  const body = $('.tab-body');
  const map = createMap($('.map'), game.state, (pid) => { ui.selected = pid; ui.tab = 'province'; render(true); });

  root.addEventListener('pointerdown', (e) => { if (e.target.closest('.panel')) ui.pointerDown = true; });
  window.addEventListener('pointerup', () => { ui.pointerDown = false; if (ui.dirty) render(); });
  window.addEventListener('pointercancel', () => { ui.pointerDown = false; });

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.tagName === 'A') e.preventDefault();
    const args = el.dataset.args ? JSON.parse(el.dataset.args) : [];
    handle(el.dataset.act, args);
  });

  function toast(text, kind = 'bad') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    $('.toasts').appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function handle(name, args) {
    const s = game.state;
    switch (name) {
      case 'tab': ui.tab = args[0]; ui.expandedRole = null; body.scrollTop = 0; break;
      case 'select': ui.selected = args[0]; ui.tab = 'province'; body.scrollTop = 0; break;
      case 'mapMode': ui.mapMode = args[0]; break;
      case 'pause': game.togglePause(); break;
      case 'speed': game.setSpeed(args[0]); break;
      case 'save': {
        const ok = game.save();
        toast(ok ? 'Game saved' : 'Could not save (storage unavailable)', ok ? 'good' : 'bad');
        break;
      }
      case 'load': if (!game.load()) toast('No saved game found'); return;
      case 'newGame': game.showStart(); return;
      case 'openEvent': break;
      case 'showRole': ui.expandedRole = ui.expandedRole === args[0] ? null : args[0]; if (ui.expandedRole) candidates(s, s.playerId, args[0]); break;
      case 'confirmWar': ui.confirmWar = args[0]; break;
      case 'cancelWar': ui.confirmWar = null; break;
      case 'eventOption': game.resolveEvent(args[0]); break;
      case 'declareWar': ui.confirmWar = null; // fallthrough to the game action
      // eslint-disable-next-line no-fallthrough
      default: {
        const err = game.act(name, ...args);
        if (err) toast(err);
        else if (name === 'hire') ui.expandedRole = null;
      }
    }
    render(true);
  }

  // ---------- top bar ----------
  function renderTop(s) {
    const r = playerRealm(s);
    const L = r.ledger ?? { net: 0 };
    $('.realm-badge').innerHTML = `${dot(r.color)}<span>${esc(r.name)}</span>`;
    $('.top-stats').innerHTML = [
      ['Gold', `${gold(r.treasury)} <small class="${L.net >= 0 ? 'pos' : 'neg'}">${signed(L.net)}/mo</small>`, 'Treasury and monthly balance'],
      ['People', popFmt(totalPop(s, r.id)), 'Total population'],
      ['Legitimacy', Math.round(r.legitimacy), 'Low legitimacy raises unrest everywhere'],
      ['Prestige', Math.round(r.prestige), 'Earned by victories, innovations and festivals'],
      ['Army', `${r.regiments} <small>regts</small>`, 'Regiments under arms'],
    ].map(([k, v, t]) => `<div class="stat" title="${t}"><span>${k}</span><b>${v}</b></div>`).join('');
    $('.date').textContent = dateOf(s.month);
    root.querySelectorAll('.speed button').forEach((b) => {
      const a = b.dataset.act;
      const v = JSON.parse(b.dataset.args)[0];
      b.classList.toggle('on', a === 'pause' ? game.paused : !game.paused && game.speed === v);
    });
    root.querySelectorAll('.mapmodes button').forEach((b) => b.classList.toggle('on', JSON.parse(b.dataset.args)[0] === ui.mapMode));
    root.querySelectorAll('.tabs button').forEach((b) => {
      const k = JSON.parse(b.dataset.args)[0];
      b.classList.toggle('on', k === ui.tab);
      if (k === 'advisor') {
        const urgent = advice(s).filter((a) => a.level === 'urgent').length;
        b.innerHTML = `Advisor${urgent ? ` <i class="badge">${urgent}</i>` : ''}`;
      }
    });
  }

  function renderLog(s) {
    const key = `${s.log.length}|${s.log[0]?.m}|${s.log[0]?.text}`;
    if (key === ui.lastLogKey) return;
    ui.lastLogKey = key;
    $('.log').innerHTML = s.log.slice(0, 40).map((l) => `<div class="entry ${l.kind}"><time>${dateOf(l.m)}</time>${esc(l.text)}</div>`).join('');
  }

  // ---------- tabs ----------
  function advisorTab(s) {
    const r = playerRealm(s);
    const ps = provincesOf(s, r.id);
    const avg = (f) => (ps.length ? sum(ps, f) / ps.length : 0);
    const items = advice(s);
    const ruler = charOf(s, r.rulerId);
    return `
      <div class="hello">
        <p>${ruler ? `<b>${esc(fullName(ruler))}</b>, ruler of ${esc(r.name)}.` : ''} Your advisor watches the realm and suggests what to do next. Each card has a one-click fix.</p>
      </div>
      <div class="kpis">
        ${kpi('Income', `${signed(r.ledger?.net ?? 0)}`, 'gold / month')}
        ${kpi('Output', gold(r.ledger?.gdp ?? 0), 'value / month')}
        ${kpi('Prosperity', `${Math.round(avg((p) => p.prosperity))}%`, 'average')}
        ${kpi('Unrest', `${Math.round(avg((p) => p.unrest))}%`, 'average')}
      </div>
      <h3>What needs your attention</h3>
      <div class="cards">${items.map((a) => `
        <div class="card ${a.level}">
          <div class="card-title">${esc(a.title)}</div>
          <p>${esc(a.text)}</p>
          ${a.action ? btn(a.action.act, a.action.args, esc(a.action.label), { cls: 'primary' }) : ''}
        </div>`).join('')}
      </div>
      <h3>Let your court handle it</h3>
      <p class="muted">Delegate the busywork. You can switch these off at any time.</p>
      ${autoToggles(r)}`;
  }

  const kpi = (label, value, sub) => `<div class="kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;

  function autoToggles(r) {
    const rows = [
      ['autoBuild', 'Steward builds', 'Spends spare gold on the most profitable buildings (keeps a 300 gold reserve).'],
      ['autoResearch', 'Scholars choose research', 'Picks the cheapest available innovation.'],
      ['autoArmy', 'Marshal manages the army', 'Recruits up to a sensible army size, more in wartime.'],
    ];
    return `<div class="toggles">${rows.map(([k, name, desc]) => `
      <label class="toggle"><input type="checkbox" data-act="toggleAuto" data-args='["${k}"]' ${r[k] ? 'checked' : ''}><span><b>${name}</b><small>${desc}</small></span></label>`).join('')}</div>`;
  }

  function provinceTab(s) {
    if (ui.selected == null) return '<p class="muted">Click a province on the map to inspect it.</p>';
    const p = s.provinces[ui.selected];
    const owner = s.realms[p.owner];
    const mine = p.owner === s.playerId;
    const lab = labor(p);
    const T = TERRAIN[p.terrain];
    const m = realmMods(s, owner);
    const levels = realmLevels(s, owner.id);
    const canBuild = mine && p.occupiedBy == null && activeConstruction(s, owner.id) < maxConstruction(s, owner);
    const out = p.stats?.output ?? {};
    const rows = Object.entries(BUILDINGS).map(([type, B]) => {
      const L = p.buildings[type] ?? 0;
      const cost = buildingCost(s, owner, type, m, p, levels);
      const val = expectedValue(s, owner, p, type, m);
      const suit = B.terrainKey ? T.mods[B.terrainKey] : null;
      const queued = p.construction.filter((c) => c.type === type).length;
      const atMax = B.max && L + queued >= B.max;
      const needsWorkers = B.jobs !== 0 && lab.spare < JOBS_PER_LEVEL * 0.5;
      const why = !mine ? '' : p.occupiedBy != null ? 'Occupied' : atMax ? `Max ${B.max}` : needsWorkers ? 'No free workers' : !canBuild ? 'Builders busy' : owner.treasury < cost ? 'Not enough gold' : '';
      const produces = Object.entries(B.outputs).map(([g, q]) => `${GOODS[g].icon}${q}`).join(' ');
      const uses = Object.entries(B.inputs).map(([g, q]) => `${GOODS[g].icon}${q}`).join(' ');
      return `<tr>
        <td><b>${B.name}</b>${L ? ` <span class="lvl">×${L}</span>` : ''}${queued ? ` <span class="muted">(+${queued} building)</span>` : ''}
          <div class="muted small">${B.desc ? esc(B.desc) : `${produces}${uses ? ` from ${uses}` : ''} per level${suit != null ? ` · terrain ×${suit}` : ''}`}</div></td>
        <td class="num ${val > 0 ? 'pos' : 'neg'}" title="Estimated value added per level per month at current prices">${val ? signed(val) : '—'}</td>
        <td>${mine ? btn('build', [p.id, type], `${gold(cost)}g`, { disabled: !!why, title: why || `Build a ${B.name}`, cls: 'small' }) : ''}</td>
      </tr>`;
    }).join('');
    return `
      <div class="prov-head" style="--c:${owner.color}">
        <h2>${esc(p.name)}${p.isCapital ? ' <span title="Capital">★</span>' : ''}</h2>
        <div>${dot(owner.color)}${esc(owner.name)} · ${T.name}${p.occupiedBy != null ? ` · <span class="neg">occupied by ${esc(s.realms[p.occupiedBy].short)}</span>` : ''}</div>
      </div>
      <div class="kpis">
        ${kpi('Population', popFmt(p.pop), `${popFmt(lab.workforce)} workers`)}
        ${kpi('Prosperity', `${Math.round(p.prosperity)}%`, 'needs met')}
        ${kpi('Unrest', `${Math.round(p.unrest)}%`, p.unrest > 75 ? 'revolt risk!' : p.unrest > 50 ? 'restless' : 'calm')}
      </div>
      <div class="labor">
        <div class="row"><span>Jobs filled</span><span>${popFmt(Math.min(lab.jobs, lab.workforce))} of ${popFmt(lab.jobs)} · <b>${popFmt(Math.max(0, lab.spare))}</b> free workers</span></div>
        ${bar(lab.workforce ? lab.jobs / lab.workforce : 0, lab.spare < 0 ? 'neg' : '')}
        <div class="muted small">Workers without jobs farm for themselves (no taxes). Each building level employs ${JOBS_PER_LEVEL}k workers.</div>
      </div>
      <div class="muted small">Monthly output: ${Object.entries(out).filter(([, v]) => v > 0.05).map(([g, v]) => `${GOODS[g].icon} ${v.toFixed(1)} ${GOODS[g].name.toLowerCase()}`).join(' · ') || 'none'}</div>
      ${p.construction.length ? `<h3>Under construction</h3>${p.construction.map((c, i) => `
        <div class="row cons"><span>${BUILDINGS[c.type].name}</span>${bar(1 - c.left / c.total)}<span class="muted">${c.left} mo</span>${mine ? btn('cancelBuild', [p.id, i], '✕', { cls: 'small ghost', title: 'Cancel (50% refund)' }) : ''}</div>`).join('')}` : ''}
      <h3>Buildings</h3>
      <table class="tbl"><thead><tr><th>Type</th><th class="num">Value/mo</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${mine ? `<p class="muted small">Builders busy: ${activeConstruction(s, owner.id)} / ${maxConstruction(s, owner)}. A better Steward and more provinces add builders.</p>` : ''}`;
  }

  function charCard(s, c, label) {
    if (!c) return `<div class="char empty"><span class="muted">${label}: none</span></div>`;
    return `<div class="char">
      <div class="char-name"><span class="muted">${label}</span> <b>${esc(fullName(c))}</b> <span class="muted">age ${ageOf(s, c)}</span></div>
      <div class="skills">${Object.entries(SKILLS).map(([k, n]) => `<span title="${n}">${n.slice(0, 3)} <b>${stat(c, k)}</b></span>`).join('')}</div>
      <div class="traits">${c.traits.map((t) => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}</span>`).join('')}</div>
    </div>`;
  }

  function realmTab(s) {
    const r = playerRealm(s);
    const ruler = charOf(s, r.rulerId);
    const heir = charOf(s, r.heirId);
    const council = Object.entries(ROLES).map(([role, R]) => {
      const c = charOf(s, r.council[role]);
      let cands = '';
      if (ui.expandedRole === role) {
        const list = (r.candidates?.[role]?.ids ?? []).map((id) => s.characters[id]).filter(Boolean);
        cands = `<div class="cands">${list.map((k) => `
          <div class="cand"><span><b>${esc(k.name)} ${esc(k.dynasty)}</b> · ${SKILLS[R.skill]} <b>${stat(k, R.skill)}</b> · ${k.traits.map((t) => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}</span>`).join('')}</span>
          ${btn('hire', [role, k.id], `Hire ${hireCost(k, role)}g`, { cls: 'small', disabled: r.treasury < hireCost(k, role) })}</div>`).join('')}</div>`;
      }
      return `<div class="seat">
        <div class="row"><b>${R.name}</b><span class="muted small">${R.desc} · uses ${SKILLS[R.skill]}</span></div>
        ${c ? `<div class="row"><span>${esc(fullName(c))} — ${SKILLS[R.skill]} <b>${stat(c, R.skill)}</b> ${c.traits.map((t) => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}</span>`).join('')}</span></div>` : '<div class="muted">Vacant</div>'}
        ${btn('showRole', [role], ui.expandedRole === role ? 'Close' : c ? 'Replace…' : 'Appoint…', { cls: 'small ghost' })}
        ${cands}
      </div>`;
    }).join('');
    const ranks = rankings(s);
    return `
      <h2>${dot(r.color)}${esc(r.name)}</h2>
      ${charCard(s, ruler, 'Ruler')}
      ${charCard(s, heir, 'Heir')}
      <div class="kpis">
        ${kpi('Legitimacy', Math.round(r.legitimacy), 'drops on bad successions')}
        ${kpi('Prestige', Math.round(r.prestige), 'adds to score')}
        ${kpi('Overextension', Math.round(overextension(s, r.id)), 'extra unrest')}
      </div>
      <h3>Taxes</h3>
      <div class="seg">${Object.entries(TAX_LEVELS).map(([k, T]) => btn('setTax', [k], `<b>${T.name}</b><small>${Math.round(T.rate * 100)}% · ${T.unrest > 0 ? '+' : ''}${T.unrest} unrest</small>`, { cls: r.taxLevel === k ? 'on' : '', title: T.desc })).join('')}</div>
      <h3>Council</h3>
      ${council}
      <h3>Delegation</h3>
      ${autoToggles(r)}
      <h3>Standings</h3>
      <table class="tbl"><tbody>${ranks.map((x, i) => `<tr class="${x.id === s.playerId ? 'me' : ''}"><td>#${i + 1}</td><td>${dot(x.color)}${esc(x.name)}${x.alive ? '' : ' <span class="muted">(fallen)</span>'}</td><td class="num">${gold(x.score)}</td></tr>`).join('')}</tbody></table>
      <p class="muted small">The age ends in January 1900. Score counts output, land, people, innovations, army and prestige.</p>`;
  }

  function sparkline(hist, key) {
    if (hist.length < 2) return '';
    const vals = hist.map((h) => h[key]);
    const lo = Math.min(...vals, 0);
    const hi = Math.max(...vals, 1);
    const w = 300;
    const h = 50;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo)) * h).toFixed(1)}`).join(' ');
    const zero = h - ((0 - lo) / (hi - lo)) * h;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" x2="${w}" y1="${zero}" y2="${zero}" class="zero"/><polyline points="${pts}"/></svg>`;
  }

  function economyTab(s) {
    const r = playerRealm(s);
    const L = r.ledger ?? { income: {}, expenses: {}, gdp: 0, net: 0, taxEff: 1 };
    const mk = r.market;
    const line = (k, v, cls = '') => `<div class="row"><span>${k}</span><span class="${cls}">${signed(v)}</span></div>`;
    const goods = GOOD_KEYS.map((g) => {
      const G = GOODS[g];
      const ratio = mk.price[g] / G.base;
      const trade = mk.imports[g] - mk.exports[g];
      return `<tr>
        <td>${G.icon} ${G.name}</td>
        <td class="num ${ratio > 1.3 ? 'neg' : ratio < 0.7 ? 'muted' : ''}" title="Base price ${G.base}">${mk.price[g].toFixed(1)} <small>${pct(ratio)}</small></td>
        <td class="num">${mk.supply[g].toFixed(0)}</td>
        <td class="num">${mk.demand[g].toFixed(0)}</td>
        <td class="num ${trade > 0.5 ? 'neg' : trade < -0.5 ? 'pos' : 'muted'}" title="Positive = imports, negative = exports">${Math.abs(trade) < 0.5 ? '—' : `${trade > 0 ? '+' : '−'}${Math.abs(trade).toFixed(0)}`}</td>
        <td>${bar(mk.fill[g], mk.fill[g] < 0.8 ? 'neg' : '')}</td>
      </tr>`;
    }).join('');
    const cons = provincesOf(s, r.id).flatMap((p) => p.construction.map((c) => ({ p, c })));
    return `
      <div class="kpis">
        ${kpi('Treasury', gold(r.treasury), 'gold')}
        ${kpi('Balance', signed(L.net), 'per month')}
        ${kpi('Output', gold(L.gdp), 'per month')}
      </div>
      <div class="two">
        <div><h3>Income</h3>
          ${line(`Taxes (${TAX_LEVELS[r.taxLevel].name}, ${pct(L.taxEff ?? 1)} efficient)`, L.income.taxes ?? 0, 'pos')}
          ${line(`Trade tariffs (${pct(tradeEfficiency(s, r))} trade efficiency)`, L.income.trade ?? 0, 'pos')}
        </div>
        <div><h3>Expenses</h3>
          ${line(`Army (${r.regiments} regiments)`, -(L.expenses.army ?? 0), 'neg')}
          ${line('Council salaries', -(L.expenses.council ?? 0), 'neg')}
          ${line('Court & administration', -(L.expenses.court ?? 0), 'neg')}
          ${L.expenses.interest ? line('Interest on debt', -L.expenses.interest, 'neg') : ''}
        </div>
      </div>
      ${r.history.length > 1 ? `<h3>Treasury, last ${r.history.length} months</h3>${sparkline(r.history, 't')}` : ''}
      <h3>National market</h3>
      <p class="muted small">High prices mean shortages: building producers of scarce goods is the surest way to grow. Trade pacts let you import what you lack.</p>
      <table class="tbl market"><thead><tr><th>Good</th><th class="num">Price</th><th class="num">Made</th><th class="num">Wanted</th><th class="num">Trade</th><th>Needs met</th></tr></thead><tbody>${goods}</tbody></table>
      <h3>Construction (${activeConstruction(s, r.id)} / ${maxConstruction(s, r)} builders)</h3>
      ${cons.length ? cons.map(({ p, c }) => `<div class="row cons"><a href="#" data-act="select" data-args="[${p.id}]">${esc(p.name)}</a><span>${BUILDINGS[c.type].name}</span>${bar(1 - c.left / c.total)}<span class="muted">${c.left} mo</span></div>`).join('') : '<p class="muted">Nothing under construction. Open a province or follow the Advisor.</p>'}`;
  }

  function militaryTab(s) {
    const r = playerRealm(s);
    const mine = armyStrength(s, r);
    const wars = warsOf(s, r.id);
    const others = s.realms.filter((o) => o.alive && o.id !== r.id).sort((a, b) => armyStrength(s, b) - armyStrength(s, a));
    const top = Math.max(mine, ...others.map((o) => armyStrength(s, o)), 1);
    const warCards = wars.map((w) => {
      const side = w.attackers.includes(r.id) ? 1 : -1;
      const sc = w.score * side;
      const enemies = (side === 1 ? w.defenders : w.attackers).map((id) => s.realms[id]);
      const friends = (side === 1 ? w.attackers : w.defenders).map((id) => s.realms[id]);
      const offer = (terms, label) => {
        const a = peaceAcceptance(s, r.id, w, terms);
        return btn('offerPeace', [w.id, terms], label, { cls: `small ${a.ok ? 'primary' : ''}`, title: a.why, disabled: !a.ok });
      };
      return `<div class="war">
        <div class="row"><b>${esc(w.name)}</b><span class="muted">${w.months} months</span></div>
        <div class="muted small">${friends.map((f) => dot(f.color) + esc(f.short)).join(' ')} vs ${enemies.map((f) => dot(f.color) + esc(f.short)).join(' ')}</div>
        <div class="score"><span class="neg">−100</span><span class="track"><span class="mark" style="left:${(sc + 100) / 2}%"></span></span><span class="pos">+100</span></div>
        <div class="row"><span>War score <b class="${sc >= 0 ? 'pos' : 'neg'}">${sc > 0 ? '+' : ''}${sc}</b></span><span class="muted small">Battles won and land occupied</span></div>
        <div class="actions">${offer('demand', 'Demand occupied land')}${offer('white', 'White peace')}${offer('concede', 'Concede')}</div>
      </div>`;
    }).join('');
    return `
      <div class="kpis">
        ${kpi('Regiments', r.regiments, `${gold(r.regiments * REGIMENT_UPKEEP)} gold/mo upkeep`)}
        ${kpi('Manpower', Math.floor(r.manpower), 'recruits available')}
        ${kpi('Strength', Math.round(mine), 'with leaders & equipment')}
      </div>
      <div class="actions">
        ${btn('recruit', [1], `Recruit 1 (${REGIMENT_COST}g)`, { disabled: r.manpower < 1 || r.treasury < REGIMENT_COST })}
        ${btn('recruit', [5], `Recruit 5 (${REGIMENT_COST * 5}g)`, { disabled: r.manpower < 1 || r.treasury < REGIMENT_COST })}
        ${btn('disband', [1], 'Disband 1', { cls: 'ghost', disabled: r.regiments < 1 })}
      </div>
      <p class="muted small">Strength grows with your Marshal's and ruler's Martial skill, military innovations, and having iron and tools to equip troops. Armies cost 50% more upkeep in wartime.</p>
      <h3>War stance</h3>
      <div class="seg">${Object.entries(STANCES).map(([k, S]) => btn('setStance', [k], `<b>${S.name}</b><small>${S.desc}</small>`, { cls: r.stance === k ? 'on' : '' })).join('')}</div>
      <h3>Wars</h3>
      ${warCards || '<p class="muted">You are at peace.</p>'}
      <h3>Balance of power</h3>
      <div class="power">${[r, ...others].map((o) => `<div class="row"><span>${dot(o.color)}${esc(o.short)}${o.id === r.id ? ' (you)' : ''}</span>${bar(armyStrength(s, o) / top)}<span class="num">${Math.round(armyStrength(s, o))}</span></div>`).join('')}</div>`;
  }

  function diplomacyTab(s) {
    const r = playerRealm(s);
    const cards = s.realms.filter((o) => o.alive && o.id !== r.id).map((o) => {
      const rel = getRelation(s, r.id, o.id);
      const pact = getPact(s, r.id, o.id);
      const war = warBetween(s, r.id, o.id);
      const truce = hasTruce(s, r.id, o.id);
      const ruler = charOf(s, o.rulerId);
      const tags = [
        war ? '<span class="tag war">At war</span>' : '',
        pact.alliance ? '<span class="tag ally">Allied</span>' : '',
        pact.trade ? '<span class="tag trade">Trade pact</span>' : '',
        truce ? `<span class="tag">Truce until ${dateOf(s.truces[relKey(r.id, o.id)])}</span>` : '',
      ].join('');
      const warErr = canDeclareWar(s, r.id, o.id);
      const confirm = ui.confirmWar === o.id ? `<div class="confirm">
          <p>Declare war on <b>${esc(o.name)}</b>?${pact.alliance ? ' Breaking an alliance costs legitimacy.' : ''} Their allies (${s.realms.filter((a) => a.alive && a.id !== o.id && a.id !== r.id && getPact(s, o.id, a.id).alliance).map((a) => esc(a.short)).join(', ') || 'none'}) will join them.</p>
          ${btn('declareWar', [o.id], 'Declare war', { cls: 'danger' })}${btn('cancelWar', [], 'Cancel', { cls: 'ghost' })}</div>` : '';
      return `<div class="dip">
        <div class="row"><b>${dot(o.color)}${esc(o.name)}</b><span class="muted small">${provincesOf(s, o.id).length} provinces · army ${Math.round(armyStrength(s, o))}</span></div>
        <div class="muted small">Ruled by ${esc(fullName(ruler))}</div>
        <div class="row rel"><span>Relations</span><span class="relbar"><span class="${rel >= 0 ? 'pos' : 'neg'}" style="${rel >= 0 ? `left:50%;width:${rel / 2}%` : `left:${50 + rel / 2}%;width:${-rel / 2}%`}"></span></span><b class="${rel >= 0 ? 'pos' : 'neg'}">${Math.round(rel)}</b></div>
        <div class="tags">${tags}</div>
        ${war ? '' : `<div class="actions">
          ${btn('gift', [o.id], `Send gift (${GIFT_COST}g)`, { cls: 'small', disabled: r.treasury < GIFT_COST, title: 'Improves relations; a diplomatic Chancellor helps' })}
          ${pact.trade ? btn('cancelTrade', [o.id], 'End trade', { cls: 'small ghost' }) : btn('proposeTrade', [o.id], 'Trade pact', { cls: 'small', title: 'Needs relations ≥ 0. Raises trade efficiency so you can import what you lack.', disabled: rel < 0 })}
          ${pact.alliance ? btn('breakAlliance', [o.id], 'Break alliance', { cls: 'small ghost' }) : btn('proposeAlliance', [o.id], 'Alliance', { cls: 'small', title: 'Needs relations ≥ 40. Allies defend each other.', disabled: rel < 40 })}
          ${btn('confirmWar', [o.id], 'War…', { cls: 'small danger', disabled: !!warErr, title: warErr ?? 'Declare war' })}
        </div>`}
        ${confirm}
      </div>`;
    }).join('');
    return `<p class="muted">Relations drift over time: shared borders breed suspicion, pacts build trust, and sprawling empires unite their neighbours against them.</p>${cards}
      ${s.month < 36 ? '<p class="muted small">Grace period: no one can attack you before January 1823, and you cannot attack yet either.</p>' : ''}`;
  }

  function researchTab(s) {
    const r = playerRealm(s);
    const rate = researchRate(s, r);
    const t = r.researchTarget ? INNOVATIONS[r.researchTarget] : null;
    const groups = { now: [], avail: [], locked: [], done: [] };
    for (const [id, I] of Object.entries(INNOVATIONS)) {
      if (r.innovations.includes(id)) groups.done.push([id, I]);
      else if (id === r.researchTarget) groups.now.push([id, I]);
      else if (I.req.every((q) => r.innovations.includes(q))) groups.avail.push([id, I]);
      else groups.locked.push([id, I]);
    }
    const item = ([id, I], extra = '') => `<div class="inno"><div><b>${I.name}</b> <span class="muted small">${I.cost} pts</span><div class="small">${I.desc}</div>${extra}</div>`;
    return `
      <div class="kpis">
        ${kpi('Research', `${rate.toFixed(1)}`, 'points / month')}
        ${kpi('Banked', Math.floor(r.research), 'points')}
        ${kpi('Known', `${r.innovations.length}/${Object.keys(INNOVATIONS).length}`, 'innovations')}
      </div>
      ${t ? `<div class="current"><div class="row"><b>Researching ${t.name}</b><span class="muted">${Math.max(0, Math.ceil((t.cost - r.research) / rate))} months</span></div>${bar(r.research / t.cost)}</div>` : '<p class="muted">Nothing being researched.</p>'}
      <p class="muted small">Research comes from population, your ruler's Stewardship and Ateliers.</p>
      <label class="toggle inline"><input type="checkbox" data-act="toggleAuto" data-args='["autoResearch"]' ${r.autoResearch ? 'checked' : ''}><span><b>Scholars choose research</b></span></label>
      ${groups.avail.length ? `<h3>Available</h3>${groups.avail.map((x) => `${item(x)}${btn('setResearch', [x[0]], 'Research', { cls: 'small primary' })}</div>`).join('')}` : ''}
      ${groups.locked.length ? `<h3>Locked</h3>${groups.locked.map((x) => `${item(x, `<div class="muted small">Requires ${x[1].req.map((q) => INNOVATIONS[q].name).join(', ')}</div>`)}</div>`).join('')}` : ''}
      ${groups.done.length ? `<h3>Discovered</h3>${groups.done.map((x) => `${item(x)}<span class="pos">✓</span></div>`).join('')}` : ''}`;
  }

  // ---------- modals ----------
  function renderModal(s) {
    const m = $('.modal-root');
    if (s.gameOver) {
      const ranks = rankings(s);
      m.innerHTML = `<div class="modal"><div class="dialog">
        <h2>${s.gameOver.reason === 'defeat' ? 'Defeat' : s.gameOver.reason === 'victory' ? 'Victory!' : 'The End of an Age'}</h2>
        <p>${esc(s.gameOver.text)}</p>
        <table class="tbl"><tbody>${ranks.map((x, i) => `<tr class="${x.id === s.playerId ? 'me' : ''}"><td>#${i + 1}</td><td>${dot(x.color)}${esc(x.name)}</td><td class="num">${gold(x.score)}</td></tr>`).join('')}</tbody></table>
        <div class="actions">${btn('newGame', [], 'Play again', { cls: 'primary' })}</div></div></div>`;
      return;
    }
    if (s.pendingEvents.length) {
      const v = eventView(s, s.pendingEvents[0]);
      const key = `${s.pendingEvents[0].id}|${JSON.stringify(s.pendingEvents[0].ctx)}`;
      if (m.dataset.key === key) return;
      m.dataset.key = key;
      m.innerHTML = `<div class="modal"><div class="dialog event" role="dialog" aria-modal="true">
        <div class="eyebrow">${dateOf(s.month)}</div>
        <h2>${esc(v.title)}</h2>
        <p>${esc(v.text)}</p>
        <div class="options">${v.options.map((o, i) => btn('eventOption', [i], `<b>${esc(o.label)}</b><small>${esc(o.hint)}</small>`, { cls: 'option' })).join('')}</div>
      </div></div>`;
      return;
    }
    m.dataset.key = '';
    m.innerHTML = '';
  }

  const TAB_RENDER = { advisor: advisorTab, province: provinceTab, realm: realmTab, economy: economyTab, military: militaryTab, diplomacy: diplomacyTab, research: researchTab };

  function render(force = false) {
    const s = game.state;
    if (ui.pointerDown && !force) { ui.dirty = true; return; }
    ui.dirty = false;
    renderTop(s);
    map.update(s, ui.mapMode, ui.selected);
    renderLog(s);
    const html = TAB_RENDER[ui.tab](s);
    if (html !== body.dataset.html) {
      const top = body.scrollTop;
      body.innerHTML = html;
      body.dataset.html = html;
      body.scrollTop = top;
    }
    renderModal(s);
  }

  return { render, toast, select: (pid) => { ui.selected = pid; } };
}

