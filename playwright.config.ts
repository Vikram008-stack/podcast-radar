import { defineConfig } from "@playwright/test";

/**
 * UI smoke tests run against a local dev server in SAMPLE_DATA_MODE (deterministic, clearly
 * fictional data) on port 3201. Auth uses a one-time Supabase magic-link token generated in
 * e2e/global-setup.ts with the service-role key (local only).
 * Uses the installed Edge/Chrome channel (PW_CHANNEL) — no browser download required.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3201",
    channel: process.env.PW_CHANNEL ?? "msedge",
    storageState: "e2e/.auth/state.json",
    viewport: { width: 1360, height: 900 },
  },
  webServer: {
    command: "npx next dev -p 3201",
    url: "http://localhost:3201/login",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { SAMPLE_DATA_MODE: "true", NEXT_PUBLIC_APP_URL: "http://localhost:3201" },
  },
});
