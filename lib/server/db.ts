import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

/** Retries only when no HTTP response arrived (DNS/connection drop) — never on HTTP errors. */
async function retryingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
    }
  }
  throw last;
}

/** Service-role client. Server-only; bypasses RLS — always filter by owner_id. */
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: retryingFetch },
    });
  }
  return admin;
}

/** Throws on a Supabase error, returns data otherwise. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no data`);
  return res.data as NonNullable<T>;
}

let ownerCache: string | null = null;

/** The single owner (Aditya). Created on first use with no password (email sign-in only). */
export async function ownerId(): Promise<string> {
  if (ownerCache) return ownerCache;
  const email = requireEnv("ALLOWED_EMAIL").trim().toLowerCase();
  const sb = db();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return (ownerCache = hit.id);
    if (data.users.length < 200) break;
  }
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`auth.createUser: ${error?.message}`);
  return (ownerCache = data.user.id);
}

/** Throws on a Supabase error (for writes that return no rows). */
export function check(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}
