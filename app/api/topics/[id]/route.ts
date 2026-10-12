import type { NextRequest } from "next/server";
import { getSignal } from "@/lib/server/signals-api";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return getSignal(req, "topics", (await ctx.params).id);
}
