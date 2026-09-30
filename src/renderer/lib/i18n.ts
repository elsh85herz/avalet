// Overlay UI copy (button labels, tooltips, placeholders): independent of
// the model's own answer language, which is fixed to Russian in the system
// prompt (see live-session.ts) and isn't user-configurable. Keys are used
// verbatim by OverlayApp; add a new key here + in both language blocks
// together so the type stays in sync.
export type UiLanguage = "ru" | "en";

export type UiStrings = {
  autoOnTitle: string;
  autoOffTitle: string;
  uiLangTitle: string;
  screenshotTitle: string;
  overlay: {
    pause: string;
    pauseTitle: string;
    resume: string;
    resumeTitle: string;
    end: string;
    endTitle: string;
    auto: string;
    autoName: string;
    screenshotName: string;
    notesName: string;
  };
  opacityLabel: string;
  opacityTitle: string;
  listeningEmpty: string;
  copyBlockTitle: string;
  prevBlock: string;
  nextBlock: string;
  processNowLabel: string;
  processNowTitle: string;
  askPlaceholder: string;
  askButton: string;
  audioDegradedBoth: string;
  audioDegradedOther: string;
  audioDegradedMe: string;
  reconnectButton: string;
  reconnectTitle: string;
  transcriptionErrorPrefix: string;
  tracker: {
    toggle: string;
    toggleTitle: string;
    agenda: string;
    actions: string;
    agendaEmpty: string;
    actionsEmpty: string;
    addQuestionPlaceholder: string;
    addActionPlaceholder: string;
    add: string;
    refresh: string;
    refreshTitle: string;
    updating: string;
    markTitle: string;
    confirm: string;
    dismiss: string;
    proposed: string;
    discussing: string;
    noOwner: string;
    newCount: string;
    addItem: string;
    itemTitle: string;
    noQuote: string;
  };
  board: {
    toggleTitle: string;
    copy: string;
    copied: string;
    sections: Record<"requirements" | "risks" | "slices" | "separate" | "deviations" | "checks" | "remarks" | "proposals" | "decisions", string>;
  };
  locks: {
    modeBadge: string;
    modeTitle: string;
    boardLine: Record<"requirements" | "grooming" | "demo" | "review", string>;
    planLine: string;
    includedLine: string;
    notNow: string;
    ownKeyHint: string;
    unlocked: string;
    useIt: string;
    checklistTitle: string;
    checklistBody: string;
    checklistRow: string;
    checklistUnlocked: string;
    turnOn: string;
    howItWorks: string;
    imageAlt: string;
  };
  quickActions: {
    summarize: string;
    risks: string;
    askQuestion: string;
    explainThis: string;
  };
  settings: {
    subtitle: string;
    onboarding: string;
    themeToLight: string;
    themeToDark: string;
    keySaved: string;
    model: string;
    baseUrl: string;
    backgroundModel: string;
    backgroundModelHint: string;
    apiKey: string;
    apiKeySavedPlaceholder: string;
    save: string;
    microphone: string;
    screenRecording: string;
    defaultMic: string;
    firstScreen: string;
    detectMics: string;
    detectScreens: string;
    reconnect: string;
    audioLostBoth: string;
    audioLostOther: string;
    audioLostMe: string;
    transcriptionErrorPrefix: string;
    contextLabel: string;
    contextOptional: string;
    contextPlaceholder: string;
    contextSaved: string;
    contextSave: string;
    agendaLabel: string;
    agendaOptional: string;
    agendaPlaceholder: string;
    agendaSave: string;
    agendaSaved: string;
    sessionLabel: string;
    start: string;
    resume: string;
    stop: string;
    resetHistory: string;
    startHint: string;
    clearBlocks: string;
    clearBlocksTitle: string;
    quit: string;
    quitHint: string;
    openLogs: string;
    pinTitle: string;
    unpinTitle: string;
    modeHelpTitle: string;
    speechTitle: string;
    speechLanguage: string;
    speechLanguages: Record<"ru" | "en" | "auto", string>;
    speechHint: string;
    liveTracker: string;
    liveTrackerOn: string;
    liveTrackerOff: string;
    perm: Record<PermState, string>;
    sessionStates: Record<SessionKey, string>;
  };
  wizard: {
    stepOf: string;
    skip: string;
    back: string;
    next: string;
    finish: string;
    permTitle: string;
    permIntro: string;
    micWhy: string;
    screenWhy: string;
    allow: string;
    howToFix: string;
    permNotMac: string;
    accessTitle: string;
    avaletChoice: string;
    avaletChoiceDesc: string;
    ownChoice: string;
    ownChoiceDesc: string;
    avaletComingSoonDesc: string;
    provider: string;
    saveAndTest: string;
    testing: string;
    testOk: string;
    modelTitle: string;
    modelDesc: string;
    continueInBackground: string;
    contextTitle: string;
    roleLabel: string;
    optional: string;
    rolePlaceholder: string;
    tryIt: string;
    tryTitle: string;
    micLevel: string;
    micLevelNone: string;
    micUnavailable: string;
    sampleTitle: string;
    sampleConversation: string;
    sampleLoading: string;
    sampleFallback: string;
    secondsLeft: string;
  };
  simple: {
    start: string;
    pause: string;
    resume: string;
    end: string;
    statusIdle: string;
    statusNotReady: string;
    statusWaiting: string;
    statusListening: string;
    statusPaused: string;
    contextToggle: string;
    noMeeting: string;
    settings: string;
    back: string;
    appearance: string;
    theme: string;
    themeDark: string;
    themeLight: string;
    interfaceLanguage: string;
    opacity: string;
    advancedMode: string;
    advancedHint: string;
    simpleMode: string;
    simpleHint: string;
    runSetup: string;
    needAccess: string;
    setUpAccess: string;
    micBlocked: string;
    openSystemSettings: string;
    tryAgain: string;
    speechBroken: string;
    reconnect: string;
    modelPartial: string;
    modelError: string;
    modelDownloading: string;
    modelDownloadingWait: string;
    dontWait: string;
    screenBlocked: string;
    needKey: string;
    keyUnchecked: string;
    keyFailed: string;
    check: string;
    readiness: {
      label: string;
      model: string;
      key: string;
      avalet: string;
      mic: string;
      screen: string;
      ok: string;
      missing: string;
      pending: string;
    };
    meetingSection: string;
    filesSection: string;
    saveTo: string;
    chooseFolder: string;
    modelInUse: string;
    help: string;
  };
  guide: {
    title: string;
    intro: string;
    overlayTitle: string;
    overlayBody: string;
    actionSummarize: string;
    actionRisks: string;
    actionAskQuestion: string;
    actionExplain: string;
    autoTitle: string;
    autoBody: string;
    endTitle: string;
    endBody: string;
    trackerTitle: string;
    trackerBody: string;
    chooseModeTitle: string;
    chooseModeHint: string;
    changeMode: string;
    actionsTitle: string;
    actionsIntro: string;
    interviewTitle: string;
    interviewBody: string;
    boardTitle: string;
    done: string;
    close: string;
  };
  access: {
    title: string;
    ownOk: string;
    ownNoKey: string;
    tryAvalet: string;
    notActivated: string;
    startTrial: string;
    trialLeft: string;
    proLeft: string;
    renewsOn: string;
    endsOn: string;
    getPro: string;
    buyMore: string;
    renewPro: string;
    manage: string;
    checkAgain: string;
    useOwnKey: string;
    useAvalet: string;
    offlineGrace: string;
    offlineExpired: string;
    exhausted: string;
    expired: string;
    invalid: string;
    checkoutPending: string;
    activationFailed: string;
    noKeychain: string;
    paid: string;
    perMonth: string;
    paywallTitle: string;
    paywallTranscript: string;
    dismiss: string;
    serverNote: string;
    comingSoon: string;
    avaletComingSoon: string;
  };
  usage: {
    title: string;
    thisMonth: string;
    tokens: string;
    inOut: string;
    thisMeeting: string;
    estimatedNote: string;
    byPurpose: string;
    purposes: Record<"suggestion" | "tracker" | "summary" | "screenshot" | "artifact", string>;
    overlayTitle: string;
    none: string;
  };
  models: {
    title: string;
    size: string;
    absent: string;
    partial: string;
    downloading: string;
    retrying: string;
    ready: string;
    error: string;
    download: string;
    continue: string;
    retry: string;
    cancel: string;
    remove: string;
    removeConfirm: string;
    guide: string;
    vpnHint: string;
    vpnLink: string;
    missingForStart: string;
    missingAction: string;
  };
  modes: Record<MeetingModeKey, string>;
  modeHelp: Record<MeetingModeKey, string>;
  notesTitle: string;
  modeLabel: string;
  tabs: { settings: string; meeting: string; meetings: string };
  meeting: {
    noCurrent: string;
    titlePlaceholder: string;
    live: string;
    ended: string;
    transcriptEmpty: string;
    me: string;
    other: string;
    summarize: string;
    summarizing: string;
    summaryTitle: string;
    summaryEmpty: string;
    copyText: string;
    copied: string;
    exported: string;
    delete: string;
    back: string;
    listEmpty: string;
    segments: string;
    hasSummary: string;
    date: string;
    transcriptTitle: string;
    error: string;
    exportProtocol: string;
    exportTranscript: string;
    agendaToggleTitle: string;
    agendaTitle: string;
    agendaEditLabel: string;
    agendaPlaceholder: string;
    agendaSaveList: string;
    agendaEmpty: string;
    agendaNotChecked: string;
    agendaProgress: string;
    agendaClosed: string;
    agendaOpen: string;
    actionsTitle: string;
    actionsEmpty: string;
    participants: string;
    discussions: string;
    actionTask: string;
    actionOwner: string;
    actionDue: string;
    jumpTitle: string;
  };
  spec: {
    fieldLabel: string;
    fieldOptional: string;
    fieldHint: string;
    loadFile: string;
    pastePlaceholder: string;
    pastedName: string;
    sizeLine: string;
    remove: string;
    tooLarge: string;
    locked: string;
    saved: string;
    costNote: string;
    costSection: string;
    costHigh: string;
    summaryCost: string;
    decisionsTitle: string;
    decisionsHint: string;
    noDocument: string;
    attachDocument: string;
    noDecisions: string;
    noDecisionsAfter: string;
    include: string;
    statusLabel: string;
    sectionLabel: string;
    sectionUnknown: string;
    textLabel: string;
    textPlaceholder: string;
    byLabel: string;
    beforeLabel: string;
    afterLabel: string;
    details: string;
    deleteRow: string;
    addRow: string;
    ungrounded: string;
    edited: string;
    jumpTitle: string;
    updateButton: string;
    updateNeedsDocument: string;
    updateNeedsChecked: string;
    updateCostInline: string;
    confirmTitle: string;
    confirmText: string;
    confirm: string;
    cancel: string;
    working: string;
    previewTitle: string;
    previewHint: string;
    oldLabel: string;
    newLabel: string;
    emptyFragment: string;
    apply: string;
    notAppliedTitle: string;
    skippedBy: string;
    fixByHand: string;
    noPatches: string;
    noChangeFor: string;
    resultTitle: string;
    resultLine: string;
    revert: string;
    downloadDoc: string;
    copyDoc: string;
    copied: string;
    downloadDecisions: string;
    updateError: string;
    badReply: string;
    fileTitle: string;
    fileDocument: string;
    fileQuote: string;
    fileActions: string;
    fileNone: string;
    status: Record<"accepted" | "proposed" | "rejected" | "open", string>;
    ops: Record<"replace" | "insert_after" | "delete", string>;
    problems: Record<"anchor-missing" | "anchor-ambiguous" | "overlap" | "empty-anchor" | "bad-op" | "unknown-decision", string>;
  };
};

