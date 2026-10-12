"use client";

import { Repeat2, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, Badge, ChangePill } from "./ui";

export type DirItem = {
  id: string;
  href: string;
  kind: "guest" | "topic" | "sponsor";
  name: string;
  sub: string;
  rank: number;
  shows: number;
  primary: [string, number];
  latest: string | null; // ISO
  latestLabel: string;
  inWeek: boolean;
  change?: number | null;
  tag?: string;
  search: string;
  facets: string[];
  /** optional section key (see `groups`) */
  group?: string;
};

export type DirGroup = { key: string; label: string; note: string; empty: string; icon?: "rounds" | "single" };

export function Directory({
  items,
  filters,
  noun,
  groups,
}: {
  items: DirItem[];
  filters: { label: string; options: { value: string; label: string }[] };
  noun: string;
  groups?: DirGroup[];
}) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(filters.options[0]?.value ?? "all");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => (!needle || i.search.includes(needle)) && (f === "all" || i.facets.includes(f)));
  }, [items, q, f]);

  return (
    <>
      <div className="directory-tools">
        <label className="search large">
          <Search size={16} aria-hidden />
          <input placeholder={`Search ${noun}, shows, companies…`} aria-label={`Search ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="select" aria-label={filters.label} value={f} onChange={(e) => setF(e.target.value)}>
          {filters.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p style={{ margin: "-8px 0 16px", color: "var(--muted)", fontSize: 13 }}>
        Showing {list.length} of {items.length} {noun}
      </p>
      {list.length === 0 ? (
        <div className="empty">
          <h3>Nothing matches</h3>
          Try a different search or filter.
        </div>
      ) : (
        groups ? (
          groups.map((g) => {
            const inGroup = list.filter((i) => i.group === g.key);
            return (
              <section key={g.key} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 19, margin: "0 0 4px", letterSpacing: "-.02em" }}>
                  {g.icon === "rounds" ? <Repeat2 size={18} className="group-icon" aria-hidden /> : g.icon === "single" ? <UserRound size={18} className="group-icon" aria-hidden /> : null}
                  {g.label} <span style={{ color: "var(--muted)", fontWeight: 500 }}>· {inGroup.length}</span>
                </h2>
                <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>{g.note}</p>
                {inGroup.length ? <div className="directory-grid">{inGroup.map(card)}</div> : <div className="empty-slot" style={{ minHeight: 90 }}>{g.empty}</div>}
              </section>
            );
          })
        ) : (
          <div className="directory-grid">{list.map(card)}</div>
        )
      )}
    </>
  );
}

function card(i: DirItem) {
  return (
            <Link key={i.id} href={i.href} className="feature-card" style={{ padding: 20, gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {i.kind === "topic" ? (
                  <span className="avatar md tone-2" aria-hidden style={{ borderRadius: 14 }}>
                    #
                  </span>
                ) : (
                  <Avatar name={i.name} size="md" />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</strong>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.sub}</small>
                </div>
                <span className="row-index" style={{ width: "auto" }}>
                  #{i.rank}
                </span>
              </div>
              <div className="metric-row" style={{ margin: 0 }}>
                <span>
                  <strong>{i.shows}</strong>shows
                </span>
                <span>
                  <strong>{i.primary[1]}</strong>
                  {i.primary[0]}
                </span>
                <span>
                  <strong>{i.latestLabel}</strong>latest
                </span>
              </div>
              <div className="badge-line">
                {i.shows >= 2 ? <Badge tone="lavender">On {i.shows} shows</Badge> : <Badge tone="neutral">Single show</Badge>}
                {i.change !== undefined ? <ChangePill change={i.change ?? null} /> : null}
                {i.tag ? <Badge tone="blush">{i.tag}</Badge> : null}
              </div>
            </Link>
  );
}
