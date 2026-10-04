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
export const roomsSystem = {
  preview(type, x, y, relocate = false) {
    const s = this.state,
      d = BUILDINGS[type];
    if (!Object.hasOwn(BUILDINGS, type) || !validTile(x, y))
      return { valid: false, reason: "Choose a valid grid tile.", tiles: [] };
    const tiles = footprint(type, x, y),
      buried = tiles.filter((p) => !isOpen(s.world, p.x, p.y)).length;
    let reason = "";
    if (s.status === "defeat") reason = "This colony has ended.";
    else if (!this.unlocked(type))
      reason = "Complete the preceding chamber to unlock this.";
    else if (d.surface ? y !== 0 : y < 1)
      reason = d.surface
        ? "Place this on the surface row."
        : "Place this underground.";
    else if (tiles.some((p) => buildingAt(s, p.x, p.y)))
      reason = "This footprint overlaps another structure.";
    else if (
      s.queen.relocation &&
      tiles.some((p) =>
        footprint("queen", s.queen.relocation.x, s.queen.relocation.y).some(
          (q) => q.x === p.x && q.y === p.y,
        ),
      )
    )
      reason = "This space is reserved for the moving queen.";
    else if (
      type === "queen" &&
      s.buildings.some((b) => b.type === "queen") &&
      !relocate
    )
      reason = "There is only one Queen’s Chamber. Use Relocate.";
    else if (
      type === "queen" &&
      s.status !== "founding" &&
      !relocate &&
      (x !== s.queen.home.x || y !== s.queen.home.y)
    )
      reason =
        "Rebuild the queen’s former chamber here first, then use Relocate between raids.";
    else if (
      relocate &&
      (s.raid.phase !== "peace" || s.time >= s.raid.nextAt - s.raid.warning)
    )
      reason = "The queen can move only between raids and warnings.";
    else if (relocate && s.queen.relocation)
      reason = "The queen is already moving.";
    else if (relocate && buried)
      reason = "Excavate the entire destination first.";
    const hasConnection = tiles.some(
      (p) =>
        (isOpen(s.world, p.x, p.y) && this.route(p, { x: 0, y: 0 }) !== null) ||
        neighbors(p).some(
          (n) =>
            isOpen(s.world, n.x, n.y) && this.route(n, { x: 0, y: 0 }) !== null,
        ),
    );
    if (
      !reason &&
      relocate &&
      (!hasConnection || !this.route(s.queen, { x, y }))
    )
      reason = "Needs a prepared, connected route.";
    const available = s.ants.filter(
      (a) =>
        a.crew === "warrior" &&
        !a.staffOf &&
        !a.pendingCrew &&
        a.phase !== "forage",
    ).length;
    const food = relocate
        ? 0
        : type === "queen" && s.status !== "founding"
          ? 24
          : d.food,
      energy = relocate ? 0 : d.energy,
      staff = relocate ? 0 : d.staff;
    if (!reason && s.food < food) reason = `Needs ${food} food.`;
    if (!reason && s.energy < energy) reason = `Needs ${energy} energy.`;
    if (!reason && available < staff)
      reason = `Needs ${staff} available warriors (${available} available).`;
    return {
      valid: !reason,
      reason,
      tiles,
      buried,
      connected: hasConnection,
      connection: hasConnection
        ? `${buried} tiles to excavate`
        : "Needs tunnel connection",
      food,
      energy,
      staff,
      type,
      x,
      y,
      relocate,
    };
  },
  _place(type, x, y) {
    const s = this.state,
      d = BUILDINGS[type],
      id = this.id("building");
    const foodCost = type === "queen" && s.status !== "founding" ? 24 : d.food;
    s.food -= foodCost;
    s.energy -= d.energy;
    const staff = s.ants
      .filter((a) => a.crew === "warrior" && !a.staffOf && !a.pendingCrew)
      .slice(0, d.staff);
    for (const a of staff) {
      a.staffOf = id;
      a.phase = "staff";
      a.path = [];
      a.target = null;
    }
    const maxHp =
      d.hp *
      (d.branch === "military" ? 1 + s.meta.upgrades.military * 0.15 : 1);
    const b = {
      id,
      type,
      x,
      y,
      complete: false,
      level: 1,
      hp: maxHp,
      maxHp,
      staff: staff.map((a) => a.id),
      reservedFood: foodCost,
      reservedEnergy: d.energy,
      cooldown: 0,
      lastDamage: -100,
      repair: true,
      captureAt: s.time + 26,
      captures: 0,
    };
    s.buildings.push(b);
    for (const p of footprint(type, x, y)) this._designate(p.x, p.y, id);
    ensureTerrain(s.world, x, y);
    return b;
  },
  _cancelBlueprint(id) {
    const s = this.state,
      b = s.buildings.find((b) => b.id === id);
    if (!b || b.complete)
      return this.notify("Only unfinished blueprints can be canceled.");
    if (b.type === "queen" && s.status === "founding")
      return this.notify(
        "The founding chamber is needed for your first worker.",
      );
    const stats = this.getStats();
    s.refundFood += Math.max(0, s.food + b.reservedFood - stats.foodCap);
    s.food = Math.min(stats.foodCap, s.food + b.reservedFood);
    s.refundEnergy += Math.max(
      0,
      s.energy + b.reservedEnergy - stats.energyCap,
    );
    s.energy = Math.min(stats.energyCap, s.energy + b.reservedEnergy);
    for (const id of b.staff) {
      const a = s.ants.find((a) => a.id === id);
      if (a) {
        a.staffOf = null;
        a.phase = "idle";
        a.path = [];
      }
    }
    for (const j of [...s.jobs])
      if (j.blueprint === b.id) this._cancelJob(j.id);
    s.buildings = s.buildings.filter((other) => other.id !== id);
    return this.ok(
      "Blueprint canceled. Reserved resources refunded; excavated tiles remain.",
    );
  },
  upgradeCost(b) {
    const d = BUILDINGS[b.type];
    return b.upgrading
      ? {
          food: 0,
          energy: 0,
          staff: Math.max(
            0,
            (b.upgradeStaffRequired || b.staff.length) - b.staff.length,
          ),
        }
      : {
          food: Math.ceil(Math.max(20, d.food * 0.7) * 1.65 ** (b.level - 1)),
          staff: d.staff ? Math.max(1, Math.ceil(d.staff / 3)) : 0,
          energy: d.energy ? Math.ceil(d.energy / 2) : 0,
        };
  },
  _upgrade(id) {
    const s = this.state,
      b = s.buildings.find((b) => b.id === id && b.complete);
    if (!b) return this.notify("Complete the structure before upgrading it.");
    const cost = this.upgradeCost(b),
      staff = s.ants.filter(
        (a) => a.crew === "warrior" && !a.staffOf && !a.pendingCrew,
      );
    if (
      s.food < cost.food ||
      s.energy < cost.energy ||
      staff.length < cost.staff
    )
      return this.notify(
        `Upgrade needs ${cost.food} food, ${cost.energy} energy and ${cost.staff} warriors.`,
      );
    if (s.time - b.lastDamage < 5)
      return this.notify("This structure is under attack.");
    // Payment and orders may be queued while paused; completion waits for a simulation step.
    if (b.upgrading && cost.staff === 0)
      return this.notify("An upgrade is already queued.");
    s.food -= cost.food;
    s.energy -= cost.energy;
    for (const a of staff.slice(0, cost.staff)) {
      a.staffOf = b.id;
      a.phase = "staff";
      a.path = [];
      b.staff.push(a.id);
    }
    b.upgradeStaffRequired = b.staff.length;
    b.upgrading = true;
    return this.ok("Upgrade queued. Additional staff are on their way.");
  },
  _buildings(dt) {
    const s = this.state;
    for (const b of s.buildings) {
      const d = BUILDINGS[b.type];
      if (
        !b.complete &&
        connected(s, b) &&
        b.staff.every((id) => {
          const a = s.ants.find((a) => a.id === id);
          return a && distance(a, { x: b.x, y: b.y }) < 0.8;
        }) &&
        b.staff.length >= d.staff
      ) {
        b.complete = true;
        const index = ECONOMIC.indexOf(b.type);
        if (
          index >= 0 &&
          index < ECONOMIC.length - 1 &&
          !s.unlocked.includes(ECONOMIC[index + 1])
        ) {
          s.unlocked.push(ECONOMIC[index + 1]);
          this.log(
            "A new possibility",
            `${d.name} complete. ${BUILDINGS[ECONOMIC[index + 1]].name} unlocked.`,
            "milestone",
          );
        } else this.log("Room to grow", `${d.name} is ready.`);
        if (b.type === "queen" && s.status === "founding") {
          s.status = "active";
          s.queen.jobId = null;
          for (const j of s.jobs) if (j.owner === "queen") j.owner = null;
        }
      }
      if (
        b.complete &&
        b.upgrading &&
        s.time - b.lastDamage >= 6 &&
        b.staff.length >= (b.upgradeStaffRequired || 0) &&
        b.staff.every((id) => {
          const a = s.ants.find((a) => a.id === id);
          return a && distance(a, { x: b.x, y: b.y }) < 1.5;
        })
      ) {
        b.level++;
        b.maxHp *= 1.3;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.3);
        b.upgrading = false;
        this.log(
          "Stronger foundations",
          `${d.name} upgraded to level ${b.level}.`,
        );
      }
      if (b.complete && b.type === "prey" && s.time >= b.captureAt) {
        b.captureAt = s.time + 26 / b.level;
        const opening = entrances(s.world).find((p) =>
          this.route(p, { x: b.x, y: b.y }),
        );
        if (opening) {
          s.drops.push({
            id: this.id("prey"),
            x: opening.x,
            y: 0,
            amount: 3,
            captureTarget: b.id,
            path: [],
            previousX: opening.x,
            previousY: 0,
          });
          b.captures++;
          this.effect("capture", opening, center(b), "#a8b368", 1.3);
        }
      }
    }
    for (const drop of [...s.drops])
      if (drop.captureTarget) {
        const b = s.buildings.find(
          (b) => b.id === drop.captureTarget && b.complete,
        );
        if (!b) {
          delete drop.captureTarget;
          continue;
        }
        drop.previousX = drop.x;
        drop.previousY = drop.y;
        if (
          this.move(drop, { x: b.x, y: b.y }, 1.2, dt, { avoidBarriers: true })
        ) {
          const amount = Math.min(
            drop.amount,
            Math.max(0, this.getStats().foodCap - s.food),
          );
          s.food += amount;
          drop.amount -= amount;
          if (drop.amount < 0.001)
            s.drops = s.drops.filter((d) => d.id !== drop.id);
          if (amount > 0)
            this.effect("food", center(b), center(b), "#8c9c45", 1.6);
        }
      }
  },
  _queen(dt, st) {
    const s = this.state,
      q = s.queen;
    if (s.status === "founding") {
      this._dig(q, dt, st, true);
      return;
    }
    if (
      q.relocation &&
      (s.raid.phase !== "peace" || s.time >= s.raid.nextAt - s.raid.warning)
    ) {
      q.relocation = null;
      q.path = [];
      this.log(
        "Relocation canceled",
        "Raid warning: the queen returns to her chamber.",
        "warning",
      );
    }
    const b = s.buildings.find((b) => b.type === "queen" && b.complete);
    if (q.relocation) {
      const p = q.relocation;
      if (this.move(q, p, 0.7, dt)) {
        if (b) {
          b.x = p.x;
          b.y = p.y;
          q.home = { x: p.x, y: p.y };
          s.world.revision++;
        }
        q.relocation = null;
        this.log(
          "A new heart",
          "The queen and her brood reached their new chamber.",
          "milestone",
        );
      }
    } else if (b) this.move(q, { x: b.x + 1, y: b.y + 1 }, 0.7, dt);
    const e = s.enemies.find(
      (e) => e.hp > 0 && distance(e, q) <= 1.2 && lineOfSight(s.world, q, e),
    );
    if (e && q.cooldown === 0) {
      this.hit(e, 11 * (1 + s.meta.upgrades.military * 0.15), q, "queen");
      q.cooldown = 1.1;
    }
  },
  _brood(dt, st) {
    const s = this.state;
    for (const egg of [...s.eggs]) {
      egg.progress += (dt * st.efficiency) / st.eggDuration;
      if (egg.progress >= 1) {
        this._hatch(egg);
        s.eggs = s.eggs.filter((e) => e.id !== egg.id);
      }
    }
    if (s.eggsPaused || s.status === "founding" || s.queen.relocation) return;
    for (const b of st.active.filter(
      (b) => b.type === "queen" || b.type === "brood",
    )) {
      const slots = b.level * (b.type === "brood" ? 2 : 1);
      let used = s.eggs.filter((e) => e.buildingId === b.id).length;
      while (used < slots && (s.freeEgg || s.food >= st.eggCost)) {
        if (!s.freeEgg) s.food -= st.eggCost;
        s.freeEgg = false;
        s.eggs.push({ id: this.id("egg"), buildingId: b.id, progress: 0 });
        used++;
      }
    }
  },
};
