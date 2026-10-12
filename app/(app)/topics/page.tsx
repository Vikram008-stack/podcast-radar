import { Directory, type DirItem } from "@/components/directory";
import { EmptyState, RankingMethod } from "@/components/ui";
import { getReport } from "@/lib/server/data";
import { formatIstShort, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const report = await getReport(r);
  const s = report?.snapshot;
  const q = r ? `?r=${r}` : "";
  const cats = [...new Set((s?.topics ?? []).map((t) => t.category ?? "Other"))].sort();
  const items: DirItem[] = (s?.topics ?? []).map((t) => ({
    id: t.id,
    href: `/topics/${t.id}${q}`,
    kind: "topic",
    name: t.name,
    sub: t.shows.join(", "),
    rank: t.rank,
    shows: t.distinctShows,
    primary: ["episodes", t.episodes],
    latest: t.referenceEpisodes[0]?.publishedAt ?? null,
    latestLabel: t.referenceEpisodes[0] ? formatIstShort(t.referenceEpisodes[0].publishedAt) : "—",
    inWeek: true,
    change: t.change,
    search: `${t.name} ${t.category ?? ""} ${t.shows.join(" ")}`.toLowerCase(),
    facets: ["all", t.category ?? "Other", ...(t.distinctShows >= 2 ? ["multi"] : []), ...(t.change === null ? ["new"] : [])],
  }));
  return (
    <div className="page directory">
      <header className="page-header">
        <p className="eyebrow">Topic directory · reporting week</p>
        <h1>What the ecosystem is talking about</h1>
        <p>Themes tagged on episodes published {s ? formatRange(s.periodStart, s.periodEnd) : "this week"}, compared with the week before. Counts per merged episode — never scores.</p>
      </header>
      <RankingMethod kind="topics" />
      {s ? (
        <Directory
          items={items}
          noun="topics"
          filters={{
            label: "Filter topics",
            options: [
              { value: "all", label: "All categories" },
              { value: "multi", label: "On 2+ shows" },
              { value: "new", label: "New this week" },
              ...cats.map((c) => ({ value: c, label: c })),
            ],
          }}
        />
      ) : (
        <EmptyState title="No brief yet">Run the first scan from Settings.</EmptyState>
      )}
    </div>
  );
}
