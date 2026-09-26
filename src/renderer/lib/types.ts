// Re-exports of the shared IPC contract, so renderer code keeps importing from
// one local module. Do not declare IPC types here: add them to
// electron/shared/ipc-contract.ts.
export type {
  ActionItem,
  ActionState,
  AgendaStatusItem,
  ExportLabels,
  HistoryBlock,
  LiveBlockDeltaEvent,
  LiveBlockErrorEvent,
  LiveBlockEvent,
  Meeting,
  MeetingListItem,
  MeetingMode,
  PermissionStatus,
  ProviderSettingsPublic,
  SessionState,
  SettingsSnapshot,
  SpeechLanguage,
  SpeechModelName,
  SpeechModelRow,
  StartResult,
  TrackerState,
  TranscriptSegment,
  UiLevel,
} from "../../../electron/shared/ipc-contract.js";
export { MEETING_MODES, SPEECH_LANGUAGES, SPEECH_MODELS } from "../../../electron/shared/ipc-contract.js";
