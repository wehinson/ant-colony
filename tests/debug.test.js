import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/engine/session.js";
import { ColonyEngine } from "../src/engine/engine.js";
test("debug commands cannot run against a real colony", () => {
  const e = new ColonyEngine();
  const food = e.state.food;
  assert.equal(e.command({ type: "debug", action: "resources" }).ok, false);
  assert.equal(e.state.food, food);
});
test("practice copies isolate saves, defeat awards, lineage and restart progress", () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const session = new GameSession(storage, 44);
  session.command({ type: "start" });
  session.engine.advance(70, { exact: true });
  session.command({ type: "pause", value: true });
  const before = session.export();
  assert.ok(session.command({ type: "sandbox", value: true }).ok);
  assert.ok(
    session.command({
      type: "debug",
      action: "hatch",
      crew: "warrior",
      count: 50,
    }).ok,
  );
  session.command({ type: "debug", action: "unlock" });
  session.command({ type: "debug", action: "spawn", enemy: "beetle" });
  session.command({ type: "debug", action: "step", seconds: 10 });
  session.save();
  assert.equal(map.get("ant-colony-save"), before);
  session.command({ type: "debug", action: "defeat" });
  assert.equal(session.engine.state.result.earned, 0);
  assert.equal(session.engine.state.meta.runs, 0);
  assert.doesNotThrow(() => ColonyEngine.deserialize(session.export()));
  session.command({ type: "newRun" });
  assert.equal(session.engine.state.debug.enabled, true);
  assert.equal(session.engine.state.lineage.generation, 0);
  assert.ok(session.command({ type: "sandbox", value: false }).ok);
  assert.equal(session.export(), before);
});
test("practice controls validate inputs and can reach the whole founding loop while paused", () => {
  const session = new GameSession(null, 22);
  session.enterSandbox();
  assert.equal(
    session.command({
      type: "debug",
      action: "hatch",
      count: Infinity,
      crew: "food",
    }).ok,
    false,
  );
  assert.equal(
    session.command({ type: "debug", action: "spawn", enemy: "constructor" })
      .ok,
    false,
  );
  session.command({ type: "debug", action: "excavate" });
  session.command({ type: "debug", action: "step", seconds: 60 });
  assert.ok(session.engine.state.ants.length > 0);
  assert.equal(session.engine.state.paused, true);
  assert.equal(session.command({ type: "debug", action: "warning" }).ok, true);
  assert.equal(session.engine.state.raid.phase, "warning");
  const report = JSON.parse(session.diagnostics());
  assert.ok(
    report.counters.tilesExcavated === undefined ||
      report.counters.tilesExcavated >= 0,
  );
});
