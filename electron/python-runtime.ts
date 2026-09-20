import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Talks JSON-RPC (newline-delimited) to python-sidecar/server.py over
 * stdin/stdout — keeps the heavy Python/ML runtime out of the Electron main
 * process without native Node bindings. Expects `python-sidecar/.venv`
 * created by `scripts/setup-python.sh` (see README); packaged builds ship
 * that venv under resources/python-sidecar.
 */
export class PythonRuntime {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";

  private resolveInterpreterPath(): string {
    const venvBin = process.platform === "win32" ? "Scripts/python.exe" : "bin/python3";
    return path.join(this.sidecarDir(), ".venv", venvBin);
  }

  private sidecarDir(): string {
    // In dev: <repo>/python-sidecar. Packaged: resources/python-sidecar (see
    // electron-builder.config.mjs extraResources).
    return app.isPackaged
      ? path.join(process.resourcesPath, "python-sidecar")
      : path.join(__dirname, "../python-sidecar");
  }

  getStatus(): { running: boolean; ready: boolean } {
    return { running: this.proc !== null, ready: this.ready };
  }

  async start(): Promise<void> {
    if (this.proc) return;
    const interpreter = this.resolveInterpreterPath();
    const script = path.join(this.sidecarDir(), "server.py");
    const proc = spawn(interpreter, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.proc = proc;

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      console.log(`[python-sidecar] ${chunk.trim()}`);
    });
    proc.on("exit", (code) => {
      console.error(`[python-sidecar] exited with code ${code}`);
      this.proc = null;
      this.ready = false;
      for (const { reject } of this.pending.values()) {
        reject(new Error("python-sidecar exited"));
      }
      this.pending.clear();
    });

    await this.waitForReady();
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("python-sidecar did not become ready in time")), 30_000);
      const check = setInterval(() => {
        if (this.ready) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
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
    if (!this.proc || !this.ready) throw new Error("python-sidecar is not running");
    const id = this.nextId++;
    const request = JSON.stringify({ id, command, params }) + "\n";
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.proc!.stdin.write(request);
    });
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    this.proc.kill();
    this.proc = null;
    this.ready = false;
  }
}
