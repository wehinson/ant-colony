import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createGameServer } from "../scripts/server.mjs";

async function serve(t, basePath) {
  const server = createGameServer({ basePath });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

for (const base of ["/", "/ant-colony/"])
  test(`the game and its entire module graph load beneath ${base}`, async (t) => {
    const host = await serve(t, base),
      entry = host + base;
    const response = await fetch(entry),
      html = await response.text();
    assert.equal(response.status, 200);
    const pending = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
      (m) => new URL(m[1], entry).href,
    );
    const seen = new Set([entry]);
    while (pending.length) {
      const url = pending.pop();
      if (seen.has(url)) continue;
      seen.add(url);
      assert.ok(
        url.startsWith(entry),
        `Asset escaped the project path: ${url}`,
      );
      const asset = await fetch(url);
      assert.equal(asset.status, 200, url);
      const text = await asset.text();
      if (url.endsWith(".js")) {
        assert.match(asset.headers.get("content-type"), /javascript/);
        for (const match of text.matchAll(
          /(?:from\s*|import\s*)["'](\.[^"']+)["']/g,
        ))
          pending.push(new URL(match[1], url).href);
      }
    }
    assert.ok(
      [...seen].some((url) => url.endsWith("/engine/systems/combat.js")),
    );
    assert.ok([...seen].some((url) => url.endsWith("/engine/save.js")));
    assert.ok([...seen].some((url) => url.endsWith("/ui/style.css")));
  });

test("the Pages test server redirects the entry path and rejects private or outside paths", async (t) => {
  const host = await serve(t, "/ant-colony/");
  for (const path of ["/", "/ant-colony"]) {
    const result = await fetch(host + path, { redirect: "manual" });
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), "/ant-colony/");
  }
  assert.equal((await fetch(host + "/src/ui/app.js")).status, 404);
  assert.equal((await fetch(host + "/ant-colony/.git/config")).status, 403);
  assert.equal(
    (await fetch(host + "/ant-colony/%2e%2e%5cpackage.json")).status,
    403,
  );
  assert.equal(
    (await fetch(host + "/ant-colony/", { method: "POST" })).status,
    405,
  );
});
