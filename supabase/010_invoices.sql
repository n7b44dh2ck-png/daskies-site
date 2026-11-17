-- 010: GST tax invoices for online payments, issued and numbered by the database.
-- Every paid payment gets one invoice, numbered consecutively in each financial year (DSK/2026-27/0001).
-- The invoice keeps a copy of the supplier's details (entered by an admin in Admin > Invoices) and the
-- buyer's business details as they were on the day, so it never changes afterwards.
-- GST split: CGST + SGST when the buyer is in the supplier's state, IGST when in another state,
-- and none for a buyer outside India when the payment was taken without GST (export under LUT).
-- The Edge Function send-invoice emails it. Safe to run more than once.

-- What was charged, split into the taxable value and the GST (set by pay-order).
alter table public.payments add column if not exists taxable_paise bigint check (taxable_paise is null or taxable_paise >= 0);
alter table public.payments add column if not exists gst_paise bigint check (gst_paise is null or gst_paise >= 0);

-- ---------- supplier details ----------
create table if not exists public.invoice_settings (
  id smallint primary key default 1 check (id = 1),
  legal_name text check (char_length(legal_name) <= 160),          -- exactly as on the GST registration
  trade_name text not null default 'DASKIES' check (char_length(trade_name) <= 80),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  address text check (char_length(address) <= 300),
  city text check (char_length(city) <= 80),
  state text check (char_length(state) <= 80),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{6}$'),
  email text not null default 'info@daskies.com' check (char_length(email) <= 120),
  sac_membership text not null default '998599' check (sac_membership ~ '^[0-9]{4,8}$'),
  sac_fee text not null default '998599' check (sac_fee ~ '^[0-9]{4,8}$'),
  lut_number text check (char_length(lut_number) <= 40),             -- Letter of Undertaking, for export of services
  updated_at timestamptz not null default now()
);
insert into public.invoice_settings (id) values (1) on conflict (id) do nothing;
alter table public.invoice_settings enable row level security;
drop policy if exists invoice_settings_select on public.invoice_settings;
create policy invoice_settings_select on public.invoice_settings for select using (public.is_admin());
drop policy if exists invoice_settings_update on public.invoice_settings;
create policy invoice_settings_update on public.invoice_settings for update using (public.is_admin()) with check (public.is_admin());
revoke all on public.invoice_settings from anon, authenticated;
grant select on public.invoice_settings to authenticated;
grant update (legal_name, trade_name, gstin, address, city, state, postal_code, email, sac_membership, sac_fee, lut_number, updated_at)
  on public.invoice_settings to authenticated;

create or replace function public.invoice_settings_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select char_length(btrim(coalesce(legal_name, ''))) >= 2 and gstin is not null
    and char_length(btrim(coalesce(address, ''))) >= 5 and char_length(btrim(coalesce(city, ''))) >= 2
    and char_length(btrim(coalesce(state, ''))) >= 2 and postal_code is not null
    from public.invoice_settings where id = 1), false);
$$;
revoke all on function public.invoice_settings_ready() from public, anon;
grant execute on function public.invoice_settings_ready() to authenticated, service_role;

-- GST state code from a GSTIN (its first two digits) or, failing that, the state's name.
create or replace function public.gst_state_code(p_state text, p_gstin text default null) returns text
language sql immutable set search_path = public as $$
  select coalesce(
    case when coalesce(p_gstin, '') ~ '^[0-9]{2}[A-Z]' then left(p_gstin, 2) end,
    (select s.c from (values
      ('jammuandkashmir','01'),('himachalpradesh','02'),('punjab','03'),('chandigarh','04'),('uttarakhand','05'),('uttaranchal','05'),
      ('haryana','06'),('delhi','07'),('newdelhi','07'),('nctofdelhi','07'),('rajasthan','08'),('uttarpradesh','09'),('bihar','10'),
      ('sikkim','11'),('arunachalpradesh','12'),('nagaland','13'),('manipur','14'),('mizoram','15'),('tripura','16'),('meghalaya','17'),
      ('assam','18'),('westbengal','19'),('jharkhand','20'),('odisha','21'),('orissa','21'),('chhattisgarh','22'),('madhyapradesh','23'),
      ('gujarat','24'),('dadraandnagarhavelianddamananddiu','26'),('damananddiu','26'),('dadraandnagarhaveli','26'),('maharashtra','27'),
      ('karnataka','29'),('goa','30'),('lakshadweep','31'),('kerala','32'),('tamilnadu','33'),('puducherry','34'),('pondicherry','34'),
      ('andamanandnicobarislands','35'),('telangana','36'),('andhrapradesh','37'),('ladakh','38')) s(n, c)
     where s.n = regexp_replace(replace(lower(coalesce(p_state, '')), '&', 'and'), '[^a-z]', '', 'g')));
$$;

-- ---------- invoices ----------
create table if not exists public.invoice_counters (fy text primary key, last_no integer not null default 0);
alter table public.invoice_counters enable row level security;
revoke all on public.invoice_counters from anon, authenticated;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid unique references public.payments(id) on delete set null,   -- kept even if the account is deleted
  user_id uuid references public.profiles(id) on delete set null,
  number text not null unique check (char_length(number) <= 16),
  fy text not null,
  issued_at timestamptz not null default now(),
  kind text not null check (kind in ('membership', 'fee')),
  description text not null,
  sac text not null,
  supplier jsonb not null,
  buyer jsonb not null,
  place_of_supply text not null,
  taxable_paise bigint not null check (taxable_paise >= 0),
  cgst_paise bigint not null default 0, sgst_paise bigint not null default 0, igst_paise bigint not null default 0,
  total_paise bigint not null check (total_paise > 0),
  zero_rated boolean not null default false,
  payment_ref text,
  paid_at timestamptz,
  emailed_at timestamptz, email_to text, email_error text, email_claimed_at timestamptz,
  check (taxable_paise + cgst_paise + sgst_paise + igst_paise = total_paise)
);
create index if not exists invoices_user_idx on public.invoices (user_id, issued_at desc);
alter table public.invoices enable row level security;
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;

