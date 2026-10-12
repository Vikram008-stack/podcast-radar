import "server-only";
import { redirect } from "next/navigation";
import { publicEdit, publicRead, sampleMode } from "@/lib/env";
import type { ReportSnapshot } from "@/lib/shared/types";
import { isFounderGuest } from "@/lib/scope";
import { db, ownerId } from "@/lib/server/db";
import { currentUser, supabaseUser } from "@/lib/supabase/server";

export type ReportRow = {
  id: string;
  period_start: string;
  period_end: string;
  version: number;
  status: string;
  generated_at: string | null;
  is_sample: boolean;
  snapshot: ReportSnapshot | null;
};

export type Viewer = { signedIn: boolean; canEdit: boolean };

/**
 * Page gate. Signed-in Aditya → full access. With PUBLIC_READ=true, anyone may *view* the brief
 * (read-only: no drafts, no settings changes, no scans). Otherwise → /login.
 */
export async function requirePageViewer(): Promise<Viewer> {
  const user = await currentUser();
  if (user) return { signedIn: true, canEdit: true };
  if (publicRead()) return { signedIn: false, canEdit: publicEdit() };
  redirect("/login");
}

/**
 * Reader for page data: the signed-in user's session (RLS) or, in public-read mode, the
 * server client scoped to the single owner. Every query filters by owner either way.
 */
async function reader() {
  const user = await currentUser();
  if (user) return { sb: await supabaseUser(), owner: user.id, signedIn: true };
  if (!publicRead()) throw new Error("Not signed in");
  return { sb: db(), owner: await ownerId(), signedIn: false };
}

const COLS = "id,period_start,period_end,version,status,generated_at,is_sample,snapshot";

/** Latest ready report (or a specific one); falls back to the in-progress one if none is ready. */
export async function getReport(id?: string | null): Promise<ReportRow | null> {
  const { sb, owner } = await reader();
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await sb.from("weekly_reports").select(COLS).eq("owner_id", owner).eq("id", id).eq("is_sample", sampleMode()).not("snapshot", "is", null).maybeSingle();
    return founderOnly((data as ReportRow | null) ?? null);
  }
  // Always the newest week; if it is still being completed the UI shows an "in progress" badge.
  const { data } = await sb.from("weekly_reports").select(COLS).eq("owner_id", owner).in("status", ["ready", "building"]).eq("is_sample", sampleMode()).not("snapshot", "is", null).order("period_start", { ascending: false }).limit(1).maybeSingle();
  return founderOnly((data as ReportRow | null) ?? null);
}

/** Guests = startup founders only (Aditya's guardrail); re-rank after filtering. */
function founderOnly(r: ReportRow | null): ReportRow | null {
  if (!r?.snapshot) return r;
  const guests = r.snapshot.guests.filter(isFounderGuest).map((g, i) => ({ ...g, rank: i + 1 }));
  return { ...r, snapshot: { ...r.snapshot, guests } };
}

export async function listReports(): Promise<Omit<ReportRow, "snapshot">[]> {
  const { sb, owner } = await reader();
  const { data } = await sb
    .from("weekly_reports")
    .select("id,period_start,period_end,version,status,generated_at,is_sample")
    .eq("owner_id", owner)
    .eq("is_sample", sampleMode())
    .order("period_start", { ascending: false })
    .limit(104);
  return (data ?? []) as Omit<ReportRow, "snapshot">[];
}

export type ScanState = { status: "ok" | "partial" | "failed" | "running" | "never"; label: string; at: string | null };

export async function lastScan(): Promise<ScanState> {
  const { sb, owner } = await reader();
  const { data } = await sb
    .from("ingestion_jobs")
    .select("status,started_at,finished_at,type")
    .eq("owner_id", owner)
    .eq("type", "weekly")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { status: "never", label: "No scan yet", at: null };
  if (data.status === "running") return { status: "running", label: "Scan running", at: data.started_at };
  if (data.status === "succeeded") return { status: "ok", label: "Weekly scan complete", at: data.finished_at };
  if (data.status === "partial") return { status: "partial", label: "Scan finished with gaps", at: data.finished_at };
  return { status: "failed", label: "Last scan failed", at: data.finished_at ?? data.started_at };
}

