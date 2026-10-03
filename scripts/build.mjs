import { mkdir, copyFile, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/check.mjs"], { stdio: "inherit" });
await mkdir("dist", { recursive: true });
for (const file of ["index.html", "favicon.svg"])
  await copyFile(file, `dist/${file}`);
await cp("src", "dist/src", { recursive: true });
console.log("Production game built in dist/. No runtime dependencies.");
