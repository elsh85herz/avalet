import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 1_000_000;
/** An identical line within this window is counted, not written again. */
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

let logDir: string | null = null;
const lastWritten = new Map<string, { at: number; suppressed: number }>();

/** Set once at startup by main.ts (app.getPath("logs")); tests leave it unset and only get console output. */
export function configureLog(dir: string | null): void {
  logDir = dir;
  lastWritten.clear();
}

/**
 * Defence in depth: provider error texts sometimes quote the key back
 * (masked or not). Anything shaped like a key or a bearer token is cut out
 * before it reaches the file.
 */
export function redactSecrets(message: string): string {
  return message
    .replace(/\b(sk|pk|rk|key)-[A-Za-z0-9_*.-]{6,}/gi, "$1-[redacted]")
    .replace(/\b(Bearer|x-api-key:?|api[_-]?key[=:]\s*)\s*[A-Za-z0-9_*.\-+/=]{8,}/gi, "$1 [redacted]");
}

// Plain-text log next to the other macOS app logs (~/Library/Logs/Avalet/avalet.log).
// Timings and errors only; never transcript, screen text, or keys. The same
// warning repeated (a retry loop, a flapping connection) is written once per
// ten minutes with a count, not on every attempt.
export function logLine(message: string, now = Date.now()): void {
  const clean = redactSecrets(message);
  const seen = lastWritten.get(clean);
  if (seen && now - seen.at < REPEAT_WINDOW_MS) {
    seen.suppressed += 1;
    return;
  }
  const repeats = seen?.suppressed ? ` (${seen.suppressed} identical lines skipped since the last one)` : "";
  lastWritten.set(clean, { at: now, suppressed: 0 });
  if (lastWritten.size > 500) lastWritten.delete(lastWritten.keys().next().value!);
  const line = `${new Date(now).toISOString()} ${clean}${repeats}`;
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
