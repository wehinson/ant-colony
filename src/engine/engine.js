import { raidsSystem } from "./systems/raids.js";
import { combatSystem } from "./systems/combat.js";
import { SpatialIndex } from "./spatial.js";
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
  food: 12 + 12 * meta.upgrades.founding,
  energy: 70 + 20 * meta.upgrades.founding,
  waste: 0,
  refundFood: 0,
  refundEnergy: 0,
  queen: {
    id: "queen",
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    home: { x: -1, y: 3 },
    hp: 300 * (1 + 0.15 * meta.upgrades.military),
    maxHp: 300 * (1 + 0.15 * meta.upgrades.military),
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
    const foodCap = 30 + 15 * s.meta.upgrades.founding + sum("storage") * 90;
    const energyCap = 70 + s.meta.upgrades.founding * 20 + sum("quarters") * 55;
    const recovery =
      0.5 +
      (s.food > 0 ? 0.35 : 0) +
      sum("quarters") * 1.2 +
      s.meta.upgrades.excavation * 0.15;
    const efficiency = clamp(1 - Math.max(0, s.waste - 30) / 550, 0.45, 1);
    const slots = sum("queen") + sum("brood") * 2;
    const mobileCap = 2 + sum("barracks") * 8 + s.meta.upgrades.military * 2;
    const carry =
      (6 + s.research.carry * 2) * (1 + 0.15 * s.meta.upgrades.foraging);
    const income =
      (s.deliveries.reduce((n, d) => n + d.amount, 0) /
        Math.max(1, Math.min(60, s.time))) *
      60;
    const eggCost = Math.max(2, 5 / (1 + 0.08 * s.meta.upgrades.brood));
    const eggDuration = 20 / (1 + 0.12 * s.meta.upgrades.brood);
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
    if (this.useSpatial !== false)
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
  _defenses(dt) {
    const s = this.state;
    for (const b of s.buildings.filter((b) => b.complete)) {
      const d = BUILDINGS[b.type];
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (!d.range || b.cooldown > 0) continue;
      const p = center(b),
        targets = s.enemies
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
  }
  destroyBuilding(id) {
    const s = this.state,
      b = s.buildings.find((b) => b.id === id);
    if (!b) return;
    for (const a of s.ants) if (a.staffOf === id) a.hp = 0;
    s.eggs = s.eggs.filter((e) => e.buildingId !== id);
    s.buildings = s.buildings.filter((o) => o.id !== id);
    for (const j of [...s.jobs]) if (j.blueprint === id) this._cancelJob(j.id);
    s.world.revision++;
    const st = this.getStats();
    s.food = Math.min(s.food, st.foodCap);
    s.energy = Math.min(s.energy, st.energyCap);
    if (s.queen.relocation?.buildingId === id) s.queen.relocation = null;
    this.log(
      "Structure lost",
      `${BUILDINGS[b.type].name} was destroyed. Its tunnels remain.`,
      "danger",
    );
  }
  prestigeAward() {
    const s = this.state;
    return Math.max(1, s.raid.highest * 4 + Math.floor(Math.sqrt(s.peak)));
  }
  _defeat() {
    const s = this.state;
    if (s.status === "defeat") return;
    s.queen.hp = 0;
    s.status = "defeat";
    s.paused = true;
    const earned = this.prestigeAward();
    s.result = {
      highestRaid: s.raid.highest,
      peak: s.peak,
      time: s.time,
      cause: s.queen.lastHitBy || "An enemy breached the queen’s defenses",
      earned,
    };
    if (!s.meta.awarded.includes(s.id)) {
      s.meta.currency += earned;
      s.meta.runs++;
      s.meta.awarded.push(s.id);
      s.meta.bestRaid = Math.max(s.meta.bestRaid, s.raid.highest);
      s.meta.bestPopulation = Math.max(s.meta.bestPopulation, s.peak);
      s.meta.bestTime = Math.max(s.meta.bestTime, s.time);
    }
    this.log(
      "The queen has fallen",
      `${s.result.cause}. Your colony’s legacy carries forward.`,
      "danger",
    );
  }
  _buyPrestige(branch) {
    const s = this.state,
      d = PERMANENT[branch];
    if (!Object.hasOwn(PERMANENT, branch) || s.status !== "defeat")
      return this.notify(
        "Permanent improvements are available between colonies.",
      );
    const level = s.meta.upgrades[branch],
      cost = d.base + level * 2;
    if (s.meta.currency < cost)
      return this.notify(`Needs ${cost} legacy seeds.`);
    s.meta.currency -= cost;
    s.meta.upgrades[branch]++;
    return this.ok(`${d.name} improved. This applies to your next colony.`);
  }
  serialize() {
    return JSON.stringify({
      format: "ant-colony",
      version: VERSION,
      state: this.state,
    });
  }
  static deserialize(text) {
    if (typeof text !== "string" || text.length > 30_000_000)
      throw new Error("Save file is too large or invalid.");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("This is not a valid JSON save file.");
    }
    if (parsed?.format !== "ant-colony" || parsed.version !== VERSION)
      throw new Error("This save version is not supported.");
    // Keep early v1 local saves compatible with reservation accounting.
    if (parsed.state && typeof parsed.state === "object") {
      parsed.state.refundFood ??= 0;
      parsed.state.raidRng ??= parsed.state.rng;
      parsed.state.refundEnergy ??= 0;
      if (parsed.state.queen && !parsed.state.queen.home) {
        const home =
          Array.isArray(parsed.state.buildings) &&
          parsed.state.buildings.find((b) => b.type === "queen");
        parsed.state.queen.home = home
          ? { x: home.x, y: home.y }
          : {
              x: Math.round(parsed.state.queen.x) - 1,
              y: Math.round(parsed.state.queen.y) - 1,
            };
      }
    }
    validateSave(parsed.state);
    return new ColonyEngine({ state: parsed.state });
  }
}

