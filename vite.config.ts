import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      persistState: process.env.E2E === "1" ? { path: ".wrangler/e2e" } : true,
    }),
  ],
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
