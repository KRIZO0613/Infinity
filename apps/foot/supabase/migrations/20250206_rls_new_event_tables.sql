-- RLS policies for new event/stat tables (Infinity Foot)
-- NOTE: policies reuse the same club_members access rule as teams/players.

-- Enable RLS
alter table public.team_events enable row level security;
alter table public.matches enable row level security;
alter table public.training_sessions enable row level security;
alter table public.event_players enable row level security;
alter table public.stat_types enable row level security;
alter table public.player_event_stats enable row level security;
alter table public.match_events enable row level security;

-- team_events policies
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_events' and polname = 'team_events_select'
  ) then
    create policy team_events_select on public.team_events
      for select
      using (
        exists (
          select 1
          from public.club_members cm
          where cm.club_id = team_events.club_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_events' and polname = 'team_events_insert'
  ) then
    create policy team_events_insert on public.team_events
      for insert
      with check (
        exists (
          select 1
          from public.club_members cm
          where cm.club_id = team_events.club_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_events' and polname = 'team_events_update'
  ) then
    create policy team_events_update on public.team_events
      for update
      using (
        exists (
          select 1
          from public.club_members cm
          where cm.club_id = team_events.club_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.club_members cm
          where cm.club_id = team_events.club_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'team_events' and polname = 'team_events_delete'
  ) then
    create policy team_events_delete on public.team_events
      for delete
      using (
        exists (
          select 1
          from public.club_members cm
          where cm.club_id = team_events.club_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

-- matches policies (via team_events)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'matches' and polname = 'matches_select'
  ) then
    create policy matches_select on public.matches
      for select
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = matches.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'matches' and polname = 'matches_insert'
  ) then
    create policy matches_insert on public.matches
      for insert
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = matches.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'matches' and polname = 'matches_update'
  ) then
    create policy matches_update on public.matches
      for update
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = matches.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = matches.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'matches' and polname = 'matches_delete'
  ) then
    create policy matches_delete on public.matches
      for delete
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = matches.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

-- training_sessions policies (via team_events)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_sessions' and polname = 'training_sessions_select'
  ) then
    create policy training_sessions_select on public.training_sessions
      for select
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = training_sessions.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_sessions' and polname = 'training_sessions_insert'
  ) then
    create policy training_sessions_insert on public.training_sessions
      for insert
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = training_sessions.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_sessions' and polname = 'training_sessions_update'
  ) then
    create policy training_sessions_update on public.training_sessions
      for update
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = training_sessions.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = training_sessions.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_sessions' and polname = 'training_sessions_delete'
  ) then
    create policy training_sessions_delete on public.training_sessions
      for delete
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = training_sessions.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

-- event_players policies (via team_events)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_players' and polname = 'event_players_select'
  ) then
    create policy event_players_select on public.event_players
      for select
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = event_players.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_players' and polname = 'event_players_insert'
  ) then
    create policy event_players_insert on public.event_players
      for insert
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = event_players.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_players' and polname = 'event_players_update'
  ) then
    create policy event_players_update on public.event_players
      for update
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = event_players.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = event_players.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_players' and polname = 'event_players_delete'
  ) then
    create policy event_players_delete on public.event_players
      for delete
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = event_players.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

-- stat_types policies
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stat_types' and polname = 'stat_types_select'
  ) then
    create policy stat_types_select on public.stat_types
      for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stat_types' and polname = 'stat_types_write'
  ) then
    create policy stat_types_write on public.stat_types
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- player_event_stats policies (via team_events)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_event_stats' and polname = 'player_event_stats_select'
  ) then
    create policy player_event_stats_select on public.player_event_stats
      for select
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = player_event_stats.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_event_stats' and polname = 'player_event_stats_insert'
  ) then
    create policy player_event_stats_insert on public.player_event_stats
      for insert
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = player_event_stats.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_event_stats' and polname = 'player_event_stats_update'
  ) then
    create policy player_event_stats_update on public.player_event_stats
      for update
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = player_event_stats.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = player_event_stats.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_event_stats' and polname = 'player_event_stats_delete'
  ) then
    create policy player_event_stats_delete on public.player_event_stats
      for delete
      using (
        exists (
          select 1
          from public.team_events te
          join public.club_members cm on cm.club_id = te.club_id
          where te.id = player_event_stats.event_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

-- match_events policies (via matches -> team_events)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'match_events' and polname = 'match_events_select'
  ) then
    create policy match_events_select on public.match_events
      for select
      using (
        exists (
          select 1
          from public.matches m
          join public.team_events te on te.id = m.event_id
          join public.club_members cm on cm.club_id = te.club_id
          where m.id = match_events.match_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'match_events' and polname = 'match_events_insert'
  ) then
    create policy match_events_insert on public.match_events
      for insert
      with check (
        exists (
          select 1
          from public.matches m
          join public.team_events te on te.id = m.event_id
          join public.club_members cm on cm.club_id = te.club_id
          where m.id = match_events.match_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'match_events' and polname = 'match_events_update'
  ) then
    create policy match_events_update on public.match_events
      for update
      using (
        exists (
          select 1
          from public.matches m
          join public.team_events te on te.id = m.event_id
          join public.club_members cm on cm.club_id = te.club_id
          where m.id = match_events.match_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.matches m
          join public.team_events te on te.id = m.event_id
          join public.club_members cm on cm.club_id = te.club_id
          where m.id = match_events.match_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'match_events' and polname = 'match_events_delete'
  ) then
    create policy match_events_delete on public.match_events
      for delete
      using (
        exists (
          select 1
          from public.matches m
          join public.team_events te on te.id = m.event_id
          join public.club_members cm on cm.club_id = te.club_id
          where m.id = match_events.match_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;
