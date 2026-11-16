-- DASKIES alerts test: who gets told what, grouping, privacy, mark-read. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  la uuid; ba uuid; bb uuid; cv uuid; d uuid; o uuid; doc uuid; n int; t text; lk text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alert-a@test.invalid','{"full_name":"A"}',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alert-b@test.invalid','{"full_name":"B"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alert-adm@test.invalid','{"full_name":"Adm"}',now(),now());
  update public.profiles set is_admin = true where id = adm;

  -- A and B set up businesses; A posts a listing
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.businesses (owner_id, name) values (a, 'Alert test Alpha') returning id into ba;
    update public.profiles set full_name = 'Test member', phone = '+91 98250 00000' where id = a;
    update public.businesses set roles = '{Seller}', city = coalesce(city, 'Rajkot'), state = 'Gujarat' where owner_id = a;
    insert into public.business_private (business_id, owner_id, address, postal_code) select id, a, '12 Test Industrial Estate', '360001' from public.businesses where owner_id = a;
  insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title, price)
    values (a, ba, 'offer', 'industrial', 'Test', 'Alert test listing', 100000) returning id into la;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.businesses (owner_id, name) values (b, 'Alert test Bharat') returning id into bb;
    update public.profiles set full_name = 'Test member', phone = '+91 98250 00000' where id = b;
    update public.businesses set roles = '{Seller}', city = coalesce(city, 'Rajkot'), state = 'Gujarat' where owner_id = b;
    insert into public.business_private (business_id, owner_id, address, postal_code) select id, b, '12 Test Industrial Estate', '360001' from public.businesses where owner_id = b;
  perform set_config('role', 'none', true);

  select title, link into t, lk from public.notifications where user_id = adm and group_key = 'queue' and read_at is null;
  insert into rt(step, result) values ('admin told a listing waits for review', case when t like '%waiting for review' and lk = 'admin.html#queue' then 'PASS' else 'FAIL ' || coalesce(t, 'none') end);

  -- admin approves -> owner told
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_review_listing(la, 'approved');
  perform public.admin_set_verification(ba, 3);
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = a and kind = 'listing' and title like 'Your listing is live%' and link = 'listing.html?id=' || la;
  insert into rt(step, result) values ('owner told listing is live', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.notifications where user_id = a and kind = 'verification' and title like '%level 3';
  insert into rt(step, result) values ('owner told about new verification level', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- B enquires, sends 3 messages -> A has one grouped unread alert
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  cv := public.start_enquiry(la, 'Is the machine still available?');
  insert into public.messages (conversation_id, sender_id, body) values (cv, b, 'Can I visit on Monday?');
  insert into public.messages (conversation_id, sender_id, body) values (cv, b, 'Also need the invoice copy.');
  perform set_config('role', 'none', true);
  select count(*), max(body) into n, t from public.notifications where user_id = a and kind = 'message' and read_at is null;
  insert into rt(step, result) values ('3 messages make 1 unread alert for the seller', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  insert into rt(step, result) values ('alert shows the latest message', case when t = 'Also need the invoice copy.' then 'PASS' else 'FAIL ' || coalesce(t, 'none') end);
  select count(*) into n from public.notifications where user_id = b and kind = 'message';
  insert into rt(step, result) values ('sender is not alerted about own messages', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.notifications where user_id = a and kind = 'message' and title like 'Alert test Bharat sent a message about Alert test listing' and link = 'dashboard.html?c=' || cv || '#messages';
  insert into rt(step, result) values ('message alert names sender and listing, links to thread', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- privacy and write protection
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.notifications where user_id = a;
  insert into rt(step, result) values ('a member cannot read another member''s alerts', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.notifications (user_id, kind, title, link) values (a, 'message', 'fake', 'index.html');
    insert into rt(step, result) values ('members cannot create alerts', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot create alerts', 'PASS');
  end;
  begin
    perform public.notify(a, 'message', 'fake', null, 'index.html', null);
    insert into rt(step, result) values ('members cannot call the internal notify function', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot call the internal notify function', 'PASS');
  end;
  begin
    update public.notifications set read_at = now() where user_id = b;
    insert into rt(step, result) values ('members cannot update alerts directly', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot update alerts directly', 'PASS');
  end;
  n := public.mark_notifications_read(null);
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = a and read_at is null;
  insert into rt(step, result) values ('mark-read by B leaves A''s alerts unread', case when n >= 2 then 'PASS' else 'FAIL ' || n end);

  -- deal: B opens a deal and offers -> A gets one grouped deal alert; A marks one read
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  d := public.create_deal('sale', 'Alert test deal', array[la]);
  o := public.make_offer(d, '{"price":90000}');
  perform set_config('role', 'none', true);
  select count(*), max(title) into n, t from public.notifications where user_id = a and kind = 'deal' and read_at is null;
  insert into rt(step, result) values ('deal open + offer make 1 unread deal alert', case when n = 1 and t = 'Alert test Bharat sent an offer' then 'PASS' else 'FAIL ' || n || ' ' || coalesce(t, '') end);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.approve_terms(d, o);
  n := public.mark_notifications_read(array(select id from public.notifications where user_id = a and kind = 'deal'));
  insert into rt(step, result) values ('member marks chosen alerts read', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = b and kind = 'deal' and title = 'Every party approved. Terms agreed' and link = 'deal.html?id=' || d;
  insert into rt(step, result) values ('other party told terms are agreed', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.notifications where user_id = a and kind = 'message' and read_at is null;
  insert into rt(step, result) values ('marking deal alerts leaves message alert unread', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- documents and reports
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.documents (owner_id, business_id, kind, path, file_name) values (a, ba, 'gst', a || '/alert-test.pdf', 'alert-test.pdf') returning id into doc;
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = adm and group_key = 'docs' and read_at is null;
  insert into rt(step, result) values ('admin told a document waits for review', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_review_document(doc, 'rejected');
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = a and kind = 'document' and title like '%not accepted%';
  insert into rt(step, result) values ('owner told document was not accepted', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.reports (reporter_id, listing_id, reason) values (b, la, 'Alert test report reason');
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = adm and group_key = 'reports' and link = 'admin.html#reports';
  insert into rt(step, result) values ('admin told about a new report', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.notifications where user_id in (a, b) and kind = 'review';
  insert into rt(step, result) values ('members never get admin review alerts', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- owner edits a live listing -> back to review -> admin alerted again, owner not alerted
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.listings set description = 'Edited' where id = la;
  perform set_config('role', 'none', true);
  select count(*) into n from public.notifications where user_id = adm and group_key = 'queue' and read_at is null;
  insert into rt(step, result) values ('edited listing re-alerts admin (still one grouped alert)', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- clean up
  delete from public.deals where id = d;
  delete from public.audit_log where entity_id in (la, ba, doc);
  delete from public.notifications where body like '%Alert test%' or body like '%alert-test%';
  delete from auth.users where id in (a, b, adm);
  select count(*) into n from public.notifications where user_id in (a, b, adm) or body like '%Alert test%' or body like '%alert-test%';
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
