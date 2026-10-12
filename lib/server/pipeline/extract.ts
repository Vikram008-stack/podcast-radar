import "server-only";
import { isHost } from "@/lib/names";
import { guestInScope } from "@/lib/scope";
import { AFFILIATE_RULES, DISCLOSURE_RULES, classifyPlacement } from "@/lib/sponsors";
import type { EvidenceType } from "@/lib/shared/types";
import { GeminiBusy, GeminiUnavailable } from "@/lib/server/ai/gemini";
import { EPISODE_INTEL_SYSTEM, EPISODE_INTEL_VERSION, episodeIntelParts, episodeIntelSchema, type EpisodeIntel } from "@/lib/server/ai/prompts/episode-intel";
import { db, must } from "@/lib/server/db";
import type { PodcastRow } from "@/lib/server/sources";
import { excerptInText, focusWindow, promoAwareExcerpt } from "@/lib/text";
import type { Ctx } from "./context";
import type { Entities } from "./entities";

type Src = { provider: "rss" | "youtube" | "spotify"; url: string | null; description: string | null };
type Ep = {
  id: string;
  podcast_id: string;
  title: string;
  description: string;
  published_at: string;
  episode_url: string | null;
  content_hash: string;
  extracted_hash: string | null;
  extraction_status: string;
  episode_sources: Src[];
};

const TYPE: Record<Src["provider"], Exclude<EvidenceType, "title" | "audio">> = { rss: "show_notes", youtube: "youtube_description", spotify: "spotify_description" };
const BATCH = 6;
const DESC_CAP = 3000;

/** Find which source text contains the excerpt → evidence type + url. */
function locate(excerpt: string, ep: Ep): { type: EvidenceType; url: string | null } | null {
  if (excerptInText(excerpt, ep.title)) return { type: "title", url: ep.episode_url ?? ep.episode_sources[0]?.url ?? null };
  for (const s of ep.episode_sources) {
    if (s.description && excerptInText(excerpt, s.description)) return { type: TYPE[s.provider], url: s.url ?? ep.episode_url };
  }
  return null;
}

async function clearTextDerived(ep: Ep) {
  const sb = db();
  await sb.from("episode_topics").delete().eq("episode_id", ep.id);
  await sb.from("guest_appearances").delete().eq("episode_id", ep.id).neq("evidence_type", "audio");
  const pls = (await sb.from("sponsorship_placements").select("id").eq("episode_id", ep.id)).data ?? [];
  if (pls.length) {
    await sb.from("placement_evidence").delete().in("placement_id", pls.map((p) => p.id)).neq("evidence_type", "audio");
    const left = (await sb.from("placement_evidence").select("placement_id").in("placement_id", pls.map((p) => p.id))).data ?? [];
    const keep = new Set(left.map((l) => l.placement_id));
    const drop = pls.filter((p) => !keep.has(p.id)).map((p) => p.id);
    if (drop.length) await sb.from("sponsorship_placements").delete().in("id", drop);
  }
}

