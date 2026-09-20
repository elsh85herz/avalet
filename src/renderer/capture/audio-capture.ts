import { getBridge } from "../lib/bridge.js";
import { encodeWavBase64, resampleLinear } from "./wav-encode.js";

const CHUNK_SECONDS = 5;
const TARGET_SAMPLE_RATE = 16_000;
const PROCESSOR_BUFFER_SIZE = 4096;
// Auto-reconnect backoff after a track dies mid-session (permission revoked,
// device unplugged, loopback hiccup) — a few quick tries, then give up and
// leave it to the manual "Reconnect audio" action so we don't spin forever.
const RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000];
// getDisplayMedia has no built-in timeout — if the OS-level capture
// pipeline ever hangs (stuck permission state, no compositor, a driver
// hiccup) this is the only thing standing between that and Start blocking
// forever. Mic-only is always a safe fallback, so bail out and degrade
// instead of waiting indefinitely.
const SYSTEM_AUDIO_ACQUIRE_TIMEOUT_MS = 10_000;

export type AudioChannel = "me" | "other";

export type AudioDegradedState = { me: boolean; other: boolean };

export type AudioCaptureHandle = {
  stop: () => void;
  /** Manually re-acquires one channel (or both) right now, bypassing the
   * auto-retry backoff — used by the overlay's "Reconnect audio" button. */
  reconnect: (channel?: AudioChannel | "both") => Promise<void>;
};

export type AudioCaptureCallbacks = {
  /** Fires whenever either channel's up/down state changes. */
  onDegradedChange: (state: AudioDegradedState) => void;
};

type ChannelPipeline = {
  stream: MediaStream;
  audioContext: AudioContext;
  stop: () => void;
};

/**
 * Chunks one MediaStream's audio into ~5s 16kHz mono WAVs and ships each to
 * the main process tagged with `channel` — this is what gives the transcript
 * "Я:" / "Собеседник:" diarization-lite instead of one blended stream (see
 * live-session.ts). Each channel gets its own AudioContext/processor so a
 * failure or reconnect on one side never touches the other.
 */
function startChunkPipeline(stream: MediaStream, channel: AudioChannel): ChannelPipeline {
  const bridge = getBridge();
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
  const chunkTargetSamples = audioContext.sampleRate * CHUNK_SECONDS;
  let buffer: Float32Array[] = [];
  let bufferedSamples = 0;
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    buffer.push(new Float32Array(input));
    bufferedSamples += input.length;
    if (bufferedSamples < chunkTargetSamples) return;

    const merged = new Float32Array(bufferedSamples);
    let offset = 0;
    for (const part of buffer) {
      merged.set(part, offset);
      offset += part.length;
    }
    buffer = [];
    bufferedSamples = 0;

    const resampled = resampleLinear(merged, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    const base64 = encodeWavBase64(resampled, TARGET_SAMPLE_RATE);
    void bridge.capture.submitAudioChunk(base64, channel).catch((error) => {
      console.error(`[audio-capture:${channel}] failed to submit chunk:`, error);
    });
  };

  // ScriptProcessorNode requires a destination connection to fire in some
  // browsers; route to a muted gain node instead of speakers.
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return {
    stream,
    audioContext,
    stop: () => {
      stopped = true;
      processor.disconnect();
      source.disconnect();
      silentGain.disconnect();
      void audioContext.close();
    },
  };
}

