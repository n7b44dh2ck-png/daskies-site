-- DASKIES access-rule test. Creates 3 throwaway users, runs every rule as each of them and as an
-- anonymous visitor, records PASS/FAIL, then deletes everything it created. Staging only.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  ba uuid; bb uuid; la uuid; conv uuid; n int; st text; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@test.invalid', '{"full_name":"Seller A","phone":"+91 0000"}', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@test.invalid', '{"full_name":"Buyer B"}', now(), now()),
         (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-c@test.invalid', '{"full_name":"Admin C"}', now(), now());
  update public.profiles set is_admin = true where id = c;
  select count(*) into n from public.profiles where id in (a, b, c);
  insert into rt(step, result) values ('profiles created by sign-up trigger', case when n = 3 then 'PASS' else 'FAIL ' || n end);

  -- ===== as seller A =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title) values (a, gen_random_uuid(), 'offer', 'industrial', 'Packaging machinery', 'No business yet');
    insert into rt(step, result) values ('listing without business is blocked', 'FAIL');
  exception when others then insert into rt(step, result) values ('listing without business is blocked', 'PASS');
  end;
  insert into public.businesses (owner_id, name, city) values (a, 'Seller A Industries', 'Rajkot') returning id into ba;
  insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title, description, price, status)
    values (a, ba, 'offer', 'industrial', 'Packaging machinery', 'Form-fill-seal line', 'Test listing for access rules', 1400000, 'approved') returning id, status into la, st;
  insert into rt(step, result) values ('member cannot self-approve on insert', case when st = 'pending' then 'PASS' else 'FAIL ' || st end);
  update public.listings set status = 'approved' where id = la;
  select status into st from public.listings where id = la;
  insert into rt(step, result) values ('member cannot self-approve on update', case when st = 'pending' then 'PASS' else 'FAIL ' || st end);
  begin
    update public.businesses set verification_level = 5 where id = ba;
    insert into rt(step, result) values ('member cannot raise own verification level', 'FAIL');
  exception when others then insert into rt(step, result) values ('member cannot raise own verification level', 'PASS');
  end;
  begin
    update public.profiles set is_admin = true where id = a;
    insert into rt(step, result) values ('member cannot make self admin', 'FAIL');
  exception when others then insert into rt(step, result) values ('member cannot make self admin', 'PASS');
  end;
  begin
    perform public.admin_review_listing(la, 'approved', null);
    insert into rt(step, result) values ('member cannot call admin approve', 'FAIL');
  exception when others then insert into rt(step, result) values ('member cannot call admin approve', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- ===== anonymous visitor =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into n from public.listings where id = la;
  insert into rt(step, result) values ('visitor cannot see pending listing', case when n = 0 then 'PASS' else 'FAIL' end);
  begin
    select count(*) into n from public.profiles;
    insert into rt(step, result) values ('visitor cannot read profiles (emails, phones)', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  exception when others then insert into rt(step, result) values ('visitor cannot read profiles (emails, phones)', 'PASS (no access at all)');
  end;
  perform set_config('role', 'none', true);

  -- ===== buyer B =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.listings where id = la;
  insert into rt(step, result) values ('other member cannot see pending listing', case when n = 0 then 'PASS' else 'FAIL' end);
  begin
    perform public.start_enquiry(la, 'Hello');
    insert into rt(step, result) values ('cannot enquire on unapproved listing', 'FAIL');
  exception when others then insert into rt(step, result) values ('cannot enquire on unapproved listing', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- ===== admin C approves =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.listings where id = la;
  insert into rt(step, result) values ('admin sees pending listing', case when n = 1 then 'PASS' else 'FAIL' end);
  perform public.admin_review_listing(la, 'approved', null);
  select status into st from public.listings where id = la;
  insert into rt(step, result) values ('admin approval works', case when st = 'approved' then 'PASS' else 'FAIL ' || st end);
  select count(*) into n from public.audit_log where entity_id = la;
  insert into rt(step, result) values ('approval recorded in audit log', case when n >= 1 then 'PASS' else 'FAIL' end);
  perform set_config('role', 'none', true);

  -- ===== visitor sees approved =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into n from public.listings where id = la;
  insert into rt(step, result) values ('visitor sees approved listing', case when n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.listings where id = la and search @@ websearch_to_tsquery('simple', 'form-fill-seal packaging');
  insert into rt(step, result) values ('full-text search finds it', case when n = 1 then 'PASS' else 'FAIL' end);
  perform set_config('role', 'none', true);

  -- ===== buyer B enquires and messages =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.businesses (owner_id, name) values (b, 'Buyer B Traders') returning id into bb;
  conv := public.start_enquiry(la, 'Is the price negotiable?');
  insert into public.messages (conversation_id, sender_id, body) values (conv, b, 'Can I inspect next week?');
  select count(*) into n from public.messages where conversation_id = conv;
  insert into rt(step, result) values ('buyer enquiry and messages work', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  update public.listings set title = 'Hijacked' where id = la;
  select count(*) into n from public.listings where id = la and title = 'Hijacked';
  insert into rt(step, result) values ('member cannot edit someone else''s listing', case when n = 0 then 'PASS' else 'FAIL' end);
  begin
    insert into public.messages (conversation_id, sender_id, body) values (conv, a, 'Pretending to be A');
    insert into rt(step, result) values ('cannot send message as someone else', 'FAIL');
  exception when others then insert into rt(step, result) values ('cannot send message as someone else', 'PASS');
  end;
  select count(*) into n from public.conversation_people where conversation_id = conv and seller_business = 'Seller A Industries';
  insert into rt(step, result) values ('conversation shows business names', case when n = 1 then 'PASS' else 'FAIL' end);
  perform set_config('role', 'none', true);

  -- ===== seller A reads the enquiry; then A edits approved listing -> back to review =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.messages where conversation_id = conv;
  insert into rt(step, result) values ('seller sees buyer messages', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  update public.listings set price = 1300000 where id = la;
  select status into st from public.listings where id = la;
  insert into rt(step, result) values ('editing a live listing sends it back for review', case when st = 'pending' then 'PASS' else 'FAIL ' || st end);
  perform set_config('role', 'none', true);

  -- ===== admin C as an outsider to the chat? (admins may read for disputes) and a non-party =====
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.messages where conversation_id = conv;
  insert into rt(step, result) values ('stranger cannot read the conversation', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  -- cleanup: everything created above
  delete from auth.users where id in (a, b, c);
  delete from public.audit_log where entity_id = la;
  select count(*) into n from public.listings where id = la;
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL' end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
