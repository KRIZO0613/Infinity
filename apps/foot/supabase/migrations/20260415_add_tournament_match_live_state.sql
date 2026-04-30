create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  division_id uuid null,
  team_a_id uuid null,
  team_b_id uuid null,
  score_a int null,
  score_b int null,
  field int null,
  start_time timestamp null,
  status text default 'idle',
  round text null,
  group_name text null,
  created_at timestamp default now()
);

alter table public.tournament_matches
  add column if not exists ui_match_id text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists goal_events jsonb default '[]'::jsonb;

create index if not exists tournament_matches_tournament_id_idx
  on public.tournament_matches(tournament_id);

create index if not exists tournament_matches_ui_match_id_idx
  on public.tournament_matches(tournament_id, ui_match_id);

alter table public.tournament_matches replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'tournament_matches'
    )
  then
    alter publication supabase_realtime add table public.tournament_matches;
  end if;
end $$;
