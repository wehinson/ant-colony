import { createHash } from "node:crypto";

const base = new URL(process.argv[2] || "http://localhost:5174/ant-colony/");
if (!base.pathname.endsWith("/")) base.pathname += "/";
const response = await fetch(new URL("release.json", base), {
  cache: "no-store",
});
if (!response.ok) throw new Error(`Release manifest: HTTP ${response.status}`);
const release = await response.json();
if (process.argv[3] && release.commit !== process.argv[3])
  throw new Error(`Expected ${process.argv[3]}, found ${release.commit}`);
for (const [file, expected] of Object.entries(release.files)) {
  if (file === ".nojekyll") continue; // Hosting metadata is not a game asset.
  const url = new URL(file, base);
  if (!url.href.startsWith(base.href))
    throw new Error("Manifest path escapes the site.");
  const asset = await fetch(url, { cache: "no-store" });
  if (!asset.ok) throw new Error(`${file}: HTTP ${asset.status}`);
  const actual = createHash("sha256")
    .update(Buffer.from(await asset.arrayBuffer()))
    .digest("hex");
  if (actual !== expected)
    throw new Error(`File differs from the release: ${file}`);
}
console.log(
  `Verified ${Object.keys(release.files).length - 1} game files at ${base.href}`,
);
console.log(`Version ${release.version}; commit ${release.commit}`);
