# Avalet

**Meeting assistant for systems analysts.** Avalet listens to your call (your mic and the other side's audio), transcribes it locally, and streams short, concrete suggestions into a floating overlay: what to ask next, what's missing in the requirement, a draft schema or API contract when the conversation calls for one.

Local-first and bring-your-own-LLM: audio never leaves your Mac, transcription runs on-device, and the model calls go straight from the app to the provider you chose (Claude, OpenAI, DeepSeek, or a local OpenAI-compatible server). There is no Avalet server in between.

[Русская версия](README.ru.md)

> Status: early release (0.1). Built by a practicing systems analyst for their own meetings first. macOS only for now.

## What it does

- **Live suggestions** as the conversation goes: clarifying questions, gaps and risks in what's being discussed, a crisp restatement of what was just said. Triggered by question/change cues in speech and by the other side pausing, not on a timer.
- **Drafts on demand.** Ask for a database schema, an ER diagram, an API contract, a process flow, and you get a concrete draft with stated assumptions, then it gets revised as new details arrive.
- **Who said what.** Your mic and the system audio are captured as two channels, so the transcript is tagged "me" / "other" and the model doesn't mistake your own words for a question addressed to you.
- **Meeting context.** Paste the ticket, spec, or agenda before the call; every suggestion is grounded in it.
- **Manual ask, quick actions, screenshot.** Type a question any time, tap "Summarize" / "Risks?" / "Ask a question" / "Explain this", or send a screenshot of your screen for a priority read (Claude and OpenAI only).
- **Meeting modes.** Requirements gathering, grooming and estimation, demo and acceptance, interview, or free: each shifts what the assistant pays attention to.
- **Transcript and meeting summary.** Every call is saved as a meeting with a timestamped, speaker-tagged transcript. One button writes the summary in an analyst's format: decisions, open questions, requirements, risks, tasks. Export to Markdown or copy as plain text.
- **Stop / Resume / history.** Stop freezes live output without losing anything, page through earlier blocks, resume instantly. History is kept on disk.
- **Overlay stays out of your screen share** (macOS content protection), the way presenter notes do.
- **Works for any meeting where you have to answer fast and to the point:** requirements sessions, grooming, demos, architecture reviews, technical interviews.

## Install on macOS

Avalet is currently distributed as an unsigned build (no Apple Developer certificate yet). macOS will warn you once; the steps below get past that safely.

**Requirements:** macOS 13.2 or newer, Apple Silicon or Intel, about 1 GB free (the speech model is downloaded on first run).

1. Download the latest `Avalet-x.y.z.dmg` from [Releases](https://github.com/elsh85herz/a-valet/releases).
2. Open the `.dmg` and drag **Avalet** into **Applications**.
3. Open Avalet. macOS says it "cannot be opened" or is "damaged". Close that dialog.
4. Go to **System Settings, Privacy & Security**, scroll to the bottom, click **Open Anyway** next to Avalet, confirm. (On macOS 14 and older you can instead right-click the app and choose Open.)
5. If the "damaged" message persists, run once in Terminal: `xattr -cr /Applications/Avalet.app`
6. Launch Avalet, pick a provider, paste its API key, click **Save**. That's the whole setup.
7. Click **Start** and allow **Microphone** and **Screen Recording** when macOS asks. The screen-share picker is how the other side's audio gets captured: pick "Entire screen", keep "Share audio" on.
8. First transcription downloads the speech model (a few hundred MB, one time).

Updates: the app doesn't auto-update yet. Check [Releases](https://github.com/elsh85herz/a-valet/releases) for new versions; install over the old one the same way.

## Run from source

```bash
brew install node python git      # Node 20+, Python 3.9+
git clone https://github.com/elsh85herz/a-valet.git
cd a-valet
npm install
./scripts/setup-python.sh         # creates python-sidecar/.venv with faster-whisper
npm run dev
```

In dev mode the macOS permission prompts show up under the name "Electron", not "Avalet". If you deny one by accident, enable "Electron" (or your terminal app) by hand in System Settings, Privacy & Security, Microphone and Screen Recording.

Build an installable app for yourself: `./scripts/setup-python.sh && npm run dist:mac:unsigned` (the `.dmg` lands in `release/`), or `npm run update:mac` to build and drop it straight into `/Applications`.

## How it works

```
mic (getUserMedia)                    5s WAV chunks, tagged "me"
system audio (loopback)               5s WAV chunks, tagged "other"
        |                                       |
        +----------> python-sidecar (faster-whisper, local) <----------+
                                  |
                       rolling transcript, tagged by speaker
                                  |
          question / change cues in speech, or the other side pausing
                                  |
              electron/live-session.ts -> your LLM provider (streamed)
                                  |
                 overlay window: live block, Stop / Resume, history,
                 manual ask, quick actions, screenshot
```

- **No server.** Every provider call goes from the Electron main process straight to Claude / OpenAI / DeepSeek / your local server.
- **Providers:** `electron/providers/anthropic.ts` (native Anthropic Messages API) and `electron/providers/openai-compatible.ts` (one adapter for OpenAI, DeepSeek, and anything OpenAI-compatible such as Ollama or LM Studio via a custom base URL).
- **Keys** are entered once and stored encrypted via the OS keychain (`safeStorage`). They are never sent to the renderer.
- **Speech to text** is fully local: `faster-whisper` in `python-sidecar/server.py`, talked to over newline-delimited JSON-RPC on stdin/stdout.
- **Auto-suggest trigger:** a cheap regex over the freshly heard transcript plus a VAD-based "they stopped talking" signal from whisper's own segment timing. No extra model call.

## Known limitations

- **System audio capture can be fragile.** Uses [`electron-audio-loopback`](https://github.com/alectrocute/electron-audio-loopback) (MIT); needs macOS 13.2+. If the other side's audio doesn't come through, a banner shows up with a **Reconnect** button. Mic-only always works as a fallback.
- **Unsigned build.** See the install steps above. Code signing and auto-update are planned.
- **Speech model is downloaded from Hugging Face** on first run. If that's slow or blocked on your network, use a VPN for the first download; the model is cached afterwards.
- **DeepSeek and local models have no vision support** in this build; screenshots are only sent to Claude and OpenAI.
- **Consent.** Recording a call may require the other participants' consent depending on your jurisdiction. Avalet shows a visible listening indicator, but consent is on whoever runs it.

## Roadmap

- Signed builds and auto-update
- Speech model bundled with the app (no first-run download)
- Interview practice mode (the assistant asks, you answer)
- Meeting facilitation: agenda progress, "back on topic", open items before wrap-up
- Windows

## License

AGPL-3.0. See [LICENSE](LICENSE).

Copyright (c) 2026 Elshad Astanov.
