alter table public.teams
  add column if not exists squad_number integer,
  add column if not exists players_per_side integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_players_per_side_check'
  ) then
    alter table public.teams
      add constraint teams_players_per_side_check
      check (players_per_side in (4, 5, 7, 8, 9, 11));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_squad_number_check'
  ) then
    alter table public.teams
      add constraint teams_squad_number_check
      check (squad_number is null or squad_number > 0);
  end if;
end $$;
