-- DASKIES invoices test (run on STAGING only: it uses invoice numbers). Checks: no invoice without complete supplier details;
-- a paid payment gets one invoice; numbers run on; CGST+SGST in the supplier's state, IGST elsewhere, none for export under LUT;
-- members see only their own invoices and can't touch settings. Restores the settings and counter, and cleans up.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  gj uuid := gen_random_uuid(); mh uuid := gen_random_uuid(); ae uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  saved public.invoice_settings; fy0 int; fyk text; i public.invoices; n int; p1 uuid; p2 uuid; p3 uuid; p0 uuid; first_no int; ok boolean;
begin
  select * into saved from public.invoice_settings where id = 1;
  fyk := case when extract(month from (now() at time zone 'Asia/Kolkata')) >= 4
    then extract(year from (now() at time zone 'Asia/Kolkata'))::int::text || '-' || lpad(((extract(year from (now() at time zone 'Asia/Kolkata'))::int + 1) % 100)::text, 2, '0')
    else (extract(year from (now() at time zone 'Asia/Kolkata'))::int - 1)::text || '-' || lpad((extract(year from (now() at time zone 'Asia/Kolkata'))::int % 100)::text, 2, '0') end;
  select last_no into fy0 from public.invoice_counters where fy = fyk;

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (gj,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','inv-gj@test.invalid','{"full_name":"Inv Gujarat"}',now(),now()),
   (mh,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','inv-mh@test.invalid','{"full_name":"Inv Mumbai"}',now(),now()),
   (ae,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','inv-ae@test.invalid','{"full_name":"Inv Dubai"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','inv-adm@test.invalid','{"full_name":"Inv Admin"}',now(),now());
  update public.profiles set is_admin = true where id = adm;
  insert into public.businesses (owner_id, name, roles, city, state, country) values
    (gj, 'Inv Gujarat Works', '{Seller}', 'Rajkot', 'Gujarat', 'India'), (mh, 'Inv Mumbai Traders', '{Buyer}', 'Mumbai', 'Maharashtra', 'India'),
    (ae, 'Inv Dubai LLC', '{Buyer}', 'Dubai', 'Dubai', 'United Arab Emirates');
  insert into public.business_private (business_id, owner_id, address, postal_code, gstin)
    select id, owner_id, '1 Test Road', '360001', case when owner_id = gj then '24AAAAA0000A1Z5' end
    from public.businesses where owner_id in (gj, mh, ae);

  -- ===== no invoice while the supplier details are incomplete =====
  update public.invoice_settings set legal_name = null, gstin = null where id = 1;
  insert into public.payments (user_id, kind, amount_paise, taxable_paise, gst_paise, razorpay_order_id, status) values (gj, 'membership', 1770000, 1500000, 270000, 'order_invtest_0', 'created') returning id into p0;
  perform public.apply_payment('order_invtest_0', 'pay_invtest_0');
  insert into rt(step, result) values ('no invoice while the supplier details are incomplete', case when not exists (select 1 from public.invoices where payment_id = p0) and (select status from public.payments where id = p0) = 'paid' then 'PASS' else 'FAIL' end);

  -- ===== complete the details =====
  update public.invoice_settings set legal_name = 'Invoice Test Supplier', gstin = '24ABCDE1234F1Z9', address = '12 Test Business Park', city = 'Ahmedabad', state = 'Gujarat', postal_code = '380054', lut_number = 'LUTTEST01' where id = 1;
  insert into rt(step, result) values ('details complete', case when public.invoice_settings_ready() then 'PASS' else 'FAIL' end);

  -- Gujarat buyer: CGST + SGST
  insert into public.payments (user_id, kind, amount_paise, taxable_paise, gst_paise, razorpay_order_id, status) values (gj, 'membership', 1770000, 1500000, 270000, 'order_invtest_1', 'created') returning id into p1;
  perform public.apply_payment('order_invtest_1', 'pay_invtest_1');
  select * into i from public.invoices where payment_id = p1;
  first_no := right(i.number, 4)::int;
  insert into rt(step, result) values ('a paid payment gets an invoice, numbered for this financial year', case when i.id is not null and i.number = 'DSK/' || fyk || '/' || lpad(first_no::text, 4, '0') then 'PASS' else 'FAIL ' || coalesce(i.number, 'none') end);
  insert into rt(step, result) values ('Gujarat buyer: CGST 1,350 + SGST 1,350', case when i.cgst_paise = 135000 and i.sgst_paise = 135000 and i.igst_paise = 0 and i.taxable_paise = 1500000 and i.place_of_supply = 'Gujarat (24)' then 'PASS' else 'FAIL' end);
  insert into rt(step, result) values ('the invoice keeps the buyer''s GSTIN and email', case when i.buyer->>'gstin' = '24AAAAA0000A1Z5' and i.buyer->>'email' = 'inv-gj@test.invalid' and i.supplier->>'gstin' = '24ABCDE1234F1Z9' then 'PASS' else 'FAIL' end);
  perform public.apply_payment('order_invtest_1', 'pay_invtest_1');
  select count(*) into n from public.invoices where payment_id = p1;
  insert into rt(step, result) values ('recording the payment twice gives one invoice', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- Maharashtra buyer: IGST, next number
  insert into public.payments (user_id, kind, amount_paise, taxable_paise, gst_paise, razorpay_order_id, status) values (mh, 'membership', 1770000, 1500000, 270000, 'order_invtest_2', 'created') returning id into p2;
  perform public.apply_payment('order_invtest_2', 'pay_invtest_2');
  select * into i from public.invoices where payment_id = p2;
  insert into rt(step, result) values ('Maharashtra buyer: IGST 2,700, the next number', case when i.igst_paise = 270000 and i.cgst_paise = 0 and i.place_of_supply = 'Maharashtra (27)' and right(i.number, 4)::int = first_no + 1 then 'PASS' else 'FAIL ' || i.number end);

  -- Buyer outside India paying without GST under LUT
  insert into public.payments (user_id, kind, amount_paise, taxable_paise, gst_paise, razorpay_order_id, status) values (ae, 'membership', 1500000, 1500000, 0, 'order_invtest_3', 'created') returning id into p3;
  perform public.apply_payment('order_invtest_3', 'pay_invtest_3');
  select * into i from public.invoices where payment_id = p3;
  insert into rt(step, result) values ('export under LUT: zero-rated, no GST', case when i.zero_rated and i.igst_paise = 0 and i.cgst_paise = 0 and i.total_paise = 1500000 and i.place_of_supply like 'Outside India%' then 'PASS' else 'FAIL' end);

  -- the payment made while details were incomplete: admins can issue it now
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.issue_invoice(p0);
  select count(*) into n from public.invoices;
  insert into rt(step, result) values ('admins see all invoices and can issue a missing one', case when exists (select 1 from public.invoices where payment_id = p0) and n >= 4 then 'PASS' else 'FAIL' end);
  perform set_config('role', 'none', true);

  -- ===== members =====
  perform set_config('request.jwt.claims', json_build_object('sub', mh, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.invoices;
  insert into rt(step, result) values ('a member sees only their own invoice', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.invoice_settings;
  insert into rt(step, result) values ('members cannot read the supplier settings', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  begin
    update public.invoice_settings set gstin = '27ABCDE1234F1Z9' where id = 1;
    get diagnostics n = row_count;
    insert into rt(step, result) values ('members cannot change the supplier settings', case when n = 0 then 'PASS' else 'FAIL' end);
  exception when others then insert into rt(step, result) values ('members cannot change the supplier settings', 'PASS');
  end;
  begin
    perform public.issue_invoice(p2);
    insert into rt(step, result) values ('members cannot issue invoices', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot issue invoices', 'PASS');
  end;
  begin
    perform public.claim_invoice_email((select id from public.invoices where payment_id = p2), true);
    insert into rt(step, result) values ('members cannot claim invoice emails', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot claim invoice emails', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- the email claim works once
  select public.claim_invoice_email((select id from public.invoices where payment_id = p2), false) into ok;
  insert into rt(step, result) values ('send-invoice claims an invoice once', case when ok and not public.claim_invoice_email((select id from public.invoices where payment_id = p2), false) then 'PASS' else 'FAIL' end);

  -- ===== clean up and restore =====
  delete from public.audit_log where entity in ('invoice', 'payment') and (entity_id in (select id from public.invoices where payment_id in (p0, p1, p2, p3)) or entity_id in (p0, p1, p2, p3));
  delete from public.invoices where payment_id in (p0, p1, p2, p3);
  delete from auth.users where id in (gj, mh, ae, adm);
  if fy0 is null then delete from public.invoice_counters where fy = fyk; else update public.invoice_counters set last_no = fy0 where fy = fyk; end if;
  update public.invoice_settings set legal_name = saved.legal_name, trade_name = saved.trade_name, gstin = saved.gstin, address = saved.address, city = saved.city,
    state = saved.state, postal_code = saved.postal_code, email = saved.email, sac_membership = saved.sac_membership, sac_fee = saved.sac_fee, lut_number = saved.lut_number where id = 1;
  select count(*) into n from public.payments where razorpay_order_id like 'order_invtest_%';
  insert into rt(step, result) values ('test data cleaned up, numbering and settings restored', case when n = 0 and not exists (select 1 from public.invoices where buyer->>'email' like 'inv-%@test.invalid')
    and coalesce((select last_no from public.invoice_counters where fy = fyk), -1) = coalesce(fy0, -1) then 'PASS' else 'FAIL' end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
