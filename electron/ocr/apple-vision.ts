import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nativeDir } from "../platform/paths.js";
import type { OcrEngine, OcrResult } from "./types.js";

const HELPER_TIMEOUT_MS = 10_000;

// Packaged: resources/native (see electron-builder.config.mjs extraResources).
// Dev: <repo>/native/bin, built by scripts/build-native.sh.
function helperPath(): string {
  return path.join(nativeDir(), "avalet-ocr");
}

export const appleVisionEngine: OcrEngine = {
  id: "apple-vision",

  async isAvailable() {
    try {
      fs.accessSync(helperPath(), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },

  async recognize(png, languages) {
    const file = path.join(os.tmpdir(), `avalet-ocr-${randomUUID()}.img`);
    fs.writeFileSync(file, png);
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          helperPath(),
          [file, languages.join(",")],
          { timeout: HELPER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
          (error, out, stderr) => (error ? reject(new Error(stderr?.trim() || error.message)) : resolve(out)),
        );
      });
      return JSON.parse(stdout) as OcrResult;
    } finally {
      fs.rm(file, { force: true }, () => {});
    }
  },
};
