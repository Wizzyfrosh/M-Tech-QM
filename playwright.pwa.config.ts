import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa", workers: 1, timeout: 90000,
  use: { baseURL: "http://127.0.0.1:3200", launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {} },
  webServer: { command: "npm run start -- --hostname 127.0.0.1 --port 3200", port: 3200, reuseExistingServer: false },
});