export type PermState = "granted" | "denied" | "restricted" | "not-determined" | "unknown";
export type SessionKey = "idle" | "listening" | "paused";
export type MeetingModeKey = "free" | "requirements" | "grooming" | "demo" | "review" | "interview";

export const UI_STRINGS: Record<UiLanguage, UiStrings> = {
  en: {
    autoOnTitle: "Auto-suggest is on: click to only respond to typed/quick-action questions",
    autoOffTitle: "Auto-suggest is off: click to resume automatic suggestions",
    uiLangTitle: "Interface language of the app (labels and tips, not the AI's answers): click to switch",
    screenshotTitle:
      "Take a fresh screenshot right now and prioritize it in the next answer, alongside the audio transcript",
    overlay: {
      pause: "Pause",
      pauseTitle: "Pause listening. The meeting stays open; press Resume to continue.",
      resume: "Resume",
      resumeTitle: "Resume listening",
      end: "End",
      endTitle: "End the meeting: stop listening and keep it in History",
      auto: "Auto",
      autoName: "Automatic suggestions",
      screenshotName: "Screenshot for the next answer",
      notesName: "Notes window",
    },
    opacityLabel: "Opacity",
    opacityTitle: "Opacity of all Avalet windows",
    listeningEmpty: "Listening: the first suggestion will appear here.",
    copyBlockTitle: "Copy this suggestion",
    prevBlock: "Previous suggestion",
    nextBlock: "Next suggestion",
    processNowLabel: "Process now",
    processNowTitle:
      "Generate a suggestion from what's been transcribed so far (voice only, no screenshot): auto-suggest is off, so nothing does this on its own",
    askPlaceholder: "Ask anything…",
    askButton: "Ask",
    audioDegradedBoth: "Audio lost entirely",
    audioDegradedOther: "Only hearing you: the other side's audio dropped",
    audioDegradedMe: "Your mic dropped",
    reconnectButton: "Reconnect",
    reconnectTitle: "Try to re-acquire audio capture right now",
    transcriptionErrorPrefix: "Speech recognition is struggling:",
    tracker: {
      toggle: "Checklist",
      toggleTitle: "Agenda and action points, updated live",
      agenda: "Agenda",
      actions: "Action points",
      agendaEmpty: "No questions yet. Add one below as it comes up.",
      actionsEmpty: "Nothing agreed yet. New tasks appear here on their own.",
      addQuestionPlaceholder: "New question for the agenda…",
      addActionPlaceholder: "Add an action point…",
      add: "Add",
      refresh: "Update now",
      refreshTitle: "Re-read the latest part of the call",
      updating: "updating…",
      markTitle: "Click to mark closed or open",
      confirm: "Confirm",
      dismiss: "Remove",
      proposed: "Found in the call: confirm or remove",
      discussing: "being discussed",
      noOwner: "no owner",
      newCount: "new",
      addItem: "Add item",
      itemTitle: "Show what was said",
      noQuote: "No exact words found for this item yet.",
    },
    board: {
      toggleTitle: "Collected from the suggestions of this meeting",
      copy: "Copy",
      copied: "Copied",
      sections: {
        requirements: "Requirements",
        risks: "Risks",
        slices: "Slices",
        separate: "Separate tasks",
        deviations: "Deviations",
        checks: "Ask to see",
        remarks: "Remarks",
        proposals: "Proposals",
        decisions: "Decisions",
      },
    },
    locks: {
      modeBadge: "{mode} (Pro)",
      modeTitle: "{mode}: in the Pro plan",
      boardLine: {
        requirements: "During the call, candidate requirements and risks are collected in a separate list.",
        grooming: "During the call, the proposed slices, separate tasks and risks are collected in a separate list.",
        demo: "During the call, deviations from the requirements and what to ask to see are collected in a separate list.",
        review: "During the call, remarks, proposals and decisions are collected in a separate list.",
      },
      planLine: "Included in Pro with every meeting type and the live checklist.",
      includedLine: "Your plan includes: {modes}.",
      notNow: "Not now",
      ownKeyHint: "With your own key all of this is free.",
      unlocked: "Done: the {mode} mode is available.",
      useIt: "Use it",
      checklistTitle: "Live checklist: in the Pro plan",
      checklistBody:
        "While the call goes on, agenda items are marked by themselves and tasks with owner and deadline are collected. Marks you set by hand stay as they are.",
      checklistRow: "Live checklist in Pro",
      checklistUnlocked: "Done: the live checklist is available.",
      turnOn: "Turn it on",
      howItWorks: "How it works",
      imageAlt: "Screenshot: {name} during a meeting",
    },
    quickActions: {
      summarize: "Recap",
      risks: "Risks?",
      askQuestion: "Ask a question",
      explainThis: "Explain this",
    },
    settings: {
      subtitle: "Meeting assistant for systems analysts. Pick a provider, save a key, hit Start.",
      onboarding: "First time here: pick a provider below, paste its API key and hit Save. That's the whole setup.",
      themeToLight: "Switch to light appearance",
      themeToDark: "Switch to dark appearance",
      keySaved: "key saved",
      model: "Model",
      baseUrl: "Base URL",
      backgroundModel: "Model for background work",
      backgroundModelHint: "Used by the live checklist, which runs often and needs no top model. Empty: the main model.",
      apiKey: "API key",
      apiKeySavedPlaceholder: "•••• saved, enter to replace",
      save: "Save",
      microphone: "Microphone",
      screenRecording: "Screen recording",
      defaultMic: "System default microphone",
      firstScreen: "First available screen",
      detectMics: "Detect microphones",
      detectScreens: "Detect screens",
      reconnect: "Reconnect",
      audioLostBoth: "Audio lost entirely",
      audioLostOther: "Only hearing you: the other side's audio dropped",
      audioLostMe: "Your mic dropped",
      transcriptionErrorPrefix: "Speech recognition is struggling:",
      contextLabel: "Meeting context",
      contextOptional: "(optional: ticket, spec, agenda)",
      contextPlaceholder: "Paste the ticket, requirement doc, or agenda for this call…",
      contextSaved: "Saved",
      contextSave: "Save context",
      agendaLabel: "Agenda",
      agendaOptional: "(optional: one question per line)",
      agendaPlaceholder: "Which questions must get an answer on this call, one per line…",
      agendaSave: "Save agenda",
      agendaSaved: "Saved",
      sessionLabel: "Session",
      start: "Start",
      resume: "Resume",
      stop: "Stop",
      resetHistory: "End meeting",
      startHint: "Start asks for mic and screen-share (system audio) permissions and opens the overlay. Stop freezes live output but keeps blocks in the overlay for paging. End meeting closes the record; the next Start opens a new one.",
      clearBlocks: "Clear overlay",
      clearBlocksTitle: "Remove the suggestions from the overlay. The meeting and its transcript are kept.",
      quit: "Quit Avalet",
      openLogs: "Open the log folder",
      quitHint: "Stops listening, saves the current meeting, and closes the app.",
      pinTitle: "This window floats above others. Click to make it an ordinary window.",
      unpinTitle: "Keep this window above other windows during the call.",
      modeHelpTitle: "What each mode does",
      speechTitle: "Speech recognition",
      speechLanguage: "Spoken language",
      speechLanguages: { ru: "Russian", en: "English", auto: "Detect automatically" },
      speechHint:
        "Speech is recognized on your Mac by one model, downloaded once; after that it works without internet. A fixed language is more reliable than detecting it on every phrase.",
      liveTracker: "Live checklist (agenda marks and action points during the call)",
      liveTrackerOn: "A small background model call every 30 to 90 seconds keeps the agenda and tasks current. Not yet checked on real meetings.",
      liveTrackerOff: "Off: agenda marks are set by hand; the summary still fills them in after the call.",
      perm: {
        granted: "Granted",
        denied: "Denied",
        restricted: "Restricted",
        "not-determined": "Not asked yet",
        unknown: "Unknown",
      },
      sessionStates: { idle: "Idle", listening: "Listening", paused: "Paused" },
    },
    wizard: {
      stepOf: "Step {n} of {total}",
      skip: "Skip for now",
      back: "Back",
      next: "Continue",
      finish: "Finish",
      permTitle: "Let Avalet hear the call",
      permIntro: "macOS asks once for each. You can change it later in System Settings.",
      micWhy: "Microphone: to transcribe what you say.",
      screenWhy: "Screen recording: macOS requires it to capture the other side's audio. Screenshots are taken only when you press the camera button.",
      allow: "Allow",
      howToFix: "How to fix",
      permNotMac: "This system does not ask for these permissions separately, nothing to do here.",
      accessTitle: "How should Avalet reach a language model?",
      avaletChoice: "Avalet, no keys",
      avaletChoiceDesc: "{n} tokens free to start, no card. Later Pro for {price}.",
      ownChoice: "My own key",
      ownChoiceDesc: "Claude, ChatGPT, DeepSeek or a local model. Free in Avalet; you pay the provider directly.",
      avaletComingSoonDesc: "A built-in model with no keys. For now choose your own key.",
      provider: "Provider",
      saveAndTest: "Save and test",
      testing: "Testing",
      testOk: "The key works.",
      modelTitle: "Speech recognition on this Mac",
      modelDesc: "Speech is recognized on this Mac, nothing is uploaded. The model is {size} and starts downloading in the background right after the first screen; on a normal connection that takes 2 to 5 minutes, once.",
      continueInBackground: "Continue, it finishes in the background",
      contextTitle: "What is your next meeting about?",
      roleLabel: "What is this project or your role?",
      optional: "(optional)",
      rolePlaceholder: "For example: analyst on a reporting project in a bank's CRM",
      tryIt: "Try it",
      tryTitle: "A 20-second check",
      micLevel: "Microphone level: say a few words",
      micLevelNone: "No sound yet. Check that the right microphone is selected.",
      micUnavailable: "The microphone is not available. You can allow it in System Settings and try again.",
      sampleTitle: "What a suggestion looks like for a sample conversation",
      sampleConversation: "A made-up conversation (in Russian, like the answers)",
      sampleLoading: "Asking the model",
      sampleFallback: "Here is an example of what it would say:",
      secondsLeft: "{n} s",
    },
    simple: {
      start: "Start",
      pause: "Pause",
      resume: "Resume",
      end: "End meeting",
      statusIdle: "Ready. Press Start when the call begins.",
      statusNotReady: "Not everything is ready yet, see below.",
      statusWaiting: "Waiting for the speech model to finish downloading.",
      statusListening: "Listening",
      statusPaused: "Paused. The meeting stays open until you end it.",
      contextToggle: "Context and agenda",
      noMeeting: "No meeting yet. Press Start when the call begins, the transcript appears here.",
      settings: "Settings",
      back: "Back",
      appearance: "Appearance",
      theme: "Theme",
      themeDark: "Dark",
      themeLight: "Light",
      interfaceLanguage: "Interface language",
      opacity: "Window opacity",
      advancedMode: "Advanced mode",
      advancedHint: "Every setting: providers, models, thresholds, screenshot text, logs.",
      simpleMode: "Simple mode",
      simpleHint: "Back to the essentials: start, stop, context, transcript, summary.",
      runSetup: "Run setup again",
      needAccess: "Suggestions need a language model: add your key or start the free trial.",
      setUpAccess: "Set up access",
      micBlocked: "Avalet cannot use the microphone.",
      openSystemSettings: "Open System Settings",
      tryAgain: "Try again",
      speechBroken: "Speech recognition is not keeping up right now.",
      reconnect: "Reconnect",
      modelPartial: "The speech model is only partly downloaded, so nothing can be transcribed yet.",
      modelError: "The speech model could not be downloaded, so nothing can be transcribed yet.",
      modelDownloading: "The speech model is downloading: {percent}%. Start works when it is ready.",
      modelDownloadingWait: "The speech model is downloading: {percent}%. The meeting starts by itself when it is ready.",
      dontWait: "Do not start",
      screenBlocked: "Avalet cannot hear the other side: Screen Recording is not allowed.",
      needKey: "Suggestions need a language model: add your provider key.",
      keyUnchecked: "Key is not checked yet.",
      keyFailed: "The key did not pass the check, so there will be no suggestions.",
      check: "Check",
      readiness: {
        label: "Ready for a meeting",
        model: "Speech model",
        key: "Key",
        avalet: "Avalet access",
        mic: "Microphone",
        screen: "Screen recording",
        ok: "ready",
        missing: "missing",
        pending: "not yet",
      },
      meetingSection: "Meeting",
      filesSection: "Files",
      saveTo: "Protocols and transcripts are saved to this folder:",
      chooseFolder: "Choose folder",
      modelInUse: "Answers come from {provider}, model {model}. The model is changed in Advanced mode.",
      help: "How it works",
    },
    guide: {
      title: "How Avalet works",
      intro: "A short read before your first real call, so nothing here is a surprise mid-meeting.",
      overlayTitle: "The overlay",
      overlayBody:
        "A small floating panel that stays on top of other windows and is excluded from your own screen share. Suggestions stream into it in blocks as the call goes; use the arrows to page through earlier ones.",
      actionSummarize: "The last couple of minutes in 2-3 bullets. For catching up if you looked away.",
      actionRisks: "What in the requirement just discussed looks shaky or incomplete right now.",
      actionAskQuestion: "One sharp clarifying question to ask next, when you are not sure what to ask yourself.",
      actionExplain: "What was just said or shown on screen, in plain terms.",
      autoTitle: "Auto",
      autoBody:
        "On by default: a suggestion appears by itself after the other side pauses. Turn it off to only get one when you press a button or type a question, useful in a quiet or very fast-moving call.",
      endTitle: "Pause and End",
      endBody: "Pause stops listening without closing the meeting; press it again to continue. End closes the meeting for good and saves it, with a summary, to History.",
      trackerTitle: "Live checklist (Advanced)",
      trackerBody: "Turn it on in Advanced settings to have agenda items and action points tracked as the call goes, not only when you ask for a summary. Click an item to see the exact words that were said, who said them and when. The list folds itself when a new suggestion arrives.",
      chooseModeTitle: "Your meeting type",
      chooseModeHint: "The overlay's buttons and running list depend on the meeting mode. Pick the one you will actually use.",
      changeMode: "Different meeting type",
      actionsTitle: "Buttons in this mode",
      actionsIntro: "This mode's buttons, in addition to the suggestions that arrive on their own:",
      interviewTitle: "One button: Process now",
      interviewBody:
        "Interview mode has no quick-action buttons: listening runs the whole time, and Process now asks for a suggestion right away instead of waiting for a pause. The main window hides itself so only the overlay shows.",
      boardTitle: "Running list",
      done: "Got it, start",
      close: "Close",
    },
    access: {
      title: "Access",
      ownOk: "Your own key: free, no limits. Calls go straight from this Mac to the provider.",
      ownNoKey: "Your own key: add the provider's key below to start.",
      tryAvalet: "No key? Try Avalet: {n} tokens free, no card.",
      notActivated: "Avalet without keys: start with {n} free tokens, no card needed.",
      startTrial: "Start free trial",
      trialLeft: "Trial: {left} of {total} tokens left.",
      proLeft: "Pro: {left} of {total} tokens left this period.",
      renewsOn: "Renews on {date}.",
      endsOn: "Ends on {date}, not renewed.",
      getPro: "Get Pro, {price}",
      buyMore: "Buy more tokens",
      renewPro: "Renew Pro",
      manage: "Manage or cancel",
      checkAgain: "Check again",
      useOwnKey: "Use my own key",
      useAvalet: "Use Avalet",
      offlineGrace: "Cannot reach Avalet right now. It keeps working on the last check until {date}.",
      offlineExpired: "No connection to Avalet for 3 days, so the built-in provider is paused. Use your own key, or check again when online.",
      exhausted: "The Avalet tokens are used up. The transcript keeps recording.",
      expired: "Your Pro period has ended. The transcript and your meetings stay on this Mac.",
      invalid: "The answer from the Avalet server could not be verified, so it was not accepted.",
      checkoutPending: "Waiting for the payment to finish in your browser.",
      activationFailed: "Could not reach the Avalet server. Check the internet connection and try again.",
      noKeychain: "This system has no secure key storage, so Avalet cannot keep a trial here. Use your own key instead.",
      paid: "I have paid",
      perMonth: "per month",
      paywallTitle: "Avalet tokens are used up",
      paywallTranscript: "Nothing is lost: the transcript keeps recording.",
      dismiss: "Close",
      serverNote: "The Avalet server counts tokens; it does not keep transcripts.",
      comingSoon: "Coming soon",
      avaletComingSoon: "Avalet without keys is coming soon. Until then Avalet works with your own key.",
    },
    usage: {
      title: "Usage",
      thisMonth: "This month",
      tokens: "tokens",
      inOut: "in {in}, out {out}",
      thisMeeting: "This meeting",
      estimatedNote: "{n} calls had no count from the provider and are estimated.",
      byPurpose: "By purpose",
      purposes: { suggestion: "Suggestions", tracker: "Checklist", summary: "Summaries", screenshot: "Screenshots", artifact: "Document updates" },
      overlayTitle: "Tokens used in this meeting",
      none: "No model calls yet this month.",
    },
    models: {
      title: "Speech model",
      size: "GB",
      absent: "Not downloaded",
      partial: "Partly downloaded",
      downloading: "Downloading",
      retrying: "Connection lost, trying again",
      ready: "Ready, works offline",
      error: "Download failed",
      download: "Download",
      continue: "Continue",
      retry: "Try again",
      cancel: "Cancel",
      remove: "Delete",
      removeConfirm: "Delete this model from disk? You can download it again later.",
      guide:
        "The speech model turns the call into text on this Mac, nothing is uploaded. It downloads once, about half a gigabyte; the first download needs internet, from Russia often with a VPN. After that it works offline.",
      vpnHint: "Slow or not downloading: turn on a VPN for the first download.",
      vpnLink: "the VPN we use",
      missingForStart: "The speech model is not downloaded yet, so nothing can be transcribed.",
      missingAction: "Download the model",
    },
    modes: {
      free: "Free",
      requirements: "Requirements",
      grooming: "Grooming",
      demo: "Demo / acceptance",
      review: "Document review",
      interview: "Interview",
    },
    modeHelp: {
      free: "No specialization: short suggestions for any conversation.",
      requirements: "A session with a stakeholder: turns wishes into testable requirements, catches contradictions, suggests what to clarify.",
      grooming: "Estimating and splitting a task: scope, dependencies, hidden work, a split into slices with acceptance criteria.",
      demo: "Accepting what is shown: compares it with the requirements, finds unverified states, prepares the sign-off conditions.",
      review: "You present a document: notes remarks and proposals by section, catches decisions with owner and deadline. Load the document before the call, and after it update the document from the confirmed decisions.",
      interview: "You are the one answering: a complete, structured answer with an example and the likely follow-up question.",
    },
    notesTitle: "Show or hide the notes window (transcript, summary, settings)",
    modeLabel: "Meeting mode",
    tabs: { settings: "Settings", meeting: "Meeting", meetings: "History" },
    meeting: {
      noCurrent: "No meeting in progress. Press Start in Settings: the transcript will appear here.",
      titlePlaceholder: "Meeting title",
      live: "live",
      ended: "ended",
      transcriptEmpty: "Listening. The first phrases will appear here in a few seconds.",
      me: "Me",
      other: "Other",
      summarize: "Meeting summary",
      summarizing: "Writing the summary…",
      summaryTitle: "Summary",
      summaryEmpty: "No summary yet. Press \"Meeting summary\" when the call is over (or any time during it).",
      copyText: "Copy as text",
      copied: "Copied",
      exported: "Saved",
      delete: "Delete",
      back: "Back to list",
      listEmpty: "No meetings yet. Every Start creates one; End meeting closes it.",
      segments: "phrases",
      hasSummary: "summary",
      date: "Date",
      transcriptTitle: "Transcript",
      error: "Error",
      exportProtocol: "Download protocol",
      exportTranscript: "Download transcript",
      agendaToggleTitle: "Agenda and action points",
      agendaTitle: "Agenda",
      agendaEditLabel: "Agenda, one question per line",
      agendaPlaceholder: "Which questions must get an answer on this call…",
      agendaSaveList: "Save list",
      agendaEmpty: "No agenda. Add questions above: after \"Summary\" each one gets a checkmark or stays open.",
      agendaNotChecked: "Not checked yet: press \"Summary\".",
      agendaProgress: "closed",
      agendaClosed: "closed",
      agendaOpen: "open",
      actionsTitle: "Action points",
      actionsEmpty: "None yet. They appear after \"Summary\".",
      participants: "Participants",
      discussions: "Discussion",
      actionTask: "Task",
      actionOwner: "Owner",
      actionDue: "Due",
      jumpTitle: "Show this moment in the transcript",
    },
    spec: {
      fieldLabel: "Document under review",
      fieldOptional: "(optional, .md or .txt)",
      fieldHint: "The specification you are discussing. After the call you get the list of decisions and can update the document with them.",
      loadFile: "Load file",
      pastePlaceholder: "Or paste the document text here",
      pastedName: "Pasted text",
      sizeLine: "{name}: {chars} characters",
      remove: "Remove",
      tooLarge: "The document is too long: {chars} characters, the limit is 200,000. Load only the sections this call is about.",
      locked: "The document stays as it is while the meeting runs. You can change it after the meeting ends.",
      saved: "Saved",
      costNote: "Cost: at the end the whole document goes to the model twice, for the summary and for the update, about {tokens} tokens each time. Hints during the call get only its table of contents, about {index} tokens each.",
      costSection: "A typed question that names a section, for example «section 3.2», also carries that section, up to about {tokens} tokens.",
      costHigh: "The document is large, so the summary and the update cost noticeably more than usual.",
      summaryCost: "This summary also reads the document: about {tokens} more tokens than usual.",
      decisionsTitle: "Decisions",
      decisionsHint: "Check what goes into the document update. Everything here comes from the call; correct it if needed.",
      noDocument: "No document is attached to this meeting, so it cannot be updated.",
      attachDocument: "Attach document",
      noDecisions: "No decisions yet. Make the summary: decisions are collected from it.",
      noDecisionsAfter: "The summary found no decisions in this call. If something was agreed, add it by hand.",
      include: "Include in the update",
      statusLabel: "Status",
      sectionLabel: "Section",
      sectionUnknown: "Not determined",
      textLabel: "Decision",
      textPlaceholder: "What was decided",
      byLabel: "Who",
      beforeLabel: "Was",
      afterLabel: "Becomes",
      details: "Details",
      deleteRow: "Delete",
      addRow: "Add decision",
      ungrounded: "The supporting words were not found in the transcript. Check before including.",
      edited: "edited",
      jumpTitle: "Show this moment in the transcript",
      updateButton: "Update the document",
      updateNeedsDocument: "Attach the document to update it.",
      updateNeedsChecked: "Check at least one decision.",
      updateCostInline: "about {tokens} tokens",
      confirmTitle: "Update the document?",
      confirmText: "One request to the model: the whole document (about {doc} tokens), the checked decisions ({count}, about {decisions}) and the answer with the changes (about {reply}). About {total} tokens in all. Nothing changes in the document until you look through the changes and press Apply.",
      confirm: "Send",
      cancel: "Cancel",
      working: "Preparing the changes…",
      previewTitle: "Changes to the document",
      previewHint: "Check each change. Only the checked ones are applied.",
      oldLabel: "Now",
      newLabel: "After",
      emptyFragment: "(nothing)",
      apply: "Apply",
      notAppliedTitle: "Not applied",
      skippedBy: "The model could not place it: {reason}",
      fixByHand: "Add these by hand to the downloaded document.",
      noPatches: "The model proposed no changes.",
      noChangeFor: "The model proposed no change for it.",
      resultTitle: "Updated document",
      resultLine: "Changes applied: {count}.",
      revert: "Back to the original",
      downloadDoc: "Download document",
      copyDoc: "Copy document",
      copied: "Copied",
      downloadDecisions: "Download decisions",
      updateError: "Could not prepare the changes: {message}",
      badReply: "The model answered in an unexpected form. Try again.",
      fileTitle: "Decisions",
      fileDocument: "Document",
      fileQuote: "Quote",
      fileActions: "Action points",
      fileNone: "none",
      status: { accepted: "Accepted", proposed: "Proposed", rejected: "Rejected", open: "Open" },
      ops: { replace: "Replace", insert_after: "Insert after", delete: "Delete" },
      problems: { "anchor-missing": "the place it points to is not in the document", "anchor-ambiguous": "the place it points to occurs more than once", overlap: "overlaps another change", "empty-anchor": "no place in the document was given", "bad-op": "unknown kind of change", "unknown-decision": "not asked for by any checked decision" },
    },
  },
  ru: {
    autoOnTitle: "Авто-подсказки включены: клик, чтобы реагировать только на вопросы и быстрые кнопки",
    autoOffTitle: "Авто-подсказки выключены: клик, чтобы снова включить",
    uiLangTitle: "Язык интерфейса приложения (подписи и подсказки, не ответы ИИ): клик переключает",
    screenshotTitle:
      "Сделать свежий скриншот прямо сейчас и учесть его в следующем ответе вместе с аудио-транскриптом",
    overlay: {
      pause: "Пауза",
      pauseTitle: "Пауза: перестать слушать. Встреча остаётся открытой, кнопка «Продолжить» снова включит запись.",
      resume: "Продолжить",
      resumeTitle: "Продолжить слушать",
      end: "Завершить",
      endTitle: "Завершить встречу: остановить запись, встреча сохранится в Истории",
      auto: "Авто",
      autoName: "Автоподсказки",
      screenshotName: "Снимок экрана для следующего ответа",
      notesName: "Окно конспекта",
    },
    opacityLabel: "Прозрачность",
    opacityTitle: "Прозрачность всех окон Avalet",
    listeningEmpty: "Слушаю: первая подсказка появится здесь.",
    copyBlockTitle: "Скопировать подсказку",
    prevBlock: "Предыдущая подсказка",
    nextBlock: "Следующая подсказка",
    processNowLabel: "Обработать сейчас",
    processNowTitle:
      "Сгенерировать подсказку из того, что уже расшифровано (только голос, без скриншота): авто-режим выключен, само это не сделает",
    askPlaceholder: "Спросите что угодно…",
    askButton: "Спросить",
    audioDegradedBoth: "Звук пропал полностью",
    audioDegradedOther: "Слышу только себя: звук собеседника пропал",
    audioDegradedMe: "Свой микрофон пропал",
    reconnectButton: "Переподключить",
    reconnectTitle: "Попробовать восстановить захват звука прямо сейчас",
    transcriptionErrorPrefix: "Распознавание речи спотыкается:",
    tracker: {
      toggle: "Чек-лист",
      toggleTitle: "Повестка и экшн-поинты, обновляются по ходу встречи",
      agenda: "Повестка",
      actions: "Экшн-поинты",
      agendaEmpty: "Вопросов пока нет. Добавьте новый ниже, когда он появится.",
      actionsEmpty: "Пока ни о чём не договорились. Новые задачи появятся здесь сами.",
      addQuestionPlaceholder: "Новый вопрос в повестку…",
      addActionPlaceholder: "Добавить экшн-поинт…",
      add: "Добавить",
      refresh: "Обновить сейчас",
      refreshTitle: "Перечитать последнюю часть разговора",
      updating: "обновляю…",
      markTitle: "Клик: отметить закрытым или открытым",
      confirm: "Подтвердить",
      dismiss: "Убрать",
      proposed: "Нашла модель: подтвердите или уберите",
      discussing: "обсуждается",
      noOwner: "без исполнителя",
      newCount: "новых",
      addItem: "Добавить пункт",
      itemTitle: "Показать, что сказали",
      noQuote: "Точных слов для этого пункта пока нет.",
    },
    board: {
      toggleTitle: "Собрано из подсказок этой встречи",
      copy: "Копировать",
      copied: "Скопировано",
      sections: {
        requirements: "Требования",
        risks: "Риски",
        slices: "Срезы",
        separate: "Отдельные задачи",
        deviations: "Отклонения",
        checks: "Попросить показать",
        remarks: "Замечания",
        proposals: "Предложения",
        decisions: "Решения",
      },
    },
    locks: {
      modeBadge: "{mode} (в Pro)",
      modeTitle: "{mode}: в тарифе Pro",
      boardLine: {
        requirements: "По ходу встречи требования и риски собираются в отдельный список.",
        grooming: "По ходу встречи предложенные срезы, отдельные задачи и риски собираются в отдельный список.",
        demo: "По ходу встречи отклонения от требований и что ещё попросить показать собираются в отдельный список.",
        review: "По ходу встречи замечания, предложения и решения собираются в отдельный список.",
      },
      planLine: "Входит в Pro вместе со всеми типами встреч и живым чек-листом.",
      includedLine: "В вашем тарифе есть: {modes}.",
      notNow: "Не сейчас",
      ownKeyHint: "Со своим ключом всё это бесплатно.",
      unlocked: "Готово: режим \"{mode}\" доступен.",
      useIt: "Выбрать",
      checklistTitle: "Живой чек-лист: в тарифе Pro",
      checklistBody:
        "Пока идёт встреча, пункты повестки отмечаются сами, а задачи с ответственным и сроком собираются в список. Отметки, которые вы поставили вручную, не меняются.",
      checklistRow: "Живой чек-лист в Pro",
      checklistUnlocked: "Готово: живой чек-лист доступен.",
      turnOn: "Включить",
      howItWorks: "Как это работает",
      imageAlt: "Снимок экрана: {name} во время встречи",
    },
    quickActions: {
      summarize: "Кратко",
      risks: "Риски?",
      askQuestion: "Уточняющий вопрос",
      explainThis: "Объяснить",
    },
    settings: {
      subtitle: "Ассистент системного аналитика на встречах. Выберите провайдера, сохраните ключ, нажмите Старт.",
      onboarding: "Первый запуск: выберите провайдера ниже, вставьте его API-ключ и нажмите Сохранить. Это вся настройка.",
      themeToLight: "Светлая тема",
      themeToDark: "Тёмная тема",
      keySaved: "ключ сохранён",
      model: "Модель",
      baseUrl: "Base URL",
      backgroundModel: "Модель для фоновой работы",
      backgroundModelHint: "Её использует живой чек-лист: он запускается часто, и топовая модель ему не нужна. Пусто: основная модель.",
      apiKey: "API-ключ",
      apiKeySavedPlaceholder: "•••• сохранён, введите новый для замены",
      save: "Сохранить",
      microphone: "Микрофон",
      screenRecording: "Запись экрана",
      defaultMic: "Системный микрофон по умолчанию",
      firstScreen: "Первый доступный экран",
      detectMics: "Найти микрофоны",
      detectScreens: "Найти экраны",
      reconnect: "Переподключить",
      audioLostBoth: "Звук пропал полностью",
      audioLostOther: "Слышу только вас: звук собеседника пропал",
      audioLostMe: "Ваш микрофон пропал",
      transcriptionErrorPrefix: "Распознавание речи спотыкается:",
      contextLabel: "Контекст встречи",
      contextOptional: "(необязательно: тикет, ТЗ, повестка)",
      contextPlaceholder: "Вставьте тикет, постановку или повестку этой встречи…",
      contextSaved: "Сохранено",
      contextSave: "Сохранить контекст",
      agendaLabel: "Повестка",
      agendaOptional: "(по желанию: по вопросу на строку)",
      agendaPlaceholder: "На какие вопросы нужно получить ответ на этой встрече, по одному на строку…",
      agendaSave: "Сохранить повестку",
      agendaSaved: "Сохранено",
      sessionLabel: "Сессия",
      start: "Старт",
      resume: "Продолжить",
      stop: "Стоп",
      resetHistory: "Завершить встречу",
      startHint: "Старт запросит доступ к микрофону и к экрану (для звука собеседника) и откроет оверлей. Стоп замораживает подсказки, но оставляет их в оверлее для пролистывания. Завершить встречу закрывает запись, следующий Старт откроет новую.",
      clearBlocks: "Очистить оверлей",
      clearBlocksTitle: "Убрать накопленные подсказки из оверлея. Встреча и транскрипт остаются.",
      quit: "Выйти из Avalet",
      openLogs: "Открыть папку с логами",
      quitHint: "Останавливает прослушивание, сохраняет текущую встречу и закрывает приложение.",
      pinTitle: "Окно закреплено поверх других. Нажмите, чтобы сделать его обычным.",
      unpinTitle: "Держать окно поверх других во время звонка.",
      modeHelpTitle: "Что делает каждый режим",
      speechTitle: "Распознавание речи",
      speechLanguage: "Язык речи",
      speechLanguages: { ru: "Русский", en: "English", auto: "Определять автоматически" },
      speechHint:
        "Речь распознаёт на вашем Mac одна модель, она скачивается один раз и дальше работает без интернета. Фиксированный язык надёжнее, чем угадывание на каждой фразе.",
      liveTracker: "Живой чек-лист (отметки повестки и задачи по ходу звонка)",
      liveTrackerOn: "Небольшой фоновый запрос к модели раз в 30-90 секунд обновляет повестку и задачи. Пока не проверен на реальных встречах.",
      liveTrackerOff: "Выключен: отметки повестки ставятся вручную, итог встречи всё равно заполнит их после звонка.",
      perm: {
        granted: "Разрешено",
        denied: "Запрещено",
        restricted: "Ограничено",
        "not-determined": "Ещё не запрашивался",
        unknown: "Неизвестно",
      },
      sessionStates: { idle: "Ожидание", listening: "Слушаю", paused: "Пауза" },
    },
    wizard: {
      stepOf: "Шаг {n} из {total}",
      skip: "Пропустить",
      back: "Назад",
      next: "Дальше",
      finish: "Готово",
      permTitle: "Разрешите Avalet слышать звонок",
      permIntro: "macOS спрашивает один раз для каждого. Потом это можно поменять в Системных настройках.",
      micWhy: "Микрофон: чтобы расшифровывать то, что говорите вы.",
      screenWhy: "Запись экрана: без неё macOS не даёт захватить звук собеседника. Скриншоты делаются только когда вы нажимаете кнопку с камерой.",
      allow: "Разрешить",
      howToFix: "Как исправить",
      permNotMac: "Эта система не спрашивает такие разрешения отдельно, здесь ничего делать не нужно.",
      accessTitle: "Через что Avalet будет обращаться к языковой модели?",
      avaletChoice: "Avalet, без ключей",
      avaletChoiceDesc: "{n} токенов бесплатно для начала, без карты. Потом Pro за {price}.",
      ownChoice: "Мой ключ",
      ownChoiceDesc: "Claude, ChatGPT, DeepSeek или локальная модель. В Avalet бесплатно, платите провайдеру напрямую.",
      avaletComingSoonDesc: "Встроенная модель без ключей. Пока выберите свой ключ.",
      provider: "Провайдер",
      saveAndTest: "Сохранить и проверить",
      testing: "Проверяем",
      testOk: "Ключ работает.",
      modelTitle: "Распознавание речи на этом Mac",
      modelDesc: "Речь распознаётся на этом Mac, ничего не отправляется наружу. Модель весит {size} и начинает скачиваться в фоне сразу после первого экрана; при обычном интернете это 2-5 минут, один раз.",
      continueInBackground: "Дальше, докачается в фоне",
      contextTitle: "О чём ваша следующая встреча?",
      roleLabel: "Что это за проект или какая у вас роль?",
      optional: "(необязательно)",
      rolePlaceholder: "Например: аналитик проекта отчётности в CRM банка",
      tryIt: "Попробовать",
      tryTitle: "Проверка за 20 секунд",
      micLevel: "Уровень микрофона: скажите пару слов",
      micLevelNone: "Звука пока нет. Проверьте, что выбран нужный микрофон.",
      micUnavailable: "Микрофон недоступен. Разрешите его в Системных настройках и попробуйте снова.",
      sampleTitle: "Как выглядит подсказка на примере разговора",
      sampleConversation: "Придуманный разговор для примера",
      sampleLoading: "Спрашиваем модель",
      sampleFallback: "Вот пример того, что она подскажет:",
      secondsLeft: "{n} с",
    },
    simple: {
      start: "Старт",
      pause: "Пауза",
      resume: "Продолжить",
      end: "Завершить встречу",
      statusIdle: "Всё готово. Нажмите Старт, когда начнётся звонок.",
      statusNotReady: "Пока не всё готово, см. ниже.",
      statusWaiting: "Жду, пока скачается модель распознавания речи.",
      statusListening: "Слушаю",
      statusPaused: "Пауза. Встреча остаётся открытой, пока вы её не завершите.",
      contextToggle: "Контекст и повестка",
      noMeeting: "Встречи ещё нет. Нажмите Старт, когда начнётся звонок, расшифровка появится здесь.",
      settings: "Настройки",
      back: "Назад",
      appearance: "Внешний вид",
      theme: "Тема",
      themeDark: "Тёмная",
      themeLight: "Светлая",
      interfaceLanguage: "Язык интерфейса",
      opacity: "Прозрачность окон",
      advancedMode: "Расширенный режим",
      advancedHint: "Все настройки: провайдеры, модели, пороги, текст со скриншотов, логи.",
      simpleMode: "Простой режим",
      simpleHint: "Только главное: старт, пауза, контекст, расшифровка, итог.",
      runSetup: "Пройти настройку заново",
      needAccess: "Для подсказок нужна языковая модель: добавьте свой ключ или начните бесплатно.",
      setUpAccess: "Настроить доступ",
      micBlocked: "Avalet не может использовать микрофон.",
      openSystemSettings: "Открыть Системные настройки",
      tryAgain: "Попробовать снова",
      speechBroken: "Распознавание речи сейчас не успевает.",
      reconnect: "Переподключить",
      modelPartial: "Модель распознавания речи скачана не до конца, поэтому расшифровки пока не будет.",
      modelError: "Модель распознавания речи не скачалась, поэтому расшифровки пока не будет.",
      modelDownloading: "Модель распознавания речи скачивается: {percent}%. Старт заработает, когда она будет готова.",
      modelDownloadingWait: "Модель распознавания речи скачивается: {percent}%. Встреча начнётся сама, когда модель будет готова.",
      dontWait: "Не начинать",
      screenBlocked: "Avalet не слышит собеседника: не разрешена запись экрана.",
      needKey: "Для подсказок нужна языковая модель: добавьте ключ провайдера.",
      keyUnchecked: "Ключ ещё не проверен.",
      keyFailed: "Ключ не прошёл проверку, поэтому подсказок не будет.",
      check: "Проверить",
      readiness: {
        label: "Готовность к встрече",
        model: "Модель речи",
        key: "Ключ",
        avalet: "Доступ Avalet",
        mic: "Микрофон",
        screen: "Запись экрана",
        ok: "готово",
        missing: "нет",
        pending: "ещё нет",
      },
      meetingSection: "Встреча",
      filesSection: "Файлы",
      saveTo: "Протоколы и расшифровки сохраняются в эту папку:",
      chooseFolder: "Выбрать папку",
      modelInUse: "Отвечает {provider}, модель {model}. Сменить модель можно в расширенном режиме.",
      help: "Как это работает",
    },
    guide: {
      title: "Как работает Avalet",
      intro: "Коротко прочитать до первого настоящего звонка, чтобы ничего здесь не стало сюрпризом прямо на встрече.",
      overlayTitle: "Оверлей",
      overlayBody:
        "Маленькая плавающая панель поверх других окон, которая не попадает в вашу же трансляцию экрана. Подсказки приходят в неё живыми блоками по ходу звонка; стрелками можно пролистать более ранние.",
      actionSummarize: "Последние пару минут в 2-3 тезисах. Если отвлеклись и хотите догнать разговор.",
      actionRisks: "Что в только что обсуждённом требовании выглядит шатко или неполно прямо сейчас.",
      actionAskQuestion: "Одна острая мысль, что спросить дальше, если не знаете сами.",
      actionExplain: "Что только что сказали или показали на экране, простыми словами.",
      autoTitle: "Авто",
      autoBody:
        "Включено по умолчанию: подсказка появляется сама после паузы собеседника. Выключите, чтобы получать её только по кнопке или вопросу, пригодится на тихом или очень быстром звонке.",
      endTitle: "Пауза и Завершить",
      endBody: "Пауза останавливает прослушивание, не закрывая встречу; нажмите ещё раз, чтобы продолжить. Завершить закрывает встречу окончательно и сохраняет её с итогом в Историю.",
      trackerTitle: "Живой чек-лист (расширенный режим)",
      trackerBody: "Включите в расширенных настройках, чтобы пункты повестки и задачи отмечались по ходу звонка, а не только когда вы запросите итог. Нажмите на пункт, чтобы увидеть, что именно сказали, кто и когда. Когда приходит новая подсказка, список сворачивается сам.",
      chooseModeTitle: "Ваш режим встречи",
      chooseModeHint: "Кнопки оверлея и список по ходу встречи зависят от режима. Выберите тот, который будете использовать.",
      changeMode: "Другой режим встречи",
      actionsTitle: "Кнопки в этом режиме",
      actionsIntro: "Кнопки этого режима, в дополнение к подсказкам, которые приходят сами:",
      interviewTitle: "Одна кнопка: Обработать сейчас",
      interviewBody:
        "В режиме интервью нет быстрых кнопок: прослушивание идёт всё время, а «Обработать сейчас» запрашивает подсказку сразу, не дожидаясь паузы. Главное окно само прячется, остаётся только оверлей.",
      boardTitle: "Список по ходу встречи",
      done: "Понятно, начать",
      close: "Закрыть",
    },
    access: {
      title: "Доступ",
      ownOk: "Свой ключ: бесплатно и без лимитов. Запросы идут с этого Mac прямо к провайдеру.",
      ownNoKey: "Свой ключ: добавьте ключ провайдера ниже, чтобы начать.",
      tryAvalet: "Нет ключа? Попробуйте Avalet: {n} токенов бесплатно, без карты.",
      notActivated: "Avalet без ключей: {n} бесплатных токенов для начала, карта не нужна.",
      startTrial: "Начать бесплатно",
      trialLeft: "Пробный период: осталось {left} из {total} токенов.",
      proLeft: "Pro: осталось {left} из {total} токенов в этом периоде.",
      renewsOn: "Продлится {date}.",
      endsOn: "Закончится {date}, без продления.",
      getPro: "Подключить Pro, {price}",
      buyMore: "Купить ещё токенов",
      renewPro: "Продлить Pro",
      manage: "Управлять или отменить",
      checkAgain: "Проверить снова",
      useOwnKey: "Использовать свой ключ",
      useAvalet: "Использовать Avalet",
      offlineGrace: "Нет связи с Avalet. Приложение работает по последней проверке до {date}.",
      offlineExpired: "Связи с Avalet нет уже 3 дня, встроенный провайдер приостановлен. Подключите свой ключ или проверьте снова, когда появится интернет.",
      exhausted: "Токены Avalet закончились. Расшифровка продолжает записываться.",
      expired: "Период Pro закончился. Расшифровки и встречи остаются на этом Mac.",
      invalid: "Ответ сервера Avalet не прошёл проверку подписи, поэтому не принят.",
      checkoutPending: "Ждём, когда оплата завершится в браузере.",
      activationFailed: "Не удалось связаться с сервером Avalet. Проверьте интернет и попробуйте снова.",
      noKeychain: "В этой системе нет защищённого хранилища ключей, поэтому пробный период здесь не сохранить. Подключите свой ключ.",
      paid: "Я оплатил",
      perMonth: "в месяц",
      paywallTitle: "Токены Avalet закончились",
      paywallTranscript: "Ничего не потеряно: расшифровка продолжает записываться.",
      dismiss: "Закрыть",
      serverNote: "Сервер Avalet считает токены и не хранит расшифровки.",
      comingSoon: "Скоро",
      avaletComingSoon: "Avalet без ключей скоро появится. А пока Avalet работает с вашим ключом.",
    },
    usage: {
      title: "Расход",
      thisMonth: "В этом месяце",
      tokens: "токенов",
      inOut: "вход {in}, выход {out}",
      thisMeeting: "Эта встреча",
      estimatedNote: "По {n} запросам провайдер не прислал счётчик, их расход оценён.",
      byPurpose: "По назначению",
      purposes: { suggestion: "Подсказки", tracker: "Чек-лист", summary: "Итоги", screenshot: "Скриншоты", artifact: "Обновления документа" },
      overlayTitle: "Токенов потрачено на этой встрече",
      none: "В этом месяце запросов к модели ещё не было.",
    },
    models: {
      title: "Модель распознавания речи",
      size: "ГБ",
      absent: "Не скачана",
      partial: "Скачана частично",
      downloading: "Скачивается",
      retrying: "Связь прервалась, пробуем ещё раз",
      ready: "Готова, работает без интернета",
      error: "Не удалось скачать",
      download: "Скачать",
      continue: "Продолжить",
      retry: "Повторить",
      cancel: "Отменить",
      remove: "Удалить",
      removeConfirm: "Удалить эту модель с диска? Её можно будет скачать снова.",
      guide:
        "Модель речи превращает разговор в текст прямо на этом Mac, ничего не отправляется наружу. Она скачивается один раз, около полугигабайта; для первой загрузки нужен интернет, из России часто через VPN. Потом модель работает без интернета.",
      vpnHint: "Медленно или не скачивается: включите VPN на время первой загрузки.",
      vpnLink: "VPN, которым пользуемся мы",
      missingForStart: "Модель распознавания речи ещё не скачана, поэтому расшифровки не будет.",
      missingAction: "Скачать модель",
    },
    modes: {
      free: "Свободный",
      requirements: "Сбор требований",
      grooming: "Груминг и оценка",
      demo: "Демо и приёмка",
      review: "Ревью документа",
      interview: "Интервью",
    },
    modeHelp: {
      free: "Без специализации: короткие подсказки по ходу любого разговора.",
      requirements: "Встреча с заказчиком: превращает пожелания в проверяемые требования, ловит противоречия, подсказывает, что уточнить.",
      grooming: "Оценка и разбиение задачи: границы, зависимости, скрытая работа, декомпозиция на куски с критериями приёмки.",
      demo: "Приёмка показанного: сверяет с требованиями, ищет непроверенные состояния, готовит условия для подписи.",
      review: "Вы показываете документ: фиксирует замечания и предложения по разделам, ловит решения с ответственным и сроком. Загрузите документ до звонка, а после обновите его по подтверждённым решениям.",
      interview: "Отвечаете вы: развёрнутый структурный ответ с примером и вероятным следующим вопросом.",
    },
    notesTitle: "Показать или скрыть окно конспекта (транскрипт, итог, настройки)",
    modeLabel: "Режим встречи",
    tabs: { settings: "Настройки", meeting: "Встреча", meetings: "История" },
    meeting: {
      noCurrent: "Встреча не идёт. Нажмите Старт в настройках: транскрипт появится здесь.",
      titlePlaceholder: "Название встречи",
      live: "идёт",
      ended: "завершена",
      transcriptEmpty: "Слушаю. Первые фразы появятся здесь через несколько секунд.",
      me: "Я",
      other: "Собеседник",
      summarize: "Итог встречи",
      summarizing: "Пишу итог…",
      summaryTitle: "Итог",
      summaryEmpty: "Итога пока нет. Нажмите \"Итог встречи\" после звонка (или в любой момент во время него).",
      copyText: "Скопировать текстом",
      copied: "Скопировано",
      exported: "Сохранено",
      delete: "Удалить",
      back: "К списку",
      listEmpty: "Встреч пока нет. Каждый Старт создаёт встречу, кнопка Завершить встречу закрывает её.",
      segments: "реплик",
      hasSummary: "итог",
      date: "Дата",
      transcriptTitle: "Транскрипт",
      error: "Ошибка",
      exportProtocol: "Скачать протокол",
      exportTranscript: "Скачать транскрипт",
      agendaToggleTitle: "Повестка и экшн-поинты",
      agendaTitle: "Повестка",
      agendaEditLabel: "Повестка, по вопросу на строку",
      agendaPlaceholder: "На какие вопросы нужно получить ответ на этой встрече…",
      agendaSaveList: "Сохранить список",
      agendaEmpty: "Повестки нет. Добавьте вопросы выше: после \"Итога\" у каждого встанет галочка или останется пусто.",
      agendaNotChecked: "Ещё не проверено: нажмите \"Итог встречи\".",
      agendaProgress: "закрыто",
      agendaClosed: "закрыт",
      agendaOpen: "открыт",
      actionsTitle: "Экшн-поинты",
      actionsEmpty: "Пока нет. Появятся после \"Итога встречи\".",
      participants: "Участники",
      discussions: "Обсуждения",
      actionTask: "Наименование",
      actionOwner: "Ответственный",
      actionDue: "Срок",
      jumpTitle: "Показать это место в расшифровке",
    },
    spec: {
      fieldLabel: "Документ для ревью",
      fieldOptional: "(необязательно, .md или .txt)",
      fieldHint: "Спецификация, которую вы обсуждаете. После звонка будет список решений, и по ним можно обновить документ.",
      loadFile: "Загрузить файл",
      pastePlaceholder: "Или вставьте сюда текст документа",
      pastedName: "Вставленный текст",
      sizeLine: "{name}: {chars} символов",
      remove: "Убрать",
      tooLarge: "Документ слишком длинный: {chars} символов, предел 200 000. Загрузите только разделы, о которых будет разговор.",
      locked: "Пока идёт встреча, документ не меняется. Его можно заменить после завершения встречи.",
      saved: "Сохранено",
      costNote: "Расход: в конце документ целиком уйдёт модели два раза, для итогов и для обновления, примерно по {tokens} токенов. Подсказки во время звонка получают только оглавление, примерно по {index} токенов.",
      costSection: "Если в вопросе назвать раздел, например «раздел 3.2», к этому вопросу добавится текст раздела, до {tokens} токенов.",
      costHigh: "Документ большой, поэтому итоги и обновление обойдутся заметно дороже обычного.",
      summaryCost: "Итоги этой встречи читают и документ: примерно на {tokens} токенов больше обычного.",
      decisionsTitle: "Решения",
      decisionsHint: "Отметьте, что войдёт в обновление документа. Всё здесь взято из разговора; при необходимости поправьте.",
      noDocument: "К этой встрече не приложен документ, поэтому обновить его нельзя.",
      attachDocument: "Приложить документ",
      noDecisions: "Решений пока нет. Сделайте итоги: решения собираются из них.",
      noDecisionsAfter: "В итогах решений не нашлось. Если о чём-то договорились, добавьте решение вручную.",
      include: "Включить в обновление",
      statusLabel: "Статус",
      sectionLabel: "Раздел",
      sectionUnknown: "Не определён",
      textLabel: "Решение",
      textPlaceholder: "Что решили",
      byLabel: "Кто",
      beforeLabel: "Было",
      afterLabel: "Стало",
      details: "Подробности",
      deleteRow: "Удалить",
      addRow: "Добавить решение",
      ungrounded: "Подтверждающих слов в расшифровке не нашлось. Проверьте, прежде чем включать.",
      edited: "изменено",
      jumpTitle: "Показать это место в расшифровке",
      updateButton: "Обновить документ",
      updateNeedsDocument: "Чтобы обновить документ, приложите его.",
      updateNeedsChecked: "Отметьте хотя бы одно решение.",
      updateCostInline: "примерно {tokens} токенов",
      confirmTitle: "Обновить документ?",
      confirmText: "Один запрос к модели: весь документ (примерно {doc} токенов), отмеченные решения ({count}, примерно {decisions}) и ответ с правками (примерно {reply}). Всего примерно {total} токенов. В документе ничего не изменится, пока вы не просмотрите правки и не нажмёте «Применить».",
      confirm: "Отправить",
      cancel: "Отмена",
      working: "Готовлю правки…",
      previewTitle: "Правки в документе",
      previewHint: "Проверьте каждую правку. Применятся только отмеченные.",
      oldLabel: "Сейчас",
      newLabel: "Станет",
      emptyFragment: "(ничего)",
      apply: "Применить",
      notAppliedTitle: "Не применено",
      skippedBy: "Модель не нашла, куда это внести: {reason}",
      fixByHand: "Эти пункты внесите вручную в скачанный документ.",
      noPatches: "Модель не предложила правок.",
      noChangeFor: "Модель не предложила для него правки.",
      resultTitle: "Обновлённый документ",
      resultLine: "Применено правок: {count}.",
      revert: "Вернуть исходный",
      downloadDoc: "Скачать документ",
      copyDoc: "Скопировать документ",
      copied: "Скопировано",
      downloadDecisions: "Скачать решения",
      updateError: "Не удалось подготовить правки: {message}",
      badReply: "Модель ответила в неожиданном виде. Попробуйте ещё раз.",
      fileTitle: "Решения",
      fileDocument: "Документ",
      fileQuote: "Цитата",
      fileActions: "Поручения",
      fileNone: "нет",
      status: { accepted: "Принято", proposed: "Предложено", rejected: "Отклонено", open: "Не решено" },
      ops: { replace: "Заменить", insert_after: "Вставить после", delete: "Удалить" },
      problems: { "anchor-missing": "указанного места нет в документе", "anchor-ambiguous": "указанное место встречается в документе несколько раз", overlap: "пересекается с другой правкой", "empty-anchor": "место в документе не указано", "bad-op": "непонятный вид правки", "unknown-decision": "ни одно отмеченное решение об этом не просит" },
    },
  },
};
