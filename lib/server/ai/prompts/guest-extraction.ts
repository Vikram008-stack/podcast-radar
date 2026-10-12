/** Guest extraction instructions. Composed into the batched episode-intel call. */
export const GUEST_EXTRACTION = {
  version: "guest-extraction@4-links",
  text: `GUESTS: List every person who APPEARS as a guest/interviewee in the episode (not people merely mentioned).
- Signals: "ft.", "feat.", "with", " x ", "|", "in conversation with", "joins us", "our guest", "guest:".
- Exclude the show's hosts (given in host_names) and the show itself.
- Exclude companies, brands and generic roles ("a VC", "the founder").
- role/company only if stated in the data; otherwise null. Never guess.
- evidence_excerpt: copy a SHORT verbatim span (max 20 words) from the title or description that shows the person appears.
- source: "title" if the excerpt comes from the title, else "description".
- profile_urls: the GUEST's own public links (LinkedIn, X/Twitter, Instagram, personal or company website) copied EXACTLY as written in the data next to their name; [] if none. Never invent or guess URLs; never include the host's or show's links.`,
};
