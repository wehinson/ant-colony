import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { GameSession } from "../src/engine/session.js";
test("a damaged latest autosave recovers a validated earlier state and never catches up", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
    };
  const session = new GameSession(storage, 18);
  session.command({ type: "start" });
  session.advance(0.2);
  session.save();
  session.advance(0.2);
  session.save();
  data.set("ant-colony-save", "{broken");
  const restored = new GameSession(storage);
  assert.equal(restored.engine.state.time, 0.2);
  assert.equal(restored.engine.state.paused, true);
  assert.match(restored.saveStatus, /Recovered/);
  restored.advance(10000);
  assert.equal(restored.engine.state.time, 0.2);
});
test("autosave quota errors retry on the save interval, not every clock update", () => {
  let writes = 0;
  const session = new GameSession(
    {
      getItem: () => null,
      setItem: () => {
        writes++;
        throw Error("Quota");
      },
    },
    13,
  );
  session.command({ type: "start" });
  for (let i = 0; i < 800; i++) session.advance(0.025);
  assert.ok(writes <= 2);
  assert.match(session.saveStatus, /Export/);
});
test("broken schedules, random state, references, geometry and identifiers are rejected atomically", () => {
  const e = new ColonyEngine();
  e.command({ type: "start" });
  e.advance(230, { exact: true });
  const mutations = [
    (s) => (s.raid.wave = 99),
    (s) => (s.raidRng = 1.5),
    (s) => (s.nextId = 1),
    (s) => (s.ants[0].jobId = "missing"),
    (s) => (s.ants[0].x = 50),
    (s) => (s.tick = 1.5),
    (s) => (s.world.dug["999999999999999999,2"] = true),
    (s) => (s.queen.relocation = { x: 1, y: 4, buildingId: "missing" }),
  ];
  for (const mutate of mutations) {
    const data = JSON.parse(e.serialize());
    mutate(data.state);
    assert.throws(
      () => ColonyEngine.deserialize(JSON.stringify(data)),
      /Invalid save/,
    );
  }
});
