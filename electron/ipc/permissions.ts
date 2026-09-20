import { systemPreferences } from "electron";

export type PermissionStatus = "granted" | "denied" | "restricted" | "not-determined" | "unknown";

/**
 * Proactive permission checks so the UI can show status before Start
 * actually triggers the OS prompt.
 *
 * `systemPreferences.getMediaAccessStatus` is macOS-only in Electron; other
 * platforms don't gate mic/screen access the same way, so we report
 * "granted" there and let the actual getUserMedia/getDisplayMedia call be
 * the real gate.
 */
export function checkMicAccess(): PermissionStatus {
  if (process.platform !== "darwin") return "granted";
  return systemPreferences.getMediaAccessStatus("microphone") as PermissionStatus;
}

export function checkScreenAccess(): PermissionStatus {
  if (process.platform !== "darwin") return "granted";
  return systemPreferences.getMediaAccessStatus("screen") as PermissionStatus;
}

export async function requestMicAccess(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  return systemPreferences.askForMediaAccess("microphone");
}
