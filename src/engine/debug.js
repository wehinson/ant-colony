import { ECONOMIC, ENEMIES } from "./catalog.js";
import { excavate, entrances } from "./world.js";
export const debugSystem = {
  _debug(c) {
    const s = this.state;
    if (!s.debug.enabled)
      return this.notify("Open a practice copy before using debug controls.");
    if (s.status === "defeat")
      return this.notify(
        "Start another practice colony or return to the real colony.",
      );
    switch (c.action) {
      case "step": {
        if (![0.1, 1, 10, 60].includes(c.seconds))
          return this.notify("Choose a 0.1, 1, 10, or 60 second step.");
        s.started = true;
        s.paused = false;
        this.advance(c.seconds, { exact: true });
        s.paused = true;
        break;
      }
      case "resources": {
        const st = this.getStats();
        s.food = st.foodCap;
        s.energy = st.energyCap;
        break;
      }
      case "unlock":
        s.unlocked = [...ECONOMIC];
        break;
      case "hatch": {
        if (
          !Number.isSafeInteger(c.count) ||
          c.count < 1 ||
          c.count > 1000 ||
          !["food", "dig", "warrior"].includes(c.crew)
        )
          return this.notify("Choose a crew and 1–1,000 ants.");
        const chamber = s.buildings.find(
          (b) => b.type === "queen" && b.complete,
        );
        if (!chamber)
          return this.notify("Complete the founding chamber first.");
        for (let i = 0; i < c.count; i++) {
          this._hatch({ buildingId: chamber.id });
          this._setCrew(s.ants.at(-1), c.crew);
        }
        break;
      }
      case "excavate":
        for (const j of [...s.jobs]) {
          excavate(s.world, j.x, j.y);
          this._cancelJob(j.id);
        }
        break;
      case "warning":
        if (s.raid.phase !== "peace")
          return this.notify("A raid is already in progress.");
        s.raid.nextAt = s.time + s.raid.warning;
        this._raids();
        break;
      case "spawn": {
        if (!Object.hasOwn(ENEMIES, c.enemy))
          return this.notify("Choose a valid enemy.");
        const openings = entrances(s.world);
        const x = openings.reduce((edge, p) => Math.min(edge, p.x), 0) - 16;
        this.spawnEnemy(c.enemy, { x, y: 0 });
        break;
      }
      case "heal":
        for (const a of [s.queen, ...s.ants, ...s.buildings]) a.hp = a.maxHp;
        break;
      case "clearEnemies":
        for (const e of s.enemies) e.hp = 0;
        this._cleanup();
        break;
      case "defeat":
        s.queen.hp = 0;
        s.queen.lastHitBy = "Practice control";
        this._defeat();
        break;
      default:
        return this.notify("Unknown debug control.");
    }
    s.debug.modified = true;
    return this.ok("Practice copy updated. Your real colony is unchanged.");
  },
  debugView() {
    const s = this.state,
      st = this.getStats(),
      m = s.metrics;
    return {
      active: s.debug.enabled,
      label: s.debug.enabled ? "PRACTICE COPY" : "COLONY DIAGNOSTICS",
      enemyChoices: Object.entries(ENEMIES).map(([key, value]) => ({
        key,
        name: value.name,
      })),
      rows: [
        ["Seed", String(s.seed)],
        ["Simulation ticks", String(s.tick)],
        ["Terrain chunks", String(Object.keys(s.world.chunks).length)],
        ["Excavated tiles", String(Object.keys(s.world.dug).length)],
        [
          "Active / queued dig jobs",
          `${s.jobs.filter((j) => j.owner).length} / ${s.jobs.length}`,
        ],
        [
          "Food delivered",
          Math.floor(m.counters.foodDelivered || 0).toString(),
        ],
        ["Completed trips", String(m.counters.tripsCompleted || 0)],
        ["Food from prey", Math.floor(m.counters.foodFromPrey || 0).toString()],
        ["Food salvaged", Math.floor(m.counters.foodSalvaged || 0).toString()],
        ["Living / peak ants", `${st.population} / ${s.peak}`],
        ["Enemy count", String(s.enemies.length)],
        ["Raid budget", String(s.raid.plan?.budget || 0)],
        [
          "Storage blocked",
          `${Math.round(m.counters.storageBlockedSeconds || 0)}s`,
        ],
        [
          "Energy constrained",
          `${Math.round(m.counters.energyStarvedSeconds || 0)}s`,
        ],
      ],
    };
  },
};
