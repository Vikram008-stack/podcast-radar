import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, pageParams, rateLimit, requireApiUser, unauthorized } from "@/lib/server/api";
import { getReport } from "@/lib/server/data";
import { generateDraft } from "@/lib/server/drafts";
import type { GuestSignal, ReportSnapshot, SponsorSignal, TopicSignal } from "@/lib/shared/types";

type Kind = "guests" | "topics" | "sponsors";

function pick(s: ReportSnapshot, kind: Kind): (GuestSignal | TopicSignal | SponsorSignal)[] {
  if (kind === "sponsors") return [...s.sponsors, ...s.otherBrands];
  return s[kind];
}

/** GET list: ?report=<id>&q=<search>&limit&offset — reads the frozen snapshot (RLS via user session). */
export async function listSignals(req: NextRequest, kind: Kind) {
  if (!(await requireApiUser())) return unauthorized();
  const report = await getReport(req.nextUrl.searchParams.get("report"));
  if (!report?.snapshot) return apiError(404, "no_report", "No brief available yet");
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  const { limit, offset } = pageParams(req.nextUrl);
  const all = pick(report.snapshot, kind).filter((x) => !q || x.name.toLowerCase().includes(q));
  return NextResponse.json({
    report: { id: report.id, periodStart: report.period_start, periodEnd: report.period_end, status: report.status },
    total: all.length,
    limit,
    offset,
    items: all.slice(offset, offset + limit),
  });
}

export async function getSignal(req: NextRequest, kind: Kind, id: string) {
  if (!(await requireApiUser())) return unauthorized();
  const report = await getReport(req.nextUrl.searchParams.get("report"));
  const item = report?.snapshot ? pick(report.snapshot, kind).find((x) => x.id === id) : null;
  if (!report || !item) return apiError(404, "not_found", "Not found in this brief");
  return NextResponse.json({ report: { id: report.id, status: report.status }, item });
}

const draftBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), reportId: z.string().uuid().optional() }),
  z.object({ action: z.literal("save"), reportId: z.string().uuid().optional(), subject: z.string().max(200), body: z.string().max(5000) }),
  z.object({ action: z.literal("status"), reportId: z.string().uuid().optional(), status: z.enum(["draft", "sent", "replied", "booked", "declined"]) }),
]);

/** POST draft: { action: "generate" } (AI, rate-limited) or { action: "save", subject, body }. */
export async function draftRoute(req: NextRequest, kind: "outreach" | "pitch", id: string) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const parsed = draftBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", "Invalid draft request");
  const sb = user.sb;
  if (parsed.data.action === "status") {
    const { data, error } = await sb
      .from("drafts")
      .upsert({ owner_id: user.id, kind, target_id: id, status: parsed.data.status, status_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,target_id" })
      .select("subject,body,updated_at,status")
      .single();
    if (error) return apiError(500, "db_error", "Could not save the status");
    return NextResponse.json({ draft: data });
  }
  if (parsed.data.action === "save") {
    const { data, error } = await sb
      .from("drafts")
      .upsert({ owner_id: user.id, kind, target_id: id, subject: parsed.data.subject, body: parsed.data.body, updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,target_id" })
      .select("subject,body,updated_at,status")
      .single();
    if (error) return apiError(500, "db_error", "Could not save the draft");
    return NextResponse.json({ draft: data });
  }
  if (!rateLimit(`draft:${user.id}`, 6, 10 * 60_000)) return apiError(429, "rate_limited", "Draft generation is limited to 6 per 10 minutes");
  const report = await getReport(parsed.data.reportId);
  const snap = report?.snapshot;
  const target = snap ? (kind === "outreach" ? snap.guests.find((g) => g.id === id) : [...snap.sponsors, ...snap.otherBrands].find((s) => s.id === id)) : null;
  if (!target) return apiError(404, "not_found", "Not found in this brief");
  try {
    const d = await generateDraft(kind, target, user.id);
    const { data, error } = await sb
      .from("drafts")
      .upsert({ owner_id: user.id, kind, target_id: id, subject: d.subject, body: d.body, generated_by: d.generated_by, updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,target_id" })
      .select("subject,body,updated_at")
      .single();
    if (error) return apiError(500, "db_error", "Draft generated but could not be saved");
    return NextResponse.json({ draft: data });
  } catch (e) {
    return apiError(503, "ai_unavailable", e instanceof Error ? e.message : "AI unavailable");
  }
}
