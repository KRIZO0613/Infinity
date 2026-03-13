alter table public.matches
  add column if not exists scheduled_at timestamptz,
  add column if not exists competition text,
  add column if not exists location text,
  add column if not exists home_away text,
  add column if not exists goals_for integer,
  add column if not exists goals_against integer,
  add column if not exists result text;
