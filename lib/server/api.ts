import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, publicEdit } from "@/lib/env";
import { db, ownerId } from "@/lib/server/db";
import { currentUser, supabaseUser } from "@/lib/supabase/server";

/** Consistent error shape: { error: { code, message } } — never stack traces. */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export type Actor = { id: string; sb: SupabaseClient; signedIn: boolean };

/**
 * Who is calling: signed-in Aditya (RLS client), or — when PUBLIC_EDIT=true — any visitor acting on
 * Aditya's data through the server client (every query filters by owner_id). Otherwise null.
 */
export async function requireApiUser(): Promise<Actor | null> {
  const user = await currentUser();
  if (user) return { id: user.id, sb: await supabaseUser(), signedIn: true };
  if (publicEdit()) return { id: await ownerId(), sb: db(), signedIn: false };
  return null;
}

export function unauthorized() {
  return apiError(401, "unauthorized", "Sign in required");
}

/** Constant-time-ish comparison of the cron secret (Bearer header or ?secret=). */
export function cronAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

const buckets = new Map<string, number[]>();
/** Small in-memory sliding-window limiter (per serverless instance). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function pageParams(url: URL, defLimit = 50) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? defLimit) || defLimit));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return { limit, offset };
}
