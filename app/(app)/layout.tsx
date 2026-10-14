import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { sampleMode } from "@/lib/env";
import { getReport, requirePageViewer } from "@/lib/server/data";
import { formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePageViewer();
  const [report, jar] = await Promise.all([getReport(), cookies()]);
  return (
    <Shell
      period={report ? formatRange(report.period_start, report.period_end) : null}
      sample={sampleMode() && !!report}
      signedIn={viewer.signedIn || viewer.canEdit}
      initialCollapsed={jar.get("radar_collapsed")?.value === "1"}
    >
      {children}
    </Shell>
  );
}
