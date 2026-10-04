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
  validTile,
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
export const assignmentSystem = {
  _assign(crew, delta) {
    const s = this.state;
    if (!CREWS.includes(crew) || ![-1, 1].includes(delta))
      return this.notify("Choose a crew and use + or −.");
    let target = crew,
      ant;
    if (delta > 0)
      ant =
        s.ants.find(
          (a) =>
            !a.staffOf &&
            !a.pendingCrew &&
            a.crew !== crew &&
            a.crew === "food",
        ) ||
        s.ants.find((a) => !a.staffOf && !a.pendingCrew && a.crew !== crew);
    else {
      target = crew === "food" ? "dig" : "food";
      ant = [...s.ants]
        .reverse()
        .find((a) => !a.staffOf && !a.pendingCrew && a.crew === crew);
    }
    if (!ant) return this.notify("No worker is available for this assignment.");
    const st = this.getStats();
    if (
      target === "warrior" &&
      st.counts.warrior + st.pending.warrior >= st.mobileCap
    )
      return this.notify(
        "Mobile warrior capacity reached. Build or upgrade barracks.",
      );
    if (ant.jobId) {
      const j = s.jobs.find((j) => j.id === ant.jobId);
      if (j) j.owner = null;
      ant.jobId = null;
    }
    if (
      ant.crew === "food" &&
      ["outbound", "forage", "inbound", "cargo"].includes(ant.phase)
    )
      ant.pendingCrew = target;
    else {
      this._setCrew(ant, target);
    }
    return this.ok(
      ant.pendingCrew
        ? "Worker will change crew after returning and unloading."
        : "Crew assignment updated.",
    );
  },
  _setCrew(a, crew) {
    a.crew = crew;
    a.pendingCrew = null;
    a.phase = "idle";
    a.path = [];
    a.target = null;
    a.jobId = null;
    const hp = this.antMaxHp(crew);
    a.hp = Math.min(hp, (a.hp / a.maxHp) * hp);
    a.maxHp = hp;
  },
  antMaxHp(crew) {
    return crew === "warrior"
      ? 65 *
          (1 +
            this.state.meta.upgrades.military * 0.15 +
            this.state.research.armor * 0.15)
      : 28;
  },
  _hatch(egg) {
    const s = this.state,
      st = this.getStats();
    const crew =
      s.births === 0
        ? "food"
        : s.newCrew === "warrior" &&
            st.counts.warrior + st.pending.warrior >= st.mobileCap
          ? "food"
          : s.newCrew;
    const b = s.buildings.find((b) => b.id === egg.buildingId),
      p =
        b && !(b.type === "queen" && s.queen.relocation)
          ? { x: b.x, y: b.y }
          : cell(s.queen);
    const maxHp = this.antMaxHp(crew);
    s.ants.push({
      id: this.id("ant"),
      x: p.x,
      y: p.y,
      previousX: p.x,
      previousY: p.y,
      hp: maxHp,
      maxHp,
      crew,
      phase: "idle",
      cargo: 0,
      path: [],
      jobId: null,
      staffOf: null,
      pendingCrew: null,
      cooldown: 0,
      target: null,
      forageUntil: 0,
      trip: null,
    });
    s.births++;
    s.peak = Math.max(s.peak, s.ants.length);
    if (s.births === 1)
      this.log(
        "The first of many",
        "Your first worker has joined the food crew. Assign a digger when the next worker hatches.",
        "milestone",
      );
  },
  workerSpeed() {
    const s = this.state;
    return (
      1.5 * (1 + s.research.speed * 0.12 + s.meta.upgrades.foraging * 0.05)
    );
  },
  sheltered() {
    const s = this.state;
    return s.shelter || (s.autoShelter && s.raid.phase !== "peace");
  },
  _ant(a, dt, st) {
    const s = this.state;
    if (a.staffOf) {
      const b = s.buildings.find((b) => b.id === a.staffOf);
      if (!b) {
        a.hp = 0;
        return;
      }
      a.stationed =
        this.move(a, { x: b.x, y: b.y }, this.workerSpeed(), dt) && b.complete;
      return;
    }
    if (a.pendingCrew && a.cargo < 0.001 && a.phase !== "forage" && a.y >= 1) {
      // A recalled, empty worker has completed its return once it is inside.
      // Shelter must not prevent an already-safe recruit from joining defense.
      a.trip = null;
      this._setCrew(a, a.pendingCrew);
    }
    if (a.crew === "warrior") {
      this._warrior(a, dt);
      return;
    }
    const threat = s.enemies.find(
      (e) => e.hp > 0 && distance(e, a) < 2.2 && lineOfSight(s.world, a, e),
    );
    if ((this.sheltered() || threat) && a.phase !== "forage") {
      if (a.jobId) {
        const j = s.jobs.find((j) => j.id === a.jobId);
        if (j) j.owner = null;
        a.jobId = null;
      }
      if (a.phase === "outbound") {
        a.phase = "inbound";
        a.path = [];
      }
      if (a.cargo > 0 && a.trip) {
        this._forage(a, dt, st);
        return;
      }
      const refuge = this.route(a, cell(s.queen), { danger: true });
      if (refuge !== null && distance(a, s.queen) > 1)
        this.move(a, cell(s.queen), this.workerSpeed() * 1.2, dt, {
          danger: true,
        });
      else if (threat) {
        const safe = neighbors(cell(a)).find(
          (p) =>
            isOpen(s.world, p.x, p.y) &&
            distance(p, threat) > distance(a, threat) + 0.3,
        );
        if (safe) this.move(a, safe, this.workerSpeed(), dt);
        else if (distance(a, threat) <= 0.9 && a.cooldown === 0) {
          this.hit(threat, 2, a, "civilian");
          a.cooldown = 1.4;
        }
      }
      return;
    }
    if (a.crew === "food") this._forage(a, dt, st);
    else if (a.crew === "dig") this._dig(a, dt, st);
  },
};
