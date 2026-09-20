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

/** Text on a PNG (base64, no data: prefix), or null if no engine or nothing found. */
export async function recognizeScreenText(pngBase64: string): Promise<string | null> {
  const engine = getOcrEngine();
  if (!engine || !(await engine.isAvailable())) return null;
  const result = await engine.recognize(Buffer.from(pngBase64, "base64"), LANGUAGES);
  const text = observationsToText(result);
  return text.trim() ? text : null;
}
