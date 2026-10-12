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
        <h1>What the radar turned into 📈</h1>
        <p>Hours saved by the weekly scan, and what happened to every guest invite and sponsor pitch. Mark a status and the numbers update instantly.</p>
      </header>
      {s ? (
        <ImpactTracker
          episodesAnalysed={impact.episodesAnalysed}
          hoursSaved={impact.hoursSaved}
          initial={impact.statuses}
          guests={s.guests.slice(0, 20).map((g) => ({ id: g.id, name: g.name, sub: [g.role, g.company].filter(Boolean).join(" · ") || g.shows.join(", "), href: `/guests/${g.id}` }))}
          sponsors={[...s.sponsors, ...s.otherBrands].slice(0, 12).map((b) => ({ id: b.id, name: b.name, sub: b.shows.join(", "), href: `/sponsors/${b.id}` }))}
        />
      ) : (
        <EmptyState title="No brief yet">Impact appears after the first weekly scan.</EmptyState>
      )}
    </div>
  );
}
