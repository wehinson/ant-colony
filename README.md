# Ant Colony

A complete, local, single-player colony game. Excavate the nest, grow the workforce, survive real raids, and carry permanent improvements into the next colony.

## Play

GitHub source: https://github.com/wehinson/ant-colony. GitHub Pages setup and save-transfer steps are in [hosting instructions](docs/hosting.md).

For the built game at the GitHub Pages project path, run `npm run test:serve` and open **http://localhost:5174/ant-colony/**.

Use Node.js 22 or later. No package installation is needed.

```sh
npm run dev
```

Open **http://localhost:5173** and select **Begin your colony**. The queen digs her first chamber and hatches a free worker. Assign a digger after another worker hatches, then place Food Storage beside the chamber.

The game has no account, server database, external assets, or runtime dependencies. All graphics are drawn locally. It saves on this browser and has save export/import in Settings. Time stops when the game is hidden or closed; there is no offline progress.

## Controls

| Control                                         | Action                                            |
| ----------------------------------------------- | ------------------------------------------------- |
| Right-click dirt                                | Add or cancel an excavation order                 |
| Right-drag                                      | Designate multiple tiles                          |
| Select a chamber or defense, then click         | Place its blueprint                               |
| Click a structure                               | Inspect, upgrade, repair, or cancel its blueprint |
| Left-drag with Inspect selected, or middle-drag | Pan the map                                       |
| Mouse wheel / + / −                             | Zoom                                              |
| Arrow keys                                      | Pan                                               |
| Space                                           | Pause or resume the entire simulation             |
| 1 / 2 / 4                                       | Simulation speed                                  |
| D / R / Escape                                  | Dig tool / rally tool / inspect tool              |
| Q / T                                           | Center the queen / active threat                  |
| G                                               | Toggle grid                                       |

On a touch screen, use the Dig tool to designate tiles. The map controls provide zoom, rally, queen, and threat controls.

## Complete game loop

- The queen digs only during founding. Her chamber provides a brood slot, and her first egg is free.
- Food is delivered by returning foragers. Full storage pauses departures and keeps excess cargo on returning ants.
- The six economic chambers unlock in order: Queen, Storage, Brood, Waste, Prey, and Quarters. Their upgrades are repeatable.
- Blueprints reserve resources and queue their buried footprint. They never create a hidden connecting tunnel. Canceling refunds resources; refunds that cannot fit remain reserved until space is available.
- Dig jobs use the oldest reachable unclaimed designation. Multiple diggers work on separate tiles. Digging, repairs, and mechanical defenses use shared energy.
- Warriors are existing workers, not a separate source of population. Barracks add mobile capacity. Staffed posts commit living warriors outside that capacity.
- Guard, ranged, surface, spray, snare, damage-trap, and barricade defenses use health, range, line of sight, and cooldowns. Posts can be upgraded in place.
- A central controller assigns mobile groups and keeps a queen reserve. Individual warriors still need to move into range. Melee frontage is limited to four warriors per enemy.
- The initial enemy roster includes scouts, soldiers, army ants, armored beetles, hunter spiders, brood thieves, wasps, and tunnelling rivals. All ground enemies fit one grid tile. Flying enemies enter through actual openings. Only tunnellers open new approaches.
- The first raid arrives at 3:45, after a 50-second warning. Waves have 20-second breaks. Raids have 7.5-minute breaks, including the next warning. Time sets the threat budget; population and camera position do not.
- Raid plans, spawn anchors, and enemy strength are fixed at warning time. Stalling an enemy does not stop the simulation clock or future difficulty growth.
- Civilians return through real routes. Dig crews repair with food and energy, but not during incoming damage. Dead insects leave recoverable food. Prey chambers capture through a real surface route.
- Destruction removes the actual building benefit. Excavated terrain and unlocked chamber types remain. Losing a queen chamber does not kill the queen. Rebuild it at its former site before moving it through the normal relocation control.
- Queen relocation requires a prepared, connected destination and is limited to peaceful periods. A warning cancels an unfinished move. The queen walks and the raid clock continues.
- Actual queen death ends the run. Legacy seeds equal `max(1, 4 × highest completed raid + floor(sqrt(peak living worker population)))`. Committed staff count toward that peak; replacement births do not inflate it.
- Five permanent improvement branches can be purchased between colonies. A new colony resets the world and ordinary improvements and keeps legacy currency, permanent improvements, and records.

The larger enemy design pool, multiplayer, offline progress, and multiple queens are outside this release.

## A new ant with each colony

The game uses William's [ranked list of 50 ants](docs/ants-top-50.md), found in `C:\Code\mapcrush-main\docs\ants-top-50.md`. The first colony is rank 50, Anergates atratulus. Each defeat and restart unlocks the next rank. Rank 1 is the driver ant / siafu. The next restart begins a stronger cycle through the list, with no fixed number of cycles.