-- Issues the invoice for a paid payment (once). Returns its id, or null while the supplier details are incomplete.
create or replace function public._issue_invoice(p_payment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.payments; s public.invoice_settings; b public.businesses; bp public.business_private; pr public.profiles;
  em text; inv uuid; d date; y int; fy text; n int; sc text; bc text; india boolean;
  taxable bigint; tax bigint; c bigint := 0; sg bigint := 0; ig bigint := 0; zero boolean := false; descr text; sac text;
begin
  select * into p from public.payments where id = p_payment;
  if not found or p.status <> 'paid' then return null; end if;
  select id into inv from public.invoices where payment_id = p.id;
  if inv is not null then return inv; end if;
  if not public.invoice_settings_ready() then return null; end if;
  select * into s from public.invoice_settings where id = 1;
  select * into pr from public.profiles where id = p.user_id;
  select * into b from public.businesses where owner_id = p.user_id order by created_at limit 1;
  select * into bp from public.business_private where business_id = b.id;
  select email into em from auth.users where id = p.user_id;

  india := lower(btrim(coalesce(b.country, 'India'))) in ('india', 'in', 'bharat');
  sc := left(s.gstin, 2);
  bc := case when india then coalesce(public.gst_state_code(b.state, bp.gstin), sc) end;
  taxable := coalesce(p.taxable_paise, round(p.amount_paise * 100.0 / 118)::bigint);
  tax := p.amount_paise - taxable;
  if tax = 0 and not india then zero := true;
  elsif india and bc = sc then c := tax / 2; sg := tax - c;
  else ig := tax; end if;

  d := (coalesce(p.paid_at, now()) at time zone 'Asia/Kolkata')::date;
  y := extract(year from d)::int;
  fy := case when extract(month from d) >= 4 then y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0')
             else (y - 1)::text || '-' || lpad((y % 100)::text, 2, '0') end;
  insert into public.invoice_counters (fy, last_no) values (fy, 1)
    on conflict (fy) do update set last_no = public.invoice_counters.last_no + 1 returning last_no into n;

  if p.kind = 'membership' then descr := 'DASKIES full membership, 90 days'; sac := s.sac_membership;
  else descr := left('DASKIES success fee: ' || coalesce((select dl.title from public.deal_fees f join public.deals dl on dl.id = f.deal_id where f.id = p.ref_id), 'deal'), 160); sac := s.sac_fee;
  end if;

  insert into public.invoices (payment_id, user_id, number, fy, issued_at, kind, description, sac, supplier, buyer, place_of_supply,
      taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, zero_rated, payment_ref, paid_at)
  values (p.id, p.user_id, 'DSK/' || fy || '/' || lpad(n::text, 4, '0'), fy, now(), p.kind, descr, sac,
    jsonb_build_object('legal_name', s.legal_name, 'trade_name', s.trade_name, 'gstin', s.gstin, 'address', s.address, 'city', s.city,
      'state', s.state, 'state_code', sc, 'postal_code', s.postal_code, 'email', s.email, 'lut_number', s.lut_number),
    jsonb_build_object('name', pr.full_name, 'business', b.name, 'address', bp.address, 'city', b.city, 'state', b.state, 'state_code', bc,
      'postal_code', bp.postal_code, 'country', coalesce(b.country, 'India'), 'gstin', bp.gstin, 'email', em),
    case when india then coalesce(b.state, s.state) || ' (' || bc || ')' else 'Outside India (' || coalesce(b.country, '') || ')' end,
    taxable, c, sg, ig, p.amount_paise, zero, p.razorpay_payment_id, p.paid_at)
  returning id into inv;
  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
    values (p.user_id, 'invoice_issued', 'invoice', inv, jsonb_build_object('payment', p.id, 'fy', fy, 'no', n));
  return inv;
end $$;
revoke all on function public._issue_invoice(uuid) from public, anon, authenticated;
grant execute on function public._issue_invoice(uuid) to service_role;

-- Admins can issue the invoice for a paid payment that has none yet (e.g. paid before the details were complete).
create or replace function public.issue_invoice(p_payment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if not public.invoice_settings_ready() then raise exception 'Fill in the supplier details in Admin > Invoices first.'; end if;
  return public._issue_invoice(p_payment);
end $$;
revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- Every payment that becomes paid gets its invoice in the same step. A failure here never blocks the payment.
create or replace function public.payments_issue_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    begin
      perform public._issue_invoice(new.id);
    exception when others then
      insert into public.audit_log (actor_id, action, entity, entity_id, detail)
        values (new.user_id, 'invoice_failed', 'payment', new.id, jsonb_build_object('error', left(sqlerrm, 300)));
    end;
  end if;
  return null;
end $$;
revoke all on function public.payments_issue_invoice() from public, anon, authenticated;
drop trigger if exists payments_invoice on public.payments;
create trigger payments_invoice after insert or update of status on public.payments for each row execute function public.payments_issue_invoice();

-- send-invoice claims an invoice before emailing it, so two calls never send it twice.
create or replace function public.claim_invoice_email(p_invoice uuid, p_force boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.invoices set email_claimed_at = now()
    where id = p_invoice and (p_force or emailed_at is null)
      and (email_claimed_at is null or email_claimed_at < now() - interval '10 minutes');
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.claim_invoice_email(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_invoice_email(uuid, boolean) to service_role;
