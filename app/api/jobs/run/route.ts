import { after, NextResponse, type NextRequest } from "next/server";
import { apiError, requireApiUser, unauthorized } from "@/lib/server/api";
import { continueChunk, dispatchGithub, runChunk } from "@/lib/server/scan";

export const maxDuration = 300;

const COOLDOWN_MS = 15 * 60_000;

/** "Run scan now" — same weekly job; rate-limited to once per 15 minutes (persisted in app_settings). */
export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const sb = user.sb;
  const { data: s } = await sb.from("app_settings").select("last_manual_run_at").eq("owner_id", user.id).maybeSingle();
  const last = s?.last_manual_run_at ? Date.parse(s.last_manual_run_at) : 0;
  if (Date.now() - last < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60_000);
    return apiError(429, "rate_limited", `Scan already started recently — try again in ${mins} min`);
  }
  await sb.from("app_settings").upsert({ owner_id: user.id, last_manual_run_at: new Date().toISOString() }, { onConflict: "owner_id" });

  if (await dispatchGithub().catch(() => false)) {
    return NextResponse.json({ mode: "github", message: "Scan started on GitHub Actions (with audio analysis). It usually takes 5–15 minutes." });
  }
  const origin = req.nextUrl.origin;
  after(async () => {
    const res = await runChunk("manual");
    if (res.status === "continue") await continueChunk(origin, "manual");
  });
  return NextResponse.json({ mode: "vercel", message: "Scan started (text analysis now; audio openings are queued for the next GitHub Actions run)." });
}
