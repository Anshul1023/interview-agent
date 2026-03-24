import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname, "src"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist"),
    rollupOptions: {
      input: {
        main:    resolve(__dirname, "src/index.html"),
        overlay: resolve(__dirname, "src/overlay.html"),
      },
    },
  },
  server: { port: 5173 },
});
