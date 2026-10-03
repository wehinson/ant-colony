import { VERSION, STEP, BUILDINGS, ECONOMIC, CREWS, ENEMIES, PERMANENT, RESEARCH, key, cell, center, distance, clamp, footprint, formatTime } from './catalog.js';
import { terrainValue, ensureTerrain, excavate, isOpen, neighbors, entrances, buildingAt, blockedAt, pathfind, connected, lineOfSight } from './world.js';

const freshMeta = () => ({ currency: 0, upgrades: { foraging: 0, brood: 0, excavation: 0, military: 0, founding: 0 }, runs: 0, bestRaid: 0, bestPopulation: 0, bestTime: 0, awarded: [] });
const freshState = (seed, meta) => ({
  version: VERSION, seed: seed >>> 0 || 1, rng: seed >>> 0 || 1, id: `colony-${meta.runs + 1}-${seed >>> 0}`, meta: structuredClone(meta),
  time: 0, tick: 0, accumulator: 0, speed: 1, paused: true, started: false, status: 'founding', nextId: 1,
  world: { seed: seed >>> 0, dug: {}, chunks: {}, bounds: { minX: -18, maxX: 18, maxY: 18 }, revision: 0 },
  food: 12 + 12 * meta.upgrades.founding, energy: 70 + 20 * meta.upgrades.founding, waste: 0, refundFood: 0, refundEnergy: 0,
  queen: { id: 'queen', x: 0, y: 0, previousX: 0, previousY: 0, home: { x: -1, y: 3 }, hp: 300 * (1 + 0.15 * meta.upgrades.military), maxHp: 300 * (1 + 0.15 * meta.upgrades.military), cooldown: 0, path: [], jobId: null, relocation: null },
  ants: [], buildings: [], jobs: [], enemies: [], eggs: [], drops: [], effects: [], events: [], deliveries: [],
  unlocked: ['queen'], research: { carry: 0, speed: 0, armor: 0 }, peak: 0, births: 0, losses: 0,
  freeEgg: true, eggsPaused: false, newCrew: 'food', shelter: false, autoShelter: true, rally: null,
  raid: { phase: 'peace', number: 0, highest: 0, nextAt: 225, warning: 50, plan: null, wave: 0, waveAt: 0, spawnAt: 0, pending: [], startedAt: 0, lastEnded: 0 },
  controllerAt: 0, broodAt: 0, result: null, notice: '', noticeUntil: 0,
});

