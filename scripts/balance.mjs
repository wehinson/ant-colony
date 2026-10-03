import { ColonyEngine } from "../src/engine/engine.js";
import { performance } from "node:perf_hooks";

// A reproducible player policy uses only public commands and normal resources.
// No accelerated resource production, free buildings, or direct combat changes.
export function develop(engine, { defend = true, advanced = false } = {}) {
  const s = engine.state,
    st = engine.getStats();
  if (s.status === "defeat") return;
  const exists = (type) => s.buildings.some((b) => b.type === type);
  const complete = (type) =>
    s.buildings.some((b) => b.type === type && b.complete);
  const build = (building, x, y) => {
    if (!exists(building) && engine.preview(building, x, y).valid)
      return engine.command({ type: "build", building, x, y }).ok;
    return false;
  };
  if (
    st.population >= 2 &&
    st.counts.dig + st.pending.dig < (st.population > 12 ? 2 : 1) &&
    st.counts.food > 1
  )
    engine.command({ type: "assign", crew: "dig", delta: 1 });
  if (complete("queen")) build("storage", 2, 3);
  if (complete("storage")) {
    if (
      defend &&
      st.counts.food > 3 &&
      st.counts.warrior + st.pending.warrior <
        Math.min(st.mobileCap, Math.floor(st.population * 0.3))
    )
      engine.command({ type: "assign", crew: "warrior", delta: 1 });
    if (defend && !exists("barricade")) build("barricade", 0, 1);
    if (defend && !exists("trap")) build("trap", 0, 2);
    if (st.counts.food > 3 || !defend) build("brood", -4, 3);
  }
  if (complete("brood")) build("waste", -1, 5);
  if (complete("waste")) build("prey", 2, 5);
  if (complete("prey")) build("quarters", -4, 5);
  if (complete("waste") && defend) build("barracks", -1, 7);
  if (defend && st.counts.warrior >= 4 && complete("barracks"))
    build("guard", -1, 2);
  if (advanced && complete("quarters") && s.food > 80) {
    const b = s.buildings.find((b) => b.type === "barricade");
    if (b && b.level < 3 && b.complete && s.time - b.lastDamage >= 6)
      engine.command({ type: "upgrade", id: b.id });
    const storage = s.buildings.find((b) => b.type === "storage");
    if (storage?.level < 4) engine.command({ type: "upgrade", id: storage.id });
    if (s.research.carry < 3)
      engine.command({ type: "research", key: "carry" });
  }
}
export function simulate(seed, options = {}) {
  const e = new ColonyEngine({ seed });
  if (options.prestige)
    for (const branch of Object.keys(e.state.meta.upgrades))
      e.state.meta.upgrades[branch] = options.prestige;
  // Recreate the run with permanent improvements, so health and starting resources match.
  const game = options.prestige
    ? new ColonyEngine({ seed, meta: e.state.meta })
    : e;
  game.command({ type: "start" });
  const start = performance.now();
  for (
    let t = 0;
    t < (options.limit || 2400) && game.state.status !== "defeat";
    t++
  ) {
    if (!options.idle) develop(game, options);
    game.advance(1, { exact: true });
  }
  return {
    seed,
    mode: options.idle
      ? "idle"
      : options.prestige
        ? `legacy ${options.prestige}`
        : options.defend === false
          ? "economy"
          : "defended",
    seconds: game.state.time,
    raids: game.state.raid.highest,
    peak: game.state.peak,
    living: game.state.ants.length,
    status: game.state.status,
    cause: game.state.result?.cause || "",
    rooms: game.state.unlocked.length,
    elapsedMs: Math.round(performance.now() - start),
    game,
  };
}
if (process.argv[1]?.endsWith("balance.mjs")) {
  const cases = [
    { idle: true },
    { defend: false },
    { defend: true },
    { defend: true, advanced: true, prestige: 4 },
  ];
  const results = [];
  for (const options of cases)
    for (const seed of [23, 123, 180231]) {
      const { game, ...result } = simulate(seed, options);
      results.push(result);
    }
  console.table(results);
}
