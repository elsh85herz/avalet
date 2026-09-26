// Test double for `server.py --download <model>`: fills the Hugging Face cache
// the way huggingface_hub does (blobs/<sha>.incomplete growing, then renamed,
// then snapshot symlinks), with sparse files so no real disk space is used.
//
// FAKE_DOWNLOAD_MODE: ok (default) | fail (every attempt fails midway) |
// fail-once (the first attempt fails midway, the next resumes) | hang (stays
// at 30% until killed). FAKE_DOWNLOAD_STEP_MS: delay between steps (default 40).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SIZES = { small: 484_000_000, medium: 1_528_000_000, turbo: 1_618_000_000 };
const REPOS = {
  small: "models--Systran--faster-whisper-small",
  medium: "models--Systran--faster-whisper-medium",
  turbo: "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo",
};

function cacheDir() {
  const env = process.env;
  if (env.HF_HUB_CACHE) return env.HF_HUB_CACHE;
  if (env.HUGGINGFACE_HUB_CACHE) return env.HUGGINGFACE_HUB_CACHE;
  if (env.HF_HOME) return path.join(env.HF_HOME, "hub");
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "huggingface", "hub");
}

const model = process.argv[2];
if (!SIZES[model]) {
  process.stderr.write(`unknown model: ${model}\n`);
  process.exit(2);
}
const mode = process.env.FAKE_DOWNLOAD_MODE ?? "ok";
const stepMs = Number(process.env.FAKE_DOWNLOAD_STEP_MS ?? 40);
const root = path.join(cacheDir(), REPOS[model]);
const blobs = path.join(root, "blobs");
const snapshot = path.join(root, "snapshots", "rev1");
fs.mkdirSync(blobs, { recursive: true });
const weights = path.join(blobs, "weights");
const partial = `${weights}.incomplete`;
const failMarker = path.join(root, ".fake-failed-once");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const size = SIZES[model];
let have = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
if (!fs.existsSync(partial)) fs.writeFileSync(partial, "");

let grown = 0;
for (let step = 1; step <= 10; step++) {
  const target = Math.round((size * step) / 10);
  if (target <= have) continue;
  await sleep(stepMs);
  fs.truncateSync(partial, target); // sparse: grows the size without writing data
  have = target;
  grown += 1;
  // "fail" drops the connection after one step of every attempt (so each retry
  // makes some progress and still fails); "fail-once" drops it at 50% once.
  const failNow = (mode === "fail" && grown === 1) || (mode === "fail-once" && step === 5 && !fs.existsSync(failMarker));
  if (failNow) {
    if (mode === "fail-once") fs.writeFileSync(failMarker, "1");
    process.stderr.write("ConnectionError: connection reset by peer\n");
    process.exit(1);
  }
  if (mode === "hang" && step === 3) {
    await sleep(3_600_000);
  }
}

fs.renameSync(partial, weights);
for (const [name, content] of [["config", "{}"], ["tokenizer", "{}"]]) {
  fs.writeFileSync(path.join(blobs, name), content);
}
fs.mkdirSync(snapshot, { recursive: true });
fs.symlinkSync("../../blobs/weights", path.join(snapshot, "model.bin"));
fs.symlinkSync("../../blobs/config", path.join(snapshot, "config.json"));
fs.symlinkSync("../../blobs/tokenizer", path.join(snapshot, "tokenizer.json"));
fs.rmSync(failMarker, { force: true });
process.exit(0);
