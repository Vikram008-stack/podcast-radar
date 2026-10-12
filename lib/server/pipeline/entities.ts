import "server-only";
import { normalizePersonName, resolveGuest, type KnownGuest } from "@/lib/names";
import { normalizeBrand, strongest } from "@/lib/sponsors";
import type { EvidenceType, SponsorClass } from "@/lib/shared/types";
import { db, must } from "@/lib/server/db";
import { slugify, truncateWords } from "@/lib/text";

/** Per-run caches + idempotent upserts for guests, topics and brands. */
export class Entities {
  private guests: KnownGuest[] = [];
  private topics = new Map<string, { id: string; slug: string; name: string }>();
  private brands = new Map<string, string>();

  constructor(private owner: string) {}

  async load() {
    const sb = db();
    const [g, a, t, b] = await Promise.all([
      sb.from("guests").select("id,name,company").eq("owner_id", this.owner).eq("is_sample", false).limit(5000),
      sb.from("guest_aliases").select("guest_id,alias").eq("owner_id", this.owner).limit(10000),
      sb.from("topics").select("id,slug,name").eq("owner_id", this.owner).limit(1000),
      sb.from("brands").select("id,normalized_name").eq("owner_id", this.owner).eq("is_sample", false).limit(5000),
    ]);
    const aliases = new Map<string, string[]>();
    for (const x of must(a, "aliases") ?? []) (aliases.get(x.guest_id) ?? aliases.set(x.guest_id, []).get(x.guest_id)!).push(x.alias);
    this.guests = (must(g, "guests") ?? []).map((x) => ({ id: x.id, name: x.name, company: x.company, aliases: aliases.get(x.id) ?? [] }));
    for (const x of must(t, "topics") ?? []) this.topics.set(x.slug, x);
    for (const x of must(b, "brands") ?? []) this.brands.set(x.normalized_name, x.id);
    return this;
  }

  taxonomy() {
    return [...this.topics.values()].map((t) => ({ slug: t.slug, name: t.name }));
  }

  topicBySlugOrName(s: string) {
    const slug = slugify(s);
    return this.topics.get(slug) ?? [...this.topics.values()].find((t) => t.name.toLowerCase() === s.toLowerCase()) ?? null;
  }

  async ensureTopic(name: string): Promise<string | null> {
    const existing = this.topicBySlugOrName(name);
    if (existing) return existing.id;
    const slug = slugify(name);
    if (!slug) return null;
    const row = must(
      await db()
        .from("topics")
        .upsert({ owner_id: this.owner, name: name.trim().slice(0, 40), slug, category: "Emerging" }, { onConflict: "owner_id,slug" })
        .select("id,slug,name")
        .single(),
      "upsert topic",
    );
    this.topics.set(slug, row);
    return row.id;
  }

  async linkTopic(episodeId: string, topicId: string, confidence: number) {
    await db().from("episode_topics").upsert({ owner_id: this.owner, episode_id: episodeId, topic_id: topicId, confidence }, { onConflict: "episode_id,topic_id" });
  }

  async guestId(name: string, role: string | null, company: string | null, guestType: string | null = null, links: string[] = []): Promise<{ id: string; needsReview: boolean }> {
    const sb = db();
    const r = resolveGuest(name, company, this.guests);
    if (r.kind === "existing") {
      const g = this.guests.find((x) => x.id === r.id)!;
      if (r.aliasToAdd && normalizePersonName(r.aliasToAdd) !== normalizePersonName(g.name)) {
        await sb.from("guest_aliases").upsert(
          { owner_id: this.owner, guest_id: g.id, alias: r.aliasToAdd, normalized_alias: normalizePersonName(r.aliasToAdd) },
          { onConflict: "owner_id,normalized_alias", ignoreDuplicates: true },
        );
        g.aliases.push(r.aliasToAdd);
      }
      if (links.length) {
        const cur = (await sb.from("guests").select("profile_urls").eq("id", g.id).single()).data?.profile_urls ?? [];
        const merged = [...new Set([...cur, ...links])].slice(0, 6);
        if (merged.length !== cur.length) await sb.from("guests").update({ profile_urls: merged }).eq("id", g.id);
      }
      if (!g.company && company) {
        await sb.from("guests").update({ company, ...(role ? { role } : {}) }).eq("id", g.id);
        g.company = company;
      }
      return { id: g.id, needsReview: false };
    }
    const row = must(
      await sb
        .from("guests")
        .insert({
          owner_id: this.owner,
          name: name.trim(),
          normalized_name: normalizePersonName(name),
          role,
          company,
          guest_type: guestType,
          profile_urls: links,
          review_status: r.needsReview ? "needs_review" : "ok",
          review_note: r.reviewNote,
        })
        .select("id")
        .single(),
      "insert guest",
    );
    this.guests.push({ id: row.id, name: name.trim(), company, aliases: [] });
    return { id: row.id, needsReview: r.needsReview };
  }

