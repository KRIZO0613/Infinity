-- Create training_exercises for animated drills

create table if not exists public.training_exercises (
  id uuid primary key default gen_random_uuid(),
  team_id uuid null references public.teams(id) on delete set null,
  title text not null,
  category text null,
  duration integer null,
  type text not null default 'animated',
  animation_data jsonb not null default '{}'::jsonb,
  is_global boolean not null default false,
  created_by uuid null,
  created_at timestamp with time zone not null default now()
);

create index if not exists training_exercises_team_id_idx
  on public.training_exercises (team_id);
create index if not exists training_exercises_created_by_idx
  on public.training_exercises (created_by);
create index if not exists training_exercises_is_global_idx
  on public.training_exercises (is_global);

alter table public.training_exercises enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_exercises'
      and polname = 'training_exercises_select'
  ) then
    create policy training_exercises_select on public.training_exercises
      for select
      using (
        is_global
        or created_by = auth.uid()
        or (
          team_id is not null
          and exists (
            select 1
            from public.teams t
            join public.club_members cm on cm.club_id = t.club_id
            where t.id = training_exercises.team_id
              and cm.user_id = auth.uid()
              and cm.status = 'active'
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_exercises'
      and polname = 'training_exercises_insert'
  ) then
    create policy training_exercises_insert on public.training_exercises
      for insert
      with check (
        created_by = auth.uid()
        and (
          team_id is null
          or exists (
            select 1
            from public.teams t
            join public.club_members cm on cm.club_id = t.club_id
            where t.id = training_exercises.team_id
              and cm.user_id = auth.uid()
              and cm.status = 'active'
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_exercises'
      and polname = 'training_exercises_update'
  ) then
    create policy training_exercises_update on public.training_exercises
      for update
      using (
        created_by = auth.uid()
        or (
          team_id is not null
          and exists (
            select 1
            from public.teams t
            join public.club_members cm on cm.club_id = t.club_id
            where t.id = training_exercises.team_id
              and cm.user_id = auth.uid()
              and cm.status = 'active'
          )
        )
      )
      with check (
        created_by = auth.uid()
        or (
          team_id is not null
          and exists (
            select 1
            from public.teams t
            join public.club_members cm on cm.club_id = t.club_id
            where t.id = training_exercises.team_id
              and cm.user_id = auth.uid()
              and cm.status = 'active'
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_exercises'
      and polname = 'training_exercises_delete'
  ) then
    create policy training_exercises_delete on public.training_exercises
      for delete
      using (
        created_by = auth.uid()
        or (
          team_id is not null
          and exists (
            select 1
            from public.teams t
            join public.club_members cm on cm.club_id = t.club_id
            where t.id = training_exercises.team_id
              and cm.user_id = auth.uid()
              and cm.status = 'active'
          )
        )
      );
  end if;
end $$;
