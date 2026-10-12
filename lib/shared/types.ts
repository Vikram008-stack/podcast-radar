/** Types shared by the pipeline (writer) and the UI (reader) of frozen report snapshots. */

export type EvidenceType =
  | "title"
  | "show_notes"
  | "youtube_description"
  | "spotify_description"
  | "audio";

export type SponsorClass = "confirmed" | "affiliate" | "probable" | "related_party" | "organic";

export type ClaimType = "observed" | "interpretation" | "recommendation";

export type AiClaim = {
  claim: string;
  claim_type: ClaimType;
  source_ids: string[];
  confidence: number;
};

export type EpisodeRef = {
  id: string;
  title: string;
  podcastId: string;
  podcastName: string;
  publishedAt: string;
  url: string | null;
  links: { provider: "rss" | "youtube" | "spotify"; url: string }[];
  thumbnail: string | null;
  durationS: number | null;
};

export type Evidence = {
  type: EvidenceType;
  excerpt: string;
  url: string | null;
  audioTimestampS?: number | null;
};

export type GuestAppearance = {
  episode: EpisodeRef;
  evidence: Evidence;
  roleAsStated: string | null;
  confidence: number;
  topics: string[]; // topic slugs of the episode
};

export type GuestSignal = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  aliases: string[];
  /** Guest's own public links exactly as found in episode notes (LinkedIn, X, website). */
  links?: string[];
  reviewStatus: "ok" | "needs_review";
  distinctShows: number;
  appearances: number;
  firstAppearance: string;
  latestAppearance: string;
  shows: string[];
  history: GuestAppearance[]; // within 30d window
  talkingPoints: AiClaim[]; // AI, may be empty
  rank: number;
};

export type NewsRef = { id: string; publisher: string; title: string; url: string; publishedAt: string };

export type TopicSignal = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  episodes: number;
  distinctShows: number;
  previousEpisodes: number;
  /** null → "New" (previous = 0). */
  change: number | null;
  shows: string[];
  referenceEpisodes: EpisodeRef[];
  news: NewsRef[];
  angles: AiClaim[];
  /** AI SWOT of covering this topic on Aditya's show (each claim cites sources). */
  swot?: { strengths: AiClaim[]; weaknesses: AiClaim[]; opportunities: AiClaim[]; threats: AiClaim[] };
  audienceResponse: { episodeId: string; title: string; views: number | null; likes: number | null; collectedAt: string | null }[];
  rank: number;
};

export type Placement = {
  episode: EpisodeRef;
  classification: SponsorClass;
  confidence: number;
  evidence: Evidence[];
  stats: { views: number | null; likes: number | null; collectedAt: string | null } | null;
  detectedAt: string;
};

export type SponsorSignal = {
  id: string;
  name: string;
  confirmed: number;
  affiliate: number;
  probable: number;
  distinctShows: number;
  distinctEpisodes: number;
  latestPlacement: string | null;
  shows: string[];
  placements: Placement[];
  fit: AiClaim[];
  rank: number;
};

export type SourceHealth = {
  podcastId: string;
  name: string;
  artwork: string | null;
  status: "ok" | "partial" | "failed" | "inactive" | "needs_attention";
  lastSuccessAt: string | null;
  lastError: string | null;
  episodesInWindow: number;
};

export type Opportunity = {
  topic: { id: string; name: string; distinctShows: number; episodes: number } | null;
  guest: { id: string; name: string; distinctShows: number } | null;
  copy: AiClaim[];
  sources: { label: string; url: string }[];
};

export type ReportSnapshot = {
  schema: 1;
  periodStart: string;
  periodEnd: string;
  window30Start: string;
  prevStart: string;
  generatedAt: string;
  isSample: boolean;
  sources: SourceHealth[];
  sourcesCollected: number;
  sourcesTotal: number;
  guests: GuestSignal[];
  topics: TopicSignal[];
  sponsors: SponsorSignal[];
  /** probable / affiliate brands, counted separately. */
  otherBrands: SponsorSignal[];
  opportunity: Opportunity;
  stats: {
    episodesIn30d: number;
    episodesIn7d: number;
    audioAnalysed: number;
    audioSkipped: number;
    newsArticles: number;
    aiCalls: number;
  };
  notes: string[];
};
