import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SPEECH_MODELS, type SpeechModelName } from "./shared/ipc-contract.js";

// Where faster-whisper keeps its models and how far a download has got,
// computed from the files on disk. No Python and no network: the Settings
// screen and the Start check can tell "not downloaded" from "ready" even when
// the recognizer process is not running.

/**
 * Size of each model's weights on the Hugging Face Hub (checked 2026-09-20);
 * config and tokenizer files add a few MB. Used for progress and the size
 * shown next to the model.
 */
export const MODEL_SIZE_BYTES: Record<SpeechModelName, number> = {
  small: 484_000_000,
  medium: 1_528_000_000,
  turbo: 1_618_000_000,
};

/**
 * Repository names end in these folders; the organisation part differs
 * ("Systran" for small and medium, another one for turbo) and has changed
 * between faster-whisper releases, so only the suffix is matched.
 */
export const MODEL_REPO_SUFFIX: Record<SpeechModelName, string> = {
  small: "faster-whisper-small",
  medium: "faster-whisper-medium",
  turbo: "faster-whisper-large-v3-turbo",
};

/** Files faster-whisper needs to load a model (see faster_whisper.utils.download_model). */
const REQUIRED_FILES = ["model.bin", "config.json", "tokenizer.json"];

/** Same resolution order as huggingface_hub.constants.HF_HUB_CACHE. */
export function hfHubCacheDir(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (env.HF_HUB_CACHE) return env.HF_HUB_CACHE;
  if (env.HUGGINGFACE_HUB_CACHE) return env.HUGGINGFACE_HUB_CACHE;
  if (env.HF_HOME) return path.join(env.HF_HOME, "hub");
  const xdg = env.XDG_CACHE_HOME || path.join(home, ".cache");
  return path.join(xdg, "huggingface", "hub");
}

/** Every cache folder that belongs to this model (normally one). */
export function modelFolders(cacheDir: string, name: SpeechModelName): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheDir);
  } catch {
    return [];
  }
  const suffix = `--${MODEL_REPO_SUFFIX[name]}`;
  return entries
    .filter((entry) => entry.startsWith("models--") && entry.endsWith(suffix))
    .map((entry) => path.join(cacheDir, entry));
}

function sumRegularFiles(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    // Symlinks are skipped: in the current layout snapshots/ only links to
    // blobs/, which are counted once there.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += sumRegularFiles(full);
    else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        // vanished while counting
      }
    }
  }
  return total;
}

/**
 * Bytes of this model on disk, finished or not. Covers both cache layouts:
 * - current: blobs/<sha> (and blobs/<sha>.incomplete while downloading), with
 *   snapshots/<rev>/<file> as symlinks into blobs;
 * - legacy / no-symlink: real files directly in snapshots/<rev>/ (older
 *   huggingface_hub, or file systems without symlinks), partial files as
 *   *.incomplete next to them.
 * Counting every regular file once, never following symlinks, gives the right
 * number for both.
 */
export function cachedBytes(cacheDir: string, name: SpeechModelName): number {
  return modelFolders(cacheDir, name).reduce((sum, folder) => sum + sumRegularFiles(folder), 0);
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size; // follows the snapshot symlink to the blob
  } catch {
    return -1;
  }
}

/** Path of a complete snapshot (all required files present and non-empty), or null. */
export function readySnapshot(cacheDir: string, name: SpeechModelName): string | null {
  for (const folder of modelFolders(cacheDir, name)) {
    const snapshots = path.join(folder, "snapshots");
    let revisions: string[];
    try {
      revisions = fs.readdirSync(snapshots);
    } catch {
      continue;
    }
    for (const revision of revisions) {
      const dir = path.join(snapshots, revision);
      if (REQUIRED_FILES.every((file) => fileSize(path.join(dir, file)) > 0)) return dir;
    }
  }
  return null;
}

export function isModelReady(cacheDir: string, name: SpeechModelName): boolean {
  return readySnapshot(cacheDir, name) !== null;
}

/** 0-100 while downloading. Never shows 100 before the download has actually finished. */
export function progressPercent(bytes: number, total: number, done = false): number {
  if (done) return 100;
  if (total <= 0 || bytes <= 0) return 0;
  return Math.min(99, Math.floor((bytes / total) * 100));
}

/** Removes the model's cache folders. Only ever touches models--*--<known suffix> inside the cache dir. */
export function deleteModelFiles(cacheDir: string, name: SpeechModelName): void {
  const root = path.resolve(cacheDir);
  for (const folder of modelFolders(cacheDir, name)) {
    const resolved = path.resolve(folder);
    if (path.dirname(resolved) !== root) continue;
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

export function isSpeechModel(value: unknown): value is SpeechModelName {
  return typeof value === "string" && (SPEECH_MODELS as string[]).includes(value);
}
