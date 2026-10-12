import type { NextRequest } from "next/server";
import { getSignal } from "@/lib/server/signals-api";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return getSignal(req, "guests", (await ctx.params).id);
}
