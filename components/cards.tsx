import { ArrowRight, AudioLines, Sparkles } from "lucide-react";
import Link from "next/link";
import type { GuestSignal, Opportunity, SponsorSignal, TopicSignal } from "@/lib/shared/types";
import { formatIstDate, formatIstShort } from "@/lib/time";
import { AiLabel, Artwork, Avatar, Badge, Button, ChangePill, ObservedLabel, SourceLink, toneFor } from "./ui";

function q(reportId?: string) {
  return reportId ? `?r=${reportId}` : "";
}

function listShows(shows: string[], max = 2) {
  if (shows.length <= max) return shows.join(" and ");
  return `${shows.slice(0, max).join(", ")} +${shows.length - max} more`;
}

export function GuestCard({ g, reportId }: { g: GuestSignal; reportId?: string }) {
  const audio = g.history.some((h) => h.evidence.type === "audio");
  return (
    <article className="feature-card linked guest-card">
      <div className="card-top">
        <Avatar name={g.name} size="md" />
        <div className="badge-line">
          <Badge tone="lavender">#{g.rank} guest</Badge>
          {audio ? (
            <Badge tone="neutral">
              <AudioLines size={12} /> heard
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="card-body">
        <div className="card-heading">
          <h3><Link className="stretch" href={`/guests/${g.id}${q(reportId)}`}>{g.name}</Link></h3>
          <p>{[g.role, g.company].filter(Boolean).join(" · ") || "Role not stated in sources"}</p>
        </div>
        <div className="metric-row">
          <span><strong>{g.distinctShows}</strong>shows</span>
          <span><strong>{g.appearances}</strong>appearances</span>
          <span><strong>{formatIstShort(g.latestAppearance)}</strong>latest</span>
        </div>
        <p className="insight">
          <ObservedLabel /> <br />
          On {listShows(g.shows)} in the last 30 days.
        </p>
        <div className="evidence">
          <small>Evidence</small>
          {g.history.slice(0, 2).map((h) => (
            <span key={h.episode.id}>
              <SourceLink href={h.evidence.url ?? h.episode.url}>{h.episode.podcastName}</SourceLink>
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function TopicCard({ t, reportId }: { t: TopicSignal; reportId?: string }) {
  const arts = [...new Map(t.referenceEpisodes.map((e) => [e.podcastId, e.thumbnail])).values()].slice(0, 5);
  return (
    <article className="feature-card linked topic-card">
      <div className="card-top" style={{ paddingBottom: 0 }}>
        <div className="art-stack" style={{ padding: 0 }}>
          {arts.map((a, i) => (
            <Artwork key={i} src={a} alt="" />
          ))}
        </div>
        <Badge tone="sage">#{t.rank} topic</Badge>
      </div>
      <div className="card-body">
        <div className="card-heading">
          <h3><Link className="stretch" href={`/topics/${t.id}${q(reportId)}`}>{t.name}</Link></h3>
          <p>{t.category ?? "Topic"} · this reporting week</p>
        </div>
        <div className="metric-row">
          <span><strong>{t.episodes}</strong>episodes</span>
          <span><strong>{t.distinctShows}</strong>shows</span>
          <ChangePill change={t.change} />
        </div>
        <p className="insight">
          <ObservedLabel /> <br />
          Covered by {listShows(t.shows)}.
        </p>
        <div className="evidence">
          <small>Evidence</small>
          {t.referenceEpisodes.slice(0, 2).map((e) => (
            <span key={e.id}>
              <SourceLink href={e.url}>{e.podcastName}</SourceLink>
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function BrandMark({ name, huge }: { name: string; huge?: boolean }) {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span className={`avatar ${huge ? "lg" : "md"} ${toneFor(name)}`} style={{ borderRadius: huge ? 26 : 14 }} aria-hidden>
      {letters}
    </span>
  );
}

export function SponsorCard({ s, reportId, rank }: { s: SponsorSignal; reportId?: string; rank?: number }) {
  const ev = s.placements[0]?.evidence[0];
  return (
    <article className="feature-card linked sponsor-card">
      <div className="card-top">
        <BrandMark name={s.name} />
        <Badge tone="sand">#{rank ?? s.rank} sponsor</Badge>
      </div>
      <div className="card-body">
        <div className="card-heading">
          <h3><Link className="stretch" href={`/sponsors/${s.id}${q(reportId)}`}>{s.name}</Link></h3>
          <p>{s.confirmed ? "Confirmed sponsorship" : `${s.affiliate ? "Promotion (code / referral)" : "Featured brand"}${s.distinctEpisodes >= 2 ? ` · recurring on ${s.distinctEpisodes} episodes` : ""}`}</p>
        </div>
        <div className="metric-row">
          <span><strong>{s.confirmed || s.distinctEpisodes}</strong>{s.confirmed ? "confirmed" : "episodes"}</span>
          <span><strong>{s.distinctShows}</strong>shows</span>
          <span><strong>{s.latestPlacement ? formatIstShort(s.latestPlacement) : "—"}</strong>latest</span>
        </div>
        {ev ? (
          <p className="insight" style={{ fontStyle: "italic" }}>
            “{ev.excerpt}”
          </p>
        ) : null}
        <div className="evidence">
          <small>Seen on</small>
          {s.shows.slice(0, 2).map((name) => (
            <Badge key={name} tone="neutral">
              {name}
            </Badge>
          ))}
        </div>
      </div>
    </article>
  );
}

export function EmptySlot({ what, rule }: { what: string; rule: string }) {
  return (
    <div className="empty-slot">
      <Sparkles size={20} color="#9a85ad" aria-hidden />
      <strong>No more {what} qualify</strong>
      <span>{rule}</span>
    </div>
  );
}

export function OpportunityBanner({ o, reportId }: { o: Opportunity; reportId?: string }) {
  if (!o.topic) {
    return (
      <section className="opportunity" aria-label="Opportunity this week">
        <div className="opportunity-art">
          <Sparkles size={24} aria-hidden />
          <span>THIS WEEK</span>
        </div>
        <div className="opportunity-copy">
          <p className="eyebrow">Opportunity this week</p>
          <h2>No cross-show wave yet</h2>
          <p>No topic was covered by two or more monitored shows this week, so there is no evidence-backed opportunity to recommend. Check the ranked topics below for early signals.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="opportunity" aria-label="Opportunity this week">
      <div className="opportunity-art">
        <Sparkles size={24} aria-hidden />
        <span>THIS WEEK</span>
      </div>
      <div className="opportunity-copy">
        <p className="eyebrow">Opportunity this week</p>
        <h2>
          {o.topic.name}
          {o.guest ? ` × ${o.guest.name}` : ""}
        </h2>
        <p>
          <span className="label-observed" style={{ color: "#b7cfb3" }}>Observed</span> · {o.topic.episodes} episodes across {o.topic.distinctShows} shows
          {o.guest ? `; ${o.guest.name} appeared on ${o.guest.distinctShows} shows in 30 days` : ""}.
        </p>
        {o.copy.length ? (
          <p>
            <AiLabel /> · {o.copy.map((c) => c.claim).join(" ")}
          </p>
        ) : (
          <p style={{ opacity: 0.8 }}>AI copy unavailable this week — the counts above are the evidence.</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          {o.sources.slice(0, 3).map((s, i) => (
            <SourceLink key={`${i}-${s.url}`} href={s.url}>
              {s.label.length > 50 ? s.label.slice(0, 48) + "…" : s.label}
            </SourceLink>
          ))}
        </div>
      </div>
      <Button href={`/topics/${o.topic.id}${q(reportId)}`} variant="primary">
        Explore <ArrowRight size={14} />
      </Button>
    </section>
  );
}

export function StatusBars({ sources }: { sources: { status: string; name: string }[] }) {
  return (
    <div className="status-line" style={{ gridTemplateColumns: `repeat(${Math.max(sources.length, 1)}, 1fr)` }} role="img" aria-label="Collection health per source">
      {sources.map((s, i) => (
        <span key={i} className={s.status} title={`${s.name}: ${s.status.replace("_", " ")}`} />
      ))}
    </div>
  );
}

export function fmtWindow(start: string, end: string) {
  return `${formatIstShort(start)} – ${formatIstDate(end)}`;
}
