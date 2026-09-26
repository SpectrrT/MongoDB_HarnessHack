import { defineConfig } from "@playwright/test";
const baseURL = process.env.PW_BASE_URL || (process.env.PW_START_SERVER === "1" ? "http://127.0.0.1:5394" : "http://127.0.0.1:5193");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL,
    channel: process.env.PW_CHANNEL || "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1496, height: 850 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  reporter: "list",
  workers: 2,
  webServer: process.env.PW_START_SERVER === "1" ? {
    command: "node server/index.js",
    url: baseURL,
    env: { OFFLOAD_SKIP_ENV: "1", PORT: "5394", LANGSMITH_TRACING: "false" },
    reuseExistingServer: false,
    timeout: 30000,
  } : undefined,
});
