import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

/** Supabase client bound to the signed-in user's cookies (RLS applies). */
export async function supabaseUser() {
  const cookieStore = await cookies();
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Returns the signed-in, allowed user or null. */
export async function currentUser() {
  const sb = await supabaseUser();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || user.email?.toLowerCase() !== allowed) return null;
  return user;
}
