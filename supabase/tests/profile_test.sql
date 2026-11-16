-- DASKIES mandatory details test: incomplete members are blocked, private details stay private. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  ba uuid; bb uuid; la uuid; cv uuid; n int; ok boolean; t text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','prof-a@test.invalid','{"full_name":"Asha Profile","phone":"+91 98250 11111"}',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','prof-b@test.invalid','{"full_name":"B"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','prof-adm@test.invalid','{"full_name":"Adm"}',now(),now());
  update public.profiles set is_admin = true where id = adm;

  -- A: name and phone from sign-up, business without address -> still incomplete
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.businesses (owner_id, name, roles, city, state, country) values (a, 'Profile test Alpha', '{Seller}', 'Rajkot', 'Gujarat', 'India') returning id into ba;
  ok := public.profile_complete();
  insert into rt(step, result) values ('business without address is incomplete', case when not ok then 'PASS' else 'FAIL' end);
  begin
    insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title) values (a, ba, 'offer', 'industrial', 'Test', 'Profile test listing');
    insert into rt(step, result) values ('incomplete member cannot post a listing', 'FAIL');
  exception when others then insert into rt(step, result) values ('incomplete member cannot post a listing', case when sqlerrm like 'Complete your profile first%' then 'PASS' else 'FAIL ' || sqlerrm end);
  end;
  begin
    insert into public.business_private (business_id, owner_id, address, postal_code) values (ba, a, 'short', '360001');
    insert into rt(step, result) values ('too-short address refused', 'FAIL');
  exception when others then insert into rt(step, result) values ('too-short address refused', 'PASS');
  end;
  begin
    insert into public.business_private (business_id, owner_id, address, postal_code, gstin) values (ba, a, '14 GIDC Estate, Aji Road', '360003', 'NOTAGSTIN');
    insert into rt(step, result) values ('malformed GSTIN refused', 'FAIL');
  exception when others then insert into rt(step, result) values ('malformed GSTIN refused', 'PASS');
  end;
  insert into public.business_private (business_id, owner_id, address, postal_code, gstin) values (ba, a, '  14 GIDC Estate, Aji Road  ', ' 360003 ', '24aaacb1234c1z5');
  select gstin into t from public.business_private where owner_id = a;
  insert into rt(step, result) values ('GSTIN stored upper-case and trimmed', case when t = '24AAACB1234C1Z5' then 'PASS' else 'FAIL ' || coalesce(t, 'null') end);
  if to_regprocedure('public.accept_terms(text)') is not null then
    ok := public.profile_complete();
    insert into rt(step, result) values ('details without accepting the Terms -> incomplete', case when not ok then 'PASS' else 'FAIL' end);
    begin
      execute 'select public.accept_terms(''1999-01-01'')';
      insert into rt(step, result) values ('accepting an old Terms version is refused', 'FAIL');
    exception when others then insert into rt(step, result) values ('accepting an old Terms version is refused', 'PASS');
    end;
    execute 'select public.accept_terms(public.current_terms_version())';
  end if;
  ok := public.profile_complete();
  insert into rt(step, result) values ('all details given -> complete', case when ok then 'PASS' else 'FAIL' end);
  insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title) values (a, ba, 'offer', 'industrial', 'Test', 'Profile test listing') returning id into la;
  insert into rt(step, result) values ('complete member can post a listing', case when la is not null then 'PASS' else 'FAIL' end);
  begin
    update public.businesses set address = 'Public address' where id = ba;
    insert into rt(step, result) values ('old public address column cannot be written', 'FAIL');
  exception when others then insert into rt(step, result) values ('old public address column cannot be written', 'PASS');
  end;
  begin
    insert into public.business_private (business_id, owner_id, address, postal_code) values (ba, a, 'Second address line here', '360004');
    insert into rt(step, result) values ('one private record per business', 'FAIL');
  exception when others then insert into rt(step, result) values ('one private record per business', 'PASS');
  end;
  perform set_config('role', 'none', true);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_review_listing(la, 'approved');
  select count(*) into n from public.admin_members() where user_id in (a, b) and (user_id <> a or (complete and address = '14 GIDC Estate, Aji Road' and postal_code = '360003'));
  insert into rt(step, result) values ('admin sees full details and completeness', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.business_private where owner_id = a;
  insert into rt(step, result) values ('admin can read private details', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  -- B: name too short, no phone, no business -> blocked everywhere
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.business_private;
  insert into rt(step, result) values ('another member cannot read private details', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  ok := public.profile_complete(a);
  insert into rt(step, result) values ('a member cannot check someone else''s completeness', case when ok is null then 'PASS' else 'FAIL' end);
  begin
    perform public.admin_members();
    insert into rt(step, result) values ('members cannot list members', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot list members', 'PASS');
  end;
  begin
    cv := public.start_enquiry(la, 'Interested');
    insert into rt(step, result) values ('incomplete member cannot send an enquiry', 'FAIL');
  exception when others then insert into rt(step, result) values ('incomplete member cannot send an enquiry', 'PASS');
  end;
  begin
    perform public.create_deal('sale', 'Profile test deal', array[la]);
    insert into rt(step, result) values ('incomplete member cannot start a deal', 'FAIL');
  exception when others then insert into rt(step, result) values ('incomplete member cannot start a deal', 'PASS');
  end;
  -- B completes step by step
  update public.profiles set full_name = 'Bhavin Buyer', phone = '98250 22222' where id = b;
  insert into public.businesses (owner_id, name, roles, city, state, country) values (b, 'Profile test Bharat', '{Buyer}', 'Surat', 'Gujarat', 'India') returning id into bb;
  insert into public.business_private (business_id, owner_id, address, postal_code) values (bb, b, 'Plot 7, Sachin GIDC', '394230');
  if to_regprocedure('public.accept_terms(text)') is not null then execute 'select public.accept_terms(public.current_terms_version())'; end if;
  ok := public.profile_complete();
  insert into rt(step, result) values ('10-digit mobile without country code accepted', case when ok then 'PASS' else 'FAIL' end);
  cv := public.start_enquiry(la, 'Interested');
  insert into rt(step, result) values ('complete member can send an enquiry', case when cv is not null then 'PASS' else 'FAIL' end);
  update public.profiles set phone = '12345' where id = b;
  begin
    insert into public.messages (conversation_id, sender_id, body) values (cv, b, 'Still there?');
    insert into rt(step, result) values ('removing the mobile number blocks messages again', 'FAIL');
  exception when others then insert into rt(step, result) values ('removing the mobile number blocks messages again', 'PASS');
  end;
  perform set_config('role', 'none', true);

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    select count(*) into n from public.business_private;
    insert into rt(step, result) values ('visitors cannot read private details', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  exception when others then insert into rt(step, result) values ('visitors cannot read private details', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- clean up
  delete from public.audit_log where entity_id in (la, ba, bb);
  if to_regclass('public.notifications') is not null then execute 'delete from public.notifications where body like ''Latest: Profile test%'''; end if;
  delete from auth.users where id in (a, b, adm);
  select count(*) into n from public.business_private where owner_id in (a, b);
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
