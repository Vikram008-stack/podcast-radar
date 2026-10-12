import "server-only";
import { classifyPlacement, isHouseBrand, matchAffiliate, matchDisclosure, strongest } from "@/lib/sponsors";
import type { SponsorClass } from "@/lib/shared/types";
import { db } from "@/lib/server/db";
import type { PodcastRow } from "@/lib/server/sources";
import type { Ctx } from "./context";

type Row = {
  id: string;
  classification: SponsorClass;
  brands: { name: string } | null;
  episodes: { podcast_id: string; published_at: string } | null;
  placement_evidence: { evidence_type: string; excerpt: string }[];
};

/**
 * Re-applies the deterministic rules to stored evidence (no AI): picks up rule improvements and
 * house-brand edits made in Settings. A stored placement was already judged promotional, so the
 * AI suggestion is treated as "probable"; only stored evidence text can make it confirmed.
 */
export async function reclassifyPlacements(ctx: Ctx, podcasts: Map<string, PodcastRow>) {
  const sb = db();
  const { data } = await sb
    .from("sponsorship_placements")
    .select("id,classification,brands(name),episodes!inner(podcast_id,published_at),placement_evidence(evidence_type,excerpt)")
    .eq("owner_id", ctx.owner)
    .gte("episodes.published_at", ctx.since.toISOString())
    .limit(3000);
  let changed = 0;
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = r.episodes ? podcasts.get(r.episodes.podcast_id) : undefined;
    if (!p || !r.brands) continue;
    let cls: SponsorClass | null = null;
    for (const e of r.placement_evidence) {
      const c =
        e.evidence_type === "audio"
          ? isHouseBrand(r.brands.name, p.house_brands)
            ? "related_party"
            : matchDisclosure(e.excerpt)
              ? "confirmed"
              : matchAffiliate(e.excerpt)
                ? "affiliate"
                : "probable"
          : classifyPlacement({ brand: r.brands.name, excerpt: e.excerpt, houseBrands: p.house_brands, aiSuggested: "probable" }).classification;
      cls = cls ? strongest(cls, c) : c;
    }
    if (cls && cls !== r.classification && cls !== "organic") {
      await sb.from("sponsorship_placements").update({ classification: cls }).eq("id", r.id);
      changed++;
    }
  }
  if (changed) ctx.info(`reclassified ${changed} placements from stored evidence`);
}
