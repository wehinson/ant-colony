import { ENEMIES } from "../catalog.js";
import { entrances } from "../world.js";
// Engine subsystem; methods share the colony state and headless services.
export const raidsSystem = {
  _makeRaid() {
    const s = this.state,
      raid = s.raid,
      number = raid.number + 1;
    const budget = Math.floor(10 + (s.time / 210) ** 1.8 * 4.6),
      waveCount = Math.min(6, 2 + Math.floor((number - 1) / 2));
    const direction = this.random("raidRng") < 0.5 ? "west" : "east",
      waves = [],
      roster = Object.keys(ENEMIES).filter(
        (k) =>
          ENEMIES[k].minRaid <= number &&
          (!["wasp", "tunneller"].includes(k) || this.unlocked("outpost")),
      );
    const weightTotal = Array.from(
      { length: waveCount },
      (_, w) => 0.85 + w * 0.18,
    ).reduce((a, b) => a + b, 0);
    for (let w = 0; w < waveCount; w++) {
      let remaining = Math.max(
          2,
          Math.floor((budget / weightTotal) * (0.85 + w * 0.18)),
        ),
        special = 0;
      const wave = [];
      while (remaining >= 1) {
        const pool = roster.filter(
          (k) =>
            ENEMIES[k].cost <= remaining &&
            (special < 2 ||
              !["wasp", "tunneller", "spider", "thief"].includes(k)),
        );
        if (!pool.length) break;
        let type = pool[Math.floor(this.random("raidRng") * pool.length)];
        if (number === 1) type = "scout";
        if (ENEMIES[type].cost > remaining) break;
        wave.push(type);
        remaining -= ENEMIES[type].cost;
        if (["wasp", "tunneller", "spider", "thief"].includes(type)) special++;
      }
      waves.push(wave);
    }
    const openings = entrances(s.world);
    const xs = openings.length ? openings.map((p) => p.x) : [0];
    const x =
      xs.reduce(
        (edge, x) =>
          direction === "west" ? Math.min(edge, x) : Math.max(edge, x),
        xs[0],
      ) + (direction === "west" ? -16 : 16);
    return {
      number,
      budget,
      direction,
      waves,
      spawn: { x, y: 0 },
      threat: [...new Set(waves.flat())].map((k) => ENEMIES[k].name).join(", "),
      fixedAt: s.time,
    };
  },
  _raids() {
    const s = this.state,
      r = s.raid;
    if (r.phase === "peace" && s.time >= r.nextAt - r.warning) {
      r.plan = this._makeRaid();
      s.metrics.raids.push({
        number: r.plan.number,
        warningAt: s.time,
        budget: r.plan.budget,
        waves: r.plan.waves.map((w) => [...w]),
        direction: r.plan.direction,
        completedAt: null,
      });
      if (s.metrics.raids.length > 100) s.metrics.raids.shift();
      r.phase = "warning";
      this.log(
        `Raid ${r.plan.number} approaching`,
        `${r.plan.direction === "west" ? "West" : "East"} approach. ${r.plan.threat}. Workers seek shelter.`,
        "warning",
      );
    }
    if (r.phase === "warning" && s.time >= r.nextAt) {
      r.phase = "active";
      r.number = r.plan.number;
      r.wave = 0;
      r.startedAt = s.time;
      r.waveAt = s.time;
      this._startWave();
    }
    if (r.phase === "intermission" && s.time >= r.waveAt) this._startWave();
    if (r.phase !== "active") return;
    if (r.pending.length && s.time >= r.spawnAt) {
      this.spawnEnemy(r.pending.shift(), r.plan.spawn);
      r.spawnAt = s.time + 1.4;
    }
    if (!r.pending.length && !s.enemies.some((e) => e.hp > 0)) {
      if (r.wave < r.plan.waves.length) {
        r.phase = "intermission";
        r.waveAt = s.time + 20;
        this.log(
          "A moment to breathe",
          `Wave ${r.wave} cleared. The next wave arrives in 20 seconds.`,
        );
      } else {
        r.highest = r.number;
        const record = s.metrics.raids.findLast(
          (row) => row.number === r.number,
        );
        if (record) record.completedAt = s.time;
        r.phase = "peace";
        r.lastEnded = s.time;
        r.nextAt = s.time + 450;
        r.plan = null;
        this.log(
          `Raid ${r.number} survived`,
          "Repair your defenses, recover, and prepare. The next raid is growing stronger.",
          "milestone",
        );
      }
    }
  },
  _startWave() {
    const s = this.state,
      r = s.raid;
    r.phase = "active";
    r.pending = [...r.plan.waves[r.wave]];
    r.wave++;
    r.spawnAt = s.time;
    this.log(
      `Raid ${r.number} · wave ${r.wave}`,
      `${r.pending.length} attackers approach from the ${r.plan.direction}.`,
      "danger",
    );
  },
  spawnEnemy(type, position) {
    const s = this.state,
      d = ENEMIES[type],
      strengthTime = s.raid.plan?.fixedAt ?? s.time,
      scale = 1 + Math.max(0, strengthTime - 350) / 700;
    const p = { x: position.x, y: d.flying ? -1 : position.y };
    const e = {
      id: this.id("enemy"),
      type,
      ...p,
      previousX: p.x,
      previousY: p.y,
      hp: d.hp * scale,
      maxHp: d.hp * scale,
      damage: d.damage * (1 + Math.max(0, strengthTime - 350) / 1400),
      cooldown: 0,
      path: [],
      slowUntil: 0,
      blockedBy: null,
      stolen: false,
      tunnelProgress: 0,
      warned: false,
    };
    s.enemies.push(e);
    this.record(`spawned:${type}`);
    return e;
  },
};
