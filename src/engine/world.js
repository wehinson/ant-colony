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
  // The surface is an open line, not millions of stored tiles. Link only its
  // entrances and relevant endpoints. A far blueprint cannot enlarge a search.
  const anchors = new Set([
    start.x,
    end.x,
    ...entrances(world).map((p) => p.x),
  ]);
  if (danger)
    for (const e of state.enemies) {
      if (e.hp <= 0 || e.y > 2) continue;
      for (let dx = -2; dx <= 2; dx++) anchors.add(Math.round(e.x) + dx);
    }
  const surface = [...anchors].sort((a, b) => a - b);
  const surfaceIndex = new Map(surface.map((x, i) => [x, i]));
  const adjacent = (p) => {
    if (p.y !== 0) return neighbors(p);
    const i = surfaceIndex.get(p.x),
      result = [{ x: p.x, y: 1 }];
    if (i > 0) result.push({ x: surface[i - 1], y: 0 });
    if (i + 1 < surface.length) result.push({ x: surface[i + 1], y: 0 });
    return result;
  };
  const visited = new Map([[key(start.x, start.y), null]]);
  const costs = new Map([[key(start.x, start.y), 0]]);
  const queue = [];
  const push = (node) => {
    queue.push(node);
    let i = queue.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (queue[parent].priority <= node.priority) break;
      queue[i] = queue[parent];
      i = parent;
    }
    queue[i] = node;
  };
  const pop = () => {
    const first = queue[0],
      last = queue.pop();
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < queue.length &&
          queue[child + 1].priority < queue[child].priority
        )
          child++;
        if (queue[child].priority >= last.priority) break;
        queue[i] = queue[child];
        i = child;
      }
      queue[i] = last;
    }
    return first;
  };
  push({ p: start, cost: 0, priority: 0 });
  let found = false;
  while (queue.length) {
    const { p, cost } = pop();
    if (cost !== costs.get(key(p.x, p.y))) continue;
    if (p.x === end.x && p.y === end.y) {
      found = true;
      break;
    }
    for (const n of adjacent(p)) {
      const k = key(n.x, n.y);
      if (!isOpen(world, n.x, n.y)) continue;
      if (avoidBarriers && blockedAt(state, n.x, n.y)) continue;
      if (
        danger &&
        state.enemies.some(
          (e) => e.hp > 0 && Math.hypot(e.x - n.x, e.y - n.y) < 1.5,
        )
      )
        continue;
      const nextCost = cost + Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
      if (nextCost >= (costs.get(k) ?? Infinity)) continue;
      visited.set(k, p);
      costs.set(k, nextCost);
      push({
        p: n,
        cost: nextCost,
        priority: nextCost + Math.abs(n.x - end.x) + Math.abs(n.y - end.y),
      });
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
