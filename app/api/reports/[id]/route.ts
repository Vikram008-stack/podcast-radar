import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireApiUser, unauthorized } from "@/lib/server/api";
import { getReport } from "@/lib/server/data";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireApiUser())) return unauthorized();
  const report = await getReport((await ctx.params).id);
  if (!report) return apiError(404, "not_found", "Report not found");
  return NextResponse.json({ report });
}
