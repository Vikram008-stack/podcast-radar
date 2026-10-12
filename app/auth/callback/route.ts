import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

/** Magic-link landing: exchanges the PKCE code (or token_hash) for a session, then enforces ALLOWED_EMAIL. */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const sb = await supabaseUser();
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (!ok) return NextResponse.redirect(`${origin}/login?error=link`);
  const { data } = await sb.auth.getUser();
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || data.user?.email?.toLowerCase() !== allowed) {
    await sb.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=denied`);
  }
  return NextResponse.redirect(`${origin}/`);
}
