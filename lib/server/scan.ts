import "server-only";
import { env } from "@/lib/env";
import { fetchRetry } from "@/lib/server/http";
import { runWeekly, type RunResult, type Trigger } from "@/lib/server/pipeline/weekly";

/** Time budget for one serverless invocation (Vercel Hobby functions allow up to 300 s). */
export const CHUNK_BUDGET_MS = 200_000;

/**
 * Preferred path for "Run scan now": dispatch the GitHub Actions workflow (full run incl. audio).
 * Requires GITHUB_DISPATCH_TOKEN (fine-grained, Actions: write on this repo) + GITHUB_REPO.
 */
export async function dispatchGithub(): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return false;
  const res = await fetchRetry(`https://api.github.com/repos/${repo}/actions/workflows/weekly-brief.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "podcast-radar" },
    body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME || "main", inputs: { trigger: "manual" } }),
    retries: 1,
    label: "github-dispatch",
  });
  return res.status === 204;
}

/** One chunk of the in-process (Vercel) run, time-boxed; audio openings included. */
export async function runChunk(trigger: Trigger): Promise<RunResult> {
  // ffmpeg ships with the app, so serverless runs analyse audio too (time-boxed per chunk).
  return runWeekly({ trigger, audio: "analyse", budgetMs: CHUNK_BUDGET_MS });
}

/** Fire-and-forget the next chunk (the route runs this inside `after()`). */
export async function continueChunk(origin: string, trigger: Trigger) {
  const secret = env().CRON_SECRET;
  if (!secret) return;
  try {
    await fetch(`${origin}/api/cron/daily?continue=1&trigger=${trigger}`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5_000) });
  } catch {
    // The next invocation runs independently; a client-side timeout here is expected.
  }
}
