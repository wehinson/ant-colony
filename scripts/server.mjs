import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

export function createGameServer({ root = ".", basePath = "/" } = {}) {
  const directory = resolve(root);
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (!/^\/(?:[\w-]+\/)*$/.test(base))
    throw new Error("Use a site path such as /ant-colony/.");
  return http.createServer(async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (
        base !== "/" &&
        (pathname === "/" || pathname === base.slice(0, -1))
      ) {
        res.writeHead(302, { Location: base + url.search }).end();
        return;
      }
      if (!pathname.startsWith(base)) {
        res.writeHead(404).end("Not found");
        return;
      }
      const relative = pathname.slice(base.length) || "index.html";
      const file = resolve(directory, relative);
      if (
        !file.startsWith(directory + sep) ||
        relative.split(/[\\/]/).some((p) => p.startsWith(".")) ||
        !types[extname(file)]
      ) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (!(await stat(file)).isFile()) throw new Error("Not found");
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] + "; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      dist: { type: "boolean", default: false },
      port: { type: "string" },
      base: { type: "string", default: "/" },
    },
  });
  const port = Number(values.port ?? process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Choose a valid port from 0 to 65535.");
  const server = createGameServer({
    root: values.dist ? "dist" : ".",
    basePath: values.base,
  });
  server.on("error", (error) => {
    console.error(`Test server could not start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Ant Colony is ready at http://localhost:${server.address().port}${values.base.endsWith("/") ? values.base : values.base + "/"}`,
    ),
  );
}
