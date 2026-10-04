import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { excavate, pathfind } from "../src/engine/world.js";

test("sparse paths ignore distant designations and cross huge surface gaps with waypoints", () => {
  const e = new ColonyEngine();
  e.command({ type: "dig", x: 1_000_000_000, y: 300 });
  excavate(e.state.world, 8, 10);
  assert.equal(pathfind(e.state, { x: 0, y: 0 }, { x: 8, y: 10 }), null);
  const route = pathfind(
    e.state,
    { x: -1_000_000_000, y: 0 },
    { x: 1_000_000_000, y: 0 },
  );
  assert.ok(route.length <= 2);
  assert.deepEqual(route.at(-1), { x: 1_000_000_000, y: 0 });
  assert.ok(Object.keys(e.state.world.chunks).length < 30);
});
test("founding access cannot be canceled into a deadlock and extreme integer footprints fail safely", () => {
  const e = new ColonyEngine();
  for (const j of [...e.state.jobs])
    assert.equal(e.command({ type: "dig", x: j.x, y: j.y }).ok, false);
  assert.equal(e.preview("queen", Number.MAX_SAFE_INTEGER, 3).valid, false);
  e.command({ type: "start" });
  e.advance(70, { exact: true });
  assert.ok(e.state.ants.length > 0);
});
