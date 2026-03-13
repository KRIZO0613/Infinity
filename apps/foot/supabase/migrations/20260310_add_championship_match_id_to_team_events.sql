alter table public.team_events
  add column if not exists championship_match_id text;

create unique index if not exists team_events_championship_match_id_key
  on public.team_events (championship_match_id);
