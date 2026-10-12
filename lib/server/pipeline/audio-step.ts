import "server-only";
import { env } from "@/lib/env";
import { isHost } from "@/lib/names";
import { guestInScope } from "@/lib/scope";
import { isHouseBrand, matchAffiliate, matchDisclosure, mentionsBrand } from "@/lib/sponsors";
import type { SponsorClass } from "@/lib/shared/types";
import { GeminiBusy, GeminiUnavailable, type GeminiPart } from "@/lib/server/ai/gemini";
import { AUDIO_OPENING_SYSTEM, AUDIO_OPENING_VERSION, audioOpeningContext, audioOpeningSchema } from "@/lib/server/ai/prompts/audio-opening";
import { db, must } from "@/lib/server/db";
import { clipOpening, ffmpegAvailable } from "@/lib/server/providers/audio";
import type { PodcastRow } from "@/lib/server/sources";
import { truncateWords } from "@/lib/text";
import type { Ctx } from "./context";
import type { Entities } from "./entities";

type Ep = { id: string; podcast_id: string; title: string; audio_url: string; episode_url: string | null; published_at: string; audio_status: string };

/** Spoken disclosure rules: "confirmed" only when the heard phrase matches a disclosure rule. */
export function classifySpoken(brand: string, phrase: string, houseBrands: string[]): SponsorClass {
  if (isHouseBrand(brand, houseBrands)) return "related_party";
  if (matchDisclosure(phrase)) return "confirmed";
  if (matchAffiliate(phrase)) return "affiliate";
  return "probable";
}

/**
 * Gemini listens to the opening of new RSS episodes (GitHub Actions only — needs ffmpeg).
 * `mode: "mark"` (Vercel catch-up) only flags eligible episodes as audio_pending.
 */
