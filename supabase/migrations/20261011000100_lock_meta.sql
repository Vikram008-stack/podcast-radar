-- Keep the migration bookkeeping table out of the public REST API.
alter table if exists _radar_migrations enable row level security;
