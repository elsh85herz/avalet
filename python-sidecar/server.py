"""Avalet python sidecar.

Long-running process spoken to by the Electron main process over
stdin/stdout using newline-delimited JSON-RPC.

Commands:
- ``ping``: readiness check.
- ``transcribe_chunk``: local speech-to-text on one ~5s audio chunk via
  faster-whisper. Params: ``audio_base64`` (16-bit PCM mono WAV, base64),
  optional ``language`` (ISO code, omit for auto-detect).

All responses: ``{"id": <request-id>, "ok": true, "result": ...}`` or
``{"id": <request-id>, "ok": false, "error": <string>}``.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
import traceback
import wave
from typing import Any

MODEL_SIZE = os.environ.get("AVALET_WHISPER_MODEL", "small")
COMPUTE_TYPE = os.environ.get("AVALET_WHISPER_COMPUTE", "int8")
# How much silence has to follow the last detected speech segment, relative
# to the end of the chunk, to count as "they stopped talking" — reuses
# faster-whisper's own VAD segment timing (already computed for
# vad_filter=True) instead of a separate pass, so this is free.
PAUSE_THRESHOLD_SECONDS = float(os.environ.get("AVALET_PAUSE_THRESHOLD", "0.6"))


def _emit(response: dict) -> None:
    sys.stdout.write(json.dumps(response, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _log(message: str) -> None:
    sys.stderr.write(f"[avalet-sidecar] {message}\n")
    sys.stderr.flush()


_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel  # type: ignore

        _log(f"loading whisper model={MODEL_SIZE!r} compute={COMPUTE_TYPE!r}")
        started = time.time()
        _model = WhisperModel(MODEL_SIZE, device="auto", compute_type=COMPUTE_TYPE)
        _log(f"model loaded in {time.time() - started:.2f}s")
    return _model


def _wav_base64_to_float_pcm(audio_base64: str) -> tuple[list[float], int]:
    raw = base64.b64decode(audio_base64)
    with wave.open(io.BytesIO(raw), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        channels = wav_file.getnchannels()
        frames = wav_file.readframes(wav_file.getnframes())

    if sample_width != 2:
        raise ValueError(f"expected 16-bit PCM WAV, got sample width {sample_width}")

    import array

    samples = array.array("h")
    samples.frombytes(frames)
    if channels > 1:
        # Downmix to mono by averaging channels.
        mono = array.array("h", (0 for _ in range(len(samples) // channels)))
        for i in range(len(mono)):
            frame_samples = samples[i * channels : (i + 1) * channels]
            mono[i] = sum(frame_samples) // channels
        samples = mono

    floats = [s / 32768.0 for s in samples]
    return floats, sample_rate


def _transcribe_chunk(payload: dict) -> dict:
    audio_base64 = payload.get("audio_base64")
    language = payload.get("language")
    if not isinstance(audio_base64, str) or not audio_base64:
        raise ValueError("audio_base64 is required")

    import numpy as np  # type: ignore

    floats, sample_rate = _wav_base64_to_float_pcm(audio_base64)
    audio = np.array(floats, dtype=np.float32)
    chunk_duration = len(floats) / sample_rate if sample_rate else 0.0

    model = _get_model()
    ends_with_pause = False
    try:
        segments, info = model.transcribe(
            audio,
            language=language if isinstance(language, str) and language else None,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segments = list(segments)
        text = "".join(segment.text for segment in segments).strip()
        detected_language = info.language
        if segments:
            ends_with_pause = (chunk_duration - segments[-1].end) >= PAUSE_THRESHOLD_SECONDS
    except ValueError as error:
        # faster-whisper's VAD path raises this when a chunk has no detected
        # speech at all (silence, a pause, the other side muted) instead of
        # just returning zero segments — a known upstream edge case, not a
        # real failure. Treat it as "nothing said this chunk".
        if "max() arg is an empty sequence" not in str(error):
            raise
        text = ""
        detected_language = language or "und"

    return {
        "text": text,
        "language": detected_language,
        "sample_rate": sample_rate,
        "ends_with_pause": ends_with_pause,
    }


def _handle(message: dict) -> dict:
    request_id = message.get("id")
    command = message.get("command")
    params = message.get("params") or {}
    try:
        if command == "ping":
            return {"id": request_id, "ok": True, "result": {"ready": True}}
        if command == "transcribe_chunk":
            return {"id": request_id, "ok": True, "result": _transcribe_chunk(params)}
        raise ValueError(f"unknown command: {command!r}")
    except Exception as error:  # noqa: BLE001 - forward errors as JSON, keep sidecar alive
        return {
            "id": request_id,
            "ok": False,
            "error": str(error),
            "trace": traceback.format_exc(limit=4),
        }


def main() -> int:
    _log("sidecar starting")
    if os.environ.get("AVALET_PRELOAD_MODEL") == "1":
        try:
            _get_model()
        except Exception as error:  # noqa: BLE001
            _log(f"failed to preload model: {error}")
    _emit({"event": "ready"})
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError as error:
            _emit({"id": None, "ok": False, "error": f"invalid JSON: {error}"})
            continue
        if not isinstance(message, dict):
            _emit({"id": None, "ok": False, "error": "message must be an object"})
            continue
        _emit(_handle(message))
    _log("sidecar exiting")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
