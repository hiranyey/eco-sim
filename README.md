# Hexmarch

A quick, tactical strategy game for the browser. Four rival houses fight over a borderland of hexes. Each
house has armies you move by hand, a market shared by all four, and a ruler who fights on the field and
can die.

A game takes about 20–35 turns, roughly 30–45 minutes.

```sh
npm start      # http://localhost:8080
npm test       # engine tests (Node 20+)
```

No dependencies, no build step and no image files: all the art is drawn in code. Any static file server works; the files just need to be served over
HTTP, not opened from disk.

## How it plays

- **Win by renown.** The first house to **75 renown** wins, or the last house standing. If nobody gets there by turn 60, the most renowned house wins.
  - Claim free towns (+2), seize rival towns (+4) and capitals (+8).
  - Hold one of the three shrines ✦ on contested ground (+1 every turn).
  - Win battles (+1, +4 for killing a ruler).
  - Grow towns to level 3 (+2), and raise a cathedral (+4, then +1 every turn).
  - Master a tier-4 tech (+4).
- **Every fight is predictable.** Hover an enemy to see exactly how much damage you deal and take. Forests and hills slow you down but protect you. Moving next to an enemy stops you (zone of control). Melee winners advance into the hex they cleared.
- **Six unit types plus your ruler:**
  - Militia are cheap.
  - Spearmen counter cavalry.
  - Archers shoot from range and can't be struck back by melee.
  - Cavalry can hit and run.
  - Knights hit hard.
  - Catapults are siege weapons that do double damage to troops in towns.
  - Your ruler inspires adjacent troops.
  - Three kills make any unit a veteran.
- **The economy is lean.** Towns produce gold, and the hexes around them produce grain, timber and iron. Every soldier eats grain each turn. Buy and sell on a market whose prices move with every house's trades.
- **Research and policies.** Towns produce lore (📜): 1 per town level, +1 at the capital, +2 with a Library. Spend it on three ladders of four techs each: **Warfare** (Drill Yards, Longbows, Stirrups, Trebuchets), **Economy** (Crop Rotation, Coinage, Guilds, Architecture) and **Statecraft** (Code of Laws, Primogeniture, Bureaucracy, Divine Right). A game is long enough for only about half of them. Techs unlock **policies** such as Tithes, Conscription, Warrior Code, Free Trade and Bastion Towns. Most have a downside. You start with one policy slot, and Code of Laws and Bureaucracy add more.
- **Dynasties matter.** Every king, queen, prince and princess has a gender, a matching name, a generated portrait and two traits. Rulers age a year each turn, and die. Educate your heir through events. A ruler slain in battle can set your towns revolting, and dying without an heir is worse.
- **Diplomacy runs on opinion.** Every house has an opinion of every other, from −100 to +100, and the Diplomacy tab lists each reason: wars, treaties, shared enemies, touching borders, envy of the leader, fear of a big army, and remembered deeds (gifts, betrayals, abandoned allies) that fade over time.
  - **The negotiation table:** offer or ask for gold, towns and techs, and put treaties on the table:
    - a non-aggression pact
    - a trade agreement that pays both sides every turn
    - an alliance (allies defend each other and may cross each other's land)
    - a royal marriage for your heir
    - fealty (they become your vassal)
    - joining your war

    You see exactly how the other house weighs every term before you propose.
  - **Oaths bind:** breaking a pact or alliance costs renown, and every court remembers. Refusing an ally's call to arms ends the alliance.
  - **Vassals:** they pay a quarter of their gold as tribute, follow you to war, give +1 renown a turn, and count as conquered for a conquest victory. A vassal that grows strong enough may rebel.
  - **The AI plays the same game:** computer houses sign pacts and trade deals, marry and ally with each other, and force crushed rivals to kneel. Their envoys bring you offers, demands for tribute and calls to arms. They still declare war when they smell weakness, and they still gang up on the leader.
- **Each house plays differently:**
  - Varr has cheap iron troops.
  - Selene has trade bonuses.
  - Thorne has strong archers and forest defence.
  - Ashkar has fast cavalry.

- **Fog of war** (switch it off on the start screen if you prefer):
  - **Sight:** you only see what your troops and towns can see. Most units see 2 hexes, cavalry 3, and a unit on a hill sees 1 more. Towns watch 2 hexes around them, and capitals 3.
  - **Forest cover:** troops in forest show only to someone standing next to them.
  - **Memory:** explored land stays on the map, dimmed, and towns there show their last-known owner.
  - **Ambushes:** a march that runs into hidden enemies halts where they are found. It can't be undone, but the unit can still attack.
  - **Shared sight:** allies and vassals share what they see.
  - **The AI:** computer houses are not limited by fog.

**Map:** the board fills its whole area and opens fitted to the land you have explored (the whole map without fog of war), growing with it each turn. Zoom with the mouse wheel, pinch or the `+`/`−` buttons, drag to pan, and press the fit button or `0` to return to your lands.

**Quality of life:** Undo move (`U`), Danger zones that show every hex enemies can strike next turn (`D`), Next unit (`N`), a "While you waited" report after each enemy turn, an early-goals checklist, autosave, three difficulty levels, three enemy-turn speeds, and synthesized sound effects.

## Code

```
index.html, hexmarch.css    page and styling
js/data.js                  all tunable numbers: units, buildings, traits, houses, win conditions
js/hex.js                   hex-grid maths
js/world.js                 procedural map and initial state
js/rules.js                 movement, combat, economy, market, war and peace, succession, turn flow
js/diplomacy.js             opinions and memories, treaties, vassals, negotiated deals, calls to arms
js/fog.js                   fog of war: sight, forest cover, explored land, remembered towns
js/events.js                court events, envoys and calls to arms
js/ai.js                    AI opponents (a generator that yields one visible action at a time)
js/board.js                 SVG board rendering and animation
js/art/painter.js           procedural terrain painter: blended biomes, hill shading, coasts, forests, farmland, roads
js/art/sprites.js           faction crests, unit emblems, towns, shrines (SVG)
js/art/icons.js             interface icon set
js/art/portrait.js          procedural ruler and heir portraits
js/art/vignettes.js         woodcut illustrations for court events
js/main.js                  UI controller: input, panels, modals, turn flow, saving
js/audio.js                 Web Audio sound effects
tests/hexmarch.test.mjs     determinism, combat preview == result, full AI games, invariants
tests/diplomacy.test.mjs    opinions, deals, oaths, alliances, vassals, save migration
tests/fog.test.mjs          sight, memory, forest cover, ambushes, shared sight
```

The engine is plain JSON state with a seeded RNG, so it runs headless in Node. The tests play complete
four-AI games and check invariants: no two units sharing a hex, no negative resources, and every game
reaching a winner.

## Also in this repo

`classic/` holds **Crowns & Ledgers**, the earlier real-time grand-strategy and economy simulation. It is
still playable at `/classic/`.
