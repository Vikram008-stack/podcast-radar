import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, requireApiUser, unauthorized } from "@/lib/server/api";

const body = z.object({ status: z.enum(["draft", "planned", "recorded", "published"]) });

/** Content calendar: mark a topic Planned / Recorded / Published ("draft" = not planned). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "bad_request", "Invalid topic id");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", "Invalid status");
  const { data, error } = await user.sb
    .from("drafts")
    .upsert({ owner_id: user.id, kind: "topic", target_id: id, status: parsed.data.status, status_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,target_id" })
    .select("status")
    .single();
  if (error) return apiError(500, "db_error", "Could not save");
  return NextResponse.json({ topic: { id, status: data.status } });
}
