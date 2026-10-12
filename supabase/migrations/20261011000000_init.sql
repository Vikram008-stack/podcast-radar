-- Podcast Ecosystem Radar — initial schema (single user, RLS owner_id = auth.uid()).
-- The pipeline writes with the service-role key (bypasses RLS) and stamps owner_id.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade unique,
  timezone text not null default 'Asia/Kolkata',
  report_time text not null default '06:00',
  min_episode_minutes int not null default 20,
  last_manual_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- podcasts
create table if not exists podcasts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  rss_url text,
  youtube_channel_id text,
  youtube_handle text,
  spotify_show_id text,
  apple_collection_id text,
  artwork_url text,
  host_names text[] not null default '{}',
  house_brands text[] not null default '{}',
  analyse_audio boolean not null default true,
  min_episode_minutes int,
  active boolean not null default false,
  validation_status text not null default 'unverified'
    check (validation_status in ('unverified','ok','needs_attention')),
  validation_detail text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  checkpoint jsonb not null default '{}'::jsonb,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------------------------------------------------------------- episodes
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  podcast_id uuid not null references podcasts on delete cascade,
  title text not null,
  description text not null default '',
  published_at timestamptz not null,
  duration_s int,
  episode_url text,
  audio_url text,
  thumbnail_url text,
  content_hash text not null,
  extracted_hash text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','done','needs_review','failed')),
  audio_status text not null default 'none'
    check (audio_status in ('none','pending','done','skipped','failed')),
  audio_error text,
  stats jsonb,
  stats_collected_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists episodes_podcast_pub on episodes (podcast_id, published_at desc);
create index if not exists episodes_pub on episodes (owner_id, published_at desc);

create table if not exists episode_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  episode_id uuid not null references episodes on delete cascade,
  provider text not null check (provider in ('rss','youtube','spotify')),
  external_id text not null,
  url text,
  description text,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists episode_sources_episode on episode_sources (episode_id);

-- ---------------------------------------------------------------- news
create table if not exists news_articles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  publisher text not null,
  title text not null,
  url text not null unique,
  published_at timestamptz not null,
  summary text,
  tagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists news_pub on news_articles (published_at desc);

-- ---------------------------------------------------------------- guests
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  normalized_name text not null,
  role text,
  company text,
  review_status text not null default 'ok' check (review_status in ('ok','needs_review')),
  review_note text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists guests_norm on guests (owner_id, normalized_name);

create table if not exists guest_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  guest_id uuid not null references guests on delete cascade,
  alias text not null,
  normalized_alias text not null,
  unique (owner_id, normalized_alias)
);

create table if not exists guest_appearances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  guest_id uuid not null references guests on delete cascade,
  episode_id uuid not null references episodes on delete cascade,
  evidence_excerpt text not null,
  evidence_url text,
  evidence_type text not null default 'show_notes'
    check (evidence_type in ('title','show_notes','youtube_description','spotify_description','audio')),
  audio_timestamp_s int,
  role_as_stated text,
  confidence real not null default 0.5,
  review_status text not null default 'ok' check (review_status in ('ok','needs_review')),
  created_at timestamptz not null default now(),
  unique (guest_id, episode_id)
);

-- ---------------------------------------------------------------- topics
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  slug text not null,
  category text,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table if not exists episode_topics (
  episode_id uuid not null references episodes on delete cascade,
  topic_id uuid not null references topics on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  confidence real not null default 0.5,
  primary key (episode_id, topic_id)
);

create table if not exists news_topics (
  news_id uuid not null references news_articles on delete cascade,
  topic_id uuid not null references topics on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  primary key (news_id, topic_id)
);

-- ---------------------------------------------------------------- sponsors
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  normalized_name text not null,
  website text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

create table if not exists sponsorship_placements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  brand_id uuid not null references brands on delete cascade,
  episode_id uuid not null references episodes on delete cascade,
  classification text not null check (classification in
    ('confirmed','affiliate','probable','related_party','organic')),
  confidence real not null default 0.5,
  detected_at timestamptz not null default now(),
  unique (brand_id, episode_id)
);

create table if not exists placement_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  placement_id uuid not null references sponsorship_placements on delete cascade,
  evidence_type text not null check (evidence_type in
    ('show_notes','youtube_description','spotify_description','audio')),
  excerpt text not null,
  source_url text,
  audio_timestamp_s int,
  matched_rule text,
  created_at timestamptz not null default now(),
  unique (placement_id, evidence_type, excerpt)
);

-- ---------------------------------------------------------------- AI + jobs
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users on delete cascade,
  job_id uuid,
  prompt_name text not null,
  prompt_version text not null,
  model text not null,
  input_kind text not null default 'text' check (input_kind in ('text','audio')),
  tokens_in int,
  tokens_out int,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users on delete cascade,
  type text not null,
  trigger text not null default 'schedule',
  period_key text,
  status text not null default 'running'
    check (status in ('running','succeeded','partial','failed')),
  checkpoint jsonb not null default '{}'::jsonb,
  retries int not null default 0,
  error_summary text,
  provider_calls jsonb not null default '{}'::jsonb,
  log jsonb not null default '[]'::jsonb,
  idempotency_key text unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_started on ingestion_jobs (started_at desc);

create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  version int not null,
  status text not null default 'building' check (status in ('building','ready','failed')),
  snapshot jsonb,
  is_sample boolean not null default false,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, period_start, is_sample)
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('outreach','pitch')),
  target_id uuid not null,
  subject text not null default '',
  body text not null default '',
  generated_by text,
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, target_id)
);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['app_settings','podcasts','episodes','episode_sources','news_articles',
    'guests','guest_aliases','guest_appearances','topics','episode_topics','news_topics','brands',
    'sponsorship_placements','placement_evidence','ai_runs','ingestion_jobs','weekly_reports','drafts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
