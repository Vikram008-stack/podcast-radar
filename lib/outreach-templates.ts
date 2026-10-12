import type { GuestSignal, SponsorSignal } from "@/lib/shared/types";

/**
 * Ready-made cold-outreach drafts built only from the evidence in the brief (no AI, always
 * available). [Square brackets] are placeholders for Aditya to fill. Nothing is ever sent.
 */
export type DraftTemplate = { key: "email" | "dm"; label: string; subject: string; body: string };

const first = (name: string) => name.trim().split(/\s+/)[0];
const short = (t: string, n = 70) => {
  const clean = t.split("|")[0].trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
};

export function guestTemplates(g: GuestSignal): DraftTemplate[] {
  const ep = g.history[0]?.episode;
  const show = ep?.podcastName ?? g.shows[0] ?? "a recent podcast";
  const title = ep ? short(ep.title) : "";
  const company = g.company ?? "[their company]";
  const others = g.shows.length > 1 ? ` (and ${g.shows.length - 1} other show${g.shows.length > 2 ? "s" : ""})` : "";
  const email = `Hi ${first(g.name)},

I host [Podcast name], a twice-weekly podcast for independent Indian startup founders — about 9,000 listeners each month, mostly early-stage builders.

I caught your conversation on ${show}${others}${title ? ` — “${title}”` : ""}. It's clear you've been thinking hard about ${g.role ? `your work as ${g.role}` : "building"} at ${company}.

I'd love to have you on to go somewhere your recent interviews haven't: the early, pre-traction days of ${company} — the decisions nobody saw, what you'd do differently, and what a first-time founder in India should steal from your playbook.

What it would look like:
• 45–60 minute conversation, remote or in person in [city]
• Recording in the next 2–3 weeks, whenever suits you
• Questions shared in advance; you see the episode before it goes live

Would you be open to a 15-minute call this week? Here's my calendar: [calendar link]

Thanks,
Aditya
[Podcast link] · [LinkedIn]`;

  const dm = `Hi ${first(g.name)} — loved your chat on ${show}${title ? ` (“${short(title, 45)}”)` : ""}. I host [Podcast name], a podcast for independent Indian founders (~9k monthly listeners). Would love to have you on to talk about the early days of ${company}. Open to a quick call? [calendar link]`;

  return [
    { key: "email", label: "Cold email", subject: `Podcast invite: the early days of ${company}`, body: email },
    { key: "dm", label: "LinkedIn DM", subject: "LinkedIn connection note (≤ 300 characters)", body: dm },
  ];
}

export function sponsorTemplates(s: SponsorSignal): DraftTemplate[] {
  const shows = s.shows.slice(0, 2).join(" and ") || "Indian startup podcasts";
  const email = `Hi [Name],

I noticed ${s.name} has been reaching founder audiences on ${shows} recently — great fit, because that's exactly who listens to my show.

I host [Podcast name], a twice-weekly podcast for independent Indian startup founders (about 9,000 monthly listeners, mostly early-stage builders and operators).

A simple way to test us:
• One host-read mid-roll per episode, in my own words
• Your link and offer code in the show notes
• A 4-episode run (2 weeks), with listener numbers shared after

Happy to share audience details and rates on a quick call — [calendar link].

Best,
Aditya
[Podcast link] · [Media kit link]`;

  const dm = `Hi [Name] — saw ${s.name} sponsoring ${s.shows[0] ?? "Indian startup podcasts"}. I host [Podcast name] for independent Indian founders (~9k monthly listeners). Would a short 4-episode test run be worth a chat? [calendar link]`;

  return [
    { key: "email", label: "Pitch email", subject: `Reaching Indian founders with ${s.name} — partnership idea`, body: email },
    { key: "dm", label: "LinkedIn DM", subject: "LinkedIn message to the marketing / partnerships lead", body: dm },
  ];
}

/** A people-search link (no data collected) to find someone on LinkedIn. */
export function linkedinSearchUrl(name: string, company?: string | null): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([name, company].filter(Boolean).join(" "))}`;
}

export function linkLabel(url: string): string {
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/(twitter|x)\.com/i.test(url)) return "X / Twitter";
  if (/instagram\.com/i.test(url)) return "Instagram";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}
