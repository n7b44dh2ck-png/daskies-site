-- DASKIES listings for owners test: only admins post on an owner's behalf and see the owner's details;
-- members can't mark their own listings as managed; hand-over moves the listing, photos and alerts the owner. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  owner uuid := gen_random_uuid(); other uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  ab uuid; l uuid; lo uuid; n int; mg boolean; who uuid; u uuid; usr uuid[]; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgd-owner@test.invalid','{"full_name":"Managed Owner"}',now(),now()),
   (other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgd-other@test.invalid','{"full_name":"Managed Other"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgd-adm@test.invalid','{"full_name":"Managed Admin"}',now(),now());
  update public.profiles set is_admin = true where id = adm;
  insert into public.businesses (owner_id, name, roles, city, state, country) values (adm, 'DASKIES test desk', '{Seller}', 'Ahmedabad', 'Gujarat', 'India') returning id into ab;

  usr := array[owner, other];
  for i in 1..2 loop
    u := usr[i];
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    update public.profiles set phone = '+91 98250 1000' || i where id = u;
    insert into public.businesses (owner_id, name, roles, city, state, country) values (u, 'Managed test ' || i, '{Seller}', 'Rajkot', 'Gujarat', 'India');
    insert into public.business_private (business_id, owner_id, address, postal_code) select id, u, '12 Test Industrial Estate', '360001' from public.businesses where owner_id = u;
    perform public.accept_terms(public.current_terms_version());
    perform set_config('role', 'none', true);
  end loop;

  -- ===== an admin lists for an owner =====
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title, price, managed, status, approved_at)
    values (adm, ab, 'offer', 'industrial', 'CNC machines', 'Managed test: VMC for the owner', 4500000, true, 'approved', now()) returning id into l;
  insert into public.managed_owners (listing_id, owner_name, contact_name, phone, email, consent)
    values (l, 'Owner Engineering Works', 'Ramesh', '+91 98250 99999', 'mgd-owner@test.invalid', 'WhatsApp from Ramesh, test');
  select managed into mg from public.listings where id = l;
  insert into rt(step, result) values ('an admin can post a listing for an owner', case when mg then 'PASS' else 'FAIL' end);
  select count(*) into n from public.managed_owners where listing_id = l;
  insert into rt(step, result) values ('an admin sees the owner''s details', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  -- ===== members =====
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.listings where id = l and managed;
  insert into rt(step, result) values ('members see the live listing, marked as listed by DASKIES', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.managed_owners;
  insert into rt(step, result) values ('members cannot see owners'' details', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.managed_owners (listing_id, owner_name, consent) values (l, 'Fake owner', 'none');
    insert into rt(step, result) values ('members cannot add owner details', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot add owner details', 'PASS');
  end;
  insert into public.listings (owner_id, business_id, kind, vertical, subcategory, title, managed)
    select other, id, 'offer', 'industrial', 'Test', 'Managed test: member listing', true from public.businesses where owner_id = other returning id into lo;
  select managed into mg from public.listings where id = lo;
  insert into rt(step, result) values ('a member cannot mark a new listing as managed', case when not mg then 'PASS' else 'FAIL' end);
  update public.listings set managed = true where id = lo;
  select managed into mg from public.listings where id = lo;
  insert into rt(step, result) values ('a member cannot mark an existing listing as managed', case when not mg then 'PASS' else 'FAIL' end);
  begin
    perform public.admin_handover_listing(l, 'mgd-other@test.invalid');
    insert into rt(step, result) values ('a member cannot take over a managed listing', 'FAIL');
  exception when others then insert into rt(step, result) values ('a member cannot take over a managed listing', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- ===== visitors =====
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.managed_owners;
    insert into rt(step, result) values ('visitors cannot see owners'' details', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  exception when others then insert into rt(step, result) values ('visitors cannot see owners'' details', 'PASS');
  end;
  perform set_config('role', 'none', true);

  -- ===== hand-over =====
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.admin_handover_listing(l, 'nobody-here@test.invalid');
    insert into rt(step, result) values ('hand-over needs the owner to have joined', 'FAIL');
  exception when others then insert into rt(step, result) values ('hand-over needs the owner to have joined', 'PASS');
  end;
  begin
    perform public.admin_handover_listing(lo, 'mgd-owner@test.invalid');
    insert into rt(step, result) values ('only managed listings can be handed over', 'FAIL');
  exception when others then insert into rt(step, result) values ('only managed listings can be handed over', 'PASS');
  end;
  insert into public.listing_photos (listing_id, owner_id, path, sort) values (l, adm, adm::text || '/' || l::text || '/test.jpg', 0);
  who := public.admin_handover_listing(l, 'MGD-Owner@test.invalid');
  perform set_config('role', 'none', true);
  insert into rt(step, result) values ('hand-over moves the listing to the owner',
    case when who = owner and exists (select 1 from public.listings x join public.businesses b on b.id = x.business_id where x.id = l and x.owner_id = owner and b.owner_id = owner and not x.managed) then 'PASS' else 'FAIL' end);
  insert into rt(step, result) values ('hand-over moves the photos too', case when (select owner_id from public.listing_photos where listing_id = l) = owner then 'PASS' else 'FAIL' end);
  insert into rt(step, result) values ('hand-over removes the private owner details', case when not exists (select 1 from public.managed_owners where listing_id = l) then 'PASS' else 'FAIL' end);
  insert into rt(step, result) values ('the owner gets an alert', case when exists (select 1 from public.notifications where user_id = owner and link = 'listing.html?id=' || l::text) then 'PASS' else 'FAIL' end);

  -- clean up
  delete from public.audit_log where entity = 'listing' and entity_id in (l, lo);
  delete from auth.users where id in (owner, other, adm);
  select count(*) into n from public.listings where title like 'Managed test:%';
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
