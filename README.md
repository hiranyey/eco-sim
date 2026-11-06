# Crowns & Ledgers

A streamlined grand-strategy game for the browser. It borrows the *kind* of play found in
dynasty-and-economy strategy games (rulers who age and die, a market economy, diplomacy and war)
but is built to be **easy to control**. You can play it with one hand on your coffee.

## Play

No build step and no dependencies.

```sh
npm start          # serves the game at http://localhost:8080
npm test           # runs the simulation test suite (Node 20+)
```

Any static file server works too (`python3 -m http.server`). ES modules need to be served over
HTTP, so opening `index.html` straight from disk won't work.

## What makes it easier to control

| Instead of… | You get… |
| --- | --- |
| Dozens of alerts and hidden numbers | **The Advisor tab**: a prioritised to-do list where every item has a one-click fix ("Food shortage → Build Farm in Galardor") |
| Micromanaging every building | **Delegation toggles**: let your Steward build, your scholars research and your Marshal recruit. Switch any of them off at any time |
| Moving armies tile by tile | **War stances** (Defensive / Balanced / Aggressive). Battles and occupation resolve themselves, and you negotiate peace from a score bar |
| Complex pop and policy screens | **Three tax levels**, **three council seats**, and one national market table where high prices show what to build |
| Events with hidden outcomes | **Every event option states its exact effect** before you choose |

## Systems

- **Map**: a procedurally generated hex continent with 50–80 provinces in five terrains, split among five realms. Pick a seed to replay a world.
- **Economy**: 6 goods (grain, timber, iron, cloth, tools, luxuries) and 8 buildings, some of which turn inputs into outputs. Each realm has its own market: prices move with supply and demand, and surpluses and shortfalls trade through a world market. Trade pacts make that trade more efficient. Workers without jobs farm for themselves. Labour is the real constraint, and population grows when people's needs are met.
- **Characters**: rulers, heirs and council members have skills (Diplomacy, Martial, Stewardship) and traits. Rulers age and die. A missing or child heir hurts legitimacy.
- **Diplomacy**: relations drift over time. Shared borders breed suspicion, pacts build trust, and sprawling empires push their neighbours into alliances against them.
- **War**: army strength comes from regiments, leaders, innovations and equipment (iron and tools). Battles win war score and occupy provinces, and occupied land can be demanded at the peace table. Truces last 5 years after peace.
- **Innovations**: 14 technologies in a small dependency tree.
- **Events**: about 14 narrative events plus revolts and peace offers.
- **Endgame**: the age ends in January 1900 and the highest score wins. Losing every province ends the game early.

Saving uses `localStorage`. The game also autosaves every January.

## Code layout

```
index.html, css/style.css   page shell and styling
src/data.js                 goods, terrain, buildings, traits, innovations (tune balance here)
src/core.js                 shared helpers and constants
src/world.js                procedural world generation
src/economy.js              production, markets, trade, finances
src/war.js                  armies, battles, occupation, peace
src/events.js               narrative events
src/ai.js                   AI rulers and the player's automation
src/advice.js               the Advisor's recommendations
src/sim.js                  the monthly tick
src/actions.js              every action a ruler can take
src/ui.js, src/map.js       rendering
src/main.js                 start screen, game loop, save and load
tests/sim.test.mjs          determinism, 80-year stability runs, actions, war
```

The simulation is plain JSON state plus pure-ish functions with a seeded RNG, so it runs headless in
Node and saves by `JSON.stringify`.
