import test from "node:test";
import assert from "node:assert/strict";
import { ColonyEngine } from "../src/engine/engine.js";
import { GameSession } from "../src/engine/session.js";
import { BUILDINGS, ECONOMIC, footprint } from "../src/engine/catalog.js";
import { excavate, pathfind, lineOfSight } from "../src/engine/world.js";

function run(e, seconds) {
  e.advance(seconds, { exact: true });
}
function colony() {
  const e = new ColonyEngine({ seed: 123 });
  e.command({ type: "start" });
  run(e, 75);
  e.state.raid.nextAt = 100000;
  e.state.eggsPaused = true;
  return e;
}
function dig(e, x, y, w = 1, h = 1) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) excavate(e.state.world, xx, yy);
}
function room(e, type, x, y, level = 1) {
  e.state.food = 10000;
  e.state.energy = 10000;
  e.state.unlocked = [...ECONOMIC];
  const b = e._place(type, x, y);
  for (const p of footprint(type, x, y)) excavate(e.state.world, p.x, p.y);
  b.complete = true;
  b.level = level;
  e.state.jobs = e.state.jobs.filter((j) => j.blueprint !== b.id);
  return b;
}
function ants(e, n, crew = "food") {
  const b = e.state.buildings[0];
  for (let i = 0; i < n; i++) {
    e.state.newCrew = crew;
    e._hatch({ buildingId: b.id });
    const a = e.state.ants.at(-1);
    e._setCrew(a, crew);
  }
  e.state.newCrew = "food";
}

