-- DASKIES deals (P1): offers, counteroffers, all-party approval and deal stages.
-- Nothing here is binding: a deal only reaches "terms agreed" when EVERY party has approved the same offer.
-- Run after 001_schema.sql, in staging first, then production.

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sale','purchase','lease','barter','multi_barter','commodity','service','partnership')),
  title text not null check (char_length(title) between 3 and 160),
  created_by uuid not null references public.profiles(id) on delete cascade,
  stage text not null default 'enquiry' check (stage in ('enquiry','discussion','offer','counteroffer','terms_agreed','due_diligence','documentation','contract_signed','settlement','delivery','completed','cancelled')),
  currency text not null default 'INR' check (char_length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deal_parties (
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  position smallint not null default 0,
  approved boolean not null default false,
  completed boolean not null default false,
  primary key (deal_id, user_id)
);

create table if not exists public.deal_offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  version int not null,
  terms jsonb not null check (pg_column_size(terms) < 20000),
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','superseded')),
  created_at timestamptz not null default now(),
  unique (deal_id, version)
);

create table if not exists public.deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists deal_events_idx on public.deal_events (deal_id, created_at);
create index if not exists deal_parties_user_idx on public.deal_parties (user_id);

create or replace function public.is_party(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deal_parties where deal_id = p_deal and user_id = auth.uid());
$$;

-- Start a deal. p_listings: listing ids in chain order. For a 2-party deal pass [their listing] or
-- [my listing, their listing]; for a barter chain pass every listing in the chain (me first).
create or replace function public.create_deal(p_kind text, p_title text, p_listings uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare d uuid; l record; lid uuid; i int := 0; owners uuid[] := '{}'; cur text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_kind not in ('sale','purchase','lease','barter','multi_barter','commodity','service','partnership') then raise exception 'bad deal type'; end if;
  if array_length(p_listings, 1) is null or array_length(p_listings, 1) > 6 then raise exception 'choose 1 to 6 listings'; end if;
  select currency into cur from listings where id = p_listings[1];
  insert into deals (kind, title, created_by, currency) values (p_kind, left(p_title, 160), auth.uid(), coalesce(cur, 'INR')) returning id into d;
  foreach lid in array p_listings loop
    select id, owner_id, status into l from listings where id = lid;
    if not found then raise exception 'listing not found'; end if;
    if l.owner_id is null then raise exception 'listing not found'; end if;
    if l.status <> 'approved' and l.owner_id <> auth.uid() then raise exception 'one of the listings is not live'; end if;
    if l.owner_id = any(owners) then raise exception 'each business can appear only once'; end if;
    owners := owners || l.owner_id;
    insert into deal_parties (deal_id, user_id, listing_id, position) values (d, l.owner_id, l.id, i);
    i := i + 1;
  end loop;
  if not (auth.uid() = any(owners)) then
    insert into deal_parties (deal_id, user_id, listing_id, position) values (d, auth.uid(), null, i);
    i := i + 1;
  end if;
  if i < 2 then raise exception 'a deal needs at least two businesses'; end if;
  insert into deal_events (deal_id, actor_id, type, detail) values (d, auth.uid(), 'created', jsonb_build_object('parties', i));
  return d;
end $$;

create or replace function public.make_offer(p_deal uuid, p_terms jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v int; o uuid; st text;
begin
  if not public.is_party(p_deal) then raise exception 'not part of this deal'; end if;
  select stage into st from deals where id = p_deal for update;
  if st not in ('enquiry','discussion','offer','counteroffer') then raise exception 'terms are already agreed or the deal is closed'; end if;
  update deal_offers set status = 'superseded' where deal_id = p_deal and status = 'proposed';
  select coalesce(max(version), 0) + 1 into v from deal_offers where deal_id = p_deal;
  insert into deal_offers (deal_id, author_id, version, terms) values (p_deal, auth.uid(), v, p_terms) returning id into o;
  update deal_parties set approved = (user_id = auth.uid()) where deal_id = p_deal;
  update deals set stage = case when v = 1 then 'offer' else 'counteroffer' end, updated_at = now() where id = p_deal;
  insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), case when v = 1 then 'offer' else 'counteroffer' end, jsonb_build_object('version', v));
  return o;
end $$;

create or replace function public.approve_terms(p_deal uuid, p_offer uuid)
returns text language plpgsql security definer set search_path = public as $$
declare pending int;
begin
  if not public.is_party(p_deal) then raise exception 'not part of this deal'; end if;
  if not exists (select 1 from deal_offers where id = p_offer and deal_id = p_deal and status = 'proposed') then raise exception 'that offer is no longer open'; end if;
  update deal_parties set approved = true where deal_id = p_deal and user_id = auth.uid();
  insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), 'approved', jsonb_build_object('offer', p_offer));
  select count(*) into pending from deal_parties where deal_id = p_deal and not approved;
  if pending = 0 then
    update deal_offers set status = 'accepted' where id = p_offer;
    update deals set stage = 'terms_agreed', updated_at = now() where id = p_deal;
    insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), 'terms_agreed', jsonb_build_object('offer', p_offer));
    return 'terms_agreed';
  end if;
  return 'waiting';
