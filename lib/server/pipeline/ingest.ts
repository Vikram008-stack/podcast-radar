import "server-only";
import { findMatch } from "@/lib/dedupe";
import { env } from "@/lib/env";
import { check, db, must } from "@/lib/server/db";
import { fetchRss } from "@/lib/server/providers/rss";
import { isFullEpisode, parseChannelRef, recentUploads, resolveChannel } from "@/lib/server/providers/youtube";
import { SpotifyQuotaError, spotifyEpisodes } from "@/lib/server/providers/spotify";
import type { PodcastRow } from "@/lib/server/sources";
import { sha256 } from "@/lib/text";
import type { Ctx } from "./context";

type Provider = "rss" | "youtube" | "spotify";

type Incoming = {
  provider: Provider;
  externalId: string;
  url: string | null;
  title: string;
  description: string;
  publishedAt: string;
  durationS: number | null;
  audioUrl: string | null;
  thumbnail: string | null;
  stats?: { views: number | null; likes: number | null; comments: number | null };
};

type EpisodeRow = {
  id: string;
  title: string;
  description: string;
  published_at: string;
  duration_s: number | null;
  episode_url: string | null;
  audio_url: string | null;
  thumbnail_url: string | null;
  content_hash: string;
  episode_sources: { provider: Provider; external_id: string; url: string | null; description: string | null }[];
};

const LABEL: Record<Provider, string> = { rss: "Show notes", youtube: "YouTube description", spotify: "Spotify description" };

/** Merged description: one block per provider (unique texts only), capped. */
export function mergeDescriptions(sources: { provider: Provider; description: string | null }[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of sources) {
    const d = (s.description ?? "").trim();
    if (!d) continue;
    const k = d.slice(0, 300);
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(`[${LABEL[s.provider]}]\n${d.slice(0, 8000)}`);
  }
  return parts.join("\n\n").slice(0, 20_000);
}

export type IngestOutcome = { ok: boolean; error?: string; fetched: number; created: number; merged: number };

