import { desktopCapturer, screen } from "electron";

// JPEG rather than PNG: encoding a full-screen PNG takes hundreds of
// milliseconds and produces megabytes, JPEG is several times faster and
// smaller with no visible loss for text at these qualities.
// The image sent to a vision model is downscaled (models resize anyway and a
// smaller payload uploads faster); the copy used for text recognition keeps
// more pixels, because small UI text is the first thing lost when shrinking.
const MODEL_WIDTH = 1280;
const MODEL_QUALITY = 80;
const OCR_WIDTH = 1920;
const OCR_QUALITY = 92;

export type Screenshot = {
  /** JPEG, base64, no data: prefix, at most MODEL_WIDTH wide. */
  base64: string;
  /** JPEG, base64, at most OCR_WIDTH wide, for text recognition. */
  ocrBase64: string;
  width: number;
  height: number;
};

/** Grabs one screenshot of the primary display; not a continuous recording. */
export async function captureScreenshot(): Promise<Screenshot> {
  const display = screen.getPrimaryDisplay();
  const capturedWidth = Math.min(OCR_WIDTH, Math.round(display.size.width * display.scaleFactor));
  const scale = capturedWidth / display.size.width;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: capturedWidth, height: Math.round(display.size.height * scale) },
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error("No screen source available for screenshot");

  const full = source.thumbnail;
  const size = full.getSize();
  const model = size.width > MODEL_WIDTH ? full.resize({ width: MODEL_WIDTH, quality: "good" }) : full;
  const modelSize = model.getSize();
  return {
    base64: model.toJPEG(MODEL_QUALITY).toString("base64"),
    ocrBase64: full.toJPEG(OCR_QUALITY).toString("base64"),
    width: modelSize.width,
    height: modelSize.height,
  };
}
