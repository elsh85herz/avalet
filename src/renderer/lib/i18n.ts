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
  sessionStopTitle: string;
  sessionResumeTitle: string;
  opacityLabel: string;
  opacityTitle: string;
  listeningEmpty: string;
  copyBlockTitle: string;
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
    agendaLoadFile: string;
    agendaSave: string;
    agendaSaved: string;
    autoSuggest: string;
    autoSuggestOnHint: string;
    autoSuggestOffHint: string;
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
    pinTitle: string;
    unpinTitle: string;
    modeHelpTitle: string;
    screenshotText: string;
    screenshotTextOn: string;
    screenshotTextOff: string;
    screenshotTextUnavailable: string;
    speechTitle: string;
    speechLanguage: string;
    speechLanguages: Record<"ru" | "en" | "auto", string>;
    speechModel: string;
    speechModels: Record<"small" | "medium" | "turbo", string>;
    speechHint: string;
    liveTracker: string;
    liveTrackerOn: string;
    liveTrackerOff: string;
    perm: Record<PermState, string>;
    sessionStates: Record<SessionKey, string>;
  };
  usage: {
    title: string;
    thisMonth: string;
    tokens: string;
    inOut: string;
    thisMeeting: string;
    estimatedNote: string;
    byPurpose: string;
    purposes: Record<"suggestion" | "tracker" | "summary" | "screenshot", string>;
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
    use: string;
    inUse: string;
    recommended: string;
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
    agendaLoadFile: string;
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
  };
};

export type PermState = "granted" | "denied" | "restricted" | "not-determined" | "unknown";
export type SessionKey = "idle" | "listening" | "paused";
export type MeetingModeKey = "free" | "requirements" | "grooming" | "demo" | "review" | "interview";

