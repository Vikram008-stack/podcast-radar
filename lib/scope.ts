/**
 * Content guardrail (Aditya, 12 Oct 2026): the radar covers INDEPENDENT INDIAN STARTUPS AND THEIR
 * FOUNDERS. Guests outside that space (athletes, actors, academics, foreign executives, …) are
 * never stored; topics are only counted from in-scope episodes.
 */
export const GUEST_TYPES = ["startup_founder", "startup_investor", "operator_or_expert", "other"] as const;
export type GuestType = (typeof GUEST_TYPES)[number];

/** Guest types that may appear in the brief (founders first; investors who back Indian startups). */
export const ALLOWED_GUEST_TYPES: readonly GuestType[] = ["startup_founder"]; // founders ONLY (Aditya, 12 Oct 2026)

/** Display gate for stored guests: the stated role must say founder / co-founder. */
export function isFounderGuest(g: { role: string | null; history?: { roleAsStated: string | null }[] }): boolean {
  const text = [g.role, ...(g.history ?? []).map((h) => h.roleAsStated)].filter(Boolean).join(" ");
  return /\bfounder\b|\bco-?\s?founder\b/i.test(text);
}

export function guestInScope(g: { guest_type: GuestType; india_startup_link: boolean }): boolean {
  return g.india_startup_link && ALLOWED_GUEST_TYPES.includes(g.guest_type);
}

export const SCOPE_RULE = `SCOPE GUARDRAIL — this brief is ONLY about independent Indian startups and their founders (businesses built in or for India, before or beyond social-media fame).
- in_scope = true only if the episode is substantially about building, funding or running a startup/company in India, or a founder's journey. Celebrity, sports, health, self-help, politics, spy/crime, spirituality or general-interest episodes are in_scope = false even on a business show.
- guest_type: "startup_founder" (founder / co-founder / founder-CEO of a startup or new-age company), "startup_investor" (VC, angel, fund partner who backs startups), "operator_or_expert" (executive, consultant, academic, author), "other" (athlete, actor, creator, politician, scientist, etc.).
- india_startup_link = true only if the guest's company/fund operates in or invests in India (Indian diaspora founders building for India count; foreign executives with no India startup link do not).`;
