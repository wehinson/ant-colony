import { BUILDINGS, ENEMIES, center, distance } from "../catalog.js";
import { lineOfSight } from "../world.js";
// Engine subsystem; methods share the colony state and headless services.
export const defensesSystem = {
  _restaff(id) {
    const s = this.state,
      b = s.buildings.find((b) => b.id === id);
    if (!b || b.complete)
      return this.notify("Choose an unfinished staffed post.");
    const missing = Math.max(0, BUILDINGS[b.type].staff - b.staff.length);
    if (!missing) return this.notify("This blueprint already has its staff.");
    const staff = s.ants.filter(
      (a) => a.crew === "warrior" && !a.staffOf && !a.pendingCrew,
    );
    if (staff.length < missing)
      return this.notify(`Needs ${missing} replacement warriors.`);
    for (const a of staff.slice(0, missing)) {
      a.staffOf = b.id;
      a.phase = "staff";
      a.path = [];
      a.target = null;
      b.staff.push(a.id);
    }
    return this.ok(
      "Replacement staff are on their way. The food cost is already reserved.",
    );
  },
  _defenses(dt) {
    const s = this.state;
    for (const b of s.buildings.filter((b) => b.complete && b.hp > 0)) {
      const d = BUILDINGS[b.type];
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (!d.range || b.cooldown > 0) continue;
      const p = center(b),
        targets = this.near("enemies", p, d.range)
          .filter(
            (e) =>
              e.hp > 0 &&
              distance(p, e) <= d.range &&
              (!ENEMIES[e.type].flying || e.y >= 0 || d.flying) &&
              lineOfSight(s.world, p, e),
          )
          .sort((a, b) => distance(a, s.queen) - distance(b, s.queen));
      if (!targets.length) continue;
      b.cooldown = d.cooldown / (1 + (b.level - 1) * 0.08);
      const affected = d.splash
        ? targets.filter((e) => distance(e, targets[0]) < d.splash)
        : [targets[0]];
      for (const e of affected) {
        if (d.slow) e.slowUntil = s.time + 5;
        else
          this.hit(
            e,
            d.damage *
              (1 + (b.level - 1) * 0.35 + s.meta.upgrades.military * 0.15),
            p,
            d.name,
          );
      }
      this.effect(
        d.splash ? "spray" : d.slow ? "snare" : "shot",
        p,
        targets[0],
        d.color,
        d.splash ? 0.6 : 0.25,
      );
    }
  },
  destroyBuilding(id) {
    const s = this.state,
      b = s.buildings.find((b) => b.id === id);
    if (!b) return;
    this.record(`destroyed:${b.type}`);
    for (const a of s.ants) if (a.staffOf === id) a.hp = 0;
    s.eggs = s.eggs.filter((e) => e.buildingId !== id);
    s.buildings = s.buildings.filter((o) => o.id !== id);
    for (const j of [...s.jobs]) if (j.blueprint === id) this._cancelJob(j.id);
    s.world.revision++;
    const st = this.getStats();
    this.record("foodLostWithStorage", Math.max(0, s.food - st.foodCap));
    s.food = Math.min(s.food, st.foodCap);
    s.energy = Math.min(s.energy, st.energyCap);
    if (s.queen.relocation?.buildingId === id) s.queen.relocation = null;
    this.log(
      "Structure lost",
      `${BUILDINGS[b.type].name} was destroyed. Its tunnels remain.`,
      "danger",
    );
  },
};
