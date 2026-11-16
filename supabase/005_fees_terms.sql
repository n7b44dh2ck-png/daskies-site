-- DASKIES Terms acceptance and success fees.
-- 1. Every member accepts the current Terms (which set out the success fee) before using DASKIES.
-- 2. When a deal reaches Payment / settlement, each party's success fee is worked out privately:
--    5% of the agreed value of what that party gives (the agreed price for a sale), plus GST.
--    Each party sees only their own fee. Delivery opens once every party's fee is paid or waived.
-- 3. Admins can adjust the value or rate (e.g. above Rs 1 crore, or from the valuation report), mark paid, or waive.
-- Run after 001-004, in staging first, then production.

-- ---------- Terms ----------
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.current_terms_version() returns text
language sql immutable as $$ select '2026-11-16'::text $$;
grant execute on function public.current_terms_version() to anon, authenticated;

create or replace function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_version is distinct from public.current_terms_version() then
    raise exception 'The Terms have been updated. Reload the page to read and accept the latest version.';
  end if;
  update profiles set terms_version = p_version, terms_accepted_at = now() where id = auth.uid();
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- Complete = every mandatory detail AND the current Terms accepted.
create or replace function public.profile_complete(p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
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
      and p.terms_version = public.current_terms_version()
  );
end $$;

-- ---------- Success fees ----------
create table if not exists public.deal_fees (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  basis numeric not null default 0 check (basis >= 0),
  rate numeric not null default 5 check (rate >= 0 and rate <= 20),
  gst_rate numeric not null default 18 check (gst_rate >= 0 and gst_rate <= 28),
  fee numeric generated always as (round(basis * rate / 100, 2)) stored,
  gst numeric generated always as (round(round(basis * rate / 100, 2) * gst_rate / 100, 2)) stored,
  currency text not null default 'INR',
  basis_source text not null default 'agreed' check (basis_source in ('agreed', 'valuation', 'admin', 'none')),
  status text not null default 'due' check (status in ('due', 'paid', 'waived', 'cancelled')),
  note text check (char_length(note) <= 500),
  paid_ref text check (char_length(paid_ref) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, user_id)
);
create index if not exists deal_fees_status_idx on public.deal_fees (status, created_at desc);

alter table public.deal_fees enable row level security;
drop policy if exists deal_fees_select on public.deal_fees;
create policy deal_fees_select on public.deal_fees for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.deal_fees from anon, authenticated;
grant select on public.deal_fees to authenticated;

create or replace function public.safe_amount(p text) returns numeric
language sql immutable as $$ select case when btrim(coalesce(p, '')) ~ '^[0-9]+(\.[0-9]+)?$' then btrim(p)::numeric end $$;

-- Works out fees when a deal enters Payment / settlement; cancels open fees when a deal is cancelled.
create or replace function public.deal_fee_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare t jsonb; p record; v numeric; src text; big boolean;
begin
  if new.stage = 'settlement' and old.stage is distinct from 'settlement' then
    select terms into t from deal_offers where deal_id = new.id and status = 'accepted' order by version desc limit 1;
    t := coalesce(t, '{}'::jsonb);
    for p in select user_id, listing_id from deal_parties where deal_id = new.id loop
      v := public.safe_amount(t -> 'values' ->> p.user_id::text);
      if v is null then v := public.safe_amount(t ->> 'price'); end if;
      if v is null and p.listing_id is not null then select price into v from listings where id = p.listing_id; end if;
      src := case when v is null then 'none' else 'agreed' end;
      big := new.currency = 'INR' and coalesce(v, 0) > 10000000;
      insert into deal_fees (deal_id, user_id, basis, rate, currency, basis_source, note)
      values (new.id, p.user_id, coalesce(v, 0), 5, new.currency, src,
        case when v is null then 'DASKIES will confirm the deal value with you.'
             when big then 'Deals above Rs 1 crore: the rate is open to agreement with DASKIES.' end)
      on conflict (deal_id, user_id) do nothing;
      perform notify(p.user_id, 'deal', 'Your DASKIES success fee for ' || new.title, 'Due at payment and settlement, before delivery.',
        'deal.html?id=' || new.id, 'fee:' || new.id);
    end loop;
  elsif new.stage = 'cancelled' and old.stage is distinct from 'cancelled' then
    update deal_fees set status = 'cancelled', updated_at = now() where deal_id = new.id and status = 'due';
  end if;
  return null;
end $$;
drop trigger if exists deals_fee_stage on public.deals;
create trigger deals_fee_stage after update on public.deals for each row execute function public.deal_fee_stage();

-- Delivery opens only once every party's fee is paid or waived.
create or replace function public.deal_fee_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.stage = 'settlement' and new.stage = 'delivery'
     and exists (select 1 from deal_fees where deal_id = new.id and status = 'due') then
    raise exception 'Delivery opens once every party has settled their DASKIES success fee.';
  end if;
  return new;
end $$;
drop trigger if exists deals_fee_gate on public.deals;
create trigger deals_fee_gate before update on public.deals for each row execute function public.deal_fee_gate();

revoke all on function public.deal_fee_stage(), public.deal_fee_gate() from public, anon, authenticated;

-- Admin: set the value (e.g. from the valuation report) or rate, mark paid, waive, or reopen.
create or replace function public.admin_update_fee(p_id uuid, p_status text default null, p_basis numeric default null,
  p_rate numeric default null, p_note text default null, p_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_status is not null and p_status not in ('due', 'paid', 'waived') then raise exception 'bad status'; end if;
  select * into f from deal_fees where id = p_id;
  if not found then raise exception 'fee not found'; end if;
  update deal_fees set
    status = coalesce(p_status, status),
    basis = coalesce(p_basis, basis),
    basis_source = case when p_basis is not null then 'admin' else basis_source end,
    rate = coalesce(p_rate, rate),
    note = coalesce(left(p_note, 500), note),
    paid_ref = case when p_status = 'paid' then left(p_ref, 120) else paid_ref end,
    updated_at = now()
  where id = p_id;
  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'fee.update', 'deal_fee', p_id, jsonb_build_object('status', p_status, 'basis', p_basis, 'rate', p_rate, 'note', p_note, 'ref', p_ref));
  if p_status = 'paid' and f.status <> 'paid' then
    perform notify(f.user_id, 'deal', 'DASKIES received your success fee', null, 'deal.html?id=' || f.deal_id, 'fee:' || f.deal_id);
  elsif p_status is null and (p_basis is not null or p_rate is not null) then
    perform notify(f.user_id, 'deal', 'Your DASKIES success fee was updated', p_note, 'deal.html?id=' || f.deal_id, 'fee:' || f.deal_id);
  end if;
end $$;
revoke all on function public.admin_update_fee(uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.admin_update_fee(uuid, text, numeric, numeric, text, text) to authenticated;

-- Admin list of fees with deal and business names.
create or replace function public.admin_fees()
returns table (id uuid, deal_id uuid, deal_title text, stage text, user_id uuid, business text, basis numeric, rate numeric,
  fee numeric, gst numeric, currency text, basis_source text, status text, note text, paid_ref text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select f.id, f.deal_id, d.title, d.stage, f.user_id, (select b.name from businesses b where b.owner_id = f.user_id),
      f.basis, f.rate, f.fee, f.gst, f.currency, f.basis_source, f.status, f.note, f.paid_ref, f.created_at
    from deal_fees f join deals d on d.id = f.deal_id
    order by (f.status = 'due') desc, f.created_at desc;
end $$;
revoke all on function public.admin_fees() from public, anon;
grant execute on function public.admin_fees() to authenticated;
