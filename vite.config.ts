import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Re-enable the overlay so you see errors instead of a blank page
export default defineConfig({
  plugins: [react()],
  server: { hmr: { overlay: true } },
});
