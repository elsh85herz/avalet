# Changelog

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
