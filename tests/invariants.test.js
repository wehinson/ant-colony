import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { CREWS, BUILDINGS } from "../src/engine/catalog.js";
import { isOpen } from "../src/engine/world.js";
import { develop } from "../scripts/balance.mjs";

test("mixed player orders keep resources, population, movement, and saved state consistent", () => {
  for (const seed of [12, 444, 9081]) {
    let game = new ColonyEngine({ seed });
    game.command({ type: "start" });
    let randomState = seed;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    for (let t = 0; t < 950 && game.state.status !== "defeat"; t++) {
      develop(game, { defend: true });
      if (t > 60 && t % 9 === 0) {
        const choice = Math.floor(random() * 6);
        if (choice === 0)
          game.command({
            type: "assign",
            crew: CREWS[Math.floor(random() * 3)],
            delta: random() > 0.5 ? 1 : -1,
          });
        if (choice === 1)
          game.command({
            type: "dig",
            x: Math.floor(random() * 16) - 8,
            y: 1 + Math.floor(random() * 12),
          });
        if (choice === 2) {
          const b =
            game.state.buildings[
              Math.floor(random() * game.state.buildings.length)
            ];
          if (b) game.command({ type: "upgrade", id: b.id });
        }
        if (choice === 3)
          game.command({ type: "eggs", value: random() < 0.15 });
        if (choice === 4) {
          const b = game.state.buildings.find(
            (b) => !b.complete && b.type !== "queen",
          );
          if (b) game.command({ type: "cancel", id: b.id });
        }
        if (choice === 5) game.command({ type: "rally", x: 0, y: 2 });
      }
      game.advance(1, { exact: true });
      if (t % 13 === 0) {
        const s = game.state,
          st = game.getStats();
        assert.ok(Number.isFinite(s.food) && s.food >= 0);
        assert.ok(Number.isFinite(s.energy) && s.energy >= 0);
        assert.equal(
          st.population,
          st.committed + st.counts.food + st.counts.dig + st.counts.warrior,
        );
        assert.equal(new Set(s.ants.map((a) => a.id)).size, s.ants.length);
        for (const a of s.ants)
          assert.ok(
            isOpen(s.world, Math.round(a.x), Math.round(a.y)),
            `ant entered solid dirt at ${a.x},${a.y}`,
          );
        assert.ok(s.buildings.filter((b) => b.type === "queen").length <= 1);
        for (const b of s.buildings.filter((b) => b.complete))
          assert.ok(b.staff.length >= BUILDINGS[b.type].staff);
        const serialized = game.serialize();
        game = ColonyEngine.deserialize(serialized);
        assert.equal(game.serialize(), serialized);
      }
    }
  }
});

test("malformed save internals are rejected without entering the simulation", () => {
  const game = new ColonyEngine({ seed: 8 });
  game.command({ type: "start" });
  game.advance(70, { exact: true });
  const mutations = [
    (s) => (s.world.bounds.minX = "bad"),
    (s) => (s.ants[0].path = [{ x: "bad", y: 3 }]),
    (s) => (s.ants[0].phase = "unknown"),
    (s) => (s.buildings[0].type = "__proto__"),
    (s) => (s.raid.pending = ["constructor"]),
    (s) => (s.meta.bestPopulation = -1),
    (s) => (s.refundFood = -10),
    (s) => (s.newCrew = "ghost"),
  ];
  for (const mutate of mutations) {
    const save = JSON.parse(game.serialize());
    mutate(save.state);
    assert.throws(
      () => ColonyEngine.deserialize(JSON.stringify(save)),
      /Invalid save/,
    );
  }
});