  async addAppearance(a: {
    guestId: string;
    episodeId: string;
    excerpt: string;
    url: string | null;
    type: EvidenceType;
    audioTs?: number | null;
    role: string | null;
    confidence: number;
    needsReview: boolean;
  }) {
    await db().from("guest_appearances").upsert(
      {
        owner_id: this.owner,
        guest_id: a.guestId,
        episode_id: a.episodeId,
        evidence_excerpt: truncateWords(a.excerpt, 25),
        evidence_url: a.url,
        evidence_type: a.type,
        audio_timestamp_s: a.audioTs ?? null,
        role_as_stated: a.role,
        confidence: a.confidence,
        review_status: a.needsReview || a.confidence < 0.5 ? "needs_review" : "ok",
      },
      { onConflict: "guest_id,episode_id", ignoreDuplicates: true },
    );
  }

  async brandId(name: string): Promise<string | null> {
    const n = normalizeBrand(name);
    if (!n || n.length < 2) return null;
    const hit = this.brands.get(n);
    if (hit) return hit;
    const row = must(
      await db()
        .from("brands")
        .upsert({ owner_id: this.owner, name: name.trim().slice(0, 60), normalized_name: n }, { onConflict: "owner_id,normalized_name" })
        .select("id")
        .single(),
      "upsert brand",
    );
    this.brands.set(n, row.id);
    return row.id;
  }

  /** One placement per brand per episode; keeps the strongest classification; evidence rows accumulate. */
  async addPlacement(p: {
    brandId: string;
    episodeId: string;
    classification: SponsorClass;
    confidence: number;
    evidence: { type: Exclude<EvidenceType, "title">; excerpt: string; url: string | null; audioTs?: number | null; rule: string | null };
  }) {
    const sb = db();
    const existing = (await sb.from("sponsorship_placements").select("id,classification,confidence").eq("brand_id", p.brandId).eq("episode_id", p.episodeId).maybeSingle()).data;
    let placementId: string;
    if (existing) {
      placementId = existing.id;
      const cls = strongest(existing.classification as SponsorClass, p.classification);
      if (cls !== existing.classification || p.confidence > existing.confidence) {
        await sb.from("sponsorship_placements").update({ classification: cls, confidence: Math.max(p.confidence, existing.confidence) }).eq("id", existing.id);
      }
    } else {
      placementId = must(
        await sb
          .from("sponsorship_placements")
          .insert({ owner_id: this.owner, brand_id: p.brandId, episode_id: p.episodeId, classification: p.classification, confidence: p.confidence })
          .select("id")
          .single(),
        "insert placement",
      ).id;
    }
    await sb.from("placement_evidence").upsert(
      {
        owner_id: this.owner,
        placement_id: placementId,
        evidence_type: p.evidence.type,
        excerpt: truncateWords(p.evidence.excerpt, 25),
        source_url: p.evidence.url,
        audio_timestamp_s: p.evidence.audioTs ?? null,
        matched_rule: p.evidence.rule,
      },
      { onConflict: "placement_id,evidence_type,excerpt", ignoreDuplicates: true },
    );
  }
}