export async function runExtraction(ctx: Ctx, ents: Entities, podcasts: Map<string, PodcastRow>) {
  const sb = db();
  const all = must(
    await sb
      .from("episodes")
      .select("id,podcast_id,title,description,published_at,episode_url,content_hash,extracted_hash,extraction_status,episode_sources(provider,url,description)")
      .eq("owner_id", ctx.owner)
      .eq("is_sample", false)
      .gte("published_at", ctx.since.toISOString())
      .order("published_at", { ascending: false })
      .limit(2000),
    "load episodes for extraction",
  ) as Ep[];
  const todo = all.filter((e) => podcasts.has(e.podcast_id) && (e.extraction_status === "pending" || e.extracted_hash !== e.content_hash));
  ctx.info(`extraction: ${todo.length} new/changed episodes (of ${all.length} in window)`);
  if (!todo.length) return;
  if (!ctx.gemini) {
    ctx.notes.push("Gemini key missing — new episodes were collected but not analysed.");
    return;
  }

  for (let i = 0; i < todo.length; i += BATCH) {
    if (ctx.deadline && Date.now() > ctx.deadline) {
      ctx.deferred = todo.length - i; // the next chunk picks these up (still pending)
      ctx.info(`extraction paused at the time budget: ${ctx.deferred} episodes left for the next chunk`);
      return;
    }
    const batch = todo.slice(i, i + BATCH);
    const input = batch.map((e) => {
      const p = podcasts.get(e.podcast_id)!;
      return {
        episode_id: e.id,
        show: p.name,
        host_names: p.host_names,
        house_brands: p.house_brands,
        date: e.published_at.slice(0, 10),
        title: e.title,
        description: promoAwareExcerpt(e.description, DESC_CAP),
      };
    });
    let out: EpisodeIntel | null = null;
    try {
      out = await ctx.gemini.json({
        name: "episode-intel",
        version: EPISODE_INTEL_VERSION,
        system: EPISODE_INTEL_SYSTEM,
        parts: episodeIntelParts(ents.taxonomy(), input),
        schema: episodeIntelSchema,
      });
    } catch (e) {
      if (e instanceof GeminiUnavailable || e instanceof GeminiBusy) {
        const left = todo.length - i;
        ctx.counters.analysisIncomplete += left;
        ctx.warn(`extraction stopped: ${e.message}`);
        ctx.notes.push(`${left} episodes await analysis (${e instanceof GeminiBusy ? "Gemini temporarily busy" : "Gemini free-tier quota reached"}); they will be picked up on the next run.`);
        return;
      }
      ctx.counters.analysisIncomplete += batch.length;
      ctx.error(`extraction batch failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!out) {
      await sb.from("episodes").update({ extraction_status: "needs_review" }).in("id", batch.map((b) => b.id));
      ctx.counters.needsReview += batch.length;
      continue;
    }
    for (const ep of batch) {
      const res = out.episodes.find((x) => x.episode_id === ep.id);
      if (!res) continue;
      const p = podcasts.get(ep.podcast_id)!;
      try {
        if (ep.extracted_hash) await clearTextDerived(ep);
        await applyIntel(ctx, ents, ep, p, res);
        await sb.from("episodes").update({ extraction_status: "done", extracted_hash: ep.content_hash }).eq("id", ep.id);
        ctx.counters.extracted++;
      } catch (e) {
        ctx.error(`apply intel failed for ${ep.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

async function applyIntel(ctx: Ctx, ents: Entities, ep: Ep, p: PodcastRow, res: EpisodeIntel["episodes"][number]) {
  const fullText = `${ep.title}\n${ep.description}`;
  await db().from("episodes").update({ in_scope: res.in_scope }).eq("id", ep.id);
  // Guests — must be evidenced in the source text; hosts excluded.
  for (const g of res.guests) {
    if (isHost(g.name, p.host_names)) continue;
    if (!guestInScope(g)) continue; // guardrail: Indian startup founders / investors only
    let where = locate(g.evidence_excerpt, ep);
    let excerpt = g.evidence_excerpt;
    if (!where) {
      if (!excerptInText(g.name, fullText)) continue; // not evidenced → dropped
      where = { type: excerptInText(g.name, ep.title) ? "title" : TYPE[ep.episode_sources[0]?.provider ?? "rss"], url: ep.episode_url };
      excerpt = where.type === "title" ? ep.title : g.name;
    }
    // only links that literally appear in the stored source text
    const links = (g.profile_urls ?? []).filter((u) => u.startsWith("http") && fullText.includes(u)).slice(0, 4);
    const { id, needsReview } = await ents.guestId(g.name, g.role, g.company, g.guest_type, links);
    await ents.addAppearance({ guestId: id, episodeId: ep.id, excerpt, url: where.url, type: where.type, role: [g.role, g.company].filter(Boolean).join(", ") || null, confidence: g.confidence, needsReview });
  }
  // Topics — only from in-scope episodes (guardrail)
  for (const t of res.in_scope ? res.topics : []) {
    const id = t.slug ? (ents.topicBySlugOrName(t.slug)?.id ?? null) : t.new_topic ? await ents.ensureTopic(t.new_topic) : null;
    if (id) await ents.linkTopic(ep.id, id, t.confidence);
  }
  // Brands — excerpt must exist verbatim in a stored description; rules decide the class.
  for (const b of res.brands) {
    const where = locate(b.excerpt, ep);
    if (!where || where.type === "title" || where.type === "audio") continue;
    const rule = [...DISCLOSURE_RULES, ...AFFILIATE_RULES].find((r) => r.re.test(b.excerpt));
    const stored = focusWindow(b.excerpt, rule?.re ?? null, 25);
    const { classification, rule: matched } = classifyPlacement({ brand: b.brand, excerpt: stored, houseBrands: p.house_brands, aiSuggested: b.suggested });
    if (classification === "organic") continue;
    const brandId = await ents.brandId(b.brand);
    if (!brandId) continue;
    await ents.addPlacement({ brandId, episodeId: ep.id, classification, confidence: b.confidence, evidence: { type: where.type, excerpt: stored, url: where.url, rule: matched } });
  }
  ctx.info(`analysed: ${p.name} — ${ep.title.slice(0, 60)}`, { guests: res.guests.length, topics: res.topics.length, brands: res.brands.length });
}
