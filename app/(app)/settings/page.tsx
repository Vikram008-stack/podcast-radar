import { SettingsClient, type JobView, type PodcastView } from "@/components/settings-client";
import { getSettingsData, requirePageViewer } from "@/lib/server/data";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requirePageViewer();
  const { pods, settings, jobs } = await getSettingsData();
  return (
    <div className="page directory">
      <SettingsClient
        podcasts={pods as PodcastView[]}
        settings={settings ?? { timezone: "Asia/Kolkata", report_time: "06:00", min_episode_minutes: 20, last_manual_run_at: null }}
        jobs={jobs as JobView[]}
        now={nowMs()}
        canEdit={viewer.canEdit}
      />
    </div>
  );
}
