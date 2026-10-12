import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = await supabaseUser();
  await sb.auth.signOut();
  return NextResponse.redirect(`${req.nextUrl.origin}/login`, { status: 303 });
}
