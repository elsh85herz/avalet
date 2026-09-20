import { desktopCapturer } from "electron";

export type ScreenSourceInfo = { id: string; name: string };

/**
 * Lists capturable screens (not windows) for the loopback-audio source
 * picker in Settings. Labels only come through once screen-recording
 * access has been granted at least once — same caveat as mic device labels.
 */
export async function listScreenSources(): Promise<ScreenSourceInfo[]> {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.map((s) => ({ id: s.id, name: s.name }));
}
