import { BUILDINGS } from "./catalog.js";

export function createMetrics(since = 0) {
  return {
    since,
    nextSample: since + 10,
    counters: {},
    samples: [],
    commands: [],
    raids: [],
  };
}
export const metricsSystem = {
  record(name, amount = 1) {
    const counters = this.state.metrics.counters;
    counters[name] = (counters[name] || 0) + amount;
  },
  observe(dt) {
    const s = this.state,
      m = s.metrics,
      st = this.getStats();
    if (s.food >= st.foodCap - 0.01 || s.ants.some((a) => a.phase === "cargo"))
      this.record("storageBlockedSeconds", dt);
    if (s.jobs.length && s.energy < 0.3)
      this.record("energyStarvedSeconds", dt);
    if (st.counts.dig && !s.jobs.length) this.record("noDigOrdersSeconds", dt);
    if (this.sheltered()) this.record("shelterSeconds", dt);
    if (s.time >= m.nextSample || s.status === "defeat") {
      m.nextSample = s.time + 10;
      m.samples.push({
        time: s.time,
        food: s.food,
        energy: s.energy,
        population: st.population,
        mobile: st.counts.warrior,
        staff: st.committed,
        enemies: s.enemies.length,
        queen: s.queen.hp,
        efficiency: st.efficiency,
        raid: s.raid.number,
        phase: s.raid.phase,
      });
      if (m.samples.length > 720) m.samples.shift();
    }
  },
  diagnostics() {
    const s = this.state,
      st = this.getStats(),
      m = s.metrics,
      duration = Math.max(0.1, s.time - m.since);
    return {
      format: "ant-colony-diagnostics",
      version: 1,
      seed: s.seed,
      time: s.time,
      status: s.status,
      lineage: { ...s.lineage },
      highestRaid: s.raid.highest,
      peak: s.peak,
      living: st.population,
      mobile: st.counts.warrior,
      mobileCapacity: st.mobileCap,
      committed: st.committed,
      chunks: Object.keys(s.world.chunks).length,
      excavated: Object.keys(s.world.dug).length,
      queued: s.jobs.length,
      reachableClaims: s.jobs.filter((j) => j.owner).length,
      completedRooms: s.buildings
        .filter((b) => b.complete)
        .map((b) => ({
          type: b.type,
          level: b.level,
          staff: b.staff.length,
          required: BUILDINGS[b.type].staff,
        })),
      counters: { ...m.counters },
      measuredSince: m.since,
      bottlenecks: Object.fromEntries(
        [
          "storageBlockedSeconds",
          "energyStarvedSeconds",
          "noDigOrdersSeconds",
          "shelterSeconds",
        ].map((k) => [
          k,
          Math.round(((m.counters[k] || 0) / duration) * 1000) / 10,
        ]),
      ),
      samples: structuredClone(m.samples),
      raids: structuredClone(m.raids),
      commands: structuredClone(m.commands),
      result: structuredClone(s.result),
    };
  },
};
