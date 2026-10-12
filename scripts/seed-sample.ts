// LOCAL ONLY: writes a clearly fictional sample brief (is_sample = true) for UI work without live data.
// Shown only when SAMPLE_DATA_MODE=true and never in production (VERCEL_ENV=production is refused).
// Usage: npm run seed:sample
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusing to seed sample data in production");
  const { db, ownerId } = await import("@/lib/server/db");
  const { buildSnapshot } = await import("@/lib/server/pipeline/report");
  const { reportingPeriod } = await import("@/lib/time");
  type Facts = import("@/lib/metrics").Facts;

  const owner = await ownerId();
  const period = reportingPeriod();
  const at = (d: number) => new Date(period.start.getTime() + d * 86_400_000 + 5 * 3_600_000).toISOString();
  const shows = ["Sample Show A", "Sample Show B", "Sample Show C"];
  const ep = (i: number, s: number, d: number) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    title: `Sample episode ${i} (fictional)`,
    podcastId: `sample-${s}`,
    podcastName: shows[s],
    publishedAt: at(d),
    url: "https://example.com/sample",
    links: [],
    thumbnail: null,
    durationS: 3600,
    stats: { views: null, likes: null, collectedAt: null },
  });
  const evid = { type: "show_notes" as const, excerpt: "Sample evidence excerpt (fictional)", url: "https://example.com/sample" };
  const facts: Facts = {
    episodes: [ep(1, 0, 1), ep(2, 1, 2), ep(3, 2, 3), ep(4, 0, -3)],
    guests: [
      { id: "10000000-0000-4000-8000-000000000001", name: "Sample Guest One", role: "Founder", company: "Example Co", aliases: [], reviewStatus: "ok" },
      { id: "10000000-0000-4000-8000-000000000002", name: "Sample Guest Two", role: null, company: null, aliases: [], reviewStatus: "needs_review" },
    ],
    appearances: [
      { guestId: "10000000-0000-4000-8000-000000000001", episodeId: "00000000-0000-4000-8000-000000000001", evidence: evid, roleAsStated: "Founder, Example Co", confidence: 0.9 },
      { guestId: "10000000-0000-4000-8000-000000000001", episodeId: "00000000-0000-4000-8000-000000000002", evidence: evid, roleAsStated: null, confidence: 0.9 },
      { guestId: "10000000-0000-4000-8000-000000000002", episodeId: "00000000-0000-4000-8000-000000000003", evidence: evid, roleAsStated: null, confidence: 0.6 },
    ],
    topics: [{ id: "20000000-0000-4000-8000-000000000001", slug: "sample-topic", name: "Sample topic", category: "Sample" }],
    episodeTopics: [
      { episodeId: "00000000-0000-4000-8000-000000000001", topicId: "20000000-0000-4000-8000-000000000001" },
      { episodeId: "00000000-0000-4000-8000-000000000002", topicId: "20000000-0000-4000-8000-000000000001" },
    ],
    brands: [{ id: "30000000-0000-4000-8000-000000000001", name: "Sample Brand" }],
    placements: [
      { brandId: "30000000-0000-4000-8000-000000000001", episodeId: "00000000-0000-4000-8000-000000000001", classification: "confirmed", confidence: 1, evidence: [{ ...evid, excerpt: "This sample episode is sponsored by Sample Brand (fictional)" }], detectedAt: at(1) },
    ],
    news: [],
  };
  const snap = buildSnapshot(facts, period, shows.map((name, i) => ({ podcastId: `sample-${i}`, name, artwork: null, status: "ok" as const, lastSuccessAt: at(4), lastError: null, episodesInWindow: 1 })), {
    isSample: true,
    aiCalls: 0,
    audioAnalysed: 0,
    audioSkipped: 0,
    notes: ["SAMPLE DATA — fictional, for local UI development only."],
  });
  const { error } = await db()
    .from("weekly_reports")
    .upsert({ owner_id: owner, period_start: period.start.toISOString(), period_end: period.end.toISOString(), version: 1, status: "ready", snapshot: snap, is_sample: true, generated_at: snap.generatedAt }, { onConflict: "owner_id,period_start,is_sample" });
  if (error) throw new Error(error.message);
  console.log("Sample brief written (is_sample=true). Set SAMPLE_DATA_MODE=true locally to view it.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
