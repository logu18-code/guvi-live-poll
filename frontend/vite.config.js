import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 5500 matches the dev origin your backend's CORS_ORIGINS already allows.
export default defineConfig({
  plugins: [react()],
  server: { port: 5500, strictPort: true },
  preview: { port: 5500, strictPort: true },
});
