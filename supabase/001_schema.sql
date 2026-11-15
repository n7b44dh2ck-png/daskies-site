-- DASKIES marketplace schema (P0). Run once in each Supabase project (staging, then production).
-- Every table has row-level security; the browser only ever uses the public (publishable) key.

create extension if not exists pgcrypto;

-- ---------- profiles (one per login) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 30),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- helpers (after profiles exists) ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120),
          left(coalesce(new.raw_user_meta_data->>'phone', ''), 30))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- businesses ----------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  roles text[] not null default '{}',
  industry text check (char_length(industry) <= 120),
  description text check (char_length(description) <= 3000),
  products text check (char_length(products) <= 1000),
  year_established int check (year_established between 1800 and 2100),
  website text check (char_length(website) <= 200),
  country text not null default 'India' check (char_length(country) <= 60),
  state text check (char_length(state) <= 60),
  city text check (char_length(city) <= 80),
  address text check (char_length(address) <= 300),
  certifications text check (char_length(certifications) <= 500),
  export_import boolean not null default false,
  verification_level smallint not null default 1 check (verification_level between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text check (char_length(label) <= 80),
  city text check (char_length(city) <= 80),
  state text check (char_length(state) <= 60),
  country text not null default 'India' check (char_length(country) <= 60),
  created_at timestamptz not null default now()
);

-- ---------- listings: offers (have) and needs (want) ----------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('offer','need')),
  vertical text not null check (vertical in ('industrial','commodity','real-assets','storage','barter-tech','projects')),
  subcategory text not null check (char_length(subcategory) <= 120),
  title text not null check (char_length(title) between 4 and 140),
  description text not null default '' check (char_length(description) <= 5000),
  deal_types text[] not null default '{}',
  price numeric check (price >= 0),
  price_unit text check (char_length(price_unit) <= 40),
  currency text not null default 'INR' check (char_length(currency) = 3),
  quantity numeric check (quantity >= 0),
  quantity_unit text check (char_length(quantity_unit) <= 30),
  country text not null default 'India' check (char_length(country) <= 60),
  state text check (char_length(state) <= 60),
  city text check (char_length(city) <= 80),
  wants_in_exchange text check (char_length(wants_in_exchange) <= 500),
  wants_vertical text check (wants_vertical in ('industrial','commodity','real-assets','storage','barter-tech','projects')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) < 20000),
  status text not null default 'pending' check (status in ('draft','pending','approved','rejected','closed')),
  admin_note text check (char_length(admin_note) <= 500),
  expires_at date,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(subcategory,'') || ' ' || coalesce(description,'')
      || ' ' || coalesce(city,'') || ' ' || coalesce(state,'') || ' ' || coalesce(country,'') || ' ' || coalesce(wants_in_exchange,''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists listings_search_idx on public.listings using gin (search);
create index if not exists listings_browse_idx on public.listings (status, vertical, kind, created_at desc);
create index if not exists listings_owner_idx on public.listings (owner_id);

create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- private documents (KYC, ownership, valuation) ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  kind text not null check (kind in ('business_registration','gst','pan','ownership','invoice','title','quality_certificate','authorisation','valuation_report','other')),
  path text not null check (char_length(path) <= 300),
  file_name text check (char_length(file_name) <= 200),
  review_status text not null default 'submitted' check (review_status in ('submitted','reviewed','rejected')),
  created_at timestamptz not null default now()
);

-- ---------- enquiries and messages ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create table if not exists public.saved_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- integrity triggers ----------
create or replace function public.touch_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists businesses_touch on public.businesses;
create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated();

-- Members can never approve their own listing; editing an approved listing sends it back for review.
create or replace function public.listing_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      if new.owner_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
      if not exists (select 1 from businesses b where b.id = new.business_id and b.owner_id = auth.uid()) then
        raise exception 'create your business profile first';
      end if;
      if new.status not in ('draft','pending') then new.status := 'pending'; end if;
      select count(*) into recent from listings where owner_id = auth.uid() and created_at > now() - interval '1 day';
      if recent >= 25 then raise exception 'daily posting limit reached (25 a day)'; end if;
      new.admin_note := null; new.approved_at := null;
    end if;
  else
    new.updated_at := now();
    if not public.is_admin() then
      if new.owner_id is distinct from old.owner_id or new.business_id is distinct from old.business_id then raise exception 'not allowed'; end if;
      if new.status = 'closed' then
        null; -- owner may close
      elsif new.status not in ('draft','pending') then
        new.status := 'pending';
      end if;
      new.admin_note := old.admin_note; new.approved_at := case when new.status = 'approved' then old.approved_at else null end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists listings_guard on public.listings;
create trigger listings_guard before insert or update on public.listings for each row execute function public.listing_guard();

create or replace function public.message_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  select count(*) into recent from messages where sender_id = auth.uid() and created_at > now() - interval '1 minute';
  if recent >= 20 then raise exception 'too many messages, wait a minute'; end if;
  update conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages for each row execute function public.message_guard();