async function acquireMicStream(): Promise<MediaStream> {
  const bridge = getBridge();
  const preferredDeviceId = await bridge.mic.getPreferred().catch(() => "");
  return navigator.mediaDevices.getUserMedia({
    audio: preferredDeviceId ? { deviceId: { exact: preferredDeviceId } } : true,
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Best-effort system-audio loopback — returns null if unavailable (mic-only is a safe fallback). */
async function acquireSystemAudioStream(): Promise<MediaStream | null> {
  const bridge = getBridge();
  try {
    await bridge.capture.enableLoopbackAudio();
  } catch (error) {
    console.warn("[audio-capture] enableLoopbackAudio failed:", error);
    return null;
  }

  const displayStreamPromise = navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  let displayStream: MediaStream;
  try {
    displayStream = await withTimeout(
      displayStreamPromise,
      SYSTEM_AUDIO_ACQUIRE_TIMEOUT_MS,
      "getDisplayMedia timed out",
    );
  } catch (error) {
    console.warn("[audio-capture] system audio loopback unavailable:", error);
    // In case it resolves later anyway, after we've stopped waiting — don't leak it.
    void displayStreamPromise.then((stream) => stream.getTracks().forEach((t) => t.stop())).catch(() => {});
    return null;
  }

  for (const track of displayStream.getVideoTracks()) {
    track.stop();
    displayStream.removeTrack(track);
  }
  if (displayStream.getAudioTracks().length === 0) return null;
  return displayStream;
}

export async function startAudioCapture(callbacks: AudioCaptureCallbacks): Promise<AudioCaptureHandle> {
  const pipelines: Partial<Record<AudioChannel, ChannelPipeline>> = {};
  const degraded: AudioDegradedState = { me: false, other: false };
  const reconnectAttempt: Record<AudioChannel, number> = { me: 0, other: 0 };
  const reconnectTimers: Partial<Record<AudioChannel, ReturnType<typeof setTimeout>>> = {};
  let stopped = false;

  function reportDegraded() {
    callbacks.onDegradedChange({ ...degraded });
  }

  function teardownChannel(channel: AudioChannel) {
    pipelines[channel]?.stop();
    delete pipelines[channel];
    const timer = reconnectTimers[channel];
    if (timer) clearTimeout(timer);
    delete reconnectTimers[channel];
  }

  function watchTrack(channel: AudioChannel, stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.onended = () => {
      if (stopped) return;
      degraded[channel] = true;
      reportDegraded();
      scheduleAutoReconnect(channel);
    };
  }

  async function bringUpChannel(channel: AudioChannel): Promise<boolean> {
    teardownChannel(channel);
    const stream = channel === "me" ? await acquireMicStream() : await acquireSystemAudioStream();
    if (!stream) return false;
    pipelines[channel] = startChunkPipeline(stream, channel);
    watchTrack(channel, stream);
    return true;
  }

  function scheduleAutoReconnect(channel: AudioChannel) {
    const attempt = reconnectAttempt[channel];
    if (attempt >= RECONNECT_DELAYS_MS.length) return; // give up — manual "Reconnect audio" stays available
    reconnectAttempt[channel] = attempt + 1;
    reconnectTimers[channel] = setTimeout(() => {
      void bringUpChannel(channel)
        .then((ok) => {
          if (ok) {
            reconnectAttempt[channel] = 0;
            degraded[channel] = false;
            reportDegraded();
          } else {
            scheduleAutoReconnect(channel);
          }
        })
        .catch(() => scheduleAutoReconnect(channel));
    }, RECONNECT_DELAYS_MS[attempt]);
  }

  const micOk = await bringUpChannel("me"); // mic is required — let its rejection propagate to the caller
  if (!micOk) throw new Error("microphone unavailable");
  const otherOk = await bringUpChannel("other");
  degraded.other = !otherOk;
  reportDegraded();

  return {
    stop: () => {
      stopped = true;
      teardownChannel("me");
      teardownChannel("other");
    },
    reconnect: async (channel = "both") => {
      const targets: AudioChannel[] = channel === "both" ? ["me", "other"] : [channel];
      for (const target of targets) {
        reconnectAttempt[target] = 0;
        const timer = reconnectTimers[target];
        if (timer) clearTimeout(timer);
        const ok = await bringUpChannel(target).catch(() => false);
        degraded[target] = !ok;
        if (!ok) scheduleAutoReconnect(target);
      }
      reportDegraded();
    },
  };
}
