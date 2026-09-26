# Changelog

## 0.2.0-rc.2 (unreleased)

Fixes after the first test on a Mac. Simple is now the same working product as Advanced with fewer settings, not fewer tools.

### Changed
- **Overlay controls are the same in Simple and Advanced:** labelled Pause/Resume and End, Auto, interface language, opacity slider, screenshot and notes. All four quick actions are one click away ("More actions" is gone); Simple highlights "Clarifying question". Icon-only buttons have tooltips and accessible names.
- **End from the overlay.** Closes the meeting (as in the main window), releases the microphone and hides the overlay until the next Start. While a meeting runs, the main window header has a Pause/Resume button on every screen.
- **Simple Settings are complete for real work:** access and key test, the model in use (read-only), meeting type, role and agenda, all speech models with download, cancel, continue and delete plus a plain guide (small vs turbo, first download needs internet, often a VPN from Russia), where files are saved, opacity and language. The wizard says other models can be chosen later.
- **"Avalet without keys" shows as "Coming soon"** until a billing server is configured in the build. Nothing is sent to a billing server then; an install that had Avalet selected goes back to an own key.
- **With your own key the billing server is never contacted** by itself (no startup refresh, no timer); a failure is logged once per session.
- **One clear problem on the Simple home,** most blocking first (speech model, permissions, access, recognition, audio, Avalet budget), each with one button, plus a one-line readiness summary. Budget wording appears only when the Avalet plan is really used up. A saved key that was never checked says "Key is not checked yet" with a Check button.
- **Start never listens without a ready speech model.** A missing or partial model is explained with Download or Continue in place; during the first download Start waits and begins by itself.
- The wizard's sample conversation is shown with the sample suggestion and is no longer about card limits.
- The log skips identical lines within ten minutes and cuts out anything shaped like a key.

### Added
- Setting for the export folder (default Documents), in Simple and Advanced Settings.

### Fixed
- After a refused Start (no speech model) the microphone stayed open.
- Resume on an overlay left over after End started a meeting without audio capture.


## 0.2.0-rc.1 (unreleased)

### New
- **First-run setup** in four short screens: permissions with live status, access (Avalet without keys or your own key with a real test call), the speech model download, and a minimal meeting context with a 20-second self-test.
- **Simple and Advanced levels.** New users get the Simple level: Start/Pause, meeting type, context, transcript, summary, export. Advanced keeps every setting and is one switch away (or `AVALET_ADVANCED=1`).
- **Avalet without keys.** A built-in provider with a free trial (500,000 tokens, no card) and a Pro plan. The server counts tokens and does not store transcripts; the payment page opens in the browser, card data never touches the app. Your own key stays free and unlimited.
- **Speech model manager.** Each model shows its state (not downloaded, downloading with progress, ready, error) with Download, Cancel, Continue, Try again and Delete. Start never downloads anything silently; it explains and offers the button. Interrupted downloads resume.
- **Token usage** from the providers' own counts, per month and per meeting, in Settings and (quietly) in the overlay. Background work (the live checklist) can use a cheaper model.
- **Paywall that loses nothing:** when the Avalet tokens run out, the transcript keeps recording and the overlay offers buying more or switching to your own key.

### Changed
- The live checklist is off by default in the Simple level (on in Advanced) until it is verified on real meetings; its first call comes no sooner than 30 s into a meeting.
- The briefing sent with each live suggestion is capped at 3,500 characters (the summary still uses all of it).
- Keys are only stored when the OS keychain is available (no plain-text fallback).
- Calmer buttons with one primary action per screen, visible keyboard focus, colours checked for contrast in both themes, icons instead of arrow characters.

### Fixed
- After "End meeting" the windows kept showing "paused".

### For developers
- One shared IPC contract (`electron/shared/ipc-contract.ts`); a mismatch between main, preload and renderer fails the typecheck.
- Integration tests with a fake recognizer process and a mock model; E2E with Playwright under Xvfb; screenshots in `docs/screens/`; CI and a macOS release workflow (arm64 and x64, unsigned, draft release on tags).
