import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5777,
  },
  plugins: [react(), tailwindcss()],
  base: "/v1/realtime",
});
