import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/engine/session.js";

function fixture() {
  const data = new Map(), writes = [];
  let blocked = false;
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => {
      writes.push(key);
      if (blocked) throw Error("Quota");
      data.set(key, value);
    },
  };
  const session = new GameSession(storage, 23);
  session.command({ type: "start" });
  session.command({ type: "pause", value: true });
  writes.length = 0;
  return { session, storage, data, writes, block: (value) => { blocked = value; } };
}
function advance(session, ticks = 400) {
  for (let i = 0; i < ticks; i++) session.advance(0.025);
}
const hasJob = (session, x = 2) => session.world().jobs.some((j) => j.x === x && j.y === 4);

test("real accepted paused excavation survives abrupt reload within ten foreground seconds", () => {
  const { session, storage, writes } = fixture();
  assert.equal(session.command({ type: "dig", x: 2, y: 4 }).ok, true);
  assert.equal(hasJob(session), true);
  advance(session);
  assert.equal(session.world().time, 0);
  assert.equal(writes.filter((key) => key === "ant-colony-save").length, 1);
  // No pagehide, beforeunload, suspend, or explicit save before the reload.
  const restored = new GameSession(storage, 99);
  assert.equal(hasJob(restored), true);
  assert.equal(restored.export(), session.export());
});

test("bursts coalesce; rejected commands and unchanged paused updates do not save", () => {
  const { session, writes } = fixture();
  assert.equal(session.command({ type: "dig", x: 2, y: -1 }).ok, false);
  advance(session, 800);
  assert.equal(writes.length, 0);
  // A prior explicit save begins a new interval.
  session.save();
  writes.length = 0;
  for (let x = 2; x < 12; x++) session.command({ type: "dig", x, y: 4 });
  advance(session, 399);
  assert.equal(writes.length, 0);
  advance(session, 1);
  assert.equal(writes.filter((key) => key === "ant-colony-save").length, 1);
  writes.length = 0;
  advance(session, 800);
  assert.equal(writes.length, 0);
});

test("paused quota failures stay throttled and recover without another command", () => {
  const { session, storage, writes, block } = fixture();
  block(true);
  session.command({ type: "dig", x: 2, y: 4 });
  advance(session);
  const failedWrites = writes.length;
  assert.ok(failedWrites > 0);
  assert.match(session.saveStatus, /Export/);
  advance(session, 399);
  assert.equal(writes.length, failedWrites);
  block(false);
  advance(session, 1);
  assert.equal(hasJob(new GameSession(storage)), true);
  writes.length = 0;
  advance(session, 800);
  assert.equal(writes.length, 0);
});

test("practice dirty saves stay separate and returning discards pending practice orders", () => {
  const { session, data, writes } = fixture();
  assert.equal(session.command({ type: "sandbox", value: true }).ok, true);
  const original = data.get("ant-colony-save");
  session.command({ type: "dig", x: 2, y: 4 });
  advance(session);
  assert.equal(data.get("ant-colony-save"), original);
  assert.equal(JSON.parse(data.get("ant-colony-sandbox")).state.jobs.some((j) => j.x === 2 && j.y === 4), true);
  session.command({ type: "dig", x: 3, y: 4 });
  session.command({ type: "sandbox", value: false });
  writes.length = 0;
  advance(session, 800);
  assert.equal(writes.length, 0);
  assert.equal(hasJob(session), false);
});

test("corrupt saves remain untouched despite accepted planning commands", () => {
  const { storage, data, writes } = fixture();
  data.set("ant-colony-save", "broken");
  data.delete("ant-colony-save-backup");
  const session = new GameSession(storage, 23);
  assert.equal(session.command({ type: "dig", x: 2, y: 4 }).ok, true);
  advance(session, 800);
  assert.equal(writes.length, 0);
  assert.equal(data.get("ant-colony-save"), "broken");
});

test("pause, prestige and new run save immediately and clear pending command writes", () => {
  const { session, storage, writes } = fixture();
  session.command({ type: "dig", x: 2, y: 4 });
  assert.equal(session.command({ type: "pause", value: false }).ok, true);
  assert.equal(hasJob(new GameSession(storage)), true);
  // Synthetic defeat uses the actual engine award and command paths.
  session.world().peak = 100;
  session.world().queen.hp = 0;
  session.advance(0.1);
  assert.equal(session.world().status, "defeat");
  writes.length = 0;
  assert.equal(session.command({ type: "prestige", branch: "foraging" }).ok, true);
  assert.equal(new GameSession(storage).world().meta.upgrades.foraging, 1);
  assert.equal(session.command({ type: "newRun", seed: 9 }).ok, true);
  const restored = new GameSession(storage);
  assert.equal(restored.world().status, "founding");
  assert.equal(restored.world().meta.upgrades.foraging, 1);
  assert.equal(writes.filter((key) => key === "ant-colony-save").length, 2);
});

test("suspension flushes pending orders without offline progression or extra dirty writes", () => {
  const { session, storage, writes } = fixture();
  session.command({ type: "dig", x: 2, y: 4 });
  session.suspend(true);
  assert.equal(hasJob(new GameSession(storage)), true);
  writes.length = 0;
  session.advance(10000);
  session.suspend(false);
  advance(session, 800);
  assert.equal(session.world().time, 0);
  assert.equal(writes.length, 0);
});

test("failed pre-practice save remains pending when the real colony returns", () => {
  const { session, storage, block } = fixture();
  session.command({ type: "dig", x: 2, y: 4 });
  block(true);
  session.command({ type: "sandbox", value: true });
  session.command({ type: "dig", x: 3, y: 4 });
  block(false);
  advance(session);
  session.command({ type: "sandbox", value: false });
  advance(session);
  const restored = new GameSession(storage);
  assert.equal(hasJob(restored), true);
  assert.equal(hasJob(restored, 3), false);
});
