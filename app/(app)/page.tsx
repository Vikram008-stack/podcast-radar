import { ArrowRight, Banknote, CalendarDays, Clock, Flame, Hourglass, Mic } from "lucide-react";
import { EmptySlot, GuestCard, OpportunityBanner, SponsorCard, TopicCard } from "@/components/cards";
import { SignalsTable, type SignalRow } from "@/components/signals-table";
import { Badge, Button, EmptyState, RankingMethod, SectionTitle } from "@/components/ui";
import { topPicks } from "@/lib/top-picks";
import { getReport } from "@/lib/server/data";
import { formatIstDate, formatIstShort, formatIstWeekday, formatRange, istParts } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const report = await getReport();
  if (!report?.snapshot) {
    return (
      <div className="page">
        <section className="hero">
          <div className="hero-copy">
            <Badge tone="lavender">Weekly intelligence brief</Badge>
<h1 className="radar-title">
              <span className="mic" aria-hidden>🎙️</span> Podcast <em>Radar</em>
              <span className="pulse-ring" aria-hidden>📡</span>
            </h1>
            <p>Your first brief appears after the first scan. Scans run every Monday at 06:00 IST, or start one now.</p>
          </div>
        </section>
        <EmptyState title="No brief yet" action={<Button href="/settings" variant="primary">Run the first scan</Button>}>
          Configure your shows in Settings, then run a scan. Nothing here is ever filled with demo data.
        </EmptyState>
      </div>
    );
  }
  const s = report.snapshot;
  const rid = undefined; // latest report → canonical URLs without ?r=
  const picks = topPicks(s);
  const fg = picks.guests;
  const ft = picks.topics;
  const fs = picks.sponsors;
  const gen = new Date(report.generated_at ?? s.generatedAt);
  const p = istParts(gen);
  const updated = `Updated ${formatIstWeekday(gen)} · ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} IST`;
  const building = report.status !== "ready";

  const rows: Record<"guests" | "topics" | "sponsors", SignalRow[]> = {
    guests: s.guests.map((g) => ({
      id: g.id,
      href: `/guests/${g.id}`,
      rank: g.rank,
      name: g.name,
      sub: [g.role, g.company].filter(Boolean).join(" · ") || g.shows.join(", "),
      cols: [["Shows", String(g.distinctShows)], ["Appearances", String(g.appearances)], ["Latest", formatIstShort(g.latestAppearance)]],
      search: `${g.name} ${g.company ?? ""} ${g.shows.join(" ")} ${g.aliases.join(" ")}`.toLowerCase(),
    })),
    topics: s.topics.map((t) => ({
      id: t.id,
      href: `/topics/${t.id}`,
      rank: t.rank,
      name: t.name,
      sub: t.shows.join(", "),
      cols: [["Shows", String(t.distinctShows)], ["Episodes", String(t.episodes)], ["Change", t.change === null ? "New" : `${Math.round(t.change * 100)}%`]],
      search: `${t.name} ${t.shows.join(" ")}`.toLowerCase(),
    })),
    sponsors: [...s.sponsors, ...s.otherBrands].map((b, i) => ({
      id: b.id,
      href: `/sponsors/${b.id}`,
      rank: i + 1,
      name: b.name,
      sub: `${b.distinctShows === 1 ? "1 show" : `${b.distinctShows} shows`}: ${b.shows.join(", ")}`,
      cols: [["Sponsored episodes", String(b.confirmed)], ["Promoted episodes", String(b.affiliate + b.probable)], ["Latest", b.latestPlacement ? formatIstShort(b.latestPlacement) : "—"]],
      search: `${b.name} ${b.shows.join(" ")}`.toLowerCase(),
    })),
  };

  return (
    <div className="page">
      <section className="hero compact">
        <div className="hero-copy">
          <div className="badge-line">
            <Badge tone="lavender">Weekly Intelligence Brief · Issue {report.version}</Badge>
            {building ? (
              <Badge tone="sand">
                <Hourglass size={12} /> In progress — some episodes still being analysed
              </Badge>
            ) : null}
          </div>
<h1 className="radar-title">
            <span className="mic" aria-hidden>🎙️</span> Podcast <em>Radar</em>
            <span className="pulse-ring" aria-hidden>📡</span>
          </h1>
          <p>Who to book 👀 · what&apos;s trending 🔥 · who&apos;s paying 💸 — fresh every Monday ✨</p>
          <div className="report-meta">
            <span>
              <CalendarDays size={14} aria-hidden /> {formatRange(s.periodStart, s.periodEnd)}
            </span>
            <span>
              <Clock size={14} aria-hidden /> {updated}
            </span>
            <span>
              {s.stats.episodesIn30d} episodes from {s.sources.filter((x) => x.status !== "inactive").length} shows in the last 30 days
            </span>
          </div>
        </div>
        <aside className="glance" aria-label="This week at a glance">
          <p className="eyebrow" style={{ margin: 0 }}>This week at a glance</p>
          {[
            [<Mic key="m" size={17} strokeWidth={1.8} />, "Top founder", picks.guests[0]?.name, picks.guests[0] ? `/guests/${picks.guests[0].id}` : "/guests", picks.guests[0]?.company],
            [<Flame key="f" size={17} strokeWidth={1.8} />, "Hot topic", picks.topics[0]?.name, picks.topics[0] ? `/topics/${picks.topics[0].id}` : "/topics", picks.topics[0] ? `${picks.topics[0].distinctShows} shows · ${picks.topics[0].episodes} episodes` : null],
            [<Banknote key="b" size={17} strokeWidth={1.8} />, "Top brand", picks.sponsors[0]?.name, picks.sponsors[0] ? `/sponsors/${picks.sponsors[0].id}` : "/sponsors", picks.sponsors[0]?.confirmed ? "confirmed sponsor" : "featured brand"],
          ].map(([emoji, label, name, href, sub]) => (
            <a key={label as string} href={href as string} className="glance-row">
              <span className="glance-emoji" aria-hidden>{emoji as React.ReactNode}</span>
              <span style={{ minWidth: 0 }}>
                <small>{label}</small>
                <strong>{(name as string) ?? "—"}</strong>
                {sub ? <em>{sub as string}</em> : null}
              </span>
              <ArrowRight size={14} aria-hidden />
            </a>
          ))}
        </aside>
      </section>

      <section className="content-section overview">
        <SectionTitle eyebrow="Everything we saw" title="All ranked signals" sub={`${s.stats.episodesIn30d} episodes · ${s.stats.newsArticles} Indian startup news articles`} />
        <SignalsTable rows={rows} />
      </section>

      <section className="content-section">
        <SectionTitle
          eyebrow="Guest intelligence · 30 days"
          title="Guests to watch"
          sub="Guests seen on monitored shows in the last 30 days — people on several shows rank first. Easiest to book now."
          action={<Button href="/guests">View all {s.guests.length} guests <ArrowRight size={14} /></Button>}
        />
        <RankingMethod kind="guests" />
        <div className="card-grid">
          {fg.map((g) => (
            <GuestCard key={g.id} g={g} reportId={rid} />
          ))}
          {Array.from({ length: 3 - fg.length }).map((_, i) => (
            <EmptySlot key={i} what="guests" rule={fg.length === 0 ? "No guest appeared on a monitored show in the last 30 days." : "Fewer than 3 guests qualified — no padding."} />
          ))}
        </div>
      </section>

      <section className="soft-zone">
        <SectionTitle
          eyebrow={`Topic intelligence · ${formatIstShort(s.periodStart)} – ${formatIstDate(s.periodEnd)}`}
          title="Topics the shows covered"
          sub="Ride the wave or counter-programme — themes on the most shows rank first. Counts, not scores."
          action={<Button href="/topics">View all {s.topics.length} topics <ArrowRight size={14} /></Button>}
        />
        <RankingMethod kind="topics" />
        <div className="card-grid">
          {ft.map((t) => (
            <TopicCard key={t.id} t={t} reportId={rid} />
          ))}
          {Array.from({ length: 3 - ft.length }).map((_, i) => (
            <EmptySlot key={i} what="topics" rule="Fewer than 3 topics were tagged this week — no padding." />
          ))}
        </div>
      </section>

      <section className="content-section">
        <SectionTitle
          eyebrow="Sponsor intelligence · 30 days"
          title="Brands spending on founder audiences"
          sub="Confirmed sponsors first, then recurring promotions — from show notes, descriptions or the audio."
          action={<Button href="/sponsors">View all sponsors <ArrowRight size={14} /></Button>}
        />
        <RankingMethod kind="sponsors" />
        <div className="card-grid">
          {fs.map((b) => (
            <SponsorCard key={b.id} s={b} reportId={rid} rank={fs.indexOf(b) + 1} />
          ))}
          {Array.from({ length: 3 - fs.length }).map((_, i) => (
            <EmptySlot key={i} what="sponsors" rule="Fewer than 3 brands were promoted in the last 30 days — no padding." />
          ))}
        </div>
      </section>

      <OpportunityBanner o={picks.opportunity} reportId={rid} />
    </div>
  );
}
