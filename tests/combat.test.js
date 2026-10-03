import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyEngine } from '../src/engine/engine.js';
import { BUILDINGS, ECONOMIC, footprint } from '../src/engine/catalog.js';
import { excavate } from '../src/engine/world.js';
import { develop, simulate } from '../scripts/balance.mjs';

function fixture() { const e = new ColonyEngine({ seed: 808 }); e.command({ type: 'start' }); e.advance(70, { exact: true }); e.state.raid.nextAt = 100000; e.state.ants = []; e.state.eggs = []; e.state.eggsPaused = true; e.state.food = 200; e.state.energy = 70; e.state.unlocked = [...ECONOMIC]; return e; }
function addRoom(e, type, x, y) { const b = e._place(type, x, y); for (const p of footprint(type, x, y)) excavate(e.state.world, p.x, p.y); b.complete = true; e.state.jobs = e.state.jobs.filter(j => j.blueprint !== b.id); return b; }
function hatch(e, n, crew) { for (let i = 0; i < n; i++) { e._hatch({ buildingId: e.state.buildings[0].id }); e._setCrew(e.state.ants.at(-1), crew); } }
function run(e, t) { e.advance(t, { exact: true }); }

test('all six economic rooms can be built in a natural run with earned food', () => {
  const e = new ColonyEngine({ seed: 23 }); e.command({ type: 'start' });
  for (let t = 0; t < 550 && e.state.status !== 'defeat'; t++) { develop(e, { defend: false }); run(e, 1); }
  assert.equal(e.state.unlocked.length, 6); assert.ok(e.state.buildings.some(b => b.type === 'quarters' && b.complete)); assert.ok(e.state.peak > 20);
});
test('completed staffed posts damage individual enemies; outpost staff do not use mobile capacity', () => {
  const e = fixture(); hatch(e, 15, 'warrior'); const b = addRoom(e, 'outpost', 0, 0); hatch(e, 2, 'warrior');
  assert.equal(e.getStats().committed, 15); assert.equal(e.getStats().counts.warrior, 2); assert.equal(e.getStats().mobileCap, 2);
  const enemy = e.spawnEnemy('wasp', { x: 5, y: 0 }), hp = enemy.hp; run(e, 0.2); assert.ok(enemy.hp < hp); assert.ok(b.cooldown > 0);
});
test('damage traps reset on cooldown; snares slow movement; spray applies local area damage', () => {
  const e = fixture(); const trap = addRoom(e, 'trap', 0, 2); const enemy = e.spawnEnemy('beetle', { x: 0, y: 2 }); const before = enemy.hp;
  run(e, 0.1); assert.ok(enemy.hp < before); assert.ok(trap.cooldown > 8); const hp = enemy.hp; run(e, 0.2); assert.equal(enemy.hp, hp);
  const snare = addRoom(e, 'snare', 0, 1); const other = e.spawnEnemy('scout', { x: 0, y: 1 }); run(e, 0.1); assert.ok(other.slowUntil > e.state.time); assert.ok(snare.cooldown > 0);
  const spray = addRoom(e, 'spray', 1, 3); const a = e.spawnEnemy('soldier', { x: 1, y: 3 }), b = e.spawnEnemy('soldier', { x: 1, y: 4 }); const ha = a.hp, hb = b.hp; run(e, 0.1); assert.ok(a.hp < ha); assert.ok(b.hp < hb); assert.ok(spray.cooldown > 0);
});
test('mobile combat has finite frontage and cannot attack through dirt', () => {
  const e = fixture(); hatch(e, 30, 'warrior'); e.state.queen.x = 1; e.state.queen.y = 4;
  for (const a of e.state.ants) { a.x = 0; a.y = 0; }
  const enemy = e.spawnEnemy('beetle', { x: 0, y: 0 }); const hp = enemy.hp; run(e, 0.1);
  assert.ok(hp - enemy.hp <= 4 * 9 + 0.01); assert.ok(hp > enemy.hp);
  const hidden = e.spawnEnemy('soldier', { x: 2, y: 2 }); const hiddenHp = hidden.hp; run(e, 0.1); assert.equal(hidden.hp, hiddenHp);
});
test('the central army controller retains a reserve and divides attackers among threats', () => {
  const e = fixture(); hatch(e, 10, 'warrior'); e.spawnEnemy('scout', { x: -5, y: 0 }); e.spawnEnemy('scout', { x: 5, y: 0 }); run(e, 1);
  assert.ok(e.state.ants.filter(a => a.order === 'reserve').length >= 3); assert.equal(new Set(e.state.ants.filter(a => a.target).map(a => a.target)).size, 2);
});
test('flying enemies enter underground only through excavated surface openings', () => {
  const e = fixture(), wasp = e.spawnEnemy('wasp', { x: 8, y: 0 }); let underground = false;
  for (let i = 0; i < 180; i++) { run(e, 0.1); if (wasp.y > 0) { underground = true; assert.ok(e.state.world.dug[`${Math.round(wasp.x)},${Math.round(wasp.y)}`] || Math.round(wasp.y) === 0); } }
  assert.ok(underground);
});
test('tunnelling enemies make real, warned breaches; ordinary enemies cannot', () => {
  const e = fixture(); const before = Object.keys(e.state.world.dug).length; e.spawnEnemy('tunneller', { x: 2, y: 0 }); run(e, 22);
  assert.ok(Object.keys(e.state.world.dug).length > before); assert.ok(e.state.events.some(event => event.title === 'Underground breach'));
  const normal = fixture(); normal.spawnEnemy('soldier', { x: 2, y: 0 }); const count = Object.keys(normal.state.world.dug).length; run(normal, 20); assert.equal(Object.keys(normal.state.world.dug).length, count);
});
test('brood thieves take an actual developing egg and attempt to leave', () => {
  const e = fixture(); e.state.eggs.push({ id: 'egg-test', buildingId: e.state.buildings[0].id, progress: 0 }); const thief = e.spawnEnemy('thief', { x: 1, y: 3 }); run(e, 0.1); assert.ok(thief.stolen); assert.equal(e.state.eggs.length, 0);
});
test('prey follows an open surface route before food is credited', () => {
  const e = fixture(); const b = addRoom(e, 'prey', 2, 3); e.state.food = 0; b.captureAt = e.state.time;
  run(e, 0.1); assert.equal(e.state.food, 0); assert.equal(e.state.drops.filter(d => d.captureTarget).length, 1); run(e, 12); assert.ok(e.state.food > 0); assert.ok(b.captures > 0);
});
test('blueprint refunds remain reserved when storage fills and are never silently lost', () => {
  const e = fixture(); e.state.food = 30; e.command({ type: 'build', building: 'storage', x: 40, y: 20 }); e.state.food = 30; const b = e.state.buildings.at(-1);
  e.command({ type: 'cancel', id: b.id }); assert.equal(e.state.food, 30); assert.equal(e.state.refundFood, 18);
  e.state.food -= 20; run(e, 0.1); assert.equal(e.state.food, 28); assert.equal(e.state.refundFood, 0);
});
test('rebuilding the queen room cannot be used to move her during combat', () => {
  const e = fixture(); const b = e.state.buildings[0]; e.destroyBuilding(b.id); e.state.food = 30;
  assert.equal(e.preview('queen', 5, 10).valid, false); assert.equal(e.preview('queen', -1, 3).food, 24); assert.ok(e.command({ type: 'build', building: 'queen', x: -1, y: 3 }).ok); assert.equal(e.state.food, 6);
});
test('staff walking to a post are vulnerable and cannot attack as mobile warriors', () => {
  const e = fixture(); hatch(e, 2, 'warrior'); for (const a of e.state.ants) { a.x = 0; a.y = 2; }
  e.command({ type: 'build', building: 'guard', x: 0, y: 1 }); const a = e.state.ants[0]; const hp = a.hp; const enemy = e.spawnEnemy('soldier', { x: 0, y: 2 }); run(e, 0.1);
  assert.ok(a.hp < hp); assert.equal(enemy.hp, enemy.maxHp); assert.equal(e.getStats().counts.warrior, 0);
});
test('an already-warned raid cannot change enemy strength when a wave is stalled', () => {
  const e = fixture(); e.state.raid.plan = { fixedAt: 800 }; const first = e.spawnEnemy('soldier', { x: 20, y: 0 }); e.state.time = 2000; const later = e.spawnEnemy('soldier', { x: 20, y: 0 }); assert.equal(first.maxHp, later.maxHp); assert.equal(first.damage, later.damage);
});
test('zero-waste processing never shuts production down and living population drives peak scoring', () => {
  const e = fixture(); e.state.waste = 100000; assert.equal(e.getStats().efficiency, 0.45); hatch(e, 20, 'food'); const peak = e.state.peak;
  e.state.ants.forEach(a => a.hp = 0); run(e, 0.1); hatch(e, 20, 'food'); assert.equal(e.state.peak, peak); assert.ok(e.state.births > peak);
});
test('full natural run reaches defeat, awards legacy, purchases an upgrade, then founds again', () => {
  const { game } = simulate(23, { defend: false, limit: 1400 }); assert.equal(game.state.status, 'defeat'); assert.ok(game.state.meta.currency >= 3);
  assert.ok(game.command({ type: 'prestige', branch: 'founding' }).ok); const meta = structuredClone(game.state.meta); assert.ok(game.command({ type: 'newRun' }).ok); run(game, 65);
  assert.equal(game.state.status, 'active'); assert.ok(game.state.ants.length); assert.deepEqual(game.state.meta, meta); assert.ok(game.getStats().energyCap > 70);
});
