import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptySlot, GuestCard, OpportunityBanner, SponsorCard, StatusBars, TopicCard } from "@/components/cards";
import { Badge, SectionTitle } from "@/components/ui";
import { topPicks } from "@/lib/top-picks";
import { getReport } from "@/lib/server/data";
import { formatIst, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  const s = report?.snapshot;
  if (!report || !s) notFound();
  const picks = topPicks(s);
  const fg = picks.guests;
  const ft = picks.topics;
  const fs = picks.sponsors;
  return (
    <div className="page">
      <Link className="back-link" href="/reports">
        <ArrowLeft size={14} /> All briefs
      </Link>
      <header className="page-header" style={{ paddingTop: 0 }}>
        <div className="badge-line">
          <Badge tone="lavender">Issue {report.version}</Badge>
          {report.status === "ready" ? <Badge tone="sage">Frozen snapshot</Badge> : <Badge tone="sand">In progress</Badge>}
        </div>
        <h1 style={{ marginTop: 12 }}>{formatRange(s.periodStart, s.periodEnd)}</h1>
        <p>
          Generated {formatIst(report.generated_at)} · {s.sourcesCollected} of {s.sourcesTotal} sources collected · {s.stats.episodesIn30d} episodes in 30 days
        </p>
        <div style={{ maxWidth: 420 }}>
          <StatusBars sources={s.sources} />
        </div>
      </header>
      <SectionTitle eyebrow="Guests · 30 days" title="Guests to watch" action={<Link className="source-link" href={`/guests?r=${id}`}>All {s.guests.length} guests</Link>} />
      <div className="card-grid">
        {fg.map((g) => <GuestCard key={g.id} g={g} reportId={id} />)}
        {Array.from({ length: 3 - fg.length }).map((_, i) => <EmptySlot key={i} what="guests" rule="Fewer than 3 guests qualified — no padding." />)}
      </div>
      <div style={{ height: 40 }} />
      <SectionTitle eyebrow="Topics · reporting week" title="Topics the shows covered" action={<Link className="source-link" href={`/topics?r=${id}`}>All {s.topics.length} topics</Link>} />
      <div className="card-grid">
        {ft.map((t) => <TopicCard key={t.id} t={t} reportId={id} />)}
        {Array.from({ length: 3 - ft.length }).map((_, i) => <EmptySlot key={i} what="topics" rule="Fewer than 3 topics were tagged — no padding." />)}
      </div>
      <div style={{ height: 40 }} />
      <SectionTitle eyebrow="Sponsors · 30 days" title="Sponsors & promoted brands" action={<Link className="source-link" href={`/sponsors?r=${id}`}>All brands</Link>} />
      <div className="card-grid">
        {fs.map((b, i) => <SponsorCard key={b.id} s={b} reportId={id} rank={i + 1} />)}
        {Array.from({ length: 3 - fs.length }).map((_, i) => <EmptySlot key={i} what="sponsors" rule="Fewer than 3 brands were promoted — no padding." />)}
      </div>
      <OpportunityBanner o={picks.opportunity} reportId={id} />
    </div>
  );
}
