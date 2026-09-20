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
    autoSuggest: string;
    autoSuggestOnHint: string;
    autoSuggestOffHint: string;
    sessionLabel: string;
    start: string;
    resume: string;
    stop: string;
    resetHistory: string;
    startHint: string;
  };
  modes: Record<MeetingModeKey, string>;
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
    exportMd: string;
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
  };
};

export type MeetingModeKey = "free" | "requirements" | "grooming" | "demo" | "interview";

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
    opacityTitle: "Overlay window opacity",
    listeningEmpty: "Listening: the first suggestion will appear here.",
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
      autoSuggest: "Auto-suggest during the call",
      autoSuggestOnHint: "Blocks appear automatically as the conversation goes. Turn off to only respond to typed or quick-action questions.",
      autoSuggestOffHint: "Auto-suggest is off: ask questions manually in the overlay or use a quick action.",
      sessionLabel: "Session",
      start: "Start",
      resume: "Resume",
      stop: "Stop",
      resetHistory: "End meeting",
      startHint: "Start asks for mic and screen-share (system audio) permissions and opens the overlay. Stop freezes live output but keeps blocks in the overlay for paging. End meeting closes the record; the next Start opens a new one.",
    },
    modes: {
      free: "Free",
      requirements: "Requirements",
      grooming: "Grooming",
      demo: "Demo / acceptance",
      interview: "Interview",
    },
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
      exportMd: "Export .md",
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
    opacityTitle: "Прозрачность окна оверлея",
    listeningEmpty: "Слушаю: первая подсказка появится здесь.",
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
      autoSuggest: "Авто-подсказки во время встречи",
      autoSuggestOnHint: "Подсказки появляются сами по ходу разговора. Выключите, чтобы отвечать только на ваши вопросы и быстрые кнопки.",
      autoSuggestOffHint: "Авто-подсказки выключены: задавайте вопросы в оверлее или используйте быстрые кнопки.",
      sessionLabel: "Сессия",
      start: "Старт",
      resume: "Продолжить",
      stop: "Стоп",
      resetHistory: "Завершить встречу",
      startHint: "Старт запросит доступ к микрофону и к экрану (для звука собеседника) и откроет оверлей. Стоп замораживает подсказки, но оставляет их в оверлее для пролистывания. Завершить встречу закрывает запись, следующий Старт откроет новую.",
    },
    modes: {
      free: "Свободный",
      requirements: "Сбор требований",
      grooming: "Груминг и оценка",
      demo: "Демо и приёмка",
      interview: "Интервью",
    },
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
      exportMd: "Экспорт .md",
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
    },
  },
};
