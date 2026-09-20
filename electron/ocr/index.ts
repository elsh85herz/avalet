import { appleVisionEngine } from "./apple-vision.js";
import { observationsToText } from "./layout.js";
import type { OcrEngine } from "./types.js";

const LANGUAGES = ["ru-RU", "en-US"];

/**
 * Picks the recognizer for the current platform. Windows: register a helper
 * around Windows.Media.Ocr here (same OcrEngine shape, prints the same JSON as
 * native/ocr-mac). Linux: Tesseract. Until then those platforms report "no
 * engine" and screenshots go to vision models as images only.
 */
export function getOcrEngine(): OcrEngine | null {
  switch (process.platform) {
    case "darwin":
      return appleVisionEngine;
    default:
      return null;
  }
}

export async function isOcrAvailable(): Promise<boolean> {
  const engine = getOcrEngine();
  return engine ? engine.isAvailable() : false;
}

// A tiny image with a few words, only used to load the recognizer into memory
// before the first real screenshot, so that one does not pay the cold start.
const WARM_UP_PNG =
  "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";

export async function warmUpOcr(): Promise<void> {
  const engine = getOcrEngine();
  if (!engine || !(await engine.isAvailable())) return;
  await engine.recognize(Buffer.from(WARM_UP_PNG, "base64"), LANGUAGES);
}

/** Text on an image (PNG or JPEG, base64, no data: prefix), or null if no engine or nothing found. */
export async function recognizeScreenText(pngBase64: string): Promise<string | null> {
  const engine = getOcrEngine();
  if (!engine || !(await engine.isAvailable())) return null;
  const result = await engine.recognize(Buffer.from(pngBase64, "base64"), LANGUAGES);
  const text = observationsToText(result);
  return text.trim() ? text : null;
}
