import { ColonyEngine } from "../src/engine/engine.js";
import { performance } from "node:perf_hooks";

const results = [];
for (const population of [100, 500, 1000]) {
  const game = new ColonyEngine({ seed: 77 });
  game.command({ type: "start" });
  game.advance(70, { exact: true });
  game.state.raid.nextAt = 100000;
  while (game.state.ants.length < population)
    game._hatch({ buildingId: game.state.buildings[0].id });
  const before = performance.now();
  game.advance(60, { exact: true });
  const elapsed = performance.now() - before;
  const text = game.serialize(),
    restored = ColonyEngine.deserialize(text);
  results.push({
    population,
    simulatedSeconds: 60,
    wallMs: Math.round(elapsed),
    averageTickMs: +(elapsed / 600).toFixed(3),
    saveKB: Math.round(text.length / 1024),
    restored: restored.state.ants.length,
  });
}
console.table(results);