export class ColonyEngine {
  constructor({ seed = 180231, state = null, meta = null } = {}) {
    this.state = state ? structuredClone(state) : freshState(seed, meta || freshMeta());
    this._routes = new Map(); this._routeRevision = -1; this._presentation = null;
    if (!state) {
      const s = this.state; ensureTerrain(s.world, 0, 3);
      this._place('queen', -1, 3);
      // Only the founding queen creates this starting access route. Later blueprints never do.
      const initialJobs = s.jobs.splice(0); this._designate(0, 1); this._designate(0, 2); s.jobs.push(...initialJobs);
      this.log('A new beginning', 'Your queen is preparing the first chamber. Her first egg is free.', 'milestone');
    }
  }
  random() { let t = this.state.rng += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); this.state.rng >>>= 0; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  id(prefix) { return `${prefix}-${this.state.nextId++}`; }
  log(title, text, kind = 'info') { const s = this.state; s.events.unshift({ id: this.id('event'), time: s.time, title, text, kind }); s.events.length = Math.min(60, s.events.length); }
  notify(message) { this.state.notice = message; this.state.noticeUntil = this.state.time + 6; return { ok: false, message }; }
  ok(message = '') { if (message) { this.state.notice = message; this.state.noticeUntil = this.state.time + 5; } this._presentation = null; return { ok: true, message }; }
  getStats() {
    const s = this.state, active = s.buildings.filter(b => b.complete), sum = type => active.filter(b => b.type === type).reduce((n, b) => n + b.level, 0);
    const counts = { food: 0, dig: 0, warrior: 0 }, pending = { food: 0, dig: 0, warrior: 0 };
    for (const a of s.ants) { if (!a.staffOf) counts[a.crew]++; if (a.pendingCrew) pending[a.pendingCrew]++; }
    const committed = s.ants.filter(a => a.staffOf).length;
    const foodCap = 30 + 15 * s.meta.upgrades.founding + sum('storage') * 90;
    const energyCap = 70 + s.meta.upgrades.founding * 20 + sum('quarters') * 55;
    const recovery = 0.5 + (s.food > 0 ? 0.35 : 0) + sum('quarters') * 1.2 + s.meta.upgrades.excavation * 0.15;
    const efficiency = clamp(1 - Math.max(0, s.waste - 30) / 550, 0.45, 1);
    const slots = sum('queen') + sum('brood') * 2;
    const mobileCap = 2 + sum('barracks') * 8 + s.meta.upgrades.military * 2;
    const carry = (6 + s.research.carry * 2) * (1 + 0.15 * s.meta.upgrades.foraging);
    const income = s.deliveries.reduce((n, d) => n + d.amount, 0) / Math.max(1, Math.min(60, s.time)) * 60;
    const eggCost = Math.max(2, 5 / (1 + 0.08 * s.meta.upgrades.brood));
    const eggDuration = 20 / (1 + 0.12 * s.meta.upgrades.brood);
    return { counts, pending, committed, population: s.ants.length, foodCap, energyCap, recovery, efficiency, slots, mobileCap, carry, income, eggCost, eggDuration, wasteRate: 0.05 + sum('waste') * 1.8, prey: sum('prey'), active };
  }
  unlocked(type) {
    const d = BUILDINGS[type]; if (!d) return false;
    return d.branch === 'military' ? this.state.unlocked.includes('brood') : this.state.unlocked.includes(type);
  }
  preview(type, x, y, relocate = false) {
    const s = this.state, d = BUILDINGS[type];
    if (!d || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return { valid: false, reason: 'Choose a valid grid tile.', tiles: [] };
    const tiles = footprint(type, x, y), buried = tiles.filter(p => !isOpen(s.world, p.x, p.y)).length;
    let reason = '';
    if (s.status === 'defeat') reason = 'This colony has ended.';
    else if (!this.unlocked(type)) reason = 'Complete the preceding chamber to unlock this.';
    else if (d.surface ? y !== 0 : y < 1) reason = d.surface ? 'Place this on the surface row.' : 'Place this underground.';
    else if (tiles.some(p => buildingAt(s, p.x, p.y))) reason = 'This footprint overlaps another structure.';
    else if (type === 'queen' && s.buildings.some(b => b.type === 'queen') && !relocate) reason = 'There is only one Queen’s Chamber. Use Relocate.';
    else if (type === 'queen' && s.status !== 'founding' && !relocate && (x !== s.queen.home.x || y !== s.queen.home.y)) reason = 'Rebuild the queen’s former chamber here first, then use Relocate between raids.';
    else if (relocate && (s.raid.phase !== 'peace' || s.time >= s.raid.nextAt - s.raid.warning)) reason = 'The queen can move only between raids and warnings.';
    else if (relocate && s.queen.relocation) reason = 'The queen is already moving.';
    else if (relocate && buried) reason = 'Excavate the entire destination first.';
    const hasConnection = tiles.some(p => (isOpen(s.world, p.x, p.y) && this.route(p, { x: 0, y: 0 }) !== null) || neighbors(p).some(n => isOpen(s.world, n.x, n.y) && this.route(n, { x: 0, y: 0 }) !== null));
    if (!reason && relocate && (!hasConnection || !this.route(s.queen, { x, y }))) reason = 'Needs a prepared, connected route.';
    const available = s.ants.filter(a => a.crew === 'warrior' && !a.staffOf && !a.pendingCrew && a.phase !== 'forage').length;
    const food = relocate ? 0 : type === 'queen' && s.status !== 'founding' ? 24 : d.food, energy = relocate ? 0 : d.energy, staff = relocate ? 0 : d.staff;
    if (!reason && s.food < food) reason = `Needs ${food} food.`;
    if (!reason && s.energy < energy) reason = `Needs ${energy} energy.`;
    if (!reason && available < staff) reason = `Needs ${staff} available warriors (${available} available).`;
    return { valid: !reason, reason, tiles, buried, connected: hasConnection, connection: hasConnection ? `${buried} tiles to excavate` : 'Needs tunnel connection', food, energy, staff, type, x, y, relocate };
  }
  command(c) {
    if (!c || typeof c.type !== 'string') return this.notify('Invalid command.');
    const s = this.state;
    if (c.type === 'pause') { s.paused = c.value ?? !s.paused; s.accumulator = 0; return this.ok(); }
    if (c.type === 'start') { s.started = true; s.paused = false; return this.ok(); }
    if (c.type === 'speed') { if (![1, 2, 4].includes(c.value)) return this.notify('Choose 1×, 2× or 4× speed.'); s.speed = c.value; return this.ok(); }
    if (c.type === 'prestige') return this._buyPrestige(c.branch);
    if (c.type === 'newRun') {
      if (s.status !== 'defeat') return this.notify('The current colony is still alive.');
      const meta = s.meta, seed = Number.isSafeInteger(c.seed) ? c.seed : Math.floor(this.random() * 4294967295);
      const next = new ColonyEngine({ seed, meta }); this.state = next.state; this._routes.clear(); this.state.started = true; this.state.paused = false; return this.ok();
    }
    if (s.status === 'defeat') return this.notify('Start a new colony to continue.');
    switch (c.type) {
      case 'dig': {
        const { x, y } = c; if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || y < 1) return this.notify('Only underground dirt can be excavated.');
        const existing = s.jobs.find(j => j.x === x && j.y === y);
        if (existing && c.mode !== 'add') { this._cancelJob(existing.id); return this.ok('Excavation order canceled.'); }
        if (c.mode === 'remove') return this.ok();
        if (isOpen(s.world, x, y)) return this.notify('This tile is already excavated.');
        this._designate(x, y); return this.ok();
      }
      case 'build': {
        const p = this.preview(c.building, c.x, c.y); if (!p.valid) return this.notify(p.reason);
        this._place(c.building, c.x, c.y); return this.ok(p.connected ? 'Blueprint placed. Resources reserved.' : 'Blueprint placed. Needs tunnel connection.');
      }
      case 'cancel': return this._cancelBlueprint(c.id);
      case 'upgrade': return this._upgrade(c.id);
      case 'research': return this._research(c.key);
      case 'assign': return this._assign(c.crew, c.delta);
      case 'newCrew': if (!CREWS.includes(c.crew)) return this.notify('Choose a valid crew.'); s.newCrew = c.crew; return this.ok();
      case 'eggs': s.eggsPaused = c.value ?? !s.eggsPaused; return this.ok();
      case 'shelter': s.shelter = c.value ?? !s.shelter; return this.ok(s.shelter ? 'Workers are returning to shelter.' : 'Emergency shelter released.');
      case 'autoShelter': s.autoShelter = c.value ?? !s.autoShelter; return this.ok();
      case 'rally': if (!isOpen(s.world, c.x, c.y)) return this.notify('Choose an open tile for the rally point.'); s.rally = { x: c.x, y: c.y }; return this.ok('Rally point set. The hive keeps a queen reserve.');
      case 'relocate': {
        if (s.status === 'founding') return this.notify('Finish founding first.');
        const p = this.preview('queen', c.x, c.y, true); if (!p.valid) return this.notify(p.reason);
        const b = s.buildings.find(b => b.type === 'queen'); if (!b?.complete) return this.notify('Rebuild the Queen’s Chamber first.');
        s.queen.relocation = { x: c.x, y: c.y, buildingId: b.id }; s.queen.path = [];
        return this.ok('The queen is moving with her brood. Raid timing continues.');
      }
      case 'repair': { const b = s.buildings.find(b => b.id === c.id && b.complete); if (!b) return this.notify('Choose a completed structure.'); b.repair = !b.repair; return this.ok(b.repair ? 'Dig crew will repair this when it is safe.' : 'Repairs paused for this structure.'); }
      default: return this.notify('Unknown command.');
    }
  }
  _designate(x, y, blueprint = null) {
    if (isOpen(this.state.world, x, y)) return;
    let job = this.state.jobs.find(j => j.x === x && j.y === y);
    if (!job) { job = { id: this.id('dig'), x, y, progress: 0, owner: null, blueprint }; this.state.jobs.push(job); }
    ensureTerrain(this.state.world, x, y); return job;
  }
  _cancelJob(id) { const s = this.state; const job = s.jobs.find(j => j.id === id); if (!job) return; for (const a of [s.queen, ...s.ants]) if (a.jobId === id) { a.jobId = null; a.path = []; } s.jobs = s.jobs.filter(j => j.id !== id); }
  _place(type, x, y) {
    const s = this.state, d = BUILDINGS[type], id = this.id('building');
    const foodCost = type === 'queen' && s.status !== 'founding' ? 24 : d.food;
    s.food -= foodCost; s.energy -= d.energy;
    const staff = s.ants.filter(a => a.crew === 'warrior' && !a.staffOf && !a.pendingCrew).slice(0, d.staff);
    for (const a of staff) { a.staffOf = id; a.phase = 'staff'; a.path = []; a.target = null; }
    const maxHp = d.hp * (d.branch === 'military' ? 1 + s.meta.upgrades.military * 0.15 : 1);
    const b = { id, type, x, y, complete: false, level: 1, hp: maxHp, maxHp, staff: staff.map(a => a.id), reservedFood: foodCost, reservedEnergy: d.energy, cooldown: 0, lastDamage: -100, repair: true, captureAt: s.time + 26, captures: 0 };
    s.buildings.push(b); for (const p of footprint(type, x, y)) this._designate(p.x, p.y, id);
    ensureTerrain(s.world, x, y); return b;
  }
  _cancelBlueprint(id) {
    const s = this.state, b = s.buildings.find(b => b.id === id); if (!b || b.complete) return this.notify('Only unfinished blueprints can be canceled.');
    if (b.type === 'queen' && s.status === 'founding') return this.notify('The founding chamber is needed for your first worker.');
    const stats = this.getStats();
    s.refundFood += Math.max(0, s.food + b.reservedFood - stats.foodCap); s.food = Math.min(stats.foodCap, s.food + b.reservedFood);
    s.refundEnergy += Math.max(0, s.energy + b.reservedEnergy - stats.energyCap); s.energy = Math.min(stats.energyCap, s.energy + b.reservedEnergy);
    for (const id of b.staff) { const a = s.ants.find(a => a.id === id); if (a) { a.staffOf = null; a.phase = 'idle'; a.path = []; } }
    for (const j of [...s.jobs]) if (j.blueprint === b.id) this._cancelJob(j.id);
    s.buildings = s.buildings.filter(other => other.id !== id); return this.ok('Blueprint canceled. Reserved resources refunded; excavated tiles remain.');
  }
  upgradeCost(b) { const d = BUILDINGS[b.type]; return { food: Math.ceil(Math.max(20, d.food * 0.7) * 1.65 ** (b.level - 1)), staff: d.staff ? Math.max(1, Math.ceil(d.staff / 3)) : 0, energy: d.energy ? Math.ceil(d.energy / 2) : 0 }; }
  _upgrade(id) {
    const s = this.state, b = s.buildings.find(b => b.id === id && b.complete); if (!b) return this.notify('Complete the structure before upgrading it.');
    const cost = this.upgradeCost(b), staff = s.ants.filter(a => a.crew === 'warrior' && !a.staffOf && !a.pendingCrew);
    if (s.food < cost.food || s.energy < cost.energy || staff.length < cost.staff) return this.notify(`Upgrade needs ${cost.food} food, ${cost.energy} energy and ${cost.staff} warriors.`);
    if (s.time - b.lastDamage < 5) return this.notify('This structure is under attack.');
    // Payment and orders may be queued while paused; completion waits for a simulation step.
    if (b.upgrading) return this.notify('An upgrade is already queued.');
    s.food -= cost.food; s.energy -= cost.energy;
    for (const a of staff.slice(0, cost.staff)) { a.staffOf = b.id; a.phase = 'staff'; a.path = []; b.staff.push(a.id); }
    b.upgrading = true; return this.ok('Upgrade queued. Additional staff are on their way.');
  }
  _research(name) { const s = this.state, d = RESEARCH[name]; if (!d) return this.notify('Choose a valid improvement.'); const cost = Math.ceil(d.base * 1.7 ** s.research[name]); if (s.food < cost) return this.notify(`Needs ${cost} food.`); if (s.pendingResearch) return this.notify('Another improvement is queued.'); s.food -= cost; s.pendingResearch = name; return this.ok('Colony improvement queued.'); }
  _assign(crew, delta) {
    const s = this.state; if (!CREWS.includes(crew) || ![-1, 1].includes(delta)) return this.notify('Choose a crew and use + or −.');
    let target = crew, ant;
    if (delta > 0) ant = s.ants.find(a => !a.staffOf && !a.pendingCrew && a.crew !== crew && a.crew === 'food') || s.ants.find(a => !a.staffOf && !a.pendingCrew && a.crew !== crew);
    else { target = crew === 'food' ? 'dig' : 'food'; ant = [...s.ants].reverse().find(a => !a.staffOf && !a.pendingCrew && a.crew === crew); }
    if (!ant) return this.notify('No worker is available for this assignment.');
    const st = this.getStats(); if (target === 'warrior' && st.counts.warrior + st.pending.warrior >= st.mobileCap) return this.notify('Mobile warrior capacity reached. Build or upgrade barracks.');
    if (ant.jobId) { const j = s.jobs.find(j => j.id === ant.jobId); if (j) j.owner = null; ant.jobId = null; }
    if (ant.crew === 'food' && ['outbound', 'forage', 'inbound', 'cargo'].includes(ant.phase)) ant.pendingCrew = target;
    else { this._setCrew(ant, target); }
    return this.ok(ant.pendingCrew ? 'Worker will change crew after returning and unloading.' : 'Crew assignment updated.');
  }
  _setCrew(a, crew) { a.crew = crew; a.pendingCrew = null; a.phase = 'idle'; a.path = []; a.target = null; a.jobId = null; const hp = this.antMaxHp(crew); a.hp = Math.min(hp, a.hp / a.maxHp * hp); a.maxHp = hp; }
  antMaxHp(crew) { return crew === 'warrior' ? 65 * (1 + this.state.meta.upgrades.military * 0.15 + this.state.research.armor * 0.15) : 28; }
  _hatch(egg) { const s = this.state, st = this.getStats(); const crew = s.newCrew === 'warrior' && st.counts.warrior + st.pending.warrior >= st.mobileCap ? 'food' : s.newCrew; const b = s.buildings.find(b => b.id === egg.buildingId), p = b ? { x: b.x, y: b.y } : cell(s.queen); const maxHp = this.antMaxHp(crew); s.ants.push({ id: this.id('ant'), x: p.x, y: p.y, previousX: p.x, previousY: p.y, hp: maxHp, maxHp, crew, phase: 'idle', cargo: 0, path: [], jobId: null, staffOf: null, pendingCrew: null, cooldown: 0, target: null, forageUntil: 0, trip: null }); s.births++; s.peak = Math.max(s.peak, s.ants.length); if (s.births === 1) this.log('The first of many', 'Your first worker has joined the food crew. Assign a digger when the next worker hatches.', 'milestone'); }
  route(a, b, options = {}) {
    const s = this.state;
    if (this._routeRevision !== s.world.revision) { this._routes.clear(); this._routeRevision = s.world.revision; }
    if (options.danger || options.avoidBarriers) return pathfind(s, a, b, options);
    const aa = cell(a), bb = cell(b), k = `${aa.x},${aa.y}:${bb.x},${bb.y}`;
    if (!this._routes.has(k)) { if (this._routes.size > 6000) this._routes.clear(); this._routes.set(k, pathfind(s, aa, bb)); }
    const route = this._routes.get(k); return route === null ? null : route.map(p => ({ ...p }));
  }
  move(a, target, speed, dt, options = {}) {
    if (distance(a, target) < 0.06) { a.path = []; return true; }
    const targetCell = cell(target), signature = key(targetCell.x, targetCell.y);
    if (a.routeTarget !== signature || a.routeRevision !== this.state.world.revision || !a.path?.length) {
      a.path = this.route(a, targetCell, options) || []; a.routeTarget = signature; a.routeRevision = this.state.world.revision;
      if (a.path.length && distance(a, cell(a)) > 0.05) a.path.unshift(cell(a));
      if (!a.path.length && distance(a, targetCell) > 0.8) return false;
    }
    let remaining = speed * dt;
    while (remaining > 0 && a.path.length) {
      const next = a.path[0]; const d = distance(a, next);
      if (options.enemy) { const barrier = blockedAt(this.state, next.x, next.y); if (barrier) { a.blockedBy = barrier.id; return false; } }
      if (d <= remaining) { a.x = next.x; a.y = next.y; a.path.shift(); remaining -= d; }
      else { a.x += (next.x - a.x) / d * remaining; a.y += (next.y - a.y) / d * remaining; remaining = 0; }
    }
    if (!a.path.length && distance(a, targetCell) < 0.06) return true;
    return false;
  }
  advance(seconds, { exact = false } = {}) {
    const s = this.state; if (s.paused || s.status === 'defeat' || !Number.isFinite(seconds) || seconds <= 0) return;
    s.accumulator += (exact ? seconds : Math.min(seconds, 0.25) * s.speed);
    let steps = Math.floor((s.accumulator + 1e-9) / STEP); s.accumulator -= steps * STEP;
    while (steps-- > 0 && s.status !== 'defeat') this.step(STEP);
  }
  step(dt = STEP) {
    const s = this.state; if (s.paused || s.status === 'defeat') return;
    s.tick++; s.time = s.tick * STEP; this._frontage = new Map();
    for (const a of [s.queen, ...s.ants, ...s.enemies]) { a.previousX = a.x; a.previousY = a.y; a.cooldown = Math.max(0, a.cooldown - dt); }
    let st = this.getStats();
    const refundFood = Math.min(s.refundFood, Math.max(0, st.foodCap - s.food)), refundEnergy = Math.min(s.refundEnergy, Math.max(0, st.energyCap - s.energy));
    s.food += refundFood; s.refundFood -= refundFood; s.energy += refundEnergy; s.refundEnergy -= refundEnergy;
    s.energy = Math.min(st.energyCap, s.energy + st.recovery * dt);
    s.waste = Math.max(0, s.waste + (s.ants.length * 0.018 + s.eggs.length * 0.035 - st.wasteRate) * dt);
    s.effects = s.effects.filter(e => s.time - e.at < e.duration); s.deliveries = s.deliveries.filter(d => s.time - d.at < 60);
    if (s.pendingResearch) { const name = s.pendingResearch; s.research[name]++; delete s.pendingResearch; if (name === 'armor') for (const a of s.ants.filter(a => a.crew === 'warrior')) { a.maxHp = this.antMaxHp('warrior'); } this.log('Colony improved', RESEARCH[name].name); }
    this._buildings(dt); st = this.getStats(); this._queen(dt, st); this._brood(dt, st); this._raids(dt);
    if (s.time >= s.controllerAt) { this._controlArmy(); s.controllerAt = s.time + 0.75; }
    for (const a of [...s.ants]) if (a.hp > 0) this._ant(a, dt, st);
    this._defenses(dt); for (const e of [...s.enemies]) if (e.hp > 0) this._enemy(e, dt);
    this._cleanup();
    if (s.queen.hp <= 0) this._defeat();
    if (s.raid.phase === 'peace') { s.queen.hp = Math.min(s.queen.maxHp, s.queen.hp + dt * 0.4); for (const a of s.ants) a.hp = Math.min(a.maxHp, a.hp + dt * 0.65); }
    s.peak = Math.max(s.peak, s.ants.length); this._presentation = null;
  }
  _buildings(dt) {
    const s = this.state;
    for (const b of s.buildings) {
      const d = BUILDINGS[b.type];
      if (!b.complete && connected(s, b) && b.staff.every(id => { const a = s.ants.find(a => a.id === id); return a && distance(a, { x: b.x, y: b.y }) < 0.8; }) && b.staff.length >= d.staff) {
        b.complete = true;
        const index = ECONOMIC.indexOf(b.type); if (index >= 0 && index < ECONOMIC.length - 1 && !s.unlocked.includes(ECONOMIC[index + 1])) { s.unlocked.push(ECONOMIC[index + 1]); this.log('A new possibility', `${d.name} complete. ${BUILDINGS[ECONOMIC[index + 1]].name} unlocked.`, 'milestone'); }
        else this.log('Room to grow', `${d.name} is ready.`);
        if (b.type === 'queen' && s.status === 'founding') { s.status = 'active'; s.queen.jobId = null; for (const j of s.jobs) if (j.owner === 'queen') j.owner = null; }
      }
      if (b.complete && b.upgrading && b.staff.every(id => { const a = s.ants.find(a => a.id === id); return a && distance(a, { x: b.x, y: b.y }) < 1.5; })) { b.level++; b.maxHp *= 1.3; b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.3); b.upgrading = false; this.log('Stronger foundations', `${d.name} upgraded to level ${b.level}.`); }
      if (b.complete && b.type === 'prey' && s.time >= b.captureAt) {
        b.captureAt = s.time + 26 / b.level;
        const opening = entrances(s.world).find(p => this.route(p, { x: b.x, y: b.y }));
        if (opening) { s.drops.push({ id: this.id('prey'), x: opening.x, y: 0, amount: 3 * b.level, captureTarget: b.id, path: [], previousX: opening.x, previousY: 0 }); b.captures++; this.effect('capture', opening, center(b), '#a8b368', 1.3); }
      }
    }
    for (const drop of [...s.drops]) if (drop.captureTarget) { const b = s.buildings.find(b => b.id === drop.captureTarget && b.complete); if (!b) { delete drop.captureTarget; continue; } drop.previousX = drop.x; drop.previousY = drop.y; if (this.move(drop, { x: b.x, y: b.y }, 1.2, dt)) { s.food = Math.min(this.getStats().foodCap, s.food + drop.amount); s.drops = s.drops.filter(d => d.id !== drop.id); this.effect('food', center(b), center(b), '#8c9c45', 1.6); } }
  }
  _queen(dt, st) {
    const s = this.state, q = s.queen;
    if (s.status === 'founding') { this._dig(q, dt, st, true); return; }
    if (q.relocation && s.raid.phase !== 'peace') { q.relocation = null; q.path = []; this.log('Relocation canceled', 'Raid warning: the queen returns to her chamber.', 'warning'); }
    const b = s.buildings.find(b => b.type === 'queen' && b.complete);
    if (q.relocation) {
      const p = q.relocation;
      if (this.move(q, p, 0.7, dt)) { if (b) { b.x = p.x; b.y = p.y; q.home = { x: p.x, y: p.y }; s.world.revision++; } q.relocation = null; this.log('A new heart', 'The queen and her brood reached their new chamber.', 'milestone'); }
    } else if (b) this.move(q, { x: b.x + 1, y: b.y + 1 }, 0.7, dt);
    const e = s.enemies.find(e => e.hp > 0 && distance(e, q) <= 1.2 && lineOfSight(s.world, q, e));
    if (e && q.cooldown === 0) { this.hit(e, 11 * (1 + s.meta.upgrades.military * 0.15), q, 'queen'); q.cooldown = 1.1; }
  }
  _brood(dt, st) {
    const s = this.state;
    for (const egg of [...s.eggs]) { egg.progress += dt * st.efficiency / st.eggDuration; if (egg.progress >= 1) { this._hatch(egg); s.eggs = s.eggs.filter(e => e.id !== egg.id); } }
    if (s.eggsPaused || s.status === 'founding' || s.queen.relocation) return;
    for (const b of st.active.filter(b => b.type === 'queen' || b.type === 'brood')) {
      const slots = b.level * (b.type === 'brood' ? 2 : 1);
      let used = s.eggs.filter(e => e.buildingId === b.id).length;
      while (used < slots && (s.freeEgg || s.food >= st.eggCost)) { if (!s.freeEgg) s.food -= st.eggCost; s.freeEgg = false; s.eggs.push({ id: this.id('egg'), buildingId: b.id, progress: 0 }); used++; }
    }
  }
  _dig(a, dt, st, queen = false) {
    const s = this.state; let job = s.jobs.find(j => j.id === a.jobId && j.owner === a.id);
    if (!job) {
      a.jobId = null;
      for (const j of s.jobs) {
        if (j.owner) continue;
        const spots = neighbors(j).filter(p => isOpen(s.world, p.x, p.y)).map(p => ({ p, path: this.route(a, p) })).filter(o => o.path !== null).sort((a, b) => a.path.length - b.path.length);
        if (!spots.length) continue;
        job = j; job.owner = a.id; a.jobId = job.id; a.digSpot = spots[0].p; a.path = []; break;
      }
    }
    if (!job) { if (!queen) this._repairOrSalvage(a, dt); return; }
    if (!a.digSpot || !isOpen(s.world, a.digSpot.x, a.digSpot.y)) { job.owner = null; a.jobId = null; return; }
    if (!this.move(a, a.digSpot, queen ? 1.2 : this.workerSpeed(), dt)) return;
    if (s.energy <= 0.001) return;
    const energy = Math.min(s.energy, dt * 2.8), work = energy / 2.8;
    const hardness = 2.8 + terrainValue(s.seed, job.x, job.y) * 1.1;
    const rate = (1 + s.meta.upgrades.excavation * 0.18) * st.efficiency * (queen ? 1.5 + s.meta.upgrades.founding * 0.35 : 1);
    job.progress = Math.min(1, job.progress + work * rate / hardness); s.energy -= energy;
    if (job.progress >= 1) { excavate(s.world, job.x, job.y); s.jobs = s.jobs.filter(j => j.id !== job.id); a.jobId = null; this.effect('dig', job, job, '#b69a72', 0.5); }
  }
  workerSpeed() { const s = this.state; return 1.5 * (1 + s.research.speed * 0.12 + s.meta.upgrades.foraging * 0.05); }
  sheltered() { const s = this.state; return s.shelter || (s.autoShelter && s.raid.phase !== 'peace'); }
  _ant(a, dt, st) {
    const s = this.state;
    if (a.staffOf) {
      const b = s.buildings.find(b => b.id === a.staffOf); if (!b) { a.hp = 0; return; }
      a.stationed = this.move(a, { x: b.x, y: b.y }, this.workerSpeed(), dt) && b.complete; return;
    }
    if (a.crew === 'warrior') { this._warrior(a, dt); return; }
    const threat = s.enemies.find(e => e.hp > 0 && distance(e, a) < 2.2 && lineOfSight(s.world, a, e));
    if ((this.sheltered() || threat) && a.phase !== 'forage') {
      if (a.jobId) { const j = s.jobs.find(j => j.id === a.jobId); if (j) j.owner = null; a.jobId = null; }
      if (a.phase === 'outbound') { a.phase = 'inbound'; a.path = []; }
      if (a.cargo > 0 && a.trip) { this._forage(a, dt, st); return; }
      const refuge = this.route(a, cell(s.queen), { danger: true });
      if (refuge !== null && distance(a, s.queen) > 1) this.move(a, cell(s.queen), this.workerSpeed() * 1.2, dt, { danger: true });
      else if (threat) {
        const safe = neighbors(cell(a)).find(p => isOpen(s.world, p.x, p.y) && distance(p, threat) > distance(a, threat) + 0.3);
        if (safe) this.move(a, safe, this.workerSpeed(), dt);
        else if (distance(a, threat) <= 0.9 && a.cooldown === 0) { this.hit(threat, 2, a, 'civilian'); a.cooldown = 1.4; }
      }
      return;
    }
    if (a.crew === 'food') this._forage(a, dt, st);
    else if (a.crew === 'dig') this._dig(a, dt, st);
  }
  _forage(a, dt, st) {
    const s = this.state;
    if (a.phase === 'forage') { if (s.time < a.forageUntil) return; a.cargo = st.carry * (1 + Math.min(0.1, Math.max(0, st.counts.food - 1) * 0.005)); a.phase = 'inbound'; a.path = []; }
    if (a.phase === 'inbound' || a.phase === 'cargo') {
      const entry = a.trip?.entry || entrances(s.world)[0]; if (!entry) return;
      // Try another entrance if the preferred return route has an enemy on it.
      if (s.enemies.length && !this.route(a, entry, { danger: true })) {
        const alternative = entrances(s.world).find(p => this.route(a, p, { danger: true }));
        if (alternative) { a.trip.entry = alternative; a.path = []; return; }
        const threat = s.enemies.find(e => distance(e, a) < 1 && lineOfSight(s.world, a, e));
        if (threat && a.cooldown === 0) { this.hit(threat, 2, a, 'civilian'); a.cooldown = 1.4; } return;
      }
      if (this.move(a, entry, this.workerSpeed(), dt, { danger: !!s.enemies.length })) {
        const amount = Math.min(a.cargo, Math.max(0, st.foodCap - s.food));
        if (amount > 0) { s.food += amount; a.cargo -= amount; s.deliveries.push({ at: s.time, amount }); this.effect('food', a, a, '#8b9e53', 1); }
        if (a.cargo > 0.001) { a.phase = 'cargo'; return; }
        a.cargo = 0; a.phase = 'idle'; a.trip = null; if (a.pendingCrew) this._setCrew(a, a.pendingCrew);
      }
      return;
    }
    if (a.phase === 'outbound') {
      if (a.pendingCrew || this.sheltered()) { a.phase = 'inbound'; a.path = []; return; }
      if (this.move(a, a.trip.destination, this.workerSpeed(), dt)) { a.phase = 'forage'; a.forageUntil = s.time + 5 / st.efficiency; a.path = []; } return;
    }
    if (this.sheltered() || s.food >= st.foodCap - 0.01) { a.phase = 'idle'; return; }
    const openings = entrances(s.world).map(p => ({ p, path: this.route(a, p) })).filter(o => o.path !== null).sort((a, b) => a.path.length - b.path.length);
    if (!openings.length) return;
    const entry = openings[0].p, side = this.random() > 0.5 ? 1 : -1;
    // Trip endpoints are simulation locations. Camera movement never changes them.
    const xs = entrances(s.world).map(p => p.x);
    const destination = { x: (side < 0 ? Math.min(...xs) : Math.max(...xs)) + side * 13, y: 0 };
    a.trip = { entry, destination }; a.phase = 'outbound'; a.path = [];
  }
  _repairOrSalvage(a, dt) {
    const s = this.state;
    const b = s.buildings.find(b => b.complete && b.repair && b.hp < b.maxHp - 0.1 && s.time - b.lastDamage >= 6 && this.route(a, { x: b.x, y: b.y }));
    if (b) { a.task = 'repair'; if (this.move(a, { x: b.x, y: b.y }, this.workerSpeed(), dt)) { const hp = Math.min(9 * dt, b.maxHp - b.hp, s.food / 0.12, s.energy / 0.3); b.hp += hp; s.food -= hp * 0.12; s.energy -= hp * 0.3; } return; }
    const drop = s.drops.find(d => !d.captureTarget && this.route(a, d));
    if (drop) { a.task = 'salvage'; if (this.move(a, drop, this.workerSpeed(), dt)) { const amount = Math.min(drop.amount, Math.max(0, this.getStats().foodCap - s.food)); s.food += amount; drop.amount -= amount; if (drop.amount < 0.01) s.drops = s.drops.filter(d => d.id !== drop.id); } return; }
    a.task = 'idle';
  }
  _controlArmy() {
    const s = this.state, army = s.ants.filter(a => a.crew === 'warrior' && !a.staffOf && a.hp > 0);
    const threats = s.enemies.filter(e => e.hp > 0).sort((a, b) => distance(a, s.queen) - distance(b, s.queen));
    const reserve = army.length > 2 ? Math.max(1, Math.ceil(army.length * 0.3)) : 0, assigned = new Map();
    army.sort((a, b) => distance(a, s.queen) - distance(b, s.queen));
    for (let i = 0; i < army.length; i++) {
      const a = army[i]; a.order = i < reserve ? 'reserve' : 'rally'; a.target = null;
      const choices = i < reserve ? threats.filter(e => distance(e, s.queen) < 5) : threats;
      const e = choices.find(e => (!ENEMIES[e.type].flying || e.y >= 0) && (assigned.get(e.id) || 0) < Math.max(2, Math.ceil(e.hp / 45)) && this.route(a, e) !== null);
      if (e) { a.order = 'intercept'; a.target = e.id; assigned.set(e.id, (assigned.get(e.id) || 0) + 1); }
      a.destination = i < reserve ? cell(s.queen) : s.rally || { x: 0, y: 1 };
    }
  }
  _warrior(a, dt) {
    const s = this.state; let e = s.enemies.find(e => e.id === a.target && e.hp > 0);
    const near = s.enemies.filter(e => e.hp > 0 && distance(a, e) < 1.15 && e.y >= 0 && lineOfSight(s.world, a, e)).sort((x, y) => distance(a, x) - distance(a, y))[0];
    if (near) e = near;
    if (e) {
      if (distance(a, e) <= 1.15 && lineOfSight(s.world, a, e)) {
        const occupied = this._frontage.get(e.id) || 0;
        if (occupied < 4) { this._frontage.set(e.id, occupied + 1); if (a.cooldown === 0) { this.hit(e, 9 * (1 + s.meta.upgrades.military * 0.15 + s.research.armor * 0.15), a, 'warrior'); a.cooldown = 1; } }
        return;
      }
      // Each warrior gets an approach tile. Close combat has a finite attack frontage.
      const occupied = new Set(s.ants.filter(o => o.id !== a.id && o.crew === 'warrior' && !o.staffOf && distance(o, e) < 1.2).map(o => key(Math.round(o.x), Math.round(o.y))));
      const approach = neighbors(cell(e)).filter(p => isOpen(s.world, p.x, p.y) && !occupied.has(key(p.x, p.y))).map(p => ({ p, path: this.route(a, p) })).filter(o => o.path !== null).sort((x, y) => x.path.length - y.path.length)[0];
      if (approach) this.move(a, approach.p, this.workerSpeed(), dt); return;
    }
    const destination = a.destination || cell(s.queen);
    if (isOpen(s.world, destination.x, destination.y)) this.move(a, destination, this.workerSpeed(), dt);
  }
  effect(type, a, b, color, duration = 0.3) { this.state.effects.push({ id: this.id('fx'), type, x: a.x, y: a.y, tx: b.x, ty: b.y, color, at: this.state.time, duration }); if (this.state.effects.length > 160) this.state.effects.shift(); }
  hit(target, damage, source, cause) {
    if (target.hp <= 0) return;
    const armor = ENEMIES[target.type]?.armor || 0; target.hp -= damage * (1 - armor); target.lastDamage = this.state.time; target.lastHitBy = cause;
    this.effect('attack', source, target, source.type && ENEMIES[source.type] ? '#c26351' : '#d9ae55');
  }
  _defenses(dt) {
    const s = this.state;
    for (const b of s.buildings.filter(b => b.complete)) {
      const d = BUILDINGS[b.type]; b.cooldown = Math.max(0, b.cooldown - dt); if (!d.range || b.cooldown > 0) continue;
      const p = center(b), targets = s.enemies.filter(e => e.hp > 0 && distance(p, e) <= d.range && (!ENEMIES[e.type].flying || e.y >= 0 || d.flying) && lineOfSight(s.world, p, e)).sort((a, b) => distance(a, s.queen) - distance(b, s.queen));
      if (!targets.length) continue;
      b.cooldown = d.cooldown / (1 + (b.level - 1) * 0.08);
      const affected = d.splash ? targets.filter(e => distance(e, targets[0]) < d.splash) : [targets[0]];
      for (const e of affected) { if (d.slow) e.slowUntil = s.time + 5; else this.hit(e, d.damage * (1 + (b.level - 1) * 0.35 + s.meta.upgrades.military * 0.15), p, d.name); }
      this.effect(d.splash ? 'spray' : d.slow ? 'snare' : 'shot', p, targets[0], d.color, d.splash ? 0.6 : 0.25);
    }
  }
  _makeRaid() {
    const s = this.state, raid = s.raid, number = raid.number + 1;
    const budget = Math.floor(10 + (s.time / 210) ** 1.8 * 4.6), waveCount = Math.min(6, 2 + Math.floor((number - 1) / 2));
    const direction = this.random() < 0.5 ? 'west' : 'east', waves = [], roster = Object.keys(ENEMIES).filter(k => ENEMIES[k].minRaid <= number && (!['wasp', 'tunneller'].includes(k) || this.unlocked('outpost')));
    for (let w = 0; w < waveCount; w++) {
      let remaining = Math.max(4, Math.floor(budget / waveCount * (0.85 + w * 0.18))), special = 0; const wave = [];
      while (remaining >= 1) {
        const pool = roster.filter(k => ENEMIES[k].cost <= remaining && (special < 2 || !['wasp', 'tunneller', 'spider', 'thief'].includes(k)));
        if (!pool.length) break;
        let type = pool[Math.floor(this.random() * pool.length)]; if (number === 1) type = 'scout';
        if (ENEMIES[type].cost > remaining) break;
        wave.push(type); remaining -= ENEMIES[type].cost; if (['wasp', 'tunneller', 'spider', 'thief'].includes(type)) special++;
      }
      waves.push(wave);
    }
    const openings = entrances(s.world); const xs = openings.length ? openings.map(p => p.x) : [0];
    const x = (direction === 'west' ? Math.min(...xs) - 16 : Math.max(...xs) + 16);
    return { number, budget, direction, waves, spawn: { x, y: 0 }, threat: [...new Set(waves.flat())].map(k => ENEMIES[k].name).join(', '), fixedAt: s.time };
  }
  _raids() {
    const s = this.state, r = s.raid;
    if (r.phase === 'peace' && s.time >= r.nextAt - r.warning) { r.plan = this._makeRaid(); r.phase = 'warning'; this.log(`Raid ${r.plan.number} approaching`, `${r.plan.direction === 'west' ? 'West' : 'East'} approach. ${r.plan.threat}. Workers seek shelter.`, 'warning'); }
    if (r.phase === 'warning' && s.time >= r.nextAt) { r.phase = 'active'; r.number = r.plan.number; r.wave = 0; r.startedAt = s.time; r.waveAt = s.time; this._startWave(); }
    if (r.phase === 'intermission' && s.time >= r.waveAt) this._startWave();
    if (r.phase !== 'active') return;
    if (r.pending.length && s.time >= r.spawnAt) { this.spawnEnemy(r.pending.shift(), r.plan.spawn); r.spawnAt = s.time + 1.4; }
    if (!r.pending.length && !s.enemies.some(e => e.hp > 0)) {
      if (r.wave < r.plan.waves.length) { r.phase = 'intermission'; r.waveAt = s.time + 20; this.log('A moment to breathe', `Wave ${r.wave} cleared. The next wave arrives in 20 seconds.`); }
      else { r.highest = r.number; r.phase = 'peace'; r.lastEnded = s.time; r.nextAt = s.time + 450; r.plan = null; this.log(`Raid ${r.number} survived`, 'Repair your defenses, recover, and prepare. The next raid is growing stronger.', 'milestone'); }
    }
  }
  _startWave() { const s = this.state, r = s.raid; r.phase = 'active'; r.pending = [...r.plan.waves[r.wave]]; r.wave++; r.spawnAt = s.time; this.log(`Raid ${r.number} · wave ${r.wave}`, `${r.pending.length} attackers approach from the ${r.plan.direction}.`, 'danger'); }
  spawnEnemy(type, position) {
    const s = this.state, d = ENEMIES[type], strengthTime = s.raid.plan?.fixedAt ?? s.time, scale = 1 + Math.max(0, strengthTime - 350) / 700;
    const p = { x: position.x, y: d.flying ? -1 : position.y };
    const e = { id: this.id('enemy'), type, ...p, previousX: p.x, previousY: p.y, hp: d.hp * scale, maxHp: d.hp * scale, damage: d.damage * (1 + Math.max(0, strengthTime - 350) / 1400), cooldown: 0, path: [], slowUntil: 0, blockedBy: null, stolen: false, tunnelProgress: 0, warned: false };
    s.enemies.push(e); return e;
  }
  _enemy(e, dt) {
    const s = this.state, d = ENEMIES[e.type], speed = d.speed * (e.slowUntil > s.time ? 0.3 : 1);
    if (e.y < 0) {
      const entry = entrances(s.world).sort((a, b) => distance(e, a) - distance(e, b))[0] || { x: 0, y: 0 };
      if (Math.abs(e.x - entry.x) > 0.05) e.x += Math.sign(entry.x - e.x) * Math.min(Math.abs(e.x - entry.x), speed * dt);
      else e.y = Math.min(0, e.y + speed * dt); return;
    }
    if (d.thief && !e.stolen) {
      const brood = s.eggs.map(egg => ({ egg, b: s.buildings.find(b => b.id === egg.buildingId) })).find(o => o.b && distance(e, center(o.b)) < 1.8);
      if (brood) { s.eggs = s.eggs.filter(egg => egg.id !== brood.egg.id); e.stolen = true; e.path = []; this.log('Brood stolen', 'A rival is escaping with an egg. Stop it before it reaches the surface.', 'danger'); }
    }
    if (e.stolen) { const entry = entrances(s.world).sort((a, b) => distance(e, a) - distance(e, b))[0]; if (entry && this.move(e, { x: entry.x + (e.x < 0 ? -16 : 16), y: 0 }, speed, dt, { enemy: true })) { e.escaped = true; e.hp = 0; } }
    const barrier = e.blockedBy && s.buildings.find(b => b.id === e.blockedBy && b.complete && distance(e, center(b)) < 1.8); e.blockedBy = null;
    const nearby = s.ants.filter(a => a.hp > 0 && (!a.staffOf || !s.buildings.some(b => b.id === a.staffOf && b.complete && distance(a, { x: b.x, y: b.y }) < 0.8)) && a.phase !== 'forage' && distance(a, e) <= d.range && lineOfSight(s.world, e, a)).sort((a, b) => (a.crew === 'warrior' ? 0 : 1) - (b.crew === 'warrior' ? 0 : 1));
    let target = barrier || nearby[0];
    if (!target && distance(e, s.queen) <= d.range + 0.2 && lineOfSight(s.world, e, s.queen)) target = s.queen;
    if (!target) target = s.buildings.find(b => b.complete && distance(e, center(b)) <= d.range + Math.max(BUILDINGS[b.type].w, BUILDINGS[b.type].h) * 0.35 && lineOfSight(s.world, e, center(b)));
    if (target) { if (e.cooldown === 0) { this.hit(target, e.damage, e, d.name); e.cooldown = d.cooldown; } return; }
    if (e.stolen) return;
    if (d.tunnelling && distance(e, s.queen) > 1.2) {
      const from = cell(e), dest = cell(s.queen), options = neighbors(from).sort((a, b) => distance(a, dest) - distance(b, dest));
      const next = options[0];
      if (!isOpen(s.world, next.x, next.y) && next.y > 0) { if (!e.warned) { this.log('Underground breach', `A tunnelling rival is digging at (${next.x}, ${next.y}). Rally warriors to the queen.`, 'danger'); e.warned = true; } e.tunnelProgress += dt; this.effect('dig', next, next, '#bb7253', 0.3); if (e.tunnelProgress >= 5) { excavate(s.world, next.x, next.y); e.tunnelProgress = 0; } return; }
      this.move(e, next, speed, dt, { enemy: true }); return;
    }
    this.move(e, cell(s.queen), speed, dt, { enemy: true });
  }
  destroyBuilding(id) {
    const s = this.state, b = s.buildings.find(b => b.id === id); if (!b) return;
    for (const a of s.ants) if (a.staffOf === id) a.hp = 0;
    s.eggs = s.eggs.filter(e => e.buildingId !== id); s.buildings = s.buildings.filter(o => o.id !== id);
    for (const j of [...s.jobs]) if (j.blueprint === id) this._cancelJob(j.id);
    s.world.revision++; const st = this.getStats(); s.food = Math.min(s.food, st.foodCap); s.energy = Math.min(s.energy, st.energyCap);
    if (s.queen.relocation?.buildingId === id) s.queen.relocation = null;
    this.log('Structure lost', `${BUILDINGS[b.type].name} was destroyed. Its tunnels remain.`, 'danger');
  }
  _cleanup() {
    const s = this.state;
    for (const b of [...s.buildings]) if (b.hp <= 0) this.destroyBuilding(b.id);
    for (const a of s.ants.filter(a => a.hp <= 0)) { if (a.jobId) { const j = s.jobs.find(j => j.id === a.jobId); if (j) j.owner = null; } if (a.staffOf) { const b = s.buildings.find(b => b.id === a.staffOf); if (b) b.staff = b.staff.filter(id => id !== a.id); } s.losses++; }
    s.ants = s.ants.filter(a => a.hp > 0);
    for (const e of s.enemies.filter(e => e.hp <= 0 && !e.escaped)) s.drops.push({ id: this.id('drop'), ...cell(e), amount: Math.max(1, Math.round(ENEMIES[e.type].cost * (0.4 + 0.1 * this.getStats().prey))) });
    s.enemies = s.enemies.filter(e => e.hp > 0);
    // A reservation is released only by cancellation. Dead staff must be replaced by rebuilding.
  }
  prestigeAward() { const s = this.state; return Math.max(1, s.raid.highest * 4 + Math.floor(Math.sqrt(s.peak))); }
  _defeat() {
    const s = this.state; if (s.status === 'defeat') return;
    s.queen.hp = 0; s.status = 'defeat'; s.paused = true;
    const earned = this.prestigeAward();
    s.result = { highestRaid: s.raid.highest, peak: s.peak, time: s.time, cause: s.queen.lastHitBy || 'An enemy breached the queen’s defenses', earned };
    if (!s.meta.awarded.includes(s.id)) { s.meta.currency += earned; s.meta.runs++; s.meta.awarded.push(s.id); s.meta.bestRaid = Math.max(s.meta.bestRaid, s.raid.highest); s.meta.bestPopulation = Math.max(s.meta.bestPopulation, s.peak); s.meta.bestTime = Math.max(s.meta.bestTime, s.time); }
    this.log('The queen has fallen', `${s.result.cause}. Your colony’s legacy carries forward.`, 'danger');
  }
  _buyPrestige(branch) {
    const s = this.state, d = PERMANENT[branch]; if (!d || s.status !== 'defeat') return this.notify('Permanent improvements are available between colonies.');
    const level = s.meta.upgrades[branch], cost = d.base + level * 2; if (s.meta.currency < cost) return this.notify(`Needs ${cost} legacy seeds.`);
    s.meta.currency -= cost; s.meta.upgrades[branch]++; return this.ok(`${d.name} improved. This applies to your next colony.`);
  }
  serialize() { return JSON.stringify({ format: 'ant-colony', version: VERSION, state: this.state }); }
  static deserialize(text) {
    if (typeof text !== 'string' || text.length > 30_000_000) throw new Error('Save file is too large or invalid.');
    let parsed; try { parsed = JSON.parse(text); } catch { throw new Error('This is not a valid JSON save file.'); }
    if (parsed?.format !== 'ant-colony' || parsed.version !== VERSION) throw new Error('This save version is not supported.');
    // Keep early v1 local saves compatible with reservation accounting.
    if (parsed.state && typeof parsed.state === 'object') {
      parsed.state.refundFood ??= 0; parsed.state.refundEnergy ??= 0;
      if (parsed.state.queen && !parsed.state.queen.home) { const home = Array.isArray(parsed.state.buildings) && parsed.state.buildings.find(b => b.type === 'queen'); parsed.state.queen.home = home ? { x: home.x, y: home.y } : { x: Math.round(parsed.state.queen.x) - 1, y: Math.round(parsed.state.queen.y) - 1 }; }
    }
    validateSave(parsed.state); return new ColonyEngine({ state: parsed.state });
  }
}

