import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/env";
import { db } from "@/lib/server/db";
import { ffmpegAvailable } from "@/lib/server/providers/audio";

/** Public liveness probe — reports configured integrations (booleans only) and DB reachability. */
export async function GET() {
  let database = false;
  try {
    const { error } = await db().from("topics").select("id", { head: true, count: "exact" }).limit(1);
    database = !error;
  } catch {
    database = false;
  }
  return NextResponse.json({
    ok: database,
    database,
    integrations: { ...Object.fromEntries(integrationStatus().map((i) => [i.key, i.configured])), audio_ffmpeg: await ffmpegAvailable() },
    time: new Date().toISOString(),
  });
}
