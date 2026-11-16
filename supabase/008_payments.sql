-- DASKIES online payments (Razorpay): full membership and success fees.
-- Amounts are set on the server (Edge Function pay-order), never by the browser.
-- Payments are marked paid only by the server after Razorpay's signature checks out
-- (pay-verify after checkout, pay-webhook as the backstop). Safe to run more than once.

-- Membership end date. Members cannot set it themselves: profiles only allow
-- column updates on full_name and phone (see 001_schema.sql).
alter table public.profiles add column if not exists member_until timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('membership', 'fee')),
  ref_id uuid,                                   -- deal_fees.id for a success fee
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR',
  description text check (char_length(description) <= 200),
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

alter table public.payments enable row level security;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- Alerts can now be about payments.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'deal', 'listing', 'document', 'verification', 'review', 'payment'));

-- Marks a Razorpay order paid and applies it. Returns 'paid', 'already' or 'unknown'.
create or replace function public.apply_payment(p_order text, p_payment text)
returns text language plpgsql security definer set search_path = public as $$
declare p public.payments; until timestamptz;
begin
  select * into p from public.payments where razorpay_order_id = p_order for update;
  if not found then return 'unknown'; end if;
  if p.status = 'paid' then return 'already'; end if;
  update public.payments set status = 'paid', razorpay_payment_id = left(p_payment, 60), paid_at = now() where id = p.id;
  if p.kind = 'membership' then
    update public.profiles set member_until = greatest(coalesce(member_until, now()), now()) + interval '90 days'
      where id = p.user_id returning member_until into until;
    perform public.notify(p.user_id, 'payment', 'Full membership active',
      'Thank you. Your full membership runs until ' || to_char(until at time zone 'Asia/Kolkata', 'DD Mon YYYY') || '.',
      'dashboard.html', null);
  elsif p.kind = 'fee' then
    update public.deal_fees set status = 'paid', paid_ref = left('razorpay ' || p_payment, 120), updated_at = now()
      where id = p.ref_id and status = 'due';
    perform public.notify(p.user_id, 'payment', 'Success fee paid',
      'Thank you. Your DASKIES success fee is paid; payment and settlement can go ahead once every party has paid.',
      (select 'deal.html?id=' || deal_id from public.deal_fees where id = p.ref_id), null);
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
    values (p.user_id, 'payment_received', 'payment', p.id,
      jsonb_build_object('kind', p.kind, 'amount_paise', p.amount_paise, 'order', p_order, 'payment', p_payment));
  return 'paid';
end $$;

-- Marks an order failed (only while it is still open).
create or replace function public.payment_failed(p_order text)
returns void language sql security definer set search_path = public as $$
  update public.payments set status = 'failed' where razorpay_order_id = p_order and status = 'created';
$$;

revoke all on function public.apply_payment(text, text) from public, anon, authenticated;
revoke all on function public.payment_failed(text) from public, anon, authenticated;
grant execute on function public.apply_payment(text, text) to service_role;
grant execute on function public.payment_failed(text) to service_role;

-- Admins see every payment with the member's name and business.
create or replace function public.admin_payments()
returns table (id uuid, created_at timestamptz, paid_at timestamptz, kind text, status text, amount_paise bigint,
  description text, razorpay_order_id text, razorpay_payment_id text, full_name text, email text, business text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select pm.id, pm.created_at, pm.paid_at, pm.kind, pm.status, pm.amount_paise, pm.description,
      pm.razorpay_order_id, pm.razorpay_payment_id, pr.full_name, u.email::text, b.name
    from public.payments pm
    join public.profiles pr on pr.id = pm.user_id
    left join auth.users u on u.id = pm.user_id
    left join public.businesses b on b.owner_id = pm.user_id
    order by pm.created_at desc limit 500;
end $$;
revoke all on function public.admin_payments() from public, anon;
grant execute on function public.admin_payments() to authenticated;
