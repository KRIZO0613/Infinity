create table if not exists public.external_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  district text,
  league text,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists external_clubs_slug_key
  on public.external_clubs (slug);
