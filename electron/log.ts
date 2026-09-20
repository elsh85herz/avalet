import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 1_000_000;

// Plain-text log next to the other macOS app logs (~/Library/Logs/Avalet/avalet.log).
// Timings and errors only; never transcript, screen text, or keys.
export function logLine(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    const dir = app.getPath("logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "avalet.log");
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    // logging must never break the app
  }
}
