import { defineConfig } from "@playwright/test";

// E2E drives the real Electron app (built with `npm run build`) in test mode:
// fake capture, fake sidecar, mock billing server and mock model. Run under
// Xvfb on Linux: `npm run e2e` (see package.json).
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
});
