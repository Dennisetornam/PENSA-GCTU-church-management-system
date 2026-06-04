import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the admin SPA into dist/client, which the Worker serves as static assets.
export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    proxy: {
      // local dev: proxy API calls to `wrangler dev`
      "/api": "http://localhost:8787",
      "/auth": "http://localhost:8787",
      "/register": "http://localhost:8787",
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
