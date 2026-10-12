import { NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/server/api";
import { listReports } from "@/lib/server/data";

export async function GET() {
  if (!(await requireApiUser())) return unauthorized();
  return NextResponse.json({ items: await listReports() });
}
