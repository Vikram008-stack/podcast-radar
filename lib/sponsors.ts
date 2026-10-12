import type { SponsorClass } from "@/lib/shared/types";

/**
 * Sponsorship classification — rules first, AI second.
 * "confirmed" requires a rule-matched disclosure phrase in the stored evidence text.
 */
export const DISCLOSURE_RULES: { id: string; re: RegExp }[] = [
  { id: "sponsored by", re: /\bsponsored\s+by\b/i },
  { id: "brought to you by", re: /\bbrought\s+to\s+you\s+by\b/i },
  { id: "presented by", re: /\bpresented\s+by\b/i },
  { id: "powered by", re: /\bpowered\s+by\b/i },
  { id: "in association with", re: /\bin\s+association\s+with\b/i },
  { id: "in partnership with", re: /\bin\s+partnership\s+with\b/i },
  { id: "delivered by", re: /\bdelivered\s+by\b/i },
  { id: "supported by", re: /\bsupported\s+by\b/i },
  { id: "in collaboration with", re: /\bin\s+collaboration\s+with\b/i },
  { id: "#ad", re: /(^|\s)#ad\b/i },
  { id: "paid partnership", re: /\bpaid\s+partnership\b/i },
  { id: "today's sponsor", re: /\b(today'?s|this\s+episode'?s|our)\s+sponsor\b/i },
  // Spoken Hindi / Hinglish disclosures
  { id: "sponsor kiya (hinglish)", re: /\bsponsor(ed)?\s+(kiya|kar\s+rah[ae]|kar\s+rahi)\b/i },
  { id: "ke sponsor hain (hinglish)", re: /\b(episode|video|show)\s+ke\s+sponsor\b/i },
  { id: "ke saath partnership (hinglish)", re: /\bke\s+saath\s+(paid\s+)?partnership\b/i },
  { id: "द्वारा प्रायोजित (hindi)", re: /(द्वारा\s*प्रायोजित|प्रायोजक|स्पॉन्सर(\s*किया)?)/ },
];

export const AFFILIATE_RULES: { id: string; re: RegExp }[] = [
  { id: "use code", re: /\buse\s+(the\s+)?(promo\s+|coupon\s+|discount\s+)?code\b/i },
  { id: "promo/coupon code", re: /\b(promo|coupon|discount|referral)\s+code\b/i },
  { id: "code XYZ for off", re: /\bcode\s+[A-Z0-9]{3,}\b.*\b(off|discount)\b/ },
  { id: "with code XYZ", re: /\b(?:with|apply|enter)\s+(?:the\s+)?code\s*:?\s*[A-Z0-9]{4,}\b/ },
  { id: "referral/affiliate link", re: /\b(referral|affiliate)\s+link\b/i },
  { id: "tracked link", re: /https?:\/\/[^\s]*([?&](ref|utm_source|aff|affiliate|via)=|\b(bit\.ly|tinyurl\.com|rb\.gy|cutt\.ly|shorturl\.at|t\.ly|bit\.do|linktr\.ee)\/)/i },
];

export function matchDisclosure(text: string): string | null {
  return DISCLOSURE_RULES.find((r) => r.re.test(text))?.id ?? null;
}

export function matchAffiliate(text: string): string | null {
  return AFFILIATE_RULES.find((r) => r.re.test(text))?.id ?? null;
}

/** "Zerodha Pvt. Ltd." → "zerodha" */
export function normalizeBrand(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(com|in|io|ai|co)\b/g, "")
    .replace(/\b(pvt|private|ltd|limited|inc|llp|technologies|technology|india)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isHouseBrand(brand: string, houseBrands: string[]): boolean {
  const b = normalizeBrand(brand);
  if (!b) return false;
  return houseBrands.some((h) => {
    const n = normalizeBrand(h);
    return !!n && (n === b || b.startsWith(n + " ") || n.startsWith(b + " "));
  });
}

export function mentionsBrand(text: string, brand: string): boolean {
  const n = normalizeBrand(brand);
  if (!n) return false;
  return normalizeBrand(text).includes(n);
}

export type ClassifyInput = {
  brand: string;
  excerpt: string;
  houseBrands: string[];
  aiSuggested?: "confirmed" | "affiliate" | "probable" | "organic" | null;
};

export type ClassifyResult = { classification: SponsorClass; rule: string | null };

export function classifyPlacement(i: ClassifyInput): ClassifyResult {
  if (isHouseBrand(i.brand, i.houseBrands)) return { classification: "related_party", rule: "house brand" };
  const brandInText = mentionsBrand(i.excerpt, i.brand);
  const disclosure = matchDisclosure(i.excerpt);
  if (disclosure && brandInText) return { classification: "confirmed", rule: disclosure };
  const aff = matchAffiliate(i.excerpt);
  if (aff && brandInText) return { classification: "affiliate", rule: aff };
  if (i.aiSuggested && i.aiSuggested !== "organic" && brandInText) return { classification: "probable", rule: null };
  return { classification: "organic", rule: null };
}

const RANK: Record<SponsorClass, number> = { confirmed: 4, affiliate: 3, probable: 2, organic: 1, related_party: 0 };

/** One placement per brand per episode: keep the strongest classification across evidence. */
export function strongest(a: SponsorClass, b: SponsorClass): SponsorClass {
  if (a === "related_party" || b === "related_party") return "related_party";
  return RANK[a] >= RANK[b] ? a : b;
}

/** Human-readable reason for a placement's class, derived from the stored evidence. */
export function classificationReason(cls: SponsorClass, excerpts: string[]): string {
  const text = excerpts.join(" ");
  if (cls === "confirmed") return "Confirmed — disclosure phrase “" + (matchDisclosure(text) ?? "sponsored by") + "” in the evidence.";
  if (cls === "affiliate") return "Promotion — " + (matchAffiliate(text) ?? "promo code / referral link") + " for the brand, but no sponsor disclosure.";
  if (cls === "probable") return "Unverified — promotional copy for the brand without a disclosure phrase or code; could be organic or paid.";
  if (cls === "related_party") return "Related-party — the show’s own brand; excluded from rankings.";
  return "Organic mention.";
}