Object.assign(ColonyEngine.prototype, excavationSystem);

Object.assign(ColonyEngine.prototype, roomsSystem);

Object.assign(ColonyEngine.prototype, assignmentSystem);

Object.assign(ColonyEngine.prototype, foragingSystem);

Object.assign(ColonyEngine.prototype, combatSystem);

Object.assign(ColonyEngine.prototype, raidsSystem);

function validateSave(s) {
  const finite = (x) => typeof x === "number" && Number.isFinite(x),
    nonnegative = (x) => finite(x) && x >= 0;
  const point = (p) =>
    p &&
    finite(p.x) &&
    finite(p.y) &&
    Math.abs(p.x) < Number.MAX_SAFE_INTEGER &&
    Math.abs(p.y) < Number.MAX_SAFE_INTEGER;
  const path = (p) => Array.isArray(p) && p.every(point);
  const assert = (test, message) => {
    if (!test) throw new Error(`Invalid save: ${message}.`);
  };
  assert(s && typeof s === "object", "missing colony");
  assert(
    typeof s.id === "string" &&
      s.id.length < 200 &&
      Number.isSafeInteger(s.seed),
    "colony identity",
  );
  for (const k of [
    "time",
    "tick",
    "accumulator",
    "food",
    "energy",
    "waste",
    "peak",
    "births",
    "losses",
    "rng",
    "raidRng",
    "nextId",
    "refundFood",
    "refundEnergy",
  ])
    assert(nonnegative(s[k]), k);
  assert(
    ["founding", "active", "defeat"].includes(s.status) &&
      [1, 2, 4].includes(s.speed) &&
      typeof s.paused === "boolean",
    "game state",
  );
  for (const k of [
    "ants",
    "buildings",
    "jobs",
    "enemies",
    "eggs",
    "drops",
    "effects",
    "events",
    "deliveries",
    "unlocked",
  ])
    assert(Array.isArray(s[k]), k);
  assert(
    s.queen &&
      finite(s.queen.hp) &&
      nonnegative(s.queen.maxHp) &&
      s.queen.maxHp > 0 &&
      point(s.queen) &&
      path(s.queen.path) &&
      nonnegative(s.queen.cooldown),
    "queen",
  );
  assert(
    s.queen.home &&
      Number.isSafeInteger(s.queen.home.x) &&
      Number.isSafeInteger(s.queen.home.y),
    "queen home",
  );
  assert(
    s.world &&
      typeof s.world.dug === "object" &&
      s.world.dug &&
      s.world.chunks &&
      s.world.bounds &&
      nonnegative(s.world.revision),
    "world",
  );
  assert(
    Number.isSafeInteger(s.world.seed) &&
      Number.isSafeInteger(s.world.bounds.minX) &&
      Number.isSafeInteger(s.world.bounds.maxX) &&
      Number.isSafeInteger(s.world.bounds.maxY) &&
      s.world.bounds.minX <= s.world.bounds.maxX,
    "world bounds",
  );
  assert(
    Object.values(s.world.chunks).every(
      (c) => point(c) && Number.isSafeInteger(c.seed),
    ),
    "terrain chunks",
  );
  for (const k of Object.keys(s.world.dug))
    assert(
      /^-?\d+,\d+$/.test(k) && Number(k.split(",")[1]) > 0,
      "terrain coordinates",
    );
  assert(
    s.meta &&
      nonnegative(s.meta.currency) &&
      nonnegative(s.meta.runs) &&
      Array.isArray(s.meta.awarded),
    "legacy",
  );
  for (const k of ["bestRaid", "bestPopulation", "bestTime"])
    assert(nonnegative(s.meta[k]), "legacy record");
  assert(
    CREWS.includes(s.newCrew) &&
      typeof s.eggsPaused === "boolean" &&
      typeof s.autoShelter === "boolean" &&
      typeof s.shelter === "boolean" &&
      (!s.rally || point(s.rally)),
    "colony controls",
  );
  assert(
    s.unlocked.every((k) => ECONOMIC.includes(k)) &&
      (!s.pendingResearch || Object.hasOwn(RESEARCH, s.pendingResearch)),
    "unlocks",
  );
  for (const branch of Object.keys(PERMANENT))
    assert(
      Number.isInteger(s.meta.upgrades?.[branch]) &&
        s.meta.upgrades[branch] >= 0,
      "permanent improvement",
    );
  for (const r of Object.keys(RESEARCH))
    assert(
      Number.isInteger(s.research?.[r]) && s.research[r] >= 0,
      "colony improvement",
    );
  assert(
    s.raid &&
      ["peace", "warning", "active", "intermission"].includes(s.raid.phase) &&
      nonnegative(s.raid.nextAt) &&
      Array.isArray(s.raid.pending) &&
      nonnegative(s.raid.highest),
    "raid",
  );
  assert(
    s.raid.pending.every((t) => Object.hasOwn(ENEMIES, t)) &&
      nonnegative(s.raid.wave) &&
      nonnegative(s.raid.waveAt) &&
      nonnegative(s.raid.warning),
    "raid schedule",
  );
  assert(
    s.raid.phase === "peace" ||
      (s.raid.plan &&
        point(s.raid.plan.spawn) &&
        nonnegative(s.raid.plan.fixedAt) &&
        Array.isArray(s.raid.plan.waves) &&
        s.raid.plan.waves.length > 0 &&
        s.raid.plan.waves.every(
          (w) => Array.isArray(w) && w.every((t) => Object.hasOwn(ENEMIES, t)),
        )),
    "raid plan",
  );
  const ids = new Set();
  for (const list of [s.ants, s.buildings, s.jobs, s.enemies, s.eggs, s.drops])
    for (const item of list) {
      assert(
        typeof item.id === "string" && !ids.has(item.id),
        "duplicate or missing identifier",
      );
      ids.add(item.id);
    }
  for (const a of s.ants)
    assert(
      CREWS.includes(a.crew) &&
        ["idle", "outbound", "forage", "inbound", "cargo", "staff"].includes(
          a.phase,
        ) &&
        nonnegative(a.cargo) &&
        finite(a.hp) &&
        nonnegative(a.maxHp) &&
        a.maxHp > 0 &&
        point(a) &&
        path(a.path) &&
        nonnegative(a.cooldown) &&
        (!a.pendingCrew || CREWS.includes(a.pendingCrew)) &&
        (!a.trip || point(a.trip.entry)) &&
        (!["outbound", "forage"].includes(a.phase) ||
          (a.trip && point(a.trip.destination))),
      "worker",
    );
  for (const b of s.buildings)
    assert(
      Object.hasOwn(BUILDINGS, b.type) &&
        Number.isSafeInteger(b.x) &&
        Number.isSafeInteger(b.y) &&
        nonnegative(b.hp) &&
        nonnegative(b.maxHp) &&
        b.maxHp > 0 &&
        Number.isInteger(b.level) &&
        b.level > 0 &&
        typeof b.complete === "boolean" &&
        nonnegative(b.reservedFood) &&
        nonnegative(b.reservedEnergy) &&
        nonnegative(b.cooldown) &&
        finite(b.lastDamage) &&
        Array.isArray(b.staff) &&
        new Set(b.staff).size === b.staff.length &&
        b.staff.every((id) =>
          s.ants.some((a) => a.id === id && a.staffOf === b.id),
        ),
      "structure",
    );
  assert(
    s.buildings.filter((b) => b.type === "queen").length <= 1,
    "multiple queens",
  );
  for (const a of s.ants)
    assert(
      !a.staffOf ||
        s.buildings.some((b) => b.id === a.staffOf && b.staff.includes(a.id)),
      "staff assignment",
    );
  for (const e of s.enemies)
    assert(
      Object.hasOwn(ENEMIES, e.type) &&
        finite(e.hp) &&
        nonnegative(e.maxHp) &&
        point(e) &&
        path(e.path) &&
        nonnegative(e.damage) &&
        nonnegative(e.cooldown),
      "enemy",
    );
  for (const j of s.jobs)
    assert(
      Number.isInteger(j.x) &&
        Number.isInteger(j.y) &&
        j.y > 0 &&
        nonnegative(j.progress) &&
        j.progress <= 1 &&
        (!j.owner ||
          j.owner === "queen" ||
          s.ants.some((a) => a.id === j.owner)),
      "excavation",
    );
  for (const e of s.eggs)
    assert(
      nonnegative(e.progress) && s.buildings.some((b) => b.id === e.buildingId),
      "brood",
    );
  for (const d of s.drops)
    assert(
      point(d) && nonnegative(d.amount) && (!d.captureTarget || path(d.path)),
      "food salvage",
    );
  for (const e of s.effects)
    assert(
      point(e) &&
        finite(e.tx) &&
        finite(e.ty) &&
        nonnegative(e.at) &&
        finite(e.duration) &&
        e.duration > 0,
      "visual effect",
    );
  for (const d of s.deliveries)
    assert(nonnegative(d.at) && nonnegative(d.amount), "food delivery");
  for (const e of s.events)
    assert(
      typeof e.title === "string" &&
        typeof e.text === "string" &&
        nonnegative(e.time),
      "journal",
    );
  assert(
    s.status !== "defeat" ||
      (s.result &&
        nonnegative(s.result.earned) &&
        s.meta.awarded.includes(s.id)),
    "defeat record",
  );
}