-- ---------- admin actions (recorded in audit_log) ----------
create or replace function public.admin_review_listing(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_decision not in ('approved','rejected','closed','pending') then raise exception 'bad decision'; end if;
  update listings set status = p_decision, admin_note = left(p_note, 500),
    approved_at = case when p_decision = 'approved' then now() else null end
  where id = p_id;
  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'listing.' || p_decision, 'listing', p_id, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_set_verification(p_business uuid, p_level int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_level < 1 or p_level > 5 then raise exception 'level 1 to 5'; end if;
  update businesses set verification_level = p_level where id = p_business;
  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'business.verification', 'business', p_business, jsonb_build_object('level', p_level, 'note', p_note));
end $$;

create or replace function public.admin_review_document(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_status not in ('submitted','reviewed','rejected') then raise exception 'bad status'; end if;
  update documents set review_status = p_status where id = p_id;
  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'document.' || p_status, 'document', p_id, '{}'::jsonb);
end $$;

-- Starts (or reopens) an enquiry on an approved listing and sends the first message.
create or replace function public.start_enquiry(p_listing uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_seller uuid; v_conv uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select owner_id into v_seller from listings where id = p_listing and status = 'approved';
  if v_seller is null then raise exception 'listing not available'; end if;
  if v_seller = auth.uid() then raise exception 'this is your own listing'; end if;
  insert into conversations (listing_id, buyer_id, seller_id) values (p_listing, auth.uid(), v_seller)
  on conflict (listing_id, buyer_id) do update set last_message_at = now()
  returning id into v_conv;
  insert into messages (conversation_id, sender_id, body) values (v_conv, auth.uid(), left(p_body, 4000));
  return v_conv;
end $$;

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_locations enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.documents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.saved_listings enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

-- profiles: own row, or admins; conversation partners see each other's name only through the view below
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- businesses: public business card (no phone/email stored here); owner edits
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select using (true);
drop policy if exists businesses_insert on public.businesses;
create policy businesses_insert on public.businesses for insert with check (owner_id = auth.uid() and verification_level = 1);
drop policy if exists businesses_update on public.businesses;
create policy businesses_update on public.businesses for update using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists locations_select on public.business_locations;
create policy locations_select on public.business_locations for select using (true);
drop policy if exists locations_write on public.business_locations;
create policy locations_write on public.business_locations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- listings: approved ones are public; owners and admins see their own in any state
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert with check (owner_id = auth.uid());
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete using (owner_id = auth.uid() or public.is_admin());

drop policy if exists photos_select on public.listing_photos;
create policy photos_select on public.listing_photos for select using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'approved' or l.owner_id = auth.uid() or public.is_admin())));
drop policy if exists photos_write on public.listing_photos;
create policy photos_write on public.listing_photos for all using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert with check (owner_id = auth.uid() and review_status = 'submitted');
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete using (owner_id = auth.uid());

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select using (auth.uid() in (buyer_id, seller_id) or public.is_admin());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (auth.uid() in (c.buyer_id, c.seller_id) or public.is_admin())));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));

drop policy if exists saved_all on public.saved_listings;
create policy saved_all on public.saved_listings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update using (public.is_admin());

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (public.is_admin());

-- Names shown in conversations (no email or phone)
create or replace view public.conversation_people with (security_invoker = false) as
  select c.id as conversation_id, c.listing_id, l.title as listing_title,
         c.buyer_id, bb.name as buyer_business, pb.full_name as buyer_name,
         c.seller_id, sb.name as seller_business, ps.full_name as seller_name,
         c.last_message_at
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  left join public.profiles pb on pb.id = c.buyer_id
  left join public.profiles ps on ps.id = c.seller_id
  left join public.businesses bb on bb.owner_id = c.buyer_id
  left join public.businesses sb on sb.owner_id = c.seller_id
  where auth.uid() in (c.buyer_id, c.seller_id) or public.is_admin();

-- ---------- privileges (new tables are not exposed automatically) ----------
grant usage on schema public to anon, authenticated;
grant select on public.businesses, public.business_locations, public.listings, public.listing_photos to anon, authenticated;
grant select on public.profiles, public.documents, public.conversations, public.messages, public.saved_listings, public.reports, public.audit_log to authenticated;
grant select on public.conversation_people to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert on public.businesses to authenticated;
grant update (name, roles, industry, description, products, year_established, website, country, state, city, address, certifications, export_import) on public.businesses to authenticated;
grant insert, update, delete on public.business_locations to authenticated;
grant insert, update, delete on public.listings to authenticated;
grant insert, update, delete on public.listing_photos to authenticated;
grant insert, delete on public.documents to authenticated;
grant insert on public.messages to authenticated;
grant insert, delete on public.saved_listings to authenticated;
grant insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
grant execute on function public.is_admin, public.start_enquiry, public.admin_review_listing, public.admin_set_verification, public.admin_review_document to authenticated;
revoke execute on function public.start_enquiry, public.admin_review_listing, public.admin_set_verification, public.admin_review_document from anon;

-- ---------- storage buckets ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

-- Files live under "<user id>/..." so each member can only write their own folder.
drop policy if exists "photos upload own folder" on storage.objects;
create policy "photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos delete own" on storage.objects;
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents read own or admin" on storage.objects;
create policy "documents read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "documents upload own folder" on storage.objects;
create policy "documents upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents delete own" on storage.objects;
create policy "documents delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