end $$;

create or replace function public.reject_offer(p_deal uuid, p_offer uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_party(p_deal) then raise exception 'not part of this deal'; end if;
  update deal_offers set status = 'rejected' where id = p_offer and deal_id = p_deal and status = 'proposed';
  if not found then raise exception 'that offer is no longer open'; end if;
  update deal_parties set approved = false where deal_id = p_deal;
  update deals set stage = 'counteroffer', updated_at = now() where id = p_deal;
  insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), 'rejected', jsonb_build_object('offer', p_offer, 'reason', left(p_reason, 500)));
end $$;

-- After terms are agreed, any party can move the deal one step forward. Completion needs every party.
create or replace function public.advance_stage(p_deal uuid, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare st text; nxt text; seq text[] := array['terms_agreed','due_diligence','documentation','contract_signed','settlement','delivery'];
begin
  if not public.is_party(p_deal) then raise exception 'not part of this deal'; end if;
  select stage into st from deals where id = p_deal for update;
  if st = 'enquiry' then nxt := 'discussion';
  elsif st = 'delivery' then raise exception 'use Confirm completion';
  elsif array_position(seq, st) is null then raise exception 'agree the terms first';
  else nxt := seq[array_position(seq, st) + 1];
  end if;
  update deals set stage = nxt, updated_at = now() where id = p_deal;
  insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), 'stage', jsonb_build_object('from', st, 'to', nxt, 'note', left(p_note, 500)));
  return nxt;
end $$;

create or replace function public.confirm_completion(p_deal uuid)
returns text language plpgsql security definer set search_path = public as $$
declare st text; pending int;
begin
  if not public.is_party(p_deal) then raise exception 'not part of this deal'; end if;
  select stage into st from deals where id = p_deal for update;
  if st <> 'delivery' then raise exception 'completion is confirmed after delivery'; end if;
  update deal_parties set completed = true where deal_id = p_deal and user_id = auth.uid();
  insert into deal_events (deal_id, actor_id, type) values (p_deal, auth.uid(), 'confirmed_completion');
  select count(*) into pending from deal_parties where deal_id = p_deal and not completed;
  if pending = 0 then
    update deals set stage = 'completed', updated_at = now() where id = p_deal;
    insert into deal_events (deal_id, actor_id, type) values (p_deal, auth.uid(), 'completed');
    return 'completed';
  end if;
  return 'waiting';
end $$;

create or replace function public.cancel_deal(p_deal uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_party(p_deal) or public.is_admin()) then raise exception 'not part of this deal'; end if;
  update deals set stage = 'cancelled', updated_at = now() where id = p_deal and stage not in ('completed','cancelled');
  if not found then raise exception 'deal is already closed'; end if;
  update deal_offers set status = 'superseded' where deal_id = p_deal and status = 'proposed';
  insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), 'cancelled', jsonb_build_object('reason', left(p_reason, 500)));
end $$;

create or replace function public.deal_note(p_deal uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_party(p_deal) then raise exception 'not part of this deal'; end if;
  if char_length(coalesce(p_note, '')) < 1 then raise exception 'empty note'; end if;
  insert into deal_events (deal_id, actor_id, type, detail) values (p_deal, auth.uid(), 'note', jsonb_build_object('note', left(p_note, 2000)));
end $$;

-- Party names and what each gives (no emails or phones)
create or replace view public.deal_party_view with (security_invoker = false) as
  select p.deal_id, p.user_id, p.position, p.approved, p.completed, p.listing_id,
         b.name as business, b.verification_level, l.title as listing_title, l.price, l.currency, l.price_unit, l.vertical
  from public.deal_parties p
  left join public.businesses b on b.owner_id = p.user_id
  left join public.listings l on l.id = p.listing_id
  where public.is_party(p.deal_id) or public.is_admin();

alter table public.deals enable row level security;
alter table public.deal_parties enable row level security;
alter table public.deal_offers enable row level security;
alter table public.deal_events enable row level security;

drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select using (public.is_party(id) or public.is_admin());
drop policy if exists deal_parties_select on public.deal_parties;
create policy deal_parties_select on public.deal_parties for select using (public.is_party(deal_id) or public.is_admin());
drop policy if exists deal_offers_select on public.deal_offers;
create policy deal_offers_select on public.deal_offers for select using (public.is_party(deal_id) or public.is_admin());
drop policy if exists deal_events_select on public.deal_events;
create policy deal_events_select on public.deal_events for select using (public.is_party(deal_id) or public.is_admin());

-- All writes go through the functions above; members get read access only.
grant select on public.deals, public.deal_parties, public.deal_offers, public.deal_events, public.deal_party_view to authenticated;
revoke execute on function public.create_deal, public.make_offer, public.approve_terms, public.reject_offer, public.advance_stage, public.confirm_completion, public.cancel_deal, public.deal_note from anon, public;
grant execute on function public.is_party, public.create_deal, public.make_offer, public.approve_terms, public.reject_offer, public.advance_stage, public.confirm_completion, public.cancel_deal, public.deal_note to authenticated;
