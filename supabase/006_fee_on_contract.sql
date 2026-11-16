-- DASKIES: the success fee falls due when the contract is signed (not at settlement).
-- When a deal reaches "Contract signed", each party's fee is worked out privately; the deal can move on to
-- Payment / settlement only once every party's fee is paid or waived. Fees are non-refundable.
-- Run after 005, in staging first, then production.

create or replace function public.deal_fee_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare t jsonb; p record; v numeric; src text; big boolean;
begin
  if new.stage = 'contract_signed' and old.stage is distinct from 'contract_signed' then
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
             when big then 'Deals above Rs 1 crore: the rate is as agreed in writing with DASKIES.' end)
      on conflict (deal_id, user_id) do nothing;
      perform notify(p.user_id, 'deal', 'Your DASKIES success fee for ' || new.title, 'Due on signing the contract, before payment and settlement.',
        'deal.html?id=' || new.id, 'fee:' || new.id);
    end loop;
  elsif new.stage = 'cancelled' and old.stage is distinct from 'cancelled' then
    update deal_fees set status = 'cancelled', updated_at = now() where deal_id = new.id and status = 'due';
  end if;
  return null;
end $$;

create or replace function public.deal_fee_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.stage = 'contract_signed' and new.stage = 'settlement'
     and exists (select 1 from deal_fees where deal_id = new.id and status = 'due') then
    raise exception 'Payment and settlement open once every party has paid their DASKIES success fee.';
  end if;
  return new;
end $$;
