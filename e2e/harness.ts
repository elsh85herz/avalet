import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCREENS_DIR = path.join(root, "docs", "screens");

type MockServer = {
  url: string;
  publicKeyPem: string;
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
  installs: Map<string, { installId: string; used: number; budget: number; plan: string }>;
};

export async function startMock(): Promise<MockServer> {
  const mod = await import(path.join(root, "server-mock", "server.mjs"));
  const server = mod.createMockBillingServer({ llmDelayMs: 25 }) as MockServer;
  await server.listen(0);
  return server;
}

export async function mockPost(server: MockServer, route: string, body: unknown = {}): Promise<unknown> {
  const response = await fetch(`${server.url}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export type Launched = {
  app: ElectronApplication;
  main: Page;
  dirs: { userData: string; hfCache: string; exports: string };
  close: () => Promise<void>;
};

/** Builds a sandbox (profile, model cache, export folder) and starts the app in test mode. */
export async function launch(
  mock: MockServer,
  options: { env?: Record<string, string>; dirs?: Launched["dirs"]; readyModel?: boolean } = {},
): Promise<Launched> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "avalet-e2e-"));
  const dirs = options.dirs ?? {
    userData: path.join(base, "user-data"),
    hfCache: path.join(base, "hf"),
    exports: path.join(base, "exports"),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  if (options.readyModel) placeReadyModel(dirs.hfCache);
  const electronPath = require("electron") as unknown as string;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      root,
      "--no-sandbox",
      "--disable-gpu",
      "--password-store=basic",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    env: {
      ...process.env,
      AVALET_E2E: "1",
      AVALET_QUIET_LOG: "1",
      AVALET_USER_DATA_DIR: dirs.userData,
      AVALET_E2E_EXPORT_DIR: dirs.exports,
      HF_HUB_CACHE: dirs.hfCache,
      AVALET_BILLING_URL: mock.url,
      AVALET_BILLING_DEV_PUBKEY: mock.publicKeyPem,
      FAKE_DOWNLOAD_STEP_MS: "120",
      ...options.env,
    },
  });
  const main = await app.firstWindow();
  await main.waitForLoadState("domcontentloaded");
  return {
    app,
    main,
    dirs,
    close: async () => {
      await app.close().catch(() => {});
    },
  };
}

/** A complete fake "small" model in the cache, so Start works without the wizard's download. */
export function placeReadyModel(hfCache: string): void {
  const root = path.join(hfCache, "models--Systran--faster-whisper-small");
  const blobs = path.join(root, "blobs");
  const snap = path.join(root, "snapshots", "rev1");
  fs.mkdirSync(blobs, { recursive: true });
  fs.mkdirSync(snap, { recursive: true });
  for (const [blob, file] of [["w", "model.bin"], ["c", "config.json"], ["t", "tokenizer.json"]]) {
    fs.writeFileSync(path.join(blobs, blob), "{}");
    fs.symlinkSync(`../../blobs/${blob}`, path.join(snap, file));
  }
}

/** The overlay window, once Start has opened it. */
export async function overlayPage(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().includes("overlay.html"));
  if (existing) return existing;
  return app.waitForEvent("window", { predicate: (w) => w.url().includes("overlay.html") });
}

export async function setTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.evaluate((next) => window.avalet!.settings.setTheme(next), theme);
  await page.waitForFunction((next) => document.documentElement.dataset.theme === next, theme);
}

export async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SCREENS_DIR, `${name}.png`) });
}

/** Test shortcut past the wizard: trial on the built-in provider, then the Simple window. */
export async function skipWizardWithTrial(page: Page): Promise<void> {
  await page.getByTestId("wizard").waitFor();
  await page.evaluate(async () => {
    const api = window.avalet!;
    await api.settings.selectProvider("avalet");
    await api.billing.activateTrial();
    await api.settings.setOnboardingDone(true);
  });
  await page.reload();
  await page.getByTestId("simple-home").waitFor();
}

export function openedUrls(run: Launched): string[] {
  const file = path.join(run.dirs.exports, "opened-urls.txt");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
}
