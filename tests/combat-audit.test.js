import test from "node:test";
import assert from "node:assert/strict";
import { fixture, hatch } from "./helpers.js";
import { ColonyEngine } from "../src/engine/engine.js";
import { SpatialIndex } from "../src/engine/spatial.js";
test("combat spatial scheduling produces exactly the same outcomes as exhaustive targeting", () => {
  const e = fixture();
  hatch(e, 60, "warrior");
  for (let i = 0; i < 12; i++)
    e.spawnEnemy(i % 2 ? "soldier" : "scout", { x: i % 2 ? -8 : 8, y: 0 });
  const other = ColonyEngine.deserialize(e.serialize());
  other.useSpatial = false;
  for (let i = 0; i < 250; i++) {
    e.advance(0.1, { exact: true });
    other.advance(0.1, { exact: true });
  }
  assert.equal(e.serialize(), other.serialize());
});
test("spatial movement updates preserve order across bucket boundaries", () => {
  const ants = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 5, y: 0 },
  ];
  const index = new SpatialIndex(ants);
  ants[0].x = 5;
  index.update(ants[0]);
  assert.deepEqual(
    index.query({ x: 5, y: 0 }, 1).map((a) => a.id),
    ["a", "b"],
  );
});
test("a civilian cached route stops when a new enemy blocks it", () => {
  const e = fixture();
  const [a] = hatch(e, 1);
  Object.assign(a, { x: 0, y: 4 });
  e.move(a, { x: 0, y: 0 }, 1, 0.1, { danger: true });
  const enemy = e.spawnEnemy("scout", { x: 0, y: 1 });
  for (let i = 0; i < 30; i++)
    e.move(a, { x: 0, y: 0 }, 1, 0.1, { danger: true });
  assert.ok(a.y > 2);
  assert.ok(enemy.hp > 0);
});
