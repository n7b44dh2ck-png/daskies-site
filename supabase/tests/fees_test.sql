-- DASKIES fees test: fees appear only when the contract is signed, privately per party; payment/settlement waits for fees. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  la uuid; lb uuid; d uuid; d2 uuid; d3 uuid; o uuid; n int; st text; fa uuid; fb uuid; v numeric; u uuid; usr uuid[]; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fee-a@test.invalid','{"full_name":"Fee A"}',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fee-b@test.invalid','{"full_name":"Fee B"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fee-adm@test.invalid','{"full_name":"Fee Admin"}',now(),now());
  update public.profiles set is_admin = true where id = adm;

  usr := array[a, b];
  for i in 1..2 loop
    u := usr[i];
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    update public.profiles set phone = '+91 98250 0000' || i where id = u;
    insert into public.businesses (owner_id, name, roles, city, state, country) values (u, 'Fee test ' || i, '{Seller}', 'Rajkot', 'Gujarat', 'India');
    insert into public.business_private (business_id, owner_id, address, postal_code) select id, u, '12 Test Industrial Estate', '360001' from public.businesses where owner_id = u;
    perform public.accept_terms(public.current_terms_version());
    insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title, price)
      select u, id, 'offer', 'industrial', 'Test', 'Fee test listing ' || i, i * 1000000 from public.businesses where owner_id = u;
    perform set_config('role', 'none', true);
  end loop;
  select id into la from public.listings where owner_id = a; select id into lb from public.listings where owner_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_review_listing(la, 'approved'); perform public.admin_review_listing(lb, 'approved');
  perform set_config('role', 'none', true);

  -- ===== sale: B buys A's machine for 10 lakh =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  d := public.create_deal('sale', 'Fee test sale', array[la]);
  o := public.make_offer(d, '{"price":1000000}');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.approve_terms(d, o);
  perform public.advance_stage(d, null); perform public.advance_stage(d, null); -- due diligence, documentation
  select count(*) into n from public.deal_fees where deal_id = d;
  insert into rt(step, result) values ('no fee exists before the contract is signed', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  st := public.advance_stage(d, 'Contract signed');
  select count(*) into n from public.deal_fees where deal_id = d;
  insert into rt(step, result) values ('on contract signed a party sees only their own fee', case when st = 'contract_signed' and n = 1 then 'PASS' else 'FAIL ' || st || ' ' || n end);
  select fee into v from public.deal_fees where deal_id = d and user_id = a;
  insert into rt(step, result) values ('fee is 5% of the agreed price', case when v = 50000 then 'PASS' else 'FAIL ' || v end);
  select gst into v from public.deal_fees where deal_id = d and user_id = a;
  insert into rt(step, result) values ('GST is 18% of the fee', case when v = 9000 then 'PASS' else 'FAIL ' || v end);
  begin
    perform public.advance_stage(d, null);
    insert into rt(step, result) values ('payment and settlement wait until fees are paid', 'FAIL');
  exception when others then insert into rt(step, result) values ('payment and settlement wait until fees are paid', case when sqlerrm like 'Payment and settlement open once%' then 'PASS' else 'FAIL ' || sqlerrm end);
  end;
  begin
    update public.deal_fees set status = 'paid' where deal_id = d;
    insert into rt(step, result) values ('members cannot mark their own fee paid', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot mark their own fee paid', 'PASS');
  end;
  begin
    perform public.admin_update_fee((select id from public.deal_fees where deal_id = d and user_id = a), 'paid', null, null, null, 'x');
    insert into rt(step, result) values ('members cannot use admin fee actions', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot use admin fee actions', 'PASS');
  end;
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id in (a, b) and group_key = 'fee:' || d;
  insert into rt(step, result) values ('both parties alerted about their fee', case when n = 2 then 'PASS' else 'FAIL ' || n end);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.admin_fees() where deal_id = d;
  insert into rt(step, result) values ('admin sees every party''s fee', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  select id into fa from public.deal_fees where deal_id = d and user_id = a;
  select id into fb from public.deal_fees where deal_id = d and user_id = b;
  perform public.admin_update_fee(fa, 'paid', null, null, null, 'UPI ref 1234');
  perform public.admin_update_fee(fb, null, 800000, 4, 'Valuation report value; agreed rate', null);
  select fee into v from public.deal_fees where id = fb;
  insert into rt(step, result) values ('admin can set value and rate (4% of 8 lakh)', case when v = 32000 then 'PASS' else 'FAIL ' || v end);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.advance_stage(d, null);
    insert into rt(step, result) values ('one unpaid fee still blocks payment and settlement', 'FAIL');
  exception when others then insert into rt(step, result) values ('one unpaid fee still blocks payment and settlement', 'PASS');
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_update_fee(fb, 'waived', null, null, 'Founding member', null);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  st := public.advance_stage(d, null);
  insert into rt(step, result) values ('paid and waived fees open payment and settlement', case when st = 'settlement' then 'PASS' else 'FAIL ' || st end);
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = a and title = 'DASKIES received your success fee';
  insert into rt(step, result) values ('member told when payment is received', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- ===== swap: each party pays on the agreed value of what they give =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  d2 := public.create_deal('barter', 'Fee test swap', array[la, lb]);
  o := public.make_offer(d2, json_build_object('values', json_build_object(a::text, 4500000, b::text, 3600000), 'cash_adjustment', 900000)::jsonb);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.approve_terms(d2, o);
  for i in 1..3 loop perform public.advance_stage(d2, null); end loop;
  select fee into v from public.deal_fees where deal_id = d2;
  insert into rt(step, result) values ('swap: B''s fee is 5% of what B gives (36 lakh)', case when v = 180000 then 'PASS' else 'FAIL ' || v end);
  perform public.cancel_deal(d2, 'Changed plans');
  perform set_config('role', 'none', true);
  select count(*) into n from public.deal_fees where deal_id = d2 and status = 'cancelled';
  insert into rt(step, result) values ('cancelling a deal cancels its open fees', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  select fee into v from public.deal_fees where deal_id = d2 and user_id = a;
  insert into rt(step, result) values ('swap: A''s fee is 5% of what A gives (45 lakh)', case when v = 225000 then 'PASS' else 'FAIL ' || v end);

  -- ===== above Rs 1 crore: note about agreeing the rate =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  d3 := public.create_deal('sale', 'Fee test large', array[la]);
  o := public.make_offer(d3, '{"price":25000000}');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.approve_terms(d3, o);
  for i in 1..3 loop perform public.advance_stage(d3, null); end loop;
  select count(*) into n from public.deal_fees where deal_id = d3 and note like 'Deals above Rs 1 crore%';
  insert into rt(step, result) values ('large deal fee notes the rate is open to agreement', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  -- visitors and outsiders see nothing
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    select count(*) into n from public.deal_fees;
    insert into rt(step, result) values ('visitors cannot read fees', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  exception when others then insert into rt(step, result) values ('visitors cannot read fees', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- clean up
  delete from public.deals where id in (d, d2, d3);
  delete from public.audit_log where entity_id in (la, lb, fa, fb) or (entity = 'business' and entity_id in (select id from public.businesses where owner_id in (a, b)));
  delete from public.notifications where body like 'Latest: Fee test%';
  delete from auth.users where id in (a, b, adm);
  select count(*) into n from public.deal_fees where user_id in (a, b);
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
