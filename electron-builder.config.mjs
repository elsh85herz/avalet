/** @type {import('electron-builder').Configuration} */
export default {
  appId: "com.avalet.app",
  productName: "Avalet",
  directories: {
    output: "release",
  },
  // Test code never ships: *.test.js files and the test-only helpers.
  files: ["dist-electron/**/*", "!dist-electron/**/*.test.js", "!dist-electron/testing/**", "dist/**/*", "package.json"],
  // .venv is bundled (must be created with `python3 -m venv --copies .venv`
  // via scripts/setup-python.sh — a symlinked venv breaks once copied here).
  extraResources: [
    { from: "python-sidecar", to: "python-sidecar", filter: ["**/*", "!.venv/.gitignore"] },
    // Native helpers built by scripts/build-native.sh (screenshot text recognition).
    { from: "native/bin", to: "native" },
  ],
  // Single 1024x1024 PNG — electron-builder converts it to .icns/.ico itself,
  // no macOS-only tooling (iconutil etc.) required to build this.
  icon: "assets/icon.png",
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    entitlements: "assets/entitlements.mac.plist",
    entitlementsInherit: "assets/entitlements.mac.plist",
    extendInfo: {
      NSMicrophoneUsageDescription: "Avalet listens to the meeting audio to transcribe it locally.",
      NSScreenCaptureDescription: "Avalet captures your screen to give the assistant visual context.",
    },
  },
  win: {
    target: ["nsis"],
  },
  linux: {
    target: ["AppImage"],
    category: "Utility",
  },
};
