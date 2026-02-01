create table if not exists public.championships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  season text not null,
  kind text not null,
  pool text not null,
  status text not null,
  teams jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists championships_team_id_key
  on public.championships (team_id);

create index if not exists championships_team_id_idx
  on public.championships (team_id);

alter table public.championships enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'championships' and polname = 'championships_select'
  ) then
    create policy championships_select on public.championships
      for select
      using (
        exists (
          select 1
          from public.teams t
          join public.club_members cm on cm.club_id = t.club_id
          where t.id = championships.team_id
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
    where schemaname = 'public' and tablename = 'championships' and polname = 'championships_insert'
  ) then
    create policy championships_insert on public.championships
      for insert
      with check (
        exists (
          select 1
          from public.teams t
          join public.club_members cm on cm.club_id = t.club_id
          where t.id = championships.team_id
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
    where schemaname = 'public' and tablename = 'championships' and polname = 'championships_update'
  ) then
    create policy championships_update on public.championships
      for update
      using (
        exists (
          select 1
          from public.teams t
          join public.club_members cm on cm.club_id = t.club_id
          where t.id = championships.team_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      )
      with check (
        exists (
          select 1
          from public.teams t
          join public.club_members cm on cm.club_id = t.club_id
          where t.id = championships.team_id
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
    where schemaname = 'public' and tablename = 'championships' and polname = 'championships_delete'
  ) then
    create policy championships_delete on public.championships
      for delete
      using (
        exists (
          select 1
          from public.teams t
          join public.club_members cm on cm.club_id = t.club_id
          where t.id = championships.team_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end $$;
