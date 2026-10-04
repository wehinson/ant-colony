import {
  VERSION,
  STEP,
  BUILDINGS,
  ECONOMIC,
  CREWS,
  ENEMIES,
  PERMANENT,
  RESEARCH,
  cell,
  validTile,
} from "./catalog.js";
import { isOpen } from "./world.js";
import { createMetrics } from "./metrics.js";
export function decodeSave(text) {
  if (typeof text !== "string") throw new Error("Save file is invalid.");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This is not a valid JSON save file.");
  }
  if (parsed?.format !== "ant-colony" || ![1, VERSION].includes(parsed.version))
    throw new Error("This save version is not supported.");
  // Keep early v1 local saves compatible with reservation accounting.
  if (parsed.state && typeof parsed.state === "object") {
    parsed.state.version = VERSION;
    parsed.state.metrics ??= createMetrics(parsed.state.time || 0);
    parsed.state.refundFood ??= 0;
    parsed.state.raidRng ??= parsed.state.rng;
    if (parsed.state.meta)
      parsed.state.lineage ??= {
        generation: Math.max(
          0,
          parsed.state.meta.runs - (parsed.state.status === "defeat" ? 1 : 0),
        ),
      };
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
  return parsed.state;
}

export function validateSave(s) {
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
    s.metrics &&
      nonnegative(s.metrics.since) &&
      nonnegative(s.metrics.nextSample) &&
      s.metrics.counters &&
      Object.values(s.metrics.counters).every(nonnegative) &&
      Array.isArray(s.metrics.samples) &&
      Array.isArray(s.metrics.commands) &&
      Array.isArray(s.metrics.raids),
    "diagnostics",
  );
  assert(
    Number.isSafeInteger(s.tick) &&
      Number.isSafeInteger(s.nextId) &&
      s.nextId > 0 &&
      Math.abs(s.time - s.tick * STEP) < 0.00001 &&
      s.accumulator < STEP + 0.00001,
    "simulation clock",
  );
  assert(
    typeof s.started === "boolean" && typeof s.freeEgg === "boolean",
    "founding state",
  );
  for (const stream of ["rng", "raidRng"])
    assert(
      Number.isInteger(s[stream]) && s[stream] >= 0 && s[stream] <= 0xffffffff,
      "random state",
    );
  assert(
    s.lineage &&
      Number.isSafeInteger(s.lineage.generation) &&
      s.lineage.generation >= 0,
    "ant lineage",
  );
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
      !Array.isArray(s.world.dug) &&
      !Array.isArray(s.world.chunks) &&
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
      /^-?\d+,\d+$/.test(k) &&
        validTile(...k.split(",").map(Number)) &&
        Number(k.split(",")[1]) > 0 &&
        s.world.dug[k] === true,
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
      Number.isSafeInteger(s.raid.number) &&
      s.raid.number >= 0 &&
      nonnegative(s.raid.spawnAt) &&
      nonnegative(s.raid.startedAt) &&
      nonnegative(s.raid.lastEnded) &&
      Number.isSafeInteger(s.raid.wave) &&
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
  if (s.raid.phase !== "peace")
    assert(
      s.raid.wave <= s.raid.plan.waves.length &&
        (s.raid.phase !== "active" || s.raid.wave > 0) &&
        (s.raid.phase !== "intermission" ||
          s.raid.wave < s.raid.plan.waves.length) &&
        ["west", "east"].includes(s.raid.plan.direction) &&
        nonnegative(s.raid.plan.budget) &&
        Number.isSafeInteger(s.raid.plan.number),
      "wave position",
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
  for (const item of [
    ...s.ants,
    ...s.buildings,
    ...s.jobs,
    ...s.enemies,
    ...s.eggs,
    ...s.drops,
    ...s.events,
    ...s.effects,
  ]) {
    const suffix = String(item.id).match(/-(\d+)$/);
    assert(!suffix || Number(suffix[1]) < s.nextId, "identifier sequence");
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
        nonnegative(a.forageUntil) &&
        (!a.destination || point(a.destination)) &&
        (!a.trip || point(a.trip.entry)) &&
        (!["outbound", "forage"].includes(a.phase) ||
          (a.trip && point(a.trip.destination))),
      "worker",
    );
  for (const a of s.ants)
    assert(
      isOpen(s.world, cell(a).x, cell(a).y) &&
        (!a.jobId || s.jobs.some((j) => j.id === a.jobId && j.owner === a.id)),
      "worker position or job",
    );
  if (s.queen.relocation)
    assert(
      point(s.queen.relocation) &&
        s.buildings.some(
          (b) => b.id === s.queen.relocation.buildingId && b.type === "queen",
        ),
      "queen relocation",
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
        nonnegative(b.captureAt) &&
        nonnegative(b.captures) &&
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
        nonnegative(e.slowUntil) &&
        nonnegative(e.tunnelProgress) &&
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
        (!j.blueprint || s.buildings.some((b) => b.id === j.blueprint)) &&
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
        nonnegative(s.result.highestRaid) &&
        nonnegative(s.result.peak) &&
        nonnegative(s.result.time) &&
        typeof s.result.cause === "string" &&
        s.queen.hp === 0 &&
        s.meta.awarded.includes(s.id)),
    "defeat record",
  );
}
