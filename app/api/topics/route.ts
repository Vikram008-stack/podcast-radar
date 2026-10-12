import type { NextRequest } from "next/server";
import { listSignals } from "@/lib/server/signals-api";

export async function GET(req: NextRequest) {
  return listSignals(req, "topics");
}
