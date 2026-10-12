-- Content calendar: topics can be planned / recorded / published (stored alongside drafts).
alter table drafts drop constraint if exists drafts_kind_check;
alter table drafts add constraint drafts_kind_check check (kind in ('outreach', 'pitch', 'topic'));
alter table drafts drop constraint if exists drafts_status_check;
alter table drafts add constraint drafts_status_check check (status in ('draft', 'sent', 'replied', 'booked', 'declined', 'planned', 'recorded', 'published'));
