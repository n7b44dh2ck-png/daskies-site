-- DASKIES error reporting: pages record unexpected errors so the team can see and fix them.
-- Anyone may add a report (visitors too); only admins can read them. Flood-protected.
-- Run after 001-006, in staging first, then production.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid,
  page text check (char_length(page) <= 300),
  message text not null check (char_length(message) between 1 and 1000),
  detail text check (char_length(detail) <= 4000),
  user_agent text check (char_length(user_agent) <= 400),
  ref text check (char_length(ref) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_time_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated with check (true);
drop policy if exists client_errors_select on public.client_errors;
create policy client_errors_select on public.client_errors for select using (public.is_admin());
revoke all on public.client_errors from anon, authenticated;
grant insert (page, message, detail, user_agent, ref) on public.client_errors to anon, authenticated;
grant select on public.client_errors to authenticated;

-- Stamps who reported it and drops reports beyond 300 in 10 minutes, so a broken page or a bad actor can't flood the table.
create or replace function public.client_error_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from client_errors where created_at > now() - interval '10 minutes') >= 300 then
    return null;
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end $$;
revoke all on function public.client_error_guard() from public, anon, authenticated;
drop trigger if exists client_errors_guard on public.client_errors;
create trigger client_errors_guard before insert on public.client_errors for each row execute function public.client_error_guard();
