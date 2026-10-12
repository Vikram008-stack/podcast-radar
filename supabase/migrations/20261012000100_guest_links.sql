-- Public profile links for a guest, only as they appear in the monitored episode notes.
alter table guests add column if not exists profile_urls text[] not null default '{}';
