import type { ChildProcess } from "node:child_process";
import { logLine } from "./log.js";
import {
  MODEL_SIZE_BYTES,
  cachedBytes,
  deleteModelFiles,
  isModelReady,
  progressPercent,
} from "./speech-models.js";
import { SPEECH_MODELS, type SpeechModelName, type SpeechModelRow } from "./shared/ipc-contract.js";

/** Starts one download attempt as its own process, so Cancel can simply kill it. */
export type DownloadSpawner = (model: SpeechModelName) => ChildProcess;

type Running = {
  proc: ChildProcess | null;
  attempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  stderrTail: string;
  cancelled: boolean;
};

export type ModelManagerOptions = {
  cacheDir: () => string;
  spawnDownload: DownloadSpawner;
  onChange: (rows: SpeechModelRow[]) => void;
  /** Waits before the automatic retries after a failed attempt (network drop). */
  retryDelaysMs?: number[];
  pollMs?: number;
};

/**
 * Speech model downloads with visible state: not downloaded, downloading with
 * progress, ready, error. A failed attempt (the network dropped, the host
 * timed out) is retried automatically a couple of times; the partial file is
 * kept, so every retry and every manual "Continue" resumes instead of starting
 * over. Nothing here runs unless the user pressed Download.
 */
export class SpeechModelManager {
  private running = new Map<SpeechModelName, Running>();
  private errors = new Map<SpeechModelName, string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot = "";
  private readonly retryDelaysMs: number[];
  private readonly pollMs: number;

  constructor(private readonly options: ModelManagerOptions) {
    this.retryDelaysMs = options.retryDelaysMs ?? [3_000, 10_000];
    this.pollMs = options.pollMs ?? 700;
  }

  isReady(name: SpeechModelName): boolean {
    return isModelReady(this.options.cacheDir(), name);
  }

  rows(): SpeechModelRow[] {
    const cacheDir = this.options.cacheDir();
    return SPEECH_MODELS.map((name) => {
      const sizeBytes = MODEL_SIZE_BYTES[name];
      const run = this.running.get(name);
      const ready = !run && isModelReady(cacheDir, name);
      const bytes = ready ? sizeBytes : Math.min(cachedBytes(cacheDir, name), sizeBytes);
      if (run) {
        return { name, state: "downloading", bytes, sizeBytes, percent: progressPercent(bytes, sizeBytes), attempt: run.attempt };
      }
      if (ready) return { name, state: "ready", bytes, sizeBytes, percent: 100 };
      const error = this.errors.get(name);
      if (error) return { name, state: "error", bytes, sizeBytes, percent: progressPercent(bytes, sizeBytes), error };
      return { name, state: "absent", bytes, sizeBytes, percent: progressPercent(bytes, sizeBytes) };
    });
  }

  download(name: SpeechModelName): void {
    if (this.running.has(name)) return;
    if (this.isReady(name)) {
      this.emit(true);
      return;
    }
    this.errors.delete(name);
    const run: Running = { proc: null, attempt: 0, retryTimer: null, stderrTail: "", cancelled: false };
    this.running.set(name, run);
    this.attempt(name, run);
    this.ensurePolling();
    this.emit(true);
  }

  cancel(name: SpeechModelName): void {
    const run = this.running.get(name);
    if (!run) return;
    run.cancelled = true;
    if (run.retryTimer) clearTimeout(run.retryTimer);
    run.proc?.kill();
    this.running.delete(name);
    logLine(`[models] ${name}: download cancelled`);
    this.emit(true);
  }

  /** Deletes a downloaded (or partly downloaded) model. A running download is cancelled first. */
  remove(name: SpeechModelName): void {
    this.cancel(name);
    this.errors.delete(name);
    deleteModelFiles(this.options.cacheDir(), name);
    logLine(`[models] ${name}: deleted`);
    this.emit(true);
  }

  dispose(): void {
    for (const name of [...this.running.keys()]) this.cancel(name);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private attempt(name: SpeechModelName, run: Running): void {
    run.attempt += 1;
    run.stderrTail = "";
    run.retryTimer = null;
    logLine(`[models] ${name}: download attempt ${run.attempt}`);
    let proc: ChildProcess;
    try {
      proc = this.options.spawnDownload(name);
    } catch (error) {
      this.finish(name, run, error instanceof Error ? error.message : String(error));
      return;
    }
    run.proc = proc;
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      run.stderrTail = `${run.stderrTail}${chunk}`.slice(-2_000);
    });
    let settled = false;
    const settle = (code: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      run.proc = null;
      if (run.cancelled || this.running.get(name) !== run) return;
      if (code === 0 && this.isReady(name)) {
        this.finish(name, run, null);
        return;
      }
      const message = spawnError?.message || lastLine(run.stderrTail) || `download exited with code ${code}`;
      const delay = this.retryDelaysMs[run.attempt - 1];
      if (delay === undefined) {
        this.finish(name, run, message);
        return;
      }
      logLine(`[models] ${name}: attempt ${run.attempt} failed (${message}), retrying in ${delay} ms`);
      run.retryTimer = setTimeout(() => this.attempt(name, run), delay);
      this.emit(true);
    };
    proc.on("error", (error) => settle(null, error));
    proc.on("exit", (code) => settle(code));
  }

  private finish(name: SpeechModelName, run: Running, error: string | null): void {
    if (this.running.get(name) === run) this.running.delete(name);
    if (error) {
      this.errors.set(name, error);
      logLine(`[models] ${name}: download failed: ${error}`);
    } else {
      logLine(`[models] ${name}: download finished`);
    }
    this.emit(true);
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (this.running.size === 0) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = null;
        return;
      }
      this.emit(false);
    }, this.pollMs);
  }

  private emit(force: boolean): void {
    const rows = this.rows();
    const snapshot = JSON.stringify(rows);
    if (!force && snapshot === this.lastSnapshot) return;
    this.lastSnapshot = snapshot;
    this.options.onChange(rows);
  }
}

function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}
