-- 009: Listings DASKIES posts on an owner's behalf, with the owner's consent.
-- The listing sits under the admin who posted it, so enquiries and deals reach the DASKIES team.
-- The owner's name, contact details and how they agreed are kept in managed_owners, which only admins can read.
-- When the owner joins DASKIES, admin_handover_listing moves the listing and its photos to their account.
-- Safe to run more than once.

alter table public.listings add column if not exists managed boolean not null default false;

create table if not exists public.managed_owners (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  owner_name text not null check (char_length(btrim(owner_name)) between 2 and 160),
  contact_name text check (char_length(contact_name) <= 120),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 200),
  consent text not null check (char_length(btrim(consent)) between 3 and 500),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.managed_owners enable row level security;
drop policy if exists managed_owners_admin on public.managed_owners;
create policy managed_owners_admin on public.managed_owners for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.managed_owners from anon;
grant select, insert, update, delete on public.managed_owners to authenticated;

-- Only admins can mark a listing as managed, or unmark it.
create or replace function public.listing_managed_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then new.managed := false; else new.managed := old.managed; end if;
  end if;
  return new;
end $$;
revoke all on function public.listing_managed_guard() from public, anon, authenticated;
drop trigger if exists listings_managed_guard on public.listings;
create trigger listings_managed_guard before insert or update on public.listings for each row execute function public.listing_managed_guard();

-- Hand a managed listing to its owner once they have joined and added their business.
create or replace function public.admin_handover_listing(p_listing uuid, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid; bid uuid; t text; m boolean;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select title, managed into t, m from listings where id = p_listing;
  if t is null then raise exception 'listing not found'; end if;
  if not m then raise exception 'DASKIES does not manage this listing'; end if;
  select p.id into uid from profiles p where lower(p.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if uid is null then raise exception 'No member has that email yet. Ask the owner to join DASKIES first.'; end if;
  select b.id into bid from businesses b where b.owner_id = uid limit 1;
  if bid is null then raise exception 'That member has not added their business yet.'; end if;
  update listings set owner_id = uid, business_id = bid, managed = false where id = p_listing;
  update listing_photos set owner_id = uid where listing_id = p_listing;
  delete from managed_owners where listing_id = p_listing;
  insert into notifications (user_id, kind, title, body, link)
    values (uid, 'listing', 'A listing is now yours', left('The DASKIES team moved "' || t || '" to your account. You can edit it from your dashboard.', 300), 'listing.html?id=' || p_listing::text);
  insert into audit_log (actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'handover', 'listing', p_listing, jsonb_build_object('to', uid));
  return uid;
end $$;
revoke all on function public.admin_handover_listing(uuid, text) from public, anon;
grant execute on function public.admin_handover_listing(uuid, text) to authenticated;
