import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseUser } from "@/lib/supabase/server";
import { apiError, rateLimit } from "@/lib/server/api";

const body = z.object({ email: z.string().email().max(200) });

/** Sends a Supabase magic link — only to ALLOWED_EMAIL (enforced server-side; no sign-ups). */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", "Enter a valid email address");
  if (!rateLimit(`login:${req.headers.get("x-forwarded-for") ?? "local"}`, 5, 10 * 60_000)) {
    return apiError(429, "rate_limited", "Too many attempts — try again in a few minutes");
  }
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();
  // Same response either way, so the endpoint does not reveal which address is allowed.
  if (allowed && email === allowed) {
    const sb = await supabaseUser();
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` } });
    if (error) return apiError(502, "auth_error", "Could not send the sign-in link right now — please retry shortly");
  }
  return NextResponse.json({ ok: true });
}
