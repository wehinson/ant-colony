import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../scripts/gameplay-simulations.mjs";
import { ColonyEngine } from "../src/engine/engine.js";
test("generated natural gameplay reaches defeat, purchases prestige and starts the next ant", () => {
  const report = simulateScenario({ seed: 23, mode: "economy", limit: 1300 });
  assert.equal(report.status, "defeat");
  assert.equal(report.nextRunVerified, true);
  assert.ok(report.reloadChecks > 15);
  assert.ok(report.counters.foodDelivered > 0);
  assert.ok(report.counters.foodSpentEggs > 0);
  assert.ok(report.counters["completed:quarters"] > 0);
  assert.ok(report.raids.some((r) => r.completedAt));
  assert.ok(report.samples.length > 20);
});
test("diagnostic snapshots are read-only and counters freeze when paused", () => {
  const e = new ColonyEngine();
  e.command({ type: "start" });
  e.advance(60, { exact: true });
  e.command({ type: "pause", value: true });
  const before = e.serialize(),
    report = e.diagnostics();
  report.counters.foodDelivered = 9999;
  report.samples.length = 0;
  report.lineage.generation = 9999;
  e.advance(100, { exact: true });
  assert.equal(e.serialize(), before);
  assert.doesNotThrow(() => ColonyEngine.deserialize(before));
});
