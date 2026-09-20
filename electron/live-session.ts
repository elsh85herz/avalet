import { randomUUID } from "node:crypto";
import { generate } from "./providers/index.js";
import { PROVIDER_PRESETS } from "./providers/types.js";
import { isImageRejection } from "./providers/errors.js";
import { logLine } from "./log.js";
import { EchoFilter } from "./echo-filter.js";
import {
  getApiKey,
  getAutoDetectEnabled,
  getMeetingMode,
  getScreenshotTextEnabled,
  getSpeechLanguage,
  getSpeechModel,
  getProviderSettings,
  getSelectedProviderId,
  getSessionContext,
} from "./settings-store.js";
import { MODE_INSTRUCTIONS } from "./modes.js";
import type { PythonRuntime } from "./python-runtime.js";

const BASE_SYSTEM_PROMPT = [
  "You are a live meeting copilot for a systems/business analyst.",
  "You see a rolling transcript of the current call and, sometimes, a screenshot of the analyst's screen. Transcript lines are tagged '[Я]:' for the analyst's own mic and '[Собеседник]:' for the other participant(s) captured via system audio — use that to tell who said what (e.g. answer what the other side actually asked, don't mistake the analyst's own words for a question addressed to them).",
  // Explicit and repeated on purpose — a screenshot-only ask has no
  // transcript to match, and the model otherwise defaults to whatever
  // language the screenshot/question happens to be in. Fixed, not
  // user-configurable — there's no "answer in English" mode.
  "Always answer in Russian (по-русски) as prose, regardless of the language of the transcript, the screenshot, or the question.",
  "When asked to design or produce something concrete — a database schema, an ER diagram, an API contract, a process flow, a document structure — give a concrete draft immediately, stating your assumptions inline (e.g. \"assuming users can have multiple roles\"), instead of opening with a list of clarifying questions. A rough draft the analyst can react to is more useful live than a questionnaire.",
  "If you already gave a draft earlier in this call (see below), revise and extend that same draft as new details arrive instead of restarting from scratch or re-asking what it already covers.",
  "Otherwise, produce short, concrete, immediately useful suggestions: clarifying questions to ask, gaps in the requirement being discussed, risks, or a crisp restatement of what was just said. If something is genuinely blocking, ask at most one or two sharp questions after the draft, not instead of it.",
  "In any technical draft (schema, code, API, config), keep identifiers — table/column/field names, endpoint paths, variable and function names — in English always, regardless of what language you're explaining in; that's the standard engineering convention independent of the team's spoken language. Add a short comment or gloss next to a non-obvious identifier in the response language if it helps, but never translate the identifier itself.",
  "For an actual diagram (ER diagram, flowchart, sequence/class/UML diagram, architecture diagram — anything drawn as mermaid/plantuml/ASCII boxes-and-arrows), draw the whole diagram in English by convention — box/node labels, relationship text, everything inside the diagram itself, not just the identifiers rule above — the way real engineering diagrams are normally done internationally. Keep only the prose explanation around the diagram in Russian.",
  "Keep each response to a few sentences or a short bullet list — this is glanced at during a live call, not read at leisure.",
].join(" ");

const SCREEN_TEXT_WITH_IMAGE_INSTRUCTION =
  "The text recognized on that same screen by OCR is included below the transcript. Trust the image for layout, diagrams, tables, and states, and the recognized text for exact characters (names, numbers, code); the recognized text may contain small errors and only approximates indentation.";

// When the model cannot take images (or the provider refused one) the screen
// reaches it only as recognized text.
const SCREEN_TEXT_ONLY_INSTRUCTION =
  "You cannot see the analyst's screen as an image. Below the transcript is the text recognized on it by OCR, with approximate layout (indentation and columns are estimated; diagrams, pictures, and colors are not represented, and the text may contain small errors). The analyst asked for a priority read of what is on screen. If it shows a concrete task, question, or problem to solve, solve or answer it directly and completely, stating any assumption you had to make because something was not readable or was missing. If the text looks like part of a diagram or is clearly incomplete, say what is missing instead of guessing.";

const SCREEN_UNAVAILABLE_NOTE =
  "[The analyst asked to read what is on their screen, but no screen content could be captured with the current model and platform. Say this in one short sentence and continue with what the transcript gives you.]";

