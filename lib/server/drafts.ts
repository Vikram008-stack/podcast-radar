import "server-only";
import { Gemini, GeminiBusy, GeminiUnavailable } from "@/lib/server/ai/gemini";
import { OUTREACH_SYSTEM, OUTREACH_VERSION, PITCH_SYSTEM, PITCH_VERSION, draftParts, draftSchema } from "@/lib/server/ai/prompts/drafts";
import { db } from "@/lib/server/db";
import type { GuestSignal, SponsorSignal } from "@/lib/shared/types";

export async function generateDraft(kind: "outreach" | "pitch", target: GuestSignal | SponsorSignal, ownerId: string) {
  const gemini = Gemini.fromEnv();
  if (!gemini) throw new Error("GEMINI_API_KEY is not configured");
  const payload =
    kind === "outreach"
      ? (() => {
          const g = target as GuestSignal;
          return { guest: { name: g.name, role: g.role, company: g.company }, appearances: g.history.slice(0, 5).map((h) => ({ show: h.episode.podcastName, title: h.episode.title, date: h.episode.publishedAt.slice(0, 10) })) };
        })()
      : (() => {
          const s = target as SponsorSignal;
          return { brand: s.name, confirmed_placements: s.confirmed, shows: s.shows, examples: s.placements.slice(0, 4).map((p) => ({ show: p.episode.podcastName, title: p.episode.title })) };
        })();
  let out;
  try {
    out = await gemini.json({
      name: kind === "outreach" ? "outreach-draft" : "pitch-draft",
      version: kind === "outreach" ? OUTREACH_VERSION : PITCH_VERSION,
      system: kind === "outreach" ? OUTREACH_SYSTEM : PITCH_SYSTEM,
      parts: draftParts(payload),
      schema: draftSchema,
    });
  } catch (e) {
    if (e instanceof GeminiUnavailable) throw new Error("Gemini free-tier quota is used up for today — try again tomorrow or edit manually");
    if (e instanceof GeminiBusy) throw new Error("Gemini is busy right now (503) — try again in a minute");
    throw e;
  } finally {
    const rows = gemini.logs.map((l) => ({ ...l, owner_id: ownerId, error: l.error ?? null }));
    if (rows.length) await db().from("ai_runs").insert(rows);
  }
  if (!out) throw new Error("The AI draft failed validation — please retry");
  return { ...out, generated_by: `${gemini.logs.at(-1)?.model ?? "gemini"} · ${kind === "outreach" ? OUTREACH_VERSION : PITCH_VERSION}` };
}
