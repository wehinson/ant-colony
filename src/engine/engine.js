import { decodeSave } from "./save.js";
import { createMetrics, metricsSystem } from "./metrics.js";
import { prestigeSystem } from "./systems/prestige.js";
import { defensesSystem } from "./systems/defenses.js";
import { raidsSystem } from "./systems/raids.js";
import { combatSystem } from "./systems/combat.js";
import { SpatialIndex } from "./spatial.js";
import { lineageFor, lineageBoost } from "./lineages.js";
import { foragingSystem } from "./systems/foraging.js";
import { assignmentSystem } from "./systems/assignment.js";
import { roomsSystem } from "./systems/rooms.js";
import { excavationSystem } from "./systems/excavation.js";
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
} from "./catalog.js";
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
} from "./world.js";

const freshMeta = () => ({
  currency: 0,
  upgrades: { foraging: 0, brood: 0, excavation: 0, military: 0, founding: 0 },
  runs: 0,
  bestRaid: 0,
  bestPopulation: 0,
  bestTime: 0,
  awarded: [],
});
const freshState = (seed, meta) => ({
  version: VERSION,
  seed: seed >>> 0 || 1,
  rng: seed >>> 0 || 1,
  raidRng: ((seed >>> 0) ^ 0x9e3779b9) >>> 0,
  id: `colony-${meta.runs + 1}-${seed >>> 0}`,
  meta: structuredClone(meta),
  lineage: { generation: meta.runs },
  metrics: createMetrics(),
  time: 0,
  tick: 0,
  accumulator: 0,
  speed: 1,
  paused: true,
  started: false,
  status: "founding",
  nextId: 1,
  world: {
    seed: seed >>> 0,
    dug: {},
    chunks: {},
    bounds: { minX: -18, maxX: 18, maxY: 18 },
    revision: 0,
  },
  food:
    12 * lineageBoost({ lineage: { generation: meta.runs } }, "founding") +
    12 * meta.upgrades.founding,
  energy:
    70 * lineageBoost({ lineage: { generation: meta.runs } }, "founding") +
    20 * meta.upgrades.founding,
  waste: 0,
  refundFood: 0,
  refundEnergy: 0,
  queen: {
    id: "queen",
    color: lineageFor(meta.runs).color,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    home: { x: -1, y: 3 },
    hp:
      300 *
      (1 + 0.15 * meta.upgrades.military) *
      lineageBoost({ lineage: { generation: meta.runs } }, "military"),
    maxHp:
      300 *
      (1 + 0.15 * meta.upgrades.military) *
      lineageBoost({ lineage: { generation: meta.runs } }, "military"),
    cooldown: 0,
    path: [],
    jobId: null,
    relocation: null,
  },
  ants: [],
  buildings: [],
  jobs: [],
  enemies: [],
  eggs: [],
  drops: [],
  effects: [],
  events: [],
  deliveries: [],
  unlocked: ["queen"],
  research: { carry: 0, speed: 0, armor: 0 },
  peak: 0,
  births: 0,
  losses: 0,
  freeEgg: true,
  eggsPaused: false,
  newCrew: "food",
  shelter: false,
  autoShelter: true,
  rally: null,
  raid: {
    phase: "peace",
    number: 0,
    highest: 0,
    nextAt: 225,
    warning: 50,
    plan: null,
    wave: 0,
    waveAt: 0,
    spawnAt: 0,
    pending: [],
    startedAt: 0,
    lastEnded: 0,
  },
  controllerAt: 0,
  broodAt: 0,
  result: null,
  notice: "",
  noticeUntil: 0,
});

