import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { ColonyEngine } from "../src/engine/engine.js";
import { CREWS, PERMANENT } from "../src/engine/catalog.js";
import { isOpen } from "../src/engine/world.js";
import { develop } from "./balance.mjs";

export function policy(game, name, random) {
  if (name === "idle") return;
  develop(game, {
    defend: name !== "economy",
    advanced: ["fortress", "explorer"].includes(name),
  });
  const s = game.state,
    st = game.getStats();
  if (name === "fortress" && s.unlocked.includes("quarters")) {
    const barracks = s.buildings.find(
      (b) => b.type === "barracks" && b.complete,
    );
    if (barracks?.level < 3 && !barracks.upgrading)
      game.command({ type: "upgrade", id: barracks.id });
    for (const [building, x, y] of [
      ["outpost", -2, 0],
      ["spray", 1, 2],
      ["snare", 0, 7],
      ["ranged", -4, 2],
    ])
      if (
        !s.buildings.some((b) => b.type === building) &&
        game.preview(building, x, y).valid
      )
        game.command({ type: "build", building, x, y });
    if (
      st.counts.food > 10 &&
      st.counts.warrior + st.pending.warrior <
        Math.min(st.mobileCap, Math.floor(st.population * 0.4))
    )
      game.command({ type: "assign", crew: "warrior", delta: 1 });
  }
  if (name === "explorer" && s.time > 100 && s.time % 10 < 1)
    game.command({ type: "dig", x: 5 + (Math.floor(s.time / 40) % 30), y: 4 });
  if (name === "chaotic" && s.time > 60 && s.time % 7 < 1) {
    const choice = Math.floor(random() * 7);
    if (choice === 0)
      game.command({
        type: "assign",
        crew: CREWS[Math.floor(random() * 3)],
        delta: random() < 0.5 ? -1 : 1,
      });
    if (choice === 1)
      game.command({
        type: "dig",
        x: Math.floor(random() * 20) - 10,
        y: 1 + Math.floor(random() * 10),
      });
    if (choice === 2) game.command({ type: "eggs", value: random() < 0.1 });
    if (choice === 3)
      game.command({ type: "newCrew", crew: CREWS[Math.floor(random() * 3)] });
    if (choice === 4)
      game.command({ type: "build", building: "unknown", x: 0, y: 1 });
    if (choice === 5) {
      const b = s.buildings.find((b) => !b.complete && b.type !== "queen");
      if (b) game.command({ type: "cancel", id: b.id });
    }
    if (choice === 6) game.command({ type: "rally", x: 0, y: 2 });
  }
}
export function assertInvariants(game) {
  const s = game.state,
    st = game.getStats();
  assert.ok(
    Number.isFinite(s.food) && s.food >= 0 && s.food <= st.foodCap + 0.00001,
  );
  assert.ok(
    Number.isFinite(s.energy) &&
      s.energy >= 0 &&
      s.energy <= st.energyCap + 0.00001,
  );
  assert.equal(
    st.population,
    st.counts.food + st.counts.dig + st.counts.warrior + st.committed,
  );
  assert.ok(s.peak >= st.population);
  assert.ok(s.buildings.filter((b) => b.type === "queen").length <= 1);
  for (const a of s.ants)
    assert.ok(
      isOpen(s.world, Math.round(a.x), Math.round(a.y)),
      "ant in solid dirt",
    );
  for (const b of s.buildings)
    assert.equal(
      b.staff.length,
      s.ants.filter((a) => a.staffOf === b.id).length,
    );
  assert.ok(
    Object.values(s.metrics.counters).every(
      (n) => Number.isFinite(n) && n >= 0,
    ),
  );
}
export function simulateScenario({
  seed = 23,
  mode = "balanced",
  limit = 1800,
  prestige = 0,
  lineage = 0,
  reloadEvery = 37,
} = {}) {
  let game = new ColonyEngine({ seed });
  const meta = structuredClone(game.state.meta);
  for (const key of Object.keys(meta.upgrades)) meta.upgrades[key] = prestige;
  meta.runs = lineage;
  game = new ColonyEngine({ seed, meta });
  game.command({ type: "start" });
  let randomState = seed >>> 0,
    replays = 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const start = performance.now();
  for (let t = 0; t < limit && game.state.status !== "defeat"; t++) {
    policy(game, mode, random);
    game.advance(1, { exact: true });
    if (t % 10 === 0) assertInvariants(game);
    if (t % reloadEvery === 0) {
      const saved = game.serialize();
      game = ColonyEngine.deserialize(saved);
      assert.equal(game.serialize(), saved);
      replays++;
    }
  }
  assertInvariants(game);
  const report = game.diagnostics();
  let nextRunVerified = false;
  if (game.state.status === "defeat") {
    const currency = game.state.meta.currency,
      award = game.state.result.earned,
      generation = game.state.lineage.generation;
    const restored = ColonyEngine.deserialize(game.serialize());
    restored._defeat();
    assert.equal(restored.state.meta.currency, currency);
    const branch = Object.keys(PERMANENT).find(
      (k) =>
        PERMANENT[k].base + restored.state.meta.upgrades[k] * 2 <= currency,
    );
    if (branch) assert.ok(restored.command({ type: "prestige", branch }).ok);
    assert.ok(award > 0);
    assert.ok(restored.command({ type: "newRun" }).ok);
    assert.equal(restored.state.lineage.generation, generation + 1);
    restored.advance(75, { exact: true });
    assert.ok(restored.state.ants.length > 0);
    nextRunVerified = true;
  }
  return {
    ...report,
    mode,
    prestige,
    limit,
    censored: game.state.status !== "defeat",
    reloadChecks: replays,
    nextRunVerified,
    wallMs: Math.round(performance.now() - start),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const quick = process.argv.includes("--quick");
  const modes = [
    "idle",
    "economy",
    "balanced",
    "fortress",
    "explorer",
    "chaotic",
  ];
  const scenarios = modes.flatMap((mode) =>
    (quick ? [23] : [23, 123, 180231]).map((seed) => ({
      seed,
      mode,
      limit: quick ? 950 : 1800,
    })),
  );
  if (!quick)
    for (const seed of [23, 123, 180231])
      scenarios.push(
        { seed, mode: "fortress", prestige: 4, limit: 2400 },
        { seed, mode: "fortress", lineage: 25, limit: 2400 },
      );
  await mkdir("artifacts", { recursive: true });
  const results = [];
  for (const scenario of scenarios) {
    const result = simulateScenario(scenario);
    results.push(result);
    console.log(
      `${result.mode} seed ${result.seed} lineage ${result.lineage.generation}: ${result.status} at ${result.time.toFixed(1)}s, raid ${result.highestRaid}, peak ${result.peak}`,
    );
  }
  const summary = results.map(
    ({ samples, commands, raids, completedRooms, ...result }) => ({
      ...result,
      roomTypes: [...new Set(completedRooms.map((b) => b.type))],
    }),
  );
  await writeFile(
    "artifacts/gameplay-simulations.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );
  await writeFile(
    "artifacts/gameplay-summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(
    `${results.length} scenarios passed all invariants; ${results.reduce((n, r) => n + r.reloadChecks, 0)} save round trips. Reports: artifacts/gameplay-simulations.json and artifacts/gameplay-summary.json`,
  );
}
