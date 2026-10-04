import test from "node:test";
import assert from "node:assert/strict";
import { fixture, hatch, room } from "./helpers.js";
test("lost blueprint staff can be replaced without paying for the blueprint again", () => {
  const e = fixture();
  hatch(e, 2, "warrior");
  assert.ok(e.command({ type: "build", building: "guard", x: -1, y: 2 }).ok);
  const post = e.state.buildings.at(-1);
  e.state.ants[0].hp = 0;
  e._cleanup();
  hatch(e, 1, "warrior");
  const food = e.state.food;
  assert.ok(e.command({ type: "restaff", id: post.id }).ok);
  assert.equal(e.state.food, food);
  assert.equal(post.staff.length, 2);
  assert.equal(e.command({ type: "restaff", id: post.id }).ok, false);
});
test("an already ordered upgrade cannot heal a structure during continued attack", () => {
  const e = fixture();
  const b = room(e, "barricade", 0, 1);
  assert.ok(e.command({ type: "upgrade", id: b.id }).ok);
  e.hit(b, 20, { x: 0, y: 0 }, "test attack");
  const hp = b.hp;
  e.advance(0.1, { exact: true });
  assert.equal(b.level, 1);
  assert.equal(b.hp, hp);
  e.advance(6, { exact: true });
  assert.equal(b.level, 2);
});
