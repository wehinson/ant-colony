import test from "node:test";
import assert from "node:assert/strict";
import { fixture, hatch } from "./helpers.js";
import { ColonyEngine } from "../src/engine/engine.js";
import { excavate } from "../src/engine/world.js";
test("partial cargo unload survives save and reload without duplication", () => {
  const e = fixture();
  e.state.deliveries = [];
  const [a] = hatch(e, 1);
  Object.assign(a, {
    x: 0,
    y: 0,
    phase: "cargo",
    cargo: 6,
    trip: { entry: { x: 0, y: 0 }, destination: { x: 13, y: 0 } },
  });
  e.state.food = 28;
  e.advance(0.1, { exact: true });
  assert.equal(e.state.food, 30);
  assert.equal(a.cargo, 4);
  const restored = ColonyEngine.deserialize(e.serialize());
  for (const game of [e, restored]) {
    game.state.food = 25;
    game.advance(0.1, { exact: true });
  }
  assert.equal(restored.state.food, 29);
  assert.equal(restored.state.ants[0].cargo, 0);
  assert.equal(e.serialize(), restored.serialize());
  assert.equal(
    restored.state.deliveries.reduce((n, d) => n + d.amount, 0),
    6,
  );
});
test("foragers use the nearest physical entrance despite compressed surface paths", () => {
  const e = fixture();
  const [a] = hatch(e, 1);
  excavate(e.state.world, 1000, 1);
  Object.assign(a, { x: 10, y: 0, phase: "idle" });
  e.state.food = 0;
  e._forage(a, 0.1, e.getStats());
  assert.equal(a.trip.entry.x, 0);
  e.state.food = e.getStats().foodCap;
  a.phase = "idle";
  a.trip = null;
  e._forage(a, 0.1, e.getStats());
  assert.equal(a.trip, null);
});