function validateSave(s) {
  const finite = x => typeof x === 'number' && Number.isFinite(x), nonnegative = x => finite(x) && x >= 0;
  const assert = (test, message) => { if (!test) throw new Error(`Invalid save: ${message}.`); };
  assert(s && typeof s === 'object', 'missing colony');
  for (const k of ['time', 'tick', 'accumulator', 'food', 'energy', 'waste', 'peak', 'births', 'losses', 'rng', 'nextId', 'refundFood', 'refundEnergy']) assert(nonnegative(s[k]), k);
  assert(['founding', 'active', 'defeat'].includes(s.status) && [1, 2, 4].includes(s.speed) && typeof s.paused === 'boolean', 'game state');
  for (const k of ['ants', 'buildings', 'jobs', 'enemies', 'eggs', 'drops', 'effects', 'events', 'deliveries', 'unlocked']) assert(Array.isArray(s[k]), k);
  assert(s.queen && finite(s.queen.hp) && finite(s.queen.x) && finite(s.queen.y) && Array.isArray(s.queen.path), 'queen');
  assert(s.queen.home && Number.isSafeInteger(s.queen.home.x) && Number.isSafeInteger(s.queen.home.y), 'queen home');
  assert(s.world && typeof s.world.dug === 'object' && s.world.dug && s.world.chunks && s.world.bounds && nonnegative(s.world.revision), 'world');
  for (const k of Object.keys(s.world.dug)) assert(/^-?\d+,\d+$/.test(k) && Number(k.split(',')[1]) > 0, 'terrain coordinates');
  assert(s.meta && nonnegative(s.meta.currency) && nonnegative(s.meta.runs) && Array.isArray(s.meta.awarded), 'legacy');
  for (const branch of Object.keys(PERMANENT)) assert(Number.isInteger(s.meta.upgrades?.[branch]) && s.meta.upgrades[branch] >= 0, 'permanent improvement');
  for (const r of Object.keys(RESEARCH)) assert(Number.isInteger(s.research?.[r]) && s.research[r] >= 0, 'colony improvement');
  assert(s.raid && ['peace', 'warning', 'active', 'intermission'].includes(s.raid.phase) && nonnegative(s.raid.nextAt) && Array.isArray(s.raid.pending) && nonnegative(s.raid.highest), 'raid');
  assert(s.raid.phase === 'peace' || (s.raid.plan && Array.isArray(s.raid.plan.waves) && s.raid.plan.waves.every(w => Array.isArray(w) && w.every(t => ENEMIES[t]))), 'raid plan');
  const ids = new Set();
  for (const list of [s.ants, s.buildings, s.jobs, s.enemies, s.eggs, s.drops]) for (const item of list) { assert(typeof item.id === 'string' && !ids.has(item.id), 'duplicate or missing identifier'); ids.add(item.id); }
  for (const a of s.ants) assert(CREWS.includes(a.crew) && nonnegative(a.cargo) && finite(a.hp) && nonnegative(a.maxHp) && finite(a.x) && finite(a.y) && Array.isArray(a.path) && (!a.pendingCrew || CREWS.includes(a.pendingCrew)), 'worker');
  for (const b of s.buildings) assert(BUILDINGS[b.type] && Number.isInteger(b.x) && Number.isInteger(b.y) && nonnegative(b.hp) && Number.isInteger(b.level) && b.level > 0 && Array.isArray(b.staff) && b.staff.every(id => s.ants.some(a => a.id === id && a.staffOf === b.id)), 'structure');
  assert(s.buildings.filter(b => b.type === 'queen').length <= 1, 'multiple queens');
  for (const a of s.ants) assert(!a.staffOf || s.buildings.some(b => b.id === a.staffOf && b.staff.includes(a.id)), 'staff assignment');
  for (const e of s.enemies) assert(ENEMIES[e.type] && finite(e.hp) && finite(e.x) && finite(e.y) && Array.isArray(e.path), 'enemy');
  for (const j of s.jobs) assert(Number.isInteger(j.x) && Number.isInteger(j.y) && j.y > 0 && nonnegative(j.progress) && j.progress <= 1 && (!j.owner || j.owner === 'queen' || s.ants.some(a => a.id === j.owner)), 'excavation');
  for (const e of s.eggs) assert(nonnegative(e.progress) && s.buildings.some(b => b.id === e.buildingId), 'brood');
  assert(s.status !== 'defeat' || (s.result && nonnegative(s.result.earned) && s.meta.awarded.includes(s.id)), 'defeat record');
}
