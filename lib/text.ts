/** Pure text helpers shared by pipeline + tests (no server deps). */
import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Strip HTML safely to plain text (no DOM, no script execution). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Lowercase, strip punctuation/emoji/episode numbering for fuzzy title matching. */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(ep|episode|e)\s*\.?\s*\d+\b/g, " ")
    .replace(/#\d+/g, " ")
    .replace(/\b(full episode|podcast|official|video|audio)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(" ").filter((w) => w.length > 2));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Close title match: Jaccard ≥ 0.6 or one normalized title contains the other. */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 20 && nb.length > 20 && (na.includes(nb) || nb.includes(na))) return true;
  return jaccard(tokenSet(a), tokenSet(b)) >= 0.6;
}

export function truncateWords(s: string, max = 25): string {
  const words = s.trim().split(/\s+/);
  return words.length <= max ? s.trim() : words.slice(0, max).join(" ") + "…";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Loose containment check used to verify that an AI-quoted excerpt really exists in the source text. */
export function excerptInText(excerpt: string, text: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[‘’“”"'`]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const e = norm(excerpt);
  if (e.length < 3) return false;
  return norm(text).includes(e);
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Pick a ≤ maxWords window of `text` that contains the first match of `focus` (e.g. a disclosure
 * phrase) so the stored evidence still contains the matched text after truncation.
 */
export function focusWindow(text: string, focus: RegExp | null, maxWords = 25): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  let start = 0;
  if (focus) {
    const m = focus.exec(text);
    if (m) {
      const before = text.slice(0, m.index).trim();
      const pos = before ? before.split(/\s+/).length : 0;
      start = Math.max(0, Math.min(pos - 6, words.length - maxWords));
    }
  }
  return (start > 0 ? "…" : "") + words.slice(start, start + maxWords).join(" ") + (start + maxWords < words.length ? "…" : "");
}

const PROMO_LINE =
  /(sponsor|brought to you|presented by|powered by|partner|in association|collaborat|delivered by|supported by|thanks to|\bcode\b|coupon|offer|discount|% off|download|check ?out|sign up|signup|visit |register|install|use (the )?link|https?:\/\/|#ad\b|प्रायोजित)/i;

/**
 * What Gemini sees of a long description: the opening (guest + topic context) plus EVERY line that
 * looks promotional — sponsor reads usually sit near the end of show notes / YouTube descriptions,
 * so a plain prefix cut would miss them.
 */
export function promoAwareExcerpt(text: string, cap = 3000, head = 900): string {
  if (text.length <= cap) return text;
  const opening = text.slice(0, head);
  const rest = text.slice(head).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const promo: string[] = [];
  let used = opening.length;
  for (const line of rest) {
    if (!PROMO_LINE.test(line) || seen.has(line)) continue;
    seen.add(line);
    const l = line.slice(0, 300);
    if (used + l.length + 1 > cap) break;
    promo.push(l);
    used += l.length + 1;
  }
  return promo.length ? `${opening}\n…\n${promo.join("\n")}` : opening;
}
