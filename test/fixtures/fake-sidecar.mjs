// Test double for python-sidecar/server.py: same newline-delimited JSON-RPC on
// stdin/stdout, no Python, no speech model, no network. Used by the
// integration tests (plain node) and by E2E (run by Electron as node).
//
// transcribe_chunk: when audio_base64 decodes to "TEXT:<phrase>", the phrase is
// the transcript (tests script exact speech). Anything else (real WAV bytes
// from the fake capture) gets the next line of a canned conversation.
// FAKE_SIDECAR_FAIL=<n> makes the first n transcriptions fail.
import readline from "node:readline";

const CANNED = [
  "Нам нужно, чтобы клиент мог менять дневной лимит по карте прямо в приложении.",
  "А кто подтверждает изменение выше порога?",
  "Выше трёхсот тысяч нужен звонок из колл-центра, это уже есть в другом процессе.",
  "Хорошо, тогда я пришлю описание процесса до пятницы.",
];
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
  const text = CANNED[cannedIndex % CANNED.length];
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
