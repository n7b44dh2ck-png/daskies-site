-- DASKIES mandatory member details.
-- Every member must give: full name, mobile, business name, what the business does, full address,
-- city, state, PIN/postal code and country. GSTIN is optional (format-checked when given).
-- Street address, PIN and GSTIN are private: only the owner and DASKIES admins can read them.
-- Until a profile is complete, the database refuses new listings, enquiries, messages and deals.
-- Run after 001-003, in staging first, then production.

create table if not exists public.business_private (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  address text not null check (char_length(btrim(address)) between 8 and 300),
  postal_code text not null check (postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  updated_at timestamptz not null default now()
);

alter table public.business_private enable row level security;
drop policy if exists business_private_select on public.business_private;
create policy business_private_select on public.business_private for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists business_private_insert on public.business_private;
create policy business_private_insert on public.business_private for insert with check (
  owner_id = auth.uid() and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
drop policy if exists business_private_update on public.business_private;
create policy business_private_update on public.business_private for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.business_private from anon, authenticated;
grant select, insert on public.business_private to authenticated;
grant update (address, postal_code, gstin) on public.business_private to authenticated;

create or replace function public.business_private_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.address := btrim(new.address);
  new.postal_code := upper(btrim(new.postal_code));
  new.gstin := nullif(upper(btrim(new.gstin)), '');
  return new;
end $$;
drop trigger if exists business_private_touch on public.business_private;
create trigger business_private_touch before insert or update on public.business_private for each row execute function public.business_private_touch();

-- The old public address column is retired: it was readable by anyone. Nothing writes it any more.
revoke update (address) on public.businesses from authenticated;
update public.businesses set address = null where address is not null;

-- True when the member has given every mandatory detail.
create or replace function public.profile_complete(p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  -- members may only ask about themselves; admins about anyone
  if auth.uid() is not null and p_user is distinct from auth.uid() and not public.is_admin() then return null; end if;
  return exists (
    select 1 from profiles p
    join businesses b on b.owner_id = p.id
    join business_private bp on bp.owner_id = p.id and bp.business_id = b.id
    where p.id = p_user
      and char_length(btrim(coalesce(p.full_name, ''))) >= 2
      and char_length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) between 10 and 15
      and char_length(btrim(b.name)) >= 2
      and cardinality(b.roles) >= 1
      and char_length(btrim(coalesce(b.city, ''))) >= 2
      and char_length(btrim(coalesce(b.state, ''))) >= 2
      and char_length(btrim(coalesce(b.country, ''))) >= 2
  );
end $$;
revoke all on function public.profile_complete(uuid) from public, anon;
grant execute on function public.profile_complete(uuid) to authenticated;

-- Blocks new listings, enquiries, messages and deals until the member's profile is complete.
-- Runs only for signed-in members; admins and database maintenance are not blocked.
create or replace function public.require_complete_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and not public.profile_complete(auth.uid()) then
    raise exception 'Complete your profile first: your name, mobile number, business and full address are required.'
      using errcode = 'P0001', hint = 'profile_incomplete';
  end if;
  return new;
end $$;
revoke all on function public.require_complete_profile() from public, anon, authenticated;

drop trigger if exists a_require_profile on public.listings;
create trigger a_require_profile before insert on public.listings for each row execute function public.require_complete_profile();
drop trigger if exists a_require_profile on public.conversations;
create trigger a_require_profile before insert on public.conversations for each row execute function public.require_complete_profile();
drop trigger if exists a_require_profile on public.messages;
create trigger a_require_profile before insert on public.messages for each row execute function public.require_complete_profile();
drop trigger if exists a_require_profile on public.deals;
create trigger a_require_profile before insert on public.deals for each row execute function public.require_complete_profile();

-- Admin view of every member with completeness (admins only; members get nothing).
create or replace function public.admin_members()
returns table (user_id uuid, email text, full_name text, phone text, is_admin boolean, joined timestamptz,
  business_id uuid, business text, roles text[], city text, state text, country text, address text, postal_code text, gstin text,
  verification_level smallint, complete boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, p.email, p.full_name, p.phone, p.is_admin, p.created_at, b.id, b.name, b.roles, b.city, b.state, b.country,
      bp.address, bp.postal_code, bp.gstin, b.verification_level, public.profile_complete(p.id)
    from profiles p left join businesses b on b.owner_id = p.id left join business_private bp on bp.owner_id = p.id
    order by p.created_at desc;
end $$;
revoke all on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;
