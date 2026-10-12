import { ImpactTracker } from "@/components/impact-tracker";
import { EmptyState } from "@/components/ui";
import { getImpact, getReport } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const [report, impact] = await Promise.all([getReport(), getImpact()]);
  const s = report?.snapshot;
  return (
    <div className="page directory">
      <header className="page-header">
        <p className="eyebrow">Impact · last 30 days</p>
        <h1>Where to focus this week</h1>
        <p>The brief points at three things: who to book, what to put in the content calendar, and which sponsors to pitch. Track each one here and the numbers update instantly.</p>
      </header>
      {s ? (
        <ImpactTracker
          episodesAnalysed={impact.episodesAnalysed}
          hoursSaved={impact.hoursSaved}
          initial={impact.statuses}
          rows={{
            outreach: s.guests.slice(0, 20).map((g) => ({ id: g.id, name: g.name, sub: [g.role, g.company].filter(Boolean).join(" · ") || g.shows.join(", "), href: `/guests/${g.id}` })),
            topic: s.topics.slice(0, 12).map((t) => ({ id: t.id, name: t.name, sub: `${t.episodes} episodes · ${t.distinctShows} shows · ${t.change === null ? "new this week" : `${t.change > 0 ? "+" : ""}${Math.round(t.change * 100)}% vs last week`}`, href: `/topics/${t.id}` })),
            pitch: [...s.sponsors, ...s.otherBrands].slice(0, 12).map((b) => ({ id: b.id, name: b.name, sub: `${b.confirmed ? "Confirmed sponsor" : "Featured brand"} · ${b.shows.join(", ")}`, href: `/sponsors/${b.id}` })),
          }}
        />
      ) : (
        <EmptyState title="No brief yet">Impact appears after the first weekly scan.</EmptyState>
      )}
    </div>
  );
}
