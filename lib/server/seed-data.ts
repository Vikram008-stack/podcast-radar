/**
 * Default monitored ecosystem (seed config — editable in Settings, never used by app logic).
 * RSS feeds verified 11 Oct 2026 via Apple Podcasts Search + a live fetch (docs/DATA_SOURCES.md).
 * YouTube handles are candidates confirmed by channels.list(forHandle) during validation.
 */
export type SeedShow = {
  name: string;
  rss_url: string | null;
  apple_collection_id: string | null;
  youtube_handle: string | null;
  host_names: string[];
  house_brands: string[];
};

export const SEED_SHOWS: SeedShow[] = [
  { name: "The Neon Show", rss_url: "https://feeds.buzzsprout.com/1601695.rss", apple_collection_id: null, youtube_handle: null, host_names: ["Siddhartha Ahluwalia", "Nansi"], house_brands: ["Neon Fund"] },
  { name: "Founders Unfiltered", rss_url: "https://anchor.fm/s/1471bde4/podcast/rss", apple_collection_id: "1507039886", youtube_handle: "ajuniorvc", host_names: ["Mazin", "Aviral Bhatnagar"], house_brands: ["A Junior VC"] },
  { name: "The Desi VC", rss_url: "https://anchor.fm/s/db9d322c/podcast/rss", apple_collection_id: "1497417574", youtube_handle: "TheDesiVC", host_names: ["Akash Bhat"], house_brands: [] },
  { name: "SeedToScale", rss_url: "https://feeds.simplecast.com/JPQYcVsK", apple_collection_id: "1364412685", youtube_handle: null, host_names: [], house_brands: ["Accel"] },
  { name: "First Principles (The Ken)", rss_url: "https://feeds.transistor.fm/first-principles-261f2954-4e6b-4315-973d-17d02efc10f6", apple_collection_id: "1639125773", youtube_handle: null, host_names: [], house_brands: ["The Ken"] },
  { name: "Founder Thesis", rss_url: "https://feeds.zencastr.com/f/mbqvPYFP.rss", apple_collection_id: "1509981658", youtube_handle: "FounderThesis", host_names: ["Akshay Datt"], house_brands: [] },
  { name: "Indian Silicon Valley", rss_url: "https://anchor.fm/s/b025ebc/podcast/rss", apple_collection_id: "1527294982", youtube_handle: "indiansiliconvalley", host_names: ["Jivraj Singh Sachar"], house_brands: [] },
  { name: "People by WTF", rss_url: "https://feeds.hubhopper.com/db41907e6c28518ffe336b392c715ef1.rss", apple_collection_id: "1819856014", youtube_handle: "nikhil.kamath", host_names: ["Nikhil Kamath"], house_brands: ["Zerodha", "Gruhas", "True Beacon", "WTF"] },
  { name: "Figuring Out (Raj Shamani)", rss_url: "https://anchor.fm/s/f5347ab0/podcast/rss", apple_collection_id: "1501941375", youtube_handle: "rajshamani", host_names: ["Raj Shamani"], house_brands: [] },
  { name: "The Barbershop with Shantanu", rss_url: "https://media.rss.com/thebarbershopwithshantanu/feed.xml", apple_collection_id: "1657402141", youtube_handle: null, host_names: ["Shantanu Deshpande"], house_brands: ["Bombay Shaving Company"] },
];

export const SEED_TOPICS: { name: string; category: string }[] = [
  { name: "Fundraising & VC", category: "Capital" },
  { name: "D2C brands", category: "Sectors" },
  { name: "Quick commerce", category: "Sectors" },
  { name: "Fintech & UPI", category: "Sectors" },
  { name: "SaaS from India", category: "Sectors" },
  { name: "AI startups", category: "Sectors" },
  { name: "Deeptech & semiconductors", category: "Sectors" },
  { name: "IPOs & public markets", category: "Capital" },
  { name: "Bharat / Tier-2 consumers", category: "Markets" },
  { name: "Hiring & culture", category: "Founders" },
  { name: "Founder mental health", category: "Founders" },
  { name: "Policy & regulation", category: "Ecosystem" },
  { name: "Creator economy", category: "Sectors" },
  { name: "Climate & EV", category: "Sectors" },
  { name: "Bootstrapping", category: "Founders" },
];