export async function runAudio(ctx: Ctx, ents: Entities, podcasts: Map<string, PodcastRow>, mode: "analyse" | "mark") {
  const sb = db();
  const eligible = (
    must(
      await sb
        .from("episodes")
        .select("id,podcast_id,title,audio_url,episode_url,published_at,audio_status")
        .eq("owner_id", ctx.owner)
        .eq("is_sample", false)
        .not("audio_url", "is", null)
        .in("audio_status", ["none", "pending", "skipped"])
        .gte("published_at", ctx.period.start30.toISOString())
        .order("published_at", { ascending: false })
        .limit(500),
      "load audio episodes",
    ) as Ep[]
  ).filter((e) => podcasts.get(e.podcast_id)?.analyse_audio);

  if (!eligible.length) return;
  if (mode === "mark") {
    await sb.from("episodes").update({ audio_status: "pending" }).in("id", eligible.map((e) => e.id));
    ctx.counters.audioPending += eligible.length;
    ctx.info(`audio: ${eligible.length} episodes marked audio_pending for the next GitHub Actions run`);
    return;
  }
  if (!(await ffmpegAvailable())) {
    ctx.counters.audioPending += eligible.length;
    ctx.notes.push("ffmpeg not available here — audio analysis left pending for the GitHub Actions run.");
    await sb.from("episodes").update({ audio_status: "pending" }).in("id", eligible.map((e) => e.id));
    return;
  }
  if (!ctx.gemini) return;

  const cap = env().AUDIO_MAX_EPISODES_PER_RUN;
  const minutes = env().AUDIO_CLIP_MINUTES;
  const queue = eligible.slice(0, cap);
  for (const ep of queue) {
    const p = podcasts.get(ep.podcast_id)!;
    if (ctx.deadline && Date.now() > ctx.deadline - 60_000) {
      ctx.info(`audio: time budget reached — ${queue.length - queue.indexOf(ep)} openings left for the next run`);
      return; // still pending, picked up next run
    }
    if (!ctx.gemini.available() || ctx.gemini.remaining() <= 2) {
      // keep room for the brief; never fail the report
      const rest = queue.slice(queue.indexOf(ep));
      await sb.from("episodes").update({ audio_status: "skipped", audio_error: "free-tier budget reserved for brief" }).in("id", rest.map((e) => e.id));
      ctx.counters.audioSkipped += rest.length;
      ctx.notes.push(`audio_skipped: ${rest.length} episode openings not analysed (Gemini free-tier budget).`);
      return;
    }
    let clip: Awaited<ReturnType<typeof clipOpening>> | null = null;
    try {
      clip = await clipOpening(ep.audio_url, minutes);
      let part: GeminiPart;
      if (clip.inline) {
        part = { inlineData: { mimeType: clip.mimeType, data: clip.data.toString("base64") } };
      } else {
        const up = await ctx.gemini.sdk.files.upload({ file: clip.path, config: { mimeType: clip.mimeType } });
        part = { fileData: { mimeType: clip.mimeType, fileUri: up.uri! } };
      }
      const out = await ctx.gemini.json({
        name: "audio-opening",
        version: AUDIO_OPENING_VERSION,
        system: AUDIO_OPENING_SYSTEM,
        parts: [{ text: audioOpeningContext(p.name, p.host_names, p.house_brands, ep.title) }, part],
        schema: audioOpeningSchema,
        inputKind: "audio",
      });
      if (!out) {
        await sb.from("episodes").update({ audio_status: "failed", audio_error: "invalid model output" }).eq("id", ep.id);
        ctx.counters.audioFailed++;
        continue;
      }
      const evidenceUrl = ep.episode_url ?? ep.audio_url;
      for (const r of out.sponsor_reads) {
        const phrase = truncateWords(r.disclosure_phrase, 25);
        const cls = classifySpoken(r.brand, phrase, p.house_brands);
        // the brand must be named in what was heard (or the phrase is the ad read itself)
        if (cls === "confirmed" && !mentionsBrand(phrase, r.brand) && !mentionsBrand(r.disclosure_phrase, r.brand)) continue;
        const brandId = await ents.brandId(r.brand);
        if (!brandId) continue;
        await ents.addPlacement({ brandId, episodeId: ep.id, classification: cls, confidence: 0.8, evidence: { type: "audio", excerpt: phrase, url: evidenceUrl, audioTs: r.timestamp_s, rule: matchDisclosure(phrase) ?? matchAffiliate(phrase) } });
      }
      for (const g of out.guest_introductions) {
        if (isHost(g.name, p.host_names)) continue;
        if (!guestInScope(g)) continue; // guardrail
        const { id, needsReview } = await ents.guestId(g.name, g.role_company, null, g.guest_type);
        await ents.addAppearance({ guestId: id, episodeId: ep.id, excerpt: g.quote, url: evidenceUrl, type: "audio", audioTs: g.timestamp_s, role: g.role_company, confidence: 0.75, needsReview });
      }
      for (const t of out.topics) {
        const topic = ents.topicBySlugOrName(t);
        if (topic) await ents.linkTopic(ep.id, topic.id, 0.6);
      }
      await sb.from("episodes").update({ audio_status: "done", audio_error: null }).eq("id", ep.id);
      ctx.counters.audioDone++;
      ctx.info(`audio: ${p.name} — ${ep.title.slice(0, 50)}`, { sponsors: out.sponsor_reads.length, guests: out.guest_introductions.length });
    } catch (e) {
      if (e instanceof GeminiUnavailable || e instanceof GeminiBusy) {
        const rest = queue.slice(queue.indexOf(ep));
        await sb.from("episodes").update({ audio_status: "skipped", audio_error: e instanceof GeminiBusy ? "Gemini busy (503)" : "Gemini quota" }).in("id", rest.map((x) => x.id));
        ctx.counters.audioSkipped += rest.length;
        ctx.notes.push(`audio_skipped: ${rest.length} episode openings (Gemini free-tier quota). Text results are complete.`);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("episodes").update({ audio_status: "failed", audio_error: msg.slice(0, 300) }).eq("id", ep.id);
      ctx.counters.audioFailed++;
      ctx.warn(`audio failed for ${p.name}: ${msg}`);
    } finally {
      await clip?.cleanup(); // temp clip deleted immediately
    }
  }
}