export class ColonyEngine {
  constructor({ seed = 180231, state = null, meta = null } = {}) {
    this.state = state
      ? structuredClone(state)
      : freshState(seed, meta || freshMeta());
    this._routes = new Map();
    this._routeRevision = -1;
    this._presentation = null;
    if (!state) {
      const s = this.state;
      ensureTerrain(s.world, 0, 3);
      this._place("queen", -1, 3);
      // Only the founding queen creates this starting access route. Later blueprints never do.
      const initialJobs = s.jobs.splice(0);
      this._designate(0, 1);
      this._designate(0, 2);
      s.jobs.push(...initialJobs);
      this.log(
        "A new beginning",
        "Your queen is preparing the first chamber. Her first egg is free.",
        "milestone",
      );
    }
  }
  random(stream = "rng") {
    let t = (this.state[stream] += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state[stream] >>>= 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  id(prefix) {
    return `${prefix}-${this.state.nextId++}`;
  }
  log(title, text, kind = "info") {
    const s = this.state;
    s.events.unshift({ id: this.id("event"), time: s.time, title, text, kind });
    s.events.length = Math.min(60, s.events.length);
  }
  notify(message) {
    this.state.notice = message;
    this.state.noticeUntil = this.state.time + 6;
    return { ok: false, message };
  }
  ok(message = "") {
    if (message) {
      this.state.notice = message;
      this.state.noticeUntil = this.state.time + 5;
    }
    this._presentation = null;
    return { ok: true, message };
  }
  getStats() {
    const s = this.state,
      active = s.buildings.filter((b) => b.complete),
      sum = (type) =>
        active.filter((b) => b.type === type).reduce((n, b) => n + b.level, 0);
    const counts = { food: 0, dig: 0, warrior: 0 },
      pending = { food: 0, dig: 0, warrior: 0 };
    for (const a of s.ants) {
      if (!a.staffOf) counts[a.crew]++;
      if (a.pendingCrew) pending[a.pendingCrew]++;
    }
    const committed = s.ants.filter((a) => a.staffOf).length;
    const foodCap =
      30 * lineageBoost(s, "founding") +
      15 * s.meta.upgrades.founding +
      sum("storage") * 90;
    const energyCap =
      70 * lineageBoost(s, "founding") +
      s.meta.upgrades.founding * 20 +
      sum("quarters") * 55;
    const recovery =
      0.5 +
      (s.food > 0 ? 0.35 : 0) +
      sum("quarters") * 1.2 +
      s.meta.upgrades.excavation * 0.15 +
      (lineageBoost(s, "excavation") - 1) * 0.85;
    const efficiency = clamp(1 - Math.max(0, s.waste - 30) / 550, 0.45, 1);
    const slots = sum("queen") + sum("brood") * 2;
    const mobileCap = 2 + sum("barracks") * 8 + s.meta.upgrades.military * 2;
    const carry =
      (6 + s.research.carry * 2) *
      (1 + 0.15 * s.meta.upgrades.foraging) *
      lineageBoost(s, "foraging");
    const income =
      (s.deliveries.reduce((n, d) => n + d.amount, 0) /
        Math.max(1, Math.min(60, s.time))) *
      60;
    const eggCost = Math.max(
      2,
      5 / ((1 + 0.08 * s.meta.upgrades.brood) * lineageBoost(s, "brood")),
    );
    const eggDuration =
      20 / ((1 + 0.12 * s.meta.upgrades.brood) * lineageBoost(s, "brood"));
    return {
      counts,
      pending,
      committed,
      population: s.ants.length,
      foodCap,
      energyCap,
      recovery,
      efficiency,
      slots,
      mobileCap,
      carry,
      income,
      eggCost,
      eggDuration,
      wasteRate: 0.05 + sum("waste") * 1.8,
      prey: sum("prey"),
      active,
    };
  }
  unlocked(type) {
    if (!Object.hasOwn(BUILDINGS, type)) return false;
    const d = BUILDINGS[type];
    return d.branch === "military"
      ? this.state.unlocked.includes("brood")
      : this.state.unlocked.includes(type);
  }
  command(c) {
    const result = this._command(c);
    const s = this.state;
    this.record(result.ok ? "ordersAccepted" : "ordersRejected");
    s.metrics.commands.push({
      time: s.time,
      type: String(c?.type || "invalid").slice(0, 40),
      ok: result.ok,
      message: result.message,
    });
    if (s.metrics.commands.length > 256) s.metrics.commands.shift();
    return result;
  }
  _command(c) {
    if (!c || typeof c.type !== "string")
      return this.notify("Invalid command.");
    const s = this.state;
    if (c.type === "pause") {
      if (c.value !== undefined && typeof c.value !== "boolean")
        return this.notify("Pause needs an on or off value.");
      s.paused = c.value ?? !s.paused;
      s.accumulator = 0;
      return this.ok();
    }
    if (c.type === "start") {
      s.started = true;
      s.paused = false;
      return this.ok();
    }
    if (c.type === "speed") {
      if (![1, 2, 4].includes(c.value))
        return this.notify("Choose 1×, 2× or 4× speed.");
      s.speed = c.value;
      return this.ok();
    }
    if (c.type === "prestige") return this._buyPrestige(c.branch);
    if (c.type === "newRun") {
      if (s.status !== "defeat")
        return this.notify("The current colony is still alive.");
      const meta = s.meta,
        seed = Number.isSafeInteger(c.seed)
          ? c.seed
          : Math.floor(this.random() * 4294967295);
      const next = new ColonyEngine({ seed, meta });
      this.state = next.state;
      this._routes.clear();
      this.state.started = true;
      this.state.paused = false;
      return this.ok();
    }
    if (s.status === "defeat")
      return this.notify("Start a new colony to continue.");
    if (
      ["eggs", "shelter", "autoShelter"].includes(c.type) &&
      c.value !== undefined &&
      typeof c.value !== "boolean"
    )
      return this.notify("This control needs an on or off value.");
    switch (c.type) {
      case "dig": {
        const { x, y } = c;
        if (!validTile(x, y) || y < 1)
          return this.notify("Only underground dirt can be excavated.");
        const existing = s.jobs.find((j) => j.x === x && j.y === y);
        if (existing && c.mode !== "add") {
          if (
            s.status === "founding" &&
            (existing.blueprint ===
              s.buildings.find((b) => b.type === "queen")?.id ||
              (x === 0 && y <= 2))
          )
            return this.notify(
              "The queen needs this tile to found the colony.",
            );
          this._cancelJob(existing.id);
          return this.ok("Excavation order canceled.");
        }
        if (c.mode === "remove") return this.ok();
        if (isOpen(s.world, x, y))
          return this.notify("This tile is already excavated.");
        this._designate(x, y);
        return this.ok();
      }
      case "build": {
        const p = this.preview(c.building, c.x, c.y);
        if (!p.valid) return this.notify(p.reason);
        this._place(c.building, c.x, c.y);
        return this.ok(
          p.connected
            ? "Blueprint placed. Resources reserved."
            : "Blueprint placed. Needs tunnel connection.",
        );
      }
      case "cancel":
        return this._cancelBlueprint(c.id);
      case "restaff":
        return this._restaff(c.id);
      case "upgrade":
        return this._upgrade(c.id);
      case "research":
        return this._research(c.key);
      case "assign":
        return this._assign(c.crew, c.delta);
      case "newCrew":
        if (!CREWS.includes(c.crew)) return this.notify("Choose a valid crew.");
        s.newCrew = c.crew;
        return this.ok();
      case "eggs":
        s.eggsPaused = c.value ?? !s.eggsPaused;
        return this.ok();
      case "shelter":
        s.shelter = c.value ?? !s.shelter;
        return this.ok(
          s.shelter
            ? "Workers are returning to shelter."
            : "Emergency shelter released.",
        );
      case "autoShelter":
        s.autoShelter = c.value ?? !s.autoShelter;
        return this.ok();
      case "rally":
        if (
          !Number.isSafeInteger(c.x) ||
          !Number.isSafeInteger(c.y) ||
          !isOpen(s.world, c.x, c.y)
        )
          return this.notify("Choose an open tile for the rally point.");
        s.rally = { x: c.x, y: c.y };
        return this.ok("Rally point set. The hive keeps a queen reserve.");
      case "relocate": {
        if (s.status === "founding")
          return this.notify("Finish founding first.");
        const p = this.preview("queen", c.x, c.y, true);
        if (!p.valid) return this.notify(p.reason);
        const b = s.buildings.find((b) => b.type === "queen");
        if (!b?.complete)
          return this.notify("Rebuild the Queen’s Chamber first.");
        s.queen.relocation = { x: c.x, y: c.y, buildingId: b.id };
        s.queen.path = [];
        return this.ok(
          "The queen is moving with her brood. Raid timing continues.",
        );
      }
      case "repair": {
        const b = s.buildings.find((b) => b.id === c.id && b.complete);
        if (!b) return this.notify("Choose a completed structure.");
        b.repair = !b.repair;
        return this.ok(
          b.repair
            ? "Dig crew will repair this when it is safe."
            : "Repairs paused for this structure.",
        );
      }
      default:
        return this.notify("Unknown command.");
    }
  }
  _research(name) {
    const s = this.state,
      d = RESEARCH[name];
    if (!Object.hasOwn(RESEARCH, name))
      return this.notify("Choose a valid improvement.");
    const cost = Math.ceil(d.base * 1.7 ** s.research[name]);
    if (s.food < cost) return this.notify(`Needs ${cost} food.`);
    if (s.pendingResearch) return this.notify("Another improvement is queued.");
    s.food -= cost;
    this.record("foodSpentResearch", cost);
    s.pendingResearch = name;
    return this.ok("Colony improvement queued.");
  }
  route(a, b, options = {}) {
    const s = this.state;
    if (this._routeRevision !== s.world.revision) {
      this._routes.clear();
      this._routeRevision = s.world.revision;
    }
    if (options.danger || options.avoidBarriers)
      return pathfind(s, a, b, options);
    const aa = cell(a),
      bb = cell(b),
      k = `${aa.x},${aa.y}:${bb.x},${bb.y}`;
    if (!this._routes.has(k)) {
      if (this._routes.size > 6000) this._routes.clear();
      this._routes.set(k, pathfind(s, aa, bb));
    }
    const route = this._routes.get(k);
    return route === null ? null : route.map((p) => ({ ...p }));
  }
  move(a, target, speed, dt, options = {}) {
    if (distance(a, target) < 0.06) {
      a.path = [];
      return true;
    }
    const targetCell = cell(target),
      signature = key(targetCell.x, targetCell.y);
    const unsafe = a.path?.some(
      (p) =>
        (options.avoidBarriers && blockedAt(this.state, p.x, p.y)) ||
        (options.danger && this.near("enemies", p, 1.5).some((e) => e.hp > 0)),
    );
    if (
      unsafe ||
      a.routeTarget !== signature ||
      a.routeRevision !== this.state.world.revision ||
      !a.path?.length
    ) {
      a.path = this.route(a, targetCell, options) || [];
      a.routeTarget = signature;
      a.routeRevision = this.state.world.revision;
      if (a.path.length && distance(a, cell(a)) > 0.05) a.path.unshift(cell(a));
      if (!a.path.length && distance(a, targetCell) > 0.8) return false;
    }
    let remaining = speed * dt;
    while (remaining > 0 && a.path.length) {
      const next = a.path[0];
      const d = distance(a, next);
      if (options.enemy) {
        const barrier = blockedAt(this.state, next.x, next.y);
        if (barrier) {
          a.blockedBy = barrier.id;
          return false;
        }
      }
      if (d <= remaining) {
        a.x = next.x;
        a.y = next.y;
        a.path.shift();
        remaining -= d;
      } else {
        a.x += ((next.x - a.x) / d) * remaining;
        a.y += ((next.y - a.y) / d) * remaining;
        remaining = 0;
      }
    }
    if (!a.path.length && distance(a, targetCell) < 0.06) return true;
    return false;
  }
  advance(seconds, { exact = false } = {}) {
    const s = this.state;
    if (
      s.paused ||
      s.status === "defeat" ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return;
    s.accumulator += exact ? seconds : Math.min(seconds, 0.25) * s.speed;
    let steps = Math.floor((s.accumulator + 1e-9) / STEP);
    s.accumulator = Math.max(0, s.accumulator - steps * STEP);
    while (steps-- > 0 && s.status !== "defeat") this.step(STEP);
  }
  step(dt = STEP) {
    const s = this.state;
    if (s.paused || s.status === "defeat") return;
    s.tick++;
    s.time = s.tick * STEP;
    this._frontage = new Map();
    for (const a of [s.queen, ...s.ants, ...s.enemies]) {
      a.previousX = a.x;
      a.previousY = a.y;
      a.cooldown = Math.max(0, a.cooldown - dt);
    }
    let st = this.getStats();
    const refundFood = Math.min(s.refundFood, Math.max(0, st.foodCap - s.food)),
      refundEnergy = Math.min(
        s.refundEnergy,
        Math.max(0, st.energyCap - s.energy),
      );
    s.food += refundFood;
    s.refundFood -= refundFood;
    s.energy += refundEnergy;
    s.refundEnergy -= refundEnergy;
    s.energy = Math.min(st.energyCap, s.energy + st.recovery * dt);
    s.waste = Math.max(
      0,
      s.waste +
        (s.ants.length * 0.018 + s.eggs.length * 0.035 - st.wasteRate) * dt,
    );
    s.effects = s.effects.filter((e) => s.time - e.at < e.duration);
    s.deliveries = s.deliveries.filter((d) => s.time - d.at < 60);
    if (s.pendingResearch) {
      const name = s.pendingResearch;
      s.research[name]++;
      delete s.pendingResearch;
      if (name === "armor")
        for (const a of s.ants.filter((a) => a.crew === "warrior")) {
          a.maxHp = this.antMaxHp("warrior");
        }
      this.log("Colony improved", RESEARCH[name].name);
    }
    this._buildings(dt);
    st = this.getStats();
    this._queen(dt, st);
    this._brood(dt, st);
    this._raids(dt);
    if (this.useSpatial !== false && s.enemies.length && s.ants.length > 32)
      this._spatial = {
        ants: new SpatialIndex(s.ants),
        enemies: new SpatialIndex(s.enemies),
      };
    if (s.time >= s.controllerAt) {
      this._controlArmy();
      s.controllerAt = s.time + 0.75;
    }
    for (const a of [...s.ants])
      if (a.hp > 0) {
        this._ant(a, dt, st);
        this._spatial?.ants.update(a);
      }
    this._defenses(dt);
    for (const e of [...s.enemies])
      if (e.hp > 0) {
        this._enemy(e, dt);
        this._spatial?.enemies.update(e);
      }
    this._spatial = null;
    this._cleanup();
    if (s.queen.hp <= 0) this._defeat();
    if (s.status !== "defeat" && s.raid.phase === "peace") {
      s.queen.hp = Math.min(s.queen.maxHp, s.queen.hp + dt * 0.4);
      for (const a of s.ants) a.hp = Math.min(a.maxHp, a.hp + dt * 0.65);
    }
    s.peak = Math.max(s.peak, s.ants.length);
    this.observe(dt);
    this._presentation = null;
  }
  near(kind, point, radius) {
    return (
      this._spatial?.[kind].query(point, radius) ||
      this.state[kind].filter((a) => distance(a, point) <= radius)
    );
  }
  effect(type, a, b, color, duration = 0.3) {
    this.state.effects.push({
      id: this.id("fx"),
      type,
      x: a.x,
      y: a.y,
      tx: b.x,
      ty: b.y,
      color,
      at: this.state.time,
      duration,
    });
    if (this.state.effects.length > 160) this.state.effects.shift();
  }
  serialize() {
    return JSON.stringify({
      format: "ant-colony",
      version: VERSION,
      state: this.state,
    });
  }
  static deserialize(text) {
    return new ColonyEngine({ state: decodeSave(text) });
  }
}

Object.assign(ColonyEngine.prototype, excavationSystem);

Object.assign(ColonyEngine.prototype, roomsSystem);

Object.assign(ColonyEngine.prototype, assignmentSystem);

Object.assign(ColonyEngine.prototype, foragingSystem);

Object.assign(ColonyEngine.prototype, combatSystem);

Object.assign(ColonyEngine.prototype, raidsSystem);

Object.assign(ColonyEngine.prototype, defensesSystem);

Object.assign(ColonyEngine.prototype, prestigeSystem);
Object.assign(ColonyEngine.prototype, metricsSystem);
