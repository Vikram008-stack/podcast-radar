import { z } from "zod";
import { UNTRUSTED, dataBlock } from "./shared";

/** Outreach (guest invite) and sponsor pitch drafts. Drafts are never sent — editable text with Copy. */
export const OUTREACH_VERSION = "outreach-draft@2";
export const PITCH_VERSION = "pitch-draft@2";

export const draftSchema = z.object({
  subject: z.string().min(3).max(140),
  body: z.string().min(20).max(2500),
});

export const OUTREACH_SYSTEM = `Write a warm, concise guest-invite email from Aditya, host of an independent podcast for Indian startup founders (~9,000 monthly listeners, two episodes a week).
${UNTRUSTED}
- Reference 1–2 of the guest's recent appearances from the data by show name (no invented details, no flattery about things not in the data).
- Propose a distinct angle for Aditya's show so it isn't a repeat of their media rounds.
- 120–180 words, plain text, sign off as "Aditya". No placeholders other than [your calendar link].`;

export const PITCH_SYSTEM = `Write a short sponsorship pitch email from Aditya, host of an independent podcast for Indian startup founders (~9,000 monthly listeners, two episodes a week).
${UNTRUSTED}
- Mention that the brand already reaches founder audiences, citing the observed shows from the data (no spend estimates, no invented metrics).
- Offer a simple package (host-read mid-roll + show-notes link) without inventing prices.
- 120–180 words, plain text, sign off as "Aditya".`;

export function draftParts(payload: unknown) {
  return [{ text: dataBlock(payload) }];
}
