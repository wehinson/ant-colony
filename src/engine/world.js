import { key, cell, BUILDINGS, footprint } from "./catalog.js";

export function terrainValue(seed, x, y) {
  let n = Math.imul(x + 919, 374761393) ^ Math.imul(y + 613, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function ensureTerrain(world, x, y) {
  const cx = Math.floor(x / 16),
    cy = Math.floor(y / 16);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (cy + dy < 0) continue;
      const k = key(cx + dx, cy + dy);
      world.chunks[k] ??= {
        x: cx + dx,
        y: cy + dy,
        seed: Math.floor(
          terrainValue(world.seed, cx + dx, cy + dy) * 4294967295,
        ),
      };
    }
  world.bounds.minX = Math.min(world.bounds.minX, x - 12);
  world.bounds.maxX = Math.max(world.bounds.maxX, x + 12);
  world.bounds.maxY = Math.max(world.bounds.maxY, y + 10);
}
export function excavate(world, x, y) {
  if (y <= 0 || world.dug[key(x, y)]) return;
  world.dug[key(x, y)] = true;
  world.revision++;
  ensureTerrain(world, x, y);
}
export function isOpen(world, x, y) {
  return y === 0 || (y > 0 && !!world.dug[key(x, y)]);
}
export function neighbors(p) {
  return [
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
  ];
}
export function entrances(world) {
  return Object.keys(world.dug)
    .filter((k) => k.endsWith(",1"))
    .map((k) => ({ x: Number(k.split(",")[0]), y: 0 }));
}
export function buildingAt(state, x, y, completedOnly = false) {
  return state.buildings.find(
    (b) =>
      (!completedOnly || b.complete) &&
      x >= b.x &&
      y >= b.y &&
      x < b.x + BUILDINGS[b.type].w &&
      y < b.y + BUILDINGS[b.type].h,
  );
}
export function blockedAt(state, x, y) {
  const b = buildingAt(state, x, y, true);
  return b && BUILDINGS[b.type].blocking ? b : null;
}
export function pathfind(
  state,
  from,
  to,
  { avoidBarriers = false, danger = false } = {},
) {
  const start = cell(from),
    end = cell(to),
    world = state.world;
  if (!isOpen(world, start.x, start.y) || !isOpen(world, end.x, end.y))
    return null;
  if (start.x === end.x && start.y === end.y) return [];
  const minX = Math.min(world.bounds.minX, start.x - 1, end.x - 1),
    maxX = Math.max(world.bounds.maxX, start.x + 1, end.x + 1);
  const visited = new Map([[key(start.x, start.y), null]]),
    queue = [start];
  let found = false;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === end.x && p.y === end.y) {
      found = true;
      break;
    }
    for (const n of neighbors(p)) {
      const k = key(n.x, n.y);
      if (
        visited.has(k) ||
        n.x < minX ||
        n.x > maxX ||
        !isOpen(world, n.x, n.y)
      )
        continue;
      if (avoidBarriers && blockedAt(state, n.x, n.y)) continue;
      if (
        danger &&
        state.enemies.some(
          (e) => e.hp > 0 && Math.hypot(e.x - n.x, e.y - n.y) < 1.5,
        )
      )
        continue;
      visited.set(k, p);
      queue.push(n);
    }
  }
  if (!found) return null;
  const result = [];
  let p = end;
  while (p && (p.x !== start.x || p.y !== start.y)) {
    result.push(p);
    p = visited.get(key(p.x, p.y));
  }
  return result.reverse();
}
export function connected(state, b) {
  return (
    footprint(b.type, b.x, b.y).every((p) => isOpen(state.world, p.x, p.y)) &&
    pathfind(state, { x: b.x, y: b.y }, { x: 0, y: 0 }) !== null
  );
}
export function lineOfSight(world, a, b) {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * 4);
  for (let i = 1; i < steps; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / steps),
      y = Math.round(a.y + ((b.y - a.y) * i) / steps);
    if (y > 0 && !isOpen(world, x, y)) return false;
  }
  return true;
}