/** Ingest one show from all its configured providers. Isolated: never throws. */
export async function ingestPodcast(ctx: Ctx, p: PodcastRow): Promise<IngestOutcome> {
  const sb = db();
  const errors: string[] = [];
  const incoming: Incoming[] = [];
  const checkpoint = { ...(p.checkpoint ?? {}) } as Record<string, unknown>;
  const minMinutes = p.min_episode_minutes ?? env().MIN_EPISODE_MINUTES;
  let providersTried = 0;

  // RSS (primary)
  if (p.rss_url) {
    providersTried++;
    try {
      ctx.provider.rss_fetches++;
      const r = await fetchRss(p.rss_url, (checkpoint.rss as { etag?: string; lastModified?: string }) ?? {});
      if (!r.notModified) {
        for (const e of r.episodes) {
          if (new Date(e.publishedAt) < ctx.since) continue;
          incoming.push({
            provider: "rss",
            externalId: `${p.id}:${e.guid}`.slice(0, 500),
            url: e.link,
            title: e.title,
            description: e.description,
            publishedAt: e.publishedAt,
            durationS: e.durationS,
            audioUrl: e.audioUrl,
            thumbnail: e.artwork,
          });
        }
        checkpoint.rss = { etag: r.etag, lastModified: r.lastModified };
      }
    } catch (e) {
      errors.push(`RSS: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // YouTube (official API, video-first shows)
  const ytKey = env().YOUTUBE_API_KEY;
  const ytRef = p.youtube_channel_id ? { id: p.youtube_channel_id } : p.youtube_handle ? parseChannelRef(p.youtube_handle) : null;
  if (ytRef) {
    providersTried++;
    if (!ytKey) {
      if (!p.rss_url) errors.push("YouTube: YOUTUBE_API_KEY missing");
    } else {
      try {
        const quota = { units: 0 };
        let channel = checkpoint.youtube as { id: string; title: string; uploadsPlaylist: string; thumbnail: string | null } | undefined;
        if (!channel || (p.youtube_channel_id && channel.id !== p.youtube_channel_id)) {
          channel = (await resolveChannel(ytRef, ytKey, quota)) ?? undefined;
          if (!channel) throw new Error("channel not found");
          checkpoint.youtube = channel;
          if (!p.youtube_channel_id) await sb.from("podcasts").update({ youtube_channel_id: channel.id }).eq("id", p.id);
        }
        const videos = await recentUploads(channel, ctx.since, ytKey, quota);
        ctx.provider.youtube_units += quota.units;
        for (const v of videos) {
          if (!isFullEpisode(v.durationS, minMinutes)) continue; // Shorts / clips are not episodes
          incoming.push({
            provider: "youtube",
            externalId: v.id,
            url: v.url,
            title: v.title,
            description: v.description,
            publishedAt: v.publishedAt,
            durationS: v.durationS,
            audioUrl: null,
            thumbnail: v.thumbnail,
            stats: { views: v.views, likes: v.likes, comments: v.comments },
          });
        }
      } catch (e) {
        errors.push(`YouTube: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Spotify Scraper (secondary, optional; never breaks a run)
  const rapid = env().RAPIDAPI_KEY;
  if (p.spotify_show_id && rapid && ctx.spotifyRemaining > 0) {
    ctx.spotifyRemaining--;
    try {
      const counter = { requests: 0 };
      const eps = await spotifyEpisodes(p.spotify_show_id, { key: rapid, host: env().RAPIDAPI_SPOTIFY_HOST }, counter);
      ctx.provider.rapidapi_requests += counter.requests;
      for (const e of eps) {
        if (new Date(e.publishedAt) < ctx.since) continue;
        if (e.durationS !== null && !isFullEpisode(e.durationS, minMinutes)) continue;
        incoming.push({ provider: "spotify", externalId: e.id, url: e.url, title: e.title, description: e.description, publishedAt: e.publishedAt, durationS: e.durationS, audioUrl: null, thumbnail: null });
      }
    } catch (e) {
      ctx.provider.rapidapi_requests += 1;
      const msg = e instanceof SpotifyQuotaError ? "Spotify quota reached — skipped" : `Spotify skipped: ${e instanceof Error ? e.message : String(e)}`;
      ctx.warn(`${p.name}: ${msg}`);
    }
  }

  // Persist (normalize + dedupe + content hash)
  let created = 0;
  let merged = 0;
  try {
    const existing = must(
      await sb
        .from("episodes")
        .select("id,title,description,published_at,duration_s,episode_url,audio_url,thumbnail_url,content_hash,episode_sources(provider,external_id,url,description)")
        .eq("podcast_id", p.id)
        .gte("published_at", new Date(ctx.since.getTime() - 4 * 86_400_000).toISOString())
        .limit(1000),
      "load episodes",
    ) as EpisodeRow[];
    const bySource = new Map<string, EpisodeRow>();
    for (const ep of existing) for (const s of ep.episode_sources) bySource.set(`${s.provider}|${s.external_id}`, ep);

    // RSS first so it becomes the canonical row; then YouTube, then Spotify.
    const order: Record<Provider, number> = { rss: 0, youtube: 1, spotify: 2 };
    incoming.sort((a, b) => order[a.provider] - order[b.provider] || a.publishedAt.localeCompare(b.publishedAt));

    for (const it of incoming) {
      const key = `${it.provider}|${it.externalId}`;
      let ep = bySource.get(key) ?? null;
      const isNewSource = !ep;
      if (!ep) {
        // Only merge across platforms: an episode never has two sources from the same provider.
        const candidates = existing.filter((e) => !e.episode_sources.some((s) => s.provider === it.provider));
        const m = findMatch({ title: it.title, publishedAt: it.publishedAt }, candidates.map((e) => ({ id: e.id, title: e.title, publishedAt: e.published_at })));
        ep = m ? (existing.find((e) => e.id === m.id) ?? null) : null;
        if (ep) merged++;
      }
      if (!ep) {
        const description = mergeDescriptions([{ provider: it.provider, description: it.description }]);
        const row = must(
          await sb
            .from("episodes")
            .insert({
              owner_id: ctx.owner,
              podcast_id: p.id,
              title: it.title,
              description,
              published_at: it.publishedAt,
              duration_s: it.durationS,
              episode_url: it.url,
              audio_url: it.audioUrl,
              thumbnail_url: it.thumbnail,
              content_hash: sha256(it.title + "\n" + description),
              audio_status: it.audioUrl && p.analyse_audio ? "pending" : "none",
              stats: it.stats ?? null,
              stats_collected_at: it.stats ? new Date().toISOString() : null,
            })
            .select("id,title,description,published_at,duration_s,episode_url,audio_url,thumbnail_url,content_hash")
            .single(),
          "insert episode",
        ) as Omit<EpisodeRow, "episode_sources">;
        ep = { ...row, episode_sources: [] };
        existing.push(ep);
        created++;
        ctx.counters.newEpisodes++;
      }
      if (isNewSource) {
        check(
          await sb.from("episode_sources").upsert(
            { owner_id: ctx.owner, episode_id: ep.id, provider: it.provider, external_id: it.externalId, url: it.url, description: it.description.slice(0, 20_000) },
            { onConflict: "provider,external_id" },
          ),
          "upsert source",
        );
        ep.episode_sources.push({ provider: it.provider, external_id: it.externalId, url: it.url, description: it.description });
        bySource.set(key, ep);
      } else {
        const src = ep.episode_sources.find((s) => s.provider === it.provider && s.external_id === it.externalId);
        if (src && src.description !== it.description) {
          await sb.from("episode_sources").update({ description: it.description.slice(0, 20_000), url: it.url }).eq("provider", it.provider).eq("external_id", it.externalId);
          src.description = it.description;
        }
      }
      // Merge fields + recompute hash (skip unchanged)
      const description = mergeDescriptions(
        [...ep.episode_sources].sort((a, b) => order[a.provider] - order[b.provider]).map((s) => ({ provider: s.provider, description: s.description })),
      );
      const hash = sha256(ep.title + "\n" + description);
      const patch: Record<string, unknown> = {};
      if (hash !== ep.content_hash) {
        patch.description = description;
        patch.content_hash = hash;
        ep.content_hash = hash;
        ep.description = description;
      }
      if (!ep.thumbnail_url && it.thumbnail) patch.thumbnail_url = ep.thumbnail_url = it.thumbnail;
      if (!ep.audio_url && it.audioUrl) {
        patch.audio_url = ep.audio_url = it.audioUrl;
        if (p.analyse_audio) patch.audio_status = "pending";
      }
      if (!ep.duration_s && it.durationS) patch.duration_s = ep.duration_s = it.durationS;
      if (!ep.episode_url && it.url) patch.episode_url = ep.episode_url = it.url;
      if (it.stats) {
        patch.stats = it.stats;
        patch.stats_collected_at = new Date().toISOString();
      }
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        check(await sb.from("episodes").update(patch).eq("id", ep.id), "update episode");
        if (patch.content_hash && !isNewSource) ctx.counters.updatedEpisodes++;
      }
    }
  } catch (e) {
    errors.push(`DB: ${e instanceof Error ? e.message : String(e)}`);
  }

  const ok = errors.length === 0 || (errors.length < providersTried && incoming.length > 0);
  const now = new Date().toISOString();
  await sb
    .from("podcasts")
    .update({
      checkpoint,
      last_attempt_at: now,
      ...(ok ? { last_success_at: now } : {}),
      last_error: errors.length ? errors.join(" · ").slice(0, 500) : null,
      updated_at: now,
    })
    .eq("id", p.id);
  if (errors.length) ctx.warn(`${p.name}: ${errors.join(" · ")}`);
  ctx.info(`${p.name}: fetched ${incoming.length}, new ${created}, merged ${merged}`);
  return { ok, error: errors.join(" · ") || undefined, fetched: incoming.length, created, merged };
}
