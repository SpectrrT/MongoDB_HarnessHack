import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    host: "127.0.0.1",
    allowedHosts: ["offload.ai"],
    port: Number(process.env.OFFLOAD_WEB_PORT || 5193),
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT || 5194}`, changeOrigin: false } },
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
