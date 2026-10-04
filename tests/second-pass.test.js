import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { fixture, hatch, room } from "./helpers.js";
import { getView } from "../src/engine/view.js";
import { lineOfSight, excavate } from "../src/engine/world.js";
test("an ant inside its destination tile walks to the center instead of remaining stuck", () => {
  const e = fixture();
  const [a] = hatch(e, 1);
  Object.assign(a, { x: 0.3, y: 0, path: [] });
  const before = a.x;
  e.move(a, { x: 0, y: 0 }, 1, 0.1);
  assert.ok(a.x < before && a.x > 0);
  for (let i = 0; i < 4; i++) e.move(a, { x: 0, y: 0 }, 1, 0.1);
  assert.ok(Math.abs(a.x) < 0.06);
});
test("fast dig drags fill every intermediate tile and remain orders while paused", () => {
  const e = new ColonyEngine();
  const previous = e.state.jobs.length;
  assert.ok(
    e.command({
      type: "digStroke",
      from: { x: 20, y: 4 },
      to: { x: 30, y: 4 },
      includeStart: true,
    }).ok,
  );
  assert.equal(e.state.jobs.length, previous + 11);
  for (let x = 20; x <= 30; x++)
    assert.ok(e.state.jobs.some((j) => j.x === x && j.y === 4));
  assert.equal(
    e.command({ type: "digStroke", from: { x: 0, y: 1 }, to: { x: 1e9, y: 1 } })
      .ok,
    false,
  );
  assert.equal(Object.keys(e.state.world.dug).length, 0);
});
test("brood theft requires sight through open terrain", () => {
  const e = fixture();
  const b = room(e, "brood", 4, 3);
  excavate(e.state.world, 5, 1);
  const thief = e.spawnEnemy("thief", { x: 5, y: 1.8 });
  e.state.eggs.push({ id: e.id("egg"), buildingId: b.id, progress: 0.1 });
  assert.equal(lineOfSight(e.state.world, thief, { x: 5, y: 3.5 }), false);
  e._enemy(thief, 0.1);
  assert.equal(thief.stolen, false);
  assert.equal(e.state.eggs.length, 1);
});
test("diagonal dig strokes produce a connected passage", () => {
  const e = new ColonyEngine();
  const before = e.state.jobs.length;
  e.command({
    type: "digStroke",
    from: { x: 20, y: 4 },
    to: { x: 24, y: 8 },
    includeStart: true,
  });
  const jobs = e.state.jobs.slice(before);
  assert.equal(jobs.length, 9);
  for (let i = 1; i < jobs.length; i++)
    assert.equal(
      Math.abs(jobs[i].x - jobs[i - 1].x) + Math.abs(jobs[i].y - jobs[i - 1].y),
      1,
    );
});
test("later lineage resource labels stay clean whole numbers", () => {
  const e = new ColonyEngine();
  e._defeat();
  e.command({ type: "newRun" });
  const view = getView(e);
  assert.ok(Number.isInteger(view.energyCap));
  assert.ok(Number.isInteger(view.queenMax));
});
