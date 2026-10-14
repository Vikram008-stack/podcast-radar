import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftEditor } from "@/components/draft-editor";
import { AiLabel, Artwork, Avatar, Badge, ClaimList, EmptyState, EvidenceIcon, ObservedLabel, SourceLink, evidenceCaption, LockedPanel } from "@/components/ui";
import { guestTemplates, linkLabel, linkedinSearchUrl } from "@/lib/outreach-templates";
import { getDraft, getReport, requirePageViewer } from "@/lib/server/data";
import { listenLinks } from "@/lib/server/episode-links";

import { formatIstDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GuestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string }> }) {
  const [{ id }, { r }] = await Promise.all([params, searchParams]);
  const report = await getReport(r);
  const g = report?.snapshot?.guests.find((x) => x.id === id);
  if (!report || !g) notFound();
  const viewer = await requirePageViewer();
  const draft = await getDraft("outreach", g.id);
  const listen = await listenLinks(g.history.map((h) => h.episode));
  const sources = new Map(g.history.map((h) => [`ep:${h.episode.id}`, { label: `${h.episode.podcastName}: ${h.episode.title}`, url: h.evidence.url ?? h.episode.url }]));
  const stated = g.history.find((h) => h.roleAsStated);

  return (
    <div className="detail-shell">
      <Link className="back-link" href={r ? `/guests?r=${r}` : "/guests"}>
        <ArrowLeft size={14} /> All guests
      </Link>
      <section className="detail-hero">
        <Avatar name={g.name} size="lg" />
        <div>
          <div className="badge-line">
            <Badge tone="lavender">#{g.rank} guest · 30 days</Badge>
            {g.distinctShows >= 2 ? <Badge tone="sage">Doing media rounds</Badge> : null}
          </div>
          <h1 style={{ marginTop: 12 }}>{g.name}</h1>
          <p style={{ margin: "6px 0 0" }}>{[g.role, g.company].filter(Boolean).join(" · ") || "Role and company not stated in the sources"}</p>
          <div className="metric-row detail-metrics">
            <span><strong>{g.distinctShows}</strong>distinct shows</span>
            <span><strong>{g.appearances}</strong>appearances</span>
            <span><strong>{formatIstDate(g.firstAppearance)}</strong>first</span>
            <span><strong>{formatIstDate(g.latestAppearance)}</strong>latest</span>
          </div>
          {g.aliases.length ? <p style={{ margin: 0, fontSize: 12 }}>Also spelled: {g.aliases.join(", ")}</p> : null}
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-top">
              <h2>Appearance history</h2>
              <ObservedLabel />
            </div>
            {g.history.map((h) => (
              <div key={h.episode.id} className="episode-row" style={{ alignItems: "start" }}>
                <Artwork src={h.episode.thumbnail} alt="" />
                <div>
                  <strong>{h.episode.title}</strong>
                  <small>
                    {h.episode.podcastName} · {formatIstDate(h.episode.publishedAt)}
                  </small>
                  <p className={`quote ${h.evidence.type === "audio" ? "audio" : ""}`}>
                    <EvidenceIcon type={h.evidence.type} /> {evidenceCaption(h.evidence)}: “{h.evidence.excerpt}”
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                    {(listen[h.episode.id] ?? []).map((l) => (
                      <SourceLink key={l.label} href={l.url}>
                        {l.label}
                      </SourceLink>
                    ))}
                  </div>
                </div>
                <Badge tone="neutral">{Math.round(h.confidence * 100)}%</Badge>
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-top">
              <h2>Talking points</h2>
              {g.talkingPoints.length ? <AiLabel /> : <ObservedLabel>From episode titles</ObservedLabel>}
            </div>
            {g.talkingPoints.length ? (
              <ClaimList claims={g.talkingPoints} sources={sources} />
            ) : (
              <>
                <ul className="claim-list">
                  {g.history.slice(0, 3).map((h) => (
                    <li key={h.episode.id}>
                      On {h.episode.podcastName} they discussed “{h.episode.title.split("|")[0].trim()}”. What did they leave out — and what would they tell a first-time Indian founder about it today?
                    </li>
                  ))}
                  <li>What did the first 12 months of {g.company ?? "the company"} look like before anyone outside knew the name?</li>
                </ul>
              </>
            )}
          </section>
        </div>

        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-top">
              <h2>Public professional context</h2>
              <ObservedLabel />
            </div>
            {stated ? (
              <>
                <p>As stated in the source: “{stated.roleAsStated}”.</p>
                <SourceLink href={stated.evidence.url ?? stated.episode.url}>Where this is stated</SourceLink>
              </>
            ) : (
              <p>No role or company is stated in the monitored sources. We don&apos;t look people up elsewhere.</p>
            )}
            <p style={{ marginTop: 12 }}>Shows: {g.shows.join(", ")}</p>
          </section>
          <section className="panel">
            <div className="panel-top">
              <h2>Reach out</h2>
              <ObservedLabel>Public links</ObservedLabel>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              {(g.links ?? []).map((u) => (
                <SourceLink key={u} href={u}>
                  {linkLabel(u)} (from episode notes)
                </SourceLink>
              ))}
              <a className="button soft sm" href={linkedinSearchUrl(g.name, g.company)} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
                Find {g.name.split(" ")[0]} on LinkedIn ↗
              </a>
            </div>
            <p style={{ fontSize: 12, marginTop: 12 }}>
              Only links the guest shared publicly in episode notes are shown. Personal emails and phone numbers are not collected — connect on LinkedIn or through their company site, then use the drafts below.
            </p>
          </section>
          <section className="panel sticky">
            {viewer.canEdit ? (
              <DraftEditor endpoint={`/api/guests/${g.id}/outreach-draft`} reportId={report.id} initial={draft} kind="outreach" templates={guestTemplates(g)} />
            ) : (
              <LockedPanel title="Drafts are private">The guest outreach drafts are written and kept for Aditya only.</LockedPanel>
            )}
          </section>
        </aside>
      </div>
      {g.history.length === 0 ? <EmptyState title="No appearances in this window" /> : null}
    </div>
  );
}
