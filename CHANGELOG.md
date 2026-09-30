# Changelog

## Unreleased (after 0.2.0-rc.2)

### Added
- **Document review keeps the specification in sync.** Load the specification (`.md`/`.txt` file or pasted text, up to 200,000 characters) before a review call; live hints get only its table of contents (section numbers, first lines, open questions), a typed question that names a section gets that section. After the call the summary returns the decisions actually taken (status, who, section, was/becomes, the exact words and time); quotes are checked against the transcript and an "accepted" decision without them starts unchecked. The meeting screen shows them as a checklist to correct; "Update the document" asks the model for changes to exact places only, the app checks each one against the original, shows them side by side and applies only the checked ones, keeping the original for undo. Download the updated `.md` or copy it, and download the decisions as a structured `.md`. Every extra spend is announced first with a rough token figure: in the document field, before the summary, and in a confirmation before the update. Review boards collect proposals next to remarks and decisions.
- **A running list per meeting mode in the overlay:** requirements (candidate requirements, risks), grooming (proposed slices, separate tasks, risks), demo (deviations, what to ask to see), review (remarks, decisions). Collected from the suggestions themselves, no extra model call; one click copies it. The mode prompts now put these items on their own lines.
- In grooming the "Risks?" button also asks about hidden work (migration, flags, monitoring, rollback, access).
- **Plans of the built-in provider can include different meeting modes and the live checklist.** A mode or the checklist that the plan does not include keeps its place, and choosing it shows what it does with a real screenshot, which plan has it, and the upgrade button; after paying it unlocks in place. None of this applies to your own key, which keeps every mode and the checklist, free, or to a build without a billing server (today's builds). The billing contract gained an optional `features` list in the entitlement token.

- **The live checklist keeps what was actually said.** Each agenda item and action point can carry the exact words from the call (checked against the transcript, never a paraphrase), who said them and when, next to the short verdict. In the overlay a click on an item shows them; the main window shows them with a button that jumps to that moment in the transcript; the protocol export quotes them under the item.

### Changed
- **One speech model, no choice.** The app uses faster-whisper small only; the three-way picker is gone from Settings and the wizard, replaced by one row with the model's status, progress, Cancel, Continue and Delete. A stored choice of medium or turbo falls back to small.
- **The speech model downloads early.** It starts in the background as soon as a new user leaves the first setup screen (or the how-it-works guide opens), so it is usually ready by the first call. Nothing starts when it is already on disk, running or failed, and only once per launch. Start still waits for a ready model.
- **Automatic suggestions are quieter, per meeting mode,** to spend fewer tokens while nobody reads: interview keeps its pace (at most every 6 s, on any pause); free waits at least 15 s and for a real sentence (about 45% fewer calls); requirements, grooming, demo and review wait about 25 s and for a substantial statement or a question (about 65% fewer), which still fills their running lists. Typed questions, quick actions, Screenshot and Process now answer at once as before; the Auto switch is unchanged.
- **No language switch on the overlay.** The interface language is chosen in the main window (Settings, first-run setup) before the call; the overlay follows it.
- **The checklist in the overlay stays secondary to the live suggestion:** one line per item, detail on a click, at most about a third of the overlay height, adding an item and "Update now" behind one link, and the list (and the mode's running list) folds itself when a new suggestion arrives, unless you are working in it.

### Fixed
- End-to-end tests account for the how-it-works guide shown once after the setup.

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
