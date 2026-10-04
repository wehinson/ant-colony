import { ColonyEngine } from "../src/engine/engine.js";
import { ECONOMIC, footprint } from "../src/engine/catalog.js";
import { excavate } from "../src/engine/world.js";
export function fixture() {
  const e = new ColonyEngine({ seed: 808 });
  e.command({ type: "start" });
  e.advance(70, { exact: true });
  Object.assign(e.state, {
    ants: [],
    eggs: [],
    eggsPaused: true,
    food: 500,
    energy: 500,
    unlocked: [...ECONOMIC],
  });
  e.state.raid.nextAt = 100000;
  return e;
}
export function room(e, type, x, y) {
  const b = e._place(type, x, y);
  for (const p of footprint(type, x, y)) excavate(e.state.world, p.x, p.y);
  b.complete = true;
  e.state.jobs = e.state.jobs.filter((j) => j.blueprint !== b.id);
  return b;
}
export function hatch(e, n, crew = "food") {
  for (let i = 0; i < n; i++) {
    e._hatch({ buildingId: e.state.buildings[0].id });
    e._setCrew(e.state.ants.at(-1), crew);
  }
  return e.state.ants.slice(-n);
}
