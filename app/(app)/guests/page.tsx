import { Directory, type DirGroup, type DirItem } from "@/components/directory";

const GUEST_GROUPS: DirGroup[] = [
  { key: "single", label: "Single-show founders", icon: "single", note: "Seen on one monitored show — good fallbacks, ranked by recency.", empty: "No single-show founders in this window." },
  { key: "multi", label: "Doing media rounds", icon: "rounds", note: "Founders seen on 2 or more monitored shows in the last 30 days — easiest to book now.", empty: "No founder appeared on 2+ monitored shows in the last 30 days. Counts are never padded." },
];
import { EmptyState, RankingMethod } from "@/components/ui";
import { getReport } from "@/lib/server/data";
import { formatIstShort, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const report = await getReport(r);
  const s = report?.snapshot;
  const q = r ? `?r=${r}` : "";
  const items: DirItem[] = (s?.guests ?? []).map((g) => {
    const inWeek = g.history.some((h) => +new Date(h.episode.publishedAt) >= +new Date(s!.periodStart));
    return {
      id: g.id,
      href: `/guests/${g.id}${q}`,
      kind: "guest",
      name: g.name,
      sub: [g.role, g.company].filter(Boolean).join(" · ") || g.shows.join(", "),
      rank: g.rank,
      shows: g.distinctShows,
      primary: ["appearances", g.appearances],
      latest: g.latestAppearance,
      latestLabel: formatIstShort(g.latestAppearance),
      inWeek,
      group: g.distinctShows >= 2 ? "multi" : "single",
      search: `${g.name} ${g.company ?? ""} ${g.role ?? ""} ${g.shows.join(" ")} ${g.aliases.join(" ")}`.toLowerCase(),
      facets: ["all", ...(inWeek ? ["week"] : []), ...(g.distinctShows >= 2 ? ["multi"] : [])],
    };
  });
  return (
    <div className="page directory">
      <header className="page-header">
        <p className="eyebrow">Guest directory · last 30 days</p>
        <h1>Who&apos;s doing the rounds</h1>
        <p>Every guest found on a monitored show{s ? ` between ${formatRange(s.window30Start, s.periodEnd)}` : ""}. Hosts are excluded; each appearance links to its evidence.</p>
      </header>
      <RankingMethod kind="guests" />
      {s ? (
        <Directory
          items={items}
          noun="guests"
          groups={GUEST_GROUPS}
          filters={{
            label: "Filter guests",
            options: [
              { value: "all", label: "Last 30 days" },
              { value: "week", label: "Appeared this week" },
              { value: "multi", label: "On 2+ shows" },
            ],
          }}
        />
      ) : (
        <EmptyState title="No brief yet">Run the first scan from Settings.</EmptyState>
      )}
    </div>
  );
}
