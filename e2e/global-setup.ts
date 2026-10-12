import { mkdirSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

/** Signs in as ALLOWED_EMAIL with a one-time magic-link token (local tests only) and saves cookies. */
export default async function globalSetup(cfg: FullConfig) {
  loadEnv({ path: ".env.local" });
  if (process.env.VERCEL_ENV === "production") throw new Error("Never run e2e auth against production");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: process.env.ALLOWED_EMAIL! });
  if (error) throw new Error(error.message);
  const base = cfg.projects[0].use.baseURL!;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
  const page = await browser.newPage();
  await page.goto(`${base}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await page.waitForURL(`${base}/`);
  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/state.json" });
  await browser.close();
}
