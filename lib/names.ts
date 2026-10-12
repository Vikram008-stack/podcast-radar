/** Guest name normalisation and alias resolution (pure, tested). */

const HONORIFICS = /\b(dr|mr|mrs|ms|miss|shri|sri|smt|prof|professor|ca|adv|sir|er|capt|col|gen)\b\.?/g;

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(ft|feat|featuring|with)\b\.?/g, " ")
    .replace(HONORIFICS, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** "Nithin Kamath" ≈ "Nitin Kamath"; "Kunal Shah" ≉ "Kunal Bahl". */
export function namesSimilar(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  if (ta.length !== tb.length || ta.length < 2) return false;
  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (levenshtein(lastA, lastB) > (lastA.length > 5 ? 1 : 0)) return false;
  for (let i = 0; i < ta.length - 1; i++) {
    if (ta[i][0] !== tb[i][0]) return false;
    if (levenshtein(ta[i], tb[i]) > (ta[i].length > 4 ? 2 : 1)) return false;
  }
  return true;
}

export function normalizeCompany(c: string | null | undefined): string {
  return (c ?? "")
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|inc|llp|technologies|ventures|capital|india|the|co|founder|ceo|cofounder|co founder|of|at)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Companies conflict only when both are known and share no significant token. */
export function companiesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = normalizeCompany(a);
  const cb = normalizeCompany(b);
  if (!ca || !cb) return false;
  if (ca.includes(cb) || cb.includes(ca)) return false;
  const sa = new Set(ca.split(" ").filter((w) => w.length > 2));
  return !cb.split(" ").some((w) => w.length > 2 && sa.has(w));
}

export type KnownGuest = { id: string; name: string; company: string | null; aliases: string[] };

export type Resolution =
  | { kind: "existing"; id: string; aliasToAdd: string | null }
  | { kind: "new"; needsReview: boolean; reviewNote: string | null };

/**
 * Resolve a mention to an existing guest:
 * exact normalised name/alias → same person; similar spelling + compatible company → same person
 * (alias recorded); similar spelling but conflicting company → new guest flagged for review.
 */
export function resolveGuest(name: string, company: string | null, known: KnownGuest[]): Resolution {
  const n = normalizePersonName(name);
  for (const g of known) {
    const all = [g.name, ...g.aliases].map(normalizePersonName);
    if (all.includes(n)) {
      if (companiesConflict(company, g.company)) {
        return { kind: "new", needsReview: true, reviewNote: `Same name as ${g.name} but different company (${company} vs ${g.company})` };
      }
      return { kind: "existing", id: g.id, aliasToAdd: null };
    }
  }
  for (const g of known) {
    if ([g.name, ...g.aliases].some((x) => namesSimilar(x, name))) {
      if (companiesConflict(company, g.company)) {
        return { kind: "new", needsReview: true, reviewNote: `Similar to ${g.name} but company differs (${company} vs ${g.company})` };
      }
      return { kind: "existing", id: g.id, aliasToAdd: name };
    }
  }
  return { kind: "new", needsReview: false, reviewNote: null };
}

/** Hosts are never guests. */
export function isHost(name: string, hosts: string[]): boolean {
  const n = normalizePersonName(name);
  return hosts.some((h) => {
    const nh = normalizePersonName(h);
    return !!nh && (nh === n || namesSimilar(nh, n) || (nh.split(" ").length === 1 && n.split(" ")[0] === nh && n.split(" ").length === 1));
  });
}
