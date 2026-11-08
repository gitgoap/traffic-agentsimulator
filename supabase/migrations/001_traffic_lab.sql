-- Run once in the Supabase SQL editor during deployment.
-- Browser clients never receive the service-role key. All writes go through the API.
begin;
create table if not exists public.traffic_scenarios (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  revision integer not null default 1 check (revision > 0),
  scenario jsonb not null check (octet_length(scenario::text) <= 150000),
  summary jsonb check (octet_length(summary::text) <= 150000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.traffic_scenarios enable row level security;
revoke all on public.traffic_scenarios from anon, authenticated;
grant all on public.traffic_scenarios to service_role;

create table if not exists public.traffic_rate_limits (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
alter table public.traffic_rate_limits enable row level security;
revoke all on public.traffic_rate_limits from anon, authenticated;
grant all on public.traffic_rate_limits to service_role;

create or replace function public.traffic_take_quota(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_bucket text;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_key) > 128 then
    raise exception 'invalid quota parameters';
  end if;
  v_bucket := p_key || ':' || floor(extract(epoch from now()) / p_window_seconds)::text;
  delete from public.traffic_rate_limits where expires_at < now();
  insert into public.traffic_rate_limits(bucket, hits, expires_at)
    values (v_bucket, 1, now() + make_interval(secs => p_window_seconds))
    on conflict (bucket) do update set hits = public.traffic_rate_limits.hits + 1
    returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.traffic_take_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.traffic_take_quota(text, integer, integer) to service_role;
commit;
