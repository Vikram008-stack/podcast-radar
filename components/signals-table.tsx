"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type SignalRow = { id: string; href: string; rank: number; name: string; sub: string; cols: [string, string][]; search: string };

const TAB_INFO = {
  guests: { label: "Guests", rule: "Distinct shows → appearances → latest appearance", window: "30 days" },
  topics: { label: "Topics", rule: "Distinct shows → episodes → change vs previous week", window: "7 days" },
  sponsors: { label: "Sponsors", rule: "Distinct shows → confirmed placements → latest placement", window: "30 days" },
} as const;

type Tab = keyof typeof TAB_INFO;

export function SignalsTable({ rows }: { rows: Record<Tab, SignalRow[]> }) {
  const [tab, setTab] = useState<Tab>("guests");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows[tab].filter((r) => !needle || r.search.includes(needle));
  }, [rows, tab, q]);

  return (
    <div className="overview-card">
      <div className="tabs" role="tablist" aria-label="Signal type">
        {(Object.keys(TAB_INFO) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {TAB_INFO[t].label} · {rows[t].length}
          </button>
        ))}
      </div>
      <div className="table-toolbar">
        <label className="search">
          <Search size={15} aria-hidden />
          <input aria-label={`Search ${TAB_INFO[tab].label.toLowerCase()}`} placeholder={`Search ${TAB_INFO[tab].label.toLowerCase()}, shows…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="badge neutral" style={{ alignSelf: "center" }}>
          Window · {TAB_INFO[tab].window}
        </span>
      </div>
      <div className="ranking-note">
        <span>
          <strong>Ranked by:</strong> {TAB_INFO[tab].rule}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="empty" style={{ padding: 30 }}>
          {rows[tab].length ? "No matches for that search." : `No ${TAB_INFO[tab].label.toLowerCase()} detected in this window yet.`}
        </p>
      ) : (
        list.slice(0, 60).map((r) => (
          <Link key={r.id} href={r.href} className="activity-row">
            <div className="activity-name">
              <span className="row-index">{String(r.rank).padStart(2, "0")}</span>
              <div style={{ minWidth: 0 }}>
                <strong>{r.name}</strong>
                <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{r.sub}</small>
              </div>
            </div>
            {r.cols.map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
            <span className="row-action" aria-hidden>
              <ChevronRight size={16} />
            </span>
          </Link>
        ))
      )}
    </div>
  );
}
