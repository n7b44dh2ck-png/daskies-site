-- DASKIES deals test: offers, counteroffers, all-party approval, stages, access. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  la uuid; lb uuid; lc uuid; d uuid; d3 uuid; o uuid; r text; st text; n int; u uuid;
  usr uuid[]; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal-a@test.invalid','{"full_name":"A"}',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal-b@test.invalid','{"full_name":"B"}',now(),now()),
   (c,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal-c@test.invalid','{"full_name":"C"}',now(),now()),
   (x,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal-x@test.invalid','{"full_name":"X"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal-adm@test.invalid','{"full_name":"Adm"}',now(),now());
  update public.profiles set is_admin = true where id = adm;

  -- each of A, B, C gets a business and one listing (then admin approves)
  usr := array[a, b, c];
  for i in 1..3 loop
    u := usr[i];
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.businesses (owner_id, name) values (u, 'Deal test ' || i);
    update public.profiles set full_name = 'Test member', phone = '+91 98250 00000' where id = u;
    update public.businesses set roles = '{Seller}', city = coalesce(city, 'Rajkot'), state = 'Gujarat' where owner_id = u;
    insert into public.business_private (business_id, owner_id, address, postal_code) select id, u, '12 Test Industrial Estate', '360001' from public.businesses where owner_id = u;
    if to_regprocedure('public.accept_terms(text)') is not null then execute 'select public.accept_terms(public.current_terms_version())'; end if;
    insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title, price, wants_vertical)
      select u, id, 'offer', (array['industrial','commodity','storage'])[i], 'Test', 'Deal test listing ' || i, i * 100000, (array['commodity','storage','industrial'])[i]
      from public.businesses where owner_id = u;
    perform set_config('role', 'none', true);
  end loop;
  select id into la from public.listings where owner_id = a; select id into lb from public.listings where owner_id = b; select id into lc from public.listings where owner_id = c;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_review_listing(la, 'approved'); perform public.admin_review_listing(lb, 'approved'); perform public.admin_review_listing(lc, 'approved');
  perform set_config('role', 'none', true);

  -- ===== 2-party deal =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  d := public.create_deal('barter', 'A and B swap', array[la, lb]);
  select count(*) into n from public.deal_parties where deal_id = d;
  insert into rt(step, result) values ('2-party deal created with both parties', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.deals (kind, title, created_by) values ('sale', 'direct insert', a);
    insert into rt(step, result) values ('members cannot write deals directly', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot write deals directly', 'PASS');
  end;
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.deals where id = d;
  insert into rt(step, result) values ('outsider cannot see the deal', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.deal_party_view where deal_id = d;
  insert into rt(step, result) values ('outsider cannot see deal parties', case when n = 0 then 'PASS' else 'FAIL' end);
  begin
    perform public.make_offer(d, '{"price":1}');
    insert into rt(step, result) values ('outsider cannot make an offer', 'FAIL');
  exception when others then insert into rt(step, result) values ('outsider cannot make an offer', 'PASS');
  end;
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  o := public.make_offer(d, '{"cash_adjustment":100000,"notes":"B adds 1 lakh"}');
  select stage into st from public.deals where id = d;
  insert into rt(step, result) values ('first offer moves deal to offer stage', case when st = 'offer' then 'PASS' else 'FAIL ' || st end);
  select count(*) into n from public.deal_party_view where deal_id = d and business is not null;
  insert into rt(step, result) values ('party sees business names', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.approve_terms(d, o);
  insert into rt(step, result) values ('both approve -> terms agreed', case when r = 'terms_agreed' then 'PASS' else 'FAIL ' || r end);
  begin
    perform public.make_offer(d, '{"price":2}');
    insert into rt(step, result) values ('no new offers after terms agreed', 'FAIL');
  exception when others then insert into rt(step, result) values ('no new offers after terms agreed', 'PASS');
  end;
  for i in 1..5 loop st := public.advance_stage(d, null); end loop;
  insert into rt(step, result) values ('stages advance to delivery', case when st = 'delivery' then 'PASS' else 'FAIL ' || st end);
  r := public.confirm_completion(d);
  insert into rt(step, result) values ('one party confirming is not enough', case when r = 'waiting' then 'PASS' else 'FAIL ' || r end);
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.confirm_completion(d);
  insert into rt(step, result) values ('all confirm -> completed', case when r = 'completed' then 'PASS' else 'FAIL ' || r end);
  perform set_config('role', 'none', true);

  -- ===== 3-party barter chain =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  d3 := public.create_deal('multi_barter', 'A-B-C chain', array[la, lb, lc]);
  o := public.make_offer(d3, '{"notes":"values as listed"}');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.approve_terms(d3, o);
  insert into rt(step, result) values ('3-party: two approvals still waiting', case when r = 'waiting' then 'PASS' else 'FAIL ' || r end);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.reject_offer(d3, o, 'value too low');
  select count(*) into n from public.deal_parties where deal_id = d3 and approved;
  insert into rt(step, result) values ('rejection resets every approval', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  o := public.make_offer(d3, '{"notes":"C counter"}');
  select stage into st from public.deals where id = d3;
  insert into rt(step, result) values ('counteroffer stage', case when st = 'counteroffer' then 'PASS' else 'FAIL ' || st end);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.approve_terms(d3, o);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.approve_terms(d3, o);
  insert into rt(step, result) values ('3-party: all approve the counter -> terms agreed', case when r = 'terms_agreed' then 'PASS' else 'FAIL ' || r end);
  perform public.cancel_deal(d3, 'test');
  select stage into st from public.deals where id = d3;
  insert into rt(step, result) values ('a party can cancel', case when st = 'cancelled' then 'PASS' else 'FAIL ' || st end);
  select count(*) into n from public.deal_events where deal_id = d3;
  insert into rt(step, result) values ('every step recorded in deal history', case when n >= 7 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.deals where id in (d, d3);
  insert into rt(step, result) values ('admin can see deals (disputes)', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  delete from public.audit_log where entity_id in (la, lb, lc);
  if to_regclass('public.notifications') is not null then execute 'delete from public.notifications where body like ''Latest: Deal test listing %'''; end if;
  delete from auth.users where id in (a, b, c, x, adm);
  select count(*) into n from public.deals where id in (d, d3);
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
