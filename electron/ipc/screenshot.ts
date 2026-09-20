import { desktopCapturer, screen } from "electron";

/**
 * Grabs a single downscaled screenshot of the primary display as a PNG,
 * base64-encoded (no data: prefix). Used as optional visual context for the
 * live-session's next generated block — not a continuous recording.
 */
export async function captureScreenshot(): Promise<{ base64: string; width: number; height: number }> {
  const display = screen.getPrimaryDisplay();
  // Downscale before capture — screenshots only need to be legible to the
  // model, not full resolution, and this keeps the request payload small.
  const thumbnailWidth = 1280;
  const scale = thumbnailWidth / display.size.width;
  const thumbnailSize = {
    width: thumbnailWidth,
    height: Math.round(display.size.height * scale),
  };

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error("No screen source available for screenshot");

  const png = source.thumbnail.toPNG();
  return {
    base64: png.toString("base64"),
    width: thumbnailSize.width,
    height: thumbnailSize.height,
  };
}
