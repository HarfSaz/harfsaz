import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and ignores the src-tauri dir for HMR.
export default defineConfig({
  // "/" for the desktop app; "/app/" when built into the website (pnpm editor:build in web/).
  base: process.env.HARFSAZ_WEB_BASE || "/",
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 3025,
    strictPort: true,
    host: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
});
