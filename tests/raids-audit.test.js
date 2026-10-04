import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { ENEMIES, ECONOMIC } from "../src/engine/catalog.js";
test("foraging random choices cannot change the raid composition or direction", () => {
  const a = new ColonyEngine({ seed: 99 }),
    b = new ColonyEngine({ seed: 99 });
  for (let i = 0; i < 10000; i++) b.random();
  for (const e of [a, b]) {
    e.state.time = 1500;
    e.state.raid.number = 3;
    e.state.unlocked = [...ECONOMIC];
  }
  assert.deepEqual(a._makeRaid(), b._makeRaid());
});
test("generated compositions stay within budget and the two-specials-per-wave rule", () => {
  for (let seed = 1; seed <= 50; seed++)
    for (let raid = 1; raid <= 12; raid++) {
      const e = new ColonyEngine({ seed });
      e.state.time = 175 + (raid - 1) * 600;
      e.state.raid.number = raid - 1;
      e.state.unlocked = [...ECONOMIC];
      const plan = e._makeRaid();
      assert.ok(
        plan.waves.flat().reduce((n, t) => n + ENEMIES[t].cost, 0) <=
          plan.budget,
      );
      assert.ok(plan.waves.length >= 2 && plan.waves.length <= 6);
      for (const wave of plan.waves) {
        assert.ok(wave.length > 0);
        assert.ok(
          wave.filter((t) =>
            ["wasp", "tunneller", "spider", "thief"].includes(t),
          ).length <= 2,
        );
        assert.ok(wave.every((t) => ENEMIES[t].minRaid <= raid));
      }
    }
});
