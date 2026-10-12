import { Directory, type DirItem } from "@/components/directory";
import { EmptyState, RankingMethod } from "@/components/ui";
import { getReport } from "@/lib/server/data";
import { formatIstShort } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SponsorsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const report = await getReport(r);
  const s = report?.snapshot;
  const q = r ? `?r=${r}` : "";
  const all = [...(s?.sponsors ?? []), ...(s?.otherBrands ?? [])];
  const items: DirItem[] = all.map((b) => ({
    id: b.id,
    href: `/sponsors/${b.id}${q}`,
    kind: "sponsor",
    name: b.name,
    sub: b.shows.join(", "),
    rank: b.rank,
    shows: b.distinctShows,
    primary: b.confirmed ? ["confirmed", b.confirmed] : ["promoted eps", b.distinctEpisodes],
    latest: b.latestPlacement,
    latestLabel: b.latestPlacement ? formatIstShort(b.latestPlacement) : "—",
    inWeek: false,
    tag: b.confirmed ? undefined : `${b.affiliate ? "Promotion" : "Unverified"}${b.distinctEpisodes >= 2 ? ` · recurring ×${b.distinctEpisodes}` : ""}`,
    search: `${b.name} ${b.shows.join(" ")}`.toLowerCase(),
    facets: ["all", b.confirmed ? "confirmed" : "unconfirmed"],
  }));
  return (
    <div className="page directory">
      <header className="page-header">
        <p className="eyebrow">Sponsor directory · last 30 days</p>
        <h1>Who&apos;s paying for founder ears</h1>
        <p>
          Brands promoted in show notes, YouTube or Spotify descriptions, or spoken in the opening minutes of the audio. <strong>Confirmed</strong> means an explicit disclosure
          (&ldquo;sponsored by&rdquo;, &ldquo;brought to you by&rdquo;, &ldquo;#ad&rdquo;…) is in the stored evidence. A show&apos;s own brands are excluded. No ad-spend estimates.
        </p>
      </header>
      <RankingMethod kind="sponsors" />
      {s ? (
        <Directory
          items={items}
          noun="brands"
          filters={{
            label: "Filter brands",
            options: [
              { value: "all", label: "All promotions" },
              { value: "confirmed", label: "Confirmed sponsorships" },
              { value: "unconfirmed", label: "Promotion & unverified" },
            ],
          }}
        />
      ) : (
        <EmptyState title="No brief yet">Run the first scan from Settings.</EmptyState>
      )}
    </div>
  );
}
