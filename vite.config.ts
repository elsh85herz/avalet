import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Two renderer entry points: the settings/control window and the
// always-on-top overlay window. Both are plain static HTML files loaded
// by separate BrowserWindows (see electron/main.ts).
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/renderer/main.html"),
        overlay: resolve(__dirname, "src/renderer/overlay.html"),
      },
    },
  },
  server: {
    strictPort: true,
  },
});
