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
  pathDistance,
  connected,
  lineOfSight,
} from "../world.js";

// Engine subsystem; methods share the colony state and headless services.
export const foragingSystem = {
  _forage(a, dt, st) {
    const s = this.state;
    if (a.phase === "forage") {
      if (s.time < a.forageUntil) return;
      a.cargo =
        st.carry * (1 + Math.min(0.1, Math.max(0, st.counts.food - 1) * 0.005));
      a.phase = "inbound";
      a.path = [];
    }
    if (a.phase === "inbound" || a.phase === "cargo") {
      const entry = a.trip?.entry || entrances(s.world)[0];
      if (!entry) return;
      // Try another entrance if the preferred return route has an enemy on it.
      if (s.enemies.length && !this.route(a, entry, { danger: true })) {
        const alternative = entrances(s.world).find((p) =>
          this.route(a, p, { danger: true }),
        );
        if (alternative) {
          a.trip ??= { entry: alternative, destination: alternative };
          a.trip.entry = alternative;
          a.path = [];
          return;
        }
        const threat = s.enemies.find(
          (e) => distance(e, a) < 1 && lineOfSight(s.world, a, e),
        );
        const retreat =
          threat &&
          neighbors(cell(a)).find(
            (p) =>
              isOpen(s.world, p.x, p.y) &&
              distance(p, threat) > distance(a, threat) + 0.4,
          );
        if (retreat) this.move(a, retreat, this.workerSpeed() * 1.2, dt);
        else if (threat && a.cooldown === 0) {
          this.hit(threat, 2, a, "civilian");
          a.cooldown = 1.4;
        }
        return;
      }
      if (
        this.move(a, entry, this.workerSpeed(), dt, {
          danger: !!s.enemies.length,
        })
      ) {
        const amount = Math.min(a.cargo, Math.max(0, st.foodCap - s.food));
        if (amount > 0) {
          s.food += amount;
          a.cargo -= amount;
          s.deliveries.push({ at: s.time, amount });
          this.effect("food", a, a, "#8b9e53", 1);
        }
        if (a.cargo > 0.001) {
          a.phase = "cargo";
          return;
        }
        a.cargo = 0;
        a.phase = "idle";
        a.trip = null;
        if (a.pendingCrew) this._setCrew(a, a.pendingCrew);
      }
      return;
    }
    if (a.phase === "outbound") {
      if (a.pendingCrew || this.sheltered()) {
        a.phase = "inbound";
        a.path = [];
        return;
      }
      if (this.move(a, a.trip.destination, this.workerSpeed(), dt)) {
        a.phase = "forage";
        a.forageUntil = s.time + 5 / st.efficiency;
        a.path = [];
      }
      return;
    }
    if (this.sheltered() || s.food >= st.foodCap - 0.01) {
      a.phase = "idle";
      return;
    }
    const openings = entrances(s.world)
      .map((p) => ({ p, path: this.route(a, p) }))
      .filter((o) => o.path !== null)
      .sort(
        (left, right) =>
          pathDistance(a, left.path) - pathDistance(a, right.path),
      );
    if (!openings.length) return;
    const entry = openings[0].p,
      side = this.random() > 0.5 ? 1 : -1;
    // Trip endpoints are simulation locations. Camera movement never changes them.
    const xs = entrances(s.world).map((p) => p.x);
    const destination = {
      x: (side < 0 ? Math.min(...xs) : Math.max(...xs)) + side * 13,
      y: 0,
    };
    a.trip = { entry, destination };
    a.phase = "outbound";
    a.path = [];
  },
  _repairOrSalvage(a, dt) {
    const s = this.state;
    const b =
      s.food > 0.12 &&
      s.energy > 0.3 &&
      s.buildings.find(
        (b) =>
          b.complete &&
          b.repair &&
          b.hp < b.maxHp - 0.1 &&
          s.time - b.lastDamage >= 6 &&
          this.route(a, { x: b.x, y: b.y }),
      );
    if (b) {
      a.task = "repair";
      if (this.move(a, { x: b.x, y: b.y }, this.workerSpeed(), dt)) {
        const hp = Math.min(
          9 * dt,
          b.maxHp - b.hp,
          s.food / 0.12,
          s.energy / 0.3,
        );
        b.hp += hp;
        s.food = Math.max(0, s.food - hp * 0.12);
        s.energy = Math.max(0, s.energy - hp * 0.3);
      }
      return;
    }
    const drop = s.drops.find((d) => !d.captureTarget && this.route(a, d));
    if (drop) {
      a.task = "salvage";
      if (this.move(a, drop, this.workerSpeed(), dt)) {
        const amount = Math.min(
          drop.amount,
          Math.max(0, this.getStats().foodCap - s.food),
        );
        s.food += amount;
        drop.amount -= amount;
        if (drop.amount < 0.01)
          s.drops = s.drops.filter((d) => d.id !== drop.id);
      }
      return;
    }
    a.task = "idle";
  },
};
