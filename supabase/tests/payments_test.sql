-- DASKIES payments test: only the server can record or apply payments; applying is safe to repeat;
-- membership adds 90 days; a paid success fee clears the fee. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  d uuid; f uuid; n int; r text; t1 timestamptz; t2 timestamptz; st text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-a@test.invalid','{"full_name":"Pay A"}',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-b@test.invalid','{"full_name":"Pay B"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-adm@test.invalid','{"full_name":"Pay Admin"}',now(),now());
  update public.profiles set is_admin = true where id = adm;

  -- the server records an order (what pay-order does)
  perform set_config('request.jwt.claims', '', true);
  insert into public.payments (user_id, kind, amount_paise, description, razorpay_order_id)
    values (a, 'membership', 1770000, 'Full membership, 90 days', 'order_test_m1');

  -- ===== what a member can and can't do =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.payments;
  insert into rt(step, result) values ('a member sees their own payment', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.payments (user_id, kind, amount_paise, razorpay_order_id) values (a, 'membership', 100, 'order_fake');
    insert into rt(step, result) values ('a member cannot create a payment record', 'FAIL');
  exception when others then insert into rt(step, result) values ('a member cannot create a payment record', 'PASS');
  end;
  begin
    update public.payments set status = 'paid' where razorpay_order_id = 'order_test_m1';
    get diagnostics n = row_count;
    insert into rt(step, result) values ('a member cannot mark a payment paid', case when n = 0 then 'PASS' else 'FAIL' end);
  exception when others then insert into rt(step, result) values ('a member cannot mark a payment paid', 'PASS');
  end;
  begin
    update public.profiles set member_until = now() + interval '10 years' where id = a;
    insert into rt(step, result) values ('a member cannot give themselves membership', 'FAIL');
  exception when others then insert into rt(step, result) values ('a member cannot give themselves membership', 'PASS');
  end;
  begin
    perform public.apply_payment('order_test_m1', 'pay_fake');
    insert into rt(step, result) values ('a member cannot apply a payment', 'FAIL');
  exception when others then insert into rt(step, result) values ('a member cannot apply a payment', 'PASS');
  end;
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.payments where user_id = a;
  insert into rt(step, result) values ('another member cannot see it', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  begin
    perform public.admin_payments();
    insert into rt(step, result) values ('only admins list all payments', 'FAIL');
  exception when others then insert into rt(step, result) values ('only admins list all payments', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- ===== the server applies it =====
  perform set_config('request.jwt.claims', '', true);
  r := public.apply_payment('order_test_m1', 'pay_test_1');
  select member_until into t1 from public.profiles where id = a;
  insert into rt(step, result) values ('membership paid: 90 days from today', case when r = 'paid' and t1 between now() + interval '89 days' and now() + interval '91 days' then 'PASS' else 'FAIL ' || r || ' ' || coalesce(t1::text, 'null') end);
  r := public.apply_payment('order_test_m1', 'pay_test_1');
  select member_until into t2 from public.profiles where id = a;
  insert into rt(step, result) values ('applying the same payment twice changes nothing', case when r = 'already' and t2 = t1 then 'PASS' else 'FAIL ' || r end);
  select count(*) into n from public.notifications where user_id = a and kind = 'payment';
  insert into rt(step, result) values ('member gets a payment alert', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  insert into public.payments (user_id, kind, amount_paise, razorpay_order_id) values (a, 'membership', 1770000, 'order_test_m2');
  perform public.apply_payment('order_test_m2', 'pay_test_2');
  select member_until into t2 from public.profiles where id = a;
  insert into rt(step, result) values ('renewing early adds 90 days to the current end date', case when t2 between t1 + interval '89 days' and t1 + interval '91 days' then 'PASS' else 'FAIL ' || t2 end);
  r := public.apply_payment('order_unknown', 'pay_x');
  insert into rt(step, result) values ('an unknown order is ignored', case when r = 'unknown' then 'PASS' else 'FAIL ' || r end);
  insert into public.payments (user_id, kind, amount_paise, razorpay_order_id) values (a, 'membership', 1770000, 'order_test_m3');
  perform public.payment_failed('order_test_m3');
  select status into st from public.payments where razorpay_order_id = 'order_test_m3';
  insert into rt(step, result) values ('a failed payment is recorded as failed', case when st = 'failed' then 'PASS' else 'FAIL ' || st end);

  -- ===== success fee =====
  insert into public.deals (kind, title, created_by, stage) values ('sale', 'Pay test deal', a, 'enquiry') returning id into d;
  insert into public.deal_fees (deal_id, user_id, basis) values (d, a, 1000000) returning id into f;
  insert into public.payments (user_id, kind, ref_id, amount_paise, razorpay_order_id) values (a, 'fee', f, 5900000, 'order_test_f1');
  r := public.apply_payment('order_test_f1', 'pay_test_f1');
  select status into st from public.deal_fees where id = f;
  insert into rt(step, result) values ('a paid success fee is marked paid with the payment reference', case when r = 'paid' and st = 'paid' and (select paid_ref from public.deal_fees where id = f) = 'razorpay pay_test_f1' then 'PASS' else 'FAIL ' || r || ' ' || st end);

  -- ===== admin view =====
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.admin_payments() where razorpay_order_id like 'order_test_%';
  insert into rt(step, result) values ('admins see every payment', case when n = 4 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  -- ===== visitors =====
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.payments;
    insert into rt(step, result) values ('visitors cannot read payments', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  exception when others then insert into rt(step, result) values ('visitors cannot read payments', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- clean up
  delete from public.deals where id = d;
  delete from public.audit_log where entity = 'payment' and entity_id in (select id from public.payments where user_id in (a, b));
  delete from auth.users where id in (a, b, adm);
  select count(*) into n from public.payments where razorpay_order_id like 'order_test_%';
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
