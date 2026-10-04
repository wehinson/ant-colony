import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { ANT_LINEAGES, lineageFor } from "../src/engine/lineages.js";
test("all fifty source ants unlock in reverse rank order then repeat in stronger cycles", () => {
  const e = new ColonyEngine({ seed: 78 });
  assert.equal(ANT_LINEAGES.length, 50);
  for (let generation = 0; generation < 102; generation++) {
    assert.equal(e.state.lineage.generation, generation);
    assert.equal(lineageFor(generation).rank, 50 - (generation % 50));
    assert.equal(new Set(ANT_LINEAGES.map((a) => a.name)).size, 50);
    e.state.queen.hp = 0;
    e._defeat();
    const currency = e.state.meta.currency;
    e._defeat();
    assert.equal(e.state.meta.currency, currency);
    const restored = ColonyEngine.deserialize(e.serialize());
    assert.ok(restored.command({ type: "newRun", seed: 78 }).ok);
    e.state = restored.state;
  }
  assert.equal(lineageFor(49).name, "Driver ant / siafu");
  assert.equal(lineageFor(50).cycle, 2);
  assert.ok(e.getStats().carry > 6);
  assert.ok(e.state.queen.maxHp > 300);
});
test("older saves migrate to the correct living or defeated lineage without awarding twice", () => {
  const e = new ColonyEngine();
  e.state.meta.runs = 4;
  let data = JSON.parse(e.serialize());
  delete data.state.lineage;
  delete data.state.raidRng;
  let restored = ColonyEngine.deserialize(JSON.stringify(data));
  assert.equal(restored.state.lineage.generation, 4);
  restored._defeat();
  data = JSON.parse(restored.serialize());
  delete data.state.lineage;
  restored = ColonyEngine.deserialize(JSON.stringify(data));
  assert.equal(restored.state.lineage.generation, 4);
  assert.equal(restored.state.meta.runs, 5);
});
test("lineage improvements never alter the threat budget or warned plan", () => {
  const first = new ColonyEngine({ seed: 42 });
  const meta = structuredClone(first.state.meta);
  meta.runs = 25;
  const later = new ColonyEngine({ seed: 42, meta });
  for (const e of [first, later]) e.state.time = 1000;
  assert.deepEqual(first._makeRaid(), later._makeRaid());
  assert.ok(later.getStats().carry > first.getStats().carry);
  assert.ok(later.getStats().eggDuration < first.getStats().eggDuration);
});
