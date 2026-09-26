import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { logLine } from "./log.js";
import { sidecarDir } from "./platform/paths.js";

export type SidecarCommand = { command: string; args: string[]; env?: NodeJS.ProcessEnv };

/** The real recognizer: python-sidecar/server.py inside its bundled venv. */
export function defaultSidecarCommand(): SidecarCommand {
  const venvBin = process.platform === "win32" ? "Scripts/python.exe" : "bin/python3";
  return {
    command: path.join(sidecarDir(), ".venv", venvBin),
    args: [path.join(sidecarDir(), "server.py")],
  };
}

/**
 * Talks JSON-RPC (newline-delimited) to python-sidecar/server.py over
 * stdin/stdout: keeps the heavy Python/ML runtime out of the Electron main
 * process without native Node bindings. Expects `python-sidecar/.venv`
 * created by `scripts/setup-python.sh` (see README); packaged builds ship
 * that venv under resources/python-sidecar. Tests and E2E pass a command for
 * a fake sidecar that speaks the same protocol.
 */
export class PythonRuntime {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private starting: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";

  constructor(
    private readonly resolveCommand: () => SidecarCommand = defaultSidecarCommand,
    private readonly readyTimeoutMs = 30_000,
  ) {}

  getStatus(): { running: boolean; ready: boolean } {
    return { running: this.proc !== null, ready: this.ready };
  }

  /** Starts the process once; concurrent callers share the same start. */
  start(): Promise<void> {
    if (this.proc && this.ready) return Promise.resolve();
    if (!this.starting) {
      this.starting = this.spawnAndWait().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  private async spawnAndWait(): Promise<void> {
    const { command, args, env } = this.resolveCommand();
    const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...env } });
    this.proc = proc;
    this.buffer = "";

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => logLine(`[python-sidecar] ${chunk.trim()}`));
    // A missing or broken interpreter must not surface as an uncaught error
    // dialog: it is reported to whoever asked to start it.
    proc.on("error", (error) => {
      logLine(`[python-sidecar] failed to start: ${error.message}`);
      if (this.proc === proc) this.detach(new Error(`python-sidecar failed to start: ${error.message}`));
    });
    proc.on("exit", (code) => {
      logLine(`[python-sidecar] exited with code ${code}`);
      if (this.proc === proc) this.detach(new Error("python-sidecar exited"));
    });
    // Writing to a process that just died raises EPIPE on stdin.
    proc.stdin.on("error", () => {});

    await this.waitForReady(proc);
  }

  private detach(error: Error): void {
    this.proc = null;
    this.ready = false;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  private waitForReady(proc: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        clearInterval(check);
        proc.off("error", onError);
        proc.off("exit", onExit);
        if (error) reject(error);
        else resolve();
      };
      const onError = (error: Error) => finish(error);
      const onExit = () => finish(new Error("python-sidecar exited before it was ready"));
      const timeout = setTimeout(() => {
        finish(new Error("python-sidecar did not become ready in time"));
        proc.kill();
      }, this.readyTimeoutMs);
      const check = setInterval(() => {
        if (this.ready) finish();
      }, 25);
      proc.once("error", onError);
      proc.once("exit", onExit);
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.event === "ready") {
        this.ready = true;
        continue;
      }
      const id = message.id;
      if (typeof id !== "number") continue;
      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(String(message.error ?? "sidecar error")));
    }
  }

  async call<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
    const proc = this.proc;
    if (!proc || !this.ready) throw new Error("python-sidecar is not running");
    const id = this.nextId++;
    const request = JSON.stringify({ id, command, params }) + "\n";
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      proc.stdin.write(request);
    });
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    this.detach(new Error("python-sidecar stopped"));
    proc.kill();
  }
}
