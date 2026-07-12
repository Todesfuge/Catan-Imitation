import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "local-preview",
      testIgnore: /online-multiplayer\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4173" }
    },
    {
      name: "online-worker",
      testMatch: /online-multiplayer\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:8799" }
    }
  ],
  webServer: [
    {
      command: "pnpm preview --port 4173",
      reuseExistingServer: false,
      timeout: 120_000,
      url: "http://127.0.0.1:4173"
    },
    {
      command: "pnpm dev:worker --config wrangler.e2e.jsonc --port 8799 --persist-to .wrangler/state/playwright",
      reuseExistingServer: false,
      timeout: 120_000,
      url: "http://127.0.0.1:8799/api/health"
    }
  ]
});
