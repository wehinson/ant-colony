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
export const combatSystem = {
  _controlArmy() {
    const s = this.state,
      army = s.ants.filter(
        (a) => a.crew === "warrior" && !a.staffOf && a.hp > 0,
      );
    const threats = s.enemies
      .filter((e) => e.hp > 0)
      .sort((a, b) => distance(a, s.queen) - distance(b, s.queen));
    const reserve =
        army.length > 2 ? Math.max(1, Math.ceil(army.length * 0.3)) : 0,
      assigned = new Map();
    army.sort((a, b) => distance(a, s.queen) - distance(b, s.queen));
    for (let i = 0; i < army.length; i++) {
      const a = army[i];
      a.order = i < reserve ? "reserve" : "rally";
      a.target = null;
      const choices =
        i < reserve ? threats.filter((e) => distance(e, s.queen) < 5) : threats;
      const e = choices.find(
        (e) =>
          (!ENEMIES[e.type].flying || e.y >= 0) &&
          (assigned.get(e.id) || 0) < Math.max(2, Math.ceil(e.hp / 45)) &&
          this.route(a, e) !== null,
      );
      if (e) {
        a.order = "intercept";
        a.target = e.id;
        assigned.set(e.id, (assigned.get(e.id) || 0) + 1);
      }
      a.destination = i < reserve ? cell(s.queen) : s.rally || { x: 0, y: 1 };
    }
  },
  _warrior(a, dt) {
    const s = this.state;
    let e = s.enemies.find((e) => e.id === a.target && e.hp > 0);
    const near = this.near("enemies", a, 1.15)
      .filter(
        (e) =>
          e.hp > 0 &&
          distance(a, e) < 1.15 &&
          e.y >= 0 &&
          lineOfSight(s.world, a, e),
      )
      .sort((x, y) => distance(a, x) - distance(a, y))[0];
    if (near) e = near;
    if (e) {
      if (distance(a, e) <= 1.15 && lineOfSight(s.world, a, e)) {
        const occupied = this._frontage.get(e.id) || 0;
        if (occupied < 4) {
          this._frontage.set(e.id, occupied + 1);
          if (a.cooldown === 0) {
            this.hit(
              e,
              9 *
                (1 + s.meta.upgrades.military * 0.15 + s.research.armor * 0.15),
              a,
              "warrior",
            );
            a.cooldown = 1;
          }
        }
        return;
      }
      // Each warrior gets an approach tile. Close combat has a finite attack frontage.
      const occupied = new Set(
        this.near("ants", e, 1.2)
          .filter(
            (o) =>
              o.id !== a.id &&
              o.crew === "warrior" &&
              !o.staffOf &&
              distance(o, e) < 1.2,
          )
          .map((o) => key(Math.round(o.x), Math.round(o.y))),
      );
      const approach = neighbors(cell(e))
        .filter(
          (p) => isOpen(s.world, p.x, p.y) && !occupied.has(key(p.x, p.y)),
        )
        .map((p) => ({ p, path: this.route(a, p) }))
        .filter((o) => o.path !== null)
        .sort((x, y) => x.path.length - y.path.length)[0];
      if (approach) this.move(a, approach.p, this.workerSpeed(), dt);
      return;
    }
    const destination = a.destination || cell(s.queen);
    if (isOpen(s.world, destination.x, destination.y))
      this.move(a, destination, this.workerSpeed(), dt);
  },
  hit(target, damage, source, cause) {
    if (target.hp <= 0) return;
    const armor = ENEMIES[target.type]?.armor || 0;
    if (!Object.hasOwn(ENEMIES, source.type))
      damage *= lineageBoost(this.state, "military");
    target.hp -= damage * (1 - armor);
    this.record(
      `damage:${cause}`,
      Math.min(target.hp + damage * (1 - armor), damage * (1 - armor)),
    );
    target.lastDamage = this.state.time;
    target.lastHitBy = cause;
    this.effect(
      "attack",
      source,
      target,
      source.type && ENEMIES[source.type] ? "#c26351" : "#d9ae55",
    );
  },
  _enemy(e, dt) {
    const s = this.state,
      d = ENEMIES[e.type],
      speed = d.speed * (e.slowUntil > s.time ? 0.3 : 1);
    if (e.y < 0) {
      const entry = entrances(s.world).sort(
        (a, b) => distance(e, a) - distance(e, b),
      )[0] || { x: 0, y: 0 };
      if (Math.abs(e.x - entry.x) > 0.05)
        e.x +=
          Math.sign(entry.x - e.x) *
          Math.min(Math.abs(e.x - entry.x), speed * dt);
      else e.y = Math.min(0, e.y + speed * dt);
      return;
    }
    if (d.thief && !e.stolen) {
      const brood = s.eggs
        .map((egg) => ({
          egg,
          b: s.buildings.find((b) => b.id === egg.buildingId),
        }))
        .find(
          (o) =>
            o.b &&
            distance(e, center(o.b)) < 1.8 &&
            lineOfSight(s.world, e, center(o.b)),
        );
      if (brood) {
        s.eggs = s.eggs.filter((egg) => egg.id !== brood.egg.id);
        e.stolen = true;
        e.path = [];
        this.log(
          "Brood stolen",
          "A rival is escaping with an egg. Stop it before it reaches the surface.",
          "danger",
        );
      }
    }
    if (e.stolen) {
      const entry = entrances(s.world).sort(
        (a, b) => distance(e, a) - distance(e, b),
      )[0];
      if (
        entry &&
        this.move(e, { x: entry.x + (e.x < 0 ? -16 : 16), y: 0 }, speed, dt, {
          enemy: true,
        })
      ) {
        e.escaped = true;
        e.hp = 0;
      }
    }
    const barrier =
      e.blockedBy &&
      s.buildings.find(
        (b) =>
          b.id === e.blockedBy && b.complete && distance(e, center(b)) < 1.8,
      );
    e.blockedBy = null;
    const nearby = this.near("ants", e, d.range)
      .filter(
        (a) =>
          a.hp > 0 &&
          (!a.staffOf ||
            !s.buildings.some(
              (b) =>
                b.id === a.staffOf &&
                b.complete &&
                distance(a, { x: b.x, y: b.y }) < 0.8,
            )) &&
          a.phase !== "forage" &&
          distance(a, e) <= d.range &&
          lineOfSight(s.world, e, a),
      )
      .sort(
        (a, b) =>
          (a.crew === "warrior" ? 0 : 1) - (b.crew === "warrior" ? 0 : 1),
      );
    let target = barrier || nearby[0];
    if (
      !target &&
      distance(e, s.queen) <= d.range + 0.2 &&
      lineOfSight(s.world, e, s.queen)
    )
      target = s.queen;
    if (!target)
      target = s.buildings.find(
        (b) =>
          b.complete &&
          distance(e, center(b)) <=
            d.range +
              Math.max(BUILDINGS[b.type].w, BUILDINGS[b.type].h) * 0.35 &&
          lineOfSight(s.world, e, center(b)),
      );
    if (target) {
      if (e.cooldown === 0) {
        this.hit(target, e.damage, e, d.name);
        e.cooldown = d.cooldown;
      }
      return;
    }
    if (e.stolen) return;
    if (d.tunnelling && distance(e, s.queen) > 1.2) {
      const from = cell(e),
        dest = cell(s.queen),
        options = neighbors(from).sort(
          (a, b) => distance(a, dest) - distance(b, dest),
        );
      const next = options[0];
      if (!isOpen(s.world, next.x, next.y) && next.y > 0) {
        if (!e.warned) {
          this.log(
            "Underground breach",
            `A tunnelling rival is digging at (${next.x}, ${next.y}). Rally warriors to the queen.`,
            "danger",
          );
          e.warned = true;
        }
        e.tunnelProgress += dt;
        this.effect("dig", next, next, "#bb7253", 0.3);
        if (e.tunnelProgress >= 5) {
          excavate(s.world, next.x, next.y);
          for (const job of [...s.jobs])
            if (job.x === next.x && job.y === next.y) this._cancelJob(job.id);
          e.tunnelProgress = 0;
        }
        return;
      }
      this.move(e, next, speed, dt, { enemy: true });
      return;
    }
    this.move(e, cell(s.queen), speed, dt, { enemy: true });
  },
  _cleanup() {
    const s = this.state;
    for (const b of [...s.buildings]) if (b.hp <= 0) this.destroyBuilding(b.id);
    for (const a of s.ants.filter((a) => a.hp <= 0)) {
      if (a.jobId) {
        const j = s.jobs.find((j) => j.id === a.jobId);
        if (j) j.owner = null;
      }
      if (a.staffOf) {
        const b = s.buildings.find((b) => b.id === a.staffOf);
        if (b) b.staff = b.staff.filter((id) => id !== a.id);
      }
      s.losses++;
      this.record(`losses:${a.staffOf ? "staff" : a.crew}`);
    }
    s.ants = s.ants.filter((a) => a.hp > 0);
    for (const e of s.enemies.filter((e) => e.hp <= 0 && !e.escaped)) {
      this.record(`kills:${e.type}`);
      s.drops.push({
        id: this.id("drop"),
        ...cell(e),
        amount: Math.max(
          1,
          Math.round(ENEMIES[e.type].cost * (0.4 + 0.1 * this.getStats().prey)),
        ),
      });
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
    // A reservation is released only by cancellation. Dead staff must be replaced by rebuilding.
  },
};
