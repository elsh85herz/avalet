// Runs every compiled test file with node's built-in runner. Collected here
// instead of listed in package.json so a new *.test.ts is never forgotten.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.name.endsWith(".test.js") ? [full] : [];
  });
}

const files = [...collect("dist-electron"), ...collect("dist-test/test")].sort();
if (files.length === 0) {
  console.error("run-tests: no compiled test files found; run the tsc steps first");
  process.exit(1);
}
const extra = process.argv.slice(2);
const result = spawnSync(process.execPath, ["--test", ...extra, ...files], {
  stdio: "inherit",
  env: { ...process.env, AVALET_QUIET_LOG: "1" },
});
process.exit(result.status ?? 1);
