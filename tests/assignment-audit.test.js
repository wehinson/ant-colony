import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { fixture, hatch } from "./helpers.js";
test("the founding worker always gathers food, even if a different hatch crew was selected", () => {
  const e = new ColonyEngine();
  e.command({ type: "newCrew", crew: "dig" });
  e.command({ type: "start" });
  e.advance(55, { exact: true });
  assert.equal(e.state.ants[0].crew, "food");
  assert.equal(e.state.newCrew, "dig");
});
test("pending recruitment reserves capacity and full cargo is not lost on assignment", () => {
  const e = fixture();
  const [a, b, c] = hatch(e, 3);
  for (const ant of [a, b, c])
    Object.assign(ant, {
      x: 0,
      y: 0,
      phase: "cargo",
      cargo: 6,
      trip: { entry: { x: 0, y: 0 }, destination: { x: 13, y: 0 } },
    });
  e.state.food = e.getStats().foodCap;
  assert.ok(e.command({ type: "assign", crew: "warrior", delta: 1 }).ok);
  assert.ok(e.command({ type: "assign", crew: "warrior", delta: 1 }).ok);
  assert.equal(
    e.command({ type: "assign", crew: "warrior", delta: 1 }).ok,
    false,
  );
  e.advance(0.1, { exact: true });
  assert.equal(a.cargo, 6);
  assert.equal(a.crew, "food");
  e.state.food = 0;
  e.advance(0.1, { exact: true });
  assert.equal(a.crew, "warrior");
  assert.equal(a.cargo, 0);
  assert.equal(e.getStats().counts.warrior, 2);
});
test("control values cannot corrupt saved booleans", () => {
  const e = new ColonyEngine();
  for (const type of ["pause", "eggs", "shelter", "autoShelter"])
    assert.equal(e.command({ type, value: "false" }).ok, false);
  assert.doesNotThrow(() => ColonyEngine.deserialize(e.serialize()));
});
