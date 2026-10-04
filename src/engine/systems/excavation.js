import { lineageBoost } from "../lineages.js";
import {
  VERSION,
  STEP,
  BUILDINGS,
  ECONOMIC,
  CREWS,
  ENEMIES,
  PERMANENT,
  RESEARCH,
  key,
  cell,
  center,
  distance,
  clamp,
  footprint,
  formatTime,
} from "../catalog.js";
import {
  terrainValue,
  ensureTerrain,
  excavate,
  isOpen,
  neighbors,
  entrances,
  buildingAt,
  blockedAt,
  pathfind,
  connected,
  lineOfSight,
} from "../world.js";

// Engine subsystem; methods share the colony state and headless services.
export const excavationSystem = {
  _designate(x, y, blueprint = null) {
    if (isOpen(this.state.world, x, y)) return;
    let job = this.state.jobs.find((j) => j.x === x && j.y === y);
    if (!job) {
      job = { id: this.id("dig"), x, y, progress: 0, owner: null, blueprint };
      this.state.jobs.push(job);
    }
    ensureTerrain(this.state.world, x, y);
    return job;
  },
  _cancelJob(id) {
    const s = this.state;
    const job = s.jobs.find((j) => j.id === id);
    if (!job) return;
    for (const a of [s.queen, ...s.ants])
      if (a.jobId === id) {
        a.jobId = null;
        a.path = [];
      }
    s.jobs = s.jobs.filter((j) => j.id !== id);
  },
  _dig(a, dt, st, queen = false) {
    const s = this.state;
    let job = s.jobs.find((j) => j.id === a.jobId && j.owner === a.id);
    if (!job) {
      a.jobId = null;
      for (const j of s.jobs) {
        if (j.owner) continue;
        const spots = neighbors(j)
          .filter((p) => isOpen(s.world, p.x, p.y))
          .map((p) => ({ p, path: this.route(a, p) }))
          .filter((o) => o.path !== null)
          .sort((a, b) => a.path.length - b.path.length);
        if (!spots.length) continue;
        job = j;
        job.owner = a.id;
        a.jobId = job.id;
        a.digSpot = spots[0].p;
        a.path = [];
        break;
      }
    }
    if (!job) {
      if (!queen) this._repairOrSalvage(a, dt);
      return;
    }
    if (!a.digSpot || !isOpen(s.world, a.digSpot.x, a.digSpot.y)) {
      job.owner = null;
      a.jobId = null;
      return;
    }
    if (!this.move(a, a.digSpot, queen ? 1.2 : this.workerSpeed(), dt)) return;
    if (s.energy <= 0.001) return;
    const energy = Math.min(s.energy, dt * 2.8),
      work = energy / 2.8;
    const hardness = 2.8 + terrainValue(s.seed, job.x, job.y) * 1.1;
    const rate =
      (1 + s.meta.upgrades.excavation * 0.18) *
      lineageBoost(s, "excavation") *
      st.efficiency *
      (queen ? 1.5 + s.meta.upgrades.founding * 0.35 : 1);
    job.progress = Math.min(1, job.progress + (work * rate) / hardness);
    s.energy -= energy;
    this.record("energySpentDigging", energy);
    if (job.progress >= 1) {
      excavate(s.world, job.x, job.y);
      this.record("tilesExcavated");
      s.jobs = s.jobs.filter((j) => j.id !== job.id);
      a.jobId = null;
      this.effect("dig", job, job, "#b69a72", 0.5);
    }
  },
};
