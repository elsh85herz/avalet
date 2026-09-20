/**
 * One recognized piece of text with its position on the image. Coordinates are
 * normalized to 0-1 with the origin at the TOP-LEFT (engines that report
 * bottom-left, like Apple Vision, must convert before returning).
 */
export type OcrObservation = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
};

export type OcrResult = {
  observations: OcrObservation[];
  /** Pixel size of the recognized image, used to restore real proportions. */
  width: number;
  height: number;
};

/**
 * A platform's text recognizer. macOS uses Apple Vision (see apple-vision.ts);
 * Windows can plug in Windows.Media.Ocr the same way (a small helper that
 * prints the same JSON) and Linux can use Tesseract, without touching the
 * layout logic or the live session. Add an engine, register it in index.ts.
 */
export type OcrEngine = {
  id: string;
  isAvailable(): Promise<boolean>;
  /** `languages` are BCP-47 tags such as "ru-RU", "en-US". */
  recognize(png: Buffer, languages: string[]): Promise<OcrResult>;
};
