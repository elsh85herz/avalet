// Test double for python-sidecar/server.py: same newline-delimited JSON-RPC on
// stdin/stdout, no Python, no speech model, no network. Used by the
// integration tests (plain node) and by E2E (run by Electron as node).
//
// transcribe_chunk: when audio_base64 decodes to "TEXT:<phrase>", the phrase is
// the transcript (tests script exact speech); "UNSURE:<phrase>" and
// "QUIET:<phrase>" also report low confidence or "probably not speech". Anything else (real WAV bytes
// from the fake capture) gets the next line of a canned conversation.
// FAKE_SIDECAR_FAIL=<n> makes the first n transcriptions fail.
import fs from "node:fs";
import readline from "node:readline";

const CANNED = [
  "Нам нужно, чтобы клиент мог менять дневной лимит по карте прямо в приложении.",
  "А кто подтверждает изменение выше порога?",
  "Выше трёхсот тысяч нужен звонок из колл-центра, это уже есть в другом процессе.",
  "Хорошо, тогда я пришлю описание процесса до пятницы.",
];
// FAKE_SIDECAR_SCRIPT=review: a document review call about the synthetic
// test/fixtures/spec-activity-journal.md (channels follow electron/fake-capture.ts).
const REVIEW = [
  "По разделу 3.1: пятидесяти записей на страницу мало, предлагаю поднять лимит до 100.",
  "Согласен, поднимаем до 100 записей.",
  "И ещё давайте добавим выгрузку в XLSX, не только CSV.",
  "Срок хранения 180 дней пока не трогаем, это надо согласовать с безопасностью.",
];
// FAKE_SIDECAR_SCRIPT=parcel (CLOUD_TASK_6): the synthetic parcel call in
// parcel-call.json, line n for chunk "FAKE-AUDIO-n", with doubled lines and a
// quiet credit line (the channel plan is electron/fake-capture.ts).
const PARCEL = JSON.parse(fs.readFileSync(new URL("./parcel-call.json", import.meta.url), "utf8")).lines;
const SCRIPT = process.env.FAKE_SIDECAR_SCRIPT === "review" ? REVIEW : CANNED;
let cannedIndex = 0;
let failuresLeft = Number(process.env.FAKE_SIDECAR_FAIL ?? 0);

function emit(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function transcribe(params) {
  if (typeof params.audio_base64 !== "string" || !params.audio_base64) throw new Error("audio_base64 is required");
  if (failuresLeft > 0) {
    failuresLeft -= 1;
    throw new Error("fake transcription failure");
  }
  const decoded = Buffer.from(params.audio_base64, "base64").toString("utf8");
  if (decoded.startsWith("TEXT:")) return { text: decoded.slice(5), language: params.language ?? "ru", ends_with_pause: true };
  // CLOUD_TASK_6: the recognizer's own confidence, as faster-whisper reports it.
  if (decoded.startsWith("UNSURE:")) return { text: decoded.slice(7), language: params.language ?? "ru", ends_with_pause: true, avg_logprob: -1.45, no_speech_prob: 0.1 };
  if (decoded.startsWith("QUIET:")) return { text: decoded.slice(6), language: params.language ?? "ru", ends_with_pause: true, avg_logprob: -0.9, no_speech_prob: 0.93 };
  const numbered = decoded.match(/^FAKE-AUDIO-(\d+)$/);
  if (process.env.FAKE_SIDECAR_SCRIPT === "parcel" && numbered) {
    const line = PARCEL[(Number(numbered[1]) - 1) % PARCEL.length];
    return { text: line.text, language: params.language ?? "ru", ends_with_pause: true, ...(line.quiet ? { avg_logprob: -0.9, no_speech_prob: 0.93 } : {}) };
  }
  const text = SCRIPT[cannedIndex % SCRIPT.length];
  cannedIndex += 1;
  return { text, language: params.language ?? "ru", ends_with_pause: true };
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    emit({ id: null, ok: false, error: `invalid JSON: ${error.message}` });
    return;
  }
  const { id, command, params = {} } = message;
  try {
    if (command === "ping") emit({ id, ok: true, result: { ready: true } });
    else if (command === "transcribe_chunk") emit({ id, ok: true, result: transcribe(params) });
    else throw new Error(`unknown command: ${JSON.stringify(command)}`);
  } catch (error) {
    emit({ id, ok: false, error: error.message });
  }
});
rl.on("close", () => process.exit(0));
emit({ event: "ready" });
