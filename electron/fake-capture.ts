// Test mode only (AVALET_E2E=1): stands in for the microphone and system
// audio, which a Linux CI machine does not have. Feeds a few "audio" chunks
// into the normal pipeline; the fake sidecar (test/fixtures/fake-sidecar.mjs)
// turns each into the next line of a canned conversation. Inert otherwise.

type Ingest = (
  audioBase64: string,
  channel: "me" | "other",
  meta: { startedAt: number; endedAt: number; endedBySilence: boolean },
) => Promise<void>;

/** One chunk: its channel, and whether it was spoken at the same moment as the one before (a mic copy, then the clean one). */
export type FakeChunk = { channel: "me" | "other"; sameTime?: boolean };

const CANNED: FakeChunk[] = [{ channel: "other" }, { channel: "me" }, { channel: "other" }, { channel: "other" }];

/**
 * Channel plans by FAKE_SIDECAR_SCRIPT; the words come from the fake
 * recognizer. "parcel" (CLOUD_TASK_6) matches test/fixtures/parcel-call.json
 * (a test keeps them in step): two lines reach both channels, the mic copy
 * first, which is how a doubled line gets past the live filter.
 */
export const FAKE_PLANS: Record<string, FakeChunk[]> = {
  parcel: [
    { channel: "me" },
    { channel: "me" },
    { channel: "other", sameTime: true },
    { channel: "me" },
    { channel: "other" },
    { channel: "me" },
    { channel: "me" },
    { channel: "other", sameTime: true },
    { channel: "me" },
    { channel: "me" },
    { channel: "other" },
    { channel: "me" },
    { channel: "other" },
  ],
};

export class FakeCapture {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sent = 0;
  private lastSpoken = { startedAt: 0, endedAt: 0 };

  constructor(
    private readonly ingest: Ingest,
    private readonly intervalMs = 1_500,
    private readonly plan: FakeChunk[] = CANNED,
    private readonly maxChunks = plan.length,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.sent >= this.maxChunks) return this.stop();
      const chunk = this.plan[this.sent % this.plan.length]!;
      this.sent += 1;
      const endedAt = Date.now();
      const spoken = chunk.sameTime ? this.lastSpoken : { startedAt: endedAt - 1_200, endedAt };
      this.lastSpoken = spoken;
      void this.ingest(Buffer.from(`FAKE-AUDIO-${this.sent}`).toString("base64"), chunk.channel, {
        ...spoken,
        endedBySilence: true,
      }).catch(() => {});
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reset(): void {
    this.stop();
    this.sent = 0;
  }
}
