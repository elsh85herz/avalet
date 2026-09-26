# Mac check for a release candidate (about 10 minutes)

What the cloud session could not run: real microphone and system audio,
macOS permissions, Apple Vision text recognition, the bundled Python venv,
a real speech model download, and the `.dmg` itself. Run this on a Mac with
the `.dmg` from the "Release (macOS)" workflow (Actions, latest run,
artifact `avalet-macos-arm64` or `avalet-macos-x64`).

Before you start: a Zoom/Meet/Telemost test call or a YouTube video with
speech, headphones optional, and for step 8 a billing server started with
`npm run mock:server` in a clone of the repo (prints `url` and `publicKey`).

Tick each item; "Expected" is what must happen.

| # | Do | Expected |
|---|---|---|
| 1 | Open the `.dmg`, drag Avalet to Applications, open it. | macOS says it cannot be opened (unsigned). |
| 2 | System Settings, Privacy & Security, "Open Anyway", confirm. If it says "damaged": `xattr -cr /Applications/Avalet.app`. | Avalet opens on the wizard, "Step 1 of 4", in Russian. |
| 3 | Step 1: press "Allow" for Microphone, then for Screen Recording. Deny one on purpose, then press "How to fix". | Each status turns "Granted" within 2 s of granting. "How to fix" opens the matching Privacy pane. After changing Screen Recording macOS may ask to relaunch: relaunch, the wizard continues. |
| 4 | Step 2: choose "My own key", pick a provider, paste a real key, "Save and test". Then paste a wrong key and test again. | Real key: "The key works." Wrong key: one sentence ("did not accept this key"), no stack trace. |
| 5 | Step 3: "Download" the recommended model. Press "Cancel" at about 20%, then "Continue". Turn Wi-Fi off for 10 s during the download. | Progress bar moves; Cancel stops it and keeps the partial size; Continue resumes (does not restart from 0); after the Wi-Fi drop the row shows "Connection lost, trying again" and then finishes, or shows "Download failed" with "Try again". At the end: "Ready, works offline". The wizard shows only the recommended model and says other models can be chosen later in Settings; Settings (Simple too) lists all three with Download, Cancel, Continue and Delete. |
| 6 | Step 4: type a role, press "Try it", speak for a few seconds. "Finish". | Mic level bar moves with your voice; a sample suggestion in Russian appears; the Simple window opens. |
| 7 | Start a test call (play a video with speech through the speakers or join a call), press "Start". Ask a question aloud. After a minute press "Pause". Press "Meeting summary". "Download protocol" and "Download transcript". "End meeting". | Overlay appears top right and is not visible in your own screen share; transcript lines tagged Me / Other; a suggestion appears after the other side pauses; the overlay collapses on Pause; the summary streams in; both files are saved (Documents by default) and open cleanly; after End the status reads "Ready". |
| 8 | Quit Avalet. Start it from Terminal against the mock server: `AVALET_BILLING_URL=<url> AVALET_BILLING_DEV_PUBKEY="<publicKey>" /Applications/Avalet.app/Contents/MacOS/Avalet`. In Settings choose "Start free trial". Then in the repo: `curl -XPOST <url>/mock/usage -d '{"weighted":500000}' -H 'content-type: application/json'` and start a meeting. | Trial shows "500 thousand tokens left". After the usage call the next suggestion shows the paywall in the overlay ("tokens are used up", transcript keeps recording). "Get Pro" opens the mock checkout page in the browser; pressing "succeed" there turns the card into "Pro" within 5 s. |
| 9 | Settings, "Advanced mode". Check the live checklist switch, the opacity slider on the overlay, "Open the log folder". | Advanced shows every setting; the checklist is on; the log opens in Finder and contains timings only, no meeting text or keys. |
| 10 | Update path: install this build over a 0.1 install that has a saved key (or keep the previous app's data in `~/Library/Application Support/Avalet`). | No wizard; Advanced level; the old key still works; old meetings are in History. |

If anything fails, attach `~/Library/Logs/Avalet/avalet.log` and the step number.
