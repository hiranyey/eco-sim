// Entry point: start screen, game loop, saving and loading.
import { newGame, realmSummaries, setPlayer } from './world.js';
import { tick } from './sim.js';
import { resolveEvent } from './events.js';
import { createGameUI, esc, popFmt } from './ui.js';
import { createMap } from './map.js';
import { TRAITS } from './data.js';
import * as actions from './actions.js';

const SAVE_KEY = 'crowns-ledgers-save-v1';
const SPEED_MS = { 1: 900, 2: 400, 3: 120 };
const root = document.getElementById('app');

const PLAYER_ACTIONS = new Set(['build', 'cancelBuild', 'setTax', 'setStance', 'recruit', 'disband', 'setResearch', 'toggleAuto',
  'hire', 'dismiss', 'gift', 'proposeTrade', 'cancelTrade', 'proposeAlliance', 'breakAlliance', 'declareWar', 'offerPeace']);

const game = {
  state: null,
  ui: null,
  paused: true,
  speed: 1,
  acc: 0,
  act(name, ...args) {
    if (!PLAYER_ACTIONS.has(name)) return 'Unknown action';
    return actions[name](this.state, this.state.playerId, ...args);
  },
  resolveEvent(i) {
    resolveEvent(this.state, i);
  },
  togglePause() { this.paused = !this.paused; },
  setSpeed(n) { this.speed = n; this.paused = false; },
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      return true;
    } catch {
      return false;
    }
  },
  load() {
    let data = null;
    try { data = localStorage.getItem(SAVE_KEY); } catch { /* storage unavailable */ }
    if (!data) return false;
    try {
      startGame(JSON.parse(data));
      return true;
    } catch {
      return false;
    }
  },
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  },
  showStart() { showStart(); },
};

function startGame(state) {
  game.state = state;
  game.paused = true;
  game.speed = 1;
  game.acc = 0;
  game.ui = createGameUI(root, game);
  game.ui.render(true);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(1000, now - last);
  last = now;
  const s = game.state;
  if (s && game.ui && !game.paused && !s.pendingEvents.length && !s.gameOver) {
    game.acc += dt;
    if (game.acc >= SPEED_MS[game.speed]) {
      game.acc = 0;
      tick(s);
      if (s.month % 12 === 0) game.save();
      game.ui.render();
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener('keydown', (e) => {
  if (!game.ui || e.target.closest('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); game.togglePause(); game.ui.render(true); }
  if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { game.setSpeed(Number(e.code.slice(-1))); game.ui.render(true); }
});

// ---------- start screen ----------
function showStart(seed = Math.floor(Math.random() * 1e9).toString(36)) {
  game.ui = null;
  game.state = null;
  let preview = newGame(seed, 0);
  let chosen = 0;
  root.innerHTML = `
    <div class="start">
      <header>
        <h1>Crowns <span>&amp;</span> Ledgers</h1>
        <p class="tagline">Rule a dynasty. Grow an economy. Outlast your rivals. A grand strategy game you can play with one hand on your coffee.</p>
      </header>
      <div class="start-grid">
        <div class="start-map">
          <svg class="map" role="img" aria-label="Preview of the continent"></svg>
          <div class="seed-row">
            <label>World seed <input class="seed" value="${esc(seed)}" maxlength="24"></label>
            <button data-start="reroll">New world</button>
          </div>
        </div>
        <div class="start-side">
          <h2>Choose your realm</h2>
          <div class="realm-list"></div>
          <button class="primary big" data-start="begin">Take the throne</button>
          ${game.hasSave() ? '<button class="ghost" data-start="continue">Continue saved game</button>' : ''}
          <details class="howto" open>
            <summary>How to play</summary>
            <ul>
              <li><b>Time</b> flows month by month. Pause with <kbd>Space</kbd>, change speed with <kbd>1</kbd>–<kbd>3</kbd>.</li>
              <li><b>The Advisor tab</b> lists what needs attention, each with a one-click fix. Follow it and you will do fine.</li>
              <li><b>Economy:</b> every province has workers. Put them in buildings that make goods your market is short of: high prices show where.</li>
              <li><b>Court:</b> rulers age and die. Appoint a strong council and hope for a capable heir.</li>
              <li><b>War:</b> pick a stance and let your marshal fight. Occupy land, then demand it at the peace table.</li>
              <li><b>Delegate</b> building, research and recruiting to your court whenever you like.</li>
              <li>The age ends in <b>1900</b>. Highest score wins.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>`;
  const svg = root.querySelector('.map');
  let map;
  const draw = () => {
    map = createMap(svg, preview, (pid) => { chosen = preview.provinces[pid].owner; refresh(); });
    refresh();
  };
  const refresh = () => {
    map.update(preview, 'realm', preview.provinces.find((p) => p.owner === chosen && p.isCapital)?.id ?? null);
    root.querySelector('.realm-list').innerHTML = realmSummaries(preview).map((r) => `
      <button class="realm-card ${r.id === chosen ? 'on' : ''}" data-realm="${r.id}" style="--c:${r.color}">
        <span class="row"><b><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</b><span class="muted">${r.provinces} provinces</span></span>
        <span class="muted small">${popFmt(r.pop)} people · mostly ${esc(r.terrain)}</span>
        <span class="small">Ruler: ${esc(r.ruler.name)} ${esc(r.ruler.dynasty)}, ${r.ruler.traits.map((t) => TRAITS[t].name).join(', ')}</span>
      </button>`).join('');
  };
  draw();
  root.querySelector('.start').addEventListener('click', (e) => {
    const card = e.target.closest('[data-realm]');
    if (card) { chosen = Number(card.dataset.realm); refresh(); return; }
    const b = e.target.closest('[data-start]');
    if (!b) return;
    if (b.dataset.start === 'reroll') {
      const seedNew = Math.floor(Math.random() * 1e9).toString(36);
      root.querySelector('.seed').value = seedNew;
      preview = newGame(seedNew, 0);
      chosen = 0;
      draw();
    } else if (b.dataset.start === 'begin') {
      setPlayer(preview, chosen);
      startGame(preview);
    } else if (b.dataset.start === 'continue') {
      game.load();
    }
  });
  root.querySelector('.seed').addEventListener('change', (e) => {
    preview = newGame(e.target.value.trim() || 'crowns', 0);
    chosen = 0;
    draw();
  });
}

showStart();

// Exposed for debugging and automated tests.
window.__game = game;
