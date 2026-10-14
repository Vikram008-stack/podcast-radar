// One-off repair: merge episode rows that are the same episode on different platforms
// (e.g. a retitled YouTube upload and the Spotify/RSS episode sharing the code "FO572").
// Moves sources, guest appearances, topics and sponsor placements onto one row, then deletes the copy.
// Usage: npx tsx --conditions=react-server scripts/merge-duplicates.ts [--apply]
import { config } from "dotenv";
config({ path: ".env.local" });

type Src = { provider: "rss" | "youtube" | "spotify"; external_id: string; description: string | null };
type Ep = { id: string; podcast_id: string; title: string; published_at: string; thumbnail_url: string | null; audio_url: string | null; duration_s: number | null; episode_url: string | null; stats: unknown; episode_sources: Src[] };

const RANK: Record<Src["provider"], number> = { rss: 0, spotify: 1, youtube: 2 };
const best = (e: Ep) => Math.min(...e.episode_sources.map((s) => RANK[s.provider]), 9);

async function main() {
  const apply = process.argv.includes("--apply");
  const { db, must, check } = await import("@/lib/server/db");
  const { sameEpisode } = await import("@/lib/dedupe");
  const { mergeDescriptions } = await import("@/lib/server/pipeline/ingest");
  const { createHash } = await import("node:crypto");
  const sb = db();

  const eps = must(
    await sb.from("episodes").select("id,podcast_id,title,published_at,thumbnail_url,audio_url,duration_s,episode_url,stats,episode_sources(provider,external_id,description)").order("published_at").limit(5000),
    "load episodes",
  ) as Ep[];

  const byShow = new Map<string, Ep[]>();
  for (const e of eps) byShow.set(e.podcast_id, [...(byShow.get(e.podcast_id) ?? []), e]);

  const merges: { keep: Ep; drop: Ep }[] = [];
  for (const list of byShow.values()) {
    const gone = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (gone.has(a.id)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (gone.has(b.id)) continue;
        const provA = new Set(a.episode_sources.map((s) => s.provider));
        if (b.episode_sources.some((s) => provA.has(s.provider))) continue;
        if (!sameEpisode({ title: a.title, publishedAt: a.published_at }, { title: b.title, publishedAt: b.published_at })) continue;
        const [keep, drop] = best(a) <= best(b) ? [a, b] : [b, a];
        merges.push({ keep, drop });
        keep.episode_sources.push(...drop.episode_sources);
        gone.add(drop.id);
        if (drop === a) break;
      }
    }
  }

  for (const { keep, drop } of merges) console.log(`${apply ? "MERGE" : "would merge"}: "${drop.title}"  →  "${keep.title}"`);
  console.log(`${merges.length} duplicate row(s) found.`);
  if (!apply) return;

  for (const { keep, drop } of merges) {
    check(await sb.from("episode_sources").update({ episode_id: keep.id }).eq("episode_id", drop.id), "move sources");

    const ga = must(await sb.from("guest_appearances").select("id,guest_id").eq("episode_id", keep.id), "ga keep") as { guest_id: string }[];
    const keepGuests = new Set(ga.map((g) => g.guest_id));
    const gaDrop = must(await sb.from("guest_appearances").select("id,guest_id").eq("episode_id", drop.id), "ga drop") as { id: string; guest_id: string }[];
    for (const g of gaDrop) {
      if (keepGuests.has(g.guest_id)) check(await sb.from("guest_appearances").delete().eq("id", g.id), "drop dup appearance");
      else check(await sb.from("guest_appearances").update({ episode_id: keep.id }).eq("id", g.id), "move appearance");
    }

    const etKeep = new Set((must(await sb.from("episode_topics").select("topic_id").eq("episode_id", keep.id), "et keep") as { topic_id: string }[]).map((t) => t.topic_id));
    const etDrop = must(await sb.from("episode_topics").select("topic_id").eq("episode_id", drop.id), "et drop") as { topic_id: string }[];
    for (const t of etDrop) {
      if (etKeep.has(t.topic_id)) check(await sb.from("episode_topics").delete().eq("episode_id", drop.id).eq("topic_id", t.topic_id), "drop dup topic");
      else check(await sb.from("episode_topics").update({ episode_id: keep.id }).eq("episode_id", drop.id).eq("topic_id", t.topic_id), "move topic");
    }

    const spKeep = new Map((must(await sb.from("sponsorship_placements").select("id,brand_id").eq("episode_id", keep.id), "sp keep") as { id: string; brand_id: string }[]).map((p) => [p.brand_id, p.id]));
    const spDrop = must(await sb.from("sponsorship_placements").select("id,brand_id").eq("episode_id", drop.id), "sp drop") as { id: string; brand_id: string }[];
    for (const p of spDrop) {
      const target = spKeep.get(p.brand_id);
      if (target) {
        check(await sb.from("placement_evidence").update({ placement_id: target }).eq("placement_id", p.id), "move evidence");
        check(await sb.from("sponsorship_placements").delete().eq("id", p.id), "drop dup placement");
      } else check(await sb.from("sponsorship_placements").update({ episode_id: keep.id }).eq("id", p.id), "move placement");
    }

    // Combined description; both rows were already analysed, so mark the merged text as extracted (no new Gemini call).
    const description = mergeDescriptions([...keep.episode_sources].sort((a, b) => ({ rss: 0, youtube: 1, spotify: 2 })[a.provider] - ({ rss: 0, youtube: 1, spotify: 2 })[b.provider]).map((s) => ({ provider: s.provider, description: s.description })));
    const hash = createHash("sha256").update(keep.title + "\n" + description).digest("hex");
    check(
      await sb
        .from("episodes")
        .update({
          description,
          content_hash: hash,
          extracted_hash: hash,
          thumbnail_url: keep.thumbnail_url ?? drop.thumbnail_url,
          audio_url: keep.audio_url ?? drop.audio_url,
          duration_s: keep.duration_s ?? drop.duration_s,
          episode_url: keep.episode_url ?? drop.episode_url,
          stats: keep.stats ?? drop.stats,
          updated_at: new Date().toISOString(),
        })
        .eq("id", keep.id),
      "update kept episode",
    );
    check(await sb.from("episodes").delete().eq("id", drop.id), "delete duplicate");
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
