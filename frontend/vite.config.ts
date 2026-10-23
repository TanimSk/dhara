import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the dashboard, API and tus endpoint share one origin (like nginx in production).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", xfwd: true },
      "/upload": { target: "http://127.0.0.1:1080", xfwd: true },
    },
  },
});