/** Drafts are Aditya's text — shown to visitors only when PUBLIC_EDIT=true. */
export async function getDraft(kind: "outreach" | "pitch", targetId: string) {
  const user = await currentUser();
  if (!user && !publicEdit()) return null;
  const { sb, owner } = await reader();
  const { data } = await sb.from("drafts").select("subject,body,updated_at,generated_by,status").eq("owner_id", owner).eq("kind", kind).eq("target_id", targetId).maybeSingle();
  return data as { subject: string; body: string; updated_at: string; generated_by: string | null; status: string } | null;
}

/** Settings page data (view-only for public viewers). */
export async function getSettingsData() {
  const { sb, owner } = await reader();
  const [pods, settings, jobs] = await Promise.all([
    sb
      .from("podcasts")
      .select("id,name,rss_url,youtube_channel_id,youtube_handle,spotify_show_id,apple_collection_id,artwork_url,host_names,house_brands,analyse_audio,min_episode_minutes,active,validation_status,validation_detail,last_success_at,last_attempt_at,last_error")
      .eq("owner_id", owner)
      .eq("is_sample", false)
      .order("name"),
    sb.from("app_settings").select("timezone,report_time,min_episode_minutes,last_manual_run_at").eq("owner_id", owner).maybeSingle(),
    sb.from("ingestion_jobs").select("id,type,trigger,status,started_at,finished_at,error_summary,provider_calls,period_key").eq("owner_id", owner).order("started_at", { ascending: false }).limit(8),
  ]);
  // per-show health: episodes found vs analysed in the 30-day window + newest episode (freshness)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: eps } = await sb.from("episodes").select("podcast_id,published_at,extraction_status").eq("owner_id", owner).eq("is_sample", false).gte("published_at", since).limit(3000);
  const health: Record<string, { found: number; processed: number; newest: string | null }> = {};
  for (const e of eps ?? []) {
    const h = (health[e.podcast_id] ??= { found: 0, processed: 0, newest: null });
    h.found++;
    if (e.extraction_status === "done") h.processed++;
    if (!h.newest || e.published_at > h.newest) h.newest = e.published_at;
  }
  return { pods: (pods.data ?? []).map((p) => ({ ...p, health: health[p.id] ?? { found: 0, processed: 0, newest: null } })), settings: settings.data, jobs: jobs.data ?? [] };
}

export type Impact = {
  episodesAnalysed: number;
  hoursSaved: number;
  outreach: Record<"draft" | "sent" | "replied" | "booked" | "declined", number>;
  pitches: Record<"draft" | "sent" | "replied" | "booked" | "declined", number>;
  /** status per draft, key = `${kind}:${targetId}` */
  statuses: Record<string, "draft" | "sent" | "replied" | "booked" | "declined">;
};

/** Impact over the last 30 days: work the radar did + what happened to outreach (Aditya's own tracking). */
export async function getImpact(): Promise<Impact> {
  const { sb, owner } = await reader();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [eps, drafts] = await Promise.all([
    sb.from("episodes").select("id", { count: "exact", head: true }).eq("owner_id", owner).eq("is_sample", false).eq("extraction_status", "done").gte("published_at", since),
    sb.from("drafts").select("kind,status,target_id").eq("owner_id", owner),
  ]);
  const blank = () => ({ draft: 0, sent: 0, replied: 0, booked: 0, declined: 0 });
  const outreach = blank();
  const pitches = blank();
  const statuses: Impact["statuses"] = {};
  for (const d of (drafts.data ?? []) as { kind: string; status: keyof ReturnType<typeof blank>; target_id: string }[]) {
    (d.kind === "pitch" ? pitches : outreach)[d.status ?? "draft"]++;
    statuses[`${d.kind}:${d.target_id}`] = d.status ?? "draft";
  }
  const episodesAnalysed = eps.count ?? 0;
  // ~6 min per episode to skim notes for guests, topics and sponsors by hand
  return { episodesAnalysed, hoursSaved: Math.round((episodesAnalysed * 6) / 6) / 10, outreach, pitches, statuses };
}