test("founding completes from dirt; free first egg produces a real food worker without deadlock", () => {
  const e = new ColonyEngine({ seed: 4 });
  assert.equal(Object.keys(e.state.world.dug).length, 0);
  e.command({ type: "start" });
  run(e, 60);
  assert.equal(e.state.status, "active");
  assert.ok(e.state.buildings[0].complete);
  assert.ok(e.state.ants.length >= 1);
  assert.equal(e.state.ants[0].crew, "food");
  assert.ok(e.state.unlocked.includes("storage"));
  assert.equal(e.state.queen.jobId, null);
  const queen = { x: e.state.queen.x, y: e.state.queen.y };
  run(e, 10);
  assert.ok(
    Math.hypot(queen.x - e.state.queen.x, queen.y - e.state.queen.y) < 0.1,
  );
});
test("pause freezes all time, production, combat, construction, and difficulty but accepts orders", () => {
  const e = colony();
  e.command({ type: "pause", value: true });
  const before = e.serialize();
  run(e, 2000);
  assert.equal(e.serialize(), before);
  assert.ok(e.command({ type: "dig", x: 2, y: 4 }).ok);
  const afterOrder = e.serialize();
  run(e, 500);
  assert.equal(e.serialize(), afterOrder);
});
test("blueprints reserve food, do not dig a connection, and refund canceled resources", () => {
  const e = colony();
  e.state.food = 30;
  const count = Object.keys(e.state.world.dug).length;
  const p = e.preview("storage", 40, 20);
  assert.equal(p.connected, false);
  assert.equal(p.connection, "Needs tunnel connection");
  assert.ok(e.command({ type: "build", building: "storage", x: 40, y: 20 }).ok);
  assert.equal(e.state.food, 12);
  assert.equal(Object.keys(e.state.world.dug).length, count);
  assert.equal(e.state.jobs.length, 6);
  const b = e.state.buildings.at(-1);
  assert.ok(e.command({ type: "cancel", id: b.id }).ok);
  assert.equal(e.state.food, 30);
  assert.equal(e.state.jobs.length, 0);
});
test("multiple diggers claim oldest reachable distinct tiles; an unreachable first order cannot block the queue", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 2, "dig");
  e.state.energy = 60;
  e.command({ type: "dig", x: 60, y: 40 });
  e.command({ type: "dig", x: -2, y: 3 });
  e.command({ type: "dig", x: 2, y: 3 });
  run(e, 0.1);
  assert.equal(e.state.jobs[0].owner, null);
  assert.ok(e.state.jobs[1].owner);
  assert.ok(e.state.jobs[2].owner);
  assert.notEqual(e.state.jobs[1].owner, e.state.jobs[2].owner);
  run(e, 15);
  assert.ok(e.state.world.dug["-2,3"]);
  assert.ok(e.state.world.dug["2,3"]);
  assert.equal(e.state.jobs.length, 1);
});
test("digging from accessible space preserves progress on reassignment and cancellation never restores dirt", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 1, "dig");
  e.command({ type: "dig", x: -2, y: 3 });
  run(e, 1);
  const j = e.state.jobs[0];
  assert.ok(j.progress > 0 && j.progress < 1);
  const progress = j.progress;
  e.command({ type: "assign", crew: "dig", delta: -1 });
  assert.equal(j.owner, null);
  assert.equal(j.progress, progress);
  assert.ok(!e.state.world.dug["-2,3"]);
  e.command({ type: "dig", x: -2, y: 3 });
  assert.equal(e.state.jobs.length, 0);
});
test("zero available digging energy does not block brood or food behavior", () => {
  const e = colony();
  ants(e, 1, "dig");
  e.command({ type: "dig", x: -2, y: 3 });
  e.state.energy = 0;
  e.state.eggsPaused = false;
  const before = e.state.eggs[0]?.progress || 0;
  run(e, 1);
  assert.ok(e.state.eggs[0].progress > before);
  assert.ok(e.state.energy >= 0);
  assert.ok(e.state.jobs[0].progress < 0.3);
});
test("chambers unlock only in order on completion; unlocks survive destruction", () => {
  const e = colony();
  assert.equal(e.preview("brood", 2, 3).valid, false);
  e.state.food = 30;
  e.command({ type: "build", building: "storage", x: 2, y: 3 });
  assert.ok(!e.state.unlocked.includes("brood"));
  for (const p of footprint("storage", 2, 3)) excavate(e.state.world, p.x, p.y);
  run(e, 0.1);
  assert.ok(e.state.unlocked.includes("brood"));
  assert.ok(e.unlocked("barracks"));
  e.destroyBuilding(e.state.buildings.at(-1).id);
  assert.ok(e.unlocked("brood"));
});
test("food is credited once on a returning trip; full storage retains cargo", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 1);
  const a = e.state.ants[0];
  a.x = 0;
  a.y = 0;
  a.phase = "inbound";
  a.cargo = 6;
  a.trip = { entry: { x: 0, y: 0 }, destination: { x: 13, y: 0 } };
  e.state.deliveries = [];
  e.state.food = 28;
  run(e, 0.1);
  assert.equal(e.state.food, 30);
  assert.equal(a.cargo, 4);
  assert.equal(a.phase, "cargo");
  run(e, 2);
  assert.equal(e.state.food, 30);
  assert.equal(a.cargo, 4);
  e.state.food = 20;
  run(e, 0.1);
  assert.equal(e.state.food, 24);
  assert.equal(a.cargo, 0);
  run(e, 0.1);
  assert.equal(e.state.food, 24);
  assert.equal(
    e.state.deliveries.reduce((n, d) => n + d.amount, 0),
    6,
  );
});
test("forager reassignment keeps its physical position and safely resolves the trip", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 1);
  const a = e.state.ants[0];
  a.x = 5;
  a.y = 0;
  a.phase = "inbound";
  a.cargo = 6;
  a.trip = { entry: { x: 0, y: 0 } };
  e.state.food = 0;
  e.command({ type: "assign", crew: "dig", delta: 1 });
  assert.equal(a.x, 5);
  assert.equal(a.crew, "food");
  assert.equal(a.pendingCrew, "dig");
  run(e, 8);
  assert.equal(a.crew, "dig");
  assert.equal(a.cargo, 0);
  assert.equal(e.state.food, 6);
});
test("brood slots limit concurrent production, never living population", () => {
  const e = colony();
  ants(e, 60);
  assert.equal(e.getStats().slots, 1);
  e.state.food = 20;
  e.state.eggsPaused = false;
  run(e, 23);
  assert.ok(e.state.ants.length > 60);
  assert.ok(e.state.eggs.length <= 1);
});
test("committed warriors leave mobile capacity, remain living population, and die with their structure", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 2, "warrior");
  e.state.unlocked.push("brood");
  e.state.food = 30;
  dig(e, 0, 2);
  assert.ok(e.command({ type: "build", building: "guard", x: 0, y: 2 }).ok);
  const b = e.state.buildings.at(-1);
  assert.equal(e.getStats().counts.warrior, 0);
  assert.equal(e.getStats().committed, 2);
  assert.equal(e.getStats().population, 2);
  run(e, 6);
  assert.ok(b.complete);
  ants(e, 2);
  e.command({ type: "assign", crew: "warrior", delta: 1 });
  assert.equal(e.getStats().counts.warrior, 1);
  e.destroyBuilding(b.id);
  run(e, 0.1);
  assert.equal(e.getStats().committed, 0);
  assert.equal(e.getStats().population, 2);
});
test("canceling a staffed blueprint releases reservations without teleporting or duplicating ants", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 2, "warrior");
  e.state.unlocked.push("brood");
  e.state.food = 30;
  e.command({ type: "build", building: "guard", x: 10, y: 5 });
  const b = e.state.buildings.at(-1);
  const positions = e.state.ants.map((a) => [a.x, a.y]);
  e.command({ type: "cancel", id: b.id });
  assert.equal(e.getStats().counts.warrior, 2);
  assert.equal(e.getStats().population, 2);
  assert.deepEqual(
    e.state.ants.map((a) => [a.x, a.y]),
    positions,
  );
});
test("barracks loss reduces capacity without deleting mobile warriors", () => {
  const e = colony();
  const b = room(e, "barracks", 2, 3);
  e.state.ants = [];
  ants(e, 8, "warrior");
  ants(e, 1);
  e.destroyBuilding(b.id);
  run(e, 0.1);
  assert.equal(e.getStats().mobileCap, 2);
  assert.equal(e.getStats().counts.warrior, 8);
  assert.equal(
    e.command({ type: "assign", crew: "warrior", delta: 1 }).ok,
    false,
  );
});
test("structure destruction applies capacity and brood loss while leaving excavated terrain", () => {
  const e = colony();
  const storage = room(e, "storage", 2, 3);
  e.state.food = 110;
  e.destroyBuilding(storage.id);
  assert.equal(e.state.food, 30);
  assert.ok(e.state.world.dug["2,3"]);
  const brood = room(e, "brood", 2, 3);
  e.state.eggs.push({ id: "test-egg", buildingId: brood.id, progress: 0.3 });
  e.destroyBuilding(brood.id);
  assert.ok(!e.state.eggs.some((egg) => egg.buildingId === brood.id));
  assert.ok(e.command({ type: "build", building: "storage", x: 2, y: 3 }).ok);
  run(e, 0.1);
  assert.ok(e.state.buildings.at(-1).complete);
});
test("a queen chamber breach must cause actual queen damage, not instant defeat", () => {
  const e = colony();
  e.state.ants = [];
  const enemy = e.spawnEnemy("scout", { x: -1, y: 3 });
  const before = e.state.queen.hp;
  run(e, 0.1);
  assert.equal(e.state.status, "active");
  assert.ok(e.state.queen.hp > 0);
  assert.ok(enemy.hp > 0);
  assert.ok(e.state.queen.hp <= before);
  e.destroyBuilding(e.state.buildings[0].id);
  assert.equal(e.state.status, "active");
  assert.ok(e.state.queen.hp > 0);
});
test("dirt blocks pathfinding and sight; barricades hold attackers until destroyed", () => {
  const e = colony();
  assert.equal(pathfind(e.state, { x: 0, y: 0 }, { x: 10, y: 10 }), null);
  assert.equal(
    lineOfSight(e.state.world, { x: 0, y: 0 }, { x: 3, y: 3 }),
    false,
  );
  const b = room(e, "barricade", 0, 1);
  e.state.ants = [];
  const enemy = e.spawnEnemy("soldier", { x: 0, y: 0 });
  run(e, 3);
  assert.ok(enemy.y < 1);
  assert.ok(b.hp < b.maxHp);
  assert.ok(b.hp > 0);
  e.destroyBuilding(b.id);
  run(e, 3);
  assert.ok(enemy.y >= 1);
});
test("repairs require resources and stop for six seconds after incoming damage", () => {
  const e = colony();
  e.state.ants = [];
  ants(e, 1, "dig");
  const b = e.state.buildings[0];
  b.hp -= 80;
  b.lastDamage = e.state.time;
  const hp = b.hp;
  e.state.food = 30;
  e.state.energy = 50;
  run(e, 4);
  assert.equal(b.hp, hp);
  run(e, 6);
  assert.ok(b.hp > hp);
  assert.ok(e.state.food < 30);
});
test("raid plans are seeded and fixed at warning, independent of worker strength", () => {
  const a = colony(),
    b = ColonyEngine.deserialize(a.serialize());
  a.state.time = b.state.time = 174.9;
  a.state.tick = b.state.tick = 1749;
  a.state.raid.nextAt = b.state.raid.nextAt = 225;
  ants(b, 20, "warrior");
  run(a, 0.1);
  run(b, 0.1);
  assert.deepEqual(a.state.raid.plan, b.state.raid.plan);
  const plan = structuredClone(a.state.raid.plan);
  run(a, 20);
  assert.deepEqual(a.state.raid.plan, plan);
});
test("save and reload preserve exact next outcomes, random state, queue, and combat", () => {
  const a = colony();
  a.state.raid.nextAt = 225;
  a.command({ type: "dig", x: 2, y: 3 });
  run(a, 155);
  const b = ColonyEngine.deserialize(a.serialize());
  assert.deepEqual(a.state, b.state);
  run(a, 20);
  run(b, 20);
  assert.deepEqual(a.state, b.state);
});
test("queen death awards completed raids and peak simultaneous population exactly once", () => {
  const e = colony();
  e.state.peak = 100;
  e.state.raid.highest = 2;
  e.state.raid.number = 3;
  e.state.queen.hp = 0;
  e.state.queen.lastHitBy = "Armored beetle";
  run(e, 0.1);
  assert.equal(e.state.result.earned, 18);
  assert.equal(e.state.result.highestRaid, 2);
  assert.equal(e.state.meta.currency, 18);
  const copy = ColonyEngine.deserialize(e.serialize());
  run(copy, 9999);
  copy._defeat();
  assert.equal(copy.state.meta.currency, 18);
  assert.ok(copy.command({ type: "prestige", branch: "foraging" }).ok);
  assert.equal(copy.state.meta.currency, 15);
  copy.command({ type: "newRun", seed: 9 });
  assert.equal(copy.state.meta.upgrades.foraging, 1);
  assert.equal(copy.state.ants.length, 0);
  assert.equal(copy.state.raid.highest, 0);
  assert.equal(copy.state.meta.currency, 15);
  assert.equal(copy.state.status, "founding");
});
test("queen relocation follows a route, preserves brood and upgrades, and is blocked during warnings", () => {
  const e = colony();
  const b = e.state.buildings[0];
  b.level = 3;
  dig(e, -1, 5, 3, 4);
  const oldId = b.id,
    eggs = structuredClone(e.state.eggs);
  assert.ok(e.command({ type: "relocate", x: -1, y: 7 }).ok);
  assert.ok(e.state.queen.y < 7);
  assert.equal(b.y, 3);
  run(e, 20);
  assert.equal(b.y, 7);
  assert.equal(b.id, oldId);
  assert.equal(b.level, 3);
  assert.equal(e.state.buildings.filter((b) => b.type === "queen").length, 1);
  assert.ok(eggs.every((egg) => egg.buildingId === oldId));
  e.state.raid.phase = "warning";
  assert.equal(e.command({ type: "relocate", x: -1, y: 3 }).ok, false);
});
test("terrain grows in all underground directions without a fixed map edge", () => {
  const e = colony();
  e.command({ type: "dig", x: -10000, y: 50000 });
  assert.ok(e.state.world.bounds.minX < -10000);
  assert.ok(e.state.world.bounds.maxY > 50000);
  assert.ok(Object.keys(e.state.world.chunks).length > 4);
});
test("invalid and corrupted saves are rejected before replacing a running colony", () => {
  const e = colony();
  assert.throws(() => ColonyEngine.deserialize("{no"));
  const p = JSON.parse(e.serialize());
  p.state.ants[0].hp = "bad";
  assert.throws(() => ColonyEngine.deserialize(JSON.stringify(p)), /worker/);
  p.state.ants[0].hp = 20;
  p.state.ants[0].staffOf = "missing";
  assert.throws(() => ColonyEngine.deserialize(JSON.stringify(p)), /staff/);
  const session = new GameSession();
  const id = session.engine.state.id;
  assert.throws(() => session.import("bad"));
  assert.equal(session.engine.state.id, id);
});
test("host suspension and restore never apply offline progression; blocked storage remains playable", () => {
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    };
  const a = new GameSession(storage, 55);
  a.command({ type: "start" });
  a.advance(0.2);
  a.save();
  const before = a.export();
  const b = new GameSession(storage, 20);
  assert.equal(b.export(), before);
  b.suspend(true);
  b.advance(9999);
  assert.equal(b.export(), before);
  b.suspend(false);
  b.advance(10000);
  assert.ok(b.engine.state.time - a.engine.state.time < 1);
  const failed = new GameSession({
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota");
    },
  });
  assert.equal(failed.save(), false);
  assert.match(failed.saveStatus, /Export/);
});
test("fractional animation time cannot produce a negative save accumulator", () => {
  const e = new ColonyEngine();
  e.command({ type: "start" });
  e.advance(0.0999999999, { exact: true });
  assert.ok(e.state.accumulator >= 0);
  assert.doesNotThrow(() => ColonyEngine.deserialize(e.serialize()));
});
