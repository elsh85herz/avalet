import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 1_000_000;

let logDir: string | null = null;

/** Set once at startup by main.ts (app.getPath("logs")); tests leave it unset and only get console output. */
export function configureLog(dir: string | null): void {
  logDir = dir;
}

// Plain-text log next to the other macOS app logs (~/Library/Logs/Avalet/avalet.log).
// Timings and errors only; never transcript, screen text, or keys.
export function logLine(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  if (!process.env.AVALET_QUIET_LOG) console.log(line);
  if (!logDir) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, "avalet.log");
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    // logging must never break the app
  }
}
