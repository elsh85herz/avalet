import path from "node:path";
import { fileURLToPath } from "node:url";

// Where bundled resources live. main.ts fills this from Electron's `app` at
// startup; tests and the fake sidecar use the dev defaults below.
const here = path.dirname(fileURLToPath(import.meta.url));

type AppPaths = {
  isPackaged: boolean;
  /** process.resourcesPath in a packaged app. */
  resourcesPath: string;
  /** Repo root in dev (compiled files live in <root>/dist-electron). */
  devRoot: string;
};

let paths: AppPaths = {
  isPackaged: false,
  resourcesPath: "",
  devRoot: path.resolve(here, "../.."),
};

export function configurePaths(next: Partial<AppPaths>): void {
  paths = { ...paths, ...next };
}

export function getPaths(): AppPaths {
  return paths;
}

/** python-sidecar folder: <repo>/python-sidecar in dev, Resources/python-sidecar packaged. */
export function sidecarDir(): string {
  return paths.isPackaged ? path.join(paths.resourcesPath, "python-sidecar") : path.join(paths.devRoot, "python-sidecar");
}

/** Native helpers: <repo>/native/bin in dev, Resources/native packaged. */
export function nativeDir(): string {
  return paths.isPackaged ? path.join(paths.resourcesPath, "native") : path.join(paths.devRoot, "native", "bin");
}
