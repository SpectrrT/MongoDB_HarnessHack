import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    port: Number(process.env.VITE_PORT) || 5193,
    strictPort: true,
    proxy: { "/api": process.env.VITE_API_PROXY || "http://127.0.0.1:5194" },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/thinking-orbs/")) return "orbs";
          if (/node_modules\/(react|react-dom|react-router)/.test(id))
            return "react";
        },
      },
    },
  },
});
