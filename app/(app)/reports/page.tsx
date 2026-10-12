import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { listReports } from "@/lib/server/data";
import { formatIst, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await listReports();
  return (
    <div className="page directory">
      <header className="page-header">
        <p className="eyebrow">Archive</p>
        <h1>Past weekly briefs</h1>
        <p>Each Monday&apos;s brief is a frozen snapshot — later scans never rewrite a finished issue.</p>
      </header>
      {reports.length === 0 ? (
        <EmptyState title="No briefs yet">The first brief appears after the first scan.</EmptyState>
      ) : (
        <div className="overview-card">
          {reports.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="activity-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 40px" }}>
              <div className="activity-name">
                <span className="avatar tone-0" aria-hidden style={{ borderRadius: 12 }}>
                  <FileText size={17} />
                </span>
                <div>
                  <strong>Issue {r.version}</strong>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{formatRange(r.period_start, r.period_end)}</small>
                </div>
              </div>
              <div>
                <small>Status</small>
                <span>{r.status === "ready" ? <Badge tone="sage">Ready</Badge> : <Badge tone="sand">In progress</Badge>}</span>
              </div>
              <div>
                <small>Generated</small>
                <strong>{formatIst(r.generated_at)}</strong>
              </div>
              <span className="row-action" aria-hidden>
                <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