Select the ant card below construction to see the collection and the next ant. Each later lineage improves the colony and has an affinity for one permanent improvement branch. These are game variants: all lineages keep one queen and worker crews, including source species whose real biology differs. Lineage strength does not change raid budgets. Permanent purchases remain a separate choice between runs.

## Diagnostics and practice

Open **Save and settings → Diagnostics & practice controls** to inspect delivered food, prey, salvage, digging, population, raid budget, and time lost to bottlenecks. **Export gameplay report** saves a report with recent samples, orders, and raid plans.

**Open practice copy** makes an isolated copy of your colony. It has engine controls to step time, fill resources, add ants, unlock structures, excavate queued tiles, spawn enemies, start a warning, heal, clear attackers, or end the practice run. Practice cannot award legacy seeds or unlock another ant. **Return to real colony** restores the original state. Reloading also opens the real colony.

## Engine and interface

The engine has no DOM, Canvas, browser storage, or graphics dependency.

| File                                 | Responsibility                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/engine/engine.js`               | Commands, validation, 100 ms simulation steps, state, movement, and subsystem composition             |
| `src/engine/systems/`                | Excavation, rooms, assignment, foraging, individual combat, defenses, raids, and prestige             |
| `src/engine/world.js`                | Sparse excavated terrain, incrementally stored terrain chunks, paths, connectivity, and line of sight |
| `src/engine/catalog.js`              | Building, enemy, improvement, and timing definitions                                                  |
| `src/engine/lineages.js`             | The 50 ranked ants, restart progression, affinities, and strength                                     |
| `src/engine/save.js`                 | Save validation and migration from the earlier local format                                           |
| `src/engine/spatial.js`              | Stable spatial targeting for large combat groups                                                      |
| `src/engine/metrics.js` / `debug.js` | Bounded reports and isolated practice commands                                                        |
| `src/engine/view.js`                 | Derived player-facing values, availability, labels, alerts, and placement inspection                  |
| `src/engine/session.js`              | Host-independent pause, storage, import/export, visibility suspension, and autosave workflow          |
| `src/ui/app.js`                      | DOM display and input binding; sends commands to the session                                          |
| `src/ui/renderer.js`                 | Canvas drawing, camera controls, sprite interpolation, and visual detail limits                       |

The engine uses a fixed step and a saved pseudo-random state. Paths are cached by world revision. The group controller runs less often than individual movement. The renderer draws only visible terrain and actors, with reduced civilian detail when zoomed out. Rendering never changes production, combat, or spawns.

The session owns an independent clock with injected host timer services. The UI draws snapshots at any frame rate and interpolates between simulation steps. Delayed animation frames do not stop the engine clock. The UI does not resolve game rules or change simulation state directly.

### Use the engine without graphics

```js
import { ColonyEngine } from "./src/engine/engine.js";

const game = new ColonyEngine({ seed: 23 });
game.command({ type: "start" });
game.advance(120, { exact: true });
game.command({ type: "assign", crew: "dig", delta: 1 });
game.command({ type: "build", building: "storage", x: 2, y: 3 });

const restored = ColonyEngine.deserialize(game.serialize());
console.log(restored.getStats());
```

`advance(seconds)` is the foreground frame driver. `advance(seconds, { exact: true })` advances simulation time directly for headless checks. Both respect pause. Orders can reserve resources while paused, but movement, production, digging, construction completion, upgrades, combat, and difficulty do not advance.

## Verification and build

```sh
npm test               # Engine, combat, saving, and full-loop tests
npm run check          # Syntax checks for all source and scripts
npm run test:balance   # Reproducible natural-play policies across several seeds
npm run test:gameplay  # 24 generated colonies, invariants, reloads, defeat and restart
npm run benchmark      # 100 / 500 / 1,000-worker stress checks and save reloads
npm run build          # Produce the standalone static game in dist/
npm run preview        # Serve dist/ at localhost:5173
```

Stop the development server before running the preview server on the same port. To use another port in PowerShell, set `$env:PORT = '5174'` before the command.

The balance scripts use public player commands and earned resources. They do not grant resources or resolve combat by a score. Legacy and later-lineage cases set their permanent starting state as separate comparisons. First-run defeat time is a tuning target, not a scripted loss. Generated gameplay checks cover idle, economy, balanced, fortress, explorer, and mixed-order policies. Full reports go into the ignored `artifacts/` folder.

`node scripts/qa-fixtures.mjs` creates ignored, natural-play saves for early construction, a developed colony, and defeat. These can be imported to test the interface. They are not bundled with the production game.

## Local development status

The October 9 request authorizes GitHub migration. The source is backed up in `wehinson/ant-colony`; the local test server uses the Pages project path. The eleven system branches and second audit are integrated into `working`. See [hosting status](docs/hosting.md), [the system audit](docs/system-audit.md), [recorded simulation results](docs/verification-results.json), and [the branch record](BRANCHES.md).
