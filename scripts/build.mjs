import {
  mkdir,
  copyFile,
  cp,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(project, "dist");
if (relative(project, output) !== "dist")
  throw new Error("Invalid build output directory.");
execFileSync(process.execPath, ["scripts/check.mjs"], {
  cwd: project,
  stdio: "inherit",
});
// Only the verified project dist directory is replaced; source and saves stay outside it.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["index.html", "favicon.svg"])
  await copyFile(resolve(project, file), resolve(output, file));
await cp(resolve(project, "src"), resolve(output, "src"), { recursive: true });
await writeFile(resolve(output, ".nojekyll"), "");
const files = {};
async function hashFiles(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await hashFiles(path);
    else
      files[relative(output, path).replaceAll("\\", "/")] = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
  }
}
await hashFiles(output);
const { version } = JSON.parse(
  await readFile(resolve(project, "package.json"), "utf8"),
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: project,
  encoding: "utf8",
}).trim();
await writeFile(
  resolve(output, "release.json"),
  JSON.stringify({ version, commit, files }, null, 2) + "\n",
);
console.log(
  `Production game ${version} built in dist/ from ${commit.slice(0, 7)}. No runtime dependencies.`,
);
