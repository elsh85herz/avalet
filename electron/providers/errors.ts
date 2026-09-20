// Providers answer a refused image with a 4xx whose body mentions it. That is
// the signal to fall back to recognized text instead of failing the block.
// Adapter errors look like "<endpoint or provider> <status>: <response body>".
export function isImageRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(400|415|422)\b/.test(message) && /image|vision|multimodal|unsupported|unknown variant/i.test(message);
}
