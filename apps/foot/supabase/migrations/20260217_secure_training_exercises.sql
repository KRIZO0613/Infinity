-- Secure training_exercises (RLS + constraints)
-- Production-ready: safe defaults, idempotent policies, updated_at trigger.

-- Ensure columns + defaults
alter table public.training_exercises
  add column if not exists updated_at timestamptz not null default now();

alter table public.training_exercises
  alter column title set not null;

alter table public.training_exercises
  alter column category set default 'echauffement';

alter table public.training_exercises
  alter column duration set default 15;

alter table public.training_exercises
  alter column type set default 'animated';

alter table public.training_exercises
  alter column animation_data set default '{}'::jsonb;

alter table public.training_exercises
  alter column is_global set default false;

alter table public.training_exercises
  alter column created_by set default auth.uid();

-- Backfill nullable values (safe for production)
update public.training_exercises
  set category = 'echauffement'
  where category is null;

update public.training_exercises
  set duration = 15
  where duration is null;

update public.training_exercises
  set type = 'animated'
  where type is null;

update public.training_exercises
  set animation_data = '{}'::jsonb
  where animation_data is null;

update public.training_exercises
  set is_global = false
  where is_global is null;

-- If existing rows have null created_by, assign a placeholder UUID.
-- Replace with a real user id if you need strict ownership.
update public.training_exercises
  set created_by = coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid)
  where created_by is null;

alter table public.training_exercises
  alter column category set not null,
  alter column duration set not null,
  alter column type set not null,
  alter column animation_data set not null,
  alter column is_global set not null,
  alter column created_by set not null;

-- Check constraint on type (only animated for now)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_exercises_type_check'
      and conrelid = 'public.training_exercises'::regclass
  ) then
    alter table public.training_exercises
      add constraint training_exercises_type_check
      check (type in ('animated'));
  end if;
end $$;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_training_exercises_updated_at on public.training_exercises;
create trigger set_training_exercises_updated_at
before update on public.training_exercises
for each row
execute function public.set_updated_at();

-- RLS
alter table public.training_exercises enable row level security;

drop policy if exists training_exercises_select on public.training_exercises;
create policy training_exercises_select
  on public.training_exercises
  for select
  to authenticated
  using (
    is_global = true
    or created_by = auth.uid()
  );

drop policy if exists training_exercises_insert on public.training_exercises;
create policy training_exercises_insert
  on public.training_exercises
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and is_global = false
  );

drop policy if exists training_exercises_update on public.training_exercises;
create policy training_exercises_update
  on public.training_exercises
  for update
  to authenticated
  using (
    created_by = auth.uid()
    and is_global = false
  )
  with check (
    created_by = auth.uid()
    and is_global = false
  );

drop policy if exists training_exercises_delete on public.training_exercises;
create policy training_exercises_delete
  on public.training_exercises
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    and is_global = false
  );
