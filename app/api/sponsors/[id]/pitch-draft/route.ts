import type { NextRequest } from "next/server";
import { draftRoute } from "@/lib/server/signals-api";

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return draftRoute(req, "pitch", (await ctx.params).id);
}
