import type { TranscriptSegment } from "./shared/ipc-contract.js";

/** The lines a person reads, quotes and exports: filtered ones stay in the record only. */
export function visibleSegments(transcript: TranscriptSegment[]): TranscriptSegment[] {
  return transcript.filter((seg) => !seg.filtered);
}
