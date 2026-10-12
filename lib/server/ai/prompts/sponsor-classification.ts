/** Sponsor / brand candidate extraction. The final classification is rule-based (lib/sponsors.ts). */
export const SPONSOR_CLASSIFICATION = {
  version: "sponsor-classification@3",
  text: `BRANDS: List brands that are PROMOTED in the description (ad reads, sponsor lines, promo codes, affiliate/referral links, recurring pitch paragraphs).
- excerpt: copy the promotional sentence VERBATIM from the description (max 30 words). It must contain the brand name.
- suggested: "confirmed" (explicit disclosure such as sponsored by / brought to you by / presented by / powered by / in association with / in partnership with / #ad / paid partnership), "affiliate" (promo code or referral link without disclosure), "probable" (promotional copy without disclosure), "organic" (brand only discussed as a topic or as the guest's company).
- Ignore the show's own social links, the host's own newsletter and generic platform links (Spotify, Apple Podcasts, YouTube, Instagram) unless explicitly sponsored.`,
};
