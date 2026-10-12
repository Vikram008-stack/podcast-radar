import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiLabel, Artwork, Badge, ChangePill, ClaimList, ObservedLabel, SourceLink, fmtNum } from "@/components/ui";
import { getReport } from "@/lib/server/data";
import { observedSwot } from "@/lib/swot";

const SWOT_KEYS = [
  ["strengths", "Strengths", "💪"],
  ["weaknesses", "Weaknesses", "🧱"],
  ["opportunities", "Opportunities", "🚀"],
  ["threats", "Threats", "⚠️"],
] as const;
import { formatIst, formatIstDate, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TopicDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string }> }) {
  const [{ id }, { r }] = await Promise.all([params, searchParams]);
  const report = await getReport(r);
  const s = report?.snapshot;
  const t = s?.topics.find((x) => x.id === id);
  if (!s || !t) notFound();
  const sources = new Map<string, { label: string; url: string | null }>([
    ...t.referenceEpisodes.map((e) => [`ep:${e.id}`, { label: `${e.podcastName}: ${e.title}`, url: e.url }] as const),
    ...t.news.map((n) => [`news:${n.id}`, { label: `${n.publisher}: ${n.title}`, url: n.url }] as const),
  ]);
  const cover = t.referenceEpisodes.find((e) => e.thumbnail)?.thumbnail;
  const hasAudience = t.audienceResponse.length > 0;
  const basic = observedSwot(t);

  return (
    <div className="detail-shell">
      <Link className="back-link" href={r ? `/topics?r=${r}` : "/topics"}>
        <ArrowLeft size={14} /> All topics
      </Link>
      <section className="detail-hero topic">
        {cover ? <Artwork src={cover} alt="" className="topic-cover" /> : <span className="avatar lg tone-2" aria-hidden>#</span>}
        <div>
          <div className="badge-line">
            <Badge tone="sage">#{t.rank} topic</Badge>
            <Badge tone="neutral">{t.category ?? "Topic"}</Badge>
            <ChangePill change={t.change} />
          </div>
          <h1 style={{ marginTop: 12 }}>{t.name}</h1>
          <p style={{ margin: "6px 0 0" }}>{formatRange(s.periodStart, s.periodEnd)} vs the previous week</p>
          <div className="metric-row detail-metrics">
            <span><strong>{t.episodes}</strong>episodes</span>
            <span><strong>{t.distinctShows}</strong>distinct shows</span>
            <span><strong>{t.previousEpisodes}</strong>previous week</span>
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-top">
              <h2>Reference episodes</h2>
              <ObservedLabel />
            </div>
            {t.referenceEpisodes.map((e) => (
              <div key={e.id} className="episode-row">
                <Artwork src={e.thumbnail} alt="" />
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {e.podcastName} · {formatIstDate(e.publishedAt)}
                  </small>
                </div>
                <SourceLink href={e.url}>Listen</SourceLink>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-top">
              <h2>SWOT — should your show cover it?</h2>
              {t.swot ? <AiLabel /> : <ObservedLabel>From the counts</ObservedLabel>}
            </div>
            <div className="swot">
              {SWOT_KEYS.map(([k, label, emoji]) => (
                <div key={k} className={`swot-cell swot-${k}`}>
                  <strong>
                    {emoji} {label}
                  </strong>
                  {t.swot && t.swot[k].length ? (
                    <ClaimList claims={t.swot[k]} sources={sources} />
                  ) : (
                    <ul>
                      {basic[k].map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-top">
              <h2>In Indian startup news</h2>
              <ObservedLabel />
            </div>
            {t.news.length ? (
              t.news.map((n) => (
                <div key={n.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                  <SourceLink href={n.url}>{n.title}</SourceLink>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                    {n.publisher} · {formatIstDate(n.publishedAt)}
                  </small>
                </div>
              ))
            ) : (
              <p>No Inc42, YourStory or Entrackr headline was tagged with this topic in the last two weeks.</p>
            )}
          </section>
          <section className="panel">
            <div className="panel-top">
              <h2>Audience response</h2>
              <ObservedLabel>Public stats</ObservedLabel>
            </div>
            {hasAudience ? (
              t.audienceResponse.map((a) => (
                <div key={a.episodeId} style={{ padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                  <strong style={{ display: "block" }}>{a.title}</strong>
                  <span style={{ color: "var(--muted)" }}>
                    {fmtNum(a.views)} views · {fmtNum(a.likes)} likes · collected {formatIst(a.collectedAt)}
                  </span>
                </div>
              ))
            ) : (
              <p>Insufficient public data — none of these episodes have public YouTube statistics yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