// Only added when a screenshot is actually attached (see runGeneration) —
// the analyst asked for this explicitly, so if the screen shows something
// solvable, solve it outright instead of just suggesting what to ask.
const SCREENSHOT_INSTRUCTION =
  "A screenshot of the analyst's screen is attached because they explicitly asked for it to be read right now. If it shows a concrete task, question, or problem to solve — a written exercise, an interview-style question, a code snippet, a form — solve it or answer it directly and completely, don't just suggest a clarifying question. Only fall back to a suggestion-style answer if there's no actual task or question visible on screen.";

// The overlay is meant to stay on the current draft/answer until the
// conversation actually moves on — a new question the current block
// doesn't answer, or an explicit ask to change what's on screen — not
// reflow on a raw volume/time cadence (that read as "constantly changing,
// can't keep up reading it"). QUESTION_CUE/CHANGE_CUE are a cheap regex
// gate over the freshly-heard transcript segment (no extra model call, no
// added latency) approximating "did something happen that warrants a new
// block". MAX_INTERVAL_MS/FALLBACK_CHARS are only a safety net for a real
// question that doesn't match either pattern, so the overlay can't get
// stuck forever on a stale block.
const QUESTION_CUE =
  /[?？]|(?:^|[\s,.!;:—-])(что такое|в чём разниц|чем отлича|объясни|поясни|расскажи|как (?:сделать|работает|устроен|реализ)|почему|зачем|подскажи|what'?s|what is|how (?:do|does|can|would|should)|why (?:is|does|would)|can you|could you|explain|difference between)/iu;
const CHANGE_CUE =
  /(давай|нужно|надо|стоит|можем ли|let'?s|we (?:should|need to)|please)\s+(поменя\w*|измени\w*|обнов\w*|добав\w*|убер\w*|перепиш\w*|change|update|modify|add|remove|revise|rewrite)/iu;
const MIN_INTERVAL_MS = 6_000;
const MAX_INTERVAL_MS = 45_000;
const FALLBACK_CHARS = 260;
// Smaller than before (was 4000) — a shorter prompt means less for the
// model to re-process on every call, which is most of what "slow to
// respond" actually is: latency scales with how much context is sent, not
// just model choice.
const TRANSCRIPT_CHAR_BUDGET = 2_200;
// Caps how much of the model's own previous answer gets fed back in for
// "revise the draft" continuity — answers are meant to be short already,
// this just guards against one runaway response bloating every prompt after it.
const LAST_ANSWER_CHAR_BUDGET = 3_000;
// A model that sees the image should not wait long for the extra recognized
// text: past this the request goes out with the image alone.
const OCR_WAIT_BUDGET_MS = 1_200;
// Transcribing a 5s chunk slower than this is worth a line in the log.
const SLOW_TRANSCRIBE_MS = 2_000;
// The end of the previous chunk of the same channel is fed to whisper as a
// prompt: chunks are cut mid-sentence, and the context keeps the boundary
// words and the spelling of names consistent.
const PROMPT_TAIL_CHARS = 200;
// Domain words the analyst's calls are full of; nudges whisper toward the
// right spelling instead of a phonetic guess.
const SPEECH_HOTWORDS =
  "API, REST, SOAP, Jira, Confluence, BRD, FRD, user story, SLA, ER-диаграмма, Kafka, PostgreSQL, микросервис, авторизация, интеграция, требования";

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export type LiveBlock = {
  id: string;
  text: string;
  status: "streaming" | "done" | "error";
};

/** "me" = analyst's own mic, "other" = system-audio loopback (the other side of the call). */
export type AudioChannel = "me" | "other";

export type LiveSessionEvents = {
  onBlockStart: (block: LiveBlock) => void;
  onBlockDelta: (id: string, delta: string) => void;
  onBlockDone: (id: string) => void;
  onBlockError: (id: string, message: string) => void;
  onStateChange: (state: "idle" | "listening" | "paused") => void;
  /** A transcription chunk failed twice in a row — surfaced so the UI can
   * show something instead of the failure only ever reaching the console. */
  onTranscriptionError: (message: string) => void;
  /** Fires once transcription succeeds again after having been in error. */
  onTranscriptionRecovered: () => void;
  /** Every non-empty transcribed chunk, in order, for the meeting record. */
  onTranscriptSegment: (segment: { at: number; speaker: AudioChannel; text: string }) => void;
};

// Skip the first blip — a single dropped chunk is normal noise (a hiccup in
// the sidecar, a momentarily busy CPU); only surface it once it's clearly
// not self-healing.
const TRANSCRIPTION_ERROR_THRESHOLD = 2;

function buildSystemPrompt(options: { includeScreenshot?: boolean; includeScreenText?: boolean } = {}): string {
  let prompt = BASE_SYSTEM_PROMPT;
  const modeInstruction = MODE_INSTRUCTIONS[getMeetingMode()];
  if (modeInstruction) prompt = `${prompt} ${modeInstruction}`;
  if (options.includeScreenshot) {
    prompt = `${prompt} ${SCREENSHOT_INSTRUCTION}`;
    if (options.includeScreenText) prompt = `${prompt} ${SCREEN_TEXT_WITH_IMAGE_INSTRUCTION}`;
  } else if (options.includeScreenText) {
    prompt = `${prompt} ${SCREEN_TEXT_ONLY_INSTRUCTION}`;
  }
  const context = getSessionContext().trim();
  if (!context) return prompt;
  return `${prompt}\n\nBriefing the analyst prepared before this call (ticket/spec/agenda) — use it to ground your suggestions:\n${context}`;
}

/**
 * Owns the rolling transcript + generation loop. Audio capture and screen
 * capture stay outside this class (renderer captures audio, main captures
 * screenshots) — this is just "transcript deltas in, suggestion blocks out".
 */
export class LiveSession {
  private transcript = "";
  // Raw text heard since the last generated block — scanned for
  // QUESTION_CUE/CHANGE_CUE in maybeTrigger, reset whenever a block starts
  // (auto or manual). Distinct from `transcript`, which keeps rolling
  // regardless of whether a block was ever generated from it.
  private segmentSinceTrigger = "";
  private lastGenerateAt = 0;
  private generating = false;
  private paused = true;
  private abortController: AbortController | null = null;
  // The last successfully completed answer, so a follow-up generation can
  // revise/extend a draft (e.g. a schema) instead of starting over with no
  // memory of what it already proposed — the model otherwise only sees the
  // raw audio transcript, never its own prior output.
  private lastAnswer = "";
  private consecutiveTranscriptionFailures = 0;
  private readonly echo = new EchoFilter(Date.now, (text) =>
    logLine(`[echo] dropped a mic segment that repeats the other side (${text.length} chars)`),
  );
  private readonly promptTail: Record<AudioChannel, string> = { me: "", other: "" };

  constructor(
    private readonly pythonRuntime: PythonRuntime,
    private readonly events: LiveSessionEvents,
    /** Grabs a fresh screenshot just before a block is generated; null on failure/no screen access. */
    private readonly captureScreen: () => Promise<{ image: string; ocrImage: string } | null>,
    /** Text on a screenshot (PNG base64), or null when no recognizer is available. */
    private readonly recognizeText: (pngBase64: string) => Promise<string | null>,
  ) {}

  getState(): "idle" | "listening" | "paused" {
    if (this.paused) return this.transcript.length > 0 ? "paused" : "idle";
    return "listening";
  }

  start(): void {
    this.paused = false;
    this.events.onStateChange(this.getState());
  }

  stop(): void {
    this.paused = true;
    this.echo.flush();
    this.abortController?.abort();
    this.events.onStateChange(this.getState());
  }

  reset(): void {
    this.echo.reset();
    this.promptTail.me = "";
    this.promptTail.other = "";
    this.transcript = "";
    this.segmentSinceTrigger = "";
    this.lastAnswer = "";
  }

  /** Called with a base64 16-bit PCM mono WAV chunk (~5s) from the renderer's capture pipeline. */
  async ingestAudioChunk(
    audioBase64: string,
    channel: AudioChannel,
    meta: { startedAt: number; endedAt: number; endedBySilence: boolean },
  ): Promise<void> {
    if (this.paused) return;
    // When the words were spoken, from the capture side, so the two channels
    // line up in time regardless of how long each took to transcribe.
    const spoken = { start: meta.startedAt, end: meta.endedAt };
    const transcribeStartedAt = Date.now();
    let text: string;
    try {
      const language = getSpeechLanguage();
      const result = await this.pythonRuntime.call<{ text: string }>(
        "transcribe_chunk",
        {
          audio_base64: audioBase64,
          model: getSpeechModel(),
          language: language === "auto" ? undefined : language,
          initial_prompt: this.promptTail[channel] || undefined,
          hotwords: SPEECH_HOTWORDS,
        },
      );
      const took = Date.now() - transcribeStartedAt;
      const spokenSeconds = (spoken.end - spoken.start) / 1000;
      if (took > Math.max(SLOW_TRANSCRIBE_MS, spokenSeconds * 500)) {
        logLine(`[timing] slow transcription: ${took}ms for ${spokenSeconds.toFixed(1)}s of speech (${channel})`);
      }
      text = result.text.trim();
      if (this.consecutiveTranscriptionFailures > 0) {
        this.consecutiveTranscriptionFailures = 0;
        this.events.onTranscriptionRecovered();
      }
    } catch (error) {
      console.error("[live-session] transcription failed:", error);
      this.consecutiveTranscriptionFailures += 1;
      if (this.consecutiveTranscriptionFailures === TRANSCRIPTION_ERROR_THRESHOLD) {
        const message = error instanceof Error ? error.message : String(error);
        this.events.onTranscriptionError(message);
      }
      return;
    }
    if (!text) return;
    this.promptTail[channel] = `${this.promptTail[channel]} ${text}`.trim().slice(-PROMPT_TAIL_CHARS);

    if (channel === "other") {
      this.echo.pushOther({ ...spoken, text });
      // The cut happened because the other side paused, which is the moment
      // to respond (unless it was cut only for length).
      this.commitSegment("other", spoken.start, text, meta.endedBySilence);
    } else {
      // The mic may only be hearing the other side through the speakers.
      this.echo.pushMe({ ...spoken, text }, () => this.commitSegment("me", spoken.start, text, false));
    }
  }

  private commitSegment(channel: AudioChannel, at: number, text: string, endsWithPause: boolean): void {
    this.events.onTranscriptSegment({ at, speaker: channel, text });
    const label = channel === "other" ? "Собеседник" : "Я";
    this.transcript = `${this.transcript}\n[${label}]: ${text}`.trim().slice(-TRANSCRIPT_CHAR_BUDGET);
    this.segmentSinceTrigger = `${this.segmentSinceTrigger} ${text}`.trim();
    this.maybeTrigger(channel === "other" && endsWithPause);
  }

  private maybeTrigger(otherJustPaused: boolean): void {
    if (this.paused || this.generating || !getAutoDetectEnabled()) return;
    if (this.transcript.length === 0 || this.segmentSinceTrigger.length === 0) return;
    const now = Date.now();
    const sinceLast = now - this.lastGenerateAt;
    if (sinceLast < MIN_INTERVAL_MS) return;

    const hasFreshCue = QUESTION_CUE.test(this.segmentSinceTrigger) || CHANGE_CUE.test(this.segmentSinceTrigger);
    const staleFallback = this.segmentSinceTrigger.length >= FALLBACK_CHARS && sinceLast >= MAX_INTERVAL_MS;
    if (!hasFreshCue && !staleFallback && !otherJustPaused) return;

    void this.runGeneration(this.transcript);
  }

  /**
   * Direct question from the analyst (typed in the overlay, or a quick-action
   * button) — works regardless of pause/auto-detect state, since the analyst
   * explicitly asked for it. Interrupts an in-flight auto-generated block if
   * one was streaming, since a direct question takes priority.
   */
  async askManual(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (this.generating) this.abortController?.abort();
    const prompt = this.transcript
      ? `${this.transcript}\n\n[Analyst's direct question]: ${trimmed}`
      : `[Analyst's direct question]: ${trimmed}`;
    await this.runGeneration(prompt);
  }

  /**
   * "Process now" — for when auto-suggest is off: the transcript has kept
   * accumulating in the background (ingestAudioChunk never stopped just
   * because auto-detect is disabled — only `maybeTrigger` respects that
   * flag), this manually flushes it into a block on demand instead of
   * waiting for the periodic auto-trigger that won't fire while it's off.
   * Voice/transcript only — deliberately calls runGeneration with no
   * `includeScreenshot`, same as the auto-trigger path. Only `askAboutScreen`
   * (the explicit Screenshot button) attaches a screenshot.
   */
  async processNow(): Promise<void> {
    if (!this.transcript) return;
    if (this.generating) this.abortController?.abort();
    await this.runGeneration(this.transcript);
  }

  /**
   * "Screenshot" quick action: forces a fresh screenshot capture right now
   * and asks the model to prioritize whatever is currently on screen — but
   * still combined with the rolling transcript, same as any other question
   * (screen + audio together, never one instead of the other). Needs a
   * vision-capable provider (see `runGeneration`); on a non-vision provider
   * this still generates, just without an image attached.
   *
   * This is the ONLY path that captures a screenshot — every other trigger
   * (auto-detect, "Process now", typed/quick-action questions) is audio-only,
   * so the analyst's screen isn't read on every block, only when asked.
   */
  async askAboutScreen(): Promise<void> {
    if (this.generating) this.abortController?.abort();
    const note = "[Analyst asked for a priority read of what's currently on screen — combine it with the transcript above.]";
    const prompt = this.transcript ? `${this.transcript}\n\n${note}` : note;
    await this.runGeneration(prompt, { includeScreenshot: true });
  }

  private async runGeneration(
    promptTranscript: string,
    options: { includeScreenshot?: boolean } = {},
  ): Promise<void> {
    this.generating = true;
    this.lastGenerateAt = Date.now();
    this.segmentSinceTrigger = "";
    this.abortController = new AbortController();

    const providerId = getSelectedProviderId();
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    const settings = getProviderSettings(providerId);
    const apiKey = getApiKey(providerId);

    const block: LiveBlock = { id: randomUUID(), text: "", status: "streaming" };
    this.events.onBlockStart(block);

    // A screenshot reaches the model as an image (vision models), as
    // recognized text (any model, when a recognizer exists), or both.
    let screenshot: string | undefined;
    let screenText: string | undefined;
    let ocrImage: string | undefined;
    const t0 = Date.now();
    if (options.includeScreenshot) {
      const shot = await this.captureScreen().catch(() => null);
      const tCapture = Date.now();
      if (shot) {
        ocrImage = shot.ocrImage;
        const sees = Boolean(preset?.supportsVision);
        if (sees) screenshot = shot.image;
        if (!sees || getScreenshotTextEnabled()) {
          const recognition = this.recognizeText(shot.ocrImage).catch(() => null);
          // A model that cannot see the image has nothing else to go on, so it
          // waits for the text; one that can does not wait long.
          screenText = (sees ? await withBudget(recognition, OCR_WAIT_BUDGET_MS) : await recognition) ?? undefined;
        }
      }
      logLine(
        `[timing] screenshot: capture ${tCapture - t0}ms, recognition ${Date.now() - tCapture}ms, image ${screenshot ? "yes" : "no"}, text ${screenText ? screenText.length : 0} chars`,
      );
    }
    // Give the model its own last answer back, so "revise the draft" in the
    // system prompt has something concrete to revise instead of an empty
    // instruction: without this it never sees what it previously proposed.
    let promptWithHistory = this.lastAnswer
      ? `${promptTranscript}\n\n[Your own previous suggestion in this call: revise/extend it if the new information above changes it, don't just repeat or restart it]:\n${this.lastAnswer}`
      : promptTranscript;
    if (options.includeScreenshot && !screenshot && !screenText) {
      promptWithHistory = `${promptWithHistory}\n\n${SCREEN_UNAVAILABLE_NOTE}`;
    }

    let collected = "";
    const run = async (image: string | undefined, text: string | undefined) => {
      collected = "";
      await generate({
        providerId,
        apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        // Base the screen instructions on what actually went into the request,
        // not on what was asked: telling the model an image is attached when
        // it is not would be actively misleading.
        systemPrompt: buildSystemPrompt({ includeScreenshot: Boolean(image), includeScreenText: Boolean(text) }),
        transcript: text
          ? `${promptWithHistory}\n\n[Text recognized on the analyst's screen by OCR]:\n${text}`
          : promptWithHistory,
        screenshotBase64: image,
        signal: this.abortController!.signal,
        onDelta: (delta) => {
          if (!collected) logLine(`[timing] first token ${Date.now() - t0}ms (${providerId}, ${settings.model})`);
          collected += delta;
          this.events.onBlockDelta(block.id, delta);
        },
      });
    };

    try {
      try {
        await run(screenshot, screenText);
      } catch (error) {
        if (!screenshot || (error as Error).name === "AbortError" || !isImageRejection(error)) throw error;
        const text =
          screenText ?? (ocrImage ? ((await this.recognizeText(ocrImage).catch(() => null)) ?? undefined) : undefined);
        if (!text) throw error;
        console.warn("[live-session] provider refused the image, retrying with recognized text");
        await run(undefined, text);
      }
      logLine(`[timing] block done ${Date.now() - t0}ms, ${collected.length} chars`);
      this.lastAnswer = collected.slice(0, LAST_ANSWER_CHAR_BUDGET);
      this.events.onBlockDone(block.id);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        this.events.onBlockDone(block.id);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[live-session] generation failed:", message);
        this.events.onBlockError(block.id, message);
      }
    } finally {
      this.generating = false;
      this.abortController = null;
    }
  }
}
