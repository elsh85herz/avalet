// Test mode only (AVALET_E2E=1): stands in for the microphone and system
// audio, which a Linux CI machine does not have. Feeds a few "audio" chunks
// into the normal pipeline; the fake sidecar (test/fixtures/fake-sidecar.mjs)
// turns each into the next line of a canned conversation. Inert otherwise.

type Ingest = (
  audioBase64: string,
  channel: "me" | "other",
  meta: { startedAt: number; endedAt: number; endedBySilence: boolean },
) => Promise<void>;

const CHANNELS: Array<"me" | "other"> = ["other", "me", "other", "other"];

export class FakeCapture {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sent = 0;

  constructor(
    private readonly ingest: Ingest,
    private readonly intervalMs = 1_500,
    private readonly maxChunks = CHANNELS.length,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.sent >= this.maxChunks) return this.stop();
      const channel = CHANNELS[this.sent % CHANNELS.length];
      this.sent += 1;
      const endedAt = Date.now();
      void this.ingest(Buffer.from(`FAKE-AUDIO-${this.sent}`).toString("base64"), channel, {
        startedAt: endedAt - 1_200,
        endedAt,
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
