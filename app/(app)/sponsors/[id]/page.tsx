import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/cards";
import { DraftEditor } from "@/components/draft-editor";
import { AiLabel, Badge, ClaimList, ClassBadge, EvidenceList, ObservedLabel, SourceLink, fmtNum, LockedPanel } from "@/components/ui";
import { sponsorTemplates } from "@/lib/outreach-templates";
import { classificationReason } from "@/lib/sponsors";
import { getDraft, getReport, requirePageViewer } from "@/lib/server/data";
import { formatIst, formatIstDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SponsorDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string }> }) {
  const [{ id }, { r }] = await Promise.all([params, searchParams]);
  const report = await getReport(r);
  const s = report?.snapshot;
  const b = s ? [...s.sponsors, ...s.otherBrands].find((x) => x.id === id) : null;
  if (!report || !s || !b) notFound();
  const viewer = await requirePageViewer();
  const draft = await getDraft("pitch", b.id);
  const sources = new Map(b.placements.map((p) => [`ep:${p.episode.id}`, { label: `${p.episode.podcastName}: ${p.episode.title}`, url: p.episode.url }]));

  return (
    <div className="detail-shell">
      <Link className="back-link" href={r ? `/sponsors?r=${r}` : "/sponsors"}>
        <ArrowLeft size={14} /> All sponsors
      </Link>
      <section className="detail-hero brand">
        <BrandMark name={b.name} huge />
        <div>
          <div className="badge-line">
            {b.confirmed ? <Badge tone="sage">#{b.rank} confirmed sponsor</Badge> : <Badge tone="blush">{b.affiliate ? "Promotion" : "Unverified"}{b.distinctEpisodes >= 2 ? ` · recurring on ${b.distinctEpisodes} episodes` : ""}</Badge>}
            <Badge tone="neutral">30 days</Badge>
          </div>
          <h1 style={{ marginTop: 12 }}>{b.name}</h1>
          <p style={{ margin: "6px 0 0" }}>Seen on {b.shows.join(", ")}</p>
          <div className="metric-row detail-metrics">
            <span><strong>{b.confirmed}</strong>confirmed</span>
            <span><strong>{b.affiliate}</strong>promotion</span>
            <span><strong>{b.probable}</strong>unverified</span>
            <span><strong>{b.distinctShows}</strong>shows</span>
            <span><strong>{b.distinctEpisodes}</strong>episodes</span>
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-top">
              <h2>Placements</h2>
              <ObservedLabel />
            </div>
            {b.placements.map((p) => (
              <div key={p.episode.id} style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{p.episode.title}</strong>
                    <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 3 }}>
                      {p.episode.podcastName} · {formatIstDate(p.episode.publishedAt)}
                    </small>
                  </div>
                  <ClassBadge cls={p.classification} />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  <strong>Why this label:</strong> {classificationReason(p.classification, p.evidence.map((e) => e.excerpt))}
                </p>
                <div style={{ marginTop: 10 }}>
                  <EvidenceList items={p.evidence} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                  {p.stats && (p.stats.views !== null || p.stats.likes !== null) ? (
                    <span>
                      YouTube: {fmtNum(p.stats.views)} views · {fmtNum(p.stats.likes)} likes · collected {formatIst(p.stats.collectedAt)}
                    </span>
                  ) : (
                    <span>No public YouTube stats for this episode</span>
                  )}
                  <SourceLink href={p.episode.url}>Episode</SourceLink>
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-top">
              <h2>Sponsor fit</h2>
              <AiLabel />
            </div>
            {b.fit.length ? <ClaimList claims={b.fit} sources={sources} /> : <p>No AI fit note yet — it is written for the top 3 brands each week when Gemini quota allows.</p>}
          </section>
          <section className="panel sticky">
            {viewer.canEdit ? (
              <DraftEditor endpoint={`/api/sponsors/${b.id}/pitch-draft`} reportId={report.id} initial={draft} kind="pitch" templates={sponsorTemplates(b)} />
            ) : (
              <LockedPanel title="Drafts are private">The sponsor pitch drafts are written and kept for Aditya only.</LockedPanel>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