export const UI_STRINGS: Record<UiLanguage, UiStrings> = {
  en: {
    autoOnTitle: "Auto-suggest is on: click to only respond to typed/quick-action questions",
    autoOffTitle: "Auto-suggest is off: click to resume automatic suggestions",
    uiLangTitle: "Interface language (this overlay's own labels/tooltips, not the AI's answers): click to switch",
    screenshotTitle:
      "Take a fresh screenshot right now and prioritize it in the next answer, alongside the audio transcript",
    sessionStopTitle: "Stop",
    sessionResumeTitle: "Resume",
    opacityLabel: "Opacity",
    opacityTitle: "Opacity of all Avalet windows",
    listeningEmpty: "Listening: the first suggestion will appear here.",
    copyBlockTitle: "Copy this suggestion",
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
    },
    quickActions: {
      summarize: "Summarize",
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
      agendaLoadFile: "Load from file",
      agendaSave: "Save agenda",
      agendaSaved: "Saved",
      autoSuggest: "Auto-suggest during the call",
      autoSuggestOnHint: "Blocks appear automatically as the conversation goes. Turn off to only respond to typed or quick-action questions.",
      autoSuggestOffHint: "Auto-suggest is off: ask questions manually in the overlay or use a quick action.",
      sessionLabel: "Session",
      start: "Start",
      resume: "Resume",
      stop: "Stop",
      resetHistory: "End meeting",
      startHint: "Start asks for mic and screen-share (system audio) permissions and opens the overlay. Stop freezes live output but keeps blocks in the overlay for paging. End meeting closes the record; the next Start opens a new one.",
      clearBlocks: "Clear overlay",
      clearBlocksTitle: "Remove the suggestions from the overlay. The meeting and its transcript are kept.",
      quit: "Quit Avalet",
      quitHint: "Stops listening, saves the current meeting, and closes the app.",
      pinTitle: "This window floats above others. Click to make it an ordinary window.",
      unpinTitle: "Keep this window above other windows during the call.",
      modeHelpTitle: "What each mode does",
      screenshotText: "Exact text on screenshots (slower)",
      screenshotTextOn: "Screenshots also carry the text recognized on your Mac, for exact names, numbers and code. Adds up to about a second to each answer.",
      screenshotTextOff: "Fastest: screenshots go to models that see images as a picture only. Models that cannot see images always get the recognized text.",
      screenshotTextUnavailable: "Text recognition is not available in this build (it needs the Xcode Command Line Tools when building from source). Models that see images still work.",
      speechTitle: "Speech recognition",
      speechLanguage: "Spoken language",
      speechLanguages: { ru: "Russian", en: "English", auto: "Detect automatically" },
      speechModel: "Accuracy",
      speechModels: {
        small: "Fast (small)",
        medium: "More accurate (medium)",
        turbo: "Most accurate (turbo)",
      },
      speechHint:
        "Runs on your Mac. A larger model understands speech better but is slower. Download the ones you want once; after that they work without internet. A fixed language is more reliable than detecting it on every phrase.",
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
    usage: {
      title: "Usage",
      thisMonth: "This month",
      tokens: "tokens",
      inOut: "in {in}, out {out}",
      thisMeeting: "This meeting",
      estimatedNote: "{n} calls had no count from the provider and are estimated.",
      byPurpose: "By purpose",
      purposes: { suggestion: "Suggestions", tracker: "Checklist", summary: "Summaries", screenshot: "Screenshots" },
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
      use: "Use",
      inUse: "In use",
      recommended: "recommended",
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
      review: "You present a document: notes remarks by section, catches decisions on open questions with owner and deadline, prepares short answers from your briefing.",
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
      agendaLoadFile: "Load from file",
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
    },
  },
  ru: {
    autoOnTitle: "Авто-подсказки включены: клик, чтобы реагировать только на вопросы и быстрые кнопки",
    autoOffTitle: "Авто-подсказки выключены: клик, чтобы снова включить",
    uiLangTitle: "Язык интерфейса (подписи и подсказки самого оверлея, не ответов ИИ): клик переключает",
    screenshotTitle:
      "Сделать свежий скриншот прямо сейчас и учесть его в следующем ответе вместе с аудио-транскриптом",
    sessionStopTitle: "Стоп",
    sessionResumeTitle: "Продолжить",
    opacityLabel: "Прозрачность",
    opacityTitle: "Прозрачность всех окон Avalet",
    listeningEmpty: "Слушаю: первая подсказка появится здесь.",
    copyBlockTitle: "Скопировать подсказку",
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
    },
    quickActions: {
      summarize: "Итог",
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
      agendaLoadFile: "Загрузить из файла",
      agendaSave: "Сохранить повестку",
      agendaSaved: "Сохранено",
      autoSuggest: "Авто-подсказки во время встречи",
      autoSuggestOnHint: "Подсказки появляются сами по ходу разговора. Выключите, чтобы отвечать только на ваши вопросы и быстрые кнопки.",
      autoSuggestOffHint: "Авто-подсказки выключены: задавайте вопросы в оверлее или используйте быстрые кнопки.",
      sessionLabel: "Сессия",
      start: "Старт",
      resume: "Продолжить",
      stop: "Стоп",
      resetHistory: "Завершить встречу",
      startHint: "Старт запросит доступ к микрофону и к экрану (для звука собеседника) и откроет оверлей. Стоп замораживает подсказки, но оставляет их в оверлее для пролистывания. Завершить встречу закрывает запись, следующий Старт откроет новую.",
      clearBlocks: "Очистить оверлей",
      clearBlocksTitle: "Убрать накопленные подсказки из оверлея. Встреча и транскрипт остаются.",
      quit: "Выйти из Avalet",
      quitHint: "Останавливает прослушивание, сохраняет текущую встречу и закрывает приложение.",
      pinTitle: "Окно закреплено поверх других. Нажмите, чтобы сделать его обычным.",
      unpinTitle: "Держать окно поверх других во время звонка.",
      modeHelpTitle: "Что делает каждый режим",
      screenshotText: "Точный текст на скриншотах (медленнее)",
      screenshotTextOn: "К скриншоту добавляется текст, распознанный на вашем Mac, для точных имён, чисел и кода. Добавляет до секунды к каждому ответу.",
      screenshotTextOff: "Быстрее всего: моделям с картинками скриншот уходит только изображением. Моделям без картинок распознанный текст отправляется всегда.",
      screenshotTextUnavailable: "Распознавание текста в этой сборке недоступно (при сборке из исходников нужны Xcode Command Line Tools). Модели с картинками работают как раньше.",
      speechTitle: "Распознавание речи",
      speechLanguage: "Язык речи",
      speechLanguages: { ru: "Русский", en: "English", auto: "Определять автоматически" },
      speechModel: "Точность",
      speechModels: {
        small: "Быстро (small)",
        medium: "Точнее (medium)",
        turbo: "Максимум (turbo)",
      },
      speechHint:
        "Работает на вашем Mac. Большая модель лучше понимает речь, но медленнее. Скачайте нужные один раз, дальше они работают без интернета. Фиксированный язык надёжнее, чем угадывание на каждой фразе.",
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
    usage: {
      title: "Расход",
      thisMonth: "В этом месяце",
      tokens: "токенов",
      inOut: "вход {in}, выход {out}",
      thisMeeting: "Эта встреча",
      estimatedNote: "По {n} запросам провайдер не прислал счётчик, их расход оценён.",
      byPurpose: "По назначению",
      purposes: { suggestion: "Подсказки", tracker: "Чек-лист", summary: "Итоги", screenshot: "Скриншоты" },
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
      use: "Выбрать",
      inUse: "Используется",
      recommended: "рекомендуем",
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
      review: "Вы показываете документ: фиксирует замечания по разделам, ловит решения по открытым вопросам с ответственным и сроком, готовит короткие ответы из вашего брифа.",
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
      agendaLoadFile: "Загрузить из файла",
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
    },
  },
};
