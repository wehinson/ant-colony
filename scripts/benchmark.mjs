import { ColonyEngine } from "../src/engine/engine.js";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

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
  assert.equal(restored.serialize(), text);
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

// Artificial load fixture, separate from the natural-play balance policies.
const combat = new ColonyEngine({ seed: 77 });
combat.command({ type: "start" });
combat.advance(70, { exact: true });
combat.state.raid.nextAt = 100000;
combat.state.eggsPaused = true;
while (combat.state.ants.length < 1000)
  combat._hatch({ buildingId: combat.state.buildings[0].id });
for (const ant of combat.state.ants) combat._setCrew(ant, "warrior");
for (let i = 0; i < 30; i++)
  combat.spawnEnemy("beetle", { x: -8 - i * 0.3, y: 0 });
const combatStart = performance.now();
combat.advance(30, { exact: true });
const combatElapsed = performance.now() - combatStart;
assert.ok(combat.state.metrics.counters["damage:warrior"] > 0);
assert.equal(
  ColonyEngine.deserialize(combat.serialize()).serialize(),
  combat.serialize(),
);
const combatResult = {
  startingWarriors: 1000,
  startingEnemies: 30,
  simulatedSeconds: 30,
  wallMs: Math.round(combatElapsed),
  averageTickMs: +(combatElapsed / 300).toFixed(3),
  remainingWarriors: combat.state.ants.length,
  remainingEnemies: combat.state.enemies.length,
};
console.table([combatResult]);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/benchmark.json",
  JSON.stringify({ economy: results, combat: combatResult }, null, 2),
);
