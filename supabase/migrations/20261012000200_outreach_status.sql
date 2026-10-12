-- Impact tracking: what happened to each outreach / pitch draft.
alter table drafts add column if not exists status text not null default 'draft'
  check (status in ('draft', 'sent', 'replied', 'booked', 'declined'));
alter table drafts add column if not exists status_at timestamptz;
