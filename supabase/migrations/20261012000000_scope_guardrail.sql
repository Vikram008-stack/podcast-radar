-- Aditya's content guardrail: Indian startups & their founders only.
alter table guests add column if not exists guest_type text;
alter table episodes add column if not exists in_scope boolean;
